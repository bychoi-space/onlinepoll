import { escapeHtml } from './blueprint-utils.js';

export const GLOBALRI_AGE_GROUP_METAS = {
  age20: { key: 'age20', name: '20대 그룹', range: '만 18~29세 (1997~2008년생)', desc: '대학생·사회초년생·청년층 (고득점 문해력 · 디지털/AI 강세 · 대졸/재학 중심)', color: '#38bdf8' },
  age30: { key: 'age30', name: '30대 그룹', range: '만 30~39세 (1987~1996년생)', desc: '핵심 경제활동 직장인·전문직층 (문해력 만점 · 금융/디지털 우수 · 상근직 중심)', color: '#34d399' },
  age40: { key: 'age40', name: '40대 그룹', range: '만 40~49세 (1977~1986년생)', desc: '중추 경제활동·학부모층 (문해력 우수 · 건강/금융/공공 문해 고른 분포)', color: '#c084fc' },
  age50: { key: 'age50', name: '50대 그룹', range: '만 50~59세 (1967~1976년생)', desc: '중장년 자영업·직장인·주부층 (심화문해 16~19문항 · 고졸/대졸 · 중산층 소득)', color: '#fbbf24' },
  age60: { key: 'age60', name: '60대 그룹', range: '만 60~69세 (1957~1966년생)', desc: '장년·은퇴 전환기층 (심화문해 13~16문항 · 건강문해 관심 · 중졸/고졸 중심)', color: '#fb923c' },
  age70: { key: 'age70', name: '70대 이상', range: '만 70세 이상 (1956년 이전생)', desc: '고령·은퇴층 (심화문해 9~13문항 · 문해교육 수요 반영 · 초졸/중졸 중심)', color: '#fb7185' }
};

export const DEFAULT_GLOBALRI_AGE_POLICIES = {
  age20: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 19,
    partC_correctCountMax: 20,
    D1_lifeSatisfaction: '4',
    D2_politicalInterest: '3',
    D3_socialStatus: '3',
    D4_socialGathering: '2',
    D5_1_healthLiteracy: '4_5',
    D5_2_publicLiteracy: '4_5',
    D5_3_financialLiteracy: '4_5',
    D5_4_digitalAiLiteracy: '4_5',
    E1_educationNeed: '2',
    E1_1_participationIntent: '1',
    E1_2_barrierReason: '1',
    E2_programDesireMode: '3_4',
    E2_preferredPrograms: 'digital_finance',
    F01_1_educationLevel: '6',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '6',
    F02_motherEdu: '4',
    F03_economicActivity: '1',
    F04_occupation: '3',
    F04_1_employmentType: '1',
    F04_2_workStatus: '1',
    F05_1_personalIncome: '3',
    F05_2_householdIncome: '5'
  },
  age30: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 19,
    partC_correctCountMax: 20,
    D1_lifeSatisfaction: '4',
    D2_politicalInterest: '3',
    D3_socialStatus: '3_4',
    D4_socialGathering: '3',
    D5_1_healthLiteracy: '4_5',
    D5_2_publicLiteracy: '4_5',
    D5_3_financialLiteracy: '4_5',
    D5_4_digitalAiLiteracy: '4_5',
    E1_educationNeed: '2',
    E1_1_participationIntent: '1',
    E1_2_barrierReason: '1',
    E2_programDesireMode: '3_4',
    E2_preferredPrograms: 'digital_finance',
    F01_1_educationLevel: '6',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '4',
    F02_motherEdu: '4',
    F03_economicActivity: '1',
    F04_occupation: '2',
    F04_1_employmentType: '1',
    F04_2_workStatus: '1',
    F05_1_personalIncome: '4',
    F05_2_householdIncome: '6'
  },
  age40: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 18,
    partC_correctCountMax: 20,
    D1_lifeSatisfaction: '3_4',
    D2_politicalInterest: '3_4',
    D3_socialStatus: '3',
    D4_socialGathering: '3',
    D5_1_healthLiteracy: '4_5',
    D5_2_publicLiteracy: '4_5',
    D5_3_financialLiteracy: '3_4',
    D5_4_digitalAiLiteracy: '4_5',
    E1_educationNeed: '2',
    E1_1_participationIntent: '1',
    E1_2_barrierReason: '1',
    E2_programDesireMode: '3_4',
    E2_preferredPrograms: 'digital_finance',
    F01_1_educationLevel: '6',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '4',
    F02_motherEdu: '3',
    F03_economicActivity: '1',
    F04_occupation: '3',
    F04_1_employmentType: '1',
    F04_2_workStatus: '1',
    F05_1_personalIncome: '4',
    F05_2_householdIncome: '6'
  },
  age50: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 16,
    partC_correctCountMax: 19,
    D1_lifeSatisfaction: '3_4',
    D2_politicalInterest: '3_4',
    D3_socialStatus: '3',
    D4_socialGathering: '3',
    D5_1_healthLiteracy: '3_4',
    D5_2_publicLiteracy: '3_4',
    D5_3_financialLiteracy: '3_4',
    D5_4_digitalAiLiteracy: '3_4',
    E1_educationNeed: '2',
    E1_1_participationIntent: '1',
    E1_2_barrierReason: '1',
    E2_programDesireMode: '2_3',
    E2_preferredPrograms: 'health_leisure',
    F01_1_educationLevel: '4',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '3',
    F02_motherEdu: '2',
    F03_economicActivity: '1',
    F04_occupation: '5',
    F04_1_employmentType: '2',
    F04_2_workStatus: '1',
    F05_1_personalIncome: '3',
    F05_2_householdIncome: '5'
  },
  age60: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 13,
    partC_correctCountMax: 16,
    D1_lifeSatisfaction: '3_4',
    D2_politicalInterest: '4',
    D3_socialStatus: '3',
    D4_socialGathering: '3',
    D5_1_healthLiteracy: '3_4',
    D5_2_publicLiteracy: '3_4',
    D5_3_financialLiteracy: '3_4',
    D5_4_digitalAiLiteracy: '2_3',
    E1_educationNeed: '2',
    E1_1_participationIntent: '1',
    E1_2_barrierReason: '1',
    E2_programDesireMode: '2_3',
    E2_preferredPrograms: 'health_leisure',
    F01_1_educationLevel: '4',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '2',
    F02_motherEdu: '2',
    F03_economicActivity: '1',
    F04_occupation: '4',
    F04_1_employmentType: '2',
    F04_2_workStatus: '1',
    F05_1_personalIncome: '2',
    F05_2_householdIncome: '3'
  },
  age70: {
    preserveExistingInputs: true,
    partA_targetScore: 3,
    partB1_targetScore: 20,
    partC_correctCountMin: 9,
    partC_correctCountMax: 13,
    D1_lifeSatisfaction: '3',
    D2_politicalInterest: '3_4',
    D3_socialStatus: '2_3',
    D4_socialGathering: '3',
    D5_1_healthLiteracy: '2_3',
    D5_2_publicLiteracy: '2_3',
    D5_3_financialLiteracy: '2_3',
    D5_4_digitalAiLiteracy: '1_2',
    E1_educationNeed: '1',
    E1_1_participationIntent: '2',
    E1_2_barrierReason: '3',
    E2_programDesireMode: '2_3',
    E2_preferredPrograms: 'health_leisure',
    F01_1_educationLevel: '3',
    F01_2_graduationStatus: '5',
    F02_fatherEdu: '1',
    F02_motherEdu: '1',
    F03_economicActivity: '5',
    F04_occupation: '9',
    F04_1_employmentType: '1',
    F04_2_workStatus: '4',
    F05_1_personalIncome: '1',
    F05_2_householdIncome: '2'
  }
};

export function resolveGlobalriAgeGroupKey(item) {
  if (!item) return 'age50';
  const rawKey = String(item.ageGroupKey || item.ageGroup || '').trim();
  if (GLOBALRI_AGE_GROUP_METAS[rawKey]) return rawKey;
  const lbl = String(item.ageGroupLabel || rawKey).trim();
  if (lbl.includes('20') || lbl.includes('10')) return 'age20';
  if (lbl.includes('30')) return 'age30';
  if (lbl.includes('40')) return 'age40';
  if (lbl.includes('50')) return 'age50';
  if (lbl.includes('60')) return 'age60';
  if (lbl.includes('70') || lbl.includes('80') || lbl.includes('90')) return 'age70';
  const bYear = parseInt(item.birthYear, 10);
  const ageVal = (!isNaN(bYear) && bYear > 1900) ? (2026 - bYear) : parseInt(item.age || item.ceoAge, 10);
  if (!isNaN(ageVal)) {
    if (ageVal < 30) return 'age20';
    if (ageVal < 40) return 'age30';
    if (ageVal < 50) return 'age40';
    if (ageVal < 60) return 'age50';
    if (ageVal < 70) return 'age60';
    return 'age70';
  }
  return 'age50';
}

export function createGlobalriBlueprintController({
  campId,
  getCurrentCampaign,
  checkedGlobalriSeqs,
  renderQuotaTable,
  triggerBatchRun,
  badgeMasterStatus,
  btnSaveBaseline,
  blueprintStageGrid,
  markUnsaved,
  appendLog
}) {
  let globalriAgePolicies = JSON.parse(JSON.stringify(DEFAULT_GLOBALRI_AGE_POLICIES));
  let activeGlobalriAgeGroup = 'age20';
  let globalriAgeGroupStats = {};

  function applyGlobalriQuickCheck(mode, dbInput) {
    const currentCampaign = getCurrentCampaign();
    const db = dbInput || currentCampaign?.quotaDatabase || [];
    checkedGlobalriSeqs.clear();
    if (mode === 'uncompleted') {
      db.forEach((item, idx) => {
        if (item.quotaStatus !== 'completed' && item.status !== '완료') {
          checkedGlobalriSeqs.add(Number(item.index || item.seq || (idx + 1)));
        }
      });
    } else if (mode === 'guided') {
      db.forEach((item, idx) => {
        if (item.guideApplied && item.quotaStatus !== 'completed' && item.status !== '완료') {
          checkedGlobalriSeqs.add(Number(item.index || item.seq || (idx + 1)));
        }
      });
    } else if (GLOBALRI_AGE_GROUP_METAS[mode]) {
      db.forEach((item, idx) => {
        if (item.quotaStatus !== 'completed' && item.status !== '완료' && resolveGlobalriAgeGroupKey(item) === mode) {
          checkedGlobalriSeqs.add(Number(item.index || item.seq || (idx + 1)));
        }
      });
      syncGlobalriActiveCardToState();
      activeGlobalriAgeGroup = mode;
    }
    renderQuotaTable(db);
    renderGlobalriAgeGroupCards();
  }

  function rebuildGlobalriAgeGroupStats(qDb, fallbackStats = null) {
    const stats = {};
    Object.keys(GLOBALRI_AGE_GROUP_METAS).forEach(k => {
      stats[k] = { count: 0, members: [] };
    });
    if (Array.isArray(qDb) && qDb.length > 0) {
      qDb.forEach((item, idx) => {
        const k = resolveGlobalriAgeGroupKey(item);
        if (!stats[k]) stats[k] = { count: 0, members: [] };
        stats[k].count++;
        const seq = item.index || item.seq || (idx + 1);
        const mName = item.memberName || item.respondentName || item.ceoName || item.companyName || '-';
        const ageNum = item.age || item.ceoAge || (item.birthYear ? (2026 - Number(item.birthYear)) : '');
        stats[k].members.push(`#${seq} ${mName}(${item.birthYear ? item.birthYear + '년생' : ''}${ageNum ? '·만' + ageNum + '세' : ''}·LID ${item.lid || ''})`);
      });
    } else if (fallbackStats) {
      Object.keys(GLOBALRI_AGE_GROUP_METAS).forEach(k => {
        if (fallbackStats[k]) {
          stats[k] = {
            count: fallbackStats[k].count || 0,
            members: Array.isArray(fallbackStats[k].members) ? fallbackStats[k].members : []
          };
        }
      });
    }
    globalriAgeGroupStats = stats;
    return stats;
  }

  function syncGlobalriActiveCardToState() {
    const currentCampaign = getCurrentCampaign();
    const cur = globalriAgePolicies[activeGlobalriAgeGroup] || { ...DEFAULT_GLOBALRI_AGE_POLICIES[activeGlobalriAgeGroup] };
    const getVal = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };
    const getNum = (id, fallback) => {
      const el = document.getElementById(id);
      if (!el) return fallback;
      const n = parseInt(el.value, 10);
      return isNaN(n) ? fallback : n;
    };
    const cbPreserve = document.getElementById('cb-globalri-preserve');
    if (cbPreserve) cur.preserveExistingInputs = cbPreserve.checked;

    const stopModeEl = document.getElementById('sel-globalri-stop-mode');
    if (stopModeEl) {
      cur.stopAfterPartC = (stopModeEl.value !== 'full_f05_2');
    } else if (cur.stopAfterPartC === undefined) {
      cur.stopAfterPartC = (currentCampaign?.masterBaseline?.policy?.stopAfterPartC !== false);
    }

    cur.partA_targetScore = getNum('sel-globalri-partA-score', cur.partA_targetScore ?? 3);
    cur.partB1_targetScore = getNum('sel-globalri-partB1-score', cur.partB1_targetScore ?? 20);
    let cMin = Math.max(0, Math.min(20, getNum('num-globalri-partC-min', cur.partC_correctCountMin ?? 18)));
    let cMax = Math.max(0, Math.min(20, getNum('num-globalri-partC-max', cur.partC_correctCountMax ?? 20)));
    if (cMin > cMax) { const t = cMin; cMin = cMax; cMax = t; }
    cur.partC_correctCountMin = cMin;
    cur.partC_correctCountMax = cMax;

    cur.D1_lifeSatisfaction = getVal('sel-globalri-D1', cur.D1_lifeSatisfaction);
    cur.D2_politicalInterest = getVal('sel-globalri-D2', cur.D2_politicalInterest);
    cur.D3_socialStatus = getVal('sel-globalri-D3', cur.D3_socialStatus);
    cur.D4_socialGathering = getVal('sel-globalri-D4', cur.D4_socialGathering);

    cur.D5_1_healthLiteracy = getVal('sel-globalri-D5-1', cur.D5_1_healthLiteracy);
    cur.D5_2_publicLiteracy = getVal('sel-globalri-D5-2', cur.D5_2_publicLiteracy);
    cur.D5_3_financialLiteracy = getVal('sel-globalri-D5-3', cur.D5_3_financialLiteracy);
    cur.D5_4_digitalAiLiteracy = getVal('sel-globalri-D5-4', cur.D5_4_digitalAiLiteracy);

    cur.E1_educationNeed = getVal('sel-globalri-E1', cur.E1_educationNeed);
    cur.E1_1_participationIntent = getVal('sel-globalri-E1-1', cur.E1_1_participationIntent);
    cur.E1_2_barrierReason = getVal('sel-globalri-E1-2', cur.E1_2_barrierReason);
    cur.E2_programDesireMode = getVal('sel-globalri-E2-mode', cur.E2_programDesireMode);
    cur.E2_preferredPrograms = getVal('sel-globalri-E2-pref', cur.E2_preferredPrograms);

    cur.F01_1_educationLevel = getVal('sel-globalri-F01-1', cur.F01_1_educationLevel);
    cur.F01_2_graduationStatus = getVal('sel-globalri-F01-2', cur.F01_2_graduationStatus);
    cur.F02_fatherEdu = getVal('sel-globalri-F02-father', cur.F02_fatherEdu);
    cur.F02_motherEdu = getVal('sel-globalri-F02-mother', cur.F02_motherEdu);

    cur.F03_economicActivity = getVal('sel-globalri-F03', cur.F03_economicActivity);
    cur.F04_occupation = getVal('sel-globalri-F04', cur.F04_occupation);
    cur.F04_1_employmentType = getVal('sel-globalri-F04-1', cur.F04_1_employmentType);
    cur.F04_2_workStatus = getVal('sel-globalri-F04-2', cur.F04_2_workStatus);

    let pInc = getNum('sel-globalri-F05-1', parseInt(cur.F05_1_personalIncome || '3', 10));
    let hInc = getNum('sel-globalri-F05-2', parseInt(cur.F05_2_householdIncome || '5', 10));
    if (hInc < pInc) hInc = pInc;
    cur.F05_1_personalIncome = String(pInc);
    cur.F05_2_householdIncome = String(hInc);

    globalriAgePolicies[activeGlobalriAgeGroup] = cur;
    return cur;
  }

  async function applyGuideToCheckedGlobalriQuotas(showNotification = true) {
    const currentCampaign = getCurrentCampaign();
    const curGuide = syncGlobalriActiveCardToState();
    const checkedSeqs = Array.from(checkedGlobalriSeqs);
    if (checkedSeqs.length === 0) {
      if (showNotification) {
        alert('먼저 STEP 1 조사 쿼터 테이블(또는 상단 빠른 체크 버튼)에서 가이드를 부여할 대상자를 1명 이상 체크해 주세요.');
      }
      return false;
    }

    const meta = GLOBALRI_AGE_GROUP_METAS[activeGlobalriAgeGroup] || GLOBALRI_AGE_GROUP_METAS.age20;
    const presetLabel = `${meta.name} 기준 맞춤가이드`;

    try {
      const btnTop = document.getElementById('btn-globalri-apply-top');
      const btnBot = document.getElementById('btn-globalri-apply-selected-guide');
      if (btnTop) { btnTop.disabled = true; btnTop.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 적용 중...'; }
      if (btnBot) { btnBot.disabled = true; btnBot.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 체크 항목에 가이드 적용 중...'; }

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/apply-selected-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIndices: checkedSeqs,
          customGuide: {
            ...curGuide,
            stopAfterPartC: curGuide.stopAfterPartC !== false
          },
          presetLabel
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '선택 쿼터 가이드 적용 실패');

      if (currentCampaign && Array.isArray(data.quotaDatabase)) {
        currentCampaign.quotaDatabase = data.quotaDatabase;
      }

      await fetch(`/api/campaigns/${encodeURIComponent(campId)}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyType: 'globalri_literacy',
          ageGroups: globalriAgePolicies || {},
          policy: {
            preserveExistingInputs: curGuide.preserveExistingInputs !== false,
            stopAfterPartC: curGuide.stopAfterPartC !== false,
            safetyStopAtF05_2: true
          }
        })
      });

      renderQuotaTable(currentCampaign?.quotaDatabase || []);
      renderGlobalriAgeGroupCards();

      if (showNotification) {
        if (appendLog) appendLog('success', `✅ ${data.message}`);
        alert(`✅ 체크한 쿼터 ${data.appliedCount}명(${(data.appliedNames || []).join(', ')})에게 [${presetLabel}] 응답 가이드가 적용·저장되었습니다!\n\n이제 우측의 [🚀 선택/가이드 지정 쿼터 일괄 배치 실행] 버튼을 누르면 해당 항목들이 순차 자동 진행됩니다.`);
      }
      return true;
    } catch (err) {
      if (showNotification) alert('선택 쿼터 가이드 적용 실패: ' + err.message);
      if (appendLog) appendLog('error', `선택 쿼터 가이드 적용 실패: ${err.message}`);
      renderGlobalriAgeGroupCards();
      return false;
    }
  }

  function renderGlobalriAgeGroupCards() {
    if (!blueprintStageGrid) return;
    const currentCampaign = getCurrentCampaign();
    const qDb = currentCampaign?.quotaDatabase || [];
    const meta = GLOBALRI_AGE_GROUP_METAS[activeGlobalriAgeGroup] || GLOBALRI_AGE_GROUP_METAS.age20;
    const p = globalriAgePolicies[activeGlobalriAgeGroup] || DEFAULT_GLOBALRI_AGE_POLICIES[activeGlobalriAgeGroup];
    const stopAfterPartC = (p.stopAfterPartC !== undefined)
      ? (p.stopAfterPartC !== false)
      : (currentCampaign?.masterBaseline?.policy?.stopAfterPartC !== false);

    const checkedItems = qDb.filter((item, idx) => checkedGlobalriSeqs.has(Number(item.index || item.seq || (idx + 1))));
    const guidedUncompletedItems = qDb.filter(item => item.guideApplied && item.quotaStatus !== 'completed' && item.status !== '완료');
    const uncompletedItems = qDb.filter(item => item.quotaStatus !== 'completed' && item.status !== '완료');

    const countByAge = { age20: 0, age30: 0, age40: 0, age50: 0, age60: 0, age70: 0 };
    qDb.forEach(item => {
      if (item.quotaStatus !== 'completed' && item.status !== '완료') {
        const ak = resolveGlobalriAgeGroupKey(item);
        countByAge[ak] = (countByAge[ak] || 0) + 1;
      }
    });

    const selectedChipsHtml = checkedItems.length > 0
      ? checkedItems.map((item, idx) => {
          const seq = Number(item.index || item.seq || (idx + 1));
          const mName = item.memberName || item.respondentName || item.ceoName || '-';
          const ageLabel = item.ageGroupLabel || GLOBALRI_AGE_GROUP_METAS[resolveGlobalriAgeGroupKey(item)]?.name.replace(' 그룹', '') || '';
          const gBadge = item.guideApplied ? ' · 🎯가이드지정됨' : '';
          return `
            <span class="globalri-selected-member-chip">
              <span>#${seq} ${escapeHtml(mName)} (${escapeHtml(ageLabel)} · LID ${escapeHtml(item.lid || '')}${gBadge})</span>
              <button type="button" class="remove-chip-btn btn-uncheck-member-chip" data-seq="${seq}" title="체크 해제">&times;</button>
            </span>
          `;
        }).join('')
      : `<span style="font-size: 12.5px; color: #b45309; font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> 현재 체크된 쿼터가 없습니다. 상단 STEP 1 표에서 체크박스를 선택하거나 오른쪽 빠른 체크 버튼을 클릭해 주세요.</span>`;

    const presetButtonsHtml = Object.keys(GLOBALRI_AGE_GROUP_METAS).map(k => {
      const m = GLOBALRI_AGE_GROUP_METAS[k];
      const cnt = globalriAgeGroupStats[k]?.count || 0;
      const isAct = (k === activeGlobalriAgeGroup);
      return `
        <button type="button" class="globalri-preset-chip globalri-age-tab-btn ${isAct ? 'active' : ''}" data-age-group="${k}">
          <i class="fa-solid fa-sliders"></i> ${escapeHtml(m.name)} 추천 프리셋 (${cnt}명)
        </button>
      `;
    }).join('');

    const checkedUncompletedCount = checkedItems.filter(i => i.quotaStatus !== 'completed' && i.status !== '완료').length;
    const batchTargetCount = checkedUncompletedCount > 0
      ? checkedUncompletedCount
      : (guidedUncompletedItems.length > 0 ? guidedUncompletedItems.length : uncompletedItems.length);
    const batchTargetDesc = checkedUncompletedCount > 0
      ? `현재 체크된 미완료 ${checkedUncompletedCount}명`
      : (guidedUncompletedItems.length > 0 ? `가이드 지정된 미완료 ${guidedUncompletedItems.length}명` : `미완료 전체 ${uncompletedItems.length}명`);

    blueprintStageGrid.innerHTML = `
      <!-- 상단 전폭 배너: 체크한 쿼터 확인 + 나이대 프리셋 불러오기 + 원클릭 가이드 적용 -->
      <section id="globalri-step2-target-banner" class="blueprint-card full-width-card globalri-step2-target-banner">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <span class="blueprint-step-pill" style="background: #dbeafe; color: #1d4ed8; font-weight: 800;">
              <i class="fa-solid fa-list-check"></i> STEP 2 · 선택 쿼터 맞춤 응답 가이드 부여
            </span>
            <strong style="font-size: 16px; color: #0f172a; margin-left: 8px;">
              1) 쿼터 체크 ➔ 2) 아래 응답 가이드 설정 및 [체크한 쿼터에 가이드 적용] ➔ 3) 선택 항목 일괄 자동 배치
            </strong>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="btn-globalri-apply-top" class="btn-pill btn-pill-primary font-bold" style="padding: 9px 16px; font-size: 13px;">
              <i class="fa-solid fa-check-double"></i> ✅ 체크한 쿼터 (${checkedItems.length}명)에 현재 가이드 적용·저장
            </button>
            <button type="button" id="btn-globalri-batch-top" class="btn-pill btn-pill-success font-bold" style="padding: 9px 16px; font-size: 13px;">
              <i class="fa-solid fa-rocket"></i> 🚀 선택/가이드 쿼터 (${batchTargetCount}명) 일괄 배치 실행
            </button>
          </div>
        </div>

        <div class="globalri-selected-box">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
            <div style="font-size: 13px; font-weight: 800; color: #1e3a8a;">
              <i class="fa-solid fa-user-check text-primary-color"></i> 현재 체크된 가이드 적용 대상 쿼터: <span style="color: #2563eb;">${checkedItems.length}명</span>
              <span style="font-size: 12px; font-weight: 600; color: #64748b; margin-left: 8px;">(가이드 부여 완료: ${guidedUncompletedItems.length}명 / 미완료 전체: ${uncompletedItems.length}명)</span>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 12px; color: #475569; font-weight: 700; align-self: center;">빠른 체크 선택:</span>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="uncompleted">미완료 전체(${uncompletedItems.length}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="guided">🎯 가이드 지정됨(${guidedUncompletedItems.length}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="age20">20대(${countByAge.age20}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="age50">50대(${countByAge.age50}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="age60">60대(${countByAge.age60}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="age70">70대+(${countByAge.age70}명)</button>
              <button type="button" class="globalri-quick-check-btn step2-quick-check" data-quick-check="none" style="color: #64748b;">선택 해제</button>
            </div>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            ${selectedChipsHtml}
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div class="globalri-preset-bar">
            <span style="font-size: 12.5px; font-weight: 800; color: #334155; margin-right: 4px;">
              <i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 나이대별 추천 가이드 프리셋 불러오기:
            </span>
            ${presetButtonsHtml}
          </div>
          <label class="custom-cb-label" style="margin-bottom: 0; background: #f8fafc; padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1;">
            <input type="checkbox" id="cb-globalri-preserve" ${p.preserveExistingInputs !== false ? 'checked' : ''} />
            <span class="font-bold" style="color: #047857; font-size: 12.5px;"><i class="fa-solid fa-shield-halved"></i> CONSENT~GP1 및 기입력 문항 100% 보존</span>
          </label>
        </div>
      </section>

      <!-- 카드 1: Part A · B · C 문해력 평가 목표 점수 & 자동화 진행 범위 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">Part A · B · C (문해력 채점)</span>
            <h3 class="blueprint-stage-title">[${escapeHtml(meta.name)} 프리셋] 문해력 목표 점수 &amp; 진행 범위</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 목표 정답 수</span>
        </div>
        <div class="blueprint-stage-desc">
          체크한 쿼터 대상자가 Part A(선별 3문항) ➔ Part B-1(기초 5문항) ➔ Part C(심화 C1~C20, 총 20문항)에서 맞힐 목표 정답 수와 <strong>자동화 정지 지점(Part C 채점 저장 후 정지 vs Part F까지 진행)</strong>을 설정합니다.
        </div>
        <div class="p-14">
          <div class="grid-2col gap-10 mb-12">
            <div>
              <label class="figma-label font-bold">Part A 선별문항 (3문항)</label>
              <select id="sel-globalri-partA-score" class="figma-select w-full globalri-policy-input">
                <option value="3" ${Number(p.partA_targetScore ?? 3) === 3 ? 'selected' : ''}>3점 만점 (Part B-1 ➔ Part C · 권장)</option>
                <option value="2" ${Number(p.partA_targetScore) === 2 ? 'selected' : ''}>2점 (Part B-1 경유)</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">Part B-1 기초문해 (5문항)</label>
              <select id="sel-globalri-partB1-score" class="figma-select w-full globalri-policy-input">
                <option value="20" ${Number(p.partB1_targetScore ?? 20) === 20 ? 'selected' : ''}>5/5 만점 (B6~B20 스킵 ➔ Part C 진입 · 권장)</option>
                <option value="18" ${Number(p.partB1_targetScore) === 18 ? 'selected' : ''}>4/5 정답 (Part C 진입)</option>
              </select>
            </div>
          </div>
          <div class="mb-12">
            <label class="figma-label font-bold text-primary-color">Part C 심화문해 (C1~C20, 총 20문항) 목표 정답 개수 범위</label>
            <div class="grid-2col gap-10 mt-6">
              <div>
                <span class="font-caption text-dim">최소 정답 수 (0~20개)</span>
                <input type="number" id="num-globalri-partC-min" class="figma-input w-full globalri-policy-input" min="0" max="20" value="${p.partC_correctCountMin ?? 18}" />
              </div>
              <div>
                <span class="font-caption text-dim">최대 정답 수 (0~20개)</span>
                <input type="number" id="num-globalri-partC-max" class="figma-input w-full globalri-policy-input" min="0" max="20" value="${p.partC_correctCountMax ?? 20}" />
              </div>
            </div>
          </div>
          <div style="padding: 10px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
            <label class="figma-label font-bold" style="color: #0f172a; margin-bottom: 6px;">
              <i class="fa-solid fa-route text-primary-color"></i> 설문 자동화 진행 범위 (정지 지점 선택)
            </label>
            <select id="sel-globalri-stop-mode" class="figma-select w-full globalri-policy-input">
              <option value="part_c" ${stopAfterPartC ? 'selected' : ''}>1) Part C 채점 저장(END_C)까지만 자동 진행 후 정지 (Part D부터 수기 · 권장)</option>
              <option value="full_f05_2" ${!stopAfterPartC ? 'selected' : ''}>2) Part F(F05_2)까지 전체 자동 진행 후 제출 직전 대기 (Part D D5 교차체크)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 2: Part D (D5_1~D5_4) 4대 영역별 문해력 자가진단 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">Part D (D5_1~D5_4)</span>
            <h3 class="blueprint-stage-title">[${escapeHtml(meta.name)} 프리셋] 4대 영역 자가진단 (교차 체크 강제)</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-shuffle"></i> 한 번호 통일 금지</span>
        </div>
        <div class="blueprint-stage-desc">
          건강(D5_1) · 공공(D5_2) · 금융(D5_3) · 디지털/AI(D5_4) 각 5~6문항 입력 시 <strong>한 번호로 일자 통일하는 것을 원천 금지</strong>하고, 선택한 범위에서 <code>4-4-5-4-5</code> 또는 <code>5-4-5-4-5</code> 형태로 교차 체크합니다.
        </div>
        <div class="p-14 grid-2col gap-10">
          <div>
            <label class="figma-label font-bold">D5_1. 건강 문해력 (의약품·병원안내)</label>
            <select id="sel-globalri-D5-1" class="figma-select w-full globalri-policy-input">
              <option value="4_5" ${(p.D5_1_healthLiteracy === '4_5' || p.D5_1_healthLiteracy === '4' || p.D5_1_healthLiteracy === '5') ? 'selected' : ''}>🎲 4~5점 교차 체크 (4-4-5-4-5 / 5-4-5-4-5)</option>
              <option value="3_4" ${(p.D5_1_healthLiteracy === '3_4' || p.D5_1_healthLiteracy === '3') ? 'selected' : ''}>🎲 3~4점 교차 체크 (3-3-4-3-4 / 4-3-4-3-4)</option>
              <option value="2_3" ${(p.D5_1_healthLiteracy === '2_3' || p.D5_1_healthLiteracy === '2') ? 'selected' : ''}>🎲 2~3점 교차 체크 (2-2-3-2-3 / 3-2-3-2-3)</option>
              <option value="1_2" ${(p.D5_1_healthLiteracy === '1_2' || p.D5_1_healthLiteracy === '1') ? 'selected' : ''}>🎲 1~2점 교차 체크 (1-1-2-1-2 / 2-1-2-1-2)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">D5_2. 공공 문해력 (관공서·세금·법률)</label>
            <select id="sel-globalri-D5-2" class="figma-select w-full globalri-policy-input">
              <option value="4_5" ${(p.D5_2_publicLiteracy === '4_5' || p.D5_2_publicLiteracy === '4' || p.D5_2_publicLiteracy === '5') ? 'selected' : ''}>🎲 4~5점 교차 체크 (4-4-5-4-5 / 5-4-5-4-5)</option>
              <option value="3_4" ${(p.D5_2_publicLiteracy === '3_4' || p.D5_2_publicLiteracy === '3') ? 'selected' : ''}>🎲 3~4점 교차 체크 (3-3-4-3-4 / 4-3-4-3-4)</option>
              <option value="2_3" ${(p.D5_2_publicLiteracy === '2_3' || p.D5_2_publicLiteracy === '2') ? 'selected' : ''}>🎲 2~3점 교차 체크 (2-2-3-2-3 / 3-2-3-2-3)</option>
              <option value="1_2" ${(p.D5_2_publicLiteracy === '1_2' || p.D5_2_publicLiteracy === '1') ? 'selected' : ''}>🎲 1~2점 교차 체크 (1-1-2-1-2 / 2-1-2-1-2)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">D5_3. 금융 문해력 (예적금·보험·대출)</label>
            <select id="sel-globalri-D5-3" class="figma-select w-full globalri-policy-input">
              <option value="4_5" ${(p.D5_3_financialLiteracy === '4_5' || p.D5_3_financialLiteracy === '4' || p.D5_3_financialLiteracy === '5') ? 'selected' : ''}>🎲 4~5점 교차 체크 (4-4-5-4-5 / 5-4-5-4-5)</option>
              <option value="3_4" ${(p.D5_3_financialLiteracy === '3_4' || p.D5_3_financialLiteracy === '3') ? 'selected' : ''}>🎲 3~4점 교차 체크 (3-3-4-3-4 / 4-3-4-3-4)</option>
              <option value="2_3" ${(p.D5_3_financialLiteracy === '2_3' || p.D5_3_financialLiteracy === '2') ? 'selected' : ''}>🎲 2~3점 교차 체크 (2-2-3-2-3 / 3-2-3-2-3)</option>
              <option value="1_2" ${(p.D5_3_financialLiteracy === '1_2' || p.D5_3_financialLiteracy === '1') ? 'selected' : ''}>🎲 1~2점 교차 체크 (1-1-2-1-2 / 2-1-2-1-2)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">D5_4. 디지털·AI 문해력 (앱·키오스크·AI)</label>
            <select id="sel-globalri-D5-4" class="figma-select w-full globalri-policy-input">
              <option value="4_5" ${(p.D5_4_digitalAiLiteracy === '4_5' || p.D5_4_digitalAiLiteracy === '4' || p.D5_4_digitalAiLiteracy === '5') ? 'selected' : ''}>🎲 4~5점 교차 체크 (4-4-5-4-5 / 5-4-5-4-5)</option>
              <option value="3_4" ${(p.D5_4_digitalAiLiteracy === '3_4' || p.D5_4_digitalAiLiteracy === '3') ? 'selected' : ''}>🎲 3~4점 교차 체크 (3-3-4-3-4 / 4-3-4-3-4)</option>
              <option value="2_3" ${(p.D5_4_digitalAiLiteracy === '2_3' || p.D5_4_digitalAiLiteracy === '2') ? 'selected' : ''}>🎲 2~3점 교차 체크 (2-2-3-2-3 / 3-2-3-2-3)</option>
              <option value="1_2" ${(p.D5_4_digitalAiLiteracy === '1_2' || p.D5_4_digitalAiLiteracy === '1') ? 'selected' : ''}>🎲 1~2점 교차 체크 (1-1-2-1-2 / 2-1-2-1-2)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 카드 3: Part D (D1~D4) 생활만족도·사회인식 & Part E (E1~E2) 성인문해교육 수요 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">Part D (D1~D4) &amp; Part E</span>
            <h3 class="blueprint-stage-title">[${escapeHtml(meta.name)} 프리셋] 생활만족도 · 사회인식 · 문해교육 수요</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 생활·교육 인식</span>
        </div>
        <div class="blueprint-stage-desc">
          Part D(D1~D4 생활만족·정치관심·사회적지위·모임빈도) 및 Part E(E1 문해교육 필요성·E2 7대 프로그램 희망도) 응답 가이드를 설정합니다.
        </div>
        <div class="p-14">
          <div class="grid-2col gap-10 mb-12">
            <div>
              <label class="figma-label font-bold">D1. 전반적 생활 만족도</label>
              <select id="sel-globalri-D1" class="figma-select w-full globalri-policy-input">
                <option value="4" ${p.D1_lifeSatisfaction === '4' ? 'selected' : ''}>4. 대체로 만족하는 편</option>
                <option value="3_4" ${p.D1_lifeSatisfaction === '3_4' ? 'selected' : ''}>🎲 3~4점 (보통~만족 자연 분산)</option>
                <option value="4_5" ${p.D1_lifeSatisfaction === '4_5' ? 'selected' : ''}>🎲 4~5점 (만족~매우 만족)</option>
                <option value="3" ${p.D1_lifeSatisfaction === '3' ? 'selected' : ''}>3. 보통이다</option>
                <option value="2" ${p.D1_lifeSatisfaction === '2' ? 'selected' : ''}>2. 대체로 불만족하는 편</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">D2. 평소 정치적 관심도</label>
              <select id="sel-globalri-D2" class="figma-select w-full globalri-policy-input">
                <option value="3" ${p.D2_politicalInterest === '3' ? 'selected' : ''}>3. 보통이다</option>
                <option value="3_4" ${p.D2_politicalInterest === '3_4' ? 'selected' : ''}>🎲 3~4점 (보통~높은 편)</option>
                <option value="2_3" ${p.D2_politicalInterest === '2_3' ? 'selected' : ''}>🎲 2~3점 (낮은 편~보통)</option>
                <option value="4" ${p.D2_politicalInterest === '4' ? 'selected' : ''}>4. 대체로 높은 편</option>
                <option value="2" ${p.D2_politicalInterest === '2' ? 'selected' : ''}>2. 대체로 낮은 편</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">D3. 본인의 사회적 지위 인식</label>
              <select id="sel-globalri-D3" class="figma-select w-full globalri-policy-input">
                <option value="3" ${p.D3_socialStatus === '3' ? 'selected' : ''}>3. 중간이다 (표준)</option>
                <option value="3_4" ${p.D3_socialStatus === '3_4' ? 'selected' : ''}>🎲 3~4점 (중간~중상)</option>
                <option value="2_3" ${p.D3_socialStatus === '2_3' ? 'selected' : ''}>🎲 2~3점 (낮은 편~중간)</option>
                <option value="4" ${p.D3_socialStatus === '4' ? 'selected' : ''}>4. 대체로 높은 편</option>
                <option value="2" ${p.D3_socialStatus === '2' ? 'selected' : ''}>2. 대체로 낮은 편</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">D4. 친목 모임(동창·향우회) 빈도</label>
              <select id="sel-globalri-D4" class="figma-select w-full globalri-policy-input">
                <option value="2" ${p.D4_socialGathering === '2' ? 'selected' : ''}>2. 일주일에 2~3번</option>
                <option value="3" ${p.D4_socialGathering === '3' ? 'selected' : ''}>3. 한 달에 2~3번 (표준)</option>
                <option value="4" ${p.D4_socialGathering === '4' ? 'selected' : ''}>4. 한 달에 1번 이하</option>
                <option value="1" ${p.D4_socialGathering === '1' ? 'selected' : ''}>1. 거의 매일</option>
                <option value="5" ${p.D4_socialGathering === '5' ? 'selected' : ''}>5. 거의 만나지 않음</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">E1. 문해교육 필요 여부</label>
              <select id="sel-globalri-E1" class="figma-select w-full globalri-policy-input">
                <option value="2" ${p.E1_educationNeed === '2' ? 'selected' : ''}>2. 필요하지 않음 (➔ E2 직행)</option>
                <option value="1" ${p.E1_educationNeed === '1' ? 'selected' : ''}>1. 필요함 (➔ E1_1 진입)</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">E1_1 / E1_2. 참여 의향 &amp; 불참 이유</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <select id="sel-globalri-E1-1" class="figma-select w-full globalri-policy-input" title="E1=1 시 참여 의향">
                  <option value="1" ${p.E1_1_participationIntent === '1' ? 'selected' : ''}>E1_1: 참여함</option>
                  <option value="2" ${p.E1_1_participationIntent === '2' ? 'selected' : ''}>E1_1: 불참</option>
                </select>
                <select id="sel-globalri-E1-2" class="figma-select w-full globalri-policy-input" title="E1_1=2 시 불참 이유">
                  <option value="1" ${p.E1_2_barrierReason === '1' ? 'selected' : ''}>1. 시간부족</option>
                  <option value="3" ${p.E1_2_barrierReason === '3' ? 'selected' : ''}>3. 건강어려움</option>
                  <option value="5" ${p.E1_2_barrierReason === '5' ? 'selected' : ''}>5. 정보부족</option>
                </select>
              </div>
            </div>
            <div>
              <label class="figma-label font-bold">E2. 7대 교육프로그램 희망도</label>
              <select id="sel-globalri-E2-mode" class="figma-select w-full globalri-policy-input">
                <option value="3_4" ${p.E2_programDesireMode === '3_4' ? 'selected' : ''}>🎲 3~4점 교차 (보통~희망)</option>
                <option value="2_3" ${p.E2_programDesireMode === '2_3' ? 'selected' : ''}>🎲 2~3점 교차 (낮음~보통)</option>
                <option value="4_5" ${p.E2_programDesireMode === '4_5' ? 'selected' : ''}>🎲 4~5점 교차 (적극 희망)</option>
                <option value="1_2" ${p.E2_programDesireMode === '1_2' ? 'selected' : ''}>🎲 1~2점 교차 (의사 낮음)</option>
              </select>
            </div>
            <div>
              <label class="figma-label font-bold">E2. 중점 선호 프로그램</label>
              <select id="sel-globalri-E2-pref" class="figma-select w-full globalri-policy-input">
                <option value="digital_finance" ${p.E2_preferredPrograms === 'digital_finance' ? 'selected' : ''}>금융·경제(4번) &amp; 디지털·AI(5번) 우대</option>
                <option value="health_leisure" ${p.E2_preferredPrograms === 'health_leisure' ? 'selected' : ''}>건강·안전(3번) &amp; 문화·여가(6번) 우대</option>
                <option value="balanced" ${p.E2_preferredPrograms === 'balanced' ? 'selected' : ''}>1~7번 전 영역 균등 배분</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- 카드 4: Part F (F01~F05_2) 학력 · 경제활동 · 직업 · 월평균 소득 -->
      <section class="blueprint-card">
        <div class="blueprint-card-header">
          <div class="blueprint-card-title-group">
            <span class="blueprint-step-pill">Part F (F01~F05_2)</span>
            <h3 class="blueprint-stage-title">[${escapeHtml(meta.name)} 프리셋] 학력 · 경제활동 · 개인/가구 소득</h3>
          </div>
          <span class="badge-tag-tunable"><i class="fa-solid fa-coins"></i> 소득 정합성 보장</span>
        </div>
        <div class="blueprint-stage-desc">
          본인·부모 학력(F01~F02), 지난 4주간 경제활동·직업(F03~F04_2), 월평균 개인/가구소득(F05_2 &ge; F05_1 자동 보정)을 설정합니다.
        </div>
        <div class="p-14 grid-2col gap-10">
          <div>
            <label class="figma-label font-bold">F01_1. 본인 최종 학교급 (1~8)</label>
            <select id="sel-globalri-F01-1" class="figma-select w-full globalri-policy-input">
              <option value="6" ${p.F01_1_educationLevel === '6' ? 'selected' : ''}>6. 대학교 (4년제 이상)</option>
              <option value="5" ${p.F01_1_educationLevel === '5' ? 'selected' : ''}>5. 대학 (2·3년제 전문대)</option>
              <option value="4" ${p.F01_1_educationLevel === '4' ? 'selected' : ''}>4. 고등학교</option>
              <option value="3" ${p.F01_1_educationLevel === '3' ? 'selected' : ''}>3. 중학교</option>
              <option value="2" ${p.F01_1_educationLevel === '2' ? 'selected' : ''}>2. 초등학교</option>
              <option value="7" ${p.F01_1_educationLevel === '7' ? 'selected' : ''}>7. 대학원 (석사 과정)</option>
              <option value="1" ${p.F01_1_educationLevel === '1' ? 'selected' : ''}>1. 무학 (학교 다니지 않음)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">F01_2. 본인 졸업 여부 (1~5)</label>
            <select id="sel-globalri-F01-2" class="figma-select w-full globalri-policy-input">
              <option value="5" ${p.F01_2_graduationStatus === '5' ? 'selected' : ''}>5. 졸업 (표준 기본값)</option>
              <option value="1" ${p.F01_2_graduationStatus === '1' ? 'selected' : ''}>1. 재학 중 (대학생 등)</option>
              <option value="3" ${p.F01_2_graduationStatus === '3' ? 'selected' : ''}>3. 휴학 중</option>
              <option value="2" ${p.F01_2_graduationStatus === '2' ? 'selected' : ''}>2. 중퇴</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">F02. 부모님 학력 (부 / 모)</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              <select id="sel-globalri-F02-father" class="figma-select w-full globalri-policy-input" title="아버지 학력">
                <option value="6" ${p.F02_fatherEdu === '6' ? 'selected' : ''}>부: 대졸</option>
                <option value="4" ${p.F02_fatherEdu === '4' ? 'selected' : ''}>부: 고졸</option>
                <option value="3" ${p.F02_fatherEdu === '3' ? 'selected' : ''}>부: 중졸</option>
                <option value="2" ${p.F02_fatherEdu === '2' ? 'selected' : ''}>부: 초졸</option>
                <option value="1" ${p.F02_fatherEdu === '1' ? 'selected' : ''}>부: 무학</option>
                <option value="9" ${p.F02_fatherEdu === '9' ? 'selected' : ''}>부: 모름</option>
              </select>
              <select id="sel-globalri-F02-mother" class="figma-select w-full globalri-policy-input" title="어머니 학력">
                <option value="6" ${p.F02_motherEdu === '6' ? 'selected' : ''}>모: 대졸</option>
                <option value="4" ${p.F02_motherEdu === '4' ? 'selected' : ''}>모: 고졸</option>
                <option value="3" ${p.F02_motherEdu === '3' ? 'selected' : ''}>모: 중졸</option>
                <option value="2" ${p.F02_motherEdu === '2' ? 'selected' : ''}>모: 초졸</option>
                <option value="1" ${p.F02_motherEdu === '1' ? 'selected' : ''}>모: 무학</option>
                <option value="9" ${p.F02_motherEdu === '9' ? 'selected' : ''}>모: 모름</option>
              </select>
            </div>
          </div>
          <div>
            <label class="figma-label font-bold">F03. 지난 4주간 주된 활동</label>
            <select id="sel-globalri-F03" class="figma-select w-full globalri-policy-input">
              <option value="1" ${p.F03_economicActivity === '1' ? 'selected' : ''}>1. 일하였음 (➔ F04 진입)</option>
              <option value="2" ${p.F03_economicActivity === '2' ? 'selected' : ''}>2. 구직 활동 및 취업 준비</option>
              <option value="3" ${p.F03_economicActivity === '3' ? 'selected' : ''}>3. 학교 재학 및 진학 준비</option>
              <option value="4" ${p.F03_economicActivity === '4' ? 'selected' : ''}>4. 육아·가사 (전업주부 등)</option>
              <option value="5" ${p.F03_economicActivity === '5' ? 'selected' : ''}>5. 쉬었음 (은퇴·휴식 등)</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">F04. 직업 분류 (F03=1 시)</label>
            <select id="sel-globalri-F04" class="figma-select w-full globalri-policy-input">
              <option value="3" ${p.F04_occupation === '3' ? 'selected' : ''}>3. 사무 종사자</option>
              <option value="2" ${p.F04_occupation === '2' ? 'selected' : ''}>2. 전문가 및 관련 종사자</option>
              <option value="4" ${p.F04_occupation === '4' ? 'selected' : ''}>4. 서비스 종사자</option>
              <option value="5" ${p.F04_occupation === '5' ? 'selected' : ''}>5. 판매 종사자</option>
              <option value="1" ${p.F04_occupation === '1' ? 'selected' : ''}>1. 관리자</option>
              <option value="7" ${p.F04_occupation === '7' ? 'selected' : ''}>7. 기능원 및 관련 기능 종사자</option>
              <option value="8" ${p.F04_occupation === '8' ? 'selected' : ''}>8. 장치·기계 조작 및 조립</option>
              <option value="9" ${p.F04_occupation === '9' ? 'selected' : ''}>9. 단순노무 종사자</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">F04_1 / F04_2. 고용형태 &amp; 지위</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              <select id="sel-globalri-F04-1" class="figma-select w-full globalri-policy-input">
                <option value="1" ${p.F04_1_employmentType === '1' ? 'selected' : ''}>1. 임금근로자</option>
                <option value="2" ${p.F04_1_employmentType === '2' ? 'selected' : ''}>2. 자영업/비임금</option>
              </select>
              <select id="sel-globalri-F04-2" class="figma-select w-full globalri-policy-input">
                <option value="1" ${p.F04_2_workStatus === '1' ? 'selected' : ''}>1. 전일제 상근</option>
                <option value="2" ${p.F04_2_workStatus === '2' ? 'selected' : ''}>2. 시간제 상근</option>
                <option value="3" ${p.F04_2_workStatus === '3' ? 'selected' : ''}>3. 전일제 임시</option>
                <option value="4" ${p.F04_2_workStatus === '4' ? 'selected' : ''}>4. 시간제 임시</option>
              </select>
            </div>
          </div>
          <div>
            <label class="figma-label font-bold">F05_1. 월평균 개인소득 (1~8)</label>
            <select id="sel-globalri-F05-1" class="figma-select w-full globalri-policy-input">
              <option value="1" ${p.F05_1_personalIncome === '1' ? 'selected' : ''}>1. 100만원 미만</option>
              <option value="2" ${p.F05_1_personalIncome === '2' ? 'selected' : ''}>2. 100만원 ~ 200만원 미만</option>
              <option value="3" ${p.F05_1_personalIncome === '3' ? 'selected' : ''}>3. 200만원 ~ 300만원 미만</option>
              <option value="4" ${p.F05_1_personalIncome === '4' ? 'selected' : ''}>4. 300만원 ~ 400만원 미만</option>
              <option value="5" ${p.F05_1_personalIncome === '5' ? 'selected' : ''}>5. 400만원 ~ 500만원 미만</option>
              <option value="6" ${p.F05_1_personalIncome === '6' ? 'selected' : ''}>6. 500만원 ~ 600만원 미만</option>
              <option value="7" ${p.F05_1_personalIncome === '7' ? 'selected' : ''}>7. 600만원 ~ 700만원 미만</option>
              <option value="8" ${p.F05_1_personalIncome === '8' ? 'selected' : ''}>8. 700만원 이상</option>
            </select>
          </div>
          <div>
            <label class="figma-label font-bold">F05_2. 월평균 가구소득 (개인소득 이상)</label>
            <select id="sel-globalri-F05-2" class="figma-select w-full globalri-policy-input">
              <option value="1" ${p.F05_2_householdIncome === '1' ? 'selected' : ''}>1. 100만원 미만</option>
              <option value="2" ${p.F05_2_householdIncome === '2' ? 'selected' : ''}>2. 100만원 ~ 200만원 미만</option>
              <option value="3" ${p.F05_2_householdIncome === '3' ? 'selected' : ''}>3. 200만원 ~ 300만원 미만</option>
              <option value="4" ${p.F05_2_householdIncome === '4' ? 'selected' : ''}>4. 300만원 ~ 400만원 미만</option>
              <option value="5" ${p.F05_2_householdIncome === '5' ? 'selected' : ''}>5. 400만원 ~ 500만원 미만</option>
              <option value="6" ${p.F05_2_householdIncome === '6' ? 'selected' : ''}>6. 500만원 ~ 600만원 미만</option>
              <option value="7" ${p.F05_2_householdIncome === '7' ? 'selected' : ''}>7. 600만원 ~ 700만원 미만</option>
              <option value="8" ${p.F05_2_householdIncome === '8' ? 'selected' : ''}>8. 700만원 이상</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 하단 전폭 액션 바 & 쿼터별 적용 가이드 요약 -->
      <section class="blueprint-card full-width-card globalri-action-footer-card">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a;">
              <i class="fa-solid fa-clipboard-check text-primary-color"></i> 선택 쿼터 가이드 적용 현황 및 일괄 배치 실행
            </h4>
            <div style="font-size: 12.5px; color: #475569; margin-top: 4px;">
              체크한 쿼터에 가이드를 적용한 뒤, <strong>[선택/가이드 지정된 쿼터 일괄 자동 배치 시작]</strong>을 누르면 선택된 대상자들만 순차 실행됩니다.
            </div>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button type="button" id="btn-globalri-apply-selected-guide" class="btn-pill btn-pill-primary font-bold" style="padding: 10px 18px; font-size: 13.5px;">
              <i class="fa-solid fa-check-double"></i> ✅ 1단계: 체크한 쿼터 (${checkedItems.length}명)에 위 가이드 적용·저장
            </button>
            <button type="button" id="btn-globalri-run-selected-batch" class="btn-pill btn-pill-success font-bold" style="padding: 10px 20px; font-size: 13.5px;">
              <i class="fa-solid fa-rocket"></i> 🚀 2단계: ${escapeHtml(batchTargetDesc)} 일괄 자동 배치 시작
            </button>
            <a href="https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?usp=sharing" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary font-bold" style="padding: 10px 16px; font-size: 13px; text-decoration: none;">
              <i class="fa-solid fa-table text-success"></i> 제출 문항·답변 구글 스프레드시트 열기
            </a>
          </div>
        </div>
      </section>
    `;

    blueprintStageGrid.querySelectorAll('.btn-uncheck-member-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const seq = Number(btn.getAttribute('data-seq'));
        checkedGlobalriSeqs.delete(seq);
        renderQuotaTable(qDb);
        renderGlobalriAgeGroupCards();
      });
    });

    blueprintStageGrid.querySelectorAll('.step2-quick-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        applyGlobalriQuickCheck(mode, qDb);
      });
    });

    blueprintStageGrid.querySelectorAll('.globalri-age-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetGroup = btn.getAttribute('data-age-group');
        if (!targetGroup) return;
        syncGlobalriActiveCardToState();
        activeGlobalriAgeGroup = targetGroup;
        renderGlobalriAgeGroupCards();
      });
    });

    blueprintStageGrid.querySelectorAll('.globalri-policy-input').forEach(el => {
      el.addEventListener('change', () => {
        if (el.id === 'sel-globalri-F05-1' || el.id === 'sel-globalri-F05-2') {
          const selP = document.getElementById('sel-globalri-F05-1');
          const selH = document.getElementById('sel-globalri-F05-2');
          if (selP && selH && parseInt(selH.value, 10) < parseInt(selP.value, 10)) {
            selH.value = selP.value;
          }
        }
        syncGlobalriActiveCardToState();
        if (markUnsaved) markUnsaved();
      });
      el.addEventListener('input', () => {
        syncGlobalriActiveCardToState();
        if (markUnsaved) markUnsaved();
      });
    });

    const cbPreserve = document.getElementById('cb-globalri-preserve');
    if (cbPreserve) {
      cbPreserve.addEventListener('change', () => {
        syncGlobalriActiveCardToState();
        if (markUnsaved) markUnsaved();
      });
    }

    const btnApplyTop = document.getElementById('btn-globalri-apply-top');
    if (btnApplyTop) {
      btnApplyTop.addEventListener('click', () => applyGuideToCheckedGlobalriQuotas(true));
    }
    const btnApplyBottom = document.getElementById('btn-globalri-apply-selected-guide');
    if (btnApplyBottom) {
      btnApplyBottom.addEventListener('click', () => applyGuideToCheckedGlobalriQuotas(true));
    }

    const btnBatchTop = document.getElementById('btn-globalri-batch-top');
    if (btnBatchTop) {
      btnBatchTop.addEventListener('click', () => triggerBatchRun());
    }
    const btnBatchBottom = document.getElementById('btn-globalri-run-selected-batch');
    if (btnBatchBottom) {
      btnBatchBottom.addEventListener('click', () => triggerBatchRun());
    }
  }

  function renderGlobalriLiteracyBlueprint(data) {
    const bpSection = document.getElementById('section-master-blueprint');
    if (bpSection) {
      bpSection.classList.remove('hidden');
      bpSection.style.display = 'block';
    }

    const groupNav = document.querySelector('.blueprint-group-nav-container');
    if (groupNav) groupNav.style.display = 'none';

    const presetGroup = document.querySelector('.blueprint-preset-group');
    if (presetGroup) presetGroup.style.display = 'none';

    const tplPicker = document.querySelector('.blueprint-template-picker');
    if (tplPicker) tplPicker.style.display = 'none';

    const legendWrap = document.querySelector('.blueprint-legend-inline');
    if (legendWrap) legendWrap.style.display = 'none';

    const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
    if (titleEl) titleEl.textContent = '제5차 성인문해능력조사 · 체크한 쿼터 항목별 맞춤 응답 가이드 설정';

    const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'STEP 1 조사 쿼터에서 원하는 대상자들을 체크한 뒤, 나이대 추천 프리셋(20대~70대+) 또는 상세 문항 가이드를 적용하고 선택 항목만 일괄 배치 자동화로 실행합니다.';

    if (badgeMasterStatus) {
      badgeMasterStatus.innerHTML = '<i class="fa-solid fa-square-check"></i> 선택 쿼터 맞춤 가이드 &amp; 일괄 배치 활성';
      badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    }

    if (btnSaveBaseline) {
      btnSaveBaseline.innerHTML = '<i class="fa-solid fa-check-double"></i> 체크한 쿼터에 가이드 적용·저장';
    }

    const incomingGroups = data.ageGroups || data.policy?.ageGroups || data.ageGroupPolicies || data.baseline?.ageGroups || data.blueprint?.defaultPolicy?.ageGroups || {};
    globalriAgePolicies = {};
    Object.keys(DEFAULT_GLOBALRI_AGE_POLICIES).forEach(k => {
      globalriAgePolicies[k] = {
        ...DEFAULT_GLOBALRI_AGE_POLICIES[k],
        ...(incomingGroups[k] || {})
      };
    });

    const currentCampaign = getCurrentCampaign();
    const qDb = currentCampaign?.quotaDatabase || [];
    rebuildGlobalriAgeGroupStats(qDb, data.ageGroupStats || null);

    renderGlobalriAgeGroupCards();
  }

  return {
    applyGlobalriQuickCheck,
    rebuildGlobalriAgeGroupStats,
    syncGlobalriActiveCardToState,
    applyGuideToCheckedGlobalriQuotas,
    renderGlobalriAgeGroupCards,
    renderGlobalriLiteracyBlueprint,
    getAgePolicies: () => globalriAgePolicies
  };
}
