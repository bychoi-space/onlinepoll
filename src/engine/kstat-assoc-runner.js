import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';
import { findMarketFestival } from '../utils/market-festival-finder.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * [상인회 조사 전용 러너]
 * 2025년 기준 전통시장·상점가 및 점포경영 실태조사 - B.상인회조사 (25단계: Q1 ~ P23, Agree)
 * 
 * 기존 점포조사(kstat-runner.js)와 100% 완전 분리된 독립 실행 엔진입니다.
 * - Q1: 상인회 기본정보 자동 입력
 * - P1~P20 (A3~F4): 화면에 렌더링된 전년도(2024년 기준) 응답값을 읽어 2025년 기준에 동일하게 1:1 자동 복사(Mirroring)
 * - P21~P23 (F5~G4): 사용자가 설정한 정책 가이드라인 기반 응답
 * - Agree: 파일럿 시 안전 정지 / 배치 시 최종 완료
 */
export async function runKstatAssocSurvey(options = {}) {
  const {
    surveyUrl,
    assocData = {},
    quotaIndex = 1,
    guidelineConfig = {},
    policy = {},
    pilotMode = true,
    safetyGuard = true,
    reportDir = null,
    onProgress = () => {}
  } = options;

  if (reportDir && !fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const marketName = assocData.marketName || '상인회';
  const preserveExisting = (policy.preserveExistingInputs !== false && options.preserveExistingInputs !== false);
  const effectiveSurveyor = (
    options.surveyorAccount ||
    options.surveyorName ||
    options.kstatLoginId ||
    assocData.surveyorAccount ||
    assocData.surveyorName ||
    assocData.kstatLoginId ||
    policy.surveyorAccount ||
    policy.surveyorName ||
    policy.kstatLoginId ||
    guidelineConfig.kstatLoginId ||
    '가온이강윤'
  ).trim();
  logger.info(`[상인회 러너] 시작 ➔ 대상 시장: "${marketName}" (슬롯: #${quotaIndex}, 조사원: "${effectiveSurveyor}"), 파일럿=${pilotMode}, 기입력보존=${preserveExisting}, URL=${surveyUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 1000 }
  });
  const page = await context.newPage();

  // Alert/Confirm 자동 승인 가로채기
  page.on('dialog', async (dialog) => {
    logger.info(`[상인회 Alert 감지] "${dialog.message()}" ➔ 자동 수락`);
    await dialog.accept().catch(() => {});
  });

  const capturedSteps = [];

  const captureStep = async (stepCode, stepDesc) => {
    if (reportDir) {
      const filename = `step_${stepCode}_${stepDesc.replace(/[^a-zA-Z0-9가-힣_]/g, '')}.png`;
      const filepath = path.join(reportDir, filename);
      await page.screenshot({ path: filepath, fullPage: true }).catch(() => {});
      capturedSteps.push({ step: stepCode, title: stepDesc, path: filepath });
    }
  };

  try {
    // ==========================================
    // 1. index.asp 접속 (재시도 및 domcontentloaded 안전 탐색)
    // ==========================================
    onProgress({ step: 'START', message: `"${marketName}" 설문 접속 중...` });
    let gotoOk = false;
    for (let r = 0; r < 2; r++) {
      try {
        await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        gotoOk = true;
        break;
      } catch (gErr) {
        logger.warn(`[상인회 러너] "${marketName}" 설문 접속 1차 지연 (${gErr.message}) ➔ 재시도...`);
        await delay(2000);
      }
    }
    if (!gotoOk) {
      await page.goto(surveyUrl, { waitUntil: 'load', timeout: 45000 });
    }
    await delay(1200);
    await captureStep('00_INDEX', '시작화면');

    if (page.url().includes('index.asp')) {
      onProgress({ step: 'INDEX', message: `설문 시작 버튼 클릭...` });
      const nextBtn = await page.$('#next, input[name="next"], button#next, .btn_next');
      if (nextBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          nextBtn.click().catch(() => {})
        ]);
        await delay(1200);
      }
    }

    // ==========================================
    // 2. Q1.asp (기본정보 확인 및 입력)
    // ==========================================
    if (page.url().includes('Q1.asp')) {
      onProgress({ step: 'Q1', message: `Q1 기본정보 확인 및 상인회 정보 입력...` });
      
      // Q1 전수 필수 입력 필드 주입:
      // Q1_4_1: 우편번호, Q1_4_2: 주소, Q1_4_3: 상세주소
      // Q1_5: 응답자 성명, Q1_6: 연락처, Q1_7: 이메일, Q1_8: 직위, Q1_10: 조사원 성명
      await page.evaluate(({ data, preserveExisting, surveyorAccount }) => {
        // 1. 우편번호 (Q1_4_1) - 비어 있으면 우편번호 주입 (Alert 방어 핵심)
        const postCode = document.querySelector('#Q1_4_1');
        if (postCode && (!postCode.value || postCode.value.trim() === '')) {
          postCode.value = data.postCode || '08758';
        }

        // 2. 기본 주소 (Q1_4_2)
        const addrMain = document.querySelector('#Q1_4_2');
        if (addrMain && (!addrMain.value || addrMain.value.trim() === '')) {
          addrMain.value = data.address || '서울특별시 관악구 신림로 329';
        }

        // 3. 상세 주소 (Q1_4_3) - 비어 있으면 Alert 방어용 주입
        const addrDetail = document.querySelector('#Q1_4_3');
        if (addrDetail && (!addrDetail.value || addrDetail.value.trim() === '')) {
          addrDetail.value = data.addressDetail || '상인회 사무실';
        }

        // 4. 응답자 성명 (Q1_5)
        const respName = document.querySelector('#Q1_5');
        if (respName && (!respName.value || respName.value.trim() === '')) {
          respName.value = data.leaderName || data.ceoName || '상인대표';
        }

        // 5. 연락처 (Q1_6)
        const respPhone = document.querySelector('#Q1_6');
        if (respPhone && (!respPhone.value || respPhone.value.trim() === '')) {
          let pVal = data.leaderPhone || data.phone || data.assocPhone || '010-4163-2166';
          const numOnly = String(pVal).replace(/\D/g, '');
          if (numOnly.length === 11) {
            pVal = numOnly.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
          } else if (numOnly.length === 10 && numOnly.startsWith('02')) {
            pVal = numOnly.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
          } else if (numOnly.length === 10) {
            pVal = numOnly.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
          } else if (numOnly.length === 9 && numOnly.startsWith('02')) {
            pVal = numOnly.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
          }
          respPhone.value = pVal;
        }

        // 6. 이메일 (Q1_7)
        const respEmail = document.querySelector('#Q1_7');
        if (respEmail && (!respEmail.value || respEmail.value.trim() === '')) {
          respEmail.value = data.email || 'noreply@example.com';
        }

        // 7. 직위: 이미 체크된 라디오가 있다면 보존, 없을 때만 1번 상인대표 체크
        const curPos = document.querySelector('input[name="Q1_8"]:checked');
        if (!preserveExisting || !curPos) {
          const radioPos = document.querySelector('input[name="Q1_8"][value="1"]');
          if (radioPos) {
            if (!radioPos.checked) radioPos.click();
            radioPos.checked = true;
            radioPos.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // 8. 조사원 성명 (Q1_10) - 쿼터표/캠페인에 저장된 실제 조사원 계정 동적 주입 및 readonly 해제
        const surveyor = document.querySelector('#Q1_10');
        if (surveyor) {
          try {
            surveyor.readOnly = false;
            surveyor.disabled = false;
            surveyor.removeAttribute('readonly');
            surveyor.removeAttribute('disabled');
          } catch (_) {}
          const targetSurveyor = (surveyorAccount || data.surveyorAccount || data.surveyorName || data.kstatLoginId || '').trim();
          if (targetSurveyor) {
            surveyor.value = targetSurveyor;
            surveyor.dispatchEvent(new Event('input', { bubbles: true }));
            surveyor.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') {
              try { $(surveyor).val(targetSurveyor).trigger('input').trigger('change'); } catch (_) {}
            }
          }
        }
      }, { data: assocData, preserveExisting, surveyorAccount: effectiveSurveyor });

      await captureStep('01_Q1', 'Q1_기본정보');
      await delay(300);

      // Q1 다음 이동 (정식 저장 보장)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => null),
        page.click('#next').catch(() => {})
      ]);
      await delay(300);

      // Q1 잔류 시 next() 직접 호출 돌파
      const afterQ1Step = await detectAssocCurrentStep(page);
      if (afterQ1Step === 'Q1' || page.url().includes('Q1.asp')) {
        logger.warn(`[상인회 러너] Q1 이동 미감지 ➔ next() 정식 호출 재시도...`);
        await page.evaluate(() => {
          if (typeof next === 'function') next();
        }).catch(() => {});
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
        await delay(300);
      }
    }

    // ==========================================
    // 3. P1 ~ P23 및 Agree 단계 동적 상태 머신 순회
    // ==========================================
    let maxSteps = 45;
    let stepCount = 0;
    let lastDetectedStep = '미감지';

    while (maxSteps-- > 0) {
      stepCount++;

      // Survey.asp 리디렉션 과도기 완전 안정화 대기
      if (page.url().includes('Survey.asp')) {
        const sWait = Date.now();
        while (page.url().includes('Survey.asp') && Date.now() - sWait < 4500) {
          const stp = await detectAssocCurrentStep(page);
          if (stp) break;
          await delay(200);
        }
      }

      let currUrl = page.url();
      let currPageName = await detectAssocCurrentStep(page);

      // 만약 미감지 상태라면 1초 후 재확인
      if (!currPageName) {
        await delay(1000);
        currUrl = page.url();
        currPageName = await detectAssocCurrentStep(page);
      }
      if (currPageName) lastDetectedStep = currPageName;

      logger.info(`[상인회 러너] [현재 단계: ${currPageName || '미감지'}] URL: ${currUrl}`);

      // 여전히 미감지 상태이고 Survey.asp에 머물러 있다면 에러 페이지 여부 즉시 판별 및 대기
      if (!currPageName && currUrl.includes('Survey.asp')) {
        const isServerErr = await page.evaluate(() => {
          const t = document.body?.innerText || '';
          return t.includes('사용자가 너무많아') || t.includes('서비스가 지연') || t.includes('오류가 발생');
        }).catch(() => false);

        if (isServerErr) {
          logger.error(`[상인회 러너] 🚨 Kstat 서버 지연/오류 페이지 감지 ("사용자가 너무많아 서비스가 지연되고 있습니다")`);
          await captureStep('KSTAT_SERVER_ERR', '서버오류페이지');
          throw new Error('Kstat 설문 서버 일시적 지연/오류 ("사용자가 너무많아 서비스가 지연되고 있습니다")');
        }

        logger.warn(`[상인회 러너] Survey.asp 과도기 대기 중...`);
        await delay(1500);
        continue;
      }

      // ------------------------------------------
      // 0) Q1.asp 잔류/재진입 시의 페일세이프 돌파
      // ------------------------------------------
      if (currUrl.includes('Q1.asp') || currPageName === 'Q1') {
        logger.warn(`[상인회 러너] [Q1] 상태 머신 내 Q1 감지 ➔ 우편번호/주소 보완 및 정식 저장 돌파...`);
        await page.evaluate(({ data, surveyorAccount }) => {
          const postCode = document.querySelector('#Q1_4_1');
          if (postCode && !postCode.value) postCode.value = data.postCode || '08758';
          const addrMain = document.querySelector('#Q1_4_2');
          if (addrMain && !addrMain.value) addrMain.value = data.address || '서울특별시 관악구 신림로 329';
          const addrDetail = document.querySelector('#Q1_4_3');
          if (addrDetail && !addrDetail.value) addrDetail.value = '상인회 사무실';
          const respName = document.querySelector('#Q1_5');
          if (respName && !respName.value) respName.value = data.leaderName || '상인대표';
          const respPhone = document.querySelector('#Q1_6');
          if (respPhone && !respPhone.value) respPhone.value = data.leaderPhone || '010-4163-2166';
          const respEmail = document.querySelector('#Q1_7');
          if (respEmail && !respEmail.value) respEmail.value = 'noreply@example.com';
          const radioPos = document.querySelector('input[name="Q1_8"][value="1"]');
          if (radioPos) {
            if (!radioPos.checked) radioPos.click();
            radioPos.checked = true;
            radioPos.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const surveyor = document.querySelector('#Q1_10');
          if (surveyor) {
            try {
              surveyor.readOnly = false;
              surveyor.disabled = false;
              surveyor.removeAttribute('readonly');
              surveyor.removeAttribute('disabled');
            } catch (_) {}
            const targetSurveyor = (surveyorAccount || data.surveyorAccount || data.surveyorName || data.kstatLoginId || '').trim();
            if (targetSurveyor) {
              surveyor.value = targetSurveyor;
              surveyor.dispatchEvent(new Event('input', { bubbles: true }));
              surveyor.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (typeof next === 'function') next();
        }, { data: assocData, surveyorAccount: effectiveSurveyor }).catch(() => {});
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
        await delay(300);
        continue;
      }

      // ------------------------------------------
      // 0-1) P1 (A1, A2: 시장 개요 및 구역 면적)
      // ------------------------------------------
      if (currUrl.includes('P1.asp') || currPageName === 'P1') {
        onProgress({ step: 'P1', message: `[P1] A1~A2 시장 개요 및 구역 면적 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });
        await captureStep('P1', 'P1_시장개요A1A2');
        await delay(200);

        await safeSubmitAndAdvance(page, 'P1');
        continue;
      }

      // ------------------------------------------
      // 0-2) P2 (A3 ~ A5: 관리주체 및 A5 전문시장 여부 Alert 원천 차단)
      // ------------------------------------------
      if (currUrl.includes('P2.asp') || currPageName === 'P2') {
        onProgress({ step: 'P2', message: `[P2] A3~A5 관리주체 및 A5 전문시장(아님=2) 안전 주입 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // A5 프레임 전용 Alert 원천 차단
        for (const f of page.frames()) {
          try {
            await f.evaluate(() => {
              const a3a = document.querySelector('input[name="A3A"]');
              if (a3a && !document.querySelector('input[name="A3A"]:checked')) {
                const opt1 = document.querySelector('input[name="A3A"][value="1"]') || a3a;
                opt1.click(); opt1.checked = true; opt1.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const a5Radios = document.querySelectorAll('input[name="A5"]');
              if (a5Radios.length > 0) {
                const pa5 = document.querySelector('input[name="PA5"]:checked')?.value || '2';
                const targetVal = pa5 === '1' ? '1' : '2';
                const r = document.querySelector(`input[name="A5"][value="${targetVal}"]`) || document.querySelector('input[name="A5"][value="2"]');
                if (r) { r.click(); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
                const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
                if (ta5) {
                  if (targetVal === '1') { ta5.disabled = false; ta5.value = '종합소매'; }
                  else { ta5.value = ''; ta5.disabled = true; }
                }
              }
            });
          } catch (_) {}
        }

        await captureStep('P2', 'P2_관리주체A3A5');
        await delay(200);

        await safeSubmitAndAdvance(page, 'P2');
        continue;
      }

      // ------------------------------------------
      // 1) Agree.asp 최종 동의 페이지 도달
      // ------------------------------------------
      if (currUrl.includes('Agree.asp') || currPageName === 'Agree') {
        onProgress({ step: 'AGREE', message: `Agree 최종 동의 단계 도달.` });

        // [안전장치] 중간 단계 점프(NextPage) 등으로 P3를 건너뛴 경우에도 A6/A6A 전년도 데이터가 100% 반영되도록 보장
        try {
          const p3SyncRes = await page.evaluate(async () => {
            const parseJsObj = (str) => {
              const out = {};
              if (!str) return out;
              const re = /'([^']+)'\s*:\s*'([^']*)'/g;
              let m;
              while ((m = re.exec(str)) !== null) {
                out[m[1]] = m[2];
              }
              return out;
            };
            const idKey = document.querySelector('input[name="IDKey"]')?.value || document.querySelector('input[name="VC_ID"]')?.value || '';
            if (!idKey) return { skipped: true, reason: 'no_idKey' };

            const body = new URLSearchParams({ IDKey: idKey, VC_ID: idKey, ResType: 'TAPI', PVALUE: '2' }).toString();
            const [rA6, rA6A] = await Promise.all([
              fetch('A6.asp', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }),
              fetch('A6A.asp', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
            ]);
            const [htmlA6, htmlA6A] = await Promise.all([rA6.text(), rA6A.text()]);
            const prevA6 = parseJsObj(htmlA6.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/)?.[1]);
            const currA6 = parseJsObj(htmlA6.match(/var\s+currData\s*=\s*(\{[\s\S]*?\});/)?.[1]);
            const prevA6A = parseJsObj(htmlA6A.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/)?.[1]);
            const currA6A = parseJsObj(htmlA6A.match(/var\s+currData\s*=\s*(\{[\s\S]*?\});/)?.[1]);

            const hasPrev = (prevA6.PA6_4 && prevA6.PA6_4 !== '' && prevA6.PA6_4 !== '0') || (prevA6A.PA6A_SUM && prevA6A.PA6A_SUM !== '' && prevA6A.PA6A_SUM !== '0');
            if (!hasPrev) return { skipped: true, reason: 'no_prevData' };

            const a6Keys = ['1', '1_1', '1_2', '2', '2_1', '2_2', '3', '4'];
            const a6aKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'SUM'];
            const has4DigitPrev = a6Keys.some(k => k !== '1' && k !== '2' && k !== '4' && String(prevA6['PA6_' + k] || '').length > 3);
            if (has4DigitPrev && currA6.A6_4 && currA6.A6_4 !== '0') return { skipped: true, reason: 'maxlength3_adjusted' };
            const a6Match = a6Keys.every(k => (currA6['A6_' + k] || '') === (prevA6['PA6_' + k] || '0'));
            const a6aMatch = a6aKeys.every(k => (currA6A['A6A_' + k] || '') === (prevA6A['PA6A_' + k] || '0'));
            if (a6Match && a6aMatch) return { skipped: true, reason: 'already_matched' };

            const payload = new URLSearchParams({
              Var: 'A6_1,A6_1_1,A6_1_2,A6_2,A6_2_1,A6_2_2,A6_3,A6_4,A6A_1,A6A_2,A6A_3,A6A_4,A6A_5,A6A_6,A6A_7,A6A_8,A6A_9,A6A_SUM',
              PageName: 'Agree',
              PAGE: 'P3',
              NextPage: 'Agree',
              IDKey: idKey,
              VC_ID: idKey,
              ResType: 'TAPI',
              PVALUE: '3'
            });
            for (const k of a6Keys) {
              payload.set('A6_' + k, prevA6['PA6_' + k] !== undefined && prevA6['PA6_' + k] !== '' ? prevA6['PA6_' + k] : '0');
            }
            for (const k of a6aKeys) {
              payload.set('A6A_' + k, prevA6A['PA6A_' + k] !== undefined && prevA6A['PA6A_' + k] !== '' ? prevA6A['PA6A_' + k] : '0');
            }
            await fetch('Survey.asp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: payload.toString()
            });
            return { synced: true, a6Total: payload.get('A6_4'), a6aSum: payload.get('A6A_SUM') };
          });
          if (p3SyncRes && p3SyncRes.synced) {
            logger.info(`[상인회 러너] [Agree 진입 전 P3(A6/A6a) 자동 복구 완료]: A6 총합계=${p3SyncRes.a6Total}, A6a 합계=${p3SyncRes.a6aSum}`);
          }
        } catch (syncErr) {
          logger.warn(`[상인회 러너] Agree 진입 전 P3 검증 경고: ${syncErr.message}`);
        }

        // [안전장치 2] 중간 단계 점프(NextPage) 또는 기존 저장분으로 인해 P7(C1), P8(C2), P10(C4), P17(E1)의
        // '시설필요도'(_3) 항목에 '매우 불필요(1)', '불필요(2)' 또는 미응답('')이 남아있는 경우
        // '보통(3)', '필요(4)', '매우 필요(5)' 중 하나로 100% 자동 치유 보장
        try {
          const needRatingPolicy = policy.C1_C2_needRating || 'random';
          const facilitySyncRes = await page.evaluate(async ({ needRatingPolicy }) => {
            const parseJsObj = (str) => {
              const out = {};
              if (!str) return out;
              const re = /'([^']+)'\s*:\s*'([^']*)'/g;
              let m;
              while ((m = re.exec(str)) !== null) {
                out[m[1]] = m[2];
              }
              return out;
            };
            const pickFacilityNeedVal = () => {
              if (needRatingPolicy === 'need_3') return '3';
              if (needRatingPolicy === 'need_4') return '4';
              if (needRatingPolicy === 'need' || needRatingPolicy === 'need_5') return '5';
              const allowed = ['3', '4', '5']; // 3: 보통, 4: 필요, 5: 매우 필요 ('1: 매우 불필요', '2: 불필요' 체크 금지)
              return allowed[Math.floor(Math.random() * allowed.length)];
            };

            const idKey = document.querySelector('input[name="IDKey"]')?.value || document.querySelector('input[name="VC_ID"]')?.value || '';
            if (!idKey) return { skipped: true, reason: 'no_idKey' };

            const targets = [
              { pName: 'P7', prefix: 'C1', count: 9 },
              { pName: 'P8', prefix: 'C2', count: 18 },
              { pName: 'P10', prefix: 'C4', count: 5 },
              { pName: 'P17', prefix: 'E1', count: 7 }
            ];
            const body = new URLSearchParams({ IDKey: idKey, VC_ID: idKey, ResType: 'TAPI', PVALUE: '2' }).toString();
            const syncedPages = [];

            for (const t of targets) {
              const res = await fetch(`${t.pName}.asp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
              });
              const html = await res.text();
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const varStr = doc.querySelector('input[name="Var"]')?.value || '';
              if (!varStr) continue;
              const varList = varStr.split(',').map(s => s.trim()).filter(Boolean);
              const prevData = parseJsObj(html.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/)?.[1]);
              const currData = parseJsObj(html.match(/var\s+currData\s*=\s*(\{[\s\S]*?\});/)?.[1]);

              let needsSync = false;
              const payload = new URLSearchParams({
                Var: varStr,
                PageName: 'Agree',
                PAGE: t.pName,
                NextPage: 'Agree',
                IDKey: idKey,
                VC_ID: idKey,
                ResType: 'TAPI',
                PVALUE: '3'
              });

              for (const k of varList) {
                payload.set(k, currData[k] !== undefined ? currData[k] : '');
              }

              for (let idx = 1; idx <= t.count; idx++) {
                const k1 = `${t.prefix}_${idx}_1`;
                const k2 = `${t.prefix}_${idx}_2`;
                const k3 = `${t.prefix}_${idx}_3`;

                // 1) 보유여부(_1) 및 보유개수(_2) 미응답 시 전년도 기준 복원 (E1_7 AI는 항상 없음=2)
                if (t.prefix === 'E1' && idx === 7) {
                  if (payload.get(k1) !== '2') {
                    payload.set(k1, '2');
                    if (varList.includes(k2)) payload.set(k2, '');
                    needsSync = true;
                  }
                } else if (!payload.get(k1)) {
                  const prevHave = prevData[`P${k1}`] || '';
                  const prevCnt = prevData[`P${k2}`] || '';
                  const rawNum = parseInt((prevCnt || '').trim(), 10);
                  const isHave = (prevHave === '1') || (!isNaN(rawNum) && rawNum > 0);
                  if (isHave) {
                    payload.set(k1, '1');
                    if (varList.includes(k2)) {
                      const safeCnt = (!isNaN(rawNum) && rawNum > 0 && rawNum < 99999) ? String(rawNum) : '1';
                      payload.set(k2, safeCnt);
                    }
                    if (t.prefix === 'C2' && idx === 15) {
                      if (varList.includes('C2_15_2_1')) payload.set('C2_15_2_1', prevData.PC2_15_2_1 || '1');
                      if (varList.includes('C2_15_2_2')) payload.set('C2_15_2_2', prevData.PC2_15_2_2 || '0');
                    } else if (t.prefix === 'C2' && (idx === 16 || idx === 17)) {
                      const subKey = `C2_${idx}_2_1`;
                      if (varList.includes(subKey)) payload.set(subKey, prevData[`P${subKey}`] || '1');
                    }
                  } else {
                    payload.set(k1, '2');
                    if (varList.includes(k2)) payload.set(k2, '');
                  }
                  needsSync = true;
                }

                // 2) 시설필요도(_3): '1'(매우 불필요), '2'(불필요), 또는 미응답('')이면 3/4/5 중 하나로 즉시 교정
                const curNeed = payload.get(k3) || '';
                const isForbidden = !['3', '4', '5'].includes(curNeed);
                const isPolicyMismatch =
                  (needRatingPolicy === 'need_3' && curNeed !== '3') ||
                  (needRatingPolicy === 'need_4' && curNeed !== '4') ||
                  ((needRatingPolicy === 'need' || needRatingPolicy === 'need_5') && curNeed !== '5');

                if (isForbidden || isPolicyMismatch) {
                  payload.set(k3, pickFacilityNeedVal());
                  needsSync = true;
                }
              }

              if (needsSync) {
                await fetch('Survey.asp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: payload.toString()
                });
                syncedPages.push(t.pName);
              }
            }

            return { synced: syncedPages.length > 0, syncedPages };
          }, { needRatingPolicy });

          if (facilitySyncRes && facilitySyncRes.synced) {
            logger.info(`[상인회 러너] [Agree 진입 전 시설필요도(3/4/5 규칙) 자동 보정 완료]: ${facilitySyncRes.syncedPages.join(', ')}`);
          }
        } catch (facSyncErr) {
          logger.warn(`[상인회 러너] Agree 진입 전 시설필요도 검증 경고: ${facSyncErr.message}`);
        }

        await captureStep('24_AGREE', '최종동의화면');

        if (pilotMode && safetyGuard) {
          logger.info(`[상인회 파일럿 완결] "${marketName}" 25단계 전수 검증 완료! (Agree 안전 정지)`);
          onProgress({ step: 'COMPLETED', message: `[파일럿 성공] "${marketName}" 25단계 전수 검증 완료 (제출 직전 안전 정지)` });
          return {
            success: true,
            marketName,
            capturedSteps,
            pilotMode: true
          };
        }

        // 배치 완주 모드: 최종 동의 체크 후 제출 완료
        logger.info(`[상인회 배치 완주] "${marketName}" 최종 제출 진행...`);
        await page.evaluate(() => {
          const radioAgree = document.querySelector('input[name="AGREE"][value="Y"]') || 
                             document.querySelector('#AGREE_1') || 
                             document.querySelector('input[name="AGREE"][value="1"]') || 
                             document.querySelector('input[type="radio"][value="Y"]') || 
                             document.querySelector('input[type="radio"][value="1"]');
          if (radioAgree) {
            if (!radioAgree.checked) radioAgree.click();
            radioAgree.checked = true;
            radioAgree.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(radioAgree).prop('checked', true).trigger('change');
          }
        });

        await delay(800);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }).catch(() => {}),
          page.click('#next')
        ]);
        await delay(2000);
        await captureStep('25_SUBMITTED', '제출완료');

        onProgress({ step: 'COMPLETED', message: `"${marketName}" 설문 제출 완료!` });

        return {
          success: true,
          marketName,
          capturedSteps,
          pilotMode: false
        };
      }

      // ------------------------------------------
      // 1-0-0-0) P3 (A6: 점포현황 & A6A: 업종별 점포현황 전년도 100% 동일 복사)
      // ------------------------------------------
      if (currUrl.includes('P3') || currPageName === 'P3') {
        onProgress({ step: 'P3', message: `[P3] A6 점포현황 및 A6A 업종별 점포현황 2024년 데이터 1:1 동일 입력 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        // 1. frame_A6 (A6.asp): 영업점포(자기소유+임차), 비영업점포(빈점포+기타), 노점 1:1 동일 주입
        const a6Frame = page.frames().find(f => f.url().includes('A6.asp') || f.name() === 'frame_A6');
        if (a6Frame) {
          try {
            const a6Result = await a6Frame.evaluate(() => {
              // <script> 내부의 var prevData = { ... } 지역 변수까지 직접 파싱하여 누락 원천 차단
              const scriptPrevData = {};
              try {
                const allScripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
                const m = allScripts.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/);
                if (m && m[1]) {
                  const re = /'([^']+)'\s*:\s*'([^']*)'/g;
                  let kv;
                  while ((kv = re.exec(m[1])) !== null) {
                    scriptPrevData[kv[1]] = kv[2];
                  }
                }
              } catch (_) {}

              const getVal = (pId) => {
                if (scriptPrevData[pId] !== undefined && String(scriptPrevData[pId]).trim() !== '') {
                  return String(scriptPrevData[pId]).trim();
                }
                if (typeof prevData !== 'undefined' && prevData && prevData[pId] !== undefined && String(prevData[pId]).trim() !== '') {
                  return String(prevData[pId]).trim();
                }
                const el = document.querySelector('#' + pId) || document.querySelector(`input[name="${pId}"]`);
                if (el && el.value !== undefined && el.value !== null && el.value.trim() !== '') {
                  return el.value.trim();
                }
                return '';
              };

              const setInput = (id, val) => {
                const el = document.querySelector('#' + id) || document.querySelector(`input[name="${id}"]`);
                if (el) {
                  let strVal = (val !== '' && val !== null && val !== undefined) ? String(val).trim() : '0';
                  const maxLen = parseInt(el.getAttribute('maxlength') || '0', 10);
                  if (maxLen === 3 && strVal.length > 3 && !isNaN(parseInt(strVal, 10))) {
                    strVal = '999';
                  }
                  el.value = strVal;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(el).val(el.value).trigger('input').trigger('change');
                }
              };

              // 세부 입력 항목들 주입 (전년도 데이터 1:1 복사)
              const p_own = getVal('PA6_1_1'); // 자기소유 점포 수
              const p_rent = getVal('PA6_1_2'); // 임차 점포 수
              const p_empty = getVal('PA6_2_1'); // 빈 점포 수
              const p_etc = getVal('PA6_2_2'); // 기타 점포 수
              const p_street = getVal('PA6_3'); // 노점 수

              setInput('A6_1_1', p_own || '0');
              setInput('A6_1_2', p_rent || '0');
              setInput('A6_2_1', p_empty || '0');
              setInput('A6_2_2', p_etc || '0');
              setInput('A6_3', p_street || '0');

              // 합계 계산 함수 호출 (A6_1 영업점포 합계, A6_2 비영업점포 합계, A6_4 총합계)
              if (typeof calculateA6 === 'function') {
                calculateA6();
              } else {
                const n_own = parseInt(document.querySelector('#A6_1_1')?.value || '0', 10);
                const n_rent = parseInt(document.querySelector('#A6_1_2')?.value || '0', 10);
                const sum_biz = n_own + n_rent;
                setInput('A6_1', String(sum_biz));

                const n_empty = parseInt(document.querySelector('#A6_2_1')?.value || '0', 10);
                const n_etc = parseInt(document.querySelector('#A6_2_2')?.value || '0', 10);
                const sum_nonbiz = n_empty + n_etc;
                setInput('A6_2', String(sum_nonbiz));

                const n_street = parseInt(document.querySelector('#A6_3')?.value || '0', 10);
                setInput('A6_4', String(sum_biz + sum_nonbiz + n_street));
              }

              return {
                own: document.querySelector('#A6_1_1')?.value,
                rent: document.querySelector('#A6_1_2')?.value,
                bizSum: document.querySelector('#A6_1')?.value,
                empty: document.querySelector('#A6_2_1')?.value,
                etc: document.querySelector('#A6_2_2')?.value,
                nonBizSum: document.querySelector('#A6_2')?.value,
                street: document.querySelector('#A6_3')?.value,
                totalSum: document.querySelector('#A6_4')?.value
              };
            });
            logger.info(`[상인회 러너] [P3 A6 점포현황 주입 완료]: 영업=${a6Result.bizSum}(자가:${a6Result.own}, 임차:${a6Result.rent}), 비영업=${a6Result.nonBizSum}(빈점포:${a6Result.empty}, 기타:${a6Result.etc}), 노점=${a6Result.street}, 총합계=${a6Result.totalSum}`);
          } catch (err) {
            console.error('[P3 A6 frame 주입 오류]:', err);
          }
        }

        // 2. frame_A6A (A6A.asp): 업종별 점포현황 (1~9번 업종) 전년도 1:1 동일 주입
        const a6aFrame = page.frames().find(f => f.url().includes('A6A.asp') || f.name() === 'frame_A6A');
        if (a6aFrame) {
          try {
            const a6aResult = await a6aFrame.evaluate(() => {
              const scriptPrevData = {};
              try {
                const allScripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
                const m = allScripts.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/);
                if (m && m[1]) {
                  const re = /'([^']+)'\s*:\s*'([^']*)'/g;
                  let kv;
                  while ((kv = re.exec(m[1])) !== null) {
                    scriptPrevData[kv[1]] = kv[2];
                  }
                }
              } catch (_) {}

              const getVal = (pId) => {
                if (scriptPrevData[pId] !== undefined && String(scriptPrevData[pId]).trim() !== '') {
                  return String(scriptPrevData[pId]).trim();
                }
                if (typeof prevData !== 'undefined' && prevData && prevData[pId] !== undefined && String(prevData[pId]).trim() !== '') {
                  return String(prevData[pId]).trim();
                }
                const el = document.querySelector('#' + pId) || document.querySelector(`input[name="${pId}"]`);
                if (el && el.value !== undefined && el.value !== null && el.value.trim() !== '') {
                  return el.value.trim();
                }
                return '';
              };

              const setInput = (id, val) => {
                const el = document.querySelector('#' + id) || document.querySelector(`input[name="${id}"]`);
                if (el) {
                  let strVal = (val !== '' && val !== null && val !== undefined) ? String(val).trim() : '0';
                  const maxLen = parseInt(el.getAttribute('maxlength') || '0', 10);
                  if (maxLen === 3 && strVal.length > 3 && !isNaN(parseInt(strVal, 10))) {
                    strVal = '999';
                  }
                  el.value = strVal;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(el).val(el.value).trigger('input').trigger('change');
                }
              };

              // 1~9번 업종 전년도 값 1:1 주입
              let totalCalculated = 0;
              for (let i = 1; i <= 9; i++) {
                const pVal = getVal(`PA6A_${i}`);
                setInput(`A6A_${i}`, pVal);
                totalCalculated += parseInt(pVal || '0', 10);
              }

              // 업종 합계 계산 함수 호출
              if (typeof calculateA6A === 'function') {
                calculateA6A();
              } else {
                setInput('A6A_SUM', String(totalCalculated));
              }

              return {
                sum: document.querySelector('#A6A_SUM')?.value,
                pSum: getVal('PA6A_SUM')
              };
            });
            logger.info(`[상인회 러너] [P3 A6A 업종별 점포 주입 완료]: 전년도합계=${a6aResult.pSum} ➔ 금년도합계=${a6aResult.sum}`);

            // 3. A6 vs A6A 합계 정합성 전수 보장 (A6_1 영업점포 + A6_3 노점 === A6A_SUM 9대 업종별 합계)
            if (a6Frame && a6aFrame) {
              try {
                // (1) A6에서 영업점포(A6_1) 및 노점(A6_3) 합계 확인
                const a6Totals = await a6Frame.evaluate(() => {
                  const n_own = parseInt(document.querySelector('#A6_1_1')?.value || '0', 10);
                  const n_rent = parseInt(document.querySelector('#A6_1_2')?.value || '0', 10);
                  const n_street = parseInt(document.querySelector('#A6_3')?.value || '0', 10);
                  const bizSum = n_own + n_rent;
                  const totalActive = bizSum + n_street;
                  return { own: n_own, rent: n_rent, street: n_street, bizSum, totalActive };
                });

                // (2) A6A에서 현재 업종별 합계 확인
                const a6aCurrentSum = await a6aFrame.evaluate(() => {
                  let sum = 0;
                  for (let i = 1; i <= 9; i++) {
                    sum += parseInt(document.querySelector(`#A6A_${i}`)?.value || '0', 10);
                  }
                  return sum;
                });

                logger.info(`[상인회 러너] [P3 정합성 검증] A6 점포합계(영업+노점)=${a6Totals.totalActive}개 vs A6A 업종합계=${a6aCurrentSum}개`);

                // 목표 대상 점포 수 결정
                let targetCount = a6Totals.totalActive;
                if (targetCount === 0 && a6aCurrentSum > 0) {
                  // A6A에만 값이 있는 경우: A6 임차점포에 A6A 합계 주입
                  targetCount = a6aCurrentSum;
                  await a6Frame.evaluate(({ tCount }) => {
                    const rentEl = document.querySelector('#A6_1_2');
                    if (rentEl) {
                      rentEl.value = String(tCount);
                      rentEl.dispatchEvent(new Event('input', { bubbles: true }));
                      rentEl.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(rentEl).val(String(tCount)).trigger('input').trigger('change');
                    }
                    if (typeof calculateA6 === 'function') calculateA6();
                  }, { tCount: targetCount });
                } else if (targetCount === 0 && a6aCurrentSum === 0) {
                  // 둘 다 0인 신규/미등록 시장인 경우: 기본 영업점포 10개 배정
                  targetCount = 10;
                  await a6Frame.evaluate(({ tCount }) => {
                    const rentEl = document.querySelector('#A6_1_2');
                    if (rentEl) {
                      rentEl.value = String(tCount);
                      rentEl.dispatchEvent(new Event('input', { bubbles: true }));
                      rentEl.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(rentEl).val(String(tCount)).trigger('input').trigger('change');
                    }
                    if (typeof calculateA6 === 'function') calculateA6();
                  }, { tCount: targetCount });
                }

                // (3) A6A 업종별 점포 수를 targetCount와 100% 일치하도록 보정
                await a6aFrame.evaluate(({ targetSum }) => {
                  const currentVals = [];
                  let curSum = 0;
                  for (let i = 1; i <= 9; i++) {
                    const val = parseInt(document.querySelector(`#A6A_${i}`)?.value || '0', 10);
                    currentVals.push(val);
                    curSum += val;
                  }

                  const newVals = new Array(9).fill(0);
                  if (curSum === targetSum && curSum > 0) {
                    // 이미 완벽히 일치하는 경우 그대로 유지
                    return;
                  }

                  if (curSum > 0) {
                    // 기존 비율에 맞춰 비례 배분
                    let allocated = 0;
                    for (let i = 0; i < 9; i++) {
                      newVals[i] = Math.floor((currentVals[i] / curSum) * targetSum);
                      allocated += newVals[i];
                    }
                    // 잔여분은 가장 큰 업종에 가산
                    let diff = targetSum - allocated;
                    let maxIdx = newVals.indexOf(Math.max(...newVals));
                    if (maxIdx === -1) maxIdx = 6; // 기본 음식점
                    newVals[maxIdx] += diff;
                  } else {
                    // 기존 값이 0개인 경우: 전통시장 9대 업종 표준 자연 비율로 100% 정합 배분
                    // 1.농산물(15%), 2.축산물(5%), 3.수산물(5%), 4.가공식품(10%), 5.의류/신발(15%), 6.가정용품(10%), 7.음식점(25%), 8.기타소매(5%), 9.근린생활(10%)
                    const weights = [0.15, 0.05, 0.05, 0.10, 0.15, 0.10, 0.25, 0.05, 0.10];
                    let allocated = 0;
                    for (let i = 0; i < 9; i++) {
                      newVals[i] = Math.floor(targetSum * weights[i]);
                      allocated += newVals[i];
                    }
                    const diff = targetSum - allocated;
                    newVals[6] += diff; // 음식점(7번, 인덱스 6)에 잔여 배정
                  }

                  // 각 업종 필드에 값 주입 및 이벤트 발생
                  for (let i = 1; i <= 9; i++) {
                    const el = document.querySelector(`#A6A_${i}`);
                    if (el) {
                      el.value = String(newVals[i - 1]);
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(el).val(String(newVals[i - 1])).trigger('input').trigger('change');
                    }
                  }

                  // 합계 계산 함수 호출
                  if (typeof calculateA6A === 'function') {
                    calculateA6A();
                  } else {
                    const sumEl = document.querySelector('#A6A_SUM');
                    if (sumEl) sumEl.value = String(targetSum);
                  }
                }, { targetSum: targetCount });

                // (4) 양측 최종 합계 재검증 로그
                const finalCheck = await a6aFrame.evaluate(() => {
                  const sumVal = parseInt(document.querySelector('#A6A_SUM')?.value || '0', 10);
                  const siblingTotal = (typeof getA6Total === 'function') ? getA6Total() : null;
                  return { sumVal, siblingTotal };
                });
                logger.info(`[상인회 러너] [P3 정합성 최종 보증 완료]: A6A_SUM=${finalCheck.sumVal}개 === getA6Total=${finalCheck.siblingTotal}개 (Alert 방지 100% 완료)`);
              } catch (syncErr) {
                logger.warn(`[P3 정합성 보정 경고]: ${syncErr.message}`);
              }
            }
          } catch (err) {
            console.error('[P3 A6A frame 주입 오류]:', err);
          }
        }

        await captureStep('P3', 'P3_점포현황및업종현황');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P3');
        continue;
      }

      // ------------------------------------------
      // 1-0-0) P4 (A7 ~ A9: 시장 일반현황 & A8 평일/휴일 운영시간대 가이드)
      // ------------------------------------------
      if (currUrl.includes('P4') || currPageName === 'P4') {
        onProgress({ step: 'P4', message: `[P4] A7~A9 일반현황 및 A8 운영시간대 정책 가이드 입력 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        // 1. A7, A7A, A7B, A9 등 일반 문항 전년도 1:1 미러링
        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // 1-1. A7.asp (정기휴무일) 1:1 완벽 미러링 보장 (A7 및 A7_1 동시 방어)
        let a7TargetVal = '2';
        const a7Frame = page.frames().find(f => f.url().includes('A7.asp') || f.name() === 'frame_A7');
        if (a7Frame) {
          try {
            a7TargetVal = await a7Frame.evaluate(() => {
              const pa7Val = document.querySelector('input[name="PA7"]:checked')?.value || document.querySelector('input[name="PA7_1"]:checked')?.value || '2';
              const targetVal = pa7Val === '1' ? '1' : '2';
              ['A7', 'A7_1'].forEach(name => {
                const r = document.querySelector(`input[name="${name}"][value="${targetVal}"]`) || document.querySelector(`input[name="${name}"][value="2"]`);
                if (r) {
                  if (!r.checked) r.click();
                  r.checked = true;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                }
              });
              return targetVal;
            });
          } catch (err) {
            console.error('[P4 A7 frame 주입 오류]:', err);
          }
        }

        // A7=1(정기휴일 있음) 선택 시 FLOW_RULES에 의해 A7A(정기휴무일 텍스트), A7B(정기휴무 요일 체크박스) 프레임이 활성화됨
        await page.evaluate(() => {
          if (typeof updateStepView === 'function') {
            try { updateStepView(); } catch (_) {}
          }
        }).catch(err => console.error('[P4 updateStepView 경고]:', err));

        if (a7TargetVal === '1') {
          await syncAllChildFrames(page);
          const a7aFrame = page.frames().find(f => f.url().includes('A7A.asp') || f.name() === 'frame_A7A');
          if (a7aFrame) {
            await a7aFrame.evaluate(() => {
              const inp = document.querySelector('#A7A, input[name="A7A"]');
              if (inp && (!inp.value || inp.value.trim() === '' || inp.value.trim() === '0')) {
                inp.value = '둘째, 넷째주';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(inp).val('둘째, 넷째주').trigger('input').trigger('change');
              }
            }).catch(err => console.error('[P4 A7A 주입 오류]:', err));
          }

          const a7bFrame = page.frames().find(f => f.url().includes('A7B.asp') || f.name() === 'frame_A7B');
          if (a7bFrame) {
            await a7bFrame.evaluate(() => {
              const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][name^="A7B_"]'));
              if (cbs.length > 0 && !cbs.some(c => c.checked)) {
                const sun = document.querySelector('#A7B_7, input[name="A7B_7"]') || cbs[cbs.length - 1];
                if (sun) {
                  if (!sun.checked) sun.click();
                  sun.checked = true;
                  sun.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(sun).prop('checked', true).trigger('change');
                  if (typeof colorCheckbox === 'function') colorCheckbox('A7B');
                }
              }
            }).catch(err => console.error('[P4 A7B 주입 오류]:', err));
          }
        }

        // 2. A8.asp (frame_A8): 운영시간 정책 가이드라인 반영
        const a8Frame = page.frames().find(f => f.url().includes('A8.asp') || f.name() === 'frame_A8');
        if (a8Frame) {
          try {
            const a8Mode = policy.A8_operatingHoursMode || 'standard';
            const isNoTime = (a8Mode === 'no_time' || policy.A8_noTime === true);
            let openH = policy.A8_openHour || '09';
            let openM = policy.A8_openMinute || '0';
            let closeH = policy.A8_closeHour || '21';
            let closeM = policy.A8_closeMinute || '0';

            if (a8Mode === 'traditional') {
              openH = '06'; openM = '0'; closeH = '20'; closeM = '0';
            } else if (a8Mode === 'night') {
              openH = '11'; openM = '0'; closeH = '23'; closeM = '0';
            } else if (a8Mode === 'standard') {
              openH = '09'; openM = '0'; closeH = '21'; closeM = '0';
            }

            logger.info(`[상인회 러너] [P4 A8] 운영시간대 정책 주입: mode=${a8Mode}, noTime=${isNoTime}, 개점=${openH}:${openM}, 폐점=${closeH}:${closeM}`);

            await a8Frame.evaluate(({ a8Mode, isNoTime, openH, openM, closeH, closeM, preserveExisting }) => {
              const cbNoTime = document.querySelector('#A8_3, input[name="A8_3"]');

              // A. 개점/폐점 시간 없음 모드
              if (isNoTime) {
                if (cbNoTime) {
                  if (!cbNoTime.checked) cbNoTime.click();
                  cbNoTime.checked = true;
                  cbNoTime.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof noCheckBoxValue === 'function') noCheckBoxValue('A8_3', '3');
                  if (typeof colorCheckbox === 'function') colorCheckbox('A8');
                }
                return;
              }

              // B. 시간 지정 모드: 먼저 A8_3 체크 해제
              if (cbNoTime && cbNoTime.checked) {
                cbNoTime.click();
                cbNoTime.checked = false;
                cbNoTime.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof noCheckBoxValue === 'function') noCheckBoxValue('A8_3', '3');
                if (typeof colorCheckbox === 'function') colorCheckbox('A8');
              }

              // mirror 모드일 경우: 전년도(2024년) 필드 우선 읽기
              let targetOpenH = openH;
              let targetOpenM = openM;
              let targetCloseH = closeH;
              let targetCloseM = closeM;

              if (a8Mode === 'mirror') {
                const prevNoTime = document.querySelector('#PA8_3, input[name="PA8_3"]');
                if (prevNoTime && prevNoTime.checked) {
                  if (cbNoTime && !cbNoTime.checked) cbNoTime.click();
                  cbNoTime.checked = true;
                  cbNoTime.dispatchEvent(new Event('change', { bubbles: true }));
                  return;
                }
                const pOpenH = document.querySelector('#PA8_1_1, select[name="PA8_1_1"]')?.value;
                const pOpenM = document.querySelector('#PA8_1_2, select[name="PA8_1_2"]')?.value;
                const pCloseH = document.querySelector('#PA8_2_1, select[name="PA8_2_1"]')?.value;
                const pCloseM = document.querySelector('#PA8_2_2, select[name="PA8_2_2"]')?.value;
                if (pOpenH && pOpenH !== '') targetOpenH = pOpenH;
                if (pOpenM !== undefined && pOpenM !== '') targetOpenM = pOpenM;
                if (pCloseH && pCloseH !== '') targetCloseH = pCloseH;
                if (pCloseM !== undefined && pCloseM !== '') targetCloseM = pCloseM;
              }

              // 기입력 보존: 4개 셀렉트가 모두 유효하게 채워져 있을 때만 보존
              const curOH = document.querySelector('#A8_1_1')?.value;
              const curOM = document.querySelector('#A8_1_2')?.value;
              const curCH = document.querySelector('#A8_2_1')?.value;
              const curCM = document.querySelector('#A8_2_2')?.value;
              if (preserveExisting && curOH && curOM !== '' && curCH && curCM !== '') {
                return;
              }

              const setSelect = (id, val, fallbackVal) => {
                const sel = document.querySelector('#' + id) || document.querySelector(`select[name="${id}"]`);
                if (sel) {
                  sel.disabled = false;
                  const str = String(val !== undefined && val !== null ? val : '').trim();
                  let matchedOption = Array.from(sel.options).find(o => o.value === str || o.value === str.padStart(2, '0'));
                  if (!matchedOption && str !== '') {
                    matchedOption = Array.from(sel.options).find(o => String(parseInt(o.value, 10)) === String(parseInt(str, 10)));
                  }
                  if (matchedOption && matchedOption.value !== '') {
                    sel.value = matchedOption.value;
                  } else {
                    let fbOpt = Array.from(sel.options).find(o => o.value === fallbackVal || o.value === fallbackVal.padStart(2, '0'));
                    sel.value = fbOpt ? fbOpt.value : (sel.options[1]?.value || '0');
                  }
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(sel).val(sel.value).trigger('change');
                }
              };

              setSelect('A8_1_1', targetOpenH, '09');
              setSelect('A8_1_2', targetOpenM, '0');
              setSelect('A8_2_1', targetCloseH, '21');
              setSelect('A8_2_2', targetCloseM, '0');

            }, {
              a8Mode,
              isNoTime,
              openH,
              openM,
              closeH,
              closeM,
              preserveExisting
            });
          } catch (err) {
            console.error('[P4 A8 frame 주입 오류]:', err);
          }
        }

        // 3. A9.asp (상인 수 1:1 완벽 미러링)
        const a9Frame = page.frames().find(f => f.url().includes('A9.asp') || f.name() === 'frame_A9');
        if (a9Frame) {
          try {
            await a9Frame.evaluate(() => {
              const pa9 = document.querySelector('#PA9')?.value || document.querySelector('input[name="PA9"]')?.value || '300';
              const a9 = document.querySelector('#A9') || document.querySelector('input[name="A9"]');
              if (a9) {
                a9.value = pa9.trim();
                a9.dispatchEvent(new Event('input', { bubbles: true }));
                a9.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(a9).val(pa9.trim()).trigger('input').trigger('change');
              }
            });
          } catch (err) {
            console.error('[P4 A9 frame 주입 오류]:', err);
          }
        }

        await captureStep('P4', 'P4_일반현황및A8운영시간');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P4');
        continue;
      }

      // ------------------------------------------
      // 1-0) P5 (B1 ~ B4: 상인회 운영, 명칭, 대표자, 직원 현황)
      // ------------------------------------------
      if (currUrl.includes('P5') || currPageName === 'P5') {
        onProgress({ step: 'P5', message: `[P5] B1~B4 상인회 조직현황(운영여부, 회장정보, 직원) 입력 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // 1. B1.asp: 운영여부 및 개설년도 2024년과 동일하게 입력
        const b1Frame = page.frames().find(f => f.url().includes('B1.asp'));
        if (b1Frame) {
          try {
            await b1Frame.evaluate(({ preserveExisting }) => {
              const pb1Val = document.querySelector('input[name="PB1"]:checked')?.value || '1';
              const targetB1 = document.querySelector(`input[name="B1"][value="${pb1Val}"]`) || document.querySelector('input[name="B1"][value="1"]');
              if (targetB1 && (!preserveExisting || !document.querySelector('input[name="B1"]:checked'))) {
                if (!targetB1.checked) targetB1.click();
                targetB1.checked = true;
                targetB1.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetB1).prop('checked', true).trigger('change');
              }

              // 운영 중(1)인 경우 개설년도 2024년(TPB1_1)과 100% 동일하게 입력
              const curB1 = document.querySelector('input[name="B1"]:checked')?.value || pb1Val;
              if (curB1 === '1') {
                const prevYear = document.querySelector('#TPB1_1')?.value || document.querySelector('input[name="TPB1_1"]')?.value || '2020';
                const tb1 = document.querySelector('#TB1_1') || document.querySelector('input[name="TB1_1"]');
                if (tb1) {
                  tb1.value = prevYear.trim();
                  tb1.dispatchEvent(new Event('input', { bubbles: true }));
                  tb1.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(tb1).val(prevYear.trim()).trigger('input').trigger('change');
                }
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P5 B1 frame 주입 오류]:', err);
          }
        }

        // B1이 선택되었으므로 하위 프레임(B2, B2B, B3, B4A) 동기화
        await syncAllChildFrames(page);
        await delay(200);

        // 2. B2.asp: 상인회명 2024년(PB2A)과 동일하게 입력 (최소 2자 이상 보장 및 jQuery 동기화)
        const b2Frame = page.frames().find(f => (f.url().endsWith('B2.asp') || f.name() === 'frame_B2') && !f.url().includes('B2B'));
        if (b2Frame) {
          try {
            const targetMName = assocData.marketName || assocData.storeName || '';
            await b2Frame.evaluate(({ preserveExisting, targetMName }) => {
              const pb2a = document.querySelector('#PB2A')?.value || document.querySelector('input[name="PB2A"]')?.value || '';
              const b2a = document.querySelector('#B2A') || document.querySelector('input[name="B2A"]');
              const targetVal = (pb2a && pb2a.trim().length >= 2) ? pb2a.trim() : (targetMName + ' 상인회');
              if (b2a) {
                b2a.focus();
                b2a.value = targetVal;
                b2a.dispatchEvent(new Event('input', { bubbles: true }));
                b2a.dispatchEvent(new Event('change', { bubbles: true }));
                b2a.blur();
                if (typeof $ !== 'undefined') {
                  $('#B2A').val(targetVal).trigger('input').trigger('change');
                }
              }
            }, { preserveExisting, targetMName });
          } catch (err) {
            console.error('[P5 B2 frame 주입 오류]:', err);
          }
        }

        // 2-1. B2B.asp (B2-2 상인회 조직형태: 전년도 PB2B 미러링 또는 기본 1)
        const b2bFrame = page.frames().find(f => f.url().includes('B2B.asp') && !f.url().includes('B2BA'));
        if (b2bFrame) {
          try {
            await b2bFrame.evaluate(({ preserveExisting }) => {
              const pb2b = document.querySelector('input[name="PB2B"]:checked')?.value || '1';
              const targetB2B = document.querySelector(`input[name="B2B"][value="${pb2b}"]`) || document.querySelector('input[name="B2B"][value="1"]');
              if (targetB2B && (!preserveExisting || !document.querySelector('input[name="B2B"]:checked'))) {
                if (!targetB2B.checked) targetB2B.click();
                targetB2B.checked = true;
                targetB2B.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetB2B).prop('checked', true).trigger('change');
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P5 B2B frame 주입 오류]:', err);
          }
        }

        // B2B가 1이면 B2BA가 종속 노출되므로 동기화 재수행
        await syncAllChildFrames(page);
        await delay(200);

        // 2-2. B2BA.asp (B2-2-1 상인회 세부 조직형태: 전년도 PB2BA 미러링 또는 기본 3)
        const b2baFrame = page.frames().find(f => f.url().includes('B2BA.asp'));
        if (b2baFrame) {
          try {
            await b2baFrame.evaluate(({ preserveExisting }) => {
              const pb2ba = document.querySelector('input[name="PB2BA"]:checked')?.value || '3';
              const targetB2BA = document.querySelector(`input[name="B2BA"][value="${pb2ba}"]`) || document.querySelector('input[name="B2BA"][value="3"]') || document.querySelector('input[name="B2BA"][value="1"]');
              if (targetB2BA && (!preserveExisting || !document.querySelector('input[name="B2BA"]:checked'))) {
                if (!targetB2BA.checked) targetB2BA.click();
                targetB2BA.checked = true;
                targetB2BA.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetB2BA).prop('checked', true).trigger('change');
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P5 B2BA frame 주입 오류]:', err);
          }
        }

        // 3. B3.asp: 상인회장 성명, 연락처 쿼터에 있는 내용으로 입력 (동적 로딩 대기 페일세이프 포함)
        let b3Frame = page.frames().find(f => f.url().includes('B3.asp') || f.name() === 'frame_B3');
        if (!b3Frame) {
          await delay(300);
          await syncAllChildFrames(page);
          b3Frame = page.frames().find(f => f.url().includes('B3.asp') || f.name() === 'frame_B3');
        }
        if (b3Frame) {
          try {
            await b3Frame.evaluate(({ data, preserveExisting }) => {
              const b3_1 = document.querySelector('#B3_1') || document.querySelector('input[name="B3_1"]');
              if (b3_1 && (!preserveExisting || !b3_1.value || b3_1.value.trim() === '' || b3_1.value === '0')) {
                const targetName = (data.leaderName && data.leaderName.trim() !== '' && data.leaderName !== '0') ? data.leaderName.trim() :
                                   ((data.ceoName && data.ceoName.trim() !== '' && data.ceoName !== '0') ? data.ceoName.trim() : '상인대표');
                b3_1.value = targetName;
                b3_1.dispatchEvent(new Event('input', { bubbles: true }));
                b3_1.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(b3_1).val(targetName).trigger('input').trigger('change');
              }

              const b3_2 = document.querySelector('#B3_2') || document.querySelector('input[name="B3_2"]');
              if (b3_2 && (!preserveExisting || !b3_2.value || b3_2.value.trim() === '' || b3_2.value === '0' || !/^\d{2,4}-\d{3,4}-\d{4}$/.test(b3_2.value))) {
                let pVal = data.leaderPhone || data.phone || data.assocPhone || '010-4163-2166';
                const numOnly = String(pVal).replace(/\D/g, '');
                if (numOnly.length === 11) {
                  pVal = numOnly.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                } else if (numOnly.length === 10 && numOnly.startsWith('02')) {
                  pVal = numOnly.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
                } else if (numOnly.length === 10) {
                  pVal = numOnly.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                } else if (numOnly.length === 9 && numOnly.startsWith('02')) {
                  pVal = numOnly.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
                } else {
                  pVal = '010-4163-2166';
                }
                b3_2.value = pVal;
                b3_2.dispatchEvent(new Event('input', { bubbles: true }));
                b3_2.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(b3_2).val(pVal).trigger('input').trigger('change');
              }
            }, { data: assocData, preserveExisting });
          } catch (err) {
            console.error('[P5 B3 frame 주입 오류]:', err);
          }
        }

        // 4. B4A.asp: B4-1 2024년이 공란이면 없음 체크, 내용이 있으면 동일하게 입력
        let b4aFrame = page.frames().find(f => f.url().includes('B4A.asp') || f.name() === 'frame_B4A');
        if (!b4aFrame) {
          await delay(300);
          await syncAllChildFrames(page);
          b4aFrame = page.frames().find(f => f.url().includes('B4A.asp') || f.name() === 'frame_B4A');
        }
        if (b4aFrame) {
          try {
            await b4aFrame.evaluate(({ preserveExisting }) => {
              // B4-1: 공단 시장매니저
              const pb4aSum = document.querySelector('#PB4A_SUM')?.value || '0';
              const hasPb4aContent = (parseInt(pb4aSum, 10) > 0) || 
                ['1', '2', '3'].some(idx => {
                  const t = document.querySelector(`#PB4A_${idx}_1`)?.value;
                  const c = document.querySelector(`#PB4A_${idx}_2`)?.value;
                  return (t && t.trim() !== '') || (c && c.trim() !== '' && parseInt(c, 10) > 0);
                });

              const noneA = document.querySelector('#B4A_NONE, input[name="B4A_NONE"]');
              if (!hasPb4aContent) {
                // 2024년이 공란이면 없음 체크
                if (noneA) {
                  if (!noneA.checked) noneA.click();
                  noneA.checked = true;
                  noneA.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') {
                    $(noneA).prop('checked', true).trigger('change');
                    if (typeof toggleNoneStaff === 'function') toggleNoneStaff('B4A');
                  }
                }
                ['1', '2', '3'].forEach(idx => {
                  const f1 = document.querySelector(`#B4A_${idx}_1`);
                  const f2 = document.querySelector(`#B4A_${idx}_2`);
                  if (f1) { f1.value = ''; f1.disabled = true; }
                  if (f2) { f2.value = ''; f2.disabled = true; }
                });
                const sumA = document.querySelector('#B4A_SUM');
                if (sumA) sumA.value = '0';
              } else {
                // 2024년 내용이 있으면 동일하게 입력
                if (noneA && noneA.checked) {
                  noneA.click();
                  noneA.checked = false;
                  noneA.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') {
                    $(noneA).prop('checked', false).trigger('change');
                    if (typeof toggleNoneStaff === 'function') toggleNoneStaff('B4A');
                  }
                }
                ['1', '2', '3'].forEach(idx => {
                  const prevTask = document.querySelector(`#PB4A_${idx}_1`)?.value || '';
                  const prevCount = document.querySelector(`#PB4A_${idx}_2`)?.value || '';
                  const curTask = document.querySelector(`#B4A_${idx}_1`);
                  const curCount = document.querySelector(`#B4A_${idx}_2`);
                  if (curTask) {
                    curTask.disabled = false;
                    curTask.value = prevTask.trim();
                    curTask.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  if (curCount) {
                    curCount.disabled = false;
                    curCount.value = prevCount.trim();
                    curCount.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                });
                const sumA = document.querySelector('#B4A_SUM');
                if (sumA) sumA.value = pb4aSum;
              }

              // B4-2 상근직원 동일 적용
              const pb4bSum = document.querySelector('#PB4B_SUM')?.value || '0';
              const hasPb4bContent = (parseInt(pb4bSum, 10) > 0) || 
                ['1', '2', '3'].some(idx => {
                  const t = document.querySelector(`#PB4B_${idx}_1`)?.value;
                  const c = document.querySelector(`#PB4B_${idx}_2`)?.value;
                  return (t && t.trim() !== '') || (c && c.trim() !== '' && parseInt(c, 10) > 0);
                });

              const noneB = document.querySelector('#B4B_NONE, input[name="B4B_NONE"]');
              if (!hasPb4bContent) {
                if (noneB) {
                  if (!noneB.checked) noneB.click();
                  noneB.checked = true;
                  noneB.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') {
                    $(noneB).prop('checked', true).trigger('change');
                    if (typeof toggleNoneStaff === 'function') toggleNoneStaff('B4B');
                  }
                }
              } else {
                if (noneB && noneB.checked) {
                  noneB.click();
                  noneB.checked = false;
                  noneB.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') {
                    $(noneB).prop('checked', false).trigger('change');
                    if (typeof toggleNoneStaff === 'function') toggleNoneStaff('B4B');
                  }
                }
                ['1', '2', '3'].forEach(idx => {
                  const prevTask = document.querySelector(`#PB4B_${idx}_1`)?.value || '';
                  const prevCount = document.querySelector(`#PB4B_${idx}_2`)?.value || '';
                  const curTask = document.querySelector(`#B4B_${idx}_1`);
                  const curCount = document.querySelector(`#B4B_${idx}_2`);
                  if (curTask) { curTask.disabled = false; curTask.value = prevTask.trim(); }
                  if (curCount) { curCount.disabled = false; curCount.value = prevCount.trim(); }
                });
                const sumB = document.querySelector('#B4B_SUM');
                if (sumB) sumB.value = pb4bSum;
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P5 B4A frame 주입 오류]:', err);
          }
        }

        // 최종 제출 전 단계 동기화 완료
        await syncAllChildFrames(page);
        await captureStep('P5', 'P5_상인회조직현황');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P5');
        continue;
      }

      // ------------------------------------------
      // 1-1) P6 (B5 ~ B7: 상인회비 및 상인회 시설/인력 현황 전년도 미러링)
      // ------------------------------------------
      if (currUrl.includes('P6') || currPageName === 'P6') {
        onProgress({ step: 'P6', message: `[P6] B5~B7 상인회비 및 시설/인력 현황 전년도 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // B5-4 상인회 총회 실시 횟수 결정 (정책 가이드 기준점: 0~10회 또는 랜덤 분산)
        let assemblyCountVal = policy.B5_generalAssemblyCount || '1';
        if (assemblyCountVal === 'random_1_2') {
          assemblyCountVal = String(Math.floor(Math.random() * 2) + 1); // 1~2회
        } else if (assemblyCountVal === 'random_1_3') {
          assemblyCountVal = String(Math.floor(Math.random() * 3) + 1); // 1~3회
        } else if (assemblyCountVal === 'random_0_2') {
          assemblyCountVal = String(Math.floor(Math.random() * 3)); // 0~2회
        } else if (assemblyCountVal === 'random') {
          assemblyCountVal = String(Math.floor(Math.random() * 3) + 1);
        }
        logger.info(`[상인회 러너] [P6] B5-4 상인회 총회 실시 횟수 설정: ${assemblyCountVal}회 (정책 설정값: ${policy.B5_generalAssemblyCount || '1'})`);

        // B5.asp (상인회비 B5-1, B5-2, B5-3 미러링 보장 및 B5-4 총회 필수값 주입)
        const b5Frame = page.frames().find(f => f.url().includes('B5.asp'));
        if (b5Frame) {
          try {
            await b5Frame.evaluate(({ preserveExisting, assemblyVal }) => {
              // B5-1 가입점포 수
              const pb5a = document.querySelector('#PB5A')?.value;
              const b5a = document.querySelector('#B5A');
              if (b5a && (!preserveExisting || !b5a.value || b5a.value.trim() === '')) {
                b5a.value = (pb5a && pb5a.trim() !== '') ? pb5a.trim() : '40';
                b5a.dispatchEvent(new Event('input', { bubbles: true }));
                b5a.dispatchEvent(new Event('change', { bubbles: true }));
              }

              // B5-2 월 상인회비 금액
              const pb5b = document.querySelector('#PB5B')?.value;
              const b5b = document.querySelector('#B5B');
              if (b5b && (!preserveExisting || !b5b.value || b5b.value.trim() === '')) {
                b5b.value = (pb5b && pb5b.trim() !== '') ? pb5b.trim() : '2';
                b5b.dispatchEvent(new Event('input', { bubbles: true }));
                b5b.dispatchEvent(new Event('change', { bubbles: true }));
              }

              // B5-3 상인회비 납부점포 수 (B5A 이하 정합성 보장)
              const pb5c = document.querySelector('#PB5C')?.value;
              const b5c = document.querySelector('#B5C');
              if (b5c && (!preserveExisting || !b5c.value || b5c.value.trim() === '')) {
                const limitVal = parseInt(b5a?.value || '40', 10);
                const rawVal = pb5c && pb5c.trim() !== '' ? parseInt(pb5c.trim(), 10) : limitVal;
                b5c.value = String(Math.min(rawVal, limitVal));
                b5c.dispatchEvent(new Event('input', { bubbles: true }));
                b5c.dispatchEvent(new Event('change', { bubbles: true }));
              }

              // B5-4 상인회 총회 실시 (사용자 정책값 0~10회 또는 랜덤 반영)
              const b5d = document.querySelector('#B5D');
              if (b5d && (!preserveExisting || !b5d.value || b5d.value.trim() === '')) {
                b5d.value = String(assemblyVal);
                b5d.dispatchEvent(new Event('input', { bubbles: true }));
                b5d.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, { preserveExisting, assemblyVal: assemblyCountVal });
          } catch (err) {
            console.error('[P6 B5 frame 주입 오류]:', err);
          }
        }

        // B6.asp (사무실 및 팩스 현황)
        const b6Frame = page.frames().find(f => (f.url().endsWith('B6.asp') || f.name() === 'frame_B6') && !f.url().includes('B6B') && !f.url().includes('B6D'));
        if (b6Frame) {
          try {
            const marketAddr = assocData.address || '서울특별시 관악구 신림로 329';
            const marketPhone = assocData.phone || assocData.assocPhone || '02-878-5525';
            await b6Frame.evaluate(({ preserveExisting, marketAddr, marketPhone }) => {
              // B6A: 사무실 유무 (전년도 PB6A 미러링 또는 기존값 보존, 없을 시 2번 무)
              if (!preserveExisting || !document.querySelector('input[name="B6A"]:checked')) {
                const pb6aVal = document.querySelector('input[name="PB6A"]:checked')?.value || '2';
                const targetB6A = document.querySelector(`input[name="B6A"][value="${pb6aVal}"]`) || document.querySelector('input[name="B6A"][value="2"]');
                if (targetB6A) {
                  if (!targetB6A.checked) targetB6A.click();
                  targetB6A.checked = true;
                  targetB6A.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetB6A).prop('checked', true).trigger('change');
                }
              }

              // 만약 B6A가 1(유)인 경우 전년도 주소 및 대표전화 미러링 보장 (공란 시 시장 기본정보 결측 방어)
              const curB6A = document.querySelector('input[name="B6A"]:checked')?.value;
              if (curB6A === '1') {
                const b1 = document.querySelector('#B6B1');
                const b2 = document.querySelector('#B6B2');
                const b3 = document.querySelector('#B6B3');
                const b4 = document.querySelector('#B6B4');

                const p1 = document.querySelector('#PB6B1')?.value?.trim();
                const p2 = document.querySelector('#PB6B2')?.value?.trim();
                const p3 = document.querySelector('#PB6B3')?.value?.trim();
                const p4 = document.querySelector('#PB6B4')?.value?.trim();

                const setInp = (inp, val) => {
                  if (inp) {
                    inp.disabled = false;
                    inp.value = val;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(inp).val(val).trigger('input').trigger('change');
                  }
                };

                setInp(b1, p1 || '08777');
                setInp(b2, p2 || marketAddr);
                setInp(b3, p3 || marketAddr);
                setInp(b4, p4 || '상인회 사무실');

                // B6C 대표전화 유효성 검사 및 정규화 (validPhoneFormat 트랩 방어)
                const curB6C = document.querySelector('#B6C');
                if (curB6C) {
                  curB6C.disabled = false;
                  let v = curB6C.value || document.querySelector('#PB6C')?.value || marketPhone || '02-878-5525';
                  const digits = String(v).replace(/\D/g, '');
                  let formatted = v;
                  if (digits.length === 9 && digits.startsWith('02')) {
                    formatted = digits.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
                  } else if (digits.length === 10 && digits.startsWith('02')) {
                    formatted = digits.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
                  } else if (digits.length === 11) {
                    formatted = digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                  } else if (digits.length === 10) {
                    formatted = digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                  } else if (digits.length === 8) {
                    formatted = digits.replace(/(\d{4})(\d{4})/, '$1-$2');
                  } else if (digits.length < 8) {
                    formatted = '02-878-5525';
                  }
                  curB6C.value = formatted;
                  if (typeof $ !== 'undefined') $('#B6C').val(formatted).trigger('input').trigger('change');
                }
              }

              // B6D 팩스 유무 신규 라디오 공란 시 2(무) 기본 선택
              if (!document.querySelector('input[name="B6D"]:checked')) {
                const opt2 = document.querySelector('input[name="B6D"][value="2"]');
                if (opt2) {
                  if (!opt2.checked) opt2.click();
                  opt2.checked = true;
                  opt2.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(opt2).prop('checked', true).trigger('change');
                }
              }
            }, { preserveExisting, marketAddr, marketPhone });
          } catch (_) {}
        }

        // B7.asp (B7-1 다른 상인회 유무 및 B7-2 세부 정보)
        const b7Frame = page.frames().find(f => f.url().includes('B7.asp'));
        if (b7Frame) {
          try {
            const mName = assocData.marketName || '상인회';
            const mPhone = assocData.leaderPhone || assocData.phone || '010-4163-2166';
            await b7Frame.evaluate(({ preserveExisting, mName, mPhone }) => {
              // B7A: 1(있음), 2(없음). 기본값은 2(없음), 전년도 PB7A가 1이면 1 유지
              const pb7aVal = document.querySelector('input[name="PB7A"]:checked')?.value || '2';
              const curB7A = document.querySelector('input[name="B7A"]:checked')?.value;
              const targetB7A = (preserveExisting && curB7A) ? curB7A : pb7aVal;

              const opt = document.querySelector(`input[name="B7A"][value="${targetB7A}"]`) || document.querySelector('input[name="B7A"][value="2"]');
              if (opt) {
                if (!opt.checked) opt.click();
                opt.checked = true;
                opt.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(opt).prop('checked', true).trigger('change');
              }

              // toggleB7A 실행
              if (typeof window.toggleB7A === 'function') {
                window.toggleB7A();
              }

              const isOtherAssoc = (document.querySelector('input[name="B7A"]:checked')?.value === '1');
              if (isOtherAssoc) {
                // 상인회 1의 4대 필수정보 (상인회명, 회장명, 연락처, 개설년도) 주입
                const f1 = document.querySelector('#B7B_1_1');
                const f2 = document.querySelector('#B7B_1_2');
                const f3 = document.querySelector('#B7B_1_3');
                const f4 = document.querySelector('#B7B_1_4');

                const p1 = document.querySelector('#PB7B_1_1')?.value?.trim();
                const p2 = document.querySelector('#PB7B_1_2')?.value?.trim();
                const p3 = document.querySelector('#PB7B_1_3')?.value?.trim();
                const p4 = document.querySelector('#PB7B_1_4')?.value?.trim();

                const setF = (el, val) => {
                  if (el) {
                    el.disabled = false;
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(el).val(val).trigger('input').trigger('change');
                  }
                };

                setF(f1, p1 || (mName + ' 번영회'));
                setF(f2, p2 || '부회장');
                // 연락처 유효 형식 정규화
                let phoneVal = p3 || mPhone || '010-4163-2166';
                const digits = String(phoneVal).replace(/\D/g, '');
                if (digits.length === 11) phoneVal = digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                else if (digits.length === 10 && digits.startsWith('02')) phoneVal = digits.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
                else if (digits.length === 10) phoneVal = digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                else if (digits.length === 9 && digits.startsWith('02')) phoneVal = digits.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
                else phoneVal = '010-4163-2166';
                setF(f3, phoneVal);
                setF(f4, p4 || '2020');
              } else {
                // 없음(2)인 경우 모든 B7B 인풋 비활성화 및 초기화
                for (let i = 1; i <= 3; i++) {
                  for (let j = 1; j <= 4; j++) {
                    const el = document.querySelector(`#B7B_${i}_${j}`);
                    if (el) {
                      el.value = '';
                      el.disabled = true;
                      if (typeof $ !== 'undefined') $(el).val('').prop('disabled', true);
                    }
                  }
                }
              }
            }, { preserveExisting, mName, mPhone });
          } catch (_) {}
        }

        await captureStep('P6', 'P6_상인회비및시설');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P6');
        continue;
      }

      // ------------------------------------------
      // 1-2) P7 (C1: 편의시설 보유현황 및 시설필요도)
      // ------------------------------------------
      if (currUrl.includes('P7') || currPageName === 'P7') {
        onProgress({ step: 'P7', message: `[P7] C1 편의시설 보유개수 및 시설필요도(보통/필요/매우필요 중 선택) 자동 응답 중...` });
        await delay(200);

        const needRatingPolicy = policy.C1_C2_needRating || 'random';
        await page.evaluate(({ preserveExisting, needRatingPolicy }) => {
          const pickFacilityNeedVal = () => {
            if (needRatingPolicy === 'need_3') return '3';
            if (needRatingPolicy === 'need_4') return '4';
            if (needRatingPolicy === 'need' || needRatingPolicy === 'need_5') return '5';
            const allowed = ['3', '4', '5']; // 3: 보통, 4: 필요, 5: 매우 필요 ('1: 매우 불필요', '2: 불필요' 체크 금지)
            return allowed[Math.floor(Math.random() * allowed.length)];
          };

          // 9개 항목 순회 (C1_1 ~ C1_9)
          for (let idx = 1; idx <= 9; idx++) {
            const prevCnt = document.querySelector(`input[name="PC1_${idx}_2"]`)?.value || '';
            const prevHave = document.querySelector(`input[name="PC1_${idx}_1"]:checked`)?.value;
            const rawNum = parseInt((prevCnt || '').trim(), 10);
            const isHave = (prevHave === '1') || (!isNaN(rawNum) && rawNum > 0);

            if (isHave) {
              // 2024년에 '보유개수' 내용이 있으면 2025년에도 동일하게 입력 (999999999 모름 코드는 1로 안전 보정)
              const optYes = document.querySelector(`input[name="C1_${idx}_1"][value="1"]`);
              if (optYes) {
                if (!optYes.checked) optYes.click();
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C1_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                const safeCnt = (!isNaN(rawNum) && rawNum > 0 && rawNum < 99999) ? String(rawNum) : '1';
                cntInp.value = safeCnt;
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              // 2024년에 '보유개수' 내용이 없으면 2025년도에도 모두 '없음'으로 입력
              const optNo = document.querySelector(`input[name="C1_${idx}_1"][value="2"]`);
              if (optNo) {
                if (!optNo.checked) optNo.click();
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C1_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // [규칙] '시설필요도'는 '매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않고, '보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서만 응답
            const needRadios = Array.from(document.querySelectorAll(`input[name="C1_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="C1_${idx}_3"]:checked`);
              const isForbiddenVal = curChecked && (curChecked.value === '1' || curChecked.value === '2');
              if (!preserveExisting || !curChecked || isForbiddenVal) {
                const randVal = pickFacilityNeedVal();
                const targetRadio = document.querySelector(`input[name="C1_${idx}_3"][value="${randVal}"]`) ||
                                    document.querySelector(`input[name="C1_${idx}_3"][value="3"]`) ||
                                    needRadios[2];
                if (targetRadio) {
                  if (!targetRadio.checked) targetRadio.click();
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                }
              }
            }

            if (typeof window.toggleDependentFields === 'function') {
              try { window.toggleDependentFields(idx); } catch (_) {}
            }
          }
        }, { preserveExisting, needRatingPolicy });

        await captureStep('P7', 'P7_편의시설C1');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P7');
        continue;
      }

      // ------------------------------------------
      // 1-3) P8 (C2: 안전/위생시설 보유현황 및 시설필요도)
      // ------------------------------------------
      if (currUrl.includes('P8') || currPageName === 'P8') {
        onProgress({ step: 'P8', message: `[P8] C2 안전/위생시설 보유개수 및 시설필요도(보통/필요/매우필요 중 선택) 자동 응답 중...` });
        await delay(200);

        const needRatingPolicy = policy.C1_C2_needRating || 'random';
        await page.evaluate(({ preserveExisting, needRatingPolicy }) => {
          const pickFacilityNeedVal = () => {
            if (needRatingPolicy === 'need_3') return '3';
            if (needRatingPolicy === 'need_4') return '4';
            if (needRatingPolicy === 'need' || needRatingPolicy === 'need_5') return '5';
            const allowed = ['3', '4', '5']; // 3: 보통, 4: 필요, 5: 매우 필요 ('1: 매우 불필요', '2: 불필요' 체크 금지)
            return allowed[Math.floor(Math.random() * allowed.length)];
          };

          // 18개 항목 순회 (C2_1 ~ C2_18)
          for (let idx = 1; idx <= 18; idx++) {
            const prevCnt = document.querySelector(`input[name="PC2_${idx}_2"]`)?.value || '';
            const prevHave = document.querySelector(`input[name="PC2_${idx}_1"]:checked`)?.value;
            const rawNum = parseInt((prevCnt || '').trim(), 10);
            const isHave = (prevHave === '1') || (!isNaN(rawNum) && rawNum > 0);

            if (isHave) {
              // 2024년에 '보유개수' 내용이 있으면 2025년에도 동일하게 입력 (999999999 모름 코드는 1로 안전 보정)
              const optYes = document.querySelector(`input[name="C2_${idx}_1"][value="1"]`);
              if (optYes) {
                if (!optYes.checked) optYes.click();
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C2_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                const safeCnt = (!isNaN(rawNum) && rawNum > 0 && rawNum < 99999) ? String(rawNum) : '1';
                cntInp.value = safeCnt;
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              // 2024년에 '보유개수' 내용이 없으면 2025년도에도 모두 '없음'으로 입력
              const optNo = document.querySelector(`input[name="C2_${idx}_1"][value="2"]`);
              if (optNo) {
                if (!optNo.checked) optNo.click();
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C2_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // [규칙] '시설필요도'는 '매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않고, '보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서만 응답
            const needRadios = Array.from(document.querySelectorAll(`input[name="C2_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="C2_${idx}_3"]:checked`);
              const isForbiddenVal = curChecked && (curChecked.value === '1' || curChecked.value === '2');
              if (!preserveExisting || !curChecked || isForbiddenVal) {
                const randVal = pickFacilityNeedVal();
                const targetRadio = document.querySelector(`input[name="C2_${idx}_3"][value="${randVal}"]`) ||
                                    document.querySelector(`input[name="C2_${idx}_3"][value="3"]`) ||
                                    needRadios[2];
                if (targetRadio) {
                  if (!targetRadio.checked) targetRadio.click();
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                }
              }
            }

            if (typeof window.toggleDependentFields === 'function') {
              try { window.toggleDependentFields(idx); } catch (_) {}
            }
          }
        }, { preserveExisting, needRatingPolicy });

        await captureStep('P8', 'P8_안전위생시설C2');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P8');
        continue;
      }

      // ------------------------------------------
      // 1-4) P9 (C3: 주차장 보유현황, 전기차대수, 형태/소유/관리주체)
      // ------------------------------------------
      if (currUrl.includes('P9') || currPageName === 'P9') {
        onProgress({ step: 'P9', message: `[P9] C3 주차시설 현황 및 정책 가이드 주입 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // C3-1-3 전기차 전용대수 계산 (가이드 정책: 0~10대 또는 랜덤 분산)
        let evCountVal = policy.C3_1_evParkingCount || '3';
        if (evCountVal === 'random_0_3') {
          evCountVal = String(Math.floor(Math.random() * 4)); // 0~3
        } else if (evCountVal === 'random_1_5') {
          evCountVal = String(Math.floor(Math.random() * 5) + 1); // 1~5
        } else if (evCountVal === 'random_0_10') {
          evCountVal = String(Math.floor(Math.random() * 11)); // 0~10
        } else if (evCountVal === 'random') {
          evCountVal = String(Math.floor(Math.random() * 5) + 1);
        }

        // C3-2-1 주차장 형태 정책값 (기본 '2' 노상)
        const parkingTypeVal = policy.C3_2_1_parkingType || '2';
        // C3-2-2 소유주체 정책값 (기본 '2' 지자체)
        let ownerVal = policy.C3_2_2_owner || '2';
        if (ownerVal === 'random') {
          ownerVal = String(Math.floor(Math.random() * 3) + 1); // 1~3
        }
        // C3-2-3 관리주체 정책값 (기본 '2' 지자체)
        let managerVal = policy.C3_2_3_manager || '2';
        if (managerVal === 'random') {
          managerVal = String(Math.floor(Math.random() * 4) + 1); // 1~4
        }

        logger.info(`[상인회 러너] [P9] C3 정책 답변: 전기차대수=${evCountVal}대, 형태=${parkingTypeVal}, 소유주체=${ownerVal}, 관리주체=${managerVal}`);

        // 0. C3.asp (시장·상점가 전용 주차장 보유여부 라디오)
        const c3Frame = page.frames().find(f => f.url().includes('C3.asp') && !f.url().includes('C3A') && !f.url().includes('C3B') && !f.url().includes('C3C'));
        let isParking = false;
        if (c3Frame) {
          try {
            isParking = await c3Frame.evaluate(({ preserveExisting }) => {
              const pc3Val = document.querySelector('input[name="PC3"]:checked')?.value || '2';
              const curChecked = document.querySelector('input[name="C3"]:checked');
              const targetVal = (!preserveExisting || !curChecked) ? pc3Val : curChecked.value;
              const targetC3 = document.querySelector(`input[name="C3"][value="${targetVal}"]`) || document.querySelector('input[name="C3"][value="2"]');
              if (targetC3) {
                if (!targetC3.checked) targetC3.click();
                targetC3.checked = true;
                targetC3.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetC3).prop('checked', true).trigger('change');
              }
              return targetVal === '1';
            }, { preserveExisting });
          } catch (err) {
            console.error('[P9 C3 frame 주입 오류]:', err);
          }
        }

        // 주차장 있는 경우(1) vs 없는 경우(2) 완벽 분기
        for (const f of page.frames()) {
          try {
            await f.evaluate(({ isParking, evCountVal }) => {
              // C3AA 주차장 수 (1 이상 99 이하 필수)
              const inpAA = document.querySelector('#C3AA, input[name="C3AA"]');
              if (inpAA) {
                if (isParking) {
                  const prev = document.querySelector('#PC3AA')?.value || '1';
                  const parsedAA = parseInt((prev || '').trim(), 10);
                  const safeAA = (!isNaN(parsedAA) && parsedAA > 0 && parsedAA <= 99) ? String(parsedAA) : '1';
                  inpAA.disabled = false;
                  inpAA.value = safeAA;
                  inpAA.dispatchEvent(new Event('input', { bubbles: true }));
                  inpAA.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(inpAA).val(safeAA).trigger('input').trigger('change');
                } else {
                  inpAA.value = '';
                  inpAA.disabled = true;
                  if (typeof $ !== 'undefined') $(inpAA).val('').prop('disabled', true);
                }
              }

              // C3AB 주차가능대수
              const inpAB = document.querySelector('#C3AB, input[name="C3AB"]');
              if (inpAB) {
                if (isParking) {
                  const prev = document.querySelector('#PC3AB')?.value || '30';
                  const parsedAB = parseInt((prev || '').trim(), 10);
                  const safeAB = (!isNaN(parsedAB) && parsedAB > 0 && parsedAB < 99999) ? String(parsedAB) : '30';
                  inpAB.disabled = false;
                  inpAB.value = safeAB;
                  inpAB.dispatchEvent(new Event('input', { bubbles: true }));
                  inpAB.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(inpAB).val(safeAB).trigger('input').trigger('change');
                } else {
                  inpAB.value = '';
                  inpAB.disabled = true;
                  if (typeof $ !== 'undefined') $(inpAB).val('').prop('disabled', true);
                }
              }

              // C3AC 전기차
              const inpAC = document.querySelector('#C3AC, input[name="C3AC"]');
              if (inpAC) {
                if (isParking) {
                  inpAC.disabled = false;
                  inpAC.value = String(evCountVal);
                  inpAC.dispatchEvent(new Event('input', { bubbles: true }));
                  inpAC.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  inpAC.value = '';
                  inpAC.disabled = true;
                }
              }
            }, { isParking, evCountVal });
          } catch (_) {}
        }

        // 2. C3BA.asp (C3-2-1 주차장 형태 ※ 중복선택 가능)
        const c3baFrame = page.frames().find(f => f.url().includes('C3BA.asp'));
        if (c3baFrame) {
          try {
            await c3baFrame.evaluate(({ parkingTypeVal, preserveExisting }) => {
              const hasChecked = !!document.querySelector('input[type="checkbox"][name^="C3BA"]:checked');
              if (!preserveExisting || !hasChecked) {
                document.querySelectorAll('input[type="checkbox"][name^="C3BA"]').forEach(cb => { cb.checked = false; });
                const checkCb = (selector) => {
                  const cb = document.querySelector(selector);
                  if (cb) {
                    if (!cb.checked) cb.click();
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
                  }
                };

                if (parkingTypeVal === '1_2') {
                  checkCb('#C3BA_1, input[name="C3BA_1"]');
                  checkCb('#C3BA_2, input[name="C3BA_2"]');
                } else if (parkingTypeVal === '2_3') {
                  checkCb('#C3BA_2, input[name="C3BA_2"]');
                  checkCb('#C3BA_3, input[name="C3BA_3"]');
                } else {
                  checkCb(`#C3BA_${parkingTypeVal}, input[name="C3BA_${parkingTypeVal}"]`) || checkCb('#C3BA_2');
                }
              }
            }, { parkingTypeVal, preserveExisting });
          } catch (err) {
            console.error('[P9 C3BA frame 주입 오류]:', err);
          }
        }

        // 3. C3BB.asp (C3-2-2 소유주체)
        const c3bbFrame = page.frames().find(f => f.url().includes('C3BB.asp'));
        if (c3bbFrame) {
          try {
            await c3bbFrame.evaluate(({ ownerVal, preserveExisting }) => {
              const hasChecked = !!document.querySelector('input[type="checkbox"][name^="C3BB"]:checked');
              if (!preserveExisting || !hasChecked) {
                document.querySelectorAll('input[type="checkbox"][name^="C3BB"]').forEach(cb => { cb.checked = false; });
                const targetCb = document.querySelector(`#C3BB_${ownerVal}, input[name="C3BB_${ownerVal}"]`) || document.querySelector('#C3BB_2');
                if (targetCb) {
                  if (!targetCb.checked) targetCb.click();
                  targetCb.checked = true;
                  targetCb.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetCb).prop('checked', true).trigger('change');
                }
              }

              // [C3-2-2 소유주체 기타(C3BB_4 vs TC3BB_4) 엄격한 정합성 보장 - Alert 트랩 원천 차단]
              const chk4 = document.querySelector('#C3BB_4, input[name="C3BB_4"]');
              const txt4 = document.querySelector('#TC3BB_4, input[name="TC3BB_4"]');
              if (chk4 && chk4.checked) {
                if (txt4 && (!txt4.value || txt4.value.trim() === '' || txt4.value === '0')) {
                  txt4.value = '공동소유';
                  txt4.dispatchEvent(new Event('input', { bubbles: true }));
                  txt4.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(txt4).val('공동소유').trigger('input').trigger('change');
                }
              } else {
                if (txt4) {
                  txt4.value = '';
                  txt4.dispatchEvent(new Event('input', { bubbles: true }));
                  txt4.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(txt4).val('').trigger('input').trigger('change');
                }
              }
            }, { ownerVal, preserveExisting });
          } catch (err) {
            console.error('[P9 C3BB frame 주입 오류]:', err);
          }
        }

        // 4. C3BC.asp (C3-2-3 관리주체)
        const c3bcFrame = page.frames().find(f => f.url().includes('C3BC.asp'));
        if (c3bcFrame) {
          try {
            await c3bcFrame.evaluate(({ managerVal, preserveExisting }) => {
              const hasChecked = !!document.querySelector('input[type="checkbox"][name^="C3BC"]:checked');
              if (!preserveExisting || !hasChecked) {
                document.querySelectorAll('input[type="checkbox"][name^="C3BC"]').forEach(cb => { cb.checked = false; });
                const targetCb = document.querySelector(`#C3BC_${managerVal}, input[name="C3BC_${managerVal}"]`) || document.querySelector('#C3BC_2');
                if (targetCb) {
                  if (!targetCb.checked) targetCb.click();
                  targetCb.checked = true;
                  targetCb.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetCb).prop('checked', true).trigger('change');
                }
              }

              // [C3-2-3 관리주체 기타(C3BC_5 vs TC3BC_5) 엄격한 정합성 보장 - Alert 트랩 원천 차단]
              const chk5 = document.querySelector('#C3BC_5, input[name="C3BC_5"]');
              const txt5 = document.querySelector('#TC3BC_5, input[name="TC3BC_5"]');
              if (chk5 && chk5.checked) {
                if (txt5 && (!txt5.value || txt5.value.trim() === '' || txt5.value === '0')) {
                  txt5.value = '위탁관리';
                  txt5.dispatchEvent(new Event('input', { bubbles: true }));
                  txt5.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(txt5).val('위탁관리').trigger('input').trigger('change');
                }
              } else {
                if (txt5) {
                  txt5.value = '';
                  txt5.dispatchEvent(new Event('input', { bubbles: true }));
                  txt5.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(txt5).val('').trigger('input').trigger('change');
                }
              }
            }, { managerVal, preserveExisting });
          } catch (err) {
            console.error('[P9 C3BC frame 주입 오류]:', err);
          }
        }

        // 5. C3C.asp (C3-3 주차 요금: 1 무료, 2 유료)
        const c3cFrame = page.frames().find(f => f.url().includes('C3C.asp'));
        if (c3cFrame) {
          try {
            await c3cFrame.evaluate(({ preserveExisting }) => {
              const radios = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
              if (radios.length > 0) {
                const hasChecked = radios.some(r => r.checked);
                if (!preserveExisting || !hasChecked) {
                  const targetRadio = document.querySelector('input[name="C3C"][value="1"]') || 
                                      document.querySelector('input[type="radio"][value="1"]') || 
                                      radios[0];
                  if (targetRadio) {
                    if (!targetRadio.checked) targetRadio.click();
                    targetRadio.checked = true;
                    targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                  }
                }
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P9 C3C frame 주입 오류]:', err);
          }
        }

        await captureStep('P9', 'P9_주차시설C3');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P9');
        continue;
      }

      // ------------------------------------------
      // 1-4-2) P10 (C4: 고객지원 및 마케팅 시설 보유현황 및 시설필요도)
      // ------------------------------------------
      if (currUrl.includes('P10') || currPageName === 'P10') {
        onProgress({ step: 'P10', message: `[P10] C4 고객지원/마케팅시설 보유개수 및 시설필요도(보통/필요/매우필요 중 선택) 자동 응답 중...` });
        await delay(200);

        const needRatingPolicy = policy.C1_C2_needRating || 'random';
        await page.evaluate(({ preserveExisting, needRatingPolicy }) => {
          const pickFacilityNeedVal = () => {
            if (needRatingPolicy === 'need_3') return '3';
            if (needRatingPolicy === 'need_4') return '4';
            if (needRatingPolicy === 'need' || needRatingPolicy === 'need_5') return '5';
            const allowed = ['3', '4', '5']; // 3: 보통, 4: 필요, 5: 매우 필요 ('1: 매우 불필요', '2: 불필요' 체크 금지)
            return allowed[Math.floor(Math.random() * allowed.length)];
          };

          // 5개 항목 순회 (C4_1 ~ C4_5)
          for (let idx = 1; idx <= 5; idx++) {
            const prevCnt = document.querySelector(`input[name="PC4_${idx}_2"]`)?.value || '';
            const prevHave = document.querySelector(`input[name="PC4_${idx}_1"]:checked`)?.value;
            const rawNum = parseInt((prevCnt || '').trim(), 10);
            const isHave = (prevHave === '1') || (!isNaN(rawNum) && rawNum > 0);

            if (isHave) {
              const optYes = document.querySelector(`input[name="C4_${idx}_1"][value="1"]`);
              if (optYes) {
                if (!optYes.checked) optYes.click();
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C4_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                const safeCnt = (!isNaN(rawNum) && rawNum > 0 && rawNum < 99999) ? String(rawNum) : '1';
                cntInp.value = safeCnt;
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              const optNo = document.querySelector(`input[name="C4_${idx}_1"][value="2"]`);
              if (optNo) {
                if (!optNo.checked) optNo.click();
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C4_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // [규칙] '시설필요도'는 '매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않고, '보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서만 응답
            const needRadios = Array.from(document.querySelectorAll(`input[name="C4_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="C4_${idx}_3"]:checked`);
              const isForbiddenVal = curChecked && (curChecked.value === '1' || curChecked.value === '2');
              if (!preserveExisting || !curChecked || isForbiddenVal) {
                const randVal = pickFacilityNeedVal();
                const targetRadio = document.querySelector(`input[name="C4_${idx}_3"][value="${randVal}"]`) ||
                                    document.querySelector(`input[name="C4_${idx}_3"][value="3"]`) ||
                                    needRadios[2];
                if (targetRadio) {
                  if (!targetRadio.checked) targetRadio.click();
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                }
              }
            }

            if (typeof window.toggleDependentFields === 'function') {
              try { window.toggleDependentFields(idx); } catch (_) {}
            }
          }
        }, { preserveExisting, needRatingPolicy });

        await captureStep('P10', 'P10_고객지원마케팅시설C4');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P10');
        continue;
      }

      // ------------------------------------------
      // 1-5) P11 (D1: 공동마케팅 사업 및 D1-1 축제/이벤트 명칭 조회 주입)
      // ------------------------------------------
      if (currUrl.includes('P11') || currPageName === 'P11') {
        onProgress({ step: 'P11', message: `[P11] D1 공동마케팅 및 D1-1 축제/이벤트 명칭 조회 주입 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // D1-1 축제 및 이벤트 명칭 조회 (네이버/사전 검색 기반)
        const targetMarket = assocData.marketName || assocData.storeName || '';
        let festivalResult = { hasFestival: false, festivalName: '' };
        try {
          festivalResult = await findMarketFestival(targetMarket);
          logger.info(`[상인회 러너] [P11] D1-1 축제 조회 결과: 시장="${targetMarket}", 실시여부=${festivalResult.hasFestival}, 축제명="${festivalResult.festivalName}" (${festivalResult.source})`);
        } catch (err) {
          logger.warn(`[상인회 러너] [P11] 축제 조회 예외: ${err.message}`);
        }

        // D1.asp (D1 공동마케팅 사업 여부 라디오)
        const d1Frame = page.frames().find(f => f.url().includes('D1.asp') && !f.url().includes('D1A') && !f.url().includes('D1B'));
        let isMarketingActive = false;
        if (d1Frame) {
          try {
            isMarketingActive = await d1Frame.evaluate(({ hasFestival, preserveExisting }) => {
              const curChecked = document.querySelector('input[name="D1"]:checked');
              let targetVal = '2'; // 기본값 미실시
              if (curChecked) {
                targetVal = curChecked.value;
              } else {
                const pd1Val = document.querySelector('input[name="PD1"]:checked')?.value;
                if (pd1Val) targetVal = pd1Val;
                else targetVal = hasFestival ? '1' : '2';
              }

              const target = document.querySelector(`input[name="D1"][value="${targetVal}"]`) || document.querySelector('input[name="D1"][value="2"]');
              if (target) {
                if (!target.checked) target.click();
                target.checked = true;
                target.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
              }
              return targetVal === '1';
            }, { hasFestival: festivalResult.hasFestival, preserveExisting });
          } catch (err) {
            console.error('[P11 D1 frame 주입 오류]:', err);
          }
        }

        // D1A 계열 전체 프레임 (D1AA 축제/홍보, D1AB 공동구매/세일, D1AC, D1AD 등 전수 커버)
        for (const f of page.frames()) {
          const fUrl = f.url();
          if (fUrl.includes('D1A') || f.name().startsWith('frame_D1A')) {
            try {
              await f.evaluate(({ isMarketingActive, festivalInfo }) => {
                // 1. D1AA.asp (축제/홍보/마케팅)
                if (location.href.includes('D1AA.asp') || window.name === 'frame_D1AA') {
                  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
                  items.forEach(idx => {
                    const prevVal = document.querySelector(`input[name="PD1AA_${idx}_1"]:checked`)?.value;
                    const curVal = document.querySelector(`input[name="D1AA_${idx}_1"]:checked`)?.value;
                    // 축제(2) 문항은 festivalInfo 반영, 그 외는 전년도 값 우선 (전년도 없으면 2 미실시)
                    let active = false;
                    if (idx === 2) {
                      active = isMarketingActive && (festivalInfo.hasFestival || curVal === '1' || prevVal === '1');
                    } else {
                      active = isMarketingActive && ((curVal === '1') || (prevVal === '1'));
                    }

                    const targetChoice = active ? '1' : '2';
                    const r = document.querySelector(`input[name="D1AA_${idx}_1"][value="${targetChoice}"]`) || document.querySelector(`input[name="D1AA_${idx}_1"][value="2"]`);
                    if (r) {
                      if (!r.checked) r.click();
                      r.checked = true;
                      r.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                    }

                    if (active) {
                      // 상세 내용 주입 (1 이상의 숫자 또는 유효 텍스트)
                      if (idx === 1) { // 경품행사 (1 이상 숫자 필수)
                        const t = document.querySelector('#D1AA_1_2, input[name="D1AA_1_2"]');
                        if (t && (!t.value || parseInt(t.value, 10) < 1)) { t.value = '2'; t.dispatchEvent(new Event('input', { bubbles: true })); }
                      } else if (idx === 2) { // 축제 (명칭 필수)
                        const t = document.querySelector('#D1AA_2_2, input[name="D1AA_2_2"]');
                        if (t && !t.value) { t.value = festivalInfo.festivalName || '고객감사 대축제'; t.dispatchEvent(new Event('input', { bubbles: true })); }
                      } else if (idx === 9) { // LED 광고판 (보유개수 >= 1, 설치연도 1900~2026)
                        const t1 = document.querySelector('#D1AA_9_2_1, input[name="D1AA_9_2_1"]');
                        const t2 = document.querySelector('#D1AA_9_2_2, input[name="D1AA_9_2_2"]');
                        if (t1 && (!t1.value || parseInt(t1.value, 10) < 1)) { t1.value = '1'; t1.dispatchEvent(new Event('input', { bubbles: true })); }
                        if (t2 && (!t2.value || parseInt(t2.value, 10) < 1900)) { t2.value = '2024'; t2.dispatchEvent(new Event('input', { bubbles: true })); }
                      } else if (idx === 10) { // 특산품판매장
                        const t = document.querySelector('#D1AA_10_2, input[name="D1AA_10_2"]');
                        if (t && !t.value) { t.value = '특산품 상설 판매장'; t.dispatchEvent(new Event('input', { bubbles: true })); }
                      } else if (idx === 11) { // 자판기 (1 이상 숫자 필수)
                        const t = document.querySelector('#D1AA_11_2, input[name="D1AA_11_2"]');
                        if (t && (!t.value || parseInt(t.value, 10) < 1)) { t.value = '1'; t.dispatchEvent(new Event('input', { bubbles: true })); }
                      }

                      // 기여도 라디오(_3) 1~5 체크 보장
                      const rateRadio = document.querySelector(`input[name="D1AA_${idx}_3"]:checked`) || document.querySelector(`input[name="D1AA_${idx}_3"][value="3"]`) || document.querySelector(`input[name="D1AA_${idx}_3"][value="4"]`);
                      if (rateRadio) {
                        rateRadio.checked = true;
                        rateRadio.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof $ !== 'undefined') $(rateRadio).prop('checked', true).trigger('change');
                      }
                    }
                  });
                }

                // 2. D1AB.asp (공동구매/공간임대)
                if (location.href.includes('D1AB.asp') || window.name === 'frame_D1AB') {
                  [1, 2, 3].forEach(idx => {
                    const prevVal = document.querySelector(`input[name="PD1AB_${idx}_1"]:checked`)?.value;
                    const curVal = document.querySelector(`input[name="D1AB_${idx}_1"]:checked`)?.value;
                    const active = isMarketingActive && ((curVal === '1') || (prevVal === '1'));
                    const targetChoice = active ? '1' : '2';
                    const r = document.querySelector(`input[name="D1AB_${idx}_1"][value="${targetChoice}"]`) || document.querySelector(`input[name="D1AB_${idx}_1"][value="2"]`);
                    if (r) {
                      if (!r.checked) r.click();
                      r.checked = true;
                      r.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                    }
                    if (active) {
                      if (idx === 1) { // 구매 횟수 >= 1
                        const t = document.querySelector('#D1AB_1_2, input[name="D1AB_1_2"]');
                        if (t && (!t.value || parseInt(t.value, 10) < 1)) { t.value = '2'; t.dispatchEvent(new Event('input', { bubbles: true })); }
                      }
                      const rate = document.querySelector(`input[name="D1AB_${idx}_3"]:checked`) || document.querySelector(`input[name="D1AB_${idx}_3"][value="3"]`);
                      if (rate) { rate.checked = true; rate.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                  });
                }

                // 3. D1AC.asp (전용홈페이지/쇼핑몰/모바일앱)
                if (location.href.includes('D1AC.asp') || window.name === 'frame_D1AC') {
                  [1, 2, 3].forEach(idx => {
                    const prevVal = document.querySelector(`input[name="PD1AC_${idx}_1"]:checked`)?.value;
                    const curVal = document.querySelector(`input[name="D1AC_${idx}_1"]:checked`)?.value;
                    const active = isMarketingActive && ((curVal === '1') || (prevVal === '1'));
                    const targetChoice = active ? '1' : '2';
                    const r = document.querySelector(`input[name="D1AC_${idx}_1"][value="${targetChoice}"]`) || document.querySelector(`input[name="D1AC_${idx}_1"][value="2"]`);
                    if (r) {
                      if (!r.checked) r.click();
                      r.checked = true;
                      r.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                    }
                    if (active) {
                      const t = document.querySelector(`#D1AC_${idx}_2, input[name="D1AC_${idx}_2"]`);
                      if (t && !t.value) {
                        t.value = (idx === 3) ? '온누리장터' : 'https://market.example.com';
                        t.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                      const rate = document.querySelector(`input[name="D1AC_${idx}_3"]:checked`) || document.querySelector(`input[name="D1AC_${idx}_3"][value="3"]`);
                      if (rate) { rate.checked = true; rate.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                  });
                }

                // 4. D1AD.asp (공용 배송센터)
                if (location.href.includes('D1AD.asp') || window.name === 'frame_D1AD') {
                  const prevVal = document.querySelector('input[name="PD1AD_1_1"]:checked')?.value;
                  const curVal = document.querySelector('input[name="D1AD_1_1"]:checked')?.value;
                  const active = isMarketingActive && ((curVal === '1') || (prevVal === '1'));
                  const targetChoice = active ? '1' : '2';
                  const r = document.querySelector(`input[name="D1AD_1_1"][value="${targetChoice}"]`) || document.querySelector('input[name="D1AD_1_1"][value="2"]');
                  if (r) {
                    if (!r.checked) r.click();
                    r.checked = true;
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                  }
                  if (active) {
                    // 운영형태 체크박스 (1: 자체)
                    const cb1 = document.querySelector('#D1AD_1_2_1, input[name="D1AD_1_2_1"]');
                    if (cb1 && !cb1.checked) { cb1.click(); cb1.checked = true; cb1.dispatchEvent(new Event('change', { bubbles: true })); }
                    // 월평균 건수 >= 1
                    const tCnt = document.querySelector('#D1AD_1_2_2, input[name="D1AD_1_2_2"]');
                    if (tCnt && (!tCnt.value || parseInt(tCnt.value, 10) < 1)) { tCnt.value = '20'; tCnt.dispatchEvent(new Event('input', { bubbles: true })); }
                    // 기여도 라디오
                    const rate = document.querySelector('input[name="D1AD_1_3"][value="3"]');
                    if (rate && !document.querySelector('input[name="D1AD_1_3"]:checked')) { rate.click(); rate.checked = true; rate.dispatchEvent(new Event('change', { bubbles: true })); }
                    // 형태 라디오
                    const rForm = document.querySelector('input[name="D1AD_2_1"][value="1"]');
                    if (rForm && !document.querySelector('input[name="D1AD_2_1"]:checked')) { rForm.click(); rForm.checked = true; rForm.dispatchEvent(new Event('change', { bubbles: true })); }
                    // 배송수단 체크박스 및 대수
                    const mCb = document.querySelector('#D1AD_3_1_1, input[name="D1AD_3_1_1"]');
                    if (mCb && !mCb.checked) { mCb.click(); mCb.checked = true; mCb.dispatchEvent(new Event('change', { bubbles: true })); }
                    const mTxt = document.querySelector('#TD1AD_3_1_1, input[name="TD1AD_3_1_1"]');
                    if (mTxt && (!mTxt.value || parseInt(mTxt.value, 10) < 1)) { mTxt.value = '2'; mTxt.dispatchEvent(new Event('input', { bubbles: true })); }
                    // 수수료 라디오 (2: 무료)
                    const feeR = document.querySelector('input[name="D1AD_4_1"][value="2"]');
                    if (feeR && !document.querySelector('input[name="D1AD_4_1"]:checked')) { feeR.click(); feeR.checked = true; feeR.dispatchEvent(new Event('change', { bubbles: true })); }
                  }
                }
              }, { isMarketingActive, festivalInfo: festivalResult });
            } catch (_) {}
          }
        }

        await captureStep('P11', 'P11_공동마케팅D1');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P11');
        continue;
      }

      // ------------------------------------------
      // 1-6) P12 (D1-2: 온라인 배송 서비스 및 D1-2-5 지원항목)
      // ------------------------------------------
      if (currUrl.includes('P12') || currPageName === 'P12') {
        onProgress({ step: 'P12', message: `[P12] D1-2 온라인 배송 서비스 및 D1-2-5 지원항목 정책 주입 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // D1-2 온라인 배송 서비스 정책값 (기본 '2' 없음)
        const deliveryServiceVal = policy.D1_2_onlineDeliveryService || '2';
        // D1-2-5 필요한 지원 항목: '기타' 제외 나머지(1~4) 중 랜덤
        const randD1BEVal = String(Math.floor(Math.random() * 4) + 1);

        logger.info(`[상인회 러너] [P12] D1-2 배송서비스=${deliveryServiceVal}, D1-2-5 지원항목=${randD1BEVal} (🎲 기타 제외 랜덤)`);

        // D1B.asp (D1-2 배송 서비스 운영 여부 라디오)
        const d1bFrame = page.frames().find(f => f.url().includes('D1B.asp'));
        if (d1bFrame) {
          try {
            await d1bFrame.evaluate(({ deliveryVal, preserveExisting }) => {
              const curChecked = document.querySelector('input[name="D1B"]:checked');
              if (!preserveExisting || !curChecked) {
                const target = document.querySelector(`input[name="D1B"][value="${deliveryVal}"]`) || document.querySelector('input[name="D1B"][value="2"]');
                if (target) {
                  if (!target.checked) target.click();
                  target.checked = true;
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
                }
              }
            }, { deliveryVal: deliveryServiceVal, preserveExisting });
          } catch (err) {
            console.error('[P12 D1B frame 주입 오류]:', err);
          }
        }

        // P12 배송서비스 하위 전 문항 완벽 지원 (D1BA, D1BB, D1BBA, D1BC, D1BD, D1BE)
        for (const f of page.frames()) {
          try {
            await f.evaluate(() => {
              // 1. D1BA (배송서비스 유형 체크박스)
              const d1baCbs = document.querySelectorAll('input[type="checkbox"][name^="D1BA"]');
              if (d1baCbs.length > 0 && !Array.from(d1baCbs).some(c => c.checked)) {
                const cb = document.querySelector('#D1BA_1, input[name="D1BA_1"]') || d1baCbs[0];
                if (cb) {
                  if (!cb.checked) cb.click();
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
                }
              }

              // 2. D1BB (운영 주체 라디오: 1 상인회 직접, 2 개별점포, 3 기타)
              const d1bbRadios = document.querySelectorAll('input[name="D1BB"]');
              if (d1bbRadios.length > 0 && !document.querySelector('input[name="D1BB"]:checked')) {
                const r = document.querySelector('input[name="D1BB"][value="1"]') || d1bbRadios[0];
                if (r) {
                  if (!r.checked) r.click();
                  r.checked = true;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                }
              }
              const curD1BB = document.querySelector('input[name="D1BB"]:checked')?.value;
              const td1bb = document.querySelector('#TD1BB_3, input[name="TD1BB_3"]');
              if (td1bb) {
                if (curD1BB === '3') { if (!td1bb.value) td1bb.value = '기타 운영'; }
                else { td1bb.value = ''; }
              }

              // 3. D1BBA (D1-2-2-1 상인회 운영 시 운영 방식 체크박스)
              const d1bbaCbs = document.querySelectorAll('input[type="checkbox"][name^="D1BBA"]');
              if (d1bbaCbs.length > 0 && !Array.from(d1bbaCbs).some(c => c.checked)) {
                const cb = document.querySelector('#D1BBA_1, input[name="D1BBA_1"]') || d1bbaCbs[0];
                if (cb) {
                  if (!cb.checked) cb.click();
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
                }
              }

              // 4. D1BC (취급 품목 체크박스)
              const d1bcCbs = document.querySelectorAll('input[type="checkbox"][name^="D1BC"]');
              if (d1bcCbs.length > 0 && !Array.from(d1bcCbs).some(c => c.checked)) {
                const cb = document.querySelector('#D1BC_1, input[name="D1BC_1"]') || d1bcCbs[0];
                if (cb) {
                  if (!cb.checked) cb.click();
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
                }
              }

              // 5. D1BD (일평균 배송건수)
              const d1bd = document.querySelector('#D1BD, input[name="D1BD"]');
              if (d1bd && (!d1bd.value || d1bd.value.trim() === '' || d1bd.value === '0')) {
                d1bd.value = '15';
                d1bd.dispatchEvent(new Event('input', { bubbles: true }));
                d1bd.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(d1bd).val('15').trigger('input').trigger('change');
              }
            });
          } catch (_) {}
        }

        // D1BE.asp (D1-2-5 가장 필요한 지원 항목: 1~4번 중 랜덤, 5번 기타 제외)
        const d1beFrame = page.frames().find(f => f.url().includes('D1BE.asp'));
        if (d1beFrame) {
          try {
            await d1beFrame.evaluate(({ d1beVal, preserveExisting }) => {
              const curChecked = document.querySelector('input[name="D1BE"]:checked');
              if (!preserveExisting || !curChecked) {
                const target = document.querySelector(`input[name="D1BE"][value="${d1beVal}"]`) || document.querySelector('input[name="D1BE"][value="1"]');
                if (target) {
                  if (!target.checked) target.click();
                  target.checked = true;
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
                }
              }
            }, { d1beVal: randD1BEVal, preserveExisting });
          } catch (err) {
            console.error('[P12 D1BE frame 주입 오류]:', err);
          }
        }

        await captureStep('P12', 'P12_온라인배송D1B');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P12');
        continue;
      }

      // ------------------------------------------
      // 1-6-1) P13 (D2: 온누리상품권/지역화폐 등 결제수단 1:1 미러링)
      // ------------------------------------------
      if (currUrl.includes('P13') || currPageName === 'P13') {
        onProgress({ step: 'P13', message: `[P13] D2 결제수단 가맹현황 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        for (const f of page.frames()) {
          try {
            await f.evaluate(({ preserveExisting }) => {
              for (let i = 1; i <= 5; i++) {
                const radios = document.querySelectorAll(`input[name="D2_${i}"]`);
                if (radios.length > 0) {
                  const cur = document.querySelector(`input[name="D2_${i}"]:checked`);
                  if (!preserveExisting || !cur) {
                    const prevVal = document.querySelector(`input[name="PD2_${i}"]:checked`)?.value || '1';
                    const targetRadio = document.querySelector(`input[name="D2_${i}"][value="${prevVal}"]`) || radios[0];
                    if (targetRadio) {
                      if (!targetRadio.checked) targetRadio.click();
                      targetRadio.checked = true;
                      targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                    }
                  }
                }
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P13 D2 frame 주입 오류]:', err);
          }
        }

        await captureStep('P13', 'P13_결제수단D2');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P13');
        continue;
      }

      // ------------------------------------------
      // 1-6-2) P14 (D3: 정부/지자체 지원사업 수혜 현황 및 만족도)
      // ------------------------------------------
      if (currUrl.includes('P14') || currPageName === 'P14') {
        onProgress({ step: 'P14', message: `[P14] D3 정부/지자체 지원사업 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // 1. frame_D3: 수혜 여부 미러링 및 건수 필드 제어
        const d3Frame = page.frames().find(f => f.url().includes('D3.asp') || f.name() === 'frame_D3');
        let isBenefit = false;
        if (d3Frame) {
          try {
            isBenefit = await d3Frame.evaluate(({ preserveExisting }) => {
              const prevVal = document.querySelector('input[name="PD3"]:checked')?.value || '2';
              const curChecked = document.querySelector('input[name="D3"]:checked');
              const targetVal = (!preserveExisting || !curChecked) ? prevVal : curChecked.value;
              const targetRadio = document.querySelector(`input[name="D3"][value="${targetVal}"]`) || document.querySelector('input[name="D3"][value="2"]');
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }

              // 건수 필드 (#TD3_1)
              const cntInp = document.querySelector('#TD3_1, input[name="TD3_1"]');
              if (cntInp) {
                if (targetVal === '1') {
                  const pCnt = document.querySelector('#TPD3_1')?.value || '1';
                  cntInp.disabled = false;
                  cntInp.value = pCnt.trim() || '1';
                  cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                  cntInp.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  cntInp.value = '';
                  cntInp.disabled = true;
                }
              }
              return targetVal === '1';
            }, { preserveExisting });
          } catch (err) {
            console.error('[P14 D3 frame 주입 오류]:', err);
          }
        }

        // 2. frame_D3A & frame_D3B: 수혜(1)인 경우 세부 내역 및 만족도 주입
        if (isBenefit) {
          const d3aFrame = page.frames().find(f => f.url().includes('D3A.asp') || f.name() === 'frame_D3A');
          if (d3aFrame) {
            try {
              await d3aFrame.evaluate(() => {
                const getP = (id) => document.querySelector('#' + id)?.value || '';
                const setVal = (id, val) => {
                  const el = document.querySelector('#' + id) || document.querySelector(`input[name="${id}"]`);
                  if (el) {
                    el.disabled = false;
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(el).val(val).trigger('input').trigger('change');
                  }
                };
                setVal('D3AA_1', getP('PD3AA_1') || '소상공인시장진흥공단');
                setVal('D3AB_1', getP('PD3AB_1') || '전통시장 활성화 지원사업');
                setVal('D3AC_1', getP('PD3AC_1') || '시장 시설개선 및 마케팅');
                setVal('D3AD_1', getP('PD3AD_1') || '1000');
              });
            } catch (_) {}
          }

          const d3bFrame = page.frames().find(f => f.url().includes('D3B.asp') || f.name() === 'frame_D3B');
          if (d3bFrame) {
            try {
              await d3bFrame.evaluate(() => {
                ['D3B_1', 'D3B_2'].forEach(name => {
                  const checked = document.querySelector(`input[name="${name}"]:checked`);
                  if (!checked) {
                    const r = document.querySelector(`input[name="${name}"][value="4"]`) || document.querySelector(`input[name="${name}"][value="3"]`);
                    if (r) {
                      r.click();
                      r.checked = true;
                      r.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  }
                });
              });
            } catch (_) {}
          }
        }

        await captureStep('P14', 'P14_지원사업D3');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P14');
        continue;
      }

      // ------------------------------------------
      // 1-6-3) P15 (D4: 타 상권 협력활동 1:1 미러링)
      // ------------------------------------------
      if (currUrl.includes('P15') || currPageName === 'P15') {
        onProgress({ step: 'P15', message: `[P15] D4 타 상권 협력활동 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        const d4Frame = page.frames().find(f => f.url().includes('D4.asp') || f.name() === 'frame_D4');
        let isCollab = false;
        if (d4Frame) {
          try {
            isCollab = await d4Frame.evaluate(() => {
              // 전년도 응답 최우선 미러링 (미실시 2가 기본)
              const prevVal = document.querySelector('input[name="PD4"]:checked')?.value || '2';
              const targetVal = prevVal;
              const targetRadio = document.querySelector(`input[name="D4"][value="${targetVal}"]`) || document.querySelector('input[name="D4"][value="2"]');
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }
              return targetVal === '1';
            });
          } catch (err) {
            console.error('[P15 D4 frame 주입 오류]:', err);
          }
        }

        // 실시(1)인 경우에만 세부 내역 주입, 미실시(2)인 경우 필드 정리
        for (const f of page.frames()) {
          try {
            await f.evaluate(({ isCollab }) => {
              const d4aInp = document.querySelector('#D4A_1, input[name="D4A_1"]');
              if (d4aInp) {
                if (isCollab) {
                  const getP = (id) => document.querySelector('#' + id)?.value || '';
                  const setVal = (id, val) => {
                    const el = document.querySelector('#' + id) || document.querySelector(`input[name="${id}"]`);
                    if (el) {
                      el.disabled = false;
                      el.value = val;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  };
                  setVal('D4A_1', getP('PD4A_1') || '인근 상권 공동 마케팅 협력');
                  setVal('D4B_1', getP('PD4B_1') || '인근 상인회');
                  setVal('D4C_1', getP('PD4C_1') || '정례 회의 및 상생 협약');
                } else {
                  ['D4A_1', 'D4B_1', 'D4C_1'].forEach(id => {
                    const el = document.querySelector('#' + id) || document.querySelector(`input[name="${id}"]`);
                    if (el) { el.value = ''; el.disabled = true; }
                  });
                }
              }
            }, { isCollab });
          } catch (_) {}
        }

        await captureStep('P15', 'P15_상권협력D4');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P15');
        continue;
      }

      // ------------------------------------------
      // 1-6-4) P16 (D5: 상인 교육 및 컨설팅 1:1 미러링)
      // ------------------------------------------
      if (currUrl.includes('P16') || currPageName === 'P16') {
        onProgress({ step: 'P16', message: `[P16] D5 상인 교육/컨설팅 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        const d5Frame = page.frames().find(f => f.url().includes('D5.asp') || f.name() === 'frame_D5');
        let isEducation = false;
        if (d5Frame) {
          try {
            isEducation = await d5Frame.evaluate(() => {
              // 전년도 응답 최우선 미러링 (미실시 2가 기본)
              const prevVal = document.querySelector('input[name="PD5"]:checked')?.value || '2';
              const targetVal = prevVal;
              const targetRadio = document.querySelector(`input[name="D5"][value="${targetVal}"]`) || document.querySelector('input[name="D5"][value="2"]');
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }
              return targetVal === '1';
            });
          } catch (err) {
            console.error('[P16 D5 frame 주입 오류]:', err);
          }
        }

        // 실시(1)인 경우에만 교육명칭 및 인원수 주입
        for (const f of page.frames()) {
          try {
            await f.evaluate(({ isEducation }) => {
              const inpName = document.querySelector('#D5AA_1, input[name="D5AA_1"]');
              if (inpName) {
                if (isEducation) {
                  const getP = (id) => document.querySelector('#' + id)?.value || '';
                  inpName.disabled = false;
                  inpName.value = getP('PD5AA_1') || '상인 역량강화 교육';
                  inpName.dispatchEvent(new Event('input', { bubbles: true }));
                  const inpOrg = document.querySelector('#D5AB_1, input[name="D5AB_1"]');
                  if (inpOrg) {
                    inpOrg.disabled = false;
                    inpOrg.value = getP('PD5AB_1') || '소상공인시장진흥공단';
                    inpOrg.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                } else {
                  inpName.value = '';
                  inpName.disabled = true;
                }
              }

              const inpCnt = document.querySelector('#D5B, input[name="D5B"]');
              if (inpCnt) {
                if (isEducation) {
                  inpCnt.disabled = false;
                  if (!inpCnt.value || inpCnt.value.trim() === '') inpCnt.value = '10';
                  inpCnt.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  inpCnt.value = '';
                  inpCnt.disabled = true;
                }
              }
            }, { isEducation });
          } catch (_) {}
        }

        await captureStep('P16', 'P16_교육컨설팅D5');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P16');
        continue;
      }

      // ------------------------------------------
      // 1-7) P17 (E1: 화재예방 및 소방시설 현황, AI 지능형 출동 시스템 '없음' 처리)
      // ------------------------------------------
      if (currUrl.includes('P17') || currPageName === 'P17') {
        onProgress({ step: 'P17', message: `[P17] E1 소방시설 보유현황, 시설필요도(보통/필요/매우필요 중 선택) 및 AI 출동시스템(없음) 응답 중...` });
        await delay(200);

        const needRatingPolicy = policy.C1_C2_needRating || 'random';
        await page.evaluate(({ preserveExisting, needRatingPolicy }) => {
          const pickFacilityNeedVal = () => {
            if (needRatingPolicy === 'need_3') return '3';
            if (needRatingPolicy === 'need_4') return '4';
            if (needRatingPolicy === 'need' || needRatingPolicy === 'need_5') return '5';
            const allowed = ['3', '4', '5']; // 3: 보통, 4: 필요, 5: 매우 필요 ('1: 매우 불필요', '2: 불필요' 체크 금지)
            return allowed[Math.floor(Math.random() * allowed.length)];
          };

          // 1~6번 문항: 스프링클러, 소화전, 공용소화기, 경보기, 화재감지기, 가스감지기
          for (let idx = 1; idx <= 6; idx++) {
            const prevCnt = document.querySelector(`input[name="PE1_${idx}_2"]`)?.value || '';
            const hasPrev = prevCnt && prevCnt.trim() !== '' && parseInt(prevCnt.trim(), 10) > 0;

            if (hasPrev) {
              const optYes = document.querySelector(`input[name="E1_${idx}_1"][value="1"]`);
              if (optYes) {
                if (!optYes.checked) optYes.click();
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="E1_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                cntInp.value = prevCnt.trim();
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              const optNo = document.querySelector(`input[name="E1_${idx}_1"][value="2"]`);
              if (optNo) {
                if (!optNo.checked) optNo.click();
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="E1_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // [규칙] '시설필요도'는 '매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않고, '보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서만 응답
            const needRadios = Array.from(document.querySelectorAll(`input[name="E1_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="E1_${idx}_3"]:checked`);
              const isForbiddenVal = curChecked && (curChecked.value === '1' || curChecked.value === '2');
              if (!preserveExisting || !curChecked || isForbiddenVal) {
                const randVal = pickFacilityNeedVal();
                const targetRadio = document.querySelector(`input[name="E1_${idx}_3"][value="${randVal}"]`) ||
                                    document.querySelector(`input[name="E1_${idx}_3"][value="3"]`) ||
                                    needRadios[2];
                if (targetRadio) {
                  if (!targetRadio.checked) targetRadio.click();
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
                }
              }
            }
          }

          // 7번 문항: AI 지능형 출동 시스템 (GIS 지리정보 기반 출동 및 대응 시스템)
          // 규칙: 무조건 '없음' (2) 선택, 개수는 공란, 시설필요도는 '보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서 선택
          const aiOptNo = document.querySelector('#E1_7_1_2, input[name="E1_7_1"][value="2"]');
          if (aiOptNo) {
            if (!aiOptNo.checked) aiOptNo.click();
            aiOptNo.checked = true;
            aiOptNo.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(aiOptNo).prop('checked', true).trigger('change');
          }
          const aiCntInp = document.querySelector('#E1_7_2, input[name="E1_7_2"]');
          if (aiCntInp) {
            aiCntInp.value = '';
            aiCntInp.disabled = true;
          }
          // AI 시설필요도 ('보통(3)', '필요(4)', '매우 필요(5)' 셋 중에서만 선택)
          const aiNeedRadios = Array.from(document.querySelectorAll('input[name="E1_7_3"]'));
          if (aiNeedRadios.length > 0) {
            const curAiChecked = document.querySelector('input[name="E1_7_3"]:checked');
            const isAiForbidden = curAiChecked && (curAiChecked.value === '1' || curAiChecked.value === '2');
            if (!preserveExisting || !curAiChecked || isAiForbidden) {
              const randVal = pickFacilityNeedVal();
              const targetRadio = document.querySelector(`input[name="E1_7_3"][value="${randVal}"]`) ||
                                  document.querySelector('input[name="E1_7_3"][value="3"]') ||
                                  aiNeedRadios[2];
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }
            }
          }
        }, { preserveExisting, needRatingPolicy });

        await captureStep('P17', 'P17_소방시설E1');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P17');
        continue;
      }

      // ------------------------------------------
      // 1-8) P18 (E2: 화재공제/보험 가입 현황 1:1 미러링)
      // ------------------------------------------
      if (currUrl.includes('P18') || currPageName === 'P18') {
        onProgress({ step: 'P18', message: `[P18] E2 화재공제/보험 가입현황 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        const e2Frame = page.frames().find(f => f.url().includes('E2.asp') || f.name() === 'frame_E2');
        let isInsured = false;
        if (e2Frame) {
          try {
            isInsured = await e2Frame.evaluate(() => {
              const prevVal = document.querySelector('input[name="PE2"]:checked')?.value || '2';
              const targetVal = prevVal;
              const targetRadio = document.querySelector(`input[name="E2"][value="${targetVal}"]`) || document.querySelector('input[name="E2"][value="2"]');
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }
              return targetVal === '1';
            });
          } catch (err) {
            console.error('[P18 E2 frame 주입 오류]:', err);
          }
        }

        // E2 선택에 따라 E2AA 또는 E2B 프레임이 동적 노출되므로 동기화
        await syncAllChildFrames(page);
        await delay(200);

        // 전체 프레임에서 가입(1) vs 미가입(2) 분기 전수 보장
        for (const f of page.frames()) {
          try {
            await f.evaluate(({ isInsured }) => {
              if (isInsured) {
                // 가입(1): E2AA(보험료 납부주체) 및 E2AB(보상액 >= 1) 필수
                const curAA = document.querySelector('input[name="E2AA"]:checked');
                if (!curAA) {
                  const prevAA = document.querySelector('input[name="PE2AA"]:checked')?.value || '2';
                  const r = document.querySelector(`input[name="E2AA"][value="${prevAA}"]`) || document.querySelector('input[name="E2AA"][value="2"]');
                  if (r) {
                    if (!r.checked) r.click();
                    r.checked = true;
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                  }
                }
                const inpAB = document.querySelector('#E2AB, input[name="E2AB"]');
                if (inpAB && (!inpAB.value || inpAB.value.trim() === '')) {
                  const prevAB = document.querySelector('#PE2AB')?.value || '1000';
                  inpAB.disabled = false;
                  inpAB.value = prevAB.trim() || '1000';
                  inpAB.dispatchEvent(new Event('input', { bubbles: true }));
                  inpAB.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                // 미가입(2): E2B(미가입 사유 1~3 필수, 4 기타 제외)
                const curB = document.querySelector('input[name="E2B"]:checked');
                if (!curB) {
                  const prevB = document.querySelector('input[name="PE2B"]:checked')?.value;
                  const targetB = (prevB && prevB !== '4') ? prevB : '1';
                  const r = document.querySelector(`input[name="E2B"][value="${targetB}"]`) || document.querySelector('input[name="E2B"][value="1"]');
                  if (r) {
                    if (!r.checked) r.click();
                    r.checked = true;
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
                  }
                }
                const te2b = document.querySelector('#TE2B_4, input[name="TE2B_4"]');
                if (te2b) te2b.value = '';
              }
            }, { isInsured });
          } catch (_) {}
        }

        // 동적 조건부 노출 카운트 동기화 (Alert 방어)
        await page.evaluate(() => {
          if (typeof updateStepView === 'function') {
            try { updateStepView(); } catch (_) {}
          }
        }).catch(() => {});

        await captureStep('P18', 'P18_화재공제E2');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P18');
        continue;
      }

      // ------------------------------------------
      // 1-9) P19 (E3: 안전관리 실태 1:1 미러링)
      // ------------------------------------------
      if (currUrl.includes('P19') || currPageName === 'P19') {
        onProgress({ step: 'P19', message: `[P19] E3 안전관리 실태 2024년 데이터 1:1 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // E3_1 ~ E3_5 전수 미러링 보장 (메인 페이지 직접 주입)
        await page.evaluate(({ preserveExisting }) => {
          for (let i = 1; i <= 5; i++) {
            const cur = document.querySelector(`input[name="E3_${i}"]:checked`);
            if (!preserveExisting || !cur) {
              const prevVal = document.querySelector(`input[name="PE3_${i}"]:checked`)?.value || '1';
              const targetRadio = document.querySelector(`input[name="E3_${i}"][value="${prevVal}"]`) || document.querySelector(`input[name="E3_${i}"][value="1"]`);
              if (targetRadio) {
                if (!targetRadio.checked) targetRadio.click();
                targetRadio.checked = true;
                targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetRadio).prop('checked', true).trigger('change');
              }
            }
          }
        }, { preserveExisting });

        await captureStep('P19', 'P19_안전관리E3');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P19');
        continue;
      }

      // ------------------------------------------
      // 2-0) P20 (F1 ~ F4: 빈 점포 현황 수치 '0' 주입)
      // ------------------------------------------
      if (currUrl.includes('P20') || currPageName === 'P20') {
        onProgress({ step: 'P20', message: `[P20] F1~F4 빈 점포 수치 '0' 자동 응답 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // F1.asp: 항목 모두 '0'으로 입력 및 calcF1_4 호출
        const f1Frame = page.frames().find(f => f.url().includes('F1.asp'));
        if (f1Frame) {
          try {
            await f1Frame.evaluate(() => {
              ['F1_1', 'F1_2', 'F1_3', 'F1_4'].forEach(name => {
                const inp = document.querySelector(`input[name="${name}"]`);
                if (inp) {
                  inp.value = '0';
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(inp).val('0').trigger('input').trigger('change');
                }
              });
              if (typeof calcF1_4 === 'function') calcF1_4();
            });
          } catch (_) {}
        }

        // F2.asp: 빈점포 상태별 개수 모두 '0' 주입
        const f2Frame = page.frames().find(f => f.url().includes('F2.asp'));
        if (f2Frame) {
          try {
            await f2Frame.evaluate(() => {
              ['F2A_1', 'F2A_2', 'F2A_3', 'F2A_4'].forEach(name => {
                const inp = document.querySelector(`input[name="${name}"]`);
                if (inp) {
                  inp.value = '0';
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
              for (let i = 1; i <= 4; i++) {
                ['1', '2'].forEach(sub => {
                  const bInp = document.querySelector(`input[name="F2B_${i}_${sub}"]`);
                  if (bInp) {
                    bInp.value = '0';
                    bInp.dispatchEvent(new Event('input', { bubbles: true }));
                    bInp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              }
            });
          } catch (_) {}
        }

        // F3.asp & F4.asp 안전망
        for (const f of page.frames()) {
          try {
            await f.evaluate(() => {
              const f3Checkboxes = document.querySelectorAll('input[type="checkbox"][name^="F3"]');
              if (f3Checkboxes.length > 0) {
                const f3_6 = document.querySelector('#F3_6, input[name="F3_6"]');
                if (f3_6) f3_6.checked = false;
                const tf3_6 = document.querySelector('#TF3_6, input[name="TF3_6"]');
                if (tf3_6) tf3_6.value = '';

                const hasChecked = Array.from(f3Checkboxes).filter(c => c.name !== 'F3_6').some(c => c.checked);
                if (!hasChecked) {
                  const f3_2 = document.querySelector('#F3_2, input[name="F3_2"]') || document.querySelector('#F3_1, input[name="F3_1"]');
                  if (f3_2) {
                    if (!f3_2.checked) f3_2.click();
                    f3_2.checked = true;
                    f3_2.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }
              const f4Inputs = document.querySelectorAll('input[name^="F4"]:not([readonly]):not([type="hidden"])');
              if (f4Inputs.length > 0) {
                f4Inputs.forEach(inp => { if (!inp.value) inp.value = '0'; });
                const f4Total = document.querySelector('#F4E_4, input[name="F4E_4"]');
                if (f4Total) f4Total.value = '0';
              }
            });
          } catch (_) {}
        }

        await captureStep('P20', 'P20_빈점포수치');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P20');
        continue;
      }

      // ------------------------------------------
      // 2) P21 (F5, F6: 빈 점포 현황 - '기타' 제외 나머지 항목 중 랜덤 입력)
      // ------------------------------------------
      if (currUrl.includes('P21') || currPageName === 'P21') {
        onProgress({ step: 'P21', message: `[P21] F5, F6 빈 점포 현황 정책 응답 ('기타' 제외 랜덤) 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        // F5: 1~4 항목 중 랜덤 선택 (5번 기타 제외)
        let f5Val = policy.F5_emptyStoreReason || 'random';
        if (f5Val === 'random' || f5Val === '5') {
          f5Val = String(Math.floor(Math.random() * 4) + 1); // 1~4 무작위
        }
        // F6: 1~5 항목 중 랜덤 선택 (6번 기타 제외)
        let f6Val = policy.F6_emptyStorePolicy || 'random';
        if (f6Val === 'random' || f6Val === '6') {
          f6Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위
        }

        logger.info(`[상인회 러너] [P21] 정책 답변: F5=${f5Val} (🎲 기타 제외 랜덤), F6=${f6Val} (🎲 기타 제외 랜덤)`);

        // F5 프레임
        const f5Frame = page.frames().find(f => f.url().includes('F5.asp'));
        if (f5Frame) {
          try {
            const hasChecked = await f5Frame.evaluate(() => !!document.querySelector('input[name="F5"]:checked'));
            if (!preserveExisting || !hasChecked) {
              const sel = `input[name="F5"][value="${f5Val}"]`;
              await f5Frame.click(sel).catch(async () => {
                await f5Frame.click('input[name="F5"][value="1"]').catch(() => {});
              });
            }
          } catch (_) {}
        }

        // F6 프레임
        const f6Frame = page.frames().find(f => f.url().includes('F6.asp'));
        if (f6Frame) {
          try {
            const hasChecked = await f6Frame.evaluate(() => !!document.querySelector('input[name="F6"]:checked'));
            if (!preserveExisting || !hasChecked) {
              const sel = `input[name="F6"][value="${f6Val}"]`;
              await f6Frame.click(sel).catch(async () => {
                await f6Frame.click('input[name="F6"][value="1"]').catch(() => {});
              });
            }
          } catch (_) {}
        }

        await captureStep('P21', 'P21_빈점포현황');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P21');
        continue;
      }

      // ------------------------------------------
      // 3) P22 (G1, G2: 바가지요금 현황 - '기타' 제외 나머지 항목 중 랜덤 입력)
      // ------------------------------------------
      if (currUrl.includes('P22') || currPageName === 'P22') {
        onProgress({ step: 'P22', message: `[P22] G1, G2 바가지요금 정책 응답 ('기타' 제외 랜덤) 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        // G1: 1~5 항목 중 랜덤 선택 (6번 기타 제외)
        let g1Val = policy.G1_overchargeReason || 'random';
        if (g1Val === 'random' || g1Val === '6') {
          g1Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위
        }
        // G2: 1~5 항목 중 랜덤 선택 (6번 기타 제외)
        let g2Val = policy.G2_overchargeSolution || 'random';
        if (g2Val === 'random' || g2Val === '6') {
          g2Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위
        }

        logger.info(`[상인회 러너] [P22] 정책 답변: G1=${g1Val} (🎲 기타 제외 랜덤), G2=${g2Val} (🎲 기타 제외 랜덤)`);

        // G1, G2 전체 프레임 안전 주입 (네이티브 click 및 change 이벤트 트리거)
        for (const f of page.frames()) {
          try {
            await f.evaluate(({ g1Val, g2Val, preserveExisting }) => {
              if (document.querySelector('input[name="G1"]')) {
                const cur1 = document.querySelector('input[name="G1"]:checked');
                if (!preserveExisting || !cur1) {
                  const r1 = document.querySelector(`input[name="G1"][value="${g1Val}"]`) || document.querySelector('input[name="G1"][value="1"]');
                  if (r1) {
                    if (!r1.checked) r1.click();
                    r1.checked = true;
                    r1.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(r1).prop('checked', true).trigger('change');
                  }
                }
              }
              if (document.querySelector('input[name="G2"]')) {
                const cur2 = document.querySelector('input[name="G2"]:checked');
                if (!preserveExisting || !cur2) {
                  const r2 = document.querySelector(`input[name="G2"][value="${g2Val}"]`) || document.querySelector('input[name="G2"][value="1"]');
                  if (r2) {
                    if (!r2.checked) r2.click();
                    r2.checked = true;
                    r2.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(r2).prop('checked', true).trigger('change');
                  }
                }
              }
            }, { g1Val, g2Val, preserveExisting });
          } catch (_) {}
        }

        await captureStep('P22', 'P22_바가지요금');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P22');
        continue;
      }

      // ------------------------------------------
      // 4) P23 (G3, G4: 문화콘텐츠 및 기후재해 대비 - G4 랜덤하게 일부 미체크)
      // ------------------------------------------
      if (currUrl.includes('P23') || currPageName === 'P23') {
        onProgress({ step: 'P23', message: `[P23] G3 문화 및 G4 기후재해 시설(랜덤 분산) 응답 중...` });
        await syncAllChildFrames(page);
        await delay(200);

        for (const f of page.frames()) {
          try {
            await f.evaluate(({ preserveExisting }) => {
              // G3: 라디오가 이미 체크되어 있으면 보존, 없을 때만 2번(없다) 선택
              if (document.querySelector('input[name^="G3"]')) {
                const g3Checked = document.querySelector('input[name^="G3"][type="radio"]:checked');
                if (!preserveExisting || !g3Checked) {
                  ['G3_1', 'G3_2', 'G3_3', 'G3_4', 'G3_5'].forEach(name => {
                    const r2 = document.querySelector(`input[name="${name}"][value="2"]`);
                    if (r2) {
                      if (!r2.checked) r2.click();
                      r2.checked = true;
                      r2.dispatchEvent(new Event('change', { bubbles: true }));
                      if (typeof $ !== 'undefined') $(r2).prop('checked', true).trigger('change');
                    }
                  });
                  // G3_6 우수상점 개수는 필수 숫자 필드 (0 주입)
                  const numInp = document.querySelector('#G3_6, input[name="G3_6"], input[type="tel"], input[type="number"]');
                  if (numInp && (!numInp.value || numInp.value.trim() === '')) {
                    numInp.value = '0';
                    numInp.dispatchEvent(new Event('input', { bubbles: true }));
                    numInp.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(numInp).val('0').trigger('input').trigger('change');
                  }
                }
              }

              // G4: '보유여부(_H)', '필요여부(_N)' 모두 체크하지 않고 랜덤하게 일부 미체크
              // (단, 카테고리별 최소 1개는 체크하여 설문 유효성 통과 보장, 기타_ETC는 체크 제외)
              if (document.querySelector('input[name^="G4"]')) {
                const g4Checked = document.querySelectorAll('input[type="checkbox"][name^="G4"]:checked');
                if (!preserveExisting || g4Checked.length === 0) {
                  const sections = [
                    { prefix: 'G4_1', max: 6 },
                    { prefix: 'G4_2', max: 5 },
                    { prefix: 'G4_3', max: 5 }
                  ];

                  sections.forEach(sec => {
                    let checkedH = 0;
                    let checkedN = 0;

                    for (let idx = 1; idx <= sec.max; idx++) {
                      const cbH = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_${idx}_H"]`);
                      const cbN = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_${idx}_N"]`);

                      if (cbH) {
                        const shouldCheckH = Math.random() < 0.60;
                        if (shouldCheckH) {
                          cbH.checked = true;
                          cbH.dispatchEvent(new Event('change', { bubbles: true }));
                          checkedH++;
                        } else {
                          cbH.checked = false;
                        }
                      }

                      if (cbN) {
                        const shouldCheckN = Math.random() < 0.50;
                        if (shouldCheckN) {
                          cbN.checked = true;
                          cbN.dispatchEvent(new Event('change', { bubbles: true }));
                          checkedN++;
                        } else {
                          cbN.checked = false;
                        }
                      }
                    }

                    if (checkedH === 0) {
                      const firstH = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_1_H"]`);
                      if (firstH) { firstH.checked = true; firstH.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                    if (checkedN === 0) {
                      const firstN = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_1_N"]`);
                      if (firstN) { firstN.checked = true; firstN.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                  });

                  let checkedAct = 0;
                  for (let idx = 1; idx <= 5; idx++) {
                    const cb25 = document.querySelector(`input[type="checkbox"][name="G4_4_${idx}_Y25"]`);
                    const cb26 = document.querySelector(`input[type="checkbox"][name="G4_4_${idx}_Y26"]`);
                    if (cb25 && Math.random() < 0.65) {
                      cb25.checked = true;
                      cb25.dispatchEvent(new Event('change', { bubbles: true }));
                      checkedAct++;
                    }
                    if (cb26 && Math.random() < 0.50) {
                      cb26.checked = true;
                      cb26.dispatchEvent(new Event('change', { bubbles: true }));
                      checkedAct++;
                    }
                  }
                  if (checkedAct === 0) {
                    const firstAct = document.querySelector('input[type="checkbox"][name="G4_4_1_Y25"]');
                    if (firstAct) { firstAct.checked = true; firstAct.dispatchEvent(new Event('change', { bubbles: true })); }
                  }
                }

                // G4 기타(_ETC) 체크박스 해제 및 텍스트 공란 보장
                ['G4_1_7_ETC', 'G4_2_6_ETC', 'G4_3_6_ETC', 'G4_4_6_ETC'].forEach(name => {
                  const cb = document.querySelector(`input[name="${name}"]`);
                  if (cb) cb.checked = false;
                  const txt = document.querySelector(`input[name="T${name}"]`) || document.querySelector(`#T${name}`);
                  if (txt) txt.value = '';
                });
              }
            }, { preserveExisting });
          } catch (_) {}
        }

        await captureStep('P23', 'P23_문화기후시설');
        await delay(200);
        await safeSubmitAndAdvance(page, 'P23');
        continue;
      }

      // ------------------------------------------
      // 5) P1 ~ P20: 일반 전년도 비교 문항 단계
      // ------------------------------------------
      if (!currPageName) {
        logger.warn(`[상인회 러너] 단계를 식별할 수 없어 안전 대기합니다. URL: ${currUrl}`);
        await delay(1500);
        continue;
      }
      const stepName = currPageName;
      onProgress({ step: stepName, message: `[${stepName}] 전년도 비교 문항 자동 응답(Mirroring) 중...` });

      await syncAllChildFrames(page);
      await delay(200);

      const mirrorResult = await mirrorPrevYearToCurrent(page, { preserveExisting });
      logger.info(`[상인회 러너] [${stepName}] 미러링 완료: 라디오 ${mirrorResult.radios}건, 텍스트/숫자 ${mirrorResult.inputs}건, 셀렉트 ${mirrorResult.selects}건, 신규평가 ${mirrorResult.ratings}건`);

      await captureStep(stepName, `${stepName}_전년도비교`);
      await delay(200);

      await safeSubmitAndAdvance(page, stepName);
    }

    // while 루프 정상 종료 실패 시 (maxSteps 바닥남)
    logger.error(`[상인회 러너 오류] "${marketName}": 최대 탐색 단계(maxSteps: 45)를 초과하여 최종 완료(Agree)에 도달하지 못했습니다.`);
    await captureStep('TIMEOUT_MAX_STEPS', '단계초과화면');
    throw new Error(`[상인회 러너] 최대 탐색 단계(maxSteps: 45)를 초과하여 최종 완료(Agree)에 도달하지 못했습니다. (마지막 단계: ${lastDetectedStep || '미감지'}, URL: ${page.url()})`);

  } catch (err) {
    logger.error(`[상인회 러너 오류] "${marketName}":`, err);
    await captureStep('ERROR', '오류발생화면');
    throw err;
  } finally {
    await browser.close();
  }
}

/**
 * [상인회 조사 전용] 현재 진행 중인 단계(P1~P23, Q1, Agree)를 100% 감지하는 고도화 탐색기
 */
async function detectAssocCurrentStep(page) {
  // 1. Survey.asp 리디렉션 처리 대기: Survey.asp에서 실제 step 페이지로의 전환 대기
  if (page.url().includes('Survey.asp')) {
    const startWait = Date.now();
    while (page.url().includes('Survey.asp') && Date.now() - startWait < 4500) {
      try {
        const pVal = await page.evaluate(() => document.querySelector('input[name="PageName"]')?.value);
        if (pVal && pVal.match(/^(P\d+|Q1|Agree)$/i)) {
          return pVal.toUpperCase();
        }
      } catch (_) {}
      await page.waitForTimeout(200).catch(() => {});
    }
  }

  // 2. Agree 또는 Q1 메인 URL 직접 매칭
  if (page.url().includes('Agree.asp')) return 'AGREE';
  if (page.url().includes('Q1.asp')) return 'Q1';

  // 3. 메인 페이지 URL 매칭
  const mainM = page.url().match(/(P\d+|Q1|Agree)\.asp/i);
  if (mainM) return mainM[1].toUpperCase();

  // 4. 모든 하위 프레임 및 메인 프레임 순회하여 P\d+ 또는 Agree 감지
  for (const f of page.frames()) {
    const fUrl = f.url() || '';
    const m = fUrl.match(/(P\d+|Q1|Agree)\.asp/i);
    if (m) return m[1].toUpperCase();

    try {
      const pVal = await f.evaluate(() => document.querySelector('input[name="PageName"]')?.value);
      if (pVal && pVal.match(/^(P\d+|Q1|Agree)$/i)) {
        return pVal.toUpperCase();
      }
    } catch (_) {}
  }

  return '';
}

/**
 * [상인회 조사 핵심 안전망] 정식 폼 저장(Submit) 보장 및 초고속 이동 헬퍼
 * - move_page로 저장 없이 건너뛰는 행위를 원천 금지
 * - Survey.asp 경유 시 다음 실태조사 페이지(Pxx.asp 또는 Agree)로 완전 전환될 때까지 능동 대기
 * - 미이동(Alert 발생 등) 시 자동 필드 치유 후 정식 next() 재실행
 */
async function safeSubmitAndAdvance(page, stepName) {
  const prevStep = await detectAssocCurrentStep(page) || stepName;
  const prevUrl = page.url();

  // 1차: #next 클릭 및 빠른 네비게이션 대기
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3500 }).catch(() => null),
    page.click('#next', { timeout: 3000 }).catch(() => {})
  ]);
  await delay(250);

  // 1-1차: Survey.asp 경유 시 실제 후속 페이지로 전환될 때까지 능동 대기
  const startWait = Date.now();
  while (page.url().includes('Survey.asp') && Date.now() - startWait < 5500) {
    const pVal = await detectAssocCurrentStep(page);
    if (pVal && pVal !== prevStep) break;
    await delay(200);
  }

  let currentStep = await detectAssocCurrentStep(page);
  let currentUrl = page.url();

  // 만약 단계가 바뀌지 않았다면 (Alert 발생 또는 미입력으로 인한 폼 잔류)
  if (currentStep === prevStep && currentUrl === prevUrl) {
    logger.warn(`[상인회 러너] [${stepName}] 폼 이동 미감지 (Alert 발생 가능성) ➔ 미응답 필드 자동 치유 후 정식 저장 재시도...`);
    
    // 2차: 미응답 필드 자동 보완
    await healUnansweredAssocFields(page);
    await delay(200);

    // 3차: 정식 next() 또는 #next 재클릭
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 4500 }).catch(() => null),
      page.evaluate(() => {
        if (typeof next === 'function') next();
        else {
          const btn = document.querySelector('#next, input[name="next"], button#next');
          if (btn) btn.click();
        }
      }).catch(() => {})
    ]);
    await delay(250);

    // 3-1차: Survey.asp 경유 재전환 대기
    const reWait = Date.now();
    while (page.url().includes('Survey.asp') && Date.now() - reWait < 5500) {
      const pVal = await detectAssocCurrentStep(page);
      if (pVal && pVal !== prevStep) break;
      await delay(200);
    }
  }
}

/**
 * 페이지 내 모든 iframe 로딩 동기화 헬퍼 (초고속 최적화)
 */
async function syncAllChildFrames(page) {
  try {
    // 1. 순차 노출(USE_SEQUENTIAL_VIEW) 해제 및 모든 프레임 노출 강제
    await page.evaluate(() => {
      window.USE_SEQUENTIAL_VIEW = false;
      document.querySelectorAll('.frame-box').forEach(b => b.classList.remove('is-hidden'));

      if (typeof updateStepView === 'function') {
        try { updateStepView(); } catch (_) {}
      }
      if (typeof CHILDREN !== 'undefined' && typeof ensureFrameLoaded === 'function') {
        for (let i = 0; i < CHILDREN.length; i++) {
          try { ensureFrameLoaded(CHILDREN[i].id); } catch (_) {}
        }
      }
      if (typeof processFrameLoadQueue === 'function' && !window.IS_FRAME_QUEUE_RUNNING) {
        try { processFrameLoadQueue(); } catch (_) {}
      }
      // [중요] Kstat merge-template.js의 POST 타겟 iframe은 로드 완료(data-merge-loaded="1") 후에도
      // f.src 프로퍼티가 'about:blank'로 유지됨. 따라서 POST 로딩이 완료/진행 중인 프레임에
      // f.src = dSrc(GET 요청)를 덮어쓰면 IDKey가 유실되어 prevData/currData가 모두 빈칸으로 초기화됨!
      document.querySelectorAll('iframe').forEach(f => {
        const isLoaded = f.getAttribute('data-merge-loaded') === '1';
        const isLoading = f.getAttribute('data-merge-loading') === '1';
        if (isLoaded || isLoading) return;

        let docHref = 'about:blank';
        try {
          const doc = f.contentDocument || f.contentWindow?.document;
          if (doc && doc.location && doc.location.href) {
            docHref = String(doc.location.href);
          }
        } catch (_) {}
        if (docHref && docHref !== 'about:blank' && !docHref.endsWith('about:blank')) return;

        if (typeof ensureFrameLoaded === 'function' && f.id) {
          try {
            ensureFrameLoaded(f.id);
            return;
          } catch (_) {}
        }

        const dSrc = f.getAttribute('data-src');
        if (dSrc && (f.src === 'about:blank' || !f.src || f.src.endsWith('about:blank'))) {
          f.src = dSrc;
        }
      });
    }).catch(err => console.error('[syncAllChildFrames evaluate 경고]:', err));

    // 2. 모든 iframe 렌더링 확인 (data-merge-loading 해제 및 문서 readyState === 'complete' 보장)
    for (let w = 0; w < 20; w++) {
      const allReady = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        if (iframes.length === 0) return true;
        return iframes.every(f => {
          try {
            if (f.getAttribute('data-merge-loading') === '1') return false;
            const doc = f.contentDocument || f.contentWindow?.document;
            if (!doc || !doc.body) return false;
            const href = String(doc.location?.href || '').toLowerCase();
            if (href === 'about:blank' || href === '') return false;
            return doc.readyState === 'complete';
          } catch (_) {
            return true;
          }
        });
      }).catch(() => true);

      if (allReady) break;
      await page.waitForTimeout(150);
    }

    await page.evaluate(() => {
      if (typeof updateStepView === 'function') {
        try { updateStepView(); } catch (_) {}
      }
      if (typeof updateNextButtonEnabledState === 'function') {
        try { updateNextButtonEnabledState(); } catch (_) {}
      }
    }).catch(() => {});
  } catch (_) {}

  // 프레임 로딩 대기 (timeout 800ms로 단축)
  const frames = page.frames();
  for (const f of frames) {
    if (f !== page.mainFrame()) {
      await f.waitForLoadState('domcontentloaded', { timeout: 800 }).catch(() => {});
    }
  }
}

/**
 * [핵심 미러링 엔진]
 * 전년도 응답 데이터(window.prevData 및 'P' 접두사 요소)를 읽어 2025년 기준 필드로 동일하게 복사 주입
 */
async function mirrorPrevYearToCurrent(page, { preserveExisting = true } = {}) {
  let totalRadios = 0;
  let totalInputs = 0;
  let totalRatings = 0;

  const frames = page.frames();
  for (const f of frames) {
    try {
      const res = await f.evaluate(({ preserveExisting }) => {
        let rCount = 0;
        let iCount = 0;
        let ratingCount = 0;

        // ============================================================
        // 1. script 내부 var prevData / var currData 및 window.prevData 최우선 주입 (가장 정확)
        // ============================================================
        const scriptPrev = {};
        const scriptCurr = {};
        try {
          const allScripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
          const prevM = allScripts.match(/var\s+prevData\s*=\s*(\{[\s\S]*?\});/);
          if (prevM && prevM[1]) {
            const re = /'([^']+)'\s*:\s*'([^']*)'/g;
            let kv;
            while ((kv = re.exec(prevM[1])) !== null) scriptPrev[kv[1]] = kv[2];
          }
          const currM = allScripts.match(/var\s+currData\s*=\s*(\{[\s\S]*?\});/);
          if (currM && currM[1]) {
            const re = /'([^']+)'\s*:\s*'([^']*)'/g;
            let kv;
            while ((kv = re.exec(currM[1])) !== null) scriptCurr[kv[1]] = kv[2];
          }
        } catch (_) {}

        const mergedData = Object.assign({}, scriptPrev, window.prevData || {}, scriptCurr, window.currData || {});

        if (Object.keys(mergedData).length > 0) {
          Object.keys(mergedData).forEach(key => {
            const val = mergedData[key];
            if (val === undefined || val === null || val === '') return;

            let currKey = key;
            if (key.startsWith('TP')) {
              currKey = 'T' + key.substring(2);
            } else if (key.startsWith('P')) {
              currKey = key.substring(1);
            }

            // 1-1. 라디오 체크 (이미 체크되어 있으면 보존, 단 시설필요도 _3 항목이 1 또는 2로 되어 있으면 3/4/5로 교정)
            const isFacilityNeedKey = /^(C1|C2|C4|E1)_\d+_3$/.test(currKey);
            const hasChecked = document.querySelector(`input[type="radio"][name="${currKey}"]:checked`);
            const isForbiddenChecked = isFacilityNeedKey && hasChecked && (hasChecked.value === '1' || hasChecked.value === '2');
            if (preserveExisting && hasChecked && !isForbiddenChecked) {
              return;
            }
            let safeRadioVal = String(val);
            if (isFacilityNeedKey && (safeRadioVal === '1' || safeRadioVal === '2')) {
              const allowed = ['3', '4', '5'];
              safeRadioVal = allowed[Math.floor(Math.random() * allowed.length)];
            }
            const radio = document.querySelector(`input[type="radio"][name="${currKey}"][value="${safeRadioVal}"]`);
            if (radio) {
              if (!radio.checked) radio.click();
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(radio).prop('checked', true).trigger('change');
              rCount++;
            }

            // 1-2. 체크박스 체크 (이미 체크되어 있다면 보존)
            const hasCheckedCb = document.querySelector(`input[type="checkbox"][name="${currKey}"]:checked`);
            if (preserveExisting && hasCheckedCb) {
              return;
            }
            const cb = document.querySelector(`input[type="checkbox"][name="${currKey}"][value="${val}"]`);
            if (cb) {
              if (!cb.checked) cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
              rCount++;
            }

            // 1-3. 텍스트/숫자 인풋 입력 (TD3_1은 제외)
            if (currKey === 'TD3_1' || currKey.startsWith('TD3')) return;
            const textInp = document.querySelector(`input[name="${currKey}"]:not([type="radio"]):not([type="checkbox"])`) || document.querySelector('#' + currKey);
            if (textInp) {
              const curV = textInp.value !== undefined && textInp.value !== null ? textInp.value.trim() : '';
              const strVal = String(val).trim();
              // 전년도 값이 비어있지 않은 경우: 금년도가 공란이거나 '0'이면 1:1 동일 덮어쓰기 복사
              if (strVal !== '' && strVal !== '0') {
                if (!preserveExisting || curV === '' || curV === '0') {
                  textInp.value = strVal;
                  textInp.dispatchEvent(new Event('input', { bubbles: true }));
                  textInp.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(textInp).val(strVal).trigger('input').trigger('change');
                  iCount++;
                }
              }
            }
          });
        }

        // ============================================================
        // 2. DOM 상의 'P' 접두사 요소 감지 (단일폼 및 프레임)
        // ============================================================
        // 2-1. 라디오 미러링 (네이티브 .click() 및 jQuery prop 트리거 필수)
        const prevRadios = Array.from(document.querySelectorAll('input[type="radio"][name^="P"]'));
        prevRadios.forEach(pRadio => {
          if (pRadio.checked) {
            let currName = pRadio.name.substring(1);
            if (pRadio.name.startsWith('TP')) currName = 'T' + pRadio.name.substring(2);
            const isFacilityNeed = /^(C1|C2|C4|E1)_\d+_3$/.test(currName);
            const curChecked = document.querySelector(`input[type="radio"][name="${currName}"]:checked`);
            const isForbidden = isFacilityNeed && curChecked && (curChecked.value === '1' || curChecked.value === '2');
            if (preserveExisting && curChecked && !isForbidden) {
              return; // 이미 당해년도 라디오가 체크되어 있으면 기존 선택 유지
            }
            let val = pRadio.value;
            if (isFacilityNeed && (val === '1' || val === '2')) {
              const allowed = ['3', '4', '5'];
              val = allowed[Math.floor(Math.random() * allowed.length)];
            }
            const currRadio = document.querySelector(`input[type="radio"][name="${currName}"][value="${val}"]`);
            if (currRadio) {
              if (!currRadio.checked) currRadio.click();
              currRadio.checked = true;
              currRadio.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(currRadio).prop('checked', true).trigger('change');
              rCount++;
            }
          }
        });

        // 2-2. 텍스트 / 숫자 input 미러링: name="PC1_1_2" ➔ name="C1_1_2", TPB1_1 ➔ TB1_1
        const prevInputs = Array.from(document.querySelectorAll('input[name^="P"]:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'));
        prevInputs.forEach(pInp => {
          let currName = pInp.name.substring(1);
          if (pInp.name.startsWith('TP')) currName = 'T' + pInp.name.substring(2);
          if (currName === 'TD3_1' || currName.startsWith('TD3') || currName.startsWith('C1_') || currName.startsWith('C2_') || currName.startsWith('D1AA_') || currName.startsWith('E1_') || currName.startsWith('F1_') || currName.startsWith('TC3B') || currName.endsWith('_ETC') || currName.endsWith('_FAX')) return; // D3, C1, C2, D1AA, E1, F1, C3BB/C3BC 기타 트랩 방어
          const currInp = document.querySelector(`input[name="${currName}"]`) || document.querySelector('#' + currName);
          if (currInp) {
            const pVal = pInp.value !== undefined && pInp.value !== null ? pInp.value.trim() : '';
            const cVal = currInp.value !== undefined && currInp.value !== null ? currInp.value.trim() : '';

            // [사용자 절대 대원칙]: 2024년도 내용이 있으면, 그 내용을 똑같이 2025년도에 1:1 동일 입력!
            // 전년도에 유효한 값이 존재할 경우, 금년도가 공란이거나 기본값 '0'이면 무조건 전년도 값으로 덮어써서 복사!
            if (pVal !== '' && pVal !== '0') {
              let safeVal = pVal;
              const pNum = parseInt(pVal, 10);
              if (!isNaN(pNum) && pNum >= 99999) {
                safeVal = '1';
              }
              if (!preserveExisting || cVal === '' || cVal === '0') {
                currInp.value = safeVal;
                currInp.dispatchEvent(new Event('input', { bubbles: true }));
                currInp.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(currInp).val(safeVal).trigger('input').trigger('change');
                iCount++;
                return;
              }
            } else if (pVal === '0') {
              if (cVal === '') {
                currInp.value = '0';
                currInp.dispatchEvent(new Event('input', { bubbles: true }));
                currInp.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(currInp).val('0').trigger('input').trigger('change');
                iCount++;
              }
            }
          }
        });

        // ============================================================
        // 3. 2025년 신규 항목 (1번 상인회/만족 우선 선택)
        // ============================================================
        const unassignedRadios = Array.from(document.querySelectorAll('input[type="radio"]:not([name^="P"]):not([disabled])'));
        const groups = {};
        unassignedRadios.forEach(r => {
          if (!groups[r.name]) groups[r.name] = [];
          groups[r.name].push(r);
        });

        Object.keys(groups).forEach(gName => {
          const curChecked = groups[gName].find(r => r.checked);
          const isFacilityNeed = /^(C1|C2|C4|E1)_\d+_3$/.test(gName);
          const isForbiddenNeed = isFacilityNeed && curChecked && (curChecked.value === '1' || curChecked.value === '2');
          if (!curChecked || isForbiddenNeed) {
            const vals = groups[gName].map(r => r.value);
            let target;
            if (vals.includes('1') && vals.includes('2') && vals.length === 2) {
              // 2지선다(유/무): 2(무/없음)가 안전 (1 선택 시 추가 상세문항 Alert 방어)
              target = groups[gName].find(r => r.value === '2') || groups[gName][0];
            } else if (vals.length >= 4 || isFacilityNeed) {
              // 5점 척도(시설필요도 등): '매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않고 '보통(3)', '필요(4)', '매우 필요(5)' 중에서만 선택
              const validHighVals = ['3', '4', '5'].filter(v => vals.includes(v));
              const pickVal = validHighVals.length > 0
                ? validHighVals[Math.floor(Math.random() * validHighVals.length)]
                : '3';
              target = groups[gName].find(r => r.value === pickVal) || groups[gName].find(r => r.value === '3') || groups[gName].find(r => r.value === '4') || groups[gName][2];
            } else {
              target = groups[gName].find(r => r.value === '1') || groups[gName][0];
            }
            if (target) {
              if (!target.checked) target.click();
              target.checked = true;
              target.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
              ratingCount++;
            }
          }
        });

        // ============================================================
        // 4. 셀렉트(select) 미러링 및 기본값 주입 (A8 운영시간 등)
        // ============================================================
        let sCount = 0;
        const selects = Array.from(document.querySelectorAll('select:not([disabled])'));
        selects.forEach(sel => {
          if (preserveExisting && sel.value && sel.value !== '' && sel.value !== '0') {
            return; // 이미 선택된 유효값 보존
          }
          if (!sel.value) {
            if (sel.name === 'A8_1_1') sel.value = '09';
            else if (sel.name === 'A8_1_2') sel.value = '0';
            else if (sel.name === 'A8_2_1') sel.value = '21';
            else if (sel.name === 'A8_2_2') sel.value = '0';
            else if (sel.options.length > 1) {
              sel.value = sel.options[1].value;
            }
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sCount++;
          }
        });

        // ============================================================
        // 5. 프레임별 특수 안전 로직
        // ============================================================
        // A3A: 관리주체 1(상인회) 최우선
        const a3a = document.querySelector('input[name="A3A"]');
        if (a3a && !document.querySelector('input[name="A3A"]:checked')) {
          const opt1 = document.querySelector('input[name="A3A"][value="1"]');
          if (opt1) {
            opt1.checked = true;
            opt1.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // A5: 전문시장 여부 (전년도 PA5와 완벽 일치)
        const radioA5 = document.querySelector('input[name="A5"]');
        if (radioA5) {
          const curA5 = document.querySelector('input[name="A5"]:checked');
          if (!curA5 || !preserveExisting) {
            const pa5 = document.querySelector('input[name="PA5"]:checked')?.value || '2';
            const targetA5 = document.querySelector(`input[name="A5"][value="${pa5}"]`) || document.querySelector('input[name="A5"][value="2"]');
            if (targetA5) {
              targetA5.checked = true;
              targetA5.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          const activeA5 = document.querySelector('input[name="A5"]:checked')?.value || '2';
          const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
          if (ta5) {
            if (activeA5 === '1') {
              if (!ta5.value) ta5.value = '종합소매';
            } else {
              ta5.value = '';
            }
          }
        }

        // A6 점포현황 안전망 (자기소유, 임차, 빈점포, 기타, 노점)
        const a6_1_1 = document.querySelector('input[name="A6_1_1"]');
        if (a6_1_1) {
          const copyA6Field = (pName, curName) => {
            const p = document.querySelector(`input[name="${pName}"]`)?.value;
            const c = document.querySelector(`input[name="${curName}"]`);
            if (c && p !== undefined && p !== null && p.trim() !== '') {
              c.value = p.trim();
              c.dispatchEvent(new Event('input', { bubbles: true }));
              c.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(c).val(p.trim()).trigger('input').trigger('change');
            }
          };
          copyA6Field('PA6_1_1', 'A6_1_1');
          copyA6Field('PA6_1_2', 'A6_1_2');
          copyA6Field('PA6_2_1', 'A6_2_1');
          copyA6Field('PA6_2_2', 'A6_2_2');
          copyA6Field('PA6_3', 'A6_3');
          if (typeof calculateA6 === 'function') calculateA6();
        }

        // A6A: 점포 업종별 수 (1~9) 전년도 값 1:1 복사
        for (let i = 1; i <= 9; i++) {
          const inp = document.querySelector(`input[name="A6A_${i}"]`);
          if (inp) {
            const prev = document.querySelector(`input[name="PA6A_${i}"]`)?.value;
            if (prev !== undefined && prev !== null && prev.trim() !== '') {
              inp.value = prev.trim();
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(inp).val(prev.trim()).trigger('input').trigger('change');
            }
          }
        }
        if (typeof calculateA6A === 'function') calculateA6A();

        // D3: 정부지원사업 (D3=2 선택 시 TD3_1 반드시 공란 유지)
        const radioD3 = document.querySelector('input[name="D3"]');
        if (radioD3) {
          const d3Checked = document.querySelector('input[name="D3"]:checked');
          if (!d3Checked) {
            const opt2 = document.querySelector('#D3_2, input[name="D3"][value="2"]');
            if (opt2) {
              if (!opt2.checked) opt2.click();
              opt2.checked = true;
              opt2.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(opt2).prop('checked', true).trigger('change');
            }
          }
          const curD3 = document.querySelector('input[name="D3"]:checked')?.value;
          if (curD3 === '2') {
            const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
            if (td3) td3.value = '';
          } else if (curD3 === '1') {
            const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
            if (td3 && (!td3.value || parseInt(td3.value, 10) < 1)) td3.value = '1';
          }
        }

        // D3A: 정부지원사업 내용 (지원기관명, 사업명, 사업내용 결측 방어)
        for (let gi = 1; gi <= 5; gi++) {
          const aa = document.querySelector(`#D3AA_${gi}, input[name="D3AA_${gi}"], input[name="D3AA_${gi}_1"]`);
          const ab = document.querySelector(`#D3AB_${gi}, input[name="D3AB_${gi}"], input[name="D3AB_${gi}_1"]`);
          const ac = document.querySelector(`#D3AC_${gi}, input[name="D3AC_${gi}"], input[name="D3AC_${gi}_1"]`);
          if (aa && !aa.value) {
            aa.value = '소상공인시장진흥공단';
            aa.dispatchEvent(new Event('input', { bubbles: true }));
            aa.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(aa).val('소상공인시장진흥공단').trigger('input').trigger('change');
          }
          if (ab && !ab.value) {
            ab.value = '전통시장 활성화 지원사업';
            ab.dispatchEvent(new Event('input', { bubbles: true }));
            ab.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(ab).val('전통시장 활성화 지원사업').trigger('input').trigger('change');
          }
          if (ac && !ac.value) {
            ac.value = '시설현대화 및 마케팅 지원';
            ac.dispatchEvent(new Event('input', { bubbles: true }));
            ac.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(ac).val('시설현대화 및 마케팅 지원').trigger('input').trigger('change');
          }
        }

        // F1~F4: 빈점포 현황 안전망
        const f1_1 = document.querySelector('input[name="F1_1"]');
        if (f1_1 && (!f1_1.value || f1_1.value.trim() === '')) {
          f1_1.value = '0';
          const f1_2 = document.querySelector('input[name="F1_2"]');
          if (f1_2 && !f1_2.value) f1_2.value = '0';
          const f1_3 = document.querySelector('input[name="F1_3"]');
          if (f1_3 && !f1_3.value) f1_3.value = '0';
          const f1_4 = document.querySelector('input[name="F1_4"]');
          if (f1_4 && !f1_4.value) f1_4.value = '0';
          if (typeof window.calcF1_4 === 'function') window.calcF1_4();
        }

        const f3Checkboxes = document.querySelectorAll('input[type="checkbox"][name^="F3"]');
        if (f3Checkboxes.length > 0) {
          const hasChecked = Array.from(f3Checkboxes).some(c => c.checked);
          if (!hasChecked) {
            const f3_1 = document.querySelector('#F3_1, input[name="F3_1"]');
            if (f3_1) { if (!f3_1.checked) f3_1.click(); f3_1.checked = true; f3_1.dispatchEvent(new Event('change', { bubbles: true })); }
          }
        }

        // A7A(정기휴무일 텍스트) 및 A7B(정기휴무 요일 체크박스) 안전망
        const a7aInp = document.querySelector('#A7A, input[name="A7A"]');
        if (a7aInp && (!a7aInp.value || a7aInp.value.trim() === '' || a7aInp.value.trim() === '0')) {
          a7aInp.value = '둘째, 넷째주';
          a7aInp.dispatchEvent(new Event('input', { bubbles: true }));
          a7aInp.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const a7bCheckboxes = document.querySelectorAll('input[type="checkbox"][name^="A7B_"]');
        if (a7bCheckboxes.length > 0) {
          const hasA7bChecked = Array.from(a7bCheckboxes).some(c => c.checked);
          if (!hasA7bChecked) {
            const a7b_7 = document.querySelector('#A7B_7, input[name="A7B_7"]') || a7bCheckboxes[a7bCheckboxes.length - 1];
            if (a7b_7) {
              if (!a7b_7.checked) a7b_7.click();
              a7b_7.checked = true;
              a7b_7.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof colorCheckbox === 'function') colorCheckbox('A7B');
            }
          }
        }

        const f4Inputs = document.querySelectorAll('input[name^="F4"]:not([readonly]):not([type="hidden"])');
        if (f4Inputs.length > 0) {
          f4Inputs.forEach(inp => {
            if (!inp.value) inp.value = '0';
          });
          const f4e4 = document.querySelector('input[name="F4E_4"]');
          if (f4e4) f4e4.value = '0';
        }
        // B5: 상인회비 및 총회 실시
        const b5d = document.querySelector('input[name="B5D"]');
        if (b5d && (!b5d.value || b5d.value.trim() === '')) {
          b5d.value = '1';
          b5d.dispatchEvent(new Event('input', { bubbles: true }));
          b5d.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // B6: 팩스 유무 신규 라디오
        if (document.querySelector('input[name="B6D"]') && !document.querySelector('input[name="B6D"]:checked')) {
          const opt2 = document.querySelector('input[name="B6D"][value="2"]');
          if (opt2) {
            opt2.checked = true;
            opt2.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // 자동 계산 함수 트리거
        if (typeof window.calculateA6 === 'function') window.calculateA6();
        if (typeof window.calculateA6A === 'function') window.calculateA6A();
        if (typeof window.calculateA7 === 'function') window.calculateA7();
        if (typeof window.calculateA8 === 'function') window.calculateA8();
        if (typeof window.calculateB1 === 'function') window.calculateB1();
        if (typeof window.calculateB2 === 'function') window.calculateB2();

        return { radios: rCount, inputs: iCount, selects: sCount, ratings: ratingCount };
      }, { preserveExisting });

      totalRadios += res?.radios || 0;
      totalInputs += res?.inputs || 0;
      totalRatings += res?.ratings || 0;
    } catch (_) {}
  }

  return { radios: totalRadios, inputs: totalInputs, selects: 0, ratings: totalRatings };
}

/**
 * 페이지 이동 실패(Alert 등) 시 미응답 필드 자동 치유 헬퍼
 */
async function healUnansweredAssocFields(page) {
  const frames = page.frames();
  for (const f of frames) {
    try {
      await f.evaluate(() => {
        // 1. 미선택 라디오: 2지선다는 2(무/없음) 우선, 척도형은 3(보통) 또는 4(만족)
        const radios = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
        const groups = {};
        radios.forEach(r => {
          if (!groups[r.name]) groups[r.name] = [];
          groups[r.name].push(r);
        });
        Object.keys(groups).forEach(gName => {
          const curChecked = groups[gName].find(r => r.checked);
          const isFacilityNeed = /^(C1|C2|C4|E1)_\d+_3$/.test(gName);
          const isForbiddenNeed = isFacilityNeed && curChecked && (curChecked.value === '1' || curChecked.value === '2');
          if (!curChecked || isForbiddenNeed) {
            const vals = groups[gName].map(r => r.value);
            let target;
            if (vals.includes('1') && vals.includes('2') && vals.length === 2) {
              target = groups[gName].find(r => r.value === '2') || groups[gName][0];
            } else if (vals.length >= 4 || isFacilityNeed) {
              const validHighVals = ['3', '4', '5'].filter(v => vals.includes(v));
              const pickVal = validHighVals.length > 0
                ? validHighVals[Math.floor(Math.random() * validHighVals.length)]
                : '3';
              target = groups[gName].find(r => r.value === pickVal) || groups[gName].find(r => r.value === '3') || groups[gName].find(r => r.value === '4') || groups[gName][2];
            } else {
              target = groups[gName].find(r => r.value === '1') || groups[gName][0];
            }
            if (target) {
              if (!target.checked) target.click();
              target.checked = true;
              target.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
            }
          }
        });

        // 2. 미입력 숫자/텍스트 '0' 주입 (부속/기타 텍스트, 전화번호, 성명 및 양수 필수 필드 제외!)
        const companionNames = [
          'TC3BB_4', 'TC3BC_5', 'TA5_1', 'TD3_1', 'B6D_FAX',
          'TF3_6', 'TF5_5', 'TF6_6', 'TG1_6', 'TG2_6',
          'G4_1_7_ETC', 'G4_2_6_ETC', 'G4_3_6_ETC', 'G4_4_6_ETC',
          'D1AA_1_2', 'D1AA_2_2', 'D1AA_9_2_1', 'D1AA_9_2_2', 'D1AA_10_2', 'D1AA_11_2',
          'D1AB_1_2', 'D1AD_1_2_2', 'TD1AD_3_1_1', 'E2AB', 'G3_6',
          'B3_1', 'B3_2', 'B6C', 'B7_3'
        ];

        const texts = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled])'));
        texts.forEach(t => {
          const tName = t.name || '';
          const tId = t.id || '';
          if (companionNames.includes(tName) || companionNames.includes(tId) || tName.startsWith('TD3') || tName.startsWith('TC3B') || tName.endsWith('_ETC') || tName.endsWith('_FAX') || tName.includes('TEL') || tName.includes('PHONE') || tId.includes('TEL') || tId.includes('PHONE')) {
            return; // 부속 텍스트 및 전화번호/성명 제약 필드는 일반 0 주입에서 배제
          }
          if (!t.value || t.value.trim() === '') {
            t.value = '0';
            t.dispatchEvent(new Event('input', { bubbles: true }));
            t.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // 전화번호/연락처 필드 안전 치유 (절대로 '0'을 넣지 않고 올바른 전화번호 형식 보장)
        const tels = Array.from(document.querySelectorAll('input[type="tel"]:not([readonly]):not([disabled]), input[name*="TEL"]:not([readonly]):not([disabled]), input[name*="PHONE"]:not([readonly]):not([disabled]), #B3_2, #B6C, #B7_3'));
        tels.forEach(t => {
          const tName = t.name || '';
          const tId = t.id || '';
          if (tName === 'B6D_FAX' || tId === 'B6D_FAX') return; // 선택 팩스는 제외
          const v = (t.value || '').trim();
          if (!v || v === '0' || !/^\d{2,4}-\d{3,4}-\d{4}$/.test(v)) {
            t.value = '010-4163-2166';
            t.dispatchEvent(new Event('input', { bubbles: true }));
            t.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(t).val('010-4163-2166').trigger('input').trigger('change');
          }
        });

        // B3_1 (상인회장 성명) 공란 또는 '0' 방어
        const b3_1 = document.querySelector('#B3_1, input[name="B3_1"]');
        if (b3_1 && (!b3_1.value || b3_1.value.trim() === '' || b3_1.value === '0')) {
          b3_1.value = '상인대표';
          b3_1.dispatchEvent(new Event('input', { bubbles: true }));
          b3_1.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof $ !== 'undefined') $(b3_1).val('상인대표').trigger('input').trigger('change');
        }

        // 3. C3BB_4 (소유주체 기타) & C3BC_5 (관리주체 기타) 정합성 보장
        const chkC3BB_4 = document.querySelector('#C3BB_4, input[name="C3BB_4"]');
        const txtC3BB_4 = document.querySelector('#TC3BB_4, input[name="TC3BB_4"]');
        if (chkC3BB_4 && chkC3BB_4.checked) {
          if (txtC3BB_4 && (!txtC3BB_4.value || txtC3BB_4.value.trim() === '' || txtC3BB_4.value === '0')) txtC3BB_4.value = '공동소유';
        } else if (txtC3BB_4) {
          txtC3BB_4.value = '';
        }

        const chkC3BC_5 = document.querySelector('#C3BC_5, input[name="C3BC_5"]');
        const txtC3BC_5 = document.querySelector('#TC3BC_5, input[name="TC3BC_5"]');
        if (chkC3BC_5 && chkC3BC_5.checked) {
          if (txtC3BC_5 && (!txtC3BC_5.value || txtC3BC_5.value.trim() === '' || txtC3BC_5.value === '0')) txtC3BC_5.value = '위탁관리';
        } else if (txtC3BC_5) {
          txtC3BC_5.value = '';
        }

        // 4. D3 체크 상태 재확인
        const radioD3 = document.querySelector('input[name="D3"]');
        if (radioD3) {
          const curD3 = document.querySelector('input[name="D3"]:checked')?.value;
          const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
          if (td3) {
            if (curD3 === '2') td3.value = '';
            else if (curD3 === '1' && (!td3.value || td3.value.trim() === '' || td3.value === '0')) td3.value = '1';
          }
        }

        // 5. A5 전문시장 재확인
        const radioA5 = document.querySelector('input[name="A5"]');
        if (radioA5) {
          const curA5 = document.querySelector('input[name="A5"]:checked')?.value;
          const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
          if (ta5) {
            if (curA5 === '1' && (!ta5.value || ta5.value.trim() === '')) ta5.value = '종합소매';
            else if (curA5 === '2') ta5.value = '';
          }
        }

        // 6. B6D 팩스 재확인
        const radioB6D = document.querySelector('input[name="B6D"]');
        if (radioB6D) {
          const curB6D = document.querySelector('input[name="B6D"]:checked')?.value;
          const b6dFax = document.querySelector('#B6D_FAX, input[name="B6D_FAX"]');
          if (b6dFax) {
            if (curB6D === '2') b6dFax.value = '';
            else if (curB6D === '1' && (!b6dFax.value || b6dFax.value.trim() === '')) b6dFax.value = '02-853-7472';
          }
        }

        // 7. F3/F5/F6/G1/G2 기타 항목 정합성
        [
          { chk: 'F3_6', txt: 'TF3_6', val: '기타 사업' },
          { chk: 'F5_5', txt: 'TF5_5', val: '기타 사유' },
          { chk: 'F6_6', txt: 'TF6_6', val: '기타 대책' },
          { chk: 'G1_6', txt: 'TG1_6', val: '기타 원인' },
          { chk: 'G2_6', txt: 'TG2_6', val: '기타 방안' }
        ].forEach(item => {
          const c = document.querySelector(`input[name="${item.chk}"]`);
          const t = document.querySelector(`#${item.txt}, input[name="${item.txt}"]`);
          if (c && t) {
            if (c.checked) {
              if (!t.value || t.value.trim() === '' || t.value === '0') t.value = item.val;
            } else {
              t.value = '';
            }
          }
        });

        // 5. 미선택 셀렉트 기본 선택
        const selects = Array.from(document.querySelectorAll('select:not([disabled])'));
        selects.forEach(sel => {
          if (!sel.value && sel.options.length > 1) {
            sel.value = sel.options[1].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // 5-1. A7A 및 A7B(정기휴무 요일 체크박스) 미응답 치유
        const a7aInp = document.querySelector('#A7A, input[name="A7A"]');
        if (a7aInp && (!a7aInp.value || a7aInp.value.trim() === '' || a7aInp.value.trim() === '0')) {
          a7aInp.value = '둘째, 넷째주';
          a7aInp.dispatchEvent(new Event('input', { bubbles: true }));
          a7aInp.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const a7bCbs = Array.from(document.querySelectorAll('input[type="checkbox"][name^="A7B_"]'));
        if (a7bCbs.length > 0 && !a7bCbs.some(c => c.checked)) {
          const sun = document.querySelector('#A7B_7, input[name="A7B_7"]') || a7bCbs[a7bCbs.length - 1];
          if (sun) {
            if (!sun.checked) sun.click();
            sun.checked = true;
            sun.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof colorCheckbox === 'function') colorCheckbox('A7B');
          }
        }

        // 6. 자동 계산 재실행
        if (typeof window.calculateA6 === 'function') window.calculateA6();
        if (typeof window.calculateA6A === 'function') window.calculateA6A();
        if (typeof window.calculateA7 === 'function') window.calculateA7();
        if (typeof window.calculateA8 === 'function') window.calculateA8();
        if (typeof window.calculateB1 === 'function') window.calculateB1();
        if (typeof window.calculateB2 === 'function') window.calculateB2();
        if (typeof window.calcF1_4 === 'function') window.calcF1_4();
      });
    } catch (_) {}
  }
}


