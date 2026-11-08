/**
 * 설문조사 상세 작업실 제어 스크립트 (survey-detail.js)
 * 2-Tier 와이드 쿼터 뷰, 쿼터 항목별 진행 트래커, 2-Phase 파일럿 & 배치 파이프라인 제어
 */
import { escapeHtml } from './modules/blueprint-utils.js';
import { syncMetrixInputsToState, renderMetrixBlueprint } from './modules/blueprint-metrix.js';
import { renderAssocBlueprint } from './modules/blueprint-assoc.js';
import {
  resolveGlobalriAgeGroupKey,
  createGlobalriBlueprintController
} from './modules/blueprint-globalri.js';
import {
  renderKonaBlueprint,
  renderHrcEnergyBlueprint,
  renderGallupReturnFarmBlueprint
} from './modules/blueprint-gallup-hrc-kona.js';
import {
  PRESET_STANDARD,
  PRESET_GROWTH,
  PRESET_TRADITIONAL,
  PRESET_ROTATION,
  renderKstatStoreStages
} from './modules/blueprint-kstat-store.js';
import {
  renderQuotaTableHead,
  renderEmptyQuotaTableRow,
  renderGallupQuotaTable,
  renderGlobalriQuotaTable,
  renderHrcEnergyQuotaTable,
  renderKonaQuotaTable,
  renderMetrixQuotaTable,
  renderAssocQuotaTable
} from './modules/quota-table-renderers.js';

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
    const isKona = (camp.surveyType === 'kona_youth');
    const isHrcEnergy = (camp.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (camp.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (camp.surveyType === 'gallup_return_farm');

    // 배지 상태
    statusBadge.className = `badge-status ${camp.status || 'ready'}`;
    statusBadge.textContent = camp.status === 'running' ? '실행 중' : (camp.status === 'completed' ? '완료' : '준비 완료');

    if (quotaBadge) {
      if (isGallupReturnFarm) {
        const qList = camp.quotaDatabase || [];
        const doneCnt = qList.filter(q => q.quotaStatus === 'completed' || q.status === '조사완료').length;
        const waitCnt = qList.filter(q => q.quotaStatus === 'pilot_done' || String(q.status || '').includes('완료직전')).length;
        quotaBadge.className = 'badge-quota-type b2c';
        quotaBadge.textContent = `한국갤럽 귀농실태조사 (선정 ${qList.length}명 · 완료 ${doneCnt} · 완료직전대기 ${waitCnt})`;
      } else if (isGlobalriLiteracy) {
        quotaBadge.className = 'badge-quota-type b2c';
        quotaBadge.textContent = `성인문해능력조사 (진행중 ${(camp.quotaDatabase || []).length}명 · 나이대별 가이드)`;
      } else if (isHrcEnergy) {
        const selCnt = (camp.quotaDatabase || []).filter(q => q.selectionType === '선정').length;
        quotaBadge.className = 'badge-quota-type b2b';
        quotaBadge.textContent = `에너지총조사 [건물] (선정 ${selCnt}건 / 기입력 보존)`;
      } else if (isKona) {
        quotaBadge.className = 'badge-quota-type b2c';
        quotaBadge.textContent = '청소년 만족도 (40문항/53단계)';
      } else if (isMetrix) {
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
    const defaultSurveyor = isGallupReturnFarm
      ? `${camp.loginId || '076_000009'} (${camp.surveyorName || '백영자'})`
      : (isGlobalriLiteracy
        ? `${camp.loginId || '01071447791'} (${camp.surveyorName || '노영미7791'})`
        : (isHrcEnergy
          ? `${camp.loginId || '700275'} (${camp.surveyorName || ''})`
          : (isKona ? '코나체인(익명)' : (isAssoc ? (camp.kstatLoginId || '가온이강윤') : '가온김영옥'))));
    const inputKstatAccountId = document.getElementById('input-kstat-account-id');
    const inputKstatAccountPw = document.getElementById('input-kstat-account-pw');
    const badgeCurrentKstatAccount = document.getElementById('badge-current-kstat-account');
    if (inputKstatAccountId) inputKstatAccountId.value = camp.loginId || camp.kstatLoginId || defaultSurveyor;
    if (inputKstatAccountPw) inputKstatAccountPw.value = camp.loginPw || camp.kstatLoginPw || '1234';
    if (badgeCurrentKstatAccount) {
      badgeCurrentKstatAccount.innerHTML = `<i class="fa-solid fa-user-check"></i> 연동 계정: <strong>${escapeHtml(camp.loginId || camp.kstatLoginId || defaultSurveyor)}</strong>`;
    }

    // STEP 2 헤더 문구 동적 커스터마이징
    const step2TitleEl = document.querySelector('#section-master-blueprint .step-card-title');
    const step2DescEl = document.querySelector('#section-master-blueprint .font-caption.text-dim');
    if (isGallupReturnFarm) {
      if (step2TitleEl) step2TitleEl.textContent = '2026년 귀농귀촌 실태조사(귀농) · 4대 자동화 검증 규칙 및 전자서명 필체 다변화 가이드';
      if (step2DescEl) step2DescEl.textContent = '1) 홍천군 읍·면별 브라우저 GPS 강제 주입, 2) 방문기록 입력 검증 규칙 준수, 3) 답례품 인수증 전자서명 8종 필체 다변화, 4) 최종 제출 직전(Page 118) 안전 대기 정책을 설정합니다.';
    } else if (isGlobalriLiteracy) {
      if (step2TitleEl) step2TitleEl.textContent = '제5차 성인문해능력조사 나이대별(20대~70대+) 그룹 응답 가이드 설정';
      if (step2DescEl) step2DescEl.textContent = '조사 대상자의 출생연도(나이대)에 따라 문해력 목표 점수(Part A~C), 문해력 자가진단(D5), 문해교육 수요(Part E), 학력·경제활동·소득(Part F) 가이드를 그룹별로 설정합니다.';
    } else if (isHrcEnergy) {
      if (step2TitleEl) step2TitleEl.textContent = '2025년 기준 에너지총조사 [건물 부문] 응답 규칙 및 기입력 보존 정책';
      if (step2DescEl) step2DescEl.textContent = '한국리서치 TAPI(2026-89-0342C) 건물 기본정보 및 본설문(A1~E1-5) 자동화 규칙입니다. 이미 입력되어 있는 모든 항목은 절대 수정하지 않고 100% 그대로 보존합니다.';
    } else if (isKona) {
      if (step2TitleEl) step2TitleEl.textContent = '화성특례시 만족도 청소년 설문조사 기준점 및 응답 규칙 (40문항/53단계 전수)';
      if (step2DescEl) step2DescEl.textContent = '코나체인 리서치 청소년 설문 1~40번 문항(조건부 하위 문항 포함 총 53단계) 확률 분포 및 제출 직전 스크린샷 규칙을 확인합니다.';
    } else if (isAssoc) {
      if (step2TitleEl) step2TitleEl.textContent = '상인회 실태조사 기준점 및 가이드라인 검토 (25단계 전수)';
      if (step2DescEl) step2DescEl.textContent = '케이스탯 상인회 실태조사 1~25단계 구조 및 기본 응답 규칙을 확인하고 조정합니다.';
    } else {
      if (step2TitleEl) step2TitleEl.textContent = '마스터 설문조사 & 조사원 평가 기준점 검토 (17단계 전수)';
      if (step2DescEl) step2DescEl.textContent = '케이스탯 본 설문 1~16단계 및 조사원 평가 17단계 구조가 전수 복제되었습니다.';
    }

    // 실시간 모니터링 레이어 타임라인 칩 & 제목 동적 렌더링
    renderTimelineChips(isAssoc, isGallupReturnFarm);

    // STEP 3 캡처 버튼 문구 동적화
    const btnViewPilotCaptures = document.getElementById('btn-view-pilot-captures');
    if (btnViewPilotCaptures) {
      btnViewPilotCaptures.textContent = isGallupReturnFarm ? '단계별 설문 캡처 보기' : (isGlobalriLiteracy ? '단계별 설문 캡처 보기' : (isHrcEnergy ? '설문 완료 캡처 보기' : (isKona ? '제출 직전 캡처 보기' : (isAssoc ? '25단계 캡처 전체보기' : '15단계 캡처 전체보기'))));
    }

    // 대상 설문 요약 스트립 동적화
    const labelExecTargetMarket = document.getElementById('label-exec-target-market');
    if (labelExecTargetMarket) {
      labelExecTargetMarket.textContent = isGallupReturnFarm
        ? `[20263603] 2026년 귀농귀촌 실태조사(귀농) - 강원 홍천군 (${camp.loginId || '076_000009'} ${camp.surveyorName || '백영자'})`
        : (isGlobalriLiteracy
          ? `[GR20260618-1-001-02] 제5차 성인문해능력조사 (${camp.loginId || '01071447791'} ${camp.surveyorName || '노영미7791'})`
          : (isHrcEnergy
            ? `2026-89-0342C 2025년 기준 에너지총조사 [건물 부문] (${camp.loginId || ''} ${camp.surveyorName || ''})`
            : (isKona
              ? '2026 화성특례시 만족도 청소년 설문조사 (코나체인 Event 2085)'
              : (isMetrix
                ? '2026 경기도 소상공인 사업체패널조사 (메트릭스 SNUM 622)'
                : (isAssoc ? '2026 전통시장 및 상점가 실태조사 (상인회)' : '2026 전통시장 및 점포경영 실태조사')))));
    }
    const badgeBlueprintStatus = document.getElementById('badge-blueprint-status');
    if (badgeBlueprintStatus) {
      badgeBlueprintStatus.innerHTML = isGallupReturnFarm
        ? '<i class="fa-solid fa-location-crosshairs"></i> 홍천군 GPS 주입 · 8종 전자서명 · Page 118 완료직전 정지 활성'
        : (isGlobalriLiteracy
          ? '<i class="fa-solid fa-layer-group"></i> 나이대별(20대~70대+) 6개 그룹 가이드 활성'
          : (isHrcEnergy
            ? '<i class="fa-solid fa-shield-halved"></i> 기입력 항목 100% 보존 &amp; 증빙 자동 생략'
            : (isKona
              ? '<i class="fa-solid fa-check-double"></i> 40문항/53단계 기준점 연동 완료'
              : (isMetrix
                ? '<i class="fa-solid fa-check-double"></i> 120단계 기준점 연동 완료'
                : (isAssoc ? '<i class="fa-solid fa-check-double"></i> 25단계 기준점 연동 완료' : '<i class="fa-solid fa-check-double"></i> 17단계 기준점 연동 완료')))));
    }
    const badgeExecEngine = document.getElementById('badge-exec-engine');
    if (badgeExecEngine) {
      badgeExecEngine.textContent = isGallupReturnFarm
        ? '한국갤럽 G-CAII (20263603)'
        : (isGlobalriLiteracy
          ? '글로벌리서치 온서베이 (SNUM 5963)'
          : (isHrcEnergy
            ? '한국리서치 TAPI 전용'
            : (isKona ? '코나체인 리서치 전용' : (isMetrix ? '메트릭스 패널 전용' : (isAssoc ? '케이스탯 상인회 전용' : '케이스탯 TAPI 전용')))));
    }
    const execSurveyorLabel = document.getElementById('exec-surveyor-label');
    if (execSurveyorLabel) {
      execSurveyorLabel.textContent = isGallupReturnFarm
        ? `${camp.loginId || '076_000009'} (${camp.surveyorName || '백영자'})`
        : (isGlobalriLiteracy
          ? `${camp.loginId || '01071447791'} (${camp.surveyorName || '노영미7791'})`
          : (isHrcEnergy
            ? `${camp.loginId || '700275'} (${camp.surveyorName || '조사원'})`
            : (isKona ? '동탄구 청소년 (6001~6103)' : (isMetrix ? (camp.loginId || '강영미') : (isAssoc ? (camp.kstatLoginId || '가온이강윤') : (camp.kstatLoginId || '가온김영옥'))))));
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

    // 귀농실태조사 / 성인문해능력조사 / 에너지총조사 / 코나체인 청소년 / 메트릭스 모드 시 Kstat 전용 버튼 제어 및 STEP 3 스트립 갱신
    const btnOpenSlotModalToolbar = document.getElementById('btn-open-slot-modal');
    const btnOpenCampaignAddMerchant = document.getElementById('btn-open-campaign-add-merchant');
    if (isGallupReturnFarm) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'none';
      if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.style.display = 'none';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) {
        btnSyncKstat.style.display = 'inline-flex';
        btnSyncKstat.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 한국갤럽(20263603) 실시간 상태 동기화';
        let btnExportAns = document.getElementById('btn-export-globalri-answers-top');
        const gsheetUrl = camp.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1Hoai6ggQWxNVTW5SyxEsvpNtMOlBO1z_ThmM6cZ6gRg/edit?gid=1470110969#gid=1470110969';
        if (!btnExportAns && btnSyncKstat.parentElement) {
          btnExportAns = document.createElement('a');
          btnExportAns.id = 'btn-export-globalri-answers-top';
          btnExportAns.className = 'btn-pill btn-pill-primary font-bold';
          btnExportAns.style.textDecoration = 'none';
          btnExportAns.target = '_blank';
          btnExportAns.rel = 'noopener noreferrer';
          btnSyncKstat.parentElement.insertBefore(btnExportAns, btnSyncKstat.nextSibling);
        }
        if (btnExportAns) {
          btnExportAns.href = gsheetUrl;
          btnExportAns.target = '_blank';
          btnExportAns.rel = 'noopener noreferrer';
          btnExportAns.innerHTML = '<i class="fa-solid fa-table"></i> 선정명단 구글 스프레드시트 열기';
          btnExportAns.title = '2026년 귀농귀촌 실태조사(귀농) 강원 홍천군 선정명단(70명) 구글 스프레드시트를 엽니다';
          btnExportAns.style.display = 'inline-flex';
        }
      }
      if (btnEnrichCampaign) btnEnrichCampaign.style.display = 'none';
      const kstatPill = document.getElementById('badge-kstat-account-pill');
      if (kstatPill) {
        const qList = camp.quotaDatabase || [];
        const doneCnt = qList.filter(q => q.quotaStatus === 'completed' || q.status === '조사완료').length;
        const waitCnt = qList.filter(q => q.quotaStatus === 'pilot_done' || String(q.status || '').includes('완료직전')).length;
        kstatPill.innerHTML = `<i class="fa-solid fa-location-crosshairs text-primary-color"></i> <span>면접원: <strong>${escapeHtml(camp.loginId || '076_000009')} (${escapeHtml(camp.surveyorName || '백영자')})</strong> · 강원 홍천군 <strong>${qList.length}명</strong> (완료 ${doneCnt} · 완료직전대기 ${waitCnt})</span>`;
      }

      const badgeExec = document.getElementById('badge-exec-engine');
      if (badgeExec) {
        badgeExec.className = 'badge-status ready font-bold';
        badgeExec.textContent = '한국갤럽 G-CAII (Page 1~118 완료직전)';
      }
      const labelMarket = document.getElementById('label-exec-target-market');
      if (labelMarket) {
        labelMarket.textContent = camp.title || '[20263603] 2026년 귀농귀촌 실태조사(귀농) - 강원 홍천군';
      }
      const labelSurveyor = document.getElementById('exec-surveyor-label');
      if (labelSurveyor) {
        labelSurveyor.textContent = `${camp.loginId || '076_000009'} (${camp.surveyorName || '백영자'})`;
      }
      const slotCountLabel = document.getElementById('exec-slot-count-label');
      if (slotCountLabel) {
        slotCountLabel.textContent = `선정명단 ${(camp.quotaDatabase || []).length}명 장착 완료`;
      }
      const badgeBp = document.getElementById('badge-blueprint-status');
      if (badgeBp) {
        badgeBp.className = 'badge-status badge-blueprint ready';
        badgeBp.innerHTML = '<i class="fa-solid fa-signature text-success"></i> 홍천군 GPS · 방문기록 · 8종 전자서명 · Page 118 정지 활성';
      }

      const titleBatch = document.getElementById('title-batch-automation');
      if (titleBatch) {
        titleBatch.textContent = `2026년 귀농귀촌 실태조사(귀농) 선택 대상자 일괄 자동 진행 (완료 직전 Page 118 대기)`;
      }
      const descBatch = document.getElementById('desc-batch-automation');
      if (descBatch) {
        descBatch.textContent = '1) 대상자 주소지(홍천군 10개 읍·면) 브라우저 GPS 위치정보 강제 주입, 2) 방문 기록 검증 규칙(07~22시·컨택성공) 준수, 3) 답례품 인수증 전자서명 패드(Page 7) 8종 한글 필체 다변화, 4) 최종 제출하지 않고 Page 118(NAME·PHONE·ADDR) 저장 후 완료 직전 상태에서 정지합니다.';
      }
      const safetyGuardToggle = document.querySelector('.safety-guard-toggle span');
      if (safetyGuardToggle) {
        safetyGuardToggle.textContent = '최종 제출([조사완료]) 클릭 직전 Page 118에서 자동 정지 (검토 후 수기 완료 가능 · 필수 권장)';
      }
      if (checkSafetyGuard) {
        checkSafetyGuard.checked = true;
      }

      if (btnPilot) {
        btnPilot.classList.remove('d-none');
        btnPilot.className = 'btn-action-secondary font-bold';
        btnPilot.style.display = 'inline-flex';
        btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 미완료 대상자 1건 완료 직전(Page 118)까지 단건 실행';
      }
    } else if (isGlobalriLiteracy) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'none';
      if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.style.display = 'none';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) {
        btnSyncKstat.style.display = 'inline-flex';
        btnSyncKstat.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 글로벌리서치 GIFT 동기화 / LID 지정 필터';
        let btnExportAns = document.getElementById('btn-export-globalri-answers-top');
        const gsheetUrl = camp.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?usp=sharing';
        if (!btnExportAns && btnSyncKstat.parentElement) {
          btnExportAns = document.createElement('a');
          btnExportAns.id = 'btn-export-globalri-answers-top';
          btnExportAns.className = 'btn-pill btn-pill-primary font-bold';
          btnExportAns.style.textDecoration = 'none';
          btnExportAns.target = '_blank';
          btnExportAns.rel = 'noopener noreferrer';
          btnExportAns.innerHTML = '<i class="fa-solid fa-table"></i> 제출 문항·답변 구글 스프레드시트 열기';
          btnExportAns.title = '제출된 Part A ~ Part C 문항과 답변, 공식 정답표, 채점 결과가 기록되는 구글 스프레드시트를 엽니다';
          btnSyncKstat.parentElement.insertBefore(btnExportAns, btnSyncKstat.nextSibling);
        }
        if (btnExportAns) {
          btnExportAns.href = gsheetUrl;
          btnExportAns.target = '_blank';
          btnExportAns.rel = 'noopener noreferrer';
          btnExportAns.style.display = 'inline-flex';
        }
      }
      if (btnEnrichCampaign) btnEnrichCampaign.style.display = 'none';
      const kstatPill = document.getElementById('badge-kstat-account-pill');
      if (kstatPill) {
        const qList = camp.quotaDatabase || [];
        const hhCnt = new Set(qList.map(q => q.lid)).size;
        kstatPill.innerHTML = `<i class="fa-solid fa-book-open-reader text-primary-color"></i> <span>면접원: <strong>${escapeHtml(camp.loginId || '01071447791')} (${escapeHtml(camp.surveyorName || '노영미7791')})</strong> · 완료가구 <strong>${hhCnt}가구</strong> · 대상 <strong>${qList.length}명</strong> (Part C 완료 후 D1 수기전환)</span>`;
      }

      const badgeExec = document.getElementById('badge-exec-engine');
      if (badgeExec) {
        badgeExec.className = 'badge-status ready font-bold';
        badgeExec.textContent = '글로벌리서치 온서베이 (Part A~C 자동화)';
      }
      const labelMarket = document.getElementById('label-exec-target-market');
      if (labelMarket) {
        labelMarket.textContent = camp.title || '[GR20260618-1-001-02] 제5차 성인문해능력조사';
      }
      const labelSurveyor = document.getElementById('exec-surveyor-label');
      if (labelSurveyor) {
        labelSurveyor.textContent = `${camp.loginId || '01071447791'} (${camp.surveyorName || '노영미7791'})`;
      }
      const slotCountLabel = document.getElementById('exec-slot-count-label');
      if (slotCountLabel) {
        slotCountLabel.textContent = `진행중 대상자 ${(camp.quotaDatabase || []).length}명 장착 완료`;
      }
      const badgeBp = document.getElementById('badge-blueprint-status');
      if (badgeBp) {
        badgeBp.className = 'badge-status badge-blueprint ready';
        badgeBp.innerHTML = '<i class="fa-solid fa-layer-group text-success"></i> 나이대별(20대·50대·60대·70대+) Part A~C 가이드 활성';
      }

      const titleBatch = document.getElementById('title-batch-automation');
      if (titleBatch) {
        titleBatch.textContent = `제5차 성인문해능력조사 대상자(${(camp.quotaDatabase || []).length}명) Part A~C 자동 진행 & 구글 스프레드시트 기록`;
      }
      const descBatch = document.getElementById('desc-batch-automation');
      if (descBatch) {
        descBatch.textContent = '조사 대상자의 나이대 그룹 가이드에 맞춰 Part A(선별) ~ Part B(기초) ~ Part C(심화 C1~C20 및 END_C 채점 저장)까지만 자동 완료하고 D1 진입 시 수기 진행을 위해 자동 정지하며, 제출 문항·답변을 구글 스프레드시트에 기록합니다.';
      }
      const safetyGuardToggle = document.querySelector('.safety-guard-toggle span');
      if (safetyGuardToggle) {
        safetyGuardToggle.textContent = 'Part C 채점 저장(END_C) 완료 직후 D1에서 자동 정지 (Part D 이후 면접원 수기 진행 · 권장)';
      }
      if (checkSafetyGuard) {
        checkSafetyGuard.checked = true;
      }

      if (btnPilot) {
        btnPilot.classList.remove('d-none');
        btnPilot.className = 'btn-action-secondary font-bold';
        btnPilot.style.display = 'inline-flex';
        btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 미완료 대상자 1건 Part C까지 실행 (D1 수기대기)';
      }
    } else if (isHrcEnergy) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'none';
      if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.style.display = 'none';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) {
        btnSyncKstat.style.display = 'inline-flex';
        btnSyncKstat.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 한국리서치 TAPI 실시간 상태 동기화';
      }
      if (btnEnrichCampaign) btnEnrichCampaign.style.display = 'none';
      const kstatPill = document.getElementById('badge-kstat-account-pill');
      if (kstatPill) {
        const selCount = (camp.quotaDatabase || []).filter(q => q.selectionType === '선정').length;
        const subCount = (camp.quotaDatabase || []).filter(q => q.selectionType === '대체').length;
        kstatPill.innerHTML = `<i class="fa-solid fa-bolt text-primary-color"></i> <span>조사원: <strong>${escapeHtml(camp.loginId || '700275')} (${escapeHtml(camp.surveyorName || '')})</strong> · 선정 <strong>${selCount}건</strong> / 대체 <strong>${subCount}건</strong> (기입력 100% 보존)</span>`;
      }

      const badgeExec = document.getElementById('badge-exec-engine');
      if (badgeExec) {
        badgeExec.className = 'badge-status ready font-bold';
        badgeExec.textContent = '한국리서치 TAPI (2026-89-0342C)';
      }
      const labelMarket = document.getElementById('label-exec-target-market');
      if (labelMarket) {
        labelMarket.textContent = camp.title || '2025년 기준 에너지총조사 [건물 부문]';
      }
      const labelSurveyor = document.getElementById('exec-surveyor-label');
      if (labelSurveyor) {
        labelSurveyor.textContent = `${camp.loginId || '700275'} (${camp.surveyorName || ''})`;
      }
      const slotCountLabel = document.getElementById('exec-slot-count-label');
      if (slotCountLabel) {
        const selCount = (camp.quotaDatabase || []).filter(q => q.selectionType === '선정').length;
        slotCountLabel.textContent = `선정 ${selCount}건 / 전체 ${(camp.quotaDatabase || []).length}건 장착`;
      }
      const badgeBp = document.getElementById('badge-blueprint-status');
      if (badgeBp) {
        badgeBp.className = 'badge-status badge-blueprint ready';
        badgeBp.innerHTML = '<i class="fa-solid fa-shield-halved text-success"></i> 기입력 항목 100% 보존 &amp; 대체쿼터 자동승계 활성';
      }

      const titleBatch = document.getElementById('title-batch-automation');
      if (titleBatch) {
        const selCount = (camp.quotaDatabase || []).filter(q => q.selectionType === '선정').length;
        titleBatch.textContent = `에너지총조사 [건물] 선정 쿼터(${selCount}건) 순차 배치 자동화 (기입력 보존)`;
      }
      const descBatch = document.getElementById('desc-batch-automation');
      if (descBatch) {
        descBatch.textContent = '기존에 이미 입력되어 있는 항목은 절대 건드리지 않고 보존하며, [선정] 쿼터를 우선 완료(100% 조사완료)합니다. 진행 불가 시 동일 표본층(Cell)의 [대체] 쿼터로 자동 승계합니다.';
      }
      const safetyGuardToggle = document.querySelector('.safety-guard-toggle span');
      if (safetyGuardToggle) {
        safetyGuardToggle.textContent = '91% 마지막 문항(E1-5)에서 완료 보류 (체크 해제 시 100% 조사완료까지 즉시 완료 권장)';
      }
      if (checkSafetyGuard) {
        checkSafetyGuard.checked = false;
      }

      if (btnPilot) {
        btnPilot.classList.remove('d-none');
        btnPilot.className = 'btn-action-secondary font-bold';
        btnPilot.style.display = 'inline-flex';
        btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 1번 미완료 선정 쿼터 단건 실행 (100% 완료)';
      }
    } else if (isKona) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'none';
      if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.style.display = 'none';
      const btnSyncKstat = document.getElementById('btn-sync-kstat-status');
      if (btnSyncKstat) btnSyncKstat.style.display = 'none';
      if (btnEnrichCampaign) btnEnrichCampaign.style.display = 'none';
      const kstatPill = document.getElementById('badge-kstat-account-pill');
      if (kstatPill) {
        kstatPill.innerHTML = '<i class="fa-solid fa-camera text-primary-color"></i> <span>방식: <strong>단일 URL 재진입 &amp; 제출 직전 캡처</strong> (IDX 6001~6103)</span>';
      }

      const badgeExec = document.getElementById('badge-exec-engine');
      if (badgeExec) {
        badgeExec.className = 'badge-status ready font-bold';
        badgeExec.textContent = '코나체인 리서치 (Event 2085)';
      }
      const labelMarket = document.getElementById('label-exec-target-market');
      if (labelMarket) {
        labelMarket.textContent = camp.title || '화성특례시 만족도 청소년 설문조사';
      }
      const labelSurveyor = document.getElementById('exec-surveyor-label');
      if (labelSurveyor) {
        labelSurveyor.textContent = '동탄1~9동 청소년';
      }
      const slotCountLabel = document.getElementById('exec-slot-count-label');
      if (slotCountLabel) {
        slotCountLabel.textContent = `${(camp.quotaDatabase || []).length}명 명단 장착 완료`;
      }
      const badgeBp = document.getElementById('badge-blueprint-status');
      if (badgeBp) {
        badgeBp.className = 'badge-status badge-blueprint ready';
        badgeBp.innerHTML = '<i class="fa-solid fa-camera text-success"></i> 40문항 규칙 &amp; 제출 직전 캡처 연동 완료';
      }

      const titleBatch = document.getElementById('title-batch-automation');
      if (titleBatch) titleBatch.textContent = '화성특례시 청소년 설문 102명(6002~6103) 순차 배치 자동화';
      const descBatch = document.getElementById('desc-batch-automation');
      if (descBatch) {
        descBatch.textContent = '매 회차 깨끗한 브라우저 세션으로 코나체인 설문에 진입하여 1~40번(하위 포함 53단계) 응답을 주입하고, 제출하기 직전 스크린샷을 저장한 뒤 제출합니다.';
      }
      const safetyGuardToggle = document.querySelector('.safety-guard-toggle span');
      if (safetyGuardToggle) {
        safetyGuardToggle.textContent = '제출 직전 안전 대기 (체크 해제 시 제출 직전 스크린샷 촬영 후 실제 최종 제출 완료)';
      }
      if (checkSafetyGuard) {
        checkSafetyGuard.checked = false;
      }

      if (btnPilot) {
        btnPilot.classList.remove('d-none');
        btnPilot.className = 'btn-action-secondary font-bold';
        btnPilot.style.display = 'inline-flex';
        btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 1번 미완료 항목 파일럿 검증 (제출 보류)';
      }
    } else if (isMetrix) {
      if (btnOpenBindSlots) btnOpenBindSlots.style.display = 'none';
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'none';
      if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.style.display = 'none';
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
      if (btnOpenSlotModalToolbar) btnOpenSlotModalToolbar.style.display = 'inline-flex';
      if (btnOpenCampaignAddMerchant) {
        btnOpenCampaignAddMerchant.style.display = isAssoc ? 'none' : 'inline-flex';
      }
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
    if (!isAssoc && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) updateGroupStatsUI();
  }

  let checkedGallupSeqs = new Set();
  let gallupSelectionInitialized = false;
  let checkedGlobalriSeqs = new Set();
  let globalriSelectionInitialized = false;

  const globalriCtrl = createGlobalriBlueprintController({
    campId,
    getCurrentCampaign: () => currentCampaign,
    setCurrentCampaign: (camp) => { currentCampaign = camp; },
    getCheckedGlobalriSeqs: () => checkedGlobalriSeqs,
    getBlueprintStageGrid: () => blueprintStageGrid,
    getBadgeMasterStatus: () => badgeMasterStatus,
    getBtnSaveBaseline: () => btnSaveBaseline,
    onRenderQuotaTable: (db) => renderQuotaTable(db),
    onMarkUnsaved: () => markUnsaved(),
    onAppendLog: (level, msg) => appendLog(level, msg),
    onTriggerBatchRun: () => triggerBatchRun()
  });

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
    const isHrcEnergy = (currentCampaign.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (currentCampaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (currentCampaign.surveyType === 'gallup_return_farm');
    const firstQuota = quotaDb.find(b => b.index === 1) || quotaDb[0];
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed');

    // 2번 이상의 잔여 쿼터들
    const remainingQuotas = quotaDb.filter(b => b.index >= 2);
    const allRemainingDone = remainingQuotas.length > 0 && remainingQuotas.every(b => b.quotaStatus === 'completed' || b.quotaStatus === 'pilot_done');
    const isRunning = currentCampaign.status === 'running' || statusIndicator.classList.contains('running');

    // 프로그레스 바 동기화
    if (isHrcEnergy) {
      const selQuotas = quotaDb.filter(b => b.selectionType === '선정');
      const selDone = selQuotas.filter(b => b.quotaStatus === 'completed' || b.status === '완료').length;
      updateBatchProgressBar(selDone, selQuotas.length || quotaDb.length);
    } else {
      const completedOrPilotCount = quotaDb.filter(b => b.quotaStatus === 'completed' || b.quotaStatus === 'pilot_done').length;
      updateBatchProgressBar(completedOrPilotCount, quotaDb.length);
    }

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
        if (isGallupReturnFarm) {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint ready';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-location-crosshairs text-success"></i> 홍천군 GPS 주입 · 8종 전자서명 · Page 118 완료직전 정지 활성';
        } else if (isGlobalriLiteracy) {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint ready';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-layer-group text-success"></i> 나이대별(20대~70대+) 6개 그룹 가이드 활성';
        } else if (isHrcEnergy) {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint ready';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-shield-halved text-success"></i> 기입력 항목 100% 보존 &amp; 대체쿼터 자동승계 활성';
        } else if (currentCampaign.masterBaseline) {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint ready';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-check-circle"></i> 마스터 기준점 설정 완료';
        } else {
          badgeBlueprintStatus.className = 'badge-status badge-blueprint';
          badgeBlueprintStatus.innerHTML = '<i class="fa-solid fa-clock"></i> 블루프린트 기준점 대기';
        }
      }

      // 2) 1번 단일 검증 버튼 (호환용)
      const isMetrix = (currentCampaign.surveyType === 'metrix_panel');
      const isKona = (currentCampaign.surveyType === 'kona_youth');
      if (btnPilot) {
        if (isGallupReturnFarm) {
          btnPilot.disabled = false;
          btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 미완료 대상자 1건 완료 직전(Page 118)까지 단건 실행';
        } else if (isGlobalriLiteracy) {
          btnPilot.disabled = false;
          btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 1번 미완료 대상자 Part C까지 실행 (D1 수기대기)';
        } else if (isHrcEnergy) {
          btnPilot.disabled = false;
          btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 미완료 선정 쿼터 1건 검증 실행 (100% 완료)';
        } else if (isKona) {
          btnPilot.disabled = false;
          btnPilot.innerHTML = '<i class="fa-solid fa-flask"></i> 1번 미완료 항목 파일럿 검증 (제출 보류)';
        } else if (isMetrix) {
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
      if (isGallupReturnFarm) {
        const doneCount = quotaDb.filter(b => b.quotaStatus === 'completed' || b.status === '조사완료' || b.quotaStatus === 'pilot_done').length;
        const allCompleted = quotaDb.length > 0 && quotaDb.every(b => b.quotaStatus === 'completed' || b.status === '조사완료');
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.innerHTML = `<i class="fa-solid fa-circle-check"></i> 선정명단 ${quotaDb.length}명 전체 조사 마감 완료 (100%)`;
        } else {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-success flex-1 font-bold';
          btnBatch.innerHTML = `<i class="fa-solid fa-play"></i> 체크한 대상자 일괄 배치 자동화 가동 (완료 직전 Page 118까지 · ${doneCount}/${quotaDb.length} 진행)`;
          if (btnRunAllBatchBottom) {
            btnRunAllBatchBottom.disabled = false;
            btnRunAllBatchBottom.innerHTML = '<i class="fa-solid fa-rocket"></i> 체크한 대상자 일괄 배치 가동 (Page 118 완료직전까지)';
          }
        }
      } else if (isGlobalriLiteracy) {
        const doneCount = quotaDb.filter(b => b.quotaStatus === 'completed' || b.status === '완료' || b.quotaStatus === 'pilot_done').length;
        const allCompleted = quotaDb.length > 0 && quotaDb.every(b => b.quotaStatus === 'completed' || b.status === '완료');
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.innerHTML = `<i class="fa-solid fa-circle-check"></i> 진행중 대상자 ${quotaDb.length}명 전체 배치 마감 완료 (100%)`;
        } else {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-success flex-1 font-bold';
          btnBatch.innerHTML = `<i class="fa-solid fa-play"></i> 성인문해능력조사 나이대별 배치 자동화 가동 (${doneCount}/${quotaDb.length} 진행)`;
          if (btnRunAllBatchBottom) {
            btnRunAllBatchBottom.disabled = false;
            btnRunAllBatchBottom.innerHTML = '<i class="fa-solid fa-rocket"></i> 나이대별 가이드로 전체 배치 가동';
          }
        }
      } else if (isHrcEnergy) {
        const selQuotas = quotaDb.filter(b => b.selectionType === '선정');
        const targetList = selQuotas.length > 0 ? selQuotas : quotaDb;
        const doneCount = targetList.filter(b => b.quotaStatus === 'completed' || b.status === '완료').length;
        const allCompleted = targetList.length > 0 && doneCount >= targetList.length;
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.innerHTML = `<i class="fa-solid fa-circle-check"></i> 선정 쿼터 ${targetList.length}건 전체 배치 자동화 마감 완료 (100%)`;
        } else {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-success flex-1 font-bold';
          btnBatch.innerHTML = `<i class="fa-solid fa-play"></i> 선정 쿼터 순차 배치 자동화 가동 (${doneCount}/${targetList.length} 완료 · 기입력 보존)`;
        }
      } else if (isKona) {
        const allCompleted = quotaDb.length > 0 && quotaDb.every(b => b.quotaStatus === 'completed' || b.status === '완료');
        if (allCompleted) {
          btnBatch.disabled = true;
          btnBatch.innerHTML = '<i class="fa-solid fa-circle-check"></i> 전체 103명 배치 자동화 최종 마감 완료 (100%)';
        } else {
          btnBatch.disabled = false;
          btnBatch.className = 'btn-action-success flex-1 font-bold';
          const doneCount = quotaDb.filter(b => b.quotaStatus === 'completed' || b.status === '완료').length;
          btnBatch.innerHTML = `<i class="fa-solid fa-play"></i> 미완료 청소년 명단 순차 배치 가동 (${doneCount}/${quotaDb.length} 완료)`;
        }
      } else if (isMetrix) {
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
    const isHrcEnergy = (currentCampaign?.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (currentCampaign?.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (currentCampaign?.surveyType === 'gallup_return_farm');
    let ready = 0;
    let pilot = 0;
    let completed = 0;
    let mappedSlots = 0;

    db.forEach(item => {
      const st = item.quotaStatus || item.status || 'ready';
      if (st === 'pilot_done' || st === '진행중(98%)' || String(st).includes('98%') || String(st).includes('F05_2') || String(st).includes('완료직전')) pilot++;
      else if (st === 'completed' || st === '완료' || st === '조사완료') completed++;
      else ready++;

      if (item.slotUrl || item.surveyUrl || item.householdUrl) mappedSlots++;
    });

    if (isHrcEnergy) {
      const selItems = db.filter(i => i.selectionType === '선정');
      const selTotal = selItems.length || total;
      const selDone = selItems.filter(i => i.quotaStatus === 'completed' || i.status === '완료').length;
      const selReady = Math.max(0, selTotal - selDone);
      kpiTotal.textContent = `${selTotal} (전체 ${total})`;
      kpiReady.textContent = selReady;
      kpiPilot.textContent = pilot;
      kpiCompleted.textContent = completed;
      const rate = selTotal > 0 ? Math.round((completed / selTotal) * 100) : 0;
      kpiRate.textContent = `${rate}%`;
    } else {
      kpiTotal.textContent = total;
      kpiReady.textContent = ready;
      kpiPilot.textContent = pilot;
      kpiCompleted.textContent = completed;
      const rate = total > 0 ? Math.round(((pilot + completed) / total) * 100) : 0;
      kpiRate.textContent = `${rate}%`;
    }

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
    const sectionMasterBlueprint = document.getElementById('section-master-blueprint');
    const sectionExecution = document.getElementById('section-execution');
    const jumpPills = document.querySelectorAll('.quick-jump-pill');

    if (total === 0) {
      if (isAssoc || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) {
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

    // 쿼터 장착 여부에 따른 동적 툴바 전환
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

    const currentSurveyor = isGallupReturnFarm
      ? `${currentCampaign?.loginId || '076_000009'} (${currentCampaign?.surveyorName || '백영자'})`
      : (isGlobalriLiteracy
        ? `${currentCampaign?.loginId || '01071447791'} (${currentCampaign?.surveyorName || '노영미7791'})`
        : (isHrcEnergy
          ? `${currentCampaign?.loginId || '700275'} (${currentCampaign?.surveyorName || ''})`
          : (currentCampaign?.kstatLoginId || (isAssoc ? '가온이강윤' : '가온김영옥'))));
    if (assocSurveyorBadgeName) assocSurveyorBadgeName.textContent = currentSurveyor;
    if (assocBtnSurveyorName) assocBtnSurveyorName.textContent = currentSurveyor;
    if (kstatAccountNameBadge) kstatAccountNameBadge.textContent = currentSurveyor;
    if (execSurveyorLabel) execSurveyorLabel.textContent = currentSurveyor;
    if (execSlotCountLabel) {
      if (isGallupReturnFarm) {
        execSlotCountLabel.textContent = `선정명단 ${total}명 장착`;
      } else if (isGlobalriLiteracy) {
        execSlotCountLabel.textContent = `진행중 대상자 ${total}명 장착`;
      } else if (isHrcEnergy) {
        const selCnt = db.filter(i => i.selectionType === '선정').length;
        execSlotCountLabel.textContent = `선정 ${selCnt}건 / 전체 ${total}건`;
      } else {
        const slotPct = total > 0 ? Math.round((mappedSlots / total) * 100) : 0;
        execSlotCountLabel.textContent = `${mappedSlots}건 / ${total}건 (${slotPct}%)`;
      }
    }

    if (isAssoc) {
      if (detailsMarketbz) detailsMarketbz.classList.add('hidden');
      if (btnEnrichCampaign) btnEnrichCampaign.classList.add('hidden');
      if (btnToggleQuotaReplace) btnToggleQuotaReplace.classList.add('hidden');

      if (total === 0) {
        if (assocBanner) assocBanner.classList.remove('hidden');
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.add('hidden');
      } else {
        if (assocBanner) assocBanner.classList.add('hidden');
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.remove('hidden');
      }
    } else {
      if (assocBanner) assocBanner.classList.add('hidden');
      if (total > 0) {
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.add('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.remove('hidden');
        if (detailsMarketbz) detailsMarketbz.style.display = 'none';
        if (btnEnrichCampaign) {
          if (isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) btnEnrichCampaign.classList.add('hidden');
          else btnEnrichCampaign.classList.remove('hidden');
        }
        if (btnToggleQuotaReplace) btnToggleQuotaReplace.classList.remove('hidden');
      } else {
        if (quotaUnmountedGroup) quotaUnmountedGroup.classList.remove('hidden');
        if (quotaMountedGroup) quotaMountedGroup.classList.add('hidden');
        if (detailsMarketbz) detailsMarketbz.style.display = 'block';
      }
    }

    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
    const isKona = (currentCampaign?.surveyType === 'kona_youth');

    // 테이블 헤더 동적 교체
    const quotaTableHead = document.getElementById('quota-table-head');
    renderQuotaTableHead({
      quotaTableHead,
      isGallupReturnFarm,
      isGlobalriLiteracy,
      isHrcEnergy,
      isKona,
      isMetrix,
      isAssoc
    });

    if (total === 0) {
      renderEmptyQuotaTableRow({
        quotaTableBody,
        isGallupReturnFarm,
        isGlobalriLiteracy,
        isHrcEnergy,
        isAssoc
      });
      return;
    }

    const existingGallupBar = document.getElementById('gallup-step1-check-bar');
    if (!isGallupReturnFarm && existingGallupBar) {
      existingGallupBar.style.display = 'none';
    }

    // [한국갤럽 2026년 귀농귀촌 실태조사(귀농) 15개 컬럼 테이블 렌더링 + 체크박스 선택 바]
    if (isGallupReturnFarm) {
      if (!gallupSelectionInitialized && db.length > 0) {
        gallupSelectionInitialized = true;
        db.forEach((item, idx) => {
          const seq = Number(item.index || item.seq || (idx + 1));
          const isDone = (item.quotaStatus === 'completed' || item.status === '조사완료');
          const isPilotWait = (item.quotaStatus === 'pilot_done' || String(item.status || '').includes('완료직전'));
          if (!isDone && !isPilotWait) {
            checkedGallupSeqs.add(seq);
          }
        });
      }

      renderGallupQuotaTable({
        db,
        quotaTableBody,
        checkedGallupSeqs,
        completed,
        onReRender: renderQuotaTable,
        onTriggerBatchRun: () => triggerBatchRun()
      });
      return;
    }

    // [글로벌리서치 제5차 성인문해능력조사 15개 컬럼 테이블 렌더링 + 체크박스 선택 바]
    const existingCheckBar = document.getElementById('globalri-step1-check-bar');
    if (!isGlobalriLiteracy && existingCheckBar) {
      existingCheckBar.style.display = 'none';
    }

    if (isGlobalriLiteracy) {
      if (!globalriSelectionInitialized && db.length > 0) {
        globalriSelectionInitialized = true;
        const guidedUncompleted = db.filter(item => item.guideApplied && item.quotaStatus !== 'completed' && item.status !== '완료');
        if (guidedUncompleted.length > 0) {
          guidedUncompleted.forEach((item, idx) => checkedGlobalriSeqs.add(Number(item.index || item.seq || (idx + 1))));
        } else {
          db.forEach((item, idx) => {
            const seq = Number(item.index || item.seq || (idx + 1));
            const isDone = (item.quotaStatus === 'completed' || item.status === '완료');
            if (!isDone && resolveGlobalriAgeGroupKey(item) === 'age20') {
              checkedGlobalriSeqs.add(seq);
            }
          });
        }
      }

      renderGlobalriQuotaTable({
        db,
        quotaTableBody,
        checkedGlobalriSeqs,
        globalriAgePolicies: globalriCtrl.getPolicies(),
        blueprintStageGrid,
        onReRender: renderQuotaTable,
        onRenderGlobalriAgeGroupCards: () => globalriCtrl.renderGlobalriAgeGroupCards(),
        onApplyGlobalriQuickCheck: (mode, list) => globalriCtrl.applyGlobalriQuickCheck(mode, list),
        onRebuildGlobalriAgeGroupStats: (list) => globalriCtrl.rebuildGlobalriAgeGroupStats(list),
        onTriggerBatchRun: () => triggerBatchRun()
      });
      return;
    }

    // [한국리서치 TAPI 2025년 기준 에너지총조사 건물 부문 12개 컬럼 테이블 렌더링]
    if (isHrcEnergy) {
      renderHrcEnergyQuotaTable({ db, quotaTableBody });
      return;
    }

    // [코나체인 화성특례시 청소년 설문 전용 9개 컬럼 테이블 렌더링]
    if (isKona) {
      renderKonaQuotaTable({ db, quotaTableBody });
      return;
    }

    // [메트릭스 패널 전용 13개 컬럼 테이블 렌더링]
    if (isMetrix) {
      renderMetrixQuotaTable({ db, quotaTableBody });
      return;
    }

    // [상인회 전용 10개 컬럼 테이블 렌더링]
    if (isAssoc) {
      renderAssocQuotaTable({
        db,
        quotaTableBody,
        currentCampaign,
        currentSurveyor,
        campId,
        onCampaignUpdated: (updatedCampaign) => {
          currentCampaign = updatedCampaign;
          renderCampaignDetails(currentCampaign);
        }
      });
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
        const kidSuffix = item.ranId ? ` (${escapeHtml(item.ranId)})` : '';
        slotTag = `<div class="quota-slot-badge font-mono" data-slot-seq="${seq}" title="클릭하여 이 점포의 슬롯 URL 확인/수정: ${escapeHtml(item.slotUrl)}"><i class="fa-solid fa-link"></i> ${slotLabel}${kidSuffix}</div>`;
      } else {
        slotTag = `<div class="quota-slot-badge unmapped font-mono" data-slot-seq="${seq}" title="클릭하여 이 점포의 슬롯 URL 직접 입력/매핑"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 미매핑 (클릭하여 입력)</div>`;
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
  quotaTableBody.addEventListener('click', async (e) => {
    const gallupPilotBtn = e.target.closest('.btn-row-pilot-gallup');
    if (gallupPilotBtn) {
      e.stopPropagation();
      const targetSeq = parseInt(gallupPilotBtn.getAttribute('data-seq'), 10);
      if (!targetSeq || !currentCampaign || !Array.isArray(currentCampaign.quotaDatabase)) return;
      const targetItem = currentCampaign.quotaDatabase.find(b => Number(b.index || b.seq) === Number(targetSeq));
      if (!targetItem) return;

      const surveyUrl = targetItem.surveyUrl || targetItem.slotUrl || currentCampaign?.guidelineConfig?.surveyUrl || 'https://rs.gallup.co.kr/webApp/response/ResponseIdStart_20263603.asp?p_vr_no=317729C6AC&p_intrvw_id=076_000009&p_intrvw_nm=%EB%B0%B1%EC%98%81%EC%9E%90&p_rspns_mthd=P&p_mode=W';
      if (inputSurveyUrl) inputSurveyUrl.value = surveyUrl;

      try {
        setRunningState(true);
        openMonitorDrawer();
        resetTimelineChips();
        appendLog('info', `🎯 [한국갤럽 귀농실태조사 단건 실행] #${targetSeq} "${targetItem.name || targetItem.ceoName}" (가구 ID: ${targetItem.id} · ${targetItem.eupMyeon || ''}) 홍천군 GPS 주입 · 방문기록 검증 · 전자서명 다변화 · Page 118 완료 직전까지 자동 진행합니다...`);
        await saveBaseline(false);

        const res = await fetch(`/api/campaigns/${campId}/pilot-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            surveyUrl,
            quotaIndex: targetSeq
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '단건 실행 실패');
        appendLog('success', data.message);
      } catch (err) {
        appendLog('error', `단건 실행 실패: ${err.message}`);
        setRunningState(false);
      }
      return;
    }

    const rowPilotBtn = e.target.closest('.btn-row-pilot-globalri');
    if (rowPilotBtn) {
      e.stopPropagation();
      const targetSeq = parseInt(rowPilotBtn.getAttribute('data-seq'), 10);
      if (!targetSeq || !currentCampaign || !Array.isArray(currentCampaign.quotaDatabase)) return;
      const targetItem = currentCampaign.quotaDatabase.find(b => Number(b.index || b.seq) === Number(targetSeq));
      if (!targetItem) return;

      const surveyUrl = targetItem.householdUrl || targetItem.slotUrl || targetItem.surveyUrl || 'https://gift.globalri.it/login';
      if (inputSurveyUrl) inputSurveyUrl.value = surveyUrl;

      try {
        setRunningState(true);
        openMonitorDrawer();
        resetTimelineChips();
        appendLog('info', `🎯 [성인문해능력조사 Part C 자동 실행 시작] #${targetSeq} "${targetItem.memberName || targetItem.ceoName}" (LID ${targetItem.lid} · ${targetItem.ageGroupLabel || ''}) Part A ~ Part C 채점 저장 후 D1에서 수기 진행을 위해 자동 정지합니다...`);
        await saveBaseline(false);

        const res = await fetch(`/api/campaigns/${campId}/pilot-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            surveyUrl,
            quotaIndex: targetSeq
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '파일럿 실행 실패');
        appendLog('success', data.message);
      } catch (err) {
        appendLog('error', `파일럿 실행 실패: ${err.message}`);
        setRunningState(false);
      }
      return;
    }

    const slotBadge = e.target.closest('.quota-slot-badge');
    if (slotBadge) {
      e.stopPropagation();
      const targetSeq = parseInt(slotBadge.getAttribute('data-slot-seq'), 10) || null;
      if (typeof window.openSlotModal === 'function') {
        window.openSlotModal(targetSeq);
      }
      return;
    }

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

  async function loadBlueprint() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/blueprint`);
      if (!res.ok) throw new Error('블루프린트를 불러올 수 없습니다.');
      const data = await res.json();
      blueprintData = data.blueprint;

      // 한국갤럽 2026년 귀농귀촌 실태조사(귀농) 전용 블루프린트 분기
      const isGallupReturnFarmCampaign = (data.surveyType === 'gallup_return_farm' || currentCampaign?.surveyType === 'gallup_return_farm');
      if (isGallupReturnFarmCampaign) {
        renderGallupReturnFarmBlueprint(data, {
          getCurrentCampaign: () => currentCampaign,
          checkedGallupSeqs,
          badgeMasterStatus,
          btnSaveBaseline,
          blueprintStageGrid,
          triggerBatchRun: () => triggerBatchRun()
        });
        return;
      }

      // 글로벌리서치 제5차 성인문해능력조사 전용 블루프린트 분기 (나이대별 그룹 가이드)
      const isGlobalriLiteracyCampaign = (data.surveyType === 'globalri_literacy' || currentCampaign?.surveyType === 'globalri_literacy');
      if (isGlobalriLiteracyCampaign) {
        globalriCtrl.renderGlobalriLiteracyBlueprint(data);
        return;
      }

      // 한국리서치 에너지총조사 [건물 부문] 전용 블루프린트 분기 (완전 격리)
      const isHrcEnergyCampaign = (data.surveyType === 'hrc_energy' || currentCampaign?.surveyType === 'hrc_energy');
      if (isHrcEnergyCampaign) {
        renderHrcEnergyBlueprint(data, {
          blueprintStageGrid,
          badgeMasterStatus,
          btnSaveBaseline
        });
        return;
      }

      // 코나체인 화성특례시 청소년 설문 전용 블루프린트 분기 (완전 격리)
      const isKonaCampaign = (data.surveyType === 'kona_youth' || currentCampaign?.surveyType === 'kona_youth');
      if (isKonaCampaign) {
        renderKonaBlueprint(data, {
          blueprintStageGrid,
          badgeMasterStatus,
          btnSaveBaseline
        });
        return;
      }

      // 상인회 전용 블루프린트 분기 (완전 격리)
      const isAssocCampaign = (data.surveyType === 'kstat_assoc' || currentCampaign?.surveyType === 'kstat_assoc');
      if (isAssocCampaign) {
        const bpSection = document.getElementById('section-master-blueprint');
        if (bpSection) {
          bpSection.classList.remove('hidden');
          bpSection.style.display = 'block';
        }
        assocPolicyState = renderAssocBlueprint(data, {
          blueprintStageGrid,
          badgeMasterStatus,
          btnSaveBaseline,
          markUnsaved,
          appendLog
        });
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
        metrixPolicyState = renderMetrixBlueprint(data, {
          blueprintStageGrid,
          badgeMasterStatus,
          btnSaveBaseline,
          appendLog
        });
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
    renderKstatStoreStages({
      blueprintStageGrid,
      blueprintData,
      currentBaseline,
      onMarkUnsaved: () => markUnsaved()
    });
  }

  function markUnsaved() {
    if (badgeMasterStatus) {
      badgeMasterStatus.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 기준점 변경됨 (저장 필요)';
      badgeMasterStatus.className = 'badge-status badge-blueprint warning';
    }
    if (btnSaveBaseline) {
      btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 변경된 마스터 기준점 저장 *';
    }
  }

  function applyPreset(presetObj, activeBtn) {
    currentBaseline = {
      ...currentBaseline,
      ...presetObj
    };
    groupBaselines[activeGroup] = { ...currentBaseline };

    [btnPresetStandard, btnPresetGrowth, btnPresetTraditional, btnPresetRotation].forEach(b => {
      if (b) b.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');

    renderStages();
    markUnsaved();
  }

  if (btnPresetStandard) {
    btnPresetStandard.addEventListener('click', () => applyPreset(PRESET_STANDARD, btnPresetStandard));
  }
  if (btnPresetGrowth) {
    btnPresetGrowth.addEventListener('click', () => applyPreset(PRESET_GROWTH, btnPresetGrowth));
  }
  if (btnPresetTraditional) {
    btnPresetTraditional.addEventListener('click', () => applyPreset(PRESET_TRADITIONAL, btnPresetTraditional));
  }
  if (btnPresetRotation) {
    btnPresetRotation.addEventListener('click', () => applyPreset(PRESET_ROTATION, btnPresetRotation));
  }

  async function saveBaseline(showNotification = true) {
    try {
      if (btnSaveBaseline) {
        btnSaveBaseline.disabled = true;
        btnSaveBaseline.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
      }

      const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');
      const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
      const isKona = (currentCampaign?.surveyType === 'kona_youth');
      const isHrcEnergy = (currentCampaign?.surveyType === 'hrc_energy');
      const isGlobalriLiteracy = (currentCampaign?.surveyType === 'globalri_literacy');
      const isGallupReturnFarm = (currentCampaign?.surveyType === 'gallup_return_farm');

      let payload;
      if (isGallupReturnFarm) {
        const gpsMode = document.getElementById('sel-gallup-gps-mode')?.value || 'eup_myeon_jitter';
        const visitHourRange = document.getElementById('sel-gallup-visit-hours')?.value || '10_17';
        const signatureStyleMode = document.getElementById('sel-gallup-sig-mode')?.value || 'auto_rotate';
        const stopBeforeSubmit = (document.getElementById('sel-gallup-stop-mode')?.value !== 'full_submit');
        payload = {
          surveyType: 'gallup_return_farm',
          policy: {
            gpsSpoofing: true,
            gpsMode,
            visitLogValidation: true,
            visitHourRange,
            variedSignature: true,
            signatureStyleMode,
            stopBeforeSubmit
          }
        };
      } else if (isGlobalriLiteracy) {
        if (showNotification && checkedGlobalriSeqs.size > 0) {
          const ok = await globalriCtrl.applyGuideToCheckedGlobalriQuotas(true);
          if (btnSaveBaseline) {
            btnSaveBaseline.disabled = false;
            btnSaveBaseline.innerHTML = '<i class="fa-solid fa-check-double"></i> 체크한 쿼터에 가이드 적용·저장 완료!';
            btnSaveBaseline.className = 'btn-pill btn-pill-success';
            setTimeout(() => {
              if (btnSaveBaseline) {
                btnSaveBaseline.innerHTML = '<i class="fa-solid fa-check-double"></i> 체크한 쿼터에 가이드 적용·저장';
                btnSaveBaseline.className = 'btn-pill btn-pill-primary';
              }
            }, 2500);
          }
          return ok;
        }
        globalriCtrl.syncGlobalriActiveCardToState();
        const stopModeEl = document.getElementById('sel-globalri-stop-mode');
        const stopAfterPartC = stopModeEl ? (stopModeEl.value !== 'full_f05_2') : (currentCampaign?.masterBaseline?.policy?.stopAfterPartC !== false);
        payload = {
          surveyType: 'globalri_literacy',
          ageGroups: globalriCtrl.getPolicies() || {},
          policy: {
            preserveExistingInputs: true,
            stopAfterPartC,
            safetyStopAtF05_2: true
          }
        };
      } else if (isHrcEnergy) {
        payload = {
          surveyType: 'hrc_energy',
          policy: currentCampaign?.masterBaseline?.policy || {
            preserveExistingInputs: true,
            prioritizeSelectedOverReplacement: true
          }
        };
      } else if (isKona) {
        payload = {
          surveyType: 'kona_youth',
          policy: currentCampaign?.masterBaseline?.policy || {}
        };
      } else if (isMetrix) {
        syncMetrixInputsToState(metrixPolicyState);
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
        btnSaveBaseline.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${isGlobalriLiteracy ? '나이대별 응답 가이드 저장 완료!' : (isHrcEnergy ? '에너지총조사 [건물] 정책 저장 완료!' : (isKona ? '청소년 설문 기준 가이드 저장 완료!' : (isAssoc ? '상인회 정책 가이드라인 저장 완료!' : '마스터 기준점 &amp; 평가 가이드 저장 완료!')))}`;
        btnSaveBaseline.className = 'btn-pill btn-pill-success';
      }

      if (badgeMasterStatus) {
        badgeMasterStatus.innerHTML = isGlobalriLiteracy
          ? '<i class="fa-solid fa-layer-group"></i> 나이대별(20대~70대+) 6개 그룹 가이드 저장 완료'
          : (isHrcEnergy
            ? '<i class="fa-solid fa-shield-halved"></i> 기존 입력값 100% 보존 &amp; 14단계 검증 활성'
            : (isKona
              ? '<i class="fa-solid fa-camera"></i> 40문항 규칙 &amp; 제출 직전 캡처 활성'
              : (isAssoc 
                ? '<i class="fa-solid fa-check-double"></i> 상인회 25단계 블루프린트 설정 완료'
                : '<i class="fa-solid fa-check-double"></i> 3개 업종 그룹별 마스터 기준점 &amp; 평가 가이드 활성')));
        badgeMasterStatus.className = 'badge-status badge-blueprint ready';
      }

      if (showNotification) {
        appendLog('success', isGlobalriLiteracy
          ? '✓ 제5차 성인문해능력조사 나이대별(20대·30대·40대·50대·60대·70대+) 응답 가이드라인이 저장되었습니다.'
          : (isHrcEnergy
            ? '✓ 2025년 기준 에너지총조사 [건물] 정책 가이드라인(기존 입력값 보존 규칙)이 저장되었습니다.'
            : (isKona
              ? '✓ 화성특례시 청소년 설문조사 기준 가이드라인이 성공적으로 저장되었습니다.'
              : (isMetrix
                ? '✓ 메트릭스 패널조사 기준 가이드라인이 성공적으로 저장되었습니다.'
                : (isAssoc 
                  ? '✓ 상인회 25단계 정책 가이드라인(F5~G4)이 성공적으로 저장되었습니다.'
                  : '✓ 3개 업종 그룹별 마스터 기준점 및 조사원 평가 가이드(H1~H3)가 성공적으로 저장되었습니다. 24개 쿼터에 적용됩니다.')))));
      }

      setTimeout(() => {
        if (btnSaveBaseline) {
          btnSaveBaseline.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${isGlobalriLiteracy ? '나이대별 응답 가이드 저장' : (isHrcEnergy ? '에너지총조사 [건물] 기준 가이드 저장' : (isKona ? '청소년 설문 기준 가이드 저장' : (isAssoc ? '상인회 정책 가이드 저장' : '마스터 기준점 &amp; 조사원 평가 가이드 저장')))}`;
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
  // [버튼 1] 1번 쿼터 파일럿 검증 (Agree 직전 안전 대기 / 에너지총조사 단건 완료)
  btnPilot.addEventListener('click', async () => {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
    const isKona = (currentCampaign?.surveyType === 'kona_youth');
    const isHrcEnergy = (currentCampaign?.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (currentCampaign?.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (currentCampaign?.surveyType === 'gallup_return_farm');
    const firstBiz = isGallupReturnFarm
      ? (quotaDb.find(b => checkedGallupSeqs.has(Number(b.index || b.seq)) && b.quotaStatus !== 'completed' && b.status !== '조사완료')
        || quotaDb.find(b => b.quotaStatus !== 'completed' && b.status !== '조사완료' && b.quotaStatus !== 'pilot_done')
        || quotaDb.find(b => b.quotaStatus !== 'completed' && b.status !== '조사완료')
        || quotaDb[0])
      : (isHrcEnergy
        ? (quotaDb.find(b => b.selectionType === '선정' && b.quotaStatus !== 'completed' && b.status !== '완료') || quotaDb.find(b => b.quotaStatus !== 'completed' && b.status !== '완료') || quotaDb[0])
        : ((isKona || isGlobalriLiteracy)
          ? (quotaDb.find(b => b.quotaStatus !== 'completed' && b.status !== '완료') || quotaDb[0])
          : quotaDb[0]));
    const firstSlot = firstBiz?.surveyUrl || firstBiz?.slotUrl || firstBiz?.householdUrl || (isGallupReturnFarm ? 'https://rs.gallup.co.kr/webApp/response/ResponseIdStart_20263603.asp?p_vr_no=317729C6AC&p_intrvw_id=076_000009&p_intrvw_nm=%EB%B0%B1%EC%98%81%EC%9E%90&p_rspns_mthd=P&p_mode=W' : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${firstBiz?.uid || ''}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : '')));
    const targetPilotIdx = firstBiz?.index || firstBiz?.seq || 1;

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
      if (isGallupReturnFarm) {
        appendLog('info', `🎯 [한국갤럽 귀농실태조사 단건 실행] "${firstBiz.name || firstBiz.ceoName}" (가구 ID: ${firstBiz.id} · ${firstBiz.eupMyeon || ''}) 홍천군 GPS 주입 · 방문기록 검증 · 8종 전자서명 · Page 118 완료 직전까지 자동 진행합니다...`);
      } else if (isGlobalriLiteracy) {
        appendLog('info', `🎯 [성인문해능력조사 Part A~C 실행] "${firstBiz.memberName || firstBiz.ceoName}" (LID ${firstBiz.lid} · ${firstBiz.ageGroupLabel || ''}) 나이대별 가이드 적용 및 Part C 채점 저장 후 D1 수기 대기를 진행합니다...`);
      } else if (isHrcEnergy) {
        appendLog('info', `🎯 [에너지총조사 단건 실행] "${firstBiz.buildingName || firstBiz.companyName}" (UID: ${firstBiz.uid}) 기존 입력 항목을 100% 보존하며 설문을 진행합니다...`);
      } else if (isKona) {
        appendLog('info', `🎯 [코나 청소년 파일럿 시작] "${firstBiz.companyName}" (IDX: ${firstBiz.idx}) 1~40번 입력 및 제출 직전 캡처 검증을 진행합니다...`);
      } else if (isMetrix) {
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
          quotaIndex: targetPilotIdx
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

  // [버튼 2] 전체 쿼터 배치 연속 가동
  const triggerBatchRun = async () => {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    const isMetrix = (currentCampaign?.surveyType === 'metrix_panel');
    const isKona = (currentCampaign?.surveyType === 'kona_youth');
    const isHrcEnergy = (currentCampaign?.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (currentCampaign?.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (currentCampaign?.surveyType === 'gallup_return_farm');
    const firstQuota = quotaDb.find(b => b.index === 1) || quotaDb[0];
    const firstDone = firstQuota && (firstQuota.quotaStatus === 'pilot_done' || firstQuota.quotaStatus === 'completed' || firstQuota.status === '완료' || firstQuota.quotaStatus === '진행중(98%)' || firstQuota.status === '진행중(98%)');
    const startIdx = (isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) ? 1 : (firstDone ? 2 : 1);

    // 1:1 슬롯 매핑 전수 검증 및 선택 항목 필터링
    let selectedTargetIndices = null;
    let targets = [];
    if (isGallupReturnFarm) {
      const uncompletedAll = quotaDb.filter(b => b.quotaStatus !== 'completed' && b.status !== '조사완료');
      const checkedUncompleted = uncompletedAll.filter((b, idx) => checkedGallupSeqs.has(Number(b.index || b.seq || (idx + 1))));
      const readyOnly = uncompletedAll.filter(b => b.quotaStatus !== 'pilot_done' && !String(b.status || '').includes('완료직전'));
      if (checkedUncompleted.length > 0) {
        targets = checkedUncompleted;
        selectedTargetIndices = checkedUncompleted.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      } else if (readyOnly.length > 0) {
        targets = readyOnly;
        selectedTargetIndices = readyOnly.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      } else {
        targets = uncompletedAll;
        selectedTargetIndices = uncompletedAll.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      }
      if (targets.length === 0) {
        alert('실행할 미완료 대상자가 없습니다.');
        return;
      }
    } else if (isGlobalriLiteracy) {
      const uncompletedAll = quotaDb.filter(b => b.quotaStatus !== 'completed' && b.status !== '완료');
      const checkedUncompleted = uncompletedAll.filter((b, idx) => checkedGlobalriSeqs.has(Number(b.index || b.seq || (idx + 1))));
      const guidedUncompleted = uncompletedAll.filter(b => b.guideApplied);
      if (checkedUncompleted.length > 0) {
        targets = checkedUncompleted;
        selectedTargetIndices = checkedUncompleted.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      } else if (guidedUncompleted.length > 0) {
        targets = guidedUncompleted;
        selectedTargetIndices = guidedUncompleted.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      } else {
        targets = uncompletedAll;
        selectedTargetIndices = uncompletedAll.map((b, idx) => Number(b.index || b.seq || (idx + 1)));
      }
      if (targets.length === 0) {
        alert('실행할 미완료 쿼터 항목이 없습니다.');
        return;
      }
    } else {
      targets = isHrcEnergy
        ? quotaDb.filter(b => b.selectionType === '선정' && b.quotaStatus !== 'completed' && b.status !== '완료')
        : (isKona
          ? quotaDb.filter(b => b.quotaStatus !== 'completed' && b.status !== '완료')
          : quotaDb.filter(b => (b.index || b.seq) >= startIdx));
    }
    const unmappedTargets = (isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) ? [] : targets.filter(b => !b.slotUrl && !b.surveyUrl);
    if (unmappedTargets.length > 0) {
      if (isMetrix) {
        alert(`⚠️ 실행 대상 패널 ${targets.length}건 중 ${unmappedTargets.length}건에 설문 참여 URL(surveyUrl)이 누락되었습니다.`);
      } else {
        alert(`⚠️ 쿼터와 케이스탯 슬롯이 1:1로 매핑되지 않았습니다!\n(실행 대상 ${targets.length}개 점포 중 ${unmappedTargets.length}개 슬롯 누락)\n\n슬롯이 매핑되지 않은 상태로 실행하면 동일한 설문지에 중복 제출되는 치명적인 오류가 발생합니다.\n상단의 [🔗 케이스탯 슬롯 1:1 매핑] 버튼을 눌러 모든 쿼터에 1:1 슬롯을 매칭한 후 배치를 가동해 주세요.`);
        if (typeof window.openSlotModal === 'function') window.openSlotModal();
      }
      return;
    }

    let surveyUrl = targets[0]?.slotUrl || targets[0]?.surveyUrl || targets[0]?.householdUrl || inputSurveyUrl.value.trim() || (isGallupReturnFarm ? 'https://rs.gallup.co.kr/webApp/response/ResponseIdStart_20263603.asp?p_vr_no=317729C6AC&p_intrvw_id=076_000009&p_intrvw_nm=%EB%B0%B1%EC%98%81%EC%9E%90&p_rspns_mthd=P&p_mode=W' : (isGlobalriLiteracy ? 'https://gift.globalri.it/login' : (isHrcEnergy ? 'https://tapi.hrcglobal.com/Home/Login' : 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL')));
    const safetyGuard = checkSafetyGuard ? checkSafetyGuard.checked : (isHrcEnergy ? false : true);
    
    let confirmMsg;
    if (isGallupReturnFarm) {
      const targetNameList = targets.slice(0, 8).map(b => `#${b.index || b.seq} ${b.name || b.ceoName}(${b.id})`).join(', ') + (targets.length > 8 ? ` 외 ${targets.length - 8}명` : '');
      confirmMsg = `[2026년 귀농귀촌 실태조사(귀농) - 선택 대상자 일괄 자동 배치]\n선택된 대상자 ${targets.length}명(${targetNameList})에 대해 순차 배치 자동화를 시작합니다.\n\n🛡️ 핵심 적용 규칙:\n1. 대상 지역(홍천군 10개 읍·면) 브라우저 GPS 위치정보 강제 주입\n2. 방문 기록 검증 규칙(07~22시 시간대 · 순차 오름차순 · 최종 '컨택성공') 준수\n3. 답례품 인수증 전자서명 패드(Page 7) 8종 한글 필체 변주 서명 업로드\n4. 최종 제출하지 않고 마지막 Page 118(NAME·PHONE·ADDR) 저장 후 완료 직전 상태에서 정지\n\n계속하시겠습니까?`;
    } else if (isGlobalriLiteracy) {
      const targetNameList = targets.map(b => `#${b.index || b.seq} ${b.memberName || b.ceoName}(${b.ageGroupLabel || ''})`).join(', ');
      confirmMsg = `[제5차 성인문해능력조사 - 선택 쿼터 일괄 자동 배치]\n선택된 대상자 ${targets.length}명(${targetNameList})에 대해 순차 배치 자동화를 시작합니다.\n\n🛡️ 핵심 적용 규칙:\n1. 각 대상자에게 부여된 맞춤 응답 가이드(또는 연령 프리셋) 적용\n2. CONSENT~GP1 및 기존 입력 문항 100% 보존\n3. 설정된 진행 범위(Part C 채점 저장 후 D1 수기 대기 또는 F05_2까지 진행) 준수 (Part D D5 4~5 / 3~4 교차체크 보장)\n4. 제출 문항·답변 내역 엑셀(.xlsx) 자동 저장\n\n계속하시겠습니까?`;
    } else if (isHrcEnergy) {
      confirmMsg = `[2025년 기준 에너지총조사 - 건물 부문]\n미완료 [선정] 쿼터 ${targets.length}건에 대해 순차 배치 자동화를 시작합니다.\n\n🛡️ 핵심 적용 규칙:\n1. 기존에 이미 입력되어 있는 항목은 절대 건드리지 않고 100% 보존\n2. SMS/이메일 발송 버튼 절대 클릭 금지\n3. 진행 불가 시 동일 표본층(Cell)의 [대체] 쿼터 자동 승계\n4. ${safetyGuard ? '91% 마지막 문항(E1-5)에서 완료 보류' : '100% 조사완료까지 즉시 완료'}\n\n계속하시겠습니까?`;
    } else if (isKona) {
      confirmMsg = safetyGuard
        ? `[화성특례시 청소년 설문조사]\n미완료 ${targets.length}명(IDX ${targets[0]?.idx}~${targets[targets.length - 1]?.idx})에 대해 제출 직전 안전 대기(캡처만 수행) 모드로 배치를 시작하시겠습니까?`
        : `[화성특례시 청소년 설문조사]\n미완료 ${targets.length}명(IDX ${targets[0]?.idx}~${targets[targets.length - 1]?.idx})에 대해 배치 자동화를 시작합니다.\n\n📸 매 회차 제출 직전 스크린샷을 자동 촬영·보관한 후 실제 제출(제출하기 클릭)을 완료합니다. 계속하시겠습니까?`;
    } else if (isMetrix) {
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
      if (isGallupReturnFarm) {
        appendLog('info', `🚀 [한국갤럽 귀농실태조사 배치 가동 시작] 선택 대상자 ${targets.length}명 완료 직전(Page 118)까지 순차 자동화 실행을 시작합니다...`);
      } else if (isGlobalriLiteracy) {
        if (checkedGlobalriSeqs.size > 0) {
          await globalriCtrl.applyGuideToCheckedGlobalriQuotas(false);
        }
        appendLog('info', `🚀 [성인문해능력조사 선택 배치 가동 시작] 선택 대상자 ${targets.length}명 순차 자동화 실행을 시작합니다...`);
      } else if (isHrcEnergy) {
        appendLog('info', `🚀 [에너지총조사 배치 가동 시작] 미완료 선정 쿼터 ${targets.length}건 순차 자동화 실행을 시작합니다... (기입력 항목 100% 보존)`);
      } else if (isKona) {
        appendLog('info', `🚀 [코나 청소년 배치 가동 시작] 미완료 ${targets.length}건 순차 자동화 실행을 시작합니다... (제출 직전 캡처 + ${safetyGuard ? '제출 보류' : '실제 최종 제출'})`);
      } else if (isMetrix) {
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
          safetyGuard,
          onlySelected: true,
          autoFallbackToSub: true,
          targetIndices: selectedTargetIndices
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
  // 6-1. 케이스탯 슬롯 1:1 매칭 모달 (행별 직접 입력 & 대량 파싱) 및 점포 수동 추가 제어
  // ------------------------------------------------------------------------
  const modalSlotMapping = document.getElementById('modal-slot-mapping');
  const btnOpenSlotModal = document.getElementById('btn-open-slot-modal');
  const kpiSlotChip = document.getElementById('kpi-slot-chip');
  const btnCloseSlotModal = document.getElementById('btn-close-slot-modal');
  const btnCancelSlotModal = document.getElementById('btn-cancel-slot-modal');
  const textareaBulkSlots = document.getElementById('textarea-bulk-slots');
  const btnParseSlots = document.getElementById('btn-parse-slots');
  const btnParseSlotsUnmapped = document.getElementById('btn-parse-slots-unmapped');
  const btnClearSlots = document.getElementById('btn-clear-slots');
  const slotParseStatusMsg = document.getElementById('slot-parse-status-msg');
  const slotMatchSummaryBadge = document.getElementById('slot-match-summary-badge');
  const slotPreviewTbody = document.getElementById('slot-preview-tbody');
  const checkResetQuotaStatus = document.getElementById('check-reset-quota-status');
  const btnSubmitSlotMapping = document.getElementById('btn-submit-slot-mapping');

  let parsedSlotsState = [];

  function normalizeSingleSlotInput(rawVal, idx = 0) {
    const trimmed = String(rawVal || '').trim();
    if (!trimmed) {
      return { slotUrl: '', ranId: null, slotIndex: idx + 1, slotExtra: '' };
    }
    const isAssoc = (currentCampaign?.surveyType === 'kstat_assoc');
    const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>]+index\.asp\?[^\s"'<>]+)/i);
    let finalUrl = urlMatch ? urlMatch[1] : trimmed;

    // KID 코드만 단독 입력한 경우 정식 URL로 자동 보완
    if (!/^https?:\/\//i.test(finalUrl) && /^[A-Za-z0-9_-]{6,20}$/.test(finalUrl)) {
      finalUrl = isAssoc
        ? `https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=${finalUrl}&type=tapi&prid=2026070801&mnid=900001364&srt=1`
        : `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${finalUrl}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
    }

    const kidMatch = finalUrl.match(/[?&]KID=([A-Za-z0-9_-]+)/i);
    const extraMatch = trimmed.match(/\(([0-9]+)\)추가/i);
    return {
      slotUrl: finalUrl,
      ranId: kidMatch ? kidMatch[1] : null,
      slotIndex: idx + 1,
      slotExtra: extraMatch ? extraMatch[0] : `(${idx})추가`
    };
  }

  // 스마트 슬롯 URL 파서 (URL, list.php 소스, KID 단독 줄바꿈 모두 지원)
  function parseBulkSlotInput(rawText) {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const slots = [];

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

    // fallback: URL 직접 줄바꿈 또는 KID 코드 단독 줄바꿈 입력
    if (slots.length === 0) {
      lines.forEach((line, idx) => {
        if (line.startsWith('http://') || line.startsWith('https://') || /^[A-Za-z0-9_-]{6,20}$/.test(line)) {
          const norm = normalizeSingleSlotInput(line, idx);
          if (norm.slotUrl) {
            slots.push(norm);
          }
        }
      });
    }

    return slots;
  }

  function updateSlotSummaryUI() {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    const total = quotaDb.length;
    const matchedCount = parsedSlotsState.filter(s => s && s.slotUrl && String(s.slotUrl).trim() !== '').length;

    if (slotMatchSummaryBadge) {
      slotMatchSummaryBadge.textContent = `매칭 완료: ${matchedCount} / ${total} 점포`;
      if (matchedCount === total && total > 0) {
        slotMatchSummaryBadge.className = 'slot-summary-badge success';
        if (slotParseStatusMsg) {
          slotParseStatusMsg.className = 'slot-parse-msg success';
          slotParseStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> 전체 <strong>${total}개 점포</strong>에 슬롯 URL이 1:1로 매칭되었습니다. 하단의 [1:1 슬롯 매핑 적용 및 저장]을 눌러주세요.`;
        }
      } else {
        slotMatchSummaryBadge.className = 'slot-summary-badge warning';
        if (slotParseStatusMsg) {
          slotParseStatusMsg.className = 'slot-parse-msg warning';
          slotParseStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 전체 <strong>${total}개 점포</strong> 중 <strong>${matchedCount}개</strong> 매칭됨 (미매핑 <strong>${Math.max(0, total - matchedCount)}개</strong> — 표의 입력칸에 직접 붙여넣거나 상단에서 파싱하세요)`;
        }
      }
    }
  }

  function renderSlotPreviewTable(focusSeq = null) {
    const quotaDb = currentCampaign?.quotaDatabase || [];
    const total = quotaDb.length;

    if (total === 0) {
      if (slotPreviewTbody) slotPreviewTbody.innerHTML = '<tr><td colspan="6" class="empty-table-msg">쿼터 점포가 없습니다.</td></tr>';
      if (slotMatchSummaryBadge) slotMatchSummaryBadge.textContent = '매칭: 0 / 0 점포';
      return;
    }

    if (slotPreviewTbody) {
      slotPreviewTbody.innerHTML = quotaDb.map((item, idx) => {
        const seq = item.index || item.seq || (idx + 1);
        const parsedSlot = parsedSlotsState[idx] || {};
        const url = parsedSlot.slotUrl !== undefined ? parsedSlot.slotUrl : (item.slotUrl || '');
        const ranId = parsedSlot.ranId || item.ranId || (url.match(/[?&]KID=([A-Za-z0-9_-]+)/i)?.[1] || '');
        const slotExtra = parsedSlot.slotExtra || item.slotExtra || (url ? `(${idx})추가` : '-');
        const isMatched = Boolean(url && String(url).trim());
        const isFocused = (focusSeq && Number(focusSeq) === Number(seq));

        return `
          <tr class="slot-preview-row ${isMatched ? 'row-matched' : 'row-unmatched'}${isFocused ? ' row-focused' : ''}" data-row-idx="${idx}" data-seq="${seq}">
            <td class="text-center font-mono font-bold col-seq">${seq}</td>
            <td class="col-company"><strong class="company-name-highlight">${escapeHtml(item.companyName || item.marketName || '-')}</strong></td>
            <td class="text-center col-ind"><span class="quota-ind-badge">${escapeHtml(getIndustryBadgeText(item.industry || item.handledItems || item.marketType))}</span></td>
            <td class="col-ceo"><span class="ceo-name-highlight">${escapeHtml(item.ceoName || item.leaderName || '-')}</span></td>
            <td class="text-center font-mono col-slot-label" id="slot-label-cell-${idx}">
              ${isMatched
                ? `<span class="badge-slot-matched font-mono font-bold">슬롯 #${idx + 1} ${escapeHtml(ranId ? `(${ranId})` : slotExtra)}</span>`
                : '<span class="badge-slot-unmapped"><i class="fa-solid fa-triangle-exclamation"></i> 미매핑</span>'}
            </td>
            <td class="font-mono col-slot-url">
              <div class="slot-url-input-wrap">
                <input
                  type="text"
                  class="slot-row-url-input ${isMatched ? '' : 'is-empty'}"
                  data-row-idx="${idx}"
                  data-seq="${seq}"
                  value="${escapeHtml(url)}"
                  placeholder="https://kstat.surveys.kr/...index.asp?KID=... 또는 KID 코드 직접 입력"
                />
                <button type="button" class="btn-clear-row-slot" data-row-idx="${idx}" title="이 점포의 슬롯 URL 지우기">&times;</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // 개별 행 입력 이벤트 바인딩
      slotPreviewTbody.querySelectorAll('.slot-row-url-input').forEach(input => {
        const handleRowInput = () => {
          const rIdx = parseInt(input.getAttribute('data-row-idx'), 10);
          const norm = normalizeSingleSlotInput(input.value, rIdx);
          if (parsedSlotsState[rIdx]) {
            parsedSlotsState[rIdx].slotUrl = norm.slotUrl;
            parsedSlotsState[rIdx].ranId = norm.ranId;
            parsedSlotsState[rIdx].slotIndex = norm.slotIndex;
            parsedSlotsState[rIdx].slotExtra = norm.slotExtra;
          }
          const isMatched = Boolean(norm.slotUrl);
          input.classList.toggle('is-empty', !isMatched);
          const tr = input.closest('.slot-preview-row');
          if (tr) {
            tr.classList.toggle('row-matched', isMatched);
            tr.classList.toggle('row-unmatched', !isMatched);
          }
          const labelCell = document.getElementById(`slot-label-cell-${rIdx}`);
          if (labelCell) {
            labelCell.innerHTML = isMatched
              ? `<span class="badge-slot-matched font-mono font-bold">슬롯 #${rIdx + 1} ${escapeHtml(norm.ranId ? `(${norm.ranId})` : norm.slotExtra)}</span>`
              : '<span class="badge-slot-unmapped"><i class="fa-solid fa-triangle-exclamation"></i> 미매핑</span>';
          }
          updateSlotSummaryUI();
        };

        input.addEventListener('input', handleRowInput);
        input.addEventListener('change', () => {
          const rIdx = parseInt(input.getAttribute('data-row-idx'), 10);
          const norm = normalizeSingleSlotInput(input.value, rIdx);
          if (norm.slotUrl && input.value.trim() !== norm.slotUrl) {
            input.value = norm.slotUrl;
          }
          handleRowInput();
        });
      });

      // 개별 행 비우기 버튼 이벤트 바인딩
      slotPreviewTbody.querySelectorAll('.btn-clear-row-slot').forEach(btn => {
        btn.addEventListener('click', () => {
          const rIdx = parseInt(btn.getAttribute('data-row-idx'), 10);
          const rowInput = slotPreviewTbody.querySelector(`.slot-row-url-input[data-row-idx="${rIdx}"]`);
          if (rowInput) {
            rowInput.value = '';
            rowInput.dispatchEvent(new Event('input'));
            rowInput.focus();
          }
        });
      });

      if (focusSeq) {
        setTimeout(() => {
          const targetInput = slotPreviewTbody.querySelector(`.slot-row-url-input[data-seq="${focusSeq}"]`);
          if (targetInput) {
            try {
              targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
            targetInput.focus();
            targetInput.select();
          }
        }, 80);
      }
    }

    updateSlotSummaryUI();
  }

  function openSlotModal(focusSeq = null) {
    if (!currentCampaign) return;
    const quotaDb = currentCampaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      alert('캠페인에 등록된 쿼터가 없습니다. 먼저 쿼터를 불러와 주세요.');
      return;
    }

    const targetSeq = (typeof focusSeq === 'number' || typeof focusSeq === 'string') ? parseInt(focusSeq, 10) : null;

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
    if (existingUrls.length > 0 && textareaBulkSlots) {
      textareaBulkSlots.value = existingUrls.join('\n');
    }

    // 기존에 이미 완료/검증완료된 점포가 있으면 실수로 초기화되지 않도록 체크박스 기본 해제 보장
    if (checkResetQuotaStatus) {
      checkResetQuotaStatus.checked = false;
    }

    renderSlotPreviewTable(targetSeq);
    if (modalSlotMapping) modalSlotMapping.classList.add('is-open');
  }

  window.openSlotModal = openSlotModal;

  function closeSlotModal() {
    if (modalSlotMapping) modalSlotMapping.classList.remove('is-open');
  }

  if (btnOpenSlotModal) btnOpenSlotModal.addEventListener('click', () => openSlotModal());
  if (kpiSlotChip) kpiSlotChip.addEventListener('click', () => openSlotModal());
  if (btnCloseSlotModal) btnCloseSlotModal.addEventListener('click', closeSlotModal);
  if (btnCancelSlotModal) btnCancelSlotModal.addEventListener('click', closeSlotModal);

  if (btnParseSlots) {
    btnParseSlots.addEventListener('click', () => {
      const text = textareaBulkSlots ? textareaBulkSlots.value.trim() : '';
      if (!text) {
        alert('상단 대량 입력창에 슬롯 URL(또는 KID 코드)을 입력해주세요.');
        if (textareaBulkSlots) textareaBulkSlots.focus();
        return;
      }

      const extracted = parseBulkSlotInput(text);
      if (extracted.length === 0) {
        alert('입력된 텍스트에서 케이스탯 설문 URL을 찾을 수 없습니다.\n올바른 index.asp?KID=... 형태의 URL 또는 KID 코드인지 확인해주세요.');
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

  // [미매핑 점포에만 채우기] 버튼: 이미 매핑된 점포의 슬롯은 유지하고, 빈칸(미매핑) 점포에만 신규 슬롯을 순차 배정
  if (btnParseSlotsUnmapped) {
    btnParseSlotsUnmapped.addEventListener('click', () => {
      const text = textareaBulkSlots ? textareaBulkSlots.value.trim() : '';
      if (!text) {
        alert('미매핑 점포에 채워 넣을 케이스탯 슬롯 URL을 상단 입력창에 붙여넣어 주세요.');
        if (textareaBulkSlots) textareaBulkSlots.focus();
        return;
      }

      const extracted = parseBulkSlotInput(text);
      if (extracted.length === 0) {
        alert('입력된 텍스트에서 케이스탯 설문 URL을 찾을 수 없습니다.');
        return;
      }

      const existingUrls = new Set(
        parsedSlotsState
          .filter(s => s.slotUrl && s.slotUrl.trim())
          .map(s => s.slotUrl.trim())
      );
      const existingRanIds = new Set(
        parsedSlotsState
          .filter(s => s.ranId)
          .map(s => s.ranId)
      );

      // 이미 다른 점포에 매핑된 슬롯은 제외하고 신규 슬롯만 필터링
      const availableNewSlots = extracted.filter(s => {
        if (existingUrls.has(s.slotUrl)) return false;
        if (s.ranId && existingRanIds.has(s.ranId)) return false;
        return true;
      });

      if (availableNewSlots.length === 0) {
        alert('입력된 URL 중 아직 매핑되지 않은 신규 슬롯이 없습니다. (모두 이미 매핑되어 있습니다)');
        return;
      }

      let fillCursor = 0;
      let filledCount = 0;
      parsedSlotsState.forEach((slotItem, idx) => {
        if ((!slotItem.slotUrl || !slotItem.slotUrl.trim()) && fillCursor < availableNewSlots.length) {
          const nextSlot = availableNewSlots[fillCursor++];
          slotItem.slotUrl = nextSlot.slotUrl;
          slotItem.ranId = nextSlot.ranId;
          slotItem.slotIndex = idx + 1;
          slotItem.slotExtra = nextSlot.slotExtra || `(${idx})추가`;
          filledCount++;
        }
      });

      renderSlotPreviewTable();
      alert(`미매핑 점포 ${filledCount}곳에 신규 슬롯 URL을 순서대로 채웠습니다. 하단 [1:1 슬롯 매핑 적용 및 저장]을 눌러 확정해 주세요.`);
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
        alert('매핑할 슬롯 URL이 없습니다. 아래 표의 각 점포 URL 입력칸에 슬롯 URL을 입력하거나 상단 대량 입력창에서 파싱해 주세요.');
        return;
      }

      if (validSlots.length < total) {
        if (!confirm(`⚠️ 전체 ${total}개 점포 중 ${validSlots.length}개 점포에 슬롯이 지정되었습니다. (미매핑 ${total - validSlots.length}개)\n이대로 슬롯 매핑을 저장하시겠습니까?`)) {
          return;
        }
      }

      const resetStatus = checkResetQuotaStatus ? checkResetQuotaStatus.checked : false;

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
  // 6-2. 설문 작업실 내 [점포 수동 추가 & 슬롯 즉시 매핑] 모달 제어
  // ------------------------------------------------------------------------
  const modalCampaignAddMerchant = document.getElementById('modal-campaign-add-merchant');
  const btnOpenCampaignAddMerchant = document.getElementById('btn-open-campaign-add-merchant');
  const btnCloseCampaignAddModal = document.getElementById('btn-close-campaign-add-modal');
  const btnCancelCampaignAddModal = document.getElementById('btn-cancel-campaign-add-modal');
  const formCampaignAddMerchant = document.getElementById('form-campaign-add-merchant');

  const openCampaignAddMerchantModal = () => {
    if (!modalCampaignAddMerchant) return;
    modalCampaignAddMerchant.classList.add('is-open');
    const nameInput = document.getElementById('camp-add-company-name');
    if (nameInput) nameInput.focus();
  };
  const closeCampaignAddMerchantModal = () => {
    if (modalCampaignAddMerchant) modalCampaignAddMerchant.classList.remove('is-open');
  };

  if (btnOpenCampaignAddMerchant) btnOpenCampaignAddMerchant.addEventListener('click', openCampaignAddMerchantModal);
  if (btnCloseCampaignAddModal) btnCloseCampaignAddModal.addEventListener('click', closeCampaignAddMerchantModal);
  if (btnCancelCampaignAddModal) btnCancelCampaignAddModal.addEventListener('click', closeCampaignAddMerchantModal);

  if (formCampaignAddMerchant) {
    formCampaignAddMerchant.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentCampaign) return;
      if (!Array.isArray(currentCampaign.quotaDatabase)) {
        currentCampaign.quotaDatabase = [];
      }

      const companyName = document.getElementById('camp-add-company-name')?.value.trim() || '';
      const industry = document.getElementById('camp-add-industry')?.value.trim() || '기타소매';
      const bizNumber = document.getElementById('camp-add-biz-number')?.value.trim() || '';
      const ceoName = document.getElementById('camp-add-ceo-name')?.value.trim() || null;
      const ceoGender = document.getElementById('camp-add-ceo-gender')?.value.trim() || null;
      const ceoAgeRaw = document.getElementById('camp-add-ceo-age')?.value.trim() || '';
      const ceoAge = ceoAgeRaw ? parseInt(ceoAgeRaw, 10) : null;
      const phone = document.getElementById('camp-add-phone')?.value.trim() || null;
      const openDate = document.getElementById('camp-add-open-date')?.value.trim() || null;
      const address = document.getElementById('camp-add-address')?.value.trim() || null;
      const handledItems = document.getElementById('camp-add-handled-items')?.value.trim() || industry;
      const mainProducts = document.getElementById('camp-add-main-products')?.value.trim() || null;
      const rawSlotUrl = document.getElementById('camp-add-slot-url')?.value.trim() || '';

      const nextIdx = currentCampaign.quotaDatabase.length + 1;
      const slotMeta = rawSlotUrl ? normalizeSingleSlotInput(rawSlotUrl, nextIdx - 1) : null;
      const marketName = currentCampaign.quotaConfig?.marketName || currentCampaign.quotaDatabase[0]?.marketName || '전통시장';

      const newMerchant = {
        index: nextIdx,
        seq: nextIdx,
        source: 'MANUAL_USER_ADDED',
        marketName,
        companyName,
        industry: industry || extractStandardIndustry(handledItems),
        bizNumber,
        ceoName,
        ceoGender,
        ceoAge,
        phone,
        openDate,
        address,
        handledItems,
        mainProducts,
        status: '정상가맹',
        paperAccepted: 'Y',
        digitalAccepted: 'Y',
        quotaStatus: 'ready',
        usedAt: null,
        ...(slotMeta && slotMeta.slotUrl ? {
          slotUrl: slotMeta.slotUrl,
          surveyUrl: slotMeta.slotUrl,
          evalUrl: slotMeta.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${slotMeta.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null,
          ranId: slotMeta.ranId,
          slotIndex: slotMeta.slotIndex,
          slotExtra: slotMeta.slotExtra
        } : {})
      };

      currentCampaign.quotaDatabase.push(newMerchant);
      closeCampaignAddMerchantModal();
      formCampaignAddMerchant.reset();

      renderQuotaTable(currentCampaign.quotaDatabase);
      updateButtonStates();
      updateGroupStatsUI();
      await autoSaveCampaignQuotas();

      const slotMsg = (slotMeta && slotMeta.slotUrl)
        ? `\n(케이스탯 슬롯 #${nextIdx}${slotMeta.ranId ? ` [KID: ${slotMeta.ranId}]` : ''} 1:1 매핑 완료)`
        : `\n(슬롯 URL은 표의 [슬롯 미매핑] 배지 또는 상단 [슬롯 수동 매핑] 버튼에서 언제든 입력할 수 있습니다)`;
      alert(`새 점포 "${companyName}" (#${nextIdx})가 캠페인 및 원본 쿼터(Excel)에 추가되었습니다!${slotMsg}`);
    });
  }

  // ------------------------------------------------------------------------
  // 6. 실시간 타임라인 칩 제어
  // ------------------------------------------------------------------------
  function renderTimelineChips(isAssoc, isGallupReturnFarm = false) {
    const strip = document.getElementById('timeline-chips-strip');
    if (!strip) return;

    if (timelineStepperTitle) {
      timelineStepperTitle.textContent = isGallupReturnFarm
        ? '한국갤럽 귀농실태조사 타임라인 (Page 1 ~ 118 완료직전)'
        : (isAssoc ? '상인회 실태조사 타임라인 (25단계)' : '점포경영 실태조사 타임라인 (15단계)');
    }

    const steps = isGallupReturnFarm ? [
      '검색/방문기록',
      'SQ1~SQ7',
      'T3서명(P7)',
      '귀농동향(P10)',
      '준비/정착(P20)',
      '주거/농지(P50)',
      '영농활동(P65)',
      '지역융화(P83)',
      '경제/소득(P92)',
      '삶의질(P112)',
      'P118(완료직전)'
    ] : (isAssoc ? [
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
    ]);

    strip.innerHTML = steps.map(step => {
      const isFinal = (step.toLowerCase() === 'agree' || step.includes('P118'));
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
          setTimelineStep(currentCampaign?.surveyType === 'gallup_return_farm' ? 'P118(완료직전)' : 'Agree');
          setRunningState(false);
          await loadCampaign();
          if (currentCampaign?.surveyType === 'gallup_return_farm') {
            appendLog('success', `🎉 대상자 "${data.bizName || ''}" Page 118(NAME·PHONE·ADDR) 저장 완료! ([조사완료] 클릭 직전 상태에서 안전 대기 중)`);
          } else if (currentCampaign?.surveyType === 'globalri_literacy') {
            appendLog('success', `🎉 대상자 "${data.bizName || ''}" Part A ~ Part C 채점 저장 완료! (D1에서 수기 진행 대기 중 · 엑셀 내역 갱신됨)`);
          } else {
            appendLog('success', `🎉 1번 쿼터 "${data.bizName || ''}" 파일럿 검증 완료! Agree.asp 안전 대기 중.`);
          }
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

  // Kstat list.php / 한국리서치 TAPI / 글로벌리서치 GIFT 상태 실시간 동기화 버튼
  const btnSyncKstatStatus = document.getElementById('btn-sync-kstat-status');
  if (btnSyncKstatStatus) {
    btnSyncKstatStatus.addEventListener('click', async () => {
      if (!currentCampaign?.id) return;
      const isHrcEnergy = (currentCampaign.surveyType === 'hrc_energy');
      const isGlobalriLiteracy = (currentCampaign.surveyType === 'globalri_literacy');
      const isGallupReturnFarm = (currentCampaign.surveyType === 'gallup_return_farm');
      let lidFilterInput = '';
      if (isGlobalriLiteracy) {
        const promptVal = prompt(
          '[제5차 성인문해능력조사 - 글로벌리서치 GIFT 실시간 동기화]\n\n' +
          '• 비워두고 [확인] 클릭 시: 목록에서 [결과값1=완료 & 결과값2=완료] 가구 전체의 "진행 중" 가구원을 자동으로 불러옵니다.\n' +
          '• 특정 가구(LID)만 지정하려면 쉼표로 구분하여 입력해 주세요 (예: 029426, 006425):',
          ''
        );
        if (promptVal === null) return;
        lidFilterInput = promptVal.trim();
      }
      const originalText = btnSyncKstatStatus.innerHTML;
      btnSyncKstatStatus.disabled = true;
      btnSyncKstatStatus.innerHTML = isGallupReturnFarm
        ? '<i class="fa-solid fa-spinner fa-spin"></i> 한국갤럽(20263603) 동기화 중...'
        : (isGlobalriLiteracy
          ? '<i class="fa-solid fa-spinner fa-spin"></i> 글로벌리서치 GIFT 동기화 중...'
          : (isHrcEnergy
            ? '<i class="fa-solid fa-spinner fa-spin"></i> 한국리서치 TAPI 동기화 중...'
            : '<i class="fa-solid fa-spinner fa-spin"></i> Kstat 동기화 중...'));
      try {
        const endpoint = isGallupReturnFarm
          ? `/api/campaigns/${currentCampaign.id}/sync-gallup-status`
          : (isGlobalriLiteracy
            ? `/api/campaigns/${currentCampaign.id}/sync-globalri-literacy`
            : (isHrcEnergy
              ? `/api/campaigns/${currentCampaign.id}/sync-hrc-energy`
              : `/api/campaigns/${currentCampaign.id}/sync-kstat-status`));
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isGlobalriLiteracy ? JSON.stringify({ lidFilter: lidFilterInput }) : undefined
        });
        const data = await res.json();
        if (data.success) {
          alert(`✓ ${data.message}`);
          appendLog('success', `[${isGallupReturnFarm ? '한국갤럽 상태 동기화' : (isGlobalriLiteracy ? '글로벌리서치 GIFT 동기화' : (isHrcEnergy ? '한국리서치 TAPI 동기화' : 'Kstat 상태 동기화'))}] ${data.message}`);
          if (isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) {
            await loadCampaign();
            await loadBlueprint();
          }
        } else {
          alert(`동기화 실패: ${data.error || '알 수 없는 오류'}`);
          appendLog('error', `[상태 동기화 오류] ${data.error}`);
        }
      } catch (err) {
        alert(`동기화 요청 오류: ${err.message}`);
        appendLog('error', `[상태 동기화 통신 오류] ${err.message}`);
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
