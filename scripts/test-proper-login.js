if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testProperLogin() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  page.on('response', res => {
    if (res.url().includes('login') || res.url().includes('auth') || res.status() >= 300) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  page.on('dialog', async dialog => {
    console.log(`[Dialog Alert] ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    console.log('1. 로그인 페이지 접속');
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });

    console.log('2. 계정 정보 입력');
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);

    console.log('3. 로그인 버튼 클릭');
    await page.click('button.btn-login');

    await page.waitForTimeout(4000);

    console.log('4. 로그인 후 상태:');
    console.log('URL:', page.url());

    const result = await page.evaluate(() => {
      const modalText = document.querySelector('#alertModal, .modal, .alert')?.innerText || '';
      const bodyText = document.body.innerText;
      return {
        modalText,
        bodyExcerpt: bodyText.slice(0, 300).replace(/\n+/g, ' ')
      };
    });

    console.log('Modal text:', result.modalText);
    console.log('Body excerpt:', result.bodyExcerpt);

    // 인덱스로 돌아갔는지 확인
    if (page.url().includes('/index')) {
      console.log('>>> 로그인 성공 후 /index 로 리다이렉트됨!');
    }
  } catch (err) {
    console.error('오류:', err);
  } finally {
    await browser.close();
  }
}

testProperLogin();
