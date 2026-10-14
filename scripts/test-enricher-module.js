import { enrichBusinessData, batchEnrichQuota } from '../src/engine/enricher.js';

async function testEnricher() {
  console.log('=== enricher.js 단위 테스트 시작 ===');
  
  const sampleBusinesses = [
    {
      seq: 1,
      companyName: '칠칠수산',
      bizNumber: '555-95-01465',
      ceoName: null,
      phone: null,
      address: '서울특별시 송파구 풍납동 1층',
      marketName: '풍납시장'
    },
    {
      seq: 2,
      companyName: '더덕상회',
      bizNumber: '626-22-02194',
      ceoName: null,
      phone: null,
      address: '서울특별시 송파구 풍납동 1층 4호',
      marketName: '풍납시장'
    },
    {
      seq: 3,
      companyName: '백군떡방',
      bizNumber: null,
      ceoName: null,
      phone: null,
      address: '서울특별시 송파구 바람드리길 38-1',
      marketName: '풍납시장'
    }
  ];

  const result = await batchEnrichQuota(sampleBusinesses, (p) => {
    console.log(`[진행률] (${p.current}/${p.total}) ${p.companyName} 처리 완료 - 현재 보강 건수: ${p.enrichedCount}`);
  });

  console.log(`\n=== 보강 완료 결과 (총 ${result.enrichedCount}건 성공) ===`);
  for (const b of result.quotaList) {
    console.log(`[${b.seq}] ${b.companyName}`);
    console.log(`  - 대표자: ${b.ceoName || 'null'} ${b.ceoSource ? `(${b.ceoSource})` : ''}`);
    console.log(`  - 연락처: ${b.phone || 'null'} ${b.phoneSource ? `(${b.phoneSource})` : ''}`);
  }
}

testEnricher();
