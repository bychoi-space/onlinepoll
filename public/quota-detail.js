/**
 * 조사 쿼터 상세 및 점포 스프레드시트 편집기 스크립트 (quota-detail.js)
 * 인라인 셀 편집, 점포 추가/삭제, Excel 자동 동기화 저장, 캠페인 즉시 생성 연동
 */

async function initQuotaDetailPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const fileName = urlParams.get('file');

  if (!fileName) {
    alert('잘못된 접근입니다. 쿼터 파일명이 지정되지 않았습니다.');
    window.location.href = 'index.html#quotas';
    return;
  }

  // ------------------------------------------------------------------------
  // DOM 요소 참조
  // ------------------------------------------------------------------------
  const titleEl = document.getElementById('quota-detail-title');
  const badgeMarket = document.getElementById('badge-market');
  const badgeStratified = document.getElementById('badge-stratified');
  const badgeCount = document.getElementById('badge-total-count');
  const displayName = document.getElementById('quota-display-name');
  const displayDesc = document.getElementById('quota-display-desc');
  const distKpiBar = document.getElementById('quota-distribution-kpi-bar');
  const unsavedBadge = document.getElementById('unsaved-badge');

  const btnSave = document.getElementById('btn-save-quota');
  const btnLaunch = document.getElementById('btn-launch-campaign');
  const btnDownloadXlsx = document.getElementById('btn-download-xlsx');
  const btnEnrich = document.getElementById('btn-enrich-quota');

  const inputSearch = document.getElementById('input-search-merchant');
  const filteredCountLabel = document.getElementById('filtered-count-label');
  const tbody = document.getElementById('quota-editor-tbody');

  // 점포 추가 모달
  const modalAdd = document.getElementById('modal-add-merchant');
  const btnOpenAdd = document.getElementById('btn-open-add-modal');
  const btnCloseAdd = document.getElementById('btn-close-add-modal');
  const btnCancelAdd = document.getElementById('btn-cancel-add-modal');
  const formAdd = document.getElementById('form-add-merchant');

  // 상태 관리
  let originalQuota = null;
  let currentData = [];
  let isDirty = false;
  let searchTerm = '';

  // ------------------------------------------------------------------------
  // 1. 쿼터 상세 데이터 로드
  // ------------------------------------------------------------------------
  async function loadQuotaDetail() {
    try {
      const res = await fetch(`/api/quota/${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error('쿼터 데이터를 찾을 수 없습니다.');
      const json = await res.json();
      originalQuota = json.quota;
      currentData = JSON.parse(JSON.stringify(originalQuota.data || []));

      renderHeaderInfo();
      renderDistributionKpi();
      renderTable();
      markDirty(false);
    } catch (err) {
      alert('쿼터 로드 실패: ' + err.message);
      window.location.href = 'index.html#quotas';
    }
  }

  function renderHeaderInfo() {
    titleEl.textContent = originalQuota.title || fileName;
    displayName.textContent = originalQuota.title || fileName;
    const marketName = originalQuota.marketName || '일반 사업자';
    badgeMarket.textContent = marketName;
    badgeCount.textContent = `${currentData.length}건`;

    const isStratified = originalQuota.industryDistribution && Object.keys(originalQuota.industryDistribution).length >= 5;
    if (isStratified) {
      badgeStratified.className = 'badge-status success';
      badgeStratified.textContent = '9대 업종 층화 표본';
    } else {
      badgeStratified.className = 'badge-status ready';
      badgeStratified.textContent = '단순 순차 수집';
    }

    const createdStr = originalQuota.createdAt ? new Date(originalQuota.createdAt).toLocaleString('ko-KR') : '-';
    displayDesc.textContent = `대상 시장: ${marketName} · 확보 표본: ${currentData.length}건 · 최초 생성: ${createdStr}`;

    const excelName = fileName.replace('.json', '.xlsx');
    btnDownloadXlsx.href = `/api/quota/download/${encodeURIComponent(excelName)}`;
  }

  function renderDistributionKpi() {
    // 실시간 업종 집계
    const counts = {};
    const standardKeys = [
      { key: '농산물', label: '농산물', icon: '🌾' },
      { key: '축산물', label: '축산물', icon: '🥩' },
      { key: '수산물', label: '수산물', icon: '🐟' },
      { key: '가공식품', label: '가공식품', icon: '🍱' },
      { key: '의류', label: '의류신발', icon: '👗' },
      { key: '가정용품', label: '가정용품', icon: '🏠' },
      { key: '음식점', label: '음식점업', icon: '🍽️' },
      { key: '기타소매', label: '기타소매', icon: '🛒' },
      { key: '근린상권', label: '근린상권', icon: '💈' }
    ];

    currentData.forEach(item => {
      const raw = String(item.handledItems || item.industry || '기타');
      const found = standardKeys.find(s => raw.includes(s.key));
      const cat = found ? found.label : '기타';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    distKpiBar.innerHTML = standardKeys.map(s => {
      const cnt = counts[s.label] || 0;
      return `
        <div class="kpi-chip ${cnt > 0 ? 'kpi-ready' : ''}">
          <span class="kpi-label">${s.icon} ${s.label}</span>
          <span class="kpi-val">${cnt}</span>
        </div>
      `;
    }).join('');
  }

  // ------------------------------------------------------------------------
  // 2. 스프레드시트형 점포 테이블 렌더링
  // ------------------------------------------------------------------------
  function renderTable() {
    const term = searchTerm.trim().toLowerCase();
    const filtered = currentData.filter(item => {
      if (!term) return true;
      return (
        String(item.companyName || '').toLowerCase().includes(term) ||
        String(item.ceoName || '').toLowerCase().includes(term) ||
        String(item.phone || '').toLowerCase().includes(term) ||
        String(item.bizNumber || '').toLowerCase().includes(term) ||
        String(item.handledItems || '').toLowerCase().includes(term) ||
        String(item.address || '').toLowerCase().includes(term)
      );
    });

    filteredCountLabel.textContent = `전체 ${currentData.length}개 중 ${filtered.length}개 표시`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-table-msg">
            ${term ? `"${escapeHtml(term)}" 검색 결과와 일치하는 점포가 없습니다.` : '등록된 점포 데이터가 없습니다.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const seq = item.seq;
      const indLabel = getIndustryBadgeText(item.handledItems);
      const isMissingCeo = !item.ceoName || item.ceoName.trim() === '' || item.ceoName === 'null';
      const isMissingPhone = !item.phone || item.phone.trim() === '' || item.phone === 'null';

      return `
        <tr data-seq="${seq}">
          <td class="col-seq font-mono text-dim">${seq}</td>
          <td class="col-ind">
            <span class="quota-ind-badge">${escapeHtml(indLabel)}</span>
          </td>
          <td class="col-biz-name editable-cell" data-field="companyName" data-seq="${seq}">
            <strong>${escapeHtml(item.companyName || '-')}</strong>
          </td>
          <td class="col-biz-num editable-cell font-mono" data-field="bizNumber" data-seq="${seq}">
            ${escapeHtml(item.bizNumber || '-')}
          </td>
          <td class="col-ceo editable-cell ${isMissingCeo ? 'text-dim' : ''}" data-field="ceoName" data-seq="${seq}">
            ${isMissingCeo ? '<span class="cell-missing">미확인 (클릭하여 입력)</span>' : escapeHtml(item.ceoName)}
          </td>
          <td class="col-phone editable-cell font-mono ${isMissingPhone ? 'text-dim' : ''}" data-field="phone" data-seq="${seq}">
            ${isMissingPhone ? '<span class="cell-missing">미확인 (클릭하여 입력)</span>' : escapeHtml(item.phone)}
          </td>
          <td class="col-date editable-cell font-mono" data-field="openDate" data-seq="${seq}">
            ${escapeHtml(item.openDate || '-')}
          </td>
          <td class="col-items editable-cell font-caption" data-field="handledItems" data-seq="${seq}">
            ${escapeHtml(item.handledItems || '-')}
          </td>
          <td class="col-addr editable-cell font-caption" data-field="address" data-seq="${seq}">
            ${escapeHtml(item.address || '-')}
          </td>
          <td class="col-actions">
            <button type="button" class="btn-icon-circle btn-delete-row" data-seq="${seq}" title="점포 삭제">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    bindCellInlineEditors();
    bindRowDeleteButtons();
  }

  function getIndustryBadgeText(raw) {
    if (!raw) return '기타';
    const s = String(raw);
    if (s.includes('농산물')) return '🌾 농산물';
    if (s.includes('축산물')) return '🥩 축산물';
    if (s.includes('수산물')) return '🐟 수산물';
    if (s.includes('가공식품')) return '🍱 가공식품';
    if (s.includes('의류')) return '👗 의류신발';
    if (s.includes('가정용품')) return '🏠 가정용품';
    if (s.includes('음식점')) return '🍽️ 음식점업';
    if (s.includes('기타소매')) return '🛒 기타소매';
    if (s.includes('근린상권')) return '💈 근린상권';
    return '🏷️ ' + s.split(' ')[0];
  }

  // ------------------------------------------------------------------------
  // 3. 인라인 셀 편집 (Inline Cell Editing)
  // ------------------------------------------------------------------------
  function bindCellInlineEditors() {
    tbody.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (cell.classList.contains('is-editing')) return;

        const seq = parseInt(cell.getAttribute('data-seq'), 10);
        const field = cell.getAttribute('data-field');
        const item = currentData.find(d => d.seq === seq);
        if (!item) return;

        const currentVal = item[field] || '';

        cell.classList.add('is-editing');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'figma-input cell-inline-input';
        input.value = currentVal === 'null' ? '' : currentVal;

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        function commitValue() {
          const newVal = input.value.trim();
          item[field] = newVal;
          cell.classList.remove('is-editing');
          cell.classList.add('cell-modified');
          markDirty(true);
          renderTable();
          renderDistributionKpi();
        }

        input.addEventListener('blur', commitValue);
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') {
            input.blur();
          } else if (ke.key === 'Escape') {
            cell.classList.remove('is-editing');
            renderTable();
          }
        });
      });
    });
  }

  function bindRowDeleteButtons() {
    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const seq = parseInt(btn.getAttribute('data-seq'), 10);
        const item = currentData.find(d => d.seq === seq);
        if (!item) return;

        if (confirm(`"${item.companyName || '이 점포'}"를 쿼터에서 삭제하시겠습니까?`)) {
          currentData = currentData.filter(d => d.seq !== seq);
          // 순번 재부여
          currentData.forEach((d, idx) => { d.seq = idx + 1; });
          badgeCount.textContent = `${currentData.length}건`;
          markDirty(true);
          renderTable();
          renderDistributionKpi();
        }
      });
    });
  }

  function markDirty(dirty) {
    isDirty = dirty;
    if (isDirty) {
      unsavedBadge.classList.remove('hidden');
      btnSave.classList.add('btn-pulse');
    } else {
      unsavedBadge.classList.add('hidden');
      btnSave.classList.remove('btn-pulse');
    }
  }

  // ------------------------------------------------------------------------
  // 4. 점포 수동 추가 모달
  // ------------------------------------------------------------------------
  btnOpenAdd.addEventListener('click', () => { modalAdd.classList.add('is-open'); });
  btnCloseAdd.addEventListener('click', () => { modalAdd.classList.remove('is-open'); });
  btnCancelAdd.addEventListener('click', () => { modalAdd.classList.remove('is-open'); });

  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const companyName = document.getElementById('add-company-name').value.trim();
    const bizNumber = document.getElementById('add-biz-number').value.trim();
    const ceoName = document.getElementById('add-ceo-name').value.trim() || null;
    const phone = document.getElementById('add-phone').value.trim() || null;
    const openDate = document.getElementById('add-open-date').value || null;
    const handledItems = document.getElementById('add-handled-items').value.trim();
    const address = document.getElementById('add-address').value.trim() || null;

    const newSeq = currentData.length + 1;
    currentData.push({
      seq: newSeq,
      source: 'MANUAL_USER_ADDED',
      marketName: originalQuota.marketName || '풍납시장',
      companyName,
      bizNumber,
      ceoName,
      phone,
      openDate,
      handledItems,
      address,
      status: '정상가맹',
      paperAccepted: 'Y',
      digitalAccepted: 'Y'
    });

    modalAdd.classList.remove('is-open');
    formAdd.reset();
    badgeCount.textContent = `${currentData.length}건`;
    markDirty(true);
    renderTable();
    renderDistributionKpi();
    alert(`새 점포 "${companyName}"가 쿼터에 추가되었습니다. 상단의 [수정사항 저장]을 눌러 영구 보관해 주세요.`);
  });

  // ------------------------------------------------------------------------
  // 5. 검색 필터링
  // ------------------------------------------------------------------------
  inputSearch.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderTable();
  });

  // ------------------------------------------------------------------------
  // 6. 수정사항 저장 (JSON + Excel 동기화)
  // ------------------------------------------------------------------------
  btnSave.addEventListener('click', async () => {
    try {
      btnSave.disabled = true;
      btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 Excel 동기화 중...';

      const res = await fetch(`/api/quota/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalQuota.title,
          data: currentData
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');

      originalQuota = data.quota;
      currentData = JSON.parse(JSON.stringify(originalQuota.data || []));
      markDirty(false);
      renderTable();
      renderDistributionKpi();

      alert(data.message || '조사 쿼터가 성공적으로 저장 및 Excel과 동기화되었습니다!');
    } catch (err) {
      alert('저장 오류: ' + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 수정사항 저장 (Excel 동기화)';
    }
  });

  // ------------------------------------------------------------------------
  // 7. 이 쿼터로 새 설문 캠페인 생성
  // ------------------------------------------------------------------------
  btnLaunch.addEventListener('click', async () => {
    if (isDirty) {
      if (!confirm('아직 저장되지 않은 수정사항이 있습니다.\n먼저 저장하고 캠페인을 생성하시겠습니까?')) {
        return;
      }
      await btnSave.click();
    }

    const defaultTitle = originalQuota.title || '새로운 설문조사 캠페인';
    const campTitle = prompt('생성할 새 설문 캠페인의 제목을 입력해 주세요:', defaultTitle);
    if (!campTitle || !campTitle.trim()) return;

    try {
      btnLaunch.disabled = true;
      btnLaunch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 캠페인 생성 중...';

      const res = await fetch('/api/campaigns/create-from-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotaFileName: fileName,
          title: campTitle.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '캠페인 생성 실패');

      window.location.href = `survey-detail.html?id=${data.campaign.id}`;
    } catch (err) {
      alert('캠페인 생성 실패: ' + err.message);
      btnLaunch.disabled = false;
      btnLaunch.innerHTML = '<i class="fa-solid fa-play"></i> 이 쿼터로 캠페인 생성';
    }
  });

  // ------------------------------------------------------------------------
  // 8. 결측치 외부 공인 재보강
  // ------------------------------------------------------------------------
  btnEnrich.addEventListener('click', async () => {
    if (!confirm('네이버 플레이스 및 국세청 공인 데이터베이스를 통해 대표자명 및 연락처 결측치를 추가 탐색하시겠습니까?')) {
      return;
    }

    try {
      btnEnrich.disabled = true;
      btnEnrich.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 외부 공인 탐색 중...';

      const res = await fetch('/api/quota/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '결측치 보강 실패');

      alert(`결측치 외부 보강 완료!\n총 ${data.enrichedCount}건의 사업자 정보가 성공적으로 추가 보강되었습니다.`);
      await loadQuotaDetail();
    } catch (err) {
      alert('결측치 보강 오류: ' + err.message);
    } finally {
      btnEnrich.disabled = false;
      btnEnrich.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 결측치 외부 보강';
    }
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 초기 실행
  await loadQuotaDetail();
}

// DOM 준비 상태에 따른 안전 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuotaDetailPage);
} else {
  initQuotaDetailPage();
}
