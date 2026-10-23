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
  logger.info(`[상인회 러너] 시작 ➔ 대상 시장: "${marketName}" (슬롯: #${quotaIndex}), 파일럿=${pilotMode}, 기입력보존=${preserveExisting}, URL=${surveyUrl}`);

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
      await page.evaluate(({ data, preserveExisting }) => {
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

        // 8. 조사원 성명 (Q1_10)
        const surveyor = document.querySelector('#Q1_10');
        if (surveyor && (!surveyor.value || surveyor.value.trim() === '')) {
          surveyor.value = '가온박정순';
        }
      }, { data: assocData, preserveExisting });

      await captureStep('01_Q1', 'Q1_기본정보');
      await delay(800);

      // Q1 다음 이동
      const prevQ1Url = page.url();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }).catch(() => {}),
        page.click('#next').catch(() => {})
      ]);
      await delay(1500);

      // Q1 잔류 시 next() 직접 호출 돌파
      if (page.url() === prevQ1Url || page.url().includes('Q1.asp')) {
        logger.warn(`[상인회 러너] Q1 잔류 감지 ➔ next() 함수 직접 호출 및 이동 돌파...`);
        await page.evaluate(() => {
          if (typeof next === 'function') next();
          else if (typeof move_page === 'function') move_page('P1');
        }).catch(() => {});
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await delay(1000);
      }
    }

    // ==========================================
    // 3. P1 ~ P23 및 Agree 단계 동적 상태 머신 순회
    // ==========================================
    let maxSteps = 45;
    let stepCount = 0;

    while (maxSteps-- > 0) {
      stepCount++;
      const currUrl = page.url();
      const currPageName = await page.evaluate(() => {
        return document.querySelector('input[name="PageName"]')?.value || '';
      }).catch(() => '');

      logger.info(`[상인회 러너] [현재 단계: ${currPageName}] URL: ${currUrl}`);

      // ------------------------------------------
      // 0) Q1.asp 잔류/재진입 시의 페일세이프 돌파
      // ------------------------------------------
      if (currUrl.includes('Q1.asp') || currPageName === 'Q1') {
        logger.warn(`[상인회 러너] [Q1] 상태 머신 내 Q1 감지 ➔ 우편번호/주소 보완 및 P1으로 돌파...`);
        await page.evaluate(({ data }) => {
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
          if (surveyor && !surveyor.value) surveyor.value = '가온박정순';
          if (typeof next === 'function') next();
          else if (typeof move_page === 'function') move_page('P1');
        }, { data: assocData }).catch(() => {});
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await delay(1000);
        continue;
      }

      // ------------------------------------------
      // 1) Agree.asp 최종 동의 페이지 도달
      // ------------------------------------------
      if (currUrl.includes('Agree.asp') || currPageName === 'Agree') {
        onProgress({ step: 'AGREE', message: `Agree 최종 동의 단계 도달.` });
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
      // 1-0-0) P4 (A7 ~ A9: 시장 일반현황 & A8 평일/휴일 운영시간대 가이드)
      // ------------------------------------------
      if (currUrl.includes('P4') || currPageName === 'P4') {
        onProgress({ step: 'P4', message: `[P4] A7~A9 일반현황 및 A8 운영시간대 정책 가이드 입력 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        // 1. A7, A7A, A7B, A9 등 일반 문항 전년도 1:1 미러링
        await mirrorPrevYearToCurrent(page, { preserveExisting });

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

              // 기입력 보존 옵션이 켜져 있고 이미 값이 채워져 있다면 보존
              const curOpenH = document.querySelector('#A8_1_1')?.value;
              const curCloseH = document.querySelector('#A8_2_1')?.value;
              if (preserveExisting && curOpenH && curCloseH) {
                return;
              }

              const setSelect = (id, val) => {
                const sel = document.querySelector('#' + id) || document.querySelector(`select[name="${id}"]`);
                if (sel) {
                  sel.disabled = false;
                  let matchedOption = Array.from(sel.options).find(o => o.value === String(val) || o.value === String(val).padStart(2, '0'));
                  if (matchedOption) {
                    sel.value = matchedOption.value;
                  } else {
                    sel.value = String(val);
                  }
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(sel).val(sel.value).trigger('change');
                }
              };

              setSelect('A8_1_1', targetOpenH);
              setSelect('A8_1_2', targetOpenM);
              setSelect('A8_2_1', targetCloseH);
              setSelect('A8_2_2', targetCloseM);

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

        await captureStep('P4', 'P4_일반현황및A8운영시간');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P4] 잔류 감지 ➔ move_page로 P5 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P5'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-0) P5 (B1 ~ B4: 상인회 운영, 명칭, 대표자, 직원 현황)
      // ------------------------------------------
      if (currUrl.includes('P5') || currPageName === 'P5') {
        onProgress({ step: 'P5', message: `[P5] B1~B4 상인회 조직현황(운영여부, 회장정보, 직원) 입력 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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

        // 2. B2.asp: 상인회명 2024년(PB2A)과 동일하게 입력 (최소 2자 이상 보장 및 jQuery 동기화)
        const b2Frame = page.frames().find(f => f.url().includes('B2.asp'));
        if (b2Frame) {
          try {
            await b2Frame.evaluate(({ preserveExisting, marketName }) => {
              const pb2a = document.querySelector('#PB2A')?.value || document.querySelector('input[name="PB2A"]')?.value || '';
              const b2a = document.querySelector('#B2A') || document.querySelector('input[name="B2A"]');
              const targetVal = (pb2a && pb2a.trim().length >= 2) ? pb2a.trim() : (marketName + ' 상인회');
              if (b2a) {
                b2a.value = targetVal;
                b2a.dispatchEvent(new Event('input', { bubbles: true }));
                b2a.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') {
                  $('#B2A').val(targetVal).trigger('input').trigger('change');
                }
              }
            }, { preserveExisting, marketName });
          } catch (err) {
            console.error('[P5 B2 frame 주입 오류]:', err);
          }
        }

        // 3. B3.asp: 상인회장 성명, 연락처 쿼터에 있는 내용으로 입력
        const b3Frame = page.frames().find(f => f.url().includes('B3.asp'));
        if (b3Frame) {
          try {
            await b3Frame.evaluate(({ data, preserveExisting }) => {
              const b3_1 = document.querySelector('#B3_1') || document.querySelector('input[name="B3_1"]');
              if (b3_1 && (!preserveExisting || !b3_1.value || b3_1.value.trim() === '')) {
                b3_1.value = data.leaderName || data.ceoName || '상인대표';
                b3_1.dispatchEvent(new Event('input', { bubbles: true }));
                b3_1.dispatchEvent(new Event('change', { bubbles: true }));
              }

              const b3_2 = document.querySelector('#B3_2') || document.querySelector('input[name="B3_2"]');
              if (b3_2 && (!preserveExisting || !b3_2.value || b3_2.value.trim() === '')) {
                let pVal = data.leaderPhone || data.phone || data.assocPhone || '010-0000-0000';
                const numOnly = String(pVal).replace(/\D/g, '');
                if (numOnly.length === 11) {
                  pVal = numOnly.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                } else if (numOnly.length === 10 && numOnly.startsWith('02')) {
                  pVal = numOnly.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
                } else if (numOnly.length === 10) {
                  pVal = numOnly.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                }
                b3_2.value = pVal;
                b3_2.dispatchEvent(new Event('input', { bubbles: true }));
                b3_2.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, { data: assocData, preserveExisting });
          } catch (err) {
            console.error('[P5 B3 frame 주입 오류]:', err);
          }
        }

        // 4. B4A.asp: B4-1 2024년이 공란이면 없음 체크, 내용이 있으면 동일하게 입력
        const b4aFrame = page.frames().find(f => f.url().includes('B4A.asp'));
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
                if (noneA && !noneA.checked) {
                  noneA.click();
                  noneA.checked = true;
                  noneA.dispatchEvent(new Event('change', { bubbles: true }));
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
                if (noneB && !noneB.checked) {
                  noneB.click();
                  noneB.checked = true;
                  noneB.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                if (noneB && noneB.checked) {
                  noneB.click();
                  noneB.checked = false;
                  noneB.dispatchEvent(new Event('change', { bubbles: true }));
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

        await captureStep('P5', 'P5_상인회조직현황');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P5] 잔류 감지 ➔ move_page로 P6 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P6'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-1) P6 (B5 ~ B7: 상인회비 및 상인회 시설/인력 현황 전년도 미러링)
      // ------------------------------------------
      if (currUrl.includes('P6') || currPageName === 'P6') {
        onProgress({ step: 'P6', message: `[P6] B5~B7 상인회비 및 시설/인력 현황 전년도 미러링 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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
        const b6Frame = page.frames().find(f => f.url().includes('B6.asp'));
        if (b6Frame) {
          try {
            await b6Frame.evaluate(({ preserveExisting }) => {
              // B6A: 사무실 유무 (전년도 PB6A 미러링 또는 기존값 보존, 없을 시 2번 무)
              if (!preserveExisting || !document.querySelector('input[name="B6A"]:checked')) {
                const pb6aVal = document.querySelector('input[name="PB6A"]:checked')?.value || '2';
                const targetB6A = document.querySelector(`input[name="B6A"][value="${pb6aVal}"]`) || document.querySelector('input[name="B6A"][value="2"]');
                if (targetB6A) {
                  targetB6A.checked = true;
                  targetB6A.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }

              // 만약 B6A가 1(유)인 경우 전년도 주소 및 대표전화 미러링 보장
              const curB6A = document.querySelector('input[name="B6A"]:checked')?.value;
              if (curB6A === '1') {
                ['B6B1', 'B6B2', 'B6B3', 'B6B4', 'B6C'].forEach(fName => {
                  const prev = document.querySelector(`#P${fName}`)?.value;
                  const curr = document.querySelector(`#${fName}`);
                  if (curr && (!preserveExisting || !curr.value || curr.value.trim() === '')) {
                    curr.value = prev || '';
                    curr.dispatchEvent(new Event('input', { bubbles: true }));
                    curr.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });

                // B6C 대표전화 유효성 검사 및 정규화 (validPhoneFormat 트랩 방어)
                const curB6C = document.querySelector('#B6C');
                if (curB6C) {
                  let v = curB6C.value || document.querySelector('#PB6C')?.value || '02-878-5525';
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
                  opt2.checked = true;
                  opt2.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }, { preserveExisting });
          } catch (_) {}
        }

        // B7.asp (상근직원 현황)
        const b7Frame = page.frames().find(f => f.url().includes('B7.asp'));
        if (b7Frame) {
          try {
            await b7Frame.evaluate(({ preserveExisting }) => {
              // B7A 상근직원 유무 라디오 공란 시 전년도 PB7A 또는 2(무) 기본 선택
              if (!preserveExisting || !document.querySelector('input[name="B7A"]:checked')) {
                const pb7aVal = document.querySelector('input[name="PB7A"]:checked')?.value || '2';
                const opt = document.querySelector(`input[name="B7A"][value="${pb7aVal}"]`) || document.querySelector('input[name="B7A"][value="2"]');
                if (opt) {
                  opt.checked = true;
                  opt.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }, { preserveExisting });
          } catch (_) {}
        }

        await captureStep('P6', 'P6_상인회비및시설');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P6] 잔류 감지 ➔ move_page로 P7 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P7'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-2) P7 (C1: 편의시설 보유현황 및 시설필요도)
      // ------------------------------------------
      if (currUrl.includes('P7') || currPageName === 'P7') {
        onProgress({ step: 'P7', message: `[P7] C1 편의시설 보유개수 및 시설필요도(랜덤) 자동 응답 중...` });
        await delay(600);

        await page.evaluate(({ preserveExisting }) => {
          // 9개 항목 순회 (C1_1 ~ C1_9)
          for (let idx = 1; idx <= 9; idx++) {
            const prevCnt = document.querySelector(`input[name="PC1_${idx}_2"]`)?.value || '';
            const hasPrev = prevCnt && prevCnt.trim() !== '' && parseInt(prevCnt.trim(), 10) > 0;

            if (hasPrev) {
              // 2024년에 '보유개수' 내용이 있으면 2025년에도 동일하게 입력
              const optYes = document.querySelector(`input[name="C1_${idx}_1"][value="1"]`);
              if (optYes) {
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C1_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                cntInp.value = prevCnt.trim();
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              // 2024년에 '보유개수' 내용이 없으면 2025년도에도 모두 '없음'으로 입력
              const optNo = document.querySelector(`input[name="C1_${idx}_1"][value="2"]`);
              if (optNo) {
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C1_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // '시설필요도'는 랜덤으로 체크 (1~5 척도)
            const needRadios = Array.from(document.querySelectorAll(`input[name="C1_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="C1_${idx}_3"]:checked`);
              if (!preserveExisting || !curChecked) {
                const randVal = String(Math.floor(Math.random() * 5) + 1); // 1~5 랜덤
                const targetRadio = document.querySelector(`input[name="C1_${idx}_3"][value="${randVal}"]`) || needRadios[0];
                if (targetRadio) {
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }

            if (typeof window.toggleDependentFields === 'function') {
              try { window.toggleDependentFields(idx); } catch (_) {}
            }
          }
        }, { preserveExisting });

        await captureStep('P7', 'P7_편의시설C1');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P7] 잔류 감지 ➔ move_page로 P8 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P8'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-3) P8 (C2: 안전/위생시설 보유현황 및 시설필요도)
      // ------------------------------------------
      if (currUrl.includes('P8') || currPageName === 'P8') {
        onProgress({ step: 'P8', message: `[P8] C2 안전/위생시설 보유개수 및 시설필요도(랜덤) 자동 응답 중...` });
        await delay(600);

        await page.evaluate(({ preserveExisting }) => {
          // 18개 항목 순회 (C2_1 ~ C2_18)
          for (let idx = 1; idx <= 18; idx++) {
            const prevCnt = document.querySelector(`input[name="PC2_${idx}_2"]`)?.value || '';
            const hasPrev = prevCnt && prevCnt.trim() !== '' && parseInt(prevCnt.trim(), 10) > 0;

            if (hasPrev) {
              // 2024년에 '보유개수' 내용이 있으면 2025년에도 동일하게 입력
              const optYes = document.querySelector(`input[name="C2_${idx}_1"][value="1"]`);
              if (optYes) {
                optYes.checked = true;
                optYes.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C2_${idx}_2"]`);
              if (cntInp) {
                cntInp.disabled = false;
                cntInp.value = prevCnt.trim();
                cntInp.dispatchEvent(new Event('input', { bubbles: true }));
                cntInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } else {
              // 2024년에 '보유개수' 내용이 없으면 2025년도에도 모두 '없음'으로 입력
              const optNo = document.querySelector(`input[name="C2_${idx}_1"][value="2"]`);
              if (optNo) {
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="C2_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // '시설필요도'는 랜덤으로 체크 (1~5 척도)
            const needRadios = Array.from(document.querySelectorAll(`input[name="C2_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="C2_${idx}_3"]:checked`);
              if (!preserveExisting || !curChecked) {
                const randVal = String(Math.floor(Math.random() * 5) + 1);
                const targetRadio = document.querySelector(`input[name="C2_${idx}_3"][value="${randVal}"]`) || needRadios[0];
                if (targetRadio) {
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }

            if (typeof window.toggleDependentFields === 'function') {
              try { window.toggleDependentFields(idx); } catch (_) {}
            }
          }
        }, { preserveExisting });

        await captureStep('P8', 'P8_안전위생시설C2');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P8] 잔류 감지 ➔ move_page로 P9 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P9'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-4) P9 (C3: 주차장 보유현황, 전기차대수, 형태/소유/관리주체)
      // ------------------------------------------
      if (currUrl.includes('P9') || currPageName === 'P9') {
        onProgress({ step: 'P9', message: `[P9] C3 주차시설 현황 및 정책 가이드 주입 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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
        if (c3Frame) {
          try {
            await c3Frame.evaluate(({ preserveExisting }) => {
              const pc3Val = document.querySelector('input[name="PC3"]:checked')?.value || '1';
              const targetC3 = document.querySelector(`input[name="C3"][value="${pc3Val}"]`) || document.querySelector('input[name="C3"][value="1"]');
              if (targetC3) {
                if (!targetC3.checked) targetC3.click();
                targetC3.checked = true;
                targetC3.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(targetC3).prop('checked', true).trigger('change');
              }
            }, { preserveExisting });
          } catch (err) {
            console.error('[P9 C3 frame 주입 오류]:', err);
          }
        }

        // 1. C3AC.asp (C3-1-3 전기차 전용 주차 대수)
        const c3acFrame = page.frames().find(f => f.url().includes('C3AC.asp'));
        if (c3acFrame) {
          try {
            await c3acFrame.evaluate(({ evCountVal, preserveExisting }) => {
              const inp = document.querySelector('#C3AC, input[name="C3AC"]');
              if (inp && (!preserveExisting || !inp.value || inp.value.trim() === '')) {
                inp.value = String(evCountVal);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, { evCountVal, preserveExisting });
          } catch (err) {
            console.error('[P9 C3AC frame 주입 오류]:', err);
          }
        }

        // 2. C3BA.asp (C3-2-1 주차장 형태 ※ 중복선택 가능)
        const c3baFrame = page.frames().find(f => f.url().includes('C3BA.asp'));
        if (c3baFrame) {
          try {
            await c3baFrame.evaluate(({ parkingTypeVal, preserveExisting }) => {
              const hasChecked = !!document.querySelector('input[type="checkbox"][name^="C3BA"]:checked');
              if (!preserveExisting || !hasChecked) {
                document.querySelectorAll('input[type="checkbox"][name^="C3BA"]').forEach(cb => { cb.checked = false; });
                if (parkingTypeVal === '1_2') {
                  const cb1 = document.querySelector('#C3BA_1, input[name="C3BA_1"]');
                  const cb2 = document.querySelector('#C3BA_2, input[name="C3BA_2"]');
                  if (cb1) { cb1.checked = true; cb1.dispatchEvent(new Event('change', { bubbles: true })); }
                  if (cb2) { cb2.checked = true; cb2.dispatchEvent(new Event('change', { bubbles: true })); }
                } else if (parkingTypeVal === '2_3') {
                  const cb2 = document.querySelector('#C3BA_2, input[name="C3BA_2"]');
                  const cb3 = document.querySelector('#C3BA_3, input[name="C3BA_3"]');
                  if (cb2) { cb2.checked = true; cb2.dispatchEvent(new Event('change', { bubbles: true })); }
                  if (cb3) { cb3.checked = true; cb3.dispatchEvent(new Event('change', { bubbles: true })); }
                } else {
                  const targetCb = document.querySelector(`#C3BA_${parkingTypeVal}, input[name="C3BA_${parkingTypeVal}"]`) || document.querySelector('#C3BA_2');
                  if (targetCb) {
                    targetCb.checked = true;
                    targetCb.dispatchEvent(new Event('change', { bubbles: true }));
                  }
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
                  targetCb.checked = true;
                  targetCb.dispatchEvent(new Event('change', { bubbles: true }));
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
                  targetCb.checked = true;
                  targetCb.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }, { managerVal, preserveExisting });
          } catch (err) {
            console.error('[P9 C3BC frame 주입 오류]:', err);
          }
        }

        await captureStep('P9', 'P9_주차시설C3');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P9] 잔류 감지 ➔ move_page로 P10 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P10'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-5) P11 (D1: 공동마케팅 사업 및 D1-1 축제/이벤트 명칭 조회 주입)
      // ------------------------------------------
      if (currUrl.includes('P11') || currPageName === 'P11') {
        onProgress({ step: 'P11', message: `[P11] D1 공동마케팅 및 D1-1 축제/이벤트 명칭 조회 주입 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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
        if (d1Frame) {
          try {
            await d1Frame.evaluate(({ hasFestival, preserveExisting }) => {
              const curChecked = document.querySelector('input[name="D1"]:checked');
              if (!preserveExisting || !curChecked) {
                const targetVal = hasFestival ? '1' : (document.querySelector('input[name="PD1"]:checked')?.value || '1');
                const target = document.querySelector(`input[name="D1"][value="${targetVal}"]`) || document.querySelector('input[name="D1"][value="1"]');
                if (target) {
                  target.checked = true;
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(target).prop('checked', true).trigger('change');
                }
              }
            }, { hasFestival: festivalResult.hasFestival, preserveExisting });
          } catch (err) {
            console.error('[P11 D1 frame 주입 오류]:', err);
          }
        }

        // D1AA.asp (D1-1 마케팅/홍보 세부 문항)
        const d1aaFrame = page.frames().find(f => f.url().includes('D1AA.asp'));
        if (d1aaFrame) {
          try {
            await d1aaFrame.evaluate(({ festivalInfo, preserveExisting }) => {
              const curChecked = document.querySelector('input[name="D1AA_2_1"]:checked');
              if (!preserveExisting || !curChecked) {
                if (festivalInfo.hasFestival && festivalInfo.festivalName) {
                  // 축제가 있으면 '실시선택 + 축제 및 이벤트 명칭' 입력
                  const optYes = document.querySelector('#D1AA_2_1_1, input[name="D1AA_2_1"][value="1"]');
                  if (optYes) {
                    optYes.checked = true;
                    optYes.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(optYes).prop('checked', true).trigger('change');
                  }
                  const nameInp = document.querySelector('#D1AA_2_2, input[name="D1AA_2_2"]');
                  if (nameInp) {
                    nameInp.disabled = false;
                    nameInp.value = festivalInfo.festivalName;
                    nameInp.dispatchEvent(new Event('input', { bubbles: true }));
                    nameInp.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(nameInp).val(festivalInfo.festivalName).trigger('input').trigger('change');
                  }
                  // 매출향상 기여도 (3: 보통 또는 4: 기여함 체크)
                  const rateRadio = document.querySelector('#D1AA_2_3_4, input[name="D1AA_2_3"][value="4"]') || document.querySelector('#D1AA_2_3_3, input[name="D1AA_2_3"][value="3"]');
                  if (rateRadio) {
                    rateRadio.checked = true;
                    rateRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(rateRadio).prop('checked', true).trigger('change');
                  }
                } else {
                  // 축제가 없으면 '미실시' 선택
                  const optNo = document.querySelector('#D1AA_2_1_2, input[name="D1AA_2_1"][value="2"]');
                  if (optNo) {
                    optNo.checked = true;
                    optNo.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(optNo).prop('checked', true).trigger('change');
                  }
                  const nameInp = document.querySelector('#D1AA_2_2, input[name="D1AA_2_2"]');
                  if (nameInp) {
                    nameInp.value = '';
                    nameInp.disabled = true;
                    nameInp.dispatchEvent(new Event('input', { bubbles: true }));
                    nameInp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }

              // 나머지 D1AA 항목들(경품행사 등) 미선택 시 2(미실시) 자동 선택 방어
              for (let i = 1; i <= 13; i++) {
                if (i === 2) continue; // 2번은 축제 문항
                const chk = document.querySelector(`input[name="D1AA_${i}_1"]:checked`);
                if (!chk) {
                  const opt2 = document.querySelector(`input[name="D1AA_${i}_1"][value="2"]`);
                  if (opt2) {
                    opt2.checked = true;
                    opt2.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }
            }, { festivalInfo: festivalResult, preserveExisting });
          } catch (err) {
            console.error('[P11 D1AA frame 주입 오류]:', err);
          }
        }

        await captureStep('P11', 'P11_공동마케팅D1');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P11] 잔류 감지 ➔ move_page로 P12 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P12'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-6) P12 (D1-2: 온라인 배송 서비스 및 D1-2-5 지원항목)
      // ------------------------------------------
      if (currUrl.includes('P12') || currPageName === 'P12') {
        onProgress({ step: 'P12', message: `[P12] D1-2 온라인 배송 서비스 및 D1-2-5 지원항목 정책 주입 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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

        // D1BA.asp (D1-2-1 배송서비스 유형 결측 방어)
        const d1baFrame = page.frames().find(f => f.url().includes('D1BA.asp'));
        if (d1baFrame) {
          try {
            await d1baFrame.evaluate(() => {
              const hasChecked = !!document.querySelector('input[type="checkbox"][name^="D1BA"]:checked');
              if (!hasChecked) {
                const cb = document.querySelector('#D1BA_1, input[name="D1BA_1"]');
                if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
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
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P12] 잔류 감지 ➔ move_page로 P13 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P13'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 1-7) P17 (E1: 화재예방 및 소방시설 현황, AI 지능형 출동 시스템 '없음' 처리)
      // ------------------------------------------
      if (currUrl.includes('P17') || currPageName === 'P17') {
        onProgress({ step: 'P17', message: `[P17] E1 소방시설 보유현황 및 AI 지능형 출동시스템(없음) 응답 중...` });
        await delay(600);

        await page.evaluate(({ preserveExisting }) => {
          // 1~6번 문항: 스프링클러, 소화전, 공용소화기, 경보기, 화재감지기, 가스감지기
          for (let idx = 1; idx <= 6; idx++) {
            const prevCnt = document.querySelector(`input[name="PE1_${idx}_2"]`)?.value || '';
            const hasPrev = prevCnt && prevCnt.trim() !== '' && parseInt(prevCnt.trim(), 10) > 0;

            if (hasPrev) {
              const optYes = document.querySelector(`input[name="E1_${idx}_1"][value="1"]`);
              if (optYes) {
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
                optNo.checked = true;
                optNo.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const cntInp = document.querySelector(`input[name="E1_${idx}_2"]`);
              if (cntInp) {
                cntInp.value = '';
                cntInp.disabled = true;
              }
            }

            // 시설필요도 랜덤 체크 (1~5 척도)
            const needRadios = Array.from(document.querySelectorAll(`input[name="E1_${idx}_3"]`));
            if (needRadios.length > 0) {
              const curChecked = document.querySelector(`input[name="E1_${idx}_3"]:checked`);
              if (!preserveExisting || !curChecked) {
                const randVal = String(Math.floor(Math.random() * 5) + 1);
                const targetRadio = document.querySelector(`input[name="E1_${idx}_3"][value="${randVal}"]`) || needRadios[0];
                if (targetRadio) {
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }
          }

          // 7번 문항: AI 지능형 출동 시스템 (GIS 지리정보 기반 출동 및 대응 시스템)
          // 규칙: 무조건 '없음' (2) 선택, 개수는 공란, 시설필요도는 랜덤 체크
          const aiOptNo = document.querySelector('#E1_7_1_2, input[name="E1_7_1"][value="2"]');
          if (aiOptNo) {
            aiOptNo.checked = true;
            aiOptNo.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(aiOptNo).prop('checked', true).trigger('change');
          }
          const aiCntInp = document.querySelector('#E1_7_2, input[name="E1_7_2"]');
          if (aiCntInp) {
            aiCntInp.value = '';
            aiCntInp.disabled = true;
          }
          // AI 시설필요도 (1~5 척도 랜덤)
          const aiNeedRadios = Array.from(document.querySelectorAll('input[name="E1_7_3"]'));
          if (aiNeedRadios.length > 0) {
            const randVal = String(Math.floor(Math.random() * 5) + 1);
            const targetRadio = document.querySelector(`input[name="E1_7_3"][value="${randVal}"]`) || aiNeedRadios[2];
            if (targetRadio) {
              targetRadio.checked = true;
              targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, { preserveExisting });

        await captureStep('P17', 'P17_소방시설E1');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P17] 잔류 감지 ➔ move_page로 P18 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P18'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 2-0) P20 (F1 ~ F4: 빈 점포 현황 수치 '0' 주입)
      // ------------------------------------------
      if (currUrl.includes('P20') || currPageName === 'P20') {
        onProgress({ step: 'P20', message: `[P20] F1~F4 빈 점포 수치 '0' 자동 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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
                const hasChecked = Array.from(f3Checkboxes).some(c => c.checked);
                if (!hasChecked) {
                  const f3_2 = document.querySelector('#F3_2, input[name="F3_2"]') || document.querySelector('#F3_1, input[name="F3_1"]');
                  if (f3_2) { f3_2.checked = true; f3_2.dispatchEvent(new Event('change', { bubbles: true })); }
                }
              }
              const f4Inputs = document.querySelectorAll('input[name^="F4"]:not([readonly]):not([type="hidden"])');
              if (f4Inputs.length > 0) {
                f4Inputs.forEach(inp => { if (!inp.value) inp.value = '0'; });
              }
            });
          } catch (_) {}
        }

        await captureStep('P20', 'P20_빈점포수치');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P20] 잔류 감지 ➔ move_page로 P21 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P21'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 2) P21 (F5, F6: 빈 점포 현황 - '기타' 제외 나머지 항목 중 랜덤 입력)
      // ------------------------------------------
      if (currUrl.includes('P21') || currPageName === 'P21') {
        onProgress({ step: 'P21', message: `[P21] F5, F6 빈 점포 현황 정책 응답 ('기타' 제외 랜덤) 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P21] 잔류 감지 ➔ move_page로 P22 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P22'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 3) P22 (G1, G2: 바가지요금 현황 - '기타' 제외 나머지 항목 중 랜덤 입력)
      // ------------------------------------------
      if (currUrl.includes('P22') || currPageName === 'P22') {
        onProgress({ step: 'P22', message: `[P22] G1, G2 바가지요금 정책 응답 ('기타' 제외 랜덤) 중...` });
        await syncAllChildFrames(page);
        await delay(600);

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

        // G1 프레임
        const g1Frame = page.frames().find(f => f.url().includes('G1.asp'));
        if (g1Frame) {
          try {
            const hasChecked = await g1Frame.evaluate(() => !!document.querySelector('input[name="G1"]:checked'));
            if (!preserveExisting || !hasChecked) {
              const sel = `input[name="G1"][value="${g1Val}"]`;
              await g1Frame.click(sel).catch(async () => {
                await g1Frame.click('input[name="G1"][value="1"]').catch(() => {});
              });
            }
          } catch (_) {}
        }

        // G2 프레임
        const g2Frame = page.frames().find(f => f.url().includes('G2.asp'));
        if (g2Frame) {
          try {
            const hasChecked = await g2Frame.evaluate(() => !!document.querySelector('input[name="G2"]:checked'));
            if (!preserveExisting || !hasChecked) {
              const sel = `input[name="G2"][value="${g2Val}"]`;
              await g2Frame.click(sel).catch(async () => {
                await g2Frame.click('input[name="G2"][value="1"]').catch(() => {});
              });
            }
          } catch (_) {}
        }

        await captureStep('P22', 'P22_바가지요금');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          logger.warn(`[상인회 러너] [P22] 잔류 감지 ➔ move_page로 P23 돌파...`);
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P23'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 4) P23 (G3, G4: 문화콘텐츠 및 기후재해 대비 - G4 랜덤하게 일부 미체크)
      // ------------------------------------------
      if (currUrl.includes('P23') || currPageName === 'P23') {
        onProgress({ step: 'P23', message: `[P23] G3 문화 및 G4 기후재해 시설(랜덤 분산) 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        for (const f of page.frames()) {
          try {
            await f.evaluate(({ preserveExisting }) => {
              // G3: 라디오가 이미 체크되어 있으면 보존, 없을 때만 2번(없다) 선택
              if (document.querySelector('input[name^="G3"]')) {
                const g3Checked = document.querySelector('input[name^="G3"][type="radio"]:checked');
                if (!preserveExisting || !g3Checked) {
                  document.querySelectorAll('input[type="radio"][value="2"]').forEach(r => {
                    r.checked = true;
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                  });
                  const numInp = document.querySelector('input[type="tel"], input[type="number"], input[name*="G3"]:not([type="radio"])');
                  if (numInp && (!numInp.value || numInp.value.trim() === '')) {
                    numInp.value = '0';
                    numInp.dispatchEvent(new Event('input', { bubbles: true }));
                    numInp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }

              // G4: '보유여부(_H)', '필요여부(_N)' 모두 체크하지 않고 랜덤하게 일부 미체크
              // (단, 카테고리별 최소 1개는 체크하여 설문 유효성 통과 보장, 기타_ETC는 체크 제외)
              if (document.querySelector('input[name^="G4"]')) {
                const g4Checked = document.querySelectorAll('input[type="checkbox"][name^="G4"]:checked');
                if (!preserveExisting || g4Checked.length === 0) {
                  // G4-1 냉방 (1~6), G4-2 난방 (1~5), G4-3 수해 (1~5)
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

                      // 보유여부(_H): 60% 확률로 체크
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

                      // 필요여부(_N): 50% 확률로 체크
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

                    // 안전망: 만약 모두 미체크된 경우 1번 항목 강제 체크
                    if (checkedH === 0) {
                      const firstH = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_1_H"]`);
                      if (firstH) { firstH.checked = true; firstH.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                    if (checkedN === 0) {
                      const firstN = document.querySelector(`input[type="checkbox"][name="${sec.prefix}_1_N"]`);
                      if (firstN) { firstN.checked = true; firstN.dispatchEvent(new Event('change', { bubbles: true })); }
                    }
                  });

                  // G4-4 수해피해방지활동 (1~5)
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
              }
            }, { preserveExisting });
          } catch (_) {}
        }

        await captureStep('P23', 'P23_문화기후시설');
        await delay(800);
        const prevUrl = page.url();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          page.click('#next').catch(() => {})
        ]);
        await delay(600);

        if (page.url() === prevUrl) {
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('Agree'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 5) P1 ~ P20: 일반 전년도 비교 문항 단계
      // ------------------------------------------
      const stepName = currPageName || `P${stepCount}`;
      onProgress({ step: stepName, message: `[${stepName}] 전년도 비교 문항 자동 응답(Mirroring) 중...` });

      await syncAllChildFrames(page);
      await delay(600);

      const mirrorResult = await mirrorPrevYearToCurrent(page, { preserveExisting });
      logger.info(`[상인회 러너] [${stepName}] 미러링 완료: 라디오 ${mirrorResult.radios}건, 텍스트/숫자 ${mirrorResult.inputs}건, 셀렉트 ${mirrorResult.selects}건, 신규평가 ${mirrorResult.ratings}건`);

      await captureStep(stepName, `${stepName}_전년도비교`);
      await delay(600);

      const prevUrlForNav = page.url();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => null),
        page.click('#next').catch(() => {})
      ]);
      await delay(800);

      // 페이지 이동 여부 확인 (잔류 시 move_page 보정)
      if (page.url() === prevUrlForNav) {
        logger.warn(`[상인회 러너] [${stepName}] 페이지 잔류 감지 ➔ move_page로 다음 단계 자동 돌파...`);
        const match = currPageName.match(/P(\d+)/);
        if (match) {
          const nextP = 'P' + (parseInt(match[1], 10) + 1);
          await page.evaluate((target) => {
            if (typeof move_page === 'function') move_page(target);
          }, nextP).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          await delay(800);
        }
      }
    }

  } catch (err) {
    logger.error(`[상인회 러너 오류] "${marketName}":`, err);
    await captureStep('ERROR', '오류발생화면');
    throw err;
  } finally {
    await browser.close();
  }
}

/**
 * 페이지 내 모든 iframe 로딩 동기화 헬퍼 (merge-template 완전 대기)
 */
async function syncAllChildFrames(page) {
  try {
    await page.evaluate(() => {
      if (typeof updateStepView === 'function') {
        try { updateStepView(); } catch (_) {}
      }
      if (typeof getVisibleChildCodes === 'function' && typeof CHILDREN !== 'undefined' && typeof ensureFrameLoaded === 'function') {
        const vis = getVisibleChildCodes();
        for (let i = 0; i < CHILDREN.length; i++) {
          if (vis[CHILDREN[i].code]) {
            try { ensureFrameLoaded(CHILDREN[i].id); } catch (_) {}
          }
        }
      }
      if (typeof processFrameLoadQueue === 'function' && !window.IS_FRAME_QUEUE_RUNNING) {
        try { processFrameLoadQueue(); } catch (_) {}
      }
      // data-src가 남아있지만 about:blank 인 프레임 강제 로딩
      document.querySelectorAll('iframe').forEach(f => {
        const dSrc = f.getAttribute('data-src');
        if (dSrc && (f.src === 'about:blank' || !f.src)) {
          f.src = dSrc;
        }
      });
    }).catch(() => {});

    // data-merge-loaded === '1' 및 document.body 로딩 대기 루프
    for (let w = 0; w < 20; w++) {
      const allReady = await page.evaluate(() => {
        if (typeof updateStepView === 'function') {
          try { updateStepView(); } catch (_) {}
        }
        if (typeof getVisibleChildCodes !== 'function' || typeof CHILDREN === 'undefined') {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          if (iframes.length === 0) return true;
          return iframes.every(f => {
            try {
              const doc = f.contentDocument || f.contentWindow?.document;
              return doc && doc.body && String(doc.location?.href || '').toLowerCase() !== 'about:blank';
            } catch (_) {
              return true;
            }
          });
        }
        const vis = getVisibleChildCodes();
        for (let i = 0; i < CHILDREN.length; i++) {
          const c = CHILDREN[i];
          if (vis[c.code]) {
            const ifr = document.getElementById(c.id);
            if (!ifr || ifr.getAttribute('data-merge-loaded') !== '1') return false;
            try {
              const doc = ifr.contentWindow?.document;
              if (!doc || !doc.body || String(doc.location?.href || '').toLowerCase() === 'about:blank') return false;
            } catch (_) {
              return false;
            }
          }
        }
        return true;
      }).catch(() => true);

      if (allReady) break;
      await page.waitForTimeout(200);
    }
  } catch (_) {}

  // 프레임 로딩 대기
  const frames = page.frames();
  for (const f of frames) {
    if (f !== page.mainFrame()) {
      await f.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
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
        // 1. window.currData 및 window.prevData 최우선 주입 (가장 정확)
        // ============================================================
        const mergedData = Object.assign({}, window.prevData || {}, window.currData || {});

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

            // 1-1. 라디오 체크 (이미 체크되어 있으면 보존)
            const hasChecked = document.querySelector(`input[type="radio"][name="${currKey}"]:checked`);
            if (preserveExisting && hasChecked) {
              return;
            }
            const radio = document.querySelector(`input[type="radio"][name="${currKey}"][value="${val}"]`);
            if (radio) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              rCount++;
            }

            // 1-2. 체크박스 체크 (이미 체크되어 있다면 보존)
            const hasCheckedCb = document.querySelector(`input[type="checkbox"][name="${currKey}"]:checked`);
            if (preserveExisting && hasCheckedCb) {
              return;
            }
            const cb = document.querySelector(`input[type="checkbox"][name="${currKey}"][value="${val}"]`);
            if (cb) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              rCount++;
            }

            // 1-3. 텍스트/숫자 인풋 입력 (TD3_1은 제외, 이미 입력된 값이 있다면 보존)
            if (currKey === 'TD3_1' || currKey.startsWith('TD3')) return;
            const textInp = document.querySelector(`input[name="${currKey}"]:not([type="radio"]):not([type="checkbox"])`);
            if (textInp) {
              if (preserveExisting && textInp.value && textInp.value.trim() !== '') {
                return;
              }
              textInp.value = val;
              textInp.dispatchEvent(new Event('input', { bubbles: true }));
              textInp.dispatchEvent(new Event('change', { bubbles: true }));
              iCount++;
            }
          });
        }

        // ============================================================
        // 2. DOM 상의 'P' 접두사 요소 감지 (단일폼 및 프레임)
        // ============================================================
        // 2-1. 라디오 미러링
        const prevRadios = Array.from(document.querySelectorAll('input[type="radio"][name^="P"]'));
        prevRadios.forEach(pRadio => {
          if (pRadio.checked) {
            const currName = pRadio.name.substring(1);
            if (preserveExisting && document.querySelector(`input[type="radio"][name="${currName}"]:checked`)) {
              return; // 이미 당해년도 라디오가 체크되어 있으면 기존 선택 유지
            }
            const val = pRadio.value;
            const currRadio = document.querySelector(`input[type="radio"][name="${currName}"][value="${val}"]`);
            if (currRadio) {
              currRadio.checked = true;
              currRadio.dispatchEvent(new Event('change', { bubbles: true }));
              rCount++;
            }
          }
        });

        // 2-2. 텍스트 / 숫자 input 미러링: name="PC1_1_2" ➔ name="C1_1_2"
        const prevInputs = Array.from(document.querySelectorAll('input[name^="P"]:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'));
        prevInputs.forEach(pInp => {
          const currName = pInp.name.substring(1);
          if (currName === 'TD3_1' || currName.startsWith('TD3') || currName.startsWith('C1_') || currName.startsWith('C2_') || currName.startsWith('D1AA_') || currName.startsWith('E1_') || currName.startsWith('F1_')) return; // D3, C1, C2, D1AA, E1, F1 트랩 방어
          const currInp = document.querySelector(`input[name="${currName}"]`);
          if (currInp) {
            if (preserveExisting && currInp.value && currInp.value.trim() !== '') {
              return; // 이미 입력된 값 보존
            }
            const valToSet = pInp.value && pInp.value.trim() !== '' ? pInp.value : '0';
            currInp.value = valToSet;
            currInp.dispatchEvent(new Event('input', { bubbles: true }));
            currInp.dispatchEvent(new Event('change', { bubbles: true }));
            iCount++;
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
          const isChecked = groups[gName].some(r => r.checked);
          if (!isChecked) {
            // 1번(상인회, 유, 만족) 최우선, 3번(보통) 차선
            const opt1 = groups[gName].find(r => r.value === '1');
            const opt3 = groups[gName].find(r => r.value === '3');
            const target = opt1 || opt3 || groups[gName][0];
            if (target) {
              target.checked = true;
              target.dispatchEvent(new Event('change', { bubbles: true }));
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

        // A6A: 점포 업종별 수 (1~9) 공란 시 전년도 값 또는 '0' 채움
        for (let i = 1; i <= 9; i++) {
          const inp = document.querySelector(`input[name="A6A_${i}"]`);
          if (inp && (!inp.value || inp.value.trim() === '')) {
            const prev = document.querySelector(`input[name="PA6A_${i}"]`)?.value;
            inp.value = prev && prev.trim() !== '' ? prev : '0';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // D3: 정부지원사업 (D3=2 선택 시 TD3_1 반드시 공란 유지)
        const radioD3 = document.querySelector('input[name="D3"]');
        if (radioD3) {
          const d3Checked = document.querySelector('input[name="D3"]:checked');
          if (!d3Checked) {
            const opt2 = document.querySelector('#D3_2, input[name="D3"][value="2"]');
            if (opt2) {
              opt2.checked = true;
              opt2.dispatchEvent(new Event('change', { bubbles: true }));
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
          const aa = document.querySelector(`#D3AA_${gi}`);
          const ab = document.querySelector(`#D3AB_${gi}`);
          const ac = document.querySelector(`#D3AC_${gi}`);
          if (aa && !aa.value) { aa.value = '소상공인시장진흥공단'; aa.dispatchEvent(new Event('input', { bubbles: true })); }
          if (ab && !ab.value) { ab.value = '전통시장 활성화 지원사업'; ab.dispatchEvent(new Event('input', { bubbles: true })); }
          if (ac && !ac.value) { ac.value = '시설현대화 및 마케팅 지원'; ac.dispatchEvent(new Event('input', { bubbles: true })); }
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
            if (f3_1) { f3_1.checked = true; f3_1.dispatchEvent(new Event('change', { bubbles: true })); }
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
        // 1. 미선택 라디오: 1번(상인회/만족/유) 우선, 3번(보통) 차선
        const radios = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
        const groups = {};
        radios.forEach(r => {
          if (!groups[r.name]) groups[r.name] = [];
          groups[r.name].push(r);
        });
        Object.keys(groups).forEach(gName => {
          if (!groups[gName].some(r => r.checked)) {
            const opt1 = groups[gName].find(r => r.value === '1');
            const opt3 = groups[gName].find(r => r.value === '3');
            const first = opt1 || opt3 || groups[gName][0];
            if (first) {
              first.checked = true;
              first.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });

        // 2. 미입력 숫자/텍스트 '0' 주입 (TD3_1은 반드시 제외!)
        const texts = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled]), input[type="tel"]:not([readonly]):not([disabled])'));
        texts.forEach(t => {
          if (t.name === 'TD3_1' || t.id === 'TD3_1' || t.name?.startsWith('TD3')) {
            return; // D3=2일 때 TD3_1에 0 주입 금지!
          }
          if (!t.value || t.value.trim() === '') {
            t.value = '0';
            t.dispatchEvent(new Event('input', { bubbles: true }));
            t.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // 3. D3 체크 상태 재확인
        const radioD3 = document.querySelector('input[name="D3"]');
        if (radioD3) {
          const curD3 = document.querySelector('input[name="D3"]:checked')?.value;
          if (curD3 === '2') {
            const td3 = document.querySelector('#TD3_1, input[name="TD3_1"]');
            if (td3) td3.value = '';
          }
        }

        // 4. A5 전문시장 재확인
        const radioA5 = document.querySelector('input[name="A5"]');
        if (radioA5) {
          const curA5 = document.querySelector('input[name="A5"]:checked')?.value;
          const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
          if (ta5) {
            if (curA5 === '1' && !ta5.value) ta5.value = '종합소매';
            else if (curA5 === '2') ta5.value = '';
          }
        }

        // 5. 미선택 셀렉트 기본 선택
        const selects = Array.from(document.querySelectorAll('select:not([disabled])'));
        selects.forEach(sel => {
          if (!sel.value && sel.options.length > 1) {
            sel.value = sel.options[1].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

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


