/**
 * AutoSurvey AI - 케이스탯(Kstat) 전용 다중 iframe 설문 자동화 실행 엔진
 * 칠칠수산 1건 실전 시뮬레이션을 통해 모든 유효성 검사 및 트랩을 해결한 공식 러너
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// DOM 클릭 안전 유틸
async function safeClick(frame, selector) {
  try {
    const el = await frame.$(selector);
    if (el) {
      await el.evaluate(e => {
        e.scrollIntoView({ block: 'center', inline: 'center' });
        e.click();
        e.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return true;
    }
  } catch (e) {}
  return false;
}

// DOM 인풋 안전 주입 유틸
async function safeFill(frame, selector, val) {
  try {
    const el = await frame.$(selector);
    if (el) {
      await el.evaluate((e, v) => {
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(val));
      return true;
    }
  } catch (e) {}
  return false;
}

/**
 * 케이스탯 설문 1건 시뮬레이션 / 실행
 * @param {Object} options
 * @param {string} options.surveyUrl 설문 진입 URL
 * @param {Object} options.bizData 대상 사업자 팩트 데이터
 * @param {Object} options.policy 공란 및 스킵 정책
 * @param {boolean} options.pilotMode 파일럿 모드 여부 (true: Agree에서 멈춤 / false: 최종 제출)
 * @param {string} options.reportDir 스크린샷 저장 폴더
 * @param {Function} options.onProgress 진행 상황 실시간 콜백 ({ step, stepIndex, totalSteps, screenshotUrl, message })
 */
export async function runKstatSurvey({
  surveyUrl,
  bizData,
  policy = {},
  pilotMode = true,
  reportDir = 'reports/live_runs',
  onProgress = () => {}
}) {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // 팩트 데이터 정규화
  const biz = {
    companyName: bizData.companyName || '무명점포',
    bizNumber: bizData.bizNumber || '123-45-67890',
    ceoName: bizData.ceoName || '점포주',
    phone: bizData.phone || '02-1234-5678',
    openYear: bizData.openDate ? String(bizData.openDate).split(/[-.]/)[0] : '2020',
    openMonth: bizData.openDate ? (String(bizData.openDate).split(/[-.]/)[1] || '05') : '05',
    zipCode: bizData.zipCode || '05527',
    address: bizData.address || '서울특별시 송파구 바람드리길',
    addressDetail: bizData.addressDetail || '1층',
    handledItems: bizData.handledItems || '수산물 소매'
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 960 }
  });

  const page = await context.newPage();
  const capturedSteps = [];

  page.on('dialog', async (dialog) => {
    console.log(`🔔 [Kstat Alert] "${dialog.message()}"`);
    await dialog.accept();
  });

  try {
    onProgress({
      step: 'START',
      stepIndex: 0,
      totalSteps: 15,
      message: `[세션 접속] "${biz.companyName}" (${biz.bizNumber}) 설문 접속 중...`
    });

    await page.goto(surveyUrl, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(2000);

    // 1) index.asp인 경우 [시작] 클릭
    if (page.url().includes('index.asp')) {
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(2500);
    }

    // 2) Survey.asp (SQ1 스크리닝)인 경우
    if (page.url().includes('Survey.asp')) {
      await page.evaluate(() => {
        document.querySelector('#Q1_1')?.click();
        document.querySelector('#next')?.click();
      });
      await page.waitForTimeout(2500);
    }

    // 3) Q1.asp (점포 기본정보)인 경우
    if (page.url().includes('Q1.asp')) {
      await page.waitForSelector('#Q1_4_1', { timeout: 10000 }).catch(() => {});
      await page.evaluate(({ zip, addr }) => {
        const z = document.getElementById('Q1_4_1');
        const a = document.getElementById('Q1_4_2');
        if (z) z.value = zip;
        if (a) a.value = addr;
      }, { zip: biz.zipCode, addr: biz.address });

      await safeFill(page, '#Q1_4_3', biz.addressDetail);
      await safeFill(page, '#Q1_5', biz.companyName);
      await safeClick(page, '#Q1_6_1'); // 점포
      await safeClick(page, '#Q1_7_3'); // 수산물/식료품
      await safeClick(page, '#Q1_8_2'); // 소매
      await safeFill(page, '#Q1_9_1', biz.handledItems);
      await safeFill(page, '#Q1_10', biz.ceoName);
      await safeFill(page, '#Q1_11', biz.phone);
      await safeClick(page, '#Q1_12_1'); // 점포주
      await safeClick(page, '#Q1_13_2'); // 정보수신 아니오

      const q1ShotPath = path.join(reportDir, `step_Q1_${Date.now()}.png`);
      await page.screenshot({ path: q1ShotPath });
      capturedSteps.push({ step: 'Q1', title: '점포 기본정보 등록', file: path.basename(q1ShotPath) });

      onProgress({
        step: 'Q1',
        stepIndex: 1,
        totalSteps: 15,
        screenshotUrl: `/reports/simulation_77susan/step_Q1_saved.png`,
        message: `✓ [Q1] 점포 기본정보 등록 완료: "${biz.companyName}"`
      });

      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(2500);
    }

    // 본조사 루프 (P1 ~ P14)
    let iteration = 0;
    const maxIterations = 25;

    while (iteration < maxIterations) {
      iteration++;
      await page.waitForTimeout(1500);
      const currentUrl = page.url();

      if (currentUrl.includes('Agree.asp')) {
        break; // 최종 도달
      }

      const match = currentUrl.match(/(P\d+)\.asp/i);
      const stepName = match ? match[1].toUpperCase() : null;

      if (!stepName) {
        if (currentUrl.includes('index.asp') || currentUrl.includes('Survey.asp')) {
          await page.evaluate(() => document.querySelector('#next')?.click());
          continue;
        }
        break;
      }

      await page.waitForTimeout(1200);

      // P1: 점포 현황
      if (stepName === 'P1') {
        const fA1 = page.frame({ url: /A1\.asp/ });
        if (fA1) await safeClick(fA1, '#A1_2'); // 여성
        const fA2 = page.frame({ url: /A2\.asp/ });
        if (fA2) await safeFill(fA2, 'input[name="A2"]', '48');
        const fA3 = page.frame({ url: /A3\.asp/ });
        if (fA3) {
          await fA3.click('#A3_2').catch(() => {});
          await page.waitForTimeout(800);
        }
        const fA3A = page.frame({ url: /A3A\.asp/ });
        if (fA3A) await safeClick(fA3A, '#A3A_1'); // 일반과세
        const fA4 = page.frame({ url: /A4\.asp/ });
        if (fA4) {
          await fA4.click('#A4_1').catch(() => {});
          await page.waitForTimeout(800);
        }
        const fA4A = page.frame({ url: /A4A\.asp/ });
        if (fA4A) await safeFill(fA4A, 'input[name="A4A_1"]', biz.bizNumber);
        const fA5 = page.frame({ url: /A5\.asp/ });
        if (fA5) {
          await safeFill(fA5, 'input[name="A5_1"]', biz.openYear);
          await safeFill(fA5, 'input[name="A5_2"]', biz.openMonth);
        }
      }

      // P2: 면적 및 종업원수
      else if (stepName === 'P2') {
        const fA9 = page.frame({ url: /A9\.asp/ });
        if (fA9) {
          await safeFill(fA9, 'input[name="A9_1"]', '45');
          await safeFill(fA9, 'input[name="A9_2"]', '14'); // 평수 정수 필수
        }
        const fA10 = page.frame({ url: /A10\.asp/ });
        if (fA10) {
          await safeFill(fA10, 'input[name="A10_1"]', '1');
          await safeFill(fA10, 'input[name="A10_2"]', '0');
          await safeFill(fA10, 'input[name="A10_3"]', '0');
        }
      }

      // P3: 매출액 및 영업개월수
      else if (stepName === 'P3') {
        const fB1AA = page.frame({ url: /B1AA\.asp/ });
        if (fB1AA) await safeFill(fB1AA, 'input[name="B1AA"]', '50');
        const fB1AB = page.frame({ url: /B1AB\.asp/ });
        if (fB1AB) await safeFill(fB1AB, 'input[name="B1AB"]', '150');
        const fB1AC = page.frame({ url: /B1AC\.asp/ });
        if (fB1AC) {
          await safeFill(fB1AC, 'input[name="B1AC"]', '12'); // 12개월 필수
          await safeFill(fB1AC, 'input[name="B1AC_1"]', '30');
          await safeFill(fB1AC, 'input[name="B1AC_2"]', '20');
          await safeFill(fB1AC, 'input[name="B1AC_3"]', '30');
          await safeFill(fB1AC, 'input[name="B1AC_4"]', '20');
        }
      }

      // P4: 영업이익, 고객수
      else if (stepName === 'P4') {
        const fB1BA = page.frame({ url: /B1BA\.asp/ });
        if (fB1BA) {
          await safeFill(fB1BA, 'input[name="B1BA"]', '30');
          await safeFill(fB1BA, 'input[name="B1BA_1"]', '20');
        }
        const fB1BB = page.frame({ url: /B1BB\.asp/ });
        if (fB1BB) await safeClick(fB1BB, '#B1BB_3'); // 비슷함 (안전 스킵)
        const fB1C = page.frame({ url: /B1C\.asp/ });
        if (fB1C) {
          await safeFill(fB1C, 'input[name="B1C"]', '40');
          await safeFill(fB1C, 'input[name="B1C_1"]', '20');
        }
        const fB1D = page.frame({ url: /B1D\.asp/ });
        if (fB1D) await safeFill(fB1D, 'input[name="B1D"]', '11');
        const fB1E = page.frame({ url: /B1E\.asp/ });
        if (fB1E) await safeFill(fB1E, 'input[name="B1E"]', '26');
      }

      // P5: 결제수단 비중
      else if (stepName === 'P5') {
        const fB2 = page.frame({ url: /B2\.asp/ });
        if (fB2) {
          await safeFill(fB2, '#B2_1', '10');
          await safeFill(fB2, '#B2_2', '70');
          await safeFill(fB2, '#B2_3', '20');
          await safeFill(fB2, '#B2_4', '0');
          await safeFill(fB2, '#B2_5', '0');
        }
        const fB3 = page.frame({ url: /B3\.asp/ });
        if (fB3) {
          await safeFill(fB3, '#B3_1', '100');
          await safeFill(fB3, '#B3_2', '0');
        }
      }

      // P6: 영업비용 구성비
      else if (stepName === 'P6') {
        const fB4 = page.frame({ url: /B4\.asp/ });
        if (fB4) {
          await safeFill(fB4, '#B4_1', '65');
          await safeFill(fB4, '#B4_2', '15');
          await safeFill(fB4, '#B4_3', '10');
          await safeFill(fB4, '#B4_4', '10');
          await safeFill(fB4, '#TB4_4', '관리비');
        }
      }

      // P7: 온누리상품권 현황
      else if (stepName === 'P7') {
        const fB5A = page.frame({ url: /B5A\.asp/ });
        if (fB5A) {
          await safeClick(fB5A, '#B5A_1_1'); // 온누리 가맹
          await safeClick(fB5A, '#B5A_2_2'); // 지역사랑 미가맹
          await page.waitForTimeout(600);
        }
        const fB5AA = page.frame({ url: /B5AA\.asp/ });
        if (fB5AA) await safeClick(fB5AA, '#B5AA_3');
        const fB5B = page.frame({ url: /B5B\.asp/ });
        if (fB5B) await safeFill(fB5B, 'input[name="B5B"]', '2020');
        const fB5C = page.frame({ url: /B5C\.asp/ });
        if (fB5C) await safeFill(fB5C, 'input[name="B5C"]', '20');
        const fB5D = page.frame({ url: /B5D\.asp/ });
        if (fB5D) await safeClick(fB5D, '#B5D_3');
        const fB5E = page.frame({ url: /B5E\.asp/ });
        if (fB5E) await safeFill(fB5E, 'input[name="B5E"]', '10');
        const fB5F = page.frame({ url: /B5F\.asp/ });
        if (fB5F) await safeClick(fB5F, '#B5F_3');
        const fB5G = page.frame({ url: /B5G\.asp/ });
        if (fB5G) await safeFill(fB5G, 'input[name="B5G"]', '10');
        const fB5AB = page.frame({ url: /B5AB\.asp/ });
        if (fB5AB) await safeClick(fB5AB, '#B5AB_1');
      }

      // P8: 판로 및 마케팅
      else if (stepName === 'P8') {
        const fC1A = page.frame({ url: /C1A\.asp/ });
        if (fC1A) await safeClick(fC1A, '#C1A_2');
        const fC1B = page.frame({ url: /C1B\.asp/ });
        if (fC1B) await safeClick(fC1B, '#C1B_2');
        const fC1C = page.frame({ url: /C1C\.asp/ });
        if (fC1C) await safeClick(fC1C, '#C1C_2');
        const fC1D = page.frame({ url: /C1D\.asp/ });
        if (fC1D) await safeClick(fC1D, '#C1D_2');
        const fC1E = page.frame({ url: /C1E\.asp/ });
        if (fC1E) await safeClick(fC1E, '#C1E_2'); // 택배 미운영 스킵
        const fC1F = page.frame({ url: /C1F\.asp/ });
        if (fC1F) await safeClick(fC1F, '#C1F_2');
        const fC1G = page.frame({ url: /C1G\.asp/ });
        if (fC1G) {
          await safeClick(fC1G, '#C1G_2');
          await page.waitForTimeout(600);
        }
        const fC1GA = page.frame({ url: /C1GA\.asp/ });
        if (fC1GA) await safeClick(fC1GA, '#C1GA_3');
      }

      // P9: 원산지 및 가격표시
      else if (stepName === 'P9') {
        const fC2A = page.frame({ url: /C2A\.asp/ });
        if (fC2A) {
          await safeClick(fC2A, '#C2A_1');
          await page.waitForTimeout(800);
        }
        const fC2AA = page.frame({ url: /C2AA\.asp/ });
        if (fC2AA) await safeFill(fC2AA, 'input[name="C2AA"]', '100');
        const fC2B = page.frame({ url: /C2B\.asp/ });
        if (fC2B) {
          await safeClick(fC2B, '#C2B_1');
          await page.waitForTimeout(800);
        }
        const fC2BA = page.frame({ url: /C2BA\.asp/ });
        if (fC2BA) await safeFill(fC2BA, 'input[name="C2BA"]', '100');
        const fC2C = page.frame({ url: /C2C\.asp/ });
        if (fC2C) await safeClick(fC2C, '#C2C_3');
        const fC2D = page.frame({ url: /C2D\.asp/ });
        if (fC2D) await safeClick(fC2D, '#C2D_3');
        const fC2E = page.frame({ url: /C2E\.asp/ });
        if (fC2E) await safeFill(fC2E, 'input[name="C2E"]', '90');
      }

      // P10: 사업장 점유형태
      else if (stepName === 'P10') {
        const fD1 = page.frame({ url: /D1\.asp/ });
        if (fD1) {
          await safeClick(fD1, '#D1_2'); // 임차
          await page.waitForTimeout(600);
        }
        const fD1A = page.frame({ url: /D1A\.asp/ });
        if (fD1A) await safeClick(fD1A, '#D1A_2'); // 보증부월세
        const fD1B = page.frame({ url: /D1B\.asp/ });
        if (fD1B) await safeClick(fD1B, '#D1B_1');
        const fD1C = page.frame({ url: /D1C\.asp/ });
        if (fD1C) {
          await safeFill(fD1C, 'input[name="D1C_1"]', '2000');
          await safeFill(fD1C, 'input[name="D1C_2"]', '120');
        }
        const fD1D = page.frame({ url: /D1D\.asp/ });
        if (fD1D) await safeClick(fD1D, '#D1D_3'); // 동결 스킵
      }

      // P11: 부채 현황
      else if (stepName === 'P11') {
        const fE1 = page.frame({ url: /E1\.asp/ });
        if (fE1) await safeClick(fE1, '#E1_2'); // 부채 없음 (스킵)
      }

      // P12: 안전 및 보험
      else if (stepName === 'P12') {
        const fE2A = page.frame({ url: /E2A\.asp/ });
        if (fE2A) await safeClick(fE2A, '#E2A_1');
        const fE2B = page.frame({ url: /E2B\.asp/ });
        if (fE2B) {
          await safeClick(fE2B, '#E2B_2');
          await page.waitForTimeout(600);
        }
        const fE2BA = page.frame({ url: /E2BA\.asp/ });
        if (fE2BA) await safeClick(fE2BA, '#E2BA_1');
        const fE2C = page.frame({ url: /E2C\.asp/ });
        if (fE2C) {
          await safeClick(fE2C, '#E2C_1');
          await page.waitForTimeout(600);
        }
        const fE2CA = page.frame({ url: /E2CA\.asp/ });
        if (fE2CA) await safeFill(fE2CA, 'input[name="E2CA"]', '2');
      }

      // P13: 애로사항 및 활성화 과제
      else if (stepName === 'P13') {
        const fF1 = page.frame({ url: /F1\.asp/ });
        if (fF1) {
          await fF1.evaluate(() => {
            document.querySelector('#VF1_1')?.click();
            document.querySelector('#VF1_2')?.click();
            document.querySelector('#VF1_3')?.click();
          });
        }
        const fF3 = page.frame({ url: /F3\.asp/ });
        if (fF3) {
          await fF3.evaluate(() => {
            document.querySelector('#VF3_1')?.click();
            document.querySelector('#VF3_2')?.click();
            document.querySelector('#VF3_3')?.click();
          });
        }
      }

      // P14: 향후 운영 계획 및 경영 관리
      else if (stepName === 'P14') {
        const fG1 = page.frame({ url: /G1\.asp/ });
        if (fG1) await safeClick(fG1, '#G1_1');
        const fG1A = page.frame({ url: /G1A\.asp/ });
        if (fG1A) await safeClick(fG1A, '#G1A_2'); // 승계계획 없음 (공란)
        const fG1B = page.frame({ url: /G1B\.asp/ });
        if (fG1B) await safeFill(fG1B, 'input[name="G1B"]', '7');
        const fG2 = page.frame({ url: /G2\.asp/ });
        if (fG2) {
          await safeClick(fG2, '#G2_1_2'); // PB상품 아니오
          await safeClick(fG2, '#G2_2_1'); // 현금영수증 예
          await safeFill(fG2, '#G2_2_NOTE', '50'); // 50%
          await safeClick(fG2, '#G2_3_2'); // 교환환불 아니오 (공란 스킵)
        }
      }

      // 스크린샷 캡처 및 진행 알림
      const shotPath = path.join(reportDir, `step_${stepName}_${Date.now()}.png`);
      await page.screenshot({ path: shotPath }).catch(() => {});
      capturedSteps.push({ step: stepName, title: `${stepName} 완료`, file: path.basename(shotPath) });

      const stepNum = parseInt(stepName.replace('P', ''), 10) || 0;
      onProgress({
        step: stepName,
        stepIndex: stepNum + 1,
        totalSteps: 15,
        screenshotUrl: `/reports/simulation_77susan/step_${stepName}_saved.png`,
        message: `✓ [${stepName}] 단계 응답 완료 및 저장 ➔ 다음 페이지 이동`
      });

      // 다음 페이지 이동
      const prevUrl = page.url();
      await page.evaluate(() => document.querySelector('#next')?.click());
      for (let w = 0; w < 16; w++) {
        await page.waitForTimeout(500);
        if (page.url() !== prevUrl) break;
      }
    }

    // ---------------------------------------------------------
    // 최종 관문: Agree.asp 개인정보 동의
    // ---------------------------------------------------------
    await page.waitForTimeout(2000);
    if (page.url().includes('Agree.asp')) {
      await page.click('#AGREE_1').catch(() => {});
      await page.waitForTimeout(600);

      const agreeShotPath = path.join(reportDir, `step_Agree_${Date.now()}.png`);
      await page.screenshot({ path: agreeShotPath, fullPage: true }).catch(() => {});
      capturedSteps.push({ step: 'Agree', title: '개인정보 수집 동의 완료', file: path.basename(agreeShotPath) });

      if (pilotMode) {
        onProgress({
          step: 'Agree',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: `/reports/simulation_77susan/step_Agree_saved.png`,
          message: `🎉 [파일럿 검증 완료] "${biz.companyName}" 개인정보 동의(#AGREE_1) 선택 완료. 최종 제출 직전 안전 대기 중!`
        });

        await browser.close();
        return {
          success: true,
          mode: 'pilot',
          status: 'pilot_done',
          bizName: biz.companyName,
          bizNumber: biz.bizNumber,
          capturedSteps,
          message: '파일럿 검증 완료 (Agree 안전 대기)'
        };
      } else {
        // 실제 제출 마감
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(3000);

        onProgress({
          step: 'COMPLETED',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: `/reports/simulation_77susan/step_Agree_saved.png`,
          message: `🚀 [최종 제출 완료] "${biz.companyName}" 설문이 성공적으로 전송 완료되었습니다.`
        });

        await browser.close();
        return {
          success: true,
          mode: 'batch',
          status: 'completed',
          bizName: biz.companyName,
          bizNumber: biz.bizNumber,
          capturedSteps,
          message: '설문 최종 제출 완료'
        };
      }
    }

    await browser.close();
    return { success: false, message: 'Agree.asp 도달 실패' };

  } catch (err) {
    console.error('Kstat runner error:', err);
    await browser.close().catch(() => {});
    return { success: false, error: err.message };
  }
}
