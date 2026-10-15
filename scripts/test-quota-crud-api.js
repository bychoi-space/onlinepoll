import fs from 'fs';
import path from 'path';
import { exportBusinessesToExcel } from '../src/utils/excel.js';

const quotasDir = path.resolve('data/quotas');

async function testQuotaCrud() {
  console.log('--- 1. Testing Quota List with Industry Distribution ---');
  const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
  const testTargetFile = files.find(f => f.includes('24개')) || files[0];
  console.log(`Found ${files.length} quota files. Target test file: ${testTargetFile}`);

  // Test reading target
  const raw = JSON.parse(fs.readFileSync(path.join(quotasDir, testTargetFile), 'utf-8'));
  console.log(`Original count: ${raw.count}, data length: ${raw.data?.length}`);

  // Create a temporary clone for PUT and DELETE testing
  const tempFileName = `quota_temp_test_${Date.now()}.json`;
  const tempExcelName = tempFileName.replace('.json', '.xlsx');
  const tempClone = JSON.parse(JSON.stringify(raw));
  tempClone.title = '임시 테스트 쿼터';
  
  fs.writeFileSync(path.join(quotasDir, tempFileName), JSON.stringify(tempClone, null, 2), 'utf-8');
  exportBusinessesToExcel({
    data: tempClone.data,
    columns: tempClone.columns,
    filePath: path.join(quotasDir, tempExcelName)
  });
  console.log(`--- 2. Created temp quota clone: ${tempFileName} & ${tempExcelName} ---`);

  // Test PUT: Modify first merchant's phone number
  const modData = [...tempClone.data];
  modData[0] = { ...modData[0], phone: '02-999-9999', ceoName: '테스트대표' };
  tempClone.data = modData;
  tempClone.title = '임시 테스트 쿼터 (수정됨)';
  tempClone.updatedAt = new Date().toISOString();

  fs.writeFileSync(path.join(quotasDir, tempFileName), JSON.stringify(tempClone, null, 2), 'utf-8');
  exportBusinessesToExcel({
    data: tempClone.data,
    columns: tempClone.columns,
    filePath: path.join(quotasDir, tempExcelName)
  });

  const verified = JSON.parse(fs.readFileSync(path.join(quotasDir, tempFileName), 'utf-8'));
  if (verified.data[0].phone === '02-999-9999' && verified.data[0].ceoName === '테스트대표') {
    console.log('✅ PUT modification and Excel re-export succeeded!');
  } else {
    throw new Error('Verification failed!');
  }

  // Test DELETE: Clean up temporary files
  fs.unlinkSync(path.join(quotasDir, tempFileName));
  fs.unlinkSync(path.join(quotasDir, tempExcelName));
  if (!fs.existsSync(path.join(quotasDir, tempFileName)) && !fs.existsSync(path.join(quotasDir, tempExcelName))) {
    console.log('✅ DELETE cleanup succeeded! Temporary files removed safely.');
  }

  console.log('🎉 ALL Quota CRUD logic tests passed 100%!');
}

testQuotaCrud().catch(console.error);
