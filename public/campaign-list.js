/**
 * 메인 목차 대시보드 - 캠페인 목록 및 조사 쿼터 보관함 통합 제어 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
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

  tabNavCampaigns.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = 'campaigns';
    switchTab('campaigns');
  });

  tabNavQuotas.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = 'quotas';
    switchTab('quotas');
  });

  // URL hash 변경 및 초기 진입 감지
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'quotas') switchTab('quotas');
    else switchTab('campaigns');
  });

  // ------------------------------------------------------------------------
  // 2. 캠페인 관리, 필터(전통시장/상인회/소상공인), 실시간 검색 & 자동완성
  // ------------------------------------------------------------------------
  const campaignContainer = document.getElementById('campaign-list-container');
  const btnOpenModal = document.getElementById('btn-open-new-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modal = document.getElementById('modal-new-campaign');
  const formNew = document.getElementById('form-new-campaign');

  const statTotal = document.getElementById('stat-total-campaigns');
  const statB2b = document.getElementById('stat-b2b-campaigns');
  const statB2c = document.getElementById('stat-b2c-campaigns');
  const statCompleted = document.getElementById('stat-completed-campaigns');

  // [신규] 카테고리 필터 탭 & 뱃지
  const filterCatPills = document.querySelectorAll('.filter-tab-pill');
  const badgeFilterAll = document.getElementById('badge-filter-all');
  const badgeFilterTraditional = document.getElementById('badge-filter-traditional');
  const badgeFilterAssoc = document.getElementById('badge-filter-assoc');
  const badgeFilterSmallbiz = document.getElementById('badge-filter-smallbiz');

  // [신규] 상태 필터 & 검색 요소
  const statusChips = document.querySelectorAll('.status-chip');
  const inputSearch = document.getElementById('input-campaign-search');
  const btnClearSearch = document.getElementById('btn-clear-campaign-search');
  const autocompleteDropdown = document.getElementById('campaign-autocomplete-dropdown');
  const filterStatusInfoBar = document.getElementById('filter-status-info-bar');
  const filterInfoLabel = document.getElementById('filter-info-label');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  let allCampaigns = [];
  let currentCategory = 'all'; // 'all' | 'traditional' | 'assoc' | 'smallbiz'
  let currentStatus = 'all';   // 'all' | 'active' | 'completed'
  let currentSearchQuery = '';
  let selectedAutocompleteIdx = -1;

  // 카테고리 판별 헬퍼 (전통시장, 상인회, 소상공인)
  function getCampaignCategory(c) {
    const type = (c.surveyType || '').toLowerCase();
    const title = (c.title || '').toLowerCase();
    const desc = (c.description || '').toLowerCase();

    // 1. 소상공인 (Metrix GetData SNUM 622 패널조사 등)
    if (type === 'metrix_panel' || title.includes('소상공인') || title.includes('메트릭스') || desc.includes('소상공인') || desc.includes('메트릭스')) {
      return 'smallbiz';
    }

    // 2. 상인회 (Kstat 상인회 실태조사 25단계)
    if (type === 'kstat_assoc' || title.includes('상인회') || desc.includes('상인회')) {
      return 'assoc';
    }

    // 3. 전통시장 점포조사 (Kstat 점포조사 및 기타 기본형)
    return 'traditional';
  }

  function getCategoryMeta(catKey) {
    switch (catKey) {
      case 'smallbiz':
        return { label: '소상공인 패널', icon: 'fa-building-user', class: 'smallbiz' };
      case 'assoc':
        return { label: '상인회 실태', icon: 'fa-sitemap', class: 'assoc' };
      case 'traditional':
      default:
        return { label: '전통시장 점포', icon: 'fa-store', class: 'traditional' };
    }
  }

  // 검색어 하이라이트 헬퍼
  function highlightQuery(text, query) {
    if (!query || !query.trim()) return text;
    const safeQ = query.trim().replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeQ})`, 'gi');
    return text.replace(regex, '<mark class="search-match-highlight">$1</mark>');
  }

  // 다중 필터 적용 헬퍼
  function getFilteredCampaigns() {
    return allCampaigns.filter(c => {
      const cat = getCampaignCategory(c);

      // 1. 카테고리 필터 (전통시장 / 상인회 / 소상공인)
      if (currentCategory !== 'all' && cat !== currentCategory) {
        return false;
      }

      // 2. 상태 필터 (전체 / 진행·대기중 / 완료)
      const isCompleted = (c.status === 'completed');
      if (currentStatus === 'completed' && !isCompleted) return false;
      if (currentStatus === 'active' && isCompleted) return false;

      // 3. 검색어 필터 (제목, 설명, ID, 카테고리명)
      if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        const title = (c.title || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        const id = (c.id || '').toLowerCase();
        const catMeta = getCategoryMeta(cat);
        const catName = catMeta.label.toLowerCase();

        const isMatch = title.includes(q) || desc.includes(q) || id.includes(q) || catName.includes(q);
        if (!isMatch) return false;
      }

      return true;
    });
  }

  // 카테고리별 카운트 배지 갱신
  function updateCategoryCounts() {
    let countTraditional = 0;
    let countAssoc = 0;
    let countSmallbiz = 0;

    allCampaigns.forEach(c => {
      const cat = getCampaignCategory(c);
      if (cat === 'traditional') countTraditional++;
      else if (cat === 'assoc') countAssoc++;
      else if (cat === 'smallbiz') countSmallbiz++;
    });

    if (badgeFilterAll) badgeFilterAll.textContent = allCampaigns.length;
    if (badgeFilterTraditional) badgeFilterTraditional.textContent = countTraditional;
    if (badgeFilterAssoc) badgeFilterAssoc.textContent = countAssoc;
    if (badgeFilterSmallbiz) badgeFilterSmallbiz.textContent = countSmallbiz;
  }

  // 필터 적용 및 렌더링 총괄
  function applyFiltersAndRender() {
    const filtered = getFilteredCampaigns();
    renderCampaigns(filtered);

    // 필터 활성화 여부 안내 스트립 동기화
    const isFiltered = (currentCategory !== 'all' || currentStatus !== 'all' || !!currentSearchQuery);
    if (filterStatusInfoBar) {
      if (isFiltered) {
        filterStatusInfoBar.classList.remove('d-none');
        let filterDesc = [];
        if (currentCategory !== 'all') {
          const catMeta = getCategoryMeta(currentCategory);
          filterDesc.push(`카테고리: ${catMeta.label}`);
        }
        if (currentStatus === 'completed') filterDesc.push('상태: 완료된 항목');
        else if (currentStatus === 'active') filterDesc.push('상태: 진행·대기중');
        if (currentSearchQuery) filterDesc.push(`검색어: "${currentSearchQuery}"`);

        if (filterInfoLabel) {
          filterInfoLabel.innerHTML = `필터 적용 결과: <strong>${filtered.length}건</strong> (전체 ${allCampaigns.length}건 중) &nbsp;•&nbsp; <span class="text-dim">[${filterDesc.join(', ')}]</span>`;
        }
      } else {
        filterStatusInfoBar.classList.add('d-none');
      }
    }
  }

  // 모달 탭 스위칭 (B2B/B2C)
  const modalTabB2b = document.getElementById('modal-tab-b2b');
  const modalTabB2c = document.getElementById('modal-tab-b2c');
  const modalQuotaRadios = document.querySelectorAll('input[name="new-quota-type"]');

  modalQuotaRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'b2b') {
        modalTabB2b.classList.add('active');
        modalTabB2c.classList.remove('active');
      } else {
        modalTabB2c.classList.add('active');
        modalTabB2b.classList.remove('active');
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
          modalTabSurveyAssoc.classList.add('active');
          modalTabSurveyStore.classList.remove('active');
        } else {
          modalTabSurveyStore.classList.add('active');
          modalTabSurveyAssoc.classList.remove('active');
        }
      });
    });
  }

  btnOpenModal.addEventListener('click', () => { modal.classList.add('is-open'); });
  btnCloseModal.addEventListener('click', () => { modal.classList.remove('is-open'); });
  btnCancelModal.addEventListener('click', () => { modal.classList.remove('is-open'); });

  async function loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const campaigns = await res.json();
      allCampaigns = Array.isArray(campaigns) ? campaigns : [];
      updateCampaignStats(allCampaigns);
      updateCategoryCounts();
      applyFiltersAndRender();
    } catch (err) {
      campaignContainer.innerHTML = `<div class="empty-state"><p>캠페인 목록을 불러오지 못했습니다: ${err.message}</p></div>`;
    }
  }

  function updateCampaignStats(campaigns) {
    if (statTotal) statTotal.textContent = `${campaigns.length}건`;
    if (statB2b) statB2b.textContent = `${campaigns.filter(c => c.quotaType === 'b2b').length}건`;
    if (statB2c) statB2c.textContent = `${campaigns.filter(c => c.quotaType === 'b2c').length}건`;
    if (statCompleted) statCompleted.textContent = `${campaigns.filter(c => c.status === 'completed').length}건`;
  }

  // 통계 카드 클릭 시 빠른 필터링 연동
  if (statCompleted && typeof statCompleted.closest === 'function') {
    const card = statCompleted.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 완료된 설문만 필터링';
      card.addEventListener('click', () => {
        statusChips.forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-status') === 'completed');
        });
        currentStatus = 'completed';
        applyFiltersAndRender();
      });
    }
  }
  if (statTotal && typeof statTotal.closest === 'function') {
    const card = statTotal.closest('.metric-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = '클릭하여 전체 목록 보기';
      card.addEventListener('click', () => {
        resetAllFilters();
      });
    }
  }

  // 캠페인 카드 그리드 렌더링
  function renderCampaigns(campaigns) {
    if (allCampaigns.length === 0) {
      campaignContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-folder-open empty-state-icon"></i>
          <p class="empty-state-text">등록된 설문조사 캠페인이 없습니다.</p>
          <button class="btn-pill btn-pill-primary mt-14" onclick="document.getElementById('btn-open-new-modal').click()">
            <i class="fa-solid fa-plus"></i> 첫 번째 설문 캠페인 만들기
          </button>
        </div>
      `;
      return;
    }

    if (campaigns.length === 0) {
      campaignContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-filter-circle-xmark empty-state-icon" style="color: #94a3b8;"></i>
          <p class="empty-state-text">선택하신 조건(카테고리/상태/검색어)에 일치하는 캠페인이 없습니다.</p>
          <button class="btn-pill btn-pill-secondary mt-14" id="btn-empty-reset-filters">
            <i class="fa-solid fa-rotate-left"></i> 필터 및 검색어 초기화
          </button>
        </div>
      `;
      const btnEmptyReset = document.getElementById('btn-empty-reset-filters');
      if (btnEmptyReset) btnEmptyReset.addEventListener('click', resetAllFilters);
      return;
    }

    campaignContainer.innerHTML = campaigns.map(c => {
      const cat = getCampaignCategory(c);
      const catMeta = getCategoryMeta(cat);
      const isAssoc = (cat === 'assoc');
      const isSmallBiz = (cat === 'smallbiz');
      const isCompleted = (c.status === 'completed');

      const quotaLabel = isAssoc 
        ? '상인회 대상 (25단계)' 
        : (isSmallBiz ? '소상공인 패널 (120단계)' : (c.quotaType === 'b2b' ? '사업주 대상 (B2B)' : '개인 대상 (B2C)'));
      const quotaBadgeClass = isAssoc ? 'assoc' : (isSmallBiz ? 'b2b' : (c.quotaType === 'b2b' ? 'b2b' : 'b2c'));
      const quotaIcon = isAssoc ? 'fa-sitemap' : (isSmallBiz ? 'fa-building-user' : (c.quotaType === 'b2b' ? 'fa-building' : 'fa-user'));

      let statusText = '대기 중';
      let statusClass = 'ready';
      if (c.status === 'building') { statusText = '쿼터 DB 구축 중'; statusClass = 'building'; }
      else if (c.status === 'running') { statusText = '설문 자동화 진행 중'; statusClass = 'running'; }
      else if (isCompleted) { statusText = '조사 마감 완료'; statusClass = 'completed'; }

      const dbCount = c.quotaDatabase ? c.quotaDatabase.length : 0;
      const targetCount = c.quotaConfig?.targetCount || (isAssoc ? 8 : (isSmallBiz ? 54 : 1));
      const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR') : '-';

      const cardClass = `campaign-card ${isAssoc ? 'assoc-card' : ''} ${isCompleted ? 'completed-card' : ''}`;

      return `
        <div class="${cardClass}" data-id="${c.id}">
          <div>
            <div class="campaign-card-header">
              <div class="flex-center-gap-6 flex-wrap">
                <span class="badge-category ${catMeta.class}"><i class="fa-solid ${catMeta.icon}"></i> ${catMeta.label}</span>
                <span class="badge-quota-type ${quotaBadgeClass}"><i class="fa-solid ${quotaIcon}"></i> ${quotaLabel}</span>
              </div>
              <div class="flex-center-gap-6">
                ${isCompleted ? '<span class="completed-stamp-badge"><i class="fa-solid fa-check-double"></i> 100% 완료</span>' : ''}
                <span class="badge-status ${statusClass}">${isCompleted ? '<i class="fa-solid fa-circle-check"></i> ' : ''}${statusText}</span>
              </div>
            </div>
            <h3 class="campaign-title">
              ${isCompleted ? '<i class="fa-solid fa-circle-check text-success-sm"></i>' : ''}
              ${highlightQuery(escapeHtml(c.title || '무제 캠페인'), currentSearchQuery)}
            </h3>
            <p class="campaign-desc">
              ${highlightQuery(escapeHtml(c.description || (isAssoc ? '전통시장 상인회 25단계 전년도 일치 미러링 및 2026 정책 가이드 설문' : (isSmallBiz ? '메트릭스 경기도 소상공인 54개 패널조사 98% 안전 대기 자동화' : '상세 설정을 통해 쿼터 DB 및 방향성을 구성하세요.'))), currentSearchQuery)}
            </p>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>조사 쿼터 DB</span>
                <strong class="${isCompleted ? 'completed-stat' : ''}">
                  ${isCompleted ? '<i class="fa-solid fa-check text-success"></i> ' : ''}
                  ${isAssoc ? `${dbCount}개 시장 확보 / 대상 8개소` : (isSmallBiz ? `${dbCount}개 패널 확보 / 전수 54개` : `${dbCount}개 점포 보유 / 목표 ${targetCount}개`)}
                </strong>
              </div>
              <div class="meta-item">
                <span>등록일</span>
                <strong>${dateStr}</strong>
              </div>
            </div>

            <div class="campaign-card-footer">
              ${isCompleted 
                ? `<a href="survey-detail.html?id=${c.id}" class="btn-pill btn-pill-completed"><i class="fa-solid fa-clipboard-check"></i> 결과 및 작업실 열람 <i class="fa-solid fa-arrow-right"></i></a>`
                : `<a href="survey-detail.html?id=${c.id}" class="btn-pill btn-pill-primary btn-enter-room">설문 작업실 입장 <i class="fa-solid fa-arrow-right"></i></a>`}
              <button type="button" class="btn-icon-circle btn-delete" data-id="${c.id}" title="캠페인 삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    campaignContainer.querySelectorAll('.btn-delete').forEach(btn => {
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

  // -------------------------------------------------------------
  // 필터 탭 & 상태 칩 이벤트 바인딩
  // -------------------------------------------------------------
  filterCatPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterCatPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.getAttribute('data-category') || 'all';
      applyFiltersAndRender();
    });
  });

  statusChips.forEach(chip => {
    chip.addEventListener('click', () => {
      statusChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatus = chip.getAttribute('data-status') || 'all';
      applyFiltersAndRender();
    });
  });

  // 필터 초기화 함수
  function resetAllFilters() {
    currentCategory = 'all';
    currentStatus = 'all';
    currentSearchQuery = '';
    if (inputSearch) inputSearch.value = '';
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

  // -------------------------------------------------------------
  // 스마트 검색 & 자동완성 드롭다운 이벤트 바인딩
  // -------------------------------------------------------------
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
      const catMeta = getCategoryMeta(cat);
      const title = (c.title || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || catMeta.label.toLowerCase().includes(q);
    }).slice(0, 8); // 상위 8개

    if (matches.length === 0) {
      autocompleteDropdown.innerHTML = `
        <div class="autocomplete-empty">
          <i class="fa-solid fa-magnifying-glass mb-8" style="font-size: 20px; opacity: 0.4;"></i>
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
          const catMeta = getCategoryMeta(cat);
          const isComp = (c.status === 'completed');
          const dbCount = c.quotaDatabase ? c.quotaDatabase.length : 0;
          return `
            <div class="autocomplete-item" data-id="${c.id}" data-idx="${idx}">
              <div class="autocomplete-item-left">
                <span class="badge-category ${catMeta.class}"><i class="fa-solid ${catMeta.icon}"></i> ${catMeta.label}</span>
                <span class="autocomplete-item-title" title="${escapeHtml(c.title)}">${highlightQuery(escapeHtml(c.title), query)}</span>
              </div>
              <div class="autocomplete-item-right">
                <span class="font-caption text-dim font-mono">${dbCount}개</span>
                <span class="badge-status ${isComp ? 'completed' : (c.status === 'running' ? 'running' : 'ready')}">${isComp ? '완료' : (c.status === 'running' ? '진행' : '대기')}</span>
                <a href="survey-detail.html?id=${c.id}" class="text-primary-color font-bold font-caption ml-4" title="바로 열기"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
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

    // 드롭다운 아이템 클릭 이벤트
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
    // 실시간 타이핑 감지
    inputSearch.addEventListener('input', () => {
      currentSearchQuery = inputSearch.value.trim();
      if (btnClearSearch) {
        btnClearSearch.classList.toggle('d-none', !currentSearchQuery);
      }
      applyFiltersAndRender();
      renderAutocomplete(currentSearchQuery);
    });

    // 키보드 방향키 및 엔터, ESC 지원
    inputSearch.addEventListener('keydown', (e) => {
      const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
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

    // 포커스 시 이전 검색어가 있으면 자동완성 다시 표시
    inputSearch.addEventListener('focus', () => {
      if (inputSearch.value.trim()) {
        renderAutocomplete(inputSearch.value.trim());
      }
    });
  }

  // 검색어 초기화(X) 버튼
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

  // 외부 클릭 시 자동완성 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.campaign-search-box')) {
      if (autocompleteDropdown) autocompleteDropdown.classList.add('hidden');
    }
  });

  // 단축키 '/' 키 누르면 검색창으로 즉시 포커스
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== inputSearch && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (inputSearch) {
        inputSearch.focus();
        inputSearch.select();
      }
    }
  });

  formNew.addEventListener('submit', async (e) => {
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
  // 3. 조사 쿼터 보관함 (Quota Library) 관련 로직
  // ------------------------------------------------------------------------
  const quotaContainer = document.getElementById('quota-list-container');
  const statTotalQuotas = document.getElementById('stat-total-quotas');
  const statTotalMerchants = document.getElementById('stat-total-quota-merchants');
  const statStratifiedQuotas = document.getElementById('stat-stratified-quotas');
  const statExcelSync = document.getElementById('stat-excel-sync-rate');

  async function loadQuotas() {
    try {
      quotaContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-spinner fa-spin empty-state-icon"></i>
          <p class="empty-state-text">보관된 조사 쿼터 목록을 불러오는 중입니다...</p>
        </div>
      `;
      const res = await fetch('/api/quota/list');
      if (!res.ok) throw new Error('쿼터 목록을 가져오지 못했습니다.');
      const quotas = await res.json();
      updateQuotaStats(quotas);
      renderQuotas(quotas);
    } catch (err) {
      quotaContainer.innerHTML = `<div class="empty-state"><p>쿼터 목록 로드 실패: ${err.message}</p></div>`;
    }
  }

  function updateQuotaStats(quotas) {
    statTotalQuotas.textContent = `${quotas.length}개`;
    const totalCount = quotas.reduce((sum, q) => sum + (q.count || 0), 0);
    statTotalMerchants.textContent = `${totalCount}건`;
    const stratifiedCount = quotas.filter(q => q.industryDistribution && Object.keys(q.industryDistribution).length >= 5).length;
    statStratifiedQuotas.textContent = `${stratifiedCount}개`;
    const withExcel = quotas.filter(q => q.excelFileName).length;
    const rate = quotas.length > 0 ? Math.round((withExcel / quotas.length) * 100) : 100;
    statExcelSync.textContent = `${rate}%`;
  }

  function renderQuotas(quotas) {
    if (quotas.length === 0) {
      quotaContainer.innerHTML = `
        <div class="empty-state empty-state-card">
          <i class="fa-solid fa-database empty-state-icon"></i>
          <p class="empty-state-text">보관된 조사 쿼터가 아직 없습니다.</p>
          <a href="quota-builder.html" class="btn-pill btn-pill-primary mt-14">
            <i class="fa-solid fa-plus"></i> 새 쿼터 생성기 바로가기
          </a>
        </div>
      `;
      return;
    }

    quotaContainer.innerHTML = quotas.map(q => {
      const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleDateString('ko-KR') : '-';
      const marketName = q.marketName || '일반 사업자';
      const isStratified = q.industryDistribution && Object.keys(q.industryDistribution).length >= 5;

      // 업종 칩 렌더링
      let industryChipsHtml = '';
      if (q.industryDistribution) {
        const iconMap = {
          '농산물': '🌾', '축산물': '🥩', '수산물': '🐟',
          '가공식품': '🍱', '의류신발': '👗', '가정용품': '🏠',
          '음식점업': '🍽️', '기타소매': '🛒', '근린상권': '💈', '기타': '📦'
        };
        industryChipsHtml = `
          <div class="quota-industry-chips">
            ${Object.entries(q.industryDistribution).map(([ind, cnt]) => `
              <span class="quota-ind-badge">${iconMap[ind] || '🏷️'} ${escapeHtml(ind)} ${cnt}</span>
            `).join('')}
          </div>
        `;
      } else {
        industryChipsHtml = `
          <div class="quota-industry-chips">
            <span class="quota-ind-badge">단일 업종 / 키워드: ${escapeHtml(q.keyword || '전체')}</span>
          </div>
        `;
      }

      return `
        <div class="campaign-card quota-card" data-filename="${escapeHtml(q.fileName)}">
          <div>
            <div class="campaign-card-header">
              <span class="badge-quota-type b2b"><i class="fa-solid fa-shop"></i> ${escapeHtml(marketName)}</span>
              <span class="badge-status ${isStratified ? 'success' : 'ready'}">
                ${isStratified ? '9대 업종 층화 표본' : '단순 순차 수집'}
              </span>
            </div>
            <h3 class="campaign-title">${escapeHtml(q.title)}</h3>
            <div class="quota-chips-container mt-8 mb-12">
              ${industryChipsHtml}
            </div>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>확보 표본수</span>
                <strong class="text-primary-color">${q.count}건</strong>
              </div>
              <div class="meta-item">
                <span>생성 일자</span>
                <strong>${dateStr}</strong>
              </div>
            </div>

            <div class="campaign-card-footer quota-card-actions">
              <a href="quota-detail.html?file=${encodeURIComponent(q.fileName)}" class="btn-pill btn-pill-primary">
                <i class="fa-solid fa-pen-to-square"></i> 점포 상세·수정
              </a>
              ${q.excelFileName ? `
                <a href="/api/quota/download/${encodeURIComponent(q.excelFileName)}" class="btn-pill btn-pill-secondary btn-download-excel" title="Excel 파일 다운로드">
                  <i class="fa-solid fa-file-excel icon-excel-green"></i> 엑셀
                </a>
              ` : ''}
              <button type="button" class="btn-pill btn-pill-success btn-create-camp-from-quota" data-filename="${escapeHtml(q.fileName)}" data-title="${escapeHtml(q.title)}" title="이 쿼터로 새 캠페인 생성">
                <i class="fa-solid fa-play"></i> 캠페인 시작
              </button>
              <button type="button" class="btn-icon-circle btn-delete-quota" data-filename="${escapeHtml(q.fileName)}" title="쿼터 삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 이벤트 리스너 바인딩
    // 1. 캠페인 시작
    quotaContainer.querySelectorAll('.btn-create-camp-from-quota').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const quotaFileName = btn.getAttribute('data-filename');
        const defaultTitle = btn.getAttribute('data-title') || '새로운 설문조사 캠페인';
        const campTitle = prompt('새 캠페인의 제목을 입력해 주세요:', defaultTitle);
        if (!campTitle || !campTitle.trim()) return;

        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 생성 중...';
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

    // 2. 쿼터 삭제
    quotaContainer.querySelectorAll('.btn-delete-quota').forEach(btn => {
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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 초기 로딩 분기
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash === 'quotas') {
    switchTab('quotas');
  } else {
    switchTab('campaigns');
  }
});
