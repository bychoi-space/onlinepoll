import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

const campPath = path.resolve('data/campaigns.json');
const quotaJsonPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json');
const quotaXlsxPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.xlsx');
const enrichedPath = path.resolve('scripts/marketbz_24_enriched_test.json');

const camps = JSON.parse(fs.readFileSync(campPath, 'utf8'));
const camp = camps.find(c => c.id === 'camp_1792039653802');
const quotaObj = JSON.parse(fs.readFileSync(quotaJsonPath, 'utf8'));
const quotaItems = quotaObj.data;
const enriched = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));

// 대표자명 매핑 (공인 + 마켓비즈 발굴 실존)
const CEO_MAPPING = {
  1: '이은지',    // 더덕상회 (공인)
  2: '최규성',    // 정주상회 (마켓비즈 발굴)
  3: '-',        // 세일축산
  4: '김영환',    // 한우마을 (공인)
  5: '오지은',    // 칠칠수산 (공인)
  6: '김영주',    // 물고기 (마켓비즈 발굴)
  7: '-',        // 뻥튀기가 맛있는 집
  8: '조용수',    // 양지기름 (마켓비즈 발굴)
  9: '백순기',    // 백군떡방 (공인 백군)
  10: '최순옥',   // 오뜨레 (마켓비즈 발굴)
  11: '박동원',   // 올스타 (공인)
  12: '남궁민',   // 아트이븐프라자 (공인)
  13: '문경연',   // 서울침구 (마켓비즈 발굴)
  14: '곽현',     // 덕인철물 (마켓비즈 발굴)
  15: '임대성',   // 독도쭈꾸미 (마켓비즈 발굴)
  16: '-',       // 어묵집
  17: '-',       // 카페 3권역
  18: '변희만',   // 메가엠지씨커피송파풍납시장점 (공인)
  19: '-',       // 예작
  20: '박현주',   // 건강지킴이 (공인)
  21: '-',       // 큐사랑(풍납시장점)
  22: '배종익',   // 풍납배내과 (공인 원장)
  23: '박영주',   // 리안헤어천호역점 (마켓비즈 발굴)
  24: '-'        // 바르다네일
};

console.log('=== BEFORE ENRICHMENT SAMPLE ===');
for (let i = 0; i < 5; i++) {
  console.log(`[${i+1}] ${camp.quotaDatabase[i].companyName}: address='${camp.quotaDatabase[i].address}', ceo='${camp.quotaDatabase[i].ceoName}'`);
}

// 1. 캠페인 쿼터 업데이트
camp.quotaDatabase.forEach((q, idx) => {
  const e = enriched[idx];
  const itemNo = idx + 1;
  if (e && e.roadAddress) {
    q.address = e.roadAddress;
  }
  if (CEO_MAPPING[itemNo]) {
    q.ceoName = CEO_MAPPING[itemNo];
  }
  // 정주상회 전화번호 02-474-5727 포맷팅
  if (q.companyName === '정주상회' && e.phone) q.phone = '02-474-5727';
  if (q.companyName === '세일축산' && e.phone) q.phone = '02-470-4241';
  if (q.companyName === '양지기름' && e.phone) q.phone = '02-473-2914';
  if (q.companyName === '오뜨레' && e.phone) q.phone = '02-471-0589';
  if (q.companyName === '서울침구' && e.phone) q.phone = '02-484-2611';
  if (q.companyName === '덕인철물' && e.phone) q.phone = '02-474-9446';
  if (q.companyName === '독도쭈꾸미' && e.phone) q.phone = '02-474-8255';
  if (q.companyName === '풍납배내과' && e.phone) q.phone = '02-470-4778';
  if (q.companyName === '바르다네일' && e.phone) q.phone = '02-471-9403';
});

// 2. 쿼터 보관함 JSON 업데이트
quotaItems.forEach((q, idx) => {
  const e = enriched[idx];
  const itemNo = idx + 1;
  if (e && e.roadAddress) {
    q.address = e.roadAddress;
  }
  if (CEO_MAPPING[itemNo]) {
    q.ceoName = CEO_MAPPING[itemNo];
  }
  if (q.companyName === '정주상회' && e.phone) q.phone = '02-474-5727';
  if (q.companyName === '세일축산' && e.phone) q.phone = '02-470-4241';
  if (q.companyName === '양지기름' && e.phone) q.phone = '02-473-2914';
  if (q.companyName === '오뜨레' && e.phone) q.phone = '02-471-0589';
  if (q.companyName === '서울침구' && e.phone) q.phone = '02-484-2611';
  if (q.companyName === '덕인철물' && e.phone) q.phone = '02-474-9446';
  if (q.companyName === '독도쭈꾸미' && e.phone) q.phone = '02-474-8255';
  if (q.companyName === '풍납배내과' && e.phone) q.phone = '02-470-4778';
  if (q.companyName === '바르다네일' && e.phone) q.phone = '02-471-9403';
});

console.log('\n=== AFTER ENRICHMENT SAMPLE ===');
for (let i = 0; i < 5; i++) {
  console.log(`[${i+1}] ${camp.quotaDatabase[i].companyName}: address='${camp.quotaDatabase[i].address}', ceo='${camp.quotaDatabase[i].ceoName}', phone='${camp.quotaDatabase[i].phone}'`);
}

// 파일 저장
fs.writeFileSync(campPath, JSON.stringify(camps, null, 2), 'utf8');
fs.writeFileSync(quotaJsonPath, JSON.stringify(quotaObj, null, 2), 'utf8');

// 3. SheetJS Excel(.xlsx) 재생성
const worksheet = xlsx.utils.json_to_sheet(quotaItems.map((q, idx) => ({
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

// 컬럼 너비 지정
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

console.log('\nSUCCESS: All files successfully updated and Excel generated!');
