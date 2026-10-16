import { chromium } from 'playwright';

async function checkSrt2() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const urlSrt2 = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=EZQPGx4L8&type=tapi&prid=2026070802&mnid=900001346&srt=2';
  console.log('Navigating to srt=2 URL for 더덕상회:', urlSrt2);
  await page.goto(urlSrt2);
  await page.waitForTimeout(2000);

  console.log('srt=2 current URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('srt=2 body:\n', bodyText);

  await browser.close();
}

checkSrt2().catch(console.error);
