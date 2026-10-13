import { chromium } from 'playwright';

async function testSearchOnnuri() {
  console.log('Testing Onnuri search for "풍납시장"...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Network logs for data fetching
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('.do') || url.includes('json') || res.request().resourceType() === 'xhr' || res.request().resourceType() === 'fetch') {
      try {
        const text = await res.text();
        console.log(`[API RESPONSE] ${res.status()} ${url}`);
        if (text.startsWith('{') || text.startsWith('[')) {
          console.log(`[DATA PREVIEW] ${text.slice(0, 300)}...`);
        }
      } catch (e) {}
    }
  });

  try {
    const url = 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // 1. Select 시/도: 서울
    console.log('Selecting 서울...');
    // Look for options in selectLclgv
    const options = await page.$$eval('#selectLclgv option', opts => opts.map(o => ({ value: o.value, text: o.text })));
    console.log('시도 옵션:', options);

    const seoulOpt = options.find(o => o.text.includes('서울'));
    if (seoulOpt) {
      await page.selectOption('#selectLclgv', seoulOpt.value);
      await page.waitForTimeout(1500);
    }

    // 2. Select 시/군/구: 송파구
    const sggOptions = await page.$$eval('select[name="SEARCH_SGG_CD"] option', opts => opts.map(o => ({ value: o.value, text: o.text })));
    console.log('시군구 옵션:', sggOptions);
    const songpaOpt = sggOptions.find(o => o.text.includes('송파'));
    if (songpaOpt) {
      await page.selectOption('select[name="SEARCH_SGG_CD"]', songpaOpt.value);
      await page.waitForTimeout(1000);
    }

    // 3. 시장명: 풍납시장
    console.log('Entering 시장명: 풍납시장...');
    await page.fill('input[name="SEARCH_MRKT_NM"]', '풍납시장');
    await page.waitForTimeout(500);

    // 4. Click 조회 버튼
    console.log('Clicking 조회 버튼...');
    await page.click('#btnFetch');
    await page.waitForTimeout(3000);

    // 5. Check result table or list
    const resultData = await page.evaluate(() => {
      // Find table or list rows
      const rows = Array.from(document.querySelectorAll('table tbody tr, .list_wrap li, .result_list tr'));
      return rows.map(r => r.innerText.replace(/\t+/g, ' ').replace(/\n+/g, ' | ').trim());
    });

    console.log(`Found ${resultData.length} rows.`);
    console.log('Result sample:', JSON.stringify(resultData.slice(0, 10), null, 2));

    // Also check table headers
    const ths = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
    });
    console.log('Table Headers:', ths);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testSearchOnnuri();
