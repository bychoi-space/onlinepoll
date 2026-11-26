/**
 * 브라우저 자동화 세션 오케스트레이터 (Browser Automation Session)
 * Playwright 브라우저 생명주기 관리 및 전체 설문 응답 프로세스를 제어합니다.
 */
import { launchChromium } from '../utils/chromium-launcher.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseQuestions } from './parser.js';
import { answerQuestion, navigateOrSubmit, isSurveyCompleted } from './actor.js';
import { generatePersona } from '../ai/persona.js';
import { decideChoices } from '../ai/decision.js';
import { generateTextAnswer } from '../ai/generator.js';
import { matchBusinessField, matchBusinessOption } from '../ai/b2b-mapper.js';
import { fillMissingRespondentProfile } from '../utils/respondent-pool.js';
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
    businessData: rawBusinessData = null,
    selectedB2bFields = [],
    persona: userPersona = {},
    respondentUsedState = null,
    positiveRatio = 70,
    neutralRatio = 20,
    negativeRatio = 10,
    textGuidelines = '',
    apiKey = '',
    headless = false,
    iterationIndex = 1
  } = options;

  // 1. 회차별 페르소나 또는 사업자 정보 요약 로깅 (마스터 응답자 DB 1,138명 자동 연동)
  const businessData = rawBusinessData
    ? fillMissingRespondentProfile(rawBusinessData, {
        mode: mode === 'b2b' ? 'b2b' : 'auto',
        usedState: respondentUsedState,
        seedFallback: iterationIndex
      })
    : null;

  const mergedPersonaConfig = businessData
    ? {
        ...userPersona,
        name: businessData.name || businessData.respondentName || businessData.ceoName || userPersona.name,
        gender: businessData.gender || businessData.ceoGender || userPersona.gender,
        exactAge: businessData.age || businessData.ceoAge || userPersona.exactAge
      }
    : userPersona;

  const currentPersona = generatePersona(mergedPersonaConfig, iterationIndex, respondentUsedState);
  if (mode === 'b2b' && businessData) {
    logger.info(`[B2B 세션] 적용 사업자: "${businessData.companyName}" (${businessData.bizNumber || '번호없음'}) / 대표: ${businessData.ceoName} (${businessData.ceoGender || currentPersona.genderCode}, ${businessData.ceoAge || currentPersona.ageNum}세)`);
  } else {
    logger.info(`[응답자 페르소나 배정] ${currentPersona.summary}`);
  }

  // 2. 브라우저 런치
  logger.info(`브라우저(Chromium)를 시작합니다... (모드: ${headless ? 'Headless' : '직접 창 표시(Headed)'})`);
  let browser = null;
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
    browser = await launchChromium({
      headless: !!headless,
      args: [
        '--disable-blink-features=AutomationControlled' // 안티-디텍션 기본 인자
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR'
    });

    const page = await context.newPage();

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
            const titleText = String(q.title || '').trim();
            let directDemographicVal = null;
            if (/(응답자|본인|귀하|참여자)?\s*(성명|이름)/.test(titleText) && !/상호|사업체|회사|건물|학교|브랜드|제품/.test(titleText)) {
              directDemographicVal = currentPersona.name;
            } else if (/(출생\s*연도|출생년도|생년|태어난\s*해)/.test(titleText)) {
              directDemographicVal = String(currentPersona.birthYear);
            } else if (/(만\s*나이|연령|나이)/.test(titleText) && q.type === 'text' && !/이유|사유|의견/.test(titleText)) {
              directDemographicVal = String(currentPersona.ageNum);
            }

            if (directDemographicVal) {
              logger.info(`[응답자 DB 자동 주입] "${titleText.slice(0, 22)}..." -> "${directDemographicVal}"`);
              chosenAnswer = directDemographicVal;
              await answerQuestion(page, q, directDemographicVal);
              sessionLog.answers.push({
                page: pageNum,
                title: q.title,
                type: q.type,
                textAnswer: directDemographicVal
              });
              continue;
            }

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
        await page.waitForLoadState('networkidle').catch(err => console.warn('[networkidle 대기 경고]', err.message));
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
    if (browser) {
      await browser.close().catch(e => console.warn('[Browser close 경고]', e.message));
    }
  }
}
