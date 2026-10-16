if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch(e){} }
import { chromium } from 'playwright';
import fs from 'fs';

async function testEnrich24() {
  console.log('=== [MarketBz] 풍납시장 24개 점포 실시간 상세 조회 테스트 ===');
  const camp = JSON.parse(fs.readFileSync('data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
  const quotas = camp.quotaDatabase;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('1. 신규 계정으로 MarketBz 로그인 진행 중...');
  await page.goto('https://marketbz.com/loginPage?redirectUrl=%2Findex', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#username', process.env.MARKETBZ_USER);
  await page.fill('#password', process.env.MARKETBZ_PASSWORD);
  await page.click('button.btn-login');
  await page.waitForTimeout(3000);

  const enrichedList = [];

  for (let i = 0; i < quotas.length; i++) {
    const q = quotas[i];
    const rawBizNo = (q.bizNumber || q.businessNo || '').replace(/\D/g, '');
    console.log(`\n[${i + 1}/24] "${q.companyName}" (${rawBizNo}) 조회 중...`);

    if (rawBizNo.length !== 10) {
      console.log('  ⚠️ 유효하지 않은 사업자번호 건너뜀');
      continue;
    }

    try {
      await page.goto(`https://marketbz.com/companyDetail/${rawBizNo}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);

      const parsed = await page.evaluate(() => {
        const text = document.body.innerText;
        const html = document.body.innerHTML;

        // 1. 대표자
        let ceoName = null;
        const ceoEl = document.querySelector('[data-company-fact="representative"] span, [data-company-fact="representative"]');
        if (ceoEl && ceoEl.innerText.trim()) {
          ceoName = ceoEl.innerText.trim();
        } else {
          const ceoMatch = text.match(/대표자\s*[:\n\|]?\s*([가-힣A-Za-z]{2,10})(?=\s*\||\n|$)/) ||
                           html.match(/대표자\s*([가-힣]{2,5})/);
          if (ceoMatch && !['연락처', '대표자', '서비스', '소재지'].includes(ceoMatch[1].trim())) {
            ceoName = ceoMatch[1].trim();
          }
        }

        // 2. 도로명 주소 (주소정보 갱신 버튼 배제)
        let roadAddress = null;
        const roadRow = [...document.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.innerText?.includes('주소(도로명)'));
        if (roadRow) {
          const span = roadRow.querySelector('td span.pdt5') || roadRow.querySelector('td span:first-child');
          if (span && span.innerText.trim()) {
            roadAddress = span.innerText.trim();
          } else {
            const tdText = roadRow.querySelector('td')?.innerText || '';
            const cleaned = tdText.replace(/주소정보\s*갱신/g, '').replace(/위치보기/g, '').trim();
            if (cleaned) roadAddress = cleaned;
          }
        }

        // 백업: 지번주소
        let lotAddress = null;
        const lotRow = [...document.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.innerText?.includes('주소(구주소)'));
        if (lotRow) {
          lotAddress = lotRow.querySelector('td')?.innerText?.replace(/위치보기/g, '').trim();
        }

        // 백업: 소재지
        let basicAddress = null;
        const addrMatch = text.match(/소재지\s*[:\n\|]?\s*([^\n]+)/);
        if (addrMatch) basicAddress = addrMatch[1].trim();

        // 3. 대표전화번호
        let phone = null;
        const phoneRow = [...document.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.innerText?.includes('대표전화번호'));
        if (phoneRow) {
          const p = phoneRow.querySelector('td')?.innerText?.trim();
          if (p && !p.includes('정보없음')) phone = p;
        }

        // 4. 개업연월
        let openDate = null;
        const dateMatch = text.match(/설립일[^\d]*(\d{4}[\.\-\s/]\d{1,2}[\.\-\s/]\d{1,2})/);
        if (dateMatch) openDate = dateMatch[1].trim();

        // 5. 취급품목/업종
        let industry = null;
        const indEl = document.querySelector('[data-company-fact="industry"]');
        if (indEl && indEl.innerText.trim()) {
          industry = indEl.innerText.trim();
        } else {
          const indMatch = text.match(/등록 산업분류\s*[:\n\|]?\s*([^\n\|]+)/);
          if (indMatch) industry = indMatch[1].trim();
        }

        return {
          ceoName,
          roadAddress: roadAddress || lotAddress || basicAddress,
          lotAddress,
          phone,
          openDate,
          industry
        };
      });

      console.log(`  ✓ 대표자: ${parsed.ceoName || '(미확인)'}`);
      console.log(`  ✓ 주소: ${parsed.roadAddress || '(미확인)'}`);
      console.log(`  ✓ 연락처: ${parsed.phone || '(미확인)'}`);
      console.log(`  ✓ 개업일: ${parsed.openDate || '(미확인)'}`);

      enrichedList.push({
        index: i + 1,
        companyName: q.companyName,
        bizNumber: q.bizNumber,
        ...parsed
      });
    } catch (err) {
      console.error(`  ❌ 에러: ${err.message}`);
    }
  }

  await browser.close();
  fs.writeFileSync('scripts/marketbz_24_enriched_test.json', JSON.stringify(enrichedList, null, 2));
  console.log(`\n🎉 총 ${enrichedList.length}개 점포 마켓비즈 상세 데이터 추출 완료!`);
}

testEnrich24().catch(console.error);
