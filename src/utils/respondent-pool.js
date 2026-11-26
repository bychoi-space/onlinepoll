/**
 * 오토서베이 통합 응답자 페르소나 마스터 DB (이름·성별·나이 1,138명) 관리 및 배정 유틸리티
 * - 원본 DB: data/respondent_persona_pool.json
 * - 연동 구글 시트: https://docs.google.com/spreadsheets/d/13mKKRWN09YHep3Aodt2F9h_xoPgDmX6QOLTBbTqtIQ0/edit
 * - 역할: 신규/범용 B2C·B2B 설문 쿼터 생성 및 설문 자동 응답 실행 시 조건(성별, 나이, 연령대)에 맞는
 *         실측 응답자 프로필(이름·성별·나이)을 캠페인 내 중복 없이 결정론적으로 배정·재활용합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RESPONDENT_POOL_PATH = path.resolve(__dirname, '..', '..', 'data', 'respondent_persona_pool.json');
export const LEGACY_CEO_POOL_PATH = path.resolve(__dirname, '..', '..', 'data', 'ceo_persona_pool.json');
export const RESPONDENT_POOL_GOOGLE_SHEET_ID = '13mKKRWN09YHep3Aodt2F9h_xoPgDmX6QOLTBbTqtIQ0';
export const RESPONDENT_POOL_GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RESPONDENT_POOL_GOOGLE_SHEET_ID}/edit`;

const PLACEHOLDER_NAME_PATTERNS = [
  /^응답자/,
  /^대표자$/,
  /^점포주$/,
  /^관리소장$/,
  /^관리인$/,
  /^담당자$/,
  /^무기명$/,
  /^미상$/,
  /^합계$/,
  /^null$/i,
  /^undefined$/i,
  /^\-+$/,
  /\*/
];

const FEMALE_LAST_SYLLABLES = new Set([
  '순', '숙', '희', '자', '옥', '정', '연', '미', '은', '혜', '선', '영', '화', '주',
  '경', '란', '아', '나', '진', '애', '례', '임', '심', '리', '율', '서', '원', '림'
]);
const MALE_LAST_SYLLABLES = new Set([
  '우', '구', '호', '만', '종', '준', '열', '흥', '익', '성', '현', '근', '환', '석',
  '명', '수', '웅', '덕', '찬', '철', '민', '남', '길', '균', '인', '섭', '규', '재',
  '복', '용', '렬', '두', '강', '혁', '훈', '창', '학', '형', '욱', '완', '식'
]);

let cachedPoolPayload = null;

/**
 * 나이를 표준 연령대 문자열('10대' ~ '70대 이상')로 변환
 */
export function resolveAgeGroupLabel(age) {
  const n = parseInt(age, 10);
  if (isNaN(n) || n < 20) return '10대';
  if (n < 30) return '20대';
  if (n < 40) return '30대';
  if (n < 50) return '40대';
  if (n < 60) return '50대';
  if (n < 70) return '60대';
  return '70대 이상';
}

/**
 * 성별 입력값('남', '남성', '남자', '1', 'M' 등)을 표준 '남' | '여' | '' 로 정규화
 */
export function normalizePoolGender(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (s === '남' || s === '남자' || s === '남성' || s === '1' || lower === 'm' || lower === 'male') return '남';
  if (s === '여' || s === '여자' || s === '여성' || s === '2' || lower === 'f' || lower === 'female') return '여';
  return '';
}

/**
 * 연령대 텍스트('20대', '20대 초반 대학생', 'age70', '30대이하', '60대 이상' 등)에서 [minAge, maxAge] 범위 파싱
 */
export function parseAgeRangeConstraint(ageGroupOrText) {
  const s = String(ageGroupOrText ?? '').trim();
  if (!s) return null;

  if (/10대|청소년|중학|고등/.test(s)) return { minAge: 14, maxAge: 19 };
  if (/20대\s*초반/.test(s)) return { minAge: 20, maxAge: 24 };
  if (/20대\s*후반/.test(s)) return { minAge: 25, maxAge: 29 };
  if (/30대\s*이하/.test(s)) return { minAge: 20, maxAge: 39 };
  if (/70대|age70|70세\s*이상/.test(s)) return { minAge: 70, maxAge: 100 };
  if (/60대\s*이상/.test(s)) return { minAge: 60, maxAge: 100 };

  const decadeMatch = s.match(/(10|20|30|40|50|60|70)\s*대/);
  if (decadeMatch) {
    const base = parseInt(decadeMatch[1], 10);
    return { minAge: base, maxAge: base === 70 ? 100 : base + 9 };
  }

  const ageCodeMatch = s.match(/^age(10|20|30|40|50|60|70)$/i);
  if (ageCodeMatch) {
    const base = parseInt(ageCodeMatch[1], 10);
    return { minAge: base, maxAge: base === 70 ? 100 : base + 9 };
  }

  const exactNum = parseInt(s, 10);
  if (!isNaN(exactNum) && String(exactNum) === s && exactNum >= 10 && exactNum <= 105) {
    return { minAge: exactNum, maxAge: exactNum };
  }

  return null;
}

/**
 * 유효한 실명인지 판별 (플레이스홀더·마스킹·공란 제외)
 */
export function isValidRespondentName(name) {
  const s = String(name ?? '').trim();
  if (!s || s.length < 2) return false;
  for (const pat of PLACEHOLDER_NAME_PATTERNS) {
    if (pat.test(s)) return false;
  }
  const cleaned = s.replace(/\(.*?\)/g, '').replace(/\s+외\s*\d+.*$/, '').replace(/\s+/g, '');
  return /^[가-힣]{2,5}$/.test(cleaned);
}

export function hashRespondentSeed(seedValue) {
  const s = String(seedValue ?? 'respondent_seed');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 한글 이름 기반 성별 추론 (풀 내 실측 일치 우선 ➔ 끝글자 규칙 ➔ 풀 빈도)
 */
export function inferGenderByName(name, poolItems = []) {
  if (!name || typeof name !== 'string') return '남';
  const trimmed = name.trim();
  const exact = poolItems.find(p => p.name === trimmed);
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

  let maleHits = 0;
  let femaleHits = 0;
  for (const p of poolItems) {
    if (p.name && p.name[p.name.length - 1] === lastChar) {
      if (p.gender === '남') maleHits++;
      else if (p.gender === '여') femaleHits++;
    }
  }
  return femaleHits > maleHits ? '여' : '남';
}

/**
 * 통합 응답자 페르소나 마스터 DB 로드 (캐싱 지원)
 * @returns {Array<{seq:number, name:string, gender:string, age:number, ageGroup:string, birthYear:number, sources?:string[]}>}
 */
export function loadRespondentPersonaPool() {
  if (cachedPoolPayload && Array.isArray(cachedPoolPayload.items)) {
    return cachedPoolPayload.items;
  }
  try {
    if (fs.existsSync(RESPONDENT_POOL_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(RESPONDENT_POOL_PATH, 'utf-8'));
      const rawItems = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const normalized = rawItems.map((it, idx) => {
        const ageNum = parseInt(it.age, 10) || 40;
        return {
          seq: it.seq || idx + 1,
          name: String(it.name || '').trim(),
          gender: normalizePoolGender(it.gender) || '남',
          age: ageNum,
          ageGroup: it.ageGroup || resolveAgeGroupLabel(ageNum),
          birthYear: it.birthYear || (2026 - ageNum),
          sources: Array.isArray(it.sources) ? it.sources : []
        };
      }).filter(it => it.name && (it.gender === '남' || it.gender === '여') && it.age >= 10);

      cachedPoolPayload = {
        ...(Array.isArray(parsed) ? {} : parsed),
        items: normalized
      };
      return normalized;
    }
  } catch (_) {}

  // 폴백: 기존 ceo_persona_pool.json
  try {
    if (fs.existsSync(LEGACY_CEO_POOL_PATH)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CEO_POOL_PATH, 'utf-8'));
      if (Array.isArray(legacy)) {
        const normalized = legacy.map((it, idx) => {
          const ageNum = parseInt(it.age, 10) || 45;
          return {
            seq: it.seq || idx + 1,
            name: String(it.name || '').trim(),
            gender: normalizePoolGender(it.gender) || '남',
            age: ageNum,
            ageGroup: resolveAgeGroupLabel(ageNum),
            birthYear: 2026 - ageNum,
            sources: ['기존 이름모음 (CEO 페르소나 풀)']
          };
        });
        cachedPoolPayload = { items: normalized };
        return normalized;
      }
    }
  } catch (_) {}

  return [];
}

/**
 * 통합 응답자 페르소나 풀 메타데이터 및 연령대×성별 통계 조회
 */
export function getRespondentPoolStats() {
  const items = loadRespondentPersonaPool();
  const bands = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상'];
  const summaryByAgeGroup = {};
  for (const b of bands) {
    summaryByAgeGroup[b] = { male: 0, female: 0, total: 0 };
  }
  let maleCount = 0;
  let femaleCount = 0;
  for (const it of items) {
    const b = summaryByAgeGroup[it.ageGroup] ? it.ageGroup : resolveAgeGroupLabel(it.age);
    if (it.gender === '남') {
      maleCount++;
      summaryByAgeGroup[b].male++;
    } else {
      femaleCount++;
      summaryByAgeGroup[b].female++;
    }
    summaryByAgeGroup[b].total++;
  }
  return {
    title: cachedPoolPayload?.title || '오토서베이 통합 응답자 페르소나 마스터 DB (이름·성별·나이)',
    googleSheetId: RESPONDENT_POOL_GOOGLE_SHEET_ID,
    googleSheetUrl: RESPONDENT_POOL_GOOGLE_SHEET_URL,
    referenceYear: cachedPoolPayload?.referenceYear || 2026,
    totalCount: items.length,
    maleCount,
    femaleCount,
    summaryByAgeGroup
  };
}

/**
 * 캠페인/배치 단위 중복 방지 상태 객체 생성
 */
export function createRespondentUsedState(existingItems = []) {
  const state = {
    usedSeqs: new Set(),
    usedNames: new Set()
  };
  if (Array.isArray(existingItems)) {
    for (const row of existingItems) {
      if (!row) continue;
      const rawName = row.name || row.respondentName || row.ceoName || row.memberName;
      if (isValidRespondentName(rawName)) {
        state.usedNames.add(String(rawName).trim());
      }
    }
  }
  return state;
}

/**
 * 조건(성별, 정확 나이, 최소/최대 나이, 연령대)에 부합하는 응답자 1명을 마스터 DB에서 중복 없이 선택
 */
export function pickRespondentFromPool({
  gender = '',
  exactAge = null,
  minAge = null,
  maxAge = null,
  ageGroup = '',
  seed = 1,
  usedState = null
} = {}) {
  const pool = loadRespondentPersonaPool();
  if (pool.length === 0) {
    return { seq: 0, name: '김민수', gender: '남', age: 35, ageGroup: '30대', birthYear: 1991, sources: [] };
  }

  const state = usedState || createRespondentUsedState();
  const targetGender = normalizePoolGender(gender);
  const parsedRange = parseAgeRangeConstraint(ageGroup);

  const exactAgeNum = (exactAge !== null && exactAge !== undefined && !isNaN(parseInt(exactAge, 10)))
    ? parseInt(exactAge, 10)
    : null;
  const minA = (minAge !== null && minAge !== undefined && !isNaN(parseInt(minAge, 10)))
    ? parseInt(minAge, 10)
    : (exactAgeNum !== null ? exactAgeNum : (parsedRange ? parsedRange.minAge : 10));
  const maxA = (maxAge !== null && maxAge !== undefined && !isNaN(parseInt(maxAge, 10)))
    ? parseInt(maxAge, 10)
    : (exactAgeNum !== null ? exactAgeNum : (parsedRange ? parsedRange.maxAge : 100));

  const startOffset = hashRespondentSeed(seed) % pool.length;

  // 단계별 매칭:
  // pass 0: 미사용 이름 + 성별 일치 + 정확 연령 범위 [minA, maxA]
  // pass 1: 미사용 이름 + 성별 일치 + 근접 연령 범위 [minA-3, maxA+3]
  // pass 2: 미사용 이름 + 성별 일치 + 성인/청소년 구분 유지 (minA >= 20 이면 20세 이상)
  // pass 3: 미사용 seq + 성별 일치 + [minA, maxA]
  // pass 4: 성별 일치 아무나
  const adultFloor = minA >= 20 ? 20 : 10;
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[(startOffset + i) % pool.length];
      if (targetGender && cand.gender !== targetGender) continue;

      if (pass <= 2 && (state.usedSeqs.has(cand.seq) || state.usedNames.has(cand.name))) continue;
      if (pass === 3 && state.usedSeqs.has(cand.seq)) continue;

      if (pass === 0 && (cand.age < minA || cand.age > maxA)) continue;
      if (pass === 1 && (cand.age < Math.max(adultFloor, minA - 3) || cand.age > maxA + 3)) continue;
      if (pass === 2 && cand.age < adultFloor) continue;
      if (pass === 3 && (cand.age < minA || cand.age > maxA)) continue;

      state.usedSeqs.add(cand.seq);
      state.usedNames.add(cand.name);
      return { ...cand };
    }
  }

  const fallback = pool[startOffset];
  state.usedSeqs.add(fallback.seq);
  state.usedNames.add(fallback.name);
  return { ...fallback };
}

/**
 * 단일 설문 쿼터 객체에서 이름·성별·나이 중 누락되거나 플레이스홀더('응답자_6001', '대표자', '점포주' 등)인 항목만
 * 마스터 DB(1,138명)에서 정합성 있게 채워 반환합니다. (기존 실측값은 100% 보존)
 */
export function fillMissingRespondentProfile(quotaItem = {}, options = {}) {
  const {
    mode = 'auto', // 'b2c' | 'b2b' | 'youth' | 'auto'
    minAge = null,
    maxAge = null,
    usedState = null,
    seedFallback = 1
  } = options;

  const pool = loadRespondentPersonaPool();
  if (pool.length === 0 || !quotaItem || typeof quotaItem !== 'object') return quotaItem;

  const state = usedState || createRespondentUsedState();
  const item = { ...quotaItem };

  const rawName = item.name || item.respondentName || item.ceoName || item.memberName || '';
  const hasRealName = isValidRespondentName(rawName);
  const cleanExistingName = hasRealName
    ? String(rawName).replace(/\(.*?\)/g, '').replace(/\s+외\s*\d+.*$/, '').replace(/\s+/g, '')
    : '';

  const existingGender = normalizePoolGender(item.gender || item.ceoGender || item.genderFull);
  const hasGender = Boolean(existingGender);

  let existingAge = parseInt(item.age ?? item.ceoAge, 10);
  if ((isNaN(existingAge) || existingAge < 10) && item.birthYear) {
    const by = parseInt(item.birthYear, 10);
    if (!isNaN(by) && by >= 1920 && by <= 2016) {
      existingAge = 2026 - by;
    }
  }
  const hasAge = !isNaN(existingAge) && existingAge >= 10 && existingAge <= 105;

  if (hasRealName && hasGender && hasAge) {
    state.usedNames.add(cleanExistingName);
    return item;
  }

  // 모드 및 부가 필드(학교급, 개업연도, 연령대)에 따른 연령 범위 산출
  const inferredMode = mode !== 'auto'
    ? mode
    : ((item.schoolGrade || item.schoolFull) ? 'youth' : ((item.bizNumber || item.openDate || item.marketName) ? 'b2b' : 'b2c'));

  let targetMinAge = minAge;
  let targetMaxAge = maxAge;

  if (hasAge) {
    targetMinAge = existingAge;
    targetMaxAge = existingAge;
  } else {
    const rangeFromGroup = parseAgeRangeConstraint(item.ageGroup || item.ageGroupLabel || item.ageGroupKey);
    if (rangeFromGroup) {
      targetMinAge = rangeFromGroup.minAge;
      targetMaxAge = rangeFromGroup.maxAge;
    } else if (inferredMode === 'youth') {
      if (item.schoolGrade === '중' || item.schoolFull === '중학생') {
        targetMinAge = 14;
        targetMaxAge = 16;
      } else if (item.schoolGrade === '고' || item.schoolFull === '고등학생') {
        targetMinAge = 17;
        targetMaxAge = 18;
      } else {
        targetMinAge = 14;
        targetMaxAge = 18;
      }
    } else if (inferredMode === 'b2b') {
      let minCeoAge = 31;
      if (item.openDate) {
        const openYear = parseInt(String(item.openDate).slice(0, 4), 10);
        if (!isNaN(openYear) && openYear >= 1960 && openYear <= 2026) {
          minCeoAge = Math.min(68, Math.max(31, (2026 - openYear) + 23));
        }
      }
      targetMinAge = targetMinAge ?? minCeoAge;
      targetMaxAge = targetMaxAge ?? 72;
    } else {
      targetMinAge = targetMinAge ?? 20;
      targetMaxAge = targetMaxAge ?? 75;
    }
  }

  const seed = item.uid || item.idx || item.bizNumber || item.respondId || item.companyName || item.seq || item.index || seedFallback;

  let finalName = cleanExistingName;
  let finalGender = existingGender;
  let finalAge = hasAge ? existingAge : null;

  if (!hasRealName) {
    const chosen = pickRespondentFromPool({
      gender: existingGender,
      exactAge: hasAge ? existingAge : null,
      minAge: targetMinAge,
      maxAge: targetMaxAge,
      ageGroup: item.ageGroup || item.ageGroupLabel || '',
      seed,
      usedState: state
    });
    finalName = chosen.name;
    if (!finalGender) finalGender = chosen.gender;
    if (finalAge === null) finalAge = hasAge ? existingAge : chosen.age;
  } else {
    state.usedNames.add(cleanExistingName);
    const exactInPool = pool.find(
      p => p.name === cleanExistingName &&
        (!existingGender || p.gender === existingGender) &&
        p.age >= (targetMinAge ?? 10) &&
        p.age <= (targetMaxAge ?? 100)
    ) || pool.find(p => p.name === cleanExistingName && (!existingGender || p.gender === existingGender));

    if (exactInPool) {
      if (!finalGender) finalGender = exactInPool.gender;
      if (finalAge === null) {
        finalAge = Math.max(targetMinAge ?? 10, Math.min(targetMaxAge ?? 100, exactInPool.age));
      }
      state.usedSeqs.add(exactInPool.seq);
    } else {
      if (!finalGender) finalGender = inferGenderByName(cleanExistingName, pool);
      if (finalAge === null) {
        const ageRef = pickRespondentFromPool({
          gender: finalGender,
          minAge: targetMinAge,
          maxAge: targetMaxAge,
          seed,
          usedState: { usedSeqs: state.usedSeqs, usedNames: new Set() }
        });
        finalAge = Math.max(targetMinAge ?? 10, Math.min(targetMaxAge ?? 100, ageRef.age));
      }
    }
  }

  // 기존 스키마 호환 필드 일괄 반영 (기존 실측 필드는 덮어쓰지 않고 누락/플레이스홀더만 채움)
  if (!hasRealName) {
    if ('name' in item || inferredMode !== 'b2b') item.name = finalName;
    if ('respondentName' in item) item.respondentName = finalName;
    if ('ceoName' in item || inferredMode === 'b2b') item.ceoName = finalName;
  }
  if (!hasGender) {
    if ('gender' in item || inferredMode !== 'b2b') item.gender = finalGender;
    if ('ceoGender' in item || inferredMode === 'b2b') item.ceoGender = finalGender;
    if ('genderFull' in item) item.genderFull = finalGender === '여' ? '여자' : '남자';
  }
  if (!hasAge && finalAge !== null) {
    if ('age' in item || inferredMode !== 'b2b') item.age = finalAge;
    if ('ceoAge' in item || inferredMode === 'b2b') item.ceoAge = finalAge;
    if (!item.ageGroup) item.ageGroup = resolveAgeGroupLabel(finalAge);
    if (!item.birthYear) item.birthYear = 2026 - finalAge;
  }

  return item;
}

/**
 * 쿼터 배열 전체에 대해 중복 없이 응답자 이름·성별·나이 결측치/플레이스홀더를 일괄 배정
 */
export function allocateRespondentsForQuotaList(quotaList = [], options = {}) {
  if (!Array.isArray(quotaList) || quotaList.length === 0) return [];
  const usedState = options.usedState || createRespondentUsedState(quotaList);
  return quotaList.map((row, idx) =>
    fillMissingRespondentProfile(row, {
      ...options,
      usedState,
      seedFallback: idx + 1
    })
  );
}
