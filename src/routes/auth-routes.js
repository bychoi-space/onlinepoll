/**
 * 시스템 접근 제어 미들웨어, 패스코드 인증 API(브루트포스 방어 포함) 및 실시간 SSE(/api/events, /api/logs) 라우트
 */
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const MASTER_PASSWORD = process.env.SYSTEM_ACCESS_PASSWORD || '2265';
const AUTH_COOKIE_NAME = 'autosurvey_auth';
const TOKEN_SALT = process.env.AUTH_TOKEN_SALT || 'autosurvey_secure_salt_2026';

// 패스코드 브루트포스 방어 (IP당 5분 내 최대 10회 실패 허용)
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_FAILURES = 10;
const loginAttempts = new Map(); // ip -> { count, resetAt }

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  for (const [k, v] of loginAttempts.entries()) {
    if (now > v.resetAt) loginAttempts.delete(k);
  }
  const entry = loginAttempts.get(ip);
  if (!entry) return { blocked: false, retrySec: 0 };
  if (entry.count >= MAX_LOGIN_FAILURES && now < entry.resetAt) {
    return {
      blocked: true,
      retrySec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    };
  }
  return { blocked: false, retrySec: 0 };
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const prev = loginAttempts.get(ip);
  if (!prev || now > prev.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    prev.count += 1;
  }
}

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

  // 1. 화이트리스트 (로그인 화면, 로그인 스크립트, 인증 API, 공개 정적 스타일/폰트/파비콘만 허용 — /reports/ 스크린샷은 제외!)
  const isProtectedReport = p === '/reports' || p.startsWith('/reports/');
  const isWhitelist =
    !isProtectedReport && (
      p === '/login.html' ||
      p === '/login.js' ||
      p === '/api/auth/login' ||
      p === '/api/auth/logout' ||
      p === '/api/auth/check' ||
      p === '/favicon.ico' ||
      /\.(css|png|jpg|jpeg|svg|woff|woff2|ttf|ico)$/i.test(p)
    );

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
  if (p.startsWith('/api/') || isProtectedReport) {
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
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    logger.addClient(res, req.query.campaignId || null);
  };

  app.get('/api/events', handleSse);
  app.get('/api/logs', handleSse);

  app.post('/api/auth/login', (req, res) => {
    const ip = getClientIp(req);
    const limit = checkLoginRateLimit(ip);
    if (limit.blocked) {
      return res.status(429).json({
        success: false,
        error: `인증 실패 횟수가 초과되었습니다. ${limit.retrySec}초 후 다시 시도해 주세요.`
      });
    }

    const password = req.body?.password || req.body?.passcode;
    if (!password) {
      return res.status(400).json({ success: false, error: '비밀번호를 입력해 주세요.' });
    }

    if (isValidAuthToken(generateAuthToken(password))) {
      loginAttempts.delete(ip);
      const maxAgeSec = 7 * 24 * 60 * 60; // 7일
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const secureAttr = isHttps ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${VALID_AUTH_TOKEN}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureAttr}`);
      logger.info('🔑 시스템 관리자 패스코드 인증 성공');
      return res.json({ success: true, message: '인증 성공' });
    }

    recordLoginFailure(ip);
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
