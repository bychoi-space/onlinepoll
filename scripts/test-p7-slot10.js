import { chromium } from 'playwright';

const slot10Url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BtQ09ixb5&type=tapi&prid=2026070802&mnid=900001346&srt=1';

async function testExactRunnerCode() {
  console.log('Testing exact runner code on slot #10...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`🔔 [Dialog Alert] "${dialog.message()}"`);
    await dialog.accept();
  });

  await page.goto(slot10Url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  console.log('URL after index:', page.url());

  // Exactly what runner does:
  const fB5A1 = page.frame({ url: /B5A1\.asp/ }) || page.frame({ url: /B5A\.asp/ });
  if (fB5A1) {
    await fB5A1.evaluate(() => {
      if (typeof setRadioValue === 'function') setRadioValue('B5A_1', '1');
      const r = document.querySelector('#B5A_1_1, input[value="1"]');
      if (r) r.checked = true;
    }).catch(() => {});
  }

  const fB5A2 = page.frame({ url: /B5A2\.asp/ });
  if (fB5A2) {
    await fB5A2.evaluate(() => {
      if (typeof setRadioValue === 'function') setRadioValue('B5A_2', '2');
      const r = document.querySelector('#B5A_2_2, input[value="2"]');
      if (r) r.checked = true;
    }).catch(() => {});
  }

  let fB5B1 = page.frame({ url: /B5B1\.asp/ });
  console.log('Before click, fB5B1 exists:', !!fB5B1);

  if (!fB5B1) {
    console.log('Clicking 1st #next...');
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(1500);

    for (let w = 0; w < 10; w++) {
      fB5B1 = page.frame({ url: /B5B1\.asp/ });
      if (fB5B1) break;
      await page.waitForTimeout(500);
    }
  }

  console.log('After 1st #next, fB5B1 exists:', !!fB5B1);

  await browser.close();
}

testExactRunnerCode().catch(console.error);
