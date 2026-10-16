import { chromium } from 'playwright';
import path from 'path';

async function checkAgree() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }
  console.log('Current URL:', page.url());

  if (page.url().includes('Agree.asp')) {
    // 동의(Y) 라디오 버튼 체크
    await page.click('#AGREE_1');
    await page.waitForTimeout(1000);

    const isChecked = await page.evaluate(() => document.querySelector('#AGREE_1')?.checked);
    console.log('AGREE_1 (동의) checked status:', isChecked);

    // 증빙 스크린샷 캡처
    const screenshotPath = path.resolve('reports/simulation_77susan/15_Agree_checked_final.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Final Agree screenshot saved to:', screenshotPath);
  }

  await browser.close();
}

checkAgree();
