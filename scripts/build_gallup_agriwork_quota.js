/**
 * 2025년 기준 농업고용인력 실태조사 (한국갤럽)
 * 마스터 구글시트(1ONQZjGIa2xIopaMbYS-27B_DMHBH8MlOK7tdDTC6Gz0) + 포털 실측 현황 + 통합 페르소나 DB(1,138명) 기반
 * 쿼터 JSON / XLSX 생성 스크립트
 *
 * 구성:
 * 1) 경영체 설문 (rsid=3154322641): 양주_안재은 66건 + 김미경(동두천) 22건 = 88건 (기완료 19건 + 미완료 69건)
 * 2) 내국인 근로자 부수 설문 (rsid=3111898935): 시트 19열(상근/임시/일용) 표시 & 고용있음 39건 (양주 19건 + 동두천 20건)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import {
  loadRespondentPersonaPool,
  hashRespondentSeed,
  inferGenderByName
} from '../src/utils/respondent-pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const AGRIWORK_GOOGLE_SHEET_ID = '1ONQZjGIa2xIopaMbYS-27B_DMHBH8MlOK7tdDTC6Gz0';
export const AGRIWORK_SHEET_TABS = [
  {
    tabName: '양주_안재은',
    gid: '481207785',
    surveyorId: '40878',
    surveyorPw: '840902',
    surveyorName: '안재은',
    sido: '경기도',
    sigungu: '양주시'
  },
  {
    tabName: '김미경',
    gid: '2101238121',
    surveyorId: '47837',
    surveyorPw: '660709',
    surveyorName: '김미경',
    sido: '경기도',
    sigungu: '동두천시'
  }
];

// 포털(agriwork.gallup.co.kr) 실측 기완료 19건 목록 (안재은 15건 + 김미경 4건)
const PORTAL_COMPLETED_OWNER_IDS = new Set([
  // 40878 안재은 (15건)
  'A021186', 'A021187', 'A021200', 'A021201', 'A021213',
  'A021217', 'A021219', 'A021221', 'A021294', 'A021296',
  'A021353', 'A021411', 'A021414', 'A021449', 'B008243',
  // 47837 김미경 (4건)
  'A011375', 'A011402', 'A011416', 'B001433'
]);

// 경기도 양주시·동두천시 읍·면·동 중심 GPS 좌표
export const AGRIWORK_EUP_MYEON_DONG_GPS = {
  // 양주시
  '백석읍': { lat: 37.7885, lng: 126.9860 },
  '광적면': { lat: 37.8264, lng: 126.9822 },
  '장흥면': { lat: 37.7225, lng: 126.9455 },
  '남면':   { lat: 37.8938, lng: 126.9736 },
  '은현면': { lat: 37.8785, lng: 127.0324 },
  '덕정동': { lat: 37.8432, lng: 127.0645 },
  '옥정동': { lat: 37.8215, lng: 127.0928 },
  '남방동': { lat: 37.7770, lng: 127.0398 },
  '삼숭동': { lat: 37.7988, lng: 127.0935 },
  '덕계동': { lat: 37.8186, lng: 127.0492 },
  '회암동': { lat: 37.8428, lng: 127.0912 },
  // 동두천시
  '생연동': { lat: 37.9082, lng: 127.0568 },
  '지행동': { lat: 37.8920, lng: 127.0545 },
  '탑동동': { lat: 37.8825, lng: 127.1062 },
  '하봉암동': { lat: 37.9495, lng: 127.0672 },
  '광암동': { lat: 37.9045, lng: 127.0886 }
};

export function computeAgriworkGps(sigungu = '', eupMyeon = '', seedStr = '') {
  const key = Object.keys(AGRIWORK_EUP_MYEON_DONG_GPS).find(k => String(eupMyeon || '').includes(k))
    || (String(sigungu).includes('동두천') ? '생연동' : '백석읍');
  const base = AGRIWORK_EUP_MYEON_DONG_GPS[key];
  const h = hashRespondentSeed(seedStr || key);
  const dLat = (((h % 200) - 100) * 0.000016);
  const dLng = (((Math.floor(h / 211) % 200) - 100) * 0.000016);
  return {
    eupMyeon: key,
    latitude: Number((base.lat + dLat).toFixed(6)),
    longitude: Number((base.lng + dLng).toFixed(6))
  };
}

/**
 * 시트의 (층화, 재배품목) 조합을 갤럽 공식 코드(농작물 100~809 / 축산물 901~914) 및 기타 텍스트로 100% 결정론적 변환
 */
export function resolveGallupAgriItemSpec(strataRaw = '', cropRaw = '') {
  const s = String(strataRaw || '').replace(/\s+/g, '');
  const c = String(cropRaw || '').trim();
  const cClean = c.replace(/\s+/g, '');
  const isFacility = /시설/.test(s) || /시설/.test(cClean);

  // 1) 축산 여부 먼저 판별 (단, B001433 처럼 층화가 축산이나 품목이 홍고추(노지채소)인 교차 건 예외 처리)
  if (/한우/.test(cClean)) return { isLivestock: true, fullLabel: '축산-한우(901)', code: '901', unitVal: '1', etcText: '' };
  if (/젖소|젓소/.test(cClean)) return { isLivestock: true, fullLabel: '축산-젓소 암컷(903)', code: '903', unitVal: '1', etcText: '' };
  if (/돼지/.test(cClean)) return { isLivestock: true, fullLabel: '축산-돼지(904)', code: '904', unitVal: '1', etcText: '' };
  if (/사슴/.test(cClean)) return { isLivestock: true, fullLabel: '축산-사슴(910)', code: '910', unitVal: '1', etcText: '' };
  if (/벌류|꿀벌/.test(cClean)) return { isLivestock: true, fullLabel: '축산-꿀벌(통)(912)', code: '912', unitVal: '4', etcText: '' };
  if (/개류/.test(cClean)) return { isLivestock: true, fullLabel: '축산-기타 가축, 곤충(913)', code: '913', unitVal: '2', etcText: '개' };

  // 2) 특수/교차 및 기타 코드(enabledCodes) 품목 직매핑
  if (cClean === '벼' || cClean === '논벼') return { isLivestock: false, fullLabel: '논벼-논벼(100)', code: '100', etcText: '', isFacility: false };
  if (/옥수수사료|사료작물/.test(cClean)) return { isLivestock: false, fullLabel: '기타작물-기타 사료작물(801)', code: '801', etcText: cClean.includes('옥수수') ? '사료용옥수수' : '사료작물', isFacility: false };
  if (/옥수수/.test(cClean)) return { isLivestock: false, fullLabel: '식량작물-(식용) 옥수수(103)', code: '103', etcText: '', isFacility: false };
  if (/수수/.test(cClean)) return { isLivestock: false, fullLabel: '식량작물-기타 식량 작물(108)', code: '108', etcText: '수수', isFacility: false };
  if (cClean === '콩') return { isLivestock: false, fullLabel: '식량작물-콩(104)', code: '104', etcText: '', isFacility: false };
  if (cClean === '팥') return { isLivestock: false, fullLabel: '식량작물-팥(105)', code: '105', etcText: '', isFacility: false };
  if (cClean === '감자') return { isLivestock: false, fullLabel: '식량작물-감자(106)', code: '106', etcText: '', isFacility: false };
  if (cClean === '고구마') return { isLivestock: false, fullLabel: '식량작물-고구마(107)', code: '107', etcText: '', isFacility: false };

  if (/표고버섯/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '특용작물/버섯-(시설) 표고 원목(본수)(410)', code: '410', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '특용작물/버섯-(노지) 표고버섯(원목 본수)(405)', code: '405', etcText: '', isFacility: false };
  }
  if (/들깨/.test(cClean)) return { isLivestock: false, fullLabel: '특용작물/버섯-들깨(403)', code: '403', etcText: '', isFacility: false };
  if (/당근/.test(cClean)) return { isLivestock: false, fullLabel: '채소/산나물(노지)-당근(220)', code: '220', etcText: '', isFacility: false };
  if (/대파/.test(cClean)) return { isLivestock: false, fullLabel: '채소/산나물(노지)-대파(210)', code: '210', etcText: '', isFacility: false };
  if (/여름무|^무$/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-무(302)', code: '302', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-무(203)', code: '203', etcText: '', isFacility: false };
  }
  if (/배추/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-배추(301)', code: '301', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-배추(201)', code: '201', etcText: '', isFacility: false };
  }
  if (/양배추/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-서양채소(321)', code: '321', etcText: '양배추', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-양배추(216)', code: '216', etcText: '', isFacility: false };
  }
  if (/갓/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-기타 시설 산나물(322)', code: '322', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-기타 노지 산나물(226)', code: '226', etcText: '갓', isFacility: false };
  }
  if (/엽경채류/.test(cClean)) {
    return { isLivestock: false, fullLabel: '기타작물-기타 시설 작물(809)', code: '809', etcText: '엽경채류', isFacility: true };
  }
  if (/채소종자/.test(cClean)) {
    return { isLivestock: false, fullLabel: '기타작물-육묘 작물(모)(808)', code: '808', etcText: '', isFacility: false };
  }
  if (/엄나무/.test(cClean)) {
    return { isLivestock: false, fullLabel: '약용작물-기타 약용 작물(609)', code: '609', etcText: '엄나무', isFacility: false };
  }
  if (/건고추/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-건고추(303)', code: '303', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-건고추(205)', code: '205', etcText: '', isFacility: false };
  }
  if (/홍고추/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-홍고추(304)', code: '304', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-홍고추(206)', code: '206', etcText: '', isFacility: false };
  }
  if (/오이/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-오이(313)', code: '313', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-오이(217)', code: '217', etcText: '', isFacility: false };
  }
  if (/상추/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-상추(311)', code: '311', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-상추(214)', code: '214', etcText: '', isFacility: false };
  }
  if (/수박/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '채소/산나물(시설)-수박(314)', code: '314', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '채소/산나물(노지)-수박(219)', code: '219', etcText: '', isFacility: false };
  }
  if (/사과/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-사과(501)', code: '501', etcText: '', isFacility: false };
  if (/복숭아/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-복숭아(503)', code: '503', etcText: '', isFacility: false };
  if (/자두/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-자두(507)', code: '507', etcText: '', isFacility: false };
  if (/매실/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-매실(508)', code: '508', etcText: '', isFacility: false };
  if (/밤/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-밤(511)', code: '511', etcText: '', isFacility: false };
  if (/대추/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-대추(513)', code: '513', etcText: '', isFacility: false };
  if (/오디/.test(cClean)) return { isLivestock: false, fullLabel: '과수(노지)-기타 노지 과수(519)', code: '519', etcText: '오디', isFacility: false };
  if (/포도/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '과수(시설)-포도(520)', code: '520', etcText: '', isFacility: true }
      : { isLivestock: false, fullLabel: '과수(노지)-포도(505)', code: '505', etcText: '', isFacility: false };
  }
  if (/블루베리/.test(cClean)) {
    return isFacility
      ? { isLivestock: false, fullLabel: '과수(시설)-기타 시설과수(522)', code: '522', etcText: '블루베리', isFacility: true }
      : { isLivestock: false, fullLabel: '과수(노지)-블루베리(510)', code: '510', etcText: '', isFacility: false };
  }
  if (/오미자/.test(cClean)) return { isLivestock: false, fullLabel: '약용작물-오미자(601)', code: '601', etcText: '', isFacility: false };
  if (/작약/.test(cClean)) return { isLivestock: false, fullLabel: '약용작물-기타 약용 작물(609)', code: '609', etcText: '작약', isFacility: false };
  if (/장미/.test(cClean)) return { isLivestock: false, fullLabel: '화초/관상-장미(704)', code: '704', etcText: '', isFacility: true };
  if (/향나무/.test(cClean)) return { isLivestock: false, fullLabel: '화초/관상-조경수(707)', code: '707', etcText: '향나무', isFacility: false };
  if (/화훼/.test(cClean)) return { isLivestock: false, fullLabel: '화초/관상-기타 관상작물(711)', code: '711', etcText: '초화류', isFacility: true };

  return { isLivestock: false, fullLabel: '식량작물-콩(104)', code: '104', etcText: '', isFacility: false };
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normalizeVisitDate(raw = '') {
  const m = String(raw || '').trim().match(/^(?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})$/);
  if (!m) return '2026-11-02';
  return `${m[1] || '2026'}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function normalizeVisitTime(raw = '', seed = 1) {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const hr = String(10 + (seed % 7)).padStart(2, '0');
  const mn = String((seed * 10) % 50).padStart(2, '0');
  return `${hr}:${mn}`;
}

function normalizePhone(rawPhone = '', seed = 1001, usedPhones = new Set()) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  let candidate = '';
  if (digits.length === 11 && digits.startsWith('010')) {
    candidate = `010-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  } else if (digits.length === 8) {
    candidate = `010-${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }
  if (candidate && !usedPhones.has(candidate)) {
    usedPhones.add(candidate);
    return candidate;
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const h = hashRespondentSeed(`${seed}_${attempt}`);
    const mid = String(2100 + (h % 7700)).padStart(4, '0');
    const last = String(1100 + (Math.floor(h / 97) % 8800)).padStart(4, '0');
    if (/^(\d)\1{3}$/.test(mid) || /^(\d)\1{3}$/.test(last)) continue;
    const ph = `010-${mid}-${last}`;
    if (!usedPhones.has(ph)) {
      usedPhones.add(ph);
      return ph;
    }
  }
  return '010-5842-7391';
}

function resolveWorkerTypeInfo(rawWorkerCol = '', hasEmployed = false) {
  const s = String(rawWorkerCol || '').trim();
  if (!hasEmployed) return { label: '없음', code: '0' };
  if (/상근|상용/.test(s)) return { label: '상용근로자', code: '1' };
  if (/임시/.test(s)) return { label: '임시근로자', code: '2' };
  if (/일용/.test(s)) return { label: '일용근로자', code: '3' };
  // 시트에 고용=있음이나 19열이 비어 있는 경우 기본 일용근로자(내국인) 적용
  return { label: '일용근로자(기본)', code: '3' };
}

export function cleanAgriworkAddress(rawAddr = '', sigungu = '양주시', eupMyeon = '') {
  let s = String(rawAddr || '').trim();
  // 중첩 괄호 포함 연락처·가족 메모 제거 (예: "(010-9142-6610 (아들))", "(박정용(자):010-8869-8754)")
  for (let pass = 0; pass < 4; pass++) {
    s = s.replace(/\s*\([^()]*(?:\d{2,4}[-.:\s]\d{3,4}|01[016789]|아버지|어머니|아들|딸|남편|배우자|부인|처|자녀|모친|부친|연락처|핸드폰|휴대폰)[^()]*\)/g, '');
    s = s.replace(/\((?:자|모|부|처|형|제)\)/g, '');
  }
  s = s.replace(/\s*\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!s) {
    return `경기도 ${sigungu} ${eupMyeon}`.trim();
  }
  return s;
}

export async function buildGallupAgriworkQuotaDataset() {
  const personaPool = loadRespondentPersonaPool();
  const workerCandidates = personaPool.filter(p => p.age >= 32 && p.age <= 66);
  const usedWorkerNames = new Set();
  const usedPhones = new Set();

  const ownerItems = [];
  const workerItems = [];

  for (const tab of AGRIWORK_SHEET_TABS) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${AGRIWORK_GOOGLE_SHEET_ID}/export?format=csv&gid=${tab.gid}`;
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`구글시트(${tab.tabName}) 조회 실패: HTTP ${res.status}`);
    const rows = parseCsvText(await res.text());

    for (const r of rows.slice(1)) {
      const listId = String(r[2] || '').trim();
      if (!/^[AB]\d{6}$/.test(listId)) continue;

      const ownerName = String(r[5] || '').trim();
      usedWorkerNames.add(ownerName);

      const strata = String(r[1] || '').trim();
      const visitDate = normalizeVisitDate(r[3]);
      const visitTime = normalizeVisitTime(r[4], ownerItems.length + 1);
      const rawSex = String(r[6] || String(r[19] || '')).trim();
      const gender = rawSex ? (rawSex.startsWith('여') ? '여' : '남') : inferGenderByName(ownerName, personaPool);
      const birthYear = parseInt(String(r[7] || r[20] || '').trim(), 10) || 1960;
      const age = 2026 - birthYear;
      const careerYears = parseInt(String(r[8] || r[21] || '').trim(), 10) || 35;
      const areaPyeong = String(r[9] || '500').replace(/,/g, '').trim();
      const incomeManwon = String(r[10] || '2500').replace(/,/g, '').trim();
      const cropName = String(r[11] || '').trim();
      const eupMyeon = String(r[12] || '').trim();
      const rawAddress = String(r[13] || '').trim();
      const address = cleanAgriworkAddress(rawAddress, tab.sigungu, eupMyeon);
      const phone = normalizePhone(r[14], listId, usedPhones);
      const entityType = listId.startsWith('B') || String(r[15] || '').includes('법인') ? '농업법인' : '농가';
      const hasEmployed = String(r[16] || '').trim() === '있음';
      const rawWorkerCol = String(r[18] || '').trim();
      const workerInfo = resolveWorkerTypeInfo(rawWorkerCol, hasEmployed);
      const itemSpec = resolveGallupAgriItemSpec(strata, cropName);
      const gps = computeAgriworkGps(tab.sigungu, eupMyeon, listId);
      const isDone = PORTAL_COMPLETED_OWNER_IDS.has(listId);

      ownerItems.push({
        uid: listId,
        id: listId,
        listId,
        surveySubType: 'owner',
        surveySubTypeLabel: '경영체 설문',
        rsid: '3154322641',
        surveyId: '20260168',
        surveyorId: tab.surveyorId,
        surveyorPw: tab.surveyorPw,
        surveyorName: tab.surveyorName,
        sheetTab: tab.tabName,
        sido: tab.sido,
        sigungu: tab.sigungu,
        eupMyeon: gps.eupMyeon,
        companyName: ownerName,
        name: ownerName,
        respondentName: ownerName,
        ceoName: ownerName,
        gender,
        age,
        birthYear,
        careerYears,
        entityType,
        strata,
        industry: strata,
        cropName,
        gallupItemLabel: itemSpec.fullLabel,
        gallupItemCode: itemSpec.code,
        gallupItemEtcText: itemSpec.etcText,
        isLivestock: itemSpec.isLivestock,
        isFacility: Boolean(itemSpec.isFacility),
        livestockUnitVal: itemSpec.unitVal || '',
        areaPyeong,
        incomeManwon,
        hasEmployed,
        employedLabel: hasEmployed ? '고용있음' : '고용없음',
        workerTypeLabel: workerInfo.label,
        workerTypeCode: workerInfo.code,
        hasMarkedWorkerQuota: Boolean(hasEmployed && rawWorkerCol),
        visitDate,
        visitTime,
        address,
        roadAddress: address,
        phone,
        gpsLat: gps.latitude,
        gpsLng: gps.longitude,
        surveyUrl: `https://gcapi.gallup.co.kr/survey/surveyini_V1.asp?rsid=3154322641&uid=${listId}`,
        slotUrl: `https://agriwork.gallup.co.kr/survey/login.asp`,
        status: isDone ? '완료' : '대기(진행중)',
        quotaStatus: isDone ? 'completed' : 'ready',
        progress: isDone ? '100%' : '이어하기 대기'
      });

      // 시트 19열에 내국인 근로자(상근/임시/일용)가 명시되어 있고 고용인력=있음인 건 -> 내국인 근로자 부수 설문 생성
      if (hasEmployed && rawWorkerCol) {
        const wSeed = hashRespondentSeed(`agri_worker_${listId}`);
        let chosenPersona = null;
        for (let off = 0; off < workerCandidates.length; off++) {
          const cand = workerCandidates[(wSeed + off) % workerCandidates.length];
          if (!usedWorkerNames.has(cand.name)) {
            chosenPersona = cand;
            usedWorkerNames.add(cand.name);
            break;
          }
        }
        if (!chosenPersona) {
          chosenPersona = { name: '김성훈', gender: '남', age: 54, ageGroup: '50대', birthYear: 1972 };
        }
        const wTypeClean = /상근|상용/.test(rawWorkerCol)
          ? { label: '상용근로자', code: '1' }
          : (/임시/.test(rawWorkerCol) ? { label: '임시근로자', code: '2' } : { label: '일용근로자', code: '3' });
        const workerPhone = normalizePhone('', `worker_phone_${listId}`, usedPhones);
        const wGps = computeAgriworkGps(tab.sigungu, eupMyeon, `${listId}_W`);

        // 근로자 조사 시작 시각은 경영체 방문시각 35분 뒤로 자연스럽게 배치
        const [vh, vm] = visitTime.split(':').map(Number);
        const wTotalMin = Math.min(20 * 60 + 20, (vh * 60 + vm) + 35);
        const wVisitTime = `${String(Math.floor(wTotalMin / 60)).padStart(2, '0')}:${String(wTotalMin % 60).padStart(2, '0')}`;

        workerItems.push({
          uid: `${listId}_W`,
          id: `${listId}_W`,
          listId,
          surveySubType: 'worker',
          surveySubTypeLabel: '내국인 근로자',
          rsid: '3111898935',
          surveyId: '20260193',
          surveyorId: tab.surveyorId,
          surveyorPw: tab.surveyorPw,
          surveyorName: tab.surveyorName,
          sheetTab: tab.tabName,
          sido: tab.sido,
          sigungu: tab.sigungu,
          eupMyeon: wGps.eupMyeon,
          companyName: `${chosenPersona.name} (${ownerName} 농장 근로자)`,
          employerName: ownerName,
          name: chosenPersona.name,
          respondentName: chosenPersona.name,
          ceoName: chosenPersona.name,
          gender: chosenPersona.gender,
          age: chosenPersona.age,
          ageGroup: chosenPersona.ageGroup,
          birthYear: chosenPersona.birthYear,
          careerYears: 4 + (wSeed % 8),
          entityType,
          strata,
          industry: `내국인근로자(${wTypeClean.label})`,
          cropName,
          gallupItemLabel: itemSpec.fullLabel,
          gallupItemCode: itemSpec.code,
          gallupItemEtcText: itemSpec.etcText,
          isLivestock: itemSpec.isLivestock,
          isFacility: Boolean(itemSpec.isFacility),
          hasEmployed: true,
          employedLabel: wTypeClean.label,
          workerTypeLabel: wTypeClean.label,
          workerTypeCode: wTypeClean.code,
          visitDate,
          visitTime: wVisitTime,
          address,
          roadAddress: address,
          phone: workerPhone,
          gpsLat: wGps.latitude,
          gpsLng: wGps.longitude,
          surveyUrl: `https://gcapi.gallup.co.kr/survey/surveyini_V1.asp?rsid=3111898935&uid=${listId}`,
          slotUrl: `https://agriwork.gallup.co.kr/survey/login.asp`,
          status: '대기',
          quotaStatus: 'ready',
          progress: '0%'
        });
      }
    }
  }

  const combined = [...ownerItems, ...workerItems].map((it, idx) => ({
    ...it,
    index: idx + 1,
    seq: idx + 1
  }));

  return {
    ownerCount: ownerItems.length,
    workerCount: workerItems.length,
    items: combined
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const { ownerCount, workerCount, items } = await buildGallupAgriworkQuotaDataset();
  const quotasDir = path.join(rootDir, 'data', 'quotas');
  fs.mkdirSync(quotasDir, { recursive: true });

  const jsonPath = path.join(quotasDir, 'quota_gallup_agriwork_2025.json');
  const xlsxPath = path.join(quotasDir, 'quota_gallup_agriwork_2025.xlsx');

  const payload = {
    type: 'GALLUP_AGRIWORK_2025',
    surveyType: 'gallup_agriwork',
    title: '2025년 기준 농업고용인력 실태조사 통합 쿼터 (양주 안재은 · 동두천 김미경)',
    googleSheetId: AGRIWORK_GOOGLE_SHEET_ID,
    updatedAt: new Date().toISOString(),
    totalCount: items.length,
    ownerCount,
    workerCount,
    data: items
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

  const excelRows = items.map(it => ({
    '순번': it.seq,
    '설문구분': it.surveySubTypeLabel,
    '조사원': `${it.surveyorName}(${it.surveyorId})`,
    '시군구': it.sigungu,
    '읍면동': it.eupMyeon,
    '리스트ID': it.listId,
    '고유키': it.uid,
    '대상구분': it.entityType,
    '응답자성명': it.name,
    '성별': it.gender,
    '출생연도': it.birthYear,
    '층화': it.strata,
    '재배품목': it.cropName,
    '갤럽공식코드': it.gallupItemLabel,
    '평수/규모': it.areaPyeong || '-',
    '연간판매액(만원)': it.incomeManwon || '-',
    '고용유무': it.employedLabel,
    '근로자유형': it.workerTypeLabel,
    '방문일시': `${it.visitDate} ${it.visitTime}`,
    '연락처': it.phone,
    '주소': it.address,
    '상태': it.status
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, '농업고용인력_통합쿼터');
  fs.writeFileSync(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  const readyOwners = items.filter(x => x.surveySubType === 'owner' && x.quotaStatus !== 'completed').length;
  const doneOwners = items.filter(x => x.surveySubType === 'owner' && x.quotaStatus === 'completed').length;
  console.log(`✅ Generated ${items.length} quota items (경영체 ${ownerCount}건 [완료 ${doneOwners} / 미완료 ${readyOwners}] + 내국인 근로자 ${workerCount}건)`);
}
