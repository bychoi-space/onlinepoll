/**
 * 2025년 기준 에너지총조사 (건물 부문) 구글 시트 쿼터 리스트(강영미_700275, 강경옥_700277, 김정례_701493)를
 * AutoSurvey AI 표준 쿼터 JSON 및 Excel 파일로 변환하여 data/quotas/ 에 저장하는 스크립트
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

if (!fs.existsSync(quotasDir)) {
  fs.mkdirSync(quotasDir, { recursive: true });
}

const ACCOUNT_SHEETS = [
  { sheetName: '강영미_700275', accountId: '700275', surveyorName: '강영미', regionDesc: '서울 (노원구/그외)' },
  { sheetName: '강경옥_700277', accountId: '700277', surveyorName: '강경옥', regionDesc: '인천 (부평구/그외)' },
  { sheetName: '김정례_701493', accountId: '701493', surveyorName: '김정례', regionDesc: '서울 (노원구/그외) + 인천 (연수·남동·미추홀/그외)' }
];

export function importHrcEnergyQuotas(xlsxPath = '/tmp/energy_full.xlsx') {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${xlsxPath}`);
  }

  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
  const summary = [];

  for (const meta of ACCOUNT_SHEETS) {
    const ws = wb.Sheets[meta.sheetName];
    if (!ws) {
      console.warn(`시트를 찾을 수 없음: ${meta.sheetName}`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const items = [];
    const cellQuotas = [];

    for (let rIdx = 3; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      if (!r) continue;

      // 우측 쿼터표 (S~AA열: index 18~26)
      const qSido = String(r[18] || '').trim();
      const qCode1 = String(r[19] || '').trim();
      const qUse = String(r[20] || '').trim();
      const qCode2 = String(r[21] || '').trim();
      const qArea = String(r[22] || '').trim();
      const qTarget = Number(r[23]) || 0;
      const qSelected = Number(r[24]) || 0;
      const qSampleCount = Number(r[25]) || 0;
      const qDiff = Number(r[26]) || 0;

      if (qSido && qSido !== '시도' && qCode1 && qCode2) {
        cellQuotas.push({
          cellKey: `${qSido}_${qCode1}_${qCode2}`,
          sido: qSido,
          quotaCode1: qCode1,
          mainUse: qUse,
          quotaCode2: qCode2,
          areaScale: qArea,
          targetQuota: qTarget,
          selectedCount: qSelected,
          sampleCount: qSampleCount,
          diff: qDiff
        });
      }

      // 좌측 표본 리스트 (A~Q열: index 0~16)
      const uid = String(r[3] || '').trim();
      const selectionType = String(r[1] || '').trim(); // '선정' | '대체'
      if (!uid || !/^\d+$/.test(uid)) continue;

      const seq = Number(r[0]) || (items.length + 1);
      const cellPriority = Number(r[2]) || 1;
      const rawBuildingName = String(r[4] || '').trim();
      const buildingName = (rawBuildingName === '(건물명 없음)' || !rawBuildingName) ? '' : rawBuildingName;
      const contactName = String(r[5] || '').trim();
      const phone = String(r[6] || '').trim();
      const sampleType = String(r[7] || '').trim();
      const mainUse = String(r[8] || '').trim();
      const areaScale = String(r[9] || '').trim();
      const sido = String(r[10] || '').trim();
      const sigungu = String(r[11] || '').trim();
      const lastContactStatus = String(r[12] || '').trim();
      const contactCount = Number(r[13]) || 0;
      const quotaCode1 = String(r[14] || '').trim();
      const quotaCode2 = String(r[15] || '').trim();
      const memo = String(r[16] || '').trim();

      const cellKey = `${sido}_${quotaCode1}_${quotaCode2}`;
      const isDone = (uid === '800715');

      items.push({
        index: items.length + 1,
        seq,
        uid,
        selectionType, // '선정' | '대체'
        cellPriority,
        cellKey,
        companyName: buildingName || `(${sigungu} ${mainUse} #${uid})`,
        buildingName,
        ceoName: contactName,
        contactName,
        phone,
        sampleType, // '본표본' | '예비표본'
        industry: mainUse,
        mainUse,
        areaScale,
        sido,
        sigungu,
        address: `${sido} ${sigungu}`.trim(),
        handledItems: mainUse,
        mainProducts: areaScale,
        lastContactStatus,
        contactCount,
        quotaCode1,
        quotaCode2,
        memo,
        surveyorId: meta.accountId,
        surveyorAccount: meta.accountId,
        surveyorName: meta.surveyorName,
        slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uid}&page=1`,
        surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uid}&page=1`,
        status: isDone ? '완료' : '대기',
        quotaStatus: isDone ? 'completed' : 'ready',
        progress: isDone ? '100%' : '0%'
      });
    }

    const selectedItems = items.filter(i => i.selectionType === '선정');
    const backupItems = items.filter(i => i.selectionType === '대체');

    const baseFileName = `quota_hrc_energy_2025_${meta.accountId}_${meta.surveyorName}_전체${items.length}개_선정${selectedItems.length}개`;
    const jsonPath = path.join(quotasDir, `${baseFileName}.json`);
    const xlsxOutPath = path.join(quotasDir, `${baseFileName}.xlsx`);

    const payload = {
      title: `2025년 기준 에너지총조사 [건물] - ${meta.accountId} (${meta.surveyorName} / 선정 ${selectedItems.length}건 · 전체 ${items.length}건)`,
      type: 'HRC_ENERGY_BUILDING',
      surveyType: 'hrc_energy',
      projectCode: '2026-89-0342C',
      projectName: '2025년 기준 에너지총조사 (건물)',
      surveyorId: meta.accountId,
      accountId: meta.accountId,
      surveyorName: meta.surveyorName,
      marketName: `에너지총조사_건물_${meta.accountId}_${meta.surveyorName}`,
      regionDesc: meta.regionDesc,
      count: items.length,
      totalCount: items.length,
      selectedCount: selectedItems.length,
      subCount: backupItems.length,
      backupCount: backupItems.length,
      createdAt: new Date().toISOString(),
      cellQuotas,
      data: items,
      items
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

    // Excel 저장
    const excelRows = items.map(it => ({
      '번호': it.seq,
      '선정구분': it.selectionType,
      '셀내우선순위': it.cellPriority,
      'UID': it.uid,
      '건물명': it.buildingName || '(건물명 없음)',
      '이름': it.contactName,
      '전화번호': it.phone,
      '표본구분': it.sampleType,
      '주용도': it.mainUse,
      '면적규모': it.areaScale,
      '시도': it.sido,
      '시군구': it.sigungu,
      '최종접촉상태': it.lastContactStatus,
      '접촉횟수': it.contactCount,
      '쿼터코드1': it.quotaCode1,
      '쿼터코드2': it.quotaCode2,
      '조사원ID': it.surveyorAccount,
      '설문상태': it.quotaStatus
    }));
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(newWb, newWs, meta.sheetName);
    fs.writeFileSync(xlsxOutPath, XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' }));

    summary.push({
      accountId: meta.accountId,
      surveyorName: meta.surveyorName,
      totalCount: items.length,
      selectedCount: selectedItems.length,
      backupCount: backupItems.length,
      jsonFile: `${baseFileName}.json`,
      xlsxFile: `${baseFileName}.xlsx`
    });
  }

  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = importHrcEnergyQuotas();
  console.log('Imported HRC Energy Building Quotas:', JSON.stringify(res, null, 2));
}
