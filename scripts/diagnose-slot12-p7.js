import { chromium } from 'playwright';
import fs from 'fs';
import { generateQuotaPersona } from '../src/engine/persona-builder.js';

const camp = JSON.parse(fs.readFileSync('./data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
const slot12Biz = camp.quotaDatabase.find(q => q.index === 11);

async function diagnoseSlot12P7() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('dialog', async (d) => {
    console.log('🔔 [ALERT DETECTED]:', d.message());
    await d.accept();
  });

  console.log('Navigating to slot 12:', slot12Biz.slotUrl);
  await page.goto(slot12Biz.slotUrl);
  await page.waitForTimeout(1000);

  // 진행하면서 P7에 도달할 때까지
  // kstat-runner와 동일하게 P1~P6 진행
  // ...
  // 현재 URL 확인
  console.log('Current URL:', page.url());
}

diagnoseSlot12P7().catch(console.error);
