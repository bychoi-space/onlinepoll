/**
 * Test script for runKstatAssocEvaluation against live Kstat merchant association evaluation slot
 */
import { runKstatAssocEvaluation } from '../src/engine/kstat-assoc-eval-runner.js';
import path from 'path';

async function main() {
  const evalUrl = 'https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=rnusGeVnS&type=tapi&prid=2026070801&mnid=900001364&srt=2';
  const assocData = {
    marketName: '고척근린시장',
    regNumber: '113-82-07490',
    marketCode: '900001364',
    evalUrl
  };
  const guidelineConfig = {
    assocPolicy: {
      eval_H1_1_cleanliness: 4,
      eval_H1_2_entrance: 4,
      eval_H1_3_parking: 3,
      eval_H1_4_floor: 4,
      eval_H1_jitter: true,
      eval_H2_1_specialStreet: '1',
      eval_H2_1_customText: '고척근린 먹거리 골목',
      eval_H2_2_specialProduct: '1',
      eval_H2_2_customText: '전통 수제 반찬 및 과일',
      eval_H2_3_brandMark: '2',
      eval_H2_3_customText: '',
      eval_H2_4_brandUsage: '2',
      eval_H2_4_customText: ''
    }
  };

  const reportDir = path.join(process.cwd(), 'reports', 'test_assoc_eval');

  console.log('Starting runKstatAssocEvaluation test...');
  const result = await runKstatAssocEvaluation({
    evalUrl,
    assocData,
    guidelineConfig,
    reportDir,
    onProgress: (info) => console.log(`[PROGRESS] ${info.step}: ${info.message}`)
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  if (result.success) {
    console.log('✅ TEST PASSED: Successfully submitted merchant association evaluation!');
  } else {
    console.error('❌ TEST FAILED:', result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
