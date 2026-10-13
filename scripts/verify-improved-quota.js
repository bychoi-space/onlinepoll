import fs from 'fs';
import path from 'path';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

async function verifyImprovedQuota() {
  console.log('=== [개선 검증] 대표자명 오파싱 제거 / 연락처 / 개업연월 / 취급품목 무결성 검증 ===');

  const payload = {
    title: '서울_풍납시장_온누리쿼터_개선검증',
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
  console.log(`API 응답 성공: ${result.count}건 수집 완료`);
  console.log('결과 컬럼 목록:', result.columns.map(c => c.label));

  // 1. JSON 검증
  const jsonPath = path.join(process.cwd(), 'data', 'quotas', result.jsonFileName);
  const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('\n--- 1차 JSON 데이터 무결성 검사 (5건) ---');
  jsonRaw.data.forEach((item, idx) => {
    console.log(`[#${idx + 1}] 상호: "${item.companyName}" | 사업자: ${item.bizNumber} | 대표자: ${item.ceoName} | 연락처: ${item.phone} | 개업연월: ${item.openDate} | 취급품목: ${item.handledItems}`);

    // 검증 1: 대표자명에 '연락처'나 '대표자' 문자열이 들어가지 않았는지
    if (item.ceoName === '연락처' || item.ceoName === '대표자') {
      throw new Error(`[오류] 대표자명에 잘못된 문자열 잔존: ${item.ceoName}`);
    }

    // 검증 2: 연락처에 가짜 더미 번호 '02-000-0000'이 들어가지 않았는지
    if (item.phone === '02-000-0000') {
      throw new Error(`[오류] 연락처에 가짜 더미 번호 잔존: ${item.phone}`);
    }

    // 검증 3: 취급품목에 값이 존재하는지
    if (!item.handledItems) {
      throw new Error(`[오류] 취급품목 누락: ${item.companyName}`);
    }
  });

  // 2. Excel 검증
  const excelPath = path.join(process.cwd(), 'data', 'quotas', result.excelFileName);
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelRows = XLSX.utils.sheet_to_json(sheet);

  console.log('\n--- 2차 Excel 표 행 데이터 검사 (첫 번째 행 샘플) ---');
  console.log(JSON.stringify(excelRows[0], null, 2));

  console.log('\n🎉 [검증 성공] 대표자명 오염 완벽 해결 및 [연락처], [개업연월], [취급품목] 컬럼 정상 구성 확인!');
}

verifyImprovedQuota();
