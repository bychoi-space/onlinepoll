/**
 * 브라우저 자동화 세션 오케스트레이터 (Browser Automation Session)
 * Playwright 브라우저 생명주기 관리 및 전체 설문 응답 프로세스를 제어합니다.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseQuestions } from './parser.js';
import { answerQuestion, navigateOrSubmit, isSurveyCompleted } from './actor.js';
import { generatePersona } from '../ai/persona.js';
import { decideChoices } from '../ai/decision.js';
import { generateTextAnswer } from '../ai/generator.js';
import { matchBusinessField, matchBusinessOption } from '../ai/b2b-mapper.js';
import { sleep, humanThinkDelay } from '../utils/delays.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * 단일 설문 응답 세션 실행
 * @param {Object} options
 * @returns {Promise<Object>} 설문 응답 결과 리포트
 */
export async function runSurveySession(options = {}) {
  const {
    url,
    topic,
    mode = 'b2c',
    businessData = null,
    selectedB2bFields = [],
    persona: userPersona = {},
    positiveRatio = 70,
    neutralRatio = 20,
    negativeRatio = 10,
    textGuidelines = '',
    apiKey = '',
    headless = false,
    iterationIndex = 1
  } = options;

  // 1. 회차별 페르소나 또는 사업자 정보 요약 로깅
  const currentPersona = generatePersona(userPersona, iterationIndex);
  if (mode === 'b2b' && businessData) {
    logger.info(`[B2B 세션] 적용 사업자: "${businessData.companyName}" (${businessData.bizNumber || '번호없음'}) / 대표: ${businessData.ceoName}`);
  } else {
    logger.info(`[페르소나 지정] ${currentPersona.summary}`);
  }

  // 2. 브라우저 런치
  logger.info(`브라우저(Chromium)를 시작합니다... (모드: ${headless ? 'Headless' : '직접 창 표시(Headed)'})`);
  const browser = await chromium.launch({
    headless: !!headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled' // 안티-디텍션 기본 인자
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR'
  });

  const page = await context.newPage();
  const sessionLog = {
    timestamp: new Date().toISOString(),
    iteration: iterationIndex,
    url,
    persona: currentPersona,
    answers: [],
    completed: false,
    screenshotPath: null
  };

  try {
    logger.info(`설문 페이지로 이동합니다: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2000, 3000);

    let pageNum = 1;
    let isFinished = false;
    const maxPages = 10; // 무한루프 방지 안전장치

    while (!isFinished && pageNum <= maxPages) {
      logger.info(`[페이지 ${pageNum}] 설문 문항을 분석하는 중입니다...`);
      const questions = await parseQuestions(page);

      if (!questions || questions.length === 0) {
        logger.warn(`[페이지 ${pageNum}] 감지된 문항이 없습니다. 완료 화면인지 확인합니다.`);
        if (await isSurveyCompleted(page)) {
          isFinished = true;
          break;
        }
      } else {
        logger.info(`[페이지 ${pageNum}] 총 ${questions.length}개의 설문 문항이 감지되었습니다.`);

        // 문항별 응답 생성 및 입력
        for (const q of questions) {
          let chosenAnswer = null;

          // [B2B 우선 매칭] 주관식/단답형 필드가 사업자 정보에 해당하는 경우
          if (mode === 'b2b' && businessData && (q.type === 'textarea' || q.type === 'text')) {
            const b2bFieldMatch = matchBusinessField({
              questionTitle: q.title,
              businessData,
              selectedFields: selectedB2bFields
            });

            if (b2bFieldMatch.isMatched) {
              logger.info(`[B2B 데이터 주입] "${q.title.slice(0, 22)}..." -> [${b2bFieldMatch.fieldName}] "${b2bFieldMatch.value}"`);
              await answerQuestion(page, q, b2bFieldMatch.value);
              sessionLog.answers.push({
                page: pageNum,
                title: q.title,
                type: q.type,
                b2bField: b2bFieldMatch.fieldName,
                textAnswer: b2bFieldMatch.value
              });
              continue;
            }
          }

          // [B2B 우선 매칭] 객관식 보기가 사업자 업종/분류에 해당하는 경우
          if (mode === 'b2b' && businessData && (q.type === 'radio' || q.type === 'checkbox')) {
            const matchedOptIdx = matchBusinessOption({
              options: q.options || [],
              businessData
            });

            if (matchedOptIdx !== null) {
              logger.info(`[B2B 업종 일치] "${q.title.slice(0, 22)}..." -> "${q.options[matchedOptIdx]}"`);
              await answerQuestion(page, q, [matchedOptIdx]);
              sessionLog.answers.push({
                page: pageNum,
                title: q.title,
                type: q.type,
                selectedOptions: [q.options[matchedOptIdx]]
              });
              continue;
            }
          }

          // [일반 AI/규칙 로직]
          if (q.type === 'radio' || q.type === 'checkbox') {
            const isMultiple = q.type === 'checkbox';
            const selectedIndices = decideChoices({
              questionTitle: q.title,
              options: q.options || [],
              isMultipleCheck: isMultiple,
              guidelines: { positiveRatio, neutralRatio, negativeRatio },
              persona: currentPersona
            });

            chosenAnswer = selectedIndices;
            await answerQuestion(page, q, selectedIndices);

            sessionLog.answers.push({
              page: pageNum,
              title: q.title,
              type: q.type,
              selectedOptions: selectedIndices.map(idx => q.options?.[idx] || idx)
            });
          } else if (q.type === 'textarea' || q.type === 'text') {
            logger.info(`주관식 문항 답변 생성 중: "${q.title.slice(0, 20)}..."`);
            const generatedText = await generateTextAnswer({
              questionTitle: q.title,
              topic,
              textGuidelines,
              persona: currentPersona,
              apiKey
            });

            chosenAnswer = generatedText;
            await answerQuestion(page, q, generatedText);

            sessionLog.answers.push({
              page: pageNum,
              title: q.title,
              type: q.type,
              textAnswer: generatedText
            });
          }
        }
      }

      // 페이지 이동 또는 제출 버튼 클릭
      logger.info('다음 단계로 진행하기 위해 버튼을 탐색합니다...');
      const navResult = await navigateOrSubmit(page);

      if (navResult.isSubmitted) {
        logger.info('제출(Submit) 버튼을 클릭했습니다. 완료 응답을 대기합니다...');
        await sleep(3000, 4500);

        if (await isSurveyCompleted(page)) {
          logger.success('설문 완료 화면이 성공적으로 확인되었습니다!');
          isFinished = true;
        } else {
          logger.info('제출 후 대기 중...');
          isFinished = true;
        }
        break;
      } else if (navResult.hasNextPage) {
        logger.info('다음(Next) 페이지로 이동합니다...');
        await page.waitForLoadState('networkidle').catch(() => {});
        await sleep(2000, 3000);
        pageNum++;
      } else {
        logger.warn('더 이상 이동할 버튼이 없습니다. 완료 여부를 재확인합니다.');
        if (await isSurveyCompleted(page)) {
          isFinished = true;
        }
        break;
      }
    }

    // 최종 세션 완료 처리 (스크린샷 생성 제거 - 디스크 절약)
    sessionLog.screenshotPath = null;
    sessionLog.completed = isFinished;
    logger.success(`설문 세션이 성공적으로 마무리되었습니다.`);
    return sessionLog;
  } catch (error) {
    logger.error('설문 세션 진행 중 오류 발생:', error);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}
