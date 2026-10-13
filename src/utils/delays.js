/**
 * 인간 시뮬레이션 지연 계산 유틸리티
 * 봇 탐지(Bot Detection)를 방지하기 위해 랜덤 딜레이와 점진적 타이핑 속도를 시뮬레이션합니다.
 */

/**
 * 지정된 범위 내의 임의의 밀리초(ms) 지연을 생성합니다.
 * @param {number} min 최소 지연 (ms)
 * @param {number} max 최대 지연 (ms)
 * @returns {Promise<void>}
 */
export function sleep(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 타이핑 간격 랜덤 딜레이 (사람의 키 입력 리듬)
 * @returns {number} 타이핑 지연 (ms)
 */
export function getRandomTypingDelay() {
  // 보통 사람은 글자당 40ms~120ms 사이로 타이핑함
  return Math.floor(Math.random() * 80) + 40;
}

/**
 * 페이지 전환 또는 대기 시 사람다운 반응 대기 시간
 * @returns {Promise<void>}
 */
export async function humanThinkDelay() {
  // 질문을 읽고 판단하는 시간 (1.2초 ~ 2.8초)
  await sleep(1200, 2800);
}
