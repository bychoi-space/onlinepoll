/**
 * 객관식 문항 의사결정 모듈 (Decision Engine)
 * 설문 질문과 보기 목록을 분석하여 사용자의 비중 가이드 및 페르소나에 맞춰 보기를 선택합니다.
 */

// 긍정적 키워드
const POSITIVE_KEYWORDS = [
  '매우 만족', '만족', '매우 그렇다', '그렇다', '매우 좋음', '좋음', '매우 동의', '동의',
  '매우 긍정적', '긍정적', '편리함', '우수', '추천', '5점', '4점'
];

// 부정적 키워드
const NEGATIVE_KEYWORDS = [
  '매우 불만족', '불만족', '전혀 그렇지 않다', '그렇지 않다', '매우 나쁨', '나쁨',
  '전혀 동의하지 않음', '동의하지 않음', '매우 부정적', '부정적', '불편함', '미흡', '비추천', '1점', '2점'
];

// 중립적 키워드
const NEUTRAL_KEYWORDS = [
  '보통', '그저 그렇다', '중립', '모르겠음', '3점'
];

/**
 * 보기 목록 중 질문 및 사용자 가이드에 맞는 옵션(인덱스 배열)을 결정
 * @param {Object} params
 * @param {string} params.questionTitle 질문 제목
 * @param {Array<string>} params.options 보기 텍스트 목록
 * @param {boolean} params.isMultipleCheck 체크박스(복수선택) 여부
 * @param {Object} params.guidelines 사용자 설정 가이드라인 (positiveRatio, neutralRatio, negativeRatio)
 * @param {Object} params.persona 페르소나 정보
 * @returns {Array<number>} 선택된 옵션의 0-based 인덱스 목록
 */
export function decideChoices({
  questionTitle = '',
  options = [],
  isMultipleCheck = false,
  guidelines = {},
  persona = {}
}) {
  if (!options || options.length === 0) return [];

  const lowerQ = questionTitle.toLowerCase();

  // 1. 인구통계학적 질문 (성별) 판별
  if (lowerQ.includes('성별') || lowerQ.includes('gender')) {
    const isFemale = persona.genderCode === '여' || String(persona.gender || '').startsWith('여');
    const genderTokens = isFemale ? ['여성', '여자', '여', 'female'] : ['남성', '남자', '남', 'male'];
    for (const tok of genderTokens) {
      const matchIdx = options.findIndex(opt => {
        const clean = String(opt || '').trim().toLowerCase();
        return tok.length === 1
          ? (clean === tok || clean.startsWith(`${tok}(`) || clean.endsWith(` ${tok}`) || /^\d+[.)\s]*[남여]$/.test(clean) && clean.endsWith(tok))
          : clean.includes(tok);
      });
      if (matchIdx !== -1) return [matchIdx];
    }
  }

  // 2. 인구통계학적 질문 (연령/나이/출생연도) 판별
  if (lowerQ.includes('연령') || lowerQ.includes('나이') || lowerQ.includes('연령대') || lowerQ.includes('age')) {
    const ageNum = Number(persona.ageNum) || parseInt(String(persona.age || '30').slice(0, 2), 10) || 30;
    const decadePrefix = ageNum < 20 ? '10' : (ageNum >= 70 ? '70' : String(Math.floor(ageNum / 10) * 10));

    // (a) 범위형 보기 (예: '20~29세', '20세~29세', '60세 이상', '19세 이하') 우선 매칭
    const rangeIdx = options.findIndex(opt => {
      const s = String(opt || '');
      const mRange = s.match(/(\d{2})\s*(?:세)?\s*[~\-]\s*(\d{2})\s*세?/);
      if (mRange) {
        const lo = parseInt(mRange[1], 10);
        const hi = parseInt(mRange[2], 10);
        return ageNum >= lo && ageNum <= hi;
      }
      const mUp = s.match(/(\d{2})\s*(?:세|대)\s*이상/);
      if (mUp && ageNum >= parseInt(mUp[1], 10)) return true;
      const mDown = s.match(/(\d{2})\s*(?:세|대)?\s*(?:이하|미만)/);
      if (mDown && ageNum <= parseInt(mDown[1], 10)) return true;
      return false;
    });
    if (rangeIdx !== -1) return [rangeIdx];

    // (b) 연령대 텍스트 보기 ('10대', '20대', '30대' 등) 매칭
    const matchIdx = options.findIndex(opt => String(opt || '').includes(decadePrefix));
    if (matchIdx !== -1) return [matchIdx];
  }

  // 3. 사용자 지정 확률 가중치 (기본값: 긍정 70%, 중립 20%, 부정 10%)
  const posRatio = Number(guidelines.positiveRatio ?? 70);
  const neuRatio = Number(guidelines.neutralRatio ?? 20);
  const negRatio = Number(guidelines.negativeRatio ?? 10);
  const totalWeight = posRatio + neuRatio + negRatio || 100;

  // 4. 각 옵션의 감성/척도 분류
  const classified = options.map((opt, index) => {
    let sentiment = 'neutral';
    for (const kw of POSITIVE_KEYWORDS) {
      if (opt.includes(kw)) {
        sentiment = 'positive';
        break;
      }
    }
    if (sentiment === 'neutral') {
      for (const kw of NEGATIVE_KEYWORDS) {
        if (opt.includes(kw)) {
          sentiment = 'negative';
          break;
        }
      }
    }
    return { index, text: opt, sentiment };
  });

  const positives = classified.filter(c => c.sentiment === 'positive');
  const neutrals = classified.filter(c => c.sentiment === 'neutral');
  const negatives = classified.filter(c => c.sentiment === 'negative');

  // 확률 추첨
  const rand = Math.random() * totalWeight;
  let targetGroup = positives;

  if (rand < posRatio) {
    targetGroup = positives.length > 0 ? positives : (neutrals.length > 0 ? neutrals : negatives);
  } else if (rand < posRatio + neuRatio) {
    targetGroup = neutrals.length > 0 ? neutrals : (positives.length > 0 ? positives : negatives);
  } else {
    targetGroup = negatives.length > 0 ? negatives : (neutrals.length > 0 ? neutrals : positives);
  }

  if (!targetGroup || targetGroup.length === 0) {
    targetGroup = classified;
  }

  if (isMultipleCheck) {
    // 복수 선택의 경우 1~3개 선택
    const count = Math.min(Math.floor(Math.random() * 2) + 1, targetGroup.length);
    const shuffled = [...targetGroup].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(c => c.index);
  } else {
    // 단일 선택의 경우 1개 선택
    const chosen = targetGroup[Math.floor(Math.random() * targetGroup.length)];
    return [chosen.index];
  }
}
