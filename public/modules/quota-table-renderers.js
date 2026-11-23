/**
 * 설문 유형별 STEP 1 쿼터(대상자) 테이블 헤더 및 행 렌더러 모듈
 */
import { escapeHtml } from './blueprint-utils.js';
import { DEFAULT_GLOBALRI_AGE_POLICIES, resolveGlobalriAgeGroupKey } from './blueprint-globalri.js';
import { resolveSurveySegmentAxes, computeSegmentStats, isQuotaItemDone } from './quota-segment-filter.js';

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
  isKmacKbpi,
  isGallupReturnFarm,
  isGlobalriLiteracy,
  isHrcEnergy,
  isKona,
  isMetrix,
  isMetrixSeoul,
  isAssoc
}) {
  if (!quotaTableHead) return;
  if (isKmacKbpi) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no text-center kbpi-th-check">
          <input type="checkbox" id="cb-kbpi-check-all" class="seg-card-checkbox" title="현재 필터 목록 전체 선택/해제" />
        </th>
        <th class="th-no">순번</th>
        <th>최종ID / 고유번호</th>
        <th>조사지역 · 조사구/동 · GPS</th>
        <th>성별 · 연령대 (만 나이)</th>
        <th>응답자 성명 · 연락처</th>
        <th>배경변인 (학력·직업·소득 / 결혼·가족·자녀)</th>
        <th>출제 브랜드 스캔 &amp; 구입경험 (클릭 시 있음⇄없음)</th>
        <th class="th-status">진행 상태</th>
        <th class="text-center kbpi-th-action">단건 실행</th>
      </tr>
    `;
  } else if (isMetrixSeoul) {
    quotaTableHead.innerHTML = `
      <tr>
        <th class="th-no text-center" style="width: 44px;">
          <input type="checkbox" id="cb-seoul-check-all" title="현재 필터 목록 전체 선택/해제" style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </th>
        <th class="th-no">번호</th>
        <th>조사원 계정</th>
        <th>RESID</th>
        <th>표본 · 패널구분</th>
        <th>보증여부</th>
        <th>사업체명</th>
        <th>업종</th>
        <th>사업자등록번호</th>
        <th>사업장 주소</th>
        <th>연락처</th>
        <th>컨택결과</th>
        <th>설문 · 시트기록</th>
        <th class="th-status">진행 상태</th>
        <th class="text-center" style="min-width: 115px;">개별 실행</th>
      </tr>
    `;
  } else if (isGallupReturnFarm) {
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
        <th>건물명 (SQ12)</th>
        <th>주용도</th>
        <th>면적규모</th>
        <th style="min-width: 175px;">공조(A5-1) · 입점(T41)</th>
        <th style="min-width: 195px;">냉난방(B1-1) · 신재생(T71)</th>
        <th style="min-width: 180px;">효율(C5-2) · 전력 · 가스</th>
        <th>표본층 (Cell)</th>
        <th>담당자 / 연락처</th>
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
        <th class="th-no text-center" style="width: 44px;">
          <input type="checkbox" id="cb-metrix-check-all" title="현재 필터의 미완료 사업체(폐업 제외) 전체 선택/해제" style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </th>
        <th class="th-no">번호</th>
        <th>조사원 계정</th>
        <th>UID</th>
        <th>사업체명</th>
        <th>대표자(성별)</th>
        <th style="min-width: 185px;">컨택 휴대폰 (구글시트 ➔ 저장)</th>
        <th>사업자등록번호</th>
        <th style="min-width: 145px;">휴폐업 조회 / 제외</th>
        <th>업종 / 분류명</th>
        <th style="min-width: 175px;">업종별 적용 가이드</th>
        <th>지역 / 사업장 주소</th>
        <th>컨택·설문 링크</th>
        <th class="th-status">진행 상태</th>
        <th class="text-center" style="min-width: 120px;">개별 실행</th>
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
  isKmacKbpi,
  isGallupReturnFarm,
  isGlobalriLiteracy,
  isHrcEnergy,
  isKona,
  isMetrix,
  isMetrixSeoul,
  isAssoc
}) {
  if (!quotaTableBody) return;
  const colSpan = isKmacKbpi
    ? 10
    : ((isMetrix || isMetrixSeoul || isGallupReturnFarm || isGlobalriLiteracy || isHrcEnergy)
      ? 15
      : (isAssoc ? 11 : (isKona ? 9 : 13)));

  let emptyMsg = '아직 구축된 사업자 DB가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.';
  if (isKmacKbpi) {
    emptyMsg = '아직 장착된 K-BPI 조사 응답자 쿼터가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 K-BPI 쿼터를 선택해 장착해 주세요.';
  } else if (isGallupReturnFarm) {
    emptyMsg = '아직 장착된 귀농실태조사 대상자가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong> 또는 <strong>[Kstat 진행 현황 실시간 동기화]</strong> 버튼으로 선정명단을 불러와 주세요.';
  } else if (isGlobalriLiteracy) {
    emptyMsg = '아직 장착된 성인문해능력조사 대상자가 없습니다.<br>상단의 <strong>[글로벌리서치 GIFT 동기화 / LID 지정 필터]</strong> 버튼을 클릭하여 쿼터를 불러와 주세요.';
  } else if (isHrcEnergy) {
    emptyMsg = '아직 장착된 에너지총조사 건물 표본이 없습니다.<br>상단의 <strong>[한국리서치 TAPI 실시간 동기화]</strong> 또는 <strong>[기존 쿼터 불러오기]</strong> 버튼을 클릭해 주세요.';
  } else if (isMetrixSeoul) {
    emptyMsg = '아직 장착된 서울시 소상공인 사업체패널 표본이 없습니다.<br>상단의 <strong>[2개 계정(2010·2016) + 구글시트 동기화]</strong> 또는 <strong>[기존 쿼터 불러오기]</strong> 버튼을 클릭해 주세요.';
  } else if (isMetrix) {
    emptyMsg = '아직 장착된 경기도 소상공인 패널 사업체가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong> 또는 <strong>[5계정·시트·폐업 동기화]</strong> 버튼을 클릭해 주세요.';
  } else if (isKona) {
    emptyMsg = '아직 장착된 청소년 설문 응답자 쿼터가 없습니다.<br>상단의 <strong>[기존 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.';
  } else if (isAssoc) {
    emptyMsg = '아직 등록된 상인회 슬롯 DB가 없습니다.<br>상단의 <strong>[Kstat 상인회 슬롯 자동 바인딩]</strong> 버튼을 클릭하여 슬롯을 장착해 주세요.';
  }

  quotaTableBody.innerHTML = `
    <tr>
      <td colspan="${colSpan}" class="empty-table-msg">
        ${emptyMsg}
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
    const rawProg = String(item.progress || '').trim();
    const prog = (rawProg && rawProg !== '진행 중') ? rawProg : (st === 'completed' || item.status === '완료' ? '100%' : '미진행');
    const cScoreTxt = item.gradeSummary?.partC ? ` (C:${item.gradeSummary.partC.replace(/\s+/g, '')})` : '';
    let statusHtml = `<span class="badge-status ready">대기 (${escapeHtml(prog)})</span>`;
    if (st === 'completed' || item.status === '완료') {
      statusHtml = `<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 조사완료${escapeHtml(cScoreTxt)}</span>`;
    } else if (st === 'running') {
      statusHtml = `<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 실행중 (${escapeHtml(rawProg || '진행 중')})</span>`;
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

export const HRC_MAIN_USE_ORDER = [
  '제1종근린생활시설',
  '제2종근린생활시설',
  '업무시설',
  '교육연구시설',
  '판매시설',
  '의료시설',
  '숙박시설',
  '문화및집회시설',
  '방송통신시설'
];

export function getHrcItemMainUse(item) {
  return String(item?.mainUse || item?.industry || '기타시설').trim() || '기타시설';
}

export function isHrcItemDone(item) {
  return item?.quotaStatus === 'completed' || item?.status === '완료' || Boolean(item?.substitutedByUid);
}

export function computeHrcMainUseStats(db = []) {
  const statsMap = new Map();
  db.forEach((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const useName = getHrcItemMainUse(item);
    if (!statsMap.has(useName)) {
      statsMap.set(useName, {
        useName,
        total: 0,
        selTotal: 0,
        selDone: 0,
        selPending: 0,
        allPending: 0,
        selPendingSeqs: [],
        allPendingSeqs: [],
        allSeqs: []
      });
    }
    const st = statsMap.get(useName);
    const done = isHrcItemDone(item);
    const isSel = (item.selectionType === '선정');
    st.total++;
    st.allSeqs.push(seq);
    if (!done) {
      st.allPending++;
      st.allPendingSeqs.push(seq);
    }
    if (isSel) {
      st.selTotal++;
      if (done) st.selDone++;
      else {
        st.selPending++;
        st.selPendingSeqs.push(seq);
      }
    }
  });

  return Array.from(statsMap.values()).sort((a, b) => {
    const ia = HRC_MAIN_USE_ORDER.indexOf(a.useName);
    const ib = HRC_MAIN_USE_ORDER.indexOf(b.useName);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return b.total - a.total;
  });
}

export function renderHrcEnergyQuotaTable({
  db,
  quotaTableBody,
  campId = '',
  checkedHrcSeqs = new Set(),
  selectedHrcMainUses = new Set(),
  onSaveGuide = null,
  onReRender = null,
  onSelectionChange = null,
  onTriggerBatchRun = null
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let hrcBar = document.getElementById('hrc-step1-guide-bar');
  if (!hrcBar && tableScrollContainer && tableScrollContainer.parentNode) {
    hrcBar = document.createElement('div');
    hrcBar.id = 'hrc-step1-guide-bar';
    hrcBar.className = 'metrix-slim-toolbar';
    tableScrollContainer.parentNode.insertBefore(hrcBar, tableScrollContainer);
  } else if (hrcBar) {
    hrcBar.className = 'metrix-slim-toolbar';
  }

  const t41Map = Object.fromEntries(HRC_T41_OPTIONS.map(o => [o.code, o.label]));
  const b11Map = Object.fromEntries(HRC_B11_OPTIONS.map(o => [o.code, o.label]));
  const c52LabelMap = {
    '2': '2.제로에너지(ZEB)',
    '3': '3.에너지진단',
    '4': '4.ESCO사업',
    '5': '5.설비설치지원',
    '6': '6.BEMS구축',
    '7': '7.그린리모델링',
    '9': '참여없음(9)'
  };
  const t71LabelMap = {
    '1': '태양광',
    '2': '태양열',
    '3': '지열',
    '10': '비상발전기'
  };
  const a51LabelMap = {
    '1': '①중앙+개별',
    '2': '②중앙방식',
    '3': '③개별방식'
  };

  const useStats = computeHrcMainUseStats(db);
  const indexedDb = db.map((item, idx) => ({
    item,
    seq: Number(item.index || item.seq || (idx + 1)),
    useName: getHrcItemMainUse(item),
    done: isHrcItemDone(item)
  }));

  // 캠페인 변경 등으로 존재하지 않는 주용도가 남아있으면 정리
  const validUseSet = new Set(useStats.map(u => u.useName));
  Array.from(selectedHrcMainUses).forEach(u => {
    if (!validUseSet.has(u)) selectedHrcMainUses.delete(u);
  });

  const isAllUsesMode = (selectedHrcMainUses.size === 0);
  const visibleIndexed = isAllUsesMode
    ? indexedDb
    : indexedDb.filter(r => selectedHrcMainUses.has(r.useName));

  const selectedItems = indexedDb.filter(r => r.item.selectionType === '선정');
  const selectedUncompleted = selectedItems.filter(r => !r.done);
  const selectedDone = selectedItems.length - selectedUncompleted.length;

  const visibleSelUncompleted = visibleIndexed.filter(r => r.item.selectionType === '선정' && !r.done);
  const visibleSelAll = visibleIndexed.filter(r => r.item.selectionType === '선정');
  const visibleUncompletedAll = visibleIndexed.filter(r => !r.done);

  const actionableCheckedCount = indexedDb.filter(r => !r.done && checkedHrcSeqs.has(r.seq)).length;
  const activeUseSummaryLabel = isAllUsesMode
    ? '전체 용도'
    : Array.from(selectedHrcMainUses).join(', ');
  const gsheetUrl = 'https://docs.google.com/spreadsheets/d/1YW66qD-j8OHC7NyNWItVhmFDWBmt5jsOwSTOEr7wtm0/edit?gid=1994985141#gid=1994985141';

  if (hrcBar) {
    hrcBar.style.display = 'flex';
    hrcBar.innerHTML = `
      <div class="metrix-slim-row">
        <div class="metrix-slim-group">
          <span class="metrix-slim-label">
            <i class="fa-solid fa-building text-primary-color"></i> [주 용도] 구분 선택:
          </span>
          <button
            type="button"
            class="hrc-use-chip ${isAllUsesMode ? 'is-active' : ''}"
            data-hrc-use="__ALL__"
            title="전체 주용도를 표시하고 미완료 선정 쿼터를 자동 선택합니다"
          >
            <span>전체 용도</span>
            <span class="hrc-use-chip-count">선정잔여 ${selectedUncompleted.length}/${selectedItems.length}</span>
          </button>
          ${useStats.map(st => {
            const isAct = selectedHrcMainUses.has(st.useName);
            const allDone = (st.selTotal > 0 ? st.selPending === 0 : st.allPending === 0);
            const badgeText = allDone
              ? `완료 ${st.selDone}/${st.selTotal}`
              : `선정잔여 ${st.selPending}/${st.selTotal}`;
            return `
              <button
                type="button"
                class="hrc-use-chip ${isAct ? 'is-active' : ''} ${allDone ? 'is-all-done' : ''}"
                data-hrc-use="${escapeHtml(st.useName)}"
                title="${escapeHtml(st.useName)} (전체 ${st.total}건 · 선정 ${st.selTotal}건 중 미완료 ${st.selPending}건) — 클릭 시 해당 용도 선택/복수선택 및 자동 체크"
              >
                ${isAct ? '<i class="fa-solid fa-check"></i>' : (allDone ? '<i class="fa-solid fa-circle-check"></i>' : '')}
                <span>${escapeHtml(st.useName)}</span>
                <span class="hrc-use-chip-count">${badgeText}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <div class="metrix-slim-row" style="padding-top: 8px; border-top: 1px solid #e2e8f0;">
        <div class="metrix-slim-group">
          <span class="metrix-slim-label">현재 용도 빠른선택:</span>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="visible_sel_uncompleted">★ 선정 미완료 (${visibleSelUncompleted.length}건)</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="visible_sel_all">★ 선정 전체 (${visibleSelAll.length}건)</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="visible_uncompleted">미완료 전체·대체포함 (${visibleUncompletedAll.length}건)</button>
          <button type="button" class="globalri-quick-check-btn hrc-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
          <span class="metrix-slim-divider"></span>
          <span id="badge-hrc-checked-count" class="metrix-summary-text">
            <span>선택 용도: <strong style="color:#1d4ed8;">${escapeHtml(activeUseSummaryLabel)}</strong></span>
            <span>·</span>
            <span>실행 대상 체크: <strong style="color:#16a34a;">${actionableCheckedCount}건</strong></span>
            <span>·</span>
            <span>선정 완료: <strong>${selectedDone}/${selectedItems.length}건</strong></span>
          </span>
        </div>

        <div class="metrix-slim-group">
          <button
            type="button"
            id="btn-hrc-top-batch-run"
            data-has-targets="${actionableCheckedCount > 0 ? '1' : '0'}"
            class="btn-pill ${actionableCheckedCount > 0 ? 'btn-pill-primary' : 'btn-pill-secondary'} btn-pill-small font-bold"
            style="${actionableCheckedCount > 0 ? 'background:#16a34a; border-color:#16a34a; color:#fff;' : ''}"
            ${actionableCheckedCount === 0 ? 'disabled' : ''}
            title="현재 선택한 [주 용도] 및 체크된 미완료 건물 쿼터만 즉시 순차 배치 자동화를 실행합니다"
          >
            <i class="fa-solid fa-play"></i>
            ${actionableCheckedCount > 0
              ? `${isAllUsesMode ? '체크 쿼터' : `[${escapeHtml(activeUseSummaryLabel)}]`} 배치 바로 실행 (${actionableCheckedCount}건)`
              : '실행할 용도/쿼터를 선택하세요 (0건)'}
          </button>
          <a href="${escapeHtml(gsheetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration: none;" title="구글 스프레드시트 6개 계정 쿼터 및 M~U열 엔지니어링 가이드 열기">
            <i class="fa-solid fa-table text-success"></i> 구글시트
          </a>
          <a href="#section-execution" class="metrix-jump-exec-link">
            <i class="fa-solid fa-sliders"></i> STEP 3 용도별 실행 ↓
          </a>
        </div>
      </div>
    `;
  }

  quotaTableBody.innerHTML = visibleIndexed.map(({ item, seq }) => {
    const isChecked = checkedHrcSeqs.has(seq);
    const st = item.quotaStatus || item.status || 'ready';
    const prog = item.progress || (st === 'completed' || st === '완료' ? '100%' : '0%');
    let statusHtml = `<span class="badge-status ready">대기 (${escapeHtml(prog)})</span>`;

    if (st === '완료' || st === 'completed') {
      const giftTag = item.giftSigned !== false
        ? `<div style="margin-top:3px;"><span class="badge-tag-tunable" style="padding:1px 6px;font-size:10.5px;" title="${escapeHtml(item.giftStyleLabel || '신세계상품권 5,000원 · 응답자 성명 8종 필체 서명 완료')}"><i class="fa-solid fa-signature"></i> 신세계 5천원 서명완료</span></div>`
        : '';
      statusHtml = `<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 100% 조사완료</span>${giftTag}`;
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
    const bName = item.buildingName || item.companyName || '(건물명 없음)';
    const sq12Label = item.sq12BuildingName || ((bName && !bName.includes('건물명 없음') && !bName.startsWith('(건물')) ? bName : '없음');

    const a51Code = String(item.a51Code || '3');
    const a51Txt = a51LabelMap[a51Code] || '③개별방식';
    const tempTypeTxt = item.isPublicOrSchool ? '공공26~28/18~20℃' : '민간24~26/20~22℃';
    const t41Arr = Array.isArray(item.t41Codes) && item.t41Codes.length > 0 ? item.t41Codes.map(String) : ['1', '2'];
    const t41Txt = t41Arr.map(c => t41Map[c] || c).join(', ');

    const b11Arr = Array.isArray(item.b11Codes) && item.b11Codes.length > 0 ? item.b11Codes.map(String) : ['4'];
    const b11Txt = b11Arr.map(c => b11Map[c] || c).join(', ');
    const t71Arr = Array.isArray(item.t71Codes) && item.t71Codes.length > 0 ? item.t71Codes.map(String) : ['10'];
    const t71Txt = t71Arr.map(c => t71LabelMap[c] || c).join('+');

    const c52Arr = Array.isArray(item.c52Codes) && item.c52Codes.length > 0 ? item.c52Codes.map(String) : ['9'];
    const c52Txt = c52Arr.map(c => c52LabelMap[c] || c).join(', ');
    const cpKw = Number(item.contractPowerKw) || 300;
    const gasTxt = String(item.d21UseGas || '2') === '1' ? '도시가스 사용' : '가스 미사용';

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
          <div class="font-caption text-dim">SQ12: <strong>${escapeHtml(sq12Label)}</strong>${item.expectedTypeCode ? ` · <span class="font-mono">${escapeHtml(item.expectedTypeCode)}</span>` : ''}</div>
          ${item.substitutedFromUid ? `<div class="font-caption text-warning">↳ UID ${escapeHtml(item.substitutedFromUid)} 대체 승계</div>` : ''}
        </td>
        <td><span class="quota-ind-badge">${escapeHtml(getHrcItemMainUse(item))}</span></td>
        <td class="text-center"><span class="badge-main-product">${escapeHtml(item.areaScale || '-')}</span></td>
        <td class="text-center">
          <div style="display: flex; flex-direction: column; gap: 3px; align-items: center;">
            <span class="badge-status ready font-bold" style="padding: 2px 7px; font-size: 11px;">${escapeHtml(a51Txt)} · ${escapeHtml(tempTypeTxt)}</span>
            <span class="badge-status success font-bold" style="padding: 2px 7px; font-size: 11px;">${escapeHtml(t41Txt)}</span>
          </div>
        </td>
        <td class="text-center">
          <div style="display: flex; flex-direction: column; gap: 3px; align-items: center;">
            <span class="badge-status pilot font-bold" style="padding: 2px 7px; font-size: 11px;" title="${escapeHtml(item.b11Raw || b11Txt)}">${escapeHtml(b11Txt)}</span>
            <span style="font-size: 11px; color: #0369a1; font-weight: 700;">T71: ${escapeHtml(t71Txt)}</span>
          </div>
        </td>
        <td class="text-center">
          <div style="display: flex; flex-direction: column; gap: 3px; align-items: center;">
            <span class="badge-status ${c52Arr.includes('9') ? 'ready' : 'success'} font-bold" style="padding: 2px 7px; font-size: 11px;">${escapeHtml(c52Txt)}</span>
            <span style="font-size: 11px; color: #334155; font-weight: 600;">계약 ${cpKw.toLocaleString()}kW · ${escapeHtml(gasTxt)}</span>
          </div>
        </td>
        <td class="text-center font-mono font-caption">${escapeHtml(item.cellKey || '-')}</td>
        <td class="text-center">
          <div><strong>${escapeHtml(item.contactName || item.ceoName || '-')}</strong></div>
          <div class="font-mono font-caption">${escapeHtml(item.phone || '-')}</div>
        </td>
        <td class="text-center">
          <a href="${escapeHtml(infoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="한국리서치 TAPI 기본정보 페이지 열기">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> 기본정보
          </a>
        </td>
        <td class="text-center">${statusHtml}</td>
      </tr>
    `;
  }).join('');

  const applyAutoCheckForSelectedUses = () => {
    checkedHrcSeqs.clear();
    const targetRows = (selectedHrcMainUses.size === 0)
      ? indexedDb
      : indexedDb.filter(r => selectedHrcMainUses.has(r.useName));
    targetRows.forEach(r => {
      if (r.item.selectionType === '선정' && !r.done) {
        checkedHrcSeqs.add(r.seq);
      }
    });
  };

  const cbAll = document.getElementById('cb-hrc-check-all');
  const visibleSeqs = visibleIndexed.map(r => r.seq);
  if (cbAll) {
    cbAll.checked = visibleSeqs.length > 0 && visibleSeqs.every(s => checkedHrcSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) visibleSeqs.forEach(s => checkedHrcSeqs.add(s));
      else visibleSeqs.forEach(s => checkedHrcSeqs.delete(s));
      if (typeof onReRender === 'function') onReRender(db);
      if (typeof onSelectionChange === 'function') onSelectionChange();
    };
  }

  quotaTableBody.querySelectorAll('.cb-hrc-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedHrcSeqs.add(seq);
      else checkedHrcSeqs.delete(seq);
      if (typeof onReRender === 'function') onReRender(db);
      if (typeof onSelectionChange === 'function') onSelectionChange();
    });
  });

  if (hrcBar) {
    hrcBar.querySelectorAll('.hrc-use-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const useVal = chip.getAttribute('data-hrc-use');
        if (useVal === '__ALL__') {
          selectedHrcMainUses.clear();
        } else if (useVal) {
          if (selectedHrcMainUses.has(useVal)) {
            selectedHrcMainUses.delete(useVal);
          } else {
            selectedHrcMainUses.add(useVal);
          }
        }
        applyAutoCheckForSelectedUses();
        if (typeof onReRender === 'function') onReRender(db);
        if (typeof onSelectionChange === 'function') onSelectionChange();
      });
    });

    hrcBar.querySelectorAll('.hrc-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        checkedHrcSeqs.clear();
        visibleIndexed.forEach(r => {
          if (mode === 'visible_sel_uncompleted' && r.item.selectionType === '선정' && !r.done) checkedHrcSeqs.add(r.seq);
          else if (mode === 'visible_sel_all' && r.item.selectionType === '선정') checkedHrcSeqs.add(r.seq);
          else if (mode === 'visible_uncompleted' && !r.done) checkedHrcSeqs.add(r.seq);
        });
        if (typeof onReRender === 'function') onReRender(db);
        if (typeof onSelectionChange === 'function') onSelectionChange();
      });
    });

    const btnTopRun = document.getElementById('btn-hrc-top-batch-run');
    if (btnTopRun && typeof onTriggerBatchRun === 'function') {
      btnTopRun.addEventListener('click', () => onTriggerBatchRun('selected'));
    }
  }
}

export function renderHrcStep3MainUsePanel({
  db = [],
  panelEl = null,
  selectedHrcMainUses = new Set(),
  checkedHrcSeqs = new Set(),
  onSyncAll = null,
  onTriggerBatchRun = null
}) {
  if (!panelEl) return;
  if (!Array.isArray(db) || db.length === 0) {
    panelEl.classList.add('d-none');
    panelEl.innerHTML = '';
    return;
  }

  panelEl.classList.remove('d-none');
  const useStats = computeHrcMainUseStats(db);
  const indexedDb = db.map((item, idx) => ({
    item,
    seq: Number(item.index || item.seq || (idx + 1)),
    useName: getHrcItemMainUse(item),
    done: isHrcItemDone(item)
  }));

  const isAllUsesMode = (selectedHrcMainUses.size === 0);
  const actionableCheckedCount = indexedDb.filter(r => !r.done && checkedHrcSeqs.has(r.seq)).length;

  panelEl.innerHTML = `
    <div class="hrc-step3-use-panel">
      <div class="hrc-step3-use-header">
        <div>
          <div class="hrc-step3-use-title">
            <i class="fa-solid fa-layer-group text-primary-color"></i>
            <span>[주 용도]별 구분 선택 및 원클릭 배치 실행</span>
          </div>
          <div class="hrc-step3-use-sub">
            원하는 건물 <strong>[주 용도]</strong> 카드를 선택(복수 선택 가능)해 아래 배치 버튼으로 실행하거나, 각 용도 카드의 <strong>[이 용도만 바로 배치]</strong> 버튼으로 일일이 체크하지 않고 즉시 가동할 수 있습니다.
          </div>
        </div>
        <div class="metrix-slim-group">
          <button type="button" class="globalri-quick-check-btn" id="btn-hrc-step3-all-uses" style="${isAllUsesMode ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">
            전체 용도 미완료 선택
          </button>
          <button type="button" class="globalri-quick-check-btn" id="btn-hrc-step3-clear-uses" style="color:#64748b;">
            선택 초기화
          </button>
          <span class="badge-status ready font-bold" style="padding:4px 10px; font-size:12px;">
            현재 실행 대상: <strong>${actionableCheckedCount}건</strong>
          </span>
        </div>
      </div>

      <div class="hrc-step3-use-grid">
        ${useStats.map(st => {
          const isSelected = selectedHrcMainUses.has(st.useName);
          const runCount = st.selPending > 0 ? st.selPending : 0;
          const isDoneUse = (st.selTotal > 0 && st.selPending === 0);
          return `
            <div class="hrc-step3-use-card ${isSelected ? 'is-selected' : ''} ${isDoneUse ? 'is-done' : ''}" data-step3-use="${escapeHtml(st.useName)}">
              <div class="hrc-step3-use-card-top">
                <span class="hrc-step3-use-name">
                  <input
                    type="checkbox"
                    class="cb-hrc-step3-use"
                    data-step3-use="${escapeHtml(st.useName)}"
                    ${isSelected ? 'checked' : ''}
                    style="width:16px; height:16px; accent-color:#2563eb; cursor:pointer;"
                  />
                  <span>${escapeHtml(st.useName)}</span>
                </span>
                ${isDoneUse
                  ? `<span class="badge-status success font-bold" style="padding:2px 7px; font-size:11px;"><i class="fa-solid fa-check"></i> 완료</span>`
                  : `<span class="badge-status ready font-bold" style="padding:2px 7px; font-size:11px; color:#1d4ed8;">선정잔여 ${st.selPending}건</span>`}
              </div>
              <div class="hrc-step3-use-meta">
                <span>선정 완료 <strong>${st.selDone}/${st.selTotal}건</strong></span>
                <span>전체 표본 ${st.total}건</span>
              </div>
              <button
                type="button"
                class="btn-hrc-card-run"
                data-run-single-use="${escapeHtml(st.useName)}"
                data-has-targets="${runCount > 0 ? '1' : '0'}"
                ${runCount === 0 ? 'disabled' : ''}
                title="${runCount > 0 ? `${st.useName}의 미완료 선정 쿼터 ${runCount}건만 단독으로 배치 자동화를 시작합니다` : `${st.useName}의 선정 쿼터가 모두 완료되었습니다`}"
              >
                <i class="fa-solid ${runCount > 0 ? 'fa-bolt' : 'fa-check-double'}"></i>
                ${runCount > 0 ? `이 용도만 바로 배치 (${runCount}건)` : `선정 쿼터 완료 (${st.selDone}/${st.selTotal})`}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const syncCheckedFromSelectedUses = () => {
    checkedHrcSeqs.clear();
    const targetRows = (selectedHrcMainUses.size === 0)
      ? indexedDb
      : indexedDb.filter(r => selectedHrcMainUses.has(r.useName));
    targetRows.forEach(r => {
      if (r.item.selectionType === '선정' && !r.done) {
        checkedHrcSeqs.add(r.seq);
      }
    });
    if (typeof onSyncAll === 'function') onSyncAll();
  };

  panelEl.querySelectorAll('.hrc-step3-use-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-hrc-card-run')) return;
      const useName = card.getAttribute('data-step3-use');
      if (!useName) return;
      if (selectedHrcMainUses.has(useName)) {
        selectedHrcMainUses.delete(useName);
      } else {
        selectedHrcMainUses.add(useName);
      }
      syncCheckedFromSelectedUses();
    });
  });

  panelEl.querySelectorAll('.btn-hrc-card-run').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const useName = btn.getAttribute('data-run-single-use');
      if (!useName) return;
      selectedHrcMainUses.clear();
      selectedHrcMainUses.add(useName);
      checkedHrcSeqs.clear();
      indexedDb.forEach(r => {
        if (r.useName === useName && r.item.selectionType === '선정' && !r.done) {
          checkedHrcSeqs.add(r.seq);
        }
      });
      if (typeof onSyncAll === 'function') onSyncAll();
      if (typeof onTriggerBatchRun === 'function') onTriggerBatchRun('selected');
    });
  });

  const btnAllUses = panelEl.querySelector('#btn-hrc-step3-all-uses');
  if (btnAllUses) {
    btnAllUses.addEventListener('click', () => {
      selectedHrcMainUses.clear();
      syncCheckedFromSelectedUses();
    });
  }

  const btnClearUses = panelEl.querySelector('#btn-hrc-step3-clear-uses');
  if (btnClearUses) {
    btnClearUses.addEventListener('click', () => {
      selectedHrcMainUses.clear();
      checkedHrcSeqs.clear();
      if (typeof onSyncAll === 'function') onSyncAll();
    });
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

let currentMetrix622AccountFilter = 'all'; // 'all' | '강영미' | '김정례' | '노영미'
let currentMetrix622IndustryFilter = 'all'; // 'all' | 'ind_1' .. 'ind_9'

function resolveMetrix622IndustryKey(industryStr = '') {
  const s = String(industryStr).trim();
  if (s.startsWith('1.') || s.includes('제조')) return 'ind_1';
  if (s.startsWith('2.') || s.includes('건설')) return 'ind_2';
  if (s.startsWith('3.') || s.includes('도매') || s.includes('소매')) return 'ind_3';
  if (s.startsWith('5.') || s.includes('음식') || s.includes('주점')) return 'ind_5';
  if (s.startsWith('6.') || s.includes('전문') || s.includes('과학') || s.includes('기술')) return 'ind_6';
  if (s.startsWith('7.') || s.includes('교육')) return 'ind_7';
  if (s.startsWith('8.') || s.includes('예술') || s.includes('스포츠') || s.includes('여가')) return 'ind_8';
  if (s.startsWith('9.') || s.includes('수리') || s.includes('개인')) return 'ind_9';
  return 'ind_3';
}

const METRIX_622_IND_META = {
  ind_1: { short: '1.제조업', guide: '08~18시 · 원재료60%/인건비18% · 계좌이체70%' },
  ind_2: { short: '2.건설업', guide: '08~18시 · 원재료55%/인건비25% · 계좌이체75%' },
  ind_3: { short: '3.도소매업', guide: '09~20시 · 원재료62%/임차15% · 카드65%/지역화폐10%' },
  ind_5: { short: '5.음식·주점업', guide: '10~22시 · 배달앱ON · 원재료48%/인건비20% · 카드75%' },
  ind_6: { short: '6.전문·과학·기술', guide: '09~18시 · 인건비35%/임차18% · 계좌이체60%' },
  ind_7: { short: '7.교육서비스', guide: '13~21시 · 인건비30%/임차25% · 카드75%/지역화폐15%' },
  ind_8: { short: '8.예술·스포츠·여가', guide: '10~22시 · 원재료30%/임차28% · 카드70%' },
  ind_9: { short: '9.수리·개인서비스', guide: '10~20시 · 원재료40%/임차24% · 카드70%/지역화폐12%' }
};

export function renderMetrixQuotaTable({
  db,
  quotaTableBody,
  campId,
  googleSheetUrl,
  metrixPolicy = {},
  checkedMetrixSeqs = new Set(),
  onReRender,
  onSelectionChange,
  onTriggerBatchRun,
  onSyncMetrix622,
  onToggleClosedBiz
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let metrixBar = document.getElementById('metrix-622-step1-check-bar');
  if (!metrixBar && tableScrollContainer && tableScrollContainer.parentNode) {
    metrixBar = document.createElement('div');
    metrixBar.id = 'metrix-622-step1-check-bar';
    metrixBar.className = 'metrix-slim-toolbar';
    tableScrollContainer.parentNode.insertBefore(metrixBar, tableScrollContainer);
  } else if (metrixBar) {
    metrixBar.className = 'metrix-slim-toolbar';
  }

  const getAcc = (it) => String(it.surveyorId || it.loginId || '강영미').trim();
  const getIndKey = (it) => it.industryKey || resolveMetrix622IndustryKey(it.industry);
  const isOverQuota = (it) => String(it.status || '').includes('인원초과') || String(it.rawMeta?.COMPLETE || '').toUpperCase() === 'OVER';
  const isClosed = (it) => Boolean(it.isClosedBiz || String(it.bizStatus || '').includes('폐업') || it.quotaStatus === 'excluded' || isOverQuota(it));
  const isDone = (it) => (it.quotaStatus === 'completed' || it.status === '완료' || String(it.status || '').includes('완료(100%)'));
  const isWait98 = (it) => (it.quotaStatus === '진행중(98%)' || /98%|99%/.test(String(it.quotaStatus || '')) || /98%|99%/.test(String(it.status || '')));

  const baseAccounts = ['강영미', '김정례', '노영미', '송춘희', '지연옥'];
  const accCountMap = new Map(baseAccounts.map(a => [a, 0]));
  db.forEach(it => {
    const a = getAcc(it);
    accCountMap.set(a, (accCountMap.get(a) || 0) + 1);
  });
  const orderedAccounts = Array.from(accCountMap.keys()).filter(a => (accCountMap.get(a) || 0) > 0 || baseAccounts.includes(a));

  const closedItems = db.filter(it => isClosed(it));
  const wait98Items = db.filter(it => !isClosed(it) && isWait98(it));
  const completedItems = db.filter(it => !isClosed(it) && isDone(it));
  const uncompletedActive = db.filter(it => !isClosed(it) && !isDone(it) && !isWait98(it));
  const phoneChangedItems = db.filter(it => !isClosed(it) && Boolean(it.excelPhone && it.excelPhone !== it.serverPhone));
  const checkedCount = checkedMetrixSeqs.size;

  const visibleDb = db.filter(it => {
    if (currentMetrix622AccountFilter !== 'all' && getAcc(it) !== currentMetrix622AccountFilter) return false;
    if (currentMetrix622IndustryFilter !== 'all' && getIndKey(it) !== currentMetrix622IndustryFilter) return false;
    return true;
  });

  const sheetHref = googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit?gid=1453131911#gid=1453131911';

  const indCounts = {};
  Object.keys(METRIX_622_IND_META).forEach(k => { indCounts[k] = 0; });
  db.forEach(it => {
    const ik = getIndKey(it);
    indCounts[ik] = (indCounts[ik] || 0) + 1;
  });

  if (metrixBar) {
    metrixBar.style.display = 'flex';
    metrixBar.innerHTML = `
      <div class="metrix-slim-row">
        <div class="metrix-slim-group">
          <span class="metrix-slim-label"><i class="fa-solid fa-user-check text-primary-color"></i> 계정:</span>
          <button type="button" class="globalri-quick-check-btn metrix-acc-filter-btn ${currentMetrix622AccountFilter === 'all' ? 'active' : ''}" data-acc-filter="all" style="${currentMetrix622AccountFilter === 'all' ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">전체 (${db.length})</button>
          ${orderedAccounts.map(accName => `
            <button type="button" class="globalri-quick-check-btn metrix-acc-filter-btn ${currentMetrix622AccountFilter === accName ? 'active' : ''}" data-acc-filter="${escapeHtml(accName)}" style="${currentMetrix622AccountFilter === accName ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">${escapeHtml(accName)} (${accCountMap.get(accName) || 0})</button>
          `).join('')}

          <span class="metrix-slim-divider"></span>

          <select id="sel-metrix-ind-filter" class="metrix-filter-select" title="업종별 쿼터 행 필터">
            <option value="all" ${currentMetrix622IndustryFilter === 'all' ? 'selected' : ''}>전체 업종 (${db.length}건)</option>
            ${Object.entries(METRIX_622_IND_META).map(([ik, meta]) => `
              <option value="${ik}" ${currentMetrix622IndustryFilter === ik ? 'selected' : ''}>${escapeHtml(meta.short)} (${indCounts[ik] || 0}건)</option>
            `).join('')}
          </select>

          <span class="metrix-slim-divider"></span>

          <span class="metrix-slim-label">빠른선택:</span>
          <button type="button" class="globalri-quick-check-btn metrix-quick-check-btn" data-quick-check="visible_active" title="현재 화면에 표시된 계정·업종 필터 내 미완료 업체만 선택합니다">현재 필터 미완료 (${visibleDb.filter(it => !isClosed(it) && !isDone(it) && !isWait98(it)).length})</button>
          <button type="button" class="globalri-quick-check-btn metrix-quick-check-btn" data-quick-check="uncompleted_active" title="${orderedAccounts.length}개 계정 전체 미완료 업체를 모두 선택합니다">전체 미완료 (${uncompletedActive.length})</button>
          <button type="button" class="globalri-quick-check-btn metrix-quick-check-btn" data-quick-check="phone_changed">휴대폰 변경 (${phoneChangedItems.length})</button>
          <button type="button" class="globalri-quick-check-btn metrix-quick-check-btn" data-quick-check="wait_98">98~99% 대기 (${wait98Items.length})</button>
          <button type="button" class="globalri-quick-check-btn metrix-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
        </div>

        <div class="metrix-slim-group">
          <button type="button" id="btn-metrix-622-sync" class="btn-pill btn-pill-primary btn-pill-small font-bold" title="${orderedAccounts.length}계정(${orderedAccounts.join('·')}) + 구글시트 휴대폰 번호 + 국세청 사업자번호 휴폐업 상태를 동기화합니다">
            <i class="fa-solid fa-rotate"></i> ${orderedAccounts.length}계정·시트·폐업 동기화
          </button>
          <a href="${escapeHtml(sheetHref)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;" title="경기도 소상공인 쿼터 구글 스프레드시트 열기">
            <i class="fa-solid fa-table"></i> 쿼터 시트
          </a>
          <a href="https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit#gid=1267463010" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;" title="실행된 설문의 응답내역이 기록되는 구글 시트 열기">
            <i class="fa-solid fa-clipboard-check text-primary-color"></i> 응답 시트
          </a>
          ${campId ? `<a href="/api/campaigns/${encodeURIComponent(campId)}/gyeonggi-panel-answers-excel" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;" title="응답내역 엑셀(.xlsx) 다운로드">
            <i class="fa-solid fa-file-excel text-success-color"></i> 엑셀
          </a>` : ''}
        </div>
      </div>

      <div class="metrix-slim-row" style="padding-top: 8px; border-top: 1px solid #e2e8f0;">
        <span id="badge-metrix-checked-count" class="metrix-summary-text">
          <span>선택됨 <strong style="color:#16a34a;">${checkedCount}건</strong></span>
          <span>·</span>
          <span>미완료 대기 <strong>${uncompletedActive.length}건</strong></span>
          <span>·</span>
          <span>98~99% 검토대기 <strong>${wait98Items.length}건</strong></span>
          <span>·</span>
          <span>완료 <strong>${completedItems.length}건</strong></span>
          <span>·</span>
          <span>제외(폐업·인원초과) <strong>${closedItems.length}건</strong></span>
        </span>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" id="btn-metrix-622-top-batch-run" class="btn-pill ${checkedCount > 0 ? 'btn-pill-primary' : 'btn-pill-secondary'} btn-pill-small font-bold" style="${checkedCount > 0 ? 'background:#16a34a; border-color:#16a34a; color:#fff;' : ''}" title="체크박스로 선택한 사업체만 즉시 순차 자동설문을 실행합니다 (전체 배치를 돌리지 않음)">
            <i class="fa-solid fa-play"></i> ${checkedCount > 0 ? `선택 업체만 자동설문 실행 (${checkedCount}건)` : '실행할 업체를 체크하세요 (0건)'}
          </button>
          <a href="#section-execution" id="link-metrix-jump-exec" class="metrix-jump-exec-link">
            <i class="fa-solid fa-sliders"></i> STEP 3 실행 제어로 이동 ↓
          </a>
        </div>
      </div>
    `;
  }

  const defaultPwByAcc = { '강영미': '5254', '김정례': '3995', '노영미': '7791', '송춘희': '0307', '지연옥': '8336' };

  quotaTableBody.innerHTML = visibleDb.map((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const acc = getAcc(item);
    const accPw = item.surveyorPw || defaultPwByAcc[acc] || '5254';
    const overQuota = isOverQuota(item);
    const closed = isClosed(item);
    const done = isDone(item);
    const wait98 = isWait98(item);
    const isRowRunning = (item.quotaStatus === 'running' || item.status === '진행중');
    const isChecked = !closed && checkedMetrixSeqs.has(seq);

    let statusHtml = '<span class="badge-status ready">대기</span>';
    if (overQuota) {
      statusHtml = '<span class="badge-status error font-bold"><i class="fa-solid fa-ban"></i> 인원초과 제외</span>';
    } else if (closed) {
      statusHtml = '<span class="badge-status error font-bold"><i class="fa-solid fa-ban"></i> 입력제외 (폐업)</span>';
    } else if (done) {
      statusHtml = '<span class="badge-status success"><i class="fa-solid fa-check"></i> 완료</span>';
    } else if (isRowRunning) {
      statusHtml = '<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중</span>';
    } else if (wait98) {
      const waitLabel = String(item.status || '').includes('99%') ? '99% 검토대기' : '98% 검토대기';
      statusHtml = `<span class="badge-status warning font-bold" style="background: rgba(245, 158, 11, 0.18); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.45);"><i class="fa-solid fa-shield-halved"></i> ${waitLabel}</span>`;
    } else if (item.quotaStatus === 'pilot_done') {
      statusHtml = '<span class="badge-status pilot"><i class="fa-solid fa-flask"></i> 검증대기</span>';
    } else if (item.quotaStatus === 'error') {
      statusHtml = `<span class="badge-status error" title="${escapeHtml(item.error || '')}">오류</span>`;
    }

    const excelPhone = String(item.excelPhone || '').trim();
    const serverPhone = String(item.serverPhone || '').trim();
    const effectivePhone = excelPhone || serverPhone || String(item.phone || '').trim();
    const isPhoneDiff = Boolean(excelPhone && excelPhone !== serverPhone);
    const phoneBadgeHtml = isPhoneDiff
      ? `<span class="badge-status pilot font-mono" style="padding:1px 6px; font-size:10.5px;" title="컨택 팝업 진입 시 기존(${escapeHtml(serverPhone || '없음')}) ➔ 시트 번호(${escapeHtml(excelPhone)})로 자동 변경 후 [저장]합니다">시트변경 ➔ 저장대기</span>`
      : (excelPhone ? `<span class="badge-status success font-mono" style="padding:1px 6px; font-size:10.5px;">시트일치</span>` : `<span class="badge-status ready font-mono" style="padding:1px 6px; font-size:10.5px;">서버번호 유지</span>`);

    const bizStatusHtml = overQuota
      ? `<span class="badge-status warning font-bold" style="padding:2px 8px;"><i class="fa-solid fa-ban"></i> 인원초과 제외</span>`
      : (closed
        ? `<span class="badge-status error font-bold" style="padding:2px 8px;"><i class="fa-solid fa-circle-xmark"></i> 폐업 제외</span>`
        : `<span class="badge-status success font-bold" style="padding:2px 8px;" title="${escapeHtml(item.taxType || '부가가치세 일반과세자')}"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(item.bizStatus || '계속사업자')}</span>`);

    const ik = getIndKey(item);
    const indMeta = METRIX_622_IND_META[ik] || METRIX_622_IND_META.ind_3;
    const polInd = metrixPolicy?.industryPolicies?.[ik] || {};
    const indEnabled = (metrixPolicy?.useIndustryGuidelines !== false && polInd.enabled !== false);
    const guarRaw = String(item.guaranteeSupport || item.rawMeta?.['보증지원여부'] || '').trim().toUpperCase();
    const guarBadgeHtml = guarRaw === 'O'
      ? `<div style="margin-top:3px;"><span class="badge-status success font-mono" style="padding:1px 6px; font-size:10px;" title="엑셀 보증지원여부=O ➔ 문15-3 ④정책자금 체크 &amp; 문60 ③·④ 연동">보증 O (정책자금·문60③④)</span></div>`
      : (guarRaw === 'X'
        ? `<div style="margin-top:3px;"><span class="badge-status ready font-mono" style="padding:1px 6px; font-size:10px;" title="엑셀 보증지원여부=X ➔ 문15-3 ④제외 &amp; 문60 ①·② 연동">보증 X (문60①②)</span></div>`
        : '');
    const hasExcelLease = item.excelDeposit !== undefined || item.excelMonthlyRent !== undefined;
    const leaseBadgeHtml = hasExcelLease
      ? `<div style="margin-top:2px;"><span class="badge-status ready font-mono" style="padding:1px 6px; font-size:10px; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;" title="문16-1 임대차 보증금·월세 엑셀 자동 입력값">보증 ${escapeHtml(String(item.excelDeposit ?? 0))}만 / 월세 ${escapeHtml(String(item.excelMonthlyRent ?? 0))}만</span></div>`
      : '';
    const guideBadgeHtml = (item.guideApplied && item.guideSummary
      ? `<span class="badge-status pilot font-bold" style="padding:3px 8px; font-size:11px;" title="${escapeHtml(item.guideSummary)}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(item.guideSummary)}</span>`
      : (indEnabled
        ? `<span class="badge-status success" style="padding:3px 8px; font-size:11px;" title="${escapeHtml(indMeta.guide)}"><i class="fa-solid fa-sliders"></i> ${escapeHtml(indMeta.short)} 맞춤가이드</span>`
        : `<span class="badge-status ready" style="padding:3px 8px; font-size:11px;">공통 기본가이드</span>`)) + guarBadgeHtml + leaseBadgeHtml;

    const surveyUrlTag = item.surveyUrl
      ? `<a href="${escapeHtml(item.surveyUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="새 탭에서 설문 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i> 설문</a>`
      : '<span class="text-dim">미생성</span>';

    let actionBtnHtml = '';
    if (overQuota) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">인원초과 제외</button>`;
    } else if (closed) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">폐업 제외됨</button>`;
    } else if (done) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">완료됨</button>`;
    } else if (isRowRunning) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small" disabled><i class="fa-solid fa-spinner fa-spin"></i> 실행중</button>`;
    } else {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small btn-row-pilot-metrix" data-seq="${seq}" title="[${escapeHtml(acc)}] #${seq} ${escapeHtml(item.companyName || '')}: [컨택] 클릭 ➔ 휴대폰(${escapeHtml(effectivePhone || '-')}) 변경·[저장] ➔ [설문참여] ➔ 98~99% 안전 대기 실행">▷ 컨택·저장·98%</button>`;
    }

    const accBadgeClass = acc === '강영미' ? 'ready' : (acc === '김정례' ? 'pilot' : 'success');

    return `
      <tr data-row-idx="${seq}" class="${isChecked ? 'globalri-row-checked' : ''}" style="${closed ? 'opacity: 0.52; background: rgba(239, 68, 68, 0.05);' : ''}">
        <td class="text-center">
          <input type="checkbox" class="cb-metrix-quota-row" data-seq="${seq}" ${isChecked ? 'checked' : ''} ${(closed || done) ? 'disabled' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center">
          <span class="badge-status ${accBadgeClass} font-mono font-bold" style="padding: 3px 8px;" title="아이디: ${escapeHtml(acc)} / 비밀번호: ${escapeHtml(accPw)}">${escapeHtml(acc)} (${escapeHtml(accPw)})</span>
        </td>
        <td class="font-mono font-bold text-primary-color text-center">${escapeHtml(item.uid || '-')}</td>
        <td><strong>${escapeHtml(item.companyName || '-')}</strong></td>
        <td class="text-center">
          ${escapeHtml(item.ceoName || '-')}
          ${item.ceoGender ? `<div><span class="badge-gender ${item.ceoGender.includes('여') ? 'female' : 'male'}">${escapeHtml(item.ceoGender)}</span></div>` : ''}
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:3px;">
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="text" class="figma-input input-metrix-excel-phone font-mono" data-seq="${seq}" value="${escapeHtml(effectivePhone)}" placeholder="010-0000-0000" style="padding:3px 7px; font-size:12px; width:125px; height:26px;" title="컨택 팝업의 '휴대폰' 항목에 입력 후 [저장]할 번호" />
              ${phoneBadgeHtml}
            </div>
            ${serverPhone && serverPhone !== effectivePhone ? `<div class="font-caption text-dim" style="font-size:10.5px;">서버 기존: ${escapeHtml(serverPhone)}</div>` : ''}
          </div>
        </td>
        <td class="font-mono text-center">${escapeHtml(item.bizNumber || '-')}</td>
        <td class="text-center">
          <div style="display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap;">
            ${bizStatusHtml}
            <button type="button" class="btn-pill btn-pill-secondary btn-pill-small btn-metrix-toggle-closed" data-seq="${seq}" data-closed="${closed ? '1' : '0'}" style="padding:2px 6px; font-size:10.5px;" title="사업자번호 폐업 제외 상태를 수동으로 전환합니다">
              ${closed ? '제외해제' : '폐업제외'}
            </button>
          </div>
        </td>
        <td>
          <div><strong>${escapeHtml(item.industry || '-')}</strong></div>
          <div><span class="badge-main-product" style="font-size:10.5px;">${escapeHtml(item.bizCategory || '-')}</span></div>
        </td>
        <td class="text-center">${guideBadgeHtml}</td>
        <td title="${escapeHtml(item.fullAddress || item.address || '')}">
          <strong>[${escapeHtml(item.area || '-')}]</strong> ${escapeHtml(item.fullAddress || item.address || '-')}
        </td>
        <td class="text-center">${surveyUrlTag}</td>
        <td class="text-center">${statusHtml}</td>
        <td class="text-center">${actionBtnHtml}</td>
      </tr>
    `;
  }).join('');

  const selectableVisibleSeqs = visibleDb
    .filter(it => !isClosed(it) && !isDone(it) && !isWait98(it))
    .map(it => Number(it.index || it.seq));

  const updateCheckedBadges = () => {
    const cnt = checkedMetrixSeqs.size;
    const badgeEl = document.getElementById('badge-metrix-checked-count');
    if (badgeEl) {
      badgeEl.innerHTML = `
        <span>선택됨 <strong style="color:#16a34a;">${cnt}건</strong></span>
        <span>·</span>
        <span>미완료 대기 <strong>${uncompletedActive.length}건</strong></span>
        <span>·</span>
        <span>98~99% 검토대기 <strong>${wait98Items.length}건</strong></span>
        <span>·</span>
        <span>완료 <strong>${completedItems.length}건</strong></span>
        <span>·</span>
        <span>제외(폐업·인원초과) <strong>${closedItems.length}건</strong></span>
      `;
    }
    const topBtn = document.getElementById('btn-metrix-622-top-batch-run');
    if (topBtn) {
      topBtn.classList.toggle('btn-pill-primary', cnt > 0);
      topBtn.classList.toggle('btn-pill-secondary', cnt === 0);
      topBtn.style.background = cnt > 0 ? '#16a34a' : '';
      topBtn.style.borderColor = cnt > 0 ? '#16a34a' : '';
      topBtn.style.color = cnt > 0 ? '#fff' : '';
      topBtn.innerHTML = `<i class="fa-solid fa-play"></i> ${cnt > 0 ? `선택 업체만 자동설문 실행 (${cnt}건)` : '실행할 업체를 체크하세요 (0건)'}`;
    }
    const cbHeader = document.getElementById('cb-metrix-check-all');
    if (cbHeader) {
      cbHeader.checked = selectableVisibleSeqs.length > 0 && selectableVisibleSeqs.every(s => checkedMetrixSeqs.has(s));
    }
    if (typeof onSelectionChange === 'function') {
      onSelectionChange(checkedMetrixSeqs);
    }
  };

  const cbAll = document.getElementById('cb-metrix-check-all');
  if (cbAll) {
    cbAll.checked = selectableVisibleSeqs.length > 0 && selectableVisibleSeqs.every(s => checkedMetrixSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) selectableVisibleSeqs.forEach(s => checkedMetrixSeqs.add(s));
      else selectableVisibleSeqs.forEach(s => checkedMetrixSeqs.delete(s));
      if (typeof onSelectionChange === 'function') onSelectionChange(checkedMetrixSeqs);
      if (typeof onReRender === 'function') onReRender(db);
    };
  }

  quotaTableBody.querySelectorAll('.cb-metrix-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedMetrixSeqs.add(seq);
      else checkedMetrixSeqs.delete(seq);
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      updateCheckedBadges();
    });
  });

  quotaTableBody.querySelectorAll('.btn-metrix-toggle-closed').forEach(btn => {
    btn.addEventListener('click', async () => {
      const seq = Number(btn.getAttribute('data-seq'));
      const curClosed = btn.getAttribute('data-closed') === '1';
      if (curClosed === false) {
        checkedMetrixSeqs.delete(seq);
      }
      if (typeof onToggleClosedBiz === 'function') {
        await onToggleClosedBiz({ index: seq, isClosedBiz: !curClosed });
      }
    });
  });

  quotaTableBody.querySelectorAll('.input-metrix-excel-phone').forEach(inp => {
    inp.addEventListener('change', async () => {
      const seq = Number(inp.getAttribute('data-seq'));
      const newVal = inp.value.trim();
      if (typeof onToggleClosedBiz === 'function') {
        await onToggleClosedBiz({ index: seq, excelPhone: newVal });
      }
    });
  });

  if (metrixBar) {
    metrixBar.querySelectorAll('.metrix-acc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMetrix622AccountFilter = btn.getAttribute('data-acc-filter') || 'all';
        if (typeof onReRender === 'function') onReRender(db);
      });
    });

    const selIndFilter = document.getElementById('sel-metrix-ind-filter');
    if (selIndFilter) {
      selIndFilter.addEventListener('change', () => {
        currentMetrix622IndustryFilter = selIndFilter.value || 'all';
        if (typeof onReRender === 'function') onReRender(db);
      });
    }

    metrixBar.querySelectorAll('.metrix-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        checkedMetrixSeqs.clear();
        if (mode === 'uncompleted_active') {
          uncompletedActive.forEach(it => checkedMetrixSeqs.add(Number(it.index || it.seq)));
        } else if (mode === 'visible_active') {
          visibleDb.filter(it => !isClosed(it) && !isDone(it) && !isWait98(it)).forEach(it => checkedMetrixSeqs.add(Number(it.index || it.seq)));
        } else if (mode === 'phone_changed') {
          phoneChangedItems.forEach(it => checkedMetrixSeqs.add(Number(it.index || it.seq)));
        } else if (mode === 'wait_98') {
          wait98Items.forEach(it => checkedMetrixSeqs.add(Number(it.index || it.seq)));
        }
        if (typeof onSelectionChange === 'function') onSelectionChange(checkedMetrixSeqs);
        if (typeof onReRender === 'function') onReRender(db);
      });
    });

    const syncBtn = document.getElementById('btn-metrix-622-sync');
    if (syncBtn && typeof onSyncMetrix622 === 'function') {
      syncBtn.addEventListener('click', () => onSyncMetrix622(syncBtn));
    }

    const topBatchBtn = document.getElementById('btn-metrix-622-top-batch-run');
    if (topBatchBtn && typeof onTriggerBatchRun === 'function') {
      topBatchBtn.addEventListener('click', () => onTriggerBatchRun('selected'));
    }
  }
}

let currentSeoulAccountFilter = 'all'; // 'all' | '2010' | '2016'

export function renderMetrixSeoulQuotaTable({
  db,
  quotaTableBody,
  campId,
  googleSheetUrl,
  checkedSeoulSeqs,
  onReRender,
  onTriggerBatchRun,
  onSyncGoogleSheet
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let seoulBar = document.getElementById('seoul-panel-step1-check-bar');
  if (!seoulBar && tableScrollContainer && tableScrollContainer.parentNode) {
    seoulBar = document.createElement('div');
    seoulBar.id = 'seoul-panel-step1-check-bar';
    seoulBar.className = 'globalri-check-toolbar';
    tableScrollContainer.parentNode.insertBefore(seoulBar, tableScrollContainer);
  }

  const getAkey = (it) => String(it.accountKey || it.akey || (String(it.surveyUrl || '').includes('2016') ? '2016' : '2010'));
  const isItemDone = (it) => (it.quotaStatus === 'completed' || String(it.status || '').includes('완료(100%)') || it.status === '완료');
  const isItemWait99 = (it) => (it.quotaStatus === 'pilot_done' || String(it.status || '').includes('99%') || String(it.quotaStatus || '').includes('99%'));

  const list2010 = db.filter(it => getAkey(it) === '2010');
  const list2016 = db.filter(it => getAkey(it) === '2016');
  const uncompletedAll = db.filter(it => !isItemDone(it));
  const uncompleted2010 = list2010.filter(it => !isItemDone(it));
  const uncompleted2016 = list2016.filter(it => !isItemDone(it));
  const wait99Items = db.filter(it => isItemWait99(it));
  const completedItems = db.filter(it => isItemDone(it));
  const answeredItems = db.filter(it => it.submittedAnswers && Object.keys(it.submittedAnswers).length > 0);
  const checkedCount = checkedSeoulSeqs.size;

  const visibleDb = db.filter(it => {
    if (currentSeoulAccountFilter === '2010') return getAkey(it) === '2010';
    if (currentSeoulAccountFilter === '2016') return getAkey(it) === '2016';
    return true;
  });

  const sheetHref = googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=506086780#gid=506086780';

  if (seoulBar) {
    seoulBar.style.display = 'flex';
    seoulBar.style.flexDirection = 'column';
    seoulBar.style.gap = '10px';
    seoulBar.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; width: 100%;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 13px; font-weight: 800; color: #1e3a8a; margin-right: 4px;">
            <i class="fa-solid fa-id-card-clip text-primary-color"></i> 조사원 계정 필터:
          </span>
          <button type="button" class="globalri-quick-check-btn seoul-acc-filter-btn ${currentSeoulAccountFilter === 'all' ? 'active' : ''}" data-acc-filter="all" style="${currentSeoulAccountFilter === 'all' ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">전체 계정 (${db.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-acc-filter-btn ${currentSeoulAccountFilter === '2010' ? 'active' : ''}" data-acc-filter="2010" style="${currentSeoulAccountFilter === '2010' ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">2010 조사원_송준희 (${list2010.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-acc-filter-btn ${currentSeoulAccountFilter === '2016' ? 'active' : ''}" data-acc-filter="2016" style="${currentSeoulAccountFilter === '2016' ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : ''}">2016 조사원_정소영 (${list2016.length}건)</button>
          <span style="margin: 0 6px; color: #cbd5e1;">|</span>
          <span style="font-size: 13px; font-weight: 800; color: #1e3a8a; margin-right: 2px;">체크 선택:</span>
          <button type="button" class="globalri-quick-check-btn seoul-quick-check-btn" data-quick-check="uncompleted">미완료 전체 (${uncompletedAll.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-quick-check-btn" data-quick-check="acc_2010">2010 미완료 (${uncompleted2010.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-quick-check-btn" data-quick-check="acc_2016">2016 미완료 (${uncompleted2016.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-quick-check-btn" data-quick-check="wait_99">99% 대기건 (${wait99Items.length}건)</button>
          <button type="button" class="globalri-quick-check-btn seoul-quick-check-btn" data-quick-check="none" style="color: #64748b;">선택 해제</button>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span id="badge-seoul-checked-count" class="badge-status ready font-bold" style="padding: 5px 12px; font-size: 12.5px;">
            체크됨: <strong>${checkedCount}건</strong> · 99% 대기(svyA115): <strong>${wait99Items.length}건</strong> · 시트기록: <strong>${answeredItems.length}건</strong> · 완료: <strong>${completedItems.length}건</strong>
          </span>
          <a href="${escapeHtml(sheetHref)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;" title="서울시 소상공인 패널조사 응답 내역 구글 스프레드시트(시트2, gid=506086780) 열기">
            <i class="fa-solid fa-table"></i> 구글 스프레드시트 열기 (시트2)
          </a>
          <button type="button" id="btn-seoul-sync-gsheet" class="btn-pill btn-pill-primary btn-pill-small font-bold" title="현재까지 수집된 설문 응답 내용을 구글 스프레드시트(gid=506086780)에 즉시 반영합니다">
            <i class="fa-solid fa-cloud-arrow-up"></i> 구글 시트 즉시 동기화
          </button>
          <a href="/api/campaigns/${encodeURIComponent(campId)}/export-answers-xlsx" class="btn-pill btn-pill-secondary btn-pill-small font-bold" style="text-decoration:none;" title="응답 내역 엑셀(.xlsx) 다운로드">
            <i class="fa-solid fa-file-excel"></i> 엑셀(.xlsx) 다운로드
          </a>
          <button type="button" id="btn-seoul-top-batch-run" class="btn-pill btn-pill-success btn-pill-small font-bold">
            <i class="fa-solid fa-rocket"></i> 체크한 사업체 (${checkedCount}건) 99% 안전 대기 일괄 실행
          </button>
        </div>
      </div>
    `;
  }

  quotaTableBody.innerHTML = visibleDb.map((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    const akey = getAkey(item);
    const surveyorLabel = akey === '2016' ? '2016 정소영' : '2010 송준희';
    const isDone = isItemDone(item);
    const isWait99 = isItemWait99(item);
    const isRowRunning = (item.quotaStatus === 'running' || item.status === '진행중');
    const isChecked = checkedSeoulSeqs.has(seq);
    const ansCount = item.submittedAnswers ? Object.keys(item.submittedAnswers).length : 0;

    let statusHtml = `<span class="badge-status ready"><i class="fa-regular fa-clock"></i> ${escapeHtml(item.status || '미진행 대기')}</span>`;
    if (isDone) {
      statusHtml = `<span class="badge-status success"><i class="fa-solid fa-check-double"></i> 완료 (100%)</span>`;
    } else if (isRowRunning) {
      statusHtml = `<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중 (${escapeHtml(item.progressRate || '')})</span>`;
    } else if (isWait99) {
      statusHtml = `<span class="badge-status warning font-bold" style="background: rgba(245, 158, 11, 0.18); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.45);" title="svyA115.asp(개인정보 동의서 99%)에서 안전 정지 완료"><i class="fa-solid fa-shield-halved"></i> 99% 안전대기 (svyA115)</span>`;
    } else if (item.quotaStatus === 'error') {
      statusHtml = `<span class="badge-status error" title="${escapeHtml(item.error || '')}">오류</span>`;
    }

    const samplePanelStr = `${item.sampleType || '본표본'} · ${item.panelType || '유지'}`;
    const guaranteeBadge = (item.guaranteeStatus || '').includes('보증') && !(item.guaranteeStatus || '').includes('비보증')
      ? `<span class="badge-status success font-bold" style="padding:2px 8px;">보증</span>`
      : `<span class="badge-status ready" style="padding:2px 8px;">${escapeHtml(item.guaranteeStatus || '비보증')}</span>`;

    const surveyUrl = item.surveyUrl || `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${item.resid}&fwid=S21401by41s3${akey}`;
    const sheetBadge = ansCount > 0
      ? `<span class="badge-status success font-mono" style="padding:2px 7px; font-size:11px;" title="구글 스프레드시트에 ${ansCount}개 문항 응답이 기록됨"><i class="fa-solid fa-table-cells"></i> ${ansCount}항목</span>`
      : '';

    let actionBtnHtml = '';
    if (isDone) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small" disabled style="opacity:0.45; cursor:not-allowed;">참여완료</button>`;
    } else if (isRowRunning) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small" disabled><i class="fa-solid fa-spinner fa-spin"></i> 실행중</button>`;
    } else if (isWait99) {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-secondary btn-pill-small btn-row-pilot-seoul" data-seq="${seq}" title="${escapeHtml(item.companyName || '')} (resid=${escapeHtml(item.resid || '')}) svyA115(99%) 상태 재검증 및 시트 동기화">↻ 99% 재검증</button>`;
    } else {
      actionBtnHtml = `<button type="button" class="btn-pill btn-pill-primary btn-pill-small btn-row-pilot-seoul" data-seq="${seq}" title="${escapeHtml(item.companyName || '')} (resid=${escapeHtml(item.resid || '')}) svyA115(99%)까지 단건 안전 실행">▷ 99% 실행</button>`;
    }

    return `
      <tr data-row-idx="${seq}" class="${isChecked ? 'globalri-row-checked' : ''}">
        <td class="text-center">
          <input type="checkbox" class="cb-seoul-quota-row" data-seq="${seq}" ${isChecked ? 'checked' : ''} ${isDone ? 'disabled' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2563eb;" />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="text-center"><span class="badge-status ${akey === '2016' ? 'pilot' : 'ready'} font-mono font-bold" style="padding: 3px 8px;">${escapeHtml(surveyorLabel)}</span></td>
        <td class="text-center font-mono font-bold text-primary-color">${escapeHtml(item.resid || '-')}</td>
        <td class="text-center"><span class="badge-main-product">${escapeHtml(samplePanelStr)}</span></td>
        <td class="text-center">${guaranteeBadge}</td>
        <td><strong>${escapeHtml(item.companyName || '-')}</strong></td>
        <td>${escapeHtml(item.industry || '-')}</td>
        <td class="font-mono">${escapeHtml(item.bizNumber || '-')}</td>
        <td title="${escapeHtml(item.address || '')}">${escapeHtml(item.address || '-')}</td>
        <td class="font-mono">${escapeHtml(item.phone || item.mobile || '-')}</td>
        <td class="text-center"><span class="font-caption">${escapeHtml(item.contactResult || '-')}</span></td>
        <td class="text-center">
          <div style="display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap;">
            <a href="${escapeHtml(surveyUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small" title="새 탭에서 설문 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i> 설문</a>
            ${sheetBadge}
          </div>
        </td>
        <td class="text-center">${statusHtml}</td>
        <td class="text-center">${actionBtnHtml}</td>
      </tr>
    `;
  }).join('');

  const updateCheckedBadges = () => {
    const cnt = checkedSeoulSeqs.size;
    const badgeEl = document.getElementById('badge-seoul-checked-count');
    if (badgeEl) {
      badgeEl.innerHTML = `체크됨: <strong>${cnt}건</strong> · 99% 대기(svyA115): <strong>${wait99Items.length}건</strong> · 시트기록: <strong>${answeredItems.length}건</strong> · 완료: <strong>${completedItems.length}건</strong>`;
    }
    const batchBtn = document.getElementById('btn-seoul-top-batch-run');
    if (batchBtn) {
      batchBtn.innerHTML = `<i class="fa-solid fa-rocket"></i> 체크한 사업체 (${cnt}건) 99% 안전 대기 일괄 실행`;
    }
  };

  const cbAll = document.getElementById('cb-seoul-check-all');
  const selectableVisibleSeqs = visibleDb
    .filter(it => !isItemDone(it))
    .map(it => Number(it.index || it.seq));
  if (cbAll) {
    cbAll.checked = selectableVisibleSeqs.length > 0 && selectableVisibleSeqs.every(s => checkedSeoulSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) selectableVisibleSeqs.forEach(s => checkedSeoulSeqs.add(s));
      else selectableVisibleSeqs.forEach(s => checkedSeoulSeqs.delete(s));
      if (typeof onReRender === 'function') onReRender(db);
    };
  }

  quotaTableBody.querySelectorAll('.cb-seoul-quota-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedSeoulSeqs.add(seq);
      else checkedSeoulSeqs.delete(seq);
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('globalri-row-checked', cb.checked);
      updateCheckedBadges();
    });
  });

  if (seoulBar) {
    seoulBar.querySelectorAll('.seoul-acc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSeoulAccountFilter = btn.getAttribute('data-acc-filter') || 'all';
        if (typeof onReRender === 'function') onReRender(db);
      });
    });

    seoulBar.querySelectorAll('.seoul-quick-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-quick-check');
        checkedSeoulSeqs.clear();
        db.forEach((it, idx) => {
          const seq = Number(it.index || it.seq || (idx + 1));
          const akey = getAkey(it);
          const done = isItemDone(it);
          const wait99 = isItemWait99(it);
          if (done) return;
          if (mode === 'uncompleted') checkedSeoulSeqs.add(seq);
          else if (mode === 'acc_2010' && akey === '2010') checkedSeoulSeqs.add(seq);
          else if (mode === 'acc_2016' && akey === '2016') checkedSeoulSeqs.add(seq);
          else if (mode === 'wait_99' && wait99) checkedSeoulSeqs.add(seq);
        });
        if (typeof onReRender === 'function') onReRender(db);
      });
    });

    const btnSyncSheet = document.getElementById('btn-seoul-sync-gsheet');
    if (btnSyncSheet && typeof onSyncGoogleSheet === 'function') {
      btnSyncSheet.addEventListener('click', onSyncGoogleSheet);
    }

    const btnTopBatch = document.getElementById('btn-seoul-top-batch-run');
    if (btnTopBatch && typeof onTriggerBatchRun === 'function') {
      btnTopBatch.addEventListener('click', onTriggerBatchRun);
    }
  }
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

export function renderKmacKbpiQuotaTable({
  db = [],
  quotaTableBody,
  activeAxisId = 'gender_age',
  selectedSegments = new Set(),
  checkedKbpiSeqs = new Set(),
  onAxisChange = null,
  onReRender = null,
  onSelectionChange = null,
  onTriggerBatchRun = null,
  onScanBrands = null,
  onSyncFromSheet = null,
  onRunSingle = null,
  onToggleCategoryExp = null
}) {
  const tableScrollContainer = quotaTableBody.closest('.table-scroll-container');
  let kbpiBar = document.getElementById('kbpi-step1-segment-bar');
  if (!kbpiBar && tableScrollContainer && tableScrollContainer.parentNode) {
    kbpiBar = document.createElement('div');
    kbpiBar.id = 'kbpi-step1-segment-bar';
    kbpiBar.className = 'metrix-slim-toolbar kbpi-segment-toolbar';
    tableScrollContainer.parentNode.insertBefore(kbpiBar, tableScrollContainer);
  } else if (kbpiBar) {
    kbpiBar.classList.remove('d-none');
  }

  const axes = resolveSurveySegmentAxes('kmac_kbpi', db);
  const currentAxis = axes.find(a => a.id === activeAxisId) || axes[0];
  const segStats = computeSegmentStats({ db, surveyType: 'kmac_kbpi', axis: currentAxis });
  const validSegSet = new Set(segStats.map(s => s.segName));
  Array.from(selectedSegments).forEach(s => {
    if (!validSegSet.has(s)) selectedSegments.delete(s);
  });

  const indexedDb = db.map((item, idx) => ({
    item,
    seq: Number(item.index || item.seq || (idx + 1)),
    segName: currentAxis ? String(currentAxis.extractor(item, idx) || '기타').trim() : '전체',
    done: isQuotaItemDone(item, 'kmac_kbpi')
  }));

  const isAllMode = (selectedSegments.size === 0);
  const visibleIndexed = isAllMode
    ? indexedDb
    : indexedDb.filter(r => selectedSegments.has(r.segName));

  const actionableCheckedCount = indexedDb.filter(r => !r.done && checkedKbpiSeqs.has(r.seq)).length;
  const scannedTotalCount = db.filter(it => Array.isArray(it.categoryConfigs) && it.categoryConfigs.some(c => c && c.categoryName)).length;

  if (kbpiBar) {
    kbpiBar.innerHTML = `
      <div class="kbpi-bar-top-row">
        <div class="kbpi-bar-left">
          <span class="kbpi-bar-label"><i class="fa-solid fa-filter text-primary-color"></i> 구분자 필터:</span>
          <select id="sel-kbpi-step1-axis" class="figma-select seg-axis-select">
            ${axes.map(ax => `<option value="${escapeHtml(ax.id)}" ${ax.id === currentAxis.id ? 'selected' : ''}>${escapeHtml(ax.shortLabel)} 기준</option>`).join('')}
          </select>
          <button type="button" class="hrc-use-chip ${isAllMode ? 'is-active' : ''}" data-kbpi-seg="__ALL__">
            <span>전체</span>
            <span class="hrc-use-chip-count">${db.length}명 (스캔 ${scannedTotalCount})</span>
          </button>
          ${segStats.map(st => {
            const active = selectedSegments.has(st.segName);
            const doneCls = st.pending === 0 ? 'is-all-done' : '';
            return `
              <button type="button" class="hrc-use-chip ${active ? 'is-active' : ''} ${doneCls}" data-kbpi-seg="${escapeHtml(st.segName)}">
                <span>${escapeHtml(st.segName)}</span>
                <span class="hrc-use-chip-count">${st.pending}/${st.total}</span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="kbpi-bar-right">
          <button
            type="button"
            class="btn-pill btn-pill-secondary btn-pill-small font-bold"
            id="btn-kbpi-step1-scan-brands"
            title="CAPI에 신상명세·조사구(노원구/남동구)를 등록하고 응답자별 출제 브랜드(약 18~20종)를 스캔하여 시트에 기록합니다"
          >
            <i class="fa-solid fa-barcode text-primary-color"></i>
            ${actionableCheckedCount > 0 ? `체크 대상(${actionableCheckedCount}명) 스캔` : '150명 신상등록 & 브랜드 스캔'}
          </button>
          <button type="button" class="btn-pill btn-pill-secondary btn-pill-small" id="btn-kbpi-step1-sync-sheet" title="구글 시트의 최신 배경변인 및 구입경험(있음/없음) 설정을 즉시 불러옵니다">
            <i class="fa-solid fa-arrows-rotate text-success-color"></i> 구글 시트 동기화
          </button>
          <button
            type="button"
            class="btn-pill btn-pill-primary btn-pill-small font-bold"
            id="btn-kbpi-top-batch-run"
            data-has-targets="${actionableCheckedCount > 0 ? '1' : '0'}"
            ${actionableCheckedCount === 0 ? 'disabled' : ''}
          >
            <i class="fa-solid fa-play"></i> 선택 구분 배치 실행 (${actionableCheckedCount}명)
          </button>
        </div>
      </div>
    `;
  }

  quotaTableBody.innerHTML = visibleIndexed.map(({ item, seq, done }) => {
    const isChecked = checkedKbpiSeqs.has(seq);
    const qs = item.quotaStatus || 'ready';
    let statusBadge = '<span class="badge-status ready">대기</span>';
    if (qs === 'running') {
      statusBadge = '<span class="badge-status running"><i class="fa-solid fa-spinner fa-spin"></i> 진행중</span>';
    } else if (qs === 'completed' || item.status === '완료') {
      statusBadge = '<span class="badge-status completed">완료 (100%)</span>';
    } else if (qs === 'scanned' || String(item.status || '').includes('스캔완료')) {
      statusBadge = '<span class="badge-status kbpi-scanned"><i class="fa-solid fa-barcode"></i> 신상등록·스캔완료</span>';
    } else if (qs === 'pilot_done') {
      statusBadge = `<span class="badge-status pilot">${escapeHtml(item.status || '완료직전 대기')}</span>`;
    } else if (qs === 'error') {
      statusBadge = `<span class="badge-status error" title="${escapeHtml(item.lastScanError || item.error || '')}">오류</span>`;
    }

    const phoneStr = String(item.phone || '-');
    const isMobile = phoneStr.startsWith('010');
    const phoneBadge = isMobile
      ? '<span class="kbpi-phone-tag is-mobile">휴대폰</span>'
      : '<span class="kbpi-phone-tag is-landline">일반전화</span>';

    const distStr = item.surveyDistrict || (String(item.region || '').includes('인천') ? '남동구' : '노원구');
    const dongStr = item.surveyDong || '';

    const eduStr = item.education || '-';
    const jobStr = item.job || '-';
    const incStr = item.householdIncome || '-';
    const marStr = item.maritalStatus || '-';
    const famStr = item.familySize !== undefined && item.familySize !== '' ? `가족 ${item.familySize}명` : '가족 -';
    const childStr = (Number(item.familySize) === 1)
      ? '자녀 해당없음(1인가구)'
      : (item.childrenCount !== undefined && item.childrenCount !== '' ? `자녀 ${item.childrenCount}명` : '자녀 0명');

    const cfgs = Array.isArray(item.categoryConfigs) ? item.categoryConfigs : [];
    const filledCfgs = cfgs.filter(c => c && (c.categoryName || c.purchaseExp));
    const scannedNamedCount = filledCfgs.filter(c => c.categoryName).length;
    const yesCnt = filledCfgs.filter(c => (c.purchaseExp || '있음') === '있음').length;
    const noneCnt = filledCfgs.filter(c => c.purchaseExp === '없음').length;

    const summaryHead = scannedNamedCount > 0
      ? `<div class="kbpi-row-scan-summary">스캔 <strong>${scannedNamedCount}종</strong> · <span class="kbpi-stat-yes">있음 ${yesCnt}</span> / <span class="kbpi-stat-none">없음 ${noneCnt}</span></div>`
      : '';

    const catChipsHtml = filledCfgs.length > 0
      ? summaryHead + `<div class="kbpi-cat-chip-wrap">` + filledCfgs.map(c => {
          const exp = c.purchaseExp || '있음';
          const cls = exp === '없음' ? 'is-none' : (exp === '있음' ? 'is-yes' : 'is-auto');
          const label = c.categoryName ? `${c.slot}.${c.categoryName}: ${exp}` : `품목${c.slot}: ${exp}`;
          return `<button type="button" class="kbpi-cat-exp-chip ${cls}" data-seq="${seq}" data-slot="${c.slot}" title="클릭하여 구입경험 전환 (있음 ⇄ 없음)">${escapeHtml(label)}</button>`;
        }).join(' ') + `</div>`
      : '<span class="font-caption text-dim">상단 [신상등록 &amp; 브랜드 스캔] 실행 시 출제 전 품목 표시</span>';

    return `
      <tr class="${isChecked ? 'globalri-row-checked' : ''}" data-row-idx="${seq}">
        <td class="text-center">
          <input type="checkbox" class="cb-kbpi-row seg-card-checkbox" data-seq="${seq}" ${isChecked ? 'checked' : ''} ${done ? 'disabled' : ''} />
        </td>
        <td class="text-center font-mono font-bold">${seq}</td>
        <td class="font-mono">
          <div><strong>#${escapeHtml(item.finalId || '-')}</strong></div>
          <div class="font-caption text-dim">${escapeHtml(item.uid || '-')}</div>
        </td>
        <td>
          <div><strong>${escapeHtml(item.region || '-')}</strong> · <span class="kbpi-district-badge">${escapeHtml(distStr)} ${escapeHtml(dongStr)}</span></div>
          <div class="font-caption font-mono text-dim">${escapeHtml(String(item.latitude || ''))}, ${escapeHtml(String(item.longitude || ''))}</div>
        </td>
        <td>
          <span class="quota-ind-badge">${escapeHtml(item.gender || '-')} · ${escapeHtml(item.ageGroup || '-')}</span>
          <div class="font-caption font-bold mt-2">만 ${escapeHtml(String(item.age || '-'))}세</div>
        </td>
        <td>
          <div><strong>${escapeHtml(item.name || item.ceoName || '-')}</strong> ${phoneBadge}</div>
          <div class="font-mono font-caption">${escapeHtml(phoneStr)}</div>
        </td>
        <td>
          <div class="kbpi-demo-line"><strong>${escapeHtml(eduStr)}</strong> · ${escapeHtml(jobStr)} · <span class="kbpi-income-tag">${escapeHtml(incStr)}</span></div>
          <div class="kbpi-demo-sub">${escapeHtml(marStr)} · ${escapeHtml(famStr)} · ${escapeHtml(childStr)}</div>
        </td>
        <td class="kbpi-td-brands">${catChipsHtml}</td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center">
          <button type="button" class="btn-pill btn-pill-secondary btn-pill-small btn-kbpi-run-single" data-seq="${seq}" ${qs === 'running' ? 'disabled' : ''}>
            <i class="fa-solid fa-flask"></i> 단건검증
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const syncCheckedBySegments = () => {
    checkedKbpiSeqs.clear();
    if (selectedSegments.size === 0) return;
    indexedDb.forEach(r => {
      if (!r.done && selectedSegments.has(r.segName)) {
        checkedKbpiSeqs.add(r.seq);
      }
    });
  };

  const cbAll = document.getElementById('cb-kbpi-check-all');
  const visiblePendingSeqs = visibleIndexed.filter(r => !r.done).map(r => r.seq);
  if (cbAll) {
    cbAll.checked = visiblePendingSeqs.length > 0 && visiblePendingSeqs.every(s => checkedKbpiSeqs.has(s));
    cbAll.onchange = () => {
      if (cbAll.checked) visiblePendingSeqs.forEach(s => checkedKbpiSeqs.add(s));
      else visiblePendingSeqs.forEach(s => checkedKbpiSeqs.delete(s));
      if (typeof onReRender === 'function') onReRender(db);
      if (typeof onSelectionChange === 'function') onSelectionChange();
    };
  }

  quotaTableBody.querySelectorAll('.cb-kbpi-row').forEach(cb => {
    cb.addEventListener('change', () => {
      const seq = Number(cb.getAttribute('data-seq'));
      if (cb.checked) checkedKbpiSeqs.add(seq);
      else checkedKbpiSeqs.delete(seq);
      if (typeof onReRender === 'function') onReRender(db);
      if (typeof onSelectionChange === 'function') onSelectionChange();
    });
  });

  quotaTableBody.querySelectorAll('.btn-kbpi-run-single').forEach(btn => {
    btn.addEventListener('click', () => {
      const seq = Number(btn.getAttribute('data-seq'));
      if (seq && typeof onRunSingle === 'function') onRunSingle(seq);
    });
  });

  quotaTableBody.querySelectorAll('.kbpi-cat-exp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const seq = Number(chip.getAttribute('data-seq'));
      const slot = Number(chip.getAttribute('data-slot'));
      if (seq && slot && typeof onToggleCategoryExp === 'function') {
        onToggleCategoryExp(seq, slot);
      }
    });
  });

  if (kbpiBar) {
    const axisSel = kbpiBar.querySelector('#sel-kbpi-step1-axis');
    if (axisSel) {
      axisSel.addEventListener('change', () => {
        selectedSegments.clear();
        checkedKbpiSeqs.clear();
        if (typeof onAxisChange === 'function') onAxisChange(axisSel.value);
      });
    }

    kbpiBar.querySelectorAll('[data-kbpi-seg]').forEach(chip => {
      chip.addEventListener('click', () => {
        const seg = chip.getAttribute('data-kbpi-seg');
        if (seg === '__ALL__') {
          selectedSegments.clear();
          checkedKbpiSeqs.clear();
        } else if (seg) {
          if (selectedSegments.has(seg)) selectedSegments.delete(seg);
          else selectedSegments.add(seg);
          syncCheckedBySegments();
        }
        if (typeof onReRender === 'function') onReRender(db);
        if (typeof onSelectionChange === 'function') onSelectionChange();
      });
    });

    const btnScan = kbpiBar.querySelector('#btn-kbpi-step1-scan-brands');
    if (btnScan && typeof onScanBrands === 'function') {
      btnScan.addEventListener('click', () => {
        onScanBrands({ onlySelected: actionableCheckedCount > 0 });
      });
    }

    const btnSync = kbpiBar.querySelector('#btn-kbpi-step1-sync-sheet');
    if (btnSync && typeof onSyncFromSheet === 'function') {
      btnSync.addEventListener('click', () => onSyncFromSheet());
    }

    const btnTopRun = kbpiBar.querySelector('#btn-kbpi-top-batch-run');
    if (btnTopRun && typeof onTriggerBatchRun === 'function') {
      btnTopRun.addEventListener('click', () => onTriggerBatchRun('selected'));
    }
  }
}



