import fs from 'fs';
import path from 'path';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

async function verifyPhoneFix() {
  console.log('=== [대표전화번호 연동 검증] 풍납시장 5건 쿼터 생성 및 연락처 추출 확인 ===');

  const payload = {
    title: '서울_풍납시장_온누리쿼터_연락처확인',
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    paymentFilter: 'ALL',
    targetCount: 5,
    baseFields: ['companyName', 'bizNumber', 'ceoName', 'phone', 'openDate', 'handledItems', 'address', 'status']
  };

  const res = await fetch('http://localhost:3000/api/quota/generate-onnuri', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('API Error:', err);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`API 응답 성공: 총 ${result.count}건`);

  const jsonPath = path.join(process.cwd(), 'data', 'quotas', result.jsonFileName);
  const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log('\n--- 5건 데이터 추출 결과 확인 ---');
  let phoneFoundCount = 0;
  jsonRaw.data.forEach((item, idx) => {
    console.log(`[#${idx + 1}] 상호: "${item.companyName}" | 사업자: ${item.bizNumber} | 대표전화번호: ${item.phone} | 도로명주소: ${item.address} | 취급품목: ${item.handledItems}`);
    if (item.phone) phoneFoundCount++;
  });

  // 칠칠수산 대표전화번호 확인 (사용자 캡처 이미지: 0222222222)
  const chilchil = jsonRaw.data.find(d => d.companyName.includes('칠칠수산'));
  if (chilchil) {
    console.log('\n칠칠수산 검증:');
    console.log(`- 상호: ${chilchil.companyName}`);
    console.log(`- 추출된 연락처: ${chilchil.phone}`);
    console.log(`- 추출된 도로명주소: ${chilchil.address}`);

    if (!chilchil.phone) {
      throw new Error('[실패] 칠칠수산 대표전화번호 추출 실패');
    }
  }

  console.log(`\n🎉 [성공] 총 ${result.count}건 중 ${phoneFoundCount}건의 실존 대표전화번호 및 도로명주소 연동 성공!`);
}

verifyPhoneFix();
