/**
 * 설문조사 상세 작업실 제어 스크립트 (survey-detail.js)
 * 2-Tier 와이드 쿼터 뷰, 쿼터 항목별 진행 트래커, 2-Phase 파일럿 & 배치 파이프라인 제어
 */

async function initSurveyDetailPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const campId = urlParams.get('id');

  if (!campId) {
    alert('잘못된 접근입니다. 캠페인 ID가 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  // ------------------------------------------------------------------------
  // DOM 요소 참조
  // ------------------------------------------------------------------------
  const titleEl = document.getElementById('detail-campaign-title');
  const quotaBadge = document.getElementById('detail-quota-badge');
  const statusBadge = document.getElementById('detail-status-badge');
  const statusIndicator = document.getElementById('system-status-indicator');
  const statusText = document.getElementById('system-status-text');

  // KPI 요약 칩
  const kpiTotal = document.getElementById('kpi-total-count');
  const kpiReady = document.getElementById('kpi-ready-count');
  const kpiPilot = document.getElementById('kpi-pilot-count');
  const kpiCompleted = document.getElementById('kpi-completed-count');
  const kpiRate = document.getElementById('kpi-progress-rate');

  // 쿼터 테이블 및 불러오기
  const quotaTableBody = document.getElementById('quota-table-body');
  const selectSavedQuota = document.getElementById('select-saved-quota');
  const btnImportQuota = document.getElementById('btn-import-quota');
  const btnEnrichCampaign = document.getElementById('btn-enrich-campaign-quota');

  // 마켓비즈 직접 검색
  const inputB2bKeyword = document.getElementById('input-b2b-keyword');
  const inputTargetCount = document.getElementById('input-target-count');
  const btnFieldsAll = document.getElementById('btn-fields-all');
  const btnFieldsCore = document.getElementById('btn-fields-core');
  const b2bCheckboxes = document.querySelectorAll('input[name="b2b-fields"]');
  const btnBuildQuotaDb = document.getElementById('btn-build-quota-db');

  // STEP 2: 실행 제어 & 설문 URL/엔진
  const inputSurveyUrl = document.getElementById('input-survey-url');
  const btnFillSample = document.getElementById('btn-fill-sample-url');
  const selectSurveyEngine = document.getElementById('select-survey-engine');
  const inputSurveyTopic = document.getElementById('input-survey-topic');
  const checkSafetyGuard = document.getElementById('check-safety-guard');
  const btnPilot = document.getElementById('btn-pilot-simulation');
  const btnBatch = document.getElementById('btn-batch-automation');
  const btnStop = document.getElementById('btn-stop-automation');
  const badgeBlueprintStatus = document.getElementById('badge-blueprint-status');
  const btnSaveQuotaChanges = document.getElementById('btn-save-quota-changes');
  const quotaSyncStatusMsg = document.getElementById('quota-sync-status-msg');
  const step2ConfigCard = document.getElementById('step2-execution-card');

  // STEP 3: 최하단 마스터 설문 블루프린트 (15단계 전수 복제)
  const badgeMasterStatus = document.getElementById('badge-master-status');
  const blueprintStageGrid = document.getElementById('blueprint-stage-grid');
  const btnSaveBaseline = document.getElementById('btn-save-baseline');
  const btnRunAllBatchBottom = document.getElementById('btn-run-all-batch-bottom');
  const btnPresetStandard = document.getElementById('btn-preset-standard');
  const btnPresetGrowth = document.getElementById('btn-preset-growth');
  const btnPresetTraditional = document.getElementById('btn-preset-traditional');

  // 실시간 모니터링 & 프로그레스 바
  const progressSummaryLabel = document.getElementById('progress-summary-label');
  const progressPercentLabel = document.getElementById('progress-percent-label');
  const monitorProgressFill = document.getElementById('monitor-progress-fill');
  const currentActiveStoreLabel = document.getElementById('current-active-store-label');
  const currentStorePulse = document.getElementById('current-store-pulse');

  // 실시간 로그
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const terminalLogs = document.getElementById('terminal-logs');
  const currentStepLabel = document.getElementById('current-step-label');
  const timelineChips = document.querySelectorAll('.step-chip');

  let currentCampaign = null;

  // ------------------------------------------------------------------------
  // 1. 캠페인 데이터 로드 및 UI 렌더링
  // ------------------------------------------------------------------------
  async function loadCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${campId}`);
      if (!res.ok) throw new Error('캠페인을 찾을 수 없습니다.');
      currentCampaign = await res.json();
      renderCampaignDetails(currentCampaign);
    } catch (err) {
      alert('캠페인 로드 실패: ' + err.message);
      window.location.href = 'index.html';
    }
  }

  function renderCampaignDetails(camp) {
    titleEl.textContent = camp.title;

    // 배지 상태
    statusBadge.className = `badge-status ${camp.status || 'ready'}`;
    statusBadge.textContent = camp.status === 'running' ? '실행 중' : (camp.status === 'completed' ? '완료' : '준비 완료');

    // 쿼터 DB 테이블 렌더링
    renderQuotaTable(camp.quotaDatabase || []);

    // 설문 URL 및 기본 정보 바인딩
    if (camp.guidelineConfig) {
      const firstSlotUrl = camp.quotaDatabase?.[0]?.slotUrl;
      if (inputSurveyUrl) inputSurveyUrl.value = camp.guidelineConfig.surveyUrl || firstSlotUrl || '';
      if (inputSurveyTopic) inputSurveyTopic.value = camp.guidelineConfig.topic || '';
      if (selectSurveyEngine) selectSurveyEngine.value = camp.guidelineConfig.engine || 'kstat_tapi';
    }

    // 버튼 상태 머신 갱신 (1번 검증 완료 및 배치 완료 제어)
    updateButtonStates();
  }

  // -------------------------------------------------------------
  // 실시간 배치 프로그레스 바 제어
  // -------------------------------------------------------------
  function updateBatchProgressBar(completedCount, totalCount, activeStoreName = '') {
    if (!totalCount) totalCount = currentCampaign?.quotaDatabase?.length || 24;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    if (progressSummaryLabel) progressSummaryLabel.textContent = `배치 진행률 (${completedCount} / ${totalCount} 완료)`;
    if (progressPercentLabel) progressPercentLabel.textContent = `${pct}%`;
    if (monitorProgressFill) monitorProgressFill.style.width = `${pct}%`;
    if (activeStoreName && currentActiveStoreLabel) {
      currentActiveStoreLabel.textContent = `현재 대상: ${activeStoreName}`;
    }
  }

  // -------------------------------------------------------------
  // 버튼 생명주기 및 상태 머신 (Button State Machine)
  // -------------------------------------------------------------
  function updateButtonStates() {
    if (!currentCampaign) return;
    const quotaDb = currentCampaign.quotaDatabase || [];
    const firstQuota = quotaDb.find(b => b.index === 1) || quotaDb[0];
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed');

    // 2번 이상의 잔여 쿼터들
    const remainingQuotas = quotaDb.filter(b => b.index >= 2);
    const allRemainingDone = remainingQuotas.length > 0 && remainingQuotas.every(b => b.quotaStatus === 'completed' || b.quotaStatus === 'pilot_done');
    const isRunning = currentCampaign.status === 'running' || statusIndicator.classList.contains('running');

    // 프로그레스 바 동기화
    const completedOrPilotCount = quotaDb.filter(b => b.quotaStatus === 'completed' || b.quotaStatus === 'pilot_done').length;
    updateBatchProgressBar(completedOrPilotCount, quotaDb.length);

    if (isRunning) {
      btnPilot.disabled = true;
      btnBatch.disabled = true;
      btnStop.disabled = false;
      if (step2ConfigCard) step2ConfigCard.classList.add('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = true;
      if (currentStorePulse) currentStorePulse.classList.remove('d-none');
    } else {
      btnStop.disabled = true;
      if (step2ConfigCard) step2ConfigCard.classList.remove('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = false;
      if (currentStorePulse) currentStorePulse.classList.add('d-none');

      // 1) 블루프린트 상태 동기화
      if (badgeBlueprintStatus) {
        if (currentCampaign.masterBaseline) {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint ready';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-check-circle"></i> 마스터 기준점 설정 완료';
        } else {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-clock"></i> 블루프린트 기준점 대기';
        }
      }

      // 2) 1번 단일 검증 버튼 상태
      if (firstDone) {
        btnPilot.disabled = true;
        btnPilot.textContent = '1번 쿼터 검증 완료';
      } else {
        btnPilot.disabled = false;
        btnPilot.textContent = '1번 단일 검증';
      }

      // 3) 전체 배치 자동화 가동 버튼 상태
      const allCompleted = quotaDb.length > 0 && quotaDb.every(b => b.quotaStatus === 'completed');
      if (allCompleted) {
        btnBatch.disabled = true;
        btnBatch.textContent = '전체 배치 자동화 최종 마감 완료 (100%)';
      } else {
        btnBatch.disabled = false;
        if (firstDone) {
          btnBatch.innerHTML = '<i class="fa-solid fa-play"></i> 잔여 쿼터 배치 자동화 가동 (2번~24번)';
        } else {
          btnBatch.innerHTML = '<i class="fa-solid fa-play"></i> 전체 쿼터 배치 자동화 가동 (1번~24번)';
        }
      }
    }
  }

  // ------------------------------------------------------------------------
  // 2. 쿼터 테이블 렌더링 & 항목별 진행 트래커 (와이드 뷰)
  // ------------------------------------------------------------------------
  function renderQuotaTable(db) {
    // KPI 카운트 집계
    const total = db.length;
    let ready = 0;
    let pilot = 0;
    let completed = 0;

    db.forEach(item => {
      const st = item.quotaStatus || 'ready';
      if (st === 'pilot_done') pilot++;
      else if (st === 'completed') completed++;
      else ready++;
    });

    kpiTotal.textContent = total;
    kpiReady.textContent = ready;
    kpiPilot.textContent = pilot;
    kpiCompleted.textContent = completed;
    const rate = total > 0 ? Math.round(((pilot + completed) / total) * 100) : 0;
    kpiRate.textContent = `${rate}%`;

    if (total === 0) {
      quotaTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table-msg">
            아직 구축된 사업자 DB가 없습니다.<br>
            상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.
          </td>
        </tr>
      `;
      return;
    }

    quotaTableBody.innerHTML = db.map((item, idx) => {
      const st = item.quotaStatus || 'ready';
      let statusHtml = '<span class="badge-status ready">대기</span>';

      if (st === 'pilot_done') {
        statusHtml = '<span class="badge-status pilot">검증완료</span>';
      } else if (st === 'completed') {
        statusHtml = '<span class="badge-status success">제출완료</span>';
      } else if (st === 'running') {
        statusHtml = '<span class="badge-status running">실행 중</span>';
      } else if (st === 'error') {
        statusHtml = '<span class="badge-status error">오류</span>';
      }

      let ceoVal = escapeHtml(item.ceoName || '-');
      if (item.isCeoEnriched) ceoVal += ` <span class="badge-enriched">보강</span>`;

      let phoneVal = escapeHtml(item.phone || '-');
      if (item.isPhoneEnriched) phoneVal += ` <span class="badge-enriched">보강</span>`;

      const itemVal = item.handledItems || item.industry || '-';
      const addrVal = item.address ? (item.address.length > 28 ? item.address.slice(0, 28) + '...' : item.address) : '-';

      let slotTag = '';
      if (item.slotIndex) {
        slotTag = `<div class="quota-slot-badge font-mono" title="${escapeHtml(item.slotUrl || '')}">슬롯 #${item.slotIndex} ${escapeHtml(item.slotExtra || '')}</div>`;
      }

      return `
        <tr data-row-idx="${item.index}">
          <td class="text-center font-mono font-bold">${item.index || idx + 1}</td>
          <td>
            <strong>${escapeHtml(item.companyName)}</strong>
            ${slotTag}
          </td>
          <td><code>${escapeHtml(item.bizNumber || '-')}</code></td>
          <td>${ceoVal}</td>
          <td class="text-center col-gender editable-quota-cell" data-idx="${item.index || idx + 1}" data-field="ceoGender" title="클릭하여 성별 수정">
            ${item.ceoGender ? `<span class="badge-gender ${item.ceoGender === '남' ? 'male' : 'female'}">${escapeHtml(item.ceoGender)}</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center col-age editable-quota-cell" data-idx="${item.index || idx + 1}" data-field="ceoAge" title="클릭하여 나이 수정">
            ${item.ceoAge ? `<span class="badge-age font-mono">${escapeHtml(item.ceoAge)}세</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td>${phoneVal}</td>
          <td>${escapeHtml(item.openDate || '-')}</td>
          <td><span class="badge-quota-type b2b">${escapeHtml(itemVal)}</span></td>
          <td>${escapeHtml(addrVal)}</td>
          <td class="text-center">${statusHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // ------------------------------------------------------------------------
  // 3-1. 쿼터 테이블 인라인 편집 (성별, 나이) 및 실시간 동기화
  // ------------------------------------------------------------------------
  quotaTableBody.addEventListener('click', (e) => {
    const cell = e.target.closest('.editable-quota-cell');
    if (!cell || cell.querySelector('input, select')) return;

    const rowIdx = parseInt(cell.dataset.idx, 10);
    const field = cell.dataset.field;
    if (!currentCampaign || !Array.isArray(currentCampaign.quotaDatabase)) return;

    const item = currentCampaign.quotaDatabase.find(b => (b.index || b.seq) === rowIdx);
    if (!item) return;

    if (field === 'ceoGender') {
      const currentVal = item.ceoGender || '';
      cell.innerHTML = `
        <select class="inline-cell-select">
          <option value="남" ${currentVal === '남' ? 'selected' : ''}>남</option>
          <option value="여" ${currentVal === '여' ? 'selected' : ''}>여</option>
          <option value="" ${!currentVal ? 'selected' : ''}>-</option>
        </select>
      `;
      const select = cell.querySelector('select');
      select.focus();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = select.value.trim() || null;
        item.ceoGender = newVal;
        renderQuotaTable(currentCampaign.quotaDatabase);
        await autoSaveCampaignQuotas();
      };

      select.addEventListener('change', finishEdit);
      select.addEventListener('blur', finishEdit);
    } else if (field === 'ceoAge') {
      const currentVal = item.ceoAge || '';
      cell.innerHTML = `
        <input type="number" min="20" max="95" class="inline-cell-input" value="${currentVal}" placeholder="나이" />
      `;
      const input = cell.querySelector('input');
      input.focus();
      input.select();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const rawVal = input.value.trim();
        const newVal = rawVal ? parseInt(rawVal, 10) : null;
        item.ceoAge = newVal;
        renderQuotaTable(currentCampaign.quotaDatabase);
        await autoSaveCampaignQuotas();
      };

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finishEdit();
      });
      input.addEventListener('blur', finishEdit);
    }
  });

  async function autoSaveCampaignQuotas() {
    if (!currentCampaign) return;
    try {
      if (quotaSyncStatusMsg) {
        quotaSyncStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 엑셀 동기화 중...';
      }
      const res = await fetch(`/api/campaigns/${campId}/quota`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotaDatabase: currentCampaign.quotaDatabase })
      });
      if (res.ok) {
        if (quotaSyncStatusMsg) {
          quotaSyncStatusMsg.innerHTML = '<span class="text-success font-bold">✓ 저장 및 Excel 동기화 완료!</span>';
          setTimeout(() => {
            if (quotaSyncStatusMsg) quotaSyncStatusMsg.innerHTML = '';
          }, 3000);
        }
      }
    } catch (err) {
      if (quotaSyncStatusMsg) {
        quotaSyncStatusMsg.innerHTML = '<span class="text-error">저장 실패: ' + err.message + '</span>';
      }
    }
  }

  if (btnSaveQuotaChanges) {
    btnSaveQuotaChanges.addEventListener('click', autoSaveCampaignQuotas);
  }

  // ------------------------------------------------------------------------
  // 4. 보관된 쿼터 불러오기 (Import) & 결측치 보강
  // ------------------------------------------------------------------------
  async function loadSavedQuotas() {
    try {
      const res = await fetch('/api/quota/list');
      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) {
        selectSavedQuota.innerHTML = '<option value="">보관된 쿼터가 없습니다.</option>';
        return;
      }
      const defaultOption = '<option value="">-- 보관된 쿼터를 선택하세요 --</option>';
      const options = list.map(q => {
        const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '';
        return `<option value="${escapeHtml(q.fileName)}">[온누리] ${escapeHtml(q.title)} (${q.count}건) - ${dateStr}</option>`;
      }).join('');
      selectSavedQuota.innerHTML = defaultOption + options;
    } catch (err) {
      selectSavedQuota.innerHTML = '<option value="">쿼터 목록을 불러오지 못했습니다.</option>';
    }
  }

  if (btnImportQuota) {
    btnImportQuota.addEventListener('click', async () => {
      const quotaFileName = selectSavedQuota.value;
      if (!quotaFileName) {
        alert('장착할 쿼터를 선택해 주세요.');
        return;
      }

      try {
        btnImportQuota.disabled = true;
        btnImportQuota.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 쿼터 장착 중...';

        const res = await fetch(`/api/campaigns/${campId}/import-quota`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quotaFileName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '쿼터 장착 실패');

        appendLog('success', data.message);
        currentCampaign = data.campaign;
        renderCampaignDetails(currentCampaign);
        alert(data.message);
      } catch (err) {
        alert('쿼터 장착 오류: ' + err.message);
        appendLog('error', `쿼터 장착 오류: ${err.message}`);
      } finally {
        btnImportQuota.disabled = false;
        btnImportQuota.textContent = '쿼터 장착';
      }
    });
  }

  if (btnEnrichCampaign) {
    btnEnrichCampaign.addEventListener('click', async () => {
      if (!currentCampaign || !currentCampaign.quotaDatabase || currentCampaign.quotaDatabase.length === 0) {
        alert('보강할 사업자 DB가 없습니다. 먼저 쿼터를 등록해 주세요.');
        return;
      }

      try {
        btnEnrichCampaign.disabled = true;
        btnEnrichCampaign.textContent = '외부 공인 탐색 중...';
        appendLog('info', `[결측치 보강] 사업자 공인 데이터 탐색 중...`);

        const res = await fetch(`/api/campaigns/${campId}/enrich-quota`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '보강 실패');

        currentCampaign.quotaDatabase = data.quotaDatabase;
        renderQuotaTable(data.quotaDatabase);
        appendLog('success', data.message);
        alert(`결측치 외부 보강 완료!\n총 ${data.enrichedCount}건의 사업자 정보가 성공적으로 보강되었습니다.`);
      } catch (err) {
        appendLog('error', `결측치 보강 오류: ${err.message}`);
      } finally {
        btnEnrichCampaign.disabled = false;
        btnEnrichCampaign.textContent = '결측치 외부 보강';
      }
    });
  }

  // 전통시장 실태조사 URL 채우기 샘플
  btnFillSample.addEventListener('click', () => {
    inputSurveyUrl.value = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';
    inputSurveyTopic.value = '2026년 전통시장·상점가 및 점포경영 실태조사 (점포주 대상)';
    inputTextGuidelines.value = '전통시장 온누리상품권 가맹 혜택 및 디지털 온누리 환급 지원 강화 의견';
    selectSurveyEngine.value = 'kstat_tapi';
    appendLog('info', '전통시장 실태조사 URL 및 케이스탯 전용 엔진 설정이 적용되었습니다.');
  });

  // ------------------------------------------------------------------------
  // 5. STEP 3: 2-Phase 듀얼 실행 제어기 (파일럿 검증 ➔ 배치 연속 가동)
  // ------------------------------------------------------------------------
  function getPolicyPayload() {
    return {
      emptyNotes: policyEmptyNotes.value,
      profitChange: policyProfitChange.value,
      debtStatus: policyDebtStatus.value,
      deliveryStatus: policyDeliveryStatus.value
    };
  }

  // ------------------------------------------------------------------------
  // 5. STEP 3: 15단계 마스터 설문 블루프린트 & 기준점 에디터 (통합)
  // ------------------------------------------------------------------------
  let blueprintData = null;
  let currentBaseline = {
    storePyeong: 14,
    employeeFamily: 1,
    employeeRegular: 0,
    employeeTemp: 0,
    dailySales: 65,
    quarterPattern: 'even',
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

  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      if (data.baseline) {
        currentBaseline = { ...currentBaseline, ...data.baseline };
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
      if (blueprintStageGrid) {
        blueprintStageGrid.innerHTML = `
          <div class="empty-table-msg">
            <i class="fa-solid fa-triangle-exclamation text-error"></i> 블루프린트를 불러오지 못했습니다: ${err.message}
          </div>
        `;
      }
    }
  }

  function renderStages() {
    if (!blueprintStageGrid || !blueprintData || !Array.isArray(blueprintData.stages)) return;

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
          
          <div class="blueprint-stage-desc">
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

  function renderFieldItem(field, stage) {
    let controlHtml = '';

    if (field.type === 'bind') {
      controlHtml = `
        <span class="font-caption font-mono text-dim font-bold">
          <i class="fa-solid fa-link text-primary-color"></i> 쿼터 [${escapeHtml(field.source)}]
        </span>
      `;
    } else if (field.type === 'linked_computed') {
      const p = currentBaseline.storePyeong || 14;
      const sqm = Math.round(p * 3.3058);
      controlHtml = `
        <span class="badge-status ready font-caption font-bold" id="val-sqm">
          <i class="fa-solid fa-arrows-rotate"></i> ${sqm} m² (자동 연동)
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

  function renderTunableControl(fieldId, field) {
    switch (fieldId) {
      // P2: 매장 면적 (평수 조절)
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
      // P3: 분기별 매출 비중 패턴
      case 'B1AC_1~4':
        const curPat = currentBaseline.quarterPattern || 'even';
        return `
          <select class="baseline-select" id="select-quarter-pattern">
            <option value="even" ${curPat === 'even' ? 'selected' : ''}>균등형 (25/25/25/25%)</option>
            <option value="h2" ${curPat === 'h2' ? 'selected' : ''}>하반기·명절 성수기 (20/20/30/30%)</option>
            <option value="h1" ${curPat === 'h1' ? 'selected' : ''}>상반기 성수기 (30/30/20/20%)</option>
            <option value="season" ${curPat === 'season' ? 'selected' : ''}>봄·가을 성수기 (30/20/30/20%)</option>
          </select>
        `;
      case 'B2A_5':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-credit-card" min="60" max="70" value="${currentBaseline.creditCardRatio || 65}" />
            <span class="baseline-slider-val" id="val-credit-card">${currentBaseline.creditCardRatio || 65}%</span>
          </div>
        `;
      case 'B2A_2':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri" min="10" max="20" value="${currentBaseline.onnuriRatio || 15}" />
            <span class="baseline-slider-val" id="val-onnuri">${currentBaseline.onnuriRatio || 15}%</span>
          </div>
        `;
      case 'B1BA_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-margin" min="15" max="35" value="${currentBaseline.profitMarginRate || 25}" />
            <span class="baseline-slider-val" id="val-margin">${currentBaseline.profitMarginRate || 25}%</span>
          </div>
        `;
      case 'C1D':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-delivery" min="30" max="95" value="${currentBaseline.deliveryFoodAdoption || 75}" />
            <span class="baseline-slider-val" id="val-delivery">외식 ${currentBaseline.deliveryFoodAdoption || 75}%</span>
          </div>
        `;
      case 'C1F':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-pos" min="30" max="95" value="${currentBaseline.posAdoptionRate || 65}" />
            <span class="baseline-slider-val" id="val-pos">${currentBaseline.posAdoptionRate || 65}%</span>
          </div>
        `;
      case 'E1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-debt" min="20" max="70" value="${currentBaseline.debtAdoptionRate || 45}" />
            <span class="baseline-slider-val" id="val-debt">${currentBaseline.debtAdoptionRate || 45}%</span>
          </div>
        `;
      case 'B5C_1':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-onnuri-cust" min="2" max="10" value="${currentBaseline.onnuriCustomerAvg || 5}" />
            <span class="baseline-slider-val" id="val-onnuri-cust">${currentBaseline.onnuriCustomerAvg || 5}명</span>
          </div>
        `;
      case 'G1B':
        return `
          <div class="baseline-slider-container">
            <input type="range" class="baseline-slider" id="slider-years" min="3" max="20" value="${currentBaseline.plannedYears || 8}" />
            <span class="baseline-slider-val" id="val-years">${currentBaseline.plannedYears || 8}년</span>
          </div>
        `;
      case 'B1AB':
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

    // P2: 매장 면적 (평수 조절 -> m² 자동 환산 연동)
    const sliderPyeong = document.getElementById('slider-pyeong');
    const valPyeong = document.getElementById('val-pyeong');
    const valSqm = document.getElementById('val-sqm');
    if (sliderPyeong) {
      sliderPyeong.addEventListener('input', (e) => {
        const p = parseInt(e.target.value, 10);
        currentBaseline.storePyeong = p;
        if (valPyeong) valPyeong.textContent = `${p}평`;
        if (valSqm) valSqm.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${Math.round(p * 3.3058)} m² (자동 연동)`;
        markUnsaved();
      });
    }

    // P2: 종업원 수 슬라이더 (가족, 유급, 일용)
    bindSlider('slider-family-emp', 'val-family-emp', 'employeeFamily', '명');
    bindSlider('slider-paid-emp', 'val-paid-emp', 'employeeRegular', '명');
    bindSlider('slider-temp-emp', 'val-temp-emp', 'employeeTemp', '명');

    // P3: 매출 슬라이더 및 분기 패턴
    bindSlider('slider-daily-sales', 'val-daily-sales', 'dailySales', '만');
    const selectQuarter = document.getElementById('select-quarter-pattern');
    if (selectQuarter) {
      selectQuarter.addEventListener('change', (e) => {
        currentBaseline.quarterPattern = e.target.value;
        markUnsaved();
      });
    }

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
    if (btnSaveBaseline) {
      btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 마스터 기준점 저장 (미저장)';
      btnSaveBaseline.className = 'btn-pill btn-pill-primary btn-pulse';
    }
  }

  function applyPreset(presetValues, activeBtn) {
    document.querySelectorAll('.blueprint-preset-group .btn-chip').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');

    currentBaseline = { ...currentBaseline, ...presetValues };
    renderStages();
    markUnsaved();
  }

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
        storePyeong: 25,
        employeeFamily: 1,
        employeeRegular: 2,
        employeeTemp: 1,
        dailySales: 130,
        annualSales: 280,
        quarterPattern: 'h2',
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
        storePyeong: 8,
        employeeFamily: 1,
        employeeRegular: 0,
        employeeTemp: 0,
        dailySales: 45,
        annualSales: 120,
        quarterPattern: 'even',
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

  async function saveBaseline(showNotification = true) {
    try {
      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
      }

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentBaseline)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '저장 실패');

      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = false;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-circle-check"></i> 마스터 기준점 저장 완료!';
        btnSaveBaseline.className = 'btn-pill btn-pill-success';
      }

      if (badgeMasterStatus) {
        badgeMasterStatus.innerHTML = '<i class="fa-solid fa-check-double"></i> 사용자 마스터 기준점 활성';
        badgeMasterStatus.className = 'badge-status badge-blueprint ready';
      }

      if (showNotification) {
        appendLog('success', '✓ 마스터 기준점(Baseline)이 성공적으로 저장되었습니다. 24개 쿼터에 적용됩니다.');
      }

      setTimeout(() => {
        if (btnSaveBaseline) {
          btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 마스터 기준점 저장';
          btnSaveBaseline.className = 'btn-pill btn-pill-primary';
        }
      }, 2500);

      return true;
    } catch (err) {
      if (btnSaveBaseline) btnSaveBaseline.disabled = false;
      if (showNotification) alert('기준점 저장 실패: ' + err.message);
      appendLog('error', `기준점 저장 실패: ${err.message}`);
      return false;
    }
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.addEventListener('click', () => saveBaseline(true));
  }

  // ------------------------------------------------------------------------
  // 6. 실행 제어 파이프라인 (단일 검증 & 전체 배치 연속 가동)
  // ------------------------------------------------------------------------
  // [버튼 1] 1번 쿼터 파일럿 검증 (Agree 직전 안전 대기)
  btnPilot.addEventListener('click', async () => {
    let surveyUrl = inputSurveyUrl.value.trim();
    if (!surveyUrl) {
      const firstSlot = currentCampaign?.quotaDatabase?.[0]?.slotUrl;
      if (firstSlot) {
        surveyUrl = firstSlot;
        inputSurveyUrl.value = firstSlot;
      } else {
        alert('설문조사 URL을 입력해 주세요.');
        inputSurveyUrl.focus();
        return;
      }
    }

    try {
      setRunningState(true);
      resetTimelineChips();
      appendLog('info', '🎯 [1번 단일 검증 시작] 1번 쿼터 사업자로 Q1부터 Agree.asp까지 안전 완주를 진행합니다...');

      // 기준점 자동 저장
      await saveBaseline(false);

      const res = await fetch(`/api/campaigns/${campId}/pilot-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyUrl,
          quotaIndex: 1
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '파일럿 실행 실패');
      appendLog('success', data.message);
    } catch (err) {
      appendLog('error', `파일럿 실행 실패: ${err.message}`);
      setRunningState(false);
    }
  });

  // [버튼 2] 전체 쿼터 (1번~24번) 배치 연속 가동
  const triggerBatchRun = async () => {
    let surveyUrl = inputSurveyUrl.value.trim();
    const hasSlotUrls = currentCampaign?.quotaDatabase?.some(b => b.slotUrl);
    if (!surveyUrl && !hasSlotUrls) {
      alert('설문조사 URL을 입력해 주세요.');
      inputSurveyUrl.focus();
      return;
    }

    const firstQuota = currentCampaign?.quotaDatabase?.find(b => b.index === 1);
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed');
    const startIdx = firstDone ? 2 : 1;

    const safetyGuard = checkSafetyGuard.checked;
    const confirmMsg = safetyGuard
      ? (startIdx === 1
          ? '1번부터 24번까지 전체 쿼터 연속 배치를 시작합니다. (최종 동의 단계에서 안전 대기)'
          : '2번 쿼터부터 잔여 쿼터 연속 배치를 시작합니다. (최종 동의 단계에서 안전 대기)')
      : '⚠️ 주의: 최종 제출 안전가드가 해제되어 있습니다!\n설문이 실제로 최종 제출 마감됩니다. 계속하시겠습니까?';

    if (!confirm(confirmMsg)) return;

    try {
      setRunningState(true);
      appendLog('info', `🚀 [배치 가동 시작] ${startIdx}번 쿼터부터 고속 자동화 연속 실행을 시작합니다...`);

      // 1. 기준점 저장 보장
      await saveBaseline(false);

      const res = await fetch(`/api/campaigns/${campId}/batch-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyUrl,
          startIndex: startIdx,
          safetyGuard
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '배치 실행 실패');
      appendLog('success', data.message);
    } catch (err) {
      appendLog('error', `배치 실행 실패: ${err.message}`);
      setRunningState(false);
    }
  };

  btnBatch.addEventListener('click', triggerBatchRun);
  if (btnRunAllBatchBottom) {
    btnRunAllBatchBottom.addEventListener('click', triggerBatchRun);
  }

  // 중지 버튼
  btnStop.addEventListener('click', async () => {
    await fetch('/api/survey/stop', { method: 'POST' });
    setRunningState(false);
    appendLog('warn', '작업 중지 요청이 전송되었습니다.');
  });

  // ------------------------------------------------------------------------
  // 6. 실시간 타임라인 칩 제어
  // ------------------------------------------------------------------------
  function setTimelineStep(stepName) {
    if (!stepName) return;
    if (currentStepLabel) currentStepLabel.textContent = stepName;
    let found = false;

    timelineChips.forEach(chip => {
      const s = chip.dataset.step;
      if (s === stepName) {
        chip.className = 'step-chip active';
        found = true;
        try {
          chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } catch (_) {}
      } else if (!found) {
        chip.className = 'step-chip done';
      } else {
        chip.className = 'step-chip';
      }
    });
  }

  function resetTimelineChips() {
    timelineChips.forEach(chip => chip.className = 'step-chip');
    currentStepLabel.textContent = '시작 대기';
  }

  const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  function getKstTime() {
    try {
      return kstFormatter.format(new Date());
    } catch (_) {
      return new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    }
  }

  // ------------------------------------------------------------------------
  // 8. SSE 실시간 스트림 구독 & 상태 업데이트
  // ------------------------------------------------------------------------
  function initEventSource() {
    const sse = new EventSource('/api/events');
    sse.onmessage = async (event) => {
      try {
        const raw = JSON.parse(event.data);
        const data = (typeof raw.type === 'object' && raw.type !== null)
          ? { ...raw, ...raw.type, type: raw.type.type || raw.type }
          : (raw.data && typeof raw.data === 'object')
            ? { ...raw, ...raw.data }
            : raw;

        // 일반 로그
        if (data.type === 'log') {
          appendLog(data.level, data.message, data.timestamp);
        }

        // 파일럿 진행
        else if (data.type === 'PILOT_PROGRESS') {
          setTimelineStep(data.step);
        }

        // 파일럿 완료 (화면 자동 동기화)
        else if (data.type === 'PILOT_COMPLETED') {
          setTimelineStep('Agree');
          setRunningState(false);
          await loadCampaign();
          appendLog('success', `🎉 1번 쿼터 "${data.bizName || ''}" 파일럿 검증 완료! Agree.asp 안전 대기 중.`);
        }

        // 배치 진행
        else if (data.type === 'BATCH_PROGRESS') {
          setTimelineStep(data.step);
          if (data.bizName && currentActiveStoreLabel) {
            currentActiveStoreLabel.textContent = `[#${data.quotaIndex}] ${data.bizName}`;
          }
          if (data.quotaIndex && currentCampaign) {
            const total = currentCampaign.quotaDatabase?.length || 24;
            const completed = currentCampaign.quotaDatabase?.filter(b => b.quotaStatus === 'completed' || b.quotaStatus === 'pilot_done').length || 0;
            updateBatchProgressBar(completed, total, data.bizName);
          }
          if (data.message) {
            appendLog('info', `[#${data.quotaIndex}] ${data.message}`);
          }
        }

        // 배치 완료 (화면 자동 동기화)
        else if (data.type === 'BATCH_COMPLETED') {
          setTimelineStep('Agree');
          setRunningState(false);
          await loadCampaign();
          appendLog('success', '🎉 모든 쿼터의 배치 자동화가 성공적으로 완료되었습니다!');
        }

        // 쿼터 업데이트
        else if (data.type === 'QUOTA_UPDATED') {
          if (currentCampaign) {
            currentCampaign.quotaDatabase = data.quotaDatabase;
            renderQuotaTable(data.quotaDatabase);
            updateButtonStates();
          }
        }
      } catch (_) {}
    };
  }

  // 유틸 함수들
  function appendLog(level, msg, time = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const t = time || getKstTime();
    entry.innerHTML = `<span class="log-time">[${t}]</span><span class="log-badge ${level}">${level.toUpperCase()}</span><span class="log-msg">${escapeHtml(msg)}</span>`;
    terminalLogs.appendChild(entry);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  function setRunningState(running) {
    if (running) {
      statusIndicator.classList.add('running');
      statusText.textContent = '자동화 실행 중 (로봇 작동)';
      btnPilot.disabled = true;
      btnBatch.disabled = true;
      btnStop.disabled = false;
      if (step2ConfigCard) step2ConfigCard.classList.add('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = true;
      if (currentStorePulse) currentStorePulse.classList.remove('d-none');
    } else {
      statusIndicator.classList.remove('running');
      statusText.textContent = '준비 완료 (대기 중)';
      btnStop.disabled = true;
      if (step2ConfigCard) step2ConfigCard.classList.remove('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = false;
      if (currentStorePulse) currentStorePulse.classList.add('d-none');
      updateButtonStates();
    }
  }

  if (checkSafetyGuard) {
    checkSafetyGuard.addEventListener('change', updateButtonStates);
  }

  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    appendLog('info', '콘솔 로그가 비워졌습니다.');
  });

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 초기 실행 (개별 try-catch로 상호 영향 차단)
  try {
    await loadSavedQuotas();
  } catch (err) {
    console.error('초기 쿼터 목록 로드 실패:', err);
  }

  try {
    await loadCampaign();
  } catch (err) {
    console.error('초기 캠페인 로드 실패:', err);
  }

  try {
    await loadBlueprint();
  } catch (err) {
    console.error('초기 마스터 블루프린트 로드 실패:', err);
  }

  try {
    initEventSource();
  } catch (err) {
    console.error('초기 SSE 구독 실패:', err);
  }

  // URL 파라미터에 autobatch=1이 전달된 경우 (블루프린트에서 가동 시 자동 시작)
  if (urlParams.get('autobatch') === '1') {
    setTimeout(() => {
      if (btnBatch && !btnBatch.disabled) {
        appendLog('info', '🎯 [마스터 기준점 연계] 블루프린트에서 요청된 1~24번 전체 배치를 자동 시작합니다.');
        btnBatch.click();
      }
    }, 600);
  }
}

// DOM 준비 상태에 따른 안전한 초기화 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSurveyDetailPage);
} else {
  initSurveyDetailPage();
}
