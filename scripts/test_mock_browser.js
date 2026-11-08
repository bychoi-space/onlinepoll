/**
 * scripts/test_mock_browser.js
 * 프론트엔드(survey-detail.js + public/modules/*.js) 및 백엔드 분리 모듈 정적/동적 실행 검증 스크립트
 */
import { execSync } from 'child_process';

// 1. 정적 구문 검사 (node --check)
const filesToCheck = [
  'public/survey-detail.js',
  'public/modules/blueprint-utils.js',
  'public/modules/blueprint-metrix.js',
  'public/modules/blueprint-assoc.js',
  'public/modules/blueprint-globalri.js',
  'public/modules/blueprint-gallup-hrc-kona.js',
  'public/modules/blueprint-kstat-store.js',
  'public/modules/quota-table-renderers.js',
  'src/server.js',
  'src/config/campaign-seeders.js',
  'src/routes/quota-routes.js'
];

for (const file of filesToCheck) {
  execSync(`node --check "${file}"`, { stdio: 'inherit' });
}
console.log(`✅ [1/3] 정적 구문 검사(node --check) ${filesToCheck.length}개 파일 100% 통과`);

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
  search: '?id=camp_gallup_return_farm_20263603',
  href: 'http://localhost:3000/survey-detail.html?id=camp_gallup_return_farm_20263603',
  origin: 'http://localhost:3000'
};
globalThis.alert = (msg) => console.log('[MOCK ALERT]', msg);
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
        surveyType: 'gallup_return_farm',
        isGallupReturnFarm: true,
        policy: { stopBeforeFinalSubmit: true, diversifySignatureStyle: true },
        blueprint: { stages: [] }
      })
    };
  }
  if (u.startsWith('/api/campaigns/')) {
    return {
      ok: true,
      json: async () => ({
        id: 'camp_gallup_return_farm_20263603',
        title: '2026년 귀농귀촌 실태조사(귀농) - 강원 홍천군/철원군 (68명)',
        surveyType: 'gallup_return_farm',
        status: 'ready',
        targetSampleCount: 68,
        quotaDatabase: [
          {
            seq: 68,
            slotNo: 68,
            sampleId: '105036',
            sampleType: '대체표본',
            moveYear: '2021',
            name: '이정우',
            age: 43,
            sido: '강원특별자치도',
            sigungu: '철원군',
            address: '강원특별자치도 철원군 근남면 하오재로 1680',
            phone: '010-2086-7682',
            surveyCompleted: true,
            surveyStatusText: '진행중(제출직전 대기)',
            giftSigned: true,
            signatureStyleIdx: 0
          }
        ],
        guidelineConfig: {
          surveyUrl: 'https://rs.gallup.co.kr/webApp/response/ResponseIdStart_20263603.asp',
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
metrixMod.renderMetrixBlueprint(
  { blueprint: { stages: [{ step: 'SQ', title: '가구원 기본정보', fields: [] }] }, baseline: {} },
  {
    getCurrentBaselineData: () => ({}),
    setCurrentBaselineData: () => {},
    badgeMasterStatus: badgeEl,
    btnSaveBaseline: saveBtnEl,
    blueprintStageGrid: container
  }
);
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

// survey-detail.js 메인 컨트롤러 임포트 및 초기화 실행
await import('../public/survey-detail.js');
await new Promise((r) => setTimeout(r, 80));

if (!elements['detail-campaign-title']?.textContent.includes('2026년 귀농귀촌 실태조사')) {
  throw new Error(`Expected campaign title to load, got: ${elements['detail-campaign-title']?.textContent}`);
}

console.log('✅ [2/3] 프론트엔드 7대 분리 모듈 + survey-detail.js 모의 DOM 렌더링 검증 통과');

// 백엔드 분리 모듈 임포트 검증
const seedersMod = await import('../src/config/campaign-seeders.js');
const quotaRoutesMod = await import('../src/routes/quota-routes.js');
if (typeof seedersMod.seedInitialCampaigns !== 'function' || typeof quotaRoutesMod.registerQuotaRoutes !== 'function') {
  throw new Error('Backend module export verification failed');
}
console.log('✅ [3/3] 백엔드 분리 모듈(campaign-seeders.js, quota-routes.js) Export 검증 통과');
