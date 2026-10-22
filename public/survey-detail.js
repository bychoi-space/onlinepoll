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

  // 3대 핵심 영역 퀵 점프 네비게이션
  const quickJumpPills = document.querySelectorAll('.quick-jump-pill');
  const linkGoToBlueprint = document.getElementById('link-go-to-blueprint');

  // STEP 3: 최하단 마스터 설문 블루프린트 (15단계 전수 복제)
  const sectionMasterBlueprint = document.getElementById('section-master-blueprint');
  const blueprintLockBanner = document.getElementById('blueprint-runtime-lock-banner');
  const badgeMasterStatus = document.getElementById('badge-master-status');
  const blueprintStageGrid = document.getElementById('blueprint-stage-grid');
  const btnSaveBaseline = document.getElementById('btn-save-baseline');
  const btnRunAllBatchBottom = document.getElementById('btn-run-all-batch-bottom');
  const btnStopAllBatchBottom = document.getElementById('btn-stop-all-batch-bottom');
  const btnPresetStandard = document.getElementById('btn-preset-standard');
  const btnPresetGrowth = document.getElementById('btn-preset-growth');
  const btnPresetTraditional = document.getElementById('btn-preset-traditional');
  const btnPresetRotation = document.getElementById('btn-preset-rotation');

  // 실시간 모니터링 & 프로그레스 바
  const progressSummaryLabel = document.getElementById('progress-summary-label');
  const progressPercentLabel = document.getElementById('progress-percent-label');
  const monitorProgressFill = document.getElementById('monitor-progress-fill');
  const currentActiveStoreLabel = document.getElementById('current-active-store-label');
  const currentStorePulse = document.getElementById('current-store-pulse');
  const floatingMonitorDrawer = document.getElementById('floating-monitor-drawer');
  const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
  const btnMinimizeMonitor = document.getElementById('btn-minimize-monitor');
  const btnQuickOpenMonitor = document.getElementById('btn-quick-open-monitor');
  const launcherMiniProgress = document.getElementById('launcher-mini-progress');

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
      const res = await fetch(`/api/campaigns/${campId}?_t=${Date.now()}`, { cache: 'no-store' });
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

    const isAssoc = (camp.surveyType === 'kstat_assoc');

    // 배지 상태
    statusBadge.className = `badge-status ${camp.status || 'ready'}`;
    statusBadge.textContent = camp.status === 'running' ? '실행 중' : (camp.status === 'completed' ? '완료' : '준비 완료');

    if (quotaBadge) {
      if (isAssoc) {
        quotaBadge.className = 'badge-quota-type assoc';
        quotaBadge.textContent = '상인회 대상 (25단계)';
      } else {
        quotaBadge.className = `badge-quota-type ${camp.quotaType === 'b2b' ? 'b2b' : 'b2c'}`;
        quotaBadge.textContent = camp.quotaType === 'b2b' ? '사업주 대상 (B2B)' : '개인 대상 (B2C)';
      }
    }

    // 조사원 연동 계정 바인딩
    const defaultSurveyor = isAssoc ? '가온박정순' : '가온김영옥';
    const inputKstatAccountId = document.getElementById('input-kstat-account-id');
    const inputKstatAccountPw = document.getElementById('input-kstat-account-pw');
    const badgeCurrentKstatAccount = document.getElementById('badge-current-kstat-account');
    if (inputKstatAccountId) inputKstatAccountId.value = camp.kstatLoginId || defaultSurveyor;
    if (inputKstatAccountPw) inputKstatAccountPw.value = camp.kstatLoginPw || '1234';
    if (badgeCurrentKstatAccount) {
      badgeCurrentKstatAccount.innerHTML = `<i class="fa-solid fa-user-check"></i> 연동 계정: <strong>${escapeHtml(camp.kstatLoginId || defaultSurveyor)}</strong>`;
    }

    // STEP 2 헤더 문구 동적 커스터마이징 (상인회 vs 점포조사)
    const step2TitleEl = document.querySelector('#section-master-blueprint .step-card-title');
    const step2DescEl = document.querySelector('#section-master-blueprint .font-caption.text-dim');
    if (isAssoc) {
      if (step2TitleEl) step2TitleEl.textContent = '상인회 실태조사 기준점 및 가이드라인 검토 (25단계 전수)';
      if (step2DescEl) step2DescEl.textContent = '케이스탯 상인회 실태조사 1~25단계 구조 및 기본 응답 규칙을 확인하고 조정합니다.';
    } else {
      if (step2TitleEl) step2TitleEl.textContent = '마스터 설문조사 & 조사원 평가 기준점 검토 (17단계 전수)';
      if (step2DescEl) step2DescEl.textContent = '케이스탯 본 설문 1~16단계 및 조사원 평가 17단계 구조가 전수 복제되었습니다.';
    }

    // 슬롯 바인딩 버튼 UI 튜닝
    const btnOpenBindSlots = document.getElementById('btn-open-bind-slots');
    if (btnOpenBindSlots) {
      if (isAssoc) {
        btnOpenBindSlots.innerHTML = '<i class="fa-solid fa-rotate"></i> Kstat 상인회 슬롯 재바인딩';
        btnOpenBindSlots.title = 'Kstat 상인회 관리자(2026070801)에서 슬롯을 다시 수집하여 동기화';
      } else {
        btnOpenBindSlots.innerHTML = '<i class="fa-solid fa-bolt"></i> Kstat 슬롯 자동 바인딩';
        btnOpenBindSlots.title = 'Kstat 관리자 list.php에서 슬롯을 1초 만에 자동 수집 및 바인딩';
      }
    }

    // 결측치 외부 보강 버튼: 점포조사 전용
    if (btnEnrichCampaign) {
      btnEnrichCampaign.style.display = isAssoc ? 'none' : 'inline-flex';
    }

    // 쿼터 DB 테이블 렌더링
    renderQuotaTable(camp.quotaDatabase || []);

    // 설문 URL 및 기본 정보 바인딩
    if (camp.guidelineConfig) {
      const firstSlotUrl = camp.quotaDatabase?.[0]?.slotUrl;
      if (inputSurveyUrl) inputSurveyUrl.value = camp.guidelineConfig.surveyUrl || firstSlotUrl || '';
      if (inputSurveyTopic) inputSurveyTopic.value = camp.guidelineConfig.topic || '';
      if (selectSurveyEngine) selectSurveyEngine.value = isAssoc ? 'kstat_assoc' : (camp.guidelineConfig.engine || 'kstat_tapi');
    }

    // 버튼 상태 머신 갱신 (1번 검증 완료 및 배치 완료 제어)
    updateButtonStates();
    if (!isAssoc) updateGroupStatsUI();
  }

  // -------------------------------------------------------------
  // 실시간 배치 프로그레스 바 제어
  // -------------------------------------------------------------
  function updateBatchProgressBar(completedCount, totalCount, activeStoreName = '') {
    if (!totalCount) totalCount = currentCampaign?.quotaDatabase?.length || 24;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    if (progressSummaryLabel) progressSummaryLabel.textContent = `배치 진행률 (${completedCount} / ${totalCount} 완료)`;
    if (progressPercentLabel) progressPercentLabel.textContent = `${pct}%`;
    if (launcherMiniProgress) launcherMiniProgress.textContent = `${pct}%`;
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
      if (btnRunAllBatchBottom) btnRunAllBatchBottom.disabled = true;
      btnStop.disabled = false;
      if (btnStopAllBatchBottom) btnStopAllBatchBottom.disabled = false;
      if (step2ConfigCard) step2ConfigCard.classList.add('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = true;
      if (currentStorePulse) currentStorePulse.classList.remove('d-none');

      // 마스터 기준점 런타임 락 (보호 모드)
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.add('section-locked');
      if (blueprintLockBanner) blueprintLockBanner.classList.remove('hidden');
      if (btnSaveBaseline) btnSaveBaseline.disabled = true;
      if (btnPresetStandard) btnPresetStandard.disabled = true;
      if (btnPresetGrowth) btnPresetGrowth.disabled = true;
      if (btnPresetTraditional) btnPresetTraditional.disabled = true;
      if (btnPresetRotation) btnPresetRotation.disabled = true;
    } else {
      btnStop.disabled = true;
      if (btnStopAllBatchBottom) btnStopAllBatchBottom.disabled = true;
      if (step2ConfigCard) step2ConfigCard.classList.remove('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = false;
      if (currentStorePulse) currentStorePulse.classList.add('d-none');

      // 마스터 기준점 런타임 락 해제
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.remove('section-locked');
      if (blueprintLockBanner) blueprintLockBanner.classList.add('hidden');
      if (btnSaveBaseline) btnSaveBaseline.disabled = false;
      if (btnPresetStandard) btnPresetStandard.disabled = false;
      if (btnPresetGrowth) btnPresetGrowth.disabled = false;
      if (btnPresetTraditional) btnPresetTraditional.disabled = false;
      if (btnPresetRotation) btnPresetRotation.disabled = false;

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
        if (btnRunAllBatchBottom) {
          btnRunAllBatchBottom.disabled = true;
          btnRunAllBatchBottom.textContent = '전체 배치 마감 완료 (100%)';
        }
      } else {
        btnBatch.disabled = false;
        if (btnRunAllBatchBottom) {
          btnRunAllBatchBottom.disabled = false;
          btnRunAllBatchBottom.innerHTML = '<i class="fa-solid fa-rocket"></i> 이 기준점으로 전체 배치 가동';
        }
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
    let mappedSlots = 0;

    db.forEach(item => {
      const st = item.quotaStatus || 'ready';
      if (st === 'pilot_done') pilot++;
      else if (st === 'completed') completed++;
      else ready++;

      if (item.slotUrl || item.surveyUrl) mappedSlots++;
    });

    kpiTotal.textContent = total;
    kpiReady.textContent = ready;
    kpiPilot.textContent = pilot;
    kpiCompleted.textContent = completed;
    const rate = total > 0 ? Math.round(((pilot + completed) / total) * 100) : 0;
    kpiRate.textContent = `${rate}%`;

    const kpiSlotCount = document.getElementById('kpi-slot-count');
    if (kpiSlotCount) {
      kpiSlotCount.textContent = `${mappedSlots}/${total}`;
      if (total > 0 && mappedSlots === total) {
        kpiSlotCount.className = 'kpi-val text-success font-bold';
      } else {
        kpiSlotCount.className = 'kpi-val text-warning font-bold';
      }
    }

    const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');

    // [점진적 워크플로우 공개 (Progressive Disclosure)]
    // 쿼터가 0건일 때는 STEP 2(마스터 기준점) 및 STEP 3(실행 파이프라인)을 완전히 숨김 처리
    const sectionMasterBlueprint = document.getElementById('section-master-blueprint');
    const sectionExecution = document.getElementById('section-execution');
    const jumpPills = document.querySelectorAll('.quick-jump-pill');

    if (total === 0) {
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.add('hidden');
      if (sectionExecution) sectionExecution.classList.add('hidden');
      // 상단 퀵 점프 바의 STEP 2, 3 비활성화
      if (jumpPills && jumpPills.length >= 3) {
        jumpPills[1].style.opacity = '0.35';
        jumpPills[1].style.pointerEvents = 'none';
        jumpPills[2].style.opacity = '0.35';
        jumpPills[2].style.pointerEvents = 'none';
      }
    } else {
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.remove('hidden');
      if (sectionExecution) sectionExecution.classList.remove('hidden');
      if (jumpPills && jumpPills.length >= 3) {
        jumpPills[1].style.opacity = '1';
        jumpPills[1].style.pointerEvents = 'auto';
        jumpPills[2].style.opacity = '1';
        jumpPills[2].style.pointerEvents = 'auto';
      }
    }

    // 쿼터 장착 여부에 따른 동적 툴바 전환 (불필요한 버튼 숨김)
    const quotaUnmountedGroup = document.getElementById('quota-unmounted-group');
    const quotaMountedGroup = document.getElementById('quota-mounted-group');
    const assocBanner = document.getElementById('assoc-quota-init-banner');
    const detailsMarketbz = document.getElementById('details-marketbz-direct') || document.querySelector('.marketbz-direct-details');
    const btnEnrichCampaign = document.getElementById('btn-enrich-campaign-quota');
    const btnToggleQuotaReplace = document.getElementById('btn-toggle-quota-replace');
    const assocSurveyorBadgeName = document.getElementById('assoc-surveyor-badge-name');
    const assocBtnSurveyorName = document.getElementById('assoc-btn-surveyor-name');
    const kstatAccountNameBadge = document.getElementById('kstat-account-name-badge');
    const execSlotCountLabel = document.getElementById('exec-slot-count-label');
    const execSurveyorLabel = document.getElementById('exec-surveyor-label');

    const currentSurveyor = currentCampaign?.kstatLoginId || (isAssoc ? '가온박정순' : '가온김영옥');
    if (assocSurveyorBadgeName) assocSurveyorBadgeName.textContent = currentSurveyor;
    if (assocBtnSurveyorName) assocBtnSurveyorName.textContent = currentSurveyor;
    if (kstatAccountNameBadge) kstatAccountNameBadge.textContent = currentSurveyor;
    if (execSurveyorLabel) execSurveyorLabel.textContent = currentSurveyor;
    if (execSlotCountLabel) {
      const slotPct = total > 0 ? Math.round((mappedSlots / total) * 100) : 0;
      execSlotCountLabel.textContent = `${mappedSlots}건 / ${total}건 (${slotPct}%)`;
    }

    if (isAssoc) {
      // 상인회 조사 캠페인 전용 툴바 제어
      if (detailsMarketbz) detailsMarketbz.classList.add('hidden');
      if (btnEnrichCampaign) btnEnrichCampaign.classList.add('hidden');
      if (btnToggleQuotaReplace) btnToggleQuotaReplace.classList.add('hidden');

      if (total === 0) {
        // 쿼터 0건: 상인회 전용 슬롯 바인딩 히어로 카드 노출!
        if (assocBanner) assocBanner.classList.remove('hidden');
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.add('hidden');
      } else {
        // 쿼터 장착 완료: 히어로 카드 숨기고, 상단 장착 툴바 노출
        if (assocBanner) assocBanner.classList.add('hidden');
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.remove('hidden');
      }
    } else {
      // 점포조사 (B2B/B2C) 전용 툴바 제어
      if (assocBanner) assocBanner.classList.add('hidden');
      if (total > 0) {
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.remove('hidden');
        if (detailsMarketbz) detailsMarketbz.style.display = 'none';
        if (btnEnrichCampaign) btnEnrichCampaign.classList.remove('hidden');
        if (btnToggleQuotaReplace) btnToggleQuotaReplace.classList.remove('hidden');
      } else {
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.remove('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.add('hidden');
        if (detailsMarketbz) detailsMarketbz.style.display = 'block';
      }
    }

    // 테이블 헤더 동적 교체
    const quotaTableHead = document.getElementById('quota-table-head');
    if (quotaTableHead) {
      if (isAssoc) {
        quotaTableHead.innerHTML = `
          <tr>
            <th class="th-no">번호</th>
            <th>시장코드</th>
            <th>시장명</th>
            <th>시장유형</th>
            <th>상인회장</th>
            <th>연락처</th>
            <th>소재지 주소</th>
            <th>Kstat 슬롯 URL</th>
            <th class="th-status">진행 상태</th>
          </tr>
        `;
      } else {
        quotaTableHead.innerHTML = `
          <tr>
            <th class="th-no">번호</th>
            <th class="th-company">상호</th>
            <th class="th-ind">업종</th>
            <th class="th-biznum">사업자번호</th>
            <th class="th-ceo">대표자이름</th>
            <th class="th-gender">성별</th>
            <th class="th-age">나이</th>
            <th class="th-phone">연락처</th>
            <th class="th-opendate">개업연월</th>
            <th class="th-address">주소</th>
            <th class="th-items">취급품목</th>
            <th class="th-main-products">주요품목</th>
            <th class="th-status">진행 상태</th>
          </tr>
        `;
      }
    }

    if (total === 0) {
      quotaTableBody.innerHTML = `
        <tr>
          <td colspan="${isAssoc ? 9 : 13}" class="empty-table-msg">
            ${isAssoc 
              ? '아직 등록된 상인회 슬롯 DB가 없습니다.<br>상단의 <strong>[Kstat 상인회 슬롯 자동 바인딩]</strong> 버튼을 클릭하여 슬롯을 장착해 주세요.' 
              : '아직 구축된 사업자 DB가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.'}
          </td>
        </tr>
      `;
      return;
    }

    // [상인회 전용 9개 컬럼 테이블 렌더링]
    if (isAssoc) {
      quotaTableBody.innerHTML = db.map((item, idx) => {
        const seq = item.index || item.seq || (idx + 1);
        const st = item.quotaStatus || 'ready';
        let statusHtml = '<span class="badge-status ready">대기</span>';

        if (st === 'pilot_done') {
          statusHtml = '<span class="badge-status pilot">검증완료</span>';
        } else if (st === 'completed') {
          statusHtml = '<span class="badge-status success">조사표 완료</span>';
        } else if (st === 'running') {
          statusHtml = '<span class="badge-status running">실행 중</span>';
        } else if (st === 'error') {
          statusHtml = '<span class="badge-status error">오류</span>';
        }

        let slotTag = '';
        if (item.slotUrl) {
          slotTag = `<div class="quota-slot-badge font-mono" title="${escapeHtml(item.slotUrl)}"><i class="fa-solid fa-link"></i> 슬롯 #${seq} (ranId: ${item.ranId || '-'})</div>`;
        } else {
          slotTag = `<div class="quota-slot-badge unmapped font-mono"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 미매핑</div>`;
        }

        const mName = item.marketName || item.companyName || '-';
        const mCode = item.marketCode || '-';
        const mType = item.marketType || '골목형상점가';
        const lName = item.leaderName || item.ceoName || '-';
        const phone = item.phone || item.assocPhone || item.leaderPhone || '-';
        const addr = item.address || '-';
        const addrShort = addr.length > 25 ? addr.slice(0, 25) + '...' : addr;

        return `
          <tr data-row-idx="${seq}">
            <td class="text-center font-mono font-bold">${seq}</td>
            <td class="text-center font-mono"><code>${escapeHtml(mCode)}</code></td>
            <td><strong>${escapeHtml(mName)}</strong></td>
            <td><span class="quota-ind-badge">${escapeHtml(mType)}</span></td>
            <td><strong>${escapeHtml(lName)}</strong></td>
            <td class="font-mono">${escapeHtml(phone)}</td>
            <td title="${escapeHtml(addr)}">${escapeHtml(addrShort)}</td>
            <td>${slotTag}</td>
            <td class="text-center">${statusHtml}</td>
          </tr>
        `;
      }).join('');
      return;
    }

    quotaTableBody.innerHTML = db.map((item, idx) => {
      const seq = item.index || item.seq || (idx + 1);
      const st = item.quotaStatus || 'ready';
      let statusHtml = '<span class="badge-status ready">대기</span>';

      if (st === 'pilot_done') {
        statusHtml = '<span class="badge-status pilot">검증완료</span>';
      } else if (st === 'completed') {
        statusHtml = '<span class="badge-status success">조사표 완료</span>';
      } else if (st === 'running') {
        statusHtml = '<span class="badge-status running">실행 중</span>';
      } else if (st === 'error') {
        statusHtml = '<span class="badge-status error">오류</span>';
      }

      // 조사원 평가 상태 배지
      if (item.evalStatus === 'completed' || item.evalCompleted) {
        statusHtml += `<div class="eval-status-badge badge-eval-done"><i class="fa-solid fa-clipboard-check"></i> 평가 완료</div>`;
      } else if (st === 'completed' || st === 'pilot_done') {
        statusHtml += `<div class="eval-status-badge badge-eval-wait"><i class="fa-solid fa-clock"></i> 평가 대기</div>`;
      }

      const indLabel = getIndustryBadgeText(item.industry || item.handledItems);
      const hasCeo = item.ceoName && String(item.ceoName).trim() !== '' && item.ceoName !== 'null';
      const hasPhone = item.phone && String(item.phone).trim() !== '' && item.phone !== 'null';
      const hasMainProducts = item.mainProducts && String(item.mainProducts).trim() !== '' && item.mainProducts !== 'null';
      const addrVal = item.address ? (item.address.length > 28 ? item.address.slice(0, 28) + '...' : item.address) : '-';

      let slotTag = '';
      if (item.slotUrl) {
        const slotLabel = item.slotIndex ? `슬롯 #${item.slotIndex} ${escapeHtml(item.slotExtra || '')}` : '슬롯 매핑됨';
        slotTag = `<div class="quota-slot-badge font-mono" title="${escapeHtml(item.slotUrl)}"><i class="fa-solid fa-link"></i> ${slotLabel}</div>`;
      } else {
        slotTag = `<div class="quota-slot-badge unmapped font-mono cursor-pointer" onclick="window.openSlotModal()" title="케이스탯 슬롯 미매핑 (클릭하여 1:1 매핑)"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 미매핑</div>`;
      }

      return `
        <tr data-row-idx="${seq}">
          <td class="text-center font-mono font-bold">${seq}</td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="companyName" title="클릭하여 상호 수정">
            <strong>${escapeHtml(item.companyName || '-')}</strong>
            ${slotTag}
          </td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="industry" title="클릭하여 업종 수정">
            <span class="quota-ind-badge">${escapeHtml(indLabel)}</span>
          </td>
          <td class="editable-quota-cell font-mono" data-idx="${seq}" data-field="bizNumber" title="클릭하여 사업자번호 수정">
            <code>${escapeHtml(item.bizNumber || '-')}</code>
          </td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="ceoName" title="클릭하여 대표자이름 수정">
            ${hasCeo ? `<span class="ceo-name-text">${escapeHtml(item.ceoName)}</span>${item.isCeoEnriched ? ' <span class="badge-enriched">보강</span>' : ''}` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center col-gender editable-quota-cell" data-idx="${seq}" data-field="ceoGender" title="클릭하여 성별 수정">
            ${item.ceoGender ? `<span class="badge-gender ${item.ceoGender === '남' ? 'male' : 'female'}">${escapeHtml(item.ceoGender)}</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center col-age editable-quota-cell" data-idx="${seq}" data-field="ceoAge" title="클릭하여 나이 수정">
            ${item.ceoAge ? `<span class="badge-age font-mono">${escapeHtml(String(item.ceoAge).replace(/세$/, ''))}세</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="editable-quota-cell font-mono" data-idx="${seq}" data-field="phone" title="클릭하여 연락처 수정">
            ${hasPhone ? `${escapeHtml(item.phone)}${item.isPhoneEnriched ? ' <span class="badge-enriched">보강</span>' : ''}` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="editable-quota-cell font-mono" data-idx="${seq}" data-field="openDate" title="클릭하여 개업연월 수정">
            ${escapeHtml(item.openDate || '-')}
          </td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="address" title="${escapeHtml(item.address || '클릭하여 주소 수정')}">
            ${escapeHtml(addrVal)}
          </td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="handledItems" title="클릭하여 취급품목 수정">
            <span class="badge-quota-type b2b">${escapeHtml(item.handledItems || '-')}</span>
          </td>
          <td class="editable-quota-cell" data-idx="${seq}" data-field="mainProducts" title="클릭하여 주요품목 입력/수정">
            ${hasMainProducts ? `<span class="badge-main-product">${escapeHtml(item.mainProducts)}</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center">${statusHtml}</td>
        </tr>
      `;
    }).join('');
  }

  function extractStandardIndustry(raw) {
    if (!raw) return '기타소매';
    const s = String(raw);
    if (s.includes('농산물')) return '농산물';
    if (s.includes('축산물')) return '축산물';
    if (s.includes('수산물')) return '수산물';
    if (s.includes('가공식품')) return '가공식품';
    if (s.includes('의류')) return '의류신발';
    if (s.includes('가정용품')) return '가정용품';
    if (s.includes('음식점')) return '음식점업';
    if (s.includes('기타소매')) return '기타소매';
    if (s.includes('근린상권')) return '근린상권';
    return s.split(' ')[0] || '기타소매';
  }

  function getIndustryBadgeText(raw) {
    if (!raw) return '기타';
    const s = String(raw);
    if (s.includes('농산물')) return '🌾 농산물';
    if (s.includes('축산물')) return '🥩 축산물';
    if (s.includes('수산물')) return '🐟 수산물';
    if (s.includes('가공식품')) return '🍱 가공식품';
    if (s.includes('의류')) return '👗 의류신발';
    if (s.includes('가정용품')) return '🏠 가정용품';
    if (s.includes('음식점')) return '🍽️ 음식점업';
    if (s.includes('기타소매')) return '🛒 기타소매';
    if (s.includes('근린상권')) return '💈 근린상권';
    return '🏷️ ' + s.split(' ')[0];
  }

  // ------------------------------------------------------------------------
  // 3-1. 쿼터 테이블 인라인 편집 (대표자이름, 성별, 나이, 주요품목 등 전체 지원) 및 실시간 동기화
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
        if (item.ceoGender !== newVal) {
          item.ceoGender = newVal;
          renderQuotaTable(currentCampaign.quotaDatabase);
          await autoSaveCampaignQuotas();
        } else {
          renderQuotaTable(currentCampaign.quotaDatabase);
        }
      };

      select.addEventListener('change', finishEdit);
      select.addEventListener('blur', finishEdit);
    } else if (field === 'industry') {
      const currentVal = extractStandardIndustry(item.industry || item.handledItems);
      const indOptions = ['농산물', '축산물', '수산물', '가공식품', '의류신발', '가정용품', '음식점업', '기타소매', '근린상권'];
      cell.innerHTML = `
        <select class="inline-cell-select-md">
          ${indOptions.map(opt => `<option value="${opt}" ${currentVal === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>
      `;
      const select = cell.querySelector('select');
      select.focus();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = select.value.trim() || null;
        if (item.industry !== newVal) {
          item.industry = newVal;
          renderQuotaTable(currentCampaign.quotaDatabase);
          await autoSaveCampaignQuotas();
        } else {
          renderQuotaTable(currentCampaign.quotaDatabase);
        }
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
        if (item.ceoAge !== newVal) {
          item.ceoAge = newVal;
          renderQuotaTable(currentCampaign.quotaDatabase);
          await autoSaveCampaignQuotas();
        } else {
          renderQuotaTable(currentCampaign.quotaDatabase);
        }
      };

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finishEdit();
        else if (ke.key === 'Escape') { finished = true; renderQuotaTable(currentCampaign.quotaDatabase); }
      });
      input.addEventListener('blur', finishEdit);
    } else {
      const currentVal = (item[field] && item[field] !== 'null') ? String(item[field]) : '';
      const placeholders = {
        ceoName: '대표자이름',
        mainProducts: '주요품목 입력',
        handledItems: '취급품목 입력',
        phone: '연락처 입력',
        openDate: 'YYYY.MM.DD',
        address: '주소 입력',
        companyName: '상호 입력',
        bizNumber: '사업자번호'
      };
      cell.innerHTML = `
        <input type="text" class="inline-cell-input-md" value="${escapeHtml(currentVal)}" placeholder="${placeholders[field] || '입력'}" />
      `;
      const input = cell.querySelector('input');
      input.focus();
      input.select();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = input.value.trim() || null;
        if (item[field] !== newVal) {
          item[field] = newVal;
          renderQuotaTable(currentCampaign.quotaDatabase);
          await autoSaveCampaignQuotas();
        } else {
          renderQuotaTable(currentCampaign.quotaDatabase);
        }
      };

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finishEdit();
        else if (ke.key === 'Escape') { finished = true; renderQuotaTable(currentCampaign.quotaDatabase); }
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
  // 5. STEP 3: 15단계 마스터 설문 블루프린트 & 기준점 에디터 (3개 업종 그룹별 분리 지원)
  // ------------------------------------------------------------------------
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
    employeeRegularMax: 2,
    employeeTemp: 0,
    employeeTempMin: 0,
    employeeTempMax: 1,
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
    alert(`[${sourceMeta.name}]의 기준점 설정이 1번, 2번, 3번 그룹 전체에 일괄 복사되었습니다.\n우측의 [마스터 기준점 저장]을 눌러 서버에 최종 반영해 주세요.`);
  }

  let assocPolicyState = null;

  function renderAssocBlueprint(data) {
    assocPolicyState = data.policy || data.blueprint?.defaultPolicy || {};

    // 1. 점포조사 전용 3대 그룹 네비게이션 및 프리셋 툴바 숨김
    const groupNav = document.querySelector('.blueprint-group-nav-container');
    if (groupNav) groupNav.style.display = 'none';

    const presetGroup = document.querySelector('.blueprint-preset-group');
    if (presetGroup) presetGroup.style.display = 'none';

    const tplPicker = document.querySelector('.blueprint-template-picker');
    if (tplPicker) tplPicker.style.display = 'none';

    // 2. 상단 헤더 문구 갱신
    const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
    if (titleEl) titleEl.textContent = '상인회 실태조사 기준점 및 정책 가이드라인 (25단계)';

    const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'P1~P20 단계는 전년도(2024년) 실태조사 데이터와 100% 동일하게 자동 미러링되며, 2026 신규 정책 문항(F5~G4) 가이드라인을 설정합니다.';

    if (badgeMasterStatus) {
      badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 상인회 25단계 블루프린트 활성 (전년도 미러링 + 정책 가이드)';
      badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    }

    if (!blueprintStageGrid) return;

    // 3. 상인회 전용 카드 그리드 렌더링
    blueprintStageGrid.innerHTML = `
      <!-- 카드 1: 전년도 데이터 미러링 보장 안내 카드 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">A3 ~ F4</span>
            <h3 class="blueprint-stage-title">전년도(2024년) 실태조사 1:1 자동 미러링 (P1~P20)</h3>
          </div>
          <div class="blueprint-card-badge-group">
            <span class="badge-status success"><i class="fa-solid fa-lock"></i> 100% 전년도 일치 보장</span>
          </div>
        </div>
        <div class="blueprint-stage-desc">
          케이스탯 상인회 설문의 20개 핵심 영역(일반현황 A3~A10, 조직운영 B1~B7, 시설환경 C1~C4, 마케팅사업 D1~D5, 재정인력 E1~E3, 상인조직 F1~F4)은 원본 DOM에 로드된 2024년 전년도 확정 데이터를 2025년 기준에 무결점으로 1:1 자동 복제 주입합니다.
        </div>
        <div class="blueprint-field-list">
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> A5 대표품목 결측치 자동 방어</span>
            <span class="badge-status ready">종합소매 / 주력업종 Fallback 주입</span>
          </div>
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> A6 점포현황 숫자 검증 &amp; calculateA6 자동 계산</span>
            <span class="badge-status ready">공란 0 채움 &amp; 합계 정규화</span>
          </div>
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> A8 평일/휴일 영업시간대 기본 선택</span>
            <span class="badge-status ready">09:00 ~ 21:00 표준 주입</span>
          </div>
        </div>
      </section>

      <!-- 카드 2: F5 빈점포 원인 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">F5 (P21)</span>
            <h3 class="blueprint-stage-title">빈 점포 발생 핵심 원인</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장 내 빈 점포(공실)가 발생하는 가장 주된 요인을 설정합니다.</div>
        <div class="p-14">
          <select id="select-assoc-F5" class="figma-select w-full">
            <option value="1" ${assocPolicyState.F5_emptyStoreReason === '1' ? 'selected' : ''}>1. 온라인 소비 확산 및 비대면 거래 증가</option>
            <option value="2" ${assocPolicyState.F5_emptyStoreReason === '2' ? 'selected' : ''}>2. 인근 대형마트, 복합쇼핑몰, 인근 상권과의 경쟁 밀림</option>
            <option value="3" ${assocPolicyState.F5_emptyStoreReason === '3' ? 'selected' : ''}>3. 과도하게 높은 임대료 및 권리금 조건</option>
            <option value="4" ${assocPolicyState.F5_emptyStoreReason === '4' ? 'selected' : ''}>4. 상인의 고령화 및 가업 승계(후계자) 부족</option>
            <option value="5" ${assocPolicyState.F5_emptyStoreReason === '5' ? 'selected' : ''}>5. 기타</option>
          </select>
        </div>
      </section>

      <!-- 카드 3: F6 빈점포 지원 정책 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">F6 (P21)</span>
            <h3 class="blueprint-stage-title">시급한 빈 점포 정부 지원 정책</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">빈 점포 해결을 위해 정부 및 지자체에서 가장 시급히 지원해야 할 정책을 설정합니다.</div>
        <div class="p-14">
          <select id="select-assoc-F6" class="figma-select w-full">
            <option value="1" ${assocPolicyState.F6_emptyStorePolicy === '1' ? 'selected' : ''}>1. 빈 점포를 공공 임대·매입하여 상인회에 재임대하는 제도</option>
            <option value="2" ${assocPolicyState.F6_emptyStorePolicy === '2' ? 'selected' : ''}>2. 빈 점포를 활용하는 상인에 대한 금융 지원(융자, 보조금) 확대</option>
            <option value="3" ${assocPolicyState.F6_emptyStorePolicy === '3' ? 'selected' : ''}>3. 빈 점포 공간 전환 컨설팅 및 시행 지원</option>
            <option value="4" ${assocPolicyState.F6_emptyStorePolicy === '4' ? 'selected' : ''}>4. 공실 상가 소유주에게 임대료 인하를 유도하는 세제 혜택 등 인센티브 부여</option>
            <option value="5" ${assocPolicyState.F6_emptyStorePolicy === '5' ? 'selected' : ''}>5. 빈 점포 파악 및 관리를 위한 통합 플랫폼 구축</option>
            <option value="6" ${assocPolicyState.F6_emptyStorePolicy === '6' ? 'selected' : ''}>6. 기타</option>
          </select>
        </div>
      </section>

      <!-- 카드 4: G1 바가지요금 원인 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G1 (P22)</span>
            <h3 class="blueprint-stage-title">바가지요금 문제 발생 주요 원인</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">전통시장 내 바가지요금 논란이 발생하는 근본적인 원인을 설정합니다.</div>
        <div class="p-14">
          <select id="select-assoc-G1" class="figma-select w-full">
            <option value="1" ${assocPolicyState.G1_overchargeReason === '1' ? 'selected' : ''}>1. 외부 관광객 대상 일시적 가격 인상 관행</option>
            <option value="2" ${assocPolicyState.G1_overchargeReason === '2' ? 'selected' : ''}>2. 상인 간 가격 자율경쟁 및 통제 미흡</option>
            <option value="3" ${assocPolicyState.G1_overchargeReason === '3' ? 'selected' : ''}>3. 원재료 가격 상승에 따른 임의 가격 인상</option>
            <option value="4" ${assocPolicyState.G1_overchargeReason === '4' ? 'selected' : ''}>4. 일부 상인의 과도한 이윤추구 형태</option>
            <option value="5" ${assocPolicyState.G1_overchargeReason === '5' ? 'selected' : ''}>5. 시장 차원의 관리·감독 부족</option>
            <option value="6" ${assocPolicyState.G1_overchargeReason === '6' ? 'selected' : ''}>6. 기타</option>
          </select>
        </div>
      </section>

      <!-- 카드 5: G2 바가지요금 대응방안 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G2 (P22)</span>
            <h3 class="blueprint-stage-title">바가지요금 개선 대응 방안</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">바가지요금 근절과 시장 신뢰 회복을 위한 최선의 방안을 설정합니다.</div>
        <div class="p-14">
          <select id="select-assoc-G2" class="figma-select w-full">
            <option value="1" ${assocPolicyState.G2_overchargeSolution === '1' ? 'selected' : ''}>1. 시장 차원의 자율관리 (상인회 중심 가격 가이드라인 운영)</option>
            <option value="2" ${assocPolicyState.G2_overchargeSolution === '2' ? 'selected' : ''}>2. 지자체·정부의 점검 및 단속 강화</option>
            <option value="3" ${assocPolicyState.G2_overchargeSolution === '3' ? 'selected' : ''}>3. 바가지요금 신고·공개 시스템 활성화</option>
            <option value="4" ${assocPolicyState.G2_overchargeSolution === '4' ? 'selected' : ''}>4. 친절·가격교육 등 상인 대상 인식개선 교육</option>
            <option value="5" ${assocPolicyState.G2_overchargeSolution === '5' ? 'selected' : ''}>5. 우수상점 인증제 등 인센티브 제공</option>
            <option value="6" ${assocPolicyState.G2_overchargeSolution === '6' ? 'selected' : ''}>6. 기타</option>
          </select>
        </div>
      </section>

      <!-- 카드 6: G3 문화/체험/명물점포 육성 정책 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G3 (P23)</span>
            <h3 class="blueprint-stage-title">문화·체험 프로그램 및 명물점포 보유 현황</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">상설 프로그램, 명물점포, 야간조명, 관광연계, 커뮤니티 공간 보유 여부를 설정합니다.</div>
        <div class="p-14 grid-2col gap-10">
          <div class="form-group mb-8">
            <label class="figma-label">상설 문화/체험 프로그램</label>
            <select id="select-assoc-G3-prog" class="figma-select">
              <option value="1" ${assocPolicyState.G3_program === '1' ? 'selected' : ''}>1. 있다</option>
              <option value="2" ${assocPolicyState.G3_program === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">시장 내 명물/대표점포</label>
            <select id="select-assoc-G3-famous" class="figma-select">
              <option value="1" ${assocPolicyState.G3_famousStore === '1' ? 'selected' : ''}>1. 있다</option>
              <option value="2" ${assocPolicyState.G3_famousStore === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">야간조명·야시장 인프라</label>
            <select id="select-assoc-G3-night" class="figma-select">
              <option value="1" ${assocPolicyState.G3_nightLight === '1' ? 'selected' : ''}>1. 있다</option>
              <option value="2" ${assocPolicyState.G3_nightLight === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">인근 관광자원 연계 상품</label>
            <select id="select-assoc-G3-tour" class="figma-select">
              <option value="1" ${assocPolicyState.G3_tourLink === '1' ? 'selected' : ''}>1. 있다</option>
              <option value="2" ${assocPolicyState.G3_tourLink === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 7: G4 기후재해 대비 현황 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G4 (P23)</span>
            <h3 class="blueprint-stage-title">기후재해(폭염·한파·수해) 대비 시설</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">폭염/한파/수해 대비 점포별 냉난방 및 방재 시설 보유 현황을 설정합니다.</div>
        <div class="p-14">
          <div class="checkbox-grid">
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-cooling-aircon" ${assocPolicyState.G4_cooling_aircon ? 'checked' : ''} />
              <span>에어컨 / 냉방기기</span>
            </label>
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-cooling-fan" ${assocPolicyState.G4_cooling_fan ? 'checked' : ''} />
              <span>선풍기 / 송풍기</span>
            </label>
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-cooling-arcade" ${assocPolicyState.G4_cooling_arcade ? 'checked' : ''} />
              <span>아케이드 쿨링포그</span>
            </label>
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-heating-warmair" ${assocPolicyState.G4_heating_warmAir ? 'checked' : ''} />
              <span>온풍기 / 난방기기</span>
            </label>
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-flood-pump" ${assocPolicyState.G4_flood_pump ? 'checked' : ''} />
              <span>배수펌프 설비</span>
            </label>
            <label class="custom-cb-label">
              <input type="checkbox" id="cb-assoc-flood-wall" ${assocPolicyState.G4_flood_wall ? 'checked' : ''} />
              <span>차수판 / 물막이</span>
            </label>
          </div>
        </div>
      </section>
    `;

    // 4. 상인회 정책 요소 이벤트 리스너 바인딩
    const bindAssocField = (elId, key, isCheck = false) => {
      const el = document.getElementById(elId);
      if (el) {
        el.addEventListener('change', () => {
          assocPolicyState[key] = isCheck ? el.checked : el.value;
          markUnsaved();
        });
      }
    };

    bindAssocField('select-assoc-F5', 'F5_emptyStoreReason');
    bindAssocField('select-assoc-F6', 'F6_emptyStorePolicy');
    bindAssocField('select-assoc-G1', 'G1_overchargeReason');
    bindAssocField('select-assoc-G2', 'G2_overchargeSolution');
    bindAssocField('select-assoc-G3-prog', 'G3_program');
    bindAssocField('select-assoc-G3-famous', 'G3_famousStore');
    bindAssocField('select-assoc-G3-night', 'G3_nightLight');
    bindAssocField('select-assoc-G3-tour', 'G3_tourLink');
    bindAssocField('cb-assoc-cooling-aircon', 'G4_cooling_aircon', true);
    bindAssocField('cb-assoc-cooling-fan', 'G4_cooling_fan', true);
    bindAssocField('cb-assoc-cooling-arcade', 'G4_cooling_arcade', true);
    bindAssocField('cb-assoc-heating-warmair', 'G4_heating_warmAir', true);
    bindAssocField('cb-assoc-flood-pump', 'G4_flood_pump', true);
    bindAssocField('cb-assoc-flood-wall', 'G4_flood_wall', true);
  }

  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      // 상인회 전용 블루프린트 분기 (완전 격리)
      if (data.surveyType === 'kstat_assoc') {
        renderAssocBlueprint(data);
        return;
      }

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
      case 'QUOTA_BINDING': return '쿼터 1:1 바인딩';
      case 'RULE_FIXED': return '규칙 필수 고정';
      case 'TUNABLE_JITTER': return '기준점 조절';
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
        const labor = (currentBaseline.employeeRegular > 0 ? (currentBaseline.costLaborRatio || 25) : 0);
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

  function renderDualRangeControl(idPrefix, minKey, maxKey, minBound, maxBound, step, defaultMin, defaultMax, unit) {
    const curMin = currentBaseline[minKey] !== undefined ? currentBaseline[minKey] : defaultMin;
    const curMax = currentBaseline[maxKey] !== undefined ? currentBaseline[maxKey] : defaultMax;
    const minPercent = Math.max(0, Math.min(100, ((curMin - minBound) / (maxBound - minBound)) * 100));
    const maxPercent = Math.max(0, Math.min(100, ((curMax - minBound) / (maxBound - minBound)) * 100));
    const widthPercent = Math.max(0, maxPercent - minPercent);

    return `
      <div class="baseline-range-container">
        <div class="dual-slider-track-wrap">
          <div class="dual-slider-track"></div>
          <div class="dual-slider-highlight" id="highlight-${idPrefix}" style="left:${minPercent}%;width:${widthPercent}%;"></div>
          <input type="range" class="dual-slider-thumb thumb-min" id="range-min-${idPrefix}" min="${minBound}" max="${maxBound}" step="${step}" value="${curMin}" />
          <input type="range" class="dual-slider-thumb thumb-max" id="range-max-${idPrefix}" min="${minBound}" max="${maxBound}" step="${step}" value="${curMax}" />
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
        return renderDualRangeControl('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, 1, 0, 2, '명');
      // P2: 임시/일용 종업원 수 (Min~Max 레인지)
      case 'A10_3':
        return renderDualRangeControl('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, 1, 0, 1, '명');
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
      if (groupBaselines[activeGroup]) {
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
      if (groupBaselines[activeGroup]) {
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
      const labor = (currentBaseline.employeeRegular > 0 ? (currentBaseline.costLaborRatio || 25) : 0);
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

      const syncValues = () => {
        let minVal = parseFloat(elMin.value);
        let maxVal = parseFloat(elMax.value);
        if (minVal > maxVal) {
          if (document.activeElement === elMin) {
            minVal = maxVal;
            elMin.value = minVal;
          } else {
            maxVal = minVal;
            elMax.value = maxVal;
          }
        }
        currentBaseline[minKey] = minVal;
        currentBaseline[maxKey] = maxVal;
        if (groupBaselines[activeGroup]) {
          groupBaselines[activeGroup][minKey] = minVal;
          groupBaselines[activeGroup][maxKey] = maxVal;
        }
        updateVisuals(minVal, maxVal);
        if (typeof onSync === 'function') onSync(minVal, maxVal);
      };

      elMin.addEventListener('input', syncValues);
      elMax.addEventListener('input', syncValues);
      elMin.addEventListener('change', () => { syncValues(); markUnsaved(); });
      elMax.addEventListener('change', () => { syncValues(); markUnsaved(); });
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
      if (groupBaselines[activeGroup]) {
        groupBaselines[activeGroup].storePyeongMin = currentBaseline.storePyeongMin;
        groupBaselines[activeGroup].storePyeongMax = currentBaseline.storePyeongMax;
      }
    });
    bindSlider('slider-pyeong', 'val-pyeong', 'storePyeong', '평', updateSqm);
    bindDualRange('family-emp', 'employeeFamilyMin', 'employeeFamilyMax', 0, 5, '명');
    bindDualRange('paid-emp', 'employeeRegularMin', 'employeeRegularMax', 0, 10, '명', updateRawCost);
    bindDualRange('temp-emp', 'employeeTempMin', 'employeeTempMax', 0, 5, '명');
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
    if (btnSaveBaseline) {
      btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 마스터 기준점 &amp; 평가 가이드 저장 (미저장)';
      btnSaveBaseline.className = 'btn-pill btn-pill-primary btn-pulse';
    }
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

  if (btnPresetStandard) {
    btnPresetStandard.addEventListener('click', () => {
      applyPreset({
        storePyeong: 14,
        employeeFamily: 0,
        employeeFamilyMin: 0,
        employeeFamilyMax: 0,
        employeeRegular: 0,
        employeeTemp: 0,
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
        employeeTemp: 1,
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
        employeeTemp: 0,
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

  async function saveBaseline(showNotification = true) {
    try {
      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
      }

      const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');

      let payload;
      if (isAssoc) {
        payload = {
          surveyType: 'kstat_assoc',
          policy: assocPolicyState || {}
        };
      } else {
        // 현재 편집 중인 기준점을 활성 그룹에 동기화
        groupBaselines[activeGroup] = { ...currentBaseline };
        payload = {
          ...currentBaseline,
          groups: groupBaselines
        };
      }

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '저장 실패');

      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = false;
        btnSaveBaseline.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${isAssoc ? '상인회 정책 가이드라인 저장 완료!' : '마스터 기준점 &amp; 평가 가이드 저장 완료!'}`;
        btnSaveBaseline.className = 'btn-pill btn-pill-success';
      }

      if (badgeMasterStatus) {
        badgeMasterStatus.innerHTML = isAssoc 
          ? '<i class="fa-solid fa-check-double"></i> 상인회 25단계 블루프린트 설정 완료'
          : '<i class="fa-solid fa-check-double"></i> 3개 업종 그룹별 마스터 기준점 &amp; 평가 가이드 활성';
        badgeMasterStatus.className = 'badge-status badge-blueprint ready';
      }

      if (showNotification) {
        appendLog('success', isAssoc 
          ? '✓ 상인회 25단계 정책 가이드라인(F5~G4)이 성공적으로 저장되었습니다.'
          : '✓ 3개 업종 그룹별 마스터 기준점 및 조사원 평가 가이드(H1~H3)가 성공적으로 저장되었습니다. 24개 쿼터에 적용됩니다.');
      }

      setTimeout(() => {
        if (btnSaveBaseline) {
          btnSaveBaseline.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${isAssoc ? '상인회 정책 가이드 저장' : '마스터 기준점 &amp; 조사원 평가 가이드 저장'}`;
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
        const otherCamps = (camps || []).filter(c => c.id !== campId && (c.masterBaseline || c.hasMasterBlueprint));
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

        const importRes = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/import-baseline`, {
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

  // ------------------------------------------------------------------------
  // 6. 실행 제어 파이프라인 (단일 검증 & 전체 배치 연속 가동)
  // ------------------------------------------------------------------------
  // [버튼 1] 1번 쿼터 파일럿 검증 (Agree 직전 안전 대기)
  btnPilot.addEventListener('click', async () => {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    const firstBiz = quotaDb[0];
    const firstSlot = firstBiz?.slotUrl || firstBiz?.surveyUrl;

    // 1번 쿼터 슬롯 1:1 매핑 엄격 검증
    if (!firstSlot) {
      alert(`⚠️ 1번 쿼터 [${firstBiz?.companyName || '1번 점포'}]에 케이스탯 전용 설문 슬롯 URL이 매핑되지 않았습니다.\n\n중복 설문 방지를 위해 모든 쿼터에 고유 슬롯이 매핑되어야 합니다.\n상단의 [🔗 케이스탯 슬롯 1:1 매핑] 버튼을 눌러 슬롯을 매칭한 후 파일럿 검증을 진행해 주세요.`);
      if (typeof window.openSlotModal === 'function') window.openSlotModal();
      return;
    }

    let surveyUrl = firstSlot;
    if (inputSurveyUrl) inputSurveyUrl.value = firstSlot;

    try {
      setRunningState(true);
      openMonitorDrawer();
      resetTimelineChips();
      appendLog('info', `🎯 [1번 단일 검증 시작] "${firstBiz.companyName}" 점포로 Q1부터 Agree.asp까지 안전 완주를 진행합니다... (슬롯: #${firstBiz.slotIndex || 1})`);

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
    const quotaDb = currentCampaign?.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    const firstQuota = quotaDb.find(b => b.index === 1);
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed');
    const startIdx = firstDone ? 2 : 1;

    // 1:1 슬롯 매핑 전수 엄격 검증: 대상 중 슬롯이 없는 항목이 단 하나라도 있으면 가동 차단!
    const targets = quotaDb.filter(b => (b.index || b.seq) >= startIdx);
    const unmappedTargets = targets.filter(b => !b.slotUrl && !b.surveyUrl);
    if (unmappedTargets.length > 0) {
      alert(`⚠️ 쿼터와 케이스탯 슬롯이 1:1로 매핑되지 않았습니다!\n(실행 대상 ${targets.length}개 점포 중 ${unmappedTargets.length}개 슬롯 누락)\n\n슬롯이 매핑되지 않은 상태로 실행하면 동일한 설문지에 중복 제출되는 치명적인 오류가 발생합니다.\n상단의 [🔗 케이스탯 슬롯 1:1 매핑] 버튼을 눌러 모든 쿼터에 1:1 슬롯을 매칭한 후 배치를 가동해 주세요.`);
      if (typeof window.openSlotModal === 'function') window.openSlotModal();
      return;
    }

    let surveyUrl = targets[0]?.slotUrl || inputSurveyUrl.value.trim();
    const safetyGuard = checkSafetyGuard.checked;
    const confirmMsg = safetyGuard
      ? (startIdx === 1
          ? `1번부터 ${quotaDb.length}번까지 전체 쿼터 연속 배치를 시작합니다. (각 점포별 1:1 고유 슬롯으로 실행, 최종 동의 단계 안전 대기)`
          : `2번 쿼터부터 잔여 ${targets.length}건 연속 배치를 시작합니다. (각 점포별 1:1 고유 슬롯으로 실행, 최종 동의 단계 안전 대기)`)
      : `⚠️ 주의: 최종 제출 안전가드가 해제되어 있습니다!\n${targets.length}건의 설문이 각 점포별 1:1 슬롯으로 실제 최종 제출 마감됩니다. 계속하시겠습니까?`;

    if (!confirm(confirmMsg)) return;

    try {
      setRunningState(true);
      openMonitorDrawer();
      appendLog('info', `🚀 [배치 가동 시작] ${startIdx}번 쿼터부터 ${targets.length}건 1:1 슬롯 고속 자동화 연속 실행을 시작합니다...`);

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

  // 중지 버튼 (상단 & 하단 동기화)
  const handleStopSurvey = async () => {
    try {
      await fetch('/api/survey/stop', { method: 'POST' });
      setRunningState(false);
      appendLog('warn', '작업 중지 요청이 전송되었습니다.');
    } catch (err) {
      appendLog('error', `중지 요청 실패: ${err.message}`);
    }
  };
  btnStop.addEventListener('click', handleStopSurvey);
  if (btnStopAllBatchBottom) {
    btnStopAllBatchBottom.addEventListener('click', handleStopSurvey);
  }

  // ------------------------------------------------------------------------
  // 6-1. 케이스탯 슬롯 1:1 매칭 모달 및 스마트 파서 (Modal Slot Controller)
  // ------------------------------------------------------------------------
  const modalSlotMapping = document.getElementById('modal-slot-mapping');
  const btnOpenSlotModal = document.getElementById('btn-open-slot-modal');
  const btnCloseSlotModal = document.getElementById('btn-close-slot-modal');
  const btnCancelSlotModal = document.getElementById('btn-cancel-slot-modal');
  const textareaBulkSlots = document.getElementById('textarea-bulk-slots');
  const btnParseSlots = document.getElementById('btn-parse-slots');
  const btnClearSlots = document.getElementById('btn-clear-slots');
  const slotParseStatusMsg = document.getElementById('slot-parse-status-msg');
  const slotMatchSummaryBadge = document.getElementById('slot-match-summary-badge');
  const slotPreviewTbody = document.getElementById('slot-preview-tbody');
  const checkResetQuotaStatus = document.getElementById('check-reset-quota-status');
  const btnSubmitSlotMapping = document.getElementById('btn-submit-slot-mapping');

  let parsedSlotsState = [];

  // 스마트 슬롯 URL 파서
  function parseBulkSlotInput(rawText) {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const slots = [];

    // 정규식 1: 케이스탯 index.asp URL 패턴
    const urlRegex = /(https?:\/\/[^\s"'<>]+index\.asp\?[^\s"'<>]+)/gi;
    const kidRegex = /[?&]KID=([A-Za-z0-9_-]+)/i;
    const extraRegex = /\(([0-9]+)\)추가/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(urlRegex);
      if (matches) {
        matches.forEach(url => {
          const kidMatch = url.match(kidRegex);
          const extraMatch = line.match(extraRegex);
          slots.push({
            slotUrl: url,
            ranId: kidMatch ? kidMatch[1] : null,
            slotExtra: extraMatch ? extraMatch[0] : `(${slots.length})추가`,
            slotIndex: slots.length + 1
          });
        });
      }
    }

    // fallback: URL 직접 줄바꿈 입력
    if (slots.length === 0) {
      lines.forEach((line, idx) => {
        if (line.startsWith('http://') || line.startsWith('https://')) {
          const kidMatch = line.match(kidRegex);
          slots.push({
            slotUrl: line,
            ranId: kidMatch ? kidMatch[1] : null,
            slotExtra: `(${idx})추가`,
            slotIndex: idx + 1
          });
        }
      });
    }

    return slots;
  }

  function renderSlotPreviewTable() {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    const total = quotaDb.length;
    let matchedCount = 0;

    if (total === 0) {
      if (slotPreviewTbody) slotPreviewTbody.innerHTML = '<tr><td colspan="6" class="empty-table-msg">쿼터 점포가 없습니다.</td></tr>';
      if (slotMatchSummaryBadge) slotMatchSummaryBadge.textContent = '매칭: 0 / 0 점포';
      return;
    }

    if (slotPreviewTbody) {
      slotPreviewTbody.innerHTML = quotaDb.map((item, idx) => {
        const seq = item.index || item.seq || (idx + 1);
        const parsedSlot = parsedSlotsState[idx] || {};
        const url = parsedSlot.slotUrl || item.slotUrl || '';
        const slotExtra = parsedSlot.slotExtra || item.slotExtra || (url ? `(${idx})추가` : '-');
        const isMatched = !!url;
        if (isMatched) matchedCount++;

        return `
          <tr class="slot-preview-row ${isMatched ? 'row-matched' : 'row-unmatched'}">
            <td class="text-center font-mono font-bold col-seq">${seq}</td>
            <td class="col-company"><strong class="company-name-highlight">${escapeHtml(item.companyName || '-')}</strong></td>
            <td class="text-center col-ind"><span class="quota-ind-badge">${escapeHtml(getIndustryBadgeText(item.industry || item.handledItems))}</span></td>
            <td class="col-ceo"><span class="ceo-name-highlight">${escapeHtml(item.ceoName || '-')}</span></td>
            <td class="text-center font-mono col-slot-label">
              ${isMatched ? `<span class="badge-slot-matched font-mono font-bold">슬롯 #${idx + 1} ${escapeHtml(slotExtra)}</span>` : '<span class="badge-slot-empty">-</span>'}
            </td>
            <td class="font-mono col-slot-url">
              ${isMatched 
                ? `<div class="slot-url-text font-mono break-all" title="${escapeHtml(url)}">${escapeHtml(url)}</div>` 
                : '<span class="badge-slot-unmapped"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 URL 미지정</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }

    if (slotMatchSummaryBadge) {
      slotMatchSummaryBadge.textContent = `매칭 완료: ${matchedCount} / ${total} 점포`;
      if (matchedCount === total && total > 0) {
        slotMatchSummaryBadge.className = 'slot-summary-badge success';
        if (slotParseStatusMsg) {
          slotParseStatusMsg.className = 'slot-parse-msg success';
          slotParseStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> 전체 <strong>${total}개 점포</strong>에 슬롯 URL이 1:1로 매칭되었습니다. 저장을 진행해 주세요.`;
        }
      } else {
        slotMatchSummaryBadge.className = 'slot-summary-badge warning';
        if (slotParseStatusMsg) {
          slotParseStatusMsg.className = 'slot-parse-msg warning';
          slotParseStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 전체 <strong>${total}개 점포</strong> 중 <strong>${matchedCount}개</strong>만 매칭되었습니다. (<strong>${total - matchedCount}개</strong> 누락)`;
        }
      }
    }
  }

  function openSlotModal() {
    if (!currentCampaign) return;
    const quotaDb = currentCampaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    parsedSlotsState = quotaDb.map((item, idx) => ({
      index: item.index || item.seq || (idx + 1),
      seq: item.seq || item.index || (idx + 1),
      companyName: item.companyName,
      industry: item.industry || item.handledItems,
      ceoName: item.ceoName,
      slotUrl: item.slotUrl || '',
      slotIndex: item.slotIndex || (idx + 1),
      slotExtra: item.slotExtra || '',
      ranId: item.ranId || ''
    }));

    const existingUrls = parsedSlotsState.filter(s => s.slotUrl).map(s => s.slotUrl);
    if (existingUrls.length > 0 && textareaBulkSlots && !textareaBulkSlots.value.trim()) {
      textareaBulkSlots.value = existingUrls.join('\n');
    }

    renderSlotPreviewTable();
    if (modalSlotMapping) modalSlotMapping.classList.add('is-open');
  }

  window.openSlotModal = openSlotModal;

  function closeSlotModal() {
    if (modalSlotMapping) modalSlotMapping.classList.remove('is-open');
  }

  if (btnOpenSlotModal) btnOpenSlotModal.addEventListener('click', openSlotModal);
  if (btnCloseSlotModal) btnCloseSlotModal.addEventListener('click', closeSlotModal);
  if (btnCancelSlotModal) btnCancelSlotModal.addEventListener('click', closeSlotModal);

  if (btnParseSlots) {
    btnParseSlots.addEventListener('click', () => {
      const text = textareaBulkSlots ? textareaBulkSlots.value.trim() : '';
      if (!text) {
        alert('슬롯 URL을 입력해주세요.');
        if (textareaBulkSlots) textareaBulkSlots.focus();
        return;
      }

      const extracted = parseBulkSlotInput(text);
      if (extracted.length === 0) {
        alert('입력된 텍스트에서 케이스탯 설문 URL을 찾을 수 없습니다.\n올바른 index.asp?KID=... 형태의 URL인지 확인해주세요.');
        return;
      }

      const quotaDb = currentCampaign?.quotaDatabase || [];
      parsedSlotsState = quotaDb.map((item, idx) => {
        const slot = extracted[idx];
        return {
          index: item.index || item.seq || (idx + 1),
          seq: item.seq || item.index || (idx + 1),
          companyName: item.companyName,
          industry: item.industry || item.handledItems,
          ceoName: item.ceoName,
          slotUrl: slot ? slot.slotUrl : '',
          slotIndex: slot ? slot.slotIndex : (idx + 1),
          slotExtra: slot ? slot.slotExtra : `(${idx})추가`,
          ranId: slot ? slot.ranId : null
        };
      });

      renderSlotPreviewTable();
    });
  }

  if (btnClearSlots) {
    btnClearSlots.addEventListener('click', () => {
      if (textareaBulkSlots) textareaBulkSlots.value = '';
      const quotaDb = currentCampaign?.quotaDatabase || [];
      parsedSlotsState = quotaDb.map((item, idx) => ({
        index: item.index || item.seq || (idx + 1),
        seq: item.seq || item.index || (idx + 1),
        companyName: item.companyName,
        industry: item.industry || item.handledItems,
        ceoName: item.ceoName,
        slotUrl: '',
        slotIndex: idx + 1,
        slotExtra: '',
        ranId: null
      }));
      renderSlotPreviewTable();
    });
  }

  if (btnSubmitSlotMapping) {
    btnSubmitSlotMapping.addEventListener('click', async () => {
      const quotaDb = currentCampaign?.quotaDatabase || [];
      const total = quotaDb.length;
      const validSlots = parsedSlotsState.filter(s => s.slotUrl && s.slotUrl.trim() !== '');

      if (validSlots.length === 0) {
        alert('매핑할 슬롯 URL이 없습니다. 대량 입력창에 슬롯 URL을 입력하고 [자동 파싱]을 먼저 진행해주세요.');
        return;
      }

      if (validSlots.length < total) {
        if (!confirm(`⚠️ 전체 ${total}개 점포 중 ${validSlots.length}개 점포만 슬롯이 지정되어 있습니다.\n일부 점포의 슬롯이 누락되면 배치 자동화가 차단될 수 있습니다. 이대로 저장하시겠습니까?`)) {
          return;
        }
      }

      const resetStatus = checkResetQuotaStatus ? checkResetQuotaStatus.checked : true;

      try {
        btnSubmitSlotMapping.disabled = true;
        btnSubmitSlotMapping.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

        const res = await fetch(`/api/campaigns/${campId}/bind-slots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: parsedSlotsState,
            resetStatus
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '슬롯 매핑 저장 실패');

        alert(data.message || '케이스탯 슬롯 1:1 매핑이 성공적으로 저장되었습니다!');
        closeSlotModal();

        await loadCampaign();
      } catch (err) {
        alert('슬롯 매핑 저장 실패: ' + err.message);
      } finally {
        btnSubmitSlotMapping.disabled = false;
        btnSubmitSlotMapping.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 1:1 슬롯 매핑 적용 및 저장';
      }
    });
  }

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
          // [채널 필터링] 설문 작업실에서는 타 화면의 쿼터 생성/수집 로그를 제외
          if (data.channel === 'quota') return;
          const msg = String(data.message || '');
          if (
            msg.includes('[온누리 쿼터') ||
            msg.includes('[MarketBz]') ||
            msg.includes('[Hybrid Quota]') ||
            msg.includes('[Step 1/2]') ||
            msg.includes('[Step 2/2]')
          ) {
            return;
          }
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
      if (btnRunAllBatchBottom) btnRunAllBatchBottom.disabled = true;
      btnStop.disabled = false;
      if (btnStopAllBatchBottom) btnStopAllBatchBottom.disabled = false;
      if (step2ConfigCard) step2ConfigCard.classList.add('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = true;
      if (currentStorePulse) currentStorePulse.classList.remove('d-none');

      // 마스터 기준점 런타임 락 (보호 모드)
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.add('section-locked');
      if (blueprintLockBanner) blueprintLockBanner.classList.remove('hidden');
      if (btnSaveBaseline) btnSaveBaseline.disabled = true;
      if (btnPresetStandard) btnPresetStandard.disabled = true;
      if (btnPresetGrowth) btnPresetGrowth.disabled = true;
      if (btnPresetTraditional) btnPresetTraditional.disabled = true;
      if (btnPresetRotation) btnPresetRotation.disabled = true;
    } else {
      statusIndicator.classList.remove('running');
      statusText.textContent = '준비 완료 (대기 중)';
      btnStop.disabled = true;
      if (btnStopAllBatchBottom) btnStopAllBatchBottom.disabled = true;
      if (step2ConfigCard) step2ConfigCard.classList.remove('section-locked');
      if (checkSafetyGuard) checkSafetyGuard.disabled = false;
      if (currentStorePulse) currentStorePulse.classList.add('d-none');

      // 마스터 기준점 런타임 락 해제
      if (sectionMasterBlueprint) sectionMasterBlueprint.classList.remove('section-locked');
      if (blueprintLockBanner) blueprintLockBanner.classList.add('hidden');
      if (btnSaveBaseline) btnSaveBaseline.disabled = false;
      if (btnPresetStandard) btnPresetStandard.disabled = false;
      if (btnPresetGrowth) btnPresetGrowth.disabled = false;
      if (btnPresetTraditional) btnPresetTraditional.disabled = false;
      if (btnPresetRotation) btnPresetRotation.disabled = false;

      updateButtonStates();
    }
  }

  // ------------------------------------------------------------------------
  // 3대 핵심 영역 부드러운 스크롤 퀵 점프 바인딩 (1페이지 통합 모드)
  // ------------------------------------------------------------------------
  quickJumpPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSelector = pill.getAttribute('href');
      const targetEl = document.querySelector(targetSelector);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  if (linkGoToBlueprint) {
    linkGoToBlueprint.addEventListener('click', (e) => {
      e.preventDefault();
      const bpEl = document.getElementById('section-master-blueprint');
      if (bpEl) bpEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ------------------------------------------------------------------------
  // 서버 실행 상태 동기화 (새로고침/재진입 시 자동 복원)
  // ------------------------------------------------------------------------
  async function syncServerRunningState() {
    try {
      const res = await fetch('/api/survey/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.isRunning && data.campaignId === campId) {
        setRunningState(true);
        appendLog('info', '📡 [상태 복원] 현재 원격 설문 배치가 가동 중입니다. (실시간 모니터링 연동)');
      }
    } catch (err) {
      console.warn('서버 상태 조회 실패:', err);
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
  // Kstat 조사원 계정 설정 저장 제어
  const btnSaveKstatAccount = document.getElementById('btn-save-kstat-account');
  const inputKstatAccountId = document.getElementById('input-kstat-account-id');
  const inputKstatAccountPw = document.getElementById('input-kstat-account-pw');
  const badgeCurrentKstatAccount = document.getElementById('badge-current-kstat-account');

  if (btnSaveKstatAccount) {
    btnSaveKstatAccount.addEventListener('click', async () => {
      const loginId = (inputKstatAccountId?.value || '').trim();
      const loginPw = (inputKstatAccountPw?.value || '').trim();
      if (!loginId) {
        alert('Kstat 조사원 성명(ID)을 입력해주세요.');
        return;
      }
      btnSaveKstatAccount.disabled = true;
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kstatLoginId: loginId, kstatLoginPw: loginPw })
        });
        if (!res.ok) throw new Error('계정 저장 실패');
        if (currentCampaign) {
          currentCampaign.kstatLoginId = loginId;
          currentCampaign.kstatLoginPw = loginPw;
        }
        if (badgeCurrentKstatAccount) {
          badgeCurrentKstatAccount.innerHTML = `<i class="fa-solid fa-user-check"></i> 연동 계정: <strong>${escapeHtml(loginId)}</strong>`;
        }
        appendLog('success', `✓ Kstat 조사원 계정(${loginId})이 저장되었습니다.`);
        alert(`✓ Kstat 조사원 계정(${loginId})이 성공적으로 저장되었습니다.`);
      } catch (err) {
        alert('계정 저장 오류: ' + err.message);
      } finally {
        btnSaveKstatAccount.disabled = false;
      }
    });
  }

  // Kstat 슬롯 바인딩 모달 제어
  const btnOpenBindSlots = document.getElementById('btn-open-bind-slots');
  const modalBindSlots = document.getElementById('modal-bind-slots');
  const btnCloseBindModal = document.getElementById('btn-close-bind-modal');
  const btnCancelBindModal = document.getElementById('btn-cancel-bind-modal');
  const btnSubmitBindSlots = document.getElementById('btn-submit-bind-slots');
  const inputKstatLoginId = document.getElementById('input-kstat-login-id');
  const inputKstatLoginPw = document.getElementById('input-kstat-login-pw');
  const inputKstatListUrl = document.getElementById('input-kstat-list-url');
  const inputKstatMarketFilter = document.getElementById('input-kstat-market-filter');

  const openBindSlotsModal = () => {
    if (!modalBindSlots) return;
    const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');
    modalBindSlots.classList.remove('hidden');

    const defaultSurveyor = isAssoc ? '가온박정순' : '가온김영옥';
    const defaultListUrl = isAssoc 
      ? 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi'
      : 'https://survey.kstat.co.kr/kstat_survey/survey/2026070802/list.php?pridSel=2026070802&josa=tapi';
    const defaultMarket = isAssoc ? '' : '풍납시장';

    // 모달 타이틀 및 설명문 동적 최적화
    const modalTitleEl = modalBindSlots.querySelector('.bind-slots-title');
    const modalDescEl = modalBindSlots.querySelector('.bind-slots-desc');
    if (modalTitleEl) {
      modalTitleEl.innerHTML = isAssoc 
        ? '<i class="fa-solid fa-sitemap"></i> Kstat 상인회 실태조사 슬롯 자동 바인딩' 
        : '<i class="fa-solid fa-link"></i> Kstat 관리자 슬롯 자동 바인딩';
    }
    if (modalDescEl) {
      modalDescEl.innerHTML = isAssoc
        ? '케이스탯 상인회 관리자(<code>2026070801</code>)에 접속하여 배정된 상인회 슬롯 목록을 1초 만에 전수 스크랩하여 <strong>조사 쿼터 DB로 자동 구축 및 1:1 바인딩</strong>합니다.'
        : '케이스탯 관리자 리스트(<code>list.php</code>) URL을 입력하시면, 생성된 슬롯 목록을 1초 만에 전수 스크랩하여 <strong>[본 설문 URL]</strong>과 <strong>[조사원 평가 URL]</strong>을 현재 쿼터 DB에 1:1로 자동 장착합니다.';
    }

    if (inputKstatLoginId) {
      inputKstatLoginId.value = inputKstatAccountId?.value || currentCampaign?.kstatLoginId || defaultSurveyor;
    }
    if (inputKstatLoginPw) {
      inputKstatLoginPw.value = inputKstatAccountPw?.value || currentCampaign?.kstatLoginPw || '1234';
    }
    if (inputKstatListUrl) {
      inputKstatListUrl.value = currentCampaign?.kstatListUrl || defaultListUrl;
    }
    if (inputKstatMarketFilter) {
      inputKstatMarketFilter.value = isAssoc ? '' : (inputKstatMarketFilter.value || defaultMarket);
      inputKstatMarketFilter.placeholder = isAssoc ? '비워둘 경우 전체 시장 슬롯 스크랩' : '예: 풍납시장 (비워둘 경우 전체 스크랩)';
    }
  };

  if (btnOpenBindSlots) {
    btnOpenBindSlots.addEventListener('click', openBindSlotsModal);
  }

  const btnAssocBindSlotsHero = document.getElementById('btn-assoc-bind-slots-hero');
  if (btnAssocBindSlotsHero) {
    btnAssocBindSlotsHero.addEventListener('click', openBindSlotsModal);
  }

  const btnToggleAssocAccount = document.getElementById('btn-toggle-assoc-account');
  if (btnToggleAssocAccount) {
    btnToggleAssocAccount.addEventListener('click', () => {
      const authPanel = document.getElementById('kstat-auth-panel');
      if (authPanel) {
        authPanel.classList.toggle('hidden');
        if (!authPanel.classList.contains('hidden')) {
          const idInput = document.getElementById('input-kstat-account-id');
          if (idInput) idInput.focus();
        }
      }
    });
  }

    const closeModal = () => modalBindSlots.classList.add('hidden');
    if (btnCloseBindModal) btnCloseBindModal.addEventListener('click', closeModal);
    if (btnCancelBindModal) btnCancelBindModal.addEventListener('click', closeModal);

    if (btnSubmitBindSlots) {
      btnSubmitBindSlots.addEventListener('click', async () => {
        const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');
        const defaultSurveyor = isAssoc ? '가온박정순' : '가온김영옥';
        const loginId = (inputKstatLoginId?.value || '').trim() || defaultSurveyor;
        const loginPw = (inputKstatLoginPw?.value || '').trim() || '1234';
        const listUrl = (inputKstatListUrl?.value || '').trim();
        const marketName = (inputKstatMarketFilter?.value || '').trim();
        if (!listUrl) {
          alert('케이스탯 list.php URL을 입력해 주세요.');
          return;
        }

        btnSubmitBindSlots.disabled = true;
        btnSubmitBindSlots.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 슬롯 스크랩 및 바인딩 중...';

        try {
          appendLog('info', `[${isAssoc ? '상인회 슬롯' : 'Kstat 슬롯'}] ${listUrl} (조사원: ${loginId}, 대상: ${marketName || '전체'}) 스크랩 및 바인딩 시작...`);
          
          const bindEndpoint = isAssoc 
            ? `/api/campaigns/${encodeURIComponent(campId)}/bind-assoc-slots` 
            : `/api/campaigns/${encodeURIComponent(campId)}/bind-kstat-slots`;

          const res = await fetch(bindEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listUrl, marketName, loginId, loginPw })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '슬롯 바인딩 실패');

          if (inputKstatAccountId) inputKstatAccountId.value = loginId;
          if (inputKstatAccountPw) inputKstatAccountPw.value = loginPw;
          if (badgeCurrentKstatAccount) {
            badgeCurrentKstatAccount.innerHTML = `<i class="fa-solid fa-user-check"></i> 연동 계정: <strong>${escapeHtml(loginId)}</strong>`;
          }

          appendLog('success', `✓ ${data.message}`);
          alert(`✓ ${data.message}`);
          closeModal();
          await loadCampaign();
        } catch (err) {
          appendLog('error', `슬롯 바인딩 실패: ${err.message}`);
          alert('슬롯 바인딩 오류: ' + err.message);
        } finally {
          btnSubmitBindSlots.disabled = false;
          btnSubmitBindSlots.innerHTML = '<i class="fa-solid fa-bolt"></i> 슬롯 자동 스크랩 및 바인딩';
        }
      });
    }
  }

  // 플로팅 모니터링 드로어 제어 함수 및 이벤트 리스너
  function openMonitorDrawer() {
    if (floatingMonitorDrawer) floatingMonitorDrawer.classList.add('is-open');
  }
  function closeMonitorDrawer() {
    if (floatingMonitorDrawer) floatingMonitorDrawer.classList.remove('is-open');
  }
  function toggleMonitorDrawer() {
    if (floatingMonitorDrawer) floatingMonitorDrawer.classList.toggle('is-open');
  }

  if (btnToggleMonitor) btnToggleMonitor.addEventListener('click', toggleMonitorDrawer);
  if (btnMinimizeMonitor) btnMinimizeMonitor.addEventListener('click', closeMonitorDrawer);
  if (btnQuickOpenMonitor) btnQuickOpenMonitor.addEventListener('click', openMonitorDrawer);

  // 쿼터 교체 토글 및 조사원 계정 설정 패널 토글
  const btnToggleQuotaReplace = document.getElementById('btn-toggle-quota-replace');
  const btnToggleAccountPanel = document.getElementById('btn-toggle-account-panel');
  const kstatAuthPanel = document.getElementById('kstat-auth-panel');

  if (btnToggleQuotaReplace) {
    btnToggleQuotaReplace.addEventListener('click', () => {
      const quotaUnmounted = document.getElementById('quota-unmounted-group');
      if (quotaUnmounted) quotaUnmounted.classList.toggle('hidden');
    });
  }

  if (btnToggleAccountPanel && kstatAuthPanel) {
    btnToggleAccountPanel.addEventListener('click', () => {
      kstatAuthPanel.classList.toggle('hidden');
      if (!kstatAuthPanel.classList.contains('hidden')) {
        const idInput = document.getElementById('input-kstat-account-id');
        if (idInput) idInput.focus();
      }
    });
  }

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
    await syncServerRunningState();
  } catch (err) {
    console.error('초기 실행 상태 동기화 실패:', err);
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
