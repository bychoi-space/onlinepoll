import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

export async function selectPungnap24MerchantsUnique() {
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

  // Filter distinct bizNumber
  const seenBiz = new Set();
  const uniqueMerchants = [];
  for (const m of merchants) {
    if (m.bizNumber && !seenBiz.has(m.bizNumber)) {
      seenBiz.add(m.bizNumber);
      uniqueMerchants.push(m);
    }
  }

  const result = [];
  const usedBiz = new Set();

  function pick(list, count, label, sub) {
    const picked = [];
    for (const m of list) {
      if (!usedBiz.has(m.bizNumber)) {
        usedBiz.add(m.bizNumber);
        if (label) m.industry = label;
        if (sub) m.subIndustry = sub;
        picked.push(m);
        if (picked.length === count) break;
      }
    }
    return picked;
  }

  // 1. 농산물 2개
  const nongs = uniqueMerchants.filter(m => m.industry === '농산물');
  result.push(...pick(nongs, 2));

  // 2. 축산물 2개
  const chuks = uniqueMerchants.filter(m => m.industry === '축산물');
  result.push(...pick(chuks, 2));

  // 3. 수산물 2개
  const sus = uniqueMerchants.filter(m => m.industry === '수산물');
  result.push(...pick(sus, 2));

  // 4. 가공식품 3개
  const gagos = uniqueMerchants.filter(m => m.industry === '가공식품');
  result.push(...pick(gagos, 3));

  // 5. 의류신발 2개
  const cloths = uniqueMerchants.filter(m => m.industry === '의류및신발');
  result.push(...pick(cloths, 2));

  // 6. 가정용품 3개 (기타소매 중 실질 생활용품: 침구, 철물, 프라자)
  const households = uniqueMerchants.filter(m => 
    m.industry === '기타소매업' && (
      m.companyName.includes('침구') || 
      m.companyName.includes('철물') || 
      m.companyName.includes('프라자') ||
      m.companyName.includes('디씨마트')
    )
  );
  result.push(...pick(households, 3, '가정용품 (기타소매 연계)', '가정생활용품/침구철물잡화'));

  // 7. 음식점업 4개
  const foods = uniqueMerchants.filter(m => m.industry === '음식점업');
  result.push(...pick(foods, 4));

  // 8. 기타소매 3개
  const retails = uniqueMerchants.filter(m => m.industry === '기타소매업');
  result.push(...pick(retails, 3));

  // 9. 근린상권 3개
  const neighs = uniqueMerchants.filter(m => m.industry === '근린상권서비스');
  result.push(...pick(neighs, 3));

  return result;
}

async function run() {
  const list = await selectPungnap24MerchantsUnique();
  console.log(`선정된 고유 가맹점 수: ${list.length}`);
  list.forEach((m, idx) => {
    console.log(`[${idx + 1}] [${m.industry}] ${m.companyName} | ${m.bizNumber} | ${m.address}`);
  });
}

run().catch(console.error);
