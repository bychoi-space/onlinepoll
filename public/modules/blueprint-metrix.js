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
  if (!metrixPolicyState) return metrixPolicyState;

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

  // 경기도 3차 패널에서는 6대 핵심 안전 원칙을 엔진 기본값으로 강제 유지
  if (!metrixPolicyState._isSeoulPanel) {
    metrixPolicyState.safetyStopAtReview = true;
    metrixPolicyState.preserveExistingInputs = true;
    metrixPolicyState.skipCompletedSlots = true;
    metrixPolicyState.inheritPanelRawMeta = true;
    metrixPolicyState.excludeClosedBiz = true;
    metrixPolicyState.updatePhoneInContactPopup = true;
    metrixPolicyState.useIndustryGuidelines = true;
  } else {
    const cbSafetyStop = document.getElementById('cb-metrix-safety-stop');
    if (cbSafetyStop) metrixPolicyState.safetyStopAtReview = cbSafetyStop.checked;
    const cbPreserve = document.getElementById('cb-metrix-preserve-inputs');
    if (cbPreserve) metrixPolicyState.preserveExistingInputs = cbPreserve.checked;
    const cbInheritRawMeta = document.getElementById('cb-metrix-inherit-rawmeta');
    if (cbInheritRawMeta) metrixPolicyState.inheritPanelRawMeta = cbInheritRawMeta.checked;
  }

  // 공통 문항 및 폴백 입력값 동기화
  readStr('sel-metrix-open-hour', 'operating_openHour');
  readStr('sel-metrix-close-hour', 'operating_closeHour');
  readStr('sel-metrix-closed-days', 'operating_closedDays');
  readStr('sel-metrix-closed-dow', 'operating_closedDayOfWeek');
  readStr('sel-metrix-sales-reason1', 'sales_changeReasonRank1');
  readStr('sel-metrix-sales-reason2', 'sales_changeReasonRank2');
  readNum('num-metrix-owner-income', 'owner_monthlyIncome', 320);

  readNum('num-metrix-cost-mat', 'cost_materialRatio', 0);
  readNum('num-metrix-cost-labor', 'cost_laborRatio', 0);
  readNum('num-metrix-cost-rent', 'cost_rentRatio', 0);
  readNum('num-metrix-cost-tax', 'cost_taxRatio', 0);
  readNum('num-metrix-cost-fee', 'cost_feeAdRatio', 0);
  readNum('num-metrix-cost-other', 'cost_otherRatio', 0);

  readNum('num-metrix-pay-cash', 'payment_cashRatio', 0);
  readNum('num-metrix-pay-card', 'payment_cardRatio', 0);
  readNum('num-metrix-pay-local', 'payment_localCurrencyRatio', 0);
  readNum('num-metrix-pay-mobile', 'payment_mobileRatio', 0);
  readNum('num-metrix-pay-voucher', 'payment_voucherRatio', 0);
  readNum('num-metrix-pay-transfer', 'payment_transferRatio', 0);

  readStr('sel-metrix-funding-guarantee-rule', 'funding_guaranteeRule');
  readStr('sel-metrix-funding-when-x', 'funding_whenGuaranteeX');
  readNum('num-metrix-lease-deposit', 'lease_deposit', 2000);
  readNum('num-metrix-lease-rent', 'lease_monthlyRent', 120);
  readStr('sel-metrix-hardship-rank1', 'hardship_rank1');
  readStr('sel-metrix-hardship-rank2', 'hardship_rank2');
  readStr('sel-metrix-support-rank1', 'desired_support_rank1');
  readStr('sel-metrix-support-rank2', 'desired_support_rank2');
  readStr('txt-metrix-comment', 'open_ended_comment');

  // 서울시 패널 5차 전용 문항
  readStr('sel-seoul-m1-rank1', 'seoul_m1_rank1');
  readStr('sel-seoul-m2-rank1', 'seoul_m2_rank1');
  readStr('sel-seoul-m3-rank1', 'seoul_m3_rank1');
  readStr('sel-seoul-n2-ai-adoption', 'seoul_n2_aiAdoption');
  readStr('sel-seoul-o1-carbon', 'seoul_o1_carbon');

  // 경기도 3차 본조사 문항별 응답 가이드 (문10 ~ 문69 · CHECK1)
  readStr('sel-metrix-q10-mode', 'q10_fundMgmtMode');
  readStr('sel-metrix-q12-1-mode', 'q12_1_evalReasonMode');
  readStr('sel-metrix-q13-range-mode', 'q13_incomeRangeMode');
  readNum('num-metrix-income-min', 'owner_incomeMin', 250);
  readNum('num-metrix-income-max', 'owner_incomeMax', 400);
  readNum('num-metrix-income-step', 'owner_incomeStep', 5);
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

  // 8대 업종별 체크 상태 및 선택 업종 인라인 편집값 동기화
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
    if (document.getElementById('sel-metrix-open-hour')) curInd.operating_openHour = metrixPolicyState.operating_openHour;
    if (document.getElementById('sel-metrix-close-hour')) curInd.operating_closeHour = metrixPolicyState.operating_closeHour;
    if (document.getElementById('sel-metrix-closed-days')) curInd.operating_closedDays = metrixPolicyState.operating_closedDays;
    if (document.getElementById('sel-metrix-closed-dow')) curInd.operating_closedDayOfWeek = metrixPolicyState.operating_closedDayOfWeek;
    if (document.getElementById('num-metrix-owner-income')) curInd.owner_monthlyIncome = metrixPolicyState.owner_monthlyIncome;
    if (document.getElementById('num-metrix-cost-mat')) {
      curInd.cost_materialRatio = metrixPolicyState.cost_materialRatio;
      curInd.cost_laborRatio = metrixPolicyState.cost_laborRatio;
      curInd.cost_rentRatio = metrixPolicyState.cost_rentRatio;
      curInd.cost_taxRatio = metrixPolicyState.cost_taxRatio;
      curInd.cost_feeAdRatio = metrixPolicyState.cost_feeAdRatio;
      curInd.cost_otherRatio = metrixPolicyState.cost_otherRatio;
    }
    if (document.getElementById('num-metrix-pay-cash')) {
      curInd.payment_cashRatio = metrixPolicyState.payment_cashRatio;
      curInd.payment_cardRatio = metrixPolicyState.payment_cardRatio;
      curInd.payment_localCurrencyRatio = metrixPolicyState.payment_localCurrencyRatio;
      curInd.payment_mobileRatio = metrixPolicyState.payment_mobileRatio;
      curInd.payment_voucherRatio = metrixPolicyState.payment_voucherRatio;
      curInd.payment_transferRatio = metrixPolicyState.payment_transferRatio;
    }
    const indCommentEl = document.getElementById('txt-metrix-ind-comment');
    if (indCommentEl) {
      curInd.open_ended_comment = indCommentEl.value;
    }
  }

  return metrixPolicyState;
}

export function bindMetrixEvents({ metrixPolicyState, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas }) {
  // 1. 영업비용 6대 항목 실시간 합계 (100% 검증)
  const costInputs = document.querySelectorAll('.num-metrix-cost');
  const badgeCostTotal = document.getElementById('badge-metrix-cost-total');
  function updateCostTotal() {
    let sum = 0;
    costInputs.forEach(inp => { sum += Number(inp.value) || 0; });
    if (badgeCostTotal) {
      if (sum === 100) {
        badgeCostTotal.className = 'badge-status ready';
        badgeCostTotal.innerHTML = '<i class="fa-solid fa-check"></i> 합계 100% 정상';
      } else {
        badgeCostTotal.className = 'badge-status error';
        badgeCostTotal.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 현재 ${sum}% (${sum < 100 ? `+${100 - sum}% 필요` : `${sum - 100}% 초과`})`;
      }
    }
  }
  costInputs.forEach(inp => inp.addEventListener('input', updateCostTotal));
  updateCostTotal();

  // 2. 결제수단 6대 항목 실시간 합계 (100% 검증)
  const payInputs = document.querySelectorAll('.num-metrix-pay');
  const badgePayTotal = document.getElementById('badge-metrix-pay-total');
  function updatePayTotal() {
    let sum = 0;
    payInputs.forEach(inp => { sum += Number(inp.value) || 0; });
    if (badgePayTotal) {
      if (sum === 100) {
        badgePayTotal.className = 'badge-status ready';
        badgePayTotal.innerHTML = '<i class="fa-solid fa-check"></i> 합계 100% 정상';
      } else {
        badgePayTotal.className = 'badge-status error';
        badgePayTotal.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 현재 ${sum}% (${sum < 100 ? `+${100 - sum}% 필요` : `${sum - 100}% 초과`})`;
      }
    }
  }
  payInputs.forEach(inp => inp.addEventListener('input', updatePayTotal));
  updatePayTotal();

  // 3. 통합 가이드 상단 탭 전환 (탭 1: 문항별 가이드 / 탭 2: 8대 업종별 수치)
  const tabBtns = document.querySelectorAll('.metrix-guide-tab-btn');
  const panelQuestions = document.getElementById('metrix-tab-panel-questions');
  const panelIndustries = document.getElementById('metrix-tab-panel-industries');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-metrix-tab') || 'questions';
      metrixPolicyState._activeGuideTab = targetTab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      if (panelQuestions) panelQuestions.style.display = targetTab === 'questions' ? 'block' : 'none';
      if (panelIndustries) panelIndustries.style.display = targetTab === 'industries' ? 'block' : 'none';
    });
  });

  // 4. 문항별 세부 입력칸 조건부 표시 (Progressive Disclosure)
  const bindConditionalToggle = (selectId, wrapId, showWhenFn) => {
    const sel = document.getElementById(selectId);
    const wrap = document.getElementById(wrapId);
    if (!sel || !wrap) return;
    const syncVis = () => {
      wrap.style.display = showWhenFn(sel.value) ? '' : 'none';
    };
    sel.addEventListener('change', syncVis);
    syncVis();
  };

  bindConditionalToggle('sel-metrix-q12-1-mode', 'wrap-metrix-q12-1-fixed', v => v === 'fixed');
  bindConditionalToggle('sel-metrix-q13-range-mode', 'wrap-metrix-q13-range', v => v === 'range');
  bindConditionalToggle('sel-metrix-q16-1-source', 'wrap-metrix-q16-1-fallback', v => v !== 'preserve_only');
  bindConditionalToggle('sel-metrix-q17-range-mode', 'wrap-metrix-q17-range', v => v === 'range');
  bindConditionalToggle('sel-metrix-q22-mode', 'wrap-metrix-q22-fixed', v => v === 'fixed');
  bindConditionalToggle('sel-metrix-q26-rule', 'wrap-metrix-q26-1', v => v !== 'all_no');
  bindConditionalToggle('sel-metrix-q34-range-mode', 'wrap-metrix-q34-range', v => v === 'range');
  bindConditionalToggle('sel-metrix-q67-mode', 'wrap-metrix-q67-fixed', v => v === 'fixed');
  bindConditionalToggle('sel-metrix-q68-mode', 'wrap-metrix-q68-fixed', v => v === 'fixed');

  // 5. 8대 업종 카드 선택 및 인라인 편집기 실시간 연동
  function refreshIndustryCardSummary(indKey) {
    const indPol = metrixPolicyState.industryPolicies?.[indKey];
    if (!indPol) return;
    const metaEl = document.getElementById(`metrix-ind-meta-${indKey}`);
    if (metaEl) {
      const incSummary = metrixPolicyState.q13_incomeRangeMode === 'fixed'
        ? `${indPol.owner_monthlyIncome}만`
        : (metrixPolicyState.q13_incomeRangeMode === 'panel'
          ? '패널값'
          : `${metrixPolicyState.owner_incomeMin ?? 250}~${metrixPolicyState.owner_incomeMax ?? 400}만`);
      metaEl.innerHTML = `
        <div>영업 <strong>${escapeHtml(indPol.operating_openHour)}~${escapeHtml(indPol.operating_closeHour)}시</strong> · 순소득 <strong>${incSummary}</strong></div>
        <div>원재료 <strong>${indPol.cost_materialRatio}%</strong> · 카드 <strong>${indPol.payment_cardRatio}%</strong> · 이체 <strong>${indPol.payment_transferRatio}%</strong></div>
      `;
    }
  }

  ['sel-metrix-q13-range-mode', 'num-metrix-income-min', 'num-metrix-income-max', 'num-metrix-income-step'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evtName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evtName, () => {
      syncMetrixInputsToState(metrixPolicyState);
      Object.keys(metrixPolicyState.industryPolicies || {}).forEach(k => refreshIndustryCardSummary(k));
    });
  });

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
    setVal('txt-metrix-ind-comment', indPol.open_ended_comment || '');

    updateCostTotal();
    updatePayTotal();

    document.querySelectorAll('.metrix-ind-card').forEach(card => {
      const k = card.getAttribute('data-ind-key');
      card.classList.toggle('active', k === indKey);
    });

    const titleStrong = document.getElementById('metrix-active-ind-name');
    if (titleStrong) titleStrong.textContent = indPol.name;
  }

  document.querySelectorAll('.metrix-ind-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('cb-metrix-ind-enable')) return;
      const prevKey = metrixPolicyState._activeIndKey || 'ind_3';
      const targetKey = card.getAttribute('data-ind-key');
      if (!targetKey) return;
      syncMetrixInputsToState(metrixPolicyState);
      refreshIndustryCardSummary(prevKey);
      loadIndustryIntoForm(targetKey);
      if (appendLog) {
        const indName = metrixPolicyState.industryPolicies?.[targetKey]?.name || targetKey;
        appendLog('info', `[업종 선택] "${indName}" 기본 수치를 편집기에 불러왔습니다.`);
      }
    });
  });

  const updateIndTabCount = () => {
    const enabledCnt = Object.values(metrixPolicyState.industryPolicies || {}).filter(p => p.enabled !== false).length;
    const badgeCnt = document.getElementById('badge-metrix-ind-enabled-count');
    if (badgeCnt) badgeCnt.textContent = `${enabledCnt}/8 활성`;
  };

  document.querySelectorAll('.cb-metrix-ind-enable').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const indKey = cb.getAttribute('data-ind-key');
      if (indKey && metrixPolicyState.industryPolicies?.[indKey]) {
        metrixPolicyState.industryPolicies[indKey].enabled = cb.checked;
      }
      updateIndTabCount();
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
      updateIndTabCount();
      if (appendLog) appendLog('info', '✓ 8대 전 업종 맞춤 가이드가 활성화되었습니다.');
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
}

function renderHourOptions(selectedHour, startH, endH) {
  const opts = [];
  for (let h = startH; h <= endH; h++) {
    const hh = String(h).padStart(2, '0');
    opts.push(`<option value="${hh}" ${String(selectedHour) === hh ? 'selected' : ''}>${hh}:00</option>`);
  }
  return opts.join('');
}

function renderGyeonggiCleanHtml({ metrixPolicyState, indKeys, enabledIndCount, activeIndObj, industryStats }) {
  const activeTab = metrixPolicyState._activeGuideTab === 'industries' ? 'industries' : 'questions';

  return `
    <div class="metrix-guide-shell">
      <!-- 상단 2탭 전환 바 -->
      <div class="metrix-guide-tabbar">
        <div class="metrix-guide-tabs" role="tablist">
          <button type="button" class="metrix-guide-tab-btn ${activeTab === 'questions' ? 'active' : ''}" data-metrix-tab="questions">
            <i class="fa-solid fa-list-check"></i> 문항별 응답 가이드 (문10 ~ 문69)
          </button>
          <button type="button" class="metrix-guide-tab-btn ${activeTab === 'industries' ? 'active' : ''}" data-metrix-tab="industries">
            <i class="fa-solid fa-industry"></i> 8대 업종별 기본 수치
            <span id="badge-metrix-ind-enabled-count" class="badge-status ready" style="padding:1px 7px; font-size:11px;">${enabledIndCount}/8 활성</span>
          </button>
        </div>
        <div class="font-caption" style="color:#475569; font-weight:600;">
          <i class="fa-solid fa-circle-info text-primary-color"></i> 기존 패널 기입력값은 자동 보존되며, 아래 지정 문항만 가이드 규칙으로 응답합니다.
        </div>
      </div>

      <!-- [탭 1] 3차 본조사 문항별 응답 가이드 (전 업종 공통 제어) -->
      <div id="metrix-tab-panel-questions" class="metrix-guide-panel" style="display:${activeTab === 'questions' ? 'block' : 'none'};">

        <!-- 그룹 1: 자금 · 경영실적 · 대표자 소득 · 보증연동 -->
        <div class="metrix-section-block">
          <h4 class="metrix-section-heading"><i class="fa-solid fa-coins"></i> 1. 자금 관리 · 경영실적 · 대표자 소득 · 보증지원 연동 (문10 ~ 문15-3)</h4>
          <div class="metrix-q-grid">
            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문10</span>
                <span class="metrix-q-title">사업자금·가계자금 분리 관리 여부</span>
              </div>
              <select id="sel-metrix-q10-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q10_fundMgmtMode === 'random' ? 'selected' : ''}>1~3번 무작위 응답 (문10-1 자동연동 · 기본)</option>
                <option value="1" ${metrixPolicyState.q10_fundMgmtMode === '1' ? 'selected' : ''}>1. 분리하여 관리하고 있다 (고정)</option>
                <option value="2" ${metrixPolicyState.q10_fundMgmtMode === '2' ? 'selected' : ''}>2. 일부만 분리하여 관리한다 (고정)</option>
                <option value="3" ${metrixPolicyState.q10_fundMgmtMode === '3' ? 'selected' : ''}>3. 분리하지 않고 함께 관리한다 (고정)</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문12-1</span>
                <span class="metrix-q-title">전반적 경영실적 판단 이유 (1·2순위)</span>
              </div>
              <select id="sel-metrix-q12-1-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q12_1_evalReasonMode === 'random' ? 'selected' : ''}>1~7번 중 1·2순위 무작위 (기타 제외 · 기본)</option>
                <option value="fixed" ${metrixPolicyState.q12_1_evalReasonMode === 'fixed' ? 'selected' : ''}>고정 순위 직접 지정</option>
              </select>
              <div id="wrap-metrix-q12-1-fallback-keep" style="display:none;"></div>
              <div id="wrap-metrix-q12-1-fixed" class="metrix-q-subgrid-2" style="display:${metrixPolicyState.q12_1_evalReasonMode === 'fixed' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">1순위</span>
                  <select id="sel-metrix-sales-reason1" class="figma-select w-full">
                    <option value="1" ${metrixPolicyState.sales_changeReasonRank1 === '1' ? 'selected' : ''}>1. 전반적 경기 변동</option>
                    <option value="2" ${metrixPolicyState.sales_changeReasonRank1 === '2' ? 'selected' : ''}>2. 원재료·공공요금·인건비 상승</option>
                    <option value="3" ${metrixPolicyState.sales_changeReasonRank1 === '3' ? 'selected' : ''}>3. 동종업종·주변 상권 경쟁 심화</option>
                    <option value="4" ${metrixPolicyState.sales_changeReasonRank1 === '4' ? 'selected' : ''}>4. 유동인구 및 소비패턴 변화</option>
                    <option value="5" ${metrixPolicyState.sales_changeReasonRank1 === '5' ? 'selected' : ''}>5. 마케팅·온라인 판로 변화</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">2순위</span>
                  <select id="sel-metrix-sales-reason2" class="figma-select w-full">
                    <option value="2" ${metrixPolicyState.sales_changeReasonRank2 === '2' ? 'selected' : ''}>2. 원재료·공공요금·인건비 상승</option>
                    <option value="1" ${metrixPolicyState.sales_changeReasonRank2 === '1' ? 'selected' : ''}>1. 전반적 경기 변동</option>
                    <option value="3" ${metrixPolicyState.sales_changeReasonRank2 === '3' ? 'selected' : ''}>3. 동종업종·주변 상권 경쟁 심화</option>
                    <option value="4" ${metrixPolicyState.sales_changeReasonRank2 === '4' ? 'selected' : ''}>4. 유동인구 및 소비패턴 변화</option>
                    <option value="5" ${metrixPolicyState.sales_changeReasonRank2 === '5' ? 'selected' : ''}>5. 마케팅·온라인 판로 변화</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문13</span>
                <span class="metrix-q-title">대표자 월평균 소득 범위 설정 (만원)</span>
              </div>
              <select id="sel-metrix-q13-range-mode" class="figma-select w-full">
                <option value="range" ${metrixPolicyState.q13_incomeRangeMode === 'range' ? 'selected' : ''}>지정 범위 내 단위 랜덤 생성 (250~400만원 · 기본)</option>
                <option value="fixed" ${metrixPolicyState.q13_incomeRangeMode === 'fixed' ? 'selected' : ''}>업종별 기본 순소득 고정값 사용</option>
                <option value="panel" ${metrixPolicyState.q13_incomeRangeMode === 'panel' ? 'selected' : ''}>기존 패널 기입력값(M13) 유지</option>
              </select>
              <div id="wrap-metrix-q13-range" class="metrix-q-subgrid-3" style="display:${metrixPolicyState.q13_incomeRangeMode === 'range' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">최소(만원)</span>
                  <input type="number" id="num-metrix-income-min" class="figma-input w-full" min="50" step="5" value="${metrixPolicyState.owner_incomeMin}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">최대(만원)</span>
                  <input type="number" id="num-metrix-income-max" class="figma-input w-full" min="50" step="5" value="${metrixPolicyState.owner_incomeMax}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">단위(만원)</span>
                  <input type="number" id="num-metrix-income-step" class="figma-input w-full" min="1" step="5" value="${metrixPolicyState.owner_incomeStep}" />
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문15-3</span>
                <span class="metrix-q-title">사업자금 조달방법 (시트 보증지원 O/X 연동)</span>
              </div>
              <select id="sel-metrix-funding-guarantee-rule" class="figma-select w-full">
                <option value="excel_sync" ${metrixPolicyState.funding_guaranteeRule === 'excel_sync' ? 'selected' : ''}>시트 보증지원=O면 ④정책자금 체크, X면 제외 (기본)</option>
                <option value="always_policy_4" ${metrixPolicyState.funding_guaranteeRule === 'always_policy_4' ? 'selected' : ''}>모든 사업체에 ④정책자금 포함</option>
                <option value="never_policy_4" ${metrixPolicyState.funding_guaranteeRule === 'never_policy_4' ? 'selected' : ''}>④정책자금 선택 안 함 (은행·자기자금)</option>
              </select>
              <div>
                <span class="metrix-q-sublabel">보증지원=X 일 때 대체 선택지</span>
                <select id="sel-metrix-funding-when-x" class="figma-select w-full">
                  <option value="1" ${metrixPolicyState.funding_whenGuaranteeX === '1' ? 'selected' : ''}>① 은행권 대출 (제1금융권 · 기본)</option>
                  <option value="7" ${metrixPolicyState.funding_whenGuaranteeX === '7' ? 'selected' : ''}>⑦ 외부 자금조달 없음 (자기자금 100%)</option>
                  <option value="1_2" ${metrixPolicyState.funding_whenGuaranteeX === '1_2' ? 'selected' : ''}>① 은행권 + ② 비은행 금융기관</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 그룹 2: 사업장 임차 · 권리금 -->
        <div class="metrix-section-block">
          <h4 class="metrix-section-heading"><i class="fa-solid fa-building"></i> 2. 사업장 임차 조건 · 권리금 (문16-1 ~ 문17)</h4>
          <div class="metrix-q-grid">
            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문16-1</span>
                <span class="metrix-q-title">임차 사업장 보증금·월세 입력 기준</span>
              </div>
              <select id="sel-metrix-q16-1-source" class="figma-select w-full">
                <option value="excel_first" ${metrixPolicyState.q16_1_leaseSource === 'excel_first' ? 'selected' : ''}>구글 시트 [보증금]·[월세] 값 우선 입력 (기본)</option>
                <option value="preserve_only" ${metrixPolicyState.q16_1_leaseSource === 'preserve_only' ? 'selected' : ''}>기입력값 유지 (빈칸만 예비 기본값 사용)</option>
              </select>
              <div id="wrap-metrix-q16-1-fallback" class="metrix-q-subgrid-2">
                <div>
                  <span class="metrix-q-sublabel">시트 공란 시 예비 보증금(만원)</span>
                  <input type="number" id="num-metrix-lease-deposit" class="figma-input w-full" min="0" step="100" value="${metrixPolicyState.lease_deposit}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">시트 공란 시 예비 월세(만원)</span>
                  <input type="number" id="num-metrix-lease-rent" class="figma-input w-full" min="0" step="10" value="${metrixPolicyState.lease_monthlyRent}" />
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문17</span>
                <span class="metrix-q-title">권리금 금액 범위 설정 (만원)</span>
              </div>
              <select id="sel-metrix-q17-range-mode" class="figma-select w-full">
                <option value="range" ${metrixPolicyState.q17_goodwillRangeMode === 'range' ? 'selected' : ''}>지정 범위 내 단위 랜덤 생성 (기본)</option>
                <option value="all_no" ${metrixPolicyState.q17_goodwillRangeMode === 'all_no' ? 'selected' : ''}>권리금 없음(2번) 고정</option>
              </select>
              <div id="wrap-metrix-q17-range" class="metrix-q-subgrid-3" style="display:${metrixPolicyState.q17_goodwillRangeMode === 'range' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">최소(만원)</span>
                  <input type="number" id="num-metrix-goodwill-min" class="figma-input w-full" min="100" step="100" value="${metrixPolicyState.goodwill_min}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">최대(만원)</span>
                  <input type="number" id="num-metrix-goodwill-max" class="figma-input w-full" min="100" step="100" value="${metrixPolicyState.goodwill_max}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">단위(만원)</span>
                  <input type="number" id="num-metrix-goodwill-step" class="figma-input w-full" min="100" step="100" value="${metrixPolicyState.goodwill_step}" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 그룹 3: 사업 운영 · 애로사항 · 온라인 판매 -->
        <div class="metrix-section-block">
          <h4 class="metrix-section-heading"><i class="fa-solid fa-store"></i> 3. 사업 운영 · 경영 애로사항 · 온라인 판매 (문21 ~ 문26-1)</h4>
          <div class="metrix-q-grid">
            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문21</span>
                <span class="metrix-q-title">여성 대표자 사업 운영 애로사항 (복수)</span>
              </div>
              <select id="sel-metrix-q21-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q21_femaleDiffMode === 'random' ? 'selected' : ''}>1~5번 중 1~2개 무작위 응답 (기타 제외 · 기본)</option>
                <option value="none_7" ${metrixPolicyState.q21_femaleDiffMode === 'none_7' ? 'selected' : ''}>7. 특별한 어려움 없음 고정</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문22</span>
                <span class="metrix-q-title">경영상 가장 큰 애로사항 (1·2순위)</span>
              </div>
              <select id="sel-metrix-q22-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q22_hardshipMode === 'random' ? 'selected' : ''}>1~8번 중 1·2순위 무작위 (기타 제외 · 기본)</option>
                <option value="fixed" ${metrixPolicyState.q22_hardshipMode === 'fixed' ? 'selected' : ''}>고정 순위 직접 지정</option>
              </select>
              <div id="wrap-metrix-q22-fixed" class="metrix-q-subgrid-2" style="display:${metrixPolicyState.q22_hardshipMode === 'fixed' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">1순위</span>
                  <select id="sel-metrix-hardship-rank1" class="figma-select w-full">
                    <option value="3" ${metrixPolicyState.hardship_rank1 === '3' ? 'selected' : ''}>3. 원재료비·물품구매비 상승</option>
                    <option value="7" ${metrixPolicyState.hardship_rank1 === '7' ? 'selected' : ''}>7. 소비 위축 및 매출 부진</option>
                    <option value="5" ${metrixPolicyState.hardship_rank1 === '5' ? 'selected' : ''}>5. 임차료 및 관리비 부담</option>
                    <option value="4" ${metrixPolicyState.hardship_rank1 === '4' ? 'selected' : ''}>4. 인건비 부담 및 구인난</option>
                    <option value="2" ${metrixPolicyState.hardship_rank1 === '2' ? 'selected' : ''}>2. 상권 침체 및 경쟁 심화</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">2순위</span>
                  <select id="sel-metrix-hardship-rank2" class="figma-select w-full">
                    <option value="7" ${metrixPolicyState.hardship_rank2 === '7' ? 'selected' : ''}>7. 소비 위축 및 매출 부진</option>
                    <option value="3" ${metrixPolicyState.hardship_rank2 === '3' ? 'selected' : ''}>3. 원재료비·물품구매비 상승</option>
                    <option value="5" ${metrixPolicyState.hardship_rank2 === '5' ? 'selected' : ''}>5. 임차료 및 관리비 부담</option>
                    <option value="4" ${metrixPolicyState.hardship_rank2 === '4' ? 'selected' : ''}>4. 인건비 부담 및 구인난</option>
                    <option value="6" ${metrixPolicyState.hardship_rank2 === '6' ? 'selected' : ''}>6. 대출 원리금 상환 부담</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문23</span>
                <span class="metrix-q-title">기후변화(폭염·폭우·한파) 경영상 피해</span>
              </div>
              <select id="sel-metrix-q23-climate" class="figma-select w-full">
                <option value="2" ${metrixPolicyState.q23_climateImpact === '2' ? 'selected' : ''}>2. 피해 없음 100% 고정 (문23-1 스킵 · 기본)</option>
                <option value="random" ${metrixPolicyState.q23_climateImpact === 'random' ? 'selected' : ''}>1(있음) / 2(없음) 무작위</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문24</span>
                <span class="metrix-q-title">사업 경쟁력 강화를 위한 노력 (복수)</span>
              </div>
              <select id="sel-metrix-q24-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q24_competitivenessMode === 'random' ? 'selected' : ''}>1~7번 중 1~2개 무작위 응답 (기타 제외 · 기본)</option>
                <option value="none_9" ${metrixPolicyState.q24_competitivenessMode === 'none_9' ? 'selected' : ''}>9. 특별한 노력 없음 고정</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문25</span>
                <span class="metrix-q-title">사업 외 별도 근로·기타 소득 유무</span>
              </div>
              <select id="sel-metrix-q25-income" class="figma-select w-full">
                <option value="2" ${metrixPolicyState.q25_otherIncome === '2' ? 'selected' : ''}>2. 없음 100% 고정 (문25-1 스킵 · 기본)</option>
                <option value="random" ${metrixPolicyState.q25_otherIncome === 'random' ? 'selected' : ''}>1(있음) / 2(없음) 무작위</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문26 · 26-1</span>
                <span class="metrix-q-title">온라인·배달 플랫폼 판매 규칙</span>
              </div>
              <select id="sel-metrix-q26-rule" class="figma-select w-full">
                <option value="food_only_yes" ${metrixPolicyState.q26_onlineRule === 'food_only_yes' ? 'selected' : ''}>5.음식·주점업만 '예(1)', 타 업종 '아니오(2)' (기본)</option>
                <option value="all_no" ${metrixPolicyState.q26_onlineRule === 'all_no' ? 'selected' : ''}>전 업종 '아니오(2)' 고정</option>
                <option value="random" ${metrixPolicyState.q26_onlineRule === 'random' ? 'selected' : ''}>전 업종 무작위</option>
              </select>
              <div id="wrap-metrix-q26-1" style="display:${metrixPolicyState.q26_onlineRule !== 'all_no' ? '' : 'none'};">
                <span class="metrix-q-sublabel">문26-1 음식·주점업 온라인 판매 채널</span>
                <select id="sel-metrix-q26-1-channel" class="figma-select w-full">
                  <option value="3" ${metrixPolicyState.q26_1_foodChannel === '3' ? 'selected' : ''}>3. 배달앱·음식주문 플랫폼 (배민·요기요 등 · 기본)</option>
                  <option value="3_5" ${metrixPolicyState.q26_1_foodChannel === '3_5' ? 'selected' : ''}>3. 배달앱 + 5. SNS·메신저 복수 선택</option>
                  <option value="2" ${metrixPolicyState.q26_1_foodChannel === '2' ? 'selected' : ''}>2. 오픈마켓·소셜커머스</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 그룹 4: 고용 · 급여 · 향후 계획 -->
        <div class="metrix-section-block">
          <h4 class="metrix-section-heading"><i class="fa-solid fa-user-group"></i> 4. 고용 · 근로자 급여 · 향후 운영 계획 (문34 ~ 문44)</h4>
          <div class="metrix-q-grid">
            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문34</span>
                <span class="metrix-q-title">상시근로자 월평균 급여 범위 (만원)</span>
              </div>
              <select id="sel-metrix-q34-range-mode" class="figma-select w-full">
                <option value="range" ${metrixPolicyState.q34_wageRangeMode === 'range' ? 'selected' : ''}>지정 범위 내 단위 랜덤 생성 (기본)</option>
                <option value="fixed" ${metrixPolicyState.q34_wageRangeMode === 'fixed' ? 'selected' : ''}>300만원 단일값 고정</option>
              </select>
              <div id="wrap-metrix-q34-range" class="metrix-q-subgrid-3" style="display:${metrixPolicyState.q34_wageRangeMode === 'range' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">최소(만원)</span>
                  <input type="number" id="num-metrix-wage-min" class="figma-input w-full" min="100" step="5" value="${metrixPolicyState.labor_wageMin}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">최대(만원)</span>
                  <input type="number" id="num-metrix-wage-max" class="figma-input w-full" min="100" step="5" value="${metrixPolicyState.labor_wageMax}" />
                </div>
                <div>
                  <span class="metrix-q-sublabel">단위(만원)</span>
                  <input type="number" id="num-metrix-wage-step" class="figma-input w-full" min="1" step="5" value="${metrixPolicyState.labor_wageStep}" />
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문35</span>
                <span class="metrix-q-title">전년 대비 종사자 수 변동 여부</span>
              </div>
              <select id="sel-metrix-q35-emp-change" class="figma-select w-full">
                <option value="2" ${metrixPolicyState.q35_empChange === '2' ? 'selected' : ''}>2. 변동 없음 100% 고정 (문35-1 스킵 · 기본)</option>
                <option value="random" ${metrixPolicyState.q35_empChange === 'random' ? 'selected' : ''}>1(증가) / 2(유지) / 3(감소) 무작위</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문43-4</span>
                <span class="metrix-q-title">향후 사업 계속 운영 이유 (1·2순위)</span>
              </div>
              <select id="sel-metrix-q43-4-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q43_4_continueReasonMode === 'random' ? 'selected' : ''}>1~6번 중 1·2순위 무작위 (기타 제외 · 기본)</option>
                <option value="1_2" ${metrixPolicyState.q43_4_continueReasonMode === '1_2' ? 'selected' : ''}>1순위 생계유지(1) · 2순위 적성·경험(2) 고정</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문44</span>
                <span class="metrix-q-title">향후 1년간 신규 투자·확장 계획 (복수)</span>
              </div>
              <select id="sel-metrix-q44-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q44_investPlanMode === 'random' ? 'selected' : ''}>1~6번 중 1~2개 또는 계획없음(8) 무작위 (기본)</option>
                <option value="none_8" ${metrixPolicyState.q44_investPlanMode === 'none_8' ? 'selected' : ''}>8. 계획 없음 100% 고정</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 그룹 5: 지원정책 · 제조업 추가문항 · 사진 · 주관식 -->
        <div class="metrix-section-block">
          <h4 class="metrix-section-heading"><i class="fa-solid fa-landmark"></i> 5. 소상공인 지원정책 · 추가문항 · 마무리 (문60 ~ CHECK1)</h4>
          <div class="metrix-q-grid">
            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문60</span>
                <span class="metrix-q-title">지원기관 인지도 (보증지원 O/X 자동연동)</span>
              </div>
              <select id="sel-metrix-q60-rule" class="figma-select w-full">
                <option value="guarantee_sync" ${metrixPolicyState.q60_awarenessRule === 'guarantee_sync' ? 'selected' : ''}>보증=X면 ①·②번 중, 보증=O면 ③·④번 중 응답 (기본)</option>
                <option value="random" ${metrixPolicyState.q60_awarenessRule === 'random' ? 'selected' : ''}>1~4번 전체 무작위 응답</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문66-1</span>
                <span class="metrix-q-title">타 기관 지원사업 인지 경로 (복수)</span>
              </div>
              <select id="sel-metrix-q66-1-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q66_1_otherOrgRouteMode === 'random' ? 'selected' : ''}>1~7번 중 1~2개 무작위 응답 (기타 제외 · 기본)</option>
                <option value="fixed_2_5" ${metrixPolicyState.q66_1_otherOrgRouteMode === 'fixed_2_5' ? 'selected' : ''}>2(인터넷·SNS) + 5(주변 지인) 고정</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문67</span>
                <span class="metrix-q-title">경기도 소상공인 희망 지원정책 (1~3순위)</span>
              </div>
              <select id="sel-metrix-q67-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q67_desiredSupportMode === 'random' ? 'selected' : ''}>1~10번 중 1·2·3순위 무작위 (기타 제외 · 기본)</option>
                <option value="fixed" ${metrixPolicyState.q67_desiredSupportMode === 'fixed' ? 'selected' : ''}>고정 순위 지정 (금융·세제·점포개선 등)</option>
              </select>
              <div id="wrap-metrix-q67-fixed" class="metrix-q-subgrid-3" style="display:${metrixPolicyState.q67_desiredSupportMode === 'fixed' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">1순위</span>
                  <select id="sel-metrix-support-rank1" class="figma-select w-full">
                    <option value="9" ${metrixPolicyState.desired_support_rank1 === '9' || metrixPolicyState.desired_support_rank1 === '1' ? 'selected' : ''}>9. 금융지원(자금)</option>
                    <option value="10" ${metrixPolicyState.desired_support_rank1 === '10' ? 'selected' : ''}>10. 세제지원</option>
                    <option value="5" ${metrixPolicyState.desired_support_rank1 === '5' ? 'selected' : ''}>5. 점포환경개선</option>
                    <option value="4" ${metrixPolicyState.desired_support_rank1 === '4' ? 'selected' : ''}>4. 디지털 전환</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">2순위</span>
                  <select id="sel-metrix-support-rank2" class="figma-select w-full">
                    <option value="10" ${metrixPolicyState.desired_support_rank2 === '10' || metrixPolicyState.desired_support_rank2 === '2' ? 'selected' : ''}>10. 세제지원</option>
                    <option value="5" ${metrixPolicyState.desired_support_rank2 === '5' ? 'selected' : ''}>5. 점포환경개선</option>
                    <option value="9" ${metrixPolicyState.desired_support_rank2 === '9' ? 'selected' : ''}>9. 금융지원(자금)</option>
                    <option value="4" ${metrixPolicyState.desired_support_rank2 === '4' ? 'selected' : ''}>4. 디지털 전환</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">3순위</span>
                  <select id="sel-metrix-support-rank3" class="figma-select w-full">
                    <option value="5" ${metrixPolicyState.desired_support_rank3 === '5' ? 'selected' : ''}>5. 점포환경개선</option>
                    <option value="9" ${metrixPolicyState.desired_support_rank3 === '9' ? 'selected' : ''}>9. 금융지원(자금)</option>
                    <option value="10" ${metrixPolicyState.desired_support_rank3 === '10' ? 'selected' : ''}>10. 세제지원</option>
                    <option value="4" ${metrixPolicyState.desired_support_rank3 === '4' ? 'selected' : ''}>4. 디지털 전환</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문68</span>
                <span class="metrix-q-title">지원정책 이용 시 애로사항 (1~3순위)</span>
              </div>
              <select id="sel-metrix-q68-mode" class="figma-select w-full">
                <option value="random" ${metrixPolicyState.q68_policyIssueMode === 'random' ? 'selected' : ''}>1~8번 중 1·2·3순위 무작위 (기타 제외 · 기본)</option>
                <option value="fixed" ${metrixPolicyState.q68_policyIssueMode === 'fixed' ? 'selected' : ''}>고정 순위 직접 지정</option>
              </select>
              <div id="wrap-metrix-q68-fixed" class="metrix-q-subgrid-3" style="display:${metrixPolicyState.q68_policyIssueMode === 'fixed' ? '' : 'none'};">
                <div>
                  <span class="metrix-q-sublabel">1순위</span>
                  <select id="sel-metrix-issue-rank1" class="figma-select w-full">
                    <option value="6" ${metrixPolicyState.policy_issue_rank1 === '6' ? 'selected' : ''}>6. 서류·절차 복잡</option>
                    <option value="8" ${metrixPolicyState.policy_issue_rank1 === '8' ? 'selected' : ''}>8. 홍보·정보 부족</option>
                    <option value="5" ${metrixPolicyState.policy_issue_rank1 === '5' ? 'selected' : ''}>5. 자격요건 까다로움</option>
                    <option value="4" ${metrixPolicyState.policy_issue_rank1 === '4' ? 'selected' : ''}>4. 지원금액 부족</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">2순위</span>
                  <select id="sel-metrix-issue-rank2" class="figma-select w-full">
                    <option value="8" ${metrixPolicyState.policy_issue_rank2 === '8' ? 'selected' : ''}>8. 홍보·정보 부족</option>
                    <option value="6" ${metrixPolicyState.policy_issue_rank2 === '6' ? 'selected' : ''}>6. 서류·절차 복잡</option>
                    <option value="5" ${metrixPolicyState.policy_issue_rank2 === '5' ? 'selected' : ''}>5. 자격요건 까다로움</option>
                    <option value="4" ${metrixPolicyState.policy_issue_rank2 === '4' ? 'selected' : ''}>4. 지원금액 부족</option>
                  </select>
                </div>
                <div>
                  <span class="metrix-q-sublabel">3순위</span>
                  <select id="sel-metrix-issue-rank3" class="figma-select w-full">
                    <option value="5" ${metrixPolicyState.policy_issue_rank3 === '5' ? 'selected' : ''}>5. 자격요건 까다로움</option>
                    <option value="4" ${metrixPolicyState.policy_issue_rank3 === '4' ? 'selected' : ''}>4. 지원금액 부족</option>
                    <option value="6" ${metrixPolicyState.policy_issue_rank3 === '6' ? 'selected' : ''}>6. 서류·절차 복잡</option>
                    <option value="8" ${metrixPolicyState.policy_issue_rank3 === '8' ? 'selected' : ''}>8. 홍보·정보 부족</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">문69</span>
                <span class="metrix-q-title">제조업 추가 문항 처리 규칙</span>
              </div>
              <select id="sel-metrix-q69-mfg-rule" class="figma-select w-full">
                <option value="all_no" ${metrixPolicyState.q69_mfgAddRule === 'all_no' ? 'selected' : ''}>전부 '없음(아니오)' 처리하여 하위문항 스킵 (기본)</option>
                <option value="random" ${metrixPolicyState.q69_mfgAddRule === 'random' ? 'selected' : ''}>일부 해당 있음 무작위 응답</option>
              </select>
            </div>

            <div class="metrix-q-card">
              <div class="metrix-q-head">
                <span class="metrix-q-num">CHECK1</span>
                <span class="metrix-q-title">간판·명함 증빙 사진 문항 처리</span>
              </div>
              <select id="sel-metrix-check1-upload-mode" class="figma-select w-full">
                <option value="skip_upload" ${metrixPolicyState.check1_photoUploadMode === 'skip_upload' ? 'selected' : ''}>사진 업로드 없이 바로 [다음] 진행 (기본)</option>
                <option value="upload_sample" ${metrixPolicyState.check1_photoUploadMode === 'upload_sample' ? 'selected' : ''}>견본 이미지(sample_metrix_sign.png) 업로드</option>
              </select>
            </div>

            <div class="metrix-q-card metrix-q-card-wide">
              <div class="metrix-q-head">
                <span class="metrix-q-num">주관식</span>
                <span class="metrix-q-title">공통 경영 애로사항 및 정책 건의사항 기본 코멘트 (업종별 코멘트 미설정 시 사용)</span>
              </div>
              <textarea id="txt-metrix-comment" class="figma-input w-full" rows="2" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(metrixPolicyState.open_ended_comment)}</textarea>
            </div>
          </div>
        </div>

      </div>

      <!-- [탭 2] 8대 업종별 기본 수치 (클릭 시 바로 아래에서 즉시 편집) -->
      <div id="metrix-tab-panel-industries" class="metrix-guide-panel" style="display:${activeTab === 'industries' ? 'block' : 'none'};">
        <div class="flex-between mb-12" style="flex-wrap:wrap; gap:10px;">
          <div style="font-size:13px; color:#334155;">
            사업체의 업종코드에 맞춰 영업시간·영업비용·결제수단 비중이 자동 반영됩니다. <strong>업종 카드를 클릭하면 바로 아래 편집기에서 수치를 수정</strong>할 수 있습니다.
          </div>
          <button type="button" id="btn-metrix-ind-check-all" class="btn-pill btn-pill-secondary btn-pill-small font-bold">
            <i class="fa-solid fa-check-double text-primary-color"></i> 8개 전 업종 체크 켜기
          </button>
        </div>

        <!-- 8대 업종 선택 카드 그리드 (고대비 Clean Light 스타일) -->
        <div class="metrix-ind-grid">
          ${indKeys.map(k => {
            const p = metrixPolicyState.industryPolicies?.[k] || DEFAULT_METRIX_INDUSTRY_POLICIES[k];
            const st = industryStats[k] || {};
            const cnt = st.count ?? 0;
            const isAct = (metrixPolicyState._activeIndKey === k);
            return `
              <div class="metrix-ind-card ${isAct ? 'active' : ''}" data-ind-key="${k}">
                <div class="metrix-ind-card-top">
                  <label class="metrix-ind-card-name" onclick="event.stopPropagation();" style="cursor:pointer;">
                    <input type="checkbox" class="cb-metrix-ind-enable" data-ind-key="${k}" ${p.enabled !== false ? 'checked' : ''} style="accent-color:#2563eb;" />
                    <span>${escapeHtml(p.name)}</span>
                  </label>
                  <span class="metrix-ind-card-count">${cnt}건</span>
                </div>
                <div class="metrix-ind-card-meta" id="metrix-ind-meta-${k}">
                  <div>영업 <strong>${escapeHtml(p.operating_openHour)}~${escapeHtml(p.operating_closeHour)}시</strong> · 순소득 <strong>${metrixPolicyState.q13_incomeRangeMode === 'fixed' ? `${p.owner_monthlyIncome}만` : (metrixPolicyState.q13_incomeRangeMode === 'panel' ? '패널값' : `${metrixPolicyState.owner_incomeMin ?? 250}~${metrixPolicyState.owner_incomeMax ?? 400}만`)}</strong></div>
                  <div>원재료 <strong>${p.cost_materialRatio}%</strong> · 카드 <strong>${p.payment_cardRatio}%</strong> · 이체 <strong>${p.payment_transferRatio}%</strong></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 선택 업종 즉시 편집 박스 (카드 바로 밑 직결) -->
        <div class="metrix-ind-editor">
          <div class="metrix-ind-editor-head">
            <h4 class="metrix-ind-editor-title">
              <i class="fa-solid fa-sliders text-primary-color"></i>
              선택 업종 상세 수치 편집: <strong id="metrix-active-ind-name">${escapeHtml(activeIndObj.name || '3.도매 및 소매업')}</strong>
            </h4>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" id="btn-metrix-select-active-ind-quotas" class="btn-pill btn-pill-secondary btn-pill-small" title="STEP 1 목록에서 현재 업종 사업체들만 체크합니다">
                <i class="fa-solid fa-filter"></i> STEP 1에서 이 업종만 체크
              </button>
              <button type="button" id="btn-metrix-apply-ind-to-checked" class="btn-pill btn-pill-secondary btn-pill-small font-bold" title="STEP 1에 체크된 사업체들에 현재 업종 가이드를 수동 배정·저장합니다">
                <i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 체크된 사업체에 이 업종 가이드 배정
              </button>
            </div>
          </div>

          <!-- 1) 영업시간 · 정기휴무 · 대표자 월평균 순소득 -->
          <div class="qb-grid-2col" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
            <div>
              <span class="metrix-q-sublabel">개점 시각 (문8-1)</span>
              <select id="sel-metrix-open-hour" class="figma-select w-full">
                ${renderHourOptions(activeIndObj.operating_openHour || '09', 6, 18)}
              </select>
            </div>
            <div>
              <span class="metrix-q-sublabel">폐점 시각 (문8-1)</span>
              <select id="sel-metrix-close-hour" class="figma-select w-full">
                ${renderHourOptions(activeIndObj.operating_closeHour || '20', 15, 24)}
              </select>
            </div>
            <div>
              <span class="metrix-q-sublabel">정기 휴무 빈도 (문8-2)</span>
              <select id="sel-metrix-closed-days" class="figma-select w-full">
                <option value="0" ${String(activeIndObj.operating_closedDays) === '0' ? 'selected' : ''}>연중무휴 (정기휴무 없음)</option>
                <option value="1" ${String(activeIndObj.operating_closedDays) === '1' ? 'selected' : ''}>주 1회 정기 휴무</option>
                <option value="2" ${String(activeIndObj.operating_closedDays) === '2' ? 'selected' : ''}>주 2회 휴무 (주말 등)</option>
              </select>
            </div>
            <div>
              <span class="metrix-q-sublabel">정기 휴무 요일</span>
              <select id="sel-metrix-closed-dow" class="figma-select w-full">
                <option value="7" ${String(activeIndObj.operating_closedDayOfWeek) === '7' ? 'selected' : ''}>일요일</option>
                <option value="1" ${String(activeIndObj.operating_closedDayOfWeek) === '1' ? 'selected' : ''}>월요일</option>
                <option value="2" ${String(activeIndObj.operating_closedDayOfWeek) === '2' ? 'selected' : ''}>화요일</option>
                <option value="6" ${String(activeIndObj.operating_closedDayOfWeek) === '6' ? 'selected' : ''}>토요일</option>
              </select>
            </div>
            <div>
              <span class="metrix-q-sublabel">대표자 월평균 순소득 (문13 고정모드 시, 만원)</span>
              <input type="number" id="num-metrix-owner-income" class="figma-input w-full" min="50" max="5000" step="10" value="${activeIndObj.owner_monthlyIncome ?? 320}" />
            </div>
          </div>

          <!-- 2) 문11-1: 6대 영업비용 구성비 (합계 100%) -->
          <div class="metrix-ratio-box">
            <div class="flex-between mb-8">
              <strong style="font-size:13px; color:#0f172a;">문11-1 · 6대 영업비용 구성비 (합계 100% 필수)</strong>
              <span id="badge-metrix-cost-total" class="badge-status ready">합계 100% 정상</span>
            </div>
            <div class="metrix-ratio-grid-6">
              <div>
                <span class="metrix-q-sublabel">① 원재료·매입(%)</span>
                <input type="number" id="num-metrix-cost-mat" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_materialRatio ?? 55}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">② 인건비(%)</span>
                <input type="number" id="num-metrix-cost-labor" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_laborRatio ?? 15}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">③ 임차료(%)</span>
                <input type="number" id="num-metrix-cost-rent" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_rentRatio ?? 15}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">④ 세금·공과금(%)</span>
                <input type="number" id="num-metrix-cost-tax" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_taxRatio ?? 7}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">⑤ 수수료·광고(%)</span>
                <input type="number" id="num-metrix-cost-fee" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_feeAdRatio ?? 4}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">⑥ 기타비용(%)</span>
                <input type="number" id="num-metrix-cost-other" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${activeIndObj.cost_otherRatio ?? 4}" />
              </div>
            </div>
          </div>

          <!-- 3) 문14: 6대 결제수단 매출 비중 (합계 100%) -->
          <div class="metrix-ratio-box">
            <div class="flex-between mb-8">
              <strong style="font-size:13px; color:#0f172a;">문14 · 6대 결제수단 매출 비중 (합계 100% 필수)</strong>
              <span id="badge-metrix-pay-total" class="badge-status ready">합계 100% 정상</span>
            </div>
            <div class="metrix-ratio-grid-6">
              <div>
                <span class="metrix-q-sublabel">① 현금(%)</span>
                <input type="number" id="num-metrix-pay-cash" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_cashRatio ?? 10}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">② 신용·체크카드(%)</span>
                <input type="number" id="num-metrix-pay-card" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_cardRatio ?? 65}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">③ 지역화폐(%)</span>
                <input type="number" id="num-metrix-pay-local" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_localCurrencyRatio ?? 10}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">④ 간편결제(%)</span>
                <input type="number" id="num-metrix-pay-mobile" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_mobileRatio ?? 10}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">⑤ 상품권(%)</span>
                <input type="number" id="num-metrix-pay-voucher" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_voucherRatio ?? 0}" />
              </div>
              <div>
                <span class="metrix-q-sublabel">⑥ 계좌이체·세금계산서(%)</span>
                <input type="number" id="num-metrix-pay-transfer" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${activeIndObj.payment_transferRatio ?? 5}" />
              </div>
            </div>
          </div>

          <!-- 4) 업종별 맞춤 주관식 코멘트 -->
          <div class="metrix-ratio-box">
            <span class="metrix-q-sublabel">이 업종의 주관식 건의사항 코멘트</span>
            <textarea id="txt-metrix-ind-comment" class="figma-input w-full" rows="2" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(activeIndObj.open_ended_comment || '')}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSeoulPanelHtml(metrixPolicyState) {
  return `
    <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-shield-halved"></i> 핵심 실행 원칙</span>
          <h3 class="blueprint-stage-title">svyA115.asp (99% 동의서) 절대 안전 대기 · 4차년도 서버 기주입값 보존 · 구글 스프레드시트(시트2) 자동 기록</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-database"></i> 2010 송준희(74) + 2016 정소영(89) 총 163건 연동</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        2026년 서울시 소상공인 사업체 패널조사(5차)는 <strong>절대 완료(Out.asp) 처리하지 않고</strong> <code>svyA115.asp</code>(개인정보 및 패널 참여 동의서 99%) 화면에서 무조건 정지합니다. 서버가 4차년도 응답값으로 미리 채워둔 문항은 100% 보존하며, 전체 문항 응답 내역을 구글 스프레드시트(시트2)에 실시간으로 기록합니다.
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-safety-stop" class="assoc-rule-cb" ${metrixPolicyState.safetyStopAtReview !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-success"><i class="fa-solid fa-circle-check"></i> svyA115.asp (99% 동의서) 도달 시 즉시 안전 정지 [필수]</strong>
              <div class="assoc-rule-desc">A~O 전 문항 응답 후 svyA115.asp(99%)에 도달하면 [다음]을 누르지 않고 즉시 정지하여 절대 완료(Out.asp)되지 않도록 보호합니다.</div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-inherit-rawmeta" class="assoc-rule-cb" ${metrixPolicyState.inheritPanelRawMeta !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-primary-color"><i class="fa-solid fa-link"></i> 4차년도 서버 프리필(Pre-fill) &amp; C3 영업비용 정합 계산</strong>
              <div class="assoc-rule-desc">서버가 주입한 영업비용 총액(C3_2_4)에 맞춰 2026년 세부 비용 4항목(원재료비·임차료·공과금·수수료)을 오차 0원으로 자동 산출합니다.</div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-preserve-inputs" class="assoc-rule-cb" ${metrixPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">기입력된 설문 항목 보존</strong>
              <div class="assoc-rule-desc">일반 문항의 기입력값은 보존하며, 5차 신규 추가 문항(M·N·O) 빈칸만 아래 가이드에 맞춰 자동 완성합니다.</div>
            </div>
          </label>
        </div>
      </div>
    </section>

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
        <div class="qb-grid-2col mb-10">
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
              <option value="2_3_mixed" ${metrixPolicyState.seoul_o1_carbon === '2_3_mixed' ? 'selected' : ''}>O1~O4 2~3점 지그재그 자연 분산 (권장)</option>
              <option value="3_4_positive" ${metrixPolicyState.seoul_o1_carbon === '3_4_positive' ? 'selected' : ''}>3~4점 친환경·에너지 절약 적극 실천 중심</option>
            </select>
          </div>
        </div>
        <div>
          <label class="figma-label font-bold">경영 애로사항 및 정책 건의사항 주관식 코멘트</label>
          <textarea id="txt-metrix-comment" class="figma-input w-full" rows="2" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(metrixPolicyState.open_ended_comment)}</textarea>
        </div>
      </div>
    </section>
  `;
}

export function renderMetrixBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas }) {
  const isSeoulPanel = (data.surveyType === 'metrix_seoul_panel');
  const metrixPolicyState = { ...(data.policy || data.blueprint?.defaultPolicy || {}) };
  metrixPolicyState._isSeoulPanel = isSeoulPanel;

  // 0. 핵심 실행 원칙 기본값 보장
  if (!isSeoulPanel) {
    metrixPolicyState.safetyStopAtReview = true;
    metrixPolicyState.preserveExistingInputs = true;
    metrixPolicyState.skipCompletedSlots = true;
    metrixPolicyState.inheritPanelRawMeta = true;
    metrixPolicyState.excludeClosedBiz = true;
    metrixPolicyState.updatePhoneInContactPopup = true;
    metrixPolicyState.useIndustryGuidelines = true;
  } else {
    if (metrixPolicyState.safetyStopAtReview === undefined) metrixPolicyState.safetyStopAtReview = true;
    if (metrixPolicyState.preserveExistingInputs === undefined) metrixPolicyState.preserveExistingInputs = true;
    if (metrixPolicyState.skipCompletedSlots === undefined) metrixPolicyState.skipCompletedSlots = true;
    if (metrixPolicyState.inheritPanelRawMeta === undefined) metrixPolicyState.inheritPanelRawMeta = true;
  }

  const mergedIndPolicies = JSON.parse(JSON.stringify(DEFAULT_METRIX_INDUSTRY_POLICIES));
  const incomingInd = data.industryPolicies || metrixPolicyState.industryPolicies || {};
  Object.keys(mergedIndPolicies).forEach(k => {
    if (incomingInd[k]) {
      mergedIndPolicies[k] = { ...mergedIndPolicies[k], ...incomingInd[k] };
    }
  });
  metrixPolicyState.industryPolicies = mergedIndPolicies;
  if (!metrixPolicyState._activeIndKey) metrixPolicyState._activeIndKey = 'ind_3';
  if (!metrixPolicyState._activeGuideTab) metrixPolicyState._activeGuideTab = 'questions';
  const industryStats = data.industryStats || {};

  // 백엔드 러너(metrix-runner.js) 호환 폴백 기본값 유지
  if (metrixPolicyState.general_bindAddressReadonly === undefined) metrixPolicyState.general_bindAddressReadonly = true;
  if (!metrixPolicyState.general_franchiseMode) metrixPolicyState.general_franchiseMode = 'panel_or_non_franchise';
  if (metrixPolicyState.general_defaultAreaPyeong === undefined) metrixPolicyState.general_defaultAreaPyeong = 30;
  if (!metrixPolicyState.general_locationType) metrixPolicyState.general_locationType = '1';
  if (!metrixPolicyState.general_founderType) metrixPolicyState.general_founderType = '1';
  if (!metrixPolicyState.general_prevStatus) metrixPolicyState.general_prevStatus = '1';

  if (!metrixPolicyState.operating_openHour) metrixPolicyState.operating_openHour = '09';
  if (!metrixPolicyState.operating_closeHour) metrixPolicyState.operating_closeHour = '20';
  if (!metrixPolicyState.operating_closedDays) metrixPolicyState.operating_closedDays = '1';
  if (!metrixPolicyState.operating_closedDayOfWeek) metrixPolicyState.operating_closedDayOfWeek = '7';
  if (!metrixPolicyState.digital_onlineSales) metrixPolicyState.digital_onlineSales = 'panel_or_no';
  if (!metrixPolicyState.digital_smartTech) metrixPolicyState.digital_smartTech = 'panel_or_pos';

  if (!metrixPolicyState.sales_trend2025) metrixPolicyState.sales_trend2025 = 'maintain';
  if (!metrixPolicyState.sales_changeReasonRank1) metrixPolicyState.sales_changeReasonRank1 = '1';
  if (!metrixPolicyState.sales_changeReasonRank2) metrixPolicyState.sales_changeReasonRank2 = '2';
  if (metrixPolicyState.owner_monthlyIncome === undefined) metrixPolicyState.owner_monthlyIncome = 320;

  if (metrixPolicyState.cost_materialRatio === undefined) metrixPolicyState.cost_materialRatio = 55;
  if (metrixPolicyState.cost_laborRatio === undefined) metrixPolicyState.cost_laborRatio = 15;
  if (metrixPolicyState.cost_rentRatio === undefined) metrixPolicyState.cost_rentRatio = 15;
  if (metrixPolicyState.cost_taxRatio === undefined) metrixPolicyState.cost_taxRatio = 7;
  if (metrixPolicyState.cost_feeAdRatio === undefined) metrixPolicyState.cost_feeAdRatio = 4;
  if (metrixPolicyState.cost_otherRatio === undefined) metrixPolicyState.cost_otherRatio = 4;

  if (metrixPolicyState.payment_cashRatio === undefined) metrixPolicyState.payment_cashRatio = 10;
  if (metrixPolicyState.payment_cardRatio === undefined) metrixPolicyState.payment_cardRatio = 65;
  if (metrixPolicyState.payment_localCurrencyRatio === undefined) metrixPolicyState.payment_localCurrencyRatio = 10;
  if (metrixPolicyState.payment_mobileRatio === undefined) metrixPolicyState.payment_mobileRatio = 10;
  if (metrixPolicyState.payment_voucherRatio === undefined) metrixPolicyState.payment_voucherRatio = 0;
  if (metrixPolicyState.payment_transferRatio === undefined) metrixPolicyState.payment_transferRatio = 5;

  if (!metrixPolicyState.debt_hasDebt) metrixPolicyState.debt_hasDebt = 'panel_or_no';
  if (metrixPolicyState.debt_totalAmount === undefined) metrixPolicyState.debt_totalAmount = 5000;
  if (metrixPolicyState.debt_bankRatio === undefined) metrixPolicyState.debt_bankRatio = 70;
  if (metrixPolicyState.debt_secondTierRatio === undefined) metrixPolicyState.debt_secondTierRatio = 10;
  if (metrixPolicyState.debt_policyRatio === undefined) metrixPolicyState.debt_policyRatio = 20;
  if (metrixPolicyState.debt_otherRatio === undefined) metrixPolicyState.debt_otherRatio = 0;
  if (!metrixPolicyState.debt_reasonRank1) metrixPolicyState.debt_reasonRank1 = '1';
  if (!metrixPolicyState.debt_reasonRank2) metrixPolicyState.debt_reasonRank2 = '2';
  if (!metrixPolicyState.funding_guaranteeRule) metrixPolicyState.funding_guaranteeRule = 'excel_sync';
  if (!metrixPolicyState.funding_whenGuaranteeX) metrixPolicyState.funding_whenGuaranteeX = '1';

  if (!metrixPolicyState.lease_type) metrixPolicyState.lease_type = 'monthly_deposit';
  if (metrixPolicyState.lease_deposit === undefined) metrixPolicyState.lease_deposit = 2000;
  if (metrixPolicyState.lease_monthlyRent === undefined) metrixPolicyState.lease_monthlyRent = 120;
  if (metrixPolicyState.lease_contractYears === undefined) metrixPolicyState.lease_contractYears = 5;
  if (!metrixPolicyState.goodwill_hasGoodwill) metrixPolicyState.goodwill_hasGoodwill = 'panel_or_no';
  if (metrixPolicyState.goodwill_amount === undefined) metrixPolicyState.goodwill_amount = 1000;
  if (!metrixPolicyState.goodwill_recoveryExpect) metrixPolicyState.goodwill_recoveryExpect = '2';

  if (!metrixPolicyState.hardship_rank1) metrixPolicyState.hardship_rank1 = '3';
  if (!metrixPolicyState.hardship_rank2) metrixPolicyState.hardship_rank2 = '7';
  if (!metrixPolicyState.market_competitionLevel) metrixPolicyState.market_competitionLevel = '5';
  if (!metrixPolicyState.future_businessPlan) metrixPolicyState.future_businessPlan = '1';
  if (!metrixPolicyState.future_reemploymentPlan) metrixPolicyState.future_reemploymentPlan = '2';

  if (metrixPolicyState.employee_owner === undefined) metrixPolicyState.employee_owner = 1;
  if (metrixPolicyState.employee_family === undefined) metrixPolicyState.employee_family = 0;
  if (metrixPolicyState.employee_regular === undefined) metrixPolicyState.employee_regular = 1;
  if (metrixPolicyState.employee_temp === undefined) metrixPolicyState.employee_temp = 0;
  if (metrixPolicyState.labor_ownerWeeklyHours === undefined) metrixPolicyState.labor_ownerWeeklyHours = 45;
  if (metrixPolicyState.labor_staffWeeklyHours === undefined) metrixPolicyState.labor_staffWeeklyHours = 40;
  if (!metrixPolicyState.labor_insuranceMode) metrixPolicyState.labor_insuranceMode = 'panel_or_standard';
  if (metrixPolicyState.labor_avgMonthlyWage === undefined) metrixPolicyState.labor_avgMonthlyWage = 300;
  if (!metrixPolicyState.labor_hiringDifficulty) metrixPolicyState.labor_hiringDifficulty = '3';

  if (!metrixPolicyState.policy_experienceMode) metrixPolicyState.policy_experienceMode = 'panel_or_no';
  if (!metrixPolicyState.satisfaction_mode) metrixPolicyState.satisfaction_mode = 'mixed_3_4';
  if (!metrixPolicyState.desired_support_rank1) metrixPolicyState.desired_support_rank1 = '9';
  if (!metrixPolicyState.desired_support_rank2) metrixPolicyState.desired_support_rank2 = '10';

  if (!metrixPolicyState.open_ended_comment) {
    metrixPolicyState.open_ended_comment = '지속되는 고물가로 인해 원재료비 및 공공요금 부담이 큽니다. 경기신용보증재단 저금리 특례보증 대출 한도 확대와 상환 거치기간 연장, 점포 시설개선 지원이 지속되었으면 합니다.';
  }
  if (!metrixPolicyState.evidence_sign_image) {
    metrixPolicyState.evidence_sign_image = 'data/sample_metrix_sign.png';
  }

  // 경기도 3차 본조사 문항별 정밀 가이드 기본값
  if (!metrixPolicyState.q10_fundMgmtMode) metrixPolicyState.q10_fundMgmtMode = 'random';
  if (!metrixPolicyState.q12_1_evalReasonMode) metrixPolicyState.q12_1_evalReasonMode = 'random';
  if (!metrixPolicyState.q13_incomeRangeMode) metrixPolicyState.q13_incomeRangeMode = 'range';
  if (metrixPolicyState.owner_incomeMin === undefined) metrixPolicyState.owner_incomeMin = 250;
  if (metrixPolicyState.owner_incomeMax === undefined) metrixPolicyState.owner_incomeMax = 400;
  if (metrixPolicyState.owner_incomeStep === undefined) metrixPolicyState.owner_incomeStep = 5;
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
  if (!metrixPolicyState.desired_support_rank3) metrixPolicyState.desired_support_rank3 = '5';
  if (!metrixPolicyState.q68_policyIssueMode) metrixPolicyState.q68_policyIssueMode = 'random';
  if (!metrixPolicyState.policy_issue_rank1) metrixPolicyState.policy_issue_rank1 = '6';
  if (!metrixPolicyState.policy_issue_rank2) metrixPolicyState.policy_issue_rank2 = '8';
  if (!metrixPolicyState.policy_issue_rank3) metrixPolicyState.policy_issue_rank3 = '5';
  if (!metrixPolicyState.q69_mfgAddRule) metrixPolicyState.q69_mfgAddRule = 'all_no';
  if (!metrixPolicyState.check1_photoUploadMode) metrixPolicyState.check1_photoUploadMode = 'skip_upload';

  if (!metrixPolicyState.seoul_m1_rank1) metrixPolicyState.seoul_m1_rank1 = '1';
  if (!metrixPolicyState.seoul_m2_rank1) metrixPolicyState.seoul_m2_rank1 = '2';
  if (!metrixPolicyState.seoul_m3_rank1) metrixPolicyState.seoul_m3_rank1 = '1';
  if (!metrixPolicyState.seoul_n2_aiAdoption) metrixPolicyState.seoul_n2_aiAdoption = 'all_2_unused';
  if (!metrixPolicyState.seoul_o1_carbon) metrixPolicyState.seoul_o1_carbon = '2_3_mixed';

  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';

  // 불필요한 구버전 프리셋 칩 및 템플릿 선택기 숨김
  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) presetGroup.style.display = 'none';

  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';

  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) {
    titleEl.textContent = isSeoulPanel
      ? '(신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차) 전 문항 가이드라인'
      : '경기도 소상공인 패널 3차 설문 응답 가이드';
  }

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = isSeoulPanel
      ? '4차년도 서버 기주입값 100% 보존 + C3 세부 비용 정합 산출 + 5차 신규 문항(M·N·O) + svyA115.asp(99%) 안전 대기 설정입니다.'
      : '3차 본조사 문항별 응답 규칙(문10~문69)과 8대 업종별 기본 수치를 한곳에서 설정합니다.';
  }

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = isSeoulPanel
      ? '<i class="fa-solid fa-shield-halved"></i> 서울시 패널 5차 115단계 활성 (svyA115 99% 안전 대기)'
      : '<i class="fa-solid fa-shield-halved"></i> 자동 안전원칙 적용중 (폐업 제외 · 컨택 휴대폰 저장 · 98% 안전대기)';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = isSeoulPanel
      ? '<i class="fa-solid fa-floppy-disk"></i> 서울시 패널 5차 가이드 저장'
      : '<i class="fa-solid fa-floppy-disk"></i> 설문 가이드 저장';
    btnSaveBaseline.title = isSeoulPanel
      ? '서울시 소상공인 사업체 패널조사(5차) 기준 가이드라인 설정 저장'
      : '경기도 소상공인 패널 3차 설문 응답 가이드 저장';
  }

  if (!blueprintStageGrid) return metrixPolicyState;

  const indKeys = ['ind_1', 'ind_2', 'ind_3', 'ind_5', 'ind_6', 'ind_7', 'ind_8', 'ind_9'];
  const enabledIndCount = indKeys.filter(k => metrixPolicyState.industryPolicies?.[k]?.enabled !== false).length;
  const activeIndObj = metrixPolicyState.industryPolicies?.[metrixPolicyState._activeIndKey] || metrixPolicyState.industryPolicies?.ind_3 || {};

  blueprintStageGrid.innerHTML = isSeoulPanel
    ? renderSeoulPanelHtml(metrixPolicyState)
    : renderGyeonggiCleanHtml({ metrixPolicyState, indKeys, enabledIndCount, activeIndObj, industryStats });

  bindMetrixEvents({ metrixPolicyState, appendLog, onApplyIndustryGuideToChecked, onSelectIndustryQuotas });
  return metrixPolicyState;
}
