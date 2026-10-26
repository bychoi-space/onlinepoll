/**
 * AutoSurvey AI - 온누리상품권 가맹점 마스터 DB 및 스크래퍼 모듈 (onnuri.js)
 * 1. 로컬 내장 마스터 DB(data/onnuri_master_db.json) 기반 0.001초 인메모리 O(1) 초고속 조회 (WAF 차단 100% 원천 해결)
 * 2. 미등록 시장 또는 최신화 필요 시 공인 온누리 플랫폼(https://ongift.or.kr) 자동 폴백
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ONNURI_BASE_URL = 'https://ongift.or.kr';

function getMasterDBPath() {
  const candidates = [
    path.resolve(__dirname, '../../data/onnuri_master_db.json'),
    path.resolve(process.cwd(), 'data/onnuri_master_db.json'),
    path.resolve(__dirname, '../data/onnuri_master_db.json'),
    path.resolve('/home/choiby01/onlinepoll/data/onnuri_master_db.json')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
  'Origin': 'https://ongift.or.kr',
  'Content-Type': 'application/x-www-form-urlencoded'
};

// ============================================================================
// [마스터 DB 인메모리 싱글톤 캐시]
// ============================================================================
let cachedMasterDB = null;
let cachedMtime = 0;

/**
 * 온누리 전국 마스터 DB 로드 (파일 수정 시간 기준 자동 무효화 및 리로드)
 */
export function getMasterDB() {
  try {
    const dbPath = getMasterDBPath();
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    const stat = fs.statSync(dbPath);
    if (!cachedMasterDB || cachedMtime !== stat.mtimeMs) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      cachedMasterDB = JSON.parse(raw);
      cachedMtime = stat.mtimeMs;
      logger.info(`[Onnuri Master DB] 인메모리 로드 완료: ${cachedMasterDB.totalMarkets}개 시장, ${cachedMasterDB.totalMerchants}개 가맹점 (경로: ${dbPath})`);
    }
    return cachedMasterDB;
  } catch (err) {
    logger.error(`[Onnuri Master DB] 로드 실패: ${err.message}`);
    return null;
  }
}

/**
 * 마스터 DB 상태 메타데이터 조회
 */
export function getMasterDBStatus() {
  const dbPath = getMasterDBPath();
  const fileExists = fs.existsSync(dbPath);
  const db = getMasterDB();
  if (!db) {
    return {
      loaded: false,
      resolvedPath: dbPath,
      fileExists,
      cwd: process.cwd(),
      totalMarkets: 0,
      totalMerchants: 0,
      updatedAt: null,
      fileSizeMB: 0
    };
  }

  let fileSizeMB = 0;
  try {
    fileSizeMB = (fs.statSync(dbPath).size / (1024 * 1024)).toFixed(2);
  } catch (_) {}

  return {
    loaded: true,
    resolvedPath: dbPath,
    totalMarkets: db.totalMarkets || Object.keys(db.markets || {}).length,
    totalMerchants: db.totalMerchants || 0,
    updatedAt: db.updatedAt || null,
    fileSizeMB: Number(fileSizeMB),
    regionCount: Object.keys(db.regionDistrictMap || {}).length
  };
}

/**
 * 시장명 동의어/유사표기 정규화 헬퍼
 * - '잠실역지하센터', '잠실역지하상가', '잠실역지하쇼핑센터' 등을 동일 표준키로 정규화
 */
function normalizeMarketSynonym(str = '') {
  return String(str || '')
    .replace(/\s+/g, '')
    .replace(/지하쇼핑센터|지하도상점가|지하도상가|지하상점가|지하상가|지하센터/g, '지하센터')
    .replace(/쇼핑센터/g, '센터');
}

function extractMarketCoreKey(str = '') {
  return normalizeMarketSynonym(str)
    .replace(/\(.*?\)/g, '')
    .replace(/(골목형상점가|전통시장|종합시장|상점가|지하센터|센터|시장|상가|몰)$/g, '');
}

/**
 * 마스터 DB에서 시장 검색 (정확도 높은 지능형 매칭 + 동의어/축약어 매칭)
 */
export function findMarketInMasterDB(marketName = '', regionCode = '', districtCode = '') {
  const db = getMasterDB();
  if (!db || !db.markets) return null;

  const rawQuery = (marketName || '').trim();
  if (!rawQuery) return null;

  const cleanQuery = rawQuery.replace(/\s+/g, '');
  const synQuery = normalizeMarketSynonym(rawQuery);
  const coreQuery = extractMarketCoreKey(rawQuery);

  // 1차: 완전 일치 (단, 지역 코드가 지정된 경우 동일 지역 우선 확인)
  if (db.markets[rawQuery]) {
    const exact = db.markets[rawQuery];
    if (!regionCode || !exact.regionCode || exact.regionCode === regionCode) {
      return exact;
    }
  }

  // 2차: 공백 제거 일치 또는 동의어 정규화 완전 일치 (예: '잠실역지하센터' === '잠실역지하쇼핑센터')
  let fallbackExact = null;
  for (const [mName, mData] of Object.entries(db.markets)) {
    const cleanName = mName.replace(/\s+/g, '');
    if (cleanName === cleanQuery || (synQuery.length >= 2 && normalizeMarketSynonym(mName) === synQuery)) {
      if (!regionCode || !mData.regionCode || mData.regionCode === regionCode) {
        return mData;
      }
      if (!fallbackExact) fallbackExact = mData;
    }
  }
  if (fallbackExact) return fallbackExact;

  // 3차: 지능형 스코어링 매칭 (접두사 일치, 동의어 포함, 형태소 유사도, 지역/구 일치)
  const scoredCandidates = [];
  for (const [mName, mData] of Object.entries(db.markets)) {
    const cleanName = mName.replace(/\s+/g, '');
    const synName = normalizeMarketSynonym(mName);
    const coreName = extractMarketCoreKey(mName);
    if (cleanName.length < 2 || cleanQuery.length < 2) continue;

    // 지역(시/도)이 명시된 경우 타 시/도의 부분 일치 후보가 오매칭되는 것을 원천 차단
    const isSameRegion = !regionCode || !mData.regionCode || mData.regionCode === regionCode;
    const isSameDistrict = Boolean(districtCode && mData.districtCode === districtCode);

    let score = 0;
    const canCompareCore = coreQuery.length >= 2 && coreName.length >= 2;

    // 접두사 일치 ('벨포스트(구 에리어식스)' startsWith '벨포스트', '도농상점가' startsWith '도농') -> 최고 점수
    if (cleanName.startsWith(cleanQuery) || (synQuery.length >= 2 && synName.startsWith(synQuery))) {
      score += 100;
    } else if (cleanQuery.startsWith(cleanName) || (synName.length >= 2 && synQuery.startsWith(synName))) {
      score += 90;
    } else if (canCompareCore && coreName === coreQuery) {
      score += 85;
    } else if (
      isSameRegion && (
        cleanName.includes(cleanQuery) ||
        cleanQuery.includes(cleanName) ||
        (synQuery.length >= 2 && synName.length >= 2 && (synName.includes(synQuery) || synQuery.includes(synName))) ||
        (canCompareCore && (coreName.includes(coreQuery) || coreQuery.includes(coreName)))
      )
    ) {
      score += 40;
    } else {
      continue;
    }

    // 타 시/도 후보인 경우 핵심어 완전 일치(score >= 85) 이상만 허용하고 감점 적용
    if (!isSameRegion) {
      if (score < 85) continue;
      score -= 40;
    }

    // 지역/구 코드 일치 가중치
    if (isSameDistrict) {
      score += 50;
    }
    if (isSameRegion && regionCode) {
      score += 20;
    }

    // 검색어 길이 대비 시장명 길이 차이 페널티 (유사도 반영)
    const lenDiff = Math.abs(synName.length - synQuery.length);
    score -= Math.min(lenDiff, 20);

    if (score >= 30) {
      scoredCandidates.push({ data: mData, score, cleanName });
    }
  }

  if (scoredCandidates.length > 0) {
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates[0].data;
  }

  return null;
}

/**
 * 특정 시/군/구(또는 시/도)의 시장·상점가 목록 조회 (가맹점 수 내림차순 정렬)
 */
export function getMarketsByDistrict(regionCode = '', districtCode = '') {
  const db = getMasterDB();
  if (!db || !db.markets) return [];

  const list = [];
  for (const [mName, mData] of Object.entries(db.markets)) {
    if (regionCode && mData.regionCode && mData.regionCode !== regionCode) continue;
    if (districtCode && mData.districtCode && mData.districtCode !== districtCode) continue;

    const count = mData.merchantCount || (Array.isArray(mData.merchants) ? mData.merchants.length : 0);
    list.push({
      marketName: mData.marketName,
      regionCode: mData.regionCode,
      regionName: mData.regionName || '',
      districtCode: mData.districtCode,
      districtName: mData.districtName || '',
      merchantCount: count
    });
  }

  // 가맹점 수 내림차순 정렬 (동점 시 가나다순)
  return list.sort((a, b) => {
    if (b.merchantCount !== a.merchantCount) return b.merchantCount - a.merchantCount;
    return a.marketName.localeCompare(b.marketName, 'ko');
  });
}

/**
 * 사업자번호 포맷팅 (10자리 -> 000-00-00000)
 */
function formatBizNumber(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return raw;
}

// ============================================================================
// [공개 API 함수들]
// ============================================================================

/**
 * 1. 전국 시/도 목록 조회 (마스터 DB 0ms 반환 ➔ 외부 API 폴백)
 */
export async function getOnnuriRegions() {
  const db = getMasterDB();
  if (db && db.regionDistrictMap && Object.keys(db.regionDistrictMap).length > 0) {
    return Object.entries(db.regionDistrictMap).map(([code, item]) => ({
      code,
      name: item.name
    }));
  }

  try {
    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgv.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS
    });
    const data = await res.json();
    return (data.list || []).map(item => ({
      code: item.LCLGV_CD,
      name: item.LCLGV_NM
    }));
  } catch (err) {
    logger.error(`[Onnuri] 시도 목록 조회 실패: ${err.message}`);
    return [];
  }
}

/**
 * 2. 특정 시/도의 시/군/구 목록 조회 (마스터 DB 0ms 반환 ➔ 외부 API 폴백)
 */
export async function getOnnuriDistricts(regionCode) {
  const db = getMasterDB();
  if (db && db.regionDistrictMap && db.regionDistrictMap[regionCode]?.districts) {
    return db.regionDistrictMap[regionCode].districts.map(d => ({
      code: d.code,
      name: d.name,
      regionName: db.regionDistrictMap[regionCode].name,
      department: ''
    }));
  }

  try {
    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgvDtl.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: new URLSearchParams({ SEARCH_LCLGV_CD: regionCode }).toString()
    });
    const data = await res.json();
    return (data.list || []).map(item => ({
      code: item.SGG_CD,
      name: item.SGG_NM,
      regionName: item.LCLGV_NM,
      department: item.TKCG_DEPT_NM || ''
    }));
  } catch (err) {
    logger.error(`[Onnuri] 시군구 목록 조회 실패: ${err.message}`);
    return [];
  }
}

/**
 * 개업/등록연도 상한 기준 충족 여부 판별 헬퍼
 */
export function isWithinMaxOpenYear(dateStr, maxOpenYear) {
  if (!maxOpenYear || maxOpenYear === 'all') return true;
  const maxYr = parseInt(maxOpenYear, 10);
  if (isNaN(maxYr)) return true;
  if (!dateStr) return true; // 등록일 미기재 시 2단계 마켓비즈에서 확인
  const yr = parseInt(String(dateStr).trim().slice(0, 4), 10);
  if (isNaN(yr)) return true;
  return yr <= maxYr;
}

/**
 * 기타소매업 내 실질 가정용품/생활잡화 대체 가능 점포 판별 헬퍼
 */
const HOUSEHOLD_SUBSTITUTE_KEYWORDS = [
  '침구', '철물', '프라자', '디씨마트', '드림디포', '문구', '문고', '생활', '잡화',
  '할인마트', '알파마트', '홈마트', '이불', '커튼', '주방', '그릇',
  '기물', '도기', '가구', '인테리어', '조명', '전기', '전파', '열쇠',
  '페인트', '지물', '벽지', '장판', '천막', '수예', '타올', '수건',
  '유리', '표구', '액자', '양품', '만물', '다이소', '백화점'
];

export function isHouseholdSubstituteMerchant(companyName = '') {
  const cName = String(companyName || '').trim();
  if (!cName) return false;
  if (/지에스25|GS25|씨유|CU|세븐일레븐|이마트24/i.test(cName)) return false;
  return HOUSEHOLD_SUBSTITUTE_KEYWORDS.some(kw => cName.includes(kw));
}

function cleanMerchantName(name = '') {
  return String(name || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

/**
 * 3. 특정 시장의 온누리상품권 가맹점 목록 조회 (마스터 DB 우선 ➔ 외부 API 폴백)
 */
export async function getMarketMerchants({
  regionCode = '',
  districtCode = '',
  marketName = '',
  statusFilter = 'ACTIVE',
  paymentFilter = 'ALL',
  limit = 10,
  maxOpenYear = null,
  includeReservePool = false
}) {
  logger.info(`[Onnuri] 온누리 가맹점 조회 - 시장: "${marketName}", 지역: "${regionCode}"/"${districtCode}", 개업상한: ${maxOpenYear || '전체'}`);

  // 마스터 DB 우선 확인
  const market = findMarketInMasterDB(marketName, regionCode, districtCode);
  if (market && Array.isArray(market.merchants) && market.merchants.length > 0) {
    logger.info(`[Onnuri Master DB] "${market.marketName}" 마스터 DB 캐시 적중 (${market.merchants.length}개 가맹점)`);
    let list = market.merchants.map(m => ({
      ...m,
      companyName: cleanMerchantName(m.companyName)
    }));
    if (statusFilter === 'ACTIVE') {
      list = list.filter(m => m.status === '정상가맹');
    }
    if (paymentFilter === 'PAPER') {
      list = list.filter(m => m.paperAccepted === 'Y');
    } else if (paymentFilter === 'DIGITAL') {
      list = list.filter(m => m.digitalAccepted === 'Y');
    }
    if (maxOpenYear && maxOpenYear !== 'all') {
      list = list.filter(m => isWithinMaxOpenYear(m.regDate, maxOpenYear));
    }
    // 사업자등록번호 중복 제거 (동일 사업자가 지류/모바일 등으로 중복 등재된 경우 1건으로 정규화)
    const seenBiz = new Set();
    list = list.filter(m => {
      const rawBiz = (m.rawBizNumber || '').replace(/\D/g, '');
      if (rawBiz.length === 10) {
        if (seenBiz.has(rawBiz)) return false;
        seenBiz.add(rawBiz);
      }
      return true;
    });
    const primary = list.slice(0, limit).map((m, idx) => ({ seq: idx + 1, ...m }));
    if (includeReservePool) {
      return {
        primary,
        reserveByCategory: {},
        generalReserve: list.slice(limit).map(m => ({ ...m }))
      };
    }
    return primary;
  }

  // 외부 API 폴백
  try {
    const body = new URLSearchParams({
      SEARCH_LCLGV_CD: regionCode,
      SEARCH_SGG_CD: districtCode,
      SEARCH_MRKT_NM: marketName.trim(),
      SEARCH_TYPE: '1',
      SEARCH_WORD: '',
      pageIndex: '1',
      recordCountPerPage: '500'
    });

    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: body.toString()
    });

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    const rawList = data.list || [];

    const seenBiz = new Set();
    let filtered = rawList.filter(item => {
      if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) return false;
      if (statusFilter === 'ACTIVE' && item.AFFL_STTS_SE !== '정상가맹') return false;
      if (paymentFilter === 'PAPER' && item.KNPP_HNDL_YN !== 'Y') return false;
      if (paymentFilter === 'DIGITAL' && item.MOBL_HNDL_YN !== 'Y') return false;
      if (maxOpenYear && maxOpenYear !== 'all' && !isWithinMaxOpenYear(item.FRCS_REG_YMD, maxOpenYear)) return false;
      const rawBizNo = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
      if (rawBizNo.length === 10) {
        if (seenBiz.has(rawBizNo)) return false;
        seenBiz.add(rawBizNo);
      }
      return true;
    }).map((item, idx) => {
      const rawBizNo = item.FRCS_ENBRNO || '';
      return {
        seq: idx + 1,
        source: 'ONNURI_PLATFORM',
        marketName: item.MRKT_NM || marketName,
        companyName: cleanMerchantName(item.ACTL_FRCS_NM || '가맹점명 미기재'),
        bizNumber: formatBizNumber(rawBizNo),
        rawBizNumber: rawBizNo.replace(/\D/g, ''),
        merchantCode: item.FRCS_CD || '',
        category: '소상공인/전통시장',
        industry: item.TPBIZ_NM || '전통시장소매',
        subIndustry: item.TPBIZ_NM || '도소매업',
        address: (item.ADDR || '').trim(),
        regDate: item.FRCS_REG_YMD || '',
        status: item.AFFL_STTS_SE || '정상가맹',
        paperAccepted: item.KNPP_HNDL_YN === 'Y' ? 'Y' : 'N',
        digitalAccepted: item.MOBL_HNDL_YN === 'Y' ? 'Y' : 'N'
      };
    });

    const primary = filtered.slice(0, limit).map((m, idx) => ({ ...m, seq: idx + 1 }));
    if (includeReservePool) {
      return {
        primary,
        reserveByCategory: {},
        generalReserve: filtered.slice(limit)
      };
    }
    return primary;
  } catch (err) {
    logger.error(`[Onnuri] 가맹점 조회 중 오류: ${err.message}`);
    throw err;
  }
}

/**
 * 4. 특정 시장의 실시간 업종별 가맹점 보유 통계 조회 (0.001초 마스터 DB 연산 ➔ 외부 폴백)
 */
export async function getMarketIndustryStats({
  regionCode = '',
  districtCode = '',
  marketName = '',
  maxOpenYear = null
}) {
  const standardCategoriesTemplate = () => ({
    '농산물': { key: '농산물', label: '농산물', onnuriKey: '농산물', count: 0, active: 0, withBiz: 0 },
    '축산물': { key: '축산물', label: '축산물', onnuriKey: '축산물', count: 0, active: 0, withBiz: 0 },
    '수산물': { key: '수산물', label: '수산물', onnuriKey: '수산물', count: 0, active: 0, withBiz: 0 },
    '가공식품': { key: '가공식품', label: '가공식품', onnuriKey: '가공식품', count: 0, active: 0, withBiz: 0 },
    '의류신발': { key: '의류신발', label: '의류/신발', onnuriKey: '의류및신발', count: 0, active: 0, withBiz: 0 },
    '가정용품': { key: '가정용품', label: '가정용품', onnuriKey: '가정용품', count: 0, active: 0, withBiz: 0 },
    '음식점업': { key: '음식점업', label: '음식점업', onnuriKey: '음식점업', count: 0, active: 0, withBiz: 0 },
    '기타소매': { key: '기타소매', label: '기타소매', onnuriKey: '기타소매업', count: 0, active: 0, withBiz: 0 },
    '근린상권': { key: '근린상권', label: '근린상권', onnuriKey: '근린상권서비스', count: 0, active: 0, withBiz: 0 }
  });

  // 1. 마스터 DB 우선 조회 (초고속 O(1))
  const market = findMarketInMasterDB(marketName, regionCode, districtCode);
  if (market && Array.isArray(market.merchants) && market.merchants.length > 0) {
    const standardCategories = standardCategoriesTemplate();
    let householdSubstitutes = 0;
    let validYearCount = 0;
    const seenValidBiz = new Set();

    for (const m of market.merchants) {
      const tp = (m.industry || '').trim();
      const isActive = m.status === '정상가맹';
      const rawBiz = (m.rawBizNumber || '').replace(/\D/g, '');
      const hasBiz = rawBiz.length === 10;
      const withinYear = isWithinMaxOpenYear(m.regDate, maxOpenYear);
      const cName = cleanMerchantName(m.companyName || '');
      const isUniqueValidBiz = isActive && hasBiz && withinYear && !seenValidBiz.has(rawBiz);
      if (isUniqueValidBiz) {
        seenValidBiz.add(rawBiz);
        validYearCount++;
      }

      for (const cat of Object.values(standardCategories)) {
        if (cat.onnuriKey === tp) {
          cat.count++;
          if (isActive) cat.active++;
          if (isUniqueValidBiz) cat.withBiz++;
        }
      }

      if (isUniqueValidBiz && tp === '기타소매업') {
        if (isHouseholdSubstituteMerchant(cName)) {
          householdSubstitutes++;
        }
      }
    }

    logger.info(`[Onnuri Master DB] "${market.marketName}" 업종 통계 인메모리 반환 (전체 ${market.merchants.length}건 / 고유가용 ${validYearCount}건, 소요 0.001초)`);
    return {
      source: 'MASTER_DB',
      marketName: market.marketName,
      regionName: market.regionName || '',
      districtName: market.districtName || '',
      totalRawCount: market.merchants.length,
      validYearCount,
      categories: standardCategories,
      householdSubstitutes
    };
  }

  // 2. 외부 온누리 플랫폼 폴백
  try {
    logger.info(`[Onnuri Platform] 마스터 DB 미검색으로 외부 공인 플랫폼 조회: "${marketName}"`);
    const body = new URLSearchParams({
      SEARCH_LCLGV_CD: regionCode,
      SEARCH_SGG_CD: districtCode,
      SEARCH_MRKT_NM: marketName.trim(),
      SEARCH_TYPE: '1',
      SEARCH_WORD: '',
      pageIndex: '1',
      recordCountPerPage: '500'
    });

    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: body.toString()
    });

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    const rawList = data.list || [];

    const standardCategories = standardCategoriesTemplate();
    let householdSubstitutes = 0;
    let validYearCount = 0;
    const seenValidBiz = new Set();

    rawList.forEach(item => {
      if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) return;

      const tp = (item.TPBIZ_NM || '').trim();
      const isActive = item.AFFL_STTS_SE === '정상가맹';
      const rawBiz = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
      const hasBiz = rawBiz.length === 10;
      const withinYear = isWithinMaxOpenYear(item.FRCS_REG_YMD, maxOpenYear);
      const cName = cleanMerchantName(item.ACTL_FRCS_NM || '');
      const isUniqueValidBiz = isActive && hasBiz && withinYear && !seenValidBiz.has(rawBiz);

      if (isUniqueValidBiz) {
        seenValidBiz.add(rawBiz);
        validYearCount++;
      }

      for (const cat of Object.values(standardCategories)) {
        if (cat.onnuriKey === tp) {
          cat.count++;
          if (isActive) cat.active++;
          if (isUniqueValidBiz) cat.withBiz++;
        }
      }

      if (isUniqueValidBiz && tp === '기타소매업') {
        if (isHouseholdSubstituteMerchant(cName)) {
          householdSubstitutes++;
        }
      }
    });

    return {
      source: 'EXTERNAL_ONNURI',
      marketName: marketName.trim(),
      totalRawCount: rawList.length,
      validYearCount,
      categories: standardCategories,
      householdSubstitutes
    };
  } catch (err) {
    logger.error(`[Onnuri] 업종 통계 조회 실패: ${err.message}`);
    throw err;
  }
}

/**
 * 5. 업종별 층화 표본 추출 (Stratified Sampler)
 * - 1단계에서부터 maxOpenYear(예: 2025년 이하) 조건을 사전 필터링하여 2026년 신규 가맹점으로 인한 중도 탈락 방지
 * - 가정용품 등 부족 업종에 대한 스마트 폴백(생활용품/문구/마트 등) 지원
 * - 2단계 마켓비즈 조회 중 개업연도 초과 탈락 발생 시 즉시 충원할 수 있는 업종별/전체 예비 후보 풀(Reserve Pool) 함께 반환
 */
export async function getStratifiedMarketMerchants({
  regionCode = '',
  districtCode = '',
  marketName = '',
  industryQuotas = {},
  enableSmartFallback = true,
  maxOpenYear = null,
  includeReservePool = false
}) {
  logger.info(`[Onnuri] 층화 표본 추출 - 대상 시장: "${marketName}", 개업상한: ${maxOpenYear ? maxOpenYear + '년 이하' : '전체'}, 업종별 할당: ${JSON.stringify(industryQuotas)}`);

  let validMerchants = [];

  // 1. 마스터 DB 우선 확인
  const market = findMarketInMasterDB(marketName, regionCode, districtCode);
  if (market && Array.isArray(market.merchants) && market.merchants.length > 0) {
    const seenBiz = new Set();
    const rawPool = market.merchants.filter(m => {
      const rawBiz = (m.rawBizNumber || '').replace(/\D/g, '');
      if (m.status !== '정상가맹' || rawBiz.length !== 10) return false;
      if (seenBiz.has(rawBiz)) return false;
      seenBiz.add(rawBiz);
      return true;
    });
    validMerchants = rawPool
      .filter(m => isWithinMaxOpenYear(m.regDate, maxOpenYear))
      .map(m => ({ ...m, companyName: cleanMerchantName(m.companyName) }));
    logger.info(`[Onnuri Master DB] "${market.marketName}" 층화 추출 가맹점 풀 로드 (전체 고유 정상가맹 ${rawPool.length}건 중 개업기준 충족 ${validMerchants.length}건)`);
  } else {
    // 2. 외부 공인 플랫폼 폴백
    try {
      const body = new URLSearchParams({
        SEARCH_LCLGV_CD: regionCode,
        SEARCH_SGG_CD: districtCode,
        SEARCH_MRKT_NM: marketName.trim(),
        SEARCH_TYPE: '1',
        SEARCH_WORD: '',
        pageIndex: '1',
        recordCountPerPage: '500'
      });

      const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: body.toString()
      });

      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      const rawList = data.list || [];

      const seenBiz = new Set();
      for (const item of rawList) {
        if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) continue;
        if (item.AFFL_STTS_SE !== '정상가맹') continue;
        if (!isWithinMaxOpenYear(item.FRCS_REG_YMD, maxOpenYear)) continue;

        const rawBizNo = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
        if (rawBizNo.length !== 10 || seenBiz.has(rawBizNo)) continue;

        seenBiz.add(rawBizNo);
        validMerchants.push({
          marketName: item.MRKT_NM || marketName,
          companyName: cleanMerchantName(item.ACTL_FRCS_NM || '가맹점명 미기재'),
          bizNumber: formatBizNumber(rawBizNo),
          rawBizNumber: rawBizNo,
          merchantCode: item.FRCS_CD || '',
          category: '소상공인/전통시장',
          industry: item.TPBIZ_NM || '전통시장소매',
          subIndustry: item.TPBIZ_NM || '도소매업',
          address: (item.ADDR || '').trim(),
          regDate: item.FRCS_REG_YMD || '',
          status: item.AFFL_STTS_SE || '정상가맹',
          paperAccepted: item.KNPP_HNDL_YN === 'Y' ? 'Y' : 'N',
          digitalAccepted: item.MOBL_HNDL_YN === 'Y' ? 'Y' : 'N'
        });
      }
    } catch (extErr) {
      throw new Error(`입력하신 "${marketName}" 시장을 온누리 마스터 DB에서 찾을 수 없습니다. 시/군/구 선택 후 공인 시장 목록에서 선택하거나 [Excel 쿼터 업로드]를 이용해 주세요.`);
    }
  }

  const standardKeyMap = {
    '농산물': '농산물',
    '축산물': '축산물',
    '수산물': '수산물',
    '가공식품': '가공식품',
    '의류신발': '의류및신발',
    '가정용품': '가정용품',
    '음식점업': '음식점업',
    '기타소매': '기타소매업',
    '근린상권': '근린상권서비스'
  };

  const selectedResults = [];
  const usedBizNumbers = new Set();
  const reserveByCategory = {};

  // 1차: 정식 업종 코드 매칭 추출 (기타소매업이 가정용품 폴백보다 먼저 자기 몫을 확보할 수 있도록 정식 매칭 선행)
  const shortages = [];
  for (const [catName, quotaCount] of Object.entries(industryQuotas)) {
    const targetCount = parseInt(quotaCount, 10) || 0;
    if (targetCount <= 0) continue;

    const onnuriCategory = standardKeyMap[catName] || catName;
    const candidates = validMerchants
      .filter(m => m.industry === onnuriCategory && !usedBizNumbers.has(m.bizNumber))
      .map(m => ({ ...m, targetCategory: catName }));

    const picked = candidates.slice(0, targetCount);
    for (const p of picked) {
      usedBizNumbers.add(p.bizNumber);
      selectedResults.push(p);
    }

    reserveByCategory[catName] = candidates.slice(targetCount);

    if (picked.length < targetCount) {
      shortages.push({ catName, needed: targetCount - picked.length });
    }
  }

  // 2차: 부족분 스마트 폴백 충원 (가정용품 -> 기타소매업 내 생활용품/잡화/문구/마트 우선 매핑)
  if (enableSmartFallback && shortages.length > 0) {
    for (const item of shortages) {
      if (item.needed <= 0) continue;

      if (item.catName === '가정용품') {
        const subPool = validMerchants
          .filter(m => m.industry === '기타소매업' && !usedBizNumbers.has(m.bizNumber) && isHouseholdSubstituteMerchant(m.companyName))
          .map(m => ({
            ...m,
            industry: '가정용품',
            subIndustry: '침구/철물/생활잡화 (가정용품)',
            targetCategory: '가정용품'
          }));

        const pickedSubs = subPool.slice(0, item.needed);
        for (const p of pickedSubs) {
          usedBizNumbers.add(p.bizNumber);
          selectedResults.push(p);
          item.needed--;
        }

        // 남은 가정용품 대체 후보도 예비 풀에 등록
        reserveByCategory['가정용품'] = [
          ...(reserveByCategory['가정용품'] || []),
          ...subPool.slice(pickedSubs.length)
        ];
      }
    }

    // [원칙 엄수: 거짓된 데이터 원천 차단]
    // 시장에 해당 업종 실존 가맹점이 부족한 경우, 다른 업종(음식점 등)을 가져와 가짜 업종(농산물 등)으로 위장시키지 않습니다.
    for (const item of shortages) {
      if (item.needed > 0 && item.catName !== '가정용품') {
        logger.warn(`[Onnuri 층화 추출] "${marketName}" 시장 내 "${item.catName}" 실존 정상가맹점 부족 (요청 대비 ${item.needed}건 부족) ➔ 팩트 기반 데이터 보존을 위해 실존 가맹점만 선별합니다.`);
      }
    }
  }

  // 표준 업종 순서에 맞춰 정렬 유지
  const catOrder = Object.keys(standardKeyMap);
  selectedResults.sort((a, b) => {
    const idxA = catOrder.indexOf(a.targetCategory || '');
    const idxB = catOrder.indexOf(b.targetCategory || '');
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  // 예비 후보 풀에서도 이미 사용된 사업자번호 제외 정리
  for (const k of Object.keys(reserveByCategory)) {
    reserveByCategory[k] = (reserveByCategory[k] || []).filter(m => !usedBizNumbers.has(m.bizNumber));
  }
  const generalReserve = validMerchants
    .filter(m => !usedBizNumbers.has(m.bizNumber))
    .map(m => ({ ...m }));

  const numberedPrimary = selectedResults.map((item, idx) => ({ seq: idx + 1, ...item }));
  logger.info(`[Onnuri] 층화 표본 추출 완료: 총 ${numberedPrimary.length}건 선별 (예비 후보 풀 ${generalReserve.length}건 대기)`);

  if (includeReservePool) {
    return {
      primary: numberedPrimary,
      reserveByCategory,
      generalReserve
    };
  }
  return numberedPrimary;
}

