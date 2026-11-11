/**
 * 조사 쿼터(Quota) 생성, 온누리/마켓비즈/메트릭스 연동 및 Excel/JSON 내보내기 API 라우트 모듈
 */
import fs from 'fs';
import path from 'path';

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

export function registerQuotaRoutes({
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
}) {
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
      const { fetchMarketBzBusinesses } = await import('../engine/marketbz.js');
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

      const rawBaseName = path.basename(fileName || 'uploaded_quota.xlsx', path.extname(fileName || 'uploaded_quota.xlsx'))
        .replace(/^AutoSurvey_조사쿼터_표준양식_업로드[_\-\s]*/i, '')
        .replace(/[^가-힣a-zA-Z0-9_\-\s]/g, '')
        .trim();

      let targetCamp = campaignId ? CampaignStore.getCampaignById(campaignId) : null;
      const campMarketFallback = (targetCamp && targetCamp.quotaConfig?.marketName) ? String(targetCamp.quotaConfig.marketName).trim() : '';

      const cleanMarketInput = (marketName || '').trim().replace(/^AutoSurvey_조사쿼터_표준양식_업로드[_\-\s]*/i, '').trim();
      const inferredMarket = cleanMarketInput || rawBaseName || campMarketFallback || '업로드시장';

      const parsedData = parseExcelQuotaBuffer(buffer, {
        defaultMarketName: inferredMarket,
        autoEnrich: autoEnrich !== false
      });

      // 엑셀 시트 내부에 '시장명' 컬럼이 명시적으로 들어있는 경우 시트 시장명을 최우선 반영
      const sheetMarketName = parsedData[0]?.hasSheetMarketName ? parsedData[0]?.marketName : '';
      const finalMarketName = sheetMarketName || cleanMarketInput || parsedData[0]?.marketName || inferredMarket;

      let rawTitle = (title || '').trim();
      if (rawTitle && sheetMarketName && inferredMarket && rawTitle.includes(inferredMarket) && sheetMarketName !== inferredMarket) {
        rawTitle = rawTitle.replace(inferredMarket, sheetMarketName);
      }
      const finalTitle = rawTitle || `2026_${finalMarketName}_업종별${parsedData.length}개_조사쿼터`;

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
        surveyType: (targetCamp && targetCamp.surveyType) ? targetCamp.surveyType : 'kstat_store',
        linkedCampaignId: (campaignId && targetCamp) ? campaignId : null,
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
      if (campaignId && targetCamp) {
        const quotaDb = parsedData.map((row, i) => ({
          index: i + 1,
          seq: i + 1,
          slotIndex: row.slotIndex || (i + 1),
          ...row,
          quotaStatus: 'ready',
          usedAt: null,
          surveyorAccount: targetCamp.kstatLoginId || '가온김영옥'
        }));

        const nextQuotaConfig = {
          ...(targetCamp.quotaConfig || {}),
          quotaSource: 'EXCEL_UPLOAD',
          quotaFileName: jsonFileName,
          quotaTitle: finalTitle,
          marketName: finalMarketName || targetCamp.quotaConfig?.marketName || '',
          targetCount: quotaDb.length,
          selectedFields: columns.map(c => c.key)
        };

        let inheritedBaseline = targetCamp.masterBaseline || null;
        let inheritedHasBlueprint = Boolean(targetCamp.hasMasterBlueprint || targetCamp.masterBaseline);
        if (!inheritedBaseline && (!targetCamp.surveyType || targetCamp.surveyType === 'kstat_store')) {
          const allCamps = CampaignStore.getAllCampaigns();
          const templateCamp = allCamps.find(c =>
            c.id !== campaignId &&
            (!c.surveyType || c.surveyType === 'kstat_store') &&
            c.masterBaseline &&
            Object.keys(c.masterBaseline).length > 0
          );
          if (templateCamp) {
            inheritedBaseline = JSON.parse(JSON.stringify(templateCamp.masterBaseline));
            inheritedHasBlueprint = true;
          }
        }

        const campUpdatePayload = {
          status: targetCamp.status === 'running' ? 'running' : 'ready',
          quotaDatabase: quotaDb,
          quotaSourceFile: jsonFileName,
          quotaConfig: nextQuotaConfig
        };
        if (inheritedBaseline && !targetCamp.masterBaseline) {
          campUpdatePayload.masterBaseline = inheritedBaseline;
          campUpdatePayload.hasMasterBlueprint = inheritedHasBlueprint;
        }

        updatedCampaign = CampaignStore.updateCampaign(campaignId, campUpdatePayload);
        logger.broadcast({
          type: 'QUOTA_UPDATED',
          campaignId,
          quotaDatabase: quotaDb
        });
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
      const { getOnnuriRegions } = await import('../engine/onnuri.js');
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
      const { getOnnuriDistricts } = await import('../engine/onnuri.js');
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
      const { getMarketsByDistrict } = await import('../engine/onnuri.js');
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
      const { getMarketIndustryStats } = await import('../engine/onnuri.js');
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
      const { getMasterDBStatus } = await import('../engine/onnuri.js');
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

    (async () => {
      try {
        const { buildMasterDB } = await import('../../scripts/build-onnuri-master-db.js');
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
      const { buildHybridOnnuriQuota } = await import('../engine/hybrid-quota.js');
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
  // 파일 변경 시각(mtimeMs) 및 크기(size) 기반 쿼터 메타데이터 인메모리 캐시 (대용량 JSON 반복 파싱 방지)
  const quotaSummaryCache = new Map();

  // 1. 생성된 쿼터 목록 조회 (업종별 분포 및 통계 포함)
  app.get('/api/quota/list', (req, res) => {
    try {
      ensureAssocCampaignQuotaFiles();
      const allCampaigns = (CampaignStore && typeof CampaignStore.getAllCampaigns === 'function')
        ? CampaignStore.getAllCampaigns()
        : [];
      const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
      const activeFileSet = new Set(files);
      for (const cachedKey of quotaSummaryCache.keys()) {
        if (!activeFileSet.has(cachedKey)) {
          quotaSummaryCache.delete(cachedKey);
        }
      }

      const list = files.map(f => {
        const jsonPath = path.join(quotasDir, f);
        const stat = fs.statSync(jsonPath);
        const excelName = f.replace('.json', '.xlsx');
        const hasExcel = fs.existsSync(path.join(quotasDir, excelName));

        let meta = quotaSummaryCache.get(f);
        if (!meta || meta.mtimeMs !== stat.mtimeMs || meta.size !== stat.size) {
          const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          const data = content.data || content.rows || [];

          const industryDist = {};
          const isHrcEnergy = content.type === 'HRC_ENERGY_BUILDING' || content.surveyType === 'hrc_energy' || f.includes('hrc_energy');
          const isGlobalriLiteracy = content.type === 'GLOBALRI_ADULT_LITERACY' || content.surveyType === 'globalri_literacy' || f.includes('globalri_adult_literacy');
          const isGallupReturnFarm = content.type === 'GALLUP_RETURN_FARM' || content.surveyType === 'gallup_return_farm' || f.includes('gallup_20263603');
          const isAssoc = content.type === 'KSTAT_ASSOC' || content.surveyType === 'kstat_assoc' || f.startsWith('quota_assoc_');
          const isMetrix = content.type === 'METRIX_PANEL' || content.surveyType === 'metrix_panel' || f.toLowerCase().includes('metrix');
          const isKona = content.type === 'KONA_YOUTH' || content.surveyType === 'kona_youth' || f.toLowerCase().includes('kona');

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

          const allDataDone = data.length > 0 && data.every(item =>
            item.status === '완료' || item.quotaStatus === 'completed' || item.quotaStatus === 'used' || item.surveyCompleted === true || item.serverStatus === '99'
          );

          meta = {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            title: content.title || f,
            rawType: content.type || (isAssoc ? 'KSTAT_ASSOC' : (isHrcEnergy ? 'HRC_ENERGY_BUILDING' : (isGlobalriLiteracy ? 'GLOBALRI_ADULT_LITERACY' : (isGallupReturnFarm ? 'GALLUP_RETURN_FARM' : (isMetrix ? 'METRIX_PANEL' : 'MARKETBZ_DIRECT'))))),
            rawSurveyType: content.surveyType || null,
            fallbackSurveyType: isGallupReturnFarm ? 'gallup_return_farm' : (isGlobalriLiteracy ? 'globalri_literacy' : (isHrcEnergy ? 'hrc_energy' : (isKona ? 'kona_youth' : (isMetrix ? 'metrix_panel' : (isAssoc ? 'kstat_assoc' : 'kstat_store'))))),
            rawLinkedCampaignId: content.linkedCampaignId || null,
            selectedCount: content.selectedCount || null,
            substituteCount: content.substituteCount || null,
            surveyorId: content.surveyorId || null,
            surveyorName: content.surveyorName || null,
            marketName: content.marketName || (isAssoc ? `전통시장 상인회 · ${content.surveyorId || ''}` : (isHrcEnergy ? `에너지총조사 [건물] · ${content.surveyorName || ''} (${content.surveyorId || ''})` : (isGlobalriLiteracy ? `성인문해능력조사 · ${content.surveyorName || ''}` : (isGallupReturnFarm ? `귀농귀촌 실태조사 · ${content.surveyorName || ''}` : null)))),
            keyword: content.keyword,
            count: content.count || data.length,
            targetTotal,
            mbzFailedCount,
            isComplete,
            requestParams: content.requestParams || null,
            createdAt: content.createdAt,
            updatedAt: content.updatedAt || content.createdAt,
            industryDistribution: Object.keys(industryDist).length > 0 ? industryDist : null,
            allDataDone
          };
          quotaSummaryCache.set(f, meta);
        }

        const matchedCamps = allCampaigns.filter(c =>
          (meta.rawLinkedCampaignId && c.id === meta.rawLinkedCampaignId) ||
          c.quotaSourceFile === f ||
          c.quotaConfig?.quotaFileName === f
        );
        const linkedCamp =
          matchedCamps.find(c => c.status === 'running') ||
          matchedCamps.find(c => c.status === 'ready' || c.status === 'building') ||
          matchedCamps.find(c => c.status === 'completed') ||
          matchedCamps[0] ||
          null;

        const inferredSurveyType = meta.rawSurveyType ||
          (linkedCamp ? linkedCamp.surveyType : null) ||
          meta.fallbackSurveyType;

        const effectiveCampStatus = linkedCamp
          ? linkedCamp.status
          : (meta.allDataDone ? 'completed' : null);
        const effectiveCompletedAt = (linkedCamp && linkedCamp.status === 'completed')
          ? (linkedCamp.completedAt || linkedCamp.updatedAt || linkedCamp.createdAt)
          : (meta.allDataDone ? meta.updatedAt : null);

        return {
          fileName: f,
          title: meta.title,
          type: meta.rawType,
          surveyType: inferredSurveyType,
          linkedCampaignId: linkedCamp ? linkedCamp.id : meta.rawLinkedCampaignId,
          campaignStatus: effectiveCampStatus,
          campaignCompletedAt: effectiveCompletedAt,
          campaignTitle: linkedCamp ? linkedCamp.title : null,
          selectedCount: meta.selectedCount,
          substituteCount: meta.substituteCount,
          surveyorId: meta.surveyorId,
          surveyorName: meta.surveyorName,
          marketName: meta.marketName,
          keyword: meta.keyword,
          count: meta.count,
          targetTotal: meta.targetTotal,
          mbzFailedCount: meta.mbzFailedCount,
          isComplete: meta.isComplete,
          requestParams: meta.requestParams,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          industryDistribution: meta.industryDistribution,
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

  // 3. 특정 쿼터 데이터 수정 및 Excel 실시간 동기화
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

      fs.writeFileSync(jsonPath, JSON.stringify(content, null, 2), 'utf-8');

      const excelName = safeFilename.replace('.json', '.xlsx');
      const excelPath = path.join(quotasDir, excelName);
      exportBusinessesToExcel({
        data: content.data,
        columns,
        filePath: excelPath
      });

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
      const { batchEnrichQuota } = await import('../engine/enricher.js');

      logger.info(`[쿼터 보강 요청] "${quotaMeta.title}" (${safeFilename}) 결측치 외부 탐색 시작...`);

      const { enrichedCount, quotaList } = await batchEnrichQuota(quotaMeta.data, (progress) => {
        logger.info(`[보강 진행] (${progress.current}/${progress.total}) ${progress.companyName} 확인 중 (보강: ${progress.enrichedCount}건)`);
      });

      quotaMeta.data = quotaList;
      quotaMeta.enrichedAt = new Date().toISOString();
      quotaMeta.lastEnrichedCount = enrichedCount;

      fs.writeFileSync(jsonPath, JSON.stringify(quotaMeta, null, 2), 'utf-8');

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
      const { batchEnrichQuota } = await import('../engine/enricher.js');
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
}

