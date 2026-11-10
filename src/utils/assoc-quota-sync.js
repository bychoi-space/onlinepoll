import fs from 'fs';
import path from 'path';
import * as CampaignStore from '../models/campaign.js';
import { exportBusinessesToExcel } from './excel.js';
import { logger } from './logger.js';

export function buildAssocQuotaColumns() {
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

export function normalizeAssocQuotaItem(item, idx, fallbackSurveyor = '') {
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

export function createAssocQuotaSyncHelpers({ quotasDir }) {
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

  return {
    buildAssocQuotaColumns,
    normalizeAssocQuotaItem,
    syncAssocCampaignToQuotaFile,
    ensureAssocCampaignQuotaFiles
  };
}
