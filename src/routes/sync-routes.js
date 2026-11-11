import fs from 'fs';
import path from 'path';
import * as CampaignStore from '../models/campaign.js';
import { exportBusinessesToExcel } from '../utils/excel.js';
import { scrapeKstatSlots } from '../engine/kstat-slot-scraper.js';
import {
  syncCampaignKstatSlots,
  bulkUpdateKstatAccountProgress
} from '../engine/kstat-sync.js';
import { scrapeKstatAssocSlots } from '../engine/kstat-assoc-slot-scraper.js';
import { scrapeHrcEnergySlots } from '../engine/hrc-energy-scraper.js';
import { signAllCompletedHrcEnergySlots } from '../engine/hrc-energy-runner.js';
import { scrapeGlobalriLiteracyQuotas } from '../engine/globalri-literacy-scraper.js';
import {
  buildGlobalriAnswersExcel,
  buildGlobalriSheetsData,
  syncGlobalriQuotaAnswersFromSeolmoon,
  syncGlobalriAnswersToGoogleSheet
} from '../utils/globalri-answer-excel.js';
import {
  SEOUL_PANEL_DEFAULT_GSHEET_URL,
  buildSeoulPanelSheetsData,
  buildSeoulPanelAnswersExcel,
  persistSeoulPanelQuotaDatabase,
  syncSeoulPanelAnswersToGoogleSheet
} from '../utils/seoul-panel-answer-excel.js';
import { syncGallupReturnFarmStatuses } from '../engine/gallup-return-farm-runner.js';
import {
  scrapeMetrix622AllAccounts,
  verifyBizStatusViaHometax,
  METRIX_622_GOOGLE_SHEET_URL
} from '../engine/metrix-slot-scraper.js';
import { logger } from '../utils/logger.js';

export function registerSyncRoutes({
  app,
  quotasDir,
  syncAssocCampaignToQuotaFile
}) {
  // 케이스탯 슬롯 파싱 및 쿼터 바인딩 API
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
      campaignId: campaign.id,
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

  // 상인회 슬롯 목록 스크랩 API (완전 격리)
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

  // 상인회 슬롯 1:1 자동 바인딩 API (완전 격리)
  app.post('/api/campaigns/:id/bind-assoc-slots', async (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }

      const { slots, loginId, loginPw, listUrl } = req.body;
      let targetSlots = slots;

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

      const quotaDb = targetSlots.map((s, idx) => ({
        seq: idx + 1,
        index: idx + 1,
        slotIndex: idx + 1,
        surveyorAccount: targetSurveyor,
        marketCode: s.marketCode,
        regNumber: s.regNumber,
        marketName: s.marketName,
        companyName: s.marketName,
        marketType: s.marketType,
        industry: s.marketType || '상인회',
        sido: s.sido,
        sigungu: s.sigungu,
        assocPhone: s.assocPhone,
        leaderName: s.leaderName,
        ceoName: s.leaderName,
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
        campaignId: campaign.id,
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

  // Kstat TAPI list.php 실시간 상태 동기화 및 [조사 진행상태] '조사완료' 자동 저장 API
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

  // 한국리서치 TAPI 2025년 기준 에너지총조사 [건물] 실시간 상태 동기화 API
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

      const slotHintMap = {};
      (campaign.quotaDatabase || []).forEach(q => {
        if (q.uid) slotHintMap[String(q.uid)] = q;
      });
      let giftSignSummary = null;
      if (req.body?.skipGiftSign !== true) {
        const completedUids = (syncRes.scrapedSlots || [])
          .filter(s => s.siteStatus === '완료' || (parseInt(String(s.progress).replace(/[^0-9]/g, ''), 10) || 0) >= 100)
          .map(s => String(s.uid));
        if (completedUids.length > 0) {
          giftSignSummary = await signAllCompletedHrcEnergySlots({
            loginId,
            loginPw,
            targetUids: completedUids,
            slotHintMap,
            onProgress: (p) => logger.info(`[HRC 답례품 자동서명] ${p.message}`)
          }).catch(err => {
            logger.warn(`[HRC 답례품 자동서명 경고] ${err.message}`);
            return null;
          });
        }
      }

      const signedUidMap = new Map(
        (giftSignSummary?.signedItems || []).map(s => [String(s.uid), s])
      );

      const baseData = (Array.isArray(syncRes.mergedData) && syncRes.mergedData.length > 0)
        ? syncRes.mergedData
        : (campaign.quotaDatabase || []);

      if (baseData.length > 0) {
        const liveMap = new Map((syncRes.scrapedSlots || []).map(s => [String(s.uid), s]));
        const updatedQuotaDb = baseData.map((item, idx) => {
          const uidStr = String(item.uid || '').trim();
          const live = liveMap.get(uidStr);
          const signedMeta = signedUidMap.get(uidStr);
          const pctNum = live ? (parseInt(String(live.progress).replace(/[^0-9]/g, ''), 10) || 0) : (parseInt(String(item.progress || '').replace(/[^0-9]/g, ''), 10) || 0);
          const isComp = (live && (live.siteStatus === '완료' || pctNum >= 100)) || item.quotaStatus === 'completed' || item.status === '완료';
          return {
            ...item,
            index: item.index || idx + 1,
            seq: item.seq || idx + 1,
            siteStatus: live?.siteStatus || item.siteStatus,
            progress: live?.progress || item.progress || (isComp ? '100%' : '0%'),
            status: isComp ? '완료' : (pctNum > 0 ? `진행중(${pctNum}%)` : (item.status || '대기')),
            quotaStatus: isComp ? 'completed' : (item.quotaStatus === 'completed' ? 'completed' : 'ready'),
            surveyCompleted: isComp ? '완료' : (item.surveyCompleted || '대기'),
            giftSigned: signedMeta ? true : Boolean(item.giftSigned || isComp),
            giftBrand: '신세계',
            giftValue: '5000',
            giftSignerName: signedMeta?.signerName || item.giftSignerName || item.contactName || '',
            giftSignerPhone: signedMeta?.signerPhone || item.giftSignerPhone || item.phone || '',
            giftStyleLabel: signedMeta?.styleLabel || item.giftStyleLabel || '',
            companyName: item.buildingName || item.companyName || `건물_${uidStr}`,
            ceoName: signedMeta?.signerName || item.contactName || item.ceoName || '관리소장',
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

      const doneCount = (CampaignStore.getCampaignById(campaign.id)?.quotaDatabase || []).filter(d => d.quotaStatus === 'completed' || d.status === '완료').length;
      const newlySigned = giftSignSummary?.newlySignedCount || 0;
      const totalSigned = (giftSignSummary?.alreadySignedCount || 0) + newlySigned;
      logger.success(`[에너지총조사 상태 동기화 완료] 조사원 ${loginId}: 총 ${syncRes.totalScraped}건 스크랩, 완료 ${doneCount}건 (답례품 서명완료: ${totalSigned}건, 신규서명: ${newlySigned}건)`);

      res.json({
        success: true,
        message: `한국리서치 TAPI(${loginId}) 실시간 동기화 완료! (총 ${syncRes.totalScraped}건 확인 / 완료 ${doneCount}건 / 신세계 5,000원 답례품 서명완료 ${totalSigned}건)`,
        totalScraped: syncRes.totalScraped,
        completedCount: doneCount,
        giftSignSummary,
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

  // 글로벌리서치 제5차 성인문해능력조사 (GR20260618-1-001-02) 실시간 쿼터 동기화 및 LID 필터링 API
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

      try {
        await syncGlobalriQuotaAnswersFromSeolmoon({ quotaDatabase: updatedQuotaDb });
        const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${loginId.slice(-4) || '7791'}.xlsx`);
        buildGlobalriAnswersExcel({ quotaDatabase: updatedQuotaDb, filePath: ansXlsxPath });
        await syncGlobalriAnswersToGoogleSheet({ quotaDatabase: updatedQuotaDb, pullFromSeolmoon: false });
      } catch (syncAnsErr) {
        logger.warn(`[성인문해능력조사 문항답변/구글시트 동기화 경고] ${syncAnsErr.message}`);
      }

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
        message: `글로벌리서치(GIFT) 실시간 동기화 및 구글 시트 업데이트 완료! (${syncRes.totalHouseholdsChecked}가구 확인 ➔ 설문 대상 가구원 ${updatedQuotaDb.length}명)`,
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

  // 한국갤럽 2026년 귀농귀촌 실태조사(귀농) (20263603) 실시간 서버 상태 동기화 API
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

  // 성인문해능력조사 / 서울시 소상공인 패널조사 응답자별 제출 문항·답변 내역 Excel(.xlsx) 다운로드 및 시트 동기화 API
  app.get('/api/campaigns/:id/export-answers-xlsx', async (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const quotaDb = campaign.quotaDatabase || [];
      if (campaign.surveyType === 'metrix_seoul_panel') {
        const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
        const buffer = buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
        const downloadName = encodeURIComponent('2026년_서울시_소상공인_사업체패널조사_5차_응답내역_163건.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
        return res.send(buffer);
      }
      if (campaign.surveyType === 'globalri_literacy' || quotaDb.some(b => b.memberUid)) {
        const syncStats = await syncGlobalriQuotaAnswersFromSeolmoon({ quotaDatabase: quotaDb });
        if (syncStats.updatedCount > 0) {
          CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
        }
      }
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

  app.get('/api/campaigns/:id/answers-sheet-data', async (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const quotaDb = campaign.quotaDatabase || [];
      if (campaign.surveyType === 'metrix_seoul_panel') {
        if (req.query.syncSheet === '1') {
          persistSeoulPanelQuotaDatabase({ quotaDatabase: quotaDb });
          const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
          buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
          syncSeoulPanelAnswersToGoogleSheet({
            quotaDatabase: quotaDb,
            sheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL
          }).catch(err => {
            logger.warn(`[서울시 패널 구글시트 동기화 경고] ${err.message}`);
          });
        }
        const sheets = buildSeoulPanelSheetsData({ quotaDatabase: quotaDb });
        return res.json({ success: true, sheets, googleSheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL });
      }
      if (campaign.surveyType === 'globalri_literacy' || quotaDb.some(b => b.memberUid)) {
        const syncStats = await syncGlobalriQuotaAnswersFromSeolmoon({ quotaDatabase: quotaDb });
        if (syncStats.updatedCount > 0 || req.query.syncSheet === '1') {
          CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
          const ansXlsxPath = path.join(quotasDir, `globalri_literacy_answers_${campaign.loginId?.slice(-4) || '7791'}.xlsx`);
          buildGlobalriAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
          syncGlobalriAnswersToGoogleSheet({ quotaDatabase: quotaDb, pullFromSeolmoon: false }).catch(err => {
            logger.warn(`[문항답변 구글시트 동기화 경고] ${err.message}`);
          });
        }
      }
      const sheets = buildGlobalriSheetsData({ quotaDatabase: quotaDb });
      res.json({ success: true, sheets });
    } catch (err) {
      logger.error('[문항답변 시트 데이터 조회 실패]', err);
      res.status(500).json({ error: '문항답변 시트 조회 실패: ' + err.message });
    }
  });

  app.post('/api/campaigns/:id/sync-seoul-panel-sheet', async (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const quotaDb = campaign.quotaDatabase || [];
      persistSeoulPanelQuotaDatabase({ quotaDatabase: quotaDb });
      const ansXlsxPath = path.join(quotasDir, 'seoul_panel_answers_163.xlsx');
      buildSeoulPanelAnswersExcel({ quotaDatabase: quotaDb, filePath: ansXlsxPath });
      const syncRes = await syncSeoulPanelAnswersToGoogleSheet({
        quotaDatabase: quotaDb,
        sheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL
      });
      if (!syncRes.success) {
        return res.status(500).json({ success: false, error: syncRes.error || '구글 스프레드시트 동기화 실패' });
      }
      const answeredCount = quotaDb.filter(q => q.submittedAnswers && Object.keys(q.submittedAnswers).length > 0).length;
      const wait99Count = quotaDb.filter(q => q.quotaStatus === 'pilot_done' || String(q.status || '').includes('99%')).length;
      const completedCount = quotaDb.filter(q => q.quotaStatus === 'completed' || String(q.status || '').includes('완료')).length;
      res.json({
        success: true,
        message: `서울시 소상공인 사업체 패널조사(5차) 통합 ${quotaDb.length}건(2010 송준희 74건 · 2016 정소영 89건 / 99% 대기 ${wait99Count}건 · 완료 ${completedCount}건 · 응답기록 ${answeredCount}건) 구글 스프레드시트(시트2) 및 엑셀 동기화가 완료되었습니다!`,
        googleSheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL,
        ...syncRes
      });
    } catch (err) {
      logger.error('[서울시 소상공인 패널 구글시트 동기화 실패]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // [경기도 소상공인 사업체패널 3차조사 SNUM=622] 3계정(강영미/김정례/노영미) + 구글시트 휴대폰 + 홈택스 폐업조회 통합 동기화 API
  app.post('/api/campaigns/:id/sync-metrix-622', async (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }

      logger.info(`[경기도 소상공인 SNUM=622 통합 동기화] 캠페인 "${campaign.title}" 3계정(강영미·김정례·노영미) + 구글시트 휴대폰 + 사업자번호 폐업조회 시작...`);

      const syncRes = await scrapeMetrix622AllAccounts({
        snum: campaign.snum || '622',
        verifyBizStatus: req.body?.verifyBizStatus !== false,
        existingQuotaList: campaign.quotaDatabase || []
      });

      const slots = syncRes.slots || [];
      const closedCount = slots.filter(s => s.isClosedBiz).length;
      const phoneChangedCount = slots.filter(s => s.phoneNeedsSync).length;
      const wait98Count = slots.filter(s => String(s.status || '').includes('98%') || s.quotaStatus === '진행중(98%)').length;

      CampaignStore.updateCampaign(campaign.id, {
        quotaDatabase: slots,
        sparePhones: syncRes.sparePhones || [],
        googleSheetUrl: campaign.googleSheetUrl || METRIX_622_GOOGLE_SHEET_URL,
        quotaSourceFile: syncRes.jsonFileName || 'quota_metrix_gyeonggi_622_all.json'
      });

      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: slots
      });

      logger.success(`[경기도 소상공인 SNUM=622 동기화 완료] 총 ${slots.length}건 (강영미 54건·김정례 55건·노영미 62건 / 시트 휴대폰 변경대상 ${phoneChangedCount}건 / 폐업 제외 ${closedCount}건 / 98% 대기 ${wait98Count}건)`);

      res.json({
        success: true,
        message: `메트릭스(SNUM 622) 3개 계정(${slots.length}건) + 구글시트 휴대폰(${phoneChangedCount}건 변경대상) + 국세청 사업자번호 조회(폐업 제외 ${closedCount}건) 동기화가 완료되었습니다!`,
        totalCount: slots.length,
        closedCount,
        phoneChangedCount,
        wait98Count,
        sparePhones: syncRes.sparePhones || [],
        quotaDatabase: slots
      });
    } catch (err) {
      logger.error('[경기도 소상공인 SNUM=622 동기화 실패]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // [경기도 소상공인 SNUM=622] 개별 사업체 폐업 제외 토글 및 시트 휴대폰 번호 즉시 수정 API
  app.post('/api/campaigns/:id/toggle-closed-biz', (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const { index, uid, isClosedBiz, excelPhone } = req.body || {};
      const quotaDb = Array.isArray(campaign.quotaDatabase) ? campaign.quotaDatabase : [];
      const target = quotaDb.find(q =>
        (index !== undefined && Number(q.index || q.seq) === Number(index)) ||
        (uid !== undefined && String(q.uid) === String(uid))
      );
      if (!target) {
        return res.status(404).json({ error: '해당 사업체 항목을 찾을 수 없습니다.' });
      }

      if (typeof isClosedBiz === 'boolean') {
        target.isClosedBiz = isClosedBiz;
        target.manualClosedOverride = true;
        target.bizStatus = isClosedBiz ? '폐업자(수동제외)' : '계속사업자';
        if (isClosedBiz) {
          target.quotaStatus = 'excluded';
        } else {
          target.quotaStatus = String(target.status || '').includes('완료')
            ? 'completed'
            : (String(target.status || '').includes('98%') ? '진행중(98%)' : 'ready');
        }
      }

      if (typeof excelPhone === 'string') {
        target.excelPhone = excelPhone.trim();
        target.phone = target.excelPhone || target.serverPhone || '';
        target.phoneNeedsSync = Boolean(target.excelPhone && target.excelPhone !== target.serverPhone);
      }

      CampaignStore.updateCampaign(campaign.id, { quotaDatabase: quotaDb });
      const ggPath = path.join(quotasDir, 'quota_metrix_gyeonggi_622_all.json');
      if (fs.existsSync(ggPath)) {
        try {
          const ggJson = JSON.parse(fs.readFileSync(ggPath, 'utf-8'));
          ggJson.data = quotaDb;
          ggJson.rows = quotaDb;
          ggJson.updatedAt = new Date().toISOString();
          fs.writeFileSync(ggPath, JSON.stringify(ggJson, null, 2), 'utf-8');
        } catch (_) {}
      }

      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: quotaDb
      });

      res.json({
        success: true,
        message: target.isClosedBiz
          ? `[#${target.index} ${target.companyName}] 폐업 제외 처리되었습니다.`
          : `[#${target.index} ${target.companyName}] 정상 조사 대상으로 설정되었습니다.`,
        target,
        quotaDatabase: quotaDb
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

