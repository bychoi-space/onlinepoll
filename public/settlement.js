/**
 * AutoSurvey AI - 조사원 2티어 전용 설문조사 정산 허브 프론트엔드 컨트롤러
 * - 모바일(원핸드 바텀시트 & 스테퍼) 및 태블릿(2단 Master-Detail Split View) 최적화
 * - AutoSurvey 등록 캠페인 연동 + 외부/수기 과제 단독 정산 동시 지원
 */

const state = {
  activeTab: 'overview',        // 'overview' | 'projects' | 'remittance' | 'partners'
  periodMonth: 'all',           // 'all' | 'YYYY-MM'
  projectFilter: 'all',         // 'all' | 'uncollected' | 'unpaid' | 'settled'
  projectSearch: '',
  selectedProjectId: null,
  isMobileDetailOpen: false,
  remitFilter: 'unpaid',        // 'unpaid' | 'all'
  partnerFilter: 'all',         // 'all' | 'tier3' | 'tier1'
  projectModalSource: 'autosurvey', // 'autosurvey' | 'manual'
  allocModalMode: 'existing',   // 'existing' | 'new'
  partnerModalTier: 'tier3',    // 'tier3' | 'tier1'
  availableCampaigns: [],
  dashboard: {
    periodMonth: 'all',
    currentKstMonth: '',
    availableMonths: [],
    summary: {
      projectCount: 0,
      activeProjectCount: 0,
      settledProjectCount: 0,
      totalApprovedCount: 0,
      myApprovedCount: 0,
      tier3ApprovedCount: 0,
      grossReceivable: 0,
      netReceivable: 0,
      uncollectedIn: 0,
      totalNetPayable: 0,
      totalPaidOut: 0,
      totalUnpaidOut: 0,
      myDirectGross: 0,
      tier3SpreadGross: 0,
      myNetProfit: 0
    },
    projects: [],
    remittanceGroups: [],
    partners: []
  }
};

// ============================================================================
// 1. 공통 포맷터, 클립보드, 토스트 및 확인 모달 헬퍼
// ============================================================================

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(val) {
  const n = Math.round(Number(val) || 0);
  return new Intl.NumberFormat('ko-KR').format(n);
}

function formatWon(val) {
  return `${formatNumber(val)}원`;
}

function formatSignedWon(val) {
  const n = Math.round(Number(val) || 0);
  if (n > 0) return `+${formatNumber(n)}원`;
  return `${formatNumber(n)}원`;
}

function formatMonthLabel(ym) {
  if (!ym || ym === 'all') return '전체 기간';
  const [y, m] = String(ym).split('-');
  if (!y || !m) return String(ym);
  return `${y}년 ${Number(m)}월`;
}

let toastTimer = null;
function showStlToast(msg) {
  const el = document.getElementById('stl-toast');
  if (!el) return;
  el.textContent = String(msg || '');
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}

async function copyToClipboard(text, toastMessage = '클립보드에 복사되었습니다.') {
  const content = String(text || '').trim();
  if (!content) {
    showStlToast('복사할 내용이 없습니다.');
    return false;
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(content);
      showStlToast(toastMessage);
      return true;
    }
  } catch (_) {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = content;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    showStlToast(toastMessage);
    return true;
  } catch (err) {
    console.error('클립보드 복사 실패:', err);
    showStlToast('복사에 실패했습니다.');
    return false;
  }
}

function confirmStlDialog({ title = '확인', message = '', confirmText = '확인' } = {}) {
  const modal = document.getElementById('modal-confirm');
  if (!modal || globalThis.__IS_MOCK_DOM) {
    return Promise.resolve(typeof globalThis.confirm === 'function' ? Boolean(globalThis.confirm(message)) : true);
  }
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-msg');
  const btnOk = document.getElementById('btn-confirm-ok');
  const btnCancel = document.getElementById('btn-confirm-cancel');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (btnOk) btnOk.textContent = confirmText;

  modal.classList.remove('d-none');

  return new Promise((resolve) => {
    const finish = (val) => {
      modal.classList.add('d-none');
      if (btnOk) btnOk.onclick = null;
      if (btnCancel) btnCancel.onclick = null;
      resolve(val);
    };
    if (btnOk) btnOk.onclick = () => finish(true);
    if (btnCancel) btnCancel.onclick = () => finish(false);
  });
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `요청 처리 중 오류가 발생했습니다 (${res.status})`);
  }
  return data;
}

// ============================================================================
// 2. 카카오톡 정산 안내문 생성기
// ============================================================================

function buildKakaoStatementSingle(project, alloc) {
  const lines = [
    `[설문조사 정산 내역 안내]`,
    `조사원: ${alloc.partnerName}님`,
    `■ 과제명: ${project.title} (${project.periodMonth || ''})`,
    `- 인정 부수: ${alloc.approvedCount}건 (완료 ${alloc.completedCount}건)`,
    `- 지급 단가: ${formatWon(alloc.unitPriceOut)}`,
    `- 세전 합계: ${formatWon(alloc.grossPayable)}`
  ];
  if (alloc.taxWithholdingOut && alloc.taxOut > 0) {
    lines.push(`- 원천징수(3.3%): -${formatWon(alloc.taxOut)}`);
  }
  if (alloc.extraAdjustmentOut !== 0) {
    lines.push(`- 답례품·실비 정산: ${formatSignedWon(alloc.extraAdjustmentOut)}`);
  }
  lines.push(`▶ 실송금액: ${formatWon(alloc.netPayable)}`);
  const acctInfo = [alloc.bankName, alloc.accountNumber, alloc.accountHolder].filter(Boolean).join(' ');
  const statusStr = alloc.payoutStatus === 'paid' ? '송금완료' : '송금예정';
  if (acctInfo) {
    lines.push(`(${acctInfo} · ${statusStr})`);
  } else {
    lines.push(`(상태: ${statusStr})`);
  }
  return lines.join('\n');
}

function buildKakaoStatementGroup(group, onlyUnpaid = false) {
  const items = onlyUnpaid
    ? group.items.filter(it => it.payoutStatus !== 'paid' && it.netPayable > 0)
    : group.items.filter(it => it.netPayable > 0);
  const targetItems = items.length > 0 ? items : group.items;

  const lines = [
    `[설문조사 통합 정산 안내]`,
    `조사원: ${group.partnerName}님 (${formatMonthLabel(state.periodMonth)})`,
    `--------------------`
  ];

  let sumNet = 0;
  targetItems.forEach(it => {
    sumNet += (onlyUnpaid ? it.unpaidBalance : it.netPayable);
    const taxNote = it.taxWithholdingOut && it.taxOut > 0 ? ` (3.3% -${formatWon(it.taxOut)})` : '';
    const extraNote = it.extraAdjustmentOut ? ` (실비 ${formatSignedWon(it.extraAdjustmentOut)})` : '';
    lines.push(`• ${it.projectTitle}: 확정 ${it.approvedCount}건 × ${formatWon(it.unitPriceOut)}${taxNote}${extraNote} = ${formatWon(it.netPayable)}`);
  });

  lines.push(`--------------------`);
  lines.push(`▶ 총 ${onlyUnpaid ? '송금예정액' : '실정산액'}: ${formatWon(sumNet)}`);
  const acctInfo = [group.bankName, group.accountNumber, group.accountHolder].filter(Boolean).join(' ');
  if (acctInfo) {
    lines.push(`계좌: ${acctInfo}`);
  }
  return lines.join('\n');
}

// ============================================================================
// 3. 대시보드 데이터 로드 및 상단/탭 동기화
// ============================================================================

async function loadDashboard() {
  try {
    const query = encodeURIComponent(state.periodMonth || 'all');
    const data = await apiJson(`/api/settlement/dashboard?periodMonth=${query}`);
    state.dashboard = data;

    // 선택된 과제가 목록에 없으면 첫 번째 과제를 기본 선택 (태블릿 우측 뷰 자동 표시)
    const exists = data.projects.some(p => p.id === state.selectedProjectId);
    if (!exists) {
      state.selectedProjectId = data.projects.length > 0 ? data.projects[0].id : null;
      if (!state.selectedProjectId) {
        state.isMobileDetailOpen = false;
      }
    }

    renderMonthSelector();
    renderRemittanceNavBadges();
    renderOverviewTab();
    renderProjectsTab();
    renderRemittanceTab();
    renderPartnersTab();

    // URL ?campaignId=... 딥링크 처리 (최초 1회)
    if (!state.deepLinkHandled) {
      state.deepLinkHandled = true;
      const searchStr = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      const targetCampId = searchStr ? new URLSearchParams(searchStr).get('campaignId') : null;
      if (targetCampId) {
        const linkedProj = (data.projects || []).find(p => p.linkedCampaignId === targetCampId);
        if (linkedProj) {
          state.selectedProjectId = linkedProj.id;
          state.isMobileDetailOpen = true;
          switchTab('projects');
          renderProjectsTab();
        } else {
          await openProjectModal({ mode: 'autosurvey' });
          const campSel = document.getElementById('proj-linked-campaign');
          const found = state.availableCampaigns.find(c => c.campaignId === targetCampId);
          if (campSel && found) {
            campSel.value = targetCampId;
            document.getElementById('proj-title').value = found.title;
            document.getElementById('proj-target-quota').value = found.targetQuota || 0;
          }
        }
      }
    }
  } catch (err) {
    console.error('[정산 데이터 로드 실패]:', err);
    showStlToast(err.message || '정산 데이터를 불러오지 못했습니다.');
  }
}

function renderMonthSelector() {
  const sel = document.getElementById('select-period-month');
  if (!sel) return;
  const months = state.dashboard.availableMonths || [];
  let html = `<option value="all" ${state.periodMonth === 'all' ? 'selected' : ''}>전체 기간</option>`;
  months.forEach(ym => {
    const selected = state.periodMonth === ym ? 'selected' : '';
    html += `<option value="${escapeHtml(ym)}" ${selected}>${escapeHtml(formatMonthLabel(ym))}</option>`;
  });
  sel.innerHTML = html;
}

function renderRemittanceNavBadges() {
  const unpaidPersonCount = (state.dashboard.remittanceGroups || []).filter(g => g.totalUnpaidBalance > 0).length;
  const dBadge = document.getElementById('dbadge-remittance');
  const bBadge = document.getElementById('bbadge-remittance');
  [dBadge, bBadge].forEach(el => {
    if (!el) return;
    if (unpaidPersonCount > 0) {
      el.textContent = String(unpaidPersonCount);
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  });
}

function switchTab(tabKey) {
  state.activeTab = tabKey;
  ['overview', 'projects', 'remittance', 'partners'].forEach(k => {
    const view = document.getElementById(`view-${k}`);
    if (view) view.classList.toggle('d-none', k !== tabKey);

    const dTab = document.getElementById(`dtab-${k}`);
    if (dTab) dTab.classList.toggle('active', k === tabKey);

    const bNav = document.getElementById(`bnav-${k}`);
    if (bNav) bNav.classList.toggle('active', k === tabKey);
  });
  if (tabKey !== 'projects') {
    state.isMobileDetailOpen = false;
    const detailPane = document.getElementById('project-detail-pane');
    if (detailPane) detailPane.classList.remove('is-mobile-open');
  }
}

// ============================================================================
// 4. [탭 1] 요약·현황 렌더링 (Progressive Disclosure 적용)
// ============================================================================

function renderOverviewTab() {
  const s = state.dashboard.summary;
  const periodLabel = document.getElementById('overview-period-label');
  if (periodLabel) periodLabel.textContent = formatMonthLabel(state.periodMonth);

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('stat-my-net-profit', formatWon(s.myNetProfit));
  setTxt('stat-my-approved-cnt', String(s.myApprovedCount));
  setTxt('stat-my-direct-gross', formatWon(s.myDirectGross));
  setTxt('stat-t3-approved-cnt', String(s.tier3ApprovedCount));
  setTxt('stat-t3-spread-gross', formatSignedWon(s.tier3SpreadGross));
  setTxt('stat-uncollected-in', formatWon(s.uncollectedIn));
  setTxt('stat-net-receivable', formatWon(s.netReceivable));
  setTxt('stat-unpaid-out', formatWon(s.totalUnpaidOut));
  setTxt('stat-net-payable', formatWon(s.totalNetPayable));

  const container = document.getElementById('overview-dynamic-container');
  if (!container) return;

  const projects = state.dashboard.projects || [];
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="stl-empty-state">
        <div class="stl-empty-icon"><i class="fa-solid fa-coins"></i></div>
        <h2 class="stl-empty-title">첫 설문조사 정산 과제를 등록해 보세요</h2>
        <p class="stl-empty-desc">
          AutoSurvey에 등록된 설문 캠페인의 완료 부수를 그대로 불러오거나,
          외부에서 진행하는 설문 과제를 직접 등록해 내 수익과 3티어 분배금을 한눈에 관리할 수 있습니다.
        </p>
        <div class="stl-empty-actions">
          <button type="button" class="stl-btn stl-btn-primary" data-action="open-new-project" data-source="autosurvey">
            <i class="fa-solid fa-cloud-arrow-down"></i> AutoSurvey 캠페인 불러오기
          </button>
          <button type="button" class="stl-btn stl-btn-outline" data-action="open-new-project" data-source="manual">
            <i class="fa-solid fa-plus"></i> 외부 과제 직접 등록
          </button>
        </div>
      </div>
    `;
    return;
  }

  // 즉시 확인 필요한 항목 요약 (미동기화 캠페인, 3티어 미송금, 1티어 미수금)
  const syncNeededProjects = projects.filter(p =>
    p.sourceType === 'autosurvey' &&
    p.liveCampaignStats &&
    p.liveCampaignStats.completedCount > p.metrics.totalCompletedCount
  );

  const recentProjects = projects.slice(0, 5);

  let html = '';

  if (syncNeededProjects.length > 0) {
    html += `
      <div class="stl-section-card" style="border-color: var(--stl-inflow-border); background: var(--stl-inflow-bg);">
        <div class="stl-section-head" style="margin-bottom: 8px;">
          <h2 class="stl-section-title" style="color: #0369a1; font-size: 15px;">
            <i class="fa-solid fa-rotate"></i> AutoSurvey 완료 건수 업데이트 감지 (${syncNeededProjects.length}건)
          </h2>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${syncNeededProjects.map(p => {
            const diff = p.liveCampaignStats.completedCount - p.metrics.totalCompletedCount;
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:#fff; padding:10px 12px; border-radius:10px; border:1px solid var(--stl-inflow-border);">
                <div style="min-width:0;">
                  <strong style="font-size:13.5px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title)}</strong>
                  <span style="font-size:12px; color:var(--stl-ink-muted);">AutoSurvey 완료 ${p.liveCampaignStats.completedCount}건 (정산 미반영 +${diff}건)</span>
                </div>
                <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="jump-project" data-id="${escapeHtml(p.id)}">
                  확인·반영
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  html += `
    <div class="stl-section-card">
      <div class="stl-section-head">
        <h2 class="stl-section-title"><i class="fa-solid fa-bolt"></i> 진행 중인 과제 정산 현황</h2>
        <div style="display:flex; gap:6px;">
          <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="open-new-project" data-source="autosurvey">
            <i class="fa-solid fa-plus"></i> 과제 추가
          </button>
          <button type="button" class="stl-btn stl-btn-soft stl-btn-sm" data-action="switch-tab" data-tab="projects">
            전체보기
          </button>
        </div>
      </div>
      <div class="stl-project-cards">
        ${recentProjects.map(p => buildProjectCardHtml(p, false)).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================================================
// 5. [탭 2] 과제 정산 목록 & 우측 상세 패널 렌더링
// ============================================================================

function getFilteredProjects() {
  const all = state.dashboard.projects || [];
  const q = state.projectSearch.trim().toLowerCase();

  return all.filter(p => {
    if (state.projectFilter === 'uncollected' && p.metrics.uncollectedIn <= 0) return false;
    if (state.projectFilter === 'unpaid' && p.metrics.totalUnpaidOut <= 0) return false;
    if (state.projectFilter === 'settled' && !p.metrics.isFullySettled) return false;

    if (q) {
      const hay = `${p.title} ${p.tier1PartnerName || ''} ${p.memo || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function buildProjectCardHtml(p, highlightSelected = true) {
  const m = p.metrics;
  const isSelected = highlightSelected && p.id === state.selectedProjectId;
  const hasSyncGap = p.sourceType === 'autosurvey' && p.liveCampaignStats && p.liveCampaignStats.completedCount > m.totalCompletedCount;

  const sourceBadge = p.sourceType === 'autosurvey'
    ? `<span class="stl-badge stl-badge-auto"><i class="fa-solid fa-link"></i> AutoSurvey</span>`
    : `<span class="stl-badge stl-badge-manual">직접등록</span>`;

  let statusBadges = '';
  if (m.isFullySettled) {
    statusBadges += `<span class="stl-badge stl-badge-ok"><i class="fa-solid fa-check"></i> 정산완료</span>`;
  } else {
    if (p.inflowStatus === 'received') {
      statusBadges += `<span class="stl-badge stl-badge-ok">1티어 입금완료</span>`;
    } else if (p.inflowStatus === 'billed') {
      statusBadges += `<span class="stl-badge stl-badge-auto">1티어 청구중</span>`;
    } else if (m.netReceivable > 0) {
      statusBadges += `<span class="stl-badge stl-badge-warn">1티어 미수금</span>`;
    }
    if (m.totalUnpaidOut > 0) {
      statusBadges += `<span class="stl-badge stl-badge-danger">3티어 미송금 ${formatWon(m.totalUnpaidOut)}</span>`;
    }
  }

  if (hasSyncGap) {
    statusBadges += `<span class="stl-badge stl-badge-auto"><i class="fa-solid fa-rotate"></i> 완료건수 갱신가능</span>`;
  }

  const quotaStr = p.targetQuota > 0 ? `${m.totalApprovedCount} / ${p.targetQuota}건` : `${m.totalApprovedCount}건`;

  return `
    <div class="stl-proj-card ${isSelected ? 'is-selected' : ''}" data-action="select-project" data-id="${escapeHtml(p.id)}">
      <div class="stl-proj-badges">
        ${sourceBadge}
        <span class="stl-badge stl-badge-manual">${escapeHtml(p.periodMonth || '')}</span>
        ${statusBadges}
      </div>
      <h3 class="stl-proj-title">${escapeHtml(p.title)}</h3>
      <div class="stl-proj-meta">
        ${p.tier1PartnerName ? `<span><i class="fa-regular fa-building"></i> ${escapeHtml(p.tier1PartnerName)}</span>` : ''}
        <span>수주 <b class="num-mono">${formatWon(p.unitPriceIn)}</b></span>
        <span>3티어 <b class="num-mono">${formatWon(p.defaultUnitPriceOut)}</b></span>
      </div>
      <div class="stl-proj-bottom">
        <div class="stl-proj-counts">
          인정 <b class="num-mono">${quotaStr}</b>
          <span style="color:var(--stl-ink-muted);"> (나 ${m.myApproved} · 3티어 ${m.tier3ApprovedTotal})</span>
        </div>
        <div class="stl-proj-profit">
          <small>내 순수익</small>
          <strong class="num-mono">${formatWon(m.myNetProfit)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderProjectsTab() {
  const all = state.dashboard.projects || [];
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  setTxt('pcount-all', all.length);
  setTxt('pcount-uncollected', all.filter(p => p.metrics.uncollectedIn > 0).length);
  setTxt('pcount-unpaid', all.filter(p => p.metrics.totalUnpaidOut > 0).length);
  setTxt('pcount-settled', all.filter(p => p.metrics.isFullySettled).length);

  const listContainer = document.getElementById('project-cards-container');
  const filtered = getFilteredProjects();

  if (listContainer) {
    if (all.length === 0) {
      listContainer.innerHTML = `
        <div class="stl-empty-state">
          <div class="stl-empty-icon"><i class="fa-solid fa-folder-plus"></i></div>
          <h3 class="stl-empty-title">등록된 정산 과제가 없습니다</h3>
          <p class="stl-empty-desc">상단의 [캠페인 불러오기] 또는 [직접 과제 등록] 버튼으로 과제를 추가해 주세요.</p>
        </div>
      `;
    } else if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="stl-empty-state" style="padding: 24px 14px;">
          <p class="stl-empty-desc" style="margin-bottom: 10px;">현재 필터·검색 조건에 맞는 과제가 없습니다.</p>
          <button type="button" class="stl-btn stl-btn-soft stl-btn-sm" data-action="reset-project-filter">필터 초기화</button>
        </div>
      `;
    } else {
      listContainer.innerHTML = filtered.map(p => buildProjectCardHtml(p, true)).join('');
    }
  }

  renderProjectDetailPane();
}

function renderProjectDetailPane() {
  const detailPane = document.getElementById('project-detail-pane');
  const body = document.getElementById('project-detail-body');
  if (!detailPane || !body) return;

  detailPane.classList.toggle('is-mobile-open', Boolean(state.isMobileDetailOpen && state.selectedProjectId));

  const project = (state.dashboard.projects || []).find(p => p.id === state.selectedProjectId) || null;
  if (!project) {
    body.innerHTML = `
      <div class="stl-empty-state">
        <div class="stl-empty-icon"><i class="fa-solid fa-hand-pointer"></i></div>
        <h3 class="stl-empty-title">정산할 과제를 선택하거나 새로 등록하세요</h3>
        <p class="stl-empty-desc">과제를 선택하면 이곳에서 내 수행 부수와 3티어 분배 정산금을 원터치로 관리할 수 있습니다.</p>
        <div class="stl-empty-actions">
          <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="open-new-project" data-source="autosurvey">
            <i class="fa-solid fa-cloud-arrow-down"></i> 캠페인 불러오기
          </button>
          <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="open-new-project" data-source="manual">
            <i class="fa-solid fa-plus"></i> 직접 과제 등록
          </button>
        </div>
      </div>
    `;
    return;
  }

  const m = project.metrics;

  // AutoSurvey 연동 동기화 바 (AutoSurvey 과제인 경우에만 노출 - Progressive Disclosure)
  let syncBarHtml = '';
  if (project.sourceType === 'autosurvey' && project.linkedCampaignId) {
    const live = project.liveCampaignStats;
    if (live) {
      const diff = live.completedCount - m.totalCompletedCount;
      const waitNote = live.waitingBeforeSubmitCount > 0 ? ` · 완료직전 대기 ${live.waitingBeforeSubmitCount}건` : '';
      syncBarHtml = `
        <div class="stl-sync-bar">
          <div class="stl-sync-info">
            <strong><i class="fa-solid fa-link"></i> AutoSurvey 실시간 현황:</strong>
            완료 <b>${live.completedCount}건</b> / 표본 ${live.targetQuota}건${waitNote}
            ${diff > 0
              ? `<br><span style="color:#b45309; font-weight:700;">현재 정산 입력 합계(${m.totalCompletedCount}건)보다 AutoSurvey 완료가 +${diff}건 많습니다.</span>`
              : ` · <span style="color:#0f766e; font-weight:700;">정산 합계(${m.totalCompletedCount}건) 기록됨</span>`}
          </div>
          <div class="stl-sync-actions">
            ${diff > 0 ? `
              <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="sync-campaign" data-id="${escapeHtml(project.id)}" data-apply-diff="1">
                <i class="fa-solid fa-bolt"></i> 미반영분(+${diff}건) 내 수행에 반영
              </button>
            ` : ''}
            <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="sync-campaign" data-id="${escapeHtml(project.id)}" data-apply-diff="0">
              <i class="fa-solid fa-rotate"></i> 새로고침
            </button>
            <a href="survey-detail.html?id=${encodeURIComponent(project.linkedCampaignId)}" class="stl-btn stl-btn-soft stl-btn-sm" style="text-decoration:none;">
              작업실 열기
            </a>
          </div>
        </div>
      `;
    } else {
      syncBarHtml = `
        <div class="stl-sync-bar">
          <div class="stl-sync-info">원본 AutoSurvey 캠페인을 찾을 수 없습니다 (수기 정산은 정상 유지됩니다).</div>
        </div>
      `;
    }
  }

  // 3티어 분배 카드 리스트
  let allocListHtml = '';
  if (!project.allocations || project.allocations.length === 0) {
    allocListHtml = `
      <div class="stl-empty-state" style="padding: 24px 16px;">
        <p class="stl-empty-desc" style="margin-bottom: 12px;">
          혼자 진행하기 어려운 물량을 3티어 조사원에게 나누어 주었다면 아래 버튼으로 분배 내역을 추가하세요.
        </p>
        <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="open-add-alloc" data-project-id="${escapeHtml(project.id)}">
          <i class="fa-solid fa-user-plus"></i> + 3티어 조사원 분배 추가
        </button>
      </div>
    `;
  } else {
    allocListHtml = `
      <div class="stl-alloc-list">
        ${project.allocations.map(alloc => buildAllocationCardHtml(project, alloc)).join('')}
      </div>
    `;
  }

  body.innerHTML = `
    <!-- 1. 과제 정산 스코어보드 & 1티어 수금 상태 -->
    <div class="stl-scoreboard">
      <div class="stl-detail-header-row">
        <div>
          <div class="stl-proj-badges" style="margin-bottom:4px;">
            <span class="stl-badge ${project.sourceType === 'autosurvey' ? 'stl-badge-auto' : 'stl-badge-manual'}">
              ${project.sourceType === 'autosurvey' ? 'AutoSurvey 연동' : '외부·수기 과제'}
            </span>
            <span class="stl-badge stl-badge-manual">${escapeHtml(project.periodMonth)}</span>
            ${project.tier1PartnerName ? `<span class="stl-badge stl-badge-manual"><i class="fa-regular fa-building"></i> 1티어: ${escapeHtml(project.tier1PartnerName)}</span>` : ''}
          </div>
          <h2 class="stl-detail-title">${escapeHtml(project.title)}</h2>
          ${project.memo ? `<div style="font-size:12.5px; color:var(--stl-ink-muted); margin-top:2px;">메모: ${escapeHtml(project.memo)}</div>` : ''}
        </div>

        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="open-edit-project" data-id="${escapeHtml(project.id)}">
            <i class="fa-solid fa-pen"></i> 단가·수정
          </button>
          <button type="button" class="stl-btn stl-btn-danger-soft stl-btn-sm" data-action="delete-project" data-id="${escapeHtml(project.id)}" title="과제 삭제">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <div class="stl-score-trio">
        <div class="stl-score-box">
          <span>📥 1티어 받을 실수령액</span>
          <strong class="num-mono">${formatWon(m.netReceivable)}</strong>
          <small>총 인정 ${m.totalApprovedCount}건${project.taxWithholdingIn ? ` (3.3% -${formatWon(m.taxIn)})` : ''}</small>
        </div>
        <div class="stl-score-box is-out">
          <span>📤 3티어 줄 총지급액</span>
          <strong class="num-mono">${formatWon(m.totalNetPayable)}</strong>
          <small>미송금 잔액 ${formatWon(m.totalUnpaidOut)}</small>
        </div>
        <div class="stl-score-box is-profit">
          <span>💰 내 최종 순수익</span>
          <strong class="num-mono">${formatWon(m.myNetProfit)}</strong>
          <small>직접 ${formatWon(m.myDirectGross)} / 마진 ${formatSignedWon(m.tier3SpreadGross)}</small>
        </div>
      </div>

      <div class="stl-unit-strip">
        <span class="stl-unit-pill">수주 단가 <b class="num-mono">${formatWon(project.unitPriceIn)}</b></span>
        <span class="stl-unit-pill">3티어 기본 <b class="num-mono">${formatWon(project.defaultUnitPriceOut)}</b></span>
        <span class="stl-unit-pill" style="color:var(--stl-profit);">건당 분배마진 <b class="num-mono">${formatSignedWon(project.unitMargin)}</b></span>
        ${project.targetQuota > 0 ? `<span class="stl-unit-pill">목표 쿼터 <b class="num-mono">${project.targetQuota}건</b> (잔여 미배정 ${m.unassignedQuota}건)</span>` : ''}
      </div>

      <div class="stl-inflow-control">
        <span class="stl-inflow-label">1티어 정산금 수금 상태</span>
        <div class="stl-seg-group" role="group" aria-label="1티어 수금 상태">
          <button type="button" class="stl-seg-btn ${project.inflowStatus === 'pending' ? 'active' : ''}" data-action="set-inflow" data-id="${escapeHtml(project.id)}" data-inflow="pending">정산대기</button>
          <button type="button" class="stl-seg-btn ${project.inflowStatus === 'billed' ? 'active' : ''}" data-action="set-inflow" data-id="${escapeHtml(project.id)}" data-inflow="billed">청구완료</button>
          <button type="button" class="stl-seg-btn ${project.inflowStatus === 'received' ? 'active' : ''}" data-action="set-inflow" data-id="${escapeHtml(project.id)}" data-inflow="received">입금완료 ✓</button>
        </div>
      </div>

      ${syncBarHtml}
    </div>

    <!-- 2. 내 직접 수행 기록 (2티어 본인 몫) -->
    <div class="stl-section-card" style="margin-bottom: 0;">
      <div class="stl-section-head">
        <h3 class="stl-section-title">
          <i class="fa-solid fa-user-check" style="color:var(--stl-profit);"></i> 내 직접 수행 부수 (2티어 본인)
        </h3>
        <strong class="num-mono" style="color:var(--stl-profit); font-size:15px;">직접 수익 ${formatWon(m.myDirectGross)}</strong>
      </div>

      <div class="stl-stepper-grid three-cols">
        <div class="stl-stepper-box">
          <div class="stl-stepper-label"><span>내 할당 목표</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="assignedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${project.myWork.assignedCount}" data-change="input-my" data-id="${escapeHtml(project.id)}" data-field="assignedCount" aria-label="내 할당 부수">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="assignedCount" data-delta="1">+</button>
          </div>
        </div>

        <div class="stl-stepper-box">
          <div class="stl-stepper-label"><span>응답 완료 부수</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="completedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${project.myWork.completedCount}" data-change="input-my" data-id="${escapeHtml(project.id)}" data-field="completedCount" aria-label="내 완료 부수">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="completedCount" data-delta="1">+</button>
          </div>
        </div>

        <div class="stl-stepper-box is-highlight">
          <div class="stl-stepper-label"><span>검수 확정(정산인정)</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="approvedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${project.myWork.approvedCount}" data-change="input-my" data-id="${escapeHtml(project.id)}" data-field="approvedCount" aria-label="내 검수 확정 부수">
            <button type="button" class="stl-step-btn" data-action="step-my" data-id="${escapeHtml(project.id)}" data-field="approvedCount" data-delta="1">+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 3티어 조사원 분배 및 지급 정산 -->
    <div class="stl-section-card" style="margin-bottom: 0;">
      <div class="stl-section-head">
        <h3 class="stl-section-title">
          <i class="fa-solid fa-users" style="color:var(--stl-inflow);"></i> 3티어 조사원 분배 (${project.allocations.length}명)
        </h3>
        <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="open-add-alloc" data-project-id="${escapeHtml(project.id)}" id="btn-add-allocation">
          <i class="fa-solid fa-plus"></i> 3티어 분배 추가
        </button>
      </div>
      ${allocListHtml}
    </div>
  `;
}

function buildAllocationCardHtml(project, alloc) {
  const isPaid = alloc.payoutStatus === 'paid';
  const acctText = [alloc.bankName, alloc.accountNumber].filter(Boolean).join(' ');

  return `
    <div class="stl-alloc-card ${isPaid ? 'is-paid' : ''}">
      <div class="stl-alloc-top">
        <div class="stl-alloc-person">
          <div class="stl-alloc-name-row">
            <span class="stl-alloc-name">${escapeHtml(alloc.partnerName)}</span>
            <span class="stl-badge stl-badge-manual num-mono">단가 ${formatWon(alloc.unitPriceOut)}</span>
            ${alloc.taxWithholdingOut ? `<span class="stl-badge stl-badge-manual">3.3% 공제</span>` : ''}
            ${alloc.extraAdjustmentOut !== 0 ? `<span class="stl-badge stl-badge-auto">실비 ${formatSignedWon(alloc.extraAdjustmentOut)}</span>` : ''}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:3px;">
            ${acctText
              ? `<button type="button" class="stl-account-chip" data-action="copy-account" data-account="${escapeHtml(`${alloc.bankName} ${alloc.accountNumber} (${alloc.accountHolder || alloc.partnerName})`)}">
                  <i class="fa-regular fa-copy"></i> ${escapeHtml(acctText)}
                </button>`
              : `<button type="button" class="stl-account-chip" data-action="open-edit-partner" data-partner-id="${escapeHtml(alloc.partnerId || '')}">
                  <i class="fa-solid fa-building-columns"></i> 계좌 등록하기
                </button>`}
            ${alloc.memo ? `<span style="font-size:12px; color:var(--stl-ink-muted); align-self:center;">· ${escapeHtml(alloc.memo)}</span>` : ''}
          </div>
        </div>

        <div style="display:flex; gap:5px;">
          <button type="button" class="stl-btn stl-btn-soft stl-btn-sm" data-action="open-edit-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" title="단가·실비·메모 수정">
            <i class="fa-solid fa-sliders"></i>
          </button>
          <button type="button" class="stl-btn stl-btn-danger-soft stl-btn-sm" data-action="delete-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" title="분배 삭제">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="stl-stepper-grid three-cols">
        <div class="stl-stepper-box">
          <div class="stl-stepper-label"><span>할당 부수</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="assignedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${alloc.assignedCount}" data-change="input-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="assignedCount" aria-label="3티어 할당 부수">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="assignedCount" data-delta="1">+</button>
          </div>
        </div>

        <div class="stl-stepper-box">
          <div class="stl-stepper-label"><span>완료 부수</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="completedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${alloc.completedCount}" data-change="input-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="completedCount" aria-label="3티어 완료 부수">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="completedCount" data-delta="1">+</button>
          </div>
        </div>

        <div class="stl-stepper-box is-highlight">
          <div class="stl-stepper-label"><span>검수 확정(인정)</span></div>
          <div class="stl-stepper-ctrl">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="approvedCount" data-delta="-1">−</button>
            <input type="number" class="stl-step-input" inputmode="numeric" min="0" value="${alloc.approvedCount}" data-change="input-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="approvedCount" aria-label="3티어 확정 부수">
            <button type="button" class="stl-step-btn" data-action="step-alloc" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-field="approvedCount" data-delta="1">+</button>
          </div>
        </div>
      </div>

      <div class="stl-alloc-summary-bar">
        <div>
          실송금액 <strong class="num-mono" style="font-size:15px; color:var(--stl-ink);">${formatWon(alloc.netPayable)}</strong>
          ${alloc.taxOut > 0 ? `<span style="color:var(--stl-ink-muted); font-size:12px;"> (세전 ${formatWon(alloc.grossPayable)} − 세금 ${formatWon(alloc.taxOut)})</span>` : ''}
        </div>
        <div style="color:var(--stl-profit); font-weight:700; font-size:12.5px;">
          내 분배마진 <span class="num-mono">${formatSignedWon(alloc.spreadMarginGross)}</span>
        </div>
      </div>

      <div class="stl-alloc-actions">
        <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="copy-kakao-single" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}">
          <i class="fa-regular fa-comment-dots"></i> 카톡 정산서 복사
        </button>

        <button type="button" class="stl-payout-toggle ${isPaid ? 'is-paid' : ''}" data-action="toggle-alloc-paid" data-project-id="${escapeHtml(project.id)}" data-alloc-id="${escapeHtml(alloc.id)}" data-current="${alloc.payoutStatus}">
          <i class="fa-solid ${isPaid ? 'fa-circle-check' : 'fa-paper-plane'}"></i>
          ${isPaid ? '송금완료 됨 (취소하려면 터치)' : '미송금 · 송금완료 체크'}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 6. [탭 3] 3티어 송금함 (인물별 합산 정산 뷰) 렌더링
// ============================================================================

function renderRemittanceTab() {
  const container = document.getElementById('remittance-cards-container');
  if (!container) return;

  const groups = state.dashboard.remittanceGroups || [];
  const filtered = state.remitFilter === 'unpaid'
    ? groups.filter(g => g.totalUnpaidBalance > 0)
    : groups;

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="stl-empty-state" style="grid-column: 1 / -1;">
        <div class="stl-empty-icon"><i class="fa-solid fa-money-bill-transfer"></i></div>
        <h3 class="stl-empty-title">아직 3티어 조사원에게 분배된 내역이 없습니다</h3>
        <p class="stl-empty-desc">과제 정산 탭에서 3티어 조사원 분배를 추가하면 조사원별로 보낼 총금액이 이곳에 자동 합산됩니다.</p>
        <div class="stl-empty-actions">
          <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="switch-tab" data-tab="projects">
            과제 정산 탭으로 이동
          </button>
        </div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="stl-empty-state" style="grid-column: 1 / -1;">
        <div class="stl-empty-icon" style="color:var(--stl-ok); background:var(--stl-ok-bg);"><i class="fa-solid fa-check-double"></i></div>
        <h3 class="stl-empty-title">미송금된 3티어 정산금이 없습니다</h3>
        <p class="stl-empty-desc">선택한 기간의 모든 3티어 분배금이 송금 완료되었습니다.</p>
        <div class="stl-empty-actions">
          <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="set-remit-filter" data-rfilter="all">
            송금완료 내역까지 전체 보기
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(g => {
    const isClear = g.totalUnpaidBalance <= 0;
    const acctStr = [g.bankName, g.accountNumber].filter(Boolean).join(' ');

    return `
      <div class="stl-remit-card">
        <div class="stl-remit-head">
          <div>
            <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
              <strong style="font-size:17px; font-weight:800;">${escapeHtml(g.partnerName)}</strong>
              ${g.phone ? `<a href="tel:${escapeHtml(g.phone)}" class="stl-badge stl-badge-manual" style="text-decoration:none;"><i class="fa-solid fa-phone"></i> ${escapeHtml(g.phone)}</a>` : ''}
            </div>
            <div style="margin-top:6px;">
              ${acctStr
                ? `<button type="button" class="stl-account-chip" data-action="copy-account" data-account="${escapeHtml(`${g.bankName} ${g.accountNumber} (${g.accountHolder || g.partnerName}) / ${formatWon(g.totalUnpaidBalance > 0 ? g.totalUnpaidBalance : g.totalNetPayable)}`)}">
                    <i class="fa-regular fa-copy"></i> ${escapeHtml(acctStr)} (${escapeHtml(g.accountHolder || g.partnerName)})
                  </button>`
                : `<button type="button" class="stl-account-chip" data-action="open-edit-partner" data-partner-id="${escapeHtml(g.partnerId || '')}">
                    <i class="fa-solid fa-plus"></i> 계좌번호 입력
                  </button>`}
            </div>
          </div>

          <div class="stl-remit-unpaid-box ${isClear ? 'is-clear' : ''}">
            <small>${isClear ? '송금 완료' : '보낼 미송금 합계'}</small>
            <strong class="num-mono">${formatWon(isClear ? g.totalNetPayable : g.totalUnpaidBalance)}</strong>
          </div>
        </div>

        <div class="stl-remit-items">
          ${g.items.map(it => `
            <div class="stl-remit-line">
              <span class="stl-remit-line-title" title="${escapeHtml(it.projectTitle)}">
                • ${escapeHtml(it.projectTitle)} <small style="color:var(--stl-ink-muted);">(${it.approvedCount}건)</small>
              </span>
              <span style="display:inline-flex; align-items:center; gap:6px; flex-shrink:0;">
                <b class="num-mono">${formatWon(it.netPayable)}</b>
                <span class="stl-badge ${it.payoutStatus === 'paid' ? 'stl-badge-ok' : 'stl-badge-danger'}">
                  ${it.payoutStatus === 'paid' ? '완료' : '미지급'}
                </span>
              </span>
            </div>
          `).join('')}
        </div>

        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px;">
          <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="copy-kakao-group" data-partner-id="${escapeHtml(g.partnerId || '')}" data-partner-name="${escapeHtml(g.partnerName)}">
            <i class="fa-regular fa-comment-dots"></i> 통합 카톡 정산서 복사
          </button>
          ${!isClear && g.partnerId ? `
            <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="mark-group-paid" data-partner-id="${escapeHtml(g.partnerId)}" data-partner-name="${escapeHtml(g.partnerName)}" data-amount="${g.totalUnpaidBalance}">
              <i class="fa-solid fa-check-double"></i> ${formatWon(g.totalUnpaidBalance)} 일괄 송금완료
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// 7. [탭 4] 거래처·조사원 장부 렌더링
// ============================================================================

function renderPartnersTab() {
  const container = document.getElementById('partners-cards-container');
  if (!container) return;

  const all = state.dashboard.partners || [];
  const filtered = state.partnerFilter === 'all'
    ? all
    : all.filter(p => p.tier === state.partnerFilter);

  if (all.length === 0) {
    container.innerHTML = `
      <div class="stl-empty-state" style="grid-column: 1 / -1;">
        <div class="stl-empty-icon"><i class="fa-solid fa-address-book"></i></div>
        <h3 class="stl-empty-title">등록된 1티어 발주처·3티어 조사원이 없습니다</h3>
        <p class="stl-empty-desc">자주 함께 일하는 3티어 조사원의 계좌번호와 1티어 팀장님 연락처를 한 번 등록해 두면 매 과제마다 원터치로 불러올 수 있습니다.</p>
        <div class="stl-empty-actions">
          <button type="button" class="stl-btn stl-btn-primary stl-btn-sm" data-action="open-new-partner">
            <i class="fa-solid fa-user-plus"></i> + 새 거래처·조사원 등록
          </button>
        </div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="stl-empty-state" style="grid-column: 1 / -1;">
        <p class="stl-empty-desc">선택한 구분에 등록된 인원이 없습니다.</p>
        <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="open-new-partner">새로 등록하기</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(pt => {
    const isT1 = pt.tier === 'tier1';
    const acctStr = [pt.bankName, pt.accountNumber].filter(Boolean).join(' ');
    const st = pt.stats || { projectCount: 0, totalApprovedCount: 0, totalAmount: 0, unpaidOrUncollected: 0 };

    return `
      <div class="stl-remit-card">
        <div class="stl-remit-head">
          <div>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
              <span class="stl-badge ${isT1 ? 'stl-badge-auto' : 'stl-badge-ok'}">${isT1 ? '1티어 발주처' : '3티어 조사원'}</span>
              ${pt.defaultTaxWithholding ? `<span class="stl-badge stl-badge-manual">3.3% 기본적용</span>` : ''}
            </div>
            <strong style="font-size:16.5px; font-weight:800;">${escapeHtml(pt.name)}</strong>
            ${pt.phone ? `<div style="margin-top:4px; font-size:13px;"><a href="tel:${escapeHtml(pt.phone)}" style="color:var(--stl-ink-secondary); text-decoration:none;"><i class="fa-solid fa-phone"></i> ${escapeHtml(pt.phone)}</a></div>` : ''}
          </div>

          <div style="display:flex; gap:6px;">
            <button type="button" class="stl-btn stl-btn-outline stl-btn-sm" data-action="open-edit-partner" data-partner-id="${escapeHtml(pt.id)}">
              수정
            </button>
            <button type="button" class="stl-btn stl-btn-danger-soft stl-btn-sm" data-action="delete-partner" data-partner-id="${escapeHtml(pt.id)}" data-partner-name="${escapeHtml(pt.name)}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          ${acctStr
            ? `<button type="button" class="stl-account-chip" data-action="copy-account" data-account="${escapeHtml(`${pt.bankName} ${pt.accountNumber} (${pt.accountHolder || pt.name})`)}">
                <i class="fa-regular fa-copy"></i> ${escapeHtml(acctStr)} (${escapeHtml(pt.accountHolder || pt.name)})
              </button>`
            : `<span style="font-size:12.5px; color:var(--stl-ink-muted);">등록된 계좌 없음</span>`}
          ${pt.memo ? `<span style="font-size:12.5px; color:var(--stl-ink-muted);">· ${escapeHtml(pt.memo)}</span>` : ''}
        </div>

        <div class="stl-alloc-summary-bar">
          <span>누적 ${st.projectCount}개 과제 (${st.totalApprovedCount}건) · <b class="num-mono">${formatWon(st.totalAmount)}</b></span>
          ${st.unpaidOrUncollected > 0
            ? `<span style="color:var(--stl-outflow); font-weight:700;">${isT1 ? '미수금' : '미송금'} <b class="num-mono">${formatWon(st.unpaidOrUncollected)}</b></span>`
            : `<span style="color:var(--stl-ok); font-weight:700;">잔액 없음</span>`}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// 8. 모달 제어 (과제 등록/수정, 3티어 분배 추가/수정, 거래처 등록/수정)
// ============================================================================

function updateProjectMarginPreview() {
  const unitIn = Number(document.getElementById('proj-unit-in')?.value) || 0;
  const unitOut = Number(document.getElementById('proj-unit-out')?.value) || 0;
  const preview = document.getElementById('proj-margin-preview');
  if (preview) {
    preview.textContent = `${formatSignedWon(unitIn - unitOut)} / 건`;
  }
}

function populateTier1Select(selectedId = '') {
  const sel = document.getElementById('proj-tier1-select');
  if (!sel) return;
  const tier1List = (state.dashboard.partners || []).filter(p => p.tier === 'tier1');
  let html = `<option value="">선택 안 함 (또는 아래 직접 입력)</option>`;
  tier1List.forEach(p => {
    html += `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`;
  });
  sel.innerHTML = html;
}

function applyProjectModalSourceMode(mode) {
  state.projectModalSource = mode;
  document.getElementById('btn-psource-autosurvey')?.classList.toggle('active', mode === 'autosurvey');
  document.getElementById('btn-psource-manual')?.classList.toggle('active', mode === 'manual');
  document.getElementById('group-autosurvey-select')?.classList.toggle('d-none', mode !== 'autosurvey');
}

async function openProjectModal({ mode = 'autosurvey', editProject = null } = {}) {
  const modal = document.getElementById('modal-project');
  if (!modal) return;

  const titleHead = document.getElementById('modal-project-title');
  const editIdInput = document.getElementById('proj-edit-id');
  const sourceSwitch = document.getElementById('proj-source-switch');
  const groupAuto = document.getElementById('group-autosurvey-select');

  populateTier1Select(editProject?.tier1PartnerId || '');

  if (editProject) {
    if (titleHead) titleHead.textContent = '정산 과제 단가·정보 수정';
    if (editIdInput) editIdInput.value = editProject.id;
    sourceSwitch?.classList.add('d-none');
    groupAuto?.classList.add('d-none');

    document.getElementById('proj-title').value = editProject.title || '';
    document.getElementById('proj-period-month').value = editProject.periodMonth || state.dashboard.currentKstMonth || '';
    document.getElementById('proj-target-quota').value = editProject.targetQuota || 0;
    document.getElementById('proj-tier1-custom-name').value = editProject.tier1PartnerId ? '' : (editProject.tier1PartnerName || '');
    document.getElementById('proj-unit-in').value = editProject.unitPriceIn || 0;
    document.getElementById('proj-unit-out').value = editProject.defaultUnitPriceOut || 0;
    document.getElementById('proj-tax-in').checked = Boolean(editProject.taxWithholdingIn);
    document.getElementById('proj-extra-in').value = editProject.extraAdjustmentIn || 0;
    document.getElementById('proj-memo').value = editProject.memo || '';
  } else {
    if (titleHead) titleHead.textContent = '새 설문 정산 과제 등록';
    if (editIdInput) editIdInput.value = '';
    sourceSwitch?.classList.remove('d-none');

    const defaultMonth = state.periodMonth !== 'all'
      ? state.periodMonth
      : (state.dashboard.currentKstMonth || new Date().toISOString().slice(0, 7));

    document.getElementById('proj-title').value = '';
    document.getElementById('proj-period-month').value = defaultMonth;
    document.getElementById('proj-target-quota').value = 0;
    document.getElementById('proj-tier1-custom-name').value = '';
    document.getElementById('proj-unit-in').value = 0;
    document.getElementById('proj-unit-out').value = 0;
    document.getElementById('proj-tax-in').checked = false;
    document.getElementById('proj-extra-in').value = 0;
    document.getElementById('proj-memo').value = '';
    document.getElementById('proj-apply-camp-completed').checked = true;

    // AutoSurvey 캠페인 목록 로드
    try {
      state.availableCampaigns = await apiJson('/api/settlement/available-campaigns');
    } catch (_) {
      state.availableCampaigns = [];
    }

    const campSel = document.getElementById('proj-linked-campaign');
    if (campSel) {
      if (state.availableCampaigns.length === 0) {
        campSel.innerHTML = `<option value="">현재 AutoSurvey에 등록된 캠페인이 없습니다 (직접 입력을 이용해 주세요)</option>`;
        if (mode === 'autosurvey') mode = 'manual';
      } else {
        campSel.innerHTML = `<option value="">-- 불러올 AutoSurvey 캠페인을 선택하세요 --</option>` +
          state.availableCampaigns.map(c => {
            const linkedMark = c.alreadyLinkedProjectId ? ' [기등록]' : '';
            return `<option value="${escapeHtml(c.campaignId)}">${escapeHtml(c.title)} (완료 ${c.completedCount}/${c.targetQuota}건)${linkedMark}</option>`;
          }).join('');
      }
    }

    applyProjectModalSourceMode(mode);
  }

  updateProjectMarginPreview();
  modal.classList.remove('d-none');
}

function applyAllocModalMode(mode) {
  state.allocModalMode = mode;
  document.getElementById('btn-amode-existing')?.classList.toggle('active', mode === 'existing');
  document.getElementById('btn-amode-new')?.classList.toggle('active', mode === 'new');
  const existingGroup = document.getElementById('alloc-existing-group');
  const newGroup = document.getElementById('alloc-new-partner-group');
  if (existingGroup) existingGroup.classList.toggle('d-none', mode !== 'existing');
  if (newGroup) newGroup.classList.toggle('d-none', mode !== 'new');
}

function openAllocationModal({ project, editAlloc = null }) {
  const modal = document.getElementById('modal-allocation');
  if (!modal || !project) return;

  const titleEl = document.getElementById('modal-alloc-title');
  const editIdEl = document.getElementById('alloc-edit-id');
  const pickerSec = document.getElementById('alloc-partner-picker-section');

  if (editAlloc) {
    if (titleEl) titleEl.textContent = `${editAlloc.partnerName} 분배 단가·옵션 수정`;
    if (editIdEl) editIdEl.value = editAlloc.id;
    pickerSec?.classList.add('d-none');

    document.getElementById('alloc-assigned').value = editAlloc.assignedCount || 0;
    document.getElementById('alloc-completed').value = editAlloc.completedCount || 0;
    document.getElementById('alloc-unit-out').value = editAlloc.unitPriceOut || 0;
    document.getElementById('alloc-extra-out').value = editAlloc.extraAdjustmentOut || 0;
    document.getElementById('alloc-tax-out').checked = Boolean(editAlloc.taxWithholdingOut);
    document.getElementById('alloc-memo').value = editAlloc.memo || '';
  } else {
    if (titleEl) titleEl.textContent = '3티어 조사원 분배 추가';
    if (editIdEl) editIdEl.value = '';
    pickerSec?.classList.remove('d-none');

    const usedIds = new Set((project.allocations || []).map(a => a.partnerId));
    const availableT3 = (state.dashboard.partners || []).filter(p => p.tier === 'tier3' && !usedIds.has(p.id));
    const sel = document.getElementById('alloc-partner-select');
    if (sel) {
      if (availableT3.length > 0) {
        sel.innerHTML = availableT3.map(p =>
          `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.bankName ? ` (${escapeHtml(p.bankName)})` : ''}</option>`
        ).join('');
      } else {
        sel.innerHTML = `<option value="">배정 가능한 미등록 3티어가 없습니다 (새 조사원 등록 탭 이용)</option>`;
      }
    }

    document.getElementById('alloc-new-name').value = '';
    document.getElementById('alloc-new-phone').value = '';
    document.getElementById('alloc-new-bank').value = '';
    document.getElementById('alloc-new-account').value = '';
    document.getElementById('alloc-assigned').value = project.metrics.unassignedQuota > 0 ? project.metrics.unassignedQuota : 0;
    document.getElementById('alloc-completed').value = 0;
    document.getElementById('alloc-unit-out').value = project.defaultUnitPriceOut || 0;
    document.getElementById('alloc-extra-out').value = 0;
    document.getElementById('alloc-tax-out').checked = availableT3[0] ? Boolean(availableT3[0].defaultTaxWithholding) : false;
    document.getElementById('alloc-memo').value = '';

    // 등록된 3티어가 0명이면 자동으로 '새 3티어 조사원 등록' 모드로 진입 (Progressive Disclosure)
    applyAllocModalMode(availableT3.length > 0 ? 'existing' : 'new');
  }

  modal.classList.remove('d-none');
}

function applyPartnerModalTier(tier) {
  state.partnerModalTier = tier;
  document.getElementById('btn-ptier-3')?.classList.toggle('active', tier === 'tier3');
  document.getElementById('btn-ptier-1')?.classList.toggle('active', tier === 'tier1');
}

function openPartnerModal(editPartner = null) {
  const modal = document.getElementById('modal-partner');
  if (!modal) return;

  const titleEl = document.getElementById('modal-partner-title');
  const editIdEl = document.getElementById('ptn-edit-id');

  if (editPartner) {
    if (titleEl) titleEl.textContent = `${editPartner.name} 정보 수정`;
    if (editIdEl) editIdEl.value = editPartner.id;
    applyPartnerModalTier(editPartner.tier || 'tier3');
    document.getElementById('ptn-name').value = editPartner.name || '';
    document.getElementById('ptn-phone').value = editPartner.phone || '';
    document.getElementById('ptn-bank').value = editPartner.bankName || '';
    document.getElementById('ptn-account').value = editPartner.accountNumber || '';
    document.getElementById('ptn-holder').value = editPartner.accountHolder || '';
    document.getElementById('ptn-default-tax').checked = Boolean(editPartner.defaultTaxWithholding);
    document.getElementById('ptn-memo').value = editPartner.memo || '';
  } else {
    if (titleEl) titleEl.textContent = '새 거래처·조사원 등록';
    if (editIdEl) editIdEl.value = '';
    applyPartnerModalTier(state.partnerFilter === 'tier1' ? 'tier1' : 'tier3');
    document.getElementById('ptn-name').value = '';
    document.getElementById('ptn-phone').value = '';
    document.getElementById('ptn-bank').value = '';
    document.getElementById('ptn-account').value = '';
    document.getElementById('ptn-holder').value = '';
    document.getElementById('ptn-default-tax').checked = false;
    document.getElementById('ptn-memo').value = '';
  }

  modal.classList.remove('d-none');
}

// ============================================================================
// 9. 이벤트 바인딩 및 액션 위임 핸들러
// ============================================================================

function initSettlementApp() {
  // 상단/하단 탭 전환
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // 귀속월 필터 변경
  const monthSel = document.getElementById('select-period-month');
  if (monthSel) {
    monthSel.addEventListener('change', () => {
      state.periodMonth = monthSel.value || 'all';
      loadDashboard();
    });
  }

  // 엑셀 다운로드
  const btnExcel = document.getElementById('btn-export-excel');
  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      const q = encodeURIComponent(state.periodMonth || 'all');
      window.location.href = `/api/settlement/export/excel?periodMonth=${q}`;
    });
  }

  // 요약 탭의 받을 돈 / 줄 돈 원터치 이동 카드
  document.getElementById('card-jump-uncollected')?.addEventListener('click', () => {
    state.projectFilter = state.dashboard.summary.uncollectedIn > 0 ? 'uncollected' : 'all';
    document.querySelectorAll('#project-filter-chips .stl-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-pfilter') === state.projectFilter);
    });
    switchTab('projects');
    renderProjectsTab();
  });

  document.getElementById('card-jump-unpaid')?.addEventListener('click', () => {
    state.remitFilter = state.dashboard.summary.totalUnpaidOut > 0 ? 'unpaid' : 'all';
    document.querySelectorAll('#remittance-filter-chips .stl-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-rfilter') === state.remitFilter);
    });
    switchTab('remittance');
    renderRemittanceTab();
  });

  // 과제 목록 상단 고정 버튼
  document.getElementById('btn-open-import-project')?.addEventListener('click', () => openProjectModal({ mode: 'autosurvey' }));
  document.getElementById('btn-open-manual-project')?.addEventListener('click', () => openProjectModal({ mode: 'manual' }));
  document.getElementById('btn-open-new-partner')?.addEventListener('click', () => openPartnerModal(null));

  // 모바일 상세 닫기 / 수정 / 삭제 버튼
  document.getElementById('btn-close-mobile-detail')?.addEventListener('click', () => {
    state.isMobileDetailOpen = false;
    document.getElementById('project-detail-pane')?.classList.remove('is-mobile-open');
  });

  document.getElementById('btn-mobile-edit-project')?.addEventListener('click', () => {
    const p = (state.dashboard.projects || []).find(x => x.id === state.selectedProjectId);
    if (p) openProjectModal({ editProject: p });
  });

  document.getElementById('btn-mobile-delete-project')?.addEventListener('click', async () => {
    const p = (state.dashboard.projects || []).find(x => x.id === state.selectedProjectId);
    if (!p) return;
    const ok = await confirmStlDialog({
      title: '정산 과제 삭제',
      message: `'${p.title}' 정산 과제를 삭제하시겠습니까? (AutoSurvey 원본 캠페인 데이터는 삭제되지 않습니다)`,
      confirmText: '삭제'
    });
    if (!ok) return;
    await apiJson(`/api/settlement/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    state.selectedProjectId = null;
    state.isMobileDetailOpen = false;
    showStlToast('정산 과제가 삭제되었습니다.');
    await loadDashboard();
  });

  // 과제 검색 및 상태 필터 칩
  const searchInput = document.getElementById('input-project-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.projectSearch = searchInput.value || '';
      renderProjectsTab();
    });
  }

  document.querySelectorAll('#project-filter-chips .stl-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.projectFilter = chip.getAttribute('data-pfilter') || 'all';
      document.querySelectorAll('#project-filter-chips .stl-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderProjectsTab();
    });
  });

  document.querySelectorAll('#remittance-filter-chips .stl-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.remitFilter = chip.getAttribute('data-rfilter') || 'unpaid';
      document.querySelectorAll('#remittance-filter-chips .stl-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderRemittanceTab();
    });
  });

  document.querySelectorAll('#partner-filter-chips .stl-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.partnerFilter = chip.getAttribute('data-ptfilter') || 'all';
      document.querySelectorAll('#partner-filter-chips .stl-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderPartnersTab();
    });
  });

  // 모달 닫기 및 스위치 컨트롤
  document.getElementById('btn-close-project-modal')?.addEventListener('click', () => document.getElementById('modal-project')?.classList.add('d-none'));
  document.getElementById('btn-cancel-project-modal')?.addEventListener('click', () => document.getElementById('modal-project')?.classList.add('d-none'));
  document.getElementById('btn-psource-autosurvey')?.addEventListener('click', () => applyProjectModalSourceMode('autosurvey'));
  document.getElementById('btn-psource-manual')?.addEventListener('click', () => applyProjectModalSourceMode('manual'));

  // AutoSurvey 캠페인 선택 시 과제명·목표부수 자동 기입
  document.getElementById('proj-linked-campaign')?.addEventListener('change', (e) => {
    const campId = e.target.value;
    const found = state.availableCampaigns.find(c => c.campaignId === campId);
    if (found) {
      document.getElementById('proj-title').value = found.title;
      document.getElementById('proj-target-quota').value = found.targetQuota || 0;
    }
  });

  // 단가 빠른 금액 칩 (+5천 / +1만 / 0)
  document.querySelectorAll('.stl-quick-chips[data-target-input]').forEach(group => {
    const targetId = group.getAttribute('data-target-input');
    group.querySelectorAll('.stl-mini-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(targetId);
        if (!inp) return;
        if (btn.hasAttribute('data-reset')) {
          inp.value = 0;
        } else {
          const add = Number(btn.getAttribute('data-add')) || 0;
          inp.value = (Number(inp.value) || 0) + add;
        }
        updateProjectMarginPreview();
      });
    });
  });

  document.getElementById('proj-unit-in')?.addEventListener('input', updateProjectMarginPreview);
  document.getElementById('proj-unit-out')?.addEventListener('input', updateProjectMarginPreview);

  // 과제 등록/수정 폼 제출
  document.getElementById('form-project')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const editId = document.getElementById('proj-edit-id').value;
      const tier1SelectVal = document.getElementById('proj-tier1-select').value;
      const customT1Name = document.getElementById('proj-tier1-custom-name').value.trim();

      const payload = {
        title: document.getElementById('proj-title').value.trim(),
        periodMonth: document.getElementById('proj-period-month').value,
        targetQuota: Number(document.getElementById('proj-target-quota').value) || 0,
        tier1PartnerId: tier1SelectVal || null,
        tier1PartnerName: tier1SelectVal ? '' : customT1Name,
        saveNewTier1Partner: Boolean(!tier1SelectVal && customT1Name),
        unitPriceIn: Number(document.getElementById('proj-unit-in').value) || 0,
        defaultUnitPriceOut: Number(document.getElementById('proj-unit-out').value) || 0,
        taxWithholdingIn: document.getElementById('proj-tax-in').checked,
        extraAdjustmentIn: Number(document.getElementById('proj-extra-in').value) || 0,
        memo: document.getElementById('proj-memo').value.trim()
      };

      if (editId) {
        await apiJson(`/api/settlement/projects/${encodeURIComponent(editId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        showStlToast('과제 정산 정보가 수정되었습니다.');
      } else {
        if (state.projectModalSource === 'autosurvey') {
          const campId = document.getElementById('proj-linked-campaign').value;
          if (!campId) {
            showStlToast('연동할 AutoSurvey 캠페인을 선택하거나 [외부 과제 직접 입력]을 눌러주세요.');
            return;
          }
          payload.linkedCampaignId = campId;
          payload.applyCampaignCompletedToMyWork = document.getElementById('proj-apply-camp-completed').checked;
        }
        const created = await apiJson('/api/settlement/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        state.selectedProjectId = created.id;
        state.isMobileDetailOpen = true;
        switchTab('projects');
        showStlToast('새 정산 과제가 등록되었습니다.');
      }

      document.getElementById('modal-project')?.classList.add('d-none');
      await loadDashboard();
    } catch (err) {
      showStlToast(err.message);
    }
  });

  // 3티어 분배 모달 이벤트
  document.getElementById('btn-close-alloc-modal')?.addEventListener('click', () => document.getElementById('modal-allocation')?.classList.add('d-none'));
  document.getElementById('btn-cancel-alloc-modal')?.addEventListener('click', () => document.getElementById('modal-allocation')?.classList.add('d-none'));
  document.getElementById('btn-amode-existing')?.addEventListener('click', () => applyAllocModalMode('existing'));
  document.getElementById('btn-amode-new')?.addEventListener('click', () => applyAllocModalMode('new'));

  document.getElementById('alloc-partner-select')?.addEventListener('change', (e) => {
    const ptn = (state.dashboard.partners || []).find(p => p.id === e.target.value);
    if (ptn) {
      document.getElementById('alloc-tax-out').checked = Boolean(ptn.defaultTaxWithholding);
    }
  });

  document.getElementById('form-allocation')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const projectId = state.selectedProjectId;
      if (!projectId) return;
      const editAllocId = document.getElementById('alloc-edit-id').value;

      const common = {
        assignedCount: Number(document.getElementById('alloc-assigned').value) || 0,
        completedCount: Number(document.getElementById('alloc-completed').value) || 0,
        unitPriceOut: Number(document.getElementById('alloc-unit-out').value) || 0,
        extraAdjustmentOut: Number(document.getElementById('alloc-extra-out').value) || 0,
        taxWithholdingOut: document.getElementById('alloc-tax-out').checked,
        memo: document.getElementById('alloc-memo').value.trim()
      };

      if (editAllocId) {
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(editAllocId)}`, {
          method: 'PATCH',
          body: JSON.stringify(common)
        });
        showStlToast('분배 단가 및 설정이 수정되었습니다.');
      } else {
        if (state.allocModalMode === 'existing') {
          const ptnId = document.getElementById('alloc-partner-select').value;
          if (!ptnId) {
            showStlToast('조사원을 선택하거나 [새 3티어 조사원 등록] 탭을 이용해 주세요.');
            return;
          }
          common.partnerId = ptnId;
        } else {
          const newName = document.getElementById('alloc-new-name').value.trim();
          if (!newName) {
            showStlToast('새 3티어 조사원 이름을 입력해 주세요.');
            return;
          }
          common.newPartnerName = newName;
          common.phone = document.getElementById('alloc-new-phone').value.trim();
          common.bankName = document.getElementById('alloc-new-bank').value.trim();
          common.accountNumber = document.getElementById('alloc-new-account').value.trim();
        }
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations`, {
          method: 'POST',
          body: JSON.stringify(common)
        });
        showStlToast('3티어 조사원 분배가 추가되었습니다.');
      }

      document.getElementById('modal-allocation')?.classList.add('d-none');
      await loadDashboard();
    } catch (err) {
      showStlToast(err.message);
    }
  });

  // 거래처·조사원 모달 이벤트
  document.getElementById('btn-close-partner-modal')?.addEventListener('click', () => document.getElementById('modal-partner')?.classList.add('d-none'));
  document.getElementById('btn-cancel-partner-modal')?.addEventListener('click', () => document.getElementById('modal-partner')?.classList.add('d-none'));
  document.getElementById('btn-ptier-3')?.addEventListener('click', () => applyPartnerModalTier('tier3'));
  document.getElementById('btn-ptier-1')?.addEventListener('click', () => applyPartnerModalTier('tier1'));

  document.querySelectorAll('#ptn-bank-chips .stl-mini-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const bank = chip.getAttribute('data-bank') || '';
      const inp = document.getElementById('ptn-bank');
      if (inp) inp.value = bank;
    });
  });

  document.getElementById('form-partner')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const editId = document.getElementById('ptn-edit-id').value;
      const payload = {
        tier: state.partnerModalTier,
        name: document.getElementById('ptn-name').value.trim(),
        phone: document.getElementById('ptn-phone').value.trim(),
        bankName: document.getElementById('ptn-bank').value.trim(),
        accountNumber: document.getElementById('ptn-account').value.trim(),
        accountHolder: document.getElementById('ptn-holder').value.trim(),
        defaultTaxWithholding: document.getElementById('ptn-default-tax').checked,
        memo: document.getElementById('ptn-memo').value.trim()
      };

      if (editId) {
        await apiJson(`/api/settlement/partners/${encodeURIComponent(editId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        showStlToast('정보가 수정되었습니다.');
      } else {
        await apiJson('/api/settlement/partners', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showStlToast('장부에 등록되었습니다.');
      }

      document.getElementById('modal-partner')?.classList.add('d-none');
      await loadDashboard();
    } catch (err) {
      showStlToast(err.message);
    }
  });

  // 동적 렌더링 영역 이벤트 위임 (Click)
  document.addEventListener('click', async (e) => {
    const target = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.getAttribute('data-action');
    try {
      if (action === 'open-new-project') {
        const src = target.getAttribute('data-source') || 'autosurvey';
        await openProjectModal({ mode: src });
        return;
      }

      if (action === 'switch-tab') {
        const tab = target.getAttribute('data-tab');
        if (tab) switchTab(tab);
        return;
      }

      if (action === 'reset-project-filter') {
        state.projectFilter = 'all';
        state.projectSearch = '';
        const inp = document.getElementById('input-project-search');
        if (inp) inp.value = '';
        document.querySelectorAll('#project-filter-chips .stl-chip').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-pfilter') === 'all');
        });
        renderProjectsTab();
        return;
      }

      if (action === 'jump-project' || action === 'select-project') {
        const id = target.getAttribute('data-id');
        if (!id) return;
        state.selectedProjectId = id;
        state.isMobileDetailOpen = true;
        if (state.activeTab !== 'projects') {
          switchTab('projects');
        }
        renderProjectsTab();
        return;
      }

      if (action === 'open-edit-project') {
        const id = target.getAttribute('data-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === id);
        if (proj) await openProjectModal({ editProject: proj });
        return;
      }

      if (action === 'delete-project') {
        const id = target.getAttribute('data-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === id);
        if (!proj) return;
        const ok = await confirmStlDialog({
          title: '정산 과제 삭제',
          message: `'${proj.title}' 정산 과제를 삭제하시겠습니까?`,
          confirmText: '삭제'
        });
        if (!ok) return;
        await apiJson(`/api/settlement/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (state.selectedProjectId === id) {
          state.selectedProjectId = null;
          state.isMobileDetailOpen = false;
        }
        showStlToast('정산 과제가 삭제되었습니다.');
        await loadDashboard();
        return;
      }

      if (action === 'set-inflow') {
        const id = target.getAttribute('data-id');
        const inflowStatus = target.getAttribute('data-inflow');
        await apiJson(`/api/settlement/projects/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ inflowStatus })
        });
        showStlToast(
          inflowStatus === 'received'
            ? '1티어 입금완료로 변경되었습니다.'
            : (inflowStatus === 'billed' ? '청구완료 상태로 변경되었습니다.' : '정산대기 상태로 변경되었습니다.')
        );
        await loadDashboard();
        return;
      }

      if (action === 'sync-campaign') {
        const id = target.getAttribute('data-id');
        const applyDiffToMyWork = target.getAttribute('data-apply-diff') === '1';
        await apiJson(`/api/settlement/projects/${encodeURIComponent(id)}/sync-campaign`, {
          method: 'POST',
          body: JSON.stringify({ applyDiffToMyWork })
        });
        showStlToast(applyDiffToMyWork ? 'AutoSurvey 완료 건수가 내 수행 부수에 반영되었습니다.' : 'AutoSurvey 완료 현황을 새로고침했습니다.');
        await loadDashboard();
        return;
      }

      if (action === 'step-my') {
        const id = target.getAttribute('data-id');
        const field = target.getAttribute('data-field');
        const delta = Number(target.getAttribute('data-delta')) || 0;
        const proj = (state.dashboard.projects || []).find(p => p.id === id);
        if (!proj || !field) return;
        const nextVal = Math.max(0, (Number(proj.myWork[field]) || 0) + delta);
        await apiJson(`/api/settlement/projects/${encodeURIComponent(id)}/my-work`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: nextVal })
        });
        await loadDashboard();
        return;
      }

      if (action === 'open-add-alloc') {
        const projectId = target.getAttribute('data-project-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === projectId);
        if (proj) {
          state.selectedProjectId = proj.id;
          openAllocationModal({ project: proj, editAlloc: null });
        }
        return;
      }

      if (action === 'open-edit-alloc') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === projectId);
        const alloc = proj?.allocations.find(a => a.id === allocId);
        if (proj && alloc) {
          state.selectedProjectId = proj.id;
          openAllocationModal({ project: proj, editAlloc: alloc });
        }
        return;
      }

      if (action === 'delete-alloc') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === projectId);
        const alloc = proj?.allocations.find(a => a.id === allocId);
        if (!proj || !alloc) return;
        const ok = await confirmStlDialog({
          title: '분배 내역 삭제',
          message: `'${alloc.partnerName}' 조사원의 분배 내역을 이 과제에서 삭제할까요?`,
          confirmText: '삭제'
        });
        if (!ok) return;
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(allocId)}`, {
          method: 'DELETE'
        });
        showStlToast('분배 내역이 삭제되었습니다.');
        await loadDashboard();
        return;
      }

      if (action === 'step-alloc') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const field = target.getAttribute('data-field');
        const delta = Number(target.getAttribute('data-delta')) || 0;
        const proj = (state.dashboard.projects || []).find(p => p.id === projectId);
        const alloc = proj?.allocations.find(a => a.id === allocId);
        if (!alloc || !field) return;
        const nextVal = Math.max(0, (Number(alloc[field]) || 0) + delta);
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(allocId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: nextVal })
        });
        await loadDashboard();
        return;
      }

      if (action === 'toggle-alloc-paid') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const current = target.getAttribute('data-current');
        const nextStatus = current === 'paid' ? 'unpaid' : 'paid';
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(allocId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ payoutStatus: nextStatus })
        });
        showStlToast(nextStatus === 'paid' ? '송금완료 처리되었습니다.' : '미송금 상태로 되돌렸습니다.');
        await loadDashboard();
        return;
      }

      if (action === 'copy-account') {
        const acct = target.getAttribute('data-account');
        await copyToClipboard(acct, '계좌 정보가 복사되었습니다.');
        return;
      }

      if (action === 'copy-kakao-single') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const proj = (state.dashboard.projects || []).find(p => p.id === projectId);
        const alloc = proj?.allocations.find(a => a.id === allocId);
        if (proj && alloc) {
          const text = buildKakaoStatementSingle(proj, alloc);
          await copyToClipboard(text, '카카오톡 정산 안내문이 복사되었습니다.');
        }
        return;
      }

      if (action === 'copy-kakao-group') {
        const ptnId = target.getAttribute('data-partner-id');
        const ptnName = target.getAttribute('data-partner-name');
        const group = (state.dashboard.remittanceGroups || []).find(g =>
          ptnId ? g.partnerId === ptnId : g.partnerName === ptnName
        );
        if (group) {
          const text = buildKakaoStatementGroup(group, state.remitFilter === 'unpaid');
          await copyToClipboard(text, '통합 카카오톡 정산서가 복사되었습니다.');
        }
        return;
      }

      if (action === 'mark-group-paid') {
        const ptnId = target.getAttribute('data-partner-id');
        const ptnName = target.getAttribute('data-partner-name');
        const amount = Number(target.getAttribute('data-amount')) || 0;
        if (!ptnId) return;
        const ok = await confirmStlDialog({
          title: '일괄 송금완료 처리',
          message: `'${ptnName}' 조사원에게 보낼 미지급금 ${formatWon(amount)}을 모두 송금완료로 처리할까요?`,
          confirmText: '송금완료 확정'
        });
        if (!ok) return;
        await apiJson(`/api/settlement/remittance/${encodeURIComponent(ptnId)}/mark-paid`, {
          method: 'POST',
          body: JSON.stringify({ periodMonth: state.periodMonth })
        });
        showStlToast(`${ptnName}님 송금완료 처리되었습니다.`);
        await loadDashboard();
        return;
      }

      if (action === 'set-remit-filter') {
        const f = target.getAttribute('data-rfilter') || 'all';
        state.remitFilter = f;
        document.querySelectorAll('#remittance-filter-chips .stl-chip').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-rfilter') === f);
        });
        renderRemittanceTab();
        return;
      }

      if (action === 'open-new-partner') {
        openPartnerModal(null);
        return;
      }

      if (action === 'open-edit-partner') {
        const ptnId = target.getAttribute('data-partner-id');
        const found = (state.dashboard.partners || []).find(p => p.id === ptnId);
        if (found) {
          openPartnerModal(found);
        } else {
          openPartnerModal(null);
        }
        return;
      }

      if (action === 'delete-partner') {
        const ptnId = target.getAttribute('data-partner-id');
        const ptnName = target.getAttribute('data-partner-name');
        const ok = await confirmStlDialog({
          title: '장부에서 삭제',
          message: `'${ptnName}' 항목을 장부에서 삭제하시겠습니까? (기존 과제에 기록된 정산 숫자는 유지됩니다)`,
          confirmText: '삭제'
        });
        if (!ok) return;
        await apiJson(`/api/settlement/partners/${encodeURIComponent(ptnId)}`, { method: 'DELETE' });
        showStlToast('장부에서 삭제되었습니다.');
        await loadDashboard();
      }
    } catch (err) {
      showStlToast(err.message);
    }
  });

  // 숫자 스테퍼 직접 타이핑 입력 처리 (Change 위임)
  document.addEventListener('change', async (e) => {
    const target = e.target;
    if (!target || !target.getAttribute) return;
    const changeType = target.getAttribute('data-change');
    if (!changeType) return;

    try {
      if (changeType === 'input-my') {
        const id = target.getAttribute('data-id');
        const field = target.getAttribute('data-field');
        const val = Math.max(0, Math.round(Number(target.value) || 0));
        await apiJson(`/api/settlement/projects/${encodeURIComponent(id)}/my-work`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: val })
        });
        await loadDashboard();
      } else if (changeType === 'input-alloc') {
        const projectId = target.getAttribute('data-project-id');
        const allocId = target.getAttribute('data-alloc-id');
        const field = target.getAttribute('data-field');
        const val = Math.max(0, Math.round(Number(target.value) || 0));
        await apiJson(`/api/settlement/projects/${encodeURIComponent(projectId)}/allocations/${encodeURIComponent(allocId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ [field]: val })
        });
        await loadDashboard();
      }
    } catch (err) {
      showStlToast(err.message);
      await loadDashboard();
    }
  });

  loadDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettlementApp);
} else {
  initSettlementApp();
}
