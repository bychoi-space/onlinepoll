import { matchBusinessField, matchBusinessOption } from '../src/ai/b2b-mapper.js';

const mockBiz = {
  companyName: '지멘스인더스트리소프트웨어 주식회사',
  bizNumber: '120-81-68297',
  ceoName: '오병준',
  industry: '소프트웨어개발',
  subIndustry: '시스템 소프트웨어 개발 및 공급업',
  phone: '02-555-1234',
  openingDate: '1990년 01월 01일',
  address: '서울특별시 강남구',
  category: '정보통신/서비스'
};

const testQuestions = [
  { q: '1. 귀사의 상호(법인명)를 입력해 주세요.', expected: 'companyName', expectedVal: '지멘스인더스트리소프트웨어 주식회사' },
  { q: '2. 사업자등록번호를 기재해 주십시오.', expected: 'bizNumber', expectedVal: '120-81-68297' },
  { q: '3. 대표자 성함을 적어주세요.', expected: 'ceoName', expectedVal: '오병준' },
  { q: '4. 사업장 소재지(주소)를 입력하세요.', expected: 'address', expectedVal: '서울특별시 강남구' },
  { q: '5. 회사 대표 전화번호를 입력하세요.', expected: 'phone', expectedVal: '02-555-1234' }
];

let allPassed = true;

console.log('=== B2B 매퍼 단위 테스트 시작 ===');
for (const t of testQuestions) {
  const result = matchBusinessField({
    questionTitle: t.q,
    businessData: mockBiz,
    selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'phone']
  });

  const passed = result.isMatched && result.fieldName === t.expected && result.value === t.expectedVal;
  console.log(`질문: "${t.q}" -> 매칭 필드: ${result.fieldName} (값: ${result.value}) [${passed ? 'PASS' : 'FAIL'}]`);
  if (!passed) allPassed = false;
}

// 객관식 업종 매칭 테스트
const industryOptions = ['제조업/화학', '소프트웨어개발/IT', '도소매 유통업', '건설 및 부동산'];
const matchedOptIdx = matchBusinessOption({ options: industryOptions, businessData: mockBiz });
console.log(`객관식 보기 중 매칭된 인덱스: ${matchedOptIdx} (${industryOptions[matchedOptIdx]})`);

if (matchedOptIdx === 1 && allPassed) {
  console.log('>>> B2B 매퍼 단위 테스트 완벽 통과! <<<');
  process.exit(0);
} else {
  console.error('>>> 단위 테스트 실패 <<<');
  process.exit(1);
}
