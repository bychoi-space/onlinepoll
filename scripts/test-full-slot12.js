import { runKstatSurvey } from '../src/engine/kstat-runner.js';
import fs from 'fs';

const camp = JSON.parse(fs.readFileSync('./data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
const slot12Biz = camp.quotaDatabase.find(q => q.index === 11);

async function testSlot12() {
  console.log('🚀 Running full test of slot #12 (올스타) with updated runner...');
  console.log('Biz data openDate:', slot12Biz.openDate);

  const result = await runKstatSurvey({
    surveyUrl: slot12Biz.slotUrl,
    bizData: slot12Biz,
    quotaIndex: 11,
    guidelineConfig: {},
    policy: {},
    pilotMode: true,
    safetyGuard: true,
    onProgress: (info) => {
      console.log(`[Progress] [${info.step}] ${info.message}`);
    }
  });

  console.log('\n--- Result of Slot #12 ---');
  console.log('Success:', result.success);
  console.log('Error:', result.error || 'none');
  console.log('Captured steps count:', result.capturedSteps?.length);
  if (result.capturedSteps) {
    console.log('Steps:', result.capturedSteps.map(s => s.step).join(' -> '));
  }
}

testSlot12().catch(console.error);
