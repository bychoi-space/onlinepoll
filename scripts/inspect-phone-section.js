if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';

async function inspectPhoneSection() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Login
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle' });
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(2000);
  const okBtn = await page.$('#successButton');
  if (okBtn) await okBtn.click();
  await page.waitForTimeout(2000);

  // 2. Go to 5559501465 (칠칠수산)
  await page.goto('https://marketbz.com/companyDetail/5559501465', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 3. Search for "대표전화번호" and "연락처·주소·사업장 정보" in DOM
  const result = await page.evaluate(() => {
    // Check all th/td or labels
    const ths = Array.from(document.querySelectorAll('th, dt, .label, td, div, span'));
    let foundPhone = null;
    let foundPhoneCell = null;
    let foundRoadAddress = null;

    for (let el of ths) {
      const txt = el.innerText.trim();
      if (txt === '대표전화번호' || txt.includes('대표전화번호')) {
        // Find next sibling or parent's td
        const next = el.nextElementSibling;
        foundPhone = next ? next.innerText.trim() : null;
        foundPhoneCell = {
          tag: el.tagName,
          className: el.className,
          nextTag: next ? next.tagName : null,
          nextClass: next ? next.className : null,
          nextText: next ? next.innerText.trim() : null,
          parentHtml: el.parentElement ? el.parentElement.outerHTML.slice(0, 300) : null
        };
      }
      if (txt === '주소(도로명)' || txt.includes('주소(도로명)')) {
        const next = el.nextElementSibling;
        foundRoadAddress = next ? next.innerText.trim() : null;
      }
    }

    // Also check page text around "대표전화번호"
    const bodyText = document.body.innerText;
    const phoneIdx = bodyText.indexOf('대표전화번호');
    const snippet = phoneIdx !== -1 ? bodyText.slice(phoneIdx, phoneIdx + 300) : 'NOT FOUND IN BODY TEXT';

    return {
      foundPhone,
      foundPhoneCell,
      foundRoadAddress,
      snippet
    };
  });

  console.log('Result for 5559501465:');
  console.log(JSON.stringify(result, null, 2));

  // Check another business (e.g. 2121571233 예작)
  console.log('\nChecking 2121571233 (예작)...');
  await page.goto('https://marketbz.com/companyDetail/2121571233', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const result2 = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('th, dt, td, div'));
    for (let el of ths) {
      if (el.innerText.trim() === '대표전화번호') {
        const next = el.nextElementSibling;
        return {
          phone: next ? next.innerText.trim() : null,
          parent: el.parentElement?.innerText?.replace(/\n/g, ' | ')
        };
      }
    }
    return { phone: null, parent: null };
  });
  console.log('Result for 예작:', result2);

  await browser.close();
}

inspectPhoneSection();
