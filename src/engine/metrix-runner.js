/**
 * AutoSurvey AI - 메트릭스(Metrix GetData SNUM 622) 전용 설문 자동화 실행 엔진 (v2.0 전 문항 완비)
 *
 * [핵심 특징]
 * 1. 단일 SPA DOM 구조 비동기 페이지 전환 (POST /Join/Next AJAX) 완벽 동기화
 * 2. 2차년도 패널 실측 데이터(slotData.rawMeta: AA1~AA15, M8~M62) 스마트 계승 및 시계열 정합성 보장
 * 3. STEP 2 전 문항(A1~A15, 문8~문67, 총 120단계) 가이드라인 1:1 매핑:
 *    - [파트 A] 사업체 일반현황 (A1~A15): 주소 Readonly 바인딩, 프랜차이즈(AA5), 면적(AA6), 입지(AA7), 창업형태(AA8), 개업연월(AA9), 출생연도(AA13), 창업전지위(AA15)
 *    - [파트 B] 영업 및 디지털 전환 (문8~문9): 개점/폐점 시각(M8-1), 정기휴무(M8-2), 온라인/배달앱(M9), 스마트기술(M9-1~2)
 *    - [파트 C] 경영실적·6대 영업비용·대표자 소득 (문10~문13): 2025 실적 추세 계수 반영, 변동 사유 1·2순위, 6대 비용 100% 밸런서, 월평균 순소득(M13)
 *    - [파트 D] 6대 결제수단 & 부채 구조 (문14~문15): 6대 결제수단 100% 밸런서, 부채 유무(M15), 총 부채액(M15-1), 4대 차입처 100% 밸런서, 차입 사유 1·2순위(M15-2)
 *    - [파트 E] 임대차·계약기간·권리금 (문16~문18): 점유 형태(M16), 보증금·월세(M16-1), 계약기간(M16-3), 권리금 유무·금액·회수전망(M17~M18)
 *    - [파트 F] 창업·경영애로·상권경쟁·향후계획 (문19~문29): 애로사항 1·2순위(M22), 상권경쟁(M24), 사업지속의향(M26), 전환/폐업 사유(M27~M29)
 *    - [파트 G] 고용·근무시간·4대보험·급여 (문31~문39): 종사자수(M31~M31_5), 대표자/근로자 주당 근무시간(M32, M32_6), 4대보험(M32_1~10), 월평균 급여(M34), 구인애로(M37~M39)
 *    - [파트 H] 지원정책 수혜경험·만족도·희망사업 (문50~문67): 수혜 여부(M62), 5점 척도 만족도(mixed_3_4 / neutral_3 / positive_4_5), 희망 지원정책 1·2순위(문67)
 *    - [파트 I] 주관식 코멘트 & 동의서(Step 117 2중 서명·연락처 3분할) & CHECK1(Step 118 간판사진 업로드) & Step 119(98% 안전 대기)
 */

import fs from 'fs';
import path from 'path';
import { getMetrixIndustryKey } from './metrix-slot-scraper.js';
import { launchChromium } from '../utils/chromium-launcher.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickSteppedValue(minVal, maxVal, stepVal, fallback) {
  let min = Number(minVal);
  let max = Number(maxVal);
  const step = Math.max(1, Number(stepVal) || 1);
  if (!Number.isFinite(min)) min = fallback;
  if (!Number.isFinite(max)) max = fallback;
  if (min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  const candidates = [];
  for (let v = min; v <= max; v += step) {
    candidates.push(Math.round(v));
  }
  if (candidates.length === 0) return Math.round(min);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const DEFAULT_ACCOUNT_PASSWORDS = {
  '강영미': '5254',
  '김정례': '3995',
  '노영미': '7791'
};

/**
 * 메트릭스 경기도 소상공인 패널 설문조사 실행 메인 엔트리포인트
 */
export async function runMetrixSurvey({
  surveyUrl,
  slotData = {},
  policy = {},
  quotaIndex = 1,
  pilotMode = false,
  safetyGuard = true,
  haltOnBlock = true,
  reportDir = null,
  onProgress = () => {}
}) {
  if (!surveyUrl && !slotData.uid) {
    throw new Error('설문 참여 URL(surveyUrl) 또는 대상 UID가 제공되지 않았습니다.');
  }

  // [요구사항 1] 사업자번호 기반 폐업 리스트 입력 제외 안전가드
  if (slotData.isClosedBiz || String(slotData.bizStatus || '').includes('폐업') || slotData.quotaStatus === 'excluded') {
    const closedMsg = `⛔ [폐업 제외] "${slotData.companyName || '사업체'}" (사업자번호: ${slotData.bizNumber || '-'})는 폐업 사업체이므로 설문 입력을 제외합니다.`;
    console.warn(closedMsg);
    onProgress({
      step: 'EXCLUDED_CLOSED_BIZ',
      stepIndex: 0,
      totalSteps: 120,
      message: closedMsg
    });
    return {
      success: false,
      excluded: true,
      error: closedMsg,
      capturedSteps: [],
      submittedAnswers: [],
      slotData
    };
  }

  // [요구사항 4] 업종별 맞춤 가이드(industryPolicies) 병합 + 개별 쿼터 가이드(customGuide) 병합
  const industryKey = slotData.industryKey || getMetrixIndustryKey(slotData.industry || slotData.rawMeta?.['업종'] || '');
  const indPolicyObj = (
    policy.useIndustryGuidelines !== false &&
    policy.industryPolicies &&
    policy.industryPolicies[industryKey] &&
    policy.industryPolicies[industryKey].enabled !== false
  )
    ? policy.industryPolicies[industryKey]
    : {};

  const effectivePolicy = {
    ...policy,
    ...indPolicyObj,
    ...(slotData.customGuide || {})
  };
  const rawMeta = slotData.rawMeta || {};
  const usePanelMeta = (effectivePolicy.inheritPanelRawMeta !== false);

  // [3차 본조사 범위설정 가이드] 문17-1 권리금(기본 1000~5000, 500단위) & 문34 월평균 급여(기본 240~320, 5단위) 사전 산출
  const pickedGoodwillManwon = effectivePolicy.q17_goodwillRangeMode === 'fixed'
    ? Number(effectivePolicy.goodwill_amount ?? 1500)
    : pickSteppedValue(effectivePolicy.goodwill_min ?? 1000, effectivePolicy.goodwill_max ?? 5000, effectivePolicy.goodwill_step ?? 500, 2000);
  const pickedWageManwon = effectivePolicy.q34_wageRangeMode === 'fixed'
    ? Number(effectivePolicy.labor_avgMonthlyWage ?? 280)
    : pickSteppedValue(effectivePolicy.labor_wageMin ?? 240, effectivePolicy.labor_wageMax ?? 320, effectivePolicy.labor_wageStep ?? 5, 280);

  const targetReportDir = reportDir || path.resolve('reports', `metrix_item_${quotaIndex}_${slotData.uid || 'slot'}`);
  if (!fs.existsSync(targetReportDir)) {
    fs.mkdirSync(targetReportDir, { recursive: true });
  }

  let sampleSignPath = effectivePolicy.evidence_sign_image || 'data/sample_metrix_sign.png';
  if (!path.isAbsolute(sampleSignPath)) {
    sampleSignPath = path.resolve(sampleSignPath);
  }
  if (!fs.existsSync(sampleSignPath)) {
    const fallbackPath = path.resolve('data', 'sample_metrix_sign.png');
    if (fs.existsSync(fallbackPath)) {
      sampleSignPath = fallbackPath;
    }
  }

  const browser = await launchChromium({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  let page = await context.newPage();
  const capturedSteps = [];
  const submittedAnswers = [];
  const dialogLog = [];
  let phoneUpdated = false;
  let updatedPhone = '';

  const upsertSubmittedAnswer = (entry) => {
    if (!entry || !entry.questionCode) return;
    const idx = submittedAnswers.findIndex(x => x.questionCode === entry.questionCode && x.questionTitle === entry.questionTitle);
    if (idx >= 0) {
      submittedAnswers[idx] = entry;
    } else {
      submittedAnswers.push(entry);
    }
  };

  const attachDialogListener = (targetPage) => {
    targetPage.on('dialog', async dialog => {
      const msg = dialog.message();
      dialogLog.push({ time: new Date().toISOString(), message: msg, type: dialog.type() });
      console.log(`🔔 [메트릭스 알림 감지] "${msg}"`);
      await dialog.accept().catch(err => console.warn('[Metrix Dialog Accept 경고]:', err.message));
    });
  };
  attachDialogListener(page);

  try {
    const loginId = String(slotData.surveyorId || slotData.loginId || '강영미').trim();
    const loginPw = String(slotData.surveyorPw || slotData.loginPw || DEFAULT_ACCOUNT_PASSWORDS[loginId] || '5254').trim();
    const targetExcelPhone = String(slotData.excelPhone || slotData.phone || '').trim();
    const useContactFlow = (effectivePolicy.updatePhoneInContactPopup !== false && Boolean(slotData.uid));

    if (useContactFlow) {
      const contactPortalUrl = slotData.contactPortalUrl || 'https://survey.metrix.co.kr/Contact/?SNUM=622';
      onProgress({
        step: 'CONTACT_LOGIN',
        stepIndex: 0,
        totalSteps: 120,
        message: `[컨택 시스템 접속] 조사원 "${loginId}" 계정 로그인 ➔ UID ${slotData.uid} (${slotData.companyName}) [컨택] 팝업 진입 중...`
      });

      await page.goto(contactPortalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#id', { timeout: 15000 });
      await page.fill('#id', loginId);
      await page.fill('#password', loginPw);

      await Promise.all([
        page.waitForURL(u => u.toString().includes('Listdata'), { waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('button.login')
      ]);
      await page.waitForSelector('table.list-data', { timeout: 15000 });
      await page.waitForSelector('select.ROW_PER_PAGE', { timeout: 10000 }).catch(err => {
        console.warn(`[MetrixRunner ROW_PER_PAGE 대기 경고]: ${err.message}`);
      });
      await sleep(1000);

      // 100개씩 보기 설정
      await page.evaluate(() => {
        const sel = document.querySelector('select.ROW_PER_PAGE');
        if (sel && sel.value !== '100') {
          sel.value = '100';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof $ !== 'undefined') $(sel).val('100').trigger('change');
        }
      });
      await sleep(2500);

      // [요구사항 2] 설문목록에서 [컨택] 버튼을 누르고 '휴대폰' 항목을 엑셀 데이터로 바꾼 뒤 하단 [저장] 버튼 클릭
      const contactOpened = await page.evaluate(({ targetUid }) => {
        const tr = document.querySelector(`table.list-data tbody tr[data-uid="${targetUid}"], table.list-data tbody tr[data-id="${targetUid}"]`);
        if (!tr) return { ok: false, reason: 'ROW_NOT_FOUND' };
        const btn = tr.querySelector('button.contact-popup');
        if (!btn) return { ok: false, reason: 'BTN_NOT_FOUND' };
        btn.click();
        return { ok: true };
      }, { targetUid: String(slotData.uid) });

      if (contactOpened.ok) {
        await page.waitForSelector('#contactPopup [data-column="전화번호(무선)"]', { state: 'visible', timeout: 10000 }).catch(() => {});
        await sleep(600);

        if (targetExcelPhone) {
          onProgress({
            step: 'CONTACT_PHONE_SAVE',
            stepIndex: 0,
            totalSteps: 120,
            message: `[컨택 휴대폰 변경·저장] "${slotData.companyName}" 휴대폰 항목을 엑셀 데이터(${targetExcelPhone})로 변경 후 [저장] 버튼을 클릭합니다...`
          });

          const saveWaitPromise = page.waitForResponse(
            res => res.url().includes('/Contact/Listdata/SaveContactInfo'),
            { timeout: 10000 }
          ).catch(() => null);

          await page.evaluate(({ newPhone }) => {
            const phoneInput = document.querySelector('#contactPopup [data-column="전화번호(무선)"]');
            if (phoneInput) {
              phoneInput.value = newPhone;
              if (typeof $ !== 'undefined') {
                $(phoneInput).val(newPhone).trigger('input').trigger('change');
              }
            }
            const saveBtn = document.querySelector('#contactPopup button.save-contact');
            if (saveBtn) {
              saveBtn.click();
            }
          }, { newPhone: targetExcelPhone });

          await saveWaitPromise;
          await sleep(1000);
          phoneUpdated = true;
          updatedPhone = targetExcelPhone;
          slotData.phone = targetExcelPhone;
          slotData.serverPhone = targetExcelPhone;
          slotData.phoneNeedsSync = false;

          const contactShotName = 'step_00_contact_popup_saved.png';
          await page.screenshot({ path: path.join(targetReportDir, contactShotName), fullPage: true }).catch(() => {});
          capturedSteps.push({
            stepIndex: 0,
            title: `[컨택 팝업] 휴대폰 번호(${targetExcelPhone}) 변경 및 [저장] 완료`,
            screenshot: contactShotName,
            time: new Date().toISOString()
          });
        }

        // [요구사항 3] 컨택 팝업에서 [설문참여] 버튼을 눌러 설문 시작
        onProgress({
          step: 'CONTACT_JOIN_SURVEY',
          stepIndex: 1,
          totalSteps: 120,
          message: `[컨택 팝업 ➔ 설문참여] 컨택 팝업에서 [설문참여] 버튼을 클릭하여 본 설문을 시작합니다... (적용 가이드: ${indPolicyObj.label || slotData.industry || '공통'})`
        });

        const contactPage = page;
        const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        await page.evaluate(() => {
          const joinBtn = document.querySelector('#contactPopup button.join');
          if (joinBtn) joinBtn.click();
        });

        const waitSurveyReady = async (targetPage, timeoutMs = 20000) => {
          await targetPage.waitForFunction(
            () => {
              const txt = (document.body?.innerText || '').trim();
              return txt.length > 0 && txt !== 'Loading..' && !txt.startsWith('Loading..');
            },
            { timeout: timeoutMs }
          ).catch(() => {});
          const curTxt = await targetPage.evaluate(() => (document.body?.innerText || '').trim()).catch(() => '');
          return Boolean(curTxt && curTxt !== 'Loading..' && !curTxt.startsWith('Loading..'));
        };

        const popupPage = await popupPromise;
        if (popupPage) {
          attachDialogListener(popupPage);
          page = popupPage;
          await contactPage.close().catch(() => {});
          await popupPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          const readyFromPopup = await waitSurveyReady(popupPage, 15000);
          if (!readyFromPopup && surveyUrl) {
            console.log(`[MetrixRunner] 팝업 초기 Loading 지연 감지(URL=${popupPage.url()}) ➔ 정식 설문 URL로 재진입합니다: ${surveyUrl}`);
            await popupPage.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            await waitSurveyReady(popupPage, 25000);
          }
          await sleep(1000);
        } else {
          console.log(`[MetrixRunner] 팝업 창 대신 직접 설문 URL로 이동합니다: ${surveyUrl}`);
          await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await waitSurveyReady(page, 25000);
          await sleep(1200);
        }
      } else {
        console.warn(`[MetrixRunner] 컨택 행(${slotData.uid})을 찾지 못해 직접 설문 URL로 이동합니다: ${surveyUrl}`);
        await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(2000);
      }
    } else {
      onProgress({
        step: 'INIT',
        stepIndex: 1,
        totalSteps: 120,
        message: `[접속 시작] "${slotData.companyName || '사업체'}"(UID: ${slotData.uid}) 메트릭스 설문 페이지에 접속합니다...`
      });

      console.log(`[MetrixRunner] Navigating to: ${surveyUrl}`);
      await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(2000);
    }

    let stepCount = 1;
    const maxSteps = 180;
    let consecutiveStallCount = 0;
    let loadingRetryCount = 0;
    let lastScreenSignature = '';
    let reachedCheck1 = false;
    let check1Uploaded = false;

    while (stepCount <= maxSteps) {
      await sleep(jitter(300, 600));

      const screenInfo = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();

        const isFinalComplete = bodyText.includes('조사에 참여해 주셔서 대단히 감사합니다') ||
                                bodyText.includes('조사가 완료되었습니다') ||
                                bodyText.includes('응답해 주셔서 감사합니다') ||
                                bodyText.includes('제출되었습니다');

        const isBenefitGuideScreen = bodyText.includes('참여혜택 안내') ||
                                     bodyText.includes('소개 및 참여혜택') ||
                                     !!document.querySelector('[question-name="END"], [id*="END"], [qname="END"], [data-qname="END"]');

        const isConsentScreen = !!document.querySelector('canvas.pad') ||
                                (bodyText.includes('동의서') && bodyText.includes('서명'));

        const isCheck1Screen = !!document.querySelector('input[name="CHECK1_F1"]') ||
                               !!document.querySelector('button.uploader-file[qname="CHECK1"]') ||
                               !!document.querySelector('[question-name="CHECK1"]') ||
                               bodyText.includes('조사원 검증') ||
                               bodyText.includes('간판사진');

        const gradeEls = Array.from(document.querySelectorAll('.s-gradeclick')).filter(el => el.offsetParent !== null);
        const hasGradeClick = gradeEls.length > 0;
        const gradeWrapper = gradeEls[0]?.closest('[question-type="GRADE_CLICK"]') || document.querySelector('[question-type="GRADE_CLICK"]');
        const gradeQName = gradeEls[0]?.getAttribute('qname') || gradeWrapper?.getAttribute('question-name') || '';
        const gradeMax = Number(gradeWrapper?.getAttribute('max-grade') || gradeWrapper?.getAttribute('MAX_GRADE')) ||
          (['Q67', 'Q68', 'Q88', 'Q89'].includes(gradeQName) ? 3 : 2);
        const gradeAkeys = gradeEls.map(el => el.getAttribute('akey')).filter(Boolean);
        const gradeValidAkeys = gradeEls
          .filter(el => {
            if (el.querySelector('input.input-etc, textarea.input-etc')) return false;
            const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
            if (/^기타(\b|\s|$)/.test(txt)) return false;
            return Boolean(el.getAttribute('akey'));
          })
          .map(el => el.getAttribute('akey'));
        const selectedGradeCount = gradeEls.filter(el =>
          el.classList.contains('active') ||
          el.classList.contains('selected') ||
          el.classList.contains('on') ||
          /(1순위|2순위|3순위)/.test(el.innerText || '')
        ).length;
        const gradeAlreadySelected = !(/1순위\s*:\s*2순위\s*:/.test(bodyText)) && selectedGradeCount >= gradeMax;
        const gradeHasSelection = selectedGradeCount > 0;

        const titleCandidates = Array.from(
          document.querySelectorAll('.q-title, .question-title, .quest-title, .title, h2, h3, .box-question, [id^="BOX_"], [question-name], [qname], .question-container, .q-item')
        ).filter(el => el.offsetParent !== null);

        const questionTexts = [];
        for (const el of titleCandidates) {
          const rawLines = (el.innerText || '')
            .split(/\r?\n/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          if (rawLines.length === 0) continue;
          const firstLine = rawLines[0].slice(0, 160);
          if (firstLine && !questionTexts.includes(firstLine)) {
            questionTexts.push(firstLine);
          }
        }
        if (questionTexts.length === 0) {
          const mBody = bodyText.match(/(문\s*\d+(?:-\d+)*(?:_\d+)?\.?\s*[^?]+\??)/);
          if (mBody) questionTexts.push(mBody[1].slice(0, 160));
        }

        const qNameEls = Array.from(document.querySelectorAll('[question-name], [qname], [data-qname]')).filter(el => el.offsetParent !== null);
        const activeQNames = Array.from(new Set(
          qNameEls
            .map(el => el.getAttribute('question-name') || el.getAttribute('qname') || el.getAttribute('data-qname') || '')
            .filter(Boolean)
        ));
        const qNameAttr = activeQNames[0] || '';

        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(el => el.offsetParent !== null);

        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(b => b.offsetParent !== null);
        const nextBtn = buttons.find(b => {
          const t = (b.innerText || b.value || '').trim();
          return t === '다음' || t.includes('다음') || t === '제출' || t === '완료';
        });

        const signature = (qNameAttr || questionTexts[0] || '') + '|' + inputs.length + '|' + bodyText.slice(50, 180);

        return {
          isFinalComplete,
          isBenefitGuideScreen,
          isConsentScreen,
          isCheck1Screen,
          hasGradeClick,
          gradeQName,
          gradeMax,
          gradeAkeys,
          gradeValidAkeys: gradeValidAkeys.length >= 2 ? gradeValidAkeys : gradeAkeys,
          gradeAlreadySelected,
          gradeHasSelection,
          activeQNames,
          qNameAttr,
          questionTexts: questionTexts.slice(0, 3),
          inputsCount: inputs.length,
          hasNextBtn: !!nextBtn,
          nextBtnText: nextBtn ? (nextBtn.innerText || nextBtn.value || '').trim() : null,
          bodySnippet: bodyText.slice(0, 300),
          signature
        };
      });

      const qTitle = screenInfo.questionTexts[0] || screenInfo.qNameAttr || '진행 화면';
      if ((qTitle === 'Loading..' || screenInfo.bodySnippet === 'Loading..') && loadingRetryCount < 25) {
        loadingRetryCount++;
        console.log(`[MetrixRunner Step ${stepCount}] 화면 로딩 중(Loading..) 대기 (${loadingRetryCount}/25)...`);
        await sleep(1200);
        continue;
      }
      loadingRetryCount = 0;

      console.log(`\n[MetrixRunner Step ${stepCount}] Q(${screenInfo.qNameAttr || '-'}): ${qTitle} | Inputs: ${screenInfo.inputsCount} | GradeClick: ${screenInfo.hasGradeClick} | Next: ${screenInfo.nextBtnText || 'None'}`);

      const screenshotFileName = `step_${String(stepCount).padStart(2, '0')}.png`;
      const screenshotFilePath = path.join(targetReportDir, screenshotFileName);
      await page.screenshot({ path: screenshotFilePath, fullPage: true }).catch(err => console.warn('[캡처 경고]:', err.message));

      capturedSteps.push({
        stepIndex: stepCount,
        title: qTitle,
        screenshot: screenshotFileName,
        time: new Date().toISOString()
      });

      // 1. 이미 100% 최종 완료된 상태 확인
      if (screenInfo.isFinalComplete) {
        console.log(`🎉 [메트릭스] 설문이 이미 최종 완료(100%) 상태입니다.`);
        onProgress({
          step: 'COMPLETED',
          stepIndex: 120,
          totalSteps: 120,
          message: `🎉 [완료] "${slotData.companyName}" 메트릭스 설문이 100% 완료 상태입니다.`
        });
        return {
          success: true,
          status: 'completed',
          alreadyCompleted: true,
          phoneUpdated,
          updatedPhone,
          capturedSteps,
          submittedAnswers,
          dialogLog,
          slotData
        };
      }

      // 2. Step 119 참여혜택 안내(END) 화면 ➔ 98% 안전 대기 원칙 수행 (CHECK1 사진 미업로드 스킵 모드 포함 100% 정지 보장)
      const isSafetyStopPoint = (screenInfo.isBenefitGuideScreen || (reachedCheck1 && !screenInfo.isCheck1Screen));
      const stopAtReview = (safetyGuard !== false && (effectivePolicy.safetyStopAtReview !== false));

      if (isSafetyStopPoint && stopAtReview) {
        console.log(`🛡️ [메트릭스 안전 대기 원칙 발동] Step 119 (참여혜택 안내 / 최종 검토 대기) 도달!`);
        const safeScreenshotPath = path.join(targetReportDir, 'step_119_review_ready.png');
        await page.screenshot({ path: safeScreenshotPath, fullPage: true }).catch(err => console.warn('[안전대기 캡처 경고]:', err.message));

        upsertSubmittedAnswer({
          stepIndex: stepCount,
          questionCode: 'STEP119_안전대기',
          questionTitle: '참여혜택 안내 (최종 제출 직전 98% 안전 대기)',
          submittedAnswer: '98% 검토 대기 정지 완료 (미제출 안전보존)'
        });

        const photoStatusNote = check1Uploaded ? '증빙사진 업로드 완료' : '사진 미업로드 스킵 적용';
        onProgress({
          step: 'REVIEW_READY_98',
          stepIndex: 119,
          totalSteps: 120,
          message: `🛡️ [98% 안전 대기] 전 문항 입력, 전자서명 및 CHECK1(${photoStatusNote}) 완료! (최종 제출 직전 검토 대기 상태 보존)`
        });

        return {
          success: true,
          status: 'stopped_at_review',
          isReviewReady: true,
          currentStep: 119,
          totalSteps: 120,
          phoneUpdated,
          updatedPhone,
          capturedSteps,
          submittedAnswers,
          dialogLog,
          slotData,
          message: `설문 응답 및 전자서명(${photoStatusNote})이 완료되었으며, 최종 제출 직전 98% 상태로 안전하게 보존되었습니다.`
        };
      }

      if (screenInfo.isBenefitGuideScreen && !stopAtReview) {
        console.log(`[메트릭스 안전가드 OFF] 참여혜택 화면에서 최종 제출 버튼을 클릭합니다...`);
        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.click();
          await sleep(4000);
          const finishScreenshot = path.join(targetReportDir, 'step_120_final_success.png');
          await page.screenshot({ path: finishScreenshot, fullPage: true }).catch(err => console.warn('[완료 캡처 경고]:', err.message));

          onProgress({
            step: 'COMPLETED',
            stepIndex: 120,
            totalSteps: 120,
            message: `🎉 [최종 완료] "${slotData.companyName}" 메트릭스 설문이 100% 정식 제출 마감되었습니다.`
          });

          return {
            success: true,
            status: 'completed',
            isComplete: true,
            finalStep: 120,
            phoneUpdated,
            updatedPhone,
            capturedSteps,
            submittedAnswers,
            dialogLog,
            slotData
          };
        }
      }

      if (!screenInfo.hasNextBtn) {
        const noNextMsg = `[진행 중단] Step ${stepCount} ("${qTitle}") 화면에서 [다음] 버튼을 찾을 수 없어 스킵하지 않고 즉시 중단했습니다.`;
        console.error(`🚨 ${noNextMsg}`);
        const blockedShot = path.join(targetReportDir, `blocked_no_next_step_${String(stepCount).padStart(2, '0')}.png`);
        await page.screenshot({ path: blockedShot, fullPage: true }).catch(err => console.warn('[차단 캡처 경고]:', err.message));
        return {
          success: false,
          haltedOnBlock: true,
          blockedStep: stepCount,
          blockedQuestion: qTitle,
          phoneUpdated,
          updatedPhone,
          alertMessages: dialogLog.map(d => d.message),
          dialogLog,
          error: noNextMsg,
          capturedSteps,
          submittedAnswers,
          slotData
        };
      }

      if (screenInfo.signature === lastScreenSignature) {
        consecutiveStallCount++;
        const stallThreshold = (haltOnBlock !== false) ? 1 : 3;
        if (consecutiveStallCount >= stallThreshold) {
          const recentAlerts = dialogLog.slice(-3).map(d => d.message);
          const alertDetail = recentAlerts.length > 0 ? ` (설문 알림: ${recentAlerts.join(' / ')})` : '';
          const haltMsg = `[막힘 감지 · 즉시 중단] Step ${stepCount - 1} ("${qTitle}") 문항에서 전진하지 못해 스킵하지 않고 즉시 중단했습니다.${alertDetail}`;
          console.error(`🚨 ${haltMsg}`);
          const blockedShot = path.join(targetReportDir, `blocked_step_${String(stepCount - 1).padStart(2, '0')}.png`);
          await page.screenshot({ path: blockedShot, fullPage: true }).catch(err => console.warn('[차단 캡처 경고]:', err.message));
          onProgress({
            step: 'HALTED_ON_BLOCK',
            stepIndex: stepCount - 1,
            totalSteps: 120,
            message: `🛑 ${haltMsg}`
          });
          return {
            success: false,
            haltedOnBlock: true,
            blockedStep: stepCount - 1,
            blockedQuestion: qTitle,
            phoneUpdated,
            updatedPhone,
            alertMessages: recentAlerts,
            dialogLog,
            error: haltMsg,
            stalledStep: stepCount - 1,
            capturedSteps,
            submittedAnswers,
            slotData
          };
        }
      } else {
        consecutiveStallCount = 0;
        lastScreenSignature = screenInfo.signature;
      }

      // 3. [특수 화면 1] Step 118: CHECK1 사진 업로드 문항 (기본 가이드: 업로드하지 않고 바로 [다음] 클릭)
      if (screenInfo.isCheck1Screen) {
        reachedCheck1 = true;
        const shouldUploadPhoto = (effectivePolicy.check1_photoUploadMode === 'upload_sample');

        if (!shouldUploadPhoto) {
          console.log(`[Step 118 - CHECK1] 가이드 설정(skip_upload): 아무 파일도 업로드하지 않고 바로 [다음]을 클릭합니다.`);
          onProgress({
            step: 'CHECK1_SKIP_UPLOAD',
            stepIndex: 118,
            totalSteps: 120,
            message: `[사진 문항 통과] CHECK1 사진 업로드 없이 바로 [다음] 단계로 전진합니다...`
          });

          // 재실행 슬롯에 과거 업로드 파일 삭제 버튼이 남아 있을 경우 깔끔히 제거
          const removedOldFile = await page.evaluate(() => {
            const rmBtns = Array.from(document.querySelectorAll('button.uploader-remove-file, .fileinfo button.remove, .fileinfos button')).filter(b => {
              if (b.offsetParent === null) return false;
              const txt = (b.innerText || b.title || '').trim();
              return b.classList.contains('uploader-remove-file') || txt.includes('삭제') || txt === 'X' || txt === '×';
            });
            rmBtns.forEach(b => b.click());
            return rmBtns.length;
          }).catch(err => {
            console.warn('[CHECK1 기존 파일 제거 확인 경고]:', err.message);
            return 0;
          });
          if (removedOldFile > 0) {
            await sleep(900);
          }

          upsertSubmittedAnswer({
            stepIndex: stepCount,
            questionCode: 'CHECK1_증빙업로드',
            questionTitle: qTitle,
            submittedAnswer: '사진 미업로드 후 [다음] 진행 (가이드 기본값)'
          });
        } else {
          console.log(`[Step 118 - CHECK1] 간판사진 증빙 업로드 처리 시작... (파일: ${sampleSignPath})`);
          onProgress({
            step: 'CHECK1_UPLOAD',
            stepIndex: 118,
            totalSteps: 120,
            message: `[증빙 사진 업로드] 간판사진(CHECK1)을 메트릭스 비동기 업로더에 등록합니다...`
          });

          const fileInput = await page.$('input[name="CHECK1_F1"]');
          if (fileInput && fs.existsSync(sampleSignPath)) {
            await fileInput.setInputFiles(sampleSignPath);
            await sleep(500);

            const uploadBtn = await page.$('button.uploader-file[qname="CHECK1"]');
            if (uploadBtn) {
              await uploadBtn.click();
              console.log(`[CHECK1] Upload button clicked. Waiting 3.5s for POST /Join/Uploader...`);
              await sleep(3500);
              check1Uploaded = true;
            }
          } else {
            console.warn(`[CHECK1 경고] 파일 인풋 또는 샘플 이미지를 찾을 수 없습니다. 경로: ${sampleSignPath}`);
          }

          upsertSubmittedAnswer({
            stepIndex: stepCount,
            questionCode: 'CHECK1_증빙업로드',
            questionTitle: qTitle,
            submittedAnswer: check1Uploaded ? `간판사진 업로드 완료 (${path.basename(sampleSignPath)})` : '파일 미업로드'
          });
        }

        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.click();
          await sleep(2500);
        }
        stepCount++;
        continue;
      }

      // 4. [특수 화면 2] Step 117: 동의서 화면 (2중 서명 및 3분할 연락처)
      if (screenInfo.isConsentScreen) {
        console.log(`[Step 117 - 동의서] 3분할 연락처 기입 및 2중 전자서명 드로잉 시작...`);
        onProgress({
          step: 'CONSENT_SIGN',
          stepIndex: 117,
          totalSteps: 120,
          message: `[패널 동의서] 휴대폰/사업장 연락처 3분할 기입 및 2중 전자서명을 진행합니다...`
        });

        const rawPhone = slotData.phone || slotData.contact || rawMeta['휴대폰'] || '010-5392-7259';
        const phoneParts = rawPhone.replace(/[^0-9]/g, '').match(/^(\d{3})(\d{3,4})(\d{4})$/);
        const p1 = phoneParts ? phoneParts[1] : '010';
        const p2 = phoneParts ? phoneParts[2] : '5392';
        const p3 = phoneParts ? phoneParts[3] : '7259';

        await page.evaluate(({ p1, p2, p3 }) => {
          if (typeof $ !== 'undefined') {
            $('input[data-column="NUMBER_1"]').val(p1).trigger('input').trigger('change');
            $('input[data-column="NUMBER_2"]').val(p2).trigger('input').trigger('change');
            $('input[data-column="NUMBER_3"]').val(p3).trigger('input').trigger('change');

            $('input[data-column="NUMBER_4"]').val(p1).trigger('input').trigger('change');
            $('input[data-column="NUMBER_5"]').val(p2).trigger('input').trigger('change');
            $('input[data-column="NUMBER_6"]').val(p3).trigger('input').trigger('change');

            const todayStr = new Date().toISOString().slice(0, 10);
            $('input.input-date').val(todayStr).trigger('change');

            $('input[type="checkbox"]').prop('checked', true).trigger('change');
          }
        }, { p1, p2, p3 }).catch(err => console.error('[동의서 입력 오류]:', err.message));

        await sleep(500);

        const canvases = await page.$$('canvas.pad');
        for (let cIdx = 0; cIdx < canvases.length; cIdx++) {
          const canvas = canvases[cIdx];
          await canvas.scrollIntoViewIfNeeded();
          await sleep(300);

          const box = await canvas.boundingBox();
          if (box) {
            await page.mouse.move(box.x + 40, box.y + 50);
            await page.mouse.down();
            await page.mouse.move(box.x + 100, box.y + 70, { steps: 5 });
            await page.mouse.move(box.x + 160, box.y + 40, { steps: 5 });
            await page.mouse.move(box.x + 220, box.y + 65, { steps: 5 });
            await page.mouse.up();
            await sleep(300);
          }
        }

        upsertSubmittedAnswer({
          stepIndex: stepCount,
          questionCode: 'CONSENT_동의서서명',
          questionTitle: qTitle,
          submittedAnswer: `연락처(${p1}-${p2}-${p3}) 기입 · 개인정보/패널동의 체크 · 2중 전자서명(${canvases.length}건) 완료`
        });

        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.scrollIntoViewIfNeeded();
          await nextBtn.click();
          await sleep(2500);
        }
        stepCount++;
        continue;
      }

      // 5. [규칙 3] 우선순위 선택 (GRADE_CLICK) 2순위 및 3순위(문67·문68·문88·문89) 전수 대응 + 가이드 랜덤/고정 덮어쓰기
      if (screenInfo.hasGradeClick && screenInfo.gradeValidAkeys.length >= 2) {
        const gQName = screenInfo.gradeQName || screenInfo.qNameAttr || '';
        const gMax = Math.min(screenInfo.gradeMax || 2, screenInfo.gradeValidAkeys.length);
        const validKeys = screenInfo.gradeValidAkeys;

        const shuffleKeys = (arr) => {
          const copy = [...arr];
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          return copy;
        };

        const buildOrderedKeys = (preferredList) => {
          const out = [];
          for (const k of preferredList) {
            const sk = String(k || '');
            if (sk && validKeys.includes(sk) && !out.includes(sk)) {
              out.push(sk);
            }
          }
          for (const fk of shuffleKeys(validKeys)) {
            if (out.length >= gMax) break;
            if (!out.includes(fk)) out.push(fk);
          }
          return out.slice(0, gMax);
        };

        // 가이드에서 명시적 제어 대상인 문항은 기존 자동채움([LIST:M*])보다 가이드를 우선 적용
        let forceOverrideGrade = false;
        let targetKeys = [];

        if (gQName === 'Q12_1') {
          forceOverrideGrade = true;
          if (effectivePolicy.q12_1_evalReasonMode === 'fixed') {
            targetKeys = buildOrderedKeys([effectivePolicy.sales_changeReasonRank1 || '1', effectivePolicy.sales_changeReasonRank2 || '2']);
          } else {
            targetKeys = shuffleKeys(validKeys).slice(0, gMax);
          }
        } else if (gQName === 'Q22') {
          if (effectivePolicy.q22_hardshipMode === 'panel') {
            forceOverrideGrade = false;
            targetKeys = buildOrderedKeys([rawMeta.M22, rawMeta.M22_1, effectivePolicy.hardship_rank1 || '3', effectivePolicy.hardship_rank2 || '5']);
          } else if (effectivePolicy.q22_hardshipMode === 'fixed') {
            forceOverrideGrade = true;
            targetKeys = buildOrderedKeys([effectivePolicy.hardship_rank1 || '3', effectivePolicy.hardship_rank2 || '5']);
          } else {
            forceOverrideGrade = true;
            targetKeys = shuffleKeys(validKeys).slice(0, gMax);
          }
        } else if (gQName === 'Q43_4') {
          forceOverrideGrade = true;
          if (effectivePolicy.q43_4_continueReasonMode === 'fixed') {
            targetKeys = buildOrderedKeys(['1', '4']);
          } else {
            targetKeys = shuffleKeys(validKeys).slice(0, gMax);
          }
        } else if (gQName === 'Q67') {
          forceOverrideGrade = true;
          if (effectivePolicy.q67_desiredSupportMode === 'fixed') {
            targetKeys = buildOrderedKeys([
              effectivePolicy.desired_support_rank1 || '9',
              effectivePolicy.desired_support_rank2 || '5',
              effectivePolicy.desired_support_rank3 || '4'
            ]);
          } else {
            targetKeys = shuffleKeys(validKeys).slice(0, gMax);
          }
        } else if (gQName === 'Q68') {
          forceOverrideGrade = true;
          if (effectivePolicy.q68_policyIssueMode === 'fixed') {
            targetKeys = buildOrderedKeys([
              effectivePolicy.policy_issue_rank1 || '6',
              effectivePolicy.policy_issue_rank2 || '8',
              effectivePolicy.policy_issue_rank3 || '5'
            ]);
          } else {
            targetKeys = shuffleKeys(validKeys).slice(0, gMax);
          }
        } else if (gQName === 'Q15_2' || qTitle.includes('대출') || qTitle.includes('차입') || qTitle.includes('부채')) {
          const r1 = (usePanelMeta && rawMeta['M15-2']) ? String(rawMeta['M15-2']) : String(effectivePolicy.debt_reasonRank1 || '1');
          const r2 = (usePanelMeta && rawMeta['M15-2_1']) ? String(rawMeta['M15-2_1']) : String(effectivePolicy.debt_reasonRank2 || '2');
          targetKeys = buildOrderedKeys([r1, r2]);
        } else {
          // Q28_1, Q31_1, Q43_1, Q88(3순위), Q89(3순위), Q90_1(2순위) 등
          targetKeys = shuffleKeys(validKeys).slice(0, gMax);
        }

        const preserveGrade = (!forceOverrideGrade && effectivePolicy.preserveExistingInputs !== false && screenInfo.gradeAlreadySelected);
        if (!preserveGrade) {
          if (screenInfo.gradeHasSelection) {
            await page.evaluate(({ qn }) => {
              const reBtn = (qn && document.querySelector(`button.re-select[qname="${qn}"]`)) || document.querySelector('button.re-select');
              if (reBtn) {
                reBtn.click();
              } else {
                Array.from(document.querySelectorAll('.s-gradeclick.selected, .s-gradeclick.active, .s-gradeclick.on')).forEach(el => el.click());
              }
            }, { qn: gQName }).catch(err => console.warn('[GRADE_CLICK 초기화 경고]:', err.message));
            await sleep(280);
          }

          console.log(`[규칙 3 GRADE_CLICK ${gQName || '-'}] 목표 ${gMax}순위=${targetKeys.join(', ')} 클릭 (기타 제외 가용: ${validKeys.join(', ')})`);
          for (let rIdx = 0; rIdx < targetKeys.length; rIdx++) {
            const tk = targetKeys[rIdx];
            const sel = gQName ? `.s-gradeclick[qname="${gQName}"][akey="${tk}"]` : `.s-gradeclick[akey="${tk}"]`;
            const targetEl = (await page.$(sel)) || (await page.$(`.s-gradeclick[akey="${tk}"]`));
            if (targetEl) {
              await targetEl.click().catch(err => console.warn(`[GRADE_CLICK ${rIdx + 1}순위 경고]:`, err.message));
              await sleep(300);
            }
          }
        }
      }

      // 6. 전 문항 스마트 폼 응답 주입 (A1~A15, 문8~문100, 패널 rawMeta 계승 및 3차 본조사 20대 문항 가이드 매핑)
      await page.evaluate(async ({ slot, pol, quotaIdx, indKey, pickedGoodwillManwon, pickedWageManwon }) => {
        const bodyText = document.body.innerText || '';
        const meta = slot.rawMeta || {};
        const useMeta = (pol.inheritPanelRawMeta !== false);
        const preserveInputs = (pol.preserveExistingInputs !== false);
        const guarValGlobal = String(slot.guaranteeSupport || meta['보증지원여부'] || '').trim().toUpperCase();
        const isFoodInd = (
          indKey === 'ind_5' ||
          String(slot.industry || meta['업종'] || '').includes('음식') ||
          String(meta.AA3 || meta.A3 || '') === '5'
        );

        const isBoxInput = (el) => {
          if (!el || el.offsetParent === null) return false;
          const tag = el.tagName.toLowerCase();
          if (tag === 'textarea') return true;
          if (tag !== 'input') return false;
          const t = (el.type || 'text').toLowerCase();
          return !['hidden', 'radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'image'].includes(t);
        };

        const setInputVal = (inp, val, forceEnable = false) => {
          if (!inp) return;
          if (forceEnable && inp.disabled) {
            inp.disabled = false;
            inp.removeAttribute('disabled');
          }
          const strVal = String(val ?? '');
          inp.value = strVal;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('keyup', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof $ !== 'undefined') {
            $(inp).val(strVal).trigger('input').trigger('change').trigger('keyup');
          }
        };

        const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const shuffleArr = (arr) => {
          const copy = [...arr];
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          return copy;
        };

        const hasVisibleQ = (qname) => {
          const els = Array.from(document.querySelectorAll(`[question-name="${qname}"], [qname="${qname}"], [data-qname="${qname}"]`));
          return els.some(el => el.offsetParent !== null);
        };

        const getQField = (qname, fieldName) => (
          document.querySelector(`input[qname="${qname}"][type-name="${fieldName}"]`) ||
          document.querySelector(`input[parent-name="${qname}"][type-name="${fieldName}"]`) ||
          document.querySelector(`[question-name="${qname}"] input[type-name="${fieldName}"]`) ||
          document.querySelector(`input[qname="${qname}"][data-column="${fieldName}"]`) ||
          document.querySelector(`[question-name="${qname}"] input[data-column="${fieldName}"]`)
        );

        const selectQRadio = (qname, val) => {
          const radios = Array.from(
            document.querySelectorAll(`input[type="radio"][qname="${qname}"], input[type="radio"][name="${qname}"]`)
          ).filter(r => r.offsetParent !== null && !r.disabled);
          if (radios.length === 0) return null;
          const strVal = String(val);
          const pick = radios.find(r => String(r.value) === strVal || String(r.getAttribute('akey') || '') === strVal) || radios[0];
          if (pick) {
            if (!pick.checked) pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
          }
          return pick;
        };

        const setQChecks = (qname, targetVals) => {
          const targetSet = new Set(targetVals.map(v => String(v)));
          const cbs = Array.from(
            document.querySelectorAll(`input[type="checkbox"][qname="${qname}"], input[type="checkbox"][name^="${qname}"]`)
          ).filter(c => c.offsetParent !== null && !c.disabled);
          if (cbs.length === 0) return;

          // 1단계: 목표에 없는 기존 체크박스(특히 SINGLE 배타 보기·기타 보기) 먼저 해제
          cbs.forEach(cb => {
            const key = String(cb.value || cb.getAttribute('akey') || '');
            if (!targetSet.has(key) && cb.checked) {
              cb.click();
              if (cb.checked) {
                cb.checked = false;
                if (typeof $ !== 'undefined') $(cb).prop('checked', false).trigger('change');
              }
            }
          });

          // 2단계: 목표 체크박스 선택
          cbs.forEach(cb => {
            const key = String(cb.value || cb.getAttribute('akey') || '');
            if (targetSet.has(key) && !cb.checked) {
              cb.click();
              if (!cb.checked) {
                cb.checked = true;
                if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
              }
            }
          });
        };

        // 추세 계수 계산 (sales_trend2025)
        let trendMode = pol.sales_trend2025 || 'maintain';
        if (trendMode === 'random') {
          const modes = ['maintain', 'growth', 'decrease'];
          trendMode = modes[(Number(quotaIdx) || 1) % 3];
        }
        const trendMult = trendMode === 'growth' ? 1.07 : (trendMode === 'decrease' ? 0.93 : 1.0);

        // [규칙 1] 사업장 및 거주지 주소 Readonly 인풋 강제 바인딩 (A10, A14) 및 사업체 일반현황 보호
        if (pol.general_bindAddressReadonly !== false) {
          const cityInputs = Array.from(document.querySelectorAll('input[name="CITY"]')).filter(i => i.offsetParent !== null);
          const guInputs = Array.from(document.querySelectorAll('input[name="GU"]')).filter(i => i.offsetParent !== null);
          const detail1Inputs = Array.from(document.querySelectorAll('input[name="DETAIL1"]')).filter(i => i.offsetParent !== null);
          const detail2Inputs = Array.from(document.querySelectorAll('input[name="DETAIL2"]')).filter(i => i.offsetParent !== null);

          if (cityInputs.length > 0 && typeof $ !== 'undefined') {
            cityInputs.forEach(ci => { if (!ci.value) $(ci).val(meta['AA14 _1'] || '경기').trigger('change'); });
            guInputs.forEach(gi => { if (!gi.value) $(gi).val(slot.district || meta.AA10 || '광주시').trigger('change'); });
            detail1Inputs.forEach(d1 => { if (!d1.value) $(d1).val(slot.road || meta['AA10 _1'] || '경충대로').trigger('change'); });
            detail2Inputs.forEach(d2 => { if (!d2.value) $(d2).val(slot.detailAddress || meta['AA10 _2'] || '101호').trigger('change'); });
          }
        }

        if (bodyText.includes('사업체 일반현황')) {
          // 개인사업자인 경우 법인등록번호 및 비고란 등 불필요 오입력 필드 초기화
          const allTrs = Array.from(document.querySelectorAll('tr'));
          allTrs.forEach(tr => {
            const txt = (tr.innerText || '').replace(/\s+/g, ' ');
            if (txt.includes('법인등록번호') && String(meta.AA2 || '1') !== '2' && slot.bizForm !== '법인') {
              Array.from(tr.querySelectorAll('input')).filter(isBoxInput).forEach(inp => {
                inp.value = '';
                if (typeof $ !== 'undefined') $(inp).val('').trigger('input').trigger('change');
              });
            }
            if (txt.startsWith('비고')) {
              Array.from(tr.querySelectorAll('input')).filter(isBoxInput).forEach(inp => {
                if (inp.value === '10') {
                  inp.value = '';
                  if (typeof $ !== 'undefined') $(inp).val('').trigger('input').trigger('change');
                }
              });
            }
          });
          return;
        }

        // ------------------------------------------------------------------
        // [제조업 전용 Part II 특수 행렬·테이블 문항 선행 처리] (문73 CHECKSETS, 문74 3열 비율, 문75 GRADE, 문80 위탁기업수·비중)
        // ※ 일반 SUM 밸런서가 문74·문80을 오인식하지 않도록 반드시 SUM 밸런서 이전에 처리!
        // ------------------------------------------------------------------
        if (hasVisibleQ('Q73') && document.querySelector('[question-name="Q73"][question-type="CHECKSETS"], input[qname="Q73"][hkey]')) {
          const setCellCb = (vkey, hkey, want) => {
            const cb = document.querySelector(`input[qname="Q73"][type="checkbox"][vkey="${vkey}"][hkey="${hkey}"], input[qname="Q73"][type="checkbox"][vKey="${vkey}"][hkey="${hkey}"]`);
            if (!cb || cb.disabled) return;
            if (Boolean(cb.checked) !== Boolean(want)) cb.click();
            if (Boolean(cb.checked) !== Boolean(want)) {
              cb.checked = Boolean(want);
              if (typeof $ !== 'undefined') $(cb).prop('checked', Boolean(want)).trigger('change');
            }
          };
          // 1행(직접 생산): 국내(1), 2~4행(ODM·OEM·JDM): 없음(3), 5행(기타): 미입력 유지
          setCellCb('1', '2', false);
          setCellCb('1', '3', false);
          setCellCb('1', '1', true);
          for (const vk of ['2', '3', '4']) {
            setCellCb(vk, '1', false);
            setCellCb(vk, '2', false);
            setCellCb(vk, '3', true);
          }
          const etc73 = document.querySelector('[question-name="Q73"] input.input-etc');
          if (etc73 && etc73.value) setInputVal(etc73, '');
          return;
        }

        if (hasVisibleQ('Q74') && getQField('Q74', 'NUMBER_4')) {
          // B2B(NUMBER_4~6)=100/0/100, B2G(NUMBER_7~9)=0/0/0, B2C(NUMBER_10~12)=0/0/0 ➔ 매출 합계 100%, 수출 합계 0%, 영업이익 합계 100%
          const q74Map = {
            NUMBER_4: '100', NUMBER_5: '0', NUMBER_6: '100',
            NUMBER_7: '0', NUMBER_8: '0', NUMBER_9: '0',
            NUMBER_10: '0', NUMBER_11: '0', NUMBER_12: '0'
          };
          for (const [col, val] of Object.entries(q74Map)) {
            setInputVal(getQField('Q74', col), val, true);
          }
          return;
        }

        if (hasVisibleQ('Q75') && document.querySelector('[question-name="Q75"][question-type="GRADE"], table[qname="Q75"]')) {
          // 1순위(hkey=1): B2B(vkey=1), 2순위(hkey=2): B2C(vkey=3), 3순위(hkey=3): B2G(vkey=2) 순차 클릭
          const desiredPairs = [['1', '1'], ['2', '3'], ['3', '2']];
          for (const [hk, vk] of desiredPairs) {
            let r = document.querySelector(`input[qname="Q75"][type="radio"][hkey="${hk}"][vkey="${vk}"]:not(:disabled)`);
            if (!r || r.offsetParent === null) {
              r = Array.from(document.querySelectorAll(`input[qname="Q75"][type="radio"][hkey="${hk}"]:not(:disabled)`))
                .find(el => el.offsetParent !== null && window.getComputedStyle(el).visibility !== 'hidden');
            }
            if (r) {
              r.click();
              r.checked = true;
              if (typeof $ !== 'undefined') $(r).prop('checked', true).trigger('change');
              await new Promise(res => setTimeout(res, 120));
            }
          }
          return;
        }

        if (hasVisibleQ('Q80') && getQField('Q80', 'NUMBER_6')) {
          // 대기업(NUMBER_2=0, NUMBER_3=0), 중견기업(NUMBER_4=0, NUMBER_5=0), 중소기업(NUMBER_6=3개 ➔ 잠금 해제 후 NUMBER_7=100%)
          setInputVal(getQField('Q80', 'NUMBER_2'), '0', true);
          setInputVal(getQField('Q80', 'NUMBER_4'), '0', true);
          setInputVal(getQField('Q80', 'NUMBER_6'), '3', true);
          await new Promise(res => setTimeout(res, 120));
          setInputVal(getQField('Q80', 'NUMBER_3'), '0', true);
          setInputVal(getQField('Q80', 'NUMBER_5'), '0', true);
          setInputVal(getQField('Q80', 'NUMBER_7'), '100', true);
          return;
        }

        // [규칙 1-2] 문31 종사자 현황 (남+여 === 내국인+외국인 행별 정합성 보장 및 SUM 밸런서 오작동 차단)
        const editableNumberInputs = Array.from(document.querySelectorAll('input[type="number"]:not([readonly]):not([disabled])')).filter(i => i.offsetParent !== null);
        const allEditableBoxes = Array.from(document.querySelectorAll('input:not([readonly]):not([disabled])')).filter(el => isBoxInput(el) && el.tagName.toLowerCase() === 'input');

        if (bodyText.includes('종사자 현황') || (bodyText.includes('총 종사자') && bodyText.includes('내/외국인'))) {
          const empBoxes = editableNumberInputs.length === 20 ? editableNumberInputs : (allEditableBoxes.length === 20 ? allEditableBoxes : []);
          if (empBoxes.length === 20) {
            const isFemaleCeo = String(slot.ceoGender || meta['대표자 성별'] || '').includes('여') || String(meta.AA12 || '') === '2';
            for (let r = 1; r <= 5; r++) {
              const rowEditables = empBoxes.slice((r - 1) * 4, r * 4);
              let mVal = meta[`M31_${6 + r}`];
              let fVal = meta[`M31_${12 + r}`];
              let kVal = meta[`M31_${18 + r}`];
              let aVal = meta[`M31_${24 + r}`];

              if (mVal === undefined || fVal === undefined || kVal === undefined || aVal === undefined) {
                if (r === 1) {
                  mVal = isFemaleCeo ? '0' : '1';
                  fVal = isFemaleCeo ? '1' : '0';
                  kVal = '1';
                  aVal = '0';
                } else {
                  mVal = '0'; fVal = '0'; kVal = '0'; aVal = '0';
                }
              }

              // 정합성 검증: 남+여 === 내국인+외국인 보장
              const sumGender = (parseInt(mVal, 10) || 0) + (parseInt(fVal, 10) || 0);
              const sumNation = (parseInt(kVal, 10) || 0) + (parseInt(aVal, 10) || 0);
              if (sumGender !== sumNation) {
                kVal = String(sumGender);
                aVal = '0';
              }

              const targetVals = [String(mVal), String(fVal), String(kVal), String(aVal)];
              rowEditables.forEach((inp, cIdx) => {
                if (inp.value !== targetVals[cIdx]) {
                  setInputVal(inp, targetVals[cIdx]);
                }
              });
            }
          }
          return;
        }

        // [규칙 1-3] 문32 종업원 주당 평균 근무시간 및 휴무 기준 (COMPLEX)
        // Metrix 자체 data-script가 Q32_A_r에 change 이벤트 없이 .val()만 대입하거나, 비정기적 휴무(2)임에도 Q32_C_r 라디오를 강제 enable시키는 버그 보정
        if (hasVisibleQ('Q32') && document.querySelector('[question-name="Q32"][question-type="COMPLEX"], input[qname="Q32"][data-column^="Q32_A_"]')) {
          for (let r = 1; r <= 6; r++) {
            const inpA = document.querySelector(`input[qname="Q32"][data-column="Q32_A_${r}"]`);
            if (!inpA || inpA.offsetParent === null) continue;
            const curHrs = parseInt(inpA.value, 10);
            const fallbackHrs = r === 1 ? Number(pol.labor_ownerWeeklyHours || 45) : Number(pol.labor_staffWeeklyHours || 40);
            const hrs = (curHrs > 0 && curHrs <= 168) ? curHrs : fallbackHrs;
            setInputVal(inpA, hrs, true);

            const radiosB = Array.from(
              document.querySelectorAll(`input[type="radio"][qname="Q32"][data-column="Q32_B_${r}"]`)
            ).filter(el => el.offsetParent !== null && !el.disabled);
            if (radiosB.length === 0) continue;

            let bSel = radiosB.find(el => el.checked);
            const etcB3 = document.querySelector(`input[qname="Q32"][data-column^="Q32_B_${r}_3"]`);
            if (!bSel || (String(bSel.value) === '3' && (!etcB3 || !etcB3.value.trim()))) {
              bSel = radiosB.find(el => String(el.value) === '2') || radiosB[0];
            }
            if (bSel) {
              bSel.click();
              bSel.checked = true;
              if (typeof $ !== 'undefined') $(bSel).prop('checked', true).trigger('change');
              await new Promise(res => setTimeout(res, 60));

              const radiosC = Array.from(document.querySelectorAll(`input[type="radio"][qname="Q32"][data-column="Q32_C_${r}"]`));
              const inputsC = Array.from(document.querySelectorAll(`input[qname="Q32"][data-column^="Q32_C_${r}_"]`));

              if (String(bSel.value) === '1') {
                radiosC.forEach(rc => { rc.disabled = false; rc.removeAttribute('disabled'); });
                const cSel = radiosC.find(rc => rc.checked) || radiosC.find(rc => String(rc.value) === '2') || radiosC[0];
                if (cSel) {
                  cSel.click();
                  cSel.checked = true;
                  if (typeof $ !== 'undefined') $(cSel).prop('checked', true).trigger('change');
                  await new Promise(res => setTimeout(res, 60));
                  const cType = String(cSel.value);
                  const etc1 = document.querySelector(`input[qname="Q32"][data-column="Q32_C_${r}_${cType}_ETC_1"]`);
                  const etc2 = document.querySelector(`input[qname="Q32"][data-column="Q32_C_${r}_${cType}_ETC_2"]`);
                  if (etc1) {
                    const v1 = parseInt(etc1.value, 10);
                    setInputVal(etc1, v1 > 0 ? v1 : 1, true);
                  }
                  if (etc2) {
                    const v2 = parseInt(etc2.value, 10);
                    setInputVal(etc2, v2 > 0 ? v2 : (cType === '1' ? 4 : 1), true);
                  }
                }
              } else {
                radiosC.forEach(rc => {
                  if (rc.checked) {
                    rc.checked = false;
                    if (typeof $ !== 'undefined') $(rc).prop('checked', false).trigger('change');
                  }
                  rc.disabled = true;
                  rc.setAttribute('disabled', 'disabled');
                });
                inputsC.forEach(ic => {
                  if (ic.value) setInputVal(ic, '');
                  ic.disabled = true;
                  ic.setAttribute('disabled', 'disabled');
                });
              }
            }
          }
          return;
        }

        // [규칙 2] SUM 합계 밸런서 (문11-1 6대 영업비용 금액합계, 문14 6대 결제수단 100%, 문15-1 차입처별 비중 100%, 문81 등)
        if (bodyText.includes('남은 금액') || bodyText.includes('남은 값') || (bodyText.includes('합계') && allEditableBoxes.length >= 3 && bodyText.includes('%'))) {
          // 문15-1 등 상단에 '부채 총액: 총 [ ] 억 [ ] 만원' 입력란이 함께 있는 경우에만 비율(%) 칸과 분리
          const isDebtRatioScreen = bodyText.includes('부채 총액') || bodyText.includes('대출유형');
          const amountHeaderBoxes = isDebtRatioScreen
            ? allEditableBoxes.filter(inp => {
                const trTxt = (inp.closest('tr')?.innerText || '').replace(/\s+/g, ' ');
                const nextTxt = (inp.nextSibling?.textContent || '').trim();
                return trTxt.includes('부채 총액') || /^억|^만원/.test(nextTxt);
              })
            : [];

          if (amountHeaderBoxes.length >= 2 && isDebtRatioScreen) {
            const hasFilledAmt = amountHeaderBoxes.some(inp => String(inp.value || '').trim() !== '' && String(inp.value || '').trim() !== '0');
            if (!(preserveInputs && hasFilledAmt)) {
              const totalDebtManwon = (useMeta && Number(meta['M15-1']) > 0)
                ? Number(meta['M15-1'])
                : Number(pol.debt_totalAmount ?? 3000);
              setInputVal(amountHeaderBoxes[0], Math.floor(totalDebtManwon / 10000));
              setInputVal(amountHeaderBoxes[1], totalDebtManwon % 10000);
            }
          }

          // 실제 합계 대상 입력칸 추출 (문15-1의 부채 총액 억/만원 칸 제외)
          let sumInputs = allEditableBoxes.filter(inp => !amountHeaderBoxes.includes(inp));
          const moneyOnlyInputs = sumInputs.filter(inp => {
            const tdTxt = (inp.closest('td')?.innerText || '').replace(/\s+/g, '');
            return tdTxt.includes('만원') || (tdTxt.includes('원') && !tdTxt.includes('%'));
          });
          const pctOnlyInputs = sumInputs.filter(inp => {
            const tdTxt = (inp.closest('td')?.innerText || '').trim();
            return tdTxt.includes('%');
          });
          if (moneyOnlyInputs.length >= 2) {
            sumInputs = moneyOnlyInputs;
          } else if (pctOnlyInputs.length >= 2) {
            sumInputs = pctOnlyInputs;
          }

          if (sumInputs.length >= 2) {
            // 문11-1처럼 편집 가능한 칸이 '만원'이고 우측에 읽기전용 '% (남은 값 : 100%)' 열이 병기된 화면은 반드시 금액(만원) 합계로 처리!
            const isMoneySum = moneyOnlyInputs.length >= 2 || bodyText.includes('남은 금액');
            let targetTotal = 100;
            if (isMoneySum) {
              const sumTr = Array.from(document.querySelectorAll('tr')).find(tr => {
                const firstCell = (tr.querySelector('th, td')?.innerText || '').replace(/\s+/g, '');
                return firstCell === '합계' || firstCell.startsWith('합계');
              });
              const sumRowTxt = (sumTr?.innerText || '').replace(/\s+/g, ' ');
              const rowMatch = sumRowTxt.match(/([0-9,]+)\s*(?:만원|원)/i);
              const errMatch = bodyText.match(/합은\s*([0-9,]+)\s*(?:가|이)\s*되어야/);
              const bodyMatch = bodyText.match(/합계\s*([0-9,]+)\s*(?:만원|원)/i);
              const rawTot = (errMatch?.[1] || rowMatch?.[1] || bodyMatch?.[1] || '').replace(/,/g, '');
              const parsedTot = parseInt(rawTot, 10);
              if (!isNaN(parsedTot) && parsedTot > 0) targetTotal = parsedTot;
            }

            const existingSum = sumInputs.reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
            if (preserveInputs && existingSum === targetTotal) {
              sumInputs.forEach(inp => setInputVal(inp, inp.value));
              return;
            }

            const distributeRatios = (inputs, ratios) => {
              const count = inputs.length;
              const activeRatios = ratios.slice(0, count);
              while (activeRatios.length < count) activeRatios.push(0);
              const ratioSum = activeRatios.reduce((a, b) => a + b, 0) || 100;
              let allocated = 0;
              inputs.forEach((inp, idx) => {
                let val = 0;
                if (idx < count - 1) {
                  val = Math.round(targetTotal * (activeRatios[idx] / ratioSum));
                  if (allocated + val > targetTotal) val = Math.max(0, targetTotal - allocated);
                  allocated += val;
                } else {
                  val = Math.max(0, targetTotal - allocated);
                }
                setInputVal(inp, val);
              });
            };

            // (A) 문14 고객 결제수단 비중
            if (bodyText.includes('결제') && (bodyText.includes('유형') || bodyText.includes('비율') || bodyText.includes('수단'))) {
              const hasPanelPay = useMeta && (meta.M14 !== undefined || meta.M14_1 !== undefined);
              if (hasPanelPay && sumInputs.length >= 5) {
                const panelRatios = [
                  Number(meta.M14 || 0),
                  Number(meta.M14_1 || 0),
                  Number(meta.M14_2 || 0),
                  Number(meta.M14_3 || 0),
                  Number(meta.M14_4 || 0),
                  Number(meta.M14_5 || 0)
                ];
                if (panelRatios.reduce((a, b) => a + b, 0) > 0) {
                  distributeRatios(sumInputs, panelRatios);
                  return;
                }
              }
              if (sumInputs.length === 3) {
                distributeRatios(sumInputs, [
                  Number(pol.payment_cardRatio ?? 65),
                  Number(pol.payment_mobileRatio ?? 10) + Number(pol.payment_localCurrencyRatio ?? 10),
                  Number(pol.payment_cashRatio ?? 10) + Number(pol.payment_transferRatio ?? 5)
                ]);
              } else {
                distributeRatios(sumInputs, [
                  Number(pol.payment_cashRatio ?? 10),
                  Number(pol.payment_cardRatio ?? 65),
                  Number(pol.payment_mobileRatio ?? 10),
                  Number(pol.payment_localCurrencyRatio ?? 10),
                  Number(pol.payment_voucherRatio ?? 0),
                  Number(pol.payment_transferRatio ?? 5)
                ]);
              }
              return;
            }

            // (B) 문15-1 대출유형별 비율 (은행권, 저축은행, 여신, 지인, 기타 기관 — 정부지원금 제외 안내 준수)
            if (bodyText.includes('대출') || bodyText.includes('부채') || bodyText.includes('차입')) {
              const hasPanelDebt = useMeta && (meta['M15-1_1'] !== undefined || meta['M15-1_2'] !== undefined);
              if (hasPanelDebt && sumInputs.length >= 3) {
                const panelDebtRatios = [
                  Number(meta['M15-1_1'] || 0),
                  Number(meta['M15-1_2'] || 0),
                  Number(meta['M15-1_3'] || 0),
                  Number(meta['M15-1_4'] || 0),
                  Number(meta['M15-1_5'] || 0)
                ];
                if (panelDebtRatios.reduce((a, b) => a + b, 0) > 0) {
                  distributeRatios(sumInputs, panelDebtRatios);
                  return;
                }
              }
              distributeRatios(sumInputs, [
                Number(pol.debt_bankRatio ?? 90),
                Number(pol.debt_secondTierRatio ?? 10),
                0,
                0,
                0
              ]);
              return;
            }

            // (C) 문11-1 영업비용 세부항목 구성 (행 라벨 기반 동적 비율 매핑으로 2025년 영업비용 총합계 100% 일치 보장)
            if (bodyText.includes('영업비용') || bodyText.includes('세부 항목') || bodyText.includes('매입비') || bodyText.includes('구입비용')) {
              const matR = Number(pol.cost_materialRatio ?? 50);
              const rentR = Number(pol.cost_rentRatio ?? 18);
              const taxR = Number(pol.cost_taxRatio ?? 8);
              const laborR = Number(pol.cost_laborRatio ?? 16);
              const feeR = Number(pol.cost_feeAdRatio ?? 4);
              const etcR = Number(pol.cost_otherRatio ?? 4);

              const dynamicCostRatios = sumInputs.map((inp, idx) => {
                const rLabel = (inp.closest('tr')?.innerText || '').replace(/\s+/g, ' ');
                if (rLabel.includes('재료') || rLabel.includes('원자재') || rLabel.includes('구입') || rLabel.includes('매입')) return matR;
                if (rLabel.includes('임차') || rLabel.includes('임대')) return rentR;
                if (rLabel.includes('세금') || rLabel.includes('공과금')) return taxR;
                if (rLabel.includes('대표자') && rLabel.includes('인건비')) return Math.max(0, Math.round(laborR * 0.35));
                if (rLabel.includes('종업원') || rLabel.includes('인건비')) return Math.max(0, Math.round(laborR * 0.65));
                if (rLabel.includes('수수료') || rLabel.includes('광고')) return feeR;
                if (rLabel.includes('기타')) return feeR + etcR;
                return [matR, rentR, taxR, Math.round(laborR * 0.35), Math.round(laborR * 0.65), feeR + etcR][idx] ?? 5;
              });
              distributeRatios(sumInputs, dynamicCostRatios);
              return;
            }

            // (D) 문81(제조업 납품유형별 비중: 완제품 0%, 부분품 50%, 임가공 50%) 및 기타 일반 SUM 문항
            if (hasVisibleQ('Q81') && sumInputs.length === 3) {
              distributeRatios(sumInputs, [0, 50, 50]);
              return;
            }

            sumInputs.forEach((inp, idx) => {
              const v = (idx === 0) ? String(targetTotal) : '0';
              setInputVal(inp, v);
            });
            return;
          }
        }

        // ------------------------------------------------------------------
        // [3차 본조사 20대 문항별 응답 가이드 정밀 오버라이드 엔진]
        // Metrix [LIST:M*] 자동채움 스크립트가 선행 기입한 값이라도 가이드 설정값을 최우선 적용
        // ------------------------------------------------------------------
        const overriddenQNames = new Set();
        const overriddenInputs = new Set();

        // (1) 문10 자금 분리 관리 여부 (랜덤 1~3) & 문10-1 혼용 사유 (1~4 중 랜덤)
        if (hasVisibleQ('Q10')) {
          const mode10 = pol.q10_fundMgmtMode || 'random';
          let v10 = '2';
          if (mode10 === 'random') v10 = pickRandom(['1', '2', '3']);
          else if (['1', '2', '3'].includes(String(mode10))) v10 = String(mode10);
          else v10 = (useMeta && meta.M10) ? String(meta.M10) : pickRandom(['1', '2', '3']);
          selectQRadio('Q10', v10);
          overriddenQNames.add('Q10');
        }
        if (hasVisibleQ('Q10_1')) {
          const cnt = Math.random() > 0.5 ? 2 : 1;
          setQChecks('Q10_1', shuffleArr(['1', '2', '3', '4']).slice(0, cnt));
          overriddenQNames.add('Q10_1');
        }

        // (3) 문16-1 임대차 보증금·월세 엑셀(구글시트) 실측값 우선 입력
        if (hasVisibleQ('Q16_1')) {
          const leaseSrc = pol.q16_1_leaseSource || 'excel_first';
          const hasExcelDep = slot.excelDeposit !== undefined && slot.excelDeposit !== null && slot.excelDeposit !== '';
          const hasExcelRent = slot.excelMonthlyRent !== undefined && slot.excelMonthlyRent !== null && slot.excelMonthlyRent !== '';

          let depManwon = 2000;
          let rentManwon = 120;
          if (leaseSrc === 'excel_first') {
            depManwon = hasExcelDep
              ? Number(slot.excelDeposit)
              : ((useMeta && meta['M16-1_1'] !== undefined) ? Number(meta['M16-1_1']) : Number(pol.lease_deposit ?? 2000));
            rentManwon = hasExcelRent
              ? Number(slot.excelMonthlyRent)
              : ((useMeta && meta['M16-1_2'] !== undefined) ? Number(meta['M16-1_2']) : Number(pol.lease_monthlyRent ?? 120));
          } else if (leaseSrc === 'fixed') {
            depManwon = Number(pol.lease_deposit ?? 2000);
            rentManwon = Number(pol.lease_monthlyRent ?? 120);
          } else {
            depManwon = (useMeta && meta['M16-1_1'] !== undefined) ? Number(meta['M16-1_1']) : Number(slot.excelDeposit ?? pol.lease_deposit ?? 2000);
            rentManwon = (useMeta && meta['M16-1_2'] !== undefined) ? Number(meta['M16-1_2']) : Number(slot.excelMonthlyRent ?? pol.lease_monthlyRent ?? 120);
          }
          depManwon = Math.max(0, Math.round(Number(depManwon) || 0));
          rentManwon = Math.max(0, Math.round(Number(rentManwon) || 0));

          if (depManwon > 0 && rentManwon > 0) {
            selectQRadio('Q16_1', '1');
            await new Promise(res => setTimeout(res, 100));
            setInputVal(getQField('Q16_1', 'NUMBER_1'), Math.floor(depManwon / 10000), true);
            setInputVal(getQField('Q16_1', 'NUMBER_2'), depManwon % 10000, true);
            setInputVal(getQField('Q16_1', 'NUMBER_3'), Math.floor(rentManwon / 10000), true);
            setInputVal(getQField('Q16_1', 'NUMBER_4'), rentManwon % 10000, true);
          } else if (depManwon <= 0 && rentManwon > 0) {
            selectQRadio('Q16_1', '2');
            await new Promise(res => setTimeout(res, 100));
            setInputVal(getQField('Q16_1', 'NUMBER_5'), Math.floor(rentManwon / 10000), true);
            setInputVal(getQField('Q16_1', 'NUMBER_6'), rentManwon % 10000, true);
          } else if (depManwon > 0 && rentManwon <= 0) {
            selectQRadio('Q16_1', '3');
            await new Promise(res => setTimeout(res, 100));
            setInputVal(getQField('Q16_1', 'NUMBER_7'), Math.floor(depManwon / 10000), true);
            setInputVal(getQField('Q16_1', 'NUMBER_8'), depManwon % 10000, true);
          } else {
            selectQRadio('Q16_1', '5');
            await new Promise(res => setTimeout(res, 100));
            setInputVal(getQField('Q16_1', 'TEXT_1'), '가족·지인 소유 무상 사용', true);
          }
          overriddenQNames.add('Q16_1');
          Array.from(document.querySelectorAll('[question-name="Q16_1"] input, input[qname="Q16_1"]')).forEach(el => overriddenInputs.add(el));
        }

        // (4) 문17 권리금 유무 & 문17-1 권리금 금액 범위설정 (1000~5000만원, 500만원 단위)
        if (hasVisibleQ('Q17')) {
          const gVal = (pol.goodwill_hasGoodwill === '1' || pol.goodwill_hasGoodwill === '2')
            ? String(pol.goodwill_hasGoodwill)
            : ((useMeta && meta.M17) ? String(meta.M17) : '2');
          selectQRadio('Q17', gVal);
          overriddenQNames.add('Q17');
        }
        if (hasVisibleQ('Q17_1')) {
          const gwMode = pol.q17_goodwillRangeMode || 'range';
          const gwVal = (gwMode === 'panel' && useMeta && Number(meta['M17-1']) > 0)
            ? Math.round(Number(meta['M17-1']))
            : Math.max(0, Math.round(Number(pickedGoodwillManwon || 2000)));
          const q17Boxes = Array.from(document.querySelectorAll('[question-name="Q17_1"] input, input[qname="Q17_1"]')).filter(isBoxInput);
          const gwN1 = getQField('Q17_1', 'NUMBER_1') || q17Boxes[0] || null;
          const gwN2 = getQField('Q17_1', 'NUMBER_2') || (q17Boxes.length >= 2 ? q17Boxes[1] : null);
          if (gwN1 && gwN2) {
            setInputVal(gwN1, Math.floor(gwVal / 10000), true);
            setInputVal(gwN2, gwVal % 10000, true);
          } else if (gwN1) {
            setInputVal(gwN1, gwVal, true);
          }
          Array.from(document.querySelectorAll('[question-name="Q17_1"] input, input[qname="Q17_1"]')).forEach(el => overriddenInputs.add(el));
        }

        // (5) 문21 여성 기업인 애로사항 랜덤 (1~5 중 1~2개, 6 기타 제외)
        if (hasVisibleQ('Q21') && (pol.q21_femaleDiffMode || 'random') !== 'panel') {
          const cnt21 = Math.random() > 0.5 ? 2 : 1;
          setQChecks('Q21', shuffleArr(['1', '2', '3', '4', '5']).slice(0, cnt21));
          overriddenQNames.add('Q21');
        }

        // (6) 문23 이상기후 피해 여부 — 없음(2) 100%
        if (hasVisibleQ('Q23')) {
          const v23 = (pol.q23_climateImpact === '1' || pol.q23_climateImpact === '2')
            ? String(pol.q23_climateImpact)
            : ((useMeta && meta.M23) ? String(meta.M23) : '2');
          selectQRadio('Q23', v23);
          overriddenQNames.add('Q23');
        }

        // (7) 문24 사업 경쟁력 제고 노력 랜덤 (1~7 중 1~2개, 8 기타 제외)
        if (hasVisibleQ('Q24') && (pol.q24_competitivenessMode || 'random') !== 'panel') {
          const cnt24 = Math.random() > 0.45 ? 2 : 1;
          setQChecks('Q24', shuffleArr(['1', '2', '3', '4', '5', '6', '7']).slice(0, cnt24));
          overriddenQNames.add('Q24');
        }

        // (8) 문25 사업 외 기타 소득 유무 — 없음(2) 100%
        if (hasVisibleQ('Q25')) {
          const v25 = (pol.q25_otherIncome === '1' || pol.q25_otherIncome === '2')
            ? String(pol.q25_otherIncome)
            : ((useMeta && meta.M25) ? String(meta.M25) : '2');
          selectQRadio('Q25', v25);
          overriddenQNames.add('Q25');
        }

        // (9·10) 문26 온라인 매출 유무 (5.음식 및 주점업만 1번 예, 그 외 2번 아니오) & 문26-1~6 하위 체인
        if (hasVisibleQ('Q26')) {
          const rule26 = pol.q26_onlineRule || 'food_only_yes';
          let v26 = '2';
          if (rule26 === 'food_only_yes') v26 = isFoodInd ? '1' : '2';
          else if (rule26 === 'all_no') v26 = '2';
          else if (rule26 === 'all_yes') v26 = '1';
          else v26 = (useMeta && meta.M26) ? String(meta.M26) : (isFoodInd ? '1' : '2');
          selectQRadio('Q26', v26);
          overriddenQNames.add('Q26');
        }
        if (hasVisibleQ('Q26_1')) {
          if (isFoodInd) {
            const chMode = String(pol.q26_1_foodChannel || '3');
            const chKeys = chMode === '3_4' ? ['3', '4'] : [chMode];
            setQChecks('Q26_1', chKeys);
          } else {
            setQChecks('Q26_1', ['2']);
          }
          overriddenQNames.add('Q26_1');
        }
        if (hasVisibleQ('Q26_2')) {
          const q26_2Boxes = Array.from(document.querySelectorAll('[question-name="Q26_2"] input, input[qname="Q26_2"]')).filter(isBoxInput);
          const inp26_2 = getQField('Q26_2', 'NUMBER_1') || q26_2Boxes[0] || null;
          if (inp26_2) {
            const curV = parseFloat(inp26_2.value);
            const targetPct = (curV > 0 && curV <= 100) ? Math.round(curV) : 25;
            setInputVal(inp26_2, targetPct, true);
            overriddenInputs.add(inp26_2);
          }
        }
        if (hasVisibleQ('Q26_3')) {
          const r26_3 = (useMeta && ['1', '2'].includes(String(meta['M26-3']))) ? String(meta['M26-3']) : pickRandom(['1', '2']);
          selectQRadio('Q26_3', r26_3);
          await new Promise(res => setTimeout(res, 100));
          const targetCol = r26_3 === '1' ? 'NUMBER_1' : 'NUMBER_2';
          const otherCol = r26_3 === '1' ? 'NUMBER_2' : 'NUMBER_1';
          const inpTarget = getQField('Q26_3', targetCol);
          const inpOther = getQField('Q26_3', otherCol);
          if (inpOther && !inpOther.disabled && inpOther.value) setInputVal(inpOther, '');
          if (inpTarget) {
            const curPct = parseFloat(inpTarget.value);
            setInputVal(inpTarget, (curPct > 0 && curPct <= 100) ? Math.round(curPct) : 10, true);
          }
          overriddenQNames.add('Q26_3');
          Array.from(document.querySelectorAll('[question-name="Q26_3"] input, input[qname="Q26_3"]')).forEach(el => overriddenInputs.add(el));
        }
        if (hasVisibleQ('Q26_4')) {
          const q26_4Boxes = Array.from(document.querySelectorAll('[question-name="Q26_4"] input, input[qname="Q26_4"]')).filter(isBoxInput);
          const inp26_4 = getQField('Q26_4', 'NUMBER_1') || q26_4Boxes[0] || null;
          if (inp26_4) {
            const curFee = parseFloat(inp26_4.value);
            setInputVal(inp26_4, curFee > 0 ? Math.round(curFee) : 35, true);
            overriddenInputs.add(inp26_4);
          }
        }
        if (hasVisibleQ('Q26_5')) {
          const q26_5Boxes = Array.from(document.querySelectorAll('[question-name="Q26_5"] input, input[qname="Q26_5"]')).filter(isBoxInput);
          const inp26_5 = getQField('Q26_5', 'NUMBER_1') || q26_5Boxes[0] || null;
          if (inp26_5) {
            const curFee = parseFloat(inp26_5.value);
            setInputVal(inp26_5, curFee > 0 ? Math.round(curFee) : 20, true);
            overriddenInputs.add(inp26_5);
          }
        }
        if (hasVisibleQ('Q26_6')) {
          const cnt26_6 = Math.random() > 0.5 ? 2 : 1;
          setQChecks('Q26_6', shuffleArr(['1', '2', '3', '4', '5', '6', '7']).slice(0, cnt26_6));
          overriddenQNames.add('Q26_6');
        }

        // (11) 문34 근로자 1인당 월평균 급여 범위설정 (240~320만원, 5만원 단위)
        if (hasVisibleQ('Q34')) {
          const q34Boxes = Array.from(document.querySelectorAll('[question-name="Q34"] input, input[qname="Q34"]')).filter(isBoxInput);
          const inp34_1 = getQField('Q34', 'NUMBER_1') || q34Boxes[0] || null;
          const inp34_2 = getQField('Q34', 'NUMBER_2') || (q34Boxes.length >= 2 ? q34Boxes[1] : null);
          if (inp34_1) {
            const wMode = pol.q34_wageRangeMode || 'range';
            const wageVal = (wMode === 'panel' && useMeta && Number(meta.M34) > 0)
              ? Math.round(Number(meta.M34))
              : Math.round(Number(pickedWageManwon || 280));
            if (inp34_1 && inp34_2) {
              setInputVal(inp34_1, Math.floor(wageVal / 10000), true);
              setInputVal(inp34_2, wageVal % 10000, true);
            } else {
              setInputVal(inp34_1, wageVal, true);
            }
            Array.from(document.querySelectorAll('[question-name="Q34"] input, input[qname="Q34"]')).forEach(el => overriddenInputs.add(el));
          }
        }

        // (12) 문35 전년대비 종업원 수 변동 — 변동 없음(2) 100%
        if (hasVisibleQ('Q35')) {
          const v35 = ['1', '2', '3'].includes(String(pol.q35_empChange))
            ? String(pol.q35_empChange)
            : ((useMeta && meta.M35) ? String(meta.M35) : '2');
          selectQRadio('Q35', v35);
          overriddenQNames.add('Q35');
        }

        // (13) 문43 폐업·전환 고려 여부 (기본 2=아니오 ➔ 문43-4 사업지속 이유 진입)
        if (hasVisibleQ('Q43')) {
          const v43 = String(pol.future_businessPlan || '1') === '2' ? '1' : '2';
          selectQRadio('Q43', v43);
          overriddenQNames.add('Q43');
        }

        // (14) 문44 향후 투자·확장 계획 랜덤 (1번 SINGLE 배타성 준수, 9 기타 제외)
        if (hasVisibleQ('Q44')) {
          const mode44 = pol.q44_investPlanMode || 'random';
          if (mode44 === '1_only') {
            setQChecks('Q44', ['1']);
          } else if (mode44 === 'random_active') {
            const cnt44 = Math.random() > 0.5 ? 2 : 1;
            setQChecks('Q44', shuffleArr(['2', '3', '4', '5', '6', '7', '8']).slice(0, cnt44));
          } else {
            if (Math.random() < 0.28) {
              setQChecks('Q44', ['1']);
            } else {
              const cnt44 = Math.random() > 0.5 ? 2 : 1;
              setQChecks('Q44', shuffleArr(['2', '3', '4', '5', '6', '7', '8']).slice(0, cnt44));
            }
          }
          overriddenQNames.add('Q44');
        }

        // (15) 문60 보증지원사업 인지도 — 보증지원여부(O)는 3,4 중 선택 / 그외(X)는 1,2 중 선택 + 문60-1/61/61-1 연동
        if (hasVisibleQ('Q60')) {
          const rule60 = pol.q60_awarenessRule || 'guarantee_sync';
          let v60 = '2';
          if (rule60 === 'guarantee_sync') {
            v60 = guarValGlobal === 'O' ? pickRandom(['3', '4']) : pickRandom(['1', '2']);
          } else if (rule60 === 'random_all') {
            v60 = pickRandom(['1', '2', '3', '4']);
          } else if (rule60 === '3_4') {
            v60 = pickRandom(['3', '4']);
          } else {
            v60 = pickRandom(['1', '2']);
          }
          selectQRadio('Q60', v60);
          overriddenQNames.add('Q60');
        }
        if (hasVisibleQ('Q60_1')) {
          selectQRadio('Q60_1', pickRandom(['1', '2', '3', '4', '5', '6', '7']));
          overriddenQNames.add('Q60_1');
        }
        if (hasVisibleQ('Q61')) {
          const v61 = guarValGlobal === 'O' ? pickRandom(['3', '4']) : pickRandom(['1', '2']);
          selectQRadio('Q61', v61);
          overriddenQNames.add('Q61');
        }
        if (hasVisibleQ('Q61_1')) {
          selectQRadio('Q61_1', pickRandom(['1', '2', '3', '4', '5', '6', '7']));
          overriddenQNames.add('Q61_1');
        }

        // (16) 문66·문66-1 타 기관 지원사업 인지 경로 랜덤 (1~7 중 무작위, 8 기타 제외) & 문66-2
        if (hasVisibleQ('Q66')) {
          selectQRadio('Q66', pickRandom(['2', '3']));
          overriddenQNames.add('Q66');
        }
        if (hasVisibleQ('Q66_1')) {
          const mode66_1 = pol.q66_1_otherOrgRouteMode || 'random';
          const v66_1 = mode66_1 === 'random' ? pickRandom(['1', '2', '3', '4', '5', '6', '7']) : String(mode66_1);
          selectQRadio('Q66_1', v66_1);
          overriddenQNames.add('Q66_1');
        }
        if (hasVisibleQ('Q66_2')) {
          const cnt66_2 = Math.random() > 0.5 ? 2 : 1;
          setQChecks('Q66_2', shuffleArr(['1', '2', '3', '4', '5']).slice(0, cnt66_2));
          overriddenQNames.add('Q66_2');
        }

        // (19) 제조업 전용 추가문항 (문69 ~ 문92-2) — 모두 '아니오 / 없음' 응답
        const mfgMode = pol.q69_mfgAddRule || 'all_no';
        if (hasVisibleQ('Q69')) {
          selectQRadio('Q69', '2'); // 아니오
          overriddenQNames.add('Q69');
        }
        if (hasVisibleQ('Q70')) {
          selectQRadio('Q70', '2'); // 아니오 (Q70_A 자동 비활성/스킵)
          overriddenQNames.add('Q70');
          overriddenQNames.add('Q70_A');
        }
        if (hasVisibleQ('Q71')) {
          selectQRadio('Q71', '2'); // 없음
          overriddenQNames.add('Q71');
        }
        if (hasVisibleQ('Q72')) {
          selectQRadio('Q72', mfgMode === 'mixed' ? '2' : '1'); // 1=없음
          overriddenQNames.add('Q72');
        }
        if (hasVisibleQ('Q76')) {
          selectQRadio('Q76', pickRandom(['1', '2', '4', '6', '8']));
          overriddenQNames.add('Q76');
        }
        if (hasVisibleQ('Q77')) {
          selectQRadio('Q77', '4'); // 위탁기업도, 수탁기업도 아님 (Q78~Q79 스킵)
          overriddenQNames.add('Q77');
        }
        if (hasVisibleQ('Q82')) {
          selectQRadio('Q82', mfgMode === 'mixed' ? '3' : '1'); // 1=3년 이상 거래 기업 없음
          overriddenQNames.add('Q82');
        }
        if (hasVisibleQ('Q83')) {
          selectQRadio('Q83', '2'); // 전속 거래 없음 (Q84 스킵)
          overriddenQNames.add('Q83');
        }
        if (hasVisibleQ('Q90')) {
          selectQRadio('Q90', '2'); // 자체 브랜드 활용하지 않음 (Q90_A 스킵)
          overriddenQNames.add('Q90');
          overriddenQNames.add('Q90_A');
        }
        if (hasVisibleQ('Q92')) {
          selectQRadio('Q92', '2'); // 스마트공장 도입 여부: 아니오
          overriddenQNames.add('Q92');
        }
        if (hasVisibleQ('Q92_2')) {
          setQChecks('Q92_2', pickRandom([['1'], ['2'], ['1', '2']]));
          overriddenQNames.add('Q92_2');
        }

        // ------------------------------------------------------------------
        // 라디오 버튼(RADIO) 그룹 처리 — 2-Pass 연쇄 활성화 대응 (문64 인지여부 ➔ 이용경험 등)
        // ------------------------------------------------------------------
        const getRadioLabel = (r) => {
          if (r.id && window.CSS && CSS.escape) {
            const lbl = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
            if (lbl && lbl.innerText.trim()) return lbl.innerText.replace(/\s+/g, ' ').trim();
          }
          const wrap = r.closest('label, li, td, .item, .answer-item');
          return wrap ? wrap.innerText.replace(/\s+/g, ' ').trim() : '';
        };

        const selectRadioByVal = (group, val, fallbackIdx = 0) => {
          const strVal = String(val);
          const pick = group.find(r => String(r.value) === strVal) || group[Math.min(fallbackIdx, group.length - 1)] || group[0];
          if (pick) {
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
          }
        };

        const isM64Screen = bodyText.includes('경기신용보증재단') && (
          bodyText.includes('운영하는 아래 상품') || bodyText.includes('인지여부') || bodyText.includes('문64')
        );

        const fillRadioGroupsPass = (passNo) => {
          const radioGroups = {};
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.offsetParent !== null && !r.disabled);
          radios.forEach(r => {
            const name = r.name || r.getAttribute('qname') || 'default_group';
            if (!radioGroups[name]) radioGroups[name] = [];
            radioGroups[name].push(r);
          });

          const allRadioRows = Array.from(document.querySelectorAll('tr')).filter(tr => tr.querySelector('input[type="radio"]'));

          for (const name in radioGroups) {
            const group = radioGroups[name];
            if (group.length === 0) continue;
            const grpQName = group[0].getAttribute('qname') || name;
            if (overriddenQNames.has(grpQName) || overriddenQNames.has(name)) continue;

            const ownerTr = group[0].closest('tr');
            // RADIOSETS 행에 빈 input-etc(예: 문91 9번 기타)가 있을 경우 오체크 방지
            if (ownerTr && ownerTr.querySelector('input.input-etc, textarea.input-etc')) {
              const etcInp = ownerTr.querySelector('input.input-etc, textarea.input-etc');
              if (!etcInp.value || !etcInp.value.trim()) continue;
            }

            const isChecked = group.some(r => r.checked);
            if (isChecked && (preserveInputs || passNo > 1)) continue;

            const groupLabelsJoined = group.map(getRadioLabel).join(' ');
            const rowIdx = ownerTr ? Math.max(0, allRadioRows.indexOf(ownerTr)) : 0;

            // [특수 연쇄 테이블] 문64 경기신용보증재단 상품별 인지여부(1열) ➔ 이용경험(2열)
            if (isM64Screen || (groupLabelsJoined.includes('알고 있') && groupLabelsJoined.includes('모름')) || groupLabelsJoined.includes('이용경험')) {
              if (groupLabelsJoined.includes('이용경험')) {
                const useExpVal = (guarValGlobal === 'O' && rowIdx === 0) ? '1' : '2';
                selectRadioByVal(group, useExpVal, useExpVal === '1' ? 0 : 1);
                continue;
              }
              if (groupLabelsJoined.includes('알고 있') || groupLabelsJoined.includes('모름')) {
                const knowVal = rowIdx <= 1 ? '1' : '2';
                selectRadioByVal(group, knowVal, knowVal === '1' ? 0 : 1);
                continue;
              }
            }

            // A5 프랜차이즈 여부 (1=프랜차이즈, 2=비프랜차이즈)
            if (bodyText.includes('프랜차이즈') || name.includes('AA5') || name.includes('A5')) {
              const fVal = (pol.general_franchiseMode === '1' || pol.general_franchiseMode === '2')
                ? pol.general_franchiseMode
                : ((useMeta && meta.AA5) ? String(meta.AA5) : '2');
              selectRadioByVal(group, fVal, 1);
              continue;
            }

            // A7 입지 유형
            if (bodyText.includes('입지 유형') || name.includes('AA7') || name.includes('A7')) {
              const locVal = (useMeta && meta.AA7) ? String(meta.AA7) : String(pol.general_locationType || '1');
              selectRadioByVal(group, locVal, 0);
              continue;
            }

            // A8 창업 형태
            if (bodyText.includes('창업 형태') || bodyText.includes('창업방식') || name.includes('AA8') || name.includes('A8')) {
              const fndVal = (useMeta && meta.AA8) ? String(meta.AA8) : String(pol.general_founderType || '1');
              selectRadioByVal(group, fndVal, 0);
              continue;
            }

            // A15 창업 직전 지위
            if (bodyText.includes('창업 직전') || bodyText.includes('종사상 지위') || name.includes('AA15') || name.includes('A15')) {
              const prevVal = (useMeta && meta.AA15) ? String(meta.AA15) : String(pol.general_prevStatus || '1');
              selectRadioByVal(group, prevVal, 0);
              continue;
            }

            // 문8-2 정기휴무 요일
            if (bodyText.includes('정기휴무') || bodyText.includes('휴무 요일')) {
              const closedDayVal = (useMeta && meta['M9-2_6']) ? String(meta['M9-2_6']) : String(pol.operating_closedDayOfWeek || '7');
              selectRadioByVal(group, closedDayVal, group.length - 1);
              continue;
            }

            // 문9 온라인 판매 / 배달앱 활용 여부
            if (bodyText.includes('온라인 판매') || bodyText.includes('배달앱') || bodyText.includes('전자상거래')) {
              const onVal = (pol.digital_onlineSales === '1' || pol.digital_onlineSales === '2')
                ? pol.digital_onlineSales
                : ((useMeta && meta.M9) ? String(meta.M9) : '2');
              selectRadioByVal(group, onVal, 1);
              continue;
            }

            // 문9-1·9-2 디지털기기 / 스마트기술 도입 여부
            if (bodyText.includes('키오스크') || bodyText.includes('디지털 기기') || bodyText.includes('스마트기술') || bodyText.includes('포스(POS)')) {
              const smVal = pol.digital_smartTech === 'active'
                ? '1'
                : (pol.digital_smartTech === 'none' ? '2' : ((useMeta && meta['M9-1']) ? String(meta['M9-1']) : '1'));
              selectRadioByVal(group, smVal, 0);
              continue;
            }

            // 문12 등 경영실적 변화 추세
            if (bodyText.includes('경영실적') && (bodyText.includes('전년') || bodyText.includes('비교') || bodyText.includes('어떠'))) {
              if (group.length === 3) {
                const tVal = trendMode === 'growth' ? '3' : (trendMode === 'decrease' ? '1' : ((useMeta && meta.M10) ? String(meta.M10) : '2'));
                selectRadioByVal(group, tVal, 1);
              } else {
                const tIdx = trendMode === 'growth' ? Math.min(group.length - 1, 3) : (trendMode === 'decrease' ? 1 : 2);
                selectRadioByVal(group, group[tIdx]?.value, tIdx);
              }
              continue;
            }

            // 문15 사업체 부채(대출) 보유 여부 (1=있음, 2=없음)
            if ((bodyText.includes('부채') || bodyText.includes('대출금')) && (bodyText.includes('보유') || bodyText.includes('있습니'))) {
              const fallbackM15 = guarValGlobal === 'O' ? '1' : '2';
              const dVal = (pol.debt_hasDebt === '1' || pol.debt_hasDebt === '2')
                ? pol.debt_hasDebt
                : ((useMeta && meta.M15) ? String(meta.M15) : fallbackM15);
              selectRadioByVal(group, dVal, 1);
              continue;
            }

            // 문16 사업장 점유 형태 (자가 vs 임차)
            if (bodyText.includes('점유 형태') || bodyText.includes('임차 형태') || (bodyText.includes('자가') && bodyText.includes('임차'))) {
              if (group.length === 2) {
                const ownOrRent = pol.lease_type === 'own' ? '1' : ((useMeta && meta.M16) ? String(meta.M16) : '2');
                selectRadioByVal(group, ownOrRent, 1);
              } else {
                const subType = pol.lease_type === 'jeonse' ? '3' : (pol.lease_type === 'free' ? '4' : ((useMeta && meta['M16-1']) ? String(meta['M16-1']) : '1'));
                selectRadioByVal(group, subType, 0);
              }
              continue;
            }

            // 문18 권리금 회수 가능성
            if (bodyText.includes('권리금') && bodyText.includes('회수')) {
              const recVal = (useMeta && meta.M18) ? String(meta.M18) : String(pol.goodwill_recoveryExpect || '2');
              selectRadioByVal(group, recVal, 1);
              continue;
            }

            // 상권 경쟁 체감도 척도
            if (bodyText.includes('경쟁') && (bodyText.includes('상권') || bodyText.includes('동종'))) {
              const compVal = (useMeta && meta.M24) ? String(meta.M24) : String(pol.market_competitionLevel || '5');
              selectRadioByVal(group, compVal, Math.min(group.length - 1, 3));
              continue;
            }

            // 문32_1~4 4대보험 가입 여부 (1=가입, 2=미가입)
            if (bodyText.includes('고용보험') || bodyText.includes('산재보험') || bodyText.includes('국민연금') || bodyText.includes('건강보험') || bodyText.includes('4대보험')) {
              let insVal = '1';
              if (pol.labor_insuranceMode === 'none') insVal = '2';
              else if (pol.labor_insuranceMode === 'all_joined') insVal = '1';
              else if (useMeta && meta.M32_1) insVal = String(meta.M32_1);
              selectRadioByVal(group, insVal, 0);
              continue;
            }

            // 문37 구인 애로사항 / 채용 계획
            if (bodyText.includes('구인') || bodyText.includes('채용')) {
              const hireVal = (useMeta && meta.M37) ? String(meta.M37) : String(pol.labor_hiringDifficulty || '3');
              selectRadioByVal(group, hireVal, Math.min(group.length - 1, 1));
              continue;
            }

            // 문50~문62 소상공인 지원정책 수혜/이용 경험 (1=있음, 2=없음)
            if ((bodyText.includes('지원사업') || bodyText.includes('지원정책') || bodyText.includes('특례보증')) && group.length === 2) {
              const expVal = (pol.policy_experienceMode === '1' || pol.policy_experienceMode === '2')
                ? pol.policy_experienceMode
                : ((useMeta && meta.M62) ? String(meta.M62) : '2');
              selectRadioByVal(group, expVal, 1);
              continue;
            }

            // 5점 척도 만족도·RADIOSETS 문항 (동일응답 직선체크 경고 방지를 위한 행별 분산 포함)
            if (group.length === 5 && !hasVisibleQ('Q93')) {
              const mode = pol.satisfaction_mode || 'mixed_3_4';
              const isRadioSetsRow = Boolean(ownerTr && (ownerTr.hasAttribute('vkey') || ownerTr.hasAttribute('vKey')));
              let pickIdx = 3;
              if (mode === 'positive_4_5' || mode === 'mostly_5') {
                pickIdx = isRadioSetsRow ? (rowIdx % 2 === 0 ? 3 : 4) : ((Math.random() > 0.45) ? 4 : 3);
              } else if (mode === 'neutral_3' || mode === 'mostly_3') {
                pickIdx = (isRadioSetsRow && rowIdx === 1) ? 3 : 2;
              } else {
                pickIdx = isRadioSetsRow
                  ? (rowIdx === 0 ? 2 : (rowIdx === 1 ? 3 : (Math.random() > 0.5 ? 3 : 2)))
                  : ((Math.random() > 0.5) ? 3 : 2);
              }
              const pick = group[pickIdx] || group[3] || group[0];
              pick.click();
              pick.checked = true;
              if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
              continue;
            }

            // 문93 생성형 AI 사용 일수: 1=사용하지 않음 기본 선택으로 불필요 하위문항(문99) 방지
            if (hasVisibleQ('Q93') && grpQName === 'Q93') {
              selectRadioByVal(group, '1', 0);
              continue;
            }

            // 2지선다(예/아니오, 있음/없음 등) 미매칭 문항은 조건부 하위문항 유발을 막기 위해 부정/없음(2번) 우선 선택
            if (group.length === 2) {
              const secondLbl = getRadioLabel(group[1]);
              const preferSecond = /(아니|없|모름|안\s*함|미가입|해당\s*없|비대상)/.test(secondLbl);
              const pick2 = preferSecond ? group[1] : group[0];
              pick2.click();
              pick2.checked = true;
              if (typeof $ !== 'undefined') $(pick2).prop('checked', true).trigger('change');
              continue;
            }

            // 일반 라디오 기본 안전 선택
            const pick = (group.length >= 3) ? group[1] : group[0];
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
          }
        };

        fillRadioGroupsPass(1);
        await new Promise(r => setTimeout(r, 240));
        fillRadioGroupsPass(2);

        // ------------------------------------------------------------------
        // 체크박스(CHECKBOX) 처리 — [필수 규칙] 문15-3 보증지원여부(O/X) 정책자금 연동 선택가이드
        // ------------------------------------------------------------------
        const checkBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
          .filter(c => c.offsetParent !== null && !c.disabled && !overriddenQNames.has(c.getAttribute('qname') || ''));
        if (checkBoxes.length > 0) {
          const isM15_3 = bodyText.includes('문15-3') ||
            bodyText.includes('사업자금을 조달한 경로') ||
            (bodyText.includes('사업자금') && bodyText.includes('조달한 경로')) ||
            checkBoxes.some(c => {
              const nm = (c.name || c.id || c.getAttribute('qname') || '').toUpperCase();
              return nm.includes('M15-3') || nm.includes('M15_3') || nm === 'Q15_3';
            });

          const setCbState = (cb, wantChecked) => {
            if (!cb || cb.disabled) return;
            if (Boolean(cb.checked) !== Boolean(wantChecked)) {
              cb.click();
            }
            if (Boolean(cb.checked) !== Boolean(wantChecked)) {
              cb.checked = Boolean(wantChecked);
              if (typeof $ !== 'undefined') $(cb).prop('checked', Boolean(wantChecked)).trigger('change');
            }
          };

          if (isM15_3) {
            const getCbLabel = (c) => {
              const forLbl = (c.id && window.CSS && CSS.escape)
                ? document.querySelector(`label[for="${CSS.escape(c.id)}"]`)
                : null;
              const txt = (forLbl?.innerText || c.closest('label, li, tr, .item, .answer-item, div')?.innerText || '').replace(/\s+/g, ' ').trim();
              return txt;
            };

            const cbBank1 = checkBoxes.find(c => getCbLabel(c).includes('시중은행') || String(c.value) === '1') || checkBoxes[0];
            const cbBank2 = checkBoxes.find(c => getCbLabel(c).includes('인터넷은행') || String(c.value) === '2') || checkBoxes[1];
            const cbSecond = checkBoxes.find(c => getCbLabel(c).includes('제2금융권') || String(c.value) === '3') || checkBoxes[2];
            const cbPolicy = checkBoxes.find(c => getCbLabel(c).includes('정책자금') || String(c.value) === '4') || checkBoxes[3];
            const cbPrivate = checkBoxes.find(c => getCbLabel(c).includes('사채') || getCbLabel(c).includes('지인') || String(c.value) === '5') || checkBoxes[4];
            const cbNone = checkBoxes.find(c => getCbLabel(c).includes('자금조달 없음') || getCbLabel(c).includes('조달 없음') || String(c.value) === '6') || checkBoxes[5];
            const cbOther = checkBoxes.find(c => getCbLabel(c).includes('기타') || String(c.value) === '7') || checkBoxes[6];

            const guarVal = guarValGlobal;
            const fundingRule = pol.funding_guaranteeRule || 'excel_sync';
            const whenX = String(pol.funding_whenGuaranteeX || '1');
            const shouldCheckPolicy = (fundingRule === 'force_policy') ||
              ((fundingRule === 'excel_sync' || fundingRule === 'excel_sync_with_bank') && guarVal === 'O');

            if (shouldCheckPolicy) {
              setCbState(cbNone, false);
              setCbState(cbOther, false);
              if (fundingRule === 'excel_sync_with_bank') {
                setCbState(cbBank2, false);
                setCbState(cbSecond, false);
                setCbState(cbPrivate, false);
                setCbState(cbBank1, true);
                setCbState(cbPolicy, true);
              } else {
                setCbState(cbBank1, false);
                setCbState(cbBank2, false);
                setCbState(cbSecond, false);
                setCbState(cbPrivate, false);
                setCbState(cbPolicy, true);
              }
            } else {
              setCbState(cbPolicy, false);
              setCbState(cbOther, false);

              const hasValidNonPolicy = checkBoxes.some(c => c.checked && c !== cbPolicy && c !== cbOther);
              if (!hasValidNonPolicy || !preserveInputs) {
                if (whenX === '6') {
                  setCbState(cbBank1, false);
                  setCbState(cbBank2, false);
                  setCbState(cbSecond, false);
                  setCbState(cbPrivate, false);
                  setCbState(cbNone, true);
                } else {
                  setCbState(cbNone, false);
                  setCbState(cbPrivate, false);
                  const targetAltCb = whenX === '2' ? cbBank2 : (whenX === '3' ? cbSecond : cbBank1);
                  checkBoxes.forEach(c => {
                    if (c !== targetAltCb && c !== cbPolicy) setCbState(c, false);
                  });
                  setCbState(targetAltCb, true);
                }
              }
            }
          } else {
            const nonEtcCbs = checkBoxes.filter(c => {
              const wrap = c.closest('label, li, tr, td, .item, .answer-item');
              if (wrap && wrap.querySelector('input.input-etc, textarea.input-etc')) return false;
              const txt = (wrap?.innerText || '').replace(/\s+/g, ' ').trim();
              return !/^기타(\b|\s|$)/.test(txt);
            });
            const checkedCount = checkBoxes.filter(c => c.checked).length;
            if (checkedCount === 0) {
              const firstCb = nonEtcCbs[0] || checkBoxes[0];
              firstCb.click();
              firstCb.checked = true;
              if (typeof $ !== 'undefined') $(firstCb).prop('checked', true).trigger('change');
            }
          }
        }

        await new Promise(r => setTimeout(r, 150));

        // ------------------------------------------------------------------
        // [규칙 4] 숫자 및 텍스트 인풋 정밀 매핑 (A1~A15, 문8, 문11, 문13, 문15-1, 문16-1, 문17-1, 문19, 문31, 문32, 문34)
        // ------------------------------------------------------------------
        const getTextBeforeInput = (el) => {
          const chunks = [];
          let cur = el.previousSibling;
          while (cur) {
            chunks.unshift((cur.textContent || '').replace(/\s+/g, ' ').trim());
            cur = cur.previousSibling;
          }
          return chunks.filter(Boolean).join(' ');
        };

        const textInputs = Array.from(
          document.querySelectorAll('input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])')
        ).filter(isBoxInput);

        textInputs.forEach((input, inpIdx) => {
          if (overriddenInputs.has(input)) return;
          if (input.classList.contains('input-etc') || input.classList.contains('cell-etc')) {
            const nearChoice = input.closest('li, label, tr, td, .item, .answer-item')
              ?.querySelector('input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled)');
            if (!nearChoice || !nearChoice.checked) return;
          }
          if (preserveInputs && input.value && input.value.trim() !== '') {
            setInputVal(input, input.value.trim());
            return;
          }

          const tag = input.tagName.toLowerCase();
          const guide = (input.getAttribute('data-guide') || input.placeholder || '').toUpperCase();
          const name = (input.name || input.id || input.getAttribute('qname') || '').toUpperCase();
          const dataMin = input.getAttribute('data-min');
          const dataMax = input.getAttribute('data-max');
          const maxLen = input.getAttribute('maxlength');
          const rowText = (input.closest('tr, li, .q-row, .form-group, div')?.innerText || '').replace(/\s+/g, ' ');
          const nextEl = input.parentElement?.tagName?.toLowerCase() === 'span' ? input.parentElement : input;
          const nextUnitTxt = ((input.nextSibling?.textContent || '') + (nextEl.nextSibling?.textContent || '')).replace(/\s+/g, '').trim();
          const prevText = getTextBeforeInput(input) || getTextBeforeInput(nextEl);

          // 1) 우선순위(s-gradeclick) 화면의 부속 기타 입력란 오입력 방지
          if (tag !== 'textarea' && document.querySelectorAll('.s-gradeclick').length > 0) {
            return;
          }

          // 2) 선택되지 않은 라디오/체크박스 보기 내부의 부속 입력란 오입력 방지
          const optContainer = input.closest('li, label, .item, .answer-item, tr');
          if (optContainer) {
            const optChoices = Array.from(optContainer.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
            if (optChoices.length === 1 && !optChoices[0].checked) {
              return;
            }
          }
          if (tag !== 'textarea' && (rowText.includes('기타') || prevText.includes('기타'))) {
            const nearChoice = input.closest('li, label, tr, div')?.querySelector('input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled)');
            if (!nearChoice || !nearChoice.checked) return;
          }

          const isEokUnit = /^억/.test(nextUnitTxt);
          const isManwonUnit = /^만원/.test(nextUnitTxt);
          const hasPrecedingEok = /억\s*$/.test(prevText);

          const isNumericBox = tag === 'input' && (
            input.type === 'number' ||
            input.type === 'tel' ||
            Boolean(dataMin) ||
            Boolean(dataMax) ||
            isEokUnit ||
            isManwonUnit ||
            /^(원|명|시간|시|분|일|회|년|개월|월|평|㎡|%)/.test(nextUnitTxt) ||
            guide.includes('만원') || guide.includes('시간') || guide.includes('명') || guide.includes('평') || guide.includes('숫자') ||
            (Boolean(maxLen) && Number(maxLen) <= 10 && !guide.includes('상호') && !guide.includes('성명') && !guide.includes('품목'))
          );

          const formatMoneyByUnit = (amtManwon) => {
            const safeAmt = Math.max(0, Math.round(Number(amtManwon) || 0));
            if (isEokUnit) return String(Math.floor(safeAmt / 10000));
            if (hasPrecedingEok) return String(safeAmt % 10000);
            return String(safeAmt);
          };

          // 1. 숫자 인풋 분류
          if (isNumericBox) {
            // (1) 문8-1 개점/폐점 시각
            if (guide.includes('개점') || name.includes('OPEN') || guide.includes('시작시각') || prevText.includes('개점') || (rowText.includes('개점') && !prevText.includes('폐점'))) {
              input.value = (useMeta && meta['M8-1']) ? String(meta['M8-1']) : String(pol.operating_openHour || '09');
            } else if (guide.includes('폐점') || name.includes('CLOSE') || guide.includes('종료시각') || prevText.includes('폐점') || rowText.includes('폐점')) {
              input.value = (useMeta && meta['M8-1_1']) ? String(meta['M8-1_1']) : String(pol.operating_closeHour || '20');
            }
            // (2) 문8-2 정기휴무 일수/횟수
            else if ((guide.includes('휴무') || bodyText.includes('정기휴무')) && (guide.includes('일') || guide.includes('회') || /^(일|회)/.test(nextUnitTxt))) {
              input.value = String(pol.operating_closedDays || '1');
            }
            // (3) A6 사업장 면적 (평)
            else if (guide.includes('평') || /^평|^㎡/.test(nextUnitTxt) || bodyText.includes('전용면적') || name.includes('AA6')) {
              input.value = (useMeta && meta.AA6) ? String(meta.AA6) : String(pol.general_defaultAreaPyeong || 30);
            }
            // (4) 연도 감지 (억/만원 금액 행과 절대 혼동하지 않도록 maxLen==='4' 단독 조건 제거)
            else if (
              !isEokUnit && !isManwonUnit && !hasPrecedingEok &&
              !/만원|보증금|월세|임차료|매출액|영업비용|영업이익|부채|권리금|순소득|급여/.test(rowText) &&
              (dataMin === '1900' || dataMin === '1950' || dataMin === '1960' || dataMax === '2026' || dataMax === '2025' ||
               guide.includes('년도') || guide.includes('연도') || name.includes('YEAR') ||
               (/^년/.test(nextUnitTxt) && (bodyText.includes('출생') || bodyText.includes('개업') || bodyText.includes('창업') || bodyText.includes('수혜') || bodyText.includes('지원받'))))
            ) {
              if (bodyText.includes('출생') || bodyText.includes('태어난') || name.includes('AA13')) {
                input.value = (useMeta && meta.AA13) ? String(meta.AA13) : '1972';
              } else if (bodyText.includes('개업') || bodyText.includes('창업') || name.includes('AA9') || name.includes('M19')) {
                input.value = (useMeta && (meta.AA9 || meta.M19_1)) ? String(meta.AA9 || meta.M19_1) : '2018';
              } else {
                input.value = (useMeta && meta.M62_1) ? String(meta.M62_1) : '2024';
              }
            }
            // (5) 월 감지 (A9_1 개업월, 문19_2 창업월)
            else if (!isEokUnit && !isManwonUnit && ((dataMin === '1' && dataMax === '12') || (maxLen === '2' && (guide.includes('월') || /^월/.test(nextUnitTxt) || name.includes('MONTH'))))) {
              input.value = (useMeta && (meta['AA9 _1'] || meta.M19_2)) ? String(parseInt(meta['AA9 _1'] || meta.M19_2, 10) || 5) : '5';
            }
            // (6) 문16-3 임차 계약/거주 기간 (년)
            else if (!isEokUnit && !isManwonUnit && bodyText.includes('임차') && (guide.includes('년') || /^년/.test(nextUnitTxt))) {
              input.value = (useMeta && meta['M16-3']) ? String(meta['M16-3']) : String(pol.lease_contractYears || 5);
            }
            // (7) 문32 주당 근무시간
            else if (guide.includes('시간') || /^시간/.test(nextUnitTxt) || bodyText.includes('근무시간') || dataMax === '168') {
              if (rowText.includes('근로자') || rowText.includes('직원') || inpIdx > 0) {
                input.value = (useMeta && meta.M32_6) ? String(meta.M32_6) : String(pol.labor_staffWeeklyHours || 40);
              } else {
                input.value = (useMeta && meta.M32) ? String(meta.M32) : String(pol.labor_ownerWeeklyHours || 45);
              }
            }
            // (8) 문31 종사자 인원수
            else if (guide.includes('명') || /^명/.test(nextUnitTxt) || guide.includes('인원') || bodyText.includes('종사자')) {
              if (rowText.includes('대표자') || rowText.includes('업주')) {
                input.value = (useMeta && meta.M31_1) ? String(meta.M31_1) : String(pol.employee_owner ?? 1);
              } else if (rowText.includes('가족')) {
                input.value = (useMeta && meta.M31_2 !== undefined) ? String(meta.M31_2) : String(pol.employee_family ?? 0);
              } else if (rowText.includes('상용') || rowText.includes('정규')) {
                input.value = (useMeta && meta.M31_3 !== undefined) ? String(meta.M31_3) : String(pol.employee_regular ?? 1);
              } else if (rowText.includes('임시') || rowText.includes('일용') || rowText.includes('아르바이트')) {
                input.value = (useMeta && meta.M31_4 !== undefined) ? String(meta.M31_4) : String(pol.employee_temp ?? 0);
              } else if (rowText.includes('총') || rowText.includes('합계') || inpIdx === 0) {
                const totEmp = (useMeta && meta.M31)
                  ? Number(meta.M31)
                  : (Number(pol.employee_owner ?? 1) + Number(pol.employee_family ?? 0) + Number(pol.employee_regular ?? 1) + Number(pol.employee_temp ?? 0));
                input.value = String(Math.max(1, totEmp));
              } else {
                input.value = '0';
              }
            }
            // (9) 금액 입력 문항 (억/만원 2칸 분할 및 단일 만원 칸 모두 완벽 대응)
            else if (isEokUnit || isManwonUnit || hasPrecedingEok || guide.includes('만원') || guide.includes('금액') || guide.includes('비용') || guide.includes('매출') || bodyText.includes('만원')) {
              if (bodyText.includes('권리금')) {
                const gwAmt = Number(pickedGoodwillManwon || pol.goodwill_amount || 1500);
                input.value = formatMoneyByUnit(gwAmt);
              } else if (bodyText.includes('부채') || bodyText.includes('대출')) {
                const debtAmt = (useMeta && meta['M15-1']) ? Number(meta['M15-1']) : Number(pol.debt_totalAmount ?? 3000);
                input.value = formatMoneyByUnit(debtAmt);
              } else if (bodyText.includes('순소득') || (bodyText.includes('대표자') && bodyText.includes('소득'))) {
                const baseInc = (useMeta && meta.M13) ? Number(meta.M13) : Number(pol.owner_monthlyIncome ?? 320);
                input.value = formatMoneyByUnit(Math.max(100, Math.round(baseInc * trendMult)));
              } else if (bodyText.includes('급여') || bodyText.includes('임금') || bodyText.includes('인건비')) {
                const wageAmt = Number(pickedWageManwon || pol.labor_avgMonthlyWage || 280);
                input.value = formatMoneyByUnit(wageAmt);
              } else if (bodyText.includes('매출액') || bodyText.includes('영업비용') || bodyText.includes('영업이익')) {
                const baseSales = (useMeta && Number(meta.M11_1) > 0) ? Number(meta.M11_1) : 24000;
                const baseCost = (useMeta && Number(meta.M11_3) > 0) ? Number(meta.M11_3) : 18000;
                const baseProfit = (useMeta && Number(meta.M11_5) > 0) ? Number(meta.M11_5) : Math.max(2000, baseSales - baseCost);
                if (rowText.includes('영업비용') || prevText.includes('영업비용')) {
                  input.value = formatMoneyByUnit(Math.round(baseCost * trendMult));
                } else if (rowText.includes('영업이익') || prevText.includes('영업이익')) {
                  input.value = formatMoneyByUnit(Math.round(baseProfit * trendMult));
                } else {
                  input.value = formatMoneyByUnit(Math.round(baseSales * trendMult));
                }
              } else {
                input.value = formatMoneyByUnit(200);
              }
            }
            // 기타 숫자 기본값
            else {
              input.value = dataMin ? String(Math.max(0, parseInt(dataMin, 10))) : '1';
            }
          }
          // 2. 텍스트 / 주관식 인풋 분류 (A1 상호, A2 사업자번호, A4 주요품목, A11 대표자명, 문22/문67 주관식 의견)
          else {
            if (guide.includes('대표') || guide.includes('성명') || name.includes('CEO') || name.includes('NAME') || name.includes('AA11')) {
              input.value = slot.ceoName || meta.AA11 || '대표자';
            } else if (guide.includes('사업체명') || guide.includes('상호') || name.includes('AA1')) {
              input.value = slot.companyName || meta.AA1 || '사업체';
            } else if (guide.includes('사업자') && guide.includes('번호')) {
              input.value = slot.bizNumber || meta['AA2 _1'] || '';
            } else if (name.includes('AA4') || bodyText.includes('생산활동') || bodyText.includes('원재료')) {
              if (inpIdx === 0) input.value = meta.AA4 || slot.bizCategory || '주요 취급품목';
              else if (inpIdx === 1) input.value = meta['AA4 _1'] || '매장 영업 및 서비스';
              else input.value = meta['AA4 _2'] || '고객 판매 및 서비스 제공';
            } else if (guide.includes('전화') || guide.includes('연락처') || name.includes('PHONE')) {
              input.value = slot.phone || meta['휴대폰'] || '010-5392-7259';
            } else if (tag === 'textarea' || guide.includes('의견') || guide.includes('애로') || guide.includes('건의')) {
              input.value = pol.open_ended_comment || '지속되는 고물가로 인해 원재료비 및 공공요금 부담이 큽니다. 경기신용보증재단 저금리 특례보증 대출 한도 확대와 상환 거치기간 연장, 점포 시설개선 지원이 지속되었으면 합니다.';
            } else {
              input.value = '체계적인 맞춤형 서비스 제공을 통해 고객 만족도를 높이고 있습니다.';
            }
          }

          setInputVal(input, input.value);
        });

        // SELECT 드롭다운 처리
        const selects = Array.from(document.querySelectorAll('select')).filter(s => s.offsetParent !== null && !s.disabled);
        selects.forEach(sel => {
          if ((!sel.value || !preserveInputs) && sel.options.length > 1) {
            sel.selectedIndex = 1;
            if (typeof $ !== 'undefined') $(sel).trigger('change');
          }
        });
      }, {
        slot: slotData,
        pol: effectivePolicy,
        quotaIdx: quotaIndex,
        indKey: industryKey,
        pickedGoodwillManwon,
        pickedWageManwon
      }).catch(err => console.error('[Metrix DOM 주입 오류]:', err.message));

      await sleep(jitter(350, 550));

      // 7. [응답 내역 전수 채록] [다음] 클릭 직전 실제 DOM에 선택/기입된 문항·응답 스냅샷 기록
      const stepSnapshot = await page.evaluate(({ curStep, fallbackTitle }) => {
        const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const qTitleClean = String(fallbackTitle || '').replace(/\s+/g, ' ').trim();

        let qCode = '';
        if (bodyText.includes('사업체 일반현황') && document.querySelectorAll('input:not([type="hidden"])').length >= 10) {
          qCode = 'A1~A15';
        } else {
          const mMatch = qTitleClean.match(/^(문\s*\d+(?:-\d+)*(?:_\d+)?|A\d+(?:-\d+)?)/i) ||
                         bodyText.match(/\b(문\d+(?:-\d+)*(?:_\d+)?)\b/);
          if (mMatch) {
            qCode = mMatch[1].replace(/\s+/g, '');
          } else {
            const qEl = document.querySelector('[question-name], [qname], [data-qname], [id^="BOX_"]');
            const rawQn = qEl ? (qEl.getAttribute('question-name') || qEl.getAttribute('qname') || qEl.getAttribute('data-qname') || qEl.id.replace(/^BOX_/, '')) : '';
            qCode = rawQn || `STEP_${curStep}`;
          }
        }

        const parts = [];
        const getLabelForInput = (el) => {
          if (el.id && window.CSS && CSS.escape) {
            const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (lbl && lbl.innerText.trim()) return lbl.innerText.replace(/\s+/g, ' ').trim();
          }
          const tr = el.closest('tr');
          if (tr && !['radio', 'checkbox'].includes((el.type || '').toLowerCase())) {
            const th = tr.querySelector('th, td:first-child');
            if (th && th !== el.closest('td')) {
              const thTxt = th.innerText.replace(/\s+/g, ' ').trim();
              if (thTxt && thTxt.length <= 60) return thTxt;
            }
          }
          const wrap = el.closest('label, li, td, .item, .answer-item');
          if (wrap) {
            const txt = wrap.innerText.replace(/\s+/g, ' ').trim();
            if (txt && txt.length <= 80) return txt;
          }
          if (tr) {
            const th = tr.querySelector('th, td:first-child');
            if (th && th !== el.closest('td')) {
              const thTxt = th.innerText.replace(/\s+/g, ' ').trim();
              if (thTxt && thTxt.length <= 60) return thTxt;
            }
          }
          return (el.getAttribute('data-guide') || el.placeholder || el.name || '').trim();
        };

        // (1) 우선순위(s-gradeclick) 요약 — 2순위 및 3순위(문67·문68·문88·문89) 전수 지원
        const rank3Match = bodyText.match(/1순위\s*:\s*([^2]+?)\s*2순위\s*:\s*([^3]+?)\s*3순위\s*:\s*([^\n]+?)(?:\s+다음|\s+다시|$)/);
        const rank2Match = bodyText.match(/1순위\s*:\s*([^2]+?)\s*2순위\s*:\s*([^\n]+?)(?:\s+다음|\s+다시|$)/);
        if (rank3Match && (rank3Match[1].trim() || rank3Match[2].trim() || rank3Match[3].trim())) {
          parts.push(`1순위: ${rank3Match[1].trim().slice(0, 45)} / 2순위: ${rank3Match[2].trim().slice(0, 45)} / 3순위: ${rank3Match[3].trim().slice(0, 45)}`);
        } else if (rank2Match && (rank2Match[1].trim() || rank2Match[2].trim())) {
          parts.push(`1순위: ${rank2Match[1].trim().slice(0, 50)} / 2순위: ${rank2Match[2].trim().slice(0, 50)}`);
        } else {
          const activeGrades = Array.from(document.querySelectorAll('.s-gradeclick')).filter(el =>
            el.classList.contains('active') || el.classList.contains('selected') || el.classList.contains('on') || /(1순위|2순위|3순위)/.test(el.innerText || '')
          );
          if (activeGrades.length > 0) {
            parts.push(activeGrades.map(el => `[${el.getAttribute('akey') || ''}] ${(el.innerText || '').replace(/\s+/g, ' ').trim()}`).join(' / '));
          }
        }

        // (2) 선택된 라디오
        const checkedRadios = Array.from(document.querySelectorAll('input[type="radio"]:checked')).filter(r => r.offsetParent !== null);
        if (checkedRadios.length > 0) {
          const rTexts = checkedRadios.map(r => {
            const tr = r.closest('tr');
            const rowHead = tr ? (tr.querySelector('th, td:first-child')?.innerText || '').replace(/\s+/g, ' ').trim() : '';
            const lbl = getLabelForInput(r);
            const valStr = r.value ? `[${r.value}]` : '';
            if (checkedRadios.length > 1 && rowHead && rowHead !== lbl && rowHead.length <= 45) {
              return `${rowHead}: ${valStr}${lbl ? ' ' + lbl : ''}`.trim();
            }
            return `${valStr}${lbl ? ' ' + lbl : ''}`.trim();
          });
          parts.push(rTexts.join(' | '));
        }

        // (3) 선택된 체크박스
        const checkedCbs = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).filter(c => c.offsetParent !== null);
        if (checkedCbs.length > 0) {
          const cbTexts = checkedCbs.map(c => {
            const lbl = getLabelForInput(c);
            const valStr = c.value ? `[${c.value}]` : '';
            return `${valStr}${lbl ? ' ' + lbl : ''}`.trim();
          });
          parts.push(cbTexts.join(', '));
        }

        // (4) 입력된 숫자/텍스트/셀렉트 (type 속성 생략된 <input> 및 type="tel" 전수 포함)
        const filledInputs = Array.from(document.querySelectorAll('input, textarea, select'))
          .filter(el => {
            if (!el || el.offsetParent === null) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'input') {
              const t = (el.type || 'text').toLowerCase();
              if (['hidden', 'radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'image'].includes(t)) return false;
            }
            return String(el.value ?? '').trim() !== '';
          });
        if (filledInputs.length > 0) {
          const inpTexts = filledInputs.slice(0, 28).map(el => {
            const val = el.tagName.toLowerCase() === 'select'
              ? (el.options[el.selectedIndex]?.text || el.value)
              : String(el.value).trim();
            const unitTxt = (el.nextSibling?.textContent || '').replace(/\s+/g, ' ').trim().match(/^(%|억|만원|원|명|시간|시|일|회|년|월|평|㎡)/)?.[1] || '';
            const valWithUnit = unitTxt ? `${val}${unitTxt}` : val;
            const lbl = getLabelForInput(el);
            return (lbl && lbl !== val && lbl !== unitTxt && lbl.length <= 40) ? `${lbl}: ${valWithUnit}` : valWithUnit;
          });
          parts.push(inpTexts.join(' / '));
        }

        return {
          stepIndex: curStep,
          questionCode: qCode,
          questionTitle: qTitleClean.slice(0, 140),
          submittedAnswer: parts.join(' ; ') || '(응답 확인됨)'
        };
      }, { curStep: stepCount, fallbackTitle: qTitle }).catch(err => {
        console.warn(`[MetrixRunner 응답 채록 경고 Step ${stepCount}]: ${err.message}`);
        return null;
      });

      if (stepSnapshot) {
        upsertSubmittedAnswer(stepSnapshot);
        if (stepSnapshot.questionCode === '문15-3' || qTitle.includes('문15-3')) {
          console.log(`📌 [문15-3 검증] 보증지원여부=${slotData.guaranteeSupport || rawMeta['보증지원여부'] || '-'} ➔ 선택값: ${stepSnapshot.submittedAnswer}`);
        }
      }

      onProgress({
        step: `STEP_${stepCount}`,
        stepIndex: stepCount,
        totalSteps: 120,
        message: `✓ [Step ${stepCount}] "${qTitle.slice(0, 34)}" 응답 작성 완료 ➔ [다음] 전진`
      });

      const dialogsBeforeClick = dialogLog.length;
      const oldSignature = screenInfo.signature;

      console.log(`[MetrixRunner Step ${stepCount}] Clicking [다음] button...`);
      const nextClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(b => b.offsetParent !== null);
        const nextBtn = buttons.find(b => {
          const t = (b.innerText || b.value || '').trim();
          return t === '다음' || t.includes('다음') || t === '제출' || t === '완료';
        });
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!nextClicked) {
        const clickFailMsg = `[진행 중단] Step ${stepCount} ("${qTitle}")에서 [다음] 버튼을 클릭하지 못해 스킵 없이 즉시 중단했습니다.`;
        console.error(`🚨 ${clickFailMsg}`);
        return {
          success: false,
          haltedOnBlock: true,
          blockedStep: stepCount,
          blockedQuestion: qTitle,
          alertMessages: dialogLog.map(d => d.message),
          dialogLog,
          error: clickFailMsg,
          capturedSteps,
          submittedAnswers,
          slotData
        };
      }

      await sleep(350);
      if (dialogLog.length === dialogsBeforeClick) {
        await page.waitForFunction(
          ({ prevSig }) => {
            const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
            if (!bodyText || bodyText === 'Loading..' || bodyText.startsWith('Loading..')) return false;
            const qNameEls = Array.from(document.querySelectorAll('[qname], [data-qname]')).filter(el => el.offsetParent !== null);
            const qNameAttr = qNameEls
              .map(el => el.getAttribute('qname') || el.getAttribute('data-qname') || '')
              .filter(Boolean)[0] || '';
            const titleCandidates = Array.from(
              document.querySelectorAll('.q-title, .question-title, .quest-title, .title, h2, h3, .box-question, [id^="BOX_"], [qname], .question-container, .q-item')
            ).filter(el => el.offsetParent !== null);
            let q0 = '';
            for (const el of titleCandidates) {
              const rawLines = (el.innerText || '').split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
              if (rawLines.length > 0) {
                q0 = rawLines[0].slice(0, 160);
                break;
              }
            }
            const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(el => el.offsetParent !== null);
            const curSig = (qNameAttr || q0 || '') + '|' + inputs.length + '|' + bodyText.slice(50, 180);
            return curSig !== prevSig;
          },
          { prevSig: oldSignature },
          { timeout: 6000 }
        ).catch(err => {
          console.warn(`[MetrixRunner Step ${stepCount} 전환 대기 타임아웃]: ${err.message}`);
        });
      }
      await sleep(jitter(350, 650));
      stepCount++;
    }

    const maxStepMsg = `[진행 중단] 최대 단계(${maxSteps})에 도달했으나 최종 검토 화면(98%)에 진입하지 못해 중단했습니다.`;
    console.error(`🚨 ${maxStepMsg}`);
    return {
      success: false,
      haltedOnBlock: true,
      error: maxStepMsg,
      alertMessages: dialogLog.map(d => d.message),
      dialogLog,
      capturedSteps,
      submittedAnswers,
      slotData
    };
  } catch (err) {
    console.error(`🚨 [MetrixRunner 치명적 오류] ${err.message}`, err.stack);
    const errScreenshot = path.join(targetReportDir, 'error_state.png');
    await page.screenshot({ path: errScreenshot, fullPage: true }).catch(e => console.warn('[오류 캡처 경고]:', e.message));

    return {
      success: false,
      error: err.message,
      alertMessages: dialogLog.map(d => d.message),
      dialogLog,
      capturedSteps,
      submittedAnswers,
      slotData
    };
  } finally {
    await browser.close().catch(e => console.warn('[브라우저 종료 경고]:', e.message));
  }
}
