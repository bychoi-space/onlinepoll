import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

async function main() {
  const regions = await getOnnuriRegions();
  const seoul = regions.find(r => r.name === '서울');
  const districts = await getOnnuriDistricts(seoul.code);
  const songpa = districts.find(d => d.name.includes('송파'));

  // Get all active merchants
  const merchants = await getMarketMerchants({
    regionCode: seoul.code,
    districtCode: songpa.code,
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    limit: 500
  });

  console.log(`풍납시장 정상가맹 총 수: ${merchants.length}`);

  // Count by industry
  const indMap = {};
  for (const m of merchants) {
    const ind = m.industry;
    if (!indMap[ind]) indMap[ind] = [];
    indMap[ind].push(m);
  }

  console.log('\n=== 정상가맹 업종별 현황 ===');
  for (const [ind, list] of Object.entries(indMap)) {
    const withBiz = list.filter(x => x.bizNumber);
    console.log(`${ind}: 총 ${list.length}개 (사업자번호 있는 건: ${withBiz.length}개)`);
  }

  // Check required categories
  const targetNeeds = {
    '농산물': 2,
    '축산물': 2,
    '수산물': 2,
    '가공식품': 3,
    '의류및신발': 2, // 의류신발
    '가정용품': 3,
    '음식점업': 4,
    '기타소매업': 3, // 기타소매
    '근린상권서비스': 3 // 근린상권
  };

  console.log('\n=== 요청 조건 매칭 검토 ===');
  for (const [ind, need] of Object.entries(targetNeeds)) {
    const available = (indMap[ind] || []).filter(x => x.bizNumber);
    console.log(`[${ind}] 필요: ${need}개 | 보유(사업자번호 보유 정상가맹): ${available.length}개 -> ${available.length >= need ? '✅ 가능' : '⚠️ 부족'}`);
    if (available.length > 0) {
      console.log('   후보 목록:', available.map(x => `${x.companyName}(${x.bizNumber})`).join(', '));
    }
  }
}

main().catch(console.error);
