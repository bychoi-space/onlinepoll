// scripts/test-server-integration.js
process.env.PORT = '3099';
process.env.SYSTEM_ACCESS_PASSWORD = '2265';

// server.js import 시 내부의 app.listen(3099)이 실행됨
await import('../src/server.js');

const PORT = 3099;
const baseUrl = `http://127.0.0.1:${PORT}`;

async function runTests() {
  console.log('[Integration Test] 테스트 시작...');

  // 1. 미인증 상태로 /index.html 접근 시 리다이렉트(/login.html) 검증
  const r1 = await fetch(`${baseUrl}/index.html`, { redirect: 'manual' });
  console.log('1. /index.html 미인증 접근 상태코드:', r1.status);
  console.log('   Location 헤더:', r1.headers.get('location'));
  const test1Passed = r1.status === 302 && r1.headers.get('location') === '/login.html';

  // 2. 미인증 상태로 /api/campaigns 접근 시 401 Unauthorized 검증
  const r2 = await fetch(`${baseUrl}/api/campaigns`);
  console.log('2. /api/campaigns 미인증 접근 상태코드:', r2.status);
  const test2Passed = r2.status === 401;

  // 3. 잘못된 패스코드로 로그인 시도 검증
  const r3 = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'wrong_password' })
  });
  console.log('3. 틀린 비밀번호 로그인 시도 상태코드:', r3.status);
  const test3Passed = r3.status === 401;

  // 4. 올바른 패스코드로 로그인 시도 및 쿠키 수령 검증
  const r4 = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: '2265' })
  });
  console.log('4. 올바른 비밀번호 로그인 시도 상태코드:', r4.status);
  const setCookie = r4.headers.get('set-cookie');
  console.log('   수령한 쿠키:', setCookie ? setCookie.slice(0, 45) + '...' : 'null');
  const test4Passed = r4.status === 200 && setCookie && setCookie.includes('autosurvey_auth=');

  // 5. 쿠키를 지참하고 /index.html 및 /api/campaigns 접근 검증
  const cookieHeader = setCookie ? setCookie.split(';')[0] : '';
  const r5 = await fetch(`${baseUrl}/index.html`, {
    headers: { Cookie: cookieHeader },
    redirect: 'manual'
  });
  console.log('5. 인증 쿠키 지참 /index.html 접근 상태코드:', r5.status);
  const test5Passed = r5.status === 200;

  // 6. 로그아웃 API 호출 검증
  const r6 = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  console.log('6. 로그아웃 호출 상태코드:', r6.status);
  const logoutCookie = r6.headers.get('set-cookie');
  console.log('   로그아웃 쿠키 만료 여부:', logoutCookie && logoutCookie.includes('Max-Age=0'));
  const test6Passed = r6.status === 200 && logoutCookie && logoutCookie.includes('Max-Age=0');

  console.log('----------------------------------------------------');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed && test6Passed) {
    console.log('🎉 [SUCCESS] 모든 인증 게이트 및 미들웨어 통합 테스트 100% 통과!');
  } else {
    console.error('❌ [FAIL] 일부 테스트 항목 실패');
  }
  console.log('----------------------------------------------------');
  process.exit(0);
}

// 500ms 후 테스트 실행
setTimeout(runTests, 500);
