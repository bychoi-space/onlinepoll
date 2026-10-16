/**
 * AutoSurvey AI - 쿼터별 동적 페르소나 및 가변 응답 생성기
 * 사업자의 실존 팩트(업종, 개업일, 상호 등)와 캠페인 가이드라인(가중치 등)을 결합하여
 * 모든 쿼터마다 고유하고 현실적인 소상공인 응답 데이터셋을 실시간 생성합니다.
 */

// 안정적인 의사 난수 생성기 (0 ~ 1 사이 양수 반환)
function createSeededRandom(seed) {
  let s = Math.abs(Math.sin(seed)) * 10000;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return Math.abs(s) / 233280;
  };
}

/**
 * 사업자 업종/취급품목 텍스트 기반 Kstat 점포 분류 매핑
 * @param {string} handledItems 취급품목 텍스트
 * @param {string} industry 업종 텍스트
 * @returns {Object} { selector: string, categoryName: string, subType: string }
 */
export function categorizeIndustry(handledItems = '', industry = '') {
  const text = `${handledItems} ${industry}`.toLowerCase();

  if (/수산|생선|활어|해산물|조개|건어물/.test(text)) {
    return { selector: '#Q1_7_3', categoryName: '수산물/식료품', subType: '소매', defaultMargin: 0.22 };
  }
  if (/농산|채소|야채|과일|청과|곡물|쌀|잡곡/.test(text)) {
    return { selector: '#Q1_7_1', categoryName: '농산물', subType: '소매', defaultMargin: 0.20 };
  }
  if (/축산|정육|고기|식육|한우|돈육|삼겹/.test(text)) {
    return { selector: '#Q1_7_2', categoryName: '축산물', subType: '소매', defaultMargin: 0.18 };
  }
  if (/가공|반찬|떡|두부|김치|식료품|제과|베이커리/.test(text)) {
    return { selector: '#Q1_7_4', categoryName: '가공식품', subType: '소매', defaultMargin: 0.25 };
  }
  if (/음식|식당|분식|주점|카페|치킨|중식|한식|일식/.test(text)) {
    return { selector: '#Q1_7_6', categoryName: '음식점업', subType: '서비스', defaultMargin: 0.28 };
  }
  if (/미용|이용|헤어|뷰티|네일|피부|세탁|수선/.test(text)) {
    return { selector: '#Q1_7_7', categoryName: '개인서비스(미용/세탁 등)', subType: '서비스', defaultMargin: 0.35 };
  }
  if (/의류|신발|패션|잡화|가방|모자|이불|침구|한복/.test(text)) {
    return { selector: '#Q1_7_5', categoryName: '의류/신발/잡화', subType: '소매', defaultMargin: 0.30 };
  }

  // 기본 기타 소매
  return { selector: '#Q1_7_5', categoryName: '기타 소매/공산품', subType: '소매', defaultMargin: 0.24 };
}

/**
 * 쿼터별 동적 페르소나 및 가변 응답 데이터셋 생성
 * @param {Object} bizData 사업자 실존 데이터
 * @param {number} quotaIndex 쿼터 순번 (1, 2, 3...)
 * @param {Object} guidelineConfig 캠페인 방향성 및 가중치 설정
 * @returns {Object} 15개 페이지별 맞춤 주입 파라미터 셋
 */
export function generateQuotaPersona(bizData = {}, quotaIndex = 1, guidelineConfig = {}) {
  // 고유 시드 계산 (사업자번호 숫자 합 + 인덱스)
  const bizDigits = (bizData.bizNumber || '1234567890').replace(/\D/g, '');
  const seedNum = bizDigits.split('').reduce((acc, d) => acc + parseInt(d, 10), 0) + (quotaIndex * 17);
  const rng = createSeededRandom(seedNum);

  const randBetween = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

  // 1. 업종 분류
  const industryMeta = categorizeIndustry(bizData.handledItems, bizData.industry);

  // 2. 대표자 연령 및 성별 (사용자가 쿼터 테이블에 직접 입력한 값 우선 반영)
  const ceoName = bizData.ceoName || '점포주';
  let genderSelector;
  if (bizData.ceoGender) {
    const g = String(bizData.ceoGender).trim();
    genderSelector = (g === '여' || g.toLowerCase() === 'female' || g === '여자') ? '#A1_2' : '#A1_1';
  } else {
    // 이름 기반 성별 추론 (끝글자가 은/숙/미/희/자/순/영 등 여성 선호, 그 외 남성 선호)
    const isFemaleName = /[은숙미희자순영경혜진선애]/.test(ceoName.slice(-1));
    genderSelector = (quotaIndex % 2 === 0 ? !isFemaleName : isFemaleName) ? '#A1_2' : '#A1_1'; // A1_1: 남, A1_2: 여
  }

  let age;
  if (bizData.ceoAge && !isNaN(parseInt(bizData.ceoAge, 10))) {
    age = String(parseInt(bizData.ceoAge, 10));
  } else {
    age = String(randBetween(42, 63)); // 40대~60대
  }

  // 3. 매장 면적 및 종업원수 (P2)
  const areaPyeong = randBetween(7, 24); // 7평 ~ 24평
  const areaSquareMeter = Math.round(areaPyeong * 3.3058);
  const employeeFamily = randBetween(0, 1);
  // 상시 유급 종업원 설정 (약 35% 확률로 1~2명, 65%는 0명)
  const hasEmployees = rng() > 0.65;
  const employeeRegular = hasEmployees ? randBetween(1, 2) : 0;

  // 4. 매출액 및 영업이익 (P3, P4)
  const dailySales = randBetween(35, 120); // 일매출 35만 ~ 120만
  const annualSales = Math.round((dailySales * randBetween(280, 310)) / 100); // 연매출 (단위: 백만 원, 약 1억~3.5억)
  
  // 분기별 비중 (합계 100%)
  const q1 = randBetween(22, 28);
  const q2 = randBetween(23, 27);
  const q3 = randBetween(22, 28);
  const q4 = 100 - (q1 + q2 + q3);

  // [규칙 4 수정] 영업이익률 및 영업이익 계산 (금액과 매출대비 %의 100% 수학적 일치 보장)
  const defaultMarginPct = Math.round(industryMeta.defaultMargin * 100);
  const profitMarginRateNum = Math.max(12, Math.min(40, defaultMarginPct + randBetween(-4, 4)));
  const annualProfit = Math.max(10, Math.round((annualSales * profitMarginRateNum) / 100)); // 연간 영업이익 (백만 원)
  // 실제 기재될 연매출 대비 연영업이익의 정확한 정수 마진율 (%)
  const exactMarginRate = String(Math.round((annualProfit / annualSales) * 100));
  const monthlyProfit = Math.round(annualProfit / 12);

  // 일평균 고객 수 및 영업일수
  const dailyCustomers = randBetween(25, 75);
  const monthlyOpenDays = randBetween(24, 28);

  // 마스터 블루프린트 기준점 설정 결합
  const mb = guidelineConfig.masterBaseline || {};

  // 5. 결제수단 비중 (P5 - 합계 100% 필수)
  // [규칙 2 & 3] 신용카드 취급 필수, 비중은 60~70% 랜덤, 온누리 10~20%, 현금 나머지 (합계 100%)
  const cardBase = mb.creditCardRatio !== undefined ? parseInt(mb.creditCardRatio, 10) : 65;
  const payCard = Math.max(60, Math.min(70, cardBase + randBetween(-2, 2)));
  const remainingPay = 100 - payCard;
  const onnuriBase = mb.onnuriRatio !== undefined ? parseInt(mb.onnuriRatio, 10) : 15;
  const payOnnuri = Math.max(10, Math.min(Math.min(20, remainingPay - 5), onnuriBase + randBetween(-2, 2)));
  const payCash = remainingPay - payOnnuri;

  // 6. 영업비용 구성비 (P6 B4 - 합계 100% 필수)
  // [규칙 4] '기타(세금 등)' 은 무조건 '세금' 10% 고정
  // [규칙 5] 종업원이 없다고 설정한 경우 인건비 0원, 종업원이 있는 경우 인건비 정상 기재
  const costEtc = mb.costTaxRatio !== undefined ? parseInt(mb.costTaxRatio, 10) : 10;
  const costEtcText = '세금';
  const remainingCost = 100 - costEtc; // 90%
  let costLabor = 0;
  let costRent = randBetween(15, 25);
  let costRaw = remainingCost - costRent;

  if (hasEmployees) {
    const laborBase = mb.costLaborRatioWithEmp !== undefined ? parseInt(mb.costLaborRatioWithEmp, 10) : 25;
    costLabor = Math.max(15, Math.min(35, laborBase + randBetween(-3, 3)));
    costRent = randBetween(15, 25);
    costRaw = remainingCost - (costLabor + costRent);
  }

  // 7. 온누리상품권 현황 (P7)
  const rawOpenDate = bizData.openDate || bizData.openYear || '2020';
  const rawYear = parseInt(String(rawOpenDate).split(/[-.]/)[0], 10) || 2020;
  // Kstat 유효성 상한선: A5 영업시작년도는 최대 2025 이하 필수!
  const openYearNum = Math.min(2025, rawYear);
  // Kstat 유효성 검사: 온누리상품권 가맹 시작 년도는 A5(개업연도)보다 이전일 수 없음!
  let onnuriJoinYear;
  if (openYearNum >= 2025) {
    onnuriJoinYear = 2025; // 2025년 개업 점포 및 2026 점포는 2025로 일치화
  } else {
    // 개업연도 이상, 2024 이하
    onnuriJoinYear = Math.max(openYearNum, Math.min(2024, openYearNum + randBetween(0, 1)));
  }
  const onnuriSalesRatio = String(payOnnuri);
  // [규칙 6] B5-3 온누리상품권 월평균 이용 고객 수: 2~10명 사이 랜덤
  const custMin = (mb.onnuriCustomerRange && mb.onnuriCustomerRange[0]) || 2;
  const custMax = (mb.onnuriCustomerRange && mb.onnuriCustomerRange[1]) || 10;
  const onnuriMonthlyCustomers = String(randBetween(custMin, custMax));

  // 가중치 슬라이더(긍정/중립/부정)에 따른 온누리 만족도 선택자 (P7 - B5AA)
  // B5AA_1: 매우불만, B5AA_2: 약간불만, B5AA_3: 보통, B5AA_4: 약간만족, B5AA_5: 매우만족
  const posRatio = guidelineConfig.positiveRatio ?? 70;
  const neuRatio = guidelineConfig.neutralRatio ?? 20;
  const roll = rng() * 100;
  let onnuriSatisfactionSelector = '#B5AA_4'; // 기본 만족
  if (roll < posRatio) {
    onnuriSatisfactionSelector = rng() > 0.4 ? '#B5AA_4' : '#B5AA_5'; // 만족 or 매우만족
  } else if (roll < posRatio + neuRatio) {
    onnuriSatisfactionSelector = '#B5AA_3'; // 보통
  } else {
    onnuriSatisfactionSelector = '#B5AA_2'; // 약간불만
  }

  // 8. 사업장 임대차 (P10)
  // 80% 확률로 임차(보증부월세), 20% 확률로 자가 소유
  const isRent = rng() < 0.8;
  const deposit = String(randBetween(1000, 3500)); // 보증금 1000~3500만
  const monthlyRent = String(randBetween(70, 160)); // 월세 70~160만

  // 9. 애로사항 및 활성화 과제 (P13 - Kstat 선택지 유효 범위 엄수)
  // F1 (애로사항): 1~8 (9: 기타-주관식 필수, 10: 없음) -> 1~8 중 서로 다른 3종 선택
  const poolF1 = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = poolF1.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [poolF1[i], poolF1[j]] = [poolF1[j], poolF1[i]];
  }
  const selectedIssuesF1 = poolF1.slice(0, 3); // 1~8 중 3개

  // F3 (활성화 과제): 1~10 (11: 기타-주관식 필수) -> 1~10 중 서로 다른 3종 선택
  const poolF3 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let i = poolF3.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [poolF3[i], poolF3[j]] = [poolF3[j], poolF3[i]];
  }
  const selectedIssuesF3 = poolF3.slice(0, 3); // 1~10 중 3개

  // 10. 부채 및 자금 현황 (P11)
  // [규칙 수정] 소상공인의 약 45%는 사업 부채 보유, 55%는 부채 없음
  const debtRate = mb.debtAdoptionRate !== undefined ? (mb.debtAdoptionRate / 100) : 0.45;
  const hasDebt = rng() < debtRate;
  const debtAvg = mb.debtAvgAmount !== undefined ? parseInt(mb.debtAvgAmount, 10) : 2500;
  const debtAmount = String(Math.max(1000, debtAvg + randBetween(-500, 1000))); // 만 원 단위

  // 11. 향후 운영 계획 (P14)
  // [규칙 수정] 점포 운영 지속 연수 분산 (단순 7년 편중 방지: 3, 5, 8, 10, 15년 등 고른 분산)
  const yearsPool = (Array.isArray(mb.plannedYearsPool) && mb.plannedYearsPool.length > 0)
    ? mb.plannedYearsPool
    : [3, 4, 5, 5, 6, 7, 8, 10, 10, 12, 15, 20];
  const plannedYears = String(yearsPool[randBetween(0, yearsPool.length - 1)]);
  const cashReceiptRatio = String(randBetween(40, 70));

  // 12. 디지털화 및 배달/POS 서비스 (P8 C1)
  // [규칙 신설] 음식점업은 배달서비스(75%) 대부분 실시, 비음식점은 15% 실시
  const isFoodService = /음식점|식당|분식|주점|치킨|피자|카페|한식|중식|일식/.test(
    industryMeta.categoryName + ' ' + (bizData.handledItems || '')
  );
  const foodDeliveryRate = mb.deliveryFoodAdoption !== undefined ? (mb.deliveryFoodAdoption / 100) : 0.75;
  const nonFoodDeliveryRate = mb.deliveryNonFoodAdoption !== undefined ? (mb.deliveryNonFoodAdoption / 100) : 0.15;
  const hasDelivery = isFoodService ? (rng() < foodDeliveryRate) : (rng() < nonFoodDeliveryRate);
  const deliveryRatio = hasDelivery ? String(randBetween(15, 40)) : '0';
  
  // POS기기는 전체의 약 65% 보유 (1대)
  const posRate = mb.posAdoptionRate !== undefined ? (mb.posAdoptionRate / 100) : 0.65;
  const hasPos = rng() < posRate;
  const posCount = hasPos ? '1' : '0';

  // 스마트주문은 약 20% 운영, 80% 미운영
  const hasSmartOrder = rng() < 0.20;
  const smartOrderIntent = rng() < 0.5 ? '1' : '2';

  return {
    quotaIndex,
    industryMeta,
    genderSelector,
    age,
    areaSquareMeter: String(areaSquareMeter),
    areaPyeong: String(areaPyeong),
    employees: {
      family: String(employeeFamily),
      regular: String(employeeRegular),
      temp: '0'
    },
    sales: {
      daily: String(dailySales),
      annual: String(annualSales),
      quarters: { q1: String(q1), q2: String(q2), q3: String(q3), q4: String(q4) },
      profitMarginRate: exactMarginRate,
      annualProfit: String(annualProfit),
      monthlyProfit: String(monthlyProfit),
      dailyCustomers: String(dailyCustomers),
      monthlyOpenDays: String(monthlyOpenDays)
    },
    paymentMethods: {
      card: String(payCard),
      onnuri: String(payOnnuri),
      cash: String(payCash)
    },
    costs: {
      labor: String(costLabor),
      raw: String(costRaw),
      rent: String(costRent),
      etc: String(costEtc),
      etcText: costEtcText
    },
    onnuri: {
      joinYear: String(onnuriJoinYear),
      salesRatio: onnuriSalesRatio,
      satisfactionSelector: onnuriSatisfactionSelector,
      monthlyCustomers: onnuriMonthlyCustomers
    },
    lease: {
      isRent,
      deposit,
      monthlyRent
    },
    issues: {
      f1: selectedIssuesF1,
      f3: selectedIssuesF3
    },
    debt: {
      hasDebt,
      amount: debtAmount
    },
    future: {
      plannedYears,
      cashReceiptRatio
    },
    digital: {
      hasDelivery,
      deliveryRatio,
      hasPos,
      posCount,
      hasSmartOrder,
      smartOrderIntent
    }
  };
}
