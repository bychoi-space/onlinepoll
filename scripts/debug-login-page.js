if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function debugLoginPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });

  // 폼 정보 추출
  const formDetails = await page.evaluate(() => {
    const form = document.querySelector('form');
    const buttons = Array.from(document.querySelectorAll('button, a.btn, input[type="submit"]')).map(b => ({
      tagName: b.tagName,
      text: b.innerText ? b.innerText.trim() : '',
      id: b.id,
      className: b.className,
      onclick: b.getAttribute('onclick'),
      type: b.getAttribute('type')
    }));

    return {
      action: form ? form.action : 'no form',
      method: form ? form.method : 'no form',
      buttons
    };
  });

  console.log('Form Details:', JSON.stringify(formDetails, null, 2));

  // 실제 로그인 동작 테스트 (네트워크 요청 모니터링 포함)
  page.on('response', res => {
    if (res.url().includes('login') || res.status() >= 400) {
      console.log(`[Response] ${res.status()} ${res.url()}`);
    }
  });

  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);

  // 버튼 클릭 시도
  const submitTarget = await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"], button.btn, .btn_login, a#btnLogin, button:has-text("로그인")') || document.querySelector('form button');
    if (btn) {
      btn.click();
      return btn.innerText || btn.className;
    }
    // form.submit() 직접 호출 시도
    const form = document.querySelector('form');
    if (form) {
      form.submit();
      return 'form.submit()';
    }
    return 'none';
  });

  console.log('Submitted target:', submitTarget);
  await page.waitForTimeout(4000);

  console.log('Final URL:', page.url());
  const errorMsg = await page.evaluate(() => {
    const alerts = document.querySelectorAll('.error, .alert, .warn, [class*="error"], [class*="alert"]');
    return Array.from(alerts).map(a => a.innerText.trim()).filter(Boolean);
  });
  console.log('Error messages on page:', errorMsg);

  await browser.close();
}

debugLoginPage();
