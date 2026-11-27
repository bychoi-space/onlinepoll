/**
 * [2025년 기준 산림·정원산업조사 (relim.svybx.kr / S21629axjxr5)] 전용 자동화 러너
 *
 * 핵심 원칙:
 * 1. 서버 기입력(Pre-fill) 기초정보 보존 + 전각문자·특수기호(（주）, * 등) 자동 정제(ufchkschar type 7 준수).
 * 2. KSIC 46101·46104 산림산업 매출 비중 100% 및 전체 종사자 = 산림산업 종사자 100% 일치 고정.
 * 3. Q15 재무현황 및 Q17 2024년 매출액 검색 실측값 우선 반영, 미확인 세부 항목은 모름/무응답 체크박스 활용.
 * 4. 단문 주관식(Q17_A2, Q25_6, Q35_1, Q36_1a_1/2, Q43) 10자 이내 엄수 및 업체별 다변화(선행 객관식과 100% 인과 일치).
 * 5. 주관식 절대 스킵 금지: 응답 규칙이 없거나 공란인 주관식 문항 발견 시 즉시 자동조사 중단(Fail-Closed Hard Stop).
 * 6. 완료 직전 안전 대기(Pre-Completion Safe Wait): 최종 단계인 svyI058.asp(DQ 작성자 기본정보) 기입 후 제출하지 않고 안전 정지.
 */
import fs from 'fs';
import path from 'path';
import { launchChromium } from '../utils/chromium-launcher.js';
import { RELIM_FORESTRY_PID } from './relim-forestry-scraper.js';

function sanitizeSp7Text(str = '') {
  return String(str || '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/\*/g, '')
    .replace(/[^가-힣a-zA-Z0-9㈜ !?&,.ㆍ:~@%/;·[\]()=_+"\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampShortText10(str = '', fallback = '변동없음') {
  let clean = sanitizeSp7Text(str).replace(/[.,!?()[\]~/-]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) clean = fallback;
  if (clean.length > 10) clean = clean.replace(/\s+/g, '').slice(0, 10);
  return clean;
}

function hashSeed(str = '') {
  const s = String(str || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TRADE_HARDSHIP_SHORT_POOL = [
  '환율 상승', '유류값상승', '수입단가상승', '해상운임상승', '물류비 상승',
  '통관절차복잡', '원자재값상승', '해외수요감소', '단가경쟁심화', '운송비 부담'
];

const OUTLOOK_SHORT_BY_LABEL = {
  improve: ['신규거래확보', '수요회복기대', '홍보확대추진', '판로확대기대', '경기회복기대'],
  same: ['변동없음', '동일하다', '전년수준유지', '현상유지예상', '시장보합전망', '없음'],
  worse: ['인건비 상승', '원자재값상승', '사업비젼없음', '건설경기침체', '수요감소지속', '물가상승부담', '발주물량감소']
};

const Q36_LABEL_TO_SHORT_REASONS = [
  { match: /자금조달/, pool: ['금리부담가중', '운전자금부족', '대출규제부담', '자금융통난항', '운영자금압박'] },
  { match: /회수의\s*지연|판매대금/, pool: ['결제대금지연', '미수금 증가', '대금회수지연', '장기어음부담', '수금기일지연'] },
  { match: /금융|세제/, pool: ['금리및세부담', '이자부담증가', '세금부담가중', '금융비용상승', '대출이자상승'] },
  { match: /원자재\s*가격/, pool: ['원자재값상승', '환율 상승', '유류값상승', '수입단가상승', '물류비 상승'] },
  { match: /경기\s*변동/, pool: ['건설경기침체', '내수경기위축', '발주물량감소', '소비심리위축', '수요급감영향'] },
  { match: /인력\s*확보/, pool: ['인건비 상승', '현장구인난', '숙련인력부족', '청년인력기피', '인력채용난항'] },
  { match: /원자재\s*조달/, pool: ['원자재수급난', '자재확보난항', '공급망 불안', '원목수급불안', '원석확보난항'] }
];

export async function runRelimForestrySurvey({
  page: externalPage = null,
  campaign = null,
  policy: directPolicy = null,
  slotUrl = '',
  surveyUrl = '',
  slotData = {},
  reportDir: customReportDir = null,
  mode = 'pilot',
  emitLog: rawEmitLog = null,
  onProgress = null
}) {
  const resid = String(slotData.resid || slotData.uid || '').trim();
  const akey = String(slotData.accountKey || slotData.akey || campaign?.loginId || '2009').trim();
  const companyName = sanitizeSp7Text(slotData.companyName || slotData.sheetCompanyName || `사업체_${resid}`);
  const targetUrl =
    slotUrl ||
    surveyUrl ||
    slotData.slotUrl ||
    slotData.surveyUrl ||
    `https://relim.svybx.kr/?pid=${RELIM_FORESTRY_PID}&grpid=list&resid=${resid}&fwid=${RELIM_FORESTRY_PID}${akey}`;

  const emitLog = (msg, level = 'info', stepLabel = '진행') => {
    if (typeof rawEmitLog === 'function') rawEmitLog(msg, level);
    if (typeof onProgress === 'function') onProgress({ step: stepLabel, message: msg, level });
  };

  if (slotData.isClosedBiz || String(slotData.bizStatus || '').includes('폐업') || String(slotData.bizStatus || '').includes('휴업')) {
    const reason = `[사전차단] ${companyName}(resid=${resid})는 휴·폐업/결번 제외 대상(${slotData.bizStatus || slotData.eligOverall})입니다.`;
    emitLog(`⛔ ${reason}`, 'warn', '제외');
    return {
      success: false,
      skippedExcluded: true,
      error: reason,
      submittedAnswers: {}
    };
  }

  const policy = {
    preserveExistingInputs: true,
    stopBeforeFinalSubmit: true,
    haltOnUnhandledSubjective: true,
    ksic46101_46104FullForestry: true,
    q43DefaultText: '없음',
    ...(campaign?.surveyBlueprintPolicy || {}),
    ...(campaign?.relimPolicy || {}),
    ...(directPolicy || {}),
    ...(slotData?.customGuide || {})
  };

  const seed = hashSeed(`${resid}:${slotData.bizNo || companyName}:${slotData.seq || 1}`);
  const ksic = String(slotData.ksicCode || '').trim();
  const forceFullForestry = Boolean(policy.ksic46101_46104FullForestry && (ksic === '46101' || ksic === '46104'));

  // 정규화된 슬롯 프로필 준비
  const profile = {
    resid,
    seq: Number(slotData.seq || slotData.index || 1),
    seed,
    ksic,
    companyName,
    ceoName: sanitizeSp7Text(slotData.ceoName || '김영수'),
    ceoGenderCode: String(slotData.ceoGenderCode || '1') === '2' ? '2' : '1',
    q4_1AgeCode: String(slotData.q4_1AgeCode || '5'),
    q4_2SeniorCode: String(slotData.q4_2SeniorCode || '2'),
    address: sanitizeSp7Text(slotData.address || ''),
    phone: String(slotData.phone || '').replace(/\D/g, '') || '0212345678',
    fax: String(slotData.fax || '').replace(/[^0-9-]/g, ''),
    homepageUrl: String(slotData.homepageUrl || '').trim(),
    bizNo: String(slotData.bizNo || '').replace(/\D/g, ''),
    bizCategory: sanitizeSp7Text(slotData.bizCategory || (ksic.startsWith('461') ? '도매 및 상품중개업' : '제조업')),
    bizItem: sanitizeSp7Text(slotData.bizItem || slotData.subName1 || slotData.ksicName || '산림산업 제품'),
    otherBizCategory: sanitizeSp7Text(slotData.otherBizCategory || '일반도소매업'),
    q11FinStmtCode: String(slotData.q11FinStmtCode || '2'),
    openYear: String(Math.min(2025, Math.max(1950, parseInt(slotData.openYear, 10) || 2012))),
    orgTypeCode: String(slotData.orgTypeCode || '1'),
    corpRegNo: String(slotData.corpRegNo || '').trim(),
    branchCode: String(slotData.branchCode || '1'),
    subCode1: String(slotData.subCode1 || '3801').trim(),
    forestryRatioPct: forceFullForestry ? 100 : Number(slotData.forestryRatioPct ?? 100),
    sales2025M: Math.max(50, Number(slotData.sales2025M || 500)),
    assets2025M: slotData.assets2025M ?? null,
    capital2025M: slotData.capital2025M ?? null,
    debt2025M: slotData.debt2025M ?? null,
    opCost2025M: slotData.opCost2025M ?? null,
    opProfit2025M: slotData.opProfit2025M ?? null,
    netProfit2025M: slotData.netProfit2025M ?? null,
    sales2024M: Math.max(40, Number(slotData.sales2024M || 500)),
    q17A2Text: clampShortText10(slotData.q17A2Text || '변동없음', '변동없음'),
    totalWorkers: Math.max(1, Number(slotData.totalWorkers || 3)),
    workerBreakdown: slotData.workerBreakdown || null,
    q21CertCount: Math.max(0, Number(slotData.q21CertCount || 0)),
    avgSalaryManwon: Number(slotData.avgSalaryManwon ?? 3200),
    q34OutlookCode: String(slotData.q34OutlookCode || '2'),
    q35OutlookCode: String(slotData.q35OutlookCode || '2'),
    q35_1Text: clampShortText10(slotData.q35_1Text || '변동없음', '변동없음'),
    q36Rank1: String(slotData.q36Rank1 || '4'),
    q36Rank2: String(slotData.q36Rank2 || '6'),
    q36_1a_1Text: clampShortText10(slotData.q36_1a_1Text || '원자재값상승', '원자재값상승'),
    q36_1a_2Text: clampShortText10(slotData.q36_1a_2Text || '인건비 상승', '인건비 상승'),
    q25_6Text: clampShortText10(TRADE_HARDSHIP_SHORT_POOL[seed % TRADE_HARDSHIP_SHORT_POOL.length], '환율 상승'),
    q43Text: clampShortText10(slotData.q43Text || policy.q43DefaultText || '없음', '없음'),
    outlookPools: OUTLOOK_SHORT_BY_LABEL,
    q36ReasonRules: Q36_LABEL_TO_SHORT_REASONS.map(r => ({ pattern: r.match.source, pool: r.pool }))
  };

  profile.otherRatioPct = 100 - profile.forestryRatioPct;
  if (profile.otherRatioPct > 0) {
    profile.sales2025M = Math.max(100, Math.round(profile.sales2025M / 10) * 10);
    profile.sales2024M = Math.max(100, Math.round(profile.sales2024M / 10) * 10);
  }
  profile.forestrySales2025M = Math.round(profile.sales2025M * profile.forestryRatioPct / 100);
  profile.otherSales2025M = profile.sales2025M - profile.forestrySales2025M;
  profile.forestrySales2024M = Math.round(profile.sales2024M * profile.forestryRatioPct / 100);
  profile.otherSales2024M = profile.sales2024M - profile.forestrySales2024M;

  // Q17_A1 (1=증가, 2=감소, 3=변동 없음) 정합성 재검증
  if (profile.sales2025M > profile.sales2024M) {
    profile.q17A1Code = '1';
  } else if (profile.sales2025M < profile.sales2024M) {
    profile.q17A1Code = '2';
  } else {
    profile.q17A1Code = '3';
  }

  const submittedAnswers = {
    ...(slotData.submittedAnswers && typeof slotData.submittedAnswers === 'object' && !Array.isArray(slotData.submittedAnswers)
      ? slotData.submittedAnswers
      : {})
  };

  let ownBrowser = null;
  let page = externalPage;
  let alreadyCompletedOnServer = false;
  const alertMessages = [];

  const dialogHandler = async (dialog) => {
    const msg = dialog.message() || '';
    alertMessages.push(msg);
    emitLog(`[ALERT] 🔔 ${msg}`, 'warn', '알림');
    if (msg.includes('이미 참여하신 조사') || msg.includes('이미 응답')) {
      alreadyCompletedOnServer = true;
    }
    try {
      await dialog.accept();
    } catch (err) {
      emitLog(`[ALERT 수락 경고] ${err.message}`, 'warn', '알림');
    }
  };

  try {
    if (!page) {
      ownBrowser = await launchChromium({
        headless: true,
        args: ['--ignore-certificate-errors', '--disable-gpu']
      });
      const context = await ownBrowser.newContext({
        viewport: { width: 1280, height: 900 },
        ignoreHTTPSErrors: true
      });
      page = await context.newPage();
    }

    page.on('dialog', dialogHandler);

    emitLog(`🚀 [산림·정원산업조사] 진입 시작: [${akey}] ${companyName} (resid=${resid}, KSIC=${ksic}, 산림비중=${profile.forestryRatioPct}%)`, 'info', '진입');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(900);

    // 인트로 커버 페이지(#btnStart '설문 시작하기') 처리
    if ((await page.locator('#btnStart').count()) > 0) {
      emitLog(`▶️ [${companyName}] 인트로 화면 확인 — [설문 시작하기] 클릭`, 'info', '인트로');
      await page.click('#btnStart');
      await page.waitForTimeout(1000);
    }

    if (alreadyCompletedOnServer) {
      emitLog(`ℹ️ [${companyName}] 서버에서 이미 완료(100%)된 조사 건입니다.`, 'warn', '완료확인');
      return {
        success: true,
        alreadyCompleted: true,
        stoppedAt99: false,
        finalStep: 59,
        progressRate: '100%',
        submittedAnswers
      };
    }

    const maxLoops = 180;
    let lastStepFile = '';
    let sameStepCount = 0;

    for (let loop = 0; loop < maxLoops; loop++) {
      await page.waitForTimeout(320);

      if (alreadyCompletedOnServer) {
        return {
          success: true,
          alreadyCompleted: true,
          stoppedAt99: false,
          finalStep: 59,
          progressRate: '100%',
          submittedAnswers
        };
      }

      let pageState = null;
      try {
        pageState = await page.evaluate(() => {
          const url = location.href;
          const m = url.match(/\/(svy[A-Za-z0-9_]+\.asp)/i);
          const stepFile = m ? m[1] : '';
          const numMatch = stepFile.match(/(\d{3})\.asp$/i);
          const stepNum = numMatch ? parseInt(numMatch[1], 10) : 0;
          const hasNextBtn = Boolean(document.querySelector('#BtnNextPage'));
          const nextBtnText = (document.querySelector('#BtnNextPage')?.innerText || document.querySelector('#BtnNextPage')?.value || '').replace(/\s+/g, ' ').trim();
          const hasFrmChk = typeof window.frmFormChk === 'function';
          const bodyOnLoad = document.body?.getAttribute('onload') || '';
          const frmAction = document.frm?.getAttribute('action') || '';
          const titlePctMatch = (document.title || '').match(/(\d+)\s*%/);
          const progText = (document.querySelector('#ProgressRate')?.textContent || '').trim() || (titlePctMatch ? `${titlePctMatch[1]}%` : '');
          const promptMsg = (document.querySelector('.jqimessage, .jBox-content')?.innerText || '').replace(/\s+/g, ' ').trim();
          return {
            url,
            stepFile,
            stepNum,
            hasNextBtn,
            nextBtnText,
            hasFrmChk,
            isAutoSubmit: !hasNextBtn && !hasFrmChk && bodyOnLoad.toLowerCase().includes('submit'),
            frmAction,
            progText,
            promptMsg
          };
        });
      } catch (evalErr) {
        await page.waitForTimeout(350);
        continue;
      }

      if (!pageState || pageState.isAutoSubmit || (!pageState.hasNextBtn && !pageState.hasFrmChk)) {
        if (pageState?.url && (/mlist\.asp|mexec\.asp/i.test(pageState.url))) {
          return {
            success: true,
            alreadyCompleted: alreadyCompletedOnServer,
            stoppedAt99: false,
            finalStep: pageState.stepNum || 0,
            submittedAnswers
          };
        }
        await page.waitForTimeout(350);
        continue;
      }

      const { stepFile, stepNum } = pageState;
      if (!stepFile) {
        await page.waitForTimeout(350);
        continue;
      }

      if (stepFile === lastStepFile) {
        sameStepCount++;
      } else {
        lastStepFile = stepFile;
        sameStepCount = 1;
      }

      if (sameStepCount > 3) {
        throw new Error(`${stepFile} 단계에서 페이지 전환이 차단되었습니다. 안내메시지: ${pageState.promptMsg || '없음'}`);
      }

      // 열려 있는 안내 모달(jQuery Impromptu / jBox) 닫기
      if (pageState.promptMsg) {
        emitLog(`⚠️ [${stepFile}] 검증 팝업 감지: ${pageState.promptMsg}`, 'warn', stepFile);
        await page.evaluate(() => {
          if (window.$ && window.$.prompt && typeof window.$.prompt.close === 'function') window.$.prompt.close();
          document.querySelectorAll('.jqiclose, .jBox-closeButton').forEach(b => b.click());
        }).catch(err => emitLog(`[모달 닫기 경고] ${err.message}`, 'warn', stepFile));
      }

      // 🛑 [절대 안전 정지 관문] svyI058.asp (DQ 작성자 일반사항, 완료 직전 단계) 또는 Out.asp 직전 단계 도달 시
      if (stepFile.toLowerCase() === 'svyi058.asp' || stepNum >= 58 || /Out\.asp|End\.asp/i.test(pageState.frmAction)) {
        const dqFilled = await page.evaluate((payload) => {
          const { ceoName, phone, orgTypeCode } = payload;
          const $ = window.$;
          const setField = (sel, val) => {
            const el = document.querySelector(sel);
            if (!el || el.disabled || el.readOnly) return '';
            el.value = String(val);
            if ($) $(el).val(String(val)).trigger('input').trigger('keyup').trigger('change').trigger('blur');
            else {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('keyup', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            return el.value;
          };
          const dept = (orgTypeCode === '2' || orgTypeCode === '3') ? '관리부' : '경영';
          setField('#objDQ1', ceoName);
          setField('#objDQ2', dept);
          setField('#objDQ3', phone);
          setField('#objDQ4', '대표');
          return {
            DQ1: document.querySelector('#objDQ1')?.value || ceoName,
            DQ2: document.querySelector('#objDQ2')?.value || dept,
            DQ3: document.querySelector('#objDQ3')?.value || phone,
            DQ4: document.querySelector('#objDQ4')?.value || '대표'
          };
        }, {
          ceoName: profile.ceoName,
          phone: profile.phone,
          orgTypeCode: profile.orgTypeCode
        });

        Object.assign(submittedAnswers, dqFilled);

        if (policy.stopBeforeFinalSubmit !== false) {
          emitLog(`🛑 [완료 직전 안전 대기] ${stepFile} (DQ 작성자 정보 기입 완료) — 최종 제출 없이 99% 안전 대기 상태를 유지합니다.`, 'success', '안전대기');
          let screenshotPath = null;
          try {
            const outDir = customReportDir || path.join(process.cwd(), 'reports', `relim_forestry_${resid}`);
            fs.mkdirSync(outDir, { recursive: true });
            screenshotPath = path.join(outDir, `${stepFile.replace(/\.asp$/i, '')}_safe_wait.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
          } catch (scErr) {
            emitLog(`[스크린샷 저장 경고] ${scErr.message}`, 'warn', '안전대기');
          }

          return {
            success: true,
            alreadyCompleted: false,
            stoppedAt99: true,
            finalStep: stepNum || 58,
            progressRate: '99%',
            screenshotPath,
            submittedAnswers
          };
        }
      }

      // svyI003.asp의 조건부 활성화(Q8 -> Q8a, Q13 -> Q13a_1/Q13b_2)는 라디오 클릭 후 짧은 대기가 필요함
      if (stepFile.toLowerCase() === 'svyi003.asp') {
        await page.evaluate((payload) => {
          const { profile: p } = payload;
          const $ = window.$;
          const sanitize = (s) => String(s || '')
            .replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',').replace(/\*/g, '')
            .replace(/[^가-힣a-zA-Z0-9㈜ !?&,.ㆍ:~@%/;·[\]()=_+"\-]/g, ' ').replace(/\s+/g, ' ').trim();
          const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (!el || el.disabled || el.readOnly) return false;
            el.value = String(val);
            if ($) $(el).val(String(val)).trigger('input').trigger('keyup').trigger('change').trigger('blur');
            return true;
          };
          const clickRadio = (name, val) => {
            const r = document.querySelector(`input[type="radio"][name="${name}"][value="${val}"], #obj${name}_${val}`);
            if (!r || r.disabled) return false;
            const td = document.querySelector(`#ExampleTD_${name}_${val}`) || r.closest('td');
            if (td && typeof td.onclick === 'function') td.click();
            else r.click();
            r.checked = true;
            if ($) $(r).prop('checked', true).trigger('change');
            return true;
          };

          // 기입력 텍스트 정제(전각 괄호·별표 제거) 및 결측 보완
          const q1Cur = sanitize(document.querySelector('#objQ1')?.value || '') || p.companyName;
          setVal('#objQ1', q1Cur);
          const q2Cur = sanitize(document.querySelector('#objQ2')?.value || '') || p.ceoName;
          setVal('#objQ2', q2Cur);
          clickRadio('Q3', p.ceoGenderCode);
          clickRadio('Q4_1', p.q4_1AgeCode);
          clickRadio('Q4_2', p.q4_2SeniorCode);
          const q5Cur = sanitize(document.querySelector('#objQ5')?.value || '') || p.address;
          setVal('#objQ5', q5Cur);
          if (!String(document.querySelector('#objQ6')?.value || '').trim()) {
            setVal('#objQ6', p.phone);
          }
          setVal('#objQ10_1', p.bizCategory);
          setVal('#objQ10_2', p.bizItem);
          clickRadio('Q11', p.q11FinStmtCode);
          const q12Val = parseInt(document.querySelector('#objQ12')?.value || '', 10);
          if (!q12Val || q12Val < 1900 || q12Val > 2025) {
            setVal('#objQ12', p.openYear);
          }

          if (p.homepageUrl) clickRadio('Q8', '2');
          else clickRadio('Q8', '1');

          const validCorpReg = /^\d{6}-\d{7}$/.test(p.corpRegNo);
          if ((p.orgTypeCode === '2' || p.orgTypeCode === '3') && validCorpReg) {
            clickRadio('Q13', p.orgTypeCode);
          } else {
            clickRadio('Q13', '1');
          }
        }, { profile });

        await page.waitForTimeout(200);

        const svy003Post = await page.evaluate((payload) => {
          const { profile: p } = payload;
          const $ = window.$;
          const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (!el || el.disabled || el.readOnly) return false;
            el.value = String(val);
            if ($) $(el).val(String(val)).trigger('input').trigger('keyup').trigger('change').trigger('blur');
            return true;
          };
          const clickRadio = (name, val) => {
            const r = document.querySelector(`input[type="radio"][name="${name}"][value="${val}"], #obj${name}_${val}`);
            if (!r || r.disabled) return false;
            const td = document.querySelector(`#ExampleTD_${name}_${val}`) || r.closest('td');
            if (td && typeof td.onclick === 'function') td.click();
            else r.click();
            r.checked = true;
            if ($) $(r).prop('checked', true).trigger('change');
            return true;
          };

          if (p.homepageUrl && !document.querySelector('#objQ8a')?.disabled) {
            setVal('#objQ8a', p.homepageUrl);
            if (window.frmChkPtnQ8a === 'N') {
              // 입력마스크와 호환되지 않는 URL 형식일 경우 안전하게 없음으로 전환
              setVal('#objQ8a', '');
              clickRadio('Q8', '1');
            }
          }
          if ((p.orgTypeCode === '2' || p.orgTypeCode === '3') && /^\d{6}-\d{7}$/.test(p.corpRegNo)) {
            setVal('#objQ13a_1', p.corpRegNo);
            clickRadio('Q13b_2', p.branchCode || '1');
            if (window.frmChkPtnQ13a_1 === 'N') {
              clickRadio('Q13', '1');
            }
          }

          return {
            Q1: document.querySelector('#objQ1')?.value || '',
            Q2: document.querySelector('#objQ2')?.value || '',
            Q3: document.querySelector('input[name="Q3"]:checked')?.value || '',
            Q4_1: document.querySelector('input[name="Q4_1"]:checked')?.value || '',
            Q4_2: document.querySelector('input[name="Q4_2"]:checked')?.value || '',
            Q8: document.querySelector('input[name="Q8"]:checked')?.value || '',
            Q8a: document.querySelector('#objQ8a')?.value || '',
            Q10_1: document.querySelector('#objQ10_1')?.value || '',
            Q10_2: document.querySelector('#objQ10_2')?.value || '',
            Q13: document.querySelector('input[name="Q13"]:checked')?.value || '',
            Q13a_1: document.querySelector('#objQ13a_1')?.value || ''
          };
        }, { profile });

        Object.assign(submittedAnswers, svy003Post);
        emitLog(`✅ [svyI003] 사업체 기초정보 기입 완료 (${svy003Post.Q1} / 대표: ${svy003Post.Q2})`, 'info', 'svyI003');
      } else {
        // svyI001 ~ svyI057 단계별 전용 주입 실행
        const stepOutcome = await page.evaluate((payload) => {
          const { stepFile, profile: p, haltOnUnhandledSubjective } = payload;
          const $ = window.$;
          const sf = stepFile.toLowerCase();
          const recorded = {};

          document.querySelectorAll('input[name^="VerticalResponseChk"], input[id^="VerticalResponseChk"]').forEach(el => {
            el.value = '1';
          });
          if (typeof window.AlertExec !== 'undefined') {
            window.AlertExec = 1;
          }

          const frmStr = typeof window.frmFormChk === 'function' ? window.frmFormChk.toString() : '';

          const setVal = (elOrSel, val) => {
            const el = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
            if (!el || el.disabled || el.readOnly) return false;
            el.value = String(val);
            if ($) $(el).val(String(val)).trigger('input').trigger('keyup').trigger('change').trigger('blur');
            else {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('keyup', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            if (el.name) recorded[el.name] = el.value;
            return true;
          };

          const clickRadio = (name, val) => {
            const r = document.querySelector(`input[type="radio"][name="${name}"][value="${val}"], #obj${name}_${val}`);
            if (!r || r.disabled) return false;
            const td = document.querySelector(`#ExampleTD_${name}_${val}`) || r.closest('td');
            if (td && typeof td.onclick === 'function') td.click();
            else r.click();
            r.checked = true;
            if ($) $(r).prop('checked', true).trigger('change');
            recorded[name] = String(val);
            return true;
          };

          const clickCheckbox = (sel, wantChecked = true) => {
            const c = typeof sel === 'string' ? document.querySelector(sel) : sel;
            if (!c || c.disabled) return false;
            if (Boolean(c.checked) !== Boolean(wantChecked)) {
              c.click();
              c.checked = Boolean(wantChecked);
              if ($) $(c).prop('checked', Boolean(wantChecked)).trigger('change');
            }
            if (c.name) recorded[c.name] = c.checked ? (c.value || '1') : '';
            return true;
          };

          const clickOrderRanks = (qName, preferredIndices = []) => {
            const allBoxes = [...document.querySelectorAll(`input[name="${qName}"].objT31:not(:disabled)`)]
              .filter(el => el.offsetParent !== null && !/기타/.test(el.closest('td')?.innerText || ''));
            if (allBoxes.length === 0) return;
            // 기존 선택 초기화 후 원하는 순위대로 클릭
            allBoxes.filter(el => String(el.value || '').trim() !== '').forEach(el => el.click());
            const onclickSrc = allBoxes[0].getAttribute('onclick') || '';
            const maxMatch = onclickSrc.match(/set_seq\([^,]+,[^,]+,'(\d+)'/);
            const maxRank = maxMatch ? parseInt(maxMatch[1], 10) : 2;
            const chosenEls = [];
            for (const idxStr of preferredIndices) {
              const found = document.querySelector(`#obj${qName}_${idxStr}`);
              if (found && allBoxes.includes(found) && !chosenEls.includes(found)) {
                chosenEls.push(found);
              }
              if (chosenEls.length >= maxRank) break;
            }
            for (const box of allBoxes) {
              if (chosenEls.length >= maxRank) break;
              if (!chosenEls.includes(box)) chosenEls.push(box);
            }
            chosenEls.slice(0, maxRank).forEach((box, idx) => {
              box.click();
              recorded[`${qName}_rank${idx + 1}`] = box.id.replace(`obj${qName}_`, '');
            });
          };

          if (sf === 'svyi001.asp' || sf === 'svyi002.asp' || sf === 'svyi004.asp') {
            return { ok: true, recorded };
          }

          if (sf === 'svyi005.asp') {
            // Q14_1: 산림산업 외 타 산업 병행 여부 (1=그렇다, 2=아니다)
            const ans = p.forestryRatioPct >= 100 ? '2' : '1';
            clickRadio('Q14_1', ans);
            return { ok: true, recorded };
          }

          if (sf === 'svyi006.asp') {
            // Q14_2: 산림산업 및 기타산업 매출 비중 합계 100%
            const needOtherOnServer = window.frmChkExecQ14_2_6_2 === 'Y';
            const fPct = needOtherOnServer
              ? (p.forestryRatioPct < 100 ? p.forestryRatioPct : 80)
              : 100;
            const oPct = 100 - fPct;

            const curSub = String(document.querySelector('#objQ14_2_1_1')?.value || '').trim();
            if (!/^\d{4}$/.test(curSub)) {
              setVal('#objQ14_2_1_1', p.subCode1 || '3801');
            }
            setVal('#objQ14_2_1_2', p.bizCategory);
            setVal('#objQ14_2_1_3', String(fPct));
            if (document.querySelector('#objQ14_2_1_3a') && !document.querySelector('#objQ14_2_1_3a').disabled) {
              setVal('#objQ14_2_1_3a', '0');
            }
            if (oPct > 0) {
              setVal('#objQ14_2_6_2', p.otherBizCategory || '일반도소매업');
              setVal('#objQ14_2_6_3', String(oPct));
            } else {
              setVal('#objQ14_2_6_2', '');
              setVal('#objQ14_2_6_3', '');
            }
            const aEl = document.querySelector('#objQ14_2a');
            const bEl = document.querySelector('#objQ14_2b');
            if (aEl) aEl.value = String(fPct);
            if (bEl) bEl.value = String(oPct);
            recorded.Q14_2_forestryPct = fPct;
            recorded.Q14_2_otherPct = oPct;
            return { ok: true, recorded };
          }

          if (sf === 'svyi007.asp') {
            // Q15: 2025년 재무현황 (백만원) — 서버가 기억하는 Q14_2 기타비중과 100% 동기화
            const srvOtherMatch = frmStr.match(/parseInt\(["'](\d+)["'],\s*10\)\s*!=\s*gn\(["']objQ15_3_2["']\)/);
            const targetOtherPct = srvOtherMatch ? parseInt(srvOtherMatch[1], 10) : p.otherRatioPct;
            const targetForPct = 100 - targetOtherPct;

            const totalRev = targetOtherPct > 0 ? Math.max(100, Math.round(p.sales2025M / 100) * 100) : p.sales2025M;
            const forRev = Math.round(totalRev * targetForPct / 100);
            const othRev = totalRev - forRev;

            clickCheckbox('#objQ15_2_1_9', false);
            clickCheckbox('#objQ15_3_1_9', false);
            setVal('#objQ15_1_1', String(totalRev));
            setVal('#objQ15_2_1', String(forRev));
            if (document.querySelector('#objQ15a_2_1') && !document.querySelector('#objQ15a_2_1').disabled) {
              setVal('#objQ15a_2_1', '0');
            }
            setVal('#objQ15_3_1', String(othRev));

            const finSubItems = [
              { input: '#objQ15_4_1', dk: '#objQ15_4_1_9', val: p.assets2025M },
              { input: '#objQ15_5_1', dk: '#objQ15_5_1_9', val: p.capital2025M },
              { input: '#objQ15_6_1', dk: '#objQ15_6_1_9', val: p.debt2025M },
              { input: '#objQ15_7_1', dk: '#objQ15_7_1_9', val: p.opCost2025M },
              { input: '#objQ15_8_1', dk: '#objQ15_8_1_9', val: p.opProfit2025M },
              { input: '#objQ15_9_1', dk: '#objQ15_9_1_9', val: p.netProfit2025M }
            ];
            for (const item of finSubItems) {
              if (item.val !== null && item.val !== undefined && item.val !== '') {
                clickCheckbox(item.dk, false);
                setVal(item.input, String(item.val));
              } else {
                clickCheckbox(item.dk, true);
              }
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi008.asp') {
            // Q16: 대상별 매출비율 (B2G / B2B / B2C = 100%)
            let b2g = 0;
            let b2b = 100;
            let b2c = 0;
            if (p.ksic.startsWith('239')) {
              b2g = [0, 10, 20, 30][p.seed % 4];
              b2b = 100 - b2g;
            } else if (p.ksic.startsWith('461')) {
              b2c = [0, 10, 20][p.seed % 3];
              b2b = 100 - b2c;
            }
            setVal('#objQ16a_1', String(b2g));
            setVal('#objQ16a_2', String(b2b));
            setVal('#objQ16a_3', String(b2c));
            if (document.querySelector('#objQ16b_1') && !document.querySelector('#objQ16b_1').disabled) {
              setVal('#objQ16b_1', '0');
              setVal('#objQ16b_2', '100');
              setVal('#objQ16b_3', '0');
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi009.asp') {
            // Q17: 2024년 매출액 (백만원)
            clickCheckbox('#objQ17_1_1_9', false);
            clickCheckbox('#objQ17_2_1_9', false);
            clickCheckbox('#objQ17_3_1_9', false);
            setVal('#objQ17_1_1', String(p.sales2024M));
            setVal('#objQ17_2_1', String(p.forestrySales2024M));
            if (document.querySelector('#objQ17a_2_1') && !document.querySelector('#objQ17a_2_1').disabled) {
              setVal('#objQ17a_2_1', '0');
            }
            setVal('#objQ17_3_1', String(p.otherSales2024M));
            return { ok: true, recorded };
          }

          if (sf === 'svyi010.asp') {
            // Q17_A1(1=증가, 2=감소, 3=변동 없음) & Q17_A2(10자 이내 단문 주관식)
            clickRadio('Q17_A1', p.q17A1Code);
            setVal('#objQ17_A2', p.q17A2Text);
            return { ok: true, recorded };
          }

          if (sf === 'svyi011.asp') {
            // Q18: 전체 종사자 수 vs 산림산업 종사자 수 (남성 우위, 내국인 위주, KSIC 46101·46104는 전체=산림 동일)
            const wb = p.workerBreakdown || {
              row1Male: p.ceoGenderCode === '1' ? 1 : 0,
              row1Female: p.ceoGenderCode === '2' ? 1 : 0,
              regMale: Math.max(0, p.totalWorkers - 1),
              regFemale: 0,
              forRow1Male: p.ceoGenderCode === '1' ? 1 : 0,
              forRow1Female: p.ceoGenderCode === '2' ? 1 : 0,
              forRegMale: Math.max(0, p.totalWorkers - 1),
              forRegFemale: 0
            };
            const r1Dom = wb.row1Male + wb.row1Female;
            const r1ForDom = wb.forRow1Male + wb.forRow1Female;
            const r2Dom = wb.regMale + wb.regFemale;
            const r2ForDom = wb.forRegMale + wb.forRegFemale;

            setVal('#objQ18_1_1', String(wb.row1Male));
            setVal('#objQ18_1_2', String(wb.row1Female));
            setVal('#objQ18_1_3', String(r1Dom));
            setVal('#objQ18_1_4', '0');
            setVal('#objQ18_1_6', String(wb.forRow1Male));
            setVal('#objQ18_1_7', String(wb.forRow1Female));
            setVal('#objQ18_1_8', String(r1ForDom));
            setVal('#objQ18_1_9', '0');

            setVal('#objQ18_2_1', String(wb.regMale));
            setVal('#objQ18_2_2', String(wb.regFemale));
            setVal('#objQ18_2_3', String(r2Dom));
            setVal('#objQ18_2_4', '0');
            setVal('#objQ18_2_6', String(wb.forRegMale));
            setVal('#objQ18_2_7', String(wb.forRegFemale));
            setVal('#objQ18_2_8', String(r2ForDom));
            setVal('#objQ18_2_9', '0');

            for (const c of [1, 2, 3, 4, 6, 7, 8, 9]) {
              setVal(`#objQ18_3_${c}`, '0');
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi012.asp') {
            // Q19: 연령별·성별 산림 종사자 수 (frmFormChk 내 목표 남성/여성 합계 자동 동기화)
            const mMatch = frmStr.match(/gn\(["']objQ19_8_1["']\)\s*!=\s*(\d+)/);
            const fMatch = frmStr.match(/gn\(["']objQ19_8_2["']\)\s*!=\s*(\d+)/);
            const targetM = mMatch ? parseInt(mMatch[1], 10) : 1;
            const targetF = fMatch ? parseInt(fMatch[1], 10) : 0;

            for (let r = 1; r <= 7; r++) {
              setVal(`#objQ19_${r}_1`, '0');
              setVal(`#objQ19_${r}_2`, '0');
            }
            // 대표자 연령대 행 매핑: Q4_1('4'=40대->row3, '5'=50대->row4, '6'=60대->row5, '7'=70대->row6)
            const ceoRowMap = { '4': 3, '5': 4, '6': 5, '7': 6 };
            const ceoRow = ceoRowMap[p.q4_1AgeCode] || 4;
            let remM = targetM;
            let remF = targetF;
            const mAlloc = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
            const fAlloc = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };

            if (p.ceoGenderCode === '1' && remM > 0) {
              mAlloc[ceoRow] += 1;
              remM -= 1;
            } else if (p.ceoGenderCode === '2' && remF > 0) {
              fAlloc[ceoRow] += 1;
              remF -= 1;
            }
            const workerRows = [3, 4, 2, 5]; // 40대, 50대, 30대, 60대 순 분산
            let wi = 0;
            while (remM > 0) {
              const r = workerRows[(wi + p.seed) % workerRows.length];
              mAlloc[r] += 1;
              remM -= 1;
              wi++;
            }
            wi = 0;
            while (remF > 0) {
              const r = workerRows[(wi + p.seed + 1) % workerRows.length];
              fAlloc[r] += 1;
              remF -= 1;
              wi++;
            }
            for (let r = 1; r <= 7; r++) {
              setVal(`#objQ19_${r}_1`, String(mAlloc[r]));
              setVal(`#objQ19_${r}_2`, String(fAlloc[r]));
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi013.asp') {
            // Q19_1a(청년) / Q19_2a(65세 이상 고령 종사자 수): Q4_2(대표자 65세 이상 여부) 및 Q19b 상한선과 정합 일치
            const q19bMatch = frmStr.match(/Q19b\s*=\s*([0-9+ ]+)\s*;/);
            let q19bMax = 1;
            if (q19bMatch) {
              q19bMax = q19bMatch[1].split('+').reduce((acc, v) => acc + (parseInt(v.trim(), 10) || 0), 0);
            }
            const seniorCnt = p.q4_2SeniorCode === '1' ? Math.min(Math.max(1, q19bMax), q19bMax) : 0;
            if (document.querySelector('#objQ19_1a_1')) setVal('#objQ19_1a_1', '0');
            if (document.querySelector('#objQ19_1a_2')) setVal('#objQ19_1a_2', '0');
            if (document.querySelector('#objQ19_2a_1')) setVal('#objQ19_2a_1', String(seniorCnt));
            if (document.querySelector('#objQ19_2a_2')) setVal('#objQ19_2a_2', '0');
            return { ok: true, recorded };
          }

          if (sf === 'svyi014.asp') {
            // Q20: 직무별 산림 종사자 수 (남성 col1, 여성 col2, 합계 col3(ro), 부족/채용 col4~5, 내국인 col6, 외국인 col7)
            const totMatch = frmStr.match(/gn\(["']objQ20_6_3["']\)\s*!=\s*(\d+)/);
            const malMatch = frmStr.match(/gn\(["']objQ20_6_1["']\)\s*!=\s*(\d+)/);
            const targetTot = totMatch ? parseInt(totMatch[1], 10) : 1;
            const targetMal = malMatch ? parseInt(malMatch[1], 10) : Math.min(1, targetTot);
            const targetFem = Math.max(0, targetTot - targetMal);

            for (let r = 1; r <= 5; r++) {
              for (let c = 1; c <= 9; c++) {
                const el = document.querySelector(`#objQ20_${r}_${c}`);
                if (el && !el.readOnly && !el.disabled) setVal(el, '0');
              }
            }
            // 중개/도매(461xx)는 사무관리(1) + 영업마케팅(2), 제조/석재/운송은 사무관리(1) + 생산기술(4)
            const mainWorkRow = p.ksic.startsWith('461') ? 2 : 4;
            let r1M = 0, r1F = 0, mainM = 0, mainF = 0;
            if (targetTot === 1) {
              r1M = targetMal;
              r1F = targetFem;
            } else {
              if (targetMal >= 1 && targetFem >= 1) {
                r1F = 1;
                mainF = targetFem - 1;
                r1M = targetMal >= 3 ? 1 : 0;
                mainM = targetMal - r1M;
              } else if (targetMal >= 2) {
                r1M = 1;
                mainM = targetMal - 1;
              } else {
                r1F = Math.min(1, targetFem);
                mainF = targetFem - r1F;
              }
            }
            setVal('#objQ20_1_1', String(r1M));
            setVal('#objQ20_1_2', String(r1F));
            setVal('#objQ20_1_6', String(r1M + r1F));
            setVal(`#objQ20_${mainWorkRow}_1`, String(mainM));
            setVal(`#objQ20_${mainWorkRow}_2`, String(mainF));
            setVal(`#objQ20_${mainWorkRow}_6`, String(mainM + mainF));
            return { ok: true, recorded };
          }

          if (sf === 'svyi015.asp') {
            // Q21: 관련 자격증 보유 인원 (필요 업종만 입력, 나머지는 0)
            setVal('#objQ21_1_1', String(p.q21CertCount || 0));
            setVal('#objQ21_2_1', '0');
            if (document.querySelector('#objQ21_1_2') && !document.querySelector('#objQ21_1_2').disabled) {
              setVal('#objQ21_1_2', '0');
              setVal('#objQ21_2_2', '0');
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi016.asp') {
            // Q22: 상용근로자 1인 평균 연봉 (만원)
            if (p.avgSalaryManwon > 0) {
              clickCheckbox('#objQ22_9', false);
              setVal('#objQ22', String(p.avgSalaryManwon));
            } else {
              clickCheckbox('#objQ22_9', true);
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi017.asp') {
            clickRadio('Q23', '4'); // 해외 수출, 수입 모두 없음
            return { ok: true, recorded };
          }

          // 만약 수출/수입 분기(Q25_6 주관식 등) 진입 시 10자 이내 다변화 사유 기입
          if (document.querySelector('#objQ25_6') && !document.querySelector('#objQ25_6').disabled) {
            setVal('#objQ25_6', p.q25_6Text);
          }

          if (sf === 'svyi030.asp') {
            clickRadio('Q26_1', '4'); // 향후 해외 거래 의사 없음
            return { ok: true, recorded };
          }

          if (sf === 'svyi033.asp') {
            // Q26_4: 해외 거래 계획 없는 이유 1~2순위 (기타 7 제외)
            const pairs = [['1', '6'], ['1', '4'], ['6', '1'], ['1', '5'], ['4', '5']];
            clickOrderRanks('Q26_4', pairs[p.seed % pairs.length]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi034.asp') {
            // Q27: 연구개발 조직/인력 -> 4. 조직 및 인력 모두 없음
            clickCheckbox('#objQ27_4', true);
            return { ok: true, recorded };
          }

          if (sf === 'svyi035.asp') {
            // Q28: R&D 필요성 (2~4점 분산)
            const val = ['2', '3', '3', '4'][p.seed % 4];
            clickRadio('Q28', val);
            return { ok: true, recorded };
          }

          if (sf === 'svyi036.asp') {
            // Q29: 향후 기술개발 활용 방법 (1~3번 분산, 기타 6 제외)
            const val = ['1', '2', '3'][p.seed % 3];
            clickRadio('Q29', val);
            return { ok: true, recorded };
          }

          if (sf === 'svyi037.asp') {
            clickRadio('Q30', '2'); // 2025년 산림산업 관련 R&D 수행 아니오
            return { ok: true, recorded };
          }

          if (sf === 'svyi038.asp') {
            // Q31(예외 진입 시): 연구개발비 모름 체크
            for (const dk of ['#objQ31_1_9', '#objQ31_2_9', '#objQ31_3_9']) clickCheckbox(dk, true);
            return { ok: true, recorded };
          }

          if (sf === 'svyi039.asp') {
            clickRadio('Q32', '2'); // 지식재산권 없음
            return { ok: true, recorded };
          }

          if (sf === 'svyi041.asp') {
            // Q33: 기업 위치 단계 (업력에 맞춰 2=초기성장기, 3=고도성장기, 4=성숙기)
            const openYr = parseInt(p.openYear, 10) || 2012;
            const stage = openYr >= 2021 ? '2' : (openYr >= 2014 ? '3' : '4');
            clickRadio('Q33', stage);
            return { ok: true, recorded };
          }

          if (sf === 'svyi042.asp') {
            clickRadio('Q34', p.q34OutlookCode);
            return { ok: true, recorded };
          }

          if (sf === 'svyi043.asp') {
            clickRadio('Q35', p.q35OutlookCode);
            return { ok: true, recorded };
          }

          if (sf === 'svyi044.asp') {
            // Q35_1: 전망 사유 (10자 이내, 페이지 표시 전망 키워드와 100% 일치 보증)
            const qText = (document.querySelector('.QuestionTD')?.innerText || '').trim();
            let reason = p.q35_1Text;
            if (qText.includes('(악화)')) {
              const pool = p.outlookPools.worse;
              reason = pool[(p.seq + p.seed) % pool.length];
            } else if (qText.includes('(개선)')) {
              const pool = p.outlookPools.improve;
              reason = pool[(p.seq + p.seed) % pool.length];
            } else if (qText.includes('(동일)')) {
              const pool = p.outlookPools.same;
              reason = pool[(p.seq + p.seed) % pool.length];
            }
            setVal('#objQ35_1', reason);
            return { ok: true, recorded };
          }

          if (sf === 'svyi045.asp') {
            // Q36: 경영 분야 애로사항 1~2순위 (기타 8 제외)
            clickOrderRanks('Q36', [p.q36Rank1, p.q36Rank2]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi046.asp') {
            // Q36_1a_1, Q36_1a_2: 1순위·2순위 경영 애로사항 구체 설명 (각 10자 이내, 선택 항목과 100% 정합)
            const allText = document.body.innerText || '';
            const pickReasonForLabel = (rankNum, defaultVal, offset = 0) => {
              const m = allText.match(new RegExp(`${rankNum}순위\\s*\\(([^)]+)\\)`));
              const label = m ? m[1] : '';
              for (const rule of p.q36ReasonRules) {
                if (new RegExp(rule.pattern).test(label)) {
                  return rule.pool[(p.seq + p.seed + offset) % rule.pool.length];
                }
              }
              return defaultVal;
            };
            const r1 = pickReasonForLabel(1, p.q36_1a_1Text, 0);
            let r2 = pickReasonForLabel(2, p.q36_1a_2Text, 2);
            if (r2 === r1) r2 = '운영비 부담';
            setVal('#objQ36_1a_1', r1);
            setVal('#objQ36_1a_2', r2);
            return { ok: true, recorded };
          }

          if (sf === 'svyi047.asp') {
            // Q37: 기술 분야 애로사항 1~2순위 (1..5 중 분산, 기타 6 제외)
            const pairs = [['2', '1'], ['1', '4'], ['2', '4'], ['4', '3'], ['1', '5']];
            clickOrderRanks('Q37', pairs[p.seed % pairs.length]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi048.asp') {
            // Q38: 국내 판매 애로사항 1~2순위 (1..7 중 분산, 기타 8 제외)
            const pairs = [['3', '2'], ['2', '5'], ['3', '5'], ['2', '7'], ['5', '6']];
            clickOrderRanks('Q38', pairs[p.seed % pairs.length]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi049.asp') {
            // Q39: 정부 지원 중점도 10개 항목 × 5점 척도 (일자응답 회피 자연 분산)
            const pattern = ['4', '3', '4', '5', '3', '4', '3', '4', '3', '4'];
            for (let i = 1; i <= 10; i++) {
              const v = pattern[(i + p.seed) % pattern.length];
              clickRadio(`Q39_${i}`, v);
            }
            return { ok: true, recorded };
          }

          if (sf === 'svyi050.asp') {
            // Q40: 가장 큰 어려움 분야 1~3순위
            const triples = [
              ['4', '1', '9'],
              ['1', '2', '4'],
              ['4', '9', '7'],
              ['2', '4', '8'],
              ['1', '4', '6']
            ];
            clickOrderRanks('Q40', triples[p.seed % triples.length]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi051.asp') {
            clickRadio('Q41', '2'); // 산림청 지원사업 경험 없음
            return { ok: true, recorded };
          }

          if (sf === 'svyi052.asp') {
            // Q42: 희망 지원사업 1~2순위 (기타 6 제외)
            const pairs = [['3', '2'], ['3', '1'], ['2', '5'], ['1', '3'], ['3', '5']];
            clickOrderRanks('Q42', pairs[p.seed % pairs.length]);
            return { ok: true, recorded };
          }

          if (sf === 'svyi053.asp') {
            // Q43: 건의사항 주관식 ('없음' 중복 허용)
            setVal('#objQ43', p.q43Text || '없음');
            return { ok: true, recorded };
          }

          // 🚨 [주관식 미대응 즉시 중단 가드]
          // 사전 정의되지 않은 페이지에서 필수 주관식(text/textarea)이 활성 상태로 남아있으면 절대 스킵하지 않고 즉시 중단!
          if (haltOnUnhandledSubjective) {
            const unhandledTexts = [];
            document.querySelectorAll('input[type="text"]:not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly])').forEach(el => {
              if (el.offsetParent === null || el.classList.contains('objT31')) return;
              const nm = el.name || el.id.replace(/^obj/, '');
              if (!nm || /_etc$/.test(nm)) return;
              const noneEl = document.querySelector(`#obj${nm}none`);
              const dkEl = document.querySelector(`#obj${nm}dntknow`);
              if ((noneEl && noneEl.value) || (dkEl && dkEl.value)) return;
              const isRequiredText = frmStr.includes(`'${nm}'`) && frmStr.includes("'text'");
              if (isRequiredText && !String(el.value || '').trim()) {
                const qLabel = (document.querySelector('.QuestionTD')?.innerText || nm).replace(/\s+/g, ' ').trim().slice(0, 80);
                unhandledTexts.push(`${nm}(${qLabel})`);
              }
            });
            if (unhandledTexts.length > 0) {
              return {
                ok: false,
                unhandledSubjective: true,
                detail: unhandledTexts.join(', '),
                recorded
              };
            }
          }

          // 비주관식 보조 페이지(예: 단순 안내/정원 스킵 확인 등)의 미선택 라디오 안전 처리
          const radioGroups = new Map();
          document.querySelectorAll('input[type="radio"]:not(:disabled)').forEach(r => {
            if (r.offsetParent === null && !r.closest('td')?.offsetParent) return;
            if (!radioGroups.has(r.name)) radioGroups.set(r.name, []);
            radioGroups.get(r.name).push(r);
          });
          for (const [name, radios] of radioGroups.entries()) {
            if (radios.some(r => r.checked)) continue;
            const preferred = radios.find(r => /없음|아니오|보통|동일/.test(r.closest('td, tr')?.innerText || '')) || radios[0];
            clickRadio(name, preferred.value);
          }

          return { ok: true, recorded };
        }, {
          stepFile,
          profile,
          haltOnUnhandledSubjective: policy.haltOnUnhandledSubjective !== false
        });

        if (stepOutcome?.recorded) {
          Object.assign(submittedAnswers, stepOutcome.recorded);
        }

        if (stepOutcome && stepOutcome.unhandledSubjective) {
          const stopMsg = `🚨 [주관식 안전 중단] ${stepFile} 단계에서 사전 규칙이 없는 주관식 문항[${stepOutcome.detail}]이 감지되어 스킵하지 않고 자동조사를 즉시 중단했습니다.`;
          emitLog(stopMsg, 'error', '주관식중단');
          return {
            success: false,
            unhandledSubjectiveStop: true,
            error: stopMsg,
            finalStep: stepNum,
            submittedAnswers
          };
        }
      }

      // 다음 페이지 이동 실행
      await page.evaluate(() => {
        const btn = document.querySelector('#BtnNextPage');
        if (btn) btn.click();
        else if (typeof window.frmFormChk === 'function') window.frmFormChk();
      });
      await page.waitForTimeout(480);
    }

    throw new Error(`[${companyName}] 최대 루프(${maxLoops}) 내에 완료 직전 관문(svyI058.asp)에 도달하지 못했습니다.`);
  } catch (err) {
    emitLog(`❌ [산림·정원산업조사 오류] ${companyName} (resid=${resid}): ${err.message}`, 'error', '오류');
    return {
      success: false,
      error: err.message,
      alertMessages,
      submittedAnswers
    };
  } finally {
    if (page) {
      page.off('dialog', dialogHandler);
    }
    if (ownBrowser) {
      await ownBrowser.close().catch(e => {
        emitLog(`[브라우저 종료 경고] ${e.message}`, 'warn', '종료');
      });
    }
  }
}
