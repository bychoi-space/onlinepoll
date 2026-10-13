if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function checkDetailPage() {
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
    const successBtn = page.locator('#successButton, button:has-text("확인")').first();
    await successBtn.waitFor({ state: 'visible', timeout: 8000 });
    await successBtn.click();
    await page.waitForTimeout(2000);

    // 2. 기업 상세 페이지 방문 (지멘스 또는 외식업 기업)
    // 120-81-68297 -> 1208168297
    const testBizNo = '1208168297';
    console.log(`기업 상세 페이지 방문: https://marketbz.com/companyDetail/${testBizNo}`);
    await page.goto(`https://marketbz.com/companyDetail/${testBizNo}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 상세 페이지 내 텍스트 및 테이블 파싱
    const detailData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, dl, div[class*="info"], div[class*="detail"]')).map(el => el.innerText.trim()).filter(Boolean);
      return {
        title: document.title,
        bodySample: document.body.innerText.slice(0, 1500).replace(/\n+/g, ' | ')
      };
    });

    console.log('상세 페이지 분석 결과:\n', JSON.stringify(detailData, null, 2));

  } catch (err) {
    console.error('에러:', err);
  } finally {
    await browser.close();
  }
}

checkDetailPage();
