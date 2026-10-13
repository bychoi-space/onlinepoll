import { chromium } from 'playwright';

async function checkLoginLinks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://marketbz.com/index', { waitUntil: 'domcontentloaded' });

  const info = await page.evaluate(() => {
    const allA = Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.innerText.trim(),
      href: a.href,
      onclick: a.getAttribute('onclick')
    })).filter(a => a.text.includes('로그인') || a.href.includes('login') || (a.onclick && a.onclick.includes('login')));

    const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      onclick: b.getAttribute('onclick'),
      classes: b.className
    })).filter(b => b.text.includes('로그인'));

    return { allA, allButtons };
  });

  console.log('Login elements:', JSON.stringify(info, null, 2));

  // 직접 https://marketbz.com/login 또는 유사 URL 접근 시도
  const loginRes = await page.goto('https://marketbz.com/login').catch(e => ({ status: () => e.message }));
  console.log('/login status:', typeof loginRes.status === 'function' ? loginRes.status() : loginRes);
  console.log('URL after /login:', page.url());

  await browser.close();
}

checkLoginLinks();
