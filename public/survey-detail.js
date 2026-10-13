/**
 * 설문조사 상세 작업실 제어 스크립트 (survey-detail.js)
 * 1차 제반 작업(조사 쿼터 DB 구축) + 2차 제반 작업(방향성 설정) + 3차 자동 실행
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const campId = urlParams.get('id');

  if (!campId) {
    alert('잘못된 접근입니다. 캠페인 ID가 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  // DOM 요소 참조
  const titleEl = document.getElementById('detail-campaign-title');
  const quotaBadge = document.getElementById('detail-quota-badge');
  const statusBadge = document.getElementById('detail-status-badge');
  const statusIndicator = document.getElementById('system-status-indicator');
  const statusText = document.getElementById('system-status-text');

  // 1차 작업: 쿼터 설정 요소
  const tabB2b = document.getElementById('detail-tab-b2b');
  const tabB2c = document.getElementById('detail-tab-b2c');
  const panelB2b = document.getElementById('panel-b2b-quota');
  const panelB2c = document.getElementById('panel-b2c-quota');
  const quotaSummaryBadge = document.getElementById('quota-summary-badge');

  const inputB2bKeyword = document.getElementById('input-b2b-keyword');
  const inputTargetCount = document.getElementById('input-target-count');
  const btnFieldsAll = document.getElementById('btn-fields-all');
  const btnFieldsCore = document.getElementById('btn-fields-core');
  const b2bCheckboxes = document.querySelectorAll('input[name="b2b-fields"]');

  const btnBuildQuotaDb = document.getElementById('btn-build-quota-db');
  const quotaDbCount = document.getElementById('quota-db-count');
  const quotaDbStatus = document.getElementById('quota-db-status');
  const quotaTableBody = document.getElementById('quota-table-body');

  // 2차 작업: 방향성 가이드 요소
  const inputSurveyUrl = document.getElementById('input-survey-url');
  const btnFillSample = document.getElementById('btn-fill-sample-url');
  const inputSurveyTopic = document.getElementById('input-survey-topic');
  const inputTextGuidelines = document.getElementById('input-text-guidelines');
  const inputIterations = document.getElementById('input-iterations');
  const inputHeadless = document.getElementById('input-headless');

  // 슬라이더 요소
  const sliderPos = document.getElementById('slider-pos');
  const sliderNeu = document.getElementById('slider-neu');
  const sliderNeg = document.getElementById('slider-neg');
  const valPos = document.getElementById('val-pos');
  const valNeu = document.getElementById('val-neu');
  const valNeg = document.getElementById('val-neg');
  const barPos = document.getElementById('bar-pos');
  const barNeu = document.getElementById('bar-neu');
  const barNeg = document.getElementById('bar-neg');
  const valRatioBadge = document.getElementById('val-ratio-badge');

  // 실행 및 모니터링
  const form = document.getElementById('campaign-config-form');
  const btnStart = document.getElementById('btn-start-automation');
  const btnStop = document.getElementById('btn-stop-automation');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercentText = document.getElementById('progress-percent-text');
  const progressStatusText = document.getElementById('progress-status-text');
  const terminalLogs = document.getElementById('terminal-logs');
  const answersFeed = document.getElementById('answers-feed');

  let currentCampaign = null;

  // 1. 캠페인 데이터 로드
  async function loadCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${campId}`);
      if (!res.ok) throw new Error('캠페인을 찾을 수 없습니다.');
      currentCampaign = await res.json();
      renderCampaignDetails(currentCampaign);
    } catch (err) {
      alert('캠페인 로드 실패: ' + err.message);
      window.location.href = 'index.html';
    }
  }

  // 2. 캠페인 데이터 폼 바인딩
  function renderCampaignDetails(camp) {
    titleEl.textContent = camp.title;

    // 대상 유형 탭 설정
    setQuotaType(camp.quotaType || 'b2b');

    // 1차 쿼터 설정
    if (camp.quotaConfig) {
      if (camp.quotaConfig.b2bKeyword) inputB2bKeyword.value = camp.quotaConfig.b2bKeyword;
      if (camp.quotaConfig.targetCount) inputTargetCount.value = camp.quotaConfig.targetCount;
      if (camp.quotaConfig.selectedFields && camp.quotaConfig.selectedFields.length > 0) {
        b2bCheckboxes.forEach(cb => {
          cb.checked = camp.quotaConfig.selectedFields.includes(cb.value);
        });
      }
    }

    // 쿼터 DB 테이블 렌더링
    renderQuotaTable(camp.quotaDatabase || []);

    // 2차 방향성 가이드 설정
    if (camp.guidelineConfig) {
      inputSurveyUrl.value = camp.guidelineConfig.surveyUrl || '';
      inputSurveyTopic.value = camp.guidelineConfig.topic || '';
      inputTextGuidelines.value = camp.guidelineConfig.textGuidelines || '';
      inputIterations.value = camp.guidelineConfig.iterations || 1;
      inputHeadless.value = String(!!camp.guidelineConfig.headless);

      sliderPos.value = camp.guidelineConfig.positiveRatio ?? 70;
      sliderNeu.value = camp.guidelineConfig.neutralRatio ?? 20;
      sliderNeg.value = camp.guidelineConfig.negativeRatio ?? 10;
      updateRatios();
    }
  }

  // 쿼터 타입 전환 (B2C vs B2B)
  function setQuotaType(type) {
    if (type === 'b2b') {
      tabB2b.classList.add('active');
      tabB2c.classList.remove('active');
      panelB2b.style.display = 'block';
      panelB2c.style.display = 'none';
      quotaBadge.className = 'badge-quota-type b2b';
      quotaBadge.innerHTML = '<i class="fa-solid fa-building"></i> 사업주 대상 (B2B)';
      quotaSummaryBadge.textContent = '대상: 사업주 (MarketBz DB 연동)';
    } else {
      tabB2c.classList.add('active');
      tabB2b.classList.remove('active');
      panelB2c.style.display = 'block';
      panelB2b.style.display = 'none';
      quotaBadge.className = 'badge-quota-type b2c';
      quotaBadge.innerHTML = '<i class="fa-solid fa-user"></i> 개인 대상 (B2C)';
      quotaSummaryBadge.textContent = '대상: 개인 (페르소나 자동변주)';
    }
  }

  document.querySelectorAll('input[name="quota-type"]').forEach(r => {
    r.addEventListener('change', (e) => {
      setQuotaType(e.target.value);
      // 서버 업데이트
      fetch(`/api/campaigns/${campId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotaType: e.target.value })
      });
    });
  });

  // 쿼터 DB 테이블 렌더링
  function renderQuotaTable(db) {
    quotaDbCount.textContent = db.length;
    if (db.length > 0) {
      quotaDbStatus.className = 'badge-status completed';
      quotaDbStatus.textContent = 'DB 구축 완료';

      quotaTableBody.innerHTML = db.map((item, idx) => {
        const isUsed = item.quotaStatus === 'used';
        const statusBadgeHtml = isUsed
          ? '<span class="badge-row-status used"><i class="fa-solid fa-check"></i> 응답 완료</span>'
          : '<span class="badge-row-status ready">대기</span>';

        const phoneVal = item.phone || '-';
        const openDateVal = item.openDate || '-';
        const itemVal = item.handledItems || item.industry || '-';
        const ceoVal = item.ceoName || '-';

        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(item.companyName)}</strong></td>
            <td><code>${escapeHtml(item.bizNumber || '-')}</code></td>
            <td>${escapeHtml(ceoVal)}</td>
            <td>${escapeHtml(phoneVal)}</td>
            <td>${escapeHtml(openDateVal)}</td>
            <td><span class="badge-quota-type b2b" style="font-size: 11px;">${escapeHtml(itemVal)}</span></td>
            <td>${escapeHtml(item.address ? (item.address.length > 25 ? item.address.slice(0, 25) + '...' : item.address) : '-')}</td>
            <td>${statusBadgeHtml}</td>
          </tr>
        `;
      }).join('');
    } else {
      quotaDbStatus.className = 'badge-status ready';
      quotaDbStatus.textContent = 'DB 준비 필요';
      quotaTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table-msg">
            <i class="fa-solid fa-circle-info"></i> 아직 구축된 사업자 DB가 없습니다.<br>
            상단의 <strong>[기존 조사 쿼터 불러오기]</strong>에서 쿼터를 선택해 장착해 주세요.
          </td>
        </tr>
      `;
    }
  }

  // [신규] 보관된 쿼터 목록 로드
  const selectSavedQuota = document.getElementById('select-saved-quota');
  const btnImportQuota = document.getElementById('btn-import-quota');

  async function loadSavedQuotas() {
    try {
      const res = await fetch('/api/quota/list');
      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) {
        selectSavedQuota.innerHTML = '<option value="">보관된 쿼터가 없습니다. 새로 생성해 주세요.</option>';
        return;
      }

      selectSavedQuota.innerHTML = list.map(q => {
        const typeBadge = q.type === 'ONNURI_HYBRID' ? '[온누리]' : '[마켓비즈]';
        const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '';
        return `
          <option value="${escapeHtml(q.fileName)}">
            ${typeBadge} ${escapeHtml(q.title)} (${q.count}건) - ${dateStr}
          </option>
        `;
      }).join('');
    } catch (err) {
      selectSavedQuota.innerHTML = '<option value="">쿼터 목록을 불러오지 못했습니다.</option>';
    }
  }

  // [신규] 쿼터 장착(Import) 버튼 이벤트
  if (btnImportQuota) {
    btnImportQuota.addEventListener('click', async () => {
      const quotaFileName = selectSavedQuota.value;
      if (!quotaFileName) {
        alert('장착할 쿼터를 선택해 주세요.');
        return;
      }

      try {
        btnImportQuota.disabled = true;
        btnImportQuota.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 쿼터 장착 중...';

        const res = await fetch(`/api/campaigns/${campId}/import-quota`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quotaFileName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '쿼터 장착 실패');

        appendLog('success', data.message);
        currentCampaign = data.campaign;
        renderCampaignDetails(currentCampaign);
        alert(data.message);
      } catch (err) {
        alert('쿼터 장착 오류: ' + err.message);
        appendLog('error', `쿼터 장착 오류: ${err.message}`);
      } finally {
        btnImportQuota.disabled = false;
        btnImportQuota.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> 쿼터 장착';
      }
    });
  }

  loadSavedQuotas();

  // 1차 작업: [MarketBz 실존 사업자 제반 DB 구축하기] 클릭
  btnBuildQuotaDb.addEventListener('click', async () => {
    const keyword = inputB2bKeyword.value.trim() || '소프트웨어';
    const targetCount = parseInt(inputTargetCount.value, 10) || 2;
    const selectedFields = Array.from(document.querySelectorAll('input[name="b2b-fields"]:checked')).map(cb => cb.value);

    try {
      btnBuildQuotaDb.disabled = true;
      btnBuildQuotaDb.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> MarketBz에서 실존 사업자 수집 중...';
      appendLog('info', `[1차 작업] MarketBz에 로그인하여 "${keyword}" 실존 사업자 DB(${targetCount}건)를 구축합니다...`);

      const res = await fetch(`/api/campaigns/${campId}/build-quota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b2bKeyword: keyword, targetCount, selectedFields })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'DB 구축 실패');

      appendLog('info', '사업자 수집 작업이 백그라운드에서 진행 중입니다. 잠시 기다려 주세요.');
    } catch (err) {
      appendLog('error', `1차 작업 실패: ${err.message}`);
      btnBuildQuotaDb.disabled = false;
      btnBuildQuotaDb.innerHTML = '<i class="fa-solid fa-database"></i> MarketBz 실존 사업자 제반 DB 구축하기';
    }
  });

  // 필드 프리셋
  btnFieldsAll.addEventListener('click', () => b2bCheckboxes.forEach(cb => cb.checked = true));
  btnFieldsCore.addEventListener('click', () => {
    const core = ['companyName', 'bizNumber', 'ceoName', 'address'];
    b2bCheckboxes.forEach(cb => cb.checked = core.includes(cb.value));
  });

  // 샘플 설문지 채우기
  btnFillSample.addEventListener('click', () => {
    const origin = window.location.origin;
    const isB2b = document.querySelector('input[name="quota-type"]:checked').value === 'b2b';
    if (isB2b) {
      inputSurveyUrl.value = `${origin}/mock-survey-b2b.html`;
      inputSurveyTopic.value = '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 지원 설문';
      inputTextGuidelines.value = '연구개발(R&D) 인력 수급과 세제 혜택 지원이 가장 시급하며 클라우드 바우처 사업이 실무에 큰 도움이 되었다는 관점';
    } else {
      inputSurveyUrl.value = `${origin}/mock-survey.html`;
      inputSurveyTopic.value = '2026 차세대 AI 서비스 만족도 및 개선 의견';
      inputTextGuidelines.value = '대시보드 UI와 빠른 처리 속도에 높은 점수를 주되, 알림 기능이 보완되면 좋겠다는 실무적 피드백';
    }
    appendLog('info', '샘플 설문지 및 방향성 가이드라인이 채워졌습니다.');
  });

  // 슬라이더 제어
  function updateRatios() {
    let p = parseInt(sliderPos.value, 10);
    let n = parseInt(sliderNeu.value, 10);
    let g = parseInt(sliderNeg.value, 10);
    const total = p + n + g || 100;

    const normP = Math.round((p / total) * 100);
    const normN = Math.round((n / total) * 100);
    const normG = 100 - normP - normN;

    valPos.textContent = `${p}%`;
    valNeu.textContent = `${n}%`;
    valNeg.textContent = `${g}%`;

    barPos.style.width = `${normP}%`; barPos.textContent = `긍정 ${normP}%`;
    barNeu.style.width = `${normN}%`; barNeu.textContent = `중립 ${normN}%`;
    barNeg.style.width = `${normG}%`; barNeg.textContent = `부정 ${normG}%`;

    valRatioBadge.textContent = `가중합: ${total}% (정규화)`;
  }

  sliderPos.addEventListener('input', updateRatios);
  sliderNeu.addEventListener('input', updateRatios);
  sliderNeg.addEventListener('input', updateRatios);

  // 3차 실행: 설문 자동화 시작
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const surveyUrl = inputSurveyUrl.value.trim();
    if (!surveyUrl) {
      alert('설문조사 URL을 입력해 주세요.');
      return;
    }

    const payload = {
      surveyUrl,
      topic: inputSurveyTopic.value.trim(),
      positiveRatio: parseInt(sliderPos.value, 10),
      neutralRatio: parseInt(sliderNeu.value, 10),
      negativeRatio: parseInt(sliderNeg.value, 10),
      textGuidelines: inputTextGuidelines.value.trim(),
      iterations: parseInt(inputIterations.value, 10) || 1,
      headless: inputHeadless.value === 'true'
    };

    try {
      setRunningState(true);
      appendLog('info', '서버에 캠페인 설문 자동화 실행을 요청합니다...');

      const res = await fetch(`/api/campaigns/${campId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실행 실패');
      appendLog('success', data.message);
    } catch (err) {
      appendLog('error', `실행 실패: ${err.message}`);
      setRunningState(false);
    }
  });

  // 중지 버튼
  btnStop.addEventListener('click', async () => {
    await fetch('/api/survey/stop', { method: 'POST' });
    setRunningState(false);
  });

  // 로그 초기화
  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    appendLog('info', '콘솔 로그가 초기화되었습니다.');
  });

  // SSE 연결
  function initEventSource() {
    const sse = new EventSource('/api/events');
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          appendLog(data.level, data.message, data.timestamp);
          if (data.message.includes('1차 작업 완료')) {
            btnBuildQuotaDb.disabled = false;
            btnBuildQuotaDb.innerHTML = '<i class="fa-solid fa-database"></i> MarketBz 실존 사업자 제반 DB 구축하기';
            loadCampaign(); // 테이블 리로드
          }
          if (data.message.includes('모든 설문 작업이 성공적으로 완료')) {
            setRunningState(false);
            loadCampaign();
          }
        } else if (data.type === 'progress') {
          progressBarFill.style.width = `${data.percent}%`;
          progressPercentText.textContent = `${data.percent}%`;
          if (data.statusText) progressStatusText.textContent = data.statusText;
        } else if (data.type === 'answer') {
          const empty = answersFeed.querySelector('.empty-feed');
          if (empty) empty.remove();
          const card = document.createElement('div');
          card.className = 'answer-card';
          card.innerHTML = `
            <div class="q-title">${escapeHtml(data.questionTitle)}</div>
            <div class="q-chosen"><i class="fa-solid fa-check"></i> ${escapeHtml(JSON.stringify(data.chosenAnswer))}</div>
          `;
          answersFeed.prepend(card);
        }
      } catch (_) {}
    };
  }

  function appendLog(level, msg, time = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const t = time || new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">[${t}]</span><span class="log-badge ${level}">${level.toUpperCase()}</span><span class="log-msg">${escapeHtml(msg)}</span>`;
    terminalLogs.appendChild(entry);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  function setRunningState(running) {
    if (running) {
      statusIndicator.classList.add('running');
      statusText.textContent = '자동화 실행 중 (로봇 작동)';
      btnStart.disabled = true;
      btnStop.disabled = false;
      progressStatusText.textContent = '설문 자동화 진행 중...';
    } else {
      statusIndicator.classList.remove('running');
      statusText.textContent = '준비 완료 (대기 중)';
      btnStart.disabled = false;
      btnStop.disabled = true;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  await loadCampaign();
  initEventSource();
});
