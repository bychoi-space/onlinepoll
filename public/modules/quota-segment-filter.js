/**
 * [공통 쿼터 구분자(Segment) 자동 도출 및 구분자별 분할 배치 모듈]
 * - 모든 설문조사(신규 K-BPI 포함)의 쿼터 구조를 분석해 최적 구분자 축을 자동 선택하고,
 *   대량 일괄 실행 대신 구분자 단위로 나누어 안전하게 선택·배치 실행할 수 있는 UI/상태를 제공합니다.
 */
import { escapeHtml } from './blueprint-utils.js';

export function isQuotaItemExcluded(item = {}) {
  return Boolean(
    item.isClosedBiz ||
    String(item.bizStatus || '').includes('폐업') ||
    item.quotaStatus === 'excluded' ||
    String(item.status || '').includes('인원초과') ||
    String(item.quotaStatus || '').includes('인원초과') ||
    item.substitutedByUid
  );
}

export function isQuotaItemDone(item = {}, surveyType = '') {
  if (isQuotaItemExcluded(item)) return true;
  const qs = String(item.quotaStatus || '');
  const st = String(item.status || '');
  if (qs === 'completed' || st === '완료' || st === '조사완료' || st.includes('완료(100%)')) {
    return true;
  }
  if (surveyType === 'metrix_seoul_panel' || surveyType === 'gallup_return_farm') {
    if (qs === 'pilot_done' || st.includes('99%') || st.includes('완료직전')) return true;
  }
  if (surveyType === 'metrix_panel') {
    if (/98%|99%/.test(qs) || /98%|99%/.test(st)) return true;
  }
  return false;
}

const AGE_SORT_ORDER = ['10대', '20대', '30대', '40대', '50대', '60대', '70대', '70대+'];
const GENDER_SORT_ORDER = ['남', '남성', '여', '여성'];

function compareSegmentKeys(a, b) {
  const strA = String(a || '');
  const strB = String(b || '');
  const ageIdxA = AGE_SORT_ORDER.findIndex(ag => strA.includes(ag));
  const ageIdxB = AGE_SORT_ORDER.findIndex(ag => strB.includes(ag));
  if (ageIdxA !== -1 && ageIdxB !== -1 && ageIdxA !== ageIdxB) {
    return ageIdxA - ageIdxB;
  }
  const genIdxA = GENDER_SORT_ORDER.findIndex(g => strA.startsWith(g));
  const genIdxB = GENDER_SORT_ORDER.findIndex(g => strB.startsWith(g));
  if (genIdxA !== -1 && genIdxB !== -1 && genIdxA !== genIdxB) {
    return genIdxA - genIdxB;
  }
  return strA.localeCompare(strB, 'ko');
}

/**
 * 설문 유형 및 실제 쿼터 데이터를 기반으로 사용 가능한 구분자 축(Axis) 목록을 반환 (첫 번째가 기본 추천 축)
 */
export function resolveSurveySegmentAxes(surveyType = '', db = []) {
  if (!Array.isArray(db) || db.length === 0) return [];

  if (surveyType === 'kmac_kbpi') {
    return [
      {
        id: 'gender_age',
        label: '성별 · 연령대별 (권장 · 출제품목 동일군)',
        shortLabel: '성별·연령대',
        extractor: (it) => `${it.gender || it.ceoGender || '미상'} · ${it.ageGroup || '연령미상'}`
      },
      {
        id: 'region_age',
        label: '지역 · 연령대별 (서울/인천 × 연령대)',
        shortLabel: '지역·연령대',
        extractor: (it) => `${it.region || '지역'} · ${it.ageGroup || '연령미상'}`
      },
      {
        id: 'age_only',
        label: '연령대별 (10대 ~ 50대)',
        shortLabel: '연령대',
        extractor: (it) => String(it.ageGroup || '기타연령').trim()
      },
      {
        id: 'region_only',
        label: '지역별 (서울 노원구청 / 인천시청)',
        shortLabel: '지역',
        extractor: (it) => String(it.region || '기타지역').trim()
      }
    ];
  }

  if (surveyType === 'gallup_agriwork') {
    return [
      {
        id: 'surveyor_subtype_worker',
        label: '조사원 · 설문구분 · 근로자유형별 (권장)',
        shortLabel: '조사원·구분·고용',
        extractor: (it) => {
          const sv = it.surveyorId === '47837' ? '김미경(동두천)' : '안재은(양주)';
          const sub = it.surveySubType === 'worker' ? '내국인근로자' : '경영체';
          const wt = it.workerTypeLabel || it.employedLabel || '고용없음';
          return `${sv} · ${sub} · ${wt}`;
        }
      },
      {
        id: 'subtype_surveyor',
        label: '설문구분 · 담당 조사원별 (경영체 / 내국인근로자)',
        shortLabel: '설문구분·조사원',
        extractor: (it) => {
          const sv = it.surveyorId === '47837' ? '김미경(동두천)' : '안재은(양주)';
          const sub = it.surveySubType === 'worker' ? '내국인 근로자 설문' : '경영체 설문';
          return `${sub} - ${sv}`;
        }
      },
      {
        id: 'strata_group',
        label: '층화(재배품목군 · 축산)별',
        shortLabel: '층화·품목군',
        extractor: (it) => String(it.strata || '기타품목').trim()
      },
      {
        id: 'sigungu_eup',
        label: '시군구 · 읍면동별',
        shortLabel: '지역(읍면동)',
        extractor: (it) => `${it.sigungu || '양주시'} · ${it.eupMyeon || '기타'}`
      }
    ];
  }

  if (surveyType === 'gallup_return_farm') {
    return [
      {
        id: 'eup_myeon',
        label: '읍·면별 (홍천군 10개 읍·면)',
        shortLabel: '읍·면',
        extractor: (it) => String(it.eupMyeon || '홍천읍').trim()
      },
      {
        id: 'move_year',
        label: '귀농 이주년도별',
        shortLabel: '이주년도',
        extractor: (it) => `${it.moveYear || it.openDate || '기타'}년`
      }
    ];
  }

  if (surveyType === 'globalri_literacy') {
    return [
      {
        id: 'age_group',
        label: '나이대 그룹별 (20대 ~ 70대+)',
        shortLabel: '나이대 그룹',
        extractor: (it) => String(it.ageGroupLabel || it.ageGroup || '기타 연령').trim()
      }
    ];
  }

  if (surveyType === 'metrix_seoul_panel') {
    return [
      {
        id: 'account_key',
        label: '조사원 계정별 (2010 송준희 / 2016 정소영)',
        shortLabel: '조사원 계정',
        extractor: (it) => {
          const ak = String(it.accountKey || it.akey || '2010').trim();
          return ak === '2016' ? '2016 (정소영)' : `2010 (송준희)`;
        }
      },
      {
        id: 'seoul_ind',
        label: '사업체 업종별',
        shortLabel: '업종',
        extractor: (it) => String(it.industry || it.industryDetail || '기타업종').trim().slice(0, 18)
      }
    ];
  }

  if (surveyType === 'metrix_panel') {
    return [
      {
        id: 'surveyor_acc',
        label: '담당 조사원 계정별 (5계정 분할)',
        shortLabel: '조사원 계정',
        extractor: (it) => String(it.surveyorId || it.loginId || '기본계정').trim()
      },
      {
        id: 'metrix_ind',
        label: '표준 업종 분류별',
        shortLabel: '업종 분류',
        extractor: (it) => String(it.industry || '기타업종').trim()
      }
    ];
  }

  if (surveyType === 'kstat_assoc') {
    return [
      {
        id: 'assoc_type',
        label: '상점가·시장 유형별',
        shortLabel: '시장유형',
        extractor: (it) => String(it.marketType || it.sido || '전통시장·상점가').trim()
      }
    ];
  }

  if (surveyType === 'kona_youth') {
    return [
      {
        id: 'kona_chunk',
        label: '20명 단위 안전 분할 구간별',
        shortLabel: '20명 구간',
        extractor: (it, idx) => {
          const n = Number(it.index || it.seq || idx + 1);
          const start = Math.floor((n - 1) / 20) * 20 + 1;
          return `${start}~${start + 19}번 구간`;
        }
      }
    ];
  }

  // 범용 / 전통시장 점포조사(kstat_store) 및 향후 신규 설문 자동 분석
  const candidates = [
    {
      id: 'auto_segment',
      label: '지정 구분자별',
      shortLabel: '구분',
      extractor: (it) => String(it.segment || it.groupName || '').trim()
    },
    {
      id: 'auto_industry',
      label: '표준 업종별 분할',
      shortLabel: '업종',
      extractor: (it) => String(it.handledItems || it.industry || it.mainUse || '').trim()
    },
    {
      id: 'auto_region_age',
      label: '지역 · 연령대별 분할',
      shortLabel: '지역·연령대',
      extractor: (it) => (it.region && it.ageGroup) ? `${it.region} · ${it.ageGroup}` : ''
    },
    {
      id: 'auto_region',
      label: '지역(시군구)별 분할',
      shortLabel: '지역',
      extractor: (it) => String(it.sigungu || it.eupMyeon || it.region || it.sido || '').trim()
    },
    {
      id: 'auto_age_gender',
      label: '성별 · 연령대별 분할',
      shortLabel: '성별·연령대',
      extractor: (it) => {
        const g = it.gender || it.ceoGender || '';
        const a = it.ageGroup || (it.ceoAge ? `${Math.floor(Number(it.ceoAge) / 10) * 10}대` : '');
        return (g && a) ? `${g} · ${a}` : '';
      }
    }
  ];

  const validAxes = [];
  for (const cand of candidates) {
    const vals = db.map((it, idx) => cand.extractor(it, idx)).filter(Boolean);
    if (vals.length >= Math.ceil(db.length * 0.6)) {
      const uniq = new Set(vals).size;
      if (uniq >= 2 && uniq <= 18) {
        validAxes.push({
          ...cand,
          extractor: (it, idx) => cand.extractor(it, idx) || '기타'
        });
      }
    }
  }

  // 항상 15건 단위 안전 분할 축을 보조 옵션(또는 유일 폴백)으로 제공
  validAxes.push({
    id: 'chunk_15',
    label: '15건 단위 순차 구간 분할',
    shortLabel: '15건 구간',
    extractor: (it, idx) => {
      const n = Number(it.index || it.seq || idx + 1);
      const start = Math.floor((n - 1) / 15) * 15 + 1;
      return `${start}~${Math.min(db.length, start + 14)}번 구간`;
    }
  });

  return validAxes;
}

export function computeSegmentStats({ db = [], surveyType = '', axis }) {
  if (!axis || !Array.isArray(db) || db.length === 0) return [];
  const map = new Map();

  db.forEach((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const segName = String(axis.extractor(item, idx) || '기타').trim() || '기타';
    if (!map.has(segName)) {
      map.set(segName, {
        segName,
        total: 0,
        done: 0,
        excluded: 0,
        pending: 0,
        pendingSeqs: [],
        allSeqs: []
      });
    }
    const st = map.get(segName);
    st.total++;
    st.allSeqs.push(seq);
    if (isQuotaItemExcluded(item)) {
      st.excluded++;
    } else if (isQuotaItemDone(item, surveyType)) {
      st.done++;
    } else {
      st.pending++;
      st.pendingSeqs.push(seq);
    }
  });

  const list = Array.from(map.values());
  if (axis.id && axis.id.startsWith('chunk_')) {
    return list;
  }
  return list.sort((a, b) => compareSegmentKeys(a.segName, b.segName));
}

/**
 * STEP 3 [구분자별 분할 선택 및 원클릭 배치 실행] 공통 패널 렌더링
 */
export function renderUniversalStep3SegmentPanel({
  panelEl = null,
  db = [],
  surveyType = '',
  activeAxisId = '',
  selectedSegments = new Set(),
  checkedSeqs = new Set(),
  isRunning = false,
  onAxisChange = null,
  onSegmentsChange = null,
  onDirectRunSegment = null
}) {
  if (!panelEl) return;
  if (!Array.isArray(db) || db.length === 0 || surveyType === 'hrc_energy') {
    panelEl.classList.add('d-none');
    panelEl.innerHTML = '';
    return;
  }

  const axes = resolveSurveySegmentAxes(surveyType, db);
  if (axes.length === 0) {
    panelEl.classList.add('d-none');
    panelEl.innerHTML = '';
    return;
  }

  const currentAxis = axes.find(a => a.id === activeAxisId) || axes[0];
  const stats = computeSegmentStats({ db, surveyType, axis: currentAxis });
  const validNames = new Set(stats.map(s => s.segName));
  Array.from(selectedSegments).forEach(s => {
    if (!validNames.has(s)) selectedSegments.delete(s);
  });

  const actionableCheckedCount = db.filter((it, idx) => {
    const seq = Number(it.index || it.seq || (idx + 1));
    return !isQuotaItemDone(it, surveyType) && checkedSeqs.has(seq);
  }).length;

  panelEl.classList.remove('d-none');
  panelEl.innerHTML = `
    <div class="hrc-step3-use-panel seg-partition-panel">
      <div class="hrc-step3-use-header">
        <div>
          <div class="hrc-step3-use-title">
            <i class="fa-solid fa-layer-group text-primary-color"></i>
            <span>쿼터 구분자별 분할 선택 &amp; 원클릭 안전 배치</span>
            <span class="seg-axis-badge">${escapeHtml(currentAxis.shortLabel)} 기준 (${stats.length}개 그룹)</span>
          </div>
          <div class="hrc-step3-use-sub">
            전체를 한 번에 대량 구동하지 않고 <strong>[${escapeHtml(currentAxis.shortLabel)}]</strong> 구분 단위로 나누어 안전하게 진행합니다. 카드의 <strong>[이 구분만 바로 배치]</strong>를 누르면 해당 그룹 미완료 건만 즉시 실행됩니다.
          </div>
        </div>
        <div class="seg-header-controls">
          ${axes.length > 1 ? `
            <select id="sel-universal-seg-axis" class="figma-select seg-axis-select" ${isRunning ? 'disabled' : ''}>
              ${axes.map(ax => `<option value="${escapeHtml(ax.id)}" ${ax.id === currentAxis.id ? 'selected' : ''}>구분 기준: ${escapeHtml(ax.label)}</option>`).join('')}
            </select>
          ` : ''}
          <button type="button" class="globalri-quick-check-btn" id="btn-seg-select-all-pending" ${isRunning ? 'disabled' : ''}>
            전체 미완료 선택
          </button>
          <button type="button" class="globalri-quick-check-btn" id="btn-seg-clear-all" ${isRunning ? 'disabled' : ''}>
            선택 초기화
          </button>
          <span class="badge-status ready font-bold seg-target-count-pill">
            선택된 실행 대상: <strong>${actionableCheckedCount}건</strong>
          </span>
        </div>
      </div>

      <div class="hrc-step3-use-grid">
        ${stats.map(st => {
          const isSelected = selectedSegments.has(st.segName);
          const isDoneAll = (st.total > 0 && st.pending === 0);
          return `
            <div class="hrc-step3-use-card ${isSelected ? 'is-selected' : ''} ${isDoneAll ? 'is-done' : ''}" data-seg-card="${escapeHtml(st.segName)}">
              <div class="hrc-step3-use-card-top">
                <span class="hrc-step3-use-name">
                  <input
                    type="checkbox"
                    class="cb-universal-seg-card seg-card-checkbox"
                    data-seg-name="${escapeHtml(st.segName)}"
                    ${isSelected ? 'checked' : ''}
                    ${isRunning ? 'disabled' : ''}
                  />
                  <span>${escapeHtml(st.segName)}</span>
                </span>
                <span class="badge-status ${isDoneAll ? 'completed' : 'ready'}">
                  ${isDoneAll ? '완료' : `미완료 ${st.pending}건`}
                </span>
              </div>
              <div class="hrc-step3-use-meta">
                <span>진행 <strong>${st.done}</strong> / 전체 ${st.total}건</span>
                <span>대기 <strong>${st.pending}건</strong></span>
              </div>
              <button
                type="button"
                class="btn-hrc-card-run btn-universal-seg-run"
                data-seg-run="${escapeHtml(st.segName)}"
                data-has-targets="${st.pending > 0 ? '1' : '0'}"
                ${(st.pending === 0 || isRunning) ? 'disabled' : ''}
              >
                <i class="fa-solid ${isDoneAll ? 'fa-check' : 'fa-play'}"></i>
                <span>${isDoneAll ? '이 구분 완료됨' : `이 구분만 바로 배치 (${st.pending}건)`}</span>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const applySelectionToCheckedSeqs = () => {
    checkedSeqs.clear();
    for (const st of stats) {
      if (selectedSegments.has(st.segName)) {
        st.pendingSeqs.forEach(s => checkedSeqs.add(s));
      }
    }
  };

  const axisSel = panelEl.querySelector('#sel-universal-seg-axis');
  if (axisSel) {
    axisSel.addEventListener('change', () => {
      selectedSegments.clear();
      if (typeof onAxisChange === 'function') onAxisChange(axisSel.value);
    });
  }

  const btnAll = panelEl.querySelector('#btn-seg-select-all-pending');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      selectedSegments.clear();
      stats.forEach(st => {
        if (st.pending > 0) selectedSegments.add(st.segName);
      });
      applySelectionToCheckedSeqs();
      if (typeof onSegmentsChange === 'function') onSegmentsChange();
    });
  }

  const btnClear = panelEl.querySelector('#btn-seg-clear-all');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      selectedSegments.clear();
      checkedSeqs.clear();
      if (typeof onSegmentsChange === 'function') onSegmentsChange();
    });
  }

  panelEl.querySelectorAll('.hrc-step3-use-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (isRunning) return;
      if (e.target.closest('.btn-universal-seg-run') || e.target.closest('.cb-universal-seg-card')) return;
      const segName = card.getAttribute('data-seg-card');
      if (!segName) return;
      if (selectedSegments.has(segName)) selectedSegments.delete(segName);
      else selectedSegments.add(segName);
      applySelectionToCheckedSeqs();
      if (typeof onSegmentsChange === 'function') onSegmentsChange();
    });
  });

  panelEl.querySelectorAll('.cb-universal-seg-card').forEach(cb => {
    cb.addEventListener('change', () => {
      const segName = cb.getAttribute('data-seg-name');
      if (!segName) return;
      if (cb.checked) selectedSegments.add(segName);
      else selectedSegments.delete(segName);
      applySelectionToCheckedSeqs();
      if (typeof onSegmentsChange === 'function') onSegmentsChange();
    });
  });

  panelEl.querySelectorAll('.btn-universal-seg-run').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const segName = btn.getAttribute('data-seg-run');
      const targetStat = stats.find(s => s.segName === segName);
      if (!targetStat || targetStat.pendingSeqs.length === 0) return;
      selectedSegments.clear();
      selectedSegments.add(segName);
      checkedSeqs.clear();
      targetStat.pendingSeqs.forEach(s => checkedSeqs.add(s));
      if (typeof onSegmentsChange === 'function') onSegmentsChange();
      if (typeof onDirectRunSegment === 'function') {
        onDirectRunSegment(segName, targetStat.pendingSeqs);
      }
    });
  });
}
