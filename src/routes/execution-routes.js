import fs from 'fs';
import path from 'path';
import * as CampaignStore from '../models/campaign.js';
import { runKstatSurvey } from '../engine/kstat-runner.js';
import { runKstatEvaluation } from '../engine/kstat-eval-runner.js';
import { runKstatAssocSurvey } from '../engine/kstat-assoc-runner.js';
import { runKstatAssocEvaluation } from '../engine/kstat-assoc-eval-runner.js';
import { runMetrixSurvey } from '../engine/metrix-runner.js';
import { runMetrixSeoulSurvey } from '../engine/metrix-seoul-runner.js';
import { runKonaSurvey } from '../engine/kona-runner.js';
import { runHrcEnergySurvey } from '../engine/hrc-energy-runner.js';
import { runGlobalriLiteracySurvey } from '../engine/globalri-literacy-runner.js';
import {
  GALLUP_20263603_DEFAULT_URL,
  runGallupReturnFarmSurvey
} from '../engine/gallup-return-farm-runner.js';
import {
  syncKstatSlotStatus,
  saveKstatSlotProgressStatus
} from '../engine/kstat-sync.js';
import {
  buildGlobalriAnswersExcel,
  persistGlobalriQuotaDatabase,
  syncGlobalriAnswersToGoogleSheet
} from '../utils/globalri-answer-excel.js';
import {
  SEOUL_PANEL_DEFAULT_GSHEET_URL,
  buildSeoulPanelAnswersExcel,
  persistSeoulPanelQuotaDatabase,
  syncSeoulPanelAnswersToGoogleSheet
} from '../utils/seoul-panel-answer-excel.js';
import {
  MAX_CONCURRENT_TASKS,
  getActiveTasksList,
  isCampaignTaskRunning,
  checkCanStartCampaignTask,
  startCampaignTask,
  finishCampaignTask
} from '../services/task-manager.js';
import { logger } from '../utils/logger.js';

export function registerExecutionRoutes({
  app,
  quotasDir,
  reportsDir
}) {
  // 범용 브라우저 설문 실행 API
  app.post('/api/campaigns/:id/start', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const slotCheck = checkCanStartCampaignTask(campaign);
    if (!slotCheck.ok) {
      return res.status(400).json({ error: slotCheck.error });
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

    CampaignStore.updateCampaign(campaign.id, {
      status: 'running',
      guidelineConfig: {
        ...campaign.guidelineConfig,
        ...req.body,
        surveyUrl: targetUrl
      }
    });

    const taskState = startCampaignTask(campaign, 'start', { current: 0, total: iterations, percent: 0 });

    logger.runWithCampaignContext(campaign.id, () => {
      logger.info(`[캠페인 실행] "${campaign.title}" 자동 설문조사 시작 (총 ${iterations}회, 모드: ${campaign.quotaType}, 가동 슬롯: ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`);
    });

    res.json({ message: '캠페인 설문 자동화 작업이 시작되었습니다.', status: 'started' });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      try {
        const { runSurveySession } = await import('../engine/browser.js');
        const quotaDb = campaign.quotaDatabase || [];

        for (let i = 1; i <= iterations; i++) {
          if (!isCampaignTaskRunning(campaign.id)) {
            logger.warn('사용자에 의해 작업이 중단되었습니다.');
            break;
          }

          logger.info(`[${i}/${iterations}회차] 설문 응답 세션을 시작합니다...`);
          taskState.progress = { current: i - 1, total: iterations, percent: Math.round(((i - 1) / iterations) * 100) };
          logger.updateProgress(i - 1, iterations, `${i}회차 시작 중...`);

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

          const reportFileName = `report_${Date.now()}_iter${i}.json`;
          const reportPath = path.join(reportsDir, reportFileName);
          fs.writeFileSync(reportPath, JSON.stringify(sessionResult, null, 2), 'utf-8');

          if (businessData) {
            const bizIndex = quotaDb.findIndex(b => b.bizNumber === businessData.bizNumber);
            if (bizIndex !== -1) {
              quotaDb[bizIndex].quotaStatus = 'used';
              quotaDb[bizIndex].usedAt = new Date().toISOString();
            }
          }

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

          taskState.progress = { current: i, total: iterations, percent: Math.round((i / iterations) * 100) };
          logger.success(`[${i}/${iterations}회차] 설문 응답 및 제출이 완료되었습니다!`);
          logger.updateProgress(i, iterations, `${i}/${iterations}회차 완료`);
        }

        CampaignStore.updateCampaign(campaign.id, { status: 'completed' });
        logger.success(`캠페인 "${campaign.title}"의 모든 설문 작업이 성공적으로 완료되었습니다! 🎉`);
      } catch (err) {
        logger.error('캠페인 설문 실행 중 오류 발생:', err);
        CampaignStore.updateCampaign(campaign.id, { status: 'ready' });
      } finally {
        finishCampaignTask(campaign.id);
      }
    })());
  });

  // [3-1] 2-Phase 실행: 1번 쿼터 파일럿 시뮬레이션 (Agree 안전 대기)
  app.post('/api/campaigns/:id/pilot-run', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const slotCheck = checkCanStartCampaignTask(campaign);
    if (!slotCheck.ok) {
      logger.warn(`[단건/파일럿 가동 차단] ${slotCheck.error.replace(/\n/g, ' ')}`);
      return res.status(409).json({
        error: slotCheck.error
      });
    }

    const { policy = {}, quotaIndex = 1 } = req.body;
    const quotaDb = campaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      return res.status(400).json({ error: '캠페인에 구축된 조사 쿼터가 없습니다.' });
    }

    const isMetrixCampaign = (campaign.surveyType === 'metrix_panel');
    const isMetrixSeoulCampaign = (campaign.surveyType === 'metrix_seoul_panel');
    const isKonaCampaign = (campaign.surveyType === 'kona_youth');
    const isGlobalriLiteracyCampaign = (campaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarmCampaign = (campaign.surveyType === 'gallup_return_farm');
    let targetBiz = quotaDb.find(b => Number(b.index || b.seq) === Number(quotaIndex)) || quotaDb[Math.max(0, quotaIndex - 1)];
    if ((isKonaCampaign || isGlobalriLiteracyCampaign || isGallupReturnFarmCampaign || isMetrixSeoulCampaign) && targetBiz && (targetBiz.quotaStatus === 'completed' || String(targetBiz.status || '').includes('완료'))) {
      const firstReady = quotaDb.find(b => b.quotaStatus !== 'completed' && !String(b.status || '').includes('완료'));
      if (firstReady) targetBiz = firstReady;
    }
    if (!targetBiz) {
      return res.status(400).json({ error: '실행 대상 쿼터를 찾을 수 없습니다.' });
    }

    const targetUrl = targetBiz.surveyUrl || targetBiz.slotUrl || targetBiz.householdUrl || (isMetrixSeoulCampaign ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${targetBiz.resid}&fwid=S21401by41s3${targetBiz.accountKey || targetBiz.akey || '2010'}` : (isGallupReturnFarmCampaign ? GALLUP_20263603_DEFAULT_URL : (isKonaCampaign ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : (isGlobalriLiteracyCampaign ? 'https://gift.globalri.it/login' : ''))));
    if (!targetUrl) {
      return res.status(400).json({
        error: isMetrixCampaign
          ? `[${targetBiz.companyName}] 1번 쿼터에 메트릭스 설문 참여 URL(surveyUrl)이 존재하지 않습니다.`
          : `[${targetBiz.companyName}] 1번 쿼터에 케이스탯 전용 설문 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 먼저 완료해 주세요.`
      });
    }

    CampaignStore.updateCampaign(campaign.id, {
      guidelineConfig: {
        ...campaign.guidelineConfig,
        surveyUrl: targetUrl,
        policy
      }
    });

    startCampaignTask(campaign, 'pilot', { current: 0, total: 1, percent: 0 });
    targetBiz.quotaStatus = 'running';
    CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'running' });
    logger.runWithCampaignContext(campaign.id, () => {
      logger.info(`[파일럿 검증 시작] 캠페인 "${campaign.title}" ➔ 대상: "${targetBiz.companyName}" (${targetBiz.idx || targetBiz.bizNumber || ''}) (슬롯: ${targetBiz.slotIndex ? '#' + targetBiz.slotIndex : '단독'} · 가동 슬롯: ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`);
      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: quotaDb
      });
    });

    res.json({
      success: true,
      message: `"${targetBiz.companyName}" 파일럿 시뮬레이션이 시작되었습니다. (제출 직전 안전 정지)`,
      targetBiz
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      try {
        const isAssoc = (campaign.surveyType === 'kstat_assoc');
        const isMetrix = (campaign.surveyType === 'metrix_panel');
        const isMetrixSeoul = (campaign.surveyType === 'metrix_seoul_panel');
        const isKona = (campaign.surveyType === 'kona_youth');
        const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
        const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
        const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
        let result;

        if (isMetrixSeoul) {
          logger.info(`[서울시 소상공인 패널 파일럿 실행] 러너 가동: "${targetBiz.companyName}" (resid: ${targetBiz.resid}, 계정: ${targetBiz.accountKey || targetBiz.akey})`);
          const seoulPol = campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || policy || {};
          result = await runMetrixSeoulSurvey({
            campaign,
            policy: seoulPol,
            slotUrl: targetUrl,
            slotData: targetBiz,
            mode: 'pilot',
            onProgress: (info) => {
              logger.info(`[서울시 소상공인 파일럿 - ${info.step}] ${info.message}`);
              logger.broadcast({
                type: 'PILOT_PROGRESS',
                campaignId: campaign.id,
                quotaIndex: targetBiz.index,
                ...info
              });
            }
          });
        } else if (isGallupReturnFarm) {
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
          if (isMetrixSeoul) {
            if (result.alreadyCompleted) {
              targetBiz.quotaStatus = 'completed';
              targetBiz.status = '완료(100%)';
              targetBiz.progressText = '완료(100%)';
              targetBiz.progressPct = 100;
            } else {
              targetBiz.quotaStatus = 'pilot_done';
              targetBiz.status = '동의서대기(99%/Step115)';
              targetBiz.progressText = '응답중(99%)';
              targetBiz.progressPct = 99;
            }
            targetBiz.pilotAt = new Date().toISOString();
            targetBiz.completedAt = targetBiz.pilotAt;
            if (result.submittedAnswers && Object.keys(result.submittedAnswers).length > 0) {
              targetBiz.submittedAnswers = result.submittedAnswers;
            }
            try {
              persistSeoulPanelQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
              buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncSeoulPanelAnswersToGoogleSheet({
                quotaDatabase: quotaDb,
                sheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL
              });
            } catch (exErr) {
              logger.warn(`[서울시 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
            logger.success(`🎉 [서울시 소상공인 패널 안전 대기 완료] "${targetBiz.companyName}" (resid=${targetBiz.resid}) ${targetBiz.status} 달성 및 구글 시트 자동 기록 완료!`);
          } else if (isGallupReturnFarm) {
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
              persistGlobalriQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
              buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncGlobalriAnswersToGoogleSheet({ quotaDatabase: quotaDb, pullFromSeolmoon: false });
            } catch (exErr) {
              logger.warn(`[성인문해능력조사 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
            logger.success(`🎉 [성인문해능력조사 Part C 완료] "${targetBiz.respondentName || targetBiz.companyName}" (${targetBiz.memberUid}) ${targetBiz.status} 달성 및 답변 엑셀/구글시트 갱신 완료!`);
          } else if (isHrcEnergy) {
            targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
            targetBiz.status = (result.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
            targetBiz.progress = (result.status === 'stopped_at_review') ? '91%' : '100%';
            targetBiz.pilotAt = new Date().toISOString();
            targetBiz.capturedSteps = result.capturedSteps;
            if (result.giftSignResult?.ok) {
              targetBiz.giftSigned = true;
              targetBiz.giftBrand = result.giftSignResult.giftBrand || '신세계';
              targetBiz.giftValue = result.giftSignResult.giftValue || '5000';
              targetBiz.giftSignerName = result.giftSignResult.signerName || targetBiz.contactName || '';
              targetBiz.giftSignerPhone = result.giftSignResult.signerPhone || targetBiz.phone || '';
              targetBiz.giftStyleLabel = result.giftSignResult.styleLabel || '';
            }
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

          finishCampaignTask(campaign.id);
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
          finishCampaignTask(campaign.id);
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
        finishCampaignTask(campaign.id);
        targetBiz.quotaStatus = 'error';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
        logger.error('[파일럿 오류]', err);
      }
    })());
  });

  // [3-2] 2-Phase 실행: 고속 배치 가동
  app.post('/api/campaigns/:id/batch-run', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const slotCheck = checkCanStartCampaignTask(campaign);
    if (!slotCheck.ok) {
      logger.warn(`[배치 가동 차단] ${slotCheck.error.replace(/\n/g, ' ')}`);
      return res.status(409).json({
        error: slotCheck.error
      });
    }

    const { policy = {}, startIndex = 1, safetyGuard = false, targetIndices = null } = req.body;
    const selectedIndexSet = (Array.isArray(targetIndices) && targetIndices.length > 0)
      ? new Set(targetIndices.map(n => Number(n)).filter(n => !isNaN(n)))
      : null;
    const quotaDb = campaign.quotaDatabase || [];
    const isAssoc = (campaign.surveyType === 'kstat_assoc');
    const isMetrix = (campaign.surveyType === 'metrix_panel');
    const isMetrixSeoul = (campaign.surveyType === 'metrix_seoul_panel');
    const isKona = (campaign.surveyType === 'kona_youth');
    const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
    const effectivePolicy = isMetrixSeoul
      ? (campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
      : (isGallupReturnFarm
        ? (campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
        : (isGlobalriLiteracy
          ? (campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
          : (isHrcEnergy
            ? (campaign.hrcEnergyPolicy || policy || {})
            : (isKona
              ? (campaign.konaPolicy || policy || {})
              : (isMetrix ? (campaign.metrixPolicy || policy || {}) : (isAssoc ? (campaign.assocPolicy || policy || {}) : policy))))));

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
      if (b.isClosedBiz || String(b.bizStatus || '').includes('폐업') || b.quotaStatus === 'excluded') {
        return false;
      }
      if (selectedIndexSet) {
        if (!selectedIndexSet.has(idx)) return false;
        if (b.quotaStatus === 'completed' || String(b.status || '').includes('완료') || b.memberStatus === '완료') return false;
        return true;
      }
      if (idx < startIndex) return false;
      if (skipSlotIndices.includes(idx)) return false;
      if ((isMetrix || isMetrixSeoul || isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) && (b.uid || b.resid || b.memberUid || b.idx || b.id) && skipSlotUids.includes(String(b.memberUid || b.resid || b.uid || b.idx || b.id))) return false;
      if (isHrcEnergy && effectivePolicy.onlySelectedByDefault !== false && b.selectionType && b.selectionType !== '선정') {
        return false;
      }
      if (b.quotaStatus === 'completed' || String(b.status || '').includes('완료') || b.memberStatus === '완료' || b.substitutedByUid) return false;
      if ((isGallupReturnFarm || isMetrixSeoul) && (b.quotaStatus === 'pilot_done' || String(b.status || '').includes('동의서대기'))) return false;
      if (skipCompletedSlots && (b.surveyCompleted === '완료' || b.surveyCompleted === true || String(b.status || '').includes('완료'))) {
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

    const unmapped = (isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm || isMetrixSeoul) ? [] : targets.filter(b => !b.slotUrl && !b.surveyUrl);
    if (unmapped.length > 0) {
      return res.status(400).json({
        error: isMetrix
          ? `실행 대상 패널 ${targets.length}건 중 ${unmapped.length}건에 설문 URL(surveyUrl)이 누락되었습니다.`
          : `실행 대상 쿼터 ${targets.length}건 중 ${unmapped.length}건에 케이스탯 슬롯 URL(slotUrl)이 매핑되지 않았습니다. 상단의 [슬롯 1:1 매핑]을 통해 모든 쿼터에 슬롯을 매칭한 후 가동해 주세요.`
      });
    }

    const batchTask = startCampaignTask(campaign, 'batch', { current: 0, total: targets.length, percent: 0 });
    CampaignStore.updateCampaign(campaign.id, { status: 'running' });
    logger.runWithCampaignContext(campaign.id, () => {
      logger.info(`[배치 자동화 가동] 캠페인 "${campaign.title}" 대상 ${targets.length}건 연속 실행 시작 (안전가드: ${safetyGuard ? 'ON' : 'OFF'}, 기입력보존: ${effectivePolicy.preserveExistingInputs !== false ? 'ON' : 'OFF'}, 가동 슬롯: ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`);
    });

    res.json({
      success: true,
      message: `잔여 쿼터 ${targets.length}건 배치 자동화가 시작되었습니다. (동시 실행 슬롯 ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`,
      totalTargets: targets.length
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      try {
        for (let i = 0; i < targets.length; i++) {
          if (!isCampaignTaskRunning(campaign.id)) {
            logger.warn(`[배치 일시중지] 사용자에 의해 배치가 안전하게 중지되었습니다.`);
            break;
          }
          batchTask.progress = {
            current: i,
            total: targets.length,
            percent: Math.round((i / Math.max(1, targets.length)) * 100)
          };

          const biz = targets[i];
          const bizUrl = biz.slotUrl || biz.surveyUrl || (isMetrixSeoul ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${biz.resid}&fwid=S21401by41s3${biz.accountKey || biz.akey || '2010'}` : (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${biz.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : ''))));
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
            campaignId: campaign.id,
            quotaDatabase: quotaDb
          });

          const slotInfo = biz.slotIndex ? ` [Kstat 슬롯 #${biz.slotIndex} ${biz.slotExtra || ''}]` : '';
          logger.info(`[배치 진행 ${i + 1}/${targets.length}] "${biz.buildingName || biz.marketName || biz.companyName}" (${biz.resid || biz.uid || biz.idx || biz.bizNumber || biz.regCode || ''})${slotInfo} 설문 자동화 시작...`);

          let result;
          try {
            if (isMetrixSeoul) {
              result = await runMetrixSeoulSurvey({
                campaign,
                policy: effectivePolicy,
                slotUrl: bizUrl,
                slotData: biz,
                mode: 'batch',
                onProgress: (info) => {
                  logger.info(`[서울시 소상공인 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
            } else if (isGallupReturnFarm) {
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
                    if (subRes.giftSignResult?.ok) {
                      sub.giftSigned = true;
                      sub.giftBrand = subRes.giftSignResult.giftBrand || '신세계';
                      sub.giftValue = subRes.giftSignResult.giftValue || '5000';
                      sub.giftSignerName = subRes.giftSignResult.signerName || sub.contactName || '';
                      sub.giftSignerPhone = subRes.giftSignResult.signerPhone || sub.phone || '';
                      sub.giftStyleLabel = subRes.giftSignResult.styleLabel || '';
                    }
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
            if (isMetrixSeoul) {
              if (result.alreadyCompleted) {
                biz.quotaStatus = 'completed';
                biz.status = '완료(100%)';
                biz.progressText = '완료(100%)';
                biz.progressPct = 100;
              } else {
                biz.quotaStatus = 'pilot_done';
                biz.status = '동의서대기(99%/Step115)';
                biz.progressText = '응답중(99%)';
                biz.progressPct = 99;
              }
              biz.completedAt = new Date().toISOString();
              if (result.submittedAnswers && Object.keys(result.submittedAnswers).length > 0) {
                biz.submittedAnswers = result.submittedAnswers;
              }
              try {
                persistSeoulPanelQuotaDatabase({ quotaDatabase: quotaDb });
                const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
                buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
                await syncSeoulPanelAnswersToGoogleSheet({
                  quotaDatabase: quotaDb,
                  sheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL
                });
              } catch (exErr) {
                logger.warn(`[서울시 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
              }
              logger.success(`🎉 [서울시 소상공인 패널 배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" (resid=${biz.resid}) ${biz.status} 달성 및 구글 시트 자동 기록 완료!`);
            } else if (isGallupReturnFarm) {
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
                persistGlobalriQuotaDatabase({ quotaDatabase: quotaDb });
                const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
                buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
                await syncGlobalriAnswersToGoogleSheet({ quotaDatabase: quotaDb, pullFromSeolmoon: false });
              } catch (exErr) {
                logger.warn(`[성인문해능력조사 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
              }
              logger.success(`🎉 [성인문해능력조사 배치 ${i + 1}/${targets.length} 완료] "${biz.respondentName || biz.companyName}" (UID: ${biz.memberUid || biz.uid}) ${biz.status} 달성 및 구글시트 갱신 완료!`);
            } else if (isHrcEnergy) {
              if (!biz.substitutedByUid) {
                biz.quotaStatus = (result.status === 'stopped_at_review' || safetyGuard) ? 'pilot_done' : 'completed';
                biz.status = (result.status === 'stopped_at_review' || safetyGuard) ? '검증대기(91%)' : '완료';
                biz.progress = (result.status === 'stopped_at_review' || safetyGuard) ? '91%' : '100%';
                biz.surveyCompleted = (biz.quotaStatus === 'completed') ? '완료' : '대기';
                biz.completedAt = new Date().toISOString();
                biz.capturedSteps = result.capturedSteps;
                if (result.giftSignResult?.ok) {
                  biz.giftSigned = true;
                  biz.giftBrand = result.giftSignResult.giftBrand || '신세계';
                  biz.giftValue = result.giftSignResult.giftValue || '5000';
                  biz.giftSignerName = result.giftSignResult.signerName || biz.contactName || '';
                  biz.giftSignerPhone = result.giftSignResult.signerPhone || biz.phone || '';
                  biz.giftStyleLabel = result.giftSignResult.styleLabel || '';
                }
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
              if (result.phoneUpdated && result.updatedPhone) {
                biz.serverPhone = result.updatedPhone;
                biz.phone = result.updatedPhone;
                biz.phoneNeedsSync = false;
              }
              biz.completedAt = new Date().toISOString();
              biz.capturedSteps = result.capturedSteps;
              logger.success(`🎉 [메트릭스 배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" (UID: ${biz.uid}) ${biz.quotaStatus} 달성!`);
            } else {
              biz.quotaStatus = safetyGuard ? 'pilot_done' : 'completed';
              biz.completedAt = new Date().toISOString();
              biz.capturedSteps = result.capturedSteps;
            }

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
            } else if (!isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
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

            if (!isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
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
            campaignId: campaign.id,
            quotaDatabase: quotaDb
          });
          await new Promise(r => setTimeout(r, 1000));
        }

        const checkPool = isHrcEnergy
          ? quotaDb.filter(b => b.selectionType === '선정')
          : quotaDb;
        const allQuotasFinished = checkPool.length > 0 && checkPool.every(b =>
          b.isClosedBiz ||
          b.quotaStatus === 'excluded' ||
          b.quotaStatus === 'completed' ||
          b.quotaStatus === 'pilot_done' ||
          b.status === '완료' ||
          b.status === '조사완료' ||
          b.substitutedByUid ||
          String(b.quotaStatus || '').includes('98%') ||
          String(b.quotaStatus || '').includes('99%')
        );
        const nextCampaignStatus = allQuotasFinished ? 'completed' : 'ready';

        finishCampaignTask(campaign.id);
        CampaignStore.updateCampaign(campaign.id, { status: nextCampaignStatus });
        if (allQuotasFinished) {
          logger.success(`🎉 [배치 자동화 완료] 캠페인 "${campaign.title}"의 모든 연속 설문이 완료되었습니다!`);
        } else {
          logger.success(`🎉 [선택 배치 완료] 캠페인 "${campaign.title}" 선택 대상 ${targets.length}건 실행이 완료되었습니다! (잔여 쿼터 대기 중)`);
        }
        logger.broadcast({
          type: 'BATCH_COMPLETED',
          campaignId: campaign.id
        });
      } catch (err) {
        finishCampaignTask(campaign.id);
        logger.error('[배치 실행 중 오류]', err);
        CampaignStore.updateCampaign(campaign.id, { status: 'ready' });
      }
    })());
  });

  // [3-3] 특정 쿼터 단독 1건 테스트 실행
  app.post('/api/campaigns/:id/run-single', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const canStart = checkCanStartCampaignTask(campaign);
    if (!canStart.ok) {
      logger.warn(`[개별 쿼터 실행 차단] ${canStart.error}`);
      return res.status(409).json({ error: canStart.error });
    }

    const { quotaIndex, safetyGuard = true } = req.body;
    const quotaDb = campaign.quotaDatabase || [];
    const targetBiz = quotaDb.find(b => (b.index || b.seq) === quotaIndex);

    if (!targetBiz) {
      return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
    }

    if (targetBiz.isClosedBiz || String(targetBiz.bizStatus || '').includes('폐업') || targetBiz.quotaStatus === 'excluded') {
      return res.status(400).json({
        error: `[폐업 제외 대상] "${targetBiz.companyName}" (사업자번호: ${targetBiz.bizNumber || '-'})는 폐업 제외 대상이므로 설문 입력을 진행할 수 없습니다.`
      });
    }

    const isMetrix = (campaign.surveyType === 'metrix_panel');
    const isKona = (campaign.surveyType === 'kona_youth');
    const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
    const isMetrixSeoul = (campaign.surveyType === 'metrix_seoul_panel');
    const targetUrl = targetBiz.slotUrl || targetBiz.surveyUrl || targetBiz.householdUrl || (isMetrixSeoul ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${targetBiz.resid}&fwid=S21401by41s3${targetBiz.accountKey || targetBiz.akey || '2010'}` : (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${targetBiz.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : ''))));
    if (!targetUrl) {
      return res.status(400).json({
        error: `[${targetBiz.companyName}] 쿼터에 설문 URL이 매핑되지 않았습니다.`
      });
    }

    startCampaignTask(campaign, 'single', { current: 0, total: 1, percent: 0 });
    targetBiz.quotaStatus = 'running';
    CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'running' });
    logger.broadcast({
      type: 'QUOTA_UPDATED',
      campaignId: campaign.id,
      quotaDatabase: quotaDb
    });

    const slotNotice = targetBiz.slotIndex ? ` [Kstat 슬롯 #${targetBiz.slotIndex} ${targetBiz.slotExtra || ''}]` : '';
    logger.info(`[개별 쿼터 테스트] "${targetBiz.respondentName || targetBiz.buildingName || targetBiz.companyName}" (순번: #${targetBiz.index || quotaIndex})${slotNotice} 1건 실행 시작...`);

    res.json({
      success: true,
      message: `"${targetBiz.respondentName || targetBiz.buildingName || targetBiz.companyName}" 1건 실행이 시작되었습니다.`,
      targetBiz
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      try {
        const result = isMetrix
          ? await runMetrixSurvey({
              surveyUrl: targetUrl,
              slotData: targetBiz,
              policy: campaign.metrixPolicy || campaign.masterBaseline?.policy || {},
              quotaIndex: targetBiz.index || quotaIndex,
              pilotMode: true,
              safetyGuard: true,
              reportDir: path.join(reportsDir, campaign.id, `metrix_item_${targetBiz.index || quotaIndex}_${targetBiz.uid || ''}`),
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: targetBiz.index,
                  ...info
                });
              }
            })
          : (isMetrixSeoul
          ? await runMetrixSeoulSurvey({
              campaign,
              policy: campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || {},
              slotUrl: targetUrl,
              slotData: targetBiz,
              mode: 'pilot',
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: targetBiz.index,
                  ...info
                });
              }
            })
          : (isGallupReturnFarm
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
                    }))))));

        if (result?.success) {
          if (isMetrix) {
            targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? '진행중(98%)' : 'completed';
            targetBiz.status = (result.status === 'stopped_at_review') ? '진행중(98%)' : '완료';
            if (result.phoneUpdated && result.updatedPhone) {
              targetBiz.serverPhone = result.updatedPhone;
              targetBiz.phone = result.updatedPhone;
              targetBiz.phoneNeedsSync = false;
            }
          } else if (isMetrixSeoul) {
            if (result.alreadyCompleted) {
              targetBiz.quotaStatus = 'completed';
              targetBiz.status = '완료(100%)';
              targetBiz.progressText = '완료(100%)';
              targetBiz.progressPct = 100;
            } else {
              targetBiz.quotaStatus = 'pilot_done';
              targetBiz.status = '동의서대기(99%/Step115)';
              targetBiz.progressText = '응답중(99%)';
              targetBiz.progressPct = 99;
            }
            targetBiz.completedAt = new Date().toISOString();
            if (result.submittedAnswers && Object.keys(result.submittedAnswers).length > 0) {
              targetBiz.submittedAnswers = result.submittedAnswers;
            }
            try {
              persistSeoulPanelQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
              buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncSeoulPanelAnswersToGoogleSheet({
                quotaDatabase: quotaDb,
                sheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL
              });
            } catch (exErr) {
              logger.warn(`[서울시 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
          } else if (isGallupReturnFarm) {
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
              persistGlobalriQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
              buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncGlobalriAnswersToGoogleSheet({ quotaDatabase: quotaDb, pullFromSeolmoon: false });
            } catch (exErr) {
              logger.warn(`[성인문해능력조사 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
          } else if (isHrcEnergy) {
            targetBiz.quotaStatus = (result.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
            targetBiz.status = (result.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
            targetBiz.progress = (result.status === 'stopped_at_review') ? '91%' : '100%';
            targetBiz.surveyCompleted = (targetBiz.quotaStatus === 'completed') ? '완료' : '대기';
            if (result.giftSignResult?.ok) {
              targetBiz.giftSigned = true;
              targetBiz.giftBrand = result.giftSignResult.giftBrand || '신세계';
              targetBiz.giftValue = result.giftSignResult.giftValue || '5000';
              targetBiz.giftSignerName = result.giftSignResult.signerName || targetBiz.contactName || '';
              targetBiz.giftSignerPhone = result.giftSignResult.signerPhone || targetBiz.phone || '';
              targetBiz.giftStyleLabel = result.giftSignResult.styleLabel || '';
            }
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

          const evalUrl = (!isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul) ? (targetBiz.evalUrl || (targetBiz.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${targetBiz.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null)) : null;
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

          if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul) {
            await syncKstatSlotStatus({
              pridSel: '2026070802',
              idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
              kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
              gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
              srt: 1
            }).catch(() => {});
          }

          if (!isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul && targetBiz.evalStatus === 'completed') {
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

        finishCampaignTask(campaign.id);
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId: campaign.id,
          quotaDatabase: quotaDb
        });
      } catch (err) {
        finishCampaignTask(campaign.id);
        targetBiz.quotaStatus = 'error';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId: campaign.id,
          quotaDatabase: quotaDb
        });
      }
    })());
  });

  // 작업 중지 요청 (특정 campaignId 지정 시 해당 캠페인만 중지, 미지정 시 활성 배치 전체 중지)
  app.post('/api/survey/stop', (req, res) => {
    const targetCampId = req.body?.campaignId || req.query?.campaignId || null;
    const targetsToStop = targetCampId
      ? [targetCampId]
      : getActiveTasksList().map(t => t.campaignId);

    for (const cid of targetsToStop) {
      finishCampaignTask(cid);
      const camp = CampaignStore.getCampaignById(cid);
      if (camp && Array.isArray(camp.quotaDatabase)) {
        camp.quotaDatabase.forEach(q => {
          if (q.quotaStatus === 'running') q.quotaStatus = 'ready';
        });
        CampaignStore.updateCampaign(cid, { status: 'ready', quotaDatabase: camp.quotaDatabase });
      } else if (camp) {
        CampaignStore.updateCampaign(cid, { status: 'ready' });
      }
      logger.runWithCampaignContext(cid, () => {
        logger.warn('설문 자동화 작업 중지 요청을 수신했습니다.');
      });
    }

    res.json({
      message: '작업 중지 신호를 보냈습니다.',
      stoppedCampaignIds: targetsToStop,
      activeCount: getActiveTasksList().length
    });
  });

  // 현재 작업 상태 조회 (최대 2개 동시 가동 이중화 지원)
  app.get('/api/survey/status', (req, res) => {
    const queryCampId = req.query?.campaignId || null;
    const activeTasks = getActiveTasksList();
    const matchedTask = queryCampId
      ? activeTasks.find(t => t.campaignId === queryCampId)
      : (activeTasks[0] || null);

    res.json({
      isRunning: queryCampId ? Boolean(matchedTask) : activeTasks.length > 0,
      campaignId: matchedTask ? matchedTask.campaignId : (activeTasks[0]?.campaignId || null),
      progress: matchedTask ? matchedTask.progress : (activeTasks[0]?.progress || { current: 0, total: 0, percent: 0 }),
      startTime: matchedTask ? matchedTask.startTime : (activeTasks[0]?.startTime || null),
      activeCount: activeTasks.length,
      maxConcurrency: MAX_CONCURRENT_TASKS,
      runningCampaignIds: activeTasks.map(t => t.campaignId),
      runningTasks: activeTasks
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
}
