/**
 * AutoSurvey AI - 마스터 설문 블루프린트 컨트롤러 (survey-blueprint.js)
 * 케이스탯 TAPI 15단계 설문 전체를 한 화면으로 복제하여 시각화하고,
 * 사용자가 정의한 기준점(Master Baseline)을 바탕으로 전체 쿼터 배치 실행을 제어합니다.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const campaignId = urlParams.get('campaignId') || urlParams.get('id') || 'camp_1792039653802';

  // DOM Elements
  const linkBackCampaign = document.getElementById('link-back-campaign');
  const campaignTitleHeading = document.getElementById('campaign-title-heading');
  const badgeMasterStatus = document.getElementById('badge-master-status');
  const blueprintStageGrid = document.getElementById('blueprint-stage-grid');
  const btnSaveBaseline = document.getElementById('btn-save-baseline');
  const btnRunAllBatch = document.getElementById('btn-run-all-batch');

  // Preset Buttons
  const btnPresetStandard = document.getElementById('btn-preset-standard');
  const btnPresetGrowth = document.getElementById('btn-preset-growth');
  const btnPresetTraditional = document.getElementById('btn-preset-traditional');
  const btnPresetRotation = document.getElementById('btn-preset-rotation');

  if (linkBackCampaign) {
    linkBackCampaign.href = `survey-detail.html?id=${encodeURIComponent(campaignId)}`;
  }

  let blueprintData = null;
  let currentBaseline = {
    storePyeong: 14,
    employeeFamily: 1,
    employeeRegular: 0,
    employeeTemp: 0,
    dailySales: 65,
    annualSales: 180,
    quarterPattern: 'even',
    profitMarginRate: 25,
    salesChange: 'similar',
    dailyCustomers: 45,
    dailyBusinessHours: 11,
    monthlyBusinessDays: 26,
    creditCardRatio: 65,
    onnuriRatio: 15,
    cashReceiptRatio: 50,
    costTaxRatio: 10,
    costLaborRatio: 25,
    costRentRatio: 20,
    onnuriPaperMember: 'yes',
    onnuriMobileMember: 'no',
    onnuriCustomerAvg: 5,
    onnuriSatisfaction: 'good',
    deliveryFoodAdoption: 75,
    deliverySalesRatio: 25,
    posAdoptionRate: 65,
    posCount: 1,
    smartOrderAdoption: 20,
    originLabelTarget: 'yes',
    priceTagCompliance: 80,
    rentAdoptionRate: 80,
    depositAmount: 2000,
    monthlyRentAmount: 110,
    rentTrend: 'freeze',
    debtAdoptionRate: 45,
    debtAvgAmount: 2500,
    fireInsurance: 'yes',
    liabilityInsurance: 'yes',
    issuePriority: 'standard',
    policyPriority: 'standard',
    futurePlan: 'maintain',
    successionPlan: 'none',
    plannedYears: 8,
    rotationMode: false
  };

  // 1. 블루프린트 스키마 및 캠페인 기준점 로드
  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      if (data.baseline) {
        currentBaseline = { ...currentBaseline, ...data.baseline };
      }

      if (campaignTitleHeading) {
        campaignTitleHeading.textContent = `캠페인: ${data.campaignTitle} (총 ${data.quotaCount}개 사업자 쿼터 장착됨)`;
      }

      if (badgeMasterStatus) {
        if (data.hasCustomBaseline) {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-check-double"></i> 사용자 마스터 기준점 활성';
          badgeMasterStatus.className = 'badge-status badge-blueprint ready';
        } else {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 15단계 표준 기준점 적용 중';
        }
      }

      renderStages();
    } catch (err) {
      console.error(err);
      blueprintStageGrid.innerHTML = `
        <div class="empty-table-msg">
          <i class="fa-solid fa-triangle-exclamation text-error"></i> 블루프린트를 불러오지 못했습니다: ${err.message}
        </div>
      `;
    }
  }

  // 2. 16단계 스테이지 카드 동적 렌더링
  function renderStages() {
    if (!blueprintData || !Array.isArray(blueprintData.stages)) return;

    blueprintStageGrid.innerHTML = blueprintData.stages.map((stage) => {
      return `
        <section class="blueprint-card" id="stage-card-${stage.step}">
          <div class="blueprint-card-header">
            <div>
              <div class="flex-center-gap-8 mb-4">
                <span class="step-num-badge step${stage.stepNum}">${stage.step}</span>
                <span class="blueprint-asp-tag font-mono">${escapeHtml(stage.aspFile)}</span>
                <span class="${getBadgeClass(stage.badge)}">${getBadgeLabel(stage.badge)}</span>
              </div>
              <h3 class="blueprint-stage-title">${escapeHtml(stage.title)}</h3>
            </div>
          </div>
          
          <div class="font-caption text-secondary-color mb-14">
            ${escapeHtml(stage.description)}
          </div>

          <div class="blueprint-field-list">
            ${stage.fields.map(field => renderFieldItem(field, stage)).join('')}
          </div>
        </section>
      `;
    }).join('');

    bindSliderEvents();
  }

  // 뱃지 클래스 매핑
  function getBadgeClass(badge) {
    switch (badge) {
      case 'QUOTA_BINDING': return 'badge-tag-bind';
      case 'RULE_FIXED': return 'badge-tag-fixed';
      case 'TUNABLE_JITTER': return 'badge-tag-tunable';
      default: return 'badge-tag-jitter';
    }
  }

  function getBadgeLabel(badge) {
    switch (badge) {
      case 'QUOTA_BINDING': return '쿼터 맞춤 1:1 바인딩';
      case 'RULE_FIXED': return '유효성 규칙 필수 고정';
      case 'TUNABLE_JITTER': return '기준점 설정 및 동적 분산';
      default: return '가변 분산';
    }
  }

  // 필드 행 렌더링
  function renderFieldItem(field, stage) {
    let controlHtml = '';

    if (field.type === 'bind') {
      controlHtml = `
        <span class="font-caption font-mono text-dim font-bold">
          <i class="fa-solid fa-link text-primary-color"></i> 쿼터 [${escapeHtml(field.source)}]
        </span>
      `;
    } else if (field.type === 'linked_computed') {
      if (field.id === 'A9_1') {
        const p = currentBaseline.storePyeong || 14;
        const sqm = Math.round(p * 3.3058);
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-sqm">
            <i class="fa-solid fa-arrows-rotate"></i> ${sqm} m² (자동 연동)
          </span>
        `;
      } else if (field.id === 'B1BA') {
        const s = currentBaseline.annualSales || 180;
        const m = currentBaseline.profitMarginRate || 25;
        const profit = Math.round((s * m) / 100);
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-profit">
            <i class="fa-solid fa-calculator"></i> ${profit} 백만 원 (자동 연동)
          </span>
        `;
      } else if (field.id === 'B2A_1') {
        const card = currentBaseline.creditCardRatio || 65;
        const onnuri = currentBaseline.onnuriRatio || 15;
        const cash = Math.max(0, 100 - card - onnuri);
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-cash-ratio">
            <i class="fa-solid fa-calculator"></i> ${cash}% (자동 잔여)
          </span>
        `;
      } else if (field.id === 'B4_2') {
        const tax = currentBaseline.costTaxRatio ?? 10;
        const labor = (currentBaseline.employeeRegular > 0 ? (currentBaseline.costLaborRatio || 25) : 0);
        const rent = currentBaseline.costRentRatio || 20;
        const raw = Math.max(0, 100 - tax - labor - rent);
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-cost-raw">
            <i class="fa-solid fa-calculator"></i> ${raw}% (자동 잔여)
          </span>
        `;
      } else {
        controlHtml = `
          <span class="badge-status ready font-caption font-bold">
            <i class="fa-solid fa-arrows-rotate"></i> ${escapeHtml(field.baseline || '자동 연동')}
          </span>
        `;
      }
    } else if (field.type === 'fixed') {
      controlHtml = `
        <span class="badge-status ready font-caption font-bold">
          <i class="fa-solid fa-lock"></i> ${escapeHtml(field.value)}
        </span>
      `;
    } else if (field.type === 'action') {
      controlHtml = `
        <span class="badge-status completed font-caption font-bold">
          <i class="fa-solid fa-check"></i> ${escapeHtml(field.value)}
        </span>
      `;
    } else if (field.type === 'tunable') {
      controlHtml = renderTunableControl(field.id, field);
    } else if (field.type === 'jitter') {
      controlHtml = `
        <span class="badge-tag-jitter font-caption">
          <i class="fa-solid fa-dice"></i> ${escapeHtml(field.baseline || '')} (${escapeHtml(field.range || '자연 분산')})
        </span>
      `;
    }

    return `
      <div class="blueprint-field-item">
        <div class="blueprint-field-label">
          <span class="font-mono text-dim font-caption">[${field.id}]</span>
          <span>${escapeHtml(field.label)}</span>
        </div>
        <div class="blueprint-field-control">
          ${controlHtml}
        </div>
      </div>
    `;
  }

  // 기준점 조절 컨트롤 (슬라이더 / 스텝퍼 / 셀렉트)
  function renderTunableControl(fieldId, field) {
    switch (fieldId) {
      // P2: 매장 면적 (평수)
      case 'A9_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pyeong" min="5" max="50" step="1" value="${currentBaseline.storePyeong || 14}" />
            <span class="baseline-slider-val" id="val-pyeong">${currentBaseline.storePyeong || 14}평</span>
          </div>
        `;
      // P2: 가족 종사자 수
      case 'A10_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-family-emp" min="0" max="3" step="1" value="${currentBaseline.employeeFamily ?? 1}" />
            <span class="baseline-slider-val" id="val-family-emp">${currentBaseline.employeeFamily ?? 1}명</span>
          </div>
        `;
      // P2: 상시 유급 종업원 수 (인건비 연동)
      case 'A10_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-paid-emp" min="0" max="5" step="1" value="${currentBaseline.employeeRegular ?? 0}" />
            <span class="baseline-slider-val" id="val-paid-emp">${currentBaseline.employeeRegular ?? 0}명</span>
          </div>
        `;
      // P2: 임시/일용 종업원 수
      case 'A10_3':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-temp-emp" min="0" max="3" step="1" value="${currentBaseline.employeeTemp ?? 0}" />
            <span class="baseline-slider-val" id="val-temp-emp">${currentBaseline.employeeTemp ?? 0}명</span>
          </div>
        `;
      // P3: 일평균 매출액 (만 원)
      case 'B1AA':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-daily-sales" min="20" max="200" step="5" value="${currentBaseline.dailySales || 65}" />
            <span class="baseline-slider-val" id="val-daily-sales">${currentBaseline.dailySales || 65}만</span>
          </div>
        `;
      // P3: 연간 총매출액 (백만 원)
      case 'B1AB':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-annual-sales" min="50" max="350" step="10" value="${currentBaseline.annualSales || 180}" />
            <span class="baseline-slider-val" id="val-annual-sales">${currentBaseline.annualSales || 180}M</span>
          </div>
        `;
      // P3: 분기별 매출 비중 패턴
      case 'B1AC_1~4': {
        const curPat = currentBaseline.quarterPattern || 'even';
        return `
          <select class="baseline-select" id="select-quarter-pattern">
            <option value="even" ${curPat === 'even' ? 'selected' : ''}>균등형 (25/25/25/25%)</option>
            <option value="h2" ${curPat === 'h2' ? 'selected' : ''}>하반기·명절 성수기 (20/20/30/30%)</option>
            <option value="h1" ${curPat === 'h1' ? 'selected' : ''}>상반기 성수기 (30/30/20/20%)</option>
            <option value="season" ${curPat === 'season' ? 'selected' : ''}>봄·가을 성수기 (30/20/30/20%)</option>
            <option value="rotation" ${curPat === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P4: 영업이익률 (%)
      case 'B1BA_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-margin" min="15" max="35" step="1" value="${currentBaseline.profitMarginRate || 25}" />
            <span class="baseline-slider-val" id="val-margin">${currentBaseline.profitMarginRate || 25}%</span>
          </div>
        `;
      // P4: 전년 대비 매출 변화
      case 'B1BB': {
        const curChange = currentBaseline.salesChange || 'similar';
        return `
          <select class="baseline-select" id="select-sales-change">
            <option value="similar" ${curChange === 'similar' ? 'selected' : ''}>전년과 비슷함 (3)</option>
            <option value="increase" ${curChange === 'increase' ? 'selected' : ''}>전년 대비 증가 (1~2)</option>
            <option value="decrease" ${curChange === 'decrease' ? 'selected' : ''}>전년 대비 감소 (4~5)</option>
            <option value="rotation" ${curChange === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P4: 일평균 방문 고객 수
      case 'B1C':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-daily-cust" min="15" max="150" step="5" value="${currentBaseline.dailyCustomers || 45}" />
            <span class="baseline-slider-val" id="val-daily-cust">${currentBaseline.dailyCustomers || 45}명</span>
          </div>
        `;
      // P4: 일평균 영업 시간
      case 'B1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-hours" min="8" max="16" step="1" value="${currentBaseline.dailyBusinessHours || 11}" />
            <span class="baseline-slider-val" id="val-biz-hours">${currentBaseline.dailyBusinessHours || 11}시간</span>
          </div>
        `;
      // P4: 월평균 영업 일수
      case 'B1E':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-days" min="20" max="31" step="1" value="${currentBaseline.monthlyBusinessDays || 26}" />
            <span class="baseline-slider-val" id="val-biz-days">${currentBaseline.monthlyBusinessDays || 26}일</span>
          </div>
        `;
      // P5: 신용카드 결제 비중
      case 'B2A_5':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-credit-card" min="60" max="70" step="1" value="${currentBaseline.creditCardRatio || 65}" />
            <span class="baseline-slider-val" id="val-credit-card">${currentBaseline.creditCardRatio || 65}%</span>
          </div>
        `;
      // P5: 온누리상품권 결제 비중
      case 'B2A_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri" min="10" max="20" step="1" value="${currentBaseline.onnuriRatio || 15}" />
            <span class="baseline-slider-val" id="val-onnuri">${currentBaseline.onnuriRatio || 15}%</span>
          </div>
        `;
      // P5: 현금영수증 발급 비중
      case 'B3_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cash-receipt" min="20" max="80" step="5" value="${currentBaseline.cashReceiptRatio || 50}" />
            <span class="baseline-slider-val" id="val-cash-receipt">${currentBaseline.cashReceiptRatio || 50}%</span>
          </div>
        `;
      // P6: 인건비 지출 비중
      case 'B4_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-labor" min="10" max="40" step="1" value="${currentBaseline.costLaborRatio || 25}" />
            <span class="baseline-slider-val" id="val-cost-labor">${currentBaseline.costLaborRatio || 25}%</span>
          </div>
        `;
      // P6: 임차료/관리비 지출 비중
      case 'B4_3':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-rent" min="10" max="35" step="1" value="${currentBaseline.costRentRatio || 20}" />
            <span class="baseline-slider-val" id="val-cost-rent">${currentBaseline.costRentRatio || 20}%</span>
          </div>
        `;
      // P6: 기타(세금) 지출 비중
      case 'B4_4':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-tax" min="0" max="30" step="1" value="${currentBaseline.costTaxRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-cost-tax">${currentBaseline.costTaxRatio ?? 10}%</span>
          </div>
        `;
      // P7: 일평균 온누리 이용 고객 수
      case 'B5C_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-cust" min="2" max="10" step="1" value="${currentBaseline.onnuriCustomerAvg || 5}" />
            <span class="baseline-slider-val" id="val-onnuri-cust">${currentBaseline.onnuriCustomerAvg || 5}명</span>
          </div>
        `;
      // P7: 지류상품권 가맹 여부
      case 'B5A_1': {
        const curPaper = currentBaseline.onnuriPaperMember || 'yes';
        return `
          <select class="baseline-select" id="select-onnuri-paper">
            <option value="yes" ${curPaper === 'yes' ? 'selected' : ''}>지류 가맹 (1)</option>
            <option value="no" ${curPaper === 'no' ? 'selected' : ''}>지류 미가맹 (2)</option>
            <option value="rotation" ${curPaper === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P7: 모바일/카드형 가맹 여부
      case 'B5A_2': {
        const curMobile = currentBaseline.onnuriMobileMember || 'no';
        return `
          <select class="baseline-select" id="select-onnuri-mobile">
            <option value="no" ${curMobile === 'no' ? 'selected' : ''}>모바일 미가맹 (2)</option>
            <option value="yes" ${curMobile === 'yes' ? 'selected' : ''}>모바일 가맹 (1)</option>
            <option value="rotation" ${curMobile === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P7: 온누리상품권 종합 만족도
      case 'B5AA': {
        const curSat = currentBaseline.onnuriSatisfaction || 'good';
        return `
          <select class="baseline-select" id="select-onnuri-satisfaction">
            <option value="good" ${curSat === 'good' ? 'selected' : ''}>약간 만족 (4)</option>
            <option value="very_good" ${curSat === 'very_good' ? 'selected' : ''}>매우 만족 (5)</option>
            <option value="normal" ${curSat === 'normal' ? 'selected' : ''}>보통 (3)</option>
            <option value="bad" ${curSat === 'bad' ? 'selected' : ''}>약간 불만 (2)</option>
            <option value="rotation" ${curSat === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P8: 배달서비스 실시 여부 (외식업 기준)
      case 'C1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery" min="30" max="95" step="5" value="${currentBaseline.deliveryFoodAdoption || 75}" />
            <span class="baseline-slider-val" id="val-delivery">외식 ${currentBaseline.deliveryFoodAdoption || 75}%</span>
          </div>
        `;
      // P8: 배달 매출 비중 (%)
      case 'C1DA':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery-sales" min="10" max="50" step="5" value="${currentBaseline.deliverySalesRatio || 25}" />
            <span class="baseline-slider-val" id="val-delivery-sales">${currentBaseline.deliverySalesRatio || 25}%</span>
          </div>
        `;
      // P8: POS 기기 보유 여부
      case 'C1F':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos" min="30" max="95" step="5" value="${currentBaseline.posAdoptionRate || 65}" />
            <span class="baseline-slider-val" id="val-pos">${currentBaseline.posAdoptionRate || 65}%</span>
          </div>
        `;
      // P8: POS 보유 대수
      case 'C1FA':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos-count" min="1" max="3" step="1" value="${currentBaseline.posCount || 1}" />
            <span class="baseline-slider-val" id="val-pos-count">${currentBaseline.posCount || 1}대</span>
          </div>
        `;
      // P8: 스마트 주문 이용 여부
      case 'C1G':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-smart-order" min="0" max="50" step="5" value="${currentBaseline.smartOrderAdoption || 20}" />
            <span class="baseline-slider-val" id="val-smart-order">${currentBaseline.smartOrderAdoption || 20}%</span>
          </div>
        `;
      // P9: 원산지 표시 대상 여부
      case 'C2A': {
        const curOrig = currentBaseline.originLabelTarget || 'yes';
        return `
          <select class="baseline-select" id="select-origin-target">
            <option value="yes" ${curOrig === 'yes' ? 'selected' : ''}>원산지 표시 대상 (2)</option>
            <option value="no" ${curOrig === 'no' ? 'selected' : ''}>표시 비대상 (1)</option>
            <option value="rotation" ${curOrig === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P9: 가격표시제 준수율
      case 'C2E':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-price-tag" min="50" max="100" step="5" value="${currentBaseline.priceTagCompliance || 80}" />
            <span class="baseline-slider-val" id="val-price-tag">${currentBaseline.priceTagCompliance || 80}%</span>
          </div>
        `;
      // P10: 사업장 소유 형태 (임차 점유율)
      case 'D1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-rent-rate" min="50" max="100" step="5" value="${currentBaseline.rentAdoptionRate || 80}" />
            <span class="baseline-slider-val" id="val-rent-rate">임차 ${currentBaseline.rentAdoptionRate || 80}%</span>
          </div>
        `;
      // P10: 임차 보증금 (만 원)
      case 'D1C_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-deposit" min="500" max="5000" step="100" value="${currentBaseline.depositAmount || 2000}" />
            <span class="baseline-slider-val" id="val-deposit">${currentBaseline.depositAmount || 2000}만</span>
          </div>
        `;
      // P10: 월 임차료 (만 원)
      case 'D1C_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-monthly-rent" min="40" max="300" step="5" value="${currentBaseline.monthlyRentAmount || 110}" />
            <span class="baseline-slider-val" id="val-monthly-rent">${currentBaseline.monthlyRentAmount || 110}만</span>
          </div>
        `;
      // P10: 임대료 증감 추이
      case 'D1D': {
        const curTrend = currentBaseline.rentTrend || 'freeze';
        return `
          <select class="baseline-select" id="select-rent-trend">
            <option value="freeze" ${curTrend === 'freeze' ? 'selected' : ''}>동결 / 변동 없음 (3)</option>
            <option value="increase" ${curTrend === 'increase' ? 'selected' : ''}>임대료 인상 (1~2)</option>
            <option value="decrease" ${curTrend === 'decrease' ? 'selected' : ''}>임대료 인하 (4~5)</option>
            <option value="rotation" ${curTrend === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P11: 사업상 부채 보유 여부
      case 'E1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-debt" min="20" max="70" step="5" value="${currentBaseline.debtAdoptionRate || 45}" />
            <span class="baseline-slider-val" id="val-debt">${currentBaseline.debtAdoptionRate || 45}%</span>
          </div>
        `;
      // P11: 부채 보유 금액 (만 원)
      case 'E1A':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-debt-amount" min="500" max="8000" step="100" value="${currentBaseline.debtAvgAmount || 2500}" />
            <span class="baseline-slider-val" id="val-debt-amount">${currentBaseline.debtAvgAmount || 2500}만</span>
          </div>
        `;
      // P12: 화재보험/공제 가입
      case 'E2A': {
        const curFire = currentBaseline.fireInsurance || 'yes';
        return `
          <select class="baseline-select" id="select-fire-insurance">
            <option value="yes" ${curFire === 'yes' ? 'selected' : ''}>화재보험 가입 (1)</option>
            <option value="no" ${curFire === 'no' ? 'selected' : ''}>화재보험 미가입 (2)</option>
            <option value="rotation" ${curFire === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P12: 영업배상책임보험
      case 'E2B': {
        const curLiab = currentBaseline.liabilityInsurance || 'yes';
        return `
          <select class="baseline-select" id="select-liability-insurance">
            <option value="yes" ${curLiab === 'yes' ? 'selected' : ''}>영업배상 가입 (1)</option>
            <option value="no" ${curLiab === 'no' ? 'selected' : ''}>영업배상 미가입 (2)</option>
            <option value="rotation" ${curLiab === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P13: 경영 애로사항 우선순위
      case 'F1': {
        const curIssue = currentBaseline.issuePriority || 'standard';
        return `
          <select class="baseline-select" id="select-issue-priority">
            <option value="standard" ${curIssue === 'standard' ? 'selected' : ''}>원재료비·임차료 중심 표준 분산</option>
            <option value="customer" ${curIssue === 'customer' ? 'selected' : ''}>고객감소·상권침체 중심 분산</option>
            <option value="labor" ${curIssue === 'labor' ? 'selected' : ''}>인건비·구인난 중심 분산</option>
            <option value="random" ${curIssue === 'random' ? 'selected' : ''}>사업자별 완전 무작위 3종</option>
            <option value="rotation" ${curIssue === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P13: 정책 건의과제 우선순위
      case 'F3': {
        const curPol = currentBaseline.policyPriority || 'standard';
        return `
          <select class="baseline-select" id="select-policy-priority">
            <option value="standard" ${curPol === 'standard' ? 'selected' : ''}>온누리확대·주차환경 표준 분산</option>
            <option value="digital" ${curPol === 'digital' ? 'selected' : ''}>온라인·스마트화 지원 중심</option>
            <option value="marketing" ${curPol === 'marketing' ? 'selected' : ''}>홍보마케팅·축제 활성화 중심</option>
            <option value="random" ${curPol === 'random' ? 'selected' : ''}>정책과제 완전 무작위 3종</option>
            <option value="rotation" ${curPol === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P14: 향후 점포 운영 계획
      case 'G1': {
        const curPlan = currentBaseline.futurePlan || 'maintain';
        return `
          <select class="baseline-select" id="select-future-plan">
            <option value="maintain" ${curPlan === 'maintain' ? 'selected' : ''}>현재 상태 유지 (1)</option>
            <option value="expand" ${curPlan === 'expand' ? 'selected' : ''}>사업 확대 / 성장 (2)</option>
            <option value="change" ${curPlan === 'change' ? 'selected' : ''}>업종 전환 (3)</option>
            <option value="close" ${curPlan === 'close' ? 'selected' : ''}>폐업 고려 (4)</option>
            <option value="rotation" ${curPlan === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P14: 사업 승계 여부
      case 'G1A': {
        const curSucc = currentBaseline.successionPlan || 'none';
        return `
          <select class="baseline-select" id="select-succession-plan">
            <option value="none" ${curSucc === 'none' ? 'selected' : ''}>승계 계획 없음 (2)</option>
            <option value="child" ${curSucc === 'child' ? 'selected' : ''}>자녀 승계 예정 (1)</option>
            <option value="transfer" ${curSucc === 'transfer' ? 'selected' : ''}>제3자 양도 (3)</option>
            <option value="rotation" ${curSucc === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P14: 점포 지속 예정 기간 (연수)
      case 'G1B':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-years" min="3" max="20" step="1" value="${currentBaseline.plannedYears || 8}" />
            <span class="baseline-slider-val" id="val-years">${currentBaseline.plannedYears || 8}년</span>
          </div>
        `;
      default:
        return `
          <span class="badge-tag-tunable font-caption">
            <i class="fa-solid fa-sliders"></i> ${escapeHtml(field.baseline || '기준점')}
          </span>
        `;
    }
  }

  // 3. 슬라이더 & 셀렉트 인터랙션 이벤트 바인딩
  function bindSliderEvents() {
    const bindSlider = (id, valId, key, suffix = '%', onUpdate) => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (slider && valEl) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          currentBaseline[key] = val;
          valEl.textContent = `${val}${suffix}`;
          if (typeof onUpdate === 'function') onUpdate(val);
          markUnsaved();
        });
      }
    };

    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          currentBaseline[key] = e.target.value;
          markUnsaved();
        });
      }
    };

    const updateSqm = () => {
      const valSqm = document.getElementById('val-sqm');
      if (valSqm) {
        const p = currentBaseline.storePyeong || 14;
        valSqm.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${Math.round(p * 3.3058)} m² (자동 연동)`;
      }
    };

    const updateProfit = () => {
      const valProfit = document.getElementById('val-profit');
      if (valProfit) {
        const s = currentBaseline.annualSales || 180;
        const m = currentBaseline.profitMarginRate || 25;
        valProfit.innerHTML = `<i class="fa-solid fa-calculator"></i> ${Math.round((s * m) / 100)} 백만 원 (자동 연동)`;
      }
    };

    const updateCashRatio = () => {
      const valCash = document.getElementById('val-cash-ratio');
      if (valCash) {
        const card = currentBaseline.creditCardRatio || 65;
        const onnuri = currentBaseline.onnuriRatio || 15;
        const cash = Math.max(0, 100 - card - onnuri);
        valCash.innerHTML = `<i class="fa-solid fa-calculator"></i> ${cash}% (자동 잔여)`;
      }
    };

    const updateRawCost = () => {
      const valRaw = document.getElementById('val-cost-raw');
      if (valRaw) {
        const tax = currentBaseline.costTaxRatio ?? 10;
        const labor = (currentBaseline.employeeRegular > 0 ? (currentBaseline.costLaborRatio || 25) : 0);
        const rent = currentBaseline.costRentRatio || 20;
        const raw = Math.max(0, 100 - tax - labor - rent);
        valRaw.innerHTML = `<i class="fa-solid fa-calculator"></i> ${raw}% (자동 잔여)`;
      }
    };

    // P2: 매장 면적 & 종업원 수
    bindSlider('slider-pyeong', 'val-pyeong', 'storePyeong', '평', updateSqm);
    bindSlider('slider-family-emp', 'val-family-emp', 'employeeFamily', '명');
    bindSlider('slider-paid-emp', 'val-paid-emp', 'employeeRegular', '명', updateRawCost);
    bindSlider('slider-temp-emp', 'val-temp-emp', 'employeeTemp', '명');

    // P3: 매출 & 분기 패턴
    bindSlider('slider-daily-sales', 'val-daily-sales', 'dailySales', '만');
    bindSlider('slider-annual-sales', 'val-annual-sales', 'annualSales', 'M', updateProfit);
    bindSelect('select-quarter-pattern', 'quarterPattern');

    // P4: 마진율 & 매출변화 & 고객수 & 시간 & 일수
    bindSlider('slider-margin', 'val-margin', 'profitMarginRate', '%', updateProfit);
    bindSelect('select-sales-change', 'salesChange');
    bindSlider('slider-daily-cust', 'val-daily-cust', 'dailyCustomers', '명');
    bindSlider('slider-biz-hours', 'val-biz-hours', 'dailyBusinessHours', '시간');
    bindSlider('slider-biz-days', 'val-biz-days', 'monthlyBusinessDays', '일');

    // P5: 신용카드 & 온누리 & 현금영수증
    bindSlider('slider-credit-card', 'val-credit-card', 'creditCardRatio', '%', updateCashRatio);
    bindSlider('slider-onnuri', 'val-onnuri', 'onnuriRatio', '%', updateCashRatio);
    bindSlider('slider-cash-receipt', 'val-cash-receipt', 'cashReceiptRatio', '%');

    // P6: 인건비 & 임차료 & 기타(세금)
    bindSlider('slider-cost-labor', 'val-cost-labor', 'costLaborRatio', '%', updateRawCost);
    bindSlider('slider-cost-rent', 'val-cost-rent', 'costRentRatio', '%', updateRawCost);
    bindSlider('slider-cost-tax', 'val-cost-tax', 'costTaxRatio', '%', updateRawCost);

    // P7: 온누리 고객수 & 지류 & 모바일 & 만족도
    bindSlider('slider-onnuri-cust', 'val-onnuri-cust', 'onnuriCustomerAvg', '명');
    bindSelect('select-onnuri-paper', 'onnuriPaperMember');
    bindSelect('select-onnuri-mobile', 'onnuriMobileMember');
    bindSelect('select-onnuri-satisfaction', 'onnuriSatisfaction');

    // P8: 배달도입 & 배달매출 & POS & POS대수 & 스마트주문
    bindSlider('slider-delivery', 'val-delivery', 'deliveryFoodAdoption', '%');
    bindSlider('slider-delivery-sales', 'val-delivery-sales', 'deliverySalesRatio', '%');
    bindSlider('slider-pos', 'val-pos', 'posAdoptionRate', '%');
    bindSlider('slider-pos-count', 'val-pos-count', 'posCount', '대');
    bindSlider('slider-smart-order', 'val-smart-order', 'smartOrderAdoption', '%');

    // P9: 원산지 표시 & 가격표시 준수율
    bindSelect('select-origin-target', 'originLabelTarget');
    bindSlider('slider-price-tag', 'val-price-tag', 'priceTagCompliance', '%');

    // P10: 임차율 & 보증금 & 월세 & 임대료 추이
    bindSlider('slider-rent-rate', 'val-rent-rate', 'rentAdoptionRate', '%');
    bindSlider('slider-deposit', 'val-deposit', 'depositAmount', '만');
    bindSlider('slider-monthly-rent', 'val-monthly-rent', 'monthlyRentAmount', '만');
    bindSelect('select-rent-trend', 'rentTrend');

    // P11: 부채 비율 & 부채 금액
    bindSlider('slider-debt', 'val-debt', 'debtAdoptionRate', '%');
    bindSlider('slider-debt-amount', 'val-debt-amount', 'debtAvgAmount', '만');

    // P12: 화재보험 & 영업배상
    bindSelect('select-fire-insurance', 'fireInsurance');
    bindSelect('select-liability-insurance', 'liabilityInsurance');

    // P13: 애로사항 & 정책과제
    bindSelect('select-issue-priority', 'issuePriority');
    bindSelect('select-policy-priority', 'policyPriority');

    // P14: 향후계획 & 승계계획 & 예정기간
    bindSelect('select-future-plan', 'futurePlan');
    bindSelect('select-succession-plan', 'successionPlan');
    bindSlider('slider-years', 'val-years', 'plannedYears', '년');
  }

  function markUnsaved() {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 변경사항 저장 (미저장)';
    btnSaveBaseline.className = 'btn-pill btn-pill-primary btn-pulse';
  }

  // 4. 프리셋 적용
  if (btnPresetStandard) {
    btnPresetStandard.addEventListener('click', () => {
      applyPreset({
        storePyeong: 14,
        employeeFamily: 1,
        employeeRegular: 0,
        employeeTemp: 0,
        dailySales: 65,
        annualSales: 180,
        quarterPattern: 'even',
        profitMarginRate: 25,
        salesChange: 'similar',
        dailyCustomers: 45,
        dailyBusinessHours: 11,
        monthlyBusinessDays: 26,
        creditCardRatio: 65,
        onnuriRatio: 15,
        cashReceiptRatio: 50,
        costTaxRatio: 10,
        costLaborRatio: 25,
        costRentRatio: 20,
        onnuriPaperMember: 'yes',
        onnuriMobileMember: 'no',
        onnuriCustomerAvg: 5,
        onnuriSatisfaction: 'good',
        deliveryFoodAdoption: 75,
        deliverySalesRatio: 25,
        posAdoptionRate: 65,
        posCount: 1,
        smartOrderAdoption: 20,
        originLabelTarget: 'yes',
        priceTagCompliance: 80,
        rentAdoptionRate: 80,
        depositAmount: 2000,
        monthlyRentAmount: 110,
        rentTrend: 'freeze',
        debtAdoptionRate: 45,
        debtAvgAmount: 2500,
        fireInsurance: 'yes',
        liabilityInsurance: 'yes',
        issuePriority: 'standard',
        policyPriority: 'standard',
        futurePlan: 'maintain',
        successionPlan: 'none',
        plannedYears: 8,
        rotationMode: false
      }, btnPresetStandard);
    });
  }

  if (btnPresetGrowth) {
    btnPresetGrowth.addEventListener('click', () => {
      applyPreset({
        storePyeong: 25,
        employeeFamily: 1,
        employeeRegular: 2,
        employeeTemp: 1,
        dailySales: 130,
        annualSales: 280,
        quarterPattern: 'h2',
        profitMarginRate: 32,
        salesChange: 'increase',
        dailyCustomers: 90,
        dailyBusinessHours: 13,
        monthlyBusinessDays: 28,
        creditCardRatio: 70,
        onnuriRatio: 12,
        cashReceiptRatio: 65,
        costTaxRatio: 10,
        costLaborRatio: 30,
        costRentRatio: 22,
        onnuriPaperMember: 'yes',
        onnuriMobileMember: 'yes',
        onnuriCustomerAvg: 8,
        onnuriSatisfaction: 'very_good',
        deliveryFoodAdoption: 85,
        deliverySalesRatio: 35,
        posAdoptionRate: 85,
        posCount: 2,
        smartOrderAdoption: 35,
        originLabelTarget: 'yes',
        priceTagCompliance: 90,
        rentAdoptionRate: 85,
        depositAmount: 3500,
        monthlyRentAmount: 180,
        rentTrend: 'increase',
        debtAdoptionRate: 60,
        debtAvgAmount: 4000,
        fireInsurance: 'yes',
        liabilityInsurance: 'yes',
        issuePriority: 'labor',
        policyPriority: 'digital',
        futurePlan: 'expand',
        successionPlan: 'child',
        plannedYears: 12,
        rotationMode: false
      }, btnPresetGrowth);
    });
  }

  if (btnPresetTraditional) {
    btnPresetTraditional.addEventListener('click', () => {
      applyPreset({
        storePyeong: 8,
        employeeFamily: 1,
        employeeRegular: 0,
        employeeTemp: 0,
        dailySales: 45,
        annualSales: 120,
        quarterPattern: 'even',
        profitMarginRate: 20,
        salesChange: 'decrease',
        dailyCustomers: 30,
        dailyBusinessHours: 10,
        monthlyBusinessDays: 25,
        creditCardRatio: 60,
        onnuriRatio: 20,
        cashReceiptRatio: 35,
        costTaxRatio: 10,
        costLaborRatio: 20,
        costRentRatio: 18,
        onnuriPaperMember: 'yes',
        onnuriMobileMember: 'no',
        onnuriCustomerAvg: 4,
        onnuriSatisfaction: 'normal',
        deliveryFoodAdoption: 40,
        deliverySalesRatio: 15,
        posAdoptionRate: 50,
        posCount: 1,
        smartOrderAdoption: 10,
        originLabelTarget: 'yes',
        priceTagCompliance: 75,
        rentAdoptionRate: 75,
        depositAmount: 1200,
        monthlyRentAmount: 70,
        rentTrend: 'freeze',
        debtAdoptionRate: 30,
        debtAvgAmount: 1500,
        fireInsurance: 'yes',
        liabilityInsurance: 'yes',
        issuePriority: 'customer',
        policyPriority: 'marketing',
        futurePlan: 'maintain',
        successionPlan: 'none',
        plannedYears: 5,
        rotationMode: false
      }, btnPresetTraditional);
    });
  }

  if (btnPresetRotation) {
    btnPresetRotation.addEventListener('click', () => {
      applyPreset({
        rotationMode: true,
        quarterPattern: 'rotation',
        salesChange: 'rotation',
        costTaxRatio: 10,
        onnuriPaperMember: 'rotation',
        onnuriMobileMember: 'rotation',
        onnuriSatisfaction: 'rotation',
        rentTrend: 'rotation',
        originLabelTarget: 'rotation',
        fireInsurance: 'rotation',
        liabilityInsurance: 'rotation',
        issuePriority: 'rotation',
        policyPriority: 'rotation',
        futurePlan: 'rotation',
        successionPlan: 'rotation',
        plannedYears: 8
      }, btnPresetRotation);
    });
  }

  function applyPreset(presetValues, activeBtn) {
    document.querySelectorAll('.blueprint-preset-group .btn-chip').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');

    currentBaseline = { ...currentBaseline, ...presetValues };
    renderStages();
    markUnsaved();
  }

  // 5. 마스터 기준점 저장
  if (btnSaveBaseline) {
    btnSaveBaseline.addEventListener('click', async () => {
      try {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentBaseline)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '저장 실패');

        btnSaveBaseline.disabled = false;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-circle-check"></i> 마스터 기준점 저장 완료!';
        btnSaveBaseline.className = 'btn-pill btn-pill-success';

        if (badgeMasterStatus) {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-check-double"></i> 사용자 마스터 기준점 활성';
          badgeMasterStatus.className = 'badge-status badge-blueprint ready';
        }

        setTimeout(() => {
          btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 마스터 기준점 저장';
          btnSaveBaseline.className = 'btn-pill btn-pill-primary';
        }, 2500);

      } catch (err) {
        btnSaveBaseline.disabled = false;
        alert('기준점 저장 실패: ' + err.message);
      }
    });
  }

  // 6. 전체 배치 즉시 가동 (1~24번)
  if (btnRunAllBatch) {
    btnRunAllBatch.addEventListener('click', async () => {
      const ok = confirm('설정한 마스터 기준점으로 1번부터 24번까지 전체 쿼터 배치 자동화를 시작하시겠습니까?');
      if (!ok) return;

      try {
        btnRunAllBatch.disabled = true;
        btnRunAllBatch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 기준점 저장 및 배치 준비 중...';

        // 1. 기준점 저장 보장
        await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentBaseline)
        });

        // 2. 상세 작업실로 이동하여 즉시 배치 실행 & 실시간 스트림 관전
        window.location.href = `survey-detail.html?id=${encodeURIComponent(campaignId)}&autobatch=1`;

      } catch (err) {
        btnRunAllBatch.disabled = false;
        alert('배치 시작 실패: ' + err.message);
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 초기 로드
  loadBlueprint();
});
