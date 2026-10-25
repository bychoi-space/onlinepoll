/**
 * AutoSurvey AI - 케이스탯(Kstat) 상인회 전용 [조사원 평가] 자동화 실행 엔진
 * 대상: P26042401AA / P1.asp (H1: 시장 환경/시설 평가 4문항, H2: 특화거리/브랜드화 4문항 + 보충설명)
 * 
 * 주요 기능:
 * 1) 정책 가이드(assocPolicy.eval_*) 기준점 기반 평가 답변 자동 생성
 * 2) RadioArrayCnt 편중 방지 지터링 (4개 문항 동일 점수 몰림 시 유효성 Alert 원천 차단)
 * 3) H2 '있다(1)' 선택 시 보충설명(NOTE) 필수 주입 및 '없다(2)' 선택 시 비활성화 처리
 * 4) Survey_End.asp 안착 검증 및 step_25_eval_completed.png 증빙 스크린샷 갤러리 보관
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Kstat 전용 라디오 버튼 안전 선택 유틸
 * (단일 객체 래핑 evaluate, setRadioValue + checked + click + dispatchEvent + TD onclick)
 */
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
    try {
      const el = await frame.$(`#${varName}_${v}, input[type="radio"][name="${varName}"][value="${v}"]`);
      if (el) {
        await el.check({ force: true });
        return true;
      }
    } catch (_) {}
    return false;
  }
}

/**
 * H1 환경/시설 평가 4개 문항 편중 방지 지터링 계산기
 * Kstat 유효성 검사: RadioArrayCnt("H1_1,H1_2,H1_3,H1_4", 99)
 * 4문항 모두 동일한 점수(예: 4, 4, 4, 4 또는 5, 5, 5, 5)가 입력되면 Alert 경고 발생.
 * 따라서 최소 1개 문항은 다른 점수가 부여되도록 결정론적 보정.
 */
function resolveH1Ratings(rawRatings, seedNum, applyJitter = true) {
  const result = {
    H1_1: parseInt(rawRatings.H1_1 ?? 4, 10),
    H1_2: parseInt(rawRatings.H1_2 ?? 4, 10),
    H1_3: parseInt(rawRatings.H1_3 ?? 3, 10),
    H1_4: parseInt(rawRatings.H1_4 ?? 4, 10)
  };

  // 범위 클램핑 (1~5)
  for (const k of Object.keys(result)) {
    result[k] = Math.max(1, Math.min(5, result[k]));
  }

  if (applyJitter) {
    // 슬롯 시드 기반으로 주차(H1_3) 또는 바닥(H1_4)에 자연스러운 변동 부여
    const hash = (seedNum * 13 + 7) % 100;
    if (hash < 40 && result.H1_3 > 2) {
      result.H1_3 = Math.max(2, result.H1_3 - 1);
    } else if (hash > 75 && result.H1_2 < 5) {
      result.H1_2 = Math.min(5, result.H1_2 + 1);
    }
  }

  // 치명적 Alert 트랩 방어: 4개 문항이 모두 완벽히 동일한 경우 강제 분산
  const vals = Object.values(result);
  const allSame = vals.every(v => v === vals[0]);
  if (allSame) {
    // 주차(H1_3)를 1점 조정하여 편중 해제
    if (result.H1_3 >= 4) {
      result.H1_3 = result.H1_3 - 1;
    } else {
      result.H1_3 = result.H1_3 + 1;
    }
  }

  return {
    H1_1: String(result.H1_1),
    H1_2: String(result.H1_2),
    H1_3: String(result.H1_3),
    H1_4: String(result.H1_4)
  };
}

/**
 * 상인회 전용 케이스탯 조사원 평가(P26042401AA) 자동 실행기
 * 
 * @param {object} params
 * @param {string} params.evalUrl - 평가 진입 URL (srt=2)
 * @param {object} params.assocData - 상인회 쿼터 데이터 (시장명, 슬롯정보 등)
 * @param {object} params.guidelineConfig - 정책 가이드라인 (assocPolicy 포함)
 * @param {string} params.reportDir - 스크린샷 및 로그 저장 경로
 * @param {function} params.onProgress - 진행 상황 브로드캐스트 콜백
 * @param {object} [params.page] - 기존에 열려 있는 Playwright 페이지 (선택)
 * @returns {Promise<object>} { success, evalResults, screenshotPath }
 */
export async function runKstatAssocEvaluation({
  evalUrl,
  assocData = {},
  guidelineConfig = {},
  reportDir = '',
  onProgress = () => {},
  page: existingPage = null
}) {
  let browser = null;
  let page = existingPage;
  const needCloseBrowser = !existingPage;

  const targetUrl = evalUrl || assocData.evalUrl;
  if (!targetUrl) {
    throw new Error('상인회 조사원 평가 설문 URL(evalUrl)이 지정되지 않았습니다.');
  }

  // 정책 가이드라인 추출
  const policy = guidelineConfig.assocPolicy || guidelineConfig.policy || assocData.assocPolicy || {};

  // 결정론적 시드 (시장코드/등록번호/슬롯번호 기반)
  const seedRaw = String(assocData.regNumber || assocData.marketCode || assocData.slotIndex || assocData.seq || '42').replace(/[^0-9]/g, '');
  const seedNum = seedRaw.split('').reduce((acc, c) => acc + parseInt(c, 10), 0) || 42;

  const marketName = assocData.marketName || assocData.companyName || '상인회';
  logger.info(`[상인회 조사원 평가] "${marketName}" 평가 가동 시작... (URL: ${targetUrl})`);
  onProgress({ step: 'ASSOC_EVAL_START', message: `조사원 평가 작성 시작... (${marketName})` });

  try {
    if (!page) {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 }
      });
      page = await context.newPage();
    }

    // Alert 팝업 대화상자 자동 수락 및 로깅
    page.on('dialog', async d => {
      logger.info(`[상인회 평가 Alert 감지] "${d.message()}" ➔ 자동 수락`);
      await d.accept().catch(() => {});
    });

    // 1. 평가 설문 진입
    logger.info(`[상인회 조사원 평가] URL 접속 중: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(1500);

    // index.asp 에서 시작 버튼 클릭이 필요한 경우
    if (page.url().includes('index.asp')) {
      logger.info('[상인회 조사원 평가] index.asp 감지 ➔ 시작 버튼 클릭...');
      const startBtn = await page.$('input[type="image"], a[href*="Survey.asp"], button, #btn_start');
      if (startBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
          startBtn.click()
        ]);
        await page.waitForTimeout(1500);
      }
    }

    // P1.asp 도달 대기
    if (!page.url().includes('P1.asp') && !page.url().includes('Survey_End.asp')) {
      logger.info(`[상인회 조사원 평가] 현재 URL: ${page.url()}, P1.asp 대기 중...`);
      await page.waitForURL(url => url.pathname.includes('P1.asp') || url.pathname.includes('Survey_End.asp'), { timeout: 15000 }).catch(() => {});
    }

    // 이미 완료된 평가 설문인 경우 즉시 정상 반환
    if (page.url().includes('Survey_End.asp')) {
      logger.success(`[상인회 조사원 평가] "${marketName}" 이미 완료된 평가 설문입니다. (Survey_End.asp)`);
      onProgress({ step: 'ASSOC_EVAL_DONE', message: '조사원 평가 이미 완료됨 (Survey_End)' });
      return { success: true, message: '이미 완료된 평가 설문', evalResults: {} };
    }

    // 2. 동적 하위 프레임 동기화 (Sequential View 해제 및 frame_H1, frame_H2 로드 활성화)
    logger.info('[상인회 조사원 평가] 순차 뷰 해제 및 frame_H1, frame_H2 로드 동기화...');
    await page.evaluate(() => {
      window.USE_SEQUENTIAL_VIEW = false;
      document.querySelectorAll('.is-hidden').forEach(el => el.classList.remove('is-hidden'));
      if (typeof updateStepView === 'function') {
        try { updateStepView(); } catch (_) {}
      }
      if (typeof ensureFrameLoaded === 'function') {
        try { ensureFrameLoaded('H1'); } catch (_) {}
        try { ensureFrameLoaded('H2'); } catch (_) {}
      }
    }).catch(err => logger.warn(`[상인회 평가 순차뷰 해제 경고] ${err.message}`));

    await page.waitForTimeout(1500);

    // 하위 프레임 frame_H1, frame_H2 감지 대기 (최대 10초)
    let frameH1 = null;
    let frameH2 = null;

    for (let waitLoop = 0; waitLoop < 25; waitLoop++) {
      const frames = page.frames();
      for (const f of frames) {
        const u = f.url().toLowerCase();
        const n = (f.name() || '').toLowerCase();
        if (u.includes('h1.asp') || n.includes('frame_h1')) frameH1 = f;
        if (u.includes('h2.asp') || n.includes('frame_h2')) frameH2 = f;
      }
      if (frameH1 && frameH2) break;
      await page.waitForTimeout(400);
    }

    if (!frameH1 || !frameH2) {
      throw new Error(`상인회 조사원 평가 필수 하위 프레임을 감지하지 못했습니다. (H1:${!!frameH1}, H2:${!!frameH2})`);
    }

    // 3. H1 평가 답변 산출 및 주입 (편중 방지 지터링 적용)
    const rawH1 = {
      H1_1: policy.eval_H1_1_cleanliness ?? 4,
      H1_2: policy.eval_H1_2_entrance ?? 4,
      H1_3: policy.eval_H1_3_parking ?? 3,
      H1_4: policy.eval_H1_4_floor ?? 4
    };
    const applyJitter = policy.eval_H1_jitter !== false;
    const h1Ratings = resolveH1Ratings(rawH1, seedNum, applyJitter);

    logger.info(`[상인회 평가 주입] H1 시설환경: [H1_1=${h1Ratings.H1_1}, H1_2=${h1Ratings.H1_2}, H1_3=${h1Ratings.H1_3}, H1_4=${h1Ratings.H1_4}] (지터링:${applyJitter})`);
    onProgress({ step: 'ASSOC_EVAL_H1', message: `H1 시설·환경 평가 점수 주입 중 (${Object.values(h1Ratings).join(', ')})` });

    for (const [key, val] of Object.entries(h1Ratings)) {
      await selectKstatRadio(frameH1, key, val);
      await page.waitForTimeout(100);
    }

    // 4. H2 차별화/브랜드화 항목 답변 산출 및 주입
    const h2Configs = [
      {
        idx: 1,
        code: 'H2_1',
        noteCode: 'H2_1_NOTE',
        title: '특화거리',
        choice: String(policy.eval_H2_1_specialStreet ?? '2'),
        text: policy.eval_H2_1_customText ?? '먹거리 및 패션 특화골목'
      },
      {
        idx: 2,
        code: 'H2_2',
        noteCode: 'H2_2_NOTE',
        title: '특산품',
        choice: String(policy.eval_H2_2_specialProduct ?? '2'),
        text: policy.eval_H2_2_customText ?? '지역 대표 먹거리 및 신선식품'
      },
      {
        idx: 3,
        code: 'H2_3',
        noteCode: 'H2_3_NOTE',
        title: '브랜드마크',
        choice: String(policy.eval_H2_3_brandMark ?? '2'),
        text: policy.eval_H2_3_customText ?? ''
      },
      {
        idx: 4,
        code: 'H2_4',
        noteCode: 'H2_4_NOTE',
        title: '홍보물',
        choice: String(policy.eval_H2_4_brandUsage ?? '2'),
        text: policy.eval_H2_4_customText ?? ''
      }
    ];

    logger.info(`[상인회 평가 주입] H2 차별화: ${h2Configs.map(c => `${c.title}=${c.choice === '1' ? `있다(${c.text})` : '없다'}`).join(', ')}`);
    onProgress({ step: 'ASSOC_EVAL_H2', message: 'H2 특화거리 및 브랜드화 평가 주입 중...' });

    for (const cfg of h2Configs) {
      // 라디오 선택 (1: 있다, 2: 없다)
      await selectKstatRadio(frameH2, cfg.code, cfg.choice);
      await page.waitForTimeout(120);

      // '있다(1)' 선택 시 보충설명 텍스트 필드 주입
      if (cfg.choice === '1') {
        const textVal = (cfg.text && String(cfg.text).trim() !== '') ? cfg.text.trim() : `${marketName} 대표 특화 구역`;
        await frameH2.evaluate(({ noteId, val }) => {
          const el = document.querySelector(`#${noteId}`) || 
                     document.querySelector(`input[name="${noteId}"]`) || 
                     document.querySelector(`textarea[name="${noteId}"]`);
          if (el) {
            el.disabled = false;
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { noteId: cfg.noteCode, val: textVal }).catch(err => {
          logger.warn(`[상인회 평가] ${cfg.noteCode} 보충설명 주입 오류: ${err.message}`);
        });
      } else {
        // '없다(2)' 선택 시 비활성화 및 공란 처리
        await frameH2.evaluate(({ noteId }) => {
          const el = document.querySelector(`#${noteId}`) || 
                     document.querySelector(`input[name="${noteId}"]`) || 
                     document.querySelector(`textarea[name="${noteId}"]`);
          if (el) {
            el.value = '';
            el.disabled = true;
          }
        }, { noteId: cfg.noteCode }).catch(() => {});
      }
      await page.waitForTimeout(100);
    }

    // 5. 상위 페이지의 저장(#next) 버튼 클릭 및 안착 대기
    logger.info('[상인회 조사원 평가] H1, H2 응답 주입 완료 ➔ 최종 저장(#next) 클릭...');
    onProgress({ step: 'ASSOC_EVAL_SUBMIT', message: '평가 항목 작성 완료, 최종 제출 중...' });

    await page.evaluate(() => {
      const btn = document.querySelector('#next') || document.querySelector('button[val*="저장"]');
      if (btn) btn.click();
    }).catch(err => logger.warn(`[상인회 평가 제출 클릭 오류] ${err.message}`));

    // Survey_End.asp 도달 대기 (최대 15초)
    let isCompleted = false;
    for (let checkLoop = 0; checkLoop < 15; checkLoop++) {
      const cur = page.url();
      if (cur.includes('Survey_End.asp') || cur.includes('Survey_end.asp')) {
        isCompleted = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!isCompleted) {
      logger.warn(`[상인회 평가] Survey_End 미도달(현재: ${page.url()}), #next 2차 재시도...`);
      await page.evaluate(() => document.querySelector('#next')?.click()).catch(() => {});
      await page.waitForTimeout(2000);
      isCompleted = page.url().includes('Survey_End.asp') || page.url().includes('Survey_end.asp');
    }

    // 6. 스크린샷 증빙 저장
    let screenshotPath = '';
    if (reportDir) {
      try {
        fs.mkdirSync(reportDir, { recursive: true });
        screenshotPath = path.join(reportDir, 'step_25_eval_completed.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info(`[상인회 평가 증빙] 스크린샷 저장 완료: ${screenshotPath}`);
      } catch (err) {
        logger.warn(`[상인회 평가 스크린샷 실패] ${err.message}`);
      }
    }

    if (!isCompleted) {
      throw new Error(`상인회 조사원 평가 완료 페이지(Survey_End.asp)에 도달하지 못했습니다. (현재: ${page.url()})`);
    }

    onProgress({ step: 'ASSOC_EVAL_DONE', message: '✓ 조사원 평가 100% 완료' });
    logger.success(`🎉 [상인회 조사원 평가 완료] "${marketName}" 평가 제출 완결!`);

    return {
      success: true,
      finalUrl: page.url(),
      evalResults: {
        h1: h1Ratings,
        h2: h2Configs.reduce((acc, c) => ({ ...acc, [c.code]: c.choice, [c.noteCode]: c.choice === '1' ? c.text : '' }), {})
      },
      screenshotPath
    };

  } catch (err) {
    logger.error(`[상인회 조사원 평가 실패] ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  } finally {
    if (needCloseBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}
