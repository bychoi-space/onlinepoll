import { chromium } from 'playwright';
import fs from 'fs';

async function parseAll25Slots() {
  console.log('1. Launching browser and logging in...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://survey.kstat.co.kr/kstat_survey/inc/login.php');
  await page.fill('#floatingID', '가온김영옥');
  await page.fill('#floatingPassword', '1234');
  await Promise.all([page.waitForNavigation().catch(() => {}), page.click('#btnLogin')]);

  const allSlots = [];

  for (const pageNum of [1, 2]) {
    const listUrl = `https://survey.kstat.co.kr/kstat_survey/survey/2026070802/list.php?curPage=${pageNum}&pridSel=2026070802&josa=tapi`;
    console.log(`2. Navigating to Page ${pageNum}: ${listUrl}`);
    await page.goto(listUrl, { waitUntil: 'networkidle' });

    const pageRows = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#list_tbl tbody tr')];
      return rows.map((tr) => {
        const tds = [...tr.querySelectorAll('td')];
        const html = tr.innerHTML;
        const match = html.match(/sendWeb\('([^']+)','([^']+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']+)'\)/);

        return {
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
          idSel: match ? match[1] : null,
          kid: match ? match[2] : null,
          gid: match ? match[3] : null,
          srt: match ? match[6] : null,
          ran_id: match ? match[7] : null
        };
      }).filter(r => r.marketName?.includes('풍납시장'));
    });

    console.log(`   Page ${pageNum} yielded ${pageRows.length} slots for 풍납시장.`);
    allSlots.push(...pageRows);
  }

  console.log(`\n🎉 Total 풍납시장 slots found: ${allSlots.length}`);
  const formattedSlots = allSlots.map((s, idx) => {
    const surveyUrl = `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${s.ran_id}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
    return {
      slotIndex: idx + 1,
      extraLabel: s.extraLabel,
      idSel: s.idSel,
      kid: s.kid,
      gid: s.gid,
      ran_id: s.ran_id,
      storeName: s.storeName,
      phone: s.phone,
      surveyUrl
    };
  });

  fs.writeFileSync('scripts/pungnap_25_slots.json', JSON.stringify(formattedSlots, null, 2), 'utf-8');
  console.log('Saved to scripts/pungnap_25_slots.json');

  formattedSlots.forEach(s => {
    console.log(`[Slot #${s.slotIndex}] ${s.extraLabel} | ran_id: ${s.ran_id} | 점포: "${s.storeName}" | URL: ${s.surveyUrl}`);
  });

  await browser.close();
}

parseAll25Slots().catch(console.error);
