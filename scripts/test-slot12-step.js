import { chromium } from 'playwright';
import fs from 'fs';
import { generateQuotaPersona } from '../src/engine/persona-builder.js';

const camp = JSON.parse(fs.readFileSync('./data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
const slot12Biz = camp.quotaDatabase.find(q => q.index === 11);

async function testSlot12StepByStep() {
  const biz = {
    index: 11,
    companyName: slot12Biz.companyName,
    bizNumber: slot12Biz.bizNumber,
    ceoName: slot12Biz.ceoName,
    phone: slot12Biz.phone,
    openYear: '2025',
    openMonth: '09',
    zipCode: slot12Biz.zipCode || '05527',
    address: slot12Biz.address || '서울특별시 송파구 바람드리길',
    addressDetail: '1층',
    handledItems: slot12Biz.handledItems
  };

  const persona = generateQuotaPersona(biz, 11, {});
  console.log('--- Persona Info ---');
  console.log('openYear:', biz.openYear, 'openMonth:', biz.openMonth);
  console.log('onnuri joinYear:', persona.onnuri.joinYear);
  console.log('onnuri salesRatio:', persona.onnuri.salesRatio);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('dialog', async d => {
    console.log('🔔 [ALERT DETECTED]:', d.message());
    await d.accept();
  });

  console.log('\nNavigating to slot 12:', slot12Biz.slotUrl);
  await page.goto(slot12Biz.slotUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(1500);
  }

  // 루프를 돌면서 P1~P7까지 확인
  for (let step = 1; step <= 15; step++) {
    await page.waitForTimeout(1000);
    const url = page.url();
    const match = url.match(/(P\d+|Q\d+|Agree)\.asp/i);
    const pageName = match ? match[1].toUpperCase() : 'UNKNOWN';
    console.log(`\n=== STEP ${step}: ${pageName} (${url}) ===`);

    if (pageName === 'Agree') {
      console.log('🎉 Reached Agree.asp successfully!');
      break;
    }

    if (pageName === 'P1') {
      const fA1 = page.frame({ url: /A1\.asp/ });
      if (fA1) await fA1.click(persona.genderSelector).catch(() => {});
      const fA2 = page.frame({ url: /A2\.asp/ });
      if (fA2) await fA2.fill('input[name="A2"]', persona.age).catch(() => {});
      const fA3 = page.frame({ url: /A3\.asp/ });
      if (fA3) await fA3.click('#A3_2').catch(() => {});
      const fA3A = page.frame({ url: /A3A\.asp/ });
      if (fA3A) await fA3A.click('#A3A_1').catch(() => {});
      const fA4 = page.frame({ url: /A4\.asp/ });
      if (fA4) await fA4.click('#A4_1').catch(() => {});
      const fA4A = page.frame({ url: /A4A\.asp/ });
      if (fA4A) await fA4A.fill('input[name="A4A_1"]', biz.bizNumber).catch(() => {});
      const fA5 = page.frame({ url: /A5\.asp/ });
      if (fA5) {
        await fA5.fill('input[name="A5_1"]', biz.openYear).catch(() => {});
        await fA5.fill('input[name="A5_2"]', biz.openMonth).catch(() => {});
      }
    } else if (pageName === 'P2') {
      const fA9 = page.frame({ url: /A9\.asp/ });
      if (fA9) {
        await fA9.fill('input[name="A9_1"]', persona.areaSquareMeter).catch(() => {});
        await fA9.fill('input[name="A9_2"]', persona.areaPyeong).catch(() => {});
      }
      const fA10 = page.frame({ url: /A10\.asp/ });
      if (fA10) {
        await fA10.fill('input[name="A10_1"]', persona.employees.family).catch(() => {});
        await fA10.fill('input[name="A10_2"]', persona.employees.regular).catch(() => {});
        await fA10.fill('input[name="A10_3"]', persona.employees.temp).catch(() => {});
      }
    } else if (pageName === 'P3') {
      const fB1AA = page.frame({ url: /B1AA\.asp/ });
      if (fB1AA) await fB1AA.fill('input[name="B1AA"]', persona.sales.daily).catch(() => {});
      const fB1AB = page.frame({ url: /B1AB\.asp/ });
      if (fB1AB) await fB1AB.fill('input[name="B1AB"]', persona.sales.annual).catch(() => {});
      const fB1AC = page.frame({ url: /B1AC\.asp/ });
      if (fB1AC) {
        await fB1AC.fill('input[name="B1AC_1"]', persona.sales.quarters.q1).catch(() => {});
        await fB1AC.fill('input[name="B1AC_2"]', persona.sales.quarters.q2).catch(() => {});
        await fB1AC.fill('input[name="B1AC_3"]', persona.sales.quarters.q3).catch(() => {});
        await fB1AC.fill('input[name="B1AC_4"]', persona.sales.quarters.q4).catch(() => {});
      }
      const fB1AD = page.frame({ url: /B1AD\.asp/ });
      if (fB1AD) await fB1AD.fill('input[name="B1AD"]', '12').catch(() => {});
    } else if (pageName === 'P4') {
      const fB1BA = page.frame({ url: /B1BA\.asp/ });
      if (fB1BA) await fB1BA.fill('input[name="B1BA"]', persona.sales.profitMarginRate).catch(() => {});
      const fB1BB = page.frame({ url: /B1BB\.asp/ });
      if (fB1BB) await fB1BB.fill('input[name="B1BB"]', persona.sales.annualProfit).catch(() => {});
      const fB1BC = page.frame({ url: /B1BC\.asp/ });
      if (fB1BC) await fB1BC.fill('input[name="B1BC"]', persona.sales.monthlyProfit).catch(() => {});
      const fB1C = page.frame({ url: /B1C\.asp/ });
      if (fB1C) await fB1C.fill('input[name="B1C"]', persona.sales.dailyCustomers).catch(() => {});
      const fB1D = page.frame({ url: /B1D\.asp/ });
      if (fB1D) await fB1D.fill('input[name="B1D"]', persona.sales.monthlyOpenDays).catch(() => {});
    } else if (pageName === 'P5') {
      const fB2 = page.frame({ url: /B2\.asp/ });
      if (fB2) {
        await fB2.click('#B2_1_1').catch(() => {});
        await fB2.click('#B2_2_1').catch(() => {});
        await fB2.click('#B2_3_1').catch(() => {});
        await fB2.click('#B2_4_2').catch(() => {});
        await fB2.click('#B2_5_2').catch(() => {});
      }
      const fB2A = page.frame({ url: /B2A\.asp/ });
      if (fB2A) {
        await fB2A.fill('input[name="B2A_1"]', persona.paymentMethods.cash).catch(() => {});
        await fB2A.fill('input[name="B2A_2"]', persona.paymentMethods.card).catch(() => {});
        await fB2A.fill('input[name="B2A_3"]', persona.paymentMethods.onnuri).catch(() => {});
      }
      const fB3 = page.frame({ url: /B3\.asp/ });
      if (fB3) {
        await fB3.fill('#B3_1', '100').catch(() => {});
        await fB3.fill('#B3_2', '0').catch(() => {});
      }
    } else if (pageName === 'P6') {
      const fB4 = page.frame({ url: /B4\.asp/ });
      if (fB4) {
        await fB4.fill('#B4_1', persona.costs.raw).catch(() => {});
        await fB4.fill('#B4_2', persona.costs.rent).catch(() => {});
        await fB4.fill('#B4_3', persona.costs.utility).catch(() => {});
        await fB4.fill('#B4_4', persona.costs.etc).catch(() => {});
        await fB4.fill('#TB4_4', '관리비/공과금').catch(() => {});
      }
    } else if (pageName === 'P7') {
      console.log('Testing P7 in detail...');
      const fB5A1 = page.frame({ url: /B5A1\.asp/ }) || page.frame({ url: /B5A\.asp/ });
      console.log('fB5A1 exists:', !!fB5A1);
      if (fB5A1) {
        await fB5A1.click('#B5A_1_1, input[value="1"]');
      }

      const fB5A2 = page.frame({ url: /B5A2\.asp/ });
      console.log('fB5A2 exists:', !!fB5A2);
      if (fB5A2) {
        await fB5A2.click('#B5A_2_2, input[value="2"]');
      }

      // 프레임 목록 확인
      await page.waitForTimeout(1000);
      let frames = page.frames().map(f => f.url()).filter(u => u.includes('.asp'));
      console.log('Frames before next click:', frames);

      let fB5B1 = page.frame({ url: /B5B1\.asp/ });
      console.log('fB5B1 exists before next click?:', !!fB5B1);

      if (!fB5B1) {
        console.log('fB5B1 not found yet. Checking if #next is needed...');
        // 주의: #next를 누르면 검증이 도는지 확인
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(1500);

        fB5B1 = page.frame({ url: /B5B1\.asp/ });
        console.log('fB5B1 exists after next click?:', !!fB5B1);
      }

      if (fB5B1) {
        console.log('Injecting B5B1 joinYear:', persona.onnuri.joinYear);
        await fB5B1.fill('input[name="B5B_1"], input[type="tel"], input[type="text"]', persona.onnuri.joinYear);
      }

      let fB5C1 = page.frame({ url: /B5C1\.asp/ });
      if (fB5C1) {
        await fB5C1.fill('input[name="B5C_1"], input[type="tel"], input[type="text"]', persona.onnuri.salesRatio);
      }

      let fB5D1 = page.frame({ url: /B5D1\.asp/ });
      if (fB5D1) {
        await fB5D1.click('#B5D_1_3, input[value="3"]').catch(() => {});
      }

      let fB5F1 = page.frame({ url: /B5F1\.asp/ });
      if (fB5F1) {
        await fB5F1.click('#B5F_1_3, input[value="3"]').catch(() => {});
      }

      let fB5AB = page.frame({ url: /B5AB\.asp/ });
      if (fB5AB) {
        await fB5AB.click('#B5AB_1, input[value="1"]').catch(() => {});
      }
    } else {
      // P8 ~ P14 기본 통과
      console.log(`Handling ${pageName}...`);
    }

    // 다음 페이지 이동 클릭
    console.log('Clicking next for', pageName);
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  await browser.close();
}

testSlot12StepByStep().catch(console.error);
