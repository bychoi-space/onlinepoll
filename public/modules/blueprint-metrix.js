import { escapeHtml } from './blueprint-utils.js';

export const DEFAULT_METRIX_INDUSTRY_POLICIES = {
  ind_1: {
    key: 'ind_1',
    code: '1',
    name: '1.제조업',
    shortName: '제조업',
    enabled: true,
    operating_openHour: '08',
    operating_closeHour: '18',
    operating_closedDays: '2',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'panel_or_pos',
    sales_trend2025: 'maintain',
    cost_materialRatio: 60,
    cost_laborRatio: 18,
    cost_rentRatio: 10,
    cost_taxRatio: 5,
    cost_feeAdRatio: 3,
    cost_otherRatio: 4,
    payment_cashRatio: 5,
    payment_cardRatio: 25,
    payment_localCurrencyRatio: 0,
    payment_mobileRatio: 0,
    payment_voucherRatio: 0,
    payment_transferRatio: 70,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 380,
    hardship_rank1: '3',
    hardship_rank2: '4',
    desired_support_rank1: '1',
    desired_support_rank2: '6',
    open_ended_comment: '원자재 가격 및 산업용 전기·가스요금 인상으로 제조 원가 부담이 큽니다. 소공인 특례보증 자금 지원과 노후 제조설비 교체 지원 확대가 필요합니다.'
  },
  ind_2: {
    key: 'ind_2',
    code: '2',
    name: '2.건설업',
    shortName: '건설업',
    enabled: true,
    operating_openHour: '08',
    operating_closeHour: '18',
    operating_closedDays: '2',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'none',
    sales_trend2025: 'decrease',
    cost_materialRatio: 55,
    cost_laborRatio: 25,
    cost_rentRatio: 8,
    cost_taxRatio: 5,
    cost_feeAdRatio: 3,
    cost_otherRatio: 4,
    payment_cashRatio: 10,
    payment_cardRatio: 20,
    payment_localCurrencyRatio: 0,
    payment_mobileRatio: 0,
    payment_voucherRatio: 0,
    payment_transferRatio: 70,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 350,
    hardship_rank1: '7',
    hardship_rank2: '3',
    desired_support_rank1: '1',
    desired_support_rank2: '7',
    open_ended_comment: '건설·인테리어 경기 둔화와 자재비 및 현장 인건비 상승으로 수주와 채산성이 악화되었습니다. 저금리 운영자금 지원이 절실합니다.'
  },
  ind_3: {
    key: 'ind_3',
    code: '3',
    name: '3.도매 및 소매업',
    shortName: '도소매업',
    enabled: true,
    operating_openHour: '09',
    operating_closeHour: '20',
    operating_closedDays: '1',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: 'panel_or_no',
    digital_smartTech: 'panel_or_pos',
    sales_trend2025: 'maintain',
    cost_materialRatio: 65,
    cost_laborRatio: 10,
    cost_rentRatio: 13,
    cost_taxRatio: 5,
    cost_feeAdRatio: 4,
    cost_otherRatio: 3,
    payment_cashRatio: 10,
    payment_cardRatio: 65,
    payment_localCurrencyRatio: 10,
    payment_mobileRatio: 5,
    payment_voucherRatio: 0,
    payment_transferRatio: 10,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 320,
    hardship_rank1: '7',
    hardship_rank2: '3',
    desired_support_rank1: '1',
    desired_support_rank2: '5',
    open_ended_comment: '온라인 대형 플랫폼과의 경쟁 및 소비 위축으로 오프라인 매장 매출 유지가 어렵습니다. 경기지역화폐 인센티브 확대와 운전자금 지원이 필요합니다.'
  },
  ind_5: {
    key: 'ind_5',
    code: '5',
    name: '5.음식 및 주점업',
    shortName: '음식·주점업',
    enabled: true,
    operating_openHour: '10',
    operating_closeHour: '22',
    operating_closedDays: '1',
    operating_closedDayOfWeek: '1',
    digital_onlineSales: '1',
    digital_smartTech: 'active',
    sales_trend2025: 'decrease',
    cost_materialRatio: 45,
    cost_laborRatio: 20,
    cost_rentRatio: 18,
    cost_taxRatio: 7,
    cost_feeAdRatio: 6,
    cost_otherRatio: 4,
    payment_cashRatio: 5,
    payment_cardRatio: 75,
    payment_localCurrencyRatio: 10,
    payment_mobileRatio: 10,
    payment_voucherRatio: 0,
    payment_transferRatio: 0,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 290,
    hardship_rank1: '3',
    hardship_rank2: '5',
    desired_support_rank1: '1',
    desired_support_rank2: '3',
    open_ended_comment: '식자재 물가 급등과 배달앱 수수료·공공요금 부담이 매우 큽니다. 배달수수료 완화 지원 및 저금리 대환대출 확대가 필요합니다.'
  },
  ind_6: {
    key: 'ind_6',
    code: '6',
    name: '6.전문, 과학 및 기술 서비스업',
    shortName: '전문·기술서비스',
    enabled: true,
    operating_openHour: '09',
    operating_closeHour: '19',
    operating_closedDays: '2',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'panel_or_pos',
    sales_trend2025: 'maintain',
    cost_materialRatio: 25,
    cost_laborRatio: 30,
    cost_rentRatio: 25,
    cost_taxRatio: 8,
    cost_feeAdRatio: 7,
    cost_otherRatio: 5,
    payment_cashRatio: 5,
    payment_cardRatio: 45,
    payment_localCurrencyRatio: 5,
    payment_mobileRatio: 5,
    payment_voucherRatio: 0,
    payment_transferRatio: 40,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 340,
    hardship_rank1: '7',
    hardship_rank2: '5',
    desired_support_rank1: '1',
    desired_support_rank2: '4',
    open_ended_comment: '경기 침체로 인한 거래처 발주 감소와 사무실 임차료 부담이 큽니다. 소규모 전문서비스 사업체 대상 경영안정자금 및 마케팅 지원을 희망합니다.'
  },
  ind_7: {
    key: 'ind_7',
    code: '7',
    name: '7.교육 서비스업',
    shortName: '교육서비스업',
    enabled: true,
    operating_openHour: '11',
    operating_closeHour: '21',
    operating_closedDays: '1',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'panel_or_pos',
    sales_trend2025: 'maintain',
    cost_materialRatio: 20,
    cost_laborRatio: 30,
    cost_rentRatio: 30,
    cost_taxRatio: 8,
    cost_feeAdRatio: 7,
    cost_otherRatio: 5,
    payment_cashRatio: 5,
    payment_cardRatio: 75,
    payment_localCurrencyRatio: 15,
    payment_mobileRatio: 5,
    payment_voucherRatio: 0,
    payment_transferRatio: 0,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 300,
    hardship_rank1: '7',
    hardship_rank2: '5',
    desired_support_rank1: '5',
    desired_support_rank2: '2',
    open_ended_comment: '학령인구 감소와 가계 교육비 지출 축소로 수강생 모집에 어려움이 있습니다. 지역화폐 사용처 확대 및 학원·교습소 시설환경 개선 지원이 필요합니다.'
  },
  ind_8: {
    key: 'ind_8',
    code: '8',
    name: '8.예술, 스포츠 및 여가 관련 서비스업',
    shortName: '예술·스포츠·여가',
    enabled: true,
    operating_openHour: '10',
    operating_closeHour: '22',
    operating_closedDays: '1',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'active',
    sales_trend2025: 'maintain',
    cost_materialRatio: 25,
    cost_laborRatio: 20,
    cost_rentRatio: 32,
    cost_taxRatio: 12,
    cost_feeAdRatio: 6,
    cost_otherRatio: 5,
    payment_cashRatio: 5,
    payment_cardRatio: 75,
    payment_localCurrencyRatio: 10,
    payment_mobileRatio: 10,
    payment_voucherRatio: 0,
    payment_transferRatio: 0,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 300,
    hardship_rank1: '5',
    hardship_rank2: '2',
    desired_support_rank1: '6',
    desired_support_rank2: '2',
    open_ended_comment: '넓은 매장 면적에 따른 상가 임차료와 냉난방 전기요금 부담이 큽니다. 공공요금·임차료 보전 지원과 노후 체육·여가시설 개보수 지원을 건의합니다.'
  },
  ind_9: {
    key: 'ind_9',
    code: '9',
    name: '9.수리 및 개인 서비스업',
    shortName: '수리·개인서비스',
    enabled: true,
    operating_openHour: '10',
    operating_closeHour: '20',
    operating_closedDays: '1',
    operating_closedDayOfWeek: '7',
    digital_onlineSales: '2',
    digital_smartTech: 'panel_or_pos',
    sales_trend2025: 'maintain',
    cost_materialRatio: 35,
    cost_laborRatio: 15,
    cost_rentRatio: 30,
    cost_taxRatio: 8,
    cost_feeAdRatio: 6,
    cost_otherRatio: 6,
    payment_cashRatio: 10,
    payment_cardRatio: 70,
    payment_localCurrencyRatio: 10,
    payment_mobileRatio: 5,
    payment_voucherRatio: 0,
    payment_transferRatio: 5,
    funding_guaranteeRule: 'excel_sync',
    funding_whenGuaranteeX: '1',
    owner_monthlyIncome: 280,
    hardship_rank1: '7',
    hardship_rank2: '5',
    desired_support_rank1: '2',
    desired_support_rank2: '1',
    open_ended_comment: '동종 개인서비스 업소 간 경쟁 심화와 미용·세탁·수리 자재비 및 월세 부담이 큽니다. 영세 1인 사업장 점포 환경개선 및 특례보증 지원을 희망합니다.'
  }
};

export function syncMetrixInputsToState(metrixPolicyState) {
  // 0. 실행 규칙 및 패널 계승 & 폐업 제외 · 컨택 휴대폰 변경 · 업종별 가이드
  const cbSafetyStop = document.getElementById('cb-metrix-safety-stop');
  if (cbSafetyStop) metrixPolicyState.safetyStopAtReview = cbSafetyStop.checked;

  const cbPreserve = document.getElementById('cb-metrix-preserve-inputs');
  if (cbPreserve) metrixPolicyState.preserveExistingInputs = cbPreserve.checked;

  const cbSkipCompleted = document.getElementById('cb-metrix-skip-completed');
  if (cbSkipCompleted) metrixPolicyState.skipCompletedSlots = cbSkipCompleted.checked;

  const cbInheritRawMeta = document.getElementById('cb-metrix-inherit-rawmeta');
  if (cbInheritRawMeta) metrixPolicyState.inheritPanelRawMeta = cbInheritRawMeta.checked;

  const cbExcludeClosed = document.getElementById('cb-metrix-exclude-closed');
  if (cbExcludeClosed) metrixPolicyState.excludeClosedBiz = cbExcludeClosed.checked;

  const cbUpdateContactPhone = document.getElementById('cb-metrix-update-contact-phone');
  if (cbUpdateContactPhone) metrixPolicyState.updatePhoneInContactPopup = cbUpdateContactPhone.checked;

  const cbUseIndGuide = document.getElementById('cb-metrix-use-ind-guide');
  if (cbUseIndGuide) metrixPolicyState.useIndustryGuidelines = cbUseIndGuide.checked;

  // 1. 사업체 일반현황 (A1~A15)
  const cbBindAddr = document.getElementById('cb-metrix-bind-address');
  if (cbBindAddr) metrixPolicyState.general_bindAddressReadonly = cbBindAddr.checked;

  const selFranchise = document.getElementById('sel-metrix-franchise-mode');
  if (selFranchise) metrixPolicyState.general_franchiseMode = selFranchise.value;

  const numAreaPyeong = document.getElementById('num-metrix-area-pyeong');
  if (numAreaPyeong) metrixPolicyState.general_defaultAreaPyeong = Number(numAreaPyeong.value) || 30;

  const selLocationType = document.getElementById('sel-metrix-location-type');
  if (selLocationType) metrixPolicyState.general_locationType = selLocationType.value;

  const selFounderType = document.getElementById('sel-metrix-founder-type');
  if (selFounderType) metrixPolicyState.general_founderType = selFounderType.value;

  const selPrevStatus = document.getElementById('sel-metrix-prev-status');
  if (selPrevStatus) metrixPolicyState.general_prevStatus = selPrevStatus.value;

  // 2. 영업 현황 및 디지털·온라인 전환 (문8 ~ 문9-2)
  const selOpenHour = document.getElementById('sel-metrix-open-hour');
  if (selOpenHour) metrixPolicyState.operating_openHour = selOpenHour.value;

  const selCloseHour = document.getElementById('sel-metrix-close-hour');
  if (selCloseHour) metrixPolicyState.operating_closeHour = selCloseHour.value;

  const selClosedDays = document.getElementById('sel-metrix-closed-days');
  if (selClosedDays) metrixPolicyState.operating_closedDays = selClosedDays.value;

  const selClosedDow = document.getElementById('sel-metrix-closed-dow');
  if (selClosedDow) metrixPolicyState.operating_closedDayOfWeek = selClosedDow.value;

  const selDigitalOnline = document.getElementById('sel-metrix-digital-online');
  if (selDigitalOnline) metrixPolicyState.digital_onlineSales = selDigitalOnline.value;

  const selDigitalSmart = document.getElementById('sel-metrix-digital-smart');
  if (selDigitalSmart) metrixPolicyState.digital_smartTech = selDigitalSmart.value;

  // 3. 경영실적 추세 · 6대 영업비용 · 대표자 소득 (문10 ~ 문13)
  const selSalesTrend = document.getElementById('sel-metrix-sales-trend');
  if (selSalesTrend) metrixPolicyState.sales_trend2025 = selSalesTrend.value;

  const selSalesReason1 = document.getElementById('sel-metrix-sales-reason1');
  if (selSalesReason1) metrixPolicyState.sales_changeReasonRank1 = selSalesReason1.value;

  const selSalesReason2 = document.getElementById('sel-metrix-sales-reason2');
  if (selSalesReason2) metrixPolicyState.sales_changeReasonRank2 = selSalesReason2.value;

  const numOwnerIncome = document.getElementById('num-metrix-owner-income');
  if (numOwnerIncome) metrixPolicyState.owner_monthlyIncome = Number(numOwnerIncome.value) || 320;

  const numCostMat = document.getElementById('num-metrix-cost-mat');
  if (numCostMat) metrixPolicyState.cost_materialRatio = Number(numCostMat.value) || 0;

  const numCostLabor = document.getElementById('num-metrix-cost-labor');
  if (numCostLabor) metrixPolicyState.cost_laborRatio = Number(numCostLabor.value) || 0;

  const numCostRent = document.getElementById('num-metrix-cost-rent');
  if (numCostRent) metrixPolicyState.cost_rentRatio = Number(numCostRent.value) || 0;

  const numCostTax = document.getElementById('num-metrix-cost-tax');
  if (numCostTax) metrixPolicyState.cost_taxRatio = Number(numCostTax.value) || 0;

  const numCostFee = document.getElementById('num-metrix-cost-fee');
  if (numCostFee) metrixPolicyState.cost_feeAdRatio = Number(numCostFee.value) || 0;

  const numCostOther = document.getElementById('num-metrix-cost-other');
  if (numCostOther) metrixPolicyState.cost_otherRatio = Number(numCostOther.value) || 0;

  // 4. 6대 결제수단 & 부채·자금조달 구조 (문14 ~ 문15-3)
  const numPayCash = document.getElementById('num-metrix-pay-cash');
  if (numPayCash) metrixPolicyState.payment_cashRatio = Number(numPayCash.value) || 0;

  const numPayCard = document.getElementById('num-metrix-pay-card');
  if (numPayCard) metrixPolicyState.payment_cardRatio = Number(numPayCard.value) || 0;

  const numPayLocal = document.getElementById('num-metrix-pay-local');
  if (numPayLocal) metrixPolicyState.payment_localCurrencyRatio = Number(numPayLocal.value) || 0;

  const numPayMobile = document.getElementById('num-metrix-pay-mobile');
  if (numPayMobile) metrixPolicyState.payment_mobileRatio = Number(numPayMobile.value) || 0;

  const numPayVoucher = document.getElementById('num-metrix-pay-voucher');
  if (numPayVoucher) metrixPolicyState.payment_voucherRatio = Number(numPayVoucher.value) || 0;

  const numPayTransfer = document.getElementById('num-metrix-pay-transfer');
  if (numPayTransfer) metrixPolicyState.payment_transferRatio = Number(numPayTransfer.value) || 0;

  const selDebtHas = document.getElementById('sel-metrix-debt-has');
  if (selDebtHas) metrixPolicyState.debt_hasDebt = selDebtHas.value;

  const numDebtAmount = document.getElementById('num-metrix-debt-amount');
  if (numDebtAmount) metrixPolicyState.debt_totalAmount = Number(numDebtAmount.value) || 0;

  const numDebtBank = document.getElementById('num-metrix-debt-bank');
  if (numDebtBank) metrixPolicyState.debt_bankRatio = Number(numDebtBank.value) || 0;

  const numDebtSecond = document.getElementById('num-metrix-debt-second');
  if (numDebtSecond) metrixPolicyState.debt_secondTierRatio = Number(numDebtSecond.value) || 0;

  const numDebtPolicy = document.getElementById('num-metrix-debt-policy');
  if (numDebtPolicy) metrixPolicyState.debt_policyRatio = Number(numDebtPolicy.value) || 0;

  const numDebtOther = document.getElementById('num-metrix-debt-other');
  if (numDebtOther) metrixPolicyState.debt_otherRatio = Number(numDebtOther.value) || 0;

  const selDebtRank1 = document.getElementById('sel-metrix-debt-rank1');
  if (selDebtRank1) metrixPolicyState.debt_reasonRank1 = selDebtRank1.value;

  const selDebtRank2 = document.getElementById('sel-metrix-debt-rank2');
  if (selDebtRank2) metrixPolicyState.debt_reasonRank2 = selDebtRank2.value;

  const selFundingGuarRule = document.getElementById('sel-metrix-funding-guarantee-rule');
  if (selFundingGuarRule) metrixPolicyState.funding_guaranteeRule = selFundingGuarRule.value;

  const selFundingWhenX = document.getElementById('sel-metrix-funding-when-x');
  if (selFundingWhenX) metrixPolicyState.funding_whenGuaranteeX = selFundingWhenX.value;

  // 5. 사업장 임대차 · 계약기간 · 권리금 (문16 ~ 문18)
  const selLeaseType = document.getElementById('sel-metrix-lease-type');
  if (selLeaseType) metrixPolicyState.lease_type = selLeaseType.value;

  const numLeaseDeposit = document.getElementById('num-metrix-lease-deposit');
  if (numLeaseDeposit) metrixPolicyState.lease_deposit = Number(numLeaseDeposit.value) || 0;

  const numLeaseRent = document.getElementById('num-metrix-lease-rent');
  if (numLeaseRent) metrixPolicyState.lease_monthlyRent = Number(numLeaseRent.value) || 0;

  const numLeaseYears = document.getElementById('num-metrix-lease-years');
  if (numLeaseYears) metrixPolicyState.lease_contractYears = Number(numLeaseYears.value) || 5;

  const selGoodwillHas = document.getElementById('sel-metrix-goodwill-has');
  if (selGoodwillHas) metrixPolicyState.goodwill_hasGoodwill = selGoodwillHas.value;

  const numGoodwillAmount = document.getElementById('num-metrix-goodwill-amount');
  if (numGoodwillAmount) metrixPolicyState.goodwill_amount = Number(numGoodwillAmount.value) || 0;

  const selGoodwillExpect = document.getElementById('sel-metrix-goodwill-expect');
  if (selGoodwillExpect) metrixPolicyState.goodwill_recoveryExpect = selGoodwillExpect.value;

  // 6. 창업 준비 · 경영 애로사항 · 상권 경쟁 · 향후 계획 (문19 ~ 문29)
  const selHardship1 = document.getElementById('sel-metrix-hardship-rank1');
  if (selHardship1) metrixPolicyState.hardship_rank1 = selHardship1.value;

  const selHardship2 = document.getElementById('sel-metrix-hardship-rank2');
  if (selHardship2) metrixPolicyState.hardship_rank2 = selHardship2.value;

  const selCompLevel = document.getElementById('sel-metrix-competition-level');
  if (selCompLevel) metrixPolicyState.market_competitionLevel = selCompLevel.value;

  const selFuturePlan = document.getElementById('sel-metrix-future-plan');
  if (selFuturePlan) metrixPolicyState.future_businessPlan = selFuturePlan.value;

  const selFutureReemp = document.getElementById('sel-metrix-future-reemp');
  if (selFutureReemp) metrixPolicyState.future_reemploymentPlan = selFutureReemp.value;

  // 7. 고용 인력 · 주당 근무시간 · 4대보험 · 평균 급여 (문31 ~ 문39)
  const numEmpOwner = document.getElementById('num-metrix-emp-owner');
  if (numEmpOwner) metrixPolicyState.employee_owner = Number(numEmpOwner.value) || 1;

  const numEmpFamily = document.getElementById('num-metrix-emp-family');
  if (numEmpFamily) metrixPolicyState.employee_family = Number(numEmpFamily.value) || 0;

  const numEmpRegular = document.getElementById('num-metrix-emp-regular');
  if (numEmpRegular) metrixPolicyState.employee_regular = Number(numEmpRegular.value) || 0;

  const numEmpTemp = document.getElementById('num-metrix-emp-temp');
  if (numEmpTemp) metrixPolicyState.employee_temp = Number(numEmpTemp.value) || 0;

  const numOwnerHours = document.getElementById('num-metrix-owner-hours');
  if (numOwnerHours) metrixPolicyState.labor_ownerWeeklyHours = Number(numOwnerHours.value) || 45;

  const numStaffHours = document.getElementById('num-metrix-staff-hours');
  if (numStaffHours) metrixPolicyState.labor_staffWeeklyHours = Number(numStaffHours.value) || 40;

  const selInsMode = document.getElementById('sel-metrix-insurance-mode');
  if (selInsMode) metrixPolicyState.labor_insuranceMode = selInsMode.value;

  const numAvgWage = document.getElementById('num-metrix-avg-wage');
  if (numAvgWage) metrixPolicyState.labor_avgMonthlyWage = Number(numAvgWage.value) || 300;

  const selHiringDiff = document.getElementById('sel-metrix-hiring-diff');
  if (selHiringDiff) metrixPolicyState.labor_hiringDifficulty = selHiringDiff.value;

  // 8. 경기도 지원정책 수혜경험 · 만족도 · 희망사업 (문50 ~ 문67)
  const selPolicyExp = document.getElementById('sel-metrix-policy-exp');
  if (selPolicyExp) metrixPolicyState.policy_experienceMode = selPolicyExp.value;

  const selSatMode = document.getElementById('sel-metrix-satisfaction-mode');
  if (selSatMode) metrixPolicyState.satisfaction_mode = selSatMode.value;

  const selSupRank1 = document.getElementById('sel-metrix-support-rank1');
  if (selSupRank1) metrixPolicyState.desired_support_rank1 = selSupRank1.value;

  const selSupRank2 = document.getElementById('sel-metrix-support-rank2');
  if (selSupRank2) metrixPolicyState.desired_support_rank2 = selSupRank2.value;

  // 9. 주관식 코멘트 & 증빙 서류
  const txtComment = document.getElementById('txt-metrix-comment');
  if (txtComment) metrixPolicyState.open_ended_comment = txtComment.value;

  const txtSignImg = document.getElementById('txt-metrix-sign-image');
  if (txtSignImg) metrixPolicyState.evidence_sign_image = txtSignImg.value;

  // 10. 서울시 소상공인 패널 5차 신규 문항 (M1~M3 위기요인, N1~N6_1 AI·디지털, O1~O4 탄소중립)
  const selSeoulM1 = document.getElementById('sel-seoul-m1-rank1');
  if (selSeoulM1) metrixPolicyState.seoul_m1_rank1 = selSeoulM1.value;
  const selSeoulM2 = document.getElementById('sel-seoul-m2-rank1');
  if (selSeoulM2) metrixPolicyState.seoul_m2_rank1 = selSeoulM2.value;
  const selSeoulM3 = document.getElementById('sel-seoul-m3-rank1');
  if (selSeoulM3) metrixPolicyState.seoul_m3_rank1 = selSeoulM3.value;
  const selSeoulAi = document.getElementById('sel-seoul-n2-ai-adoption');
  if (selSeoulAi) metrixPolicyState.seoul_n2_aiAdoption = selSeoulAi.value;
  const selSeoulCarbon = document.getElementById('sel-seoul-o1-carbon');
  if (selSeoulCarbon) metrixPolicyState.seoul_o1_carbon = selSeoulCarbon.value;

  // 10-B. 경기도 3차 본조사 문항별 정밀 가이드 제어판 (문10 ~ 문69 · CHECK1 사진 미업로드)
  const readStr = (id, key) => {
    const el = document.getElementById(id);
    if (el) metrixPolicyState[key] = el.value;
  };
  const readNum = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (el) {
      const n = Number(el.value);
      metrixPolicyState[key] = Number.isFinite(n) ? n : fallback;
    }
  };
  readStr('sel-metrix-q10-mode', 'q10_fundMgmtMode');
  readStr('sel-metrix-q12-1-mode', 'q12_1_evalReasonMode');
  readStr('sel-metrix-q16-1-source', 'q16_1_leaseSource');
  readStr('sel-metrix-q17-range-mode', 'q17_goodwillRangeMode');
  readNum('num-metrix-goodwill-min', 'goodwill_min', 1000);
  readNum('num-metrix-goodwill-max', 'goodwill_max', 5000);
  readNum('num-metrix-goodwill-step', 'goodwill_step', 500);
  readStr('sel-metrix-q21-mode', 'q21_femaleDiffMode');
  readStr('sel-metrix-q22-mode', 'q22_hardshipMode');
  readStr('sel-metrix-q23-climate', 'q23_climateImpact');
  readStr('sel-metrix-q24-mode', 'q24_competitivenessMode');
  readStr('sel-metrix-q25-income', 'q25_otherIncome');
  readStr('sel-metrix-q26-rule', 'q26_onlineRule');
  readStr('sel-metrix-q26-1-channel', 'q26_1_foodChannel');
  readStr('sel-metrix-q34-range-mode', 'q34_wageRangeMode');
  readNum('num-metrix-wage-min', 'labor_wageMin', 240);
  readNum('num-metrix-wage-max', 'labor_wageMax', 320);
  readNum('num-metrix-wage-step', 'labor_wageStep', 5);
  readStr('sel-metrix-q35-emp-change', 'q35_empChange');
  readStr('sel-metrix-q43-4-mode', 'q43_4_continueReasonMode');
  readStr('sel-metrix-q44-mode', 'q44_investPlanMode');
  readStr('sel-metrix-q60-rule', 'q60_awarenessRule');
  readStr('sel-metrix-q66-1-mode', 'q66_1_otherOrgRouteMode');
  readStr('sel-metrix-q67-mode', 'q67_desiredSupportMode');
  readStr('sel-metrix-support-rank3', 'desired_support_rank3');
  readStr('sel-metrix-q68-mode', 'q68_policyIssueMode');
  readStr('sel-metrix-issue-rank1', 'policy_issue_rank1');
  readStr('sel-metrix-issue-rank2', 'policy_issue_rank2');
  readStr('sel-metrix-issue-rank3', 'policy_issue_rank3');
  readStr('sel-metrix-q69-mfg-rule', 'q69_mfgAddRule');
  readStr('sel-metrix-check1-upload-mode', 'check1_photoUploadMode');

  // 11. 업종별 가이드 체크 상태 및 현재 선택된 업종 탭 편집값 동기화
  if (!metrixPolicyState.industryPolicies || typeof metrixPolicyState.industryPolicies !== 'object') {
    metrixPolicyState.industryPolicies = JSON.parse(JSON.stringify(DEFAULT_METRIX_INDUSTRY_POLICIES));
  }
  document.querySelectorAll('.cb-metrix-ind-enable').forEach(cb => {
    const indKey = cb.getAttribute('data-ind-key');
    if (indKey && metrixPolicyState.industryPolicies[indKey]) {
      metrixPolicyState.industryPolicies[indKey].enabled = cb.checked;
    }
  });
  const activeIndKey = metrixPolicyState._activeIndKey || 'ind_3';
  if (metrixPolicyState.industryPolicies[activeIndKey]) {
    const curInd = metrixPolicyState.industryPolicies[activeIndKey];
    curInd.operating_openHour = metrixPolicyState.operating_openHour;
    curInd.operating_closeHour = metrixPolicyState.operating_closeHour;
    curInd.operating_closedDays = metrixPolicyState.operating_closedDays;
    curInd.operating_closedDayOfWeek = metrixPolicyState.operating_closedDayOfWeek;
    curInd.digital_onlineSales = metrixPolicyState.digital_onlineSales;
    curInd.digital_smartTech = metrixPolicyState.digital_smartTech;
    curInd.sales_trend2025 = metrixPolicyState.sales_trend2025;
    curInd.cost_materialRatio = metrixPolicyState.cost_materialRatio;
    curInd.cost_laborRatio = metrixPolicyState.cost_laborRatio;
    curInd.cost_rentRatio = metrixPolicyState.cost_rentRatio;
    curInd.cost_taxRatio = metrixPolicyState.cost_taxRatio;
    curInd.cost_feeAdRatio = metrixPolicyState.cost_feeAdRatio;
    curInd.cost_otherRatio = metrixPolicyState.cost_otherRatio;
    curInd.payment_cashRatio = metrixPolicyState.payment_cashRatio;
    curInd.payment_cardRatio = metrixPolicyState.payment_cardRatio;
    curInd.payment_localCurrencyRatio = metrixPolicyState.payment_localCurrencyRatio;
    curInd.payment_mobileRatio = metrixPolicyState.payment_mobileRatio;
    curInd.payment_voucherRatio = metrixPolicyState.payment_voucherRatio;
    curInd.payment_transferRatio = metrixPolicyState.payment_transferRatio;
    curInd.funding_guaranteeRule = metrixPolicyState.funding_guaranteeRule;
    curInd.funding_whenGuaranteeX = metrixPolicyState.funding_whenGuaranteeX;
    curInd.owner_monthlyIncome = metrixPolicyState.owner_monthlyIncome;
    curInd.hardship_rank1 = metrixPolicyState.hardship_rank1;
    curInd.hardship_rank2 = metrixPolicyState.hardship_rank2;
    curInd.desired_support_rank1 = metrixPolicyState.desired_support_rank1;
    curInd.desired_support_rank2 = metrixPolicyState.desired_support_rank2;
    curInd.open_ended_comment = metrixPolicyState.open_ended_comment;
  }

  return metrixPolicyState;
}


export function bindMetrixEvents({ metrixPolicyState, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas }) {
  // 1. 영업비용 6대 항목 밸런서 실시간 합계 계산
  const costInputs = document.querySelectorAll('.num-metrix-cost');
  const badgeCostTotal = document.getElementById('badge-metrix-cost-total');
  function updateCostTotal() {
    let sum = 0;
    costInputs.forEach(inp => { sum += Number(inp.value) || 0; });
    if (badgeCostTotal) {
      if (sum === 100) {
        badgeCostTotal.className = 'badge-status ready';
        badgeCostTotal.innerHTML = '<i class="fa-solid fa-check"></i> 100% 매칭 완료';
      } else {
        badgeCostTotal.className = 'badge-status error';
        badgeCostTotal.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${sum}% (잔여 ${100 - sum}%)`;
      }
    }
  }
  costInputs.forEach(inp => inp.addEventListener('input', updateCostTotal));
  updateCostTotal();

  // 2. 결제수단 6대 항목 밸런서 실시간 합계 계산
  const payInputs = document.querySelectorAll('.num-metrix-pay');
  const badgePayTotal = document.getElementById('badge-metrix-pay-total');
  function updatePayTotal() {
    let sum = 0;
    payInputs.forEach(inp => { sum += Number(inp.value) || 0; });
    if (badgePayTotal) {
      if (sum === 100) {
        badgePayTotal.className = 'badge-status ready';
        badgePayTotal.innerHTML = '<i class="fa-solid fa-check"></i> 100% 매칭 완료';
      } else {
        badgePayTotal.className = 'badge-status error';
        badgePayTotal.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${sum}% (잔여 ${100 - sum}%)`;
      }
    }
  }
  payInputs.forEach(inp => inp.addEventListener('input', updatePayTotal));
  updatePayTotal();

  // 3. 차입처별 대출 비중 4대 항목 밸런서 실시간 합계 계산
  const debtInputs = document.querySelectorAll('.num-metrix-debt-ratio');
  const badgeDebtTotal = document.getElementById('badge-metrix-debt-total');
  function updateDebtTotal() {
    let sum = 0;
    debtInputs.forEach(inp => { sum += Number(inp.value) || 0; });
    if (badgeDebtTotal) {
      if (sum === 100) {
        badgeDebtTotal.className = 'badge-status ready';
        badgeDebtTotal.innerHTML = '<i class="fa-solid fa-check"></i> 100% 매칭 완료';
      } else {
        badgeDebtTotal.className = 'badge-status error';
        badgeDebtTotal.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${sum}% (잔여 ${100 - sum}%)`;
      }
    }
  }
  debtInputs.forEach(inp => inp.addEventListener('input', updateDebtTotal));
  updateDebtTotal();

  // 3-1. 8대 업종별 가이드 탭 전환 및 체크박스 이벤트
  function loadIndustryIntoForm(indKey) {
    if (!metrixPolicyState.industryPolicies) {
      metrixPolicyState.industryPolicies = JSON.parse(JSON.stringify(DEFAULT_METRIX_INDUSTRY_POLICIES));
    }
    const indPol = metrixPolicyState.industryPolicies[indKey];
    if (!indPol) return;
    metrixPolicyState._activeIndKey = indKey;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = String(val);
    };
    setVal('sel-metrix-open-hour', indPol.operating_openHour || '09');
    setVal('sel-metrix-close-hour', indPol.operating_closeHour || '20');
    setVal('sel-metrix-closed-days', indPol.operating_closedDays ?? '1');
    setVal('sel-metrix-closed-dow', indPol.operating_closedDayOfWeek || '7');
    setVal('sel-metrix-digital-online', indPol.digital_onlineSales || 'panel_or_no');
    setVal('sel-metrix-digital-smart', indPol.digital_smartTech || 'panel_or_pos');
    setVal('sel-metrix-sales-trend', indPol.sales_trend2025 || 'maintain');
    setVal('num-metrix-owner-income', indPol.owner_monthlyIncome ?? 320);
    setVal('num-metrix-cost-mat', indPol.cost_materialRatio ?? 55);
    setVal('num-metrix-cost-labor', indPol.cost_laborRatio ?? 15);
    setVal('num-metrix-cost-rent', indPol.cost_rentRatio ?? 15);
    setVal('num-metrix-cost-tax', indPol.cost_taxRatio ?? 7);
    setVal('num-metrix-cost-fee', indPol.cost_feeAdRatio ?? 4);
    setVal('num-metrix-cost-other', indPol.cost_otherRatio ?? 4);
    setVal('num-metrix-pay-cash', indPol.payment_cashRatio ?? 10);
    setVal('num-metrix-pay-card', indPol.payment_cardRatio ?? 65);
    setVal('num-metrix-pay-local', indPol.payment_localCurrencyRatio ?? 10);
    setVal('num-metrix-pay-mobile', indPol.payment_mobileRatio ?? 10);
    setVal('num-metrix-pay-voucher', indPol.payment_voucherRatio ?? 0);
    setVal('num-metrix-pay-transfer', indPol.payment_transferRatio ?? 5);
    setVal('sel-metrix-funding-guarantee-rule', indPol.funding_guaranteeRule || metrixPolicyState.funding_guaranteeRule || 'excel_sync');
    setVal('sel-metrix-funding-when-x', indPol.funding_whenGuaranteeX || metrixPolicyState.funding_whenGuaranteeX || '1');
    setVal('sel-metrix-hardship-rank1', indPol.hardship_rank1 || '3');
    setVal('sel-metrix-hardship-rank2', indPol.hardship_rank2 || '7');
    setVal('sel-metrix-support-rank1', indPol.desired_support_rank1 || '1');
    setVal('sel-metrix-support-rank2', indPol.desired_support_rank2 || '2');
    setVal('txt-metrix-comment', indPol.open_ended_comment || '');

    updateCostTotal();
    updatePayTotal();

    document.querySelectorAll('.metrix-ind-guide-card').forEach(card => {
      const k = card.getAttribute('data-ind-key');
      const isAct = (k === indKey);
      card.style.borderColor = isAct ? '#38bdf8' : 'rgba(148,163,184,0.22)';
      card.style.background = isAct ? 'rgba(56,189,248,0.14)' : 'rgba(15,23,42,0.55)';
    });

    const activeBanner = document.getElementById('metrix-active-ind-banner');
    if (activeBanner) {
      activeBanner.innerHTML = `<i class="fa-solid fa-industry text-primary-color"></i> 현재 편집 중인 업종 가이드: <strong style="color:#38bdf8;">[${escapeHtml(indPol.name)}]</strong> — 영업시간(${escapeHtml(indPol.operating_openHour)}~${escapeHtml(indPol.operating_closeHour)}시) · 원재료비 ${indPol.cost_materialRatio}% · 카드 ${indPol.payment_cardRatio}% / 계좌이체 ${indPol.payment_transferRatio}% · 월순소득 ${indPol.owner_monthlyIncome}만원`;
    }
  }

  document.querySelectorAll('.metrix-ind-guide-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('cb-metrix-ind-enable')) return;
      const targetKey = card.getAttribute('data-ind-key');
      if (!targetKey) return;
      // 먼저 이전 탭의 변경사항을 저장한 뒤 새 업종 로드
      syncMetrixInputsToState(metrixPolicyState);
      loadIndustryIntoForm(targetKey);
      if (appendLog) {
        const indName = metrixPolicyState.industryPolicies?.[targetKey]?.name || targetKey;
        appendLog('info', `[업종별 가이드 선택] "${indName}" 맞춤 가이드 설정값을 아래 문항 카드에 불러왔습니다.`);
      }
    });
  });

  document.querySelectorAll('.cb-metrix-ind-enable').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const indKey = cb.getAttribute('data-ind-key');
      if (indKey && metrixPolicyState.industryPolicies?.[indKey]) {
        metrixPolicyState.industryPolicies[indKey].enabled = cb.checked;
      }
      const enabledCnt = Object.values(metrixPolicyState.industryPolicies || {}).filter(p => p.enabled !== false).length;
      const badgeCnt = document.getElementById('badge-metrix-ind-enabled-count');
      if (badgeCnt) badgeCnt.innerHTML = `<i class="fa-solid fa-check-double"></i> ${enabledCnt}/8개 업종 가이드 체크 활성`;
    });
  });

  const btnCheckAllInd = document.getElementById('btn-metrix-ind-check-all');
  if (btnCheckAllInd) {
    btnCheckAllInd.addEventListener('click', () => {
      document.querySelectorAll('.cb-metrix-ind-enable').forEach(cb => {
        cb.checked = true;
        const k = cb.getAttribute('data-ind-key');
        if (k && metrixPolicyState.industryPolicies?.[k]) metrixPolicyState.industryPolicies[k].enabled = true;
      });
      const badgeCnt = document.getElementById('badge-metrix-ind-enabled-count');
      if (badgeCnt) badgeCnt.innerHTML = '<i class="fa-solid fa-check-double"></i> 8/8개 업종 가이드 체크 활성';
      if (appendLog) appendLog('info', '✓ 8대 전 업종 맞춤 가이드 체크가 모두 활성화되었습니다.');
    });
  }

  const btnSelectIndQuotas = document.getElementById('btn-metrix-select-active-ind-quotas');
  if (btnSelectIndQuotas && typeof onSelectIndustryQuotas === 'function') {
    btnSelectIndQuotas.addEventListener('click', () => {
      syncMetrixInputsToState(metrixPolicyState);
      const activeKey = metrixPolicyState._activeIndKey || 'ind_3';
      onSelectIndustryQuotas(activeKey);
    });
  }

  const btnApplyIndToChecked = document.getElementById('btn-metrix-apply-ind-to-checked');
  if (btnApplyIndToChecked && typeof onApplyIndustryGuideToChecked === 'function') {
    btnApplyIndToChecked.addEventListener('click', () => {
      syncMetrixInputsToState(metrixPolicyState);
      const activeKey = metrixPolicyState._activeIndKey || 'ind_3';
      const indPol = metrixPolicyState.industryPolicies?.[activeKey];
      onApplyIndustryGuideToChecked(activeKey, indPol);
    });
  }

  // 4. 빠른 프리셋 버튼 제어
  const btnPresetStd = document.getElementById('btn-metrix-preset-standard');
  const btnPresetGrowth = document.getElementById('btn-metrix-preset-growth');
  const btnPresetDec = document.getElementById('btn-metrix-preset-decrease');

  function setActivePresetBtn(activeBtn) {
    [btnPresetStd, btnPresetGrowth, btnPresetDec].forEach(b => {
      if (b) b.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  }

  if (btnPresetStd) {
    btnPresetStd.addEventListener('click', () => {
      setActivePresetBtn(btnPresetStd);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('sel-metrix-sales-trend', 'maintain');
      setVal('sel-metrix-sales-reason1', '1');
      setVal('sel-metrix-sales-reason2', '2');
      setVal('sel-metrix-satisfaction-mode', 'mixed_3_4');
      setVal('sel-metrix-debt-rank1', '1');
      setVal('sel-metrix-debt-rank2', '2');
      setVal('sel-metrix-hardship-rank1', '3');
      setVal('sel-metrix-hardship-rank2', '7');
      setVal('sel-metrix-future-plan', '1');
      setVal('sel-metrix-support-rank1', '1');
      setVal('sel-metrix-support-rank2', '2');
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "표준 소상공인" (경영유지, 3~4점 만족도, 운전자금·환경개선 중심) 전 문항 가이드 적용됨.');
    });
  }

  if (btnPresetGrowth) {
    btnPresetGrowth.addEventListener('click', () => {
      setActivePresetBtn(btnPresetGrowth);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('sel-metrix-sales-trend', 'growth');
      setVal('sel-metrix-sales-reason1', '5');
      setVal('sel-metrix-sales-reason2', '1');
      setVal('sel-metrix-satisfaction-mode', 'positive_4_5');
      setVal('sel-metrix-debt-rank1', '2');
      setVal('sel-metrix-debt-rank2', '1');
      setVal('sel-metrix-hardship-rank1', '4');
      setVal('sel-metrix-hardship-rank2', '8');
      setVal('sel-metrix-future-plan', '1');
      setVal('sel-metrix-support-rank1', '3');
      setVal('sel-metrix-support-rank2', '2');
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "성장·긍정형" (매출 소폭증가, 4~5점 높은 만족도, 시설투자·판로확대 중심) 전 문항 가이드 적용됨.');
    });
  }

  if (btnPresetDec) {
    btnPresetDec.addEventListener('click', () => {
      setActivePresetBtn(btnPresetDec);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('sel-metrix-sales-trend', 'decrease');
      setVal('sel-metrix-sales-reason1', '1');
      setVal('sel-metrix-sales-reason2', '3');
      setVal('sel-metrix-satisfaction-mode', 'neutral_3');
      setVal('sel-metrix-debt-rank1', '1');
      setVal('sel-metrix-debt-rank2', '3');
      setVal('sel-metrix-hardship-rank1', '7');
      setVal('sel-metrix-hardship-rank2', '3');
      setVal('sel-metrix-future-plan', '1');
      setVal('sel-metrix-support-rank1', '1');
      setVal('sel-metrix-support-rank2', '6');
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "생계·애로형" (매출 소폭감소, 저금리 특례보증 및 공공요금·임차료 완화 필요) 전 문항 가이드 적용됨.');
    });
  }
}

export function renderMetrixBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas }) {
  const metrixPolicyState = { ...(data.policy || data.blueprint?.defaultPolicy || {}) };

  // 0. 실행 규칙 및 패널 계승 & 폐업 제외 · 컨택 휴대폰 변경 · 업종별 가이드 기본값
  if (metrixPolicyState.safetyStopAtReview === undefined) metrixPolicyState.safetyStopAtReview = true;
  if (metrixPolicyState.preserveExistingInputs === undefined) metrixPolicyState.preserveExistingInputs = true;
  if (metrixPolicyState.skipCompletedSlots === undefined) metrixPolicyState.skipCompletedSlots = true;
  if (metrixPolicyState.inheritPanelRawMeta === undefined) metrixPolicyState.inheritPanelRawMeta = true;
  if (metrixPolicyState.excludeClosedBiz === undefined) metrixPolicyState.excludeClosedBiz = true;
  if (metrixPolicyState.updatePhoneInContactPopup === undefined) metrixPolicyState.updatePhoneInContactPopup = true;
  if (metrixPolicyState.useIndustryGuidelines === undefined) metrixPolicyState.useIndustryGuidelines = true;

  const mergedIndPolicies = JSON.parse(JSON.stringify(DEFAULT_METRIX_INDUSTRY_POLICIES));
  const incomingInd = data.industryPolicies || metrixPolicyState.industryPolicies || {};
  Object.keys(mergedIndPolicies).forEach(k => {
    if (incomingInd[k]) {
      mergedIndPolicies[k] = { ...mergedIndPolicies[k], ...incomingInd[k] };
    }
  });
  metrixPolicyState.industryPolicies = mergedIndPolicies;
  if (!metrixPolicyState._activeIndKey) metrixPolicyState._activeIndKey = 'ind_3';
  const industryStats = data.industryStats || {};

  // 1. 일반현황 (A1~A15) 기본값
  if (metrixPolicyState.general_bindAddressReadonly === undefined) metrixPolicyState.general_bindAddressReadonly = true;
  if (!metrixPolicyState.general_franchiseMode) metrixPolicyState.general_franchiseMode = 'panel_or_non_franchise';
  if (metrixPolicyState.general_defaultAreaPyeong === undefined) metrixPolicyState.general_defaultAreaPyeong = 30;
  if (!metrixPolicyState.general_locationType) metrixPolicyState.general_locationType = '1';
  if (!metrixPolicyState.general_founderType) metrixPolicyState.general_founderType = '1';
  if (!metrixPolicyState.general_prevStatus) metrixPolicyState.general_prevStatus = '1';

  // 2. 영업·디지털 (문8~문9) 기본값
  if (!metrixPolicyState.operating_openHour) metrixPolicyState.operating_openHour = '09';
  if (!metrixPolicyState.operating_closeHour) metrixPolicyState.operating_closeHour = '20';
  if (!metrixPolicyState.operating_closedDays) metrixPolicyState.operating_closedDays = '1';
  if (!metrixPolicyState.operating_closedDayOfWeek) metrixPolicyState.operating_closedDayOfWeek = '7';
  if (!metrixPolicyState.digital_onlineSales) metrixPolicyState.digital_onlineSales = 'panel_or_no';
  if (!metrixPolicyState.digital_smartTech) metrixPolicyState.digital_smartTech = 'panel_or_pos';

  // 3. 경영실적·6대 영업비용·대표자 소득 (문10~문13) 기본값 (기존 4항목 70/15/10/5 저장값도 6항목 합 100%로 자동 호환)
  if (!metrixPolicyState.sales_trend2025) metrixPolicyState.sales_trend2025 = 'maintain';
  if (!metrixPolicyState.sales_changeReasonRank1) metrixPolicyState.sales_changeReasonRank1 = '1';
  if (!metrixPolicyState.sales_changeReasonRank2) metrixPolicyState.sales_changeReasonRank2 = '2';
  if (metrixPolicyState.owner_monthlyIncome === undefined) metrixPolicyState.owner_monthlyIncome = 320;

  if (metrixPolicyState.cost_laborRatio === undefined && metrixPolicyState.cost_feeAdRatio === undefined) {
    metrixPolicyState.cost_materialRatio = 55;
    metrixPolicyState.cost_laborRatio = 15;
    metrixPolicyState.cost_rentRatio = 15;
    metrixPolicyState.cost_taxRatio = 7;
    metrixPolicyState.cost_feeAdRatio = 4;
    metrixPolicyState.cost_otherRatio = 4;
  } else {
    if (metrixPolicyState.cost_materialRatio === undefined) metrixPolicyState.cost_materialRatio = 55;
    if (metrixPolicyState.cost_laborRatio === undefined) metrixPolicyState.cost_laborRatio = 15;
    if (metrixPolicyState.cost_rentRatio === undefined) metrixPolicyState.cost_rentRatio = 15;
    if (metrixPolicyState.cost_taxRatio === undefined) metrixPolicyState.cost_taxRatio = 7;
    if (metrixPolicyState.cost_feeAdRatio === undefined) metrixPolicyState.cost_feeAdRatio = 4;
    if (metrixPolicyState.cost_otherRatio === undefined) metrixPolicyState.cost_otherRatio = 4;
  }

  // 4. 6대 결제수단 & 부채 구조 (문14~문15) 기본값 (기존 3항목 70/20/10 저장값도 6항목 합 100%로 자동 호환)
  if (metrixPolicyState.payment_localCurrencyRatio === undefined && metrixPolicyState.payment_transferRatio === undefined) {
    metrixPolicyState.payment_cashRatio = 10;
    metrixPolicyState.payment_cardRatio = 65;
    metrixPolicyState.payment_localCurrencyRatio = 10;
    metrixPolicyState.payment_mobileRatio = 10;
    metrixPolicyState.payment_voucherRatio = 0;
    metrixPolicyState.payment_transferRatio = 5;
  } else {
    if (metrixPolicyState.payment_cashRatio === undefined) metrixPolicyState.payment_cashRatio = 10;
    if (metrixPolicyState.payment_cardRatio === undefined) metrixPolicyState.payment_cardRatio = 65;
    if (metrixPolicyState.payment_localCurrencyRatio === undefined) metrixPolicyState.payment_localCurrencyRatio = 10;
    if (metrixPolicyState.payment_mobileRatio === undefined) metrixPolicyState.payment_mobileRatio = 10;
    if (metrixPolicyState.payment_voucherRatio === undefined) metrixPolicyState.payment_voucherRatio = 0;
    if (metrixPolicyState.payment_transferRatio === undefined) metrixPolicyState.payment_transferRatio = 5;
  }

  if (!metrixPolicyState.debt_hasDebt) metrixPolicyState.debt_hasDebt = 'panel_or_no';
  if (metrixPolicyState.debt_totalAmount === undefined) metrixPolicyState.debt_totalAmount = 5000;
  if (metrixPolicyState.debt_secondTierRatio === undefined) {
    metrixPolicyState.debt_bankRatio = 70;
    metrixPolicyState.debt_secondTierRatio = 10;
    metrixPolicyState.debt_policyRatio = 20;
    metrixPolicyState.debt_otherRatio = 0;
  } else {
    if (metrixPolicyState.debt_bankRatio === undefined) metrixPolicyState.debt_bankRatio = 70;
    if (metrixPolicyState.debt_policyRatio === undefined) metrixPolicyState.debt_policyRatio = 20;
    if (metrixPolicyState.debt_otherRatio === undefined) metrixPolicyState.debt_otherRatio = 0;
  }
  if (!metrixPolicyState.debt_reasonRank1) metrixPolicyState.debt_reasonRank1 = '1';
  if (!metrixPolicyState.debt_reasonRank2) metrixPolicyState.debt_reasonRank2 = '2';
  if (!metrixPolicyState.funding_guaranteeRule) metrixPolicyState.funding_guaranteeRule = 'excel_sync';
  if (!metrixPolicyState.funding_whenGuaranteeX) metrixPolicyState.funding_whenGuaranteeX = '1';

  // 5. 사업장 임대차 · 계약기간 · 권리금 (문16~문18)
  if (!metrixPolicyState.lease_type) metrixPolicyState.lease_type = 'monthly_deposit';
  if (metrixPolicyState.lease_deposit === undefined) metrixPolicyState.lease_deposit = 2000;
  if (metrixPolicyState.lease_monthlyRent === undefined) metrixPolicyState.lease_monthlyRent = 120;
  if (metrixPolicyState.lease_contractYears === undefined) metrixPolicyState.lease_contractYears = 5;
  if (!metrixPolicyState.goodwill_hasGoodwill) metrixPolicyState.goodwill_hasGoodwill = 'panel_or_no';
  if (metrixPolicyState.goodwill_amount === undefined) metrixPolicyState.goodwill_amount = 1000;
  if (!metrixPolicyState.goodwill_recoveryExpect) metrixPolicyState.goodwill_recoveryExpect = '2';

  // 6. 창업 준비 · 경영애로 · 상권경쟁 · 향후계획 (문19~문29)
  if (!metrixPolicyState.hardship_rank1) metrixPolicyState.hardship_rank1 = '3';
  if (!metrixPolicyState.hardship_rank2) metrixPolicyState.hardship_rank2 = '7';
  if (!metrixPolicyState.market_competitionLevel) metrixPolicyState.market_competitionLevel = '5';
  if (!metrixPolicyState.future_businessPlan) metrixPolicyState.future_businessPlan = '1';
  if (!metrixPolicyState.future_reemploymentPlan) metrixPolicyState.future_reemploymentPlan = '2';

  // 7. 고용 인력 · 주당 근무시간 · 4대보험 · 급여 (문31~문39)
  if (metrixPolicyState.employee_owner === undefined) metrixPolicyState.employee_owner = 1;
  if (metrixPolicyState.employee_family === undefined) metrixPolicyState.employee_family = 0;
  if (metrixPolicyState.employee_regular === undefined) metrixPolicyState.employee_regular = 1;
  if (metrixPolicyState.employee_temp === undefined) metrixPolicyState.employee_temp = 0;
  if (metrixPolicyState.labor_ownerWeeklyHours === undefined) metrixPolicyState.labor_ownerWeeklyHours = 45;
  if (metrixPolicyState.labor_staffWeeklyHours === undefined) metrixPolicyState.labor_staffWeeklyHours = 40;
  if (!metrixPolicyState.labor_insuranceMode) metrixPolicyState.labor_insuranceMode = 'panel_or_standard';
  if (metrixPolicyState.labor_avgMonthlyWage === undefined) metrixPolicyState.labor_avgMonthlyWage = 300;
  if (!metrixPolicyState.labor_hiringDifficulty) metrixPolicyState.labor_hiringDifficulty = '3';

  // 8. 경기도 지원정책 수혜경험 · 만족도 · 희망사업 (문50~문67)
  if (!metrixPolicyState.policy_experienceMode) metrixPolicyState.policy_experienceMode = 'panel_or_no';
  if (!metrixPolicyState.satisfaction_mode) metrixPolicyState.satisfaction_mode = 'mixed_3_4';
  if (!metrixPolicyState.desired_support_rank1) metrixPolicyState.desired_support_rank1 = '1';
  if (!metrixPolicyState.desired_support_rank2) metrixPolicyState.desired_support_rank2 = '2';

  // 9. 주관식 코멘트 & 증빙
  if (!metrixPolicyState.open_ended_comment) {
    metrixPolicyState.open_ended_comment = '지속되는 고물가로 인해 원재료비 및 공공요금 부담이 큽니다. 경기신용보증재단 저금리 특례보증 대출 한도 확대와 상환 거치기간 연장, 점포 시설개선 지원이 지속되었으면 합니다.';
  }
  if (!metrixPolicyState.evidence_sign_image) {
    metrixPolicyState.evidence_sign_image = 'data/sample_metrix_sign.png';
  }

  // 9-B. 경기도 3차 본조사 문항별 정밀 가이드 제어판 기본값 (문10 ~ 문69 · CHECK1 사진 미업로드)
  if (!metrixPolicyState.q10_fundMgmtMode) metrixPolicyState.q10_fundMgmtMode = 'random';
  if (!metrixPolicyState.q12_1_evalReasonMode) metrixPolicyState.q12_1_evalReasonMode = 'random';
  if (!metrixPolicyState.q16_1_leaseSource) metrixPolicyState.q16_1_leaseSource = 'excel_first';
  if (!metrixPolicyState.q17_goodwillRangeMode) metrixPolicyState.q17_goodwillRangeMode = 'range';
  if (metrixPolicyState.goodwill_min === undefined) metrixPolicyState.goodwill_min = 1000;
  if (metrixPolicyState.goodwill_max === undefined) metrixPolicyState.goodwill_max = 5000;
  if (metrixPolicyState.goodwill_step === undefined) metrixPolicyState.goodwill_step = 500;
  if (!metrixPolicyState.q21_femaleDiffMode) metrixPolicyState.q21_femaleDiffMode = 'random';
  if (!metrixPolicyState.q22_hardshipMode) metrixPolicyState.q22_hardshipMode = 'random';
  if (!metrixPolicyState.q23_climateImpact) metrixPolicyState.q23_climateImpact = '2';
  if (!metrixPolicyState.q24_competitivenessMode) metrixPolicyState.q24_competitivenessMode = 'random';
  if (!metrixPolicyState.q25_otherIncome) metrixPolicyState.q25_otherIncome = '2';
  if (!metrixPolicyState.q26_onlineRule) metrixPolicyState.q26_onlineRule = 'food_only_yes';
  if (!metrixPolicyState.q26_1_foodChannel) metrixPolicyState.q26_1_foodChannel = '3';
  if (!metrixPolicyState.q34_wageRangeMode) metrixPolicyState.q34_wageRangeMode = 'range';
  if (metrixPolicyState.labor_wageMin === undefined) metrixPolicyState.labor_wageMin = 240;
  if (metrixPolicyState.labor_wageMax === undefined) metrixPolicyState.labor_wageMax = 320;
  if (metrixPolicyState.labor_wageStep === undefined) metrixPolicyState.labor_wageStep = 5;
  if (!metrixPolicyState.q35_empChange) metrixPolicyState.q35_empChange = '2';
  if (!metrixPolicyState.q43_4_continueReasonMode) metrixPolicyState.q43_4_continueReasonMode = 'random';
  if (!metrixPolicyState.q44_investPlanMode) metrixPolicyState.q44_investPlanMode = 'random';
  if (!metrixPolicyState.q60_awarenessRule) metrixPolicyState.q60_awarenessRule = 'guarantee_sync';
  if (!metrixPolicyState.q66_1_otherOrgRouteMode) metrixPolicyState.q66_1_otherOrgRouteMode = 'random';
  if (!metrixPolicyState.q67_desiredSupportMode) metrixPolicyState.q67_desiredSupportMode = 'random';
  if (!metrixPolicyState.desired_support_rank3) metrixPolicyState.desired_support_rank3 = '9';
  if (!metrixPolicyState.q68_policyIssueMode) metrixPolicyState.q68_policyIssueMode = 'random';
  if (!metrixPolicyState.policy_issue_rank1) metrixPolicyState.policy_issue_rank1 = '6';
  if (!metrixPolicyState.policy_issue_rank2) metrixPolicyState.policy_issue_rank2 = '8';
  if (!metrixPolicyState.policy_issue_rank3) metrixPolicyState.policy_issue_rank3 = '5';
  if (!metrixPolicyState.q69_mfgAddRule) metrixPolicyState.q69_mfgAddRule = 'all_no';
  if (!metrixPolicyState.check1_photoUploadMode) metrixPolicyState.check1_photoUploadMode = 'skip_upload';

  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';

  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) {
    presetGroup.style.display = 'inline-flex';
    presetGroup.innerHTML = `
      <span class="font-caption font-bold text-dim mr-4"><i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 빠른 정책 프리셋:</span>
      <button type="button" class="btn-chip ${metrixPolicyState.sales_trend2025 === 'maintain' ? 'active' : ''}" id="btn-metrix-preset-standard" title="표준 소상공인: 경영실적 유지, 3~4점 만족도 중심">
        <i class="fa-solid fa-store"></i> 표준 소상공인
      </button>
      <button type="button" class="btn-chip ${metrixPolicyState.sales_trend2025 === 'growth' ? 'active' : ''}" id="btn-metrix-preset-growth" title="성장·긍정형: 매출 소폭 증가, 4~5점 높은 만족도">
        <i class="fa-solid fa-arrow-trend-up"></i> 성장·긍정형
      </button>
      <button type="button" class="btn-chip ${metrixPolicyState.sales_trend2025 === 'decrease' ? 'active' : ''}" id="btn-metrix-preset-decrease" title="생계·애로형: 매출 소폭 감소, 정책자금 및 공공요금 완화 지원 필요">
        <i class="fa-solid fa-hand-holding-dollar"></i> 생계·애로형
      </button>
    `;
  }

  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';

  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const isSeoulPanel = (data.surveyType === 'metrix_seoul_panel');
  if (!metrixPolicyState.seoul_m1_rank1) metrixPolicyState.seoul_m1_rank1 = '1';
  if (!metrixPolicyState.seoul_m2_rank1) metrixPolicyState.seoul_m2_rank1 = '2';
  if (!metrixPolicyState.seoul_m3_rank1) metrixPolicyState.seoul_m3_rank1 = '1';
  if (!metrixPolicyState.seoul_n2_aiAdoption) metrixPolicyState.seoul_n2_aiAdoption = 'all_2_unused';
  if (!metrixPolicyState.seoul_o1_carbon) metrixPolicyState.seoul_o1_carbon = '2_3_mixed';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) {
    titleEl.textContent = isSeoulPanel
      ? '(신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차) 전 문항 가이드라인 (svyA001~svyA115 · 99% 안전 대기 · 구글시트 자동 기록)'
      : '메트릭스 경기도 소상공인 사업체패널 3차조사 (SNUM 622) · 8대 업종별 맞춤 가이드 체크 & 전 문항 기준점 (120단계)';
  }

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = isSeoulPanel
      ? '4차년도 서버 기주입값 100% 보존 + C3(2026년 세부 비용 4항목 정합성 자동 산출) + 5차 신규 문항(M 위기대응 · N AI/디지털 · O 탄소중립) + svyA115.asp(99%) 안전 대기 및 구글 스프레드시트(시트2) 실시간 동기화를 설정합니다.'
      : '1) 사업자번호 기반 폐업 리스트 자동 제외, 2) [컨택] 팝업 휴대폰 번호를 엑셀 데이터로 변경·[저장] 후 [설문참여], 3) 8대 업종별 맞춤 가이드 및 문항별 정밀 응답 가이드(문10~문69 · CHECK1 미업로드)를 설정합니다.';
  }

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = isSeoulPanel
      ? '<i class="fa-solid fa-shield-halved"></i> 서울시 패널 5차 115단계 블루프린트 활성 (svyA115 99% 안전 대기 &amp; 구글시트 자동 기록)'
      : '<i class="fa-solid fa-circle-check"></i> 경기도 소상공인 패널 3계정(171건) · 문항별 정밀 가이드 &amp; 엑셀 보증금·월세 연동 활성';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = isSeoulPanel
      ? '<i class="fa-solid fa-floppy-disk"></i> 서울시 소상공인 패널 5차 가이드 저장'
      : '<i class="fa-solid fa-floppy-disk"></i> 경기도 패널 업종별 가이드 &amp; 기준점 저장';
    btnSaveBaseline.title = isSeoulPanel
      ? '서울시 소상공인 사업체 패널조사(5차) 기준 가이드라인 설정 저장'
      : '경기도 소상공인 패널조사 8대 업종별 가이드 및 120단계 기준점 저장';
  }

  if (!blueprintStageGrid) return metrixPolicyState;

  const indKeys = ['ind_1', 'ind_2', 'ind_3', 'ind_5', 'ind_6', 'ind_7', 'ind_8', 'ind_9'];
  const enabledIndCount = indKeys.filter(k => metrixPolicyState.industryPolicies?.[k]?.enabled !== false).length;
  const activeIndObj = metrixPolicyState.industryPolicies?.[metrixPolicyState._activeIndKey] || metrixPolicyState.industryPolicies?.ind_3 || {};

  blueprintStageGrid.innerHTML = `
    <!-- 카드 0: 실행 규칙 · 안전 대기 & 종단 패널 실측치 계승 (전폭) -->
    <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-shield-halved"></i> 핵심 실행 원칙</span>
          <h3 class="blueprint-stage-title">${isSeoulPanel
            ? 'svyA115.asp (99% 동의서) 절대 안전 대기 · 4차년도 서버 기주입값 보존 · 구글 스프레드시트(시트2) 자동 기록'
            : '사업자번호 폐업 제외 · [컨택] 팝업 휴대폰 변경·[저장] ➔ [설문참여] · 문항별 정밀 가이드 · 98% 안전 대기'}</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-database"></i> ${isSeoulPanel ? '2010 송준희(74) + 2016 정소영(89) 총 163건 연동' : '강영미(54) + 김정례(55) + 노영미(62) 총 171건 연동'}</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        ${isSeoulPanel
          ? '2026년 서울시 소상공인 사업체 패널조사(5차)는 <strong>절대 완료(Out.asp) 처리하지 않고</strong> <code>svyA115.asp</code>(개인정보 및 패널 참여 동의서 99%) 화면에서 무조건 정지합니다. 서버가 4차년도 응답값으로 미리 채워둔 문항(개업년도·업종·매출/비용·종사자 등)은 100% 보존하며, 각 사업체의 전체 문항 응답 내역을 <strong>구글 스프레드시트(시트2, gid=506086780)</strong>에 실시간으로 기록합니다.'
          : '1) 쿼터 데이터의 <strong>사업자번호</strong>를 조회하여 <strong>폐업인 리스트는 설문 입력에서 자동 제외</strong>합니다. 2) 메트릭스 설문목록(<code>SNUM=622</code>)에서 <strong>[컨택]</strong> 버튼을 눌러 상세 내용의 <strong>휴대폰</strong> 항목을 구글 스프레드시트 번호로 변경하고 <strong>[저장]</strong>한 뒤 <strong>[설문참여]</strong>를 눌러 시작합니다. 3) <strong>엑셀 보증금·월세 자동 연동</strong> 및 <strong>문10~문69 문항별 가이드 규칙</strong>을 반영하며, 사진 문항(CHECK1)은 업로드 없이 통과 후 Step 119(98%)에서 안전 대기합니다.'}
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px;">
        ${!isSeoulPanel ? `
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-exclude-closed" class="assoc-rule-cb" ${metrixPolicyState.excludeClosedBiz !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title" style="color:#f87171;"><i class="fa-solid fa-ban"></i> 사업자번호 폐업 리스트 자동 제외 [필수]</strong>
              <div class="assoc-rule-desc">
                국세청 홈택스 사업자번호 상태 조회 결과 '폐업자'이거나 STEP 1에서 [폐업제외]로 지정된 사업체는 배치 및 단건 실행에서 100% 제외합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-update-contact-phone" class="assoc-rule-cb" ${metrixPolicyState.updatePhoneInContactPopup !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title" style="color:#38bdf8;"><i class="fa-solid fa-mobile-screen-button"></i> [컨택] 팝업 휴대폰 번호 변경·[저장] 후 [설문참여]</strong>
              <div class="assoc-rule-desc">
                설문목록에서 [컨택] 클릭 ➔ '휴대폰'(전화번호 무선) 항목을 엑셀(구글 시트) 번호로 변경 ➔ 하단 [저장] 클릭 ➔ [설문참여]로 진입합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-use-ind-guide" class="assoc-rule-cb" ${metrixPolicyState.useIndustryGuidelines !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title" style="color:#a78bfa;"><i class="fa-solid fa-industry"></i> 8대 업종별 맞춤 가이드 체크·적용</strong>
              <div class="assoc-rule-desc">
                사업체 업종(1.제조업 ~ 9.수리·개인서비스업)에 따라 체크된 업종별 영업시간·비용비중·결제수단·애로사항 가이드를 자동 반영합니다.
              </div>
            </div>
          </label>
        </div>
        ` : ''}
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-safety-stop" class="assoc-rule-cb" ${metrixPolicyState.safetyStopAtReview !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-success"><i class="fa-solid fa-circle-check"></i> ${isSeoulPanel ? 'svyA115.asp (99% 동의서) 도달 시 즉시 안전 정지 [필수]' : '최종 제출 직전 98% 안전 대기 [필수]'}</strong>
              <div class="assoc-rule-desc">
                ${isSeoulPanel
                  ? 'A~O 전 문항 응답 후 svyA115.asp(99%)에 도달하면 [다음]을 누르지 않고 즉시 정지하여 절대 완료(Out.asp)되지 않도록 원천 보호합니다.'
                  : '동의서(2중 전자서명) 및 CHECK1 통과 후, Step 119 참여혜택 화면(98%)에서 즉시 정지하여 검토 가능 상태를 보존합니다.'}
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-inherit-rawmeta" class="assoc-rule-cb" ${metrixPolicyState.inheritPanelRawMeta !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-primary-color"><i class="fa-solid fa-link"></i> ${isSeoulPanel ? '4차년도 서버 프리필(Pre-fill) & C3 영업비용 정합 계산' : '2차년도 패널 실측치(rawMeta) 스마트 계승'}</strong>
              <div class="assoc-rule-desc">
                ${isSeoulPanel
                  ? '서버가 주입한 2025년/2026년 영업비용 총액(C3_2_4)에 맞춰 2026년 세부 비용 4항목(원재료비·임차료·공과금·수수료)을 오차 0원으로 자동 산출합니다.'
                  : '쿼터 DB 내 AA1~AA15(일반현황) 및 M8~M62 값을 기본 베이스로 삼되, 아래 문항별 정밀 가이드 설정이 지정된 문항은 가이드 규칙을 우선 적용합니다.'}
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-preserve-inputs" class="assoc-rule-cb" ${metrixPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">기입력된 설문 항목 보존 (가이드 지정 문항 제외)</strong>
              <div class="assoc-rule-desc">
                일반 문항의 기입력값은 보존하며, 아래 문항별 정밀 가이드(랜덤·범위·엑셀 연동 등)가 설정된 문항은 설정된 가이드 규칙대로 정확히 응답합니다.
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>

    ${!isSeoulPanel ? `
    <!-- 카드 0-1: [업종별 가이드 체크 & 맞춤 설정] (전폭) -->
    <section class="blueprint-card full-width-card" id="metrix-industry-guide-card" style="grid-column: 1 / -1; width: 100%; border: 1px solid rgba(56,189,248,0.35);">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill" style="background:rgba(56,189,248,0.18); color:#38bdf8;"><i class="fa-solid fa-industry"></i> 업종별 가이드 체크</span>
          <h3 class="blueprint-stage-title">[8대 업종별 맞춤 가이드 체크 &amp; 편집] 업종을 체크·선택하여 업종별 영업시간·비용비중·결제수단·애로사항 가이드를 구성합니다</h3>
        </div>
        <div class="blueprint-card-badge-group" style="display:flex; gap:8px; align-items:center;">
          <span id="badge-metrix-ind-enabled-count" class="badge-status ready"><i class="fa-solid fa-check-double"></i> ${enabledIndCount}/8개 업종 가이드 체크 활성</span>
          <button type="button" id="btn-metrix-ind-check-all" class="btn-chip" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-check"></i> 전 업종 체크</button>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        아래 8대 업종 카드에서 <strong>체크박스(☑)</strong>로 업종별 맞춤 가이드 적용 여부를 켜거나 끌 수 있으며, <strong>업종 카드를 클릭</strong>하면 아래 상세 문항 카드(파트 B·C·D·F·H·I)에 해당 업종의 설정값이 로드되어 업종별로 세밀하게 수정·저장할 수 있습니다.
      </div>
      <div class="p-14">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin-bottom:12px;">
          ${indKeys.map(k => {
            const p = metrixPolicyState.industryPolicies?.[k] || DEFAULT_METRIX_INDUSTRY_POLICIES[k];
            const st = industryStats[k] || {};
            const cnt = st.count ?? 0;
            const readyCnt = st.ready ?? 0;
            const doneCnt = st.done ?? 0;
            const isAct = (metrixPolicyState._activeIndKey === k);
            return `
              <div class="metrix-ind-guide-card" data-ind-key="${k}" style="padding:10px 12px; border-radius:10px; border:1px solid ${isAct ? '#38bdf8' : 'rgba(148,163,184,0.22)'}; background:${isAct ? 'rgba(56,189,248,0.14)' : 'rgba(15,23,42,0.55)'}; cursor:pointer; transition:all 0.15s;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px;">
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700; font-size:12.5px; color:#f8fafc;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="cb-metrix-ind-enable" data-ind-key="${k}" ${p.enabled !== false ? 'checked' : ''} />
                    <span>${escapeHtml(p.name)}</span>
                  </label>
                  <span class="badge-quota-type metrix" style="font-size:10.5px; padding:2px 7px;">${cnt}건</span>
                </div>
                <div style="font-size:11px; color:#94a3b8; line-height:1.45;">
                  <div>⏰ 영업: <strong>${escapeHtml(p.operating_openHour)}~${escapeHtml(p.operating_closeHour)}시</strong> · 소득 <strong>${p.owner_monthlyIncome}만</strong></div>
                  <div>📊 원재료 <strong>${p.cost_materialRatio}%</strong> · 인건비 <strong>${p.cost_laborRatio}%</strong> · 임차 <strong>${p.cost_rentRatio}%</strong></div>
                  <div>💳 카드 <strong>${p.payment_cardRatio}%</strong> · 이체 <strong>${p.payment_transferRatio}%</strong> (대기 ${readyCnt} / 완료 ${doneCnt})</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.75); border:1px solid rgba(56,189,248,0.25);">
          <div id="metrix-active-ind-banner" style="font-size:12px; color:#e2e8f0;">
            <i class="fa-solid fa-industry text-primary-color"></i> 현재 편집 중인 업종 가이드: <strong style="color:#38bdf8;">[${escapeHtml(activeIndObj.name || '3.도매 및 소매업')}]</strong> — 영업시간(${escapeHtml(activeIndObj.operating_openHour || '09')}~${escapeHtml(activeIndObj.operating_closeHour || '20')}시) · 원재료비 ${activeIndObj.cost_materialRatio ?? 65}% · 카드 ${activeIndObj.payment_cardRatio ?? 65}% / 계좌이체 ${activeIndObj.payment_transferRatio ?? 10}% · 월순소득 ${activeIndObj.owner_monthlyIncome ?? 320}만원
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" id="btn-metrix-select-active-ind-quotas" class="btn-chip" style="font-size:11.5px; padding:5px 10px; border-color:rgba(56,189,248,0.4); color:#38bdf8;" title="STEP 1 쿼터 목록에서 현재 선택된 업종의 미완료 사업체들만 체크합니다">
              <i class="fa-solid fa-filter"></i> STEP 1에서 이 업종 사업체만 체크
            </button>
            <button type="button" id="btn-metrix-apply-ind-to-checked" class="btn-chip active" style="font-size:11.5px; padding:5px 12px;" title="STEP 1에서 체크된 사업체들에 현재 업종 가이드를 즉시 배정하고 저장합니다">
              <i class="fa-solid fa-wand-magic-sparkles"></i> STEP 1 체크된 사업체에 이 업종 가이드 배정·저장
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 0-2: [3차 본조사 문항별 응답 규칙 가이드 제어판 — 파일럿 검수 20개 규칙 전수 설정] (전폭) -->
    <section class="blueprint-card full-width-card" id="metrix-pilot-rules-card" style="grid-column: 1 / -1; width: 100%; border: 1.5px solid rgba(52,211,153,0.45);">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill" style="background:rgba(52,211,153,0.18); color:#34d399;"><i class="fa-solid fa-sliders"></i> 문항별 정밀 가이드</span>
          <h3 class="blueprint-stage-title">[3차 본조사 문항별 응답 가이드 제어판] 문10 ~ 문69 · 제조업 추가문항 · 사진 미업로드 (전 업종 공통 제어)</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-check-circle"></i> 파일럿 검수 20개 문항 규칙 직접 설정 가능</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        경기도 3차 본조사 실제 문항번호(<code>Q10</code>~<code>Q69</code>, <code>CHECK1</code>) 기준으로 랜덤·범위(단위)·엑셀 연동·업종/보증지원 조건부 규칙을 직접 변경하고 상단 <strong>[경기도 패널 업종별 가이드 &amp; 기준점 저장]</strong> 버튼으로 저장할 수 있습니다.
      </div>
      <div class="p-14" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px;">
        <!-- 1. 문10 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문10 사업자금·가계자금 분리 관리 여부</label>
          <select id="sel-metrix-q10-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q10_fundMgmtMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~3번 무작위 · 2·3번 시 문10-1 자동연동) [기본]</option>
            <option value="1" ${metrixPolicyState.q10_fundMgmtMode === '1' ? 'selected' : ''}>1. 철저히 분리하여 관리</option>
            <option value="2" ${metrixPolicyState.q10_fundMgmtMode === '2' ? 'selected' : ''}>2. 대체로 분리하지만, 일부 혼용</option>
            <option value="3" ${metrixPolicyState.q10_fundMgmtMode === '3' ? 'selected' : ''}>3. 구분하지 않음</option>
            <option value="panel" ${metrixPolicyState.q10_fundMgmtMode === 'panel' ? 'selected' : ''}>2차패널(M10) 값 유지</option>
          </select>
        </div>

        <!-- 2. 문12-1 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문12-1 전반적 경영실적 판단 이유 (1·2순위)</label>
          <select id="sel-metrix-q12-1-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q12_1_evalReasonMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~7번 중 1·2순위 무작위, 기타 제외) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q12_1_evalReasonMode === 'fixed' ? 'selected' : ''}>파트 C 지정 순위(1순위·2순위) 고정 적용</option>
          </select>
        </div>

        <!-- 3. 문16-1 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.35);">
          <label class="figma-label font-bold" style="color:#38bdf8;">문16-1 임차 사업장 보증금 · 월세 입력 기준</label>
          <select id="sel-metrix-q16-1-source" class="figma-select w-full">
            <option value="excel_first" ${metrixPolicyState.q16_1_leaseSource === 'excel_first' ? 'selected' : ''}>📊 엑셀(구글 시트) [보증금]·[월세] 값으로 정확히 입력 [기본]</option>
            <option value="panel_first" ${metrixPolicyState.q16_1_leaseSource === 'panel_first' ? 'selected' : ''}>2차패널(M16-1) 값 우선 · 미존재 시 엑셀 값</option>
            <option value="fixed" ${metrixPolicyState.q16_1_leaseSource === 'fixed' ? 'selected' : ''}>파트 E 보증금·월세 기본값 고정 입력</option>
          </select>
        </div>

        <!-- 4. 문17 / 문17-1 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.35);">
          <label class="figma-label font-bold" style="color:#38bdf8;">문17 권리금 금액 범위 설정 (만원 · 단위)</label>
          <select id="sel-metrix-q17-range-mode" class="figma-select w-full mb-6">
            <option value="range" ${metrixPolicyState.q17_goodwillRangeMode === 'range' ? 'selected' : ''}>🎯 범위 랜덤 (기본 1000~5000만원, 500만원 단위) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q17_goodwillRangeMode === 'fixed' ? 'selected' : ''}>파트 E 고정 금액(문17-1 기본값) 사용</option>
            <option value="panel" ${metrixPolicyState.q17_goodwillRangeMode === 'panel' ? 'selected' : ''}>2차패널(M17-1) 값 유지</option>
          </select>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            <div>
              <span class="font-caption text-dim">최소(만원)</span>
              <input type="number" id="num-metrix-goodwill-min" class="figma-input w-full" min="0" step="100" value="${metrixPolicyState.goodwill_min}" />
            </div>
            <div>
              <span class="font-caption text-dim">최대(만원)</span>
              <input type="number" id="num-metrix-goodwill-max" class="figma-input w-full" min="0" step="100" value="${metrixPolicyState.goodwill_max}" />
            </div>
            <div>
              <span class="font-caption text-dim">단위(만원)</span>
              <input type="number" id="num-metrix-goodwill-step" class="figma-input w-full" min="50" step="50" value="${metrixPolicyState.goodwill_step}" />
            </div>
          </div>
        </div>

        <!-- 5. 문21 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문21 여성 대표자 사업 운영 애로사항 (복수)</label>
          <select id="sel-metrix-q21-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q21_femaleDiffMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~5번 중 1~2개 무작위, 기타 제외) [기본]</option>
            <option value="5" ${metrixPolicyState.q21_femaleDiffMode === '5' ? 'selected' : ''}>5. 가족·돌봄 부담 등으로 시간 확보 어려움 고정</option>
            <option value="2" ${metrixPolicyState.q21_femaleDiffMode === '2' ? 'selected' : ''}>2. 금융기관 자금조달 과정에서 불리한 대우 고정</option>
            <option value="panel" ${metrixPolicyState.q21_femaleDiffMode === 'panel' ? 'selected' : ''}>2차패널(M21) 값 유지</option>
          </select>
        </div>

        <!-- 6. 문22 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문22 경영상 가장 큰 애로사항 (1·2순위)</label>
          <select id="sel-metrix-q22-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q22_hardshipMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~8번 중 1·2순위 무작위, 기타 제외) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q22_hardshipMode === 'fixed' ? 'selected' : ''}>업종별 지정 애로사항 1·2순위 고정 적용</option>
          </select>
        </div>

        <!-- 7. 문23 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문23 기후변화(폭염·폭우·한파 등) 경영상 피해</label>
          <select id="sel-metrix-q23-climate" class="figma-select w-full">
            <option value="2" ${metrixPolicyState.q23_climateImpact === '2' ? 'selected' : ''}>✅ 2. 없음 100% 고정 (하위 문23-1 스킵) [기본]</option>
            <option value="1" ${metrixPolicyState.q23_climateImpact === '1' ? 'selected' : ''}>1. 있음</option>
            <option value="random" ${metrixPolicyState.q23_climateImpact === 'random' ? 'selected' : ''}>랜덤 응답 (1·2번 무작위)</option>
          </select>
        </div>

        <!-- 8. 문24 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문24 사업 경쟁력 강화를 위한 노력 (복수)</label>
          <select id="sel-metrix-q24-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q24_competitivenessMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~7번 중 1~2개 무작위, 기타 제외) [기본]</option>
            <option value="fixed_3_6" ${metrixPolicyState.q24_competitivenessMode === 'fixed_3_6' ? 'selected' : ''}>3. 품질 개선 + 6. 고객 서비스 개선 고정</option>
            <option value="panel" ${metrixPolicyState.q24_competitivenessMode === 'panel' ? 'selected' : ''}>2차패널(M24) 값 유지</option>
          </select>
        </div>

        <!-- 9. 문25 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문25 사업 외 별도 근로/기타 소득 유무</label>
          <select id="sel-metrix-q25-income" class="figma-select w-full">
            <option value="2" ${metrixPolicyState.q25_otherIncome === '2' ? 'selected' : ''}>✅ 2. 없음 100% 고정 (하위 문25-1 스킵) [기본]</option>
            <option value="1" ${metrixPolicyState.q25_otherIncome === '1' ? 'selected' : ''}>1. 있음</option>
            <option value="panel" ${metrixPolicyState.q25_otherIncome === 'panel' ? 'selected' : ''}>2차패널(M25) 값 유지</option>
          </select>
        </div>

        <!-- 10. 문26 & 문26-1 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.35);">
          <label class="figma-label font-bold" style="color:#38bdf8;">문26 · 문26-1 온라인/배달 플랫폼 판매 규칙</label>
          <select id="sel-metrix-q26-rule" class="figma-select w-full mb-6">
            <option value="food_only_yes" ${metrixPolicyState.q26_onlineRule === 'food_only_yes' ? 'selected' : ''}>🍽️ [문26] 5.음식 및 주점업만 1번(예), 그 외 업종은 2번(아니오) [기본]</option>
            <option value="2" ${metrixPolicyState.q26_onlineRule === '2' ? 'selected' : ''}>전체 업종 2번(아니오) 고정</option>
            <option value="1" ${metrixPolicyState.q26_onlineRule === '1' ? 'selected' : ''}>전체 업종 1번(예) 고정</option>
            <option value="panel" ${metrixPolicyState.q26_onlineRule === 'panel' ? 'selected' : ''}>2차패널(M26) 값 유지</option>
          </select>
          <div>
            <span class="font-caption text-dim">문26-1 음식·주점업(예 응답 시) 온라인 판매 채널</span>
            <select id="sel-metrix-q26-1-channel" class="figma-select w-full">
              <option value="3" ${metrixPolicyState.q26_1_foodChannel === '3' ? 'selected' : ''}>🛵 3. 배달앱/음식주문 플랫폼 (배민·요기요·쿠팡이츠) [기본]</option>
              <option value="3_4" ${metrixPolicyState.q26_1_foodChannel === '3_4' ? 'selected' : ''}>3. 배달앱 + 4. 지역형/공공 배달앱(땡겨요 등)</option>
              <option value="2" ${metrixPolicyState.q26_1_foodChannel === '2' ? 'selected' : ''}>2. 종합 온라인마켓/오픈마켓</option>
              <option value="random" ${metrixPolicyState.q26_1_foodChannel === 'random' ? 'selected' : ''}>1~5번 중 랜덤</option>
            </select>
          </div>
        </div>

        <!-- 11. 문34 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.35);">
          <label class="figma-label font-bold" style="color:#38bdf8;">문34 근로자 월평균 급여 범위 설정 (만원 · 단위)</label>
          <select id="sel-metrix-q34-range-mode" class="figma-select w-full mb-6">
            <option value="range" ${metrixPolicyState.q34_wageRangeMode === 'range' ? 'selected' : ''}>🎯 범위 랜덤 (기본 240~320만원, 5만원 단위) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q34_wageRangeMode === 'fixed' ? 'selected' : ''}>파트 G 고정 급여(문34 기본값) 사용</option>
            <option value="panel" ${metrixPolicyState.q34_wageRangeMode === 'panel' ? 'selected' : ''}>2차패널(M34) 값 유지</option>
          </select>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            <div>
              <span class="font-caption text-dim">최소(만원)</span>
              <input type="number" id="num-metrix-wage-min" class="figma-input w-full" min="50" step="5" value="${metrixPolicyState.labor_wageMin}" />
            </div>
            <div>
              <span class="font-caption text-dim">최대(만원)</span>
              <input type="number" id="num-metrix-wage-max" class="figma-input w-full" min="50" step="5" value="${metrixPolicyState.labor_wageMax}" />
            </div>
            <div>
              <span class="font-caption text-dim">단위(만원)</span>
              <input type="number" id="num-metrix-wage-step" class="figma-input w-full" min="1" step="1" value="${metrixPolicyState.labor_wageStep}" />
            </div>
          </div>
        </div>

        <!-- 12. 문35 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문35 전년 대비 종사자 수 변동 여부</label>
          <select id="sel-metrix-q35-emp-change" class="figma-select w-full">
            <option value="2" ${metrixPolicyState.q35_empChange === '2' ? 'selected' : ''}>✅ 2. 변동 없음 100% 고정 (하위 문35-1 스킵) [기본]</option>
            <option value="1" ${metrixPolicyState.q35_empChange === '1' ? 'selected' : ''}>1. 증가함</option>
            <option value="3" ${metrixPolicyState.q35_empChange === '3' ? 'selected' : ''}>3. 감소함</option>
            <option value="random" ${metrixPolicyState.q35_empChange === 'random' ? 'selected' : ''}>랜덤 응답 (1~3번 무작위)</option>
          </select>
        </div>

        <!-- 13. 문43-4 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문43-4 사업 계속 운영 이유 (1·2순위)</label>
          <select id="sel-metrix-q43-4-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q43_4_continueReasonMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~5번 중 1·2순위 무작위, 기타 제외) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q43_4_continueReasonMode === 'fixed' ? 'selected' : ''}>1순위 매출·영업이익 양호 / 2순위 경기회복 기대 고정</option>
          </select>
        </div>

        <!-- 14. 문44 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문44 향후 1년 내 투자·사업 확장 계획</label>
          <select id="sel-metrix-q44-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q44_investPlanMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1번 계획없음 단독 또는 2~8번 중 무작위) [기본]</option>
            <option value="random_active" ${metrixPolicyState.q44_investPlanMode === 'random_active' ? 'selected' : ''}>2~8번 투자·확장 항목 중 랜덤 (1번 제외)</option>
            <option value="1_none" ${metrixPolicyState.q44_investPlanMode === '1_none' ? 'selected' : ''}>1. 투자/확장 계획 없음 100% 고정</option>
          </select>
        </div>

        <!-- 15. 문60 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(56,189,248,0.35);">
          <label class="figma-label font-bold" style="color:#38bdf8;">문60 경기신용보증재단 인지도 (보증지원 O/X 연동)</label>
          <select id="sel-metrix-q60-rule" class="figma-select w-full">
            <option value="guarantee_sync" ${metrixPolicyState.q60_awarenessRule === 'guarantee_sync' ? 'selected' : ''}>🛡️ 보증지원 O 업체 ➔ 3, 4번 랜덤 / 그 외(X) ➔ 1, 2번 랜덤 [기본]</option>
            <option value="random_all" ${metrixPolicyState.q60_awarenessRule === 'random_all' ? 'selected' : ''}>보증지원 무관 1~4번 전체 랜덤</option>
            <option value="3" ${metrixPolicyState.q60_awarenessRule === '3' ? 'selected' : ''}>전체 3. 어느 정도 알고 있다 고정</option>
            <option value="2" ${metrixPolicyState.q60_awarenessRule === '2' ? 'selected' : ''}>전체 2. 거의 모른다 고정</option>
          </select>
        </div>

        <!-- 16. 문66-1 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문66-1 타 기관 소상공인 지원사업 인지 경로</label>
          <select id="sel-metrix-q66-1-mode" class="figma-select w-full">
            <option value="random" ${metrixPolicyState.q66_1_otherOrgRouteMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~7번 중 무작위 선택, 기타 제외) [기본]</option>
            <option value="1" ${metrixPolicyState.q66_1_otherOrgRouteMode === '1' ? 'selected' : ''}>1. 홈페이지(정부부처, 경기도 등) 고정</option>
            <option value="2" ${metrixPolicyState.q66_1_otherOrgRouteMode === '2' ? 'selected' : ''}>2. 주변 사람 소개 고정</option>
            <option value="5" ${metrixPolicyState.q66_1_otherOrgRouteMode === '5' ? 'selected' : ''}>5. 온라인 광고(SNS, 블로그 등) 고정</option>
          </select>
        </div>

        <!-- 17. 문67 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문67 가장 필요한 경기도 지원사업 (1·2·3순위)</label>
          <select id="sel-metrix-q67-mode" class="figma-select w-full mb-6">
            <option value="random" ${metrixPolicyState.q67_desiredSupportMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~10번 중 1·2·3순위 무작위, 기타 제외) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q67_desiredSupportMode === 'fixed' ? 'selected' : ''}>파트 H 지정 1·2순위 + 아래 3순위 고정 적용</option>
          </select>
          <div>
            <span class="font-caption text-dim">고정 모드 시 3순위 지원사업</span>
            <select id="sel-metrix-support-rank3" class="figma-select w-full">
              <option value="9" ${metrixPolicyState.desired_support_rank3 === '9' ? 'selected' : ''}>9. 금융지원</option>
              <option value="10" ${metrixPolicyState.desired_support_rank3 === '10' ? 'selected' : ''}>10. 세제지원</option>
              <option value="5" ${metrixPolicyState.desired_support_rank3 === '5' ? 'selected' : ''}>5. 점포개선</option>
              <option value="4" ${metrixPolicyState.desired_support_rank3 === '4' ? 'selected' : ''}>4. 디지털전환</option>
              <option value="8" ${metrixPolicyState.desired_support_rank3 === '8' ? 'selected' : ''}>8. 고용지원</option>
            </select>
          </div>
        </div>

        <!-- 18. 문68 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.2);">
          <label class="figma-label font-bold" style="color:#34d399;">문68 경영 영향 주요 정책·환경 이슈 (1·2·3순위)</label>
          <select id="sel-metrix-q68-mode" class="figma-select w-full mb-6">
            <option value="random" ${metrixPolicyState.q68_policyIssueMode === 'random' ? 'selected' : ''}>🎲 랜덤 응답 (1~11번 중 1·2·3순위 무작위, 기타 제외) [기본]</option>
            <option value="fixed" ${metrixPolicyState.q68_policyIssueMode === 'fixed' ? 'selected' : ''}>아래 지정 1·2·3순위 고정 적용</option>
          </select>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            <select id="sel-metrix-issue-rank1" class="figma-select w-full" title="문68 고정 시 1순위">
              <option value="6" ${metrixPolicyState.policy_issue_rank1 === '6' ? 'selected' : ''}>1순위: 6.최저임금</option>
              <option value="8" ${metrixPolicyState.policy_issue_rank1 === '8' ? 'selected' : ''}>1순위: 8.임대료</option>
              <option value="4" ${metrixPolicyState.policy_issue_rank1 === '4' ? 'selected' : ''}>1순위: 4.금리인상</option>
              <option value="5" ${metrixPolicyState.policy_issue_rank1 === '5' ? 'selected' : ''}>1순위: 5.고유가</option>
            </select>
            <select id="sel-metrix-issue-rank2" class="figma-select w-full" title="문68 고정 시 2순위">
              <option value="8" ${metrixPolicyState.policy_issue_rank2 === '8' ? 'selected' : ''}>2순위: 8.임대료</option>
              <option value="6" ${metrixPolicyState.policy_issue_rank2 === '6' ? 'selected' : ''}>2순위: 6.최저임금</option>
              <option value="9" ${metrixPolicyState.policy_issue_rank2 === '9' ? 'selected' : ''}>2순위: 9.상권쇠퇴</option>
              <option value="10" ${metrixPolicyState.policy_issue_rank2 === '10' ? 'selected' : ''}>2순위: 10.유통변화</option>
            </select>
            <select id="sel-metrix-issue-rank3" class="figma-select w-full" title="문68 고정 시 3순위">
              <option value="5" ${metrixPolicyState.policy_issue_rank3 === '5' ? 'selected' : ''}>3순위: 5.고유가</option>
              <option value="4" ${metrixPolicyState.policy_issue_rank3 === '4' ? 'selected' : ''}>3순위: 4.금리인상</option>
              <option value="9" ${metrixPolicyState.policy_issue_rank3 === '9' ? 'selected' : ''}>3순위: 9.상권쇠퇴</option>
              <option value="7" ${metrixPolicyState.policy_issue_rank3 === '7' ? 'selected' : ''}>3순위: 7.인구감소</option>
            </select>
          </div>
        </div>

        <!-- 19. 문69 (제조업 추가문항) -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(250,204,21,0.35);">
          <label class="figma-label font-bold" style="color:#facc15;">문69~ [1.제조업 전용] 추가문항 응답 규칙</label>
          <select id="sel-metrix-q69-mfg-rule" class="figma-select w-full">
            <option value="all_no" ${metrixPolicyState.q69_mfgAddRule === 'all_no' ? 'selected' : ''}>🏭 모두 '아니오 / 없음' 응답 (문69·70·71·72·83·90·92 일괄 아니오) [기본]</option>
            <option value="panel_or_custom" ${metrixPolicyState.q69_mfgAddRule === 'panel_or_custom' ? 'selected' : ''}>일반 기본 응답 로직 적용</option>
          </select>
        </div>

        <!-- 20. CHECK1 사진 업로드 문항 -->
        <div style="padding:10px 12px; border-radius:8px; background:rgba(15,23,42,0.55); border:1px solid rgba(248,113,113,0.4);">
          <label class="figma-label font-bold" style="color:#f87171;">CHECK1 간판·명함 사진 넣는 문항 처리 방식</label>
          <select id="sel-metrix-check1-upload-mode" class="figma-select w-full">
            <option value="skip_upload" ${metrixPolicyState.check1_photoUploadMode === 'skip_upload' ? 'selected' : ''}>🚫 아무것도 업로드하지 말고 바로 [다음] 누르기 [기본]</option>
            <option value="upload_sample" ${metrixPolicyState.check1_photoUploadMode === 'upload_sample' ? 'selected' : ''}>견본 이미지(sample_metrix_sign.png) 업로드 후 [다음] 누르기</option>
          </select>
        </div>
      </div>
    </section>
    ` : ''}
    ${isSeoulPanel ? `
    <!-- 서울시 5차 전용 카드: 5차 신규 문항 M(경영위기) · N(AI/디지털) · O(탄소중립) 가이드 -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-sparkles"></i> 5차 신규 (M·N·O)</span>
          <h3 class="blueprint-stage-title">[5차 신규 파트] M. 경영위기 및 대응 (svyA099~101) · N. AI 및 디지털 전환 (svyA102~109) · O. 탄소중립 녹색경영 (svyA110~113)</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 5차 전용 빈칸 자동완성</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        4차년도까지 없었던 5차 조사 신규 추가 문항(<code>M1~M3</code> 순위형, <code>N1~N6_1</code> 디지털·AI 활용 및 지원정책, <code>O1~O4</code> 기후변화·탄소중립 체감도)의 기본 응답 가이드를 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">M1~M2 경영위기 요인 및 최우선 대응방안 (1~3순위)</label>
            <select id="sel-seoul-m1-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.seoul_m1_rank1 === '1' ? 'selected' : ''}>1순위: 원부자재·공공요금·인건비 상승 / 마케팅·고정비 절감 (기본값)</option>
              <option value="2" ${metrixPolicyState.seoul_m1_rank1 === '2' ? 'selected' : ''}>1순위: 소비심리 위축 및 매출 감소 / 판로 다변화</option>
              <option value="3" ${metrixPolicyState.seoul_m1_rank1 === '3' ? 'selected' : ''}>1순위: 상권 침체 및 동종업종 경쟁 심화</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">M3 경영위기 극복을 위한 서울시 희망 지원정책 (1~3순위)</label>
            <select id="sel-seoul-m3-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.seoul_m3_rank1 === '1' ? 'selected' : ''}>1순위: 저금리 경영안정자금·특례보증 지원 및 임대료·공공요금 완화 (기본값)</option>
              <option value="2" ${metrixPolicyState.seoul_m3_rank1 === '2' ? 'selected' : ''}>1순위: 소비촉진 쿠폰·지역사랑상품권 발행 확대</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col">
          <div>
            <label class="figma-label font-bold">N1~N6_1 디지털 기기 및 생성형 AI 활용 여부 (svyA102~109)</label>
            <select id="sel-seoul-n2-ai-adoption" class="figma-select w-full">
              <option value="all_2_unused" ${metrixPolicyState.seoul_n2_aiAdoption === 'all_2_unused' ? 'selected' : ''}>N1(3~4점 보통) · N2(AI 미활용=2 ➔ N3~N4 자동패스) · N5(3~4점) · N6(수혜없음=2) [권장]</option>
              <option value="partial_used" ${metrixPolicyState.seoul_n2_aiAdoption === 'partial_used' ? 'selected' : ''}>일부 디지털/온라인 마케팅 활용 중심</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">O1~O4 기후변화 체감 및 탄소중립·녹색경영 실천 (svyA110~113)</label>
            <select id="sel-seoul-o1-carbon" class="figma-select w-full">
              <option value="2_3_mixed" ${metrixPolicyState.seoul_o1_carbon === '2_3_mixed' ? 'selected' : ''}>O1~O4 2~3점 지그재그 자연 분산 (일자리·매출전환 직결성 낮음 & 고효율 기기·냉난방 절약 실천)</option>
              <option value="3_4_positive" ${metrixPolicyState.seoul_o1_carbon === '3_4_positive' ? 'selected' : ''}>3~4점 친환경·에너지 절약 적극 실천 중심</option>
            </select>
          </div>
        </div>
      </div>
    </section>
    ` : ''}

    <!-- 카드 1: [파트 A] 사업체 일반현황 및 대표자 인적사항 (A1 ~ A15) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-building-user"></i> A1~A15</span>
          <h3 class="blueprint-stage-title">[파트 A] 사업체 일반현황 및 대표자 인적사항</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-id-card"></i> AA1~AA15 매칭</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        Step 1~15의 사업체 기본정보(상호·사업자번호·업종·생산활동·프랜차이즈·면적·입지·개업연월·주소·대표자 출생연도·창업 전 지위) 응답 기준을 설정합니다.
      </div>
      <div class="p-14">
        <div class="assoc-rule-box mb-12">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-bind-address" class="assoc-rule-cb" ${metrixPolicyState.general_bindAddressReadonly !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">A10 사업장 주소(시/군·도로명·상세주소) Readonly 강제 바인딩</strong>
              <div class="assoc-rule-desc">
                <code>CITY</code>, <code>GU</code>, <code>DETAIL1</code>, <code>DETAIL2</code> 및 <code>AA14</code> 거주지 주소 인풋이 비어 있을 때 쿼터 주소(<code>AA10</code>)를 자동 주입합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="qb-grid-2col mb-12">
          <div>
            <label class="figma-label font-bold">A5 프랜차이즈 가맹 여부 (AA5)</label>
            <select id="sel-metrix-franchise-mode" class="figma-select w-full">
              <option value="panel_or_non_franchise" ${metrixPolicyState.general_franchiseMode === 'panel_or_non_franchise' ? 'selected' : ''}>패널 원본(AA5) 연동 · 미확인 시 비프랜차이즈(2)</option>
              <option value="2" ${metrixPolicyState.general_franchiseMode === '2' ? 'selected' : ''}>2. 비프랜차이즈 (단독 사업장)</option>
              <option value="1" ${metrixPolicyState.general_franchiseMode === '1' ? 'selected' : ''}>1. 프랜차이즈 가맹점</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">A6 사업장 전용면적 기본값 (AA6, 평)</label>
            <input type="number" id="num-metrix-area-pyeong" class="figma-input w-full" min="3" max="500" value="${metrixPolicyState.general_defaultAreaPyeong}" title="패널 원본 AA6 값이 있으면 AA6을 우선 사용하고, 없을 때 이 평수를 사용합니다." />
          </div>
        </div>
        <div class="qb-grid-2col mb-12">
          <div>
            <label class="figma-label font-bold">A7 사업장 입지 유형 (AA7)</label>
            <select id="sel-metrix-location-type" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.general_locationType === '1' ? 'selected' : ''}>1. 일반상가 / 독립점포 (패널 AA7 우선 연동)</option>
              <option value="2" ${metrixPolicyState.general_locationType === '2' ? 'selected' : ''}>2. 복합상가 / 집합건물·오피스텔</option>
              <option value="3" ${metrixPolicyState.general_locationType === '3' ? 'selected' : ''}>3. 전통시장 / 상점가·골목상권</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">A8 현 사업체 창업 형태 (AA8)</label>
            <select id="sel-metrix-founder-type" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.general_founderType === '1' ? 'selected' : ''}>1. 신규 창업 (패널 AA8 우선 연동)</option>
              <option value="2" ${metrixPolicyState.general_founderType === '2' ? 'selected' : ''}>2. 기존 사업장 인수 창업</option>
              <option value="6" ${metrixPolicyState.general_founderType === '6' ? 'selected' : ''}>6. 가업 승계 / 공동 창업</option>
            </select>
          </div>
        </div>
        <div>
          <label class="figma-label font-bold">A15 창업 직전 종사상 지위 (AA15)</label>
          <select id="sel-metrix-prev-status" class="figma-select w-full">
            <option value="1" ${metrixPolicyState.general_prevStatus === '1' ? 'selected' : ''}>1. 임금근로자 (회사원·직장인 - 패널 AA15 우선 연동)</option>
            <option value="2" ${metrixPolicyState.general_prevStatus === '2' ? 'selected' : ''}>2. 다른 자영업·소상공인 사업체 운영</option>
            <option value="3" ${metrixPolicyState.general_prevStatus === '3' ? 'selected' : ''}>3. 미취업 / 구직자 / 학생 / 전업주부</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 2: [파트 B] 영업 현황 및 디지털·온라인 전환 (문8 ~ 문9-2) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-clock"></i> 문8·문9</span>
          <h3 class="blueprint-stage-title">[파트 B] 영업시간 · 정기휴무 · 디지털/온라인 전환</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-laptop-code"></i> M8·M9 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문8 개점/폐점 시각·정기휴무 기준과 문9 온라인 판매·배달앱 활용 및 키오스크·테이블오더·POS 등 스마트기술 도입 현황을 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-12">
          <div>
            <label class="figma-label font-bold">개점 시각 (문8-1 / M8-1)</label>
            <select id="sel-metrix-open-hour" class="figma-select w-full">
              <option value="07" ${metrixPolicyState.operating_openHour === '07' ? 'selected' : ''}>07:00 (오전 7시)</option>
              <option value="08" ${metrixPolicyState.operating_openHour === '08' ? 'selected' : ''}>08:00 (오전 8시)</option>
              <option value="09" ${metrixPolicyState.operating_openHour === '09' ? 'selected' : ''}>09:00 (오전 9시 - 표준 기본값)</option>
              <option value="10" ${metrixPolicyState.operating_openHour === '10' ? 'selected' : ''}>10:00 (오전 10시)</option>
              <option value="11" ${metrixPolicyState.operating_openHour === '11' ? 'selected' : ''}>11:00 (오전 11시 - 외식업 등)</option>
              <option value="12" ${metrixPolicyState.operating_openHour === '12' ? 'selected' : ''}>12:00 (낮 12시)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">폐점 시각 (문8-1 / M8-1_1)</label>
            <select id="sel-metrix-close-hour" class="figma-select w-full">
              <option value="18" ${metrixPolicyState.operating_closeHour === '18' ? 'selected' : ''}>18:00 (오후 6시)</option>
              <option value="19" ${metrixPolicyState.operating_closeHour === '19' ? 'selected' : ''}>19:00 (오후 7시)</option>
              <option value="20" ${metrixPolicyState.operating_closeHour === '20' ? 'selected' : ''}>20:00 (오후 8시 - 표준 기본값)</option>
              <option value="21" ${metrixPolicyState.operating_closeHour === '21' ? 'selected' : ''}>21:00 (오후 9시)</option>
              <option value="22" ${metrixPolicyState.operating_closeHour === '22' ? 'selected' : ''}>22:00 (오후 10시)</option>
              <option value="23" ${metrixPolicyState.operating_closeHour === '23' ? 'selected' : ''}>23:00 (오후 11시)</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col mb-12">
          <div>
            <label class="figma-label font-bold">정기 휴무 빈도 (문8-2)</label>
            <select id="sel-metrix-closed-days" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.operating_closedDays === '1' ? 'selected' : ''}>주 1회 정기 휴무 (기본값)</option>
              <option value="2" ${metrixPolicyState.operating_closedDays === '2' ? 'selected' : ''}>격주 1회 / 주 2회 정기 휴무</option>
              <option value="3" ${metrixPolicyState.operating_closedDays === '3' ? 'selected' : ''}>월 1~2회 정기 휴무</option>
              <option value="0" ${metrixPolicyState.operating_closedDays === '0' ? 'selected' : ''}>연중무휴 (정기 휴무일 없음)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">정기 휴무 요일 (문8-2-1)</label>
            <select id="sel-metrix-closed-dow" class="figma-select w-full">
              <option value="7" ${metrixPolicyState.operating_closedDayOfWeek === '7' ? 'selected' : ''}>일요일 (기본값)</option>
              <option value="1" ${metrixPolicyState.operating_closedDayOfWeek === '1' ? 'selected' : ''}>월요일</option>
              <option value="2" ${metrixPolicyState.operating_closedDayOfWeek === '2' ? 'selected' : ''}>화요일</option>
              <option value="3" ${metrixPolicyState.operating_closedDayOfWeek === '3' ? 'selected' : ''}>수요일</option>
              <option value="6" ${metrixPolicyState.operating_closedDayOfWeek === '6' ? 'selected' : ''}>토요일</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col">
          <div>
            <label class="figma-label font-bold">문9 온라인 판매·배달앱·플랫폼 활용 (M9)</label>
            <select id="sel-metrix-digital-online" class="figma-select w-full">
              <option value="panel_or_no" ${metrixPolicyState.digital_onlineSales === 'panel_or_no' ? 'selected' : ''}>패널 원본(M9) 연동 · 미확인 시 미활용(2)</option>
              <option value="2" ${metrixPolicyState.digital_onlineSales === '2' ? 'selected' : ''}>2. 활용하지 않음 (오프라인 매장 중심)</option>
              <option value="1" ${metrixPolicyState.digital_onlineSales === '1' ? 'selected' : ''}>1. 활용함 (배달앱·스마트스토어·온라인 거래)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문9-1·9-2 디지털기기·스마트기술 도입 (M9-1)</label>
            <select id="sel-metrix-digital-smart" class="figma-select w-full">
              <option value="panel_or_pos" ${metrixPolicyState.digital_smartTech === 'panel_or_pos' ? 'selected' : ''}>패널 원본(M9-1) 연동 · POS/결제단말 중심</option>
              <option value="active" ${metrixPolicyState.digital_smartTech === 'active' ? 'selected' : ''}>1. 도입·활용 중 (POS, 키오스크, 예약/고객관리)</option>
              <option value="none" ${metrixPolicyState.digital_smartTech === 'none' ? 'selected' : ''}>2. 도입하지 않음 (향후 필요 시 검토)</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 3: [파트 C] 경영실적 추세 · 6대 영업비용 밸런서 · 대표자 월소득 (문10 ~ 문13) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-chart-line"></i> 문10~문13</span>
          <h3 class="blueprint-stage-title">[파트 C] 경영실적 추세 · 6대 영업비용 · 대표자 소득</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-scale-balanced"></i> 6대 비용 합계 100%</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        전년도 패널 매출(<code>M11_1</code>)·영업비용(<code>M11_3</code>)·영업이익(<code>M11_5</code>)에 연동할 2025년 추세, 실적 변동 요인(1·2순위), 문11-1 6대 영업비용 구성비, 문13 대표자 월평균 순소득을 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">2024년 대비 2025년 매출·영업이익 추세 (문10, 문11)</label>
            <select id="sel-metrix-sales-trend" class="figma-select w-full">
              <option value="maintain" ${metrixPolicyState.sales_trend2025 === 'maintain' ? 'selected' : ''}>유지 (전년도 M11 실측치 수준 유지 - 기본값)</option>
              <option value="growth" ${metrixPolicyState.sales_trend2025 === 'growth' ? 'selected' : ''}>소폭 증가 (전년 대비 +5~10% 성장 산출)</option>
              <option value="decrease" ${metrixPolicyState.sales_trend2025 === 'decrease' ? 'selected' : ''}>소폭 감소 (전년 대비 -5~10% 감소 산출)</option>
              <option value="random" ${metrixPolicyState.sales_trend2025 === 'random' ? 'selected' : ''}>🎲 [유지 / 증가 / 감소 사업체별 자연 분산]</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문13 대표자 월평균 순소득 기본값 (M13, 만 원)</label>
            <input type="number" id="num-metrix-owner-income" class="figma-input w-full" min="0" max="5000" value="${metrixPolicyState.owner_monthlyIncome}" title="패널 M13 값이 존재하면 M13×추세율을 우선 적용하고, 미존재 시 이 금액을 사용합니다." />
          </div>
        </div>
        <div class="qb-grid-2col mb-12">
          <div>
            <span class="font-caption text-dim">문10-1·12-1 매출/수익 변동 요인 (1순위)</span>
            <select id="sel-metrix-sales-reason1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.sales_changeReasonRank1 === '1' ? 'selected' : ''}>1. 전반적 경기 변동 및 소비심리·고객수 변화</option>
              <option value="2" ${metrixPolicyState.sales_changeReasonRank1 === '2' ? 'selected' : ''}>2. 원재료비·상품매입 단가 변동</option>
              <option value="3" ${metrixPolicyState.sales_changeReasonRank1 === '3' ? 'selected' : ''}>3. 주변 상권 변화 및 동종업체 경쟁 심화</option>
              <option value="4" ${metrixPolicyState.sales_changeReasonRank1 === '4' ? 'selected' : ''}>4. 임차료·인건비·공공요금 등 고정비 부담</option>
              <option value="5" ${metrixPolicyState.sales_changeReasonRank1 === '5' ? 'selected' : ''}>5. 온라인 판로·마케팅·취급품목 변화</option>
            </select>
          </div>
          <div>
            <span class="font-caption text-dim">문10-1·12-1 매출/수익 변동 요인 (2순위)</span>
            <select id="sel-metrix-sales-reason2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.sales_changeReasonRank2 === '2' ? 'selected' : ''}>2. 원재료비·상품매입 단가 변동</option>
              <option value="1" ${metrixPolicyState.sales_changeReasonRank2 === '1' ? 'selected' : ''}>1. 전반적 경기 변동 및 소비심리·고객수 변화</option>
              <option value="3" ${metrixPolicyState.sales_changeReasonRank2 === '3' ? 'selected' : ''}>3. 주변 상권 변화 및 동종업체 경쟁 심화</option>
              <option value="4" ${metrixPolicyState.sales_changeReasonRank2 === '4' ? 'selected' : ''}>4. 임차료·인건비·공공요금 등 고정비 부담</option>
              <option value="5" ${metrixPolicyState.sales_changeReasonRank2 === '5' ? 'selected' : ''}>5. 온라인 판로·마케팅·취급품목 변화</option>
            </select>
          </div>
        </div>
        <label class="figma-label font-bold mb-6">문11-1 6대 영업비용 세부 항목 구성 비중 (합계 100%)</label>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;" class="mb-8">
          <div>
            <span class="font-caption text-dim">① 원재료·매입비 (%)</span>
            <input type="number" id="num-metrix-cost-mat" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_materialRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">② 인건비 (%)</span>
            <input type="number" id="num-metrix-cost-labor" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_laborRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">③ 사업장 임차료 (%)</span>
            <input type="number" id="num-metrix-cost-rent" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_rentRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">④ 세금·공과금 (%)</span>
            <input type="number" id="num-metrix-cost-tax" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_taxRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">⑤ 수수료·광고비 (%)</span>
            <input type="number" id="num-metrix-cost-fee" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_feeAdRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">⑥ 기타 비용 (%)</span>
            <input type="number" id="num-metrix-cost-other" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_otherRatio}" />
          </div>
        </div>
        <div class="flex-between">
          <span class="font-caption text-dim">6대 영업비용 합계:</span>
          <span id="badge-metrix-cost-total" class="badge-status ready"><i class="fa-solid fa-check"></i> 100% 매칭 완료</span>
        </div>
      </div>
    </section>

    <!-- 카드 4: [파트 D] 6대 결제수단 비중 & 부채·자금조달 구조 (문14 ~ 문15-3) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-credit-card"></i> 문14·문15~15-3</span>
          <h3 class="blueprint-stage-title">[파트 D] 6대 결제수단 비중 &amp; 부채·자금조달 구조</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-scale-balanced"></i> M14·M15·문15-3 보증연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문14 6대 결제수단 비중, 문15 부채 보유 여부·총액·차입처 비중(합계 100%)·차입 사유 1·2순위 및 <strong>문15-3 사업자금 조달 경로(엑셀 보증지원여부 O/X 정책자금 연동 선택가이드)</strong>를 설정합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold mb-6">문14 고객 결제수단 6대 비중 (M14 ~ M14_5, 합계 100%)</label>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;" class="mb-8">
          <div>
            <span class="font-caption text-dim">① 현금 (M14, %)</span>
            <input type="number" id="num-metrix-pay-cash" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_cashRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">② 신용·체크카드 (%)</span>
            <input type="number" id="num-metrix-pay-card" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_cardRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">③ 경기지역화폐 (%)</span>
            <input type="number" id="num-metrix-pay-local" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_localCurrencyRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">④ 간편결제·페이 (%)</span>
            <input type="number" id="num-metrix-pay-mobile" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_mobileRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">⑤ 상품권 (%)</span>
            <input type="number" id="num-metrix-pay-voucher" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_voucherRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">⑥ 계좌이체·세금계산서 (%)</span>
            <input type="number" id="num-metrix-pay-transfer" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_transferRatio}" />
          </div>
        </div>
        <div class="flex-between mb-10">
          <span class="font-caption text-dim">결제수단 합계 (패널 M14~M14_5 존재 시 우선 계승):</span>
          <span id="badge-metrix-pay-total" class="badge-status ready"><i class="fa-solid fa-check"></i> 100% 매칭 완료</span>
        </div>

        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문15 사업체 부채(대출) 보유 여부 (M15)</label>
            <select id="sel-metrix-debt-has" class="figma-select w-full">
              <option value="panel_or_no" ${metrixPolicyState.debt_hasDebt === 'panel_or_no' ? 'selected' : ''}>패널 원본(M15) 연동 · 미확인 시 부채 없음(2)</option>
              <option value="1" ${metrixPolicyState.debt_hasDebt === '1' ? 'selected' : ''}>1. 부채(대출금) 있음</option>
              <option value="2" ${metrixPolicyState.debt_hasDebt === '2' ? 'selected' : ''}>2. 부채(대출금) 없음</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문15-1 총 부채 잔액 기본값 (M15-1, 만 원)</label>
            <input type="number" id="num-metrix-debt-amount" class="figma-input w-full" min="0" value="${metrixPolicyState.debt_totalAmount}" title="패널 M15-1 값이 존재하면 우선 사용하고, 없을 때 이 금액을 사용합니다." />
          </div>
        </div>

        <label class="figma-label font-bold mb-6">문15-1 차입처별 대출 비중 (M15-1_1 ~ M15-1_5, 합계 100%)</label>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;" class="mb-8">
          <div>
            <span class="font-caption text-dim">제1금융(은행) (%)</span>
            <input type="number" id="num-metrix-debt-bank" class="figma-input w-full num-metrix-debt-ratio" min="0" max="100" value="${metrixPolicyState.debt_bankRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">제2금융권 (%)</span>
            <input type="number" id="num-metrix-debt-second" class="figma-input w-full num-metrix-debt-ratio" min="0" max="100" value="${metrixPolicyState.debt_secondTierRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">정책자금 (%)</span>
            <input type="number" id="num-metrix-debt-policy" class="figma-input w-full num-metrix-debt-ratio" min="0" max="100" value="${metrixPolicyState.debt_policyRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">기타/개인 (%)</span>
            <input type="number" id="num-metrix-debt-other" class="figma-input w-full num-metrix-debt-ratio" min="0" max="100" value="${metrixPolicyState.debt_otherRatio}" />
          </div>
        </div>
        <div class="flex-between mb-10">
          <span class="font-caption text-dim">차입처 비중 합계:</span>
          <span id="badge-metrix-debt-total" class="badge-status ready"><i class="fa-solid fa-check"></i> 100% 매칭 완료</span>
        </div>

        <label class="figma-label font-bold mb-6">문15-2 주된 대출/차입 사유 (1순위 · 2순위)</label>
        <div class="qb-grid-2col mb-12">
          <div>
            <span class="font-caption text-dim">1순위 사유 (M15-2)</span>
            <select id="sel-metrix-debt-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.debt_reasonRank1 === '1' ? 'selected' : ''}>1. 운전자금 (원재료 구입 및 경영비용 충당)</option>
              <option value="2" ${metrixPolicyState.debt_reasonRank1 === '2' ? 'selected' : ''}>2. 설비 및 시설 투자 (인테리어·기기 구입)</option>
              <option value="3" ${metrixPolicyState.debt_reasonRank1 === '3' ? 'selected' : ''}>3. 기존 대출금 상환 (대환대출·이자 상환)</option>
              <option value="4" ${metrixPolicyState.debt_reasonRank1 === '4' ? 'selected' : ''}>4. 임차보증금 및 월세 납부</option>
              <option value="5" ${metrixPolicyState.debt_reasonRank1 === '5' ? 'selected' : ''}>5. 인건비 지급</option>
              <option value="6" ${metrixPolicyState.debt_reasonRank1 === '6' ? 'selected' : ''}>6. 창업 및 사업장 인수 자금</option>
              <option value="7" ${metrixPolicyState.debt_reasonRank1 === '7' ? 'selected' : ''}>7. 기타 가계·경영 겸용 자금</option>
            </select>
          </div>
          <div>
            <span class="font-caption text-dim">2순위 사유 (M15-2_1)</span>
            <select id="sel-metrix-debt-rank2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.debt_reasonRank2 === '2' ? 'selected' : ''}>2. 설비 및 시설 투자 (인테리어·기기 구입)</option>
              <option value="1" ${metrixPolicyState.debt_reasonRank2 === '1' ? 'selected' : ''}>1. 운전자금 (원재료 구입 및 경영비용 충당)</option>
              <option value="3" ${metrixPolicyState.debt_reasonRank2 === '3' ? 'selected' : ''}>3. 기존 대출금 상환 (대환대출·이자 상환)</option>
              <option value="4" ${metrixPolicyState.debt_reasonRank2 === '4' ? 'selected' : ''}>4. 임차보증금 및 월세 납부</option>
              <option value="5" ${metrixPolicyState.debt_reasonRank2 === '5' ? 'selected' : ''}>5. 인건비 지급</option>
              <option value="6" ${metrixPolicyState.debt_reasonRank2 === '6' ? 'selected' : ''}>6. 창업 및 사업장 인수 자금</option>
              <option value="7" ${metrixPolicyState.debt_reasonRank2 === '7' ? 'selected' : ''}>7. 기타 가계·경영 겸용 자금</option>
            </select>
          </div>
        </div>

        <div style="padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.4); background: rgba(15, 23, 42, 0.6);">
          <label class="figma-label font-bold mb-6" style="color: #38bdf8;">
            <i class="fa-solid fa-file-shield"></i> 문15-3 최근 1년간 사업자금을 조달한 경로 — 엑셀 [보증지원여부] O/X 선택가이드
          </label>
          <div class="font-caption text-dim mb-8" style="line-height: 1.45;">
            쿼터 엑셀(구글 시트)의 <code>보증지원여부</code> 값이 <strong>O</strong>이면 <strong>④ 정책자금(중소벤처기업진흥공단 등)</strong>을 체크하고, <strong>X</strong>이면 <strong>④ 정책자금을 절대 체크하지 않도록</strong> 제어합니다.
          </div>
          <div class="qb-grid-2col">
            <div>
              <span class="font-caption text-dim">보증지원여부(O/X) 연동 규칙</span>
              <select id="sel-metrix-funding-guarantee-rule" class="figma-select w-full">
                <option value="excel_sync" ${metrixPolicyState.funding_guaranteeRule === 'excel_sync' ? 'selected' : ''}>[필수 권장] 엑셀 보증지원 O ➔ ④ 정책자금 체크 / X ➔ 정책자금 미체크</option>
                <option value="excel_sync_with_bank" ${metrixPolicyState.funding_guaranteeRule === 'excel_sync_with_bank' ? 'selected' : ''}>엑셀 보증지원 O ➔ ① 시중은행 + ④ 정책자금 복수 체크 / X ➔ 정책자금 미체크</option>
                <option value="force_policy" ${metrixPolicyState.funding_guaranteeRule === 'force_policy' ? 'selected' : ''}>전체 ④ 정책자금(중소벤처기업진흥공단 등) 체크</option>
                <option value="force_no_policy" ${metrixPolicyState.funding_guaranteeRule === 'force_no_policy' ? 'selected' : ''}>전체 ④ 정책자금 체크 제외 (비정책자금만 선택)</option>
              </select>
            </div>
            <div>
              <span class="font-caption text-dim">보증지원여부 X일 때 대체 선택지 (④ 정책자금 제외)</span>
              <select id="sel-metrix-funding-when-x" class="figma-select w-full">
                <option value="1" ${metrixPolicyState.funding_whenGuaranteeX === '1' ? 'selected' : ''}>1. 시중은행(일반대출) 체크 — 정책자금 미체크 (기본값)</option>
                <option value="2" ${metrixPolicyState.funding_whenGuaranteeX === '2' ? 'selected' : ''}>2. 인터넷은행(카카오뱅크·케이뱅크 등) 체크 — 정책자금 미체크</option>
                <option value="3" ${metrixPolicyState.funding_whenGuaranteeX === '3' ? 'selected' : ''}>3. 제2금융권(저축은행·캐피탈 등) 체크 — 정책자금 미체크</option>
                <option value="6" ${metrixPolicyState.funding_whenGuaranteeX === '6' ? 'selected' : ''}>6. 자금조달 없음 체크 — 정책자금 미체크</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 5: [파트 E] 사업장 임대차 · 계약기간 · 권리금 현황 (문16 ~ 문18) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-shop"></i> 문16~문18</span>
          <h3 class="blueprint-stage-title">[파트 E] 사업장 임대차 · 계약기간 · 권리금 현황</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-file-contract"></i> M16~M18 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문16 사업장 점유 형태·보증금·월세·임차 계약기간과 문17~문18 권리금 유무·권리금 금액·향후 회수 가능성 전망을 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문16 사업장 점유 형태 (M16 / M16-1)</label>
            <select id="sel-metrix-lease-type" class="figma-select w-full">
              <option value="monthly_deposit" ${metrixPolicyState.lease_type === 'monthly_deposit' ? 'selected' : ''}>보증부 월세 (패널 M16 우선 연동 - 기본값)</option>
              <option value="own" ${metrixPolicyState.lease_type === 'own' ? 'selected' : ''}>자가 (대표자 본인 또는 가족 소유)</option>
              <option value="jeonse" ${metrixPolicyState.lease_type === 'jeonse' ? 'selected' : ''}>전세 (보증금만 있음)</option>
              <option value="free" ${metrixPolicyState.lease_type === 'free' ? 'selected' : ''}>무상 사용</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문16-3 총 임차 계약·영업 기간 (M16-3, 년)</label>
            <input type="number" id="num-metrix-lease-years" class="figma-input w-full" min="1" max="40" value="${metrixPolicyState.lease_contractYears}" />
          </div>
        </div>
        <div class="qb-grid-2col mb-10">
          <div>
            <span class="font-caption text-dim">문16-1 보증금 기본값 (M16-1_1, 만 원)</span>
            <input type="number" id="num-metrix-lease-deposit" class="figma-input w-full" min="0" value="${metrixPolicyState.lease_deposit}" />
          </div>
          <div>
            <span class="font-caption text-dim">문16-1 월세 기본값 (M16-1_2, 만 원)</span>
            <input type="number" id="num-metrix-lease-rent" class="figma-input w-full" min="0" value="${metrixPolicyState.lease_monthlyRent}" />
          </div>
        </div>
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문17 사업장 권리금 유무 (M17)</label>
            <select id="sel-metrix-goodwill-has" class="figma-select w-full">
              <option value="panel_or_no" ${metrixPolicyState.goodwill_hasGoodwill === 'panel_or_no' ? 'selected' : ''}>패널 원본(M17) 연동 · 미확인 시 없음(2)</option>
              <option value="1" ${metrixPolicyState.goodwill_hasGoodwill === '1' ? 'selected' : ''}>1. 권리금 있음 (지불했거나 형성됨)</option>
              <option value="2" ${metrixPolicyState.goodwill_hasGoodwill === '2' ? 'selected' : ''}>2. 권리금 없음</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문17-1 권리금 금액 기본값 (M17-1, 만 원)</label>
            <input type="number" id="num-metrix-goodwill-amount" class="figma-input w-full" min="0" value="${metrixPolicyState.goodwill_amount}" />
          </div>
        </div>
        <div>
          <label class="figma-label font-bold">문18 향후 권리금 회수 가능성 전망 (M18)</label>
          <select id="sel-metrix-goodwill-expect" class="figma-select w-full">
            <option value="2" ${metrixPolicyState.goodwill_recoveryExpect === '2' ? 'selected' : ''}>2. 일부 회수 가능 / 보통 수준 (패널 M18 우선 연동)</option>
            <option value="1" ${metrixPolicyState.goodwill_recoveryExpect === '1' ? 'selected' : ''}>1. 전액 또는 대부분 회수 가능</option>
            <option value="3" ${metrixPolicyState.goodwill_recoveryExpect === '3' ? 'selected' : ''}>3. 회수하기 어려움</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 6: [파트 F] 창업 준비 · 경영 애로사항 · 상권 경쟁 · 향후 계획 (문19 ~ 문29) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-compass"></i> 문19~문29</span>
          <h3 class="blueprint-stage-title">[파트 F] 경영 애로사항 · 상권 경쟁 · 향후 사업계획</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> M19~M29 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문19~문21 창업/인수 시기(<code>M19_1~2</code> 자동 매핑), 문22 경영 애로사항 1·2순위, 문24 상권 경쟁 체감도, 문26~문29 향후 사업 지속 의향 및 전환/폐업 시 계획을 설정합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold mb-6">문22 현재 경영상 가장 큰 애로사항 (1순위 · 2순위)</label>
        <div class="qb-grid-2col mb-10">
          <div>
            <span class="font-caption text-dim">1순위 애로사항 (M22)</span>
            <select id="sel-metrix-hardship-rank1" class="figma-select w-full">
              <option value="3" ${metrixPolicyState.hardship_rank1 === '3' ? 'selected' : ''}>3. 원재료비·물품매입비 상승 (기본값)</option>
              <option value="7" ${metrixPolicyState.hardship_rank1 === '7' ? 'selected' : ''}>7. 전반적 경기침체 및 소비심리 위축</option>
              <option value="1" ${metrixPolicyState.hardship_rank1 === '1' ? 'selected' : ''}>1. 상권 쇠퇴 및 유동인구 감소</option>
              <option value="2" ${metrixPolicyState.hardship_rank1 === '2' ? 'selected' : ''}>2. 동종업종 증가 및 과당 경쟁</option>
              <option value="4" ${metrixPolicyState.hardship_rank1 === '4' ? 'selected' : ''}>4. 인건비 상승 및 구인난</option>
              <option value="5" ${metrixPolicyState.hardship_rank1 === '5' ? 'selected' : ''}>5. 임차료(월세) 및 관리비·공과금 부담</option>
              <option value="6" ${metrixPolicyState.hardship_rank1 === '6' ? 'selected' : ''}>6. 자금 조달 및 대출 금리 부담</option>
              <option value="8" ${metrixPolicyState.hardship_rank1 === '8' ? 'selected' : ''}>8. 판로 개척 및 홍보·마케팅 부족</option>
            </select>
          </div>
          <div>
            <span class="font-caption text-dim">2순위 애로사항 (M22_1)</span>
            <select id="sel-metrix-hardship-rank2" class="figma-select w-full">
              <option value="7" ${metrixPolicyState.hardship_rank2 === '7' ? 'selected' : ''}>7. 전반적 경기침체 및 소비심리 위축 (기본값)</option>
              <option value="3" ${metrixPolicyState.hardship_rank2 === '3' ? 'selected' : ''}>3. 원재료비·물품매입비 상승</option>
              <option value="1" ${metrixPolicyState.hardship_rank2 === '1' ? 'selected' : ''}>1. 상권 쇠퇴 및 유동인구 감소</option>
              <option value="2" ${metrixPolicyState.hardship_rank2 === '2' ? 'selected' : ''}>2. 동종업종 증가 및 과당 경쟁</option>
              <option value="4" ${metrixPolicyState.hardship_rank2 === '4' ? 'selected' : ''}>4. 인건비 상승 및 구인난</option>
              <option value="5" ${metrixPolicyState.hardship_rank2 === '5' ? 'selected' : ''}>5. 임차료(월세) 및 관리비·공과금 부담</option>
              <option value="6" ${metrixPolicyState.hardship_rank2 === '6' ? 'selected' : ''}>6. 자금 조달 및 대출 금리 부담</option>
              <option value="8" ${metrixPolicyState.hardship_rank2 === '8' ? 'selected' : ''}>8. 판로 개척 및 홍보·마케팅 부족</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문24 주변 상권 경쟁 및 경영환경 체감 (M24)</label>
            <select id="sel-metrix-competition-level" class="figma-select w-full">
              <option value="5" ${metrixPolicyState.market_competitionLevel === '5' ? 'selected' : ''}>5점. 경쟁이 다소 심화됨 (패널 M24 우선 연동)</option>
              <option value="4" ${metrixPolicyState.market_competitionLevel === '4' ? 'selected' : ''}>4점. 보통 수준임</option>
              <option value="6" ${metrixPolicyState.market_competitionLevel === '6' ? 'selected' : ''}>6점. 경쟁이 매우 치열함</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문26 향후 1~3년 내 사업 지속 의향 (M26)</label>
            <select id="sel-metrix-future-plan" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.future_businessPlan === '1' ? 'selected' : ''}>1. 현재 사업 계속 유지·운영 (패널 M26 연동)</option>
              <option value="2" ${metrixPolicyState.future_businessPlan === '2' ? 'selected' : ''}>2. 업종 전환·사업장 이전 또는 폐업 고려</option>
            </select>
          </div>
        </div>
        <div>
          <label class="figma-label font-bold">문27~문29 전환·폐업 고려 시 사유 및 향후 계획 (M27~M29)</label>
          <select id="sel-metrix-future-reemp" class="figma-select w-full">
            <option value="2" ${metrixPolicyState.future_reemploymentPlan === '2' ? 'selected' : ''}>매출·수익 감소 사유 / 향후 임금근로자 취업 또는 재창업 검토 (패널 M27~29 연동)</option>
            <option value="1" ${metrixPolicyState.future_reemploymentPlan === '1' ? 'selected' : ''}>타 유망 업종으로 재창업 희망</option>
            <option value="3" ${metrixPolicyState.future_reemploymentPlan === '3' ? 'selected' : ''}>건강·고령 등으로 은퇴 및 휴식 희망</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 7: [파트 G] 고용 인력 · 주당 근무시간 · 4대보험 · 평균 급여 (문31 ~ 문39) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-users-gear"></i> 문31~문39</span>
          <h3 class="blueprint-stage-title">[파트 G] 고용 인력 · 주당 근무시간 · 4대보험 · 급여</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-user-clock"></i> M31~M39 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문31 종사자 구성(대표자·무급가족·상용·임시일용직), 문32 주당 평균 근무시간 및 4대보험 가입 현황, 문34 근로자 월평균 급여, 문37~문39 구인 애로사항을 설정합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold mb-6">문31 종사자 유형별 인원 기준 (패널 M31~M31_5 존재 시 우선 연동)</label>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;" class="mb-10">
          <div>
            <span class="font-caption text-dim">대표자(M31_1)</span>
            <input type="number" id="num-metrix-emp-owner" class="figma-input w-full" min="1" max="2" value="${metrixPolicyState.employee_owner}" />
          </div>
          <div>
            <span class="font-caption text-dim">무급가족(M31_2)</span>
            <input type="number" id="num-metrix-emp-family" class="figma-input w-full" min="0" max="10" value="${metrixPolicyState.employee_family}" />
          </div>
          <div>
            <span class="font-caption text-dim">상용직(M31_3)</span>
            <input type="number" id="num-metrix-emp-regular" class="figma-input w-full" min="0" max="30" value="${metrixPolicyState.employee_regular}" />
          </div>
          <div>
            <span class="font-caption text-dim">임시·일용(M31_4)</span>
            <input type="number" id="num-metrix-emp-temp" class="figma-input w-full" min="0" max="30" value="${metrixPolicyState.employee_temp}" />
          </div>
        </div>
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문32 대표자 주평균 근무시간 (M32, 시간)</label>
            <input type="number" id="num-metrix-owner-hours" class="figma-input w-full" min="10" max="100" value="${metrixPolicyState.labor_ownerWeeklyHours}" />
          </div>
          <div>
            <label class="figma-label font-bold">문32_6 근로자 주평균 근무시간 (M32_6, 시간)</label>
            <input type="number" id="num-metrix-staff-hours" class="figma-input w-full" min="10" max="80" value="${metrixPolicyState.labor_staffWeeklyHours}" />
          </div>
        </div>
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문32_1~4 4대보험 가입 현황 (M32_1~10)</label>
            <select id="sel-metrix-insurance-mode" class="figma-select w-full">
              <option value="panel_or_standard" ${metrixPolicyState.labor_insuranceMode === 'panel_or_standard' ? 'selected' : ''}>패널 원본(M32_1~10) 연동 · 고용·산재 표준 가입</option>
              <option value="all_joined" ${metrixPolicyState.labor_insuranceMode === 'all_joined' ? 'selected' : ''}>1. 4대보험 전체 가입 (고용·산재·국민·건강)</option>
              <option value="none" ${metrixPolicyState.labor_insuranceMode === 'none' ? 'selected' : ''}>2. 미가입 (1인 자영업·가족종사 중심)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문34 근로자 1인당 월평균 급여 (M34, 만 원)</label>
            <input type="number" id="num-metrix-avg-wage" class="figma-input w-full" min="50" max="1000" value="${metrixPolicyState.labor_avgMonthlyWage}" />
          </div>
        </div>
        <div>
          <label class="figma-label font-bold">문37~문39 구인 애로사항 및 채용 계획 (M37~M39)</label>
          <select id="sel-metrix-hiring-diff" class="figma-select w-full">
            <option value="3" ${metrixPolicyState.labor_hiringDifficulty === '3' ? 'selected' : ''}>3. 인건비 부담 등으로 추가 채용계획 없음 (패널 M37 우선 연동)</option>
            <option value="2" ${metrixPolicyState.labor_hiringDifficulty === '2' ? 'selected' : ''}>2. 직무에 적합한 숙련·경력 지원자 부족</option>
            <option value="1" ${metrixPolicyState.labor_hiringDifficulty === '1' ? 'selected' : ''}>1. 구직 지원자 자체가 부족함</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 8: [파트 H] 경기도 지원정책 수혜경험 · 만족도 · 희망 지원사업 (문50 ~ 문67) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-thumbs-up"></i> 문50~문67</span>
          <h3 class="blueprint-stage-title">[파트 H] 지원정책 수혜경험 · 만족도 · 희망 지원사업</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> M62·문67 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문50~문62 경기도/정부 소상공인 지원정책 수혜 여부, 문50~문66 5점 척도 만족도 가중치, 문67 향후 경기도 최우선 확대 희망 지원사업(상단 제어판에서 무작위 1~3순위 기본 적용 · 고정 모드 시 아래 순위 참조)을 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-10">
          <div>
            <label class="figma-label font-bold">문50~문62 소상공인 지원사업 수혜 경험 (M62)</label>
            <select id="sel-metrix-policy-exp" class="figma-select w-full">
              <option value="panel_or_no" ${metrixPolicyState.policy_experienceMode === 'panel_or_no' ? 'selected' : ''}>패널 원본(M62) 연동 · 미확인 시 수혜없음(2)</option>
              <option value="2" ${metrixPolicyState.policy_experienceMode === '2' ? 'selected' : ''}>2. 수혜 경험 없음 (인지 여부만 응답)</option>
              <option value="1" ${metrixPolicyState.policy_experienceMode === '1' ? 'selected' : ''}>1. 수혜 경험 있음 (수혜연도 2023~2024 연동)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문50~문66 5점 척도 만족도·체감도 가중치</label>
            <select id="sel-metrix-satisfaction-mode" class="figma-select w-full">
              <option value="mixed_3_4" ${metrixPolicyState.satisfaction_mode === 'mixed_3_4' ? 'selected' : ''}>3~4점 자연 혼합 분산 [보통 및 만족 - 권장 기본값]</option>
              <option value="neutral_3" ${metrixPolicyState.satisfaction_mode === 'neutral_3' ? 'selected' : ''}>3점 보통 중심 (현실적 중립 평가)</option>
              <option value="positive_4_5" ${metrixPolicyState.satisfaction_mode === 'positive_4_5' ? 'selected' : ''}>4~5점 긍정적 평가 (만족 및 매우만족)</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col">
          <div>
            <label class="figma-label font-bold">문67 고정 모드용 1순위 (랜덤 모드 시 자동 무작위)</label>
            <select id="sel-metrix-support-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.desired_support_rank1 === '1' ? 'selected' : ''}>1. 자금지원 (저금리 대출·특례보증 확대 - 기본값)</option>
              <option value="2" ${metrixPolicyState.desired_support_rank1 === '2' ? 'selected' : ''}>2. 경영환경개선 (점포 시설개보수·간판·위생)</option>
              <option value="3" ${metrixPolicyState.desired_support_rank1 === '3' ? 'selected' : ''}>3. 판로개척 및 온라인·배달앱 수수료 지원</option>
              <option value="4" ${metrixPolicyState.desired_support_rank1 === '4' ? 'selected' : ''}>4. 세무·노무·법률 컨설팅 및 경영교육 지원</option>
              <option value="5" ${metrixPolicyState.desired_support_rank1 === '5' ? 'selected' : ''}>5. 경기지역화폐 발행 확대 및 소비촉진 지원</option>
              <option value="6" ${metrixPolicyState.desired_support_rank1 === '6' ? 'selected' : ''}>6. 공공요금·임차료·대출이자 차액 보전 지원</option>
              <option value="7" ${metrixPolicyState.desired_support_rank1 === '7' ? 'selected' : ''}>7. 인력 채용 및 인건비·4대보험료 지원</option>
              <option value="8" ${metrixPolicyState.desired_support_rank1 === '8' ? 'selected' : ''}>8. 폐업·업종전환·재창업 안전망 지원</option>
              <option value="9" ${metrixPolicyState.desired_support_rank1 === '9' ? 'selected' : ''}>9. 협업화·조직화 지원</option>
              <option value="10" ${metrixPolicyState.desired_support_rank1 === '10' ? 'selected' : ''}>10. 디지털 전환 지원</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문67 고정 모드용 2순위 (랜덤 모드 시 자동 무작위)</label>
            <select id="sel-metrix-support-rank2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.desired_support_rank2 === '2' ? 'selected' : ''}>2. 경영환경개선 (점포 시설개보수·간판 - 기본값)</option>
              <option value="1" ${metrixPolicyState.desired_support_rank2 === '1' ? 'selected' : ''}>1. 자금지원 (저금리 대출·특례보증 확대)</option>
              <option value="3" ${metrixPolicyState.desired_support_rank2 === '3' ? 'selected' : ''}>3. 판로개척 및 온라인·배달앱 수수료 지원</option>
              <option value="4" ${metrixPolicyState.desired_support_rank2 === '4' ? 'selected' : ''}>4. 세무·노무·법률 컨설팅 및 경영교육 지원</option>
              <option value="5" ${metrixPolicyState.desired_support_rank2 === '5' ? 'selected' : ''}>5. 경기지역화폐 발행 확대 및 소비촉진 지원</option>
              <option value="6" ${metrixPolicyState.desired_support_rank2 === '6' ? 'selected' : ''}>6. 공공요금·임차료·대출이자 차액 보전 지원</option>
              <option value="7" ${metrixPolicyState.desired_support_rank2 === '7' ? 'selected' : ''}>7. 인력 채용 및 인건비·4대보험료 지원</option>
              <option value="8" ${metrixPolicyState.desired_support_rank2 === '8' ? 'selected' : ''}>8. 폐업·업종전환·재창업 안전망 지원</option>
              <option value="9" ${metrixPolicyState.desired_support_rank2 === '9' ? 'selected' : ''}>9. 협업화·조직화 지원</option>
              <option value="10" ${metrixPolicyState.desired_support_rank2 === '10' ? 'selected' : ''}>10. 디지털 전환 지원</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 9: [파트 I] 주관식 코멘트 & 증빙 서류 (전폭) -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-pen-nib"></i> 주관식 &amp; 증빙</span>
          <h3 class="blueprint-stage-title">[파트 I] 애로사항 주관식 답변 · Step 117 동의서 전자서명 · Step 118 CHECK1 사진 문항</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-signature"></i> 2중 서명 &amp; 사진 미업로드 통과 기본</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        설문 중 주관식 애로사항/건의사항 문항에 입력할 텍스트 가이드라인과 최종 관문 Step 117(동의서 2중 서명·연락처 3분할), Step 118(CHECK1 사진 문항 — 기본값: 사진 미업로드 후 [다음] 진행) 설정을 관리합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">경영 애로사항 및 경기도 정책 건의사항 주관식 코멘트 템플릿</label>
          <textarea id="txt-metrix-comment" class="figma-input w-full" rows="3" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(metrixPolicyState.open_ended_comment)}</textarea>
        </div>
        <div>
          <label class="figma-label font-bold">Step 118 CHECK1 증빙 사진 예비 경로 (상단 제어판에서 '견본 사진 업로드' 선택 시에만 사용 · 기본값: 업로드 안 함)</label>
          <div class="flex-center-gap-10">
            <input type="text" id="txt-metrix-sign-image" class="figma-input w-full" value="${escapeHtml(metrixPolicyState.evidence_sign_image)}" readonly style="opacity: 0.85;" />
            <span class="badge-status ${metrixPolicyState.check1_photoUploadMode === 'upload_sample' ? 'success' : 'ready'} text-nowrap"><i class="fa-solid ${metrixPolicyState.check1_photoUploadMode === 'upload_sample' ? 'fa-file-image' : 'fa-forward-step'}"></i> ${metrixPolicyState.check1_photoUploadMode === 'upload_sample' ? '견본 업로드 활성' : '미업로드 바로 통과'}</span>
          </div>
        </div>
      </div>
    </section>
  `;

  bindMetrixEvents({ metrixPolicyState, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas });
  return metrixPolicyState;
}
