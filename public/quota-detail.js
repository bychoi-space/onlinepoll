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
  const quotaSyncStatusMsg = document.getElementById('quota-sync-status-msg');

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
    const rawTitle = originalQuota.title || fileName;
    titleEl.textContent = rawTitle;
    titleEl.title = rawTitle;
    displayName.textContent = rawTitle;
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
      const raw = String(item.industry || item.handledItems || '기타');
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
  // 2. 스프레드시트형 점포 테이블 렌더링 (설문조사 상세 화면과 동일 구조 통일)
  // [번호] [상호] [업종] [사업자번호] [대표자이름] [성별] [나이] [연락처] [개업연월] [주소] [취급품목] [주요품목] [관리]
  // ------------------------------------------------------------------------
  function renderTable() {
    const term = searchTerm.trim().toLowerCase();
    const filtered = currentData.filter(item => {
      if (!term) return true;
      return (
        String(item.companyName || '').toLowerCase().includes(term) ||
        String(item.industry || '').toLowerCase().includes(term) ||
        String(item.ceoName || '').toLowerCase().includes(term) ||
        String(item.phone || '').toLowerCase().includes(term) ||
        String(item.bizNumber || '').toLowerCase().includes(term) ||
        String(item.handledItems || '').toLowerCase().includes(term) ||
        String(item.mainProducts || '').toLowerCase().includes(term) ||
        String(item.address || '').toLowerCase().includes(term)
      );
    });

    filteredCountLabel.textContent = `전체 ${currentData.length}개 중 ${filtered.length}개 표시`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="13" class="empty-table-msg">
            ${term ? `"${escapeHtml(term)}" 검색 결과와 일치하는 점포가 없습니다.` : '등록된 점포 데이터가 없습니다.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      const seq = item.seq || item.index || (idx + 1);
      const indLabel = getIndustryBadgeText(item.industry || item.handledItems);
      const hasCeo = item.ceoName && String(item.ceoName).trim() !== '' && item.ceoName !== 'null';
      const hasPhone = item.phone && String(item.phone).trim() !== '' && item.phone !== 'null';
      const hasMainProducts = item.mainProducts && String(item.mainProducts).trim() !== '' && item.mainProducts !== 'null';
      const addrVal = item.address ? (item.address.length > 28 ? item.address.slice(0, 28) + '...' : item.address) : '-';

      let slotTag = '';
      if (item.slotIndex) {
        slotTag = `<div class="quota-slot-badge font-mono" title="${escapeHtml(item.slotUrl || '')}">슬롯 #${item.slotIndex} ${escapeHtml(item.slotExtra || '')}</div>`;
      }

      return `
        <tr data-seq="${seq}">
          <td class="text-center font-mono font-bold">${seq}</td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="companyName" title="클릭하여 상호 수정">
            <strong>${escapeHtml(item.companyName || '-')}</strong>
            ${slotTag}
          </td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="industry" title="클릭하여 업종 수정">
            <span class="quota-ind-badge">${escapeHtml(indLabel)}</span>
          </td>
          <td class="editable-quota-cell font-mono" data-seq="${seq}" data-field="bizNumber" title="클릭하여 사업자번호 수정">
            <code>${escapeHtml(item.bizNumber || '-')}</code>
          </td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="ceoName" title="클릭하여 대표자이름 수정">
            ${hasCeo ? `<span class="ceo-name-text">${escapeHtml(item.ceoName)}</span>${item.isCeoEnriched ? ' <span class="badge-enriched">보강</span>' : ''}` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center col-gender editable-quota-cell" data-seq="${seq}" data-field="ceoGender" title="클릭하여 성별 수정">
            ${item.ceoGender ? `<span class="badge-gender ${item.ceoGender === '남' ? 'male' : 'female'}">${escapeHtml(item.ceoGender)}</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center col-age editable-quota-cell" data-seq="${seq}" data-field="ceoAge" title="클릭하여 나이 수정">
            ${item.ceoAge ? `<span class="badge-age font-mono">${escapeHtml(String(item.ceoAge).replace(/세$/, ''))}세</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="editable-quota-cell font-mono" data-seq="${seq}" data-field="phone" title="클릭하여 연락처 수정">
            ${hasPhone ? `${escapeHtml(item.phone)}${item.isPhoneEnriched ? ' <span class="badge-enriched">보강</span>' : ''}` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="editable-quota-cell font-mono" data-seq="${seq}" data-field="openDate" title="클릭하여 개업연월 수정">
            ${escapeHtml(item.openDate || '-')}
          </td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="address" title="${escapeHtml(item.address || '클릭하여 주소 수정')}">
            ${escapeHtml(addrVal)}
          </td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="handledItems" title="클릭하여 취급품목 수정">
            <span class="badge-quota-type b2b">${escapeHtml(item.handledItems || '-')}</span>
          </td>
          <td class="editable-quota-cell" data-seq="${seq}" data-field="mainProducts" title="클릭하여 주요품목 입력/수정">
            ${hasMainProducts ? `<span class="badge-main-product">${escapeHtml(item.mainProducts)}</span>` : '<span class="cell-placeholder"><i class="fa-solid fa-pen"></i> 입력</span>'}
          </td>
          <td class="text-center">
            <button type="button" class="btn-icon-circle btn-delete-row" data-seq="${seq}" title="점포 삭제">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    bindRowDeleteButtons();
  }

  function extractStandardIndustry(raw) {
    if (!raw) return '기타소매';
    const s = String(raw);
    if (s.includes('농산물')) return '농산물';
    if (s.includes('축산물')) return '축산물';
    if (s.includes('수산물')) return '수산물';
    if (s.includes('가공식품')) return '가공식품';
    if (s.includes('의류')) return '의류신발';
    if (s.includes('가정용품')) return '가정용품';
    if (s.includes('음식점')) return '음식점업';
    if (s.includes('기타소매')) return '기타소매';
    if (s.includes('근린상권')) return '근린상권';
    return s.split(' ')[0] || '기타소매';
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
  // 3. 인라인 셀 편집 (Inline Cell Editing - 설문조사 상세 화면과 동일 UX + 자동 동기화)
  // ------------------------------------------------------------------------
  tbody.addEventListener('click', (e) => {
    const cell = e.target.closest('.editable-quota-cell');
    if (!cell || cell.querySelector('input, select')) return;

    const seq = parseInt(cell.getAttribute('data-seq'), 10);
    const field = cell.getAttribute('data-field');
    const item = currentData.find(d => (d.seq || d.index) === seq);
    if (!item) return;

    if (field === 'ceoGender') {
      const currentVal = item.ceoGender || '';
      cell.innerHTML = `
        <select class="inline-cell-select">
          <option value="남" ${currentVal === '남' ? 'selected' : ''}>남</option>
          <option value="여" ${currentVal === '여' ? 'selected' : ''}>여</option>
          <option value="" ${!currentVal ? 'selected' : ''}>-</option>
        </select>
      `;
      const select = cell.querySelector('select');
      select.focus();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = select.value.trim() || null;
        if (item.ceoGender !== newVal) {
          item.ceoGender = newVal;
          renderTable();
          await autoSaveQuotaSilent();
        } else {
          renderTable();
        }
      };
      select.addEventListener('change', finishEdit);
      select.addEventListener('blur', finishEdit);
    } else if (field === 'industry') {
      const currentVal = extractStandardIndustry(item.industry || item.handledItems);
      const indOptions = ['농산물', '축산물', '수산물', '가공식품', '의류신발', '가정용품', '음식점업', '기타소매', '근린상권'];
      cell.innerHTML = `
        <select class="inline-cell-select-md">
          ${indOptions.map(opt => `<option value="${opt}" ${currentVal === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>
      `;
      const select = cell.querySelector('select');
      select.focus();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = select.value.trim() || null;
        if (item.industry !== newVal) {
          item.industry = newVal;
          renderTable();
          renderDistributionKpi();
          await autoSaveQuotaSilent();
        } else {
          renderTable();
        }
      };
      select.addEventListener('change', finishEdit);
      select.addEventListener('blur', finishEdit);
    } else if (field === 'ceoAge') {
      const currentVal = item.ceoAge || '';
      cell.innerHTML = `
        <input type="number" min="20" max="95" class="inline-cell-input" value="${currentVal}" placeholder="나이" />
      `;
      const input = cell.querySelector('input');
      input.focus();
      input.select();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const rawVal = input.value.trim();
        const newVal = rawVal ? parseInt(rawVal, 10) : null;
        if (item.ceoAge !== newVal) {
          item.ceoAge = newVal;
          renderTable();
          await autoSaveQuotaSilent();
        } else {
          renderTable();
        }
      };
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finishEdit();
        else if (ke.key === 'Escape') { finished = true; renderTable(); }
      });
      input.addEventListener('blur', finishEdit);
    } else {
      const currentVal = (item[field] && item[field] !== 'null') ? String(item[field]) : '';
      const placeholders = {
        ceoName: '대표자이름',
        mainProducts: '주요품목 입력',
        handledItems: '취급품목 입력',
        phone: '연락처 입력',
        openDate: 'YYYY.MM.DD',
        address: '주소 입력',
        companyName: '상호 입력',
        bizNumber: '사업자번호'
      };
      cell.innerHTML = `
        <input type="text" class="inline-cell-input-md" value="${escapeHtml(currentVal)}" placeholder="${placeholders[field] || '입력'}" />
      `;
      const input = cell.querySelector('input');
      input.focus();
      input.select();

      let finished = false;
      const finishEdit = async () => {
        if (finished) return;
        finished = true;
        const newVal = input.value.trim() || null;
        if (item[field] !== newVal) {
          item[field] = newVal;
          renderTable();
          renderDistributionKpi();
          await autoSaveQuotaSilent();
        } else {
          renderTable();
        }
      };
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finishEdit();
        else if (ke.key === 'Escape') { finished = true; renderTable(); }
      });
      input.addEventListener('blur', finishEdit);
    }
  });

  async function autoSaveQuotaSilent() {
    try {
      if (quotaSyncStatusMsg) {
        quotaSyncStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 엑셀 동기화 중...';
      }
      const res = await fetch(`/api/quota/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: originalQuota.title,
          data: currentData
        })
      });
      if (res.ok) {
        const data = await res.json();
        originalQuota = data.quota;
        currentData = JSON.parse(JSON.stringify(originalQuota.data || []));
        markDirty(false);
        renderTable();
        renderDistributionKpi();
        if (quotaSyncStatusMsg) {
          quotaSyncStatusMsg.innerHTML = '<span class="text-success font-bold">✓ 저장 및 Excel 동기화 완료!</span>';
          setTimeout(() => {
            if (quotaSyncStatusMsg) quotaSyncStatusMsg.innerHTML = '';
          }, 3000);
        }
      } else {
        markDirty(true);
      }
    } catch (err) {
      markDirty(true);
      if (quotaSyncStatusMsg) {
        quotaSyncStatusMsg.innerHTML = '<span class="text-error">자동 저장 실패: ' + err.message + '</span>';
      }
    }
  }

  function bindRowDeleteButtons() {
    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const seq = parseInt(btn.getAttribute('data-seq'), 10);
        const item = currentData.find(d => (d.seq || d.index) === seq);
        if (!item) return;

        if (confirm(`"${item.companyName || '이 점포'}"를 쿼터에서 삭제하시겠습니까?`)) {
          currentData = currentData.filter(d => (d.seq || d.index) !== seq);
          // 순번 재부여
          currentData.forEach((d, idx) => { d.seq = idx + 1; });
          badgeCount.textContent = `${currentData.length}건`;
          renderTable();
          renderDistributionKpi();
          await autoSaveQuotaSilent();
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

  formAdd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const companyName = document.getElementById('add-company-name').value.trim();
    const industryEl = document.getElementById('add-industry');
    const industry = industryEl ? industryEl.value.trim() : null;
    const bizNumber = document.getElementById('add-biz-number').value.trim();
    const ceoName = document.getElementById('add-ceo-name').value.trim() || null;
    const ceoGenderEl = document.getElementById('add-ceo-gender');
    const ceoGender = ceoGenderEl ? (ceoGenderEl.value.trim() || null) : null;
    const ceoAgeEl = document.getElementById('add-ceo-age');
    const ceoAge = (ceoAgeEl && ceoAgeEl.value.trim()) ? parseInt(ceoAgeEl.value.trim(), 10) : null;
    const phone = document.getElementById('add-phone').value.trim() || null;
    const openDate = document.getElementById('add-open-date').value.trim() || null;
    const handledItems = document.getElementById('add-handled-items').value.trim();
    const mainProductsEl = document.getElementById('add-main-products');
    const mainProducts = mainProductsEl ? (mainProductsEl.value.trim() || null) : null;
    const address = document.getElementById('add-address').value.trim() || null;

    const newSeq = currentData.length + 1;
    currentData.push({
      seq: newSeq,
      source: 'MANUAL_USER_ADDED',
      marketName: originalQuota.marketName || '풍납시장',
      companyName,
      industry: industry || extractStandardIndustry(handledItems),
      bizNumber,
      ceoName,
      ceoGender,
      ceoAge,
      phone,
      openDate,
      address,
      handledItems,
      mainProducts,
      status: '정상가맹',
      paperAccepted: 'Y',
      digitalAccepted: 'Y'
    });

    modalAdd.classList.remove('is-open');
    formAdd.reset();
    badgeCount.textContent = `${currentData.length}건`;
    renderTable();
    renderDistributionKpi();
    await autoSaveQuotaSilent();
    alert(`새 점포 "${companyName}"가 쿼터에 추가 및 Excel 동기화되었습니다.`);
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
