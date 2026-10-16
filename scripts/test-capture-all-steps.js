import { chromium } from 'playwright';
import path from 'path';

async function captureBackward() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }

  const SCREENSHOT_DIR = path.resolve('reports/simulation_77susan');

  // We are at Agree.asp or P14.asp
  console.log('Current URL:', page.url());

  // Loop back until P1 or Q1
  for (let i = 0; i < 20; i++) {
    const url = page.url();
    console.log(`[Back Step #${i}] URL: ${url}`);
    
    // Extract step name
    let stepName = 'Agree';
    const match = url.match(/(P\d+|Q\d+|Survey|index|Agree)\.asp/i);
    if (match) stepName = match[1];

    await page.waitForTimeout(1500);
    const savePath = path.join(SCREENSHOT_DIR, `step_${stepName}_saved.png`);
    await page.screenshot({ path: savePath, fullPage: true });
    console.log(`Saved screenshot for ${stepName}: ${savePath}`);

    if (stepName === 'Q1' || stepName === 'Survey' || stepName === 'index') {
      console.log('Reached starting point.');
      break;
    }

    const prevBtn = await page.$('#prev');
    if (!prevBtn) {
      console.log('No #prev button found.');
      break;
    }

    await page.evaluate(() => document.querySelector('#prev')?.click());
    await page.waitForTimeout(2500);
  }

  // Now move forward back to Agree.asp by clicking #next
  console.log('\nNavigating forward back to Agree.asp...');
  for (let i = 0; i < 20; i++) {
    const url = page.url();
    console.log(`[Forward Step #${i}] URL: ${url}`);
    if (url.includes('Agree.asp')) {
      console.log('Returned to Agree.asp!');
      // Ensure agree radio is checked
      await page.click('#AGREE_1').catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step_Agree_saved.png'), fullPage: true });
      break;
    }
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }

  await browser.close();
}

captureBackward();
