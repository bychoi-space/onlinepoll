/**
 * 서버 기동 시 비정상 중단된 running 상태 초기화 및 기본 캠페인 자동 시드 모듈
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';

const __seederDir = path.dirname(fileURLToPath(import.meta.url));

export function seedInitialCampaigns({
  CampaignStore,
  quotasDir,
  findHrcQuotaJsonPath,
  findGlobalriQuotaJsonPath,
  GALLUP_20263603_DEFAULT_URL
}) {
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
        if (camp.status === 'completed' && (camp.surveyType === 'globalri_literacy' || camp.surveyType === 'gallup_return_farm' || camp.surveyType === 'kmac_kbpi')) {
          const hasUnrunReady = camp.quotaDatabase.some(q => !q.quotaStatus || q.quotaStatus === 'ready');
          if (hasUnrunReady) {
            camp.status = 'ready';
            needSave = true;
          }
        }
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
      },
      {
        id: 'camp_hrc_energy_701494',
        loginId: '701494',
        surveyorName: '유희정',
        title: '2025년 기준 에너지총조사 [건물] - 701494 (유희정 / 선정 47건)',
        description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 서울 구로구·송파구·용산구 (선정 47건 / 대체 17건 · 기입력 보존)'
      },
      {
        id: 'camp_hrc_energy_700193',
        loginId: '700193',
        surveyorName: '강영미',
        title: '2025년 기준 에너지총조사 [건물] - 700193 (강영미 / 선정 5건 · 전체 15건)',
        description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 서울 노원구 (선정 5건 / 대체 10건 · 구글시트 가이드 연동)'
      },
      {
        id: 'camp_hrc_energy_700189',
        loginId: '700189',
        surveyorName: '김정례',
        title: '2025년 기준 에너지총조사 [건물] - 700189 (김정례 / 선정 15건 · 전체 25건)',
        description: '한국리서치 TAPI(2026-89-0342C) 건물 부문 조사 · 경기 남양주시 (선정 15건 / 대체 10건 · 구글시트 가이드 연동)'
      }
    ];

    const GUIDE_SYNC_KEYS = [
      'sq12BuildingName', 'expectedTypeCode', 'expectedTypeDesc', 'isPublicOrSchool',
      'a51Raw', 'a51Code', 't41Raw', 't41Codes', 'b11Raw', 'b11Codes', 'hotWaterOnlyBoiler',
      'c52Raw', 'c52Codes', 'zebCheckAfter2020', 'renewableRaw', 't71Codes',
      'contractPowerKw', 'd21Raw', 'd21UseGas', 'estimatedGrossAreaM2', 'guideFromSheet',
      'selectionType', 'cellPriority', 'cellKey', 'quotaCode1', 'quotaCode2',
      'giftSigned', 'giftBrand', 'giftValue', 'giftSignerName', 'giftSignerPhone', 'giftStyleLabel'
    ];

    let sheetGuideOverlay = {};
    try {
      const overlayPath = path.join(__seederDir, 'hrc-energy-sheet-guides.json');
      if (fs.existsSync(overlayPath)) {
        sheetGuideOverlay = JSON.parse(fs.readFileSync(overlayPath, 'utf-8'));
      }
    } catch (overlayErr) {
      console.warn('[CampaignSeeder] HRC 가이드 오버레이 로드 경고:', overlayErr.message);
    }

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
          let diskQuotaModified = false;
          quotaDb = rawList.map((item, idx) => {
            const uidStr = String(item.uid || '').trim();
            const guideEntry = sheetGuideOverlay[uidStr];
            if (guideEntry) {
              for (const gk of GUIDE_SYNC_KEYS) {
                if (guideEntry[gk] !== undefined && JSON.stringify(item[gk]) !== JSON.stringify(guideEntry[gk])) {
                  item[gk] = guideEntry[gk];
                  diskQuotaModified = true;
                }
              }
              for (const nonEmptyKey of ['contactName', 'phone', 'mainUse', 'areaScale', 'sido', 'sigungu', 'sampleType', 'memo']) {
                if (guideEntry[nonEmptyKey] && item[nonEmptyKey] !== guideEntry[nonEmptyKey]) {
                  item[nonEmptyKey] = guideEntry[nonEmptyKey];
                  if (nonEmptyKey === 'mainUse') item.industry = guideEntry.mainUse;
                  if (nonEmptyKey === 'contactName' && !item.giftSigned) item.ceoName = guideEntry.contactName;
                  diskQuotaModified = true;
                }
              }
              if (guideEntry.buildingName && item.buildingName !== guideEntry.buildingName) {
                item.buildingName = guideEntry.buildingName;
                diskQuotaModified = true;
              }
              if (guideEntry.roadAddress && !item.roadAddress) {
                item.roadAddress = guideEntry.roadAddress;
                diskQuotaModified = true;
              }
              if (guideEntry.jibunAddress && !item.jibunAddress) {
                item.jibunAddress = guideEntry.jibunAddress;
                diskQuotaModified = true;
              }
              if (guideEntry.quotaStatus === 'completed' && item.quotaStatus !== 'completed') {
                item.status = '완료';
                item.siteStatus = '완료';
                item.quotaStatus = 'completed';
                item.progress = '100%';
                item.surveyCompleted = '완료';
                diskQuotaModified = true;
              }
            }
            const isDone = (['800715', '800164', '800173'].includes(uidStr) || item.status === '완료' || item.quotaStatus === 'completed');
            return {
              ...item,
              index: item.index || idx + 1,
              seq: item.seq || idx + 1,
              companyName: item.buildingName || item.companyName || `건물_${uidStr}`,
              ceoName: item.giftSignerName || item.contactName || item.ceoName || '관리소장',
              slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uidStr}&page=1`,
              surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uidStr}&page=1`,
              status: isDone ? '완료' : (item.status || '대기'),
              quotaStatus: isDone ? 'completed' : (item.quotaStatus || 'ready'),
              progress: isDone ? '100%' : (item.progress || '0%')
            };
          });
          if (diskQuotaModified) {
            qContent.data = rawList;
            qContent.items = rawList;
            qContent.updatedAt = new Date().toISOString();
            writeJsonAtomicSync(qPath, qContent);
            try {
              const xlsxPath = qPath.replace(/\.json$/i, '.xlsx');
              const excelRows = rawList.map(it => ({
                '번호': it.seq,
                '선정구분': it.selectionType,
                '셀내우선순위': it.cellPriority,
                'UID': it.uid,
                '건물명(SQ12)': it.sq12BuildingName || it.buildingName || '없음',
                '이름': it.contactName || '',
                '전화번호': it.phone || '',
                '표본구분': it.sampleType || '',
                '주용도': it.mainUse || '',
                '면적규모': it.areaScale || '',
                '시도': it.sido || '',
                '시군구': it.sigungu || '',
                'A5-1(공조방식)': it.a51Raw || '',
                'T41(입점시설)': it.t41Raw || '',
                'B1-1(설비현황)': it.b11Raw || '',
                'C5-2(효율개선)': it.c52Raw || '',
                '신재생에너지': it.renewableRaw || '',
                '계약전력(kW)': it.contractPowerKw || '',
                'D2-1(도시가스)': it.d21Raw || '',
                '예상유형': it.expectedTypeCode || '',
                '조사원ID': it.surveyorAccount || spec.loginId,
                '진행률': it.progress || '0%',
                '설문상태': it.quotaStatus || 'ready'
              }));
              const newWb = XLSX.utils.book_new();
              const newWs = XLSX.utils.json_to_sheet(excelRows);
              XLSX.utils.book_append_sheet(newWb, newWs, '건물쿼터');
              fs.writeFileSync(xlsxPath, XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' }));
            } catch (xlsxErr) {
              console.warn(`[CampaignSeeder] HRC 엑셀 동기화 경고(${spec.loginId}):`, xlsxErr.message);
            }
          }
        } catch (err) {
          console.warn(`[CampaignSeeder] HRC 에너지총조사(${spec.loginId}) 쿼터 시드 로드 경고:`, err.message);
        }
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
        } else if (quotaDb.length > 0) {
          const existingByUid = new Map(
            existingCamp.quotaDatabase.map(q => [String(q.uid || '').trim(), q])
          );
          for (const qItem of quotaDb) {
            const uidStr = String(qItem.uid || '').trim();
            const target = existingByUid.get(uidStr);
            if (!target) {
              existingCamp.quotaDatabase.push(qItem);
              needUpdate = true;
              continue;
            }
            for (const gk of GUIDE_SYNC_KEYS) {
              if (qItem[gk] !== undefined && JSON.stringify(target[gk]) !== JSON.stringify(qItem[gk])) {
                target[gk] = qItem[gk];
                needUpdate = true;
              }
            }
            for (const nonEmptyKey of ['contactName', 'phone', 'mainUse', 'areaScale', 'sido', 'sigungu', 'sampleType', 'memo']) {
              if (qItem[nonEmptyKey] && target[nonEmptyKey] !== qItem[nonEmptyKey]) {
                target[nonEmptyKey] = qItem[nonEmptyKey];
                if (nonEmptyKey === 'mainUse') target.industry = qItem.mainUse;
                if (nonEmptyKey === 'contactName' && !target.giftSigned) target.ceoName = qItem.contactName;
                needUpdate = true;
              }
            }
            if (qItem.buildingName && target.buildingName !== qItem.buildingName) {
              target.buildingName = qItem.buildingName;
              target.companyName = qItem.buildingName;
              needUpdate = true;
            }
            if (qItem.roadAddress && !target.roadAddress) {
              target.roadAddress = qItem.roadAddress;
              needUpdate = true;
            }
            if (qItem.jibunAddress && !target.jibunAddress) {
              target.jibunAddress = qItem.jibunAddress;
              needUpdate = true;
            }
            if (qItem.quotaStatus === 'completed' && target.quotaStatus !== 'completed') {
              target.status = '완료';
              target.quotaStatus = 'completed';
              target.progress = '100%';
              target.surveyCompleted = '완료';
              needUpdate = true;
            }
          }
        }
        if (needUpdate || existingCamp.quotaSourceFile !== quotaSourceFile) {
          CampaignStore.updateCampaign(existingCamp.id, {
            quotaDatabase: existingCamp.quotaDatabase,
            quotaSourceFile: quotaSourceFile || existingCamp.quotaSourceFile
          });
        }
      }
    }

    // [GR20260618-1-001-02] 제5차 성인문해능력조사 (노영미7791) 자동 시드 및 전수 동기화
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
            title: `[GR20260618-1-001-02] 제5차 성인문해능력조사 - 노영미7791 (총 ${gqList.length}명)`,
            description: '글로벌리서치 통합조사시스템(GIFT) · [결과값1=완료 & 결과값2=완료] 가구 내 진행 중 가구원 조사 · 나이대별(20대/30대/40대/50대/60대/70대+) 그룹 가이드 적용',
            quotaType: 'b2c',
            surveyType: 'globalri_literacy',
            loginId: '01071447791',
            loginPw: '2038020',
            surveyorName: '노영미7791',
            quotaSourceFile: gqFile,
            quotaDatabase: gqList
          });
        }

        // 모든 성인문해능력조사 캠페인(기본 캠페인 및 사용자 생성 캠페인 포함)에 최신 답안·상태 동기화
        const allGlobalriCamps = CampaignStore.getAllCampaigns().filter(c =>
          c.id === globalriCampId ||
          c.surveyType === 'globalri_literacy' ||
          c.quotaSourceFile === gqFile ||
          c.quotaConfig?.quotaFileName === gqFile ||
          (Array.isArray(c.quotaDatabase) && c.quotaDatabase.some(q => q.memberUid && String(q.surveyUrl || '').includes('G20260713001')))
        );

        for (const targetCamp of allGlobalriCamps) {
          if (!Array.isArray(targetCamp.quotaDatabase) || targetCamp.quotaDatabase.length === 0) {
            CampaignStore.updateCampaign(targetCamp.id, {
              surveyType: 'globalri_literacy',
              quotaType: 'b2c',
              loginId: targetCamp.loginId || '01071447791',
              loginPw: targetCamp.loginPw || '2038020',
              surveyorName: targetCamp.surveyorName || '노영미7791',
              quotaDatabase: JSON.parse(JSON.stringify(gqList)),
              quotaSourceFile: gqFile
            });
            continue;
          }

          let needGqUpdate = (targetCamp.surveyType !== 'globalri_literacy');
          for (const gqItem of gqList) {
            const match = targetCamp.quotaDatabase.find(
              q => String(q.memberUid || q.uid) === String(gqItem.memberUid || gqItem.uid)
            );
            if (!match) {
              const nextSeq = targetCamp.quotaDatabase.length + 1;
              targetCamp.quotaDatabase.push({
                ...gqItem,
                index: nextSeq,
                seq: nextSeq
              });
              needGqUpdate = true;
            } else {
              const gqAnsLen = Array.isArray(gqItem.submittedAnswers) ? gqItem.submittedAnswers.length : 0;
              const matchAnsLen = Array.isArray(match.submittedAnswers) ? match.submittedAnswers.length : 0;
              if (gqAnsLen > matchAnsLen) {
                match.submittedAnswers = gqItem.submittedAnswers;
                match.gradeSummary = gqItem.gradeSummary || match.gradeSummary;
                needGqUpdate = true;
              }
              if (gqItem.quotaStatus && gqItem.quotaStatus !== 'ready' && (match.quotaStatus === 'ready' || !match.quotaStatus || match.status !== gqItem.status)) {
                match.quotaStatus = gqItem.quotaStatus;
                match.status = gqItem.status || match.status;
                match.memberStatus = gqItem.memberStatus || gqItem.status || match.memberStatus;
                match.progress = gqItem.progress || match.progress;
                match.surveyCompleted = gqItem.surveyCompleted || match.surveyCompleted;
                needGqUpdate = true;
              }
            }
          }
          if (needGqUpdate) {
            CampaignStore.updateCampaign(targetCamp.id, {
              surveyType: 'globalri_literacy',
              quotaType: 'b2c',
              loginId: targetCamp.loginId || '01071447791',
              loginPw: targetCamp.loginPw || '2038020',
              surveyorName: targetCamp.surveyorName || '노영미7791',
              ...(targetCamp.id === globalriCampId ? {
                title: `[GR20260618-1-001-02] 제5차 성인문해능력조사 - 노영미7791 (총 ${targetCamp.quotaDatabase.length}명)`
              } : {}),
              quotaDatabase: targetCamp.quotaDatabase,
              quotaSourceFile: targetCamp.quotaSourceFile || gqFile
            });
          }
        }
      } catch (err) {
        console.warn('[CampaignSeeder] 성인문해능력조사 쿼터 시드 로드 경고:', err.message);
      }
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
            for (const gItem of galList) {
              const match = existingGallupCamp.quotaDatabase.find(
                q => Number(q.seq || q.index) === Number(gItem.seq || gItem.index) || String(q.id || q.uid) === String(gItem.id || gItem.uid)
              );
              if (
                match &&
                (String(match.id) !== String(gItem.id) ||
                  (gItem.quotaStatus && gItem.quotaStatus !== 'ready' && (match.quotaStatus === 'ready' || match.status !== gItem.status)))
              ) {
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
      } catch (err) {
        console.warn('[CampaignSeeder] 귀농귀촌 실태조사 쿼터 시드 로드 경고:', err.message);
      }
    }

    // [메트릭스] (신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차) (계정 2010 송준희 74건 + 2016 정소영 89건 = 총 163건) 자동 시드
    const seoulPanelCampId = 'camp_metrix_seoul_panel_2026';
    const existingSeoulCamp = CampaignStore.getAllCampaigns().find(c => c.id === seoulPanelCampId);
    const seoulQuotaPath = path.join(quotasDir, 'quota_metrix_seoul_panel_163.json');
    if (fs.existsSync(seoulQuotaPath)) {
      try {
        const spContent = JSON.parse(fs.readFileSync(seoulQuotaPath, 'utf-8'));
        const spFile = path.basename(seoulQuotaPath);
        const rawList = Array.isArray(spContent.results)
          ? spContent.results
          : (Array.isArray(spContent.data) ? spContent.data : []);
        const spList = rawList.map((item, idx) => ({
          ...item,
          index: item.index || idx + 1,
          seq: item.seq || idx + 1,
          quotaStatus: item.quotaStatus || (String(item.status || '').includes('완료') ? 'completed' : 'ready')
        }));

        if (!existingSeoulCamp) {
          CampaignStore.createCampaign({
            id: seoulPanelCampId,
            title: spContent.name || `[메트릭스] (신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차) - 통합 163건 (2010 송준희·2016 정소영)`,
            description: '메트릭스 Surveybox(S21401by41s3) · 조사원 계정 2종(2010 송준희 74건 + 2016 정소영 89건) 통합 · 4차 프리필 보존 + 2026년 매출·영업비용 정합 계산 + 5차 신규 문항(M·N·O) 자동 응답 · 동의서(svyA115.asp, 99%) 도달 시 완료 전 안전 대기 및 구글 시트 자동 기록',
            quotaType: 'b2b',
            surveyType: 'metrix_seoul_panel',
            accountKeys: ['2010', '2016'],
            googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=506086780#gid=506086780',
            quotaSourceFile: spFile,
            guidelineConfig: {
              surveyUrl: 'https://metrix.svybx.kr/sp7/S21401by41s3/mlist.asp',
              topic: '(신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)',
              engine: 'metrix_seoul_panel',
              headless: true
            },
            quotaDatabase: spList
          });
        } else {
          let needSpUpdate = false;
          if (!Array.isArray(existingSeoulCamp.quotaDatabase) || existingSeoulCamp.quotaDatabase.length === 0) {
            existingSeoulCamp.quotaDatabase = spList;
            existingSeoulCamp.quotaSourceFile = spFile;
            needSpUpdate = true;
          } else {
            for (const spItem of spList) {
              const match = existingSeoulCamp.quotaDatabase.find(
                q => String(q.resid) === String(spItem.resid) && String(q.accountKey || q.akey) === String(spItem.accountKey || spItem.akey)
              );
              if (!match) {
                existingSeoulCamp.quotaDatabase.push(spItem);
                needSpUpdate = true;
              } else {
                const spAnsKeys = spItem.submittedAnswers && typeof spItem.submittedAnswers === 'object' ? Object.keys(spItem.submittedAnswers).length : 0;
                const matchAnsKeys = match.submittedAnswers && typeof match.submittedAnswers === 'object' ? Object.keys(match.submittedAnswers).length : 0;
                if (spAnsKeys > matchAnsKeys) {
                  match.submittedAnswers = spItem.submittedAnswers;
                  needSpUpdate = true;
                }
                if (spItem.quotaStatus && spItem.quotaStatus !== 'ready' && (match.quotaStatus === 'ready' || match.status !== spItem.status)) {
                  match.quotaStatus = spItem.quotaStatus;
                  match.status = spItem.status || match.status;
                  match.progressText = spItem.progressText || match.progressText;
                  match.progressPct = spItem.progressPct ?? match.progressPct;
                  needSpUpdate = true;
                }
              }
            }
          }
          if (needSpUpdate) {
            CampaignStore.updateCampaign(seoulPanelCampId, {
              quotaDatabase: existingSeoulCamp.quotaDatabase,
              quotaSourceFile: existingSeoulCamp.quotaSourceFile || spFile,
              googleSheetUrl: existingSeoulCamp.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=506086780#gid=506086780'
            });
          }
        }
      } catch (err) {
        console.warn('[CampaignSeeder] 서울시 소상공인 패널 쿼터 시드 로드 경고:', err.message);
      }
    }

    // [메트릭스] 2026년 경기도 소상공인 사업체패널 3차조사 (SNUM 622) - 5계정 통합 319건 (강영미 54건 + 김정례 55건 + 노영미 62건 + 송춘희 73건 + 지연옥 75건) 자동 시드
    const gyeonggi622CampId = 'camp_metrix_gyeonggi_622_2026';
    const gyeonggiQuotaPath = path.join(quotasDir, 'quota_metrix_gyeonggi_622_all.json');
    if (fs.existsSync(gyeonggiQuotaPath)) {
      try {
        const ggContent = JSON.parse(fs.readFileSync(gyeonggiQuotaPath, 'utf-8'));
        const ggFile = path.basename(gyeonggiQuotaPath);
        const rawList = Array.isArray(ggContent.data)
          ? ggContent.data
          : (Array.isArray(ggContent.rows) ? ggContent.rows : []);
        const ggList = rawList.map((item, idx) => ({
          ...item,
          index: item.index || idx + 1,
          seq: item.seq || idx + 1,
          slotIndex: item.slotIndex || idx + 1,
          quotaStatus: item.isClosedBiz
            ? 'excluded'
            : (item.quotaStatus || (String(item.status || '').includes('완료') ? 'completed' : (String(item.status || '').includes('98%') ? '진행중(98%)' : 'ready')))
        }));

        let defaultMetrixPolicy = null;
        const metrixBpPath = path.join(path.dirname(quotasDir), 'metrix_survey_blueprint.json');
        if (fs.existsSync(metrixBpPath)) {
          try {
            defaultMetrixPolicy = JSON.parse(fs.readFileSync(metrixBpPath, 'utf-8'))?.defaultPolicy || null;
          } catch (err) {
            console.warn('[CampaignSeeder] 메트릭스 블루프린트 시드 로드 경고:', err.message);
          }
        }

        const defaultAccounts = ggContent.accounts || [
          { loginId: '강영미', loginPw: '5254', sheetName: '깅영미5254' },
          { loginId: '김정례', loginPw: '3995', sheetName: '김정례-3995' },
          { loginId: '노영미', loginPw: '7791', sheetName: '노영미-7791' },
          { loginId: '송춘희', loginPw: '0307', sheetName: '송춘희0307' },
          { loginId: '지연옥', loginPw: '8336', sheetName: '지연옥-8336' }
        ];

        const existingGyeonggiCamps = CampaignStore.getAllCampaigns().filter(
          c =>
            c.id === gyeonggi622CampId ||
            c.id === 'camp_1793069358602' ||
            c.id === 'camp_1794792483912' ||
            c.surveyType === 'metrix_panel'
        );

        if (existingGyeonggiCamps.length === 0) {
          CampaignStore.createCampaign({
            id: gyeonggi622CampId,
            title: `[메트릭스] 2026년 경기도 소상공인 사업체패널 3차조사 (SNUM 622) - ${defaultAccounts.length}계정 통합 ${ggList.length}건 (강영미·김정례·노영미·송춘희·지연옥)`,
            description: `메트릭스 GetData(SNUM=622) · ${defaultAccounts.length}개 조사원 계정(강영미 54건 + 김정례 55건 + 노영미 62건 + 송춘희 73건 + 지연옥 75건) 통합 · 사업자번호 기반 폐업 리스트 자동 제외 · 컨택 팝업 휴대폰 번호 엑셀(구글시트) 변경 저장 후 [설문참여] · 8대 업종별 맞춤 가이드 체크 및 98%(Step 119) 안전 대기`,
            quotaType: 'b2b',
            surveyType: 'metrix_panel',
            snum: '622',
            accounts: defaultAccounts,
            sparePhones: ggContent.sparePhones || [],
            googleSheetUrl: ggContent.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit?gid=1453131911#gid=1453131911',
            quotaSourceFile: ggFile,
            hasMasterBlueprint: true,
            metrixPolicy: defaultMetrixPolicy || {},
            masterBaseline: { policy: defaultMetrixPolicy || {} },
            guidelineConfig: {
              surveyUrl: 'https://survey.metrix.co.kr/Contact/?SNUM=622',
              topic: '2026년 경기도 소상공인 사업체패널 3차조사 (SNUM 622)',
              engine: 'metrix_panel'
            },
            quotaDatabase: ggList
          });
        } else {
          for (const existingGyeonggiCamp of existingGyeonggiCamps) {
            let needGgUpdate = false;
            const existingDb = Array.isArray(existingGyeonggiCamp.quotaDatabase) ? existingGyeonggiCamp.quotaDatabase : [];
            const existingKeys = new Set(existingDb.map(q => `${q?.surveyorId || ''}::${q?.uid || ''}`));
            const hasMissingSeedItems = ggList.some(g => !existingKeys.has(`${g.surveyorId || ''}::${g.uid || ''}`));

            if (!Array.isArray(existingGyeonggiCamp.quotaDatabase) || existingDb.length < ggList.length || hasMissingSeedItems) {
              const prevByKey = new Map();
              existingDb.forEach(q => {
                if (q && q.uid) {
                  prevByKey.set(`${q.surveyorId || ''}::${q.uid}`, q);
                  if (!q.surveyorId && !prevByKey.has(`::${q.uid}`)) prevByKey.set(`::${q.uid}`, q);
                }
              });

              const ggKeySet = new Set();
              const mergedList = ggList.map(ggItem => {
                const k = `${ggItem.surveyorId || ''}::${ggItem.uid}`;
                ggKeySet.add(k);
                const prev = prevByKey.get(k) || prevByKey.get(`::${ggItem.uid}`);
                if (!prev) return ggItem;
                const prevAnsLen = Array.isArray(prev.submittedAnswers) ? prev.submittedAnswers.length : 0;
                const ggAnsLen = Array.isArray(ggItem.submittedAnswers) ? ggItem.submittedAnswers.length : 0;
                const resolvedClosed = prev.manualClosedOverride ? prev.isClosedBiz : ggItem.isClosedBiz;
                const resolvedBizStatus = prev.manualClosedOverride ? prev.bizStatus : ggItem.bizStatus;
                const isEitherDone = String(prev.status || '').includes('완료') || String(ggItem.status || '').includes('완료');
                const resolvedStatus = isEitherDone
                  ? (String(ggItem.status || '').includes('완료') ? ggItem.status : prev.status)
                  : (ggItem.status || prev.status || '');
                const isOverQuota = String(resolvedStatus).includes('인원초과') || String(ggItem.rawMeta?.COMPLETE || '').toUpperCase() === 'OVER';
                const isSafeWait98 = /98%|99%/.test(String(resolvedStatus)) || /98%|99%/.test(String(prev.quotaStatus || '')) || /98%|99%/.test(String(ggItem.quotaStatus || ''));
                const resolvedQuotaStatus = (resolvedClosed || isOverQuota)
                  ? 'excluded'
                  : ((prev.quotaStatus === 'completed' || ggItem.quotaStatus === 'completed' || isEitherDone)
                    ? 'completed'
                    : (isSafeWait98
                      ? '진행중(98%)'
                      : (prev.quotaStatus && prev.quotaStatus !== 'ready' ? prev.quotaStatus : (ggItem.quotaStatus || 'ready'))));

                return {
                  ...prev,
                  ...ggItem,
                  phone: (prev.phoneNeedsSync === false && prev.phone) ? prev.phone : ggItem.phone,
                  serverPhone: (prev.phoneNeedsSync === false && prev.serverPhone) ? prev.serverPhone : ggItem.serverPhone,
                  phoneNeedsSync: prev.phoneNeedsSync === false ? false : ggItem.phoneNeedsSync,
                  customGuide: prev.customGuide || ggItem.customGuide,
                  manualClosedOverride: prev.manualClosedOverride || false,
                  isClosedBiz: resolvedClosed,
                  bizStatus: resolvedBizStatus,
                  quotaStatus: resolvedQuotaStatus,
                  status: resolvedStatus,
                  completedAt: prev.completedAt || ggItem.completedAt || '',
                  pilotAt: ggItem.pilotAt || prev.pilotAt || '',
                  capturedSteps: (Array.isArray(ggItem.capturedSteps) && ggItem.capturedSteps.length > 0)
                    ? ggItem.capturedSteps
                    : (prev.capturedSteps || []),
                  submittedAnswers: ggAnsLen > prevAnsLen ? (ggItem.submittedAnswers || []) : (prev.submittedAnswers || [])
                };
              });

              // 기존 DB에만 존재하는 사용자 커스텀 항목이 있을 경우 유실 없이 뒤에 보존
              existingDb.forEach(q => {
                if (!q || !q.uid) return;
                const k = `${q.surveyorId || ''}::${q.uid}`;
                if (!ggKeySet.has(k)) {
                  const nextIdx = mergedList.length + 1;
                  mergedList.push({ ...q, index: nextIdx, seq: nextIdx, slotIndex: nextIdx });
                }
              });

              existingGyeonggiCamp.quotaDatabase = mergedList;
              existingGyeonggiCamp.quotaSourceFile = ggFile;
              needGgUpdate = true;
            } else {
              for (const ggItem of ggList) {
                const match = existingGyeonggiCamp.quotaDatabase.find(
                  q => String(q.uid) === String(ggItem.uid) && (!q.surveyorId || !ggItem.surveyorId || q.surveyorId === ggItem.surveyorId)
                );
                if (!match) continue;

                if (!match.surveyorId && ggItem.surveyorId) {
                  match.surveyorId = ggItem.surveyorId;
                  match.surveyorPw = ggItem.surveyorPw;
                  match.sheetName = ggItem.sheetName;
                  needGgUpdate = true;
                }
                if (ggItem.guaranteeSupport && match.guaranteeSupport !== ggItem.guaranteeSupport) {
                  match.guaranteeSupport = ggItem.guaranteeSupport;
                  needGgUpdate = true;
                }
                if (ggItem.excelDeposit !== undefined && ggItem.excelDeposit !== null && match.excelDeposit !== ggItem.excelDeposit) {
                  match.excelDeposit = ggItem.excelDeposit;
                  needGgUpdate = true;
                }
                if (ggItem.excelMonthlyRent !== undefined && ggItem.excelMonthlyRent !== null && match.excelMonthlyRent !== ggItem.excelMonthlyRent) {
                  match.excelMonthlyRent = ggItem.excelMonthlyRent;
                  needGgUpdate = true;
                }
                if (ggItem.industryKey && !match.industryKey) {
                  match.industryKey = ggItem.industryKey;
                  needGgUpdate = true;
                }
                if (!match.manualClosedOverride) {
                  if (ggItem.taxType && match.taxType !== ggItem.taxType) {
                    match.taxType = ggItem.taxType;
                    match.bizVerifiedAt = ggItem.bizVerifiedAt || match.bizVerifiedAt;
                    needGgUpdate = true;
                  }
                  if (match.isClosedBiz !== ggItem.isClosedBiz || (ggItem.bizStatus && match.bizStatus !== ggItem.bizStatus)) {
                    match.isClosedBiz = ggItem.isClosedBiz;
                    match.bizStatus = ggItem.bizStatus;
                    if (!match.isClosedBiz && match.quotaStatus === 'excluded') {
                      match.quotaStatus = 'ready';
                    } else if (match.isClosedBiz) {
                      match.quotaStatus = 'excluded';
                    }
                    needGgUpdate = true;
                  }
                }
                const ggAnsLen = Array.isArray(ggItem.submittedAnswers) ? ggItem.submittedAnswers.length : 0;
                const matchAnsLen = Array.isArray(match.submittedAnswers) ? match.submittedAnswers.length : 0;
                if (ggAnsLen > matchAnsLen) {
                  match.submittedAnswers = ggItem.submittedAnswers;
                  match.pilotAt = ggItem.pilotAt || match.pilotAt;
                  match.capturedSteps = ggItem.capturedSteps || match.capturedSteps;
                  needGgUpdate = true;
                }
                if (ggItem.quotaStatus && ggItem.quotaStatus !== 'ready' && (match.quotaStatus === 'ready' || !match.quotaStatus)) {
                  match.quotaStatus = ggItem.quotaStatus;
                  match.status = ggItem.status || match.status;
                  if (ggItem.phoneNeedsSync === false && ggItem.serverPhone) {
                    match.phone = ggItem.phone || match.phone;
                    match.serverPhone = ggItem.serverPhone;
                    match.phoneNeedsSync = false;
                  }
                  needGgUpdate = true;
                }
              }
            }

            // 사용자의 업종별 맞춤 가이드(metrixPolicy / industryPolicies)를 절대 덮어쓰지 않고 신규 문항 가이드 기본 키만 보충
            const curPol = existingGyeonggiCamp.metrixPolicy || existingGyeonggiCamp.masterBaseline?.policy || {};
            if (!curPol.industryPolicies && defaultMetrixPolicy?.industryPolicies) {
              existingGyeonggiCamp.metrixPolicy = {
                ...defaultMetrixPolicy,
                ...curPol,
                industryPolicies: {
                  ...defaultMetrixPolicy.industryPolicies,
                  ...(curPol.industryPolicies || {})
                }
              };
              needGgUpdate = true;
            } else {
              if (!existingGyeonggiCamp.metrixPolicy) {
                existingGyeonggiCamp.metrixPolicy = { ...curPol };
                needGgUpdate = true;
              }
              const newPolicyDefaults = {
                funding_guaranteeRule: 'excel_sync',
                funding_whenGuaranteeX: '1',
                q10_fundMgmtMode: 'random',
                q12_1_evalReasonMode: 'random',
                q13_incomeRangeMode: 'range',
                owner_incomeMin: 250,
                owner_incomeMax: 400,
                owner_incomeStep: 5,
                q16_1_leaseSource: 'excel_first',
                q17_goodwillRangeMode: 'range',
                goodwill_min: 1000,
                goodwill_max: 5000,
                goodwill_step: 500,
                q21_femaleDiffMode: 'random',
                q22_hardshipMode: 'random',
                q23_climateImpact: '2',
                q24_competitivenessMode: 'random',
                q25_otherIncome: '2',
                q26_onlineRule: 'food_only_yes',
                q26_1_foodChannel: '3',
                q34_wageRangeMode: 'range',
                labor_wageMin: 240,
                labor_wageMax: 320,
                labor_wageStep: 5,
                q35_empChange: '2',
                q43_4_continueReasonMode: 'random',
                q44_investPlanMode: 'random',
                q60_awarenessRule: 'guarantee_sync',
                q66_1_otherOrgRouteMode: 'random',
                q67_desiredSupportMode: 'random',
                desired_support_rank3: '9',
                q68_policyIssueMode: 'random',
                policy_issue_rank1: '6',
                policy_issue_rank2: '8',
                policy_issue_rank3: '5',
                q69_mfgAddRule: 'all_no',
                check1_photoUploadMode: 'skip_upload'
              };
              for (const [pk, pv] of Object.entries(newPolicyDefaults)) {
                if (existingGyeonggiCamp.metrixPolicy[pk] === undefined) {
                  existingGyeonggiCamp.metrixPolicy[pk] = pv;
                  needGgUpdate = true;
                }
              }
              if (existingGyeonggiCamp.metrixPolicy.industryPolicies && typeof existingGyeonggiCamp.metrixPolicy.industryPolicies === 'object') {
                for (const indObj of Object.values(existingGyeonggiCamp.metrixPolicy.industryPolicies)) {
                  if (indObj && typeof indObj === 'object') {
                    if (indObj.funding_guaranteeRule === undefined) {
                      indObj.funding_guaranteeRule = 'excel_sync';
                      needGgUpdate = true;
                    }
                    if (indObj.funding_whenGuaranteeX === undefined) {
                      indObj.funding_whenGuaranteeX = '1';
                      needGgUpdate = true;
                    }
                  }
                }
              }
            }

            if (!Array.isArray(existingGyeonggiCamp.accounts) || existingGyeonggiCamp.accounts.length < defaultAccounts.length) {
              needGgUpdate = true;
            }

            if (needGgUpdate) {
              const totalCnt = Array.isArray(existingGyeonggiCamp.quotaDatabase) ? existingGyeonggiCamp.quotaDatabase.length : ggList.length;
              const prevTitle = String(existingGyeonggiCamp.title || '');
              const updatedTitle = existingGyeonggiCamp.id === gyeonggi622CampId
                ? `[메트릭스] 2026년 경기도 소상공인 사업체패널 3차조사 (SNUM 622) - ${defaultAccounts.length}계정 통합 ${totalCnt}건 (강영미·김정례·노영미·송춘희·지연옥)`
                : ((prevTitle.includes('3계정') || prevTitle.includes('4계정'))
                  ? prevTitle
                      .replace(/\d+계정 통합 \d+건/, `${defaultAccounts.length}계정 통합 ${totalCnt}건`)
                      .replace('강영미·김정례·노영미·송춘희)', '강영미·김정례·노영미·송춘희·지연옥)')
                      .replace('강영미·김정례·노영미)', '강영미·김정례·노영미·송춘희·지연옥)')
                  : prevTitle);

              CampaignStore.updateCampaign(existingGyeonggiCamp.id, {
                title: updatedTitle,
                description: `메트릭스 GetData(SNUM=622) · ${defaultAccounts.length}개 조사원 계정(강영미 54건 + 김정례 55건 + 노영미 62건 + 송춘희 73건 + 지연옥 75건) 통합 · 사업자번호 기반 폐업 리스트 자동 제외 · 컨택 팝업 휴대폰 번호 엑셀(구글시트) 변경 저장 후 [설문참여] · 8대 업종별 맞춤 가이드 체크 및 98%(Step 119) 안전 대기`,
                accounts: defaultAccounts,
                sparePhones: ggContent.sparePhones || existingGyeonggiCamp.sparePhones || [],
                googleSheetUrl: existingGyeonggiCamp.googleSheetUrl || ggContent.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit?gid=1453131911#gid=1453131911',
                quotaDatabase: existingGyeonggiCamp.quotaDatabase,
                quotaSourceFile: existingGyeonggiCamp.quotaSourceFile || ggFile,
                metrixPolicy: existingGyeonggiCamp.metrixPolicy,
                hasMasterBlueprint: true
              });
            }
          }
        }
      } catch (err) {
        console.warn('[CampaignSeeder] 경기도 소상공인 패널 쿼터 시드 로드 경고:', err.message);
      }
    }

    // [KMAC] 2027년 한국산업의브랜드파워(K-BPI) 조사 (5911000005645 · 서울 100명 / 인천 50명 총 150명) 자동 시드
    try {
      const kbpiCampId = 'camp_kmac_kbpi_5911000005645';
      const kbpiFile = 'quota_kmac_kbpi_5911000005645.json';
      const kbpiPath = path.join(quotasDir, kbpiFile);
      if (fs.existsSync(kbpiPath)) {
        const kbpiJson = JSON.parse(fs.readFileSync(kbpiPath, 'utf-8'));
        const kbpiList = kbpiJson.data || kbpiJson.items || [];
        if (kbpiList.length > 0) {
          const allNow = CampaignStore.getAllCampaigns();
          const existingKbpi = allNow.find(c => c.id === kbpiCampId);
          const defaultKbpiPolicy = {
            pilotStopAtStep: 'Q4',
            stopBeforeFinalSubmit: true,
            purchaseYesRate: 90,
            unaided4thBrandRate: 35,
            aidedExtraMin: 2,
            aidedExtraMax: 4,
            q6NoRate: 80,
            teenAutoNoneUnfitCategories: true,
            autoSyncGoogleSheet: true,
            customFoodLivingChannels: '편의점, 동네슈퍼, 이마트, 쿠팡, 홈플러스, 롯데마트, GS25, CU, 컬리, 네이버쇼핑',
            proxyServer: ''
          };
          if (!existingKbpi) {
            CampaignStore.createCampaign({
              id: kbpiCampId,
              title: '[KMAC] 2027년 한국산업의브랜드파워(K-BPI) 조사 - 5911000005645 (서울 100 · 인천 50 / 총 150명)',
              description: 'KMA Research CAPI(ID:230) · 서울 노원구청 / 인천시청 미세분산 GPS · 품목별 구입경험 연동 · 성별·연령대 구분자 분할 배치',
              quotaType: 'b2c',
              surveyType: 'kmac_kbpi',
              loginId: '5911000005645',
              loginPw: '5911000005645',
              surveyorName: '5911000005645',
              googleSheetUrl: 'https://docs.google.com/spreadsheets/d/16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg/edit',
              quotaSourceFile: kbpiFile,
              kbpiPolicy: defaultKbpiPolicy,
              hasMasterBlueprint: true,
              guidelineConfig: {
                surveyUrl: 'https://isurvey.kmaresearch.co.kr/sy/login',
                engine: 'kmac_kbpi',
                headless: true
              },
              quotaDatabase: kbpiList
            });
          } else if (!Array.isArray(existingKbpi.quotaDatabase) || existingKbpi.quotaDatabase.length === 0) {
            CampaignStore.updateCampaign(kbpiCampId, {
              quotaDatabase: kbpiList,
              quotaSourceFile: kbpiFile,
              kbpiPolicy: existingKbpi.kbpiPolicy || defaultKbpiPolicy,
              hasMasterBlueprint: true
            });
          }
        }
      }
    } catch (kbpiErr) {
      console.warn('[CampaignSeeder] K-BPI 캠페인 시드 경고:', kbpiErr.message);
    }
  } catch (err) {
    console.warn('[CampaignSeeder] 초기 캠페인 시드 처리 경고:', err.message);
  }
}



