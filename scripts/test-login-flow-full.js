if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testFullFlow() {
  console.log('[MarketBz] 로그인 완료 및 기업 검색 플로우 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. 로그인
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);
    await page.click('button.btn-login');

    // 2. 로그인 성공 모달의 '확인' 버튼 클릭
    console.log('[MarketBz] 로그인 성공 확인 버튼 대기 및 클릭...');
    const successBtn = page.locator('#successButton, button:has-text("확인")').first();
    await successBtn.waitFor({ state: 'visible', timeout: 8000 });
    await successBtn.click();

    await page.waitForTimeout(3000);
    console.log('[MarketBz] 이동 후 URL:', page.url());

    // 3. /index 로 직접 이동 (세션 쿠키가 유지되는지 확인)
    await page.goto('https://marketbz.com/index', { waitUntil: 'networkidle' });
    console.log('[MarketBz] /index 재방문 URL:', page.url());

    // 로그인된 상태인지 확인
    const headerInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasLogout: text.includes('로그아웃'),
        hasMypage: text.includes('마이페이지'),
        hasName: text.includes('이민희')
      };
    });
    console.log('[MarketBz] 로그인 유지 상태:', headerInfo);

    // 4. 검색창에 업종 또는 기업명 입력 (예: '카페' 또는 '소프트웨어')
    console.log('[MarketBz] 검색창에 "소프트웨어" 검색 시도...');
    const searchInput = page.locator('#searchInput').first();
    await searchInput.fill('소프트웨어');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(4000);
    console.log('[MarketBz] 검색 후 URL:', page.url());

    // 검색 결과 항목들 파싱
    const results = await page.evaluate(() => {
      // 검색 결과 내 각 기업 아이템 탐색
      const items = [];
      const cards = document.querySelectorAll('.list_item, .company_item, tr, .search_list li, .card, [class*="company"]');
      
      cards.forEach(card => {
        const text = card.innerText ? card.innerText.trim() : '';
        if (text && (text.includes('사업자') || text.includes('대표자') || text.includes('주소') || text.includes('업종'))) {
          items.push(text.slice(0, 200).replace(/\s+/g, ' '));
        }
      });

      return {
        itemCount: items.length,
        samples: items.slice(0, 3)
      };
    });

    console.log('[MarketBz] 검색 결과 데이터:', JSON.stringify(results, null, 2));

  } catch (err) {
    console.error('[MarketBz] 오류:', err);
  } finally {
    await browser.close();
  }
}

testFullFlow();
