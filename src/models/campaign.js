/**
 * 설문 캠페인 및 조사 쿼터 DB 관리 모델 (Campaign Store)
 * data/campaigns.json 파일에 설문 캠페인과 수집된 실존 사업자 DB를 영구 저장합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const dataDir = path.join(rootDir, 'data');
const campaignsFile = path.join(dataDir, 'campaigns.json');

// data 디렉터리 및 파일 초기화 (AGENTS.md 제2원칙: 거짓/더미 캠페인 생성 금지)
function initStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(campaignsFile)) {
    writeJsonAtomicSync(campaignsFile, []);
  }
}

initStore();

let cachedCampaigns = null;
let lastLoadedMtimeMs = 0;

function flushCacheToDisk(campaigns) {
  cachedCampaigns = campaigns;
  writeJsonAtomicSync(campaignsFile, campaigns);
  try {
    lastLoadedMtimeMs = fs.statSync(campaignsFile).mtimeMs;
  } catch (err) {
    console.warn('[CampaignStore] mtime 갱신 경고:', err.message);
  }
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
  const isGallupReturnFarm = (data.surveyType === 'gallup_return_farm');
  const isGallupAgriwork = (data.surveyType === 'gallup_agriwork');
  const isGenericB2c = (data.surveyType === 'generic_b2c' || data.quotaType === 'b2c');

  let defaultGallupAgriworkPolicy = null;
  if (isGallupAgriwork) {
    const agriBpPath = path.join(dataDir, 'gallup_agriwork_blueprint.json');
    if (fs.existsSync(agriBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(agriBpPath, 'utf-8'));
        defaultGallupAgriworkPolicy = bp.defaultPolicy || {};
      } catch (err) {
        console.warn('[CampaignStore] 농업고용인력 블루프린트 로드 경고:', err.message);
      }
    }
  }

  let defaultAssocPolicy = null;
  if (isAssoc) {
    const assocBpPath = path.join(dataDir, 'kstat_assoc_blueprint.json');
    if (fs.existsSync(assocBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(assocBpPath, 'utf-8'));
        defaultAssocPolicy = bp.defaultPolicy;
      } catch (err) {
        console.warn('[CampaignStore] 상인회 블루프린트 로드 경고:', err.message);
      }
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
      } catch (err) {
        console.warn('[CampaignStore] 메트릭스 블루프린트 로드 경고:', err.message);
      }
    }
  }

  let defaultKonaPolicy = null;
  if (isKona) {
    const konaBpPath = path.join(dataDir, 'kona_youth_blueprint.json');
    if (fs.existsSync(konaBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(konaBpPath, 'utf-8'));
        defaultKonaPolicy = bp.defaultPolicy;
      } catch (err) {
        console.warn('[CampaignStore] 코나체인 블루프린트 로드 경고:', err.message);
      }
    }
  }

  let defaultHrcEnergyPolicy = null;
  if (isHrcEnergy) {
    const hrcBpPath = path.join(dataDir, 'hrc_energy_blueprint.json');
    if (fs.existsSync(hrcBpPath)) {
      try {
        const bp = JSON.parse(fs.readFileSync(hrcBpPath, 'utf-8'));
        defaultHrcEnergyPolicy = bp.defaultPolicy;
      } catch (err) {
        console.warn('[CampaignStore] 에너지총조사 블루프린트 로드 경고:', err.message);
      }
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
      } catch (err) {
        console.warn('[CampaignStore] 성인문해능력조사 블루프린트 로드 경고:', err.message);
      }
    }
  }

  const resolvedSurveyType = data.surveyType || (data.quotaType === 'b2c' ? 'generic_b2c' : 'kstat_store');
  const resolvedQuotaType = data.quotaType || (
    isGallupReturnFarm || isGlobalriLiteracy || isKona || isGenericB2c
      ? 'b2c'
      : (isGallupAgriwork || isAssoc || isMetrix || isMetrixSeoul || isHrcEnergy || resolvedSurveyType === 'kstat_store' ? 'b2b' : 'b2c')
  );

  const defaultSurveyUrl = isGallupAgriwork
    ? 'https://agriwork.gallup.co.kr/survey/login.asp'
    : (isGallupReturnFarm
      ? 'https://www.gallup.co.kr'
      : (isMetrixSeoul
        ? 'https://metrix.svybx.kr/sp7/S21401by41s3/mlist.asp'
        : (isGlobalriLiteracy
          ? 'https://gift.globalri.it/login'
          : (isHrcEnergy
            ? 'https://tapi.hrcglobal.com/Home/Login'
            : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : '')))));

  const newCampaign = {
    id: data.id || ('camp_' + Date.now()),
    title: data.title || (
      isGallupAgriwork
        ? '[한국갤럽] 2025년 기준 농업고용인력 실태조사 (양주 안재은 · 동두천 김미경)'
        : (isGallupReturnFarm
          ? '[한국갤럽 20263603] 2026년 귀농귀촌 실태조사(귀농)'
          : (isMetrixSeoul
            ? '[메트릭스] (신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)'
            : (isGlobalriLiteracy
              ? '[GR20260618-1-001-02] 제5차 성인문해능력조사'
              : (isHrcEnergy
                ? '2025년 기준 에너지총조사 (건물 부문)'
                : (isKona
                  ? '2026 화성특례시 만족도 청소년 설문조사'
                  : (isMetrix
                    ? '2026 메트릭스 경기도 소상공인 패널조사'
                    : (isAssoc ? '2026 상인회 조사 캠페인' : '새로운 설문조사 캠페인')))))))
    ),
    description: data.description || '',
    quotaType: resolvedQuotaType,
    surveyType: resolvedSurveyType, // 'kstat_store' | 'kstat_assoc' | 'metrix_panel' | 'metrix_seoul_panel' | 'kona_youth' | 'hrc_energy' | 'globalri_literacy' | 'gallup_return_farm' | 'gallup_agriwork' | 'generic_b2c'
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quotaConfig: data.quotaConfig || {
      b2bKeyword: '소프트웨어',
      targetCount: 1,
      selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
    },
    quotaDatabase: data.quotaDatabase || [],
    guidelineConfig: data.guidelineConfig ? {
      surveyUrl: defaultSurveyUrl,
      topic: '',
      positiveRatio: 70,
      neutralRatio: 20,
      negativeRatio: 10,
      textGuidelines: '',
      iterations: 1,
      headless: true,
      ...data.guidelineConfig,
      ...(data.guidelineConfig.surveyUrl ? { surveyUrl: data.guidelineConfig.surveyUrl } : { surveyUrl: defaultSurveyUrl })
    } : {
      surveyUrl: defaultSurveyUrl,
      topic: '',
      positiveRatio: 70,
      neutralRatio: 20,
      negativeRatio: 10,
      textGuidelines: '',
      iterations: 1,
      headless: true
    },
    results: [],
    ...(data.kstatLoginId ? { kstatLoginId: data.kstatLoginId } : {}),
    ...(data.kstatLoginPw ? { kstatLoginPw: data.kstatLoginPw } : {}),
    ...(data.kstatListUrl ? { kstatListUrl: data.kstatListUrl } : {}),
    ...(data.snum ? { snum: data.snum } : {}),
    ...(data.accounts ? { accounts: data.accounts } : {}),
    ...(data.sparePhones ? { sparePhones: data.sparePhones } : {}),
    ...(data.masterBaseline ? { masterBaseline: data.masterBaseline } : {}),
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
      ...(data.googleSheetUrl ? { googleSheetUrl: data.googleSheetUrl } : {}),
      ...(data.quotaSourceFile ? { quotaSourceFile: data.quotaSourceFile } : {}),
      metrixPolicy: {
        ...(defaultMetrixPolicy || {}),
        ...(data.metrixPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isKona ? {
      konaPolicy: {
        preserveExistingInputs: true,
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
    } : {}),
    ...(isGallupReturnFarm ? {
      loginId: data.loginId || '076_000009',
      surveyorName: data.surveyorName || '백영자',
      googleSheetUrl: data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1Hoai6ggQWxNVTW5SyxEsvpNtMOlBO1z_ThmM6cZ6gRg/edit?gid=1470110969#gid=1470110969',
      quotaSourceFile: data.quotaSourceFile || 'quota_gallup_20263603_hongcheon.json',
      gallupReturnFarmPolicy: {
        stopBeforeFinalSubmit: true,
        preserveExistingInputs: true,
        ...(data.gallupReturnFarmPolicy || {})
      },
      hasMasterBlueprint: true
    } : {}),
    ...(isGallupAgriwork ? {
      loginId: data.loginId || '40878,47837',
      surveyorName: data.surveyorName || '안재은·김미경',
      googleSheetUrl: data.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1ONQZjGIa2xIopaMbYS-27B_DMHBH8MlOK7tdDTC6Gz0/edit?gid=481207785#gid=481207785',
      quotaSourceFile: data.quotaSourceFile || 'quota_gallup_agriwork_2025.json',
      gallupAgriworkPolicy: {
        preserveExistingInputs: true,
        preserveExistingSignatures: true,
        skipCompletedSlots: true,
        defaultBlankWorkerType: '3',
        submitComplete: true,
        safetyGuard: false,
        shortageMode: 'none',
        tabletNo: '',
        ...(defaultGallupAgriworkPolicy || {}),
        ...(data.gallupAgriworkPolicy || {})
      },
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
