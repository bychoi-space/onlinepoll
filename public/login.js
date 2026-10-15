/**
 * AutoSurvey AI - 로그인 게이트 스크립트 (login.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('login-form');
  const inputPasscode = document.getElementById('input-passcode');
  const btnTogglePw = document.getElementById('btn-toggle-pw');
  const btnSubmit = document.getElementById('btn-submit-login');
  const errorMsg = document.getElementById('login-error-msg');
  const loginCard = document.getElementById('login-card');

  // 1. 이미 유효한 인증 쿠키가 있는 경우 대시보드로 자동 이동
  try {
    const res = await fetch('/api/auth/check');
    const data = await res.json();
    if (data.authenticated) {
      window.location.href = 'index.html';
      return;
    }
  } catch (_) {}

  // 2. 비밀번호 보기 / 숨기기 토글
  if (btnTogglePw && inputPasscode) {
    btnTogglePw.addEventListener('click', () => {
      const isPassword = inputPasscode.type === 'password';
      inputPasscode.type = isPassword ? 'text' : 'password';
      btnTogglePw.textContent = isPassword ? '숨김' : '보기';
    });
  }

  // 3. 로그인 폼 제출
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = inputPasscode.value.trim();
      if (!password) return;

      errorMsg.classList.add('hidden');
      btnSubmit.disabled = true;
      btnSubmit.textContent = '인증 확인 중...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          btnSubmit.textContent = '입장 중...';
          // 인증 성공 시 대시보드로 이동
          window.location.href = 'index.html';
        } else {
          // 실패 시 흔들림 애니메이션 및 오류 메시지
          errorMsg.textContent = data.error || '패스코드가 일치하지 않습니다.';
          errorMsg.classList.remove('hidden');
          
          loginCard.classList.remove('shake-card');
          // 리플로우 강제 후 다시 클래스 추가
          void loginCard.offsetWidth;
          loginCard.classList.add('shake-card');

          inputPasscode.value = '';
          inputPasscode.focus();
        }
      } catch (err) {
        errorMsg.textContent = '서버 연결에 실패했습니다. 다시 시도해 주세요.';
        errorMsg.classList.remove('hidden');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '시스템 작업실 입장';
      }
    });
  }
});
