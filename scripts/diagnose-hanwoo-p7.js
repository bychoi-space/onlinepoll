import { chromium } from 'playwright';

async function checkHanwooP7() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('dialog', async d => {
    console.log('🔔 [ALERT DETECTED]:', d.message());
    await d.accept();
  });

  const url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=0E6G9JX98&type=tapi&prid=2026070802&mnid=900001346&srt=1';
  console.log('Navigating to:', url);
  await page.goto(url);
  await page.waitForTimeout(2000);
  console.log('Current page URL:', page.url());

  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
    console.log('After index.asp -> URL:', page.url());
  }

  // 프레임 목록 출력
  const frames = page.frames();
  console.log('Frames on page:', frames.map(f => f.url()).filter(u => u.includes('.asp')));

  // 만약 P7(B5) 프레임이 있다면
  const fB5A1 = page.frame({ url: /B5A1\.asp/ });
  const fB5A = page.frame({ url: /B5A\.asp/ });
  console.log('fB5A1 exists:', !!fB5A1, 'fB5A exists:', !!fB5A);

  await page.evaluate(() => document.querySelector('#next')?.click());
  await page.waitForTimeout(2500);
  console.log('After next click -> URL:', page.url());

  await browser.close();
}

checkHanwooP7().catch(console.error);
