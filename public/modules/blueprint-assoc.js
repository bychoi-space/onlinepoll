import { escapeHtml } from './blueprint-utils.js';

export function renderAssocBlueprint(data, { badgeMasterStatus, btnSaveBaseline, blueprintStageGrid, markUnsaved, appendLog }) {
  const assocPolicyState = { ...(data.policy || data.blueprint?.defaultPolicy || {}) };
  if (!assocPolicyState.A8_operatingHoursMode) assocPolicyState.A8_operatingHoursMode = 'standard';
  if (!assocPolicyState.A8_openHour) assocPolicyState.A8_openHour = '09';
  if (!assocPolicyState.A8_openMinute) assocPolicyState.A8_openMinute = '0';
  if (!assocPolicyState.A8_closeHour) assocPolicyState.A8_closeHour = '21';
  if (!assocPolicyState.A8_closeMinute) assocPolicyState.A8_closeMinute = '0';
  if (assocPolicyState.A8_noTime === undefined) assocPolicyState.A8_noTime = false;

  // 조사원 평가 기본값 보정
  if (assocPolicyState.eval_H1_1_cleanliness === undefined) assocPolicyState.eval_H1_1_cleanliness = 4;
  if (assocPolicyState.eval_H1_2_entrance === undefined) assocPolicyState.eval_H1_2_entrance = 4;
  if (assocPolicyState.eval_H1_3_parking === undefined) assocPolicyState.eval_H1_3_parking = 3;
  if (assocPolicyState.eval_H1_4_floor === undefined) assocPolicyState.eval_H1_4_floor = 4;
  if (assocPolicyState.eval_H1_jitter === undefined) assocPolicyState.eval_H1_jitter = true;

  if (assocPolicyState.eval_H2_1_specialStreet === undefined) assocPolicyState.eval_H2_1_specialStreet = '2';
  if (assocPolicyState.eval_H2_1_customText === undefined) assocPolicyState.eval_H2_1_customText = '먹거리 및 패션 특화골목';
  if (assocPolicyState.eval_H2_2_specialProduct === undefined) assocPolicyState.eval_H2_2_specialProduct = '2';
  if (assocPolicyState.eval_H2_2_customText === undefined) assocPolicyState.eval_H2_2_customText = '지역 대표 먹거리 및 신선식품';
  if (assocPolicyState.eval_H2_3_brandMark === undefined) assocPolicyState.eval_H2_3_brandMark = '2';
  if (assocPolicyState.eval_H2_3_customText === undefined) assocPolicyState.eval_H2_3_customText = '';
  if (assocPolicyState.eval_H2_4_brandUsage === undefined) assocPolicyState.eval_H2_4_brandUsage = '2';
  if (assocPolicyState.eval_H2_4_customText === undefined) assocPolicyState.eval_H2_4_customText = '';

  const bpSection = document.getElementById('section-master-blueprint');
  if (bpSection) {
    bpSection.classList.remove('hidden');
    bpSection.style.display = 'block';
  }

  const groupNav = document.querySelector('.blueprint-group-nav-container');
  if (groupNav) groupNav.style.display = 'none';

  const presetGroup = document.querySelector('.blueprint-preset-group');
  if (presetGroup) {
    presetGroup.style.display = 'inline-flex';
    presetGroup.innerHTML = `
      <span class="font-caption font-bold text-dim mr-4"><i class="fa-solid fa-wand-magic-sparkles text-primary-color"></i> 빠른 정책 가이드:</span>
      <button type="button" class="btn-chip" id="btn-assoc-preset-random" title="F5, F6, G1, G2를 모두 1~5번 무작위 랜덤 답변으로 일괄 설정">
        <i class="fa-solid fa-dice"></i> 🎲 1~5번 전 문항 랜덤 분산 일괄 적용
      </button>
      <button type="button" class="btn-chip" id="btn-assoc-preset-default" title="모든 정책 문항을 표준 1번 항목으로 초기화">
        <i class="fa-solid fa-rotate-left"></i> 표준 1번 항목 일괄 초기화
      </button>
    `;
  }

  const tplPicker = document.querySelector('.blueprint-template-picker');
  if (tplPicker) tplPicker.style.display = 'none';

  const legendWrap = document.querySelector('.blueprint-legend-inline');
  if (legendWrap) legendWrap.style.display = 'none';

  const titleEl = document.querySelector('#section-master-blueprint .step-card-title');
  if (titleEl) titleEl.textContent = '상인회 실태조사 기준점 및 정책 가이드라인 (25단계)';

  const subtitleEl = document.querySelector('#section-master-blueprint .blueprint-header-subtitle');
  if (subtitleEl) subtitleEl.textContent = 'P1~P20 단계는 전년도(2024년) 실태조사 데이터와 100% 동일하게 자동 미러링되며, B5-4 총회, C3 전기차/주차장, D1-2 배송, 2026 신규 정책 문항(F5~G4) 가이드라인을 직접 설정합니다.';

  if (badgeMasterStatus) {
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> 상인회 25단계 블루프린트 활성 (전년도 미러링 + 정책 가이드)';
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
  }

  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 상인회 정책 가이드 저장';
    btnSaveBaseline.title = '상인회 25단계 정책 가이드라인 설정 저장';
  }

  if (!blueprintStageGrid) return assocPolicyState;

  blueprintStageGrid.innerHTML = `
    <!-- 카드 0: 기입력 항목 보존 및 슬롯 건너뛰기 규칙 카드 -->
    <section class="blueprint-card assoc-rule-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill"><i class="fa-solid fa-forward-step"></i> 실행 규칙</span>
          <h3 class="blueprint-stage-title">기입력 항목 보존 및 슬롯 건너뛰기 규칙</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status ready"><i class="fa-solid fa-shield-halved"></i> 기입력 안전 보존</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        설문 페이지(Kstat)에 사용자가 이미 입력해 둔 문항 또는 완료된 슬롯을 건너뛰고, 미입력된 빈 항목만 자동으로 채워 넣는 안전 실행 규칙입니다.
      </div>
      <div class="p-14" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-assoc-preserve-inputs" class="assoc-rule-cb" ${assocPolicyState.preserveExistingInputs !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">기입력된 설문 항목 보존 [권장]</strong>
              <div class="assoc-rule-desc">
                설문 문항 중 이미 라디오/체크박스가 선택되어 있거나 텍스트·숫자가 입력된 항목은 덮어쓰지 않고 기존 입력값을 100% 보존합니다.
              </div>
            </div>
          </label>
        </div>

        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-assoc-skip-completed" class="assoc-rule-cb" ${assocPolicyState.skipCompletedSlots !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title">Kstat 완료 슬롯 건너뛰기 [권장]</strong>
              <div class="assoc-rule-desc">
                케이스탯 조사원 목록에서 이미 설문 '완료' 상태로 등록된 슬롯은 배치 실행 대상에서 제외하고 자동으로 건너뜁니다.
              </div>
            </div>
          </label>
        </div>

        <div class="assoc-rule-box mb-0 flex-column justify-center">
          <label class="assoc-rule-label-strong mb-6">
            특정 슬롯 번호 건너뛰기 (선택 사항)
          </label>
          <input type="text" id="input-assoc-skip-indices" class="assoc-rule-input" 
                 placeholder="건너뛸 슬롯 번호 입력 (예: 1, 2, 5)" 
                 value="${escapeHtml(assocPolicyState.skipSlotIndices || '')}" />
          <div class="assoc-rule-hint mt-4">
            * 배치 자동화 가동 시 여기에 입력된 슬롯 번호는 실행을 건너뜁니다.
          </div>
        </div>
      </div>
    </section>

    <!-- 신규 카드 A8: A8 전통시장·상점가 운영 시간대 가이드 -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">A8 (P4)</span>
          <h3 class="blueprint-stage-title">전통시장·상점가 운영 시간대 (개점 / 폐점)</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">
        전통시장·상점가 기준의 개점 시간 및 폐점 시간(24시간제 기준)을 설정합니다. (주간 표준 09:00~21:00 권장, 2024년 동일 계승, 야시장/새벽형 프리셋 또는 직접 시간대 설정)
      </div>
      <div class="p-14">
        <div class="form-group mb-12">
          <label class="figma-label font-bold text-primary-color">운영 시간 정책 모드</label>
          <select id="select-assoc-A8-mode" class="figma-select w-full">
            <option value="standard" ${(!assocPolicyState.A8_operatingHoursMode || assocPolicyState.A8_operatingHoursMode === 'standard') ? 'selected' : ''}>[권장] 주간 표준 운영 (09:00 ~ 21:00 동일)</option>
            <option value="mirror" ${assocPolicyState.A8_operatingHoursMode === 'mirror' ? 'selected' : ''}>2024년 시간대 1:1 동일 계승 (공란 시 09:00~21:00 적용)</option>
            <option value="traditional" ${assocPolicyState.A8_operatingHoursMode === 'traditional' ? 'selected' : ''}>새벽 / 생계형 시장 (06:00 ~ 20:00)</option>
            <option value="night" ${assocPolicyState.A8_operatingHoursMode === 'night' ? 'selected' : ''}>야시장 / 먹거리 골목 (11:00 ~ 23:00)</option>
            <option value="no_time" ${assocPolicyState.A8_operatingHoursMode === 'no_time' ? 'selected' : ''}>개점/폐점 시간 없음 (24시간 자유 영업 / A8_3 체크)</option>
            <option value="custom" ${assocPolicyState.A8_operatingHoursMode === 'custom' ? 'selected' : ''}>직접 개점·폐점 시간 지정 (아래 시간 선택)</option>
          </select>
        </div>

        <div id="wrap-assoc-A8-time-detail" class="grid-3col gap-10" style="align-items: flex-end;">
          <div class="form-group mb-0">
            <label class="figma-label">개점 시간 (A8_1)</label>
            <div style="display: flex; gap: 6px; align-items: center;">
              <select id="select-assoc-A8-open-hour" class="figma-select" style="flex: 1;">
                ${Array.from({ length: 24 }, (_, i) => {
                  const val = String(i).padStart(2, '0');
                  const sel = (assocPolicyState.A8_openHour === val || (!assocPolicyState.A8_openHour && val === '09')) ? 'selected' : '';
                  return `<option value="${val}" ${sel}>${val}시</option>`;
                }).join('')}
              </select>
              <select id="select-assoc-A8-open-minute" class="figma-select" style="flex: 1;">
                <option value="0" ${assocPolicyState.A8_openMinute === '0' || !assocPolicyState.A8_openMinute ? 'selected' : ''}>00분</option>
                <option value="10" ${assocPolicyState.A8_openMinute === '10' ? 'selected' : ''}>10분</option>
                <option value="20" ${assocPolicyState.A8_openMinute === '20' ? 'selected' : ''}>20분</option>
                <option value="30" ${assocPolicyState.A8_openMinute === '30' ? 'selected' : ''}>30분</option>
                <option value="40" ${assocPolicyState.A8_openMinute === '40' ? 'selected' : ''}>40분</option>
                <option value="50" ${assocPolicyState.A8_openMinute === '50' ? 'selected' : ''}>50분</option>
              </select>
            </div>
          </div>

          <div class="form-group mb-0">
            <label class="figma-label">폐점 시간 (A8_2)</label>
            <div style="display: flex; gap: 6px; align-items: center;">
              <select id="select-assoc-A8-close-hour" class="figma-select" style="flex: 1;">
                ${Array.from({ length: 24 }, (_, i) => {
                  const val = String(i).padStart(2, '0');
                  const sel = (assocPolicyState.A8_closeHour === val || (!assocPolicyState.A8_closeHour && val === '21')) ? 'selected' : '';
                  return `<option value="${val}" ${sel}>${val}시</option>`;
                }).join('')}
              </select>
              <select id="select-assoc-A8-close-minute" class="figma-select" style="flex: 1;">
                <option value="0" ${assocPolicyState.A8_closeMinute === '0' || !assocPolicyState.A8_closeMinute ? 'selected' : ''}>00분</option>
                <option value="10" ${assocPolicyState.A8_closeMinute === '10' ? 'selected' : ''}>10분</option>
                <option value="20" ${assocPolicyState.A8_closeMinute === '20' ? 'selected' : ''}>20분</option>
                <option value="30" ${assocPolicyState.A8_closeMinute === '30' ? 'selected' : ''}>30분</option>
                <option value="40" ${assocPolicyState.A8_closeMinute === '40' ? 'selected' : ''}>40분</option>
                <option value="50" ${assocPolicyState.A8_closeMinute === '50' ? 'selected' : ''}>50분</option>
              </select>
            </div>
          </div>

          <div class="form-group mb-0" style="padding-bottom: 6px;">
            <label class="custom-cb-label" style="margin-bottom: 0;">
              <input type="checkbox" id="cb-assoc-A8-no-time" ${assocPolicyState.A8_noTime ? 'checked' : ''} />
              <span class="font-bold text-white">개점/폐점 시간 없음 (A8_3)</span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- 카드 1: B1~B4 조직운영 및 대표자 정보 자동 바인딩 카드 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">B1 ~ B4 (P3~P5)</span>
          <h3 class="blueprint-stage-title">상인회 조직현황 및 대표자 정보 자동 바인딩</h3>
        </div>
        <div class="blueprint-card-badge-group">
          <span class="badge-status success"><i class="fa-solid fa-lock"></i> 100% 무결점 바인딩</span>
        </div>
      </div>
      <div class="blueprint-stage-desc">
        B1 운영중 체크 연도(2024년 동일), B2-1 상인회명(2024년 동일), B3 대표자 성명·연락처(쿼터 DB 연동), B4-1 등록연도(2024년 공란 시 없음 체크, 있으면 동일 입력)를 무결점으로 자동 주입합니다.
      </div>
      <div class="blueprint-field-list">
        <div class="field-item flex-between py-8">
          <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B1 운영 여부 및 체크 연도</span>
          <span class="badge-status ready">2024년 운영 연도와 100% 동일 주입</span>
        </div>
        <div class="field-item flex-between py-8">
          <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B2-1 시장·상점가 상인회명</span>
          <span class="badge-status ready">2024년 상인회명과 100% 동일 계승</span>
        </div>
        <div class="field-item flex-between py-8">
          <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B3 상인회장 성명 및 대표 연락처</span>
          <span class="badge-status ready">쿼터 등록 대표자 정보 1:1 바인딩</span>
        </div>
        <div class="field-item flex-between py-8">
          <span class="font-bold text-white"><i class="fa-solid fa-check text-success"></i> B4-1 법인 등기/등록연도</span>
          <span class="badge-status ready">공란 시 '없음' 체크 / 기입력 시 동일 계승</span>
        </div>
      </div>
    </section>

    <!-- 카드 2: B5-4 상인회 총회 실시 횟수 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">B5-4 (P6)</span>
          <h3 class="blueprint-stage-title">2025년 기준 상인회 총회 실시 횟수</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">2025년 기준 상인회 총회(정기 및 임시 포함) 실시 횟수를 설정합니다. (0~10회 직접 선택 또는 슬롯별 랜덤 분산)</div>
      <div class="p-14">
        <select id="select-assoc-B5-assembly" class="figma-select w-full">
          <option value="1" ${assocPolicyState.B5_generalAssemblyCount === '1' ? 'selected' : ''}>1회 (연간 정기총회 1회 기본값)</option>
          <option value="2" ${assocPolicyState.B5_generalAssemblyCount === '2' ? 'selected' : ''}>2회 (정기총회 1회 + 임시총회 1회 권장)</option>
          <option value="0" ${assocPolicyState.B5_generalAssemblyCount === '0' ? 'selected' : ''}>0회 (총회 미실시)</option>
          <option value="3" ${assocPolicyState.B5_generalAssemblyCount === '3' ? 'selected' : ''}>3회</option>
          <option value="4" ${assocPolicyState.B5_generalAssemblyCount === '4' ? 'selected' : ''}>4회</option>
          <option value="5" ${assocPolicyState.B5_generalAssemblyCount === '5' ? 'selected' : ''}>5회</option>
          <option value="6" ${assocPolicyState.B5_generalAssemblyCount === '6' ? 'selected' : ''}>6회</option>
          <option value="7" ${assocPolicyState.B5_generalAssemblyCount === '7' ? 'selected' : ''}>7회</option>
          <option value="8" ${assocPolicyState.B5_generalAssemblyCount === '8' ? 'selected' : ''}>8회</option>
          <option value="9" ${assocPolicyState.B5_generalAssemblyCount === '9' ? 'selected' : ''}>9회</option>
          <option value="10" ${assocPolicyState.B5_generalAssemblyCount === '10' ? 'selected' : ''}>10회</option>
          <option value="random_1_2" ${assocPolicyState.B5_generalAssemblyCount === 'random_1_2' ? 'selected' : ''}>🎲 [1~2회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          <option value="random_1_3" ${assocPolicyState.B5_generalAssemblyCount === 'random_1_3' ? 'selected' : ''}>🎲 [1~3회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          <option value="random_0_2" ${assocPolicyState.B5_generalAssemblyCount === 'random_0_2' ? 'selected' : ''}>🎲 [0~2회 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
        </select>
      </div>
    </section>

    <!-- 카드 3: C1, C2, C4, E1 시설 보유개수 및 시설필요도 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">C1·C2·C4·E1 (P7·8·10·17)</span>
          <h3 class="blueprint-stage-title">고객·안전·마케팅·소방시설 보유개수 및 시설필요도</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">
        C1(편의시설 9종), C2(안전·위생시설 18종), C4(마케팅시설 5종), E1(소방시설 7종)은 2024년 보유개수를 동일 계승하며, <strong>'시설필요도'는 '매우 불필요'·'불필요'를 체크하지 않고 '보통', '필요', '매우 필요' 셋 중에서 하나로 응답</strong>합니다.
      </div>
      <div class="p-14">
        <div class="form-group mb-12">
          <label class="figma-label">보유개수 계승 규칙</label>
          <div class="assoc-rule-box p-8">
            <span class="font-caption text-white font-bold"><i class="fa-solid fa-circle-check text-success"></i> 2024년 보유개수 1:1 동일 입력 (보유개수 없으면 모두 '없음' 자동 선택)</span>
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="figma-label">시설 필요도 체크 방식 ('매우 불필요' · '불필요' 체크 금지)</label>
          <select id="select-assoc-C1-C2-need" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.C1_C2_needRating || assocPolicyState.C1_C2_needRating === 'random' || assocPolicyState.C1_C2_needRating === 'none') ? 'selected' : ''}>🎲 ['보통' · '필요' · '매우 필요' 중 랜덤 선택 (권장)] (매우 불필요·불필요 제외)</option>
            <option value="need_3" ${assocPolicyState.C1_C2_needRating === 'need_3' ? 'selected' : ''}>전 문항 '보통(3)' 선택</option>
            <option value="need_4" ${assocPolicyState.C1_C2_needRating === 'need_4' ? 'selected' : ''}>전 문항 '필요(4)' 선택</option>
            <option value="need" ${(assocPolicyState.C1_C2_needRating === 'need' || assocPolicyState.C1_C2_needRating === 'need_5') ? 'selected' : ''}>전 문항 '매우 필요(5)' 선택</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 4: C3-1-3 전기차 전용 주차 대수 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">C3-1-3 (P9)</span>
          <h3 class="blueprint-stage-title">전기차 전용 주차 대수</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">시장·상점가 주차장 내 전기차 전용 주차 구역 대수를 설정합니다. (0~10대 직접 지정 또는 슬롯별 랜덤 분산)</div>
      <div class="p-14">
        <select id="select-assoc-C3-ev-parking" class="figma-select w-full">
          <option value="3" ${assocPolicyState.C3_1_evParkingCount === '3' ? 'selected' : ''}>3대 (표준 기본값)</option>
          <option value="0" ${assocPolicyState.C3_1_evParkingCount === '0' ? 'selected' : ''}>0대 (미보유)</option>
          <option value="1" ${assocPolicyState.C3_1_evParkingCount === '1' ? 'selected' : ''}>1대</option>
          <option value="2" ${assocPolicyState.C3_1_evParkingCount === '2' ? 'selected' : ''}>2대</option>
          <option value="4" ${assocPolicyState.C3_1_evParkingCount === '4' ? 'selected' : ''}>4대</option>
          <option value="5" ${assocPolicyState.C3_1_evParkingCount === '5' ? 'selected' : ''}>5대</option>
          <option value="6" ${assocPolicyState.C3_1_evParkingCount === '6' ? 'selected' : ''}>6대</option>
          <option value="7" ${assocPolicyState.C3_1_evParkingCount === '7' ? 'selected' : ''}>7대</option>
          <option value="8" ${assocPolicyState.C3_1_evParkingCount === '8' ? 'selected' : ''}>8대</option>
          <option value="9" ${assocPolicyState.C3_1_evParkingCount === '9' ? 'selected' : ''}>9대</option>
          <option value="10" ${assocPolicyState.C3_1_evParkingCount === '10' ? 'selected' : ''}>10대</option>
          <option value="random_0_3" ${assocPolicyState.C3_1_evParkingCount === 'random_0_3' ? 'selected' : ''}>🎲 [0~3대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          <option value="random_1_5" ${assocPolicyState.C3_1_evParkingCount === 'random_1_5' ? 'selected' : ''}>🎲 [1~5대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
          <option value="random_0_10" ${assocPolicyState.C3_1_evParkingCount === 'random_0_10' ? 'selected' : ''}>🎲 [0~10대 랜덤 분산] (슬롯별 무작위 자동 분산)</option>
        </select>
      </div>
    </section>

    <!-- 카드 5: C3-2 주차장 형태, 소유주체, 관리주체 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">C3-2 (P9)</span>
          <h3 class="blueprint-stage-title">주차장 형태 · 소유주체 · 관리주체</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">주차장 형태(부설/노상/노외), 소유주체(상인회/지자체 등), 관리주체(직접/지자체/공단 등)를 설정합니다.</div>
      <div class="p-14 grid-3col gap-10">
        <div class="form-group mb-8">
          <label class="figma-label">C3-2-1 주차장 형태</label>
          <select id="select-assoc-C3-type" class="figma-select w-full">
            <option value="2" ${assocPolicyState.C3_2_1_parkingType === '2' ? 'selected' : ''}>노상주차장 (기본값 권장)</option>
            <option value="1" ${assocPolicyState.C3_2_1_parkingType === '1' ? 'selected' : ''}>부설주차장</option>
            <option value="3" ${assocPolicyState.C3_2_1_parkingType === '3' ? 'selected' : ''}>노외주차장</option>
            <option value="1_2" ${assocPolicyState.C3_2_1_parkingType === '1_2' ? 'selected' : ''}>부설 + 노상 (중복)</option>
            <option value="2_3" ${assocPolicyState.C3_2_1_parkingType === '2_3' ? 'selected' : ''}>노상 + 노외 (중복)</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">C3-2-2 소유주체</label>
          <select id="select-assoc-C3-owner" class="figma-select w-full">
            <option value="2" ${assocPolicyState.C3_2_2_owner === '2' ? 'selected' : ''}>지자체 (기본값 권장)</option>
            <option value="1" ${assocPolicyState.C3_2_2_owner === '1' ? 'selected' : ''}>상인회</option>
            <option value="3" ${assocPolicyState.C3_2_2_owner === '3' ? 'selected' : ''}>개인 운영</option>
            <option value="random" ${assocPolicyState.C3_2_2_owner === 'random' ? 'selected' : ''}>🎲 [상인회 / 지자체 / 개인 랜덤]</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">C3-2-3 관리주체</label>
          <select id="select-assoc-C3-manager" class="figma-select w-full">
            <option value="2" ${assocPolicyState.C3_2_3_manager === '2' ? 'selected' : ''}>지자체 (기본값 권장)</option>
            <option value="1" ${assocPolicyState.C3_2_3_manager === '1' ? 'selected' : ''}>직접관리 (상인회)</option>
            <option value="3" ${assocPolicyState.C3_2_3_manager === '3' ? 'selected' : ''}>시설관리공단 등 기관</option>
            <option value="4" ${assocPolicyState.C3_2_3_manager === '4' ? 'selected' : ''}>개인</option>
            <option value="random" ${assocPolicyState.C3_2_3_manager === 'random' ? 'selected' : ''}>🎲 [직접 / 지자체 / 공단 등 랜덤]</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 6: D1-1 축제 및 이벤트 명칭 (네이버 검색 연동) -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">D1-1 (P11)</span>
          <h3 class="blueprint-stage-title">시장 축제 및 이벤트 명칭 설정</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">시장별 축제·이벤트 유무 및 명칭을 설정합니다. (네이버 검색엔진 자동 감지 연동)</div>
      <div class="p-14">
        <div class="form-group mb-8">
          <label class="figma-label">축제 확인 및 명칭 주입 방식</label>
          <select id="select-assoc-D1-1-mode" class="figma-select w-full">
            <option value="naver_auto" ${(!assocPolicyState.D1_1_festivalMode || assocPolicyState.D1_1_festivalMode === 'naver_auto') ? 'selected' : ''}>🔍 [네이버 검색엔진 실시간 연동 (축제 확인 시 명칭 자동입력, 미확인 시 미실시) [권장]]</option>
            <option value="none" ${assocPolicyState.D1_1_festivalMode === 'none' ? 'selected' : ''}>2: 일괄 미실시 선택</option>
            <option value="custom" ${assocPolicyState.D1_1_festivalMode === 'custom' ? 'selected' : ''}>1: 직접 축제명 고정 입력</option>
          </select>
        </div>
        <div class="form-group mb-0" id="wrap-assoc-D1-1-custom" style="display: ${assocPolicyState.D1_1_festivalMode === 'custom' ? 'block' : 'none'};">
          <label class="figma-label">고정 축제명 직접 입력</label>
          <input type="text" id="input-assoc-D1-1-custom" class="assoc-rule-input" placeholder="예: 전통시장 가을 대축제, 야시장 먹거리 축제" value="${escapeHtml(assocPolicyState.D1_1_festivalCustomName || '')}" />
        </div>
      </div>
    </section>

    <!-- 카드 7: D1-2 온라인 배송 서비스 운영 여부 및 D1-2-5 취급 품목 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">D1-2 (P12)</span>
          <h3 class="blueprint-stage-title">온라인 배송 서비스 운영 &amp; 주력 품목</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">시장·상점가 단위에서 온라인 배송 운영 여부 및 도입 시 주력 취급 품목을 설정합니다.</div>
      <div class="p-14 grid-2col gap-10">
        <div class="form-group mb-8">
          <label class="figma-label">D1-2 온라인 배송 운영 여부</label>
          <select id="select-assoc-D1-delivery" class="figma-select w-full">
            <option value="2" ${assocPolicyState.D1_2_onlineDeliveryService === '2' ? 'selected' : ''}>2: 온라인 배송 서비스 없음 (기본값 권장)</option>
            <option value="1" ${assocPolicyState.D1_2_onlineDeliveryService === '1' ? 'selected' : ''}>1: 온라인 배송 서비스 있음</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">D1-2-5 주력 취급 품목 (배송 운영 시)</label>
          <select id="select-assoc-D1-2-5-item" class="figma-select w-full">
            <option value="random" ${(!assocPolicyState.D1_2_5_deliveryItem || assocPolicyState.D1_2_5_deliveryItem === 'random') ? 'selected' : ''}>🎲 [1~4번 항목 랜덤 답변 (기타 제외 기본값)]</option>
            <option value="1" ${assocPolicyState.D1_2_5_deliveryItem === '1' ? 'selected' : ''}>1. 농산물 (채소, 과일 등)</option>
            <option value="2" ${assocPolicyState.D1_2_5_deliveryItem === '2' ? 'selected' : ''}>2. 축산물 (정육, 육류 등)</option>
            <option value="3" ${assocPolicyState.D1_2_5_deliveryItem === '3' ? 'selected' : ''}>3. 수산물 (생선, 건어물 등)</option>
            <option value="4" ${assocPolicyState.D1_2_5_deliveryItem === '4' ? 'selected' : ''}>4. 가공식품 / 반찬류</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 8: E1 AI 지능형 출동 시스템 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">E1 (P16)</span>
          <h3 class="blueprint-stage-title">스마트 기술 및 AI 지능형 출동 시스템</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">화재·보안 등 스마트 안전 기술 및 AI 지능형 출동 시스템 도입 여부를 설정합니다.</div>
      <div class="p-14">
        <select id="select-assoc-E1" class="figma-select w-full">
          <option value="none" ${(!assocPolicyState.E1_aiSecuritySystem || assocPolicyState.E1_aiSecuritySystem === 'none') ? 'selected' : ''}>모두 '없음' (AI 지능형 출동 시스템 미도입 확정) [권장]</option>
          <option value="random" ${assocPolicyState.E1_aiSecuritySystem === 'random' ? 'selected' : ''}>🎲 일부 시스템 도입 슬롯별 랜덤 분산</option>
          <option value="all" ${assocPolicyState.E1_aiSecuritySystem === 'all' ? 'selected' : ''}>모두 '있음'</option>
        </select>
      </div>
    </section>

    <!-- 카드 9: F1 빈 점포 현황 숫자 입력 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">F1 (P20)</span>
          <h3 class="blueprint-stage-title">빈 점포(공실) 현황 숫자 입력 기준</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">시장 내 빈 점포(공실) 발생 수치 입력 기준을 설정합니다. (공란 방지 및 계산함수 자동 연동)</div>
      <div class="p-14">
        <select id="select-assoc-F1" class="figma-select w-full">
          <option value="zero" ${(!assocPolicyState.F1_emptyStoreCount || assocPolicyState.F1_emptyStoreCount === 'zero') ? 'selected' : ''}>모두 '0'건 (빈 점포 없음 완전 정상 운영 확정) [권장]</option>
          <option value="mirror" ${assocPolicyState.F1_emptyStoreCount === 'mirror' ? 'selected' : ''}>전년도(2024년) 실태조사 공실 수치 그대로 계승</option>
        </select>
      </div>
    </section>

    <!-- 카드 10: F5 빈점포 원인 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">F5 (P21)</span>
          <h3 class="blueprint-stage-title">빈 점포 발생 핵심 원인</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">시장 내 빈 점포(공실)가 발생하는 가장 주된 요인을 설정합니다 ('기타' 제외 랜덤).</div>
      <div class="p-14">
        <select id="select-assoc-F5" class="figma-select w-full">
          <option value="random" ${(!assocPolicyState.F5_emptyStoreReason || assocPolicyState.F5_emptyStoreReason === 'random') ? 'selected' : ''}>🎲 [1~4 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
          <option value="1" ${assocPolicyState.F5_emptyStoreReason === '1' ? 'selected' : ''}>1. 온라인 소비 확산 및 비대면 거래 증가</option>
          <option value="2" ${assocPolicyState.F5_emptyStoreReason === '2' ? 'selected' : ''}>2. 인근 대형마트, 복합쇼핑몰, 인근 상권과의 경쟁 밀림</option>
          <option value="3" ${assocPolicyState.F5_emptyStoreReason === '3' ? 'selected' : ''}>3. 과도하게 높은 임대료 및 권리금 조건</option>
          <option value="4" ${assocPolicyState.F5_emptyStoreReason === '4' ? 'selected' : ''}>4. 상인의 고령화 및 가업 승계(후계자) 부족</option>
        </select>
      </div>
    </section>

    <!-- 카드 11: F6 빈점포 지원 정책 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">F6 (P21)</span>
          <h3 class="blueprint-stage-title">시급한 빈 점포 정부 지원 정책</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">빈 점포 해결을 위해 정부 및 지자체에서 가장 시급히 지원해야 할 정책을 설정합니다 ('기타' 제외 랜덤).</div>
      <div class="p-14">
        <select id="select-assoc-F6" class="figma-select w-full">
          <option value="random" ${(!assocPolicyState.F6_emptyStorePolicy || assocPolicyState.F6_emptyStorePolicy === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
          <option value="1" ${assocPolicyState.F6_emptyStorePolicy === '1' ? 'selected' : ''}>1. 빈 점포를 공공 임대·매입하여 상인회에 재임대하는 제도</option>
          <option value="2" ${assocPolicyState.F6_emptyStorePolicy === '2' ? 'selected' : ''}>2. 빈 점포를 활용하는 상인에 대한 금융 지원(융자, 보조금) 확대</option>
          <option value="3" ${assocPolicyState.F6_emptyStorePolicy === '3' ? 'selected' : ''}>3. 빈 점포 공간 전환 컨설팅 및 시행 지원</option>
          <option value="4" ${assocPolicyState.F6_emptyStorePolicy === '4' ? 'selected' : ''}>4. 공실 상가 소유주에게 임대료 인하를 유도하는 세제 혜택 등 인센티브 부여</option>
          <option value="5" ${assocPolicyState.F6_emptyStorePolicy === '5' ? 'selected' : ''}>5. 빈 점포 파악 및 관리를 위한 통합 플랫폼 구축</option>
        </select>
      </div>
    </section>

    <!-- 카드 12: G1 바가지요금 원인 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">G1 (P22)</span>
          <h3 class="blueprint-stage-title">바가지요금 문제 발생 주요 원인</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">전통시장 내 바가지요금 논란이 발생하는 근본적인 원인을 설정합니다 ('기타' 제외 랜덤).</div>
      <div class="p-14">
        <select id="select-assoc-G1" class="figma-select w-full">
          <option value="random" ${(!assocPolicyState.G1_overchargeReason || assocPolicyState.G1_overchargeReason === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
          <option value="1" ${assocPolicyState.G1_overchargeReason === '1' ? 'selected' : ''}>1. 외부 관광객 대상 일시적 가격 인상 관행</option>
          <option value="2" ${assocPolicyState.G1_overchargeReason === '2' ? 'selected' : ''}>2. 상인 간 가격 자율경쟁 및 통제 미흡</option>
          <option value="3" ${assocPolicyState.G1_overchargeReason === '3' ? 'selected' : ''}>3. 원재료 가격 상승에 따른 임의 가격 인상</option>
          <option value="4" ${assocPolicyState.G1_overchargeReason === '4' ? 'selected' : ''}>4. 일부 상인의 과도한 이윤추구 형태</option>
          <option value="5" ${assocPolicyState.G1_overchargeReason === '5' ? 'selected' : ''}>5. 시장 차원의 관리·감독 부족</option>
        </select>
      </div>
    </section>

    <!-- 카드 13: G2 바가지요금 대응방안 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">G2 (P22)</span>
          <h3 class="blueprint-stage-title">바가지요금 개선 대응 방안</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">바가지요금 근절과 시장 신뢰 회복을 위한 최선의 방안을 설정합니다 ('기타' 제외 랜덤).</div>
      <div class="p-14">
        <select id="select-assoc-G2" class="figma-select w-full">
          <option value="random" ${(!assocPolicyState.G2_overchargeSolution || assocPolicyState.G2_overchargeSolution === 'random') ? 'selected' : ''}>🎲 [1~5 항목 랜덤 답변 (기타 제외 기본값)] (슬롯별 무작위 자동 분산)</option>
          <option value="1" ${assocPolicyState.G2_overchargeSolution === '1' ? 'selected' : ''}>1. 시장 차원의 자율관리 (상인회 중심 가격 가이드라인 운영)</option>
          <option value="2" ${assocPolicyState.G2_overchargeSolution === '2' ? 'selected' : ''}>2. 지자체·정부의 점검 및 단속 강화</option>
          <option value="3" ${assocPolicyState.G2_overchargeSolution === '3' ? 'selected' : ''}>3. 바가지요금 신고·공개 시스템 활성화</option>
          <option value="4" ${assocPolicyState.G2_overchargeSolution === '4' ? 'selected' : ''}>4. 친절·가격교육 등 상인 대상 인식개선 교육</option>
          <option value="5" ${assocPolicyState.G2_overchargeSolution === '5' ? 'selected' : ''}>5. 우수상점 인증제 등 인센티브 제공</option>
        </select>
      </div>
    </section>

    <!-- 카드 14: G3 문화/체험/명물점포 육성 정책 -->
    <section class="blueprint-card">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">G3 (P23)</span>
          <h3 class="blueprint-stage-title">문화·체험 프로그램 및 명물점포 보유 현황</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">상설 프로그램, 명물점포, 야간조명, 관광연계, 커뮤니티 공간 보유 여부를 설정합니다.</div>
      <div class="p-14 grid-2col gap-10">
        <div class="form-group mb-8">
          <label class="figma-label">상설 문화/체험 프로그램</label>
          <select id="select-assoc-G3-prog" class="figma-select">
            <option value="1" ${assocPolicyState.G3_program === '1' ? 'selected' : ''}>1. 있다</option>
            <option value="2" ${assocPolicyState.G3_program === '2' ? 'selected' : ''}>2. 없다</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">시장 내 명물/대표점포</label>
          <select id="select-assoc-G3-famous" class="figma-select">
            <option value="1" ${assocPolicyState.G3_famousStore === '1' ? 'selected' : ''}>1. 있다</option>
            <option value="2" ${assocPolicyState.G3_famousStore === '2' ? 'selected' : ''}>2. 없다</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">야간조명·야시장 인프라</label>
          <select id="select-assoc-G3-night" class="figma-select">
            <option value="1" ${assocPolicyState.G3_nightLight === '1' ? 'selected' : ''}>1. 있다</option>
            <option value="2" ${assocPolicyState.G3_nightLight === '2' ? 'selected' : ''}>2. 없다</option>
          </select>
        </div>
        <div class="form-group mb-8">
          <label class="figma-label">인근 관광자원 연계 상품</label>
          <select id="select-assoc-G3-tour" class="figma-select">
            <option value="1" ${assocPolicyState.G3_tourLink === '1' ? 'selected' : ''}>1. 있다</option>
            <option value="2" ${assocPolicyState.G3_tourLink === '2' ? 'selected' : ''}>2. 없다</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 카드 15: G4 기후재해 대비 현황 -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill">G4 (P23)</span>
          <h3 class="blueprint-stage-title">기후재해(폭염·한파·수해) 대비 시설 및 필요도 규칙</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 정책 가이드</span>
      </div>
      <div class="blueprint-stage-desc">
        폭염/한파/수해 대비 냉난방 및 방재 시설 보유 여부와 필요도 분산 규칙을 설정합니다. (일부 미체크 자연 분산)
      </div>
      <div class="p-14">
        <div class="grid-2col gap-10 mb-14">
          <div class="form-group mb-8">
            <label class="figma-label font-bold text-primary-color">G4 시설 보유 여부 분산 규칙</label>
            <select id="select-assoc-G4-ownership" class="figma-select w-full">
              <option value="random_3_4" ${(!assocPolicyState.G4_facilityOwnershipRule || assocPolicyState.G4_facilityOwnershipRule === 'random_3_4') ? 'selected' : ''}>🎲 [필수 시설 3~4개 랜덤 보유 (자연 분산 기본값)]</option>
              <option value="fixed" ${assocPolicyState.G4_facilityOwnershipRule === 'fixed' ? 'selected' : ''}>아래 체크박스 선택 시설만 고정 보유</option>
              <option value="all" ${assocPolicyState.G4_facilityOwnershipRule === 'all' ? 'selected' : ''}>전수 보유</option>
            </select>
          </div>
          <div class="form-group mb-8">
            <label class="figma-label font-bold text-primary-color">G4 시설 필요도 분산 규칙 (일부 미체크)</label>
            <select id="select-assoc-G4-requirement" class="figma-select w-full">
              <option value="random_1_3" ${(!assocPolicyState.G4_facilityRequirementRule || assocPolicyState.G4_facilityRequirementRule === 'random_1_3') ? 'selected' : ''}>🎲 [미보유 시설 중심 1~3개 랜덤 필요 체크 (일부 미체크 분산 기본값)]</option>
              <option value="all" ${assocPolicyState.G4_facilityRequirementRule === 'all' ? 'selected' : ''}>전수 필요 체크</option>
              <option value="none" ${assocPolicyState.G4_facilityRequirementRule === 'none' ? 'selected' : ''}>필요 없음 (모두 미체크)</option>
            </select>
          </div>
        </div>

        <label class="figma-label font-caption text-dim mb-6">표준 기준 시설 (고정 보유 선택 시 반영):</label>
        <div class="checkbox-grid">
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-cooling-aircon" ${assocPolicyState.G4_cooling_aircon ? 'checked' : ''} />
            <span>에어컨 / 냉방기기</span>
          </label>
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-cooling-fan" ${assocPolicyState.G4_cooling_fan ? 'checked' : ''} />
            <span>선풍기 / 송풍기</span>
          </label>
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-cooling-arcade" ${assocPolicyState.G4_cooling_arcade ? 'checked' : ''} />
            <span>아케이드 쿨링포그</span>
          </label>
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-heating-warmair" ${assocPolicyState.G4_heating_warmAir ? 'checked' : ''} />
            <span>온풍기 / 난방기기</span>
          </label>
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-flood-pump" ${assocPolicyState.G4_flood_pump ? 'checked' : ''} />
            <span>배수펌프 설비</span>
          </label>
          <label class="custom-cb-label">
            <input type="checkbox" id="cb-assoc-flood-wall" ${assocPolicyState.G4_flood_wall ? 'checked' : ''} />
            <span>차수판 / 물막이</span>
          </label>
        </div>
      </div>
    </section>

    <!-- 카드 16: [조사원 평가] H1. 전통시장 환경 및 시설 수준 평가 -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-clipboard-check"></i> 조사원 평가 (H1)</span>
          <h3 class="blueprint-stage-title">조사원 평가: 전통시장 환경 및 시설 수준 평가 (1~5점 척도)</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 조사원 평가 가이드</span>
      </div>
      <div class="blueprint-stage-desc">
        설문 완료 후 조사원이 직접 평가하는 4개 시설·환경 항목입니다. 1(매우 열악) ~ 5(매우 우수) 점수를 설정하며, <strong>응답 편중(동일 점수 몰림) 방지 지터링</strong>을 통해 Kstat 유효성 경고를 자동 방어합니다.
      </div>
      <div class="p-14">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;" class="mb-14">
          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H1-1. 시장 전반의 청결 및 위생 상태</label>
            <select id="select-assoc-eval-H1-1" class="figma-select w-full">
              <option value="5" ${String(assocPolicyState.eval_H1_1_cleanliness) === '5' ? 'selected' : ''}>5점 - 매우 청결하고 쾌적함</option>
              <option value="4" ${(String(assocPolicyState.eval_H1_1_cleanliness) === '4' || assocPolicyState.eval_H1_1_cleanliness === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
              <option value="3" ${String(assocPolicyState.eval_H1_1_cleanliness) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
              <option value="2" ${String(assocPolicyState.eval_H1_1_cleanliness) === '2' ? 'selected' : ''}>2점 - 다소 미흡함</option>
              <option value="1" ${String(assocPolicyState.eval_H1_1_cleanliness) === '1' ? 'selected' : ''}>1점 - 매우 열악함</option>
            </select>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H1-2. 주 출입구 및 통행로 편의성</label>
            <select id="select-assoc-eval-H1-2" class="figma-select w-full">
              <option value="5" ${String(assocPolicyState.eval_H1_2_entrance) === '5' ? 'selected' : ''}>5점 - 매우 넓고 보행 편리</option>
              <option value="4" ${(String(assocPolicyState.eval_H1_2_entrance) === '4' || assocPolicyState.eval_H1_2_entrance === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
              <option value="3" ${String(assocPolicyState.eval_H1_2_entrance) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
              <option value="2" ${String(assocPolicyState.eval_H1_2_entrance) === '2' ? 'selected' : ''}>2점 - 다소 혼잡·미흡함</option>
              <option value="1" ${String(assocPolicyState.eval_H1_2_entrance) === '1' ? 'selected' : ''}>1점 - 통행 매우 불편</option>
            </select>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H1-3. 고객 주차 및 이동 편리성</label>
            <select id="select-assoc-eval-H1-3" class="figma-select w-full">
              <option value="5" ${String(assocPolicyState.eval_H1_3_parking) === '5' ? 'selected' : ''}>5점 - 주차장 매우 편리</option>
              <option value="4" ${String(assocPolicyState.eval_H1_3_parking) === '4' ? 'selected' : ''}>4점 - 양호한 편</option>
              <option value="3" ${(String(assocPolicyState.eval_H1_3_parking) === '3' || assocPolicyState.eval_H1_3_parking === undefined) ? 'selected' : ''}>3점 - 보통 수준 (기본 권장)</option>
              <option value="2" ${String(assocPolicyState.eval_H1_3_parking) === '2' ? 'selected' : ''}>2점 - 주차 다소 부족</option>
              <option value="1" ${String(assocPolicyState.eval_H1_3_parking) === '1' ? 'selected' : ''}>1점 - 주차 공간 전무</option>
            </select>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H1-4. 시장 바닥 상태의 균일성</label>
            <select id="select-assoc-eval-H1-4" class="figma-select w-full">
              <option value="5" ${String(assocPolicyState.eval_H1_4_floor) === '5' ? 'selected' : ''}>5점 - 바닥 매우 평탄·균일</option>
              <option value="4" ${(String(assocPolicyState.eval_H1_4_floor) === '4' || assocPolicyState.eval_H1_4_floor === undefined) ? 'selected' : ''}>4점 - 전반적으로 양호함 (기본 권장)</option>
              <option value="3" ${String(assocPolicyState.eval_H1_4_floor) === '3' ? 'selected' : ''}>3점 - 보통 수준</option>
              <option value="2" ${String(assocPolicyState.eval_H1_4_floor) === '2' ? 'selected' : ''}>2점 - 굴곡 및 파손 다소 있음</option>
              <option value="1" ${String(assocPolicyState.eval_H1_4_floor) === '1' ? 'selected' : ''}>1점 - 바닥 매우 불량</option>
            </select>
          </div>
        </div>

        <div class="assoc-rule-box mb-0">
          <label class="assoc-rule-item">
            <input type="checkbox" id="cb-assoc-eval-H1-jitter" class="assoc-rule-cb" ${assocPolicyState.eval_H1_jitter !== false ? 'checked' : ''} />
            <div>
              <strong class="assoc-rule-title text-success">4개 항목 응답 편중 방지 지터링(Jitter) 자동 적용 [권장]</strong>
              <div class="assoc-rule-desc">
                Kstat 유효성 검사 <code>RadioArrayCnt("H1_1,H1_2,H1_3,H1_4", 99)</code>는 4개 문항에 동일한 점수가 입력되면 "응답 편중" 경고 팝업을 띄웁니다. 이를 방지하기 위해 점포별 시드 기반으로 ±1점의 자연스러운 분산을 자동 부여합니다.
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>

    <!-- 카드 17: [조사원 평가] H2. 전통시장 차별화 및 브랜드화 현황 -->
    <section class="blueprint-card full-width-card" style="grid-column: 1 / -1; width: 100%;">
      <div class="blueprint-card-header">
        <div class="blueprint-card-title-group">
          <span class="blueprint-step-pill assoc-rule-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-tags"></i> 조사원 평가 (H2)</span>
          <h3 class="blueprint-stage-title">조사원 평가: 전통시장 차별화 및 브랜드화 현황</h3>
        </div>
        <span class="badge-tag-tunable"><i class="fa-solid fa-sliders"></i> 조사원 평가 가이드</span>
      </div>
      <div class="blueprint-stage-desc">
        특화거리, 특산품, 브랜드마크(BI), 홍보물 4개 항목의 보유 여부입니다. <strong>'있다(1)' 선택 시 보충설명이 필수로 입력</strong>되어야 하며, '없다(2)' 선택 시 보충설명 입력란은 자동으로 비활성화됩니다.
      </div>
      <div class="p-14">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H2-1. 특화거리(골목) 조성 여부</label>
            <select id="select-assoc-eval-H2-1" class="figma-select w-full mb-8">
              <option value="1" ${(String(assocPolicyState.eval_H2_1_specialStreet) === '1' || assocPolicyState.eval_H2_1_specialStreet === undefined) ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
              <option value="2" ${String(assocPolicyState.eval_H2_1_specialStreet) === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
            <div id="wrap-assoc-eval-H2-1-text">
              <label class="font-caption text-dim mb-4 block">보충설명 (H2_1_NOTE):</label>
              <input type="text" id="input-assoc-eval-H2-1-text" class="figma-input w-full" 
                     placeholder="예: 먹거리 및 패션 특화골목" 
                     value="${escapeHtml(assocPolicyState.eval_H2_1_customText ?? '먹거리 및 패션 특화골목')}" />
            </div>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H2-2. 대표 특산품 또는 자체 PB상품</label>
            <select id="select-assoc-eval-H2-2" class="figma-select w-full mb-8">
              <option value="1" ${(String(assocPolicyState.eval_H2_2_specialProduct) === '1' || assocPolicyState.eval_H2_2_specialProduct === undefined) ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
              <option value="2" ${String(assocPolicyState.eval_H2_2_specialProduct) === '2' ? 'selected' : ''}>2. 없다</option>
            </select>
            <div id="wrap-assoc-eval-H2-2-text">
              <label class="font-caption text-dim mb-4 block">보충설명 (H2_2_NOTE):</label>
              <input type="text" id="input-assoc-eval-H2-2-text" class="figma-input w-full" 
                     placeholder="예: 지역 대표 먹거리 및 신선식품" 
                     value="${escapeHtml(assocPolicyState.eval_H2_2_customText ?? '지역 대표 먹거리 및 신선식품')}" />
            </div>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H2-3. 시장 고유 브랜드마크(BI/캐릭터)</label>
            <select id="select-assoc-eval-H2-3" class="figma-select w-full mb-8">
              <option value="2" ${(String(assocPolicyState.eval_H2_3_brandMark) === '2' || assocPolicyState.eval_H2_3_brandMark === undefined) ? 'selected' : ''}>2. 없다 (기본 권장)</option>
              <option value="1" ${String(assocPolicyState.eval_H2_3_brandMark) === '1' ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
            </select>
            <div id="wrap-assoc-eval-H2-3-text" style="display: ${String(assocPolicyState.eval_H2_3_brandMark) === '1' ? 'block' : 'none'};">
              <label class="font-caption text-dim mb-4 block">보충설명 (H2_3_NOTE):</label>
              <input type="text" id="input-assoc-eval-H2-3-text" class="figma-input w-full" 
                     placeholder="예: 시장 고유 캐릭터 및 로고" 
                     value="${escapeHtml(assocPolicyState.eval_H2_3_customText ?? '')}" />
            </div>
          </div>

          <div class="assoc-rule-box mb-0">
            <label class="figma-label font-bold text-white mb-6">H2-4. 브랜드 활용 안내판·홍보물 비치</label>
            <select id="select-assoc-eval-H2-4" class="figma-select w-full mb-8">
              <option value="2" ${(String(assocPolicyState.eval_H2_4_brandUsage) === '2' || assocPolicyState.eval_H2_4_brandUsage === undefined) ? 'selected' : ''}>2. 없다 (기본 권장)</option>
              <option value="1" ${String(assocPolicyState.eval_H2_4_brandUsage) === '1' ? 'selected' : ''}>1. 있다 (보충설명 필수)</option>
            </select>
            <div id="wrap-assoc-eval-H2-4-text" style="display: ${String(assocPolicyState.eval_H2_4_brandUsage) === '1' ? 'block' : 'none'};">
              <label class="font-caption text-dim mb-4 block">보충설명 (H2_4_NOTE):</label>
              <input type="text" id="input-assoc-eval-H2-4-text" class="figma-input w-full" 
                     placeholder="예: 시장 입구 안내 간판 및 리플릿" 
                     value="${escapeHtml(assocPolicyState.eval_H2_4_customText ?? '')}" />
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const bindAssocField = (elId, key, isCheck = false) => {
    const el = document.getElementById(elId);
    if (el) {
      el.addEventListener('change', () => {
        assocPolicyState[key] = isCheck ? el.checked : el.value;
        if (markUnsaved) markUnsaved();
      });
    }
  };

  bindAssocField('cb-assoc-preserve-inputs', 'preserveExistingInputs', true);
  bindAssocField('cb-assoc-skip-completed', 'skipCompletedSlots', true);
  const skipIdxInput = document.getElementById('input-assoc-skip-indices');
  if (skipIdxInput) {
    skipIdxInput.addEventListener('input', () => {
      assocPolicyState.skipSlotIndices = skipIdxInput.value.trim();
      if (markUnsaved) markUnsaved();
    });
  }

  const selA8Mode = document.getElementById('select-assoc-A8-mode');
  const openH = document.getElementById('select-assoc-A8-open-hour');
  const openM = document.getElementById('select-assoc-A8-open-minute');
  const closeH = document.getElementById('select-assoc-A8-close-hour');
  const closeM = document.getElementById('select-assoc-A8-close-minute');
  const cbA8NoTime = document.getElementById('cb-assoc-A8-no-time');

  const syncA8UIFromMode = (mode) => {
    if (mode === 'standard') {
      if (openH) openH.value = '09';
      if (openM) openM.value = '0';
      if (closeH) closeH.value = '21';
      if (closeM) closeM.value = '0';
      if (cbA8NoTime) cbA8NoTime.checked = false;
      assocPolicyState.A8_openHour = '09';
      assocPolicyState.A8_openMinute = '0';
      assocPolicyState.A8_closeHour = '21';
      assocPolicyState.A8_closeMinute = '0';
      assocPolicyState.A8_noTime = false;
    } else if (mode === 'traditional') {
      if (openH) openH.value = '06';
      if (openM) openM.value = '0';
      if (closeH) closeH.value = '20';
      if (closeM) closeM.value = '0';
      if (cbA8NoTime) cbA8NoTime.checked = false;
      assocPolicyState.A8_openHour = '06';
      assocPolicyState.A8_openMinute = '0';
      assocPolicyState.A8_closeHour = '20';
      assocPolicyState.A8_closeMinute = '0';
      assocPolicyState.A8_noTime = false;
    } else if (mode === 'night') {
      if (openH) openH.value = '11';
      if (openM) openM.value = '0';
      if (closeH) closeH.value = '23';
      if (closeM) closeM.value = '0';
      if (cbA8NoTime) cbA8NoTime.checked = false;
      assocPolicyState.A8_openHour = '11';
      assocPolicyState.A8_openMinute = '0';
      assocPolicyState.A8_closeHour = '23';
      assocPolicyState.A8_closeMinute = '0';
      assocPolicyState.A8_noTime = false;
    } else if (mode === 'no_time') {
      if (cbA8NoTime) cbA8NoTime.checked = true;
      assocPolicyState.A8_noTime = true;
    } else if (mode === 'mirror') {
      if (cbA8NoTime) cbA8NoTime.checked = false;
      assocPolicyState.A8_noTime = false;
    }
    const isNoTime = (mode === 'no_time' || (cbA8NoTime && cbA8NoTime.checked));
    [openH, openM, closeH, closeM].forEach(el => {
      if (el) el.disabled = isNoTime;
    });
  };

  if (selA8Mode) {
    selA8Mode.addEventListener('change', () => {
      assocPolicyState.A8_operatingHoursMode = selA8Mode.value;
      syncA8UIFromMode(selA8Mode.value);
      if (markUnsaved) markUnsaved();
    });
  }

  [openH, openM, closeH, closeM].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        if (selA8Mode && selA8Mode.value !== 'custom') {
          selA8Mode.value = 'custom';
          assocPolicyState.A8_operatingHoursMode = 'custom';
        }
        if (openH) assocPolicyState.A8_openHour = openH.value;
        if (openM) assocPolicyState.A8_openMinute = openM.value;
        if (closeH) assocPolicyState.A8_closeHour = closeH.value;
        if (closeM) assocPolicyState.A8_closeMinute = closeM.value;
        if (markUnsaved) markUnsaved();
      });
    }
  });

  if (cbA8NoTime) {
    cbA8NoTime.addEventListener('change', () => {
      assocPolicyState.A8_noTime = cbA8NoTime.checked;
      if (cbA8NoTime.checked) {
        if (selA8Mode) selA8Mode.value = 'no_time';
        assocPolicyState.A8_operatingHoursMode = 'no_time';
      } else {
        if (selA8Mode) selA8Mode.value = 'standard';
        assocPolicyState.A8_operatingHoursMode = 'standard';
      }
      syncA8UIFromMode(assocPolicyState.A8_operatingHoursMode);
      if (markUnsaved) markUnsaved();
    });
  }
  syncA8UIFromMode(assocPolicyState.A8_operatingHoursMode || 'standard');

  bindAssocField('select-assoc-B5-assembly', 'B5_generalAssemblyCount');
  bindAssocField('select-assoc-C1-C2-need', 'C1_C2_needRating');
  bindAssocField('select-assoc-C3-ev-parking', 'C3_1_evParkingCount');
  bindAssocField('select-assoc-C3-type', 'C3_2_1_parkingType');
  bindAssocField('select-assoc-C3-owner', 'C3_2_2_owner');
  bindAssocField('select-assoc-C3-manager', 'C3_2_3_manager');

  const selD1_1 = document.getElementById('select-assoc-D1-1-mode');
  const wrapD1_1 = document.getElementById('wrap-assoc-D1-1-custom');
  if (selD1_1) {
    selD1_1.addEventListener('change', () => {
      assocPolicyState.D1_1_festivalMode = selD1_1.value;
      if (wrapD1_1) wrapD1_1.style.display = selD1_1.value === 'custom' ? 'block' : 'none';
      if (markUnsaved) markUnsaved();
    });
  }
  const inputD1_1 = document.getElementById('input-assoc-D1-1-custom');
  if (inputD1_1) {
    inputD1_1.addEventListener('input', () => {
      assocPolicyState.D1_1_festivalCustomName = inputD1_1.value.trim();
      if (markUnsaved) markUnsaved();
    });
  }

  bindAssocField('select-assoc-D1-delivery', 'D1_2_onlineDeliveryService');
  bindAssocField('select-assoc-D1-2-5-item', 'D1_2_5_deliveryItem');
  bindAssocField('select-assoc-E1', 'E1_aiSecuritySystem');
  bindAssocField('select-assoc-F1', 'F1_emptyStoreCount');
  bindAssocField('select-assoc-F5', 'F5_emptyStoreReason');
  bindAssocField('select-assoc-F6', 'F6_emptyStorePolicy');
  bindAssocField('select-assoc-G1', 'G1_overchargeReason');
  bindAssocField('select-assoc-G2', 'G2_overchargeSolution');
  bindAssocField('select-assoc-G3-prog', 'G3_program');
  bindAssocField('select-assoc-G3-famous', 'G3_famousStore');
  bindAssocField('select-assoc-G3-night', 'G3_nightLight');
  bindAssocField('select-assoc-G3-tour', 'G3_tourLink');

  bindAssocField('select-assoc-G4-ownership', 'G4_facilityOwnershipRule');
  bindAssocField('select-assoc-G4-requirement', 'G4_facilityRequirementRule');
  bindAssocField('cb-assoc-cooling-aircon', 'G4_cooling_aircon', true);
  bindAssocField('cb-assoc-cooling-fan', 'G4_cooling_fan', true);
  bindAssocField('cb-assoc-cooling-arcade', 'G4_cooling_arcade', true);
  bindAssocField('cb-assoc-heating-warmair', 'G4_heating_warmAir', true);
  bindAssocField('cb-assoc-flood-pump', 'G4_flood_pump', true);
  bindAssocField('cb-assoc-flood-wall', 'G4_flood_wall', true);

  bindAssocField('select-assoc-eval-H1-1', 'eval_H1_1_cleanliness');
  bindAssocField('select-assoc-eval-H1-2', 'eval_H1_2_entrance');
  bindAssocField('select-assoc-eval-H1-3', 'eval_H1_3_parking');
  bindAssocField('select-assoc-eval-H1-4', 'eval_H1_4_floor');
  bindAssocField('cb-assoc-eval-H1-jitter', 'eval_H1_jitter', true);

  const setupH2Field = (idx, keySelect, keyText) => {
    const sel = document.getElementById(`select-assoc-eval-H2-${idx}`);
    const wrap = document.getElementById(`wrap-assoc-eval-H2-${idx}-text`);
    const txt = document.getElementById(`input-assoc-eval-H2-${idx}-text`);
    if (sel) {
      sel.addEventListener('change', () => {
        assocPolicyState[keySelect] = sel.value;
        if (wrap) wrap.style.display = sel.value === '1' ? 'block' : 'none';
        if (markUnsaved) markUnsaved();
      });
    }
    if (txt) {
      txt.addEventListener('input', () => {
        assocPolicyState[keyText] = txt.value.trim();
        if (markUnsaved) markUnsaved();
      });
    }
  };

  setupH2Field(1, 'eval_H2_1_specialStreet', 'eval_H2_1_customText');
  setupH2Field(2, 'eval_H2_2_specialProduct', 'eval_H2_2_customText');
  setupH2Field(3, 'eval_H2_3_brandMark', 'eval_H2_3_customText');
  setupH2Field(4, 'eval_H2_4_brandUsage', 'eval_H2_4_customText');

  const btnAssocRandom = document.getElementById('btn-assoc-preset-random');
  if (btnAssocRandom) {
    btnAssocRandom.addEventListener('click', () => {
      ['select-assoc-F5', 'select-assoc-F6', 'select-assoc-G1', 'select-assoc-G2'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
          sel.value = 'random';
          sel.dispatchEvent(new Event('change'));
        }
      });
      if (appendLog) appendLog('info', '🎲 F5, F6, G1, G2 정책 문항이 [1~5 항목 랜덤 답변]으로 일괄 설정되었습니다.');
    });
  }

  const btnAssocDefault = document.getElementById('btn-assoc-preset-default');
  if (btnAssocDefault) {
    btnAssocDefault.addEventListener('click', () => {
      ['select-assoc-F5', 'select-assoc-F6', 'select-assoc-G1', 'select-assoc-G2'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
          sel.value = '1';
          sel.dispatchEvent(new Event('change'));
        }
      });
      const selA8 = document.getElementById('select-assoc-A8-mode');
      if (selA8) {
        selA8.value = 'standard';
        selA8.dispatchEvent(new Event('change'));
      }
      if (appendLog) appendLog('info', '표준 정책 문항이 1번 항목으로 일괄 설정되었습니다.');
    });
  }

  return assocPolicyState;
}

