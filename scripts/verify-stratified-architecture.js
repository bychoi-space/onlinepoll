import { getMarketIndustryStats, getStratifiedMarketMerchants } from '../src/engine/onnuri.js';

async function test() {
  console.log('1. Testing getMarketIndustryStats for 풍납시장...');
  const stats = await getMarketIndustryStats({
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장'
  });
  console.log(`- 시장명: ${stats.marketName}, 원본 건수: ${stats.totalRawCount}`);
  console.log(`- 농산물: ${stats.categories['농산물'].withBiz}개, 수산물: ${stats.categories['수산물'].withBiz}개, 가정용품: ${stats.categories['가정용품'].withBiz}개 (대체: ${stats.householdSubstitutes}개)`);

  console.log('\n2. Testing getStratifiedMarketMerchants with 24 target quotas...');
  const industryQuotas = {
    '농산물': 2,
    '축산물': 2,
    '수산물': 2,
    '가공식품': 3,
    '의류신발': 2,
    '가정용품': 3,
    '음식점업': 4,
    '기타소매': 3,
    '근린상권': 3
  };

  const list = await getStratifiedMarketMerchants({
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장',
    industryQuotas,
    enableSmartFallback: true
  });

  console.log(`- 추출된 총 표본 수: ${list.length}건 (목표: 24건)`);

  // Count by category
  const counts = {};
  list.forEach(m => {
    counts[m.industry] = (counts[m.industry] || 0) + 1;
  });
  console.log('- 업종별 추출 결과:', counts);

  if (list.length === 24) {
    console.log('\n✅ 층화 표본 추출 엔진 (24개 표준) 검증 100% 성공!');
  } else {
    throw new Error(`24개 불일치: ${list.length}`);
  }
}

test().catch(err => {
  console.error('검증 에러:', err);
  process.exit(1);
});
