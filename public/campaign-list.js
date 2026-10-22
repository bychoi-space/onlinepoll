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
  // 2. 캠페인 관리 관련 요소
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

  btnOpenModal.addEventListener('click', () => { modal.classList.add('is-open'); });
  btnCloseModal.addEventListener('click', () => { modal.classList.remove('is-open'); });
  btnCancelModal.addEventListener('click', () => { modal.classList.remove('is-open'); });

  async function loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const campaigns = await res.json();
      renderCampaigns(campaigns);
      updateCampaignStats(campaigns);
    } catch (err) {
      campaignContainer.innerHTML = `<div class="empty-state"><p>캠페인 목록을 불러오지 못했습니다: ${err.message}</p></div>`;
    }
  }

  function updateCampaignStats(campaigns) {
    statTotal.textContent = `${campaigns.length}건`;
    statB2b.textContent = `${campaigns.filter(c => c.quotaType === 'b2b').length}건`;
    statB2c.textContent = `${campaigns.filter(c => c.quotaType === 'b2c').length}건`;
    statCompleted.textContent = `${campaigns.filter(c => c.status === 'completed').length}건`;
  }

  function renderCampaigns(campaigns) {
    if (campaigns.length === 0) {
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

    campaignContainer.innerHTML = campaigns.map(c => {
      const isAssoc = (c.surveyType === 'kstat_assoc');
      const quotaLabel = isAssoc ? '상인회 대상 (25단계)' : (c.quotaType === 'b2b' ? '사업주 대상 (B2B)' : '개인 대상 (B2C)');
      const quotaBadgeClass = isAssoc ? 'assoc' : (c.quotaType === 'b2b' ? 'b2b' : 'b2c');
      const quotaIcon = isAssoc ? 'fa-sitemap' : (c.quotaType === 'b2b' ? 'fa-building' : 'fa-user');

      let statusText = '대기 중';
      let statusClass = 'ready';
      if (c.status === 'building') { statusText = '쿼터 DB 구축 중'; statusClass = 'building'; }
      else if (c.status === 'running') { statusText = '설문 자동화 진행 중'; statusClass = 'running'; }
      else if (c.status === 'completed') { statusText = '설문 완료'; statusClass = 'completed'; }

      const dbCount = c.quotaDatabase ? c.quotaDatabase.length : 0;
      const targetCount = c.quotaConfig?.targetCount || (isAssoc ? 8 : 1);
      const dateStr = new Date(c.createdAt).toLocaleDateString('ko-KR');

      return `
        <div class="campaign-card ${isAssoc ? 'assoc-card' : ''}" data-id="${c.id}">
          <div>
            <div class="campaign-card-header">
              <span class="badge-quota-type ${quotaBadgeClass}"><i class="fa-solid ${quotaIcon}"></i> ${quotaLabel}</span>
              <span class="badge-status ${statusClass}">${statusText}</span>
            </div>
            <h3 class="campaign-title">${escapeHtml(c.title)}</h3>
            <p class="campaign-desc">${escapeHtml(c.description || (isAssoc ? '전통시장 상인회 25단계 전년도 일치 미러링 및 2026 정책 가이드 설문' : '상세 설정을 통해 쿼터 DB 및 방향성을 구성하세요.'))}</p>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>조사 쿼터 DB</span>
                <strong>${isAssoc ? `${dbCount}개 시장 확보 / 대상 8개소` : (c.quotaType === 'b2b' ? `${dbCount}개 보유 / 목표 ${targetCount}개` : '개인 페르소나 자동변주')}</strong>
              </div>
              <div class="meta-item">
                <span>등록일</span>
                <strong>${dateStr}</strong>
              </div>
            </div>

            <div class="campaign-card-footer">
              <a href="survey-detail.html?id=${c.id}" class="btn-pill btn-pill-primary btn-enter-room">
                설문 작업실 입장 <i class="fa-solid fa-arrow-right"></i>
              </a>
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
