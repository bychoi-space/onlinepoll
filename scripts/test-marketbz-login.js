if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testLogin() {
  console.log('[MarketBz Login] 브라우저 세션 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://marketbz.com/index', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('[MarketBz Login] 페이지 로드 완료');

    // '로그인' 버튼 또는 링크 클릭
    console.log('[MarketBz Login] 로그인 버튼 클릭 시도...');
    const loginBtn = await page.locator('a:has-text("로그인"), button:has-text("로그인")').first();
    await loginBtn.click();
    await page.waitForTimeout(2000);

    // 모달 또는 폼 필드 탐색
    const formFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
        type: i.type,
        name: i.name,
        id: i.id,
        placeholder: i.placeholder,
        visible: i.offsetParent !== null
      }));
      return inputs;
    });

    console.log('[MarketBz Login] 활성화된 입력 필드들:', JSON.stringify(formFields, null, 2));

    // 아이디, 비밀번호 입력 시도
    // 이메일 또는 id 입력 필드 탐색
    const idInput = page.locator('input[type="email"], input[type="text"][placeholder*="아이디"], input[type="text"][placeholder*="이메일"], input[name*="email"], input[name*="id"], input[id*="id"]').first();
    const pwInput = page.locator('input[type="password"]').first();

    if (await idInput.count() > 0 && await pwInput.count() > 0) {
      console.log('[MarketBz Login] 아이디/비밀번호 필드 발견, 입력 진행...');
      await idInput.fill(process.env.MARKETBZ_USER);
      await pwInput.fill(process.env.MARKETBZ_PASSWORD);
      
      // 제출 버튼 탐색
      const submitBtn = page.locator('button[type="submit"], button:has-text("로그인"), input[type="submit"]').first();
      await submitBtn.click();
      console.log('[MarketBz Login] 로그인 제출 버튼 클릭 완료');

      await page.waitForTimeout(3000);
      console.log('[MarketBz Login] 로그인 후 URL:', page.url());

      // 로그인 성공 여부 (마이페이지, 로그아웃 버튼 등의 존재 확인)
      const afterLoginState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasLogout: text.includes('로그아웃') || text.includes('마이페이지'),
          hasUser: text.includes('thedreamtowel') || text.includes('님'),
          title: document.title
        };
      });

      console.log('[MarketBz Login] 로그인 상태 판별:', afterLoginState);
    } else {
      console.log('[MarketBz Login] 아이디/비밀번호 입력 필드를 찾지 못했습니다.');
    }
  } catch (err) {
    console.error('[MarketBz Login] 에러:', err);
  } finally {
    await browser.close();
  }
}

testLogin();
