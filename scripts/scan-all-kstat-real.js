import { chromium } from 'playwright';
import fs from 'fs';

async function scanAll25Slots() {
  const slots = JSON.parse(fs.readFileSync('scripts/pungnap_25_slots.json', 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('=== REAL KSTAT STATUS OF ALL 25 SLOTS ===');
  const results = [];

  for (const s of slots) {
    try {
      await page.goto(s.surveyUrl, { timeout: 10000 });
      await page.waitForTimeout(1000);
      if (page.url().includes('index.asp')) {
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(1500);
      }
      const finalUrl = page.url();
      let stage = 'UNKNOWN';
      if (finalUrl.includes('Agree.asp')) stage = 'AGREE_REACHED (동의 단계 대기)';
      else if (finalUrl.includes('end.asp') || finalUrl.includes('close.asp') || finalUrl.includes('Finish')) stage = 'COMPLETED (최종 마감)';
      else {
        const m = finalUrl.match(/(P\d+|Q1|Survey)\.asp/i);
        stage = m ? m[1].toUpperCase() : finalUrl;
      }
      results.push({ slot: s.slotIndex, name: s.storeName || '(미배정)', stage, url: finalUrl });
      console.log(`[Slot #${s.slotIndex}] ${s.storeName || '(공란)'} ➔ ${stage}`);
    } catch (err) {
      results.push({ slot: s.slotIndex, name: s.storeName, stage: 'ERROR: ' + err.message });
      console.log(`[Slot #${s.slotIndex}] ERROR: ${err.message}`);
    }
  }

  await browser.close();
  fs.writeFileSync('scripts/real_kstat_slots_state.json', JSON.stringify(results, null, 2));
}

scanAll25Slots().catch(console.error);
