import { fetchMarketBzBusinesses } from '../src/engine/marketbz.js';

async function main() {
  console.log('=== MarketBz 모듈 단위 테스트 시작 ===');
  try {
    const list = await fetchMarketBzBusinesses({ keyword: '소프트웨어', count: 1 });
    console.log('=== 수집 결과 검증 ===');
    console.log('수집 건수:', list.length);
    console.log('첫 번째 사업자 데이터:\n', JSON.stringify(list[0], null, 2));

    if (list.length > 0 && list[0].companyName && list[0].bizNumber) {
      console.log('>>> 단위 테스트 성공: 실제 사업자 데이터가 정상적으로 수집되었습니다! <<<');
      process.exit(0);
    } else {
      console.error('>>> 단위 테스트 실패: 필수 데이터 누락 <<<');
      process.exit(1);
    }
  } catch (err) {
    console.error('단위 테스트 실패 에러:', err);
    process.exit(1);
  }
}

main();
