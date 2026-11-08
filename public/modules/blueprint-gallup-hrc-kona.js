import { escapeHtml, getBadgeClass, getBadgeLabel } from './blueprint-utils.js';

export function renderKonaBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid }) {
  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';

  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) presetGroup.style.display = 'none';

  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';

  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) titleEl.textContent = '화성특례시 만족도 청소년 설문조사 기준점 및 응답 규칙 (40문항 / 하위 포함 53단계)';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = '코나체인 리서치 청소년 설문(Event 2085)의 문항별 확률 분포, 조건부 분기 및 제출 직전 스크린샷 캡처 규칙이 탑재되어 있습니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-camera"></i> 40문항 규칙 &amp; 제출 직전 캡처 활성';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 청소년 설문 기준 가이드 저장';
  }

  if (!blueprintStageGrid) return;
  const stages = data.blueprint?.stages || [];
  blueprintStageGrid.innerHTML = stages.map(st => `
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">${escapeHtml(st.step)}</span>
          <h3 class="blueprint-stage-title">${escapeHtml(st.title)}</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="blueprint-asp-tag font-mono">${escapeHtml(st.aspFile || '')}</span>
          <span class="${getBadgeClass(st.badge)}">${getBadgeLabel(st.badge)}</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">${escapeHtml(st.description || '')}</div>
      <div class="blueprint-field-list">
        ${(st.fields || []).map(f => `
          <div class="blueprint-field-item">
            <div class="blueprint-field-top">
              <span class="blueprint-field-code font-mono">${escapeHtml(f.id)}</span>
              <span class="blueprint-field-label font-bold">${escapeHtml(f.label)}</span>
            </div>
            <div class="blueprint-field-rule text-dim font-caption mt-4">${escapeHtml(f.rule || '')}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');
}

export function renderHrcEnergyBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid }) {
  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';

  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) presetGroup.style.display = 'none';

  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';

  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) titleEl.textContent = '2025년 기준 에너지총조사 [건물 부문] 응답 규칙 및 기입력 보존 정책';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = '한국리서치 TAPI(2026-89-0342C) 건물 기본정보 및 본설문(A1~E1-5) 자동화 규칙입니다. 기존에 이미 입력되어 있는 모든 항목은 절대 건드리지 않고 그대로 보존합니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 기입력 항목 100% 보존 &amp; 증빙 자동 생략 활성';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 에너지총조사 응답 규칙 저장';
  }

  if (!blueprintStageGrid) return;
  const stages = data.blueprint?.stages || [];
  const policyBannerHtml = `
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%; border: 1px solid rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.06);">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill" style="background: rgba(16, 185, 129, 0.2); color: #34d399;"><i class="fa-solid fa-shield-halved"></i> 핵심 보호 규칙</span>
          <h3 class="blueprint-stage-title">에너지총조사 [건물 부문] 3대 절대 준수 규칙</h3>
        </div>
        <span class="badge-status success"><i class="fa-solid fa-lock"></i> 상시 강제 적용</span>
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
        <div class="assoc-rule-box mb-0">
          <strong class="text-success"><i class="fa-solid fa-check-double"></i> 1. 기입력 항목 100% 보존 (절대 수정 금지)</strong>
          <div class="font-caption text-dim mt-4">[기본정보] 및 본설문 모든 화면에서 이미 값이 입력되어 있거나 선택된 문항은 단 하나도 덮어쓰지 않고 그대로 유지하며 통과합니다.</div>
        </div>
        <div class="assoc-rule-box mb-0">
          <strong class="text-warning"><i class="fa-solid fa-ban"></i> 2. SMS / 이메일 발송 버튼 절대 클릭 금지</strong>
          <div class="font-caption text-dim mt-4">[기본정보] 페이지의 문자 발송(#sendMsgBtn1/2) 및 이메일 발송(#sendEmailBtn1/2) 버튼은 어떤 경우에도 클릭하지 않습니다.</div>
        </div>
        <div class="assoc-rule-box mb-0">
          <strong class="text-primary-color"><i class="fa-solid fa-arrows-Turn-to-dots"></i> 3. [선정] 쿼터 우선 실행 &amp; [대체] 자동 승계</strong>
          <div class="font-caption text-dim mt-4">구글 시트 쿼터의 [선정] 표본을 우선 실행하며, 오류 발생 시 동일 표본층(Cell: 시도_주용도_연면적) 내 차순위 [대체] 표본을 자동으로 승계합니다.</div>
        </div>
      </div>
    </section>
  `;

  blueprintStageGrid.innerHTML = policyBannerHtml + stages.map(st => `
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">${escapeHtml(st.step)}</span>
          <h3 class="blueprint-stage-title">${escapeHtml(st.title)}</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="blueprint-asp-tag font-mono">${escapeHtml(st.aspFile || '')}</span>
          <span class="${getBadgeClass(st.badge)}">${getBadgeLabel(st.badge)}</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">${escapeHtml(st.description || '')}</div>
      <div class="blueprint-field-list">
        ${(st.fields || []).map(f => `
          <div class="blueprint-field-item">
            <div class="blueprint-field-top">
              <span class="blueprint-field-code font-mono">${escapeHtml(f.id)}</span>
              <span class="blueprint-field-label font-bold">${escapeHtml(f.label)}</span>
            </div>
            <div class="blueprint-field-rule text-dim font-caption mt-4">${escapeHtml(f.rule || f.value || '')}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');
}

export function renderGallupReturnFarmBlueprint(data, {
  getCurrentCampaign,
  checkedGallupSeqs,
  badgeMasterStatus,
  btnSaveBaseline,
  blueprintStageGrid,
  triggerBatchRun
}) {
  const currentCampaign = getCurrentCampaign();
  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';
  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) presetGroup.style.display = 'none';
  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';
  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) titleEl.textContent = '2026년 귀농귀촌 실태조사(귀농) · 4대 핵심 자동화 규칙 및 전자서명 필체 다변화 정책';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = '1) 대상 지역(홍천군 10개 읍·면) 브라우저 GPS 강제 주입, 2) 방문기록 입력 검증 규칙 준수, 3) 답례품 인수증 전자서명 8종 필체 다변화, 4) 최종 제출 직전(Page 118) 안전 대기 정책입니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> 홍천군 GPS 주입 · 방문기록 검증 · 8종 전자서명 · Page 118 완료직전 정지 활성';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 귀농실태조사 자동화 정책 저장';
  }

  if (!blueprintStageGrid) return;
  const qDb = currentCampaign?.quotaDatabase || [];
  const checkedCount = checkedGallupSeqs.size;
  const pol = data.policy || currentCampaign?.masterBaseline?.policy || {};
  const gsheetUrl = currentCampaign?.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1Hoai6ggQWxNVTW5SyxEsvpNtMOlBO1z_ThmM6cZ6gRg/edit?gid=1470110969#gid=1470110969';

  blueprintStageGrid.innerHTML = `
    <section class="blueprint-card full-width-card globalri-step2-target-banner">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <span class="blueprint-step-pill" style="background: #dbeafe; color: #1d4ed8; font-weight: 800;">
            <i class="fa-solid fa-shield-halved"></i> 한국갤럽 G-CAII (20263603) 4대 필수 자동화 검증 시스템
          </span>
          <strong style="font-size: 16px; color: #0f172a; margin-left: 8px;">
            강원특별자치도 홍천군 선정명단 (${qDb.length}명) · 현재 체크된 실행 대상: <span style="color: #2563eb;">${checkedCount}명</span>
          </strong>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="btn-gallup-step2-batch" class="btn-pill btn-pill-success font-bold" style="padding: 9px 18px; font-size: 13.5px;">
            <i class="fa-solid fa-rocket"></i> 🚀 체크한 대상자 (${checkedCount}명) 완료 직전(Page 118)까지 일괄 실행
          </button>
          <a href="${escapeHtml(gsheetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary font-bold" style="padding: 9px 16px; font-size: 13px; text-decoration: none;">
            <i class="fa-solid fa-table text-success"></i> 선정명단 구글 스프레드시트 열기
          </a>
        </div>
      </div>
    </section>

    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">규칙 1 · GPS 스푸핑</span>
          <h3 class="blueprint-stage-title">1. 대상 지역(홍천군 10개 읍·면) 브라우저 GPS 강제 주입</h3>
        </div>
        <span class="badge-status success"><i class="fa-solid fa-location-crosshairs"></i> 상시 강제 주입</span>
      </div>
      <div class="blueprint-stage-desc">
        G-CAII 설문지의 <code>navigator.geolocation.getCurrentPosition</code> 호출 시, 대상자의 실제 주소지(강원특별자치도 홍천군 홍천읍·화촌면·두촌면·내촌면·서석면·영귀미면·남면·서면·북방면·내면) 중심 좌표에 응답자 고유 지터(±250m)를 더해 <code>#p_gps_lat</code> / <code>#p_gps_lng</code>에 주입합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold">GPS 좌표 주입 방식</label>
        <select id="sel-gallup-gps-mode" class="figma-select w-full">
          <option value="eup_myeon_jitter" ${pol.gpsMode !== 'fixed' ? 'selected' : ''}>홍천군 10개 읍·면별 실측 중심좌표 + 응답자별 고유 미세 지터 (±250m · 권장)</option>
          <option value="fixed" ${pol.gpsMode === 'fixed' ? 'selected' : ''}>홍천군청 기준 대표 좌표 고정</option>
        </select>
      </div>
    </section>

    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">규칙 2 · 방문 기록 검증</span>
          <h3 class="blueprint-stage-title">2. 방문 기록 입력(1~5차) 유효성 검증 규칙 완벽 준수</h3>
        </div>
        <span class="badge-status success"><i class="fa-solid fa-calendar-check"></i> 검증 규칙 통과</span>
      </div>
      <div class="blueprint-stage-desc">
        <code>ResponseIdStart_20263603.asp</code>의 방문기록 검증 트랩(① <code>07시~22시</code> 외 입력 차단, ② 차수 순차 입력 필수, ③ 이전 차수보다 빠른 일시 차단, ④ 최종 차수 <code>'컨택성공(1)'</code> 필수, ⑤ 기존 방문기록이 있으면 보존 후 마지막 차수를 컨택성공으로 설정)을 100% 준수합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold">방문 시간대 생성 범위 (07~22시 제약 내)</label>
        <select id="sel-gallup-visit-hours" class="figma-select w-full">
          <option value="10_17" ${pol.visitHourRange !== '09_19' ? 'selected' : ''}>주간 방문 표준 시간대 (10:00 ~ 17:50 · 권장)</option>
          <option value="09_19" ${pol.visitHourRange === '09_19' ? 'selected' : ''}>넓은 주간 시간대 (09:00 ~ 19:50)</option>
        </select>
      </div>
    </section>

    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">규칙 3 · 전자서명 필체 다변화</span>
          <h3 class="blueprint-stage-title">3. 답례품 인수증 전자서명 패드(Page 7) 8종 한글 필체 변주</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-signature"></i> 8종 필체 변주</span>
      </div>
      <div class="blueprint-stage-desc">
        Page 7(<code>T3 답례품 인수증 서명</code>)의 <code>#signature_pad_Q3_1 canvas</code>에 대상자 성명 한글 자모를 베지어 곡선·필압·기울기·자간·획 굵기가 서로 다른 <strong>8가지 필체 스타일(정자체·우상향 흘림·둥근 굴림·힘찬 각진체·소폭 단아체·세로 장체·와이드 서명체·약자 연필체)</strong>과 응답자 고유 난수 시드로 그려 다른 사람이 직접 서명한 것처럼 업로드합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold">전자서명 필체 적용 방식</label>
        <select id="sel-gallup-sig-mode" class="figma-select w-full">
          <option value="auto_rotate" ${pol.signatureStyleMode !== 'random' ? 'selected' : ''}>응답자 ID 기반 8종 한글 자모 필체 자동 분배 + 미세 획 변주 (권장)</option>
          <option value="random" ${pol.signatureStyleMode === 'random' ? 'selected' : ''}>매 실행 시 8종 필체 완전 무작위 선택</option>
        </select>
      </div>
    </section>

    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">규칙 4 · 완료 직전 정지</span>
          <h3 class="blueprint-stage-title">4. 최종 제출 직전 상태(Page 118)까지 진행 후 안전 대기</h3>
        </div>
        <span class="badge-status pilot"><i class="fa-solid fa-flag-checkered"></i> Page 118 정지</span>
      </div>
      <div class="blueprint-stage-desc">
        SQ1~SQ7 ➔ Page 7(서명 업로드) ➔ 본설문(귀농동향·준비·정착·주거·농지·영농활동·지역융화·경제활동·삶의질) ➔ <strong>마지막 Page 118(응답자 성명·연락처·주소)</strong>까지 모든 문항을 입력·임시저장(<code>rschRspnsWrite</code>)하되, <strong>[조사완료] 버튼은 클릭하지 않고 진행중(99%) 상태에서 안전 정지</strong>합니다.
      </div>
      <div class="p-14">
        <label class="figma-label font-bold">정지 지점 설정</label>
        <select id="sel-gallup-stop-mode" class="figma-select w-full">
          <option value="stop_before_submit" ${pol.stopBeforeSubmit !== false ? 'selected' : ''}>Page 118 (NAME·PHONE·ADDR) DB 저장 후 [조사완료] 클릭 직전 정지 (필수 권장)</option>
          <option value="full_submit" ${pol.stopBeforeSubmit === false ? 'selected' : ''}>[조사완료] 버튼까지 클릭하여 최종 제출 마감</option>
        </select>
      </div>
    </section>
  `;

  const btnStep2Batch = document.getElementById('btn-gallup-step2-batch');
  if (btnStep2Batch) {
    btnStep2Batch.addEventListener('click', () => triggerBatchRun());
  }
}

