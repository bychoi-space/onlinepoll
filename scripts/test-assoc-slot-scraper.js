import { scrapeKstatAssocSlots } from '../src/engine/kstat-assoc-slot-scraper.js';

async function test() {
  console.log('=== [상인회 슬롯 스크래퍼 독립 검증] ===');
  const result = await scrapeKstatAssocSlots(null, {
    loginId: '가온박정순',
    loginPw: '1234'
  });
  console.log('[결과 성공 여부]:', result.success);
  console.log('[슬롯 총 개수]:', result.totalCount);
  console.log('[추출된 슬롯 목록]:');
  result.slots.forEach(s => {
    console.log(` #${s.slotIndex} [${s.marketName}] (${s.marketType}) - 회장: ${s.leaderName} (${s.leaderPhone})`);
    console.log(`   -> 설문 URL: ${s.slotUrl}`);
    console.log(`   -> 평가 URL: ${s.evalUrl}`);
  });
}

test();
