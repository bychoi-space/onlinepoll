/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사]
 * KMA Research 통합시스템(isurvey.kmaresearch.co.kr ➔ CAPI ID:230) 로그인 및 슬롯 현황 스크래퍼
 */
import { launchChromium } from '../utils/chromium-launcher.js';
import { KBPI_DEFAULT_LOGIN_ID } from '../utils/kmac-kbpi-sheet-sync.js';

export const KMAC_ISURVEY_LOGIN_URL = 'https://isurvey.kmaresearch.co.kr/sy/login';

/**
 * KMA Research 통합시스템에 로그인한 뒤 CAPI 대시보드 -> '2027년 한국산업의브랜드파워(K-BPI) 조사' 슬롯 목록 화면으로 이동
 */
export async function loginAndEnterKbpiCapiList({
  context,
  page,
  loginId = KBPI_DEFAULT_LOGIN_ID,
  loginPw = KBPI_DEFAULT_LOGIN_ID,
  emitLog = () => {}
}) {
  emitLog(`[KMA 로그인] ${KMAC_ISURVEY_LOGIN_URL} 접속 중 (ID: ${loginId})...`);
  const gotoResp = await page.goto(KMAC_ISURVEY_LOGIN_URL, { waitUntil: 'load', timeout: 35000 }).catch(async (navErr) => {
    emitLog(`[KMA 로그인 로드 경고] ${navErr.message}`, 'warn');
    return null;
  });
  const httpStatus = gotoResp ? gotoResp.status() : 0;
  await page.waitForTimeout(1500);

  const fillLoginForm = async (targetPg) => {
    const idSelector = 'input[type="text"], input[type="tel"], input[name*="id" i], input[placeholder*="아이디"], input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])';
    const idInput = targetPg.locator(idSelector).first();
    const pwInput = targetPg.locator('input[type="password"]').first();
    try {
      await idInput.waitFor({ state: 'visible', timeout: 18000 });
    } catch (waitErr) {
      const diag = await targetPg.evaluate(() => ({
        url: location.href,
        title: document.title || '',
        text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        html: (document.body?.innerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 300)
      })).catch(e => ({ err: e.message }));
      throw new Error(`로그인 입력창 미노출 (HTTP ${httpStatus}) | 진단=${JSON.stringify(diag)} | 원인=${waitErr.message.split('\n')[0]}`);
    }
    await idInput.click();
    await idInput.fill(String(loginId));
    await pwInput.click();
    await pwInput.fill(String(loginPw || loginId));
    await targetPg.waitForTimeout(300);

    const loginBtn = targetPg.locator('button:has-text("로그인"), input[type="submit"], a:has-text("로그인"), button[type="submit"]').first();
    await loginBtn.click();
  };

  await fillLoginForm(page);

  // 1) 로그인 완료 후 대시보드('CAPI로 이동' 카드) 또는 CAPI 화면이 나타날 때까지 최대 15초 대기
  let activePage = page;
  for (let waitIdx = 0; waitIdx < 30; waitIdx++) {
    await activePage.waitForTimeout(500);
    const state = await activePage.evaluate(() => {
      const txt = (document.body?.innerText || '');
      return {
        url: location.href,
        hasCapiMove: /CAPI로\s*이동/.test(txt) || /현장\s*조사[\s\S]{0,40}CAPI/.test(txt),
        hasProjectList: /진행\s*중인\s*조사/.test(txt) || /브랜드파워/.test(txt)
      };
    }).catch(err => ({ url: '', hasCapiMove: false, hasProjectList: false, err: err.message }));
    if (state.hasCapiMove || state.hasProjectList) break;
  }

  // 2) [CAPI로 이동] 버튼 클릭 (새 탭 또는 현재 탭 이동 모두 감지)
  const capiMoveLoc = activePage.locator(
    'button:has-text("CAPI로 이동"), a:has-text("CAPI로 이동"), :text("CAPI로 이동")'
  ).first();
  const capiFallbackLoc = activePage.locator('button:has-text("CAPI"), a:has-text("CAPI")').first();
  const capiTarget = (await capiMoveLoc.count()) > 0 ? capiMoveLoc : capiFallbackLoc;

  if ((await capiTarget.count()) > 0) {
    emitLog(`[KMA CAPI] "CAPI로 이동" 클릭 (현재 URL: ${activePage.url()})...`);
    const popupPromise = context.waitForEvent('page', { timeout: 7000 }).catch(err => {
      emitLog(`CAPI 동일 탭 전환 대기 (${err.message.split('\n')[0]})`, 'info');
      return null;
    });
    await capiTarget.click();
    const newPage = await popupPromise;
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded').catch(err => emitLog(`새 탭 로드 경고: ${err.message}`, 'warn'));
      activePage = newPage;
    }
  }

  // 3) CAPI 진입 후 SSO('신규 통합로그인') 중간 관문 또는 '조사시작'(ID: 230) 화면 대기
  for (let waitIdx = 0; waitIdx < 30; waitIdx++) {
    await activePage.waitForTimeout(600);
    const pages = context.pages();
    if (pages.length > 0 && pages[pages.length - 1] !== activePage) {
      const latestPg = pages[pages.length - 1];
      if (latestPg.url() && latestPg.url() !== 'about:blank') {
        activePage = latestPg;
      }
    }

    const capiState = await activePage.evaluate(() => {
      const bodyTxt = (document.body?.innerText || '');
      const ssoBtn = Array.from(document.querySelectorAll('button, a, input[type="button"], span, div'))
        .find(el => {
          const t = (el.innerText || el.value || '').trim();
          return el.offsetParent !== null && /^(신규\s*통합\s*로그인|신규\s*통합로그인|통합\s*로그인|통합로그인)$/.test(t);
        });
      if (ssoBtn) ssoBtn.setAttribute('data-kbpi-sso-btn', '1');
      return {
        url: location.href,
        hasSsoBtn: Boolean(ssoBtn),
        hasLoginInputs: document.querySelectorAll('input[type="password"]').length > 0 && /리서치\s*통합시스템/.test(bodyTxt),
        hasProjectRow: /브랜드파워|조사시작/.test(bodyTxt),
        hasSlotList: /최종\s*id/i.test(bodyTxt) || (/조사지역/.test(bodyTxt) && /실사코드/.test(bodyTxt))
      };
    }).catch(err => ({ url: '', err: err.message }));

    if (capiState.hasSlotList || capiState.hasProjectRow) {
      break;
    }
    if (capiState.hasSsoBtn) {
      emitLog(`[KMA CAPI] CAPI 초기 화면 "신규 통합로그인" 버튼 감지 ➔ 클릭 (${capiState.url})`);
      const ssoLoc = activePage.locator('[data-kbpi-sso-btn="1"]').first();
      const ssoPopupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
      await ssoLoc.click().catch(err => emitLog(`SSO 클릭 경고: ${err.message}`, 'warn'));
      const ssoPopup = await ssoPopupPromise;
      if (ssoPopup) activePage = ssoPopup;
      await activePage.waitForTimeout(1500);
      continue;
    }
    if (capiState.hasLoginInputs) {
      emitLog('[KMA CAPI] 통합시스템 재로그인 폼 감지 ➔ 자격증명 자동 재입력...');
      await fillLoginForm(activePage).catch(err => emitLog(`재로그인 경고: ${err.message}`, 'warn'));
      await activePage.waitForTimeout(1500);
    }
  }

  // 4) 진행 중인 조사 목록에서 '2027년 한국산업의브랜드파워(K-BPI) 조사' (ID: 230) 행의 [조사시작] 클릭
  const clickedProjectStart = await activePage.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr, .row, li, div'));
    const targetRow = rows.find(r => {
      const t = (r.innerText || '').trim();
      return (/브랜드파워/.test(t) || /\b230\b/.test(t)) && /조사\s*시작/.test(t) && t.length < 400;
    });
    const scope = targetRow || document;
    const candidates = Array.from(scope.querySelectorAll('button, a, input[type="button"], span, div'))
      .filter(el => el.offsetParent !== null && /^조사\s*시작$/.test((el.innerText || el.value || '').trim()));
    // 가장 안쪽(leaf에 가까운) 요소 선택
    const best = candidates.sort((a, b) => a.innerHTML.length - b.innerHTML.length)[0];
    if (best) {
      best.setAttribute('data-kbpi-proj-start', '1');
      return { found: true, url: location.href };
    }
    return { found: false, url: location.href };
  }).catch(err => ({ found: false, err: err.message }));

  if (clickedProjectStart.found) {
    emitLog(`[KMA CAPI] 프로젝트(ID: 230) [조사시작] 클릭 (URL: ${clickedProjectStart.url})...`);
    const projBtn = activePage.locator('[data-kbpi-proj-start="1"]').first();
    const popupPromise2 = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await projBtn.click();
    const newPage2 = await popupPromise2;
    if (newPage2) {
      await newPage2.waitForLoadState('domcontentloaded').catch(err => emitLog(`리스트 탭 로드 경고: ${err.message}`, 'warn'));
      activePage = newPage2;
    }
  }

  // 5) 응답자 슬롯 테이블(최종id / 조사지역 / 시작 버튼) 렌더링 완료까지 최대 15초 대기
  for (let waitIdx = 0; waitIdx < 25; waitIdx++) {
    await activePage.waitForTimeout(600);
    const ready = await activePage.evaluate(() => {
      const txt = (document.body?.innerText || '');
      const hasHeaders = /최종\s*id/i.test(txt) || /실사코드/.test(txt) || /고유번호/.test(txt);
      const rowCnt = document.querySelectorAll('table tbody tr, [role="row"], .ag-row, .tui-grid-row').length;
      return { url: location.href, hasHeaders, rowCnt };
    }).catch(() => ({ url: '', hasHeaders: false, rowCnt: 0 }));
    if (ready.hasHeaders && ready.rowCnt > 0) {
      emitLog(`[KMA CAPI] 슬롯 리스트 로드 완료 (URL: ${ready.url}, 감지 행 수: ${ready.rowCnt})`);
      break;
    }
  }

  return activePage;
}

/**
 * CAPI 슬롯 목록 화면에서 전체 슬롯(고유번호/최종id/상태/진행율) 현황을 스크랩
 */
export async function scrapeKmacKbpiSlots({
  loginId = KBPI_DEFAULT_LOGIN_ID,
  loginPw = KBPI_DEFAULT_LOGIN_ID,
  proxyServer = '',
  emitLog = () => {}
} = {}) {
  const effectiveProxy = proxyServer || process.env.KBPI_PROXY_SERVER || '';
  const browser = await launchChromium({
    headless: true,
    args: ['--ignore-certificate-errors'],
    ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    const listPage = await loginAndEnterKbpiCapiList({
      context,
      page,
      loginId,
      loginPw,
      emitLog
    });

    const scraped = await listPage.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('table thead th')).map(th => (th.innerText || '').trim());
      const rows = [];
      document.querySelectorAll('table tbody tr').forEach((tr) => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim());
        const rowText = (tr.innerText || '').trim();
        const uidMatch = rowText.match(/Q\d{10,}/);
        const startBtn = tr.querySelector('button, a');
        if (tds.length >= 5) {
          rows.push({
            cells: tds,
            uid: uidMatch ? uidMatch[0] : '',
            actionText: startBtn ? (startBtn.innerText || '').trim() : '',
            actionHref: startBtn && startBtn.getAttribute ? (startBtn.getAttribute('href') || startBtn.getAttribute('onclick') || '') : ''
          });
        }
      });
      return {
        url: location.href,
        title: document.title,
        headers,
        rows
      };
    });

    return {
      success: true,
      ...scraped
    };
  } finally {
    await browser.close().catch(err => console.warn('[K-BPI Scraper close 경고]', err.message));
  }
}
