import { getMarketIndustryStats } from '../src/engine/onnuri.js';

async function testStats() {
  console.log('Testing getMarketIndustryStats for 풍납시장...');
  const stats = await getMarketIndustryStats({
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장'
  });
  console.log('Market stats result:');
  console.log(JSON.stringify(stats, null, 2));
}

testStats().catch(console.error);
