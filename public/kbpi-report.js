/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사]
 * 실시간 응답 내용 웹 확인 리포트 프론트엔드 컨트롤러
 */
import { escapeHtml } from './modules/blueprint-utils.js';

const ZQ_META = [
  ['ZQ1', '연령대'],
  ['ZQ2', '최종학력'],
  ['ZQ3', '직업'],
  ['ZQ4', '월평균 가구소득'],
  ['ZQ5', '결혼여부'],
  ['ZQ5_1', '동거 가족수'],
  ['ZQ5_2', '자녀수'],
  ['ZQ6', '패널 가입의향']
];

const state = {
  data: null,
  selectedPersonSeq: 'all',
  expandedAllSeq: null,
  syncingCapi: false
};

function getCampaignIdParam() {
  const params = new URLSearchParams(window.location.search || '');
  return params.get('id') || 'camp_kmac_kbpi_5911000005645';
}

function showBanner(msg = '', isError = false) {
  const el = document.getElementById('rpt-status-banner');
  if (!el) return;
  if (!msg) {
    el.classList.add('kbpi-hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('kbpi-hidden');
  el.classList.toggle('kbpi-text-error', Boolean(isError));
}

function renderKpisAndHeader() {
  if (!state.data) return;
  const { kpis, title, loginId, campaignId, googleSheetUrl } = state.data;

  const titleEl = document.getElementById('rpt-title');
  if (titleEl && title) titleEl.textContent = `${title} — 응답 내용 리포트`;

  const loginEl = document.getElementById('rpt-login-id');
  if (loginEl) loginEl.textContent = `계정: ${loginId || '5911000005645'}`;

  const detailLink = document.getElementById('nav-go-kbpi-detail');
  if (detailLink && campaignId) {
    detailLink.setAttribute('href', `survey-detail.html?id=${encodeURIComponent(campaignId)}`);
  }

  const sheetLink = document.getElementById('link-google-sheet');
  if (sheetLink && googleSheetUrl) {
    sheetLink.setAttribute('href', googleSheetUrl);
  }

  document.getElementById('kpi-total').innerHTML =
    `${kpis.totalCount}<span class="kbpi-rpt-kpi-unit">명</span>`;
  document.getElementById('kpi-region-sub').textContent =
    `서울 ${kpis.seoulCount}명 · 인천 ${kpis.incheonCount}명`;
  document.getElementById('kpi-pilot-done').innerHTML =
    `${kpis.pilotDoneCount}<span class="kbpi-rpt-kpi-unit">명 (99%)</span>`;
  document.getElementById('kpi-scanned').innerHTML =
    `${kpis.scannedCount}<span class="kbpi-rpt-kpi-unit">명</span>`;
  document.getElementById('kpi-completed').innerHTML =
    `${kpis.completedCount}<span class="kbpi-rpt-kpi-unit">명</span>`;
  document.getElementById('kpi-warn-slots').innerHTML =
    `${kpis.totalWarnSlots}<span class="kbpi-rpt-kpi-unit">건</span>`;

  const tabDoneBtn = document.getElementById('tab-btn-done');
  if (tabDoneBtn) {
    tabDoneBtn.textContent = `1. 본설문 응답 상세 확인 (${kpis.answeredCount}명)`;
  }
  const tabAllBtn = document.getElementById('tab-btn-all');
  if (tabAllBtn) {
    tabAllBtn.textContent = `2. 전체 ${kpis.totalCount}명 진행현황 & 출제 브랜드`;
  }
}

function renderPersonChips() {
  if (!state.data) return;
  const wrap = document.getElementById('done-person-chips');
  if (!wrap) return;
  const list = state.data.answeredRespondents || [];

  const chips = [
    `<button type="button" data-seq="all" class="kbpi-person-chip ${state.selectedPersonSeq === 'all' ? 'active' : ''}">전체 ${list.length}명</button>`
  ];

  list.forEach((p) => {
    const isAct = String(state.selectedPersonSeq) === String(p.seq);
    chips.push(
      `<button type="button" data-seq="${p.seq}" class="kbpi-person-chip ${isAct ? 'active' : ''}">#${p.seq} ${escapeHtml(p.name)} (${p.age}세)</button>`
    );
  });

  wrap.innerHTML = chips.join('');
}

function renderDonePanel() {
  if (!state.data) return;
  renderPersonChips();

  const container = document.getElementById('done-cards-container');
  if (!container) return;

  const expFilter = document.getElementById('done-exp-filter')?.value || 'all';
  const query = (document.getElementById('done-search')?.value || '').trim().toLowerCase();
  const list = state.data.answeredRespondents || [];

  if (list.length === 0) {
    container.innerHTML = `
      <div class="kbpi-rpt-card">
        <p class="kbpi-rpt-subtitle">아직 본설문 응답 완료(또는 완료직전 대기) 상태인 응답자가 없습니다.</p>
      </div>`;
    return;
  }

  const targets = state.selectedPersonSeq === 'all'
    ? list
    : list.filter((p) => String(p.seq) === String(state.selectedPersonSeq));

  const cardsHtml = targets.map((person) => {
    const filteredSlots = (person.slots || []).filter((s) => {
      if (expFilter === 'yes' && s.purchaseExp !== '있음') return false;
      if (expFilter === 'no' && s.purchaseExp !== '없음') return false;
      if (expFilter === 'warn' && (!s.reviewNotes || s.reviewNotes.length === 0)) return false;
      if (query) {
        const hay = `${s.categoryName} ${s.industryKey} ${s.brandName} ${s.brandCode} ${s.channel} ${(s.q1Brands || []).join(' ')} ${s.q3Summary || ''} ${(s.reviewNotes || []).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    const zqGridHtml = ZQ_META.map(([key, label]) => `
      <div class="kbpi-zq-item">
        <div class="kbpi-zq-item-k">${escapeHtml(key)} · ${escapeHtml(label)}</div>
        <div class="kbpi-zq-item-v">${escapeHtml(person.zq?.[key] || '-')}</div>
      </div>
    `).join('');

    const dq1Line = (person.dq1Labels && person.dq1Labels.length > 0)
      ? `<div class="kbpi-person-meta-line"><span><strong>DQ1 평소 정보습득 경로:</strong> ${escapeHtml(person.dq1Labels.join(', '))}</span></div>`
      : '';

    const hasCapiExtra = (person.slots || []).some((s) => (s.q1Brands && s.q1Brands.length > 0) || s.q3Summary);

    const rowsHtml = filteredSlots.length === 0
      ? `<tr><td colspan="${hasCapiExtra ? 7 : 6}" class="kbpi-muted">선택한 필터 조건에 해당하는 품목이 없습니다.</td></tr>`
      : filteredSlots.map((s) => {
          const hasWarn = s.reviewNotes && s.reviewNotes.length > 0;
          const expBadge = s.purchaseExp === '있음'
            ? `<span class="kbpi-badge kbpi-badge-ok">있음</span>`
            : `<span class="kbpi-badge kbpi-badge-muted">없음</span>`;

          let brandCell = '';
          if (s.purchaseExp === '없음') {
            brandCell = `<span class="kbpi-muted">없음 (문4·문5 '없음' 선택)</span>`;
          } else if (!s.brandName) {
            brandCell = `<span class="kbpi-muted">(로컬 DB 미기록 · CAPI 저장됨)</span>`;
          } else {
            brandCell = `<strong>${escapeHtml(s.brandName)}</strong>` +
              (s.brandCode ? ` <span class="kbpi-muted kbpi-mono">[코드:${escapeHtml(s.brandCode)}]</span>` : '');
          }

          const chCell = s.purchaseExp === '없음'
            ? `<span class="kbpi-muted">- (비대상)</span>`
            : (s.channel ? escapeHtml(s.channel) : `<span class="kbpi-muted">(미기록)</span>`);

          const noteCell = hasWarn
            ? s.reviewNotes.map((n) => `<span class="kbpi-badge kbpi-badge-warn">${escapeHtml(n)}</span>`).join(' ')
            : `<span class="kbpi-badge kbpi-badge-ok">정상</span>`;

          const extraCol = hasCapiExtra
            ? `<td>
                ${(s.q1Brands && s.q1Brands.length > 0) ? `<div><span class="kbpi-muted">상기:</span> ${escapeHtml(s.q1Brands.join(', '))}</div>` : ''}
                ${s.q3Summary ? `<div class="kbpi-muted">${escapeHtml(s.q3Summary)}</div>` : ''}
               </td>`
            : '';

          return `
            <tr class="${hasWarn ? 'kbpi-row-warn' : ''}">
              <td class="kbpi-mono">#${String(s.slot).padStart(2, '0')}</td>
              <td><strong>${escapeHtml(s.categoryName)}</strong> <span class="kbpi-muted kbpi-mono">(${escapeHtml(s.industryKey)})</span></td>
              <td>${expBadge}</td>
              <td>${brandCell}</td>
              <td>${chCell}</td>
              ${extraCol}
              <td>${noteCell}</td>
            </tr>
          `;
        }).join('');

    return `
      <article class="kbpi-person-card">
        <div class="kbpi-person-head">
          <div>
            <div class="kbpi-rpt-badge-row">
              <strong class="kbpi-rpt-title">#${person.seq} ${escapeHtml(person.name)}</strong>
              <span class="kbpi-badge kbpi-badge-primary">${escapeHtml(person.region)} · ${escapeHtml(person.gender)} · ${escapeHtml(person.ageGroup)} (만 ${person.age}세)</span>
              <span class="kbpi-badge kbpi-badge-ok">${escapeHtml(person.status)} · ${escapeHtml(person.progress)}</span>
              ${person.warnCount > 0 ? `<span class="kbpi-badge kbpi-badge-warn">검수 참고 ${person.warnCount}건</span>` : ''}
              ${person.capiSyncedAt ? `<span class="kbpi-badge kbpi-badge-primary">CAPI 실데이터 반영됨</span>` : ''}
            </div>
            <div class="kbpi-person-meta-line">
              <span>연락처: <strong class="kbpi-mono">${escapeHtml(person.phone)}</strong></span>
              <span>고유번호(UID): <strong class="kbpi-mono">${escapeHtml(person.uid)}</strong> (최종id: ${escapeHtml(person.finalId)})</span>
              <span>조사지역(M_CHECK): <strong>${escapeHtml(person.region)} ${escapeHtml(person.surveyDistrict)} ${escapeHtml(person.surveyDong)}</strong></span>
              <span>GPS(GP1): <strong class="kbpi-mono">${person.latitude ?? '-'}, ${person.longitude ?? '-'}</strong> (${escapeHtml(person.gpsLabel)})</span>
            </div>
            ${dq1Line}
          </div>
          <div class="kbpi-rpt-badge-row">
            <span class="kbpi-badge kbpi-badge-ok">구입경험 있음 ${person.yesCount}개</span>
            <span class="kbpi-badge kbpi-badge-muted">없음 ${person.noCount}개</span>
          </div>
        </div>

        <div class="kbpi-zq-box">
          <div class="kbpi-zq-label">종결부 통계 배경변인 응답 내역 (ZQ1 ~ ZQ6)</div>
          <div class="kbpi-zq-grid">${zqGridHtml}</div>
        </div>

        <div class="kbpi-table-wrap">
          <table class="kbpi-table">
            <thead>
              <tr>
                <th>슬롯</th>
                <th>출제 산업군 (코드)</th>
                <th>구입경험</th>
                <th>문항 4·5 최근구입 / 향후선호 브랜드</th>
                <th>문항 4-1 주관식 구입경로</th>
                ${hasCapiExtra ? '<th>문항 1 상기 · 문항 3 평가 요약</th>' : ''}
                <th>검수 상태 / 참고 메모</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </article>
    `;
  });

  container.innerHTML = cardsHtml.join('');
}

function renderSegmentMatrix() {
  if (!state.data) return;
  const wrap = document.getElementById('segment-matrix-wrap');
  if (!wrap) return;

  const ageGroups = ['10대', '20대', '30대', '40대', '50대'];
  const rows = (state.data.segmentMatrix || []).map((row) => {
    const cells = row.cells.map((c) => {
      const cls = c.answered > 0 ? 'kbpi-badge-ok' : 'kbpi-badge-muted';
      return `<td><span class="kbpi-badge ${cls} kbpi-mono">${c.answered} / ${c.total}</span></td>`;
    }).join('');
    return `
      <tr>
        <td><strong>${escapeHtml(row.region)} · ${escapeHtml(row.gender)}성</strong></td>
        ${cells}
        <td class="kbpi-mono"><strong>${row.rowAnswered} / ${row.rowTotal}</strong></td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="kbpi-table">
      <thead>
        <tr>
          <th>지역 · 성별 구분</th>
          ${ageGroups.map((g) => `<th>${g}</th>`).join('')}
          <th>소계</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAllPanel() {
  if (!state.data) return;
  renderSegmentMatrix();

  const tbody = document.getElementById('all-tbody');
  if (!tbody) return;

  const reg = document.getElementById('all-region')?.value || 'all';
  const gen = document.getElementById('all-gender')?.value || 'all';
  const age = document.getElementById('all-age')?.value || 'all';
  const st = document.getElementById('all-status')?.value || 'all';
  const q = (document.getElementById('all-search')?.value || '').trim().toLowerCase();

  const filtered = (state.data.allRespondents || []).filter((it) => {
    if (reg !== 'all' && it.region !== reg) return false;
    if (gen !== 'all' && it.gender !== gen) return false;
    if (age !== 'all' && it.ageGroup !== age) return false;
    if (st === 'answered' && !it.isAnswered) return false;
    if (st === 'scanned' && it.isAnswered) return false;
    if (q) {
      const slotStr = (it.slots || []).map((s) => s.categoryName).join(' ');
      const hay = `${it.seq} ${it.name} ${it.uid} ${it.finalId} ${it.phone} ${it.surveyDistrict} ${it.surveyDong} ${slotStr}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const cntEl = document.getElementById('all-count-label');
  if (cntEl) cntEl.textContent = `${filtered.length}명 표시 중`;

  tbody.innerHTML = filtered.map((it) => {
    const badgeCls = it.isAnswered ? 'kbpi-badge-ok' : 'kbpi-badge-primary';
    const isExp = state.expandedAllSeq === it.seq;

    let expandHtml = '';
    if (isExp) {
      const slotChips = (it.slots || []).map((s) => {
        const cls = s.purchaseExp === '있음' ? 'kbpi-badge-ok' : 'kbpi-badge-muted';
        return `<span class="kbpi-badge ${cls}">#${String(s.slot).padStart(2, '0')} ${escapeHtml(s.categoryName)} (${escapeHtml(s.purchaseExp)})</span>`;
      }).join('');

      expandHtml = `
        <tr>
          <td colspan="8" class="kbpi-expand-cell">
            <div class="kbpi-person-meta-line">
              <span><strong>배경변인 상세:</strong> 학력=${escapeHtml(it.education)} · 직업=${escapeHtml(it.job)} · 가구소득=${escapeHtml(it.householdIncome)} · 결혼=${escapeHtml(it.maritalStatus)} · 가족수=${escapeHtml(it.familySize)} · 자녀수=${escapeHtml(it.childrenCount)}</span>
              <span class="kbpi-mono">GPS: ${it.latitude ?? '-'}, ${it.longitude ?? '-'} (${escapeHtml(it.gpsLabel)})</span>
            </div>
            <div class="kbpi-slot-chip-wrap">${slotChips}</div>
          </td>
        </tr>
      `;
    }

    return `
      <tr data-row-seq="${it.seq}" class="kbpi-row-clickable">
        <td class="kbpi-mono"><strong>#${it.seq}</strong></td>
        <td><span class="kbpi-badge ${badgeCls}">${escapeHtml(it.status)} (${escapeHtml(it.progress)})</span></td>
        <td><strong>${escapeHtml(it.name)}</strong> <span class="kbpi-muted">(${escapeHtml(it.gender)}·${it.age}세/${escapeHtml(it.ageGroup)})</span></td>
        <td>${escapeHtml(it.region)} ${escapeHtml(it.surveyDistrict)} ${escapeHtml(it.surveyDong)}</td>
        <td class="kbpi-mono">${escapeHtml(it.phone)}</td>
        <td class="kbpi-mono">${escapeHtml(it.finalId)} · ${escapeHtml(it.uid)}</td>
        <td class="kbpi-muted">${escapeHtml(it.education)} / ${escapeHtml(it.job)} / ${escapeHtml(it.householdIncome)}</td>
        <td class="kbpi-mono">총 ${(it.slots || []).length}개 (있음 ${it.yesCount} · 없음 ${it.noCount}) ${isExp ? '▲' : '▼'}</td>
      </tr>
      ${expandHtml}
    `;
  }).join('');
}

function downloadCsv(filename, rows) {
  const escCsv = (val) => {
    const s = String(val ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\uFEFF' + rows.map((r) => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleExportDoneCsv() {
  if (!state.data) return;
  const header = [
    '응답자순번', '이름', '지역', '조사구', '조사동', '성별', '연령대', '만나이', '전화번호', '최종id', '고유번호(UID)',
    '진행상태', '진행률', 'ZQ1_연령대', 'ZQ2_학력', 'ZQ3_직업', 'ZQ4_가구소득', 'ZQ5_결혼여부', 'ZQ5_1_가족수', 'ZQ5_2_자녀수', 'ZQ6_패널가입',
    '품목슬롯', '산업군코드', '출제산업군명', '구입경험', '문항4_5_응답브랜드', '브랜드보기코드', '문항4_1_주관식구입채널', '검수참고메모'
  ];
  const rows = [header];
  (state.data.answeredRespondents || []).forEach((p) => {
    const zq = p.zq || {};
    (p.slots || []).forEach((s) => {
      rows.push([
        p.seq, p.name, p.region, p.surveyDistrict, p.surveyDong, p.gender, p.ageGroup, p.age, p.phone, p.finalId, p.uid,
        p.status, p.progress, zq.ZQ1 || '', zq.ZQ2 || '', zq.ZQ3 || '', zq.ZQ4 || '', zq.ZQ5 || '', zq.ZQ5_1 || '', zq.ZQ5_2 || '', zq.ZQ6 || '',
        s.slot, s.industryKey, s.categoryName, s.purchaseExp, s.brandName, s.brandCode, s.channel, (s.reviewNotes || []).join(' / ')
      ]);
    });
  });
  downloadCsv('KBPI_2027_본설문응답상세.csv', rows);
}

function handleExportAllCsv() {
  if (!state.data) return;
  const header = [
    '순번', '지역', '조사구', '조사동', '성별', '연령대', '만나이', '이름', '전화번호', '진행상태', '진행률', '최종id', '고유번호(UID)',
    '학력', '직업', '가구소득', '결혼여부', '가족수', '자녀수', '위도', '경도'
  ];
  for (let i = 1; i <= 20; i++) {
    header.push(`브랜드${i}`, `구입경험${i}`);
  }
  const rows = [header];
  (state.data.allRespondents || []).forEach((it) => {
    const line = [
      it.seq, it.region, it.surveyDistrict, it.surveyDong, it.gender, it.ageGroup, it.age, it.name, it.phone,
      it.status, it.progress, it.finalId, it.uid, it.education, it.job, it.householdIncome, it.maritalStatus,
      it.familySize, it.childrenCount, it.latitude ?? '', it.longitude ?? ''
    ];
    for (let i = 0; i < 20; i++) {
      const sl = it.slots?.[i];
      line.push(sl ? sl.categoryName : '', sl ? sl.purchaseExp : '');
    }
    rows.push(line);
  });
  downloadCsv('KBPI_2027_전체150명_현황_및_출제브랜드.csv', rows);
}

async function fetchReportData() {
  try {
    showBanner('실시간 K-BPI 응답 데이터를 불러오는 중...');
    const campId = getCampaignIdParam();
    const res = await fetch(`/api/kbpi/response-summary?id=${encodeURIComponent(campId)}`);
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || '응답 데이터를 불러오지 못했습니다.');
    }
    state.data = json;
    showBanner('');
    renderKpisAndHeader();
    renderDonePanel();
    renderAllPanel();
  } catch (err) {
    showBanner(`데이터 조회 오류: ${err.message}`, true);
  }
}

async function handleSyncCapiReadonly() {
  if (state.syncingCapi || !state.data) return;
  const campId = state.data.campaignId || getCampaignIdParam();
  const btn = document.getElementById('btn-sync-capi-readonly');
  try {
    state.syncingCapi = true;
    if (btn) btn.disabled = true;
    showBanner('CAPI 서버에 접속하여 응답 완료 직전 슬롯들의 실제 저장 데이터(Q1~ZQ6)를 읽기 전용으로 불러오는 중입니다 (약 20~40초 소요, 제출/수정 절대 없음)...');

    const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/kbpi-sync-capi-answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'CAPI 동기화에 실패했습니다.');
    }
    state.data = json;
    const okCnt = (json.syncedResults || []).filter((x) => x.ok).length;
    showBanner(`CAPI 서버 저장 응답 동기화 완료 (${okCnt}명 반영 완료)`);
    renderKpisAndHeader();
    renderDonePanel();
    renderAllPanel();
  } catch (err) {
    showBanner(`CAPI 동기화 실패: ${err.message}`, true);
  } finally {
    state.syncingCapi = false;
    if (btn) btn.disabled = false;
  }
}

function initKbpiReportPage() {
  document.querySelectorAll('.kbpi-rpt-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.kbpi-rpt-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.getElementById('panel-done')?.classList.toggle('kbpi-hidden', tab !== 'done');
      document.getElementById('panel-all')?.classList.toggle('kbpi-hidden', tab !== 'all');
      document.getElementById('panel-rules')?.classList.toggle('kbpi-hidden', tab !== 'rules');
    });
  });

  document.getElementById('done-person-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.kbpi-person-chip');
    if (!btn) return;
    state.selectedPersonSeq = btn.getAttribute('data-seq') || 'all';
    renderDonePanel();
  });

  document.getElementById('done-exp-filter')?.addEventListener('change', renderDonePanel);
  document.getElementById('done-search')?.addEventListener('input', renderDonePanel);

  ['all-region', 'all-gender', 'all-age', 'all-status'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', renderAllPanel);
  });
  document.getElementById('all-search')?.addEventListener('input', renderAllPanel);

  document.getElementById('all-tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-row-seq]');
    if (!tr) return;
    const seq = Number(tr.getAttribute('data-row-seq'));
    state.expandedAllSeq = state.expandedAllSeq === seq ? null : seq;
    renderAllPanel();
  });

  document.getElementById('btn-refresh-report')?.addEventListener('click', fetchReportData);
  document.getElementById('btn-sync-capi-readonly')?.addEventListener('click', handleSyncCapiReadonly);
  document.getElementById('btn-export-done-csv')?.addEventListener('click', handleExportDoneCsv);
  document.getElementById('btn-export-all-csv')?.addEventListener('click', handleExportAllCsv);

  fetchReportData();
}

document.addEventListener('DOMContentLoaded', initKbpiReportPage);
