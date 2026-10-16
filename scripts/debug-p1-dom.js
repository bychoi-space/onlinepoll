import { chromium } from 'playwright';

async function debugP1() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }
  console.log('Current URL:', page.url());
  
  // A1: 성별 여성 (2)
  const fA1 = page.frame({ url: /A1\.asp/ });
  if (fA1) await fA1.click('#A1_2');
  console.log('A1 성별=여성');

  // A2: 나이 48
  const fA2 = page.frame({ url: /A2\.asp/ });
  if (fA2) await fA2.fill('input[name="A2"]', '48');
  console.log('A2 나이=48');

  // A3: 사업자 형태 개인 (2)
  const fA3 = page.frame({ url: /A3\.asp/ });
  if (fA3) await fA3.click('#A3_2');
  console.log('A3 형태=개인');
  await page.waitForTimeout(1000);

  // A3A: 개인사업자 구분 일반 (1)
  const fA3A = page.frame({ url: /A3A\.asp/ });
  if (fA3A) await fA3A.click('#A3A_1');
  console.log('A3A 구분=일반');

  // A4: 사업자등록 등록 (1)
  const fA4 = page.frame({ url: /A4\.asp/ });
  if (fA4) await fA4.click('#A4_1');
  console.log('A4 등록=등록(1)');
  await page.waitForTimeout(1000);

  // A4A: 사업자등록번호 555-95-01465 (12자리)
  const fA4A = page.frame({ url: /A4A\.asp/ });
  if (fA4A) await fA4A.fill('input[name="A4A_1"]', '555-95-01465');
  console.log('A4A 사업자번호=555-95-01465 (12자리)');

  // A5: 개업연월 2020년 10월
  const fA5 = page.frame({ url: /A5\.asp/ });
  if (fA5) {
    await fA5.fill('input[name="A5_1"]', '2020');
    await fA5.fill('input[name="A5_2"]', '10');
  }
  console.log('A5 개업연월=2020년 10월');

  await page.waitForTimeout(1000);

  page.on('dialog', async d => {
    console.log('🔔 Alert on P1 submit:', d.message());
    await d.accept();
  });

  console.log('Clicking #next on P1.asp...');
  await page.evaluate(() => document.querySelector('#next')?.click());

  await page.waitForTimeout(3000);
  console.log('Navigated to URL:', page.url());

  await browser.close();
}

debugP1();
