/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사]
 * STEP 2 마스터 응답 가이드라인 블루프린트 렌더러 및 정책 상태 수집기
 */
import { escapeHtml } from './blueprint-utils.js';

export const DEFAULT_KBPI_UI_POLICY = {
  pilotStopAtStep: 'Q4',
  stopBeforeFinalSubmit: true,
  purchaseYesRate: 90,
  unaided4thBrandRate: 35,
  aidedExtraMin: 2,
  aidedExtraMax: 4,
  q6NoRate: 80,
  teenAutoNoneUnfitCategories: true,
  autoSyncGoogleSheet: true,
  customFoodLivingChannels: '편의점, 동네슈퍼, 이마트, 쿠팡, 홈플러스, 롯데마트, GS25, CU, 컬리, 네이버쇼핑',
  proxyServer: ''
};

export function renderKmacKbpiBlueprint(data = {}, {
  campId = '',
  blueprintStageGrid,
  badgeMasterStatus,
  btnSaveBaseline,
  onSyncFromSheet = null,
  onPushToSheet = null,
  onInspectHtml = null
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_UI_POLICY,
    ...(data.policy || {})
  };
  const sheetUrl = data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg/edit';
  const htmlReportUrl = campId ? `/api/campaigns/${encodeURIComponent(campId)}/kbpi-html-report` : '#';

  // 기존 전통시장 3대 업종 그룹 탭 및 프리셋 바 숨김
  const groupNav = document.querySelector('.blueprint-group-nav-container');
  const presetGroup = document.querySelector('.blueprint-preset-group');
  const templatePicker = document.querySelector('.blueprint-template-picker');
  const step2JumpLabel = document.getElementById('quick-jump-step2-label');
  const step2TitleEl = document.querySelector('#section-master-blueprint .step-card-title');
  const step2SubEl = document.querySelector('.blueprint-header-subtitle');

  if (groupNav) groupNav.classList.add('hidden');
  if (presetGroup) presetGroup.classList.add('hidden');
  if (templatePicker) templatePicker.classList.add('hidden');
  if (step2JumpLabel) {
    step2JumpLabel.innerHTML = '<i class="fa-solid fa-sliders"></i> K-BPI 응답 가이드 &amp; 구입경험 정합성 규칙';
  }
  if (step2TitleEl) {
    step2TitleEl.textContent = '2027년 K-BPI 브랜드파워 조사 전 문항 응답 가이드라인';
  }
  if (step2SubEl) {
    step2SubEl.textContent = 'GP1 위치 주입 · 신상정보 · SQ1 스크리닝 · 산업군별 문항 1~8 점수/구입경험 연동 및 구글 시트 자동 기록 설정을 관리합니다.';
  }
  if (badgeMasterStatus) {
    badgeMasterStatus.className = 'badge-status badge-blueprint ready';
    badgeMasterStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> K-BPI 정합성 엔진 활성 (노원구청/인천시청 GPS · 문항4 파일럿 정지)';
  }
  if (btnSaveBaseline) {
    btnSaveBaseline.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> K-BPI 응답 가이드 저장';
  }

  if (!blueprintStageGrid) return policy;
  blueprintStageGrid.className = 'kbpi-blueprint-wrap';

  blueprintStageGrid.innerHTML = `
    <div class="kbpi-guide-grid">
      <!-- 카드 1: 진입 · GPS · 신상정보 · SQ1 -->
      <div class="kbpi-guide-card">
        <div class="kbpi-card-head">
          <span class="kbpi-step-pill">STAGE 1</span>
          <h3 class="kbpi-card-title">진입 · 지역별 GPS 미세분산 · 신상정보 · SQ1</h3>
        </div>
        <ul class="kbpi-rule-list">
          <li><strong>CAPI 포털 로그인:</strong> <code>5911000005645</code> 접속 ➔ <code>ID: 230 브랜드파워</code> ➔ <code>최종id / 고유번호</code> 일치 슬롯 자동 진입</li>
          <li><strong>GP1 위치 확인 (반경 50~80m 미세 분산):</strong> <code>서울(100명)</code> = 노원구청(<code>37.654192, 127.056794</code>) / <code>인천(50명)</code> = 인천광역시청(<code>37.456256, 126.705206</code>)</li>
          <li><strong>신상정보 연락처 분기:</strong> <code>010-</code>(124명)은 휴대폰 칸, <code>02-</code>(26명)는 일반전화 칸 자동 분리 입력</li>
          <li><strong>SQ1 스크리닝:</strong> 전 항목 <strong>"모두 없다"</strong> 고정 선택</li>
        </ul>
      </div>

      <!-- 카드 2: 문항 1~3 브랜드 인지도 및 매트릭스 정합성 -->
      <div class="kbpi-guide-card">
        <div class="kbpi-card-head">
          <span class="kbpi-step-pill">STAGE 2</span>
          <h3 class="kbpi-card-title">문항 1 ~ 3 인지도 · 평가점수 · 태도 연동 규칙</h3>
        </div>
        <ul class="kbpi-rule-list">
          <li><strong>문항 1 (비보조):</strong> <code>1-1 ~ 1-3</code> 중복 없는 정식 브랜드 3개 필수 입력, <code>1-4</code> 추가 1개 또는 <code>없음</code> 분산</li>
          <li><strong>문항 2 (보조):</strong> 문항 1 응답 브랜드 포함 + 미체크 브랜드 중 <strong>랜덤 2~4개 추가 선택</strong> (공식 보기 자동 학습)</li>
          <li><strong>문항 3 (가변 행 매트릭스):</strong> 소비재·유통·병원 등 산업군별 가변 평가 행 자동 인식, <code>3·4·5</code> 분산 후 <code>전반적 만족도</code> 평균 반올림 연동</li>
          <li><strong>구입경험 '없음' 절대 규칙:</strong> 시트에 <code>구입경험='없음'</code> 지정 시 <strong><code>태도 문항</code>은 <code>1·2·3번</code> 중 선택(<code>4·5번</code> 금지)</strong> + <strong><code>예/아니오</code> 전원 '아니오'</strong> + <strong><code>문항 4·5</code> '없음'</strong> 일괄 처리</li>
        </ul>
      </div>

      <!-- 카드 3: 세부 비율 · 정지 지점 · 채널 설정 컨트롤 -->
      <div class="kbpi-guide-card kbpi-guide-card-wide">
        <div class="kbpi-card-head kbpi-card-head-between">
          <div class="flex-center-gap-8">
            <span class="kbpi-step-pill step-tunable">STAGE 3</span>
            <h3 class="kbpi-card-title">세부 확률 · 파일럿 정지 · 구입 채널 · HTML 구조 분석</h3>
          </div>
          <div class="flex-center-gap-8">
            <button type="button" id="btn-kbpi-inspect-html" class="btn-pill btn-pill-primary btn-pill-small">
              <i class="fa-solid fa-microscope"></i> 전 문항 HTML·구조 정밀 추출
            </button>
            <a id="link-kbpi-download-html" href="${escapeHtml(htmlReportUrl)}" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-file-arrow-down text-primary-color"></i> HTML 분석 JSON 다운로드
            </a>
            <a href="${escapeHtml(sheetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-table text-success-color"></i> 구글 시트 열기
            </a>
            <button type="button" id="btn-kbpi-pull-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-cloud-arrow-down text-primary-color"></i> 시트 설정 불러오기
            </button>
            <button type="button" id="btn-kbpi-push-sheet" class="btn-pill btn-pill-secondary btn-pill-small">
              <i class="fa-solid fa-cloud-arrow-up"></i> 시트로 내보내기
            </button>
          </div>
        </div>

        <div class="kbpi-controls-grid">
          <div class="form-group">
            <label class="figma-label font-bold" for="sel-kbpi-pilot-stop">파일럿(단건 검증) 정지 지점</label>
            <select id="sel-kbpi-pilot-stop" class="figma-select">
              <option value="Q4" ${policy.pilotStopAtStep === 'Q4' ? 'selected' : ''}>1번째 품목 [문항 4] 도달 시 안전 정지 (요청 기본값)</option>
              <option value="FINAL_GATE" ${policy.pilotStopAtStep === 'FINAL_GATE' ? 'selected' : ''}>전 품목 응답 후 최종 제출 직전 정지</option>
            </select>
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-purchase-rate">시트 미지정 품목 기본 구입경험 '있음' 비율 (%)</label>
            <input type="number" id="num-kbpi-purchase-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.purchaseYesRate ?? 90)}" />
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-q6-no-rate">문항 6 '아니오' 응답 비율 (%) (가이드: 80%)</label>
            <input type="number" id="num-kbpi-q6-no-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.q6NoRate ?? 80)}" />
          </div>

          <div class="form-group">
            <label class="figma-label font-bold" for="num-kbpi-q1-4-rate">문항 1-4 추가 브랜드 기재 비율 (%) (나머지 '없음')</label>
            <input type="number" id="num-kbpi-q1-4-rate" class="figma-input" min="0" max="100" step="5" value="${Number(policy.unaided4thBrandRate ?? 35)}" />
          </div>

          <div class="form-group kbpi-span-2">
            <label class="figma-label font-bold" for="inp-kbpi-food-channels">문항 4-1 식음료 · 생활소비재 구입 채널 풀 (쉼표 구분 — 편의점·동네슈퍼 포함)</label>
            <input type="text" id="inp-kbpi-food-channels" class="figma-input" value="${escapeHtml(policy.customFoodLivingChannels || DEFAULT_KBPI_UI_POLICY.customFoodLivingChannels)}" />
          </div>

          <div class="form-group">
            <label class="custom-cb-label mt-6">
              <input type="checkbox" id="chk-kbpi-teen-guard" ${policy.teenAutoNoneUnfitCategories !== false ? 'checked' : ''} />
              <span>10대 미성년자 비적합 품목(주류·자동차·대형주방가전 등) 시트 미지정 시 자동 '구입경험 없음' 보정</span>
            </label>
          </div>

          <div class="form-group">
            <label class="custom-cb-label mt-6">
              <input type="checkbox" id="chk-kbpi-auto-sheet" ${policy.autoSyncGoogleSheet !== false ? 'checked' : ''} />
              <span>실행 직후 구글 시트(진행상태 · 브랜드1~8 · 구입경험1~8) 실시간 자동 기입</span>
            </label>
          </div>

          <div class="form-group kbpi-span-2">
            <label class="figma-label font-bold" for="inp-kbpi-proxy-server">국내(서울 리전) 프록시 경유 주소 (선택 — 서울 리전 VM에서 직접 구동 시 비워둠)</label>
            <input type="text" id="inp-kbpi-proxy-server" class="figma-input font-mono" placeholder="예: http://34.64.xxx.xxx:8888 (서울 VM 직접 구동 시 공란)" value="${escapeHtml(policy.proxyServer || '')}" />
          </div>
        </div>
      </div>
    </div>
  `;

  const btnInspect = document.getElementById('btn-kbpi-inspect-html');
  if (btnInspect && typeof onInspectHtml === 'function') {
    btnInspect.addEventListener('click', () => onInspectHtml());
  }
  const btnPull = document.getElementById('btn-kbpi-pull-sheet');
  if (btnPull && typeof onSyncFromSheet === 'function') {
    btnPull.addEventListener('click', () => onSyncFromSheet());
  }
  const btnPush = document.getElementById('btn-kbpi-push-sheet');
  if (btnPush && typeof onPushToSheet === 'function') {
    btnPush.addEventListener('click', () => onPushToSheet());
  }

  return policy;
}

export function collectKmacKbpiPolicyFromDom(fallback = {}) {
  const pilotStopEl = document.getElementById('sel-kbpi-pilot-stop');
  const purchaseRateEl = document.getElementById('num-kbpi-purchase-rate');
  const q6NoRateEl = document.getElementById('num-kbpi-q6-no-rate');
  const q14RateEl = document.getElementById('num-kbpi-q1-4-rate');
  const foodChEl = document.getElementById('inp-kbpi-food-channels');
  const teenGuardEl = document.getElementById('chk-kbpi-teen-guard');
  const autoSheetEl = document.getElementById('chk-kbpi-auto-sheet');
  const proxyEl = document.getElementById('inp-kbpi-proxy-server');

  return {
    ...DEFAULT_KBPI_UI_POLICY,
    ...fallback,
    pilotStopAtStep: pilotStopEl ? pilotStopEl.value : (fallback.pilotStopAtStep || 'Q4'),
    purchaseYesRate: purchaseRateEl ? Number(purchaseRateEl.value) : Number(fallback.purchaseYesRate ?? 90),
    q6NoRate: q6NoRateEl ? Number(q6NoRateEl.value) : Number(fallback.q6NoRate ?? 80),
    unaided4thBrandRate: q14RateEl ? Number(q14RateEl.value) : Number(fallback.unaided4thBrandRate ?? 35),
    customFoodLivingChannels: foodChEl ? foodChEl.value.trim() : (fallback.customFoodLivingChannels || DEFAULT_KBPI_UI_POLICY.customFoodLivingChannels),
    teenAutoNoneUnfitCategories: teenGuardEl ? Boolean(teenGuardEl.checked) : (fallback.teenAutoNoneUnfitCategories !== false),
    autoSyncGoogleSheet: autoSheetEl ? Boolean(autoSheetEl.checked) : (fallback.autoSyncGoogleSheet !== false),
    proxyServer: proxyEl ? proxyEl.value.trim() : (fallback.proxyServer || '')
  };
}
