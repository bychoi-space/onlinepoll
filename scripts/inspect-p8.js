import { chromium } from 'playwright';

const slot10Url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BtQ09ixb5&type=tapi&prid=2026070802&mnid=900001346&srt=1';

async function inspectP8() {
  console.log('Inspecting P8 frames and DOM...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`Alert: "${dialog.message()}"`);
    await dialog.accept();
  });

  await page.goto(slot10Url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  console.log('Page URL:', page.url());
  const frames = page.frames();
  console.log(`Total frames: ${frames.length}`);
  for (const f of frames) {
    if (f.url().includes('asp')) {
      const inputs = await f.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(i => ({
          name: i.name,
          id: i.id,
          type: i.type,
          value: i.value
        }));
      }).catch(() => []);
      console.log(`\nFrame: ${f.url()}`);
      console.log(`  Inputs:`, inputs);
    }
  }

  await browser.close();
}

inspectP8().catch(console.error);
