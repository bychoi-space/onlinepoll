/**
 * AutoSurvey AI - 공통 Playwright Chromium 실행 옵션 및 런처 모듈 (chromium-launcher.js)
 *
 * - Windows / macOS(번들 Playwright Chromium) 및 Linux / Cloud VM(`/usr/bin/chromium` 등)
 *   모든 실행 환경에서 동일한 브라우저 탐색 우선순위와 샌드박스 안전 플래그를 보장합니다.
 */
import fs from 'fs';

const DEFAULT_CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage'
];

const SYSTEM_CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
];

/**
 * 현재 시스템에서 실행 가능한 Chromium 바이너리 경로를 탐색합니다.
 * Playwright 기본 번들 브라우저가 존재하면 undefined를 반환하여 기본값을 사용합니다.
 * @param {object} [chromiumMod]
 * @returns {string|undefined}
 */
export function resolveChromiumExecutablePath(chromiumMod = null) {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  if (chromiumMod && typeof chromiumMod.executablePath === 'function') {
    try {
      const bundledPath = chromiumMod.executablePath();
      if (bundledPath && fs.existsSync(bundledPath)) {
        return undefined;
      }
    } catch (_) {
      // 번들 브라우저 미설치 환경에서는 시스템 경로 폴백 진행
    }
  }

  for (const candidate of SYSTEM_CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Playwright chromium.launch()에 전달할 표준 옵션을 생성합니다.
 * @param {object} [overrides={}]
 * @param {object} [chromiumMod=null]
 * @returns {object}
 */
export function resolveChromiumLaunchOptions(overrides = {}, chromiumMod = null) {
  const {
    headless = true,
    args = [],
    executablePath,
    ...rest
  } = overrides;

  const mergedArgs = Array.from(new Set([
    ...DEFAULT_CHROMIUM_ARGS,
    ...(Array.isArray(args) ? args : [])
  ]));

  const resolvedExe = executablePath || resolveChromiumExecutablePath(chromiumMod);

  return {
    headless: Boolean(headless),
    args: mergedArgs,
    ...(resolvedExe ? { executablePath: resolvedExe } : {}),
    ...rest
  };
}

const launchListeners = new Set();

/**
 * Chromium 인스턴스 기동 시 호출될 생명주기 리스너를 등록합니다.
 * (예: 캠페인 중지 시 실행 중인 브라우저 즉시 종료용)
 * @param {(browser: import('playwright').Browser) => void} listener
 */
export function onChromiumLaunched(listener) {
  if (typeof listener === 'function') {
    launchListeners.add(listener);
  }
}

/**
 * 표준 런치 옵션이 적용된 Playwright Chromium 브라우저 인스턴스를 기동합니다.
 * @param {object} [overrides={}]
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchChromium(overrides = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(resolveChromiumLaunchOptions(overrides, chromium));
  for (const listener of launchListeners) {
    try {
      listener(browser);
    } catch (err) {
      console.warn('[ChromiumLauncher] 기동 리스너 실행 경고:', err.message);
    }
  }
  return browser;
}
