/**
 * AutoSurvey AI - 케이스탯(Kstat) 전용 다중 iframe 설문 자동화 실행 엔진
 * 1) 사람다운 가변 딜레이 (독해/문항 간/다음 전 텀)
 * 2) 쿼터별 동적 페르소나 (업종, 연령, 매출, 결제비중 합100, 애로사항 편차)
 * 3) 다중 iframe 안전 주입 및 스크린샷 캡처
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { generateQuotaPersona } from './persona-builder.js';

// DOM 클릭 안전 유틸 (사람다운 지연 포함)
async function safeClick(frame, selector) {
  try {
    const el = await frame.$(selector);
    if (el) {
      await el.evaluate(e => {
        e.scrollIntoView({ block: 'center', inline: 'center' });
        e.checked = true;
        e.click();
        e.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof setRadioValue === 'function' && e.name && e.value) {
          try { setRadioValue(e.name, e.value); } catch (_) {}
        }
        const parentTd = e.closest('td');
        if (parentTd && parentTd.onclick) {
          try { parentTd.onclick(); } catch (_) {}
        }
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
 * @param {number} options.quotaIndex 쿼터 순번
 * @param {Object} options.guidelineConfig 캠페인 방향성 및 가중치 설정
 * @param {Object} options.policy 공란 및 스킵 정책
 * @param {boolean} options.pilotMode 파일럿 모드 여부 (true: Agree에서 멈춤 / false: 최종 제출)
 * @param {boolean} options.safetyGuard 최종 제출 안전 가드 여부 (true: Agree에서 멈춤)
 * @param {string} options.reportDir 스크린샷 저장 폴더
 * @param {Function} options.onProgress 진행 상황 실시간 콜백 ({ step, stepIndex, totalSteps, screenshotUrl, message })
 */
export async function runKstatSurvey({
  surveyUrl,
  bizData,
  quotaIndex = 1,
  guidelineConfig = {},
  policy = {},
  pilotMode = true,
  safetyGuard = true,
  reportDir = 'reports/live_runs',
  onProgress = () => {}
}) {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // 웹 브라우저에서 접근 가능한 상대 경로 계산
  const rootReportsDir = path.resolve('reports');
  const absReportDir = path.resolve(reportDir);
  const relFromReports = path.relative(rootReportsDir, absReportDir).replace(/\\/g, '/');
  const webBaseUrl = `/reports/${relFromReports}`;

  // 1. 사업자 팩트 데이터 정규화
  const biz = {
    companyName: bizData.companyName || '무명점포',
    bizNumber: bizData.bizNumber || '123-45-67890',
    ceoName: bizData.ceoName || '점포주',
    phone: bizData.phone || '02-1234-5678',
    openDate: bizData.openDate || '2020-05-01',
    openYear: bizData.openDate ? String(Math.min(2025, parseInt(String(bizData.openDate).split(/[-.]/)[0], 10) || 2020)) : '2020',
    openMonth: bizData.openDate ? (String(bizData.openDate).split(/[-.]/)[1] || '05') : '05',
    zipCode: bizData.zipCode || '05527',
    address: bizData.address || '서울특별시 송파구 바람드리길',
    addressDetail: bizData.addressDetail || '1층',
    handledItems: bizData.handledItems || bizData.industry || '소매업'
  };

  // 2. 쿼터별 동적 페르소나 생성 (업종분류, 연령, 매출, 결제비중 등 가변 데이터)
  const persona = generateQuotaPersona(biz, quotaIndex, guidelineConfig);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 960 }
  });

  const page = await context.newPage();
  const capturedSteps = [];

  // 사람다운 자연스러운 가변 딜레이 헬퍼들 (건당 약 1분 50초 ~ 2분 10초 안정 궤적)
  const readingDelay = () => page.waitForTimeout(Math.floor(Math.random() * 600) + 1200); // 1.2초 ~ 1.8초 질문 독해 텀
  const itemDelay = () => page.waitForTimeout(Math.floor(Math.random() * 200) + 300); // 300ms ~ 500ms 문항 간 텀
  const preNextDelay = () => page.waitForTimeout(Math.floor(Math.random() * 300) + 600); // 600ms ~ 900ms 다음 클릭 전 텀

  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    console.log(`🔔 [Kstat Alert] "${msg}"`);
    try {
      onProgress({
        step: 'ALERT',
        stepIndex: 0,
        totalSteps: 15,
        screenshotUrl: null,
        message: `🔔 [설문 알림] "${msg.replace(/[\r\n]+/g, ' ')}"`
      });
    } catch (_) {}
    await dialog.accept();
  });

  try {
    onProgress({
      step: 'START',
      stepIndex: 0,
      totalSteps: 15,
      message: `[세션 접속] 쿼터 #${quotaIndex} "${biz.companyName}" (${biz.bizNumber}) 접속 시작...`
    });

    await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await readingDelay();

    // 1) index.asp인 경우 [시작] 클릭
    if (page.url().includes('index.asp')) {
      await preNextDelay();
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(1000);
    }

    // 2) Survey.asp (SQ1 스크리닝)인 경우
    if (page.url().includes('Survey.asp')) {
      await readingDelay();
      await page.evaluate(() => {
        document.querySelector('#Q1_1')?.click();
      });
      await preNextDelay();
      await page.evaluate(() => {
        document.querySelector('#next')?.click();
      });
      await page.waitForTimeout(1000);
    }

    // 3) Q1.asp (점포 기본정보)인 경우
    if (page.url().includes('Q1.asp')) {
      await readingDelay();
      await page.waitForSelector('#Q1_4_1', { timeout: 10000 }).catch(() => {});

      await page.evaluate(({ zip, addr }) => {
        const z = document.getElementById('Q1_4_1');
        const a = document.getElementById('Q1_4_2');
        if (z) z.value = zip;
        if (a) a.value = addr;
      }, { zip: biz.zipCode, addr: biz.address });

      await itemDelay();
      await safeFill(page, '#Q1_4_3', biz.addressDetail);
      await safeFill(page, '#Q1_5', biz.companyName);
      await safeClick(page, '#Q1_6_1'); // 점포 형태: 점포

      // 업종별 동적 분류 라디오 매핑 (수산, 농산, 축산, 이미용 등)
      await itemDelay();
      await safeClick(page, persona.industryMeta.selector);

      // Kstat 공식 규칙: @Q1_7 = 7(개인서비스), 9(근린상권) -> Q1_8 보기 4(서비스업), 5(기타)만 허용
      // 그 외 1~6, 8 -> Q1_8 보기 1(도매), 2(소매), 3(도소매), 5(기타) 허용
      const isServiceCategory = persona.industryMeta.selector === '#Q1_7_7' || 
                                persona.industryMeta.selector === '#Q1_7_9' || 
                                persona.industryMeta.categoryName.includes('서비스') ||
                                (persona.industryMeta.subType === '서비스' && persona.industryMeta.selector !== '#Q1_7_6');
      if (isServiceCategory) {
        await safeClick(page, '#Q1_8_4'); // 서비스업
      } else {
        await safeClick(page, '#Q1_8_2'); // 소매업
      }
      await safeFill(page, '#Q1_9_1', biz.handledItems);

      await itemDelay();
      await safeFill(page, '#Q1_10', biz.ceoName);
      await safeFill(page, '#Q1_11', biz.phone);
      await safeClick(page, '#Q1_12_1'); // 응답자: 점포주
      await safeClick(page, '#Q1_13_2'); // 정보수신: 아니오

      capturedSteps.push({
        step: 'Q1',
        stepIndex: 1,
        title: '점포 기본정보 등록'
      });

      onProgress({
        step: 'Q1',
        stepIndex: 1,
        totalSteps: 15,
        screenshotUrl: null,
        message: `✓ [Q1] 점포 기본정보 등록 완료: "${biz.companyName}" (${persona.industryMeta.categoryName})`
      });

      await preNextDelay();
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(1000);
    }

    // 본조사 루프 (P1 ~ P14)
    let iteration = 0;
    const maxIterations = 35;

    while (iteration < maxIterations) {
      iteration++;
      await page.waitForTimeout(1000);
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

      // 사람다운 문항 독해 시간 지연
      await readingDelay();

      // P1: 점포 현황
      if (stepName === 'P1') {
        const fA1 = page.frame({ url: /A1\.asp/ });
        if (fA1) await safeClick(fA1, persona.genderSelector);
        await itemDelay();

        const fA2 = page.frame({ url: /A2\.asp/ });
        if (fA2) await safeFill(fA2, 'input[name="A2"]', persona.age);
        await itemDelay();

        const fA3 = page.frame({ url: /A3\.asp/ });
        if (fA3) {
          await fA3.click('#A3_2').catch(() => {});
          await itemDelay();
        }
        const fA3A = page.frame({ url: /A3A\.asp/ });
        if (fA3A) await safeClick(fA3A, '#A3A_1'); // 일반과세
        await itemDelay();

        const fA4 = page.frame({ url: /A4\.asp/ });
        if (fA4) {
          await fA4.click('#A4_1').catch(() => {});
          await itemDelay();
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
          await safeFill(fA9, 'input[name="A9_1"]', persona.areaSquareMeter);
          await itemDelay();
          await safeFill(fA9, 'input[name="A9_2"]', persona.areaPyeong); // 평수 정수
        }
        await itemDelay();

        const fA10 = page.frame({ url: /A10\.asp/ });
        if (fA10) {
          await safeFill(fA10, 'input[name="A10_1"]', persona.employees.family);
          await safeFill(fA10, 'input[name="A10_2"]', persona.employees.regular);
          await safeFill(fA10, 'input[name="A10_3"]', persona.employees.temp);
        }
      }

      // P3: 매출액 및 영업개월수
      else if (stepName === 'P3') {
        const fB1AA = page.frame({ url: /B1AA\.asp/ });
        if (fB1AA) await safeFill(fB1AA, 'input[name="B1AA"]', persona.sales.daily);
        await itemDelay();

        const fB1AB = page.frame({ url: /B1AB\.asp/ });
        if (fB1AB) await safeFill(fB1AB, 'input[name="B1AB"]', persona.sales.annual);
        await itemDelay();

        const fB1AC = page.frame({ url: /B1AC\.asp/ });
        if (fB1AC) {
          await safeFill(fB1AC, 'input[name="B1AC"]', '12'); // 12개월 필수
          await safeFill(fB1AC, 'input[name="B1AC_1"]', persona.sales.quarters.q1);
          await safeFill(fB1AC, 'input[name="B1AC_2"]', persona.sales.quarters.q2);
          await safeFill(fB1AC, 'input[name="B1AC_3"]', persona.sales.quarters.q3);
          await safeFill(fB1AC, 'input[name="B1AC_4"]', persona.sales.quarters.q4);
        }
      }

      // P4: 영업이익, 고객수
      else if (stepName === 'P4') {
        const fB1BA = page.frame({ url: /B1BA\.asp/ });
        if (fB1BA) {
          await safeFill(fB1BA, 'input[name="B1BA"]', persona.sales.annualProfit);
          await safeFill(fB1BA, 'input[name="B1BA_1"]', persona.sales.monthlyProfit);
        }
        await itemDelay();

        const fB1BB = page.frame({ url: /B1BB\.asp/ });
        if (fB1BB) await safeClick(fB1BB, '#B1BB_3'); // 비슷함 (안전 스킵)
        await itemDelay();

        const fB1C = page.frame({ url: /B1C\.asp/ });
        if (fB1C) {
          await safeFill(fB1C, 'input[name="B1C"]', persona.sales.dailyCustomers);
          await safeFill(fB1C, 'input[name="B1C_1"]', String(Math.round(parseInt(persona.sales.dailyCustomers, 10) * 0.6)));
        }
        const fB1D = page.frame({ url: /B1D\.asp/ });
        if (fB1D) await safeFill(fB1D, 'input[name="B1D"]', '11');
        const fB1E = page.frame({ url: /B1E\.asp/ });
        if (fB1E) await safeFill(fB1E, 'input[name="B1E"]', persona.sales.monthlyOpenDays);
      }

      // P5: 결제수단 비중 (합계 100% 필수)
      else if (stepName === 'P5') {
        const fB2 = page.frame({ url: /B2\.asp/ });
        if (fB2) {
          await safeClick(fB2, '#B2_1_1'); // 현금 취급: 예
          await safeClick(fB2, '#B2_2_1'); // 신용카드 취급: 예
          await safeClick(fB2, '#B2_3_1'); // 온누리상품권 취급: 예
          await safeClick(fB2, '#B2_4_2'); // 지역사랑상품권: 아니오
          await safeClick(fB2, '#B2_5_2'); // 기타/모바일: 아니오
        }
        await itemDelay();

        const fB2A = page.frame({ url: /B2A\.asp/ });
        if (fB2A) {
          await safeFill(fB2A, 'input[name="B2A_1"]', persona.paymentMethods.cash);
          await safeFill(fB2A, 'input[name="B2A_2"]', persona.paymentMethods.card);
          await safeFill(fB2A, 'input[name="B2A_3"]', persona.paymentMethods.onnuri);
          await safeFill(fB2A, 'input[name="B2A_4"]', '0');
          await safeFill(fB2A, 'input[name="B2A_5"]', '0');
        }
        await itemDelay();

        const fB3 = page.frame({ url: /B3\.asp/ });
        if (fB3) {
          await safeFill(fB3, '#B3_1', '100');
          await safeFill(fB3, '#B3_2', '0');
        }
      }

      // P6: 영업비용 구성비 (합계 100% 필수)
      else if (stepName === 'P6') {
        const fB4 = page.frame({ url: /B4\.asp/ });
        if (fB4) {
          await safeFill(fB4, '#B4_1', persona.costs.raw);
          await safeFill(fB4, '#B4_2', persona.costs.rent);
          await safeFill(fB4, '#B4_3', persona.costs.utility);
          await safeFill(fB4, '#B4_4', persona.costs.etc);
          await safeFill(fB4, '#TB4_4', '관리비/공과금');
        }
      }

      // P7: 온누리상품권 현황 (2단계 동적 확장 구조 완벽 해결)
      else if (stepName === 'P7') {
        const fB5A1 = page.frame({ url: /B5A1\.asp/ }) || page.frame({ url: /B5A\.asp/ });
        if (fB5A1) {
          await fB5A1.click('#B5A_1_1, input[value="1"]').catch(async () => {
            await fB5A1.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('B5A_1', '1');
              const r = document.querySelector('#B5A_1_1, input[value="1"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_B5A_1_1');
              if (td && td.onclick) td.onclick();
            });
          });
        }

        const fB5A2 = page.frame({ url: /B5A2\.asp/ });
        if (fB5A2) {
          await fB5A2.click('#B5A_2_2, input[value="2"]').catch(async () => {
            await fB5A2.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('B5A_2', '2');
              const r = document.querySelector('#B5A_2_2, input[value="2"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_B5A_2_2');
              if (td && td.onclick) td.onclick();
            });
          });
        }

        // 1단계: 라디오 선택 후 동적 하위 iframe 로딩 대기 (최대 2초)
        let fB5B1 = page.frame({ url: /B5B1\.asp/ });
        if (!fB5B1) {
          for (let w = 0; w < 4; w++) {
            await page.waitForTimeout(500);
            fB5B1 = page.frame({ url: /B5B1\.asp/ });
            if (fB5B1) break;
          }
        }

        // 여전히 미생성 시 1차 next 클릭으로 Alert 유발 및 동적 로드 트리거
        if (!fB5B1) {
          await page.evaluate(() => document.querySelector('#next')?.click());
          await page.waitForTimeout(1500);

          // 추가 문항 프레임 로딩 대기 (최대 5초)
          for (let w = 0; w < 10; w++) {
            fB5B1 = page.frame({ url: /B5B1\.asp/ });
            if (fB5B1) break;
            await page.waitForTimeout(500);
          }
        }

        if (fB5B1) {
          const joinYearVal = String(persona.onnuri.joinYear);
          await fB5B1.fill('input[name="B5B_1"], input[type="tel"], input[type="text"]', joinYearVal).catch(async () => {
            await fB5B1.evaluate((val) => {
              const inp = document.querySelector('input[name="B5B_1"], input[type="tel"], input[type="text"]');
              if (inp) {
                inp.value = val;
                inp.dispatchEvent(new Event('input'));
                inp.dispatchEvent(new Event('change'));
              }
            }, joinYearVal);
          });
        }

        let fB5C1 = page.frame({ url: /B5C1\.asp/ });
        if (fB5C1) {
          const salesRatioVal = String(persona.onnuri.salesRatio);
          await fB5C1.fill('input[name="B5C_1"], input[type="tel"], input[type="text"]', salesRatioVal).catch(async () => {
            await fB5C1.evaluate((val) => {
              const inp = document.querySelector('input[name="B5C_1"], input[type="tel"], input[type="text"]');
              if (inp) {
                inp.value = val;
                inp.dispatchEvent(new Event('input'));
                inp.dispatchEvent(new Event('change'));
              }
            }, salesRatioVal);
          });
        }

        let fB5D1 = page.frame({ url: /B5D1\.asp/ });
        if (fB5D1) {
          await fB5D1.click('#B5D_1_3, input[value="3"]').catch(async () => {
            await fB5D1.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('B5D_1', '3');
              const r = document.querySelector('#B5D_1_3, input[value="3"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_B5D_1_3');
              if (td && td.onclick) td.onclick();
            });
          });
        }

        let fB5F1 = page.frame({ url: /B5F1\.asp/ });
        if (fB5F1) {
          await fB5F1.click('#B5F_1_3, input[value="3"]').catch(async () => {
            await fB5F1.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('B5F_1', '3');
              const r = document.querySelector('#B5F_1_3, input[value="3"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_B5F_1_3');
              if (td && td.onclick) td.onclick();
            });
          });
        }

        const fB5AB = page.frame({ url: /B5AB\.asp/ });
        if (fB5AB) {
          await fB5AB.click('#B5AB_1, input[value="1"]').catch(async () => {
            await fB5AB.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('B5AB', '1');
              const r = document.querySelector('#B5AB_1, input[value="1"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_B5AB_1');
              if (td && td.onclick) td.onclick();
            });
          });
        }
      }

      // P8: 판로 및 마케팅 (동적 C1GA 확장 완벽 해결)
      else if (stepName === 'P8') {
        for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
          const f = page.frame({ url: new RegExp('C1' + letter + '\\.asp') });
          if (f) {
            await f.click(`#C1${letter}_2, input[value="2"]`).catch(async () => {
              await f.evaluate((l) => {
                const varName = 'C1' + l;
                if (typeof setRadioValue === 'function') setRadioValue(varName, '2');
                const r = document.querySelector(`#${varName}_2, input[value="2"]`);
                if (r) { r.checked = true; r.click(); }
                const td = document.querySelector(`#TD_${varName}_2`);
                if (td && td.onclick) td.onclick();
              }, letter);
            });
          }
        }

        // 1차 클릭 (C1GA Alert 트리거 및 동적 로드 - 기노출되지 않았을 때만)
        let fGA = page.frame({ url: /C1GA\.asp/ });
        if (!fGA) {
          await page.evaluate(() => document.querySelector('#next')?.click());
          await page.waitForTimeout(1500);

          for (let w = 0; w < 10; w++) {
            fGA = page.frame({ url: /C1GA\.asp/ });
            if (fGA) break;
            await page.waitForTimeout(500);
          }
        }

        // 2단계: C1GA(미운영 사유) 프레임 주입
        if (fGA) {
          await fGA.click('#C1GA_1, input[value="1"]').catch(async () => {
            await fGA.evaluate(() => {
              if (typeof setRadioValue === 'function') setRadioValue('C1GA', '1');
              const r = document.querySelector('#C1GA_1, input[value="1"]');
              if (r) { r.checked = true; r.click(); }
              const td = document.querySelector('#TD_C1GA_1');
              if (td && td.onclick) td.onclick();
            });
          });
        }
      }

      // P9: 원산지 및 가격표시
      else if (stepName === 'P9') {
        const fC2A = page.frame({ url: /C2A\.asp/ });
        if (fC2A) {
          await fC2A.evaluate(() => {
            const r = document.querySelector('#C2A_2, input[value="2"]');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }
        const fC2B = page.frame({ url: /C2B\.asp/ });
        if (fC2B) {
          await fC2B.evaluate(() => {
            const r = document.querySelector('#C2B_2, input[value="2"]');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }
        const fC2C = page.frame({ url: /C2C\.asp/ });
        if (fC2C) {
          await fC2C.evaluate(() => {
            const r = document.querySelector('#C2C_3, #C2C_2, input[value="3"], input[value="2"]');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }
        const fC2D = page.frame({ url: /C2D\.asp/ });
        if (fC2D) {
          await fC2D.evaluate(() => {
            const r = document.querySelector('#C2D_3, #C2D_2, input[value="3"], input[value="2"]');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }
        const fC2E = page.frame({ url: /C2E\.asp/ });
        if (fC2E) {
          await fC2E.evaluate(() => {
            const inp = document.querySelector('input[name="C2E"], input[type="tel"], input[type="text"]');
            if (inp) {
              inp.value = '80';
              inp.dispatchEvent(new Event('input'));
              inp.dispatchEvent(new Event('change'));
            }
          }).catch(() => {});
        }
      }

      // P10: 사업장 점유형태
      else if (stepName === 'P10') {
        const fD1 = page.frame({ url: /D1\.asp/ });
        if (fD1) {
          if (persona.lease.isRent) {
            await safeClick(fD1, '#D1_2'); // 임차
            await itemDelay();
            const fD1A = page.frame({ url: /D1A\.asp/ });
            if (fD1A) await safeClick(fD1A, '#D1A_2'); // 보증부월세
            const fD1B = page.frame({ url: /D1B\.asp/ });
            if (fD1B) await safeClick(fD1B, '#D1B_1');
            const fD1C = page.frame({ url: /D1C\.asp/ });
            if (fD1C) {
              await safeFill(fD1C, 'input[name="D1C_1"]', persona.lease.deposit);
              await safeFill(fD1C, 'input[name="D1C_2"]', persona.lease.monthlyRent);
            }
            const fD1D = page.frame({ url: /D1D\.asp/ });
            if (fD1D) await safeClick(fD1D, '#D1D_3'); // 동결 스킵
          } else {
            await safeClick(fD1, '#D1_1'); // 자가 소유 (세부 임대차 스킵)
          }
        }
      }

      // P11: 부채 현황 (부채 없음 선택)
      else if (stepName === 'P11') {
        const fE1 = page.frame({ url: /E1\.asp/ });
        if (fE1) {
          const clicked = await fE1.click('#E1_2, input[value="2"]').then(() => true).catch(() => false);
          if (!clicked) {
            await safeClick(fE1, '#E1_2');
          }
          await fE1.evaluate(() => {
            if (typeof setRadioValue === 'function') setRadioValue('E1', '2');
            const r = document.querySelector('#E1_2, input[value="2"]');
            if (r) { r.checked = true; r.click(); }
            const td = document.querySelector('#TD_E1_2') || r?.closest('td');
            if (td && td.onclick) td.onclick();
          }).catch(() => {});
        }
      }

      // P12: 안전 및 보험 (동적 확장 없는 필수 가입 선택으로 깔끔한 원패스 통과)
      else if (stepName === 'P12') {
        const fE2A = page.frame({ url: /E2A\.asp/ });
        if (fE2A) {
          await fE2A.click('#E2A_1, input[value="1"]', { timeout: 1500 }).catch(async () => {
            await safeClick(fE2A, '#E2A_1');
          });
        }
        const fE2B = page.frame({ url: /E2B\.asp/ });
        if (fE2B) {
          await fE2B.click('#E2B_1, input[value="1"]', { timeout: 1500 }).catch(async () => {
            await safeClick(fE2B, '#E2B_1');
          });
        }
        const fE2C = page.frame({ url: /E2C\.asp/ });
        if (fE2C) {
          await fE2C.click('#E2C_2, input[value="2"]', { timeout: 1500 }).catch(async () => {
            await safeClick(fE2C, '#E2C_2');
          });
        }
      }

      // P13: 애로사항 및 활성화 과제 (사업자별 서로 다른 3종 선택 - 1~8 및 1~10 범위 엄수)
      else if (stepName === 'P13') {
        const fF1 = page.frame({ url: /F1\.asp/ });
        if (fF1) {
          const [f1_a, f1_b, f1_c] = persona.issues.f1;
          await fF1.evaluate(([a, b, c]) => {
            document.querySelector(`#VF1_${a}`)?.click();
            document.querySelector(`#VF1_${b}`)?.click();
            document.querySelector(`#VF1_${c}`)?.click();
          }, [f1_a, f1_b, f1_c]).catch(() => {});
        }
        await itemDelay();

        const fF3 = page.frame({ url: /F3\.asp/ });
        if (fF3) {
          const [f3_a, f3_b, f3_c] = persona.issues.f3;
          await fF3.evaluate(([a, b, c]) => {
            document.querySelector(`#VF3_${a}`)?.click();
            document.querySelector(`#VF3_${b}`)?.click();
            document.querySelector(`#VF3_${c}`)?.click();
          }, [f3_a, f3_b, f3_c]).catch(() => {});
        }
      }

      // P14: 향후 운영 계획 및 경영 관리 (2단계 동적 확장 구조 완벽 해결)
      else if (stepName === 'P14') {
        const fG1 = page.frame({ url: /G1\.asp/ });
        if (fG1) {
          await fG1.evaluate(() => {
            if (typeof setRadioValue === 'function') setRadioValue('G1', '1');
            const r = document.querySelector('#G1_1');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }

        const fG2 = page.frame({ url: /G2\.asp/ });
        if (fG2) {
          await fG2.evaluate(() => {
            const r1 = document.querySelector('#G2_1_2');
            if (r1) { r1.checked = true; r1.click(); }
            const r2 = document.querySelector('#G2_2_1');
            if (r2) { r2.checked = true; r2.click(); }
            const note = document.querySelector('#G2_2_NOTE');
            if (note) note.value = '50';
            const r3 = document.querySelector('#G2_3_2');
            if (r3) { r3.checked = true; r3.click(); }
          }).catch(() => {});
        }

        // 1차 클릭: G1A, G1B 동적 로드 트리거 및 Alert 수락
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(1500);

        // 2단계: 화면에 동적으로 생성된 G1A(승계계획), G1B(지속년수) 주입
        const fG1A = page.frame({ url: /G1A\.asp/ });
        if (fG1A) {
          await fG1A.evaluate(() => {
            if (typeof setRadioValue === 'function') setRadioValue('G1A', '2');
            const r = document.querySelector('#G1A_2');
            if (r) { r.checked = true; r.click(); }
          }).catch(() => {});
        }

        const fG1B = page.frame({ url: /G1B\.asp/ });
        if (fG1B) {
          await fG1B.evaluate((val) => {
            const inp = document.querySelector('input[name="G1B"], input[type="text"], input[type="tel"]');
            if (inp) { inp.value = val; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change')); }
          }, persona.future.plannedYears).catch(() => {});
        }
      }

      const stepNum = parseInt(stepName.replace('P', ''), 10) || 0;

      // 사람다운 다음 단계 검토 지연 후 클릭
      await preNextDelay();
      const prevUrl = page.url();
      await page.evaluate(() => document.querySelector('#next')?.click());

      // 페이지가 실제로 다음 단계로 넘어갈 때까지 대기
      let pageAdvanced = false;
      for (let w = 0; w < 16; w++) {
        await page.waitForTimeout(500);
        if (page.url() !== prevUrl) {
          pageAdvanced = true;
          break;
        }
      }

      // 페이지가 실제로 다음 단계로 성공적으로 넘어갔을 때만 1회 정직하게 진행 로그 발행!
      if (pageAdvanced) {
        capturedSteps.push({
          step: stepName,
          stepIndex: stepNum + 1,
          title: `${stepName} 완료`
        });

        const nextMatch = page.url().match(/(P\d+|Agree)\.asp/i);
        const nextStepName = nextMatch ? nextMatch[1] : '다음';
        onProgress({
          step: stepName,
          nextStep: nextStepName,
          stepIndex: stepNum + 1,
          totalSteps: 15,
          screenshotUrl: null,
          message: `✓ [${stepName}] 단계 완료 ➔ [${nextStepName}] 단계 진입`
        });
      } else {
        console.log(`⚠️ [${stepName}] 페이지가 전환되지 않아 재시도 준비 중... (현재: ${page.url()})`);
      }
    }

    // ---------------------------------------------------------
    // 최종 관문: Agree.asp 개인정보 동의
    // ---------------------------------------------------------
    await readingDelay();
    if (page.url().includes('Agree.asp')) {
      await page.click('#AGREE_1').catch(() => {});
      await preNextDelay();

      capturedSteps.push({
        step: 'Agree',
        stepIndex: 16,
        title: '개인정보 수집 동의 완료'
      });

      // 파일럿 모드이거나 안전가드가 켜져 있으면 최종 제출 버튼 클릭 전 대기
      if (pilotMode || safetyGuard) {
        onProgress({
          step: 'Agree',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: null,
          message: `🛡️ [최종 동의 완료] 안전 가드 활성화 상태로 최종 제출 전 대기합니다.`
        });
      } else {
        // 실제 최종 제출 실행
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(3000);
        onProgress({
          step: 'COMPLETED',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: null,
          message: `🎉 [설문 최종 마감] "${biz.companyName}" 설문이 정식 제출 마감되었습니다!`
        });
      }
    }

    // 최종 관문인 Agree.asp에 도달하지 못했다면 모드와 무관하게 무조건 실패 처리! (거짓 완료 원천 차단)
    if (!page.url().includes('Agree.asp')) {
      return {
        success: false,
        error: `최종 동의 단계(Agree.asp)에 도달하지 못했습니다. (현재 위치: ${page.url()})`,
        capturedSteps,
        companyName: biz.companyName
      };
    }

    return {
      success: true,
      capturedSteps,
      companyName: biz.companyName,
      personaSummary: {
        category: persona.industryMeta.categoryName,
        age: persona.age,
        areaPyeong: persona.areaPyeong,
        dailySales: persona.sales.daily,
        cardRatio: persona.paymentMethods.card,
        issues: persona.issues.f1
      }
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
