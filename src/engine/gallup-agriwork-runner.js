/**
 * 한국갤럽 2025년 기준 농업고용인력 실태조사 (G-CAPI V3) 전용 자동화 엔진
 * - 경영체 설문: rsid=3154322641 (surveyId=20260168, /survey/survey_V3_20260168.asp)
 * - 내국인 근로자 설문: rsid=3111898935 (surveyId=20260193, /survey/survey_V3.asp)
 * - 조사원 계정: 안재은(40878 / 양주시) · 김미경(47837 / 동두천시)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchChromium } from '../utils/chromium-launcher.js';
import {
  selectKoreanSignatureStyle,
  buildKoreanSignatureStrokes
} from '../utils/korean-signature.js';
import { hashRespondentSeed } from '../utils/respondent-pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export const AGRIWORK_DEFAULT_PORTAL_URL = 'https://agriwork.gallup.co.kr/survey/login.asp';
export const AGRIWORK_GOOGLE_SHEET_ID = '1ONQZjGIa2xIopaMbYS-27B_DMHBH8MlOK7tdDTC6Gz0';
export const AGRIWORK_GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${AGRIWORK_GOOGLE_SHEET_ID}/edit?gid=481207785#gid=481207785`;

export const AGRIWORK_ACCOUNTS = {
  '40878': { surveyorId: '40878', surveyorPw: '840902', surveyorName: '안재은', sigungu: '양주시', gid: '481207785' },
  '47837': { surveyorId: '47837', surveyorPw: '660709', surveyorName: '김미경', sigungu: '동두천시', gid: '2101238121' }
};

export const AGRIWORK_EUP_MYEON_DONG_GPS = {
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

export function cleanAgriworkAddress(rawAddr = '', sigungu = '양주시', eupMyeon = '') {
  let s = String(rawAddr || '').trim();
  for (let pass = 0; pass < 4; pass++) {
    s = s.replace(/\s*\([^()]*(?:\d{2,4}[-.:\s]\d{3,4}|01[016789]|아버지|어머니|아들|딸|남편|배우자|부인|처|자녀|모친|부친|연락처|핸드폰|휴대폰)[^()]*\)/g, '');
    s = s.replace(/\((?:자|모|부|처|형|제)\)/g, '');
  }
  s = s.replace(/\s*\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return `경기도 ${sigungu} ${eupMyeon}`.trim();
  return s;
}

export function resolveGallupAgriItemSpec(strataRaw = '', cropRaw = '') {
  const s = String(strataRaw || '').replace(/\s+/g, '');
  const c = String(cropRaw || '').trim();
  const cClean = c.replace(/\s+/g, '');
  const isFacility = /시설/.test(s) || /시설/.test(cClean);

  if (/한우/.test(cClean)) return { isLivestock: true, fullLabel: '축산-한우(901)', code: '901', etcText: '' };
  if (/젖소|젓소/.test(cClean)) return { isLivestock: true, fullLabel: '축산-젓소 암컷(903)', code: '903', etcText: '' };
  if (/돼지/.test(cClean)) return { isLivestock: true, fullLabel: '축산-돼지(904)', code: '904', etcText: '' };
  if (/사슴/.test(cClean)) return { isLivestock: true, fullLabel: '축산-사슴(910)', code: '910', etcText: '' };
  if (/벌류|꿀벌/.test(cClean)) return { isLivestock: true, fullLabel: '축산-꿀벌(통)(912)', code: '912', etcText: '' };
  if (/개류/.test(cClean)) return { isLivestock: true, fullLabel: '축산-기타 가축, 곤충(913)', code: '913', etcText: '개' };

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
  if (/엽경채류/.test(cClean)) return { isLivestock: false, fullLabel: '기타작물-기타 시설 작물(809)', code: '809', etcText: '엽경채류', isFacility: true };
  if (/채소종자/.test(cClean)) return { isLivestock: false, fullLabel: '기타작물-육묘 작물(모)(808)', code: '808', etcText: '', isFacility: false };
  if (/엄나무/.test(cClean)) return { isLivestock: false, fullLabel: '약용작물-기타 약용 작물(609)', code: '609', etcText: '엄나무', isFacility: false };
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

/**
 * 문A3 농작업 시기 75종 작물 캘린더 (줄 번호: 1경운 2파종 3피복 4정식 5제초/방제 6전정/유인 7수분/적화/적과 8알솎기 9봉지씌우기 10수확 11시비)
 */
const VEG_CALENDAR = [
  '배추|노지|3/4/7/8|4/9|4/9|-|5/10|5/6/10|6/11', '배추|시설|1/8|3/9|2/8|-|3/10|3/4/10|5/12',
  '무|노지|3~4/7~8|-|-|-|5/6/9|5/6/9|5~12', '무|시설|2/9|-|-|-|-|-|5/11',
  '건고추|노지|2|5|-|-|6~7|6~8|8~10', '건고추|시설|1|4|-|-|5~7|5~7|7~9',
  '홍고추|노지|2|5|4~5|6~8|6~8|6~9|7~10', '홍고추|시설|1|4|3~4|5~7|5~8|5~9|6~11',
  '풋고추|노지|2|5|-|-|-|-|6~9', '풋고추|시설|1|4|-|-|-|-|5~11',
  '양파|노지|9~10|10~11|11|-|3~4|4~5|4~5', '대파|노지|4|6|5|-|7~8|6~8|9~10',
  '마늘|노지|10|-|11|-|4~5|4~5|6~7',
  '시금치|노지|3/9~10|-|-|-|4/10|4/10|5/11', '시금치|시설|10~11|-|-|-|-|-|1~3',
  '상추|노지|3~6|4~6|-|-|5~6|5~6|5~10', '상추|시설|9~12/1~3|10~12/1~4|9~12/1~3|-|10~12/1~4|11~12/1~4|11~12/1~6',
  '호박|노지|4|5|4~5|5~6|5~6|6~7|7~10', '호박|시설|8~9|9~10|-|-|-|-|11~12/1~4',
  '양배추|노지|4|5|-|-|6~7|6~7|8~9', '양배추|시설|2|3|-|-|4~5|4~5|6~7',
  '오이|노지|3~4|5|-|-|5~7|5~7|7~9', '오이|시설|10~11/1~2|12/2~3|12/1~3|2~5|3~6|3~6|1~4',
  '가지|노지|4|5~6|-|-|-|-|6~10',
  '수박|노지|4|5|4~5|6|6|6~7|7~9', '수박|시설|1~2|3|-|4|4~5|4~5|5~6',
  '당근|노지|4/7~8|-|-|-|5~6/9|5~6/9|8/11'
];

const FRUIT_CALENDAR = [
  '사과|2~3|4|5~6|6|4~6|4~8|9~10|-', '배|2~3|4|5~6|6|4~6|4~8|9~10|-',
  '복숭아|2~3|4|5|6|4~5|4~7|7~8|-', '단감|2~3|4|5|6|5~6|5~7|10|-',
  '포도|1~2|5|5~6|6|4~5|4~7|8~9|5~6', '감귤|3|4~5|5|-|4~6|5~8|11~12|-',
  '자두|2~3|4|5|-|4~5|4~6|6~7|-', '매실|2~3|3~4|-|-|4~5|4~5|6|-',
  '블루베리|2|4|-|-|5~6|5~6|6~7|-', '대추|3|5|-|-|5~6|6~8|9~10|-',
  '오디|2~3|-|-|-|4~5|4~5|6|-'
];

const CODE_CALENDAR_OVERRIDES = {
  '100': { 1: [3, 4, 5], 2: [4], 4: [5, 6], 5: [6, 7, 8], 11: [5, 6, 7], 10: [9, 10] }, // 논벼
  '103': { 1: [4], 2: [4, 5], 3: [4], 5: [5, 6, 7], 11: [4, 5, 6], 10: [7, 8] }, // 식용 옥수수
  '104': { 1: [5, 6], 2: [6], 5: [6, 7, 8], 11: [6], 10: [10] }, // 콩
  '105': { 1: [6], 2: [6, 7], 5: [7, 8], 11: [6], 10: [9, 10] }, // 팥
  '106': { 1: [3], 2: [3], 3: [3], 5: [4, 5, 6], 11: [3], 10: [6] }, // 감자
  '107': { 2: [3, 4], 1: [5], 3: [5], 4: [5, 6], 5: [6, 7, 8], 11: [5], 10: [9, 10] }, // 고구마
  '108': { 1: [5, 6], 2: [5, 6], 5: [6, 7], 11: [5, 6], 10: [9, 10] }, // 수수
  '226': { 1: [4, 8], 2: [4, 8], 5: [5, 9], 11: [4, 8], 10: [6, 10, 11] }, // 노지 갓
  '321': { 1: [2], 2: [2], 4: [3], 5: [4, 5], 11: [3, 4], 10: [6, 7] }, // 시설 양배추
  '322': { 1: [2, 9], 2: [2, 9], 5: [3, 10], 11: [2, 9], 10: [4, 5, 11] }, // 시설 갓
  '403': { 1: [6, 7], 2: [6], 4: [7], 5: [7, 8], 11: [6, 7], 10: [10] }, // 들깨
  '405': { 2: [3, 4], 5: [6, 7, 8], 10: [4, 5, 9, 10] }, // 노지 표고버섯(원목)
  '410': { 2: [3, 4], 5: [6, 7, 8], 10: [4, 5, 9, 10, 11] }, // 시설 표고버섯(원목)
  '511': { 6: [2, 3], 5: [6, 7, 8], 11: [3], 10: [9, 10] }, // 밤
  '519': { 6: [2, 3], 5: [4, 5], 11: [3], 10: [6] }, // 오디
  '520': { 6: [1, 2], 7: [4, 5], 8: [5], 9: [5, 6], 5: [4, 5, 6], 11: [3, 4], 10: [7, 8] }, // 시설 포도
  '522': { 6: [1, 2], 7: [3, 4], 5: [4, 5], 11: [3], 10: [5, 6] }, // 시설 블루베리
  '601': { 6: [3, 4], 5: [5, 6, 7], 11: [3], 10: [9] }, // 오미자
  '609': { 1: [3, 4], 4: [4], 6: [3], 5: [5, 6, 7], 11: [4], 10: [9, 10] }, // 엄나무/작약
  '704': { 4: [3], 6: [2, 3, 9], 5: [4, 5, 6, 9, 10], 11: [3, 5, 9], 10: [5, 6, 9, 10, 11] }, // 장미
  '707': { 4: [3, 4], 6: [3, 4, 8], 5: [5, 6, 7, 8], 11: [3, 4], 10: [3, 4, 10, 11] }, // 조경수(향나무)
  '711': { 2: [2, 3, 8], 4: [3, 4, 9], 5: [4, 5, 9, 10], 11: [3, 9], 10: [4, 5, 10, 11] }, // 초화류(화훼)
  '801': { 1: [4, 5], 2: [5], 5: [6, 7], 11: [5, 6], 10: [8, 9] }, // 사료용 옥수수
  '808': { 2: [3, 4, 8], 4: [4, 5], 5: [4, 5, 6, 8, 9], 11: [4, 8], 10: [5, 6, 9, 10] }, // 육묘/채소종자
  '809': { 1: [2, 8], 2: [3, 9], 4: [3, 9], 5: [4, 5, 10], 11: [3, 9], 10: [4, 5, 6, 10, 11] } // 엽경채류
};

function parseMonthRangeSpec(spec) {
  const out = new Set();
  if (!spec || spec === '-') return [];
  for (const part of String(spec).split('/')) {
    const m = part.trim().match(/^(\d+)(?:~(\d+))?$/);
    if (!m) continue;
    let a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let k = 0; k < 12; k++) {
      out.add(a);
      if (a === b) break;
      a = (a % 12) + 1;
    }
  }
  return [...out].sort((x, y) => x - y);
}

export function buildCropA3Schedule(code = '', fullLabel = '', isFacility = false) {
  if (CODE_CALENDAR_OVERRIDES[code]) {
    return CODE_CALENDAR_OVERRIDES[code];
  }
  const m = String(fullLabel || '').match(/^(.+?)-(.+)\(\d+\)$/);
  const cat = m ? m[1] : '';
  const name = m ? m[2].trim() : '';
  const plan = {};
  const add = (row, spec) => {
    const months = parseMonthRangeSpec(spec);
    if (!months.length) return;
    plan[row] = [...new Set([...(plan[row] || []), ...months])].sort((a, b) => a - b);
  };

  if (/^채소/.test(cat)) {
    const how = (isFacility || /시설/.test(cat)) ? '시설' : '노지';
    const line = VEG_CALENDAR.find(l => {
      const c = l.split('|');
      return c[0] === name && c[1] === how;
    }) || VEG_CALENDAR.find(l => l.split('|')[0] === name);
    if (line) {
      const c = line.split('|');
      add(2, c[2]); add(4, c[3]); add(3, c[4]); add(6, c[5]); add(5, c[6]); add(5, c[7]); add(10, c[8]);
      return plan;
    }
  }

  if (/^과수/.test(cat)) {
    const line = FRUIT_CALENDAR.find(l => l.split('|')[0] === name);
    if (line) {
      const c = line.split('|');
      add(6, c[1]); add(7, c[2]); add(7, c[3]); add(9, c[4]); add(5, c[5]); add(5, c[6]); add(10, c[7]); add(8, c[8]);
      return plan;
    }
  }

  return { 1: [4, 5], 2: [5], 5: [6, 7, 8], 11: [5, 6], 10: [9, 10] };
}

function formatKoreanPickerDateTime(dateStr = '2026-11-02', timeStr = '10:30', addMinutes = 0) {
  const [rawH, rawM] = String(timeStr || '10:30').split(':').map(v => parseInt(v, 10) || 0);
  let totalMin = rawH * 60 + rawM + addMinutes;
  totalMin = Math.max(9 * 60, Math.min(23 * 60 + 20, totalMin));
  const h24 = Math.floor(totalMin / 60);
  const m10 = Math.floor((totalMin % 60) / 10) * 10;
  const ampm = h24 >= 12 ? '오후' : '오전';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${dateStr} ${ampm} ${String(h12).padStart(2, '0')}:${String(m10).padStart(2, '0')}`;
}

async function waitForStablePage(page, maxPolls = 65) {
  let lastKey = '';
  let stable = 0;
  for (let i = 0; i < maxPolls; i++) {
    try {
      const cur = await page.evaluate(() => {
        if (document.readyState !== 'complete') return '';
        const pid = document.querySelector('input[name="p_pageid"]')?.value || '';
        const urlPart = location.pathname;
        const hasEndBtn = Boolean(document.querySelector('[onclick*="moveEnd"]'));
        return `${urlPart}|${pid}|${hasEndBtn ? 'END_BTN' : ''}`;
      });
      if (cur && cur === lastKey) {
        stable++;
        if (stable >= 2) return cur;
      } else {
        lastKey = cur;
        stable = cur ? 1 : 0;
      }
    } catch (err) {
      stable = 0;
    }
    await page.waitForTimeout(130);
  }
  return lastKey;
}

async function drawCanvasSignatureIfNeeded(page, nameStr, seedNum, preserveExisting = true) {
  const sigInfo = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas[id^="newSignature"]'));
    if (canvases.length === 0) return null;
    const c = canvases[0];
    const qId = c.id.replace(/^newSignature/, '');
    const hiddenVal = document.getElementById(`QST$${qId}$_${qId}`)?.value?.trim() || '';
    return { canvasId: c.id, qId, hiddenVal };
  });
  if (!sigInfo) return null;
  if (preserveExisting && sigInfo.hiddenVal) {
    return { kept: true, qId: sigInfo.qId, file: sigInfo.hiddenVal };
  }

  const style = selectKoreanSignatureStyle(seedNum);
  const strokes = buildKoreanSignatureStrokes({
    targetName: nameStr || '응답자',
    seed: seedNum,
    styleCfg: style,
    canvasWidth: 600,
    canvasHeight: 400
  });

  return await page.evaluate(async ({ canvasId, qId, strokes, styleCfg }) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return { ok: false, qId, err: 'no canvas' };
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = styleCfg.ink || '#1f2937';
    ctx.lineWidth = Math.max(2.4, ((styleCfg.minW || 1.2) + (styleCfg.maxW || 3.0)) * 0.9);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      if (!s || s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
      ctx.stroke();
    }
    const flagEl = document.getElementById(qId);
    if (flagEl) flagEl.value = 'true';
    const saveFn = window[`imgSave${qId}`];
    if (typeof saveFn === 'function') saveFn();
    for (let w = 0; w < 45; w++) {
      await new Promise(r => setTimeout(r, 150));
      const v = document.getElementById(`QST$${qId}$_${qId}`)?.value?.trim() || '';
      if (v) return { ok: true, qId, file: v, style: styleCfg.label };
    }
    return { ok: false, qId, err: 'signature upload timeout' };
  }, { canvasId: sigInfo.canvasId, qId: sigInfo.qId, strokes, styleCfg: style });
}

/**
 * 포털(agriwork.gallup.co.kr) 로그인 및 방문기록/사전문항/내국인근로자 체크 상태 준비 + 완료 여부 실측 확인
 */
async function loginAndPreparePortalSlot(page, {
  surveyorId,
  surveyorPw,
  listId,
  isWorkerSurvey,
  visitDate,
  visitTime,
  hasEmployed,
  needWorkerCheck
}) {
  await page.goto(AGRIWORK_DEFAULT_PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('input[name="login_id"]', String(surveyorId));
  await page.fill('input[name="password"]', String(surveyorPw));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.evaluate(() => window.fnSubmit())
  ]);

  if (!page.url().toLowerCase().includes('main.asp')) {
    await page.goto('https://agriwork.gallup.co.kr/survey/main.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  return await page.evaluate(async ({ listId, isWorkerSurvey, visitDate, visitTime, hasEmployed, needWorkerCheck }) => {
    const parseHtml = (h) => new DOMParser().parseFromString(h, 'text/html');
    const fetchDoc = async (url, bodyObj = null) => {
      const opt = bodyObj
        ? { method: 'POST', body: new URLSearchParams(bodyObj), credentials: 'include' }
        : { credentials: 'include' };
      const res = await fetch(url, opt);
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      return parseHtml(await res.text());
    };
    const extractFormFields = (form) => {
      const out = [];
      if (!form) return out;
      for (const e of form.querySelectorAll('input[name],select[name],textarea[name]')) {
        if ((e.type === 'radio' || e.type === 'checkbox') && !e.hasAttribute('checked')) continue;
        if (e.tagName === 'SELECT') {
          const o = e.querySelector('option[selected]') || e.querySelector('option');
          out.push([e.name, o ? (o.getAttribute('value') || '') : '']);
        } else if (e.tagName === 'TEXTAREA') {
          out.push([e.name, e.textContent || '']);
        } else {
          out.push([e.name, e.getAttribute('value') || (e.type === 'checkbox' ? 'Y' : '')]);
        }
      }
      return out;
    };
    const setField = (arr, k, v) => {
      const idx = arr.findIndex(([n]) => n === k);
      if (idx >= 0) arr[idx][1] = v;
      else arr.push([k, v]);
    };

    // 1) 현재 main.asp 목록에서 해당 listId의 경영주/내국인근로자 완료여부 확인
    let ownerState = '';
    let workerState = '';
    const rows = Array.from(document.querySelectorAll('tr[onclick*="fnSubmit2"]'));
    const hitRow = rows.find(tr => (tr.querySelector('td')?.innerText || '').trim() === listId);
    if (hitRow) {
      const tds = Array.from(hitRow.querySelectorAll('td')).map(td => td.innerText.replace(/\s+/g, ' ').trim());
      ownerState = tds[13] || '';
      workerState = tds[14] || '';
    }

    if (!isWorkerSurvey && ownerState === '완료') {
      return { alreadyCompleted: true, ownerState, workerState };
    }
    if (isWorkerSurvey && workerState === '완료') {
      return { alreadyCompleted: true, ownerState, workerState };
    }

    // 2) 방문기록(visitForm.asp) 미입력 시 자동 저장
    let vDoc = await fetchDoc(`visitForm.asp?listId=${encodeURIComponent(listId)}`);
    const curDate = vDoc.querySelector('input[name="p_visitDate1"]')?.getAttribute('value') || '';
    if (!curDate) {
      const vf = extractFormFields(vDoc.forms.frm);
      setField(vf, 'p_visitDate1', visitDate || '2026-11-02');
      setField(vf, 'p_visitTime1', visitTime || '10:30');
      setField(vf, 'p_visitResult1', 'RESU010001');
      await fetchDoc(vDoc.forms.frm?.getAttribute('action') || 'visitForm_proc.asp', vf);
      vDoc = await fetchDoc(`visitForm.asp?listId=${encodeURIComponent(listId)}`);
    }
    const visitFields = extractFormFields(vDoc.forms.frm);

    // 3) 사전 확인사항(survey01.asp) 고용여부 SQ2 미입력 시 자동 저장
    const empCode = hasEmployed ? '1' : '2';
    const sDoc = await fetchDoc('survey01.asp', visitFields);
    const curSq2 = sDoc.querySelector('input[name="SQ2"][checked]');
    if (!curSq2) {
      const sf = extractFormFields(sDoc.forms.frm).filter(([n]) => n !== 'SQ2');
      sf.push(['SQ2', empCode]);
      await fetchDoc(sDoc.forms.frm?.getAttribute('action') || 'survey01_proc.asp', sf);
    }

    // 4) 내국인 근로자 설문 대상인 경우 chk_employedYN 체크 보장
    if (isWorkerSurvey || needWorkerCheck) {
      const dDoc = await fetchDoc('main.asp', { p_searchYN: 'Y', p_listId: listId });
      const cb = dDoc.querySelector('input[name="chk_employedYN"]');
      if (cb && !cb.hasAttribute('checked')) {
        const df = extractFormFields(dDoc.forms.frm);
        setField(df, 'p_update_listId', listId);
        setField(df, 'chk_employedYN', cb.getAttribute('value') || 'Y');
        await fetchDoc('main_proc.asp', df);
      }
    }

    return { alreadyCompleted: false, ownerState, workerState };
  }, { listId, isWorkerSurvey, visitDate, visitTime, hasEmployed, needWorkerCheck });
}

/**
 * 단일 슬롯(경영체 또는 내국인 근로자) E2E 실행
 */
export async function runGallupAgriworkSurvey({
  campaign = {},
  slotData = {},
  policy = {},
  quotaIndex = 1,
  pilotMode = false,
  safetyGuard = false,
  reportDir = '',
  onProgress = () => {}
}) {
  const listId = String(slotData.listId || String(slotData.uid || slotData.id || '').replace(/_W$/, '')).trim();
  const isWorkerSurvey = slotData.surveySubType === 'worker' || String(slotData.rsid) === '3111898935' || String(slotData.uid || '').endsWith('_W');
  const rsid = isWorkerSurvey ? '3111898935' : '3154322641';
  const surveyId = isWorkerSurvey ? '20260193' : '20260168';

  const accountCfg = AGRIWORK_ACCOUNTS[String(slotData.surveyorId || '')]
    || (String(slotData.sigungu || '').includes('동두천') ? AGRIWORK_ACCOUNTS['47837'] : AGRIWORK_ACCOUNTS['40878']);
  const surveyorId = String(slotData.surveyorId || accountCfg.surveyorId);
  const surveyorPw = String(slotData.surveyorPw || accountCfg.surveyorPw);
  const sigungu = String(slotData.sigungu || accountCfg.sigungu || '양주시');
  const eupMyeon = String(slotData.eupMyeon || '');

  const respName = String(slotData.respondentName || slotData.name || slotData.companyName || '').replace(/\s*\(.*\)$/, '').trim() || '응답자';
  const entityType = slotData.entityType || (listId.startsWith('B') ? '농업법인' : '농가');
  const genderCode = String(slotData.gender || '남').startsWith('여') ? '2' : '1';
  const birthYear = String(slotData.birthYear || 1962);
  const careerYears = String(slotData.careerYears || 35);
  const areaPyeong = String(slotData.areaPyeong || '600').replace(/,/g, '').trim();
  const incomeManwon = String(slotData.incomeManwon || '2500').replace(/,/g, '').trim();
  const visitDate = String(slotData.visitDate || '2026-11-02').trim();
  const visitTime = String(slotData.visitTime || '10:30').trim();
  const cleanAddr = cleanAgriworkAddress(slotData.address || slotData.roadAddress || '', sigungu, eupMyeon);
  const respPhone = String(slotData.phone || '010-5842-7391').trim();

  const hasEmployed = isWorkerSurvey ? true : Boolean(slotData.hasEmployed || slotData.employedLabel === '고용있음');
  const defaultBlankWorkerCode = String(policy.defaultBlankWorkerType || '3');
  const workerTypeCode = !hasEmployed
    ? '0'
    : (slotData.hasMarkedWorkerQuota || isWorkerSurvey
      ? String(slotData.workerTypeCode || defaultBlankWorkerCode)
      : String(slotData.workerTypeCode || defaultBlankWorkerCode));

  const itemSpec = slotData.gallupItemCode
    ? {
        isLivestock: Boolean(slotData.isLivestock),
        fullLabel: slotData.gallupItemLabel,
        code: String(slotData.gallupItemCode),
        etcText: String(slotData.gallupItemEtcText || ''),
        isFacility: Boolean(slotData.isFacility)
      }
    : resolveGallupAgriItemSpec(slotData.strata, slotData.cropName);

  const a3Schedule = itemSpec.isLivestock
    ? {}
    : buildCropA3Schedule(itemSpec.code, itemSpec.fullLabel, itemSpec.isFacility);

  const gps = (slotData.gpsLat && slotData.gpsLng)
    ? { eupMyeon: eupMyeon || sigungu, latitude: Number(slotData.gpsLat), longitude: Number(slotData.gpsLng) }
    : computeAgriworkGps(sigungu, eupMyeon, `${listId}_${isWorkerSurvey ? 'W' : 'O'}`);

  const seedNum = hashRespondentSeed(`${listId}_${isWorkerSurvey ? 'W' : 'O'}_${respName}`);
  const preserveExistingInputs = policy.preserveExistingInputs !== false;
  const preserveExistingSignatures = policy.preserveExistingSignatures !== false;
  const shortageMode = String(policy.shortageMode || 'none');
  const tabletNo = String(policy.tabletNo || '').trim();

  if (reportDir) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const capturedSteps = [];
  const submittedAnswers = [];
  const unexpectedAlerts = [];

  const browser = await launchChromium({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
      locale: 'ko-KR',
      permissions: ['geolocation'],
      geolocation: { latitude: gps.latitude, longitude: gps.longitude, accuracy: 12 }
    });
    await context.grantPermissions(['geolocation'], { origin: 'https://agriwork.gallup.co.kr' });
    await context.grantPermissions(['geolocation'], { origin: 'https://gcapi.gallup.co.kr' });

    await context.addInitScript(({ lat, lng }) => {
      window.__alerts = [];
      window.alert = (m) => { window.__alerts.push(String(m)); };
      window.confirm = () => true;
      window.close = () => {};
      if (!window.opener) {
        try {
          Object.defineProperty(window, 'opener', {
            value: { window: { location: { reload: () => {} } }, location: { reload: () => {} } },
            configurable: true
          });
        } catch (e) {
          // ignore
        }
      }
      const pos = {
        coords: { latitude: lat, longitude: lng, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now()
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok(pos), 10);
        navigator.geolocation.watchPosition = (ok) => { setTimeout(() => ok(pos), 10); return 1; };
      }
    }, { lat: gps.latitude, lng: gps.longitude });

    const page = await context.newPage();

    onProgress({
      step: 'PORTAL_LOGIN',
      progress: 5,
      message: `[${isWorkerSurvey ? '내국인근로자' : '경영체'} · ${listId}] 포털(${surveyorId}) 로그인 및 방문기록·사전문항 점검 중...`
    });

    const prepRes = await loginAndPreparePortalSlot(page, {
      surveyorId,
      surveyorPw,
      listId,
      isWorkerSurvey,
      visitDate,
      visitTime,
      hasEmployed,
      needWorkerCheck: Boolean(slotData.hasMarkedWorkerQuota || isWorkerSurvey)
    });

    if (prepRes.alreadyCompleted && policy.skipCompletedSlots !== false) {
      onProgress({
        step: 'ALREADY_COMPLETED',
        progress: 100,
        message: `✅ [${listId} ${respName}] 포털에서 이미 '완료' 상태가 확인되어 안전 스킵합니다.`
      });
      return {
        success: true,
        status: 'completed',
        alreadyCompleted: true,
        respondentId: slotData.uid || listId,
        listId,
        respondentName: respName,
        phone: respPhone,
        gps,
        capturedSteps,
        submittedAnswers
      };
    }

    const introUrl = `https://gcapi.gallup.co.kr/survey/surveyini_V1.asp?rsid=${rsid}&uid=${encodeURIComponent(listId)}`;
    await page.goto(introUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      if (typeof window.getStarted === 'function') window.getStarted();
    });
    await waitForStablePage(page);

    // 만약 진입 직후 이미 Page LAST에 머물러 있는 슬롯이라면 2단계 되감아 방문일시(TIME/Q133) 및 주소(Q48)를 시트 정합값으로 재보정
    const initialPid = await page.evaluate(() => document.querySelector('input[name="p_pageid"]')?.value || '');
    if (initialPid === 'LAST') {
      const rewindSteps = isWorkerSurvey ? 1 : 2;
      for (let rw = 0; rw < rewindSteps; rw++) {
        await page.evaluate(() => {
          if (typeof window.movePrev === 'function') window.movePrev();
        });
        await page.waitForTimeout(300);
        await waitForStablePage(page);
      }
    }

    const [vHourNum, vMinNum] = visitTime.split(':').map(v => parseInt(v, 10) || 0);
    const startHStr = String(Math.max(8, Math.min(21, vHourNum || 10)));
    const startMStr = String(Math.floor((vMinNum || 0) / 10) * 10);
    const endTotalMin = Math.min(22 * 60 + 50, (Number(startHStr) * 60 + Number(startMStr)) + (isWorkerSurvey ? 20 : 30));
    const endHStr = String(Math.floor(endTotalMin / 60));
    const endMStr = String(Math.floor((endTotalMin % 60) / 10) * 10);
    const workerStartDt = formatKoreanPickerDateTime(visitDate, visitTime, 0);
    const workerEndDt = formatKoreanPickerDateTime(visitDate, visitTime, 20);

    for (let step = 0; step < 185; step++) {
      await waitForStablePage(page);
      const meta = await page.evaluate(() => {
        const pid = document.querySelector('input[name="p_pageid"]')?.value || '';
        const perText = document.querySelector('.per')?.innerText?.trim() || '';
        const perNum = parseInt(perText.replace(/\D/g, ''), 10) || 0;
        const qIds = Array.from(document.querySelectorAll('.question[id^="Question_"]')).map(e => e.id.replace(/^Question_/, ''));
        const titles = Array.from(document.querySelectorAll('.question .title'))
          .filter(e => e.offsetParent !== null)
          .map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 90));
        const hasPhone = Boolean(document.querySelector('input[name="phone_1"]'));
        const hasLastBtn = Boolean(document.getElementById('LastBtn') || document.getElementById('LastBtnLi'));
        const hasEndBtn = Boolean(document.querySelector('[onclick*="moveEnd"]'));
        const loadAlerts = [...(window.__alerts || [])];
        window.__alerts = [];
        return { pid, perText, perNum, qIds, title: titles[0] || '', hasPhone, hasLastBtn, hasEndBtn, loadAlerts };
      });

      const pct = Math.min(98, Math.max(10, meta.perNum || Math.round((step / (isWorkerSurvey ? 55 : 95)) * 90) + 10));
      onProgress({
        step: `PAGE_${meta.pid || step}`,
        progress: pct,
        message: `[${isWorkerSurvey ? '근로자' : '경영체'} ${listId} · Page ${meta.pid}] ${meta.title || meta.qIds.join(', ') || '진행 중'}`
      });

      // === 최종 관문 (Page LAST 또는 END 화면) 도달 시 ===
      if (meta.hasPhone || meta.hasLastBtn || meta.pid === 'LAST' || meta.hasEndBtn) {
        const lastGateRes = await page.evaluate(async ({
          respName,
          respPhone,
          cleanAddr,
          tabletNo,
          surveyId,
          seedNum
        }) => {
          const fire = (el) => ['input', 'change', 'keyup', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
          const nameEl = document.getElementById('QST$ADD_name$_ADD_name');
          if (nameEl) {
            nameEl.value = respName;
            fire(nameEl);
          }
          const addrEl = document.getElementById('QST$ADD_address$_ADD_address');
          if (addrEl) {
            addrEl.value = String(cleanAddr || '').slice(0, 30);
            fire(addrEl);
          }
          const tabEl = document.getElementById('QST$ADD_tabNo$_ADD_tabNo');
          if (tabEl && tabletNo) {
            tabEl.value = tabletNo;
            fire(tabEl);
          }

          const gradeId = document.querySelector('input[name="p_gradeid"]')?.value || '';
          const setPhoneFields = (phStr) => {
            const nums = String(phStr || '').match(/\d+/g) || ['010', '5842', '7391'];
            const p1 = nums[0] || '010';
            const p2 = (nums[1] || '5842').padStart(4, '0').slice(0, 4);
            const p3 = (nums[2] || '7391').padStart(4, '0').slice(0, 4);
            const full = `${p1}-${p2}-${p3}`;
            const e1 = document.getElementById('phone_1');
            const e2 = document.getElementById('phone_2');
            const e3 = document.getElementById('phone_3');
            const eh = document.getElementById('QST$ADD_phone$_ADD_phone');
            if (e1) { e1.value = p1; fire(e1); }
            if (e2) { e2.value = p2; fire(e2); }
            if (e3) { e3.value = p3; fire(e3); }
            if (eh) { eh.value = full; }
            return full;
          };

          const checkPhoneOnServer = async (fullPhone) => {
            if (!document.getElementById('phone_1')) return 'OK';
            try {
              const params = new URLSearchParams({ phone: fullPhone, surveyId, gradeId });
              const r = await fetch(`ajax/phoneChk.asp?${params.toString()}`, { credentials: 'include' });
              return (await r.text()).trim();
            } catch (e) {
              return 'OK';
            }
          };

          let finalPhone = setPhoneFields(respPhone);
          let chkResult = await checkPhoneOnServer(finalPhone);
          let tries = 0;
          while ((chkResult === 'TRUE' || chkResult === 'NONE') && tries < 12) {
            tries++;
            let mid = String(2200 + ((seedNum + tries * 173) % 7500)).padStart(4, '0');
            let last = String(1200 + ((Math.floor(seedNum / 37) + tries * 293) % 8500)).padStart(4, '0');
            if (/^(\d)\1{3}$/.test(mid)) mid = '3842';
            if (/^(\d)\1{3}$/.test(last)) last = '5194';
            finalPhone = setPhoneFields(`010-${mid}-${last}`);
            chkResult = await checkPhoneOnServer(finalPhone);
          }

          return {
            finalPhone,
            phoneCheckResult: chkResult,
            replacedPhone: finalPhone !== respPhone
          };
        }, {
          respName,
          respPhone,
          cleanAddr,
          tabletNo,
          surveyId,
          seedNum
        });

        submittedAnswers.push({
          page: 'LAST',
          question: '최종 응답자 확인 (성명·연락처·주소)',
          answer: `${respName} / ${lastGateRes.finalPhone} / ${cleanAddr.slice(0, 30)}`
        });

        if (safetyGuard) {
          if (reportDir) {
            const shotPath = path.join(reportDir, 'page_last_before_submit.png');
            await page.screenshot({ path: shotPath, fullPage: true });
            capturedSteps.push({
              step: 'PAGE_LAST_READY',
              title: `Page LAST 완료 직전 안전 대기 (${respName} · ${lastGateRes.finalPhone})`,
              screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), shotPath).replace(/\\/g, '/')}`
            });
          }

          onProgress({
            step: 'STOPPED_BEFORE_SUBMIT',
            progress: 99,
            message: `⏸️ [${listId} ${respName}] Page LAST 완료 직전 안전 대기! (연락처: ${lastGateRes.finalPhone})`
          });

          return {
            success: true,
            status: 'stopped_before_submit',
            lastPage: 'LAST',
            respondentId: slotData.uid || listId,
            listId,
            respondentName: respName,
            phone: lastGateRes.finalPhone,
            gps,
            unexpectedAlerts,
            capturedSteps,
            submittedAnswers
          };
        }

        // === [100% 최종 완료 제출 모드 (safetyGuard === false)] ===
        // 1단계: Page LAST에 있는 경우 moveLast() 호출 (p_direction = "last")
        const hasMoveLastOnPage = await page.evaluate(() => Boolean(document.getElementById('LastBtn') || document.getElementById('phone_1')));
        if (hasMoveLastOnPage) {
          await page.evaluate(() => {
            window.__alerts = [];
            if (typeof window.moveLast === 'function') window.moveLast();
          });
          await page.waitForTimeout(600);
          await waitForStablePage(page);
        }

        // 2단계: 이어지는 [조사완료] 화면에서 moveEnd() (p_direction = "end", GPS 포함) 또는 end_form 호출
        for (let endAttempt = 0; endAttempt < 3; endAttempt++) {
          const postLastInfo = await page.evaluate(() => {
            const url = location.href;
            const bodyTxt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
            const hasMoveEndFn = typeof window.moveEnd === 'function';
            const endBtn = document.querySelector('[onclick*="moveEnd"], img[alt*="완료"], #EndBtn, #endBtn');
            const hasPgForm = Boolean(document.pg_form);
            const hasEndForm = Boolean(document.end_form);
            const alerts = [...(window.__alerts || [])];
            window.__alerts = [];
            return { url, bodyTxt, hasMoveEndFn, hasEndBtn: Boolean(endBtn), hasPgForm, hasEndForm, alerts };
          });

          if (postLastInfo.url.toLowerCase().includes('survey_end.asp') || /조사가\s*완료|응답해\s*주셔서\s*감사|정상적으로\s*저장/.test(postLastInfo.bodyTxt) && !postLastInfo.hasEndBtn) {
            break;
          }

          if (postLastInfo.hasEndBtn || postLastInfo.hasMoveEndFn) {
            await page.evaluate(({ lat, lng }) => {
              const btn = document.querySelector('[onclick*="moveEnd"]');
              if (btn) {
                btn.click();
              } else if (typeof window.moveEnd === 'function') {
                window.moveEnd();
              } else if (document.pg_form) {
                if (document.pg_form.p_gpsLa) document.pg_form.p_gpsLa.value = String(lat);
                if (document.pg_form.p_gpsLo) document.pg_form.p_gpsLo.value = String(lng);
                document.pg_form.p_direction.value = 'end';
                document.pg_form.submit();
              }
            }, { lat: gps.latitude, lng: gps.longitude });
            await page.waitForTimeout(900);
            await waitForStablePage(page);
          } else {
            break;
          }
        }

        if (reportDir) {
          const doneShot = path.join(reportDir, 'survey_completed_100.png');
          try {
            await page.screenshot({ path: doneShot, fullPage: true });
            capturedSteps.push({
              step: 'SURVEY_COMPLETED',
              title: `100% 조사완료 (${respName} · ${lastGateRes.finalPhone})`,
              screenshot: `/reports/${path.relative(path.join(rootDir, 'reports'), doneShot).replace(/\\/g, '/')}`
            });
          } catch (shotErr) {
            // 창 닫힘/리다이렉트 시 무시
          }
        }

        // 3단계: 포털(agriwork.gallup.co.kr/survey/main.asp)에서 실제 '완료' 반영 여부 교차 검증
        let portalVerifiedDone = false;
        try {
          await page.goto('https://agriwork.gallup.co.kr/survey/main.asp', { waitUntil: 'domcontentloaded', timeout: 25000 });
          portalVerifiedDone = await page.evaluate(({ listId, isWorkerSurvey }) => {
            const rows = Array.from(document.querySelectorAll('tr[onclick*="fnSubmit2"]'));
            const hit = rows.find(tr => (tr.querySelector('td')?.innerText || '').trim() === listId);
            if (!hit) return false;
            const tds = Array.from(hit.querySelectorAll('td')).map(td => td.innerText.replace(/\s+/g, ' ').trim());
            return isWorkerSurvey ? tds[14] === '완료' : tds[13] === '완료';
          }, { listId, isWorkerSurvey });
        } catch (verErr) {
          portalVerifiedDone = false;
        }

        if (!portalVerifiedDone) {
          throw new Error(`[${listId}] 최종 제출(moveLast/moveEnd) 수행 후 포털 완료 상태가 확인되지 않았습니다.`);
        }

        onProgress({
          step: 'COMPLETED',
          progress: 100,
          message: `🎉 [${isWorkerSurvey ? '내국인근로자' : '경영체'} · ${listId}] "${respName}" (${lastGateRes.finalPhone}) 포털 100% [완료] 검증 성공!`
        });

        return {
          success: true,
          status: 'completed',
          portalVerifiedDone: true,
          lastPage: 'END',
          respondentId: slotData.uid || listId,
          listId,
          respondentName: respName,
          phone: lastGateRes.finalPhone,
          replacedPhone: lastGateRes.replacedPhone,
          gps,
          unexpectedAlerts,
          capturedSteps,
          submittedAnswers
        };
      }

      // === 서명 캔버스 자동 처리 (기수집 서명 보존 + 미서명 8종 필체 생성) ===
      const sigRes = await drawCanvasSignatureIfNeeded(page, respName, seedNum + step, preserveExistingSignatures);
      if (sigRes) {
        submittedAnswers.push({
          page: meta.pid,
          question: `${sigRes.qId} 전자서명`,
          answer: sigRes.kept ? `기존 서명 보존 (${sigRes.file})` : `자동 서명 생성 (${sigRes.style || '필체'} · ${sigRes.file || ''})`
        });
      }

      // === 페이지별 정합성 응답 주입 ===
      await page.evaluate(async ({
        rsid,
        isWorkerSurvey,
        respName,
        sigungu,
        entityType,
        genderCode,
        birthYear,
        careerYears,
        areaPyeong,
        incomeManwon,
        cleanAddr,
        visitDate,
        startHStr,
        startMStr,
        endHStr,
        endMStr,
        workerStartDt,
        workerEndDt,
        hasEmployed,
        workerTypeCode,
        itemSpec,
        a3Schedule,
        shortageMode,
        preserveExistingInputs,
        seedNum
      }) => {
        window.__alerts = [];
        const fire = (el) => ['input', 'change', 'keyup', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const checkGallupBox = (cb) => {
          if (!cb || cb.disabled) return;
          const td = cb.closest('td');
          if (td && td.getAttribute('onclick')) {
            if (!cb.checked) td.click();
          } else {
            cb.click();
          }
          if (!cb.checked) {
            cb.checked = true;
            const oc = cb.getAttribute('onclick') || '';
            const mReset = oc.match(/resetExclusive_[A-Za-z0-9_]+/);
            if (mReset && typeof window[mReset[0]] === 'function') window[mReset[0]]();
          }
          fire(cb);
        };

        const bodyText = document.body.innerText || '';

        // [A] 내국인 근로자 전용 특수 문항 (Q1~Q10 인적·고용·지역·임금형태, Q122 근로일수/시간, Q133 조사시작/종료일시)
        if (isWorkerSurvey || rsid === '3111898935') {
          if (document.getElementById('QST$Q122$_Q122_1_1')) {
            const c1 = document.getElementById('QST$Q122$_Q122_1_1');
            const c2 = document.getElementById('QST$Q122$_Q122_1_2');
            const c3 = document.getElementById('QST$Q122$_Q122_1_3');
            const defaultDays = workerTypeCode === '1' ? '22' : (workerTypeCode === '2' ? '18' : '10');
            if (c1 && (!preserveExistingInputs || !c1.value.trim())) { c1.value = defaultDays; fire(c1); }
            if (c2 && (!preserveExistingInputs || !c2.value.trim())) { c2.value = '8'; fire(c2); }
            if (c3 && (!preserveExistingInputs || !c3.value.trim())) { c3.value = '1'; fire(c3); }
            return;
          }
          if (document.getElementById('QST$Q133$_Q133_1')) {
            const s1 = document.getElementById('QST$Q133$_Q133_1');
            const s2 = document.getElementById('QST$Q133$_Q133_2');
            if (s1) { s1.readOnly = false; s1.value = workerStartDt; fire(s1); }
            if (s2) { s2.readOnly = false; s2.value = workerEndDt; fire(s2); }
            return;
          }
          // Q1: 현재 고용형태 (1:상용, 2:임시, 3:일용)
          if (/고용형태는 무엇입니까/.test(bodyText) && document.querySelector('input[name="Q1"]')) {
            const targetQ1 = ['1', '2', '3'].includes(String(workerTypeCode)) ? String(workerTypeCode) : '3';
            const r = document.querySelector(`input[name="Q1"][value="${targetQ1}"]`) || document.querySelector('input[name="Q1"]:not(:disabled)');
            if (r) { r.click(); r.checked = true; fire(r); }
            return;
          }
          // Q2: 근무 농장/축사 지역 (경기도)
          if (/어느 지역에 있습니까/.test(bodyText)) {
            const r = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)')).find(x => /경기/.test(x.closest('td,li,label')?.innerText || ''));
            if (r) { r.click(); r.checked = true; fire(r); return; }
          }
          // Q3: 근무 농장/축사 시군 (양주시 / 동두천시)
          if (/시군은 어디입니까/.test(bodyText)) {
            const targetCity = /동두천/.test(sigungu || '') ? '동두천' : '양주';
            const r = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)')).find(x => (x.closest('td,li,label')?.innerText || '').includes(targetCity));
            if (r) { r.click(); r.checked = true; fire(r); return; }
            const sel = document.querySelector('select:not(:disabled)');
            if (sel) {
              const opt = Array.from(sel.options).find(o => o.text.includes(targetCity));
              if (opt) { sel.value = opt.value; fire(sel); return; }
            }
          }
          // Q4: 성별 (1:남, 2:여)
          if (/귀하의 성별은 무엇입니까/.test(bodyText)) {
            const r = document.querySelector(`input[type="radio"][value="${genderCode}"]:not(:disabled)`);
            if (r) { r.click(); r.checked = true; fire(r); return; }
          }
          // Q5: 연령대 (출생연도 기반 정합 매칭)
          if (/귀하의 연령대는 어떻게/.test(bodyText)) {
            const age = Math.max(20, 2026 - (Number(birthYear) || 1970));
            const decPrefix = age >= 70 ? '70' : (age >= 60 ? '60' : (age >= 50 ? '50' : (age >= 40 ? '40' : (age >= 30 ? '30' : '20'))));
            const rList = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)'));
            const r = rList.find(x => (x.closest('td,li,label')?.innerText || '').includes(decPrefix)) || rList[Math.min(3, rList.length - 1)];
            if (r) { r.click(); r.checked = true; fire(r); return; }
          }
          // Q10: 임금 지급 형태 (상용=월급제, 임시/일용=일급제)
          if (/임금 지급 형태는 무엇입니까/.test(bodyText)) {
            const wageKeyword = workerTypeCode === '1' ? '월급' : '일급';
            const rList = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)'));
            const r = rList.find(x => (x.closest('td,li,label')?.innerText || '').includes(wageKeyword)) || rList[0];
            if (r) { r.click(); r.checked = true; fire(r); return; }
          }
          // 구형 Q1+Q2 복합 인적사항 폴백
          if (document.querySelector('input[name="Q1"]') && document.querySelector('[name="QST$Q2$_Q2_1"]')) {
            const r1 = document.querySelector(`input[name="Q1"][value="${genderCode}"]`);
            if (r1 && !document.querySelector('input[name="Q1"]:checked')) { r1.click(); r1.checked = true; fire(r1); }
            const y2 = document.querySelector('[name="QST$Q2$_Q2_1"]');
            if (y2 && !y2.disabled && !y2.value.trim()) { y2.value = birthYear; fire(y2); }
          }
        }

        // [B] 경영체 동의/사전 문항 (Z0=1 동의, Q109=1 농작물/가축 판매 있음, Q112=2 위탁영농 없음)
        for (const [qName, targetVal] of [['Z0', '1'], ['Q109', '1'], ['Q112', '2']]) {
          const r = document.querySelector(`input[name="${qName}"][value="${targetVal}"]`);
          if (r && !r.disabled) {
            if (!document.querySelector(`input[name="${qName}"]:checked`)) {
              r.click(); r.checked = true; fire(r);
            }
            return;
          }
        }

        // [C] 문1-3 경영체 유형 (Q3 단독 페이지)
        if (document.querySelector('input[name="Q3"]') && !document.querySelector('input[name="Q4"]')) {
          if (!document.querySelector('input[name="Q3"]:checked')) {
            const targetQ3 = entityType === '농업법인' ? '2' : '1';
            const r3 = document.querySelector(`input[name="Q3"][value="${targetQ3}"]`) || document.querySelector('input[name="Q3"]:not(:disabled)');
            if (r3) { r3.click(); r3.checked = true; fire(r3); }
          }
          return;
        }

        // [D] Page 10: 농가(성별·출생연도·영농경력·귀농여부) vs 농업법인(법인유형·설립연도·상근출자자수)
        if (!isWorkerSurvey && (document.querySelector('[name="QST$Q4B$_Q4B_1"]') || document.querySelector('input[name="Q4"]'))) {
          const isCorpPage = bodyText.includes('법인 유형') || bodyText.includes('설립 연도');
          if (isCorpPage) {
            const corpCode = /영농조합/.test(respName) ? '1' : '2';
            if (!preserveExistingInputs || !document.querySelector('input[name="Q4"]:checked')) {
              const r4 = document.querySelector(`input[name="Q4"][value="${corpCode}"]`) || document.querySelector('input[name="Q4"]:not(:disabled)');
              if (r4) { r4.click(); r4.checked = true; fire(r4); }
            }
            const b = document.querySelector('[name="QST$Q4B$_Q4B_1"]');
            if (b && !b.disabled && (!preserveExistingInputs || !b.value.trim() || Number(b.value) < 1960)) {
              const estYear = String(Math.max(1995, Math.min(2023, 2026 - Math.min(25, Number(careerYears) || 10))));
              b.value = estYear; fire(b);
            }
            const c = document.querySelector('[name="QST$Q51$_Q51_1"]');
            if (c && !c.disabled && (!preserveExistingInputs || !c.value.trim())) {
              c.value = '2'; fire(c);
            }
          } else {
            if (!preserveExistingInputs || !document.querySelector('input[name="Q4"]:checked')) {
              const r4 = document.querySelector(`input[name="Q4"][value="${genderCode}"]`) || document.querySelector('input[name="Q4"]:not(:disabled)');
              if (r4) { r4.click(); r4.checked = true; fire(r4); }
            }
            const b = document.querySelector('[name="QST$Q4B$_Q4B_1"]');
            if (b && !b.disabled && (!preserveExistingInputs || !b.value.trim())) {
              b.value = birthYear; fire(b);
            }
            const c = document.querySelector('[name="QST$Q51$_Q51_1"]');
            if (c && !c.disabled && (!preserveExistingInputs || !c.value.trim())) {
              const maxCareer = Math.max(1, (2026 - Number(birthYear || 1960)) - 18);
              c.value = String(Math.min(maxCareer, Math.max(1, Number(careerYears) || 25)));
              fire(c);
            }
            if (!preserveExistingInputs || !document.querySelector('input[name="Q141"]:checked')) {
              const gw = document.querySelector('input[name="Q141"][value="2"]');
              if (gw && !gw.disabled) { gw.click(); gw.checked = true; fire(gw); }
            }
          }
          return;
        }

        // [E] Page 12: 문A2 농축산물 생산현황 (농작물 Row 1 / 축산 Row 6)
        if (document.getElementById('QST$Q6A$_Q6A_1_1')) {
          const curCode1 = document.getElementById('QST$CODE$_CODE_1')?.value?.trim() || '';
          const curCode6 = document.getElementById('QST$CODE$_CODE_6')?.value?.trim() || '';

          if (itemSpec.isLivestock) {
            const a6 = document.getElementById('QST$Q6A$_Q6A_6_1');
            const code6 = document.getElementById('QST$CODE$_CODE_6');
            const a6Etc = document.getElementById('QST$Q6A$_Q6A_6_2');
            const b6 = document.getElementById('QST$Q6B$_Q6B_6_1');
            const e6 = document.getElementById('QST$Q6E$_Q6E_6_1');

            if (!curCode6 && a6 && code6) {
              a6.value = itemSpec.fullLabel;
              fire(a6);
              code6.value = itemSpec.code;
              if (typeof window.setSelectOptions === 'function') window.setSelectOptions(6);
              if (typeof window.updateEtcFieldState === 'function') window.updateEtcFieldState('6', itemSpec.fullLabel);
              if (typeof window.updateQ6C_Q6D_Row === 'function') window.updateQ6C_Q6D_Row(6);
              await sleep(120);
            }
            if (itemSpec.etcText && a6Etc) {
              a6Etc.disabled = false;
              if (!a6Etc.value.trim()) { a6Etc.value = itemSpec.etcText; fire(a6Etc); }
            }
            if (b6 && !b6.value.trim()) {
              // 시트의 사육규모/평수 값이 500 이상이고 한우/젖소/사슴이면 적정 두수로 보정하되 기본 시트 수치 존중
              const rawScale = parseInt(areaPyeong, 10) || 45;
              const scaleVal = ['901', '903', '910'].includes(itemSpec.code) && rawScale > 300 ? String(Math.max(15, Math.round(rawScale / 15))) : String(rawScale);
              b6.value = scaleVal;
              fire(b6);
            }
            const unitSel = document.getElementById('MatrixTd_Select_Q6B_6_2');
            if (unitSel) {
              if (typeof window.setSelectOptions === 'function' && unitSel.options.length <= 1) {
                window.setSelectOptions(6);
              }
              if (!unitSel.value && unitSel.options.length > 1) {
                unitSel.value = unitSel.options[1].value;
                const hiddenUnit = document.getElementById('QST$Q6B$_Q6B_6_2');
                if (hiddenUnit) hiddenUnit.value = unitSel.value;
                if (window.jQ) window.jQ(unitSel).trigger('change');
                fire(unitSel);
              }
            }
            const d6 = document.querySelector('input[name="Q6D_6"][value="2"]');
            if (d6 && !d6.disabled && !document.querySelector('input[name="Q6D_6"]:checked')) {
              d6.click(); d6.checked = true; fire(d6);
            }
            if (e6 && !e6.value.trim()) {
              e6.value = incomeManwon || '3000';
              fire(e6);
            }
            if (!Array.from(document.querySelectorAll('input[name^="Q6G_"]')).some(x => x.checked)) {
              const g6 = document.getElementById('Q6G_6_1') || document.querySelector('input[name^="Q6G_6"]');
              if (g6 && !g6.disabled) checkGallupBox(g6);
            }
            return;
          }

          // 일반 농작물 (Row 1)
          const a1 = document.getElementById('QST$Q6A$_Q6A_1_1');
          const code1 = document.getElementById('QST$CODE$_CODE_1');
          const a1Etc = document.getElementById('QST$Q6A$_Q6A_1_2');
          const b1 = document.getElementById('QST$Q6B$_Q6B_1_1');
          const e1 = document.getElementById('QST$Q6E$_Q6E_1_1');

          if (!curCode1 && a1 && code1) {
            const jq = window.jQ || window.jQuery;
            let selectedOk = false;
            if (jq && typeof jq(a1).autocomplete === 'function') {
              try {
                const inst = jq(a1).autocomplete('instance');
                if (inst && inst.options && typeof inst.options.select === 'function') {
                  a1.value = itemSpec.fullLabel;
                  inst.options.select.call(a1, jq.Event('autocompleteselect'), {
                    item: { label: itemSpec.fullLabel, value: itemSpec.fullLabel }
                  });
                  jq(a1).trigger('change').trigger('blur');
                  await sleep(120);
                  selectedOk = Boolean(code1.value.trim());
                }
              } catch (acErr) {
                selectedOk = false;
              }
            }
            if (!selectedOk) {
              a1.value = itemSpec.fullLabel;
              fire(a1);
              code1.value = itemSpec.code;
              if (typeof window.updateEtcFieldState === 'function') window.updateEtcFieldState('1', itemSpec.fullLabel);
              if (typeof window.updateQ6C_Q6D_Row === 'function') window.updateQ6C_Q6D_Row(1);
              await sleep(120);
            }
          }

          if (itemSpec.etcText && a1Etc) {
            a1Etc.disabled = false;
            if (!a1Etc.value.trim()) { a1Etc.value = itemSpec.etcText; fire(a1Etc); }
          }
          if (b1 && !b1.disabled && !b1.value.trim()) {
            b1.value = areaPyeong || '600';
            fire(b1);
          }
          const cVal = itemSpec.isFacility ? '1' : '2';
          if (!document.querySelector('input[name="Q6C_1"]:checked')) {
            const cRadio = document.querySelector(`input[name="Q6C_1"][value="${cVal}"]`);
            if (cRadio && !cRadio.disabled) { cRadio.click(); cRadio.checked = true; fire(cRadio); }
          }
          if (!document.querySelector('input[name="Q6D_1"]:checked')) {
            const dRadio = document.querySelector('input[name="Q6D_1"][value="2"]');
            if (dRadio && !dRadio.disabled) { dRadio.click(); dRadio.checked = true; fire(dRadio); }
          }
          if (e1 && !e1.disabled && !e1.value.trim()) {
            e1.value = incomeManwon || '2500';
            fire(e1);
          }
          if (!document.querySelector('input[name="Q6F_1"]:checked')) {
            const fRadio = document.querySelector('input[name="Q6F_1"][value="2"]');
            if (fRadio && !fRadio.disabled) { fRadio.click(); fRadio.checked = true; fire(fRadio); }
          }
          if (!Array.from(document.querySelectorAll('input[name^="Q6G_"]')).some(x => x.checked)) {
            const g1 = document.getElementById('Q6G_1_1') || document.querySelector('input[name^="Q6G_1"]');
            if (g1 && !g1.disabled) checkGallupBox(g1);
          }
          return;
        }

        // [F] Page 14: 문A3 농작업 수행·기계화·고용·월별 시기 (1~11행, 12행 기타 제외)
        if (document.querySelector('input[name="Q7_1"]') && document.querySelector('input[name="Q7C_1_1"]')) {
          const activeRows = Object.keys(a3Schedule || {}).map(Number);
          // 고용 근로자 투입 대표 작업줄 선정 (수확 10순위, 제초/방제 5순위, 정식 4순위 중 활성 줄 최대 2개)
          const preferredHireRows = [10, 5, 4, 7, 6, 2, 1].filter(r => activeRows.includes(r)).slice(0, 2);

          for (let row = 1; row <= 11; row++) {
            const months = a3Schedule[row] || a3Schedule[String(row)];
            const yRadio = document.querySelector(`input[name="Q7_${row}"][value="1"]`);
            const nRadio = document.querySelector(`input[name="Q7_${row}"][value="2"]`);

            if (months && months.length > 0 && yRadio && !yRadio.disabled) {
              if (!yRadio.checked) {
                yRadio.click(); yRadio.checked = true; fire(yRadio);
                await sleep(45);
              }
              const b2 = document.querySelector(`input[name="Q7B_${row}"][value="2"]`);
              if (b2 && !b2.disabled && !document.querySelector(`input[name="Q7B_${row}"]:checked`)) {
                b2.click(); b2.checked = true; fire(b2);
                await sleep(30);
              }
              const m1 = document.querySelector(`input[name="Q34_${row}"][value="1"]`);
              if (m1 && !m1.disabled && !document.querySelector(`input[name="Q34_${row}"]:checked`)) {
                m1.click(); m1.checked = true; fire(m1);
              }
              const anyHireChecked = [1, 2, 3, 9998].some(code => document.getElementById(`Q107_${row}_${code}`)?.checked);
              if (!anyHireChecked) {
                if (hasEmployed && preferredHireRows.includes(row)) {
                  const c1 = document.getElementById(`Q107_${row}_1`);
                  if (c1 && !c1.disabled) checkGallupBox(c1);
                } else {
                  const rNone = document.getElementById(`Q107_${row}_9998`);
                  if (rNone && !rNone.disabled) { rNone.click(); rNone.checked = true; fire(rNone); }
                }
              }
              const anyMonthChecked = Array.from({ length: 12 }, (_, idx) => document.getElementById(`Q7C_${row}_${idx + 1}`)?.checked).some(Boolean);
              if (!anyMonthChecked) {
                for (const mo of months) {
                  const cm = document.getElementById(`Q7C_${row}_${mo}`);
                  if (cm && !cm.disabled) checkGallupBox(cm);
                }
              }
            } else if (nRadio && !nRadio.disabled && nRadio.offsetParent !== null) {
              if (!document.querySelector(`input[name="Q7_${row}"]:checked`)) {
                nRadio.click(); nRadio.checked = true; fire(nRadio);
              }
            }
          }
          return;
        }

        // [G] Page 16: 문A4 자가노동력 (농가 HQ9_1 vs 농업법인 HQ9_2, 축산 Q154 부재 시 12개월 전체 활성)
        if (document.querySelector('[name="QST$Q9$_Q9_2_1"]') || document.querySelector('[name="QST$Q9$_Q9_3_1"]')) {
          const isCorp = Boolean(document.getElementById('HQ9_2')?.checked);
          const hasQ154 = Boolean(document.getElementById('Q154_1_1'));
          for (let m = 1; m <= 12; m++) {
            const active = hasQ154 ? Boolean(document.getElementById(`Q154_1_${m}`)?.checked) : true;
            if (isCorp) {
              const n3 = document.querySelector(`[name="QST$Q9$_Q9_3_${m}"]`);
              const d4 = document.querySelector(`[name="QST$Q9$_Q9_4_${m}"]`);
              if (n3 && !n3.readOnly && (!preserveExistingInputs || !n3.value.trim())) { n3.value = active ? '2' : '0'; fire(n3); }
              if (d4 && !d4.readOnly && (!preserveExistingInputs || !d4.value.trim())) { d4.value = active ? '22' : '0'; fire(d4); }
            } else {
              const d2 = document.querySelector(`[name="QST$Q9$_Q9_2_${m}"]`);
              const n5 = document.querySelector(`[name="QST$Q9$_Q9_5_${m}"]`);
              const d6 = document.querySelector(`[name="QST$Q9$_Q9_6_${m}"]`);
              if (d2 && !d2.readOnly && (!preserveExistingInputs || !d2.value.trim())) { d2.value = active ? '25' : '0'; fire(d2); }
              if (n5 && !n5.readOnly && (!preserveExistingInputs || !n5.value.trim())) { n5.value = active ? '1' : '0'; fire(n5); }
              if (d6 && !d6.readOnly && (!preserveExistingInputs || !d6.value.trim())) { d6.value = active ? '20' : '0'; fire(d6); }
            }
          }
          return;
        }

        // [H] Page 18: 문A6 고용 근로자 유형 (상용 AA6_1_1 / 임시 AA6_1_3 / 일용 AA6_1_5)
        if (document.getElementById('AA6_1_1') && document.getElementById('AA6_1_5')) {
          const anyChecked = [1, 2, 3, 4, 5, 6, 7].some(c => document.getElementById(`AA6_1_${c}`)?.checked);
          if (!preserveExistingInputs || !anyChecked) {
            const targetCol = workerTypeCode === '1' ? 1 : (workerTypeCode === '2' ? 3 : 5);
            for (let c = 1; c <= 7; c++) {
              const cb = document.getElementById(`AA6_1_${c}`);
              if (!cb || cb.disabled) continue;
              if (c === targetCol && !cb.checked) checkGallupBox(cb);
              else if (c !== targetCol && cb.checked) {
                cb.click();
                if (cb.checked) cb.checked = false;
                fire(cb);
              }
            }
          }
          return;
        }

        // [I] 성별 근로시간·임금 매트릭스 (문A7-6 / 문A8-6 / 문A9-6: updateControlState)
        if (typeof window.updateControlState === 'function' || document.getElementById('Q150_2_1') || document.getElementById('Q148_2_1') || document.getElementById('Q149_2_1')) {
          for (const gId of ['Q148_2_1', 'Q149_2_1', 'Q150_2_1']) {
            const gCb = document.getElementById(gId);
            if (gCb && !gCb.disabled && !gCb.checked) {
              gCb.click();
              if (!gCb.checked) gCb.checked = true;
              fire(gCb);
            }
          }
          if (typeof window.updateControlState === 'function') window.updateControlState();
          await sleep(70);
          const editInps = Array.from(document.querySelectorAll('input[type="tel"]:not(:disabled):not([readonly]), input[type="text"]:not(:disabled):not([readonly]), input[type="number"]:not(:disabled):not([readonly])'))
            .filter(e => e.offsetParent !== null && !e.name.startsWith('surveyorMemo'));
          for (const inp of editInps) {
            if (preserveExistingInputs && inp.value.trim()) continue;
            const cellTxt = (inp.closest('td')?.innerText || '').replace(/\s+/g, ' ');
            if (/시간\s*\/\s*일|시간/.test(cellTxt)) inp.value = '8';
            else if (/만원\s*\/\s*일/.test(cellTxt)) inp.value = '13';
            else if (/만원\s*\/\s*월|만원/.test(cellTxt)) inp.value = '250';
            else inp.value = '13';
            fire(inp);
          }
          return;
        }

        // [J] 채용경로 등 100% 비율 합계 테이블 (문A7-1 / 문A8-1 / 문A9-1)
        if (/채용경로별\s*비율|비율을\s*응답|합계가\s*100/.test(bodyText)) {
          const editable = Array.from(document.querySelectorAll('input[type="tel"]:not(:disabled):not([readonly]), input[type="text"]:not(:disabled):not([readonly]), input[type="number"]:not(:disabled):not([readonly])'))
            .filter(e => e.offsetParent !== null && !e.name.startsWith('surveyorMemo') && !e.name.endsWith('_TXT'));
          if (editable.length >= 2) {
            const byCol = {};
            for (const inp of editable) {
              const m = inp.name.match(/_(\d+)_(\d+)$/);
              const colKey = m ? m[2] : '1';
              (byCol[colKey] = byCol[colKey] || []).push(inp);
            }
            for (const [, colList] of Object.entries(byCol)) {
              const curSum = colList.reduce((acc, el) => acc + (parseFloat(el.value) || 0), 0);
              if (preserveExistingInputs && curSum === 100) continue;
              colList.forEach((inp, idx) => {
                inp.value = idx === 0 ? '100' : '0';
                fire(inp);
                if (typeof inp.onkeyup === 'function') { try { inp.onkeyup(); } catch (_) {} }
              });
            }
            return;
          }
        }

        // [K] 월별 고용근로자 투입 인원·연인원 매트릭스 (Q155/Q156/Q157 또는 축산 월별표)
        const refMonthPrefix = ['Q155', 'Q156', 'Q157'].find(q => document.getElementById(`${q}_1_1`));
        if (refMonthPrefix || /월별\s*투입\s*인원|월별\s*연인원/.test(bodyText)) {
          const activeMonths = [];
          if (refMonthPrefix) {
            for (let m = 1; m <= 12; m++) {
              if (document.getElementById(`${refMonthPrefix}_1_${m}`)?.checked) activeMonths.push(m);
            }
          }
          const targetMonths = activeMonths.length > 0
            ? activeMonths.slice(-2)
            : (workerTypeCode === '1' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [5, 6, 9, 10]);
          const textInps = Array.from(document.querySelectorAll('input[type="text"]:not(:disabled):not([readonly]), input[type="tel"]:not(:disabled):not([readonly]), input[type="number"]:not(:disabled):not([readonly])'))
            .filter(e => e.offsetParent !== null && !e.name.startsWith('surveyorMemo'));
          for (const inp of textInps) {
            if (preserveExistingInputs && inp.value.trim()) continue;
            const mMatch = inp.name.match(/_(\d+)_(\d+)$/);
            if (mMatch) {
              const rowIdx = Number(mMatch[1]);
              const moIdx = Number(mMatch[2]);
              const isHeadcountRow = (rowIdx % 2 === 1);
              if (rowIdx <= 2) {
                inp.value = targetMonths.includes(moIdx)
                  ? (isHeadcountRow ? '2' : (workerTypeCode === '3' ? '6' : '20'))
                  : '0';
              } else {
                inp.value = '0';
              }
              fire(inp);
            }
          }
          return;
        }

        // [L] Page 46: 인력수급 차질 현황 (AA2_1~12 / AA1)
        if (document.querySelector('input[name="AA2_1"]')) {
          const shortMonths = shortageMode === '6to9' ? [6, 7, 8, 9] : [];
          for (let m = 1; m <= 12; m++) {
            if (shortMonths.includes(m)) {
              const r1 = document.querySelector(`input[name="AA2_${m}"][value="1"]`);
              if (r1 && !r1.disabled) { r1.click(); r1.checked = true; fire(r1); }
              for (let k = 1; k <= 3; k++) {
                const cell = document.querySelector(`[name="QST$AA1$_AA1_${m}_${k}"]`);
                if (cell && !cell.disabled && !cell.value.trim()) {
                  cell.value = k === 3 ? '2' : '0';
                  fire(cell);
                }
              }
            } else {
              const r2 = document.querySelector(`input[name="AA2_${m}"][value="2"]`);
              if (r2 && !r2.disabled && (!preserveExistingInputs || !document.querySelector(`input[name="AA2_${m}"]:checked`))) {
                r2.click(); r2.checked = true; fire(r2);
              }
            }
          }
          return;
        }

        // [M] Page 155: 조사 후 기록 (TIME_1~5: 시트 방문일자·방문시각 정확 일치)
        if (document.querySelector('[name="QST$TIME$_TIME_1"]')) {
          const t1 = document.querySelector('[name="QST$TIME$_TIME_1"]');
          if (t1) { t1.readOnly = false; t1.value = visitDate; fire(t1); }
          const sets = [
            ['QST$TIME$_TIME_2', startHStr],
            ['QST$TIME$_TIME_3', startMStr],
            ['QST$TIME$_TIME_4', endHStr],
            ['QST$TIME$_TIME_5', endMStr]
          ];
          for (const [n, v] of sets) {
            const s = document.querySelector(`select[name="${n}"]`);
            if (s) {
              const opt = Array.from(s.options).find(o => o.value === v || o.text.trim() === v || Number(o.value) === Number(v)) || s.options[1];
              if (opt) { s.value = opt.value; fire(s); }
            }
          }
          return;
        }

        // [N] 답례품 성명(NAME_1) 및 응답자 성명·주소(Q46_1 / Q48_1)
        for (const nm of ['QST$NAME$_NAME_1', 'QST$Q46$_Q46_1']) {
          const el = document.querySelector(`[name="${nm}"]`);
          if (el && !el.disabled && !el.value.trim()) {
            el.value = respName;
            fire(el);
          }
        }
        const q48 = document.querySelector('[name="QST$Q48$_Q48_1"]');
        if (q48 && !q48.disabled) {
          q48.value = cleanAddr;
          fire(q48);
        }

        // [O] 갤럽 순위형(ranking_2 / setOrder_) 자동 클릭
        const rankInputs = Array.from(document.querySelectorAll('input.ranking_2, input[onclick*="setOrder_"]'))
          .filter(e => !e.disabled && e.offsetParent !== null);
        if (rankInputs.length > 0) {
          const byQ = {};
          rankInputs.forEach(inp => {
            const k = (inp.name.match(/^QST\$([^$]+)\$/) || [])[1] || 'default';
            (byQ[k] = byQ[k] || []).push(inp);
          });
          for (const [, list] of Object.entries(byQ)) {
            if (list.some(x => x.value.trim() !== '')) continue;
            const nonEtc = list.filter(x => !/999[789]/.test(x.name) && !/기타|없음|모름/.test(x.closest('label,li,td')?.innerText || ''));
            const pool = nonEtc.length >= 2 ? nonEtc : list;
            const firstIdx = seedNum % Math.min(3, pool.length);
            pool[firstIdx]?.click();
            if (pool.length > 1 && (pool[0]?.getAttribute('onclick') || '').includes(', 2)')) {
              const secondIdx = (firstIdx + 1) % pool.length;
              pool[secondIdx]?.click();
            }
          }
        }

        // [P] 범용 라디오 그룹 (비어 있는 그룹만 정합 선택 — 복수선택 배타보기 _999[6789] 제외!)
        const radios = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)'))
          .filter(r => (r.offsetParent !== null || r.closest('td,li')?.offsetParent !== null) && !/_999[6789]$/.test(r.name || ''));
        const rGroups = {};
        radios.forEach(r => { (rGroups[r.name] = rGroups[r.name] || []).push(r); });
        let gIdx = 0;
        for (const [name, list] of Object.entries(rGroups)) {
          gIdx++;
          if (list.some(r => r.checked)) continue;
          const nonEtc = list.filter(r => !/^999[6789]$/.test(r.value) && !document.querySelector(`[name$="_${r.value}_TXT"]`) && !/기타/.test(r.closest('label,td,li')?.innerText || ''));
          const pool = nonEtc.length > 0 ? nonEtc : list;
          let pick = pool[0];
          if (name === 'P1') {
            pick = pool.find(r => r.value === '1') || pool[0];
          } else if (['Q101', 'Q14', 'Q139'].includes(name)) {
            pick = pool.find(r => r.value === '2') || pool[0];
          } else if (name === 'Q15' && (isWorkerSurvey || rsid === '3111898935')) {
            const wageCode = workerTypeCode === '1' ? '1' : '2';
            pick = pool.find(r => r.value === wageCode) || pool[0];
          } else if (pool.length === 2) {
            const labels = pool.map(r => (r.closest('label,td,li')?.innerText || '').trim());
            if (labels.some(l => /없다|없음|아니오|필요하지|미가입|미실시|미적용|구두|미제공|미지급|받지/.test(l))) {
              pick = pool.find((_, i) => /없다|없음|아니오|필요하지|미가입|미실시|미적용|구두|미제공|미지급|받지/.test(labels[i])) || pool[1];
            } else {
              pick = pool[(seedNum + gIdx) % pool.length];
            }
          } else if (pool.length >= 4) {
            const midPool = pool.slice(Math.max(0, Math.floor(pool.length / 2) - 1), Math.min(pool.length, Math.floor(pool.length / 2) + 2));
            pick = midPool[(seedNum + gIdx) % midPool.length] || pool[gIdx % pool.length];
          }
          pick.click();
          if (!pick.checked) { pick.checked = true; fire(pick); }
        }

        // [Q] 범용 체크박스 그룹 (배타 라디오 _999[6789]가 잘못 체크된 경우 해제 후 일반 보기 선택)
        for (const qDiv of document.querySelectorAll('.question[id^="Question_"]')) {
          if (qDiv.offsetParent === null || qDiv.style.display === 'none') continue;
          const cbs = Array.from(qDiv.querySelectorAll('input[type="checkbox"]:not(:disabled)'))
            .filter(c => c.offsetParent !== null || c.closest('td,li')?.offsetParent !== null);
          const exclRadios = Array.from(qDiv.querySelectorAll('input[type="radio"][name$="_9998"], input[type="radio"][name$="_9999"]'));
          if (cbs.length > 0 && exclRadios.filter(r => r.checked).length > 1) {
            exclRadios.forEach(r => { r.checked = false; });
          }
          if (cbs.length > 0 && !cbs.some(c => c.checked) && !exclRadios.some(r => r.checked)) {
            const safeCands = cbs.filter(c => !/^999[6789]$/.test(c.value) && !/기타|없음|모르겠음|해당사항/.test(c.closest('label,td,li')?.innerText || ''));
            const chosen = safeCands.length > 0 ? safeCands[seedNum % Math.min(3, safeCands.length)] : cbs[0];
            checkGallupBox(chosen);
          }
        }
        await sleep(50);

        // [R] 범용 드롭다운(Select)
        for (const sel of document.querySelectorAll('select:not(:disabled)')) {
          if (sel.offsetParent === null || sel.name?.startsWith('surveyorMemo')) continue;
          if (!sel.value || sel.selectedIndex <= 0) {
            if (sel.options.length > 1) { sel.value = sel.options[1].value; fire(sel); }
          }
        }

        // [S] 열 헤더 & 스크립트 범위 인식형 수치/텍스트 입력
        const pageScripts = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
        const scriptRanges = [...pageScripts.matchAll(/(\d+)에서\s*(\d+)\s*사이/g)].map(m => [Number(m[1]), Number(m[2])]);
        const visInps = Array.from(document.querySelectorAll('input[type="text"]:not(:disabled):not([readonly]), input[type="tel"]:not(:disabled):not([readonly]), input[type="number"]:not(:disabled):not([readonly])'))
          .filter(inp => inp.offsetParent !== null && inp.name && !inp.name.startsWith('surveyorMemo') && !inp.name.endsWith('_TXT') && !inp.classList.contains('ranking_2'));
        for (let inpIdx = 0; inpIdx < visInps.length; inpIdx++) {
          const inp = visInps[inpIdx];
          const curVal = inp.value.trim();
          const td = inp.closest('td');
          const tbl = inp.closest('table');
          const thTxt = (td && tbl) ? (tbl.querySelectorAll('thead tr:first-child th')[td.cellIndex]?.innerText || '') : '';
          const cellTxt = ((td?.innerText || inp.closest('li,div')?.innerText || '') + ' ' + thTxt).replace(/\s+/g, ' ');
          const boundPair = scriptRanges[inpIdx] || (visInps.length === 1 ? scriptRanges[0] : null);
          const curNum = Number(curVal);
          const isOutOfScriptRange = boundPair && (curVal === '' || isNaN(curNum) || curNum < boundPair[0] || curNum > boundPair[1]);

          if (curVal !== '' && !isOutOfScriptRange && !(curNum > 1000 && /만원/.test(cellTxt))) continue;
          let val = '1';
          if (/휴게/.test(cellTxt)) val = '1';
          else if (/만원\s*\/\s*일/.test(cellTxt)) val = '13';
          else if (/만원\s*\/\s*월|만원/.test(cellTxt)) val = '230';
          else if (/시급|원\s*\/\s*시간/.test(cellTxt)) val = '12000';
          else if (/일급|일당|원\s*\/\s*일/.test(cellTxt)) val = '130000';
          else if (/월급|원\s*\/\s*월/.test(cellTxt)) val = '2600000';
          else if (/연봉/.test(cellTxt)) val = '31000000';
          else if (/원/.test(cellTxt)) val = '130000';
          else if (/종사\(근로\)\s*기간|개월/.test(cellTxt + ' ' + bodyText.slice(0, 140))) val = /개월|_2$/.test(inp.name + cellTxt) ? '0' : '5';
          else if (/근로시간|시간\s*\/\s*일|시간/.test(cellTxt)) val = '8';
          else if (/일수|근로일|일\s*\/\s*월/.test(cellTxt)) val = '15';
          else if (/연령|나이/.test(cellTxt)) val = '58';
          else if (/출생/.test(cellTxt)) val = '1968';
          else if (/비율|%/.test(cellTxt)) val = '100';
          else if (/명|인원/.test(cellTxt)) val = '2';

          if (boundPair) {
            const [lo, hi] = boundPair;
            const vNum = Number(val);
            if (isNaN(vNum) || vNum < lo || vNum > hi) {
              if (lo >= 1000000) val = String(Math.min(hi, Math.max(lo, 2600000)));
              else if (lo >= 10000) val = String(Math.min(hi, Math.max(lo, 130000)));
              else if (lo >= 5000) val = String(Math.min(hi, Math.max(lo, 12000)));
              else if (lo >= 1900) val = String(Math.min(hi, Math.max(lo, Number(birthYear) || 1968)));
              else val = String(Math.min(hi, Math.max(lo, 5)));
            }
          }
          inp.value = val;
          fire(inp);
        }
      }, {
        rsid,
        isWorkerSurvey,
        respName,
        sigungu,
        entityType,
        genderCode,
        birthYear,
        careerYears,
        areaPyeong,
        incomeManwon,
        cleanAddr,
        visitDate,
        startHStr,
        startMStr,
        endHStr,
        endMStr,
        workerStartDt,
        workerEndDt,
        hasEmployed,
        workerTypeCode,
        itemSpec,
        a3Schedule,
        shortageMode,
        preserveExistingInputs,
        seedNum
      });

      // 다음 페이지 이동
      await page.evaluate(() => {
        const btn = document.getElementById('nextBtnLi') || document.getElementById('nextBtn');
        if (btn) btn.click();
        else if (typeof window.moveNext === 'function') window.moveNext();
      });
      await page.waitForTimeout(340);

      const afterKey = await waitForStablePage(page);
      const afterPid = (afterKey.split('|')[1] || '');
      if (afterPid && afterPid === meta.pid) {
        const clickAlerts = await page.evaluate(() => {
          const a = [...(window.__alerts || [])];
          window.__alerts = [];
          return a;
        });
        if (clickAlerts.some(a => /동일하게|유사하게|다시 한 번 확인/.test(a))) {
          await page.evaluate(() => {
            const btn = document.getElementById('nextBtnLi') || document.getElementById('nextBtn');
            if (btn) btn.click();
          });
          await page.waitForTimeout(360);
        }
        const retryKey = await waitForStablePage(page);
        const retryPid = (retryKey.split('|')[1] || '');
        if (retryPid === meta.pid) {
          if (clickAlerts.length) unexpectedAlerts.push(...clickAlerts);
          throw new Error(`[${listId}] Page ${meta.pid} (${meta.title}) 진행 막힘: ${clickAlerts.join(' | ') || '원인 미상'}`);
        }
      }
    }

    throw new Error(`[${listId}] 최대 페이지 탐색 한도(185단계)를 초과했습니다.`);
  } finally {
    await browser.close();
  }
}

/**
 * 두 조사원 계정(안재은 40878 / 김미경 47837)의 포털(agriwork.gallup.co.kr/survey/main.asp) 실시간 완료/진행 상태 전수 동기화
 */
export async function syncGallupAgriworkStatuses({ quotaDatabase = [] } = {}) {
  const browser = await launchChromium({ headless: true });
  const portalMap = new Map(); // listId -> { visitResult, ownerState, workerState }

  try {
    for (const acc of Object.values(AGRIWORK_ACCOUNTS)) {
      const context = await browser.newContext({
        locale: 'ko-KR',
        permissions: ['geolocation'],
        geolocation: { latitude: 37.8264, longitude: 126.9822, accuracy: 15 }
      });
      await context.grantPermissions(['geolocation'], { origin: 'https://agriwork.gallup.co.kr' });
      await context.addInitScript(() => {
        window.alert = () => {};
        window.confirm = () => true;
      });
      const page = await context.newPage();
      await page.goto(AGRIWORK_DEFAULT_PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('input[name="login_id"]', acc.surveyorId);
      await page.fill('input[name="password"]', acc.surveyorPw);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.evaluate(() => window.fnSubmit())
      ]);
      if (!page.url().toLowerCase().includes('main.asp')) {
        await page.goto('https://agriwork.gallup.co.kr/survey/main.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      const rows = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tr[onclick*="fnSubmit2"]')).map(tr => {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\s+/g, ' ').trim());
          return {
            listId: tds[0] || '',
            visitResult: tds[12] || '',
            ownerState: tds[13] || '',
            workerState: tds[14] || ''
          };
        }).filter(r => r.listId);
      });
      for (const r of rows) {
        portalMap.set(r.listId, r);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  let updatedCount = 0;
  let ownerCompletedCount = 0;
  let workerCompletedCount = 0;

  for (const item of quotaDatabase) {
    const listId = String(item.listId || String(item.uid || item.id || '').replace(/_W$/, '')).trim();
    const isWorker = item.surveySubType === 'worker' || String(item.rsid) === '3111898935' || String(item.uid || '').endsWith('_W');
    const p = portalMap.get(listId);
    if (!p) continue;

    const liveState = isWorker ? p.workerState : p.ownerState;
    if (liveState === '완료') {
      if (isWorker) workerCompletedCount++;
      else ownerCompletedCount++;
      if (item.quotaStatus !== 'completed' || item.status !== '완료') {
        item.quotaStatus = 'completed';
        item.status = '완료';
        item.progress = '100%';
        item.surveyCompleted = '완료';
        updatedCount++;
      }
    } else if (liveState === '진행중') {
      if (item.quotaStatus === 'completed') {
        item.quotaStatus = 'ready';
        item.status = '진행중';
        item.progress = item.progress === '100%' ? '진행중' : (item.progress || '진행중');
        updatedCount++;
      } else if (item.quotaStatus !== 'pilot_done' && item.status !== '진행중') {
        item.status = '대기(진행중)';
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    portalRowCount: portalMap.size,
    updatedCount,
    ownerCompletedCount,
    workerCompletedCount,
    quotaDatabase
  };
}
