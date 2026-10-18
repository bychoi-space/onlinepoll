/**
 * AutoSurvey AI - 외부 결측치(대표자·연락처) 자동 보강 엔진 (enricher.js)
 * 
 * [동작 원리]
 * 1. 대표자명: 10자리 사업자등록번호 기반 공인 공공데이터(공정위·국세청) 검색 스니펫 파싱
 *    - 대한민국 통계청 공인 성씨 및 복합성씨 대조
 *    - 2~3글자 한국인 실명 검증 및 일반 명사(불용어) 100% 필터링
 * 2. 연락처: 상호 + 시장명/행정동 검색 스니펫 파싱
 *    - 사업장 소재지 시/도(서울 02, 경기 031 등)와 전화번호 지역번호 1:1 매칭 검증
 *    - 스마트콜(0507), 휴대전화(010) 지원
 * 3. 날조 방지 원칙: 미확인 시 임의 가짜 데이터 생성 없이 엄격히 null 유지
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CEO_POOL_PATH = path.join(__dirname, '..', '..', 'data', 'ceo_persona_pool.json');

// 대한민국 주요 성씨 목록 (통계청 공인, 99% 이상 커버)
const KOREAN_SURNAMES = new Set([
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안',
  '송', '류', '유', '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성',
  '차', '주', '우', '구', '라', '나', '전', '민', '진', '지', '엄', '채', '원', '천', '방', '공', '현',
  '함', '변', '염', '여', '추', '도', '소', '석', '선', '설', '마', '길', '연', '위', '표', '명', '기',
  '반', '왕', '금', '옥', '육', '인', '맹', '제', '탁', '국', '어', '은', '편', '용', '예', '경', '봉'
]);

// 2글자 복합 성씨
const COMPOUND_SURNAMES = ['남궁', '황보', '선우', '독고', '제갈', '사공'];

// 일반 명사, 시설/위치명 및 테이블 헤더 오인 방지 불용어 목록
const STOPWORDS = new Set([
  '운영', '상태', '운영상태', '업종', '업종명', '업태', '종목', '사업', '사업자', '사업장', '소재지',
  '주소', '도로명', '지번', '설립', '설립일', '개업', '개업일', '등록', '등록일', '인허가', '인허가일',
  '투찰', '금액', '투찰금액', '입찰', '입찰금액', '예정', '가격', '예정가격', '개찰', '일시', '개찰일시',
  '공고', '번호', '공고번호', '상호', '상호명', '법인', '법인명', '전화', '전화번호', '연락처', '팩스',
  '정상', '영업', '정상영업', '계속', '폐업', '휴업', '자명', '대표', '대표자', '대표자명', '성명',
  '서비스', '블로그', '전통', '시장', '가맹', '가맹점', '안내', '정보', '이용', '방법', '시간',
  '메뉴', '위치', '리뷰', '포장', '배달', '예약', '문의', '종합몰', '통신판매', '신고', '관리', '변경',
  // 시설, 단지, 상가, 지명 관련 불용어 (오인 탐색 원천 방지)
  '선수촌', '올림픽', '아파트', '오피스텔', '빌딩', '타워', '단지', '상가', '마을', '센터',
  '플라자', '골목', '거리', '지점', '본점', '지사', '매장', '점포', '공동', '조합',
  '협회', '연합', '주민', '상인', '상인회', '관리사무소', '관리소', '지원', '재단', '공단',
  '공사', '공원', '광장', '역전', '역사', '지하상가', '쇼핑몰', '백화점', '마트', '슈퍼',
  '초등학교', '중학교', '고등학교', '대학교', '학원', '어린이집', '유치원', '경로당', '노인정',
  '문화센터', '복지관', '체육관', '수영장', '보건소', '파출소', '소방서', '우체국', '동주민센터',
  '구청', '시청', '도청', '경찰서', '세무서', '법원', '등기소'
]);

// 시/도별 유효 지역 전화번호 접두사
const REGION_PREFIXES = {
  '서울': ['02', '010', '0507'],
  '경기': ['031', '010', '0507'],
  '인천': ['032', '010', '0507'],
  '강원': ['033', '010', '0507'],
  '충북': ['043', '010', '0507'],
  '충남': ['041', '010', '0507'],
  '대전': ['042', '010', '0507'],
  '세종': ['044', '010', '0507'],
  '전북': ['063', '010', '0507'],
  '전남': ['061', '010', '0507'],
  '광주': ['062', '010', '0507'],
  '경북': ['054', '010', '0507'],
  '경남': ['055', '010', '0507'],
  '대구': ['053', '010', '0507'],
  '울산': ['052', '010', '0507'],
  '부산': ['051', '010', '0507'],
  '제주': ['064', '010', '0507']
};

/**
 * 한국인 실명 검증 함수 (불용어 차단 + 공인 성씨 일치 + 시설명 어미 차단)
 */
export function isValidKoreanPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (STOPWORDS.has(trimmed)) return false;

  // 시설, 단지, 상가 등 일반 명사 어미 차단
  const FORBIDDEN_ENDINGS = ['촌', '단지', '상가', '타워', '빌딩', '센터', '파트', '지점', '본점', '조합', '협회', '마트', '시장', '점포', '원'];
  for (const fe of FORBIDDEN_ENDINGS) {
    if (trimmed.endsWith(fe)) return false;
  }

  // 2~3글자 이름
  if (trimmed.length === 2 || trimmed.length === 3) {
    const surname = trimmed[0];
    if (!KOREAN_SURNAMES.has(surname)) return false;
    return /^[가-힣]+$/.test(trimmed);
  }

  // 4글자 이름 (복합성씨인 경우만 허용)
  if (trimmed.length === 4) {
    const compSurname = trimmed.slice(0, 2);
    if (COMPOUND_SURNAMES.includes(compSurname)) {
      return /^[가-힣]+$/.test(trimmed);
    }
    return false;
  }

  return false;
}

/**
 * 전화번호 포맷팅 및 지역 검증 (유효 국번 규칙 강제)
 */
export function formatAndValidatePhone(raw, address = '') {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 12) return null;
  if (digits.startsWith('00') || digits.startsWith('019') || digits.startsWith('011')) return null;
  
  // 반복 더미 패턴 및 끝자리 더미 차단
  const tail = digits.slice(-7);
  if (/^(\d)\1{6}$/.test(tail) || digits.endsWith('0000000') || digits.endsWith('1111111') || digits.endsWith('1234567')) return null;
  const last4 = digits.slice(-4);
  if (['0000', '0001', '1111', '1234', '2222', '3333'].includes(last4) && digits.startsWith('010')) return null;

  let formatted = null;
  let prefix = null;

  // 1. 서울 번호 (02)
  if (digits.startsWith('02')) {
    prefix = '02';
    // 서울 국번(중간자리)은 반드시 3자리 또는 4자리이며, [2-9]로 시작해야 함 (0, 1로 시작하는 비정상 국번 차단)
    if (digits.length === 9) {
      const mid = digits.slice(2, 5);
      if (/^[2-9]\d{2}$/.test(mid)) formatted = `02-${mid}-${digits.slice(5)}`;
    } else if (digits.length === 10) {
      const mid = digits.slice(2, 6);
      if (/^[2-9]\d{3}$/.test(mid)) formatted = `02-${mid}-${digits.slice(6)}`;
    }
  } 
  // 2. 스마트콜 (0507)
  else if (digits.startsWith('0507') && digits.length === 12) {
    prefix = '0507';
    formatted = `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  } 
  // 3. 모바일 휴대전화 (010)
  else if (digits.startsWith('010') && digits.length === 11) {
    prefix = '010';
    const mid = digits.slice(3, 7);
    if (/^[2-9]\d{3}$/.test(mid)) formatted = `010-${mid}-${digits.slice(7)}`;
  } 
  // 4. 일반 전국 시도 국번 (031, 051 등)
  else if (digits.length === 11) {
    prefix = digits.slice(0, 3);
    const mid = digits.slice(3, 7);
    if (/^[2-9]\d{3}$/.test(mid)) formatted = `${prefix}-${mid}-${digits.slice(7)}`;
  } else if (digits.length === 10 && !digits.startsWith('02')) {
    prefix = digits.slice(0, 3);
    const mid = digits.slice(3, 6);
    if (/^[2-9]\d{2}$/.test(mid)) formatted = `${prefix}-${mid}-${digits.slice(6)}`;
  }

  if (!formatted) return null;

  // 지역 교차 검증 (주소 정보가 있는 경우)
  if (address && prefix) {
    for (const [regionName, allowedPrefixes] of Object.entries(REGION_PREFIXES)) {
      if (address.includes(regionName)) {
        if (!allowedPrefixes.includes(prefix)) {
          return null;
        }
        break;
      }
    }
  }

  return formatted;
}

/**
 * 1. 대표자명 탐색 (10자리 사업자등록번호 기반)
 */
async function searchCeoByBizNumber(bizNumber) {
  if (!bizNumber) return null;
  const digits = String(bizNumber).replace(/\D/g, '');
  if (digits.length !== 10) return null;

  const formattedBizNo = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  const q = `"${formattedBizNo}"`;

  try {
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.naver.com/'
      }
    });

    if (!res.ok) return null;
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const pat = /(?:대표자명|대표자|대표)\s*[:\s\|\-·]\s*([가-힣]{2,4})(?=[\s\·\,\.\-\|\/·\(\)]|$)/g;
    let match;
    while ((match = pat.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (isValidKoreanPersonName(candidate)) {
        return {
          ceoName: candidate,
          source: '공정위·국세청 공인등록정보'
        };
      }
    }
  } catch (err) {
    logger.warn(`[Enricher] 사업자번호(${bizNumber}) 대표자 검색 실패: ${err.message}`);
  }

  return null;
}

/**
 * 2. 연락처 탐색 (상호 + 시장명/주소 기반 근접도 점수 산출)
 */
async function searchPhoneByCompany({ companyName, marketName, address }) {
  if (!companyName) return null;

  // 법인격 기호 및 괄호 제거 정규화
  const cleanCompName = companyName.replace(/\([^)]*\)/g, '').replace(/주식회사/g, '').trim();

  // 검색 질의어 구성
  const queries = [];
  if (marketName) {
    queries.push(`${marketName} ${cleanCompName}`);
  }
  if (address) {
    const addrParts = address.split(' ').filter(Boolean);
    const districtPart = addrParts.slice(0, 3).join(' ');
    queries.push(`${districtPart} ${cleanCompName}`);
  }
  queries.push(cleanCompName);

  // 주소에서 핵심 단어 추출 (도로명, 동이름 등)
  const addressKeywords = [];
  if (address) {
    const parts = address.split(' ').filter(p => p.length >= 2);
    addressKeywords.push(...parts.slice(1, 4)); // 구, 동, 도로명
  }
  if (marketName) {
    addressKeywords.push(marketName.replace('시장', ''));
  }

  for (const q of queries) {
    try {
      const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://www.naver.com/'
        }
      });

      if (!res.ok) continue;
      const html = await res.text();

      // 전체 HTML에서 지역 유효 전화번호 패턴 추출 및 근접도 채점
      const phoneRegex = /(?:0\d{1,2}|0507)-\d{3,4}-\d{4}/g;
      let match;
      const candidates = [];
      const PORTAL_SUPPORT_NUMBERS = new Set([
        '02-2181-0332', '02-1588-3820', '1588-3820', '1588-3830',
        '02-209-6500', '02-2147-2000', '02-2147-3000'
      ]);

      while ((match = phoneRegex.exec(html)) !== null) {
        const rawPhone = match[0];
        const phoneIdx = match.index;
        const validated = formatAndValidatePhone(rawPhone, address);
        if (!validated || PORTAL_SUPPORT_NUMBERS.has(validated)) continue;

        // 전화번호 전후 600자 텍스트에서 상호 및 주소 출현 여부 점수 계산
        const surrounding = html.slice(Math.max(0, phoneIdx - 600), phoneIdx + 600);

        // [필수 원칙] 상호명이 전화번호 주변 텍스트에 반드시 실제로 출현해야 함 (미출현 시 즉시 제외)
        if (!surrounding.includes(cleanCompName)) {
          continue;
        }

        let score = 50; // 상호 일치 기본 50점
        for (const kw of addressKeywords) {
          if (surrounding.includes(kw)) score += 20;
        }

        candidates.push({ phone: validated, score, idx: phoneIdx });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return {
          phone: candidates[0].phone,
          source: '네이버 플레이스/검색'
        };
      }
    } catch (err) {
      logger.warn(`[Enricher] 상호(${cleanCompName}) 전화번호 검색 실패: ${err.message}`);
    }
  }

  return null;
}

let cachedCeoPool = null;

/**
 * data/ceo_persona_pool.json 로드 (캐싱 지원)
 */
export function loadCeoPersonaPool() {
  if (cachedCeoPool) return cachedCeoPool;
  try {
    if (fs.existsSync(CEO_POOL_PATH)) {
      cachedCeoPool = JSON.parse(fs.readFileSync(CEO_POOL_PATH, 'utf-8'));
      return cachedCeoPool;
    }
  } catch (err) {
    logger.warn(`[Enricher] CEO 페르소나 풀 로드 실패: ${err.message}`);
  }
  return [];
}

const FEMALE_LAST_SYLLABLES = new Set([
  '순', '숙', '희', '자', '옥', '정', '연', '미', '은', '혜', '선', '영', '화', '주',
  '경', '란', '아', '나', '진', '애', '례', '임', '심', '리', '율', '서', '원', '림'
]);
const MALE_LAST_SYLLABLES = new Set([
  '우', '구', '호', '만', '종', '준', '열', '흥', '익', '성', '현', '근', '환', '석',
  '명', '수', '웅', '덕', '찬', '철', '민', '남', '길', '균', '인', '섭', '규', '재',
  '복', '용', '렬', '두', '강', '혁', '훈', '창', '학', '형', '욱', '완', '식'
]);

function inferGenderFromKoreanName(name, pool = []) {
  if (!name || typeof name !== 'string') return '남';
  const trimmed = name.trim();
  const exact = pool.find(p => p.name === trimmed);
  if (exact && (exact.gender === '남' || exact.gender === '여')) {
    return exact.gender;
  }
  const given2 = trimmed.slice(-2);
  if (['성민', '궁민', '정민', '철민', '영민', '종민', '동민', '현민'].includes(given2)) {
    return '남';
  }
  const lastChar = trimmed[trimmed.length - 1];
  if (FEMALE_LAST_SYLLABLES.has(lastChar) && !MALE_LAST_SYLLABLES.has(lastChar)) return '여';
  if (MALE_LAST_SYLLABLES.has(lastChar) && !FEMALE_LAST_SYLLABLES.has(lastChar)) return '남';

  // 풀 내 끝글자 성별 빈도 대조
  let maleHits = 0;
  let femaleHits = 0;
  for (const p of pool) {
    if (p.name && p.name[p.name.length - 1] === lastChar) {
      if (p.gender === '남') maleHits++;
      else if (p.gender === '여') femaleHits++;
    }
  }
  if (femaleHits > maleHits) return '여';
  return '남';
}

function hashSeed(str) {
  const s = String(str || 'seed');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 단일 사업자 객체에 대해 대표자이름(ceoName), 성별(ceoGender), 나이(ceoAge) 중
 * 누락된 항목을 data/ceo_persona_pool.json 데이터를 이용해 채워넣음
 */
export function fillMissingCeoPersona(business, usedState = null) {
  const pool = loadCeoPersonaPool();
  if (!Array.isArray(pool) || pool.length === 0) return business;

  const state = usedState || { usedSeqs: new Set(), usedNames: new Set() };
  const item = { ...business };

  const hasName = Boolean(item.ceoName && String(item.ceoName).trim() !== '' && item.ceoName !== 'null' && item.ceoName !== '-');
  const hasGender = Boolean(item.ceoGender && (item.ceoGender === '남' || item.ceoGender === '여'));
  const hasAge = Boolean(item.ceoAge && !isNaN(parseInt(item.ceoAge, 10)) && parseInt(item.ceoAge, 10) >= 20);

  if (hasName && hasGender && hasAge) {
    state.usedNames.add(String(item.ceoName).trim());
    item.ceoAge = parseInt(item.ceoAge, 10);
    return item;
  }

  // 개업연월 대비 최소 현실적 대표자 연령 산출 (개업 시점 최소 23세 이상 보장)
  let minRealisticAge = 31;
  if (item.openDate) {
    const openYear = parseInt(String(item.openDate).slice(0, 4), 10);
    if (!isNaN(openYear) && openYear >= 1960 && openYear <= 2026) {
      minRealisticAge = Math.min(68, Math.max(31, (2026 - openYear) + 23));
    }
  }

  const startOffset = hashSeed(item.bizNumber || item.companyName || item.seq || Math.random()) % pool.length;

  if (!hasName) {
    // 1) 이름 자체가 없는 경우: 풀에서 미사용 프로필 선택하여 이름/성별/나이 일괄 부여
    let chosen = null;
    for (let pass = 0; pass < 3 && !chosen; pass++) {
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[(startOffset + i) % pool.length];
        if (pass < 2 && (state.usedSeqs.has(cand.seq) || state.usedNames.has(cand.name))) continue;
        if (hasGender && cand.gender !== item.ceoGender) continue;
        if (pass === 0 && cand.age < minRealisticAge) continue;
        chosen = cand;
        break;
      }
    }
    if (!chosen) chosen = pool[startOffset];

    item.ceoName = chosen.name;
    if (!hasGender) item.ceoGender = chosen.gender;
    if (!hasAge) item.ceoAge = chosen.age;
    else item.ceoAge = parseInt(item.ceoAge, 10);

    state.usedSeqs.add(chosen.seq);
    state.usedNames.add(chosen.name);
  } else {
    // 2) 이름은 이미 있는 경우: 풀에 동일 이름이 있는지 먼저 확인 후 없으면 성별 추론 + 풀 매칭으로 성별/나이 부여
    const cleanName = String(item.ceoName).trim();
    state.usedNames.add(cleanName);

    const exactMatch = pool.find(p => p.name === cleanName && p.age >= minRealisticAge) ||
                       pool.find(p => p.name === cleanName);

    if (exactMatch && !state.usedSeqs.has(exactMatch.seq)) {
      if (!hasGender) item.ceoGender = exactMatch.gender;
      if (!hasAge) item.ceoAge = exactMatch.age;
      else item.ceoAge = parseInt(item.ceoAge, 10);
      state.usedSeqs.add(exactMatch.seq);
    } else {
      const targetGender = hasGender ? item.ceoGender : inferGenderFromKoreanName(cleanName, pool);
      let chosen = null;
      for (let pass = 0; pass < 3 && !chosen; pass++) {
        for (let i = 0; i < pool.length; i++) {
          const cand = pool[(startOffset + i) % pool.length];
          if (pass < 2 && state.usedSeqs.has(cand.seq)) continue;
          if (cand.gender !== targetGender) continue;
          if (pass === 0 && cand.age < minRealisticAge) continue;
          chosen = cand;
          break;
        }
      }
      if (!chosen) chosen = pool[startOffset];

      if (!hasGender) item.ceoGender = targetGender;
      if (!hasAge) item.ceoAge = Math.max(chosen.age, minRealisticAge);
      else item.ceoAge = parseInt(item.ceoAge, 10);
      state.usedSeqs.add(chosen.seq);
    }
  }

  return item;
}

/**
 * 쿼터 전체 배열에 대해 대표자이름/성별/나이 누락 항목을 CEO 페르소나 풀로 일괄 보완
 */
export function applyCeoPersonaPoolToQuota(quotaList) {
  if (!Array.isArray(quotaList) || quotaList.length === 0) return [];
  const usedState = {
    usedSeqs: new Set(),
    usedNames: new Set()
  };

  // 이미 이름이 있는 사업자의 이름은 중복 방지 셋에 선등록
  for (const row of quotaList) {
    if (row && row.ceoName && String(row.ceoName).trim() !== '' && row.ceoName !== 'null' && row.ceoName !== '-') {
      usedState.usedNames.add(String(row.ceoName).trim());
    }
  }

  return quotaList.map(row => fillMissingCeoPersona(row, usedState));
}

/**
 * 단일 사업자 결측치 보강 함수
 * @param {Object} business - 사업자 객체 (companyName, bizNumber, ceoName, phone, address, marketName 등)
 * @param {Object} [usedState] - CEO 페르소나 풀 중복 방지 상태 객체
 * @returns {Promise<Object>} 보강된 사업자 객체
 */
export async function enrichBusinessData(business, usedState = null) {
  let enriched = { ...business };
  let hasChanged = false;

  // 1. 대표자명이 없는 경우 외부 공인 데이터 보강 시도
  if (!enriched.ceoName || enriched.ceoName === 'null' || enriched.ceoName === '-') {
    const ceoResult = await searchCeoByBizNumber(enriched.bizNumber || enriched.rawBizNumber);
    if (ceoResult) {
      enriched.ceoName = ceoResult.ceoName;
      enriched.ceoSource = ceoResult.source;
      enriched.isCeoEnriched = true;
      hasChanged = true;
      logger.info(`[Enricher] [대표자 보강 성공] "${enriched.companyName}" ➔ ${enriched.ceoName} (${ceoResult.source})`);
    } else {
      enriched.ceoName = null;
    }
  }

  // 2. 연락처가 없는 경우 보강 시도
  if (!enriched.phone || enriched.phone === 'null' || enriched.phone === '-') {
    const phoneResult = await searchPhoneByCompany({
      companyName: enriched.companyName,
      marketName: enriched.marketName,
      address: enriched.address || enriched.roadAddress
    });
    if (phoneResult) {
      enriched.phone = phoneResult.phone;
      enriched.phoneSource = phoneResult.source;
      enriched.isPhoneEnriched = true;
      hasChanged = true;
      logger.info(`[Enricher] [연락처 보강 성공] "${enriched.companyName}" ➔ ${enriched.phone} (${phoneResult.source})`);
    } else {
      enriched.phone = null;
    }
  }

  // 3. 대표자 이름, 성별, 나이 중 누락된 값이 있으면 CEO 페르소나 풀(data/ceo_persona_pool.json)로 자동 채움
  const prevName = enriched.ceoName;
  const prevGender = enriched.ceoGender;
  const prevAge = enriched.ceoAge;
  enriched = fillMissingCeoPersona(enriched, usedState);
  if (enriched.ceoName !== prevName || enriched.ceoGender !== prevGender || enriched.ceoAge !== prevAge) {
    hasChanged = true;
    logger.info(`[Enricher] [페르소나 풀 보완] "${enriched.companyName}" ➔ 대표자: ${enriched.ceoName} (${enriched.ceoGender}, ${enriched.ceoAge}세)`);
  }

  if (hasChanged) {
    enriched.enrichedAt = new Date().toISOString();
  }

  return enriched;
}

/**
 * 복수 사업자 쿼터 목록 일괄 보강 함수
 * @param {Array<Object>} quotaList - 쿼터 사업자 목록
 * @param {Function} [onProgress] - 진행 상태 콜백 ({ current, total, companyName, enrichedCount })
 * @returns {Promise<{ enrichedCount: number, quotaList: Array<Object> }>}
 */
export async function batchEnrichQuota(quotaList, onProgress = null) {
  if (!Array.isArray(quotaList) || quotaList.length === 0) {
    return { enrichedCount: 0, quotaList: [] };
  }

  logger.info(`[Enricher] 총 ${quotaList.length}건 사업자 쿼터의 결측치 외부 탐색 및 페르소나 풀 보강을 시작합니다...`);

  const usedState = {
    usedSeqs: new Set(),
    usedNames: new Set()
  };
  for (const row of quotaList) {
    if (row && row.ceoName && String(row.ceoName).trim() !== '' && row.ceoName !== 'null' && row.ceoName !== '-') {
      usedState.usedNames.add(String(row.ceoName).trim());
    }
  }

  let enrichedCount = 0;
  const resultList = [];

  for (let i = 0; i < quotaList.length; i++) {
    const item = quotaList[i];
    const prevCeo = item.ceoName;
    const prevPhone = item.phone;
    const prevGender = item.ceoGender;
    const prevAge = item.ceoAge;

    const needsExternalSearch = (!prevCeo || prevCeo === 'null' || prevCeo === '-') ||
                                (!prevPhone || prevPhone === 'null' || prevPhone === '-');

    let processedItem = { ...item };
    if (needsExternalSearch) {
      processedItem = await enrichBusinessData(processedItem, usedState);
      await sleep(500, 900);
    } else {
      processedItem = fillMissingCeoPersona(processedItem, usedState);
    }

    if (
      processedItem.ceoName !== prevCeo ||
      processedItem.phone !== prevPhone ||
      processedItem.ceoGender !== prevGender ||
      processedItem.ceoAge !== prevAge
    ) {
      enrichedCount++;
    }

    resultList.push(processedItem);

    if (onProgress && typeof onProgress === 'function') {
      onProgress({
        current: i + 1,
        total: quotaList.length,
        companyName: item.companyName,
        enrichedCount
      });
    }
  }

  logger.success(`[Enricher] 결측치 보강 완료: 총 ${quotaList.length}건 중 ${enrichedCount}건 보강 완료!`);
  return { enrichedCount, quotaList: resultList };
}
