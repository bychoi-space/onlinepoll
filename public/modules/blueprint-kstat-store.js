import { escapeHtml, getBadgeClass, getBadgeLabel } from './blueprint-utils.js';

export const PRESET_STANDARD = {
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
};

export const PRESET_GROWTH = {
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
};

export const PRESET_TRADITIONAL = {
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
};

export const PRESET_ROTATION = {
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
};

export function renderKstatStoreStages(opts = {}) {
  const { blueprintStageGrid } = opts;
  const blueprintData = typeof opts.getBlueprintData === 'function' ? opts.getBlueprintData() : opts.blueprintData;
  const currentBaseline = typeof opts.getCurrentBaseline === 'function' ? opts.getCurrentBaseline() : (opts.currentBaseline || {});
  const markUnsaved = opts.markUnsaved || opts.onMarkUnsaved || null;
  if (!blueprintStageGrid || !blueprintData || !Array.isArray(blueprintData.stages)) return;

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

  function renderTunableControl(fieldId, field) {
    switch (fieldId) {
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
      case 'A2':
        return renderDualRangeControl('ceo-age', 'defaultCeoAgeMin', 'defaultCeoAgeMax', 30, 75, 1, 45, 65, '세');
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
      case 'A9_1':
        return renderDualRangeControl('sqm', 'storeSqmMin', 'storeSqmMax', 10, 250, 1, 20, 65, 'm²');
      case 'A9_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pyeong" min="5" max="75" step="1" value="${currentBaseline.storePyeong || 14}" />
            <span class="baseline-slider-val" id="val-pyeong">${currentBaseline.storePyeong || 14}평</span>
          </div>
        `;
      case 'A10_1':
        return renderDualRangeControl('family-emp', 'employeeFamilyMin', 'employeeFamilyMax', 0, 5, 1, 0, 0, '명');
      case 'A10_2':
        return renderDualRangeControl('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, 1, 0, 0, '명');
      case 'A10_3':
        return renderDualRangeControl('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, 1, 0, 0, '명');
      case 'RULE_EMP_SALES': {
        const curRule = currentBaseline.empSalesLink || 'auto';
        return `
          <select class="baseline-select" id="select-emp-sales-link">
            <option value="auto" ${curRule === 'auto' ? 'selected' : ''}>🟢 매출 비례 자동 연동 (저매출 0명 / 고매출 증가) [권장]</option>
            <option value="fixed" ${curRule === 'fixed' ? 'selected' : ''}>🔒 슬라이더 지정값 고정 (수동 설정 유지)</option>
          </select>
        `;
      }
      case 'B1AA':
        return renderDualRangeControl('daily-sales', 'dailySalesMin', 'dailySalesMax', 10, 300, 5, 30, 80, '만');
      case 'B1AB':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-annual-sales" min="40" max="500" step="10" value="${currentBaseline.annualSales || 180}" />
            <span class="baseline-slider-val" id="val-annual-sales">${currentBaseline.annualSales || 180}M</span>
          </div>
        `;
      case 'B1AC':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-operating-months" min="1" max="12" step="1" value="${currentBaseline.operatingMonths || 12}" />
            <span class="baseline-slider-val" id="val-operating-months">${currentBaseline.operatingMonths || 12}개월</span>
          </div>
        `;
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
      case 'B1BA_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-margin" min="15" max="35" step="1" value="${currentBaseline.profitMarginRate || 25}" />
            <span class="baseline-slider-val" id="val-margin">${currentBaseline.profitMarginRate || 25}%</span>
          </div>
        `;
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
      case 'B1C':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-daily-cust" min="10" max="200" step="5" value="${currentBaseline.dailyCustomers || 45}" />
            <span class="baseline-slider-val" id="val-daily-cust">${currentBaseline.dailyCustomers || 45}명</span>
          </div>
        `;
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
      case 'B1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-hours" min="6" max="18" step="1" value="${currentBaseline.dailyBusinessHours || 11}" />
            <span class="baseline-slider-val" id="val-biz-hours">${currentBaseline.dailyBusinessHours || 11}시간</span>
          </div>
        `;
      case 'B1E':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-biz-days" min="15" max="30" step="1" value="${currentBaseline.monthlyBusinessDays || 26}" />
            <span class="baseline-slider-val" id="val-biz-days">${currentBaseline.monthlyBusinessDays || 26}일</span>
          </div>
        `;
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
      case 'B2_5_1': {
        const curCard = currentBaseline.creditCardMember || 'yes';
        return `
          <select class="baseline-select" id="select-credit-card-member">
            <option value="yes" ${curCard === 'yes' ? 'selected' : ''}>신용카드 취급 (1) [기본]</option>
            <option value="no" ${curCard === 'no' ? 'selected' : ''}>신용카드 미취급 (2)</option>
          </select>
        `;
      }
      case 'B2A_5':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-credit-card" min="55" max="75" step="5" value="${currentBaseline.creditCardRatio || 65}" />
            <span class="baseline-slider-val" id="val-credit-card">${currentBaseline.creditCardRatio || 65}%</span>
          </div>
        `;
      case 'B2A_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri" min="5" max="25" step="5" value="${currentBaseline.onnuriRatio || 10}" />
            <span class="baseline-slider-val" id="val-onnuri">${currentBaseline.onnuriRatio || 10}%</span>
          </div>
        `;
      case 'B2A_3':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-local-pay" min="0" max="20" step="5" value="${currentBaseline.localRatio ?? 5}" />
            <span class="baseline-slider-val" id="val-local-pay">${currentBaseline.localRatio ?? 5}%</span>
          </div>
        `;
      case 'B2A_4':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-zeropay" min="0" max="25" step="5" value="${currentBaseline.zeropayRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-zeropay">${currentBaseline.zeropayRatio ?? 10}%</span>
          </div>
        `;
      case 'B2A_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cash-ratio" min="0" max="40" step="5" value="${currentBaseline.cashRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-cash-ratio">${currentBaseline.cashRatio ?? 10}%</span>
          </div>
        `;
      case 'B3_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-paper-ratio" min="10" max="90" step="5" value="${currentBaseline.onnuriPaperRatio || 35}" />
            <span class="baseline-slider-val" id="val-onnuri-paper-ratio">${currentBaseline.onnuriPaperRatio || 35}%</span>
          </div>
        `;
      case 'B3_2': {
        const digitalVal = currentBaseline.onnuriDigitalRatio !== undefined ? currentBaseline.onnuriDigitalRatio : (100 - (currentBaseline.onnuriPaperRatio || 35));
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-digital-ratio" min="10" max="90" step="5" value="${digitalVal}" />
            <span class="baseline-slider-val" id="val-onnuri-digital-ratio">${digitalVal}%</span>
          </div>
        `;
      }
      case 'B4_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-labor" min="10" max="40" step="1" value="${currentBaseline.costLaborRatio || 25}" />
            <span class="baseline-slider-val" id="val-cost-labor">${currentBaseline.costLaborRatio || 25}%</span>
          </div>
        `;
      case 'B4_3':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-rent" min="5" max="50" step="1" value="${currentBaseline.costRentRatio || 20}" />
            <span class="baseline-slider-val" id="val-cost-rent">${currentBaseline.costRentRatio || 20}%</span>
          </div>
        `;
      case 'B4_2': {
        const rawVal = currentBaseline.costRawRatio !== undefined ? currentBaseline.costRawRatio : 45;
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-raw" min="20" max="85" step="1" value="${rawVal}" />
            <span class="baseline-slider-val" id="val-cost-raw">${rawVal}%</span>
          </div>
        `;
      }
      case 'B4_4':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-cost-tax" min="0" max="30" step="1" value="${currentBaseline.costTaxRatio ?? 10}" />
            <span class="baseline-slider-val" id="val-cost-tax">${currentBaseline.costTaxRatio ?? 10}%</span>
          </div>
        `;
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
      case 'B5C_1':
        return renderDualRangeControl('onnuri-cust', 'onnuriCustomersMin', 'onnuriCustomersMax', 1, 30, 1, 3, 12, '명');
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
      case 'C1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery" min="30" max="95" step="5" value="${currentBaseline.deliveryFoodAdoption || 75}" />
            <span class="baseline-slider-val" id="val-delivery">외식 ${currentBaseline.deliveryFoodAdoption || 75}%</span>
          </div>
        `;
      case 'C1DA':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery-sales" min="10" max="50" step="5" value="${currentBaseline.deliverySalesRatio || 25}" />
            <span class="baseline-slider-val" id="val-delivery-sales">${currentBaseline.deliverySalesRatio || 25}%</span>
          </div>
        `;
      case 'C1F':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos" min="30" max="95" step="5" value="${currentBaseline.posAdoptionRate || 65}" />
            <span class="baseline-slider-val" id="val-pos">${currentBaseline.posAdoptionRate || 65}%</span>
          </div>
        `;
      case 'C1FA':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos-count" min="1" max="3" step="1" value="${currentBaseline.posCount || 1}" />
            <span class="baseline-slider-val" id="val-pos-count">${currentBaseline.posCount || 1}대</span>
          </div>
        `;
      case 'C1G':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-smart-order" min="0" max="50" step="5" value="${currentBaseline.smartOrderAdoption || 20}" />
            <span class="baseline-slider-val" id="val-smart-order">${currentBaseline.smartOrderAdoption || 20}%</span>
          </div>
        `;
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
      case 'C2E':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-price-tag" min="50" max="100" step="5" value="${currentBaseline.priceTagCompliance || 80}" />
            <span class="baseline-slider-val" id="val-price-tag">${currentBaseline.priceTagCompliance || 80}%</span>
          </div>
        `;
      case 'D1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-rent-rate" min="50" max="100" step="5" value="${currentBaseline.rentAdoptionRate || 80}" />
            <span class="baseline-slider-val" id="val-rent-rate">임차 ${currentBaseline.rentAdoptionRate || 80}%</span>
          </div>
        `;
      case 'D1C_1':
        return renderDualRangeControl('deposit', 'depositMin', 'depositMax', 300, 10000, 100, 1000, 3000, '만');
      case 'D1C_2':
        return renderDualRangeControl('monthly-rent', 'monthlyRentMin', 'monthlyRentMax', 20, 500, 5, 60, 180, '만');
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
      case 'E1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-debt" min="20" max="70" step="5" value="${currentBaseline.debtAdoptionRate || 45}" />
            <span class="baseline-slider-val" id="val-debt">${currentBaseline.debtAdoptionRate || 45}%</span>
          </div>
        `;
      case 'E1A':
        return renderDualRangeControl('debt-amount', 'debtAmountMin', 'debtAmountMax', 500, 20000, 100, 1000, 5000, '만');
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
      case 'G1B':
        return renderDualRangeControl('planned-years', 'plannedYearsMin', 'plannedYearsMax', 1, 30, 1, 3, 12, '년');
      case 'G2':
        return renderDualRangeControl('cash-receipt', 'cashReceiptRatioMin', 'cashReceiptRatioMax', 10, 100, 5, 40, 80, '%');
      case 'AGREE_1': {
        const curAgree = currentBaseline.privacyAgree || 'yes';
        return `
          <select class="baseline-select" id="select-privacy-agree">
            <option value="yes" ${curAgree === 'yes' ? 'selected' : ''}>개인정보 수집·이용 동의함 (1) [필수 권장]</option>
            <option value="no" ${curAgree === 'no' ? 'selected' : ''}>동의하지 않음 (2) [설문 중단]</option>
          </select>
        `;
      }
      case 'H1_1':
      case 'H1_2':
      case 'H1_3':
      case 'H1_4':
      case 'H1_5':
        return renderDualRangeControl(`eval-${fieldId.toLowerCase()}`, `eval${fieldId}_Min`, `eval${fieldId}_Max`, 1, 5, 1, 3, 5, '점');
      case 'H2_1': {
        const cur = currentBaseline.evalH2_1 || 'yes';
        return `
          <select class="baseline-select" id="select-eval-H2_1">
            <option value="yes" ${cur === 'yes' ? 'selected' : ''}>① 예 (산지직거래/품질표시) [권장]</option>
            <option value="no" ${cur === 'no' ? 'selected' : ''}>② 아니오</option>
          </select>
        `;
      }
      case 'H2_2': {
        const cur = currentBaseline.evalH2_2 || 'no';
        return `
          <select class="baseline-select" id="select-eval-H2_2">
            <option value="yes" ${cur === 'yes' ? 'selected' : ''}>① 예 (특화 POP/감성간판 부착)</option>
            <option value="no" ${cur === 'no' ? 'selected' : ''}>② 아니오 (일반 점포 기본) [권장]</option>
          </select>
        `;
      }
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
        const tax = currentBaseline.costTaxRatio || 10;
        const hasPaidEmp = (currentBaseline.employeeRegularMax !== undefined ? currentBaseline.employeeRegularMax : (currentBaseline.employeeRegular || 0)) > 0;
        const labor = (hasPaidEmp ? (currentBaseline.costLaborRatio || 25) : 0);
        const rent = currentBaseline.costRentRatio || 20;
        const raw = Math.max(10, 100 - tax - labor - rent);
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

  blueprintStageGrid.innerHTML = blueprintData.stages.map((stage) => {
    return `
      <section class="blueprint-card" id="stage-card-${stage.step}">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">${escapeHtml(stage.step)}</span>
            <h3 class="blueprint-stage-title">${escapeHtml(stage.title)}</h3>
          </div>
          <div class="blueprint-card-badge-group">
            <span class="blueprint-asp-tag font-mono">${escapeHtml(stage.aspFile)}</span>
            <span class="${getBadgeClass(stage.badge)}">${getBadgeLabel(stage.badge)}</span>
          </div>
        </div>
        
        <div class="blueprint-stage-desc">
          ${escapeHtml(stage.description)}
        </div>

        <div class="blueprint-field-list">
          ${stage.fields.map(field => renderFieldItem(field, stage)).join('')}
        </div>
      </section>
    `;
  }).join('');

  // Bind slider & select events
  const groupBaselines = typeof opts.getGroupBaselines === 'function' ? opts.getGroupBaselines() : (opts.groupBaselines || {});
  const activeGroup = typeof opts.getActiveGroup === 'function' ? opts.getActiveGroup() : (opts.activeGroup || 'group1');

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
        if (markUnsaved) markUnsaved();
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
        if (markUnsaved) markUnsaved();
      });
    }
  };

  const updateSqm = (p) => {
    const pyeong = p !== undefined ? p : (currentBaseline.storePyeong || 14);
    const sqm = Math.round(pyeong * 3.3058);
    currentBaseline.storeSqm = sqm;
    if (groupBaselines[activeGroup]) {
      groupBaselines[activeGroup].storeSqm = sqm;
    }
    const sliderSqm = document.getElementById('slider-sqm');
    const valSqm = document.getElementById('val-sqm');
    if (sliderSqm) sliderSqm.value = sqm;
    if (valSqm) valSqm.textContent = `${sqm} m²`;
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
    if (groupBaselines[activeGroup]) {
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
    if (groupBaselines[activeGroup]) {
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
    if (groupBaselines[activeGroup]) {
      groupBaselines[activeGroup].costRawRatio = raw;
    }
    const sliderRaw = document.getElementById('slider-cost-raw');
    const valRaw = document.getElementById('val-cost-raw');
    if (sliderRaw) sliderRaw.value = raw;
    if (valRaw) valRaw.textContent = `${raw}%`;
  };

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
      if (groupBaselines[activeGroup]) {
        groupBaselines[activeGroup][minKey] = minVal;
        groupBaselines[activeGroup][maxKey] = maxVal;
      }
      updateVisuals(minVal, maxVal);
      updateThumbZIndex(minVal, maxVal);
      if (typeof onSync === 'function') onSync(minVal, maxVal);
    };

    elMin.addEventListener('input', () => syncValues('min'));
    elMax.addEventListener('input', () => syncValues('max'));
    elMin.addEventListener('change', () => { syncValues('min'); if (markUnsaved) markUnsaved(); });
    elMax.addEventListener('change', () => { syncValues('max'); if (markUnsaved) markUnsaved(); });

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
        if (markUnsaved) markUnsaved();
      });
    }
  };

  bindSelect('select-respondent-role', 'respondentRole');
  bindSelect('select-ceo-gender-fallback', 'defaultCeoGender');
  bindDualRange('ceo-age', 'defaultCeoAgeMin', 'defaultCeoAgeMax', 30, 75, '세');
  bindSelect('select-biz-reg-type', 'bizRegType');
  bindSelect('select-tax-type', 'taxType');

  bindDualRange('sqm', 'storeSqmMin', 'storeSqmMax', 10, 250, ' m²', (min, max) => {
    currentBaseline.storePyeongMin = Math.round(min / 3.3058);
    currentBaseline.storePyeongMax = Math.round(max / 3.3058);
    if (groupBaselines[activeGroup]) {
      groupBaselines[activeGroup].storePyeongMin = currentBaseline.storePyeongMin;
      groupBaselines[activeGroup].storePyeongMax = currentBaseline.storePyeongMax;
    }
  });
  bindSlider('slider-pyeong', 'val-pyeong', 'storePyeong', '평', updateSqm);
  bindDualRange('family-emp', 'employeeFamilyMin', 'employeeFamilyMax', 0, 5, '명', (min, max) => {
    currentBaseline.employeeFamily = max;
    if (groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeFamily = max;
  });
  bindDualRange('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, '명', (min, max) => {
    currentBaseline.employeeRegular = max;
    if (groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeRegular = max;
    updateRawCost();
  });
  bindDualRange('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, '명', (min, max) => {
    currentBaseline.employeeTemp = max;
    if (groupBaselines[activeGroup]) groupBaselines[activeGroup].employeeTemp = max;
  });
  bindSelect('select-emp-sales-link', 'empSalesLink');

  bindDualRange('daily-sales', 'dailySalesMin', 'dailySalesMax', 10, 300, '만');
  bindSlider('slider-annual-sales', 'val-annual-sales', 'annualSales', 'M', updateProfit);
  bindSlider('slider-operating-months', 'val-operating-months', 'operatingMonths', '개월');
  bindSelect('select-quarter-pattern', 'quarterPattern');

  bindSlider('slider-margin', 'val-margin', 'profitMarginRate', '%', updateProfit);
  bindSelect('select-sales-change', 'salesChange');
  bindSlider('slider-daily-cust', 'val-daily-cust', 'dailyCustomers', '명');
  bindSelect('select-non-local-cust', 'nonLocalUnknownRate');
  bindSlider('slider-biz-hours', 'val-biz-hours', 'dailyBusinessHours', '시간');
  bindSlider('slider-biz-days', 'val-biz-days', 'monthlyBusinessDays', '일');

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

  bindSlider('slider-cost-labor', 'val-cost-labor', 'costLaborRatio', '%', updateRawCost);
  bindSlider('slider-cost-rent', 'val-cost-rent', 'costRentRatio', '%', updateRawCost);
  bindSlider('slider-cost-raw', 'val-cost-raw', 'costRawRatio', '%');
  bindSlider('slider-cost-tax', 'val-cost-tax', 'costTaxRatio', '%', updateRawCost);
  bindSelect('select-cost-etc-text', 'costEtcText');

  bindSelect('select-onnuri-join-mode', 'onnuriJoinYearMode');
  bindDualRange('onnuri-cust', 'onnuriCustomersMin', 'onnuriCustomersMax', 1, 30, '명');
  bindSelect('select-onnuri-paper', 'onnuriPaperMember');
  bindSelect('select-onnuri-mobile', 'onnuriMobileMember');
  bindSelect('select-onnuri-satisfaction', 'onnuriSatisfaction');

  bindSlider('slider-delivery', 'val-delivery', 'deliveryFoodAdoption', '%');
  bindSlider('slider-delivery-sales', 'val-delivery-sales', 'deliverySalesRatio', '%');
  bindSlider('slider-pos', 'val-pos', 'posAdoptionRate', '%');
  bindSlider('slider-pos-count', 'val-pos-count', 'posCount', '대');
  bindSlider('slider-smart-order', 'val-smart-order', 'smartOrderAdoption', '%');

  bindSelect('select-origin-target', 'originLabelTarget');
  bindSlider('slider-price-tag', 'val-price-tag', 'priceTagCompliance', '%');

  bindSlider('slider-rent-rate', 'val-rent-rate', 'rentAdoptionRate', '%');
  bindDualRange('deposit', 'depositMin', 'depositMax', 300, 10000, '만');
  bindDualRange('monthly-rent', 'monthlyRentMin', 'monthlyRentMax', 20, 500, '만');
  bindSelect('select-rent-trend', 'rentTrend');

  bindSlider('slider-debt', 'val-debt', 'debtAdoptionRate', '%');
  bindDualRange('debt-amount', 'debtAmountMin', 'debtAmountMax', 500, 20000, '만');

  bindSelect('select-fire-insurance', 'fireInsurance');
  bindSelect('select-liability-insurance', 'liabilityInsurance');

  bindSelect('select-issue-priority', 'issuePriority');
  bindSelect('select-policy-priority', 'policyPriority');

  bindSelect('select-future-plan', 'futurePlan');
  bindSelect('select-succession-plan', 'successionPlan');
  bindDualRange('planned-years', 'plannedYearsMin', 'plannedYearsMax', 1, 30, '년');
  bindDualRange('cash-receipt', 'cashReceiptRatioMin', 'cashReceiptRatioMax', 10, 100, '%');

  bindSelect('select-privacy-agree', 'privacyAgree');

  ['1', '2', '3', '4', '5'].forEach(num => {
    bindDualRange(`eval-h1-${num}`, `evalH1_${num}_Min`, `evalH1_${num}_Max`, 1, 5, '점');
  });

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
        if (markUnsaved) markUnsaved();
      });
    }
  });

  bindSelect('select-eval-H2_1', 'evalH2_1');
  bindSelect('select-eval-H2_2', 'evalH2_2');
  bindSelect('select-eval-H2_3', 'evalH2_3');
  bindSelect('select-eval-H2_4', 'evalH2_4');

  ['H3_1', 'H3_2', 'H3_3', 'H3_4'].forEach((fid) => {
    bindSelect(`select-eval-${fid}`, `eval${fid}`);
  });
}

