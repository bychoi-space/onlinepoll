/**
 * 설문 캠페인 및 조사 쿼터 DB 관리 모델 (Campaign Store)
 * data/campaigns.json 파일에 설문 캠페인과 수집된 실존 사업자 DB를 영구 저장합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const dataDir = path.join(rootDir, 'data');
const campaignsFile = path.join(dataDir, 'campaigns.json');

// data 디렉터리 및 파일 초기화
function initStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(campaignsFile)) {
    // 기본 샘플 캠페인 1개 포함하여 초기화
    const initialData = [
      {
        id: 'camp_' + Date.now(),
        title: '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 실태조사',
        description: '국내 소프트웨어 개발 기업 대상 경영 현황 및 규제 개선 건의 설문',
        quotaType: 'b2b', // 'b2c' | 'b2b'
        status: 'ready', // 'ready' | 'building' | 'running' | 'completed'
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        quotaConfig: {
          b2bKeyword: '소프트웨어',
          targetCount: 2,
          selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
        },
        quotaDatabase: [], // MarketBz에서 수집된 실제 사업자 객체 배열
        guidelineConfig: {
          surveyUrl: 'http://localhost:3000/mock-survey-b2b.html',
          topic: '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 지원 설문',
          positiveRatio: 70,
          neutralRatio: 20,
          negativeRatio: 10,
          textGuidelines: '클라우드 인프라 지원과 R&D 세액 공제 확대가 절실하다는 의견',
          iterations: 1,
          headless: true
        },
        results: []
      }
    ];
    fs.writeFileSync(campaignsFile, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

initStore();

let cachedCampaigns = null;
let lastLoadedMtimeMs = 0;

function flushCacheToDisk(campaigns) {
  cachedCampaigns = campaigns;
  const tmpFile = `${campaignsFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(campaigns, null, 2), 'utf-8');
  fs.renameSync(tmpFile, campaignsFile);
  try {
    lastLoadedMtimeMs = fs.statSync(campaignsFile).mtimeMs;
  } catch (_) {}
}

/**
 * 전체 캠페인 목록 조회
 */
export function getAllCampaigns() {
  initStore();
  try {
    const stat = fs.statSync(campaignsFile);
    if (cachedCampaigns && stat.mtimeMs === lastLoadedMtimeMs) {
      return cachedCampaigns;
    }
    const content = fs.readFileSync(campaignsFile, 'utf-8');
    cachedCampaigns = JSON.parse(content || '[]');
    lastLoadedMtimeMs = stat.mtimeMs;
    return cachedCampaigns;
  } catch (err) {
    console.error('[CampaignStore] 읽기 실패:', err);
    return cachedCampaigns || [];
  }
}

/**
 * 특정 캠페인 상세 조회
 */
export function getCampaignById(id) {
  const campaigns = getAllCampaigns();
  return campaigns.find(c => c.id === id) || null;
}

/**
 * 새 캠페인 생성
 */
export function createCampaign(data = {}) {
  const campaigns = getAllCampaigns();
  const isAssoc = (data.surveyType === 'kstat_assoc');
  const isMetrix = (data.surveyType === 'metrix_panel');
  const isMetrixSeoul = (data.surveyType === 'metrix_seoul_panel');
  const isKona = (data.surveyType === 'kona_youth');
  const isHrcEnergy = (data.surveyType === 'hrc_energy');
  const isGlobalriLiteracy = (data.surveyType === 'globalri_literacy');

  let defaultAssocPolicy = null;
  if (isAssoc) {
    const assocBpPath = path.join(dataDir, 'kstat_assoc_blueprint.json');
    if (fs.existsSync(assocBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(assocBpPath, 'utf-8'));
        defaultAssocPolicy = bp.defaultPolicy;
      } catch (_) {}
    }
    if (!defaultAssocPolicy) {
      defaultAssocPolicy = {
        preserveExistingInputs: true,
        skipCompletedSlots: true,
        eval_H1_1_cleanliness: 4,
        eval_H1_2_entrance: 4,
        eval_H1_3_parking: 3,
        eval_H1_4_floor: 4,
        eval_H1_jitter: true,
        eval_H2_1_specialStreet: '2',
        eval_H2_1_customText: '먹거리 및 패션 특화골목',
        eval_H2_2_specialProduct: '2',
        eval_H2_2_customText: '지역 대표 먹거리 및 신선식품',
        eval_H2_3_brandMark: '2',
        eval_H2_3_customText: '',
        eval_H2_4_brandUsage: '2',
        eval_H2_4_customText: ''
      };
    }
  }

  let defaultMetrixPolicy = null;
  if (isMetrix) {
    const metrixBpPath = path.join(dataDir, 'metrix_survey_blueprint.json');
    if (fs.existsSync(metrixBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(metrixBpPath, 'utf-8'));
        defaultMetrixPolicy = bp.defaultPolicy;
      } catch (_) {}
    }
  }

  let defaultKonaPolicy = null;
  if (isKona) {
    const konaBpPath = path.join(dataDir, 'kona_youth_blueprint.json');
    if (fs.existsSync(konaBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(konaBpPath, 'utf-8'));
        defaultKonaPolicy = bp.defaultPolicy;
      } catch (_) {}
    }
  }

  let defaultHrcEnergyPolicy = null;
  if (isHrcEnergy) {
    const hrcBpPath = path.join(dataDir, 'hrc_energy_blueprint.json');
    if (fs.existsSync(hrcBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(hrcBpPath, 'utf-8'));
        defaultHrcEnergyPolicy = bp.defaultPolicy;
      } catch (_) {}
    }
  }

  let defaultGlobalriPolicy = null;
  let defaultAgeGroupBaselines = null;
  if (isGlobalriLiteracy) {
    const globalriBpPath = path.join(dataDir, 'globalri_literacy_blueprint.json');
    if (fs.existsSync(globalriBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(globalriBpPath, 'utf-8'));
        defaultGlobalriPolicy = bp.defaultPolicy || {};
        defaultAgeGroupBaselines = bp.defaultAgeGroupBaselines || (bp.defaultPolicy && bp.defaultPolicy.ageGroups) || {};
      } catch (_) {}
    }
  }

  const newCampaign = {
    id: data.id || ('camp_' + Date.now()),
    title: data.title || (isMetrixSeoul ? '[메트릭스] (신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)' : (isGlobalriLiteracy ? '[GR20260618-1-001-02] 제5차 성인문해능력조사' : (isHrcEnergy ? '2025년 기준 에너지총조사 (건물 부문)' : (isKona ? '2026 화성특례시 만족도 청소년 설문조사' : (isMetrix ? '2026 메트릭스 경기도 소상공인 패널조사' : (isAssoc ? '2026 상인회 조사 캠페인' : '새로운 설문조사 캠페인')))))),
    description: data.description || '',
    quotaType: data.quotaType || (isAssoc || isMetrix || isMetrixSeoul || isHrcEnergy ? 'b2b' : 'b2c'),
    surveyType: data.surveyType || 'kstat_store', // 'kstat_store' | 'kstat_assoc' | 'metrix_panel' | 'metrix_seoul_panel' | 'kona_youth' | 'hrc_energy' | 'globalri_literacy'
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quotaConfig: data.quotaConfig || {
      b2bKeyword: '소프트웨어',
      targetCount: 1,
      selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
    },
    quotaDatabase: data.quotaDatabase || [],
    guidelineConfig: data.guidelineConfig || {
      surveyUrl: isMetrixSeoul ? 'https://metrix.svybx.kr/sp7/S21401by41s3/mlist.asp' : (isGlobalriLiteracy ? 'https://gift.globalri.it/login' : (isHrcEnergy ? 'https://tapi.hrcglobal.com/Home/Login' : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : ''))),
      topic: '',
      positiveRatio: 70,
      neutralRatio: 20,
      negativeRatio: 10,
      textGuidelines: '',
      iterations: 1,
      headless: true
    },
    results: [],
    ...(isMetrixSeoul ? {
      accountKeys: data.accountKeys || ['2010', '2016'],
      googleSheetUrl: data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=506086780#gid=506086780',
      quotaSourceFile: data.quotaSourceFile || 'quota_metrix_seoul_panel_163.json',
      surveyBlueprintPolicy: {
        preserveExistingInputs: true,
        haltBeforeFinalSubmit: true,
        B8: '2',
        M1_ranks: ['6', '12', '5'],
        M2_ranks: ['2', '3'],
        M3_ranks: ['5', '2', '7'],
        N1_1: '2',
        N1_2: '3',
        N1_3: '2',
        N1_4: '4',
        N1_6: '3',
        N1_7: '4',
        N2_1_1: '2',
        N2_1_2: '3',
        N2_2_1: '2',
        N2_2_2: '3',
        N2_3_1: '3',
        N2_3_2: '4',
        N3_ranks: ['1', '2'],
        N4: '2',
        N5: '3',
        N6: '1',
        N6_1_1: '2',
        N6_1_2: '1',
        N6_1_3: '2',
        O1: '1',
        ...(data.surveyBlueprintPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isAssoc ? {
      assocPolicy: {
        ...(defaultAssocPolicy || {}),
        ...(data.assocPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isMetrix ? {
      metrixPolicy: {
        ...(defaultMetrixPolicy || {}),
        ...(data.metrixPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isKona ? {
      konaPolicy: {
        ...(defaultKonaPolicy || {}),
        ...(data.konaPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isHrcEnergy ? {
      loginId: data.loginId || '700275',
      loginPw: data.loginPw || data.loginId || '700275',
      surveyorName: data.surveyorName || '강영미',
      quotaSourceFile: data.quotaSourceFile || '',
      hrcEnergyPolicy: {
        ...(defaultHrcEnergyPolicy || {}),
        ...(data.hrcEnergyPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isGlobalriLiteracy ? {
      loginId: data.loginId || '01071447791',
      loginPw: data.loginPw || '2038020',
      surveyorName: data.surveyorName || '노영미7791',
      projectCode: data.projectCode || 'GR20260618-1-001-02',
      quotaSourceFile: data.quotaSourceFile || 'quota_globalri_adult_literacy_7791.json',
      globalriPolicy: {
        ...(defaultGlobalriPolicy || {}),
        ...(data.globalriPolicy || {})
      },
      ageGroupBaselines: data.ageGroupBaselines || defaultAgeGroupBaselines || {},
      hasMasterBlueprint: true
    } : {})
  };

  campaigns.unshift(newCampaign);
  flushCacheToDisk(campaigns);
  return newCampaign;
}

/**
 * 캠페인 정보 업데이트
 */
export function updateCampaign(id, updateData = {}) {
  const campaigns = getAllCampaigns();
  const index = campaigns.findIndex(c => c.id === id);
  if (index === -1) return null;

  const prev = campaigns[index];
  const nowIso = new Date().toISOString();
  let completedAt = prev.completedAt;
  if (updateData.completedAt !== undefined) {
    completedAt = updateData.completedAt;
  } else if (updateData.status === 'completed' && prev.status !== 'completed') {
    completedAt = nowIso;
  }

  campaigns[index] = {
    ...prev,
    ...updateData,
    ...(completedAt ? { completedAt } : {}),
    updatedAt: nowIso
  };

  flushCacheToDisk(campaigns);
  return campaigns[index];
}

/**
 * 캠페인 삭제
 */
export function deleteCampaign(id) {
  const campaigns = getAllCampaigns();
  const filtered = campaigns.filter(c => c.id !== id);
  flushCacheToDisk(filtered);
  return true;
}
