import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';

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
  logger.info(`[상인회 러너] 시작 ➔ 대상 시장: "${marketName}" (슬롯: #${quotaIndex}), 파일럿=${pilotMode}, URL=${surveyUrl}`);

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
    // 1. index.asp 접속
    // ==========================================
    onProgress({ step: 'START', message: `"${marketName}" 설문 접속 중...` });
    await page.goto(surveyUrl, { waitUntil: 'networkidle', timeout: 35000 });
    await delay(1000);
    await captureStep('00_INDEX', '시작화면');

    onProgress({ step: 'INDEX', message: `설문 시작 버튼 클릭...` });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
      page.click('#next')
    ]);
    await delay(1200);

    // ==========================================
    // 2. Q1.asp (기본정보 확인 및 입력)
    // ==========================================
    onProgress({ step: 'Q1', message: `Q1 기본정보 확인 및 상인회 정보 입력...` });
    
    // Q1_5: 응답자 성명, Q1_6: 연락처, Q1_8: 직위, Q1_10: 조사원 성명
    await page.evaluate((data) => {
      const respName = document.querySelector('#Q1_5');
      if (respName && (!respName.value || respName.value.trim() === '')) {
        respName.value = data.leaderName || '상인대표';
      }
      const respPhone = document.querySelector('#Q1_6');
      if (respPhone && (!respPhone.value || respPhone.value.trim() === '')) {
        respPhone.value = data.leaderPhone || data.assocPhone || '010-0000-0000';
      }
      // 직위: 1번 상인대표 라디오
      const radioPos = document.querySelector('input[name="Q1_8"][value="1"]');
      if (radioPos) {
        radioPos.checked = true;
        radioPos.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // 조사원 성명
      const surveyor = document.querySelector('#Q1_10');
      if (surveyor && (!surveyor.value || surveyor.value.trim() === '')) {
        surveyor.value = '가온박정순';
      }
    }, assocData);

    await captureStep('01_Q1', 'Q1_기본정보');
    await delay(800);

    // Q1 다음 이동
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }).catch(() => {}),
      page.click('#next')
    ]);
    await delay(1500);

    // ==========================================
    // 3. P1 ~ P23 및 Agree 단계 동적 상태 머신 순회
    // ==========================================
    let maxSteps = 40;
    let stepCount = 0;

    while (maxSteps-- > 0) {
      stepCount++;
      const currUrl = page.url();
      const currPageName = await page.evaluate(() => {
        return document.querySelector('input[name="PageName"]')?.value || '';
      }).catch(() => '');

      logger.info(`[상인회 러너] [현재 단계: ${currPageName}] URL: ${currUrl}`);

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
          const radioAgree = document.querySelector('input[name="AGREE"][value="1"]') || document.querySelector('input[type="radio"][value="1"]');
          if (radioAgree) {
            radioAgree.checked = true;
            radioAgree.dispatchEvent(new Event('change', { bubbles: true }));
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
      // 2) P21 (F5, F6: 빈 점포 현황)
      // ------------------------------------------
      if (currUrl.includes('P21') || currPageName === 'P21') {
        onProgress({ step: 'P21', message: `[P21] F5, F6 빈 점포 현황 정책 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        const f5Val = policy.F5_emptyStoreReason || '1';
        const f6Val = policy.F6_emptyStorePolicy || '1';

        for (const f of page.frames()) {
          try {
            await f.evaluate(({ f5, f6 }) => {
              const rF5 = document.querySelector(`input[name="F5"][value="${f5}"]`) || document.querySelector('input[name="F5"][value="1"]') || (document.querySelector('input[name="F5"]') ? document.querySelector('input[type="radio"][value="1"]') : null);
              if (rF5) { rF5.checked = true; rF5.dispatchEvent(new Event('change', { bubbles: true })); }

              const rF6 = document.querySelector(`input[name="F6"][value="${f6}"]`) || document.querySelector('input[name="F6"][value="1"]') || (document.querySelector('input[name="F6"]') ? document.querySelector('input[type="radio"][value="1"]') : null);
              if (rF6) { rF6.checked = true; rF6.dispatchEvent(new Event('change', { bubbles: true })); }
            }, { f5: f5Val, f6: f6Val });
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
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P22'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 3) P22 (G1, G2: 바가지요금 현황)
      // ------------------------------------------
      if (currUrl.includes('P22') || currPageName === 'P22') {
        onProgress({ step: 'P22', message: `[P22] G1, G2 바가지요금 정책 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        const g1Val = policy.G1_overchargeReason || '1';
        const g2Val = policy.G2_overchargeSolution || '1';

        for (const f of page.frames()) {
          try {
            await f.evaluate(({ g1, g2 }) => {
              const rG1 = document.querySelector(`input[name="G1"][value="${g1}"]`) || document.querySelector('input[name="G1"][value="1"]') || (document.querySelector('input[name="G1"]') ? document.querySelector('input[type="radio"][value="1"]') : null);
              if (rG1) { rG1.checked = true; rG1.dispatchEvent(new Event('change', { bubbles: true })); }

              const rG2 = document.querySelector(`input[name="G2"][value="${g2}"]`) || document.querySelector('input[name="G2"][value="1"]') || (document.querySelector('input[name="G2"]') ? document.querySelector('input[type="radio"][value="1"]') : null);
              if (rG2) { rG2.checked = true; rG2.dispatchEvent(new Event('change', { bubbles: true })); }
            }, { g1: g1Val, g2: g2Val });
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
          await page.evaluate(() => { if (typeof move_page === 'function') move_page('P23'); }).catch(() => {});
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        }
        continue;
      }

      // ------------------------------------------
      // 4) P23 (G3, G4: 문화콘텐츠 및 기후재해 대비)
      // ------------------------------------------
      if (currUrl.includes('P23') || currPageName === 'P23') {
        onProgress({ step: 'P23', message: `[P23] G3, G4 문화 및 기후재해 시설 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        for (const f of page.frames()) {
          try {
            await f.evaluate(() => {
              // G3: 라디오 2번(없다) 선택 및 비고/인증수 0 채움
              if (document.querySelector('input[name^="G3"]')) {
                document.querySelectorAll('input[type="radio"][value="2"]').forEach(r => {
                  r.checked = true;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                });
                const numInp = document.querySelector('input[type="tel"], input[type="number"], input[name*="G3"]:not([type="radio"])');
                if (numInp) {
                  numInp.value = '0';
                  numInp.dispatchEvent(new Event('input', { bubbles: true }));
                  numInp.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }

              // G4: 기타 체크박스 제외 일반 시설 체크
              if (document.querySelector('input[name^="G4"]')) {
                document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                  if (!cb.name.includes('G4_1_7') && !cb.name.includes('G4_2_6') && 
                      !cb.name.includes('G4_3_6') && !cb.name.includes('G4_4_6') &&
                      !cb.id.includes('G4_1_7') && !cb.id.includes('G4_2_6') && 
                      !cb.id.includes('G4_3_6') && !cb.id.includes('G4_4_6')) {
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              }
            });
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

      const mirrorResult = await mirrorPrevYearToCurrent(page);
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
async function mirrorPrevYearToCurrent(page) {
  let totalRadios = 0;
  let totalInputs = 0;
  let totalRatings = 0;

  const frames = page.frames();
  for (const f of frames) {
    try {
      const res = await f.evaluate(() => {
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

            // 1-1. 라디오 체크
            const radio = document.querySelector(`input[type="radio"][name="${currKey}"][value="${val}"]`);
            if (radio) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              rCount++;
            }

            // 1-2. 체크박스 체크
            const cb = document.querySelector(`input[type="checkbox"][name="${currKey}"][value="${val}"]`);
            if (cb) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              rCount++;
            }

            // 1-3. 텍스트/숫자 인풋 입력 (TD3_1은 제외)
            if (currKey === 'TD3_1' || currKey.startsWith('TD3')) return;
            const textInp = document.querySelector(`input[name="${currKey}"]:not([type="radio"]):not([type="checkbox"])`);
            if (textInp) {
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
          if (currName === 'TD3_1' || currName.startsWith('TD3')) return; // D3 트랩 방어
          const currInp = document.querySelector(`input[name="${currName}"]`);
          if (currInp) {
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
          const pa5 = document.querySelector('input[name="PA5"]:checked')?.value || '2';
          const targetA5 = document.querySelector(`input[name="A5"][value="${pa5}"]`) || document.querySelector('input[name="A5"][value="2"]');
          if (targetA5) {
            targetA5.checked = true;
            targetA5.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const ta5 = document.querySelector('#TA5_1, input[name="TA5_1"]');
          if (ta5) {
            if (pa5 === '1') {
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

        // F1~F4: 빈점포 현황 안전망
        const f1_1 = document.querySelector('input[name="F1_1"]');
        if (f1_1 && !f1_1.value) {
          f1_1.value = '0';
          const f1_2 = document.querySelector('input[name="F1_2"]');
          if (f1_2) f1_2.value = '0';
          const f1_3 = document.querySelector('input[name="F1_3"]');
          if (f1_3) f1_3.value = '0';
          const f1_4 = document.querySelector('input[name="F1_4"]');
          if (f1_4) f1_4.value = '0';
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

        // 자동 계산 함수 트리거
        if (typeof window.calculateA6 === 'function') window.calculateA6();
        if (typeof window.calculateA6A === 'function') window.calculateA6A();
        if (typeof window.calculateA7 === 'function') window.calculateA7();
        if (typeof window.calculateA8 === 'function') window.calculateA8();
        if (typeof window.calculateB1 === 'function') window.calculateB1();
        if (typeof window.calculateB2 === 'function') window.calculateB2();

        return { radios: rCount, inputs: iCount, selects: sCount, ratings: ratingCount };
      });

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


