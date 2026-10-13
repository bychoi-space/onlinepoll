import { chromium } from 'playwright';

async function checkJsonStructure() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async res => {
    if (res.url().includes('selectFrcsData.do')) {
      const data = await res.json();
      console.log('Total list length:', data.list?.length);
      console.log('Sample item 0:', JSON.stringify(data.list[0], null, 2));
      console.log('Sample item 1 (with BRN):', JSON.stringify(data.list[1], null, 2));
    }
  });

  await page.goto('https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Select 서울
  await page.selectOption('#selectLclgv', '01');
  await page.waitForTimeout(1000);

  // Select 송파구
  await page.selectOption('select[name="SEARCH_SGG_CD"]', '01018');
  await page.waitForTimeout(1000);

  // Fill 풍납시장
  await page.fill('input[name="SEARCH_MRKT_NM"]', '풍납시장');
  await page.click('#btnFetch');
  await page.waitForTimeout(3000);

  await browser.close();
}

checkJsonStructure();
