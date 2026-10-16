if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';
import fs from 'fs';

async function testPool() {
  console.log('=== TEST REPLACEMENT POOL ON MARKETBZ ===');
  const pool = JSON.parse(fs.readFileSync('scripts/pungnap_replacement_pool.json', 'utf8'));

  // 후보 타겟: 음식점 5개, 소매업 4개, 서비스업 4개
  const targets = [
    ...pool.food.slice(0, 5).map(x => ({ ...x, group: 'food' })),
    ...pool.retail.slice(0, 4).map(x => ({ ...x, group: 'retail' })),
    ...pool.service.slice(0, 4).map(x => ({ ...x, group: 'service' }))
  ];

  console.log(`Total test targets: ${targets.length}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('Logging in to MarketBz...');
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(3000);
  console.log('Logged in successfully!');

  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const rawBiz = (t.rawBizNumber || t.bizNumber || '').replace(/\D/g, '');
    const detailUrl = `https://marketbz.com/companyDetail/${rawBiz}`;

    try {
      await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);

      const data = await page.evaluate(() => {
        const text = document.body.innerText;

        // 1. 대표자
        let ceoName = null;
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const m = metaDesc.match(/대표자명\s*[:\s]*([가-힣]{2,4})/);
        if (m) ceoName = m[1].trim();

        // 2. 도로명 주소
        let roadAddress = null;
        const roadRow = [...document.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.innerText?.includes('주소(도로명)'));
        if (roadRow) {
          const span = roadRow.querySelector('td span.pdt5') || roadRow.querySelector('td span:first-child');
          if (span && span.innerText.trim()) {
            roadAddress = span.innerText.trim();
          } else {
            const tdText = roadRow.querySelector('td')?.innerText || '';
            roadAddress = tdText.replace(/주소정보\s*갱신/g, '').replace(/위치보기/g, '').trim();
          }
        }

        // 3. 개업일자
        let openDate = null;
        const dateMatch = text.match(/설립일[^\d]*(\d{4}[\.\-\s/]\d{1,2}[\.\-\s/]\d{1,2})/);
        if (dateMatch) openDate = dateMatch[1].trim().replace(/\s+/g, '');

        // 4. 대표전화
        let phone = null;
        const phoneRow = [...document.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.innerText?.includes('대표전화번호'));
        if (phoneRow) {
          const p = phoneRow.querySelector('td')?.innerText?.trim();
          if (p && !p.includes('정보없음')) phone = p;
        }

        // 5. 업종
        let industry = null;
        const indEl = document.querySelector('[data-company-fact="industry"]');
        if (indEl && indEl.innerText.trim()) industry = indEl.innerText.trim();

        return { ceoName, roadAddress, openDate, phone, industry };
      });

      const year = data.openDate ? parseInt(data.openDate.slice(0, 4), 10) : null;
      console.log(`[${t.group.toUpperCase()}] ${t.companyName} (${t.bizNumber}) -> Open: ${data.openDate} (Yr: ${year}), CEO: ${data.ceoName || '-'}, Tel: ${data.phone || '-'}, Addr: ${data.roadAddress}`);

      results.push({
        group: t.group,
        companyName: t.companyName,
        bizNumber: t.bizNumber,
        openDate: data.openDate,
        openYear: year,
        ceoName: data.ceoName,
        roadAddress: data.roadAddress,
        phone: data.phone,
        industry: data.industry || t.industry
      });
    } catch (err) {
      console.log(`[${t.group.toUpperCase()}] ${t.companyName} failed: ${err.message}`);
    }
  }

  await browser.close();

  fs.writeFileSync('scripts/marketbz_replacement_scan_results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('\nScan completed successfully!');
}

testPool().catch(console.error);
