/**
 * 시스템 접근 제어 미들웨어, 패스코드 인증 API 및 실시간 SSE(/api/events, /api/logs) 라우트
 */
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const MASTER_PASSWORD = process.env.SYSTEM_ACCESS_PASSWORD || '2265';
const AUTH_COOKIE_NAME = 'autosurvey_auth';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';

function generateAuthToken(password) {
  return crypto.createHmac('sha256', TOKEN_SALT).update(String(password).trim()).digest('hex');
}

const VALID_AUTH_TOKEN = generateAuthToken(MASTER_PASSWORD);
const VALID_AUTH_TOKEN_BUF = Buffer.from(VALID_AUTH_TOKEN, 'utf8');

function isValidAuthToken(candidate) {
  if (typeof candidate !== 'string' || !candidate) return false;
  const candidateBuf = Buffer.from(candidate, 'utf8');
  if (candidateBuf.length !== VALID_AUTH_TOKEN_BUF.length) return false;
  return crypto.timingSafeEqual(candidateBuf, VALID_AUTH_TOKEN_BUF);
}

export function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const value = decodeURIComponent(parts.join('='));
    if (name) list[name] = value;
  });
  return list;
}

export function authGate(req, res, next) {
  const p = req.path;

  // 1. 화이트리스트 (로그인 화면, 로그인 스크립트, 인증 API, 정적 스타일/폰트 리소스)
  const isWhitelist =
    p === '/login.html' ||
    p === '/login.js' ||
    p === '/api/auth/login' ||
    p === '/api/auth/logout' ||
    p === '/api/auth/check' ||
    p === '/favicon.ico' ||
    /\.(css|png|jpg|jpeg|svg|woff|woff2|ttf|ico)$/i.test(p);

  if (isWhitelist) {
    return next();
  }

  // 2. 인증 쿠키 검증
  const cookies = parseCookies(req);
  const token = cookies[AUTH_COOKIE_NAME];

  if (isValidAuthToken(token)) {
    return next();
  }

  // 3. 미인증 처리
  if (p.startsWith('/api/')) {
    return res.status(401).json({ error: '인증이 필요합니다.', requireAuth: true });
  }

  // 브라우저 페이지 요청 시 로그인 게이트로 리다이렉트
  return res.redirect('/login.html');
}

export function registerAuthAndSseRoutes(app) {
  const handleSse = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    logger.addClient(res, req.query.campaignId || null);
  };

  app.get('/api/events', handleSse);
  app.get('/api/logs', handleSse);

  app.post('/api/auth/login', (req, res) => {
    const password = req.body?.password || req.body?.passcode;
    if (!password) {
      return res.status(400).json({ success: false, error: '비밀번호를 입력해 주세요.' });
    }

    if (isValidAuthToken(generateAuthToken(password))) {
      const maxAgeSec = 7 * 24 * 60 * 60; // 7일
      res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${VALID_AUTH_TOKEN}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax`);
      logger.info('🔑 시스템 관리자 패스코드 인증 성공');
      return res.json({ success: true, message: '인증 성공' });
    }

    logger.warn('⚠️ 시스템 접근 패스코드 불일치 시도 감지');
    return res.status(401).json({ success: false, error: '패스코드가 일치하지 않습니다.' });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    logger.info('🔒 시스템 관리자 로그아웃 완료');
    return res.json({ success: true, message: '로그아웃되었습니다.' });
  });

  app.get('/api/auth/check', (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[AUTH_COOKIE_NAME];
    const authenticated = isValidAuthToken(token);
    res.json({ authenticated });
  });
}
