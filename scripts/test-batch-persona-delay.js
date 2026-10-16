import { generateQuotaPersona } from '../src/engine/persona-builder.js';

const sampleBizList = [
  { companyName: '칠칠수산', bizNumber: '555-95-01465', handledItems: '수산물 (생선, 활어, 해산물 소매)', ceoName: '오지은' },
  { companyName: '예작', bizNumber: '212-15-71233', handledItems: '기타소매업 (두발 미용업)', ceoName: '박미영' },
  { companyName: '더덕상회', bizNumber: '626-22-02194', handledItems: '농산물 (곡물)', ceoName: '이은재' }
];

console.log('=== 배치 자동화 페르소나 및 응답 다양화 검증 ===\n');

sampleBizList.forEach((biz, idx) => {
  const p = generateQuotaPersona(biz, idx + 1, { positiveRatio: 70, neutralRatio: 20, negativeRatio: 10 });
  console.log(`[쿼터 #${idx + 1} - ${biz.companyName}]`);
  console.log(` - 점포 분류: ${p.industryMeta.categoryName} (${p.industryMeta.selector})`);
  console.log(` - 대표자: 성별선택자 ${p.genderSelector}, 연령 ${p.age}세`);
  console.log(` - 매장 규모: ${p.areaSquareMeter}㎡ (${p.areaPyeong}평), 종업원 가족 ${p.employees.family}명 / 상시 ${p.employees.regular}명`);
  console.log(` - 매출 현황: 일매출 ${p.sales.daily}만 원 / 연매출 ${p.sales.annual}백만 원`);
  console.log(` - 결제 비중(합100): 카드 ${p.paymentMethods.card}% + 온누리 ${p.paymentMethods.onnuri}% + 현금 ${p.paymentMethods.cash}%`);
  const paySum = parseInt(p.paymentMethods.card, 10) + parseInt(p.paymentMethods.onnuri, 10) + parseInt(p.paymentMethods.cash, 10);
  console.log(`   ➔ 결제비중 합계 검증: ${paySum}% (${paySum === 100 ? '정상 OK' : '오류'})`);
  console.log(` - 비용 구성(합100): 인건비 ${p.costs.labor}% + 원재료 ${p.costs.raw}% + 임차 ${p.costs.rent}% + 기타(${p.costs.etcText}) ${p.costs.etc}%`);
  const costSum = parseInt(p.costs.labor, 10) + parseInt(p.costs.raw, 10) + parseInt(p.costs.rent, 10) + parseInt(p.costs.etc, 10);
  console.log(`   ➔ 비용구성 합계 검증: ${costSum}% (${costSum === 100 ? '정상 OK' : '오류'})`);
  console.log(` - B5-3 온누리 월평균 고객수: ${p.onnuri.monthlyCustomers}명`);
  console.log(` - 애로사항(F1 3종): [${p.issues.f1.join(', ')}]`);
  console.log(` - 활성화과제(F3 3종): [${p.issues.f3.join(', ')}]`);
  console.log(` - 임대차: ${p.lease.isRent ? `보증부월세 (보증금 ${p.lease.deposit}만 / 월세 ${p.lease.monthlyRent}만)` : '자가 소유'}`);
  console.log('----------------------------------------------------');
});
