/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사 - 5911000005645]
 * 로컬 JSON/Excel(.xlsx) 영속화, 신상·배경변인(학력·직업·가구소득·결혼·가족·자녀·조사구·조사동) 정합 보강
 * 및 구글 스프레드시트(2번 탭: 5911000005645) 양방향 자동 동기화 모듈
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { launchChromium } from './chromium-launcher.js';
import { writeJsonAtomicSync } from './atomic-file.js';

export const KBPI_DEFAULT_SHEET_ID = '16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg';
export const KBPI_DEFAULT_SHEET_URL =
  `https://docs.google.com/spreadsheets/d/${KBPI_DEFAULT_SHEET_ID}/edit`;
export const KBPI_DEFAULT_TAB_NAME = '5911000005645';
export const KBPI_DEFAULT_LOGIN_ID = '5911000005645';
export const KBPI_QUOTA_JSON_FILENAME = 'quota_kmac_kbpi_5911000005645.json';
export const KBPI_QUOTA_XLSX_FILENAME = 'quota_kmac_kbpi_5911000005645.xlsx';

export const KBPI_GPS_BASES = {
  seoul: { lat: 37.654192, lng: 127.056794, label: '서울 노원구청' },
  incheon: { lat: 37.456256, lng: 126.705206, label: '인천광역시청' }
};

// Survey 230 M_CHECK 공식 행정동 목록 (서울 노원구 19개 동 / 인천 남동구 20개 동)
export const KBPI_SEOUL_NOWON_DONGS = [
  '월계1동', '월계2동', '월계3동', '공릉1동', '공릉2동',
  '하계1동', '하계2동', '중계본동', '중계1동', '중계4동',
  '중계2·3동', '상계1동', '상계2동', '상계3·4동', '상계5동',
  '상계6·7동', '상계8동', '상계9동', '상계10동'
];

export const KBPI_INCHEON_NAMDONG_DONGS = [
  '구월1동', '구월2동', '구월3동', '구월4동',
  '간석1동', '간석2동', '간석3동', '간석4동',
  '만수1동', '만수2동', '만수3동', '만수4동', '만수5동', '만수6동',
  '장수서창동', '서창2동', '남촌도림동', '논현1동', '논현2동', '논현고잔동'
];

/**
 * 지역('서울' | '인천') 및 응답자 고유 시드 기반 조사구·조사동 결정
 * - 서울 = 노원구 (관내 행정동 분산) / 인천 = 남동구 (인천시청 소재 구, 관내 행정동 분산)
 */
export function computeKbpiDistrictDong(region = '서울', finalId = '1', seq = 1) {
  const isIncheon = String(region || '').includes('인천');
  const seed = Math.abs((parseInt(String(finalId).replace(/\D/g, ''), 10) || 1) * 53 + (Number(seq) || 1) * 19);
  if (isIncheon) {
    return {
      cityCode: '2',
      surveyDistrict: '남동구',
      surveyDong: KBPI_INCHEON_NAMDONG_DONGS[seed % KBPI_INCHEON_NAMDONG_DONGS.length]
    };
  }
  return {
    cityCode: '1',
    surveyDistrict: '노원구',
    surveyDong: KBPI_SEOUL_NOWON_DONGS[seed % KBPI_SEOUL_NOWON_DONGS.length]
  };
}

/**
 * 지역('서울' | '인천') 및 응답자 고유 시드 기반 반경 약 50~80m 미세 분산 GPS 산출
 */
export function computeKbpiGps(region = '서울', finalId = '1', seq = 1) {
  const isIncheon = String(region || '').includes('인천');
  const base = isIncheon ? KBPI_GPS_BASES.incheon : KBPI_GPS_BASES.seoul;
  const seed = (parseInt(String(finalId).replace(/\D/g, ''), 10) || 1) * 97 + (Number(seq) || 1) * 31;
  const dLat = (((seed * 73) % 201) - 100) * 0.0000058;
  const dLng = (((seed * 137) % 201) - 100) * 0.0000068;
  return {
    baseLabel: base.label,
    latitude: Number((base.lat + dLat).toFixed(6)),
    longitude: Number((base.lng + dLng).toFixed(6))
  };
}

function cleanSheetNumberLabel(val = '', suffix = '명', fivePlusLabel = '5명 이상') {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/해당\s*사항\s*없음|해당없음|^없음$/.test(s)) return '해당사항 없음';
  const numMatch = s.match(/^(\d+)(?:\.0+)?\s*(명)?$/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 5 && fivePlusLabel === '5명 이상') return '5명 이상';
    if (n >= 4 && fivePlusLabel === '4명 이상') return '4명 이상';
    return `${n}${suffix}`;
  }
  return s;
}

/**
 * 시트의 배경변인(학력·직업·가구소득·결혼여부·가족수·자녀수) 및 조사구·조사동을 정합성 있게 보완
 * - 이미 시트에 기입된 값은 절대 덮어쓰지 않고 보존(숫자 표기 3.0 -> 3명 정규화만 수행)
 * - 비어 있는 칸(학력·직업·가구소득·조사구·조사동)만 연령·성별·가족수에 맞춰 Survey 230 표준 보기로 채움
 */
export function enrichKbpiRespondentDemographics(rawItem = {}) {
  const seq = Number(rawItem.seq || rawItem.index || 1);
  const finalId = String(rawItem.finalId || seq);
  const region = String(rawItem.region || '서울').trim();
  const gender = String(rawItem.gender || rawItem.ceoGender || '남').trim();
  const age = Number(rawItem.age || rawItem.ceoAge || 30);
  const ageGroup = String(rawItem.ageGroup || `${Math.floor(age / 10) * 10}대`).trim();
  const seed = Math.abs((parseInt(finalId.replace(/\D/g, ''), 10) || seq) * 41 + seq * 17);

  // 조사구 / 조사동
  const defDist = computeKbpiDistrictDong(region, finalId, seq);
  const surveyDistrict = String(rawItem.surveyDistrict || '').trim() || defDist.surveyDistrict;
  const surveyDong = String(rawItem.surveyDong || '').trim() || defDist.surveyDong;

  // 결혼여부 / 가족수 / 자녀수 정규화
  let maritalStatus = String(rawItem.maritalStatus || '').trim();
  if (!maritalStatus) {
    maritalStatus = age <= 29 ? '미혼' : '기혼';
  }

  let familySize = cleanSheetNumberLabel(rawItem.familySize, '명', '5명 이상');
  if (!familySize) {
    familySize = maritalStatus === '비혼' ? '1명' : '4명';
  }
  const famNumMatch = familySize.match(/(\d+)/);
  const famNum = famNumMatch ? Number(famNumMatch[1]) : 4;

  let childrenCount = cleanSheetNumberLabel(rawItem.childrenCount, '명', '4명 이상');
  if (!childrenCount) {
    childrenCount = (maritalStatus === '미혼' || maritalStatus === '비혼' || famNum <= 2) ? '해당사항 없음' : '2명';
  }

  // 직업 (비어 있을 때만 보완)
  let job = String(rawItem.job || '').trim();
  const rawEdu = String(rawItem.education || '').trim();
  if (!job) {
    if (/고등|중학/.test(rawEdu) || age <= 19) {
      job = '중/고등학생';
    } else if (/대학생/.test(rawEdu)) {
      job = '대학생';
    } else if (age <= 29) {
      const pool20 = ['사무직', '판매/서비스직', '사무직', '기술직', '판매/서비스직', '사무직'];
      job = pool20[seed % pool20.length];
    } else if (gender.startsWith('여')) {
      const poolAdultF = ['주부', '사무직', '판매/서비스직', '자영업', '사무직', '전문직'];
      job = poolAdultF[seed % poolAdultF.length];
    } else {
      const poolAdultM = ['사무직', '사무직', '자영업', '관리직', '기술직', '사무직', '자영업', '전문직'];
      job = poolAdultM[seed % poolAdultM.length];
    }
  }

  // 학력 (비어 있을 때만 보완)
  let education = rawEdu;
  if (!education) {
    if (/고등|중학/.test(job) || age <= 19) {
      education = '중/고등학생';
    } else if (/대학생/.test(job)) {
      education = '대학생';
    } else if (/사무직|관리직|전문직/.test(job)) {
      education = '대졸';
    } else {
      const eduPool = ['대졸', '고졸 이하', '대졸', '대졸', '고졸 이하'];
      education = eduPool[seed % eduPool.length];
    }
  }

  // 가구소득 (가족 전체 월평균 소득 — 비어 있을 때만 보완)
  let householdIncome = String(rawItem.householdIncome || '').trim();
  if (!householdIncome) {
    if (famNum <= 1) {
      const inc1 = ['200~399만원', '200~399만원', '400~599만원'];
      householdIncome = inc1[seed % inc1.length];
    } else if (famNum === 2) {
      const inc2 = ['400~599만원', '400~599만원', '600~799만원', '200~399만원'];
      householdIncome = inc2[seed % inc2.length];
    } else {
      const incFam = [
        '400~599만원', '600~799만원', '400~599만원', '600~799만원',
        '400~599만원', '200~399만원', '800만원 이상', '400~599만원'
      ];
      householdIncome = incFam[seed % incFam.length];
    }
  }

  return {
    education,
    job,
    householdIncome,
    maritalStatus,
    familySize,
    childrenCount,
    surveyDistrict,
    surveyDong
  };
}

export function normalizeCategoryConfigs(rawConfigs = [], maxSlots = 20) {
  const normalized = [];
  const count = Math.max(maxSlots, Array.isArray(rawConfigs) ? rawConfigs.length : 0);
  for (let i = 0; i < count; i++) {
    const src = (Array.isArray(rawConfigs) && rawConfigs[i]) ? rawConfigs[i] : {};
    const expRaw = String(src.purchaseExp || '').trim();
    let purchaseExp = '';
    if (expRaw === '없음' || expRaw.toLowerCase() === 'none' || expRaw === 'X' || expRaw === '아니오') {
      purchaseExp = '없음';
    } else if (expRaw === '있음' || expRaw.toLowerCase() === 'yes' || expRaw === 'O' || expRaw === '예') {
      purchaseExp = '있음';
    }
    normalized.push({
      slot: i + 1,
      industryKey: String(src.industryKey || '').trim(),
      categoryName: String(src.categoryName || src.brandCategory || '').trim(),
      purchaseExp,
      topBrand: String(src.topBrand || '').trim(),
      channel: String(src.channel || '').trim()
    });
  }
  return normalized;
}

export function persistKbpiQuotaDatabase({
  quotaDatabase = [],
  quotasDir = null,
  jsonPath = null
} = {}) {
  const list = Array.isArray(quotaDatabase) ? quotaDatabase : [];
  if (list.length === 0) return null;

  const resolvedJsonPath = jsonPath || (quotasDir ? path.join(quotasDir, KBPI_QUOTA_JSON_FILENAME) : null);
  if (!resolvedJsonPath) return null;
  const resolvedXlsxPath = resolvedJsonPath.replace(/\.json$/i, '.xlsx');

  let maxSlotCount = 20;
  for (const item of list) {
    if (Array.isArray(item.categoryConfigs) && item.categoryConfigs.length > maxSlotCount) {
      maxSlotCount = item.categoryConfigs.length;
    }
  }

  const enrichedList = list.map((it, idx) => {
    const demo = enrichKbpiRespondentDemographics({ ...it, seq: it.seq || it.index || idx + 1 });
    return {
      ...it,
      ...demo,
      categoryConfigs: normalizeCategoryConfigs(it.categoryConfigs, maxSlotCount)
    };
  });

  const payload = {
    surveyType: 'kmac_kbpi',
    projectId: '230',
    title: '2027년 한국산업의브랜드파워(K-BPI) 조사 - 5911000005645 (150명)',
    loginId: KBPI_DEFAULT_LOGIN_ID,
    googleSheetId: KBPI_DEFAULT_SHEET_ID,
    sheetTabName: KBPI_DEFAULT_TAB_NAME,
    totalCount: enrichedList.length,
    updatedAt: new Date().toISOString(),
    data: enrichedList,
    items: enrichedList
  };

  writeJsonAtomicSync(resolvedJsonPath, payload);

  const excelRows = enrichedList.map((it, idx) => {
    const configs = normalizeCategoryConfigs(it.categoryConfigs, maxSlotCount);
    const row = {
      순번: Number(it.seq || it.index || idx + 1),
      지역: it.region || '',
      성별: it.gender || it.ceoGender || '',
      연령대: it.ageGroup || '',
      이름: it.name || it.ceoName || '',
      나이: Number(it.age || it.ceoAge || 0),
      전화번호: it.phone || '',
      진행상태: it.status || '대기',
      최종id: Number(it.finalId || 0),
      고유번호: it.uid || '',
      학력: it.education || '',
      직업: it.job || '',
      가구소득: it.householdIncome || '',
      결혼여부: it.maritalStatus || '',
      가족수: it.familySize || '',
      자녀수: it.childrenCount || '',
      조사구: it.surveyDistrict || '',
      조사동: it.surveyDong || ''
    };
    for (let s = 0; s < maxSlotCount; s++) {
      row[`브랜드${s + 1}`] = configs[s]?.categoryName || '';
      row[`구입경험${s + 1}`] = configs[s]?.purchaseExp || '';
    }
    row.GPS기준 = it.gpsLabel || '';
    row.위도 = it.latitude || '';
    row.경도 = it.longitude || '';
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, KBPI_DEFAULT_TAB_NAME);
  const dir = path.dirname(resolvedXlsxPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvedXlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  return { jsonPath: resolvedJsonPath, xlsxPath: resolvedXlsxPath, data: enrichedList };
}

/**
 * 워크북(XLSX 객체)에서 K-BPI 2번 탭(5911000005645)을 파싱하여 기존 쿼터 DB와 안전 병합
 */
export function parseKbpiWorkbookAndMerge({
  wb,
  quotaDatabase = [],
  tabName = KBPI_DEFAULT_TAB_NAME
} = {}) {
  const ws = wb.Sheets[tabName] || wb.Sheets[wb.SheetNames[1]] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    throw new Error(`스프레드시트에서 '${tabName}' 탭을 찾을 수 없습니다.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = 3;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const rowStr = (rawRows[r] || []).join('|');
    if (rowStr.includes('순번') && rowStr.includes('고유번호')) {
      headerRowIdx = r;
      break;
    }
  }

  const headerCells = (rawRows[headerRowIdx] || []).map(h => String(h || '').trim());
  const findColIdx = (regex) => headerCells.findIndex((h, idx) => idx >= 10 && regex.test(h));

  const eduCol = findColIdx(/^학력$/);
  const jobCol = findColIdx(/^직업$/);
  const incomeCol = findColIdx(/^(가구\s*소득|월평균\s*가구소득|소득)$/);
  const maritalCol = findColIdx(/^결혼\s*여부$/);
  const familyCol = findColIdx(/^가족\s*수$/);
  const childCol = findColIdx(/^자녀\s*수$/);
  const distCol = findColIdx(/^조사구$/);
  const dongCol = findColIdx(/^조사동$/);

  const slotCols = [];
  for (let c = 10; c < headerCells.length; c++) {
    const h = headerCells[c];
    const bMatch = h.match(/^브랜드\s*(\d+)$/);
    if (bMatch) {
      const slotNum = Number(bMatch[1]);
      const nextHeader = headerCells[c + 1] || '';
      const hasExpCol = nextHeader.startsWith('구입경험');
      slotCols.push({
        slot: slotNum,
        brandCol: c,
        expCol: hasExpCol ? c + 1 : -1
      });
    }
  }

  const existingByUid = new Map(
    (quotaDatabase || []).map(q => [String(q.uid || '').trim(), q])
  );

  let updatedCount = 0;
  const mergedList = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row[0] === '' || row[0] === null || row[0] === undefined) continue;
    const seq = Number(row[0]);
    if (!seq || isNaN(seq)) continue;

    const region = String(row[1] || '').trim();
    const gender = String(row[2] || '').trim();
    const ageGroup = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    const age = Number(row[5]);
    const phone = String(row[6] || '').trim();
    const sheetStatus = String(row[7] || '').trim();
    const finalId = String(Math.trunc(Number(row[8] || 0)));
    const uid = String(row[9] || '').trim();

    const prev = existingByUid.get(uid) || {};
    const gps = (prev.latitude && prev.longitude)
      ? { baseLabel: prev.gpsLabel || (region.includes('인천') ? '인천광역시청' : '서울 노원구청'), latitude: Number(prev.latitude), longitude: Number(prev.longitude) }
      : computeKbpiGps(region, finalId, seq);

    const sheetEdu = eduCol >= 0 ? String(row[eduCol] ?? '').trim() : '';
    const sheetJob = jobCol >= 0 ? String(row[jobCol] ?? '').trim() : '';
    const sheetIncome = incomeCol >= 0 ? String(row[incomeCol] ?? '').trim() : '';
    const sheetMarital = maritalCol >= 0 ? String(row[maritalCol] ?? '').trim() : '';
    const sheetFamily = familyCol >= 0 ? String(row[familyCol] ?? '').trim() : '';
    const sheetChild = childCol >= 0 ? String(row[childCol] ?? '').trim() : '';
    const sheetDist = distCol >= 0 ? String(row[distCol] ?? '').trim() : '';
    const sheetDong = dongCol >= 0 ? String(row[dongCol] ?? '').trim() : '';

    const demo = enrichKbpiRespondentDemographics({
      seq,
      finalId,
      region,
      gender,
      age,
      ageGroup,
      education: sheetEdu || prev.education || '',
      job: sheetJob || prev.job || '',
      householdIncome: sheetIncome || prev.householdIncome || '',
      maritalStatus: sheetMarital || prev.maritalStatus || '',
      familySize: sheetFamily || prev.familySize || '',
      childrenCount: sheetChild || prev.childrenCount || '',
      surveyDistrict: sheetDist || prev.surveyDistrict || '',
      surveyDong: sheetDong || prev.surveyDong || ''
    });

    for (const k of ['education', 'job', 'householdIncome', 'maritalStatus', 'familySize', 'childrenCount', 'surveyDistrict', 'surveyDong']) {
      if (demo[k] !== prev[k]) updatedCount++;
    }

    const maxSlot = Math.max(20, slotCols.length, Array.isArray(prev.categoryConfigs) ? prev.categoryConfigs.length : 0);
    const prevConfigs = normalizeCategoryConfigs(prev.categoryConfigs || [], maxSlot);

    for (const sc of slotCols) {
      const idx = sc.slot - 1;
      const sheetBrand = String(row[sc.brandCol] || '').trim();
      const sheetExpRaw = sc.expCol >= 0 ? String(row[sc.expCol] || '').trim() : '';
      let normExp = '';
      if (sheetExpRaw === '없음' || sheetExpRaw === '아니오' || sheetExpRaw.toUpperCase() === 'X') normExp = '없음';
      else if (sheetExpRaw === '있음' || sheetExpRaw === '예' || sheetExpRaw.toUpperCase() === 'O') normExp = '있음';

      if (sheetBrand && prevConfigs[idx].categoryName !== sheetBrand) {
        prevConfigs[idx].categoryName = sheetBrand;
        updatedCount++;
      }
      if (normExp && normExp !== prevConfigs[idx].purchaseExp) {
        prevConfigs[idx].purchaseExp = normExp;
        updatedCount++;
      }
    }

    const preserveState = prev.quotaStatus === 'completed' || prev.quotaStatus === 'pilot_done' || prev.quotaStatus === 'scanned';
    let resolvedQuotaStatus = 'ready';
    if (preserveState) {
      resolvedQuotaStatus = prev.quotaStatus;
    } else if (sheetStatus === '완료') {
      resolvedQuotaStatus = 'completed';
    } else if (/완료직전|문항4/.test(sheetStatus)) {
      resolvedQuotaStatus = 'pilot_done';
    } else if (/신상등록|스캔완료/.test(sheetStatus)) {
      resolvedQuotaStatus = 'scanned';
    } else {
      resolvedQuotaStatus = prev.quotaStatus || 'ready';
    }

    const nextStatus = preserveState ? (prev.status || sheetStatus || '대기') : (sheetStatus || prev.status || '대기');

    mergedList.push({
      ...prev,
      index: seq,
      seq,
      region,
      gender,
      ageGroup,
      name,
      ceoName: name,
      companyName: `${name} (${region}·${gender}·${ageGroup})`,
      age,
      ceoAge: age,
      ceoGender: gender,
      phone,
      phoneType: phone.startsWith('010') ? 'mobile' : 'landline',
      finalId,
      uid,
      gpsLabel: gps.baseLabel,
      latitude: gps.latitude,
      longitude: gps.longitude,
      ...demo,
      categoryConfigs: prevConfigs,
      status: nextStatus,
      quotaStatus: resolvedQuotaStatus,
      progress: resolvedQuotaStatus === 'completed' ? '100%' : (prev.progress || '0%')
    });
  }

  return { mergedList, updatedCount };
}

/**
 * 구글 스프레드시트 공개 XLSX 익스포트를 통해 최신 신상·배경변인 및 [브랜드N | 구입경험N] 설정을 실시간으로 읽어와 병합
 */
export async function pullKbpiSheetOverrides({
  quotaDatabase = [],
  sheetId = KBPI_DEFAULT_SHEET_ID,
  tabName = KBPI_DEFAULT_TAB_NAME,
  quotasDir = null
} = {}) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`;
  const res = await fetch(exportUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`구글 스프레드시트 다운로드 실패 (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const { mergedList, updatedCount } = parseKbpiWorkbookAndMerge({
    wb,
    quotaDatabase,
    tabName
  });

  if (quotasDir && mergedList.length > 0) {
    persistKbpiQuotaDatabase({ quotaDatabase: mergedList, quotasDir });
  }

  return {
    success: true,
    totalCount: mergedList.length,
    updatedCount,
    quotaDatabase: mergedList
  };
}

let kbpiSheetWriteQueue = Promise.resolve();

/**
 * 실행 결과(H열 진행상태, K4:R154 배경변인·조사구·조사동, S4~ 브랜드N·구입경험N)를 구글 스프레드시트 2번 탭에 직렬 안전 기입
 */
export function syncKbpiProgressToGoogleSheet(options = {}) {
  const runTask = async () => _syncKbpiProgressToGoogleSheetImpl(options);
  const nextPromise = kbpiSheetWriteQueue.then(runTask, runTask);
  kbpiSheetWriteQueue = nextPromise.catch(err => {
    console.warn(`[K-BPI 구글시트 동기화 큐 경고] ${err.message}`);
  });
  return nextPromise;
}

async function _syncKbpiProgressToGoogleSheetImpl({
  quotaDatabase = [],
  sheetUrl = KBPI_DEFAULT_SHEET_URL,
  tabName = KBPI_DEFAULT_TAB_NAME,
  quotasDir = null
} = {}) {
  if (!Array.isArray(quotaDatabase) || quotaDatabase.length === 0) {
    return { success: false, error: '동기화할 쿼터 데이터가 없습니다.' };
  }

  if (quotasDir) {
    persistKbpiQuotaDatabase({ quotaDatabase, quotasDir });
  }

  const sorted = [...quotaDatabase]
    .sort((a, b) => Number(a.seq || a.index || 0) - Number(b.seq || b.index || 0))
    .map((it, idx) => ({
      ...it,
      ...enrichKbpiRespondentDemographics({ ...it, seq: it.seq || it.index || idx + 1 })
    }));

  let maxSlots = 20;
  for (const item of sorted) {
    if (Array.isArray(item.categoryConfigs) && item.categoryConfigs.length > maxSlots) {
      maxSlots = item.categoryConfigs.length;
    }
  }

  const sanitizeCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

  // 1) H5:H154 (진행상태 열 업데이트)
  const statusTsv = sorted
    .map(it => sanitizeCell(it.status || '대기'))
    .join('\n');

  // 2) K4:... (학력 | 직업 | 가구소득 | 결혼여부 | 가족수 | 자녀수 | 조사구 | 조사동 + 브랜드1..N / 구입경험1..N 통합 기입)
  const metaHeaders = ['학력', '직업', '가구소득', '결혼여부', '가족수', '자녀수', '조사구', '조사동'];
  const pairHeaders = [];
  for (let s = 1; s <= maxSlots; s++) {
    pairHeaders.push(`브랜드${s}`, `구입경험${s}`);
  }
  const k4Lines = [[...metaHeaders, ...pairHeaders].join('\t')];
  for (const it of sorted) {
    const cfgs = normalizeCategoryConfigs(it.categoryConfigs, maxSlots);
    const cells = [
      sanitizeCell(it.education),
      sanitizeCell(it.job),
      sanitizeCell(it.householdIncome),
      sanitizeCell(it.maritalStatus),
      sanitizeCell(it.familySize),
      sanitizeCell(it.childrenCount),
      sanitizeCell(it.surveyDistrict),
      sanitizeCell(it.surveyDong)
    ];
    for (let s = 0; s < maxSlots; s++) {
      cells.push(
        sanitizeCell(cfgs[s]?.categoryName || ''),
        sanitizeCell(cfgs[s]?.purchaseExp || '')
      );
    }
    k4Lines.push(cells.join('\t'));
  }
  const k4Tsv = k4Lines.join('\n');

  let browser;
  try {
    const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors'],
      ...(proxyServer ? { proxy: { server: proxyServer } } : {})
    });
    const context = await browser.newContext({
      viewport: { width: 1500, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(sheetUrl || KBPI_DEFAULT_SHEET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 40000
    });
    await page.waitForTimeout(4500);

    const tabLocator = page.locator('.docs-sheet-tab-name', { hasText: tabName });
    if ((await tabLocator.count()) > 0) {
      await tabLocator.first().click();
      await page.waitForTimeout(2000);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const pasteAtCell = async (cellRef, textToPaste) => {
      const nameBox = page.locator('#t-name-box, .waffle-name-box').first();
      await nameBox.click({ timeout: 4000 });
      await page.waitForTimeout(150);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(cellRef);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);

      await page.evaluate(
        async ({ text }) => {
          try {
            await navigator.clipboard.writeText(text);
          } catch (clipErr) {
            console.warn('클립보드 복사 경고:', clipErr.message);
          }
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const pasteEvt = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
          });
          const target = document.querySelector('.cell-input') || document.activeElement || document.body;
          target.dispatchEvent(pasteEvt);
        },
        { text: textToPaste }
      );
      await page.waitForTimeout(2800);
    };

    await pasteAtCell('H5', statusTsv);
    await pasteAtCell('K4', k4Tsv);
    await page.waitForTimeout(3200);

    return {
      success: true,
      syncedRows: sorted.length,
      maxSlots
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close().catch(err => console.warn('[K-BPI Sheet Sync Browser Close 경고]', err.message));
    }
  }
}
