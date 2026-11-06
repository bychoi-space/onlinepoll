import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * 전화번호 문자열(예: '010-7935-2414' 또는 '01079352414')을 [prefix, mid, last]로 분리
 */
export function parsePhoneParts(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)];
  }
  if (digits.length === 10) {
    if (digits.startsWith('02')) {
      return ['02', digits.slice(2, 6), digits.slice(6, 10)];
    }
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
  }
  if (digits.length === 9 && digits.startsWith('02')) {
    return ['02', digits.slice(2, 5), digits.slice(5, 9)];
  }
  return ['010', '7935', '2414'];
}

/**
 * RPS 웹설문 페이지 준비 대기 헬퍼
 * - #QuestionView가 로드되고 (window.isRun === false 이거나 #ErrorMessage/#AlertMessage 팝업이 떴거나 '조사완료' 텍스트가 표시된 경우) 즉시 반환
 */
async function waitForRpsReady(page) {
  await page.waitForFunction(() => {
    const jqActive = (typeof window.$ !== 'undefined' && typeof window.$.active === 'number') ? window.$.active : 0;
    if (jqActive > 0) return false;
    const qv = document.querySelector('#QuestionView');
    const txt = (qv?.innerText || document.body?.innerText || '');
    if (txt.includes('조사완료') && txt.includes('정상적으로 완료')) return true;
    const cv = document.querySelector('#CurrentVariable')?.value || '';
    const err = document.querySelector('#ErrorMessage')?.value || '';
    const alertMsg = document.querySelector('#AlertMessage')?.value || '';
    return qv && qv.innerHTML.trim().length > 80 && cv !== '' && (
      (typeof window.isRun !== 'undefined' && window.isRun === false) ||
      err !== '' ||
      alertMsg !== ''
    );
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(250);
}

/**
 * 현재 RPS 화면 상태 추출
 */
async function extractRpsStep(page) {
  return await page.evaluate(() => {
    const qv = document.querySelector('#QuestionView');
    const cv = document.querySelector('#CurrentVariable')?.value || '';
    const pct = document.querySelector('#progress_num_txt')?.innerText?.trim() || '';
    const err = document.querySelector('#ErrorMessage')?.value || '';
    const alertMsg = document.querySelector('#AlertMessage')?.value || '';
    const text = (qv?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const isCompleted = text.includes('조사완료') && text.includes('정상적으로 완료');
    const q1260Filled = (document.querySelector('#q1260_op9')?.value || '').trim() !== '';

    const inputs = Array.from(qv ? qv.querySelectorAll('input, select, textarea') : [])
      .filter(el => el.type !== 'hidden' && el.type !== 'button')
      .map(el => ({
        tag: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        variable: el.getAttribute('Variable') || el.getAttribute('variable') || '',
        codeLabel: el.getAttribute('CodeLabel') || el.getAttribute('codelabel') || '',
        openDataType: el.getAttribute('opendatatype') || '',
        value: el.value,
        checked: el.checked,
        disabled: el.disabled,
        readOnly: el.readOnly,
        visible: el.offsetParent !== null
      }));

    return { cv, pct, err, alertMsg, text, isCompleted, q1260Filled, inputs };
  });
}

/**
 * 한국리서치 2025년 기준 에너지총조사 (건물 부문) 단일 슬롯 자동화 러너
 * - 핵심 원칙: 기존에 이미 입력되어 있는 항목은 절대 건드리지 않고 그대로 보존 (preserveExistingInputs: true)
 *
 * @param {object} options
 * @param {object} options.slotData - 쿼터 슬롯 객체 (uid, surveyorId, contactName, phone, buildingName, mainUse 등)
 * @param {object} options.policy - 응답 정책 설정
 * @param {string} options.loginId - TAPI 로그인 ID (예: '700275')
 * @param {string} options.loginPw - TAPI 로그인 PW (예: '700275')
 * @param {number} options.quotaIndex - 순번
 * @param {boolean} options.pilotMode - 파일럿 모드 여부
 * @param {boolean} options.safetyGuard - 최종 완료 직전(91% q90020_r1) 정지 여부 (기본: false)
 * @param {string} options.reportDir - 스크린샷 저장 폴더
 * @param {function} options.onProgress - 진행 콜백
 */
export async function runHrcEnergySurvey(options = {}) {
  const {
    slotData = {},
    policy = {},
    loginId: rawLoginId,
    loginPw: rawLoginPw,
    quotaIndex = 1,
    safetyGuard = false,
    reportDir = null,
    onProgress = () => {}
  } = options;

  const uid = String(slotData.uid || slotData.UID || '').trim();
  if (!uid) {
    throw new Error('실행할 건물 쿼터의 UID가 없습니다.');
  }

  const loginId = String(rawLoginId || slotData.surveyorId || slotData.surveyorAccount || '700275').replace(/[^0-9]/g, '') || '700275';
  const loginPw = String(rawLoginPw || loginId).trim();
  const preserveExisting = (policy.preserveExistingInputs !== false);

  if (reportDir && !fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const capturedSteps = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 920 }
  });
  const page = await context.newPage();

  // 브라우저 alert/confirm 자동 수락
  page.on('dialog', async dialog => {
    try { await dialog.accept(); } catch (_) {}
  });

  try {
    const fallbackName = String(slotData.contactName || slotData.ceoName || '관리소장').trim() || '관리소장';
    const [p1, p2, p3] = parsePhoneParts(slotData.phone || '010-7935-2414');
    let basicInfoState = {
      contactName: fallbackName,
      tel1: p1,
      tel2: p2,
      tel3: p3,
      buildingName: slotData.buildingName || '',
      roadAddress: slotData.roadAddress || ''
    };
    let rpsUrl = String(options.directRpsUrl || slotData.rpsUrl || '').trim();

    if (rpsUrl && rpsUrl.includes('rpssurvey.hrcglobal.com')) {
      onProgress({
        step: 'LOGIN',
        stepIndex: 1,
        totalSteps: 7,
        message: `[UID ${uid}] RPS 설문 URL 직접 접속 중...`
      });
      await page.goto(rpsUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await waitForRpsReady(page);
    } else {
      // 1. TAPI 로그인
      onProgress({
        step: 'LOGIN',
        stepIndex: 1,
        totalSteps: 7,
        message: `[UID ${uid}] TAPI 로그인 (${loginId}) 및 [기본정보] 페이지 접속 중...`
      });

      await page.goto('https://tapi.hrcglobal.com/Home/Login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('input[type="text"]', loginId);
      await page.fill('input[type="password"]', loginPw);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('button[type="submit"], input[type="submit"]')
      ]);

      // 2. 조사 선택 (2026-89-0342C)
      await page.waitForSelector('a[onclick*="2026-89-0342C"]', { timeout: 15000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('a[onclick*="2026-89-0342C"]')
      ]);

      // 3. [기본정보] 페이지 진입 (AnswerInfo4)
      const answerInfoUrl = `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uid}&page=1`;
      await page.goto(answerInfoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#survey', { timeout: 15000 });

      // [기본정보] 기존 입력값 보존하며 빈칸만 채우기 (문자/메일 발송 버튼 절대 클릭 금지!)
      basicInfoState = await page.evaluate(({ fallbackName, p1, p2, p3, preserveExisting }) => {
        function fillIfEmpty(sel, val) {
          const el = document.querySelector(sel);
          if (!el) return '';
          const cur = (el.value || '').trim();
          if (preserveExisting && cur !== '') {
            return cur;
          }
          if (cur === '') {
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return el.value;
        }

        const finalName = fillIfEmpty('#contact1Name', fallbackName);
        const finalP1 = fillIfEmpty('#contact1TelPrefix', p1);
        const finalP2 = fillIfEmpty('#contact1Tel2', p2);
        const finalP3 = fillIfEmpty('#contact1Tel3', p3);

        // 테이블에 표시된 건물명/주소/주용도 추출
        const bodyText = document.body.innerText || '';
        let parsedBuildingName = '';
        let parsedRoadAddr = '';
        const cells = Array.from(document.querySelectorAll('th, td'));
        for (let i = 0; i < cells.length - 1; i++) {
          const label = (cells[i].innerText || '').trim();
          if (label === '건물명') {
            parsedBuildingName = (cells[i + 1]?.innerText || '').trim();
          } else if (label === '도로명') {
            parsedRoadAddr = (cells[i + 1]?.innerText || '').trim();
          }
        }
        return {
          contactName: finalName || fallbackName,
          tel1: finalP1 || p1,
          tel2: finalP2 || p2,
          tel3: finalP3 || p3,
          buildingName: parsedBuildingName,
          roadAddress: parsedRoadAddr,
          bodySnippet: bodyText.slice(0, 600)
        };
      }, { fallbackName, p1, p2, p3, preserveExisting });

      if (!slotData.buildingName && basicInfoState.buildingName) {
        slotData.buildingName = basicInfoState.buildingName;
      }
      if (!slotData.roadAddress && basicInfoState.roadAddress) {
        slotData.roadAddress = basicInfoState.roadAddress;
      }

      logger.info(`[HRC 에너지총조사] UID=${uid} [기본정보] 확인 완료 (건물명: ${slotData.buildingName || '-'}, 응답자: ${basicInfoState.contactName}, 연락처: ${basicInfoState.tel1}-${basicInfoState.tel2}-${basicInfoState.tel3})`);

      // 4. [조사하기](#survey) 클릭하여 RPS 설문 화면으로 이동
      await Promise.all([
        page.waitForURL(u => u.toString().includes('rpssurvey.hrcglobal.com'), { timeout: 25000 }),
        page.click('#survey')
      ]);
      await waitForRpsReady(page);
      rpsUrl = page.url();
    }

    logger.info(`[HRC 에너지총조사] UID=${uid} RPS 설문 진입: ${rpsUrl}`);

    // 5. RPS 설문 단계별 순차 진행 (기입력 보존 원칙 적용)
    let trackedStoreCount = String(policy.storeCount || '10');
    const stepTrace = [];

    for (let stepIdx = 0; stepIdx < 160; stepIdx++) {
      const step = await extractRpsStep(page);

      if (step.isCompleted) {
        if (reportDir) {
          const fileName = `step_COMPLETE_${Date.now()}.png`;
          await page.screenshot({ path: path.join(reportDir, fileName), fullPage: true }).catch(() => {});
          capturedSteps.push({
            step: 'COMPLETE',
            stepIndex: capturedSteps.length + 1,
            title: '100% 조사완료',
            file: fileName,
            url: `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`
          });
        }
        onProgress({
          step: 'COMPLETE',
          stepIndex: 7,
          totalSteps: 7,
          progress: 100,
          message: `[UID ${uid}] 100% 조사완료 화면 도달!`
        });
        return {
          success: true,
          status: 'completed',
          uid,
          rpsUrl,
          basicInfoState,
          stepTrace,
          capturedSteps
        };
      }

      const activeInputs = step.inputs.filter(inp => {
        if (inp.disabled || inp.readOnly || inp.id === 'keyword') return false;
        if (inp.type === 'radio' || inp.type === 'checkbox') return true;
        return inp.visible;
      });
      // SELECT 태그(이메일 도메인 기본값 '1' 등)는 기입력 판정에서 제외
      // 다중 열/행 문항(예: q3800_1~4, q1600_1~2)의 경우 모든 variable 그룹이 응답되어 있어야 완전 기입력으로 판정
      const getGroupKey = (inp) => {
        const v = String(inp.variable || '');
        const valSuffix = `_${inp.value}`;
        if (inp.type === 'checkbox' && inp.value && v.endsWith(valSuffix)) {
          return v.slice(0, -valSuffix.length);
        }
        return v;
      };
      const textNumberInputs = activeInputs.filter(inp => inp.type !== 'radio' && inp.type !== 'checkbox' && inp.tag !== 'SELECT' && !String(inp.id).includes('op97') && !String(inp.id).includes('op91'));
      // 수치 입력창 옆에 붙는 '-8:모름', '-9:응답거절' 보조 체크박스는 수치 입력창이 함께 있을 경우 일반 객관식 그룹 판정에서 제외
      const checkRadioInputs = activeInputs.filter(inp => {
        if ((inp.type !== 'radio' && inp.type !== 'checkbox') || !inp.variable) return false;
        if (textNumberInputs.length > 0 && (String(inp.value).startsWith('-8') || String(inp.value).startsWith('-9'))) {
          return false;
        }
        return true;
      });
      const checkRadioVarGroups = Array.from(new Set(checkRadioInputs.map(inp => getGroupKey(inp))));

      const isMixedNumericComplete = () => {
        if (step.cv === 'q1500') {
          return ['1', '2', '3'].every(k => {
            const opVal = (step.inputs.find(i => i.variable === `q1500_op${k}`)?.value || '').trim();
            const dkChecked = step.inputs.some(i => i.variable === `q1500_${k}` && i.checked);
            return (opVal !== '' && opVal !== '0') || dkChecked;
          });
        }
        if (step.cv === 'q1460') {
          const op1Val = (step.inputs.find(i => i.variable === 'q1460_op1')?.value || '').trim();
          const op2Val = (step.inputs.find(i => i.variable === 'q1460_op2')?.value || '').trim();
          const dk1 = step.inputs.some(i => i.variable === 'q1460_1' && i.checked);
          const dk2 = step.inputs.some(i => i.variable === 'q1460_2' && i.checked);
          return ((op1Val !== '' && op1Val !== '0') || dk1) && (op2Val !== '' || dk2);
        }
        if (step.cv === 'q1650') {
          const op1Val = (step.inputs.find(i => i.variable === 'q1650_op1')?.value || '').trim();
          const op2Val = (step.inputs.find(i => i.variable === 'q1650_op2')?.value || '').trim();
          const dk1 = step.inputs.some(i => i.variable === 'q1650_1' && i.checked);
          const dk2 = step.inputs.some(i => i.variable === 'q1650_2' && i.checked);
          return ((op1Val !== '' && op1Val !== '0') || dk1) && ((op2Val !== '' && op2Val !== '0') || dk2);
        }
        return textNumberInputs.length > 0 && textNumberInputs.every(inp => inp.value !== '' && inp.value !== null);
      };

      const hasExistingAnswer = preserveExisting && (
        step.cv === 'q1260'
          ? step.q1260Filled
          : (
              checkRadioVarGroups.length > 0
                ? checkRadioVarGroups.every(g => checkRadioInputs.some(inp => getGroupKey(inp) === g && inp.checked))
                : isMixedNumericComplete()
            )
      );

      const pctNum = parseInt(String(step.pct).replace(/[^0-9]/g, ''), 10) || 0;
      onProgress({
        step: step.cv || `STEP_${stepIdx}`,
        stepIndex: Math.min(6, Math.max(2, Math.ceil((pctNum / 100) * 6))),
        totalSteps: 7,
        progress: pctNum,
        message: `[UID ${uid}] (${step.pct || '진행중'}) 문항 ${step.cv} 처리 중...`
      });

      if (step.cv === 'q2250') {
        const existingStoreVal = (step.inputs.find(i => i.variable === 'q2250_op1')?.value || '').replace(/[^0-9]/g, '');
        if (existingStoreVal) trackedStoreCount = existingStoreVal;
      }

      let actionDesc = 'none';
      if (step.cv !== 'q1260' && (activeInputs.length === 0 || hasExistingAnswer)) {
        actionDesc = activeInputs.length === 0 ? 'info_screen' : 'preserve_existing_input';
      } else if (step.cv === 'q1260' && hasExistingAnswer) {
        actionDesc = 'preserve_existing_input (q1260)';
      } else {
        actionDesc = await page.evaluate(async ({ cv, text, slotData, basicInfoState, policy, preserveExisting, trackedStoreCount }) => {
          function clickEl(el) {
            if (!el) return false;
            if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) {
              el.click();
              return true;
            }
            return false;
          }

          function setVal(el, val, allowEnable = false) {
            if (!el || el.readOnly) return false;
            if (el.disabled) {
              if (allowEnable) el.disabled = false;
              else return false;
            }
            if (preserveExisting && (el.value || '').trim() !== '') {
              return false; // 기입력 값 절대 보존
            }
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: '0', code: 'Digit0', keyCode: 48, which: 48, bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }

          // --- [SQ 파트] ---
          if (cv === 'q1000') {
            clickEl(document.querySelector('input[variable="q1000"][value="1"], #q1000_1'));
            return 'q1000: 1(조사원)';
          }
          if (cv === 'q1260') {
            const infoTxt = document.querySelector('.info_txt')?.innerText || '';
            const roadMatch = infoTxt.match(/도로명\s*주소\s*:\s*([^\n\r]+)/);
            const jibunMatch = infoTxt.match(/지번\s*주소\s*:\s*([^\n\r]+)/);
            const roadAddr = (roadMatch ? roadMatch[1].trim() : (slotData.roadAddress || '')).trim();
            const jibunAddr = (jibunMatch ? jibunMatch[1].trim() : '').trim();

            if (document.formAPIDiv && typeof window.searchDivButton === 'function' && (roadAddr || jibunAddr)) {
              document.formAPIDiv.keyword.value = roadAddr || jibunAddr;
              window.searchDivButton();
              for (let w = 0; w < 12; w++) {
                await new Promise(r => setTimeout(r, 250));
                const firstLink = document.querySelector('#listDiv a');
                if (firstLink) {
                  const href = firstLink.getAttribute('href') || '';
                  if (href.startsWith('javascript:')) {
                    eval(href.replace(/^javascript:/i, ''));
                  } else {
                    firstLink.click();
                  }
                  break;
                }
              }
            }
            if (!document.querySelector('#q1260_op9')?.value && typeof window.openApiDivCallBack === 'function') {
              window.openApiDivCallBack(
                roadAddr || jibunAddr,
                roadAddr || jibunAddr,
                '',
                '',
                jibunAddr || roadAddr,
                '01682',
                '1135010500',
                '',
                '',
                '',
                slotData.sido || '서울특별시',
                slotData.sigungu || '노원구',
                ''
              );
            }
            return `q1260: 주소검색 완료 (${document.querySelector('#q1260_op9')?.value || roadAddr})`;
          }
          if (cv === 'q1300') {
            setVal(document.querySelector('input[variable="q1300_op1"], #OpenList_q1300_op1_'), slotData.buildingName || slotData.companyName || '관리건물');
            return 'q1300: 건물명칭 입력';
          }
          if (cv === 'q1350') {
            const infoTxt = document.querySelector('.info_txt')?.innerText || text;
            const useMatch = infoTxt.match(/주용도\s*:\s*([^\n\r]+)/);
            const targetUse = (useMatch ? useMatch[1].trim() : (slotData.mainUse || slotData.mainUsage || '')).trim();
            const radios = Array.from(document.querySelectorAll('input[variable="q1350"]'));
            let matchedRadio = radios.find(r => {
              const lbl = (r.closest('tr')?.innerText || r.closest('label')?.innerText || r.parentElement?.innerText || '').trim();
              return targetUse && lbl.includes(targetUse);
            });
            if (!matchedRadio) {
              matchedRadio = radios[0];
            }
            clickEl(matchedRadio);
            return `q1350: 주용도 선택 (${matchedRadio?.value || '1'} - ${targetUse || '기본'})`;
          }
          if (cv === 'q1400') {
            const radios = Array.from(document.querySelectorAll('input[variable="q1400"]'));
            const noneRadio = radios.find(r => {
              const lbl = (r.closest('tr')?.innerText || r.closest('label')?.innerText || r.parentElement?.innerText || '').trim();
              return r.value === '77' || r.value === '99' || lbl.includes('없음');
            }) || radios[radios.length - 1];
            clickEl(noneRadio);
            return `q1400: 부용도 없음 (${noneRadio?.value || '77'})`;
          }

          // --- [A. 건물 현황 파트] ---
          if (cv === 'q1450') {
            clickEl(document.querySelector('input[variable="q1450"][value="1"], #q1450_1'));
            return 'q1450: 1(주건물)';
          }
          if (cv === 'q1460') {
            const op1 = document.querySelector('input[variable="q1460_op1"]');
            const op2 = document.querySelector('input[variable="q1460_op2"]');
            const dk1 = document.querySelector('input[variable="q1460_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1460_2"]:checked');
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              op1.value = '';
              setVal(op1, '5');
            }
            if (op2 && !dk2 && op2.value.trim() === '') {
              setVal(op2, '1');
            }
            return `q1460: 층수 확인 (지상=${op1?.value}, 지하=${op2?.value})`;
          }
          if (cv === 'q1470') {
            setVal(document.querySelector('input[variable="q1470_op1"]'), policy.ceilingHeightM || '2.8');
            return 'q1470: 천장고 2.8m';
          }
          if (cv === 'q1500') {
            const op1 = document.querySelector('input[variable="q1500_op1"]');
            const op2 = document.querySelector('input[variable="q1500_op2"]');
            const op3 = document.querySelector('input[variable="q1500_op3"]');
            const dk1 = document.querySelector('input[variable="q1500_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1500_2"]:checked');
            const dk3 = document.querySelector('input[variable="q1500_3"]:checked');
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              const btn1 = document.querySelector('#q1500_1_1, input[variable="q1500_1"][value^="-8"]');
              if (btn1) clickEl(btn1);
              else { op1.value = ''; setVal(op1, '500'); }
            }
            if (op2 && !dk2 && (!op2.value || op2.value.trim() === '0')) {
              const btn2 = document.querySelector('#q1500_2_1, input[variable="q1500_2"][value^="-8"]');
              if (btn2) clickEl(btn2);
              else { op2.value = ''; setVal(op2, '300'); }
            }
            if (op3 && !dk3 && (!op3.value || op3.value.trim() === '0')) {
              op3.value = '';
              setVal(op3, '1500');
            }
            return `q1500: 면적 확인 (대지=${op1?.value || '모름'}, 건축=${op2?.value || '모름'}, 연면적=${op3?.value})`;
          }
          if (cv === 'q1550') {
            const code = policy.hvacAreaRatioCode || '7';
            clickEl(document.querySelector(`input[variable="q1550"][value="${code}"], #q1550_${code}`));
            return `q1550: 냉난방 면적 비율 ${code}`;
          }
          if (cv === 'q1600') {
            const winCode = policy.windowRatioCode || '4';
            const doorCode = policy.entranceDoorCode || '3';
            clickEl(document.querySelector(`input[variable="q1600_1"][value="${winCode}"], #q1600_1_${winCode}`));
            clickEl(document.querySelector(`input[variable="q1600_2"][value="${doorCode}"], #q1600_2_${doorCode}`));
            return `q1600: 창면적비 ${winCode}, 문형태 ${doorCode}`;
          }
          if (cv === 'q1650') {
            const op1 = document.querySelector('input[variable="q1650_op1"]');
            const op2 = document.querySelector('input[variable="q1650_op2"]');
            const dk1 = document.querySelector('input[variable="q1650_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1650_2"]:checked');
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              const btn1 = document.querySelector('#q1650_1_1, input[variable="q1650_1"][value^="-8"]');
              if (btn1) clickEl(btn1);
              else { op1.value = ''; setVal(op1, '2005'); }
            }
            if (op2 && !dk2 && (!op2.value || op2.value.trim() === '0')) {
              const btn2 = document.querySelector('#q1650_2_1, input[variable="q1650_2"][value^="-8"]');
              if (btn2) clickEl(btn2);
              else { op2.value = ''; setVal(op2, '6'); }
            }
            return `q1650: 준공연월 확인 (연도=${op1?.value || '모름'}, 월=${op2?.value || '모름'})`;
          }
          if (cv === 'q1700') {
            const m = text.match(/승강기수\s*:\s*(\d+)/);
            const elevCount = m ? parseInt(m[1], 10) : 0;
            if (elevCount > 0) {
              clickEl(document.querySelector('input[variable="q1700"][value="2"], #q1700_2'));
              setVal(document.querySelector('input[variable="q1700_op2"], #OpenList_q1700_op2_'), String(elevCount), true);
              return `q1700: 승강기 ${elevCount}대`;
            } else {
              clickEl(document.querySelector('input[variable="q1700"][value="1"], #q1700_1'));
              return 'q1700: 승강기 없음(1)';
            }
          }
          if (cv === 'q1750') {
            clickEl(document.querySelector('input[variable="q1750"][value="1"], #q1750_1'));
            return 'q1750: 에스컬레이터 없음(1)';
          }
          if (cv === 'q1800') {
            clickEl(document.querySelector('input[variable="q1800"][value="2"], #q1800_2'));
            return 'q1800: 12~14인승(2)';
          }
          if (cv === 'q1850') {
            clickEl(document.querySelector('input[variable="q1850"][value="2"], #q1850_2'));
            return 'q1850: 동력회수장치 아니요(2)';
          }
          if (cv === 'q1900') {
            clickEl(document.querySelector('input[variable="q1900"][value="4"], #q1900_4'));
            return 'q1900: 개보수 안함(4)';
          }
          if (cv === 'q2250') {
            setVal(document.querySelector('input[variable="q2250_op1"], #OpenList_q2250_op1_'), trackedStoreCount);
            return `q2250: 점포 총 개수 ${trackedStoreCount}`;
          }
          if (cv === 'q2300') {
            clickEl(document.querySelector('input[variable="q2300"][value="1"], #q2300_1'));
            return 'q2300: 점포 개수로 응답(1)';
          }
          if (cv === 'q2350') {
            setVal(document.querySelector('input[variable="q2350_op1"]'), '0');
            setVal(document.querySelector('input[variable="q2350_op2"]'), trackedStoreCount);
            setVal(document.querySelector('input[variable="q2350_op3"]'), '0');
            return `q2350: 세입자 운영 점포수(${trackedStoreCount}) 입력`;
          }
          if (cv === 'q2450') {
            clickEl(document.querySelector('input[variable="q2450"][value="3"], #q2450_3') || document.querySelector('input[variable="q2450"][value="1"], #q2450_1'));
            return 'q2450: 에너지 관리 주체 선택';
          }
          if (cv === 'q2500') {
            setVal(document.querySelector('input[variable="q2500_op1"]'), policy.workerCount || '20');
            setVal(document.querySelector('input[variable="q2500_op2"]'), policy.visitorCount || '50');
            return 'q2500: 상근근로자 20, 내방객 50';
          }
          if (cv === 'q2550') {
            clickEl(document.querySelector('input[variable="q2550"][value="77"], #q2550_77'));
            return 'q2550: 77(해당사항 없음)';
          }
          if (cv === 'q2900') {
            clickEl(document.querySelector('input[variable="q2900"][value="77"], #q2900_77') || document.querySelector('input[variable="q2900"][value="1"], #q2900_1'));
            return 'q2900: 입점시설 선택';
          }
          if (cv === 'q2950') {
            clickEl(document.querySelector('input[variable="q2950"][value="2"], #q2950_2') || document.querySelector('input[variable="q2950"][value="1"], #q2950_1'));
            return 'q2950: 선택';
          }
          if (cv === 'q3050') {
            clickEl(document.querySelector('input[variable="q3050"][value="-8"], #q3050_-8'));
            return 'q3050: 모름(-8)';
          }
          if (cv === 'q3450') {
            clickEl(document.querySelector('input[variable="q3450"][value="2"], #q3450_2'));
            return 'q3450: 클라우드 이용안함(2)';
          }
          if (cv === 'q3550') {
            clickEl(document.querySelector('input[variable="q3550"][value="3"], #q3550_3'));
            return 'q3550: 개별방식 이용(3)';
          }
          if (cv === 'q3600') {
            clickEl(document.querySelector('input[variable="q3600"][value="3"], #q3600_3'));
            return 'q3600: 통제하지 않음(3)';
          }
          if (cv === 'q3700') {
            setVal(document.querySelector('input[variable="q3700_op1"]'), policy.summerTempC || '24');
            setVal(document.querySelector('input[variable="q3700_op2"]'), policy.winterTempC || '22');
            return 'q3700: 여름 24도, 겨울 22도';
          }
          if (cv === 'q3750') {
            ['6', '7', '8', '9'].forEach(m => clickEl(document.querySelector(`input[variable="q3750_1"][value="${m}"], #q3750_1_${m}`)));
            ['1', '2', '3', '11', '12'].forEach(m => clickEl(document.querySelector(`input[variable="q3750_2"][value="${m}"], #q3750_2_${m}`)));
            return 'q3750: 냉방(6~9월), 난방(1~3,11~12월)';
          }
          if (cv === 'q3800') {
            for (const col of ['1', '2', '3', '4']) {
              const colEls = document.querySelectorAll(`input[variable="q3800_${col}"]`);
              if (colEls.length === 0) continue;
              const alreadyChecked = document.querySelector(`input[variable="q3800_${col}"]:checked`);
              if (alreadyChecked) continue;
              const preset = document.querySelector(`input[variable="q3800_${col}"][value="25"], input[variable="q3800_${col}"][codelabel="25"]`);
              if (preset) {
                clickEl(preset);
              } else {
                for (let h = 9; h <= 18; h++) {
                  clickEl(document.querySelector(`input[variable="q3800_${col}"][value="${h}"]`));
                }
              }
            }
            return 'q3800: 공조 주중/주말(1~4열) 9~18시';
          }
          if (cv === 'q3900') {
            setVal(document.querySelector('input[variable="q3900_op1"]'), policy.weekdayDays || '5');
            setVal(document.querySelector('input[variable="q3900_op2"]'), policy.weekendDays || '2');
            return 'q3900: 주중 5일, 주말 2일';
          }
          if (cv === 'q3950') {
            for (const col of ['1', '2', '3', '4']) {
              const colEls = document.querySelectorAll(`input[variable="q3950_${col}"]`);
              if (colEls.length === 0) continue;
              const alreadyChecked = document.querySelector(`input[variable="q3950_${col}"]:checked`);
              if (alreadyChecked) continue;
              const preset = document.querySelector(`input[variable="q3950_${col}"][value="25"], input[variable="q3950_${col}"][codelabel="25"]`);
              if (preset) {
                clickEl(preset);
              } else {
                for (let h = 9; h <= 18; h++) {
                  clickEl(document.querySelector(`#q3950_${col}_${h}, input[variable="q3950_${col}"][value="${h}"]`));
                }
              }
            }
            return 'q3950: 건물 운영시간 9~18시';
          }

          // --- [B. 에너지 설비 현황 파트] ---
          if (cv === 'q4000') {
            clickEl(document.querySelector('#q4000_4, input[variable="q4000"][value="4"]'));
            return 'q4000: 시스템 냉온풍기 EHP(4)';
          }
          if (cv.startsWith('q4200_r')) {
            clickEl(document.querySelector(`#${cv}_4, input[variable="${cv}"][value="4"]`) || document.querySelector(`#${cv}_1, input[variable="${cv}"][value="1"]`));
            return `${cv}: 단위 선택(4:kW)`;
          }
          if (cv.startsWith('q4250_r')) {
            setVal(document.querySelector(`#OpenList_${cv}_op1_, input[variable="${cv}_op1"]`), policy.ehpCapacityKw || '150');
            return `${cv}: 용량 150`;
          }
          if (cv.startsWith('q4300_r')) {
            clickEl(document.querySelector(`#${cv}_31, input[variable="${cv}_31"], input[variable="${cv}"][value="31"]`) || document.querySelector(`#QuestionView input[type="checkbox"], #QuestionView input[type="radio"]`));
            return `${cv}: 에너지원 구입전기(31)`;
          }
          if (cv.startsWith('q4350_r')) {
            clickEl(document.querySelector(`#${cv}_2, input[variable="${cv}_2"], input[variable="${cv}"][value="2"]`));
            return `${cv}: 아니요(2)`;
          }
          if (cv === 'q4500') {
            clickEl(document.querySelector('#q4500_77, input[variable="q4500"][value="77"]'));
            return 'q4500: 77(해당사항 없음)';
          }
          if (cv === 'q4700') {
            document.querySelectorAll('#QuestionView input[type="checkbox"][value="5"]').forEach(el => clickEl(el));
            return 'q4700: 2028년까지 설치계획 없음(5)';
          }

          // --- [C. 에너지 사용기기 및 효율개선사업 파트] ---
          if (cv === 'q7300') {
            clickEl(document.querySelector('#q7300_1, input[variable="q7300"][value="1"]'));
            return 'q7300: 지상(1)';
          }
          if (cv === 'q7350') {
            setVal(document.querySelector('input[variable="q7350_op1"], #OpenList_q7350_op1_'), '1');
            return 'q7350: 지상 1층';
          }
          if (cv === 'q7450') {
            clickEl(document.querySelector('#q7450_2, input[variable="q7450"][value="2"]'));
            setVal(document.querySelector('input[variable="q7450_op2"], #OpenList_q7450_op2_'), '80', true);
            return 'q7450: 비율 80%';
          }
          if (cv === 'q7460') {
            setVal(document.querySelector('#OpenList_q7460_op1_, input[variable="q7460_op1"]'), '0');
            setVal(document.querySelector('#OpenList_q7460_op2_, input[variable="q7460_op2"]'), '50');
            setVal(document.querySelector('#OpenList_q7460_op3_, input[variable="q7460_op3"]'), '0');
            return 'q7460: 형광등 0, LED 50, 할로겐 0';
          }
          if (cv === 'q7500') {
            clickEl(document.querySelector('#q7500_2, input[variable="q7500"][value="2"]'));
            return 'q7500: 스마트LED 아니요(2)';
          }
          if (cv === 'q7600') {
            clickEl(document.querySelector('#q7600_2, input[variable="q7600"][value="2"]'));
            return 'q7600: 공용공간 LED등(2)';
          }
          if (cv === 'q7650') {
            clickEl(document.querySelector('#q7650_2, input[variable="q7650"][value="2"]'));
            return 'q7650: 공용공간 스마트LED 아니요(2)';
          }
          if (cv === 'q7750') {
            clickEl(document.querySelector('#q7750_9, input[variable="q7750"][value="9"]'));
            return 'q7750: 부조명 없음(9)';
          }
          if (cv === 'q7900') {
            clickEl(document.querySelector('#q7900_98, input[variable="q7900"][value="98"]'));
            return 'q7900: 에너지다소비기기 모름(98)';
          }
          if (cv === 'q7950') {
            clickEl(document.querySelector('#q7950_77, input[variable="q7950"][value="77"]'));
            return 'q7950: 절약설비 없음(77)';
          }
          if (cv === 'q8000') {
            for (let r = 1; r <= 7; r++) {
              clickEl(document.querySelector(`#q8000_${r}_1, input[variable="q8000_${r}"][value="1"]`));
            }
            return 'q8000: 정부 효율개선사업 전혀 모른다(1)';
          }
          if (cv === 'q8050') {
            clickEl(document.querySelector('#q8050_9, input[variable="q8050"][value="9"]'));
            return 'q8050: 참여한 사업 없음(9)';
          }

          // --- [D. 2025년도 에너지소비량 파트] ---
          if (cv === 'q6000') {
            clickEl(document.querySelector('#q6000_1, input[variable="q6000"][value="1"]'));
            return 'q6000: 전력량계 1개(1)';
          }
          if (cv.startsWith('q6100_r')) {
            clickEl(document.querySelector(`#${cv}_1_1, input[variable="${cv}_1"][value="1"]`));
            setVal(document.querySelector(`#OpenList_${cv}_2_op1_, input[variable="${cv}_2_op1"]`), policy.contractPowerKw || '300');
            clickEl(document.querySelector(`#${cv}_3_2, input[variable="${cv}_3"][value="2"]`));
            return `${cv}: 한전일반(1), 계약전력 300kW, 회상응답(2)`;
          }
          if (cv.startsWith('q6150_r')) {
            clickEl(document.querySelector(`#${cv}_1, input[variable="${cv}"][value="1"]`));
            return `${cv}: 단위 kWh(1)`;
          }
          if (cv.startsWith('q6200_r')) {
            const monthly = Array.isArray(policy.monthlyElecKwh) && policy.monthlyElecKwh.length === 12
              ? policy.monthlyElecKwh
              : [24000, 22000, 18000, 15000, 15000, 19000, 25000, 26000, 19000, 15000, 18000, 23000];
            monthly.forEach((v, i) => {
              setVal(document.querySelector(`#OpenList_${cv}_op${i + 1}_, input[variable="${cv}_op${i + 1}"]`), v);
            });
            return `${cv}: 1~12월 전력소비량 입력`;
          }
          if (cv === 'q6250') {
            clickEl(document.querySelector('#q6250_1, input[variable="q6250"][value="1"]'));
            return 'q6250: 구성비 응답(1)';
          }
          if (cv === 'q6300') {
            const ratios = {
              q6300_op1: '30',
              q6300_op2: '30',
              q6300_op3: '0',
              q6300_op4: '0',
              q6300_op5: '15',
              q6300_op6: '20',
              q6300_op7: '5'
            };
            for (const [k, v] of Object.entries(ratios)) {
              setVal(document.querySelector(`#OpenList_${k}_, input[variable="${k}"]`), v);
            }
            return 'q6300: 용도별 전기 구성비 100% 입력';
          }
          if (cv === 'q6350' || cv === 'q6800' || cv === 'q7000') {
            clickEl(document.querySelector(`#${cv}_2, input[variable="${cv}"][value="2"]`));
            return `${cv}: 사용하지 않는다/아니요(2)`;
          }

          // --- [E. 응답자 일반사항 파트] ---
          if (cv === 'q90000') {
            clickEl(document.querySelector('#q90000_1, input[variable="q90000"][value="1"]'));
            return 'q90000: 응답자 1명(1)';
          }
          if (cv.startsWith('q90015_r')) {
            clickEl(document.querySelector(`#${cv}_3, input[variable="${cv}"][value="3"]`) || document.querySelector(`input[variable="${cv}"]`));
            return `${cv}: 건물 관리(3)`;
          }
          if (cv.startsWith('q90020_r')) {
            const rName = basicInfoState.contactName || slotData.contactName || '관리소장';
            const t1 = basicInfoState.tel1 || '010';
            const t2 = basicInfoState.tel2 || '7935';
            const t3 = basicInfoState.tel3 || '2414';
            setVal(document.querySelector(`#OpenList_${cv}_op3_, input[variable="${cv}_op3"]`), rName);
            setVal(document.querySelector(`#${cv}_op4, input[variable="${cv}_op4"]`), t1);
            setVal(document.querySelector(`#${cv}_op5, input[variable="${cv}_op5"]`), t2);
            setVal(document.querySelector(`#${cv}_op6, input[variable="${cv}_op6"]`), t3);
            setVal(document.querySelector(`#${cv}_op7, input[variable="${cv}_op7"]`), `bldg${slotData.uid || '2025'}`);
            const sel = document.querySelector(`#${cv}_op9, select[variable="${cv}_op9"]`);
            if (sel) {
              sel.value = '4'; // naver.com
              if (typeof window.domaincheck === 'function') window.domaincheck();
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              setVal(document.querySelector(`#${cv}_op8, input[variable="${cv}_op8"]`), 'naver.com');
            }
            return `${cv}: 응답자(${rName}, ${t1}-${t2}-${t3}) 입력`;
          }

          // --- [범용 폴백: 예상치 못한 조건부 문항 대응] ---
          const qv = document.querySelector('#QuestionView');
          const allEls = Array.from(qv.querySelectorAll('input, select, textarea')).filter(el => el.type !== 'hidden' && el.type !== 'button' && !el.disabled && !el.readOnly);
          const checkRadioEls = allEls.filter(el => el.type === 'radio' || el.type === 'checkbox');
          if (checkRadioEls.length > 0) {
            const noneOpt = checkRadioEls.find(el => {
              const lbl = (el.closest('label')?.innerText || el.closest('tr')?.innerText || '');
              return (
                el.value === '77' ||
                el.value === '98' ||
                el.value === '-8' ||
                lbl.includes('해당사항 없음') ||
                lbl.includes('설비 없음') ||
                lbl.includes('사용하지 않') ||
                lbl.includes('이용하지 않') ||
                lbl.includes('운영하지 않') ||
                lbl.includes('보유하지 않') ||
                lbl.includes('미보유') ||
                lbl.includes('모름') ||
                lbl.includes('없음') ||
                lbl.includes('아니요') ||
                lbl.includes('안함')
              );
            }) || checkRadioEls[0];
            if (noneOpt) {
              clickEl(noneOpt);
              return `${cv}: fallback radio/check (${noneOpt.value})`;
            }
          }
          const textEls = allEls.filter(el => (el.type === 'text' || el.type === 'tel' || el.type === 'number') && !String(el.id).includes('op97') && !String(el.id).includes('op91'));
          if (textEls.length > 0) {
            textEls.forEach(el => setVal(el, '1'));
            return `${cv}: fallback text ('1')`;
          }

          return 'UNHANDLED';
        }, { cv: step.cv, text: step.text, slotData, basicInfoState, policy, preserveExisting, trackedStoreCount });
      }

      const preFilledSummary = activeInputs
        .filter(inp => (inp.type === 'radio' || inp.type === 'checkbox') ? inp.checked : (inp.tag !== 'SELECT' && inp.value !== ''))
        .map(inp => `${inp.variable || inp.id}=${inp.value}`)
        .join(', ');

      stepTrace.push({
        stepNo: stepIdx + 1,
        cv: step.cv,
        pct: step.pct,
        action: actionDesc,
        preFilled: preFilledSummary,
        questionSnippet: step.text.slice(0, 180)
      });

      // 안전가드(safetyGuard) 활성화 시 마지막 응답자 화면(q90020_r1) 입력 후 제출 직전에 정지
      if (safetyGuard && step.cv === 'q90020_r1') {
        if (reportDir) {
          const fileName = `step_91PCT_GUARD_${Date.now()}.png`;
          await page.screenshot({ path: path.join(reportDir, fileName), fullPage: true }).catch(() => {});
          capturedSteps.push({
            step: 'q90020_r1',
            stepIndex: capturedSteps.length + 1,
            title: '91% 제출 직전 안전 대기 (E1-3~E1-5)',
            file: fileName,
            url: `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`
          });
        }
        logger.info(`[HRC 에너지총조사] UID=${uid} 안전가드(91% q90020_r1) 도달 — 최종 제출 전 안전 정지`);
        return {
          success: true,
          status: 'stopped_at_review',
          uid,
          rpsUrl,
          basicInfoState,
          stepTrace,
          capturedSteps
        };
      }

      // 다음 문항 이동
      const prevCv = step.cv;
      await page.evaluate(() => window.GoNext(false, false));
      await page.waitForTimeout(350);
      await waitForRpsReady(page);

      let after = await extractRpsStep(page);
      if (after.alertMsg) {
        logger.info(`[HRC 에너지총조사] UID=${uid} 문항 ${prevCv} 확인 알림 자동 승인: ${after.alertMsg}`);
        await page.evaluate(() => window.GoNext(false, true));
        await page.waitForTimeout(350);
        await waitForRpsReady(page);
        after = await extractRpsStep(page);
      }

      if (after.err) {
        // 팝업 닫기 시도
        await page.evaluate(() => {
          const btn = document.querySelector('#MessageNo, .notipop button');
          if (btn) btn.click();
          const errEl = document.querySelector('#ErrorMessage');
          if (errEl) errEl.value = '';
          window.isRun = false;
        }).catch(() => {});
        if (after.err.includes('인터넷 연결 오류')) {
          logger.warn(`[HRC 에너지총조사] UID=${uid} 문항 ${after.cv} 일시적 통신 지연 감지 — 재시도합니다.`);
          await page.waitForTimeout(800);
          continue;
        }
        throw new Error(`[UID ${uid}] 문항 ${after.cv} 검증 오류: ${after.err.replace(/<br\s*\/?>/gi, ' ')}`);
      }
    }

    throw new Error(`[UID ${uid}] 최대 단계 수(160단계)를 초과하여 중단되었습니다.`);
  } finally {
    await browser.close();
  }
}
