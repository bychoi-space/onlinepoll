/**
 * 조사 쿼터 생성기 프론트엔드 제어 스크립트 (quota-builder.js)
 * 마켓비즈 단독 수집 및 온누리상품권 전통시장 연계 하이브리드 수집 지원
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('quota-builder-form');
  const btnGenerate = document.getElementById('btn-generate-quota');

  const inputCurrentMode = document.getElementById('current-source-mode');
  const tabMarketBz = document.getElementById('tab-mode-marketbz');
  const tabOnnuri = document.getElementById('tab-mode-onnuri');
  const sectionMarketBz = document.getElementById('section-marketbz-mode');
  const sectionOnnuri = document.getElementById('section-onnuri-mode');

  // 공통 & 마켓비즈 인풋
  const inputTitle = document.getElementById('quota-title');
  const inputKeyword = document.getElementById('quota-keyword');
  const inputCount = document.getElementById('quota-count');

  // 온누리 연계 인풋
  const selectOnnuriRegion = document.getElementById('onnuri-region');
  const selectOnnuriDistrict = document.getElementById('onnuri-district');
  const inputOnnuriMarket = document.getElementById('onnuri-market-name');
  const inputOnnuriCount = document.getElementById('onnuri-quota-count');

  const baseCheckboxes = document.querySelectorAll('input[name="base-fields"]');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnSelectCore = document.getElementById('btn-select-core');

  // 동적 항목 추가
  const inputNewField = document.getElementById('input-new-field');
  const btnAddField = document.getElementById('btn-add-field');
  const customChipList = document.getElementById('custom-fields-chip-list');

  // 엑셀 스프레드시트 뷰어
  const downloadActions = document.getElementById('download-actions');
  const linkExcelDownload = document.getElementById('link-excel-download');
  const linkJsonDownload = document.getElementById('link-json-download');
  const sheetTitleText = document.getElementById('sheet-title-text');
  const sheetRowCountBadge = document.getElementById('sheet-row-count-badge');
  const excelThead = document.getElementById('excel-grid-thead');
  const excelTbody = document.getElementById('excel-grid-tbody');
  const terminalLogs = document.getElementById('quota-terminal-logs');

  const customFields = [];
  let lastCreatedQuota = null;

  // ==========================================
  // [1] 수집 모드 탭 전환 로직
  // ==========================================
  function switchMode(mode) {
    inputCurrentMode.value = mode;
    if (mode === 'marketbz') {
      tabMarketBz.classList.add('active');
      tabOnnuri.classList.remove('active');

      sectionMarketBz.classList.remove('hidden');
      sectionOnnuri.classList.add('hidden');

      inputTitle.value = '2026_소프트웨어_사업자_조사쿼터';
      btnGenerate.innerHTML = '<i class="fa-solid fa-bolt"></i> 마켓비즈 조사 쿼터 만들기 (JSON & Excel)';
    } else {
      tabOnnuri.classList.add('active');
      tabMarketBz.classList.remove('active');

      sectionMarketBz.classList.add('hidden');
      sectionOnnuri.classList.remove('hidden');

      inputTitle.value = `2026_${inputOnnuriMarket.value || '풍납시장'}_온누리가맹점_조사쿼터`;
      btnGenerate.innerHTML = '<i class="fa-solid fa-store"></i> 온누리 ➔ 마켓비즈 연계 쿼터 만들기 (JSON & Excel)';

      // 온누리 지역 목록이 아직 로드되지 않았으면 로드
      if (selectOnnuriRegion.options.length <= 1) {
        loadOnnuriRegions();
      }
    }
  }

  tabMarketBz.addEventListener('click', () => switchMode('marketbz'));
  tabOnnuri.addEventListener('click', () => switchMode('onnuri'));

  inputOnnuriMarket.addEventListener('input', () => {
    if (inputCurrentMode.value === 'onnuri') {
      inputTitle.value = `2026_${inputOnnuriMarket.value || '시장'}_온누리가맹점_조사쿼터`;
    }
  });

  // ==========================================
  // [2] 온누리 지역 및 시군구 동적 로드
  // ==========================================
  async function loadOnnuriRegions() {
    try {
      const res = await fetch('/api/onnuri/regions');
      const regions = await res.json();
      if (!Array.isArray(regions) || regions.length === 0) return;

      selectOnnuriRegion.innerHTML = regions.map(r => `
        <option value="${escapeHtml(r.code)}" ${r.name === '서울' ? 'selected' : ''}>${escapeHtml(r.name)}</option>
      `).join('');

      // 서울에 해당하는 시군구 로드
      const seoul = regions.find(r => r.name === '서울') || regions[0];
      await loadOnnuriDistricts(seoul.code);
    } catch (err) {
      appendLog('error', `온누리 시도 목록 로드 실패: ${err.message}`);
    }
  }

  async function loadOnnuriDistricts(regionCode) {
    try {
      const res = await fetch(`/api/onnuri/districts?regionCode=${regionCode}`);
      const districts = await res.json();
      if (!Array.isArray(districts)) return;

      selectOnnuriDistrict.innerHTML = districts.map(d => `
        <option value="${escapeHtml(d.code)}" ${d.name.includes('송파') ? 'selected' : ''}>${escapeHtml(d.name)}</option>
      `).join('');
    } catch (err) {
      appendLog('error', `온누리 시군구 목록 로드 실패: ${err.message}`);
    }
  }

  selectOnnuriRegion.addEventListener('change', (e) => {
    loadOnnuriDistricts(e.target.value);
  });

  // 초기 온누리 지역 미리 로드
  loadOnnuriRegions();

  // ==========================================
  // [3] 커스텀 항목 동적 추가 핸들러
  // ==========================================
  function addCustomField() {
    const val = inputNewField.value.trim();
    if (!val) return;
    if (customFields.includes(val)) {
      alert('이미 추가된 항목입니다.');
      return;
    }
    customFields.push(val);
    inputNewField.value = '';
    renderCustomChips();
    appendLog('info', `새로운 수집 항목이 추가되었습니다: "${val}"`);
  }

  function removeCustomField(field) {
    const idx = customFields.indexOf(field);
    if (idx !== -1) {
      customFields.splice(idx, 1);
      renderCustomChips();
    }
  }

  function renderCustomChips() {
    customChipList.innerHTML = customFields.map(f => `
      <span class="custom-field-chip">
        <i class="fa-solid fa-tag"></i> ${escapeHtml(f)}
        <i class="fa-solid fa-xmark chip-remove" data-field="${escapeHtml(f)}" title="삭제"></i>
      </span>
    `).join('');

    customChipList.querySelectorAll('.chip-remove').forEach(el => {
      el.addEventListener('click', () => {
        removeCustomField(el.getAttribute('data-field'));
      });
    });
  }

  btnAddField.addEventListener('click', addCustomField);
  inputNewField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomField();
    }
  });

  // 기본 필드 프리셋
  btnSelectAll.addEventListener('click', () => baseCheckboxes.forEach(cb => cb.checked = true));
  btnSelectCore.addEventListener('click', () => {
    const core = ['companyName', 'bizNumber', 'ceoName', 'phone', 'openDate', 'handledItems'];
    baseCheckboxes.forEach(cb => {
      cb.checked = core.includes(cb.value);
    });
  });

  // 실시간 터미널 로그 출력 헬퍼
  function appendLog(level, message, time = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const timestamp = time || new Date().toLocaleTimeString();
    entry.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-badge ${level}">${level.toUpperCase()}</span>
      <span class="log-msg">${escapeHtml(message)}</span>
    `;
    terminalLogs.appendChild(entry);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // SSE 연결
  function initEventSource() {
    const sse = new EventSource('/api/events');
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          appendLog(data.level, data.message, data.timestamp);
        }
      } catch (_) {}
    };
  }
  initEventSource();

  // ==========================================
  // [4] 쿼터 만들기 실행
  // ==========================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const mode = inputCurrentMode.value;
    const title = inputTitle.value.trim() || '조사쿼터';
    const baseFields = Array.from(document.querySelectorAll('input[name="base-fields"]:checked')).map(cb => cb.value);
    const checkAutoEnrich = document.getElementById('check-auto-enrich');
    const autoEnrich = checkAutoEnrich ? checkAutoEnrich.checked : true;

    try {
      btnGenerate.disabled = true;

      let res, endpoint, payload;

      if (mode === 'onnuri') {
        const regionCode = selectOnnuriRegion.value;
        const districtCode = selectOnnuriDistrict.value;
        const marketName = inputOnnuriMarket.value.trim() || '풍납시장';
        const targetCount = parseInt(inputOnnuriCount.value, 10) || 5;
        const statusFilter = document.querySelector('input[name="onnuri-status"]:checked')?.value || 'ACTIVE';
        const paymentFilter = document.querySelector('input[name="onnuri-payment"]:checked')?.value || 'ALL';

        endpoint = '/api/quota/generate-onnuri';
        payload = {
          title,
          regionCode,
          districtCode,
          marketName,
          statusFilter,
          paymentFilter,
          targetCount,
          baseFields,
          customFields,
          autoEnrich
        };

        btnGenerate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 온누리 1차 수집 & 마켓비즈 2차 결합 진행 중...';
        appendLog('info', `[온누리 연계 쿼터 생성] 시장: "${marketName}", 목표: ${targetCount}개 가맹점, 외부보강: ${autoEnrich ? 'ON' : 'OFF'}`);

      } else {
        // 마켓비즈 단독
        const keyword = inputKeyword.value.trim() || '소프트웨어';
        const targetCount = parseInt(inputCount.value, 10) || 2;

        endpoint = '/api/quota/generate';
        payload = {
          title,
          keyword,
          targetCount,
          baseFields,
          customFields,
          autoEnrich
        };

        btnGenerate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> MarketBz 실존 사업자 데이터 수집 중...';
        appendLog('info', `[마켓비즈 쿼터 생성 시작] 키워드: "${keyword}", 목표: ${targetCount}개 기업, 외부보강: ${autoEnrich ? 'ON' : 'OFF'}`);
      }

      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '생성 실패');

      appendLog('success', result.message);

      // 엑셀 스프레드시트 테이블 렌더링
      renderExcelGrid(result);

    } catch (err) {
      appendLog('error', `생성 오류: ${err.message}`);
      alert('조사 쿼터 생성 실패: ' + err.message);
    } finally {
      btnGenerate.disabled = false;
      if (mode === 'onnuri') {
        btnGenerate.innerHTML = '<i class="fa-solid fa-store"></i> 온누리 ➔ 마켓비즈 연계 쿼터 만들기 (JSON & Excel)';
      } else {
        btnGenerate.innerHTML = '<i class="fa-solid fa-bolt"></i> 조사 쿼터 만들기 (JSON & Excel 동시 생성)';
      }
    }
  });

  // 엑셀 스프레드시트 렌더링 함수
  function renderExcelGrid(res) {
    const { columns, data, title, count, jsonDownloadUrl, excelDownloadUrl } = res;

    sheetTitleText.innerHTML = `<i class="fa-solid fa-file-excel icon-excel-green"></i> ${escapeHtml(title)} (생성 완료)`;
    sheetRowCountBadge.className = 'badge-status completed';
    sheetRowCountBadge.textContent = `${count}개 사업자 행`;

    // 헤더(THEAD) 렌더링
    let theadHtml = '<tr><th>No</th>';
    columns.forEach(col => {
      theadHtml += `<th>${escapeHtml(col.label || col.key)}</th>`;
    });
    theadHtml += '</tr>';
    excelThead.innerHTML = theadHtml;

    // 본문(TBODY) 렌더링
    let tbodyHtml = '';
    data.forEach((row, idx) => {
      tbodyHtml += `<tr><td>${idx + 1}</td>`;
      columns.forEach(col => {
        const rawVal = row[col.key] !== undefined ? row[col.key] : row[col.label];
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          tbodyHtml += `<td><span class="null-val-text">null</span></td>`;
        } else {
          let cellContent = escapeHtml(String(rawVal));
          // 보강된 필드 태그 표시
          if (col.key === 'ceoName' && (row.isCeoEnriched || row.ceoSource)) {
            cellContent += ` <span class="badge-enriched" title="${escapeHtml(row.ceoSource || '외부 공인 정보 보강')}"><i class="fa-solid fa-sparkles"></i>보강</span>`;
          } else if (col.key === 'phone' && (row.isPhoneEnriched || row.phoneSource)) {
            cellContent += ` <span class="badge-enriched" title="${escapeHtml(row.phoneSource || '외부 검색 보강')}"><i class="fa-solid fa-sparkles"></i>보강</span>`;
          }
          tbodyHtml += `<td>${cellContent}</td>`;
        }
      });
      tbodyHtml += '</tr>';
    });
    excelTbody.innerHTML = tbodyHtml;

    // 다운로드 버튼 활성화 (Zero-Inline: CSS 클래스 제어)
    linkExcelDownload.href = excelDownloadUrl;
    linkJsonDownload.href = jsonDownloadUrl;
    downloadActions.classList.remove('hidden');
    downloadActions.classList.add('is-flex');

    // 마지막 생성된 쿼터 정보 보관
    lastCreatedQuota = res;
  }

  // [신규] '결측치 외부 재보강' 버튼 이벤트 핸들러
  const btnReEnrich = document.getElementById('btn-re-enrich-quota');
  if (btnReEnrich) {
    btnReEnrich.addEventListener('click', async () => {
      if (!lastCreatedQuota || !lastCreatedQuota.jsonFileName) {
        alert('먼저 조사 쿼터를 생성해 주세요.');
        return;
      }

      try {
        btnReEnrich.disabled = true;
        btnReEnrich.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 외부 공인 데이터 탐색 중...';
        appendLog('info', `[결측치 외부 재보강] "${lastCreatedQuota.title}" 외부 검색 탐색을 시작합니다...`);

        const res = await fetch('/api/quota/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: lastCreatedQuota.jsonFileName })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '보강 실패');

        appendLog('success', result.message);
        renderExcelGrid(result);
        alert(`결측치 외부 보강 완료!\n총 ${result.enrichedCount}건의 실존 데이터가 추가 보강되었습니다.`);
      } catch (err) {
        appendLog('error', `보강 오류: ${err.message}`);
        alert('결측치 보강 실패: ' + err.message);
      } finally {
        btnReEnrich.disabled = false;
        btnReEnrich.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 결측치 외부 재보강';
      }
    });
  }

  // [신규] '이 쿼터로 설문 시작' 버튼 이벤트 핸들러
  const btnCreateCamp = document.getElementById('btn-create-campaign-from-quota');
  if (btnCreateCamp) {
    btnCreateCamp.addEventListener('click', async () => {
      if (!lastCreatedQuota || !lastCreatedQuota.jsonFileName) {
        alert('먼저 조사 쿼터를 생성해 주세요.');
        return;
      }

      const qTitle = lastCreatedQuota.title || '조사쿼터';
      const defaultCampTitle = `${qTitle}_설문조사`;
      const campTitle = prompt('생성할 설문조사 캠페인 명칭을 입력하세요:', defaultCampTitle);
      if (!campTitle) return;

      try {
        btnCreateCamp.disabled = true;
        btnCreateCamp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 설문 생성 중...';

        const res = await fetch('/api/campaigns/create-from-quota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quotaFileName: lastCreatedQuota.jsonFileName,
            title: campTitle
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '캠페인 생성 실패');

        appendLog('success', `새 설문 캠페인이 생성되었습니다! (ID: ${data.campaign.id})`);
        alert(`"${data.campaign.title}" 설문 캠페인이 생성되었습니다!\n설문 상세 작업실로 이동합니다.`);
        window.location.href = `survey-detail.html?id=${data.campaign.id}`;
      } catch (err) {
        alert('캠페인 생성 실패: ' + err.message);
        btnCreateCamp.disabled = false;
        btnCreateCamp.innerHTML = '<i class="fa-solid fa-rocket"></i> 이 쿼터로 설문 시작';
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
