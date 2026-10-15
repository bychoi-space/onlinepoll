// public/nav-auth.js - 전역 상단 네비게이션 인증 및 로그아웃 유틸

export function initNavAuth() {
  const logoutBtns = document.querySelectorAll('.btn-pill-logout, #btn-global-logout');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('로그아웃 하시겠습니까?')) {
        return;
      }
      try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
          window.location.href = '/login.html';
        } else {
          window.location.href = '/login.html';
        }
      } catch (err) {
        console.error('Logout error:', err);
        window.location.href = '/login.html';
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavAuth);
} else {
  initNavAuth();
}
