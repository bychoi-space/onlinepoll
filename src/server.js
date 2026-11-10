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

import { logger } from './utils/logger.js';
import * as CampaignStore from './models/campaign.js';
import {
  exportBusinessesToExcel,
  generateQuotaTemplateBuffer,
  parseExcelQuotaBuffer
} from './utils/excel.js';
import { scrapeMetrixSlots } from './engine/metrix-slot-scraper.js';
import { findHrcQuotaJsonPath } from './engine/hrc-energy-scraper.js';
import { findGlobalriQuotaJsonPath } from './engine/globalri-literacy-scraper.js';
import { GALLUP_20263603_DEFAULT_URL } from './engine/gallup-return-farm-runner.js';
import { seedInitialCampaigns } from './config/campaign-seeders.js';
import { createAssocQuotaSyncHelpers } from './utils/assoc-quota-sync.js';
import { authGate, registerAuthAndSseRoutes } from './routes/auth-routes.js';
import { registerCampaignRoutes } from './routes/campaign-routes.js';
import { registerSyncRoutes } from './routes/sync-routes.js';
import { registerExecutionRoutes } from './routes/execution-routes.js';
import { registerQuotaRoutes } from './routes/quota-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

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

// 서버 기동 시 비정상 중단된 running 상태 초기화 및 에너지총조사/성인문해/귀농실태 캠페인 자동 시드
seedInitialCampaigns({
  CampaignStore,
  quotasDir,
  findHrcQuotaJsonPath,
  findGlobalriQuotaJsonPath,
  GALLUP_20263603_DEFAULT_URL
});

// 상인회 캠페인 ⇄ 쿼터 보관함 동기화 헬퍼 생성
const {
  buildAssocQuotaColumns,
  normalizeAssocQuotaItem,
  syncAssocCampaignToQuotaFile,
  ensureAssocCampaignQuotaFiles
} = createAssocQuotaSyncHelpers({ quotasDir });

// [0] 인증 및 실시간 SSE(/api/events, /api/logs) 라우트
registerAuthAndSseRoutes(app);

// [1] 캠페인 관리, 블루프린트/가이드라인, 쿼터 빌드/임포트 라우트
registerCampaignRoutes({
  app,
  dataDir,
  quotasDir,
  reportsDir,
  syncAssocCampaignToQuotaFile,
  ensureAssocCampaignQuotaFiles
});

// [2] 외부 조사서버(Kstat / HRC TAPI / GIFT / 한국갤럽) 슬롯·상태·엑셀·구글시트 동기화 라우트
registerSyncRoutes({
  app,
  quotasDir,
  syncAssocCampaignToQuotaFile
});

// [3] 설문 자동화 실행(파일럿 / 연속 배치 / 개별 1건 / 중지 / 상태 조회) 라우트
registerExecutionRoutes({
  app,
  quotasDir,
  reportsDir
});

// [4] 조사 쿼터(Quota) 생성 및 Excel/JSON 내보내기 전용 라우트
registerQuotaRoutes({
  app,
  quotasDir,
  CampaignStore,
  logger,
  exportBusinessesToExcel,
  parseExcelQuotaBuffer,
  generateQuotaTemplateBuffer,
  scrapeMetrixSlots,
  ensureAssocCampaignQuotaFiles,
  normalizeAssocQuotaItem,
  buildAssocQuotaColumns
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` AutoSurvey AI 캠페인 & 쿼터 DB 시스템 가동!`);
  console.log(` 메인 목차 대시보드: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

export default app;
