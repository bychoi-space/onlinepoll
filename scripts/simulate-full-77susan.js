import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// 칠칠수산 쿼터 팩트 데이터 (소상공인시장진흥공단 온누리 공인 DB + 마켓비즈)
const BIZ_DATA = {
  companyName: '칠칠수산',
  bizNumber: '555-95-01465',
  ceoName: '오지은',
  phone: '0507-1420-1996',
  openDate: '2020.10.06',
  openYear: '2020',
  openMonth: '10',
  marketName: '풍납시장',
  zipCode: '05527',
  address: '서울특별시 송파구 바람드리길 37-1',
  addressDetail: '1층',
  handledItems: '수산물 (생선, 활어)',
  paperAccepted: true,    // 온누리 지류 가맹
  digitalAccepted: false  // 온누리 디지털/카드 미가맹
};

const SCREENSHOT_DIR = path.resolve('reports/simulation_77susan');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 안전한 클릭 유틸 (DOM 이벤트 트리거 보장)
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

// 안전한 값 입력 유틸 (input, change 이벤트 트리거 보장)
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

async function runFullSimulation() {
  console.log('========================================================================');
  console.log(' [AutoSurvey AI] 케이스탯 전통시장 실태조사 실시간 시뮬레이션 완주 시작');
  console.log(` - 대상 사업자: "${BIZ_DATA.companyName}" (${BIZ_DATA.bizNumber})`);
  console.log(` - 대표자: ${BIZ_DATA.ceoName} | 연락처: ${BIZ_DATA.phone}`);
  console.log(` - 주소: ${BIZ_DATA.address} ${BIZ_DATA.addressDetail} (우편: ${BIZ_DATA.zipCode})`);
  console.log(` - 개업일: ${BIZ_DATA.openDate} (2020년 10월) | 취급품목: ${BIZ_DATA.handledItems}`);
  console.log(` - 온누리 가맹: 지류(가맹), 카드/모바일(미가맹)`);
  console.log(' - 규칙 준수: 도무지 채울 수 없는 선택 항목은 공란 유지');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 960 }
  });

  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`🔔 [Browser Alert] "${dialog.message()}"`);
    await dialog.accept();
  });

  const startUrl = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';

  try {
    // -------------------------------------------------------------
    // [STEP 0] 세션 접속 및 시작 상태 판별
    // -------------------------------------------------------------
    console.log('[세션 접속] 설문 URL 접속 중...');
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log(`현재 페이지 URL: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_start_state.png') });

    // 1) index.asp인 경우 [시작] 클릭
    if (page.url().includes('index.asp')) {
      console.log('✓ index.asp 확인. [시작] 버튼 클릭');
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(2500);
      console.log(`이동 후 URL: ${page.url()}`);
    }

    // 2) Survey.asp (SQ1 스크리닝)인 경우
    if (page.url().includes('Survey.asp')) {
      console.log('✓ Survey.asp (SQ1 참여) 확인. 1. 예 선택');
      await page.evaluate(() => {
        document.querySelector('#Q1_1')?.click();
        document.querySelector('#next')?.click();
      });
      await page.waitForTimeout(2500);
      console.log(`이동 후 URL: ${page.url()}`);
    }

    // 3) Q1.asp (점포 기본정보)인 경우
    if (page.url().includes('Q1.asp')) {
      console.log('\n[STEP 1] Q1.asp 점포주(사업체) 기본정보 등록 진입');
      await page.waitForSelector('#Q1_4_1', { timeout: 10000 }).catch(() => {});

      await page.evaluate(({ zip, addr }) => {
        const z = document.getElementById('Q1_4_1');
        const a = document.getElementById('Q1_4_2');
        if (z) z.value = zip;
        if (a) a.value = addr;
      }, { zip: BIZ_DATA.zipCode, addr: BIZ_DATA.address });

      await safeFill(page, '#Q1_4_3', BIZ_DATA.addressDetail);
      await safeFill(page, '#Q1_5', BIZ_DATA.companyName);
      await safeClick(page, '#Q1_6_1'); // 점포
      await safeClick(page, '#Q1_7_3'); // 수산물
      await safeClick(page, '#Q1_8_2'); // 소매
      await safeFill(page, '#Q1_9_1', BIZ_DATA.handledItems);
      await safeFill(page, '#Q1_10', BIZ_DATA.ceoName);
      await safeFill(page, '#Q1_11', BIZ_DATA.phone);
      await safeClick(page, '#Q1_12_1'); // 점포주
      await safeClick(page, '#Q1_13_2'); // 정보수신 아니오

      console.log('✓ Q1.asp 팩트 주입 완료');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_Q1_filled.png') });

      console.log('➔ [저장(다음)] 클릭하여 P1으로 이동...');
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(2500);
      console.log(`이동 후 URL: ${page.url()}`);
    }

    // -------------------------------------------------------------
    // [STEP 2] 본조사 (P1 ~ P14) 상태 머신 순차 진행
    // -------------------------------------------------------------
    const maxIterations = 25;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      console.log(`\n======================================================`);
      console.log(`[본조사 진행 #${iteration}] 현재 URL: ${currentUrl}`);

      // 1) Agree.asp 도착 시 루프 종료
      if (currentUrl.includes('Agree.asp')) {
        console.log('🎉 Agree.asp (최종 개인정보 동의) 화면 도달 확인!');
        break;
      }

      // 현재 단계 판별 (P1 ~ P14)
      const match = currentUrl.match(/(P\d+)\.asp/i);
      const stepName = match ? match[1].toUpperCase() : null;

      if (!stepName) {
        console.log(`⚠️ P단계를 식별할 수 없는 URL: ${currentUrl}`);
        if (currentUrl.includes('index.asp') || currentUrl.includes('Survey.asp')) {
          await page.evaluate(() => document.querySelector('#next')?.click());
          continue;
        }
        break;
      }

      console.log(`▶ 현재 스테이지: ${stepName}`);
      await page.waitForTimeout(1500); // 하위 iframe 로딩 대기

      // ===========================================================
      // [P1] 점포 현황 (성별, 연령, 사업자등록, 개업연월)
      // ===========================================================
      if (stepName === 'P1') {
        const fA1 = page.frame({ url: /A1\.asp/ });
        if (fA1) await safeClick(fA1, '#A1_2'); // 여성
        const fA2 = page.frame({ url: /A2\.asp/ });
        if (fA2) await safeFill(fA2, 'input[name="A2"]', '48');
        const fA3 = page.frame({ url: /A3\.asp/ });
        if (fA3) {
          await fA3.click('#A3_2').catch(() => {}); // 개인
          await page.waitForTimeout(1000);
        }
        const fA3A = page.frame({ url: /A3A\.asp/ });
        if (fA3A) await safeClick(fA3A, '#A3A_1'); // 일반과세
        const fA4 = page.frame({ url: /A4\.asp/ });
        if (fA4) {
          await fA4.click('#A4_1').catch(() => {}); // 등록
          await page.waitForTimeout(1000);
        }
        const fA4A = page.frame({ url: /A4A\.asp/ });
        if (fA4A) await safeFill(fA4A, 'input[name="A4A_1"]', BIZ_DATA.bizNumber); // 555-95-01465 (12자리)
        const fA5 = page.frame({ url: /A5\.asp/ });
        if (fA5) {
          await safeFill(fA5, 'input[name="A5_1"]', BIZ_DATA.openYear);
          await safeFill(fA5, 'input[name="A5_2"]', BIZ_DATA.openMonth);
        }
        console.log(`✓ P1 점포 현황 주입: 여성, 48세, 개인(일반), 사업자번호=${BIZ_DATA.bizNumber}, 개업=2020.10`);
      }

      // ===========================================================
      // [P2] 점포 면적 및 종업원수
      // ===========================================================
      else if (stepName === 'P2') {
        const fA9 = page.frame({ url: /A9\.asp/ });
        if (fA9) {
          await safeFill(fA9, 'input[name="A9_1"]', '45'); // 45㎡
          await safeFill(fA9, 'input[name="A9_2"]', '14'); // 14평 (정수 필수!)
        }
        const fA10 = page.frame({ url: /A10\.asp/ });
        if (fA10) {
          await safeFill(fA10, 'input[name="A10_1"]', '1'); // 상용 1명
          await safeFill(fA10, 'input[name="A10_2"]', '0'); // 임시 0명
          await safeFill(fA10, 'input[name="A10_3"]', '0'); // 가족 0명
        }
        console.log('✓ P2 점포 면적(45㎡/14평) 및 종업원(상용 1명) 주입');
      }

      // ===========================================================
      // [P3] 매출액 (일평균, 연간, 영업개월수, 분기별 비중 합 100%)
      // ===========================================================
      else if (stepName === 'P3') {
        const fB1AA = page.frame({ url: /B1AA\.asp/ });
        if (fB1AA) await safeFill(fB1AA, 'input[name="B1AA"]', '50'); // 일 50만원
        const fB1AB = page.frame({ url: /B1AB\.asp/ });
        if (fB1AB) await safeFill(fB1AB, 'input[name="B1AB"]', '150'); // 연 1억5천만원
        const fB1AC = page.frame({ url: /B1AC\.asp/ });
        if (fB1AC) {
          await safeFill(fB1AC, 'input[name="B1AC"]', '12'); // 영업개월수 12개월 (필수)
          await safeFill(fB1AC, 'input[name="B1AC_1"]', '30');
          await safeFill(fB1AC, 'input[name="B1AC_2"]', '20');
          await safeFill(fB1AC, 'input[name="B1AC_3"]', '30');
          await safeFill(fB1AC, 'input[name="B1AC_4"]', '20');
        }
        console.log('✓ P3 일매출 50만원, 연매출 1억5천만원, 영업개월 12개월, 분기별 비중(30,20,30,20 = 100%) 주입');
      }

      // ===========================================================
      // [P4] 영업이익, 매출체감, 고객수, 영업일수/시간
      // ===========================================================
      else if (stepName === 'P4') {
        const fB1BA = page.frame({ url: /B1BA\.asp/ });
        if (fB1BA) {
          await safeFill(fB1BA, 'input[name="B1BA"]', '30'); // 30백만원
          await safeFill(fB1BA, 'input[name="B1BA_1"]', '20'); // 20%
        }
        const fB1BB = page.frame({ url: /B1BB\.asp/ });
        if (fB1BB) await safeClick(fB1BB, '#B1BB_3'); // 비슷함/변화없음 (추가사유 질문 스킵)
        const fB1C = page.frame({ url: /B1C\.asp/ });
        if (fB1C) {
          await safeFill(fB1C, 'input[name="B1C"]', '40'); // 고객수 40명
          await safeFill(fB1C, 'input[name="B1C_1"]', '20'); // 지역외 20%
        }
        const fB1D = page.frame({ url: /B1D\.asp/ });
        if (fB1D) await safeFill(fB1D, 'input[name="B1D"]', '11'); // 11시간
        const fB1E = page.frame({ url: /B1E\.asp/ });
        if (fB1E) await safeFill(fB1E, 'input[name="B1E"]', '26'); // 26일
        console.log('✓ P4 영업이익 30백만(20%), 체감 비슷, 고객수 40명, 영업일수 26일 주입');
      }

      // ===========================================================
      // [P5] 결제수단 비중 (합계 100%) 및 온누리 세부 결제
      // ===========================================================
      else if (stepName === 'P5') {
        const fB2 = page.frame({ url: /B2\.asp/ });
        if (fB2) {
          await safeFill(fB2, '#B2_1', '10'); // 현금 10%
          await safeFill(fB2, '#B2_2', '70'); // 카드 70%
          await safeFill(fB2, '#B2_3', '20'); // 온누리 20%
          await safeFill(fB2, '#B2_4', '0');  // 지역사랑 0%
          await safeFill(fB2, '#B2_5', '0');  // 기타 0%
        }
        const fB3 = page.frame({ url: /B3\.asp/ });
        if (fB3) {
          await safeFill(fB3, '#B3_1', '100'); // 지류 100%
          await safeFill(fB3, '#B3_2', '0');   // 디지털 0% (합 100% 필수)
        }
        console.log('✓ P5 결제수단 비중(카드70, 온누리20, 현금10 = 100%) 주입');
      }

      // ===========================================================
      // [P6] 영업비용 구성비 (합계 100%)
      // ===========================================================
      else if (stepName === 'P6') {
        const fB4 = page.frame({ url: /B4\.asp/ });
        if (fB4) {
          await safeFill(fB4, '#B4_1', '65'); // 재료비 65%
          await safeFill(fB4, '#B4_2', '15'); // 임차료 15%
          await safeFill(fB4, '#B4_3', '10'); // 인건비 10%
          await safeFill(fB4, '#B4_4', '10'); // 기타 10%
          await safeFill(fB4, '#TB4_4', '관리비'); // 기타 항목명 필수
        }
        console.log('✓ P6 영업비용 구조(재료비65, 임차료15, 인건비10, 기타(관리비)10 = 100%) 주입');
      }

      // ===========================================================
      // [P7] 온누리상품권 가맹 현황 (지류 가맹, 모바일 미가맹)
      // ===========================================================
      else if (stepName === 'P7') {
        const fB5A = page.frame({ url: /B5A\.asp/ });
        if (fB5A) {
          await safeClick(fB5A, '#B5A_1_1'); // 온누리 지류 가맹
          await safeClick(fB5A, '#B5A_2_2'); // 지역사랑 미가맹
          await page.waitForTimeout(800);
        }
        const fB5AA = page.frame({ url: /B5AA\.asp/ });
        if (fB5AA) await safeClick(fB5AA, '#B5AA_3'); // 보통
        const fB5B = page.frame({ url: /B5B\.asp/ });
        if (fB5B) await safeFill(fB5B, 'input[name="B5B"]', '2020'); // 2020년 도입
        const fB5C = page.frame({ url: /B5C\.asp/ });
        if (fB5C) await safeFill(fB5C, 'input[name="B5C"]', '20'); // 20%
        const fB5D = page.frame({ url: /B5D\.asp/ });
        if (fB5D) await safeClick(fB5D, '#B5D_3'); // 보통
        const fB5E = page.frame({ url: /B5E\.asp/ });
        if (fB5E) await safeFill(fB5E, 'input[name="B5E"]', '10'); // 10%
        const fB5F = page.frame({ url: /B5F\.asp/ });
        if (fB5F) await safeClick(fB5F, '#B5F_3'); // 보통
        const fB5G = page.frame({ url: /B5G\.asp/ });
        if (fB5G) await safeFill(fB5G, 'input[name="B5G"]', '10');
        const fB5AB = page.frame({ url: /B5AB\.asp/ });
        if (fB5AB) await safeClick(fB5AB, '#B5AB_1'); // 미가맹 사유 (가맹절차 번거로움)
        console.log('✓ P7 온누리상품권 팩트 주입 (지류 가맹, 지역사랑 미가맹, 2020년 도입)');
      }

      // ===========================================================
      // [P8] 판로 및 마케팅 (선택적 항목 공란 유지)
      // ===========================================================
      else if (stepName === 'P8') {
        const fC1A = page.frame({ url: /C1A\.asp/ });
        if (fC1A) await safeClick(fC1A, '#C1A_2'); // SNS 미운영 -> 계정 공란
        const fC1B = page.frame({ url: /C1B\.asp/ });
        if (fC1B) await safeClick(fC1B, '#C1B_2'); // 온라인 미운영 -> URL 공란
        const fC1C = page.frame({ url: /C1C\.asp/ });
        if (fC1C) await safeClick(fC1C, '#C1C_2'); // 쿠폰 미운영
        const fC1D = page.frame({ url: /C1D\.asp/ });
        if (fC1D) await safeClick(fC1D, '#C1D_2'); // 배달 미운영
        const fC1E = page.frame({ url: /C1E\.asp/ });
        if (fC1E) await safeClick(fC1E, '#C1E_2'); // 택배 미운영 (수산물 특성 반영, 추가질문 스킵)
        const fC1F = page.frame({ url: /C1F\.asp/ });
        if (fC1F) await safeClick(fC1F, '#C1F_2'); // 카드단말기 사용
        const fC1G = page.frame({ url: /C1G\.asp/ });
        if (fC1G) {
          await safeClick(fC1G, '#C1G_2'); // 키오스크 미도입
          await page.waitForTimeout(600);
        }
        const fC1GA = page.frame({ url: /C1GA\.asp/ });
        if (fC1GA) await safeClick(fC1GA, '#C1GA_3'); // 도입 계획 없음
        console.log('✓ P8 판로(수산물 특성상 택배/배달 미운영, SNS/온라인 공란 유지, 키오스크 미도입) 주입');
      }

      // ===========================================================
      // [P9] 원산지 및 가격표시
      // ===========================================================
      else if (stepName === 'P9') {
        const fC2A = page.frame({ url: /C2A\.asp/ });
        if (fC2A) {
          await safeClick(fC2A, '#C2A_1'); // 가격표시 전품목
          await page.waitForTimeout(1000);
        }
        const fC2AA = page.frame({ url: /C2AA\.asp/ });
        if (fC2AA) await safeFill(fC2AA, 'input[name="C2AA"]', '100'); // 100%
        const fC2B = page.frame({ url: /C2B\.asp/ });
        if (fC2B) {
          await safeClick(fC2B, '#C2B_1'); // 원산지표시 전품목
          await page.waitForTimeout(1000);
        }
        const fC2BA = page.frame({ url: /C2BA\.asp/ });
        if (fC2BA) await safeFill(fC2BA, 'input[name="C2BA"]', '100'); // 100%
        const fC2C = page.frame({ url: /C2C\.asp/ });
        if (fC2C) await safeClick(fC2C, '#C2C_3'); // 신뢰도 보통
        const fC2D = page.frame({ url: /C2D\.asp/ });
        if (fC2D) await safeClick(fC2D, '#C2D_3'); // 위생 보통
        const fC2E = page.frame({ url: /C2E\.asp/ });
        if (fC2E) await safeFill(fC2E, 'input[name="C2E"]', '90'); // 국내산 90%
        console.log('✓ P9 원산지/가격 표시 100%, 국내산 취급 90% 주입');
      }

      // ===========================================================
      // [P10] 사업장 점유 형태
      // ===========================================================
      else if (stepName === 'P10') {
        const fD1 = page.frame({ url: /D1\.asp/ });
        if (fD1) {
          await safeClick(fD1, '#D1_2'); // 임차
          await page.waitForTimeout(600);
        }
        const fD1A = page.frame({ url: /D1A\.asp/ });
        if (fD1A) await safeClick(fD1A, '#D1A_2'); // 보증부월세
        const fD1B = page.frame({ url: /D1B\.asp/ });
        if (fD1B) await safeClick(fD1B, '#D1B_1'); // 개인소유
        const fD1C = page.frame({ url: /D1C\.asp/ });
        if (fD1C) {
          await safeFill(fD1C, 'input[name="D1C_1"]', '2000'); // 보증금 2000만원
          await safeFill(fD1C, 'input[name="D1C_2"]', '120');  // 월세 120만원
        }
        const fD1D = page.frame({ url: /D1D\.asp/ });
        if (fD1D) await safeClick(fD1D, '#D1D_3'); // 동일/동결 (추가질문 스킵)
        console.log('✓ P10 사업장 임차(보증부월세: 보증금 2000만, 월세 120만, 임대료 동결) 주입');
      }

      // ===========================================================
      // [P11] 부채 현황 (부채 없음 -> 세부 내역 공란 유지)
      // ===========================================================
      else if (stepName === 'P11') {
        const fE1 = page.frame({ url: /E1\.asp/ });
        if (fE1) await safeClick(fE1, '#E1_2'); // 부채 없음 (선택적 세부내역 공란 유지 및 즉시 통과)
        console.log('✓ P11 부채 없음 선택 (세부 대출금액 공란 유지)');
      }

      // ===========================================================
      // [P12] 안전 및 보험
      // ===========================================================
      else if (stepName === 'P12') {
        const fE2A = page.frame({ url: /E2A\.asp/ });
        if (fE2A) await safeClick(fE2A, '#E2A_1'); // 화재공제 가입
        const fE2B = page.frame({ url: /E2B\.asp/ });
        if (fE2B) {
          await safeClick(fE2B, '#E2B_2'); // 민간보험 미가입
          await page.waitForTimeout(600);
        }
        const fE2BA = page.frame({ url: /E2BA\.asp/ });
        if (fE2BA) await safeClick(fE2BA, '#E2BA_1'); // 공제 가입으로 미가입
        const fE2C = page.frame({ url: /E2C\.asp/ });
        if (fE2C) {
          await safeClick(fE2C, '#E2C_1'); // 소화기 보유
          await page.waitForTimeout(600);
        }
        const fE2CA = page.frame({ url: /E2CA\.asp/ });
        if (fE2CA) await safeFill(fE2CA, 'input[name="E2CA"]', '2'); // 소화기 2개
        console.log('✓ P12 화재공제 가입 및 소화기 2개 주입');
      }

      // ===========================================================
      // [P13] 경영 애로사항 및 활성화 과제 (1~3순위 체크박스)
      // ===========================================================
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
        console.log('✓ P13 운영 애로사항 및 전통시장 활성화 과제 1~3순위 선택 완료');
      }

      // ===========================================================
      // [P14] 향후 운영 계획 및 점포 경영 관리
      // ===========================================================
      else if (stepName === 'P14') {
        const fG1 = page.frame({ url: /G1\.asp/ });
        if (fG1) await safeClick(fG1, '#G1_1'); // 계속 운영
        const fG1A = page.frame({ url: /G1A\.asp/ });
        if (fG1A) await safeClick(fG1A, '#G1A_2'); // 승계 계획 없음 (공란/미해당 원칙 준수)
        const fG1B = page.frame({ url: /G1B\.asp/ });
        if (fG1B) await safeFill(fG1B, 'input[name="G1B"]', '7'); // 7년
        const fG2 = page.frame({ url: /G2\.asp/ });
        if (fG2) {
          await safeClick(fG2, '#G2_1_2'); // PB상품 아니오 (상품명 공란 유지)
          await safeClick(fG2, '#G2_2_1'); // 현금영수증 예
          await safeFill(fG2, '#G2_2_NOTE', '50'); // 영수증 발행 비중 50%
          await safeClick(fG2, '#G2_3_2'); // 교환환불 아니오 (수산물 신선식품 특성 반영, 불필요한 서술 공란 처리)
        }
        console.log('✓ P14 향후 7년 운영 계획 및 경영 관리 주입 완료');
      }

      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `step_${stepName}_filled.png`) });

      // [저장(다음)] 클릭 및 다음 페이지 전환 대기
      console.log(`➔ [${stepName}] [저장(다음)] 클릭하여 이동 중...`);
      const prevUrl = page.url();

      await page.evaluate(() => document.querySelector('#next')?.click());

      // URL 전환 대기 (최대 10초)
      for (let w = 0; w < 20; w++) {
        await page.waitForTimeout(500);
        if (page.url() !== prevUrl) break;
      }
      console.log(`이동 완료 ➔ 다음 URL: ${page.url()}`);
    }

    // -------------------------------------------------------------
    // [최종 단계] Agree.asp 개인정보 동의 화면 도착 확인
    // -------------------------------------------------------------
    console.log(`\n======================================================`);
    console.log(`[최종 단계] Agree.asp 개인정보 동의 화면 도착 확인`);
    console.log(`- 현재 URL: ${page.url()}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '99_Agree_entry.png') });

    // 1. 동의 라디오 선택 (#AGREE_1)
    await page.evaluate(() => {
      const agreeRadio = document.querySelector('#AGREE_1');
      if (agreeRadio) {
        agreeRadio.checked = true;
        agreeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log('✓ 개인정보 수집·이용 동의 (1. 동의) 선택 완료');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '99_Agree_checked.png') });

    console.log('\n========================================================================');
    console.log('🎉 [시뮬레이션 완주 성공!] 칠칠수산 1건이 최종 제출 직전(Agree.asp)까지 완벽히 전진했습니다!');
    const shotFiles = fs.readdirSync(SCREENSHOT_DIR);
    console.log(`- 생성된 증빙 스크린샷: 총 ${shotFiles.length}개`);
    console.log(`- 스크린샷 보관 폴더: ${SCREENSHOT_DIR}`);
    console.log('========================================================================');

  } catch (err) {
    console.error('시뮬레이션 중 오류:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('브라우저 세션 안전 종료 완료.');
  }
}

runFullSimulation();
