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

export async function syncGlobalriAnswersToGoogleSheet({
  quotaDatabase = [],
  sheetUrl = GLOBALRI_DEFAULT_GSHEET_URL
} = {}) {
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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();
    await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4500);

    // Dismiss any initial banner/dialog and focus grid
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.mouse.click(120, 260);
    await page.waitForTimeout(400);

    // Select all cells and clear previous contents
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(600);

    // Return to A1
    await page.keyboard.press('Control+Home');
    await page.waitForTimeout(400);

    await page.evaluate(async (tsvText) => {
      try {
        await navigator.clipboard.writeText(tsvText);
      } catch (_) {}
      const dt = new DataTransfer();
      dt.setData('text/plain', tsvText);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      const active = document.activeElement || document.querySelector('.cell-input') || document.body;
      active.dispatchEvent(pasteEvent);
    }, fullTsv);

    await page.waitForTimeout(1200);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(5000);
    await browser.close();
    return { success: true, lineCount: allLines.length };
  } catch (err) {
    await browser.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

