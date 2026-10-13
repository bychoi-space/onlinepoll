if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function dumpDetailText() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(2000);
  const okBtn = await page.$('#successButton');
  if (okBtn) await okBtn.click();
  await page.waitForTimeout(2000);

  await page.goto('https://marketbz.com/companyDetail/5559501465', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('--- BODY TEXT START ---');
  console.log(bodyText.slice(0, 1500));
  console.log('--- BODY TEXT END ---');

  await browser.close();
}

dumpDetailText();
