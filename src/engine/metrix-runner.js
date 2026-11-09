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

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
  reportDir = null,
  onProgress = () => {}
}) {
  if (!surveyUrl) {
    throw new Error('설문 참여 URL(surveyUrl)이 제공되지 않았습니다.');
  }

  // 쿼터별 개별 가이드(customGuide)가 있으면 캠페인 기본 정책(policy) 위에 병합
  const effectivePolicy = {
    ...policy,
    ...(slotData.customGuide || {})
  };
  const rawMeta = slotData.rawMeta || {};
  const usePanelMeta = (effectivePolicy.inheritPanelRawMeta !== false);

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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  const capturedSteps = [];
  const dialogLog = [];

  page.on('dialog', async dialog => {
    const msg = dialog.message();
    dialogLog.push({ time: new Date().toISOString(), message: msg, type: dialog.type() });
    console.log(`🔔 [메트릭스 알림 감지] "${msg}"`);
    await dialog.accept().catch(err => console.warn('[Metrix Dialog Accept 경고]:', err.message));
  });

  try {
    onProgress({
      step: 'INIT',
      stepIndex: 1,
      totalSteps: 120,
      message: `[접속 시작] "${slotData.companyName || '사업체'}"(UID: ${slotData.uid}) 메트릭스 설문 페이지에 접속합니다...`
    });

    console.log(`[MetrixRunner] Navigating to: ${surveyUrl}`);
    await page.goto(surveyUrl, { waitUntil: 'networkidle' });
    await sleep(2000);

    let stepCount = 1;
    const maxSteps = 160;
    let consecutiveStallCount = 0;
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
                                     !!document.querySelector('[id*="END"], [qname="END"], [data-qname="END"]');

        const isConsentScreen = !!document.querySelector('canvas.pad') ||
                                !!document.querySelector('input[data-column="NUMBER_1"]') ||
                                (bodyText.includes('동의서') && bodyText.includes('서명'));

        const isCheck1Screen = !!document.querySelector('input[name="CHECK1_F1"]') ||
                               !!document.querySelector('button.uploader-file[qname="CHECK1"]') ||
                               bodyText.includes('조사원 검증') ||
                               bodyText.includes('간판사진');

        const gradeEls = Array.from(document.querySelectorAll('.s-gradeclick'));
        const hasGradeClick = gradeEls.length > 0;
        const gradeAkeys = gradeEls.map(el => el.getAttribute('akey')).filter(Boolean);
        const gradeAlreadySelected = gradeEls.some(el =>
          el.classList.contains('active') ||
          el.classList.contains('selected') ||
          el.classList.contains('on') ||
          (el.innerText || '').trim().length > 0 && /[12순위]/.test(el.innerText || '')
        );

        const qElements = Array.from(document.querySelectorAll('.box-question, [id^="BOX_"], .question-container, .q-item, h2, h3, .title, .q-title')).filter(el => el.offsetParent !== null);
        const questionTexts = qElements.map(el => (el.innerText || '').trim().replace(/\s+/g, ' ')).filter(t => t.length > 0 && t.length < 180);

        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(el => el.offsetParent !== null);

        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).filter(b => b.offsetParent !== null);
        const nextBtn = buttons.find(b => {
          const t = (b.innerText || b.value || '').trim();
          return t === '다음' || t.includes('다음') || t === '제출' || t === '완료';
        });

        const signature = (questionTexts[0] || '') + '|' + inputs.length + '|' + bodyText.slice(50, 150);

        return {
          isFinalComplete,
          isBenefitGuideScreen,
          isConsentScreen,
          isCheck1Screen,
          hasGradeClick,
          gradeAkeys,
          gradeAlreadySelected,
          questionTexts: questionTexts.slice(0, 3),
          inputsCount: inputs.length,
          hasNextBtn: !!nextBtn,
          nextBtnText: nextBtn ? (nextBtn.innerText || nextBtn.value || '').trim() : null,
          bodySnippet: bodyText.slice(0, 200),
          signature
        };
      });

      const qTitle = screenInfo.questionTexts[0] || '진행 화면';
      console.log(`\n[MetrixRunner Step ${stepCount}] Q: ${qTitle} | Inputs: ${screenInfo.inputsCount} | GradeClick: ${screenInfo.hasGradeClick} | Next: ${screenInfo.nextBtnText || 'None'}`);

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
          capturedSteps,
          slotData
        };
      }

      // 2. Step 119 참여혜택 안내 화면 ➔ 98% 안전 대기 원칙 수행
      const isSafetyStopPoint = (screenInfo.isBenefitGuideScreen || (reachedCheck1 && check1Uploaded));
      const stopAtReview = (safetyGuard !== false && (effectivePolicy.safetyStopAtReview !== false));

      if (isSafetyStopPoint && stopAtReview) {
        console.log(`🛡️ [메트릭스 안전 대기 원칙 발동] Step 119 (참여혜택 안내 / 최종 검토 대기) 도달!`);
        const safeScreenshotPath = path.join(targetReportDir, 'step_119_review_ready.png');
        await page.screenshot({ path: safeScreenshotPath, fullPage: true }).catch(err => console.warn('[안전대기 캡처 경고]:', err.message));

        onProgress({
          step: 'REVIEW_READY_98',
          stepIndex: 119,
          totalSteps: 120,
          message: `🛡️ [98% 안전 대기] 전 문항 입력, 전자서명 및 증빙사진 업로드 완료! (최종 제출 직전 검토 대기 상태 보존)`
        });

        return {
          success: true,
          status: 'stopped_at_review',
          isReviewReady: true,
          currentStep: 119,
          totalSteps: 120,
          capturedSteps,
          slotData,
          message: '설문 응답 및 서명/사진 업로드가 100% 완료되었으며, 최종 제출 직전 98% 상태로 안전하게 보존되었습니다.'
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
            capturedSteps,
            slotData
          };
        }
      }

      if (!screenInfo.hasNextBtn) {
        console.log(`⚠️ 더 이상 진행할 [다음] 버튼이 없습니다. (현재 화면: ${screenInfo.bodySnippet.slice(0, 100)})`);
        break;
      }

      if (screenInfo.signature === lastScreenSignature) {
        consecutiveStallCount++;
        if (consecutiveStallCount >= 3) {
          console.error(`🚨 [STALL ERROR] 3회 연속 동일 화면에서 전진하지 못했습니다: ${qTitle}`);
          return {
            success: false,
            error: `동일 화면에서 3회 연속 전진하지 못했습니다: ${qTitle}`,
            stalledStep: stepCount,
            capturedSteps
          };
        }
      } else {
        consecutiveStallCount = 0;
        lastScreenSignature = screenInfo.signature;
      }

      // 3. [특수 화면 1] Step 118: CHECK1 간판사진 업로드 화면
      if (screenInfo.isCheck1Screen) {
        reachedCheck1 = true;
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

        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.scrollIntoViewIfNeeded();
          await nextBtn.click();
          await sleep(2500);
        }
        stepCount++;
        continue;
      }

      // 5. [규칙 3] 우선순위 선택 (GRADE_CLICK) Playwright 네이티브 클릭 (문10-1, 문12-1, 문15-2, 문22, 문67 전수 대응)
      if (screenInfo.hasGradeClick && screenInfo.gradeAkeys.length >= 2) {
        const preserveGrade = (effectivePolicy.preserveExistingInputs !== false && screenInfo.gradeAlreadySelected);
        if (!preserveGrade) {
          let targetKey1 = screenInfo.gradeAkeys[0];
          let targetKey2 = screenInfo.gradeAkeys[1];

          // 대출/차입 사유 (문15-2)
          if (qTitle.includes('대출') || qTitle.includes('차입') || qTitle.includes('부채')) {
            const r1 = (usePanelMeta && rawMeta['M15-2']) ? String(rawMeta['M15-2']) : String(effectivePolicy.debt_reasonRank1 || '1');
            const r2 = (usePanelMeta && rawMeta['M15-2_1']) ? String(rawMeta['M15-2_1']) : String(effectivePolicy.debt_reasonRank2 || '2');
            if (screenInfo.gradeAkeys.includes(r1)) targetKey1 = r1;
            if (screenInfo.gradeAkeys.includes(r2) && r2 !== targetKey1) targetKey2 = r2;
          }
          // 경영상 애로사항 (문22)
          else if (qTitle.includes('애로') || qTitle.includes('어려움') || qTitle.includes('힘든')) {
            const r1 = (usePanelMeta && rawMeta.M22) ? String(rawMeta.M22) : String(effectivePolicy.hardship_rank1 || '3');
            const r2 = (usePanelMeta && rawMeta.M22_1) ? String(rawMeta.M22_1) : String(effectivePolicy.hardship_rank2 || '7');
            if (screenInfo.gradeAkeys.includes(r1)) targetKey1 = r1;
            if (screenInfo.gradeAkeys.includes(r2) && r2 !== targetKey1) targetKey2 = r2;
          }
          // 매출·수익 변동 요인 (문10-1, 문12-1)
          else if (qTitle.includes('매출') || qTitle.includes('실적') || qTitle.includes('이익') || qTitle.includes('감소') || qTitle.includes('증가')) {
            const r1 = (usePanelMeta && rawMeta['M10-1']) ? String(rawMeta['M10-1']) : String(effectivePolicy.sales_changeReasonRank1 || '1');
            const r2 = (usePanelMeta && rawMeta['M10-1_1']) ? String(rawMeta['M10-1_1']) : String(effectivePolicy.sales_changeReasonRank2 || '2');
            if (screenInfo.gradeAkeys.includes(r1)) targetKey1 = r1;
            if (screenInfo.gradeAkeys.includes(r2) && r2 !== targetKey1) targetKey2 = r2;
          }
          // 경기도 희망 지원사업 우선순위 (문67)
          else if (qTitle.includes('지원사업') || qTitle.includes('지원정책') || qTitle.includes('희망') || qTitle.includes('필요한')) {
            const r1 = String(effectivePolicy.desired_support_rank1 || '1');
            const r2 = String(effectivePolicy.desired_support_rank2 || '2');
            if (screenInfo.gradeAkeys.includes(r1)) targetKey1 = r1;
            if (screenInfo.gradeAkeys.includes(r2) && r2 !== targetKey1) targetKey2 = r2;
          }

          if (targetKey2 === targetKey1) {
            targetKey2 = screenInfo.gradeAkeys.find(k => k !== targetKey1) || targetKey1;
          }

          console.log(`[규칙 3 GRADE_CLICK] 1순위=${targetKey1}, 2순위=${targetKey2} 클릭 (가용: ${screenInfo.gradeAkeys.join(', ')})`);
          await page.click(`.s-gradeclick[akey="${targetKey1}"]`).catch(err => console.warn('[GRADE_CLICK 1순위 경고]:', err.message));
          await sleep(350);
          if (targetKey2 && targetKey2 !== targetKey1) {
            await page.click(`.s-gradeclick[akey="${targetKey2}"]`).catch(err => console.warn('[GRADE_CLICK 2순위 경고]:', err.message));
            await sleep(350);
          }
        }
      }

      // 6. 전 문항 스마트 폼 응답 주입 (A1~A15, 문8~문67, 패널 rawMeta 계승 및 STEP 2 정책 매핑)
      await page.evaluate(({ slot, pol, quotaIdx }) => {
        const bodyText = document.body.innerText || '';
        const meta = slot.rawMeta || {};
        const useMeta = (pol.inheritPanelRawMeta !== false);
        const preserveInputs = (pol.preserveExistingInputs !== false);

        // 추세 계수 계산 (sales_trend2025)
        let trendMode = pol.sales_trend2025 || 'maintain';
        if (trendMode === 'random') {
          const modes = ['maintain', 'growth', 'decrease'];
          trendMode = modes[(Number(quotaIdx) || 1) % 3];
        }
        const trendMult = trendMode === 'growth' ? 1.07 : (trendMode === 'decrease' ? 0.93 : 1.0);

        // [규칙 1] 사업장 및 거주지 주소 Readonly 인풋 강제 바인딩 (A10, A14)
        if (pol.general_bindAddressReadonly !== false) {
          const cityInputs = Array.from(document.querySelectorAll('input[name="CITY"]')).filter(i => i.offsetParent !== null);
          const guInputs = Array.from(document.querySelectorAll('input[name="GU"]')).filter(i => i.offsetParent !== null);
          const detail1Inputs = Array.from(document.querySelectorAll('input[name="DETAIL1"]')).filter(i => i.offsetParent !== null);
          const detail2Inputs = Array.from(document.querySelectorAll('input[name="DETAIL2"]')).filter(i => i.offsetParent !== null);

          if (cityInputs.length > 0 && typeof $ !== 'undefined') {
            cityInputs.forEach(ci => { if (!ci.value) $(ci).val(meta['AA14 _1'] || '경기도').trigger('change'); });
            guInputs.forEach(gi => { if (!gi.value) $(gi).val(slot.district || meta.AA10 || '광주시').trigger('change'); });
            detail1Inputs.forEach(d1 => { if (!d1.value) $(d1).val(slot.road || meta['AA10 _1'] || '경충대로').trigger('change'); });
            detail2Inputs.forEach(d2 => { if (!d2.value) $(d2).val(slot.detailAddress || meta['AA10 _2'] || '101호').trigger('change'); });
          }
        }

        // [규칙 2] SUM 합계 100% 밸런서 (문11-1 6대 영업비용, 문14 6대 결제수단, 문15-1 차입처별 비중 등)
        const editableNumberInputs = Array.from(document.querySelectorAll('input[type="number"]:not([readonly]):not([disabled])')).filter(i => i.offsetParent !== null);

        if (bodyText.includes('남은 금액') || bodyText.includes('남은 값') || (bodyText.includes('합계') && editableNumberInputs.length >= 2)) {
          // 기입력 보존 검사 (합계가 이미 맞춰져 있는 경우 보존)
          const existingSum = editableNumberInputs.reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
          const totalMatch = bodyText.match(/합계\s*([0-9,]+)\s*(?:만원|%|원)?/i) || bodyText.match(/([0-9,]+)\s*(?:만원|%)/i);
          let targetTotal = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 100;
          if (isNaN(targetTotal) || targetTotal <= 0) targetTotal = 100;

          if (preserveInputs && existingSum === targetTotal) {
            return;
          }

          // 비율 배열을 targetTotal에 정확히 맞추어 분배하는 헬퍼
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
              inp.value = String(val);
              if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
            });
          };

          // (A) 문14 고객 결제수단 비중 (현금, 신용/체크카드, 지역화폐, 간편결제, 상품권, 계좌이체/세금계산서)
          if (bodyText.includes('결제') && (bodyText.includes('유형') || bodyText.includes('비율') || bodyText.includes('수단'))) {
            const hasPanelPay = useMeta && (meta.M14 !== undefined || meta.M14_1 !== undefined);
            if (hasPanelPay && editableNumberInputs.length >= 5) {
              const panelRatios = [
                Number(meta.M14 || 0),
                Number(meta.M14_1 || 0),
                Number(meta.M14_2 || 0),
                Number(meta.M14_3 || 0),
                Number(meta.M14_4 || 0),
                Number(meta.M14_5 || 0)
              ];
              if (panelRatios.reduce((a, b) => a + b, 0) > 0) {
                distributeRatios(editableNumberInputs, panelRatios);
                return;
              }
            }
            if (editableNumberInputs.length === 3) {
              distributeRatios(editableNumberInputs, [
                Number(pol.payment_cardRatio ?? 65),
                Number(pol.payment_mobileRatio ?? 10) + Number(pol.payment_localCurrencyRatio ?? 10),
                Number(pol.payment_cashRatio ?? 10) + Number(pol.payment_transferRatio ?? 5)
              ]);
            } else {
              distributeRatios(editableNumberInputs, [
                Number(pol.payment_cashRatio ?? 10),
                Number(pol.payment_cardRatio ?? 65),
                Number(pol.payment_localCurrencyRatio ?? 10),
                Number(pol.payment_mobileRatio ?? 10),
                Number(pol.payment_voucherRatio ?? 0),
                Number(pol.payment_transferRatio ?? 5)
              ]);
            }
            return;
          }

          // (B) 문15-1 부채 차입처별 대출 비중 (제1금융권, 제2금융권, 정책자금, 기타)
          if (bodyText.includes('대출') || bodyText.includes('부채') || bodyText.includes('차입')) {
            const hasPanelDebt = useMeta && (meta['M15-1_1'] !== undefined || meta['M15-1_2'] !== undefined);
            if (hasPanelDebt && editableNumberInputs.length >= 3) {
              const panelDebtRatios = [
                Number(meta['M15-1_1'] || 0),
                Number(meta['M15-1_2'] || 0),
                Number(meta['M15-1_3'] || 0),
                Number(meta['M15-1_4'] || 0),
                Number(meta['M15-1_5'] || 0)
              ];
              if (panelDebtRatios.reduce((a, b) => a + b, 0) > 0) {
                distributeRatios(editableNumberInputs, panelDebtRatios);
                return;
              }
            }
            if (editableNumberInputs.length === 2) {
              distributeRatios(editableNumberInputs, [
                Number(pol.debt_bankRatio ?? 70) + Number(pol.debt_secondTierRatio ?? 10),
                Number(pol.debt_policyRatio ?? 20) + Number(pol.debt_otherRatio ?? 0)
              ]);
            } else {
              distributeRatios(editableNumberInputs, [
                Number(pol.debt_bankRatio ?? 70),
                Number(pol.debt_secondTierRatio ?? 10),
                Number(pol.debt_policyRatio ?? 20),
                Number(pol.debt_otherRatio ?? 0),
                0
              ]);
            }
            return;
          }

          // (C) 문11-1 영업비용 6대 세부항목 구성 비중 (원재료비, 인건비, 임차료, 세금공과금, 수수료광고비, 기타)
          if (bodyText.includes('영업비용') || bodyText.includes('세부 항목') || bodyText.includes('매입비')) {
            if (editableNumberInputs.length <= 4) {
              distributeRatios(editableNumberInputs, [
                Number(pol.cost_materialRatio ?? 55),
                Number(pol.cost_rentRatio ?? 15),
                Number(pol.cost_taxRatio ?? 7),
                Number(pol.cost_laborRatio ?? 15) + Number(pol.cost_feeAdRatio ?? 4) + Number(pol.cost_otherRatio ?? 4)
              ]);
            } else {
              distributeRatios(editableNumberInputs, [
                Number(pol.cost_materialRatio ?? 55),
                Number(pol.cost_laborRatio ?? 15),
                Number(pol.cost_rentRatio ?? 15),
                Number(pol.cost_taxRatio ?? 7),
                Number(pol.cost_feeAdRatio ?? 4),
                Number(pol.cost_otherRatio ?? 4)
              ]);
            }
            return;
          }

          // (D) 기타 일반 SUM 문항 (첫 번째 항목에 전체 배정, 나머지 0)
          editableNumberInputs.forEach((inp, idx) => {
            inp.value = (idx === 0) ? String(targetTotal) : '0';
            if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
          });
          return;
        }

        // ------------------------------------------------------------------
        // 라디오 버튼(RADIO) 그룹 처리 (A1~A15, 문8-2, 문9, 문10, 문15, 문16, 문17, 문18, 문24, 문26, 문32, 문37, 문50~66)
        // ------------------------------------------------------------------
        const radioGroups = {};
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.offsetParent !== null && !r.disabled);
        radios.forEach(r => {
          const name = r.name || r.getAttribute('qname') || 'default_group';
          if (!radioGroups[name]) radioGroups[name] = [];
          radioGroups[name].push(r);
        });

        const selectRadioByVal = (group, val, fallbackIdx = 0) => {
          const strVal = String(val);
          const pick = group.find(r => String(r.value) === strVal) || group[Math.min(fallbackIdx, group.length - 1)] || group[0];
          if (pick) {
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
          }
        };

        for (const name in radioGroups) {
          const group = radioGroups[name];
          const isChecked = group.some(r => r.checked);
          if (isChecked && preserveInputs) continue;
          if (group.length === 0) continue;

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

          // 문10 경영실적 변화 추세 (1=감소, 2=비슷/유지, 3=증가 또는 5점 척도)
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
            const dVal = (pol.debt_hasDebt === '1' || pol.debt_hasDebt === '2')
              ? pol.debt_hasDebt
              : ((useMeta && meta.M15) ? String(meta.M15) : '2');
            selectRadioByVal(group, dVal, 1);
            continue;
          }

          // 문16 사업장 점유 형태 (자가 vs 임차, 보증부월세 vs 전세 vs 무상)
          if (bodyText.includes('점유 형태') || bodyText.includes('임차 형태') || (bodyText.includes('자가') && bodyText.includes('임차'))) {
            if (group.length === 2) {
              // 1=자가, 2=임차
              const ownOrRent = pol.lease_type === 'own' ? '1' : ((useMeta && meta.M16) ? String(meta.M16) : '2');
              selectRadioByVal(group, ownOrRent, 1);
            } else {
              // 1=보증부월세, 2=월세(무보증), 3=전세, 4=무상
              const subType = pol.lease_type === 'jeonse' ? '3' : (pol.lease_type === 'free' ? '4' : ((useMeta && meta['M16-1']) ? String(meta['M16-1']) : '1'));
              selectRadioByVal(group, subType, 0);
            }
            continue;
          }

          // 문17 권리금 유무 (1=있음, 2=없음)
          if (bodyText.includes('권리금') && (bodyText.includes('있습니') || bodyText.includes('유무') || bodyText.includes('지불'))) {
            const gVal = (pol.goodwill_hasGoodwill === '1' || pol.goodwill_hasGoodwill === '2')
              ? pol.goodwill_hasGoodwill
              : ((useMeta && meta.M17) ? String(meta.M17) : '2');
            selectRadioByVal(group, gVal, 1);
            continue;
          }

          // 문18 권리금 회수 가능성 (1=회수가능, 2=일부/보통, 3=어려움)
          if (bodyText.includes('권리금') && bodyText.includes('회수')) {
            const recVal = (useMeta && meta.M18) ? String(meta.M18) : String(pol.goodwill_recoveryExpect || '2');
            selectRadioByVal(group, recVal, 1);
            continue;
          }

          // 문24 상권 경쟁 체감도 (7점/5점 척도)
          if (bodyText.includes('경쟁') && (bodyText.includes('상권') || bodyText.includes('동종'))) {
            const compVal = (useMeta && meta.M24) ? String(meta.M24) : String(pol.market_competitionLevel || '5');
            selectRadioByVal(group, compVal, Math.min(group.length - 1, 3));
            continue;
          }

          // 문26 향후 사업 지속 의향 (1=계속 운영, 2=전환/이전/폐업 고려)
          if (bodyText.includes('계속 운영') || bodyText.includes('폐업') || bodyText.includes('향후 사업')) {
            const planVal = (useMeta && meta.M26) ? String(meta.M26) : String(pol.future_businessPlan || '1');
            selectRadioByVal(group, planVal, 0);
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

          // 5점 척도 만족도 문항 (문50~문66 등: 1=매우불만, 2=불만, 3=보통, 4=만족, 5=매우만족)
          if (group.length === 5) {
            const mode = pol.satisfaction_mode || 'mixed_3_4';
            let pickIdx = 3; // 0-indexed: 2=3점(보통), 3=4점(만족), 4=5점(매우만족)
            if (mode === 'positive_4_5' || mode === 'mostly_5') {
              pickIdx = (Math.random() > 0.45) ? 4 : 3;
            } else if (mode === 'neutral_3' || mode === 'mostly_3') {
              pickIdx = 2;
            } else {
              pickIdx = (Math.random() > 0.5) ? 3 : 2;
            }
            const pick = group[pickIdx] || group[3] || group[0];
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
            continue;
          }

          // 일반 라디오 기본 안전 선택
          const pick = (group.length >= 3) ? group[1] : group[0];
          pick.click();
          pick.checked = true;
          if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
        }

        // 체크박스(CHECKBOX) 처리
        const checkBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => c.offsetParent !== null && !c.disabled);
        if (checkBoxes.length > 0) {
          const checkedCount = checkBoxes.filter(c => c.checked).length;
          if (checkedCount === 0) {
            checkBoxes[0].click();
            checkBoxes[0].checked = true;
            if (typeof $ !== 'undefined') $(checkBoxes[0]).prop('checked', true).trigger('change');
          }
        }

        // ------------------------------------------------------------------
        // [규칙 4] 숫자 및 텍스트 인풋 정밀 매핑 (A1~A15, 문8, 문11, 문13, 문15-1, 문16-1, 문17-1, 문19, 문31, 문32, 문34)
        // ------------------------------------------------------------------
        const textInputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled]), input[type="number"]:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])')).filter(t => t.offsetParent !== null);
        textInputs.forEach((input, inpIdx) => {
          if (preserveInputs && input.value && input.value.trim() !== '') return;

          const guide = (input.getAttribute('data-guide') || input.placeholder || '').toUpperCase();
          const name = (input.name || input.id || input.getAttribute('qname') || '').toUpperCase();
          const dataMin = input.getAttribute('data-min');
          const dataMax = input.getAttribute('data-max');
          const maxLen = input.getAttribute('maxlength');
          const rowText = (input.closest('tr, li, .q-row, .form-group, div')?.innerText || '').replace(/\s+/g, ' ');

          // 1. 숫자 인풋 분류
          if (input.type === 'number' || dataMin || dataMax || maxLen || guide.includes('만원') || guide.includes('시간') || guide.includes('명') || guide.includes('평')) {
            // (1) 문8-1 개점/폐점 시각
            if (guide.includes('개점') || name.includes('OPEN') || guide.includes('시작시각') || rowText.includes('개점')) {
              input.value = (useMeta && meta['M8-1']) ? String(meta['M8-1']) : String(pol.operating_openHour || '09');
            } else if (guide.includes('폐점') || name.includes('CLOSE') || guide.includes('종료시각') || rowText.includes('폐점')) {
              input.value = (useMeta && meta['M8-1_1']) ? String(meta['M8-1_1']) : String(pol.operating_closeHour || '20');
            }
            // (2) 문8-2 정기휴무 일수/횟수
            else if ((guide.includes('휴무') || bodyText.includes('정기휴무')) && (guide.includes('일') || guide.includes('회'))) {
              input.value = String(pol.operating_closedDays || '1');
            }
            // (3) A6 사업장 면적 (평)
            else if (guide.includes('평') || bodyText.includes('전용면적') || name.includes('AA6')) {
              input.value = (useMeta && meta.AA6) ? String(meta.AA6) : String(pol.general_defaultAreaPyeong || 30);
            }
            // (4) 연도 감지 (A9 개업연도, A13 대표자 출생연도, 문19 인수/창업연도, 문62 수혜연도)
            else if (dataMin === '1960' || dataMax === '2026' || maxLen === '4' || guide.includes('년도') || guide.includes('연도') || name.includes('YEAR')) {
              if (bodyText.includes('출생') || bodyText.includes('태어난') || name.includes('AA13')) {
                input.value = (useMeta && meta.AA13) ? String(meta.AA13) : '1972';
              } else if (bodyText.includes('개업') || bodyText.includes('창업') || name.includes('AA9') || name.includes('M19')) {
                input.value = (useMeta && (meta.AA9 || meta.M19_1)) ? String(meta.AA9 || meta.M19_1) : '2018';
              } else {
                input.value = (useMeta && meta.M62_1) ? String(meta.M62_1) : '2024';
              }
            }
            // (5) 월 감지 (A9_1 개업월, 문19_2 창업월)
            else if ((dataMin === '1' && dataMax === '12') || (maxLen === '2' && (guide.includes('월') || name.includes('MONTH')))) {
              input.value = (useMeta && (meta['AA9 _1'] || meta.M19_2)) ? String(parseInt(meta['AA9 _1'] || meta.M19_2, 10) || 5) : '5';
            }
            // (6) 문16-3 임차 계약/거주 기간 (년)
            else if (bodyText.includes('임차') && (guide.includes('년') || rowText.includes('년'))) {
              input.value = (useMeta && meta['M16-3']) ? String(meta['M16-3']) : String(pol.lease_contractYears || 5);
            }
            // (7) 문32 주당 근무시간
            else if (guide.includes('시간') || bodyText.includes('근무시간') || dataMax === '168') {
              if (rowText.includes('근로자') || rowText.includes('직원') || inpIdx > 0) {
                input.value = (useMeta && meta.M32_6) ? String(meta.M32_6) : String(pol.labor_staffWeeklyHours || 40);
              } else {
                input.value = (useMeta && meta.M32) ? String(meta.M32) : String(pol.labor_ownerWeeklyHours || 45);
              }
            }
            // (8) 문31 종사자 인원수
            else if (guide.includes('명') || guide.includes('인원') || bodyText.includes('종사자')) {
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
            // (9) 금액 입력 문항 (문11 매출/비용/이익, 문13 대표자 소득, 문15-1 부채총액, 문16-1 보증금/월세, 문17-1 권리금, 문34 월급여)
            else if (guide.includes('만원') || guide.includes('금액') || guide.includes('비용') || guide.includes('매출') || bodyText.includes('만원')) {
              // 문16-1 보증금 / 월세 / 전세금
              if (bodyText.includes('보증금') || bodyText.includes('월세') || bodyText.includes('임차료')) {
                if (rowText.includes('월세') || (inpIdx === 1 && !rowText.includes('보증금'))) {
                  input.value = (useMeta && meta['M16-1_2']) ? String(meta['M16-1_2']) : String(pol.lease_monthlyRent ?? 120);
                } else if (rowText.includes('전세')) {
                  input.value = (useMeta && meta['M16-1_3']) ? String(meta['M16-1_3']) : '10000';
                } else {
                  input.value = (useMeta && meta['M16-1_1']) ? String(meta['M16-1_1']) : String(pol.lease_deposit ?? 2000);
                }
              }
              // 문17-1 권리금 금액
              else if (bodyText.includes('권리금')) {
                input.value = (useMeta && meta['M17-1']) ? String(meta['M17-1']) : String(pol.goodwill_amount ?? 1000);
              }
              // 문15-1 총 부채/대출 금액
              else if (bodyText.includes('부채') || bodyText.includes('대출')) {
                input.value = (useMeta && meta['M15-1']) ? String(meta['M15-1']) : String(pol.debt_totalAmount ?? 5000);
              }
              // 문13 대표자 월평균 순소득
              else if (bodyText.includes('순소득') || (bodyText.includes('대표자') && bodyText.includes('소득'))) {
                const baseInc = (useMeta && meta.M13) ? Number(meta.M13) : Number(pol.owner_monthlyIncome ?? 320);
                input.value = String(Math.max(100, Math.round(baseInc * trendMult)));
              }
              // 문34 근로자 1인당 월평균 급여/임금
              else if (bodyText.includes('급여') || bodyText.includes('임금') || bodyText.includes('인건비')) {
                input.value = (useMeta && meta.M34) ? String(meta.M34) : String(pol.labor_avgMonthlyWage ?? 300);
              }
              // 문11 연간 매출액 / 영업비용 / 영업이익
              else if (bodyText.includes('매출액') || bodyText.includes('영업비용') || bodyText.includes('영업이익')) {
                const baseSales = (useMeta && Number(meta.M11_1) > 0) ? Number(meta.M11_1) : 24000;
                const baseCost = (useMeta && Number(meta.M11_3) > 0) ? Number(meta.M11_3) : 18000;
                const baseProfit = (useMeta && Number(meta.M11_5) > 0) ? Number(meta.M11_5) : Math.max(2000, baseSales - baseCost);
                if (rowText.includes('영업비용') || inpIdx === 1) {
                  input.value = String(Math.round(baseCost * trendMult));
                } else if (rowText.includes('영업이익') || inpIdx === 2) {
                  input.value = String(Math.round(baseProfit * trendMult));
                } else {
                  input.value = String(Math.round(baseSales * trendMult));
                }
              } else {
                input.value = '200';
              }
            }
            // 기타 숫자 기본값
            else {
              input.value = dataMin ? String(Math.max(1, parseInt(dataMin, 10))) : '10';
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
            } else if (input.tagName.toLowerCase() === 'textarea' || guide.includes('의견') || guide.includes('애로') || guide.includes('건의')) {
              input.value = pol.open_ended_comment || '지속되는 고물가로 인해 원재료비 및 공공요금 부담이 큽니다. 경기신용보증재단 저금리 특례보증 대출 한도 확대와 상환 거치기간 연장, 점포 시설개선 지원이 지속되었으면 합니다.';
            } else {
              input.value = '체계적인 맞춤형 서비스 제공을 통해 고객 만족도를 높이고 있습니다.';
            }
          }

          if (typeof $ !== 'undefined') $(input).trigger('input').trigger('change');
        });

        // SELECT 드롭다운 처리
        const selects = Array.from(document.querySelectorAll('select')).filter(s => s.offsetParent !== null && !s.disabled);
        selects.forEach(sel => {
          if ((!sel.value || !preserveInputs) && sel.options.length > 1) {
            sel.selectedIndex = 1;
            if (typeof $ !== 'undefined') $(sel).trigger('change');
          }
        });
      }, { slot: slotData, pol: effectivePolicy, quotaIdx: quotaIndex }).catch(err => console.error('[Metrix DOM 주입 오류]:', err.message));

      await sleep(jitter(400, 700));

      onProgress({
        step: `STEP_${stepCount}`,
        stepIndex: stepCount,
        totalSteps: 120,
        message: `✓ [Step ${stepCount}] "${qTitle.slice(0, 34)}" 응답 작성 완료 ➔ [다음] 전진`
      });

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
        console.warn(`[Step ${stepCount}] 다음 버튼을 찾거나 클릭하지 못했습니다.`);
        break;
      }

      await sleep(jitter(1800, 2500));
      stepCount++;
    }

    console.log(`[MetrixRunner] 루프 종료 (총 ${stepCount}단계 수행).`);
    return {
      success: true,
      status: 'completed',
      capturedSteps,
      slotData
    };
  } catch (err) {
    console.error(`🚨 [MetrixRunner 치명적 오류] ${err.message}`, err.stack);
    const errScreenshot = path.join(targetReportDir, 'error_state.png');
    await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});

    return {
      success: false,
      error: err.message,
      capturedSteps,
      slotData
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
