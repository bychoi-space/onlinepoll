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
      if (item.slotUrl) {
        const slotLabel = item.slotIndex ? `슬롯 #${item.slotIndex} ${escapeHtml(item.slotExtra || '')}` : `슬롯 #${seq}`;
        const kidSuffix = item.ranId ? ` (${escapeHtml(item.ranId)})` : '';
        slotTag = `<div class="quota-slot-badge font-mono" data-slot-seq="${seq}" title="클릭하여 이 점포의 슬롯 URL 확인/수정: ${escapeHtml(item.slotUrl)}"><i class="fa-solid fa-link"></i> ${slotLabel}${kidSuffix}</div>`;
      } else {
        slotTag = `<div class="quota-slot-badge unmapped font-mono" data-slot-seq="${seq}" title="클릭하여 이 점포의 슬롯 URL 직접 입력/매핑"><i class="fa-solid fa-triangle-exclamation"></i> 슬롯 미매핑 (클릭하여 입력)</div>`;
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
    const slotBadge = e.target.closest('.quota-slot-badge');
    if (slotBadge) {
      e.stopPropagation();
      const targetSeq = parseInt(slotBadge.getAttribute('data-slot-seq'), 10) || null;
      openQuotaSlotModal(targetSeq);
      return;
    }

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
    const slotUrlEl = document.getElementById('add-slot-url');
    const rawSlotUrl = slotUrlEl ? slotUrlEl.value.trim() : '';

    const newSeq = currentData.length + 1;
    const slotMeta = rawSlotUrl ? normalizeQuotaSlotInput(rawSlotUrl, newSeq - 1) : null;

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
      digitalAccepted: 'Y',
      ...(slotMeta && slotMeta.slotUrl ? {
        slotUrl: slotMeta.slotUrl,
        surveyUrl: slotMeta.slotUrl,
        evalUrl: slotMeta.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${slotMeta.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null,
        ranId: slotMeta.ranId,
        slotIndex: slotMeta.slotIndex,
        slotExtra: slotMeta.slotExtra
      } : {})
    });

    modalAdd.classList.remove('is-open');
    formAdd.reset();
    badgeCount.textContent = `${currentData.length}건`;
    renderTable();
    renderDistributionKpi();
    await autoSaveQuotaSilent();
    const slotSuffix = (slotMeta && slotMeta.slotUrl)
      ? `\n(케이스탯 슬롯 #${newSeq}${slotMeta.ranId ? ` [KID: ${slotMeta.ranId}]` : ''} 1:1 매핑 완료)`
      : '';
    alert(`새 점포 "${companyName}"가 쿼터에 추가 및 Excel/캠페인과 동기화되었습니다.${slotSuffix}`);
  });

  // ------------------------------------------------------------------------
  // 4-1. 케이스탯 슬롯 1:1 수동 매핑 모달 (쿼터 상세 편집기용)
  // ------------------------------------------------------------------------
  const modalQuotaSlot = document.getElementById('modal-quota-slot-mapping');
  const btnOpenQuotaSlotModal = document.getElementById('btn-open-quota-slot-modal');
  const btnCloseQuotaSlotModal = document.getElementById('btn-close-quota-slot-modal');
  const btnCancelQuotaSlotModal = document.getElementById('btn-cancel-quota-slot-modal');
  const textareaQuotaBulkSlots = document.getElementById('textarea-quota-bulk-slots');
  const btnQuotaParseSlots = document.getElementById('btn-quota-parse-slots');
  const btnQuotaParseSlotsUnmapped = document.getElementById('btn-quota-parse-slots-unmapped');
  const btnQuotaClearSlots = document.getElementById('btn-quota-clear-slots');
  const quotaSlotParseStatusMsg = document.getElementById('quota-slot-parse-status-msg');
  const quotaSlotMatchSummaryBadge = document.getElementById('quota-slot-match-summary-badge');
  const quotaSlotPreviewTbody = document.getElementById('quota-slot-preview-tbody');
  const btnSubmitQuotaSlotMapping = document.getElementById('btn-submit-quota-slot-mapping');

  let quotaParsedSlotsState = [];

  function normalizeQuotaSlotInput(rawVal, idx = 0) {
    const trimmed = String(rawVal || '').trim();
    if (!trimmed) {
      return { slotUrl: '', ranId: null, slotIndex: idx + 1, slotExtra: '' };
    }
    const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>]+index\.asp\?[^\s"'<>]+)/i);
    let finalUrl = urlMatch ? urlMatch[1] : trimmed;

    if (!/^https?:\/\//i.test(finalUrl) && /^[A-Za-z0-9_-]{6,20}$/.test(finalUrl)) {
      finalUrl = `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${finalUrl}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
    }

    const kidMatch = finalUrl.match(/[?&]KID=([A-Za-z0-9_-]+)/i);
    const extraMatch = trimmed.match(/\(([0-9]+)\)추가/i);
    return {
      slotUrl: finalUrl,
      ranId: kidMatch ? kidMatch[1] : null,
      slotIndex: idx + 1,
      slotExtra: extraMatch ? extraMatch[0] : `(${idx})추가`
    };
  }

  function parseQuotaBulkSlotInput(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const slots = [];
    const urlRegex = /(https?:\/\/[^\s"'<>]+index\.asp\?[^\s"'<>]+)/gi;
    const kidRegex = /[?&]KID=([A-Za-z0-9_-]+)/i;
    const extraRegex = /\(([0-9]+)\)추가/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(urlRegex);
      if (matches) {
        matches.forEach(url => {
          const kidMatch = url.match(kidRegex);
          const extraMatch = line.match(extraRegex);
          slots.push({
            slotUrl: url,
            ranId: kidMatch ? kidMatch[1] : null,
            slotExtra: extraMatch ? extraMatch[0] : `(${slots.length})추가`,
            slotIndex: slots.length + 1
          });
        });
      }
    }

    if (slots.length === 0) {
      lines.forEach((line, idx) => {
        if (line.startsWith('http://') || line.startsWith('https://') || /^[A-Za-z0-9_-]{6,20}$/.test(line)) {
          const norm = normalizeQuotaSlotInput(line, idx);
          if (norm.slotUrl) slots.push(norm);
        }
      });
    }
    return slots;
  }

  function updateQuotaSlotSummaryUI() {
    const total = currentData.length;
    const matchedCount = quotaParsedSlotsState.filter(s => s && s.slotUrl && String(s.slotUrl).trim() !== '').length;

    if (quotaSlotMatchSummaryBadge) {
      quotaSlotMatchSummaryBadge.textContent = `매칭 완료: ${matchedCount} / ${total} 점포`;
      if (matchedCount === total && total > 0) {
        quotaSlotMatchSummaryBadge.className = 'slot-summary-badge success';
        if (quotaSlotParseStatusMsg) {
          quotaSlotParseStatusMsg.className = 'slot-parse-msg success';
          quotaSlotParseStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> 전체 <strong>${total}개 점포</strong>에 슬롯 URL이 1:1로 매칭되었습니다. 하단의 [슬롯 매핑 적용 및 저장]을 눌러주세요.`;
        }
      } else {
        quotaSlotMatchSummaryBadge.className = 'slot-summary-badge warning';
        if (quotaSlotParseStatusMsg) {
          quotaSlotParseStatusMsg.className = 'slot-parse-msg warning';
          quotaSlotParseStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 전체 <strong>${total}개 점포</strong> 중 <strong>${matchedCount}개</strong> 매칭됨 (미매핑 <strong>${Math.max(0, total - matchedCount)}개</strong> — 표의 입력칸에 직접 붙여넣거나 상단에서 파싱하세요)`;
        }
      }
    }
  }

  function renderQuotaSlotPreviewTable(focusSeq = null) {
    const total = currentData.length;
    if (total === 0) {
      if (quotaSlotPreviewTbody) quotaSlotPreviewTbody.innerHTML = '<tr><td colspan="6" class="empty-table-msg">등록된 점포가 없습니다.</td></tr>';
      if (quotaSlotMatchSummaryBadge) quotaSlotMatchSummaryBadge.textContent = '매칭: 0 / 0 점포';
      return;
    }

    if (quotaSlotPreviewTbody) {
      quotaSlotPreviewTbody.innerHTML = currentData.map((item, idx) => {
        const seq = item.seq || item.index || (idx + 1);
        const parsedSlot = quotaParsedSlotsState[idx] || {};
        const url = parsedSlot.slotUrl !== undefined ? parsedSlot.slotUrl : (item.slotUrl || '');
        const ranId = parsedSlot.ranId || item.ranId || (url.match(/[?&]KID=([A-Za-z0-9_-]+)/i)?.[1] || '');
        const slotExtra = parsedSlot.slotExtra || item.slotExtra || (url ? `(${idx})추가` : '-');
        const isMatched = Boolean(url && String(url).trim());
        const isFocused = (focusSeq && Number(focusSeq) === Number(seq));

        return `
          <tr class="slot-preview-row ${isMatched ? 'row-matched' : 'row-unmatched'}${isFocused ? ' row-focused' : ''}" data-row-idx="${idx}" data-seq="${seq}">
            <td class="text-center font-mono font-bold col-seq">${seq}</td>
            <td class="col-company"><strong class="company-name-highlight">${escapeHtml(item.companyName || '-')}</strong></td>
            <td class="text-center col-ind"><span class="quota-ind-badge">${escapeHtml(getIndustryBadgeText(item.industry || item.handledItems))}</span></td>
            <td class="col-ceo"><span class="ceo-name-highlight">${escapeHtml(item.ceoName || '-')}</span></td>
            <td class="text-center font-mono col-slot-label" id="quota-slot-label-cell-${idx}">
              ${isMatched
                ? `<span class="badge-slot-matched font-mono font-bold">슬롯 #${idx + 1} ${escapeHtml(ranId ? `(${ranId})` : slotExtra)}</span>`
                : '<span class="badge-slot-unmapped"><i class="fa-solid fa-triangle-exclamation"></i> 미매핑</span>'}
            </td>
            <td class="font-mono col-slot-url">
              <div class="slot-url-input-wrap">
                <input
                  type="text"
                  class="slot-row-url-input ${isMatched ? '' : 'is-empty'}"
                  data-row-idx="${idx}"
                  data-seq="${seq}"
                  value="${escapeHtml(url)}"
                  placeholder="https://kstat.surveys.kr/...index.asp?KID=... 또는 KID 코드 직접 입력"
                />
                <button type="button" class="btn-clear-row-slot" data-row-idx="${idx}" title="이 점포의 슬롯 URL 지우기">&times;</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      quotaSlotPreviewTbody.querySelectorAll('.slot-row-url-input').forEach(input => {
        const handleRowInput = () => {
          const rIdx = parseInt(input.getAttribute('data-row-idx'), 10);
          const norm = normalizeQuotaSlotInput(input.value, rIdx);
          if (quotaParsedSlotsState[rIdx]) {
            quotaParsedSlotsState[rIdx].slotUrl = norm.slotUrl;
            quotaParsedSlotsState[rIdx].ranId = norm.ranId;
            quotaParsedSlotsState[rIdx].slotIndex = norm.slotIndex;
            quotaParsedSlotsState[rIdx].slotExtra = norm.slotExtra;
          }
          const isMatched = Boolean(norm.slotUrl);
          input.classList.toggle('is-empty', !isMatched);
          const tr = input.closest('.slot-preview-row');
          if (tr) {
            tr.classList.toggle('row-matched', isMatched);
            tr.classList.toggle('row-unmatched', !isMatched);
          }
          const labelCell = document.getElementById(`quota-slot-label-cell-${rIdx}`);
          if (labelCell) {
            labelCell.innerHTML = isMatched
              ? `<span class="badge-slot-matched font-mono font-bold">슬롯 #${rIdx + 1} ${escapeHtml(norm.ranId ? `(${norm.ranId})` : norm.slotExtra)}</span>`
              : '<span class="badge-slot-unmapped"><i class="fa-solid fa-triangle-exclamation"></i> 미매핑</span>';
          }
          updateQuotaSlotSummaryUI();
        };

        input.addEventListener('input', handleRowInput);
        input.addEventListener('change', () => {
          const rIdx = parseInt(input.getAttribute('data-row-idx'), 10);
          const norm = normalizeQuotaSlotInput(input.value, rIdx);
          if (norm.slotUrl && input.value.trim() !== norm.slotUrl) {
            input.value = norm.slotUrl;
          }
          handleRowInput();
        });
      });

      quotaSlotPreviewTbody.querySelectorAll('.btn-clear-row-slot').forEach(btn => {
        btn.addEventListener('click', () => {
          const rIdx = parseInt(btn.getAttribute('data-row-idx'), 10);
          const rowInput = quotaSlotPreviewTbody.querySelector(`.slot-row-url-input[data-row-idx="${rIdx}"]`);
          if (rowInput) {
            rowInput.value = '';
            rowInput.dispatchEvent(new Event('input'));
            rowInput.focus();
          }
        });
      });

      if (focusSeq) {
        setTimeout(() => {
          const targetInput = quotaSlotPreviewTbody.querySelector(`.slot-row-url-input[data-seq="${focusSeq}"]`);
          if (targetInput) {
            try {
              targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
            targetInput.focus();
            targetInput.select();
          }
        }, 80);
      }
    }

    updateQuotaSlotSummaryUI();
  }

  function openQuotaSlotModal(focusSeq = null) {
    if (currentData.length === 0) {
      alert('등록된 점포 데이터가 없습니다.');
      return;
    }
    const targetSeq = (typeof focusSeq === 'number' || typeof focusSeq === 'string') ? parseInt(focusSeq, 10) : null;

    quotaParsedSlotsState = currentData.map((item, idx) => ({
      seq: item.seq || item.index || (idx + 1),
      companyName: item.companyName,
      industry: item.industry || item.handledItems,
      ceoName: item.ceoName,
      slotUrl: item.slotUrl || '',
      slotIndex: item.slotIndex || (idx + 1),
      slotExtra: item.slotExtra || '',
      ranId: item.ranId || ''
    }));

    const existingUrls = quotaParsedSlotsState.filter(s => s.slotUrl).map(s => s.slotUrl);
    if (existingUrls.length > 0 && textareaQuotaBulkSlots) {
      textareaQuotaBulkSlots.value = existingUrls.join('\n');
    }

    renderQuotaSlotPreviewTable(targetSeq);
    if (modalQuotaSlot) modalQuotaSlot.classList.add('is-open');
  }

  function closeQuotaSlotModal() {
    if (modalQuotaSlot) modalQuotaSlot.classList.remove('is-open');
  }

  if (btnOpenQuotaSlotModal) btnOpenQuotaSlotModal.addEventListener('click', () => openQuotaSlotModal());
  if (btnCloseQuotaSlotModal) btnCloseQuotaSlotModal.addEventListener('click', closeQuotaSlotModal);
  if (btnCancelQuotaSlotModal) btnCancelQuotaSlotModal.addEventListener('click', closeQuotaSlotModal);

  if (btnQuotaParseSlots) {
    btnQuotaParseSlots.addEventListener('click', () => {
      const text = textareaQuotaBulkSlots ? textareaQuotaBulkSlots.value.trim() : '';
      if (!text) {
        alert('슬롯 URL(또는 KID 코드)을 입력해주세요.');
        if (textareaQuotaBulkSlots) textareaQuotaBulkSlots.focus();
        return;
      }
      const extracted = parseQuotaBulkSlotInput(text);
      if (extracted.length === 0) {
        alert('입력된 텍스트에서 케이스탯 설문 URL을 찾을 수 없습니다.');
        return;
      }
      quotaParsedSlotsState = currentData.map((item, idx) => {
        const slot = extracted[idx];
        return {
          seq: item.seq || item.index || (idx + 1),
          companyName: item.companyName,
          industry: item.industry || item.handledItems,
          ceoName: item.ceoName,
          slotUrl: slot ? slot.slotUrl : '',
          slotIndex: slot ? slot.slotIndex : (idx + 1),
          slotExtra: slot ? slot.slotExtra : `(${idx})추가`,
          ranId: slot ? slot.ranId : null
        };
      });
      renderQuotaSlotPreviewTable();
    });
  }

  if (btnQuotaParseSlotsUnmapped) {
    btnQuotaParseSlotsUnmapped.addEventListener('click', () => {
      const text = textareaQuotaBulkSlots ? textareaQuotaBulkSlots.value.trim() : '';
      if (!text) {
        alert('미매핑 점포에 채워 넣을 케이스탯 슬롯 URL을 상단 입력창에 붙여넣어 주세요.');
        if (textareaQuotaBulkSlots) textareaQuotaBulkSlots.focus();
        return;
      }
      const extracted = parseQuotaBulkSlotInput(text);
      if (extracted.length === 0) {
        alert('입력된 텍스트에서 케이스탯 설문 URL을 찾을 수 없습니다.');
        return;
      }
      const existingUrls = new Set(quotaParsedSlotsState.filter(s => s.slotUrl && s.slotUrl.trim()).map(s => s.slotUrl.trim()));
      const existingRanIds = new Set(quotaParsedSlotsState.filter(s => s.ranId).map(s => s.ranId));
      const availableNewSlots = extracted.filter(s => !existingUrls.has(s.slotUrl) && (!s.ranId || !existingRanIds.has(s.ranId)));
      if (availableNewSlots.length === 0) {
        alert('입력된 URL 중 아직 매핑되지 않은 신규 슬롯이 없습니다.');
        return;
      }
      let cursor = 0;
      let filled = 0;
      quotaParsedSlotsState.forEach((slotItem, idx) => {
        if ((!slotItem.slotUrl || !slotItem.slotUrl.trim()) && cursor < availableNewSlots.length) {
          const nextSlot = availableNewSlots[cursor++];
          slotItem.slotUrl = nextSlot.slotUrl;
          slotItem.ranId = nextSlot.ranId;
          slotItem.slotIndex = idx + 1;
          slotItem.slotExtra = nextSlot.slotExtra || `(${idx})추가`;
          filled++;
        }
      });
      renderQuotaSlotPreviewTable();
      alert(`미매핑 점포 ${filled}곳에 신규 슬롯 URL을 채웠습니다. 하단 [슬롯 매핑 적용 및 저장]을 눌러 확정해 주세요.`);
    });
  }

  if (btnQuotaClearSlots) {
    btnQuotaClearSlots.addEventListener('click', () => {
      if (textareaQuotaBulkSlots) textareaQuotaBulkSlots.value = '';
      quotaParsedSlotsState = currentData.map((item, idx) => ({
        seq: item.seq || item.index || (idx + 1),
        companyName: item.companyName,
        industry: item.industry || item.handledItems,
        ceoName: item.ceoName,
        slotUrl: '',
        slotIndex: idx + 1,
        slotExtra: '',
        ranId: null
      }));
      renderQuotaSlotPreviewTable();
    });
  }

  if (btnSubmitQuotaSlotMapping) {
    btnSubmitQuotaSlotMapping.addEventListener('click', async () => {
      // 중복 슬롯 검증
      const seenUrls = new Set();
      const seenKids = new Set();
      for (let i = 0; i < quotaParsedSlotsState.length; i++) {
        const s = quotaParsedSlotsState[i];
        const u = String(s.slotUrl || '').trim();
        if (!u) continue;
        if (seenUrls.has(u) || (s.ranId && seenKids.has(s.ranId))) {
          alert(`[#${i + 1} ${s.companyName || '점포'}] 다른 점포와 중복된 슬롯 URL(KID: ${s.ranId || u})이 감지되었습니다. 각 점포마다 고유한 슬롯을 입력해 주세요.`);
          return;
        }
        seenUrls.add(u);
        if (s.ranId) seenKids.add(s.ranId);
      }

      let mappedCount = 0;
      currentData.forEach((item, idx) => {
        const slot = quotaParsedSlotsState[idx];
        const cleanUrl = slot ? String(slot.slotUrl || '').trim() : '';
        if (cleanUrl) {
          item.slotUrl = cleanUrl;
          item.surveyUrl = cleanUrl;
          item.ranId = slot.ranId || (cleanUrl.match(/[?&]KID=([A-Za-z0-9_-]+)/i)?.[1] || null);
          item.evalUrl = item.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${item.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null;
          item.slotIndex = slot.slotIndex || (idx + 1);
          item.slotExtra = slot.slotExtra || `(${idx})추가`;
          mappedCount++;
        } else {
          delete item.slotUrl;
          delete item.surveyUrl;
          delete item.evalUrl;
          delete item.ranId;
          delete item.slotIndex;
          delete item.slotExtra;
        }
      });

      try {
        btnSubmitQuotaSlotMapping.disabled = true;
        btnSubmitQuotaSlotMapping.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 동기화 중...';
        await autoSaveQuotaSilent();
        closeQuotaSlotModal();
        alert(`총 ${currentData.length}개 점포 중 ${mappedCount}개 점포의 슬롯 매핑이 저장 및 Excel/캠페인과 동기화되었습니다!`);
      } finally {
        btnSubmitQuotaSlotMapping.disabled = false;
        btnSubmitQuotaSlotMapping.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 슬롯 매핑 적용 및 저장';
      }
    });
  }

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
