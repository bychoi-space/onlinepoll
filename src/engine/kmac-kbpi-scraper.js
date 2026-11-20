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
  await page.goto(KMAC_ISURVEY_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(1500);

  // 아이디 / 비밀번호 입력
  const idInput = page.locator('input[type="text"], input[name*="id" i], input[placeholder*="아이디"]').first();
  const pwInput = page.locator('input[type="password"]').first();
  await idInput.waitFor({ state: 'visible', timeout: 15000 });
  await idInput.fill(String(loginId));
  await pwInput.fill(String(loginPw || loginId));
  await page.waitForTimeout(300);

  const loginBtn = page.locator('button:has-text("로그인"), input[type="submit"], a:has-text("로그인")').first();
  await loginBtn.click();
  await page.waitForTimeout(2500);

  // [CAPI로 이동] 버튼 클릭 (새 탭 또는 현재 탭 전환 모두 대응)
  let activePage = page;
  const capiBtn = activePage.locator('button:has-text("CAPI"), a:has-text("CAPI"), :text("CAPI로 이동")').first();
  if ((await capiBtn.count()) > 0) {
    emitLog('[KMA CAPI] "CAPI로 이동" 버튼 클릭...');
    const popupPromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await capiBtn.click();
    const newPage = await popupPromise;
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded').catch(err => emitLog(`새 탭 로드 경고: ${err.message}`, 'warn'));
      activePage = newPage;
    } else {
      await activePage.waitForTimeout(2200);
    }
  }

  // 진행 중인 조사 목록에서 '한국산업의브랜드파워' (ID: 230) 행의 '조사시작' 클릭
  await activePage.waitForTimeout(1500);
  const projectStartBtn = activePage
    .locator('tr:has-text("브랜드파워") button:has-text("조사시작"), tr:has-text("브랜드파워") a:has-text("조사시작"), tr:has-text("230") button:has-text("조사시작"), button:has-text("조사시작"), a:has-text("조사시작")')
    .first();

  if ((await projectStartBtn.count()) > 0) {
    emitLog('[KMA CAPI] "2027년 한국산업의브랜드파워(K-BPI) 조사" [조사시작] 진입...');
    const popupPromise2 = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await projectStartBtn.click();
    const newPage2 = await popupPromise2;
    if (newPage2) {
      await newPage2.waitForLoadState('domcontentloaded').catch(err => emitLog(`리스트 탭 로드 경고: ${err.message}`, 'warn'));
      activePage = newPage2;
    } else {
      await activePage.waitForTimeout(2200);
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
