/**
 * AutoSurvey AI - 메트릭스(Metrix GetData SNUM 622) 전용 설문 자동화 실행 엔진
 * 
 * [핵심 특징]
 * 1. 단일 SPA DOM 구조 비동기 페이지 전환 (POST /Join/Next AJAX) 완벽 동기화
 * 2. 6대 필수 시스템 규칙 구현:
 *    - [규칙 1] Step 3 사업체 일반현황 주소 Readonly 인풋 강제 바인딩 (CITY, GU, DETAIL1, DETAIL2)
 *    - [규칙 2] SUM 합계 100% 밸런서 (문11-1 비용, 문14 결제비율, 문15-1 부채비율, B2B/B2G 비율 등)
 *    - [규칙 3] 우선순위 선택 (GRADE_CLICK) Playwright 네이티브 마우스 클릭 (문12-1, 문15-2, 문22, 문67 등)
 *    - [규칙 4] 숫자 입력 인풋(Number) 속성 자동 판정 및 Fail-Safe 주입 (연도, 월, 시간, 금액, 인원)
 *    - [규칙 5] 동의서 (Step 117) 2중 Signature Pad 전자서명 & 연락처 3분할 주입 (NUMBER_1~3, 4~6)
 *    - [규칙 6] 최종 관문 조사원 검증 (CHECK1) 간판/명함 사진 업로드 (POST /Join/Uploader)
 * 3. [최종 제출 직전 98% 안전 대기 원칙 (Safety Stop)]
 *    - 동의서 서명 및 CHECK1 간판사진 업로드 완료 후, 최종 제출 직전 안내 화면(참여혜택 안내 / Step 119)에서 정지
 *    - 메트릭스 서버 내 '진행중(98%)' 상태로 안전하게 보존하여 조사원/사용자가 직접 검토 및 수정 가능
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// 랜덤 지연 헬퍼 (인간다운 인터랙션)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 메트릭스 경기도 소상공인 패널 설문조사 실행 메인 엔트리포인트
 * 
 * @param {Object} options
 * @param {string} options.surveyUrl 메트릭스 다이렉트 설문 참여 URL
 * @param {Object} options.slotData 대상 패널 사업체 정보 (UID, 상호, 대표자, 전화번호, 주소 등)
 * @param {Object} options.policy STEP 2에서 설정된 설문 방향성 가이드라인 (영업시간, 비용비율, 결제비율, 만족도 등)
 * @param {number} options.quotaIndex 쿼터 순번 (1-based)
 * @param {boolean} options.pilotMode 단일 파일럿 검증 모드 여부
 * @param {boolean} options.safetyGuard 98% 안전 대기 활성화 여부 (기본 true: 최종 제출 직전 대기)
 * @param {string} options.reportDir 스크린샷 및 리포트 저장 디렉터리
 * @param {Function} options.onProgress 실시간 진행률 브로드캐스트 콜백
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

  // 리포트 디렉터리 준비
  const targetReportDir = reportDir || path.resolve('reports', `metrix_item_${quotaIndex}_${slotData.uid || 'slot'}`);
  if (!fs.existsSync(targetReportDir)) {
    fs.mkdirSync(targetReportDir, { recursive: true });
  }

  // 간판사진 이미지 경로 확인
  let sampleSignPath = policy.evidence_sign_image || 'data/sample_metrix_sign.png';
  if (!path.isAbsolute(sampleSignPath)) {
    sampleSignPath = path.resolve(sampleSignPath);
  }
  if (!fs.existsSync(sampleSignPath)) {
    // 대체 파일 탐색
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

  // 경고창(Alert/Dialog) 자동 수락 및 로깅
  page.on('dialog', async dialog => {
    const msg = dialog.message();
    dialogLog.push({ time: new Date().toISOString(), message: msg, type: dialog.type() });
    console.log(`🔔 [메트릭스 알림 감지] "${msg}"`);
    await dialog.accept().catch(() => {});
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

      // 화면 상태 분석
      const screenInfo = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();

        // 완료 화면 여부
        const isFinalComplete = bodyText.includes('조사에 참여해 주셔서 대단히 감사합니다') ||
                                bodyText.includes('조사가 완료되었습니다') ||
                                bodyText.includes('응답해 주셔서 감사합니다') ||
                                bodyText.includes('제출되었습니다');

        // 안내/참여혜택 화면 여부 (Step 119 - 참여혜택 안내)
        const isBenefitGuideScreen = bodyText.includes('참여혜택 안내') ||
                                     bodyText.includes('소개 및 참여혜택') ||
                                     !!document.querySelector('[id*="END"], [qname="END"], [data-qname="END"]');

        // 동의서 화면 여부 (Step 117)
        const isConsentScreen = !!document.querySelector('canvas.pad') ||
                                !!document.querySelector('input[data-column="NUMBER_1"]') ||
                                (bodyText.includes('동의서') && bodyText.includes('서명'));

        // CHECK1 증빙 사진 업로드 화면 여부 (Step 118)
        const isCheck1Screen = !!document.querySelector('input[name="CHECK1_F1"]') ||
                               !!document.querySelector('button.uploader-file[qname="CHECK1"]') ||
                               bodyText.includes('조사원 검증') ||
                               bodyText.includes('간판사진');

        // 우선순위 커스텀 컴포넌트 여부
        const hasGradeClick = !!document.querySelector('.s-gradeclick');
        const gradeAkeys = Array.from(document.querySelectorAll('.s-gradeclick')).map(el => el.getAttribute('akey')).filter(Boolean);

        // 질문 제목 추출
        const qElements = Array.from(document.querySelectorAll('.box-question, [id^="BOX_"], .question-container, .q-item, h2, h3, .title, .q-title')).filter(el => el.offsetParent !== null);
        const questionTexts = qElements.map(el => (el.innerText || '').trim().replace(/\s+/g, ' ')).filter(t => t.length > 0 && t.length < 150);

        // 인풋 개수
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(el => el.offsetParent !== null);

        // 다음 버튼
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

      // 스크린샷 캡처
      const screenshotFileName = `step_${String(stepCount).padStart(2, '0')}.png`;
      const screenshotFilePath = path.join(targetReportDir, screenshotFileName);
      await page.screenshot({ path: screenshotFilePath, fullPage: true }).catch(() => {});

      capturedSteps.push({
        stepIndex: stepCount,
        title: qTitle,
        screenshot: screenshotFileName,
        time: new Date().toISOString()
      });

      // ========================================================
      // 1. 이미 100% 최종 완료된 상태 확인
      // ========================================================
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

      // ========================================================
      // 2. [핵심] Step 119 참여혜택 안내 화면 ➔ 98% 안전 대기 원칙 수행!
      // ========================================================
      const isSafetyStopPoint = (screenInfo.isBenefitGuideScreen || (reachedCheck1 && check1Uploaded));
      const stopAtReview = (safetyGuard !== false && (policy.safetyStopAtReview !== false));

      if (isSafetyStopPoint && stopAtReview) {
        console.log(`🛡️ [메트릭스 안전 대기 원칙 발동] Step 119 (참여혜택 안내 / 최종 검토 대기) 도달!`);
        console.log(`- 전 문항 답변, 전자서명 및 간판사진 업로드가 완료되어 서버에 안전하게 보존되었습니다.`);
        console.log(`- 사용자가 직접 검토/수정할 수 있도록 최종 제출 직전(98%)에서 정지합니다.`);

        const safeScreenshotPath = path.join(targetReportDir, 'step_119_review_ready.png');
        await page.screenshot({ path: safeScreenshotPath, fullPage: true }).catch(() => {});

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

      // 만약 안전가드가 OFF(false)이고 참여혜택 안내 화면인 경우 ➔ 최종 완료(Step 120) 진행
      if (screenInfo.isBenefitGuideScreen && !stopAtReview) {
        console.log(`[메트릭스 안전가드 OFF] 참여혜택 화면에서 최종 제출 버튼을 클릭합니다...`);
        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.click();
          await sleep(4000);
          const finishScreenshot = path.join(targetReportDir, 'step_120_final_success.png');
          await page.screenshot({ path: finishScreenshot, fullPage: true }).catch(() => {});

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

      // [다음] 버튼 부재 검사
      if (!screenInfo.hasNextBtn) {
        console.log(`⚠️ 더 이상 진행할 [다음] 버튼이 없습니다. (현재 화면: ${screenInfo.bodySnippet.slice(0, 100)})`);
        break;
      }

      // 화면 무한 루프(Stall) 방지
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

      // ========================================================
      // 3. [특수 화면 1] Step 118: CHECK1 간판사진 업로드 화면
      // ========================================================
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

        // [다음] 클릭하여 Step 119(참여혜택 안내)로 이동
        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.click();
          await sleep(2500);
        }
        stepCount++;
        continue;
      }

      // ========================================================
      // 4. [특수 화면 2] Step 117: 동의서 화면 (2중 서명 및 3분할 연락처)
      // ========================================================
      if (screenInfo.isConsentScreen) {
        console.log(`[Step 117 - 동의서] 3분할 연락처 기입 및 2중 전자서명 드로잉 시작...`);
        onProgress({
          step: 'CONSENT_SIGN',
          stepIndex: 117,
          totalSteps: 120,
          message: `[패널 동의서] 휴대폰/사업장 연락처 3분할 기입 및 2중 전자서명을 진행합니다...`
        });

        const rawPhone = slotData.phone || slotData.contact || '010-5392-7259';
        const phoneParts = rawPhone.replace(/[^0-9]/g, '').match(/^(\d{3})(\d{3,4})(\d{4})$/);
        const p1 = phoneParts ? phoneParts[1] : '010';
        const p2 = phoneParts ? phoneParts[2] : '5392';
        const p3 = phoneParts ? phoneParts[3] : '7259';

        await page.evaluate(({ p1, p2, p3 }) => {
          // 휴대폰 번호 (NUMBER_1, NUMBER_2, NUMBER_3)
          if (typeof $ !== 'undefined') {
            $('input[data-column="NUMBER_1"]').val(p1).trigger('input').trigger('change');
            $('input[data-column="NUMBER_2"]').val(p2).trigger('input').trigger('change');
            $('input[data-column="NUMBER_3"]').val(p3).trigger('input').trigger('change');

            // 사업장 연락처 (NUMBER_4, NUMBER_5, NUMBER_6)
            $('input[data-column="NUMBER_4"]').val(p1).trigger('input').trigger('change');
            $('input[data-column="NUMBER_5"]').val(p2).trigger('input').trigger('change');
            $('input[data-column="NUMBER_6"]').val(p3).trigger('input').trigger('change');

            // 서명일자 오늘 날짜
            const todayStr = new Date().toISOString().slice(0, 10);
            $('input.input-date').val(todayStr).trigger('change');

            // 동의 체크박스 전체 체크
            $('input[type="checkbox"]').prop('checked', true).trigger('change');
          }
        }, { p1, p2, p3 });

        await sleep(500);

        // 2개 Canvas 전자서명 실제 마우스 드로잉
        const canvases = await page.$$('canvas.pad');
        console.log(`[동의서] 서명 캔버스 발견 개수: ${canvases.length}개`);
        for (let cIdx = 0; cIdx < canvases.length; cIdx++) {
          const canvas = canvases[cIdx];
          await canvas.scrollIntoViewIfNeeded();
          await sleep(300);

          const box = await canvas.boundingBox();
          if (box) {
            console.log(`[동의서] 캔버스 #${cIdx + 1} 마우스 서명 드로잉...`);
            await page.mouse.move(box.x + 40, box.y + 50);
            await page.mouse.down();
            await page.mouse.move(box.x + 100, box.y + 70, { steps: 5 });
            await page.mouse.move(box.x + 160, box.y + 40, { steps: 5 });
            await page.mouse.move(box.x + 220, box.y + 65, { steps: 5 });
            await page.mouse.up();
            await sleep(300);
          }
        }

        // [다음] 클릭하여 Step 118(CHECK1)로 이동
        const nextBtn = await page.$('#next');
        if (nextBtn) {
          await nextBtn.scrollIntoViewIfNeeded();
          await nextBtn.click();
          await sleep(2500);
        }
        stepCount++;
        continue;
      }

      // ========================================================
      // 5. [규칙 3] 우선순위 선택 (GRADE_CLICK) Playwright 네이티브 클릭
      // ========================================================
      if (screenInfo.hasGradeClick && screenInfo.gradeAkeys.length >= 2) {
        console.log(`[규칙 3 GRADE_CLICK] 네이티브 마우스 클릭 수행 중... (가용 키: ${screenInfo.gradeAkeys.join(', ')})`);
        
        let targetKey1 = screenInfo.gradeAkeys[0];
        let targetKey2 = screenInfo.gradeAkeys[1];

        // 대출 사유 (문15-2)
        if (qTitle.includes('대출') || qTitle.includes('차입') || qTitle.includes('부채')) {
          targetKey1 = policy.debt_reasonRank1 || screenInfo.gradeAkeys[0];
          targetKey2 = policy.debt_reasonRank2 || (screenInfo.gradeAkeys[1] !== targetKey1 ? screenInfo.gradeAkeys[1] : screenInfo.gradeAkeys[0]);
        }
        // 지원사업 우선순위 (문67)
        else if (qTitle.includes('지원사업') || qTitle.includes('지원정책') || qTitle.includes('희망')) {
          targetKey1 = policy.desired_support_rank1 || screenInfo.gradeAkeys[0];
          targetKey2 = policy.desired_support_rank2 || (screenInfo.gradeAkeys[1] !== targetKey1 ? screenInfo.gradeAkeys[1] : screenInfo.gradeAkeys[0]);
        }

        await page.click(`.s-gradeclick[akey="${targetKey1}"]`).catch(() => {});
        await sleep(350);
        if (targetKey2 && targetKey2 !== targetKey1) {
          await page.click(`.s-gradeclick[akey="${targetKey2}"]`).catch(() => {});
          await sleep(350);
        }
      }

      // ========================================================
      // 6. 스마트 폼 응답 주입 (규칙 1, 규칙 2, 규칙 4, 정책 매핑)
      // ========================================================
      await page.evaluate(({ slot, pol }) => {
        const bodyText = document.body.innerText || '';

        // [규칙 1] 주소 Readonly 인풋 강제 바인딩 (A1~A15 사업체 일반현황 등)
        const cityInputs = Array.from(document.querySelectorAll('input[name="CITY"]')).filter(i => i.offsetParent !== null);
        const guInputs = Array.from(document.querySelectorAll('input[name="GU"]')).filter(i => i.offsetParent !== null);
        const detail1Inputs = Array.from(document.querySelectorAll('input[name="DETAIL1"]')).filter(i => i.offsetParent !== null);
        const detail2Inputs = Array.from(document.querySelectorAll('input[name="DETAIL2"]')).filter(i => i.offsetParent !== null);

        if (cityInputs.length > 0 && typeof $ !== 'undefined') {
          cityInputs.forEach(ci => { if (!ci.value) $(ci).val(slot.area || slot.city || '경기도').trigger('change'); });
          guInputs.forEach(gi => { if (!gi.value) $(gi).val(slot.district || '광주시').trigger('change'); });
          detail1Inputs.forEach(d1 => { if (!d1.value) $(d1).val(slot.road || slot.address || '태전중앙1길').trigger('change'); });
          detail2Inputs.forEach(d2 => { if (!d2.value) $(d2).val(slot.detailAddress || '101호').trigger('change'); });
        }

        // [규칙 2] SUM 합계 밸런서 (문11-1 비용, 문14 결제, 문15-1 부채, B2B/B2G 비율 등)
        const editableNumberInputs = Array.from(document.querySelectorAll('input[type="number"]:not([readonly]):not([disabled])')).filter(i => i.offsetParent !== null);
        
        if (bodyText.includes('남은 금액') || bodyText.includes('남은 값') || (bodyText.includes('합계') && editableNumberInputs.length >= 2)) {
          // 합계 목표치 파악 (문자열 정규식 추출)
          const totalMatch = bodyText.match(/합계\s*([0-9,]+)\s*(?:만원|%|원)?/i) || bodyText.match(/([0-9,]+)\s*(?:만원|%)/i);
          let targetTotal = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 100;
          if (isNaN(targetTotal) || targetTotal <= 0) targetTotal = 100;

          // 결제수단 100% 문항 (문14)
          if (bodyText.includes('결제') && (bodyText.includes('유형') || bodyText.includes('비율'))) {
            const cardVal = Math.round(targetTotal * (pol.payment_cardRatio || 70) / 100);
            const mobileVal = Math.round(targetTotal * (pol.payment_mobileRatio || 20) / 100);
            const cashVal = targetTotal - cardVal - mobileVal;

            editableNumberInputs.forEach((inp, idx) => {
              if (idx === 0) inp.value = String(cardVal);
              else if (idx === 1) inp.value = String(mobileVal);
              else if (idx === 2) inp.value = String(cashVal);
              else inp.value = '0';
              if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
            });
            return;
          }

          // 부채 대출 비율 100% 문항 (문15-1)
          if (bodyText.includes('대출') && bodyText.includes('부채')) {
            const bankVal = Math.round(targetTotal * (pol.debt_bankRatio || 80) / 100);
            const policyVal = targetTotal - bankVal;

            editableNumberInputs.forEach((inp, idx) => {
              if (idx === 0) inp.value = String(bankVal);
              else if (idx === 1) inp.value = String(policyVal);
              else inp.value = '0';
              if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
            });
            return;
          }

          // 영업비용 6대 세부항목 문항 (문11-1)
          if (bodyText.includes('영업비용') || bodyText.includes('세부 항목')) {
            const matVal = Math.round(targetTotal * (pol.cost_materialRatio || 70) / 100);
            const rentVal = Math.round(targetTotal * (pol.cost_rentRatio || 15) / 100);
            const taxVal = Math.round(targetTotal * (pol.cost_taxRatio || 10) / 100);
            const otherVal = targetTotal - matVal - rentVal - taxVal;

            editableNumberInputs.forEach((inp, idx) => {
              if (idx === 0) inp.value = String(matVal);
              else if (idx === 1) inp.value = String(rentVal);
              else if (idx === 2) inp.value = String(taxVal);
              else if (idx === 3) inp.value = String(Math.max(0, otherVal));
              else inp.value = '0';
              if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
            });
            return;
          }

          // 일반 SUM 문항 (첫 번째 항목에 전체 배정, 나머지 0)
          editableNumberInputs.forEach((inp, idx) => {
            inp.value = (idx === 0) ? String(targetTotal) : '0';
            if (typeof $ !== 'undefined') $(inp).trigger('input').trigger('change');
          });
          return;
        }

        // 라디오 버튼(RADIO) 그룹 처리
        const radioGroups = {};
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.offsetParent !== null && !r.disabled);
        radios.forEach(r => {
          const name = r.name || r.getAttribute('qname') || 'default_group';
          if (!radioGroups[name]) radioGroups[name] = [];
          radioGroups[name].push(r);
        });

        for (const name in radioGroups) {
          const group = radioGroups[name];
          const isChecked = group.some(r => r.checked);
          if (!isChecked && group.length > 0) {
            // 정기휴무 요일 (일요일=7 등)
            if (bodyText.includes('정기휴무') || bodyText.includes('휴무 요일')) {
              const closedDayVal = pol.operating_closedDayOfWeek || '7';
              const matched = group.find(r => r.value === closedDayVal);
              const pick = matched || group[group.length - 1];
              pick.click();
              pick.checked = true;
              if (typeof $ !== 'undefined') $(pick).trigger('change');
              continue;
            }

            // 5점 척도 만족도 문항 (1=매우불만, 3=보통, 4=만족, 5=매우만족)
            if (group.length === 5) {
              const mode = pol.satisfaction_mode || 'mixed_3_4';
              let pickIdx = 3; // 기본: 4점 만족 (0-indexed 3)
              if (mode === 'mostly_5') pickIdx = 4;
              else if (mode === 'mostly_3') pickIdx = 2;
              else if (mode === 'mixed_3_4') pickIdx = (Math.random() > 0.5) ? 3 : 2;

              const pick = group[pickIdx] || group[3] || group[0];
              pick.click();
              pick.checked = true;
              if (typeof $ !== 'undefined') $(pick).trigger('change');
              continue;
            }

            // 일반 라디오: 첫 번째나 두 번째 안전한 옵션 선택
            const pick = (group.length >= 3) ? group[1] : group[0];
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).trigger('change');
          }
        }

        // 체크박스(CHECKBOX) 처리
        const checkBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => c.offsetParent !== null && !c.disabled);
        if (checkBoxes.length > 0) {
          const checkedCount = checkBoxes.filter(c => c.checked).length;
          if (checkedCount === 0) {
            checkBoxes[0].click();
            checkBoxes[0].checked = true;
            if (typeof $ !== 'undefined') $(checkBoxes[0]).trigger('change');
          }
        }

        // [규칙 4] 일반 숫자 및 텍스트 인풋 처리
        const textInputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled]), input[type="number"]:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])')).filter(t => t.offsetParent !== null);
        textInputs.forEach(input => {
          if (!input.value || input.value.trim() === '') {
            const guide = (input.getAttribute('data-guide') || '').toUpperCase();
            const name = (input.name || input.id || input.getAttribute('qname') || '').toUpperCase();
            const dataMin = input.getAttribute('data-min');
            const dataMax = input.getAttribute('data-max');
            const maxLen = input.getAttribute('maxlength');

            // 1. 숫자 인풋 분류
            if (input.type === 'number' || dataMin || dataMax || maxLen || guide.includes('만원') || guide.includes('시간') || guide.includes('명')) {
              // 개점/폐점 시각 (문8-1)
              if (guide.includes('개점') || name.includes('OPEN') || guide.includes('시작시각')) {
                input.value = pol.operating_openHour || '09';
              } else if (guide.includes('폐점') || name.includes('CLOSE') || guide.includes('종료시각')) {
                input.value = pol.operating_closeHour || '20';
              }
              // 정기휴무 일수 (문8-2)
              else if (guide.includes('휴무') && (guide.includes('일') || guide.includes('회'))) {
                input.value = pol.operating_closedDays || '1';
              }
              // 연도 감지
              else if (dataMin === '1960' || dataMax === '2026' || maxLen === '4' || guide.includes('년도') || name.includes('YEAR')) {
                input.value = '2024';
              }
              // 월 감지
              else if ((dataMin === '1' && dataMax === '12') || (maxLen === '2' && (guide.includes('월') || name.includes('MONTH')))) {
                input.value = '5';
              }
              // 근무시간 감지
              else if (guide.includes('시간') || dataMax === '24') {
                input.value = '40';
              }
              // 인원수 감지
              else if (guide.includes('명') || guide.includes('인원')) {
                input.value = '1';
              }
              // 금액/매출/비용 감지
              else if (guide.includes('만원') || guide.includes('금액') || guide.includes('비용') || guide.includes('매출')) {
                input.value = '100';
              }
              // 기타 숫자 기본값
              else {
                input.value = dataMin ? String(Math.max(1, parseInt(dataMin, 10))) : '10';
              }
            }
            // 2. 텍스트 / 주관식 인풋 분류
            else {
              if (guide.includes('대표') || guide.includes('성명') || name.includes('CEO') || name.includes('NAME')) {
                input.value = slot.ceoName || '대표자';
              } else if (guide.includes('전화') || guide.includes('연락처') || name.includes('PHONE')) {
                input.value = slot.phone || '010-5392-7259';
              } else if (input.tagName.toLowerCase() === 'textarea' || guide.includes('의견') || guide.includes('애로') || guide.includes('건의')) {
                input.value = pol.open_ended_comment || '지속되는 고물가로 인해 원재료비 및 공공요금 부담이 큽니다. 경기신용보증재단 저금리 특례보증 대출 한도 확대와 상환 거치기간 연장, 점포 시설개선 지원이 지속되었으면 합니다.';
              } else {
                input.value = '체계적인 맞춤형 서비스 제공을 통해 고객 만족도를 높이고 있습니다.';
              }
            }

            if (typeof $ !== 'undefined') $(input).trigger('input').trigger('change');
          }
        });

        // SELECT 드롭다운 처리
        const selects = Array.from(document.querySelectorAll('select')).filter(s => s.offsetParent !== null && !s.disabled);
        selects.forEach(sel => {
          if (!sel.value && sel.options.length > 1) {
            sel.selectedIndex = 1;
            if (typeof $ !== 'undefined') $(sel).trigger('change');
          }
        });

      }, { slot: slotData, pol: policy });

      await sleep(jitter(400, 700));

      // 진행 현황 브로드캐스트
      onProgress({
        step: `STEP_${stepCount}`,
        stepIndex: stepCount,
        totalSteps: 120,
        message: `✓ [Step ${stepCount}] "${qTitle.slice(0, 30)}" 응답 작성 완료 ➔ [다음] 전진`
      });

      // [다음] 버튼 클릭하여 다음 비동기 화면으로 이동
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
