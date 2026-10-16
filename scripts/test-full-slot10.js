import { runKstatSurvey } from '../src/engine/kstat-runner.js';

const slot10Biz = {
  index: 9,
  companyName: '백군떡방',
  bizNumber: '230-01-02611',
  ceoName: '백군',
  phone: '02-1234-5678',
  openDate: '2022-06-27',
  zipCode: '05527',
  address: '서울특별시 송파구 바람드리길',
  addressDetail: '1층',
  handledItems: '가공식품 (도시락 및 식사용 조리식품 제조업)',
  slotIndex: 10,
  slotExtra: '(9)추가',
  slotUrl: 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BtQ09ixb5&type=tapi&prid=2026070802&mnid=900001346&srt=1'
};

async function testFull() {
  console.log('🚀 Running full test of slot #10 (백군떡방) with updated runner...');
  const result = await runKstatSurvey({
    surveyUrl: slot10Biz.slotUrl,
    bizData: slot10Biz,
    quotaIndex: 9,
    guidelineConfig: {},
    policy: {},
    pilotMode: true,
    safetyGuard: true,
    onProgress: (info) => {
      console.log(`[Progress] [${info.step}] ${info.message}`);
    }
  });

  console.log('\n--- Result of Slot #10 ---');
  console.log('Success:', result.success);
  console.log('Error:', result.error || 'none');
  console.log('Captured steps count:', result.capturedSteps?.length);
  if (result.capturedSteps) {
    console.log('Steps:', result.capturedSteps.map(s => s.step).join(' -> '));
  }
}

testFull().catch(console.error);
