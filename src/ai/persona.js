/**
 * 페르소나(실측 응답자 기반 프로필) 생성기
 * 통합 응답자 페르소나 마스터 DB(data/respondent_persona_pool.json, 1,138명)를 우선 활용하여
 * 다회차 설문 응답 시 실존 기반 이름·성별·나이와 어조를 일관되고 자연스럽게 배정합니다.
 */
import {
  pickRespondentFromPool,
  parseAgeRangeConstraint,
  normalizePoolGender,
  resolveAgeGroupLabel
} from '../utils/respondent-pool.js';

const DEFAULT_AGE_BANDS = ['20대', '30대', '40대', '50대', '60대'];
const TONES = [
  '솔직하고 꼼꼼한 어조',
  '긍정적이고 적극적인 어조',
  '차분하고 객관적인 어조',
  '간결하고 명확한 어조'
];

/**
 * 사용자 지정 페르소나 조건(성별·연령대·나이)에 맞춰 마스터 DB에서 회차별 고유 응답자 프로필 생성
 */
export function generatePersona(userPersonaConfig = {}, iterationIndex = 1, usedState = null) {
  const requestedGender = normalizePoolGender(userPersonaConfig.gender);
  const targetGender = requestedGender || (iterationIndex % 2 === 1 ? '남' : '여');

  const rawAgeHint = userPersonaConfig.ageGroup || userPersonaConfig.age || '';
  const parsedRange = parseAgeRangeConstraint(rawAgeHint);
  const fallbackBand = DEFAULT_AGE_BANDS[(Math.max(1, iterationIndex) - 1) % DEFAULT_AGE_BANDS.length];
  const fallbackRange = parseAgeRangeConstraint(fallbackBand);

  const exactAge = (!isNaN(parseInt(userPersonaConfig.exactAge, 10)))
    ? parseInt(userPersonaConfig.exactAge, 10)
    : null;
  const minAge = userPersonaConfig.minAge ?? (parsedRange ? parsedRange.minAge : fallbackRange.minAge);
  const maxAge = userPersonaConfig.maxAge ?? (parsedRange ? parsedRange.maxAge : fallbackRange.maxAge);

  const picked = pickRespondentFromPool({
    gender: targetGender,
    exactAge,
    minAge,
    maxAge,
    ageGroup: String(rawAgeHint || fallbackBand),
    seed: userPersonaConfig.seed || `persona_iter_${iterationIndex}`,
    usedState
  });

  const name = userPersonaConfig.name || picked.name;
  const genderCode = requestedGender || picked.gender;
  const genderFull = genderCode === '여' ? '여성' : '남성';
  const ageNum = exactAge || picked.age;
  const ageGroup = resolveAgeGroupLabel(ageNum);
  const birthYear = 2026 - ageNum;
  const ageDisplay = (typeof userPersonaConfig.age === 'string' && userPersonaConfig.age.trim() && isNaN(Number(userPersonaConfig.age)))
    ? userPersonaConfig.age
    : `${ageGroup} (만 ${ageNum}세)`;
  const tone = TONES[(Math.max(1, iterationIndex) - 1) % TONES.length];

  return {
    id: `persona_${iterationIndex}`,
    iteration: iterationIndex,
    seq: picked.seq,
    name,
    genderCode,
    gender: genderFull,
    ageNum,
    ageGroup,
    birthYear,
    age: ageDisplay,
    tone,
    customDescription: userPersonaConfig.description || '성실하고 일반적인 응답자',
    summary: `${name} (${genderCode}, 만 ${ageNum}세/${ageGroup}, ${tone})`
  };
}
