if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';
import fs from 'fs';

async function inspectMarketBzHtml() {
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

  const testBizNos = ['5559501465', '2121571233', '4950702656'];

  for (const bNo of testBizNos) {
    console.log(`\n=================== Inspecting ${bNo} ===================`);
    await page.goto(`https://marketbz.com/companyDetail/${bNo}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      // 1. Check title
      const title = document.querySelector('h1, h2, h3, .company-name')?.innerText?.trim();

      // 2. Check dl, dt, dd or tables or info blocks
      const infoBlocks = [];
      document.querySelectorAll('dl, table, .info-box, .company-info, .card').forEach(el => {
        const text = el.innerText.trim();
        if (text.length > 0 && text.length < 1000) {
          infoBlocks.push(text);
        }
      });

      // 3. Search specifically for 대표, 전화, 개업, 업종
      const allText = document.body.innerText;

      return {
        title,
        infoBlocks: infoBlocks.slice(0, 10),
        snippet: allText.slice(allText.indexOf('기업 핵심정보'), allText.indexOf('기업 핵심정보') + 800)
      };
    });

    console.log('Title:', data.title);
    console.log('Snippet around 핵심정보:\n', data.snippet);
  }

  await browser.close();
}

inspectMarketBzHtml();
