import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

async function main() {
  const regions = await getOnnuriRegions();
  const seoul = regions.find(r => r.name === '서울');
  const districts = await getOnnuriDistricts(seoul.code);
  const songpa = districts.find(d => d.name.includes('송파'));

  // ALL status
  const allMerchants = await getMarketMerchants({
    regionCode: seoul.code,
    districtCode: songpa.code,
    marketName: '풍납시장',
    statusFilter: 'ALL',
    limit: 500
  });

  const household = allMerchants.filter(m => m.industry === '가정용품' || m.companyName.includes('그릇') || m.companyName.includes('철물') || m.companyName.includes('침구') || m.companyName.includes('이불'));
  console.log('가정용품 관련 가맹점 (전체 상태):');
  household.forEach(m => console.log(`${m.companyName} | ${m.bizNumber} | ${m.industry} | ${m.status}`));
}

main().catch(console.error);
