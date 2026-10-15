import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';

export async function selectPungnap24Merchants() {
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

  // 1. 농산물 (2개)
  const nongs = activeWithBiz.filter(m => m.industry === '농산물' && ['대승청과', '야채과일싸게파는집', '풍납오토바이야채', '더덕상회'].includes(m.companyName)).slice(0, 2);

  // 2. 축산물 (2개)
  const chuks = activeWithBiz.filter(m => m.industry === '축산물' && ['대성축산', '세일축산', '한우마을'].includes(m.companyName)).slice(0, 2);

  // 3. 수산물 (2개)
  const sus = activeWithBiz.filter(m => m.industry === '수산물').slice(0, 2);

  // 4. 가공식품 (3개)
  const gagos = activeWithBiz.filter(m => m.industry === '가공식품' && ['풍납방아간', '백군떡방', '성우건강원', '토성손두부'].includes(m.companyName)).slice(0, 3);

  // 5. 의류신발 (2개)
  const cloths = activeWithBiz.filter(m => m.industry === '의류및신발' && ['올스타', '쎄미하우스', '오뜨레', '나만의공간'].includes(m.companyName)).slice(0, 2);

  // 6. 가정용품 (3개) - 기타소매업 내 실질 침구/철물/잡화
  const households = activeWithBiz.filter(m => m.industry === '기타소매업' && ['서울침구', '덕인철물', '아트이븐프라자'].includes(m.companyName)).slice(0, 3);
  households.forEach(m => {
    m.industry = '가정용품 (기타소매 연계)';
    m.subIndustry = '가정생활용품/침구철물잡화';
  });

  const householdBizSet = new Set(households.map(x => x.bizNumber));

  // 7. 음식점업 (4개)
  const foods = activeWithBiz.filter(m => m.industry === '음식점업' && ['독도쭈꾸미', '보성각', '김밥나라', '장수왕족발', '정읍식당'].includes(m.companyName)).slice(0, 4);

  // 8. 기타소매 (3개)
  const retails = activeWithBiz.filter(m => m.industry === '기타소매업' && !householdBizSet.has(m.bizNumber) && ['백화안경원', '골드트리(황금나무)', '시장온누리약국', '세븐일레븐 풍납본점'].includes(m.companyName)).slice(0, 3);

  // 9. 근린상권 (3개)
  const neighs = activeWithBiz.filter(m => m.industry === '근린상권서비스' && ['행복한경희한의원', '강정수치과의원', '청개구리노래연습장', '상덕의원', '풍납배내과'].includes(m.companyName)).slice(0, 3);

  const selected = [
    ...nongs,
    ...chuks,
    ...sus,
    ...gagos,
    ...cloths,
    ...households,
    ...foods,
    ...retails,
    ...neighs
  ];

  return selected;
}

async function test() {
  const list = await selectPungnap24Merchants();
  console.log(`선정된 가맹점 수: ${list.length}`);
  list.forEach((m, idx) => {
    console.log(`[${idx + 1}] [${m.industry}] ${m.companyName} | ${m.bizNumber} | ${m.address}`);
  });
}

test().catch(console.error);
