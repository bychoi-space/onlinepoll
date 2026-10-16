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
 * 3대 업종 그룹 분류기 (사용자 정의 기준)
 * 1번 그룹: [농산물] [축산물] [수산물] [가공식품]
 * 2번 그룹: [의류신발] [가정용품] [기타소매] [근린상권]
 * 3번 그룹: [음식점업]
 */
export function getIndustryGroupKey(industryText = '', handledItems = '') {
  const ind = String(industryText || '');
  const items = String(handledItems || '');
  const combined = (ind + ' ' + items).trim();

  // 1순위: 농산물, 축산물, 수산물, 가공식품
  if (/^농산|^축산|^수산|^가공식품/.test(ind) || /^농산|^축산|^수산|^가공식품/.test(items) || /농산물|축산물|수산물|가공식품/.test(ind)) {
    return 'group1';
  }

  // 3번 그룹: 음식점업
  if (/^음식점|^식당|^분식|^주점|^카페|^치킨|^피자/.test(ind) || /음식점업|일반 음식점|휴게음식점|피자전문점/.test(combined)) {
    return 'group3';
  }

  // 2번 그룹: 의류신발, 가정용품, 기타소매, 근린상권
  return 'group2';
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

  // 1. 업종 분류 및 3대 업종 그룹 판별
  const industryMeta = categorizeIndustry(bizData.handledItems, bizData.industry);
  const groupKey = getIndustryGroupKey(bizData.industry, bizData.handledItems);

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

  // 마스터 블루프린트 기준점 설정 결합 (업종 그룹별 전용 가이드 우선 적용)
  const baseCfg = guidelineConfig.masterBaseline || {};
  const groupBaseline = baseCfg.groups?.[groupKey] || {};
  const mb = { ...baseCfg, ...groupBaseline };

  // 3. 매장 면적 및 점포 규모 계수 (P2)
  const isAutoEmp = mb.empSalesLink !== 'fixed';
  const scaleVariance = ((quotaIndex * 7 + 13) % 10) / 10; // 0.0 ~ 0.9 점포별 균등 자연 분산
  const sizeFactor = isAutoEmp ? (0.70 + scaleVariance * 0.65) : 1.0; // 0.70 ~ 1.35 스케일링 계수

  const basePyeong = mb.storePyeong !== undefined ? parseInt(mb.storePyeong, 10) : 14;
  const areaPyeong = Math.max(5, Math.min(50, Math.round(basePyeong * (0.8 + sizeFactor * 0.2) + randBetween(-1, 1))));
  const areaSquareMeter = Math.round(areaPyeong * 3.3058);

  // 4. 매출액 및 영업이익 (P3, P4)
  const baseDailySales = mb.dailySales !== undefined ? parseInt(mb.dailySales, 10) : 65;
  const scaledDaily = Math.round(baseDailySales * sizeFactor + randBetween(-4, 4));
  const dailySales = Math.max(20, Math.min(220, scaledDaily));

  const baseAnnualSales = mb.annualSales !== undefined ? parseInt(mb.annualSales, 10) : Math.round((dailySales * 290) / 100);
  const scaledAnnual = Math.round(baseAnnualSales * sizeFactor + randBetween(-6, 6));
  const annualSales = Math.max(40, Math.min(500, scaledAnnual));

  // 5. 종업원수 산출 (P2 A10) - [규칙] 매출 연동 자동 고용 규칙
  // 매출이 높으면 종업원수도 올리고, 매출이 낮으면 0명이거나 낮은 숫자로 자동 스케일링
  let employeeRegular = 0;
  let employeeTemp = 0;
  let employeeFamily = 1;

  if (isAutoEmp) {
    const baseRegular = mb.employeeRegular !== undefined ? parseInt(mb.employeeRegular, 10) : 0;
    const baseTemp = mb.employeeTemp !== undefined ? parseInt(mb.employeeTemp, 10) : 0;
    const baseFamily = mb.employeeFamily !== undefined ? parseInt(mb.employeeFamily, 10) : 1;

    // 1) 저매출 구간 (연매출 < 125백만 원 또는 일매출 < 50만 원)
    // 영세 1인/가족 점포: 상용/임시 종업원 고용 여력 없음 (0명 필수, 인건비 0원)
    if (annualSales < 125 || dailySales < 50) {
      employeeRegular = 0;
      employeeTemp = 0;
      employeeFamily = annualSales < 90 ? 0 : (rng() < 0.6 ? 1 : 0);
    }
    // 2) 중소매출 구간 (연매출 125 ~ 220백만 원 / 일매출 50 ~ 80만 원)
    // 골목상권 표준: 가족 1명 + (외식업이거나 매출 175M 이상 시 1명 가능, 그 외 0명)
    else if (annualSales < 220) {
      employeeFamily = Math.max(0, baseFamily);
      if (groupKey === 'group3' && annualSales >= 160) {
        employeeRegular = 1;
        employeeTemp = (rng() < 0.4 ? 1 : 0);
      } else if (annualSales >= 175 && (baseRegular > 0 || rng() < 0.45)) {
        employeeRegular = 1;
        employeeTemp = 0;
      } else {
        employeeRegular = 0;
        employeeTemp = (annualSales >= 150 && rng() < 0.35) ? 1 : 0;
      }
    }
    // 3) 고매출 구간 (연매출 220 ~ 320백만 원 / 일매출 80 ~ 115만 원)
    // 성업 점포: 1인 운영 불가, 유급 상용 1~2명 필수 고용
    else if (annualSales < 320) {
      employeeFamily = 1;
      employeeRegular = Math.max(1, baseRegular + (annualSales >= 265 ? 1 : 0));
      employeeTemp = (baseTemp > 0 ? baseTemp : (rng() < 0.5 ? 1 : 0));
    }
    // 4) 초고매출 구간 (연매출 320백만 원 이상 / 일매출 115만 원 이상)
    // 대형/기업형 점포: 상용 2~3명, 임시 1~2명
    else {
      employeeFamily = Math.max(1, baseFamily);
      employeeRegular = Math.max(2, baseRegular + randBetween(1, 2));
      employeeTemp = Math.max(1, (baseTemp || 1));
    }
  } else {
    // 수동 고정 모드 (사용자 슬라이더 지정값 엄격 유지)
    const baseFamily = mb.employeeFamily !== undefined ? parseInt(mb.employeeFamily, 10) : 1;
    employeeFamily = Math.max(0, baseFamily + (baseFamily > 0 ? randBetween(-1, 0) : 0));

    const baseRegular = mb.employeeRegular !== undefined ? parseInt(mb.employeeRegular, 10) : 0;
    employeeRegular = Math.max(0, baseRegular);

    const baseTemp = mb.employeeTemp !== undefined ? parseInt(mb.employeeTemp, 10) : 0;
    employeeTemp = Math.max(0, baseTemp);
  }

  const hasEmployees = employeeRegular > 0 || employeeTemp > 0;
  
  // 회전 선택 헬퍼 (인덱스 기반 균등 분산)
  const rotate = (arr, idx) => arr[(idx - 1) % arr.length];

  // 분기별 비중 (합계 100%)
  const qPattern = (mb.quarterPattern === 'rotation' || mb.rotationMode)
    ? rotate(['even', 'h2', 'even', 'season'], quotaIndex)
    : (mb.quarterPattern || 'even');

  let q1, q2, q3, q4;
  if (qPattern === 'h2') {
    q1 = randBetween(18, 22);
    q2 = randBetween(18, 22);
    q3 = randBetween(28, 32);
    q4 = 100 - (q1 + q2 + q3);
  } else if (qPattern === 'h1') {
    q1 = randBetween(28, 32);
    q2 = randBetween(28, 32);
    q3 = randBetween(18, 22);
    q4 = 100 - (q1 + q2 + q3);
  } else if (qPattern === 'season') {
    q1 = randBetween(28, 32);
    q2 = randBetween(18, 22);
    q3 = randBetween(28, 32);
    q4 = 100 - (q1 + q2 + q3);
  } else {
    // even (25/25/25/25 균등 및 자연분산)
    q1 = randBetween(23, 27);
    q2 = randBetween(23, 27);
    q3 = randBetween(23, 27);
    q4 = 100 - (q1 + q2 + q3);
  }

  // [규칙 4 수정] 영업이익률 및 영업이익 계산 (금액과 매출대비 %의 100% 수학적 일치 보장)
  const defaultMarginPct = Math.round(industryMeta.defaultMargin * 100);
  const profitMarginRateNum = Math.max(12, Math.min(40, defaultMarginPct + randBetween(-4, 4)));
  const annualProfit = Math.max(10, Math.round((annualSales * profitMarginRateNum) / 100)); // 연간 영업이익 (백만 원)
  // 실제 기재될 연매출 대비 연영업이익의 정확한 정수 마진율 (%)
  const exactMarginRate = String(Math.round((annualProfit / annualSales) * 100));
  const monthlyProfit = Math.round(annualProfit / 12);

  // 일평균 고객 수 및 영업일수
  const baseCust = mb.dailyCustomers !== undefined ? parseInt(mb.dailyCustomers, 10) : 45;
  const dailyCustomers = Math.max(10, baseCust + randBetween(-5, 5));
  const baseDays = mb.monthlyBusinessDays !== undefined ? parseInt(mb.monthlyBusinessDays, 10) : 26;
  const monthlyOpenDays = Math.max(15, Math.min(31, baseDays + randBetween(-1, 1)));
  const dailyBusinessHours = String(mb.dailyBusinessHours || 11);

  let salesChangeSelector = '#B1BB_3';
  if (mb.salesChange === 'rotation' || mb.rotationMode) {
    salesChangeSelector = rotate(['#B1BB_3', '#B1BB_1', '#B1BB_3', '#B1BB_2'], quotaIndex);
  } else if (mb.salesChange === 'increase') {
    salesChangeSelector = '#B1BB_1';
  } else if (mb.salesChange === 'decrease') {
    salesChangeSelector = '#B1BB_2';
  }

  // 5. 결제수단 비중 (P5 - 합계 100% 필수)
  // [규칙 2 & 3] 신용카드 취급 필수, 비중은 60~70% 랜덤, 온누리 10~20%, 현금 나머지 (합계 100%)
  const cardBase = mb.creditCardRatio !== undefined ? parseInt(mb.creditCardRatio, 10) : 65;
  const payCard = Math.max(60, Math.min(70, cardBase + randBetween(-2, 2)));
  const remainingPay = 100 - payCard;
  const onnuriBase = mb.onnuriRatio !== undefined ? parseInt(mb.onnuriRatio, 10) : 15;
  const payOnnuri = Math.max(10, Math.min(Math.min(20, remainingPay - 5), onnuriBase + randBetween(-2, 2)));
  const payCash = remainingPay - payOnnuri;

  // 6. 영업비용 구성비 (P6 B4 - 합계 100% 필수)
  // [B4_4] 기타(세금 등) 비중 조절 가능 (기본 10%, 로테이션 시 8~15% 자연순환)
  let costEtc = 10;
  if (mb.costTaxRatio !== undefined && mb.costTaxRatio !== 'rotation') {
    costEtc = parseInt(mb.costTaxRatio, 10);
  } else if (mb.rotationMode || mb.costTaxRatio === 'rotation') {
    costEtc = rotate([8, 10, 12, 10, 15, 7], quotaIndex);
  }
  const costEtcText = '세금';
  const remainingCost = 100 - costEtc;
  let costLabor = 0;
  const rentBase = mb.costRentRatio !== undefined ? parseInt(mb.costRentRatio, 10) : 20;
  let costRent = Math.max(10, Math.min(35, rentBase + randBetween(-2, 2)));
  let costRaw = remainingCost - costRent;

  if (hasEmployees) {
    const laborBase = mb.costLaborRatio !== undefined ? parseInt(mb.costLaborRatio, 10) : 25;
    costLabor = Math.max(10, Math.min(45, laborBase + randBetween(-2, 2)));
    costRaw = Math.max(10, remainingCost - (costLabor + costRent));
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
  const onnuriBaseCust = mb.onnuriCustomerAvg !== undefined ? parseInt(mb.onnuriCustomerAvg, 10) : 5;
  const onnuriMonthlyCustomers = String(Math.max(2, Math.min(10, onnuriBaseCust + randBetween(-1, 1))));

  let onnuriPaperSelector = '#B5A_1_1';
  if (mb.onnuriPaperMember === 'rotation' || mb.rotationMode) {
    onnuriPaperSelector = (quotaIndex % 5 === 0) ? '#B5A_1_2' : '#B5A_1_1';
  } else if (mb.onnuriPaperMember === 'no') {
    onnuriPaperSelector = '#B5A_1_2';
  }

  let onnuriMobileSelector = '#B5A_2_2';
  if (mb.onnuriMobileMember === 'rotation' || mb.rotationMode) {
    onnuriMobileSelector = (quotaIndex % 2 === 0) ? '#B5A_2_1' : '#B5A_2_2';
  } else if (mb.onnuriMobileMember === 'yes') {
    onnuriMobileSelector = '#B5A_2_1';
  }

  let onnuriSatisfactionSelector = '#B5AA_4'; // 기본 만족
  if (mb.onnuriSatisfaction === 'rotation' || mb.rotationMode) {
    onnuriSatisfactionSelector = rotate(['#B5AA_4', '#B5AA_3', '#B5AA_5', '#B5AA_4', '#B5AA_2'], quotaIndex);
  } else if (mb.onnuriSatisfaction === 'very_good') {
    onnuriSatisfactionSelector = '#B5AA_5';
  } else if (mb.onnuriSatisfaction === 'normal') {
    onnuriSatisfactionSelector = '#B5AA_3';
  } else if (mb.onnuriSatisfaction === 'bad') {
    onnuriSatisfactionSelector = '#B5AA_2';
  }

  // 8. 사업장 임대차 (P10)
  const rentRate = mb.rentAdoptionRate !== undefined ? (mb.rentAdoptionRate / 100) : 0.8;
  const isRent = rng() < rentRate;
  const baseDep = mb.depositAmount !== undefined ? parseInt(mb.depositAmount, 10) : 2000;
  const deposit = String(Math.max(500, baseDep + randBetween(-150, 150)));
  const baseRentAmt = mb.monthlyRentAmount !== undefined ? parseInt(mb.monthlyRentAmount, 10) : 110;
  const monthlyRent = String(Math.max(40, baseRentAmt + randBetween(-10, 10)));

  let rentTrendSelector = '#D1D_3';
  if (mb.rentTrend === 'rotation' || mb.rotationMode) {
    rentTrendSelector = rotate(['#D1D_3', '#D1D_1', '#D1D_3', '#D1D_2'], quotaIndex);
  } else if (mb.rentTrend === 'increase') {
    rentTrendSelector = '#D1D_1';
  } else if (mb.rentTrend === 'decrease') {
    rentTrendSelector = '#D1D_2';
  }

  // 9. 애로사항 및 활성화 과제 (P13 - Kstat 선택지 유효 범위 엄수)
  let poolF1 = [1, 3, 5, 2, 4, 6, 7, 8];
  if (mb.issuePriority === 'rotation' || mb.rotationMode) {
    const rotType = rotate(['customer', 'cost', 'labor', 'random'], quotaIndex);
    if (rotType === 'customer') poolF1 = [2, 4, 1, 3, 5, 6, 7, 8];
    else if (rotType === 'cost') poolF1 = [1, 3, 5, 2, 4, 6, 7, 8];
    else if (rotType === 'labor') poolF1 = [6, 1, 3, 4, 2, 5, 7, 8];
    else {
      poolF1 = [1, 2, 3, 4, 5, 6, 7, 8];
      for (let i = poolF1.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [poolF1[i], poolF1[j]] = [poolF1[j], poolF1[i]];
      }
    }
  } else if (mb.issuePriority === 'customer') poolF1 = [2, 4, 1, 3, 5, 6, 7, 8];
  else if (mb.issuePriority === 'labor') poolF1 = [6, 1, 3, 4, 2, 5, 7, 8];
  else if (mb.issuePriority === 'random') {
    poolF1 = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = poolF1.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [poolF1[i], poolF1[j]] = [poolF1[j], poolF1[i]];
    }
  }
  const selectedIssuesF1 = poolF1.slice(0, 3);

  let poolF3 = [1, 3, 7, 2, 4, 5, 6, 8, 9, 10];
  if (mb.policyPriority === 'rotation' || mb.rotationMode) {
    const rotPol = rotate(['marketing', 'digital', 'tax', 'random'], quotaIndex);
    if (rotPol === 'digital') poolF3 = [2, 5, 8, 1, 3, 4, 6, 7, 9, 10];
    else if (rotPol === 'marketing') poolF3 = [4, 6, 9, 1, 3, 2, 5, 7, 8, 10];
    else if (rotPol === 'tax') poolF3 = [1, 3, 7, 2, 4, 5, 6, 8, 9, 10];
    else {
      poolF3 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      for (let i = poolF3.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [poolF3[i], poolF3[j]] = [poolF3[j], poolF3[i]];
      }
    }
  } else if (mb.policyPriority === 'digital') poolF3 = [2, 5, 8, 1, 3, 4, 6, 7, 9, 10];
  else if (mb.policyPriority === 'marketing') poolF3 = [4, 6, 9, 1, 3, 2, 5, 7, 8, 10];
  else if (mb.policyPriority === 'random') {
    poolF3 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = poolF3.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [poolF3[i], poolF3[j]] = [poolF3[j], poolF3[i]];
    }
  }
  const selectedIssuesF3 = poolF3.slice(0, 3);

  // 10. 부채 및 자금 현황 (P11)
  const debtRate = mb.debtAdoptionRate !== undefined ? (mb.debtAdoptionRate / 100) : 0.45;
  const hasDebt = rng() < debtRate;
  const debtAvg = mb.debtAvgAmount !== undefined ? parseInt(mb.debtAvgAmount, 10) : 2500;
  const debtAmount = String(Math.max(500, debtAvg + randBetween(-300, 500)));

  // 11. 향후 운영 계획 (P14)
  let plannedYears = String(mb.plannedYears || 8);
  if (mb.plannedYears === 'rotation' || mb.rotationMode) {
    plannedYears = String(rotate([5, 8, 10, 7, 12, 6], quotaIndex));
  }
  const baseReceipt = mb.cashReceiptRatio !== undefined ? parseInt(mb.cashReceiptRatio, 10) : 50;
  const cashReceiptRatio = String(Math.max(10, Math.min(90, baseReceipt + randBetween(-4, 4))));

  let futurePlanSelector = '#G1_1';
  if (mb.futurePlan === 'rotation' || mb.rotationMode) {
    futurePlanSelector = rotate(['#G1_1', '#G1_2', '#G1_1', '#G1_3'], quotaIndex);
  } else if (mb.futurePlan === 'expand') {
    futurePlanSelector = '#G1_2';
  } else if (mb.futurePlan === 'change') {
    futurePlanSelector = '#G1_3';
  } else if (mb.futurePlan === 'close') {
    futurePlanSelector = '#G1_4';
  }

  let successionPlanSelector = '#G1A_2'; // 기본 없음
  if (mb.successionPlan === 'rotation' || mb.rotationMode) {
    successionPlanSelector = rotate(['#G1A_2', '#G1A_1', '#G1A_2', '#G1A_3'], quotaIndex);
  } else if (mb.successionPlan === 'child') {
    successionPlanSelector = '#G1A_1';
  } else if (mb.successionPlan === 'transfer') {
    successionPlanSelector = '#G1A_3';
  }

  // 12. 디지털화 및 배달/POS 서비스 (P8 C1)
  const isFoodService = groupKey === 'group3' || /음식점|식당|분식|주점|치킨|피자|카페|한식|중식|일식/.test(
    industryMeta.categoryName + ' ' + (bizData.handledItems || '')
  );
  const foodDeliveryRate = mb.deliveryFoodAdoption !== undefined ? (mb.deliveryFoodAdoption / 100) : 0.75;
  const nonFoodDeliveryRate = 0.15;
  const hasDelivery = isFoodService ? (rng() < foodDeliveryRate) : (rng() < nonFoodDeliveryRate);
  const baseDelivRatio = mb.deliverySalesRatio !== undefined ? parseInt(mb.deliverySalesRatio, 10) : 25;
  const deliveryRatio = hasDelivery ? String(Math.max(10, Math.min(60, baseDelivRatio + randBetween(-3, 3)))) : '0';
  
  const posRate = mb.posAdoptionRate !== undefined ? (mb.posAdoptionRate / 100) : 0.65;
  const hasPos = rng() < posRate;
  const posCount = hasPos ? String(mb.posCount || 1) : '0';

  const smartOrderRate = mb.smartOrderAdoption !== undefined ? (mb.smartOrderAdoption / 100) : 0.20;
  const hasSmartOrder = rng() < smartOrderRate;
  const smartOrderIntent = rng() < 0.5 ? '1' : '2';

  // 13. 원산지 및 가격표시 (P9)
  let originTargetSelector = '#C2A_2';
  if (mb.originLabelTarget === 'rotation' || mb.rotationMode) {
    originTargetSelector = (quotaIndex % 3 === 0) ? '#C2A_1' : '#C2A_2';
  } else if (mb.originLabelTarget === 'no') {
    originTargetSelector = '#C2A_1';
  }
  const priceTagRate = String(Math.max(50, Math.min(100, (mb.priceTagCompliance || 80) + randBetween(-2, 2))));

  // 14. 화재/배상책임 (P12)
  let fireSelector = '#E2A_1';
  if (mb.fireInsurance === 'rotation' || mb.rotationMode) {
    fireSelector = (quotaIndex % 4 === 0) ? '#E2A_2' : '#E2A_1';
  } else if (mb.fireInsurance === 'no') {
    fireSelector = '#E2A_2';
  }

  let liabilitySelector = '#E2B_1';
  if (mb.liabilityInsurance === 'rotation' || mb.rotationMode) {
    liabilitySelector = (quotaIndex % 3 === 0) ? '#E2B_2' : '#E2B_1';
  } else if (mb.liabilityInsurance === 'no') {
    liabilitySelector = '#E2B_2';
  }

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
      temp: String(employeeTemp)
    },
    sales: {
      daily: String(dailySales),
      annual: String(annualSales),
      quarters: { q1: String(q1), q2: String(q2), q3: String(q3), q4: String(q4) },
      profitMarginRate: exactMarginRate,
      annualProfit: String(annualProfit),
      monthlyProfit: String(monthlyProfit),
      dailyCustomers: String(dailyCustomers),
      monthlyOpenDays: String(monthlyOpenDays),
      dailyBusinessHours,
      salesChangeSelector
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
      monthlyCustomers: onnuriMonthlyCustomers,
      paperSelector: onnuriPaperSelector,
      mobileSelector: onnuriMobileSelector
    },
    lease: {
      isRent,
      deposit,
      monthlyRent,
      trendSelector: rentTrendSelector
    },
    issues: {
      f1: selectedIssuesF1,
      f3: selectedIssuesF3
    },
    debt: {
      hasDebt,
      amount: debtAmount
    },
    compliance: {
      originTargetSelector,
      priceTagRate
    },
    safety: {
      fireSelector,
      liabilitySelector
    },
    future: {
      plannedYears,
      cashReceiptRatio,
      planSelector: futurePlanSelector,
      successionSelector: successionPlanSelector
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
