/**
 * AutoSurvey AI - 온누리상품권 가맹점 스크래퍼 모듈 (onnuri.js)
 * 공인 온누리상품권 플랫폼(https://ongift.or.kr)에서 전통시장별 실존 가맹점 데이터 수집
 */

import { logger } from '../utils/logger.js';

const ONNURI_BASE_URL = 'https://ongift.or.kr';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
  'Origin': 'https://ongift.or.kr',
  'Content-Type': 'application/x-www-form-urlencoded'
};

/**
 * 1. 전국 시/도 목록 조회
 */
export async function getOnnuriRegions() {
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
 * 2. 특정 시/도의 시/군/구 목록 조회
 */
export async function getOnnuriDistricts(regionCode) {
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

/**
 * 3. 특정 시장의 온누리상품권 가맹점 목록 조회
 * @param {Object} options
 * @param {string} options.regionCode - 시/도 코드 (예: '01')
 * @param {string} options.districtCode - 시/군/구 코드 (예: '01018')
 * @param {string} options.marketName - 시장명 (예: '풍납시장')
 * @param {string} [options.statusFilter='ALL'] - 'ACTIVE'(정상가맹만) | 'ALL'
 * @param {string} [options.paymentFilter='ALL'] - 'PAPER' | 'DIGITAL' | 'ALL'
 * @param {number} [options.limit=10] - 가져올 최대 수량
 */
export async function getMarketMerchants({
  regionCode = '',
  districtCode = '',
  marketName = '',
  statusFilter = 'ACTIVE',
  paymentFilter = 'ALL',
  limit = 10
}) {
  logger.info(`[Onnuri] 온누리 가맹점 조회 시작 - 지역코드: "${regionCode}", 구코드: "${districtCode}", 시장명: "${marketName}"`);

  try {
    const body = new URLSearchParams({
      SEARCH_LCLGV_CD: regionCode,
      SEARCH_SGG_CD: districtCode,
      SEARCH_MRKT_NM: marketName.trim(),
      SEARCH_TYPE: '1',
      SEARCH_WORD: '',
      pageIndex: '1',
      recordCountPerPage: '500' // 넉넉히 가져온 뒤 필터링
    });

    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: body.toString()
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }

    const data = await res.json();
    const rawList = data.list || [];
    logger.info(`[Onnuri] 공인 플랫폼 응답 원본 가맹점 수: ${rawList.length}건`);

    // 1차 필터링
    let filtered = rawList.filter(item => {
      // 시장명 일치 여부 확인 (입력된 경우)
      if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) {
        return false;
      }

      // 가맹 상태 필터
      if (statusFilter === 'ACTIVE') {
        if (item.AFFL_STTS_SE !== '정상가맹') return false;
      }

      // 온누리 결제 방식 필터
      if (paymentFilter === 'PAPER') {
        if (item.KNPP_HNDL_YN !== 'Y') return false;
      } else if (paymentFilter === 'DIGITAL') {
        if (item.MOBL_HNDL_YN !== 'Y') return false;
      }

      return true;
    });

    logger.info(`[Onnuri] 조건 부합 가맹점: ${filtered.length}건 (목표 수량: ${limit}건)`);

    // 정제하여 반환 규격 통일
    const result = filtered.slice(0, limit).map((item, idx) => {
      const rawBizNo = item.FRCS_ENBRNO || '';
      const formattedBizNo = formatBizNumber(rawBizNo);

      return {
        seq: idx + 1,
        source: 'ONNURI_PLATFORM',
        marketName: item.MRKT_NM || marketName,
        companyName: item.ACTL_FRCS_NM || '가맹점명 미기재',
        bizNumber: formattedBizNo,
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

    return result;

  } catch (err) {
    logger.error(`[Onnuri] 가맹점 조회 중 오류: ${err.message}`);
    throw err;
  }
}

/**
 * 4. 특정 시장의 실시간 업종별 가맹점 보유 통계 조회
 */
export async function getMarketIndustryStats({
  regionCode = '',
  districtCode = '',
  marketName = ''
}) {
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

    // 표준 9대 업종 매핑 키
    const standardCategories = {
      '농산물': { key: '농산물', label: '농산물', onnuriKey: '농산물', count: 0, active: 0, withBiz: 0 },
      '축산물': { key: '축산물', label: '축산물', onnuriKey: '축산물', count: 0, active: 0, withBiz: 0 },
      '수산물': { key: '수산물', label: '수산물', onnuriKey: '수산물', count: 0, active: 0, withBiz: 0 },
      '가공식품': { key: '가공식품', label: '가공식품', onnuriKey: '가공식품', count: 0, active: 0, withBiz: 0 },
      '의류신발': { key: '의류신발', label: '의류/신발', onnuriKey: '의류및신발', count: 0, active: 0, withBiz: 0 },
      '가정용품': { key: '가정용품', label: '가정용품', onnuriKey: '가정용품', count: 0, active: 0, withBiz: 0 },
      '음식점업': { key: '음식점업', label: '음식점업', onnuriKey: '음식점업', count: 0, active: 0, withBiz: 0 },
      '기타소매': { key: '기타소매', label: '기타소매', onnuriKey: '기타소매업', count: 0, active: 0, withBiz: 0 },
      '근린상권': { key: '근린상권', label: '근린상권', onnuriKey: '근린상권서비스', count: 0, active: 0, withBiz: 0 }
    };

    let householdSubstitutes = 0;
    const seenBiz = new Set();

    rawList.forEach(item => {
      if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) {
        return;
      }

      const tp = (item.TPBIZ_NM || '').trim();
      const isActive = item.AFFL_STTS_SE === '정상가맹';
      const rawBiz = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
      const hasBiz = rawBiz.length === 10;
      const cName = item.ACTL_FRCS_NM || '';

      // 9대 카테고리 매칭
      for (const cat of Object.values(standardCategories)) {
        if (cat.onnuriKey === tp) {
          cat.count++;
          if (isActive) cat.active++;
          if (isActive && hasBiz) cat.withBiz++;
        }
      }

      // 가정용품 대체재 실태 파악 (기타소매 중 침구, 철물, 잡화)
      if (isActive && hasBiz && tp === '기타소매업') {
        if (cName.includes('침구') || cName.includes('철물') || cName.includes('프라자') || cName.includes('디씨마트')) {
          householdSubstitutes++;
        }
      }
    });

    return {
      marketName: marketName.trim(),
      totalRawCount: rawList.length,
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
 */
export async function getStratifiedMarketMerchants({
  regionCode = '',
  districtCode = '',
  marketName = '',
  industryQuotas = {},
  enableSmartFallback = true
}) {
  logger.info(`[Onnuri] 층화 표본 추출 시작 - 대상 시장: "${marketName}", 업종별 할당: ${JSON.stringify(industryQuotas)}`);

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

  // 정상가맹 및 10자리 고유 사업자번호 점포만 필터링
  const seenBiz = new Set();
  const validMerchants = [];

  for (const item of rawList) {
    if (marketName && item.MRKT_NM && !item.MRKT_NM.includes(marketName.trim()) && !marketName.trim().includes(item.MRKT_NM)) {
      continue;
    }
    if (item.AFFL_STTS_SE !== '정상가맹') continue;

    const rawBizNo = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
    if (rawBizNo.length !== 10 || seenBiz.has(rawBizNo)) continue;

    seenBiz.add(rawBizNo);
    validMerchants.push({
      marketName: item.MRKT_NM || marketName,
      companyName: item.ACTL_FRCS_NM || '가맹점명 미기재',
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

  // 1. 요청된 업종별로 할당 수량만큼 순차 추출
  for (const [catName, quotaCount] of Object.entries(industryQuotas)) {
    const targetCount = parseInt(quotaCount, 10) || 0;
    if (targetCount <= 0) continue;

    const onnuriCategory = standardKeyMap[catName] || catName;
    let candidates = validMerchants.filter(m => m.industry === onnuriCategory && !usedBizNumbers.has(m.bizNumber));

    // 스마트 폴백: 가정용품인데 후보가 부족하고 대체 허용된 경우
    if (catName === '가정용품' && candidates.length < targetCount && enableSmartFallback) {
      const needed = targetCount - candidates.length;
      const substitutes = validMerchants.filter(m =>
        m.industry === '기타소매업' &&
        !usedBizNumbers.has(m.bizNumber) &&
        (m.companyName.includes('침구') || m.companyName.includes('철물') || m.companyName.includes('프라자') || m.companyName.includes('디씨마트'))
      ).slice(0, needed);

      substitutes.forEach(sub => {
        sub.industry = '가정용품';
        sub.subIndustry = '침구/철물/생활잡화 (가정용품)';
      });

      candidates = [...candidates, ...substitutes];
    }

    const picked = candidates.slice(0, targetCount);
    for (const p of picked) {
      usedBizNumbers.add(p.bizNumber);
      selectedResults.push(p);
    }
  }

  logger.info(`[Onnuri] 층화 표본 추출 완료: 총 ${selectedResults.length}건 선별`);
  return selectedResults.map((item, idx) => ({ seq: idx + 1, ...item }));
}

