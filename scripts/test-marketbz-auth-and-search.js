if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testAuthAndSearch() {
  console.log('[MarketBz] 로그인 및 사업자 검색 테스트 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. 직접 로그인 페이지로 이동
    console.log('[MarketBz] 로그인 페이지 이동: https://marketbz.com/loginPage?redirectUrl=%2Findex');
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });

    // 2. 로그인 정보 기입
    console.log('[MarketBz] 아이디/비밀번호 입력 중...');
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);

    // 3. 로그인 버튼 클릭
    console.log('[MarketBz] 로그인 버튼 클릭...');
    // 버튼 찾기 (submit 버튼 또는 .btn.login 등)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      page.locator('button[type="submit"], button:has-text("로그인"), .btn_login, #loginBtn').first().click()
    ]);

    await page.waitForTimeout(3000);
    console.log('[MarketBz] 로그인 후 URL:', page.url());

    // 로그인 성공 확인
    const bodyText = await page.innerText('body');
    const isSuccess = bodyText.includes('로그아웃') || bodyText.includes('마이페이지') || page.url().includes('/index');
    console.log('[MarketBz] 로그인 성공 여부:', isSuccess);

    // 4. 기업 검색 시도 (예: '카페' 또는 '소프트웨어')
    console.log('[MarketBz] 기업 검색 시도: "소프트웨어"');
    const searchInput = page.locator('#searchInput, input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('소프트웨어');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(3000);

      console.log('[MarketBz] 검색 결과 페이지 URL:', page.url());

      // 검색 결과 내역 확인
      const searchResultInfo = await page.evaluate(() => {
        // 테이블 또는 리스트 아이템 탐색
        const rows = document.querySelectorAll('tr, .company-item, .list_item, .search_item, li');
        const companies = [];
        
        // 기업명 또는 사업자 번호가 보이는 블록 탐색
        document.querySelectorAll('a, div, tr').forEach(el => {
          const text = el.innerText || '';
          if (text.includes('사업자') || text.includes('대표자') || text.includes('주소')) {
            companies.push(text.slice(0, 150).replace(/\n+/g, ' '));
          }
        });

        return {
          totalRows: rows.length,
          title: document.title,
          snippets: companies.slice(0, 5)
        };
      });

      console.log('[MarketBz] 검색 결과 요약:', JSON.stringify(searchResultInfo, null, 2));
    }
  } catch (err) {
    console.error('[MarketBz] 오류 발생:', err);
  } finally {
    await browser.close();
  }
}

testAuthAndSearch();
