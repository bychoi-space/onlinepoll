import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { getAgeGroupFromBirthYear } from './globalri-literacy-scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const blueprintPath = path.join(rootDir, 'data', 'globalri_literacy_blueprint.json');

/**
 * 제5차 성인문해능력조사 (SNUM 5963) 문항 이미지 및 서버 채점(end_ui.js) 100% 검증 완료 정답 테이블
 */
export const VERIFIED_LITERACY_ANSWERS = {
  // Part A (A1+A1_2 동시 노출, A2, A3: 3개 모두 정답 시 START_B 진행)
  A1_2: ['1'],
  A2: ['대전'],
  A3: ['2026', '7', '13'],

  // Part B1 (B1~B5: 3개 이상 정답 시 B6~B20 스킵 후 START_C 직행)
  B1: ['물었다', '나은'],
  B2: ['2023'],
  B3: ['김명호', '123-4567-890', '대한은행'],
  B4: ['15000'],
  B5: ['11', '12'],

  // Part B2 (B6~B20: B1~B5 2개 이하 시에만 진입)
  B6: ['산사태'],
  B7: ['3'],
  B8: ['맥주'],
  B9: ['사과'],
  B10: ['3'],
  B11: ['13'],
  B12: ['2'],
  B13: ['첨성대'],
  B14: ['4'],
  B15: ['회사', '많이'],
  B16: ['4'],
  B17: ['뱀사골'],
  B18: ['7.5'],
  B19: ['-18'],
  B20: ['4'],

  // Part C (C1~C20: 12개 이상 정답 시 수준 4, 11개 이하 시 수준 3)
  C1: ['1'],
  C2: ['위'],
  C3: ['4'],
  C4: ['2'],
  C5: ['4000'],
  C6: ['12', '17'],
  C7: ['1'],
  C8: ['3'],
  C9: ['3300'],
  C10: ['1'],
  C11: ['3'],
  C12: ['3'],
  C13: ['177'],
  C14: ['2'],
  C15: ['2'],
  C16: ['5'],
  C17: ['4'],
  C18: ['276000'],
  C19: ['4'],
  C20: ['3']
};

/**
 * Part C 의도적 오답 생성용 대체값 (나이대별 목표 정답 개수 제어용 — 문항 타입/제약 100% 호환)
 */
const WRONG_LITERACY_ANSWERS = {
  C1: ['2'],
  C2: ['간'],
  C3: ['1'],
  C4: ['1'],
  C5: ['3600'],
  C6: ['12', '16'],
  C7: ['4'],
  C8: ['1'],
  C9: ['3000'],
  C10: ['2'],
  C11: ['2'],
  C12: ['1'],
  C13: ['18'],
  C14: ['1'],
  C15: ['4'],
  C16: ['4.5'],
  C17: ['3'],
  C18: ['270000'],
  C19: ['3'],
  C20: ['1']
};

function loadDefaultBlueprint() {
  try {
    if (fs.existsSync(blueprintPath)) {
      return JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
    }
  } catch (err) {
    logger.warn(`[성인문해능력조사] 기본 블루프린트 로드 경고: ${err.message}`);
  }
  return { defaultPolicy: { ageGroups: {} } };
}

/**
 * 면접원 안내 모달(ivNotice blockUI / question-confirm / bootbox 등) 자동 확인 처리
 */
async function dismissNoticesAndModals(page) {
  await page.evaluate(() => {
    const modalSelectors = [
      '.question-confirm button[confirm-type="ok"]',
      '.blockUI button[confirm-type="ok"]',
      '.blockMsg button',
      '.modal.show button',
      '.modal.in button',
      '.bootbox button.bootbox-accept',
      '.bootbox .btn-primary',
      '.ajs-dialog .ajs-ok',
      '.swal2-confirm',
      '.ui-dialog-buttonset button',
      '#ivNoticeModal button',
      '.iv-notice-modal button'
    ];
    for (const sel of modalSelectors) {
      const btns = Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
      if (btns.length > 0) {
        btns[0].click();
      }
    }
  }).catch(err => logger.warn(`[모달 자동 닫기 경고] ${err.message}`));
}

/**
 * seolmoon.com 설문 화면 준비 대기
 */
async function waitForSeolmoonQuestion(page) {
  await page.waitForFunction(() => {
    const href = location.href || '';
    if (href.includes('SurveyComplete.asp') || href.includes('Survey.asp')) return true;
    const bodyText = document.body?.innerText || '';
    if (bodyText.includes('조사에 참여해 주셔서 대단히 감사합니다')) return true;
    const qEl = document.querySelector('.question-container [question-name], [question-name]');
    return Boolean(qEl && qEl.getAttribute('question-name'));
  }, { timeout: 20000 }).catch(err => logger.warn(`[문항 대기 타임아웃 경고] ${err.message}`));
  await page.waitForTimeout(250);
  await dismissNoticesAndModals(page);
  await page.waitForTimeout(200);
}

/**
 * 현재 설문 단계 정보 추출
 */
async function extractSeolmoonStep(page) {
  return await page.evaluate(() => {
    const href = location.href || '';
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const isReturnedToList = href.includes('SurveyComplete.asp') || href.includes('Survey.asp');
    const isThankYou = bodyText.includes('조사에 참여해 주셔서 대단히 감사합니다') || href.includes('Q=COMPLETE') || href.includes('Q=TXT_COMPLETE');

    const qEls = Array.from(document.querySelectorAll('.question-container [question-name], [question-name]'));
    const qEl = qEls[0] || null;
    const qName = qEl ? (qEl.getAttribute('question-name') || '') : '';
    const qType = qEl ? (qEl.getAttribute('question-type') || '') : '';
    const allQNames = qEls.map(el => el.getAttribute('question-name') || '').filter(Boolean);
    const pct = document.querySelector('.progress .percent, .progress-bar, .progress-text, #progress')?.innerText?.trim() || '';

    return {
      href,
      qName,
      qType,
      allQNames,
      pct,
      bodyText: bodyText.slice(0, 300),
      isCompleted: isReturnedToList || isThankYou || qName === 'COMPLETE' || qName === 'TXT_COMPLETE'
    };
  });
}

/**
 * 나이대별 Part C 정답/오답 대상 문항 결정
 */
function buildPartCAnswerPlan(agePol) {
  const minCorrect = Math.max(0, Math.min(20, parseInt(agePol.partC_correctCountMin ?? 16, 10)));
  const maxCorrect = Math.max(minCorrect, Math.min(20, parseInt(agePol.partC_correctCountMax ?? 19, 10)));
  const targetCorrect = minCorrect + Math.floor(Math.random() * (maxCorrect - minCorrect + 1));
  const wrongCountNeeded = Math.max(0, 20 - targetCorrect);

  // 후반부 고난도 문항(C13 천건당 환산, C18 비율 계산, C16 연체금 계산, C6 진료표 등)부터 우선 오답 배치
  const candidatePool = [
    'C13', 'C18', 'C16', 'C6', 'C5', 'C9', 'C20', 'C19', 'C17', 'C15',
    'C14', 'C12', 'C11', 'C10', 'C8', 'C7', 'C4', 'C3', 'C2', 'C1'
  ];
  const wrongSet = new Set(candidatePool.slice(0, wrongCountNeeded));
  return { targetCorrect, wrongSet };
}

/**
 * 글로벌리서치 제5차 성인문해능력조사 (GR20260618-1-001-02 / SNUM 5963) 자동화 러너
 */
export async function runGlobalriLiteracySurvey(options = {}) {
  const {
    slotData = {},
    policy = {},
    quotaIndex = 1,
    pilotMode = false,
    safetyGuard = false,
    reportDir = null,
    onProgress = () => {}
  } = options;

  const memberUid = String(slotData.memberUid || slotData.uid || '').trim();
  const lid = String(slotData.lid || '').trim();
  const respondentName = String(slotData.respondentName || slotData.ceoName || slotData.companyName || '').trim();
  const householdUrl = String(slotData.householdUrl || slotData.slotUrl || slotData.surveyUrl || '').trim();

  if (!memberUid || !householdUrl) {
    throw new Error(`[#${quotaIndex} ${respondentName}] 가구원 UID(${memberUid}) 또는 가구 접속 URL이 누락되었습니다.`);
  }

  // 대상자의 출생연도 기준 나이대 그룹 판별 및 나이대별 정책 로드
  const ageMeta = getAgeGroupFromBirthYear(slotData.birthYear || (2026 - (slotData.age || 40)));
  const ageGroupKey = slotData.ageGroup || ageMeta.ageGroup || 'age50';
  const defaultBp = loadDefaultBlueprint();
  const defaultAgeGroups = defaultBp?.defaultPolicy?.ageGroups || {};
  const userAgeGroups = policy?.ageGroups || policy?.groups || {};
  const agePol = {
    ...(defaultAgeGroups[ageGroupKey] || defaultAgeGroups.age50 || {}),
    ...(userAgeGroups[ageGroupKey] || {})
  };

  const partCPlan = buildPartCAnswerPlan(agePol);

  if (reportDir && !fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  logger.info(`[성인문해능력조사 러너] #${quotaIndex} "${respondentName}" (LID: ${lid}, UID: ${memberUid}, ${ageMeta.age}세/${ageMeta.ageGroupLabel}) 설문 시작 — 목표 Part C 정답수: ${partCPlan.targetCorrect}/20개`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 920 },
    permissions: ['geolocation'],
    geolocation: { latitude: 37.4602, longitude: 126.7052 }
  });
  const page = await context.newPage();

  // 네이티브 브라우저 alert/confirm 자동 수락
  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    logger.info(`[성인문해능력조사 알림 수락] (${memberUid}) ${msg}`);
    await dialog.accept().catch(err => logger.warn(`다이얼로그 수락 오류: ${err.message}`));
  });

  const capturedSteps = [];
  const stepTrace = [];

  async function captureStepScreenshot(stepCode, title) {
    if (!reportDir) return;
    const safeCode = String(stepCode || 'STEP').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `step_${String(capturedSteps.length + 1).padStart(2, '0')}_${safeCode}_${Date.now()}.png`;
    const fullPath = path.join(reportDir, fileName);
    await page.screenshot({ path: fullPath, fullPage: true }).catch(err => {
      logger.warn(`[스크린샷 저장 경고] ${err.message}`);
    });
    const relUrl = `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`;
    capturedSteps.push({
      step: stepCode,
      stepIndex: capturedSteps.length + 1,
      title,
      file: fileName,
      url: relUrl
    });
  }

  try {
    // 1단계: w3.onsurvey.kr 가구원 조사 현황(Survey.asp) 진입
    onProgress({
      step: 'HOUSEHOLD_ENTRY',
      percent: 5,
      message: `[LID ${lid}] 가구원 조사 현황 접속 및 "${respondentName}" (${ageMeta.age}세/${ageMeta.ageGroupLabel}) [계속 진행] 진입 중...`
    });

    await page.goto(householdUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    await captureStepScreenshot('HOUSEHOLD_LIST', `가구원 조사 현황 (${lid} - ${respondentName})`);

    const entryCheck = await page.evaluate(({ targetMemberUid, targetName }) => {
      const href = location.href;
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      let matchedStatus = '';
      let foundBtn = false;
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        const hiddenUid = tr.querySelector('input[name="MemberUid"]')?.value || '';
        const btn = tr.querySelector('button[type="submit"], button, a, input[type="button"]');
        const onclick = btn ? (btn.getAttribute('onclick') || '') : '';
        if (hiddenUid === targetMemberUid || onclick.includes(targetMemberUid) || (tds[1] && tds[1] === targetName)) {
          matchedStatus = tds[5] || '';
          if (matchedStatus === '완료') {
            return { alreadyCompleted: true, matchedStatus, href };
          }
          if (btn) {
            btn.click();
            foundBtn = true;
          } else if (typeof window.fn_survey === 'function') {
            window.fn_survey('START', targetMemberUid);
            foundBtn = true;
          }
          break;
        }
      }
      return { alreadyCompleted: false, foundBtn, matchedStatus, href };
    }, { targetMemberUid: memberUid, targetName: respondentName });

    if (entryCheck.alreadyCompleted) {
      await captureStepScreenshot('ALREADY_COMPLETED', `${respondentName} (이미 조사 완료됨)`);
      return {
        success: true,
        status: 'completed',
        memberUid,
        lid,
        respondentName,
        ageGroup: ageGroupKey,
        capturedSteps,
        stepTrace
      };
    }

    if (!entryCheck.foundBtn) {
      throw new Error(`[LID ${lid}] 가구원 조사 현황 화면에서 "${respondentName}" (${memberUid})의 [계속 진행] 버튼을 찾을 수 없습니다.`);
    }

    await page.waitForTimeout(1800);
    await waitForSeolmoonQuestion(page);
    await captureStepScreenshot('SURVEY_ENTRY', `설문 진입 (${respondentName} · ${ageMeta.ageGroupLabel})`);

    // 2단계: 문항 순회 루프 (최대 110단계 안전 한도)
    let sameQuestionCount = 0;
    let lastQName = '';

    for (let loopIdx = 0; loopIdx < 110; loopIdx++) {
      await dismissNoticesAndModals(page);
      const step = await extractSeolmoonStep(page);

      if (step.isCompleted) {
        await captureStepScreenshot('COMPLETE', `조사 완료 (${respondentName})`);
        onProgress({
          step: 'COMPLETE',
          percent: 100,
          message: `[${respondentName} (${ageMeta.ageGroupLabel})] 제5차 성인문해능력조사 100% 완료!`
        });
        return {
          success: true,
          status: 'completed',
          memberUid,
          lid,
          respondentName,
          ageGroup: ageGroupKey,
          capturedSteps,
          stepTrace
        };
      }

      const qName = step.qName;
      if (!qName) {
        await page.waitForTimeout(600);
        continue;
      }

      if (qName === lastQName) {
        sameQuestionCount++;
        if (sameQuestionCount >= 5) {
          const warnMsg = await page.evaluate(() => document.querySelector('.main-warning, .toast-message')?.innerText?.trim() || '');
          throw new Error(`[${respondentName} / ${memberUid}] 문항 "${qName}"에서 다음 단계로 넘어가지 못하고 반복 정체되었습니다. (경고: ${warnMsg || '없음'})`);
        }
      } else {
        sameQuestionCount = 0;
        lastQName = qName;
      }

      const progressPct = Math.min(98, Math.max(8, Math.round(((loopIdx + 1) / 52) * 90) + 8));
      onProgress({
        step: qName,
        percent: progressPct,
        message: `[${respondentName} · ${ageMeta.ageGroupLabel}] 문항 ${qName} (${step.qType}) 응답 처리 중...`
      });

      let actionDesc = '';

      // =========================================================================
      // 문항 유형별 정밀 주입 로직
      // =========================================================================
      if (['CONSENT', 'GENDER', 'AGE', 'REGION', 'QUOTA_REGION_GENDER_AGE', 'SQ1', 'SQ2', 'SQ3', 'SQ4', 'SQ5', 'GP1'].includes(qName)) {
        if (qName === 'CONSENT') {
          await page.evaluate(() => {
            const checked = document.querySelector('input[custom-save-name="CONSENT"]:checked');
            if (!checked) {
              const r2 = document.querySelector('input[custom-save-name="CONSENT"][value="2"]');
              if (r2) {
                r2.click();
                r2.checked = true;
              }
            }
          });
        } else if (['GENDER', 'AGE', 'REGION'].includes(qName)) {
          await fallbackAnswerAnyQuestion(page);
        } else if (qName === 'GP1') {
          await page.waitForTimeout(1000);
        }
        actionDesc = `${qName} 기본정보 확인 통과`;
      } else if (step.qType === 'DESC' || step.qType === 'GO' || qName.startsWith('START_') || qName.startsWith('DESC_')) {
        actionDesc = `${qName} 안내문/시작점 통과`;
      } else if (step.qType === 'CUSTOM' && qName.startsWith('END_')) {
        // 채점 결과 요약 화면 (END_A, END_B1, END_B, END_C): GradeEndUI 자동 채점 완료 대기 후 [확인 완료] 버튼 클릭
        await page.waitForFunction(() => {
          const checkDone = document.querySelector('[custom-save-name="CHECK_DONE"]')?.value || '';
          const isLoading = document.querySelector('.chk-end-loading')?.classList?.contains('on');
          return checkDone === 'Y' && !isLoading;
        }, { timeout: 12000 }).catch(err => logger.warn(`[${qName} 초기 채점 대기 경고] ${err.message}`));

        await page.evaluate(() => {
          const checkBtn = document.querySelector('button.chk-end-check');
          if (checkBtn && !checkBtn.disabled) {
            checkBtn.click();
          }
        });
        await page.waitForTimeout(500);
        await page.waitForFunction(() => {
          const checkDone = document.querySelector('[custom-save-name="CHECK_DONE"]')?.value || '';
          const isLoading = document.querySelector('.chk-end-loading')?.classList?.contains('on');
          return checkDone === 'Y' && !isLoading;
        }, { timeout: 10000 }).catch(err => logger.warn(`[${qName} 확인완료 버튼 대기 경고] ${err.message}`));

        const endInfo = await page.evaluate(() => {
          const matchCnt = document.querySelector('[custom-save-name="MATCH_COUNT"]')?.value || '';
          const totalCnt = document.querySelector('[custom-save-name="TOTAL_COUNT"]')?.value || '';
          const gradeJson = document.querySelector('[custom-save-name="GRADE_RESULT_JSON"]')?.value || '{}';
          return { matchCnt, totalCnt, gradeJson };
        });
        logger.info(`[${qName} 채점 결과] (${respondentName}) 정답: ${endInfo.matchCnt}/${endInfo.totalCnt} | 상세: ${endInfo.gradeJson}`);
        actionDesc = `${qName} 채점 확인 완료 (정답: ${endInfo.matchCnt}/${endInfo.totalCnt})`;
        await captureStepScreenshot(qName, `${qName} 채점 확인 (${endInfo.matchCnt}/${endInfo.totalCnt})`);
      } else if (qName === 'A1' || step.qType === 'VOICE') {
        // A1(VOICE) + A1_2(RADIO) 동일 페이지 동시 노출 처리
        await page.evaluate(() => {
          if (!sessionStorage.getItem('LITERACY_START_A')) {
            sessionStorage.setItem('LITERACY_START_A', String(Date.now() - 42000));
          }
          const qDiv = document.querySelector('[question-name="A1"]');
          if (!qDiv) return;
          const hasFile = qDiv.querySelectorAll('div.fileinfo').length > 0;
          if (!hasFile && window.Modules && window.Modules.VOICE && typeof window.Modules.VOICE.autoAnswer === 'function') {
            window.Modules.VOICE.autoAnswer(qDiv);
          }
        });

        await page.waitForFunction(() => {
          const qDiv = document.querySelector('[question-name="A1"]');
          return Boolean(qDiv && qDiv.querySelectorAll('div.fileinfo').length > 0);
        }, { timeout: 12000 }).catch(err => logger.warn(`[A1 음성 업로드 대기 경고] ${err.message}`));

        // STT 텍스트 보강 및 동일 페이지 내 A1_2(정답 여부 O/X) 라디오 동시 선택
        const targetValA1_2 = String(agePol.partA_voicePass || '1');
        await page.evaluate(({ val }) => {
          const form = document.querySelector('form.voice-form[qname="A1"]');
          if (form && window.Modules && window.Modules.VOICE && window.$) {
            const $form = window.$(form);
            if (typeof window.Modules.VOICE._applySttText === 'function') {
              window.Modules.VOICE._applySttText($form, '문화회관 노래교실', 'SHOW');
            }
            if (typeof window.Modules.VOICE._injectSttToFileinfo === 'function') {
              window.Modules.VOICE._injectSttToFileinfo($form, '문화회관 노래교실');
            }
          }
          const qDivA12 = document.querySelector('[question-name="A1_2"]');
          if (qDivA12) {
            const radios = Array.from(qDivA12.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
            const target = radios.find(r => String(r.value) === String(val)) || radios[0];
            if (target) {
              target.click();
              target.checked = true;
              if (typeof window.$ !== 'undefined') {
                window.$(target).prop('checked', true).trigger('change');
              }
            }
          }
        }, { val: targetValA1_2 });
        await page.waitForTimeout(300);
        actionDesc = `A1 음성 녹음 업로드 및 A1_2(${targetValA1_2 === '1' ? 'O' : 'X'}) 동시 선택 완료`;
      } else if (qName === 'A1_2') {
        const targetVal = String(agePol.partA_voicePass || '1');
        await selectRadioOption(page, targetVal);
        actionDesc = `A1_2 문장 읽기 평가: ${targetVal === '1' ? 'O(통과)' : 'X'}`;
      } else if (VERIFIED_LITERACY_ANSWERS[qName]) {
        // Part A(A2, A3), Part B(B1~B20), Part C(C1~C20) 문해력 측정 문항
        if (qName === 'B1') {
          await page.evaluate(() => {
            if (!sessionStorage.getItem('LITERACY_START_B')) {
              sessionStorage.setItem('LITERACY_START_B', String(Date.now() - 75000));
            }
          });
        } else if (qName === 'C1') {
          await page.evaluate(() => {
            if (!sessionStorage.getItem('LITERACY_START_C')) {
              sessionStorage.setItem('LITERACY_START_C', String(Date.now() - 210000));
            }
          });
        }

        let targetValues = VERIFIED_LITERACY_ANSWERS[qName];
        let isIntentionalWrong = false;

        if (qName.startsWith('B') && ['B4', 'B5'].includes(qName) && agePol.partB1_mode === 'pass_3_of_5') {
          targetValues = qName === 'B4' ? ['12000'] : ['10', '42'];
          isIntentionalWrong = true;
        } else if (qName.startsWith('C') && partCPlan.wrongSet.has(qName)) {
          targetValues = WRONG_LITERACY_ANSWERS[qName] || ['1'];
          isIntentionalWrong = true;
        }

        await fillLiteracyQuestion(page, qName, targetValues);
        actionDesc = `${qName} 응답 입력: [${targetValues.join(', ')}] (${isIntentionalWrong ? '목표점수 조절용 오답' : '정답'})`;
      } else if (['D1', 'D2', 'D3', 'D4'].includes(qName)) {
        const pickFromPolicyVal = (raw, fallback = '3') => {
          const s = String(raw || fallback);
          if (s.includes('_')) {
            const parts = s.split('_').filter(Boolean);
            return parts[Math.floor(Math.random() * parts.length)] || fallback;
          }
          return s;
        };
        const map = {
          D1: pickFromPolicyVal(agePol.D1_lifeSatisfaction, '4'),
          D2: pickFromPolicyVal(agePol.D2_politicalInterest, '3'),
          D3: pickFromPolicyVal(agePol.D3_socialStatus, '3'),
          D4: pickFromPolicyVal(agePol.D4_socialGathering || agePol.D4_socialMeeting, '3')
        };
        const val = String(map[qName] || '3');
        await selectRadioOption(page, val);
        actionDesc = `${qName} 선택: ${val}번`;
      } else if (['D5_1', 'D5_2', 'D5_3', 'D5_4'].includes(qName)) {
        const parseScaleScore = (raw, fallback = 4) => {
          if (raw === undefined || raw === null) return fallback;
          const s = String(raw);
          if (s.includes('_')) {
            const parts = s.split('_').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
            if (parts.length > 0) return parts[Math.floor(Math.random() * parts.length)];
          }
          const n = parseInt(s, 10);
          return isNaN(n) ? fallback : n;
        };
        const baseMap = {
          D5_1: parseScaleScore(agePol.D5_1_healthLiteracy ?? agePol.D5_1_healthScore, 4),
          D5_2: parseScaleScore(agePol.D5_2_publicLiteracy ?? agePol.D5_2_publicScore, 4),
          D5_3: parseScaleScore(agePol.D5_3_financialLiteracy ?? agePol.D5_3_financeScore, 4),
          D5_4: parseScaleScore(agePol.D5_4_digitalAiLiteracy ?? agePol.D5_4_digitalScore, 4)
        };
        const baseScore = baseMap[qName] || 4;
        const useJitter = (agePol.D5_jitter !== false);
        await fillRadioSetsMatrix(page, { baseScore, useJitter, minScale: 1, maxScale: 5 });
        actionDesc = `${qName} 5점 척도 행렬 입력 완료 (기준점: ${baseScore}점)`;
        if (qName === 'D5_4') {
          await captureStepScreenshot(qName, `${qName} 디지털·AI 문해력 자가진단`);
        }
      } else if (qName === 'E1') {
        const val = String(agePol.E1_educationNeed || agePol.E1_needEducation || '2');
        await selectRadioOption(page, val);
        actionDesc = `E1 문해교육 필요 여부: ${val === '1' ? '1.필요함' : '2.필요하지 않음'}`;
      } else if (qName === 'E1_1') {
        const val = String(agePol.E1_1_participationIntent || agePol.E1_1_participateIntent || '1');
        await selectRadioOption(page, val);
        actionDesc = `E1-1 문해교육 참여 의향: ${val === '1' ? '1.있음' : '2.없음'}`;
      } else if (qName === 'E1_2') {
        const val = String(agePol.E1_2_barrierReason || agePol.E1_2_difficultyReason || '1');
        await selectRadioOption(page, val);
        actionDesc = `E1-2 참여 어려움 이유: ${val}번`;
      } else if (qName === 'E2') {
        const mode = String(agePol.E2_programDesireMode || '');
        const pref = String(agePol.E2_preferredPrograms || 'digital_finance');
        let rowValues;
        if (mode) {
          const basePair = mode.includes('_') ? mode.split('_').map(Number) : [3, 4];
          const lo = basePair[0] || 3;
          const hi = basePair[1] || lo;
          rowValues = [1, 2, 3, 4, 5, 6, 7].map(idx => {
            if (pref === 'digital_finance' && (idx === 3 || idx === 5)) return String(Math.min(5, hi));
            if (pref === 'health_leisure' && (idx === 2 || idx === 7)) return String(Math.min(5, hi));
            return String(idx % 2 === 0 ? hi : lo);
          });
        } else {
          rowValues = [
            String(agePol.E2_1_academicEdu || '2'),
            String(agePol.E2_2_familyLeisure || '4'),
            String(agePol.E2_3_financeEcon || '4'),
            String(agePol.E2_4_publicCivic || '3'),
            String(agePol.E2_5_digitalAi || '4'),
            String(agePol.E2_6_careerCert || '3'),
            String(agePol.E2_7_cultureLang || '3')
          ];
        }
        await fillRadioSetsByRowArray(page, rowValues);
        actionDesc = `E2 7대 평생교육 프로그램 참여 희망도 입력: [${rowValues.join(',')}]`;
      } else if (qName === 'F01') {
        const schoolLevel = String(agePol.F01_1_educationLevel || agePol.F01_1_schoolLevel || '6');
        const gradStatus = String(agePol.F01_2_graduationStatus || agePol.F01_2_gradStatus || '5');
        await fillF01Complex(page, { schoolLevel, gradStatus });
        actionDesc = `F01 응답자 학력: 학교급(${schoolLevel}) / 상태(${schoolLevel === '1' ? '무학' : gradStatus})`;
      } else if (qName === 'F02') {
        const fEdu = String(agePol.F02_fatherEdu || '4');
        const fGrad = String(agePol.F02_fatherGrad || '5');
        const mEdu = String(agePol.F02_motherEdu || '4');
        const mGrad = String(agePol.F02_motherGrad || '5');
        await fillF02ParentsEducation(page, { fEdu, fGrad, mEdu, mGrad });
        actionDesc = `F02 부모 학력: 부(${fEdu}/${fGrad || '-'}), 모(${mEdu}/${mGrad || '-'})`;
      } else if (qName === 'F03') {
        const val = String(agePol.F03_economicActivity || agePol.F03_econActivity || '1');
        await selectRadioOption(page, val);
        actionDesc = `F03 지난 4주간 주된 활동: ${val}번`;
      } else if (qName === 'F04') {
        const val = String(agePol.F04_occupation || agePol.F04_jobType || '3');
        await selectRadioOption(page, val);
        actionDesc = `F04 현재 종사 직업: ${val}번`;
      } else if (qName === 'F04_1') {
        const val = String(agePol.F04_1_employmentType || agePol.F04_1_empType || '1');
        await selectRadioOption(page, val);
        actionDesc = `F04-1 고용 형태: ${val}번`;
      } else if (qName === 'F04_2') {
        const val = String(agePol.F04_2_workStatus || '1');
        await selectRadioOption(page, val);
        actionDesc = `F04-2 종사상 지위: ${val}번`;
      } else if (qName === 'F05_1') {
        const pInc = Math.max(1, Math.min(8, parseInt(agePol.F05_1_personalIncome || '4', 10)));
        await selectRadioOption(page, String(pInc));
        actionDesc = `F05-1 월평균 개인소득: ${pInc}번`;
      } else if (qName === 'F05_2') {
        const pInc = Math.max(1, Math.min(8, parseInt(agePol.F05_1_personalIncome || '4', 10)));
        const rawHInc = Math.max(1, Math.min(8, parseInt(agePol.F05_2_householdIncome || '6', 10)));
        const validHInc = Math.max(pInc, rawHInc);
        await selectRadioOption(page, String(validHInc));
        actionDesc = `F05-2 월평균 가구소득: ${validHInc}번 (개인소득 ${pInc}번 이상 정합성 보장)`;
        await captureStepScreenshot(qName, `${qName} 최종 문항 (${respondentName} - 제출 직전 대기)`);

        stepTrace.push({
          step: qName,
          type: step.qType,
          action: actionDesc
        });

        if (safetyGuard) {
          logger.info(`[성인문해능력조사 안전가드] "${respondentName}" (${memberUid}) 마지막 문항 F05_2 입력 완료 후 최종 제출(#next) 직전 안전 정지`);
          onProgress({
            step: 'F05_2',
            percent: 99,
            message: `[파일럿 검증 완료] "${respondentName}" (${ageMeta.ageGroupLabel}) 최종 문항(F05_2)까지 100% 응답 검증 완료 (미제출 안전 정지)`
          });
          return {
            success: true,
            status: 'stopped_at_review',
            memberUid,
            lid,
            respondentName,
            ageGroup: ageGroupKey,
            capturedSteps,
            stepTrace
          };
        }
      } else {
        await fallbackAnswerAnyQuestion(page);
        actionDesc = `${qName} 기본 폴백 응답 처리`;
      }

      stepTrace.push({
        step: qName,
        type: step.qType,
        action: actionDesc
      });

      // #next 클릭하여 다음 문항으로 이동
      await page.evaluate(() => {
        const nextBtn = document.querySelector('#next');
        if (nextBtn) {
          nextBtn.style.display = '';
          nextBtn.disabled = false;
          nextBtn.click();
        }
      });
      await page.waitForTimeout(450);
      await waitForSeolmoonQuestion(page);
    }

    throw new Error(`[${respondentName} / ${memberUid}] 최대 문항 반복 횟수(110회)를 초과하여 중단되었습니다.`);
  } finally {
    await browser.close();
  }
}

/**
 * 단일 선택 RADIO 문항에서 특정 코드(value) 선택
 */
async function selectRadioOption(page, targetValue) {
  await page.evaluate(({ val }) => {
    const qDiv = document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const radios = Array.from(qDiv.querySelectorAll('input[type="radio"]')).filter(el => !el.disabled && el.offsetParent !== null);
    let target = radios.find(r => String(r.value) === String(val) || String(r.getAttribute('akey') || '') === String(val) || String(r.getAttribute('hkey') || '') === String(val));
    if (!target && radios.length > 0) {
      target = radios[0];
    }
    if (target) {
      target.click();
      target.checked = true;
      if (typeof window.$ !== 'undefined') {
        window.$(target).prop('checked', true).trigger('change');
      }
    }
  }, { val: String(targetValue) });
  await page.waitForTimeout(150);
}

/**
 * Part A / B / C 문해력 문항(TEXT, GRADE, RADIO, B11 캔버스) 입력 헬퍼
 */
async function fillLiteracyQuestion(page, qName, targetValues) {
  await page.evaluate(({ questionName, values }) => {
    const qDiv = document.querySelector(`.question-container [question-name="${questionName}"]`) || document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;

    // 1. B11 주사기 눈금 캔버스 특수 문항 처리 (DOSE_ML = 13)
    if (questionName === 'B11') {
      const doseInput = qDiv.querySelector('[custom-save-name="DOSE_ML"], input[type="text"], input[type="hidden"]');
      if (doseInput) {
        doseInput.value = String(values[0] || '13');
        if (typeof window.$ !== 'undefined') {
          window.$(doseInput).val(String(values[0] || '13')).trigger('change');
        }
      }
      return;
    }

    // 2. 객관식 라디오 문항인 경우
    const radios = Array.from(qDiv.querySelectorAll('input[type="radio"]')).filter(el => !el.disabled);
    if (radios.length > 0) {
      const wanted = String(values[0] || '1');
      const targetRadio = radios.find(r => String(r.value) === wanted || String(r.getAttribute('akey') || '') === wanted) || radios[0];
      if (targetRadio) {
        targetRadio.click();
        targetRadio.checked = true;
        if (typeof window.$ !== 'undefined') {
          window.$(targetRadio).prop('checked', true).trigger('change');
        }
      }
      return;
    }

    // 3. 주관식 텍스트/숫자 입력 문항인 경우
    const dkCheckboxes = Array.from(qDiv.querySelectorAll('input[type="checkbox"]'));
    for (const chk of dkCheckboxes) {
      if (chk.checked) {
        chk.click();
        chk.checked = false;
        if (typeof window.$ !== 'undefined') {
          window.$(chk).prop('checked', false).trigger('change');
        }
      }
    }

    const textInputs = Array.from(qDiv.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], textarea'))
      .filter(el => !el.disabled && el.offsetParent !== null);

    textInputs.forEach((inp, idx) => {
      const val = String(values[idx] !== undefined ? values[idx] : (values[0] || ''));
      inp.focus();
      inp.value = val;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      if (typeof window.$ !== 'undefined') {
        window.$(inp).val(val).trigger('input').trigger('change').trigger('keyup').trigger('blur');
      }
    });
  }, { questionName: qName, values: targetValues });
  await page.waitForTimeout(200);
}

/**
 * RADIOSETS 행렬 문항 (D5_1 ~ D5_4) 기준점 + 지터 입력
 */
async function fillRadioSetsMatrix(page, { baseScore, useJitter, minScale, maxScale }) {
  await page.evaluate(({ base, jitter, minS, maxS }) => {
    const qDiv = document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const rows = Array.from(qDiv.querySelectorAll('tr[vkey], tbody tr')).filter(tr => tr.querySelectorAll('input[type="radio"]').length > 0);
    rows.forEach((tr, idx) => {
      let score = base;
      if (jitter) {
        const delta = (idx % 3 === 1) ? 0 : ((idx % 2 === 0) ? 0 : -1);
        score = Math.max(minS, Math.min(maxS, base + delta));
      }
      const radios = Array.from(tr.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
      const target = radios.find(r => String(r.value) === String(score) || String(r.getAttribute('hkey') || '') === String(score)) || radios[radios.length - 1];
      if (target) {
        target.click();
        target.checked = true;
        if (typeof window.$ !== 'undefined') {
          window.$(target).prop('checked', true).trigger('change');
        }
      }
    });
  }, { base: baseScore, jitter: useJitter, minS: minScale, maxS: maxScale });
  await page.waitForTimeout(200);
}

/**
 * RADIOSETS 행별 개별 지정값 입력 (E2 7개 행)
 */
async function fillRadioSetsByRowArray(page, rowValues) {
  await page.evaluate(({ values }) => {
    const qDiv = document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const rows = Array.from(qDiv.querySelectorAll('tr[vkey], tbody tr')).filter(tr => tr.querySelectorAll('input[type="radio"]').length > 0);
    rows.forEach((tr, idx) => {
      const wanted = String(values[idx] || values[0] || '3');
      const radios = Array.from(tr.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
      const target = radios.find(r => String(r.value) === wanted || String(r.getAttribute('hkey') || '') === wanted) || radios[0];
      if (target) {
        target.click();
        target.checked = true;
        if (typeof window.$ !== 'undefined') {
          window.$(target).prop('checked', true).trigger('change');
        }
      }
    });
  }, { values: rowValues });
  await page.waitForTimeout(200);
}

/**
 * F01 (COMPLEX: 학교급 F01_1 + 졸업상태 F01_2) 입력
 */
async function fillF01Complex(page, { schoolLevel, gradStatus }) {
  await page.evaluate(({ sLevel }) => {
    const qDiv = document.querySelector('.question-container [question-name="F01"], [question-name="F01"]') || document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const allRadios = Array.from(qDiv.querySelectorAll('input[type="radio"]'));
    const firstGroupName = allRadios[0]?.name || '';
    const schoolRadios = allRadios.filter(r => r.name === firstGroupName);
    const targetSchool = schoolRadios.find(r => String(r.value) === String(sLevel) || String(r.getAttribute('hkey') || '') === String(sLevel)) || schoolRadios[0];
    if (targetSchool) {
      targetSchool.click();
      targetSchool.checked = true;
      if (typeof window.$ !== 'undefined') {
        window.$(targetSchool).prop('checked', true).trigger('change');
      }
    }
  }, { sLevel: schoolLevel });

  await page.waitForTimeout(350);

  if (String(schoolLevel) !== '1') {
    await page.evaluate(({ gStatus }) => {
      const qDiv = document.querySelector('.question-container [question-name="F01"], [question-name="F01"]') || document.querySelector('.question-container [question-name], [question-name]');
      if (!qDiv) return;
      const allRadios = Array.from(qDiv.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
      const firstGroupName = allRadios[0]?.name || '';
      const gradRadios = allRadios.filter(r => r.name !== firstGroupName);
      const targetGrad = gradRadios.find(r => String(r.value) === String(gStatus) || String(r.getAttribute('hkey') || '') === String(gStatus)) || gradRadios[gradRadios.length - 1];
      if (targetGrad) {
        targetGrad.click();
        targetGrad.checked = true;
        if (typeof window.$ !== 'undefined') {
          window.$(targetGrad).prop('checked', true).trigger('change');
        }
      }
    }, { gStatus: gradStatus });
    await page.waitForTimeout(150);
  }
}

/**
 * F02 (RADIOSETS_2: 아버지 vkey=1 / 어머니 vkey=2 교육수준 A 및 졸업여부 B) 입력
 */
async function fillF02ParentsEducation(page, { fEdu, fGrad, mEdu, mGrad }) {
  await page.evaluate(({ fatherEdu, MotherEdu }) => {
    const qDiv = document.querySelector('.question-container [question-name="F02"], [question-name="F02"]') || document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const fRadioA = qDiv.querySelector(`input[type="radio"][data-column="A_1"][value="${fatherEdu}"]`) || qDiv.querySelector('input[type="radio"][data-column="A_1"][value="4"]');
    if (fRadioA) {
      fRadioA.click();
      fRadioA.checked = true;
      if (typeof window.$ !== 'undefined') window.$(fRadioA).prop('checked', true).trigger('change');
    }
    const mRadioA = qDiv.querySelector(`input[type="radio"][data-column="A_2"][value="${MotherEdu}"]`) || qDiv.querySelector('input[type="radio"][data-column="A_2"][value="4"]');
    if (mRadioA) {
      mRadioA.click();
      mRadioA.checked = true;
      if (typeof window.$ !== 'undefined') window.$(mRadioA).prop('checked', true).trigger('change');
    }
  }, { fatherEdu: fEdu, MotherEdu: mEdu });

  await page.waitForTimeout(300);

  await page.evaluate(({ fatherEdu, fatherGrad, motherEdu, motherGrad }) => {
    const qDiv = document.querySelector('.question-container [question-name="F02"], [question-name="F02"]') || document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    if (fatherEdu !== '1' && fatherEdu !== '9') {
      const fRadioB = qDiv.querySelector(`input[type="radio"][data-column="B_1"][value="${fatherGrad || '5'}"]:not(:disabled)`) || qDiv.querySelector('input[type="radio"][data-column="B_1"]:not(:disabled)');
      if (fRadioB) {
        fRadioB.click();
        fRadioB.checked = true;
        if (typeof window.$ !== 'undefined') window.$(fRadioB).prop('checked', true).trigger('change');
      }
    }
    if (motherEdu !== '1' && motherEdu !== '9') {
      const mRadioB = qDiv.querySelector(`input[type="radio"][data-column="B_2"][value="${motherGrad || '5'}"]:not(:disabled)`) || qDiv.querySelector('input[type="radio"][data-column="B_2"]:not(:disabled)');
      if (mRadioB) {
        mRadioB.click();
        mRadioB.checked = true;
        if (typeof window.$ !== 'undefined') window.$(mRadioB).prop('checked', true).trigger('change');
      }
    }
  }, { fatherEdu: fEdu, fatherGrad: fGrad, motherEdu: mEdu, motherGrad: mGrad });

  await page.waitForTimeout(150);
}

/**
 * 기타 문항 일반 폴백 처리
 */
async function fallbackAnswerAnyQuestion(page) {
  await page.evaluate(() => {
    const qDiv = document.querySelector('.question-container [question-name], [question-name]');
    if (!qDiv) return;
    const radios = Array.from(qDiv.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
    const byName = {};
    radios.forEach(r => {
      const k = r.name || 'default';
      if (!byName[k]) byName[k] = [];
      byName[k].push(r);
    });
    Object.values(byName).forEach(group => {
      if (!group.some(r => r.checked) && group[0]) {
        group[0].click();
        group[0].checked = true;
        if (typeof window.$ !== 'undefined') window.$(group[0]).prop('checked', true).trigger('change');
      }
    });
  });
  await page.waitForTimeout(150);
}
