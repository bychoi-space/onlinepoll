<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>시스템 접근 인증 - AutoSurvey AI</title>
  
  <!-- Pretendard Font (Variable & Standard) -->
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  
  <!-- CSS Stylesheets -->
  <link rel="stylesheet" href="tokens.css">
  <link rel="stylesheet" href="figma-base.css">
  <link rel="stylesheet" href="campaign.css">
  <link rel="stylesheet" href="custom-styles.css">
</head>
<body class="login-gate-body">

  <div class="login-gate-wrapper">
    <div class="clean-section-card login-gate-card" id="login-card">
      
      <!-- 상단 브랜드 헤더 -->
      <div class="login-header-area">
        <div class="login-badge-wrap">
          <span class="login-security-badge">SECURITY ACCESS GATE</span>
        </div>
        <h1 class="login-brand-title">AutoSurvey AI</h1>
        <p class="login-brand-desc">지능형 온라인 설문조사 자동화 시스템</p>
      </div>

      <!-- 패스코드 입력 폼 -->
      <form id="login-form" class="login-form">
        <div class="form-group mb-16">
          <label for="input-passcode" class="figma-label font-bold mb-8">
            시스템 접근 패스코드
          </label>
          <div class="login-input-wrap">
            <input 
              type="password" 
              id="input-passcode" 
              class="figma-input login-input font-mono" 
              placeholder="패스코드를 입력하세요" 
              autocomplete="current-password"
              required 
              autofocus 
            />
            <button type="button" id="btn-toggle-pw" class="btn-toggle-password" aria-label="비밀번호 보기 토글">
              보기
            </button>
          </div>
          <div id="login-error-msg" class="login-error-msg hidden">
            패스코드가 일치하지 않습니다. 다시 입력해 주세요.
          </div>
        </div>

        <button type="submit" id="btn-submit-login" class="btn-pill btn-pill-primary w-full btn-login-submit">
          시스템 작업실 입장
        </button>
      </form>

      <!-- 하단 보안 안내 -->
      <div class="login-footer-info">
        <p class="login-notice-text">
          인가된 리서치 관리자 전용 시스템입니다.<br>
          패스코드 분실 시 서버 관리자에게 문의하세요.
        </p>
      </div>

    </div>
  </div>

  <script type="module" src="login.js"></script>
</body>
</html>
