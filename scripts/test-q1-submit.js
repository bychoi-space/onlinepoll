import { chromium } from 'playwright';

async function testQ1() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('dialog', async (d) => {
    console.log('🔔 Dialog:', d.message());
    await d.accept();
  });

  const url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';
  await page.goto(url);
  await Promise.all([page.waitForNavigation(), page.click('#next')]);
  await page.click('#Q1_1');
  await Promise.all([page.waitForNavigation(), page.click('#next')]);

  console.log('Current URL (Q1):', page.url());

  // Fill Q1
  await page.evaluate(() => {
    document.getElementById('Q1_4_1').value = '05527';
    document.getElementById('Q1_4_2').value = '서울특별시 송파구 바람드리길 37-1';
  });
  await page.fill('#Q1_4_3', '1층');
  await page.fill('#Q1_5', '칠칠수산');
  await page.click('#Q1_6_1'); // 점포
  await page.click('#Q1_7_3'); // 수산물
  await page.click('#Q1_8_2'); // 소매
  await page.fill('#Q1_9_1', '수산물 (생선, 활어)');
  await page.fill('#Q1_10', '오지은');
  await page.fill('#Q1_11', '0507-1420-1996');
  await page.click('#Q1_12_1'); // 점포주
  await page.click('#Q1_13_2'); // 아니오

  console.log('Submitting Q1.asp...');
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('#next')
  ]);

  console.log('Navigated to:', page.url());
  await browser.close();
}

testQ1();
