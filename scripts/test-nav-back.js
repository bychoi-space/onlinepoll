import { chromium } from 'playwright';

async function testPrevOrList() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }
  console.log('Current URL:', page.url());

  // Check what survey_list or prev does
  const listBtn = await page.$('#survey_list');
  console.log('survey_list button exists:', !!listBtn);

  const prevBtn = await page.$('#prev');
  console.log('prev button exists:', !!prevBtn);

  if (prevBtn) {
    console.log('Clicking #prev...');
    await page.evaluate(() => document.querySelector('#prev')?.click());
    await page.waitForTimeout(2500);
    console.log('After prev URL:', page.url());
  }

  await browser.close();
}

testPrevOrList();
