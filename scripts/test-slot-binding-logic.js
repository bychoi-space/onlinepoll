/**
 * 케이스탯 슬롯 파싱 및 1:1 매핑 바인딩 로직 단위 테스트
 */
import assert from 'assert';

function parseBulkSlotInput(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const slots = [];

  const urlRegex = /(https?:\/\/[^\s"'<>]+index\.asp\?[^\s"'<>]+)/gi;
  const kidRegex = /[?&]KID=([A-Za-z0-9_-]+)/i;
  const extraRegex = /\(([0-9]+)\)추가/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(urlRegex);
    if (matches) {
      matches.forEach(url => {
        const kidMatch = url.match(kidRegex);
        const extraMatch = line.match(extraRegex);
        slots.push({
          slotUrl: url,
          ranId: kidMatch ? kidMatch[1] : null,
          slotExtra: extraMatch ? extraMatch[0] : `(${slots.length})추가`,
          slotIndex: slots.length + 1
        });
      });
    }
  }

  // fallback: 일반 줄바꿈 URL
  if (slots.length === 0) {
    lines.forEach((line, idx) => {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        const kidMatch = line.match(kidRegex);
        slots.push({
          slotUrl: line,
          ranId: kidMatch ? kidMatch[1] : null,
          slotExtra: `(${idx})추가`,
          slotIndex: idx + 1
        });
      }
    });
  }

  return slots;
}

// 1. 단순 URL 줄바꿈 테스트
const sample1 = `
https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=EZQPGx4L8&type=tapi&prid=2026070802&mnid=900001346&srt=1
https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=VCnUfCY6K&type=tapi&prid=2026070802&mnid=900001346&srt=1
https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=05anItSeU&type=tapi&prid=2026070802&mnid=900001346&srt=1
`;
const res1 = parseBulkSlotInput(sample1);
console.log('Test 1 (Raw 3 URLs):', res1.length === 3 ? '✅ PASS' : '❌ FAIL');
assert.strictEqual(res1.length, 3);
assert.strictEqual(res1[0].ranId, 'EZQPGx4L8');
assert.strictEqual(res1[1].ranId, 'VCnUfCY6K');
assert.strictEqual(res1[2].ranId, '05anItSeU');

// 2. 케이스탯 관리자 HTML 테이블 소스 복사본 테스트
const sample2 = `
<tr>
  <td>1</td>
  <td>(0)추가</td>
  <td><a href="https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=AAA111&type=tapi">조사시작</a></td>
</tr>
<tr>
  <td>2</td>
  <td>(1)추가</td>
  <td><a href="https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BBB222&type=tapi">조사시작</a></td>
</tr>
`;
const res2 = parseBulkSlotInput(sample2);
console.log('Test 2 (HTML table source):', res2.length === 2 ? '✅ PASS' : '❌ FAIL');
assert.strictEqual(res2.length, 2);
assert.strictEqual(res2[0].ranId, 'AAA111');
assert.strictEqual(res2[1].ranId, 'BBB222');

// 3. 23개 더미 슬롯 1:1 바인딩 시뮬레이션
const mockQuota = Array.from({ length: 23 }, (_, i) => ({
  index: i + 1,
  seq: i + 1,
  companyName: `점포_${i + 1}`,
  handledItems: '농산물',
  quotaStatus: 'completed' // 이전 실행으로 완료된 상태
}));

const mockSlots = Array.from({ length: 23 }, (_, i) => ({
  slotIndex: i + 1,
  slotExtra: `(${i})추가`,
  slotUrl: `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=SUK_${i + 1}&type=tapi`,
  ranId: `SUK_${i + 1}`
}));

// 바인딩 함수
let mapped = 0;
mockQuota.forEach((biz, idx) => {
  const slot = mockSlots[idx];
  if (slot && slot.slotUrl) {
    biz.slotUrl = slot.slotUrl;
    biz.slotIndex = slot.slotIndex;
    biz.slotExtra = slot.slotExtra;
    biz.ranId = slot.ranId;
    biz.quotaStatus = 'ready'; // 초기화 검증
    mapped++;
  }
});

console.log('Test 3 (23개 1:1 바인딩 & 상태 초기화):', mapped === 23 && mockQuota.every(b => b.quotaStatus === 'ready' && b.slotUrl) ? '✅ PASS' : '❌ FAIL');
assert.strictEqual(mapped, 23);
assert.strictEqual(mockQuota[0].slotUrl, 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=SUK_1&type=tapi');
assert.strictEqual(mockQuota[22].slotUrl, 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=SUK_23&type=tapi');

console.log('\n🎉 슬롯 파싱 및 1:1 매핑 바인딩 로직 검증 100% 통과!');
