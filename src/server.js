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
import { exportBusinessesToExcel } from './utils/excel.js';
import { runKstatSurvey } from './engine/kstat-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));
app.use('/reports', express.static(reportsDir));

// 리포트 및 쿼터 디렉터리 준비
const reportsDir = path.join(rootDir, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const quotasDir = path.join(rootDir, 'data', 'quotas');
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
      quotaDatabase: quotaDb
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
// [3-1] 2-Phase 실행: 1번 쿼터 파일럿 시뮬레이션 (Agree 안전 대기)
// ==========================================
app.post('/api/campaigns/:id/pilot-run', async (req, res) => {
  const campaign = CampaignStore.getCampaignById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  }

  const { surveyUrl, policy = {}, quotaIndex = 1 } = req.body;
  const targetUrl = surveyUrl || campaign.guidelineConfig?.surveyUrl;
  if (!targetUrl) {
    return res.status(400).json({ error: '설문조사 URL이 필요합니다.' });
  }

  const quotaDb = campaign.quotaDatabase || [];
  if (quotaDb.length === 0) {
    return res.status(400).json({ error: '캠페인에 구축된 조사 쿼터가 없습니다.' });
  }

  const targetBiz = quotaDb[Math.max(0, quotaIndex - 1)];

  // 가이드라인 설정 보존
  CampaignStore.updateCampaign(campaign.id, {
    guidelineConfig: {
      ...campaign.guidelineConfig,
      surveyUrl: targetUrl,
      policy
    }
  });

  logger.info(`[파일럿 검증 시작] 캠페인 "${campaign.title}" ➔ 대상 사업자: "${targetBiz.companyName}" (${targetBiz.bizNumber})`);
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
        policy,
        pilotMode: true,
        reportDir: path.join(reportsDir, `pilot_${campaign.id}`),
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

  const { surveyUrl, policy = {}, startIndex = 2, safetyGuard = false } = req.body;
  const targetUrl = surveyUrl || campaign.guidelineConfig?.surveyUrl;
  const quotaDb = campaign.quotaDatabase || [];

  const targets = quotaDb.filter(b => b.index >= startIndex && b.quotaStatus !== 'completed');
  if (targets.length === 0) {
    return res.status(400).json({ error: '연속 실행할 잔여 쿼터가 없습니다.' });
  }

  logger.info(`[배치 자동화 가동] 캠페인 "${campaign.title}" 잔여 ${targets.length}건 연속 실행 시작 (안전가드: ${safetyGuard ? 'ON' : 'OFF'})`);
  CampaignStore.updateCampaign(campaign.id, { status: 'running' });

  res.json({
    success: true,
    message: `잔여 쿼터 ${targets.length}건 배치 자동화가 시작되었습니다.`,
    totalTargets: targets.length
  });

  (async () => {
    try {
      for (let i = 0; i < targets.length; i++) {
        const biz = targets[i];
        biz.quotaStatus = 'running';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });

        logger.info(`[배치 진행 ${i + 1}/${targets.length}] "${biz.companyName}" (${biz.bizNumber}) 설문 자동화 시작...`);

        const result = await runKstatSurvey({
          surveyUrl: targetUrl,
          bizData: biz,
          policy,
          pilotMode: safetyGuard,
          reportDir: path.join(reportsDir, `batch_${campaign.id}`),
          onProgress: (info) => {
            logger.broadcast({
              type: 'BATCH_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: biz.index,
              itemNumber: i + 1,
              totalItems: targets.length,
              ...info
            });
          }
        });

        if (result.success) {
          biz.quotaStatus = safetyGuard ? 'pilot_done' : 'completed';
          biz.completedAt = new Date().toISOString();
          logger.success(`[배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" 설문 완료!`);
        } else {
          biz.quotaStatus = 'error';
          logger.error(`[배치 ${i + 1}/${targets.length} 실패] "${biz.companyName}": ${result.error}`);
        }

        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
        await new Promise(r => setTimeout(r, 3000));
      }

      CampaignStore.updateCampaign(campaign.id, { status: 'completed' });
      logger.success(`🎉 [배치 자동화 완료] 캠페인 "${campaign.title}"의 모든 연속 설문이 완료되었습니다!`);
      logger.broadcast({
        type: 'BATCH_COMPLETED',
        campaignId: campaign.id
      });
    } catch (err) {
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
  const targetBiz = quotaDb.find(b => b.index === quotaIndex);

  if (!targetBiz) {
    return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
  }

  const targetUrl = campaign.guidelineConfig?.surveyUrl;
  if (!targetUrl) {
    return res.status(400).json({ error: '설문조사 URL이 먼저 설정되어야 합니다.' });
  }

  targetBiz.quotaStatus = 'running';
  CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });

  logger.info(`[개별 쿼터 테스트] "${targetBiz.companyName}" (순번: #${targetBiz.index}) 1건 실행 시작...`);

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
        policy: campaign.guidelineConfig?.policy || {},
        pilotMode: true,
        reportDir: path.join(reportsDir, `single_${campaign.id}_idx${quotaIndex}`),
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
// [3-4] 단계별 화면 캡처 목록 조회
// ==========================================
app.get('/api/campaigns/:id/screenshots', (req, res) => {
  // 칠칠수산 및 최신 캡처 이미지 제공
  const simDir = path.join(reportsDir, 'simulation_77susan');
  if (fs.existsSync(simDir)) {
    const files = fs.readdirSync(simDir).filter(f => f.includes('saved') || f.includes('Agree'));
    const order = ['Q1', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'Agree'];
    
    const screenshots = order.map((step, idx) => {
      const matchFile = files.find(f => f.toLowerCase().includes(`_${step.toLowerCase()}_`)) || 'step_Agree_saved.png';
      return {
        step,
        stepIndex: idx + 1,
        title: step === 'Agree' ? '개인정보 수집 동의' : `${step} 단계 응답 완료`,
        url: `/reports/simulation_77susan/${matchFile}`
      };
    });
    return res.json({ success: true, screenshots });
  }

  res.json({ success: true, screenshots: [] });
});

// 작업 중지 요청
app.post('/api/survey/stop', (req, res) => {
  if (!currentTask.isRunning) {
    return res.status(400).json({ error: '현재 실행 중인 작업이 없습니다.' });
  }

  currentTask.isRunning = false;
  if (currentTask.campaignId) {
    CampaignStore.updateCampaign(currentTask.campaignId, { status: 'ready' });
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
  address: '사업장주소',
  industry: '업종',
  subIndustry: '세부업종',
  phone: '전화번호',
  openingDate: '개업일',
  category: '분류'
};

// 조사 쿼터 생성 및 파일(JSON + XLSX) 내보내기
app.post('/api/quota/generate', async (req, res) => {
  const {
    title = '사업주_조사쿼터',
    keyword = '소프트웨어',
    targetCount = 2,
    baseFields = ['companyName', 'bizNumber', 'ceoName', 'address', 'industry'],
    customFields = [],
    autoEnrich = true
  } = req.body;

  const count = Math.max(parseInt(targetCount, 10) || 1, 1);
  logger.info(`[조사 쿼터 생성 시작] 명칭: "${title}" | 키워드: "${keyword}" | 목표 수량: ${count}개 | 외부보강: ${autoEnrich ? 'ON' : 'OFF'}`);
  if (customFields.length > 0) {
    logger.info(`[추가 요청 항목] ${customFields.join(', ')}`);
  }

  try {
    const { fetchMarketBzBusinesses } = await import('./engine/marketbz.js');
    const businesses = await fetchMarketBzBusinesses({
      keyword,
      count,
      customFields,
      autoEnrich: autoEnrich !== false
    });

    if (businesses.length === 0) {
      return res.status(404).json({ error: '조건에 일치하는 실존 사업자 데이터를 찾지 못했습니다.' });
    }

    // 컬럼 정의 (Excel 및 화면 그리드 헤더용)
    const columns = [];
    // 1. 기본 필드 중 선택된 것
    baseFields.forEach(f => {
      if (BASE_FIELD_LABELS[f]) {
        columns.push({ key: f, label: BASE_FIELD_LABELS[f] });
      }
    });
    // 2. 사용자가 동적으로 추가한 커스텀 필드
    customFields.forEach(cf => {
      columns.push({ key: cf, label: cf });
    });

    const timestamp = Date.now();
    const cleanTitle = title.replace(/[^가-힣a-zA-Z0-9_\-]/g, '_');
    const filenameBase = `quota_${cleanTitle}_${timestamp}`;

    // 1. JSON 파일 저장
    const jsonFileName = `${filenameBase}.json`;
    const jsonFilePath = path.join(quotasDir, jsonFileName);
    const quotaMeta = {
      title,
      keyword,
      createdAt: new Date().toISOString(),
      count: businesses.length,
      columns,
      data: businesses
    };
    fs.writeFileSync(jsonFilePath, JSON.stringify(quotaMeta, null, 2), 'utf-8');

    // 2. Excel (.xlsx) 파일 생성 저장
    const excelFileName = `${filenameBase}.xlsx`;
    const excelFilePath = path.join(quotasDir, excelFileName);
    exportBusinessesToExcel({
      data: businesses,
      columns,
      filePath: excelFilePath
    });

    logger.success(`[조사 쿼터 완성] ${businesses.length}개 실존 사업자 데이터로 JSON 및 Excel 파일이 성공적으로 생성되었습니다! 🎉`);

    res.json({
      success: true,
      message: '조사 쿼터가 성공적으로 생성되었습니다.',
      title,
      keyword,
      count: businesses.length,
      columns,
      data: businesses,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });
  } catch (err) {
    logger.error('[조사 쿼터 생성 실패]', err);
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

// 온누리상품권 + 마켓비즈 하이브리드 조사 쿼터 생성 API
app.post('/api/quota/generate-onnuri', async (req, res) => {
  const {
    title = '온누리 전통시장 조사 쿼터',
    regionCode = '01',
    districtCode = '',
    marketName = '',
    statusFilter = 'ACTIVE',
    paymentFilter = 'ALL',
    targetCount = 10,
    customFields = [],
    autoEnrich = true
  } = req.body;

  if (!marketName || !marketName.trim()) {
    return res.status(400).json({ error: '대상 전통시장명을 입력해 주세요 (예: 풍납시장)' });
  }

  const count = Math.max(1, Math.min(parseInt(targetCount) || 10, 50));
  logger.info(`[온누리 쿼터 요청] "${title}" | 시장: "${marketName}" | 목표: ${count}개 | 외부보강: ${autoEnrich ? 'ON' : 'OFF'}`);

  try {
    const { buildHybridOnnuriQuota } = await import('./engine/hybrid-quota.js');
    const businesses = await buildHybridOnnuriQuota({
      regionCode,
      districtCode,
      marketName: marketName.trim(),
      statusFilter,
      paymentFilter,
      targetCount: count,
      customFields,
      autoEnrich: autoEnrich !== false
    });

    if (businesses.length === 0) {
      return res.status(404).json({ error: `"${marketName}" 조건에 부합하는 온누리 가맹점을 찾지 못했습니다.` });
    }

    // 온누리 하이브리드 컬럼 정의 (사용자 요청: [시장명] [상호] [사업자등록번호] [대표자명] [연락처] [개업연월] [취급품목] [주소] 등)
    const baseColumnDefs = [
      { key: 'marketName', label: '시장명' },
      { key: 'companyName', label: '상호(가맹점명)' },
      { key: 'bizNumber', label: '사업자등록번호' },
      { key: 'ceoName', label: '대표자명' },
      { key: 'phone', label: '연락처' },
      { key: 'openDate', label: '개업연월' },
      { key: 'handledItems', label: '취급품목' },
      { key: 'address', label: '주소' },
      { key: 'status', label: '가맹상태' },
      { key: 'paperAccepted', label: '온누리지류' },
      { key: 'digitalAccepted', label: '온누리디지털' }
    ];

    let columns = [];
    const selectedFields = req.body.baseFields || req.body.selectedFields;

    if (selectedFields && Array.isArray(selectedFields) && selectedFields.length > 0) {
      // 시장명은 기본 항상 유지
      columns.push({ key: 'marketName', label: '시장명' });
      baseColumnDefs.forEach(col => {
        if (col.key !== 'marketName' && selectedFields.includes(col.key)) {
          columns.push(col);
        }
      });
    } else {
      columns = [...baseColumnDefs];
    }

    // 커스텀 필드 추가
    if (customFields && Array.isArray(customFields)) {
      customFields.forEach(cf => {
        columns.push({ key: cf, label: cf });
      });
    }

    const timestamp = Date.now();
    const cleanTitle = title.replace(/[^가-힣a-zA-Z0-9_\-]/g, '_');
    const filenameBase = `quota_onnuri_${cleanTitle}_${timestamp}`;

    // 1. JSON 파일 저장
    const jsonFileName = `${filenameBase}.json`;
    const jsonFilePath = path.join(quotasDir, jsonFileName);
    const quotaMeta = {
      title,
      type: 'ONNURI_HYBRID',
      marketName: marketName.trim(),
      createdAt: new Date().toISOString(),
      count: businesses.length,
      columns,
      data: businesses
    };
    fs.writeFileSync(jsonFilePath, JSON.stringify(quotaMeta, null, 2), 'utf-8');

    // 2. Excel (.xlsx) 파일 생성 저장
    const excelFileName = `${filenameBase}.xlsx`;
    const excelFilePath = path.join(quotasDir, excelFileName);
    exportBusinessesToExcel({
      data: businesses,
      columns,
      filePath: excelFilePath
    });

    logger.success(`[온누리 쿼터 완성] ${businesses.length}개 실존 전통시장 사업자 데이터로 JSON 및 Excel 파일이 성공적으로 생성되었습니다! 🎉`);

    res.json({
      success: true,
      message: '온누리 연계 조사 쿼터가 성공적으로 생성되었습니다.',
      title,
      type: 'ONNURI_HYBRID',
      marketName: marketName.trim(),
      count: businesses.length,
      columns,
      data: businesses,
      jsonFileName,
      excelFileName,
      jsonDownloadUrl: `/api/quota/download/${jsonFileName}`,
      excelDownloadUrl: `/api/quota/download/${excelFileName}`
    });

  } catch (err) {
    logger.error('[온누리 쿼터 생성 실패]', err);
    res.status(500).json({ error: '온누리 연계 쿼터 생성 중 오류가 발생했습니다: ' + err.message });
  }
});

// 생성된 쿼터 목록 조회
app.get('/api/quota/list', (req, res) => {
  try {
    const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      const content = JSON.parse(fs.readFileSync(path.join(quotasDir, f), 'utf-8'));
      const excelName = f.replace('.json', '.xlsx');
      const hasExcel = fs.existsSync(path.join(quotasDir, excelName));
      return {
        fileName: f,
        title: content.title || f,
        type: content.type || 'MARKETBZ_DIRECT',
        marketName: content.marketName || null,
        keyword: content.keyword,
        count: content.count,
        createdAt: content.createdAt,
        excelFileName: hasExcel ? excelName : null
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: '쿼터 목록을 불러오지 못했습니다.' });
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
