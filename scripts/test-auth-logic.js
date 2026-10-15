// scripts/test-auth-logic.js - 인증 로직 단위 검증 스크립트
import crypto from 'crypto';

const SYSTEM_ACCESS_PASSWORD = process.env.SYSTEM_ACCESS_PASSWORD || '2265';
const AUTH_COOKIE_NAME = 'autosurvey_auth';
const AUTH_SECRET = process.env.AUTH_SECRET || 'autosurvey_secure_secret_2026';

function generateAuthToken() {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `authenticated:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  if (signature !== expectedSig) return false;
  const [prefix, expStr] = payload.split(':');
  if (prefix !== 'authenticated') return false;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() > exp) return false;
  return true;
}

console.log('--- 1. 토큰 생성 및 유효성 검증 ---');
const token = generateAuthToken();
console.log('생성된 토큰:', token);
console.log('검증 결과 (기대치: true):', verifyAuthToken(token));

console.log('--- 2. 위변조된 토큰 검증 ---');
const tamperedToken = token + 'fake';
console.log('위조 토큰 검증 (기대치: false):', verifyAuthToken(tamperedToken));

console.log('--- 3. 만료된 토큰 검증 ---');
const expiredPayload = `authenticated:${Date.now() - 10000}`;
const expiredHmac = crypto.createHmac('sha256', AUTH_SECRET).update(expiredPayload).digest('hex');
const expiredToken = `${expiredPayload}.${expiredHmac}`;
console.log('만료 토큰 검증 (기대치: false):', verifyAuthToken(expiredToken));

console.log('--- 4. 비밀번호 일치 확인 ---');
console.log('올바른 패스코드 검증 (기대치: true):', '2265' === SYSTEM_ACCESS_PASSWORD);
console.log('틀린 패스코드 검증 (기대치: false):', 'wrong_pass' === SYSTEM_ACCESS_PASSWORD);
