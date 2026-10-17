// 대한민국 표준시 (KST) 강제 설정
process.env.TZ = 'Asia/Seoul';

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 로컬 .env 환경변수 로드
if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env');
  } catch (e) {
    // env 로드 실패 시 무시
  }
}
import crypto from 'crypto';
import { logger } from './utils/logger.js';
import * as CampaignStore from './models/campaign.js';
import { exportBusinessesToExcel } from './utils/excel.js';
import { runKstatSurvey } from './engine/kstat-runner.js';
import { getIndustryGroupKey } from './engine/persona-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// 단일 패스코드 기반 인증 설정
const MASTER_PASSWORD = process.env.SYSTEM_ACCESS_PASSWORD || '2265';
const AUTH_COOKIE_NAME = 'autosurvey_auth';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';

function generateAuthToken(password) {
  return crypto.createHmac('sha256', TOKEN_SALT).update(String(password).trim()).digest('hex');
}

const VALID_AUTH_TOKEN = generateAuthToken(MASTER_PASSWORD);

// 쿠키 파싱 헬퍼
function parseCookies(req) {
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

// 접근 제어 미들웨어
function authGate(req, res, next) {
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

  if (token && token === VALID_AUTH_TOKEN) {
    return next();
  }

  // 3. 미인증 처리
  if (p.startsWith('/api/')) {
    return res.status(401).json({ error: '인증이 필요합니다.', requireAuth: true });
  }

  // 브라우저 페이지 요청 시 로그인 게이트로 리다이렉트
  return res.redirect('/login.html');
}

// 미들웨어 등록
app.use(cors());
app.use(express.json());
app.use(authGate); // 모든 정적 파일 및 API 보호
app.use(express.static(path.join(rootDir, 'public')));
// 리포트 및 쿼터 디렉터리 준비
const reportsDir = path.join(rootDir, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}
app.use('/reports', express.static(reportsDir));

const dataDir = path.join(rootDir, 'data');
const quotasDir = path.join(dataDir, 'quotas');
if (!fs.existsSync(quotasDir)) {
  fs.mkdirSync(quotasDir, { recursive: true });
}

// 작업 상태 관리
let currentTask = {
  isRunning: false,
  campaignId: null,
  surveyConfig: null,
  progress: { current: 0, total: 0, percent: 0 },
  startTime: null
};

// 서버 기동 시 비정상 중단된 running 상태 초기화
try {
  const allBootCamps = CampaignStore.getAllCampaigns();
  allBootCamps.forEach(camp => {
    let needSave = false;
    if (camp.status === 'running') {
      camp.status = 'ready';
      needSave = true;
    }
    if (Array.isArray(camp.quotaDatabase)) {
      camp.quotaDatabase.forEach(q => {
        if (q.quotaStatus === 'running') {
          q.quotaStatus = 'ready';
          needSave = true;
        }
      });
    }
    if (needSave) {
      CampaignStore.updateCampaign(camp.id, { status: camp.status, quotaDatabase: camp.quotaDatabase });
    }
  });
} catch (_) {}

// SSE 엔드포인트
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  logger.addClient(res);
  logger.info('실시간 이벤트 스트림이 연결되었습니다.');
});

// ==========================================
// [0] 시스템 접근 제어 인증 REST API
// ==========================================

// 인증 API: 패스코드 로그인
app.post('/api/auth/login', (req, res) => {
  const password = req.body?.password || req.body?.passcode;
  if (!password) {
    return res.status(400).json({ success: false, error: '비밀번호를 입력해 주세요.' });
  }

  if (String(password).trim() === MASTER_PASSWORD) {
    const maxAgeSec = 7 * 24 * 60 * 60; // 7일
    res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${VALID_AUTH_TOKEN}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`);
    logger.info('🔑 시스템 관리자 패스코드 인증 성공');
    return res.json({ success: true, message: '인증 성공' });
  }

  logger.warn('⚠️ 시스템 접근 패스코드 불일치 시도 감지');
  return res.status(401).json({ success: false, error: '패스코드가 일치하지 않습니다.' });
});

// 인증 API: 로그아웃
app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`);
  logger.info('🔒 시스템 관리자 로그아웃 완료');
  return res.json({ success: true, message: '로그아웃되었습니다.' });
});

// 인증 API: 현재 인증 상태 확인
app.get('/api/auth/check', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[AUTH_COOKIE_NAME];
  const authenticated = token === VALID_AUTH_TOKEN;
  res.json({ authenticated });
});

// ==========================================
// [1] 캠페인(설문조사 목차) 관리 REST API
// ==========================================

// 전체 캠페인 목록 조회
app.get('/api/campaigns', (req, res) => {
  const campaigns = CampaignStore.getAllCampaigns();
  res.json(campaigns);
});

// 새 캠페인 생성
app.post('/api/campaigns', (req, res) => {
  const newCamp = CampaignStore.createCampaign(req.body);
  logger.info(`[캠페인 생성] "${newCamp.title}" (ID: ${newCamp.id})`);
  res.status(201).json(newCamp);
});

// 특정 캠페인 상세 조회
app.get('/api/campaigns/:id', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }
  res.json(campaign);
});

// 캠페인 정보 수정 (1차/2차 설정 저장)
app.put('/api/campaigns/:id', (req, res) => {
  const updated = CampaignStore.updateCampaign(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }
  res.json(updated);
});

// 캠페인 삭제
app.delete('/api/campaigns/:id', (req, res) => {
  CampaignStore.deleteCampaign(req.params.id);
  res.json({ message: '캠페인이 삭제되었습니다.' });
});

// 캠페인 쿼터 DB 업데이트 (대표자 성별, 나이 등 인라인 수정 및 보관 파일 동기화)
app.put('/api/campaigns/:id/quota', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { quotaDatabase } = req.body;
  if (!Array.isArray(quotaDatabase)) {
    return res.status(400).json({ error: 'quotaDatabase는 배열이어야 합니다.' });
  }

  // 1. 캠페인 쿼터 DB 갱신
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase });

  // 2. 연관된 쿼터 파일(JSON & XLSX) 동기화
  try {
    const quotaFiles = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
    for (const qf of quotaFiles) {
      const qPath = path.join(quotasDir, qf);
      const qContent = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
      if (Array.isArray(qContent.data) && qContent.data.length > 0) {
        let matched = false;
        qContent.data.forEach(qItem => {
          const matchedCampItem = quotaDatabase.find(c => 
            (c.bizNumber && c.bizNumber === qItem.bizNumber) ||
            (c.companyName && c.companyName === qItem.companyName)
          );
          if (matchedCampItem) {
            const syncKeys = ['companyName', 'industry', 'bizNumber', 'ceoName', 'ceoGender', 'ceoAge', 'phone', 'openDate', 'address', 'handledItems', 'mainProducts'];
            syncKeys.forEach(k => {
              if (matchedCampItem[k] !== undefined) qItem[k] = matchedCampItem[k];
            });
            matched = true;
          }
        });
        if (matched) {
          fs.writeFileSync(qPath, JSON.stringify(qContent, null, 2), 'utf-8');
          const xlsxPath = path.join(quotasDir, qf.replace('.json', '.xlsx'));
          exportBusinessesToExcel({
            data: qContent.data,
            columns: qContent.columns,
            filePath: xlsxPath
          });
          logger.info(`[쿼터 동기화] "${qf}" 및 Excel 동기화 완료`);
        }
      }
    }
  } catch (syncErr) {
    logger.warn('[쿼터 동기화 경고]', syncErr.message);
  }

  logger.success(`[캠페인 쿼터 갱신] "${campaign.title}" 쿼터 DB ${quotaDatabase.length}건 저장 완료!`);
  res.json({ success: true, message: '쿼터 DB가 성공적으로 업데이트되었습니다.', count: quotaDatabase.length });
});

// 마스터 설문 블루프린트 조회 API
app.get('/api/campaigns/:id/blueprint', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const blueprintPath = path.join(dataDir, 'kstat_survey_blueprint.json');
  if (!fs.existsSync(blueprintPath)) {
    return res.status(404).json({ error: '마스터 설문 블루프린트 파일이 존재하지 않습니다.' });
  }

  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
  const baseline = campaign.masterBaseline || blueprint.defaultBaseline;

  // 3대 업종 그룹별 대상 점포 통계 및 목록 계산
  const groupStats = {
    group1: { name: '1번 그룹 [식품군]', subtext: '농산물 · 축산물 · 수산물 · 가공식품', count: 0, stores: [] },
    group2: { name: '2번 그룹 [공산·생활·서비스군]', subtext: '의류신발 · 가정용품 · 기타소매 · 근린상권', count: 0, stores: [] },
    group3: { name: '3번 그룹 [외식·음식점업군]', subtext: '음식점업 (한식/중식/피자/카페)', count: 0, stores: [] }
  };
  (campaign.quotaDatabase || []).forEach(q => {
    const k = getIndustryGroupKey(q.industry, q.handledItems);
    if (groupStats[k]) {
      groupStats[k].count++;
      groupStats[k].stores.push(q.companyName);
    }
  });

  const defaultGroupBaselines = {
    group1: {
      ...baseline,
      empSalesLink: 'auto',
      originLabelTarget: 'yes',
      deliveryFoodAdoption: 15,
      deliverySalesRatio: 10,
      onnuriRatio: 18,
      onnuriCustomerAvg: 7,
      onnuriPaperMember: 'yes',
      costRentRatio: 18,
      costLaborRatio: 22,
      costTaxRatio: 10,
      profitMarginRate: 22
    },
    group2: {
      ...baseline,
      empSalesLink: 'auto',
      originLabelTarget: 'no',
      deliveryFoodAdoption: 5,
      deliverySalesRatio: 5,
      creditCardRatio: 72,
      onnuriRatio: 12,
      costRentRatio: 24,
      costLaborRatio: 20,
      costTaxRatio: 10,
      profitMarginRate: 28
    },
    group3: {
      ...baseline,
      empSalesLink: 'auto',
      originLabelTarget: 'yes',
      deliveryFoodAdoption: 85,
      deliverySalesRatio: 35,
      posAdoptionRate: 90,
      smartOrderAdoption: 45,
      costLaborRatio: 32,
      costRentRatio: 22,
      costTaxRatio: 10,
      profitMarginRate: 30,
      fireInsurance: 'yes',
      liabilityInsurance: 'yes',
      dailyBusinessHours: 13
    }
  };

  const groupBaselines = campaign.masterBaseline?.groups || defaultGroupBaselines;

  res.json({
    blueprint,
    baseline,
    groupBaselines,
    groupStats,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    quotaCount: campaign.quotaDatabase?.length || 0,
    hasCustomBaseline: !!campaign.masterBaseline
  });
});

// 마스터 기준점(Baseline Template) 저장 API
app.post('/api/campaigns/:id/baseline', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const baseline = req.body;
  CampaignStore.updateCampaign(campaign.id, {
    masterBaseline: baseline,
    hasMasterBlueprint: true
  });

  logger.success(`[마스터 기준점 저장] 캠페인 "${campaign.title}"의 15단계 마스터 기준점이 저장되었습니다! 🎯`);
  res.json({
    success: true,
    message: '마스터 기준점(Baseline)이 성공적으로 저장되었습니다. 이제 1~24번 전체 배치 자동화를 가동할 수 있습니다.',
    baseline
  });
});

// 다른 캠페인에서 마스터 기준점 복제해오기 API
app.post('/api/campaigns/:id/import-baseline', (req, res) => {
  const { sourceCampaignId } = req.body;
  const targetCamp = CampaignStore.getCampaignById(req.params.id);
  const sourceCamp = CampaignStore.getCampaignById(sourceCampaignId);

  if (!targetCamp) return res.status(404).json({ error: '대상 캠페인을 찾을 수 없습니다.' });
  if (!sourceCamp) return res.status(404).json({ error: '원본 캠페인을 찾을 수 없습니다.' });

  if (!sourceCamp.masterBaseline) {
    return res.status(400).json({ error: `"${sourceCamp.title}" 캠페인에 저장된 마스터 기준점이 없습니다.` });
  }

  const copiedBaseline = JSON.parse(JSON.stringify(sourceCamp.masterBaseline));
  CampaignStore.updateCampaign(targetCamp.id, {
    masterBaseline: copiedBaseline,
    hasMasterBlueprint: true
  });

  logger.success(`[마스터 기준점 복제] "${sourceCamp.title}"의 기준점이 "${targetCamp.title}"로 복사되었습니다.`);
  res.json({
    success: true,
    message: `"${sourceCamp.title}"의 1/2/3그룹 마스터 기준점이 성공적으로 복사되었습니다.`,
    baseline: copiedBaseline
  });
});

// ==========================================
// [2] 1차 제반 작업: 조사 쿼터(Quota) DB 구축 API
// ==========================================
app.post('/api/campaigns/:id/build-quota', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { b2bKeyword, targetCount = 2, selectedFields = [] } = req.body;
  const keyword = b2bKeyword || campaign.quotaConfig?.b2bKeyword || '소프트웨어';
  const count = parseInt(targetCount, 10) || campaign.quotaConfig?.targetCount || 2;

  logger.info(`[1차 작업] 캠페인 "${campaign.title}"의 사업자 제반 DB 구축 시작... (키워드: "${keyword}", 수량: ${count}개)`);

  res.json({ message: '조사 쿼터 DB 수집 작업이 시작되었습니다.', status: 'started' });

  // 비동기 백그라운드 수집 실행
  (async () => {
    try {
      CampaignStore.updateCampaign(campaign.id, { status: 'building' });
      const { fetchMarketBzBusinesses } = await import('./engine/marketbz.js');
      const businesses = await fetchMarketBzBusinesses({ keyword, count });

      if (businesses.length === 0) {
        throw new Error('MarketBz에서 사업자 데이터를 수집하지 못했습니다.');
      }

      // 각 사업자 객체에 초기 쿼터 상태 태그 추가
      const quotaDb = businesses.map((b, idx) => ({
        index: idx + 1,
        ...b,
        quotaStatus: 'ready', // 'ready' | 'used' | 'failed'
        usedAt: null
      }));

      // 캠페인에 저장
      CampaignStore.updateCampaign(campaign.id, {
        status: 'ready',
        quotaConfig: {
          b2bKeyword: keyword,
          targetCount: count,
          selectedFields
        },
        quotaDatabase: quotaDb
      });

      logger.success(`[1차 작업 완료] 캠페인 "${campaign.title}"에 총 ${quotaDb.length}건의 실제 사업자 DB가 구축되었습니다! 🎉`);
    } catch (err) {
      logger.error('[1차 작업 실패] 조사 쿼터 DB 구축 오류:', err);
      CampaignStore.updateCampaign(campaign.id, { status: 'ready' });
    }
  })();
});

// 쿼터 파일을 기존 캠페인으로 불러오기 (Import)
app.post('/api/campaigns/:id/import-quota', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { quotaFileName } = req.body;
  if (!quotaFileName) {
    return res.status(400).json({ error: '불러올 quotaFileName이 필요합니다.' });
  }

  const safeFilename = path.basename(quotaFileName);
  const jsonPath = path.join(quotasDir, safeFilename);

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: '쿼터 파일을 찾을 수 없습니다.' });
  }

  try {
    const quotaMeta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const businesses = quotaMeta.data || [];

    if (businesses.length === 0) {
      return res.status(400).json({ error: '쿼터 파일 내에 사업자 데이터가 없습니다.' });
    }

    // 쿼터 DB 변환
    const quotaDb = businesses.map((b, idx) => ({
      index: idx + 1,
      ...b,
      quotaStatus: 'ready',
      usedAt: null
    }));

    const updated = CampaignStore.updateCampaign(campaign.id, {
      status: 'ready',
      quotaType: 'b2b',
      quotaConfig: {
        quotaSource: 'FILE_IMPORT',
        quotaFileName: safeFilename,
        quotaTitle: quotaMeta.title || safeFilename,
        marketName: quotaMeta.marketName || null,
        targetCount: quotaDb.length,
        selectedFields: (quotaMeta.columns || []).map(c => c.key)
      },
      quotaDatabase: quotaDb
    });

    logger.success(`[쿼터 불러오기 완료] 캠페인 "${campaign.title}"에 "${quotaMeta.title || safeFilename}" (${quotaDb.length}건) 제반 DB가 성공적으로 탑재되었습니다! 🎉`);

    res.json({
      success: true,
      message: `조사 쿼터(${quotaDb.length}건)를 성공적으로 탑재했습니다.`,
      campaign: updated
    });
  } catch (err) {
    logger.error('[쿼터 불러오기 실패]', err);
    res.status(500).json({ error: '쿼터 파일을 불러오는 중 오류가 발생했습니다: ' + err.message });
  }
});

// 쿼터 파일 기반으로 새 설문 캠페인 즉시 생성 (Create from Quota)
app.post('/api/campaigns/create-from-quota', (req, res) => {
  const { quotaFileName, title } = req.body;
  if (!quotaFileName) {
    return res.status(400).json({ error: 'quotaFileName이 필요합니다.' });
  }

  const safeFilename = path.basename(quotaFileName);
  const jsonPath = path.join(quotasDir, safeFilename);

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: '쿼터 파일을 찾을 수 없습니다.' });
  }

  try {
    const quotaMeta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const businesses = quotaMeta.data || [];

    const campTitle = title || quotaMeta.title || `새 설문조사 (${path.basename(safeFilename, '.json')})`;

    const newCamp = CampaignStore.createCampaign({
      title: campTitle,
      description: quotaMeta.marketName 
        ? `${quotaMeta.marketName} 온누리상품권 가맹 소상공인 대상 설문조사`
        : `${quotaMeta.keyword || '사업주'} 대상 설문조사`,
      quotaType: 'b2b'
    });

    const quotaDb = businesses.map((b, idx) => ({
      index: idx + 1,
      ...b,
      quotaStatus: 'ready',
      usedAt: null
    }));

    // 기존 캠페인 중 사용자가 커스텀 설정한 masterBaseline(1/2/3그룹 가이드라인)이 있으면 신규 캠페인에 자동 복제 장착
    let inheritedBaseline = null;
    const allCamps = CampaignStore.getAllCampaigns();
    const sourceWithGroups = allCamps.find(c => c.masterBaseline && c.masterBaseline.groups);
    const sourceWithBaseline = allCamps.find(c => c.masterBaseline);
    const bestSource = sourceWithGroups || sourceWithBaseline;
    if (bestSource && bestSource.masterBaseline) {
      inheritedBaseline = JSON.parse(JSON.stringify(bestSource.masterBaseline));
      logger.info(`[마스터 기준점 자동 계승] 기존 캠페인 "${bestSource.title}"의 1/2/3그룹 기준점 설정을 신규 캠페인에 자동 복제 장착했습니다.`);
    }

    const updated = CampaignStore.updateCampaign(newCamp.id, {
      status: 'ready',
      quotaConfig: {
        quotaSource: 'FILE_IMPORT',
        quotaFileName: safeFilename,
        quotaTitle: quotaMeta.title || safeFilename,
        marketName: quotaMeta.marketName || null,
        targetCount: quotaDb.length,
        selectedFields: (quotaMeta.columns || []).map(c => c.key)
      },
      quotaDatabase: quotaDb,
      masterBaseline: inheritedBaseline,
      hasMasterBlueprint: !!inheritedBaseline
    });

    logger.success(`[새 설문 캠페인 생성] 쿼터 "${quotaMeta.title || safeFilename}" 기반으로 캠페인 "${campTitle}" (ID: ${newCamp.id})이 생성되었습니다!`);

    res.status(201).json({
      success: true,
      message: '설문 캠페인이 성공적으로 생성되었습니다.',
      campaign: updated
    });
  } catch (err) {
    logger.error('[캠페인 생성 실패]', err);
    res.status(500).json({ error: '캠페인 생성 중 오류가 발생했습니다: ' + err.message });
  }
});

app.post('/api/campaigns/:id/start', async (req, res) => {
  if (currentTask.isRunning) {
    return res.status(400).json({ error: '이미 실행 중인 설문 작업이 있습니다.' });
  }

  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const {
    surveyUrl,
    topic,
    positiveRatio = 70,
    neutralRatio = 20,
    negativeRatio = 10,
    textGuidelines = '',
    iterations = 1,
    headless = false
  } = req.body;

  const targetUrl = surveyUrl || campaign.guidelineConfig?.surveyUrl;
  if (!targetUrl) {
    return res.status(400).json({ error: '설문조사 URL을 입력해 주세요.' });
  }

  // 캠페인 설정 업데이트
  CampaignStore.updateCampaign(campaign.id, {
    status: 'running',
    guidelineConfig: {
      ...campaign.guidelineConfig,
      ...req.body,
      surveyUrl: targetUrl
    }
  });

  currentTask.isRunning = true;
  currentTask.campaignId = campaign.id;
  currentTask.startTime = new Date().toISOString();
  currentTask.progress = { current: 0, total: iterations, percent: 0 };

  logger.info(`[캠페인 실행] "${campaign.title}" 자동 설문조사 시작 (총 ${iterations}회, 모드: ${campaign.quotaType})`);

  res.json({ message: '캠페인 설문 자동화 작업이 시작되었습니다.', status: 'started' });

  // 비동기 실행 루프
  (async () => {
    try {
      const { runSurveySession } = await import('./engine/browser.js');
      const quotaDb = campaign.quotaDatabase || [];

      for (let i = 1; i <= iterations; i++) {
        if (!currentTask.isRunning) {
          logger.warn('사용자에 의해 작업이 중단되었습니다.');
          break;
        }

        logger.info(`[${i}/${iterations}회차] 설문 응답 세션을 시작합니다...`);
        logger.updateProgress(i - 1, iterations, `${i}회차 시작 중...`);

        // B2B인 경우 쿼터 DB에서 1:1 매핑
        let businessData = null;
        if (campaign.quotaType === 'b2b' && quotaDb.length > 0) {
          businessData = quotaDb[(i - 1) % quotaDb.length];
        }

        const sessionResult = await runSurveySession({
          url: targetUrl,
          topic: topic || campaign.title,
          mode: campaign.quotaType,
          businessData,
          selectedB2bFields: campaign.quotaConfig?.selectedFields || [],
          positiveRatio,
          neutralRatio,
          negativeRatio,
          textGuidelines,
          headless,
          iterationIndex: i
        });

        // 결과 저장
        const reportFileName = `report_${Date.now()}_iter${i}.json`;
        const reportPath = path.join(reportsDir, reportFileName);
        fs.writeFileSync(reportPath, JSON.stringify(sessionResult, null, 2), 'utf-8');

        // 캠페인 내 쿼터 DB 상태 업데이트 (사용한 사업자 체크)
        if (businessData) {
          const bizIndex = quotaDb.findIndex(b => b.bizNumber === businessData.bizNumber);
          if (bizIndex !== -1) {
            quotaDb[bizIndex].quotaStatus = 'used';
            quotaDb[bizIndex].usedAt = new Date().toISOString();
          }
        }

        // 캠페인 결과 배열에 추가
        campaign.results.push({
          iteration: i,
          reportFileName,
          timestamp: new Date().toISOString(),
          business: businessData ? businessData.companyName : '개인 페르소나',
          completed: sessionResult.completed
        });

        CampaignStore.updateCampaign(campaign.id, {
          quotaDatabase: quotaDb,
          results: campaign.results
        });

        logger.success(`[${i}/${iterations}회차] 설문 응답 및 제출이 완료되었습니다!`);
        logger.updateProgress(i, iterations, `${i}/${iterations}회차 완료`);
      }

      CampaignStore.updateCampaign(campaign.id, { status: 'completed' });
      logger.success(`캠페인 "${campaign.title}"의 모든 설문 작업이 성공적으로 완료되었습니다! 🎉`);
    } catch (err) {
      logger.error('캠페인 설문 실행 중 오류 발생:', err);
      CampaignStore.updateCampaign(campaign.id, { status: 'ready' });
    } finally {
      currentTask.isRunning = false;
      currentTask.campaignId = null;
    }
  })();
});

// ==========================================
// [1-7] 캠페인 쿼터와 케이스탯 1:1 슬롯 매핑 바인딩
// ==========================================
app.post('/api/campaigns/:id/bind-slots', async (req, res) => {
  try {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const { slots = [], resetStatus = true } = req.body;
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: '매핑할 슬롯 데이터 목록이 없습니다.' });
    }

    const quotaDb = campaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      return res.status(400).json({ error: '캠페인에 등록된 쿼터 데이터가 없습니다.' });
    }

    let mappedCount = 0;
    quotaDb.forEach((biz, idx) => {
      const slot = slots.find(s => (s.index === (biz.index || biz.seq || idx + 1)) || (s.seq === (biz.index || biz.seq || idx + 1))) || slots[idx];
      if (slot && slot.slotUrl) {
        biz.slotUrl = String(slot.slotUrl).trim();
        biz.slotIndex = slot.slotIndex || (idx + 1);
        biz.slotExtra = slot.slotExtra || (slot.extraLabel || `(${idx})추가`);
        biz.ranId = slot.ranId || (slot.ran_id || (biz.slotUrl.match(/[?&]KID=([^&]+)/i)?.[1] || null));
        mappedCount++;

        if (resetStatus) {
          biz.quotaStatus = 'ready';
          biz.pilotAt = null;
          biz.completedAt = null;
          biz.usedAt = null;
          biz.capturedSteps = [];
        }
      }
    });

    const firstSlot = quotaDb[0]?.slotUrl;
    const guidelineConfig = {
      ...(campaign.guidelineConfig || {}),
      ...(firstSlot ? { surveyUrl: firstSlot } : {})
    };

    const updated = CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: quotaDb,
      guidelineConfig,
      ...(resetStatus ? { status: 'ready' } : {})
    });

    // 원본 쿼터 JSON/XLSX 동기화
    try {
      const quotaFiles = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
      const marketName = quotaDb[0]?.marketName;
      const matchedFile = quotaFiles.find(f => {
        if (campaign.quotaFileName && f === campaign.quotaFileName) return true;
        if (marketName && f.includes(marketName)) return true;
        return false;
      });

      if (matchedFile) {
        const fullJsonPath = path.join(quotasDir, matchedFile);
        const quotaJson = JSON.parse(fs.readFileSync(fullJsonPath, 'utf8'));
        const qList = quotaJson.data || quotaJson.merchants || [];
        qList.forEach((qm, qIdx) => {
          const matchedBiz = quotaDb.find(b => (b.bizNumber && b.bizNumber === qm.bizNumber) || ((b.index || b.seq) === (qm.seq || qm.index || qIdx + 1)));
          if (matchedBiz && matchedBiz.slotUrl) {
            qm.slotUrl = matchedBiz.slotUrl;
            qm.slotIndex = matchedBiz.slotIndex;
            qm.slotExtra = matchedBiz.slotExtra;
            qm.ranId = matchedBiz.ranId;
          }
        });
        fs.writeFileSync(fullJsonPath, JSON.stringify(quotaJson, null, 2), 'utf8');

        const xlsxPath = fullJsonPath.replace(/\.json$/, '.xlsx');
        if (qList.length > 0) {
          const rows = qList.map(m => ({
            '순번': m.seq || m.index,
            'Kstat슬롯': m.slotIndex ? `슬롯 #${m.slotIndex} ${m.slotExtra || ''}` : '-',
            'Kstat설문URL': m.slotUrl || '-',
            '시장명': m.marketName || '-',
            '상호': m.companyName || '-',
            '사업자번호': m.bizNumber || '-',
            '대표자명': m.ceoName || '-',
            '연락처': m.phone || '-',
            '개업일': m.openDate || '-',
            '업종/품목': m.handledItems || m.industry || '-',
            '사업장주소': m.address || '-',
            '가맹상태': m.status || '정상가맹',
            '지류': m.paperAccepted || 'Y',
            '디지털': m.digitalAccepted || 'Y'
          }));
          const wb = xlsx.utils.book_new();
          const ws = xlsx.utils.json_to_sheet(rows);
          xlsx.utils.book_append_sheet(wb, ws, '조사쿼터_Kstat슬롯매핑');
          xlsx.writeFile(wb, xlsxPath);
        }
      }
    } catch (syncErr) {
      logger.warn('[슬롯 매핑 쿼터파일 동기화 주의]', syncErr.message);
    }

    logger.success(`[슬롯 1:1 매핑 완료] 캠페인 "${campaign.title}": 총 ${quotaDb.length}개 중 ${mappedCount}개 슬롯 바인딩 완료!`);

    res.json({
      success: true,
      message: `총 ${quotaDb.length}개 쿼터 중 ${mappedCount}개 점포에 케이스탯 슬롯이 1:1 매칭되었습니다.${resetStatus ? ' (상태가 대기로 초기화되었습니다)' : ''}`,
      mappedCount,
      totalCount: quotaDb.length,
      quotaDatabase: updated.quotaDatabase
    });
  } catch (err) {
    logger.error('[슬롯 매핑 실패]', err);
    res.status(500).json({ error: '슬롯 매핑 중 오류가 발생했습니다: ' + err.message });
  }
});

// ==========================================
// [3-1] 2-Phase 실행: 1번 쿼터 파일럿 시뮬레이션 (Agree 안전 대기)
// ==========================================
app.post('/api/campaigns/:id/pilot-run', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { surveyUrl, policy = {}, quotaIndex = 1 } = req.body;
  const quotaDb = campaign.quotaDatabase || [];
  if (quotaDb.length === 0) {
    return res.status(400).json({ error: '캠페인에 구축된 조사 쿼터가 없습니다.' });
  }

  const targetBiz = quotaDb[Math.max(0, quotaIndex - 1)];
  if (!targetBiz) {
    return res.status(400).json({ error: '1번 쿼터 사업자를 찾을 수 없습니다.' });
  }

  // 1:1 슬롯 매핑 엄격 검증: slotUrl이 없으면 차단
  const targetUrl = targetBiz.slotUrl || targetBiz.surveyUrl;
  if (!targetUrl) {
    return res.status(400).json({
      error: `[${targetBiz.companyName}] 1번 쿼터에 케이스탯 전용 설문 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 먼저 완료해 주세요.`
    });
  }

  // 가이드라인 설정 보존
  CampaignStore.updateCampaign(campaign.id, {
    guidelineConfig: {
      ...campaign.guidelineConfig,
      surveyUrl: targetUrl,
      policy
    }
  });

  logger.info(`[파일럿 검증 시작] 캠페인 "${campaign.title}" ➔ 대상 사업자: "${targetBiz.companyName}" (${targetBiz.bizNumber}) (슬롯: ${targetBiz.slotIndex ? '#' + targetBiz.slotIndex : '단독'})`);
  targetBiz.quotaStatus = 'running';
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'running' });

  res.json({
    success: true,
    message: `"${targetBiz.companyName}" 파일럿 시뮬레이션이 시작되었습니다. (Agree 직전 안전 정지)`,
    targetBiz
  });

  // 비동기 실행
  (async () => {
    try {
      const result = await runKstatSurvey({
        surveyUrl: targetUrl,
        bizData: targetBiz,
        quotaIndex: targetBiz.index || quotaIndex,
        guidelineConfig: {
          ...(campaign.guidelineConfig || {}),
          masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
        },
        policy,
        pilotMode: true,
        safetyGuard: true,
        reportDir: path.join(reportsDir, campaign.id, `item_${targetBiz.index || quotaIndex}`),
        onProgress: (info) => {
          logger.info(`[${info.step}] ${info.message}`);
          logger.broadcast({
            type: 'PILOT_PROGRESS',
            campaignId: campaign.id,
            quotaIndex: targetBiz.index,
            ...info
          });
        }
      });

      if (result.success) {
        targetBiz.quotaStatus = 'pilot_done';
        targetBiz.pilotAt = new Date().toISOString();
        targetBiz.capturedSteps = result.capturedSteps;
        CampaignStore.updateCampaign(campaign.id, {
          quotaDatabase: quotaDb,
          status: 'ready'
        });
        logger.success(`🎉 [파일럿 검증 완료] "${targetBiz.companyName}" 1건 시뮬레이션이 Agree.asp까지 무결점 도달했습니다!`);
        logger.broadcast({
          type: 'PILOT_COMPLETED',
          campaignId: campaign.id,
          quotaIndex: targetBiz.index,
          bizName: targetBiz.companyName,
          capturedSteps: result.capturedSteps
        });
      } else {
        targetBiz.quotaStatus = 'error';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
        logger.error(`[파일럿 실패] ${result.error || result.message}`);
        logger.broadcast({
          type: 'PILOT_ERROR',
          campaignId: campaign.id,
          quotaIndex: targetBiz.index,
          error: result.error || result.message
        });
      }
    } catch (err) {
      targetBiz.quotaStatus = 'error';
      CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
      logger.error('[파일럿 오류]', err);
    }
  })();
});

// ==========================================
// [3-2] 2-Phase 실행: 2번 쿼터부터 고속 배치 가동
// ==========================================
app.post('/api/campaigns/:id/batch-run', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { surveyUrl, policy = {}, startIndex = 1, safetyGuard = false } = req.body;
  const defaultUrl = surveyUrl || campaign.guidelineConfig?.surveyUrl;
  const quotaDb = campaign.quotaDatabase || [];

  const targets = quotaDb.filter(b => {
    const idx = (b.index || b.seq);
    if (idx < startIndex) return false;
    if (b.quotaStatus === 'completed') return false; // 이미 진짜 마감된 건 제외
    if (safetyGuard && b.quotaStatus === 'pilot_done') return false; // 안전가드 모드에선 검증완료 제외
    return true; // 안전가드 OFF 모드에선 pilot_done도 포함하여 최종 제출 마감!
  });
  if (targets.length === 0) {
    return res.status(400).json({ error: '연속 실행할 잔여 쿼터가 없습니다.' });
  }

  // 1:1 슬롯 매핑 엄격 검증: 대상 중 슬롯이 없는 항목이 단 하나라도 있으면 가동 차단!
  const unmapped = targets.filter(b => !b.slotUrl && !b.surveyUrl);
  if (unmapped.length > 0) {
    return res.status(400).json({
      error: `실행 대상 쿼터 ${targets.length}건 중 ${unmapped.length}건에 케이스탯 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 통해 모든 쿼터에 슬롯을 매칭한 후 가동해 주세요.`
    });
  }

  logger.info(`[배치 자동화 가동] 캠페인 "${campaign.title}" 대상 ${targets.length}건 연속 실행 시작 (안전가드: ${safetyGuard ? 'ON' : 'OFF'})`);
  currentTask.isRunning = true;
  currentTask.campaignId = campaign.id;
  CampaignStore.updateCampaign(campaign.id, { status: 'running' });

  res.json({
    success: true,
    message: `잔여 쿼터 ${targets.length}건 배치 자동화가 시작되었습니다.`,
    totalTargets: targets.length
  });

  (async () => {
    try {
      for (let i = 0; i < targets.length; i++) {
        if (!currentTask.isRunning) {
          logger.warn(`[배치 일시중지] 사용자에 의해 배치가 안전하게 중지되었습니다.`);
          break;
        }

        const biz = targets[i];
        const bizUrl = biz.slotUrl || biz.surveyUrl;
        if (!bizUrl) {
          logger.error(`[배치 ${i + 1}/${targets.length}] "${biz.companyName}"에 할당된 케이스탯 고유 슬롯 URL이 없습니다.`);
          biz.quotaStatus = 'error';
          CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
          continue;
        }

        biz.quotaStatus = 'running';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          quotaDatabase: quotaDb
        });

        const slotInfo = biz.slotIndex ? ` [Kstat 슬롯 #${biz.slotIndex} ${biz.slotExtra || ''}]` : '';
        logger.info(`[배치 진행 ${i + 1}/${targets.length}] "${biz.companyName}" (${biz.bizNumber})${slotInfo} 설문 자동화 시작...`);

        const result = await runKstatSurvey({
          surveyUrl: bizUrl,
          bizData: biz,
          quotaIndex: biz.index || (i + startIndex),
          guidelineConfig: {
            ...campaign.guidelineConfig,
            masterBaseline: campaign.masterBaseline
          },
          policy,
          pilotMode: safetyGuard,
          safetyGuard,
          reportDir: path.join(reportsDir, campaign.id, `item_${biz.index || (i + startIndex)}`),
          onProgress: (info) => {
            logger.info(`[배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'BATCH_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: biz.index || (i + startIndex),
              itemNumber: i + 1,
              totalItems: targets.length,
              ...info
            });
          }
        });

        if (result.success) {
          biz.quotaStatus = safetyGuard ? 'pilot_done' : 'completed';
          biz.completedAt = new Date().toISOString();
          biz.capturedSteps = result.capturedSteps;
          logger.success(`[배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" 설문 완료!`);
        } else {
          biz.quotaStatus = 'error';
          logger.error(`[배치 ${i + 1}/${targets.length} 실패] "${biz.companyName}": ${result.error}`);
        }

        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          quotaDatabase: quotaDb
        });
        await new Promise(r => setTimeout(r, 1000));
      }

      currentTask.isRunning = false;
      CampaignStore.updateCampaign(campaign.id, { status: 'completed' });
      logger.success(`🎉 [배치 자동화 완료] 캠페인 "${campaign.title}"의 모든 연속 설문이 완료되었습니다!`);
      logger.broadcast({
        type: 'BATCH_COMPLETED',
        campaignId: campaign.id
      });
    } catch (err) {
      currentTask.isRunning = false;
      logger.error('[배치 실행 중 오류]', err);
      CampaignStore.updateCampaign(campaign.id, { status: 'ready' });
    }
  })();
});

// ==========================================
// [3-3] 특정 쿼터 단독 1건 테스트 실행
// ==========================================
app.post('/api/campaigns/:id/run-single', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { quotaIndex } = req.body;
  const quotaDb = campaign.quotaDatabase || [];
  const targetBiz = quotaDb.find(b => (b.index || b.seq) === quotaIndex);

  if (!targetBiz) {
    return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
  }

  const targetUrl = targetBiz.slotUrl || targetBiz.surveyUrl;
  if (!targetUrl) {
    return res.status(400).json({
      error: `[${targetBiz.companyName}] 쿼터에 케이스탯 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 먼저 완료해 주세요.`
    });
  }

  targetBiz.quotaStatus = 'running';
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });

  const slotNotice = targetBiz.slotIndex ? ` [Kstat 슬롯 #${targetBiz.slotIndex} ${targetBiz.slotExtra || ''}]` : '';
  logger.info(`[개별 쿼터 테스트] "${targetBiz.companyName}" (순번: #${targetBiz.index || quotaIndex})${slotNotice} 1건 실행 시작...`);

  res.json({
    success: true,
    message: `"${targetBiz.companyName}" 1건 테스트가 시작되었습니다.`,
    targetBiz
  });

  (async () => {
    try {
      const result = await runKstatSurvey({
        surveyUrl: targetUrl,
        bizData: targetBiz,
        quotaIndex: targetBiz.index || quotaIndex,
        guidelineConfig: {
          ...(campaign.guidelineConfig || {}),
          masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
        },
        policy: campaign.guidelineConfig?.policy || {},
        pilotMode: true,
        safetyGuard: true,
        reportDir: path.join(reportsDir, campaign.id, `item_${targetBiz.index || quotaIndex}`),
        onProgress: (info) => {
          logger.broadcast({
            type: 'PILOT_PROGRESS',
            campaignId: campaign.id,
            quotaIndex: targetBiz.index,
            ...info
          });
        }
      });

      if (result.success) {
        targetBiz.quotaStatus = 'pilot_done';
        targetBiz.pilotAt = new Date().toISOString();
        targetBiz.capturedSteps = result.capturedSteps;
        logger.success(`[개별 쿼터 테스트 성공] "${targetBiz.companyName}" 완주 완료!`);
      } else {
        targetBiz.quotaStatus = 'error';
        logger.error(`[개별 쿼터 테스트 실패] "${targetBiz.companyName}": ${result.error}`);
      }

      CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: quotaDb
      });
    } catch (err) {
      targetBiz.quotaStatus = 'error';
      CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
    }
  })();
});

// ==========================================
// [3-4] 단계별 화면 캡처 목록 조회 (쿼터 사업자별 1:1 매핑)
// ==========================================
app.get('/api/campaigns/:id/screenshots', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const quotaDb = campaign.quotaDatabase || [];
  const quotaIndex = req.query.quotaIndex ? parseInt(req.query.quotaIndex, 10) : null;

  // 1) 특정 쿼터 점포가 지정된 경우
  if (quotaIndex) {
    const targetBiz = quotaDb.find(b => (b.index || b.seq) === quotaIndex);
    if (!targetBiz) {
      return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
    }

    // A) 객체에 저장된 capturedSteps가 있는 경우
    if (targetBiz.capturedSteps && targetBiz.capturedSteps.length > 0) {
      return res.json({
        success: true,
        bizName: targetBiz.companyName,
        quotaIndex,
        screenshots: targetBiz.capturedSteps
      });
    }

    // B) 물리 폴더 스캔: reports/:campaignId/item_:quotaIndex
    const itemDir = path.join(reportsDir, campaign.id, `item_${quotaIndex}`);
    if (fs.existsSync(itemDir)) {
      const files = fs.readdirSync(itemDir).filter(f => f.endsWith('.png'));
      const order = ['Q1', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'Agree'];
      const screenshots = [];
      order.forEach((step, idx) => {
        const matchFile = files.find(f => f.includes(`step_${step}_`));
        if (matchFile) {
          screenshots.push({
            step,
            stepIndex: idx + 1,
            title: step === 'Agree' ? '개인정보 수집 동의' : `${step} 단계 응답 완료`,
            file: matchFile,
            url: `/reports/${campaign.id}/item_${quotaIndex}/${matchFile}`
          });
        }
      });

      if (screenshots.length > 0) {
        return res.json({
          success: true,
          bizName: targetBiz.companyName,
          quotaIndex,
          screenshots
        });
      }
    }

    return res.json({
      success: true,
      bizName: targetBiz.companyName,
      quotaIndex,
      screenshots: [],
      message: `"${targetBiz.companyName}" 점포의 캡처 파일이 아직 없습니다.`
    });
  }

  // 2) quotaIndex 미지정 시: 최근 실행된 점포의 스크린샷 반환
  const executedBizList = quotaDb.filter(b => b.capturedSteps && b.capturedSteps.length > 0);
  if (executedBizList.length > 0) {
    const latestBiz = executedBizList[executedBizList.length - 1];
    return res.json({
      success: true,
      bizName: latestBiz.companyName,
      quotaIndex: latestBiz.index || latestBiz.seq,
      screenshots: latestBiz.capturedSteps
    });
  }

  res.json({ success: true, screenshots: [], message: '실행 완료된 스크린샷이 없습니다.' });
});

// 작업 중지 요청
app.post('/api/survey/stop', (req, res) => {
  currentTask.isRunning = false;
  if (currentTask.campaignId) {
    const camp = CampaignStore.getCampaignById(currentTask.campaignId);
    if (camp && Array.isArray(camp.quotaDatabase)) {
      camp.quotaDatabase.forEach(q => {
        if (q.quotaStatus === 'running') q.quotaStatus = 'ready';
      });
      CampaignStore.updateCampaign(currentTask.campaignId, { status: 'ready', quotaDatabase: camp.quotaDatabase });
    } else {
      CampaignStore.updateCampaign(currentTask.campaignId, { status: 'ready' });
    }
  }
  logger.warn('설문 자동화 작업 중지 요청을 수신했습니다.');
  res.json({ message: '작업 중지 신호를 보냈습니다.' });
});

// 현재 작업 상태 조회
app.get('/api/survey/status', (req, res) => {
  res.json({
    isRunning: currentTask.isRunning,
    campaignId: currentTask.campaignId,
    progress: currentTask.progress,
    startTime: currentTask.startTime
  });
});

// 리포트 목록 조회
app.get('/api/survey/reports', (req, res) => {
  try {
    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
    const reports = files.map(file => {
      const content = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'));
      return {
        fileName: file,
        timestamp: content.timestamp,
        url: content.url,
        summary: content.summary
      };
    });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: '리포트 목록을 불러오지 못했습니다.' });
  }
});

// ==========================================
// [4] 조사 쿼터(Quota) 생성 및 Excel/JSON 내보내기 전용 API
// ==========================================

const BASE_FIELD_LABELS = {
  companyName: '상호',
  bizNumber: '사업자등록번호',
  ceoName: '대표자이름',
  ceoGender: '성별',
  ceoAge: '나이',
  address: '사업장주소',
  industry: '업종',
  subIndustry: '세부업종',
  phone: '전화번호',
  openingDate: '개업일',
  category: '분류'
};

// 조사 쿼터 생성 및 파일(JSON + XLSX) 내보내기 (실시간 체크포인트 저장 & 이어하기 지원)
app.post('/api/quota/generate', async (req, res) => {
  const {
    title = '사업주_조사쿼터',
    keyword = '소프트웨어',
    targetCount = 2,
    baseFields = ['companyName', 'bizNumber', 'ceoName', 'address', 'industry'],
    customFields = [],
    autoEnrich = true,
    maxOpenYear = 2025,
    resumeFileName = null
  } = req.body;

  const count = Math.max(parseInt(targetCount, 10) || 1, 1);
  const parsedMaxYear = maxOpenYear === 'all' ? null : (parseInt(maxOpenYear, 10) || 2025);

  const columns = [];
  baseFields.forEach(f => {
    if (BASE_FIELD_LABELS[f]) {
      columns.push({ key: f, label: BASE_FIELD_LABELS[f] });
    }
  });
  customFields.forEach(cf => {
    columns.push({ key: cf, label: cf });
  });

  // 이어하기(Resume) 파일 확인 또는 신규 파일명 확정
  let jsonFileName, excelFileName, jsonFilePath, excelFilePath;
  let existingMeta = null;

  if (resumeFileName) {
    const safeResume = path.basename(resumeFileName);
    const candidatePath = path.join(quotasDir, safeResume);
    if (fs.existsSync(candidatePath)) {
      jsonFileName = safeResume;
      excelFileName = safeResume.replace(/\.json$/i, '.xlsx');
      jsonFilePath = candidatePath;
      excelFilePath = path.join(quotasDir, excelFileName);
      try {
        existingMeta = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
      } catch (_) {}
    }
  }

  if (!jsonFileName) {
    const timestamp = Date.now();
    const cleanTitle = title.replace(/[^가-힣a-zA-Z0-9_\-]/g, '_');
    const filenameBase = `quota_${cleanTitle}_${timestamp}`;
    jsonFileName = `${filenameBase}.json`;
    excelFileName = `${filenameBase}.xlsx`;
    jsonFilePath = path.join(quotasDir, jsonFileName);
    excelFilePath = path.join(quotasDir, excelFileName);
  }

  const createdAt = existingMeta?.createdAt || new Date().toISOString();

  function saveCheckpoint({ currentData, currentIndex, targetTotal, candidates, isComplete }) {
    const mbzFailedCount = (currentData || []).filter(item => item.mbzStatus === 'failed').length;
    const quotaMeta = {
      title,
      type: 'MARKETBZ_DIRECT',
      keyword,
      createdAt,
      updatedAt: new Date().toISOString(),
      targetTotal: targetTotal || count,
      count: (currentData || []).length,
      mbzFailedCount,
      isComplete: Boolean(isComplete),
      requestParams: { title, keyword, targetCount: count, baseFields, customFields, autoEnrich, maxOpenYear },
      candidates: candidates || existingMeta?.candidates || [],
      columns,
      data: currentData || []
    };
    fs.writeFileSync(jsonFilePath, JSON.stringify(quotaMeta, null, 2), 'utf-8');
    if (currentData && currentData.length > 0) {
      exportBusinessesToExcel({
        data: currentData,
        columns,
        filePath: excelFilePath
      });
    }
    logger.broadcast({
      type: 'QUOTA_CHECKPOINT',
      title,
      mode: 'marketbz',
      count: (currentData || []).length,
      targetTotal: targetTotal || count,
      mbzFailedCount,
      isComplete: Boolean(isComplete),
      columns,
      data: currentData || [],
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });
  }

  logger.info(`[조사 쿼터 ${existingMeta ? '이어하기' : '생성'} 시작] 명칭: "${title}" | 파일: ${jsonFileName} | 목표: ${count}개`);

  try {
    const { fetchMarketBzBusinesses } = await import('./engine/marketbz.js');
    const businesses = await fetchMarketBzBusinesses({
      keyword,
      count,
      customFields,
      autoEnrich: autoEnrich !== false,
      maxOpenYear: parsedMaxYear,
      existingData: existingMeta?.data || [],
      savedCandidates: existingMeta?.candidates || null,
      onProgress: saveCheckpoint
    });

    if (businesses.length === 0) {
      return res.status(404).json({ error: '조건에 일치하는 실존 사업자 데이터를 찾지 못했습니다.' });
    }

    const mbzFailedCount = businesses.filter(item => item.mbzStatus === 'failed').length;
    const isComplete = businesses.length >= count && mbzFailedCount === 0;

    saveCheckpoint({
      currentData: businesses,
      currentIndex: businesses.length,
      targetTotal: count,
      candidates: existingMeta?.candidates || [],
      isComplete
    });

    logger.success(`[조사 쿼터 저장 완료] ${businesses.length}/${count}개 사업자 데이터 저장 완료 (마켓비즈 재시도 필요: ${mbzFailedCount}건)`);

    res.json({
      success: true,
      message: isComplete
        ? '조사 쿼터가 성공적으로 생성되었습니다.'
        : `현재까지 ${businesses.length}/${count}건 저장됨 (마켓비즈 연결 지연 ${mbzFailedCount}건 - [실패 지점부터 이어하기]로 즉시 업데이트 가능)`,
      title,
      keyword,
      count: businesses.length,
      targetTotal: count,
      mbzFailedCount,
      isComplete,
      columns,
      data: businesses,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });
  } catch (err) {
    logger.error('[조사 쿼터 생성 오류]', err);
    if (fs.existsSync(jsonFilePath)) {
      const saved = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
      if (saved.data && saved.data.length > 0) {
        return res.json({
          success: true,
          partial: true,
          message: `중간 오류 발생으로 현재까지 수집된 ${saved.data.length}건을 안전하게 저장했습니다. [실패 지점부터 이어하기]를 눌러 완료하세요.`,
          title: saved.title,
          keyword: saved.keyword,
          count: saved.data.length,
          targetTotal: saved.targetTotal || count,
          mbzFailedCount: saved.mbzFailedCount || 0,
          isComplete: false,
          columns: saved.columns || columns,
          data: saved.data,
          jsonFileName,
          excelFileName,
          jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
          excelDownloadUrl: `/api/quota/download/${excelFileName}`
        });
      }
    }
    res.status(500).json({ error: '조사 쿼터 생성 중 오류가 발생했습니다: ' + err.message });
  }
});

// 파일 다운로드 (Excel, JSON)
app.get('/api/quota/download/:filename', (req, res) => {
  const filename = req.params.filename;
  // 디렉터리 트래버설 방지
  const safeFilename = path.basename(filename);
  const filePath = path.join(quotasDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }

  res.download(filePath, safeFilename);
});

// 온누리상품권 시/도 목록 API
app.get('/api/onnuri/regions', async (req, res) => {
  try {
    const { getOnnuriRegions } = await import('./engine/onnuri.js');
    const regions = await getOnnuriRegions();
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: '시/도 목록 조회 실패: ' + err.message });
  }
});

// 온누리상품권 시/군/구 목록 API
app.get('/api/onnuri/districts', async (req, res) => {
  const { regionCode } = req.query;
  if (!regionCode) {
    return res.status(400).json({ error: 'regionCode가 필요합니다.' });
  }
  try {
    const { getOnnuriDistricts } = await import('./engine/onnuri.js');
    const districts = await getOnnuriDistricts(regionCode);
    res.json(districts);
  } catch (err) {
    res.status(500).json({ error: '시/군/구 목록 조회 실패: ' + err.message });
  }
});

// 온누리상품권 전통시장 실시간 업종별 통계 API
app.get('/api/onnuri/market-stats', async (req, res) => {
  const { regionCode = '01', districtCode = '', marketName = '', maxOpenYear = '2025' } = req.query;
  if (!marketName || !marketName.trim()) {
    return res.status(400).json({ error: '시장명을 입력해 주세요.' });
  }

  try {
    const { getMarketIndustryStats } = await import('./engine/onnuri.js');
    const parsedMaxYear = maxOpenYear === 'all' ? null : (parseInt(maxOpenYear, 10) || 2025);
    const stats = await getMarketIndustryStats({
      regionCode,
      districtCode,
      marketName: marketName.trim(),
      maxOpenYear: parsedMaxYear
    });
    res.json(stats);
  } catch (err) {
    logger.error(`[Market Stats] 업종 통계 조회 실패: ${err.message}`);
    res.status(500).json({ error: '업종 통계 조회 중 오류: ' + err.message });
  }
});

// 온누리 전국 마스터 DB 상태 조회 API
app.get('/api/onnuri/master-status', async (req, res) => {
  try {
    const { getMasterDBStatus } = await import('./engine/onnuri.js');
    const status = getMasterDBStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: '마스터 DB 상태 조회 실패: ' + err.message });
  }
});

let isSyncingMasterDB = false;
// 온누리 전국 마스터 DB 수동 동기화(최신화) API
app.post('/api/onnuri/sync-master', async (req, res) => {
  if (isSyncingMasterDB) {
    return res.status(409).json({ error: '이미 마스터 DB 최신화 작업이 진행 중입니다.' });
  }

  isSyncingMasterDB = true;
  logger.info('[Onnuri Master DB] 전국 마스터 DB 수동 동기화 요청 수신');

  // 백그라운드 비동기 실행
  (async () => {
    try {
      const { buildMasterDB } = await import('../scripts/build-onnuri-master-db.js');
      await buildMasterDB();
      logger.success('[Onnuri Master DB] 전국 마스터 DB 동기화 완료!');
    } catch (err) {
      logger.error(`[Onnuri Master DB] 전국 마스터 DB 동기화 실패: ${err.message}`);
    } finally {
      isSyncingMasterDB = false;
    }
  })();

  res.json({
    success: true,
    message: '전국 온누리 마스터 DB 최신화가 백그라운드에서 시작되었습니다. 완료 시 자동 반영됩니다.'
  });
});

// 온누리상품권 + 마켓비즈 하이브리드 조사 쿼터 생성 API (실시간 체크포인트 저장 & 이어하기 지원)
app.post('/api/quota/generate-onnuri', async (req, res) => {
  const {
    title = '온누리 전통시장 조사 쿼터',
    regionCode = '01',
    districtCode = '',
    marketName = '',
    statusFilter = 'ACTIVE',
    paymentFilter = 'ALL',
    targetCount = 10,
    samplingMode = 'simple',
    industryQuotas = {},
    enableSmartFallback = true,
    customFields = [],
    autoEnrich = true,
    maxOpenYear = 2025,
    resumeFileName = null
  } = req.body;

  if (!marketName || !marketName.trim()) {
    return res.status(400).json({ error: '대상 전통시장명을 입력해 주세요 (예: 풍납시장)' });
  }

  const count = Math.max(1, Math.min(parseInt(targetCount) || 10, 100));
  const parsedMaxYear = maxOpenYear === 'all' ? null : (parseInt(maxOpenYear, 10) || 2025);

  // 온누리 하이브리드 표준 컬럼 정의: [상호] [업종] [사업자번호] [대표자이름] [성별] [나이] [연락처] [개업연월] [주소] [취급품목] [주요품목]
  const baseColumnDefs = [
    { key: 'companyName', label: '상호' },
    { key: 'industry', label: '업종' },
    { key: 'bizNumber', label: '사업자번호' },
    { key: 'ceoName', label: '대표자이름' },
    { key: 'ceoGender', label: '성별' },
    { key: 'ceoAge', label: '나이' },
    { key: 'phone', label: '연락처' },
    { key: 'openDate', label: '개업연월' },
    { key: 'address', label: '주소' },
    { key: 'handledItems', label: '취급품목' },
    { key: 'mainProducts', label: '주요품목' },
    { key: 'marketName', label: '시장명' },
    { key: 'status', label: '가맹상태' },
    { key: 'paperAccepted', label: '온누리지류' },
    { key: 'digitalAccepted', label: '온누리디지털' }
  ];

  const columns = [...baseColumnDefs];
  if (customFields && Array.isArray(customFields)) {
    customFields.forEach(cf => {
      columns.push({ key: cf, label: cf });
    });
  }

  // 이어하기(Resume) 파일 확인 또는 신규 파일명 확정
  let jsonFileName, excelFileName, jsonFilePath, excelFilePath;
  let existingMeta = null;

  if (resumeFileName) {
    const safeResume = path.basename(resumeFileName);
    const candidatePath = path.join(quotasDir, safeResume);
    if (fs.existsSync(candidatePath)) {
      jsonFileName = safeResume;
      excelFileName = safeResume.replace(/\.json$/i, '.xlsx');
      jsonFilePath = candidatePath;
      excelFilePath = path.join(quotasDir, excelFileName);
      try {
        existingMeta = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
      } catch (_) {}
    }
  }

  if (!jsonFileName) {
    const timestamp = Date.now();
    const cleanTitle = title.replace(/[^가-힣a-zA-Z0-9_\-]/g, '_');
    const filenameBase = `quota_onnuri_${cleanTitle}_${timestamp}`;
    jsonFileName = `${filenameBase}.json`;
    excelFileName = `${filenameBase}.xlsx`;
    jsonFilePath = path.join(quotasDir, jsonFileName);
    excelFilePath = path.join(quotasDir, excelFileName);
  }

  const createdAt = existingMeta?.createdAt || new Date().toISOString();

  function saveOnnuriCheckpoint({ currentData, currentIndex, targetTotal, candidates, isComplete }) {
    const mbzFailedCount = (currentData || []).filter(item => item.mbzStatus === 'failed').length;
    const quotaMeta = {
      title,
      type: 'ONNURI_HYBRID',
      marketName: marketName.trim(),
      createdAt,
      updatedAt: new Date().toISOString(),
      targetTotal: targetTotal || count,
      count: (currentData || []).length,
      mbzFailedCount,
      isComplete: Boolean(isComplete),
      requestParams: {
        title,
        regionCode,
        districtCode,
        marketName: marketName.trim(),
        statusFilter,
        paymentFilter,
        targetCount: count,
        samplingMode,
        industryQuotas,
        enableSmartFallback,
        customFields,
        autoEnrich,
        maxOpenYear
      },
      candidates: candidates || existingMeta?.candidates || [],
      columns,
      data: currentData || []
    };
    fs.writeFileSync(jsonFilePath, JSON.stringify(quotaMeta, null, 2), 'utf-8');
    if (currentData && currentData.length > 0) {
      exportBusinessesToExcel({
        data: currentData,
        columns,
        filePath: excelFilePath
      });
    }
    logger.broadcast({
      type: 'QUOTA_CHECKPOINT',
      title,
      mode: 'onnuri',
      marketName: marketName.trim(),
      count: (currentData || []).length,
      targetTotal: targetTotal || count,
      mbzFailedCount,
      isComplete: Boolean(isComplete),
      columns,
      data: currentData || [],
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });
  }

  logger.info(`[온누리 쿼터 ${existingMeta ? '이어하기(Resume)' : '신규 생성'} 요청] "${title}" | 파일: ${jsonFileName} | 시장: "${marketName}" | 모드: ${samplingMode} | 기존 보존: ${(existingMeta?.data || []).length}건`);

  try {
    const { buildHybridOnnuriQuota } = await import('./engine/hybrid-quota.js');
    const buildResult = await buildHybridOnnuriQuota({
      regionCode,
      districtCode,
      marketName: marketName.trim(),
      statusFilter,
      paymentFilter,
      targetCount: count,
      samplingMode,
      industryQuotas,
      enableSmartFallback: enableSmartFallback !== false,
      customFields,
      autoEnrich: autoEnrich !== false,
      maxOpenYear: parsedMaxYear,
      existingData: existingMeta?.data || [],
      savedCandidates: existingMeta?.candidates || null,
      onProgress: saveOnnuriCheckpoint
    });

    const businesses = Array.isArray(buildResult) ? buildResult : (buildResult.data || []);
    const targetTotal = (!Array.isArray(buildResult) && buildResult.targetTotal) ? buildResult.targetTotal : count;
    const mbzFailedCount = (!Array.isArray(buildResult) && buildResult.mbzFailedCount !== undefined)
      ? buildResult.mbzFailedCount
      : businesses.filter(item => item.mbzStatus === 'failed').length;
    const isComplete = (!Array.isArray(buildResult) && buildResult.isComplete !== undefined)
      ? buildResult.isComplete
      : (businesses.length >= targetTotal && mbzFailedCount === 0);

    if (businesses.length === 0) {
      return res.status(404).json({ error: `"${marketName}" 조건에 부합하는 온누리 가맹점을 찾지 못했습니다.` });
    }

    saveOnnuriCheckpoint({
      currentData: businesses,
      currentIndex: businesses.length,
      targetTotal,
      candidates: (!Array.isArray(buildResult) && buildResult.candidates) ? buildResult.candidates : (existingMeta?.candidates || []),
      isComplete
    });

    logger.success(`[온누리 쿼터 저장 완료] ${businesses.length}/${targetTotal}개 전통시장 사업자 데이터 저장 완료 (마켓비즈 재시도 필요: ${mbzFailedCount}건)`);

    res.json({
      success: true,
      message: isComplete
        ? '온누리 연계 조사 쿼터가 100% 성공적으로 생성되었습니다.'
        : `현재까지 ${businesses.length}/${targetTotal}건 저장 완료 (마켓비즈 연결 지연 ${mbzFailedCount}건 - [실패 지점부터 이어하기]로 즉시 업데이트 가능)`,
      title,
      type: 'ONNURI_HYBRID',
      marketName: marketName.trim(),
      count: businesses.length,
      targetTotal,
      mbzFailedCount,
      isComplete,
      columns,
      data: businesses,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });

  } catch (err) {
    logger.error('[온누리 쿼터 생성 오류]', err);
    if (fs.existsSync(jsonFilePath)) {
      const saved = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
      if (saved.data && saved.data.length > 0) {
        return res.json({
          success: true,
          partial: true,
          message: `중간 오류 발생으로 현재까지 수집된 ${saved.data.length}건을 안전하게 저장했습니다. [실패 지점부터 이어하기]를 눌러 완료하세요.`,
          title: saved.title,
          type: 'ONNURI_HYBRID',
          marketName: saved.marketName,
          count: saved.data.length,
          targetTotal: saved.targetTotal || count,
          mbzFailedCount: saved.mbzFailedCount || 0,
          isComplete: false,
          columns: saved.columns || columns,
          data: saved.data,
          jsonFileName,
          excelFileName,
          jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
          excelDownloadUrl: `/api/quota/download/${excelFileName}`
        });
      }
    }
    res.status(500).json({ error: '온누리 연계 쿼터 생성 중 오류가 발생했습니다: ' + err.message });
  }
});

// [쿼터 관리 허브 API]
// 1. 생성된 쿼터 목록 조회 (업종별 분포 및 통계 포함)
app.get('/api/quota/list', (req, res) => {
  try {
    const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      const content = JSON.parse(fs.readFileSync(path.join(quotasDir, f), 'utf-8'));
      const excelName = f.replace('.json', '.xlsx');
      const hasExcel = fs.existsSync(path.join(quotasDir, excelName));
      const data = content.data || [];

      // 업종별 표본 분포 실시간 집계
      const industryDist = {};
      const standardKeys = [
        { key: '농산물', label: '농산물' },
        { key: '축산물', label: '축산물' },
        { key: '수산물', label: '수산물' },
        { key: '가공식품', label: '가공식품' },
        { key: '의류', label: '의류신발' },
        { key: '가정용품', label: '가정용품' },
        { key: '음식점', label: '음식점업' },
        { key: '기타소매', label: '기타소매' },
        { key: '근린상권', label: '근린상권' }
      ];

      data.forEach(item => {
        const raw = String(item.handledItems || item.industry || '기타');
        const matched = standardKeys.find(s => raw.includes(s.key))?.label || '기타';
        industryDist[matched] = (industryDist[matched] || 0) + 1;
      });

      const mbzFailedCount = data.filter(item => item.mbzStatus === 'failed').length;
      const targetTotal = content.targetTotal || content.count || data.length;
      const isComplete = content.isComplete !== undefined
        ? content.isComplete
        : (data.length >= targetTotal && mbzFailedCount === 0);

      return {
        fileName: f,
        title: content.title || f,
        type: content.type || 'MARKETBZ_DIRECT',
        marketName: content.marketName || null,
        keyword: content.keyword,
        count: content.count || data.length,
        targetTotal,
        mbzFailedCount,
        isComplete,
        requestParams: content.requestParams || null,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt || content.createdAt,
        industryDistribution: Object.keys(industryDist).length > 0 ? industryDist : null,
        excelFileName: hasExcel ? excelName : null
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: '쿼터 목록을 불러오지 못했습니다: ' + err.message });
  }
});

// 2. 특정 쿼터 상세 데이터 조회
app.get('/api/quota/:fileName', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.fileName);
    const jsonPath = path.join(quotasDir, safeFilename);
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: '해당 쿼터 파일을 찾을 수 없습니다.' });
    }

    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const excelName = safeFilename.replace('.json', '.xlsx');
    const hasExcel = fs.existsSync(path.join(quotasDir, excelName));

    res.json({
      success: true,
      fileName: safeFilename,
      excelFileName: hasExcel ? excelName : null,
      quota: content
    });
  } catch (err) {
    res.status(500).json({ error: '쿼터 상세 조회 실패: ' + err.message });
  }
});

// 3. 특정 쿼터 데이터 수정 및 Excel 실시간 동기화
app.put('/api/quota/:fileName', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.fileName);
    const jsonPath = path.join(quotasDir, safeFilename);
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: '해당 쿼터 파일을 찾을 수 없습니다.' });
    }

    const { title, data: updatedData } = req.body;
    if (!Array.isArray(updatedData)) {
      return res.status(400).json({ error: 'data 필드는 점포 목록 배열이어야 합니다.' });
    }

    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (title) content.title = title.trim();

    // 순번(seq) 재부여 및 데이터 갱신
    content.data = updatedData.map((item, idx) => ({
      ...item,
      seq: idx + 1
    }));
    content.count = content.data.length;
    content.updatedAt = new Date().toISOString();

    // 표준 컬럼 순서 보장: [상호] [업종] [사업자번호] [대표자이름] [성별] [나이] [연락처] [개업연월] [주소] [취급품목] [주요품목]
    const columns = [
      { key: 'companyName', label: '상호' },
      { key: 'industry', label: '업종' },
      { key: 'bizNumber', label: '사업자번호' },
      { key: 'ceoName', label: '대표자이름' },
      { key: 'ceoGender', label: '성별' },
      { key: 'ceoAge', label: '나이' },
      { key: 'phone', label: '연락처' },
      { key: 'openDate', label: '개업연월' },
      { key: 'address', label: '주소' },
      { key: 'handledItems', label: '취급품목' },
      { key: 'mainProducts', label: '주요품목' },
      { key: 'marketName', label: '시장명' },
      { key: 'status', label: '가맹상태' },
      { key: 'paperAccepted', label: '온누리지류' },
      { key: 'digitalAccepted', label: '온누리디지털' }
    ];
    content.columns = columns;

    // JSON 영구 갱신
    fs.writeFileSync(jsonPath, JSON.stringify(content, null, 2), 'utf-8');

    // Excel 실시간 동기화 갱신
    const excelName = safeFilename.replace('.json', '.xlsx');
    const excelPath = path.join(quotasDir, excelName);
    exportBusinessesToExcel({
      data: content.data,
      columns,
      filePath: excelPath
    });

    // 캠페인 DB에도 매칭되는 점포가 있다면 실시간 동기화
    try {
      const allCamps = CampaignStore.getAllCampaigns();
      allCamps.forEach(camp => {
        if (Array.isArray(camp.quotaDatabase)) {
          let campChanged = false;
          camp.quotaDatabase.forEach(cItem => {
            const matched = content.data.find(d => 
              (d.bizNumber && d.bizNumber === cItem.bizNumber) ||
              (d.companyName && d.companyName === cItem.companyName)
            );
            if (matched) {
              const syncKeys = ['companyName', 'industry', 'bizNumber', 'ceoName', 'ceoGender', 'ceoAge', 'phone', 'openDate', 'address', 'handledItems', 'mainProducts'];
              syncKeys.forEach(k => {
                if (matched[k] !== undefined) cItem[k] = matched[k];
              });
              campChanged = true;
            }
          });
          if (campChanged) {
            CampaignStore.updateCampaign(camp.id, { quotaDatabase: camp.quotaDatabase });
          }
        }
      });
    } catch (_) {}

    logger.success(`[쿼터 수정 완료] "${content.title}" (${safeFilename}) ${content.count}건 갱신 및 Excel 동기화 성공!`);

    res.json({
      success: true,
      message: `조사 쿼터가 성공적으로 저장 및 Excel과 동기화되었습니다. (총 ${content.count}건)`,
      quota: content
    });
  } catch (err) {
    logger.error('[쿼터 수정 실패]', err);
    res.status(500).json({ error: '쿼터 저장 중 오류가 발생했습니다: ' + err.message });
  }
});

// 4. 특정 쿼터 파일 삭제 (JSON + XLSX)
app.delete('/api/quota/:fileName', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.fileName);
    const jsonPath = path.join(quotasDir, safeFilename);
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: '해당 쿼터 파일을 찾을 수 없습니다.' });
    }

    fs.unlinkSync(jsonPath);

    const excelName = safeFilename.replace('.json', '.xlsx');
    const excelPath = path.join(quotasDir, excelName);
    if (fs.existsSync(excelPath)) {
      fs.unlinkSync(excelPath);
    }

    logger.info(`[쿼터 삭제 완료] "${safeFilename}" 및 엑셀 파일이 삭제되었습니다.`);

    res.json({
      success: true,
      message: `쿼터 파일("${safeFilename}")이 정상적으로 삭제되었습니다.`
    });
  } catch (err) {
    logger.error('[쿼터 삭제 실패]', err);
    res.status(500).json({ error: '쿼터 삭제 중 오류가 발생했습니다: ' + err.message });
  }
});

// [5] 생성된 쿼터 파일 결측치(대표자·연락처) 일괄 외부 보강 API
app.post('/api/quota/enrich', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: '보강할 쿼터 파일명을 입력해 주세요.' });
  }

  const safeFilename = path.basename(fileName);
  const jsonPath = path.join(quotasDir, safeFilename);

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: '해당 쿼터 파일을 찾을 수 없습니다.' });
  }

  try {
    const quotaMeta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const { batchEnrichQuota } = await import('./engine/enricher.js');

    logger.info(`[쿼터 보강 요청] "${quotaMeta.title}" (${safeFilename}) 결측치 외부 탐색 시작...`);

    const { enrichedCount, quotaList } = await batchEnrichQuota(quotaMeta.data, (progress) => {
      logger.info(`[보강 진행] (${progress.current}/${progress.total}) ${progress.companyName} 확인 중 (보강: ${progress.enrichedCount}건)`);
    });

    quotaMeta.data = quotaList;
    quotaMeta.enrichedAt = new Date().toISOString();
    quotaMeta.lastEnrichedCount = enrichedCount;

    // JSON 갱신 저장
    fs.writeFileSync(jsonPath, JSON.stringify(quotaMeta, null, 2), 'utf-8');

    // Excel 갱신 저장
    const excelName = safeFilename.replace('.json', '.xlsx');
    const excelPath = path.join(quotasDir, excelName);
    exportBusinessesToExcel({
      data: quotaList,
      columns: quotaMeta.columns,
      filePath: excelPath
    });

    logger.success(`[쿼터 보강 완료] "${quotaMeta.title}" 총 ${enrichedCount}건의 실존 데이터가 추가 보강되었습니다.`);

    res.json({
      success: true,
      message: `${enrichedCount}건의 결측치가 공인 데이터로 성공적으로 보강되었습니다.`,
      title: quotaMeta.title,
      count: quotaList.length,
      enrichedCount,
      columns: quotaMeta.columns,
      data: quotaList,
      jsonFileName: safeFilename,
      excelFileName: excelName,
      jsonDownloadUrl: `/api/quota/download/${safeFilename}`,
      excelDownloadUrl: `/api/quota/download/${excelName}`
    });
  } catch (err) {
    logger.error('[쿼터 보강 오류]', err);
    res.status(500).json({ error: '결측치 보강 중 오류가 발생했습니다: ' + err.message });
  }
});

// 특정 캠페인의 쿼터 DB 결측치 일괄 보강 API
app.post('/api/campaigns/:id/enrich-quota', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const quotaDb = campaign.quotaDatabase || [];
  if (quotaDb.length === 0) {
    return res.status(400).json({ error: '캠페인에 등록된 쿼터 데이터가 없습니다.' });
  }

  try {
    const { batchEnrichQuota } = await import('./engine/enricher.js');
    logger.info(`[캠페인 쿼터 보강] "${campaign.title}" (ID: ${campaign.id}) ${quotaDb.length}개 사업자 보강 시작...`);

    const { enrichedCount, quotaList } = await batchEnrichQuota(quotaDb, (progress) => {
      logger.info(`[캠페인 보강 진행] (${progress.current}/${progress.total}) ${progress.companyName}`);
    });

    CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: quotaList,
      lastEnrichedAt: new Date().toISOString()
    });

    logger.success(`[캠페인 쿼터 보강 완료] "${campaign.title}" ${enrichedCount}건 보강 완료`);

    res.json({
      success: true,
      message: `${enrichedCount}건의 사업자 정보가 성공적으로 보강되었습니다.`,
      enrichedCount,
      quotaDatabase: quotaList
    });
  } catch (err) {
    logger.error('[캠페인 쿼터 보강 실패]', err);
    res.status(500).json({ error: '캠페인 쿼터 보강 중 오류: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` AutoSurvey AI 캠페인 & 쿼터 DB 시스템 가동!`);
  console.log(` 메인 목차 대시보드: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

export default app;
