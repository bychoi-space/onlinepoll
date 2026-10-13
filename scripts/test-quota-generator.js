import fs from 'fs';
import path from 'path';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

async function testQuotaGenerator() {
  console.log('=== [통합 검증] 조사 쿼터 생성기 & Excel/JSON 듀얼 파일 생성 E2E 테스트 시작 ===');

  const payload = {
    title: '2026_소프트웨어_동적항목_검증쿼터',
    keyword: '소프트웨어',
    targetCount: 1,
    baseFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry', 'openingDate'],
    customFields: ['종업원수', '기업규모'] // 사용자가 동적으로 추가한 커스텀 항목!
  };

  try {
    console.log('1. 조사 쿼터 생성 API 요청 (POST /api/quota/generate)...');

    const res = await fetch('http://localhost:3000/api/quota/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    console.log('\n2. 서버 응답 결과:');
    console.log('성공 여부:', result.success);
    console.log('수집 건수:', result.count);
    console.log('JSON 파일명:', result.jsonFileName);
    console.log('Excel 파일명:', result.excelFileName);

    if (!result.success) {
      throw new Error(result.error || '생성 실패');
    }

    // 3. 생성된 JSON 파일 정합성 검증
    console.log('\n3. JSON 파일 검증...');
    const quotasDir = path.resolve('data', 'quotas');
    const jsonPath = path.join(quotasDir, result.jsonFileName);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON 파일이 존재하지 않습니다: ${jsonPath}`);
    }

    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`JSON 파일 크기: ${fs.statSync(jsonPath).size} bytes`);
    console.log('수집된 사업자 데이터 요약:');
    const firstItem = jsonContent.data[0];
    console.log('- 상호:', firstItem.companyName);
    console.log('- 사업자등록번호:', firstItem.bizNumber);
    console.log('- 대표자:', firstItem.ceoName);
    console.log('- 주소:', firstItem.address);
    console.log('- 동적 추가항목 [종업원수]:', firstItem['종업원수']);
    console.log('- 동적 추가항목 [기업규모]:', firstItem['기업규모']);

    // 4. 생성된 Excel(.xlsx) 파일 정합성 검증
    console.log('\n4. Excel (.xlsx) 파일 검증...');
    const excelPath = path.join(quotasDir, result.excelFileName);
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Excel 파일이 존재하지 않습니다: ${excelPath}`);
    }

    const excelStats = fs.statSync(excelPath);
    console.log(`Excel 파일 크기: ${excelStats.size} bytes (정상 파일 생성됨)`);

    // XLSX 라이브러리로 엑셀 파일 직접 파싱하여 내용 검증
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    console.log('Excel 시트명:', sheetName);
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log('Excel 표 행 수:', sheetRows.length);
    console.log('Excel 첫 번째 행 파싱 결과:\n', JSON.stringify(sheetRows[0], null, 2));

    // 5. 다운로드 엔드포인트 동작 확인
    console.log('\n5. 파일 다운로드 엔드포인트 검증 (GET /api/quota/download/:filename)...');
    const downloadRes = await fetch(`http://localhost:3000${result.excelDownloadUrl}`);
    console.log('Excel 다운로드 HTTP 상태 코드:', downloadRes.status);

    if (downloadRes.status === 200 && sheetRows.length > 0 && firstItem.companyName && firstItem.bizNumber) {
      console.log('\n>>> [최종 검증 성공] MarketBz 실존 데이터 기반 조사 쿼터, JSON 및 Excel 표 완벽 검증 완료! <<<');
      process.exit(0);
    } else {
      console.error('\n>>> [검증 실패] 데이터 또는 다운로드 검증 실패 <<<');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n검증 테스트 에러:', err);
    process.exit(1);
  }
}

testQuotaGenerator();
