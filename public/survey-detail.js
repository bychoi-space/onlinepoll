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

  // STEP 2: 설문 가이드 & 실전 규칙
  const inputSurveyUrl = document.getElementById('input-survey-url');
  const btnFillSample = document.getElementById('btn-fill-sample-url');
  const selectSurveyEngine = document.getElementById('select-survey-engine');
  const inputSurveyTopic = document.getElementById('input-survey-topic');
  const inputTextGuidelines = document.getElementById('input-text-guidelines');
  const inputIterations = document.getElementById('input-iterations');
  const inputHeadless = document.getElementById('input-headless');

  // 공란 정책 옵션들
  const policyEmptyNotes = document.getElementById('policy-empty-notes');
  const policyProfitChange = document.getElementById('policy-profit-change');
  const policyDebtStatus = document.getElementById('policy-debt-status');
  const policyDeliveryStatus = document.getElementById('policy-delivery-status');

  // 객관식 슬라이더
  const sliderPos = document.getElementById('slider-pos');
  const sliderNeu = document.getElementById('slider-neu');
  const sliderNeg = document.getElementById('slider-neg');
  const valPos = document.getElementById('val-pos');
  const valNeu = document.getElementById('val-neu');
  const valNeg = document.getElementById('val-neg');
  const barPos = document.getElementById('bar-pos');
  const barNeu = document.getElementById('bar-neu');
  const barNeg = document.getElementById('bar-neg');
  const valRatioBadge = document.getElementById('val-ratio-badge');

  // STEP 2 & 3 제어기 및 딤드 타깃
  const step2ConfigCard = document.getElementById('step2-config-card');
  const checkSafetyGuard = document.getElementById('check-safety-guard');
  const btnPilot = document.getElementById('btn-pilot-simulation');
  const btnBatch = document.getElementById('btn-batch-automation');
  const btnStop = document.getElementById('btn-stop-automation');

  // 실시간 모니터링 & 프로그레스 바
  const progressSummaryLabel = document.getElementById('progress-summary-label');
  const progressPercentLabel = document.getElementById('progress-percent-label');
  const monitorProgressFill = document.getElementById('monitor-progress-fill');
  const currentActiveStoreLabel = document.getElementById('current-active-store-label');
  const currentStorePulse = document.getElementById('current-store-pulse');

  // 로그 및 갤러리
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const terminalLogs = document.getElementById('terminal-logs');
  const currentStepLabel = document.getElementById('current-step-label');
  const timelineChips = document.querySelectorAll('.step-chip');
  const tabBtnLogs = document.getElementById('tab-btn-logs');
  const tabBtnGallery = document.getElementById('tab-btn-gallery');
  const panelTabLogs = document.getElementById('panel-tab-logs');
  const panelTabGallery = document.getElementById('panel-tab-gallery');
  const galleryStrip = document.getElementById('gallery-strip');
  const galleryCount = document.getElementById('gallery-count');
  const btnViewPilotCaptures = document.getElementById('btn-view-pilot-captures');

  // 15단계 스크린샷 모달
  const captureModalOverlay = document.getElementById('capture-modal-overlay');
  const captureModalTitle = document.getElementById('capture-modal-title');
  const captureViewerImg = document.getElementById('capture-viewer-img');
  const btnCloseCaptureModal = document.getElementById('btn-close-capture-modal');
  const btnPrevCapture = document.getElementById('btn-prev-capture');
  const btnNextCapture = document.getElementById('btn-next-capture');
  const captureStepIndicator = document.getElementById('capture-step-indicator');

  let currentCampaign = null;
  let currentScreenshots = [];
  let modalCurrentIndex = 0;
  let modalCurrentBizName = '';

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

    // 2차 방향성 가이드 설정 바인딩
    if (camp.guidelineConfig) {
      const firstSlotUrl = camp.quotaDatabase?.[0]?.slotUrl;
      inputSurveyUrl.value = camp.guidelineConfig.surveyUrl || firstSlotUrl || '';
      inputSurveyTopic.value = camp.guidelineConfig.topic || '';
      inputTextGuidelines.value = camp.guidelineConfig.textGuidelines || '';
      if (inputIterations) inputIterations.value = camp.guidelineConfig.iterations || 10;
      if (inputHeadless) inputHeadless.value = String(camp.guidelineConfig.headless !== false);

      sliderPos.value = camp.guidelineConfig.positiveRatio ?? 70;
      sliderNeu.value = camp.guidelineConfig.neutralRatio ?? 20;
      sliderNeg.value = camp.guidelineConfig.negativeRatio ?? 10;
      updateRatios();

      // 공란 정책 바인딩
      if (camp.guidelineConfig.policy) {
        const p = camp.guidelineConfig.policy;
        if (p.emptyNotes) policyEmptyNotes.value = p.emptyNotes;
        if (p.profitChange) policyProfitChange.value = p.profitChange;
        if (p.debtStatus) policyDebtStatus.value = p.debtStatus;
        if (p.deliveryStatus) policyDeliveryStatus.value = p.deliveryStatus;
      }
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

      // 1) 1번 쿼터 파일럿 검증 버튼 상태
      if (firstDone) {
        btnPilot.disabled = true;
        btnPilot.textContent = '1번 쿼터 파일럿 검증 완료';
        if (btnViewPilotCaptures) btnViewPilotCaptures.classList.remove('d-none');
      } else {
        btnPilot.disabled = false;
        btnPilot.textContent = '1번 쿼터 파일럿 검증 (Agree 대기)';
        if (btnViewPilotCaptures) btnViewPilotCaptures.classList.add('d-none');
      }

      // 2) 2번부터 배치 자동화 가동 버튼 상태
      if (allRemainingDone) {
        const allCompleted = quotaDb.every(b => b.quotaStatus === 'completed');
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.textContent = '배치 자동화 최종 마감 완료 (100%)';
        } else {
          // 모든 항목이 pilot_done 완료된 상태: 안전가드 체크박스 상태에 따라 초고속 직행 지원
          if (!checkSafetyGuard.checked) {
            btnBatch.disabled = false;
            btnBatch.textContent = '⚡ 안전가드 해제: 최종 제출 일괄 마감 (초고속)';
          } else {
            btnBatch.disabled = false;
            btnBatch.textContent = '배치 사전 검증 완료 (최종 제출 시 안전가드 체크 해제)';
          }
        }
      } else if (firstDone) {
        btnBatch.disabled = false;
        btnBatch.textContent = '2번부터 배치 자동화 가동';
      } else {
        btnBatch.disabled = true;
        btnBatch.textContent = '2번부터 배치 자동화 가동';
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
          <td colspan="10" class="empty-table-msg">
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
      let actionBtnHtml = `<button type="button" class="btn-row-action test" data-idx="${item.index}">테스트</button>`;

      if (st === 'pilot_done') {
        statusHtml = '<span class="badge-status pilot">검증완료</span>';
        actionBtnHtml = `<button type="button" class="btn-row-action view" data-idx="${item.index}">캡처보기</button>`;
      } else if (st === 'completed') {
        statusHtml = '<span class="badge-status success">제출완료</span>';
        actionBtnHtml = `<button type="button" class="btn-row-action view" data-idx="${item.index}">결과보기</button>`;
      } else if (st === 'running') {
        statusHtml = '<span class="badge-status running">실행 중</span>';
        actionBtnHtml = `<button type="button" class="btn-row-action" disabled>실행 중</button>`;
      } else if (st === 'error') {
        statusHtml = '<span class="badge-status error">오류</span>';
        actionBtnHtml = `<button type="button" class="btn-row-action test" data-idx="${item.index}">재시도</button>`;
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
          <td>${phoneVal}</td>
          <td>${escapeHtml(item.openDate || '-')}</td>
          <td><span class="badge-quota-type b2b">${escapeHtml(itemVal)}</span></td>
          <td>${escapeHtml(addrVal)}</td>
          <td class="text-center">${statusHtml}</td>
          <td class="text-center">${actionBtnHtml}</td>
        </tr>
      `;
    }).join('');

    // 개별 액션 버튼 이벤트 연결
    attachRowActionEvents();
  }

  // ------------------------------------------------------------------------
  // 3. 개별 행 액션 이벤트 (단독 테스트 & 15단계 캡처 보기)
  // ------------------------------------------------------------------------
  function attachRowActionEvents() {
    // [이 점포로 테스트 / 재시도]
    document.querySelectorAll('.btn-row-action.test').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        await runSingleQuotaTest(idx);
      });
    });

    // [캡처 보기]
    document.querySelectorAll('.btn-row-action.view').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        await openCaptureModal(idx);
      });
    });
  }

  // 특정 점포 단독 테스트 실행
  async function runSingleQuotaTest(idx) {
    const surveyUrl = inputSurveyUrl.value.trim();
    if (!surveyUrl) {
      alert('설문조사 URL을 먼저 입력해 주세요.');
      inputSurveyUrl.focus();
      return;
    }

    try {
      setRunningState(true);
      appendLog('info', `[개별 테스트] 쿼터 #${idx}번 사업자 1건 시뮬레이션을 시작합니다...`);

      const res = await fetch(`/api/campaigns/${campId}/run-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotaIndex: idx })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '테스트 실패');
      appendLog('success', data.message);
    } catch (err) {
      appendLog('error', `개별 테스트 실패: ${err.message}`);
      setRunningState(false);
    }
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
      clearGallery();
      appendLog('info', '🎯 [파일럿 검증 시작] 1번 쿼터 사업자로 Q1부터 Agree.asp까지 안전 완주를 진행합니다...');

      const res = await fetch(`/api/campaigns/${campId}/pilot-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyUrl,
          policy: getPolicyPayload(),
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

  // [버튼 2] 2번 쿼터부터 고속 배치 연속 가동
  btnBatch.addEventListener('click', async () => {
    let surveyUrl = inputSurveyUrl.value.trim();
    const hasSlotUrls = currentCampaign?.quotaDatabase?.some(b => b.slotUrl);
    if (!surveyUrl && !hasSlotUrls) {
      alert('설문조사 URL을 입력해 주세요.');
      inputSurveyUrl.focus();
      return;
    }

    const safetyGuard = checkSafetyGuard.checked;
    const confirmMsg = safetyGuard
      ? '2번 쿼터부터 연속 실행을 시작합니다. (최종 동의 단계에서 대기)'
      : '⚠️ 주의: 최종 제출 안전가드가 해제되어 있습니다!\n설문이 실제로 최종 제출 마감됩니다. 계속하시겠습니까?';

    if (!confirm(confirmMsg)) return;

    try {
      setRunningState(true);
      appendLog('info', `🚀 [배치 가동 시작] 2번 쿼터부터 고속 자동화 연속 실행을 시작합니다...`);

      const res = await fetch(`/api/campaigns/${campId}/batch-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyUrl,
          policy: getPolicyPayload(),
          startIndex: 2,
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
  });

  // 중지 버튼
  btnStop.addEventListener('click', async () => {
    await fetch('/api/survey/stop', { method: 'POST' });
    setRunningState(false);
    appendLog('warn', '작업 중지 요청이 전송되었습니다.');
  });

  if (btnViewPilotCaptures) {
    btnViewPilotCaptures.addEventListener('click', async () => {
      await openCaptureModal(1);
    });
  }

  // ------------------------------------------------------------------------
  // 6. 실시간 타임라인 칩 & 캡처 갤러리 탭 제어
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

  // 탭 전환 (콘솔 로그 vs 갤러리)
  tabBtnLogs.addEventListener('click', () => {
    tabBtnLogs.classList.add('active');
    tabBtnGallery.classList.remove('active');
    panelTabLogs.classList.remove('hidden');
    panelTabGallery.classList.add('hidden');
  });

  tabBtnGallery.addEventListener('click', () => {
    tabBtnGallery.classList.add('active');
    tabBtnLogs.classList.remove('active');
    panelTabGallery.classList.remove('hidden');
    panelTabLogs.classList.add('hidden');
  });

  function clearGallery() {
    galleryStrip.innerHTML = '<p class="empty-feed font-body-sm text-dim">설문 시뮬레이션이 진행되면 통과한 페이지의 스크린샷이 실시간으로 누적됩니다.</p>';
    galleryCount.textContent = '0';
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

  function appendGalleryItem(step, url, title) {
    const empty = galleryStrip.querySelector('.empty-feed');
    if (empty) empty.remove();

    const card = document.createElement('div');
    card.className = 'gallery-item-card';
    card.innerHTML = `
      <div class="gallery-thumb-wrap">
        <img src="${url}" alt="${step}" class="gallery-thumb-img" />
      </div>
      <div class="gallery-meta">
        <span class="gallery-step-title">[${step}] ${escapeHtml(title || '단계 완료')}</span>
        <span class="gallery-time">${getKstTime()} 완료</span>
      </div>
    `;
    card.addEventListener('click', () => openCaptureModal());
    galleryStrip.appendChild(card);

    const count = galleryStrip.querySelectorAll('.gallery-item-card').length;
    galleryCount.textContent = count;
  }

  // ------------------------------------------------------------------------
  // 7. 15단계 스크린샷 원본 모달
  // ------------------------------------------------------------------------
  async function openCaptureModal(quotaIndex = null) {
    try {
      const url = quotaIndex
        ? `/api/campaigns/${campId}/screenshots?quotaIndex=${quotaIndex}`
        : `/api/campaigns/${campId}/screenshots`;
      const res = await fetch(url);
      const data = await res.json();
      currentScreenshots = data.screenshots || [];
      modalCurrentBizName = data.bizName || '';

      if (currentScreenshots.length === 0) {
        const targetDesc = modalCurrentBizName ? `"${modalCurrentBizName}" 점포의 ` : '';
        alert(`${targetDesc}보관된 스크린샷이 없습니다. 먼저 시뮬레이션을 진행해 주세요.`);
        return;
      }

      modalCurrentIndex = 0;
      updateModalViewer();
      captureModalOverlay.classList.add('is-open');
    } catch (err) {
      alert('스크린샷을 불러오지 못했습니다: ' + err.message);
    }
  }

  function updateModalViewer() {
    if (currentScreenshots.length === 0) return;
    const item = currentScreenshots[modalCurrentIndex];
    captureViewerImg.src = item.url;
    const bizPrefix = modalCurrentBizName ? `[${modalCurrentBizName}] ` : '';
    captureModalTitle.textContent = `${bizPrefix}[${item.step}] ${item.title || '단계 스크린샷'}`;
    captureStepIndicator.textContent = `${modalCurrentIndex + 1} / ${currentScreenshots.length}`;
    btnPrevCapture.disabled = modalCurrentIndex === 0;
    btnNextCapture.disabled = modalCurrentIndex === currentScreenshots.length - 1;
  }

  btnPrevCapture.addEventListener('click', () => {
    if (modalCurrentIndex > 0) {
      modalCurrentIndex--;
      updateModalViewer();
    }
  });

  btnNextCapture.addEventListener('click', () => {
    if (modalCurrentIndex < currentScreenshots.length - 1) {
      modalCurrentIndex++;
      updateModalViewer();
    }
  });

  btnCloseCaptureModal.addEventListener('click', () => {
    captureModalOverlay.classList.remove('is-open');
  });

  captureModalOverlay.addEventListener('click', (e) => {
    if (e.target === captureModalOverlay) {
      captureModalOverlay.classList.remove('is-open');
    }
  });

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
          if (data.screenshotUrl) {
            appendGalleryItem(data.step, data.screenshotUrl, data.message);
          }
        }

        // 파일럿 완료 (화면 자동 새로고침 파이프라인)
        else if (data.type === 'PILOT_COMPLETED') {
          setTimelineStep('Agree');
          setRunningState(false);
          await loadCampaign();
          appendLog('success', `🎉 1번 쿼터 "${data.bizName || ''}" 파일럿 검증 완료! Agree.asp 안전 대기 중.`);
          appendLog('info', '🔄 3초 후 검증 결과 및 버튼 상태를 완벽 동기화하기 위해 화면을 자동으로 새로고침합니다...');
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        }

        // 배치 진행
        else if (data.type === 'BATCH_PROGRESS') {
          setTimelineStep(data.step);
          if (data.screenshotUrl) {
            appendGalleryItem(data.step, data.screenshotUrl, `[#${data.quotaIndex}] ${data.step}`);
          }
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

        // 배치 완료 (화면 자동 리프레시 파이프라인)
        else if (data.type === 'BATCH_COMPLETED') {
          setTimelineStep('Agree');
          setRunningState(false);
          await loadCampaign();
          appendLog('success', '🎉 모든 쿼터의 배치 자동화가 성공적으로 완료되었습니다!');
          appendLog('info', '🔄 3초 후 최신 실행 결과를 완벽 동기화하기 위해 화면을 자동으로 새로고침합니다...');
          setTimeout(() => {
            window.location.reload();
          }, 3000);
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

  function updateRatios() {
    let p = parseInt(sliderPos.value, 10);
    let n = parseInt(sliderNeu.value, 10);
    let g = parseInt(sliderNeg.value, 10);
    const total = p + n + g || 100;

    const normP = Math.round((p / total) * 100);
    const normN = Math.round((n / total) * 100);
    const normG = 100 - normP - normN;

    valPos.textContent = `${p}%`;
    valNeu.textContent = `${n}%`;
    valNeg.textContent = `${g}%`;

    barPos.style.width = `${normP}%`; barPos.textContent = `긍정 ${normP}%`;
    barNeu.style.width = `${normN}%`; barNeu.textContent = `중립 ${normN}%`;
    barNeg.style.width = `${normG}%`; barNeg.textContent = `부정 ${normG}%`;

    valRatioBadge.textContent = `가중합: ${total}% (정규화)`;
  }

  sliderPos.addEventListener('input', updateRatios);
  sliderNeu.addEventListener('input', updateRatios);
  sliderNeg.addEventListener('input', updateRatios);

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
    initEventSource();
  } catch (err) {
    console.error('초기 SSE 구독 실패:', err);
  }
}

// DOM 준비 상태에 따른 안전한 초기화 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSurveyDetailPage);
} else {
  initSurveyDetailPage();
}
