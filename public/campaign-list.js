/**
 * 메인 목차 대시보드 - 캠페인 목록 및 조사 쿼터 보관함 통합 제어 스크립트
 * - 카테고리 정밀 분류 (전통시장 / 상인회 / 소상공인 / 특수·국가조사)
 * - 완료 항목 분리 + 당일(오늘) 완료 건 상단 메인 노출 유지 + 이전 완료 건 하단 접이식 보관함(Archive)
 * - 카드형(Grid) ⇄ 리스트형(Compact Table) 뷰 전환, 정렬, 페이지네이션(더보기)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 0. 공통 날짜(KST 당일 판별) 및 포맷 헬퍼
  // ------------------------------------------------------------------------
  function getKstDateString(dateInput) {
    if (!dateInput) return '';
    try {
      const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (_) {
      return '';
    }
  }

  function isCompletedOnToday(dateInput) {
    if (!dateInput) return false;
    const targetDay = getKstDateString(dateInput);
    if (!targetDay) return false;
    const todayDay = getKstDateString(new Date());
    return targetDay === todayDay;
  }

  function formatShortDate(dateInput) {
    if (!dateInput) return '-';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('ko-KR');
    } catch (_) {
      return '-';
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightQuery(text, query) {
    if (!query || !query.trim()) return text;
    const safeQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeQ})`, 'gi');
    return text.replace(regex, '<mark class="search-match-highlight">$1</mark>');
  }

  // ------------------------------------------------------------------------
  // 1. 탭 네비게이션 & 뷰 전환 (캠페인 목록 vs 조사 쿼터 보관함)
  // ------------------------------------------------------------------------
  const tabNavCampaigns = document.getElementById('tab-nav-campaigns');
  const tabNavQuotas = document.getElementById('tab-nav-quotas');
  const sectionCampaigns = document.getElementById('section-campaigns');
  const sectionQuotas = document.getElementById('section-quotas');

  function switchTab(tabKey) {
    if (tabKey === 'quotas') {
      tabNavCampaigns.classList.remove('active');
      tabNavQuotas.classList.add('active');
      sectionCampaigns.classList.add('hidden');
      sectionQuotas.classList.remove('hidden');
      loadQuotas();
    } else {
      tabNavQuotas.classList.remove('active');
      tabNavCampaigns.classList.add('active');
      sectionQuotas.classList.add('hidden');
      sectionCampaigns.classList.remove('hidden');
      loadCampaigns();
    }
  }

  if (tabNavCampaigns) {
    tabNavCampaigns.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'campaigns';
      switchTab('campaigns');
    });
  }

  if (tabNavQuotas) {
    tabNavQuotas.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'quotas';
      switchTab('quotas');
    });
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'quotas') switchTab('quotas');
    else switchTab('campaigns');
  });

  // ------------------------------------------------------------------------
  // 2. 설문 캠페인 관리 (카테고리 필터 / 당일완료 유지 & 보관함 / 뷰전환 / 정렬)
  // ------------------------------------------------------------------------
  const campaignContainer = document.getElementById('campaign-list-container');
  const campaignArchiveSection = document.getElementById('campaign-archive-section');
  const btnOpenModal = document.getElementById('btn-open-new-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modal = document.getElementById('modal-new-campaign');
  const formNew = document.getElementById('form-new-campaign');

  const statTotal = document.getElementById('stat-total-campaigns');
  const statB2b = document.getElementById('stat-b2b-campaigns');
  const statB2c = document.getElementById('stat-b2c-campaigns');
  const statCompleted = document.getElementById('stat-completed-campaigns');

  // 카테고리 필터 탭 & 뱃지
  const filterCatPills = document.querySelectorAll('.filter-tab-pill:not(.quota-filter-tab-pill)');
  const badgeFilterAll = document.getElementById('badge-filter-all');
  const badgeFilterTraditional = document.getElementById('badge-filter-traditional');
  const badgeFilterAssoc = document.getElementById('badge-filter-assoc');
  const badgeFilterSmallbiz = document.getElementById('badge-filter-smallbiz');
  const badgeFilterSpecial = document.getElementById('badge-filter-special');

  // 상태 필터, 정렬, 뷰 전환, 검색 요소
  const statusChips = document.querySelectorAll('.status-chip:not(.quota-mode-chip):not(.quota-status-chip)');
  const selectCampaignSort = document.getElementById('select-campaign-sort');
  const viewToggleBtns = document.querySelectorAll('#campaign-view-toggle .view-toggle-btn');
  const inputSearch = document.getElementById('input-campaign-search');
  const btnClearSearch = document.getElementById('btn-clear-campaign-search');
  const autocompleteDropdown = document.getElementById('campaign-autocomplete-dropdown');
  const filterStatusInfoBar = document.getElementById('filter-status-info-bar');
  const filterInfoLabel = document.getElementById('filter-info-label');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  const PAGE_SIZE = 24;
  let allCampaigns = [];
  let currentCategory = 'all';     // 'all' | 'traditional' | 'assoc' | 'smallbiz' | 'special'
  let currentStatus = 'all';       // 'all' (진행+오늘완료 상단 / 이전완료 보관함) | 'active' | 'completed'
  let currentSort = 'priority';    // 'priority' | 'newest' | 'name' | 'count'
  let currentViewMode = 'grid';    // 'grid' | 'list'
  let currentSearchQuery = '';
  let selectedAutocompleteIdx = -1;

  let mainVisibleLimit = PAGE_SIZE;
  let archiveExpanded = false;
  let archiveVisibleLimit = PAGE_SIZE;

  // 캠페인 카테고리 판별 (surveyType 1순위 매칭으로 '소상공인' 문구 오분류 원천 차단)
  function getCampaignCategory(c) {
    const type = String(c.surveyType || '').toLowerCase().trim();
    const title = String(c.title || '').toLowerCase();
    const desc = String(c.description || '').toLowerCase();

    // 1순위: surveyType 명시적 판별
    if (['hrc_energy', 'globalri_literacy', 'gallup_return_farm', 'kona_youth'].includes(type)) {
      return 'special';
    }
    if (type === 'metrix_panel') return 'smallbiz';
    if (type === 'kstat_assoc') return 'assoc';
    if (type === 'kstat_store') return 'traditional';

    // 2순위: surveyType이 비어있는 레거시 캠페인은 제목 중심으로 판별
    if (
      title.includes('에너지총조사') ||
      title.includes('문해능력') ||
      title.includes('문해력') ||
      title.includes('귀농') ||
      title.includes('청소년')
    ) {
      return 'special';
    }
    if (title.includes('상인회') || desc.includes('상인회 전용')) {
      return 'assoc';
    }
    if (title.includes('메트릭스') || title.includes('소상공인 사업체패널') || desc.includes('메트릭스')) {
      return 'smallbiz';
    }
    return 'traditional';
  }

  function getCategoryMeta(catKey, surveyType = '') {
    const sType = String(surveyType || '').toLowerCase();
    if (sType === 'globalri_literacy') {
      return { label: '제5차 성인문해능력조사', icon: 'fa-book-open-reader', class: 'special' };
    }
    if (sType === 'hrc_energy') {
      return { label: '에너지총조사 [건물]', icon: 'fa-bolt', class: 'special' };
    }
    if (sType === 'gallup_return_farm') {
      return { label: '귀농귀촌 실태조사', icon: 'fa-seedling', class: 'special' };
    }
    if (sType === 'kona_youth') {
      return { label: '화성 청소년 서베이', icon: 'fa-user-graduate', class: 'special' };
    }
    switch (catKey) {
      case 'special':
        return { label: '특수·국가조사', icon: 'fa-landmark-flag', class: 'special' };
      case 'smallbiz':
        return { label: '소상공인 패널', icon: 'fa-building-user', class: 'smallbiz' };
      case 'assoc':
        return { label: '상인회 실태', icon: 'fa-sitemap', class: 'assoc' };
      case 'traditional':
      default:
        return { label: '전통시장 점포', icon: 'fa-store', class: 'traditional' };
    }
  }

  // 캠페인 완료 시각 추출 및 당일 완료 여부 판별
  function getCampaignCompletionTimestamp(c) {
    if (c.status !== 'completed') return null;
    if (c.completedAt) return c.completedAt;
    if (Array.isArray(c.quotaDatabase) && c.quotaDatabase.length > 0) {
      let latestMs = 0;
      let latestIso = null;
      c.quotaDatabase.forEach(item => {
        const ts = item.completedAt || item.usedAt || item.updatedAt;
        if (ts) {
          const ms = new Date(ts).getTime();
          if (!isNaN(ms) && ms > latestMs) {
            latestMs = ms;
            latestIso = ts;
          }
        }
      });
      if (latestIso) return latestIso;
    }
    return c.updatedAt || c.createdAt || null;
  }

  function isCampaignCompletedToday(c) {
    if (c.status !== 'completed') return false;
    return isCompletedOnToday(getCampaignCompletionTimestamp(c));
  }

  // 정렬 헬퍼
  function sortCampaignList(list) {
    const arr = [...list];
    arr.sort((a, b) => {
      if (currentSort === 'name') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
      }
      if (currentSort === 'count') {
        const cntA = Array.isArray(a.quotaDatabase) ? a.quotaDatabase.length : 0;
        const cntB = Array.isArray(b.quotaDatabase) ? b.quotaDatabase.length : 0;
        if (cntB !== cntA) return cntB - cntA;
      }
      if (currentSort === 'priority') {
        // 1순위: running -> 2순위: building -> 3순위: ready(미완료) -> 4순위: 오늘완료 -> 5순위: 이전완료
        const rank = (c) => {
          if (c.status === 'running') return 1;
          if (c.status === 'building') return 2;
          if (c.status !== 'completed') return 3;
          if (isCampaignCompletedToday(c)) return 4;
          return 5;
        };
        const rA = rank(a);
        const rB = rank(b);
        if (rA !== rB) return rA - rB;
      }
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    return arr;
  }

  // 카테고리 + 검색어 기준 1차 필터링 (상태 분리는 이후 단계에서 처리)
  function getBaseFilteredCampaigns() {
    return allCampaigns.filter(c => {
      const cat = getCampaignCategory(c);
      if (currentCategory !== 'all' && cat !== currentCategory) {
        return false;
      }
      if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        const title = String(c.title || '').toLowerCase();
        const desc = String(c.description || '').toLowerCase();
        const id = String(c.id || '').toLowerCase();
        const catMeta = getCategoryMeta(cat, c.surveyType);
        const catName = catMeta.label.toLowerCase();
        if (!title.includes(q) && !desc.includes(q) && !id.includes(q) && !catName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  function updateCategoryCounts() {
    let countTraditional = 0;
    let countAssoc = 0;
    let countSmallbiz = 0;
    let countSpecial = 0;

    allCampaigns.forEach(c => {
      const cat = getCampaignCategory(c);
      if (cat === 'traditional') countTraditional++;
      else if (cat === 'assoc') countAssoc++;
      else if (cat === 'smallbiz') countSmallbiz++;
      else if (cat === 'special') countSpecial++;
    });

    if (badgeFilterAll) badgeFilterAll.textContent = allCampaigns.length;
    if (badgeFilterTraditional) badgeFilterTraditional.textContent = countTraditional;
    if (badgeFilterAssoc) badgeFilterAssoc.textContent = countAssoc;
    if (badgeFilterSmallbiz) badgeFilterSmallbiz.textContent = countSmallbiz;
    if (badgeFilterSpecial) badgeFilterSpecial.textContent = countSpecial;
  }

  // 캠페인 카드 메타 정보 계산 헬퍼
  function buildCampaignDisplayInfo(c) {
    const cat = getCampaignCategory(c);
    const sType = String(c.surveyType || '').toLowerCase();
    const isKona = (sType === 'kona_youth');
    const isHrcEnergy = (sType === 'hrc_energy');
    const isGlobalriLiteracy = (sType === 'globalri_literacy');
    const isGallupReturnFarm = (sType === 'gallup_return_farm');
    const isAssoc = (cat === 'assoc');
    const isSmallBiz = (cat === 'smallbiz');
    const isCompleted = (c.status === 'completed');
    const isTodayDone = isCampaignCompletedToday(c);
    const catMeta = getCategoryMeta(cat, sType);

    const dbCount = Array.isArray(c.quotaDatabase) ? c.quotaDatabase.length : 0;
    const selCount = isHrcEnergy
      ? (c.quotaDatabase || []).filter(q => q.selectionType === '선정').length
      : 0;
    const doneSelCount = isHrcEnergy
      ? (c.quotaDatabase || []).filter(q => q.selectionType === '선정' && (q.quotaStatus === 'completed' || q.status === '완료')).length
      : 0;
    const doneItemCount = (c.quotaDatabase || []).filter(q =>
      q.quotaStatus === 'completed' || q.quotaStatus === 'used' || q.status === '완료' || q.surveyCompleted === true || q.serverStatus === '99'
    ).length;

    let quotaLabel = '점포 경영실태 (17단계)';
    if (isGlobalriLiteracy) {
      quotaLabel = `대상자 ${dbCount}명 (완료 ${doneItemCount}명) · 연령대 가이드`;
    } else if (isHrcEnergy) {
      quotaLabel = `선정 ${selCount}건 (완료 ${doneSelCount}건) · 기입력 보존`;
    } else if (isGallupReturnFarm) {
      quotaLabel = `선정 ${dbCount}가구 (완료 ${doneItemCount}건) · GPS/전자서명`;
    } else if (isKona) {
      quotaLabel = '청소년 만족도 (40문항/53단계)';
    } else if (isAssoc) {
      quotaLabel = '상인회 실태조사 (24단계)';
    } else if (isSmallBiz) {
      quotaLabel = '소상공인 패널 (120단계)';
    } else if (c.quotaType === 'b2c') {
      quotaLabel = '개인 대상 (B2C)';
    }

    const quotaBadgeClass = (isKona || isGlobalriLiteracy || isGallupReturnFarm)
      ? 'b2c'
      : (isAssoc ? 'assoc' : 'b2b');
    const quotaIcon = isGlobalriLiteracy
      ? 'fa-book-open-reader'
      : (isHrcEnergy
        ? 'fa-building-circle-check'
        : (isGallupReturnFarm
          ? 'fa-tractor'
          : (isKona
            ? 'fa-user-graduate'
            : (isAssoc
              ? 'fa-sitemap'
              : (isSmallBiz ? 'fa-building-user' : 'fa-store')))));

    let statusText = '대기 중';
    let statusClass = 'ready';
    if (c.status === 'building') { statusText = '쿼터 DB 구축 중'; statusClass = 'building'; }
    else if (c.status === 'running') { statusText = '설문 자동화 진행 중'; statusClass = 'running'; }
    else if (isCompleted) { statusText = isTodayDone ? '오늘 마감 완료' : '조사 마감 완료'; statusClass = 'completed'; }

    const targetCount = isHrcEnergy
      ? (selCount || c.quotaConfig?.targetCount || dbCount)
      : (c.quotaConfig?.targetCount || (isKona ? 103 : (isAssoc ? 8 : (isSmallBiz ? 54 : Math.max(dbCount, 1)))));

    let quotaSummaryText = `${dbCount}개 점포 보유 / 목표 ${targetCount}개`;
    if (isHrcEnergy) {
      quotaSummaryText = `선정 ${selCount}건 (완료 ${doneSelCount}건) / 전체 ${dbCount}건`;
    } else if (isGlobalriLiteracy) {
      quotaSummaryText = `완료 ${doneItemCount}명 / 전체 ${dbCount}명`;
    } else if (isGallupReturnFarm) {
      quotaSummaryText = `완료 ${doneItemCount}가구 / 선정 ${dbCount}가구`;
    } else if (isKona) {
      quotaSummaryText = `${dbCount}명 명단 확보 / 전수 ${targetCount}명`;
    } else if (isAssoc) {
      quotaSummaryText = `${dbCount}개 시장 확보 / 완료 ${doneItemCount}개`;
    } else if (isSmallBiz) {
      quotaSummaryText = `${dbCount}개 패널 확보 / 전수 ${targetCount}개`;
    }

    const compTs = getCampaignCompletionTimestamp(c);
    const dateStr = formatShortDate(isCompleted ? (compTs || c.createdAt) : c.createdAt);
    const dateLabel = isCompleted ? '완료/갱신일' : '등록일';

    const defaultDesc = isHrcEnergy
      ? '한국리서치 TAPI(2026-89-0342C) 건물 부문 에너지총조사 · 기존 입력 항목 100% 보존'
      : (isGlobalriLiteracy
        ? '글로벌리서치 통합조사시스템(GIFT) 제5차 성인문해능력조사 · 연령대별 맞춤 가이드'
        : (isGallupReturnFarm
          ? '한국갤럽 G-CAII 2026년 귀농귀촌 실태조사 · 홍천군 GPS 및 8종 전자서명 자동화'
          : (isKona
            ? '화성특례시 만족도 청소년 설문조사 (코나체인 리서치 40문항)'
            : (isAssoc
              ? '전통시장 상인회 24단계 전년도 일치 미러링 및 2026 정책 가이드 설문'
              : (isSmallBiz
                ? '메트릭스 경기도 소상공인 54개 패널조사 자동화'
                : '전통시장 및 상점가 점포경영 실태조사 캠페인')))));

    return {
      cat,
      catMeta,
      isAssoc,
      isSmallBiz,
      isCompleted,
      isTodayDone,
      dbCount,
      doneItemCount,
      quotaLabel,
      quotaBadgeClass,
      quotaIcon,
      statusText,
      statusClass,
      quotaSummaryText,
      dateStr,
      dateLabel,
      descText: c.description || defaultDesc
    };
  }

  // 캠페인 카드(Grid) HTML 생성
  function renderCampaignCardsHtml(campaigns) {
    return campaigns.map(c => {
      const info = buildCampaignDisplayInfo(c);
      const cardClass = `campaign-card ${info.isAssoc ? 'assoc-card' : ''} ${info.isCompleted ? 'completed-card' : ''} ${info.isTodayDone ? 'completed-today-card' : ''}`;

      return `
        <div class="${cardClass}" data-id="${escapeHtml(c.id)}">
          <div>
            <div class="campaign-card-header">
              <div class="flex-center-gap-6 flex-wrap">
                <span class="badge-category ${info.catMeta.class}"><i class="fa-solid ${info.catMeta.icon}"></i> ${info.catMeta.label}</span>
                <span class="badge-quota-type ${info.quotaBadgeClass}"><i class="fa-solid ${info.quotaIcon}"></i> ${info.quotaLabel}</span>
              </div>
              <div class="flex-center-gap-6">
                ${info.isTodayDone ? '<span class="badge-completed-today"><i class="fa-solid fa-wand-magic-sparkles"></i> 오늘 완료</span>' : (info.isCompleted ? '<span class="completed-stamp-badge"><i class="fa-solid fa-check-double"></i> 100% 완료</span>' : '')}
                <span class="badge-status ${info.statusClass}">${info.isCompleted ? '<i class="fa-solid fa-circle-check"></i> ' : ''}${info.statusText}</span>
              </div>
            </div>
            <h3 class="campaign-title">
              ${info.isCompleted ? '<i class="fa-solid fa-circle-check text-success-sm"></i>' : ''}
              ${highlightQuery(escapeHtml(c.title || '무제 캠페인'), currentSearchQuery)}
            </h3>
            <p class="campaign-desc">
              ${highlightQuery(escapeHtml(info.descText), currentSearchQuery)}
            </p>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>조사 쿼터 DB</span>
                <strong class="${info.isCompleted ? 'completed-stat' : ''}">
                  ${info.isCompleted ? '<i class="fa-solid fa-check text-success"></i> ' : ''}
                  ${escapeHtml(info.quotaSummaryText)}
                </strong>
              </div>
              <div class="meta-item">
                <span>${info.dateLabel}</span>
                <strong>${info.dateStr}</strong>
              </div>
            </div>

            <div class="campaign-card-footer">
              ${info.isCompleted
                ? `<a href="survey-detail.html?id=${encodeURIComponent(c.id)}" class="btn-pill btn-pill-completed"><i class="fa-solid fa-clipboard-check"></i> 결과 및 작업실 열람 <i class="fa-solid fa-arrow-right"></i></a>`
                : `<a href="survey-detail.html?id=${encodeURIComponent(c.id)}" class="btn-pill btn-pill-primary btn-enter-room">설문 작업실 입장 <i class="fa-solid fa-arrow-right"></i></a>`}
              <button type="button" class="btn-icon-circle btn-delete" data-id="${escapeHtml(c.id)}" title="캠페인 삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 캠페인 컴팩트 리스트(Table) HTML 생성
  function renderCampaignTableHtml(campaigns) {
    return `
      <div class="compact-list-table-wrap">
        <table class="compact-list-table">
          <thead>
            <tr>
              <th class="col-cat">카테고리</th>
              <th class="col-title">설문 캠페인명</th>
              <th class="col-quota">조사 쿼터 현황</th>
              <th class="col-status">진행 상태</th>
              <th class="col-date">일자</th>
              <th class="col-actions">관리</th>
            </tr>
          </thead>
          <tbody>
            ${campaigns.map(c => {
              const info = buildCampaignDisplayInfo(c);
              return `
                <tr class="${info.isCompleted ? 'row-completed' : ''} ${info.isTodayDone ? 'row-completed-today' : ''}" data-id="${escapeHtml(c.id)}">
                  <td class="col-cat">
                    <span class="badge-category ${info.catMeta.class}"><i class="fa-solid ${info.catMeta.icon}"></i> ${info.catMeta.label}</span>
                  </td>
                  <td class="col-title">
                    <div class="compact-title-wrap">
                      <a href="survey-detail.html?id=${encodeURIComponent(c.id)}" class="compact-main-title">
                        ${info.isCompleted ? '<i class="fa-solid fa-circle-check text-success-sm"></i> ' : ''}
                        ${highlightQuery(escapeHtml(c.title || '무제 캠페인'), currentSearchQuery)}
                      </a>
                      <span class="compact-sub-desc">${highlightQuery(escapeHtml(info.descText), currentSearchQuery)}</span>
                    </div>
                  </td>
                  <td class="col-quota">
                    <span class="compact-quota-text">${escapeHtml(info.quotaSummaryText)}</span>
                  </td>
                  <td class="col-status">
                    <div class="flex-center-gap-6">
                      ${info.isTodayDone ? '<span class="badge-completed-today"><i class="fa-solid fa-wand-magic-sparkles"></i> 오늘 완료</span>' : ''}
                      <span class="badge-status ${info.statusClass}">${info.isCompleted ? '<i class="fa-solid fa-circle-check"></i> ' : ''}${info.statusText}</span>
                    </div>
                  </td>
                  <td class="col-date font-mono">${info.dateStr}</td>
                  <td class="col-actions">
                    <div class="compact-action-group">
                      <a href="survey-detail.html?id=${encodeURIComponent(c.id)}" class="btn-compact-open ${info.isCompleted ? 'is-completed' : ''}">
                        ${info.isCompleted ? '<i class="fa-solid fa-clipboard-check"></i> 열람' : '<i class="fa-solid fa-arrow-right"></i> 작업실'}
                      </a>
                      <button type="button" class="btn-icon-circle btn-delete" data-id="${escapeHtml(c.id)}" title="캠페인 삭제">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindCampaignDeleteButtons(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('정말로 이 설문 캠페인을 삭제하시겠습니까?')) {
          await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
          loadCampaigns();
        }
      });
    });
  }

  // 필터 적용 및 상단(진행+오늘완료) / 하단(이전완료 보관함) 분리 렌더링
  function applyFiltersAndRender() {
    const baseFiltered = sortCampaignList(getBaseFilteredCampaigns());

    let mainItems = [];
    let archiveItems = [];

    if (currentStatus === 'active') {
      // '진행·대기만' 선택 시 미완료 항목만 상단 표시
      mainItems = baseFiltered.filter(c => c.status !== 'completed');
      archiveItems = [];
    } else if (currentStatus === 'completed') {
      // '완료만' 선택 시 오늘완료 + 이전완료 전체를 상단 메인 영역에 바로 표시
      mainItems = baseFiltered.filter(c => c.status === 'completed');
      archiveItems = [];
    } else {
      // 기본 '전체 (진행+오늘완료)': 진행·대기중 + 오늘(당일) 완료된 건은 상단 메인에 노출, 어제 이전 완료 건은 하단 보관함으로 분리
      mainItems = baseFiltered.filter(c => c.status !== 'completed' || isCampaignCompletedToday(c));
      archiveItems = baseFiltered.filter(c => c.status === 'completed' && !isCampaignCompletedToday(c));
    }

    renderCampaignMainAndArchive(mainItems, archiveItems, baseFiltered.length);

    // 필터 활성화 상태 안내 스트립 동기화
    const isFiltered = (currentCategory !== 'all' || currentStatus !== 'all' || !!currentSearchQuery);
    if (filterStatusInfoBar) {
      if (isFiltered) {
        filterStatusInfoBar.classList.remove('d-none');
        const filterDesc = [];
        if (currentCategory !== 'all') {
          const catMeta = getCategoryMeta(currentCategory);
          filterDesc.push(`카테고리: ${catMeta.label}`);
        }
        if (currentStatus === 'completed') filterDesc.push('상태: 완료만');
        else if (currentStatus === 'active') filterDesc.push('상태: 진행·대기만');
        if (currentSearchQuery) filterDesc.push(`검색어: "${currentSearchQuery}"`);

        const totalShown = mainItems.length + archiveItems.length;
        if (filterInfoLabel) {
          filterInfoLabel.innerHTML = `필터 적용 결과: <strong>${totalShown}건</strong> (상단 ${mainItems.length}건${archiveItems.length > 0 ? ` + 보관함 ${archiveItems.length}건` : ''}) &nbsp;•&nbsp; <span class="text-dim">[${filterDesc.join(', ')}]</span>`;
        }
      } else {
        filterStatusInfoBar.classList.add('d-none');
      }
    }
  }

  function renderCampaignMainAndArchive(mainItems, archiveItems, totalMatchedCount) {
    if (!campaignContainer) return;

    if (allCampaigns.length === 0) {
      campaignContainer.className = 'campaign-grid';
      campaignContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-folder-open empty-state-icon"></i>
          <p class="empty-state-text">등록된 설문조사 캠페인이 없습니다.</p>
          <button class="btn-pill btn-pill-primary mt-14" onclick="document.getElementById('btn-open-new-modal').click()">
            <i class="fa-solid fa-plus"></i> 첫 번째 설문 캠페인 만들기
          </button>
        </div>
      `;
      if (campaignArchiveSection) campaignArchiveSection.classList.add('d-none');
      return;
    }

    if (totalMatchedCount === 0) {
      campaignContainer.className = 'campaign-grid';
      campaignContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-filter-circle-xmark empty-state-icon"></i>
          <p class="empty-state-text">선택하신 조건(카테고리/상태/검색어)에 일치하는 캠페인이 없습니다.</p>
          <button class="btn-pill btn-pill-secondary mt-14" id="btn-empty-reset-filters">
            <i class="fa-solid fa-rotate-left"></i> 필터 및 검색어 초기화
          </button>
        </div>
      `;
      const btnEmptyReset = document.getElementById('btn-empty-reset-filters');
      if (btnEmptyReset) btnEmptyReset.addEventListener('click', resetAllFilters);
      if (campaignArchiveSection) campaignArchiveSection.classList.add('d-none');
      return;
    }

    // 1. 상단 메인 목록 렌더링
    if (mainItems.length === 0 && archiveItems.length > 0) {
      campaignContainer.className = 'campaign-grid';
      campaignContainer.innerHTML = `
        <div class="empty-state empty-state-card empty-state-compact">
          <i class="fa-solid fa-circle-check text-success empty-state-icon-sm"></i>
          <p class="empty-state-text">현재 진행·대기 중이거나 오늘 완료된 캠페인이 없습니다. (이전 완료 <strong>${archiveItems.length}건</strong>은 아래 보관함에 정리되어 있습니다)</p>
        </div>
      `;
    } else {
      const slicedMain = mainItems.slice(0, mainVisibleLimit);
      const remainingMain = mainItems.length - slicedMain.length;

      if (currentViewMode === 'list') {
        campaignContainer.className = 'campaign-list-mode-container';
        campaignContainer.innerHTML = renderCampaignTableHtml(slicedMain);
      } else {
        campaignContainer.className = 'campaign-grid';
        campaignContainer.innerHTML = renderCampaignCardsHtml(slicedMain);
      }

      if (remainingMain > 0) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.className = 'load-more-bar';
        loadMoreWrap.innerHTML = `
          <button type="button" class="btn-load-more" id="btn-main-load-more">
            <i class="fa-solid fa-angles-down"></i> 캠페인 더보기 (+${Math.min(PAGE_SIZE, remainingMain)}건 / 남은 ${remainingMain}건)
          </button>
          <button type="button" class="btn-load-all" id="btn-main-load-all">
            전체 펼치기 (${mainItems.length}건)
          </button>
        `;
        campaignContainer.appendChild(loadMoreWrap);
        document.getElementById('btn-main-load-more')?.addEventListener('click', () => {
          mainVisibleLimit += PAGE_SIZE;
          applyFiltersAndRender();
        });
        document.getElementById('btn-main-load-all')?.addEventListener('click', () => {
          mainVisibleLimit = mainItems.length + 100;
          applyFiltersAndRender();
        });
      }

      bindCampaignDeleteButtons(campaignContainer);
    }

    // 2. 하단 완료 보관함 (당일 이전 완료 건) 아코디언 렌더링
    if (!campaignArchiveSection) return;
    if (archiveItems.length === 0) {
      campaignArchiveSection.classList.add('d-none');
      campaignArchiveSection.innerHTML = '';
      return;
    }

    campaignArchiveSection.classList.remove('d-none');
    const slicedArchive = archiveItems.slice(0, archiveVisibleLimit);
    const remainingArchive = archiveItems.length - slicedArchive.length;

    campaignArchiveSection.innerHTML = `
      <div class="completed-archive-card ${archiveExpanded ? 'is-expanded' : ''}">
        <button type="button" class="completed-archive-header" id="btn-toggle-campaign-archive">
          <div class="archive-header-left">
            <span class="archive-folder-icon"><i class="fa-solid ${archiveExpanded ? 'fa-folder-open' : 'fa-box-archive'}"></i></span>
            <div class="archive-title-group">
              <strong class="archive-title">완료된 설문 보관함 <span class="archive-count-pill">${archiveItems.length}건</span></strong>
              <span class="archive-subtitle">완료 당일 건은 상단 목록에 표시되며, 어제 이전에 100% 마감된 설문 캠페인이 이곳에 자동 정리됩니다.</span>
            </div>
          </div>
          <span class="archive-toggle-action">
            <span>${archiveExpanded ? '보관함 접기' : '목록 펼쳐보기'}</span>
            <i class="fa-solid fa-chevron-${archiveExpanded ? 'up' : 'down'}"></i>
          </span>
        </button>
        ${archiveExpanded ? `
          <div class="completed-archive-body">
            <div class="${currentViewMode === 'list' ? 'campaign-list-mode-container' : 'campaign-grid'}" id="campaign-archive-list-inner">
              ${currentViewMode === 'list' ? renderCampaignTableHtml(slicedArchive) : renderCampaignCardsHtml(slicedArchive)}
            </div>
            ${remainingArchive > 0 ? `
              <div class="load-more-bar mt-20">
                <button type="button" class="btn-load-more" id="btn-archive-load-more">
                  <i class="fa-solid fa-angles-down"></i> 이전 완료 캠페인 더보기 (+${Math.min(PAGE_SIZE, remainingArchive)}건 / 남은 ${remainingArchive}건)
                </button>
                <button type="button" class="btn-load-all" id="btn-archive-load-all">
                  보관함 전체 펼치기 (${archiveItems.length}건)
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btn-toggle-campaign-archive')?.addEventListener('click', () => {
      archiveExpanded = !archiveExpanded;
      applyFiltersAndRender();
    });
    document.getElementById('btn-archive-load-more')?.addEventListener('click', () => {
      archiveVisibleLimit += PAGE_SIZE;
      applyFiltersAndRender();
    });
    document.getElementById('btn-archive-load-all')?.addEventListener('click', () => {
      archiveVisibleLimit = archiveItems.length + 100;
      applyFiltersAndRender();
    });

    const archiveInner = document.getElementById('campaign-archive-list-inner');
    if (archiveInner) bindCampaignDeleteButtons(archiveInner);
  }

  // 모달 탭 스위칭 (B2B/B2C)
  const modalTabB2b = document.getElementById('modal-tab-b2b');
  const modalTabB2c = document.getElementById('modal-tab-b2c');
  const modalQuotaRadios = document.querySelectorAll('input[name="new-quota-type"]');

  modalQuotaRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'b2b') {
        modalTabB2b?.classList.add('active');
        modalTabB2c?.classList.remove('active');
      } else {
        modalTabB2c?.classList.add('active');
        modalTabB2b?.classList.remove('active');
      }
    });
  });

  const modalTabSurveyStore = document.getElementById('modal-tab-survey-store');
  const modalTabSurveyAssoc = document.getElementById('modal-tab-survey-assoc');
  const modalSurveyRadios = document.querySelectorAll('input[name="new-survey-type"]');

  if (modalSurveyRadios) {
    modalSurveyRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'kstat_assoc') {
          modalTabSurveyAssoc?.classList.add('active');
          modalTabSurveyStore?.classList.remove('active');
        } else {
          modalTabSurveyStore?.classList.add('active');
          modalTabSurveyAssoc?.classList.remove('active');
        }
      });
    });
  }

  btnOpenModal?.addEventListener('click', () => { modal.classList.add('is-open'); });
  btnCloseModal?.addEventListener('click', () => { modal.classList.remove('is-open'); });
  btnCancelModal?.addEventListener('click', () => { modal.classList.remove('is-open'); });

  async function loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const campaigns = await res.json();
      allCampaigns = Array.isArray(campaigns) ? campaigns : [];
      updateCampaignStats(allCampaigns);
      updateCategoryCounts();
      applyFiltersAndRender();
    } catch (err) {
      if (campaignContainer) {
        campaignContainer.innerHTML = `<div class="empty-state"><p>캠페인 목록을 불러오지 못했습니다: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  function updateCampaignStats(campaigns) {
    if (statTotal) statTotal.textContent = `${campaigns.length}건`;
    if (statB2b) statB2b.textContent = `${campaigns.filter(c => c.quotaType === 'b2b').length}건`;
    if (statB2c) statB2c.textContent = `${campaigns.filter(c => c.quotaType === 'b2c').length}건`;
    const completedAll = campaigns.filter(c => c.status === 'completed');
    const completedTodayCnt = completedAll.filter(c => isCampaignCompletedToday(c)).length;
    if (statCompleted) {
      statCompleted.textContent = completedTodayCnt > 0
        ? `${completedAll.length}건 (오늘 ${completedTodayCnt})`
        : `${completedAll.length}건`;
    }
  }

  // 통계 카드 클릭 시 빠른 필터링 연동
  if (statCompleted && typeof statCompleted.closest === 'function') {
    const card = statCompleted.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 완료된 설문만 모아보기';
      card.addEventListener('click', () => {
        statusChips.forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-status') === 'completed');
        });
        currentStatus = 'completed';
        mainVisibleLimit = PAGE_SIZE;
        applyFiltersAndRender();
      });
    }
  }
  if (statTotal && typeof statTotal.closest === 'function') {
    const card = statTotal.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 기본 보기(진행+오늘완료)로 초기화';
      card.addEventListener('click', () => {
        resetAllFilters();
      });
    }
  }

  // 필터 탭, 상태 칩, 정렬, 뷰 토글 이벤트 바인딩
  filterCatPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterCatPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.getAttribute('data-category') || 'all';
      mainVisibleLimit = PAGE_SIZE;
      archiveVisibleLimit = PAGE_SIZE;
      applyFiltersAndRender();
    });
  });

  statusChips.forEach(chip => {
    chip.addEventListener('click', () => {
      statusChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatus = chip.getAttribute('data-status') || 'all';
      mainVisibleLimit = PAGE_SIZE;
      applyFiltersAndRender();
    });
  });

  if (selectCampaignSort) {
    selectCampaignSort.addEventListener('change', () => {
      currentSort = selectCampaignSort.value || 'priority';
      applyFiltersAndRender();
    });
  }

  viewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViewMode = btn.getAttribute('data-view') || 'grid';
      applyFiltersAndRender();
    });
  });

  function resetAllFilters() {
    currentCategory = 'all';
    currentStatus = 'all';
    currentSort = 'priority';
    currentSearchQuery = '';
    mainVisibleLimit = PAGE_SIZE;
    archiveVisibleLimit = PAGE_SIZE;
    if (inputSearch) inputSearch.value = '';
    if (selectCampaignSort) selectCampaignSort.value = 'priority';
    if (btnClearSearch) btnClearSearch.classList.add('d-none');
    if (autocompleteDropdown) autocompleteDropdown.classList.add('hidden');

    filterCatPills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-category') === 'all');
    });
    statusChips.forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-status') === 'all');
    });

    applyFiltersAndRender();
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', resetAllFilters);
  }

  // 스마트 검색 & 자동완성 드롭다운
  function renderAutocomplete(query) {
    if (!autocompleteDropdown) return;
    if (!query || !query.trim()) {
      autocompleteDropdown.classList.add('hidden');
      autocompleteDropdown.innerHTML = '';
      return;
    }

    const q = query.trim().toLowerCase();
    const matches = allCampaigns.filter(c => {
      const cat = getCampaignCategory(c);
      const catMeta = getCategoryMeta(cat, c.surveyType);
      const title = String(c.title || '').toLowerCase();
      const desc = String(c.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || catMeta.label.toLowerCase().includes(q);
    }).slice(0, 8);

    if (matches.length === 0) {
      autocompleteDropdown.innerHTML = `
        <div class="autocomplete-empty">
          <i class="fa-solid fa-magnifying-glass mb-8"></i>
          <div>"<strong>${escapeHtml(query)}</strong>" 에 일치하는 캠페인이 없습니다.</div>
        </div>
      `;
      autocompleteDropdown.classList.remove('hidden');
      return;
    }

    selectedAutocompleteIdx = -1;
    autocompleteDropdown.innerHTML = `
      <div class="autocomplete-list">
        ${matches.map((c, idx) => {
          const cat = getCampaignCategory(c);
          const catMeta = getCategoryMeta(cat, c.surveyType);
          const isComp = (c.status === 'completed');
          const dbCount = c.quotaDatabase ? c.quotaDatabase.length : 0;
          return `
            <div class="autocomplete-item" data-id="${escapeHtml(c.id)}" data-idx="${idx}">
              <div class="autocomplete-item-left">
                <span class="badge-category ${catMeta.class}"><i class="fa-solid ${catMeta.icon}"></i> ${catMeta.label}</span>
                <span class="autocomplete-item-title" title="${escapeHtml(c.title)}">${highlightQuery(escapeHtml(c.title), query)}</span>
              </div>
              <div class="autocomplete-item-right">
                <span class="font-caption text-dim font-mono">${dbCount}개</span>
                <span class="badge-status ${isComp ? 'completed' : (c.status === 'running' ? 'running' : 'ready')}">${isComp ? '완료' : (c.status === 'running' ? '진행' : '대기')}</span>
                <a href="survey-detail.html?id=${encodeURIComponent(c.id)}" class="text-primary-color font-bold font-caption ml-4" title="바로 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="autocomplete-footer">
        <span><i class="fa-solid fa-bolt text-warning"></i> 상위 ${matches.length}건 표시 (클릭 시 선택)</span>
        <span><kbd>ESC</kbd> 닫기</span>
      </div>
    `;
    autocompleteDropdown.classList.remove('hidden');

    autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const campId = item.getAttribute('data-id');
        const selectedCamp = allCampaigns.find(c => c.id === campId);
        if (selectedCamp) {
          inputSearch.value = selectedCamp.title;
          currentSearchQuery = selectedCamp.title;
          if (btnClearSearch) btnClearSearch.classList.remove('d-none');
          autocompleteDropdown.classList.add('hidden');
          applyFiltersAndRender();
        }
      });
    });
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', () => {
      currentSearchQuery = inputSearch.value.trim();
      mainVisibleLimit = PAGE_SIZE;
      if (btnClearSearch) {
        btnClearSearch.classList.toggle('d-none', !currentSearchQuery);
      }
      applyFiltersAndRender();
      renderAutocomplete(currentSearchQuery);
    });

    inputSearch.addEventListener('keydown', (e) => {
      const items = autocompleteDropdown?.querySelectorAll('.autocomplete-item') || [];
      if (items.length > 0 && !autocompleteDropdown.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedAutocompleteIdx = Math.min(items.length - 1, selectedAutocompleteIdx + 1);
          items.forEach((it, i) => it.classList.toggle('is-selected', i === selectedAutocompleteIdx));
          items[selectedAutocompleteIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedAutocompleteIdx = Math.max(0, selectedAutocompleteIdx - 1);
          items.forEach((it, i) => it.classList.toggle('is-selected', i === selectedAutocompleteIdx));
          items[selectedAutocompleteIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          if (selectedAutocompleteIdx >= 0 && items[selectedAutocompleteIdx]) {
            e.preventDefault();
            items[selectedAutocompleteIdx].click();
          }
        } else if (e.key === 'Escape') {
          autocompleteDropdown.classList.add('hidden');
        }
      }
    });

    inputSearch.addEventListener('focus', () => {
      if (inputSearch.value.trim()) {
        renderAutocomplete(inputSearch.value.trim());
      }
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      inputSearch.value = '';
      currentSearchQuery = '';
      btnClearSearch.classList.add('d-none');
      if (autocompleteDropdown) autocompleteDropdown.classList.add('hidden');
      inputSearch.focus();
      applyFiltersAndRender();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.campaign-search-box')) {
      if (autocompleteDropdown) autocompleteDropdown.classList.add('hidden');
      const qDropdown = document.getElementById('quota-autocomplete-dropdown');
      if (qDropdown) qDropdown.classList.add('hidden');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const isQuotaTabActive = sectionQuotas && !sectionQuotas.classList.contains('hidden');
      const targetInput = isQuotaTabActive ? document.getElementById('input-quota-search') : inputSearch;
      if (targetInput && document.activeElement !== targetInput) {
        targetInput.focus();
        targetInput.select();
      }
    }
  });

  formNew?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-title').value.trim();
    const description = document.getElementById('new-desc').value.trim();
    const quotaType = document.querySelector('input[name="new-quota-type"]:checked').value;
    const surveyType = document.querySelector('input[name="new-survey-type"]:checked')?.value || 'kstat_store';

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, quotaType, surveyType })
      });
      const newCamp = await res.json();
      window.location.href = `survey-detail.html?id=${newCamp.id}`;
    } catch (err) {
      alert('캠페인 생성에 실패했습니다: ' + err.message);
    }
  });

  // ------------------------------------------------------------------------
  // 3. 조사 쿼터 보관함 (Quota Library) 통합 제어 (카테고리 / 당일완료 유지 & 보관함 / 뷰전환 / 정렬)
  // ------------------------------------------------------------------------
  const quotaContainer = document.getElementById('quota-list-container');
  const quotaArchiveSection = document.getElementById('quota-archive-section');
  const statTotalQuotas = document.getElementById('stat-total-quotas');
  const statTotalMerchants = document.getElementById('stat-total-quota-merchants');
  const statStratifiedQuotas = document.getElementById('stat-stratified-quotas');
  const statExcelSync = document.getElementById('stat-excel-sync-rate');

  const quotaFilterCatPills = document.querySelectorAll('.quota-filter-tab-pill');
  const badgeQuotaFilterAll = document.getElementById('badge-quota-filter-all');
  const badgeQuotaFilterTraditional = document.getElementById('badge-quota-filter-traditional');
  const badgeQuotaFilterAssoc = document.getElementById('badge-quota-filter-assoc');
  const badgeQuotaFilterSmallbiz = document.getElementById('badge-quota-filter-smallbiz');
  const badgeQuotaFilterSpecial = document.getElementById('badge-quota-filter-special');

  const quotaStatusChips = document.querySelectorAll('.quota-status-chip');
  const quotaModeChips = document.querySelectorAll('.quota-mode-chip');
  const selectQuotaSort = document.getElementById('select-quota-sort');
  const quotaViewToggleBtns = document.querySelectorAll('.quota-view-toggle-btn');
  const inputQuotaSearch = document.getElementById('input-quota-search');
  const btnClearQuotaSearch = document.getElementById('btn-clear-quota-search');
  const quotaAutocompleteDropdown = document.getElementById('quota-autocomplete-dropdown');
  const quotaFilterStatusInfoBar = document.getElementById('quota-filter-status-info-bar');
  const quotaFilterInfoLabel = document.getElementById('quota-filter-info-label');
  const btnResetQuotaFilters = document.getElementById('btn-reset-quota-filters');

  let allQuotas = [];
  let currentQuotaCategory = 'all';   // 'all' | 'traditional' | 'assoc' | 'smallbiz' | 'special'
  let currentQuotaStatus = 'all';     // 'all' (작업대상+오늘완료 상단 / 이전완료 보관함) | 'active' | 'completed'
  let currentQuotaMode = 'all';       // 'all' | 'stratified' | 'simple'
  let currentQuotaSort = 'priority';  // 'priority' | 'newest' | 'name' | 'count'
  let currentQuotaViewMode = 'grid';  // 'grid' | 'list'
  let currentQuotaSearchQuery = '';
  let selectedQuotaAutocompleteIdx = -1;

  let quotaMainVisibleLimit = PAGE_SIZE;
  let quotaArchiveExpanded = false;
  let quotaArchiveVisibleLimit = PAGE_SIZE;

  function getQuotaCategory(q) {
    const sType = String(q.surveyType || '').toLowerCase().trim();
    const qType = String(q.type || '').toUpperCase().trim();
    const title = String(q.title || '').toLowerCase();
    const fileName = String(q.fileName || '').toLowerCase();
    const market = String(q.marketName || '').toLowerCase();

    if (
      ['hrc_energy', 'globalri_literacy', 'gallup_return_farm', 'kona_youth'].includes(sType) ||
      ['HRC_ENERGY_BUILDING', 'GLOBALRI_ADULT_LITERACY', 'GALLUP_RETURN_FARM', 'KONA_YOUTH'].includes(qType) ||
      fileName.includes('hrc_energy') ||
      fileName.includes('globalri') ||
      fileName.includes('gallup') ||
      fileName.includes('kona')
    ) {
      return 'special';
    }
    if (sType === 'metrix_panel' || qType === 'METRIX_PANEL' || title.includes('메트릭스') || fileName.includes('metrix')) {
      return 'smallbiz';
    }
    if (sType === 'kstat_assoc' || qType === 'KSTAT_ASSOC' || title.includes('상인회') || fileName.includes('assoc') || market.includes('상인회')) {
      return 'assoc';
    }
    return 'traditional';
  }

  function isQuotaStratified(q) {
    return Boolean(q.industryDistribution && Object.keys(q.industryDistribution).length >= 5);
  }

  // 쿼터 연동 캠페인 완료 여부 및 당일 완료 판별
  function getQuotaCompletionInfo(q) {
    let status = q.campaignStatus || null;
    let completedAt = q.campaignCompletedAt || null;
    let linkedId = q.linkedCampaignId || null;

    if ((!status || !linkedId) && allCampaigns.length > 0) {
      const matched = allCampaigns.find(c =>
        (q.linkedCampaignId && c.id === q.linkedCampaignId) ||
        c.quotaSourceFile === q.fileName ||
        c.quotaConfig?.quotaFileName === q.fileName ||
        (q.marketName && c.quotaConfig?.marketName && c.quotaConfig.marketName === q.marketName)
      );
      if (matched) {
        linkedId = matched.id;
        status = matched.status;
        if (matched.status === 'completed') {
          completedAt = getCampaignCompletionTimestamp(matched);
        }
      }
    }

    const isCompleted = (status === 'completed');
    const isTodayDone = isCompleted && isCompletedOnToday(completedAt || q.updatedAt || q.createdAt);
    return { linkedId, status, isCompleted, isTodayDone, completedAt };
  }

  function sortQuotaList(list) {
    const arr = [...list];
    arr.sort((a, b) => {
      if (currentQuotaSort === 'name') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
      }
      if (currentQuotaSort === 'count') {
        const cntA = Number(a.count || 0);
        const cntB = Number(b.count || 0);
        if (cntB !== cntA) return cntB - cntA;
      }
      if (currentQuotaSort === 'priority') {
        const infoA = getQuotaCompletionInfo(a);
        const infoB = getQuotaCompletionInfo(b);
        const rank = (info) => {
          if (info.status === 'running') return 1;
          if (!info.isCompleted) return 2;
          if (info.isTodayDone) return 3;
          return 4;
        };
        const rA = rank(infoA);
        const rB = rank(infoB);
        if (rA !== rB) return rA - rB;
      }
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    return arr;
  }

  function getBaseFilteredQuotas() {
    return allQuotas.filter(q => {
      const cat = getQuotaCategory(q);
      if (currentQuotaCategory !== 'all' && cat !== currentQuotaCategory) {
        return false;
      }

      const stratified = isQuotaStratified(q);
      if (currentQuotaMode === 'stratified' && !stratified) return false;
      if (currentQuotaMode === 'simple' && stratified) return false;

      if (currentQuotaSearchQuery) {
        const kw = currentQuotaSearchQuery.toLowerCase();
        const title = String(q.title || '').toLowerCase();
        const marketName = String(q.marketName || '').toLowerCase();
        const fileName = String(q.fileName || '').toLowerCase();
        const keyword = String(q.keyword || '').toLowerCase();
        const countStr = `${q.count || 0}건 ${q.count || 0}개`;
        const catMeta = getCategoryMeta(cat, q.surveyType);
        const catName = catMeta.label.toLowerCase();
        const industries = Object.keys(q.industryDistribution || {}).join(' ').toLowerCase();

        const isMatch =
          title.includes(kw) ||
          marketName.includes(kw) ||
          fileName.includes(kw) ||
          keyword.includes(kw) ||
          countStr.includes(kw) ||
          catName.includes(kw) ||
          industries.includes(kw);

        if (!isMatch) return false;
      }

      return true;
    });
  }

  function updateQuotaCategoryCounts() {
    let countTraditional = 0;
    let countAssoc = 0;
    let countSmallbiz = 0;
    let countSpecial = 0;

    allQuotas.forEach(q => {
      const cat = getQuotaCategory(q);
      if (cat === 'traditional') countTraditional++;
      else if (cat === 'assoc') countAssoc++;
      else if (cat === 'smallbiz') countSmallbiz++;
      else if (cat === 'special') countSpecial++;
    });

    if (badgeQuotaFilterAll) badgeQuotaFilterAll.textContent = allQuotas.length;
    if (badgeQuotaFilterTraditional) badgeQuotaFilterTraditional.textContent = countTraditional;
    if (badgeQuotaFilterAssoc) badgeQuotaFilterAssoc.textContent = countAssoc;
    if (badgeQuotaFilterSmallbiz) badgeQuotaFilterSmallbiz.textContent = countSmallbiz;
    if (badgeQuotaFilterSpecial) badgeQuotaFilterSpecial.textContent = countSpecial;
  }

  function buildQuotaDisplayInfo(q) {
    const cat = getQuotaCategory(q);
    const sType = String(q.surveyType || '').toLowerCase();
    const isAssoc = (cat === 'assoc' || q.type === 'KSTAT_ASSOC' || sType === 'kstat_assoc' || String(q.fileName || '').startsWith('quota_assoc_'));
    const isHrcEnergy = (q.type === 'HRC_ENERGY_BUILDING' || sType === 'hrc_energy' || String(q.fileName || '').includes('hrc_energy'));
    const isGlobalri = (q.type === 'GLOBALRI_ADULT_LITERACY' || sType === 'globalri_literacy' || String(q.fileName || '').includes('globalri'));
    const isGallup = (q.type === 'GALLUP_RETURN_FARM' || sType === 'gallup_return_farm' || String(q.fileName || '').includes('gallup'));

    const catMeta = getCategoryMeta(cat, sType);
    const compInfo = getQuotaCompletionInfo(q);
    const dateStr = formatShortDate(compInfo.isCompleted ? (compInfo.completedAt || q.createdAt) : q.createdAt);
    const marketName = q.marketName || (isHrcEnergy ? '한국리서치 TAPI 건물표본' : (isGlobalri ? '글로벌리서치 성인문해 표본' : (isGallup ? '한국갤럽 귀농귀촌 표본' : (cat === 'smallbiz' ? '경기도 소상공인 패널' : (cat === 'assoc' ? '전통시장 상인회' : '일반 사업자')))));
    const isStratified = isQuotaStratified(q);
    const isExcelUpload = (q.requestParams?.samplingMode === 'excel_upload' || String(q.title || '').includes('엑셀업로드'));

    const modeBadgeText = isAssoc
      ? 'Kstat 상인회 슬롯'
      : (isHrcEnergy
        ? 'TAPI 건물 표본'
        : (isGlobalri
          ? 'GIFT 가구원 표본'
          : (isGallup
            ? 'G-CAII 귀농 표본'
            : (isStratified ? '9대 업종 층화' : (isExcelUpload ? '엑셀 업로드' : '단순 수집')))));

    const iconMap = {
      '★선정(우선)': '⭐', '대체(예비)': '🔄', '조사완료': '✅', '조사완료(99)': '✅', '대기(진행대상)': '⏳', '대기(미진행)': '⏳',
      '전통시장': '🏪', '골목형상점가': '🏬', '상점가': '🏬', '상인회': '🏛️',
      '농산물': '🌾', '축산물': '🥩', '수산물': '🐟',
      '가공식품': '🍱', '의류신발': '👗', '가정용품': '🏠',
      '음식점업': '🍽️', '기타소매': '🛒', '근린상권': '💈', '기타': '📦'
    };

    let industryChipsHtml = '';
    let industryCompactSummary = '';
    if (q.industryDistribution) {
      const entries = Object.entries(q.industryDistribution);
      industryChipsHtml = `
        <div class="quota-industry-chips">
          ${entries.map(([ind, cnt]) => `
            <span class="quota-ind-badge">${iconMap[ind] || '🏢'} ${highlightQuery(escapeHtml(ind), currentQuotaSearchQuery)} ${cnt}</span>
          `).join('')}
        </div>
      `;
      industryCompactSummary = entries.slice(0, 4).map(([ind, cnt]) => `${ind} ${cnt}`).join(' · ') + (entries.length > 4 ? ` 외 ${entries.length - 4}종` : '');
    } else {
      industryChipsHtml = `
        <div class="quota-industry-chips">
          <span class="quota-ind-badge">단일 업종 / 키워드: ${highlightQuery(escapeHtml(q.keyword || '전체'), currentQuotaSearchQuery)}</span>
        </div>
      `;
      industryCompactSummary = `키워드: ${q.keyword || '전체'}`;
    }

    const countText = isHrcEnergy && q.selectedCount
      ? `선정 ${q.selectedCount}건 / 전체 ${q.count}건`
      : `${q.count || 0}건`;

    return {
      cat,
      catMeta,
      isAssoc,
      isHrcEnergy,
      compInfo,
      dateStr,
      marketName,
      isStratified,
      modeBadgeText,
      industryChipsHtml,
      industryCompactSummary,
      countText
    };
  }

  function renderQuotaCardsHtml(quotas) {
    return quotas.map(q => {
      const info = buildQuotaDisplayInfo(q);
      const cardClass = `campaign-card quota-card ${info.compInfo.isCompleted ? 'completed-card' : ''} ${info.compInfo.isTodayDone ? 'completed-today-card' : ''}`;

      return `
        <div class="${cardClass}" data-filename="${escapeHtml(q.fileName)}">
          <div>
            <div class="campaign-card-header">
              <div class="flex-center-gap-6 flex-wrap">
                <span class="badge-category ${info.catMeta.class}"><i class="fa-solid ${info.catMeta.icon}"></i> ${info.catMeta.label}</span>
                <span class="badge-quota-type b2b"><i class="fa-solid ${info.isHrcEnergy ? 'fa-building-circle-check' : (info.isAssoc ? 'fa-people-roof' : 'fa-shop')}"></i> ${highlightQuery(escapeHtml(info.marketName), currentQuotaSearchQuery)}</span>
              </div>
              <div class="flex-center-gap-6">
                ${info.compInfo.isTodayDone
                  ? '<span class="badge-completed-today"><i class="fa-solid fa-wand-magic-sparkles"></i> 오늘 완료</span>'
                  : (info.compInfo.isCompleted
                    ? '<span class="completed-stamp-badge"><i class="fa-solid fa-check-double"></i> 설문 완료</span>'
                    : '')}
                <span class="badge-status ${info.compInfo.isCompleted ? 'completed' : (info.isStratified || info.isHrcEnergy || info.isAssoc ? 'success' : 'ready')}">
                  ${info.modeBadgeText}
                </span>
              </div>
            </div>
            <h3 class="campaign-title">
              ${info.compInfo.isCompleted ? '<i class="fa-solid fa-circle-check text-success-sm"></i>' : ''}
              ${highlightQuery(escapeHtml(q.title), currentQuotaSearchQuery)}
            </h3>
            <div class="quota-chips-container mt-8 mb-12">
              ${info.industryChipsHtml}
            </div>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>확보 표본수</span>
                <strong class="${info.compInfo.isCompleted ? 'completed-stat' : 'text-primary-color'}">${escapeHtml(info.countText)}</strong>
              </div>
              <div class="meta-item">
                <span>${info.compInfo.isCompleted ? '완료/생성일' : '생성 일자'}</span>
                <strong>${info.dateStr}</strong>
              </div>
            </div>

            <div class="campaign-card-footer quota-card-actions">
              <a href="quota-detail.html?file=${encodeURIComponent(q.fileName)}" class="btn-pill btn-pill-primary">
                <i class="fa-solid fa-pen-to-square"></i> ${info.isAssoc ? '항목 편집' : '상세·수정'}
              </a>
              ${q.excelFileName ? `
                <a href="/api/quota/download/${encodeURIComponent(q.excelFileName)}" class="btn-pill btn-pill-secondary btn-download-excel" title="Excel 파일 다운로드">
                  <i class="fa-solid fa-file-excel icon-excel-green"></i> 엑셀
                </a>
              ` : ''}
              ${info.compInfo.linkedId ? `
                <a href="survey-detail.html?id=${encodeURIComponent(info.compInfo.linkedId)}" class="btn-pill ${info.compInfo.isCompleted ? 'btn-pill-completed' : 'btn-pill-success'}" title="연동된 설문 작업실로 이동">
                  <i class="fa-solid ${info.compInfo.isCompleted ? 'fa-clipboard-check' : 'fa-play'}"></i> ${info.compInfo.isCompleted ? '작업실 열람' : '조사 실행'}
                </a>
              ` : `
                <button type="button" class="btn-pill btn-pill-success btn-create-camp-from-quota" data-filename="${escapeHtml(q.fileName)}" data-title="${escapeHtml(q.title)}" title="이 쿼터로 새 캠페인 생성">
                  <i class="fa-solid fa-play"></i> 캠페인 시작
                </button>
              `}
              <button type="button" class="btn-icon-circle btn-delete-quota" data-filename="${escapeHtml(q.fileName)}" title="쿼터 삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderQuotaTableHtml(quotas) {
    return `
      <div class="compact-list-table-wrap">
        <table class="compact-list-table">
          <thead>
            <tr>
              <th class="col-cat">카테고리</th>
              <th class="col-title">조사 쿼터 제목 / 대상 시장</th>
              <th class="col-quota">표본 구성 요약</th>
              <th class="col-status">표본수 / 설문상태</th>
              <th class="col-date">일자</th>
              <th class="col-actions">관리</th>
            </tr>
          </thead>
          <tbody>
            ${quotas.map(q => {
              const info = buildQuotaDisplayInfo(q);
              return `
                <tr class="${info.compInfo.isCompleted ? 'row-completed' : ''} ${info.compInfo.isTodayDone ? 'row-completed-today' : ''}" data-filename="${escapeHtml(q.fileName)}">
                  <td class="col-cat">
                    <span class="badge-category ${info.catMeta.class}"><i class="fa-solid ${info.catMeta.icon}"></i> ${info.catMeta.label}</span>
                  </td>
                  <td class="col-title">
                    <div class="compact-title-wrap">
                      <a href="quota-detail.html?file=${encodeURIComponent(q.fileName)}" class="compact-main-title">
                        ${info.compInfo.isCompleted ? '<i class="fa-solid fa-circle-check text-success-sm"></i> ' : ''}
                        ${highlightQuery(escapeHtml(q.title), currentQuotaSearchQuery)}
                      </a>
                      <span class="compact-sub-desc">${highlightQuery(escapeHtml(info.marketName), currentQuotaSearchQuery)} · ${escapeHtml(info.modeBadgeText)}</span>
                    </div>
                  </td>
                  <td class="col-quota">
                    <span class="compact-quota-text">${escapeHtml(info.industryCompactSummary)}</span>
                  </td>
                  <td class="col-status">
                    <div class="flex-center-gap-6">
                      <strong>${escapeHtml(info.countText)}</strong>
                      ${info.compInfo.isTodayDone
                        ? '<span class="badge-completed-today">오늘 완료</span>'
                        : (info.compInfo.isCompleted
                          ? '<span class="badge-status completed">설문완료</span>'
                          : '<span class="badge-status ready">작업대상</span>')}
                    </div>
                  </td>
                  <td class="col-date font-mono">${info.dateStr}</td>
                  <td class="col-actions">
                    <div class="compact-action-group">
                      <a href="quota-detail.html?file=${encodeURIComponent(q.fileName)}" class="btn-compact-open">상세</a>
                      ${q.excelFileName ? `
                        <a href="/api/quota/download/${encodeURIComponent(q.excelFileName)}" class="btn-compact-open" title="Excel 다운로드"><i class="fa-solid fa-file-excel icon-excel-green"></i></a>
                      ` : ''}
                      ${info.compInfo.linkedId ? `
                        <a href="survey-detail.html?id=${encodeURIComponent(info.compInfo.linkedId)}" class="btn-compact-open ${info.compInfo.isCompleted ? 'is-completed' : ''}">
                          ${info.compInfo.isCompleted ? '열람' : '실행'}
                        </a>
                      ` : `
                        <button type="button" class="btn-compact-open btn-create-camp-from-quota" data-filename="${escapeHtml(q.fileName)}" data-title="${escapeHtml(q.title)}">시작</button>
                      `}
                      <button type="button" class="btn-icon-circle btn-delete-quota" data-filename="${escapeHtml(q.fileName)}" title="쿼터 삭제">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindQuotaActionButtons(rootEl) {
    if (!rootEl) return;

    rootEl.querySelectorAll('.btn-create-camp-from-quota').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const quotaFileName = btn.getAttribute('data-filename');
        const defaultTitle = btn.getAttribute('data-title') || '새로운 설문조사 캠페인';
        const campTitle = prompt('새 캠페인의 제목을 입력해 주세요:', defaultTitle);
        if (!campTitle || !campTitle.trim()) return;

        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          const res = await fetch('/api/campaigns/create-from-quota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quotaFileName,
              title: campTitle.trim()
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '캠페인 생성 실패');
          window.location.href = `survey-detail.html?id=${data.campaign.id}`;
        } catch (err) {
          alert('캠페인 생성 오류: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-play"></i> 캠페인 시작';
        }
      });
    });

    rootEl.querySelectorAll('.btn-delete-quota').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fileName = btn.getAttribute('data-filename');
        if (confirm(`정말로 이 쿼터("${fileName}")를 삭제하시겠습니까?\n보관된 JSON 및 Excel 파일이 영구 삭제됩니다.`)) {
          try {
            const res = await fetch(`/api/quota/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '삭제 실패');
            alert(data.message || '쿼터가 성공적으로 삭제되었습니다.');
            loadQuotas();
          } catch (err) {
            alert('삭제 오류: ' + err.message);
          }
        }
      });
    });
  }

  function applyQuotaFiltersAndRender() {
    const baseFiltered = sortQuotaList(getBaseFilteredQuotas());

    let mainQuotas = [];
    let archiveQuotas = [];

    if (currentQuotaStatus === 'active') {
      mainQuotas = baseFiltered.filter(q => !getQuotaCompletionInfo(q).isCompleted);
      archiveQuotas = [];
    } else if (currentQuotaStatus === 'completed') {
      mainQuotas = baseFiltered.filter(q => getQuotaCompletionInfo(q).isCompleted);
      archiveQuotas = [];
    } else {
      // 기본 '전체 (진행+오늘완료)': 미완료 또는 오늘 완료된 쿼터는 상단 노출, 어제 이전 완료 쿼터는 하단 보관함으로 분리
      mainQuotas = baseFiltered.filter(q => {
        const info = getQuotaCompletionInfo(q);
        return !info.isCompleted || info.isTodayDone;
      });
      archiveQuotas = baseFiltered.filter(q => {
        const info = getQuotaCompletionInfo(q);
        return info.isCompleted && !info.isTodayDone;
      });
    }

    renderQuotaMainAndArchive(mainQuotas, archiveQuotas, baseFiltered.length);

    const isFiltered = (currentQuotaCategory !== 'all' || currentQuotaStatus !== 'all' || currentQuotaMode !== 'all' || !!currentQuotaSearchQuery);
    if (quotaFilterStatusInfoBar) {
      if (isFiltered) {
        quotaFilterStatusInfoBar.classList.remove('d-none');
        const filterDesc = [];
        if (currentQuotaCategory !== 'all') {
          const catMeta = getCategoryMeta(currentQuotaCategory);
          filterDesc.push(`카테고리: ${catMeta.label}`);
        }
        if (currentQuotaStatus === 'active') filterDesc.push('상태: 작업대상만');
        else if (currentQuotaStatus === 'completed') filterDesc.push('상태: 설문완료만');
        if (currentQuotaMode === 'stratified') filterDesc.push('방식: 층화 표본');
        else if (currentQuotaMode === 'simple') filterDesc.push('방식: 단순·엑셀');
        if (currentQuotaSearchQuery) filterDesc.push(`검색어: "${currentQuotaSearchQuery}"`);

        const totalShown = mainQuotas.length + archiveQuotas.length;
        if (quotaFilterInfoLabel) {
          quotaFilterInfoLabel.innerHTML = `필터 적용 결과: <strong>${totalShown}개</strong> (상단 ${mainQuotas.length}개${archiveQuotas.length > 0 ? ` + 보관함 ${archiveQuotas.length}개` : ''}) &nbsp;•&nbsp; <span class="text-dim">[${filterDesc.join(', ')}]</span>`;
        }
      } else {
        quotaFilterStatusInfoBar.classList.add('d-none');
      }
    }
  }

  function renderQuotaMainAndArchive(mainQuotas, archiveQuotas, totalMatchedCount) {
    if (!quotaContainer) return;

    if (allQuotas.length === 0) {
      quotaContainer.className = 'campaign-grid';
      quotaContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-database empty-state-icon"></i>
          <p class="empty-state-text">보관된 조사 쿼터가 아직 없습니다.</p>
          <a href="quota-builder.html" class="btn-pill btn-pill-primary mt-14">
            <i class="fa-solid fa-plus"></i> 새 쿼터 생성기 바로가기
          </a>
        </div>
      `;
      if (quotaArchiveSection) quotaArchiveSection.classList.add('d-none');
      return;
    }

    if (totalMatchedCount === 0) {
      quotaContainer.className = 'campaign-grid';
      quotaContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-filter-circle-xmark empty-state-icon"></i>
          <p class="empty-state-text">선택하신 조건(카테고리/상태/수집방식/검색어)에 일치하는 조사 쿼터가 없습니다.</p>
          <button class="btn-pill btn-pill-secondary mt-14" id="btn-empty-reset-quota-filters">
            <i class="fa-solid fa-rotate-left"></i> 필터 및 검색어 초기화
          </button>
        </div>
      `;
      document.getElementById('btn-empty-reset-quota-filters')?.addEventListener('click', resetAllQuotaFilters);
      if (quotaArchiveSection) quotaArchiveSection.classList.add('d-none');
      return;
    }

    // 1. 상단 메인 쿼터 목록 렌더링
    if (mainQuotas.length === 0 && archiveQuotas.length > 0) {
      quotaContainer.className = 'campaign-grid';
      quotaContainer.innerHTML = `
        <div class="empty-state empty-state-card empty-state-compact">
          <i class="fa-solid fa-circle-check text-success empty-state-icon-sm"></i>
          <p class="empty-state-text">현재 미완료 작업대상 또는 오늘 완료된 쿼터가 없습니다. (이전 설문 완료 쿼터 <strong>${archiveQuotas.length}개</strong>는 아래 보관함에 정리되어 있습니다)</p>
        </div>
      `;
    } else {
      const slicedMain = mainQuotas.slice(0, quotaMainVisibleLimit);
      const remainingMain = mainQuotas.length - slicedMain.length;

      if (currentQuotaViewMode === 'list') {
        quotaContainer.className = 'campaign-list-mode-container';
        quotaContainer.innerHTML = renderQuotaTableHtml(slicedMain);
      } else {
        quotaContainer.className = 'campaign-grid';
        quotaContainer.innerHTML = renderQuotaCardsHtml(slicedMain);
      }

      if (remainingMain > 0) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.className = 'load-more-bar';
        loadMoreWrap.innerHTML = `
          <button type="button" class="btn-load-more" id="btn-quota-main-load-more">
            <i class="fa-solid fa-angles-down"></i> 쿼터 더보기 (+${Math.min(PAGE_SIZE, remainingMain)}개 / 남은 ${remainingMain}개)
          </button>
          <button type="button" class="btn-load-all" id="btn-quota-main-load-all">
            전체 펼치기 (${mainQuotas.length}개)
          </button>
        `;
        quotaContainer.appendChild(loadMoreWrap);
        document.getElementById('btn-quota-main-load-more')?.addEventListener('click', () => {
          quotaMainVisibleLimit += PAGE_SIZE;
          applyQuotaFiltersAndRender();
        });
        document.getElementById('btn-quota-main-load-all')?.addEventListener('click', () => {
          quotaMainVisibleLimit = mainQuotas.length + 100;
          applyQuotaFiltersAndRender();
        });
      }

      bindQuotaActionButtons(quotaContainer);
    }

    // 2. 하단 완료 쿼터 보관함 아코디언 렌더링
    if (!quotaArchiveSection) return;
    if (archiveQuotas.length === 0) {
      quotaArchiveSection.classList.add('d-none');
      quotaArchiveSection.innerHTML = '';
      return;
    }

    quotaArchiveSection.classList.remove('d-none');
    const slicedArchive = archiveQuotas.slice(0, quotaArchiveVisibleLimit);
    const remainingArchive = archiveQuotas.length - slicedArchive.length;

    quotaArchiveSection.innerHTML = `
      <div class="completed-archive-card ${quotaArchiveExpanded ? 'is-expanded' : ''}">
        <button type="button" class="completed-archive-header" id="btn-toggle-quota-archive">
          <div class="archive-header-left">
            <span class="archive-folder-icon"><i class="fa-solid ${quotaArchiveExpanded ? 'fa-folder-open' : 'fa-box-archive'}"></i></span>
            <div class="archive-title-group">
              <strong class="archive-title">설문 완료된 쿼터 보관함 <span class="archive-count-pill">${archiveQuotas.length}개</span></strong>
              <span class="archive-subtitle">당일 완료된 쿼터는 상단 목록에 유지되며, 어제 이전에 설문이 100% 완료된 쿼터들이 이곳에 자동 정리됩니다.</span>
            </div>
          </div>
          <span class="archive-toggle-action">
            <span>${quotaArchiveExpanded ? '보관함 접기' : '목록 펼쳐보기'}</span>
            <i class="fa-solid fa-chevron-${quotaArchiveExpanded ? 'up' : 'down'}"></i>
          </span>
        </button>
        ${quotaArchiveExpanded ? `
          <div class="completed-archive-body">
            <div class="${currentQuotaViewMode === 'list' ? 'campaign-list-mode-container' : 'campaign-grid'}" id="quota-archive-list-inner">
              ${currentQuotaViewMode === 'list' ? renderQuotaTableHtml(slicedArchive) : renderQuotaCardsHtml(slicedArchive)}
            </div>
            ${remainingArchive > 0 ? `
              <div class="load-more-bar mt-20">
                <button type="button" class="btn-load-more" id="btn-quota-archive-load-more">
                  <i class="fa-solid fa-angles-down"></i> 완료 쿼터 더보기 (+${Math.min(PAGE_SIZE, remainingArchive)}개 / 남은 ${remainingArchive}개)
                </button>
                <button type="button" class="btn-load-all" id="btn-quota-archive-load-all">
                  보관함 전체 펼치기 (${archiveQuotas.length}개)
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btn-toggle-quota-archive')?.addEventListener('click', () => {
      quotaArchiveExpanded = !quotaArchiveExpanded;
      applyQuotaFiltersAndRender();
    });
    document.getElementById('btn-quota-archive-load-more')?.addEventListener('click', () => {
      quotaArchiveVisibleLimit += PAGE_SIZE;
      applyQuotaFiltersAndRender();
    });
    document.getElementById('btn-quota-archive-load-all')?.addEventListener('click', () => {
      quotaArchiveVisibleLimit = archiveQuotas.length + 100;
      applyQuotaFiltersAndRender();
    });

    const archiveInner = document.getElementById('quota-archive-list-inner');
    if (archiveInner) bindQuotaActionButtons(archiveInner);
  }

  function resetAllQuotaFilters() {
    currentQuotaCategory = 'all';
    currentQuotaStatus = 'all';
    currentQuotaMode = 'all';
    currentQuotaSort = 'priority';
    currentQuotaSearchQuery = '';
    quotaMainVisibleLimit = PAGE_SIZE;
    quotaArchiveVisibleLimit = PAGE_SIZE;
    if (inputQuotaSearch) inputQuotaSearch.value = '';
    if (selectQuotaSort) selectQuotaSort.value = 'priority';
    if (btnClearQuotaSearch) btnClearQuotaSearch.classList.add('d-none');
    if (quotaAutocompleteDropdown) quotaAutocompleteDropdown.classList.add('hidden');

    quotaFilterCatPills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-quota-category') === 'all');
    });
    quotaStatusChips.forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-quota-status') === 'all');
    });
    quotaModeChips.forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-quota-mode') === 'all');
    });

    applyQuotaFiltersAndRender();
  }

  quotaFilterCatPills.forEach(pill => {
    pill.addEventListener('click', () => {
      quotaFilterCatPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentQuotaCategory = pill.getAttribute('data-quota-category') || 'all';
      quotaMainVisibleLimit = PAGE_SIZE;
      quotaArchiveVisibleLimit = PAGE_SIZE;
      applyQuotaFiltersAndRender();
    });
  });

  quotaStatusChips.forEach(chip => {
    chip.addEventListener('click', () => {
      quotaStatusChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentQuotaStatus = chip.getAttribute('data-quota-status') || 'all';
      quotaMainVisibleLimit = PAGE_SIZE;
      applyQuotaFiltersAndRender();
    });
  });

  quotaModeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      quotaModeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentQuotaMode = chip.getAttribute('data-quota-mode') || 'all';
      quotaMainVisibleLimit = PAGE_SIZE;
      applyQuotaFiltersAndRender();
    });
  });

  if (selectQuotaSort) {
    selectQuotaSort.addEventListener('change', () => {
      currentQuotaSort = selectQuotaSort.value || 'priority';
      applyQuotaFiltersAndRender();
    });
  }

  quotaViewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quotaViewToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentQuotaViewMode = btn.getAttribute('data-quota-view') || 'grid';
      applyQuotaFiltersAndRender();
    });
  });

  if (btnResetQuotaFilters) {
    btnResetQuotaFilters.addEventListener('click', resetAllQuotaFilters);
  }

  if (statStratifiedQuotas && typeof statStratifiedQuotas.closest === 'function') {
    const card = statStratifiedQuotas.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 층화 표본 쿼터만 필터링';
      card.addEventListener('click', () => {
        quotaModeChips.forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-quota-mode') === 'stratified');
        });
        currentQuotaMode = 'stratified';
        quotaMainVisibleLimit = PAGE_SIZE;
        applyQuotaFiltersAndRender();
      });
    }
  }
  if (statTotalQuotas && typeof statTotalQuotas.closest === 'function') {
    const card = statTotalQuotas.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 전체 쿼터 목록 초기화';
      card.addEventListener('click', () => {
        resetAllQuotaFilters();
      });
    }
  }

  function renderQuotaAutocomplete(query) {
    if (!quotaAutocompleteDropdown) return;
    if (!query || !query.trim()) {
      quotaAutocompleteDropdown.classList.add('hidden');
      quotaAutocompleteDropdown.innerHTML = '';
      return;
    }

    const kw = query.trim().toLowerCase();
    const matches = allQuotas.filter(q => {
      const cat = getQuotaCategory(q);
      const catMeta = getCategoryMeta(cat, q.surveyType);
      const title = String(q.title || '').toLowerCase();
      const marketName = String(q.marketName || '').toLowerCase();
      const industries = Object.keys(q.industryDistribution || {}).join(' ').toLowerCase();
      return title.includes(kw) || marketName.includes(kw) || catMeta.label.toLowerCase().includes(kw) || industries.includes(kw);
    }).slice(0, 8);

    if (matches.length === 0) {
      quotaAutocompleteDropdown.innerHTML = `
        <div class="autocomplete-empty">
          <i class="fa-solid fa-magnifying-glass mb-8"></i>
          <div>"<strong>${escapeHtml(query)}</strong>" 에 일치하는 조사 쿼터가 없습니다.</div>
        </div>
      `;
      quotaAutocompleteDropdown.classList.remove('hidden');
      return;
    }

    selectedQuotaAutocompleteIdx = -1;
    quotaAutocompleteDropdown.innerHTML = `
      <div class="autocomplete-list">
        ${matches.map((q, idx) => {
          const cat = getQuotaCategory(q);
          const catMeta = getCategoryMeta(cat, q.surveyType);
          const isStrat = isQuotaStratified(q);
          return `
            <div class="autocomplete-item" data-filename="${escapeHtml(q.fileName)}" data-idx="${idx}">
              <div class="autocomplete-item-left">
                <span class="badge-category ${catMeta.class}"><i class="fa-solid ${catMeta.icon}"></i> ${catMeta.label}</span>
                <span class="autocomplete-item-title" title="${escapeHtml(q.title)}">${highlightQuery(escapeHtml(q.title), query)}</span>
              </div>
              <div class="autocomplete-item-right">
                <span class="font-caption text-dim font-mono">${q.count || 0}건</span>
                <span class="badge-status ${isStrat ? 'completed' : 'ready'}">${isStrat ? '층화' : '단순·엑셀'}</span>
                <a href="quota-detail.html?file=${encodeURIComponent(q.fileName)}" class="text-primary-color font-bold font-caption ml-4" title="쿼터 상세 바로 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="autocomplete-footer">
        <span><i class="fa-solid fa-bolt text-warning"></i> 상위 ${matches.length}건 표시 (클릭 시 선택)</span>
        <span><kbd>ESC</kbd> 닫기</span>
      </div>
    `;
    quotaAutocompleteDropdown.classList.remove('hidden');

    quotaAutocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const fname = item.getAttribute('data-filename');
        const selectedQuota = allQuotas.find(q => q.fileName === fname);
        if (selectedQuota && inputQuotaSearch) {
          inputQuotaSearch.value = selectedQuota.title;
          currentQuotaSearchQuery = selectedQuota.title;
          if (btnClearQuotaSearch) btnClearQuotaSearch.classList.remove('d-none');
          quotaAutocompleteDropdown.classList.add('hidden');
          applyQuotaFiltersAndRender();
        }
      });
    });
  }

  if (inputQuotaSearch) {
    inputQuotaSearch.addEventListener('input', () => {
      currentQuotaSearchQuery = inputQuotaSearch.value.trim();
      quotaMainVisibleLimit = PAGE_SIZE;
      if (btnClearQuotaSearch) {
        btnClearQuotaSearch.classList.toggle('d-none', !currentQuotaSearchQuery);
      }
      applyQuotaFiltersAndRender();
      renderQuotaAutocomplete(currentQuotaSearchQuery);
    });

    inputQuotaSearch.addEventListener('keydown', (e) => {
      if (!quotaAutocompleteDropdown) return;
      const items = quotaAutocompleteDropdown.querySelectorAll('.autocomplete-item');
      if (items.length > 0 && !quotaAutocompleteDropdown.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedQuotaAutocompleteIdx = Math.min(items.length - 1, selectedQuotaAutocompleteIdx + 1);
          items.forEach((it, i) => it.classList.toggle('is-selected', i === selectedQuotaAutocompleteIdx));
          items[selectedQuotaAutocompleteIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedQuotaAutocompleteIdx = Math.max(0, selectedQuotaAutocompleteIdx - 1);
          items.forEach((it, i) => it.classList.toggle('is-selected', i === selectedQuotaAutocompleteIdx));
          items[selectedQuotaAutocompleteIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          if (selectedQuotaAutocompleteIdx >= 0 && items[selectedQuotaAutocompleteIdx]) {
            e.preventDefault();
            items[selectedQuotaAutocompleteIdx].click();
          }
        } else if (e.key === 'Escape') {
          quotaAutocompleteDropdown.classList.add('hidden');
        }
      }
    });

    inputQuotaSearch.addEventListener('focus', () => {
      if (inputQuotaSearch.value.trim()) {
        renderQuotaAutocomplete(inputQuotaSearch.value.trim());
      }
    });
  }

  if (btnClearQuotaSearch) {
    btnClearQuotaSearch.addEventListener('click', () => {
      if (inputQuotaSearch) inputQuotaSearch.value = '';
      currentQuotaSearchQuery = '';
      btnClearQuotaSearch.classList.add('d-none');
      if (quotaAutocompleteDropdown) quotaAutocompleteDropdown.classList.add('hidden');
      if (inputQuotaSearch) inputQuotaSearch.focus();
      applyQuotaFiltersAndRender();
    });
  }

  async function loadQuotas() {
    try {
      if (quotaContainer) {
        quotaContainer.innerHTML = `
          <div class="empty-state empty-state-card">
            <i class="fa-solid fa-spinner fa-spin empty-state-icon"></i>
            <p class="empty-state-text">보관된 조사 쿼터 목록을 불러오는 중입니다...</p>
          </div>
        `;
      }
      // 캠페인 목록이 아직 로드되지 않았다면 함께 가져와서 완료 상태 매칭 정확도 보장
      const [quotaRes, campRes] = await Promise.all([
        fetch('/api/quota/list'),
        allCampaigns.length === 0 ? fetch('/api/campaigns').catch(() => null) : Promise.resolve(null)
      ]);
      if (campRes && campRes.ok) {
        const camps = await campRes.json();
        if (Array.isArray(camps)) allCampaigns = camps;
      }
      if (!quotaRes.ok) throw new Error('쿼터 목록을 가져오지 못했습니다.');
      const quotas = await quotaRes.json();
      allQuotas = Array.isArray(quotas) ? quotas : [];
      updateQuotaStats(allQuotas);
      updateQuotaCategoryCounts();
      applyQuotaFiltersAndRender();
    } catch (err) {
      if (quotaContainer) {
        quotaContainer.innerHTML = `<div class="empty-state"><p>쿼터 목록 로드 실패: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  function updateQuotaStats(quotas) {
    if (statTotalQuotas) statTotalQuotas.textContent = `${quotas.length}개`;
    const totalCount = quotas.reduce((sum, q) => sum + (q.count || 0), 0);
    if (statTotalMerchants) statTotalMerchants.textContent = `${totalCount}건`;
    const stratifiedCount = quotas.filter(q => isQuotaStratified(q)).length;
    if (statStratifiedQuotas) statStratifiedQuotas.textContent = `${stratifiedCount}개`;
    const withExcel = quotas.filter(q => q.excelFileName).length;
    const rate = quotas.length > 0 ? Math.round((withExcel / quotas.length) * 100) : 100;
    if (statExcelSync) statExcelSync.textContent = `${rate}%`;
  }

  // 초기 로딩 분기
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash === 'quotas') {
    switchTab('quotas');
  } else {
    switchTab('campaigns');
  }
});
