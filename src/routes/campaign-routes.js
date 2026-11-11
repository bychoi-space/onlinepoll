import fs from 'fs';
import path from 'path';
import * as CampaignStore from '../models/campaign.js';
import { exportBusinessesToExcel } from '../utils/excel.js';
import { getIndustryGroupKey } from '../engine/persona-builder.js';
import { getAgeGroupFromBirthYear } from '../engine/globalri-literacy-scraper.js';
import { SEOUL_PANEL_DEFAULT_GSHEET_URL } from '../utils/seoul-panel-answer-excel.js';
import {
  MAX_CONCURRENT_TASKS,
  getActiveTasksList,
  isCampaignTaskRunning
} from '../services/task-manager.js';
import { logger } from '../utils/logger.js';

export function registerCampaignRoutes({
  app,
  dataDir,
  quotasDir,
  reportsDir,
  syncAssocCampaignToQuotaFile,
  ensureAssocCampaignQuotaFiles
}) {
  // 전체 캠페인 목록 조회 (실시간 배치 가동 슬롯 및 진행률 정보 결합 + 잔류 running 상태 자동 정합성 보정)
  app.get('/api/campaigns', (req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    const activeTasks = getActiveTasksList();
    const activeMap = new Map();
    activeTasks.forEach((t, idx) => {
      activeMap.set(t.campaignId, {
        ...t,
        slotNumber: idx + 1,
        maxConcurrency: MAX_CONCURRENT_TASKS
      });
    });

    const campaigns = CampaignStore.getAllCampaigns().map(camp => {
      const liveTask = activeMap.get(camp.id) || null;
      if (liveTask) {
        return {
          ...camp,
          status: 'running',
          liveTask
        };
      }
      if (camp.status === 'running') {
        CampaignStore.updateCampaign(camp.id, { status: 'ready' });
        return {
          ...camp,
          status: 'ready',
          liveTask: null
        };
      }
      return {
        ...camp,
        liveTask: null
      };
    });
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

    // 현재 서버에서 실행 중인 캠페인이 아닌데 과거 비정상 종료·교차 오염 등으로
    // quotaStatus === 'running' 또는 campaign.status === 'running'이 남아있는 경우 즉시 'ready'로 자동 보정
    const isThisCampaignRunning = isCampaignTaskRunning(campaign.id);
    if (!isThisCampaignRunning) {
      let fixedStaleRunning = false;
      if (Array.isArray(campaign.quotaDatabase)) {
        campaign.quotaDatabase.forEach(item => {
          if (item && item.quotaStatus === 'running') {
            item.quotaStatus = 'ready';
            fixedStaleRunning = true;
          }
        });
      }
      if (fixedStaleRunning || campaign.status === 'running') {
        const nextStatus = (campaign.status === 'running') ? 'ready' : campaign.status;
        CampaignStore.updateCampaign(campaign.id, {
          quotaDatabase: campaign.quotaDatabase,
          status: nextStatus
        });
        campaign.status = nextStatus;
      }
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
      campaignId: campaign.id,
      quotaDatabase
    });

    // 2. 연관된 쿼터 파일(JSON & XLSX)만 선별 동기화 (무관한 대용량 쿼터 파일 스캔 방지 및 O(1) 매칭)
    try {
      const rawLinkedFile = campaign.quotaConfig?.quotaFileName || campaign.quotaSourceFile || campaign.quotaFileName || null;
      let targetFiles = [];
      if (rawLinkedFile) {
        const safeLinked = path.basename(rawLinkedFile);
        if (fs.existsSync(path.join(quotasDir, safeLinked))) {
          targetFiles = [safeLinked];
        }
      } else if (campaign.quotaConfig?.marketName) {
        const targetMarket = String(campaign.quotaConfig.marketName).trim();
        if (targetMarket) {
          targetFiles = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json') && f.includes(targetMarket));
        }
      }

      if (targetFiles.length > 0) {
        const campByUid = new Map();
        const campByBizNo = new Map();
        const campByName = new Map();
        for (const c of quotaDatabase) {
          if (!c || typeof c !== 'object') continue;
          if (c.uid) campByUid.set(String(c.uid), c);
          if (c.bizNumber) campByBizNo.set(String(c.bizNumber), c);
          if (c.companyName) campByName.set(String(c.companyName), c);
        }

        const syncKeys = [
          'companyName', 'industry', 'bizNumber', 'ceoName', 'ceoGender', 'ceoAge',
          'phone', 'openDate', 'address', 'handledItems', 'mainProducts',
          'slotUrl', 'surveyUrl', 'evalUrl', 'slotIndex', 'slotExtra', 'ranId', 'customGuide'
        ];

        for (const qf of targetFiles) {
          const qPath = path.join(quotasDir, qf);
          const qContent = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
          if (Array.isArray(qContent.data) && qContent.data.length > 0) {
            let matched = false;
            const existingUidSet = new Set();
            const existingBizSet = new Set();
            const existingNameSet = new Set();

            for (const qItem of qContent.data) {
              const matchedCampItem =
                (qItem.uid && campByUid.get(String(qItem.uid))) ||
                (qItem.bizNumber && campByBizNo.get(String(qItem.bizNumber))) ||
                (qItem.companyName && campByName.get(String(qItem.companyName))) ||
                null;

              if (matchedCampItem) {
                for (const k of syncKeys) {
                  if (matchedCampItem[k] !== undefined) qItem[k] = matchedCampItem[k];
                }
                matched = true;
              }

              if (qItem.uid) existingUidSet.add(String(qItem.uid));
              if (qItem.bizNumber) existingBizSet.add(String(qItem.bizNumber));
              if (qItem.companyName) existingNameSet.add(String(qItem.companyName));
            }

            // 캠페인에서 수동 추가된 신규 점포도 연결된 원본 쿼터 파일에 반영
            for (const cItem of quotaDatabase) {
              if (!cItem || !cItem.companyName) continue;
              const existsInFile =
                (cItem.uid && existingUidSet.has(String(cItem.uid))) ||
                (cItem.bizNumber && existingBizSet.has(String(cItem.bizNumber))) ||
                existingNameSet.has(String(cItem.companyName));

              if (!existsInFile) {
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
                if (cItem.uid) existingUidSet.add(String(cItem.uid));
                if (cItem.bizNumber) existingBizSet.add(String(cItem.bizNumber));
                existingNameSet.add(String(cItem.companyName));
                matched = true;
              }
            }

            if (matched) {
              qContent.count = qContent.data.length;
              qContent.updatedAt = new Date().toISOString();
              const tmpQPath = `${qPath}.${process.pid}.${Date.now()}.tmp`;
              fs.writeFileSync(tmpQPath, JSON.stringify(qContent, null, 2), 'utf-8');
              fs.renameSync(tmpQPath, qPath);
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

    // 메트릭스 패널조사 전용 블루프린트 분기 (완전 격리 + 8대 업종별 맞춤 가이드 및 통계)
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
      const defaultPol = metrixBlueprint?.defaultPolicy || {};
      const savedPol = campaign.metrixPolicy || campaign.masterBaseline?.policy || {};
      const defaultIndPols = defaultPol.industryPolicies || {};
      const savedIndPols = savedPol.industryPolicies || {};
      const mergedIndustryPolicies = {};
      const indKeys = ['ind_1', 'ind_2', 'ind_3', 'ind_5', 'ind_6', 'ind_7', 'ind_8', 'ind_9'];
      indKeys.forEach(k => {
        mergedIndustryPolicies[k] = {
          ...(defaultIndPols[k] || {}),
          ...(savedIndPols[k] || {})
        };
      });

      const industryStats = {
        ind_1: { key: 'ind_1', code: '1.제조업', label: '1. 제조업', count: 0, stores: [] },
        ind_2: { key: 'ind_2', code: '2.건설업', label: '2. 건설업', count: 0, stores: [] },
        ind_3: { key: 'ind_3', code: '3.도매 및 소매업', label: '3. 도매 및 소매업', count: 0, stores: [] },
        ind_5: { key: 'ind_5', code: '5.음식 및 주점업', label: '5. 음식 및 주점업', count: 0, stores: [] },
        ind_6: { key: 'ind_6', code: '6.전문, 과학 및 기술 서비스업', label: '6. 전문·과학·기술 서비스업', count: 0, stores: [] },
        ind_7: { key: 'ind_7', code: '7.교육 서비스업', label: '7. 교육 서비스업', count: 0, stores: [] },
        ind_8: { key: 'ind_8', code: '8.예술, 스포츠 및 여가 관련 서비스업', label: '8. 예술·스포츠·여가 서비스업', count: 0, stores: [] },
        ind_9: { key: 'ind_9', code: '9.수리 및 개인 서비스업', label: '9. 수리 및 개인 서비스업', count: 0, stores: [] }
      };
      (campaign.quotaDatabase || []).forEach(q => {
        const s = String(q.industry || '').trim();
        let ik = q.industryKey || 'ind_3';
        if (!industryStats[ik]) {
          if (s.startsWith('1.') || s.includes('제조')) ik = 'ind_1';
          else if (s.startsWith('2.') || s.includes('건설')) ik = 'ind_2';
          else if (s.startsWith('3.') || s.includes('도매') || s.includes('소매')) ik = 'ind_3';
          else if (s.startsWith('5.') || s.includes('음식') || s.includes('주점')) ik = 'ind_5';
          else if (s.startsWith('6.') || s.includes('전문') || s.includes('과학') || s.includes('기술')) ik = 'ind_6';
          else if (s.startsWith('7.') || s.includes('교육')) ik = 'ind_7';
          else if (s.startsWith('8.') || s.includes('예술') || s.includes('스포츠') || s.includes('여가')) ik = 'ind_8';
          else if (s.startsWith('9.') || s.includes('수리') || s.includes('개인')) ik = 'ind_9';
          else ik = 'ind_3';
        }
        if (industryStats[ik]) {
          industryStats[ik].count++;
          industryStats[ik].stores.push(`${q.companyName}(${q.surveyorId || '-'})`);
        }
      });

      const effectivePolicy = {
        ...defaultPol,
        ...savedPol,
        industryPolicies: mergedIndustryPolicies
      };
      return res.json({
        surveyType: 'metrix_panel',
        blueprint: metrixBlueprint,
        policy: effectivePolicy,
        industryPolicies: mergedIndustryPolicies,
        industryStats,
        googleSheetUrl: campaign.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit?gid=1453131911#gid=1453131911',
        campaignTitle: campaign.title,
        slotCount: (campaign.quotaDatabase || []).length,
        hasCustomBaseline: !!campaign.metrixPolicy
      });
    }

    // 메트릭스 서울시 소상공인 사업체 패널조사(5차) 전용 블루프린트 분기
    if (campaign.surveyType === 'metrix_seoul_panel') {
      const defaultSeoulPolicy = {
        preserveExistingInputs: true,
        haltBeforeFinalSubmit: true,
        B8: '2',
        M1_ranks: ['6', '12', '5'],
        M2_ranks: ['2', '3'],
        M3_ranks: ['5', '2', '7'],
        N1_1: '2',
        N1_2: '3',
        N1_3: '2',
        N1_4: '4',
        N1_6: '3',
        N1_7: '4',
        N2_1_1: '2',
        N2_1_2: '3',
        N2_2_1: '2',
        N2_2_2: '3',
        N2_3_1: '3',
        N2_3_2: '4',
        N3_ranks: ['1', '2'],
        N4: '2',
        N5: '3',
        N6: '1',
        N6_1_1: '2',
        N6_1_2: '1',
        N6_1_3: '2',
        O1: '1'
      };
      const effectivePolicy = {
        ...defaultSeoulPolicy,
        ...(campaign.surveyBlueprintPolicy || campaign.masterBaseline?.policy || {})
      };
      return res.json({
        surveyType: 'metrix_seoul_panel',
        blueprint: {
          title: '(신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)',
          defaultPolicy: defaultSeoulPolicy
        },
        policy: effectivePolicy,
        googleSheetUrl: campaign.googleSheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL,
        campaignTitle: campaign.title,
        slotCount: (campaign.quotaDatabase || []).length,
        hasCustomBaseline: true
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
    const isMetrixSeoul = (campaign.surveyType === 'metrix_seoul_panel');
    const isKona = (campaign.surveyType === 'kona_youth');
    const isHrcEnergy = (campaign.surveyType === 'hrc_energy');
    const isGlobalriLiteracy = (campaign.surveyType === 'globalri_literacy');

    CampaignStore.updateCampaign(campaign.id, {
      masterBaseline: baseline,
      hasMasterBlueprint: true,
      ...(isAssoc ? { assocPolicy: baseline.policy || baseline } : {}),
      ...(isMetrix ? { metrixPolicy: baseline.policy || baseline } : {}),
      ...(isMetrixSeoul ? {
        surveyBlueprintPolicy: baseline.policy || baseline,
        ...(baseline.googleSheetUrl ? { googleSheetUrl: baseline.googleSheetUrl } : {})
      } : {}),
      ...(isKona ? { konaPolicy: baseline.policy || baseline } : {}),
      ...(isHrcEnergy ? { hrcEnergyPolicy: baseline.policy || baseline } : {}),
      ...(isGlobalriLiteracy ? { globalriLiteracyPolicy: baseline.policy || baseline } : {})
    });

    logger.success(`[마스터 기준점 저장] 캠페인 "${campaign.title}"의 ${isMetrixSeoul ? '서울시 소상공인 패널조사(5차) 응답 가이드' : (isGlobalriLiteracy ? '제5차 성인문해능력조사 나이대별 그룹 가이드' : (isHrcEnergy ? '에너지총조사 건물 부문 응답 규칙' : (isKona ? '코나체인 청소년 설문 기준 가이드' : (isMetrix ? '메트릭스 패널조사 기준 가이드' : (isAssoc ? '상인회 25단계 정책 가이드' : '17단계 마스터 기준점')))))}이 저장되었습니다! 🎯`);
    res.json({
      success: true,
      message: isMetrixSeoul
        ? '서울시 소상공인 사업체 패널조사(5차) 응답 가이드라인 및 구글 시트 설정이 성공적으로 저장되었습니다.'
        : (isGlobalriLiteracy
          ? '제5차 성인문해능력조사 나이대별(20대/30대/40대/50대/60대/70대+) 그룹 가이드라인이 성공적으로 저장되었습니다.'
          : (isHrcEnergy
            ? '2025년 기준 에너지총조사 [건물 부문] 응답 기준 가이드라인(기입력 보존 정책 포함)이 성공적으로 저장되었습니다.'
            : (isKona
              ? '화성특례시 청소년 설문조사 기준 가이드라인이 성공적으로 저장되었습니다.'
              : (isMetrix
                ? '메트릭스 패널조사 기준 가이드라인이 성공적으로 저장되었습니다.'
                : (isAssoc
                  ? '상인회 정책 가이드라인이 성공적으로 저장되었습니다.'
                  : '마스터 기준점(Baseline)이 성공적으로 저장되었습니다. 이제 전체 배치 자동화를 가동할 수 있습니다.'))))),
      baseline
    });
  });

  // 선택한 쿼터 항목들에 개별 설문 응답 가이드(customGuide) 일괄 부여·저장 API
  app.post('/api/campaigns/:id/apply-selected-guide', (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const { targetIndices = [], customGuide = null, guide = {}, guideSummary = '', presetLabel = '' } = req.body;
    const effectiveGuide = (customGuide && typeof customGuide === 'object' && Object.keys(customGuide).length > 0)
      ? customGuide
      : (guide && typeof guide === 'object' ? guide : {});
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
        item.customGuide = { ...effectiveGuide };
        item.guideApplied = true;
        if (campaign.surveyType === 'metrix_panel') {
          item.guideSummary = guideSummary || `${presetLabel || item.industry || '맞춤가이드'} · 영업 ${effectiveGuide.operating_openHour || '09'}~${effectiveGuide.operating_closeHour || '20'}시 · 원재료 ${effectiveGuide.cost_materialRatio ?? 55}%`;
        } else {
          item.guideSummary = guideSummary || `Part C: ${effectiveGuide.partC_correctCountMin ?? 18}~${effectiveGuide.partC_correctCountMax ?? 20}점 · D5(${String(effectiveGuide.D5_1_healthLiteracy || '4_5').replace('_', '~')})`;
        }
        item.guidePresetLabel = presetLabel || '';
        item.guideUpdatedAt = new Date().toISOString();
        appliedCount++;
        appliedNames.push(`#${seq} ${item.companyName || item.memberName || item.respondentName || item.ceoName || '-'}`);
      }
    });

    CampaignStore.updateCampaign(campaign.id, {
      quotaDatabase: quotaDb,
      hasMasterBlueprint: true
    });

    logger.broadcast({
      type: 'QUOTA_UPDATED',
      campaignId: campaign.id,
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

  // 1차 제반 작업: 조사 쿼터(Quota) DB 구축 API
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
        const { fetchMarketBzBusinesses } = await import('../engine/marketbz.js');
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
      const isGlobalriLiteracy = (quotaMeta.type === 'GLOBALRI_ADULT_LITERACY' || quotaMeta.surveyType === 'globalri_literacy' || safeFilename.includes('globalri_adult_literacy'));
      const isGallupReturnFarm = (quotaMeta.type === 'GALLUP_RETURN_FARM' || quotaMeta.surveyType === 'gallup_return_farm' || safeFilename.includes('gallup_20263603'));
      const isHrcEnergy = (quotaMeta.type === 'HRC_ENERGY_BUILDING' || quotaMeta.surveyType === 'hrc_energy' || safeFilename.includes('hrc_energy'));
      const isKona = (quotaMeta.type === 'KONA_YOUTH' || quotaMeta.surveyType === 'kona_youth');

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
        quotaType: (isGlobalriLiteracy || isGallupReturnFarm || isKona) ? 'b2c' : 'b2b',
        ...(isAssoc ? {
          surveyType: 'kstat_assoc',
          kstatLoginId: quotaMeta.surveyorId || businesses[0]?.surveyorAccount || campaign.kstatLoginId || '가온박정순',
          kstatLoginPw: quotaMeta.kstatLoginPw || campaign.kstatLoginPw || '1234',
          kstatListUrl: quotaMeta.kstatListUrl || campaign.kstatListUrl || 'https://survey.kstat.co.kr/kstat_survey/survey/2026070801/list.php?pridSel=2026070801&josa=tapi'
        } : {}),
        ...(isGlobalriLiteracy ? {
          surveyType: 'globalri_literacy',
          loginId: quotaMeta.loginId || campaign.loginId || '01071447791',
          loginPw: quotaMeta.loginPw || campaign.loginPw || '2038020',
          surveyorName: quotaMeta.surveyorName || campaign.surveyorName || '노영미7791',
          quotaSourceFile: safeFilename
        } : {}),
        ...(isGallupReturnFarm ? {
          surveyType: 'gallup_return_farm',
          loginId: quotaMeta.surveyorId || campaign.loginId || '076_000009',
          surveyorName: quotaMeta.surveyorName || campaign.surveyorName || '백영자'
        } : {}),
        ...(isHrcEnergy ? {
          surveyType: 'hrc_energy',
          loginId: quotaMeta.surveyorId || campaign.loginId || '700275',
          loginPw: quotaMeta.surveyorId || campaign.loginPw || '700275',
          surveyorName: quotaMeta.surveyorName || campaign.surveyorName || ''
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
        ...(isGlobalriLiteracy ? {
          loginId: quotaMeta.loginId || '01071447791',
          loginPw: quotaMeta.loginPw || '2038020',
          surveyorName: quotaMeta.surveyorName || '노영미7791',
          quotaSourceFile: safeFilename
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
        usedAt: b.usedAt || null
      }));

      // 기존 캠페인 중 사용자가 커스텀 설정한 masterBaseline이 있으면 신규 캠페인에 자동 복제 장착
      let inheritedBaseline = null;
      const allCamps = CampaignStore.getAllCampaigns();
      const bestSource = isGlobalriLiteracy
        ? allCamps.find(c => c.surveyType === 'globalri_literacy' && c.masterBaseline)
        : (isAssoc
          ? (allCamps.find(c => (c.surveyType === 'kstat_assoc' || String(c.title || '').includes('상인회')) && c.masterBaseline && c.masterBaseline.assocMode) ||
             allCamps.find(c => (c.surveyType === 'kstat_assoc' || String(c.title || '').includes('상인회')) && c.masterBaseline))
          : (allCamps.find(c => c.surveyType !== 'kstat_assoc' && c.surveyType !== 'globalri_literacy' && c.masterBaseline && c.masterBaseline.groups) ||
             allCamps.find(c => c.surveyType !== 'kstat_assoc' && c.surveyType !== 'globalri_literacy' && c.masterBaseline)));
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

  // 캠페인 쿼터와 케이스탯 1:1 슬롯 매핑 바인딩
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
            delete biz.slotUrl;
            delete biz.surveyUrl;
            delete biz.evalUrl;
            delete biz.ranId;
            delete biz.slotIndex;
            delete biz.slotExtra;
            continue;
          }

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
        campaignId: campaign.id,
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

  // 한국리서치 에너지총조사(hrc_energy) 쿼터별 T41(입점시설) / B1-1(냉난방설비) 가이드 저장
  app.post('/api/campaigns/:id/hrc-quota-guide', (req, res) => {
    try {
      const campaign = CampaignStore.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
      }
      const quotaDb = Array.isArray(campaign.quotaDatabase) ? campaign.quotaDatabase : [];
      if (quotaDb.length === 0) {
        return res.status(400).json({ error: '캠페인에 등록된 쿼터 데이터가 없습니다.' });
      }

      const { targetSeqs = [], targetUids = [], t41Codes, b11Codes, ehpUnitKw } = req.body || {};
      const seqSet = new Set((Array.isArray(targetSeqs) ? targetSeqs : []).map(n => Number(n)));
      const uidSet = new Set((Array.isArray(targetUids) ? targetUids : []).map(u => String(u).trim()));

      let updatedCount = 0;
      quotaDb.forEach((item, idx) => {
        const seq = Number(item.index || item.seq || (idx + 1));
        const uid = String(item.uid || '').trim();
        if (seqSet.has(seq) || (uid && uidSet.has(uid))) {
          if (Array.isArray(t41Codes)) {
            item.t41Codes = t41Codes.map(String).filter(Boolean);
          }
          if (Array.isArray(b11Codes)) {
            item.b11Codes = b11Codes.map(String).filter(Boolean);
          }
          if (ehpUnitKw !== undefined && ehpUnitKw !== null && ehpUnitKw !== '') {
            const parsedKw = Number(ehpUnitKw);
            if (!Number.isNaN(parsedKw) && parsedKw > 0) {
              item.ehpUnitKw = parsedKw;
            }
          }
          updatedCount++;
        }
      });

      const updated = CampaignStore.updateCampaign(campaign.id, {
        quotaDatabase: quotaDb
      });

      // 원본 쿼터 JSON 파일(quota_hrc_energy_260342.json 등) 동기화
      try {
        const hrcQuotaPath = path.join(quotasDir, 'quota_hrc_energy_260342.json');
        if (fs.existsSync(hrcQuotaPath)) {
          const qJson = JSON.parse(fs.readFileSync(hrcQuotaPath, 'utf8'));
          const qList = qJson.data || qJson.merchants || [];
          qList.forEach((qm, qIdx) => {
            const qUid = String(qm.uid || '').trim();
            const matched = quotaDb.find(b => (qUid && String(b.uid || '').trim() === qUid) || Number(b.index || b.seq) === Number(qm.index || qm.seq || (qIdx + 1)));
            if (matched) {
              if (Array.isArray(matched.t41Codes)) qm.t41Codes = matched.t41Codes;
              if (Array.isArray(matched.b11Codes)) qm.b11Codes = matched.b11Codes;
              if (matched.ehpUnitKw) qm.ehpUnitKw = matched.ehpUnitKw;
            }
          });
          fs.writeFileSync(hrcQuotaPath, JSON.stringify(qJson, null, 2), 'utf8');
        }
      } catch (syncErr) {
        logger.warn('[HRC 에너지총조사 쿼터 가이드 파일 동기화 주의]', syncErr.message);
      }

      logger.broadcast({
        type: 'QUOTA_UPDATED',
        campaignId: campaign.id,
        quotaDatabase: updated.quotaDatabase
      });

      res.json({
        success: true,
        updatedCount,
        message: `${updatedCount}개 건물 쿼터에 T41(입점시설) 및 B1-1(냉난방설비) 가이드가 저장되었습니다.`,
        quotaDatabase: updated.quotaDatabase
      });
    } catch (err) {
      logger.error('[HRC 쿼터 가이드 저장 실패]', err);
      res.status(500).json({ error: '쿼터 가이드 저장 중 오류가 발생했습니다: ' + err.message });
    }
  });

  // 단계별 화면 캡처 목록 조회 (쿼터 사업자별 1:1 매핑)
  app.get('/api/campaigns/:id/screenshots', (req, res) => {
    const campaign = CampaignStore.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    const quotaDb = campaign.quotaDatabase || [];
    const quotaIndex = req.query.quotaIndex ? parseInt(req.query.quotaIndex, 10) : null;

    if (quotaIndex) {
      const targetBiz = quotaDb.find(b => (b.index || b.seq) === quotaIndex);
      if (!targetBiz) {
        return res.status(404).json({ error: '해당 순번의 쿼터 사업자를 찾을 수 없습니다.' });
      }

      if (targetBiz.capturedSteps && targetBiz.capturedSteps.length > 0) {
        return res.json({
          success: true,
          bizName: targetBiz.companyName,
          quotaIndex,
          screenshots: targetBiz.capturedSteps
        });
      }

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
}
