/**
 * AutoSurvey AI 대시보드 프론트엔드 제어 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 참조
  const form = document.getElementById('survey-form');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  const statusIndicator = document.getElementById('system-status-indicator');
  const statusText = document.getElementById('system-status-text');

  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercentText = document.getElementById('progress-percent-text');
  const progressStatusText = document.getElementById('progress-status-text');

  const terminalLogs = document.getElementById('terminal-logs');
  const answersFeed = document.getElementById('answers-feed');

  // 비중 슬라이더 & 바
  const sliderPos = document.getElementById('slider-pos');
  const sliderNeu = document.getElementById('slider-neu');
  const sliderNeg = document.getElementById('slider-neg');

  const valPos = document.getElementById('val-pos');
  const valNeu = document.getElementById('val-neu');
  const valNeg = document.getElementById('val-neg');

  const barPos = document.getElementById('bar-pos');
  const barNeu = document.getElementById('bar-neu');
  const barNeg = document.getElementById('bar-neg');
  const ratioTotalBadge = document.getElementById('ratio-total-badge');
  const btnDemoUrl = document.getElementById('btn-demo-url');

  // 모드 탭 제어
  const tabB2c = document.getElementById('tab-b2c');
  const tabB2b = document.getElementById('tab-b2b');
  const sectionB2cPersona = document.getElementById('section-b2c-persona');
  const sectionB2bConfig = document.getElementById('section-b2b-config');
  const modeRadios = document.querySelectorAll('input[name="survey-mode"]');

  function setSurveyMode(mode) {
    if (mode === 'b2b') {
      tabB2b.classList.add('active');
      tabB2c.classList.remove('active');
      sectionB2bConfig.classList.remove('hidden');
      sectionB2cPersona.classList.add('hidden');
      appendLog('info', '사업자 대상(B2B) 설문 모드가 활성화되었습니다. MarketBz 실존 데이터가 연동됩니다.');
    } else {
      tabB2c.classList.add('active');
      tabB2b.classList.remove('active');
      sectionB2cPersona.classList.remove('hidden');
      sectionB2bConfig.classList.add('hidden');
      appendLog('info', '개인 대상(B2C) 설문 모드가 활성화되었습니다.');
    }
  }

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      setSurveyMode(e.target.value);
    });
  });

  // 사업자 필드 선택 프리셋 버튼
  const btnSelectAll = document.getElementById('btn-select-all-fields');
  const btnSelectCore = document.getElementById('btn-select-core-fields');
  const b2bCheckboxes = document.querySelectorAll('input[name="b2b-fields"]');

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      b2bCheckboxes.forEach(cb => cb.checked = true);
    });
  }

  if (btnSelectCore) {
    btnSelectCore.addEventListener('click', () => {
      const coreFields = ['companyName', 'bizNumber', 'ceoName', 'address'];
      b2bCheckboxes.forEach(cb => {
        cb.checked = coreFields.includes(cb.value);
      });
    });
  }

  // 샘플 테스트 폼 자동 채우기
  if (btnDemoUrl) {
    btnDemoUrl.addEventListener('click', () => {
      const origin = window.location.origin;
      const currentMode = document.querySelector('input[name="survey-mode"]:checked')?.value || 'b2c';

      if (currentMode === 'b2b') {
        document.getElementById('survey-url').value = `${origin}/mock-survey-b2b.html`;
        document.getElementById('survey-topic').value = '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 지원 설문';
        document.getElementById('b2b-keyword').value = '소프트웨어';
        document.getElementById('text-guidelines').value = '연구개발(R&D) 인력 수급과 세제 혜택 지원이 가장 시급하며 클라우드 바우처 사업이 실무에 큰 도움이 되었다는 관점으로 작성';
        appendLog('info', 'B2B 사업자 샘플 설문지 URL 및 가이드라인이 채워졌습니다.');
      } else {
        document.getElementById('survey-url').value = `${origin}/mock-survey.html`;
        document.getElementById('survey-topic').value = '2026 차세대 AI 서비스 만족도 및 개선 의견';
        document.getElementById('persona-desc').value = 'AI 툴을 매일 활용하며 실용적인 생산성 기능을 중시하는 30대 직장인';
        document.getElementById('text-guidelines').value = '대시보드 UI와 빠른 처리 속도에 높은 점수를 주되, 알림 기능과 통계 차트 다운로드 기능이 보완되면 좋겠다는 실무적 피드백 위주로 작성';
        appendLog('info', 'B2C 개인 샘플 테스트 설문 URL 및 기본 가이드라인이 입력되었습니다.');
      }
    });
  }

  // 1. 슬라이더 비중 실시간 업데이트 핸들러
  function updateRatios() {
    let p = parseInt(sliderPos.value, 10);
    let n = parseInt(sliderNeu.value, 10);
    let g = parseInt(sliderNeg.value, 10);

    const total = p + n + g;
    if (total === 0) {
      p = 70; n = 20; g = 10;
    }

    // 백분율 정규화 계산
    const normP = Math.round((p / (total || 1)) * 100);
    const normN = Math.round((n / (total || 1)) * 100);
    const normG = 100 - normP - normN;

    valPos.textContent = `${p}%`;
    valNeu.textContent = `${n}%`;
    valNeg.textContent = `${g}%`;

    barPos.style.width = `${normP}%`;
    barPos.textContent = `긍정 ${normP}%`;

    barNeu.style.width = `${normN}%`;
    barNeu.textContent = `중립 ${normN}%`;

    barNeg.style.width = `${normG}%`;
    barNeg.textContent = `부정 ${normG}%`;

    ratioTotalBadge.textContent = `가중합: ${total}% (정규화 반영)`;
  }

  sliderPos.addEventListener('input', updateRatios);
  sliderNeu.addEventListener('input', updateRatios);
  sliderNeg.addEventListener('input', updateRatios);
  updateRatios();

  // 2. 터미널 로그 출력 헬퍼
  function appendLog(level, message, time = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;

    const timestamp = time || new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
    entry.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-badge ${level}">${level.toUpperCase()}</span>
      <span class="log-msg">${escapeHtml(message)}</span>
    `;

    terminalLogs.appendChild(entry);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 로그 지우기
  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    appendLog('info', '콘솔 로그가 초기화되었습니다.');
  });

  // 3. SSE (Server-Sent Events) 스트림 연결
  function initEventSource() {
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          appendLog(data.level, data.message, data.timestamp);
        } else if (data.type === 'progress') {
          progressBarFill.style.width = `${data.percent}%`;
          progressPercentText.textContent = `${data.percent}%`;
          if (data.statusText) {
            progressStatusText.textContent = data.statusText;
          }
        } else if (data.type === 'answer') {
          // 답변 스냅샷 피드 갱신
          const emptyFeed = answersFeed.querySelector('.empty-feed');
          if (emptyFeed) emptyFeed.remove();

          const card = document.createElement('div');
          card.className = 'answer-card';
          card.innerHTML = `
            <div class="q-title">${escapeHtml(data.questionTitle)}</div>
            <div class="q-chosen"><i class="fa-solid fa-check"></i> ${escapeHtml(JSON.stringify(data.chosenAnswer))}</div>
          `;
          answersFeed.prepend(card);
        }
      } catch (err) {
        console.error('SSE 메시지 파싱 오류:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE 연결 대기 중...');
    };
  }

  initEventSource();

  // 4. 설문 시작 폼 제출
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = document.getElementById('survey-url').value.trim();
    const topic = document.getElementById('survey-topic').value.trim();
    const age = document.getElementById('persona-age').value;
    const gender = document.getElementById('persona-gender').value;
    const personaDesc = document.getElementById('persona-desc').value.trim();
    const textGuidelines = document.getElementById('text-guidelines').value.trim();
    const iterations = parseInt(document.getElementById('iterations').value, 10) || 1;
    const headless = document.getElementById('headless-toggle').value === 'true';
    const apiKey = document.getElementById('gemini-key').value.trim();

    const mode = document.querySelector('input[name="survey-mode"]:checked')?.value || 'b2c';
    const b2bKeyword = document.getElementById('b2b-keyword')?.value.trim() || '소프트웨어';
    const selectedB2bFields = Array.from(document.querySelectorAll('input[name="b2b-fields"]:checked')).map(cb => cb.value);

    const payload = {
      mode,
      b2bKeyword,
      selectedB2bFields,
      url,
      topic,
      persona: {
        age: age.includes('랜덤') ? '' : age,
        gender: gender.includes('랜덤') ? '' : gender,
        description: personaDesc
      },
      positiveRatio: parseInt(sliderPos.value, 10),
      neutralRatio: parseInt(sliderNeu.value, 10),
      negativeRatio: parseInt(sliderNeg.value, 10),
      textGuidelines,
      iterations,
      headless,
      apiKey
    };

    try {
      setRunningState(true);
      appendLog('info', '서버에 설문 자동화 시작 요청을 전송합니다...');

      const response = await fetch('/api/survey/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '작업 시작에 실패했습니다.');
      }

      appendLog('success', data.message);
    } catch (err) {
      appendLog('error', `시작 실패: ${err.message}`);
      setRunningState(false);
    }
  });

  // 5. 작업 중지 요청
  btnStop.addEventListener('click', async () => {
    try {
      appendLog('warn', '작업 중지 요청을 서버로 전송합니다...');
      const response = await fetch('/api/survey/stop', { method: 'POST' });
      const data = await response.json();
      appendLog('info', data.message);
    } catch (err) {
      appendLog('error', `중지 요청 실패: ${err.message}`);
    } finally {
      setRunningState(false);
    }
  });

  // 상태 변경 UI 헬퍼
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

  // 초기 상태 조회
  async function checkInitialStatus() {
    try {
      const res = await fetch('/api/survey/status');
      const data = await res.json();
      if (data.isRunning) {
        setRunningState(true);
      }
    } catch (_) {}
  }
  checkInitialStatus();
});
