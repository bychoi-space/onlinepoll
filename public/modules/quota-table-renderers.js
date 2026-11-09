/**
 * 설문 유형별 STEP 1 쿼터(대상자) 테이블 헤더 및 행 렌더러 모듈
 */
import { escapeHtml } from './blueprint-utils.js?v=20261108_modular_v2';
import { DEFAULT_GLOBALRI_AGE_POLICIES, resolveGlobalriAgeGroupKey } from './blueprint-globalri.js?v=20261108_modular_v2';

export const GALLUP_SIG_STYLES_LABELS = [
  '정자체 (바른획)',
  '흘림체 (우상향)',
  '반흘림 (자연곡선)',
  '둥근획 (부드러움)',
  '날카로운 속기체',
  '넓은자간 안정체',
  '세로장체 (긴획)',
  '이니셜 결합체'
];

export const HRC_T41_OPTIONS = [
  { code: '1', label: '1.식음료시설' },
  { code: '2', label: '2.판매시설' },
  { code: '3', label: '3.목욕장' },
  { code: '4', label: '4.수영장' },
  { code: '5', label: '5.아이스링크' },
  { code: '6', label: '6.세탁시설' },
  { code: '7', label: '7.수술실' },
  { code: '8', label: '8.실험실' },
  { code: '9', label: '9.냉동창고' },
  { code: '10', label: '10.방재실' },
  { code: '11', label: '11.전산실' },
  { code: '12', label: '12.서버실' },
  { code: '77', label: '77.해당없음' }
];

export const HRC_B11_OPTIONS = [
  { code: '1', label: '1.흡수식냉온수기' },
  { code: '2', label: '2.소형열병합' },
  { code: '3', label: '3.GHP(가스히트펌프)' },
  { code: '4', label: '4.시스템냉온풍기(EHP)' },
  { code: '5', label: '5.증기보일러' },
  { code: '6', label: '6.온수보일러' },
  { code: '7', label: '7.지역난방' },
  { code: '8', label: '8.축열식보일러' },
  { code: '9', label: '9.전기난방' },
  { code: '10', label: '10.온풍기' },
  { code: '11', label: '11.터보식냉동기' },
  { code: '12', label: '12.왕복동식냉동기' },
  { code: '13', label: '13.스크류식냉동기' },
  { code: '14', label: '14.지역냉방' },
  { code: '15', label: '15.패키지·룸에어컨' }
];

export function renderQuotaTableHead({
  quotaTableHead,
  isGallupReturnFarm,
  isGlobalriLiteracy,
  isHrcEnergy,
  isKona,
  isMetrix,
  isAssoc
}) {
  if (!quotaTableHead) return;
  if (isGallupReturnFarm) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no text-center" style="width: 44px;">
          <input type="checkbox" id="cb-gallup-check-all" title="미완료 쿼터 전체 선택/해제" style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </th>
        <th class="th-no">번호</th>
        <th>가구 ID</th>
        <th>표본구분</th>
        <th>대상자 성명</th>
        <th>성별 / 연령</th>
        <th>이주년도</th>
        <th>읍·면</th>
        <th>상세 주소</th>
        <th>연락처</th>
        <th>브라우저 GPS 주입 좌표</th>
        <th>방문기록 검증</th>
        <th>답례품 전자서명 필체</th>
        <th class="th-status">진행 상태</th>
        <th class="text-center" style="min-width: 115px;">개별 실행</th>
      </tr>
    `;
  } else if (isGlobalriLiteracy) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no text-center" style="width: 44px;">
          <input type="checkbox" id="cb-globalri-check-all" title="미완료 쿼터 전체 선택/해제" style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </th>
        <th class="th-no">번호</th>
        <th>가구 LID</th>
        <th>개인 UID</th>
        <th>대상자 성명</th>
        <th>성별</th>
        <th>출생연도 (만 나이)</th>
        <th>나이대 그룹</th>
        <th style="min-width: 230px;">적용된 설문 응답 가이드</th>
        <th>가구주 관계</th>
        <th>시군구 / 읍면동</th>
        <th>가구 상세주소</th>
        <th>가구원 조사 현황</th>
        <th class="th-status">진행 상태</th>
        <th class="text-center" style="min-width: 115px;">개별 실행</th>
      </tr>
    `;
  } else if (isHrcEnergy) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no text-center" style="width: 44px;">
          <input type="checkbox" id="cb-hrc-check-all" title="전체 쿼터 선택/해제" style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </th>
        <th class="th-no">번호</th>
        <th>구분</th>
        <th>UID</th>
        <th>시도 / 시군구</th>
        <th>건물명</th>
        <th>주용도</th>
        <th>면적규모</th>
        <th style="min-width: 185px;">T41 입점시설 가이드</th>
        <th style="min-width: 195px;">B1-1 냉난방설비 가이드</th>
        <th>표본층 (Cell)</th>
        <th>담당자</th>
        <th>연락처</th>
        <th>TAPI 기본정보</th>
        <th class="th-status">진행 상태</th>
      </tr>
    `;
  } else if (isKona) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no">번호</th>
        <th>응답자 IDX</th>
        <th>거주 행정동 (5번 하위)</th>
        <th>학교급 (4번)</th>
        <th>성별 (3번)</th>
        <th>만나이 (2번)</th>
        <th>거주 구 (5번)</th>
        <th>설문 접근 URL</th>
        <th class="th-status">진행 상태</th>
      </tr>
    `;
  } else if (isMetrix) {
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
        <th class="th-actions text-center">관리</th>
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

export function renderEmptyQuotaTableRow({
  quotaTableBody,
  isGallupReturnFarm,
  isGlobalriLiteracy,
  isHrcEnergy,
  isAssoc
}) {
  if (!quotaTableBody) return;
  quotaTableBody.innerHTML = `
    <tr>
      <td colspan="${isAssoc ? 10 : (isHrcEnergy ? 12 : 13)}" class="empty-table-msg">
        ${isGallupReturnFarm
          ? '아직 장착된 귀농실태조사 대상자가 없습니다.'
          : (isGlobalriLiteracy
            ? '아직 장착된 성인문해능력조사 대상자가 없습니다.<br>상단의 <strong>[글로벌리서치 GIFT 동기화 / LID 지정 필터]</strong> 버튼을 클릭하여 쿼터를 불러와 주세요.'
            : (isAssoc
              ? '아직 등록된 상인회 슬롯 DB가 없습니다.<br>상단의 <strong>[Kstat 상인회 슬롯 자동 바인딩]</strong> 버튼을 클릭하여 슬롯을 장착해 주세요.'
              : '아직 구축된 사업자 DB가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.'))}
      </td>
    </tr>
  `;
}

export function renderGallupQuotaTable({
  db,
  quotaTableBody,
  checkedGallupSeqs,
  completed,
  onReRender,
  onTriggerBatchRun
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let gallupBar = document.getElementById('gallup-step1-check-bar');
  if (!gallupBar && tableScrollContainer && tableScrollContainer.parentNode) {
    gallupBar = document.createElement('div');
    gallupBar.id = 'gallup-step1-check-bar';
    gallupBar.className = 'globalri-check-toolbar';
    tableScrollContainer.parentNode.insertBefore(gallupBar, tableScrollContainer);
  }

  const readyOnlyItems = db.filter(i => i.quotaStatus !== 'completed' && i.status !== '조사완료' && i.quotaStatus !== 'pilot_done' && !String(i.status || '').includes('완료직전'));
  const pilotWaitItems = db.filter(i => i.quotaStatus === 'pilot_done' || String(i.status || '').includes('완료직전'));
  const uncompletedItems = db.filter(i => i.quotaStatus !== 'completed' && i.status !== '조사완료');
  const mainUncompletedItems = uncompletedItems.filter(i => (i.sampleType || '').includes('본표본'));
  const subUncompletedItems = uncompletedItems.filter(i => (i.sampleType || '').includes('예비'));
  const checkedCount = checkedGallupSeqs.size;

  if (gallupBar) {
    gallupBar.style.display = 'flex';
    gallupBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span style="font-size: 13px; font-weight: 800; color: #1e3a8a; margin-right: 4px;">
          <i class="fa-solid fa-square-check text-primary-color"></i> 실행 대상 체크 선택:
        </span>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="ready_only">미진행 대기 (${readyOnlyItems.length}명)</button>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="pilot_done">완료직전 대기 P118 (${pilotWaitItems.length}명)</button>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="uncompleted">미완료 전체 (${uncompletedItems.length}명)</button>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="main_sample">본표본 미완료 (${mainUncompletedItems.length}명)</button>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="sub_sample">예비표본 미완료 (${subUncompletedItems.length}명)</button>
        <button type="button" class="globalri-quick-check-btn gallup-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span id="badge-gallup-checked-count" class="badge-status ready font-bold" style="padding: 5px 12px; font-size: 12.5px;">
          현재 체크됨: <strong>${checkedCount}명</strong> · 완료직전(P118): <strong>${pilotWaitItems.length}명</strong> · 최종완료: <strong>${completed}명</strong>
        </span>
        <button type="button" id="btn-gallup-jump-step2" class="btn-pill btn-pill-primary btn-pill-small font-bold">
          <i class="fa-solid fa-sliders"></i> ↓ 4대 자동화 규칙 확인 (STEP 2)
        </button>
        <button type="button" id="btn-gallup-top-batch-run" class="btn-pill btn-pill-success btn-pill-small font-bold">
          <i class="fa-solid fa-rocket"></i> 체크한 대상자 (${checkedCount}명) 완료직전까지 일괄 실행
        </button>
      </div>
    `;
  }

  quotaTableBody.innerHTML = db.map((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const st = item.quotaStatus || 'ready';
    const isDone = (st === 'completed' || item.status === '조사완료');
    const isPilotWait = (st === 'pilot_done' || String(item.status || '').includes('완료직전'));
    const isRowRunning = (st === 'running');
    const isChecked = checkedGallupSeqs.has(seq);

    let statusHtml = `<span class="badge-status ready"><i class="fa-regular fa-clock"></i> ${escapeHtml(item.status || '미진행 대기')}</span>`;
    if (isDone) {
      statusHtml = `<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 조사완료 (100%)</span>`;
    } else if (isRowRunning) {
      statusHtml = `<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 자동진행 중 (${escapeHtml(item.progress || '')})</span>`;
    } else if (isPilotWait) {
      statusHtml = `<span class="badge-status pilot" title="Page 118 입력·저장 완료, [조사완료] 버튼 클릭 직전 대기 중"><i class="fa-solid fa-flag-checkered"></i> 완료직전 대기 (Page 118)</span>`;
    } else if (st === 'error') {
      statusHtml = `<span class="badge-status error" title="${escapeHtml(item.error || '')}">오류</span>`;
    }

    const sampleBadge = (item.sampleType || '').includes('본표본')
      ? `<span class="badge-status success font-bold" style="padding: 2px 8px;">본표본</span>`
      : `<span class="badge-status ready" style="padding: 2px 8px;">${escapeHtml(item.sampleType || '예비표본')}</span>`;

    const gpsStr = (item.gpsLat && item.gpsLng)
      ? `${Number(item.gpsLat).toFixed(4)}, ${Number(item.gpsLng).toFixed(4)}`
      : '37.6970, 127.8887';
    const sigStyleIdx = (parseInt(String(item.id || seq).replace(/\D/g, ''), 10) || seq) % GALLUP_SIG_STYLES_LABELS.length;
    const sigLabel = item.signatureStyle || GALLUP_SIG_STYLES_LABELS[sigStyleIdx];

    let pilotActionHtml = '';
    if (isDone) {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">제출완료</button>`;
    } else if (isRowRunning) {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small" disabled><i class="fa-solid fa-spinner fa-spin"></i> 진행중</button>`;
    } else if (isPilotWait) {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small btn-row-pilot-gallup" data-seq="${seq}" title="${escapeHtml(item.name || '')} (ID ${escapeHtml(item.id || '')}) Page 118 완료직전 상태 재검증 실행">↻ 재검증(P118)</button>`;
    } else {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small btn-row-pilot-gallup" data-seq="${seq}" title="${escapeHtml(item.name || '')} (ID ${escapeHtml(item.id || '')}) 완료 직전(Page 118)까지 단건 실행">▷ 단건실행</button>`;
    }

    return `
      <tr data-row-idx="${seq}" class="${isChecked ? 'globalri-row-checked' : ''}">
        <td class="text-center">
          <input type="checkbox" class="cb-gallup-quota-row" data-seq="${seq}" ${isChecked ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center font-mono font-bold text-primary-color">${escapeHtml(item.id || '-')}</td>
        <td class="text-center">${sampleBadge}</td>
        <td class="text-center"><strong>${escapeHtml(item.name || item.ceoName || '-')}</strong></td>
        <td class="text-center">${escapeHtml(item.gender || '-')} · ${escapeHtml(String(item.age || '-'))}세</td>
        <td class="text-center font-mono">${escapeHtml(String(item.moveYear || '2025'))}년</td>
        <td class="text-center"><strong>${escapeHtml(item.eupMyeon || '-')}</strong></td>
        <td title="${escapeHtml(item.fullAddress || '')}">${escapeHtml(item.detailAddress || item.fullAddress || '-')}</td>
        <td class="font-mono text-center">${escapeHtml(item.mobile || item.phone || '-')}</td>
        <td class="text-center font-mono" style="font-size: 11.5px;">
          <span class="badge-status ready" style="padding: 2px 7px;">
            <i class="fa-solid fa-location-dot text-primary-color"></i> ${escapeHtml(gpsStr)}
          </span>
        </td>
        <td class="text-center" style="font-size: 11.5px;">
          <span class="badge-status success" style="padding: 2px 7px;">
            <i class="fa-solid fa-calendar-check"></i> ${escapeHtml(item.visitDate || '07~22시')} · 컨택성공
          </span>
        </td>
        <td class="text-center" style="font-size: 11.5px;">
          <span class="badge-tag-tunable" style="padding: 2px 8px;">
            <i class="fa-solid fa-signature"></i> ${escapeHtml(sigLabel)}
          </span>
        </td>
        <td class="text-center">${statusHtml}</td>
        <td class="text-center">${pilotActionHtml}</td>
      </tr>
    `;
  }).join('');

  const cbAllGallup = document.getElementById('cb-gallup-check-all');
  const uncompletedGallupSeqs = uncompletedItems.map((item, idx) => Number(item.index || item.seq || (idx + 1)));
  if (cbAllGallup) {
    cbAllGallup.checked = uncompletedGallupSeqs.length > 0 && uncompletedGallupSeqs.every(s => checkedGallupSeqs.has(s));
    cbAllGallup.onchange = () => {
      if (cbAllGallup.checked) {
        uncompletedGallupSeqs.forEach(s => checkedGallupSeqs.add(s));
      } else {
        checkedGallupSeqs.clear();
      }
      if (typeof onReRender === 'function') onReRender(db);
    };
  }

  quotaTableBody.querySelectorAll('.cb-gallup-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedGallupSeqs.add(seq);
      else checkedGallupSeqs.delete(seq);
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      const badgeEl = document.getElementById('badge-gallup-checked-count');
      if (badgeEl) {
        badgeEl.innerHTML = `현재 체크됨: <strong>${checkedGallupSeqs.size}명</strong> · 완료직전(P118): <strong>${pilotWaitItems.length}명</strong> · 최종완료: <strong>${completed}명</strong>`;
      }
      const topBatchBtn = document.getElementById('btn-gallup-top-batch-run');
      if (topBatchBtn) {
        topBatchBtn.innerHTML = `<i class="fa-solid fa-rocket"></i> 체크한 대상자 (${checkedGallupSeqs.size}명) 완료직전까지 일괄 실행`;
      }
    });
  });

  if (gallupBar) {
    gallupBar.querySelectorAll('.gallup-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        checkedGallupSeqs.clear();
        if (mode === 'ready_only') {
          readyOnlyItems.forEach(i => checkedGallupSeqs.add(Number(i.index || i.seq)));
        } else if (mode === 'pilot_done') {
          pilotWaitItems.forEach(i => checkedGallupSeqs.add(Number(i.index || i.seq)));
        } else if (mode === 'uncompleted') {
          uncompletedItems.forEach(i => checkedGallupSeqs.add(Number(i.index || i.seq)));
        } else if (mode === 'main_sample') {
          mainUncompletedItems.forEach(i => checkedGallupSeqs.add(Number(i.index || i.seq)));
        } else if (mode === 'sub_sample') {
          subUncompletedItems.forEach(i => checkedGallupSeqs.add(Number(i.index || i.seq)));
        }
        if (typeof onReRender === 'function') onReRender(db);
      });
    });
    const jumpBtn = document.getElementById('btn-gallup-jump-step2');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const sec = document.getElementById('section-master-blueprint');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const topBatchBtn = document.getElementById('btn-gallup-top-batch-run');
    if (topBatchBtn) {
      topBatchBtn.addEventListener('click', () => {
        if (typeof onTriggerBatchRun === 'function') onTriggerBatchRun();
      });
    }
  }
}

export function renderGlobalriQuotaTable({
  db,
  quotaTableBody,
  checkedGlobalriSeqs,
  globalriAgePolicies,
  blueprintStageGrid,
  onReRender,
  onRenderGlobalriAgeGroupCards,
  onApplyGlobalriQuickCheck,
  onRebuildGlobalriAgeGroupStats,
  onTriggerBatchRun
}) {
  const ageBadgeStyleMap = {
    age20: 'background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd;',
    age30: 'background: #ecfdf5; color: #047857; border: 1px solid #6ee7b7;',
    age40: 'background: #f5f3ff; color: #6d28d9; border: 1px solid #c4b5fd;',
    age50: 'background: #fffbeb; color: #b45309; border: 1px solid #fcd34d;',
    age60: 'background: #fff7ed; color: #c2410c; border: 1px solid #fdba74;',
    age70: 'background: #fff1f2; color: #be123c; border: 1px solid #fda4af;'
  };
  const ageLabelFallbackMap = {
    age20: '20대',
    age30: '30대',
    age40: '40대',
    age50: '50대',
    age60: '60대',
    age70: '70대 이상'
  };

  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let checkBar = document.getElementById('globalri-step1-check-bar');
  if (!checkBar && tableScrollContainer && tableScrollContainer.parentNode) {
    checkBar = document.createElement('div');
    checkBar.id = 'globalri-step1-check-bar';
    checkBar.className = 'globalri-check-toolbar';
    tableScrollContainer.parentNode.insertBefore(checkBar, tableScrollContainer);
  }

  const uncompletedCount = db.filter(i => i.quotaStatus !== 'completed' && i.status !== '완료').length;
  const guidedCount = db.filter(i => i.guideApplied && i.quotaStatus !== 'completed' && i.status !== '완료').length;
  const checkedCount = checkedGlobalriSeqs.size;
  const countByAge = { age20: 0, age30: 0, age40: 0, age50: 0, age60: 0, age70: 0 };
  db.forEach(item => {
    if (item.quotaStatus !== 'completed' && item.status !== '완료') {
      const ak = resolveGlobalriAgeGroupKey(item);
      countByAge[ak] = (countByAge[ak] || 0) + 1;
    }
  });

  if (checkBar) {
    checkBar.style.display = 'flex';
    checkBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span style="font-size: 13px; font-weight: 800; color: #1e3a8a; margin-right: 4px;">
          <i class="fa-solid fa-square-check text-primary-color"></i> 1단계 쿼터 체크 선택:
        </span>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="uncompleted">미완료 전체 (${uncompletedCount}명)</button>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="guided">🎯 가이드 지정됨 (${guidedCount}명)</button>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="age20">20대 (${countByAge.age20}명)</button>
        ${countByAge.age30 > 0 ? `<button type="button" class="globalri-quick-check-btn" data-quick-check="age30">30대 (${countByAge.age30}명)</button>` : ''}
        ${countByAge.age40 > 0 ? `<button type="button" class="globalri-quick-check-btn" data-quick-check="age40">40대 (${countByAge.age40}명)</button>` : ''}
        <button type="button" class="globalri-quick-check-btn" data-quick-check="age50">50대 (${countByAge.age50}명)</button>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="age60">60대 (${countByAge.age60}명)</button>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="age70">70대+ (${countByAge.age70}명)</button>
        <button type="button" class="globalri-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span id="badge-globalri-checked-count" class="badge-status ready font-bold" style="padding: 5px 12px; font-size: 12.5px;">
          현재 체크됨: <strong>${checkedCount}명</strong> · 가이드 부여됨: <strong>${guidedCount}명</strong>
        </span>
        <button type="button" id="btn-globalri-jump-step2" class="btn-pill btn-pill-primary btn-pill-small font-bold">
          <i class="fa-solid fa-sliders"></i> ↓ 체크한 항목(${checkedCount}명) 가이드 설정 (STEP 2)
        </button>
        <button type="button" id="btn-globalri-top-batch-run" class="btn-pill btn-pill-success btn-pill-small font-bold">
          <i class="fa-solid fa-rocket"></i> 선택/가이드 항목 일괄 배치 실행
        </button>
      </div>
    `;
  }

  quotaTableBody.innerHTML = db.map((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const st = item.quotaStatus || 'ready';
    const prog = item.progress || (st === 'completed' || item.status === '완료' ? '100%' : '진행 중');
    const cScoreTxt = item.gradeSummary?.partC ? ` (C:${item.gradeSummary.partC.replace(/\s+/g, '')})` : '';
    let statusHtml = `<span class="badge-status ready">진행 중 (${escapeHtml(prog)})</span>`;
    if (st === 'completed' || item.status === '완료') {
      statusHtml = `<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 조사완료${escapeHtml(cScoreTxt)}</span>`;
    } else if (st === 'running') {
      statusHtml = `<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 실행중 (${escapeHtml(prog)})</span>`;
    } else if (st === 'pilot_done' || String(item.status || '').includes('Part C') || String(item.status || '').includes('F05_2')) {
      statusHtml = `<span class="badge-status pilot" title="자동화 구간 완료 · 수기/검토 대기"><i class="fa-solid fa-clipboard-check"></i> ${escapeHtml(item.status || 'Part C 완료')}${escapeHtml(cScoreTxt)}</span>`;
    } else if (st === 'error') {
      statusHtml = `<span class="badge-status error" title="${escapeHtml(item.error || '')}">오류</span>`;
    }

    const ageKey = resolveGlobalriAgeGroupKey(item);
    const ageBadgeStyle = ageBadgeStyleMap[ageKey] || ageBadgeStyleMap.age50;
    const ageDisplayLabel = item.ageGroupLabel || ageLabelFallbackMap[ageKey] || '50대';
    const hhUrl = item.householdUrl || item.slotUrl || '#';
    const mName = item.memberName || item.respondentName || item.ceoName || '-';
    const bYear = item.birthYear ? `${item.birthYear}년` : '-';
    const ageTxt = item.age ? ` (만 ${item.age}세)` : '';

    const isDone = (st === 'completed' || item.status === '완료');
    const isRowRunning = (st === 'running');
    const isChecked = checkedGlobalriSeqs.has(seq);

    let guideCellHtml = '';
    if (item.guideApplied && item.customGuide) {
      const cg = item.customGuide;
      const d5Txt = String(cg.D5_1_healthLiteracy || '4_5').replace('_', '~');
      const stopTxt = cg.stopAfterPartC === false ? 'F05_2까지' : 'Part C 후 정지';
      guideCellHtml = `
        <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
          <span class="badge-status success font-bold" style="padding: 2px 8px; font-size: 11.5px;">
            <i class="fa-solid fa-bullseye"></i> ${escapeHtml(item.guidePresetLabel || '맞춤 가이드 지정됨')}
          </span>
          <span style="font-size: 11px; color: #0f172a; font-weight: 600;">
            Part C ${cg.partC_correctCountMin ?? 18}~${cg.partC_correctCountMax ?? 20}개 · D5(${escapeHtml(d5Txt)}교차) · ${stopTxt}
          </span>
        </div>
      `;
    } else {
      const defPol = (globalriAgePolicies && globalriAgePolicies[ageKey]) || DEFAULT_GLOBALRI_AGE_POLICIES[ageKey] || DEFAULT_GLOBALRI_AGE_POLICIES.age50;
      const defD5 = String(defPol.D5_1_healthLiteracy || '3_4').replace('_', '~');
      guideCellHtml = `
        <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
          <span class="badge-status" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 2px 8px; font-size: 11px;">
            미지정 (${escapeHtml(ageDisplayLabel)} 기본값 대기)
          </span>
          <span style="font-size: 11px; color: #64748b;">
            기본 C ${defPol.partC_correctCountMin ?? 15}~${defPol.partC_correctCountMax ?? 18}개 · D5(${escapeHtml(defD5)}교차)
          </span>
        </div>
      `;
    }

    let pilotActionHtml = '';
    if (isDone) {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">제출완료</button>`;
    } else if (isRowRunning) {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small" disabled><i class="fa-solid fa-spinner fa-spin"></i> 진행중</button>`;
    } else {
      pilotActionHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small btn-row-pilot-globalri" data-seq="${seq}" title="${escapeHtml(mName)} (LID ${escapeHtml(item.lid || '')}) 현재 적용된 가이드로 단건 실행">▷ 단건실행</button>`;
    }

    return `
      <tr data-row-idx="${seq}" class="${isChecked ? 'globalri-row-checked' : ''}">
        <td class="text-center">
          <input type="checkbox" class="cb-globalri-quota-row" data-seq="${seq}" ${isChecked ? 'checked' : ''} ${isDone ? 'title="이미 조사 완료된 항목입니다"' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center font-mono font-bold text-primary-color">${escapeHtml(item.lid || '-')}</td>
        <td class="text-center font-mono">${escapeHtml(item.memberUid || '-')}</td>
        <td class="text-center"><strong>${escapeHtml(mName)}</strong></td>
        <td class="text-center">${escapeHtml(item.gender || item.ceoGender || '-')}</td>
        <td class="text-center font-mono">${escapeHtml(bYear)}${escapeHtml(ageTxt)}</td>
        <td class="text-center">
          <span class="badge-status font-bold" style="${ageBadgeStyle} padding: 3px 10px;">
            ${escapeHtml(ageDisplayLabel)}
          </span>
        </td>
        <td class="text-center">${guideCellHtml}</td>
        <td class="text-center">${escapeHtml(item.relation || '-')}</td>
        <td class="text-center">${escapeHtml(item.sigungu || '')} ${escapeHtml(item.dong || '')}</td>
        <td>${escapeHtml(item.detailAddress || item.address || '-')}</td>
        <td class="text-center">
          <a href="${escapeHtml(hhUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="가구원 조사 현황(Survey.asp) 열기">
            <i class="fa-solid fa-users-viewfinder"></i> 가구원 현황
          </a>
        </td>
        <td class="text-center">${statusHtml}</td>
        <td class="text-center">${pilotActionHtml}</td>
      </tr>
    `;
  }).join('');

  const cbAll = document.getElementById('cb-globalri-check-all');
  const uncompletedSeqs = db
    .filter(item => item.quotaStatus !== 'completed' && item.status !== '완료')
    .map((item, idx) => Number(item.index || item.seq || (idx + 1)));
  if (cbAll) {
    cbAll.checked = uncompletedSeqs.length > 0 && uncompletedSeqs.every(s => checkedGlobalriSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) {
        uncompletedSeqs.forEach(s => checkedGlobalriSeqs.add(s));
      } else {
        checkedGlobalriSeqs.clear();
      }
      if (typeof onReRender === 'function') onReRender(db);
      if (typeof onRenderGlobalriAgeGroupCards === 'function') onRenderGlobalriAgeGroupCards();
    };
  }

  quotaTableBody.querySelectorAll('.cb-globalri-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedGlobalriSeqs.add(seq);
      else checkedGlobalriSeqs.delete(seq);
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      const badgeEl = document.getElementById('badge-globalri-checked-count');
      if (badgeEl) {
        badgeEl.innerHTML = `현재 체크됨: <strong>${checkedGlobalriSeqs.size}명</strong> · 가이드 부여됨: <strong>${guidedCount}명</strong>`;
      }
      const jumpBtn = document.getElementById('btn-globalri-jump-step2');
      if (jumpBtn) {
        jumpBtn.innerHTML = `<i class="fa-solid fa-sliders"></i> ↓ 체크한 항목(${checkedGlobalriSeqs.size}명) 가이드 설정 (STEP 2)`;
      }
      if (typeof onRenderGlobalriAgeGroupCards === 'function') onRenderGlobalriAgeGroupCards();
    });
  });

  if (checkBar) {
    checkBar.querySelectorAll('.globalri-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        if (typeof onApplyGlobalriQuickCheck === 'function') onApplyGlobalriQuickCheck(mode, db);
      });
    });
    const jumpBtn = document.getElementById('btn-globalri-jump-step2');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const sec = document.getElementById('section-master-blueprint');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const topBatchBtn = document.getElementById('btn-globalri-top-batch-run');
    if (topBatchBtn) {
      topBatchBtn.addEventListener('click', () => {
        if (typeof onTriggerBatchRun === 'function') onTriggerBatchRun();
      });
    }
  }

  if (typeof onRebuildGlobalriAgeGroupStats === 'function') onRebuildGlobalriAgeGroupStats(db);
  if (blueprintStageGrid && blueprintStageGrid.querySelector('#globalri-step2-target-banner')) {
    if (typeof onRenderGlobalriAgeGroupCards === 'function') onRenderGlobalriAgeGroupCards();
  }
}

export function renderHrcEnergyQuotaTable({
  db,
  quotaTableBody,
  campId = '',
  checkedHrcSeqs = new Set(),
  onSaveGuide = null,
  onReRender = null
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let hrcBar = document.getElementById('hrc-step1-guide-bar');
  if (!hrcBar && tableScrollContainer && tableScrollContainer.parentNode) {
    hrcBar = document.createElement('div');
    hrcBar.id = 'hrc-step1-guide-bar';
    hrcBar.className = 'globalri-check-toolbar';
    hrcBar.style.flexDirection = 'column';
    hrcBar.style.alignItems = 'stretch';
    hrcBar.style.gap = '10px';
    tableScrollContainer.parentNode.insertBefore(hrcBar, tableScrollContainer);
  }

  const t41Map = Object.fromEntries(HRC_T41_OPTIONS.map(o => [o.code, o.label]));
  const b11Map = Object.fromEntries(HRC_B11_OPTIONS.map(o => [o.code, o.label]));

  if (hrcBar) {
    hrcBar.style.display = 'flex';
    const checkedCount = checkedHrcSeqs.size;
    hrcBar.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 13px; font-weight: 800; color: #1e3a8a; margin-right: 4px;">
            <i class="fa-solid fa-Sliders text-primary-color"></i> 쿼터별 T41(입점시설) · B1-1(냉난방설비) 가이드 설정:
          </span>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="selected_only">★ 선정 표본만 선택</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="uncompleted">미완료 전체 선택</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="all">전체 선택</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="badge-hrc-checked-count" class="badge-status ready font-bold" style="padding: 4px 12px; font-size: 12.5px;">
            체크된 쿼터: <strong>${checkedCount}개 건물</strong>
          </span>
          <button type="button" id="btn-hrc-save-quota-guide" class="btn-pill btn-pill-primary btn-pill-small font-bold">
            <i class="fa-solid fa-floppy-disk"></i> 체크한 쿼터(${checkedCount}개)에 T41 · B1-1 가이드 저장
          </button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
        <div>
          <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
            <i class="fa-solid fa-store text-primary-color"></i> [T41 문항 (q2900)] 입점시설 선택 <span style="font-weight: 500; color: #64748b;">(점유면적 A4-2는 '응답거절' 자동 연동)</span>
          </div>
          <div id="hrc-t41-checkbox-group" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${HRC_T41_OPTIONS.map(opt => `
              <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 3px 8px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                <input type="checkbox" class="cb-hrc-t41-opt" value="${opt.code}" ${['1', '2'].includes(opt.code) ? 'checked' : ''} style="accent-color: #2563eb;" />
                <span>${escapeHtml(opt.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 12px; font-weight: 800; color: #0f172a;">
              <i class="fa-solid fa-temperature-Half text-primary-color"></i> [B1-1 문항 (q4000)] 냉난방 설비 선택
            </span>
            <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: #1e40af;">
              <span>에어컨 1대 용량(kW):</span>
              <input type="number" id="input-hrc-ehp-unit-kw" value="5" min="1" max="200" step="1" style="width: 56px; padding: 2px 6px; border: 1px solid #93c5fd; border-radius: 5px; font-size: 12px; text-align: right;" title="B1-4-3 용량 = 에어컨 1대 용량(kW) × A3-1-1 입점업체수" />
              <span style="color: #64748b; font-weight: 500;">× 입점업체수</span>
            </label>
          </div>
          <div id="hrc-b11-checkbox-group" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${HRC_B11_OPTIONS.map(opt => `
              <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 3px 8px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                <input type="checkbox" class="cb-hrc-b11-opt" value="${opt.code}" ${opt.code === '4' ? 'checked' : ''} style="accent-color: #0284c7;" />
                <span>${escapeHtml(opt.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  quotaTableBody.innerHTML = db.map((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const isChecked = checkedHrcSeqs.has(seq);
    const st = item.quotaStatus || item.status || 'ready';
    const prog = item.progress || (st === 'completed' || st === '완료' ? '100%' : '0%');
    let statusHtml = `<span class="badge-status ready">대기 (${escapeHtml(prog)})</span>`;

    if (st === '완료' || st === 'completed') {
      statusHtml = '<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 100% 조사완료</span>';
    } else if (st === '진행중' || st === 'running') {
      statusHtml = `<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중 (${escapeHtml(prog)})</span>`;
    } else if (st === 'pilot_done') {
      statusHtml = `<span class="badge-status pilot"><i class="fa-solid fa-flask"></i> 검증대기 (${escapeHtml(prog)})</span>`;
    } else if (st === 'error') {
      statusHtml = `<span class="badge-status error" title="${escapeHtml(item.error || '')}">오류${item.substitutedByUid ? ` (→${escapeHtml(item.substitutedByUid)} 대체)` : ''}</span>`;
    }

    const isSel = (item.selectionType === '선정');
    const selBadge = isSel
      ? '<span class="badge-status success font-bold" style="padding: 2px 8px;">★ 선정</span>'
      : `<span class="badge-status ready" style="padding: 2px 8px; opacity: 0.85;">대체 #${escapeHtml(item.cellPriority || '-')}</span>`;

    const uidStr = String(item.uid || '-');
    const infoUrl = item.slotUrl || `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${encodeURIComponent(uidStr)}&page=1`;
    const bName = item.buildingName || item.companyName || `(건물 #${uidStr})`;

    const t41Arr = Array.isArray(item.t41Codes) && item.t41Codes.length > 0 ? item.t41Codes.map(String) : null;
    const t41Html = t41Arr
      ? `<span class="badge-status success font-bold" style="padding: 2px 8px; font-size: 11px;">${escapeHtml(t41Arr.map(c => t41Map[c] || c).join(', '))}</span>`
      : `<span class="badge-status ready" style="padding: 2px 8px; font-size: 11px;">기본 (1.식음료, 2.판매)</span>`;

    const b11Arr = Array.isArray(item.b11Codes) && item.b11Codes.length > 0 ? item.b11Codes.map(String) : null;
    const unitKwTxt = item.ehpUnitKw ? ` (1대 ${item.ehpUnitKw}kW)` : ' (1대 5kW)';
    const b11Html = b11Arr
      ? `<span class="badge-status pilot font-bold" style="padding: 2px 8px; font-size: 11px;">${escapeHtml(b11Arr.map(c => b11Map[c] || c).join(', '))}${escapeHtml(unitKwTxt)}</span>`
      : `<span class="badge-status ready" style="padding: 2px 8px; font-size: 11px;">기본 (4.시스템EHP)${escapeHtml(unitKwTxt)}</span>`;

    return `
      <tr data-row-idx="${seq}" class="${isChecked ? 'globalri-row-checked' : ''}" style="${isSel ? '' : 'opacity: 0.86;'}">
        <td class="text-center">
          <input type="checkbox" class="cb-hrc-quota-row" data-seq="${seq}" data-uid="${escapeHtml(uidStr)}" ${isChecked ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center">${selBadge}</td>
        <td class="text-center font-mono font-bold text-primary-color">${escapeHtml(uidStr)}</td>
        <td class="text-center"><strong>${escapeHtml(item.sido || '')}</strong> ${escapeHtml(item.sigungu || '')}</td>
        <td>
          <strong>${escapeHtml(bName)}</strong>
          ${item.substitutedFromUid ? `<div class="font-caption text-warning">↳ UID ${escapeHtml(item.substitutedFromUid)} 대체 승계</div>` : ''}
        </td>
        <td><span class="quota-ind-badge">${escapeHtml(item.mainUse || item.industry || '-')}</span></td>
        <td class="text-center"><span class="badge-main-product">${escapeHtml(item.areaScale || '-')}</span></td>
        <td class="text-center">
          <div style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">
            ${t41Html}
            <button type="button" class="btn-pill btn-pill-secondary btn-pill-small btn-hrc-row-guide" data-seq="${seq}" title="이 건물 쿼터의 T41/B1-1 가이드를 상단 패널로 불러와 편집">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </div>
        </td>
        <td class="text-center">
          <div style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">
            ${b11Html}
          </div>
        </td>
        <td class="text-center font-mono font-caption">${escapeHtml(item.cellKey || '-')}</td>
        <td class="text-center">${escapeHtml(item.contactName || item.ceoName || '-')}</td>
        <td class="font-mono">${escapeHtml(item.phone || '-')}</td>
        <td class="text-center">
          <a href="${escapeHtml(infoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="한국리서치 TAPI 기본정보 페이지 열기">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> 기본정보
          </a>
        </td>
        <td class="text-center">${statusHtml}</td>
      </tr>
    `;
  }).join('');

  const updateCheckedBadges = () => {
    const cnt = checkedHrcSeqs.size;
    const badgeEl = document.getElementById('badge-hrc-checked-count');
    if (badgeEl) badgeEl.innerHTML = `체크된 쿼터: <strong>${cnt}개 건물</strong>`;
    const saveBtn = document.getElementById('btn-hrc-save-quota-guide');
    if (saveBtn) saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> 체크한 쿼터(${cnt}개)에 T41 · B1-1 가이드 저장`;
  };

  const cbAll = document.getElementById('cb-hrc-check-all');
  const allSeqs = db.map((item, idx) => Number(item.index || item.seq || (idx + 1)));
  if (cbAll) {
    cbAll.checked = allSeqs.length > 0 && allSeqs.every(s => checkedHrcSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) allSeqs.forEach(s => checkedHrcSeqs.add(s));
      else checkedHrcSeqs.clear();
      if (typeof onReRender === 'function') onReRender(db);
    };
  }

  quotaTableBody.querySelectorAll('.cb-hrc-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedHrcSeqs.add(seq);
      else checkedHrcSeqs.delete(seq);
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      updateCheckedBadges();
    });
  });

  quotaTableBody.querySelectorAll('.btn-hrc-row-guide').forEach(btn => {
    btn.addEventListener('click', () => {
      const seq = Number(btn.getAttribute('data-seq'));
      const item = db.find((it, idx) => Number(it.index || it.seq || (idx + 1)) === seq);
      checkedHrcSeqs.clear();
      checkedHrcSeqs.add(seq);
      quotaTableBody.querySelectorAll('.cb-hrc-quota-row').forEach(cb => {
        const s = Number(cb.getAttribute('data-seq'));
        cb.checked = (s === seq);
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      });
      updateCheckedBadges();
      if (item && hrcBar) {
        const t41Set = new Set(Array.isArray(item.t41Codes) && item.t41Codes.length > 0 ? item.t41Codes.map(String) : ['1', '2']);
        hrcBar.querySelectorAll('.cb-hrc-t41-opt').forEach(chk => {
          chk.checked = t41Set.has(chk.value);
        });
        const b11Set = new Set(Array.isArray(item.b11Codes) && item.b11Codes.length > 0 ? item.b11Codes.map(String) : ['4']);
        hrcBar.querySelectorAll('.cb-hrc-b11-opt').forEach(chk => {
          chk.checked = b11Set.has(chk.value);
        });
        const unitKwInput = document.getElementById('input-hrc-ehp-unit-kw');
        if (unitKwInput) unitKwInput.value = String(item.ehpUnitKw || 5);
        hrcBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  if (hrcBar) {
    // T41 77(해당없음) 상호배타 토글
    hrcBar.querySelectorAll('.cb-hrc-t41-opt').forEach(chk => {
      chk.addEventListener('change', () => {
        if (chk.value === '77' && chk.checked) {
          hrcBar.querySelectorAll('.cb-hrc-t41-opt').forEach(other => {
            if (other.value !== '77') other.checked = false;
          });
        } else if (chk.value !== '77' && chk.checked) {
          const noneChk = hrcBar.querySelector('.cb-hrc-t41-opt[value="77"]');
          if (noneChk) noneChk.checked = false;
        }
      });
    });

    hrcBar.querySelectorAll('.hrc-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        checkedHrcSeqs.clear();
        db.forEach((item, idx) => {
          const seq = Number(item.index || item.seq || (idx + 1));
          const isDone = (item.quotaStatus === 'completed' || item.status === '완료');
          if (mode === 'selected_only' && item.selectionType === '선정') checkedHrcSeqs.add(seq);
          else if (mode === 'uncompleted' && !isDone) checkedHrcSeqs.add(seq);
          else if (mode === 'all') checkedHrcSeqs.add(seq);
        });
        if (typeof onReRender === 'function') onReRender(db);
      });
    });

    const saveBtn = document.getElementById('btn-hrc-save-quota-guide');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (checkedHrcSeqs.size === 0) {
          alert('가이드를 적용할 건물 쿼터를 먼저 체크해 주세요.');
          return;
        }
        const t41Codes = Array.from(hrcBar.querySelectorAll('.cb-hrc-t41-opt:checked')).map(el => el.value);
        const b11Codes = Array.from(hrcBar.querySelectorAll('.cb-hrc-b11-opt:checked')).map(el => el.value);
        const ehpUnitKw = Number(document.getElementById('input-hrc-ehp-unit-kw')?.value || 5) || 5;
        if (t41Codes.length === 0) {
          alert('T41(입점시설) 항목을 최소 1개 이상 선택해 주세요. (입점시설이 없으면 77.해당없음을 선택하세요)');
          return;
        }
        if (b11Codes.length === 0) {
          alert('B1-1(냉난방 설비) 항목을 최소 1개 이상 선택해 주세요.');
          return;
        }
        if (typeof onSaveGuide === 'function') {
          await onSaveGuide({
            targetSeqs: Array.from(checkedHrcSeqs),
            t41Codes,
            b11Codes,
            ehpUnitKw
          });
        }
      });
    }
  }
}

export function renderKonaQuotaTable({ db, quotaTableBody }) {
  quotaTableBody.innerHTML = db.map((item, idx) => {
    const seq = item.index || item.seq || (idx + 1);
    const st = item.quotaStatus || item.status || 'ready';
    let statusHtml = '<span class="badge-status ready">대기</span>';

    if (st === '완료' || st === 'completed') {
      statusHtml = '<span class="badge-status success"><i class="fa-solid fa-check"></i> 제출 완료</span>';
    } else if (st === '진행중' || st === 'running') {
      statusHtml = '<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중</span>';
    } else if (st === 'pilot_done') {
      statusHtml = '<span class="badge-status pilot"><i class="fa-solid fa-camera"></i> 캡처·검증완료</span>';
    } else if (st === 'error') {
      statusHtml = '<span class="badge-status error">오류</span>';
    }

    const surveyUrl = item.surveyUrl || item.slotUrl || 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL';
    const genderStr = item.gender || item.ceoGender || '-';
    const schoolStr = item.schoolLevel === '고' ? '고등학생 (고)' : (item.schoolLevel === '중' ? '중학생 (중)' : (item.schoolLevel || '-'));

    return `
      <tr data-row-idx="${seq}">
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center font-mono font-bold text-primary-color">${escapeHtml(item.idx || item.uid || '-')}</td>
        <td><strong>${escapeHtml(item.dong || '-')}</strong></td>
        <td class="text-center"><span class="badge-main-product">${escapeHtml(schoolStr)}</span></td>
        <td class="text-center"><span class="badge-gender ${genderStr.includes('여') ? 'female' : 'male'}">${escapeHtml(genderStr)}</span></td>
        <td class="text-center font-mono"><strong>만 ${escapeHtml(item.age || item.ceoAge || '-')}세</strong></td>
        <td class="text-center"><span class="quota-ind-badge">${escapeHtml(item.gu || '동탄구')}</span></td>
        <td class="text-center"><a href="${escapeHtml(surveyUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small"><i class="fa-solid fa-arrow-up-right-from-square"></i> 설문 링크</a></td>
        <td class="text-center">${statusHtml}</td>
      </tr>
    `;
  }).join('');
}

export function renderMetrixQuotaTable({ db, quotaTableBody }) {
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
}

export function renderAssocQuotaTable({
  db,
  quotaTableBody,
  currentCampaign,
  currentSurveyor,
  campId,
  onCampaignUpdated
}) {
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
      slotTag = `<div class="quota-slot-badge font-mono" data-slot-seq="${seq}" title="클릭하여 슬롯 URL 직접 수정 (${escapeHtml(item.slotUrl)})"><i class="fa-solid fa-link"></i> 슬롯 #${seq} (ranId: ${escapeHtml(item.ranId || '-')})</div>`;
    } else {
      slotTag = `<div class="quota-slot-badge unmapped font-mono" data-slot-seq="${seq}" title="케이스탯 슬롯 미매핑 (클릭하여 슬롯 URL 입력)"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 미매핑 (클릭)</div>`;
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
        <td class="text-center">
          <button type="button" class="btn-icon-circle btn-delete-assoc-quota-row" data-seq="${seq}" data-name="${escapeHtml(mName)}" title="이 상인회 항목을 쿼터에서 삭제">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  quotaTableBody.querySelectorAll('.btn-delete-assoc-quota-row').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const seq = parseInt(btn.getAttribute('data-seq'), 10);
      const name = btn.getAttribute('data-name') || `#${seq}`;
      if (!seq || !confirm(`[#${seq} ${name}] 항목을 상인회 조사 쿼터에서 제외(삭제)하시겠습니까?`)) return;
      try {
        btn.disabled = true;
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campId)}/quota-item/${seq}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '삭제 실패');
        if (typeof onCampaignUpdated === 'function') onCampaignUpdated(data.campaign);
      } catch (err) {
        alert('항목 삭제 실패: ' + err.message);
        btn.disabled = false;
      }
    });
  });
}

