/**
 * 배포 시점 스마트 쿼터 시드 병합 스크립트 (scripts/sync-seed-quotas.js)
 *
 * 배경:
 * - `.github/workflows/deploy.yml`에서 `tar -x --skip-old-files`만 수행할 경우,
 *   서버의 `data/quotas/*.json` 기존 파일(런타임 응답 보존 목적)이 이미 존재하면
 *   원격 Git(`origin/main`)에 새로 추가된 조사원 계정/쿼터 행(예: 지연옥 75건)이 디스크에 반영되지 않음.
 * - 본 스크립트는 `origin/main`의 최신 `data/quotas/*.json`과 서버 로컬 `data/quotas/*.json`을 비교하여,
 *   로컬에 저장된 런타임 진행상태(`submittedAnswers`, `capturedSteps`, `quotaStatus`, `manualClosedOverride` 등)는
 *   100% 보존하면서 신규 추가된 계정·쿼터 슬롯과 최신 시트/휴폐업 메타데이터를 원자적으로 안전 병합합니다.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function getItemKey(item) {
  if (!item || typeof item !== 'object') return '';
  const scope = String(item.surveyorId || item.accountKey || item.loginId || '').trim();
  const id = String(item.uid ?? item.finalId ?? item.id ?? item.listId ?? '').trim();
  if (!id) return '';
  return `${scope}::${id}`;
}

function getFallbackIdKey(item) {
  if (!item || typeof item !== 'object') return '';
  const id = String(item.uid ?? item.finalId ?? item.id ?? item.listId ?? '').trim();
  return id ? `::${id}` : '';
}

function writeJsonAtomicSync(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function mergeQuotaItem(prev, remoteItem) {
  if (!prev) return remoteItem;

  const prevAnsLen = Array.isArray(prev.submittedAnswers) ? prev.submittedAnswers.length : 0;
  const remAnsLen = Array.isArray(remoteItem.submittedAnswers) ? remoteItem.submittedAnswers.length : 0;

  const manualClosed = Boolean(prev.manualClosedOverride);
  const resolvedClosed = manualClosed ? Boolean(prev.isClosedBiz) : Boolean(remoteItem.isClosedBiz);
  const resolvedBizStatus = manualClosed ? (prev.bizStatus || '') : (remoteItem.bizStatus || prev.bizStatus || '');

  const isEitherDone =
    prev.quotaStatus === 'completed' ||
    remoteItem.quotaStatus === 'completed' ||
    String(prev.status || '').includes('완료') ||
    String(remoteItem.status || '').includes('완료');

  const isPrevSafeWait =
    /98%|99%/.test(String(prev.status || '')) ||
    /98%|99%/.test(String(prev.quotaStatus || ''));
  const isRemSafeWait =
    /98%|99%/.test(String(remoteItem.status || '')) ||
    /98%|99%/.test(String(remoteItem.quotaStatus || ''));
  const isSafeWait = isPrevSafeWait || isRemSafeWait;

  const resolvedStatus = isEitherDone
    ? (String(remoteItem.status || '').includes('완료') ? remoteItem.status : (prev.status || '완료'))
    : (isPrevSafeWait && !isRemSafeWait
      ? (prev.status || '진행중(98%)')
      : (remoteItem.status || prev.status || ''));

  const isOverQuota =
    String(resolvedStatus).includes('인원초과') ||
    String(remoteItem.rawMeta?.COMPLETE || '').toUpperCase() === 'OVER';

  const resolvedQuotaStatus = (resolvedClosed || isOverQuota)
    ? 'excluded'
    : (isEitherDone
      ? 'completed'
      : (isSafeWait
        ? '진행중(98%)'
        : (prev.quotaStatus && prev.quotaStatus !== 'ready' && prev.quotaStatus !== 'excluded'
          ? prev.quotaStatus
          : (remoteItem.quotaStatus || 'ready'))));

  // K-BPI 등 품목별 설정(categoryConfigs)은 로컬 런타임 스캔/선택값을 최우선 보존하고 원격 시드로 빈칸만 보충
  let mergedCategoryConfigs = remoteItem.categoryConfigs;
  if (Array.isArray(prev.categoryConfigs) || Array.isArray(remoteItem.categoryConfigs)) {
    const prevCfgs = Array.isArray(prev.categoryConfigs) ? prev.categoryConfigs : [];
    const remCfgs = Array.isArray(remoteItem.categoryConfigs) ? remoteItem.categoryConfigs : [];
    const maxLen = Math.max(prevCfgs.length, remCfgs.length);
    mergedCategoryConfigs = [];
    for (let i = 0; i < maxLen; i++) {
      const p = prevCfgs[i] || {};
      const r = remCfgs[i] || {};
      mergedCategoryConfigs.push({
        slot: i + 1,
        industryKey: p.industryKey || r.industryKey || '',
        categoryName: p.categoryName || r.categoryName || '',
        purchaseExp: p.purchaseExp || r.purchaseExp || '',
        topBrand: p.topBrand || r.topBrand || '',
        channel: p.channel || r.channel || ''
      });
    }
  }

  return {
    ...prev,
    ...remoteItem,
    ...(mergedCategoryConfigs ? { categoryConfigs: mergedCategoryConfigs } : {}),
    education: prev.education || remoteItem.education || '',
    job: prev.job || remoteItem.job || '',
    householdIncome: prev.householdIncome || remoteItem.householdIncome || '',
    maritalStatus: prev.maritalStatus || remoteItem.maritalStatus || '',
    familySize: prev.familySize || remoteItem.familySize || '',
    childrenCount: prev.childrenCount || remoteItem.childrenCount || '',
    surveyDistrict: prev.surveyDistrict || remoteItem.surveyDistrict || '',
    surveyDong: prev.surveyDong || remoteItem.surveyDong || '',
    phone: (prev.phoneNeedsSync === false && prev.phone) ? prev.phone : remoteItem.phone,
    serverPhone: (prev.phoneNeedsSync === false && prev.serverPhone) ? prev.serverPhone : remoteItem.serverPhone,
    phoneNeedsSync: prev.phoneNeedsSync === false ? false : remoteItem.phoneNeedsSync,
    customGuide: prev.customGuide || remoteItem.customGuide,
    manualClosedOverride: manualClosed,
    isClosedBiz: resolvedClosed,
    bizStatus: resolvedBizStatus,
    quotaStatus: resolvedQuotaStatus,
    status: resolvedStatus,
    completedAt: prev.completedAt || remoteItem.completedAt || '',
    pilotAt: remoteItem.pilotAt || prev.pilotAt || '',
    ...(prev.giftSigned || remoteItem.giftSigned
      ? {
        giftSigned: true,
        giftBrand: prev.giftBrand || remoteItem.giftBrand || '신세계',
        giftValue: prev.giftValue || remoteItem.giftValue || '5000',
        giftSignerName: prev.giftSignerName || remoteItem.giftSignerName || '',
        giftSignerPhone: prev.giftSignerPhone || remoteItem.giftSignerPhone || '',
        giftStyleLabel: prev.giftStyleLabel || remoteItem.giftStyleLabel || ''
      }
      : {}),
    capturedSteps: (Array.isArray(remoteItem.capturedSteps) && remoteItem.capturedSteps.length > 0)
      ? remoteItem.capturedSteps
      : (prev.capturedSteps || []),
    submittedAnswers: remAnsLen > prevAnsLen
      ? (remoteItem.submittedAnswers || [])
      : (prev.submittedAnswers || [])
  };
}

function main() {
  const ref = process.argv[2] || 'origin/main';
  let trackedFiles = [];
  try {
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'data/quotas'], {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024
    });
    trackedFiles = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (err) {
    console.warn(`[SyncSeedQuotas] git ls-tree 건너뜀 (${ref}): ${err.message}`);
    return;
  }

  const jsonFiles = trackedFiles.filter(f => f.endsWith('.json'));
  const trackedJsonBasenames = new Set(jsonFiles.map(f => path.basename(f)));
  const xlsxSet = new Set(trackedFiles.filter(f => f.endsWith('.xlsx')));

  for (const relPath of jsonFiles) {
    const absPath = path.resolve(relPath);
    const dir = path.dirname(absPath);
    const baseName = path.basename(relPath);
    let remoteRaw = '';
    try {
      remoteRaw = execFileSync('git', ['show', `${ref}:${relPath}`], {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (err) {
      console.warn(`[SyncSeedQuotas] 원격 파일 로드 실패 (${relPath}): ${err.message}`);
      continue;
    }

    // HRC 에너지총조사처럼 건수 변경으로 파일명이 바뀐 경우(예: 전체30개 ➔ 전체72개) 구버전 형제 파일 탐색
    const hrcAccMatch = baseName.match(/^quota_hrc_energy_2025_(\d+)_/);
    const staleSiblingFiles = (hrcAccMatch && fs.existsSync(dir))
      ? fs.readdirSync(dir).filter(
        f => f.startsWith(`quota_hrc_energy_2025_${hrcAccMatch[1]}_`) &&
          f.endsWith('.json') &&
          f !== baseName &&
          !trackedJsonBasenames.has(f)
      )
      : [];

    if (!fs.existsSync(absPath) && staleSiblingFiles.length === 0) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(absPath, remoteRaw, 'utf-8');
      console.log(`[SyncSeedQuotas] 신규 쿼터 시드 생성: ${relPath}`);
      continue;
    }

    let remoteObj;
    let localObj = null;
    try {
      remoteObj = JSON.parse(remoteRaw);
      if (fs.existsSync(absPath)) {
        localObj = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
      }
    } catch (err) {
      console.warn(`[SyncSeedQuotas] JSON 파싱 건너뜀 (${relPath}): ${err.message}`);
      continue;
    }

    // 구버전 형제 파일에 저장된 런타임 상태(완료/수령증 서명 등)도 빠짐없이 흡수
    const siblingRows = [];
    for (const sibFile of staleSiblingFiles) {
      try {
        const sibObj = JSON.parse(fs.readFileSync(path.join(dir, sibFile), 'utf-8'));
        const arr = Array.isArray(sibObj?.data)
          ? sibObj.data
          : (Array.isArray(sibObj?.rows) ? sibObj.rows : []);
        siblingRows.push(...arr);
        if (!localObj) localObj = sibObj;
      } catch (_) {}
    }

    if (!localObj) continue;

    const remoteRows = Array.isArray(remoteObj?.data)
      ? remoteObj.data
      : (Array.isArray(remoteObj?.rows) ? remoteObj.rows : null);
    const baseLocalRows = Array.isArray(localObj?.data)
      ? localObj.data
      : (Array.isArray(localObj?.rows) ? localObj.rows : null);

    if (!remoteRows || !baseLocalRows) continue;
    const localRows = siblingRows.length > 0 ? [...siblingRows, ...baseLocalRows] : baseLocalRows;

    const localByKey = new Map();
    for (const r of localRows) {
      const k = getItemKey(r);
      if (k) localByKey.set(k, r);
      const fk = getFallbackIdKey(r);
      if (fk && !localByKey.has(fk)) localByKey.set(fk, r);
    }

    const hasNewRemoteItems = remoteRows.some(r => {
      const k = getItemKey(r);
      const fk = getFallbackIdKey(r);
      return k ? (!localByKey.has(k) && !( !r.surveyorId && fk && localByKey.has(fk) )) : false;
    });
    const hasNewRemoteFields = remoteRows.some(r => {
      const k = getItemKey(r);
      const fk = getFallbackIdKey(r);
      const prev = (k && localByKey.get(k)) || (!r.surveyorId && fk ? localByKey.get(fk) : null);
      if (!prev) return false;
      return ['education', 'job', 'householdIncome', 'maritalStatus', 'familySize', 'childrenCount', 'surveyDistrict', 'surveyDong', 'ceilingHeightM', 'phoneDuplicateWarning']
        .some(field => r[field] && !prev[field]);
    });
    const remoteAccLen = Array.isArray(remoteObj.accounts) ? remoteObj.accounts.length : 0;
    const localAccLen = Array.isArray(localObj.accounts) ? localObj.accounts.length : 0;

    if (
      staleSiblingFiles.length === 0 &&
      !hasNewRemoteItems &&
      !hasNewRemoteFields &&
      remoteRows.length <= baseLocalRows.length &&
      remoteAccLen <= localAccLen
    ) {
      continue;
    }

    const mergedKeySet = new Set();
    const mergedRows = remoteRows.map((remItem, idx) => {
      const k = getItemKey(remItem);
      const fk = getFallbackIdKey(remItem);
      if (k) mergedKeySet.add(k);
      if (fk) mergedKeySet.add(fk);
      const prev = (k && localByKey.get(k)) || (!remItem.surveyorId && fk ? localByKey.get(fk) : null);
      const merged = mergeQuotaItem(prev, remItem);
      return {
        ...merged,
        index: remItem.index ?? idx + 1,
        seq: remItem.seq ?? idx + 1,
        slotIndex: remItem.slotIndex ?? idx + 1
      };
    });

    // 로컬에만 있던 커스텀 항목도 유실 없이 뒤에 보존
    for (const locItem of localRows) {
      const k = getItemKey(locItem);
      const fk = getFallbackIdKey(locItem);
      if ((k && mergedKeySet.has(k)) || (!locItem.surveyorId && fk && mergedKeySet.has(fk))) continue;
      const nextIdx = mergedRows.length + 1;
      mergedRows.push({
        ...locItem,
        index: nextIdx,
        seq: nextIdx,
        slotIndex: nextIdx
      });
    }

    const mergedDoc = {
      ...localObj,
      ...remoteObj,
      updatedAt: new Date().toISOString(),
      count: mergedRows.length,
      targetTotal: mergedRows.length,
      ...(typeof remoteObj.totalCount === 'number' ? { totalCount: mergedRows.length } : {}),
      data: mergedRows,
      ...(Array.isArray(remoteObj.items) || Array.isArray(localObj.items) ? { items: mergedRows } : {}),
      ...(Array.isArray(remoteObj.rows) || Array.isArray(localObj.rows) ? { rows: mergedRows } : {})
    };

    writeJsonAtomicSync(absPath, mergedDoc);
    console.log(`[SyncSeedQuotas] 쿼터 시드 안전 병합 완료: ${relPath} (${baseLocalRows.length}건 ➔ ${mergedRows.length}건, 기존 응답 보존)`);

    // 구버전 형제 파일(.json / .xlsx) 정리
    for (const sibFile of staleSiblingFiles) {
      try { fs.unlinkSync(path.join(dir, sibFile)); } catch (_) {}
      const sibXlsx = sibFile.replace(/\.json$/i, '.xlsx');
      if (!xlsxSet.has(`data/quotas/${sibXlsx}`) && fs.existsSync(path.join(dir, sibXlsx))) {
        try { fs.unlinkSync(path.join(dir, sibXlsx)); } catch (_) {}
      }
      console.log(`[SyncSeedQuotas] 구버전 형제 쿼터 파일 마이그레이션 정리 완료: ${sibFile}`);
    }

    // 대응하는 .xlsx 파일도 원격에 존재하면 최신화
    const matchingXlsx = relPath.replace(/\.json$/i, '.xlsx');
    if (xlsxSet.has(matchingXlsx)) {
      try {
        const xlsxBuf = execFileSync('git', ['show', `${ref}:${matchingXlsx}`], {
          maxBuffer: 50 * 1024 * 1024
        });
        fs.writeFileSync(path.resolve(matchingXlsx), xlsxBuf);
        console.log(`[SyncSeedQuotas] 엑셀 시드 갱신 완료: ${matchingXlsx}`);
      } catch (err) {
        console.warn(`[SyncSeedQuotas] 엑셀 시드 갱신 경고 (${matchingXlsx}): ${err.message}`);
      }
    }
  }
}

main();
