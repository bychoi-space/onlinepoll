/**
 * 주관식 답변 생성 모듈 (AI Generator)
 * LLM (Google Gemini)과 지능형 휴리스틱 룰 엔진을 결합한 이중화 생성기
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

// 휴리스틱 폴백 문장 풀
const HEURISTIC_TEMPLATES = {
  generalPositive: [
    '전반적으로 인터페이스가 직관적이고 사용하기에 매우 만족스러웠습니다.',
    '기존에 겪었던 불편한 점들이 많이 개선되어 앞으로도 계속해서 이용할 생각입니다.',
    '전체적인 완성도와 편의성이 기대 이상으로 훌륭하여 주변에도 적극 추천하고 싶습니다.'
  ],
  improvement: [
    '초기 로딩 속도와 모바일 환경에서의 가독성이 조금 더 보완되면 더욱 편리할 것 같습니다.',
    '자주 사용하는 핵심 기능에 대한 바로가기나 안내 툴팁이 추가되면 좋겠습니다.',
    '상세 옵션 설정이 조금 더 직관적으로 정리되면 이용 편의성이 크게 높아질 것으로 기대합니다.'
  ],
  neutral: [
    '대체로 무난하며 기본적인 기능에 충실하게 구성되어 있다고 생각합니다.',
    '특별한 불편함 없이 안정적으로 이용할 수 있었습니다.'
  ]
};

/**
 * 주관식 답변 생성
 * @param {Object} params
 * @param {string} params.questionTitle 질문 내용
 * @param {string} params.topic 설문 전체 주제
 * @param {string} params.textGuidelines 사용자가 지정한 주관식 작성 가이드
 * @param {Object} params.persona 페르소나 정보
 * @param {string} [params.apiKey] 사용자가 제공한 Gemini API 키 (선택)
 * @returns {Promise<string>} 생성된 주관식 텍스트
 */
export async function generateTextAnswer({
  questionTitle = '',
  topic = '',
  textGuidelines = '',
  persona = {},
  apiKey = process.env.GEMINI_API_KEY
}) {
  // 1. LLM API 키가 있을 경우 Gemini 생성 시도
  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
당신은 현재 온라인 설문조사에 응답하고 있는 실제 사용자입니다.
다음 지침과 페르소나를 철저히 반영하여 자연스럽고 사람다운 주관식 답변을 한두 문장으로 작성해 주세요. (로봇 느낌이 나지 않도록 자연스러운 한국어로 작성)

[설문 주제]: ${topic || '서비스 만족도 및 개선 의견'}
[현재 질문]: ${questionTitle}
[응답자 페르소나]: ${persona.summary || '일반 참여자'}
[답변 중점 가이드]: ${textGuidelines || '전반적으로 긍정적이나 실용적인 의견 반영'}

답변만 바로 출력하세요 (따옴표나 서두 없이).
      `.trim();

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.warn('[AI Generator] Gemini API 호출 실패, 휴리스틱 엔진으로 자동 전환합니다:', err.message);
    }
  }

  // 2. 휴리스틱 규칙 기반 답변 생성 (API 키 없거나 실패 시)
  const lowerQ = questionTitle.toLowerCase();
  let pool = HEURISTIC_TEMPLATES.generalPositive;

  if (lowerQ.includes('개선') || lowerQ.includes('불편') || lowerQ.includes('바라는') || lowerQ.includes('아쉬운')) {
    pool = HEURISTIC_TEMPLATES.improvement;
  } else if (lowerQ.includes('기타') || lowerQ.includes('이유')) {
    pool = HEURISTIC_TEMPLATES.neutral;
  }

  const baseSentence = pool[Math.floor(Math.random() * pool.length)];

  // 사용자의 주관식 가이드라인이 명시되어 있다면 해당 문맥을 자연스럽게 결합
  if (textGuidelines && textGuidelines.trim().length > 0) {
    return `${textGuidelines.trim()} 측면에서 볼 때, ${baseSentence}`;
  }

  return baseSentence;
}
