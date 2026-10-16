import { chromium } from 'playwright';

async function inspectG2() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }

  console.log('Current URL:', page.url());
  console.log('Frames:', page.frames().map(f => f.url()));
  const f = page.frame({ url: /G2\.asp/ });
  if (f) {
    const text = await f.evaluate(() => document.body.innerText);
    console.log('Form text:\n', text);
  } else {
    console.log('Frame G2 not found!');
  }

  await browser.close();
}

inspectG2();
