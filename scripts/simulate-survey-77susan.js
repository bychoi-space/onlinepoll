import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// 칠칠수산 쿼터 팩트 데이터
const BIZ_DATA = {
  companyName: '칠칠수산',
  bizNumber: '555-95-01465',
  rawBizNumber: '5559501465',
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

async function runSimulation() {
  console.log('===============================================================');
  console.log(`[AutoSurvey AI] 케이스탯 전통시장 실태조사 시뮬레이션 시작`);
  console.log(`- 타겟 사업자: "${BIZ_DATA.companyName}" (${BIZ_DATA.bizNumber})`);
  console.log(`- 대표자: ${BIZ_DATA.ceoName} | 연락처: ${BIZ_DATA.phone}`);
  console.log(`- 주소: ${BIZ_DATA.address} ${BIZ_DATA.addressDetail} (우편: ${BIZ_DATA.zipCode})`);
  console.log(`- 온누리 가맹: 지류(가맹), 디지털(미가맹)`);
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 960 }
  });

  const page = await context.newPage();

  // alert 및 dialog 핸들러 (경고 내용 로깅 및 자동 승인)
  page.on('dialog', async (dialog) => {
    console.log(`🔔 [Browser Dialog] type=${dialog.type()} message="${dialog.message()}"`);
    await dialog.accept();
  });

  const startUrl = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';

  try {
    // -------------------------------------------------------------
    // [STEP 0] 인트로 안내 페이지 (index.asp)
    // -------------------------------------------------------------
    console.log('[STEP 0] index.asp 접속 중...');
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_index.png') });
    console.log('✓ index.asp 진입 완료. [시작] 버튼 클릭');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('#next')
    ]);

    // -------------------------------------------------------------
    // [STEP 1] 스크리닝 문항 (Survey.asp / SQ1)
    // -------------------------------------------------------------
    console.log('\n[STEP 1] SQ1 스크리닝 문항 진입 (문1. 개업 시기 확인)');
    await page.waitForSelector('#Q1_1', { timeout: 10000 });
    // 문1. 2025년 12월 31일 이전 (칠칠수산 2020년 개업)
    await page.click('#Q1_1');
    console.log('✓ 문1 선택: "1. 2025년 12월 31일 이전" (칠칠수산 개업일: 2020.10)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_SQ1.png') });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('#next')
    ]);

    // -------------------------------------------------------------
    // [STEP 2] 사업체 기본정보 등록 (Q1.asp)
    // -------------------------------------------------------------
    console.log('\n[STEP 2] Q1.asp 점포주(사업체) 기본정보 등록 진입');
    await page.waitForSelector('#Q1_5', { timeout: 10000 });

    // 팩트 데이터 입력
    // 주소 (우편번호 필수!)
    await page.fill('#Q1_4_1', BIZ_DATA.zipCode);
    await page.fill('#Q1_4_2', BIZ_DATA.address);
    await page.fill('#Q1_4_3', BIZ_DATA.addressDetail);
    // 점포명
    await page.fill('#Q1_5', BIZ_DATA.companyName);
    // 노점 여부: 점포(1)
    await page.click('#Q1_6_1');
    // 업종: 수산물(3)
    await page.click('#Q1_7_3');
    // 사업형태: 소매(2)
    await page.click('#Q1_8_2');
    // 주요판매품목
    await page.fill('#Q1_9_1', BIZ_DATA.handledItems);
    // 응답자 명: 대표자명
    await page.fill('#Q1_10', BIZ_DATA.ceoName);
    // 연락처: 하이픈 포함 전화번호
    await page.fill('#Q1_11', BIZ_DATA.phone);
    // 직위: 점포주(1)
    await page.click('#Q1_12_1');
    // 정보수신: 아니오(2) (추가 텍스트 입력 방지)
    await page.click('#Q1_13_2');

    console.log('✓ Q1.asp 팩트 데이터 입력 완료:');
    console.log(`  - 점포명: ${BIZ_DATA.companyName}, 주소: ${BIZ_DATA.address} ${BIZ_DATA.addressDetail} (${BIZ_DATA.zipCode})`);
    console.log(`  - 대표자: ${BIZ_DATA.ceoName}, 연락처: ${BIZ_DATA.phone}`);
    console.log(`  - 업종: 수산물, 형태: 소매, 품목: ${BIZ_DATA.handledItems}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_Q1_filled.png') });

    // 저장(다음) 클릭
    console.log('➔ [저장(다음)] 클릭하여 P1으로 이동...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('#next')
    ]);

    // -------------------------------------------------------------
    // [STEP 3] P1 ~ P14 및 Agree 순차 탐색 & 자동 응답
    // -------------------------------------------------------------
    for (let stepIdx = 1; stepIdx <= 15; stepIdx++) {
      const pageUrl = page.url();
      const pageNameMatch = pageUrl.match(/(P\d+|Agree)\.asp/i);
      const currentPageName = pageNameMatch ? pageNameMatch[1] : `STEP_${stepIdx}`;

      console.log(`\n======================================================`);
      console.log(`[본조사 진행] 현재 페이지: ${currentPageName} (${pageUrl})`);

      await page.waitForTimeout(2500); // iframe들 로딩 대기
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `03_${currentPageName}_entry.png`) });

      // Agree.asp인 경우
      if (currentPageName.toLowerCase() === 'agree') {
        console.log('★ Agree.asp 개인정보 수집 이용 동의 페이지 도달!');
        // 1. 동의 라디오 선택
        const agreeRadio = await page.$('input[name="Agree"][value="1"], input[id*="Agree_1"], input[value="1"]');
        if (agreeRadio) {
          await agreeRadio.click();
          console.log('✓ 개인정보 수집·이용 동의 (1. 동의) 선택');
        }
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `04_Agree_selected.png`) });
        console.log('🎉 최종 완료 단계 직전까지 시뮬레이션 완주 성공!');
        break;
      }

      // 컨테이너 내 모든 iframe 탐색
      const frames = page.frames();
      console.log(`- 감지된 하위 iframe 수: ${frames.length - 1}개`);

      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        const frameUrl = frame.url();
        const frameNameMatch = frameUrl.match(/([A-Z0-9_]+)\.asp/i);
        const frameCode = frameNameMatch ? frameNameMatch[1] : 'unknown';

        try {
          // A1 (점포주 성별) - 여성 (오지은 대표)
          if (frameCode === 'A1') {
            const rFemale = await frame.$('input[value="2"]');
            if (rFemale) await rFemale.click();
            console.log(`  [${frameCode}] 점포주 성별: 여성`);
            continue;
          }

          // A2 (점포주 나이) - 만 48세
          if (frameCode === 'A2') {
            const ageInp = await frame.$('input[type="tel"], input[type="text"]');
            if (ageInp) await ageInp.fill('48');
            console.log(`  [${frameCode}] 점포주 나이: 48세`);
            continue;
          }

          // A3 (사업자 형태) - 개인(2)
          if (frameCode === 'A3') {
            const rPersonal = await frame.$('input[value="2"]');
            if (rPersonal) await rPersonal.click();
            console.log(`  [${frameCode}] 사업자 형태: 개인`);
            continue;
          }

          // A3A (개인사업자 구분) - 일반(1)
          if (frameCode === 'A3A') {
            const rGeneral = await frame.$('input[value="1"]');
            if (rGeneral) await rGeneral.click();
            console.log(`  [${frameCode}] 개인사업자 구분: 일반`);
            continue;
          }

          // A4 (사업자등록 여부) - 등록(1)
          if (frameCode === 'A4') {
            const rReg = await frame.$('input[value="1"]');
            if (rReg) await rReg.click();
            console.log(`  [${frameCode}] 사업자등록 여부: 등록`);
            continue;
          }

          // A4A (사업자등록번호) 팩트 주입
          if (frameCode === 'A4A') {
            const bizInp = await frame.$('input[name="A4A_1"], input[type="tel"], input[type="text"]');
            if (bizInp) {
              await bizInp.fill(BIZ_DATA.rawBizNumber);
              console.log(`  [${frameCode}] 사업자등록번호 주입: "${BIZ_DATA.rawBizNumber}"`);
            }
            continue;
          }

          // A5 (영업시작일) 팩트 주입
          if (frameCode === 'A5') {
            const yInp = await frame.$('input[name="A5_1"]');
            const mInp = await frame.$('input[name="A5_2"]');
            if (yInp) await yInp.fill(BIZ_DATA.openYear);
            if (mInp) await mInp.fill(BIZ_DATA.openMonth);
            console.log(`  [${frameCode}] 현 영업시작일 주입: ${BIZ_DATA.openYear}년 ${BIZ_DATA.openMonth}월`);
            continue;
          }

          // B5A1 (온누리상품권 가맹 여부) 팩트 주입
          if (frameCode === 'B5A1') {
            // 지류 가맹(1), 카드 미가맹(2), 모바일 미가맹(2)
            await frame.click('input[name="B5A1_1"][value="1"]').catch(() => {});
            await frame.click('input[name="B5A1_2"][value="2"]').catch(() => {});
            await frame.click('input[name="B5A1_3"][value="2"]').catch(() => {});
            console.log(`  [${frameCode}] 온누리 가맹 주입: 지류(가맹), 카드(미가맹), 모바일(미가맹)`);
            continue;
          }

          // B5B1 (온누리 가맹 시작년도)
          if (frameCode === 'B5B1') {
            const yInp = await frame.$('input[type="tel"], input[type="text"]');
            if (yInp) await yInp.fill(BIZ_DATA.openYear);
            console.log(`  [${frameCode}] 온누리 가맹년도 주입: ${BIZ_DATA.openYear}`);
            continue;
          }

          // 합계 100% 밸리데이션 문항 (B1AC, B2, B2A, B4 등)
          if (frameCode === 'B1AC') {
            const inps = await frame.$$('input[type="tel"], input[type="text"]');
            const vals = ['30', '20', '30', '20'];
            for (let k = 0; k < Math.min(inps.length, vals.length); k++) {
              await inps[k].fill(vals[k]);
            }
            console.log(`  [${frameCode}] 분기별 매출 비중 주입 (합계 100%)`);
            continue;
          }

          if (frameCode === 'B2' || frameCode === 'B2A') {
            const inps = await frame.$$('input[type="tel"], input[type="text"]');
            if (inps.length >= 3) {
              await inps[0].fill('10'); // 현금
              await inps[1].fill('70'); // 카드
              await inps[2].fill('20'); // 온누리
              console.log(`  [${frameCode}] 결제수단 비중 주입 (현금10, 카드70, 온누리20)`);
              continue;
            }
          }

          if (frameCode === 'B4') {
            const inps = await frame.$$('input[type="tel"], input[type="text"]');
            const vals = ['60', '20', '10', '10', '0'];
            for (let k = 0; k < Math.min(inps.length, vals.length); k++) {
              await inps[k].fill(vals[k]);
            }
            console.log(`  [${frameCode}] 영업비용 구조 주입 (합계 100%)`);
            continue;
          }

          // 일반 라디오 문항 처리 (첫 번째 옵션 또는 긍정 옵션 선택)
          const radioGroups = await frame.$$eval('input[type="radio"]', rList => {
            const names = new Set(rList.map(r => r.name));
            return Array.from(names);
          });

          for (const rName of radioGroups) {
            const isChecked = await frame.$eval(`input[name="${rName}"]:checked`, () => true).catch(() => false);
            if (!isChecked) {
              const firstRadio = await frame.$(`input[name="${rName}"]`);
              if (firstRadio) {
                await firstRadio.click();
              }
            }
          }

          // 순위형 체크박스 (B1BC, B1BD, F1, F2, F3 등) 3개 선택
          const checkboxes = await frame.$$('input[type="checkbox"]');
          if (checkboxes.length > 0) {
            const checkedCount = await frame.$$eval('input[type="checkbox"]:checked', chks => chks.length);
            if (checkedCount === 0) {
              for (let c = 0; c < Math.min(3, checkboxes.length); c++) {
                await checkboxes[c].click().catch(() => {});
              }
              console.log(`  [${frameCode}] 순위형 체크박스 3순위 선택 완료`);
            }
          }

          // 단답형/숫자 텍스트 필드 처리
          // 사용자의 지침: "도무지 채울 수 없는 항목은 공란으로 넘겨줘. 단 필수값은 기본값 입력"
          const textInputs = await frame.$$('input[type="text"], input[type="tel"]');
          for (const txt of textInputs) {
            const val = await txt.inputValue();
            const isReadonly = await txt.getAttribute('readonly');
            const isDisabled = await txt.getAttribute('disabled');
            if (isReadonly || isDisabled || val) continue;

            const name = await txt.getAttribute('name');
            if (name && (name.includes('A9') || name.includes('A10') || name.includes('B1D') || name.includes('B1E') || name.includes('B1AA') || name.includes('B1AB') || name.includes('D1C') || name.includes('E1A') || name.includes('E2CA') || name.includes('G1B'))) {
              let defaultVal = '10';
              if (name.includes('A9_1')) defaultVal = '45'; // 면적 45㎡
              if (name.includes('A10_1')) defaultVal = '1'; // 상용 1명
              if (name.includes('B1D')) defaultVal = '10'; // 10시간
              if (name.includes('B1E')) defaultVal = '26'; // 26일
              if (name.includes('B1AA')) defaultVal = '50'; // 일매출 50만원
              if (name.includes('B1AB')) defaultVal = '150'; // 연매출 1억5천만원
              if (name.includes('D1C_1')) defaultVal = '2000'; // 보증금 2000만원
              if (name.includes('D1C_2')) defaultVal = '120'; // 월세 120만원
              if (name.includes('E1A')) defaultVal = '3000'; // 부채 3000만원
              if (name.includes('E2CA')) defaultVal = '2'; // 소화기 2개
              if (name.includes('G1B')) defaultVal = '5'; // 5년 지속
              await txt.fill(defaultVal);
              console.log(`  [${frameCode}] 필수 기본값 입력: ${name} = ${defaultVal}`);
            } else {
              // 그 외 항목은 사용자 지침에 따라 공란 유지
            }
          }

        } catch (frameErr) {
          console.warn(`  [${frameCode}] 가벼운 경고 (건너뜀): ${frameErr.message}`);
        }
      }

      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `03_${currentPageName}_filled.png`) });

      // 다음 버튼 클릭
      const nextBtn = await page.$('#next');
      if (!nextBtn) {
        console.log(`- ${currentPageName}: 다음 버튼 없음, 탐색 종료`);
        break;
      }

      console.log(`➔ [저장(다음)] 클릭하여 다음 페이지로 진행...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        page.click('#next')
      ]);
    }

    console.log('\n===============================================================');
    console.log('🎉 칠칠수산 1건 시뮬레이션 완주 완료!');
    console.log(`- 스크린샷 보관 경로: ${SCREENSHOT_DIR}`);
    console.log('===============================================================');

  } catch (err) {
    console.error('시뮬레이션 중 오류 발생:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('브라우저 세션 안전 종료 완료.');
  }
}

runSimulation();
