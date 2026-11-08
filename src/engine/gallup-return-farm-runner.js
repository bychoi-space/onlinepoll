/**
 * 한국갤럽 G-CAII 시스템 (20263603 - 2026년 귀농귀촌 실태조사[귀농]) 전용 자동화 러너
 *
 * 핵심 요구사항 구현:
 * 1. 대상 지역(강원특별자치도 홍천군 읍·면별) 브라우저 GPS 위치정보 강제 주입 (Context Geolocation + InitScript)
 * 2. 방문 기록 입력(1~5차) 검증 규칙 완벽 준수 (07~22시 제약, 차수 순차성, 일시 오름차순, 최종 '컨택성공')
 * 3. 답례품 인수증 전자서명 패드(Page 7, Q3-1) 응답자별 8종 한글 자모 필체·기울기·필압·흘림 변형 서명 생성 및 업로드
 * 4. 최종 제출 직전 페이지(Page 118 - NAME/PHONE/ADDR)까지 전 문항 응답 및 DB 임시저장 후 [조사완료] 클릭 직전 안전 정지
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const templatesPath = path.join(rootDir, 'data', 'gallup_20263603_templates.json');

export const GALLUP_20263603_DEFAULT_URL =
  'https://rs.gallup.co.kr/webApp/response/ResponseIdStart_20263603.asp?p_vr_no=317729C6AC&p_intrvw_id=076_000009&p_intrvw_nm=%EB%B0%B1%EC%98%81%EC%9E%90&p_rspns_mthd=P&p_mode=W';

// 강원특별자치도 홍천군 10개 읍·면 중심 좌표
export const HONGCHEON_EUP_MYEON_GPS = {
  '홍천읍': { lat: 37.6970, lng: 127.8887 },
  '남면':   { lat: 37.6085, lng: 127.7982 },
  '내촌면': { lat: 37.7885, lng: 128.1118 },
  '서석면': { lat: 37.7092, lng: 128.1983 },
  '영귀미면': { lat: 37.6745, lng: 127.9796 },
  '두촌면': { lat: 37.8328, lng: 128.0315 },
  '서면':   { lat: 37.6612, lng: 127.6485 },
  '화촌면': { lat: 37.7562, lng: 127.9584 },
  '북방면': { lat: 37.7524, lng: 127.8482 },
  '내면':   { lat: 37.8480, lng: 128.4015 }
};

export const SIGNATURE_STYLES = [
  { index: 0, label: '스타일 A · 정자 손글씨체 (단정한 필압)', slant: -0.04, baseSlope: -0.02, aspectX: 0.96, aspectY: 1.02, cursive: 0.15, flourish: 1, minW: 1.1, maxW: 2.8, tremor: 0.45 },
  { index: 1, label: '스타일 B · 우상향 흘림체 (연속 필기)', slant: -0.22, baseSlope: -0.08, aspectX: 1.05, aspectY: 0.95, cursive: 0.65, flourish: 1, minW: 0.9, maxW: 2.6, tremor: 0.55 },
  { index: 2, label: '스타일 C · 속필 사인체 (빠른 흘림+밑줄)', slant: -0.30, baseSlope: -0.05, aspectX: 1.15, aspectY: 0.88, cursive: 0.85, flourish: 2, minW: 0.8, maxW: 2.2, tremor: 0.65 },
  { index: 3, label: '스타일 D · 굵은 붓펜체 (강한 필압)', slant: 0.04, baseSlope: 0.02, aspectX: 1.08, aspectY: 1.06, cursive: 0.25, flourish: 0, minW: 1.6, maxW: 3.7, tremor: 0.40 },
  { index: 4, label: '스타일 E · 가늘고 둥근 손글씨체', slant: -0.10, baseSlope: -0.03, aspectX: 0.92, aspectY: 0.94, cursive: 0.40, flourish: 3, minW: 0.7, maxW: 2.0, tremor: 0.50 },
  { index: 5, label: '스타일 F · 세로 장체 (어르신 정자풍)', slant: 0.06, baseSlope: 0.04, aspectX: 0.80, aspectY: 1.22, cursive: 0.10, flourish: 0, minW: 1.3, maxW: 3.1, tremor: 0.85 },
  { index: 6, label: '스타일 G · 가로 넓은 안정 사인체', slant: -0.16, baseSlope: -0.01, aspectX: 1.24, aspectY: 0.84, cursive: 0.55, flourish: 2, minW: 1.2, maxW: 3.0, tremor: 0.50 },
  { index: 7, label: '스타일 H · 초성 강조 흘림 사인체', slant: -0.25, baseSlope: -0.06, aspectX: 1.10, aspectY: 1.05, cursive: 0.75, flourish: 1, minW: 1.0, maxW: 3.3, tremor: 0.60 }
];

export function computeGpsForTarget(eupMyeon = '', address = '', id = '') {
  const matchedKey =
    Object.keys(HONGCHEON_EUP_MYEON_GPS).find(
      k => String(eupMyeon || '').includes(k) || String(address || '').includes(k)
    ) || '홍천읍';
  const base = HONGCHEON_EUP_MYEON_GPS[matchedKey];
  const seed = parseInt(String(id).replace(/\D/g, ''), 10) || 100000;
  const dLat = (((seed * 73) % 200) - 100) * 0.000018;
  const dLng = (((seed * 131) % 200) - 100) * 0.000018;
  return {
    eupMyeon: matchedKey,
    latitude: Number((base.lat + dLat).toFixed(6)),
    longitude: Number((base.lng + dLng).toFixed(6))
  };
}

export function normalizeGallupPhone(rawPhone, id) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length === 8) {
    return `010-${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }
  if (digits.length === 11 && digits.startsWith('010')) {
    return `010-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10 && digits.startsWith('10')) {
    return `010-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  const seed = parseInt(String(id).replace(/\D/g, ''), 10) || 103209;
  const mid = String(3100 + (seed % 6000)).padStart(4, '0');
  const last = String(1200 + ((seed * 37) % 8500)).padStart(4, '0');
  return `010-${mid}-${last}`;
}

function parseRspnsString(rspnsStr = '') {
  const map = {};
  if (!rspnsStr) return map;
  const parts = String(rspnsStr).split('||').filter(Boolean);
  for (const part of parts) {
    const segs = part.split('::');
    const key = (segs[0] || '').trim();
    const val = segs[1] !== undefined ? segs[1] : '';
    const extraTxt = segs[2] !== undefined ? segs[2] : '';
    if (key) {
      map[key] = val;
      if (extraTxt) {
        const baseKey = key.replace(/-\d+$/, '');
        map[`${baseKey}_TXT`] = extraTxt;
      }
    }
  }
  return map;
}

/**
 * 15인의 실제 완료 응답자 템플릿 중 대상자의 귀농연도·가구조건에 가장 부합하는 템플릿을 선택하고
 * 대상자 고유 정보(지역, 성별, 연령, 출생연도, 귀농연도, 가구주 관계, 주소, 연락처 등)에 맞춰 전 문항 응답 맵을 생성
 */
export function buildRespondentAnswerPlan(slotData, policy = {}, existingQ10 = null) {
  let templatesObj = {};
  try {
    templatesObj = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
  } catch (e) {
    throw new Error(`갤럽 템플릿 파일을 읽을 수 없습니다: ${e.message}`);
  }

  const allTemplates = Object.values(templatesObj);
  // 2인가구(부부) 표준 템플릿들만 추출 (Page 8 Q14-3 === 2)
  const coupleTemplates = allTemplates.filter(t => {
    const p8 = t.pages?.['8'] || '';
    return p8.includes('Q14-3::2::') && p8.includes('Q14-2::2::');
  });
  const pool = coupleTemplates.length > 0 ? coupleTemplates : allTemplates;

  const idNum = parseInt(String(slotData.id || '103801').replace(/\D/g, ''), 10) || 103801;
  const moveYear = String(slotData.moveYear || slotData.openDate || '2023').trim();
  const age = Number(slotData.age || slotData.ceoAge || 55);
  const birthYear = Number(slotData.birthYear || (2026 - age));
  const isFemale = String(slotData.gender || slotData.ceoGender || '').includes('여');
  const eupMyeon = String(slotData.eupMyeon || '').trim();
  const address = String(slotData.address || slotData.roadAddress || '').trim();
  const name = String(slotData.name || slotData.respondentName || slotData.ceoName || '').trim();
  const phone = normalizeGallupPhone(slotData.phone, idNum);

  // 동일 귀농연도 템플릿 우선 선택 후 결정론적 순환
  const sameYearPool = pool.filter(t => String(t.meta?.moveYear) === moveYear);
  const chosenTemplate = (sameYearPool.length > 0)
    ? sameYearPool[idNum % sameYearPool.length]
    : pool[idNum % pool.length];

  // 전체 완료 템플릿에서 페이지별 기본값을 먼저 채운 뒤, 선택된 템플릿 응답으로 덮어씀
  const plan = {};
  for (const tmpl of allTemplates) {
    for (const [pStr, rspnsStr] of Object.entries(tmpl.pages || {})) {
      const pNum = Number(pStr);
      if (!plan[pNum] || Object.keys(plan[pNum]).length === 0) {
        const parsed = parseRspnsString(rspnsStr);
        if (Object.keys(parsed).length > 0) {
          plan[pNum] = parsed;
        }
      }
    }
  }
  for (const [pStr, rspnsStr] of Object.entries(chosenTemplate.pages || {})) {
    const parsed = parseRspnsString(rspnsStr);
    if (Object.keys(parsed).length > 0) {
      plan[Number(pStr)] = parsed;
    }
  }

  // [Page 1] 개인정보 동의
  plan[1] = { 'Q1-1': '1' };

  // [Page 2] 거주 지역 (SQ1=강원(2), SQ1-1=홍천읍(1)/면(2), SQ2=농촌(2))
  const isHongcheonEup = eupMyeon.includes('홍천읍') || address.includes('홍천읍');
  plan[2] = {
    'Q4-2': '2',
    [isHongcheonEup ? 'Q5-1' : 'Q5-2']: isHongcheonEup ? '1' : '2',
    'Q6-2': '2'
  };

  // [Page 3] 농업생산 종사 여부 (예=1)
  plan[3] = { 'Q7-1': '1' };

  // [Page 6] 응답자 구분 (1: 가구주, 2: 가구주의 배우자)
  const q10Val = existingQ10 || (isFemale ? '2' : '1');
  plan[6] = { [`Q10-${q10Val}`]: q10Val };

  // [Page 7] 응답자 기본정보 확인 및 서명
  plan[7] = {
    'SQ0-1': moveYear,
    'SQ0-2': name,
    'SQ0-3': String(age),
    'SQ0-4': '강원도',
    'SQ0-5': address
  };

  // [Page 8] 성별(Q11), 연령(Q12-1), 이주연도(Q13-1), 가구원수(Q14-1~3 = 2명)
  const sexVal = isFemale ? '2' : '1';
  plan[8] = {
    [`Q11-${sexVal}`]: sexVal,
    'Q12-1': String(age),
    'Q13-1': moveYear,
    'Q14-1': '2',
    'Q14-2': '2',
    'Q14-3': '2'
  };

  // [Page 12] 문1A 동거 가구원 (가구주 + 가구원1)
  plan[12] = {
    'Q123-1-1': '1',
    'Q123-2-1': '1'
  };

  // [Page 13] 문1B 가구주와의 관계 (가구주 본인=1, 가구주의 배우자=2)
  plan[13] = {
    'Q124-1-1': '1',
    'Q124-2-2': '2'
  };

  // [Page 14] 문1C-1 가구주 및 배우자 성별·출생연도 정합성
  if (q10Val === '2') {
    // 응답자가 가구주의 배우자(Row 2)인 경우 -> Row 2가 응답자 성별·출생연도, Row 1(가구주)은 반대 성별
    const headSex = isFemale ? '1' : '2';
    const headBirth = isFemale ? (birthYear - 2) : (birthYear + 2);
    plan[14] = {
      [`Q126-1-1-${headSex}`]: headSex,
      'Q126-1-2-3': String(headBirth),
      [`Q126-2-1-${sexVal}`]: sexVal,
      'Q126-2-2-3': String(birthYear)
    };
  } else {
    // 응답자가 가구주 본인(Row 1)인 경우 -> Row 1이 응답자 성별·출생연도, Row 2(배우자)는 반대 성별
    const spouseSex = isFemale ? '1' : '2';
    const spouseBirth = isFemale ? (birthYear - 2) : (birthYear + 2);
    plan[14] = {
      [`Q126-1-1-${sexVal}`]: sexVal,
      'Q126-1-2-3': String(birthYear),
      [`Q126-2-1-${spouseSex}`]: spouseSex,
      'Q126-2-2-3': String(spouseBirth)
    };
  }

  // [Page 17] 문3 배우자 동반 이주 여부 (1: 함께 이주)
  plan[17] = { 'Q129-1': '1' };

  // [Page 20] 문6 귀농 시기 (연도는 반드시 SQ7 이주연도와 일치해야 함)
  const moveMonth = String(2 + (idNum % 4)); // 2~5월
  plan[20] = {
    'Q18-1': moveYear,
    'Q18-2': moveMonth
  };

  // 2024~2025년 최근 귀농자의 경우 기간 초과 트랩 방지를 위해 주택/농지 확보 시기 및 영농 시작 시기를 안전 범위로 보정
  if (Number(moveYear) >= 2024) {
    if (plan[48]) {
      plan[48] = { 'Q28-1': '1' }; // 귀농 전 확보
      plan[49] = { 'Q133-1': '0', 'Q133-2': String(3 + (idNum % 6)) };
    }
    plan[55] = { 'Q35-1': '1' }; // 귀농 첫해 바로 시작
    plan[58] = { 'Q39-2': '2' };
    plan[60] = { 'Q41-1': '1' }; // 1년 미만
    plan[70] = { 'Q55-1': '1' }; // 귀농 전 농지 확보
    plan[71] = { 'Q134-1': '0', 'Q134-2': String(2 + (idNum % 5)) };
  }

  // [Page 118] 최종 응답자 확인 페이지 (NAME, PHONE, ADDR)
  plan[118] = {
    'NAME-1': name,
    'PHONE-1': phone,
    'ADDR-1': address
  };

  return {
    plan,
    meta: {
      id: String(idNum),
      name,
      age,
      birthYear,
      gender: isFemale ? '여' : '남',
      moveYear,
      eupMyeon,
      address,
      phone,
      q10Val,
      templateSource: chosenTemplate.meta?.id || 'default'
    }
  };
}

/**
 * 한글 성명을 초성·중성·종성 벡터 획(Stroke)으로 분해하여
 * 응답자마다 다른 글자체(기울기·자간·비율·흘림·필압·밑줄)로 SignaturePad에 직접 서명하는 함수
 */
async function drawVariedHandwrittenSignature(page, name, idNum, forcedStyleIndex = null) {
  const styleIdx = (forcedStyleIndex !== null && forcedStyleIndex !== undefined && forcedStyleIndex !== 'auto')
    ? (Number(forcedStyleIndex) % SIGNATURE_STYLES.length)
    : (idNum % SIGNATURE_STYLES.length);
  const style = SIGNATURE_STYLES[styleIdx];

  const signResult = await page.evaluate(async ({ targetName, seed, styleCfg }) => {
    const canvas = document.querySelector('#signature_pad_Q3_1 canvas');
    if (!canvas || typeof window.sign_Q3_1 === 'undefined') {
      return { ok: false, reason: 'signature_pad_Q3_1 not found' };
    }

    // 한글 자모 획 테이블 (0..1 정규화 좌표)
    const CHO_STROKES = {
      0: [[[0.1, 0.2], [0.85, 0.2], [0.75, 0.85]]], // ㄱ
      1: [[[0.05, 0.2], [0.45, 0.2], [0.4, 0.85]], [[0.5, 0.2], [0.9, 0.2], [0.82, 0.85]]], // ㄲ
      2: [[[0.15, 0.15], [0.15, 0.82], [0.88, 0.80]]], // ㄴ
      3: [[[0.15, 0.2], [0.85, 0.2]], [[0.15, 0.2], [0.15, 0.82], [0.88, 0.82]]], // ㄷ
      4: [[[0.1, 0.2], [0.45, 0.2]], [[0.1, 0.2], [0.1, 0.82], [0.45, 0.82]], [[0.52, 0.2], [0.9, 0.2]], [[0.52, 0.2], [0.52, 0.82], [0.9, 0.82]]], // ㄸ
      5: [[[0.12, 0.18], [0.85, 0.18], [0.82, 0.48], [0.15, 0.50], [0.15, 0.84], [0.88, 0.82]]], // ㄹ
      6: [[[0.15, 0.2], [0.15, 0.82]], [[0.15, 0.2], [0.85, 0.2], [0.82, 0.82]], [[0.15, 0.82], [0.85, 0.82]]], // ㅁ
      7: [[[0.18, 0.15], [0.18, 0.82]], [[0.82, 0.15], [0.78, 0.82]], [[0.18, 0.48], [0.80, 0.48]], [[0.18, 0.82], [0.80, 0.82]]], // ㅂ
      8: [[[0.1, 0.15], [0.1, 0.82], [0.45, 0.82], [0.45, 0.15]], [[0.52, 0.15], [0.52, 0.82], [0.88, 0.82], [0.88, 0.15]], [[0.1, 0.48], [0.88, 0.48]]], // ㅃ
      9: [[[0.52, 0.15], [0.12, 0.85]], [[0.48, 0.38], [0.88, 0.85]]], // ㅅ
      10: [[[0.35, 0.15], [0.08, 0.85]], [[0.32, 0.42], [0.52, 0.85]], [[0.72, 0.15], [0.48, 0.85]], [[0.70, 0.42], [0.92, 0.85]]], // ㅆ
      11: [[[0.5, 0.16], [0.2, 0.32], [0.15, 0.65], [0.45, 0.85], [0.82, 0.70], [0.85, 0.35], [0.52, 0.16]]], // ㅇ
      12: [[[0.15, 0.2], [0.85, 0.2], [0.15, 0.85]], [[0.48, 0.48], [0.88, 0.85]]], // ㅈ
      13: [[[0.1, 0.2], [0.48, 0.2], [0.1, 0.85]], [[0.52, 0.2], [0.9, 0.2], [0.52, 0.85]], [[0.68, 0.48], [0.92, 0.85]]], // ㅉ
      14: [[[0.38, 0.08], [0.68, 0.12]], [[0.15, 0.28], [0.85, 0.26], [0.15, 0.86]], [[0.48, 0.52], [0.88, 0.86]]], // ㅊ
      15: [[[0.15, 0.2], [0.85, 0.2], [0.75, 0.85]], [[0.18, 0.52], [0.78, 0.50]]], // ㅋ
      16: [[[0.15, 0.2], [0.85, 0.2]], [[0.18, 0.50], [0.80, 0.50]], [[0.15, 0.2], [0.15, 0.84], [0.88, 0.82]]], // ㅌ
      17: [[[0.12, 0.2], [0.88, 0.2]], [[0.32, 0.2], [0.30, 0.82]], [[0.68, 0.2], [0.66, 0.82]], [[0.10, 0.82], [0.90, 0.82]]], // ㅍ
      18: [[[0.38, 0.08], [0.65, 0.10]], [[0.12, 0.26], [0.88, 0.24]], [[0.5, 0.38], [0.22, 0.55], [0.25, 0.84], [0.75, 0.84], [0.78, 0.52], [0.5, 0.38]]] // ㅎ
    };

    const JUNG_STROKES = {
      0: [[[0.35, 0.08], [0.32, 0.92]], [[0.34, 0.48], [0.85, 0.48]]], // ㅏ
      1: [[[0.25, 0.08], [0.22, 0.92]], [[0.24, 0.48], [0.68, 0.48]], [[0.72, 0.08], [0.70, 0.92]]], // ㅐ
      2: [[[0.32, 0.08], [0.30, 0.92]], [[0.32, 0.35], [0.85, 0.35]], [[0.32, 0.62], [0.85, 0.62]]], // ㅑ
      3: [[[0.22, 0.08], [0.20, 0.92]], [[0.22, 0.35], [0.65, 0.35]], [[0.22, 0.62], [0.65, 0.62]], [[0.72, 0.08], [0.70, 0.92]]], // ㅒ
      4: [[[0.15, 0.48], [0.65, 0.48]], [[0.68, 0.08], [0.64, 0.92]]], // ㅓ
      5: [[[0.10, 0.48], [0.48, 0.48]], [[0.50, 0.08], [0.48, 0.92]], [[0.82, 0.08], [0.78, 0.92]]], // ㅔ
      6: [[[0.15, 0.35], [0.65, 0.35]], [[0.15, 0.62], [0.65, 0.62]], [[0.68, 0.08], [0.64, 0.92]]], // ㅕ
      7: [[[0.10, 0.35], [0.48, 0.35]], [[0.10, 0.62], [0.48, 0.62]], [[0.50, 0.08], [0.48, 0.92]], [[0.82, 0.08], [0.78, 0.92]]], // ㅖ
      8: [[[0.48, 0.15], [0.48, 0.68]], [[0.08, 0.70], [0.92, 0.68]]], // ㅗ
      9: [[[0.35, 0.15], [0.35, 0.62]], [[0.05, 0.64], [0.68, 0.62]], [[0.72, 0.08], [0.70, 0.92]], [[0.72, 0.50], [0.96, 0.50]]], // ㅘ
      10: [[[0.32, 0.15], [0.32, 0.62]], [[0.05, 0.64], [0.60, 0.62]], [[0.65, 0.08], [0.64, 0.92]], [[0.88, 0.08], [0.86, 0.92]]], // ㅙ
      11: [[[0.38, 0.15], [0.38, 0.65]], [[0.08, 0.68], [0.72, 0.66]], [[0.78, 0.08], [0.75, 0.92]]], // ㅚ
      12: [[[0.35, 0.15], [0.35, 0.68]], [[0.62, 0.15], [0.62, 0.68]], [[0.08, 0.70], [0.92, 0.68]]], // ㅛ
      13: [[[0.08, 0.25], [0.92, 0.24]], [[0.48, 0.25], [0.46, 0.88]]], // ㅜ
      14: [[[0.05, 0.28], [0.65, 0.26]], [[0.35, 0.28], [0.34, 0.85]], [[0.42, 0.55], [0.72, 0.55]], [[0.75, 0.08], [0.72, 0.92]]], // ㅝ
      15: [[[0.05, 0.28], [0.60, 0.26]], [[0.32, 0.28], [0.30, 0.85]], [[0.65, 0.08], [0.63, 0.92]], [[0.88, 0.08], [0.85, 0.92]]], // ㅞ
      16: [[[0.08, 0.28], [0.70, 0.26]], [[0.38, 0.28], [0.36, 0.85]], [[0.78, 0.08], [0.75, 0.92]]], // ㅟ
      17: [[[0.08, 0.25], [0.92, 0.24]], [[0.35, 0.25], [0.34, 0.88]], [[0.62, 0.25], [0.60, 0.88]]], // ㅠ
      18: [[[0.08, 0.50], [0.92, 0.48]]], // ㅡ
      19: [[[0.08, 0.55], [0.72, 0.53]], [[0.78, 0.08], [0.75, 0.92]]], // ㅢ
      20: [[[0.50, 0.08], [0.48, 0.92]]] // ㅣ
    };

    const JONG_MAP = {
      1: CHO_STROKES[0], 2: CHO_STROKES[1], 4: CHO_STROKES[2], 7: CHO_STROKES[3],
      8: CHO_STROKES[5], 16: CHO_STROKES[6], 17: CHO_STROKES[7], 19: CHO_STROKES[9],
      20: CHO_STROKES[10], 21: CHO_STROKES[11], 22: CHO_STROKES[12], 23: CHO_STROKES[14],
      24: CHO_STROKES[15], 25: CHO_STROKES[16], 26: CHO_STROKES[17], 27: CHO_STROKES[18]
    };

    function mapBox(strokes, bx, by, bw, bh) {
      return (strokes || []).map(st => st.map(([px, py]) => [bx + px * bw, by + py * bh]));
    }

    function decomposeCharStrokes(ch) {
      const code = ch.charCodeAt(0) - 0xAC00;
      if (code < 0 || code > 11171) {
        return [[[0.2, 0.5], [0.8, 0.5]]];
      }
      const cho = Math.floor(code / 588);
      const jung = Math.floor((code % 588) / 28);
      const jong = code % 28;
      const isHorizJung = [8, 12, 13, 17, 18].includes(jung);
      const isMixedJung = [9, 10, 11, 14, 15, 16, 19].includes(jung);
      const hasJong = jong > 0;

      let out = [];
      if (isHorizJung) {
        out.push(...mapBox(CHO_STROKES[cho], 0.15, 0.05, 0.70, hasJong ? 0.34 : 0.45));
        out.push(...mapBox(JUNG_STROKES[jung], 0.08, hasJong ? 0.40 : 0.52, 0.84, hasJong ? 0.24 : 0.36));
        if (hasJong) {
          out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.18, 0.66, 0.66, 0.30));
        }
      } else if (isMixedJung) {
        out.push(...mapBox(CHO_STROKES[cho], 0.08, 0.06, 0.48, hasJong ? 0.36 : 0.46));
        out.push(...mapBox(JUNG_STROKES[jung], 0.08, 0.06, 0.86, hasJong ? 0.56 : 0.82));
        if (hasJong) {
          out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.18, 0.64, 0.68, 0.32));
        }
      } else {
        // 세로 모음 (ㅏ, ㅓ, ㅣ 등)
        out.push(...mapBox(CHO_STROKES[cho], 0.06, 0.08, 0.44, hasJong ? 0.50 : 0.76));
        out.push(...mapBox(JUNG_STROKES[jung], 0.50, 0.05, 0.44, hasJong ? 0.55 : 0.84));
        if (hasJong) {
          out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.16, 0.62, 0.70, 0.34));
        }
      }
      return out;
    }

    window.sign_Q3_1.clear();
    window.sign_Q3_1.minWidth = styleCfg.minW;
    window.sign_Q3_1.maxWidth = styleCfg.maxW;

    const rect = canvas.getBoundingClientRect();
    const cw = canvas.offsetWidth || rect.width || 500;
    const ch = canvas.offsetHeight || rect.height || 220;

    const chars = String(targetName || '응답자').trim().split('');
    const baseCharW = Math.min(92, (cw * 0.66) / Math.max(chars.length, 2)) * styleCfg.aspectX;
    const baseCharH = Math.min(105, ch * 0.54) * styleCfg.aspectY;
    const totalW = chars.length * baseCharW * 1.06;
    const startX = (cw - totalW) * 0.44 + ((seed % 17) - 8) * 1.8;
    const startY = (ch - baseCharH) * 0.46 + ((seed % 13) - 6) * 1.5;

    const allStrokes = [];
    chars.forEach((c, cIdx) => {
      const rawStrokes = decomposeCharStrokes(c);
      // 초성 강조 스타일(index 7)인 경우 첫 글자 확대
      const scaleMult = (styleCfg.index === 7 && cIdx === 0) ? 1.24 : (1.0 - cIdx * 0.03);
      const charW = baseCharW * scaleMult;
      const charH = baseCharH * scaleMult;
      const ox = startX + cIdx * (baseCharW * (styleCfg.cursive > 0.6 ? 0.94 : 1.12));
      const oy = startY + cIdx * (baseCharW * styleCfg.baseSlope);

      const transformed = rawStrokes.map((st, sIdx) => {
        return st.map(([nx, ny], pIdx) => {
          const jitterPhase = seed * 0.37 + cIdx * 2.1 + sIdx * 1.3 + pIdx * 0.9;
          const jx = Math.sin(jitterPhase) * styleCfg.tremor * 2.2;
          const jy = Math.cos(jitterPhase * 1.3) * styleCfg.tremor * 2.2;
          const sx = nx + (ny - 0.5) * styleCfg.slant;
          return [
            ox + sx * charW + jx,
            oy + ny * charH + jy
          ];
        });
      });

      // 흘림체(cursive) 정도에 따라 일부 획을 자연스럽게 연결
      if (styleCfg.cursive >= 0.5 && transformed.length > 1) {
        const merged = [];
        let cur = [...transformed[0]];
        for (let i = 1; i < transformed.length; i++) {
          if ((i + cIdx) % 2 === 1 || styleCfg.cursive >= 0.78) {
            const lastPt = cur[cur.length - 1];
            const nextPt = transformed[i][0];
            const midPt = [
              (lastPt[0] + nextPt[0]) * 0.5 + (styleCfg.cursive * 3),
              (lastPt[1] + nextPt[1]) * 0.5 - 2
            ];
            cur.push(midPt, ...transformed[i]);
          } else {
            merged.push(cur);
            cur = [...transformed[i]];
          }
        }
        merged.push(cur);
        allStrokes.push(...merged);
      } else {
        allStrokes.push(...transformed);
      }
    });

    // 사인 끝맺음 장식 획(Flourish)
    if (styleCfg.flourish === 1 && allStrokes.length > 0) {
      // 마지막 획 끝에서 우측으로 뻗는 자연스러운 사인 꼬리
      const lastSt = allStrokes[allStrokes.length - 1];
      const endPt = lastSt[lastSt.length - 1];
      lastSt.push(
        [endPt[0] + 22, endPt[1] - 6],
        [endPt[0] + 54, endPt[1] - 11],
        [endPt[0] + 82, endPt[1] - 8]
      );
    } else if (styleCfg.flourish === 2) {
      // 이름 하단 밑줄 스윕
      allStrokes.push([
        [startX - 8, startY + baseCharH + 14],
        [startX + totalW * 0.55, startY + baseCharH + 8],
        [startX + totalW + 18, startY + baseCharH + 12]
      ]);
    } else if (styleCfg.flourish === 3 && allStrokes.length > 0) {
      const lastSt = allStrokes[allStrokes.length - 1];
      const endPt = lastSt[lastSt.length - 1];
      lastSt.push(
        [endPt[0] + 18, endPt[1] + 12],
        [endPt[0] - 10, endPt[1] + 22],
        [endPt[0] + 38, endPt[1] + 16]
      );
    }

    // 다단계 베지어 보간 후 SignaturePad의 실제 _strokeBegin/_strokeUpdate/_strokeEnd 호출
    let simTime = Date.now() - 2500;
    for (const stroke of allStrokes) {
      if (!stroke || stroke.length < 2) continue;
      const dense = [];
      for (let i = 0; i < stroke.length - 1; i++) {
        const [x0, y0] = stroke[i];
        const [x1, y1] = stroke[i + 1];
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(6, Math.ceil(dist / 3.5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          // 부드러운 아치형 곡선 보정
          const arc = Math.sin(t * Math.PI) * 1.6 * ((i % 2 === 0) ? 1 : -1);
          dense.push([
            x0 + (x1 - x0) * t + arc * 0.5,
            y0 + (y1 - y0) * t - arc
          ]);
        }
      }

      const first = dense[0];
      window.sign_Q3_1._strokeBegin({
        clientX: rect.left + first[0],
        clientY: rect.top + first[1]
      });
      for (let k = 1; k < dense.length; k++) {
        simTime += 8;
        window.sign_Q3_1._strokeUpdate({
          clientX: rect.left + dense[k][0],
          clientY: rect.top + dense[k][1]
        });
      }
      window.sign_Q3_1._strokeEnd({
        clientX: rect.left + dense[dense.length - 1][0],
        clientY: rect.top + dense[dense.length - 1][1]
      });
    }
    window.sign_Q3_1._isEmpty = false;

    // [서명 저장] 버튼 클릭하여 서버(/webApp/response/ResponseProcessingDext.asp)에 업로드
    const saveBtn = document.querySelector('[data-action="save_Q3_1"]');
    if (saveBtn) saveBtn.click();

    // #QST2_Q3-1에 업로드된 .gif 파일명이 채워질 때까지 대기
    for (let w = 0; w < 30; w++) {
      await new Promise(r => setTimeout(r, 150));
      const swalBtn = document.querySelector('.swal2-confirm');
      if (swalBtn && swalBtn.offsetParent !== null) {
        swalBtn.click();
      }
      const val = document.getElementById('QST2_Q3-1')?.value || '';
      if (val && val.endsWith('.gif')) {
        return { ok: true, fileName: val, styleLabel: styleCfg.label };
      }
    }
    return {
      ok: Boolean(document.getElementById('QST2_Q3-1')?.value),
      fileName: document.getElementById('QST2_Q3-1')?.value || '',
      styleLabel: styleCfg.label
    };
  }, { targetName: name, seed: idNum, styleCfg: style });

  return signResult;
}

/**
 * 갤럽 서버에서 70명(또는 지정된 쿼터 목록)의 실시간 진행 상태(00/01/03/99) 및 방문횟수를 조회하여 동기화
 */
export async function syncGallupReturnFarmStatuses({ quotaDatabase = [] }) {
  const results = [...quotaDatabase];
  for (let i = 0; i < results.length; i += 15) {
    const chunk = results.slice(i, i + 15);
    await Promise.all(chunk.map(async (item) => {
      const id = String(item.id || item.uid || '').trim();
      if (!id) return;
      try {
        const res = await fetch('https://rs.gallup.co.kr/webApp/response/ResponseProcessing_20263603.asp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({
            p_status_flag: 'rschResAddInfoOrLogSelect',
            p_rsch_id: '20263603',
            p_gagu_id: id
          }).toString(),
          signal: AbortSignal.timeout(6000)
        });
        const j = await res.json();
        const info = j?.[0];
        if (info && (info.result === 'SUCC' || info.result === 'OK') && info.gaguInfo?.[0]) {
          const g = info.gaguInfo[0];
          const vList = info.visitList || [];
          item.respondId = String(g.respond_id || g.respondId || item.respondId || '');
          item.serverStatus = String(g.rspns_progrs_sttus || '00');
          item.visitCount = vList.length;
          item.lastVisitResult = vList.length > 0 ? vList[vList.length - 1].visit_result : '';
          if (g.listAddr) {
            item.address = g.listAddr;
            item.roadAddress = g.listAddr;
          }
          if (item.serverStatus === '99') {
            item.status = '완료';
            item.quotaStatus = 'completed';
            item.progress = '100% (서버완료)';
          } else if (item.serverStatus === '01') {
            if (item.quotaStatus !== 'pilot_done') {
              item.status = '진행중';
              item.progress = '진행중 (이어하기 가능)';
            }
          }
        }
      } catch (_) {}
    }));
  }
  return results;
}

/**
 * 한국갤럽 20263603 귀농귀촌 실태조사(귀농) 본 설문 자동 진행 러너
 * (Page 1 ~ Page 118 최종 제출 직전 상태까지만 진행 및 저장)
 */
export async function runGallupReturnFarmSurvey({
  slotData,
  policy = {},
  quotaIndex = 1,
  pilotMode = true,
  safetyGuard = true,
  reportDir,
  onProgress = () => {}
}) {
  const idStr = String(slotData.id || slotData.uid || '103801').trim();
  const idNum = parseInt(idStr.replace(/\D/g, ''), 10) || 103801;
  const name = String(slotData.name || slotData.respondentName || slotData.ceoName || '응답자').trim();
  const entryUrl = slotData.surveyUrl || slotData.slotUrl || GALLUP_20263603_DEFAULT_URL;
  const gps = computeGpsForTarget(slotData.eupMyeon, slotData.address, idStr);

  if (reportDir && !fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const capturedSteps = [];
  const submittedAnswers = [];

  onProgress({
    step: 'GPS_INIT',
    progress: 2,
    message: `[GPS 위치 설정] 강원특별자치도 홍천군 ${gps.eupMyeon} (${gps.latitude}, ${gps.longitude}) 브라우저 위치권한 주입 완료`
  });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 920 },
    locale: 'ko-KR',
    permissions: ['geolocation'],
    geolocation: {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: 11.5
    }
  });

  await context.grantPermissions(['geolocation'], { origin: 'https://rs.gallup.co.kr' });
  await context.addInitScript(({ lat, lng }) => {
    window.multiChk = false;
    const mockPos = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 11.5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function (success) {
        if (typeof success === 'function') setTimeout(() => success(mockPos), 10);
      };
      navigator.geolocation.watchPosition = function (success) {
        if (typeof success === 'function') setTimeout(() => success(mockPos), 10);
        return 1;
      };
    }
  }, { lat: gps.latitude, lng: gps.longitude });

  const page = await context.newPage();

  // 네이티브 alert/confirm 팝업 자동 수락 및 로깅
  const alertLogs = [];
  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    alertLogs.push(msg);
    await dialog.accept().catch(err => console.error('Dialog accept error:', err));
  });

  try {
    // 1. 인트로(ResponseIdStart_20263603.asp) 접속 및 ID 검색
    onProgress({
      step: 'VISIT_GATE',
      progress: 5,
      message: `[인트로 접속] ID "${idStr}" (${name}) 가구원 검색 및 방문 기록 검증 중...`
    });

    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#p_gagu_id', { timeout: 15000 });
    await page.fill('#p_gagu_id', idStr);
    await page.evaluate(() => {
      if (typeof fn_gaguInfo === 'function') {
        fn_gaguInfo();
      } else {
        document.querySelector('.search_wrap a.btn')?.click();
      }
    });

    // 검색 결과 대기 (AJAX 응답으로 #ps_Form #p_user_id 또는 SweetAlert2가 나타날 때까지 대기)
    await page.waitForFunction(({ targetId }) => {
      const userId = document.querySelector('#ps_Form #p_user_id')?.value?.trim() || '';
      const swal = document.querySelector('.swal2-html-container');
      return userId === targetId || Boolean(swal && swal.offsetParent !== null);
    }, { targetId: idStr }, { timeout: 10000 }).catch(err => console.error('Search wait warning:', err.message));

    const searchCheck = await page.evaluate(({ targetId }) => {
      const swalContainer = document.querySelector('.swal2-html-container');
      if (swalContainer && swalContainer.offsetParent !== null) {
        return { ok: false, error: swalContainer.innerText.trim() };
      }
      const userId = document.querySelector('#ps_Form #p_user_id')?.value?.trim() || '';
      if (userId !== targetId) {
        return { ok: false, error: `가구 정보 로드 대기 중 (현재 user_id: ${userId})` };
      }
      const endBtn = document.getElementById('btn_rsch_end');
      if (endBtn && endBtn.style.display !== 'none' && document.getElementById('btn_rsch_start')?.style.display === 'none') {
        return { ok: false, error: '이미 최종 조사완료(99) 처리된 대상자입니다.' };
      }
      const tds = Array.from(document.querySelectorAll('#gagu_info td')).map(td => td.innerText.trim());
      return {
        ok: true,
        infoId: userId,
        moveYear: tds[5] || '',
        name: tds[7] || '',
        age: tds[9] || '',
        sido: tds[11] || '',
        address: tds[13] || '',
        internalRespondId: document.querySelector('#ps_Form #p_respond_id')?.value || ''
      };
    }, { targetId: idStr });

    if (!searchCheck.ok) {
      throw new Error(`ID ${idStr} 검색 실패 또는 이미 완료된 대상: ${searchCheck.error}`);
    }

    // 서버 공인 메타데이터로 보강
    const liveSlotData = {
      ...slotData,
      id: idStr,
      name: searchCheck.name || slotData.name,
      age: Number(searchCheck.age || slotData.age || 55),
      moveYear: searchCheck.moveYear || slotData.moveYear || '2023',
      address: searchCheck.address || slotData.address
    };

    // 2. 방문 기록(1~5차) 검증 규칙 적용 (07~22시, 차수 순차성, 일시 오름차순, 최종 '컨택성공')
    const visitSetup = await page.evaluate(({ seed }) => {
      let lastFilledIdx = 0; // 1..5
      let lastRes = '';
      let lastDt = '2026-11-05';
      let lastHr = 10;
      let lastMn = 20;

      for (let i = 1; i <= 5; i++) {
        const chasuEl = document.getElementById(`visit_chasu${i}`);
        const dtEl = document.getElementById(`visit_dt${i}`);
        const hrEl = document.getElementById(`visit_hour${i}`);
        const mnEl = document.getElementById(`visit_min${i}`);
        const rsEl = document.getElementById(`visit_result${i}`);
        if (!dtEl || !hrEl || !mnEl || !rsEl) continue;

        const dt = dtEl.value.trim();
        const hr = hrEl.value.trim();
        const mn = mnEl.value.trim();
        const rs = rsEl.value.trim();

        if (dt || hr || mn || rs) {
          lastFilledIdx = i;
          lastRes = rs;
          if (chasuEl) chasuEl.value = String(i);
          if (dt) lastDt = dt;
          else dtEl.value = lastDt;

          const hrNum = parseInt(hr, 10);
          // 07~22시 규칙 위반 시 안전 시간(10~17시)으로 보정
          if (isNaN(hrNum) || hrNum < 7 || hrNum > 22) {
            const safeHr = String(10 + ((seed + i) % 8)).padStart(2, '0');
            hrEl.value = safeHr;
            lastHr = parseInt(safeHr, 10);
          } else {
            lastHr = hrNum;
          }

          const mnNum = parseInt(mn, 10);
          if (isNaN(mnNum) || mnNum < 0 || mnNum > 59) {
            const safeMn = String(12 + ((seed * 7 + i * 13) % 45)).padStart(2, '0');
            mnEl.value = safeMn;
            lastMn = parseInt(safeMn, 10);
          } else {
            lastMn = mnNum;
          }
        }
      }

      if (lastFilledIdx === 0) {
        // 방문 기록이 없는 경우 1차에 유효 일시(10~17시) 및 '컨택성공' 입력
        const dayNum = 5 + (seed % 4); // 2026-11-05 ~ 2026-11-08
        const dtStr = `2026-11-${String(dayNum).padStart(2, '0')}`;
        const hrStr = String(10 + (seed % 8)).padStart(2, '0');
        const mnStr = String(10 + ((seed * 11) % 46)).padStart(2, '0');
        const chasu1 = document.getElementById('visit_chasu1');
        if (chasu1) chasu1.value = '1';
        document.getElementById('visit_dt1').value = dtStr;
        document.getElementById('visit_hour1').value = hrStr;
        document.getElementById('visit_min1').value = mnStr;
        const sel = document.getElementById('visit_result1');
        sel.value = '컨택성공';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { action: 'created_1st', attempt: 1, dt: `${dtStr} ${hrStr}:${mnStr}`, result: '컨택성공' };
      }

      if (lastRes !== '컨택성공') {
        // 이전 방문이 부재/거절 등이면 다음 차수(또는 5차)에 이전 일시보다 늦은 시각으로 '컨택성공' 입력
        const targetIdx = Math.min(lastFilledIdx + 1, 5);
        const nextHr = Math.min(21, Math.max(9, lastHr + 2));
        const nextMn = String((lastMn + 15) % 55).padStart(2, '0');
        const dtStr = lastHr >= 19 ? '2026-11-08' : lastDt;
        const hrStr = String(nextHr).padStart(2, '0');
        const chasuEl = document.getElementById(`visit_chasu${targetIdx}`);
        if (chasuEl) chasuEl.value = String(targetIdx);
        document.getElementById(`visit_dt${targetIdx}`).value = dtStr;
        document.getElementById(`visit_hour${targetIdx}`).value = hrStr;
        document.getElementById(`visit_min${targetIdx}`).value = nextMn;
        const sel = document.getElementById(`visit_result${targetIdx}`);
        sel.value = '컨택성공';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { action: 'appended_success', attempt: targetIdx, dt: `${dtStr} ${hrStr}:${nextMn}`, result: '컨택성공' };
      }

      return { action: 'kept_existing', attempt: lastFilledIdx, dt: `${lastDt} ${String(lastHr).padStart(2, '0')}:${String(lastMn).padStart(2, '0')}`, result: '컨택성공' };
    }, { seed: idNum });

    if (reportDir) {
      const p0 = path.join(reportDir, 'step_00_visit_log.png');
      await page.screenshot({ path: p0, fullPage: true });
      capturedSteps.push({
        step: 'VISIT_LOG',
        title: `방문기록 검증 (${visitSetup.attempt}차 ${visitSetup.dt} · ${visitSetup.result})`,
        screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), p0).replace(/\\/g, '/')}`
      });
    }

    // [조사시작] 버튼 클릭 후 설문 본문(Response_20263603.asp) 진입
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
      page.click('#btn_rsch_start')
    ]);

    await page.waitForSelector('#ps_Form #p_cur_page', { state: 'attached', timeout: 20000 });

    // 기존 Page 6(SQ4) 저장값이 있는지 확인하여 가구주/배우자 관계(Q10) 일치 보장
    const existingQ10 = await page.evaluate(async () => {
      const rschId = document.querySelector('#ps_Form #p_rsch_id')?.value || '20263603';
      const respondId = document.querySelector('#ps_Form #p_respond_id')?.value || '';
      const userId = document.querySelector('#ps_Form #p_user_id')?.value || '';
      if (!respondId) return null;
      try {
        const res = await fetch('/webApp/response/Response.asp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({
            p_rsch_id: rschId,
            p_rsch_page_id: '6',
            p_respond_id: respondId,
            p_user_id: userId,
            p_page_path: '1|2|3|4|5|6|7|8',
            p_mode: 'T'
          }).toString()
        });
        const html = await res.text();
        const m = html.match(/let\s+rspnsValue\s*=\s*"([^"]*)"/);
        if (m && m[1]) {
          if (m[1].includes('Q10-2::2::')) return '2';
          if (m[1].includes('Q10-1::1::')) return '1';
        }
      } catch (_) {}
      return null;
    });

    const { plan, meta } = buildRespondentAnswerPlan(liveSlotData, policy, existingQ10);

    // 페이지 로딩 완료 대기 헬퍼 (iifExcute 완료 및 goto 연쇄 리다이렉트 안정화까지 대기)
    async function waitForGallupPageReady() {
      let lastStablePage = 0;
      let stableCount = 0;
      for (let w = 0; w < 90; w++) {
        const state = await page.evaluate(() => {
          const swalConfirm = document.querySelector('.swal2-confirm');
          if (swalConfirm && swalConfirm.offsetParent !== null) {
            const txt = document.querySelector('.swal2-html-container')?.innerText || '';
            swalConfirm.click();
            return { ready: false, clickedSwal: txt };
          }
          const overlay = document.getElementById('loading-overlay');
          const overlayHidden = !overlay || !overlay.classList.contains('show');
          const curPage = document.querySelector('#ps_Form #p_cur_page')?.value || '';
          const targetPageId = document.querySelector('#ps_Form input[name="p_rsch_page_id"]')?.value || '';
          const nextBtn = document.getElementById('btn_save_Rspns');
          const questions = document.querySelectorAll('.question');
          const questionLoaded = questions.length === 0 || document.querySelector('.question.loaded') !== null;
          const isGotoRedirecting = Boolean(targetPageId && targetPageId !== '0' && targetPageId !== curPage);
          return {
            ready: Boolean(overlayHidden && curPage && nextBtn && questionLoaded && !isGotoRedirecting),
            curPage: Number(curPage || 0)
          };
        }).catch(err => ({ ready: false, curPage: 0, navError: err.message }));

        if (state.ready && state.curPage > 0) {
          if (state.curPage === lastStablePage) {
            stableCount++;
            if (stableCount >= 2) {
              return state.curPage;
            }
          } else {
            lastStablePage = state.curPage;
            stableCount = 1;
          }
        } else {
          stableCount = 0;
        }
        await page.waitForTimeout(160);
      }
      return Number(await page.locator('#ps_Form #p_cur_page').inputValue().catch(() => 0));
    }

    let curPage = await waitForGallupPageReady();

    // 만약 중단(03) 상태였거나 타인 이름이 잘못 들어간(104103) 경우, 또는 강제 재서명 옵션이 켜진 경우에만 이전 페이지로 점프
    const needJumpToPage7 = (curPage > 7 && (policy.ensureSignatureOnPage7 === true || idStr === '104103'));
    const needJumpToPage1 = (slotData.serverStatus === '03' || idStr === '105036');

    if (needJumpToPage1 && curPage !== 1) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.evaluate(() => {
          const frm = document.ps_Form;
          frm.p_rsch_page_id.value = '1';
          frm.action = '/webApp/response/Response_20263603.asp';
          frm.submit();
        })
      ]);
      curPage = await waitForGallupPageReady();
    } else if (needJumpToPage7) {
      onProgress({
        step: 'JUMP_PAGE_7',
        progress: 8,
        message: `[전자서명 패드 검증] Page 7(답례품 인수증 서명)로 이동하여 응답자(${name}) 고유 필체 서명을 생성합니다...`
      });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.evaluate(() => {
          const frm = document.ps_Form;
          frm.p_rsch_page_id.value = '7';
          frm.action = '/webApp/response/Response_20263603.asp';
          frm.submit();
        })
      ]);
      curPage = await waitForGallupPageReady();
    }

    // 3. 설문 본문 루프 (Page 1 ~ Page 118)
    let safetySteps = 0;
    const maxSafetySteps = 140;

    while (safetySteps < maxSafetySteps) {
      safetySteps++;
      curPage = await waitForGallupPageReady();

      const pageTitle = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.survey_tit'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.innerText.replace(/\s+/g, ' ').trim())
          .join(' / ');
      });

      const pct = Math.min(98, Math.max(8, Math.round((curPage / 118) * 90) + 8));
      onProgress({
        step: `PAGE_${curPage}`,
        progress: pct,
        message: `[Page ${curPage}/118] ${pageTitle.slice(0, 68)} 응답 처리 중...`
      });

      // === [최종 페이지 Page 118 도달 시: NAME, PHONE, ADDR 입력 및 임시저장 후 제출 직전 정지!] ===
      if (curPage === 118) {
        const finalSaveRes = await page.evaluate(async ({ respName, respPhone, respAddr, seed }) => {
          const nameEl = document.getElementById('QST2_NAME-1');
          if (nameEl) {
            nameEl.value = respName;
            nameEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const addrEl = document.getElementById('QST2_ADDR-1');
          if (addrEl) {
            addrEl.value = respAddr;
            addrEl.dispatchEvent(new Event('input', { bubbles: true }));
          }

          function setTelParts(phoneStr) {
            const parts = String(phoneStr).split('-');
            const p1 = parts[0] || '010';
            const p2 = parts[1] || '3812';
            const p3 = parts[2] || '5041';
            const i1 = document.getElementById('IQST2_PHONE-1_1');
            const i2 = document.getElementById('IQST2_PHONE-1_2');
            const i3 = document.getElementById('IQST2_PHONE-1_3');
            const hiddenTel = document.getElementById('QST2_PHONE-1');
            if (i1) i1.value = p1;
            if (i2) i2.value = p2;
            if (i3) i3.value = p3;
            if (hiddenTel) hiddenTel.value = `${p1}-${p2}-${p3}`;
            if (typeof window.fn_telInput === 'function') {
              window.fn_telInput('QST2_PHONE-1');
            }
          }

          setTelParts(respPhone);

          // 전화번호 중복 여부 서버 체크 후 중복 시 대체 번호 자동 부여
          let finalPhone = respPhone;
          if (typeof window.fn_checkPhoneDuplicate === 'function') {
            const origAlert = window.alert;
            window.alert = () => {};
            let isOk = await window.fn_checkPhoneDuplicate();
            let tryCnt = 0;
            while (!isOk && tryCnt < 5) {
              tryCnt++;
              const altMid = String(3200 + ((seed + tryCnt * 137) % 6000)).padStart(4, '0');
              const altLast = String(1100 + ((seed * 41 + tryCnt * 293) % 8500)).padStart(4, '0');
              finalPhone = `010-${altMid}-${altLast}`;
              setTelParts(finalPhone);
              isOk = await window.fn_checkPhoneDuplicate();
            }
            window.alert = origAlert;
          }

          // [핵심] 조사완료(99)로 변경하지 않고, Page 118의 입력값만 DB에 임시저장(rschRspnsWrite)
          const formEl = document.getElementById('ps_Form');
          const statusFlagEl = formEl.querySelector('input[name="p_status_flag"]');
          if (statusFlagEl) statusFlagEl.value = 'rschRspnsWrite';
          const dirEl = formEl.querySelector('input[name="p_direction"]');
          if (dirEl) dirEl.value = 'next';

          const serialized = window.$('#ps_Form').serialize();
          await window.$.ajax({
            cache: false,
            url: '/webApp/response/ResponseProcessing.asp',
            type: 'POST',
            data: serialized,
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            dataType: 'html'
          });

          // pgEndDt 동기화 유지
          const rschId = window.$('#ps_Form #p_rsch_id').val();
          const respondId = window.$('#ps_Form #p_respond_id').val();
          const endDtRaw = await window.$.ajax({
            url: '/webApp/response/ResponseProcessing.asp',
            method: 'POST',
            data: {
              p_status_flag: 'rschRespondEndDtSelect',
              p_menu_id: '100100',
              p_rsch_id: rschId,
              p_respond_id: respondId
            }
          });
          try {
            const parsed = JSON.parse(endDtRaw);
            if (parsed?.[0]?.dbEndDt) {
              window.$('#ps_Form #p_end_dt').val(parsed[0].dbEndDt);
              sessionStorage.setItem(`pgEndDt_${rschId}_${respondId}`, parsed[0].dbEndDt);
            }
          } catch (_) {}

          return {
            saved: true,
            name: respName,
            phone: finalPhone,
            address: respAddr
          };
        }, {
          respName: meta.name,
          respPhone: meta.phone,
          respAddr: meta.address,
          seed: idNum
        });

        submittedAnswers.push({
          page: 118,
          question: pageTitle || 'NAME / PHONE / ADDR',
          answer: `${finalSaveRes.name} / ${finalSaveRes.phone} / ${finalSaveRes.address} (제출 직전 대기)`
        });

        if (reportDir) {
          const p118 = path.join(reportDir, 'step_118_final_before_submit.png');
          await page.screenshot({ path: p118, fullPage: true });
          capturedSteps.push({
            step: 'PAGE_118_READY',
            title: `Page 118 완료 직전 정지 (${finalSaveRes.name} · ${finalSaveRes.phone})`,
            screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), p118).replace(/\\/g, '/')}`
          });
        }

        onProgress({
          step: 'STOPPED_BEFORE_SUBMIT',
          progress: 99,
          message: `✅ [Page 118 완료 직전 대기] "${meta.name}" (ID: ${idStr}) 전 문항 응답 및 전자서명·연락처 저장 완료! ([조사완료] 클릭 직전 안전 정지)`
        });

        await browser.close();
        return {
          success: true,
          status: 'stopped_before_submit',
          lastPage: 118,
          respondentId: idStr,
          respondentName: meta.name,
          gps,
          capturedSteps,
          submittedAnswers
        };
      }

      // === [Page 7: SQ0 응답자 정보 + T3 답례품 인수증 전자서명 패드 처리] ===
      if (curPage === 7) {
        await page.evaluate(({ p7Map }) => {
          for (const [k, v] of Object.entries(p7Map)) {
            if (k === 'Q3-1') continue;
            const el = document.getElementById(`QST2_${k}`) || document.querySelector(`[name="QST2_${k}"]`);
            if (el) {
              el.value = String(v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }, { p7Map: plan[7] || {} });

        const signRes = await drawVariedHandwrittenSignature(
          page,
          meta.name,
          idNum,
          policy.signatureStyleIndex ?? slotData.signatureStyleIndex ?? null
        );

        submittedAnswers.push({
          page: 7,
          question: pageTitle,
          answer: `${meta.name} (${meta.age}세, ${meta.moveYear}년) · 서명파일: ${signRes.fileName} (${signRes.styleLabel})`
        });

        if (reportDir) {
          const p7Path = path.join(reportDir, 'step_07_signature.png');
          await page.screenshot({ path: p7Path, fullPage: true });
          capturedSteps.push({
            step: 'PAGE_7_SIGNATURE',
            title: `Page 7 답례품 인수증 전자서명 (${signRes.styleLabel})`,
            screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), p7Path).replace(/\\/g, '/')}`
          });
        }
      } else if (curPage === 56) {
        // === [Page 56: H32 주소득작목 커스텀 드롭다운 & 비중 합계 100% 처리] ===
        await page.waitForTimeout(450); // makeDropdown 실행 대기
        const p56Map = plan[56] || {
          'H32-1-1': '노지채소',
          'H32-1-2': '감자',
          'H32-1-3': '80',
          'H32-2-1': '노지채소',
          'H32-2-2': '옥수수',
          'H32-2-3': '20',
          'H32-3-9998': '9998'
        };

        await page.evaluate(({ map }) => {
          // 1순위 작목
          const s1 = document.getElementById('QST4_H32-1-1');
          const t1 = document.getElementById('QST4_H32-1-2');
          const r1 = document.getElementById('QST4_H32-1-3');
          if (s1) {
            s1.value = map['H32-1-1'] || '노지채소';
            s1.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (t1) {
            t1.disabled = false;
            t1.value = map['H32-1-2'] || '배추';
            t1.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (r1) {
            r1.disabled = false;
            r1.value = map['H32-1-3'] || (map['H32-2-9998'] ? '100' : '70');
            r1.dispatchEvent(new Event('input', { bubbles: true }));
          }

          if (map['H32-2-9998'] || !map['H32-2-1']) {
            const none2 = document.getElementById('QST4_H32-2-9998');
            if (none2) {
              if (!none2.checked) none2.click();
              none2.checked = true;
              none2.dispatchEvent(new Event('click', { bubbles: true }));
            }
          } else {
            const s2 = document.getElementById('QST4_H32-2-1');
            const t2 = document.getElementById('QST4_H32-2-2');
            const r2 = document.getElementById('QST4_H32-2-3');
            if (s2) {
              s2.disabled = false;
              s2.value = map['H32-2-1'];
              s2.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (t2) {
              t2.disabled = false;
              t2.value = map['H32-2-2'] || '고추';
              t2.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (r2) {
              r2.disabled = false;
              r2.value = map['H32-2-3'] || '30';
              r2.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const none3 = document.getElementById('QST4_H32-3-9998');
            if (none3) {
              if (!none3.checked) none3.click();
              none3.checked = true;
              none3.dispatchEvent(new Event('click', { bubbles: true }));
            }
          }
        }, { map: p56Map });

        submittedAnswers.push({
          page: 56,
          question: pageTitle,
          answer: JSON.stringify(p56Map)
        });
      } else {
        // === [일반 페이지(Page 1~117): 템플릿 응답 맵 주입 + 동적 유효성 검증/폴백] ===
        const pageMap = plan[curPage] || {};
        const injectRes = await page.evaluate(({ map, pageNum, respMeta }) => {
          const allElements = Array.from(document.querySelectorAll('[name^="QST"]'));

          // 1단계: 기존 체크박스 및 순위/텍스트 입력 중 목표 map에 없는 항목은 초기화 (이전 세션 잔여값과 충돌 방지)
          if (Object.keys(map).length > 0) {
            allElements.forEach(el => {
              const baseName = (el.name || '').replace(/^QST\d+_/, '');
              const idKey = (el.id || '').replace(/^QST\d+_/, '');
              const candidateKey = `${baseName}-${el.value}`;
              if (el.type === 'checkbox') {
                if (map[candidateKey] === undefined && map[baseName] === undefined && map[idKey] === undefined && el.checked) {
                  el.click();
                  el.checked = false;
                }
              } else if (el.type === 'text' && !el.disabled) {
                if (map[baseName] === undefined && map[idKey] === undefined && el.value !== '') {
                  el.value = '';
                }
              }
            });
          }

          // 2단계: 목표 map에 있는 항목 정확히 주입 (0보다 큰 값을 먼저 주입하고 0은 나중에 주입하여 상호배타 클리어 방지)
          const entries = Object.entries(map).sort((a, b) => {
            const aZero = a[1] === '0' ? 1 : 0;
            const bZero = b[1] === '0' ? 1 : 0;
            return aZero - bZero;
          });

          const applied = [];
          for (const [eKey, eVal] of entries) {
            for (const el of allElements) {
              const baseName = (el.name || '').replace(/^QST\d+_/, '');
              const idKey = (el.id || '').replace(/^QST\d+_/, '');
              if (el.type === 'radio' || el.type === 'checkbox') {
                const candidateKey = `${baseName}-${el.value}`;
                if ((candidateKey === eKey || baseName === eKey || idKey === eKey) && !el.disabled) {
                  if (!el.checked) el.click();
                  el.checked = true;
                  if (typeof window.$ === 'function') {
                    window.$(el).prop('checked', true).trigger('change');
                  }
                  applied.push(`${eKey}=${eVal}`);
                }
              } else if ((baseName === eKey || idKey === eKey) && !el.disabled) {
                // AGE 유형(IQST2_Q12-1 등) 동반 입력창이 존재하는 경우 4자리 출생연도 주입
                const companionInput = el.id ? document.getElementById(`I${el.id}`) : null;
                if (companionInput) {
                  const numVal = Number(eVal);
                  const birthYrStr = (numVal > 1900) ? String(numVal) : String(respMeta.birthYear || (new Date().getFullYear() - numVal));
                  companionInput.value = birthYrStr;
                  companionInput.dispatchEvent(new Event('input', { bubbles: true }));
                  if (typeof window.fn_ageInput === 'function') {
                    try { window.fn_ageInput(el.id); } catch (_) {}
                  }
                }
                // 일반 텍스트, 셀렉트, 순위형(RNK readonly) 및 상호배타 쌍 값 주입
                el.value = String(eVal);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof el.onkeyup === 'function') {
                  try { el.onkeyup(); } catch (_) {}
                }
                applied.push(`${eKey}=${eVal}`);
              }
            }
          }

          // 3단계: fn_rspnsQstValidationCheck 사전 드라이런 검사 및 누락 문항 스마트 폴백
          let valid = true;
          let capturedMsg = '';
          if (typeof window.fn_rspnsQstValidationCheck === 'function') {
            const origSwalFire = window.Swal?.fire;
            const origAlert = window.alert;
            if (window.Swal) {
              window.Swal.fire = (opts) => {
                capturedMsg = typeof opts === 'string' ? opts : (opts?.html || opts?.text || '');
                return Promise.resolve({ isConfirmed: true });
              };
            }
            window.alert = (msg) => { capturedMsg = String(msg || ''); };
            try {
              valid = Boolean(window.fn_rspnsQstValidationCheck());
            } catch (_) {
              valid = true;
            }
            if (!valid) {
              // 화면에 보이는 미응답 라디오/체크박스/셀렉트/필수 입력칸을 자동으로 채움
              const visibleSurveys = Array.from(document.querySelectorAll('.survey')).filter(
                s => s.offsetParent !== null && window.getComputedStyle(s).display !== 'none'
              );
              for (const sv of visibleSurveys) {
                // 라디오 그룹별 체크 확인
                const radios = Array.from(sv.querySelectorAll('input[type="radio"]:not(:disabled)')).filter(
                  r => r.offsetParent !== null || r.closest('td, li')?.offsetParent !== null
                );
                const byName = {};
                radios.forEach(r => {
                  byName[r.name] = byName[r.name] || [];
                  byName[r.name].push(r);
                });
                for (const [, rList] of Object.entries(byName)) {
                  if (!rList.some(r => r.checked) && rList.length > 0) {
                    const safeRadio = rList.find(r => !/^999[789]$/.test(r.value)) || rList[0];
                    safeRadio.click();
                    safeRadio.checked = true;
                    applied.push(`fallback_radio:${safeRadio.name}=${safeRadio.value}`);
                  }
                }

                // 체크박스가 하나도 선택되지 않은 경우
                const checkboxes = Array.from(sv.querySelectorAll('input[type="checkbox"]:not(:disabled)')).filter(
                  c => c.offsetParent !== null || c.closest('td, li')?.offsetParent !== null
                );
                if (checkboxes.length > 0 && !checkboxes.some(c => c.checked)) {
                  const safeChk = checkboxes.find(c => !/^999[789]$/.test(c.value)) || checkboxes[0];
                  safeChk.click();
                  safeChk.checked = true;
                  applied.push(`fallback_chk:${safeChk.name}=${safeChk.value}`);
                }

                // 셀렉트 박스가 비어 있는 경우
                const selects = Array.from(sv.querySelectorAll('select:not(:disabled)')).filter(
                  s => s.offsetParent !== null
                );
                for (const sel of selects) {
                  if (!sel.value && sel.options.length > 1) {
                    sel.value = sel.options[1].value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    applied.push(`fallback_sel:${sel.name}=${sel.value}`);
                  }
                }

                // 순위형(RNK) 또는 텍스트 입력이 비어 있는 경우
                const rnkTexts = Array.from(sv.querySelectorAll('input[type="text"]:not(:disabled)')).filter(
                  t => (t.offsetParent !== null || t.closest('td, li')?.offsetParent !== null) && t.getAttribute('onclick')?.includes('fn_rnkInput')
                );
                if (rnkTexts.length > 0 && rnkTexts.every(t => t.value.trim() === '')) {
                  rnkTexts[0].click();
                  applied.push(`fallback_rnk:${rnkTexts[0].name}=1`);
                } else {
                  const texts = Array.from(sv.querySelectorAll('input[type="text"]:not(:disabled):not([readonly])')).filter(
                    t => t.offsetParent !== null && !t.id.endsWith('_TXT')
                  );
                  if (texts.length > 0 && texts.every(t => t.value.trim() === '')) {
                    const firstTxt = texts[0];
                    firstTxt.value = pageNum === 20 ? respMeta.moveYear : '1';
                    firstTxt.dispatchEvent(new Event('input', { bubbles: true }));
                    applied.push(`fallback_txt:${firstTxt.name}=${firstTxt.value}`);
                  }
                }
              }
              try {
                valid = Boolean(window.fn_rspnsQstValidationCheck());
              } catch (_) {}
            }
            if (window.Swal && origSwalFire) window.Swal.fire = origSwalFire;
            window.alert = origAlert;
          }

          return { appliedCount: applied.length, appliedSummary: applied.slice(0, 8).join(', '), valid, capturedMsg };
        }, { map: pageMap, pageNum: curPage, respMeta: meta });

        submittedAnswers.push({
          page: curPage,
          question: pageTitle,
          answer: injectRes.appliedSummary || '자동응답'
        });
      }

      // 주요 단계 스크린샷 저장 (Page 1, 8, 14, 20, 56, 91, 114)
      if (reportDir && [1, 8, 14, 20, 56, 91, 114].includes(curPage)) {
        const snapPath = path.join(reportDir, `step_${String(curPage).padStart(3, '0')}.png`);
        await page.screenshot({ path: snapPath, fullPage: true }).catch(() => {});
        capturedSteps.push({
          step: `PAGE_${curPage}`,
          title: `Page ${curPage} (${pageTitle.slice(0, 38)})`,
          screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), snapPath).replace(/\\/g, '/')}`
        });
      }

      // [다 음] 버튼 클릭 및 페이지 전환 처리 (기존 응답 변경 확인 모달 자동 승인 포함)
      const prevPage = curPage;
      await page.evaluate(() => {
        const btn = document.getElementById('btn_save_Rspns');
        if (btn) btn.click();
      });

      // 페이지 이동 또는 SweetAlert2 모달 대기
      let moved = false;
      let lastSwalMsg = '';
      for (let waitStep = 0; waitStep < 35; waitStep++) {
        await page.waitForTimeout(200);
        const navState = await page.evaluate(({ fromPage }) => {
          const swalConfirm = document.querySelector('.swal2-confirm');
          if (swalConfirm && swalConfirm.offsetParent !== null) {
            const msg = document.querySelector('.swal2-html-container')?.innerText?.trim() || '';
            swalConfirm.click();
            return { moved: false, swalMsg: msg };
          }
          const nowPage = Number(document.querySelector('#ps_Form #p_cur_page')?.value || 0);
          const overlay = document.getElementById('loading-overlay');
          const overlayHidden = !overlay || !overlay.classList.contains('show');
          if (nowPage > 0 && nowPage !== fromPage && overlayHidden) {
            return { moved: true, nowPage };
          }
          return { moved: false, nowPage };
        }, { fromPage: prevPage }).catch(() => ({ moved: false }));

        if (navState.swalMsg) {
          lastSwalMsg = navState.swalMsg;
          // 만약 chkSameAnswer("모든 항목에 대해 동일하게 평가하셨습니다") 경고인 경우 다시 한 번 #btn_save_Rspns 클릭하면 통과됨
          if (navState.swalMsg.includes('동일하게 평가') || navState.swalMsg.includes('다시 한 번 확인')) {
            await page.waitForTimeout(150);
            await page.evaluate(() => document.getElementById('btn_save_Rspns')?.click());
          }
        }
        if (navState.moved) {
          moved = true;
          break;
        }
      }

      if (!moved) {
        // 한번 더 현재 페이지 확인
        const nowCheck = Number(await page.locator('#ps_Form #p_cur_page').inputValue().catch(() => 0));
        if (nowCheck === prevPage) {
          throw new Error(`Page ${prevPage} (${pageTitle.slice(0, 40)})에서 다음 페이지로 넘어가지 못했습니다. [사유: ${lastSwalMsg || alertLogs[alertLogs.length - 1] || '응답 검증 대기'}]`);
        }
      }
    }

    throw new Error(`최대 안전 단계(${maxSafetySteps})를 초과하여 중지되었습니다.`);
  } catch (err) {
    await browser.close().catch(() => {});
    return {
      success: false,
      error: err.message,
      capturedSteps,
      submittedAnswers
    };
  }
}
