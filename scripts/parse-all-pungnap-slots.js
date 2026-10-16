import { chromium } from 'playwright';

async function parseAllPungnapSlots() {
  console.log('1. Launching browser and logging in...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://survey.kstat.co.kr/kstat_survey/inc/login.php');
  await page.fill('#floatingID', '가온김영옥');
  await page.fill('#floatingPassword', '1234');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#btnLogin')]);

  console.log('2. Navigating to project list...');
  await page.goto('https://survey.kstat.co.kr/kstat_survey/survey/2026070802/list.php?pridSel=2026070802&josa=tapi', { waitUntil: 'networkidle' });

  console.log('3. Searching for "풍납시장"...');
  // Fill the search input with '풍납시장'
  await page.evaluate(() => {
    // Look for market name input
    const inputs = [...document.querySelectorAll('input[type="text"]')];
    // In screenshot: ID 시작, ID 끝, [시장명: 풍납시장], 점포명, 검색 버튼
    // Let's find inputs
    for (const inp of inputs) {
      if (inp.name === 'col03' || inp.placeholder?.includes('시장') || inp.value === '풍납시장') {
        inp.value = '풍납시장';
      }
    }
    // Also select in col03 if select
    const sel = document.querySelector('select[name="col03"]');
    if (sel) {
      for (const opt of sel.options) {
        if (opt.text.includes('풍납시장') || opt.value.includes('풍납시장')) {
          sel.value = opt.value;
          break;
        }
      }
    }
  });

  // Check rows on the current page before search
  const rowsData = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#list_tbl tbody tr')];
    return rows.map((tr, idx) => {
      const tds = [...tr.querySelectorAll('td')];
      const html = tr.innerHTML;

      // Extract sendWeb parameters
      // onclick="sendWeb('76454','517','4','','','1','EZQPGx4L8');"
      const match = html.match(/sendWeb\('([^']+)','([^']+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']+)'\)/);

      return {
        index: idx + 1,
        trId: tr.id,
        no: tds[0]?.textContent?.trim(),
        extraLabel: tds[1]?.querySelector('input')?.value || tds[1]?.textContent?.trim(),
        mkCode: tds[2]?.textContent?.trim(),
        regNum: tds[3]?.textContent?.trim(),
        office: tds[4]?.textContent?.trim(),
        marketName: tds[5]?.textContent?.trim(),
        marketType: tds[6]?.textContent?.trim(),
        storeName: tds[7]?.textContent?.trim(),
        industry: tds[8]?.textContent?.trim(),
        phone: tds[9]?.textContent?.trim(),
        address: tds[10]?.textContent?.trim(),
        statusSelect: tds[13]?.querySelector('select')?.value,
        sendWebArgs: match ? {
          idSel: match[1],
          kid: match[2],
          gid: match[3],
          srt: match[6],
          ran_id: match[7]
        } : null
      };
    }).filter(r => r.marketName?.includes('풍납시장'));
  });

  console.log(`Found ${rowsData.length} slots for 풍납시장 on page 1:`);
  rowsData.forEach(r => {
    const ranId = r.sendWebArgs?.ran_id || 'UNKNOWN';
    const surveyUrl = `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
    console.log(`[#${r.index}] ${r.extraLabel} | ${r.marketName} | 점포: "${r.storeName}" | 전화: "${r.phone}" | ran_id: ${ranId}`);
    console.log(`     URL: ${surveyUrl}`);
  });

  await browser.close();
}

parseAllPungnapSlots().catch(console.error);
