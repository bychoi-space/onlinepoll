if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function checkAllPhones() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(2000);
  const okBtn = await page.$('#successButton');
  if (okBtn) await okBtn.click();
  await page.waitForTimeout(2000);

  const testList = [
    { name: '칠칠수산', bNo: '5559501465' },
    { name: '예작', bNo: '2121571233' },
    { name: '건강지킴이', bNo: '4950702656' },
    { name: '더덕상회', bNo: '6262202194' },
    { name: '물고기', bNo: '1839501483' },
    { name: '착한고기', bNo: '2300120939' },
    { name: '정주상회', bNo: '2199900710' },
    { name: '안심축산물', bNo: '1690500702' },
    { name: '독도쭈꾸미', bNo: '2152199736' }
  ];

  for (const item of testList) {
    await page.goto(`https://marketbz.com/companyDetail/${item.bNo}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const extracted = await page.evaluate(() => {
      // 1. 대표전화번호 탐색
      let phone = null;
      let roadAddress = null;

      const ths = Array.from(document.querySelectorAll('th, td, dt, dd'));
      for (let el of ths) {
        const txt = el.innerText.trim();
        if (txt === '대표전화번호' || txt.startsWith('대표전화번호')) {
          const next = el.nextElementSibling;
          if (next && next.innerText.trim()) {
            phone = next.innerText.trim();
          }
        }
        if (txt === '주소(도로명)' || txt.startsWith('주소(도로명)')) {
          const next = el.nextElementSibling;
          if (next && next.innerText.trim()) {
            roadAddress = next.innerText.trim();
          }
        }
      }

      // 만약 위에서 못찾았을 경우 regex로 text 전체에서 탐색
      if (!phone) {
        const body = document.body.innerText;
        const m = body.match(/대표전화번호\s*[\t\:\n]?\s*([\d-]+)/);
        if (m) phone = m[1].trim();
      }

      return { phone, roadAddress };
    });

    console.log(`[${item.name}] (${item.bNo}) -> 대표전화번호: ${extracted.phone || 'null'} | 도로명주소: ${extracted.roadAddress || 'null'}`);
  }

  await browser.close();
}

checkAllPhones();
