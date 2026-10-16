if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';
import fs from 'fs';

async function testMetaCeo() {
  const camp = JSON.parse(fs.readFileSync('data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
  const quotas = camp.quotaDatabase;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Logging in...');
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex');
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(3000);

  console.log('=== Checking Meta Description for CEO ===');
  for (let i = 0; i < quotas.length; i++) {
    const q = quotas[i];
    const bno = q.bizNumber.replace(/\D/g, '');
    await page.goto('https://marketbz.com/companyDetail/' + bno);
    await page.waitForTimeout(800);

    const meta = await page.evaluate(() => {
      const desc = document.querySelector('meta[name="description"]')?.content ||
                   document.querySelector('meta[property="og:description"]')?.content || '';
      const ceoM = desc.match(/대표자\s*([가-힣A-Za-z*]{2,10})/) || desc.match(/대표자명\s*([가-힣A-Za-z*]{2,10})/);
      const addrM = desc.match(/소재하며[,\s]+([가-힣0-9\s]+)을/);
      return {
        desc: desc.slice(0, 150),
        ceoInMeta: ceoM ? ceoM[1] : null
      };
    });
    console.log(`[#${i+1}] ${q.companyName} (${bno}) ➔ CEO: ${meta.ceoInMeta}`);
  }

  await browser.close();
}

testMetaCeo().catch(console.error);
