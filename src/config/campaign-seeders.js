/**
 * 서버 기동 시 비정상 중단된 running 상태 초기화 및 기본 캠페인 자동 시드 모듈
 */
import fs from 'fs';
import path from 'path';

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
        if (camp.status === 'completed' && (camp.surveyType === 'globalri_literacy' || camp.surveyType === 'gallup_return_farm')) {
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
}

