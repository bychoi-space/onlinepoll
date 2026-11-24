/**
 * 조사원 2티어 전용 설문조사 정산 시스템 모델 (Settlement Store)
 * - data/settlements.json 에 1·3티어 거래처(조사원) 장부와 과제별 정산/분배 원장을 원자적으로 영구 저장합니다.
 * - AGENTS.md 제2원칙 및 제5원칙 준수: 거짓/더미 초기 데이터를 생성하지 않으며, 런타임 사용자 데이터를 안전하게 보존합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const defaultDataDir = path.join(rootDir, 'data');
const defaultSettlementFile = path.join(defaultDataDir, 'settlements.json');

let customDbPath = process.env.SETTLEMENT_DB_PATH || null;
let cachedStore = null;
let lastLoadedMtimeMs = 0;

function getStorePath() {
  return customDbPath || defaultSettlementFile;
}

/**
 * 테스트 격리용 DB 경로 지정 헬퍼 (런타임 실제 데이터 오염 방지)
 */
export function setSettlementDbPath(filePath) {
  customDbPath = filePath || null;
  cachedStore = null;
  lastLoadedMtimeMs = 0;
}

function createEmptyStore() {
  return {
    version: 1,
    partners: [],
    projects: []
  };
}

function normalizeNonNegInt(val, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function normalizeSignedInt(val, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function getCurrentKstYearMonth() {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit'
    }).format(new Date());
    return parts.slice(0, 7);
  } catch (_) {
    return new Date().toISOString().slice(0, 7);
  }
}

function initStore() {
  const targetFile = getStorePath();
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(targetFile)) {
    writeJsonAtomicSync(targetFile, createEmptyStore());
  }
}

function loadStore() {
  initStore();
  const targetFile = getStorePath();
  try {
    const stat = fs.statSync(targetFile);
    if (cachedStore && stat.mtimeMs === lastLoadedMtimeMs) {
      return cachedStore;
    }
    const raw = fs.readFileSync(targetFile, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    cachedStore = {
      version: 1,
      partners: Array.isArray(parsed.partners) ? parsed.partners : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : []
    };
    lastLoadedMtimeMs = stat.mtimeMs;
    return cachedStore;
  } catch (err) {
    console.error('[SettlementStore] 파일 로드 실패:', err.message);
    return cachedStore || createEmptyStore();
  }
}

function saveStore(store) {
  const targetFile = getStorePath();
  cachedStore = store;
  writeJsonAtomicSync(targetFile, store);
  try {
    lastLoadedMtimeMs = fs.statSync(targetFile).mtimeMs;
  } catch (err) {
    console.warn('[SettlementStore] mtime 갱신 경고:', err.message);
  }
}

/**
 * AutoSurvey 캠페인 객체에서 정산 연동용 표본/완료 건수를 추출합니다.
 */
export function extractAutoSurveyCampaignStats(campaign) {
  if (!campaign) {
    return {
      campaignId: null,
      title: '',
      surveyType: '',
      status: 'ready',
      targetQuota: 0,
      completedCount: 0,
      waitingBeforeSubmitCount: 0
    };
  }

  const sType = String(campaign.surveyType || '').toLowerCase();
  const list = Array.isArray(campaign.quotaDatabase) ? campaign.quotaDatabase : [];
  const isHrcEnergy = (sType === 'hrc_energy');

  const targetQuota = isHrcEnergy
    ? list.filter(q => q && q.selectionType === '선정').length
    : (list.length > 0 ? list.length : normalizeNonNegInt(campaign.quotaConfig?.targetCount, 0));

  const completedCount = isHrcEnergy
    ? list.filter(q => q && q.selectionType === '선정' && (q.quotaStatus === 'completed' || q.status === '완료')).length
    : list.filter(q =>
      q && (
        q.quotaStatus === 'completed' ||
        q.quotaStatus === 'used' ||
        q.status === '완료' ||
        q.surveyCompleted === true ||
        String(q.serverStatus || '') === '99'
      )
    ).length;

  const waitingBeforeSubmitCount = list.filter(q =>
    q && (
      q.quotaStatus === 'pilot_done' ||
      String(q.status || '').includes('99%') ||
      String(q.status || '').includes('완료직전')
    )
  ).length;

  return {
    campaignId: campaign.id,
    title: campaign.title || '',
    surveyType: campaign.surveyType || '',
    status: campaign.status || 'ready',
    targetQuota,
    completedCount,
    waitingBeforeSubmitCount
  };
}

/**
 * 단일 프로젝트의 정산 금액(1티어 청구액, 3티어 지급액, 2티어 순수익, 미수/미지급금)을 계산합니다.
 */
export function computeProjectFinancials(project, partnersMap = new Map()) {
  const unitPriceIn = normalizeNonNegInt(project.unitPriceIn, 0);
  const defaultUnitPriceOut = normalizeNonNegInt(project.defaultUnitPriceOut, 0);
  const targetQuota = normalizeNonNegInt(project.targetQuota, 0);
  const taxWithholdingIn = Boolean(project.taxWithholdingIn);
  const extraAdjustmentIn = normalizeSignedInt(project.extraAdjustmentIn, 0);

  const myWorkRaw = project.myWork || {};
  const myAssigned = normalizeNonNegInt(myWorkRaw.assignedCount, 0);
  const myCompleted = normalizeNonNegInt(myWorkRaw.completedCount, 0);
  const myApproved = normalizeNonNegInt(myWorkRaw.approvedCount, 0);
  const myAutoSyncApproved = myWorkRaw.autoSyncApproved !== false;

  const rawAllocations = Array.isArray(project.allocations) ? project.allocations : [];
  let tier3AssignedTotal = 0;
  let tier3CompletedTotal = 0;
  let tier3ApprovedTotal = 0;
  let totalGrossPayable = 0;
  let totalTaxOut = 0;
  let totalNetPayable = 0;
  let totalPaidOut = 0;
  let totalUnpaidOut = 0;
  let tier3SpreadGross = 0;

  const enrichedAllocations = rawAllocations.map(alloc => {
    const partner = alloc.partnerId ? partnersMap.get(alloc.partnerId) : null;
    const assignedCount = normalizeNonNegInt(alloc.assignedCount, 0);
    const completedCount = normalizeNonNegInt(alloc.completedCount, 0);
    const approvedCount = normalizeNonNegInt(alloc.approvedCount, 0);
    const unitPriceOut = normalizeNonNegInt(alloc.unitPriceOut, defaultUnitPriceOut);
    const taxWithholdingOut = Boolean(alloc.taxWithholdingOut);
    const extraAdjustmentOut = normalizeSignedInt(alloc.extraAdjustmentOut, 0);

    const grossPayable = approvedCount * unitPriceOut;
    const taxOut = taxWithholdingOut ? Math.floor(grossPayable * 0.033) : 0;
    const netPayable = Math.max(0, grossPayable - taxOut + extraAdjustmentOut);

    const payoutStatus = ['unpaid', 'partial', 'paid'].includes(alloc.payoutStatus)
      ? alloc.payoutStatus
      : 'unpaid';

    const effectivePaid = payoutStatus === 'paid'
      ? netPayable
      : (payoutStatus === 'partial' ? Math.min(netPayable, normalizeNonNegInt(alloc.paidAmount, 0)) : 0);

    const unpaidBalance = payoutStatus === 'paid'
      ? 0
      : Math.max(0, netPayable - effectivePaid);

    const spreadPerUnit = unitPriceIn - unitPriceOut;
    const spreadMarginGross = approvedCount * spreadPerUnit;

    tier3AssignedTotal += assignedCount;
    tier3CompletedTotal += completedCount;
    tier3ApprovedTotal += approvedCount;
    totalGrossPayable += grossPayable;
    totalTaxOut += taxOut;
    totalNetPayable += netPayable;
    totalPaidOut += effectivePaid;
    totalUnpaidOut += unpaidBalance;
    tier3SpreadGross += spreadMarginGross;

    return {
      ...alloc,
      partnerName: partner?.name || alloc.partnerName || '미지정 조사원',
      partnerPhone: partner?.phone || alloc.partnerPhone || '',
      bankName: partner?.bankName || alloc.bankName || '',
      accountNumber: partner?.accountNumber || alloc.accountNumber || '',
      accountHolder: partner?.accountHolder || partner?.name || alloc.partnerName || '',
      assignedCount,
      completedCount,
      approvedCount,
      autoSyncApproved: alloc.autoSyncApproved !== false,
      unitPriceOut,
      taxWithholdingOut,
      extraAdjustmentOut,
      payoutStatus,
      paidAmount: effectivePaid,
      grossPayable,
      taxOut,
      netPayable,
      unpaidBalance,
      spreadPerUnit,
      spreadMarginGross
    };
  });

  const totalAssignedCount = myAssigned + tier3AssignedTotal;
  const totalCompletedCount = myCompleted + tier3CompletedTotal;
  const totalApprovedCount = myApproved + tier3ApprovedTotal;
  const unassignedQuota = Math.max(0, targetQuota - totalAssignedCount);

  const grossReceivable = totalApprovedCount * unitPriceIn;
  const taxIn = taxWithholdingIn ? Math.floor(grossReceivable * 0.033) : 0;
  const netReceivable = Math.max(0, grossReceivable - taxIn + extraAdjustmentIn);

  const inflowStatus = ['pending', 'billed', 'received'].includes(project.inflowStatus)
    ? project.inflowStatus
    : 'pending';

  const uncollectedIn = inflowStatus === 'received' ? 0 : netReceivable;
  const myDirectGross = myApproved * unitPriceIn;
  const myNetProfit = netReceivable - totalNetPayable;
  const unitMargin = unitPriceIn - defaultUnitPriceOut;

  const tier1Partner = project.tier1PartnerId ? partnersMap.get(project.tier1PartnerId) : null;

  return {
    ...project,
    tier1PartnerName: tier1Partner?.name || project.tier1PartnerName || '',
    unitPriceIn,
    defaultUnitPriceOut,
    unitMargin,
    targetQuota,
    taxWithholdingIn,
    extraAdjustmentIn,
    inflowStatus,
    myWork: {
      assignedCount: myAssigned,
      completedCount: myCompleted,
      approvedCount: myApproved,
      autoSyncApproved: myAutoSyncApproved
    },
    allocations: enrichedAllocations,
    metrics: {
      unitMargin,
      myAssigned,
      myCompleted,
      myApproved,
      tier3AssignedTotal,
      tier3CompletedTotal,
      tier3ApprovedTotal,
      totalAssignedCount,
      totalCompletedCount,
      totalApprovedCount,
      unassignedQuota,
      grossReceivable,
      taxIn,
      netReceivable,
      uncollectedIn,
      totalGrossPayable,
      totalTaxOut,
      totalNetPayable,
      totalPaidOut,
      totalUnpaidOut,
      myDirectGross,
      tier3SpreadGross,
      myNetProfit,
      isFullySettled: inflowStatus === 'received' && totalUnpaidOut === 0 && totalApprovedCount > 0
    }
  };
}

// ============================================================================
// 거래처 / 조사원 (Partner: 1티어 발주처 & 3티어 조사원) CRUD
// ============================================================================

export function getAllPartners() {
  return loadStore().partners;
}

export function getPartnerById(id) {
  return loadStore().partners.find(p => p.id === id) || null;
}

export function createPartner(data = {}) {
  const store = loadStore();
  const name = String(data.name || '').trim();
  if (!name) {
    throw new Error('이름(또는 거래처명)을 입력해 주세요.');
  }
  const tier = data.tier === 'tier1' ? 'tier1' : 'tier3';
  const now = new Date().toISOString();
  const partner = {
    id: data.id || (`ptn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    tier,
    name,
    phone: String(data.phone || '').trim(),
    bankName: String(data.bankName || '').trim(),
    accountNumber: String(data.accountNumber || '').trim(),
    accountHolder: String(data.accountHolder || name).trim(),
    defaultUnitPrice: normalizeNonNegInt(data.defaultUnitPrice, 0),
    defaultTaxWithholding: Boolean(data.defaultTaxWithholding),
    memo: String(data.memo || '').trim(),
    createdAt: now,
    updatedAt: now
  };
  store.partners.unshift(partner);
  saveStore(store);
  return partner;
}

export function updatePartner(id, patch = {}) {
  const store = loadStore();
  const idx = store.partners.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const prev = store.partners[idx];
  const nextName = patch.name !== undefined ? String(patch.name).trim() : prev.name;
  if (!nextName) {
    throw new Error('이름(또는 거래처명)을 비울 수 없습니다.');
  }

  const updated = {
    ...prev,
    ...(patch.tier === 'tier1' || patch.tier === 'tier3' ? { tier: patch.tier } : {}),
    name: nextName,
    ...(patch.phone !== undefined ? { phone: String(patch.phone).trim() } : {}),
    ...(patch.bankName !== undefined ? { bankName: String(patch.bankName).trim() } : {}),
    ...(patch.accountNumber !== undefined ? { accountNumber: String(patch.accountNumber).trim() } : {}),
    ...(patch.accountHolder !== undefined ? { accountHolder: String(patch.accountHolder).trim() } : {}),
    ...(patch.defaultUnitPrice !== undefined ? { defaultUnitPrice: normalizeNonNegInt(patch.defaultUnitPrice, 0) } : {}),
    ...(patch.defaultTaxWithholding !== undefined ? { defaultTaxWithholding: Boolean(patch.defaultTaxWithholding) } : {}),
    ...(patch.memo !== undefined ? { memo: String(patch.memo).trim() } : {}),
    updatedAt: new Date().toISOString()
  };

  store.partners[idx] = updated;

  // 연결된 프로젝트 스냅샷 이름도 최신화
  store.projects.forEach(proj => {
    if (proj.tier1PartnerId === id) {
      proj.tier1PartnerName = updated.name;
    }
    if (Array.isArray(proj.allocations)) {
      proj.allocations.forEach(alloc => {
        if (alloc.partnerId === id) {
          alloc.partnerName = updated.name;
        }
      });
    }
  });

  saveStore(store);
  return updated;
}

export function deletePartner(id) {
  const store = loadStore();
  const exists = store.partners.some(p => p.id === id);
  if (!exists) return false;
  store.partners = store.partners.filter(p => p.id !== id);
  saveStore(store);
  return true;
}

// ============================================================================
// 정산 프로젝트 (SettlementProject) & 분배(Allocation) CRUD
// ============================================================================

export function getAllProjects() {
  const store = loadStore();
  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return store.projects.map(proj => computeProjectFinancials(proj, partnersMap));
}

export function getProjectById(id) {
  const store = loadStore();
  const proj = store.projects.find(p => p.id === id);
  if (!proj) return null;
  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

export function createProject(data = {}, linkedCampaign = null) {
  const store = loadStore();
  const now = new Date().toISOString();

  // 신규 1티어 발주처 즉석 생성 지원
  let tier1PartnerId = data.tier1PartnerId || null;
  let tier1PartnerName = String(data.tier1PartnerName || '').trim();
  if (!tier1PartnerId && tier1PartnerName && data.saveNewTier1Partner) {
    const newT1 = {
      id: `ptn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tier: 'tier1',
      name: tier1PartnerName,
      phone: String(data.tier1Phone || '').trim(),
      bankName: '',
      accountNumber: '',
      accountHolder: '',
      defaultUnitPrice: 0,
      defaultTaxWithholding: Boolean(data.taxWithholdingIn),
      memo: '',
      createdAt: now,
      updatedAt: now
    };
    store.partners.unshift(newT1);
    tier1PartnerId = newT1.id;
  } else if (tier1PartnerId) {
    const found = store.partners.find(p => p.id === tier1PartnerId);
    if (found) tier1PartnerName = found.name;
  }

  const campStats = linkedCampaign ? extractAutoSurveyCampaignStats(linkedCampaign) : null;
  const title = String(data.title || campStats?.title || '').trim();
  if (!title) {
    throw new Error('정산 과제명을 입력해 주세요.');
  }

  const targetQuota = data.targetQuota !== undefined && data.targetQuota !== ''
    ? normalizeNonNegInt(data.targetQuota, 0)
    : (campStats ? campStats.targetQuota : 0);

  const unitPriceIn = normalizeNonNegInt(data.unitPriceIn, 0);
  const defaultUnitPriceOut = normalizeNonNegInt(
    data.defaultUnitPriceOut !== undefined && data.defaultUnitPriceOut !== ''
      ? data.defaultUnitPriceOut
      : Math.round(unitPriceIn * 0.7),
    0
  );

  const initialMyCompleted = (data.applyCampaignCompletedToMyWork && campStats)
    ? campStats.completedCount
    : normalizeNonNegInt(data.myCompletedCount, 0);

  const initialMyAssigned = data.myAssignedCount !== undefined && data.myAssignedCount !== ''
    ? normalizeNonNegInt(data.myAssignedCount, 0)
    : initialMyCompleted;

  const periodMonth = /^\d{4}-\d{2}$/.test(String(data.periodMonth || ''))
    ? String(data.periodMonth)
    : getCurrentKstYearMonth();

  const newProject = {
    id: data.id || (`stl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    title,
    sourceType: linkedCampaign ? 'autosurvey' : 'manual',
    linkedCampaignId: linkedCampaign ? linkedCampaign.id : (data.linkedCampaignId || null),
    tier1PartnerId,
    tier1PartnerName,
    periodMonth,
    targetQuota,
    autoSurveyCompletedRef: campStats ? campStats.completedCount : 0,
    autoSurveyWaitingRef: campStats ? campStats.waitingBeforeSubmitCount : 0,
    lastSyncedAt: campStats ? now : null,
    unitPriceIn,
    defaultUnitPriceOut,
    taxWithholdingIn: Boolean(data.taxWithholdingIn),
    extraAdjustmentIn: normalizeSignedInt(data.extraAdjustmentIn, 0),
    inflowStatus: ['pending', 'billed', 'received'].includes(data.inflowStatus) ? data.inflowStatus : 'pending',
    receivedAt: data.inflowStatus === 'received' ? now : null,
    status: 'active',
    memo: String(data.memo || '').trim(),
    myWork: {
      assignedCount: initialMyAssigned,
      completedCount: initialMyCompleted,
      approvedCount: initialMyCompleted,
      autoSyncApproved: true
    },
    allocations: [],
    createdAt: now,
    updatedAt: now
  };

  store.projects.unshift(newProject);
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(newProject, partnersMap);
}

export function updateProject(id, patch = {}) {
  const store = loadStore();
  const idx = store.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const prev = store.projects[idx];
  const now = new Date().toISOString();

  let tier1PartnerId = patch.tier1PartnerId !== undefined ? (patch.tier1PartnerId || null) : prev.tier1PartnerId;
  let tier1PartnerName = patch.tier1PartnerName !== undefined ? String(patch.tier1PartnerName || '').trim() : prev.tier1PartnerName;
  if (tier1PartnerId) {
    const found = store.partners.find(p => p.id === tier1PartnerId);
    if (found) tier1PartnerName = found.name;
  }

  const nextInflowStatus = ['pending', 'billed', 'received'].includes(patch.inflowStatus)
    ? patch.inflowStatus
    : prev.inflowStatus;

  let receivedAt = prev.receivedAt || null;
  if (nextInflowStatus === 'received' && prev.inflowStatus !== 'received') {
    receivedAt = patch.receivedAt || now;
  } else if (nextInflowStatus !== 'received') {
    receivedAt = null;
  }

  const nextTitle = patch.title !== undefined ? String(patch.title).trim() : prev.title;
  if (!nextTitle) {
    throw new Error('정산 과제명을 비울 수 없습니다.');
  }

  const updated = {
    ...prev,
    title: nextTitle,
    tier1PartnerId,
    tier1PartnerName,
    ...(patch.periodMonth && /^\d{4}-\d{2}$/.test(patch.periodMonth) ? { periodMonth: patch.periodMonth } : {}),
    ...(patch.targetQuota !== undefined ? { targetQuota: normalizeNonNegInt(patch.targetQuota, prev.targetQuota) } : {}),
    ...(patch.unitPriceIn !== undefined ? { unitPriceIn: normalizeNonNegInt(patch.unitPriceIn, prev.unitPriceIn) } : {}),
    ...(patch.defaultUnitPriceOut !== undefined ? { defaultUnitPriceOut: normalizeNonNegInt(patch.defaultUnitPriceOut, prev.defaultUnitPriceOut) } : {}),
    ...(patch.taxWithholdingIn !== undefined ? { taxWithholdingIn: Boolean(patch.taxWithholdingIn) } : {}),
    ...(patch.extraAdjustmentIn !== undefined ? { extraAdjustmentIn: normalizeSignedInt(patch.extraAdjustmentIn, 0) } : {}),
    inflowStatus: nextInflowStatus,
    receivedAt,
    ...(patch.status === 'active' || patch.status === 'settled' ? { status: patch.status } : {}),
    ...(patch.memo !== undefined ? { memo: String(patch.memo).trim() } : {}),
    updatedAt: now
  };

  store.projects[idx] = updated;
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(updated, partnersMap);
}

export function deleteProject(id) {
  const store = loadStore();
  const before = store.projects.length;
  store.projects = store.projects.filter(p => p.id !== id);
  if (store.projects.length === before) return false;
  saveStore(store);
  return true;
}

/**
 * AutoSurvey 연동 과제의 완료 건수 동기화
 */
export function syncProjectWithCampaign(projectId, campaign, { applyDiffToMyWork = false } = {}) {
  const store = loadStore();
  const idx = store.projects.findIndex(p => p.id === projectId);
  if (idx === -1) return null;

  const proj = store.projects[idx];
  const stats = extractAutoSurveyCampaignStats(campaign);
  const now = new Date().toISOString();

  proj.autoSurveyCompletedRef = stats.completedCount;
  proj.autoSurveyWaitingRef = stats.waitingBeforeSubmitCount;
  if (stats.targetQuota > 0 && (!proj.targetQuota || proj.targetQuota < stats.targetQuota)) {
    proj.targetQuota = stats.targetQuota;
  }
  proj.lastSyncedAt = now;

  if (applyDiffToMyWork) {
    const tier3CompletedSum = (proj.allocations || []).reduce(
      (acc, a) => acc + normalizeNonNegInt(a.completedCount, 0),
      0
    );
    const inferredMyCompleted = Math.max(0, stats.completedCount - tier3CompletedSum);
    proj.myWork = proj.myWork || { assignedCount: 0, completedCount: 0, approvedCount: 0, autoSyncApproved: true };
    proj.myWork.completedCount = inferredMyCompleted;
    if (proj.myWork.autoSyncApproved !== false) {
      proj.myWork.approvedCount = inferredMyCompleted;
    }
    if (proj.myWork.assignedCount < inferredMyCompleted) {
      proj.myWork.assignedCount = inferredMyCompleted;
    }
  }

  proj.updatedAt = now;
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

/**
 * 2티어(본인) 직접 수행 부수 업데이트
 */
export function updateMyWork(projectId, patch = {}) {
  const store = loadStore();
  const idx = store.projects.findIndex(p => p.id === projectId);
  if (idx === -1) return null;

  const proj = store.projects[idx];
  const prev = proj.myWork || { assignedCount: 0, completedCount: 0, approvedCount: 0, autoSyncApproved: true };
  const autoSync = patch.autoSyncApproved !== undefined ? Boolean(patch.autoSyncApproved) : (prev.autoSyncApproved !== false);

  let completedCount = patch.completedCount !== undefined
    ? normalizeNonNegInt(patch.completedCount, prev.completedCount)
    : normalizeNonNegInt(prev.completedCount, 0);

  let approvedCount = patch.approvedCount !== undefined
    ? normalizeNonNegInt(patch.approvedCount, prev.approvedCount)
    : normalizeNonNegInt(prev.approvedCount, 0);

  // 완료 건수만 조작했고 autoSyncApproved 가 켜져 있으면 인정 건수도 함께 동기화
  if (patch.completedCount !== undefined && patch.approvedCount === undefined && autoSync) {
    approvedCount = completedCount;
  }

  let assignedCount = patch.assignedCount !== undefined
    ? normalizeNonNegInt(patch.assignedCount, prev.assignedCount)
    : normalizeNonNegInt(prev.assignedCount, 0);

  proj.myWork = {
    assignedCount,
    completedCount,
    approvedCount,
    autoSyncApproved: autoSync
  };
  proj.updatedAt = new Date().toISOString();

  saveStore(store);
  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

/**
 * 프로젝트에 3티어 조사원 분배 항목 추가 (신규 3티어 즉석 장부 등록 포함)
 */
export function addAllocation(projectId, data = {}) {
  const store = loadStore();
  const idx = store.projects.findIndex(p => p.id === projectId);
  if (idx === -1) return null;

  const proj = store.projects[idx];
  const now = new Date().toISOString();

  let partnerId = data.partnerId || null;
  let partner = partnerId ? store.partners.find(p => p.id === partnerId) : null;

  if (!partner) {
    const newName = String(data.newPartnerName || data.partnerName || '').trim();
    if (!newName) {
      throw new Error('배정할 3티어 조사원을 선택하거나 이름을 입력해 주세요.');
    }
    partner = {
      id: `ptn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tier: 'tier3',
      name: newName,
      phone: String(data.phone || '').trim(),
      bankName: String(data.bankName || '').trim(),
      accountNumber: String(data.accountNumber || '').trim(),
      accountHolder: String(data.accountHolder || newName).trim(),
      defaultUnitPrice: normalizeNonNegInt(data.unitPriceOut, proj.defaultUnitPriceOut || 0),
      defaultTaxWithholding: Boolean(data.taxWithholdingOut),
      memo: '',
      createdAt: now,
      updatedAt: now
    };
    store.partners.unshift(partner);
    partnerId = partner.id;
  }

  // 같은 과제에 이미 동일 3티어가 등록되어 있는지 확인
  proj.allocations = Array.isArray(proj.allocations) ? proj.allocations : [];
  if (proj.allocations.some(a => a.partnerId === partnerId)) {
    throw new Error(`이미 '${partner.name}' 조사원이 이 과제에 배정되어 있습니다.`);
  }

  const assignedCount = normalizeNonNegInt(data.assignedCount, 0);
  const completedCount = normalizeNonNegInt(data.completedCount, 0);
  const approvedCount = data.approvedCount !== undefined
    ? normalizeNonNegInt(data.approvedCount, completedCount)
    : completedCount;

  const unitPriceOut = data.unitPriceOut !== undefined && data.unitPriceOut !== ''
    ? normalizeNonNegInt(data.unitPriceOut, proj.defaultUnitPriceOut || 0)
    : normalizeNonNegInt(proj.defaultUnitPriceOut || partner.defaultUnitPrice || 0, 0);

  const taxWithholdingOut = data.taxWithholdingOut !== undefined
    ? Boolean(data.taxWithholdingOut)
    : Boolean(partner.defaultTaxWithholding);

  const newAlloc = {
    id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    partnerName: partner.name,
    assignedCount,
    completedCount,
    approvedCount,
    autoSyncApproved: true,
    unitPriceOut,
    taxWithholdingOut,
    extraAdjustmentOut: normalizeSignedInt(data.extraAdjustmentOut, 0),
    payoutStatus: 'unpaid',
    paidAmount: 0,
    paidAt: null,
    memo: String(data.memo || '').trim(),
    createdAt: now,
    updatedAt: now
  };

  proj.allocations.push(newAlloc);
  proj.updatedAt = now;
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

/**
 * 3티어 분배 항목 수정 (부수 증감, 지급 단가, 송금 상태 토글 등)
 */
export function updateAllocation(projectId, allocId, patch = {}) {
  const store = loadStore();
  const proj = store.projects.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.allocations)) return null;

  const aIdx = proj.allocations.findIndex(a => a.id === allocId);
  if (aIdx === -1) return null;

  const prev = proj.allocations[aIdx];
  const now = new Date().toISOString();
  const autoSync = patch.autoSyncApproved !== undefined
    ? Boolean(patch.autoSyncApproved)
    : (prev.autoSyncApproved !== false);

  const completedCount = patch.completedCount !== undefined
    ? normalizeNonNegInt(patch.completedCount, prev.completedCount)
    : normalizeNonNegInt(prev.completedCount, 0);

  let approvedCount = patch.approvedCount !== undefined
    ? normalizeNonNegInt(patch.approvedCount, prev.approvedCount)
    : normalizeNonNegInt(prev.approvedCount, 0);

  if (patch.completedCount !== undefined && patch.approvedCount === undefined && autoSync) {
    approvedCount = completedCount;
  }

  const assignedCount = patch.assignedCount !== undefined
    ? normalizeNonNegInt(patch.assignedCount, prev.assignedCount)
    : normalizeNonNegInt(prev.assignedCount, 0);

  const unitPriceOut = patch.unitPriceOut !== undefined
    ? normalizeNonNegInt(patch.unitPriceOut, prev.unitPriceOut)
    : normalizeNonNegInt(prev.unitPriceOut, 0);

  const taxWithholdingOut = patch.taxWithholdingOut !== undefined
    ? Boolean(patch.taxWithholdingOut)
    : Boolean(prev.taxWithholdingOut);

  const extraAdjustmentOut = patch.extraAdjustmentOut !== undefined
    ? normalizeSignedInt(patch.extraAdjustmentOut, 0)
    : normalizeSignedInt(prev.extraAdjustmentOut, 0);

  const nextPayoutStatus = ['unpaid', 'partial', 'paid'].includes(patch.payoutStatus)
    ? patch.payoutStatus
    : (prev.payoutStatus || 'unpaid');

  let paidAt = prev.paidAt || null;
  if (nextPayoutStatus === 'paid' && prev.payoutStatus !== 'paid') {
    paidAt = patch.paidAt || now;
  } else if (nextPayoutStatus !== 'paid') {
    paidAt = null;
  }

  const gross = approvedCount * unitPriceOut;
  const tax = taxWithholdingOut ? Math.floor(gross * 0.033) : 0;
  const net = Math.max(0, gross - tax + extraAdjustmentOut);

  const paidAmount = nextPayoutStatus === 'paid'
    ? net
    : (nextPayoutStatus === 'partial'
      ? normalizeNonNegInt(patch.paidAmount !== undefined ? patch.paidAmount : prev.paidAmount, 0)
      : 0);

  proj.allocations[aIdx] = {
    ...prev,
    assignedCount,
    completedCount,
    approvedCount,
    autoSyncApproved: autoSync,
    unitPriceOut,
    taxWithholdingOut,
    extraAdjustmentOut,
    payoutStatus: nextPayoutStatus,
    paidAmount,
    paidAt,
    ...(patch.memo !== undefined ? { memo: String(patch.memo).trim() } : {}),
    updatedAt: now
  };

  proj.updatedAt = now;
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

export function deleteAllocation(projectId, allocId) {
  const store = loadStore();
  const proj = store.projects.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.allocations)) return null;

  const before = proj.allocations.length;
  proj.allocations = proj.allocations.filter(a => a.id !== allocId);
  if (proj.allocations.length === before) return null;

  proj.updatedAt = new Date().toISOString();
  saveStore(store);

  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  return computeProjectFinancials(proj, partnersMap);
}

/**
 * 특정 3티어 조사원의 미지급 분배 내역을 일괄 송금완료 처리 (3티어 송금함 원터치 정산용)
 */
export function markPartnerAllocationsPaid(partnerId, { periodMonth = 'all' } = {}) {
  const store = loadStore();
  const now = new Date().toISOString();
  let updatedCount = 0;

  store.projects.forEach(proj => {
    if (periodMonth && periodMonth !== 'all' && proj.periodMonth !== periodMonth) {
      return;
    }
    if (!Array.isArray(proj.allocations)) return;
    proj.allocations.forEach(alloc => {
      if (alloc.partnerId !== partnerId) return;
      const approved = normalizeNonNegInt(alloc.approvedCount, 0);
      const unitOut = normalizeNonNegInt(alloc.unitPriceOut, proj.defaultUnitPriceOut || 0);
      const extra = normalizeSignedInt(alloc.extraAdjustmentOut, 0);
      const gross = approved * unitOut;
      const tax = alloc.taxWithholdingOut ? Math.floor(gross * 0.033) : 0;
      const net = Math.max(0, gross - tax + extra);
      if (net > 0 && alloc.payoutStatus !== 'paid') {
        alloc.payoutStatus = 'paid';
        alloc.paidAmount = net;
        alloc.paidAt = now;
        alloc.updatedAt = now;
        proj.updatedAt = now;
        updatedCount += 1;
      }
    });
  });

  if (updatedCount > 0) {
    saveStore(store);
  }
  return { updatedCount };
}

/**
 * 대시보드·송금함·장부 통합 스냅샷 빌더
 */
export function buildSettlementDashboardPayload({ periodMonth = 'all' } = {}) {
  const store = loadStore();
  const partnersMap = new Map(store.partners.map(p => [p.id, p]));
  const allProjects = store.projects.map(p => computeProjectFinancials(p, partnersMap));

  const monthSet = new Set([getCurrentKstYearMonth()]);
  allProjects.forEach(p => {
    if (p.periodMonth) monthSet.add(p.periodMonth);
  });
  const availableMonths = Array.from(monthSet).sort().reverse();

  const filteredProjects = (periodMonth && periodMonth !== 'all')
    ? allProjects.filter(p => p.periodMonth === periodMonth)
    : allProjects;

  const summary = {
    projectCount: filteredProjects.length,
    activeProjectCount: filteredProjects.filter(p => !p.metrics.isFullySettled).length,
    settledProjectCount: filteredProjects.filter(p => p.metrics.isFullySettled).length,
    totalApprovedCount: 0,
    myApprovedCount: 0,
    tier3ApprovedCount: 0,
    grossReceivable: 0,
    netReceivable: 0,
    uncollectedIn: 0,
    totalNetPayable: 0,
    totalPaidOut: 0,
    totalUnpaidOut: 0,
    myDirectGross: 0,
    tier3SpreadGross: 0,
    myNetProfit: 0
  };

  // 인물별 3티어 송금함 그룹핑
  const remittanceMap = new Map();

  filteredProjects.forEach(proj => {
    const m = proj.metrics;
    summary.totalApprovedCount += m.totalApprovedCount;
    summary.myApprovedCount += m.myApproved;
    summary.tier3ApprovedCount += m.tier3ApprovedTotal;
    summary.grossReceivable += m.grossReceivable;
    summary.netReceivable += m.netReceivable;
    summary.uncollectedIn += m.uncollectedIn;
    summary.totalNetPayable += m.totalNetPayable;
    summary.totalPaidOut += m.totalPaidOut;
    summary.totalUnpaidOut += m.totalUnpaidOut;
    summary.myDirectGross += m.myDirectGross;
    summary.tier3SpreadGross += m.tier3SpreadGross;
    summary.myNetProfit += m.myNetProfit;

    proj.allocations.forEach(alloc => {
      const key = alloc.partnerId || `name:${alloc.partnerName}`;
      if (!remittanceMap.has(key)) {
        const ptn = alloc.partnerId ? partnersMap.get(alloc.partnerId) : null;
        remittanceMap.set(key, {
          partnerId: alloc.partnerId || null,
          partnerName: ptn?.name || alloc.partnerName || '미지정 조사원',
          phone: ptn?.phone || alloc.partnerPhone || '',
          bankName: ptn?.bankName || alloc.bankName || '',
          accountNumber: ptn?.accountNumber || alloc.accountNumber || '',
          accountHolder: ptn?.accountHolder || ptn?.name || alloc.partnerName || '',
          totalApprovedCount: 0,
          totalGrossPayable: 0,
          totalTaxOut: 0,
          totalNetPayable: 0,
          totalPaidAmount: 0,
          totalUnpaidBalance: 0,
          items: []
        });
      }
      const group = remittanceMap.get(key);
      group.totalApprovedCount += alloc.approvedCount;
      group.totalGrossPayable += alloc.grossPayable;
      group.totalTaxOut += alloc.taxOut;
      group.totalNetPayable += alloc.netPayable;
      group.totalPaidAmount += alloc.paidAmount;
      group.totalUnpaidBalance += alloc.unpaidBalance;
      group.items.push({
        projectId: proj.id,
        projectTitle: proj.title,
        periodMonth: proj.periodMonth,
        inflowStatus: proj.inflowStatus,
        allocId: alloc.id,
        assignedCount: alloc.assignedCount,
        completedCount: alloc.completedCount,
        approvedCount: alloc.approvedCount,
        unitPriceOut: alloc.unitPriceOut,
        taxWithholdingOut: alloc.taxWithholdingOut,
        extraAdjustmentOut: alloc.extraAdjustmentOut,
        grossPayable: alloc.grossPayable,
        taxOut: alloc.taxOut,
        netPayable: alloc.netPayable,
        paidAmount: alloc.paidAmount,
        unpaidBalance: alloc.unpaidBalance,
        payoutStatus: alloc.payoutStatus,
        paidAt: alloc.paidAt
      });
    });
  });

  const remittanceGroups = Array.from(remittanceMap.values()).sort((a, b) => {
    if (b.totalUnpaidBalance !== a.totalUnpaidBalance) {
      return b.totalUnpaidBalance - a.totalUnpaidBalance;
    }
    return b.totalNetPayable - a.totalNetPayable;
  });

  // 거래처별 누적 거래 통계 결합 (전체 기간 기준)
  const partnerStatsMap = new Map();
  store.partners.forEach(p => {
    partnerStatsMap.set(p.id, {
      projectCount: 0,
      totalApprovedCount: 0,
      totalAmount: 0,
      unpaidOrUncollected: 0
    });
  });

  allProjects.forEach(proj => {
    if (proj.tier1PartnerId && partnerStatsMap.has(proj.tier1PartnerId)) {
      const st = partnerStatsMap.get(proj.tier1PartnerId);
      st.projectCount += 1;
      st.totalApprovedCount += proj.metrics.totalApprovedCount;
      st.totalAmount += proj.metrics.netReceivable;
      st.unpaidOrUncollected += proj.metrics.uncollectedIn;
    }
    proj.allocations.forEach(alloc => {
      if (alloc.partnerId && partnerStatsMap.has(alloc.partnerId)) {
        const st = partnerStatsMap.get(alloc.partnerId);
        st.projectCount += 1;
        st.totalApprovedCount += alloc.approvedCount;
        st.totalAmount += alloc.netPayable;
        st.unpaidOrUncollected += alloc.unpaidBalance;
      }
    });
  });

  const enrichedPartners = store.partners.map(p => ({
    ...p,
    stats: partnerStatsMap.get(p.id) || {
      projectCount: 0,
      totalApprovedCount: 0,
      totalAmount: 0,
      unpaidOrUncollected: 0
    }
  }));

  return {
    periodMonth,
    currentKstMonth: getCurrentKstYearMonth(),
    availableMonths,
    summary,
    projects: filteredProjects,
    remittanceGroups,
    partners: enrichedPartners
  };
}
