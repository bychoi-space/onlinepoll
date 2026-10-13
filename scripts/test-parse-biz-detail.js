if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testParseBizDetail() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);
    await page.click('button.btn-login');
    const successBtn = page.locator('#successButton, button:has-text("확인")').first();
    await successBtn.waitFor({ state: 'visible', timeout: 8000 });
    await successBtn.click();
    await page.waitForTimeout(1500);

    const testBizNo = '1208168297';
    await page.goto(`https://marketbz.com/companyDetail/${testBizNo}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const companyData = await page.evaluate(() => {
      const data = {
        category: '',      // 분류
        industry: '',      // 업종
        companyName: '',   // 상호
        subIndustry: '',   // 세부업종
        bizNumber: '',     // 사업자번호
        ceoName: '',       // 대표자이름
        phone: '',         // 전화번호
        openingDate: '',   // 개업일
        address: ''        // 주소
      };

      // 상호명 추출 (h1 또는 기업명 타이틀)
      const titleEl = document.querySelector('h1, h2.company-name, [class*="company_name"], .company-title');
      if (titleEl) {
        data.companyName = titleEl.innerText.trim();
      }

      // 테이블 및 키-값 구조 탐색
      const allText = document.body.innerText;

      // 정규식 및 텍스트 매칭으로 핵심 필드 추출
      // 1. 사업자번호
      const bizMatch = allText.match(/사업자번호\s*\|\s*([\d-]+)/) || allText.match(/사업자번호\s*([\d-]+)/);
      if (bizMatch) data.bizNumber = bizMatch[1].trim();

      // 2. 대표자
      const ceoMatch = allText.match(/대표자\s*\|\s*([^\s\|]+)/) || allText.match(/대표자\s*([^\s\|]+)/);
      if (ceoMatch) data.ceoName = ceoMatch[1].trim();

      // 3. 업종/분류
      const tableCells = Array.from(document.querySelectorAll('td, th, dd, dt, span, div'));
      tableCells.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        if (text === '설립일' || text === '개업일') {
          const next = el.nextElementSibling || el.parentElement.querySelector('td:last-child');
          if (next) data.openingDate = next.innerText.trim();
        }
        if (text === '주소' || text === '소재지') {
          const next = el.nextElementSibling || el.parentElement.querySelector('td:last-child');
          if (next) data.address = next.innerText.trim();
        }
        if (text === '전화번호' || text === '대표전화') {
          const next = el.nextElementSibling || el.parentElement.querySelector('td:last-child');
          if (next) data.phone = next.innerText.trim();
        }
        if (text === '업종' || text === '표준산업분류') {
          const next = el.nextElementSibling || el.parentElement.querySelector('td:last-child');
          if (next) data.industry = next.innerText.trim();
        }
      });

      // 요약 문장에서 주소/업종 보충 추출
      // 예: "지멘스인더스트리소프트웨어 주식회사는 서울특별시 강남구에 소재하며, 시스템 소프트웨어 개발 및 공급업을 영위하는 기업입니다."
      const descMatch = allText.match(/([가-힣A-Za-z0-9\s]+(?:주식회사|회사|기업|상사))는\s+([가-힣0-9\s]+(?:구|시|군|도))에 소재하며[,\s]+([가-힣0-9\s]+)을 영위하는/);
      if (descMatch) {
        if (!data.companyName) data.companyName = descMatch[1].trim();
        if (!data.address) data.address = descMatch[2].trim();
        if (!data.subIndustry) data.subIndustry = descMatch[3].trim();
      }

      return { data, pageTitle: document.title };
    });

    console.log('추출된 기업 데이터:\n', JSON.stringify(companyData, null, 2));

  } catch (err) {
    console.error('에러:', err);
  } finally {
    await browser.close();
  }
}

testParseBizDetail();
