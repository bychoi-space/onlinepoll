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
  const btnRunAllBatchBottom = document.getElementById('btn-run-all-batch-bottom'); // 레거시 호환
  const btnStopAllBatchBottom = document.getElementById('btn-stop-all-batch-bottom'); // 레거시 호환
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
  const floatingMonitorLauncher = document.getElementById('floating-monitor-launcher');
  const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
  const btnMinimizeMonitor = document.getElementById('btn-minimize-monitor');
  const btnQuickOpenMonitor = document.getElementById('btn-quick-open-monitor');
  const launcherMiniProgress = document.getElementById('launcher-mini-progress');

  // 실시간 로그
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const terminalLogs = document.getElementById('terminal-logs');
  const currentStepLabel = document.getElementById('current-step-label');
  const timelineStepperTitle = document.getElementById('timeline-stepper-title');
  let timelineChips = document.querySelectorAll('.step-chip');

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
    const isMetrix = (camp.surveyType === 'metrix_panel');

    // 배지 상태
    statusBadge.className = `badge-status ${camp.status || 'ready'}`;
    statusBadge.textContent = camp.status === 'running' ? '실행 중' : (camp.status === 'completed' ? '완료' : '준비 완료');

    if (quotaBadge) {
      if (isMetrix) {
        quotaBadge.className = 'badge-quota-type metrix';
        quotaBadge.textContent = '메트릭스 패널 (120단계)';
      } else if (isAssoc) {
        quotaBadge.className = 'badge-quota-type assoc';
        quotaBadge.textContent = '상인회 대상 (25단계)';
      } else {
        quotaBadge.className = `badge-quota-type ${camp.quotaType === 'b2b' ? 'b2b' : 'b2c'}`;
        quotaBadge.textContent = camp.quotaType === 'b2b' ? '사업주 대상 (B2B)' : '개인 대상 (B2C)';
      }
    }

    // 조사원 연동 계정 바인딩
    const defaultSurveyor = isAssoc ? (camp.kstatLoginId || '가온이강윤') : '가온김영옥';
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

    // 실시간 모니터링 레이어 타임라인 칩 & 제목 동적 렌더링 (상인회 25단계 vs 점포조사 15단계)
    renderTimelineChips(isAssoc);

    // STEP 3 캡처 버튼 문구 동적화
    const btnViewPilotCaptures = document.getElementById('btn-view-pilot-captures');
    if (btnViewPilotCaptures) {
      btnViewPilotCaptures.textContent = isAssoc ? '25단계 캡처 전체보기' : '15단계 캡처 전체보기';
    }

    // 대상 설문 요약 스트립 동적화
    const labelExecTargetMarket = document.getElementById('label-exec-target-market');
    if (labelExecTargetMarket) {
      labelExecTargetMarket.textContent = isMetrix
        ? '2026 경기도 소상공인 사업체패널조사 (메트릭스 SNUM 622)'
        : (isAssoc ? '2026 전통시장 및 상점가 실태조사 (상인회)' : '2026 전통시장 및 점포경영 실태조사');
    }
    const badgeBlueprintStatus = document.getElementById('badge-blueprint-status');
    if (badgeBlueprintStatus) {
      badgeBlueprintStatus.innerHTML = isMetrix
        ? '<i class="fa-solid fa-check-double"></i> 120단계 기준점 연동 완료'
        : (isAssoc ? '<i class="fa-solid fa-check-double"></i> 25단계 기준점 연동 완료' : '<i class="fa-solid fa-check-double"></i> 17단계 기준점 연동 완료');
    }
    const badgeExecEngine = document.getElementById('badge-exec-engine');
    if (badgeExecEngine) {
      badgeExecEngine.textContent = isMetrix ? '메트릭스 패널 전용' : (isAssoc ? '케이스탯 상인회 전용' : '케이스탯 TAPI 전용');
    }
    const execSurveyorLabel = document.getElementById('exec-surveyor-label');
    if (execSurveyorLabel) {
      execSurveyorLabel.textContent = isMetrix ? (camp.loginId || '강영미') : (isAssoc ? (camp.kstatLoginId || '가온이강윤') : (camp.kstatLoginId || '가온김영옥'));
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

    // 메트릭스 모드 시 Kstat 전용 버튼 숨김 및 STEP 3 스트립 갱신
    if (isMetrix) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) btnSyncKstat.style.display = 'none';
      if (btnEnrichCampaign) btnEnrichCampaign.style.display = 'none';
      const kstatPill = document.getElementById('badge-kstat-account-pill');
      if (kstatPill) {
        kstatPill.innerHTML = '<i class="fa-solid fa-user-check text-primary-color"></i> <span>조사원: <strong>강영미</strong> (SNUM 622)</span>';
      }

      // STEP 3 스트립 갱신
      const badgeExec = document.getElementById('badge-exec-engine');
      if (badgeExec) {
        badgeExec.className = 'badge-status ready font-bold';
        badgeExec.textContent = '메트릭스 GetData (SNUM 622)';
      }
      const labelMarket = document.getElementById('label-exec-target-market');
      if (labelMarket) {
        labelMarket.textContent = camp.title || '2026 경기도 소상공인 사업체패널 3차조사';
      }
      const labelSurveyor = document.getElementById('exec-surveyor-label');
      if (labelSurveyor) {
        labelSurveyor.textContent = '강영미';
      }
      const slotCountLabel = document.getElementById('exec-slot-count-label');
      if (slotCountLabel) {
        slotCountLabel.textContent = `${(camp.quotaDatabase || []).length}건 바인딩 완료`;
      }
      const badgeBp = document.getElementById('badge-blueprint-status');
      if (badgeBp) {
        badgeBp.className = 'badge-status badge-blueprint ready';
        badgeBp.innerHTML = '<i class="fa-solid fa-shield-halved text-success"></i> 98% 안전 대기 가이드 연동 완료';
      }

      // STEP 3 카드 설명 및 버튼 텍스트 최적화
      const titleBatch = document.getElementById('title-batch-automation');
      if (titleBatch) titleBatch.textContent = '메트릭스 패널 54개 순차 배치 자동화 (98% 안전 대기)';
      const descBatch = document.getElementById('desc-batch-automation');
      if (descBatch) {
        descBatch.textContent = '설정된 영업시간, 비용 비율, 100% 밸런서, 전자서명 및 간판사진을 주입하여 최종 제출 직전(98% 안전 대기)까지 안전하게 순차 진행합니다.';
      }
      const safetyGuardToggle = document.querySelector('.safety-guard-toggle span');
      if (safetyGuardToggle) {
        safetyGuardToggle.textContent = '최종 제출 직전 98% 안전 대기 (권장: 검토/수정 가능 상태 보존)';
      }
      if (checkSafetyGuard) {
        checkSafetyGuard.checked = true; // 기본값 98% 안전 대기 보장
      }

      // 1번 단일 파일럿 버튼 표시
      if (btnPilot) {
        btnPilot.classList.remove('d-none');
        btnPilot.className = 'btn-action-secondary font-bold';
        btnPilot.style.display = 'inline-flex';
        btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 1번 단일 파일럿 검증 (98%)';
      }
    } else {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'inline-flex';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) btnSyncKstat.style.display = 'inline-flex';
      if (btnEnrichCampaign) {
        btnEnrichCampaign.style.display = isAssoc ? 'none' : 'inline-flex';
      }
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
      if (btnPilot) btnPilot.disabled = true;
      btnBatch.disabled = true;
      btnBatch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 배치 진행 중...';
      if (btnRunAllBatchBottom) btnRunAllBatchBottom.disabled = true;
      btnStop.disabled = false;
      btnStop.innerHTML = '<i class="fa-solid fa-stop"></i> 배치 중지';
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
      btnStop.innerHTML = '<i class="fa-solid fa-stop"></i> 배치 중지';
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

      // 2) 1번 단일 검증 버튼 (호환용)
      const isMetrix = (currentCampaign.surveyType === 'metrix_panel');
      if (btnPilot) {
        if (isMetrix) {
          const firstDoneMetrix = firstQuota && (firstQuota.quotaStatus === '진행중(98%)' || firstQuota.status === '진행중(98%)' || firstQuota.quotaStatus === 'completed' || firstQuota.status === '완료');
          btnPilot.disabled = firstDoneMetrix;
          btnPilot.innerHTML = firstDoneMetrix 
            ? '<i class="fa-solid fa-check text-warning"></i> 1번 파일럿 완료 (98%)' 
            : '<i class="fa-solid fa-flask"></i> 1번 단일 파일럿 검증 (98%)';
        } else {
          btnPilot.disabled = firstDone;
          btnPilot.textContent = firstDone ? '1번 쿼터 검증 완료' : '1번 단일 검증';
        }
      }

      // 3) 단일 통합 배치 자동화 버튼 상태
      if (isMetrix) {
        const all98OrDone = quotaDb.length > 0 && quotaDb.every(b => 
          b.quotaStatus === 'completed' || b.status === '완료' || b.quotaStatus === '진행중(98%)' || b.status === '진행중(98%)'
        );
        if (all98OrDone) {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-secondary flex-1 font-bold';
          btnBatch.innerHTML = '<i class="fa-solid fa-check-double text-success"></i> 전체 패널 98% 안전 대기 완료 (재실행 가능)';
        } else {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-success flex-1 font-bold';
          const doneCount = quotaDb.filter(b => b.quotaStatus === '진행중(98%)' || b.status === '진행중(98%)' || b.quotaStatus === 'completed' || b.status === '완료').length;
          if (doneCount > 0) {
            btnBatch.innerHTML = `<i class="fa-solid fa-play"></i> 잔여 패널 순차 배치 계속 가동 (${doneCount}/${quotaDb.length} 완료)`;
          } else {
            btnBatch.innerHTML = '<i class="fa-solid fa-play"></i> 전체 패널 순차 배치 자동화 시작 (98%)';
          }
        }
      } else {
        const allCompleted = quotaDb.length > 0 && quotaDb.every(b => b.quotaStatus === 'completed');
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.innerHTML = '<i class="fa-solid fa-circle-check"></i> 전체 배치 자동화 최종 마감 완료 (100%)';
          if (btnRunAllBatchBottom) {
            btnRunAllBatchBottom.disabled = true;
            btnRunAllBatchBottom.textContent = '전체 배치 마감 완료 (100%)';
          }
        } else {
          btnBatch.disabled = false;
          if (firstDone) {
            btnBatch.innerHTML = '<i class="fa-solid fa-play"></i> 미완료 슬롯 순차 배치 자동화 계속 가동';
          } else {
            btnBatch.innerHTML = '<i class="fa-solid fa-play"></i> 전체 배치 자동화 시작';
          }
          if (btnRunAllBatchBottom) {
            btnRunAllBatchBottom.disabled = false;
            btnRunAllBatchBottom.innerHTML = '<i class="fa-solid fa-rocket"></i> 이 기준점으로 전체 배치 가동';
          }
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
      const st = item.quotaStatus || item.status || 'ready';
      if (st === 'pilot_done' || st === '진행중(98%)' || String(st).includes('98%')) pilot++;
      else if (st === 'completed' || st === '완료') completed++;
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
    // 점포조사의 경우 쿼터가 0건일 때 STEP 2, 3을 숨기지만,
    // 상인회 조사는 슬롯 바인딩 전이라도 가이드라인(B5-4, C3, D1, F5~G4 정책 등) 설정이 항상 화면에 노출되어야 함!
    const sectionMasterBlueprint = document.getElementById('section-master-blueprint');
    const sectionExecution = document.getElementById('section-execution');
    const jumpPills = document.querySelectorAll('.quick-jump-pill');

    if (total === 0) {
      if (isAssoc) {
        if (sectionMasterBlueprint) {
          sectionMasterBlueprint.classList.remove('hidden');
          sectionMasterBlueprint.style.display = 'block';
        }
        if (sectionExecution) sectionExecution.classList.add('hidden');
        if (jumpPills && jumpPills.length >= 3) {
          jumpPills[1].style.opacity = '1';
          jumpPills[1].style.pointerEvents = 'auto';
          jumpPills[2].style.opacity = '0.35';
          jumpPills[2].style.pointerEvents = 'none';
        }
      } else {
        if (sectionMasterBlueprint) sectionMasterBlueprint.classList.add('hidden');
        if (sectionExecution) sectionExecution.classList.add('hidden');
        // 상단 퀵 점프 바의 STEP 2, 3 비활성화
        if (jumpPills && jumpPills.length >= 3) {
          jumpPills[1].style.opacity = '0.35';
          jumpPills[1].style.pointerEvents = 'none';
          jumpPills[2].style.opacity = '0.35';
          jumpPills[2].style.pointerEvents = 'none';
        }
      }
    } else {
      if (sectionMasterBlueprint) {
        sectionMasterBlueprint.classList.remove('hidden');
        sectionMasterBlueprint.style.display = 'block';
      }
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

    const currentSurveyor = currentCampaign?.kstatLoginId || (isAssoc ? '가온이강윤' : '가온김영옥');
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

    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');

    // 테이블 헤더 동적 교체
    const quotaTableHead = document.getElementById('quota-table-head');
    if (quotaTableHead) {
      if (isMetrix) {
        quotaTableHead.innerHTML = `
          <tr>
            <th class="th-no">번호</th>
            <th>UID</th>
            <th>사업체명</th>
            <th>대표자 성명</th>
            <th>성별</th>
            <th>휴대폰</th>
            <th>사업자등록번호</th>
            <th>업종</th>
            <th>분류명</th>
            <th>지역</th>
            <th>사업장 주소</th>
            <th>설문 URL</th>
            <th class="th-status">진행 상태</th>
          </tr>
        `;
      } else if (isAssoc) {
        quotaTableHead.innerHTML = `
          <tr>
            <th class="th-no">번호</th>
            <th>조사원계정</th>
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
          <td colspan="${isAssoc ? 10 : 13}" class="empty-table-msg">
            ${isAssoc 
              ? '아직 등록된 상인회 슬롯 DB가 없습니다.<br>상단의 <strong>[Kstat 상인회 슬롯 자동 바인딩]</strong> 버튼을 클릭하여 슬롯을 장착해 주세요.' 
              : '아직 구축된 사업자 DB가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.'}
          </td>
        </tr>
      `;
      return;
    }

    // [메트릭스 패널 전용 13개 컬럼 테이블 렌더링]
    if (isMetrix) {
      quotaTableBody.innerHTML = db.map((item, idx) => {
        const seq = item.index || item.seq || (idx + 1);
        const st = item.quotaStatus || item.status || 'ready';
        let statusHtml = '<span class="badge-status ready">대기</span>';

        if (st === '완료' || st === 'completed') {
          statusHtml = '<span class="badge-status success"><i class="fa-solid fa-check"></i> 완료</span>';
        } else if (st === '진행중' || st === 'running') {
          statusHtml = '<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중</span>';
        } else if (st === '진행중(98%)' || String(st).includes('98%')) {
          statusHtml = '<span class="badge-status warning font-bold" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);"><i class="fa-solid fa-shield-halved"></i> 98% 검토대기</span>';
        } else if (st === 'pilot_done') {
          statusHtml = '<span class="badge-status pilot"><i class="fa-solid fa-flask"></i> 검증대기</span>';
        } else if (st === 'error') {
          statusHtml = '<span class="badge-status error">오류</span>';
        }

        const surveyUrlTag = item.surveyUrl 
          ? `<a href="${escapeHtml(item.surveyUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="새 탭에서 설문 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i> 설문 열기</a>`
          : '<span class="text-dim">미생성</span>';

        return `
          <tr data-row-idx="${seq}">
            <td class="text-center font-mono font-bold">${seq}</td>
            <td class="font-mono font-bold text-primary-color">${escapeHtml(item.uid || '-')}</td>
            <td><strong>${escapeHtml(item.companyName || '-')}</strong></td>
            <td>${escapeHtml(item.ceoName || '-')}</td>
            <td class="text-center">${item.ceoGender ? `<span class="badge-gender ${item.ceoGender.includes('여') ? 'female' : 'male'}">${escapeHtml(item.ceoGender)}</span>` : '-'}</td>
            <td class="font-mono">${escapeHtml(item.phone || '-')}</td>
            <td class="font-mono">${escapeHtml(item.bizNumber || '-')}</td>
            <td>${escapeHtml(item.industry || '-')}</td>
            <td><span class="badge-main-product">${escapeHtml(item.bizCategory || '-')}</span></td>
            <td>${escapeHtml(item.area || '-')}</td>
            <td title="${escapeHtml(item.fullAddress || item.address || '')}">${escapeHtml(item.fullAddress || item.address || '-')}</td>
            <td class="text-center">${surveyUrlTag}</td>
            <td class="text-center">${statusHtml}</td>
          </tr>
        `;
      }).join('');
      return;
    }

    // [상인회 전용 10개 컬럼 테이블 렌더링]
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

        const surveyor = item.surveyorAccount || item.surveyorName || currentCampaign?.kstatLoginId || currentSurveyor || '가온이강윤';
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
            <td class="text-center font-bold text-nowrap"><span class="badge-status ready font-mono text-primary-color"><i class="fa-solid fa-id-badge"></i> ${escapeHtml(surveyor)}</span></td>
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

  const btnDirectExcelUpload = document.getElementById('btn-direct-excel-upload');
  const inputDirectExcelUpload = document.getElementById('input-direct-excel-upload');
  if (btnDirectExcelUpload && inputDirectExcelUpload) {
    btnDirectExcelUpload.addEventListener('click', () => inputDirectExcelUpload.click());
    inputDirectExcelUpload.addEventListener('change', async (e) => {
      const fileObj = e.target.files && e.target.files[0];
      if (!fileObj) return;
      try {
        btnDirectExcelUpload.disabled = true;
        btnDirectExcelUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excel 업로드 중...';
        const fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
          reader.readAsDataURL(fileObj);
        });
        const marketName = fileObj.name.replace(/\.[^/.]+$/, '').trim() || '업로드시장';
        const res = await fetch('/api/quota/upload-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `2026_${marketName}_엑셀업로드_조사쿼터`,
            marketName,
            fileName: fileObj.name,
            fileBase64,
            autoEnrich: true,
            campaignId: campId
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Excel 업로드 실패');
        appendLog('success', data.message);
        await loadSavedQuotas();
        if (data.campaign) {
          currentCampaign = data.campaign;
          renderCampaignDetails(currentCampaign);
        } else {
          await loadCampaign();
        }
        alert(data.message);
      } catch (err) {
        alert('Excel 쿼터 업로드 오류: ' + err.message);
        appendLog('error', `Excel 쿼터 업로드 오류: ${err.message}`);
      } finally {
        btnDirectExcelUpload.disabled = false;
        btnDirectExcelUpload.innerHTML = '<i class="fa-solid fa-file-excel text-success-color"></i> Excel 쿼터 업로드';
        inputDirectExcelUpload.value = '';
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
    alert(`[${sourceMeta.name}]의 기준점 설정이 1번, 2번, 3번 그룹 전체에 일괄 복사되었습니다.\n우측의 [마스터 기준점 저장]을 눌러 서버에 최종 반영해 주세요.`);
  }

  let assocPolicyState = null;

  let metrixPolicyState = {};

  function syncMetrixInputsToState() {
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
  }

  function bindMetrixEvents() {
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
        syncMetrixInputsToState();
        appendLog('info', '[프리셋 적용] "표준 소상공인" (경영유지, 보통 만족도, 운전자금 중심) 설정 적용됨.');
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
        syncMetrixInputsToState();
        appendLog('info', '[프리셋 적용] "성장·긍정형" (매출 소폭증가, 4~5점 높은 만족도) 설정 적용됨.');
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
        syncMetrixInputsToState();
        appendLog('info', '[프리셋 적용] "생계·애로형" (매출 소폭감소, 저금리 자금지원 필요) 설정 적용됨.');
      });
    }
  }

  function renderMetrixBlueprint(data) {
    metrixPolicyState = data.policy || data.blueprint?.defaultPolicy || {};

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

    if (!blueprintStageGrid) return;

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

    bindMetrixEvents();
  }

  function renderAssocBlueprint(data) {
    assocPolicyState = data.policy || data.blueprint?.defaultPolicy || {};
    if (!assocPolicyState.A8_operatingHoursMode) assocPolicyState.A8_operatingHoursMode = 'standard';
    if (!assocPolicyState.A8_openHour) assocPolicyState.A8_openHour = '09';
    if (!assocPolicyState.A8_openMinute) assocPolicyState.A8_openMinute = '0';
    if (!assocPolicyState.A8_closeHour) assocPolicyState.A8_closeHour = '21';
    if (!assocPolicyState.A8_closeMinute) assocPolicyState.A8_closeMinute = '0';
    if (assocPolicyState.A8_noTime === undefined) assocPolicyState.A8_noTime = false;

    // 조사원 평가 기본값 보정
    if (assocPolicyState.eval_H1_1_cleanliness === undefined) assocPolicyState.eval_H1_1_cleanliness = 4;
    if (assocPolicyState.eval_H1_2_entrance === undefined) assocPolicyState.eval_H1_2_entrance = 4;
    if (assocPolicyState.eval_H1_3_parking === undefined) assocPolicyState.eval_H1_3_parking = 3;
    if (assocPolicyState.eval_H1_4_floor === undefined) assocPolicyState.eval_H1_4_floor = 4;
    if (assocPolicyState.eval_H1_jitter === undefined) assocPolicyState.eval_H1_jitter = true;

    if (assocPolicyState.eval_H2_1_specialStreet === undefined) assocPolicyState.eval_H2_1_specialStreet = '2';
    if (assocPolicyState.eval_H2_1_customText === undefined) assocPolicyState.eval_H2_1_customText = '먹거리 및 패션 특화골목';
    if (assocPolicyState.eval_H2_2_specialProduct === undefined) assocPolicyState.eval_H2_2_specialProduct = '2';
    if (assocPolicyState.eval_H2_2_customText === undefined) assocPolicyState.eval_H2_2_customText = '지역 대표 먹거리 및 신선식품';
    if (assocPolicyState.eval_H2_3_brandMark === undefined) assocPolicyState.eval_H2_3_brandMark = '2';
    if (assocPolicyState.eval_H2_3_customText === undefined) assocPolicyState.eval_H2_3_customText = '';
    if (assocPolicyState.eval_H2_4_brandUsage === undefined) assocPolicyState.eval_H2_4_brandUsage = '2';
    if (assocPolicyState.eval_H2_4_customText === undefined) assocPolicyState.eval_H2_4_customText = '';

    // 0. STEP 2 부모 컨테이너 노출 100% 보장 (0건 쿼터/슬롯 상태에서도 상인회 가이드는 항상 노출)
    const bpSection = document.getElementById('section-master-blueprint');
    if (bpSection) {
      bpSection.classList.remove('hidden');
      bpSection.style.display = 'block';
    }

    // 1. 점포조사 전용 3대 그룹 네비게이션, 프리셋 툴바, 템플릿 선택기, 범례 뱃지 숨김
    const groupNav = document.querySelector('.blueprint-group-nav-container');
    if (groupNav) groupNav.style.display = 'none';

    // 상인회 프리셋 버튼군을 헤더 우측 슬롯에 자연스럽게 일체화 배치
    const presetGroup = document.querySelector('.blueprint-preset-group');
    if (presetGroup) {
      presetGroup.style.display = 'inline-flex';
      presetGroup.innerHTML = `
        <span class="font-caption font-bold text-dim mr-4"><i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 빠른 정책 가이드:</span>
        <button type="button" class="btn-chip" id="btn-assoc-preset-random" title="F5, F6, G1, G2를 모두 1~5번 무작위 랜덤 답변으로 일괄 설정">
          <i class="fa-solid fa-dice"></i> 🎲 1~5번 전 문항 랜덤 분산 일괄 적용
        </button>
        <button type="button" class="btn-chip" id="btn-assoc-preset-default" title="모든 정책 문항을 표준 1번 항목으로 초기화">
          <i class="fa-solid fa-rotate-left"></i> 표준 1번 항목 일괄 초기화
        </button>
      `;
    }

    const tplPicker = document.querySelector('.blueprint-template-picker');
    if (tplPicker) tplPicker.style.display = 'none';

    const legendWrap = document.querySelector('.blueprint-legend-inline');
    if (legendWrap) legendWrap.style.display = 'none';

    // 2. 상단 헤더 문구 & 액션 버튼 갱신
    const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
    if (titleEl) titleEl.textContent = '상인회 실태조사 기준점 및 정책 가이드라인 (25단계)';

    const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'P1~P20 단계는 전년도(2024년) 실태조사 데이터와 100% 동일하게 자동 미러링되며, B5-4 총회, C3 전기차/주차장, D1-2 배송, 2026 신규 정책 문항(F5~G4) 가이드라인을 직접 설정합니다.';

    if (badgeMasterStatus) {
      badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 상인회 25단계 블루프린트 활성 (전년도 미러링 + 정책 가이드)';
      badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    }

    if (btnSaveBaseline) {
      btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 상인회 정책 가이드 저장';
      btnSaveBaseline.title = '상인회 25단계 정책 가이드라인 설정 저장';
    }

    if (!blueprintStageGrid) return;

    // 3. 상인회 전용 카드 그리드 렌더링 (카드 0 전폭 ➔ 카드 1~14 2열 대칭 ➔ 카드 15 전폭)
    blueprintStageGrid.innerHTML = `
      <!-- 카드 0: 기입력 항목 보존 및 슬롯 건너뛰기 규칙 카드 (그리드 상단 1열 전폭 배너) -->
      <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-forward-step"></i> 실행 규칙</span>
            <h3 class="blueprint-stage-title">기입력 항목 보존 및 슬롯 건너뛰기 규칙</h3>
          </div>
          <div class="blueprint-card-badge-group">
            <span class="badge-status ready"><i class="fa-solid fa-shield-halved"></i> 기입력 안전 보존</span>
          </div>
        </div>
        <div class="blueprint-stage-desc">
          설문 페이지(Kstat)에 사용자가 이미 입력해 둔 문항 또는 완료된 슬롯을 건너뛰고, 미입력된 빈 항목만 자동으로 채워 넣는 안전 실행 규칙입니다.
        </div>
        <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
          <div class="assoc-rule-box mb-0">
            <label class="assoc-rule-item">
              <input type="checkbox" id="cb-assoc-preserve-inputs" class="assoc-rule-cb" ${assocPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
              <div>
                <strong class="assoc-rule-title">기입력된 설문 항목 보존 [권장]</strong>
                <div class="assoc-rule-desc">
                  설문 문항 중 이미 라디오/체크박스가 선택되어 있거나 텍스트·숫자가 입력된 항목은 덮어쓰지 않고 기존 입력값을 100% 보존합니다.
                </div>
              </div>
            </label>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="assoc-rule-item">
              <input type="checkbox" id="cb-assoc-skip-completed" class="assoc-rule-cb" ${assocPolicyState.skipCompletedSlots !== false ? 'checked' : ''} />
              <div>
                <strong class="assoc-rule-title">Kstat 완료 슬롯 건너뛰기 [권장]</strong>
                <div class="assoc-rule-desc">
                  케이스탯 조사원 목록에서 이미 설문 '완료' 상태로 등록된 슬롯은 배치 실행 대상에서 제외하고 자동으로 건너뜁니다.
                </div>
              </div>
            </label>
          </div>

          <div class="assoc-rule-box mb-0 flex-column justify-center">
            <label class="assoc-rule-label-strong mb-6">
              특정 슬롯 번호 건너뛰기 (선택 사항)
            </label>
            <input type="text" id="input-assoc-skip-indices" class="assoc-rule-input" 
                   placeholder="건너뛸 슬롯 번호 입력 (예: 1, 2, 5)" 
                   value="${escapeHtml(assocPolicyState.skipSlotIndices || '')}" />
            <div class="assoc-rule-hint mt-4">
              * 배치 자동화 가동 시 여기에 입력된 슬롯 번호는 실행을 건너뜁니다.
            </div>
          </div>
        </div>
      </section>

      <!-- 신규 카드 A8: A8 전통시장·상점가 운영 시간대 가이드 (전폭 배너) -->
      <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">A8 (P4)</span>
            <h3 class="blueprint-stage-title">전통시장·상점가 운영 시간대 (개점 / 폐점)</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">
          전통시장·상점가 기준의 개점 시간 및 폐점 시간(24시간제 기준)을 설정합니다. (주간 표준 09:00~21:00 권장, 2024년 동일 계승, 야시장/새벽형 프리셋 또는 직접 시간대 설정)
        </div>
        <div class="p-14">
          <!-- 1행: 운영 모드 선택 (프리셋) -->
          <div class="form-group mb-12">
            <label class="figma-label font-bold text-primary-color">운영 시간 정책 모드</label>
            <select id="select-assoc-A8-mode" class="figma-select w-full">
              <option value="standard" ${(!assocPolicyState.A8_operatingHoursMode || assocPolicyState.A8_operatingHoursMode === 'standard') ? 'selected' : ''}>[권장] 주간 표준 운영 (09:00 ~ 21:00 동일)</option>
              <option value="mirror" ${assocPolicyState.A8_operatingHoursMode === 'mirror' ? 'selected' : ''}>2024년 시간대 1:1 동일 계승 (공란 시 09:00~21:00 적용)</option>
              <option value="traditional" ${assocPolicyState.A8_operatingHoursMode === 'traditional' ? 'selected' : ''}>새벽 / 생계형 시장 (06:00 ~ 20:00)</option>
              <option value="night" ${assocPolicyState.A8_operatingHoursMode === 'night' ? 'selected' : ''}>야시장 / 먹거리 골목 (11:00 ~ 23:00)</option>
              <option value="no_time" ${assocPolicyState.A8_operatingHoursMode === 'no_time' ? 'selected' : ''}>개점/폐점 시간 없음 (24시간 자유 영업 / A8_3 체크)</option>
              <option value="custom" ${assocPolicyState.A8_operatingHoursMode === 'custom' ? 'selected' : ''}>직접 개점·폐점 시간 지정 (아래 시간 선택)</option>
            </select>
          </div>

          <!-- 2행: 세부 시간대 선택 영역 -->
          <div id="wrap-assoc-A8-time-detail" class="grid-3col gap-10" style="align-items: flex-end;">
            <!-- 개점 시간 -->
            <div class="form-group mb-0">
              <label class="figma-label">개점 시간 (A8_1)</label>
              <div style="display: flex; gap: 6px; align-items: center;">
                <select id="select-assoc-A8-open-hour" class="figma-select" style="flex: 1;">
                  ${Array.from({ length: 24 }, (_, i) => {
                    const val = String(i).padStart(2, '0');
                    const sel = (assocPolicyState.A8_openHour === val || (!assocPolicyState.A8_openHour && val === '09')) ? 'selected' : '';
                    return `<option value="${val}" ${sel}>${val}시</option>`;
                  }).join('')}
                </select>
                <select id="select-assoc-A8-open-minute" class="figma-select" style="flex: 1;">
                  <option value="0" ${assocPolicyState.A8_openMinute === '0' || !assocPolicyState.A8_openMinute ? 'selected' : ''}>00분</option>
                  <option value="10" ${assocPolicyState.A8_openMinute === '10' ? 'selected' : ''}>10분</option>
                  <option value="20" ${assocPolicyState.A8_openMinute === '20' ? 'selected' : ''}>20분</option>
                  <option value="30" ${assocPolicyState.A8_openMinute === '30' ? 'selected' : ''}>30분</option>
                  <option value="40" ${assocPolicyState.A8_openMinute === '40' ? 'selected' : ''}>40분</option>
                  <option value="50" ${assocPolicyState.A8_openMinute === '50' ? 'selected' : ''}>50분</option>
                </select>
              </div>
            </div>

            <!-- 폐점 시간 -->
            <div class="form-group mb-0">
              <label class="figma-label">폐점 시간 (A8_2)</label>
              <div style="display: flex; gap: 6px; align-items: center;">
                <select id="select-assoc-A8-close-hour" class="figma-select" style="flex: 1;">
                  ${Array.from({ length: 24 }, (_, i) => {
                    const val = String(i).padStart(2, '0');
                    const sel = (assocPolicyState.A8_closeHour === val || (!assocPolicyState.A8_closeHour && val === '21')) ? 'selected' : '';
                    return `<option value="${val}" ${sel}>${val}시</option>`;
                  }).join('')}
                </select>
                <select id="select-assoc-A8-close-minute" class="figma-select" style="flex: 1;">
                  <option value="0" ${assocPolicyState.A8_closeMinute === '0' || !assocPolicyState.A8_closeMinute ? 'selected' : ''}>00분</option>
                  <option value="10" ${assocPolicyState.A8_closeMinute === '10' ? 'selected' : ''}>10분</option>
                  <option value="20" ${assocPolicyState.A8_closeMinute === '20' ? 'selected' : ''}>20분</option>
                  <option value="30" ${assocPolicyState.A8_closeMinute === '30' ? 'selected' : ''}>30분</option>
                  <option value="40" ${assocPolicyState.A8_closeMinute === '40' ? 'selected' : ''}>40분</option>
                  <option value="50" ${assocPolicyState.A8_closeMinute === '50' ? 'selected' : ''}>50분</option>
                </select>
              </div>
            </div>

            <!-- 없음 체크박스 -->
            <div class="form-group mb-0" style="padding-bottom: 6px;">
              <label class="custom-cb-label" style="margin-bottom: 0;">
                <input type="checkbox" id="cb-assoc-A8-no-time" ${assocPolicyState.A8_noTime ? 'checked' : ''} />
                <span class="font-bold text-white">개점/폐점 시간 없음 (A8_3)</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- 카드 1: B1~B4 조직운영 및 대표자 정보 자동 바인딩 카드 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">B1 ~ B4 (P3~P5)</span>
            <h3 class="blueprint-stage-title">상인회 조직현황 및 대표자 정보 자동 바인딩</h3>
          </div>
          <div class="blueprint-card-badge-group">
            <span class="badge-status success"><i class="fa-solid fa-lock"></i> 100% 무결점 바인딩</span>
          </div>
        </div>
        <div class="blueprint-stage-desc">
          B1 운영중 체크 연도(2024년 동일), B2-1 상인회명(2024년 동일), B3 대표자 성명·연락처(쿼터 DB 연동), B4-1 등록연도(2024년 공란 시 없음 체크, 있으면 동일 입력)를 무결점으로 자동 주입합니다.
        </div>
        <div class="blueprint-field-list">
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B1 운영 여부 및 체크 연도</span>
            <span class="badge-status ready">2024년 운영 연도와 100% 동일 주입</span>
          </div>
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B2-1 시장·상점가 상인회명</span>
            <span class="badge-status ready">2024년 상인회명과 100% 동일 계승</span>
          </div>
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B3 상인회장 성명 및 대표 연락처</span>
            <span class="badge-status ready">쿼터 등록 대표자 정보 1:1 바인딩</span>
          </div>
          <div class="field-item flex-between py-8">
            <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B4-1 법인 등기/등록연도</span>
            <span class="badge-status ready">공란 시 '없음' 체크 / 기입력 시 동일 계승</span>
          </div>
        </div>
      </section>

      <!-- 카드 2: B5-4 상인회 총회 실시 횟수 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">B5-4 (P6)</span>
            <h3 class="blueprint-stage-title">2025년 기준 상인회 총회 실시 횟수</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">2025년 기준 상인회 총회(정기 및 임시 포함) 실시 횟수를 설정합니다. (0~10회 직접 선택 또는 슬롯별 랜덤 분산)</div>
        <div class="p-14">
          <select id="select-assoc-B5-assembly" class="figma-select w-full">
            <option value="1" ${assocPolicyState.B5_generalAssemblyCount === '1' ? 'selected' : ''}>1회 (연간 정기총회 1회 기본값)</option>
            <option value="2" ${assocPolicyState.B5_generalAssemblyCount === '2' ? 'selected' : ''}>2회 (정기총회 1회 + 임시총회 1회 권장)</option>
            <option value="0" ${assocPolicyState.B5_generalAssemblyCount === '0' ? 'selected' : ''}>0회 (총회 미실시)</option>
            <option value="3" ${assocPolicyState.B5_generalAssemblyCount === '3' ? 'selected' : ''}>3회</option>
            <option value="4" ${assocPolicyState.B5_generalAssemblyCount === '4' ? 'selected' : ''}>4회</option>
            <option value="5" ${assocPolicyState.B5_generalAssemblyCount === '5' ? 'selected' : ''}>5회</option>
            <option value="6" ${assocPolicyState.B5_generalAssemblyCount === '6' ? 'selected' : ''}>6회</option>
            <option value="7" ${assocPolicyState.B5_generalAssemblyCount === '7' ? 'selected' : ''}>7회</option>
            <option value="8" ${assocPolicyState.B5_generalAssemblyCount === '8' ? 'selected' : ''}>8회</option>
            <option value="9" ${assocPolicyState.B5_generalAssemblyCount === '9' ? 'selected' : ''}>9회</option>
            <option value="10" ${assocPolicyState.B5_generalAssemblyCount === '10' ? 'selected' : ''}>10회</option>
            <option value="random_1_2" ${assocPolicyState.B5_generalAssemblyCount === 'random_1_2' ? 'selected' : ''}>🎲 [1~2회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
            <option value="random_1_3" ${assocPolicyState.B5_generalAssemblyCount === 'random_1_3' ? 'selected' : ''}>🎲 [1~3회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
            <option value="random_0_2" ${assocPolicyState.B5_generalAssemblyCount === 'random_0_2' ? 'selected' : ''}>🎲 [0~2회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          </select>
        </div>
      </section>

      <!-- 카드 3: C1, C2 고객편의시설 및 상인편의시설 보유 & 필요도 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">C1, C2 (P8)</span>
            <h3 class="blueprint-stage-title">고객·상인 편의시설 보유개수 및 필요도</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">
          C1(고객시설 11종) 및 C2(상인시설 10종)는 2024년 보유개수를 동일 계승(공란 시 없음 체크)하며, 시설 필요도 응답 방식을 설정합니다.
        </div>
        <div class="p-14">
          <div class="form-group mb-12">
            <label class="figma-label">보유개수 계승 규칙</label>
            <div class="assoc-rule-box p-8">
              <span class="font-caption text-white font-bold"><i class="fa-solid fa-circle-check text-success"></i> 2024년 보유개수 1:1 동일 입력 (보유개수 없으면 모두 '없음' 자동 선택)</span>
            </div>
          </div>
          <div class="form-group mb-0">
            <label class="figma-label">시설 필요도 체크 방식</label>
            <select id="select-assoc-C1-C2-need" class="figma-select w-full">
              <option value="random" ${(!assocPolicyState.C1_C2_needRating || assocPolicyState.C1_C2_needRating === 'random') ? 'selected' : ''}>🎲 [시설 필요도 랜덤 분산 (권장)] (일부 필요 / 일부 보통 자연 분산)</option>
              <option value="need" ${assocPolicyState.C1_C2_needRating === 'need' ? 'selected' : ''}>모두 필요 (전 문항 1: 매우 필요 선택)</option>
              <option value="none" ${assocPolicyState.C1_C2_needRating === 'none' ? 'selected' : ''}>모두 불필요 (전 문항 3: 불필요 선택)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 4: C3-1-3 전기차 전용 주차 대수 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">C3-1-3 (P9)</span>
            <h3 class="blueprint-stage-title">전기차 전용 주차 대수</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장·상점가 주차장 내 전기차 전용 주차 구역 대수를 설정합니다. (0~10대 직접 지정 또는 슬롯별 랜덤 분산)</div>
        <div class="p-14">
          <select id="select-assoc-C3-ev-parking" class="figma-select w-full">
            <option value="3" ${assocPolicyState.C3_1_evParkingCount === '3' ? 'selected' : ''}>3대 (표준 기본값)</option>
            <option value="0" ${assocPolicyState.C3_1_evParkingCount === '0' ? 'selected' : ''}>0대 (미보유)</option>
            <option value="1" ${assocPolicyState.C3_1_evParkingCount === '1' ? 'selected' : ''}>1대</option>
            <option value="2" ${assocPolicyState.C3_1_evParkingCount === '2' ? 'selected' : ''}>2대</option>
            <option value="4" ${assocPolicyState.C3_1_evParkingCount === '4' ? 'selected' : ''}>4대</option>
            <option value="5" ${assocPolicyState.C3_1_evParkingCount === '5' ? 'selected' : ''}>5대</option>
            <option value="6" ${assocPolicyState.C3_1_evParkingCount === '6' ? 'selected' : ''}>6대</option>
            <option value="7" ${assocPolicyState.C3_1_evParkingCount === '7' ? 'selected' : ''}>7대</option>
            <option value="8" ${assocPolicyState.C3_1_evParkingCount === '8' ? 'selected' : ''}>8대</option>
            <option value="9" ${assocPolicyState.C3_1_evParkingCount === '9' ? 'selected' : ''}>9대</option>
            <option value="10" ${assocPolicyState.C3_1_evParkingCount === '10' ? 'selected' : ''}>10대</option>
            <option value="random_0_3" ${assocPolicyState.C3_1_evParkingCount === 'random_0_3' ? 'selected' : ''}>🎲 [0~3대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
            <option value="random_1_5" ${assocPolicyState.C3_1_evParkingCount === 'random_1_5' ? 'selected' : ''}>🎲 [1~5대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
            <option value="random_0_10" ${assocPolicyState.C3_1_evParkingCount === 'random_0_10' ? 'selected' : ''}>🎲 [0~10대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          </select>
        </div>
      </section>

      <!-- 카드 5: C3-2 주차장 형태, 소유주체, 관리주체 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">C3-2 (P9)</span>
            <h3 class="blueprint-stage-title">주차장 형태 · 소유주체 · 관리주체</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">주차장 형태(부설/노상/노외), 소유주체(상인회/지자체 등), 관리주체(직접/지자체/공단 등)를 설정합니다.</div>
        <div class="p-14 grid-3col gap-10">
          <div class="form-group mb-8">
            <label class="figma-label">C3-2-1 주차장 형태</label>
            <select id="select-assoc-C3-type" class="figma-select w-full">
              <option value="2" ${assocPolicyState.C3_2_1_parkingType === '2' ? 'selected' : ''}>노상주차장 (기본값 권장)</option>
              <option value="1" ${assocPolicyState.C3_2_1_parkingType === '1' ? 'selected' : ''}>부설주차장</option>
              <option value="3" ${assocPolicyState.C3_2_1_parkingType === '3' ? 'selected' : ''}>노외주차장</option>
              <option value="1_2" ${assocPolicyState.C3_2_1_parkingType === '1_2' ? 'selected' : ''}>부설 + 노상 (중복)</option>
              <option value="2_3" ${assocPolicyState.C3_2_1_parkingType === '2_3' ? 'selected' : ''}>노상 + 노외 (중복)</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">C3-2-2 소유주체</label>
            <select id="select-assoc-C3-owner" class="figma-select w-full">
              <option value="2" ${assocPolicyState.C3_2_2_owner === '2' ? 'selected' : ''}>지자체 (기본값 권장)</option>
              <option value="1" ${assocPolicyState.C3_2_2_owner === '1' ? 'selected' : ''}>상인회</option>
              <option value="3" ${assocPolicyState.C3_2_2_owner === '3' ? 'selected' : ''}>개인 운영</option>
              <option value="random" ${assocPolicyState.C3_2_2_owner === 'random' ? 'selected' : ''}>🎲 [상인회 / 지자체 / 개인 랜덤]</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">C3-2-3 관리주체</label>
            <select id="select-assoc-C3-manager" class="figma-select w-full">
              <option value="2" ${assocPolicyState.C3_2_3_manager === '2' ? 'selected' : ''}>지자체 (기본값 권장)</option>
              <option value="1" ${assocPolicyState.C3_2_3_manager === '1' ? 'selected' : ''}>직접관리 (상인회)</option>
              <option value="3" ${assocPolicyState.C3_2_3_manager === '3' ? 'selected' : ''}>시설관리공단 등 기관</option>
              <option value="4" ${assocPolicyState.C3_2_3_manager === '4' ? 'selected' : ''}>개인</option>
              <option value="random" ${assocPolicyState.C3_2_3_manager === 'random' ? 'selected' : ''}>🎲 [직접 / 지자체 / 공단 등 랜덤]</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 6: D1-1 축제 및 이벤트 명칭 (네이버 검색 연동) -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">D1-1 (P11)</span>
            <h3 class="blueprint-stage-title">시장 축제 및 이벤트 명칭 설정</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장별 축제·이벤트 유무 및 명칭을 설정합니다. (네이버 검색엔진 자동 감지 연동)</div>
        <div class="p-14">
          <div class="form-group mb-8">
            <label class="figma-label">축제 확인 및 명칭 주입 방식</label>
            <select id="select-assoc-D1-1-mode" class="figma-select w-full">
              <option value="naver_auto" ${(!assocPolicyState.D1_1_festivalMode || assocPolicyState.D1_1_festivalMode === 'naver_auto') ? 'selected' : ''}>🔍 [네이버 검색엔진 실시간 연동 (축제 확인 시 명칭 자동입력, 미확인 시 미실시) [권장]]</option>
              <option value="none" ${assocPolicyState.D1_1_festivalMode === 'none' ? 'selected' : ''}>2: 일괄 미실시 선택</option>
              <option value="custom" ${assocPolicyState.D1_1_festivalMode === 'custom' ? 'selected' : ''}>1: 직접 축제명 고정 입력</option>
            </select>
          </div>
          <div class="form-group mb-0" id="wrap-assoc-D1-1-custom" style="display: ${assocPolicyState.D1_1_festivalMode === 'custom' ? 'block' : 'none'};">
            <label class="figma-label">고정 축제명 직접 입력</label>
            <input type="text" id="input-assoc-D1-1-custom" class="assoc-rule-input" placeholder="예: 전통시장 가을 대축제, 야시장 먹거리 축제" value="${escapeHtml(assocPolicyState.D1_1_festivalCustomName || '')}" />
          </div>
        </div>
      </section>

      <!-- 카드 7: D1-2 온라인 배송 서비스 운영 여부 및 D1-2-5 취급 품목 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">D1-2 (P12)</span>
            <h3 class="blueprint-stage-title">온라인 배송 서비스 운영 &amp; 주력 품목</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장·상점가 단위에서 온라인 배송 운영 여부 및 도입 시 주력 취급 품목을 설정합니다.</div>
        <div class="p-14 grid-2col gap-10">
          <div class="form-group mb-8">
            <label class="figma-label">D1-2 온라인 배송 운영 여부</label>
            <select id="select-assoc-D1-delivery" class="figma-select w-full">
              <option value="2" ${assocPolicyState.D1_2_onlineDeliveryService === '2' ? 'selected' : ''}>2: 온라인 배송 서비스 없음 (기본값 권장)</option>
              <option value="1" ${assocPolicyState.D1_2_onlineDeliveryService === '1' ? 'selected' : ''}>1: 온라인 배송 서비스 있음</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label">D1-2-5 주력 취급 품목 (배송 운영 시)</label>
            <select id="select-assoc-D1-2-5-item" class="figma-select w-full">
              <option value="random" ${(!assocPolicyState.D1_2_5_deliveryItem || assocPolicyState.D1_2_5_deliveryItem === 'random') ? 'selected' : ''}>🎲 [1~4번 항목 랜덤 답변 (기타 제외 기본값)]</option>
              <option value="1" ${assocPolicyState.D1_2_5_deliveryItem === '1' ? 'selected' : ''}>1. 농산물 (채소, 과일 등)</option>
              <option value="2" ${assocPolicyState.D1_2_5_deliveryItem === '2' ? 'selected' : ''}>2. 축산물 (정육, 육류 등)</option>
              <option value="3" ${assocPolicyState.D1_2_5_deliveryItem === '3' ? 'selected' : ''}>3. 수산물 (생선, 건어물 등)</option>
              <option value="4" ${assocPolicyState.D1_2_5_deliveryItem === '4' ? 'selected' : ''}>4. 가공식품 / 반찬류</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 8: E1 AI 지능형 출동 시스템 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">E1 (P16)</span>
            <h3 class="blueprint-stage-title">스마트 기술 및 AI 지능형 출동 시스템</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">화재·보안 등 스마트 안전 기술 및 AI 지능형 출동 시스템 도입 여부를 설정합니다.</div>
        <div class="p-14">
          <select id="select-assoc-E1" class="figma-select w-full">
            <option value="none" ${(!assocPolicyState.E1_aiSecuritySystem || assocPolicyState.E1_aiSecuritySystem === 'none') ? 'selected' : ''}>모두 '없음' (AI 지능형 출동 시스템 미도입 확정) [권장]</option>
            <option value="random" ${assocPolicyState.E1_aiSecuritySystem === 'random' ? 'selected' : ''}>🎲 일부 시스템 도입 슬롯별 랜덤 분산</option>
            <option value="all" ${assocPolicyState.E1_aiSecuritySystem === 'all' ? 'selected' : ''}>모두 '있음'</option>
          </select>
        </div>
      </section>

      <!-- 카드 9: F1 빈 점포 현황 숫자 입력 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">F1 (P20)</span>
            <h3 class="blueprint-stage-title">빈 점포(공실) 현황 숫자 입력 기준</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장 내 빈 점포(공실) 발생 수치 입력 기준을 설정합니다. (공란 방지 및 계산함수 자동 연동)</div>
        <div class="p-14">
          <select id="select-assoc-F1" class="figma-select w-full">
            <option value="zero" ${(!assocPolicyState.F1_emptyStoreCount || assocPolicyState.F1_emptyStoreCount === 'zero') ? 'selected' : ''}>모두 '0'건 (빈 점포 없음 완전 정상 운영 확정) [권장]</option>
            <option value="mirror" ${assocPolicyState.F1_emptyStoreCount === 'mirror' ? 'selected' : ''}>전년도(2024년) 실태조사 공실 수치 그대로 계승</option>
          </select>
        </div>
      </section>

      <!-- 카드 10: F5 빈점포 원인 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">F5 (P21)</span>
            <h3 class="blueprint-stage-title">빈 점포 발생 핵심 원인</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">시장 내 빈 점포(공실)가 발생하는 가장 주된 요인을 설정합니다 ('기타' 제외 랜덤).</div>
        <div class="p-14">
          <select id="select-assoc-F5" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.F5_emptyStoreReason || assocPolicyState.F5_emptyStoreReason === 'random') ? 'selected' : ''}>🎲 [1~4 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
            <option value="1" ${assocPolicyState.F5_emptyStoreReason === '1' ? 'selected' : ''}>1. 온라인 소비 확산 및 비대면 거래 증가</option>
            <option value="2" ${assocPolicyState.F5_emptyStoreReason === '2' ? 'selected' : ''}>2. 인근 대형마트, 복합쇼핑몰, 인근 상권과의 경쟁 밀림</option>
            <option value="3" ${assocPolicyState.F5_emptyStoreReason === '3' ? 'selected' : ''}>3. 과도하게 높은 임대료 및 권리금 조건</option>
            <option value="4" ${assocPolicyState.F5_emptyStoreReason === '4' ? 'selected' : ''}>4. 상인의 고령화 및 가업 승계(후계자) 부족</option>
          </select>
        </div>
      </section>

      <!-- 카드 11: F6 빈점포 지원 정책 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">F6 (P21)</span>
            <h3 class="blueprint-stage-title">시급한 빈 점포 정부 지원 정책</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">빈 점포 해결을 위해 정부 및 지자체에서 가장 시급히 지원해야 할 정책을 설정합니다 ('기타' 제외 랜덤).</div>
        <div class="p-14">
          <select id="select-assoc-F6" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.F6_emptyStorePolicy || assocPolicyState.F6_emptyStorePolicy === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
            <option value="1" ${assocPolicyState.F6_emptyStorePolicy === '1' ? 'selected' : ''}>1. 빈 점포를 공공 임대·매입하여 상인회에 재임대하는 제도</option>
            <option value="2" ${assocPolicyState.F6_emptyStorePolicy === '2' ? 'selected' : ''}>2. 빈 점포를 활용하는 상인에 대한 금융 지원(융자, 보조금) 확대</option>
            <option value="3" ${assocPolicyState.F6_emptyStorePolicy === '3' ? 'selected' : ''}>3. 빈 점포 공간 전환 컨설팅 및 시행 지원</option>
            <option value="4" ${assocPolicyState.F6_emptyStorePolicy === '4' ? 'selected' : ''}>4. 공실 상가 소유주에게 임대료 인하를 유도하는 세제 혜택 등 인센티브 부여</option>
            <option value="5" ${assocPolicyState.F6_emptyStorePolicy === '5' ? 'selected' : ''}>5. 빈 점포 파악 및 관리를 위한 통합 플랫폼 구축</option>
          </select>
        </div>
      </section>

      <!-- 카드 12: G1 바가지요금 원인 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G1 (P22)</span>
            <h3 class="blueprint-stage-title">바가지요금 문제 발생 주요 원인</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">전통시장 내 바가지요금 논란이 발생하는 근본적인 원인을 설정합니다 ('기타' 제외 랜덤).</div>
        <div class="p-14">
          <select id="select-assoc-G1" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.G1_overchargeReason || assocPolicyState.G1_overchargeReason === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
            <option value="1" ${assocPolicyState.G1_overchargeReason === '1' ? 'selected' : ''}>1. 외부 관광객 대상 일시적 가격 인상 관행</option>
            <option value="2" ${assocPolicyState.G1_overchargeReason === '2' ? 'selected' : ''}>2. 상인 간 가격 자율경쟁 및 통제 미흡</option>
            <option value="3" ${assocPolicyState.G1_overchargeReason === '3' ? 'selected' : ''}>3. 원재료 가격 상승에 따른 임의 가격 인상</option>
            <option value="4" ${assocPolicyState.G1_overchargeReason === '4' ? 'selected' : ''}>4. 일부 상인의 과도한 이윤추구 형태</option>
            <option value="5" ${assocPolicyState.G1_overchargeReason === '5' ? 'selected' : ''}>5. 시장 차원의 관리·감독 부족</option>
          </select>
        </div>
      </section>

      <!-- 카드 13: G2 바가지요금 대응방안 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G2 (P22)</span>
            <h3 class="blueprint-stage-title">바가지요금 개선 대응 방안</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">바가지요금 근절과 시장 신뢰 회복을 위한 최선의 방안을 설정합니다 ('기타' 제외 랜덤).</div>
        <div class="p-14">
          <select id="select-assoc-G2" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.G2_overchargeSolution || assocPolicyState.G2_overchargeSolution === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
            <option value="1" ${assocPolicyState.G2_overchargeSolution === '1' ? 'selected' : ''}>1. 시장 차원의 자율관리 (상인회 중심 가격 가이드라인 운영)</option>
            <option value="2" ${assocPolicyState.G2_overchargeSolution === '2' ? 'selected' : ''}>2. 지자체·정부의 점검 및 단속 강화</option>
            <option value="3" ${assocPolicyState.G2_overchargeSolution === '3' ? 'selected' : ''}>3. 바가지요금 신고·공개 시스템 활성화</option>
            <option value="4" ${assocPolicyState.G2_overchargeSolution === '4' ? 'selected' : ''}>4. 친절·가격교육 등 상인 대상 인식개선 교육</option>
            <option value="5" ${assocPolicyState.G2_overchargeSolution === '5' ? 'selected' : ''}>5. 우수상점 인증제 등 인센티브 제공</option>
          </select>
        </div>
      </section>

      <!-- 카드 14: G3 문화/체험/명물점포 육성 정책 -->
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

      <!-- 카드 15: G4 기후재해 대비 현황 (보유 & 필요도 일부 미체크 규칙 - 하단 전폭 마감) -->
      <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">G4 (P23)</span>
            <h3 class="blueprint-stage-title">기후재해(폭염·한파·수해) 대비 시설 및 필요도 규칙</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
        </div>
        <div class="blueprint-stage-desc">
          폭염/한파/수해 대비 냉난방 및 방재 시설 보유 여부와 필요도 분산 규칙을 설정합니다. (일부 미체크 자연 분산)
        </div>
        <div class="p-14">
          <div class="grid-2col gap-10 mb-14">
            <div class="form-group mb-8">
              <label class="figma-label font-bold text-primary-color">G4 시설 보유 여부 분산 규칙</label>
              <select id="select-assoc-G4-ownership" class="figma-select w-full">
                <option value="random_3_4" ${(!assocPolicyState.G4_facilityOwnershipRule || assocPolicyState.G4_facilityOwnershipRule === 'random_3_4') ? 'selected' : ''}>🎲 [필수 시설 3~4개 랜덤 보유 (자연 분산 기본값)]</option>
                <option value="fixed" ${assocPolicyState.G4_facilityOwnershipRule === 'fixed' ? 'selected' : ''}>아래 체크박스 선택 시설만 고정 보유</option>
                <option value="all" ${assocPolicyState.G4_facilityOwnershipRule === 'all' ? 'selected' : ''}>전수 보유</option>
              </select>
            </div>
            <div class="form-group mb-8">
              <label class="figma-label font-bold text-primary-color">G4 시설 필요도 분산 규칙 (일부 미체크)</label>
              <select id="select-assoc-G4-requirement" class="figma-select w-full">
                <option value="random_1_3" ${(!assocPolicyState.G4_facilityRequirementRule || assocPolicyState.G4_facilityRequirementRule === 'random_1_3') ? 'selected' : ''}>🎲 [미보유 시설 중심 1~3개 랜덤 필요 체크 (일부 미체크 분산 기본값)]</option>
                <option value="all" ${assocPolicyState.G4_facilityRequirementRule === 'all' ? 'selected' : ''}>전수 필요 체크</option>
                <option value="none" ${assocPolicyState.G4_facilityRequirementRule === 'none' ? 'selected' : ''}>필요 없음 (모두 미체크)</option>
              </select>
            </div>
          </div>

          <label class="figma-label font-caption text-dim mb-6">표준 기준 시설 (고정 보유 선택 시 반영):</label>
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

      <!-- 카드 16: [조사원 평가] H1. 전통시장 환경 및 시설 수준 평가 (1~5점 척도) -->
      <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill assoc-rule-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-clipboard-check"></i> 조사원 평가 (H1)</span>
            <h3 class="blueprint-stage-title">조사원 평가: 전통시장 환경 및 시설 수준 평가 (1~5점 척도)</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 조사원 평가 가이드</span>
        </div>
        <div class="blueprint-stage-desc">
          설문 완료 후 조사원이 직접 평가하는 4개 시설·환경 항목입니다. 1(매우 열악) ~ 5(매우 우수) 점수를 설정하며, <strong>응답 편중(동일 점수 몰림) 방지 지터링</strong>을 통해 Kstat 유효성 경고를 자동 방어합니다.
        </div>
        <div class="p-14">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;" class="mb-14">
            <!-- H1_1 청결위생 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H1-1. 시장 전반의 청결 및 위생 상태</label>
              <select id="select-assoc-eval-H1-1" class="figma-select w-full">
                <option value="5" ${String(assocPolicyState.eval_H1_1_cleanliness) === '5' ? 'selected' : ''}>5점 - 매우 청결하고 쾌적함</option>
                <option value="4" ${(String(assocPolicyState.eval_H1_1_cleanliness) === '4' || assocPolicyState.eval_H1_1_cleanliness === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
                <option value="3" ${String(assocPolicyState.eval_H1_1_cleanliness) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
                <option value="2" ${String(assocPolicyState.eval_H1_1_cleanliness) === '2' ? 'selected' : ''}>2점 - 다소 미흡함</option>
                <option value="1" ${String(assocPolicyState.eval_H1_1_cleanliness) === '1' ? 'selected' : ''}>1점 - 매우 열악함</option>
              </select>
            </div>

            <!-- H1_2 입구통로 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H1-2. 주 출입구 및 통행로 편의성</label>
              <select id="select-assoc-eval-H1-2" class="figma-select w-full">
                <option value="5" ${String(assocPolicyState.eval_H1_2_entrance) === '5' ? 'selected' : ''}>5점 - 매우 넓고 보행 편리</option>
                <option value="4" ${(String(assocPolicyState.eval_H1_2_entrance) === '4' || assocPolicyState.eval_H1_2_entrance === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
                <option value="3" ${String(assocPolicyState.eval_H1_2_entrance) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
                <option value="2" ${String(assocPolicyState.eval_H1_2_entrance) === '2' ? 'selected' : ''}>2점 - 다소 혼잡·미흡함</option>
                <option value="1" ${String(assocPolicyState.eval_H1_2_entrance) === '1' ? 'selected' : ''}>1점 - 통행 매우 불편</option>
              </select>
            </div>

            <!-- H1_3 주차편리성 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H1-3. 고객 주차 및 이동 편리성</label>
              <select id="select-assoc-eval-H1-3" class="figma-select w-full">
                <option value="5" ${String(assocPolicyState.eval_H1_3_parking) === '5' ? 'selected' : ''}>5점 - 주차장 매우 편리</option>
                <option value="4" ${String(assocPolicyState.eval_H1_3_parking) === '4' ? 'selected' : ''}>4점 - 양호한 편</option>
                <option value="3" ${(String(assocPolicyState.eval_H1_3_parking) === '3' || assocPolicyState.eval_H1_3_parking === undefined) ? 'selected' : ''}>3점 - 보통 수준 (기본 권장)</option>
                <option value="2" ${String(assocPolicyState.eval_H1_3_parking) === '2' ? 'selected' : ''}>2점 - 주차 다소 부족</option>
                <option value="1" ${String(assocPolicyState.eval_H1_3_parking) === '1' ? 'selected' : ''}>1점 - 주차 공간 전무</option>
              </select>
            </div>

            <!-- H1_4 바닥균일성 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H1-4. 시장 바닥 상태의 균일성</label>
              <select id="select-assoc-eval-H1-4" class="figma-select w-full">
                <option value="5" ${String(assocPolicyState.eval_H1_4_floor) === '5' ? 'selected' : ''}>5점 - 바닥 매우 평탄·균일</option>
                <option value="4" ${(String(assocPolicyState.eval_H1_4_floor) === '4' || assocPolicyState.eval_H1_4_floor === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
                <option value="3" ${String(assocPolicyState.eval_H1_4_floor) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
                <option value="2" ${String(assocPolicyState.eval_H1_4_floor) === '2' ? 'selected' : ''}>2점 - 굴곡 및 파손 다소 있음</option>
                <option value="1" ${String(assocPolicyState.eval_H1_4_floor) === '1' ? 'selected' : ''}>1점 - 바닥 매우 불량</option>
              </select>
            </div>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="assoc-rule-item">
              <input type="checkbox" id="cb-assoc-eval-H1-jitter" class="assoc-rule-cb" ${assocPolicyState.eval_H1_jitter !== false ? 'checked' : ''} />
              <div>
                <strong class="assoc-rule-title text-success">4개 항목 응답 편중 방지 지터링(Jitter) 자동 적용 [권장]</strong>
                <div class="assoc-rule-desc">
                  Kstat 유효성 검사 <code>RadioArrayCnt("H1_1,H1_2,H1_3,H1_4", 99)</code>는 4개 문항에 동일한 점수가 입력되면 "응답 편중" 경고 팝업을 띄웁니다. 이를 방지하기 위해 점포별 시드 기반으로 ±1점의 자연스러운 분산을 자동 부여합니다.
                </div>
              </div>
            </label>
          </div>
        </div>
      </section>

      <!-- 카드 17: [조사원 평가] H2. 전통시장 차별화 및 브랜드화 현황 (있다/없다 및 보충설명) -->
      <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill assoc-rule-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-tags"></i> 조사원 평가 (H2)</span>
            <h3 class="blueprint-stage-title">조사원 평가: 전통시장 차별화 및 브랜드화 현황</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 조사원 평가 가이드</span>
        </div>
        <div class="blueprint-stage-desc">
          특화거리, 특산품, 브랜드마크(BI), 홍보물 4개 항목의 보유 여부입니다. <strong>'있다(1)' 선택 시 보충설명이 필수로 입력</strong>되어야 하며, '없다(2)' 선택 시 보충설명 입력란은 자동으로 비활성화됩니다.
        </div>
        <div class="p-14">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
            <!-- H2_1 특화거리 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H2-1. 특화거리(골목) 조성 여부</label>
              <select id="select-assoc-eval-H2-1" class="figma-select w-full mb-8">
                <option value="1" ${(String(assocPolicyState.eval_H2_1_specialStreet) === '1' || assocPolicyState.eval_H2_1_specialStreet === undefined) ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
                <option value="2" ${String(assocPolicyState.eval_H2_1_specialStreet) === '2' ? 'selected' : ''}>2. 없다</option>
              </select>
              <div id="wrap-assoc-eval-H2-1-text">
                <label class="font-caption text-dim mb-4 block">보충설명 (H2_1_NOTE):</label>
                <input type="text" id="input-assoc-eval-H2-1-text" class="figma-input w-full" 
                       placeholder="예: 먹거리 및 패션 특화골목" 
                       value="${escapeHtml(assocPolicyState.eval_H2_1_customText ?? '먹거리 및 패션 특화골목')}" />
              </div>
            </div>

            <!-- H2_2 특산품 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H2-2. 대표 특산품 또는 자체 PB상품</label>
              <select id="select-assoc-eval-H2-2" class="figma-select w-full mb-8">
                <option value="1" ${(String(assocPolicyState.eval_H2_2_specialProduct) === '1' || assocPolicyState.eval_H2_2_specialProduct === undefined) ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
                <option value="2" ${String(assocPolicyState.eval_H2_2_specialProduct) === '2' ? 'selected' : ''}>2. 없다</option>
              </select>
              <div id="wrap-assoc-eval-H2-2-text">
                <label class="font-caption text-dim mb-4 block">보충설명 (H2_2_NOTE):</label>
                <input type="text" id="input-assoc-eval-H2-2-text" class="figma-input w-full" 
                       placeholder="예: 지역 대표 먹거리 및 신선식품" 
                       value="${escapeHtml(assocPolicyState.eval_H2_2_customText ?? '지역 대표 먹거리 및 신선식품')}" />
              </div>
            </div>

            <!-- H2_3 브랜드마크 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H2-3. 시장 고유 브랜드마크(BI/캐릭터)</label>
              <select id="select-assoc-eval-H2-3" class="figma-select w-full mb-8">
                <option value="2" ${(String(assocPolicyState.eval_H2_3_brandMark) === '2' || assocPolicyState.eval_H2_3_brandMark === undefined) ? 'selected' : ''}>2. 없다 (기본 권장)</option>
                <option value="1" ${String(assocPolicyState.eval_H2_3_brandMark) === '1' ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
              </select>
              <div id="wrap-assoc-eval-H2-3-text" style="display: ${String(assocPolicyState.eval_H2_3_brandMark) === '1' ? 'block' : 'none'};">
                <label class="font-caption text-dim mb-4 block">보충설명 (H2_3_NOTE):</label>
                <input type="text" id="input-assoc-eval-H2-3-text" class="figma-input w-full" 
                       placeholder="예: 시장 고유 캐릭터 및 로고" 
                       value="${escapeHtml(assocPolicyState.eval_H2_3_customText ?? '')}" />
              </div>
            </div>

            <!-- H2_4 홍보물 -->
            <div class="assoc-rule-box mb-0">
              <label class="figma-label font-bold text-white mb-6">H2-4. 브랜드 활용 안내판·홍보물 비치</label>
              <select id="select-assoc-eval-H2-4" class="figma-select w-full mb-8">
                <option value="2" ${(String(assocPolicyState.eval_H2_4_brandUsage) === '2' || assocPolicyState.eval_H2_4_brandUsage === undefined) ? 'selected' : ''}>2. 없다 (기본 권장)</option>
                <option value="1" ${String(assocPolicyState.eval_H2_4_brandUsage) === '1' ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
              </select>
              <div id="wrap-assoc-eval-H2-4-text" style="display: ${String(assocPolicyState.eval_H2_4_brandUsage) === '1' ? 'block' : 'none'};">
                <label class="font-caption text-dim mb-4 block">보충설명 (H2_4_NOTE):</label>
                <input type="text" id="input-assoc-eval-H2-4-text" class="figma-input w-full" 
                       placeholder="예: 시장 입구 안내 간판 및 리플릿" 
                       value="${escapeHtml(assocPolicyState.eval_H2_4_customText ?? '')}" />
              </div>
            </div>
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

    bindAssocField('cb-assoc-preserve-inputs', 'preserveExistingInputs', true);
    bindAssocField('cb-assoc-skip-completed', 'skipCompletedSlots', true);
    const skipIdxInput = document.getElementById('input-assoc-skip-indices');
    if (skipIdxInput) {
      skipIdxInput.addEventListener('input', () => {
        assocPolicyState.skipSlotIndices = skipIdxInput.value.trim();
        markUnsaved();
      });
    }

    // A8 운영시간 정책 연동
    const selA8Mode = document.getElementById('select-assoc-A8-mode');
    const openH = document.getElementById('select-assoc-A8-open-hour');
    const openM = document.getElementById('select-assoc-A8-open-minute');
    const closeH = document.getElementById('select-assoc-A8-close-hour');
    const closeM = document.getElementById('select-assoc-A8-close-minute');
    const cbA8NoTime = document.getElementById('cb-assoc-A8-no-time');

    const syncA8UIFromMode = (mode) => {
      if (mode === 'standard') {
        if (openH) openH.value = '09';
        if (openM) openM.value = '0';
        if (closeH) closeH.value = '21';
        if (closeM) closeM.value = '0';
        if (cbA8NoTime) cbA8NoTime.checked = false;
        assocPolicyState.A8_openHour = '09';
        assocPolicyState.A8_openMinute = '0';
        assocPolicyState.A8_closeHour = '21';
        assocPolicyState.A8_closeMinute = '0';
        assocPolicyState.A8_noTime = false;
      } else if (mode === 'traditional') {
        if (openH) openH.value = '06';
        if (openM) openM.value = '0';
        if (closeH) closeH.value = '20';
        if (closeM) closeM.value = '0';
        if (cbA8NoTime) cbA8NoTime.checked = false;
        assocPolicyState.A8_openHour = '06';
        assocPolicyState.A8_openMinute = '0';
        assocPolicyState.A8_closeHour = '20';
        assocPolicyState.A8_closeMinute = '0';
        assocPolicyState.A8_noTime = false;
      } else if (mode === 'night') {
        if (openH) openH.value = '11';
        if (openM) openM.value = '0';
        if (closeH) closeH.value = '23';
        if (closeM) closeM.value = '0';
        if (cbA8NoTime) cbA8NoTime.checked = false;
        assocPolicyState.A8_openHour = '11';
        assocPolicyState.A8_openMinute = '0';
        assocPolicyState.A8_closeHour = '23';
        assocPolicyState.A8_closeMinute = '0';
        assocPolicyState.A8_noTime = false;
      } else if (mode === 'no_time') {
        if (cbA8NoTime) cbA8NoTime.checked = true;
        assocPolicyState.A8_noTime = true;
      } else if (mode === 'mirror') {
        if (cbA8NoTime) cbA8NoTime.checked = false;
        assocPolicyState.A8_noTime = false;
      }
      const isNoTime = (mode === 'no_time' || (cbA8NoTime && cbA8NoTime.checked));
      [openH, openM, closeH, closeM].forEach(el => {
        if (el) el.disabled = isNoTime;
      });
    };

    if (selA8Mode) {
      selA8Mode.addEventListener('change', () => {
        assocPolicyState.A8_operatingHoursMode = selA8Mode.value;
        syncA8UIFromMode(selA8Mode.value);
        markUnsaved();
      });
    }

    [openH, openM, closeH, closeM].forEach(el => {
      if (el) {
        el.addEventListener('change', () => {
          if (selA8Mode && selA8Mode.value !== 'custom') {
            selA8Mode.value = 'custom';
            assocPolicyState.A8_operatingHoursMode = 'custom';
          }
          if (openH) assocPolicyState.A8_openHour = openH.value;
          if (openM) assocPolicyState.A8_openMinute = openM.value;
          if (closeH) assocPolicyState.A8_closeHour = closeH.value;
          if (closeM) assocPolicyState.A8_closeMinute = closeM.value;
          markUnsaved();
        });
      }
    });

    if (cbA8NoTime) {
      cbA8NoTime.addEventListener('change', () => {
        assocPolicyState.A8_noTime = cbA8NoTime.checked;
        if (cbA8NoTime.checked) {
          if (selA8Mode) selA8Mode.value = 'no_time';
          assocPolicyState.A8_operatingHoursMode = 'no_time';
        } else {
          if (selA8Mode) selA8Mode.value = 'standard';
          assocPolicyState.A8_operatingHoursMode = 'standard';
        }
        syncA8UIFromMode(assocPolicyState.A8_operatingHoursMode);
        markUnsaved();
      });
    }
    syncA8UIFromMode(assocPolicyState.A8_operatingHoursMode || 'standard');

    bindAssocField('select-assoc-B5-assembly', 'B5_generalAssemblyCount');
    bindAssocField('select-assoc-C1-C2-need', 'C1_C2_needRating');
    bindAssocField('select-assoc-C3-ev-parking', 'C3_1_evParkingCount');
    bindAssocField('select-assoc-C3-type', 'C3_2_1_parkingType');
    bindAssocField('select-assoc-C3-owner', 'C3_2_2_owner');
    bindAssocField('select-assoc-C3-manager', 'C3_2_3_manager');

    // D1-1 축제 모드 선택 토글
    const selD1_1 = document.getElementById('select-assoc-D1-1-mode');
    const wrapD1_1 = document.getElementById('wrap-assoc-D1-1-custom');
    if (selD1_1) {
      selD1_1.addEventListener('change', () => {
        assocPolicyState.D1_1_festivalMode = selD1_1.value;
        if (wrapD1_1) wrapD1_1.style.display = selD1_1.value === 'custom' ? 'block' : 'none';
        markUnsaved();
      });
    }
    const inputD1_1 = document.getElementById('input-assoc-D1-1-custom');
    if (inputD1_1) {
      inputD1_1.addEventListener('input', () => {
        assocPolicyState.D1_1_festivalCustomName = inputD1_1.value.trim();
        markUnsaved();
      });
    }

    bindAssocField('select-assoc-D1-delivery', 'D1_2_onlineDeliveryService');
    bindAssocField('select-assoc-D1-2-5-item', 'D1_2_5_deliveryItem');
    bindAssocField('select-assoc-E1', 'E1_aiSecuritySystem');
    bindAssocField('select-assoc-F1', 'F1_emptyStoreCount');
    bindAssocField('select-assoc-F5', 'F5_emptyStoreReason');
    bindAssocField('select-assoc-F6', 'F6_emptyStorePolicy');
    bindAssocField('select-assoc-G1', 'G1_overchargeReason');
    bindAssocField('select-assoc-G2', 'G2_overchargeSolution');
    bindAssocField('select-assoc-G3-prog', 'G3_program');
    bindAssocField('select-assoc-G3-famous', 'G3_famousStore');
    bindAssocField('select-assoc-G3-night', 'G3_nightLight');
    bindAssocField('select-assoc-G3-tour', 'G3_tourLink');

    bindAssocField('select-assoc-G4-ownership', 'G4_facilityOwnershipRule');
    bindAssocField('select-assoc-G4-requirement', 'G4_facilityRequirementRule');
    bindAssocField('cb-assoc-cooling-aircon', 'G4_cooling_aircon', true);
    bindAssocField('cb-assoc-cooling-fan', 'G4_cooling_fan', true);
    bindAssocField('cb-assoc-cooling-arcade', 'G4_cooling_arcade', true);
    bindAssocField('cb-assoc-heating-warmair', 'G4_heating_warmAir', true);
    bindAssocField('cb-assoc-flood-pump', 'G4_flood_pump', true);
    bindAssocField('cb-assoc-flood-wall', 'G4_flood_wall', true);

    // H1 조사원 평가 바인딩
    bindAssocField('select-assoc-eval-H1-1', 'eval_H1_1_cleanliness');
    bindAssocField('select-assoc-eval-H1-2', 'eval_H1_2_entrance');
    bindAssocField('select-assoc-eval-H1-3', 'eval_H1_3_parking');
    bindAssocField('select-assoc-eval-H1-4', 'eval_H1_4_floor');
    bindAssocField('cb-assoc-eval-H1-jitter', 'eval_H1_jitter', true);

    // H2 조사원 평가 및 보충설명 연동
    const setupH2Field = (idx, keySelect, keyText) => {
      const sel = document.getElementById(`select-assoc-eval-H2-${idx}`);
      const wrap = document.getElementById(`wrap-assoc-eval-H2-${idx}-text`);
      const txt = document.getElementById(`input-assoc-eval-H2-${idx}-text`);
      if (sel) {
        sel.addEventListener('change', () => {
          assocPolicyState[keySelect] = sel.value;
          if (wrap) wrap.style.display = sel.value === '1' ? 'block' : 'none';
          markUnsaved();
        });
      }
      if (txt) {
        txt.addEventListener('input', () => {
          assocPolicyState[keyText] = txt.value.trim();
          markUnsaved();
        });
      }
    };

    setupH2Field(1, 'eval_H2_1_specialStreet', 'eval_H2_1_customText');
    setupH2Field(2, 'eval_H2_2_specialProduct', 'eval_H2_2_customText');
    setupH2Field(3, 'eval_H2_3_brandMark', 'eval_H2_3_customText');
    setupH2Field(4, 'eval_H2_4_brandUsage', 'eval_H2_4_customText');

    // 5. 상인회 빠른 정책 프리셋 버튼 리스너
    const btnAssocRandom = document.getElementById('btn-assoc-preset-random');
    if (btnAssocRandom) {
      btnAssocRandom.addEventListener('click', () => {
        ['select-assoc-F5', 'select-assoc-F6', 'select-assoc-G1', 'select-assoc-G2'].forEach(id => {
          const sel = document.getElementById(id);
          if (sel) {
            sel.value = 'random';
            sel.dispatchEvent(new Event('change'));
          }
        });
        appendLog('info', '🎲 F5, F6, G1, G2 정책 문항이 [1~5 항목 랜덤 답변]으로 일괄 설정되었습니다.');
      });
    }

    const btnAssocDefault = document.getElementById('btn-assoc-preset-default');
    if (btnAssocDefault) {
      btnAssocDefault.addEventListener('click', () => {
        ['select-assoc-F5', 'select-assoc-F6', 'select-assoc-G1', 'select-assoc-G2'].forEach(id => {
          const sel = document.getElementById(id);
          if (sel) {
            sel.value = '1';
            sel.dispatchEvent(new Event('change'));
          }
        });
        const selA8 = document.getElementById('select-assoc-A8-mode');
        if (selA8) {
          selA8.value = 'standard';
          selA8.dispatchEvent(new Event('change'));
        }
        appendLog('info', '표준 정책 문항이 1번 항목으로 일괄 설정되었습니다.');
      });
    }
  }

  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      // 상인회 전용 블루프린트 분기 (완전 격리)
      const isAssocCampaign = (data.surveyType === 'kstat_assoc' || currentCampaign?.surveyType === 'kstat_assoc');
      if (isAssocCampaign) {
        const bpSection = document.getElementById('section-master-blueprint');
        if (bpSection) {
          bpSection.classList.remove('hidden');
          bpSection.style.display = 'block';
        }
        renderAssocBlueprint(data);
        return;
      }

      // 메트릭스 패널 전용 블루프린트 분기 (완전 격리)
      const isMetrixCampaign = (data.surveyType === 'metrix_panel' || currentCampaign?.surveyType === 'metrix_panel');
      if (isMetrixCampaign) {
        const bpSection = document.getElementById('section-master-blueprint');
        if (bpSection) {
          bpSection.classList.remove('hidden');
          bpSection.style.display = 'block';
        }
        renderMetrixBlueprint(data);
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

  async function saveBaseline(showNotification = true) {
    try {
      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
      }

      const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');
      const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');

      let payload;
      if (isMetrix) {
        syncMetrixInputsToState();
        payload = {
          surveyType: 'metrix_panel',
          policy: metrixPolicyState || {}
        };
      } else if (isAssoc) {
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
        appendLog('success', isMetrix
          ? '✓ 메트릭스 패널조사 기준 가이드라인이 성공적으로 저장되었습니다.'
          : (isAssoc 
            ? '✓ 상인회 25단계 정책 가이드라인(F5~G4)이 성공적으로 저장되었습니다.'
            : '✓ 3개 업종 그룹별 마스터 기준점 및 조사원 평가 가이드(H1~H3)가 성공적으로 저장되었습니다. 24개 쿼터에 적용됩니다.'));
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
    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
    const firstSlot = firstBiz?.surveyUrl || firstBiz?.slotUrl;

    // 1번 쿼터 슬롯 매핑 검증
    if (!firstSlot) {
      if (isMetrix) {
        alert(`⚠️ 1번 쿼터 [${firstBiz?.companyName || '1번 사업체'}]에 메트릭스 설문 URL(surveyUrl)이 존재하지 않습니다.`);
      } else {
        alert(`⚠️ 1번 쿼터 [${firstBiz?.companyName || '1번 점포'}]에 케이스탯 전용 설문 슬롯 URL이 매핑되지 않았습니다.\n\n중복 설문 방지를 위해 모든 쿼터에 고유 슬롯이 매핑되어야 합니다.\n상단의 [🔗 케이스탯 슬롯 1:1 매핑] 버튼을 눌러 슬롯을 매칭한 후 파일럿 검증을 진행해 주세요.`);
        if (typeof window.openSlotModal === 'function') window.openSlotModal();
      }
      return;
    }

    let surveyUrl = firstSlot;
    if (inputSurveyUrl) inputSurveyUrl.value = firstSlot;

    try {
      setRunningState(true);
      openMonitorDrawer();
      resetTimelineChips();
      if (isMetrix) {
        appendLog('info', `🎯 [메트릭스 1번 파일럿 시작] "${firstBiz.companyName}" (UID: ${firstBiz.uid}) 98% 안전 대기 완주를 진행합니다...`);
      } else {
        appendLog('info', `🎯 [1번 단일 검증 시작] "${firstBiz.companyName}" 점포로 Q1부터 Agree.asp까지 안전 완주를 진행합니다... (슬롯: #${firstBiz.slotIndex || 1})`);
      }

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

    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
    const firstQuota = quotaDb.find(b => b.index === 1) || quotaDb[0];
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed' || firstQuota.quotaStatus === '진행중(98%)' || firstQuota.status === '진행중(98%)');
    const startIdx = firstDone ? 2 : 1;

    // 1:1 슬롯 매핑 전수 검증
    const targets = quotaDb.filter(b => (b.index || b.seq) >= startIdx);
    const unmappedTargets = targets.filter(b => !b.slotUrl && !b.surveyUrl);
    if (unmappedTargets.length > 0) {
      if (isMetrix) {
        alert(`⚠️ 실행 대상 패널 ${targets.length}건 중 ${unmappedTargets.length}건에 설문 참여 URL(surveyUrl)이 누락되었습니다.`);
      } else {
        alert(`⚠️ 쿼터와 케이스탯 슬롯이 1:1로 매핑되지 않았습니다!\n(실행 대상 ${targets.length}개 점포 중 ${unmappedTargets.length}개 슬롯 누락)\n\n슬롯이 매핑되지 않은 상태로 실행하면 동일한 설문지에 중복 제출되는 치명적인 오류가 발생합니다.\n상단의 [🔗 케이스탯 슬롯 1:1 매핑] 버튼을 눌러 모든 쿼터에 1:1 슬롯을 매칭한 후 배치를 가동해 주세요.`);
        if (typeof window.openSlotModal === 'function') window.openSlotModal();
      }
      return;
    }

    let surveyUrl = targets[0]?.slotUrl || targets[0]?.surveyUrl || inputSurveyUrl.value.trim();
    const safetyGuard = checkSafetyGuard ? checkSafetyGuard.checked : true;
    
    let confirmMsg;
    if (isMetrix) {
      confirmMsg = safetyGuard
        ? `[메트릭스 패널 54개 대상]\n잔여 ${targets.length}개 사업체에 대해 배치 자동화를 시작합니다.\n\n🛡️ [최종 제출 직전 98% 안전 대기 원칙 적용]\n전 문항 답변, 전자서명 및 간판사진 업로드가 완료된 후 최종 제출 직전(Step 119)에서 정지되어 사용자가 직접 검토/수정할 수 있습니다.\n\n계속 진행하시겠습니까?`
        : `⚠️ 경고: 최종 제출 안전가드가 해제되어 있습니다!\n잔여 ${targets.length}개 사업체가 실제로 최종 제출(100% 완료) 마감 처리됩니다. 계속하시겠습니까?`;
    } else {
      confirmMsg = safetyGuard
        ? `${targets.length}개 대상 슬롯에 대해 배치 자동화를 시작합니다. (각 점포/상인회별 1:1 슬롯, 최종 동의 단계 안전 대기)`
        : `⚠️ 주의: 최종 제출 안전가드가 해제되어 있습니다!\n${targets.length}건의 설문이 각 점포별 1:1 슬롯으로 실제 최종 제출 마감됩니다. 계속하시겠습니까?`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      setRunningState(true);
      openMonitorDrawer();
      if (isMetrix) {
        appendLog('info', `🚀 [메트릭스 배치 가동 시작] ${startIdx}번 패널부터 ${targets.length}건 순차 자동화 실행을 시작합니다... (98% 안전 대기: ${safetyGuard ? 'ON' : 'OFF'})`);
      } else {
        appendLog('info', `🚀 [배치 가동 시작] ${startIdx}번 쿼터부터 ${targets.length}건 1:1 슬롯 고속 자동화 연속 실행을 시작합니다...`);
      }

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
  function renderTimelineChips(isAssoc) {
    const strip = document.getElementById('timeline-chips-strip');
    if (!strip) return;

    if (timelineStepperTitle) {
      timelineStepperTitle.textContent = isAssoc ? '상인회 실태조사 타임라인 (25단계)' : '점포경영 실태조사 타임라인 (15단계)';
    }

    const steps = isAssoc ? [
      'Q1',
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
      'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
      'P21', 'P22', 'P23',
      'Agree'
    ] : [
      'Q1',
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
      'P11', 'P12', 'P13', 'P14',
      'Agree'
    ];

    strip.innerHTML = steps.map(step => {
      const isFinal = (step.toLowerCase() === 'agree');
      return `<span class="step-chip${isFinal ? ' step-chip-final' : ''}" data-step="${step}">${step}</span>`;
    }).join('');

    timelineChips = strip.querySelectorAll('.step-chip');
  }

  function setTimelineStep(stepName) {
    if (!stepName) return;
    const cleanStep = String(stepName).trim();
    if (currentStepLabel) currentStepLabel.textContent = cleanStep;
    let found = false;

    const chips = document.querySelectorAll('#timeline-chips-strip .step-chip');
    chips.forEach(chip => {
      const s = chip.dataset.step;
      if (s && s.toLowerCase() === cleanStep.toLowerCase()) {
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
    const chips = document.querySelectorAll('#timeline-chips-strip .step-chip');
    chips.forEach(chip => chip.className = 'step-chip');
    if (currentStepLabel) currentStepLabel.textContent = '시작 대기';
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
      if (btnPilot) btnPilot.disabled = true;
      btnBatch.disabled = true;
      btnBatch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 배치 진행 중...';
      if (btnRunAllBatchBottom) btnRunAllBatchBottom.disabled = true;
      btnStop.disabled = false;
      btnStop.innerHTML = '<i class="fa-solid fa-stop"></i> 배치 중지';
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
      btnStop.innerHTML = '<i class="fa-solid fa-stop"></i> 배치 중지';
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
          if (Array.isArray(currentCampaign.quotaDatabase)) {
            currentCampaign.quotaDatabase.forEach(q => {
              q.surveyorAccount = loginId;
            });
          }
        }
        if (badgeCurrentKstatAccount) {
          badgeCurrentKstatAccount.innerHTML = `<i class="fa-solid fa-user-check"></i> 연동 계정: <strong>${escapeHtml(loginId)}</strong>`;
        }
        appendLog('success', `✓ Kstat 조사원 계정(${loginId})이 저장되었습니다.`);
        alert(`✓ Kstat 조사원 계정(${loginId})이 성공적으로 저장되었습니다.`);
        await loadCampaign();
      } catch (err) {
        alert('계정 저장 오류: ' + err.message);
      } finally {
        btnSaveKstatAccount.disabled = false;
      }
    });
  }

  // Kstat list.php 상태 실시간 동기화 버튼
  const btnSyncKstatStatus = document.getElementById('btn-sync-kstat-status');
  if (btnSyncKstatStatus) {
    btnSyncKstatStatus.addEventListener('click', async () => {
      if (!currentCampaign?.id) return;
      const originalText = btnSyncKstatStatus.innerHTML;
      btnSyncKstatStatus.disabled = true;
      btnSyncKstatStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kstat 동기화 중...';
      try {
        const res = await fetch(`/api/campaigns/${currentCampaign.id}/sync-kstat-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
          alert(`✓ ${data.message}`);
          appendLog('success', `[Kstat 상태 동기화] ${data.message}`);
        } else {
          alert(`동기화 실패: ${data.error || '알 수 없는 오류'}`);
          appendLog('error', `[Kstat 상태 동기화 오류] ${data.error}`);
        }
      } catch (err) {
        alert(`동기화 요청 오류: ${err.message}`);
        appendLog('error', `[Kstat 상태 동기화 통신 오류] ${err.message}`);
      } finally {
        btnSyncKstatStatus.disabled = false;
        btnSyncKstatStatus.innerHTML = originalText;
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

    const defaultSurveyor = isAssoc ? (currentCampaign?.kstatLoginId || '가온이강윤') : '가온김영옥';
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
        const defaultSurveyor = isAssoc ? (currentCampaign?.kstatLoginId || '가온이강윤') : '가온김영옥';
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

  // 플로팅 모니터링 드로어 제어 함수 및 이벤트 리스너
  function openMonitorDrawer() {
    if (floatingMonitorDrawer) floatingMonitorDrawer.classList.add('is-open');
    if (floatingMonitorLauncher) floatingMonitorLauncher.classList.add('hidden-by-drawer');
    document.body.classList.add('monitor-drawer-open');
  }
  function closeMonitorDrawer() {
    if (floatingMonitorDrawer) floatingMonitorDrawer.classList.remove('is-open');
    if (floatingMonitorLauncher) floatingMonitorLauncher.classList.remove('hidden-by-drawer');
    document.body.classList.remove('monitor-drawer-open');
  }
  function toggleMonitorDrawer() {
    if (floatingMonitorDrawer && floatingMonitorDrawer.classList.contains('is-open')) {
      closeMonitorDrawer();
    } else {
      openMonitorDrawer();
    }
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
