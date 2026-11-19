// public/nav-auth.js - 전역 상단 네비게이션 인증, 401 세션 가드 및 접근성 모달 초기화
import { bindAccessibleModals, showConfirmModal } from './ui-feedback.js';

function installGlobal401FetchGuard() {
  if (
    typeof window === 'undefined' ||
    !window.HTMLElement ||
    typeof window.fetch !== 'function' ||
    window.__autoSurveyFetchGuarded
  ) {
    return;
  }

  window.__autoSurveyFetchGuarded = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function guardedFetch(input, init) {
    const res = await nativeFetch(input, init);
    try {
      const reqUrl = typeof input === 'string'
        ? input
        : (input && typeof input.url === 'string' ? input.url : '');
      const isApiCall = reqUrl.startsWith('/api/') || reqUrl.includes('/api/');
      const isAuthEndpoint = reqUrl.includes('/api/auth/');
      const isLoginPage = window.location?.pathname?.endsWith('/login.html') || window.location?.pathname === '/login';

      if (res && res.status === 401 && isApiCall && !isAuthEndpoint && !isLoginPage) {
        window.location.href = '/login.html';
      }
    } catch (_) {
      // Ignore URL inspection errors so original response is always returned
    }
    return res;
  };
}

export function initNavAuth() {
  installGlobal401FetchGuard();
  bindAccessibleModals();

  const logoutBtns = document.querySelectorAll('.btn-pill-logout, #btn-global-logout');
  logoutBtns.forEach(btn => {
    if (btn.dataset.logoutBound === '1') return;
    btn.dataset.logoutBound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const ok = await showConfirmModal({
        title: '로그아웃 확인',
        message: '현재 작업 세션에서 로그아웃 하시겠습니까?',
        confirmText: '로그아웃',
        cancelText: '취소'
      });
      if (!ok) {
        return;
      }
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        window.location.href = '/login.html';
      }
    });
  });
}

installGlobal401FetchGuard();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavAuth);
} else {
  initNavAuth();
}
