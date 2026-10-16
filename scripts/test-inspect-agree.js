import { chromium } from 'playwright';
import path from 'path';

async function inspectAgree() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }
  console.log('Current URL:', page.url());

  // inputs and structure of Agree.asp
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button')).map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      value: el.value,
      checked: el.checked,
      text: el.innerText
    }));
  });
  console.log('Agree inputs:\n', JSON.stringify(inputs, null, 2));

  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page body text:\n', text);

  // Take screenshot
  const screenshotPath = path.resolve('reports/simulation_77susan/14_Agree_initial.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
}

inspectAgree();
