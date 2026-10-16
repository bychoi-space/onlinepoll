import { chromium } from 'playwright';

async function inspectB5A1() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=0E6G9JX98&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  const fB5A1 = page.frame({ url: /B5A1\.asp/ });
  if (fB5A1) {
    const html = await fB5A1.content();
    console.log('=== B5A1.asp HTML ===');
    console.log(html);
  } else {
    console.log('B5A1 not found!');
  }

  const fB5A2 = page.frame({ url: /B5A2\.asp/ });
  if (fB5A2) {
    console.log('=== B5A2.asp HTML ===');
    console.log(await fB5A2.content());
  }

  await browser.close();
}

inspectB5A1().catch(console.error);
