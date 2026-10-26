/**
 * 조사 쿼터 생성기 프론트엔드 제어 스크립트 (quota-builder.js)
 * 마켓비즈 단독 수집 및 온누리상품권 전통시장 연계 하이브리드 수집 지원
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('quota-builder-form');
  const btnGenerate = document.getElementById('btn-generate-quota');

  const inputCurrentMode = document.getElementById('current-source-mode');
  const tabMarketBz = document.getElementById('tab-mode-marketbz');
  const tabOnnuri = document.getElementById('tab-mode-onnuri');
  const sectionMarketBz = document.getElementById('section-marketbz-mode');
  const sectionOnnuri = document.getElementById('section-onnuri-mode');

  // 공통 & 마켓비즈 인풋
  const inputTitle = document.getElementById('quota-title');
  const inputKeyword = document.getElementById('quota-keyword');
  const inputCount = document.getElementById('quota-count');

  // 온누리 연계 인풋
  const selectOnnuriRegion = document.getElementById('onnuri-region');
  const selectOnnuriDistrict = document.getElementById('onnuri-district');
  const inputOnnuriMarket = document.getElementById('onnuri-market-name');
  const inputOnnuriCount = document.getElementById('onnuri-quota-count');
  const datalistOnnuriMarkets = document.getElementById('onnuri-market-datalist');
  const wrapQuickMarkets = document.getElementById('district-quick-markets-wrap');
  const listQuickMarkets = document.getElementById('district-quick-markets');
  const labelQuickDistrictName = document.getElementById('quick-district-name');
  const badgeQuickMarketsCount = document.getElementById('quick-markets-count');

  // [신규] 층화 표본 추출 및 업종별 쿼터 엘리먼트
  const btnScanMarketStats = document.getElementById('btn-scan-market-stats');
  const marketStatsChips = document.getElementById('market-stats-chips');
  const marketStatsStatus = document.getElementById('market-stats-status');
  const btnModeStratified = document.getElementById('btn-mode-stratified');
  const btnModeSimple = document.getElementById('btn-mode-simple');
  const groupSimpleCount = document.getElementById('group-simple-count');
  const panelStratified = document.getElementById('panel-stratified-allocation');
  const stratifiedGridTable = document.getElementById('stratified-grid-table');
  const stratifiedTotalBadge = document.getElementById('stratified-total-badge');
  const checkSmartFallback = document.getElementById('check-smart-fallback');
  const btnPreset24 = document.getElementById('btn-preset-24');
  const btnPresetAllStock = document.getElementById('btn-preset-all-stock');
  const btnPresetEqual = document.getElementById('btn-preset-equal');
  const btnPresetProportional = document.getElementById('btn-preset-proportional');
  const btnPresetReset = document.getElementById('btn-preset-reset');

  const baseCheckboxes = document.querySelectorAll('input[name="base-fields"]');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnSelectCore = document.getElementById('btn-select-core');

  // 동적 항목 추가
  const inputNewField = document.getElementById('input-new-field');
  const btnAddField = document.getElementById('btn-add-field');
  const customChipList = document.getElementById('custom-fields-chip-list');

  // 엑셀 스프레드시트 뷰어
  const downloadActions = document.getElementById('download-actions');
  const linkExcelDownload = document.getElementById('link-excel-download');
  const linkJsonDownload = document.getElementById('link-json-download');
  const sheetTitleText = document.getElementById('sheet-title-text');
  const sheetRowCountBadge = document.getElementById('sheet-row-count-badge');
  const excelThead = document.getElementById('excel-grid-thead');
  const excelTbody = document.getElementById('excel-grid-tbody');
  const terminalLogs = document.getElementById('quota-terminal-logs');

  // [신규] 이어하기(Resume) 관련 엘리먼트
  const inputResumeFileName = document.getElementById('resume-file-name');
  const selectResumeQuota = document.getElementById('select-resume-quota');
  const btnClearResume = document.getElementById('btn-clear-resume');
  const panelResumeSelector = document.getElementById('panel-resume-selector');
  const resumeStatusHint = document.getElementById('resume-status-hint');
  const btnResumeFailedQuota = document.getElementById('btn-resume-failed-quota');

  const customFields = [];
  let lastCreatedQuota = null;
  let savedQuotasList = [];
  let isGeneratingQuota = false;

  // ==========================================
  // [0] 기존 쿼터 목록 로드 & 이어하기(Resume) 선택 제어
  // ==========================================
  async function loadSavedQuotasForResume(selectedFile = null) {
    if (!selectResumeQuota) return;
    try {
      const res = await fetch('/api/quota/list');
      const list = await res.json();
      if (!Array.isArray(list)) return;
      savedQuotasList = list;

      let html = '<option value="">✨ 새로 쿼터 생성하기 (기존 파일 선택 시 이어서 업데이트)</option>';
      list.forEach(q => {
        const isPartial = !q.isComplete || (q.mbzFailedCount && q.mbzFailedCount > 0) || (q.targetTotal && q.count < q.targetTotal);
        const statusTag = isPartial
          ? `[⚠️ 이어하기 권장: ${q.count}/${q.targetTotal || q.count}건${q.mbzFailedCount ? `, 마켓비즈 미연결 ${q.mbzFailedCount}건` : ''}]`
          : `[완료: ${q.count}건]`;
        const sel = (selectedFile && q.fileName === selectedFile) ? 'selected' : '';
        html += `<option value="${escapeHtml(q.fileName)}" ${sel}>${statusTag} ${escapeHtml(q.title)} (${escapeHtml(q.marketName || q.keyword || 'B2B')})</option>`;
      });
      selectResumeQuota.innerHTML = html;
    } catch (_) {}
  }

  async function selectQuotaForResume(fileName) {
    if (!fileName) {
      if (inputResumeFileName) inputResumeFileName.value = '';
      if (btnClearResume) btnClearResume.classList.add('hidden');
      if (panelResumeSelector) panelResumeSelector.classList.remove('active-resume');
      if (resumeStatusHint) {
        resumeStatusHint.textContent = '생성 도중 마켓비즈 연결 지연으로 멈췄거나 일부 누락된 쿼터를 선택하면, 이미 수집된 행은 보존하고 실패한 지점부터 빠르게 업데이트합니다.';
      }
      updateSubmitButtonLabel();
      return;
    }

    try {
      const res = await fetch(`/api/quota/${encodeURIComponent(fileName)}`);
      const json = await res.json();
      if (!res.ok || !json.quota) throw new Error(json.error || '쿼터 파일 로드 실패');

      const q = json.quota;
      if (inputResumeFileName) inputResumeFileName.value = fileName;
      if (btnClearResume) btnClearResume.classList.remove('hidden');
      if (panelResumeSelector) panelResumeSelector.classList.add('active-resume');

      // 수집 모드 및 폼 값 복원
      const isOnnuri = q.type === 'ONNURI_HYBRID' || Boolean(q.marketName);
      switchMode(isOnnuri ? 'onnuri' : 'marketbz', true);
      inputTitle.value = q.title || inputTitle.value;

      if (isOnnuri) {
        if (q.marketName) inputOnnuriMarket.value = q.marketName;
        if (q.requestParams) {
          if (q.requestParams.industryQuotas && Object.keys(q.requestParams.industryQuotas).length > 0) {
            Object.assign(industryCounts, q.requestParams.industryQuotas);
            renderStratifiedTable();
            updateStratifiedTotal();
          }
          if (q.requestParams.maxOpenYear && selectMaxOpenYearEl) {
            selectMaxOpenYearEl.value = String(q.requestParams.maxOpenYear);
          }
        }
        fetchMarketStats();
      } else {
        if (q.keyword) inputKeyword.value = q.keyword;
        if (q.targetTotal) inputCount.value = q.targetTotal;
      }

      const mbzFailedCount = (q.data || []).filter(r => r.mbzStatus === 'failed').length;
      const targetTotal = q.targetTotal || (isOnnuri ? getStratifiedTotal() : (q.count || 0));

      if (resumeStatusHint) {
        resumeStatusHint.innerHTML = `<strong>[이어하기 선택됨]</strong> 현재 <strong>${(q.data || []).length}/${targetTotal}건</strong> 저장됨${mbzFailedCount > 0 ? ` (마켓비즈 연결 지연 <strong>${mbzFailedCount}건</strong> 포함)` : ''} ➔ 이미 완료된 행은 건너뛰고 실패/미수집 지점부터 업데이트합니다.`;
      }

      // 우측 스프레드시트 뷰어에 현재까지 저장된 쿼터 즉시 미리보기 렌더링
      renderExcelGrid({
        title: q.title || fileName,
        count: (q.data || []).length,
        targetTotal,
        mbzFailedCount,
        isComplete: Boolean(q.isComplete && mbzFailedCount === 0 && (q.data || []).length >= targetTotal),
        columns: q.columns || [],
        data: q.data || [],
        jsonFileName: fileName,
        excelFileName: json.excelFileName || fileName.replace(/\.json$/i, '.xlsx'),
        jsonDownloadUrl: `/api/quota/download/${fileName}`,
        excelDownloadUrl: `/api/quota/download/${json.excelFileName || fileName.replace(/\.json$/i, '.xlsx')}`
      });

      updateSubmitButtonLabel();
      appendLog('info', `[이어하기 로드] "${q.title}" (기수집 ${(q.data || []).length}건) 불러오기 완료. 하단 버튼을 누르면 실패/누락 지점부터 즉시 업데이트합니다.`);
    } catch (err) {
      appendLog('error', `기존 쿼터 로드 실패: ${err.message}`);
    }
  }

  function updateSubmitButtonLabel() {
    const resumeFile = inputResumeFileName ? inputResumeFileName.value.trim() : '';
    const mode = inputCurrentMode.value;
    if (resumeFile) {
      btnGenerate.innerHTML = `<i class="fa-solid fa-rotate-right"></i> 실패/중단 지점부터 쿼터 이어하기 업데이트 (기존 데이터 보존)`;
    } else if (mode === 'onnuri') {
      btnGenerate.innerHTML = '<i class="fa-solid fa-store"></i> 온누리 ➔ 마켓비즈 연계 쿼터 만들기 (JSON & Excel)';
    } else {
      btnGenerate.innerHTML = '<i class="fa-solid fa-bolt"></i> 마켓비즈 조사 쿼터 만들기 (JSON & Excel)';
    }
  }

  if (selectResumeQuota) {
    selectResumeQuota.addEventListener('change', (e) => {
      selectQuotaForResume(e.target.value);
    });
  }

  if (btnClearResume) {
    btnClearResume.addEventListener('click', () => {
      if (selectResumeQuota) selectResumeQuota.value = '';
      selectQuotaForResume('');
    });
  }

  loadSavedQuotasForResume().then(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeParam = params.get('resume');
    if (resumeParam && selectResumeQuota) {
      selectResumeQuota.value = resumeParam;
      selectQuotaForResume(resumeParam);
    }
  });

  // ==========================================
  // [1] 수집 모드 탭 전환 로직
  // ==========================================
  function switchMode(mode, preserveResume = false) {
    inputCurrentMode.value = mode;
    if (!preserveResume && inputResumeFileName && inputResumeFileName.value) {
      if (selectResumeQuota) selectResumeQuota.value = '';
      selectQuotaForResume('');
    }
    if (mode === 'marketbz') {
      tabMarketBz.classList.add('active');
      tabOnnuri.classList.remove('active');

      sectionMarketBz.classList.remove('hidden');
      sectionOnnuri.classList.add('hidden');

      if (!preserveResume) inputTitle.value = '2026_소프트웨어_사업자_조사쿼터';
    } else {
      tabOnnuri.classList.add('active');
      tabMarketBz.classList.remove('active');

      sectionMarketBz.classList.add('hidden');
      sectionOnnuri.classList.remove('hidden');

      if (!preserveResume) {
        updateQuotaTitle();
      }

      if (selectOnnuriRegion.options.length <= 1) {
        loadOnnuriRegions();
      }
    }
    updateSubmitButtonLabel();
  }

  tabMarketBz.addEventListener('click', () => switchMode('marketbz'));
  tabOnnuri.addEventListener('click', () => switchMode('onnuri'));

  inputOnnuriMarket.addEventListener('input', () => {
    if (inputCurrentMode.value === 'onnuri') {
      inputTitle.value = `2026_${inputOnnuriMarket.value || '시장'}_온누리가맹점_조사쿼터`;
    }
  });

  // ==========================================
  // [2] 온누리 지역 및 시군구 동적 로드
  // ==========================================
  async function loadOnnuriRegions() {
    try {
      const res = await fetch('/api/onnuri/regions');
      const regions = await res.json();
      if (!Array.isArray(regions) || regions.length === 0) return;

      selectOnnuriRegion.innerHTML = regions.map(r => `
        <option value="${escapeHtml(r.code)}" ${r.name === '서울' ? 'selected' : ''}>${escapeHtml(r.name)}</option>
      `).join('');

      // 서울에 해당하는 시군구 로드
      const seoul = regions.find(r => r.name === '서울') || regions[0];
      await loadOnnuriDistricts(seoul.code);
    } catch (err) {
      appendLog('error', `온누리 시도 목록 로드 실패: ${err.message}`);
    }
  }

  async function loadOnnuriMarketsForDistrict(regionCode, districtCode, districtName = '') {
    if (!regionCode || !districtCode) {
      if (wrapQuickMarkets) wrapQuickMarkets.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/onnuri/markets?regionCode=${encodeURIComponent(regionCode)}&districtCode=${encodeURIComponent(districtCode)}`);
      const markets = await res.json();
      if (!Array.isArray(markets)) return;

      // 1. datalist 갱신 (자동완성 제안)
      if (datalistOnnuriMarkets) {
        datalistOnnuriMarkets.innerHTML = markets.map(m => `
          <option value="${escapeHtml(m.marketName)}">${escapeHtml(m.marketName)} (공인 가맹점 ${m.merchantCount}개)</option>
        `).join('');
      }

      // 2. 상점가 빠른 원클릭 선택 칩 렌더링
      if (wrapQuickMarkets && listQuickMarkets) {
        if (markets.length > 0) {
          wrapQuickMarkets.classList.remove('hidden');
          if (labelQuickDistrictName) labelQuickDistrictName.textContent = districtName || '해당 지역';
          if (badgeQuickMarketsCount) badgeQuickMarketsCount.textContent = `${markets.length}개 상점가·시장`;

          listQuickMarkets.innerHTML = markets.map(m => {
            const isSelected = inputOnnuriMarket && inputOnnuriMarket.value.trim() === m.marketName;
            return `
              <button type="button" class="quick-market-chip ${isSelected ? 'active' : ''}" data-name="${escapeHtml(m.marketName)}" title="${escapeHtml(m.marketName)} (클릭 시 자동 입력 및 현황조회)">
                <span>${escapeHtml(m.marketName)}</span>
                <span class="chip-cnt">${m.merchantCount}개</span>
              </button>
            `;
          }).join('');

          // 칩 클릭 이벤트: 입력창에 이름 대입 후 즉시 현황조회 실행
          listQuickMarkets.querySelectorAll('.quick-market-chip').forEach(btn => {
            btn.addEventListener('click', () => {
              const name = btn.getAttribute('data-name');
              if (inputOnnuriMarket) {
                inputOnnuriMarket.value = name;
                updateQuotaTitle();
              }
              listQuickMarkets.querySelectorAll('.quick-market-chip').forEach(c => c.classList.remove('active'));
              btn.classList.add('active');
              fetchMarketStats();
            });
          });
        } else {
          wrapQuickMarkets.classList.add('hidden');
        }
      }
    } catch (err) {
      console.warn('온누리 시장 목록 로드 실패:', err);
    }
  }

  async function loadOnnuriDistricts(regionCode) {
    try {
      const res = await fetch(`/api/onnuri/districts?regionCode=${regionCode}`);
      const districts = await res.json();
      if (!Array.isArray(districts)) return;

      selectOnnuriDistrict.innerHTML = districts.map(d => `
        <option value="${escapeHtml(d.code)}" ${d.name.includes('송파') ? 'selected' : ''}>${escapeHtml(d.name)}</option>
      `).join('');

      // 선택된 시군구의 시장/상점가 목록 즉시 로드
      const selectedDist = districts.find(d => d.name.includes('송파')) || districts[0];
      if (selectedDist) {
        await loadOnnuriMarketsForDistrict(regionCode, selectedDist.code, selectedDist.name);
      }
    } catch (err) {
      appendLog('error', `온누리 시군구 목록 로드 실패: ${err.message}`);
    }
  }

  selectOnnuriRegion.addEventListener('change', (e) => {
    loadOnnuriDistricts(e.target.value);
  });

  selectOnnuriDistrict.addEventListener('change', (e) => {
    const rCode = selectOnnuriRegion.value;
    const dCode = e.target.value;
    const selectedOption = e.target.options[e.target.selectedIndex];
    const dName = selectedOption ? selectedOption.textContent : '';
    loadOnnuriMarketsForDistrict(rCode, dCode, dName);
  });

  // ==========================================
  // [2-0] 온누리 전국 마스터 DB 상태 및 수동 최신화
  // ==========================================
  const badgeMasterStatus = document.getElementById('badge-master-db-status');
  const btnSyncMaster = document.getElementById('btn-sync-master-db');

  async function loadMasterDBStatus() {
    if (!badgeMasterStatus) return;
    try {
      const res = await fetch('/api/onnuri/master-status');
      const data = await res.json();
      if (data && data.loaded) {
        badgeMasterStatus.innerHTML = `<i class="fa-solid fa-circle-check text-success-color"></i> 전국 온누리 마스터 DB 정상 탑재 (${data.totalMarkets.toLocaleString()}개 시장 / ${data.totalMerchants.toLocaleString()}개 실존 가맹점)`;
      } else {
        badgeMasterStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-warn-color"></i> 마스터 DB 미탑재 (외부 실시간 API 연결 모드)`;
      }
    } catch (_) {
      badgeMasterStatus.innerHTML = `<i class="fa-solid fa-circle-check text-success-color"></i> 전국 온누리 마스터 DB 연동 중`;
    }
  }

  if (btnSyncMaster) {
    btnSyncMaster.addEventListener('click', async () => {
      const ok = confirm('전국 16개 시·도 온누리 가맹점 마스터 DB를 최신 상태로 백그라운드 동기화하시겠습니까?\n(약 1분 소요되며, 완료 시 자동으로 캐시가 갱신됩니다.)');
      if (!ok) return;

      btnSyncMaster.disabled = true;
      btnSyncMaster.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 동기화 요청 중...';
      try {
        const res = await fetch('/api/onnuri/sync-master', { method: 'POST' });
        const result = await res.json();
        appendLog('info', result.message || '마스터 DB 최신화가 백그라운드에서 시작되었습니다.');
        alert(result.message || '마스터 DB 최신화가 시작되었습니다.');
      } catch (err) {
        appendLog('error', `동기화 요청 실패: ${err.message}`);
        alert('동기화 요청에 실패했습니다: ' + err.message);
      } finally {
        setTimeout(() => {
          btnSyncMaster.disabled = false;
          btnSyncMaster.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> DB 최신화';
          loadMasterDBStatus();
        }, 3000);
      }
    });
  }

  // 초기 온누리 지역 및 마스터 DB 상태 로드
  loadMasterDBStatus();
  loadOnnuriRegions().then(() => {
    if (inputOnnuriMarket && inputOnnuriMarket.value.trim()) {
      fetchMarketStats();
    }
  });

  // ==========================================
  // [2-1] 층화 표본 추출 (Stratified Sampling) 설정 및 상태
  // ==========================================
  const STANDARD_INDUSTRIES = [
    { key: '농산물', label: '농산물', icon: 'fa-wheat-awn', defaultCount: 2 },
    { key: '축산물', label: '축산물', icon: 'fa-drumstick-bite', defaultCount: 2 },
    { key: '수산물', label: '수산물', icon: 'fa-fish', defaultCount: 2 },
    { key: '가공식품', label: '가공식품', icon: 'fa-jar', defaultCount: 3 },
    { key: '의류신발', label: '의류/신발', icon: 'fa-shirt', defaultCount: 2 },
    { key: '가정용품', label: '가정용품', icon: 'fa-house-chimney', defaultCount: 3, hasSmartFallback: true },
    { key: '음식점업', label: '음식점업', icon: 'fa-utensils', defaultCount: 4 },
    { key: '기타소매', label: '기타소매', icon: 'fa-store', defaultCount: 3 },
    { key: '근린상권', label: '근린상권', icon: 'fa-hospital-user', defaultCount: 3 }
  ];

  let currentSamplingMode = 'stratified'; // 'stratified' | 'simple'
  let currentMarketStats = null;
  const industryCounts = {
    '농산물': 2,
    '축산물': 2,
    '수산물': 2,
    '가공식품': 3,
    '의류신발': 2,
    '가정용품': 3,
    '음식점업': 4,
    '기타소매': 3,
    '근린상권': 3
  };

  function getStratifiedTotal() {
    return Object.values(industryCounts).reduce((acc, v) => acc + (parseInt(v, 10) || 0), 0);
  }

  function updateQuotaTitle() {
    if (inputCurrentMode.value === 'onnuri') {
      const mName = inputOnnuriMarket.value.trim() || '시장';
      if (currentSamplingMode === 'stratified') {
        inputTitle.value = `2026_${mName}_업종별${getStratifiedTotal()}개_조사쿼터`;
      } else {
        inputTitle.value = `2026_${mName}_온누리가맹점_조사쿼터`;
      }
    }
  }

  function updateStratifiedTotal() {
    const total = getStratifiedTotal();
    if (stratifiedTotalBadge) {
      stratifiedTotalBadge.textContent = `${total}개 설정 완료`;
      stratifiedTotalBadge.className = total === 24 ? 'badge-total-match' : 'badge-total-mismatch';
    }
    updateQuotaTitle();
  }

  // 실시간 시장 업종별 통계 조회 (개업연도 상한 연동)
  const selectMaxOpenYearEl = document.getElementById('max-open-year');
  if (selectMaxOpenYearEl) {
    selectMaxOpenYearEl.addEventListener('change', () => {
      fetchMarketStats();
    });
  }

  async function fetchMarketStats() {
    const mName = inputOnnuriMarket.value.trim() || '풍납시장';
    const rCode = selectOnnuriRegion.value || '01';
    const dCode = selectOnnuriDistrict.value || '01018';
    const maxOpenYear = selectMaxOpenYearEl ? selectMaxOpenYearEl.value : '2025';

    if (marketStatsStatus) marketStatsStatus.textContent = `${mName} 실시간 조회 중...`;

    try {
      const res = await fetch(`/api/onnuri/market-stats?regionCode=${encodeURIComponent(rCode)}&districtCode=${encodeURIComponent(dCode)}&marketName=${encodeURIComponent(mName)}&maxOpenYear=${encodeURIComponent(maxOpenYear)}`);
      if (!res.ok) throw new Error('조회 실패');
      const stats = await res.json();
      currentMarketStats = stats;
      renderMarketStats(stats);
      renderStratifiedTable();
      updateStratifiedTotal();
      if (marketStatsStatus) {
        const validCnt = stats.validYearCount !== undefined ? stats.validYearCount : (stats.totalRawCount || 0);
        const yearLabel = maxOpenYear === 'all' ? '전체' : `${maxOpenYear}년 이하`;
        marketStatsStatus.textContent = `${mName} (${yearLabel} 가용 ${validCnt}건 / 전체 ${stats.totalRawCount || 0}건)`;

        // [소규모 상점가 지능형 지원] 가용 가맹점이 24개 미만인 경우 실보유 전량 추출 유도 안내
        if (validCnt > 0 && validCnt < 24) {
          appendLog('info', `[💡 소규모 상점가 감지] "${mName}"은 공인 가용 점포가 총 ${validCnt}개입니다. 24개 미만 구역이므로 상단 [전량추출] 버튼을 누르면 실보유 수량에 100% 맞춰 자동 세팅됩니다.`);
        }
      }
    } catch (err) {
      if (marketStatsStatus) marketStatsStatus.textContent = '통계 조회 오류';
    }
  }

  function renderMarketStats(stats) {
    if (!marketStatsChips || !stats || !stats.categories) return;
    const cats = stats.categories;

    marketStatsChips.innerHTML = STANDARD_INDUSTRIES.map(ind => {
      const c = cats[ind.key] || { active: 0, withBiz: 0 };
      const isZero = (c.withBiz || 0) === 0;
      let extra = '';
      if (ind.hasSmartFallback && stats.householdSubstitutes > 0) {
        extra = `<span title="실질 대체 가능 점포"> (+대체 ${stats.householdSubstitutes})</span>`;
      }
      return `
        <span class="market-stat-chip ${isZero && (!ind.hasSmartFallback || !stats.householdSubstitutes) ? 'zero' : ''}">
          <i class="fa-solid ${ind.icon}"></i> ${escapeHtml(ind.label)}
          <span class="count">${c.withBiz || 0}</span>${extra}
        </span>
      `;
    }).join('');
  }

  function renderStratifiedTable() {
    if (!stratifiedGridTable) return;
    const cats = currentMarketStats ? currentMarketStats.categories : null;
    const subCount = currentMarketStats ? (currentMarketStats.householdSubstitutes || 0) : 0;

    stratifiedGridTable.innerHTML = STANDARD_INDUSTRIES.map(ind => {
      const val = industryCounts[ind.key] || 0;
      const stock = cats && cats[ind.key] ? (cats[ind.key].withBiz || 0) : 0;
      const effectiveStock = ind.hasSmartFallback ? stock + subCount : stock;

      let statusHtml = '<span class="badge-status-ok">● 충족 가능</span>';
      if (val === 0) {
        statusHtml = '<span class="badge-status-none">미배분</span>';
      } else if (stock < val && ind.hasSmartFallback && effectiveStock >= val) {
        statusHtml = '<span class="badge-status-smart">● 스마트 매핑</span>';
      } else if (stock < val) {
        statusHtml = `<span class="badge-status-err">▲ 부족 (${stock}개)</span>`;
      } else if (stock === val) {
        statusHtml = '<span class="badge-status-warn">● 전량 추출</span>';
      }

      return `
        <div class="stratified-row" data-key="${ind.key}">
          <div class="stratified-col-label">
            <i class="fa-solid ${ind.icon}"></i> <span>${escapeHtml(ind.label)}</span>
          </div>
          <div class="stratified-col-stock">
            보유 <strong>${stock}</strong>개${ind.hasSmartFallback && subCount > 0 ? `<span class="sub-stock-tag">+대체${subCount}</span>` : ''}
          </div>
          <div class="stratified-col-input">
            <div class="stepper-control">
              <button type="button" class="btn-stepper btn-minus" data-key="${ind.key}">-</button>
              <input type="text" class="input-stepper" data-key="${ind.key}" value="${val}" />
              <button type="button" class="btn-stepper btn-plus" data-key="${ind.key}">+</button>
            </div>
          </div>
          <div class="stratified-col-status">
            ${statusHtml}
          </div>
        </div>
      `;
    }).join('');

    // 스텝퍼 이벤트 연결
    stratifiedGridTable.querySelectorAll('.btn-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key');
        if (industryCounts[k] > 0) {
          industryCounts[k]--;
          renderStratifiedTable();
          updateStratifiedTotal();
        }
      });
    });

    stratifiedGridTable.querySelectorAll('.input-stepper').forEach(inp => { inp.addEventListener('change', () => { const k = inp.getAttribute('data-key'); const parsed = parseInt(inp.value, 10); industryCounts[k] = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed)); renderStratifiedTable(); updateStratifiedTotal(); }); });
    stratifiedGridTable.querySelectorAll('.btn-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key');
        if (industryCounts[k] < 100) {
          industryCounts[k]++;
          renderStratifiedTable();
          updateStratifiedTotal();
        }
      });
    });
  }

  // 프리셋 설정 이벤트
  if (btnPreset24) {
    btnPreset24.addEventListener('click', () => {
      const preset = { '농산물': 2, '축산물': 2, '수산물': 2, '가공식품': 3, '의류신발': 2, '가정용품': 3, '음식점업': 4, '기타소매': 3, '근린상권': 3 };
      Object.assign(industryCounts, preset);
      renderStratifiedTable();
      updateStratifiedTotal();
      appendLog('info', '24개 표준 쿼터 프리셋이 적용되었습니다 (합계 24개).');
    });
  }

  if (btnPresetAllStock) {
    btnPresetAllStock.addEventListener('click', () => {
      if (!currentMarketStats || !currentMarketStats.categories) {
        alert('먼저 시장 현황 조회를 완료해 주세요.');
        return;
      }
      const cats = currentMarketStats.categories;
      let totalAll = 0;
      STANDARD_INDUSTRIES.forEach(ind => {
        const stock = cats[ind.key] ? (cats[ind.key].withBiz || 0) : 0;
        industryCounts[ind.key] = Math.min(100, stock);
        totalAll += industryCounts[ind.key];
      });
      renderStratifiedTable();
      updateStratifiedTotal();
      appendLog('info', `[전량 추출 적용] 현재 상점가 실보유 가용 점포 총 ${totalAll}개가 100% 배분되었습니다.`);
    });
  }

  if (btnPresetEqual) {
    btnPresetEqual.addEventListener('click', () => {
      STANDARD_INDUSTRIES.forEach(ind => { industryCounts[ind.key] = 2; });
      renderStratifiedTable();
      updateStratifiedTotal();
      appendLog('info', '모든 업종에 균등 2개씩 배분되었습니다 (합계 18개).');
    });
  }

  if (btnPresetProportional) {
    btnPresetProportional.addEventListener('click', () => {
      if (!currentMarketStats || !currentMarketStats.categories) {
        alert('먼저 시장 현황 조회를 완료해 주세요.');
        return;
      }
      const cats = currentMarketStats.categories;
      const totalStock = Object.values(cats).reduce((acc, c) => acc + (c.withBiz || 0), 0);
      if (totalStock === 0) return;

      const targetTotal = 24;
      STANDARD_INDUSTRIES.forEach(ind => {
        const stock = cats[ind.key] ? (cats[ind.key].withBiz || 0) : 0;
        if (ind.key === '가정용품' && stock === 0) {
          industryCounts[ind.key] = 2; // 스마트 대체 기본값
        } else {
          industryCounts[ind.key] = Math.max(1, Math.round((stock / totalStock) * targetTotal));
        }
      });
      renderStratifiedTable();
      updateStratifiedTotal();
      appendLog('info', '시장 업종 실보유 비율에 맞춘 비례 배분이 적용되었습니다.');
    });
  }

  if (btnPresetReset) {
    btnPresetReset.addEventListener('click', () => {
      STANDARD_INDUSTRIES.forEach(ind => { industryCounts[ind.key] = 0; });
      renderStratifiedTable();
      updateStratifiedTotal();
      appendLog('info', '업종별 배분이 0개로 초기화되었습니다.');
    });
  }

  // 서브모드 토글
  if (btnModeStratified && btnModeSimple) {
    btnModeStratified.addEventListener('click', () => {
      currentSamplingMode = 'stratified';
      btnModeStratified.classList.add('active');
      btnModeSimple.classList.remove('active');
      if (panelStratified) panelStratified.classList.remove('hidden');
      if (groupSimpleCount) groupSimpleCount.classList.add('hidden');
      updateStratifiedTotal();
    });

    btnModeSimple.addEventListener('click', () => {
      currentSamplingMode = 'simple';
      btnModeSimple.classList.add('active');
      btnModeStratified.classList.remove('active');
      if (panelStratified) panelStratified.classList.add('hidden');
      if (groupSimpleCount) groupSimpleCount.classList.remove('hidden');
      updateQuotaTitle();
    });
  }

  if (btnScanMarketStats) {
    btnScanMarketStats.addEventListener('click', fetchMarketStats);
  }

  // 시장명 입력창에서 엔터 키 입력 시 전체 쿼터 생성이 아닌 [현황조회]만 안전하게 실행되도록 방어
  if (inputOnnuriMarket) {
    inputOnnuriMarket.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        fetchMarketStats();
      }
    });
  }

  // 폼 내 일반 텍스트 입력란에서 엔터 키 입력 시 무의도한 쿼터 생성 Submit 방지
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') {
      if (e.target.id === 'onnuri-market-name') {
        e.preventDefault();
        e.stopPropagation();
        fetchMarketStats();
      } else if (e.target.id !== 'input-new-field') {
        e.preventDefault();
      }
    }
  });

  // 초기 테이블 렌더링
  renderStratifiedTable();
  updateStratifiedTotal();

  // ==========================================
  // [3] 커스텀 항목 동적 추가 핸들러
  // ==========================================
  function addCustomField() {
    const val = inputNewField.value.trim();
    if (!val) return;
    if (customFields.includes(val)) {
      alert('이미 추가된 항목입니다.');
      return;
    }
    customFields.push(val);
    inputNewField.value = '';
    renderCustomChips();
    appendLog('info', `새로운 수집 항목이 추가되었습니다: "${val}"`);
  }

  function removeCustomField(field) {
    const idx = customFields.indexOf(field);
    if (idx !== -1) {
      customFields.splice(idx, 1);
      renderCustomChips();
    }
  }

  function renderCustomChips() {
    customChipList.innerHTML = customFields.map(f => `
      <span class="custom-field-chip">
        <i class="fa-solid fa-tag"></i> ${escapeHtml(f)}
        <i class="fa-solid fa-xmark chip-remove" data-field="${escapeHtml(f)}" title="삭제"></i>
      </span>
    `).join('');

    customChipList.querySelectorAll('.chip-remove').forEach(el => {
      el.addEventListener('click', () => {
        removeCustomField(el.getAttribute('data-field'));
      });
    });
  }

  btnAddField.addEventListener('click', addCustomField);
  inputNewField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomField();
    }
  });

  // 기본 필드 프리셋
  btnSelectAll.addEventListener('click', () => baseCheckboxes.forEach(cb => cb.checked = true));
  btnSelectCore.addEventListener('click', () => {
    const core = ['companyName', 'bizNumber', 'ceoName', 'phone', 'openDate', 'handledItems'];
    baseCheckboxes.forEach(cb => {
      cb.checked = core.includes(cb.value);
    });
  });

  // 실시간 터미널 로그 출력 헬퍼
  function appendLog(level, message, time = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const timestamp = time || new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
    entry.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-badge ${level}">${level.toUpperCase()}</span>
      <span class="log-msg">${escapeHtml(message)}</span>
    `;
    terminalLogs.appendChild(entry);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // SSE 연결 (실시간 로그 + QUOTA_CHECKPOINT 실시간 스프레드시트 행 추가)
  function initEventSource() {
    const sse = new EventSource('/api/events');
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          // [채널 필터링] 조사 쿼터 생성기 화면에서는 설문 자동화/배치 관련 로그를 엄격히 제외
          if (data.channel === 'survey') return;
          const msg = String(data.message || '');
          if (
            msg.includes('[배치') ||
            msg.includes('[파일럿') ||
            msg.includes('[ALERT]') ||
            msg.includes('Agree.asp') ||
            msg.includes('설문 알림') ||
            msg.includes('[세션 접속]') ||
            msg.includes('설문 자동화')
          ) {
            return;
          }
          appendLog(data.level, data.message, data.timestamp);
        } else if (data.type === 'QUOTA_CHECKPOINT') {
          // 사용자가 직접 쿼터 생성을 실행 중일 때만 실시간 화면 표 갱신 (초기 접속 시 과거 이벤트로 인한 오염 원천 차단)
          if (!isGeneratingQuota) return;
          if (data.jsonFileName && inputResumeFileName) {
            inputResumeFileName.value = data.jsonFileName;
          }
          renderExcelGrid(data, true);
        }
      } catch (_) {}
    };
  }
  initEventSource();

  // ==========================================
  // [4] 쿼터 만들기 & 실패 지점 이어하기 실행
  // ==========================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const mode = inputCurrentMode.value;
    const title = inputTitle.value.trim() || '조사쿼터';
    const baseFields = Array.from(document.querySelectorAll('input[name="base-fields"]:checked')).map(cb => cb.value);
    const checkAutoEnrich = document.getElementById('check-auto-enrich');
    const autoEnrich = checkAutoEnrich ? checkAutoEnrich.checked : true;
    const selectMaxOpenYear = document.getElementById('max-open-year');
    const maxOpenYear = selectMaxOpenYear ? selectMaxOpenYear.value : '2025';
    const resumeFileName = inputResumeFileName && inputResumeFileName.value ? inputResumeFileName.value.trim() : null;

    try {
      isGeneratingQuota = true;
      btnGenerate.disabled = true;
      if (btnResumeFailedQuota) btnResumeFailedQuota.disabled = true;

      let res, endpoint, payload;

      if (mode === 'onnuri') {
        const regionCode = selectOnnuriRegion.value;
        const districtCode = selectOnnuriDistrict.value;
        const marketName = inputOnnuriMarket.value.trim() || '풍납시장';
        const samplingMode = currentSamplingMode;
        const totalCount = samplingMode === 'stratified' ? getStratifiedTotal() : (parseInt(inputOnnuriCount.value, 10) || 24);
        const statusFilter = document.querySelector('input[name="onnuri-status"]:checked')?.value || 'ACTIVE';
        const paymentFilter = document.querySelector('input[name="onnuri-payment"]:checked')?.value || 'ALL';

        endpoint = '/api/quota/generate-onnuri';
        payload = {
          title,
          regionCode,
          districtCode,
          marketName,
          statusFilter,
          paymentFilter,
          targetCount: totalCount,
          samplingMode,
          industryQuotas: samplingMode === 'stratified' ? industryCounts : {},
          enableSmartFallback: checkSmartFallback ? checkSmartFallback.checked : true,
          baseFields,
          customFields,
          autoEnrich,
          maxOpenYear,
          resumeFileName
        };

        btnGenerate.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${resumeFileName ? '실패 지점부터 이어하기 업데이트 진행 중...' : '온누리 1차 수집 & 마켓비즈 2차 실시간 저장 진행 중...'}`;
        appendLog('info', `[온누리 연계 쿼터 ${resumeFileName ? '이어하기' : '생성'}] 시장: "${marketName}", 모드: ${samplingMode}, 목표: ${totalCount}개 가맹점${resumeFileName ? `, 대상파일: ${resumeFileName}` : ''}`);

      } else {
        // 마켓비즈 단독
        const keyword = inputKeyword.value.trim() || '소프트웨어';
        const targetCount = parseInt(inputCount.value, 10) || 2;

        endpoint = '/api/quota/generate';
        payload = {
          title,
          keyword,
          targetCount,
          baseFields,
          customFields,
          autoEnrich,
          maxOpenYear,
          resumeFileName
        };

        btnGenerate.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${resumeFileName ? '실패 지점부터 이어하기 업데이트 진행 중...' : 'MarketBz 실존 사업자 데이터 실시간 저장 중...'}`;
        appendLog('info', `[마켓비즈 쿼터 ${resumeFileName ? '이어하기' : '생성'}] 키워드: "${keyword}", 목표: ${targetCount}개 기업${resumeFileName ? `, 대상파일: ${resumeFileName}` : ''}`);
      }

      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '생성 실패');

      appendLog('success', result.message);

      // 엑셀 스프레드시트 테이블 렌더링
      renderExcelGrid(result, false);
      await loadSavedQuotasForResume(result.jsonFileName);

      if (result.jsonFileName && inputResumeFileName) {
        const hasPending = !result.isComplete || (result.mbzFailedCount && result.mbzFailedCount > 0) || (result.targetTotal && result.count < result.targetTotal);
        if (hasPending) {
          inputResumeFileName.value = result.jsonFileName;
          if (selectResumeQuota) selectResumeQuota.value = result.jsonFileName;
          if (btnClearResume) btnClearResume.classList.remove('hidden');
          if (panelResumeSelector) panelResumeSelector.classList.add('active-resume');
        } else {
          inputResumeFileName.value = '';
          if (btnClearResume) btnClearResume.classList.add('hidden');
          if (panelResumeSelector) panelResumeSelector.classList.remove('active-resume');
        }
      }

    } catch (err) {
      appendLog('error', `생성 중 연결 지연/중단: ${err.message} (현재까지 수집된 데이터는 파일에 자동 저장되었습니다. [실패 지점부터 이어하기]로 재개할 수 있습니다.)`);
      await loadSavedQuotasForResume(inputResumeFileName ? inputResumeFileName.value : null);
      alert(`쿼터 생성 중 연결 지연이 발생했습니다: ${err.message}\n\n현재까지 수집된 쿼터는 안전하게 저장되었습니다. [실패 지점부터 이어하기] 버튼을 눌러 중단된 지점부터 바로 이어서 완료하실 수 있습니다.`);
    } finally {
      isGeneratingQuota = false;
      btnGenerate.disabled = false;
      if (btnResumeFailedQuota) btnResumeFailedQuota.disabled = false;
      updateSubmitButtonLabel();
    }
  });

  // 엑셀 스프레드시트 렌더링 함수 (실시간 체크포인트 및 최종 완료 겸용)
  function renderExcelGrid(res, isLiveCheckpoint = false) {
    const {
      columns = [],
      data = [],
      title = '조사쿼터',
      count = 0,
      targetTotal = count,
      mbzFailedCount = 0,
      isComplete = true,
      jsonDownloadUrl,
      excelDownloadUrl
    } = res;

    const hasPending = !isComplete || mbzFailedCount > 0 || (targetTotal && count < targetTotal);

    if (isLiveCheckpoint && !isComplete) {
      sheetTitleText.innerHTML = `<span class="qb-sheet-ready-title">${escapeHtml(title)}</span> <span class="qb-sheet-ready-sub">(실시간 저장 중: ${count}/${targetTotal}건${mbzFailedCount > 0 ? ` · 마켓비즈 재시도 대기 ${mbzFailedCount}건` : ''})</span>`;
      sheetRowCountBadge.className = 'badge-status running';
      sheetRowCountBadge.textContent = `${count} / ${targetTotal}건 저장됨`;
    } else if (hasPending) {
      sheetTitleText.innerHTML = `<span class="qb-sheet-ready-title">${escapeHtml(title)}</span> <span class="qb-sheet-ready-sub">(부분 저장됨: ${count}/${targetTotal}건 · 마켓비즈 재시도 대상 ${mbzFailedCount}건)</span>`;
      sheetRowCountBadge.className = 'badge-status running';
      sheetRowCountBadge.textContent = `${count} / ${targetTotal}건 (이어하기 가능)`;
    } else {
      sheetTitleText.innerHTML = `<span class="qb-sheet-ready-title">${escapeHtml(title)}</span> <span class="qb-sheet-ready-sub">(생성 완료)</span>`;
      sheetRowCountBadge.className = 'badge-status success';
      sheetRowCountBadge.textContent = `${count}개 사업자 행`;
    }

    // 헤더(THEAD) 렌더링
    if (columns.length > 0) {
      let theadHtml = '<tr><th class="th-no">번호</th>';
      columns.forEach(col => {
        theadHtml += `<th>${escapeHtml(col.label || col.key)}</th>`;
      });
      theadHtml += '</tr>';
      excelThead.innerHTML = theadHtml;
    }

    // 본문(TBODY) 렌더링
    let tbodyHtml = '';
    data.forEach((row, idx) => {
      tbodyHtml += `<tr><td class="th-no">${idx + 1}</td>`;
      columns.forEach(col => {
        const rawVal = row[col.key] !== undefined ? row[col.key] : row[col.label];
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          tbodyHtml += `<td><span class="null-val-text">미상</span></td>`;
        } else {
          let cellContent = escapeHtml(String(rawVal));
          if (col.key === 'companyName' && row.mbzStatus === 'failed') {
            cellContent += ` <span class="badge-mbz-retry" title="마켓비즈 연결 지연 항목 (이어하기 실행 시 재조회)"><i class="fa-solid fa-rotate-right"></i>재시도대상</span>`;
          } else if (col.key === 'ceoName' && (row.isCeoEnriched || row.ceoSource)) {
            cellContent += ` <span class="badge-enriched" title="${escapeHtml(row.ceoSource || '외부 공인 정보 보강')}"><i class="fa-solid fa-sparkles"></i>보강</span>`;
          } else if (col.key === 'phone' && (row.isPhoneEnriched || row.phoneSource)) {
            cellContent += ` <span class="badge-enriched" title="${escapeHtml(row.phoneSource || '외부 검색 보강')}"><i class="fa-solid fa-sparkles"></i>보강</span>`;
          } else if (col.key === 'ceoGender') {
            const gClass = String(rawVal).includes('여') ? 'female' : 'male';
            cellContent = `<span class="badge-gender ${gClass}">${escapeHtml(String(rawVal))}</span>`;
          } else if (col.key === 'mainProducts') {
            cellContent = `<span class="badge-main-product">${escapeHtml(String(rawVal))}</span>`;
          }
          tbodyHtml += `<td>${cellContent}</td>`;
        }
      });
      tbodyHtml += '</tr>';
    });
    excelTbody.innerHTML = tbodyHtml;

    // 다운로드 및 액션 버튼 활성화
    if (excelDownloadUrl) linkExcelDownload.href = excelDownloadUrl;
    if (jsonDownloadUrl) linkJsonDownload.href = jsonDownloadUrl;
    const linkViewDetail = document.getElementById('link-view-detail');
    if (linkViewDetail && res.jsonFileName) {
      linkViewDetail.href = `quota-detail.html?file=${encodeURIComponent(res.jsonFileName)}`;
    }
    if (btnResumeFailedQuota) {
      if (hasPending && res.jsonFileName) {
        btnResumeFailedQuota.classList.remove('hidden');
        btnResumeFailedQuota.innerHTML = `<i class="fa-solid fa-rotate-right"></i> 실패 지점부터 이어하기 (${mbzFailedCount > 0 ? `재시도 ${mbzFailedCount}건` : `잔여 ${Math.max(0, targetTotal - count)}건`})`;
      } else {
        btnResumeFailedQuota.classList.add('hidden');
      }
    }
    downloadActions.classList.remove('hidden');

    // 마지막 생성된 쿼터 정보 보관
    lastCreatedQuota = res;
  }

  // [신규] 우측 툴바 '실패 지점부터 이어하기' 원클릭 실행 핸들러
  if (btnResumeFailedQuota) {
    btnResumeFailedQuota.addEventListener('click', () => {
      if (!lastCreatedQuota || !lastCreatedQuota.jsonFileName) return;
      if (inputResumeFileName) inputResumeFileName.value = lastCreatedQuota.jsonFileName;
      if (selectResumeQuota) selectResumeQuota.value = lastCreatedQuota.jsonFileName;
      form.requestSubmit();
    });
  }

  // [신규] '결측치 외부 재보강' 버튼 이벤트 핸들러
  const btnReEnrich = document.getElementById('btn-re-enrich-quota');
  if (btnReEnrich) {
    btnReEnrich.addEventListener('click', async () => {
      if (!lastCreatedQuota || !lastCreatedQuota.jsonFileName) {
        alert('먼저 조사 쿼터를 생성해 주세요.');
        return;
      }

      try {
        btnReEnrich.disabled = true;
        btnReEnrich.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 외부 공인 데이터 탐색 중...';
        appendLog('info', `[결측치 외부 재보강] "${lastCreatedQuota.title}" 외부 검색 탐색을 시작합니다...`);

        const res = await fetch('/api/quota/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: lastCreatedQuota.jsonFileName })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '보강 실패');

        appendLog('success', result.message);
        renderExcelGrid(result);
        alert(`결측치 외부 보강 완료!\n총 ${result.enrichedCount}건의 실존 데이터가 추가 보강되었습니다.`);
      } catch (err) {
        appendLog('error', `보강 오류: ${err.message}`);
        alert('결측치 보강 실패: ' + err.message);
      } finally {
        btnReEnrich.disabled = false;
        btnReEnrich.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 결측치 외부 재보강';
      }
    });
  }

  // [신규] '이 쿼터로 설문 시작' 버튼 이벤트 핸들러
  const btnCreateCamp = document.getElementById('btn-create-campaign-from-quota');
  if (btnCreateCamp) {
    btnCreateCamp.addEventListener('click', async () => {
      if (!lastCreatedQuota || !lastCreatedQuota.jsonFileName) {
        alert('먼저 조사 쿼터를 생성해 주세요.');
        return;
      }

      const qTitle = lastCreatedQuota.title || '조사쿼터';
      const defaultCampTitle = `${qTitle}_설문조사`;
      const campTitle = prompt('생성할 설문조사 캠페인 명칭을 입력하세요:', defaultCampTitle);
      if (!campTitle) return;

      try {
        btnCreateCamp.disabled = true;
        btnCreateCamp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 설문 생성 중...';

        const res = await fetch('/api/campaigns/create-from-quota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quotaFileName: lastCreatedQuota.jsonFileName,
            title: campTitle
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '캠페인 생성 실패');

        appendLog('success', `새 설문 캠페인이 생성되었습니다! (ID: ${data.campaign.id})`);
        alert(`"${data.campaign.title}" 설문 캠페인이 생성되었습니다!\n설문 상세 작업실로 이동합니다.`);
        window.location.href = `survey-detail.html?id=${data.campaign.id}`;
      } catch (err) {
        alert('캠페인 생성 실패: ' + err.message);
        btnCreateCamp.disabled = false;
        btnCreateCamp.innerHTML = '<i class="fa-solid fa-rocket"></i> 이 쿼터로 설문 시작';
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
