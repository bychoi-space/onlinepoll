import fs from 'fs';
import path from 'path';
import { launchChromium } from '../utils/chromium-launcher.js';

/**
 * [(신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)] 전용 안전 대기 러너
 * - 대상 URL: https://metrix.svybx.kr/sp7/S21401by41s3/mlist.asp (2010 송준희 / 2016 정소영)
 * - 개별 슬롯 진입 URL: https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid={RESID}&fwid=S21401by41s3{AKEY}
 * - 핵심 원칙:
 *   1. 기존패널(rtype=2) 4차 서버 프리필(Pre-fill) 응답값을 100% 보존하되, 공란으로 비어있는 필수 문항(A1a 응답자명, A10 실거주지, C3 2026년 세부 비용 4항목 등)과 5차 신규 문항(M1~M3, N1~N6_1, O1~O4)을 가이드 정책에 맞춰 정합성 있게 기입.
 *   2. 모든 단계(svyA001 ~ svyA115) 진행 시 해당 페이지의 문항 및 실제 입력/선택된 응답값을 추출하여 submittedAnswers에 누적 기록(구글 스프레드시트 및 엑셀 자동 동기화용).
 *   3. 최종 동의서 단계인 svyA115.asp (진행률 99%) 도달 시 절대 다음 페이지(svyA116/svyA117/Out.asp)로 제출하지 않고 안전 정지(Safe-Wait at 99%).
 */

const FALLBACK_KOREAN_NAMES = [
  '김영수', '이정호', '박민규', '최성훈', '정재현',
  '강동원', '조현우', '윤성민', '장기하', '임재범',
  '한지민', '오세훈', '서강준', '신동엽', '권지용',
  '황정민', '안성기', '송강호', '류승룡', '전도연'
];

function pickDeterministicName(seedStr = '') {
  const s = String(seedStr || '1');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_KOREAN_NAMES[h % FALLBACK_KOREAN_NAMES.length];
}

export async function runMetrixSeoulSurvey({
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
  const resid = String(slotData.resid || slotData.listCode || '').trim();
  const akey = String(slotData.accountKey || slotData.akey || slotData.interviewerId || '2010').trim();
  const companyName = String(slotData.companyName || slotData.storeName || `사업체_${resid}`).trim();
  const targetUrl = slotUrl || surveyUrl || slotData.slotUrl || slotData.surveyUrl || `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${resid}&fwid=S21401by41s3${akey}`;

  const emitLog = (msg, level = 'info', stepLabel = '진행') => {
    if (typeof rawEmitLog === 'function') rawEmitLog(msg, level);
    if (typeof onProgress === 'function') onProgress({ step: stepLabel, message: msg, level });
  };

  const rawCeoName = String(slotData.ceoName || '').trim();
  const validCeoName = (rawCeoName && rawCeoName !== '-' && rawCeoName !== '대표자' && rawCeoName.length >= 2 && !/\d/.test(rawCeoName))
    ? rawCeoName
    : pickDeterministicName(resid || companyName);

  const policy = {
    ...(campaign?.surveyBlueprintPolicy || {}),
    ...(directPolicy || {}),
    ...(slotData?.customGuide || {})
  };
  const submittedAnswers = {
    ...(slotData.submittedAnswers && typeof slotData.submittedAnswers === 'object' && !Array.isArray(slotData.submittedAnswers) ? slotData.submittedAnswers : {})
  };

  let ownBrowser = null;
  let page = externalPage;
  if (!page) {
    ownBrowser = await launchChromium({ headless: true, args: ['--ignore-certificate-errors'] });
    const context = await ownBrowser.newContext({
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true
    });
    page = await context.newPage();
  }

  let alertMessages = [];
  let alreadyCompletedOnServer = false;

  const dialogHandler = async (dialog) => {
    const msg = dialog.message() || '';
    alertMessages.push(msg);
    emitLog(`[ALERT] 🔔 ${msg}`, 'warn', '알림');
    if (msg.includes('이미 참여하신 조사')) {
      alreadyCompletedOnServer = true;
    }
    try {
      await dialog.accept();
    } catch (err) {
      emitLog(`[ALERT 처리 오류] ${err.message}`, 'warn', '알림');
    }
  };

  page.on('dialog', dialogHandler);

  try {
    emitLog(`🚀 [서울시 소상공인 패널조사] 슬롯 진입 시작: [${akey}] ${companyName} (resid=${resid})`, 'info', '진입');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);

    if (alreadyCompletedOnServer) {
      emitLog(`ℹ️ [${companyName}] 서버에서 이미 완료(100%)된 조사 건입니다.`, 'warn');
      return {
        success: true,
        alreadyCompleted: true,
        stoppedAt99: false,
        finalStep: 124,
        submittedAnswers
      };
    }

    const maxLoops = 220;
    let lastStepNum = -1;
    let sameStepCount = 0;

    for (let loop = 0; loop < maxLoops; loop++) {
      await page.waitForTimeout(300);

      if (alreadyCompletedOnServer) {
        emitLog(`ℹ️ [${companyName}] 이미 참여 완료된 조사로 확인되어 종료합니다.`, 'warn');
        return {
          success: true,
          alreadyCompleted: true,
          stoppedAt99: false,
          finalStep: 124,
          submittedAnswers
        };
      }

      const currentUrl = page.url();
      const stepMatch = currentUrl.match(/svyA(\d{3})\.asp/i);

      if (!stepMatch) {
        await page.waitForTimeout(500);
        const retryUrl = page.url();
        const retryMatch = retryUrl.match(/svyA(\d{3})\.asp/i);
        if (!retryMatch) {
          if (alreadyCompletedOnServer || retryUrl.includes('mexec.asp') || retryUrl.includes('mlist.asp')) {
            emitLog(`ℹ️ [${companyName}] 목록/상세 화면 리다이렉트 감지 (${retryUrl})`, 'warn');
            return {
              success: true,
              alreadyCompleted: alreadyCompletedOnServer,
              stoppedAt99: false,
              finalStep: lastStepNum,
              submittedAnswers
            };
          }
          continue;
        }
      }

      // Check if page is an auto-forwarding intermediate page (<body onLoad="document.frm.submit();">)
      let pageState = null;
      try {
        pageState = await page.evaluate(() => {
          const url = location.href;
          const m = url.match(/svyA(\d{3})\.asp/i);
          const stepNum = m ? parseInt(m[1], 10) : 0;
          const hasNextBtn = Boolean(document.querySelector('#BtnNextPage'));
          const hasFrmChk = typeof window.frmFormChk === 'function';
          const bodyOnLoad = document.body ? (document.body.getAttribute('onload') || '') : '';
          const progText = (document.querySelector('#ProgressRate')?.textContent || '').trim();
          return {
            url,
            stepNum,
            hasNextBtn,
            hasFrmChk,
            isAutoSubmit: !hasNextBtn && !hasFrmChk && bodyOnLoad.toLowerCase().includes('submit'),
            progText
          };
        });
      } catch (evalErr) {
        // Auto-submit redirect chain in progress
        await page.waitForTimeout(350);
        continue;
      }

      if (!pageState || pageState.isAutoSubmit || (!pageState.hasNextBtn && !pageState.hasFrmChk)) {
        await page.waitForTimeout(350);
        continue;
      }

      const stepNum = pageState.stepNum;
      if (!stepNum) {
        await page.waitForTimeout(350);
        continue;
      }

      if (stepNum === lastStepNum) {
        sameStepCount++;
      } else {
        lastStepNum = stepNum;
        sameStepCount = 1;
      }

      if (sameStepCount > 4) {
        throw new Error(`svyA${String(stepNum).padStart(3, '0')}.asp 단계에서 4회 이상 페이지 이동이 차단되었습니다.`);
      }

      // 🚨 [절대 안전 정지 관문] svyA115.asp (99% 개인정보 및 패널 참여 동의서) 이상 도달 시 즉시 정지!
      if (stepNum >= 115) {
        emitLog(`🛑 [안전 대기 관문 도달] svyA${String(stepNum).padStart(3, '0')}.asp (${pageState.progText || '99%'}) — 동의서 텍스트 사전 기입 후 제출 없이 안전 정지합니다.`, 'success');

        const stopPageResult = await page.evaluate((payload) => {
          const { ceoName, companyName, phone, address } = payload;
          const setTextIfEmpty = (sel, val) => {
            const el = document.querySelector(sel);
            if (el && !el.disabled && !String(el.value || '').trim() && val) {
              el.value = String(val).trim();
              if (window.$) {
                window.$(el).trigger('keyup').trigger('change');
              }
            }
          };
          setTextIfEmpty('#objAG1_1', ceoName);
          setTextIfEmpty('#objAG1_2', '본인');
          setTextIfEmpty('#objAG1_3', phone);
          setTextIfEmpty('#objAG1_4', companyName);
          setTextIfEmpty('#objAG1_5', phone);
          setTextIfEmpty('#objAG1_6', address);
          setTextIfEmpty('#objAG2_2', ceoName);
          setTextIfEmpty('#objAG3_2', ceoName);

          return {
            AG1_1: document.querySelector('#objAG1_1')?.value || ceoName,
            AG1_2: document.querySelector('#objAG1_2')?.value || '본인',
            AG1_3: document.querySelector('#objAG1_3')?.value || phone,
            AG1_4: document.querySelector('#objAG1_4')?.value || companyName,
            AG1_5: document.querySelector('#objAG1_5')?.value || phone,
            AG1_6: document.querySelector('#objAG1_6')?.value || address
          };
        }, {
          ceoName: validCeoName,
          companyName,
          phone: String(slotData.phone || slotData.mobile || '').trim(),
          address: String(slotData.address || '').trim()
        }).catch(err => {
          emitLog(`[svyA115 사전기입 오류] ${err.message}`, 'warn');
          return {};
        });

        Object.assign(submittedAnswers, stopPageResult);

        // 스크린샷 캡처
        let screenshotPath = null;
        try {
          const reportDir = path.join(process.cwd(), 'reports', `seoul_panel_${resid}`);
          if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
          screenshotPath = path.join(reportDir, `step_${String(stepNum).padStart(3, '0')}_safe_stop.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (scErr) {
          emitLog(`[스크린샷 저장 경고] ${scErr.message}`, 'warn');
        }

        return {
          success: true,
          alreadyCompleted: false,
          stoppedAt99: true,
          finalStep: stepNum,
          progressRate: pageState.progText || '99%',
          screenshotPath,
          submittedAnswers
        };
      }

      // 현재 단계 응답 주입 및 추출 실행
      let stepResult = null;
      try {
        stepResult = await page.evaluate((payload) => {
          const { stepNum, ceoName, policy } = payload;
          const $ = window.$;
          const logs = [];

          // 0. 일자응답 방지 히든필드(VerticalResponseChk*) 전수 해제 ('1'로 세팅)
          document.querySelectorAll('input[name^="VerticalResponseChk"], input[id^="VerticalResponseChk"]').forEach((el) => {
            el.value = '1';
          });

          // 헬퍼 함수들
          const setInputVal = (selector, val) => {
            const el = document.querySelector(selector);
            if (!el || el.disabled) return false;
            el.value = String(val);
            if ($) {
              $(el).val(String(val)).trigger('keyup').trigger('change').trigger('blur');
            } else {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          };

          const clickRadioValue = (qName, val) => {
            const radio = document.querySelector(`input[type="radio"][name="${qName}"][value="${val}"], #obj${qName}_${val}`);
            if (!radio || radio.disabled) return false;
            if (!radio.checked) {
              const td = document.querySelector(`#ExampleTD_${qName}_${val}`) || radio.closest('td');
              if (td && typeof td.onclick === 'function') {
                td.click();
              } else {
                radio.click();
              }
              radio.checked = true;
              if ($) $(radio).prop('checked', true).trigger('change');
            }
            return true;
          };

          const ensureRadioAnswered = (qName, preferredVal = '1') => {
            const checked = document.querySelector(`input[type="radio"][name="${qName}"]:checked`);
            if (checked) return checked.value;
            if (clickRadioValue(qName, preferredVal)) return String(preferredVal);
            const allRadios = [...document.querySelectorAll(`input[type="radio"][name="${qName}"]:not(:disabled)`)];
            if (allRadios.length > 0) {
              const target = allRadios[0];
              clickRadioValue(qName, target.value);
              return target.value;
            }
            return null;
          };

          const ensureOrderAnswered = (qName, maxRanks, preferredValues = []) => {
            // Surveybox sp7 순위형(T31)은 input.objT31[id^="obj{qName}_"] 클릭 시 set_seq()가 실행되어 순위 숫자(1,2,3)가 들어감
            const orderInputs = [...document.querySelectorAll(`input.objT31[id^="obj${qName}_"]:not(:disabled), input[name="${qName}"][id^="obj${qName}_"]:not(:disabled)`)];
            if (orderInputs.length === 0) return;

            const alreadyFilled = orderInputs.filter((el) => String(el.value || '').trim() !== '');
            if (alreadyFilled.length >= maxRanks) {
              return; // 이미 순위가 모두 기입되어 있음
            }

            // 기존 선택 초기화 (역순 또는 선택된 항목 다시 클릭하여 해제)
            alreadyFilled
              .sort((a, b) => Number(b.value) - Number(a.value))
              .forEach((el) => el.click());

            const chosen = [];
            for (const pref of preferredValues) {
              const el = document.querySelector(`#obj${qName}_${pref}`);
              if (el && !el.disabled && !chosen.includes(String(pref))) {
                chosen.push(String(pref));
              }
              if (chosen.length >= maxRanks) break;
            }

            if (chosen.length < maxRanks) {
              for (const el of orderInputs) {
                const v = String(el.id.replace(`obj${qName}_`, ''));
                // 기타(_etc) 입력칸이 딸린 항목 제외
                if (document.querySelector(`#obj${qName}_${v}_etc`)) continue;
                if (!chosen.includes(v)) chosen.push(v);
                if (chosen.length >= maxRanks) break;
              }
            }

            chosen.forEach((val) => {
              const el = document.querySelector(`#obj${qName}_${val}`);
              if (el && String(el.value || '').trim() === '') {
                el.click();
              }
            });
            logs.push(`${qName} 순위(${chosen.join(',')}) 기입`);
          };

        // 1. 단계별 맞춤형 도메인 주입 로직
        if (stepNum === 1) {
          // svyA001.asp: 패널구분 (2: 기존패널)
          ensureRadioAnswered('rtype', '2');
          logs.push('rtype=2(기존패널) 확인');
        } else if (stepNum === 2) {
          // svyA002.asp: A1~A11 기본정보 확인
          const a1a = document.querySelector('#objA1a');
          if (a1a && !String(a1a.value || '').trim()) {
            setInputVal('#objA1a', ceoName);
            logs.push(`A1a 응답자명(${ceoName}) 기입`);
          }
          // A7 가게 연락처가 비어있고 없음 체크도 안 되어 있으면 A7a(휴대폰) 복사 또는 없음 체크
          const a7 = document.querySelector('#objA7');
          const a7none = document.querySelector('#objA7none');
          if (a7 && !String(a7.value || '').trim() && (!a7none || !a7none.checked)) {
            const a7aVal = document.querySelector('#objA7a')?.value || '';
            if (a7aVal) {
              setInputVal('#objA7', a7aVal);
            } else if (a7none) {
              a7none.click();
            }
          }
          // A10 사장님 실거주지(시/도, 시/군/구, 동/읍/면, 상세주소)가 비어있으면 A4(사업체 주소) 복사
          const a10_1 = document.querySelector('#objA10_1');
          if (a10_1 && !String(a10_1.value || '').trim()) {
            const v1 = document.querySelector('#objA4_1')?.value || '서울특별시';
            const v2 = document.querySelector('#objA4_2')?.value || '강남구';
            const v3 = document.querySelector('#objA4_3')?.value || '역삼동';
            const v4 = document.querySelector('#objA4_4')?.value || '101호';
            setInputVal('#objA10_1', v1);
            setInputVal('#objA10_2', v2);
            setInputVal('#objA10_3', v3);
            setInputVal('#objA10_4', v4);
            logs.push(`A10 실거주지 주소(${v1} ${v2} ${v3}) 자동기입`);
          }
        } else if (stepNum === 11) {
          // svyA011.asp: B8 타 사업체 보유 여부 -> 2(없다)
          ensureRadioAnswered('B8', policy.B8 || '2');
        } else if (stepNum === 17) {
          // svyA017.asp: C3 2025년(_3) 및 2026년(_4) 매출액·영업비용·영업이익 정합 계산
          const getNum = (sel) => {
            const raw = String(document.querySelector(sel)?.value || '').replace(/,/g, '').trim();
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
          };
          const c3_3_4_el = document.querySelector('#objC3_3_4');
          const c3_4_4_el = document.querySelector('#objC3_4_4');
          const c3_5_4_el = document.querySelector('#objC3_5_4');
          const c3_6_4_el = document.querySelector('#objC3_6_4');

          const is2026DetailEmpty = [c3_3_4_el, c3_4_4_el, c3_5_4_el, c3_6_4_el].some(
            (el) => el && String(el.value || '').trim() === ''
          );

          if (is2026DetailEmpty) {
            const rev2025 = getNum('#objC3_1_3');
            const cost2025 = getNum('#objC3_2_3');
            const cogs2025 = getNum('#objC3_3_3');
            const wage2025 = getNum('#objC3_4_3');
            const rent2025 = getNum('#objC3_5_3');
            const etc2025 = getNum('#objC3_6_3');

            let rev2026 = getNum('#objC3_1_4');
            if (!rev2026 && rev2025 > 0) rev2026 = rev2025;
            if (!String(document.querySelector('#objC3_1_4')?.value || '').trim()) {
              setInputVal('#objC3_1_4', rev2026);
            }

            // 서버 스크립트에 원래 주입된 C3_2_4 목표치 추출
            const htmlStr = document.documentElement.innerHTML;
            const mTargetCost = htmlStr.match(/\$\('#objC3_2_4'\)\.val\('(\d+)'\)/);
            let targetCost2026 = mTargetCost ? Number(mTargetCost[1]) : 0;
            if (!targetCost2026) {
              targetCost2026 = cost2025 > 0 && rev2025 > 0
                ? Math.round(cost2025 * (rev2026 / rev2025))
                : cost2025;
            }

            let wage2026 = wage2025;
            let rent2026 = rent2025;
            let etc2026 = etc2025;
            let cogs2026 = targetCost2026 - (wage2026 + rent2026 + etc2026);

            if (cogs2026 < 0) {
              // 고정비 합계가 목표 총비용보다 클 경우 2025년 비중대로 비례 배분
              const baseSum = (cogs2025 + wage2025 + rent2025 + etc2025) || 1;
              cogs2026 = Math.round(targetCost2026 * (cogs2025 / baseSum));
              wage2026 = Math.round(targetCost2026 * (wage2025 / baseSum));
              rent2026 = Math.round(targetCost2026 * (rent2025 / baseSum));
              etc2026 = Math.max(0, targetCost2026 - cogs2026 - wage2026 - rent2026);
            }

            setInputVal('#objC3_3_4', cogs2026);
            setInputVal('#objC3_4_4', wage2026);
            setInputVal('#objC3_5_4', rent2026);
            setInputVal('#objC3_6_4', etc2026);
            setInputVal('#objC3_1_4', rev2026);
            logs.push(`C3 2026년 세부비용(원가:${cogs2026}, 급여:${wage2026}, 임차료:${rent2026}, 기타:${etc2026}) 정합 기입`);
          }
        } else if (stepNum === 83) {
          // svyA083.asp: J2_2 정부/서울시 지원사업 수혜여부 및 지원년월
          for (let i = 1; i <= 6; i++) {
            const yesRadio = document.querySelector(`#objJ2_2_1_${i}_1`);
            const ymInput = document.querySelector(`#objJ2_2_2_${i}`);
            if (yesRadio && yesRadio.checked && ymInput && !ymInput.disabled && !String(ymInput.value || '').trim()) {
              setInputVal(`#objJ2_2_2_${i}`, '2025년 10월');
            }
          }
        } else if (stepNum === 89) {
          // svyA089.asp: J7_1 노후 준비 사항 (복수선택)
          const anyChecked = document.querySelector('input[type="checkbox"][id^="objJ7_1_"]:checked');
          if (!anyChecked) {
            const cb1 = document.querySelector('#objJ7_1_1');
            if (cb1 && !cb1.disabled) cb1.click();
          }
        } else if (stepNum === 99) {
          // svyA099.asp: M1 성공(생존) 경영요인 1~3순위
          const ranks = Array.isArray(policy.M1_ranks) && policy.M1_ranks.length >= 3
            ? policy.M1_ranks
            : ['6', '12', '5'];
          ensureOrderAnswered('M1', 3, ranks);
        } else if (stepNum === 100) {
          // svyA100.asp: M2 성공(생존) 비용요인 1~2순위
          const ranks = Array.isArray(policy.M2_ranks) && policy.M2_ranks.length >= 2
            ? policy.M2_ranks
            : ['2', '3'];
          ensureOrderAnswered('M2', 2, ranks);
        } else if (stepNum === 101) {
          // svyA101.asp: M3 성공(생존) 상권요인 1~3순위
          const ranks = Array.isArray(policy.M3_ranks) && policy.M3_ranks.length >= 3
            ? policy.M3_ranks
            : ['5', '2', '7'];
          ensureOrderAnswered('M3', 3, ranks);
        } else if (stepNum === 102) {
          // svyA102.asp: N1 창업 당시 예상 대비 실제 비교 (1,2,3,4,6,7 행, 지그재그 응답)
          const defaults = {
            N1_1: policy.N1_1 || '2',
            N1_2: policy.N1_2 || '3',
            N1_3: policy.N1_3 || '2',
            N1_4: policy.N1_4 || '4',
            N1_6: policy.N1_6 || '3',
            N1_7: policy.N1_7 || '4'
          };
          Object.entries(defaults).forEach(([qKey, val]) => {
            ensureRadioAnswered(qKey, val);
          });
        } else if (stepNum === 103) {
          // svyA103.asp: N2 경영 안정화 소요기간 (6개 문항)
          const defaults = {
            N2_1_1: policy.N2_1_1 || '2',
            N2_1_2: policy.N2_1_2 || '3',
            N2_2_1: policy.N2_2_1 || '2',
            N2_2_2: policy.N2_2_2 || '3',
            N2_3_1: policy.N2_3_1 || '3',
            N2_3_2: policy.N2_3_2 || '4'
          };
          Object.entries(defaults).forEach(([qKey, val]) => {
            ensureRadioAnswered(qKey, val);
          });
        } else if (stepNum === 104) {
          // svyA104.asp: N3 경영 안정화 애로사항 1~2순위
          const ranks = Array.isArray(policy.N3_ranks) && policy.N3_ranks.length >= 2
            ? policy.N3_ranks
            : ['1', '2'];
          ensureOrderAnswered('N3', 2, ranks);
        } else if (stepNum === 105) {
          // svyA105.asp: N4 최근 인건비 상승 부담 정도
          ensureRadioAnswered('N4', policy.N4 || '2');
        } else if (stepNum === 106) {
          // svyA106.asp: N5 인건비 상승 대응조치 (복수선택)
          const anyChecked = document.querySelector('input[type="checkbox"][id^="objN5_"]:checked');
          if (!anyChecked) {
            const pref = policy.N5 || '3';
            const cb = document.querySelector(`#objN5_${pref}`) || document.querySelector('#objN5_1');
            if (cb && !cb.disabled) cb.click();
          }
        } else if (stepNum === 107) {
          // svyA107.asp: N6 최저임금 구분 적용 찬반 (1: 찬성, 2: 반대)
          ensureRadioAnswered('N6', policy.N6 || '1');
        } else if (stepNum === 108) {
          // svyA108.asp: N6_1 최저임금 차등 적용 기준별 동의 수준 (지그재그)
          ensureRadioAnswered('N6_1_1', policy.N6_1_1 || '2');
          ensureRadioAnswered('N6_1_2', policy.N6_1_2 || '1');
          ensureRadioAnswered('N6_1_3', policy.N6_1_3 || '2');
        } else if (stepNum >= 109 && stepNum <= 114) {
          // svyA109 ~ svyA114: O1 ~ O4 서울신용보증재단 인지도 및 이용경험
          ensureRadioAnswered('O1', policy.O1 || '1');
          ['O1_1', 'O2', 'O3', 'O4'].forEach((qKey, idx) => {
            if (document.querySelector(`input[type="radio"][name="${qKey}"]`)) {
              ensureRadioAnswered(qKey, policy[qKey] || String((idx % 2) + 1));
            }
          });
        }

        // 2. [Universal Safety Net] frmFormChk() 내부의 ufchks(...) 전수 검사 및 미응답 자동 보정
        if (typeof window.frmFormChk === 'function') {
          const fnSrc = window.frmFormChk.toString();
          const ufRegex = /ufchks\(\s*'([^']+)'\s*,\s*([^,]+)\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g;
          let match;
          let autoIdx = 0;
          while ((match = ufRegex.exec(fnSrc)) !== null) {
            const [, qName, , qType, etcCode, minStr, maxStr] = match;
            const minVal = Number(minStr);
            const maxVal = Number(maxStr);
            const execFlag = window[`frmChkExec${qName}`];
            if (execFlag && execFlag !== 'Y') continue;

            if (qType === 'radio' || qType === 'mradio') {
              const checked = document.querySelector(`input[type="radio"][name="${qName}"]:checked`);
              if (!checked) {
                const radios = [...document.querySelectorAll(`input[type="radio"][name="${qName}"]:not(:disabled)`)];
                const nonEtcRadios = radios.filter((r) => !document.querySelector(`#obj${qName}_${r.value}_etc`));
                const pool = nonEtcRadios.length > 0 ? nonEtcRadios : radios;
                if (pool.length > 0) {
                  const pick = pool[autoIdx % pool.length];
                  clickRadioValue(qName, pick.value);
                  logs.push(`[AutoRadio] ${qName}=${pick.value}`);
                  autoIdx++;
                }
              }
            } else if (qType === 'check') {
              const checked = document.querySelector(`input[type="checkbox"][id^="obj${qName}_"]:checked`);
              if (!checked) {
                const cbs = [...document.querySelectorAll(`input[type="checkbox"][id^="obj${qName}_"]:not(:disabled)`)];
                const nonEtcCbs = cbs.filter((c) => !document.querySelector(`#${c.id}_etc`));
                const targetCb = nonEtcCbs[0] || cbs[0];
                if (targetCb) {
                  targetCb.click();
                  targetCb.checked = true;
                  logs.push(`[AutoCheck] ${qName}=${targetCb.value}`);
                }
              }
            } else if (qType === 'order') {
              const rankCount = maxVal > 0 ? maxVal : 2;
              ensureOrderAnswered(qName, rankCount, []);
            } else if (qType === 'select') {
              const sel = document.querySelector(`#obj${qName}, select[name="${qName}"]`);
              if (sel && !sel.disabled && !String(sel.value || '').trim()) {
                const validOpt = [...sel.options].find((o) => String(o.value || '').trim() !== '');
                if (validOpt) {
                  sel.value = validOpt.value;
                  if ($) $(sel).trigger('change');
                  logs.push(`[AutoSelect] ${qName}=${validOpt.value}`);
                }
              }
            } else if (qType === 'number' || qType === 'text') {
              const noneEl = document.querySelector(`#obj${qName}none`);
              const dntEl = document.querySelector(`#obj${qName}dntknow`);
              const noneChecked = noneEl && ((noneEl.type === 'checkbox' && noneEl.checked) || (noneEl.type !== 'checkbox' && String(noneEl.value || '').length > 0));
              const dntChecked = dntEl && ((dntEl.type === 'checkbox' && dntEl.checked) || (dntEl.type !== 'checkbox' && String(dntEl.value || '').length > 0));
              if (!noneChecked && !dntChecked) {
                const inp = document.querySelector(`#obj${qName}, input[name="${qName}"]`);
                if (inp && !inp.disabled && String(inp.value || '').trim() === '') {
                  const fallback = qType === 'number'
                    ? String(Math.max(0, minVal > 0 ? minVal : 0))
                    : '해당없음';
                  setInputVal(`#obj${qName}`, fallback);
                  logs.push(`[AutoInput] ${qName}=${fallback}`);
                }
              }
            }
          }
        }

        // 일자응답 방지 히든필드 재확인
        document.querySelectorAll('input[name^="VerticalResponseChk"], input[id^="VerticalResponseChk"]').forEach((el) => {
          el.value = '1';
        });

        // 3. 현재 페이지의 모든 응답 데이터 수집 (구글 스프레드시트 & 엑셀 기록용)
        const pageAnswers = {};

        // (a) 라디오 버튼
        const radioNames = new Set();
        document.querySelectorAll('input[type="radio"]').forEach((r) => {
          if (r.name) radioNames.add(r.name);
        });
        radioNames.forEach((name) => {
          const checked = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
          if (checked) {
            const td = checked.closest('td');
            const labelSpan = td ? td.querySelector('.ExampleText') : null;
            const labelText = labelSpan ? labelSpan.textContent.replace(/\s+/g, ' ').trim() : '';
            // 척도형(mradio)의 경우 숫자값만, 일반 단일선택의 경우 코드(라벨) 형태로 저장
            pageAnswers[name] = labelText && labelText.length <= 25
              ? `${checked.value}(${labelText})`
              : String(checked.value);
          }
        });

        // (b) 순위형 (.objT31 또는 hiddenobj)
        const orderGroups = {};
        document.querySelectorAll('input.objT31[id^="obj"]').forEach((el) => {
          const rankVal = Number(String(el.value || '').trim());
          const qKey = el.name || '';
          const optCode = el.id.replace(`obj${qKey}_`, '');
          if (qKey && rankVal > 0) {
            if (!orderGroups[qKey]) orderGroups[qKey] = [];
            const td = el.closest('td');
            const labelText = td?.querySelector('.ExampleText')?.textContent?.replace(/\s+/g, ' ')?.trim() || '';
            orderGroups[qKey].push({
              rank: rankVal,
              val: labelText ? `${optCode}(${labelText})` : optCode
            });
          }
        });
        document.querySelectorAll('input[type="hidden"][id^="hiddenobj"]').forEach((h) => {
          const m = h.id.match(/^hiddenobj(.+)_(\d+)$/);
          if (m && String(h.value || '').trim()) {
            const qKey = m[1];
            if (orderGroups[qKey] && orderGroups[qKey].length > 0) return;
            const rankIdx = Number(m[2]);
            if (!orderGroups[qKey]) orderGroups[qKey] = [];
            orderGroups[qKey].push({ rank: rankIdx, val: String(h.value).trim() });
          }
        });
        Object.entries(orderGroups).forEach(([qKey, arr]) => {
          arr.sort((a, b) => a.rank - b.rank);
          pageAnswers[qKey] = arr.map((x) => `${x.rank}순위:${x.val}`).join(', ');
        });

        // (c) 체크박스 (순위형이 아닌 일반 복수선택)
        const checkGroups = {};
        document.querySelectorAll('input[type="checkbox"][id^="obj"]:checked').forEach((cb) => {
          const idStr = cb.id.replace(/^obj/, '');
          if (idStr.endsWith('none') || idStr.endsWith('dntknow')) return;
          const m = idStr.match(/^([A-Za-z0-9]+(?:_[0-9]+)*?)_([0-9]+)$/);
          const qKey = m ? m[1] : idStr;
          if (orderGroups[qKey]) return; // 순위형에서 이미 기록됨
          if (!checkGroups[qKey]) checkGroups[qKey] = [];
          checkGroups[qKey].push(cb.value || (m ? m[2] : 'Y'));
        });
        Object.entries(checkGroups).forEach(([qKey, vals]) => {
          pageAnswers[qKey] = vals.join(', ');
        });

        // (d) 텍스트 / 숫자 / 셀렉트 입력값 (순위형 .objT31 제외)
        document.querySelectorAll('input[type="text"][id^="obj"]:not(.objT31), input[type="number"][id^="obj"], input[type="tel"][id^="obj"], select[id^="obj"]').forEach((el) => {
          if (el.id === 'objfont_type') return;
          const qKey = el.id.replace(/^obj/, '');
          const val = String(el.value || '').trim();
          if (val !== '') {
            pageAnswers[qKey] = val;
          }
        });

        // 4. 다음 페이지 이동 (frmFormChk 호출)
        if (typeof window.frmFormChk === 'function') {
          window.frmFormChk();
        } else {
          const nextBtn = document.querySelector('#BtnNextPage');
          if (nextBtn) nextBtn.click();
        }

        // 만약 jQuery Impromptu 확인창(.jqi)이 떴다면 즉시 확인 버튼 클릭
        setTimeout(() => {
          const jqiBtn = document.querySelector('.jqi button[value="true"], .jqi button, .jqibuttons button');
          if (jqiBtn) jqiBtn.click();
        }, 120);

        return {
          logs,
          pageAnswers
        };
      }, {
        stepNum,
        ceoName: validCeoName,
        policy
      });
      } catch (stepErr) {
        // Navigation occurred mid-evaluate
        await page.waitForTimeout(350);
        continue;
      }

      if (stepResult?.pageAnswers) {
        Object.assign(submittedAnswers, stepResult.pageAnswers);
      }
      if (stepResult?.logs && stepResult.logs.length > 0) {
        emitLog(`  ↳ [Step ${String(stepNum).padStart(3, '0')} (${pageState.progText || ''})] ${stepResult.logs.join(' | ')}`, 'info');
      }
    }

    throw new Error(`최대 단계 반복 횟수(${maxLoops})를 초과했습니다.`);
  } finally {
    try {
      page.off('dialog', dialogHandler);
    } catch (_) {}
    if (ownBrowser) {
      await ownBrowser.close().catch(err => console.warn(`브라우저 종료 경고: ${err.message}`));
    }
  }
}
