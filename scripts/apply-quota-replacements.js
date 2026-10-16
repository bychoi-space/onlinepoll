import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

const campPath = path.resolve('data/campaigns.json');
const quotaJsonPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json');
const quotaXlsxPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.xlsx');

const camps = JSON.parse(fs.readFileSync(campPath, 'utf8'));
const camp = camps.find(c => c.id === 'camp_1792039653802');
const quotaObj = JSON.parse(fs.readFileSync(quotaJsonPath, 'utf8'));

// 교체할 5개 점포 명세
const REPLACEMENTS = {
  16: {
    companyName: '보성각',
    bizNumber: '219-01-03724',
    rawBizNumber: '2190103724',
    ceoName: '이성민',
    phone: '02-471-3634',
    openDate: '1988-09-05',
    handledItems: '음식점업 (중식/일반음식점)',
    industry: '음식점업 (중식/일반음식점)',
    address: '서울특별시 송파구 바람드리길 53 (풍납동)',
    ceoSource: '공정위·국세청 공인등록정보',
    phoneSource: '네이버 플레이스/검색'
  },
  17: {
    companyName: '피자나인',
    bizNumber: '219-36-01048',
    rawBizNumber: '2193601048',
    ceoName: '위재연',
    phone: '02-472-5999',
    openDate: '2021-11-19',
    handledItems: '음식점업 (피자전문점/일반음식점)',
    industry: '음식점업 (피자전문점/일반음식점)',
    address: '서울특별시 송파구 바람드리길 12 (풍납동)',
    ceoSource: '공정위·국세청 공인등록정보',
    phoneSource: '네이버 플레이스/검색'
  },
  18: {
    companyName: '마주보며',
    bizNumber: '582-58-00027',
    rawBizNumber: '5825800027',
    ceoName: '-',
    phone: '02-472-9075',
    openDate: '2015-03-16',
    handledItems: '음식점업 (커피/음료/휴게음식점)',
    industry: '음식점업 (커피/음료/휴게음식점)',
    address: '서울특별시 송파구 천호대로152길 17 (풍납동)',
    ceoSource: null,
    phoneSource: '네이버 플레이스/검색'
  },
  21: {
    companyName: '시장온누리약국',
    bizNumber: '605-19-18554',
    rawBizNumber: '6051918554',
    ceoName: '-',
    phone: '02-478-6665',
    openDate: '2013-01-29',
    handledItems: '기타소매 (의약품/약국 소매업)',
    industry: '기타소매 (의약품/약국 소매업)',
    address: '서울특별시 송파구 바람드리길 52 (풍납동)',
    ceoSource: null,
    phoneSource: '네이버 플레이스/검색'
  },
  22: {
    companyName: '행복한경희한의원',
    bizNumber: '215-92-51692',
    rawBizNumber: '2159251692',
    ceoName: '-',
    phone: '02-486-8300',
    openDate: '2009-09-18',
    handledItems: '근린상권 (한의원/의료서비스업)',
    industry: '근린상권 (한의원/의료서비스업)',
    address: '서울특별시 송파구 풍성로25길 42 (풍납동)',
    ceoSource: null,
    phoneSource: '네이버 플레이스/검색'
  }
};

console.log('=== APPLYING REPLACEMENTS TO 24 MERCHANTS ===');

// 1. 캠페인 쿼터 업데이트
camp.quotaDatabase.forEach((q, idx) => {
  const itemNo = idx + 1;
  if (REPLACEMENTS[itemNo]) {
    const rep = REPLACEMENTS[itemNo];
    console.log(`[#${itemNo}] 교체: "${q.companyName}" (${q.openDate}) ➔ "${rep.companyName}" (${rep.openDate})`);
    
    // 기존 슬롯 바인딩 및 상태 보존
    const preservedSlotIndex = q.slotIndex;
    const preservedSlotUrl = q.slotUrl;
    const preservedExtraLabel = q.extraLabel;
    const preservedRanId = q.ranId;
    const preservedStatus = q.quotaStatus || q.status;

    Object.assign(q, rep);

    q.slotIndex = preservedSlotIndex;
    q.slotUrl = preservedSlotUrl;
    q.extraLabel = preservedExtraLabel;
    q.ranId = preservedRanId;
    q.quotaStatus = preservedStatus;
  }
});

// 2. 쿼터 보관함 JSON 업데이트
quotaObj.data.forEach((q, idx) => {
  const itemNo = idx + 1;
  if (REPLACEMENTS[itemNo]) {
    const rep = REPLACEMENTS[itemNo];
    const preservedSlotIndex = q.slotIndex;
    const preservedSlotUrl = q.slotUrl;
    const preservedExtraLabel = q.extraLabel;
    const preservedRanId = q.ranId;

    Object.assign(q, rep);

    q.seq = itemNo;
    q.slotIndex = preservedSlotIndex;
    q.slotUrl = preservedSlotUrl;
    q.extraLabel = preservedExtraLabel;
    q.ranId = preservedRanId;
  }
});

quotaObj.updatedAt = new Date().toISOString();

// 로컬 파일 저장
fs.writeFileSync(campPath, JSON.stringify(camps, null, 2), 'utf8');
fs.writeFileSync(quotaJsonPath, JSON.stringify(quotaObj, null, 2), 'utf8');

// 3. SheetJS Excel 재생성
const worksheet = xlsx.utils.json_to_sheet(quotaObj.data.map((q, idx) => ({
  'No': idx + 1,
  '상호(기업명)': q.companyName,
  '사업자등록번호': q.bizNumber,
  '대표자명': q.ceoName || '-',
  '연락처': q.phone || '-',
  '개업연월': q.openDate || '-',
  '취급품목(업종)': q.handledItems || q.industry || '-',
  '사업장 주소(도로명)': q.address || '-',
  '슬롯 매핑': q.extraLabel || (q.slotUrl ? `슬롯 #${idx+1}` : '-')
})));

worksheet['!cols'] = [
  { wch: 6 },
  { wch: 25 },
  { wch: 18 },
  { wch: 14 },
  { wch: 16 },
  { wch: 14 },
  { wch: 30 },
  { wch: 45 },
  { wch: 20 }
];

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, '풍납시장_24개_조사쿼터');
xlsx.writeFile(workbook, quotaXlsxPath);

console.log('SUCCESS: Local files (JSON + XLSX) updated successfully!');
