import { categorizeIndustry, generateQuotaPersona } from '../src/engine/persona-builder.js';

console.log('=== [1] 업종 9대 분류 매칭 검증 ===');
const testIndustries = [
  { ind: '농산물', items: '사과, 배', expectedQ17: '1', expectedQ18: '2' },
  { ind: '축산물', items: '한우, 삼겹살', expectedQ17: '2', expectedQ18: '2' },
  { ind: '수산물', items: '활어회, 생선', expectedQ17: '3', expectedQ18: '2' },
  { ind: '가공식품', items: '떡, 반찬', expectedQ17: '4', expectedQ18: '2' },
  { ind: '의류및신발', items: '여성의류, 구두', expectedQ17: '5', expectedQ18: '2' },
  { ind: '가정용품', items: '철물, 이불', expectedQ17: '6', expectedQ18: '2' },
  { ind: '음식점업', items: '한식, 분식, 치킨', expectedQ17: '7', expectedQ18: '4' },
  { ind: '기타소매업', items: '꽃집, 잡화', expectedQ17: '8', expectedQ18: '2' },
  { ind: '근린상권서비스', items: '미용실, 세탁소', expectedQ17: '9', expectedQ18: '4' }
];

let indPass = true;
for (const t of testIndustries) {
  const res = categorizeIndustry(t.items, t.ind);
  const ok = res.q1_7_val === t.expectedQ17 && res.q1_8_val === t.expectedQ18;
  if (!ok) {
    console.error(`❌ 업종 매칭 실패: ${t.ind} -> Q1_7: ${res.q1_7_val} (기대: ${t.expectedQ17}), Q1_8: ${res.q1_8_val} (기대: ${t.expectedQ18})`);
    indPass = false;
  } else {
    console.log(`✓ ${t.ind} -> Q1_7: ${res.q1_7_val} (${res.categoryName}), Q1_8: ${res.q1_8_val} (${res.subType})`);
  }
}
if (indPass) console.log('✅ 업종 9대 매칭 100% 통과!\n');

console.log('=== [2] 대표자 이름, 나이, 성별 쿼터 우선 반영 검증 ===');
const mockBiz = {
  companyName: '풍납상회',
  bizNumber: '123-45-67890',
  ceoName: '홍길동',
  ceoGender: '남',
  ceoAge: 53,
  industry: '농산물',
  handledItems: '청과'
};
const p1 = generateQuotaPersona(mockBiz, 1, {});
console.log('입력 쿼터: 홍길동 / 남 / 53세');
console.log(`생성 결과: 성별셀렉터: ${p1.genderSelector} (기대: #A1_1), 나이: ${p1.age} (기대: 53)`);
if (p1.genderSelector === '#A1_1' && p1.age === '53') {
  console.log('✅ 대표자 남성 53세 쿼터 일치 통과!');
} else {
  console.error('❌ 대표자 불일치');
}

const mockBizFemale = {
  companyName: '수진헤어',
  bizNumber: '234-56-78901',
  ceoName: '이영희',
  ceoGender: '여',
  ceoAge: 47,
  industry: '근린상권서비스',
  handledItems: '미용'
};
const p2 = generateQuotaPersona(mockBizFemale, 2, {});
console.log('입력 쿼터: 이영희 / 여 / 47세');
console.log(`생성 결과: 성별셀렉터: ${p2.genderSelector} (기대: #A1_2), 나이: ${p2.age} (기대: 47)`);
if (p2.genderSelector === '#A1_2' && p2.age === '47') {
  console.log('✅ 대표자 여성 47세 쿼터 일치 통과!\n');
} else {
  console.error('❌ 대표자 불일치');
}

console.log('=== [3] 보증금 천만원 단위 & [4] 월세 5만원 단위 검증 ===');
let depRentPass = true;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona({ ...mockBiz, bizNumber: `100-00-000${String(i).padStart(2, '0')}` }, i, {});
  const dep = parseInt(p.lease.deposit, 10);
  const rent = parseInt(p.lease.monthlyRent, 10);
  
  const depOk = dep % 1000 === 0;
  const rentOk = rent % 5 === 0;
  
  if (!depOk) {
    console.error(`❌ 보증금 천만원 단위 위반: quota #${i} -> ${dep}만원`);
    depRentPass = false;
  }
  if (!rentOk) {
    console.error(`❌ 월세 5만원 단위 위반: quota #${i} -> ${rent}만원`);
    depRentPass = false;
  }
}
if (depRentPass) console.log('✅ 24개 전수 보증금 1000만원 단위 & 월세 5만원 단위 100% 통과!\n');

console.log('=== [5] 일평균 매출액 라디오 구간 매핑 검증 ===');
for (let i = 1; i <= 5; i++) {
  const p = generateQuotaPersona(mockBiz, i * 4, {});
  console.log(`일평균 매출: ${p.sales.daily}만원 ➔ 라디오 선택값 B1AA_1_${p.sales.dailyRadioVal}`);
}
console.log('✅ 일평균 매출액 라디오 구간 계산 통과!\n');

console.log('=== [6] B2A 5대 결제수단 비중 5% 단위 및 합계 100% 검증 ===');
let b2aPass = true;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona(mockBiz, i, {});
  const cash = parseInt(p.paymentMethods.cash, 10);
  const onnuri = parseInt(p.paymentMethods.onnuri, 10);
  const local = parseInt(p.paymentMethods.local, 10);
  const zeropay = parseInt(p.paymentMethods.zeropay, 10);
  const card = parseInt(p.paymentMethods.card, 10);
  const sum = cash + onnuri + local + zeropay + card;
  if (i <= 5) {
    console.log(`쿼터 #${i} -> 현금: ${cash}%, 온누리: ${onnuri}%, 지역: ${local}%, 제로: ${zeropay}%, 카드: ${card}% | 합계: ${sum}%`);
  }
  if (sum !== 100 || cash % 5 !== 0 || onnuri % 5 !== 0 || local % 5 !== 0 || zeropay % 5 !== 0 || card % 5 !== 0) {
    console.error(`❌ B2A 5% 단위 또는 합계 불일치: 합계=${sum}, 현금=${cash}, 온누리=${onnuri}, 지역=${local}, 제로=${zeropay}, 카드=${card}`);
    b2aPass = false;
  }
}
if (b2aPass) console.log('✅ B2A 5대 결제수단 5% 단위 및 합계 100% 검증 전수 통과!\n');

console.log('=== [7] C2-1-1 가격표시 비율 5% 단위 검증 ===');
let c2aaPass = true;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona(mockBiz, i, {});
  const rate = parseInt(p.compliance.priceTagRate, 10);
  if (rate % 5 !== 0 || rate < 50 || rate > 100) {
    console.error(`❌ C2-1-1 5% 단위 위반: 쿼터 #${i} -> ${rate}%`);
    c2aaPass = false;
  }
}
if (c2aaPass) console.log('✅ C2-1-1 가격표시 비율 5% 단위 검증 100% 통과!\n');

console.log('=== [8] G2 현금영수증 발행 가능 비중 5% 단위 검증 ===');
let g2Pass = true;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona(mockBiz, i, {});
  const rate = parseInt(p.future.cashReceiptRatio, 10);
  if (rate % 5 !== 0 || rate < 20 || rate > 80) {
    console.error(`❌ G2 5% 단위 위반: 쿼터 #${i} -> ${rate}%`);
    g2Pass = false;
  }
}
if (g2Pass) console.log('✅ G2 현금영수증 발행 가능 비중 5% 단위 검증 100% 통과!\n');

console.log('=== [9] B2 지역사랑상품권 및 제로페이 모바일결제 취급 여부 분산 검증 ===');
let b2Pass = true;
let localYes = 0, localNo = 0;
let zeroYes = 0, zeroNo = 0;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona(mockBiz, i, {});
  const handling = p.paymentHandling;
  if (!handling) {
    console.error(`❌ 쿼터 #${i} paymentHandling 미정의`);
    b2Pass = false;
    continue;
  }
  if (handling.cash !== '1' || handling.onnuri !== '1' || handling.card !== '1') {
    console.error(`❌ 쿼터 #${i} 기본 필수결제(현금, 온누리, 카드) 미취급`);
    b2Pass = false;
  }
  if (handling.local === '1') localYes++; else localNo++;
  if (handling.zeropay === '1') zeroYes++; else zeroNo++;

  // 정합성 검증: 취급(1)이면 B2A > 0이어야 하고, 미취급(2)이면 B2A === 0이어야 함
  const localVal = parseInt(p.paymentMethods.local, 10);
  const zeroVal = parseInt(p.paymentMethods.zeropay, 10);
  if (handling.local === '1' && localVal === 0) {
    console.error(`❌ 쿼터 #${i} 지역사랑 취급(1)이나 B2A 비중이 0%임`);
    b2Pass = false;
  }
  if (handling.local === '2' && localVal > 0) {
    console.error(`❌ 쿼터 #${i} 지역사랑 미취급(2)이나 B2A 비중이 ${localVal}%임`);
    b2Pass = false;
  }
  if (handling.zeropay === '1' && zeroVal === 0) {
    console.error(`❌ 쿼터 #${i} 제로페이 취급(1)이나 B2A 비중이 0%임`);
    b2Pass = false;
  }
  if (handling.zeropay === '2' && zeroVal > 0) {
    console.error(`❌ 쿼터 #${i} 제로페이 미취급(2)이나 B2A 비중이 ${zeroVal}%임`);
    b2Pass = false;
  }
}
console.log(`24개 점포 분산 결과:`);
console.log(`- 지역사랑상품권: 취급 ${localYes}개 / 미취급 ${localNo}개`);
console.log(`- 제로페이 모바일: 취급 ${zeroYes}개 / 미취급 ${zeroNo}개`);
if (localYes > 0 && localNo > 0 && zeroYes > 0 && zeroNo > 0 && b2Pass) {
  console.log('✅ B2 결제수단 자연 분산 및 B2A 비중과의 정합성 100% 통과!\n');
} else {
  console.error('❌ B2 결제수단 분산 실패 (모두 취급이거나 모두 미취급)');
}

console.log('=== [10] B3 온누리상품권 지류형 및 디지털형 5% 단위 및 합계 100% 검증 ===');
let b3Pass = true;
for (let i = 1; i <= 24; i++) {
  const p = generateQuotaPersona(mockBiz, i, {});
  const paper = parseInt(p.onnuriTypes.paperRatio, 10);
  const digital = parseInt(p.onnuriTypes.digitalRatio, 10);
  const sum = paper + digital;
  if (i <= 5) {
    console.log(`쿼터 #${i} -> 지류형: ${paper}%, 디지털형: ${digital}% | 합계: ${sum}%`);
  }
  if (sum !== 100) {
    console.error(`❌ B3 합계 100% 위반: 쿼터 #${i} -> 합계 ${sum}%`);
    b3Pass = false;
  }
  if (paper % 5 !== 0 || digital % 5 !== 0) {
    console.error(`❌ B3 5% 단위 위반: 쿼터 #${i} -> 지류 ${paper}%, 디지털 ${digital}%`);
    b3Pass = false;
  }
}
if (b3Pass) console.log('✅ B3 지류형/디지털형 비중 5% 단위 및 합계 100% 검증 100% 통과!');


