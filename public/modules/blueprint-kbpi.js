/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사]
 * STEP 2 마스터 응답 가이드라인 블루프린트 & 출제 브랜드 스캔('있음'/'없음') 선택 가이드 렌더러
 */
import { escapeHtml } from './blueprint-utils.js';

export const DEFAULT_KBPI_UI_POLICY = {
  pilotStopAtStep: 'Q4',
  stopBeforeFinalSubmit: true,
  purchaseYesRate: 90,
  unaided4thBrandRate: 35,
  aidedExtraMin: 2,
  aidedExtraMax: 4,
  q6NoRate: 80,
  teenAutoNoneUnfitCategories: true,
  autoSyncGoogleSheet: true,
  customFoodLivingChannels: '편의점, 동네슈퍼, 이마트, 쿠팡, 홈플러스, 롯데마트, GS25, CU, 컬리, 네이버쇼핑',
  proxyServer: ''
};

const guideUiState = {
  searchQuery: '',
  expFilter: 'all', // 'all' | 'has_none' | 'all_yes'
  scopeMode: 'all', // 'all' | 'checked'
  autoSyncOnToggle: true
};

function aggregateScannedCategories(quotaDatabase = [], scopeSeqSet = null) {
  const map = new Map();
  let scannedRespondentCount = 0;
  let totalAssignedSlots = 0;
  let yesSlotCount = 0;
  let noneSlotCount = 0;

  (Array.isArray(quotaDatabase) ? quotaDatabase : []).forEach((q, idx) => {
    const seq = Number(q.seq || q.index || (idx + 1));
    const cfgs = Array.isArray(q.categoryConfigs) ? q.categoryConfigs : [];
    const validCfgs = cfgs.filter(c => c && String(c.categoryName || '').trim());
    if (validCfgs.length > 0) {
      scannedRespondentCount++;
    }
    if (scopeSeqSet && !scopeSeqSet.has(seq)) {
      return;
    }

    validCfgs.forEach((cfg) => {
      const cleanName = String(cfg.categoryName || '').replace(/브랜드$/g, '').trim();
      if (!cleanName) return;
      totalAssignedSlots++;
      const exp = cfg.purchaseExp === '없음' ? '없음' : '있음';
      if (exp === '없음') noneSlotCount++;
      else yesSlotCount++;

      let entry = map.get(cleanName);
      if (!entry) {
        entry = {
          name: cleanName,
          total: 0,
          yesCount: 0,
          noneCount: 0,
          sampleRespondents: []
        };
        map.set(cleanName, entry);
      }
      entry.total++;
      if (exp === '없음') entry.noneCount++;
      else entry.yesCount++;
      if (entry.sampleRespondents.length < 5) {
        entry.sampleRespondents.push(`#${seq} ${q.name || ''} (${q.gender || ''}/${q.ageGroup || ''})`);
      }
    });
  });

  const categories = Array.from(map.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name, 'ko');
  });

  return {
    totalRespondents: Array.isArray(quotaDatabase) ? quotaDatabase.length : 0,
    scannedRespondentCount,
    totalAssignedSlots,
    yesSlotCount,
    noneSlotCount,
    categories
  };
}

export function refreshKbpiBrandScanGuidePanel({
  quotaDatabase = [],
  checkedKbpiSeqs = new Set(),
  onScanBrands = null,
  onBulkCategoryExp = null,
  onSyncFromSheet = null,
  onPushToSheet = null
} = {}) {
  const container = document.getElementById('kbpi-brand-scan-guide-panel');
  if (!container) return;

  const checkedCount = checkedKbpiSeqs instanceof Set ? checkedKbpiSeqs.size : 0;
  if (guideUiState.scopeMode === 'checked' && checkedCount === 0) {
    guideUiState.scopeMode = 'all';
  }
  const activeScopeSet = (guideUiState.scopeMode === 'checked' && checkedCount > 0)
    ? checkedKbpiSeqs
    : null;

  const stats = aggregateScannedCategories(quotaDatabase, activeScopeSet);
  const allStats = activeScopeSet ? aggregateScannedCategories(quotaDatabase, null) : stats;

  const hasNoneCatCount = stats.categories.filter(c => c.noneCount > 0).length;
  const allYesCatCount = stats.categories.filter(c => c.noneCount === 0).length;

  const query = guideUiState.searchQuery.trim().toLowerCase();
  const filteredCats = stats.categories.filter((c) => {
    if (query && !c.name.toLowerCase().includes(query)) return false;
    if (guideUiState.expFilter === 'has_none' && c.noneCount === 0) return false;
    if (guideUiState.expFilter === 'all_yes' && c.noneCount > 0) return false;
    return true;
  });

  const seoulCount = quotaDatabase.filter(q => String(q.region || '').includes('서울')).length;
  const incheonCount = quotaDatabase.filter(q => String(q.region || '').includes('인천')).length;

  container.innerHTML = `
    <div class="kbpi-card-head kbpi-card-head-between">
      <div class="flex-center-gap-8">
        <span class="kbpi-step-pill step-scan">STAGE 0 · 브랜드 스캔 가이드</span>
        <h3 class="kbpi-card-title">150명 신상명세 등록 &amp; 출제 브랜드 구입경험(있음 / 없음) 선택 가이드</h3>
      </div>
      <div class="kbpi-scan-action-bar">
        <button type="button" id="btn-kbpi-scan-all" class="btn-pill btn-pill-primary btn-pill-small font-bold">
          <i class="fa-solid fa-barcode"></i> 150명 신상명세 등록 &amp; 브랜드 전수 스캔
        </button>
        ${checkedCount > 0 ? `
          <button type="button" id="btn-kbpi-scan-selected" class="btn-pill btn-pill-secondary btn-pill-small font-bold">
            <i class="fa-solid fa-bullseye text-primary-color"></i> 체크 대상(${checkedCount}명)만 스캔
          </button>
        ` : ''}
        <button type="button" id="btn-kbpi-guide-pull-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
          <i class="fa-solid fa-cloud-arrow-down text-primary-color"></i> 시트 설정 불러오기
        </button>
        <button type="button" id="btn-kbpi-guide-push-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
          <i class="fa-solid fa-cloud-arrow-up text-success-color"></i> 구글 시트로 내보내기
        </button>
      </div>
    </div>

    <div class="kbpi-scan-kpi-strip">
      <div class="kbpi-kpi-box">
        <span class="kbpi-kpi-label">신상명세 표본 (서울 노원구 / 인천 남동구)</span>
        <strong class="kbpi-kpi-val">${allStats.totalRespondents}명 <span class="kbpi-kpi-sub">(${seoulCount}명 / ${incheonCount}명)</span></strong>
      </div>
      <div class="kbpi-kpi-box">
        <span class="kbpi-kpi-label">출제 브랜드 스캔 완료 인원</span>
        <strong class="kbpi-kpi-val text-primary-color">${allStats.scannedRespondentCount} / ${allStats.totalRespondents}명</strong>
      </div>
      <div class="kbpi-kpi-box">
        <span class="kbpi-kpi-label">추출된 고유 산업군 (총 슬롯)</span>
        <strong class="kbpi-kpi-val">${stats.categories.length}종 <span class="kbpi-kpi-sub">(총 ${stats.totalAssignedSlots}건)</span></strong>
      </div>
      <div class="kbpi-kpi-box">
        <span class="kbpi-kpi-label">구입경험 '있음' vs '없음' 설정 현황</span>
        <strong class="kbpi-kpi-val">
          <span class="kbpi-stat-yes">있음 ${stats.yesSlotCount}건</span> · <span class="kbpi-stat-none">없음 ${stats.noneSlotCount}건</span>
        </strong>
      </div>
    </div>

    ${stats.categories.length === 0 ? `
      <div class="kbpi-scan-empty-box">
        <i class="fa-solid fa-magnifying-glass-chart kbpi-scan-empty-icon"></i>
        <div class="kbpi-scan-empty-title">아직 출제 브랜드가 스캔되지 않았습니다.</div>
        <div class="kbpi-scan-empty-desc">
          상단의 <strong>[150명 신상명세 등록 &amp; 브랜드 전수 스캔]</strong> 버튼을 클릭하면 KMA CAPI에 응답자 신상명세와 조사구(서울 노원구 / 인천 남동구)를 등록하고, 배정된 약 18~20개 브랜드 목록을 추출하여 이곳과 구글 스프레드시트에 자동 기록합니다.
        </div>
      </div>
    ` : `
      <div class="kbpi-scan-toolbar">
        <div class="kbpi-scan-toolbar-left">
          <select id="sel-kbpi-guide-scope" class="figma-select kbpi-scope-select">
            <option value="all" ${guideUiState.scopeMode === 'all' ? 'selected' : ''}>적용 범위: 전체 응답자 (${allStats.totalRespondents}명)</option>
            <option value="checked" ${guideUiState.scopeMode === 'checked' ? 'selected' : ''} ${checkedCount === 0 ? 'disabled' : ''}>
              적용 범위: STEP 1 체크 대상자만 (${checkedCount}명)
            </option>
          </select>
          <input
            type="text"
            id="inp-kbpi-cat-search"
            class="figma-input kbpi-cat-search-input"
            placeholder="품목명 검색 (예: 우유, 병원, 카드, 세제...)"
            value="${escapeHtml(guideUiState.searchQuery)}"
          />
          <div class="kbpi-filter-pills">
            <button type="button" class="kbpi-filter-pill ${guideUiState.expFilter === 'all' ? 'is-active' : ''}" data-exp-filter="all">
              전체 (${stats.categories.length})
            </button>
            <button type="button" class="kbpi-filter-pill ${guideUiState.expFilter === 'has_none' ? 'is-active' : ''}" data-exp-filter="has_none">
              '없음' 포함 (${hasNoneCatCount})
            </button>
            <button type="button" class="kbpi-filter-pill ${guideUiState.expFilter === 'all_yes' ? 'is-active' : ''}" data-exp-filter="all_yes">
              전원 '있음' (${allYesCatCount})
            </button>
          </div>
        </div>
        <div class="kbpi-scan-toolbar-right">
          <label class="custom-cb-label kbpi-inline-cb" title="체크 시 품목의 있음/없음을 클릭할 때마다 구글 스프레드시트에도 즉시 반영합니다">
            <input type="checkbox" id="chk-kbpi-guide-sync-sheet" ${guideUiState.autoSyncOnToggle ? 'checked' : ''} />
            <span>변경 시 시트 자동반영</span>
          </label>
          <button type="button" id="btn-kbpi-bulk-all-yes" class="btn-pill btn-pill-secondary btn-pill-small" title="현재 적용 범위의 모든 스캔 품목을 '있음'으로 설정합니다">
            전체 '있음'
          </button>
          <button type="button" id="btn-kbpi-bulk-all-none" class="btn-pill btn-pill-secondary btn-pill-small" title="현재 적용 범위의 모든 스캔 품목을 '없음'으로 설정합니다">
            전체 '없음'
          </button>
          <button type="button" id="btn-kbpi-bulk-auto-rec" class="btn-pill btn-pill-secondary btn-pill-small" title="10대 미성년 및 성별 전용 부적합 품목만 자동으로 '없음' 처리하고 나머지는 '있음'으로 추천 설정합니다">
            연령·성별 추천 적용
          </button>
        </div>
      </div>

      <div id="kbpi-scanned-cat-grid" class="kbpi-scanned-cat-grid">
        ${filteredCats.length === 0 ? `
          <div class="kbpi-cat-filter-empty">검색/필터 조건에 일치하는 출제 브랜드 품목이 없습니다.</div>
        ` : filteredCats.map(cat => {
          const isAllYes = cat.yesCount > 0 && cat.noneCount === 0;
          const isAllNone = cat.noneCount > 0 && cat.yesCount === 0;
          const isMixed = cat.yesCount > 0 && cat.noneCount > 0;
          const cardStateCls = isAllNone ? 'state-none' : (isMixed ? 'state-mixed' : 'state-yes');
          const tooltip = `배정 ${cat.total}명 (있음 ${cat.yesCount} / 없음 ${cat.noneCount}) — 예: ${cat.sampleRespondents.join(', ')}`;
          return `
            <div class="kbpi-cat-card ${cardStateCls}" title="${escapeHtml(tooltip)}">
              <div class="kbpi-cat-card-info">
                <div class="kbpi-cat-card-name">${escapeHtml(cat.name)}</div>
                <div class="kbpi-cat-card-meta">
                  <span>출제 ${cat.total}명</span>
                  ${isMixed ? `<span class="kbpi-mixed-tag">있음 ${cat.yesCount} · 없음 ${cat.noneCount}</span>` : ''}
                </div>
              </div>
              <div class="kbpi-cat-toggle-group">
                <button
                  type="button"
                  class="kbpi-exp-btn ${isAllYes ? 'is-active-yes' : ''}"
                  data-cat-name="${escapeHtml(cat.name)}"
                  data-exp-val="있음"
                >있음</button>
                <button
                  type="button"
                  class="kbpi-exp-btn ${isAllNone ? 'is-active-none' : ''}"
                  data-cat-name="${escapeHtml(cat.name)}"
                  data-exp-val="없음"
                >없음</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  const getTargetSeqArray = () => {
    if (guideUiState.scopeMode === 'checked' && checkedCount > 0) {
      return Array.from(checkedKbpiSeqs);
    }
    return null;
  };

  const btnScanAll = container.querySelector('#btn-kbpi-scan-all');
  if (btnScanAll && typeof onScanBrands === 'function') {
    btnScanAll.addEventListener('click', () => onScanBrands({ onlySelected: false }));
  }
  const btnScanSel = container.querySelector('#btn-kbpi-scan-selected');
  if (btnScanSel && typeof onScanBrands === 'function') {
    btnScanSel.addEventListener('click', () => onScanBrands({ onlySelected: true }));
  }
  const btnPull = container.querySelector('#btn-kbpi-guide-pull-sheet');
  if (btnPull && typeof onSyncFromSheet === 'function') {
    btnPull.addEventListener('click', () => onSyncFromSheet());
  }
  const btnPush = container.querySelector('#btn-kbpi-guide-push-sheet');
  if (btnPush && typeof onPushToSheet === 'function') {
    btnPush.addEventListener('click', () => onPushToSheet());
  }

  const scopeSel = container.querySelector('#sel-kbpi-guide-scope');
  if (scopeSel) {
    scopeSel.addEventListener('change', () => {
      guideUiState.scopeMode = scopeSel.value === 'checked' ? 'checked' : 'all';
      refreshKbpiBrandScanGuidePanel({
        quotaDatabase,
        checkedKbpiSeqs,
        onScanBrands,
        onBulkCategoryExp,
        onSyncFromSheet,
        onPushToSheet
      });
    });
  }

  const searchInp = container.querySelector('#inp-kbpi-cat-search');
  if (searchInp) {
    searchInp.addEventListener('input', () => {
      const cursor = searchInp.selectionStart;
      guideUiState.searchQuery = searchInp.value;
      refreshKbpiBrandScanGuidePanel({
        quotaDatabase,
        checkedKbpiSeqs,
        onScanBrands,
        onBulkCategoryExp,
        onSyncFromSheet,
        onPushToSheet
      });
      const nextInp = document.getElementById('inp-kbpi-cat-search');
      if (nextInp) {
        nextInp.focus();
        if (typeof cursor === 'number') nextInp.setSelectionRange(cursor, cursor);
      }
    });
  }

  const syncCb = container.querySelector('#chk-kbpi-guide-sync-sheet');
  if (syncCb) {
    syncCb.addEventListener('change', () => {
      guideUiState.autoSyncOnToggle = Boolean(syncCb.checked);
    });
  }

  container.querySelectorAll('[data-exp-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      guideUiState.expFilter = pill.getAttribute('data-exp-filter') || 'all';
      refreshKbpiBrandScanGuidePanel({
        quotaDatabase,
        checkedKbpiSeqs,
        onScanBrands,
        onBulkCategoryExp,
        onSyncFromSheet,
        onPushToSheet
      });
    });
  });

  const btnAllYes = container.querySelector('#btn-kbpi-bulk-all-yes');
  if (btnAllYes && typeof onBulkCategoryExp === 'function') {
    btnAllYes.addEventListener('click', () => {
      onBulkCategoryExp({
        mode: 'all',
        purchaseExp: '있음',
        targetSeqs: getTargetSeqArray(),
        syncSheet: guideUiState.autoSyncOnToggle
      });
    });
  }

  const btnAllNone = container.querySelector('#btn-kbpi-bulk-all-none');
  if (btnAllNone && typeof onBulkCategoryExp === 'function') {
    btnAllNone.addEventListener('click', () => {
      onBulkCategoryExp({
        mode: 'all',
        purchaseExp: '없음',
        targetSeqs: getTargetSeqArray(),
        syncSheet: guideUiState.autoSyncOnToggle
      });
    });
  }

  const btnAutoRec = container.querySelector('#btn-kbpi-bulk-auto-rec');
  if (btnAutoRec && typeof onBulkCategoryExp === 'function') {
    btnAutoRec.addEventListener('click', () => {
      onBulkCategoryExp({
        mode: 'auto_recommend',
        targetSeqs: getTargetSeqArray(),
        syncSheet: guideUiState.autoSyncOnToggle
      });
    });
  }

  container.querySelectorAll('.kbpi-exp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const catName = btn.getAttribute('data-cat-name') || '';
      const expVal = btn.getAttribute('data-exp-val') || '있음';
      if (catName && typeof onBulkCategoryExp === 'function') {
        onBulkCategoryExp({
          mode: 'category',
          categoryName: catName,
          purchaseExp: expVal,
          targetSeqs: getTargetSeqArray(),
          syncSheet: guideUiState.autoSyncOnToggle
        });
      }
    });
  });
}

export function renderKmacKbpiBlueprint(data = {}, {
  campId = '',
  quotaDatabase = [],
  checkedKbpiSeqs = new Set(),
  blueprintStageGrid,
  badgeMasterStatus,
  btnSaveBaseline,
  onScanBrands = null,
  onBulkCategoryExp = null,
  onSyncFromSheet = null,
  onPushToSheet = null,
  onInspectHtml = null
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_UI_POLICY,
    ...(data.policy || {})
  };
  const sheetUrl = data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg/edit';
  const htmlReportUrl = campId ? `/api/campaigns/${encodeURIComponent(campId)}/kbpi-html-report` : '#';

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  const presetGroup = document.querySelector('.blueprint-preset-group');
  const templatePicker = document.querySelector('.blueprint-template-picker');
  const step2JumpLabel = document.getElementById('quick-jump-step2-label');
  const step2TitleEl = document.querySelector('#section-master-blueprint .step-card-title');
  const step2SubEl = document.querySelector('.blueprint-header-subtitle');

  if (groupNav) groupNav.classList.add('hidden');
  if (presetGroup) presetGroup.classList.add('hidden');
  if (templatePicker) templatePicker.classList.add('hidden');
  if (step2JumpLabel) {
    step2JumpLabel.innerHTML = '<i class="fa-solid fa-sliders"></i> 브랜드 스캔 &amp; K-BPI 응답 가이드';
  }
  if (step2TitleEl) {
    step2TitleEl.textContent = '2027년 K-BPI 출제 브랜드 스캔(있음/없음) & 전 문항 응답 가이드라인';
  }
  if (step2SubEl) {
    step2SubEl.textContent = '150명 신상명세·조사구 등록 · 출제 브랜드 있음/없음 선택 가이드 · DQ1(생성형AI·신문잡지 제외 랜덤 2개) · ZQ1~ZQ5 시트 연동 · ZQ6(없다) 안전 대기를 통합 관리합니다.';
  }
  if (badgeMasterStatus) {
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> K-BPI v3.0 실측 엔진 활성 (150명 신상·스캔 · DQ1/ZQ1~ZQ6 완벽 정합)';
  }
  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> K-BPI 응답 가이드 저장';
  }

  if (!blueprintStageGrid) return policy;
  blueprintStageGrid.className = 'kbpi-blueprint-wrap';

  blueprintStageGrid.innerHTML = `
    <div class="kbpi-guide-grid">
      <!-- 카드 0: 출제 브랜드 스캔 & 구입경험(있음/없음) 선택 가이드 -->
      <div id="kbpi-brand-scan-guide-panel" class="kbpi-guide-card kbpi-guide-card-wide kbpi-scan-guide-card"></div>

      <!-- 카드 1: 진입 · 신상명세 · 조사구 · 후반부 DQ1/ZQ1~ZQ6 규칙 -->
      <div class="kbpi-guide-card">
        <div class="kbpi-card-head">
          <span class="kbpi-step-pill">STAGE 1</span>
          <h3 class="kbpi-card-title">신상명세 150건 · 조사구(노원/남동구) · 후반부 DQ1 &amp; ZQ1~ZQ6</h3>
        </div>
        <ul class="kbpi-rule-list">
          <li><strong>신상명세 150명 &amp; 조사지역(M_CHECK · GP1):</strong> <code>5911000005645</code> 시트 150명 자동 등록(<code>[응답자 확인]</code> 통과) · <code>서울=노원구</code>(노원구청 GPS · 19개 동 분산) / <code>인천=남동구</code>(인천광역시청 GPS · 20개 동 분산) · <code>SQ1</code> 전원 <strong>"없다"</strong></li>
          <li><strong>3.1 정보 습득 경로 (DQ1, 2개 복수선택):</strong> <strong><code>생성형 AI</code> · <code>신문/잡지/카탈로그</code> · <code>기타</code>를 제외</strong>한 나머지 7개 보기 중 <strong>랜덤 2개 자동 선택</strong></li>
          <li><strong>3.2 배경변인 (ZQ1~ZQ5_2):</strong> 구글 스프레드시트의 <strong><code>학력 · 직업 · 가구소득 · 결혼여부 · 가족수 · 자녀수</code></strong> 컬럼 값과 1:1 매칭하여 자동 선택 (1인가구 시 자녀수 <code>해당사항 없음</code> 자동 보정)</li>
          <li><strong>3.3 패널 가입 의향 (ZQ6) &amp; 안전 대기:</strong> 전원 <strong><code>"없다"</code></strong> 선택 후, 완료 직전 안전 대기(<code>ZQ6</code>) 상태에서 정지하여 응답 검수 보장</li>
        </ul>
      </div>

      <!-- 카드 2: 문항 1~8 브랜드 인지도 및 확장 매트릭스 정합성 -->
      <div class="kbpi-guide-card">
        <div class="kbpi-card-head">
          <span class="kbpi-step-pill">STAGE 2</span>
          <h3 class="kbpi-card-title">문항 1 ~ 8 공식 브랜드(QO) · 구입경험(있음/없음) 연동 규칙</h3>
        </div>
        <ul class="kbpi-rule-list">
          <li><strong>문항 1·2 (547개 전 산업군 QO 직결):</strong> <code>QO.INDUSTRY.ANSWERS</code> 공식 브랜드 자동 조회 ➔ <code>1-1~1-3</code> 순차 입력 + <code>1-4</code> 추가 또는 전용 <code>없음(NOA)</code> 체크, <code>문항 2</code> 2~4개 추가 선택</li>
          <li><strong>문항 3 (표준 13행 &amp; 확장 16행 통합):</strong> <code>1~9</code> 점수 분산 ➔ <code>6-1</code> 추천점수 연동 사유 ➔ <code>6-2</code> 추천경험 정합 ➔ <code>6-3 ↔ 문항 6</code> AI 검색경험 100% 일치(<code>예</code> 선택 시 <code>6-1·6-2</code> 척도 응답)</li>
          <li><strong>구입경험 '없음' 절대 규칙:</strong> 가이드/시트에서 <code>없음</code> 지정 시 <code>11번 태도</code> <code>1·2·3번</code>만 선택(<code>4·5번</code> 금지) + <code>6-2</code> 직접추천 배제(<code>3·4번</code>) + <code>13번</code> '아니오' + <code>문항 4·5</code> '없음'</li>
          <li><strong>특수 산업군 &amp; 문항 4-1·7·8:</strong> NGO(후원의향)·진단검사센터·세탁세제(제형) 전용 문항 자동 처리, 업종별 맞춤 채널 매핑 및 <code>문항 7·8</code> 기타 제외 1·2순위 선택</li>
        </ul>
      </div>

      <!-- 카드 3: 세부 비율 · 정지 지점 · 채널 설정 컨트롤 -->
      <div class="kbpi-guide-card kbpi-guide-card-wide">
        <div class="kbpi-card-head kbpi-card-head-between">
          <div class="flex-center-gap-8">
            <span class="kbpi-step-pill step-tunable">STAGE 3</span>
            <h3 class="kbpi-card-title">세부 확률 · 단건검증 정지 지점 · 구입 채널 · HTML 구조 분석</h3>
          </div>
          <div class="flex-center-gap-8">
            <button type="button" id="btn-kbpi-inspect-html" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-microscope text-primary-color"></i> 전 문항 HTML·구조 정밀 추출
            </button>
            <a id="link-kbpi-download-html" href="${escapeHtml(htmlReportUrl)}" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-file-arrow-down text-primary-color"></i> HTML 분석 JSON 다운로드
            </a>
            <a href="${escapeHtml(sheetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-table text-success-color"></i> 구글 시트 열기
            </a>
            <button type="button" id="btn-kbpi-pull-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-cloud-arrow-down text-primary-color"></i> 시트 설정 불러오기
            </button>
            <button type="button" id="btn-kbpi-push-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-cloud-arrow-up"></i> 시트로 내보내기
            </button>
          </div>
        </div>

        <div class="kbpi-controls-grid">
          <div class="form-group">
            <label class="figma-label font-bold" for="sel-kbpi-pilot-stop">파일럿(단건 검증) 정지 지점</label>
            <select id="sel-kbpi-pilot-stop" class="figma-select">
              <option value="SCAN_BRANDS" ${policy.pilotStopAtStep === 'SCAN_BRANDS' ? 'selected' : ''}>신상명세 등록 + 출제 브랜드 스캔 직후 정지</option>
              <option value="Q4" ${policy.pilotStopAtStep === 'Q4' ? 'selected' : ''}>1번째 품목 [문항 4] 도달 시 안전 정지</option>
              <option value="FINAL_GATE" ${policy.pilotStopAtStep === 'FINAL_GATE' ? 'selected' : ''}>전 품목 + DQ1 + ZQ1~ZQ6('없다') 응답 후 완료 직전(99%) 정지</option>
            </select>
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-purchase-rate">시트 미지정 품목 기본 구입경험 '있음' 비율 (%)</label>
            <input type="number" id="num-kbpi-purchase-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.purchaseYesRate ?? 90)}" />
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-q6-no-rate">문항 6 &amp; 6-3 '아니오' 응답 비율 (%) (가이드: 80%)</label>
            <input type="number" id="num-kbpi-q6-no-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.q6NoRate ?? 80)}" />
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-q1-4-rate">문항 1-4 추가 브랜드 기재 비율 (%) (나머지 '없음' 체크)</label>
            <input type="number" id="num-kbpi-q1-4-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.unaided4thBrandRate ?? 35)}" />
          </div>

          <div class="form-group kbpi-span-2">
            <label class="figma-label font-bold" for="inp-kbpi-food-channels">문항 4-1 식음료 · 생활소비재 구입 채널 풀 (쉼표 구분 — 서비스·병원·금융 등은 업종별 전용 채널 자동 적용)</label>
            <input type="text" id="inp-kbpi-food-channels" class="figma-input" value="${escapeHtml(policy.customFoodLivingChannels || DEFAULT_KBPI_UI_POLICY.customFoodLivingChannels)}" />
          </div>

          <div class="form-group">
            <label class="custom-cb-label mt-6">
              <input type="checkbox" id="chk-kbpi-teen-guard" ${policy.teenAutoNoneUnfitCategories !== false ? 'checked' : ''} />
              <span>연령·성별 비적합 품목(10대 사이버대학·신용카드·렌터카·주류·대형가전 등) 시트 미지정 시 자동 '없음' 보정</span>
            </label>
          </div>

          <div class="form-group">
            <label class="custom-cb-label mt-6">
              <input type="checkbox" id="chk-kbpi-auto-sheet" ${policy.autoSyncGoogleSheet !== false ? 'checked' : ''} />
              <span>실행 직후 구글 시트(진행상태 · 배경변인 · 조사구/동 · 출제 전 품목 브랜드N · 구입경험N) 실시간 자동 기입</span>
            </label>
          </div>

          <div class="form-group kbpi-span-2">
            <label class="figma-label font-bold" for="inp-kbpi-proxy-server">국내(서울 리전) 프록시 경유 주소 (선택 — 서울 리전 VM에서 직접 구동 시 비워둠)</label>
            <input type="text" id="inp-kbpi-proxy-server" class="figma-input font-mono" placeholder="예: http://10.178.0.3:8888 (서울 VM 직접 구동 시 공란)" value="${escapeHtml(policy.proxyServer || '')}" />
          </div>
        </div>
      </div>
    </div>
  `;

  refreshKbpiBrandScanGuidePanel({
    quotaDatabase,
    checkedKbpiSeqs,
    onScanBrands,
    onBulkCategoryExp,
    onSyncFromSheet,
    onPushToSheet
  });

  const btnInspect = document.getElementById('btn-kbpi-inspect-html');
  if (btnInspect && typeof onInspectHtml === 'function') {
    btnInspect.addEventListener('click', () => onInspectHtml());
  }
  const btnPull = document.getElementById('btn-kbpi-pull-sheet');
  if (btnPull && typeof onSyncFromSheet === 'function') {
    btnPull.addEventListener('click', () => onSyncFromSheet());
  }
  const btnPush = document.getElementById('btn-kbpi-push-sheet');
  if (btnPush && typeof onPushToSheet === 'function') {
    btnPush.addEventListener('click', () => onPushToSheet());
  }

  return policy;
}

export function collectKmacKbpiPolicyFromDom(fallback = {}) {
  const pilotStopEl = document.getElementById('sel-kbpi-pilot-stop');
  const purchaseRateEl = document.getElementById('num-kbpi-purchase-rate');
  const q6NoRateEl = document.getElementById('num-kbpi-q6-no-rate');
  const q14RateEl = document.getElementById('num-kbpi-q1-4-rate');
  const foodChEl = document.getElementById('inp-kbpi-food-channels');
  const teenGuardEl = document.getElementById('chk-kbpi-teen-guard');
  const autoSheetEl = document.getElementById('chk-kbpi-auto-sheet');
  const proxyEl = document.getElementById('inp-kbpi-proxy-server');

  return {
    ...DEFAULT_KBPI_UI_POLICY,
    ...fallback,
    pilotStopAtStep: pilotStopEl ? pilotStopEl.value : (fallback.pilotStopAtStep || 'Q4'),
    purchaseYesRate: purchaseRateEl ? Number(purchaseRateEl.value) : Number(fallback.purchaseYesRate ?? 90),
    q6NoRate: q6NoRateEl ? Number(q6NoRateEl.value) : Number(fallback.q6NoRate ?? 80),
    unaided4thBrandRate: q14RateEl ? Number(q14RateEl.value) : Number(fallback.unaided4thBrandRate ?? 35),
    customFoodLivingChannels: foodChEl ? foodChEl.value.trim() : (fallback.customFoodLivingChannels || DEFAULT_KBPI_UI_POLICY.customFoodLivingChannels),
    teenAutoNoneUnfitCategories: teenGuardEl ? Boolean(teenGuardEl.checked) : (fallback.teenAutoNoneUnfitCategories !== false),
    autoSyncGoogleSheet: autoSheetEl ? Boolean(autoSheetEl.checked) : (fallback.autoSyncGoogleSheet !== false),
    proxyServer: proxyEl ? proxyEl.value.trim() : (fallback.proxyServer || '')
  };
}
