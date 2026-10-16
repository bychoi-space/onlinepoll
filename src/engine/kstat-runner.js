/**
 * AutoSurvey AI - 케이스탯(Kstat) 전용 다중 iframe 설문 자동화 실행 엔진
 * 1) 사람다운 가변 딜레이 (독해/문항 간/다음 전 텀)
 * 2) 쿼터별 동적 페르소나 (업종, 연령, 매출, 결제비중 합100, 애로사항 편차)
 * 3) 다중 iframe 안전 주입 및 스크린샷 캡처
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { generateQuotaPersona } from './persona-builder.js';

// DOM 클릭 안전 유틸 (사람다운 지연 포함, hidden input 오매칭 원천 차단)
async function safeClick(frame, selector) {
  try {
    // selector에 ', input[value="..."]'가 포함된 경우 hidden(PVALUE=1 등) 오매칭 방지를 위해 type="radio" 강제
    const safeSelector = String(selector).replace(/input\[value=/g, 'input[type="radio"][value=');
    const el = await frame.$(safeSelector);
    if (el) {
      await el.evaluate(e => {
        e.scrollIntoView({ block: 'center', inline: 'center' });
        e.checked = true;
        if (typeof setRadioValue === 'function' && e.name && e.value) {
          try { setRadioValue(e.name, e.value); } catch (_) {}
        }
        e.click();
        e.dispatchEvent(new Event('change', { bubbles: true }));
        const parentTd = e.closest('td');
        if (parentTd && parentTd.onclick) {
          try { parentTd.onclick(); } catch (_) {}
        }
      });
      return true;
    }
  } catch (e) {}
  return false;
}

// Kstat 전용 라디오 버튼 확실 선택 유틸 (setRadioValue + input.checked + TD onclick + 이벤트 발행)
async function selectKstatRadio(frame, varName, val) {
  if (!frame) return false;
  const v = String(val).replace(/^#.*_/, '');
  try {
    const ok = await frame.evaluate(({ nm, value }) => {
      if (typeof setRadioValue === 'function') {
        try { setRadioValue(nm, value); } catch (_) {}
      }
      const r = document.querySelector(`#${nm}_${value}`) ||
                document.querySelector(`input[type="radio"][name="${nm}"][value="${value}"]`);
      if (r) {
        r.checked = true;
        r.click();
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const td = document.querySelector(`#TD_${nm}_${value}`) || (r ? r.closest('td') : null);
      if (td && typeof td.onclick === 'function') {
        try { td.onclick(); } catch (_) {}
      }
      return !!r;
    }, { nm: varName, value: v });
    return ok;
  } catch (e) {
    return safeClick(frame, `#${varName}_${v}`);
  }
}

// Kstat 3순위 체크박스(B1BC, B1BD, F1, F2, F3) 안전 선택 유틸 (재진입 시 토글 해제 방지)
async function selectRankCheckboxes(frame, prefix, choices = [1, 2, 3]) {
  if (!frame) return false;
  try {
    await frame.evaluate(({ pfx, arr }) => {
      const r1 = document.querySelector(`#${pfx}_1`);
      const r2 = document.querySelector(`#${pfx}_2`);
      const r3 = document.querySelector(`#${pfx}_3`);
      // 이미 1, 2, 3순위가 모두 채워져 있다면 재클릭으로 해제되지 않도록 유지
      if (r1 && r2 && r3 && r1.value.trim() !== '' && r2.value.trim() !== '' && r3.value.trim() !== '') {
        return;
      }
      // 일부만 선택된 상태라면 기존 체크박스를 먼저 해제하여 초기화
      const checkedBoxes = document.querySelectorAll(`input[type="checkbox"][id^="V${pfx}_"]:checked`);
      checkedBoxes.forEach(cb => {
        try { cb.click(); } catch (_) {}
      });
      // 순서대로 1, 2, 3순위 클릭
      for (const num of arr) {
        const cb = document.querySelector(`#V${pfx}_${num}`);
        if (cb && !cb.checked) {
          cb.click();
        }
      }
    }, { pfx: prefix, arr: choices });
    return true;
  } catch (e) {
    return false;
  }
}

// DOM 인풋 안전 주입 유틸 (hidden input 제외 보장)
async function safeFill(frame, selector, val) {
  if (!frame) return false;
  try {
    const el = await frame.$(selector);
    if (el) {
      await el.evaluate((e, v) => {
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        e.dispatchEvent(new Event('keyup', { bubbles: true }));
        e.dispatchEvent(new Event('blur', { bubbles: true }));
      }, String(val));
      return true;
    }
  } catch (e) {}
  return false;
}

// Kstat merge-template.js 동적 하위 프레임 즉시 활성화 및 로딩 완료 대기 유틸
async function syncDynamicFrames(page) {
  try {
    await page.evaluate(() => {
      if (typeof updateStepView === 'function') {
        try { updateStepView(); } catch (_) {}
      }
      if (typeof getVisibleChildCodes === 'function' && typeof CHILDREN !== 'undefined' && typeof ensureFrameLoaded === 'function') {
        const vis = getVisibleChildCodes();
        for (let i = 0; i < CHILDREN.length; i++) {
          if (vis[CHILDREN[i].code]) {
            try { ensureFrameLoaded(CHILDREN[i].id); } catch (_) {}
          }
        }
      }
      if (typeof processFrameLoadQueue === 'function' && !window.IS_FRAME_QUEUE_RUNNING) {
        try { processFrameLoadQueue(); } catch (_) {}
      }
    }).catch(() => {});

    for (let w = 0; w < 20; w++) {
      const allReady = await page.evaluate(() => {
        if (typeof updateStepView === 'function') {
          try { updateStepView(); } catch (_) {}
        }
        if (typeof getVisibleChildCodes !== 'function' || typeof CHILDREN === 'undefined') return true;
        const vis = getVisibleChildCodes();
        for (let i = 0; i < CHILDREN.length; i++) {
          const c = CHILDREN[i];
          if (vis[c.code]) {
            const ifr = document.getElementById(c.id);
            if (!ifr || ifr.getAttribute('data-merge-loaded') !== '1') return false;
            try {
              const doc = ifr.contentWindow?.document;
              if (!doc || !doc.body || String(doc.location?.href || '').toLowerCase() === 'about:blank') return false;
            } catch (_) {
              return false;
            }
          }
        }
        return true;
      }).catch(() => true);

      if (allReady) break;
      await page.waitForTimeout(250);
    }
  } catch (_) {}
}

// Kstat 현재 페이지 내 노출된 모든 하위 프레임 중 미응답 문항 자동 감지 및 폴백 채움 안전망
async function autoFillUnansweredVisibleFrames(page, persona, biz) {
  for (let pass = 0; pass < 3; pass++) {
    await syncDynamicFrames(page);

    const unansweredCodes = await page.evaluate(() => {
      if (typeof getVisibleChildCodes !== 'function' || typeof CHILDREN === 'undefined') return [];
      const vis = getVisibleChildCodes();
      const list = [];
      for (let i = 0; i < CHILDREN.length; i++) {
        const c = CHILDREN[i];
        if (!vis[c.code]) continue;
        const answered = typeof isChildAnswered === 'function' ? isChildAnswered(c.id) : true;
        if (!answered) {
          list.push(c.code);
        }
      }
      return list;
    }).catch(() => []);

    if (!unansweredCodes || unansweredCodes.length === 0) break;

    for (const code of unansweredCodes) {
      const f = page.frame({ url: new RegExp('/' + code + '\\.asp', 'i') });
      if (!f) continue;

      // 알려진 모든 동적 하위 프레임 코드별 정밀 폴백 처리
      if (code === 'A3A') await selectKstatRadio(f, 'A3A', '1');
      else if (code === 'A4A') await safeFill(f, '#A4A_1, input[name="A4A_1"]', biz.bizNumber);
      else if (code === 'B1BB') await selectKstatRadio(f, 'B1BB', (persona.sales?.salesChangeSelector || '#B1BB_3').replace('#B1BB_', ''));
      else if (code === 'B1BC') await selectRankCheckboxes(f, 'B1BC', persona.sales?.profitIncreaseReasons || [6, 1, 2]);
      else if (code === 'B1BD') await selectRankCheckboxes(f, 'B1BD', persona.sales?.profitDecreaseReasons || [4, 5, 2]);
      else if (code === 'B5A1') await selectKstatRadio(f, 'B5A_1', '1');
      else if (code === 'B5AA') await selectKstatRadio(f, 'B5AA', '1');
      else if (code === 'B5B1') await safeFill(f, '#B5B_1, input[name="B5B_1"]', persona.onnuri?.joinYear || '2020');
      else if (code === 'B5C1') await safeFill(f, '#B5C_1, input[name="B5C_1"]', persona.onnuri?.monthlyCustomers || '5');
      else if (code === 'B5D1') await selectKstatRadio(f, 'B5D_1', persona.onnuri?.helpVal || '3');
      else if (code === 'B5E') await safeFill(f, '#B5E, input[name="B5E"]', persona.onnuri?.increaseRate || '15');
      else if (code === 'B5F1') await selectKstatRadio(f, 'B5F_1', persona.onnuri?.helpVal || '3');
      else if (code === 'B5G') await safeFill(f, '#B5G, input[name="B5G"]', persona.onnuri?.increaseRate || '15');
      else if (code === 'B5A2') await selectKstatRadio(f, 'B5A_2', (persona.onnuri?.mobileSelector || '#B5A_2_2').replace('#B5A_2_', ''));
      else if (code === 'B5AB') await selectKstatRadio(f, 'B5AB', '1');
      else if (code === 'B5B2') await safeFill(f, '#B5B_2, input[name="B5B_2"]', persona.onnuri?.joinYear || '2020');
      else if (code === 'B5C2') await safeFill(f, '#B5C_2, input[name="B5C_2"]', persona.onnuri?.monthlyCustomers || '5');
      else if (code === 'B5D2') await selectKstatRadio(f, 'B5D_2', '3');
      else if (code === 'B5F2') await selectKstatRadio(f, 'B5F_2', '3');
      else if (code === 'C1BA') await safeFill(f, '#C1BA, input[name="C1BA"]', '15');
      else if (code === 'C1DA') await safeFill(f, '#C1DA, input[name="C1DA"]', persona.digital?.deliveryRatio && persona.digital.deliveryRatio !== '0' ? persona.digital.deliveryRatio : '20');
      else if (code === 'C1EA') await safeFill(f, '#C1EA, input[name="C1EA"]', '15');
      else if (code === 'C1FA') await safeFill(f, '#C1FA, input[name="C1FA"]', persona.digital?.posCount && persona.digital.posCount !== '0' ? persona.digital.posCount : '1');
      else if (code === 'C1GA') await selectKstatRadio(f, 'C1GA', persona.digital?.smartOrderIntent || '2');
      else if (code === 'C2A') await selectKstatRadio(f, 'C2A', persona.compliance?.priceTagVal || '1');
      else if (code === 'C2AA') await safeFill(f, '#C2AA, input[name="C2AA"]', persona.compliance?.priceTagRate || '80');
      else if (code === 'C2B') await selectKstatRadio(f, 'C2B', persona.compliance?.originMarkVal || '1');
      else if (code === 'C2BA') await safeFill(f, '#C2BA, input[name="C2BA"]', persona.compliance?.originMarkRate || '100');
      else if (code === 'C2C') await selectKstatRadio(f, 'C2C', '2');
      else if (code === 'C2CA') await safeFill(f, '#C2CA, input[name="C2CA"]', '50');
      else if (code === 'C2D') await selectKstatRadio(f, 'C2D', '2');
      else if (code === 'C2DA') await safeFill(f, '#C2DA, input[name="C2DA"]', '50');
      else if (code === 'C2E') await safeFill(f, '#C2E, input[name="C2E"]', persona.compliance?.domesticRatio || '80');
      else if (code === 'D1A') await selectKstatRadio(f, 'D1A', '2');
      else if (code === 'D1B') await selectKstatRadio(f, 'D1B', '1');
      else if (code === 'D1C') {
        await safeFill(f, '#D1C_1, input[name="D1C_1"]', persona.lease?.deposit || '2000');
        await safeFill(f, '#D1C_2, input[name="D1C_2"]', persona.lease?.monthlyRent || '110');
      }
      else if (code === 'D1D') await selectKstatRadio(f, 'D1D', (persona.lease?.trendSelector || '#D1D_3').replace('#D1D_', ''));
      else if (code === 'D1DA') await safeFill(f, '#D1DA, input[name="D1DA"]', persona.lease?.rentChangeRate || '5');
      else if (code === 'E1A') await safeFill(f, '#E1A, input[name="E1A"]', persona.debt?.amount || '2000');
      else if (code === 'E2AA') await selectKstatRadio(f, 'E2AA', persona.safety?.fireReason || '2');
      else if (code === 'E2BA') await selectKstatRadio(f, 'E2BA', persona.safety?.liabilityReason || '3');
      else if (code === 'E2CA') await safeFill(f, '#E2CA, input[name="E2CA"]', '1');
      else if (code === 'F1') await selectRankCheckboxes(f, 'F1', persona.issues?.f1 || [1, 3, 5]);
      else if (code === 'F2') await selectRankCheckboxes(f, 'F2', persona.issues?.f2 || [1, 2, 5]);
      else if (code === 'F3') await selectRankCheckboxes(f, 'F3', persona.issues?.f3 || [1, 3, 7]);
      else if (code === 'G1') await selectKstatRadio(f, 'G1', (persona.future?.planSelector || '#G1_1').replace('#G1_', ''));
      else if (code === 'G1A') await selectKstatRadio(f, 'G1A', (persona.future?.successionSelector || '#G1A_2').replace('#G1A_', ''));
      else if (code === 'G1AA') await selectKstatRadio(f, 'G1AA', persona.future?.successionTargetVal || '1');
      else if (code === 'G1B') await safeFill(f, '#G1B, input[name="G1B"]', persona.future?.plannedYears || '8');
      else {
        // 범용 폴백: 라디오가 있으면 첫 번째(또는 2번째) 선택, 숫자/텍스트 인풋이 비어 있으면 '10' 입력
        await f.evaluate((c) => {
          const radios = document.querySelectorAll('input[type="radio"]');
          if (radios.length > 0) {
            const r = radios[0];
            if (typeof setRadioValue === 'function' && r.name && r.value) {
              try { setRadioValue(r.name, r.value); } catch (_) {}
            }
            r.checked = true;
            r.click();
          }
          const inputs = document.querySelectorAll('input[type="tel"], input[type="text"], input[type="number"]');
          inputs.forEach(inp => {
            if (!inp.disabled && !inp.readOnly && !inp.name.startsWith('T') && inp.value.trim() === '') {
              inp.value = '10';
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }, code).catch(() => {});
      }
    }
  }
}

/**
 * 케이스탯 설문 1건 시뮬레이션 / 실행
 * @param {Object} options
 * @param {string} options.surveyUrl 설문 진입 URL
 * @param {Object} options.bizData 대상 사업자 팩트 데이터
 * @param {number} options.quotaIndex 쿼터 순번
 * @param {Object} options.guidelineConfig 캠페인 방향성 및 가중치 설정
 * @param {Object} options.policy 공란 및 스킵 정책
 * @param {boolean} options.pilotMode 파일럿 모드 여부 (true: Agree에서 멈춤 / false: 최종 제출)
 * @param {boolean} options.safetyGuard 최종 제출 안전 가드 여부 (true: Agree에서 멈춤)
 * @param {string} options.reportDir 스크린샷 저장 폴더
 * @param {Function} options.onProgress 진행 상황 실시간 콜백 ({ step, stepIndex, totalSteps, screenshotUrl, message })
 */
export async function runKstatSurvey({
  surveyUrl,
  bizData,
  quotaIndex = 1,
  guidelineConfig = {},
  policy = {},
  pilotMode = true,
  safetyGuard = true,
  reportDir = 'reports/live_runs',
  onProgress = () => {}
}) {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // 웹 브라우저에서 접근 가능한 상대 경로 계산
  const rootReportsDir = path.resolve('reports');
  const absReportDir = path.resolve(reportDir);
  const relFromReports = path.relative(rootReportsDir, absReportDir).replace(/\\/g, '/');
  const webBaseUrl = `/reports/${relFromReports}`;

  // 사업자등록번호 12자리 하이픈 포맷(XXX-XX-XXXXX) 보장 (A4A.asp length===12 필수 검증 대응)
  const rawBizDigits = String(bizData.bizNumber || '1234567890').replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  const formattedBizNumber = `${rawBizDigits.slice(0, 3)}-${rawBizDigits.slice(3, 5)}-${rawBizDigits.slice(5, 10)}`;

  // 1. 사업자 팩트 데이터 정규화
  const biz = {
    companyName: bizData.companyName || '무명점포',
    bizNumber: formattedBizNumber,
    ceoName: bizData.ceoName || '점포주',
    phone: bizData.phone || '02-1234-5678',
    openDate: bizData.openDate || '2020-05-01',
    openYear: bizData.openDate ? String(Math.min(2025, parseInt(String(bizData.openDate).split(/[-.]/)[0], 10) || 2020)) : '2020',
    openMonth: bizData.openDate ? (String(bizData.openDate).split(/[-.]/)[1] || '05') : '05',
    zipCode: bizData.zipCode || '05527',
    address: String(bizData.address || '서울특별시 송파구 바람드리길')
      .replace(/주소정보\s*갱신/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    addressDetail: bizData.addressDetail || '1층',
    handledItems: bizData.mainProducts || bizData.handledItems || bizData.industry || '소매업'
  };

  // 2. 쿼터별 동적 페르소나 생성 (업종분류, 연령, 매출, 결제비중 등 가변 데이터)
  const persona = generateQuotaPersona(bizData, quotaIndex, guidelineConfig);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 960 }
  });

  const page = await context.newPage();
  const capturedSteps = [];

  // 사람다운 자연스러운 가변 딜레이 헬퍼들 (건당 약 1분 50초 ~ 2분 10초 안정 궤적)
  const readingDelay = () => page.waitForTimeout(Math.floor(Math.random() * 600) + 1200); // 1.2초 ~ 1.8초 질문 독해 텀
  const itemDelay = () => page.waitForTimeout(Math.floor(Math.random() * 200) + 300); // 300ms ~ 500ms 문항 간 텀
  const preNextDelay = () => page.waitForTimeout(Math.floor(Math.random() * 300) + 600); // 600ms ~ 900ms 다음 클릭 전 텀

  page.on('dialog', async (dialog) => {
    const msg = dialog.message();
    console.log(`🔔 [Kstat Alert] "${msg}"`);
    try {
      onProgress({
        step: 'ALERT',
        stepIndex: 0,
        totalSteps: 15,
        screenshotUrl: null,
        message: `🔔 [설문 알림] "${msg.replace(/[\r\n]+/g, ' ')}"`
      });
    } catch (_) {}
    await dialog.accept();
  });

  try {
    onProgress({
      step: 'START',
      stepIndex: 0,
      totalSteps: 15,
      message: `[세션 접속] 쿼터 #${quotaIndex} "${biz.companyName}" (${biz.bizNumber}) 접속 시작...`
    });

    await page.goto(surveyUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await readingDelay();

    // 1) index.asp인 경우 [시작] 클릭
    if (page.url().includes('index.asp')) {
      await preNextDelay();
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(1000);
    }

    // 2) Survey.asp (SQ1 스크리닝)인 경우
    if (page.url().includes('Survey.asp')) {
      await readingDelay();
      await page.evaluate(() => {
        document.querySelector('#Q1_1')?.click();
      });
      await preNextDelay();
      await page.evaluate(() => {
        document.querySelector('#next')?.click();
      });
      await page.waitForTimeout(1000);
    }

    // 3) Q1.asp (점포 기본정보)인 경우
    if (page.url().includes('Q1.asp')) {
      await readingDelay();
      await page.waitForSelector('#Q1_4_1', { timeout: 10000 }).catch(() => {});

      await page.evaluate(({ zip, addr }) => {
        const z = document.getElementById('Q1_4_1');
        const a = document.getElementById('Q1_4_2');
        if (z) z.value = zip;
        if (a) a.value = (addr || '').replace(/주소정보\s*갱신/g, '').trim();
      }, { zip: biz.zipCode, addr: biz.address });

      await itemDelay();
      await safeFill(page, '#Q1_4_3', biz.addressDetail);
      await safeFill(page, '#Q1_5', biz.companyName);
      await safeClick(page, '#Q1_6_1'); // 점포 형태: 점포

      // 업종별 동적 분류 라디오 매핑 (수산, 농산, 축산, 이미용 등)
      await itemDelay();
      await safeClick(page, persona.industryMeta.selector);

      // Kstat 공식 규칙: @Q1_7 = 7(개인서비스), 9(근린상권) -> Q1_8 보기 4(서비스업), 5(기타)만 허용
      // 그 외 1~6, 8 -> Q1_8 보기 1(도매), 2(소매), 3(도소매), 5(기타) 허용
      const isServiceCategory = persona.industryMeta.selector === '#Q1_7_7' || 
                                persona.industryMeta.selector === '#Q1_7_9' || 
                                persona.industryMeta.categoryName.includes('서비스') ||
                                (persona.industryMeta.subType === '서비스' && persona.industryMeta.selector !== '#Q1_7_6');
      if (isServiceCategory) {
        await safeClick(page, '#Q1_8_4'); // 서비스업
      } else {
        await safeClick(page, '#Q1_8_2'); // 소매업
      }
      await safeFill(page, '#Q1_9_1', biz.handledItems);

      await itemDelay();
      await safeFill(page, '#Q1_10', biz.ceoName);
      await safeFill(page, '#Q1_11', biz.phone);
      await safeClick(page, '#Q1_12_1'); // 응답자: 점포주
      await safeClick(page, '#Q1_13_2'); // 정보수신: 아니오

      capturedSteps.push({
        step: 'Q1',
        stepIndex: 1,
        title: '점포 기본정보 등록'
      });

      onProgress({
        step: 'Q1',
        stepIndex: 1,
        totalSteps: 15,
        screenshotUrl: null,
        message: `✓ [Q1] 점포 기본정보 등록 완료: "${biz.companyName}" (${persona.industryMeta.categoryName})`
      });

      await preNextDelay();
      await page.evaluate(() => document.querySelector('#next')?.click());
      await page.waitForTimeout(1000);
    }

    // 본조사 루프 (P1 ~ P14)
    let iteration = 0;
    const maxIterations = 35;

    while (iteration < maxIterations) {
      iteration++;
      await page.waitForTimeout(1000);
      const currentUrl = page.url();

      if (currentUrl.includes('Agree.asp')) {
        break; // 최종 도달
      }

      const match = currentUrl.match(/(P\d+)\.asp/i);
      const stepName = match ? match[1].toUpperCase() : null;

      if (!stepName) {
        if (currentUrl.includes('index.asp') || currentUrl.includes('Survey.asp')) {
          await page.evaluate(() => document.querySelector('#next')?.click());
          continue;
        }
        break;
      }

      // 사람다운 문항 독해 시간 지연 및 초기 노출 프레임 완전 로딩 보장
      await readingDelay();
      await syncDynamicFrames(page);

      // P1: 점포 현황 (A1, A2, A3 -> A3A, A4 -> A4A, A5)
      if (stepName === 'P1') {
        const fA1 = page.frame({ url: /\/A1\.asp/i });
        if (fA1) await selectKstatRadio(fA1, 'A1', (persona.genderSelector || '#A1_1').replace('#A1_', ''));
        await itemDelay();

        const fA2 = page.frame({ url: /\/A2\.asp/i });
        if (fA2) await safeFill(fA2, '#A2, input[name="A2"]', persona.age);
        await itemDelay();

        const fA3 = page.frame({ url: /\/A3\.asp/i });
        if (fA3) await selectKstatRadio(fA3, 'A3', '2'); // 개인사업자

        const fA4 = page.frame({ url: /\/A4\.asp/i });
        if (fA4) await selectKstatRadio(fA4, 'A4', '1'); // 사업자 등록

        await syncDynamicFrames(page);

        const fA3A = page.frame({ url: /\/A3A\.asp/i });
        if (fA3A) await selectKstatRadio(fA3A, 'A3A', '1'); // 일반과세
        await itemDelay();

        const fA4A = page.frame({ url: /\/A4A\.asp/i });
        if (fA4A) await safeFill(fA4A, '#A4A_1, input[name="A4A_1"]', biz.bizNumber);

        const fA5 = page.frame({ url: /\/A5\.asp/i });
        if (fA5) {
          await safeFill(fA5, '#A5_1, input[name="A5_1"]', biz.openYear);
          await safeFill(fA5, '#A5_2, input[name="A5_2"]', biz.openMonth);
        }
      }

      // P2: 면적 및 종업원수 (A9, A10)
      else if (stepName === 'P2') {
        const fA9 = page.frame({ url: /\/A9\.asp/i });
        if (fA9) {
          await safeFill(fA9, '#A9_1, input[name="A9_1"]', persona.areaSquareMeter);
          await itemDelay();
          await safeFill(fA9, '#A9_2, input[name="A9_2"]', persona.areaPyeong);
        }
        await itemDelay();

        const fA10 = page.frame({ url: /\/A10\.asp/i });
        if (fA10) {
          await safeFill(fA10, 'input[name="A10_1"]', persona.employees.family);
          await safeFill(fA10, 'input[name="A10_2"]', persona.employees.regular);
          await safeFill(fA10, 'input[name="A10_3"]', persona.employees.temp);
        }
      }

      // P3: 매출액 및 영업개월수 (B1AA, B1AB, B1AC)
      else if (stepName === 'P3') {
        const fB1AA = page.frame({ url: /\/B1AA\.asp/i });
        if (fB1AA) await safeFill(fB1AA, '#B1AA, input[name="B1AA"]', persona.sales.daily);
        await itemDelay();

        const fB1AB = page.frame({ url: /\/B1AB\.asp/i });
        if (fB1AB) await safeFill(fB1AB, '#B1AB, input[name="B1AB"]', persona.sales.annual);
        await itemDelay();

        const fB1AC = page.frame({ url: /\/B1AC\.asp/i });
        if (fB1AC) {
          await safeFill(fB1AC, '#B1AC, input[name="B1AC"]', '12');
          await safeFill(fB1AC, 'input[name="B1AC_1"]', persona.sales.quarters.q1);
          await safeFill(fB1AC, 'input[name="B1AC_2"]', persona.sales.quarters.q2);
          await safeFill(fB1AC, 'input[name="B1AC_3"]', persona.sales.quarters.q3);
          await safeFill(fB1AC, 'input[name="B1AC_4"]', persona.sales.quarters.q4);
        }
      }

      // P4: 영업이익, 증감여부(B1BB -> B1BC/B1BD 동적 확장), 고객수, 영업시간, 영업일수
      else if (stepName === 'P4') {
        const fB1BA = page.frame({ url: /\/B1BA\.asp/i });
        if (fB1BA) {
          await safeFill(fB1BA, '#B1BA, input[name="B1BA"]', persona.sales.annualProfit);
          await safeFill(fB1BA, '#B1BA_1, input[name="B1BA_1"]', persona.sales.profitMarginRate);
        }
        await itemDelay();

        const fB1BB = page.frame({ url: /\/B1BB\.asp/i });
        const b1bbVal = (persona.sales?.salesChangeSelector || '#B1BB_3').replace('#B1BB_', '');
        if (fB1BB) {
          await selectKstatRadio(fB1BB, 'B1BB', b1bbVal);
        }

        // B1BB=1(증가) 시 B1BC, B1BB=2(감소) 시 B1BD 동적 노출 동기화
        await syncDynamicFrames(page);

        const fB1BC = page.frame({ url: /\/B1BC\.asp/i });
        if (fB1BC) {
          await selectRankCheckboxes(fB1BC, 'B1BC', persona.sales?.profitIncreaseReasons || [6, 1, 2]);
        }
        const fB1BD = page.frame({ url: /\/B1BD\.asp/i });
        if (fB1BD) {
          await selectRankCheckboxes(fB1BD, 'B1BD', persona.sales?.profitDecreaseReasons || [4, 5, 2]);
        }

        const fB1C = page.frame({ url: /\/B1C\.asp/i });
        if (fB1C) {
          await safeFill(fB1C, '#B1C, input[name="B1C"]', persona.sales.dailyCustomers);
          await safeFill(fB1C, '#B1C_1, input[name="B1C_1"]', String(Math.max(1, Math.round(parseInt(persona.sales.dailyCustomers, 10) * 0.6))));
        }
        const fB1D = page.frame({ url: /\/B1D\.asp/i });
        if (fB1D) await safeFill(fB1D, '#B1D, input[name="B1D"]', persona.sales?.dailyBusinessHours || '11');
        const fB1E = page.frame({ url: /\/B1E\.asp/i });
        if (fB1E) await safeFill(fB1E, '#B1E, input[name="B1E"]', persona.sales.monthlyOpenDays);
      }

      // P5: 결제수단 비중 (B2 취급여부, B2A 비중 합계 100% 필수, B3 온누리 형태별 비중)
      else if (stepName === 'P5') {
        const fB2 = page.frame({ url: /\/B2\.asp/i });
        if (fB2) {
          await fB2.evaluate(() => {
            const selectRadio = (name, val) => {
              const r = document.querySelector(`input[type="radio"][name="${name}"][value="${val}"]`);
              if (r) { r.checked = true; r.click(); }
              if (typeof setRadioMatrixValue === 'function') {
                const map = { B2_1: '2', B2_2: '3', B2_3: '4', B2_4: '5', B2_5: '6', B2_6: '6' };
                setRadioMatrixValue(name, val, map[name] || '6');
              }
            };
            selectRadio('B2_1', '1'); // 1. 현금: 취급
            selectRadio('B2_2', '1'); // 2. 온누리상품권: 취급
            selectRadio('B2_3', '2'); // 3. 지역사랑상품권: 취급 안 함
            selectRadio('B2_4', '2'); // 4. 제로페이: 취급 안 함
            selectRadio('B2_5', '1'); // 5. 신용카드: 취급 (필수)
            const r6_1 = document.querySelector('#B2_6_1');
            const r6_2 = document.querySelector('#B2_6_2');
            if (r6_1) r6_1.checked = false;
            if (r6_2) r6_2.checked = false;
            const tb6 = document.querySelector('#TB2_6');
            if (tb6) tb6.value = '';
          }).catch(async () => {
            await safeClick(fB2, '#B2_1_1');
            await safeClick(fB2, '#B2_2_1');
            await safeClick(fB2, '#B2_3_2');
            await safeClick(fB2, '#B2_4_2');
            await safeClick(fB2, '#B2_5_1');
          });
        }
        await syncDynamicFrames(page);
        await itemDelay();

        const fB2A = page.frame({ url: /\/B2A\.asp/i });
        if (fB2A) {
          await safeFill(fB2A, 'input[name="B2A_1"]', persona.paymentMethods.cash);
          await safeFill(fB2A, 'input[name="B2A_2"]', persona.paymentMethods.onnuri);
          await safeFill(fB2A, 'input[name="B2A_5"]', persona.paymentMethods.card);
        }
        await itemDelay();

        const fB3 = page.frame({ url: /\/B3\.asp/i });
        if (fB3) {
          const rVal = persona.future?.cashReceiptRatio || '50';
          await safeFill(fB3, '#B3_1, input[name="B3_1"]', rVal);
          await safeFill(fB3, '#B3_2, input[name="B3_2"]', String(Math.max(0, 100 - parseInt(rVal, 10))));
        }
      }

      // P6: 영업비용 구성비 (B4 - 합계 100% 필수)
      else if (stepName === 'P6') {
        const fB4 = page.frame({ url: /\/B4\.asp/i });
        if (fB4) {
          await safeFill(fB4, '#B4_1, input[name="B4_1"]', persona.costs.labor);
          await safeFill(fB4, '#B4_2, input[name="B4_2"]', persona.costs.raw);
          await safeFill(fB4, '#B4_3, input[name="B4_3"]', persona.costs.rent);
          await safeFill(fB4, '#TB4_4, input[name="TB4_4"]', persona.costs.etcText || '세금');
          await safeFill(fB4, '#B4_4, input[name="B4_4"]', persona.costs.etc);
        }
      }

      // P7: 온누리상품권 및 지역사랑상품권 현황 (다단계 동적 확장 완벽 대응)
      else if (stepName === 'P7') {
        const fB5A1 = page.frame({ url: /\/B5A1\.asp/i }) || page.frame({ url: /\/B5A\.asp/i });
        if (fB5A1) {
          // B3_2 >= 1 검증 규칙과 충돌하지 않도록 B5A_1은 항상 '1'(가맹) 선택
          await selectKstatRadio(fB5A1, 'B5A_1', '1');
        }

        const fB5A2 = page.frame({ url: /\/B5A2\.asp/i });
        const b5a2Val = (persona.onnuri?.mobileSelector || '#B5A_2_2').replace('#B5A_2_', '');
        if (fB5A2) {
          await selectKstatRadio(fB5A2, 'B5A_2', b5a2Val);
        }

        // 1차 동적 프레임(B5B1, B5C1, B5D1, B5F1, B5AB/B5B2~B5F2) 활성화 및 로딩 대기
        await syncDynamicFrames(page);

        const joinYearVal = String(persona.onnuri?.joinYear || 2020);
        const custVal = String(persona.onnuri?.monthlyCustomers || '5');
        const helpVal = String(persona.onnuri?.helpVal || '3');
        const incRateVal = String(persona.onnuri?.increaseRate || '15');

        const fB5B1 = page.frame({ url: /\/B5B1\.asp/i });
        if (fB5B1) await safeFill(fB5B1, '#B5B_1, input[name="B5B_1"]', joinYearVal);

        const fB5C1 = page.frame({ url: /\/B5C1\.asp/i });
        if (fB5C1) await safeFill(fB5C1, '#B5C_1, input[name="B5C_1"]', custVal);

        const fB5D1 = page.frame({ url: /\/B5D1\.asp/i });
        if (fB5D1) await selectKstatRadio(fB5D1, 'B5D_1', helpVal);

        const fB5F1 = page.frame({ url: /\/B5F1\.asp/i });
        if (fB5F1) await selectKstatRadio(fB5F1, 'B5F_1', helpVal);

        const fB5AA = page.frame({ url: /\/B5AA\.asp/i });
        if (fB5AA) await selectKstatRadio(fB5AA, 'B5AA', '1');

        const fB5B2 = page.frame({ url: /\/B5B2\.asp/i });
        if (fB5B2) await safeFill(fB5B2, '#B5B_2, input[name="B5B_2"]', joinYearVal);

        const fB5C2 = page.frame({ url: /\/B5C2\.asp/i });
        if (fB5C2) await safeFill(fB5C2, '#B5C_2, input[name="B5C_2"]', custVal);

        const fB5D2 = page.frame({ url: /\/B5D2\.asp/i });
        if (fB5D2) await selectKstatRadio(fB5D2, 'B5D_2', '3');

        const fB5F2 = page.frame({ url: /\/B5F2\.asp/i });
        if (fB5F2) await selectKstatRadio(fB5F2, 'B5F_2', '3');

        const fB5AB = page.frame({ url: /\/B5AB\.asp/i });
        if (fB5AB) await selectKstatRadio(fB5AB, 'B5AB', '1');

        // B5D_1=4,5 또는 B5F_1=4,5 선택 시 2차 동적 확장되는 B5E, B5G 동기화 및 주입
        await syncDynamicFrames(page);

        const fB5E = page.frame({ url: /\/B5E\.asp/i });
        if (fB5E) await safeFill(fB5E, '#B5E, input[name="B5E"]', incRateVal);

        const fB5G = page.frame({ url: /\/B5G\.asp/i });
        if (fB5G) await safeFill(fB5G, '#B5G, input[name="B5G"]', incRateVal);
      }

      // P8: 판로 및 마케팅 (C1A~C1G -> C1BA, C1DA, C1EA, C1FA, C1GA 동적 서브프레임 완벽 대응)
      else if (stepName === 'P8') {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        for (const letter of letters) {
          const f = page.frame({ url: new RegExp('/C1' + letter + '\\.asp', 'i') });
          if (f) {
            let choice = '2'; // 기본 미실시/미운영/미보유
            if (letter === 'D' && persona.digital.hasDelivery) choice = '1';
            if (letter === 'F' && persona.digital.hasPos) choice = '1';
            if (letter === 'G' && persona.digital.hasSmartOrder) choice = '1';
            await selectKstatRadio(f, `C1${letter}`, choice);
          }
        }

        // merge-template.js 동적 서브프레임(C1BA, C1DA, C1EA, C1FA, C1GA) 활성화 대기 (조기 #next 클릭 제거!)
        await syncDynamicFrames(page);

        const fBA = page.frame({ url: /\/C1BA\.asp/i });
        if (fBA) await safeFill(fBA, '#C1BA, input[name="C1BA"]', '15');

        const fDA = page.frame({ url: /\/C1DA\.asp/i });
        if (fDA) {
          const delivVal = (persona.digital.deliveryRatio && persona.digital.deliveryRatio !== '0') ? persona.digital.deliveryRatio : '20';
          await safeFill(fDA, '#C1DA, input[name="C1DA"]', delivVal);
        }

        const fEA = page.frame({ url: /\/C1EA\.asp/i });
        if (fEA) await safeFill(fEA, '#C1EA, input[name="C1EA"]', '15');

        const fFA = page.frame({ url: /\/C1FA\.asp/i });
        if (fFA) {
          const posVal = (persona.digital.posCount && persona.digital.posCount !== '0') ? persona.digital.posCount : '1';
          await safeFill(fFA, '#C1FA, input[name="C1FA"]', posVal);
        }

        const fGA = page.frame({ url: /\/C1GA\.asp/i });
        if (fGA) {
          const intentVal = persona.digital.smartOrderIntent || '2';
          await selectKstatRadio(fGA, 'C1GA', intentVal);
        }
      }

      // P9: 원산지 및 가격표시 (C2A -> C2AA, C2B -> C2BA, C2C -> C2CA, C2D -> C2DA, C2E 완벽 대응)
      else if (stepName === 'P9') {
        const fC2A = page.frame({ url: /\/C2A\.asp/i });
        const c2aVal = persona.compliance?.priceTagVal || '1';
        if (fC2A) {
          await selectKstatRadio(fC2A, 'C2A', c2aVal);
        }

        const fC2B = page.frame({ url: /\/C2B\.asp/i });
        const c2bVal = persona.compliance?.originMarkVal || '1';
        if (fC2B) {
          await selectKstatRadio(fC2B, 'C2B', c2bVal);
        }

        const fC2C = page.frame({ url: /\/C2C\.asp/i });
        if (fC2C) {
          await selectKstatRadio(fC2C, 'C2C', '2'); // 취급 안 함
        }

        const fC2D = page.frame({ url: /\/C2D\.asp/i });
        if (fC2D) {
          await selectKstatRadio(fC2D, 'C2D', '2'); // 취급 안 함
        }

        const fC2E = page.frame({ url: /\/C2E\.asp/i });
        if (fC2E) {
          const originRatio = String(persona.compliance?.domesticRatio || '80');
          await safeFill(fC2E, '#C2E, input[name="C2E"]', originRatio);
        }

        // C2A=1 -> C2AA.asp, C2B=1 -> C2BA.asp 동적 노출 즉시 동기화 및 로딩 대기
        await syncDynamicFrames(page);

        const fC2AA = page.frame({ url: /\/C2AA\.asp/i });
        if (fC2AA) {
          const tagRate = String(persona.compliance?.priceTagRate || '80');
          await safeFill(fC2AA, '#C2AA, input[name="C2AA"]', tagRate);
        }

        const fC2BA = page.frame({ url: /\/C2BA\.asp/i });
        if (fC2BA) {
          const markRate = String(persona.compliance?.originMarkRate || '100');
          await safeFill(fC2BA, '#C2BA, input[name="C2BA"]', markRate);
        }

        const fC2CA = page.frame({ url: /\/C2CA\.asp/i });
        if (fC2CA) await safeFill(fC2CA, '#C2CA, input[name="C2CA"]', '50');

        const fC2DA = page.frame({ url: /\/C2DA\.asp/i });
        if (fC2DA) await safeFill(fC2DA, '#C2DA, input[name="C2DA"]', '50');
      }

      // P10: 사업장 점유형태 (D1 -> D1A, D1B, D1C -> D1D -> D1DA 3단계 동적 확장 완벽 대응)
      else if (stepName === 'P10') {
        const fD1 = page.frame({ url: /\/D1\.asp/i });
        if (fD1) {
          if (persona.lease.isRent) {
            await selectKstatRadio(fD1, 'D1', '2'); // 임차
            await syncDynamicFrames(page);

            const fD1A = page.frame({ url: /\/D1A\.asp/i });
            if (fD1A) await selectKstatRadio(fD1A, 'D1A', '2'); // 보증금 있는 월세

            const fD1B = page.frame({ url: /\/D1B\.asp/i });
            if (fD1B) await selectKstatRadio(fD1B, 'D1B', '1'); // 개인 상인 또는 민간 소유자

            await syncDynamicFrames(page);

            const fD1C = page.frame({ url: /\/D1C\.asp/i });
            if (fD1C) {
              await safeFill(fD1C, '#D1C_1, input[name="D1C_1"]', persona.lease.deposit);
              await safeFill(fD1C, '#D1C_2, input[name="D1C_2"]', persona.lease.monthlyRent);
            }

            const fD1D = page.frame({ url: /\/D1D\.asp/i });
            const d1dVal = (persona.lease?.trendSelector || '#D1D_3').replace('#D1D_', '');
            if (fD1D) {
              await selectKstatRadio(fD1D, 'D1D', d1dVal);
            }

            // D1D=1(상승) 또는 2(하락) 선택 시 D1DA(월세 증감 비율 %) 동적 노출 동기화
            await syncDynamicFrames(page);

            const fD1DA = page.frame({ url: /\/D1DA\.asp/i });
            if (fD1DA) {
              await safeFill(fD1DA, '#D1DA, input[name="D1DA"]', persona.lease?.rentChangeRate || '5');
            }
          } else {
            await selectKstatRadio(fD1, 'D1', '1'); // 자가 소유
          }
        }
      }

      // P11: 부채 현황 (E1 -> E1A 동적 확장 완벽 대응)
      else if (stepName === 'P11') {
        const fE1 = page.frame({ url: /\/E1\.asp/i });
        const val = persona.debt.hasDebt ? '1' : '2';
        if (fE1) {
          await selectKstatRadio(fE1, 'E1', val);
        }

        if (persona.debt.hasDebt) {
          await syncDynamicFrames(page);
          const fE1A = page.frame({ url: /\/E1A\.asp/i });
          if (fE1A) {
            await safeFill(fE1A, '#E1A, input[name="E1A"]', persona.debt.amount);
          }
        }
      }

      // P12: 안전 및 보험 (E2A -> E2AA, E2B -> E2BA, E2C -> E2CA 동적 확장 완벽 대응)
      else if (stepName === 'P12') {
        const fE2A = page.frame({ url: /\/E2A\.asp/i });
        const e2aVal = (persona.safety?.fireSelector || '#E2A_1').replace('#E2A_', '');
        if (fE2A) await selectKstatRadio(fE2A, 'E2A', e2aVal);

        const fE2B = page.frame({ url: /\/E2B\.asp/i });
        const e2bVal = (persona.safety?.liabilitySelector || '#E2B_1').replace('#E2B_', '');
        if (fE2B) await selectKstatRadio(fE2B, 'E2B', e2bVal);

        const fE2C = page.frame({ url: /\/E2C\.asp/i });
        if (fE2C) await selectKstatRadio(fE2C, 'E2C', '2'); // 소화기 미보유(또는 1 선택 시 E2CA 자동대응)

        // E2A=2 -> E2AA, E2B=2 -> E2BA, E2C=1 -> E2CA 동적 확장 동기화
        await syncDynamicFrames(page);

        const fE2AA = page.frame({ url: /\/E2AA\.asp/i });
        if (fE2AA) await selectKstatRadio(fE2AA, 'E2AA', persona.safety?.fireReason || '2');

        const fE2BA = page.frame({ url: /\/E2BA\.asp/i });
        if (fE2BA) await selectKstatRadio(fE2BA, 'E2BA', persona.safety?.liabilityReason || '3');

        const fE2CA = page.frame({ url: /\/E2CA\.asp/i });
        if (fE2CA) await safeFill(fE2CA, '#E2CA, input[name="E2CA"]', '1');
      }

      // P13: 애로사항(F1), 청년상인 애로사항(F2: #A2<=39 동적 노출), 활성화 과제(F3)
      else if (stepName === 'P13') {
        const fF1 = page.frame({ url: /\/F1\.asp/i });
        if (fF1) {
          await selectRankCheckboxes(fF1, 'F1', persona.issues.f1 || [1, 3, 5]);
        }
        await itemDelay();

        const fF2 = page.frame({ url: /\/F2\.asp/i });
        if (fF2) {
          await selectRankCheckboxes(fF2, 'F2', persona.issues.f2 || [1, 2, 5]);
        }

        const fF3 = page.frame({ url: /\/F3\.asp/i });
        if (fF3) {
          await selectRankCheckboxes(fF3, 'F3', persona.issues.f3 || [1, 3, 7]);
        }
      }

      // P14: 향후 운영 계획 및 경영 관리 (G1 -> G1A -> G1AA, G1B, G2 3단계 동적 확장 완벽 대응)
      else if (stepName === 'P14') {
        const fG1 = page.frame({ url: /\/G1\.asp/i });
        const g1Val = (persona.future?.planSelector || '#G1_1').replace('#G1_', '');
        if (fG1) {
          await selectKstatRadio(fG1, 'G1', g1Val);
        }

        const fG2 = page.frame({ url: /\/G2\.asp/i });
        if (fG2) {
          const receiptVal = String(persona.future?.cashReceiptRatio || '50');
          await fG2.evaluate((rPct) => {
            if (typeof setRadioValue === 'function') {
              try { setRadioValue('G2_1', '2'); } catch (_) {}
              try { setRadioValue('G2_2', '1'); } catch (_) {}
              try { setRadioValue('G2_3', '2'); } catch (_) {}
            }
            const r1 = document.querySelector('#G2_1_2');
            if (r1) { r1.checked = true; r1.click(); }
            const r2 = document.querySelector('#G2_2_1');
            if (r2) { r2.checked = true; r2.click(); }
            const note = document.querySelector('#G2_2_NOTE');
            if (note) {
              note.value = rPct;
              note.dispatchEvent(new Event('input', { bubbles: true }));
              note.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const r3 = document.querySelector('#G2_3_2');
            if (r3) { r3.checked = true; r3.click(); }
          }, receiptVal).catch(() => {});
        }

        // G1=1 선택 시 G1A(승계계획 유무: 1=예, 2=아니오), G1B(향후 지속년수) 동적 로드 동기화
        await syncDynamicFrames(page);

        const fG1A = page.frame({ url: /\/G1A\.asp/i });
        const g1aVal = (persona.future?.successionSelector || '#G1A_2').replace('#G1A_', '');
        if (fG1A) {
          await selectKstatRadio(fG1A, 'G1A', g1aVal === '1' ? '1' : '2');
        }

        const fG1B = page.frame({ url: /\/G1B\.asp/i });
        if (fG1B) {
          await safeFill(fG1B, '#G1B, input[name="G1B"]', persona.future.plannedYears || '8');
        }

        // G1=1 & G1A=1 선택 시 G1AA(승계 대상: 1=친인척, 2=타인) 3차 동적 로드 동기화 및 주입
        await syncDynamicFrames(page);

        const fG1AA = page.frame({ url: /\/G1AA\.asp/i });
        if (fG1AA) {
          await selectKstatRadio(fG1AA, 'G1AA', persona.future?.successionTargetVal || '1');
        }
      }

      // [최종 안전망] 현재 페이지의 모든 노출 프레임 동기화 및 미응답 문항 자동 점검/보완
      await autoFillUnansweredVisibleFrames(page, persona, biz);

      const stepNum = parseInt(stepName.replace('P', ''), 10) || 0;

      // 사람다운 다음 단계 검토 지연 후 클릭
      await preNextDelay();
      const prevUrl = page.url();
      await page.evaluate(() => document.querySelector('#next')?.click());

      // 페이지가 실제로 다음 단계로 넘어갈 때까지 대기
      let pageAdvanced = false;
      for (let w = 0; w < 16; w++) {
        await page.waitForTimeout(500);
        if (page.url() !== prevUrl) {
          pageAdvanced = true;
          break;
        }
      }

      // 페이지가 실제로 다음 단계로 성공적으로 넘어갔을 때만 1회 정직하게 진행 로그 발행!
      if (pageAdvanced) {
        capturedSteps.push({
          step: stepName,
          stepIndex: stepNum + 1,
          title: `${stepName} 완료`
        });

        const nextMatch = page.url().match(/(P\d+|Agree)\.asp/i);
        const nextStepName = nextMatch ? nextMatch[1] : '다음';
        onProgress({
          step: stepName,
          nextStep: nextStepName,
          stepIndex: stepNum + 1,
          totalSteps: 15,
          screenshotUrl: null,
          message: `✓ [${stepName}] 단계 완료 ➔ [${nextStepName}] 단계 진입`
        });
      } else {
        console.log(`⚠️ [${stepName}] 페이지가 전환되지 않아 재시도 준비 중... (현재: ${page.url()})`);
      }
    }

    // ---------------------------------------------------------
    // 최종 관문: Agree.asp 개인정보 동의
    // ---------------------------------------------------------
    await readingDelay();
    const reachedAgree = page.url().includes('Agree.asp');
    if (reachedAgree) {
      await safeClick(page, '#AGREE_1');
      await preNextDelay();

      capturedSteps.push({
        step: 'Agree',
        stepIndex: 16,
        title: '개인정보 수집 동의 완료'
      });

      // 파일럿 모드이거나 안전가드가 켜져 있으면 최종 제출 버튼 클릭 전 대기
      if (pilotMode || safetyGuard) {
        onProgress({
          step: 'Agree',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: null,
          message: `🛡️ [최종 동의 완료] 안전 가드 활성화 상태로 최종 제출 전 대기합니다.`
        });
      } else {
        // 실제 최종 제출 실행
        await page.evaluate(() => document.querySelector('#next')?.click());
        await page.waitForTimeout(3000);
        onProgress({
          step: 'COMPLETED',
          stepIndex: 15,
          totalSteps: 15,
          screenshotUrl: null,
          message: `🎉 [설문 최종 마감] "${biz.companyName}" 설문이 정식 제출 마감되었습니다!`
        });
      }
    }

    // 최종 관문인 Agree.asp에 도달하지 못했다면 모드와 무관하게 무조건 실패 처리! (거짓 완료 원천 차단)
    if (!reachedAgree) {
      return {
        success: false,
        error: `최종 동의 단계(Agree.asp)에 도달하지 못했습니다. (현재 위치: ${page.url()})`,
        capturedSteps,
        companyName: biz.companyName
      };
    }

    return {
      success: true,
      capturedSteps,
      companyName: biz.companyName,
      personaSummary: {
        category: persona.industryMeta.categoryName,
        age: persona.age,
        areaPyeong: persona.areaPyeong,
        dailySales: persona.sales.daily,
        cardRatio: persona.paymentMethods.card,
        issues: persona.issues.f1
      }
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
