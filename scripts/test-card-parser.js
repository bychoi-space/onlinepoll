if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testCardParser() {
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

    const keyword = '외식업';
    await page.goto(`https://marketbz.com/업체명으로기업조회/${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const companies = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/companyDetail/"]'));

      links.forEach(a => {
        const companyName = a.innerText.trim();
        const bizNoUrlMatch = a.href.match(/\/companyDetail\/(\d{10})/);
        const rawBizNo = bizNoUrlMatch ? bizNoUrlMatch[1] : '';

        // 해당 카드 컨테이너 찾기
        const card = a.closest('div[class*="item"], li, tr, div') || a.parentElement;
        const cardText = card ? card.innerText : '';

        // 사업자번호 (하이픈 형식)
        const bizMatch = cardText.match(/(\d{3}-\d{2}-\d{5})/);
        const bizNumber = bizMatch ? bizMatch[1] : (rawBizNo ? rawBizNo.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3') : '');

        // 대표자 이름 추출 (예: '김**** / 604-82-02688' 또는 '형문채 / 127-18-28593')
        const ceoMatch = cardText.match(/([가-힣\*\s]{2,10})\s*\/\s*\d{3}-\d{2}-\d{5}/);
        const ceoName = ceoMatch ? ceoMatch[1].trim() : '';

        // 주소 추출 (예: '강원특별자치도 평창군', '서울특별시 송파구' 등)
        const addrMatch = cardText.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣특별자치도시도\s]+(?:시|군|구)[가-힣0-9\s]*)/);
        const address = addrMatch ? addrMatch[1].trim().split('\n')[0] : '';

        // 업종 / 분류
        const industryMatch = cardText.match(/(도소매업|협회단체|정보통신업|제조업|건설업|숙박음식점업|시설관리지원임대업|서비스업)/);
        const industry = industryMatch ? industryMatch[1] : '';

        const subIndMatch = cardText.match(/(반찬\/식품|소프트웨어개발|고용 알선\/인력 공급|채소|시민단체)/);
        const subIndustry = subIndMatch ? subIndMatch[1] : '';

        if (companyName && (bizNumber || rawBizNo)) {
          results.push({
            companyName,
            bizNumber,
            ceoName,
            address,
            industry,
            subIndustry,
            detailUrl: a.href
          });
        }
      });

      return results;
    });

    console.log('수집된 사업자 목록 (총 ' + companies.length + '개):');
    console.log(JSON.stringify(companies.slice(0, 5), null, 2));

  } catch (err) {
    console.error('에러:', err);
  } finally {
    await browser.close();
  }
}

testCardParser();
