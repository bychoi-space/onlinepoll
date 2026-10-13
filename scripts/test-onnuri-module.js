import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

async function testModule() {
  console.log('1. Testing getOnnuriRegions...');
  const regions = await getOnnuriRegions();
  console.log(`Retrieved ${regions.length} regions.`);
  const seoul = regions.find(r => r.name === '서울');
  console.log('Seoul region:', seoul);

  console.log('\n2. Testing getOnnuriDistricts for Seoul...');
  const districts = await getOnnuriDistricts(seoul.code);
  console.log(`Retrieved ${districts.length} districts in Seoul.`);
  const songpa = districts.find(d => d.name.includes('송파'));
  console.log('Songpa district:', songpa);

  console.log('\n3. Testing getMarketMerchants for 풍납시장...');
  const merchants = await getMarketMerchants({
    regionCode: seoul.code,
    districtCode: songpa.code,
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    limit: 5
  });
  console.log(`Retrieved ${merchants.length} active merchants in 풍납시장:`);
  console.log(JSON.stringify(merchants, null, 2));
}

testModule();
