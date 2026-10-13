import fs from 'fs';
import path from 'path';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

async function runVerification() {
  console.log('=== [무결성 검증] 온누리 전통시장 연계 조사 쿼터 생성 API 테스트 ===');

  const payload = {
    title: '서울_송파구_풍납시장_온누리쿼터_검증',
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    paymentFilter: 'ALL',
    targetCount: 3,
    customFields: ['기업규모']
  };

  console.log('Request Payload:', JSON.stringify(payload, null, 2));

  const startTime = Date.now();
  const res = await fetch('http://localhost:3000/api/quota/generate-onnuri', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`API Response Status: ${res.status} (소요 시간: ${duration}초)`);

  if (!res.ok) {
    const errText = await res.text();
    console.error('API Error Response:', errText);
    process.exit(1);
  }

  const result = await res.json();
  console.log('\n--- API 응답 메타데이터 ---');
  console.log(`성공 여부: ${result.success}`);
  console.log(`제목: ${result.title}`);
  console.log(`시장명: ${result.marketName}`);
  console.log(`수집 수량: ${result.count}건`);
  console.log(`Excel 파일명: ${result.excelFileName}`);
  console.log(`JSON 파일명: ${result.jsonFileName}`);

  // 1. JSON 파일 검증
  const jsonPath = path.join(process.cwd(), 'data', 'quotas', result.jsonFileName);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON 파일이 디스크에 존재하지 않습니다: ${jsonPath}`);
  }
  const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`\n[JSON 검증 성공] 디스크 파일 크기: ${fs.statSync(jsonPath).size} bytes`);
  console.log(`수집 데이터 1건 샘플:\n`, JSON.stringify(jsonRaw.data[0], null, 2));

  // 2. Excel (.xlsx) 파일 검증
  const excelPath = path.join(process.cwd(), 'data', 'quotas', result.excelFileName);
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel 파일이 디스크에 존재하지 않습니다: ${excelPath}`);
  }
  const excelSize = fs.statSync(excelPath).size;
  console.log(`\n[Excel 검증 성공] 디스크 파일 크기: ${excelSize} bytes`);

  // 엑셀 파싱하여 시트 및 행 데이터 확인
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const excelRows = XLSX.utils.sheet_to_json(sheet);

  console.log(`시트명: ${sheetName}`);
  console.log(`엑셀 행 수: ${excelRows.length}개 행`);
  console.log(`엑셀 첫 번째 행 데이터:\n`, JSON.stringify(excelRows[0], null, 2));

  // 3. 거짓 데이터 방지 무결성 체크
  console.log('\n--- 거짓 데이터 배제(Zero-Fake) 정합성 확인 ---');
  for (let i = 0; i < excelRows.length; i++) {
    const row = excelRows[i];
    console.log(`[#${i + 1}] 상호: "${row['상호(가맹점명)']}" | 사업자번호: "${row['사업자등록번호']}" | 시장: "${row['시장명']}" | 업종: "${row['온누리업종']}" | 주소: "${row['주소']}"`);
    if (!row['시장명'].includes('풍납시장')) {
      throw new Error(`시장명 불일치 오류: ${row['시장명']}`);
    }
    if (!row['상호(가맹점명)']) {
      throw new Error('가맹점 상호명 누락');
    }
  }

  console.log('\n🎉 [최종 검증 완료] 온누리 전통시장 연계 조사 쿼터 생성 및 Excel 표 구성 검증이 100% 성공했습니다!');
}

runVerification();
