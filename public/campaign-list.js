/**
 * 메인 목차 대시보드 - 캠페인 목록 제어 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('campaign-list-container');
  const btnOpenModal = document.getElementById('btn-open-new-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modal = document.getElementById('modal-new-campaign');
  const formNew = document.getElementById('form-new-campaign');

  // 통계 요소
  const statTotal = document.getElementById('stat-total-campaigns');
  const statB2b = document.getElementById('stat-b2b-campaigns');
  const statB2c = document.getElementById('stat-b2c-campaigns');
  const statCompleted = document.getElementById('stat-completed-campaigns');

  // 모달 탭
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

  // 모달 토글 (Zero-Inline: CSS 클래스 제어)
  btnOpenModal.addEventListener('click', () => { modal.classList.add('is-open'); });
  btnCloseModal.addEventListener('click', () => { modal.classList.remove('is-open'); });
  btnCancelModal.addEventListener('click', () => { modal.classList.remove('is-open'); });

  // 캠페인 목록 로드
  async function loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const campaigns = await res.json();
      renderCampaigns(campaigns);
      updateStats(campaigns);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>캠페인 목록을 불러오지 못했습니다: ${err.message}</p></div>`;
    }
  }

  function updateStats(campaigns) {
    statTotal.textContent = `${campaigns.length}건`;
    statB2b.textContent = `${campaigns.filter(c => c.quotaType === 'b2b').length}건`;
    statB2c.textContent = `${campaigns.filter(c => c.quotaType === 'b2c').length}건`;
    statCompleted.textContent = `${campaigns.filter(c => c.status === 'completed').length}건`;
  }

  function renderCampaigns(campaigns) {
    if (campaigns.length === 0) {
      container.innerHTML = `
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

    container.innerHTML = campaigns.map(c => {
      const quotaLabel = c.quotaType === 'b2b' ? '사업주 대상 (B2B)' : '개인 대상 (B2C)';
      const quotaBadgeClass = c.quotaType === 'b2b' ? 'b2b' : 'b2c';
      const quotaIcon = c.quotaType === 'b2b' ? 'fa-building' : 'fa-user';

      let statusText = '대기 중';
      let statusClass = 'ready';
      if (c.status === 'building') { statusText = '쿼터 DB 구축 중'; statusClass = 'building'; }
      else if (c.status === 'running') { statusText = '설문 자동화 진행 중'; statusClass = 'running'; }
      else if (c.status === 'completed') { statusText = '설문 완료'; statusClass = 'completed'; }

      const dbCount = c.quotaDatabase ? c.quotaDatabase.length : 0;
      const targetCount = c.quotaConfig?.targetCount || 1;
      const dateStr = new Date(c.createdAt).toLocaleDateString('ko-KR');

      return `
        <div class="campaign-card" data-id="${c.id}">
          <div>
            <div class="campaign-card-header">
              <span class="badge-quota-type ${quotaBadgeClass}"><i class="fa-solid ${quotaIcon}"></i> ${quotaLabel}</span>
              <span class="badge-status ${statusClass}">${statusText}</span>
            </div>
            <h3 class="campaign-title">${escapeHtml(c.title)}</h3>
            <p class="campaign-desc">${escapeHtml(c.description || '상세 설정을 통해 쿼터 DB 및 방향성을 구성하세요.')}</p>
          </div>

          <div>
            <div class="campaign-meta-box">
              <div class="meta-item">
                <span>조사 쿼터 DB</span>
                <strong>${c.quotaType === 'b2b' ? `${dbCount}개 보유 / 목표 ${targetCount}개` : '개인 페르소나 자동변주'}</strong>
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

    // 삭제 버튼 바인딩
    container.querySelectorAll('.btn-delete').forEach(btn => {
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

  // 새 캠페인 폼 제출
  formNew.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-title').value.trim();
    const description = document.getElementById('new-desc').value.trim();
    const quotaType = document.querySelector('input[name="new-quota-type"]:checked').value;

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, quotaType })
      });
      const newCamp = await res.json();
      window.location.href = `survey-detail.html?id=${newCamp.id}`;
    } catch (err) {
      alert('캠페인 생성에 실패했습니다: ' + err.message);
    }
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  loadCampaigns();
});
