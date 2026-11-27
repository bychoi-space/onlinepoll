/**
 * [2025년 기준 산림·정원산업조사 (relim.svybx.kr / S21629axjxr5)]
 * STEP 2 마스터 정합성 가이드 및 구글 스프레드시트('선정명단') 연동 설정 렌더러
 */
import { escapeHtml } from './blueprint-utils.js';

export function collectRelimForestryPolicyFromDom(prevPolicy = {}) {
  const autoSyncEl = document.getElementById('chk-relim-auto-sync-sheet');
  const sheetUrlEl = document.getElementById('inp-relim-sheet-url');
  return {
    ...prevPolicy,
    stopBeforeFinalSubmit: true,
    haltOnUnhandledSubjective: true,
    ksic100PercentCodes: ['46101', '46104'],
    subjectiveMaxChars: 10,
    autoSyncGoogleSheet: autoSyncEl ? Boolean(autoSyncEl.checked) : (prevPolicy.autoSyncGoogleSheet !== false),
    googleSheetUrl: sheetUrlEl ? String(sheetUrlEl.value || '').trim() : (prevPolicy.googleSheetUrl || '')
  };
}

export function renderRelimForestryBlueprint(data = {}, {
  quotaDatabase = [],
  blueprintStageGrid,
  badgeMasterStatus,
  btnSaveBaseline,
  onSyncSheet = null
} = {}) {
  if (!blueprintStageGrid) return data.policy || {};

  // Kstat 전용 그룹 탭바 숨김 처리
  const groupNavCard = document.querySelector('.group-nav-card, #group-tabs-bar');
  if (groupNavCard) groupNavCard.style.display = 'none';
  const presetBtns = document.querySelectorAll('#btn-preset-standard, #btn-preset-growth, #btn-preset-traditional, #btn-preset-rotation, #btn-import-campaign-baseline');
  presetBtns.forEach(b => {
    if (b) b.style.display = 'none';
  });

  const policy = {
    stopBeforeFinalSubmit: true,
    haltOnUnhandledSubjective: true,
    autoSyncGoogleSheet: true,
    ksic100PercentCodes: ['46101', '46104'],
    subjectiveMaxChars: 10,
    ...(data.policy || {})
  };
  const sheetUrl = data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/12JbrVKTAEyAmEzPOp9W7HvdLa2ghN6cES3wFbikIa4g/edit?gid=2054505699#gid=2054505699';
  const stages = Array.isArray(data.blueprint?.stages) ? data.blueprint.stages : [];

  const totalCnt = quotaDatabase.length;
  const effSelected = quotaDatabase.filter(q => q.effectiveRole === '선정(유효)').length;
  const effSub = quotaDatabase.filter(q => q.effectiveRole === '예비(선정대체)').length;
  const closedCnt = quotaDatabase.filter(q => q.isClosedBiz).length;
  const homepageCnt = quotaDatabase.filter(q => q.hasHomepage === '있음').length;
  const niceCnt = quotaDatabase.filter(q => String(q.financialSource || '').includes('NICE')).length;
  const ksic100Cnt = quotaDatabase.filter(q => q.ksicCode === '46101' || q.ksicCode === '46104').length;

  if (badgeMasterStatus) {
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-shield-halved text-success"></i> KSIC 46101·46104 100% 정합 · 주관식 누락 즉시중단 · DQ(99%) 안전대기 활성';
  }
  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 산림·정원산업조사 응답 가이드 저장';
  }

  blueprintStageGrid.innerHTML = `
    <div class="stage-card" style="grid-column: 1 / -1; border-left: 4px solid #16a34a;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
        <div>
          <h4 style="margin:0 0 6px 0; font-size:1.05rem;">🌲 2025년 기준 산림·정원산업조사 실측 기초데이터 요약 &amp; 구글 시트('선정명단') 연동</h4>
          <p class="font-caption text-dim" style="margin:0;">
            전체 <strong>${totalCnt}개</strong> 표본(유효 선정 <strong>${effSelected}건</strong> + 휴폐업 자동대체 예비 <strong>${effSub}건</strong> = 실행목표 <strong>${effSelected + effSub}건</strong> / 휴폐업·결번 제외 ${closedCnt}건)에 대해
            실제 기업검색(홈택스 상태, 홈페이지 <strong>${homepageCnt}건</strong>, NICE 재무실측 <strong>${niceCnt}건</strong>, KSIC 46101·46104 100% 대상 <strong>${ksic100Cnt}건</strong>)이 반영되었습니다.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a href="${escapeHtml(sheetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;">
            <i class="fa-solid fa-up-right-from-square text-primary-color"></i> 선정명단 구글 시트 열기
          </a>
          <button type="button" id="btn-relim-bp-sync-sheet" class="btn-pill btn-pill-primary btn-pill-small font-bold">
            <i class="fa-solid fa-arrows-rotate"></i> 실시간 현황 + 구글 시트 즉시 동기화
          </button>
          <a href="/api/campaigns/camp_relim_forestry_2009/export-answers-xlsx" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;">
            <i class="fa-solid fa-file-excel text-success-color"></i> 수집 데이터 Excel 다운로드
          </a>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px; padding-top:10px; border-top:1px solid rgba(148,163,184,0.2);">
        <div>
          <label class="font-caption font-bold" style="display:block; margin-bottom:4px;">연동 구글 스프레드시트 URL ('선정명단' 탭 J열~AN열 자동 기록)</label>
          <input type="text" id="inp-relim-sheet-url" class="figma-input" style="width:100%;" value="${escapeHtml(sheetUrl)}" />
        </div>
        <div style="display:flex; flex-direction:column; justify-content:center; gap:6px;">
          <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:0.9rem;">
            <input type="checkbox" id="chk-relim-auto-sync-sheet" ${policy.autoSyncGoogleSheet !== false ? 'checked' : ''} style="width:16px; height:16px; accent-color:#16a34a;" />
            <span><strong>단건/배치 실행 후 구글 시트('선정명단') 자동 동기화</strong></span>
          </label>
          <div class="font-caption text-dim">
            🔒 <strong>고정 안전 원칙:</strong> ① <code>svyI058.asp(DQ)</code> 완료직전 99% 안전 대기 · ② 미정의 주관식 출현 시 즉시 중단(스킵 금지)
          </div>
        </div>
      </div>
    </div>

    ${stages.map(st => `
      <div class="stage-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span class="badge-status ready font-mono">STAGE ${escapeHtml(String(st.stage || ''))}</span>
          <span class="font-caption font-mono text-dim">${escapeHtml(st.pages || '')}</span>
        </div>
        <h4 style="margin:0 0 8px 0; font-size:0.98rem;">${escapeHtml(st.title || '')}</h4>
        <ul style="margin:0; padding-left:18px; font-size:0.86rem; line-height:1.55;">
          ${(st.rules || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
  `;

  const syncBtn = document.getElementById('btn-relim-bp-sync-sheet');
  if (syncBtn && typeof onSyncSheet === 'function') {
    syncBtn.addEventListener('click', () => onSyncSheet());
  }

  return policy;
}
