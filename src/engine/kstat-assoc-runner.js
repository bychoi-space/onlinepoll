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
      // 2-0) P20 (F1 ~ F4: 빈 점포 현황 수치 주입)
      // ------------------------------------------
      if (currUrl.includes('P20') || currPageName === 'P20') {
        onProgress({ step: 'P20', message: `[P20] F1~F4 빈 점포 수치 자동 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        await mirrorPrevYearToCurrent(page, { preserveExisting });

        // F1.asp 내부 F1_2(현재 영업중 점포수), F1_3(신규 빈점포수) 빈칸 방어 (Alert 원천 차단)
        for (const f of page.frames()) {
          try {
            await f.evaluate(() => {
              const f1_2 = document.querySelector('input[name="F1_2"]');
              if (f1_2 && (!f1_2.value || f1_2.value.trim() === '')) {
                f1_2.value = '0';
                f1_2.dispatchEvent(new Event('input', { bubbles: true }));
                f1_2.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const f1_3 = document.querySelector('input[name="F1_3"]');
              if (f1_3 && (!f1_3.value || f1_3.value.trim() === '')) {
                f1_3.value = '0';
                f1_3.dispatchEvent(new Event('input', { bubbles: true }));
                f1_3.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (typeof calcF1_4 === 'function') {
                calcF1_4();
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
      // 2) P21 (F5, F6: 빈 점포 현황)
      // ------------------------------------------
      if (currUrl.includes('P21') || currPageName === 'P21') {
        onProgress({ step: 'P21', message: `[P21] F5, F6 빈 점포 현황 정책 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        // 1~5 랜덤 분산 지원: 설정값이 'random'인 경우 1~5 중 무작위 정수 선택
        let f5Val = policy.F5_emptyStoreReason || '1';
        if (f5Val === 'random') {
          f5Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위
        }
        let f6Val = policy.F6_emptyStorePolicy || '1';
        if (f6Val === 'random') {
          f6Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위 (6번 기타 제외)
        }

        logger.info(`[상인회 러너] [P21] 정책 답변: F5=${f5Val}${policy.F5_emptyStoreReason === 'random' ? ' (🎲 1~5 랜덤)' : ''}, F6=${f6Val}${policy.F6_emptyStorePolicy === 'random' ? ' (🎲 1~5 랜덤)' : ''}`);

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
      // 3) P22 (G1, G2: 바가지요금 현황)
      // ------------------------------------------
      if (currUrl.includes('P22') || currPageName === 'P22') {
        onProgress({ step: 'P22', message: `[P22] G1, G2 바가지요금 정책 응답 중...` });
        await syncAllChildFrames(page);
        await delay(600);

        // 1~5 랜덤 분산 지원: 설정값이 'random'인 경우 1~5 중 무작위 정수 선택
        let g1Val = policy.G1_overchargeReason || '1';
        if (g1Val === 'random') {
          g1Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위 (6번 기타 제외)
        }
        let g2Val = policy.G2_overchargeSolution || '1';
        if (g2Val === 'random') {
          g2Val = String(Math.floor(Math.random() * 5) + 1); // 1~5 무작위 (6번 기타 제외)
        }

        logger.info(`[상인회 러너] [P22] 정책 답변: G1=${g1Val}${policy.G1_overchargeReason === 'random' ? ' (🎲 1~5 랜덤)' : ''}, G2=${g2Val}${policy.G2_overchargeSolution === 'random' ? ' (🎲 1~5 랜덤)' : ''}`);

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
      // 4) P23 (G3, G4: 문화콘텐츠 및 기후재해 대비)
      // ------------------------------------------
      if (currUrl.includes('P23') || currPageName === 'P23') {
        onProgress({ step: 'P23', message: `[P23] G3, G4 문화 및 기후재해 시설 응답 중...` });
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

              // G4: 체크박스가 이미 체크되어 있다면 보존, 없을 때만 일반 시설 체크
              if (document.querySelector('input[name^="G4"]')) {
                const g4Checked = document.querySelectorAll('input[type="checkbox"][name^="G4"]:checked');
                if (!preserveExisting || g4Checked.length === 0) {
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
          if (currName === 'TD3_1' || currName.startsWith('TD3')) return; // D3 트랩 방어
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


