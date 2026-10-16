import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';
import fs from 'fs';

async function listCandidates() {
  const regions = await getOnnuriRegions();
  const seoul = regions.find(r => r.name === '서울');
  const districts = await getOnnuriDistricts(seoul.code);
  const songpa = districts.find(d => d.name.includes('송파'));

  const merchants = await getMarketMerchants({
    regionCode: seoul.code,
    districtCode: songpa.code,
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    limit: 500
  });

  const valid = merchants.filter(m => m.bizNumber);

  // 현재 24개 쿼터에 이미 포함된 사업자번호 제외
  const current24 = JSON.parse(fs.readFileSync('data/campaigns.json', 'utf8'))
    .find(c => c.id === 'camp_1792039653802').quotaDatabase;
  const currentBizSet = new Set(current24.map(q => q.bizNumber));

  console.log('Current 24 biz numbers count:', currentBizSet.size);

  const foodCandidates = valid.filter(m => m.industry === '음식점업' && !currentBizSet.has(m.bizNumber));
  const retailCandidates = valid.filter(m => m.industry === '기타소매업' && !currentBizSet.has(m.bizNumber));
  const serviceCandidates = valid.filter(m => m.industry === '근린상권서비스' && !currentBizSet.has(m.bizNumber));

  console.log(`Available food candidates: ${foodCandidates.length}`);
  console.log(`Available retail candidates: ${retailCandidates.length}`);
  console.log(`Available service candidates: ${serviceCandidates.length}`);

  fs.writeFileSync('scripts/pungnap_replacement_pool.json', JSON.stringify({
    food: foodCandidates.slice(0, 10),
    retail: retailCandidates.slice(0, 10),
    service: serviceCandidates.slice(0, 10)
  }, null, 2), 'utf8');

  console.log('Saved top 10 candidates per category to scripts/pungnap_replacement_pool.json');
}

listCandidates().catch(console.error);
