import { chromium } from 'playwright';

const slot10Url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BtQ09ixb5&type=tapi&prid=2026070802&mnid=900001346&srt=1';

async function testSelectP8() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('dialog', async d => {
    console.log(`Alert: ${d.message()}`);
    await d.accept();
  });

  await page.goto(slot10Url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  console.log('Current URL:', page.url());

  const fC1A = page.frame({ url: /C1A\.asp/ });
  if (fC1A) {
    const radioInfo = await fC1A.evaluate(() => {
      const r2 = document.querySelector('#C1A_2');
      return {
        hasR2: !!r2,
        r2CheckedBefore: r2 ? r2.checked : null,
        formAction: document.forms[0]?.action,
        formFields: Array.from(document.forms[0]?.elements || []).map(e => e.name + '=' + e.value)
      };
    });
    console.log('C1A info before click:', radioInfo);

    // Let's click C1A_2 using Playwright frame click!
    console.log('Clicking #C1A_2 via Playwright frame locator...');
    await fC1A.click('#C1A_2');

    const radioInfoAfter = await fC1A.evaluate(() => {
      const r2 = document.querySelector('#C1A_2');
      return {
        r2CheckedAfter: r2 ? r2.checked : null,
        formFields: Array.from(document.forms[0]?.elements || []).map(e => e.name + '=' + e.value)
      };
    });
    console.log('C1A info after click:', radioInfoAfter);
  }

  // Now click all C1A through C1G
  for (const l of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    const f = page.frame({ url: new RegExp('C1' + l + '\\.asp') });
    if (f) {
      await f.click(`#C1${l}_2`).catch(async () => {
        await f.evaluate(letter => {
          const r = document.querySelector(`#C1${letter}_2, input[value="2"]`);
          if (r) { r.checked = true; r.click(); }
        }, l);
      });
      console.log(`Clicked #C1${l}_2`);
    }
  }

  // Now click #next
  console.log('Clicking #next on P8...');
  await page.evaluate(() => document.querySelector('#next')?.click());
  await page.waitForTimeout(2500);

  console.log('After #next click, URL:', page.url());

  // Check if C1GA appeared or if it advanced to P9
  const fGA = page.frame({ url: /C1GA\.asp/ });
  console.log('Does C1GA frame exist?:', !!fGA);
  if (fGA) {
    console.log('Selecting C1GA...');
    await fGA.click('#C1GA_1').catch(async () => {
      await fGA.evaluate(() => {
        const r = document.querySelector('#C1GA_1, input[value="1"]');
        if (r) { r.checked = true; r.click(); }
      });
    });
    console.log('Clicking #next after C1GA...');
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
    console.log('After 2nd click, URL:', page.url());
  }

  await browser.close();
}

testSelectP8().catch(console.error);
