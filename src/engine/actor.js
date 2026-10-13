/**
 * 인간 시뮬레이션 액터 (Human Actor Module)
 * 설문 요소 클릭, 사람다운 타이핑, 스크롤 이동 및 제출 버튼 인터랙션을 수행합니다.
 */
import { sleep, getRandomTypingDelay, humanThinkDelay } from '../utils/delays.js';
import { logger } from '../utils/logger.js';

/**
 * 특정 질문에 대한 인터랙션 수행
 * @param {import('playwright').Page} page
 * @param {Object} question
 * @param {Array<number>|string} answer
 */
export async function answerQuestion(page, question, answer) {
  const { index, type, title } = question;

  // 1. 해당 문항으로 시선 이동 (부드러운 스크롤)
  await page.evaluate((idx) => {
    const items = document.querySelectorAll('div[role="listitem"]');
    if (items && items[idx]) {
      items[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, index);

  await sleep(400, 800);

  // 2. 문항 유형별 인터랙션
  if (type === 'radio') {
    // answer는 [선택된 인덱스] 형태
    const targetIdx = Array.isArray(answer) ? answer[0] : 0;
    const clicked = await page.evaluate(({ qIdx, optIdx }) => {
      const items = document.querySelectorAll('div[role="listitem"]');
      if (!items || !items[qIdx]) return false;
      const radios = items[qIdx].querySelectorAll('[role="radio"]');
      if (radios && radios[optIdx]) {
        radios[optIdx].click();
        return true;
      }
      return false;
    }, { qIdx: index, optIdx: targetIdx });

    logger.info(`[객관식 선택] "${title.slice(0, 25)}..." -> ${question.options?.[targetIdx] || (targetIdx + 1) + '번'}`);
    await sleep(500, 1000);
  } else if (type === 'checkbox') {
    // answer는 [인덱스1, 인덱스2...] 형태
    const targetIndices = Array.isArray(answer) ? answer : [0];
    for (const optIdx of targetIndices) {
      await page.evaluate(({ qIdx, oIdx }) => {
        const items = document.querySelectorAll('div[role="listitem"]');
        if (!items || !items[qIdx]) return;
        const cbs = items[qIdx].querySelectorAll('[role="checkbox"]');
        if (cbs && cbs[oIdx]) {
          cbs[oIdx].click();
        }
      }, { qIdx: index, oIdx: optIdx });

      await sleep(300, 600);
    }
    logger.info(`[복수선택 완료] "${title.slice(0, 25)}..." -> ${targetIndices.length}개 항목 체크`);
  } else if (type === 'textarea' || type === 'text') {
    // 주관식 입력 필드 탐색
    const textSelector = type === 'textarea' ? 'textarea' : 'input[type="text"]';
    const textToType = typeof answer === 'string' ? answer : String(answer);

    // 해당 필드에 포커스
    const isFocused = await page.evaluate(({ qIdx, selector }) => {
      const items = document.querySelectorAll('div[role="listitem"]');
      if (!items || !items[qIdx]) return false;
      const el = items[qIdx].querySelector(selector);
      if (el) {
        el.focus();
        el.value = ''; // 초기화
        return true;
      }
      return false;
    }, { qIdx: index, selector: textSelector });

    if (isFocused) {
      // 사람처럼 타이핑
      for (const char of textToType) {
        await page.keyboard.type(char, { delay: getRandomTypingDelay() });
      }
      logger.info(`[주관식 입력 완료] "${title.slice(0, 25)}..." -> "${textToType.slice(0, 30)}..."`);
    }
    await sleep(600, 1200);
  }
}

/**
 * 다음 페이지 또는 제출 버튼 탐색 및 클릭
 * @param {import('playwright').Page} page
 * @returns {Promise<{ isSubmitted: boolean, hasNextPage: boolean }>}
 */
export async function navigateOrSubmit(page) {
  await humanThinkDelay();

  // 버튼 텍스트 기반 탐색 (구글 폼 및 일반 웹 폼)
  const result = await page.evaluate(() => {
    // 버튼 요소 및 역할이 버튼인 요소들 검색
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button, input[type="submit"]'));

    // 1. 제출(Submit) 버튼 우선 탐색
    const submitBtn = buttons.find(b => {
      const text = b.innerText?.trim() || b.getAttribute('value') || '';
      return text.includes('제출') || text.toLowerCase().includes('submit') || text.includes('완료');
    });

    if (submitBtn) {
      submitBtn.click();
      return { isSubmitted: true, hasNextPage: false };
    }

    // 2. 다음(Next) 버튼 탐색
    const nextBtn = buttons.find(b => {
      const text = b.innerText?.trim() || b.getAttribute('value') || '';
      return text.includes('다음') || text.toLowerCase().includes('next');
    });

    if (nextBtn) {
      nextBtn.click();
      return { isSubmitted: false, hasNextPage: true };
    }

    return { isSubmitted: false, hasNextPage: false };
  });

  return result;
}

/**
 * 설문 완료 화면 도달 여부 확인
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
export async function isSurveyCompleted(page) {
  return await page.evaluate(() => {
    const bodyText = document.body.innerText;
    return (
      bodyText.includes('응답이 기록되었습니다') ||
      bodyText.includes('제출되었습니다') ||
      bodyText.includes('참여해 주셔서 감사합니다') ||
      bodyText.includes('Your response has been recorded') ||
      bodyText.includes('Thank you for completing')
    );
  });
}
