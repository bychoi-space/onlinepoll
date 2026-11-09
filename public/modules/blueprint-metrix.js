import { escapeHtml } from './blueprint-utils.js';

export function syncMetrixInputsToState(metrixPolicyState) {
  // 0. 실행 규칙 및 패널 계승
  const cbSafetyStop = document.getElementById('cb-metrix-safety-stop');
  if (cbSafetyStop) metrixPolicyState.safetyStopAtReview = cbSafetyStop.checked;

  const cbPreserve = document.getElementById('cb-metrix-preserve-inputs');
  if (cbPreserve) metrixPolicyState.preserveExistingInputs = cbPreserve.checked;

  const cbSkipCompleted = document.getElementById('cb-metrix-skip-completed');
  if (cbSkipCompleted) metrixPolicyState.skipCompletedSlots = cbSkipCompleted.checked;

  const cbInheritRawMeta = document.getElementById('cb-metrix-inherit-rawmeta');
  if (cbInheritRawMeta) metrixPolicyState.inheritPanelRawMeta = cbInheritRawMeta.checked;

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

  // 4. 6대 결제수단 & 부채 구조 (문14 ~ 문15-2)
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

  return metrixPolicyState;
}

export function bindMetrixEvents({ metrixPolicyState, appendLog }) {
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

export function renderMetrixBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid, appendLog }) {
  const metrixPolicyState = { ...(data.policy || data.blueprint?.defaultPolicy || {}) };

  // 0. 실행 규칙 및 패널 계승 기본값
  if (metrixPolicyState.safetyStopAtReview === undefined) metrixPolicyState.safetyStopAtReview = true;
  if (metrixPolicyState.preserveExistingInputs === undefined) metrixPolicyState.preserveExistingInputs = true;
  if (metrixPolicyState.skipCompletedSlots === undefined) metrixPolicyState.skipCompletedSlots = true;
  if (metrixPolicyState.inheritPanelRawMeta === undefined) metrixPolicyState.inheritPanelRawMeta = true;

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

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) titleEl.textContent = '메트릭스 경기도 소상공인 사업체패널 3차조사 전 문항 가이드라인 (A1~A15 · 문8~문67 · 총 120단계)';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = '2차년도 패널 실측 데이터(rawMeta) 자동 계승 및 일반현황·디지털전환·경영실적·비용/결제·부채·임대차/권리금·애로사항·고용/급여·지원정책·98% 안전 대기 규칙을 전수 설정합니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 메트릭스 패널 120단계 전 문항 블루프린트 활성 (패널 실측치 계승 &amp; 98% 안전 대기)';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 메트릭스 전 문항 기준 가이드 저장';
    btnSaveBaseline.title = '메트릭스 패널조사 120단계 기준 가이드라인 설정 저장';
  }

  if (!blueprintStageGrid) return metrixPolicyState;

  blueprintStageGrid.innerHTML = `
    <!-- 카드 0: 실행 규칙 · 98% 안전 대기 & 2차년도 패널 실측치 계승 (전폭) -->
    <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-shield-halved"></i> 핵심 실행 원칙</span>
          <h3 class="blueprint-stage-title">98% 안전 대기 · 기입력 보존 · 2차년도 패널 실측 데이터(rawMeta) 자동 계승</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-database"></i> 패널 54개 실측 DB 연동 완료</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        경기도 소상공인 사업체패널조사는 <strong>3차년도 추적 조사</strong>입니다. 각 패널의 2차년도 실측 응답값(<code>AA1~AA15</code>, <code>M8~M62</code>)을 자동 계승하여 개업연월·전년도 매출/비용·임대차·종사자수 등의 시계열 모순 트랩을 원천 차단하고, 최종 제출 직전 <strong>98% 상태(Step 119)</strong>에서 안전 대기합니다.
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-safety-stop" class="assoc-rule-cb" ${metrixPolicyState.safetyStopAtReview !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-success"><i class="fa-solid fa-circle-check"></i> 최종 제출 직전 98% 안전 대기 [필수]</strong>
              <div class="assoc-rule-desc">
                동의서(2중 전자서명) 및 CHECK1 간판사진 업로드까지 완료 후, Step 119 참여혜택 화면(98%)에서 정지하여 검토 가능 상태를 보존합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-inherit-rawmeta" class="assoc-rule-cb" ${metrixPolicyState.inheritPanelRawMeta !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-primary-color"><i class="fa-solid fa-link"></i> 2차년도 패널 실측치(rawMeta) 스마트 계승</strong>
              <div class="assoc-rule-desc">
                쿼터 DB 내 <code>AA1~AA15</code>(일반현황) 및 <code>M8~M62</code>(전년도 매출·임차료·종사자·급여) 값을 기본 베이스로 삼고 아래 설정 추세를 반영합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-preserve-inputs" class="assoc-rule-cb" ${metrixPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">기입력된 설문 항목 100% 보존</strong>
              <div class="assoc-rule-desc">
                설문 화면에 이미 선택된 라디오·우선순위(GRADE_CLICK)·합계 숫자·텍스트는 절대 덮어쓰지 않고 그대로 보존합니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-skip-completed" class="assoc-rule-cb" ${metrixPolicyState.skipCompletedSlots !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">완료된 슬롯 건너뛰기</strong>
              <div class="assoc-rule-desc">
                메트릭스 관리자 목록에서 이미 '완료(100%)' 상태인 쿼터는 재실행하지 않고 자동으로 건너뜁니다.
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>

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

    <!-- 카드 4: [파트 D] 6대 결제수단 비중 & 부채·차입 구조 (문14 ~ 문15-2) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-credit-card"></i> 문14·문15</span>
          <h3 class="blueprint-stage-title">[파트 D] 6대 결제수단 비중 &amp; 부채·차입 구조</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-scale-balanced"></i> M14·M15 100% 매칭</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문14 6대 결제수단 비중(현금·카드·지역화폐·간편결제·상품권·계좌이체)과 문15 부채 보유 여부, 총 부채액, 4대 차입처 비중(합계 100%), 차입 사유 1·2순위를 설정합니다.
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
        <div class="qb-grid-2col">
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
        문50~문62 경기도/정부 소상공인 지원정책 수혜 여부, 문50~문66 5점 척도 만족도 가중치, 문67 향후 경기도 최우선 확대 희망 지원사업 1·2순위를 설정합니다.
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
            <label class="figma-label font-bold">문67 경기도 최우선 희망 지원정책 (1순위)</label>
            <select id="sel-metrix-support-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.desired_support_rank1 === '1' ? 'selected' : ''}>1. 자금지원 (저금리 대출·특례보증 확대 - 기본값)</option>
              <option value="2" ${metrixPolicyState.desired_support_rank1 === '2' ? 'selected' : ''}>2. 경영환경개선 (점포 시설개보수·간판·위생)</option>
              <option value="3" ${metrixPolicyState.desired_support_rank1 === '3' ? 'selected' : ''}>3. 판로개척 및 온라인·배달앱 수수료 지원</option>
              <option value="4" ${metrixPolicyState.desired_support_rank1 === '4' ? 'selected' : ''}>4. 세무·노무·법률 컨설팅 및 경영교육 지원</option>
              <option value="5" ${metrixPolicyState.desired_support_rank1 === '5' ? 'selected' : ''}>5. 경기지역화폐 발행 확대 및 소비촉진 지원</option>
              <option value="6" ${metrixPolicyState.desired_support_rank1 === '6' ? 'selected' : ''}>6. 공공요금·임차료·대출이자 차액 보전 지원</option>
              <option value="7" ${metrixPolicyState.desired_support_rank1 === '7' ? 'selected' : ''}>7. 인력 채용 및 인건비·4대보험료 지원</option>
              <option value="8" ${metrixPolicyState.desired_support_rank1 === '8' ? 'selected' : ''}>8. 폐업·업종전환·재창업 안전망 지원</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문67 경기도 최우선 희망 지원정책 (2순위)</label>
            <select id="sel-metrix-support-rank2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.desired_support_rank2 === '2' ? 'selected' : ''}>2. 경영환경개선 (점포 시설개보수·간판 - 기본값)</option>
              <option value="1" ${metrixPolicyState.desired_support_rank2 === '1' ? 'selected' : ''}>1. 자금지원 (저금리 대출·특례보증 확대)</option>
              <option value="3" ${metrixPolicyState.desired_support_rank2 === '3' ? 'selected' : ''}>3. 판로개척 및 온라인·배달앱 수수료 지원</option>
              <option value="4" ${metrixPolicyState.desired_support_rank2 === '4' ? 'selected' : ''}>4. 세무·노무·법률 컨설팅 및 경영교육 지원</option>
              <option value="5" ${metrixPolicyState.desired_support_rank2 === '5' ? 'selected' : ''}>5. 경기지역화폐 발행 확대 및 소비촉진 지원</option>
              <option value="6" ${metrixPolicyState.desired_support_rank2 === '6' ? 'selected' : ''}>6. 공공요금·임차료·대출이자 차액 보전 지원</option>
              <option value="7" ${metrixPolicyState.desired_support_rank2 === '7' ? 'selected' : ''}>7. 인력 채용 및 인건비·4대보험료 지원</option>
              <option value="8" ${metrixPolicyState.desired_support_rank2 === '8' ? 'selected' : ''}>8. 폐업·업종전환·재창업 안전망 지원</option>
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
          <h3 class="blueprint-stage-title">[파트 I] 애로사항 주관식 답변 · Step 117 동의서 전자서명 · Step 118 CHECK1 증빙 사진</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-camera"></i> 2중 서명 &amp; 증빙 자동 바인딩</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        설문 중 주관식 애로사항/건의사항 문항에 입력할 텍스트 가이드라인과 최종 관문 Step 117(동의서 2중 서명·연락처 3분할), Step 118(CHECK1 간판/명함 사진 업로드) 경로를 지정합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">경영 애로사항 및 경기도 정책 건의사항 주관식 코멘트 템플릿</label>
          <textarea id="txt-metrix-comment" class="figma-input w-full" rows="3" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(metrixPolicyState.open_ended_comment)}</textarea>
        </div>
        <div>
          <label class="figma-label font-bold">Step 118 CHECK1 증빙 간판사진 파일 경로</label>
          <div class="flex-center-gap-10">
            <input type="text" id="txt-metrix-sign-image" class="figma-input w-full" value="${escapeHtml(metrixPolicyState.evidence_sign_image)}" readonly style="opacity: 0.85;" />
            <span class="badge-status success text-nowrap"><i class="fa-solid fa-file-image"></i> 견본 탑재 완료</span>
          </div>
        </div>
      </div>
    </section>
  `;

  bindMetrixEvents({ metrixPolicyState, appendLog });
  return metrixPolicyState;
}
