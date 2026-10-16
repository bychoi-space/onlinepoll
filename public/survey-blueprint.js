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

  if (linkBackCampaign) {
    linkBackCampaign.href = `survey-detail.html?id=${encodeURIComponent(campaignId)}`;
  }

  let blueprintData = null;
  let currentBaseline = {
    creditCardRatio: 65,
    onnuriRatio: 15,
    cashRatio: 20,
    costTaxRatio: 10,
    costLaborRatioWithEmp: 25,
    deliveryFoodAdoption: 75,
    deliveryNonFoodAdoption: 15,
    deliverySalesRatio: 25,
    posAdoptionRate: 65,
    debtAdoptionRate: 45,
    debtAvgAmount: 2500,
    plannedYears: 8,
    onnuriCustomerAvg: 5,
    annualSales: 180,
    profitMarginRate: 25
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
      // 슬라이더 또는 수치 컨트롤 매핑
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

  // 기준점 조절 컨트롤 (슬라이더 / 스텝퍼)
  function renderTunableControl(fieldId, field) {
    switch (fieldId) {
      case 'B2A_5': // 신용카드 비중
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-credit-card" min="60" max="70" value="${currentBaseline.creditCardRatio || 65}" />
            <span class="baseline-slider-val" id="val-credit-card">${currentBaseline.creditCardRatio || 65}%</span>
          </div>
        `;
      case 'B2A_2': // 온누리 비중
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri" min="10" max="20" value="${currentBaseline.onnuriRatio || 15}" />
            <span class="baseline-slider-val" id="val-onnuri">${currentBaseline.onnuriRatio || 15}%</span>
          </div>
        `;
      case 'B1BA_1': // 목표 이익률 %
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-margin" min="15" max="35" value="${currentBaseline.profitMarginRate || 25}" />
            <span class="baseline-slider-val" id="val-margin">${currentBaseline.profitMarginRate || 25}%</span>
          </div>
        `;
      case 'C1D': // 배달서비스 실시율
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery" min="30" max="95" value="${currentBaseline.deliveryFoodAdoption || 75}" />
            <span class="baseline-slider-val" id="val-delivery">외식 ${currentBaseline.deliveryFoodAdoption || 75}%</span>
          </div>
        `;
      case 'C1F': // POS기기 보유율
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos" min="30" max="95" value="${currentBaseline.posAdoptionRate || 65}" />
            <span class="baseline-slider-val" id="val-pos">${currentBaseline.posAdoptionRate || 65}%</span>
          </div>
        `;
      case 'E1': // 부채 보유율
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-debt" min="20" max="70" value="${currentBaseline.debtAdoptionRate || 45}" />
            <span class="baseline-slider-val" id="val-debt">${currentBaseline.debtAdoptionRate || 45}%</span>
          </div>
        `;
      case 'B5C_1': // 온누리 일평균 고객 수
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-cust" min="2" max="10" value="${currentBaseline.onnuriCustomerAvg || 5}" />
            <span class="baseline-slider-val" id="val-onnuri-cust">${currentBaseline.onnuriCustomerAvg || 5}명</span>
          </div>
        `;
      case 'G1B': // 지속 연수
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-years" min="3" max="20" value="${currentBaseline.plannedYears || 8}" />
            <span class="baseline-slider-val" id="val-years">${currentBaseline.plannedYears || 8}년</span>
          </div>
        `;
      case 'B1AB': // 연매출
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-sales" min="100" max="300" step="10" value="${currentBaseline.annualSales || 180}" />
            <span class="baseline-slider-val" id="val-sales">${currentBaseline.annualSales || 180}M</span>
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

  // 3. 슬라이더 인터랙션 이벤트 바인딩
  function bindSliderEvents() {
    const bindSlider = (id, valId, key, suffix = '%') => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (slider && valEl) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          currentBaseline[key] = val;
          valEl.textContent = `${val}${suffix}`;
          markUnsaved();
        });
      }
    };

    bindSlider('slider-credit-card', 'val-credit-card', 'creditCardRatio', '%');
    bindSlider('slider-onnuri', 'val-onnuri', 'onnuriRatio', '%');
    bindSlider('slider-margin', 'val-margin', 'profitMarginRate', '%');
    bindSlider('slider-delivery', 'val-delivery', 'deliveryFoodAdoption', '%');
    bindSlider('slider-pos', 'val-pos', 'posAdoptionRate', '%');
    bindSlider('slider-debt', 'val-debt', 'debtAdoptionRate', '%');
    bindSlider('slider-onnuri-cust', 'val-onnuri-cust', 'onnuriCustomerAvg', '명');
    bindSlider('slider-years', 'val-years', 'plannedYears', '년');
    bindSlider('slider-sales', 'val-sales', 'annualSales', 'M');
  }

  function markUnsaved() {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 변경사항 저장 (미저장)';
    btnSaveBaseline.className = 'btn-pill btn-pill-primary btn-pulse';
  }

  // 4. 프리셋 적용
  if (btnPresetStandard) {
    btnPresetStandard.addEventListener('click', () => {
      applyPreset({
        creditCardRatio: 65,
        onnuriRatio: 15,
        deliveryFoodAdoption: 75,
        posAdoptionRate: 65,
        debtAdoptionRate: 45,
        profitMarginRate: 25,
        plannedYears: 8
      }, btnPresetStandard);
    });
  }

  if (btnPresetGrowth) {
    btnPresetGrowth.addEventListener('click', () => {
      applyPreset({
        creditCardRatio: 70,
        onnuriRatio: 12,
        deliveryFoodAdoption: 85,
        posAdoptionRate: 80,
        debtAdoptionRate: 60,
        profitMarginRate: 32,
        plannedYears: 12
      }, btnPresetGrowth);
    });
  }

  if (btnPresetTraditional) {
    btnPresetTraditional.addEventListener('click', () => {
      applyPreset({
        creditCardRatio: 60,
        onnuriRatio: 20,
        deliveryFoodAdoption: 40,
        posAdoptionRate: 50,
        debtAdoptionRate: 30,
        profitMarginRate: 20,
        plannedYears: 5
      }, btnPresetTraditional);
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
