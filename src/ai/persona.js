/**
 * 페르소나(가상 응답자 프로필) 생성기
 * 다회차 응답 시 다양한 인구통계학적 특성을 자연스럽게 변주합니다.
 */

const AGE_GROUPS = ['20대 초반 대학생', '20대 후반 사회초년생', '30대 직장인', '40대 기혼 직장인', '50대 자영업자'];
const GENDERS = ['남성', '여성'];
const TONES = [
  '솔직하고 꼼꼼한 어조',
  '긍정적이고 적극적인 어조',
  '차분하고 객관적인 어조',
  '간결하고 명확한 어조'
];

/**
 * 기본 페르소나 또는 사용자 지정 페르소나를 변주하여 회차별 고유 프로필 생성
 */
export function generatePersona(userPersonaConfig = {}, iterationIndex = 1) {
  const baseAge = userPersonaConfig.age || AGE_GROUPS[(iterationIndex - 1) % AGE_GROUPS.length];
  const baseGender = userPersonaConfig.gender || GENDERS[(iterationIndex - 1) % GENDERS.length];
  const tone = TONES[(iterationIndex - 1) % TONES.length];

  return {
    id: `persona_${iterationIndex}`,
    iteration: iterationIndex,
    age: baseAge,
    gender: baseGender,
    tone: tone,
    customDescription: userPersonaConfig.description || '성실하고 일반적인 소비자',
    summary: `${baseAge} ${baseGender} (${tone})`
  };
}
