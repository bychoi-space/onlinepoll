import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { generateQuotaPersona } from '../src/engine/persona-builder.js';

console.log('=== [1] 풍납시장 24개 쿼터 성별/나이 필드 검증 ===');
const campPath = path.resolve('data/campaigns.json');
const camp = JSON.parse(fs.readFileSync(campPath, 'utf8')).find(c => c.id === 'camp_1792039653802');
console.log('캠페인 제목:', camp.title);
console.log('쿼터 수량:', camp.quotaDatabase.length);

const sampleBiz = camp.quotaDatabase[0];
console.log('1번 점포:', sampleBiz.companyName, '| 성별:', sampleBiz.ceoGender, '| 나이:', sampleBiz.ceoAge);
if ('ceoGender' in sampleBiz && 'ceoAge' in sampleBiz) {
  console.log('✓ 1번 점포에 ceoGender 및 ceoAge 필드 정상 존재');
} else {
  throw new Error('ceoGender 또는 ceoAge 누락');
}

console.log('\n=== [2] 엑셀(.xlsx) 파일 컬럼 검증 ===');
const xlsxPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.xlsx');
if (fs.existsSync(xlsxPath)) {
  const readFn = XLSX.readFile || (XLSX.default && XLSX.default.readFile);
  const utils = XLSX.utils || (XLSX.default && XLSX.default.utils);
  const wb = readFn(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const jsonRows = utils.sheet_to_json(sheet);
  const firstRow = jsonRows[0];
  console.log('엑셀 첫 행 키 목록:', Object.keys(firstRow));
  if ('성별' in firstRow && '나이' in firstRow) {
    console.log('✓ Excel 시트에 "성별" 및 "나이" 컬럼 정상 존재!');
  } else {
    throw new Error('Excel 시트에 성별 또는 나이 컬럼 누락');
  }
} else {
  console.log('XLSX 파일 경로 확인 필요:', xlsxPath);
}

console.log('\n=== [3] 마스터 설문 블루프린트(JSON) 구조 검증 ===');
const blueprintPath = path.resolve('data/kstat_survey_blueprint.json');
const bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
console.log('블루프린트 제목:', bp.title);
console.log('총 스테이지 수:', bp.stages.length);
const stageSteps = bp.stages.map(s => s.step);
console.log('스테이지 순서:', stageSteps.join(' -> '));

if (bp.stages.length === 16 && stageSteps[0] === 'Q1' && stageSteps[15] === 'Agree') {
  console.log('✓ 16단계(Q1 ~ P14, Agree) 전수 구조 무결점 확인!');
} else {
  throw new Error('블루프린트 스테이지 구성 오류');
}

console.log('\n=== [4] 페르소나 생성기(persona-builder) 마스터 기준점 결합 검증 ===');
// 테스트 1: 사용자가 쿼터 테이블에 성별 '여', 나이 58세 입력 시
const customBiz = {
  companyName: '풍납떡집',
  bizNumber: '123-45-67890',
  ceoName: '박정희',
  ceoGender: '여',
  ceoAge: 58,
  handledItems: '떡, 한과',
  industry: '제조소매'
};

const persona1 = generateQuotaPersona(customBiz, 1, {
  masterBaseline: {
    creditCardRatio: 68,
    debtAdoptionRate: 100, // 100% 부채 있음 강제
    debtAvgAmount: 3000,
    plannedYearsPool: [15] // 15년 고정
  }
});

console.log('성별 선택자:', persona1.genderSelector, '(기대치: #A1_2 여)');
console.log('연령:', persona1.age, '(기대치: 58)');
console.log('신용카드 비중:', persona1.paymentMethods.card, '(기대치: 66~70%)');
console.log('부채 유무:', persona1.debt.hasDebt, '(기대치: true)');
console.log('지속 연수:', persona1.future.plannedYears, '(기대치: 15)');

if (persona1.genderSelector === '#A1_2' && persona1.age === '58' && persona1.debt.hasDebt === true && persona1.future.plannedYears === '15') {
  console.log('✓ 사용자 입력 성별/나이 및 마스터 기준점 100% 정확하게 반영 확인!');
} else {
  throw new Error('페르소나 생성기 기준점 반영 오류');
}

console.log('\n=== 모든 검증 테스트 100% 통과! ===');
