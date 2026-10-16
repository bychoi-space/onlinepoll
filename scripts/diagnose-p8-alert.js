import { chromium } from 'playwright';

async function diagnoseP8() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('dialog', async d => {
    console.log('🔔 [ALERT ON P8]:', d.message());
    await d.accept();
  });

  const url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=05anItSeU&type=tapi&prid=2026070802&mnid=900001346&srt=1';
  await page.goto(url);
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
  }

  console.log('Current URL on slot 3:', page.url());
  const frames = page.frames().map(f => f.url()).filter(u => u.includes('.asp'));
  console.log('Frames on P8:', frames);

  // P8 현재 폼의 input들 상태 확인
  for (const f of page.frames()) {
    if (f.url().includes('C1')) {
      const inputs = await f.evaluate(() => Array.from(document.querySelectorAll('input:checked, input[type="text"]')).map(i => ({ id: i.id, name: i.name, value: i.value })));
      console.log(`Inputs in ${f.url().split('/').pop()}:`, inputs);
    }
  }

  console.log('Clicking next on P8 to see alert...');
  await page.evaluate(() => document.querySelector('#next')?.click());
  await page.waitForTimeout(3000);
  console.log('After next URL:', page.url());

  await browser.close();
}

diagnoseP8().catch(console.error);
