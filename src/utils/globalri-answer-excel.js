/**
 * [글로벌리서치 제5차 성인문해능력조사]
 * 문항별 메타데이터 및 응답자별 제출 문항·답변 Excel(.xlsx) 생성기
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export const GLOBALRI_DEFAULT_GSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=0#gid=0';

export const LITERACY_QUESTION_META = {
  A1: {
    part: 'Part A (선별문항)',
    type: 'VOICE (음성녹음)',
    summary: '[A1] "문화회관 노래교실" 안내문 문장 소리 내어 읽기 (음성녹음 파일 업로드)',
    officialAnswer: '음성녹음 업로드 (STT: 문화회관 노래교실)',
    wrongExample: '-',
    note: 'A1_2와 한 화면에 동시 출제됨'
  },
  A1_2: {
    part: 'Part A (선별문항)',
    type: 'RADIO (단일선택)',
    summary: '[A1-2] 응답자가 A1 문장을 소리 내어 읽었는지 면접원 체크 (1:O, 2:X)',
    officialAnswer: '1 (O: 제대로 읽음)',
    wrongExample: '2 (X: 읽지 못함)',
    note: '1번(O) 선택 시 A1 정답 인정'
  },
  A2: {
    part: 'Part A (선별문항)',
    type: 'TEXT (단답입력)',
    summary: '[A2] 노래교실 안내문에서 강사(박지영)의 고향(출신 지역) 찾기',
    officialAnswer: '대전',
    wrongExample: '서울',
    note: 'Part A 선별 2번 문항'
  },
  A3: {
    part: 'Part A (선별문항)',
    type: 'TEXT (3칸 숫자)',
    summary: '[A3] 오늘 날짜(연도 / 월 / 일) 빈칸에 숫자 쓰기',
    officialAnswer: '2026 / 7 / 13',
    wrongExample: '2025 / 1 / 1',
    note: 'END_A 채점 (3점 만점 시 B1~B5 진입)'
  },
  B1: {
    part: 'Part B-1 (기초문해 1단계)',
    type: 'TEXT (2칸 단답)',
    summary: '[B1] 어법에 맞는 낱말 고르기 (길을 [물었다/무렀다], 병이 [나은/낳은] 뒤)',
    officialAnswer: '물었다 / 나은',
    wrongExample: '무렀다 / 낳은',
    note: '기초문해 1단계 (B1~B5)'
  },
  B2: {
    part: 'Part B-1 (기초문해 1단계)',
    type: 'TEXT (숫자입력)',
    summary: '[B2] 간이영수증에서 발행 연도(작성 연도) 찾기',
    officialAnswer: '2023',
    wrongExample: '2022',
    note: '기초문해 1단계 (B1~B5)'
  },
  B3: {
    part: 'Part B-1 (기초문해 1단계)',
    type: 'TEXT (3칸 입력)',
    summary: '[B3] 메모를 보고 무통장 입금의뢰서 작성 (받는 사람 / 계좌번호 / 은행명)',
    officialAnswer: '김명호 / 123-4567-890 / 대한은행',
    wrongExample: '홍길동 / 111-2222-333 / 국민은행',
    note: '기초문해 1단계 (B1~B5)'
  },
  B4: {
    part: 'Part B-1 (기초문해 1단계)',
    type: 'TEXT (숫자입력)',
    summary: '[B4] 5,000원짜리 물건 3개를 사고 지불해야 할 총 금액 계산',
    officialAnswer: '15000',
    wrongExample: '12000',
    note: '기초문해 1단계 (B1~B5)'
  },
  B5: {
    part: 'Part B-1 (기초문해 1단계)',
    type: 'TEXT (2칸 숫자)',
    summary: '[B5] 달력을 보고 둘째 주 수요일 날짜(월 / 일) 찾기',
    officialAnswer: '11 / 12',
    wrongExample: '10 / 15',
    note: 'END_B1 채점 (B1~B5 5문항 만점 시 B6~B20 자동 스킵 ➔ Part C 직행)'
  },
  B6: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (단답입력)',
    summary: '[B6] 재난 안전 안내문에서 설명하는 자연재해 이름 쓰기',
    officialAnswer: '산사태',
    wrongExample: '홍수',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B7: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B7] 안내문 내용과 일치하는 설명 고르기',
    officialAnswer: '3',
    wrongExample: '1',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B8: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (단답입력)',
    summary: '[B8] 영수증 내역에서 가장 비싼 품목 이름 쓰기',
    officialAnswer: '맥주',
    wrongExample: '과자',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B9: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (단답입력)',
    summary: '[B9] 과일 가게 가격표에서 할인 폭이 가장 큰 과일 찾기',
    officialAnswer: '사과',
    wrongExample: '배',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B10: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B10] 약 복용법 안내문을 보고 올바른 복용 방법 고르기',
    officialAnswer: '3',
    wrongExample: '1',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B11: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (숫자입력)',
    summary: '[B11] 열차 시간표를 보고 소요 시간(또는 출발 시각) 찾기',
    officialAnswer: '13',
    wrongExample: '11',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B12: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B12] 그래프에서 수치가 두 번째로 높은 항목 고르기',
    officialAnswer: '2',
    wrongExample: '4',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B13: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (단답입력)',
    summary: '[B13] 경주 관광 안내도를 보고 설명에 해당하는 유적지 이름 쓰기',
    officialAnswer: '첨성대',
    wrongExample: '불국사',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B14: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B14] 생활 안내문 내용 파악 객관식 문항',
    officialAnswer: '4',
    wrongExample: '2',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B15: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (2칸 단답)',
    summary: '[B15] 문맥에 알맞은 낱말 채우기 (회사 / 많이)',
    officialAnswer: '회사 / 많이',
    wrongExample: '학교 / 조금',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B16: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B16] 공고문을 읽고 해당하지 않는 사항 고르기',
    officialAnswer: '4',
    wrongExample: '1',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B17: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (단답입력)',
    summary: '[B17] 등산로 코스 안내표에서 가장 긴 탐방로 구간 이름 쓰기',
    officialAnswer: '뱀사골',
    wrongExample: '노고단',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B18: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (소수입력)',
    summary: '[B18] 식품 영양성분표에서 나트륨/당류 비율 또는 수치 읽기',
    officialAnswer: '7.5',
    wrongExample: '5.5',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B19: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'TEXT (음수입력)',
    summary: '[B19] 냉동식품 보관 적정 온도(영하 온도) 숫자로 쓰기',
    officialAnswer: '-18',
    wrongExample: '-10',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  B20: {
    part: 'Part B-2 (기초문해 2단계)',
    type: 'RADIO (4지선다)',
    summary: '[B20] 공공시설 이용 수칙 안내문 이해 문항',
    officialAnswer: '4',
    wrongExample: '2',
    note: 'B1~B5 만점 시 출제 생략(자동 통과)'
  },
  C1: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C1] 체육시설 일일 자유수영 이용요금표에서 성인 1회 이용료 고르기 (1번: 3,000원)',
    officialAnswer: '1',
    wrongExample: '2',
    note: '심화문해 1번'
  },
  C2: {
    part: 'Part C (심화문해)',
    type: 'TEXT (단답입력)',
    summary: '[C2] 국가암검진 안내문에서 만 40세 이상 2년마다 받는 검진 부위 쓰기',
    officialAnswer: '위',
    wrongExample: '간',
    note: '심화문해 2번'
  },
  C3: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C3] 국가암검진 안내문을 보고 조건에 맞는 검진 대상자 고르기',
    officialAnswer: '4',
    wrongExample: '1',
    note: '심화문해 3번'
  },
  C4: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C4] 세탁기 취급주의 표시 기호의 의미 고르기',
    officialAnswer: '2',
    wrongExample: '3',
    note: '심화문해 4번'
  },
  C5: {
    part: 'Part C (심화문해)',
    type: 'TEXT (숫자입력)',
    summary: '[C5] 주차장 요금표를 보고 2시간 30분 주차 시 요금 계산 (원)',
    officialAnswer: '4000',
    wrongExample: '3000',
    note: '심화문해 5번'
  },
  C6: {
    part: 'Part C (심화문해)',
    type: 'TEXT (2칸 숫자)',
    summary: '[C6] 도서관 대출 규정 안내문을 보고 반납 예정 날짜(월 / 일) 계산',
    officialAnswer: '12 / 17',
    wrongExample: '12 / 15',
    note: '심화문해 6번'
  },
  C7: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C7] 근로계약서 조항을 읽고 일치하는 내용 고르기',
    officialAnswer: '1',
    wrongExample: '3',
    note: '심화문해 7번'
  },
  C8: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C8] 보이스피싱 예방 안내문 핵심 취지 고르기',
    officialAnswer: '3',
    wrongExample: '1',
    note: '심화문해 8번'
  },
  C9: {
    part: 'Part C (심화문해)',
    type: 'TEXT (숫자입력)',
    summary: '[C9] 할인 쿠폰 적용 후 최종 결제 금액 계산 (원)',
    officialAnswer: '3300',
    wrongExample: '3000',
    note: '심화문해 9번'
  },
  C10: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C10] 전기요금 청구서 그래프 분석 문항',
    officialAnswer: '1',
    wrongExample: '2',
    note: '심화문해 10번'
  },
  C11: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C11] 주민참여예산 공고문 신청 자격 및 방법 이해',
    officialAnswer: '3',
    wrongExample: '1',
    note: '심화문해 11번'
  },
  C12: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C12] 소비자 환불 규정 표 해석 문항',
    officialAnswer: '3',
    wrongExample: '2',
    note: '심화문해 12번'
  },
  C13: {
    part: 'Part C (심화문해)',
    type: 'TEXT (숫자입력)',
    summary: '[C13] 열차/버스 노선별 거리 및 소요시간 합산 계산',
    officialAnswer: '177',
    wrongExample: '18',
    note: '심화문해 13번'
  },
  C14: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C14] 건강검진 결과표 수치 판독 및 관리 방법 고르기',
    officialAnswer: '2',
    wrongExample: '4',
    note: '심화문해 14번'
  },
  C15: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C15] 신문 기사 칼럼의 중심 주장 파악하기',
    officialAnswer: '2',
    wrongExample: '1',
    note: '심화문해 15번'
  },
  C16: {
    part: 'Part C (심화문해)',
    type: 'TEXT (숫자입력)',
    summary: '[C16] 약품 복용량 계산 (체중 비례 1일 복용 ml 수)',
    officialAnswer: '5',
    wrongExample: '4',
    note: '심화문해 16번'
  },
  C17: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C17] 연령별 독서율 통계 도표 해석 문항',
    officialAnswer: '4',
    wrongExample: '2',
    note: '심화문해 17번'
  },
  C18: {
    part: 'Part C (심화문해)',
    type: 'TEXT (숫자입력)',
    summary: '[C18] 1년 정기예금 만기 시 세전 이자 포함 수령액(또는 총이자) 계산',
    officialAnswer: '276000',
    wrongExample: '270000',
    note: '심화문해 18번'
  },
  C19: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C19] 임대차 계약 안내문에서 임차인의 권리 설명 고르기',
    officialAnswer: '4',
    wrongExample: '1',
    note: '심화문해 19번'
  },
  C20: {
    part: 'Part C (심화문해)',
    type: 'RADIO (4지선다)',
    summary: '[C20] 국제 환경 협약 관련 시사 지문 독해 문항',
    officialAnswer: '3',
    wrongExample: '2',
    note: '심화문해 20번 (END_C 채점 후 Part D 진입 시 자동 정지)'
  }
};

export const PART_A_TO_C_QUESTION_ORDER = [
  'A1', 'A1_2', 'A2', 'A3',
  'B1', 'B2', 'B3', 'B4', 'B5',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'
];

function autoFitColumns(rows, minWidth = 10, maxWidth = 65) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(key => {
    let maxLen = Array.from(String(key)).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0) + 2;
    for (const r of rows) {
      const val = String(r[key] ?? '');
      const len = Array.from(val).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0);
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, minWidth), maxWidth) };
  });
}

export function normalizeSubmittedAnswersList(item = {}) {
  const raw = item.submittedAnswers || item.submittedAnswersMap;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(a => {
      const code = a.questionCode || a.qCode || '';
      const meta = LITERACY_QUESTION_META[code] || {};
      const isOk = a.isCorrect !== false && String(a.isCorrect) !== 'X';
      return {
        questionCode: code,
        part: a.part || meta.part || '기타 파트',
        questionType: a.questionType || meta.type || '',
        questionSummary: a.questionSummary || meta.summary || code,
        officialAnswer: a.officialAnswer || meta.officialAnswer || '-',
        submittedAnswer: a.submittedAnswer ?? a.answerText ?? '-',
        isCorrect: isOk,
        isCorrectLabel: a.isCorrectLabel || (isOk ? 'O (정답)' : 'X (목표점수 조절용 오답)'),
        answeredAt: a.answeredAt || a.timestamp || item.pilotCompletedAt || item.completedAt || ''
      };
    });
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([k, a]) => {
      const code = a.questionCode || a.qCode || k;
      const meta = LITERACY_QUESTION_META[code] || {};
      const isOk = a.isCorrect !== false && String(a.isCorrect) !== 'X';
      return {
        questionCode: code,
        part: a.part || meta.part || '기타 파트',
        questionType: a.questionType || meta.type || '',
        questionSummary: a.questionSummary || meta.summary || code,
        officialAnswer: a.officialAnswer || meta.officialAnswer || '-',
        submittedAnswer: a.submittedAnswer ?? a.answerText ?? '-',
        isCorrect: isOk,
        isCorrectLabel: a.isCorrectLabel || (isOk ? 'O (정답)' : 'X (목표점수 조절용 오답)'),
        answeredAt: a.answeredAt || a.timestamp || item.pilotCompletedAt || item.completedAt || ''
      };
    });
  }
  return [];
}

export const GLOBALRI_SHEET_QUESTION_COLS = [
  { col: 'a01', code: 'A1_2' },
  { col: 'a02', code: 'A2' },
  { col: 'a03', code: 'A3' },
  { col: 'b01', code: 'B1' },
  { col: 'b02', code: 'B2' },
  { col: 'b03', code: 'B3' },
  { col: 'b04', code: 'B4' },
  { col: 'b05', code: 'B5' },
  { col: 'c02', code: 'C2' },
  { col: 'c05', code: 'C5' },
  { col: 'c06', code: 'C6' },
  { col: 'c09', code: 'C9' },
  { col: 'c13', code: 'C13' },
  { col: 'c16', code: 'C16' },
  { col: 'c18', code: 'C18' }
];

function cleanPureAnswer(val = '') {
  return String(val || '')
    .replace(/\s*\(O:\s*제대로\s*읽음\)\s*/g, '')
    .replace(/\s*\(X:\s*읽지\s*못함\)\s*/g, '')
    .replace(/\s*\(목표점수\s*조절용\s*오답\)\s*/g, '')
    .replace(/\s*\[정답\]\s*/g, '')
    .replace(/\s*\[오답조절\]\s*/g, '')
    .trim();
}

export const SEOLMOON_LITERACY_ACCESS_KEY = 'ec861a8d92844eac8836';
export const SEOLMOON_LITERACY_SNUM = 5963;

/**
 * seolmoon.com 서버(Join/GetSurvey)에서 특정 가구원(memberUid)의 실제 저장된 응답(ANSWER.DATA)과 채점결과를 직접 조회
 */
export async function fetchSeolmoonMemberAnswers(memberUid) {
  const uid = String(memberUid || '').trim();
  if (!uid) return null;

  try {
    const r1 = await fetch('https://seolmoon.com/CheckAccessKey', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: `ACCESS_KEY=${encodeURIComponent(SEOLMOON_LITERACY_ACCESS_KEY)}&UID=${encodeURIComponent(uid)}&ME=1&GN=_BASE`
    });
    if (!r1.ok) return null;

    const cookies = r1.headers.getSetCookie
      ? r1.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
      : (r1.headers.get('set-cookie') || '').split(';')[0];
    const txt1 = await r1.text();
    const json1 = JSON.parse(txt1.replace(/^\(|\);?\s*$/g, ''));
    if (!json1 || !json1.JOIN_TOKEN) return null;

    const bodyParams = new URLSearchParams({
      NOT_USE_CLOUD_QUESTION: 'N',
      TEST: 'false',
      GETS: JSON.stringify({
        ACCESS_KEY: SEOLMOON_LITERACY_ACCESS_KEY,
        UID: uid,
        ME: '1',
        GN: '_BASE',
        SNUM: SEOLMOON_LITERACY_SNUM
      }),
      JOIN_TOKEN: json1.JOIN_TOKEN,
      SNUM: String(json1.JOIN_SNUM || SEOLMOON_LITERACY_SNUM),
      UID: json1.JOIN_UID || uid,
      UID_ENC: json1.JOIN_UID_ENC || ''
    });

    const r2 = await fetch('https://seolmoon.com/Join/GetSurvey', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {})
      },
      body: bodyParams.toString()
    });
    if (!r2.ok) return null;

    const txt2 = await r2.text();
    const m = txt2.match(/result:"([^"]+)"/);
    if (!m) return null;

    const inner = JSON.parse(decodeURIComponent(m[1]));
    const ans = inner?.ANSWER || {};
    const dataArr = Array.isArray(ans.DATA) ? ans.DATA : [];
    const byName = {};
    for (const d of dataArr) {
      if (d && d.NAME) {
        byName[d.NAME] = d;
      }
    }

    const endA = byName.END_A || {};
    const endB1 = byName.END_B1 || {};
    const endB = byName.END_B || {};
    const endC = byName.END_C || {};

    const gradeSummary = {};
    if (endA.MATCH_COUNT !== undefined) {
      gradeSummary.partA = `${endA.MATCH_COUNT} / ${endA.TOTAL_COUNT || 3}`;
    }
    if (endB1.MATCH_COUNT !== undefined) {
      gradeSummary.partB1 = `${endB1.MATCH_COUNT} / ${endB1.TOTAL_COUNT || 5} (B6~B20 스킵)`;
    }
    if (endB.MATCH_COUNT !== undefined) {
      gradeSummary.partB2 = `${endB.MATCH_COUNT} / ${endB.TOTAL_COUNT || 15}`;
    }
    if (endC.MATCH_COUNT !== undefined) {
      gradeSummary.partC = `${endC.MATCH_COUNT} / ${endC.TOTAL_COUNT || 20}`;
    }

    const extractRawAnswer = (qCode) => {
      const d = byName[qCode];
      if (!d) return null;
      if (qCode === 'A1') {
        return `음성녹음 업로드 (STT: ${d.TEXT1 || '문화회관 노래교실'})`;
      }
      if (d['1'] !== undefined && d['1'] !== '') return String(d['1']);
      if (d.DOSE_ML !== undefined && d.DOSE_ML !== '') return String(d.DOSE_ML);
      const t = [d.TEXT_1, d.TEXT_2, d.TEXT_3].filter(v => v !== undefined && v !== '');
      if (t.length > 0) return t.join(' / ');
      const n = [d.NUMBER_1, d.NUMBER_2, d.NUMBER_3].filter(v => v !== undefined && v !== '');
      if (n.length > 0) return n.join(' / ');
      return null;
    };

    const isQuestionCorrect = (qCode, submittedVal) => {
      if (qCode === 'A1') return true;
      if (qCode === 'A1_2') return String(submittedVal).startsWith('1');
      const corrKey = `${qCode}_CORRECT`;
      if (endA[corrKey]) return endA[corrKey] === 'Y';
      if (endB1[corrKey]) return endB1[corrKey] === 'Y';
      if (endB[corrKey]) return endB[corrKey] === 'Y';
      if (endC[corrKey]) return endC[corrKey] === 'Y';
      const meta = LITERACY_QUESTION_META[qCode];
      if (meta && meta.officialAnswer) {
        return cleanPureAnswer(submittedVal) === cleanPureAnswer(meta.officialAnswer);
      }
      return true;
    };

    const submittedAnswers = [];
    for (const qCode of PART_A_TO_C_QUESTION_ORDER) {
      const val = extractRawAnswer(qCode);
      if (val === null) continue;
      const d = byName[qCode] || {};
      const meta = LITERACY_QUESTION_META[qCode] || {};
      const isOk = isQuestionCorrect(qCode, val);
      submittedAnswers.push({
        questionCode: qCode,
        part: meta.part || (qCode.startsWith('A') ? 'Part A (선별문항)' : (qCode.startsWith('B') ? 'Part B (기초문해)' : 'Part C (심화문해)')),
        questionType: meta.type || '',
        questionSummary: meta.summary || qCode,
        officialAnswer: meta.officialAnswer || '-',
        submittedAnswer: val,
        isCorrect: isOk,
        isCorrectLabel: isOk ? 'O (정답)' : 'X (목표점수 조절용 오답)',
        answeredAt: d.DT || ans.LAST_DT || ''
      });
    }

    const lastQ = String(ans.LAST_QUESTION || '');
    const isCompleted = (ans.COMPLETE === 'COMPLETE' || lastQ === 'COMPLETE');
    const isStoppedAtF05 = (!isCompleted && (lastQ === 'F05_1' || lastQ === 'F05_2' || Boolean(byName.F05_1)));
    const isPartCDone = (!isCompleted && !isStoppedAtF05 && (Boolean(byName.END_C) || /^(D|E|F|DESC_D|DESC_E|DESC_F)/.test(lastQ)));

    return {
      memberUid: uid,
      submittedAnswers,
      gradeSummary,
      isCompleted,
      isStoppedAtF05,
      isPartCDone,
      lastQuestion: lastQ,
      lastDt: ans.LAST_DT || ans.COMPLETE_DT || ''
    };
  } catch (err) {
    console.warn(`[seolmoon 응답 조회 경고] (${uid}): ${err.message}`);
    return null;
  }
}

/**
 * 캠페인/쿼터 리스트의 응답자들에 대해 seolmoon.com 서버의 실제 저장 답변 및 진행상태를 동기화하고 원본 JSON에 영구 반영
 */
export async function syncGlobalriQuotaAnswersFromSeolmoon({
  quotaDatabase = [],
  quotaJsonPath = null,
  forceRefresh = false
} = {}) {
  const defaultJsonPath = quotaJsonPath || path.resolve(process.cwd(), 'data', 'quotas', 'quota_globalri_adult_literacy_7791.json');

  // 1) 원본 쿼터 JSON 파일에 저장된 기존 답변이 있으면 1차 병합
  if (fs.existsSync(defaultJsonPath)) {
    try {
      const fileObj = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf-8'));
      const fileRows = Array.isArray(fileObj.data) ? fileObj.data : [];
      const fileByUid = new Map();
      fileRows.forEach(r => {
        const k = String(r.memberUid || r.uid || '').trim();
        if (k) fileByUid.set(k, r);
      });
      for (const item of quotaDatabase) {
        const k = String(item.memberUid || item.uid || '').trim();
        const saved = fileByUid.get(k);
        if (saved) {
          if ((!Array.isArray(item.submittedAnswers) || item.submittedAnswers.length === 0) && Array.isArray(saved.submittedAnswers) && saved.submittedAnswers.length > 0) {
            item.submittedAnswers = saved.submittedAnswers;
          }
          if (!item.gradeSummary && saved.gradeSummary) {
            item.gradeSummary = saved.gradeSummary;
          }
        }
      }
    } catch (readErr) {
      console.warn(`[쿼터 JSON 병합 읽기 경고] ${readErr.message}`);
    }
  }

  // 2) submittedAnswers가 비어 있거나 forceRefresh인 대상자들을 seolmoon.com에서 병렬(6개 단위) 실시간 조회
  const targets = quotaDatabase.filter(item => {
    if (forceRefresh) return true;
    const ans = normalizeSubmittedAnswersList(item);
    return ans.length < 15;
  });

  const batchSize = 6;
  let updatedCount = 0;
  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(item => fetchSeolmoonMemberAnswers(item.memberUid || item.uid))
    );
    results.forEach((res, idx) => {
      if (!res) return;
      const item = chunk[idx];
      if (Array.isArray(res.submittedAnswers) && res.submittedAnswers.length > 0) {
        item.submittedAnswers = res.submittedAnswers;
        updatedCount++;
      }
      if (res.gradeSummary && Object.keys(res.gradeSummary).length > 0) {
        item.gradeSummary = { ...(item.gradeSummary || {}), ...res.gradeSummary };
      }
      if (res.isCompleted) {
        item.quotaStatus = 'completed';
        item.status = '완료';
        item.memberStatus = '완료';
        item.progress = '100%';
        item.surveyCompleted = '완료';
        item.completedAt = item.completedAt || res.lastDt || new Date().toISOString();
      } else if (res.isStoppedAtF05) {
        item.quotaStatus = 'pilot_done';
        item.status = '검증대기(F05_2)';
        item.memberStatus = '검증대기(F05_2)';
        item.progress = '98% (제출직전)';
        item.surveyCompleted = '대기';
        item.pilotCompletedAt = item.pilotCompletedAt || res.lastDt || new Date().toISOString();
      } else if (res.isPartCDone) {
        item.quotaStatus = 'pilot_done';
        item.status = 'Part C 완료 (수기대기)';
        item.memberStatus = 'Part C 완료 (수기대기)';
        item.progress = `Part C 완료 (채점 ${res.gradeSummary?.partC || '완료'})`;
        item.surveyCompleted = '대기';
        item.pilotCompletedAt = item.pilotCompletedAt || res.lastDt || new Date().toISOString();
      }
    });
  }

  // 3) 원본 쿼터 JSON 파일에 최신 상태 영구 저장
  persistGlobalriQuotaDatabase({ quotaDatabase, quotaJsonPath: defaultJsonPath });

  return { updatedCount, totalCount: quotaDatabase.length, quotaDatabase };
}

/**
 * 캠페인 내 quotaDatabase의 submittedAnswers 및 상태를 원본 쿼터 JSON 파일에 양방향 동기화 저장
 */
export function persistGlobalriQuotaDatabase({
  quotaDatabase = [],
  quotaJsonPath = null
} = {}) {
  const targetPath = quotaJsonPath || path.resolve(process.cwd(), 'data', 'quotas', 'quota_globalri_adult_literacy_7791.json');
  if (!fs.existsSync(targetPath) || !Array.isArray(quotaDatabase) || quotaDatabase.length === 0) {
    return false;
  }
  try {
    const fileObj = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    const existingRows = Array.isArray(fileObj.data) ? fileObj.data : [];
    const incomingByUid = new Map();
    quotaDatabase.forEach(item => {
      const k = String(item.memberUid || item.uid || '').trim();
      if (k) incomingByUid.set(k, item);
    });

    fileObj.data = existingRows.map((row, idx) => {
      const k = String(row.memberUid || row.uid || '').trim();
      const inc = incomingByUid.get(k);
      if (!inc) return row;
      return {
        ...row,
        ...inc,
        index: row.index || inc.index || (idx + 1),
        seq: row.seq || inc.seq || (idx + 1),
        submittedAnswers: (Array.isArray(inc.submittedAnswers) && inc.submittedAnswers.length > 0)
          ? inc.submittedAnswers
          : (row.submittedAnswers || []),
        gradeSummary: inc.gradeSummary || row.gradeSummary || null
      };
    });
    fileObj.updatedAt = new Date().toISOString();
    fs.writeFileSync(targetPath, JSON.stringify(fileObj, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[원본 쿼터 JSON 저장 경고] ${err.message}`);
    return false;
  }
}

export function buildGlobalriSheetsData({ quotaDatabase = [] }) {
  const summaryRows = quotaDatabase.map(item => {
    const ansList = normalizeSubmittedAnswersList(item);
    const ansMap = {};
    ansList.forEach(a => {
      ansMap[a.questionCode] = a;
    });

    const row = {
      'LID': String(item.lid || ''),
      '성명': item.memberName || item.respondentName || item.ceoName || ''
    };

    GLOBALRI_SHEET_QUESTION_COLS.forEach(({ col, code }) => {
      const a = ansMap[code];
      row[col] = a ? cleanPureAnswer(a.submittedAnswer) : '';
    });

    return row;
  });

  return { summaryRows, detailRows: summaryRows, refRows: summaryRows };
}

/**
 * 캠페인 쿼터 DB를 기반으로 응답자별 제출 문항·답변 Excel(.xlsx) 생성 및 저장
 */
export function buildGlobalriAnswersExcel({ quotaDatabase = [], filePath = null }) {
  const wb = XLSX.utils.book_new();
  const { summaryRows } = buildGlobalriSheetsData({ quotaDatabase });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = autoFitColumns(summaryRows, 10, 36);
  XLSX.utils.book_append_sheet(wb, wsSummary, '시트1');

  if (filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    XLSX.writeFile(wb, filePath);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function resolveChromiumLaunchOptions() {
  const opts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  };
  try {
    const defaultExe = chromium.executablePath();
    if (defaultExe && fs.existsSync(defaultExe)) {
      return opts;
    }
  } catch (_) {}

  const systemCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];
  for (const cand of systemCandidates) {
    if (fs.existsSync(cand)) {
      opts.executablePath = cand;
      break;
    }
  }
  return opts;
}

// 배치 실행 중 다중 브라우저가 동시에 구글 시트를 열지 못하도록 직렬화 큐(Mutex) 적용
let googleSheetSyncQueue = Promise.resolve();

export function syncGlobalriAnswersToGoogleSheet(options = {}) {
  const runTask = async () => {
    return await _syncGlobalriAnswersToGoogleSheetImpl(options);
  };
  const nextPromise = googleSheetSyncQueue.then(runTask, runTask);
  googleSheetSyncQueue = nextPromise.catch(err => {
    console.warn(`[구글 시트 동기화 큐 경고] ${err.message}`);
  });
  return nextPromise;
}

async function _syncGlobalriAnswersToGoogleSheetImpl({
  quotaDatabase = [],
  sheetUrl = GLOBALRI_DEFAULT_GSHEET_URL,
  quotaJsonPath = null,
  pullFromSeolmoon = true
} = {}) {
  // 1) seolmoon.com 실시간 응답 및 원본 JSON 병합을 먼저 수행하여 빈 답변 덮어쓰기 원천 차단
  if (pullFromSeolmoon && Array.isArray(quotaDatabase) && quotaDatabase.length > 0) {
    await syncGlobalriQuotaAnswersFromSeolmoon({
      quotaDatabase,
      quotaJsonPath,
      forceRefresh: false
    });
  } else if (Array.isArray(quotaDatabase) && quotaDatabase.length > 0) {
    persistGlobalriQuotaDatabase({ quotaDatabase, quotaJsonPath });
  }

  const { summaryRows } = buildGlobalriSheetsData({ quotaDatabase });
  function rowsToTsvLines(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = Object.keys(rows[0]);
    const lines = [headers.join('\t')];
    for (const r of rows) {
      lines.push(headers.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'));
    }
    return lines;
  }

  const allLines = rowsToTsvLines(summaryRows);
  const fullTsv = allLines.join('\n');
  const populatedRowCount = summaryRows.filter(r => r.a01 || r.a02 || r.c18).length;

  const browser = await chromium.launch(resolveChromiumLaunchOptions());
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4500);

    // 팝업/배너 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 이름 상자(#t-name-box)를 통해 정확히 A1 셀로 이동
    const focusCellA1 = async () => {
      const nameBox = page.locator('#t-name-box, .waffle-name-box');
      if ((await nameBox.count()) > 0) {
        await nameBox.first().click({ timeout: 3000 }).catch(err => console.warn(`이름상자 클릭 경고: ${err.message}`));
        await page.waitForTimeout(150);
        await page.keyboard.press('Control+A');
        await page.keyboard.type('A1');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(450);
      } else {
        await page.mouse.click(120, 260);
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+Home');
        await page.waitForTimeout(350);
      }
    };

    await focusCellA1();

    // 기존 시트 전체 선택 후 삭제
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(600);

    // 다시 A1 셀로 정확히 복귀
    await focusCellA1();

    // Google Sheets의 숨겨진 붙여넣기 수신기(.cell-input / activeElement)에 합성 Paste 이벤트 전달
    await page.evaluate(async ({ tsvText }) => {
      try {
        await navigator.clipboard.writeText(tsvText);
      } catch (clipErr) {
        console.warn('클립보드 기록 경고:', clipErr.message);
      }
      const dt = new DataTransfer();
      dt.setData('text/plain', tsvText);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      const target = document.querySelector('.cell-input') || document.activeElement || document.body;
      target.dispatchEvent(pasteEvent);
    }, { tsvText: fullTsv });

    await page.waitForTimeout(5500);
    await browser.close();
    return {
      success: true,
      lineCount: allLines.length,
      populatedRowCount
    };
  } catch (err) {
    await browser.close().catch(closeErr => console.warn(`브라우저 종료 경고: ${closeErr.message}`));
    return { success: false, error: err.message };
  }
}

