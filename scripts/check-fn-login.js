import { chromium } from 'playwright';

async function checkFnLogin() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://marketbz.com/index', { waitUntil: 'domcontentloaded' });

  const fnContent = await page.evaluate(() => {
    return window.fn_login ? window.fn_login.toString() : 'fn_login not found';
  });

  console.log('fn_login content:\n', fnContent);

  await browser.close();
}

checkFnLogin();
