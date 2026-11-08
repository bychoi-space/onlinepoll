import { escapeHtml } from './blueprint-utils.js';

export function syncMetrixInputsToState(metrixPolicyState) {
  const cbSafetyStop = document.getElementById('cb-metrix-safety-stop');
  if (cbSafetyStop) metrixPolicyState.safetyStopAtReview = cbSafetyStop.checked;

  const cbPreserve = document.getElementById('cb-metrix-preserve-inputs');
  if (cbPreserve) metrixPolicyState.preserveExistingInputs = cbPreserve.checked;

  const cbSkipCompleted = document.getElementById('cb-metrix-skip-completed');
  if (cbSkipCompleted) metrixPolicyState.skipCompletedSlots = cbSkipCompleted.checked;

  const selOpenHour = document.getElementById('sel-metrix-open-hour');
  if (selOpenHour) metrixPolicyState.operating_openHour = selOpenHour.value;

  const selCloseHour = document.getElementById('sel-metrix-close-hour');
  if (selCloseHour) metrixPolicyState.operating_closeHour = selCloseHour.value;

  const selClosedDays = document.getElementById('sel-metrix-closed-days');
  if (selClosedDays) metrixPolicyState.operating_closedDays = selClosedDays.value;

  const selClosedDow = document.getElementById('sel-metrix-closed-dow');
  if (selClosedDow) metrixPolicyState.operating_closedDayOfWeek = selClosedDow.value;

  const selSalesTrend = document.getElementById('sel-metrix-sales-trend');
  if (selSalesTrend) metrixPolicyState.sales_trend2025 = selSalesTrend.value;

  const numCostMat = document.getElementById('num-metrix-cost-mat');
  if (numCostMat) metrixPolicyState.cost_materialRatio = Number(numCostMat.value) || 0;

  const numCostRent = document.getElementById('num-metrix-cost-rent');
  if (numCostRent) metrixPolicyState.cost_rentRatio = Number(numCostRent.value) || 0;

  const numCostTax = document.getElementById('num-metrix-cost-tax');
  if (numCostTax) metrixPolicyState.cost_taxRatio = Number(numCostTax.value) || 0;

  const numCostOther = document.getElementById('num-metrix-cost-other');
  if (numCostOther) metrixPolicyState.cost_otherRatio = Number(numCostOther.value) || 0;

  const numPayCard = document.getElementById('num-metrix-pay-card');
  if (numPayCard) metrixPolicyState.payment_cardRatio = Number(numPayCard.value) || 0;

  const numPayMobile = document.getElementById('num-metrix-pay-mobile');
  if (numPayMobile) metrixPolicyState.payment_mobileRatio = Number(numPayMobile.value) || 0;

  const numPayCash = document.getElementById('num-metrix-pay-cash');
  if (numPayCash) metrixPolicyState.payment_cashRatio = Number(numPayCash.value) || 0;

  const selDebtRank1 = document.getElementById('sel-metrix-debt-rank1');
  if (selDebtRank1) metrixPolicyState.debt_reasonRank1 = selDebtRank1.value;

  const selDebtRank2 = document.getElementById('sel-metrix-debt-rank2');
  if (selDebtRank2) metrixPolicyState.debt_reasonRank2 = selDebtRank2.value;

  const selLeaseType = document.getElementById('sel-metrix-lease-type');
  if (selLeaseType) metrixPolicyState.lease_type = selLeaseType.value;

  const numLeaseDeposit = document.getElementById('num-metrix-lease-deposit');
  if (numLeaseDeposit) metrixPolicyState.lease_deposit = Number(numLeaseDeposit.value) || 0;

  const numLeaseRent = document.getElementById('num-metrix-lease-rent');
  if (numLeaseRent) metrixPolicyState.lease_monthlyRent = Number(numLeaseRent.value) || 0;

  const numEmpFamily = document.getElementById('num-metrix-emp-family');
  if (numEmpFamily) metrixPolicyState.employee_family = Number(numEmpFamily.value) || 0;

  const selSatMode = document.getElementById('sel-metrix-satisfaction-mode');
  if (selSatMode) metrixPolicyState.satisfaction_mode = selSatMode.value;

  const selSupRank1 = document.getElementById('sel-metrix-support-rank1');
  if (selSupRank1) metrixPolicyState.desired_support_rank1 = selSupRank1.value;

  const selSupRank2 = document.getElementById('sel-metrix-support-rank2');
  if (selSupRank2) metrixPolicyState.desired_support_rank2 = selSupRank2.value;

  const txtComment = document.getElementById('txt-metrix-comment');
  if (txtComment) metrixPolicyState.open_ended_comment = txtComment.value;

  const txtSignImg = document.getElementById('txt-metrix-sign-image');
  if (txtSignImg) metrixPolicyState.evidence_sign_image = txtSignImg.value;

  return metrixPolicyState;
}

export function bindMetrixEvents({ metrixPolicyState, appendLog }) {
  // 1. 비용 밸런서 실시간 합계 계산
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

  // 2. 결제수단 밸런서 실시간 합계 계산
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

  // 3. 빠른 프리셋 버튼 제어
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
      const selSales = document.getElementById('sel-metrix-sales-trend');
      if (selSales) selSales.value = 'maintain';
      const selSat = document.getElementById('sel-metrix-satisfaction-mode');
      if (selSat) selSat.value = 'mixed_3_4';
      const selDebt1 = document.getElementById('sel-metrix-debt-rank1');
      if (selDebt1) selDebt1.value = '1';
      const selDebt2 = document.getElementById('sel-metrix-debt-rank2');
      if (selDebt2) selDebt2.value = '2';
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "표준 소상공인" (경영유지, 보통 만족도, 운전자금 중심) 설정 적용됨.');
    });
  }

  if (btnPresetGrowth) {
    btnPresetGrowth.addEventListener('click', () => {
      setActivePresetBtn(btnPresetGrowth);
      const selSales = document.getElementById('sel-metrix-sales-trend');
      if (selSales) selSales.value = 'growth';
      const selSat = document.getElementById('sel-metrix-satisfaction-mode');
      if (selSat) selSat.value = 'positive_4_5';
      const selDebt1 = document.getElementById('sel-metrix-debt-rank1');
      if (selDebt1) selDebt1.value = '2';
      const selDebt2 = document.getElementById('sel-metrix-debt-rank2');
      if (selDebt2) selDebt2.value = '1';
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "성장·긍정형" (매출 소폭증가, 4~5점 높은 만족도) 설정 적용됨.');
    });
  }

  if (btnPresetDec) {
    btnPresetDec.addEventListener('click', () => {
      setActivePresetBtn(btnPresetDec);
      const selSales = document.getElementById('sel-metrix-sales-trend');
      if (selSales) selSales.value = 'decrease';
      const selSat = document.getElementById('sel-metrix-satisfaction-mode');
      if (selSat) selSat.value = 'neutral_3';
      const selDebt1 = document.getElementById('sel-metrix-debt-rank1');
      if (selDebt1) selDebt1.value = '1';
      const selDebt2 = document.getElementById('sel-metrix-debt-rank2');
      if (selDebt2) selDebt2.value = '3';
      syncMetrixInputsToState(metrixPolicyState);
      if (appendLog) appendLog('info', '[프리셋 적용] "생계·애로형" (매출 소폭감소, 저금리 자금지원 필요) 설정 적용됨.');
    });
  }
}

export function renderMetrixBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid, appendLog }) {
  const metrixPolicyState = { ...(data.policy || data.blueprint?.defaultPolicy || {}) };

  if (metrixPolicyState.safetyStopAtReview === undefined) metrixPolicyState.safetyStopAtReview = true;
  if (metrixPolicyState.preserveExistingInputs === undefined) metrixPolicyState.preserveExistingInputs = true;
  if (metrixPolicyState.skipCompletedSlots === undefined) metrixPolicyState.skipCompletedSlots = true;
  if (!metrixPolicyState.operating_openHour) metrixPolicyState.operating_openHour = '09';
  if (!metrixPolicyState.operating_closeHour) metrixPolicyState.operating_closeHour = '20';
  if (!metrixPolicyState.operating_closedDays) metrixPolicyState.operating_closedDays = '1';
  if (!metrixPolicyState.operating_closedDayOfWeek) metrixPolicyState.operating_closedDayOfWeek = '7';
  if (!metrixPolicyState.sales_trend2025) metrixPolicyState.sales_trend2025 = 'maintain';

  if (metrixPolicyState.cost_materialRatio === undefined) metrixPolicyState.cost_materialRatio = 70;
  if (metrixPolicyState.cost_rentRatio === undefined) metrixPolicyState.cost_rentRatio = 15;
  if (metrixPolicyState.cost_taxRatio === undefined) metrixPolicyState.cost_taxRatio = 10;
  if (metrixPolicyState.cost_otherRatio === undefined) metrixPolicyState.cost_otherRatio = 5;

  if (metrixPolicyState.payment_cardRatio === undefined) metrixPolicyState.payment_cardRatio = 70;
  if (metrixPolicyState.payment_mobileRatio === undefined) metrixPolicyState.payment_mobileRatio = 20;
  if (metrixPolicyState.payment_cashRatio === undefined) metrixPolicyState.payment_cashRatio = 10;

  if (metrixPolicyState.debt_bankRatio === undefined) metrixPolicyState.debt_bankRatio = 80;
  if (metrixPolicyState.debt_policyRatio === undefined) metrixPolicyState.debt_policyRatio = 20;
  if (!metrixPolicyState.debt_reasonRank1) metrixPolicyState.debt_reasonRank1 = '1';
  if (!metrixPolicyState.debt_reasonRank2) metrixPolicyState.debt_reasonRank2 = '2';

  if (!metrixPolicyState.lease_type) metrixPolicyState.lease_type = 'monthly_deposit';
  if (metrixPolicyState.lease_deposit === undefined) metrixPolicyState.lease_deposit = 2000;
  if (metrixPolicyState.lease_monthlyRent === undefined) metrixPolicyState.lease_monthlyRent = 80;

  if (metrixPolicyState.employee_owner === undefined) metrixPolicyState.employee_owner = 1;
  if (metrixPolicyState.employee_family === undefined) metrixPolicyState.employee_family = 0;
  if (metrixPolicyState.employee_regular === undefined) metrixPolicyState.employee_regular = 0;

  if (!metrixPolicyState.satisfaction_mode) metrixPolicyState.satisfaction_mode = 'mixed_3_4';
  if (!metrixPolicyState.desired_support_rank1) metrixPolicyState.desired_support_rank1 = '1';
  if (!metrixPolicyState.desired_support_rank2) metrixPolicyState.desired_support_rank2 = '2';

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
      <button type="button" class="btn-chip ${metrixPolicyState.sales_trend2025 === 'maintain' ? 'active' : ''}" id="btn-metrix-preset-standard" title="표준 소상공인: 경영실적 유지, 3점 보통 만족도 중심">
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
  if (titleEl) titleEl.textContent = '메트릭스 소상공인 패널조사 기준점 및 방향성 가이드라인 (120단계)';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = '경기도 소상공인 사업체패널조사의 경영실적, 비용/결제 비율, 정책 만족도, 최종 검토 대기 규칙을 설정합니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 메트릭스 패널 120단계 블루프린트 활성 (98% 안전 대기 원칙)';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 메트릭스 기준 가이드 저장';
    btnSaveBaseline.title = '메트릭스 패널조사 기준 가이드라인 설정 저장';
  }

  if (!blueprintStageGrid) return metrixPolicyState;

  blueprintStageGrid.innerHTML = `
    <!-- 카드 0: 실행 규칙 및 98% 안전 대기 (전폭) -->
    <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-shield-halved"></i> 실행 규칙</span>
          <h3 class="blueprint-stage-title">98% 안전 대기 및 기입력 보존 규칙</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-lock"></i> 검토 대기 안전 보장</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        한 번 완료 처리되면 조사원 계정에서 수정/롤백이 불가능한 메트릭스 시스템 특성을 고려하여, 100% 최종 제출을 자동으로 누르지 않고 98% 상태(검토 대기)에서 대기하도록 통제합니다.
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-safety-stop" class="assoc-rule-cb" ${metrixPolicyState.safetyStopAtReview !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-success"><i class="fa-solid fa-circle-check"></i> 최종 제출 직전 98% 안전 대기 [필수 권장]</strong>
              <div class="assoc-rule-desc">
                동의서(2중 서명) 및 CHECK1 사진 업로드까지 작성 완료 후, 최종 제출 버튼을 누르지 않고 브라우저 검토 대기 상태로 안전하게 멈춥니다.
              </div>
            </div>
          </label>
        </div>
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-metrix-preserve-inputs" class="assoc-rule-cb" ${metrixPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">기입력된 설문 항목 보존</strong>
              <div class="assoc-rule-desc">
                설문 문항 중 이미 라디오가 선택되어 있거나 텍스트가 입력된 항목은 덮어쓰지 않고 기존 입력값을 100% 보존합니다.
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
                메트릭스 관리자 목록에서 이미 '완료' 상태인 쿼터는 재실행하지 않고 자동으로 건너뜁니다.
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>

    <!-- 카드 1: 영업 현황 기준 (문8-1, 문8-2) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-clock"></i> 문8</span>
          <h3 class="blueprint-stage-title">영업시간 및 정기 휴무 기준</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 기준점 조절</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문8-1 개점/폐점 시각과 문8-2 주간 정기 휴무일 기준을 설정합니다.
      </div>
      <div class="p-14">
        <div class="qb-grid-2col mb-12">
          <div>
            <label class="figma-label font-bold">개점 시각 (문8-1)</label>
            <select id="sel-metrix-open-hour" class="figma-select w-full">
              <option value="08" ${metrixPolicyState.operating_openHour === '08' ? 'selected' : ''}>08:00 (오전 8시)</option>
              <option value="09" ${metrixPolicyState.operating_openHour === '09' ? 'selected' : ''}>09:00 (오전 9시 - 표준 기본값)</option>
              <option value="10" ${metrixPolicyState.operating_openHour === '10' ? 'selected' : ''}>10:00 (오전 10시)</option>
              <option value="11" ${metrixPolicyState.operating_openHour === '11' ? 'selected' : ''}>11:00 (오전 11시 - 외식업 등)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">폐점 시각 (문8-1)</label>
            <select id="sel-metrix-close-hour" class="figma-select w-full">
              <option value="19" ${metrixPolicyState.operating_closeHour === '19' ? 'selected' : ''}>19:00 (오후 7시)</option>
              <option value="20" ${metrixPolicyState.operating_closeHour === '20' ? 'selected' : ''}>20:00 (오후 8시 - 표준 기본값)</option>
              <option value="21" ${metrixPolicyState.operating_closeHour === '21' ? 'selected' : ''}>21:00 (오후 9시)</option>
              <option value="22" ${metrixPolicyState.operating_closeHour === '22' ? 'selected' : ''}>22:00 (오후 10시)</option>
            </select>
          </div>
        </div>
        <div class="qb-grid-2col">
          <div>
            <label class="figma-label font-bold">정기 휴무 빈도 (문8-2)</label>
            <select id="sel-metrix-closed-days" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.operating_closedDays === '1' ? 'selected' : ''}>주 1회 정기 휴무 (기본값)</option>
              <option value="2" ${metrixPolicyState.operating_closedDays === '2' ? 'selected' : ''}>격주 1회 정기 휴무</option>
              <option value="3" ${metrixPolicyState.operating_closedDays === '3' ? 'selected' : ''}>월 1회 정기 휴무</option>
              <option value="0" ${metrixPolicyState.operating_closedDays === '0' ? 'selected' : ''}>연중무휴 (휴무일 없음)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">정기 휴무 요일 (문8-2-1)</label>
            <select id="sel-metrix-closed-dow" class="figma-select w-full">
              <option value="7" ${metrixPolicyState.operating_closedDayOfWeek === '7' ? 'selected' : ''}>일요일 (기본값)</option>
              <option value="1" ${metrixPolicyState.operating_closedDayOfWeek === '1' ? 'selected' : ''}>월요일</option>
              <option value="2" ${metrixPolicyState.operating_closedDayOfWeek === '2' ? 'selected' : ''}>화요일</option>
              <option value="6" ${metrixPolicyState.operating_closedDayOfWeek === '6' ? 'selected' : ''}>토요일</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 2: 경영실적 & 영업비용 밸런서 (문10, 문11-1) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-chart-line"></i> 문10·11</span>
          <h3 class="blueprint-stage-title">경영실적 추세 &amp; 영업비용 밸런서</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-scale-balanced"></i> 합계 100% 매칭</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        2025년 경영실적 추세와 문11-1 6대 영업비용 구성 비율(합계 100%)을 설정합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">2024년 대비 2025년 경영실적 추세 (문10, 문12-1)</label>
          <select id="sel-metrix-sales-trend" class="figma-select w-full">
            <option value="maintain" ${metrixPolicyState.sales_trend2025 === 'maintain' ? 'selected' : ''}>유지 (전년도와 비슷함 - 표준 기본값)</option>
            <option value="growth" ${metrixPolicyState.sales_trend2025 === 'growth' ? 'selected' : ''}>소폭 증가 (5~10% 매출 신장)</option>
            <option value="decrease" ${metrixPolicyState.sales_trend2025 === 'decrease' ? 'selected' : ''}>소폭 감소 (5~10% 매출 감소)</option>
            <option value="random" ${metrixPolicyState.sales_trend2025 === 'random' ? 'selected' : ''}>🎲 [유지/증가/감소 자연 분산]</option>
          </select>
        </div>
        <label class="figma-label font-bold mb-6">문11-1 영업비용 세부 항목 구성 비중 (합계 100%)</label>
        <div class="grid-2col mb-8">
          <div>
            <span class="font-caption text-dim">원재료비·상품매입비 (%)</span>
            <input type="number" id="num-metrix-cost-mat" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_materialRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">사업장 임차료 (%)</span>
            <input type="number" id="num-metrix-cost-rent" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_rentRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">세금 및 공과금 (%)</span>
            <input type="number" id="num-metrix-cost-tax" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_taxRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">기타 비용(인건비/수수료 등) (%)</span>
            <input type="number" id="num-metrix-cost-other" class="figma-input w-full num-metrix-cost" min="0" max="100" value="${metrixPolicyState.cost_otherRatio}" />
          </div>
        </div>
        <div class="flex-between">
          <span class="font-caption text-dim">영업비용 합계:</span>
          <span id="badge-metrix-cost-total" class="badge-status ready">100% 매칭 완료</span>
        </div>
      </div>
    </section>

    <!-- 카드 3: 결제수단 & 부채 구조 (문14, 문15) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-credit-card"></i> 문14·15</span>
          <h3 class="blueprint-stage-title">결제수단 비중 &amp; 부채 구조</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-fixed"><i class="fa-solid fa-scale-balanced"></i> 합계 100% 매칭</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문14 결제수단 비중(합계 100%)과 문15 대출/부채 비중 및 주된 차입 사유를 설정합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold mb-6">문14 고객 결제수단 비중 (합계 100%)</label>
        <div class="grid-3col mb-8" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <span class="font-caption text-dim">신용/체크카드 (%)</span>
            <input type="number" id="num-metrix-pay-card" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_cardRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">간편결제·지역화폐 (%)</span>
            <input type="number" id="num-metrix-pay-mobile" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_mobileRatio}" />
          </div>
          <div>
            <span class="font-caption text-dim">현금 (%)</span>
            <input type="number" id="num-metrix-pay-cash" class="figma-input w-full num-metrix-pay" min="0" max="100" value="${metrixPolicyState.payment_cashRatio}" />
          </div>
        </div>
        <div class="flex-between mb-12">
          <span class="font-caption text-dim">결제수단 합계:</span>
          <span id="badge-metrix-pay-total" class="badge-status ready">100% 매칭 완료</span>
        </div>

        <label class="figma-label font-bold mb-6">문15-2 주된 대출/차입 사유 (우선순위)</label>
        <div class="qb-grid-2col">
          <div>
            <span class="font-caption text-dim">1순위 사유</span>
            <select id="sel-metrix-debt-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.debt_reasonRank1 === '1' ? 'selected' : ''}>1. 운전자금 (원재료 구입 및 경영비용 충당)</option>
              <option value="2" ${metrixPolicyState.debt_reasonRank1 === '2' ? 'selected' : ''}>2. 설비 및 시설 투자</option>
              <option value="3" ${metrixPolicyState.debt_reasonRank1 === '3' ? 'selected' : ''}>3. 기존 대출금 상환 (대환대출)</option>
            </select>
          </div>
          <div>
            <span class="font-caption text-dim">2순위 사유</span>
            <select id="sel-metrix-debt-rank2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.debt_reasonRank2 === '2' ? 'selected' : ''}>2. 설비 및 시설 투자 (기기 구입 등)</option>
              <option value="1" ${metrixPolicyState.debt_reasonRank2 === '1' ? 'selected' : ''}>1. 운전자금</option>
              <option value="3" ${metrixPolicyState.debt_reasonRank2 === '3' ? 'selected' : ''}>3. 기존 대출금 상환</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 4: 사업장 점유 & 고용 인력 (문16, 문31) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-shop"></i> 문16·31</span>
          <h3 class="blueprint-stage-title">사업장 임대차 &amp; 상시 종사자 수</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 기준점 조절</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        문16 사업장 점유 형태(보증부 월세 등)와 문31 상시 종사자 수를 설정합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">사업장 점유 형태 (문16)</label>
          <select id="sel-metrix-lease-type" class="figma-select w-full">
            <option value="monthly_deposit" ${metrixPolicyState.lease_type === 'monthly_deposit' ? 'selected' : ''}>보증부 월세 (보증금 + 월세 - 표준 기본값)</option>
            <option value="own" ${metrixPolicyState.lease_type === 'own' ? 'selected' : ''}>자가 (대표자 본인 또는 가족 소유)</option>
            <option value="jeonse" ${metrixPolicyState.lease_type === 'jeonse' ? 'selected' : ''}>전세</option>
          </select>
        </div>
        <div class="qb-grid-2col mb-12">
          <div>
            <span class="font-caption text-dim">보증금 (만 원)</span>
            <input type="number" id="num-metrix-lease-deposit" class="figma-input w-full" min="0" value="${metrixPolicyState.lease_deposit}" />
          </div>
          <div>
            <span class="font-caption text-dim">월세 (만 원)</span>
            <input type="number" id="num-metrix-lease-rent" class="figma-input w-full" min="0" value="${metrixPolicyState.lease_monthlyRent}" />
          </div>
        </div>
        <div class="qb-grid-2col">
          <div>
            <span class="font-caption text-dim">대표자 본인 종사자 (문31)</span>
            <input type="number" id="num-metrix-emp-owner" class="figma-input w-full" min="1" max="1" value="${metrixPolicyState.employee_owner}" readonly style="opacity: 0.8;" />
          </div>
          <div>
            <span class="font-caption text-dim">무급 가족종사자 (문31)</span>
            <input type="number" id="num-metrix-emp-family" class="figma-input w-full" min="0" max="5" value="${metrixPolicyState.employee_family}" />
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 5: 정책 만족도 & 지원사업 가이드 (문50~문67) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-thumbs-up"></i> 문50~67</span>
          <h3 class="blueprint-stage-title">정책 만족도 &amp; 희망 지원사업</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 기준점 조절</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        5점 척도 지원정책 만족도 가중치와 문67 경기도 희망 지원정책 1/2순위를 설정합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">5점 척도 만족도 가중치 (문50~문66)</label>
          <select id="sel-metrix-satisfaction-mode" class="figma-select w-full">
            <option value="mixed_3_4" ${metrixPolicyState.satisfaction_mode === 'mixed_3_4' ? 'selected' : ''}>3~4점 자연 혼합 분산 [보통 및 만족 - 권장 기본값]</option>
            <option value="neutral_3" ${metrixPolicyState.satisfaction_mode === 'neutral_3' ? 'selected' : ''}>3점 보통 중심 (현실적 평가)</option>
            <option value="positive_4_5" ${metrixPolicyState.satisfaction_mode === 'positive_4_5' ? 'selected' : ''}>4~5점 긍정적 평가 (만족 및 매우만족)</option>
          </select>
        </div>
        <div class="qb-grid-2col">
          <div>
            <label class="figma-label font-bold">문67 희망 지원정책 (1순위)</label>
            <select id="sel-metrix-support-rank1" class="figma-select w-full">
              <option value="1" ${metrixPolicyState.desired_support_rank1 === '1' ? 'selected' : ''}>1. 자금지원 (저금리 대출 및 특례보증 - 기본값)</option>
              <option value="2" ${metrixPolicyState.desired_support_rank1 === '2' ? 'selected' : ''}>2. 경영환경개선 (간판 및 시설 개보수)</option>
              <option value="3" ${metrixPolicyState.desired_support_rank1 === '3' ? 'selected' : ''}>3. 판로개척 및 온라인 마케팅 지원</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">문67 희망 지원정책 (2순위)</label>
            <select id="sel-metrix-support-rank2" class="figma-select w-full">
              <option value="2" ${metrixPolicyState.desired_support_rank2 === '2' ? 'selected' : ''}>2. 경영환경개선 (간판 및 시설 개보수 - 기본값)</option>
              <option value="1" ${metrixPolicyState.desired_support_rank2 === '1' ? 'selected' : ''}>1. 자금지원</option>
              <option value="4" ${metrixPolicyState.desired_support_rank2 === '4' ? 'selected' : ''}>4. 공공요금 및 세무·노무 컨설팅 지원</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 6: 주관식 코멘트 & 증빙 서류 (전폭) -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill"><i class="fa-solid fa-pen-nib"></i> 주관식 &amp; 증빙</span>
          <h3 class="blueprint-stage-title">애로사항 주관식 답변 &amp; CHECK1 증빙 사진</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-camera"></i> 증빙 자동 바인딩</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        설문 중 주관식 애로사항 문항(문22 등)에 입력할 텍스트 가이드라인과 최종 관문 CHECK1에 자동 업로드할 간판/명함 사진 경로를 지정합니다.
      </div>
      <div class="p-14">
        <div class="mb-12">
          <label class="figma-label font-bold">경영 애로사항 및 건의사항 주관식 코멘트 템플릿</label>
          <textarea id="txt-metrix-comment" class="figma-input w-full" rows="3" style="resize: vertical; font-size: 13px; line-height: 1.5;">${escapeHtml(metrixPolicyState.open_ended_comment)}</textarea>
        </div>
        <div>
          <label class="figma-label font-bold">CHECK1 증빙 간판사진 파일 경로</label>
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
