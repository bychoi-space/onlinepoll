import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

async function main() {
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

  const activeWithBiz = merchants.filter(m => m.bizNumber);

  console.log(`총 정상가맹 (사업자번호 보유): ${activeWithBiz.length}건\n`);

  // Target structure:
  // 1. 농산물: 2개
  // 2. 축산물: 2개
  // 3. 수산물: 2개
  // 4. 가공식품: 3개
  // 5. 의류신발: 2개
  // 6. 가정용품: 3개 (기타소매 중 침구/철물/잡화 실존점포 매핑)
  // 7. 음식점업: 4개
  // 8. 기타소매: 3개
  // 9. 근린상권: 3개

  const nongs = activeWithBiz.filter(m => m.industry === '농산물');
  const chuks = activeWithBiz.filter(m => m.industry === '축산물');
  const sus = activeWithBiz.filter(m => m.industry === '수산물');
  const gagos = activeWithBiz.filter(m => m.industry === '가공식품');
  const cloths = activeWithBiz.filter(m => m.industry === '의류및신발');
  const foods = activeWithBiz.filter(m => m.industry === '음식점업');
  const neighs = activeWithBiz.filter(m => m.industry === '근린상권서비스');
  
  // 가정용품 후보 (기타소매업 중 실질 생활용품)
  const householdCandidates = activeWithBiz.filter(m => 
    m.industry === '기타소매업' && (
      m.companyName.includes('침구') || 
      m.companyName.includes('철물') || 
      m.companyName.includes('프라자') ||
      m.companyName.includes('화장품')
    )
  );

  // 일반 기타소매 (가정용품으로 빠진 것 제외)
  const householdBizNos = new Set(householdCandidates.slice(0, 3).map(x => x.bizNumber));
  const retails = activeWithBiz.filter(m => m.industry === '기타소매업' && !householdBizNos.has(m.bizNumber));

  console.log('1. [농산물] 2건 후보:', nongs.slice(0, 2).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('2. [축산물] 2건 후보:', chuks.slice(0, 2).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('3. [수산물] 2건 후보:', sus.slice(0, 2).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('4. [가공식품] 3건 후보:', gagos.slice(0, 3).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('5. [의류신발] 2건 후보:', cloths.slice(0, 2).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('6. [가정용품(생활실질)] 3건 후보:', householdCandidates.slice(0, 3).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('7. [음식점업] 4건 후보:', foods.slice(0, 4).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('8. [기타소매] 3건 후보:', retails.slice(0, 3).map(x => `${x.companyName} (${x.bizNumber})`));
  console.log('9. [근린상권] 3건 후보:', neighs.slice(0, 3).map(x => `${x.companyName} (${x.bizNumber})`));
}

main().catch(console.error);
