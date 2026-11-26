/**
 * scripts/test_mock_browser.js
 * 프론트엔드(survey-detail.js + public/modules/*.js) 및 백엔드 분리 모듈 정적/동적 실행 검증 스크립트
 */
import { execSync } from 'child_process';

// 1. 정적 구문 검사 (node --check)
const filesToCheck = [
  'public/ui-feedback.js',
  'public/nav-auth.js',
  'public/login.js',
  'public/campaign-list.js',
  'public/quota-builder.js',
  'public/quota-detail.js',
  'public/survey-detail.js',
  'public/settlement.js',
  'public/modules/blueprint-utils.js',
  'public/modules/blueprint-metrix.js',
  'public/modules/blueprint-assoc.js',
  'public/modules/blueprint-globalri.js',
  'public/modules/blueprint-gallup-hrc-kona.js',
  'public/modules/blueprint-kstat-store.js',
  'public/modules/blueprint-kbpi.js',
  'public/modules/quota-segment-filter.js',
  'public/modules/quota-table-renderers.js',
  'src/server.js',
  'src/config/env.js',
  'src/config/campaign-seeders.js',
  'src/models/campaign.js',
  'src/models/settlement.js',
  'src/services/task-manager.js',
  'src/services/onnuri-db-builder.js',
  'src/routes/auth-routes.js',
  'src/routes/campaign-routes.js',
  'src/routes/quota-routes.js',
  'src/routes/sync-routes.js',
  'src/routes/execution-routes.js',
  'src/routes/settlement-routes.js',
  'src/utils/settlement-excel.js',
  'src/utils/atomic-file.js',
  'src/utils/logger.js',
  'src/utils/chromium-launcher.js',
  'src/engine/metrix-runner.js',
  'src/engine/metrix-slot-scraper.js',
  'src/utils/gyeonggi-panel-answer-excel.js',
  'src/engine/kmac-kbpi-runner.js',
  'src/engine/kmac-kbpi-scraper.js',
  'src/utils/kmac-kbpi-sheet-sync.js',
  'src/utils/respondent-pool.js',
  'src/engine/enricher.js',
  'src/engine/persona-builder.js',
  'src/engine/browser.js',
  'src/engine/kona-runner.js',
  'src/ai/persona.js',
  'src/ai/decision.js'
];

for (const file of filesToCheck) {
  execSync(`node --check "${file}"`, { stdio: 'inherit' });
}
console.log(`✅ [1/4] 정적 구문 검사(node --check) ${filesToCheck.length}개 파일 100% 통과`);

// 2. 모의 브라우저 DOM 환경 구성
function makeEl(id = '') {
  return {
    id,
    value: '0',
    checked: false,
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    style: {},
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => makeEl(),
    closest: () => null,
    appendChild: () => {}
  };
}

const elements = {};
globalThis.document = {
  getElementById: (id) => {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  },
  querySelectorAll: () => [],
  querySelector: () => makeEl(),
  createElement: (tag) => makeEl(tag),
  body: makeEl('body'),
  addEventListener: (ev, cb) => {
    if (ev === 'DOMContentLoaded') {
      setTimeout(cb, 5);
    }
  }
};

globalThis.window = globalThis;
globalThis.location = {
  search: '?id=camp_globalri_literacy_7791',
  href: 'http://localhost:3000/survey-detail.html?id=camp_globalri_literacy_7791',
  origin: 'http://localhost:3000'
};
const mockAlerts = [];
globalThis.alert = (msg) => {
  console.log('[MOCK ALERT]', msg);
  mockAlerts.push(String(msg));
};
globalThis.confirm = () => true;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
globalThis.EventSource = function () {
  return {
    addEventListener: () => {},
    onmessage: () => {},
    close: () => {}
  };
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u === '/api/quota/list') {
    return { ok: true, json: async () => [] };
  }
  if (u.endsWith('/blueprint')) {
    return {
      ok: true,
      json: async () => ({
        surveyType: 'globalri_literacy',
        policy: { preserveExistingInputs: true, stopAfterPartC: true },
        ageGroups: {},
        blueprint: { stages: [] }
      })
    };
  }
  if (u.startsWith('/api/campaigns/')) {
    return {
      ok: true,
      json: async () => ({
        id: 'camp_globalri_literacy_7791',
        title: '[GR20260618-1-001-02] 제5차 성인문해능력조사 - 노영미7791',
        surveyType: 'globalri_literacy',
        status: 'ready',
        quotaDatabase: [
          {
            index: 9,
            seq: 9,
            lid: '029433',
            memberUid: '0294334Yhp4_01',
            memberName: '박태호',
            age: 54,
            birthYear: 1972,
            ageGroup: 'age50',
            ageGroupLabel: '50대 그룹',
            quotaStatus: 'pilot_done',
            status: 'Part C 완료 (수기대기)'
          }
        ],
        guidelineConfig: {
          surveyUrl: 'https://gift.globalri.it/login',
          headless: true
        }
      })
    };
  }
  return { ok: true, json: async () => ({ isRunning: false }) };
};

// 3. ES 모듈 동적 임포트 및 렌더링 검증
const utils = await import('../public/modules/blueprint-utils.js');
const metrixMod = await import('../public/modules/blueprint-metrix.js');
const assocMod = await import('../public/modules/blueprint-assoc.js');
const globalriMod = await import('../public/modules/blueprint-globalri.js');
const gallupHrcKonaMod = await import('../public/modules/blueprint-gallup-hrc-kona.js');
const kstatStoreMod = await import('../public/modules/blueprint-kstat-store.js');
const quotaRenderers = await import('../public/modules/quota-table-renderers.js');

const container = makeEl('blueprint-stage-grid');
const badgeEl = makeEl('badge-master-status');
const saveBtnEl = makeEl('btn-save-baseline');

gallupHrcKonaMod.renderGallupReturnFarmBlueprint(
  { policy: { stopBeforeFinalSubmit: true } },
  {
    getCurrentCampaign: () => ({ quotaDatabase: [{ seq: 68, sampleId: '105036' }] }),
    checkedGallupSeqs: new Set([68]),
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl,
    blueprintStageGrid: container,
    triggerBatchRun: () => {}
  }
);
if (!container.innerHTML.includes('한국갤럽 G-CAII')) {
  throw new Error('Gallup blueprint render failed');
}

gallupHrcKonaMod.renderHrcEnergyBlueprint(
  { blueprint: { stages: [{ step: 'STEP 1', title: '건물 기본정보', fields: [] }] } },
  { badgeMasterStatus: badgeEl, btnSaveBaseline: saveBtnEl, blueprintStageGrid: container }
);
gallupHrcKonaMod.renderKonaBlueprint(
  { blueprint: { stages: [{ step: 'Q1', title: '거주기간', fields: [] }] } },
  { badgeMasterStatus: badgeEl, btnSaveBaseline: saveBtnEl, blueprintStageGrid: container }
);
assocMod.renderAssocBlueprint(
  { blueprint: { stages: [{ step: 'SQ1', title: '상인회 기본현황', fields: [] }] } },
  { badgeMasterStatus: badgeEl, btnSaveBaseline: saveBtnEl, blueprintStageGrid: container }
);
const metrixState = metrixMod.renderMetrixBlueprint(
  { surveyType: 'metrix_panel', blueprint: { stages: [] }, policy: {} },
  {
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl,
    blueprintStageGrid: container
  }
);
if (!container.innerHTML.includes('metrix-guide-shell') || !container.innerHTML.includes('metrix-tab-panel-questions') || !container.innerHTML.includes('metrix-tab-panel-industries')) {
  throw new Error('Metrix clean 2-tab guide failed to render');
}
if (container.innerHTML.includes('rgba(15,23,42') || container.innerHTML.includes('#f8fafc') || container.innerHTML.includes('[파트 A]')) {
  throw new Error('Metrix blueprint still contains legacy dark inline styles or [파트 A~I] cards');
}
if (!container.innerHTML.includes('sel-metrix-q13-range-mode') || !container.innerHTML.includes('num-metrix-income-min')) {
  throw new Error('Metrix Q13 income range guide failed to render');
}
if (
  metrixState.q13_incomeRangeMode !== 'range' ||
  metrixState.owner_incomeMin !== 250 ||
  metrixState.owner_incomeMax !== 400 ||
  metrixState.owner_incomeStep !== 5
) {
  throw new Error(`Metrix Q13 defaults mismatch: ${JSON.stringify({
    mode: metrixState.q13_incomeRangeMode,
    min: metrixState.owner_incomeMin,
    max: metrixState.owner_incomeMax,
    step: metrixState.owner_incomeStep
  })}`);
}
metrixMod.syncMetrixInputsToState(metrixState);
if (!metrixState.excludeClosedBiz || !metrixState.updatePhoneInContactPopup || !metrixState.safetyStopAtReview) {
  throw new Error('Metrix mandatory safety invariants were not preserved');
}

metrixMod.renderMetrixBlueprint(
  { surveyType: 'metrix_seoul_panel', blueprint: { stages: [] }, policy: {} },
  {
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl,
    blueprintStageGrid: container
  }
);
if (!container.innerHTML.includes('svyA115.asp')) {
  throw new Error('Metrix Seoul 5th-wave blueprint render failed');
}

const metrixTbody = makeEl('quota-table-body');
quotaRenderers.renderMetrixQuotaTable({
  db: [
    { index: 1, seq: 1, surveyorId: '강영미', uid: '2220', companyName: '주식회사 일화검사소', industry: '6.전문, 과학 및 기술 서비스업', quotaStatus: 'ready' },
    { index: 54, seq: 54, surveyorId: '강영미', uid: '30109', companyName: '아이가루', industry: '1.제조업', status: '인원초과', quotaStatus: 'excluded' },
    { index: 111, seq: 111, surveyorId: '김정례', uid: '1044', companyName: '가나안꽃화원', industry: '3.도매 및 소매업', status: '진행중(99%)', quotaStatus: '진행중(98%)' },
    { index: 172, seq: 172, surveyorId: '송춘희', uid: '4498', companyName: '양평상회', industry: '3.도매 및 소매업', quotaStatus: 'ready' },
    { index: 245, seq: 245, surveyorId: '지연옥', uid: '8001', companyName: '하남테크', industry: '3.도매 및 소매업', quotaStatus: 'ready' }
  ],
  quotaTableBody: metrixTbody,
  campId: 'camp_1794792483912',
  checkedMetrixSeqs: new Set([1, 172, 245]),
  metrixPolicy: metrixState,
  onReRender: () => {},
  onSelectionChange: () => {},
  onTriggerBatchRun: () => {},
  onSyncMetrix622: () => {},
  onToggleClosedBiz: () => {}
});
const metrixBarHtml = elements['metrix-622-step1-check-bar']?.innerHTML || '';
if (
  !metrixTbody.innerHTML.includes('일화검사소') ||
  !metrixTbody.innerHTML.includes('양평상회') ||
  !metrixTbody.innerHTML.includes('하남테크') ||
  !metrixTbody.innerHTML.includes('인원초과 제외') ||
  !metrixTbody.innerHTML.includes('99% 검토대기') ||
  !metrixBarHtml.includes('data-acc-filter="송춘희"') ||
  !metrixBarHtml.includes('data-acc-filter="지연옥"') ||
  !metrixBarHtml.includes('5계정·시트·폐업 동기화') ||
  !metrixBarHtml.includes('btn-metrix-622-top-batch-run') ||
  !metrixBarHtml.includes('선택 업체만 자동설문 실행 (3건)')
) {
  throw new Error('Metrix 5-account quota table render failed');
}
kstatStoreMod.renderKstatStoreStages({
  blueprintStageGrid: container,
  getBlueprintData: () => ({ stages: [{ step: 'P1', title: '사업장 일반현황', fields: [] }] }),
  getCurrentBaseline: () => ({}),
  getGroupBaselines: () => ({}),
  getActiveGroup: () => 'all',
  markUnsaved: () => {}
});

const tbody = makeEl('quota-table-body');
quotaRenderers.renderGallupQuotaTable({
  db: [{ seq: 68, id: '105036', name: '이정우', quotaStatus: 'pilot_done' }],
  quotaTableBody: tbody,
  checkedGallupSeqs: new Set([68]),
  completed: 1,
  onReRender: () => {},
  onTriggerBatchRun: () => {}
});
if (!tbody.innerHTML.includes('105036')) {
  throw new Error('Gallup quota table render failed');
}

// K-BPI 블루프린트 + 테이블 + 전 설문 공통 구분자 분할 패널 검증
const kbpiMod = await import('../public/modules/blueprint-kbpi.js');
const segMod = await import('../public/modules/quota-segment-filter.js');

const kbpiPol = kbpiMod.renderKmacKbpiBlueprint(
  { surveyType: 'kmac_kbpi', policy: {} },
  {
    blueprintStageGrid: container,
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl
  }
);
if (
  kbpiPol.pilotStopAtStep !== 'FINAL_GATE' ||
  !container.innerHTML.includes('편의점') ||
  !container.innerHTML.includes('동네슈퍼') ||
  !container.innerHTML.includes('인천광역시청')
) {
  throw new Error('K-BPI blueprint render failed');
}

const sampleKbpiDb = [
  {
    index: 1,
    seq: 1,
    finalId: '24',
    uid: '1_1_1_1_1',
    region: '서울',
    gpsLabel: '서울 노원구청',
    latitude: 37.65421,
    longitude: 127.05681,
    gender: '남',
    ageGroup: '10대',
    age: 18,
    name: '김도윤',
    phone: '010-1234-5678',
    categoryConfigs: [
      { slot: 1, categoryName: '생수', purchaseExp: '있음' },
      { slot: 2, categoryName: '소주', purchaseExp: '없음' }
    ],
    quotaStatus: 'ready'
  },
  {
    index: 101,
    seq: 101,
    finalId: '124',
    uid: '2_2_3_1_1',
    region: '인천',
    gpsLabel: '인천광역시청',
    latitude: 37.4563,
    longitude: 126.7052,
    gender: '여',
    ageGroup: '30대',
    age: 34,
    name: '이서연',
    phone: '02-345-6789',
    categoryConfigs: [],
    quotaStatus: 'ready'
  }
];

const kbpiTbody = makeEl('quota-table-body');
quotaRenderers.renderKmacKbpiQuotaTable({
  db: sampleKbpiDb,
  quotaTableBody: kbpiTbody,
  checkedKbpiSeqs: new Set([1]),
  activeAxisId: 'gender_age',
  selectedSegments: new Set(['남 · 10대']),
  onReRender: () => {},
  onSelectionChange: () => {},
  onTriggerBatchRun: () => {}
});
if (
  !kbpiTbody.innerHTML.includes('김도윤') ||
  !kbpiTbody.innerHTML.includes('소주: 없음') ||
  kbpiTbody.innerHTML.includes('이서연')
) {
  throw new Error('K-BPI segmented quota table filter/render failed');
}

const segPanelEl = makeEl('universal-step3-segment-panel');
segMod.renderUniversalStep3SegmentPanel({
  panelEl: segPanelEl,
  db: sampleKbpiDb,
  surveyType: 'kmac_kbpi',
  activeAxisId: 'gender_age',
  selectedSegments: new Set(['남 · 10대']),
  checkedSeqs: new Set([1]),
  isRunning: false
});
if (
  !segPanelEl.innerHTML.includes('쿼터 구분자별 분할 선택') ||
  !segPanelEl.innerHTML.includes('남 · 10대') ||
  !segPanelEl.innerHTML.includes('여 · 30대')
) {
  throw new Error('Universal STEP 3 segment panel render failed');
}

// survey-detail.js 메인 컨트롤러 임포트 및 초기화 실행
await import('../public/survey-detail.js');
await new Promise((r) => setTimeout(r, 80));

if (mockAlerts.some(m => m.includes('실패'))) {
  throw new Error(`Unexpected alert during loadCampaign: ${mockAlerts.join(' | ')}`);
}
if (!elements['detail-campaign-title']?.textContent.includes('제5차 성인문해능력조사')) {
  throw new Error(`Expected campaign title to load, got: ${elements['detail-campaign-title']?.textContent}`);
}

console.log('✅ [2/4] 프론트엔드 9대 분리 모듈 + survey-detail.js 모의 DOM 렌더링 검증 통과');

// 백엔드 분리 모듈 임포트 검증
const seedersMod = await import('../src/config/campaign-seeders.js');
const quotaRoutesMod = await import('../src/routes/quota-routes.js');
const kbpiRunnerMod = await import('../src/engine/kmac-kbpi-runner.js');
const kbpiSyncMod = await import('../src/utils/kmac-kbpi-sheet-sync.js');
if (
  typeof seedersMod.seedInitialCampaigns !== 'function' ||
  typeof quotaRoutesMod.registerQuotaRoutes !== 'function' ||
  typeof kbpiRunnerMod.runKmacKbpiSurvey !== 'function' ||
  typeof kbpiSyncMod.computeKbpiGps !== 'function'
) {
  throw new Error('Backend module export verification failed');
}
console.log('✅ [3/4] 백엔드 분리 모듈 및 K-BPI 러너/시트동기화 Export 검증 통과');

// K-BPI 점수 생성기 정합성 검증 (300회 반복: 44444 일렬응답 금지, 평균 반올림 일치, 구입경험='없음' 시 3-11 4·5번 절대 금지)
for (let iter = 0; iter < 300; iter++) {
  const yesScores = kbpiRunnerMod.generateKbpiMatrixScores({ hasPurchaseExp: true });
  const noScores = kbpiRunnerMod.generateKbpiMatrixScores({ hasPurchaseExp: false });
  if (new Set(yesScores.itemScores).size < 2 || new Set(noScores.itemScores).size < 2) {
    throw new Error('Straight-lining detected in K-BPI Q3 1~9 scores!');
  }
  const expectedYes10 = Math.round(yesScores.itemScores.reduce((a, b) => a + b, 0) / 9);
  const expectedNo10 = Math.round(noScores.itemScores.reduce((a, b) => a + b, 0) / 9);
  if (yesScores.overallSatisfaction !== expectedYes10 || noScores.overallSatisfaction !== expectedNo10) {
    throw new Error('Q3-10 rounded mean mismatch!');
  }
  if (noScores.attitudeChoice >= 4 || noScores.attitudeChoice < 1) {
    throw new Error(`Q3-11 purchaseExp='없음' rule violated: attitudeChoice=${noScores.attitudeChoice}`);
  }
  if (yesScores.overallSatisfaction >= 4 && yesScores.attitudeChoice < 4) {
    throw new Error(`Q3-11 high satisfaction rule violated: overall=${yesScores.overallSatisfaction}, attitudeChoice=${yesScores.attitudeChoice}`);
  }
}
const explicitNone = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '생수',
  categorySlotIdx: 1,
  categoryConfigs: [{ slot: 1, categoryName: '생수', purchaseExp: '없음' }],
  respondentAge: 35,
  policy: { purchaseYesRate: 100 },
  rng: () => 0.1
});
const teenAlcohol = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '소주',
  categorySlotIdx: 2,
  categoryConfigs: [],
  respondentAge: 17,
  policy: { purchaseYesRate: 100, teenAutoNoneUnfitCategories: true },
  rng: () => 0.1
});
const teenCyberUniv = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '사이버대학',
  categorySlotIdx: 15,
  categoryConfigs: [],
  ageGroup: '10대',
  respondentAge: 18,
  policy: { purchaseYesRate: 100, teenAutoNoneUnfitCategories: true },
  rng: () => 0.1
});
const maleFemaleProduct = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '생리대',
  categorySlotIdx: 4,
  categoryConfigs: [],
  gender: '남',
  respondentAge: 28,
  policy: { purchaseYesRate: 100 },
  rng: () => 0.1
});
if (explicitNone !== '없음' || teenAlcohol !== '없음' || teenCyberUniv !== '없음' || maleFemaleProduct !== '없음') {
  throw new Error(`decideCategoryPurchaseExp failed: explicitNone=${explicitNone}, teenAlcohol=${teenAlcohol}, teenCyberUniv=${teenCyberUniv}, maleFemaleProduct=${maleFemaleProduct}`);
}

const hospChannels = kbpiRunnerMod.resolveSmartChannelPool('지역거점 종합병원');
const cyberChannels = kbpiRunnerMod.resolveSmartChannelPool('사이버대학');
const foodChannels = kbpiRunnerMod.resolveSmartChannelPool('우유', { customFoodLivingChannels: '편의점, 동네슈퍼, 이마트' });
if (
  !hospChannels.some(c => c.includes('병원')) ||
  !cyberChannels.some(c => c.includes('홈페이지')) ||
  !foodChannels.includes('동네슈퍼') ||
  kbpiRunnerMod.Q3_RECOMMEND_REASON_POOLS.positive.length < 5
) {
  throw new Error('K-BPI v2.0 channel / 6-1 reason pool verification failed!');
}

const twentySlotNorm = kbpiSyncMod.normalizeCategoryConfigs(
  Array.from({ length: 20 }, (_, idx) => ({ slot: idx + 1, categoryName: `품목${idx + 1}`, purchaseExp: '있음' }))
);
if (twentySlotNorm.length !== 20 || twentySlotNorm[19].categoryName !== '품목20') {
  throw new Error('K-BPI 20-slot normalizeCategoryConfigs verification failed!');
}

const seoulGps1 = kbpiSyncMod.computeKbpiGps('서울', '1_1_1_1_1');
const incheonGps1 = kbpiSyncMod.computeKbpiGps('인천', '2_1_1_1_1');
if (Math.abs(seoulGps1.latitude - 37.654192) > 0.001 || Math.abs(incheonGps1.latitude - 37.456256) > 0.001) {
  throw new Error('K-BPI GPS micro-jitter out of 50~80m bounds!');
}

// K-BPI v3.0 추가 검증: DQ1(3.1), ZQ1~ZQ5_2(3.2), 조사구/동(노원구·남동구), STEP 2 브랜드 스캔 가이드 & 150건 쿼터 무결성
const officialDq1Options = [
  { akey: '1', label: '포털 사이트 검색(네이버, 다음, 구글 등)' },
  { akey: '2', label: '동영상 플랫폼(유튜브, 틱톡 등)' },
  { akey: '3', label: 'SNS(인스타그램, 페이스북, X 등)' },
  { akey: '4', label: '온라인 커뮤니티/카페/블로그' },
  { akey: '5', label: 'TV/라디오 광고 및 방송 프로그램' },
  { akey: '6', label: '신문/잡지/카탈로그' },
  { akey: '7', label: '가족/친구/지인 추천' },
  { akey: '8', label: '오프라인 매장 방문/진열/직원 설명' },
  { akey: '9', label: '생성형 AI(ChatGPT, 제미나이, 퍼플렉시티 등)' },
  { akey: '10', label: '기타' }
];
for (let iter = 0; iter < 300; iter++) {
  const dq1Picked = kbpiRunnerMod.pickKbpiDq1Keys(officialDq1Options, Math.random);
  if (dq1Picked.length !== 2 || dq1Picked[0].akey === dq1Picked[1].akey) {
    throw new Error(`DQ1 must pick 2 distinct options, got: ${JSON.stringify(dq1Picked)}`);
  }
  if (dq1Picked.some(o => o.akey === '6' || o.akey === '9' || o.akey === '10')) {
    throw new Error(`DQ1 picked excluded option (신문/잡지=6, 생성형AI=9, 기타=10): ${JSON.stringify(dq1Picked)}`);
  }
}

const zqMarried = kbpiRunnerMod.resolveKbpiZqAnswers({
  age: 42,
  education: '대졸(4년제)',
  job: '사무직',
  householdIncome: '600~799만원',
  maritalStatus: '기혼',
  familySize: 4,
  childrenCount: 2
});
if (
  zqMarried.zq1Key !== '4' ||
  zqMarried.zq2Key !== '5' ||
  zqMarried.zq3Key !== '3' ||
  zqMarried.zq4Key !== '4' ||
  zqMarried.zq5Key !== '2' ||
  zqMarried.zq5_1Key !== '4' ||
  zqMarried.zq5_2Key !== '2'
) {
  throw new Error(`ZQ married mapping mismatch: ${JSON.stringify(zqMarried)}`);
}

// 1인 가구 + 자녀수=1 데이터 트랩 방어 검증 (HIDE [ZQ5_1=1] -> ZQ5_2 반드시 '5: 해당사항 없음')
const zqSingleTrap = kbpiRunnerMod.resolveKbpiZqAnswers({
  age: 53,
  education: '고졸 이하',
  job: '자영업',
  householdIncome: '200~399만원',
  maritalStatus: '기타',
  familySize: 1,
  childrenCount: 1
});
if (zqSingleTrap.zq5_1Key !== '1' || zqSingleTrap.zq5_2Key !== '5') {
  throw new Error(`ZQ 1-person household trap guard failed: ${JSON.stringify(zqSingleTrap)}`);
}

const kbpiUiMod = await import('../public/modules/blueprint-kbpi.js');
const kbpiStageEl = elements['blueprint-stage-grid'] || makeEl('blueprint-stage-grid');
elements['blueprint-stage-grid'] = kbpiStageEl;
const mockKbpiDb = [
  {
    seq: 1,
    index: 1,
    finalId: '1',
    uid: '1_1_1_1_1',
    region: '서울',
    surveyDistrict: '노원구',
    surveyDong: '상계1동',
    gender: '남',
    ageGroup: '10대',
    age: 18,
    name: '이상진',
    phone: '010-1234-5678',
    education: '고졸 이하',
    job: '학생',
    householdIncome: '500~599만원',
    maritalStatus: '미혼',
    familySize: 4,
    childrenCount: 0,
    quotaStatus: 'scanned',
    status: '신상등록·스캔완료',
    categoryConfigs: [
      { slot: 1, categoryName: '우유', purchaseExp: '있음' },
      { slot: 2, categoryName: '사이버대학', purchaseExp: '없음' }
    ]
  }
];
kbpiUiMod.renderKmacKbpiBlueprint(
  { surveyType: 'kmac_kbpi', policy: {} },
  {
    campId: 'camp_kmac_kbpi_5911000005645',
    quotaDatabase: mockKbpiDb,
    checkedKbpiSeqs: new Set([1]),
    blueprintStageGrid: kbpiStageEl,
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl
  }
);
const scanGuideEl = elements['kbpi-brand-scan-guide-panel'];
if (
  !scanGuideEl ||
  !scanGuideEl.innerHTML.includes('150명 신상명세 등록 &amp; 브랜드 전수 스캔') ||
  !scanGuideEl.innerHTML.includes('우유') ||
  !scanGuideEl.innerHTML.includes('사이버대학') ||
  scanGuideEl.innerHTML.includes('style=')
) {
  throw new Error('K-BPI Brand Scan Guide UI render or zero-inline-style check failed!');
}

const kbpiTbodyV3 = makeEl('kbpi-tbody-v3');
quotaRenderers.renderKmacKbpiQuotaTable({
  db: mockKbpiDb,
  quotaTableBody: kbpiTbodyV3,
  checkedKbpiSeqs: new Set([1])
});
if (
  !kbpiTbodyV3.innerHTML.includes('노원구 상계1동') ||
  !kbpiTbodyV3.innerHTML.includes('신상등록·스캔완료') ||
  !kbpiTbodyV3.innerHTML.includes('500~599만원') ||
  kbpiTbodyV3.innerHTML.includes('style=')
) {
  throw new Error('K-BPI STEP 1 Quota Table render or zero-inline-style check failed!');
}

const fsMod = await import('fs');
const kbpiQuotaJson = JSON.parse(fsMod.default.readFileSync('data/quotas/quota_kmac_kbpi_5911000005645.json', 'utf8'));
const kbpiRows = kbpiQuotaJson.data || [];
if (kbpiRows.length !== 150) {
  throw new Error(`Expected 150 K-BPI rows, got ${kbpiRows.length}`);
}
const missingDemo = kbpiRows.filter(r => !r.education || !r.job || !r.householdIncome || !r.maritalStatus || !r.familySize || !r.surveyDistrict || !r.surveyDong);
if (missingDemo.length > 0) {
  throw new Error(`Found ${missingDemo.length} K-BPI rows missing enriched demographics/district!`);
}

// K-BPI v3.1 중복 브랜드 원천 차단 & 동일 명칭 산업군(key=36/35) 분리 검증
const distinctMilk = kbpiRunnerMod.selectDistinctKbpiBrands([
  '서울우유 나 100% 저지방우유',
  '서울우유 나100%',
  '서울우유',
  '매일우유 오리지널',
  '매일 소화가 잘되는 우유',
  '남양 맛있는우유GT',
  '연세우유',
  '파스퇴르 후레쉬우유'
], 4);
if (
  distinctMilk.length !== 4 ||
  distinctMilk.filter(b => b.includes('서울우유')).length !== 1 ||
  distinctMilk.filter(b => b.includes('매일')).length !== 1
) {
  throw new Error(`selectDistinctKbpiBrands root-dedup failed: ${JSON.stringify(distinctMilk)}`);
}

const distinctNgoSlot2 = kbpiRunnerMod.selectDistinctKbpiBrands(
  ['월드비전', '굿네이버스', '초록우산 어린이재단', '유니세프', '세이브더칠드런'],
  3,
  new Set([kbpiRunnerMod.normalizeKbpiBrandKey('월드비전')]),
  new Set([kbpiRunnerMod.extractKbpiBrandRoot('월드비전')])
);
if (distinctNgoSlot2.includes('월드비전') || distinctNgoSlot2.length !== 3) {
  throw new Error(`selectDistinctKbpiBrands cross-slot rotation failed: ${JSON.stringify(distinctNgoSlot2)}`);
}

const expMilk = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '우유',
  industryKey: '55',
  categoryConfigs: [
    { slot: 1, categoryName: '가공우유', industryKey: '56', purchaseExp: '없음' },
    { slot: 6, categoryName: '우유', industryKey: '55', purchaseExp: '있음' }
  ]
});
const expFlavoredMilk = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '가공우유',
  industryKey: '56',
  categoryConfigs: [
    { slot: 1, categoryName: '가공우유', industryKey: '56', purchaseExp: '없음' },
    { slot: 6, categoryName: '우유', industryKey: '55', purchaseExp: '있음' }
  ]
});
const expNgo35 = kbpiRunnerMod.decideCategoryPurchaseExp({
  categoryName: '구호개발단체(NGO)',
  industryKey: '35',
  slotIndex: 7,
  categoryConfigs: [
    { slot: 6, categoryName: '구호개발단체(NGO)', industryKey: '36', purchaseExp: '있음' },
    { slot: 7, categoryName: '구호개발단체(NGO)', industryKey: '35', purchaseExp: '없음' }
  ]
});
if (expMilk !== '있음' || expFlavoredMilk !== '없음' || expNgo35 !== '없음') {
  throw new Error(`decideCategoryPurchaseExp isolation failed: milk=${expMilk}, flavored=${expFlavoredMilk}, ngo35=${expNgo35}`);
}

// HRC 에너지총조사 10계정(문선영-701492, 최미자-700550 72건, 김재순-701495 38건, 정소영-701497 39건 전화번호 필터링) & 문화및집회시설 천장고 검증
const hrcRunnerMod = await import('../src/engine/hrc-energy-runner.js');
const hrc701492 = JSON.parse(fsMod.default.readFileSync('data/quotas/quota_hrc_energy_2025_701492_문선영_전체478개_선정74개.json', 'utf8'));
const hrc700550 = JSON.parse(fsMod.default.readFileSync('data/quotas/quota_hrc_energy_2025_700550_최미자_전체72개_선정72개.json', 'utf8'));
const hrc701495 = JSON.parse(fsMod.default.readFileSync('data/quotas/quota_hrc_energy_2025_701495_김재순_전체38개_선정38개.json', 'utf8'));
const hrc701497 = JSON.parse(fsMod.default.readFileSync('data/quotas/quota_hrc_energy_2025_701497_정소영_전체39개_선정39개.json', 'utf8'));
if ((hrc701492.data || []).length !== 478 || hrc701492.selectedCount !== 74) {
  throw new Error(`HRC 701492 quota count mismatch: total=${(hrc701492.data || []).length}, selected=${hrc701492.selectedCount}`);
}
if ((hrc700550.data || []).length !== 72 || (hrc700550.data || []).some(r => !r.phone || !r.contactName)) {
  throw new Error(`HRC 700550 phone-filtered quota mismatch: total=${(hrc700550.data || []).length}`);
}
if ((hrc701495.data || []).length !== 38 || (hrc701495.data || []).some(r => !r.phone || !r.contactName || r.sido !== '경기')) {
  throw new Error(`HRC 701495 phone-filtered quota mismatch: total=${(hrc701495.data || []).length}`);
}
if ((hrc701497.data || []).length !== 39 || (hrc701497.data || []).some(r => !r.phone || !r.contactName || r.sido !== '서울')) {
  throw new Error(`HRC 701497 phone-filtered quota mismatch: total=${(hrc701497.data || []).length}`);
}

const ceilGen = await hrcRunnerMod.resolveHrcBuildingCeilingHeightM({
  slotData: { uid: '800004', mainUse: '제1종근린생활시설', buildingName: '' }
});
const ceilSonje = await hrcRunnerMod.resolveHrcBuildingCeilingHeightM({
  slotData: { uid: '802027', mainUse: '문화및집회시설', buildingName: '선재서울미술관' }
});
const ceilKmca = await hrcRunnerMod.resolveHrcBuildingCeilingHeightM({
  slotData: { uid: '802089', mainUse: '문화및집회시설', buildingName: 'KMCA미술관' }
});
const ceilUnnamedCultural = await hrcRunnerMod.resolveHrcBuildingCeilingHeightM({
  slotData: { uid: '802038', mainUse: '문화및집회시설', buildingName: '' },
  grossAreaM2: 4000
});
if (
  parseFloat(ceilGen.value) < 2.6 || parseFloat(ceilGen.value) > 3.0 ||
  ceilSonje.value !== '3.9' ||
  ceilKmca.value !== '5.0' ||
  parseFloat(ceilUnnamedCultural.value) <= 3.0
) {
  throw new Error(`HRC ceiling height rule failed: gen=${ceilGen.value}, sonje=${ceilSonje.value}, kmca=${ceilKmca.value}, unnamedCultural=${ceilUnnamedCultural.value}`);
}

console.log('✅ [4/4] K-BPI v3.1 & 에너지총조사(10계정 통합 DB: 700550·701495·701497 반영, 문화시설 천장고 검색/추정) 100% 통과');

// 5. 통합 응답자 페르소나 마스터 DB (1,138명: 이름·성별·나이) 및 배정 유틸 검증
const respPoolMod = await import('../src/utils/respondent-pool.js');
const personaMod = await import('../src/ai/persona.js');
const decisionMod = await import('../src/ai/decision.js');

const poolStats = respPoolMod.getRespondentPoolStats();
if (poolStats.totalCount < 1100 || poolStats.maleCount < 600 || poolStats.femaleCount < 400) {
  throw new Error(`Respondent pool stats mismatch: ${JSON.stringify(poolStats)}`);
}

const sampleBatch = respPoolMod.allocateRespondentsForQuotaList([
  { seq: 1, ceoName: '응답자_6001', gender: '남', age: 15, schoolGrade: '중' },
  { seq: 2, name: '', gender: '여', ageGroup: '20대' },
  { seq: 3, companyName: '테스트상회', bizNumber: '123-45-67890', openDate: '2015-03-01', ceoName: '점포주' },
  { seq: 4, name: '정귀영', gender: '남', age: 60 } // 기존 실측 데이터 보존 검증
]);

if (
  sampleBatch[0].ceoName === '응답자_6001' || sampleBatch[0].age !== 15 || sampleBatch[0].gender !== '남' ||
  !sampleBatch[1].name || sampleBatch[1].gender !== '여' || sampleBatch[1].age < 20 || sampleBatch[1].age > 29 ||
  sampleBatch[2].ceoName === '점포주' || sampleBatch[2].ceoAge < 34 ||
  sampleBatch[3].name !== '정귀영' || sampleBatch[3].age !== 60
) {
  throw new Error(`allocateRespondentsForQuotaList validation failed: ${JSON.stringify(sampleBatch)}`);
}

const pIter1 = personaMod.generatePersona({ gender: '여', ageGroup: '30대' }, 1);
const genderChoice = decisionMod.decideChoices({
  questionTitle: '귀하의 성별을 선택해 주세요.',
  options: ['1. 남', '2. 여'],
  persona: pIter1
});
const ageChoice = decisionMod.decideChoices({
  questionTitle: '귀하의 연령대를 선택해 주세요.',
  options: ['20~29세', '30~39세', '40~49세'],
  persona: pIter1
});
if (pIter1.genderCode !== '여' || pIter1.ageNum < 30 || pIter1.ageNum > 39 || genderChoice[0] !== 1 || ageChoice[0] !== 1) {
  throw new Error(`Persona/Decision integration failed: persona=${JSON.stringify(pIter1)}, g=${genderChoice}, a=${ageChoice}`);
}

console.log(`✅ [추가 검증] 통합 응답자 마스터 DB(${poolStats.totalCount}명) 조회·배정·페르소나 연동 100% 통과`);




