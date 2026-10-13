if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function testMarketBzWithOnnuriBiz() {
  console.log('Testing MarketBz lookup for Onnuri business: 5559501465 (칠칠수산)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. Login to MarketBz
    console.log('Logging in to MarketBz...');
    await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
    await page.fill('#username', process.env.MARKETBZ_USER);
    await page.fill('#password', process.env.MARKETBZ_PASSWORD);
    await page.click('button.btn-login');
    await page.waitForTimeout(2000);
    const okBtn = await page.$('#successButton');
    if (okBtn) await okBtn.click();
    await page.waitForTimeout(2000);

    // 2. Direct navigate or search for 5559501465
    console.log('Navigating to companyDetail/5559501465...');
    await page.goto('https://marketbz.com/companyDetail/5559501465', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log('Page Title:', title);

    // Extract basic details
    const bizData = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const getVal = (label) => {
        const ths = Array.from(document.querySelectorAll('th, dt, .label, td'));
        for (let el of ths) {
          if (el.innerText.trim() === label) {
            const next = el.nextElementSibling;
            if (next) return next.innerText.trim();
          }
        }
        return '';
      };
      return {
        companyName: getVal('상호') || document.querySelector('h1, h2, h3, .company-name')?.innerText?.trim(),
        bizNo: getVal('사업자번호') || getVal('사업자등록번호'),
        ceoName: getVal('대표자') || getVal('대표자명') || getVal('대표자이름'),
        address: getVal('주소') || getVal('소재지'),
        industry: getVal('업종') || getVal('주업종'),
        tel: getVal('전화번호') || getVal('연락처'),
        openDate: getVal('개업일') || getVal('개업연월일'),
        hasContent: pageText.includes('칠칠수산') || pageText.includes('555-95-01465')
      };
    });

    console.log('MarketBz Extracted Result:', bizData);

    // Also test search bar by business number or company name if direct url doesn't match
    if (!bizData.hasContent) {
      console.log('Direct URL did not find it directly, testing search on /index...');
      await page.goto('https://marketbz.com/index', { waitUntil: 'networkidle' });
      // fill search
      await page.fill('#topSearchKeyword', '칠칠수산');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      const searchResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.table tbody tr, .search-item, .company-list tr')).map(r => r.innerText.slice(0, 100));
      });
      console.log('Search Results count:', searchResults.length);
      console.log('Search Sample:', searchResults.slice(0, 5));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testMarketBzWithOnnuriBiz();
