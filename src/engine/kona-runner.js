/**
 * 코나체인 리서치플랫폼 (voting.konachain.co.kr)
 * '2026 화성특례시 만족도 청소년 설문조사' 전용 무결점 실행 엔진 (kona-runner.js)
 *
 * - 기존 Kstat 점포/상인회 및 Metrix 패널 엔진과 100% 분리된 독립 모듈입니다.
 * - 매 실행마다 클린 브라우저 컨텍스트를 생성하여 무슬롯(Slotless) 단일 URL 설문을 수행합니다.
 * - 모든 문항 입력 후 [제출하기] 직전에 전체 화면 스크린샷 및 하단 IDX 확인 스크린샷을 필수 저장합니다.
 */
import fs from 'fs';
import path from 'path';
import { launchChromium } from '../utils/chromium-launcher.js';

const DONG_OPTIONS = [
  '동탄1동', '동탄2동', '동탄3동', '동탄4동', '동탄5동',
  '동탄6동', '동탄7동', '동탄8동', '동탄9동'
];

const SHORT_WISH_PHRASES = [
  '체육시설 확충',
  '버스 배차 증차',
  '청소년 쉼터 확대',
  '도서관 좌석 확충',
  '자전거 도로 정비',
  '가로등 밝기 개선',
  '문화행사 확대',
  '스터디룸 확충',
  '공원 벤치 확충',
  '풋살장 확충',
  '버스 노선 확대',
  '독서실 확충',
  '산책로 정비',
  '농구장 확충',
  '통학버스 지원'
];

/**
 * 시드 기반 결정론적 난수/선택 헬퍼 (통계 비율 정확도 + 문항 간 무작위 분산 보장)
 */
function createSeededRng(seedNum) {
  let state = (Number(seedNum) || 6001) * 1664525 + 1013904223;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state % 100000) / 100000;
  };
}

function pickRandom(arr, rng) {
  const idx = Math.floor(rng() * arr.length);
  return arr[Math.min(arr.length - 1, Math.max(0, idx))];
}

function pickRangeInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickTwoDistinct(indices, slotSeq, primeA = 7, primeB = 3) {
  const n = indices.length;
  const firstPos = (slotSeq * primeA) % n;
  let secondPos = (firstPos + 1 + ((slotSeq * primeB) % (n - 1))) % n;
  if (secondPos === firstPos) secondPos = (firstPos + 1) % n;
  return [indices[firstPos], indices[secondPos]];
}

/**
 * 엑셀 쿼터 행(slotData)과 사용자 규칙을 바탕으로 53개 전체 아티클 응답 페르소나를 생성합니다.
 */
export function buildKonaYouthPersona(slotData = {}, quotaIndex = 1, policy = {}) {
  const idxStr = String(slotData.idx || slotData.uid || (6000 + quotaIndex)).trim();
  const idxNum = parseInt(idxStr, 10) || (6000 + quotaIndex);
  const slotZero = Math.max(0, idxNum - 6001);
  const rng = createSeededRng(idxNum * 97 + quotaIndex * 31);

  // 1번 문항 (Child 1): 모두 '예' (index 0)
  const q1_resideIdx = 0;

  // 2~4번 문항 (Child 2, 3, 4): 엑셀 데이터 입력
  const q2_age = Math.max(14, Math.min(18, parseInt(slotData.age || slotData.ceoAge || 15, 10)));
  const isFemale = (slotData.gender === '여' || slotData.genderFull === '여자' || slotData.ceoGender === '여자');
  const q3_genderIdx = isFemale ? 1 : 0; // 0: 남자, 1: 여자

  const isHighSchool = (slotData.schoolGrade === '고' || slotData.schoolFull === '고등학생');
  const q4_schoolIdx = isHighSchool ? 1 : 0; // 0: 중학생, 1: 고등학생

  // 5번 문항 (Child 5): 모두 '동탄구' (index 3)
  const q5_districtIdx = 3;

  // ① 5번 하위 (Child 9): 엑셀 데이터 ('동탄1동' ~ '동탄9동')
  const rawDong = String(slotData.dong || slotData.handledItems || '동탄1동').trim();
  const dongFoundIdx = DONG_OPTIONS.indexOf(rawDong);
  const q5_sub_dongIdx = dongFoundIdx >= 0 ? dongFoundIdx : (slotZero % 9);

  // 6번 문항 (Child 10, 거주기간): 전체 랜덤 (0~4)
  const q6_durationIdx = (slotZero * 3 + Math.floor(rng() * 5)) % 5;

  // [연관 규칙 0] 8번 문항(Child 11, 행복정도) & 9번 문항(Child 12, 삶 만족도) ⇄ 10-1~10-5(Child 13, 영역별 행복 점수)
  // - 8번·9번이 높은 점수 그룹(8~9점)이면 ➔ 10-1~10-5도 높은 점수(7~10점)로 동조화
  // - 8번·9번이 보통 점수 그룹(5~7점)이면 ➔ 10-1~10-5도 보통 점수(5~8점)로 동조화
  const isHighHappinessGroup = (rng() < 0.5);
  let q7_score;
  let q8_score;
  let q9_1_health;
  let q9_2_economy;
  let q9_3_friends;
  let q9_4_family;
  let q9_5_school;

  if (isHighHappinessGroup) {
    q7_score = pickRangeInt(8, 9, rng);
    const delta78 = pickRandom([-1, 0, 0, 1], rng);
    q8_score = Math.max(8, Math.min(9, q7_score + delta78));

    q9_1_health = pickRangeInt(8, 10, rng);
    q9_2_economy = pickRangeInt(7, 9, rng);
    q9_3_friends = pickRangeInt(8, 10, rng);
    q9_4_family = pickRangeInt(8, 10, rng);
    q9_5_school = pickRangeInt(8, 10, rng);
  } else {
    q7_score = pickRangeInt(5, 7, rng);
    const delta78 = pickRandom([-1, 0, 0, 1], rng);
    q8_score = Math.max(5, Math.min(7, q7_score + delta78));

    q9_1_health = 8; // 기존 8~10점 규칙 준수하면서 보통 구간 하한(8점) 유지
    q9_2_economy = pickRangeInt(5, 7, rng);
    q9_3_friends = pickRangeInt(6, 7, rng);
    q9_4_family = pickRangeInt(5, 7, rng);
    q9_5_school = (q9_3_friends >= 7) ? 7 : pickRangeInt(5, 6, rng);
  }

  // [연관 규칙 1] 문항 10-4(가정생활, q9_4_family) ⇄ 문항 11(Child 14, 가족 활동 3행):
  // - 10-4 답변이 높은 점수(6~10점)라면 ➔ 문항 11은 3~4번(col 2, 3: 자주 한다 / 항상 한다) 위주로 응답
  // - 10-4 답변이 5점이라면 ➔ 문항 11은 1~2번(col 0, 1: 거의 안한다 / 가끔 한다)으로 응답
  const q10_highGroup = (q9_4_family >= 6);
  const q10_pool = q10_highGroup ? [2, 3] : [0, 1];
  const q10_row1 = pickRandom(q10_pool, rng);
  const q10_row2 = pickRandom(q10_pool, rng);
  const q10_row3 = pickRandom(q10_pool, rng);

  // [연관 규칙 2] 문항 10-3(주위 친구와의 관계, q9_3_friends) ⇄ 문항 12(Child 15, 생각과 가까운 곳 2행 그리드):
  // - 10-3 답변이 7~10 사이라면 ➔ 문항 12는 4~5번(col 3, 4: 대체로 그렇다 / 매우 그렇다)으로 응답
  // - 10-3 답변이 6점이라면 ➔ 문항 12는 3~4번(col 2, 3: 보통이다 / 대체로 그렇다)으로 응답
  const q11_pool = (q9_3_friends >= 7) ? [3, 4] : [2, 3];
  const q11_row1_school = pickRandom(q11_pool, rng);
  const q11_row2_help = pickRandom(q11_pool, rng);

  // 12번 문항 (Child 16 / 화면 표시 13번, 고민 상담 대상):
  // 11번(row2)이 1~2번(col 0, 1)이면 '아무와도 하지 않는다'(index 7)
  // 11번(row2)이 3~5번(col 2, 3, 4)이면 '부모'(0), '형제자매'(1), '친구'(2), '인터넷 SNS AI'(5) 중 랜덤
  // (단, 가족 활동이 1~2번인 경우에는 부모/형제자매 대신 친구/인터넷 SNS AI 중에서 선택하여 개연성 유지)
  const counselPool = q10_highGroup ? [0, 1, 2, 5] : [2, 5];
  const q12_counselIdx = (q11_row2_help <= 1)
    ? 7
    : pickRandom(counselPool, rng);

  // [연관 규칙 2-2] 8번 문항(Child 11, 행복정도 q7_score) ⇄ 14번 문항(Child 17, 일상생활 스트레스 정도):
  // - 8번 행복 정도가 높은 점수(8~10점)라면 ➔ 14번은 '전혀 느끼지 않았다'(0), '느끼지 않았다'(1), '보통이다'(2) 중 선택
  // - 8번 행복 정도가 중간 점수(4~7점)라면 ➔ 14번은 '느끼지 않았다'(1), '보통이다'(2), '조금 느꼈다'(3), '매우 많이 느꼈다'(4) 중 선택
  const q13_stressIdx = (q7_score >= 8)
    ? pickRandom([0, 1, 2], rng)
    : pickRandom([1, 2, 3, 4], rng);

  // ② & ③ 13번 하위 1 (Child 18 / 화면 표시 15번, 스트레스 요인 순서대로 2가지):
  // - '기타'(6) 제외
  // - 문항 10-3(친구와의 관계)이 높은 점수(>= 6)이면 '친구와의 관계'(2) 선택 금지
  // - 문항 10-4(가정생활)가 높은 점수(>= 6)이면 '가족과의 관계'(3) 선택 금지
  // - 문항 10-2(경제적 수준)가 높은 점수(>= 7)이면 '경제적 문제'(5) 선택 지양
  let stressCandidatePool = [0, 1, 2, 3, 4, 5];
  if (q9_3_friends >= 6) {
    stressCandidatePool = stressCandidatePool.filter(idx => idx !== 2);
  }
  if (q9_4_family >= 6) {
    stressCandidatePool = stressCandidatePool.filter(idx => idx !== 3);
  }
  if (q9_2_economy >= 7 && stressCandidatePool.length > 3) {
    stressCandidatePool = stressCandidatePool.filter(idx => idx !== 5);
  }
  const firstStress = pickRandom(stressCandidatePool, rng);
  const secondStressPool = stressCandidatePool.filter(idx => idx !== firstStress);
  const secondStress = pickRandom(secondStressPool, rng);
  const q13_sub1_factors = [firstStress, secondStress];

  // ③ 13번 하위 2 (Child 19 / 화면 표시 16번, 스트레스 해소법): '기타'(8) 제외하고 0~7 중 랜덤
  const q13_sub2_reliefIdx = (slotZero * 5 + Math.floor(rng() * 8)) % 8;

  // 14번 문항 (Child 20 / 화면 표시 17번, 수면 피로 회복 충분 정도): 전체 랜덤 (0~4)
  // [0] 매우 충분하다, [1] 충분하다, [2] 보통이다, [3] 충분하지 않다, [4] 전혀 충분하지 않다
  const q14_sleepEnoughIdx = pickRangeInt(0, 4, rng);

  // [연관 규칙 5] 문항 17(Child 20, 피로회복 충분도) ⇄ 문항 18(Child 21, 주중 평균 수면 시간):
  // - 문항 17에서 '매우 충분하다'(0) 선택 ➔ 문항 18에서 '8시간 이상'(4) 선택
  // - 문항 17에서 '충분하다'(1) 선택 ➔ 문항 18에서 '8시간 이상'(4), '7~8시간 미만'(3) 둘 중에서 선택
  // - 문항 17에서 '보통이다'(2) 선택 ➔ 문항 18에서 '7~8시간 미만'(3), '6~7시간 미만'(2) 둘 중에서 선택
  // - 문항 17에서 '충분하지 않다'(3) 선택 ➔ 문항 18에서 '6~7시간 미만'(2), '5~6시간 미만'(1) 둘 중에서 선택
  // - 문항 17에서 '전혀 충분하지 않다'(4) 선택 ➔ 문항 18에서 '5~6시간 미만'(1), '5시간 미만'(0) 둘 중에서 선택
  let q15_sleepHoursIdx;
  if (q14_sleepEnoughIdx === 0) {
    q15_sleepHoursIdx = 4;
  } else if (q14_sleepEnoughIdx === 1) {
    q15_sleepHoursIdx = pickRandom([3, 4], rng);
  } else if (q14_sleepEnoughIdx === 2) {
    q15_sleepHoursIdx = pickRandom([2, 3], rng);
  } else if (q14_sleepEnoughIdx === 3) {
    q15_sleepHoursIdx = pickRandom([1, 2], rng);
  } else {
    q15_sleepHoursIdx = pickRandom([0, 1], rng);
  }

  // 16번 문항 (Child 22, 운동 일수): 여자는 '없음'(0), '1~2일'(1) 랜덤 / 남자는 '1~2일'(1), '3~4일'(2) 랜덤
  const q16_exerciseIdx = isFemale
    ? pickRandom([0, 1], rng)
    : pickRandom([1, 2], rng);

  // 17번 문항 (Child 23, 여가 활동 최대 2개):
  // 16번을 '3~4일'(index 2) 하는 사람만 '운동'(index 2)에 체크,
  // 나머지는 '친구와 어울리기'(3), '스마트폰·컴퓨터게임·인터넷검색 등'(4), '휴식(수면 등)'(7) 세가지 중에서 랜덤
  let q17_leisureIndices = [];
  if (q16_exerciseIdx === 2) {
    // 운동(2) 필수 체크 + 50% 확률로 [3, 4, 7] 중 1개 추가 선택
    if (rng() < 0.5) {
      q17_leisureIndices = [2, pickRandom([3, 4, 7], rng)];
    } else {
      q17_leisureIndices = [2];
    }
  } else {
    const restPool = [3, 4, 7];
    const firstChoice = pickRandom(restPool, rng);
    if (rng() < 0.5) {
      const secondChoices = restPool.filter(x => x !== firstChoice);
      q17_leisureIndices = [firstChoice, pickRandom(secondChoices, rng)];
    } else {
      q17_leisureIndices = [firstChoice];
    }
  }

  // 18번 문항 (Child 24, 취미·여가 충분 여부): 전체 랜덤 (0~4)
  const q18_hobbyEnoughIdx = pickRangeInt(0, 4, rng);

  // 19번 문항 (Child 25, 문화활동): 없음(9) 70%, 영화(3) 20%, 영화+스포츠(3, 7) 10%
  const bucket19 = (slotZero * 37 + 11) % 100;
  let q19_cultureIndices;
  if (bucket19 < 70) {
    q19_cultureIndices = [9]; // 없음 (단독)
  } else if (bucket19 < 90) {
    q19_cultureIndices = [3]; // 영화
  } else {
    q19_cultureIndices = [3, 7]; // 영화 + 스포츠 경기관람
  }

  // ④/⑤ 19번 하위 (Child 26, 문화생활 만족도 - 19번이 '없음'이 아닐 때 노출): '다소 만족'(3), '매우 만족'(4) 중 랜덤
  const q19_sub_satisfactionIdx = pickRandom([3, 4], rng);

  // ⑥ 20번 문항 (Child 27, 화성시 축제): 없음(6) 70%, 정조효+루나빛(1, 4) 20%, 정조효(1) 5%, 루나빛(4) 5%
  const bucket20 = (slotZero * 43 + 17) % 100;
  let q20_festivalIndices;
  if (bucket20 < 70) {
    q20_festivalIndices = [6]; // 없음 (단독)
  } else if (bucket20 < 90) {
    q20_festivalIndices = [1, 4]; // 정조효문화제 + 화성 루나 빛 축제 동시 체크
  } else if (bucket20 < 95) {
    q20_festivalIndices = [1]; // 정조효문화제 단독
  } else {
    q20_festivalIndices = [4]; // 화성 루나 빛 축제 단독
  }

  // ⑥ 20번 하위 (Child 28, 축제 만족도 - 20번이 '없음'이 아닐 때 노출): '다소 만족'(3), '매우 만족'(4) 중 랜덤
  const q20_sub_satisfactionIdx = pickRandom([3, 4], rng);

  // 21번 문항 (Child 29 / 화면 표시 23·24번, 공원·녹지 만족도): '보통'(2), '다소 만족'(3), '매우 만족'(4) 중에서만 투표
  const q21_parkSatisfactionIdx = pickRandom([2, 3, 4], rng);

  // [연관 규칙 3] 문항 24·25(Child 30, 동네 환경 5행 그리드):
  // - 3, 4, 5번(col 2, 3, 4: 보통이다 / 대체로 그렇다 / 매우 그렇다) 중에서만 투표
  const q22_envPool = [2, 3, 4];
  const q22_envGridCols = [
    pickRandom(q22_envPool, rng),
    pickRandom(q22_envPool, rng),
    pickRandom(q22_envPool, rng),
    pickRandom(q22_envPool, rng),
    pickRandom(q22_envPool, rng)
  ];

  // 23번 문항 (Child 31, 밤에 혼자 걸을 때 안전도): '보통'(2), '비교적 안전'(3), '매우 안전'(4) 중 랜덤 (동네 환경이 불만족일 때는 '보통'(2)으로 연동)
  const q23_safetyIdx = (q21_parkSatisfactionIdx <= 1) ? 2 : pickRandom([2, 3, 4], rng);

  // 24번 문항 (Child 33, 통학·생활 환경 2행 그리드): 첫번째는 3~5번(col 2, 3, 4) 랜덤, 두번째는 1~2번(col 0, 1) 랜덤
  const q24_row1Col = pickRandom([2, 3, 4], rng);
  const q24_row2Col = pickRandom([0, 1], rng);

  // 25번 문항 (Child 34, 통학 여부): 모두 '예'(0)
  const q25_commuteYesIdx = 0;

  // ⑦ 25번 하위 1 (Child 35, 통학 교통수단): '도보'(0) 70%, '버스(환승 포함)'(2) 20%, '승용차(가족 차량 등)'(4) 10%
  const bucket25 = (slotZero * 53 + 7) % 100;
  let q25_sub1_transportIndices;
  if (bucket25 < 70) {
    q25_sub1_transportIndices = [0]; // 도보
  } else if (bucket25 < 90) {
    q25_sub1_transportIndices = [2]; // 버스(환승 포함)
  } else {
    q25_sub1_transportIndices = [4]; // 승용차(가족 차량 등)
  }

  // ⑦ 25번 하위 2 (Child 36, 등교 소요 시간): 0시간 + 10분, 15분, 20분 중 랜덤
  const q25_sub2_hours = '0';
  const q25_sub2_minutes = pickRandom(['10', '15', '20'], rng);

  // 26번 문항 (Child 37, 대중교통 만족도): '보통'(2), '다소 만족'(3), '매우 만족'(4) 중 랜덤 (동네 환경 불만족 시 '보통'(2) 연동)
  const q26_transitSatisfactionIdx = (q21_parkSatisfactionIdx <= 1) ? 2 : pickRandom([2, 3, 4], rng);

  // 27번 문항 (Child 38, 청소년 문화/체육시설 충분 여부): '별로 그렇지 않다'(1), '보통이다'(2), '대체로 그렇다'(3), '매우 그렇다'(4) 중 랜덤 (동네 환경과 개연성 연동)
  const q27_facilityEnoughIdx = (q21_parkSatisfactionIdx <= 1)
    ? pickRandom([1, 2], rng)
    : pickRandom([2, 3, 4], rng);

  // 28번 문항 (Child 39, 청소년시설 이용 경험): '가끔 이용'(1), '이용한 적 없음'(2), '시설이 있는지 몰랐음'(3) 중 랜덤
  const q28_facilityUseIdx = pickRandom([1, 2, 3], rng);

  // ⑧ 28번 하위 1 & 2 (Child 40 만족도 & Child 41 아쉬운 점 - 28번이 '가끔 이용'(1)일 때만 노출)
  // 만족도 보기: [0]매우불만족, [1]불만족, [2]보통, [3]만족, [4]매우만족 -> '만족'(3), '매우 만족'(4) 중 랜덤
  const q28_sub1_satisfactionIdx = pickRandom([3, 4], rng);
  // 아쉬운 점 보기: [0..4] (기타 5 제외 랜덤)
  const q28_sub2_lackIdx = pickRandom([0, 1, 2, 3, 4], rng);

  // 29번 문항 (Child 42, 화성시 거주 전반적 만족도): '보통'(2), '만족'(3), '매우 만족'(4) 중 랜덤 (동네 환경 불만족 시 '보통'(2) 연동)
  const q29_liveSatisfactionIdx = (q21_parkSatisfactionIdx <= 1) ? 2 : pickRandom([2, 3, 4], rng);

  // 30번 문항 (Child 43, 불편한 점 순서대로 2가지): '기타'(6) 제외, 나머지 0~5 중 골고루 2가지 필수 선택
  const q30_inconvenienceRanks = pickTwoDistinct([0, 1, 2, 3, 4, 5], slotZero, 5, 2);

  // 31번 문항 (Child 44, 자원봉사 활동): '참여한 적 없음'(8) 90%, '지역 행사·도서관 운영 보조'(5) 5%, '환경 정화 활동'(0) 5%
  const bucket31 = (slotZero * 29 + 23) % 100;
  let q31_volunteerIndices;
  if (bucket31 < 90) {
    q31_volunteerIndices = [8]; // 참여한 적 없음
  } else if (bucket31 < 95) {
    q31_volunteerIndices = [5]; // 지역 행사·도서관 운영 보조
  } else {
    q31_volunteerIndices = [0]; // 환경 정화 활동
  }

  // 32번 문항 (Child 45, 기부 참여 방법):
  // '기부한 적 없음'(7) 90%, '물품 기부'(3) 3%, '기부 상품 구매'(4) 3%, '온라인·앱으로 기부하기'(2) 3%, '모금함에 돈 넣기'(0) 1%
  // 일부 답변은 다중선택으로 처리
  const bucket32 = (slotZero * 61 + 31) % 100;
  let q32_donationIndices;
  if (bucket32 < 90) {
    q32_donationIndices = [7]; // 기부한 적 없음 (단독)
  } else if (bucket32 === 90) {
    q32_donationIndices = [3, 2]; // 물품 기부 + 온라인·앱 기부 (다중선택)
  } else if (bucket32 < 93) {
    q32_donationIndices = [3]; // 물품 기부
  } else if (bucket32 === 93) {
    q32_donationIndices = [4, 3]; // 기부 상품 구매 + 물품 기부 (다중선택)
  } else if (bucket32 < 96) {
    q32_donationIndices = [4]; // 기부 상품 구매
  } else if (bucket32 === 96) {
    q32_donationIndices = [2, 0]; // 온라인·앱 기부 + 모금함 (다중선택)
  } else if (bucket32 < 99) {
    q32_donationIndices = [2]; // 온라인·앱으로 기부하기
  } else {
    q32_donationIndices = [0]; // 모금함에 돈 넣기
  }

  // 33번 문항 (Child 46, 유스플래닛 인지/사용 여부): '예'(0) 25%, '아니오'(1) 75%
  const bucket33 = (slotZero * 47 + 19) % 100;
  const q33_youthPlanetIdx = (bucket33 < 25) ? 0 : 1;

  // 34번 문항 (Child 47, 청소년 의견 반영 정도): 전체 랜덤 (0~4)
  const q34_opinionReflectedIdx = (slotZero * 3 + Math.floor(rng() * 5)) % 5;

  // ⑨ 35번 문항 (Child 48, 정책 결정 과정 참여 의향): 전체 골고루 랜덤 (0~4)
  const q35_policyParticipateIdx = (slotZero * 2 + Math.floor(rng() * 5)) % 5;

  // [연관 규칙 4] 문항 41-1, 41-2(Child 49 / 초기 36-1 소속감 & 36-2 자부심, 5~10점) ⇄ 문항 42(Child 50 / 초기 37번, 성인 후 계속 거주 의향):
  // - 41-1, 41-2 답변이 6~10 사이로 답변하면 ➔ 문항 42번은 '그렇다'(3), '매우 그렇다'(4)로 응답
  // - 41-1, 41-2가 5점일 때는 ➔ 문항 42번은 '보통이다'(2)로 응답 (41-1과 41-2도 서로 엇박자가 나지 않도록 동조화)
  const q36_1_belonging = pickRangeInt(5, 10, rng);
  let q36_2_pride;
  if (q36_1_belonging === 5) {
    q36_2_pride = 5;
  } else {
    const prideDelta = pickRandom([-1, 0, 1], rng);
    q36_2_pride = Math.max(6, Math.min(10, q36_1_belonging + prideDelta));
  }

  const q37_stayAdultIdx = (q36_1_belonging >= 6 && q36_2_pride >= 6)
    ? pickRandom([3, 4], rng)
    : 2;

  // ⑩ 38번 문항 (Child 51, 우선 추진 정책 순서대로 2가지): 골고루 랜덤 2개 필수 선택 (텍스트 입력 강제되는 7번 기타 제외, 0~6 중 2개)
  const q38_policyPriorityRanks = pickTwoDistinct([0, 1, 2, 3, 4, 5, 6], slotZero, 5, 4);

  // 39번 문항 (Child 52, 바라는 점 주관식): '없다' 85%, 10자 이내 사소한 문구 15%
  const bucket39 = (slotZero * 71 + 5) % 100;
  const q39_openText = (bucket39 < 85)
    ? '없다'
    : SHORT_WISH_PHRASES[slotZero % SHORT_WISH_PHRASES.length];

  // 40번 문항 (Child 53, IDX 입력): 엑셀 데이터 idx
  const q40_idxText = idxStr;

  return {
    idx: idxStr,
    q1_resideIdx,
    q2_age: String(q2_age),
    q3_genderIdx,
    q4_schoolIdx,
    q5_districtIdx,
    q5_sub_dongIdx,
    dongLabel: DONG_OPTIONS[q5_sub_dongIdx],
    q6_durationIdx,
    q7_score,
    q8_score,
    q9_1_health,
    q9_2_economy,
    q9_3_friends,
    q9_4_family,
    q9_5_school,
    q10_row1,
    q10_row2,
    q10_row3,
    q11_row1_school,
    q11_row2_help,
    q12_counselIdx,
    q13_stressIdx,
    q13_sub1_factors,
    q13_sub2_reliefIdx,
    q14_sleepEnoughIdx,
    q15_sleepHoursIdx,
    q16_exerciseIdx,
    q17_leisureIndices,
    q18_hobbyEnoughIdx,
    q19_cultureIndices,
    q19_sub_satisfactionIdx,
    q20_festivalIndices,
    q20_sub_satisfactionIdx,
    q21_parkSatisfactionIdx,
    q22_envGridCols,
    q23_safetyIdx,
    q24_row1Col,
    q24_row2Col,
    q25_commuteYesIdx,
    q25_sub1_transportIndices,
    q25_sub2_hours,
    q25_sub2_minutes,
    q26_transitSatisfactionIdx,
    q27_facilityEnoughIdx,
    q28_facilityUseIdx,
    q28_sub1_satisfactionIdx,
    q28_sub2_lackIdx,
    q29_liveSatisfactionIdx,
    q30_inconvenienceRanks,
    q31_volunteerIndices,
    q32_donationIndices,
    q33_youthPlanetIdx,
    q34_opinionReflectedIdx,
    q35_policyParticipateIdx,
    q36_1_belonging,
    q36_2_pride,
    q37_stayAdultIdx,
    q38_policyPriorityRanks,
    q39_openText,
    q40_idxText
  };
}

/**
 * 코나체인 화성특례시 만족도 청소년 설문조사 1건 실행
 */
export async function runKonaSurvey(options = {}) {
  const {
    surveyUrl = 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL',
    policy = {},
    quotaIndex = 1,
    pilotMode = false,
    safetyGuard = false,
    minDurationMs = 58000 + Math.floor(Math.random() * 5000), // 1인당 약 1분(58~63초) 소요 보장
    reportDir = '',
    onProgress = () => {}
  } = options;
  const slotData = options.slotData || options.quotaItem || {};

  const persona = buildKonaYouthPersona(slotData, quotaIndex, policy);
  const idx = persona.idx;
  const effectiveReportDir = reportDir || path.resolve(`reports/kona_pilot_${idx}`);
  if (!fs.existsSync(effectiveReportDir)) {
    fs.mkdirSync(effectiveReportDir, { recursive: true });
  }

  const capturedSteps = [];
  let browser = null;

  try {
    onProgress({
      step: 'INIT',
      progress: 5,
      message: `[IDX ${idx}] 코나체인 청소년 설문 클린 세션 기동 중... (${persona.dongLabel} / 만${persona.q2_age}세 / ${persona.q3_genderIdx === 1 ? '여' : '남'} / ${persona.q4_schoolIdx === 1 ? '고' : '중'})`
    });

    browser = await launchChromium({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1080 },
      locale: 'ko-KR'
    });
    const page = await context.newPage();

    // 안전 가드(파일럿 검증) 모드일 때는 최종 투표 제출 API 전송을 네트워크 레벨에서도 원천 차단
    if (safetyGuard || pilotMode) {
      await page.route('**/voting-service/api/**', async (route) => {
        const req = route.request();
        const url = req.url();
        if (req.method() !== 'GET' && !url.includes('survey-state')) {
          console.log(`[KonaSafetyGuard] 투표 제출 API 요청 차단됨: ${req.method()} ${url}`);
          await route.abort();
          return;
        }
        await route.continue();
      });
    }

    const sessionStartedAt = Date.now();
    await page.goto(surveyUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('section.contents', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // DOM 조작 헬퍼 함수들 (단일 객체 인자 원칙 엄수)
    const clickOptionInChild = async (childIdx, optIdx) => {
      await page.evaluate(({ cIdx, oIdx }) => {
        const s = document.querySelector('section.contents');
        const child = s?.children?.[cIdx];
        if (!child) throw new Error(`Child ${cIdx} 컨테이너를 찾을 수 없습니다.`);
        const inputs = child.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        const target = inputs[oIdx];
        if (!target) throw new Error(`Child ${cIdx}의 보기 index ${oIdx}를 찾을 수 없습니다 (총 ${inputs.length}개).`);
        target.scrollIntoView({ block: 'center' });
        target.click();
      }, { cIdx: childIdx, oIdx: optIdx });
      await page.waitForTimeout(70);
    };

    const clickGridCell = async (childIdx, rowOneBased, colZeroBased) => {
      await page.evaluate(({ cIdx, rIdx, colIdx }) => {
        const s = document.querySelector('section.contents');
        const child = s?.children?.[cIdx];
        if (!child) throw new Error(`Child ${cIdx} 그리드 컨테이너를 찾을 수 없습니다.`);
        const inputs = child.querySelectorAll(`input[name="grid-input-${cIdx}-${rIdx}"]`);
        const target = inputs[colIdx];
        if (!target) throw new Error(`Grid (${cIdx}, row ${rIdx}, col ${colIdx}) 셀을 찾을 수 없습니다.`);
        target.scrollIntoView({ block: 'center' });
        target.click();
      }, { cIdx: childIdx, rIdx: rowOneBased, colIdx: colZeroBased });
      await page.waitForTimeout(70);
    };

    const clickScaleScore = async (childIdx, subOneBased, scoreZeroToTen) => {
      await page.evaluate(({ cIdx, sIdx, score }) => {
        const s = document.querySelector('section.contents');
        const child = s?.children?.[cIdx];
        if (!child) throw new Error(`Child ${cIdx} 척도 컨테이너를 찾을 수 없습니다.`);
        const inputs = child.querySelectorAll(`input[name="scale-radio-group-${cIdx}-${sIdx}"]`);
        const target = inputs[score];
        if (!target) throw new Error(`Scale (${cIdx}, sub ${sIdx}, score ${score}) 라디오를 찾을 수 없습니다.`);
        target.scrollIntoView({ block: 'center' });
        target.click();
      }, { cIdx: childIdx, sIdx: subOneBased, score: scoreZeroToTen });
      await page.waitForTimeout(70);
    };

    // ====================================================
    // [PART 1] 1~5번 기본 쿼터 및 동탄 행정동 입력
    // ====================================================
    onProgress({
      step: 'STEP_1_QUOTA',
      progress: 15,
      message: `[IDX ${idx}] 1~5번 기본 인적사항 입력 (만${persona.q2_age}세, ${persona.q3_genderIdx === 1 ? '여자' : '남자'}, ${persona.q4_schoolIdx === 1 ? '고등학생' : '중학생'}, 동탄구 ${persona.dongLabel})`
    });

    await clickOptionInChild(1, persona.q1_resideIdx); // 1번: 예
    const ageInput = page.locator('section.contents > div').nth(2).locator('input[name="narrativeNumericInput"]');
    await ageInput.scrollIntoViewIfNeeded();
    await ageInput.fill(persona.q2_age); // 2번: 만 나이
    await page.waitForTimeout(80);

    await clickOptionInChild(3, persona.q3_genderIdx); // 3번: 성별
    await clickOptionInChild(4, persona.q4_schoolIdx); // 4번: 중학생/고등학생
    await clickOptionInChild(5, persona.q5_districtIdx); // 5번: 동탄구
    await page.waitForTimeout(250);

    // ① 5번 하위 (Child 9): 동탄1동 ~ 동탄9동 선택
    await clickOptionInChild(9, persona.q5_sub_dongIdx);

    // ====================================================
    // [PART 2] 6~14번 행복도·가족·학교·상담·스트레스
    // ====================================================
    onProgress({
      step: 'STEP_2_HAPPINESS',
      progress: 35,
      message: `[IDX ${idx}] 6~14번 행복점수(Q7:${persona.q7_score}점/Q8:${persona.q8_score}점), 가족활동, 상담대상 및 스트레스 문항 입력 중...`
    });

    await clickOptionInChild(10, persona.q6_durationIdx); // 6번: 거주기간
    await clickScaleScore(11, 1, persona.q7_score); // 7번: 행복정도 (4~9점)
    await clickScaleScore(12, 1, persona.q8_score); // 8번: 삶 만족도 (4~9점, Q7과 ±1 이내)

    // 9-1 ~ 9-5 영역별 행복 점수
    await clickScaleScore(13, 1, persona.q9_1_health);
    await clickScaleScore(13, 2, persona.q9_2_economy);
    await clickScaleScore(13, 3, persona.q9_3_friends);
    await clickScaleScore(13, 4, persona.q9_4_family);
    await clickScaleScore(13, 5, persona.q9_5_school);

    // 10번: 가족 활동 빈도 3행 (모두 1~2 또는 모두 3~4)
    await clickGridCell(14, 1, persona.q10_row1);
    await clickGridCell(14, 2, persona.q10_row2);
    await clickGridCell(14, 3, persona.q10_row3);

    // 11번: 생각과 가까운 곳 2행 그리드
    await clickGridCell(15, 1, persona.q11_row1_school);
    await clickGridCell(15, 2, persona.q11_row2_help);

    // 12번: 고민 상담 대상 (11번 row2와 연동)
    await clickOptionInChild(16, persona.q12_counselIdx);

    // 13번(화면 14번): 스트레스 정도 (8번 행복점수 구간 연동)
    await clickOptionInChild(17, persona.q13_stressIdx);
    await page.waitForTimeout(250);

    // ② & ③ 13번 하위 1 (Child 18: 스트레스 요인 1·2순위) & 하위 2 (Child 19: 해소법)
    // 코나체인 entryLogic(Q17A3 OR Q17A4 OR Q17A5): '보통이다'(2), '조금 느꼈다'(3), '매우 많이 느꼈다'(4) 선택 시에만 하위 문항 노출
    if (persona.q13_stressIdx >= 2) {
      await clickOptionInChild(18, persona.q13_sub1_factors[0]);
      await clickOptionInChild(18, persona.q13_sub1_factors[1]);
      await clickOptionInChild(19, persona.q13_sub2_reliefIdx);
    }

    // 14번: 수면 피로 회복 충분 정도
    await clickOptionInChild(20, persona.q14_sleepEnoughIdx);

    // ====================================================
    // [PART 3] 15~20번 수면·운동·여가·문화활동·축제
    // ====================================================
    onProgress({
      step: 'STEP_3_CULTURE',
      progress: 55,
      message: `[IDX ${idx}] 15~20번 수면시간, 운동·여가 연동 및 문화·축제 참여 입력 중...`
    });

    // 15번: 주중 평균 수면 시간 (6~7, 7~8, 8시간 이상 중 랜덤)
    await clickOptionInChild(21, persona.q15_sleepHoursIdx);

    // 16번: 운동 일수 (성별 연동)
    await clickOptionInChild(22, persona.q16_exerciseIdx);

    // 17번: 여가 활동 (16번 '3~4일'만 운동 체크, 나머지 친구/스마트폰/휴식 랜덤)
    for (const leisureIdx of persona.q17_leisureIndices) {
      await clickOptionInChild(23, leisureIdx);
    }

    // 18번: 취미·여가 충분 여부
    await clickOptionInChild(24, persona.q18_hobbyEnoughIdx);

    // 19번: 문화활동 (없음 70%, 영화 20%, 영화+스포츠 10%)
    for (const cultIdx of persona.q19_cultureIndices) {
      await clickOptionInChild(25, cultIdx);
    }
    await page.waitForTimeout(200);
    // 19번 하위 (Child 26: 문화생활 만족도 - 없음이 아닐 때 노출)
    if (!persona.q19_cultureIndices.includes(9)) {
      await clickOptionInChild(26, persona.q19_sub_satisfactionIdx);
    }

    // 20번: 화성시 축제 (없음 70%, 정조효+루나빛 20%, 정조효 5%, 루나빛 5%)
    for (const festIdx of persona.q20_festivalIndices) {
      await clickOptionInChild(27, festIdx);
    }
    await page.waitForTimeout(200);
    // 20번 하위 (Child 28: 축제 만족도 - 없음이 아닐 때 노출)
    if (!persona.q20_festivalIndices.includes(6)) {
      await clickOptionInChild(28, persona.q20_sub_satisfactionIdx);
    }

    // ====================================================
    // [PART 4] 21~28번 동네환경·안전·통학·청소년시설
    // ====================================================
    onProgress({
      step: 'STEP_4_COMMUTE',
      progress: 75,
      message: `[IDX ${idx}] 21~28번 동네환경, 안전, 통학(${persona.q25_sub2_minutes}분) 및 청소년시설 문항 입력 중...`
    });

    // 21번: 공원·녹지 만족도
    await clickOptionInChild(29, persona.q21_parkSatisfactionIdx);

    // 22번: 동네 환경 5행 그리드 (3~5번 항목 랜덤)
    for (let r = 1; r <= 5; r++) {
      await clickGridCell(30, r, persona.q22_envGridCols[r - 1]);
    }

    // 23번: 밤에 혼자 걸을 때 안전도 (보통, 비교적 안전, 매우 안전 중 랜덤)
    await clickOptionInChild(31, persona.q23_safetyIdx);

    // 24번: 통학·생활 환경 2행 그리드 (1행 3~5번, 2행 1~2번)
    await clickGridCell(33, 1, persona.q24_row1Col);
    await clickGridCell(33, 2, persona.q24_row2Col);

    // 25번: 통학 여부 = 모두 '예'(0) -> Child 35, 36 노출
    await clickOptionInChild(34, persona.q25_commuteYesIdx);
    await page.waitForTimeout(250);

    // ⑦ 25번 하위 1 (Child 35: 교통수단 도보 70%, 버스 20%, 승용차 10%)
    for (const transIdx of persona.q25_sub1_transportIndices) {
      await clickOptionInChild(35, transIdx);
    }

    // ⑦ 25번 하위 2 (Child 36: 등교 소요 시간 0시간 + 10/15/20분)
    const timeInputs = page.locator('section.contents > div').nth(36).locator('input[name="narrativeNumericInput"]');
    await timeInputs.nth(0).scrollIntoViewIfNeeded();
    await timeInputs.nth(0).fill(persona.q25_sub2_hours);
    await timeInputs.nth(1).fill(persona.q25_sub2_minutes);
    await page.waitForTimeout(80);

    // 26번: 대중교통 만족도
    await clickOptionInChild(37, persona.q26_transitSatisfactionIdx);

    // 27번: 청소년 문화공간/체육시설 충분 여부
    await clickOptionInChild(38, persona.q27_facilityEnoughIdx);

    // 28번: 청소년시설 이용 경험
    await clickOptionInChild(39, persona.q28_facilityUseIdx);
    await page.waitForTimeout(250);

    // ⑧ 28번 하위 1 & 2 (Child 40 만족도 & Child 41 아쉬운 점 - '가끔 이용'(1) 선택 시 노출)
    if (persona.q28_facilityUseIdx === 1) {
      await clickOptionInChild(40, persona.q28_sub1_satisfactionIdx);
      await clickOptionInChild(41, persona.q28_sub2_lackIdx);
    }

    // ====================================================
    // [PART 5] 29~40번 거주만족·봉사·기부·정책·주관식·IDX
    // ====================================================
    onProgress({
      step: 'STEP_5_POLICY_IDX',
      progress: 90,
      message: `[IDX ${idx}] 29~40번 거주만족, 봉사·기부, 우선 정책, 주관식("${persona.q39_openText}") 및 IDX(${persona.q40_idxText}) 입력 중...`
    });

    // 29번: 화성시 거주 전반적 만족도
    await clickOptionInChild(42, persona.q29_liveSatisfactionIdx);

    // 30번: 생활하기 불편한 점 순서대로 2가지 (기타 제외 골고루 분산)
    await clickOptionInChild(43, persona.q30_inconvenienceRanks[0]);
    await clickOptionInChild(43, persona.q30_inconvenienceRanks[1]);

    // 31번: 자원봉사 활동
    for (const volIdx of persona.q31_volunteerIndices) {
      await clickOptionInChild(44, volIdx);
    }

    // 32번: 기부 참여 방법
    for (const donIdx of persona.q32_donationIndices) {
      await clickOptionInChild(45, donIdx);
    }

    // 33번: 유스플래닛 인지/사용 여부
    await clickOptionInChild(46, persona.q33_youthPlanetIdx);

    // 34번: 청소년 의견 반영 정도
    await clickOptionInChild(47, persona.q34_opinionReflectedIdx);

    // ⑨ 35번: 정책 결정 과정 참여 의향
    await clickOptionInChild(48, persona.q35_policyParticipateIdx);

    // 36번: 소속감(36-1) & 자부심(36-2) 5~10점 랜덤
    await clickScaleScore(49, 1, persona.q36_1_belonging);
    await clickScaleScore(49, 2, persona.q36_2_pride);

    // 37번: 성인 후 계속 거주 의향
    await clickOptionInChild(50, persona.q37_stayAdultIdx);

    // ⑩ 38번: 우선 추진 정책 순서대로 2가지
    await clickOptionInChild(51, persona.q38_policyPriorityRanks[0]);
    await clickOptionInChild(51, persona.q38_policyPriorityRanks[1]);

    // 39번: 화성시에 바라는 점 ('없다' 85%, 10자 이내 단문 15%)
    const wishTextarea = page.locator('section.contents > div').nth(52).locator('textarea');
    await wishTextarea.scrollIntoViewIfNeeded();
    await wishTextarea.fill(persona.q39_openText);
    await page.waitForTimeout(80);

    // 40번: IDX 입력
    const idxTextarea = page.locator('section.contents > div').nth(53).locator('textarea');
    await idxTextarea.scrollIntoViewIfNeeded();
    await idxTextarea.fill(persona.q40_idxText);
    await page.waitForTimeout(300);

    // ====================================================
    // [PART 6] 제출 직전 필수 스크린샷 저장 (전체 페이지 + 구간별 상세 + 하단 IDX/제출버튼)
    // ====================================================
    const fullShotName = `step_01_full_before_submit_${idx}.png`;
    const fullShotPath = path.join(effectiveReportDir, fullShotName);
    await page.screenshot({ path: fullShotPath, fullPage: true });

    // 구간별 가독성 높은 스크린샷 추가 촬영 (제출 직전 상태 - 연관 문항 한눈에 확인 가능하도록 중앙 정렬)
    const sectionAnchors = [
      { childIdx: 3, block: 'center', offsetY: 0, name: `step_02_part1_q1_to_q8_${idx}.png`, title: `[IDX ${idx}] 1~8번 기본정보·행복도 응답 화면` },
      { childIdx: 14, block: 'center', offsetY: -130, name: `step_03_part2_q10_to_q12_${idx}.png`, title: `[IDX ${idx}] 10-3·10-4·10-5 ⇄ 11·12번 가족활동·학교만족 연동 화면` },
      { childIdx: 20, block: 'center', offsetY: -120, name: `step_04_part3_q15_to_q20_${idx}.png`, title: `[IDX ${idx}] 15~18번 스트레스요인·수면충분도·수면시간 연동 화면` },
      { childIdx: 30, block: 'center', offsetY: -40, name: `step_05_part4_q24_to_q25_${idx}.png`, title: `[IDX ${idx}] 24번(공원만족) ⇄ 25번(동네환경) 연동 화면` },
      { childIdx: 50, block: 'center', offsetY: -80, name: `step_06_part5_q41_to_q42_${idx}.png`, title: `[IDX ${idx}] 41-1·41-2(소속감·자부심) ⇄ 42번(계속거주) 연동 화면` }
    ];

    capturedSteps.push({
      step: 'BEFORE_SUBMIT_FULL',
      stepIndex: 1,
      title: `[IDX ${idx}] 제출 직전 전체 설문 응답 증명 (Full Page)`,
      file: fullShotName,
      url: `/reports/${path.relative(path.resolve('reports'), fullShotPath).replace(/\\/g, '/')}`,
      timestamp: new Date().toISOString()
    });

    for (let s = 0; s < sectionAnchors.length; s++) {
      const sec = sectionAnchors[s];
      const secPath = path.join(effectiveReportDir, sec.name);
      await page.evaluate(({ cIdx, blk, dy }) => {
        const section = document.querySelector('section.contents');
        const el = section && section.children[cIdx];
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: blk });
          if (dy) window.scrollBy(0, dy);
        }
      }, { cIdx: sec.childIdx, blk: sec.block, dy: sec.offsetY });
      await page.waitForTimeout(120);
      await page.screenshot({ path: secPath, fullPage: false });
      capturedSteps.push({
        step: `BEFORE_SUBMIT_PART_${s + 1}`,
        stepIndex: s + 2,
        title: sec.title,
        file: sec.name,
        url: `/reports/${path.relative(path.resolve('reports'), secPath).replace(/\\/g, '/')}`,
        timestamp: new Date().toISOString()
      });
    }

    const bottomShotName = `step_07_idx_${idx}_ready_to_submit.png`;
    const bottomShotPath = path.join(effectiveReportDir, bottomShotName);
    await page.locator('button.btn-pu').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: bottomShotPath, fullPage: false });

    // 응답 페르소나 JSON 기록 보존
    fs.writeFileSync(
      path.join(effectiveReportDir, `answers_${idx}.json`),
      JSON.stringify({ idx, slotData, persona, capturedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );

    // 상위 캠페인 폴더에도 직관적인 파일명으로 복사본 보존
    const parentReportDir = path.dirname(effectiveReportDir);
    if (fs.existsSync(parentReportDir)) {
      const flatCopyPath = path.join(parentReportDir, `kona_before_submit_${idx}.png`);
      fs.copyFileSync(fullShotPath, flatCopyPath);
    }

    if (!fs.existsSync(fullShotPath) || fs.statSync(fullShotPath).size === 0) {
      throw new Error(`[안전 차단] 제출 직전 스크린샷(${fullShotName}) 파일 생성이 확인되지 않아 제출을 중단합니다.`);
    }

    capturedSteps.push({
      step: 'BEFORE_SUBMIT_IDX',
      stepIndex: 7,
      title: `[IDX ${idx}] 38~40번(IDX: ${idx}) 및 제출하기 직전 화면`,
      file: bottomShotName,
      url: `/reports/${path.relative(path.resolve('reports'), bottomShotPath).replace(/\\/g, '/')}`,
      timestamp: new Date().toISOString()
    });

    const latestPreSubmitUrl = capturedSteps[capturedSteps.length - 1].url;
    onProgress({
      step: 'SCREENSHOT_SAVED',
      progress: 96,
      screenshot: latestPreSubmitUrl,
      capturedSteps,
      message: `📸 [IDX ${idx}] 제출 직전 전체/구간별 스크린샷 7종 저장 완료! (${fullShotName})`
    });

    // 안전 가드(파일럿 검증) 모드일 경우 여기서 제출하지 않고 정지
    if (safetyGuard || pilotMode) {
      onProgress({
        step: 'SAFETY_STOP',
        progress: 98,
        screenshot: latestPreSubmitUrl,
        capturedSteps,
        message: `🛑 [안전 가드 작동] IDX ${idx} 모든 문항 입력 및 제출 직전 스크린샷 보존 완료 (실제 제출 안 함)`
      });
      await browser.close();
      return {
        success: true,
        status: 'stopped_before_submit',
        idx,
        persona,
        capturedSteps
      };
    }

    // ====================================================
    // [PART 7] 실제 제출하기 클릭 및 완료 확인 (Live Batch Mode - 1인당 약 1분 소요 페이싱)
    // ====================================================
    const elapsedMs = Date.now() - sessionStartedAt;
    const remainMs = Math.max(0, Number(minDurationMs || 0) - elapsedMs);
    if (remainMs > 0) {
      onProgress({
        step: 'PACING_WAIT',
        progress: 97,
        message: `⏳ [IDX ${idx}] 자연스러운 응답 시간(약 1분) 보장을 위해 ${(remainMs / 1000).toFixed(1)}초 대기 후 제출합니다...`
      });
      await page.waitForTimeout(remainMs);
    }

    onProgress({
      step: 'SUBMITTING',
      progress: 98,
      message: `🚀 [IDX ${idx}] 제출 직전 스크린샷 검증 완료 (소요 ${((Date.now() - sessionStartedAt) / 1000).toFixed(1)}초) ➔ [제출하기] 버튼 클릭 중...`
    });

    const submitResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/vote-cast/anonymous/survey') && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(() => null);

    await page.locator('button.btn-pu').click();
    const submitResponse = await submitResponsePromise;
    await page.waitForTimeout(1200);

    // 미응답 검증 에러 메시지가 화면에 남아있는지 확인
    const validationErrors = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      if (bodyText.includes('필수 입력 항목입니다')) {
        return '화면 내 필수 입력 누락 경고가 감지되었습니다.';
      }
      return null;
    });

    if (validationErrors || !submitResponse || !submitResponse.ok()) {
      const errShotName = `step_99_validation_error_${idx}.png`;
      const errShotPath = path.join(effectiveReportDir, errShotName);
      await page.screenshot({ path: errShotPath, fullPage: true });
      const statusMsg = submitResponse ? `HTTP ${submitResponse.status()}` : '응답 없음';
      throw new Error(`[제출 검증 실패] ${validationErrors || `설문 제출 API 응답 오류 (${statusMsg})`}`);
    }

    const doneShotName = `step_08_submitted_complete_${idx}.png`;
    const doneShotPath = path.join(effectiveReportDir, doneShotName);
    await page.screenshot({ path: doneShotPath, fullPage: false });

    capturedSteps.push({
      step: 'SUBMIT_COMPLETE',
      stepIndex: 8,
      title: `[IDX ${idx}] 설문 제출 완료 화면`,
      file: doneShotName,
      url: `/reports/${path.relative(path.resolve('reports'), doneShotPath).replace(/\\/g, '/')}`,
      timestamp: new Date().toISOString()
    });

    onProgress({
      step: 'COMPLETED',
      progress: 100,
      screenshot: capturedSteps[capturedSteps.length - 1].url,
      capturedSteps,
      message: `🎉 [IDX ${idx}] 설문 제출 및 스크린샷 보존 100% 완료!`
    });

    await browser.close();
    return {
      success: true,
      status: 'completed',
      idx,
      persona,
      capturedSteps
    };
  } catch (err) {
    if (browser) {
      await browser.close().catch(e => console.error('Browser close error:', e));
    }
    return {
      success: false,
      idx,
      error: err.message,
      capturedSteps
    };
  }
}
