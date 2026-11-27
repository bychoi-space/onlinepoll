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
  AGRIWORK_DEFAULT_PORTAL_URL,
  runGallupAgriworkSurvey
} from '../engine/gallup-agriwork-runner.js';
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
  GYEONGGI_PANEL_DEFAULT_GSHEET_URL,
  buildGyeonggiPanelAnswersExcel,
  persistGyeonggiPanelQuotaDatabase,
  syncGyeonggiPanelAnswersToGoogleSheet
} from '../utils/gyeonggi-panel-answer-excel.js';
import {
  KBPI_DEFAULT_URL,
  runKmacKbpiSurvey,
  scanKmacKbpiBrandsBatch
} from '../engine/kmac-kbpi-runner.js';
import {
  KBPI_DEFAULT_SHEET_ID,
  KBPI_DEFAULT_SHEET_URL,
  pullKbpiSheetOverrides,
  persistKbpiQuotaDatabase,
  syncKbpiProgressToGoogleSheet
} from '../utils/kmac-kbpi-sheet-sync.js';
import {
  MAX_CONCURRENT_TASKS,
  getActiveTasksList,
  isCampaignTaskRunning,
  checkCanStartCampaignTask,
  startCampaignTask,
  stopCampaignTask,
  stopAllCampaignTasks,
  finishCampaignTask
} from '../services/task-manager.js';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';
import { logger } from '../utils/logger.js';

export function registerExecutionRoutes({
  app,
  quotasDir,
  reportsDir
}) {
  function persistGallupAgriworkQuotaDatabase({ quotaDatabase = [] }) {
    const agriPath = path.join(quotasDir, 'quota_gallup_agriwork_2025.json');
    if (!fs.existsSync(agriPath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(agriPath, 'utf-8'));
      parsed.data = quotaDatabase;
      parsed.updatedAt = new Date().toISOString();
      writeJsonAtomicSync(agriPath, parsed);
    } catch (err) {
      logger.warn(`[농업고용인력 로컬 쿼터 JSON 저장 경고] ${err.message}`);
    }
  }

  function findHrcPhoneConflict(targetSlot) {
    const rawDigits = String(targetSlot?.phone || '').replace(/\D/g, '');
    if (!rawDigits || rawDigits.length < 9) {
      return { conflict: false };
    }
    const targetUid = String(targetSlot?.uid || '').trim();
    const allCamps = CampaignStore.getAllCampaigns().filter(c => c.surveyType === 'hrc_energy');
    for (const c of allCamps) {
      for (const other of (c.quotaDatabase || [])) {
        const otherUid = String(other?.uid || '').trim();
        if (!otherUid || otherUid === targetUid) continue;
        const isOtherActiveOrDone =
          other.quotaStatus === 'completed' ||
          other.quotaStatus === 'pilot_done' ||
          other.quotaStatus === 'running' ||
          other.status === '완료' ||
          other.siteStatus === '완료' ||
          other.progress === '100%' ||
          Boolean(other.giftSigned);
        if (!isOtherActiveOrDone) continue;
        const otherPhones = [other.phone, other.giftSignerPhone]
          .map(p => String(p || '').replace(/\D/g, ''))
          .filter(Boolean);
        if (otherPhones.includes(rawDigits)) {
          return {
            conflict: true,
            otherUid,
            otherAccount: other.surveyorId || c.loginId || c.id
          };
        }
      }
    }
    return { conflict: false };
  }

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
          writeJsonAtomicSync(reportPath, sessionResult);

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

    const { policy = {}, quotaIndex = 1, safetyGuard = true } = req.body;
    const quotaDb = campaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      return res.status(400).json({ error: '캠페인에 구축된 조사 쿼터가 없습니다.' });
    }

    const isMetrixCampaign = (campaign.surveyType === 'metrix_panel');
    const isMetrixSeoulCampaign = (campaign.surveyType === 'metrix_seoul_panel');
    const isKonaCampaign = (campaign.surveyType === 'kona_youth');
    const isGlobalriLiteracyCampaign = (campaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarmCampaign = (campaign.surveyType === 'gallup_return_farm');
    const isGallupAgriworkCampaign = (campaign.surveyType === 'gallup_agriwork');
    const isKmacKbpiCampaign = (campaign.surveyType === 'kmac_kbpi');

    if (isKmacKbpiCampaign) {
      try {
        const synced = await pullKbpiSheetOverrides({
          quotaDatabase: quotaDb,
          sheetId: KBPI_DEFAULT_SHEET_ID,
          quotasDir
        });
        if (synced?.quotaDatabase?.length > 0) {
          quotaDb.splice(0, quotaDb.length, ...synced.quotaDatabase);
        }
      } catch (pullWarn) {
        logger.warn(`[K-BPI 파일럿 사전 시트 동기화 경고] ${pullWarn.message}`);
      }
    }

    const isPilotTargetStrictlyDone = (b) => b.isClosedBiz || b.quotaStatus === 'excluded' || b.quotaStatus === 'completed' || (!/직전|대기/.test(String(b.status || '')) && String(b.status || '').includes('완료')) || (isMetrixCampaign && String(b.status || '').includes('98%'));
    let targetBiz = quotaDb.find(b => Number(b.index || b.seq) === Number(quotaIndex)) || quotaDb[Math.max(0, quotaIndex - 1)];
    if ((isMetrixCampaign || isKonaCampaign || isGlobalriLiteracyCampaign || isGallupReturnFarmCampaign || isGallupAgriworkCampaign || isMetrixSeoulCampaign || isKmacKbpiCampaign) && targetBiz && isPilotTargetStrictlyDone(targetBiz)) {
      const firstReady = quotaDb.find(b => !isPilotTargetStrictlyDone(b));
      if (firstReady) targetBiz = firstReady;
    }
    if (!targetBiz) {
      return res.status(400).json({ error: '실행 대상 쿼터를 찾을 수 없습니다.' });
    }

    const targetUrl = targetBiz.surveyUrl || targetBiz.slotUrl || targetBiz.householdUrl || (isGallupAgriworkCampaign ? AGRIWORK_DEFAULT_PORTAL_URL : (isKmacKbpiCampaign ? KBPI_DEFAULT_URL : (isMetrixSeoulCampaign ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${targetBiz.resid}&fwid=S21401by41s3${targetBiz.accountKey || targetBiz.akey || '2010'}` : (isGallupReturnFarmCampaign ? GALLUP_20263603_DEFAULT_URL : (isKonaCampaign ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : (isGlobalriLiteracyCampaign ? 'https://gift.globalri.it/login' : ''))))));
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
      logger.info(`[파일럿 검증 시작] 캠페인 "${campaign.title}" ➔ 대상: "${targetBiz.companyName}" (${targetBiz.uid || targetBiz.idx || targetBiz.bizNumber || ''}) (슬롯: ${targetBiz.slotIndex ? '#' + targetBiz.slotIndex : '단독'} · 가동 슬롯: ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`);
      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: quotaDb
      });
    });

    const kbpiStopStep = campaign.policy?.pilotStopAtStep || campaign.guidelineConfig?.kbpiPolicy?.pilotStopAtStep || 'FINAL_GATE';
    res.json({
      success: true,
      message: isKmacKbpiCampaign
        ? `"${targetBiz.name || targetBiz.companyName}" K-BPI 단건 실행이 시작되었습니다. (${kbpiStopStep === 'Q4' ? '문항 4 도달 시 일시 정지' : '완료 직전 ZQ6 안전 대기'})`
        : `"${targetBiz.companyName}" 파일럿 시뮬레이션이 시작되었습니다.`,
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
        const isGallupAgriwork = (campaign.surveyType === 'gallup_agriwork');
        const isKmacKbpi = (campaign.surveyType === 'kmac_kbpi');
        let result;

        if (isGallupAgriwork) {
          const agriPol = campaign.gallupAgriworkPolicy || campaign.masterBaseline?.policy || policy || {};
          const agriPilotSafetyGuard = (req.body.safetyGuard !== undefined) ? Boolean(req.body.safetyGuard) : true;
          logger.info(`[농업고용인력 파일럿 실행] 러너 가동: "${targetBiz.respondentName || targetBiz.name || targetBiz.companyName}" (ID: ${targetBiz.uid || targetBiz.listId}, ${targetBiz.surveySubTypeLabel || '경영체'})`);
          result = await runGallupAgriworkSurvey({
            campaign,
            slotData: targetBiz,
            policy: agriPol,
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: true,
            safetyGuard: agriPilotSafetyGuard,
            reportDir: path.join(reportsDir, campaign.id, `agriwork_item_${targetBiz.index || quotaIndex}_${targetBiz.uid || targetBiz.listId || ''}`),
            onProgress: (info) => {
              logger.info(`[농업고용인력 파일럿 - ${info.step}] ${info.message}`);
              logger.broadcast({
                type: 'PILOT_PROGRESS',
                campaignId: campaign.id,
                quotaIndex: targetBiz.index,
                ...info
              });
            }
          });
        } else if (isKmacKbpi) {
          logger.info(`[K-BPI 파일럿 실행] 러너 가동: "${targetBiz.name || targetBiz.companyName}" (고유번호: ${targetBiz.uid}, ${targetBiz.region}/${targetBiz.gender}/${targetBiz.ageGroup})`);
          const kbpiPol = campaign.kbpiPolicy || campaign.masterBaseline?.policy || policy || {};
          result = await runKmacKbpiSurvey({
            campaign,
            slotData: targetBiz,
            policy: kbpiPol,
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: true,
            safetyGuard: true,
            onProgress: (info) => {
              logger.info(`[K-BPI 파일럿 - ${info.step}] ${info.message}`);
              logger.broadcast({
                type: 'PILOT_PROGRESS',
                campaignId: campaign.id,
                quotaIndex: targetBiz.index,
                ...info
              });
            }
          });
        } else if (isMetrixSeoul) {
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
          const phoneCheck = findHrcPhoneConflict(targetBiz);
          if (phoneCheck.conflict) {
            throw new Error(`[중복 연락처 차단] UID ${targetBiz.uid}의 전화번호가 이미 완료/진행된 타 건물(계정 ${phoneCheck.otherAccount} · UID ${phoneCheck.otherUid})과 중복됩니다.`);
          }
          logger.info(`[에너지총조사 파일럿 실행] 건물 부문 전용 러너 가동: "${targetBiz.buildingName || targetBiz.companyName}" (UID: ${targetBiz.uid})`);
          const hrcPol = campaign.hrcEnergyPolicy || policy || {};
          const hrcSafetyGuard = (req.body.safetyGuard !== undefined) ? Boolean(req.body.safetyGuard) : false;
          result = await runHrcEnergySurvey({
            slotData: targetBiz,
            policy: hrcPol,
            loginId: targetBiz.surveyorId || campaign.loginId || '700275',
            loginPw: campaign.loginPw || targetBiz.surveyorId || campaign.loginId || '700275',
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: Boolean(hrcSafetyGuard),
            safetyGuard: hrcSafetyGuard,
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
          logger.info(`[메트릭스 파일럿 실행] 메트릭스 전용 러너 가동: "${targetBiz.companyName}" (UID: ${targetBiz.uid}, 보증지원여부: ${targetBiz.guaranteeSupport || '-'})`);
          const metrixPol = campaign.metrixPolicy || campaign.masterBaseline?.policy || policy || {};
          result = await runMetrixSurvey({
            surveyUrl: targetUrl,
            slotData: targetBiz,
            policy: metrixPol,
            quotaIndex: targetBiz.index || quotaIndex,
            pilotMode: true,
            safetyGuard: true,
            haltOnBlock: true,
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
          if (isGallupAgriwork) {
            const isCompletedNow = (result.status === 'completed');
            targetBiz.quotaStatus = isCompletedNow ? 'completed' : 'pilot_done';
            targetBiz.status = isCompletedNow ? '완료' : '완료직전 대기 (Page LAST)';
            targetBiz.progress = isCompletedNow ? '100%' : '99% (Page LAST)';
            targetBiz.surveyCompleted = isCompletedNow ? '완료' : '대기';
            if (result.phone) targetBiz.phone = result.phone;
            targetBiz.pilotAt = new Date().toISOString();
            if (isCompletedNow) targetBiz.completedAt = targetBiz.pilotAt;
            targetBiz.capturedSteps = result.capturedSteps;
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              targetBiz.submittedAnswers = result.submittedAnswers;
            }
            persistGallupAgriworkQuotaDatabase({ quotaDatabase: quotaDb });
            logger.success(`🎉 [농업고용인력 파일럿 완료] "${targetBiz.respondentName || targetBiz.name}" (${targetBiz.uid}) ${targetBiz.status} 달성!`);
          } else if (isKmacKbpi) {
            targetBiz.quotaStatus = result.quotaStatus || (result.completed ? 'completed' : (result.stoppedAt === 'Q4' ? 'q4_wait' : 'pilot_done'));
            targetBiz.status = result.statusLabel || (result.completed ? '완료' : '완료직전 대기(ZQ6)');
            targetBiz.progress = result.progress || (result.completed ? '100%' : '99%');
            if (Array.isArray(result.categoryConfigs)) {
              targetBiz.categoryConfigs = result.categoryConfigs;
            }
            if (result.surveyDistrict) targetBiz.surveyDistrict = result.surveyDistrict;
            if (result.surveyDong) targetBiz.surveyDong = result.surveyDong;
            targetBiz.pilotAt = new Date().toISOString();
            try {
              persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
              const kbpiPol = campaign.kbpiPolicy || campaign.masterBaseline?.policy || policy || {};
              if (kbpiPol.autoSyncGoogleSheet !== false) {
                syncKbpiProgressToGoogleSheet({
                  quotaDatabase: quotaDb,
                  sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
                  quotasDir
                }).catch(syncErr => logger.warn(`[K-BPI 구글시트 기록 경고] ${syncErr.message}`));
              }
            } catch (exErr) {
              logger.warn(`[K-BPI 로컬 쿼터 저장 경고] ${exErr.message}`);
            }
            logger.success(`🎉 [K-BPI 파일럿 완료] "${targetBiz.name || targetBiz.companyName}" (${targetBiz.uid}) ${targetBiz.status} 달성 및 시트 동기화 큐 등록!`);
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
            const isStoppedReview = (result.status === 'stopped_at_review');
            targetBiz.quotaStatus = isStoppedReview ? 'pilot_done' : 'completed';
            targetBiz.status = isStoppedReview ? '검증대기(91%)' : '완료';
            targetBiz.progress = isStoppedReview ? '91%' : '100%';
            targetBiz.surveyCompleted = isStoppedReview ? '대기' : '완료';
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
            if (result.phoneUpdated && result.updatedPhone) {
              targetBiz.serverPhone = result.updatedPhone;
              targetBiz.phone = result.updatedPhone;
              targetBiz.phoneNeedsSync = false;
            }
            targetBiz.pilotAt = new Date().toISOString();
            targetBiz.capturedSteps = result.capturedSteps;
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              targetBiz.submittedAnswers = result.submittedAnswers;
            }
            try {
              persistGyeonggiPanelQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, 'gyeonggi_panel_622_answers.xlsx');
              buildGyeonggiPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncGyeonggiPanelAnswersToGoogleSheet({
                quotaDatabase: quotaDb,
                sheetUrl: campaign.googleSheetUrl || GYEONGGI_PANEL_DEFAULT_GSHEET_URL
              });
            } catch (exErr) {
              logger.warn(`[경기도 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
            logger.success(`🎉 [메트릭스 파일럿 성공] "${targetBiz.companyName}" (UID: ${targetBiz.uid}) 메트릭스 설문 시뮬레이션 완료 (${targetBiz.quotaStatus}) 및 구글 스프레드시트('오토서베이_응답내역') 기록 완료!`);
          } else {
            targetBiz.quotaStatus = 'pilot_done';
            targetBiz.pilotAt = new Date().toISOString();
            targetBiz.capturedSteps = result.capturedSteps;
          }

          if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul && isAssoc) {
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
                  logger.success(`🎉 [파일럿 2단계 완료] "${targetBiz.marketName || targetBiz.companyName}" 상인회 조사원 평가 작성 100% 완료!`);
                  await syncKstatSlotStatus({
                    pridSel: '2026070801',
                    idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
                    kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
                    gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
                    srt: 2
                  }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                }
              } catch (evalErr) {
                logger.warn(`[파일럿 평가 경고] 상인회 조사원 평가 연계 중 예외: ${evalErr.message}`);
              }
            }
          } else if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
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
                  }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                }
              } catch (evalErr) {
                logger.warn(`[파일럿 평가 경고] 조사원 평가 연계 중 예외: ${evalErr.message}`);
              }
            }
          }

          if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
            const targetPridSel = isAssoc ? '2026070801' : (campaign.targetPrid || '2026070802');
            await syncKstatSlotStatus({
              pridSel: targetPridSel,
              idSel: targetBiz.idSel || targetBiz.kstatMeta?.idSel,
              kid: targetBiz.kid || targetBiz.kstatMeta?.kid,
              gid: targetBiz.gid || targetBiz.kstatMeta?.gid || '0',
              srt: 1
            }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));

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
              }).catch(err => {
                logger.warn(`[실행 후처리 경고] ${err.message}`);
                return { success: false };
              });
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
            bizName: targetBiz.name || targetBiz.companyName,
            status: targetBiz.status || '',
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
    const isGallupAgriwork = (campaign.surveyType === 'gallup_agriwork');
    const isKmacKbpi = (campaign.surveyType === 'kmac_kbpi');

    if (isKmacKbpi) {
      try {
        const synced = await pullKbpiSheetOverrides({
          quotaDatabase: quotaDb,
          sheetId: KBPI_DEFAULT_SHEET_ID,
          quotasDir
        });
        if (synced?.quotaDatabase?.length > 0) {
          quotaDb.splice(0, quotaDb.length, ...synced.quotaDatabase);
        }
      } catch (pullWarn) {
        logger.warn(`[K-BPI 배치 사전 시트 동기화 경고] ${pullWarn.message}`);
      }
    }

    const effectivePolicy = isGallupAgriwork
      ? (campaign.gallupAgriworkPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
      : (isKmacKbpi
        ? (campaign.kbpiPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
        : (isMetrixSeoul
          ? (campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
          : (isGallupReturnFarm
            ? (campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
            : (isGlobalriLiteracy
              ? (campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || policy || {})
              : (isHrcEnergy
                ? (campaign.hrcEnergyPolicy || policy || {})
                : (isKona
                  ? (campaign.konaPolicy || policy || {})
                  : (isMetrix ? (campaign.metrixPolicy || policy || {}) : (isAssoc ? (campaign.assocPolicy || policy || {}) : policy))))))));

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

    const isItemStrictlyCompleted = (b) => {
      if (b.quotaStatus === 'completed' || b.memberStatus === '완료' || b.substitutedByUid || b.surveyCompleted === '완료' || b.surveyCompleted === true) {
        return true;
      }
      const st = String(b.status || '').trim();
      if (!st) return false;
      if (/스캔완료|직전|대기|수기대기/.test(st)) return false;
      return st.includes('완료');
    };

    const targets = quotaDb.filter(b => {
      const idx = Number(b.index || b.seq || b.slotIndex || 1);
      if (b.isClosedBiz || String(b.bizStatus || '').includes('폐업') || b.quotaStatus === 'excluded') {
        return false;
      }
      if (selectedIndexSet) {
        if (!selectedIndexSet.has(idx)) return false;
        if (isItemStrictlyCompleted(b)) return false;
        return true;
      }
      if (idx < startIndex) return false;
      if (skipSlotIndices.includes(idx)) return false;
      if ((isGallupAgriwork || isKmacKbpi || isMetrix || isMetrixSeoul || isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm) && (b.uid || b.resid || b.memberUid || b.idx || b.id) && skipSlotUids.includes(String(b.memberUid || b.resid || b.uid || b.idx || b.id))) return false;
      if (isHrcEnergy && effectivePolicy.onlySelectedByDefault !== false && b.selectionType && b.selectionType !== '선정') {
        return false;
      }
      if (isItemStrictlyCompleted(b)) return false;
      if ((isGallupReturnFarm || isMetrixSeoul) && (b.quotaStatus === 'pilot_done' || String(b.status || '').includes('동의서대기'))) return false;
      if (skipCompletedSlots && isItemStrictlyCompleted(b)) {
        return false;
      }
      if (isMetrix) {
        const isOver = String(b.status || '').includes('인원초과') || String(b.rawMeta?.COMPLETE || '').toUpperCase() === 'OVER';
        if (b.isClosedBiz || String(b.bizStatus || '').includes('폐업') || b.quotaStatus === 'excluded' || isOver) {
          return false;
        }
        const isWait98Or99 = /98%|99%/.test(String(b.quotaStatus || '')) || /98%|99%/.test(String(b.status || ''));
        if (safetyGuard && isWait98Or99) {
          return false;
        }
      } else {
        if (safetyGuard && b.quotaStatus === 'pilot_done' && !(isKmacKbpi && /문항4/.test(String(b.status || '')))) return false;
      }
      return true;
    });
    if (targets.length === 0) {
      return res.status(400).json({ error: '연속 실행할 잔여 쿼터가 없습니다. (이미 완료되었거나 안전 대기 상태임)' });
    }

    const unmapped = (isGallupAgriwork || isKmacKbpi || isKona || isHrcEnergy || isGlobalriLiteracy || isGallupReturnFarm || isMetrixSeoul) ? [] : targets.filter(b => !b.slotUrl && !b.surveyUrl);
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
      message: `선택 쿼터 ${targets.length}건 배치 자동화가 시작되었습니다. (동시 실행 슬롯 ${getActiveTasksList().length}/${MAX_CONCURRENT_TASKS})`,
      totalTargets: targets.length
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      let stoppedByUser = false;
      let haltedByBlock = false;
      let haltedReason = '';
      try {
        for (let i = 0; i < targets.length; i++) {
          if (!isCampaignTaskRunning(campaign.id)) {
            stoppedByUser = true;
            logger.warn(`[배치 일시중지] 사용자에 의해 배치가 안전하게 중지되었습니다.`);
            break;
          }
          batchTask.progress = {
            current: i,
            total: targets.length,
            percent: Math.round((i / Math.max(1, targets.length)) * 100)
          };

          const biz = targets[i];
          const bizUrl = biz.slotUrl || biz.surveyUrl || (isGallupAgriwork ? AGRIWORK_DEFAULT_PORTAL_URL : (isKmacKbpi ? KBPI_DEFAULT_URL : (isMetrixSeoul ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${biz.resid}&fwid=S21401by41s3${biz.accountKey || biz.akey || '2010'}` : (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${biz.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : ''))))));
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
            if (isGallupAgriwork) {
              const agriBatchSafetyGuard = (req.body.safetyGuard !== undefined)
                ? Boolean(req.body.safetyGuard)
                : Boolean(effectivePolicy.safetyGuard ?? (effectivePolicy.submitComplete === false));
              result = await runGallupAgriworkSurvey({
                campaign,
                slotData: biz,
                policy: effectivePolicy,
                quotaIndex: biz.index || (i + startIndex),
                pilotMode: false,
                safetyGuard: agriBatchSafetyGuard,
                reportDir: path.join(reportsDir, campaign.id, `agriwork_item_${biz.index || (i + startIndex)}_${biz.uid || biz.listId || ''}`),
                onProgress: (info) => {
                  logger.info(`[농업고용인력 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
            } else if (isKmacKbpi) {
              result = await runKmacKbpiSurvey({
                campaign,
                slotData: biz,
                policy: effectivePolicy,
                quotaIndex: biz.index || (i + startIndex),
                pilotMode: false,
                safetyGuard: Boolean(safetyGuard),
                onProgress: (info) => {
                  logger.info(`[K-BPI 배치 #${biz.index || (i + startIndex)}] [${info.step}] ${info.message}`);
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
            } else if (isMetrixSeoul) {
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
              const bizPhoneCheck = findHrcPhoneConflict(biz);
              if (bizPhoneCheck.conflict) {
                throw new Error(`[중복 연락처 차단] UID ${biz.uid}의 전화번호가 이미 완료/진행된 타 건물(계정 ${bizPhoneCheck.otherAccount} · UID ${bizPhoneCheck.otherUid})과 중복됩니다.`);
              }
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
                  .filter(s => {
                    if (s.selectionType !== '대체' || s.cellKey !== biz.cellKey) return false;
                    if (s.quotaStatus === 'completed' || s.quotaStatus === 'excluded' || s.status === '완료' || s.quotaStatus === 'error') return false;
                    if (s.phoneDuplicateWarning) return false;
                    const subDigits = String(s.phone || '').replace(/\D/g, '');
                    if (subDigits.length < 9) return false;
                    return !findHrcPhoneConflict(s).conflict;
                  })
                  .sort((a, b) => (a.cellPriority || 99) - (b.cellPriority || 99));

                for (const sub of subCandidates) {
                  logger.warn(`🔄 [선정➔대체 자동 승계] UID ${biz.uid} 오류 발생 ➔ 동일 표본층(${biz.cellKey}) 고유 연락처 보유 대체 후보 UID ${sub.uid} (${sub.buildingName || sub.roadAddress})로 자동 전환!`);
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
                    const isSubStoppedReview = (subRes.status === 'stopped_at_review' || safetyGuard);
                    sub.quotaStatus = isSubStoppedReview ? 'pilot_done' : 'completed';
                    sub.status = isSubStoppedReview ? '검증대기(91%)' : '완료';
                    sub.progress = isSubStoppedReview ? '91%' : '100%';
                    sub.surveyCompleted = isSubStoppedReview ? '대기' : '완료';
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
                    biz.status = isSubStoppedReview ? `대체검증대기(${sub.uid})` : `대체완료(${sub.uid})`;
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
                haltOnBlock: true,
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
            if (isGallupAgriwork) {
              const isCompletedNow = (result.status === 'completed');
              biz.quotaStatus = isCompletedNow ? 'completed' : 'pilot_done';
              biz.status = isCompletedNow ? '완료' : '완료직전 대기 (Page LAST)';
              biz.progress = isCompletedNow ? '100%' : '99% (Page LAST)';
              biz.surveyCompleted = isCompletedNow ? '완료' : '대기';
              if (result.phone) biz.phone = result.phone;
              biz.completedAt = new Date().toISOString();
              biz.capturedSteps = result.capturedSteps;
              if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
                biz.submittedAnswers = result.submittedAnswers;
              }
              persistGallupAgriworkQuotaDatabase({ quotaDatabase: quotaDb });
              logger.success(`🎉 [농업고용인력 배치 ${i + 1}/${targets.length} 완료] "${biz.respondentName || biz.name}" (${biz.uid} · ${biz.surveySubTypeLabel || '경영체'}) ${biz.status} 달성!`);
            } else if (isKmacKbpi) {
              biz.quotaStatus = result.quotaStatus || (result.completed ? 'completed' : 'pilot_done');
              biz.status = result.statusLabel || (result.completed ? '완료' : '검증대기(완료직전)');
              biz.progress = result.progress || (result.completed ? '100%' : '98%');
              if (Array.isArray(result.categoryConfigs)) {
                biz.categoryConfigs = result.categoryConfigs;
              }
              if (result.surveyDistrict) biz.surveyDistrict = result.surveyDistrict;
              if (result.surveyDong) biz.surveyDong = result.surveyDong;
              biz.completedAt = new Date().toISOString();
              try {
                persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
                if (effectivePolicy.autoSyncGoogleSheet !== false) {
                  await syncKbpiProgressToGoogleSheet({
                    quotaDatabase: quotaDb,
                    sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
                    quotasDir
                  }).catch(syncErr => logger.warn(`[K-BPI 배치 구글시트 기록 경고] ${syncErr.message}`));
                }
              } catch (exErr) {
                logger.warn(`[K-BPI 로컬 쿼터 저장 경고] ${exErr.message}`);
              }
              logger.success(`🎉 [K-BPI 배치 ${i + 1}/${targets.length} 완료] "${biz.name || biz.companyName}" (${biz.uid}, ${biz.region}/${biz.gender}/${biz.ageGroup}) ${biz.status} 달성!`);
            } else if (isMetrixSeoul) {
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
                const isStoppedReview = (result.status === 'stopped_at_review' || safetyGuard);
                biz.quotaStatus = isStoppedReview ? 'pilot_done' : 'completed';
                biz.status = isStoppedReview ? '검증대기(91%)' : '완료';
                biz.progress = isStoppedReview ? '91%' : '100%';
                biz.surveyCompleted = isStoppedReview ? '대기' : '완료';
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
              if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
                biz.submittedAnswers = result.submittedAnswers;
              }
              try {
                persistGyeonggiPanelQuotaDatabase({ quotaDatabase: quotaDb });
                const ansXlsxPath = path.join(quotasDir, 'gyeonggi_panel_622_answers.xlsx');
                buildGyeonggiPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
                await syncGyeonggiPanelAnswersToGoogleSheet({
                  quotaDatabase: quotaDb,
                  sheetUrl: campaign.googleSheetUrl || GYEONGGI_PANEL_DEFAULT_GSHEET_URL
                });
              } catch (exErr) {
                logger.warn(`[경기도 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
              }
              logger.success(`🎉 [메트릭스 배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" (UID: ${biz.uid}) ${biz.quotaStatus} 달성 및 구글 시트('오토서베이_응답내역') 기록 완료!`);
            } else {
              biz.quotaStatus = safetyGuard ? 'pilot_done' : 'completed';
              biz.completedAt = new Date().toISOString();
              biz.capturedSteps = result.capturedSteps;
            }

            if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul && isAssoc) {
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
                    }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                  }
                } catch (evalErr) {
                  logger.warn(`[배치 평가 경고] "${biz.marketName || biz.companyName}" 상인회 조사원 평가 연계 중 예외: ${evalErr.message}`);
                }
              } else {
                logger.success(`[상인회 배치 ${i + 1}/${targets.length} 완료] "${biz.marketName || biz.companyName}" 본 설문 완료!`);
              }
            } else if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
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
                    }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                  }
                } catch (evalErr) {
                  logger.warn(`[배치 평가 경고] "${biz.companyName}" 조사원 평가 연계 중 예외: ${evalErr.message}`);
                }
              } else {
                logger.success(`[배치 ${i + 1}/${targets.length} 완료] "${biz.companyName}" 본 설문 완료!`);
              }
            }

            if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isMetrixSeoul && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm) {
              const batchPridSel = isAssoc ? '2026070801' : (campaign.targetPrid || '2026070802');
              await syncKstatSlotStatus({
                pridSel: batchPridSel,
                idSel: biz.idSel || biz.kstatMeta?.idSel,
                kid: biz.kid || biz.kstatMeta?.kid,
                gid: biz.gid || biz.kstatMeta?.gid || '0',
                srt: 1
              }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));

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
                }).catch(err => {
                  logger.warn(`[실행 후처리 경고] ${err.message}`);
                  return { success: false };
                });
                if (progRes?.success) {
                  biz.kstatProgressSaved = true;
                }
              }
            }
          } else {
            if (isMetrix && result?.excluded) {
              biz.quotaStatus = 'excluded';
              biz.error = result?.error || '';
              logger.warn(result?.error || `[폐업 제외] "${biz.companyName}" 제외 처리`);
            } else if (result?.excluded) {
              biz.quotaStatus = 'excluded';
              logger.warn(`[배치 ${i + 1}/${targets.length} 제외] ${result.error || `"${biz.companyName}" 제외 처리됨`}`);
            } else {
              biz.quotaStatus = 'error';
              biz.error = result?.error || '설문 실행 오류';
              if (isMetrix && Array.isArray(result?.submittedAnswers) && result.submittedAnswers.length > 0) {
                biz.submittedAnswers = result.submittedAnswers;
              }
              logger.error(`[배치 ${i + 1}/${targets.length} 실패] "${biz.name || biz.buildingName || biz.marketName || biz.companyName}": ${result?.error || '설문 실행 오류'}`);
              if (isMetrix || isKmacKbpi) {
                const haltNotice = `🛑 [배치 즉시 중단] "${biz.name || biz.companyName}" (${biz.uid || '-'}) 진행 중 차단/오류가 발생하여 배치를 안전하게 중단했습니다. 사유: ${result?.error || '설문 진행 차단'}`;
                haltedByBlock = true;
                haltedReason = haltNotice;
                logger.error(haltNotice);
                CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
                logger.broadcast({
                  type: 'QUOTA_UPDATED',
                  campaignId: campaign.id,
                  quotaDatabase: quotaDb
                });
                logger.broadcast({
                  type: 'PILOT_ERROR',
                  campaignId: campaign.id,
                  quotaIndex: biz.index,
                  error: haltNotice
                });
                break;
              }
            }
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
          String(b.status || '').includes('인원초과') ||
          b.quotaStatus === 'completed' ||
          b.quotaStatus === 'pilot_done' ||
          b.status === '완료' ||
          b.status === '조사완료' ||
          b.substitutedByUid ||
          String(b.quotaStatus || '').includes('98%') ||
          String(b.quotaStatus || '').includes('99%') ||
          String(b.status || '').includes('98%') ||
          String(b.status || '').includes('99%')
        );
        const nextCampaignStatus = allQuotasFinished ? 'completed' : 'ready';

        finishCampaignTask(campaign.id);
        CampaignStore.updateCampaign(campaign.id, { status: nextCampaignStatus });
        if (haltedByBlock) {
          logger.warn(`🛑 [선택 배치 일시중단] 캠페인 "${campaign.title}" 배치 진행 중 문항 검증 막힘이 감지되어 안전하게 중단되었습니다. (원인 확인 후 재가동 가능)`);
          logger.broadcast({
            type: 'BATCH_HALTED',
            campaignId: campaign.id,
            error: haltedReason
          });
        } else if (stoppedByUser) {
          logger.warn(`⏹️ [선택 배치 중지됨] 캠페인 "${campaign.title}" 배치가 사용자 요청으로 중지되었습니다.`);
          logger.broadcast({
            type: 'BATCH_HALTED',
            campaignId: campaign.id,
            stoppedByUser: true
          });
        } else {
          if (allQuotasFinished) {
            logger.success(`🎉 [배치 자동화 완료] 캠페인 "${campaign.title}"의 모든 연속 설문이 완료되었습니다!`);
          } else {
            logger.success(`🎉 [선택 배치 완료] 캠페인 "${campaign.title}" 선택 대상 ${targets.length}건 실행이 완료되었습니다! (잔여 쿼터 대기 중)`);
          }
          logger.broadcast({
            type: 'BATCH_COMPLETED',
            campaignId: campaign.id
          });
        }
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

    const isAssoc = (campaign.surveyType === 'kstat_assoc');
    const isMetrix = (campaign.surveyType === 'metrix_panel');
    const isKona = (campaign.surveyType === 'kona_youth');
    const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');
    const isGallupReturnFarm = (campaign.surveyType === 'gallup_return_farm');
    const isGallupAgriwork = (campaign.surveyType === 'gallup_agriwork');
    const isMetrixSeoul = (campaign.surveyType === 'metrix_seoul_panel');
    const isKmacKbpi = (campaign.surveyType === 'kmac_kbpi');

    if (isKmacKbpi) {
      try {
        const synced = await pullKbpiSheetOverrides({
          quotaDatabase: quotaDb,
          sheetId: KBPI_DEFAULT_SHEET_ID,
          quotasDir
        });
        if (synced?.quotaDatabase?.length > 0) {
          quotaDb.splice(0, quotaDb.length, ...synced.quotaDatabase);
        }
      } catch (pullWarn) {
        logger.warn(`[K-BPI 단건 사전 시트 동기화 경고] ${pullWarn.message}`);
      }
    }

    const refreshedTarget = quotaDb.find(b => Number(b.index || b.seq) === Number(quotaIndex)) || targetBiz;
    const targetUrl = refreshedTarget.slotUrl || refreshedTarget.surveyUrl || refreshedTarget.householdUrl || (isGallupAgriwork ? AGRIWORK_DEFAULT_PORTAL_URL : (isKmacKbpi ? KBPI_DEFAULT_URL : (isMetrixSeoul ? `https://metrix.svybx.kr/?pid=S21401by41s3&grpid=list&resid=${refreshedTarget.resid}&fwid=S21401by41s3${refreshedTarget.accountKey || refreshedTarget.akey || '2010'}` : (isGallupReturnFarm ? GALLUP_20263603_DEFAULT_URL : (isHrcEnergy ? `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${refreshedTarget.uid}&page=1` : (isKona ? 'https://voting.konachain.co.kr/s-a/IADHBGDHCEFBJQCL' : ''))))));
    if (!targetUrl) {
      return res.status(400).json({
        error: `[${refreshedTarget.marketName || refreshedTarget.companyName}] 쿼터에 설문 URL이 매핑되지 않았습니다.`
      });
    }

    startCampaignTask(campaign, 'single', { current: 0, total: 1, percent: 0 });
    refreshedTarget.quotaStatus = 'running';
    CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'running' });
    logger.broadcast({
      type: 'QUOTA_UPDATED',
      campaignId: campaign.id,
      quotaDatabase: quotaDb
    });

    const slotNotice = refreshedTarget.slotIndex ? ` [Kstat 슬롯 #${refreshedTarget.slotIndex} ${refreshedTarget.slotExtra || ''}]` : '';
    logger.info(`[개별 쿼터 테스트] "${refreshedTarget.name || refreshedTarget.respondentName || refreshedTarget.buildingName || refreshedTarget.marketName || refreshedTarget.companyName}" (순번: #${refreshedTarget.index || quotaIndex})${slotNotice} 1건 실행 시작...`);

    res.json({
      success: true,
      message: `"${refreshedTarget.name || refreshedTarget.respondentName || refreshedTarget.buildingName || refreshedTarget.marketName || refreshedTarget.companyName}" 1건 실행이 시작되었습니다.`,
      targetBiz: refreshedTarget
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      try {
        const assocPol = campaign.assocPolicy || {};
        const kbpiSinglePilotMode = (req.body.pilotMode !== undefined) ? Boolean(req.body.pilotMode) : false;
        const agriPol = campaign.gallupAgriworkPolicy || campaign.masterBaseline?.policy || {};
        const agriSingleSafetyGuard = (req.body.safetyGuard !== undefined)
          ? Boolean(req.body.safetyGuard)
          : Boolean(agriPol.safetyGuard ?? (agriPol.submitComplete === false));

        const result = isGallupAgriwork
          ? await runGallupAgriworkSurvey({
              campaign,
              slotData: refreshedTarget,
              policy: agriPol,
              quotaIndex: refreshedTarget.index || quotaIndex,
              pilotMode: Boolean(agriSingleSafetyGuard),
              safetyGuard: agriSingleSafetyGuard,
              reportDir: path.join(reportsDir, campaign.id, `agriwork_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.uid || refreshedTarget.listId || ''}`),
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: refreshedTarget.index,
                  ...info
                });
              }
            })
          : (isKmacKbpi
          ? await runKmacKbpiSurvey({
              campaign,
              slotData: refreshedTarget,
              policy: campaign.kbpiPolicy || campaign.masterBaseline?.policy || {},
              quotaIndex: refreshedTarget.index || quotaIndex,
              pilotMode: kbpiSinglePilotMode,
              safetyGuard: (safetyGuard !== false),
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: refreshedTarget.index,
                  ...info
                });
              }
            })
          : (isMetrix
          ? await runMetrixSurvey({
              surveyUrl: targetUrl,
              slotData: refreshedTarget,
              policy: campaign.metrixPolicy || campaign.masterBaseline?.policy || {},
              quotaIndex: refreshedTarget.index || quotaIndex,
              pilotMode: true,
              safetyGuard: (safetyGuard !== false),
              haltOnBlock: true,
              reportDir: path.join(reportsDir, campaign.id, `metrix_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.uid || ''}`),
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: refreshedTarget.index,
                  ...info
                });
              }
            })
          : (isMetrixSeoul
          ? await runMetrixSeoulSurvey({
              campaign,
              policy: campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || {},
              slotUrl: targetUrl,
              slotData: refreshedTarget,
              mode: 'pilot',
              onProgress: (info) => {
                logger.broadcast({
                  type: 'PILOT_PROGRESS',
                  campaignId: campaign.id,
                  quotaIndex: refreshedTarget.index,
                  ...info
                });
              }
            })
          : (isGallupReturnFarm
            ? await runGallupReturnFarmSurvey({
                slotData: refreshedTarget,
                policy: campaign.gallupReturnFarmPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || {},
                quotaIndex: refreshedTarget.index || quotaIndex,
                pilotMode: true,
                safetyGuard: true,
                reportDir: path.join(reportsDir, campaign.id, `gallup_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.id || refreshedTarget.uid || ''}`),
                onProgress: (info) => {
                  logger.broadcast({
                    type: 'PILOT_PROGRESS',
                    campaignId: campaign.id,
                    quotaIndex: refreshedTarget.index,
                    ...info
                  });
                }
              })
            : (isGlobalriLiteracy
              ? await runGlobalriLiteracySurvey({
                  slotData: refreshedTarget,
                  policy: campaign.globalriLiteracyPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline || {},
                  quotaIndex: refreshedTarget.index || quotaIndex,
                  pilotMode: safetyGuard,
                  safetyGuard,
                  reportDir: path.join(reportsDir, campaign.id, `globalri_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.memberUid || refreshedTarget.uid || ''}`),
                  onProgress: (info) => {
                    logger.broadcast({
                      type: 'PILOT_PROGRESS',
                      campaignId: campaign.id,
                      quotaIndex: refreshedTarget.index,
                      ...info
                    });
                  }
                })
              : (isHrcEnergy
                ? await (async () => {
                    const singlePhoneCheck = findHrcPhoneConflict(refreshedTarget);
                    if (singlePhoneCheck.conflict) {
                      throw new Error(`[중복 연락처 차단] UID ${refreshedTarget.uid}의 전화번호가 이미 완료/진행된 타 건물(계정 ${singlePhoneCheck.otherAccount} · UID ${singlePhoneCheck.otherUid})과 중복됩니다.`);
                    }
                    return runHrcEnergySurvey({
                      slotData: refreshedTarget,
                      policy: campaign.hrcEnergyPolicy || {},
                      loginId: refreshedTarget.surveyorId || campaign.loginId || '700275',
                    loginPw: campaign.loginPw || refreshedTarget.surveyorId || campaign.loginId || '700275',
                    quotaIndex: refreshedTarget.index || quotaIndex,
                    pilotMode: (req.body.safetyGuard !== undefined) ? Boolean(req.body.safetyGuard) : false,
                    safetyGuard: (req.body.safetyGuard !== undefined) ? Boolean(req.body.safetyGuard) : false,
                    reportDir: path.join(reportsDir, campaign.id, `hrc_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.uid || ''}`),
                    onProgress: (info) => {
                      logger.broadcast({
                        type: 'PILOT_PROGRESS',
                        campaignId: campaign.id,
                        quotaIndex: refreshedTarget.index,
                        ...info
                      });
                    }
                    });
                  })()
                : (isKona
                  ? await runKonaSurvey({
                      surveyUrl: targetUrl,
                      slotData: refreshedTarget,
                      policy: campaign.konaPolicy || {},
                      quotaIndex: refreshedTarget.index || quotaIndex,
                      pilotMode: safetyGuard,
                      safetyGuard,
                      reportDir: path.join(reportsDir, campaign.id, `kona_item_${refreshedTarget.index || quotaIndex}_${refreshedTarget.idx || ''}`),
                      onProgress: (info) => {
                        logger.broadcast({
                          type: 'PILOT_PROGRESS',
                          campaignId: campaign.id,
                          quotaIndex: refreshedTarget.index,
                          ...info
                        });
                      }
                    })
                  : (isAssoc
                    ? await runKstatAssocSurvey({
                        surveyUrl: targetUrl,
                        assocData: refreshedTarget,
                        quotaIndex: refreshedTarget.index || quotaIndex,
                        policy: assocPol,
                        surveyorAccount: refreshedTarget.surveyorAccount || campaign.kstatLoginId || '가온이강윤',
                        preserveExistingInputs: (assocPol.preserveExistingInputs !== false),
                        pilotMode: true,
                        safetyGuard: Boolean(safetyGuard),
                        reportDir: path.join(reportsDir, campaign.id, `assoc_item_${refreshedTarget.index || quotaIndex}`),
                        onProgress: (info) => {
                          logger.broadcast({
                            type: 'PILOT_PROGRESS',
                            campaignId: campaign.id,
                            quotaIndex: refreshedTarget.index,
                            ...info
                          });
                        }
                      })
                    : await runKstatSurvey({
                        surveyUrl: targetUrl,
                        bizData: refreshedTarget,
                        quotaIndex: refreshedTarget.index || quotaIndex,
                        guidelineConfig: {
                          ...(campaign.guidelineConfig || {}),
                          masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
                        },
                        policy: campaign.guidelineConfig?.policy || {},
                        pilotMode: true,
                        safetyGuard: Boolean(safetyGuard),
                        reportDir: path.join(reportsDir, campaign.id, `item_${refreshedTarget.index || quotaIndex}`),
                        onProgress: (info) => {
                          logger.broadcast({
                            type: 'PILOT_PROGRESS',
                            campaignId: campaign.id,
                            quotaIndex: refreshedTarget.index,
                            ...info
                          });
                        }
                      })))))))));

        if (result?.success) {
          if (isGallupAgriwork) {
            const isCompletedNow = (result.status === 'completed');
            refreshedTarget.quotaStatus = isCompletedNow ? 'completed' : 'pilot_done';
            refreshedTarget.status = isCompletedNow ? '완료' : '완료직전 대기 (Page LAST)';
            refreshedTarget.progress = isCompletedNow ? '100%' : '99% (Page LAST)';
            refreshedTarget.surveyCompleted = isCompletedNow ? '완료' : '대기';
            if (result.phone) refreshedTarget.phone = result.phone;
            if (isCompletedNow) refreshedTarget.completedAt = new Date().toISOString();
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              refreshedTarget.submittedAnswers = result.submittedAnswers;
            }
            persistGallupAgriworkQuotaDatabase({ quotaDatabase: quotaDb });
          } else if (isKmacKbpi) {
            refreshedTarget.quotaStatus = result.quotaStatus || (result.completed ? 'completed' : 'pilot_done');
            refreshedTarget.status = result.statusLabel || (result.completed ? '완료' : '검증대기(완료직전)');
            refreshedTarget.progress = result.progress || (result.completed ? '100%' : '98%');
            if (Array.isArray(result.categoryConfigs)) {
              refreshedTarget.categoryConfigs = result.categoryConfigs;
            }
            refreshedTarget.completedAt = new Date().toISOString();
            try {
              persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
              const kbpiPol = campaign.kbpiPolicy || campaign.masterBaseline?.policy || {};
              if (kbpiPol.autoSyncGoogleSheet !== false) {
                await syncKbpiProgressToGoogleSheet({
                  quotaDatabase: quotaDb,
                  sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
                  quotasDir
                }).catch(syncErr => logger.warn(`[K-BPI 단건 구글시트 기록 경고] ${syncErr.message}`));
              }
            } catch (exErr) {
              logger.warn(`[K-BPI 로컬 쿼터 저장 경고] ${exErr.message}`);
            }
          } else if (isMetrix) {
            refreshedTarget.quotaStatus = (result.status === 'stopped_at_review') ? '진행중(98%)' : 'completed';
            refreshedTarget.status = (result.status === 'stopped_at_review') ? '진행중(98%)' : '완료';
            if (result.phoneUpdated && result.updatedPhone) {
              refreshedTarget.serverPhone = result.updatedPhone;
              refreshedTarget.phone = result.updatedPhone;
              refreshedTarget.phoneNeedsSync = false;
            }
            refreshedTarget.pilotAt = new Date().toISOString();
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              refreshedTarget.submittedAnswers = result.submittedAnswers;
            }
            try {
              persistGyeonggiPanelQuotaDatabase({ quotaDatabase: quotaDb });
              const ansXlsxPath = path.join(quotasDir, 'gyeonggi_panel_622_answers.xlsx');
              buildGyeonggiPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
              await syncGyeonggiPanelAnswersToGoogleSheet({
                quotaDatabase: quotaDb,
                sheetUrl: campaign.googleSheetUrl || GYEONGGI_PANEL_DEFAULT_GSHEET_URL
              });
            } catch (exErr) {
              logger.warn(`[경기도 소상공인 패널 답변 엑셀/구글시트 자동저장 경고] ${exErr.message}`);
            }
          } else if (isMetrixSeoul) {
            if (result.alreadyCompleted) {
              refreshedTarget.quotaStatus = 'completed';
              refreshedTarget.status = '완료(100%)';
              refreshedTarget.progressText = '완료(100%)';
              refreshedTarget.progressPct = 100;
            } else {
              refreshedTarget.quotaStatus = 'pilot_done';
              refreshedTarget.status = '동의서대기(99%/Step115)';
              refreshedTarget.progressText = '응답중(99%)';
              refreshedTarget.progressPct = 99;
            }
            refreshedTarget.completedAt = new Date().toISOString();
            if (result.submittedAnswers && Object.keys(result.submittedAnswers).length > 0) {
              refreshedTarget.submittedAnswers = result.submittedAnswers;
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
            refreshedTarget.quotaStatus = 'pilot_done';
            refreshedTarget.status = '완료직전 대기 (Page 118)';
            refreshedTarget.serverStatus = '01';
            refreshedTarget.lastVisitResult = '컨택성공';
            refreshedTarget.visitCount = Math.max(1, Number(refreshedTarget.visitCount || 1));
            refreshedTarget.progress = '99% (Page 118 완료직전)';
            refreshedTarget.surveyCompleted = '대기';
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              refreshedTarget.submittedAnswers = result.submittedAnswers;
            }
          } else if (isGlobalriLiteracy) {
            const isPartCDone = (result.status === 'part_c_completed');
            const isStoppedReview = (result.status === 'stopped_at_review');
            refreshedTarget.quotaStatus = (isPartCDone || isStoppedReview) ? 'pilot_done' : 'completed';
            refreshedTarget.status = isPartCDone ? 'Part C 완료 (수기대기)' : (isStoppedReview ? '검증대기(F05_2)' : '완료');
            refreshedTarget.memberStatus = refreshedTarget.status;
            refreshedTarget.progress = isPartCDone ? `Part C 완료 (채점 ${result.gradeSummary?.partC || '완료'})` : (isStoppedReview ? '98% (제출직전)' : '100%');
            refreshedTarget.surveyCompleted = (refreshedTarget.quotaStatus === 'completed') ? '완료' : '대기';
            if (Array.isArray(result.submittedAnswers) && result.submittedAnswers.length > 0) {
              refreshedTarget.submittedAnswers = result.submittedAnswers;
            }
            if (result.gradeSummary) {
              refreshedTarget.gradeSummary = result.gradeSummary;
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
            refreshedTarget.quotaStatus = (result.status === 'stopped_at_review') ? 'pilot_done' : 'completed';
            refreshedTarget.status = (result.status === 'stopped_at_review') ? '검증대기(91%)' : '완료';
            refreshedTarget.progress = (result.status === 'stopped_at_review') ? '91%' : '100%';
            refreshedTarget.surveyCompleted = (refreshedTarget.quotaStatus === 'completed') ? '완료' : '대기';
            if (result.giftSignResult?.ok) {
              refreshedTarget.giftSigned = true;
              refreshedTarget.giftBrand = result.giftSignResult.giftBrand || '신세계';
              refreshedTarget.giftValue = result.giftSignResult.giftValue || '5000';
              refreshedTarget.giftSignerName = result.giftSignResult.signerName || refreshedTarget.contactName || '';
              refreshedTarget.giftSignerPhone = result.giftSignResult.signerPhone || refreshedTarget.phone || '';
              refreshedTarget.giftStyleLabel = result.giftSignResult.styleLabel || '';
            }
          } else {
            refreshedTarget.quotaStatus = (!safetyGuard) ? 'completed' : 'pilot_done';
            if (isKona) {
              refreshedTarget.status = (!safetyGuard) ? '완료' : '검증완료(제출직전)';
              refreshedTarget.surveyCompleted = (!safetyGuard) ? '완료' : '대기';
            }
          }
          refreshedTarget.pilotAt = new Date().toISOString();
          refreshedTarget.capturedSteps = result.capturedSteps;
          logger.success(`[개별 쿼터 테스트 성공] "${refreshedTarget.name || refreshedTarget.respondentName || refreshedTarget.buildingName || refreshedTarget.marketName || refreshedTarget.companyName}" 완주 완료!`);

          if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul && isAssoc) {
            if (!safetyGuard) {
              const evalUrl = refreshedTarget.evalUrl || (refreshedTarget.ranId ? `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${refreshedTarget.ranId}&type=tapi&prid=2026070801&mnid=900001364&srt=2` : null);
              if (evalUrl) {
                try {
                  const evalResult = await runKstatAssocEvaluation({
                    evalUrl,
                    assocData: refreshedTarget,
                    guidelineConfig: {
                      ...(campaign.guidelineConfig || {}),
                      assocPolicy: campaign.assocPolicy || campaign.guidelineConfig?.assocPolicy || campaign.masterBaseline?.policy || campaign.masterBaseline
                    },
                    reportDir: path.join(reportsDir, campaign.id, `assoc_item_${refreshedTarget.index || quotaIndex}`),
                    onProgress: (info) => {
                      logger.broadcast({
                        type: 'PILOT_PROGRESS',
                        campaignId: campaign.id,
                        quotaIndex: refreshedTarget.index,
                        ...info
                      });
                    }
                  });
                  if (evalResult?.success) {
                    refreshedTarget.evalStatus = 'completed';
                    refreshedTarget.evalResults = evalResult.evalResults;
                    await syncKstatSlotStatus({
                      pridSel: '2026070801',
                      idSel: refreshedTarget.idSel || refreshedTarget.kstatMeta?.idSel,
                      kid: refreshedTarget.kid || refreshedTarget.kstatMeta?.kid,
                      gid: refreshedTarget.gid || refreshedTarget.kstatMeta?.gid || '0',
                      srt: 2
                    }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                  }
                } catch (evalErr) {
                  logger.warn(`[개별 쿼터 상인회 평가 경고] ${evalErr.message}`);
                }
              }
            }
          } else if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul) {
            const evalUrl = refreshedTarget.evalUrl || (refreshedTarget.ranId ? `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${refreshedTarget.ranId}&type=tapi&prid=2026070802&mnid=900001346&srt=2` : null);
            if (evalUrl) {
              try {
                const evalResult = await runKstatEvaluation({
                  evalUrl,
                  bizData: refreshedTarget,
                  guidelineConfig: {
                    ...(campaign.guidelineConfig || {}),
                    masterBaseline: campaign.masterBaseline || campaign.guidelineConfig?.masterBaseline
                  },
                  reportDir: path.join(reportsDir, campaign.id, `item_${refreshedTarget.index || quotaIndex}`)
                });
                if (evalResult?.success) {
                  refreshedTarget.evalStatus = 'completed';
                  refreshedTarget.evalResults = evalResult.evalResults;
                  await syncKstatSlotStatus({
                    pridSel: '2026070802',
                    idSel: refreshedTarget.idSel || refreshedTarget.kstatMeta?.idSel,
                    kid: refreshedTarget.kid || refreshedTarget.kstatMeta?.kid,
                    gid: refreshedTarget.gid || refreshedTarget.kstatMeta?.gid || '0',
                    srt: 2
                  }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));
                }
              } catch (evalErr) {
                logger.warn(`[개별 쿼터 평가 경고] ${evalErr.message}`);
              }
            }
          }

          if (!isGallupAgriwork && !isKmacKbpi && !isKona && !isMetrix && !isHrcEnergy && !isGlobalriLiteracy && !isGallupReturnFarm && !isMetrixSeoul) {
            const singlePridSel = isAssoc ? '2026070801' : (campaign.targetPrid || '2026070802');
            await syncKstatSlotStatus({
              pridSel: singlePridSel,
              idSel: refreshedTarget.idSel || refreshedTarget.kstatMeta?.idSel,
              kid: refreshedTarget.kid || refreshedTarget.kstatMeta?.kid,
              gid: refreshedTarget.gid || refreshedTarget.kstatMeta?.gid || '0',
              srt: 1
            }).catch(err => logger.warn(`[실행 후처리 경고] ${err.message}`));

            if (refreshedTarget.evalStatus === 'completed') {
              const effLoginId = refreshedTarget.surveyorAccount || campaign.kstatLoginId || (isAssoc ? '가온박정순' : '가온김영옥');
              const effLoginPw = campaign.kstatLoginPw || '1234';
              const progRes = await saveKstatSlotProgressStatus({
                pridSel: singlePridSel,
                idSel: refreshedTarget.idSel || refreshedTarget.kstatMeta?.idSel,
                kid: refreshedTarget.kid || refreshedTarget.kstatMeta?.kid,
                gid: refreshedTarget.gid || refreshedTarget.kstatMeta?.gid || '0',
                ranId: refreshedTarget.ranId || refreshedTarget.ran_id,
                loginId: effLoginId,
                loginPw: effLoginPw
              }).catch(err => {
                logger.warn(`[실행 후처리 경고] ${err.message}`);
                return { success: false };
              });
              if (progRes?.success) {
                refreshedTarget.kstatProgressSaved = true;
              }
            }
          }
        } else {
          refreshedTarget.quotaStatus = 'error';
          refreshedTarget.error = result?.error || '테스트 오류';
          if (isMetrix && Array.isArray(result?.submittedAnswers) && result.submittedAnswers.length > 0) {
            refreshedTarget.submittedAnswers = result.submittedAnswers;
          }
          logger.error(`[개별 쿼터 테스트 실패] "${refreshedTarget.name || refreshedTarget.marketName || refreshedTarget.companyName}": ${result?.error || '테스트 오류'}`);
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
        refreshedTarget.quotaStatus = 'error';
        CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb, status: 'ready' });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId: campaign.id,
          quotaDatabase: quotaDb
        });
      }
    })());
  });

  // 작업 중지 요청 (특정 campaignId 지정 시 해당 캠페인만 중지, 미지정 시 활성 배치 전체 중지 및 Chromium 인스턴스 즉시 종료)
  app.post('/api/survey/stop', async (req, res) => {
    const targetCampId = req.body?.campaignId || req.query?.campaignId || null;
    let targetsToStop = [];

    if (targetCampId) {
      targetsToStop = [targetCampId];
      await stopCampaignTask(targetCampId);
    } else {
      const activeIds = getActiveTasksList().map(t => t.campaignId);
      const stoppedIds = await stopAllCampaignTasks();
      targetsToStop = Array.from(new Set([...activeIds, ...stoppedIds]));
    }

    for (const cid of targetsToStop) {
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

  // 경기도 소상공인 패널(SNUM=622) 응답 내역 엑셀 다운로드 API
  app.get('/api/campaigns/:id/gyeonggi-panel-answers-excel', (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const buffer = buildGyeonggiPanelAnswersExcel({
        quotaDatabase: campaign.quotaDatabase || []
      });
      const filename = encodeURIComponent(`경기도소상공인패널_응답내역_${campaign.id}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: `경기도 패널 응답 내역 엑셀 생성 실패: ${err.message}` });
    }
  });

  // [KMAC 2027 K-BPI] 전 문항 HTML · GetData 스키마 정밀 추출 API (제출 직전 안전 정지 100% 보장)
  app.post('/api/campaigns/:id/inspect-kbpi-html', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    if (campaign.surveyType !== 'kmac_kbpi') {
      return res.status(400).json({ error: 'K-BPI 설문 캠페인에서만 사용할 수 있는 기능입니다.' });
    }

    const slotCheck = checkCanStartCampaignTask(campaign);
    if (!slotCheck.ok) {
      return res.status(409).json({ error: slotCheck.error });
    }

    const { policy = {}, quotaIndex = 1 } = req.body || {};
    const quotaDb = campaign.quotaDatabase || [];
    if (quotaDb.length === 0) {
      return res.status(400).json({ error: '캠페인에 구축된 조사 쿼터가 없습니다.' });
    }

    try {
      const synced = await pullKbpiSheetOverrides({
        quotaDatabase: quotaDb,
        sheetId: KBPI_DEFAULT_SHEET_ID,
        quotasDir
      });
      if (synced?.quotaDatabase?.length > 0) {
        quotaDb.splice(0, quotaDb.length, ...synced.quotaDatabase);
      }
    } catch (pullWarn) {
      logger.warn(`[K-BPI HTML 분석 사전 시트 동기화 경고] ${pullWarn.message}`);
    }

    let targetBiz = quotaDb.find(b => Number(b.index || b.seq) === Number(quotaIndex)) || quotaDb[Math.max(0, Number(quotaIndex) - 1)];
    if (targetBiz && (targetBiz.quotaStatus === 'completed' || String(targetBiz.status || '') === '완료')) {
      const firstNonCompleted = quotaDb.find(b => b.quotaStatus !== 'completed' && String(b.status || '') !== '완료');
      if (firstNonCompleted) targetBiz = firstNonCompleted;
    }
    if (!targetBiz) {
      return res.status(400).json({ error: '분석 대상 응답자 슬롯을 찾을 수 없습니다.' });
    }

    const mergedPolicy = {
      ...(campaign.kbpiPolicy || campaign.masterBaseline?.policy || {}),
      ...policy,
      stopBeforeFinalSubmit: true
    };
    const dumpFilePath = path.join(reportsDir, campaign.id, 'kbpi_230_html_analysis.json');

    startCampaignTask(campaign, 'inspect_html', { current: 0, total: 1, percent: 0 });
    targetBiz.quotaStatus = 'running';
    CampaignStore.updateCampaign(campaign.id, {
      status: 'running',
      kbpiPolicy: mergedPolicy,
      quotaDatabase: quotaDb
    });

    logger.runWithCampaignContext(campaign.id, () => {
      logger.info(`🔬 [K-BPI 전 문항 HTML·구조 정밀 추출 시작] 대상: #${targetBiz.seq || targetBiz.index} "${targetBiz.name || targetBiz.companyName}" (${targetBiz.uid}) — 완료 직전(96%) 안전 정지 보장`);
      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: quotaDb
      });
    });

    res.json({
      success: true,
      message: `#${targetBiz.seq || targetBiz.index} "${targetBiz.name || targetBiz.companyName}" 슬롯 전 문항 HTML·스키마 정밀 추출을 시작했습니다. (미제출 안전 정지)`,
      downloadUrl: `/api/campaigns/${encodeURIComponent(campaign.id)}/kbpi-html-report`
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      let result = null;
      try {
        result = await runKmacKbpiSurvey({
          campaign,
          slotData: targetBiz,
          policy: mergedPolicy,
          quotaIndex: targetBiz.index || targetBiz.seq || quotaIndex,
          pilotMode: false,
          safetyGuard: true,
          captureHtmlDumpPath: dumpFilePath,
          onProgress: (info) => {
            logger.info(`[K-BPI HTML 분석 - ${info.step}] ${info.message}`);
            logger.broadcast({
              type: 'PILOT_PROGRESS',
              campaignId: campaign.id,
              quotaIndex: targetBiz.index || targetBiz.seq,
              ...info
            });
          }
        });

        if (result?.success) {
          targetBiz.quotaStatus = result.quotaStatus || 'pilot_done';
          targetBiz.status = result.statusLabel || '완료직전 대기(96%)';
          targetBiz.progress = result.progress || '96%';
          if (Array.isArray(result.categoryConfigs)) {
            targetBiz.categoryConfigs = result.categoryConfigs;
          }
          persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
          if (mergedPolicy.autoSyncGoogleSheet !== false) {
            syncKbpiProgressToGoogleSheet({
              quotaDatabase: quotaDb,
              sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
              quotasDir
            }).catch(syncErr => logger.warn(`[K-BPI HTML 분석 시트 동기화 경고] ${syncErr.message}`));
          }
          logger.success(`✅ [K-BPI 전 문항 HTML·스키마 추출 완료] "${targetBiz.name || targetBiz.companyName}" (${targetBiz.status}) — 분석 리포트 다운로드가 준비되었습니다!`);
        } else {
          targetBiz.quotaStatus = 'error';
          if (Array.isArray(result?.categoryConfigs)) {
            targetBiz.categoryConfigs = result.categoryConfigs;
          }
          logger.warn(`⚠️ [K-BPI HTML 추출 중 정체 지점 캡처 완료] ${result?.error || '중간 정지'} — 해당 화면 HTML까지 JSON 파일에 모두 기록되었습니다.`);
        }
      } catch (err) {
        targetBiz.quotaStatus = 'error';
        logger.error(`[K-BPI HTML 분석 예외] ${err.message}`);
      } finally {
        finishCampaignTask(campaign.id);
        CampaignStore.updateCampaign(campaign.id, { status: 'ready', quotaDatabase: quotaDb });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId: campaign.id,
          quotaDatabase: quotaDb
        });
        const hasDump = fs.existsSync(dumpFilePath);
        logger.broadcast({
          type: 'KBPI_HTML_REPORT_READY',
          campaignId: campaign.id,
          success: Boolean(result?.success),
          hasDump,
          error: result?.error || null,
          bizName: targetBiz.name || targetBiz.companyName || '',
          downloadUrl: `/api/campaigns/${encodeURIComponent(campaign.id)}/kbpi-html-report`
        });
      }
    })());
  });

  // [KMAC 2027 K-BPI] 추출된 전 문항 HTML · GetData 스키마 JSON 다운로드 API
  app.get('/api/campaigns/:id/kbpi-html-report', (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    const dumpFilePath = path.join(reportsDir, campaign.id, 'kbpi_230_html_analysis.json');
    if (!fs.existsSync(dumpFilePath)) {
      return res.status(404).json({
        error: '아직 추출된 K-BPI HTML 분석 리포트가 없습니다. STEP 2의 [전 문항 HTML·구조 정밀 추출] 버튼을 먼저 실행해 주세요.'
      });
    }
    const filename = encodeURIComponent(`kbpi_230_html_analysis_${campaign.id}.json`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kbpi_230_html_analysis.json"; filename*=UTF-8''${filename}`);
    res.sendFile(dumpFilePath);
  });

  // [KMAC 2027 K-BPI] 150명 일괄 신상명세 등록 & 출제 브랜드 전수 스캔 API
  app.post('/api/campaigns/:id/kbpi-scan-brands', async (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }
    if (campaign.surveyType !== 'kmac_kbpi') {
      return res.status(400).json({ error: 'K-BPI 캠페인 전용 기능입니다.' });
    }

    const slotCheck = checkCanStartCampaignTask(campaign);
    if (!slotCheck.ok) {
      return res.status(409).json({ error: slotCheck.error });
    }

    const {
      targetIndices = null,
      forceRescanAll = false,
      autoSyncSheet = true,
      policy = {}
    } = req.body || {};

    const quotaDb = campaign.quotaDatabase || [];
    try {
      const synced = await pullKbpiSheetOverrides({
        quotaDatabase: quotaDb,
        sheetId: KBPI_DEFAULT_SHEET_ID,
        quotasDir
      });
      if (synced?.quotaDatabase?.length > 0) {
        quotaDb.splice(0, quotaDb.length, ...synced.quotaDatabase);
      }
    } catch (pullWarn) {
      logger.warn(`[K-BPI 스캔 사전 시트 동기화 경고] ${pullWarn.message}`);
    }

    const selectedSet = (Array.isArray(targetIndices) && targetIndices.length > 0)
      ? new Set(targetIndices.map(n => Number(n)).filter(n => !isNaN(n)))
      : null;

    const targets = quotaDb.filter((item, idx) => {
      const seq = Number(item.seq || item.index || (idx + 1));
      if (selectedSet && !selectedSet.has(seq)) return false;
      if (item.quotaStatus === 'completed' || String(item.status || '').trim() === '완료') return false;
      return true;
    });

    if (targets.length === 0) {
      return res.status(400).json({ error: '신상명세 등록 및 브랜드 스캔을 진행할 대상 슬롯이 없습니다.' });
    }

    const mergedPolicy = {
      ...(campaign.kbpiPolicy || campaign.masterBaseline?.policy || {}),
      ...policy,
      forceRescanAll: Boolean(forceRescanAll)
    };

    const scanTask = startCampaignTask(campaign, 'scan_brands', {
      current: 0,
      total: targets.length,
      percent: 0
    });
    CampaignStore.updateCampaign(campaign.id, {
      status: 'running',
      quotaDatabase: quotaDb
    });

    logger.runWithCampaignContext(campaign.id, () => {
      logger.info(`🚀 [K-BPI 신상명세 등록 & 브랜드 전수 스캔 시작] 대상 ${targets.length}명 연속 처리 (재스캔모드: ${forceRescanAll ? 'ON' : 'OFF'}, 시트자동동기화: ${autoSyncSheet !== false ? 'ON' : 'OFF'})`);
    });

    res.json({
      success: true,
      totalTargets: targets.length,
      message: `K-BPI 응답자 ${targets.length}명 신상명세 등록 및 출제 브랜드 전수 스캔이 시작되었습니다.`
    });

    logger.runWithCampaignContext(campaign.id, () => (async () => {
      let scanSummary = null;
      try {
        scanSummary = await scanKmacKbpiBrandsBatch({
          campaign,
          targets,
          policy: mergedPolicy,
          shouldStop: () => !isCampaignTaskRunning(campaign.id),
          onProgress: (info) => {
            logger.info(`[K-BPI 스캔] ${info.message}`);
            logger.broadcast({
              type: 'BATCH_PROGRESS',
              campaignId: campaign.id,
              ...info
            });
          },
          onItemDone: async (item, itemRes, idx, total) => {
            scanTask.progress = {
              current: idx + 1,
              total,
              percent: Math.round(((idx + 1) / Math.max(1, total)) * 100)
            };

            if (itemRes?.success) {
              if (!itemRes.skipped) {
                item.quotaStatus = itemRes.quotaStatus || 'scanned';
                item.status = itemRes.statusLabel || '신상등록·스캔완료';
                item.progress = itemRes.progress || item.progress || '12%';
                if (Array.isArray(itemRes.categoryConfigs)) {
                  item.categoryConfigs = itemRes.categoryConfigs;
                }
                if (itemRes.surveyDistrict) item.surveyDistrict = itemRes.surveyDistrict;
                if (itemRes.surveyDong) item.surveyDong = itemRes.surveyDong;
                item.scannedAt = new Date().toISOString();
              }
            } else {
              item.quotaStatus = 'error';
              item.lastScanError = itemRes?.error || '신상등록/스캔 실패';
              logger.warn(`⚠️ [K-BPI 스캔 실패 #${item.seq || item.index}] ${item.name} (${item.uid}): ${item.lastScanError}`);
            }

            CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
            persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
            logger.broadcast({
              type: 'QUOTA_UPDATED',
              campaignId: campaign.id,
              quotaDatabase: quotaDb
            });

            if (autoSyncSheet !== false && (idx + 1) % 25 === 0 && idx + 1 < total) {
              await syncKbpiProgressToGoogleSheet({
                quotaDatabase: quotaDb,
                sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
                quotasDir
              }).catch(syncErr => logger.warn(`[K-BPI 중간 시트 동기화 경고] ${syncErr.message}`));
            }
          }
        });
      } catch (err) {
        logger.error(`[K-BPI 일괄 스캔 치명 오류] ${err.message}`);
      } finally {
        try {
          persistKbpiQuotaDatabase({ quotaDatabase: quotaDb, quotasDir });
          if (autoSyncSheet !== false) {
            const syncRes = await syncKbpiProgressToGoogleSheet({
              quotaDatabase: quotaDb,
              sheetUrl: campaign.googleSheetUrl || KBPI_DEFAULT_SHEET_URL,
              quotasDir
            });
            logger.info(`☁️ [K-BPI 구글 시트 최종 기록] ${syncRes?.message || '동기화 완료'}`);
          }
        } catch (finErr) {
          logger.warn(`[K-BPI 최종 시트 동기화 경고] ${finErr.message}`);
        }

        finishCampaignTask(campaign.id);
        CampaignStore.updateCampaign(campaign.id, {
          status: 'ready',
          quotaDatabase: quotaDb
        });
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId: campaign.id,
          quotaDatabase: quotaDb
        });
        logger.broadcast({
          type: 'BATCH_COMPLETED',
          campaignId: campaign.id,
          summary: scanSummary
        });
        logger.success(
          `🎉 [K-BPI 일괄 신상등록 & 브랜드 스캔 종료] 신규스캔 ${scanSummary?.scannedSuccessCount ?? 0}명 · 기존스캔보존 ${scanSummary?.skippedAlreadyScannedCount ?? 0}명 · 실패 ${scanSummary?.failCount ?? 0}명`
        );
      }
    })());
  });
}
