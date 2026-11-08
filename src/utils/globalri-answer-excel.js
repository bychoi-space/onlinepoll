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

export function buildGlobalriSheetsData({ quotaDatabase = [] }) {
  // 1) 시트 1: 응답자별 제출답변 요약 및 문항 매트릭스 (A1 ~ C20)
  const summaryRows = quotaDatabase.map((item, idx) => {
    const seq = item.index || item.seq || (idx + 1);
    const ansList = normalizeSubmittedAnswersList(item);
    const ansMap = {};
    ansList.forEach(a => {
      ansMap[a.questionCode] = a;
    });

    const grades = item.gradeSummary || {};
    const row = {
      '순번': seq,
      'LID': item.lid || '',
      '가구원UID': item.memberUid || item.uid || '',
      '성명': item.memberName || item.respondentName || item.ceoName || '',
      '성별': item.gender || item.ceoGender || '',
      '출생연도': item.birthYear ? `${item.birthYear}년` : '',
      '만나이': item.age ? `만 ${item.age}세` : '',
      '나이대그룹': item.ageGroupLabel || '',
      '진행상태': item.status || item.quotaStatus || '대기',
      '진행률': item.progress || '',
      'Part A 채점': grades.partA || (ansList.length > 0 ? '3 / 3' : '-'),
      'Part B-1 채점': grades.partB1 || (ansList.length > 0 ? '5 / 5 (B6~B20 스킵)' : '-'),
      'Part C 채점': grades.partC || '-',
      '최근실행일시': item.pilotCompletedAt || item.completedAt || '-'
    };

    PART_A_TO_C_QUESTION_ORDER.forEach(qCode => {
      const a = ansMap[qCode];
      if (a) {
        const cleanVal = String(a.submittedAnswer || '').replace(/\s*\(목표점수 조절용 오답\)\s*/g, '');
        const mark = a.isCorrect === false ? ' [오답조절]' : ' [정답]';
        row[qCode] = `${cleanVal}${qCode === 'A1' ? '' : mark}`;
      } else {
        row[qCode] = '-';
      }
    });

    return row;
  });

  // 2) 시트 2: 문항별 제출답변 상세내역 (실행 완료된 응답자의 전 문항 로그)
  const detailRows = [];
  quotaDatabase.forEach((item, idx) => {
    const seq = item.index || item.seq || (idx + 1);
    const ansList = normalizeSubmittedAnswersList(item);
    ansList.forEach((a, aIdx) => {
      const meta = LITERACY_QUESTION_META[a.questionCode] || {};
      detailRows.push({
        '응답자순번': `#${seq}`,
        'LID': item.lid || '',
        '가구원UID': item.memberUid || item.uid || '',
        '성명': item.memberName || item.respondentName || item.ceoName || '',
        '성별': item.gender || item.ceoGender || '',
        '출생연도(나이)': `${item.birthYear || ''}년생 (만 ${item.age || ''}세)`,
        '나이대그룹': item.ageGroupLabel || '',
        '문항순서': aIdx + 1,
        '파트구분': a.part || meta.part || '기타 파트',
        '문항코드': a.questionCode,
        '문항유형': a.questionType || meta.type || '',
        '문항내용 및 지문 요약': a.questionSummary || meta.summary || a.questionCode,
        '공식 정답': a.officialAnswer || meta.officialAnswer || '-',
        '제출(입력)한 답변': a.submittedAnswer,
        '정오답 판정': a.isCorrectLabel,
        '제출일시': a.answeredAt || item.pilotCompletedAt || item.completedAt || ''
      });
    });
  });

  if (detailRows.length === 0) {
    detailRows.push({
      '응답자순번': '-',
      'LID': '-',
      '가구원UID': '-',
      '성명': '아직 실행된 응답자가 없습니다',
      '성별': '-',
      '출생연도(나이)': '-',
      '나이대그룹': '-',
      '문항순서': '-',
      '파트구분': '-',
      '문항코드': '-',
      '문항유형': '-',
      '문항내용 및 지문 요약': '파일럿 또는 배치 실행 시 문항별 제출 답변이 이 시트에 자동으로 기록됩니다.',
      '공식 정답': '-',
      '제출(입력)한 답변': '-',
      '정오답 판정': '-',
      '제출일시': '-'
    });
  }

  // 3) 시트 3: Part A ~ Part C 전문항(43문항) 공식 정답 참조표
  const refRows = Object.entries(LITERACY_QUESTION_META).map(([code, meta], idx) => ({
    'No': idx + 1,
    '파트구분': meta.part,
    '문항코드': code,
    '문항유형': meta.type,
    '문제 지문 및 평가 내용 요약': meta.summary,
    '공식 정답': meta.officialAnswer,
    '점수조절용 오답 예시': meta.wrongExample,
    '채점 및 분기 비고': meta.note
  }));

  return { summaryRows, detailRows, refRows };
}

/**
 * 캠페인 쿼터 DB를 기반으로 응답자별 제출 문항·답변 Excel(.xlsx) 생성 및 저장
 */
export function buildGlobalriAnswersExcel({ quotaDatabase = [], filePath = null }) {
  const wb = XLSX.utils.book_new();
  const { summaryRows, detailRows, refRows } = buildGlobalriSheetsData({ quotaDatabase });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = autoFitColumns(summaryRows, 10, 42);
  XLSX.utils.book_append_sheet(wb, wsSummary, '1_응답자별_문항답변_현황');

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail['!cols'] = autoFitColumns(detailRows, 10, 62);
  XLSX.utils.book_append_sheet(wb, wsDetail, '2_문항별_제출답변_상세내역');

  const wsRef = XLSX.utils.json_to_sheet(refRows);
  wsRef['!cols'] = autoFitColumns(refRows, 10, 65);
  XLSX.utils.book_append_sheet(wb, wsRef, '3_전문항_공식정답표(PartA_C)');

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
  const { summaryRows, detailRows, refRows } = buildGlobalriSheetsData({ quotaDatabase });
  function rowsToTsvLines(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = Object.keys(rows[0]);
    const lines = [headers.join('\t')];
    for (const r of rows) {
      lines.push(headers.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'));
    }
    return lines;
  }

  const allLines = [
    ['■ [1] 제5차 성인문해능력조사 (노영미7791) — 응답자별 진행현황 및 문항별(A1~C20) 제출 답변 요약 매트릭스'].join('\t'),
    ...rowsToTsvLines(summaryRows),
    '',
    ['■ [2] 실행 완료 응답자 문항별 제출 답변 및 채점 상세내역 (Part A ~ Part C 전수 기록)'].join('\t'),
    ...rowsToTsvLines(detailRows),
    '',
    ['■ [3] 제5차 성인문해능력조사 Part A ~ Part C 전 문항(43문항) 공식 정답 및 지문 요약 참조표'].join('\t'),
    ...rowsToTsvLines(refRows)
  ];
  const fullTsv = allLines.join('\n');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();
    await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const nameBox = page.locator('#t-name-box, .waffle-name-box');
    if ((await nameBox.count()) > 0) {
      await nameBox.first().click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('A1');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    } else {
      await page.mouse.click(100, 240);
      await page.waitForTimeout(400);
    }

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
    await page.waitForTimeout(4500);
    await browser.close();
    return { success: true, lineCount: allLines.length };
  } catch (err) {
    await browser.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

