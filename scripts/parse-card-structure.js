if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function parseCardStructure() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 로그인
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);
    await page.click('button.btn-login');
    const successBtn = page.locator('#successButton, button:has-text("확인")').first();
    await successBtn.waitFor({ state: 'visible', timeout: 8000 });
    await successBtn.click();
    await page.waitForTimeout(2000);

    // 검색 결과 페이지로 바로 이동
    const keyword = '외식업';
    await page.goto(`https://marketbz.com/업체명으로기업조회/${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 첫 번째 기업 카드 엘리먼트 구조 상세 분석
    const cardData = await page.evaluate(() => {
      // 검색 결과 내 각 기업 아이템(카드 또는 행) 탐색
      // 일반적으로 li, .item, .company_card, .list_item 등
      const cards = Array.from(document.querySelectorAll('.company-item, .list_item, .search_result_item, .company_card, li.item, tr, div[class*="company"]'));

      // 가장 상호와 사업자번호를 잘 포함하고 있는 컨테이너 찾기
      const targetCard = cards.find(c => {
        const text = c.innerText || '';
        return text.includes('복사') || (text.includes('/') && /\d{3}-\d{2}-\d{5}/.test(text));
      });

      if (!targetCard) return { error: 'target card not found', allCardsCount: cards.length };

      return {
        outerHTML: targetCard.outerHTML.slice(0, 2000),
        innerText: targetCard.innerText,
        links: Array.from(targetCard.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href }))
      };
    });

    console.log('카드 구조 분석 결과:');
    console.log('innerText:\n', cardData.innerText);
    console.log('링크들:\n', JSON.stringify(cardData.links, null, 2));

  } catch (err) {
    console.error('에러:', err);
  } finally {
    await browser.close();
  }
}

parseCardStructure();
