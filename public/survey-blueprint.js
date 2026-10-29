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
  let activeGroup = 'group1';
  let groupBaselines = {};
  let groupStats = null;

  const GROUP_METAS = {
    group1: {
      name: '1번 그룹 [식품군]',
      badgeClass: 'group1-badge',
      desc: '농산물, 축산물, 수산물, 가공식품 점포에 특화된 기준점 (원산지 100%, 온누리상품권 우대, 대면 판매 중심)'
    },
    group2: {
      name: '2번 그룹 [공산·생활·서비스군]',
      badgeClass: 'group2-badge',
      desc: '의류신발, 가정용품, 기타소매, 근린상권 점포에 특화된 기준점 (원산지 비대상, 배달 미실시(0%), 소매/생활/미용)'
    },
    group3: {
      name: '3번 그룹 [외식·음식점업군]',
      badgeClass: 'group3-badge',
      desc: '일반음식점, 휴게음식점, 분식, 주점 점포에 특화된 기준점 (배달앱 85%, 배달매출 35%, 식재료비/원산지 필수)'
    }
  };

  let currentBaseline = {
    storePyeong: 14,
    storeSqm: 46,
    storeSqmMin: 20,
    storeSqmMax: 65,
    employeeFamily: 0,
    employeeFamilyMin: 0,
    employeeFamilyMax: 0,
    employeeRegular: 0,
    employeeRegularMin: 0,
    employeeRegularMax: 0,
    employeeTemp: 0,
    employeeTempMin: 0,
    employeeTempMax: 0,
    dailySales: 65,
    dailySalesMin: 30,
    dailySalesMax: 80,
    annualSales: 180,
    operatingMonths: 12,
    quarterPattern: 'even',
    profitMarginRate: 25,
    salesChange: 'similar',
    dailyCustomers: 45,
    nonLocalUnknownRate: 90,
    dailyBusinessHours: 11,
    monthlyBusinessDays: 26,
    creditCardRatio: 65,
    onnuriRatio: 10,
    localPayMember: 'rotation',
    zeropayMember: 'rotation',
    localRatio: 5,
    zeropayRatio: 10,
    cashRatio: 10,
    onnuriPaperRatio: 35,
    onnuriDigitalRatio: 65,
    cashReceiptRatio: 40,
    cashReceiptRatioMin: 40,
    cashReceiptRatioMax: 80,
    costTaxRatio: 10,
    costLaborRatio: 25,
    costRentRatio: 20,
    costRawRatio: 45,
    onnuriPaperMember: 'yes',
    onnuriMobileMember: 'no',
    onnuriCustomerAvg: 5,
    onnuriCustomersMin: 3,
    onnuriCustomersMax: 12,
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
    depositMin: 1000,
    depositMax: 3000,
    monthlyRentAmount: 110,
    monthlyRentMin: 60,
    monthlyRentMax: 180,
    rentTrend: 'freeze',
    debtAdoptionRate: 45,
    debtAvgAmount: 2500,
    debtAmountMin: 1000,
    debtAmountMax: 5000,
    fireInsurance: 'yes',
    liabilityInsurance: 'yes',
    issuePriority: 'standard',
    policyPriority: 'standard',
    futurePlan: 'maintain',
    successionPlan: 'none',
    plannedYears: 8,
    plannedYearsMin: 3,
    plannedYearsMax: 12,
    rotationMode: false,
    empSalesLink: 'auto',
    respondentRole: 'owner',
    defaultCeoGender: 'auto',
    defaultCeoAge: 52,
    defaultCeoAgeMin: 45,
    defaultCeoAgeMax: 65,
    bizRegType: 'individual',
    taxType: 'general',
    creditCardMember: 'yes',
    costEtcText: '세금',
    onnuriJoinYearMode: 'auto',
    privacyAgree: 'yes',
    // 조사원 평가 마스터 기준점 기본값
    evalH1_1: 4,
    evalH1_1_Min: 3,
    evalH1_1_Max: 5,
    evalH1_2: 4,
    evalH1_2_Min: 3,
    evalH1_2_Max: 5,
    evalH1_3: 4,
    evalH1_3_Min: 3,
    evalH1_3_Max: 5,
    evalH1_4: 4,
    evalH1_4_Min: 3,
    evalH1_4_Max: 5,
    evalH1_5: 4,
    evalH1_5_Min: 3,
    evalH1_5_Max: 5,
    evalH1_2: 4,
    evalH1_3: 4,
    evalH1_4: 4,
    evalH1_5: 4,
    evalH2_1: 'yes',
    evalH2_2: 'no',
    evalH2_3: 'auto',
    evalH2_4: 3,
    evalH3_1: 'random_345',
    evalH3_2: 'random_345',
    evalH3_3: 'random_345',
    evalH3_4: 'random_345'
  };

  function updateGroupStatsUI() {
    if (groupStats) {
      const c1 = document.getElementById('count-group1');
      const c2 = document.getElementById('count-group2');
      const c3 = document.getElementById('count-group3');
      if (c1 && groupStats.group1) c1.textContent = `${groupStats.group1.count}개소`;
      if (c2 && groupStats.group2) c2.textContent = `${groupStats.group2.count}개소`;
      if (c3 && groupStats.group3) c3.textContent = `${groupStats.group3.count}개소`;
    }

    const tagEl = document.getElementById('active-group-tag');
    const descEl = document.getElementById('active-group-desc');
    const countEl = document.getElementById('active-group-count');
    const storesEl = document.getElementById('active-group-stores');

    const meta = GROUP_METAS[activeGroup] || GROUP_METAS.group1;
    if (tagEl) {
      tagEl.textContent = meta.name;
      tagEl.className = `active-group-tag ${meta.badgeClass}`;
    }
    if (descEl) descEl.textContent = meta.desc;

    if (groupStats && groupStats[activeGroup]) {
      const st = groupStats[activeGroup];
      if (countEl) countEl.textContent = st.count;
      if (storesEl) {
        if (st.stores && st.stores.length > 0) {
          const preview = st.stores.slice(0, 6).join(', ') + (st.stores.length > 6 ? ` 외 ${st.stores.length - 6}개소` : '');
          storesEl.textContent = preview;
        } else {
          storesEl.textContent = '해당 업종 점포 없음';
        }
      }
    }
  }

  function switchGroupTab(targetGroup) {
    if (activeGroup === targetGroup) return;

    // 1. 현재 편집 중인 기준점을 활성 그룹 캐시에 저장
    groupBaselines[activeGroup] = { ...currentBaseline };

    // 2. 활성 그룹 변경
    activeGroup = targetGroup;

    // 3. 탭 버튼 스타일 갱신
    document.querySelectorAll('.blueprint-group-tabs .group-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-group') === targetGroup) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 4. 대상 그룹의 기준점을 currentBaseline에 로드
    if (!groupBaselines[activeGroup]) {
      groupBaselines[activeGroup] = { ...currentBaseline };
    }
    currentBaseline = { ...groupBaselines[activeGroup] };

    // 5. 배너 및 15단계 문항 그리드 재렌더링
    updateGroupStatsUI();
    renderStages();
  }

  function copyActiveGroupToAll() {
    groupBaselines[activeGroup] = { ...currentBaseline };
    const sourceMeta = GROUP_METAS[activeGroup] || { name: activeGroup };

    groupBaselines.group1 = JSON.parse(JSON.stringify(currentBaseline));
    groupBaselines.group2 = JSON.parse(JSON.stringify(currentBaseline));
    groupBaselines.group3 = JSON.parse(JSON.stringify(currentBaseline));

    markUnsaved();
    alert(`[${sourceMeta.name}]의 기준점 설정이 1번, 2번, 3번 그룹 전체에 일괄 복사되었습니다.\n우측 상단의 [마스터 기준점 저장]을 눌러 서버에 최종 반영해 주세요.`);
  }

  // 1. 블루프린트 스키마 및 캠페인 기준점 로드
  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      if (data.groupBaselines) {
        groupBaselines = data.groupBaselines;
      } else {
        groupBaselines = {
          group1: { ...currentBaseline, ...(data.baseline?.groups?.group1 || data.baseline || {}) },
          group2: { ...currentBaseline, ...(data.baseline?.groups?.group2 || data.baseline || {}) },
          group3: { ...currentBaseline, ...(data.baseline?.groups?.group3 || data.baseline || {}) }
        };
      }

      // [A10_1] 가족 종사자 수: 1번(식품군), 2번(공산생활서비스군), 3번(외식음식점업군) 전 그룹 0명 기본 및 설정 보장
      ['group1', 'group2', 'group3'].forEach(g => {
        if (groupBaselines[g]) {
          if (groupBaselines[g].employeeFamilyMin === 1 && groupBaselines[g].employeeFamilyMax === 1) {
            groupBaselines[g].employeeFamily = 0;
            groupBaselines[g].employeeFamilyMin = 0;
            groupBaselines[g].employeeFamilyMax = 0;
          }
        }
      });

      groupStats = data.groupStats || null;

      if (groupBaselines[activeGroup]) {
        currentBaseline = { ...groupBaselines[activeGroup] };
      } else if (data.baseline) {
        currentBaseline = { ...currentBaseline, ...data.baseline };
      }

      if (currentBaseline.employeeFamilyMin === 1 && currentBaseline.employeeFamilyMax === 1) {
        currentBaseline.employeeFamily = 0;
        currentBaseline.employeeFamilyMin = 0;
        currentBaseline.employeeFamilyMax = 0;
      }

      if (campaignTitleHeading) {
        campaignTitleHeading.textContent = `캠페인: ${data.campaignTitle} (총 ${data.quotaCount}개 사업자 쿼터 장착됨)`;
      }

      updateGroupStatsUI();

      if (badgeMasterStatus) {
        if (data.hasCustomBaseline) {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-check-double"></i> 3개 업종 그룹별 마스터 기준점 활성';
          badgeMasterStatus.className = 'badge-status badge-blueprint ready';
        } else {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 15단계 업종별 표준 기준점 적용 중';
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
        const onnuri = currentBaseline.onnuriRatio || 10;
        const local = currentBaseline.localRatio ?? 5;
        const zeropay = currentBaseline.zeropayRatio ?? 10;
        const cash = Math.max(0, 100 - card - onnuri - local - zeropay);
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-cash-ratio">
            <i class="fa-solid fa-calculator"></i> ${cash}% (자동 잔여, 5% 단위)
          </span>
        `;
      } else if (field.id === 'B3_2') {
        const paper = currentBaseline.onnuriPaperRatio || 35;
        const digital = 100 - paper;
        controlHtml = `
          <span class="badge-status ready font-caption font-bold" id="val-onnuri-digital">
            <i class="fa-solid fa-calculator"></i> ${digital}% (자동 잔여, 5% 단위)
          </span>
        `;
      } else if (field.id === 'B4_2') {
        const tax = currentBaseline.costTaxRatio ?? 10;
        const hasPaidEmp = (currentBaseline.employeeRegularMax !== undefined ? currentBaseline.employeeRegularMax : (currentBaseline.employeeRegular || 0)) > 0;
        const labor = (hasPaidEmp ? (currentBaseline.costLaborRatio || 25) : 0);
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

  function renderDualRangeControl(idPrefix, minKey, maxKey, minBound, maxBound, step, defaultMin, defaultMax, unit) {
    const curMin = currentBaseline[minKey] !== undefined ? currentBaseline[minKey] : defaultMin;
    const curMax = currentBaseline[maxKey] !== undefined ? currentBaseline[maxKey] : defaultMax;
    const minPercent = Math.max(0, Math.min(100, ((curMin - minBound) / (maxBound - minBound)) * 100));
    const maxPercent = Math.max(0, Math.min(100, ((curMax - minBound) / (maxBound - minBound)) * 100));
    const widthPercent = Math.max(0, maxPercent - minPercent);
    const minZ = (curMin === curMax && curMin >= maxBound) ? 4 : 3;
    const maxZ = (curMin === curMax && curMin >= maxBound) ? 3 : 4;

    return `
      <div class="baseline-range-container">
        <div class="dual-slider-track-wrap">
          <div class="dual-slider-track"></div>
          <div class="dual-slider-highlight" id="highlight-${idPrefix}" style="left:${minPercent}%;width:${widthPercent}%;"></div>
          <input type="range" class="dual-slider-thumb thumb-min" id="range-min-${idPrefix}" min="${minBound}" max="${maxBound}" step="${step}" value="${curMin}" style="z-index:${minZ};" />
          <input type="range" class="dual-slider-thumb thumb-max" id="range-max-${idPrefix}" min="${minBound}" max="${maxBound}" step="${step}" value="${curMax}" style="z-index:${maxZ};" />
        </div>
        <div class="range-display-badge" id="badge-${idPrefix}">
          <span class="range-badge-min font-mono font-bold" id="badge-min-${idPrefix}">${curMin}</span>
          <span class="range-sep">~</span>
          <span class="range-badge-max font-mono font-bold" id="badge-max-${idPrefix}">${curMax}</span>
          <span class="range-unit">${unit}</span>
        </div>
      </div>
    `;
  }

  // 기준점 조절 컨트롤 (슬라이더 / 스텝퍼 / 셀렉트)
  function renderTunableControl(fieldId, field) {
    switch (fieldId) {
      // Q1: 응답자 자격 (점포와의 관계)
      case 'Q1_12_1': {
        const curRole = currentBaseline.respondentRole || 'owner';
        return `
          <select class="baseline-select" id="select-respondent-role">
            <option value="owner" ${curRole === 'owner' ? 'selected' : ''}>점포주 / 대표자 본인 (1) [기본]</option>
            <option value="family" ${curRole === 'family' ? 'selected' : ''}>배우자 및 가족 종사자 (2)</option>
            <option value="manager" ${curRole === 'manager' ? 'selected' : ''}>점장 / 지배인 / 종업원 (3)</option>
            <option value="rotation" ${curRole === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P1: 대표자 성별 가이드 (결측 시 폴백)
      case 'A1': {
        const curGen = currentBaseline.defaultCeoGender || 'auto';
        return `
          <select class="baseline-select" id="select-ceo-gender-fallback">
            <option value="auto" ${curGen === 'auto' ? 'selected' : ''}>⚡ 쿼터 실존 성별 우선 (결측 시 자동 판별) [권장]</option>
            <option value="male" ${curGen === 'male' ? 'selected' : ''}>남성 대표자 우선 (#A1_1)</option>
            <option value="female" ${curGen === 'female' ? 'selected' : ''}>여성 대표자 우선 (#A1_2)</option>
            <option value="rotation" ${curGen === 'rotation' ? 'selected' : ''}>🎲 남녀 50:50 균등 로테이션</option>
          </select>
        `;
      }
      // P1: 대표자 나이 가이드 (결측 시 폴백: Min~Max 레인지)
      case 'A2':
        return renderDualRangeControl('ceo-age', 'defaultCeoAgeMin', 'defaultCeoAgeMax', 30, 75, 1, 45, 65, '세');
      // P1: 사업자 등록 형태
      case 'A3': {
        const curReg = currentBaseline.bizRegType || 'individual';
        return `
          <select class="baseline-select" id="select-biz-reg-type">
            <option value="individual" ${curReg === 'individual' ? 'selected' : ''}>개인사업자 (2) [소상공인 표준]</option>
            <option value="corporate" ${curReg === 'corporate' ? 'selected' : ''}>법인사업자 (1)</option>
            <option value="unregistered" ${curReg === 'unregistered' ? 'selected' : ''}>무등록 사업자 (3)</option>
            <option value="rotation" ${curReg === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션</option>
          </select>
        `;
      }
      // P1: 과세 유형
      case 'A3A': {
        const curTax = currentBaseline.taxType || 'general';
        return `
          <select class="baseline-select" id="select-tax-type">
            <option value="general" ${curTax === 'general' ? 'selected' : ''}>일반과세자 (1) [표준]</option>
            <option value="simple" ${curTax === 'simple' ? 'selected' : ''}>간이과세자 (2)</option>
            <option value="exempt" ${curTax === 'exempt' ? 'selected' : ''}>면세사업자 (3)</option>
            <option value="rotation" ${curTax === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P2: 매장 면적 (m² Min~Max 레인지)
      case 'A9_1':
        return renderDualRangeControl('sqm', 'storeSqmMin', 'storeSqmMax', 10, 250, 1, 20, 65, 'm²');
      // P2: 매장 면적 (평수 조절)
      case 'A9_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pyeong" min="5" max="75" step="1" value="${currentBaseline.storePyeong || 14}" />
            <span class="baseline-slider-val" id="val-pyeong">${currentBaseline.storePyeong || 14}평</span>
          </div>
        `;
      // P2: 가족 종사자 수 (Min~Max 레인지)
      case 'A10_1':
        return renderDualRangeControl('family-emp', 'employeeFamilyMin', 'employeeFamilyMax', 0, 5, 1, 0, 0, '명');
      // P2: 상시 유급 종업원 수 (Min~Max 레인지)
      case 'A10_2':
        return renderDualRangeControl('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, 1, 0, 0, '명');
      // P2: 임시/일용 종업원 수 (Min~Max 레인지)
      case 'A10_3':
        return renderDualRangeControl('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, 1, 0, 0, '명');
      // P2: 매출 연동 고용 규칙
      case 'RULE_EMP_SALES': {
        const curRule = currentBaseline.empSalesLink || 'auto';
        return `
          <select class="baseline-select" id="select-emp-sales-link">
            <option value="auto" ${curRule === 'auto' ? 'selected' : ''}>🟢 매출 비례 자동 연동 (저매출 0명 / 고매출 증가) [권장]</option>
            <option value="fixed" ${curRule === 'fixed' ? 'selected' : ''}>🔒 슬라이더 지정값 고정 (수동 설정 유지)</option>
          </select>
        `;
      }
      // P3: 일평균 매출액 (만 원 Min~Max 레인지)
      case 'B1AA':
        return renderDualRangeControl('daily-sales', 'dailySalesMin', 'dailySalesMax', 10, 300, 5, 30, 80, '만');
      // P3: 연간 총매출액 (백만 원)
      case 'B1AB':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-annual-sales" min="40" max="500" step="10" value="${currentBaseline.annualSales || 180}" />
            <span class="baseline-slider-val" id="val-annual-sales">${currentBaseline.annualSales || 180}M</span>
          </div>
        `;
      // P3: 1년 영업개월수
      case 'B1AC':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-operating-months" min="1" max="12" step="1" value="${currentBaseline.operatingMonths || 12}" />
            <span class="baseline-slider-val" id="val-operating-months">${currentBaseline.operatingMonths || 12}개월</span>
          </div>
        `;
      // P3: 분기별 매출 비중 패턴
      case 'B1AC_1~4': {
        const curPat = currentBaseline.quarterPattern || 'even';
        return `
          <select class="baseline-select" id="select-quarter-pattern">
            <option value="even" ${curPat === 'even' ? 'selected' : ''}>균등형 (25/25/25/25%) [기본값]</option>
            <option value="h2" ${curPat === 'h2' ? 'selected' : ''}>하반기·명절 성수기 (20/20/30/30%)</option>
            <option value="h1" ${curPat === 'h1' ? 'selected' : ''}>상반기 성수기 (30/30/20/20%)</option>
            <option value="season" ${curPat === 'season' ? 'selected' : ''}>봄·가을 성수기 (30/20/30/20%)</option>
            <option value="rotation" ${curPat === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환)</option>
          </select>
        `;
      }
      // P4: 연간 영업이익
      case 'B1BA': {
        const s = currentBaseline.annualSales || 180;
        const m = currentBaseline.profitMarginRate || 25;
        const profit = Math.round((s * m) / 100);
        return `
          <span class="badge-status ready font-caption font-bold" id="val-profit">
            <i class="fa-solid fa-calculator"></i> ${profit} 백만 원 (연매출×이익률 자동 연동)
          </span>
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
            <input type="range" class="baseline-slider" id="slider-daily-cust" min="10" max="200" step="5" value="${currentBaseline.dailyCustomers || 45}" />
            <span class="baseline-slider-val" id="val-daily-cust">${currentBaseline.dailyCustomers || 45}명</span>
          </div>
        `;
      // P4: 지역 외 고객 비중
      case 'B1C_1': {
        const curUnknown = currentBaseline.nonLocalUnknownRate !== undefined ? String(currentBaseline.nonLocalUnknownRate) : '90';
        return `
          <select class="baseline-select" id="select-non-local-cust">
            <option value="90" ${curUnknown === '90' ? 'selected' : ''}>약 90% 모름 (기본 권장)</option>
            <option value="100" ${curUnknown === '100' ? 'selected' : ''}>100% 모름 체크</option>
            <option value="0" ${curUnknown === '0' ? 'selected' : ''}>0% (전부 비중 입력)</option>
          </select>
        `;
      }
      // P4: 일평균 영업 시간
      case 'B1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-hours" min="6" max="18" step="1" value="${currentBaseline.dailyBusinessHours || 11}" />
            <span class="baseline-slider-val" id="val-biz-hours">${currentBaseline.dailyBusinessHours || 11}시간</span>
          </div>
        `;
      // P4: 월평균 영업 일수
      case 'B1E':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-days" min="15" max="30" step="1" value="${currentBaseline.monthlyBusinessDays || 26}" />
            <span class="baseline-slider-val" id="val-biz-days">${currentBaseline.monthlyBusinessDays || 26}일</span>
          </div>
        `;
      // P5: 지역사랑상품권 취급 여부
      case 'B2_3': {
        const curLocal = currentBaseline.localPayMember || 'rotation';
        return `
          <select class="baseline-select" id="select-local-member">
            <option value="rotation" ${curLocal === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환) [기본값]</option>
            <option value="yes" ${curLocal === 'yes' ? 'selected' : ''}>취급 (1)</option>
            <option value="no" ${curLocal === 'no' ? 'selected' : ''}>취급 안 함 (2)</option>
          </select>
        `;
      }
      // P5: 제로페이 모바일결제 등 취급 여부
      case 'B2_4': {
        const curZero = currentBaseline.zeropayMember || 'rotation';
        return `
          <select class="baseline-select" id="select-zeropay-member">
            <option value="rotation" ${curZero === 'rotation' ? 'selected' : ''}>🎲 자유 로테이션 (점포별 순환) [기본값]</option>
            <option value="yes" ${curZero === 'yes' ? 'selected' : ''}>취급 (1)</option>
            <option value="no" ${curZero === 'no' ? 'selected' : ''}>취급 안 함 (2)</option>
          </select>
        `;
      }
      // P5: 신용카드 취급 여부 (B2_5_1)
      case 'B2_5_1': {
        const curCard = currentBaseline.creditCardMember || 'yes';
        return `
          <select class="baseline-select" id="select-credit-card-member">
            <option value="yes" ${curCard === 'yes' ? 'selected' : ''}>신용카드 취급 (1) [기본]</option>
            <option value="no" ${curCard === 'no' ? 'selected' : ''}>신용카드 미취급 (2)</option>
          </select>
        `;
      }
      // P5: 신용카드 결제 비중
      case 'B2A_5':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-credit-card" min="55" max="75" step="5" value="${currentBaseline.creditCardRatio || 65}" />
            <span class="baseline-slider-val" id="val-credit-card">${currentBaseline.creditCardRatio || 65}%</span>
          </div>
        `;
      // P5: 온누리상품권 결제 비중
      case 'B2A_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri" min="5" max="25" step="5" value="${currentBaseline.onnuriRatio || 10}" />
            <span class="baseline-slider-val" id="val-onnuri">${currentBaseline.onnuriRatio || 10}%</span>
          </div>
        `;
      // P5: 지역사랑상품권 결제 비중
      case 'B2A_3':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-local-pay" min="0" max="20" step="5" value="${currentBaseline.localRatio ?? 5}" />
            <span class="baseline-slider-val" id="val-local-pay">${currentBaseline.localRatio ?? 5}%</span>
          </div>
        `;
      // P5: 제로페이 모바일결제 등 비중
      case 'B2A_4':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-zeropay" min="0" max="25" step="5" value="${currentBaseline.zeropayRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-zeropay">${currentBaseline.zeropayRatio ?? 10}%</span>
          </div>
        `;
      // P5: 현금 결제 비중
      case 'B2A_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cash-ratio" min="0" max="40" step="5" value="${currentBaseline.cashRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-cash-ratio">${currentBaseline.cashRatio ?? 10}%</span>
          </div>
        `;
      // P5: 온누리상품권 지류형 비중 (B3_1)
      case 'B3_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-paper-ratio" min="10" max="90" step="5" value="${currentBaseline.onnuriPaperRatio || 35}" />
            <span class="baseline-slider-val" id="val-onnuri-paper-ratio">${currentBaseline.onnuriPaperRatio || 35}%</span>
          </div>
        `;
      // P5: 온누리상품권 디지털형 비중 (B3_2)
      case 'B3_2': {
        const digitalVal = currentBaseline.onnuriDigitalRatio !== undefined ? currentBaseline.onnuriDigitalRatio : (100 - (currentBaseline.onnuriPaperRatio || 35));
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-digital-ratio" min="10" max="90" step="5" value="${digitalVal}" />
            <span class="baseline-slider-val" id="val-onnuri-digital-ratio">${digitalVal}%</span>
          </div>
        `;
      }
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
            <input type="range" class="baseline-slider" id="slider-cost-rent" min="5" max="50" step="1" value="${currentBaseline.costRentRatio || 20}" />
            <span class="baseline-slider-val" id="val-cost-rent">${currentBaseline.costRentRatio || 20}%</span>
          </div>
        `;
      // P6: 원재료/상품매입비 비중
      case 'B4_2': {
        const rawVal = currentBaseline.costRawRatio !== undefined ? currentBaseline.costRawRatio : 45;
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-raw" min="20" max="85" step="1" value="${rawVal}" />
            <span class="baseline-slider-val" id="val-cost-raw">${rawVal}%</span>
          </div>
        `;
      }
      // P6: 기타(세금) 지출 비중
      case 'B4_4':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-tax" min="0" max="30" step="1" value="${currentBaseline.costTaxRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-cost-tax">${currentBaseline.costTaxRatio ?? 10}%</span>
          </div>
        `;
      // P6: 기타 영업비용 명칭 (TB4_4)
      case 'TB4_4': {
        const curEtc = currentBaseline.costEtcText || '세금';
        return `
          <select class="baseline-select" id="select-cost-etc-text">
            <option value="세금" ${curEtc === '세금' ? 'selected' : ''}>세금 (부가가치세·종합소득세) [기본]</option>
            <option value="공과금" ${curEtc === '공과금' ? 'selected' : ''}>공과금 (수도광열비·전기요금)</option>
            <option value="광고비" ${curEtc === '광고비' ? 'selected' : ''}>광고홍보비 / 마케팅비</option>
            <option value="포장소모품비" ${curEtc === '포장소모품비' ? 'selected' : ''}>포장재 / 소모품비</option>
            <option value="기타잡비" ${curEtc === '기타잡비' ? 'selected' : ''}>기타 운영잡비</option>
          </select>
        `;
      }
      // P7: 온누리상품권 가맹 시작년도 (B5B_1)
      case 'B5B_1': {
        const curJoin = currentBaseline.onnuriJoinYearMode || 'auto';
        return `
          <select class="baseline-select" id="select-onnuri-join-mode">
            <option value="auto" ${curJoin === 'auto' ? 'selected' : ''}>⚡ 개업연도 자동 연동 (A5 기준) [권장]</option>
            <option value="2024" ${curJoin === '2024' ? 'selected' : ''}>2024년 고정 가맹</option>
            <option value="2023" ${curJoin === '2023' ? 'selected' : ''}>2023년 고정 가맹</option>
            <option value="2025" ${curJoin === '2025' ? 'selected' : ''}>2025년 고정 가맹</option>
            <option value="rotation" ${curJoin === 'rotation' ? 'selected' : ''}>🎲 개업연도~2024년 자연 분산</option>
          </select>
        `;
      }
      // P7: 일평균 온누리 이용 고객 수 (Min~Max 레인지)
      case 'B5C_1':
        return renderDualRangeControl('onnuri-cust', 'onnuriCustomersMin', 'onnuriCustomersMax', 1, 30, 1, 3, 12, '명');
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
      // P10: 임차 보증금 (만 원 Min~Max 레인지)
      case 'D1C_1':
        return renderDualRangeControl('deposit', 'depositMin', 'depositMax', 300, 10000, 100, 1000, 3000, '만');
      // P10: 월 임차료 (만 원 Min~Max 레인지)
      case 'D1C_2':
        return renderDualRangeControl('monthly-rent', 'monthlyRentMin', 'monthlyRentMax', 20, 500, 5, 60, 180, '만');
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
      // P11: 부채 보유 금액 (만 원 Min~Max 레인지)
      case 'E1A':
        return renderDualRangeControl('debt-amount', 'debtAmountMin', 'debtAmountMax', 500, 20000, 100, 1000, 5000, '만');
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
      // P14: 점포 지속 예정 기간 (연수 Min~Max 레인지)
      case 'G1B':
        return renderDualRangeControl('planned-years', 'plannedYearsMin', 'plannedYearsMax', 1, 30, 1, 3, 12, '년');
      // P14: 현금영수증 발행 가능 비중 (G2 Min~Max 레인지)
      case 'G2':
        return renderDualRangeControl('cash-receipt', 'cashReceiptRatioMin', 'cashReceiptRatioMax', 10, 100, 5, 40, 80, '%');
      // Agree: 개인정보 수집 및 이용 동의
      case 'AGREE_1': {
        const curAgree = currentBaseline.privacyAgree || 'yes';
        return `
          <select class="baseline-select" id="select-privacy-agree">
            <option value="yes" ${curAgree === 'yes' ? 'selected' : ''}>개인정보 수집·이용 동의함 (1) [필수 권장]</option>
            <option value="no" ${curAgree === 'no' ? 'selected' : ''}>동의하지 않음 (2) [설문 중단]</option>
          </select>
        `;
      }
      // [조사원 평가 H1] 위생 및 점포 환경 5종 (Min~Max 레인지)
      case 'H1_1':
      case 'H1_2':
      case 'H1_3':
      case 'H1_4':
      case 'H1_5': {
        return renderDualRangeControl(`eval-${fieldId.toLowerCase()}`, `eval${fieldId}_Min`, `eval${fieldId}_Max`, 1, 5, 1, 3, 5, '점');
      }
      // [조사원 평가 H2] 산지직거래
      case 'H2_1': {
        const cur = currentBaseline.evalH2_1 || 'yes';
        return `
          <select class="baseline-select" id="select-eval-H2_1">
            <option value="yes" ${cur === 'yes' ? 'selected' : ''}>① 예 (산지직거래/품질표시) [권장]</option>
            <option value="no" ${cur === 'no' ? 'selected' : ''}>② 아니오</option>
          </select>
        `;
      }
      // [조사원 평가 H2] 스토리텔링 POP
      case 'H2_2': {
        const cur = currentBaseline.evalH2_2 || 'no';
        return `
          <select class="baseline-select" id="select-eval-H2_2">
            <option value="yes" ${cur === 'yes' ? 'selected' : ''}>① 예 (특화 POP/감성간판 부착)</option>
            <option value="no" ${cur === 'no' ? 'selected' : ''}>② 아니오 (일반 점포 기본) [권장]</option>
          </select>
        `;
      }
      // [조사원 평가 H2] 시식/체험 코너
      case 'H2_3': {
        const cur = currentBaseline.evalH2_3 || 'auto';
        return `
          <select class="baseline-select" id="select-eval-H2_3">
            <option value="auto" ${cur === 'auto' ? 'selected' : ''}>⚡ 업종별 자동 (식품/수산 1:예, 공산품 2:아니오) [권장]</option>
            <option value="yes" ${cur === 'yes' ? 'selected' : ''}>① 예 (전체 매장 실시)</option>
            <option value="no" ${cur === 'no' ? 'selected' : ''}>② 아니오 (전체 미실시)</option>
          </select>
        `;
      }
      // [조사원 평가 H2] 소포장/밀키트 비중
      case 'H2_4': {
        const cur = Number(currentBaseline.evalH2_4 ?? 3);
        return `
          <select class="baseline-select" id="select-eval-H2_4">
            <option value="1" ${cur === 1 ? 'selected' : ''}>없음 (0%)</option>
            <option value="2" ${cur === 2 ? 'selected' : ''}>10% 미만</option>
            <option value="3" ${cur === 3 ? 'selected' : ''}>10~30% 미만 (표준 가이드) [권장]</option>
            <option value="4" ${cur === 4 ? 'selected' : ''}>30~50% 미만</option>
            <option value="5" ${cur === 5 ? 'selected' : ''}>50~70% 미만</option>
            <option value="6" ${cur === 6 ? 'selected' : ''}>70% 이상</option>
          </select>
        `;
      }
      // [조사원 평가 H3] 고객응대 서비스 4종 (3.보통, 4.양호, 5.매우양호 랜덤 분산 규칙)
      case 'H3_1':
      case 'H3_2':
      case 'H3_3':
      case 'H3_4': {
        const k = `eval${fieldId}`;
        const curVal = currentBaseline[k] || 'random_345';
        return `
          <select class="baseline-select" id="select-eval-${fieldId}">
            <option value="random_345" ${curVal === 'random_345' || curVal === 'random' || !curVal ? 'selected' : ''}>🎲 3.보통 · 4.양호 · 5.매우양호 랜덤 [권장 규칙]</option>
            <option value="5" ${String(curVal) === '5' ? 'selected' : ''}>5점 (매우 양호 고정)</option>
            <option value="4" ${String(curVal) === '4' ? 'selected' : ''}>4점 (양호 고정)</option>
            <option value="3" ${String(curVal) === '3' ? 'selected' : ''}>3점 (보통 고정)</option>
          </select>
        `;
      }
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
          if (groupBaselines[activeGroup]) {
            groupBaselines[activeGroup][key] = val;
          }
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
          if (groupBaselines[activeGroup]) {
            groupBaselines[activeGroup][key] = e.target.value;
          }
          markUnsaved();
        });
      }
    };

    const updateSqm = (p) => {
      const pyeong = p !== undefined ? p : (currentBaseline.storePyeong || 14);
      const sqm = Math.round(pyeong * 3.3058);
      currentBaseline.storeSqm = sqm;
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].storeSqm = sqm;
      }
      const sliderSqm = document.getElementById('slider-sqm');
      const valSqm = document.getElementById('val-sqm');
      if (sliderSqm) sliderSqm.value = sqm;
      if (valSqm) valSqm.textContent = `${sqm} m²`;
    };

    const updatePyeong = (s) => {
      const sqm = s !== undefined ? s : (currentBaseline.storeSqm || 46);
      const pyeong = Math.max(5, Math.round(sqm / 3.3058));
      currentBaseline.storePyeong = pyeong;
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].storePyeong = pyeong;
      }
      const sliderPyeong = document.getElementById('slider-pyeong');
      const valPyeong = document.getElementById('val-pyeong');
      if (sliderPyeong) sliderPyeong.value = pyeong;
      if (valPyeong) valPyeong.textContent = `${pyeong}평`;
    };

    const updateProfit = () => {
      const valProfit = document.getElementById('val-profit');
      if (valProfit) {
        const s = currentBaseline.annualSales || 180;
        const m = currentBaseline.profitMarginRate || 25;
        const profit = Math.round((s * m) / 100);
        valProfit.innerHTML = `<i class="fa-solid fa-calculator"></i> ${profit} 백만 원 (연매출×이익률 자동 연동)`;
      }
    };

    const updateCashRatio = () => {
      const valCash = document.getElementById('val-cash-ratio');
      if (valCash) {
        const card = currentBaseline.creditCardRatio || 65;
        const onnuri = currentBaseline.onnuriRatio || 10;
        const local = currentBaseline.localRatio ?? 5;
        const zeropay = currentBaseline.zeropayRatio ?? 10;
        const cash = Math.max(0, 100 - card - onnuri - local - zeropay);
        valCash.innerHTML = `${cash}%`;
      }
    };

    const updateOnnuriDigital = (paperVal) => {
      const p = paperVal !== undefined ? paperVal : (currentBaseline.onnuriPaperRatio || 35);
      const digital = 100 - p;
      currentBaseline.onnuriDigitalRatio = digital;
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].onnuriDigitalRatio = digital;
      }
      const sliderDigital = document.getElementById('slider-onnuri-digital-ratio');
      const valDigital = document.getElementById('val-onnuri-digital-ratio');
      if (sliderDigital) sliderDigital.value = digital;
      if (valDigital) valDigital.textContent = `${digital}%`;
    };

    const updateOnnuriPaper = (digitalVal) => {
      const d = digitalVal !== undefined ? digitalVal : (currentBaseline.onnuriDigitalRatio || 65);
      const paper = 100 - d;
      currentBaseline.onnuriPaperRatio = paper;
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].onnuriPaperRatio = paper;
      }
      const sliderPaper = document.getElementById('slider-onnuri-paper-ratio');
      const valPaper = document.getElementById('val-onnuri-paper-ratio');
      if (sliderPaper) sliderPaper.value = paper;
      if (valPaper) valPaper.textContent = `${paper}%`;
    };

    const updateRawCost = () => {
      const tax = currentBaseline.costTaxRatio || 10;
      const hasPaidEmp = (currentBaseline.employeeRegularMax !== undefined ? currentBaseline.employeeRegularMax : (currentBaseline.employeeRegular || 0)) > 0;
      const labor = (hasPaidEmp ? (currentBaseline.costLaborRatio || 25) : 0);
      const rent = currentBaseline.costRentRatio || 20;
      const raw = Math.max(10, 100 - tax - labor - rent);
      currentBaseline.costRawRatio = raw;
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].costRawRatio = raw;
      }
      const sliderRaw = document.getElementById('slider-cost-raw');
      const valRaw = document.getElementById('val-cost-raw');
      if (sliderRaw) sliderRaw.value = raw;
      if (valRaw) valRaw.textContent = `${raw}%`;
    };

    // 듀얼 포인트 레인지 컨트롤 바인더
    const bindDualRange = (idPrefix, minKey, maxKey, minBound, maxBound, unit, onSync) => {
      const elMin = document.getElementById(`range-min-${idPrefix}`);
      const elMax = document.getElementById(`range-max-${idPrefix}`);
      const elHighlight = document.getElementById(`highlight-${idPrefix}`);
      const elBadgeMin = document.getElementById(`badge-min-${idPrefix}`);
      const elBadgeMax = document.getElementById(`badge-max-${idPrefix}`);
      if (!elMin || !elMax) return;

      const updateVisuals = (minVal, maxVal) => {
        const minPercent = Math.max(0, Math.min(100, ((minVal - minBound) / (maxBound - minBound)) * 100));
        const maxPercent = Math.max(0, Math.min(100, ((maxVal - minBound) / (maxBound - minBound)) * 100));
        if (elHighlight) {
          elHighlight.style.left = `${minPercent}%`;
          elHighlight.style.width = `${Math.max(0, maxPercent - minPercent)}%`;
        }
        if (elBadgeMin) elBadgeMin.textContent = minVal;
        if (elBadgeMax) elBadgeMax.textContent = maxVal;
      };

      const updateThumbZIndex = (minVal, maxVal) => {
        if (minVal === maxVal && minVal >= maxBound) {
          elMin.style.zIndex = '4';
          elMax.style.zIndex = '3';
        } else {
          elMin.style.zIndex = '3';
          elMax.style.zIndex = '4';
        }
      };

      const syncValues = (source) => {
        let minVal = parseFloat(elMin.value);
        let maxVal = parseFloat(elMax.value);
        if (minVal > maxVal) {
          if (source === 'min') {
            maxVal = minVal;
            elMax.value = maxVal;
          } else {
            minVal = maxVal;
            elMin.value = minVal;
          }
        }
        currentBaseline[minKey] = minVal;
        currentBaseline[maxKey] = maxVal;
        if (groupBaselines && groupBaselines[activeGroup]) {
          groupBaselines[activeGroup][minKey] = minVal;
          groupBaselines[activeGroup][maxKey] = maxVal;
        }
        updateVisuals(minVal, maxVal);
        updateThumbZIndex(minVal, maxVal);
        if (typeof onSync === 'function') onSync(minVal, maxVal);
      };

      elMin.addEventListener('input', () => syncValues('min'));
      elMax.addEventListener('input', () => syncValues('max'));
      elMin.addEventListener('change', () => { syncValues('min'); markUnsaved(); });
      elMax.addEventListener('change', () => { syncValues('max'); markUnsaved(); });

      const wrapEl = elMin.closest('.dual-slider-track-wrap');
      if (wrapEl) {
        wrapEl.addEventListener('pointerdown', (e) => {
          if (e.target === elMin || e.target === elMax) return;
          const rect = wrapEl.getBoundingClientRect();
          if (!rect.width) return;
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const stepVal = parseFloat(elMin.step) || 1;
          const rawVal = minBound + ratio * (maxBound - minBound);
          const snapped = Math.max(minBound, Math.min(maxBound, Math.round((rawVal - minBound) / stepVal) * stepVal + minBound));
          const curMin = parseFloat(elMin.value);
          const curMax = parseFloat(elMax.value);
          if (curMin === curMax || Math.abs(snapped - curMin) <= Math.abs(snapped - curMax)) {
            elMin.value = snapped;
            if (curMin === curMax && snapped < curMax) {
              elMax.value = snapped;
            }
            syncValues('min');
          } else {
            elMax.value = snapped;
            syncValues('max');
          }
          markUnsaved();
        });
      }
    };

    // Q1: 응답자 자격
    bindSelect('select-respondent-role', 'respondentRole');

    // P1: 성별/나이 결측 폴백 & 사업자 등록 형태 & 과세 유형
    bindSelect('select-ceo-gender-fallback', 'defaultCeoGender');
    bindDualRange('ceo-age', 'defaultCeoAgeMin', 'defaultCeoAgeMax', 30, 75, '세');
    bindSelect('select-biz-reg-type', 'bizRegType');
    bindSelect('select-tax-type', 'taxType');

    // P2: 매장 면적 & 종업원 수 (듀얼 레인지)
    bindDualRange('sqm', 'storeSqmMin', 'storeSqmMax', 10, 250, ' m²', (min, max) => {
      currentBaseline.storePyeongMin = Math.round(min / 3.3058);
      currentBaseline.storePyeongMax = Math.round(max / 3.3058);
      if (groupBaselines && groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].storePyeongMin = currentBaseline.storePyeongMin;
        groupBaselines[activeGroup].storePyeongMax = currentBaseline.storePyeongMax;
      }
    });
    bindSlider('slider-pyeong', 'val-pyeong', 'storePyeong', '평', updateSqm);
    bindDualRange('family-emp', 'employeeFamilyMin', 'employeeFamilyMax', 0, 5, '명', (min, max) => {
      currentBaseline.employeeFamily = max;
      if (groupBaselines && groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeFamily = max;
    });
    bindDualRange('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, '명', (min, max) => {
      currentBaseline.employeeRegular = max;
      if (groupBaselines && groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeRegular = max;
      updateRawCost();
    });
    bindDualRange('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, '명', (min, max) => {
      currentBaseline.employeeTemp = max;
      if (groupBaselines && groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeTemp = max;
    });
    bindSelect('select-emp-sales-link', 'empSalesLink');

    // P3: 매출 & 영업개월수 & 분기 패턴
    bindDualRange('daily-sales', 'dailySalesMin', 'dailySalesMax', 10, 300, '만');
    bindSlider('slider-annual-sales', 'val-annual-sales', 'annualSales', 'M', updateProfit);
    bindSlider('slider-operating-months', 'val-operating-months', 'operatingMonths', '개월');
    bindSelect('select-quarter-pattern', 'quarterPattern');

    // P4: 마진율 & 매출변화 & 고객수 & 시간 & 일수
    bindSlider('slider-margin', 'val-margin', 'profitMarginRate', '%', updateProfit);
    bindSelect('select-sales-change', 'salesChange');
    bindSlider('slider-daily-cust', 'val-daily-cust', 'dailyCustomers', '명');
    bindSelect('select-non-local-cust', 'nonLocalUnknownRate');
    bindSlider('slider-biz-hours', 'val-biz-hours', 'dailyBusinessHours', '시간');
    bindSlider('slider-biz-days', 'val-biz-days', 'monthlyBusinessDays', '일');

    // P5: 결제수단별 취급(지역사랑/제로페이) & 비중 & 온누리지류/디지털
    bindSelect('select-local-member', 'localPayMember');
    bindSelect('select-zeropay-member', 'zeropayMember');
    bindSelect('select-credit-card-member', 'creditCardMember');
    bindSlider('slider-credit-card', 'val-credit-card', 'creditCardRatio', '%', updateCashRatio);
    bindSlider('slider-onnuri', 'val-onnuri', 'onnuriRatio', '%', updateCashRatio);
    bindSlider('slider-local-pay', 'val-local-pay', 'localRatio', '%', updateCashRatio);
    bindSlider('slider-zeropay', 'val-zeropay', 'zeropayRatio', '%', updateCashRatio);
    bindSlider('slider-cash-ratio', 'val-cash-ratio', 'cashRatio', '%');
    bindSlider('slider-onnuri-paper-ratio', 'val-onnuri-paper-ratio', 'onnuriPaperRatio', '%', updateOnnuriDigital);
    bindSlider('slider-onnuri-digital-ratio', 'val-onnuri-digital-ratio', 'onnuriDigitalRatio', '%', updateOnnuriPaper);

    // P6: 인건비 & 임차료 & 원재료비 & 기타(세금)
    bindSlider('slider-cost-labor', 'val-cost-labor', 'costLaborRatio', '%', updateRawCost);
    bindSlider('slider-cost-rent', 'val-cost-rent', 'costRentRatio', '%', updateRawCost);
    bindSlider('slider-cost-raw', 'val-cost-raw', 'costRawRatio', '%');
    bindSlider('slider-cost-tax', 'val-cost-tax', 'costTaxRatio', '%', updateRawCost);
    bindSelect('select-cost-etc-text', 'costEtcText');

    // P7: 온누리 고객수 & 지류 & 모바일 & 가맹연도 & 만족도
    bindSelect('select-onnuri-join-mode', 'onnuriJoinYearMode');
    bindDualRange('onnuri-cust', 'onnuriCustomersMin', 'onnuriCustomersMax', 1, 30, '명');
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
    bindDualRange('deposit', 'depositMin', 'depositMax', 300, 10000, '만');
    bindDualRange('monthly-rent', 'monthlyRentMin', 'monthlyRentMax', 20, 500, '만');
    bindSelect('select-rent-trend', 'rentTrend');

    // P11: 부채 비율 & 부채 금액
    bindSlider('slider-debt', 'val-debt', 'debtAdoptionRate', '%');
    bindDualRange('debt-amount', 'debtAmountMin', 'debtAmountMax', 500, 20000, '만');

    // P12: 화재보험 & 영업배상
    bindSelect('select-fire-insurance', 'fireInsurance');
    bindSelect('select-liability-insurance', 'liabilityInsurance');

    // P13: 애로사항 & 정책과제
    bindSelect('select-issue-priority', 'issuePriority');
    bindSelect('select-policy-priority', 'policyPriority');

    // P14: 향후계획 & 승계계획 & 예정기간 & 현금영수증 발행 비중 (G2)
    bindSelect('select-future-plan', 'futurePlan');
    bindSelect('select-succession-plan', 'successionPlan');
    bindDualRange('planned-years', 'plannedYearsMin', 'plannedYearsMax', 1, 30, '년');
    bindDualRange('cash-receipt', 'cashReceiptRatioMin', 'cashReceiptRatioMax', 10, 100, '%');

    // Agree: 개인정보 동의
    bindSelect('select-privacy-agree', 'privacyAgree');

    // [조사원 평가 H1 5종 듀얼 레인지 바인딩]
    ['1', '2', '3', '4', '5'].forEach(num => {
      bindDualRange(`eval-h1-${num}`, `evalH1_${num}_Min`, `evalH1_${num}_Max`, 1, 5, '점');
    });

    // [조사원 평가 H1 & H3 슬라이더 바인딩]
    const getRatingLabel = (val) => {
      switch (Number(val)) {
        case 5: return '매우 양호';
        case 4: return '양호';
        case 3: return '보통';
        case 2: return '불량/미흡';
        case 1: return '매우 불량';
        default: return '';
      }
    };

    ['H1_1', 'H1_2', 'H1_3', 'H1_4', 'H1_5'].forEach((fid) => {
      const slider = document.getElementById(`slider-eval-${fid}`);
      const valEl = document.getElementById(`val-eval-${fid}`);
      if (slider && valEl) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          const k = `eval${fid}`;
          currentBaseline[k] = val;
          if (groupBaselines[activeGroup]) {
            groupBaselines[activeGroup][k] = val;
          }
          valEl.textContent = `${val}점 (${getRatingLabel(val)})`;
          markUnsaved();
        });
      }
    });

    // [조사원 평가 H2 셀렉트 바인딩]
    bindSelect('select-eval-H2_1', 'evalH2_1');
    bindSelect('select-eval-H2_2', 'evalH2_2');
    bindSelect('select-eval-H2_3', 'evalH2_3');
    bindSelect('select-eval-H2_4', 'evalH2_4');

    // [조사원 평가 H3 셀렉트 바인딩 - 3.보통/4.양호/5.매우양호 랜덤 규칙]
    ['H3_1', 'H3_2', 'H3_3', 'H3_4'].forEach((fid) => {
      bindSelect(`select-eval-${fid}`, `eval${fid}`);
    });
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
        employeeFamily: 0,
        employeeFamilyMin: 0,
        employeeFamilyMax: 0,
        employeeRegular: 0,
        employeeRegularMin: 0,
        employeeRegularMax: 0,
        employeeTemp: 0,
        employeeTempMin: 0,
        employeeTempMax: 0,
        dailySales: 65,
        annualSales: 180,
        quarterPattern: 'even',
        profitMarginRate: 25,
        salesChange: 'similar',
        dailyCustomers: 45,
        nonLocalUnknownRate: 90,
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
        employeeFamily: 0,
        employeeFamilyMin: 0,
        employeeFamilyMax: 0,
        employeeRegular: 2,
        employeeRegularMin: 0,
        employeeRegularMax: 2,
        employeeTemp: 1,
        employeeTempMin: 0,
        employeeTempMax: 1,
        dailySales: 130,
        annualSales: 280,
        quarterPattern: 'h2',
        profitMarginRate: 32,
        salesChange: 'increase',
        dailyCustomers: 90,
        nonLocalUnknownRate: 90,
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
        employeeFamily: 0,
        employeeFamilyMin: 0,
        employeeFamilyMax: 0,
        employeeRegular: 0,
        employeeRegularMin: 0,
        employeeRegularMax: 0,
        employeeTemp: 0,
        employeeTempMin: 0,
        employeeTempMax: 0,
        dailySales: 45,
        annualSales: 120,
        quarterPattern: 'even',
        profitMarginRate: 20,
        salesChange: 'decrease',
        dailyCustomers: 30,
        nonLocalUnknownRate: 90,
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
    if (groupBaselines[activeGroup]) {
      groupBaselines[activeGroup] = { ...currentBaseline };
    }
    renderStages();
    markUnsaved();
  }

  // 5. 마스터 기준점 저장
  if (btnSaveBaseline) {
    btnSaveBaseline.addEventListener('click', async () => {
      try {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        groupBaselines[activeGroup] = { ...currentBaseline };

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...currentBaseline,
            groups: groupBaselines
          })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '저장 실패');

        btnSaveBaseline.disabled = false;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-circle-check"></i> 마스터 기준점 저장 완료!';
        btnSaveBaseline.className = 'btn-pill btn-pill-success';

        if (badgeMasterStatus) {
          badgeMasterStatus.innerHTML = '<i class="fa-solid fa-check-double"></i> 3개 업종 그룹별 마스터 기준점 활성';
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
      const ok = confirm('설정한 3개 업종 그룹별 마스터 기준점으로 1번부터 24번까지 전체 쿼터 배치 자동화를 시작하시겠습니까?');
      if (!ok) return;

      try {
        btnRunAllBatch.disabled = true;
        btnRunAllBatch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 기준점 저장 및 배치 준비 중...';

        groupBaselines[activeGroup] = { ...currentBaseline };

        // 1. 기준점 저장 보장
        await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...currentBaseline,
            groups: groupBaselines
          })
        });

        // 2. 상세 작업실로 이동하여 즉시 배치 실행 & 실시간 스트림 관전
        window.location.href = `survey-detail.html?id=${encodeURIComponent(campaignId)}&autobatch=1`;

      } catch (err) {
        btnRunAllBatch.disabled = false;
        alert('배치 시작 실패: ' + err.message);
      }
    });
  }

  // 3개 업종 그룹 네비게이션 탭 및 일괄 복사 버튼 바인딩
  const tabGroup1 = document.getElementById('tab-group1');
  const tabGroup2 = document.getElementById('tab-group2');
  const tabGroup3 = document.getElementById('tab-group3');
  const btnCopyToAll = document.getElementById('btn-copy-to-all-groups');
  const btnImportCampBaseline = document.getElementById('btn-import-campaign-baseline');

  if (tabGroup1) tabGroup1.addEventListener('click', () => switchGroupTab('group1'));
  if (tabGroup2) tabGroup2.addEventListener('click', () => switchGroupTab('group2'));
  if (tabGroup3) tabGroup3.addEventListener('click', () => switchGroupTab('group3'));
  if (btnCopyToAll) btnCopyToAll.addEventListener('click', copyActiveGroupToAll);

  if (btnImportCampBaseline) {
    btnImportCampBaseline.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/campaigns');
        if (!res.ok) throw new Error('캠페인 목록을 불러올 수 없습니다.');
        const camps = await res.json();
        const otherCamps = (camps || []).filter(c => c.id !== campaignId && (c.masterBaseline || c.hasMasterBlueprint));
        if (otherCamps.length === 0) {
          alert('가져올 수 있는 기준점이 설정된 다른 캠페인이 없습니다.');
          return;
        }

        let msg = '1/2/3그룹 마스터 기준점을 가져올 원본 캠페인 번호를 입력하세요:\n\n';
        otherCamps.forEach((c, idx) => {
          msg += `[${idx + 1}] ${c.title} (점포 ${c.quotaDatabase?.length || 0}개)\n`;
        });
        const choice = prompt(msg, '1');
        if (!choice) return;

        const selIdx = parseInt(choice, 10) - 1;
        if (isNaN(selIdx) || selIdx < 0 || selIdx >= otherCamps.length) {
          alert('올바른 번호를 선택해 주세요.');
          return;
        }

        const sourceCamp = otherCamps[selIdx];
        if (!confirm(`"${sourceCamp.title}"의 1/2/3그룹 마스터 기준점을 이 캠페인에 복제 적용하시겠습니까?`)) {
          return;
        }

        btnImportCampBaseline.disabled = true;
        btnImportCampBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 복제 중...';

        const importRes = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/import-baseline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceCampaignId: sourceCamp.id })
        });
        const importData = await importRes.json();
        if (!importRes.ok) throw new Error(importData.error || '복제 실패');

        alert(`✓ "${sourceCamp.title}"의 1/2/3그룹 마스터 기준점이 성공적으로 적용되었습니다.`);
        await loadBlueprint();

        btnImportCampBaseline.disabled = false;
        btnImportCampBaseline.innerHTML = '<i class="fa-solid fa-file-import text-primary-color"></i> 다른 캠페인 기준점 불러오기';
      } catch (err) {
        alert('기준점 불러오기 실패: ' + err.message);
        if (btnImportCampBaseline) {
          btnImportCampBaseline.disabled = false;
          btnImportCampBaseline.innerHTML = '<i class="fa-solid fa-file-import text-primary-color"></i> 다른 캠페인 기준점 불러오기';
        }
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
