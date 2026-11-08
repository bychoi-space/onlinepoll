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
import { exportBusinessesToExcel, generateQuotaTemplateBuffer, parseExcelQuotaBuffer } from './utils/excel.js';
import { runKstatSurvey } from './engine/kstat-runner.js';
import { runKstatEvaluation } from './engine/kstat-eval-runner.js';
import { runKstatAssocEvaluation } from './engine/kstat-assoc-eval-runner.js';
import { scrapeKstatSlots } from './engine/kstat-slot-scraper.js';
import { scrapeKstatAssocSlots } from './engine/kstat-assoc-slot-scraper.js';
import { runKstatAssocSurvey } from './engine/kstat-assoc-runner.js';
import { getIndustryGroupKey } from './engine/persona-builder.js';
import { syncKstatSlotStatus, syncCampaignKstatSlots, saveKstatSlotProgressStatus, bulkUpdateKstatAccountProgress } from './engine/kstat-sync.js';
import { scrapeMetrixSlots } from './engine/metrix-slot-scraper.js';
import { runMetrixSurvey } from './engine/metrix-runner.js';
import { runKonaSurvey } from './engine/kona-runner.js';
import { scrapeHrcEnergySlots, findHrcQuotaJsonPath, HRC_ACCOUNTS } from './engine/hrc-energy-scraper.js';
import { runHrcEnergySurvey } from './engine/hrc-energy-runner.js';
import { scrapeGlobalriLiteracyQuotas, findGlobalriQuotaJsonPath, getAgeGroupFromBirthYear } from './engine/globalri-literacy-scraper.js';
import { runGlobalriLiteracySurvey } from './engine/globalri-literacy-runner.js';
import { buildGlobalriAnswersExcel } from './utils/globalri-answer-excel.js';
import {
  runGallupReturnFarmSurvey,
  syncGallupReturnFarmStatuses,
  GALLUP_20263603_DEFAULT_URL
} from './engine/gallup-return-farm-runner.js';

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
app.use(express.json({ limit: '20mb' }));
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

// 서버 기동 시 비정상 중단된 running 상태 초기화 및 에너지총조사 3대 캠페인 자동 시드
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

  // 2025년 기준 에너지총조사 [건물] 3개 조사원 캠페인 자동 시드
  const hrcSeedSpecs = [
    {
      id: 'camp_hrc_energy_700275',
      loginId: '700275',
      surveyorName: '강영미',
      title: '2025년 기준 에너지총조사 [건물] - 700275 (강영미 / 선정 70건)',
      description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 서울 노원구 및 그외 (선정 70건 / 대체 149건 · 기입력 보존)'
    },
    {
      id: 'camp_hrc_energy_700277',
      loginId: '700277',
      surveyorName: '강경옥',
      title: '2025년 기준 에너지총조사 [건물] - 700277 (강경옥 / 선정 58건)',
      description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 인천 부평구 및 그외 (선정 58건 / 대체 128건 · 기입력 보존)'
    },
    {
      id: 'camp_hrc_energy_701493',
      loginId: '701493',
      surveyorName: '김정례',
      title: '2025년 기준 에너지총조사 [건물] - 701493 (김정례 / 선정 117건)',
      description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 서울 노원구/그외 + 인천 연수·남동·미추홀 (선정 117건 / 대체 292건 · 기입력 보존)'
    }
  ];

  const currentCamps = CampaignStore.getAllCampaigns();
  for (const spec of hrcSeedSpecs) {
    const existingCamp = currentCamps.find(c => c.id === spec.id);
    const qPath = findHrcQuotaJsonPath(spec.loginId);
    let quotaDb = [];
    let quotaSourceFile = '';
    if (qPath && fs.existsSync(qPath)) {
      try {
        const qContent = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
        quotaSourceFile = path.basename(qPath);
        const rawList = qContent.data || qContent.items || [];
        quotaDb = rawList.map((item, idx) => {
          const uidStr = String(item.uid || '').trim();
          const isDone = (['800715', '800164', '800173'].includes(uidStr) || item.status === '완료' || item.quotaStatus === 'completed');
          return {
            ...item,
            index: item.index || idx + 1,
            seq: item.seq || idx + 1,
            companyName: item.buildingName || item.companyName || `건물_${uidStr}`,
            ceoName: item.contactName || item.ceoName || '관리소장',
            slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uidStr}&page=1`,
            surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uidStr}&page=1`,
            status: isDone ? '완료' : (item.status || '대기'),
            quotaStatus: isDone ? 'completed' : (item.quotaStatus || 'ready'),
            progress: isDone ? '100%' : (item.progress || '0%')
          };
        });
      } catch (_) {}
    }

    if (!existingCamp) {
      CampaignStore.createCampaign({
        id: spec.id,
        title: spec.title,
        description: spec.description,
        quotaType: 'b2b',
        surveyType: 'hrc_energy',
        loginId: spec.loginId,
        loginPw: spec.loginId,
        surveyorName: spec.surveyorName,
        quotaSourceFile,
        quotaDatabase: quotaDb
      });
    } else {
      let needUpdate = false;
      if (!Array.isArray(existingCamp.quotaDatabase) || existingCamp.quotaDatabase.length === 0) {
        existingCamp.quotaDatabase = quotaDb;
        existingCamp.quotaSourceFile = quotaSourceFile;
        needUpdate = true;
      } else {
        for (const qItem of quotaDb) {
          if (qItem.quotaStatus === 'completed') {
            const target = existingCamp.quotaDatabase.find(q => String(q.uid || '').trim() === String(qItem.uid || '').trim());
            if (target && (target.quotaStatus !== 'completed' || (qItem.buildingName && !target.buildingName))) {
              if (qItem.buildingName) {
                target.buildingName = qItem.buildingName;
                target.companyName = qItem.buildingName;
              }
              if (qItem.roadAddress) {
                target.roadAddress = qItem.roadAddress;
              }
              target.status = '완료';
              target.quotaStatus = 'completed';
              target.progress = '100%';
              target.surveyCompleted = '완료';
              needUpdate = true;
            }
          }
        }
      }
      if (needUpdate) {
        CampaignStore.updateCampaign(existingCamp.id, {
          quotaDatabase: existingCamp.quotaDatabase,
          quotaSourceFile: existingCamp.quotaSourceFile || quotaSourceFile
        });
      }
    }
  }

  // [GR20260618-1-001-02] 제5차 성인문해능력조사 (노영미7791) 자동 시드
  const globalriCampId = 'camp_globalri_literacy_7791';
  const existingGlobalriCamp = CampaignStore.getAllCampaigns().find(c => c.id === globalriCampId);
  const globalriQuotaPath = findGlobalriQuotaJsonPath('7791');
  if (globalriQuotaPath && fs.existsSync(globalriQuotaPath)) {
    try {
      const gqContent = JSON.parse(fs.readFileSync(globalriQuotaPath, 'utf-8'));
      const gqFile = path.basename(globalriQuotaPath);
      const gqList = (gqContent.data || []).map((item, idx) => ({
        ...item,
        index: item.index || idx + 1,
        seq: item.seq || idx + 1,
        quotaStatus: item.quotaStatus || 'ready'
      }));
      if (!existingGlobalriCamp) {
        CampaignStore.createCampaign({
          id: globalriCampId,
          title: `[GR20260618-1-001-02] 제5차 성인문해능력조사 - 노영미7791 (진행중 ${gqList.length}명)`,
          description: '글로벌리서치 통합조사시스템(GIFT) · [결과값1=완료 & 결과값2=완료] 가구 내 진행 중 가구원 조사 · 나이대별(20대/30대/40대/50대/60대/70대+) 그룹 가이드 적용',
          quotaType: 'b2c',
          surveyType: 'globalri_literacy',
          loginId: '01071447791',
          loginPw: '2038020',
          surveyorName: '노영미7791',
          quotaSourceFile: gqFile,
          quotaDatabase: gqList
        });
      } else if (!Array.isArray(existingGlobalriCamp.quotaDatabase) || existingGlobalriCamp.quotaDatabase.length === 0) {
        CampaignStore.updateCampaign(globalriCampId, {
          quotaDatabase: gqList,
          quotaSourceFile: gqFile
        });
      }
    } catch (_) {}
  }

  // [20263603] 2026년 귀농귀촌 실태조사(귀농) - 홍천군 백영자 (선정 70명) 자동 시드
  const gallupCampId = 'camp_gallup_return_farm_20263603';
  const existingGallupCamp = CampaignStore.getAllCampaigns().find(c => c.id === gallupCampId);
  const gallupQuotaPath = path.join(quotasDir, 'quota_gallup_20263603_hongcheon.json');
  if (fs.existsSync(gallupQuotaPath)) {
    try {
      const galContent = JSON.parse(fs.readFileSync(gallupQuotaPath, 'utf-8'));
      const galFile = path.basename(gallupQuotaPath);
      const galList = (galContent.data || []).map((item, idx) => ({
        ...item,
        index: item.index || idx + 1,
        seq: item.seq || idx + 1,
        quotaStatus: item.quotaStatus || (item.status === '완료' ? 'completed' : 'ready')
      }));
      if (!existingGallupCamp) {
        CampaignStore.createCampaign({
          id: gallupCampId,
          title: galContent.title || `[20263603] 2026년 귀농귀촌 실태조사(귀농) - 강원 홍천군 백영자 (선정 ${galList.length}명)`,
          description: '한국갤럽 G-CAII(20263603) · 강원특별자치도 홍천군 10개 읍·면 브라우저 GPS 자동 주입 · 방문기록(07~22시/차수순차/컨택성공) 규칙 준수 · 답례품 인수증 8종 필체 전자서명 다변화 · 완료 직전(Page 118) 안전 정지',
          quotaType: 'b2c',
          surveyType: 'gallup_return_farm',
          loginId: galContent.surveyorId || '076_000009',
          surveyorName: galContent.surveyorName || '백영자',
          googleSheetUrl: galContent.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1Hoai6ggQWxNVTW5SyxEsvpNtMOlBO1z_ThmM6cZ6gRg/edit?gid=1470110969#gid=1470110969',
          quotaSourceFile: galFile,
          guidelineConfig: {
            surveyUrl: galContent.surveyUrl || GALLUP_20263603_DEFAULT_URL,
            topic: '2026년 귀농귀촌 실태조사(귀농)',
            engine: 'gallup_return_farm'
          },
          quotaDatabase: galList
        });
      } else {
        let needGalUpdate = false;
        if (!Array.isArray(existingGallupCamp.quotaDatabase) || existingGallupCamp.quotaDatabase.length === 0) {
          existingGallupCamp.quotaDatabase = galList;
          existingGallupCamp.quotaSourceFile = galFile;
          needGalUpdate = true;
        } else {
          // 파일에 반영된 최신 완료/검증대기 상태 동기화
          for (const gItem of galList) {
            const match = existingGallupCamp.quotaDatabase.find(q => String(q.id || q.uid) === String(gItem.id || gItem.uid));
            if (match && gItem.quotaStatus && gItem.quotaStatus !== 'ready' && match.quotaStatus === 'ready') {
              Object.assign(match, gItem);
              needGalUpdate = true;
            }
          }
        }
        if (needGalUpdate) {
          CampaignStore.updateCampaign(gallupCampId, {
            quotaDatabase: existingGallupCamp.quotaDatabase,
            quotaSourceFile: existingGallupCamp.quotaSourceFile || galFile
          });
        }
      }
    } catch (_) {}
  }
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
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }
  res.json(campaign);
});

// 캠페인 정보 수정 (1차/2차 설정 저장)
app.put('/api/campaigns/:id', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  // kstatLoginId가 변경되었을 때 quotaDatabase 각 항목의 surveyorAccount도 함께 동기화
  if (req.body.kstatLoginId && Array.isArray(campaign.quotaDatabase)) {
    const newSurveyor = String(req.body.kstatLoginId).trim();
    campaign.quotaDatabase.forEach(q => {
      q.surveyorAccount = newSurveyor;
    });
    req.body.quotaDatabase = campaign.quotaDatabase;
  }

  const updated = CampaignStore.updateCampaign(req.params.id, req.body);
  res.json(updated);
});

// 캠페인 삭제
app.delete('/api/campaigns/:id', (req, res) => {
  CampaignStore.deleteCampaign(req.params.id);
  res.json({ message: '캠페인이 삭제되었습니다.' });
});

// 캠페인 쿼터 DB 업데이트 (대표자 성별, 나이, 점포 수동 추가, 개별 슬롯 URL 수정 및 보관 파일 동기화)
app.put('/api/campaigns/:id/quota', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { quotaDatabase } = req.body;
  if (!Array.isArray(quotaDatabase)) {
    return res.status(400).json({ error: 'quotaDatabase는 배열이어야 합니다.' });
  }

  const isAssoc = (campaign.surveyType === 'kstat_assoc');
  quotaDatabase.forEach((item, idx) => {
    item.index = idx + 1;
    item.seq = idx + 1;
    if (item.slotUrl && String(item.slotUrl).trim()) {
      let cleanUrl = String(item.slotUrl).trim();
      if (!/^https?:\/\//i.test(cleanUrl) && /^[A-Za-z0-9_-]{6,20}$/.test(cleanUrl)) {
        cleanUrl = isAssoc
          ? `https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=${cleanUrl}&type=tapi&prid=2026070801&mnid=900001364&srt=1`
          : `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${cleanUrl}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
      }
      item.slotUrl = cleanUrl;
      item.surveyUrl = cleanUrl;
      const kidMatch = cleanUrl.match(/[?&]KID=([^&#\s]+)/i);
      if (kidMatch) {
        item.ranId = kidMatch[1];
        if (!item.evalUrl) {
          item.evalUrl = isAssoc
            ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${item.ranId}&type=tapi&prid=2026070801&mnid=900001364&srt=2`
            : `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${item.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2`;
        }
      }
      if (!item.slotIndex) item.slotIndex = idx + 1;
      if (!item.slotExtra) item.slotExtra = `(${idx})추가`;
    }
  });

  // 1. 캠페인 쿼터 DB 갱신
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase });
  logger.broadcast({
    type: 'QUOTA_UPDATED',
    quotaDatabase
  });

  // 2. 연관된 쿼터 파일(JSON & XLSX) 동기화 (수동 추가 점포 및 슬롯 URL 포함)
  try {
    const quotaFiles = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
    const linkedQuotaFile = campaign.quotaConfig?.quotaFileName || campaign.quotaSourceFile || null;
    for (const qf of quotaFiles) {
      const qPath = path.join(quotasDir, qf);
      const qContent = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
      if (Array.isArray(qContent.data) && qContent.data.length > 0) {
        let matched = false;
        const syncKeys = [
          'companyName', 'industry', 'bizNumber', 'ceoName', 'ceoGender', 'ceoAge',
          'phone', 'openDate', 'address', 'handledItems', 'mainProducts',
          'slotUrl', 'surveyUrl', 'evalUrl', 'slotIndex', 'slotExtra', 'ranId'
        ];
        qContent.data.forEach(qItem => {
          const matchedCampItem = quotaDatabase.find(c => 
            (c.bizNumber && c.bizNumber === qItem.bizNumber) ||
            (c.companyName && c.companyName === qItem.companyName)
          );
          if (matchedCampItem) {
            syncKeys.forEach(k => {
              if (matchedCampItem[k] !== undefined) qItem[k] = matchedCampItem[k];
            });
            matched = true;
          }
        });

        // 현재 캠페인과 직접 연결된 쿼터 파일인 경우, 캠페인에서 수동 추가된 신규 점포도 원본 쿼터 파일에 반영
        const isLinkedFile = (linkedQuotaFile && qf === linkedQuotaFile) ||
          (!linkedQuotaFile && qContent.marketName && campaign.quotaConfig?.marketName === qContent.marketName);
        if (isLinkedFile) {
          quotaDatabase.forEach(cItem => {
            const existsInFile = qContent.data.some(qItem =>
              (qItem.bizNumber && qItem.bizNumber === cItem.bizNumber) ||
              (qItem.companyName && qItem.companyName === cItem.companyName)
            );
            if (!existsInFile && cItem.companyName) {
              const newSeq = qContent.data.length + 1;
              qContent.data.push({
                seq: newSeq,
                source: cItem.source || 'MANUAL_USER_ADDED',
                marketName: cItem.marketName || qContent.marketName || '전통시장',
                companyName: cItem.companyName,
                industry: cItem.industry || '기타소매',
                bizNumber: cItem.bizNumber || '',
                ceoName: cItem.ceoName || null,
                ceoGender: cItem.ceoGender || null,
                ceoAge: cItem.ceoAge || null,
                phone: cItem.phone || null,
                openDate: cItem.openDate || null,
                address: cItem.address || null,
                handledItems: cItem.handledItems || cItem.industry || '기타소매',
                mainProducts: cItem.mainProducts || null,
                status: cItem.status || '정상가맹',
                paperAccepted: cItem.paperAccepted || 'Y',
                digitalAccepted: cItem.digitalAccepted || 'Y',
                ...(cItem.slotUrl ? {
                  slotUrl: cItem.slotUrl,
                  surveyUrl: cItem.surveyUrl || cItem.slotUrl,
                  evalUrl: cItem.evalUrl || null,
                  slotIndex: cItem.slotIndex || newSeq,
                  slotExtra: cItem.slotExtra || `(${newSeq - 1})추가`,
                  ranId: cItem.ranId || null
                } : {})
              });
              matched = true;
            }
          });
        }

        if (matched) {
          qContent.count = qContent.data.length;
          qContent.updatedAt = new Date().toISOString();
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
  res.json({ success: true, message: '쿼터 DB가 성공적으로 업데이트되었습니다.', count: quotaDatabase.length, quotaDatabase });
});

// 마스터 설문 블루프린트 조회 API
app.get('/api/campaigns/:id/blueprint', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  // 상인회 조사 전용 블루프린트 분기 (완전 격리)
  if (campaign.surveyType === 'kstat_assoc') {
    const assocBlueprintPath = path.join(dataDir, 'kstat_assoc_blueprint.json');
    let assocBlueprint = null;
    if (fs.existsSync(assocBlueprintPath)) {
      try {
        assocBlueprint = JSON.parse(fs.readFileSync(assocBlueprintPath, 'utf-8'));
      } catch (err) {
        console.error('상인회 블루프린트 파일 파싱 실패:', err);
      }
    }
    if (!assocBlueprint) {
      assocBlueprint = {
        surveyId: 'kstat_merchant_assoc_2026',
        title: '2025년 기준 전통시장·상점가 및 점포경영 실태조사 (B.상인회조사)',
        defaultPolicy: {
          F5_emptyStoreReason: '1',
          F6_emptyStorePolicy: '1',
          G1_overchargeReason: '1',
          G2_overchargeSolution: '1',
          G3_program: '2',
          G3_famousStore: '2',
          G3_nightLight: '2',
          G3_tourLink: '2',
          G3_communitySpace: '1',
          G3_certifiedStoreCount: '0',
          G4_cooling_aircon: true,
          G4_cooling_fan: true,
          G4_cooling_arcade: true,
          G4_heating_warmAir: true,
          G4_flood_pump: true,
          G4_flood_wall: false,
          G4_flood_activity_2025: true,
          G4_flood_activity_2026: true,
          eval_H1_1_cleanliness: 4,
          eval_H1_2_entrance: 4,
          eval_H1_3_parking: 3,
          eval_H1_4_floor: 4,
          eval_H1_jitter: true,
          eval_H2_1_specialStreet: '2',
          eval_H2_1_customText: '먹거리 및 패션 특화골목',
          eval_H2_2_specialProduct: '2',
          eval_H2_2_customText: '지역 대표 먹거리 및 신선식품',
          eval_H2_3_brandMark: '2',
          eval_H2_3_customText: '',
          eval_H2_4_brandUsage: '2',
          eval_H2_4_customText: ''
        }
      };
    }
    const effectivePolicy = {
      ...(assocBlueprint.defaultPolicy || {}),
      ...(campaign.assocPolicy || {})
    };
    return res.json({
      surveyType: 'kstat_assoc',
      blueprint: assocBlueprint,
      policy: effectivePolicy,
      campaignTitle: campaign.title,
      slotCount: (campaign.quotaDatabase || []).length
    });
  }

  // 메트릭스 패널조사 전용 블루프린트 분기 (완전 격리)
  if (campaign.surveyType === 'metrix_panel') {
    const metrixBlueprintPath = path.join(dataDir, 'metrix_survey_blueprint.json');
    let metrixBlueprint = null;
    if (fs.existsSync(metrixBlueprintPath)) {
      try {
        metrixBlueprint = JSON.parse(fs.readFileSync(metrixBlueprintPath, 'utf-8'));
      } catch (err) {
        console.error('메트릭스 블루프린트 파일 파싱 실패:', err);
      }
    }
    const effectivePolicy = {
      ...(metrixBlueprint?.defaultPolicy || {}),
      ...(campaign.metrixPolicy || {})
    };
    return res.json({
      surveyType: 'metrix_panel',
      blueprint: metrixBlueprint,
      policy: effectivePolicy,
      campaignTitle: campaign.title,
      slotCount: (campaign.quotaDatabase || []).length,
      hasCustomBaseline: !!campaign.metrixPolicy
    });
  }

  // 코나체인 화성특례시 청소년 설문조사 전용 블루프린트 분기 (완전 격리)
  if (campaign.surveyType === 'kona_youth') {
    const konaBlueprintPath = path.join(dataDir, 'kona_youth_blueprint.json');
    let konaBlueprint = null;
    if (fs.existsSync(konaBlueprintPath)) {
      try {
        konaBlueprint = JSON.parse(fs.readFileSync(konaBlueprintPath, 'utf-8'));
      } catch (err) {
        console.error('코나체인 블루프린트 파일 파싱 실패:', err);
      }
    }
    const effectivePolicy = {
      ...(konaBlueprint?.defaultPolicy || {}),
      ...(campaign.konaPolicy || {})
    };
    return res.json({
      surveyType: 'kona_youth',
      blueprint: konaBlueprint,
      policy: effectivePolicy,
      campaignTitle: campaign.title,
      slotCount: (campaign.quotaDatabase || []).length,
      hasCustomBaseline: !!campaign.konaPolicy
    });
  }

  // 한국리서치 TAPI 2025년 기준 에너지총조사 [건물 부문] 전용 블루프린트 분기 (완전 격리)
  if (campaign.surveyType === 'hrc_energy') {
    const hrcBlueprintPath = path.join(dataDir, 'hrc_energy_blueprint.json');
    let hrcBlueprint = null;
    if (fs.existsSync(hrcBlueprintPath)) {
      try {
        hrcBlueprint = JSON.parse(fs.readFileSync(hrcBlueprintPath, 'utf-8'));
      } catch (err) {
        console.error('에너지총조사 블루프린트 파일 파싱 실패:', err);
      }
    }
    const effectivePolicy = {
      ...(hrcBlueprint?.defaultPolicy || {}),
      ...(campaign.hrcEnergyPolicy || {})
    };
    return res.json({
      surveyType: 'hrc_energy',
      blueprint: hrcBlueprint,
      policy: effectivePolicy,
      campaignTitle: campaign.title,
      slotCount: (campaign.quotaDatabase || []).length,
      hasCustomBaseline: !!campaign.hrcEnergyPolicy
    });
  }

  // 글로벌리서치 제5차 성인문해능력조사 (GR20260618-1-001-02 / SNUM 5963) 나이대별 그룹 가이드 분기
  if (campaign.surveyType === 'globalri_literacy') {
    const globalriBlueprintPath = path.join(dataDir, 'globalri_literacy_blueprint.json');
    let globalriBlueprint = null;
    if (fs.existsSync(globalriBlueprintPath)) {
      try {
        globalriBlueprint = JSON.parse(fs.readFileSync(globalriBlueprintPath, 'utf-8'));
      } catch (err) {
        console.error('성인문해능력조사 블루프린트 파싱 실패:', err);
      }
    }
    const defaultPolicy = globalriBlueprint?.defaultPolicy || { ageGroups: {} };
    const savedPolicy = campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || {};
    const mergedAgeGroups = {};
    const ageKeys = ['age20', 'age30', 'age40', 'age50', 'age60', 'age70'];
    ageKeys.forEach(k => {
      mergedAgeGroups[k] = {
        ...(defaultPolicy.ageGroups?.[k] || {}),
        ...(savedPolicy.ageGroups?.[k] || savedPolicy.groups?.[k] || {})
      };
    });

    const ageGroupStats = {
      age20: { key: 'age20', label: '20대 (18~29세)', shortLabel: '20대', count: 0, members: [] },
      age30: { key: 'age30', label: '30대 (30~39세)', shortLabel: '30대', count: 0, members: [] },
      age40: { key: 'age40', label: '40대 (40~49세)', shortLabel: '40대', count: 0, members: [] },
      age50: { key: 'age50', label: '50대 (50~59세)', shortLabel: '50대', count: 0, members: [] },
      age60: { key: 'age60', label: '60대 (60~69세)', shortLabel: '60대', count: 0, members: [] },
      age70: { key: 'age70', label: '70대 이상 (70세~)', shortLabel: '70대 이상', count: 0, members: [] }
    };
    (campaign.quotaDatabase || []).forEach(q => {
      const ageInfo = getAgeGroupFromBirthYear(q.birthYear || (2026 - (q.age || q.ceoAge || 40)));
      const rawKey = String(q.ageGroupKey || q.ageGroup || '');
      const gk = /^age(20|30|40|50|60|70)$/.test(rawKey)
        ? rawKey
        : (ageInfo.ageGroup || 'age50');
      if (ageGroupStats[gk]) {
        ageGroupStats[gk].count++;
        ageGroupStats[gk].members.push(`${q.memberName || q.respondentName || q.ceoName || q.companyName}(${q.age || ageInfo.age}세/LID ${q.lid || '-'})`);
      }
    });

    const effectivePolicy = {
      ...defaultPolicy,
      ...savedPolicy,
      ageGroups: mergedAgeGroups
    };

    return res.json({
      surveyType: 'globalri_literacy',
      blueprint: globalriBlueprint,
      policy: effectivePolicy,
      ageGroups: mergedAgeGroups,
      ageGroupStats,
      campaignTitle: campaign.title,
      slotCount: (campaign.quotaDatabase || []).length,
      hasCustomBaseline: !!(campaign.globalriLiteracyPolicy || campaign.masterBaseline)
    });
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
      employeeFamily: 0,
      employeeFamilyMin: 0,
      employeeFamilyMax: 0,
      employeeRegular: 0,
      employeeRegularMin: 0,
      employeeRegularMax: 0,
      employeeTemp: 0,
      employeeTempMin: 0,
      employeeTempMax: 0,
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
      employeeFamily: 0,
      employeeFamilyMin: 0,
      employeeFamilyMax: 0,
      employeeRegular: 0,
      employeeRegularMin: 0,
      employeeRegularMax: 0,
      employeeTemp: 0,
      employeeTempMin: 0,
      employeeTempMax: 0,
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
      employeeFamily: 0,
      employeeFamilyMin: 0,
      employeeFamilyMax: 0,
      employeeRegular: 0,
      employeeRegularMin: 0,
      employeeRegularMax: 0,
      employeeTemp: 0,
      employeeTempMin: 0,
      employeeTempMax: 0,
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
  ['group1', 'group2', 'group3'].forEach(g => {
    if (groupBaselines[g]) {
      if (groupBaselines[g].employeeFamilyMin === 1 && groupBaselines[g].employeeFamilyMax === 1) {
        groupBaselines[g].employeeFamily = 0;
        groupBaselines[g].employeeFamilyMin = 0;
        groupBaselines[g].employeeFamilyMax = 0;
      }
    }
  });

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
  const isAssoc = (campaign.surveyType === 'kstat_assoc');
  const isMetrix = (campaign.surveyType === 'metrix_panel');
  const isKona = (campaign.surveyType === 'kona_youth');
  const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
  const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');

  CampaignStore.updateCampaign(campaign.id, {
    masterBaseline: baseline,
    hasMasterBlueprint: true,
    ...(isAssoc ? { assocPolicy: baseline.policy || baseline } : {}),
    ...(isMetrix ? { metrixPolicy: baseline.policy || baseline } : {}),
    ...(isKona ? { konaPolicy: baseline.policy || baseline } : {}),
    ...(isHrcEnergy ? { hrcEnergyPolicy: baseline.policy || baseline } : {}),
    ...(isGlobalriLiteracy ? { globalriLiteracyPolicy: baseline.policy || baseline } : {})
  });

  logger.success(`[마스터 기준점 저장] 캠페인 "${campaign.title}"의 ${isGlobalriLiteracy ? '제5차 성인문해능력조사 나이대별 그룹 가이드' : (isHrcEnergy ? '에너지총조사 건물 부문 응답 규칙' : (isKona ? '코나체인 청소년 설문 기준 가이드' : (isMetrix ? '메트릭스 패널조사 기준 가이드' : (isAssoc ? '상인회 25단계 정책 가이드' : '17단계 마스터 기준점'))))}이 저장되었습니다! 🎯`);
  res.json({
    success: true,
    message: isGlobalriLiteracy
      ? '제5차 성인문해능력조사 나이대별(20대/30대/40대/50대/60대/70대+) 그룹 가이드라인이 성공적으로 저장되었습니다.'
      : (isHrcEnergy
        ? '2025년 기준 에너지총조사 [건물 부문] 응답 기준 가이드라인(기입력 보존 정책 포함)이 성공적으로 저장되었습니다.'
        : (isKona
          ? '화성특례시 청소년 설문조사 기준 가이드라인이 성공적으로 저장되었습니다.'
          : (isMetrix
            ? '메트릭스 패널조사 기준 가이드라인이 성공적으로 저장되었습니다.'
            : (isAssoc 
              ? '상인회 정책 가이드라인이 성공적으로 저장되었습니다.'
              : '마스터 기준점(Baseline)이 성공적으로 저장되었습니다. 이제 전체 배치 자동화를 가동할 수 있습니다.')))),
    baseline
  });
});

// 선택한 쿼터 항목들에 개별 설문 응답 가이드(customGuide) 일괄 부여·저장 API
app.post('/api/campaigns/:id/apply-selected-guide', (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { targetIndices = [], guide = {}, guideSummary = '', presetLabel = '' } = req.body;
  if (!Array.isArray(targetIndices) || targetIndices.length === 0) {
    return res.status(400).json({ error: '가이드를 적용할 대상자를 먼저 STEP 1 쿼터 목록에서 체크해 주세요.' });
  }

  const indexSet = new Set(targetIndices.map(n => Number(n)).filter(n => !isNaN(n)));
  const quotaDb = Array.isArray(campaign.quotaDatabase) ? campaign.quotaDatabase : [];
  let appliedCount = 0;
  const appliedNames = [];

  quotaDb.forEach((item, idx) => {
    const seq = Number(item.index || item.seq || (idx + 1));
    if (indexSet.has(seq)) {
      item.customGuide = { ...guide };
      item.guideApplied = true;
      item.guideSummary = guideSummary || `Part C: ${guide.partC_correctCountMin ?? 18}~${guide.partC_correctCountMax ?? 20}점 · D5(${String(guide.D5_1_healthLiteracy || '4_5').replace('_', '~')})`;
      item.guidePresetLabel = presetLabel || '';
      item.guideUpdatedAt = new Date().toISOString();
      appliedCount++;
      appliedNames.push(`#${seq} ${item.memberName || item.respondentName || item.ceoName || '-'}`);
    }
  });

  CampaignStore.updateCampaign(campaign.id, {
    quotaDatabase: quotaDb,
    hasMasterBlueprint: true
  });

  logger.broadcast({
    type: 'QUOTA_UPDATED',
    quotaDatabase: quotaDb
  });

  logger.success(`[선택 쿼터 가이드 부여] "${campaign.title}" ➔ 선택된 ${appliedCount}명(${appliedNames.join(', ')})에게 맞춤 응답 가이드 적용 완료!`);
  res.json({
    success: true,
    appliedCount,
    appliedNames,
    message: `선택한 대상자 ${appliedCount}명(${appliedNames.join(', ')})에게 설문 응답 가이드가 적용·저장되었습니다.`,
    quotaDatabase: quotaDb
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
// [1.5] 케이스탯 슬롯 파싱 및 쿼터 바인딩 API
// ==========================================
app.post('/api/kstat/fetch-slots', async (req, res) => {
  const { listUrl, marketName = '', maxPages = 5, loginId, loginPw } = req.body;
  if (!listUrl) {
    return res.status(400).json({ error: '케이스탯 list.php URL이 필요합니다.' });
  }

  try {
    const result = await scrapeKstatSlots(listUrl, {
      marketName,
      maxPages,
      loginId: loginId ? String(loginId).trim() : (process.env.KSTAT_LOGIN_ID || '가온김영옥'),
      loginPw: loginPw ? String(loginPw).trim() : (process.env.KSTAT_LOGIN_PW || '1234')
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/bind-kstat-slots', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { listUrl, marketName = '', slots: inputSlots, loginId, loginPw } = req.body;
  let slots = inputSlots;

  const effectiveLoginId = (loginId || campaign.kstatLoginId || process.env.KSTAT_LOGIN_ID || '가온김영옥').trim();
  const effectiveLoginPw = (loginPw || campaign.kstatLoginPw || process.env.KSTAT_LOGIN_PW || '1234').trim();

  if (!slots && listUrl) {
    const scrapeResult = await scrapeKstatSlots(listUrl, {
      marketName,
      maxPages: 5,
      loginId: effectiveLoginId,
      loginPw: effectiveLoginPw
    });
    if (!scrapeResult.success) {
      return res.status(500).json({ error: '슬롯 파싱 실패: ' + scrapeResult.error });
    }
    slots = scrapeResult.slots;
  }

  if (!slots || slots.length === 0) {
    return res.status(400).json({ error: '바인딩할 슬롯 데이터가 없습니다.' });
  }

  const quotaDb = campaign.quotaDatabase || [];
  if (quotaDb.length === 0) {
    return res.status(400).json({ error: '캠페인에 등록된 조사 쿼터가 없습니다. 먼저 쿼터를 로드해 주세요.' });
  }

  // 0단계: 기존 잔류 슬롯 필드 완전 초기화 (재바인딩 시 잔류 데이터로 인한 중복 방지)
  quotaDb.forEach((q) => {
    delete q.slotIndex;
    delete q.slotExtra;
    delete q.ranId;
    delete q.slotUrl;
    delete q.surveyUrl;
    delete q.evalUrl;
    delete q.kstatMeta;
  });

  let boundCount = 0;
  const usedSlots = new Set();

  // 1차 패스: 상호명(점포명) 기준 매칭 (Kstat 슬롯에 실제 점포명이 입력된 경우)
  quotaDb.forEach((q) => {
    const qName = String(q.companyName || '').replace(/[\s\(\)·]/g, '').toLowerCase();
    const matchedSlot = slots.find(s => {
      if (usedSlots.has(s.ran_id)) return false;
      const sName = String(s.storeName || '').replace(/[\s\(\)·]/g, '').toLowerCase();
      return qName.length > 1 && sName.length > 1 && (qName === sName || qName.includes(sName) || sName.includes(qName));
    });

    if (matchedSlot) {
      usedSlots.add(matchedSlot.ran_id);
      q.slotIndex = matchedSlot.slotIndex;
      q.slotExtra = matchedSlot.extraLabel;
      q.ranId = matchedSlot.ran_id;
      q.slotUrl = matchedSlot.surveyUrl;
      q.surveyUrl = matchedSlot.surveyUrl;
      q.evalUrl = matchedSlot.evalUrl;
      q.surveyCompleted = matchedSlot.surveyCompleted;
      q.evalCompleted = matchedSlot.evalCompleted;
      q.idSel = matchedSlot.idSel;
      q.kid = matchedSlot.kid;
      q.gid = matchedSlot.gid || '0';
      q.kstatMeta = { idSel: matchedSlot.idSel, kid: matchedSlot.kid, gid: matchedSlot.gid, mkCode: matchedSlot.mkCode, regNum: matchedSlot.regNum };
      boundCount++;
    }
  });

  // 2차 패스: 미할당 쿼터에 잔여 슬롯 순차(1:1) 할당
  const remainingSlots = slots.filter(s => !usedSlots.has(s.ran_id));
  let remIdx = 0;
  quotaDb.forEach((q) => {
    if (!q.ranId && remIdx < remainingSlots.length) {
      const s = remainingSlots[remIdx++];
      usedSlots.add(s.ran_id);
      q.slotIndex = s.slotIndex;
      q.slotExtra = s.extraLabel;
      q.ranId = s.ran_id;
      q.slotUrl = s.surveyUrl;
      q.surveyUrl = s.surveyUrl;
      q.evalUrl = s.evalUrl;
      q.surveyCompleted = s.surveyCompleted;
      q.evalCompleted = s.evalCompleted;
      q.idSel = s.idSel;
      q.kid = s.kid;
      q.gid = s.gid || '0';
      q.kstatMeta = { idSel: s.idSel, kid: s.kid, gid: s.gid, mkCode: s.mkCode, regNum: s.regNum };
      boundCount++;
    }
  });

  // 3차 패스: 슬롯 고유성(Uniqueness) 철저 검증 - 중복 슬롯 발생 시 즉시 방어
  const seenRanIds = new Set();
  for (const q of quotaDb) {
    if (q.ranId) {
      if (seenRanIds.has(q.ranId)) {
        logger.error(`[슬롯 바인딩 오류] 중복 슬롯 ID 감지: [${q.companyName}] 점포에 중복된 슬롯(${q.ranId})이 감지되어 바인딩을 차단합니다.`);
        return res.status(409).json({ error: `슬롯 중복 매핑 감지: [${q.companyName}] 점포에 중복된 슬롯 ID(${q.ranId})가 발생했습니다.` });
      }
      seenRanIds.add(q.ranId);
    }
  }

  CampaignStore.updateCampaign(campaign.id, {
    quotaDatabase: quotaDb,
    kstatListUrl: listUrl || campaign.kstatListUrl,
    kstatLoginId: effectiveLoginId,
    kstatLoginPw: effectiveLoginPw
  });

  logger.success(`[Kstat 슬롯 바인딩 완료] 캠페인 "${campaign.title}" (조사원: ${effectiveLoginId}) ➔ 총 ${boundCount}개 쿼터에 슬롯 바인딩 완료!`);
  logger.broadcast({
    type: 'QUOTA_UPDATED',
    quotaDatabase: quotaDb
  });

  res.json({
    success: true,
    message: `총 ${boundCount}개 쿼터에 케이스탯 슬롯 (조사원: ${effectiveLoginId})이 성공적으로 바인딩되었습니다.`,
    boundCount,
    loginId: effectiveLoginId,
    totalQuotas: quotaDb.length,
    quotaDatabase: quotaDb
  });
});

// ==========================================
// [상인회 전용 API] 상인회 슬롯 목록 스크랩 API (완전 격리)
// ==========================================
app.post('/api/kstat/fetch-assoc-slots', async (req, res) => {
  try {
    const { listUrl, loginId, loginPw } = req.body;
    logger.info(`[상인회 슬롯 API] 스크랩 요청 수신 (조사원: ${loginId || '가온박정순'})`);
    const result = await scrapeKstatAssocSlots(listUrl, {
      loginId: loginId || '가온박정순',
      loginPw: loginPw || '1234'
    });
    res.json(result);
  } catch (err) {
    logger.error('[상인회 슬롯 API] 오류 발생:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [상인회 쿼터 보관함 동기화 헬퍼] 상인회 캠페인 ⇄ data/quotas/quota_assoc_*.json 양방향 동기화
// ==========================================
function buildAssocQuotaColumns() {
  return [
    { key: 'companyName', label: '상호(시장명)' },
    { key: 'industry', label: '시장유형' },
    { key: 'bizNumber', label: '시장코드' },
    { key: 'ceoName', label: '상인회장' },
    { key: 'ceoGender', label: '성별' },
    { key: 'ceoAge', label: '나이' },
    { key: 'phone', label: '연락처' },
    { key: 'openDate', label: '등록번호' },
    { key: 'address', label: '소재지 주소' },
    { key: 'handledItems', label: '시장분류' },
    { key: 'mainProducts', label: '조사원계정' },
    { key: 'marketName', label: '시장명' },
    { key: 'status', label: '진행상태' }
  ];
}

function normalizeAssocQuotaItem(item, idx, fallbackSurveyor = '') {
  const seq = idx + 1;
  const marketName = item.marketName || item.companyName || '-';
  const marketType = item.marketType || item.industry || '전통시장';
  const marketCode = (item.marketCode && item.marketCode !== '-')
    ? item.marketCode
    : ((item.bizNumber && item.bizNumber !== '-') ? item.bizNumber : '');
  const leaderName = item.leaderName || item.ceoName || '';
  const phone = item.phone || item.leaderPhone || item.assocPhone || '';
  const surveyorAccount = item.surveyorAccount || item.mainProducts || fallbackSurveyor || '';
  const isDone = item.quotaStatus === 'completed' || item.quotaStatus === 'used' || item.surveyCompleted === true || item.status === '완료';

  return {
    ...item,
    seq,
    index: seq,
    slotIndex: item.slotIndex || seq,
    surveyorAccount,
    marketCode: marketCode || item.marketCode || '',
    regNumber: item.regNumber || '',
    marketName,
    companyName: marketName,
    marketType,
    industry: marketType,
    bizNumber: marketCode || item.bizNumber || '-',
    leaderName,
    ceoName: leaderName,
    ceoGender: item.ceoGender || '-',
    ceoAge: item.ceoAge || null,
    assocPhone: item.assocPhone || phone,
    leaderPhone: item.leaderPhone || phone,
    phone,
    openDate: item.openDate || (item.regNumber ? `등록:${item.regNumber}` : '-'),
    sido: item.sido || '',
    sigungu: item.sigungu || '',
    address: item.address || `${item.sido || ''} ${item.sigungu || ''}`.trim(),
    handledItems: item.handledItems || marketType || '상인회',
    mainProducts: surveyorAccount || '상인회',
    office: item.office || '',
    zone: item.zone || '',
    ranId: item.ranId || item.kid || '',
    idSel: item.idSel || (item.kid ? String(Number(item.kid) + 1) : null),
    kid: item.kid || item.ranId || '',
    gid: item.gid || '0',
    slotUrl: item.slotUrl || item.surveyUrl || '',
    surveyUrl: item.slotUrl || item.surveyUrl || '',
    evalUrl: item.evalUrl || '',
    quotaStatus: item.quotaStatus || (isDone ? 'completed' : 'ready'),
    evalStatus: item.evalStatus || 'pending',
    surveyCompleted: !!item.surveyCompleted || isDone,
    evalCompleted: !!item.evalCompleted,
    status: isDone ? '완료' : '대기'
  };
}

function syncAssocCampaignToQuotaFile(camp, forceOverwrite = false) {
  try {
    if (!camp || !camp.id) return null;
    const isAssocCamp = camp.surveyType === 'kstat_assoc' || String(camp.title || '').includes('상인회');
    if (!isAssocCamp) return null;
    if (!Array.isArray(camp.quotaDatabase) || camp.quotaDatabase.length === 0) return null;

    const safeFileName = (camp.quotaConfig?.quotaFileName && camp.quotaConfig.quotaFileName.endsWith('.json'))
      ? path.basename(camp.quotaConfig.quotaFileName)
      : `quota_assoc_${camp.id}.json`;
    const jsonPath = path.join(quotasDir, safeFileName);

    if (!forceOverwrite && fs.existsSync(jsonPath)) {
      if (!camp.quotaConfig || camp.quotaConfig.quotaFileName !== safeFileName) {
        CampaignStore.updateCampaign(camp.id, {
          quotaConfig: {
            ...(camp.quotaConfig || {}),
            quotaSource: 'KSTAT_ASSOC_SYNC',
            quotaFileName: safeFileName,
            targetCount: camp.quotaDatabase.length
          }
        });
      }
      return safeFileName;
    }

    const surveyorId = camp.kstatLoginId || camp.quotaDatabase[0]?.surveyorAccount || camp.title || '상인회';
    const rawTitle = String(camp.title || surveyorId).trim();
    const quotaTitle = rawTitle.includes('상인회')
      ? (rawTitle.includes(surveyorId) ? rawTitle : `${rawTitle} (${surveyorId})`)
      : `[상인회] ${rawTitle}${rawTitle !== surveyorId ? ` (${surveyorId})` : ' 조사쿼터'}`;

    const normalizedData = camp.quotaDatabase.map((item, idx) => normalizeAssocQuotaItem(item, idx, surveyorId));
    const columns = buildAssocQuotaColumns();

    const dist = {};
    normalizedData.forEach(d => {
      const mt = String(d.marketType || '전통시장').trim();
      dist[mt] = (dist[mt] || 0) + 1;
    });

    const quotaPayload = {
      title: quotaTitle,
      type: 'KSTAT_ASSOC',
      surveyType: 'kstat_assoc',
      linkedCampaignId: camp.id,
      surveyorId,
      surveyorName: rawTitle,
      kstatLoginPw: camp.kstatLoginPw || '1234',
      kstatListUrl: camp.kstatListUrl || 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi',
      marketName: `전통시장 상인회 · ${surveyorId}`,
      keyword: surveyorId,
      count: normalizedData.length,
      targetTotal: normalizedData.length,
      isComplete: true,
      industryDistribution: dist,
      createdAt: camp.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      columns,
      data: normalizedData
    };

    fs.writeFileSync(jsonPath, JSON.stringify(quotaPayload, null, 2), 'utf-8');

    const excelName = safeFileName.replace('.json', '.xlsx');
    const excelPath = path.join(quotasDir, excelName);
    try {
      exportBusinessesToExcel({
        data: normalizedData,
        columns,
        filePath: excelPath
      });
    } catch (_) {}

    if (!camp.quotaConfig || camp.quotaConfig.quotaFileName !== safeFileName || camp.quotaConfig.targetCount !== normalizedData.length) {
      CampaignStore.updateCampaign(camp.id, {
        quotaConfig: {
          ...(camp.quotaConfig || {}),
          quotaSource: 'KSTAT_ASSOC_SYNC',
          quotaFileName: safeFileName,
          quotaTitle,
          marketName: quotaPayload.marketName,
          targetCount: normalizedData.length
        }
      });
    }
    return safeFileName;
  } catch (err) {
    logger.error(`[상인회 쿼터 파일 동기화 오류] (${camp?.id}):`, err);
    return null;
  }
}

function ensureAssocCampaignQuotaFiles() {
  try {
    const allCamps = CampaignStore.getAllCampaigns();
    allCamps.forEach(camp => {
      const isAssocCamp = camp.surveyType === 'kstat_assoc' || String(camp.title || '').includes('상인회');
      if (isAssocCamp && Array.isArray(camp.quotaDatabase) && camp.quotaDatabase.length > 0) {
        syncAssocCampaignToQuotaFile(camp, false);
      }
    });
  } catch (err) {
    logger.error('[상인회 쿼터 보관함 자동 보장 오류]:', err);
  }
}

// 캠페인 내 특정 쿼터 항목 단건 삭제 API (상인회 등 불필요/기완료 항목 즉시 제외)
app.delete('/api/campaigns/:id/quota-item/:seq', (req, res) => {
  try {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    const targetSeq = parseInt(req.params.seq, 10);
    if (!targetSeq || !Array.isArray(campaign.quotaDatabase)) {
      return res.status(400).json({ error: '유효하지 않은 순번이거나 쿼터 데이터가 없습니다.' });
    }

    const beforeLen = campaign.quotaDatabase.length;
    const removedItem = campaign.quotaDatabase.find((item, idx) => Number(item.index || item.seq || (idx + 1)) === targetSeq);
    const remaining = campaign.quotaDatabase
      .filter((item, idx) => Number(item.index || item.seq || (idx + 1)) !== targetSeq)
      .map((item, idx) => ({
        ...item,
        seq: idx + 1,
        index: idx + 1,
        slotIndex: idx + 1
      }));

    if (remaining.length === beforeLen) {
      return res.status(404).json({ error: `순번 #${targetSeq} 항목을 찾을 수 없습니다.` });
    }

    const updated = CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: remaining,
      quotaConfig: {
        ...(campaign.quotaConfig || {}),
        targetCount: remaining.length
      }
    });

    if (updated.surveyType === 'kstat_assoc' || String(updated.title || '').includes('상인회')) {
      syncAssocCampaignToQuotaFile(updated, true);
    }

    logger.info(`[쿼터 항목 삭제] 캠페인 "${campaign.title}"에서 #${targetSeq} (${removedItem?.marketName || removedItem?.companyName || removedItem?.memberName || ''}) 제외 완료 (잔여: ${remaining.length}건)`);
    res.json({
      success: true,
      message: `선택한 항목이 쿼터에서 삭제되었습니다. (잔여 ${remaining.length}건)`,
      removedItem,
      quotaDatabase: remaining,
      campaign: updated
    });
  } catch (err) {
    logger.error('[캠페인 쿼터 항목 삭제 오류]:', err);
    res.status(500).json({ error: err.message });
  }
});

// 캠페인 내 복수 쿼터 항목 일괄 삭제 API
app.post('/api/campaigns/:id/delete-quota-items', (req, res) => {
  try {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    const { seqList } = req.body || {};
    if (!Array.isArray(seqList) || seqList.length === 0 || !Array.isArray(campaign.quotaDatabase)) {
      return res.status(400).json({ error: '삭제할 항목 번호 목록(seqList)이 필요합니다.' });
    }
    const seqSet = new Set(seqList.map(n => Number(n)));
    const remaining = campaign.quotaDatabase
      .filter((item, idx) => !seqSet.has(Number(item.index || item.seq || (idx + 1))))
      .map((item, idx) => ({
        ...item,
        seq: idx + 1,
        index: idx + 1,
        slotIndex: idx + 1
      }));

    const removedCount = campaign.quotaDatabase.length - remaining.length;
    const updated = CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: remaining,
      quotaConfig: {
        ...(campaign.quotaConfig || {}),
        targetCount: remaining.length
      }
    });

    if (updated.surveyType === 'kstat_assoc' || String(updated.title || '').includes('상인회')) {
      syncAssocCampaignToQuotaFile(updated, true);
    }

    logger.info(`[쿼터 일괄 삭제] 캠페인 "${campaign.title}"에서 ${removedCount}건 제외 완료 (잔여: ${remaining.length}건)`);
    res.json({
      success: true,
      message: `총 ${removedCount}개 항목이 쿼터에서 삭제되었습니다. (잔여 ${remaining.length}건)`,
      removedCount,
      quotaDatabase: remaining,
      campaign: updated
    });
  } catch (err) {
    logger.error('[캠페인 쿼터 일괄 삭제 오류]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [상인회 전용 API] 상인회 슬롯 1:1 자동 바인딩 API (완전 격리)
// ==========================================
app.post('/api/campaigns/:id/bind-assoc-slots', async (req, res) => {
  try {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const { slots, loginId, loginPw, listUrl } = req.body;
    let targetSlots = slots;

    // 전달된 슬롯이 없으면 즉시 자동 스크랩 수행
    if (!Array.isArray(targetSlots) || targetSlots.length === 0) {
      logger.info(`[상인회 슬롯 바인딩] 슬롯 즉시 자동 스크랩 가동...`);
      const scrapResult = await scrapeKstatAssocSlots(listUrl, {
        loginId: loginId || campaign.kstatLoginId || '가온박정순',
        loginPw: loginPw || campaign.kstatLoginPw || '1234'
      });
      targetSlots = scrapResult.slots;
    }

    if (!targetSlots || targetSlots.length === 0) {
      return res.status(400).json({ error: '추출된 상인회 슬롯이 없습니다.' });
    }

    const targetSurveyor = (loginId || campaign.kstatLoginId || '가온이강윤').trim();

    // 쿼터 DB로 상인회 슬롯 등록
    const quotaDb = targetSlots.map((s, idx) => ({
      seq: idx + 1,
      index: idx + 1,
      slotIndex: idx + 1,
      surveyorAccount: targetSurveyor,
      marketCode: s.marketCode,
      regNumber: s.regNumber,
      marketName: s.marketName,
      companyName: s.marketName, // 공통 호환
      marketType: s.marketType,
      industry: s.marketType || '상인회',
      sido: s.sido,
      sigungu: s.sigungu,
      assocPhone: s.assocPhone,
      leaderName: s.leaderName,
      ceoName: s.leaderName, // 공통 호환
      phone: s.leaderPhone || s.assocPhone,
      leaderPhone: s.leaderPhone,
      address: s.address,
      office: s.office,
      zone: s.zone,
      ranId: s.ranId,
      idSel: s.idSel || (s.kid ? String(Number(s.kid) + 1) : null),
      kid: s.kid,
      gid: s.gid || '0',
      slotUrl: s.slotUrl,
      evalUrl: s.evalUrl,
      quotaStatus: 'ready'
    }));

    const updatePayload = {
      surveyType: 'kstat_assoc',
      quotaDatabase: quotaDb,
      kstatLoginId: targetSurveyor,
      kstatLoginPw: loginPw || campaign.kstatLoginPw || '1234',
      kstatListUrl: listUrl || 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi'
    };

    const updated = CampaignStore.updateCampaign(campaign.id, updatePayload);
    syncAssocCampaignToQuotaFile(updated, true);
    logger.success(`[상인회 슬롯 바인딩 완료] 캠페인 "${campaign.title}" ➔ 총 ${quotaDb.length}개 상인회 바인딩 및 쿼터 보관함 동기화 성공`);
    logger.broadcast({
      type: 'QUOTA_UPDATED',
      quotaDatabase: quotaDb
    });

    res.json({
      success: true,
      message: `총 ${quotaDb.length}개 상인회 슬롯이 캠페인에 성공적으로 바인딩되었습니다.`,
      boundCount: quotaDb.length,
      quotaDatabase: quotaDb,
      campaign: updated
    });
  } catch (err) {
    logger.error('[상인회 슬롯 바인딩 실패]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [1-1] Kstat TAPI list.php 실시간 상태 동기화 및 [조사 진행상태] '조사완료' 자동 저장 API
// ==========================================
app.post('/api/campaigns/:id/sync-kstat-status', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  try {
    logger.info(`[Kstat 상태 일괄 동기화 시작] 캠페인 "${campaign.title}" (${campaign.id})`);
    const syncRes = await syncCampaignKstatSlots(campaign);
    const progCount = syncRes.progressUpdateSummary?.updatedCount || 0;
    const bothCount = syncRes.progressUpdateSummary?.bothCompletedCount || 0;
    logger.success(`[Kstat 상태 일괄 동기화 완료] 총 ${syncRes.syncedCount}개 슬롯 동기화 및 ${progCount}건 [조사 진행상태: 조사완료] 신규 저장 성공 (둘다완료 총 ${bothCount}건)`);
    res.json({
      success: true,
      message: `총 ${syncRes.syncedCount}개 슬롯 상태 동기화 및 [조사표+평가 완료] ${bothCount}건 중 ${progCount}건의 [조사 진행상태]를 '조사완료'로 저장했습니다.`,
      details: syncRes
    });
  } catch (err) {
    logger.error(`[Kstat 상태 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Kstat 조사원 계정 단위 [조사 진행상태] '조사완료' 일괄 변경 API
app.post('/api/kstat/bulk-complete-progress', async (req, res) => {
  try {
    const { loginId, loginPw = '1234', pridSel = '2026070802' } = req.body || {};
    if (!loginId) {
      return res.status(400).json({ error: '조사원 로그인 계정(loginId)을 입력해 주세요.' });
    }
    const result = await bulkUpdateKstatAccountProgress({
      loginId: String(loginId).trim(),
      loginPw: String(loginPw || '1234').trim(),
      pridSel: String(pridSel || '2026070802').trim()
    });
    res.json({
      success: true,
      message: `[${loginId}] 조사표+평가 둘다완료 ${result.bothCompletedCount}건 중 ${result.updatedCount}건을 '조사완료'로 신규 저장했습니다. (기존 완료: ${result.alreadyCompletedCount}건)`,
      ...result
    });
  } catch (err) {
    logger.error(`[Kstat 일괄 진행상태 저장 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [1-2] 한국리서치 TAPI 2025년 기준 에너지총조사 [건물] 실시간 상태 동기화 API
// ==========================================
app.post('/api/campaigns/:id/sync-hrc-energy', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  try {
    const loginId = String(req.body?.loginId || campaign.loginId || '700275').trim();
    const loginPw = String(req.body?.loginPw || campaign.loginPw || loginId).trim();
    logger.info(`[에너지총조사 상태 동기화 시작] 캠페인 "${campaign.title}" (조사원 ID: ${loginId})`);

    const syncRes = await scrapeHrcEnergySlots({
      loginId,
      loginPw,
      onProgress: (msg) => logger.info(`[HRC TAPI 동기화] ${msg}`)
    });

    if (Array.isArray(syncRes.mergedData) && syncRes.mergedData.length > 0) {
      const updatedQuotaDb = syncRes.mergedData.map((item, idx) => {
        const uidStr = String(item.uid || '').trim();
        return {
          ...item,
          index: item.index || idx + 1,
          seq: item.seq || idx + 1,
          companyName: item.buildingName || item.companyName || `건물_${uidStr}`,
          ceoName: item.contactName || item.ceoName || '관리소장',
          slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uidStr}&page=1`,
          surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uidStr}&page=1`
        };
      });

      CampaignStore.updateCampaign(campaign.id, {
        quotaDatabase: updatedQuotaDb,
        loginId,
        loginPw
      });

      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: updatedQuotaDb
      });
    }

    const doneCount = (syncRes.mergedData || []).filter(d => d.quotaStatus === 'completed' || d.status === '완료').length;
    logger.success(`[에너지총조사 상태 동기화 완료] 조사원 ${loginId}: 총 ${syncRes.totalScraped}건 스크랩, 완료 ${doneCount}건 반영`);

    res.json({
      success: true,
      message: `한국리서치 TAPI(${loginId}) 실시간 동기화 완료! (총 ${syncRes.totalScraped}건 확인 / 완료 ${doneCount}건)`,
      totalScraped: syncRes.totalScraped,
      completedCount: doneCount,
      quotaDatabase: CampaignStore.getCampaignById(campaign.id)?.quotaDatabase || []
    });
  } catch (err) {
    logger.error(`[에너지총조사 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quota/sync-hrc-energy', async (req, res) => {
  try {
    const loginId = String(req.body?.loginId || '700275').trim();
    const loginPw = String(req.body?.loginPw || loginId).trim();
    const syncRes = await scrapeHrcEnergySlots({
      loginId,
      loginPw,
      onProgress: (msg) => logger.info(`[HRC 쿼터 동기화] ${msg}`)
    });
    res.json({
      success: true,
      message: `조사원 ${loginId} 쿼터 동기화 완료 (${syncRes.totalScraped}건)`,
      ...syncRes
    });
  } catch (err) {
    logger.error(`[HRC 쿼터 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [1-3] 글로벌리서치 제5차 성인문해능력조사 (GR20260618-1-001-02) 실시간 쿼터 동기화 및 LID 필터링 API
// ==========================================
app.post('/api/campaigns/:id/sync-globalri-literacy', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  try {
    const loginId = String(req.body?.loginId || campaign.loginId || '01071447791').trim();
    const loginPw = String(req.body?.loginPw || campaign.loginPw || '2038020').trim();
    const lidFilter = String(req.body?.lidFilter || '').trim();
    const onlyInProgress = (req.body?.onlyInProgress !== false);

    logger.info(`[성인문해능력조사 쿼터 동기화] 캠페인 "${campaign.title}" (면접원 ID: ${loginId}, LID 필터: ${lidFilter || '결과값1=완료 & 결과값2=완료 전체'})`);

    const syncRes = await scrapeGlobalriLiteracyQuotas({
      loginId,
      loginPw,
      lidFilter,
      onlyInProgress
    });

    const updatedQuotaDb = (syncRes.quotaMembers || []).map((item, idx) => ({
      ...item,
      index: idx + 1,
      seq: idx + 1
    }));

    CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: updatedQuotaDb,
      loginId,
      loginPw,
      quotaSourceFile: syncRes.jsonFileName
    });

    logger.broadcast({
      type: 'QUOTA_UPDATED',
      campaignId: campaign.id,
      quotaDatabase: updatedQuotaDb
    });

    res.json({
      success: true,
      message: `글로벌리서치(GIFT) 실시간 동기화 완료! (${syncRes.totalHouseholdsChecked}가구 확인 ➔ '진행 중' 설문 대상 가구원 ${updatedQuotaDb.length}명 추출)`,
      totalHouseholdsChecked: syncRes.totalHouseholdsChecked,
      totalMembers: updatedQuotaDb.length,
      ageGroupBreakdown: syncRes.ageGroupBreakdown,
      quotaDatabase: updatedQuotaDb
    });
  } catch (err) {
    logger.error(`[성인문해능력조사 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quota/sync-globalri-literacy', async (req, res) => {
  try {
    const loginId = String(req.body?.loginId || '01071447791').trim();
    const loginPw = String(req.body?.loginPw || '2038020').trim();
    const lidFilter = String(req.body?.lidFilter || '').trim();
    const syncRes = await scrapeGlobalriLiteracyQuotas({
      loginId,
      loginPw,
      lidFilter
    });
    res.json({
      success: true,
      message: `제5차 성인문해능력조사 쿼터 동기화 완료 ('진행 중' 대상자 ${syncRes.totalMembers}명)`,
      ...syncRes
    });
  } catch (err) {
    logger.error(`[성인문해능력조사 쿼터 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// [1-4] 한국갤럽 2026년 귀농귀촌 실태조사(귀농) (20263603) 실시간 서버 상태 동기화 API
// ==========================================
app.post('/api/campaigns/:id/sync-gallup-status', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  try {
    const quotaDb = campaign.quotaDatabase || [];
    logger.info(`[귀농귀촌 실태조사 상태 동기화] 캠페인 "${campaign.title}" (${quotaDb.length}명) 한국갤럽 G-CAII 서버 실시간 조회 시작...`);

    const syncRes = await syncGallupReturnFarmStatuses({
      quotaDatabase: quotaDb,
      onProgress: (msg) => logger.info(msg)
    });

    CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: syncRes.updatedList
    });

    // 원본 쿼터 JSON/XLSX 파일 동기화
    const gallupJsonPath = path.join(quotasDir, 'quota_gallup_20263603_hongcheon.json');
    if (fs.existsSync(gallupJsonPath)) {
      try {
        const qJson = JSON.parse(fs.readFileSync(gallupJsonPath, 'utf-8'));
        qJson.data = syncRes.updatedList;
        qJson.updatedAt = new Date().toISOString();
        fs.writeFileSync(gallupJsonPath, JSON.stringify(qJson, null, 2), 'utf-8');
        exportBusinessesToExcel({
          data: syncRes.updatedList,
          columns: qJson.columns,
          filePath: gallupJsonPath.replace(/\.json$/, '.xlsx')
        });
      } catch (_) {}
    }

    logger.broadcast({
      type: 'QUOTA_UPDATED',
      campaignId: campaign.id,
      quotaDatabase: syncRes.updatedList
    });

    logger.success(`[귀농귀촌 실태조사 동기화 완료] 총 ${syncRes.updatedList.length}명 확인 (완료(99): ${syncRes.completedCount}명 / 진행·완료직전(01): ${syncRes.inProgressCount}명 / 대기: ${syncRes.readyCount}명)`);

    res.json({
      success: true,
      message: `한국갤럽(20263603) 실시간 동기화 완료! (조사완료 ${syncRes.completedCount}명 · 진행중/완료직전 ${syncRes.inProgressCount}명 · 미진행 ${syncRes.readyCount}명)`,
      completedCount: syncRes.completedCount,
      inProgressCount: syncRes.inProgressCount,
      readyCount: syncRes.readyCount,
      quotaDatabase: syncRes.updatedList
    });
  } catch (err) {
    logger.error(`[귀농귀촌 실태조사 동기화 오류] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
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
    ensureAssocCampaignQuotaFiles();
  }

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: '쿼터 파일을 찾을 수 없습니다.' });
  }

  try {
    const quotaMeta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const businesses = quotaMeta.data || [];
    const isAssoc = (quotaMeta.type === 'KSTAT_ASSOC' || quotaMeta.surveyType === 'kstat_assoc' || safeFilename.startsWith('quota_assoc_'));

    if (businesses.length === 0) {
      return res.status(400).json({ error: '쿼터 파일 내에 사업자 데이터가 없습니다.' });
    }

    // 쿼터 DB 변환
    const quotaDb = businesses.map((b, idx) => ({
      seq: idx + 1,
      index: idx + 1,
      slotIndex: idx + 1,
      ...b,
      quotaStatus: b.quotaStatus || (b.status === '완료' ? 'completed' : 'ready'),
      usedAt: b.usedAt || null
    }));

    const updated = CampaignStore.updateCampaign(campaign.id, {
      status: 'ready',
      quotaType: 'b2b',
      ...(isAssoc ? {
        surveyType: 'kstat_assoc',
        kstatLoginId: quotaMeta.surveyorId || businesses[0]?.surveyorAccount || campaign.kstatLoginId || '가온박정순',
        kstatLoginPw: quotaMeta.kstatLoginPw || campaign.kstatLoginPw || '1234',
        kstatListUrl: quotaMeta.kstatListUrl || campaign.kstatListUrl || 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi'
      } : {}),
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
    ensureAssocCampaignQuotaFiles();
  }

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: '쿼터 파일을 찾을 수 없습니다.' });
  }

  try {
    const quotaMeta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const businesses = quotaMeta.data || quotaMeta.rows || [];

    const campTitle = title || quotaMeta.title || `새 설문조사 (${path.basename(safeFilename, '.json')})`;

    const isMetrix = (quotaMeta.type === 'METRIX_PANEL');
    const isAssoc = (quotaMeta.type === 'KSTAT_ASSOC' || quotaMeta.surveyType === 'kstat_assoc' || safeFilename.startsWith('quota_assoc_'));
    const isKona = (quotaMeta.type === 'KONA_YOUTH' || quotaMeta.surveyType === 'kona_youth');
    const isHrcEnergy = (quotaMeta.type === 'HRC_ENERGY_BUILDING' || quotaMeta.surveyType === 'hrc_energy' || safeFilename.includes('hrc_energy'));
    const isGallupReturnFarm = (quotaMeta.type === 'GALLUP_RETURN_FARM' || quotaMeta.surveyType === 'gallup_return_farm' || safeFilename.includes('gallup_20263603'));
    const isGlobalriLiteracy = (quotaMeta.type === 'GLOBALRI_ADULT_LITERACY' || quotaMeta.surveyType === 'globalri_literacy' || safeFilename.includes('globalri_adult_literacy'));

    const newCamp = CampaignStore.createCampaign({
      title: campTitle,
      description: isGallupReturnFarm
        ? `한국갤럽 G-CAII(20263603) 2026년 귀농귀촌 실태조사(귀농) · 강원 홍천군 GPS 자동 주입 · 방문기록 검증 · 8종 필체 전자서명 · 완료 직전(Page 118) 안전 정지`
        : (isGlobalriLiteracy
          ? `글로벌리서치 통합조사시스템(GIFT) 제5차 성인문해능력조사 (${quotaMeta.surveyorName || ''})`
          : (isHrcEnergy
            ? `한국리서치 TAPI(2026-89-0342C) 건물 부문 에너지총조사 (조사원: ${quotaMeta.surveyorId || ''} ${quotaMeta.surveyorName || ''} · 기입력 항목 보존)`
            : (isKona
              ? '화성특례시 만족도 청소년 설문조사 (코나체인 리서치플랫폼)'
              : (isMetrix
                ? '메트릭스 경기도 소상공인 사업체패널 3차조사'
                : (isAssoc
                  ? `2026년 전통시장 및 상점가 조사 (상인회 전용 · 조사원: ${quotaMeta.surveyorId || businesses[0]?.surveyorAccount || ''})`
                  : (quotaMeta.marketName 
                    ? `${quotaMeta.marketName} 온누리상품권 가맹 소상공인 대상 설문조사`
                    : `${quotaMeta.keyword || '사업주'} 대상 설문조사`)))))),
      quotaType: (isKona || isGallupReturnFarm || isGlobalriLiteracy) ? 'b2c' : 'b2b',
      surveyType: isGallupReturnFarm ? 'gallup_return_farm' : (isGlobalriLiteracy ? 'globalri_literacy' : (isHrcEnergy ? 'hrc_energy' : (isKona ? 'kona_youth' : (isMetrix ? 'metrix_panel' : (isAssoc ? 'kstat_assoc' : 'kstat_store'))))),
      ...(isAssoc ? {
        kstatLoginId: quotaMeta.surveyorId || businesses[0]?.surveyorAccount || '가온박정순',
        kstatLoginPw: quotaMeta.kstatLoginPw || '1234',
        kstatListUrl: quotaMeta.kstatListUrl || 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi'
      } : {}),
      ...(isHrcEnergy ? {
        loginId: quotaMeta.surveyorId || '700275',
        loginPw: quotaMeta.surveyorId || '700275',
        surveyorName: quotaMeta.surveyorName || ''
      } : {}),
      ...(isGallupReturnFarm ? {
        loginId: quotaMeta.surveyorId || '076_000009',
        surveyorName: quotaMeta.surveyorName || '백영자',
        googleSheetUrl: quotaMeta.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1Hoai6ggQWxNVTW5SyxEsvpNtMOlBO1z_ThmM6cZ6gRg/edit?gid=1470110969#gid=1470110969'
      } : {})
    });

    const quotaDb = businesses.map((b, idx) => ({
      seq: idx + 1,
      index: idx + 1,
      slotIndex: idx + 1,
      ...b,
      quotaStatus: b.quotaStatus || (b.status === '완료' ? 'completed' : 'ready'),
      usedAt: null
    }));

    // 기존 캠페인 중 사용자가 커스텀 설정한 masterBaseline이 있으면 신규 캠페인에 자동 복제 장착
    let inheritedBaseline = null;
    const allCamps = CampaignStore.getAllCampaigns();
    const bestSource = isAssoc
      ? (allCamps.find(c => (c.surveyType === 'kstat_assoc' || String(c.title || '').includes('상인회')) && c.masterBaseline && c.masterBaseline.assocMode) ||
         allCamps.find(c => (c.surveyType === 'kstat_assoc' || String(c.title || '').includes('상인회')) && c.masterBaseline))
      : (allCamps.find(c => c.surveyType !== 'kstat_assoc' && c.masterBaseline && c.masterBaseline.groups) ||
         allCamps.find(c => c.surveyType !== 'kstat_assoc' && c.masterBaseline));
    if (bestSource && bestSource.masterBaseline) {
      inheritedBaseline = JSON.parse(JSON.stringify(bestSource.masterBaseline));
      if (inheritedBaseline.groups) {
        ['group1', 'group2', 'group3'].forEach(g => {
          if (inheritedBaseline.groups[g]) {
            if (inheritedBaseline.groups[g].employeeFamilyMin === 1 && inheritedBaseline.groups[g].employeeFamilyMax === 1) {
              inheritedBaseline.groups[g].employeeFamily = 0;
              inheritedBaseline.groups[g].employeeFamilyMin = 0;
              inheritedBaseline.groups[g].employeeFamilyMax = 0;
            }
          }
        });
      }
      logger.info(`[마스터 기준점 자동 계승] 기존 캠페인 "${bestSource.title}"의 기준점 설정을 신규 캠페인에 자동 복제 장착했습니다.`);
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

    const { slots = [], resetStatus = false } = req.body;
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: '매핑할 슬롯 데이터 목록이 없습니다.' });
    }

    const quotaDb = campaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      return res.status(400).json({ error: '캠페인에 등록된 쿼터 데이터가 없습니다.' });
    }

    const isAssoc = (campaign.surveyType === 'kstat_assoc');
    let mappedCount = 0;
    const usedSlotUrls = new Set();
    const usedRanIds = new Set();

    for (let idx = 0; idx < quotaDb.length; idx++) {
      const biz = quotaDb[idx];
      const rowNum = biz.index || biz.seq || idx + 1;
      let slot = slots.find(s => Number(s.index || s.seq) === Number(rowNum));
      if (!slot) {
        slot = slots[idx];
      }

      if (slot && slot.slotUrl !== undefined) {
        let rawUrl = String(slot.slotUrl || '').trim();
        if (!rawUrl) {
          // 사용자가 명시적으로 슬롯 URL을 비운 경우
          delete biz.slotUrl;
          delete biz.surveyUrl;
          delete biz.evalUrl;
          delete biz.ranId;
          delete biz.slotIndex;
          delete biz.slotExtra;
          continue;
        }

        // KID 코드만 단독 입력한 경우 정식 Kstat URL로 자동 변환
        if (!/^https?:\/\//i.test(rawUrl) && /^[A-Za-z0-9_-]{6,20}$/.test(rawUrl)) {
          rawUrl = isAssoc
            ? `https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=${rawUrl}&type=tapi&prid=2026070801&mnid=900001364&srt=1`
            : `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${rawUrl}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
        }

        const extractedRanId = slot.ranId || slot.ran_id || (rawUrl.match(/[?&]KID=([^&#\s]+)/i)?.[1] || null);
        if (usedSlotUrls.has(rawUrl) || (extractedRanId && usedRanIds.has(extractedRanId))) {
          return res.status(409).json({
            error: `[#${rowNum} ${biz.companyName || biz.marketName || '점포'}] 다른 점포와 중복된 슬롯 URL(KID: ${extractedRanId || rawUrl})이 감지되었습니다. 각 점포마다 고유한 슬롯을 매핑해 주세요.`
          });
        }

        const prevUrl = biz.slotUrl || '';
        usedSlotUrls.add(rawUrl);
        if (extractedRanId) usedRanIds.add(extractedRanId);

        biz.slotUrl = rawUrl;
        biz.surveyUrl = rawUrl;
        biz.slotIndex = slot.slotIndex || rowNum;
        biz.slotExtra = slot.slotExtra || slot.extraLabel || `(${rowNum - 1})추가`;
        biz.ranId = extractedRanId;
        if (extractedRanId) {
          biz.evalUrl = slot.evalUrl || (isAssoc
            ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${extractedRanId}&type=tapi&prid=2026070801&mnid=900001364&srt=2`
            : `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${extractedRanId}&type=tapi&prid=2026070802&mnid=900001346&srt=2`);
        }
        mappedCount++;

        if (resetStatus) {
          biz.quotaStatus = 'ready';
          biz.pilotAt = null;
          biz.completedAt = null;
          biz.usedAt = null;
          biz.capturedSteps = [];
        } else if (prevUrl !== rawUrl && biz.quotaStatus === 'error') {
          // 새 슬롯으로 교체된 오류 점포는 대기 상태로 자동 복구
          biz.quotaStatus = 'ready';
        }
      } else if (biz.slotUrl) {
        mappedCount++;
      }
    }

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
      const linkedQuotaFile = campaign.quotaConfig?.quotaFileName || campaign.quotaSourceFile || campaign.quotaFileName;
      const marketName = quotaDb[0]?.marketName;
      const matchedFile = quotaFiles.find(f => {
        if (linkedQuotaFile && f === linkedQuotaFile) return true;
        if (marketName && f.includes(marketName)) return true;
        return false;
      });

      if (matchedFile) {
        const fullJsonPath = path.join(quotasDir, matchedFile);
        const quotaJson = JSON.parse(fs.readFileSync(fullJsonPath, 'utf8'));
        const qList = quotaJson.data || quotaJson.merchants || [];
        qList.forEach((qm, qIdx) => {
          const matchedBiz = quotaDb.find(b => (b.bizNumber && b.bizNumber === qm.bizNumber) || ((b.index || b.seq) === (qm.seq || qm.index || qIdx + 1)));
          if (matchedBiz) {
            qm.slotUrl = matchedBiz.slotUrl || '';
            qm.surveyUrl = matchedBiz.surveyUrl || matchedBiz.slotUrl || '';
            qm.evalUrl = matchedBiz.evalUrl || '';
            qm.slotIndex = matchedBiz.slotIndex || null;
            qm.slotExtra = matchedBiz.slotExtra || '';
            qm.ranId = matchedBiz.ranId || null;
          }
        });
        fs.writeFileSync(fullJsonPath, JSON.stringify(quotaJson, null, 2), 'utf8');

        const xlsxPath = fullJsonPath.replace(/\.json$/, '.xlsx');
        if (qList.length > 0) {
          exportBusinessesToExcel({
            data: qList,
            columns: quotaJson.columns,
            filePath: xlsxPath
          });
        }
      }
    } catch (syncErr) {
      logger.warn('[슬롯 매핑 쿼터파일 동기화 주의]', syncErr.message);
    }

    logger.broadcast({
      type: 'QUOTA_UPDATED',
      quotaDatabase: updated.quotaDatabase
    });
    logger.success(`[슬롯 1:1 매핑 완료] 캠페인 "${campaign.title}": 총 ${quotaDb.length}개 중 ${mappedCount}개 슬롯 바인딩 완료!`);

    res.json({
      success: true,
      message: `총 ${quotaDb.length}개 쿼터 중 ${mappedCount}개 점포에 케이스탯 슬롯(본 설문 + 조사원 평가 URL)이 1:1 매칭되었습니다.${resetStatus ? ' (전체 상태가 대기로 초기화되었습니다)' : ' (기존 완료 점포 상태 유지)'}`,
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

  const isMetrixCampaign = (campaign.surveyType === 'metrix_panel');
  const isKonaCampaign = (campaign.surveyType === 'kona_youth');
  const isGlobalriLiteracyCampaign = (campaign.surveyType === 'globalri_literacy');
  const isGallupReturnFarmCampaign = (campaign.surveyType === 'gallup_return_farm');
  let targetBiz = quotaDb.find(b => Number(b.index || b.seq) === Number(quotaIndex)) || quotaDb[Math.max(0, quotaIndex - 1)];
  if ((isKonaCampaign || isGlobalriLiteracyCampaign || isGallupReturnFarmCampaign) && targetBiz && (targetBiz.quotaStatus === 'completed' || targetBiz.status === '완료')) {
    const firstReady = quotaDb.find(b => b.quotaStatus !== 'completed' && b.status !== '완료');
    if (firstReady) targetBiz = firstReady;
  }
  if (!targetBiz) {
    return res.status(400).json({ error: '실행 대상 쿼터를 찾을 수 없습니다.' });
  }

  // 1:1 슬롯 매핑 엄격 검증: slotUrl 또는 surveyUrl 없으면 차단
  const targetUrl = targetBiz.surveyUrl || targetBiz.slotUrl || targetBiz.householdUrl || (isGallupReturnFarmCampaign ? GALLUP_20263603_DEFAULT_URL : (isKonaCampaign ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : (isGlobalriLiteracyCampaign ? 'https://gift.globalri.it/login' : '')));
  if (!targetUrl) {
    return res.status(400).json({
      error: isMetrixCampaign
        ? `[${targetBiz.companyName}] 1번 쿼터에 메트릭스 설문 참여 URL(surveyUrl)이 존재하지 않습니다.`
        : `[${targetBiz.companyName}] 1번 쿼터에 케이스탯 전용 설문 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 먼저 완료해 주세요.`
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

  logger.info(`[파일럿 검증 시작] 캠페인 "${campaign.title}" ➔ 대상: "${targetBiz.companyName}" (${targetBiz.idx || targetBiz.bizNumber || ''}) (슬롯: ${targetBiz.slotIndex ? '#' + targetBiz.slotIndex : '단독'})`);
  targetBiz.quotaStatus = 'running';
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'running' });

  res.json({
    success: true,
    message: `"${targetBiz.companyName}" 파일럿 시뮬레이션이 시작되었습니다. (제출 직전 안전 정지)`,
    targetBiz
  });

  // 비동기 실행
  (async () => {
    try {
      const isAssoc = (campaign.surveyType === 'kstat_assoc');
      const isMetrix = (campaign.surveyType === 'metrix_panel');
      const isKona = (campaign.surveyType === 'kona_youth');
      const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
      const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
      const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
      let result;

      if (isGallupReturnFarm) {
        logger.info(`[귀농귀촌 실태조사 파일럿 실행] 러너 가동: "${targetBiz.respondentName || targetBiz.name || targetBiz.companyName}" (ID: ${targetBiz.id || targetBiz.uid}, ${targetBiz.eupMyeon || ''})`);
        const gallupPol = campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {};
        result = await runGallupReturnFarmSurvey({
          slotData: targetBiz,
          policy: gallupPol,
          quotaIndex: targetBiz.index || quotaIndex,
          pilotMode: true,
          safetyGuard: true,
          reportDir: path.join(reportsDir, campaign.id, `gallup_item_${targetBiz.index || quotaIndex}_${targetBiz.id || targetBiz.uid || ''}`),
          onProgress: (info) => {
            logger.info(`[귀농귀촌 실태조사 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else if (isGlobalriLiteracy) {
        logger.info(`[성인문해능력조사 파일럿 실행] 러너 가동: "${targetBiz.respondentName || targetBiz.companyName}" (LID: ${targetBiz.lid}, UID: ${targetBiz.memberUid || targetBiz.uid}, ${targetBiz.ageGroupLabel || ''})`);
        const globalriPol = campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {};
        result = await runGlobalriLiteracySurvey({
          slotData: targetBiz,
          policy: globalriPol,
          quotaIndex: targetBiz.index || quotaIndex,
          pilotMode: true,
          safetyGuard: true,
          reportDir: path.join(reportsDir, campaign.id, `globalri_item_${targetBiz.index || quotaIndex}_${targetBiz.memberUid || targetBiz.uid || ''}`),
          onProgress: (info) => {
            logger.info(`[성인문해능력조사 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else if (isHrcEnergy) {
        logger.info(`[에너지총조사 파일럿 실행] 건물 부문 전용 러너 가동: "${targetBiz.buildingName || targetBiz.companyName}" (UID: ${targetBiz.uid})`);
        const hrcPol = campaign.hrcEnergyPolicy || policy || {};
        result = await runHrcEnergySurvey({
          slotData: targetBiz,
          policy: hrcPol,
          loginId: targetBiz.surveyorId || campaign.loginId || '700275',
          loginPw: campaign.loginPw || targetBiz.surveyorId || campaign.loginId || '700275',
          quotaIndex: targetBiz.index || quotaIndex,
          pilotMode: true,
          safetyGuard: false,
          reportDir: path.join(reportsDir, campaign.id, `hrc_item_${targetBiz.index || quotaIndex}_${targetBiz.uid || ''}`),
          onProgress: (info) => {
            logger.info(`[에너지총조사 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else if (isKona) {
        logger.info(`[코나체인 파일럿 실행] 화성특례시 청소년 설문 러너 가동: "${targetBiz.companyName}" (IDX: ${targetBiz.idx})`);
        const konaPol = campaign.konaPolicy || policy || {};
        result = await runKonaSurvey({
          surveyUrl: targetUrl,
          slotData: targetBiz,
          policy: konaPol,
          quotaIndex: targetBiz.index || quotaIndex,
          pilotMode: true,
          safetyGuard: true,
          reportDir: path.join(reportsDir, campaign.id, `kona_item_${targetBiz.index || quotaIndex}_${targetBiz.idx || ''}`),
          onProgress: (info) => {
            logger.info(`[코나체인 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else if (isMetrix) {
        logger.info(`[메트릭스 파일럿 실행] 메트릭스 전용 러너 가동: "${targetBiz.companyName}" (UID: ${targetBiz.uid})`);
        const metrixPol = campaign.metrixPolicy || policy || {};
        result = await runMetrixSurvey({
          surveyUrl: targetUrl,
          slotData: targetBiz,
          policy: metrixPol,
          quotaIndex: targetBiz.index || quotaIndex,
          pilotMode: true,
          safetyGuard: true,
          reportDir: path.join(reportsDir, campaign.id, `metrix_item_${targetBiz.index || quotaIndex}_${targetBiz.uid || ''}`),
          onProgress: (info) => {
            logger.info(`[메트릭스 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else if (isAssoc) {
        logger.info(`[상인회 파일럿 실행] 상인회 전용 러너 가동: "${targetBiz.marketName || targetBiz.companyName}"`);
        const assocPol = campaign.assocPolicy || policy || {};
        result = await runKstatAssocSurvey({
          surveyUrl: targetUrl,
          assocData: targetBiz,
          quotaIndex: targetBiz.index || quotaIndex,
          policy: assocPol,
          surveyorAccount: targetBiz.surveyorAccount || campaign.kstatLoginId || '가온이강윤',
          preserveExistingInputs: (assocPol.preserveExistingInputs !== false),
          pilotMode: true,
          safetyGuard: true,
          reportDir: path.join(reportsDir, campaign.id, `assoc_item_${targetBiz.index || quotaIndex}`),
          onProgress: (info) => {
            logger.info(`[상인회 파일럿 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index,
              ...info
            });
          }
        });
      } else {
        result = await runKstatSurvey({
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
      }

      if (result.success) {
        if (isGallupReturnFarm) {
          targetBiz.quotaStatus = 'pilot_done';
          targetBiz.status = '완료직전 대기 (Page 118)';
          targetBiz.serverStatus = '01';
          targetBiz.lastVisitResult = '컨택성공';
          targetBiz.visitCount = Math.max(1, Number(targetBiz.visitCount || 1));
          targetBiz.progress = '99% (Page 118 완료직전)';
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.capturedSteps = result.capturedSteps;
          if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
            targetBiz.submittedAnswers = result.submittedAnswers;
          }
          logger.success(`🎉 [귀농귀촌 실태조사 완료직전 도달] "${targetBiz.respondentName || targetBiz.name}" (ID: ${targetBiz.id}) Page 118 임시저장 및 안전 대기 완료!`);
        } else if (isGlobalriLiteracy) {
          const isPartCDone = (result.status === 'part_c_completed');
          const isStoppedReview = (result.status === 'stopped_at_review');
          targetBiz.quotaStatus = (isPartCDone || isStoppedReview) ? 'pilot_done' : 'completed';
          targetBiz.status = isPartCDone ? 'Part C 완료 (수기대기)' : (isStoppedReview ? '검증대기(F05_2)' : '완료');
          targetBiz.memberStatus = targetBiz.status;
          targetBiz.progress = isPartCDone ? `Part C 완료 (채점 ${result.gradeSummary?.partC || '완료'})` : (isStoppedReview ? '98% (제출직전)' : '100%');
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.pilotCompletedAt = targetBiz.pilotAt;
          targetBiz.capturedSteps = result.capturedSteps;
          if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
            targetBiz.submittedAnswers = result.submittedAnswers;
          }
          if (result.gradeSummary) {
            targetBiz.gradeSummary = result.gradeSummary;
          }
          try {
            const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
            buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
          } catch (exErr) {
            logger.warn(`[성인문해능력조사 답변 엑셀 자동저장 경고] ${exErr.message}`);
          }
          logger.success(`🎉 [성인문해능력조사 Part C 완료] "${targetBiz.respondentName || targetBiz.companyName}" (${targetBiz.memberUid}) ${targetBiz.status} 달성 및 답변 엑셀 갱신 완료!`);
        } else if (isHrcEnergy) {
          targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
          targetBiz.status = (result.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
          targetBiz.progress = (result.status === 'stopped_at_review') ? '91%' : '100%';
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.capturedSteps = result.capturedSteps;
          logger.success(`🎉 [에너지총조사 파일럿 성공] "${targetBiz.buildingName || targetBiz.companyName}" (UID: ${targetBiz.uid}) ${targetBiz.status} 달성!`);
        } else if (isKona) {
          targetBiz.quotaStatus = (result.status === 'stopped_before_submit') ? 'pilot_done' : 'completed';
          targetBiz.status = (result.status === 'stopped_before_submit') ? '검증완료(제출직전)' : '완료';
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.capturedSteps = result.capturedSteps;
          logger.success(`🎉 [코나체인 파일럿 성공] "${targetBiz.companyName}" (IDX: ${targetBiz.idx}) 제출 직전 스크린샷 보존 및 검증 완료!`);
        } else if (isMetrix) {
          targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? '진행중(98%)' : 'pilot_done';
          targetBiz.status = (result.status === 'stopped_at_review') ? '진행중(98%)' : '완료';
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.capturedSteps = result.capturedSteps;
          logger.success(`🎉 [메트릭스 파일럿 성공] "${targetBiz.companyName}" (UID: ${targetBiz.uid}) 메트릭스 설문 시뮬레이션 완료 (${targetBiz.quotaStatus})!`);
        } else {
          targetBiz.quotaStatus = 'pilot_done';
          targetBiz.pilotAt = new Date().toISOString();
          targetBiz.capturedSteps = result.capturedSteps;
        }

        // 조사원 평가항목 연계 실행 (점포조사 및 상인회조사 2단계 연계)
        if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && isAssoc) {
          const evalUrl = targetBiz.evalUrl || (targetBiz.ranId ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${targetBiz.ranId}&type=tapi&prid=2026070801&mnid=900001364&srt=2` : null);
          if (evalUrl) {
            logger.info(`[파일럿 2단계] "${targetBiz.marketName || targetBiz.companyName}" 상인회 조사원 평가 작성 자동 연계 시작...`);
            try {
              const evalResult = await runKstatAssocEvaluation({
                evalUrl,
                assocData: targetBiz,
                guidelineConfig: {
                  ...(campaign.guidelineConfig || {}),
                  assocPolicy: campaign.assocPolicy || campaign.guidelineConfig?.assocPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline
                },
                reportDir: path.join(reportsDir, campaign.id, `item_${targetBiz.index || quotaIndex}`),
                onProgress: (info) => {
                  logger.info(`[파일럿 평가] ${info.message}`);
                  logger.broadcast({
                    type: 'PILOT_PROGRESS',
                    campaignId: campaign.id,
                    quotaIndex: targetBiz.index,
                    ...info
                  });
                }
              });
              if (evalResult.success) {
                targetBiz.evalStatus = 'completed';
                targetBiz.evalResults = evalResult.evalResults;
                logger.success(`🎉 [파일럿 2단계 완료] "${targetBiz.marketName || targetBiz.companyName}" 본 설문 + 조사원 평가 100% 동시 완료!`);
                await syncKstatSlotStatus({
                  pridSel: '2026070801',
                  idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
                  kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
                  gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
                  srt: 2
                }).catch(() => {});
              }
            } catch (evalErr) {
              logger.warn(`[파일럿 평가 경고] 상인회 조사원 평가 연계 중 예외: ${evalErr.message}`);
            }
          }
        } else if (!isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
          const evalUrl = targetBiz.evalUrl || (targetBiz.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${targetBiz.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null);
          if (evalUrl) {
            logger.info(`[파일럿 2단계] "${targetBiz.companyName}" 조사원 평가항목 작성 자동 연계 시작...`);
            try {
              const evalResult = await runKstatEvaluation({
                evalUrl,
                bizData: targetBiz,
                guidelineConfig: {
                  ...(campaign.guidelineConfig || {}),
                  masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
                },
                reportDir: path.join(reportsDir, campaign.id, `item_${targetBiz.index || quotaIndex}`),
                onProgress: (info) => {
                  logger.info(`[파일럿 평가] ${info.message}`);
                  logger.broadcast({
                    type: 'PILOT_PROGRESS',
                    campaignId: campaign.id,
                    quotaIndex: targetBiz.index,
                    ...info
                  });
                }
              });
              if (evalResult.success) {
                targetBiz.evalStatus = 'completed';
                targetBiz.evalResults = evalResult.evalResults;
                logger.success(`🎉 [파일럿 2단계 완료] "${targetBiz.companyName}" 조사원 평가 작성 100% 완료!`);
                await syncKstatSlotStatus({
                  pridSel: '2026070802',
                  idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
                  kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
                  gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
                  srt: 2
                }).catch(() => {});
              }
            } catch (evalErr) {
              logger.warn(`[파일럿 평가 경고] 조사원 평가 연계 중 예외: ${evalErr.message}`);
            }
          }
        }

        // 본설문 상태 동기화 (Kstat list.php 캐시 갱신)
        if (!isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
          const targetPridSel = isAssoc ? '2026070801' : (campaign.targetPrid || '2026070802');
          await syncKstatSlotStatus({
            pridSel: targetPridSel,
            idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
            kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
            gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
            srt: 1
          }).catch(() => {});

          if (targetBiz.evalStatus === 'completed') {
            const effLoginId = targetBiz.surveyorAccount || campaign.kstatLoginId || (isAssoc ? '가온박정순' : '가온김영옥');
            const effLoginPw = campaign.kstatLoginPw || '1234';
            const progRes = await saveKstatSlotProgressStatus({
              pridSel: targetPridSel,
              idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
              kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
              gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
              ranId: targetBiz.ranId || targetBiz.ran_id,
              loginId: effLoginId,
              loginPw: effLoginPw
            }).catch(() => ({ success: false }));
            if (progRes?.success) {
              targetBiz.kstatProgressSaved = true;
            }
          }
        }

        CampaignStore.updateCampaign(campaign.id, {
          quotaDatabase: quotaDb,
          status: 'ready'
        });
        logger.success(`🎉 [파일럿 검증 완료] "${targetBiz.companyName}" 1건 시뮬레이션이 무결점 완료되었습니다!`);
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
  if (currentTask.isRunning) {
    logger.warn('[배치 가동 차단] 이미 다른 설문 배치 또는 파일럿 작업이 가동 중입니다.');
    return res.status(409).json({ error: '이미 다른 설문 작업이 가동 중입니다. 진행 중인 작업이 완료되거나 [배치 일시 정지] 후 다시 실행해 주세요.' });
  }

  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { surveyUrl, policy = {}, startIndex = 1, safetyGuard = false, targetIndices = null } = req.body;
  const selectedIndexSet = (Array.isArray(targetIndices) && targetIndices.length > 0)
    ? new Set(targetIndices.map(n => Number(n)).filter(n => !isNaN(n)))
    : null;
  const defaultUrl = surveyUrl || campaign.guidelineConfig?.surveyUrl;
  const quotaDb = campaign.quotaDatabase || [];
  const isAssoc = (campaign.surveyType === 'kstat_assoc');
  const isMetrix = (campaign.surveyType === 'metrix_panel');
  const isKona = (campaign.surveyType === 'kona_youth');
  const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
  const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
  const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
  const effectivePolicy = isGallupReturnFarm
    ? (campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
    : (isGlobalriLiteracy
      ? (campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
      : (isHrcEnergy
        ? (campaign.hrcEnergyPolicy || policy || {})
        : (isKona
          ? (campaign.konaPolicy || policy || {})
          : (isMetrix ? (campaign.metrixPolicy || policy || {}) : (isAssoc ? (campaign.assocPolicy || policy || {}) : policy)))));

  const skipCompletedSlots = (effectivePolicy.skipCompletedSlots !== false);
  const skipSlotIndices = (effectivePolicy.skipSlotIndices || '')
    .toString()
    .split(/[\s,]+/)
    .map(x => parseInt(x, 10))
    .filter(x => !isNaN(x));

  const skipSlotUids = (effectivePolicy.skipSlotUids || '')
    .toString()
    .split(/[\s,]+/)
    .map(x => x.trim())
    .filter(Boolean);

  const targets = quotaDb.filter(b => {
    const idx = Number(b.index || b.seq || b.slotIndex || 1);
    if (selectedIndexSet) {
      if (!selectedIndexSet.has(idx)) return false;
      if (b.quotaStatus === 'completed' || b.status === '완료' || b.memberStatus === '완료') return false;
      return true;
    }
    if (idx < startIndex) return false;
    if (skipSlotIndices.includes(idx)) return false;
    if ((isMetrix || isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) && (b.uid || b.memberUid || b.idx || b.id) && skipSlotUids.includes(String(b.memberUid || b.uid || b.idx || b.id))) return false;
    if (isHrcEnergy && effectivePolicy.onlySelectedByDefault !== false && b.selectionType && b.selectionType !== '선정') {
      return false; // 에너지총조사는 기본적으로 '선정' 쿼터만 실행 (오류 시 '대체' 자동 승계)
    }
    if (b.quotaStatus === 'completed' || b.status === '완료' || b.memberStatus === '완료' || b.substitutedByUid) return false;
    if (isGallupReturnFarm && b.quotaStatus === 'pilot_done') return false;
    if (skipCompletedSlots && (b.surveyCompleted === '완료' || b.surveyCompleted === true || b.status === '완료')) {
      return false;
    }
    if (isMetrix) {
      if (safetyGuard && (b.quotaStatus === '진행중(98%)' || b.status === '진행중(98%)')) {
        return false;
      }
    } else {
      if (safetyGuard && b.quotaStatus === 'pilot_done') return false;
    }
    return true;
  });
  if (targets.length === 0) {
    return res.status(400).json({ error: '연속 실행할 잔여 쿼터가 없습니다. (이미 완료되었거나 안전 대기 상태임)' });
  }

  // 1:1 슬롯 매핑 엄격 검증
  const unmapped = (isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) ? [] : targets.filter(b => !b.slotUrl && !b.surveyUrl);
  if (unmapped.length > 0) {
    return res.status(400).json({
      error: isMetrix
        ? `실행 대상 패널 ${targets.length}건 중 ${unmapped.length}건에 설문 URL(surveyUrl)이 누락되었습니다.`
        : `실행 대상 쿼터 ${targets.length}건 중 ${unmapped.length}건에 케이스탯 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 통해 모든 쿼터에 슬롯을 매칭한 후 가동해 주세요.`
    });
  }

  logger.info(`[배치 자동화 가동] 캠페인 "${campaign.title}" 대상 ${targets.length}건 연속 실행 시작 (안전가드: ${safetyGuard ? 'ON' : 'OFF'}, 기입력보존: ${effectivePolicy.preserveExistingInputs !== false ? 'ON' : 'OFF'})`);
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
        const bizUrl = biz.slotUrl || biz.surveyUrl || (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${biz.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : '')));
        if (!bizUrl) {
          logger.error(`[배치 ${i + 1}/${targets.length}] "${biz.companyName}"에 할당된 설문 URL이 없습니다.`);
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
        logger.info(`[배치 진행 ${i + 1}/${targets.length}] "${biz.buildingName || biz.marketName || biz.companyName}" (${biz.uid || biz.idx || biz.bizNumber || biz.regCode || ''})${slotInfo} 설문 자동화 시작...`);

        let result;
        try {
          if (isGallupReturnFarm) {
            result = await runGallupReturnFarmSurvey({
              slotData: biz,
              policy: effectivePolicy,
              quotaIndex: biz.index || (i + startIndex),
              pilotMode: false,
              safetyGuard: true,
              reportDir: path.join(reportsDir, campaign.id, `gallup_item_${biz.index || (i + startIndex)}_${biz.id || biz.uid || ''}`),
              onProgress: (info) => {
                logger.info(`[귀농귀촌 실태조사 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
          } else if (isGlobalriLiteracy) {
            result = await runGlobalriLiteracySurvey({
              slotData: biz,
              policy: effectivePolicy,
              quotaIndex: biz.index || (i + startIndex),
              pilotMode: false,
              safetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `globalri_item_${biz.index || (i + startIndex)}_${biz.memberUid || biz.uid || ''}`),
              onProgress: (info) => {
                logger.info(`[성인문해능력조사 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
          } else if (isHrcEnergy) {
            result = await runHrcEnergySurvey({
              slotData: biz,
              policy: effectivePolicy,
              loginId: biz.surveyorId || campaign.loginId || '700275',
              loginPw: campaign.loginPw || biz.surveyorId || campaign.loginId || '700275',
              quotaIndex: biz.index || (i + startIndex),
              pilotMode: false,
              safetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `hrc_item_${biz.index || (i + startIndex)}_${biz.uid || ''}`),
              onProgress: (info) => {
                logger.info(`[에너지총조사 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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

            // [선정 ➔ 대체 자동 승계 로직]
            if (!result?.success && effectivePolicy.autoFallbackToSub !== false && biz.selectionType === '선정' && biz.cellKey) {
              const subCandidates = quotaDb
                .filter(s => s.selectionType === '대체' && s.cellKey === biz.cellKey && s.quotaStatus !== 'completed' && s.status !== '완료' && s.quotaStatus !== 'error')
                .sort((a, b) => (a.cellPriority || 99) - (b.cellPriority || 99));

              for (const sub of subCandidates) {
                logger.warn(`🔄 [선정➔대체 자동 승계] UID ${biz.uid} 오류 발생 ➔ 동일 표본층(${biz.cellKey}) 대체 후보 UID ${sub.uid} (${sub.buildingName || sub.roadAddress})로 자동 전환!`);
                if (!sub.contactName && biz.contactName) sub.contactName = biz.contactName;
                if (!sub.phone && biz.phone) sub.phone = biz.phone;
                sub.quotaStatus = 'running';
                CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });

                const subRes = await runHrcEnergySurvey({
                  slotData: sub,
                  policy: effectivePolicy,
                  loginId: sub.surveyorId || campaign.loginId || '700275',
                  loginPw: campaign.loginPw || sub.surveyorId || campaign.loginId || '700275',
                  quotaIndex: sub.index,
                  pilotMode: false,
                  safetyGuard,
                  reportDir: path.join(reportsDir, campaign.id, `hrc_item_${sub.index}_${sub.uid || ''}`),
                  onProgress: (info) => {
                    logger.broadcast({
                      type: 'BATCH_PROGRESS',
                      campaignId: campaign.id,
                      quotaIndex: sub.index,
                      itemNumber: i + 1,
                      totalItems: targets.length,
                      ...info
                    });
                  }
                }).catch(e => ({ success: false, error: e.message }));

                if (subRes?.success) {
                  sub.quotaStatus = (subRes.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
                  sub.status = (subRes.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
                  sub.progress = (subRes.status === 'stopped_at_review') ? '91%' : '100%';
                  sub.completedAt = new Date().toISOString();
                  sub.capturedSteps = subRes.capturedSteps;
                  biz.substitutedByUid = sub.uid;
                  biz.status = `대체완료(${sub.uid})`;
                  result = subRes;
                  break;
                } else {
                  sub.quotaStatus = 'error';
                  sub.error = subRes?.error || '대체 실행 실패';
                }
              }
            }
          } else if (isKona) {
            result = await runKonaSurvey({
              surveyUrl: bizUrl,
              slotData: biz,
              policy: effectivePolicy,
              quotaIndex: biz.index || (i + startIndex),
              pilotMode: false,
              safetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `kona_item_${biz.index || (i + startIndex)}_${biz.idx || ''}`),
              onProgress: (info) => {
                logger.info(`[코나체인 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
          } else if (isMetrix) {
            result = await runMetrixSurvey({
              surveyUrl: bizUrl,
              slotData: biz,
              policy: effectivePolicy,
              quotaIndex: biz.index || (i + startIndex),
              pilotMode: false,
              safetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `metrix_item_${biz.index || (i + startIndex)}_${biz.uid || ''}`),
              onProgress: (info) => {
                logger.info(`[메트릭스 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
          } else if (isAssoc) {
            result = await runKstatAssocSurvey({
              surveyUrl: bizUrl,
              assocData: biz,
              quotaIndex: biz.index || (i + startIndex),
              policy: effectivePolicy,
              surveyorAccount: biz.surveyorAccount || campaign.kstatLoginId || '가온이강윤',
              preserveExistingInputs: (effectivePolicy.preserveExistingInputs !== false),
              pilotMode: safetyGuard,
              safetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `assoc_item_${biz.index || (i + startIndex)}`),
              onProgress: (info) => {
                logger.info(`[상인회 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
          } else {
            result = await runKstatSurvey({
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
          }
        } catch (itemErr) {
          result = { success: false, error: itemErr.message };
        }

        if (result?.success) {
          if (isGallupReturnFarm) {
            biz.quotaStatus = 'pilot_done';
            biz.status = '완료직전 대기 (Page 118)';
            biz.serverStatus = '01';
            biz.lastVisitResult = '컨택성공';
            biz.visitCount = Math.max(1, Number(biz.visitCount || 1));
            biz.progress = '99% (Page 118 완료직전)';
            biz.surveyCompleted = '대기';
            biz.completedAt = new Date().toISOString();
            biz.capturedSteps = result.capturedSteps;
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              biz.submittedAnswers = result.submittedAnswers;
            }
            logger.success(`🎉 [귀농귀촌 실태조사 배치 ${i + 1}/${targets.length} 완료] "${biz.respondentName || biz.name}" (ID: ${biz.id}) Page 118 완료직전 대기 달성!`);
          } else if (isGlobalriLiteracy) {
            const isPartCDone = (result.status === 'part_c_completed');
            const isStoppedReview = (result.status === 'stopped_at_review' || safetyGuard);
            biz.quotaStatus = (isPartCDone || isStoppedReview) ? 'pilot_done' : 'completed';
            biz.status = isPartCDone ? 'Part C 완료 (수기대기)' : (isStoppedReview ? '검증대기(F05_2)' : '완료');
            biz.memberStatus = biz.status;
            biz.progress = isPartCDone ? `Part C 완료 (채점 ${result.gradeSummary?.partC || '완료'})` : (isStoppedReview ? '98% (제출직전)' : '100%');
            biz.surveyCompleted = (biz.quotaStatus === 'completed') ? '완료' : '대기';
            biz.completedAt = new Date().toISOString();
            biz.pilotCompletedAt = biz.completedAt;
            biz.capturedSteps = result.capturedSteps;
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              biz.submittedAnswers = result.submittedAnswers;
            }
            if (result.gradeSummary) {
              biz.gradeSummary = result.gradeSummary;
            }
            try {
              const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
              buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
            } catch (exErr) {
              logger.warn(`[성인문해능력조사 답변 엑셀 자동저장 경고] ${exErr.message}`);
            }
            logger.success(`🎉 [성인문해능력조사 배치 ${i + 1}/${targets.length} 완료] "${biz.respondentName || biz.companyName}" (UID: ${biz.memberUid || biz.uid}) ${biz.status} 달성!`);
          } else if (isHrcEnergy) {
            if (!biz.substitutedByUid) {
              biz.quotaStatus = (result.status === 'stopped_at_review' || safetyGuard) ? 'pilot_done' : 'completed';
              biz.status = (result.status === 'stopped_at_review' || safetyGuard) ? '검증대기(91%)' : '완료';
              biz.progress = (result.status === 'stopped_at_review' || safetyGuard) ? '91%' : '100%';
              biz.surveyCompleted = (biz.quotaStatus === 'completed') ? '완료' : '대기';
              biz.completedAt = new Date().toISOString();
              biz.capturedSteps = result.capturedSteps;
            }
            logger.success(`🎉 [에너지총조사 배치 ${i + 1}/${targets.length} 완료] "${biz.buildingName || biz.companyName}" (UID: ${biz.uid}) ${biz.status} 달성!`);
          } else if (isKona) {
            biz.quotaStatus = (result.status === 'stopped_before_submit' || safetyGuard) ? 'pilot_done' : 'completed';
            biz.status = (result.status === 'stopped_before_submit' || safetyGuard) ? '검증완료(제출직전)' : '완료';
            biz.surveyCompleted = (biz.quotaStatus === 'completed') ? '완료' : '대기';
            biz.completedAt = new Date().toISOString();
            biz.capturedSteps = result.capturedSteps;
            logger.success(`🎉 [코나체인 배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" (IDX: ${biz.idx}) ${biz.status} 달성!`);
          } else if (isMetrix) {
            biz.quotaStatus = (result.status === 'stopped_at_review') ? '진행중(98%)' : (safetyGuard ? '진행중(98%)' : 'completed');
            biz.status = (result.status === 'stopped_at_review') ? '진행중(98%)' : (safetyGuard ? '진행중(98%)' : '완료');
            biz.completedAt = new Date().toISOString();
            biz.capturedSteps = result.capturedSteps;
            logger.success(`🎉 [메트릭스 배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" (UID: ${biz.uid}) ${biz.quotaStatus} 달성!`);
          } else {
            biz.quotaStatus = safetyGuard ? 'pilot_done' : 'completed';
            biz.completedAt = new Date().toISOString();
            biz.capturedSteps = result.capturedSteps;
          }

          // 2단계: 조사원 평가항목 작성 자동 연계 (점포조사 및 상인회조사 전수 지원)
          if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && isAssoc) {
            const evalUrl = biz.evalUrl || (biz.ranId ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${biz.ranId}&type=tapi&prid=2026070801&mnid=900001364&srt=2` : null);
            if (evalUrl) {
              logger.info(`[배치 #${biz.index || (i + startIndex)} 2단계] "${biz.marketName || biz.companyName}" 상인회 조사원 평가 연계 시작...`);
              try {
                const evalResult = await runKstatAssocEvaluation({
                  evalUrl,
                  assocData: biz,
                  guidelineConfig: {
                    ...campaign.guidelineConfig,
                    assocPolicy: campaign.assocPolicy || campaign.guidelineConfig?.assocPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline
                  },
                  reportDir: path.join(reportsDir, campaign.id, `item_${biz.index || (i + startIndex)}`),
                  onProgress: (info) => {
                    logger.info(`[배치 #${biz.index || (i + startIndex)}] [평가] ${info.message}`);
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
                if (evalResult?.success) {
                  biz.evalStatus = 'completed';
                  biz.evalResults = evalResult.evalResults;
                  logger.success(`🎉 [배치 #${biz.index || (i + startIndex)} 완료] "${biz.marketName || biz.companyName}" 본 설문 + 조사원 평가 100% 동시 완료!`);
                  await syncKstatSlotStatus({
                    pridSel: '2026070801',
                    idSel: biz.idSel || biz.kstatMeta?.idSel,
                    kid: biz.kid || biz.kstatMeta?.kid,
                    gid: biz.gid || biz.kstatMeta?.gid || '0',
                    srt: 2
                  }).catch(() => {});
                }
              } catch (evalErr) {
                logger.warn(`[배치 평가 경고] "${biz.marketName || biz.companyName}" 상인회 조사원 평가 연계 중 예외: ${evalErr.message}`);
              }
            } else {
              logger.success(`[상인회 배치 ${i + 1}/${targets.length} 완료] "${biz.marketName || biz.companyName}" 본 설문 완료!`);
            }
          } else if (!isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
            const evalUrl = biz.evalUrl || (biz.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${biz.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null);
            if (evalUrl) {
              logger.info(`[배치 #${biz.index || (i + startIndex)} 2단계] "${biz.companyName}" 조사원 평가 작성 연계 시작...`);
              try {
                const evalResult = await runKstatEvaluation({
                  evalUrl,
                  bizData: biz,
                  guidelineConfig: {
                    ...campaign.guidelineConfig,
                    masterBaseline: campaign.masterBaseline
                  },
                  reportDir: path.join(reportsDir, campaign.id, `item_${biz.index || (i + startIndex)}`),
                  onProgress: (info) => {
                    logger.info(`[배치 #${biz.index || (i + startIndex)}] [평가] ${info.message}`);
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
                if (evalResult?.success) {
                  biz.evalStatus = 'completed';
                  biz.evalResults = evalResult.evalResults;
                  logger.success(`🎉 [배치 #${biz.index || (i + startIndex)} 완료] "${biz.companyName}" 본 설문 + 조사원 평가 100% 동시 완료!`);
                  await syncKstatSlotStatus({
                    pridSel: '2026070802',
                    idSel: biz.idSel || biz.kstatMeta?.idSel,
                    kid: biz.kid || biz.kstatMeta?.kid,
                    gid: biz.gid || biz.kstatMeta?.gid || '0',
                    srt: 2
                  }).catch(() => {});
                }
              } catch (evalErr) {
                logger.warn(`[배치 평가 경고] "${biz.companyName}" 조사원 평가 연계 중 예외: ${evalErr.message}`);
              }
            } else {
              logger.success(`[배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" 본 설문 완료!`);
            }
          }

          // 본설문 상태 동기화 (Kstat list.php 캐시 갱신)
          if (!isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
            const batchPridSel = isAssoc ? '2026070801' : (campaign.targetPrid || '2026070802');
            await syncKstatSlotStatus({
              pridSel: batchPridSel,
              idSel: biz.idSel || biz.kstatMeta?.idSel,
              kid: biz.kid || biz.kstatMeta?.kid,
              gid: biz.gid || biz.kstatMeta?.gid || '0',
              srt: 1
            }).catch(() => {});

            if (biz.evalStatus === 'completed') {
              const effLoginId = biz.surveyorAccount || campaign.kstatLoginId || (isAssoc ? '가온박정순' : '가온김영옥');
              const effLoginPw = campaign.kstatLoginPw || '1234';
              const progRes = await saveKstatSlotProgressStatus({
                pridSel: batchPridSel,
                idSel: biz.idSel || biz.kstatMeta?.idSel,
                kid: biz.kid || biz.kstatMeta?.kid,
                gid: biz.gid || biz.kstatMeta?.gid || '0',
                ranId: biz.ranId || biz.ran_id,
                loginId: effLoginId,
                loginPw: effLoginPw
              }).catch(() => ({ success: false }));
              if (progRes?.success) {
                biz.kstatProgressSaved = true;
              }
            }
          }
        } else {
          biz.quotaStatus = 'error';
          biz.error = result?.error || '설문 실행 오류';
          logger.error(`[배치 ${i + 1}/${targets.length} 실패] "${biz.buildingName || biz.marketName || biz.companyName}": ${result?.error || '설문 실행 오류'}`);
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

  const { quotaIndex, safetyGuard = true } = req.body;
  const quotaDb = campaign.quotaDatabase || [];
  const targetBiz = quotaDb.find(b => (b.index || b.seq) === quotaIndex);

  if (!targetBiz) {
    return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
  }

  const isKona = (campaign.surveyType === 'kona_youth');
  const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
  const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
  const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
  const targetUrl = targetBiz.slotUrl || targetBiz.surveyUrl || targetBiz.householdUrl || (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${targetBiz.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : '')));
  if (!targetUrl) {
    return res.status(400).json({
      error: `[${targetBiz.companyName}] 쿼터에 설문 URL이 매핑되지 않았습니다.`
    });
  }

  targetBiz.quotaStatus = 'running';
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });

  const slotNotice = targetBiz.slotIndex ? ` [Kstat 슬롯 #${targetBiz.slotIndex} ${targetBiz.slotExtra || ''}]` : '';
  logger.info(`[개별 쿼터 테스트] "${targetBiz.respondentName || targetBiz.buildingName || targetBiz.companyName}" (순번: #${targetBiz.index || quotaIndex})${slotNotice} 1건 실행 시작...`);

  res.json({
    success: true,
    message: `"${targetBiz.respondentName || targetBiz.buildingName || targetBiz.companyName}" 1건 실행이 시작되었습니다.`,
    targetBiz
  });

  (async () => {
    try {
      const result = isGallupReturnFarm
        ? await runGallupReturnFarmSurvey({
            slotData: targetBiz,
            policy: campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || {},
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: true,
            safetyGuard: true,
            reportDir: path.join(reportsDir, campaign.id, `gallup_item_${targetBiz.index || quotaIndex}_${targetBiz.id || targetBiz.uid || ''}`),
            onProgress: (info) => {
              logger.broadcast({
                type: 'PILOT_PROGRESS',
                campaignId: campaign.id,
                quotaIndex: targetBiz.index,
                ...info
              });
            }
          })
        : (isGlobalriLiteracy
          ? await runGlobalriLiteracySurvey({
            slotData: targetBiz,
            policy: campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || {},
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: safetyGuard,
            safetyGuard,
            reportDir: path.join(reportsDir, campaign.id, `globalri_item_${targetBiz.index || quotaIndex}_${targetBiz.memberUid || targetBiz.uid || ''}`),
            onProgress: (info) => {
              logger.broadcast({
                type: 'PILOT_PROGRESS',
                campaignId: campaign.id,
                quotaIndex: targetBiz.index,
                ...info
              });
            }
          })
        : (isHrcEnergy
          ? await runHrcEnergySurvey({
              slotData: targetBiz,
              policy: campaign.hrcEnergyPolicy || {},
              loginId: targetBiz.surveyorId || campaign.loginId || '700275',
              loginPw: campaign.loginPw || targetBiz.surveyorId || campaign.loginId || '700275',
              quotaIndex: targetBiz.index || quotaIndex,
              pilotMode: false,
              safetyGuard: false,
              reportDir: path.join(reportsDir, campaign.id, `hrc_item_${targetBiz.index || quotaIndex}_${targetBiz.uid || ''}`),
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: targetBiz.index,
                  ...info
                });
              }
            })
          : (isKona
            ? await runKonaSurvey({
                surveyUrl: targetUrl,
                slotData: targetBiz,
                policy: campaign.konaPolicy || {},
                quotaIndex: targetBiz.index || quotaIndex,
                pilotMode: safetyGuard,
                safetyGuard,
                reportDir: path.join(reportsDir, campaign.id, `kona_item_${targetBiz.index || quotaIndex}_${targetBiz.idx || ''}`),
                onProgress: (info) => {
                  logger.broadcast({
                    type: 'PILOT_PROGRESS',
                    campaignId: campaign.id,
                    quotaIndex: targetBiz.index,
                    ...info
                  });
                }
              })
            : await runKstatSurvey({
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
              }))));

      if (result?.success) {
        if (isGallupReturnFarm) {
          targetBiz.quotaStatus = 'pilot_done';
          targetBiz.status = '완료직전 대기 (Page 118)';
          targetBiz.serverStatus = '01';
          targetBiz.lastVisitResult = '컨택성공';
          targetBiz.visitCount = Math.max(1, Number(targetBiz.visitCount || 1));
          targetBiz.progress = '99% (Page 118 완료직전)';
          targetBiz.surveyCompleted = '대기';
          if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
            targetBiz.submittedAnswers = result.submittedAnswers;
          }
        } else if (isGlobalriLiteracy) {
          const isPartCDone = (result.status === 'part_c_completed');
          const isStoppedReview = (result.status === 'stopped_at_review');
          targetBiz.quotaStatus = (isPartCDone || isStoppedReview) ? 'pilot_done' : 'completed';
          targetBiz.status = isPartCDone ? 'Part C 완료 (수기대기)' : (isStoppedReview ? '검증대기(F05_2)' : '완료');
          targetBiz.memberStatus = targetBiz.status;
          targetBiz.progress = isPartCDone ? `Part C 완료 (채점 ${result.gradeSummary?.partC || '완료'})` : (isStoppedReview ? '98% (제출직전)' : '100%');
          targetBiz.surveyCompleted = (targetBiz.quotaStatus === 'completed') ? '완료' : '대기';
          if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
            targetBiz.submittedAnswers = result.submittedAnswers;
          }
          if (result.gradeSummary) {
            targetBiz.gradeSummary = result.gradeSummary;
          }
          try {
            const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
            buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
          } catch (exErr) {
            logger.warn(`[성인문해능력조사 답변 엑셀 자동저장 경고] ${exErr.message}`);
          }
        } else if (isHrcEnergy) {
          targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
          targetBiz.status = (result.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
          targetBiz.progress = (result.status === 'stopped_at_review') ? '91%' : '100%';
          targetBiz.surveyCompleted = (targetBiz.quotaStatus === 'completed') ? '완료' : '대기';
        } else {
          targetBiz.quotaStatus = (isKona && !safetyGuard) ? 'completed' : 'pilot_done';
          if (isKona) {
            targetBiz.status = (!safetyGuard) ? '완료' : '검증완료(제출직전)';
            targetBiz.surveyCompleted = (!safetyGuard) ? '완료' : '대기';
          }
        }
        targetBiz.pilotAt = new Date().toISOString();
        targetBiz.capturedSteps = result.capturedSteps;
        logger.success(`[개별 쿼터 테스트 성공] "${targetBiz.respondentName || targetBiz.buildingName || targetBiz.marketName || targetBiz.companyName}" 완주 완료!`);

        const evalUrl = (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) ? (targetBiz.evalUrl || (targetBiz.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${targetBiz.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null)) : null;
        if (evalUrl) {
          try {
            const evalResult = await runKstatEvaluation({
              evalUrl,
              bizData: targetBiz,
              guidelineConfig: {
                ...(campaign.guidelineConfig || {}),
                masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
              },
              reportDir: path.join(reportsDir, campaign.id, `item_${targetBiz.index || quotaIndex}`)
            });
            if (evalResult?.success) {
              targetBiz.evalStatus = 'completed';
              targetBiz.evalResults = evalResult.evalResults;
              await syncKstatSlotStatus({
                pridSel: '2026070802',
                idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
                kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
                gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
                srt: 2
              }).catch(() => {});
            }
          } catch (evalErr) {
            logger.warn(`[개별 쿼터 평가 경고] ${evalErr.message}`);
          }
        }

        if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
          await syncKstatSlotStatus({
            pridSel: '2026070802',
            idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
            kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
            gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
            srt: 1
          }).catch(() => {});
        }

        if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && targetBiz.evalStatus === 'completed') {
          const effLoginId = targetBiz.surveyorAccount || campaign.kstatLoginId || '가온김영옥';
          const effLoginPw = campaign.kstatLoginPw || '1234';
          const progRes = await saveKstatSlotProgressStatus({
            pridSel: '2026070802',
            idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
            kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
            gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
            ranId: targetBiz.ranId || targetBiz.ran_id,
            loginId: effLoginId,
            loginPw: effLoginPw
          }).catch(() => ({ success: false }));
          if (progRes?.success) {
            targetBiz.kstatProgressSaved = true;
          }
        }
      } else {
        targetBiz.quotaStatus = 'error';
        targetBiz.error = result?.error || '테스트 오류';
        logger.error(`[개별 쿼터 테스트 실패] "${targetBiz.marketName || targetBiz.companyName}": ${result?.error || '테스트 오류'}`);
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
// [3-3b] 성인문해능력조사 응답자별 제출 문항·답변 내역 Excel(.xlsx) 다운로드 API
// ==========================================
app.get('/api/campaigns/:id/export-answers-xlsx', (req, res) => {
  try {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    const quotaDb = campaign.quotaDatabase || [];
    const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
    const buffer = buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
    const downloadName = encodeURIComponent(`제5차_성인문해능력조사_제출문항답변내역_${campaign.surveyorName || '노영미7791'}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
    res.send(buffer);
  } catch (err) {
    logger.error('[문항답변 엑셀 내보내기 실패]', err);
    res.status(500).json({ error: '문항답변 엑셀 생성 실패: ' + err.message });
  }
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
    maxOpenYear = 'all',
    resumeFileName = null
  } = req.body;

  const count = Math.max(parseInt(targetCount, 10) || 1, 1);
  const parsedMaxYear = (!maxOpenYear || maxOpenYear === 'all') ? null : (parseInt(maxOpenYear, 10) || null);

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
// 업로드용 표준 엑셀 양식(.xlsx) 다운로드 API
app.get('/api/quota/template', (req, res) => {
  try {
    const buffer = generateQuotaTemplateBuffer();
    const downloadName = encodeURIComponent('AutoSurvey_조사쿼터_표준양식.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: '양식 생성 실패: ' + err.message });
  }
});

// 사용자 Excel(.xlsx/.xls/.csv) 쿼터 파일 업로드 및 정식 쿼터 DB 등록 API
app.post('/api/quota/upload-excel', async (req, res) => {
  try {
    const {
      title = '',
      marketName = '',
      fileName = 'uploaded_quota.xlsx',
      fileBase64 = '',
      autoEnrich = true,
      campaignId = null
    } = req.body || {};

    if (!fileBase64) {
      return res.status(400).json({ error: '업로드할 엑셀 파일 데이터가 없습니다.' });
    }

    const base64Clean = String(fileBase64).replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    const inferredMarket = (marketName || '').trim() || path.basename(fileName, path.extname(fileName)).replace(/[^가-힣a-zA-Z0-9_\-\s]/g, '').trim() || '업로드시장';
    const parsedData = parseExcelQuotaBuffer(buffer, {
      defaultMarketName: inferredMarket,
      autoEnrich: autoEnrich !== false
    });

    const finalMarketName = parsedData[0]?.marketName || inferredMarket;
    const finalTitle = (title || '').trim() || `2026_${finalMarketName}_업종별${parsedData.length}개_조사쿼터`;

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
      { key: 'marketName', label: '시장명' }
    ];

    const timestamp = Date.now();
    const cleanTitle = finalTitle.replace(/[^가-힣a-zA-Z0-9_\-]/g, '_');
    const filenameBase = `quota_onnuri_${cleanTitle}_${timestamp}`;
    const jsonFileName = `${filenameBase}.json`;
    const excelFileName = `${filenameBase}.xlsx`;
    const jsonFilePath = path.join(quotasDir, jsonFileName);
    const excelFilePath = path.join(quotasDir, excelFileName);

    const quotaMeta = {
      title: finalTitle,
      type: 'ONNURI_HYBRID',
      source: 'EXCEL_UPLOAD',
      marketName: finalMarketName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetTotal: parsedData.length,
      count: parsedData.length,
      mbzFailedCount: 0,
      isComplete: true,
      requestParams: {
        title: finalTitle,
        marketName: finalMarketName,
        targetCount: parsedData.length,
        samplingMode: 'excel_upload',
        autoEnrich: autoEnrich !== false
      },
      candidates: parsedData,
      columns,
      data: parsedData
    };

    fs.writeFileSync(jsonFilePath, JSON.stringify(quotaMeta, null, 2), 'utf-8');
    exportBusinessesToExcel({
      data: parsedData,
      columns,
      filePath: excelFilePath
    });

    let updatedCampaign = null;
    if (campaignId) {
      const targetCamp = CampaignStore.getCampaignById(campaignId);
      if (targetCamp) {
        const quotaDb = parsedData.map((row, i) => ({
          index: i + 1,
          seq: i + 1,
          ...row,
          quotaStatus: 'ready',
          surveyorAccount: targetCamp.kstatLoginId || '가온김영옥'
        }));
        updatedCampaign = CampaignStore.updateCampaign(campaignId, {
          quotaDatabase: quotaDb,
          quotaSourceFile: jsonFileName
        });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId,
          quotaDatabase: quotaDb
        });
      }
    }

    logger.success(`[Excel 쿼터 업로드 완료] "${finalTitle}" (${parsedData.length}개 사업자 행) -> ${jsonFileName}`);

    res.json({
      success: true,
      message: `Excel 파일에서 ${parsedData.length}개 점포 쿼터를 성공적으로 등록했습니다!`,
      title: finalTitle,
      type: 'ONNURI_HYBRID',
      marketName: finalMarketName,
      count: parsedData.length,
      targetTotal: parsedData.length,
      mbzFailedCount: 0,
      isComplete: true,
      columns,
      data: parsedData,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`,
      campaign: updatedCampaign
    });
  } catch (err) {
    logger.error('[Excel 쿼터 업로드 오류]', err);
    res.status(400).json({ error: 'Excel 쿼터 업로드 실패: ' + err.message });
  }
});

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

// 온누리상품권 특정 시/군/구(또는 시/도)의 공인 전통시장·상점가 목록 API
app.get('/api/onnuri/markets', async (req, res) => {
  const { regionCode = '', districtCode = '' } = req.query;
  try {
    const { getMarketsByDistrict } = await import('./engine/onnuri.js');
    const markets = getMarketsByDistrict(regionCode, districtCode);
    res.json(markets);
  } catch (err) {
    res.status(500).json({ error: '시장 목록 조회 실패: ' + err.message });
  }
});

// 온누리상품권 전통시장 실시간 업종별 통계 API
app.get('/api/onnuri/market-stats', async (req, res) => {
  const { regionCode = '01', districtCode = '', marketName = '', maxOpenYear = 'all' } = req.query;
  if (!marketName || !marketName.trim()) {
    return res.status(400).json({ error: '시장명을 입력해 주세요.' });
  }

  try {
    const { getMarketIndustryStats } = await import('./engine/onnuri.js');
    const parsedMaxYear = (!maxOpenYear || maxOpenYear === 'all') ? null : (parseInt(maxOpenYear, 10) || null);
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
    maxOpenYear = 'all',
    resumeFileName = null
  } = req.body;

  if (!marketName || !marketName.trim()) {
    return res.status(400).json({ error: '대상 전통시장명을 입력해 주세요 (예: 풍납시장)' });
  }

  const count = Math.max(1, Math.min(parseInt(targetCount) || 10, 900));
  const parsedMaxYear = (!maxOpenYear || maxOpenYear === 'all') ? null : (parseInt(maxOpenYear, 10) || null);

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

// 메트릭스(Metrix GetData) 조사 시스템 실시간 쿼터 동기화 API
app.post('/api/quota/sync-metrix', async (req, res) => {
  const {
    title = '2026_경기도_소상공인패널_54개_메트릭스쿼터',
    surveyUrl = 'https://survey.metrix.co.kr/Contact/?SNUM=622',
    loginId = '강영미',
    loginPw = '5254'
  } = req.body;

  if (!surveyUrl || !surveyUrl.trim()) {
    return res.status(400).json({ error: '메트릭스 설문조사 URL을 입력해 주세요.' });
  }

  const snumMatch = surveyUrl.match(/SNUM=(\d+)/i);
  const snum = snumMatch ? snumMatch[1] : '622';

  logger.info(`[Metrix 쿼터 동기화] 시작: SNUM=${snum}, 계정="${loginId}", URL="${surveyUrl}"`);

  try {
    const result = await scrapeMetrixSlots({
      snum,
      loginId: (loginId || '강영미').trim(),
      loginPw: (loginPw || '5254').trim(),
      title: title.trim(),
      surveyUrl: surveyUrl.trim()
    });

    const jsonFileName = result.jsonFileName || path.basename(result.savedJsonPath);
    const excelFileName = result.excelFileName || path.basename(result.savedXlsxPath);

    logger.success(`[Metrix 쿼터 동기화] 완료: 총 ${result.totalCount}개 대상체 쿼터 확보 (${jsonFileName})`);

    return res.json({
      success: true,
      message: `메트릭스(SNUM ${snum}) 시스템에서 총 ${result.totalCount}개 대상체 쿼터가 성공적으로 동기화되었습니다!`,
      title: title.trim(),
      type: 'METRIX_PANEL',
      count: result.totalCount,
      targetTotal: result.totalCount,
      isComplete: true,
      columns: result.quotaDbData.columns,
      data: result.quotaDbData.data,
      rows: result.quotaDbData.rows,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });
  } catch (err) {
    logger.error(`[Metrix 쿼터 동기화] 오류 발생: ${err.message}`);
    return res.status(500).json({ error: `메트릭스 쿼터 동기화 실패: ${err.message}` });
  }
});

// [쿼터 관리 허브 API]
// 1. 생성된 쿼터 목록 조회 (업종별 분포 및 통계 포함)
app.get('/api/quota/list', (req, res) => {
  try {
    ensureAssocCampaignQuotaFiles();
    const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      const content = JSON.parse(fs.readFileSync(path.join(quotasDir, f), 'utf-8'));
      const excelName = f.replace('.json', '.xlsx');
      const hasExcel = fs.existsSync(path.join(quotasDir, excelName));
      const data = content.data || content.rows || [];

      // 업종별 표본 분포 실시간 집계
      const industryDist = {};
      const isHrcEnergy = content.type === 'HRC_ENERGY_BUILDING' || content.surveyType === 'hrc_energy' || f.includes('hrc_energy');
      const isGlobalriLiteracy = content.type === 'GLOBALRI_ADULT_LITERACY' || content.surveyType === 'globalri_literacy' || f.includes('globalri_adult_literacy');
      const isGallupReturnFarm = content.type === 'GALLUP_RETURN_FARM' || content.surveyType === 'gallup_return_farm' || f.includes('gallup_20263603');
      const isAssoc = content.type === 'KSTAT_ASSOC' || content.surveyType === 'kstat_assoc' || f.startsWith('quota_assoc_');

      if (isGallupReturnFarm) {
        const doneCnt = data.filter(item => item.status === '완료' || item.quotaStatus === 'completed' || item.serverStatus === '99').length;
        const pilotCnt = data.filter(item => item.quotaStatus === 'pilot_done' || String(item.status || '').includes('완료직전') || item.serverStatus === '01').length;
        const readyCnt = data.length - doneCnt - pilotCnt;
        if (readyCnt > 0) industryDist['대기(미진행)'] = readyCnt;
        if (pilotCnt > 0) industryDist['완료직전/진행중'] = pilotCnt;
        if (doneCnt > 0) industryDist['조사완료(99)'] = doneCnt;
        const eupCounts = {};
        data.forEach(item => {
          const eup = String(item.eupMyeon || '홍천군').trim();
          eupCounts[eup] = (eupCounts[eup] || 0) + 1;
        });
        Object.entries(eupCounts).slice(0, 5).forEach(([eup, c]) => {
          industryDist[eup] = c;
        });
      } else if (isGlobalriLiteracy) {
        data.forEach(item => {
          const ag = String(item.ageGroupLabel || '기타').trim();
          industryDist[ag] = (industryDist[ag] || 0) + 1;
        });
      } else if (isAssoc) {
        const doneCnt = data.filter(item => item.status === '완료' || item.quotaStatus === 'completed' || item.quotaStatus === 'used' || item.surveyCompleted).length;
        const readyCnt = data.length - doneCnt;
        if (readyCnt > 0) industryDist['대기(진행대상)'] = readyCnt;
        if (doneCnt > 0) industryDist['조사완료'] = doneCnt;
        data.forEach(item => {
          const mt = String(item.marketType || item.industry || '상인회').trim();
          industryDist[mt] = (industryDist[mt] || 0) + 1;
        });
      } else if (isHrcEnergy) {
        const selCnt = data.filter(item => item.selectionType === '선정').length;
        const subCnt = data.filter(item => item.selectionType === '대체').length;
        const doneCnt = data.filter(item => item.status === '완료' || item.quotaStatus === 'completed').length;
        industryDist['★선정(우선)'] = selCnt;
        industryDist['대체(예비)'] = subCnt;
        if (doneCnt > 0) industryDist['조사완료'] = doneCnt;
        const usageCounts = {};
        data.filter(item => item.selectionType === '선정').forEach(item => {
          const u = String(item.mainUsage || '기타건물').trim();
          usageCounts[u] = (usageCounts[u] || 0) + 1;
        });
        Object.entries(usageCounts).slice(0, 5).forEach(([u, c]) => {
          industryDist[u] = c;
        });
      } else {
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
      }

      const mbzFailedCount = data.filter(item => item.mbzStatus === 'failed').length;
      const targetTotal = content.targetTotal || content.count || data.length;
      const isComplete = content.isComplete !== undefined
        ? content.isComplete
        : (data.length >= targetTotal && mbzFailedCount === 0);

      return {
        fileName: f,
        title: content.title || f,
        type: content.type || (isAssoc ? 'KSTAT_ASSOC' : (isHrcEnergy ? 'HRC_ENERGY_BUILDING' : 'MARKETBZ_DIRECT')),
        surveyType: content.surveyType || (isAssoc ? 'kstat_assoc' : (isHrcEnergy ? 'hrc_energy' : null)),
        linkedCampaignId: content.linkedCampaignId || null,
        selectedCount: content.selectedCount || null,
        substituteCount: content.substituteCount || null,
        surveyorId: content.surveyorId || null,
        surveyorName: content.surveyorName || null,
        marketName: content.marketName || (isAssoc ? `전통시장 상인회 · ${content.surveyorId || ''}` : (isHrcEnergy ? `에너지총조사 [건물] · ${content.surveyorName || ''} (${content.surveyorId || ''})` : null)),
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
      ensureAssocCampaignQuotaFiles();
    }
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

// 3. 특정 쿼터 데이터 수정 및 Excel 실시간 동기화 (항목 삭제 시 연동 캠페인에서도 즉시 제거)
app.put('/api/quota/:fileName', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.fileName);
    const jsonPath = path.join(quotasDir, safeFilename);
    if (!fs.existsSync(jsonPath)) {
      ensureAssocCampaignQuotaFiles();
    }
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: '해당 쿼터 파일을 찾을 수 없습니다.' });
    }

    const { title, data: updatedData } = req.body;
    if (!Array.isArray(updatedData)) {
      return res.status(400).json({ error: 'data 필드는 점포 목록 배열이어야 합니다.' });
    }

    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (title) content.title = title.trim();
    const isAssoc = content.type === 'KSTAT_ASSOC' || content.surveyType === 'kstat_assoc' || safeFilename.startsWith('quota_assoc_');

    // 순번(seq) 재부여, 슬롯 메타데이터 정규화 및 데이터 갱신
    content.data = updatedData.map((item, idx) => {
      const normalized = isAssoc
        ? normalizeAssocQuotaItem(item, idx, content.surveyorId || '')
        : {
            ...item,
            seq: idx + 1
          };
      if (normalized.slotUrl !== undefined) {
        let rawUrl = String(normalized.slotUrl || '').trim();
        if (!rawUrl) {
          delete normalized.slotUrl;
          delete normalized.surveyUrl;
          delete normalized.evalUrl;
          delete normalized.ranId;
          delete normalized.slotIndex;
          delete normalized.slotExtra;
        } else {
          if (!/^https?:\/\//i.test(rawUrl) && /^[A-Za-z0-9_-]{6,20}$/.test(rawUrl)) {
            rawUrl = isAssoc
              ? `https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=${rawUrl}&type=tapi&prid=2026070801&mnid=2026070801&srt=1`
              : `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${rawUrl}&type=tapi&prid=2026070802&mnid=900001346&srt=1`;
          }
          normalized.slotUrl = rawUrl;
          normalized.surveyUrl = rawUrl;
          const kidMatch = rawUrl.match(/[?&]KID=([^&#\s]+)/i);
          if (kidMatch) {
            normalized.ranId = kidMatch[1];
            if (!normalized.evalUrl) {
              normalized.evalUrl = isAssoc
                ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${normalized.ranId}&type=tapi&prid=2026070801&mnid=2026070801&srt=2`
                : `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${normalized.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2`;
            }
          }
          if (!normalized.slotIndex) normalized.slotIndex = idx + 1;
          if (!normalized.slotExtra) normalized.slotExtra = `(${idx})추가`;
        }
      }
      return normalized;
    });
    content.count = content.data.length;
    content.targetTotal = content.data.length;
    content.updatedAt = new Date().toISOString();

    const columns = isAssoc ? buildAssocQuotaColumns() : [
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

    // 캠페인 DB에도 삭제/수정/추가 내역을 실시간 동기화
    try {
      const allCamps = CampaignStore.getAllCampaigns();
      const syncKeys = [
        'companyName', 'marketName', 'industry', 'marketType', 'bizNumber', 'marketCode',
        'ceoName', 'leaderName', 'ceoGender', 'ceoAge', 'phone', 'leaderPhone', 'assocPhone',
        'openDate', 'address', 'handledItems', 'mainProducts', 'surveyorAccount',
        'slotUrl', 'surveyUrl', 'evalUrl', 'slotIndex', 'slotExtra', 'ranId', 'kid', 'idSel'
      ];
      allCamps.forEach(camp => {
        if (Array.isArray(camp.quotaDatabase)) {
          const isLinkedCamp = (camp.id === content.linkedCampaignId) ||
            (camp.quotaConfig?.quotaFileName === safeFilename) ||
            (camp.quotaSourceFile === safeFilename) ||
            (isAssoc && safeFilename === `quota_assoc_${camp.id}.json`) ||
            (!isAssoc && content.marketName && camp.quotaConfig?.marketName === content.marketName);

          if (isLinkedCamp) {
            // 연동된 캠페인은 쿼터 파일에서 삭제된 행을 캠페인에서도 즉시 제거하고 순번을 재정렬
            const rebuiltDb = content.data.map((dItem, idx) => {
              const existing = camp.quotaDatabase.find(cItem =>
                (dItem.ranId && cItem.ranId && dItem.ranId === cItem.ranId) ||
                (dItem.kid && cItem.kid && dItem.kid === cItem.kid) ||
                (dItem.marketCode && cItem.marketCode && dItem.marketCode === cItem.marketCode) ||
                (dItem.bizNumber && dItem.bizNumber !== '-' && cItem.bizNumber === dItem.bizNumber) ||
                ((dItem.marketName || dItem.companyName) && (cItem.marketName === (dItem.marketName || dItem.companyName) || cItem.companyName === (dItem.companyName || dItem.marketName)))
              );
              return {
                ...(existing || {}),
                ...dItem,
                seq: idx + 1,
                index: idx + 1,
                slotIndex: idx + 1,
                quotaStatus: existing?.quotaStatus || dItem.quotaStatus || 'ready',
                evalStatus: existing?.evalStatus || dItem.evalStatus || 'pending',
                surveyCompleted: existing?.surveyCompleted ?? dItem.surveyCompleted ?? false,
                evalCompleted: existing?.evalCompleted ?? dItem.evalCompleted ?? false,
                usedAt: existing?.usedAt || dItem.usedAt || null
              };
            });
            CampaignStore.updateCampaign(camp.id, {
              quotaDatabase: rebuiltDb,
              quotaConfig: {
                ...(camp.quotaConfig || {}),
                quotaFileName: safeFilename,
                targetCount: rebuiltDb.length
              }
            });
          } else {
            let campChanged = false;
            camp.quotaDatabase.forEach(cItem => {
              const matched = content.data.find(d => 
                (d.bizNumber && d.bizNumber !== '-' && d.bizNumber === cItem.bizNumber) ||
                (d.companyName && d.companyName === cItem.companyName)
              );
              if (matched) {
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
        }
      });
    } catch (_) {}

    logger.success(`[쿼터 수정 완료] "${content.title}" (${safeFilename}) ${content.count}건 갱신 및 캠페인/Excel 동기화 성공!`);

    res.json({
      success: true,
      message: `조사 쿼터가 성공적으로 저장 및 캠페인/Excel과 동기화되었습니다. (총 ${content.count}건)`,
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
