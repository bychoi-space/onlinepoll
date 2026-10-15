/**
 * 풍납시장 24개 실존 사업자 쿼터에 Kstat 24개 슬롯 (Slot #2 ~ #25) 1:1 매핑 및 바인딩
 */
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const quotaPath = path.join(rootDir, 'data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json');
const xlsxPath = path.join(rootDir, 'data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.xlsx');
const slotsPath = path.join(rootDir, 'scripts/pungnap_25_slots.json');

const quota = JSON.parse(fs.readFileSync(quotaPath, 'utf8'));
const slots = JSON.parse(fs.readFileSync(slotsPath, 'utf8'));

// slots[0]은 1번(예작 - 완료건), slots[1..24]가 슬롯 2~25번 (24개 공란)
const emptySlots = slots.slice(1);
const merchants = quota.data || quota.merchants || [];
console.log('Quota merchants count:', merchants.length);
console.log('Empty slots count:', emptySlots.length);

merchants.forEach((m, idx) => {
  const s = emptySlots[idx];
  m.slotIndex = s.slotIndex;
  m.slotExtra = s.extraLabel;
  m.slotIdSel = s.idSel;
  m.ranId = s.ran_id;
  m.slotUrl = s.surveyUrl;
  console.log(`[쿼터 #${m.seq}] ${m.companyName} (${m.handledItems}) ➔ Kstat 슬롯 #${s.slotIndex} ${s.extraLabel} [KID: ${s.ran_id}]`);
});

fs.writeFileSync(quotaPath, JSON.stringify(quota, null, 2), 'utf8');
console.log('✅ 조사 쿼터 JSON 파일 갱신 완료:', quotaPath);

// Excel(.xlsx) 동기화
const rows = merchants.map(m => ({
  '순번': m.seq,
  'Kstat슬롯': `슬롯 #${m.slotIndex} ${m.slotExtra}`,
  'Kstat설문URL': m.slotUrl,
  '시장명': m.marketName,
  '상호': m.companyName,
  '사업자번호': m.bizNumber,
  '대표자명': m.ceoName || '-',
  '연락처': m.phone || '-',
  '개업일': m.openDate || '-',
  '업종/품목': m.handledItems || '-',
  '사업장주소': m.address || '-',
  '가맹상태': m.status,
  '지류': m.paperAccepted,
  '디지털': m.digitalAccepted
}));
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.json_to_sheet(rows);
xlsx.utils.book_append_sheet(wb, ws, '풍납시장_24개_Kstat매핑');
xlsx.writeFile(wb, xlsxPath);
console.log('✅ 조사 쿼터 Excel(.xlsx) 파일 갱신 완료:', xlsxPath);
