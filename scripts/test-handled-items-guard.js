import { sanitizeKstatHandledItem } from '../src/engine/kstat-runner.js';
import { splitHandledAndMainProducts } from '../src/engine/hybrid-quota.js';

console.log('=== 1. sanitizeKstatHandledItem 단위 테스트 시작 ===');

const testCases = [
  { input: '떡', expected: '떡류' },
  { input: '꽃', expected: '화훼' },
  { input: '옷', expected: '의류' },
  { input: '쌀', expected: '곡물' },
  { input: '차', expected: '차류' },
  { input: '닭', expected: '계육' },
  { input: '빵', expected: '제과' },
  { input: '약', expected: '의약품' },
  { input: '책', expected: '서적' },
  { input: '술', expected: '주류' },
  { input: '회', expected: '활어' },
  { input: '밥', expected: '한식' },
  { input: '면', expected: '면류' },
  { input: '죽', expected: '한식' },
  { input: '장', expected: '장류' },
  { input: '김', expected: '해조류' },
  { input: 'A', expected: 'A류' },
  { input: '', expected: '소매업' },
  { input: null, expected: '소매업' },
  { input: undefined, expected: '소매업' },
  { input: '농산물', expected: '농산물' },
  { input: '가공식품', expected: '가공식품' },
  { input: '떡볶이', expected: '떡볶이' }
];

let passCount = 0;
testCases.forEach((tc, idx) => {
  const result = sanitizeKstatHandledItem(tc.input);
  const ok = result === tc.expected;
  if (ok) {
    passCount++;
  } else {
    console.error(`❌ Case #${idx + 1} 실패: input="${tc.input}", got="${result}", expected="${tc.expected}"`);
  }
});

console.log(`결과: ${passCount} / ${testCases.length} 통과!`);
if (passCount !== testCases.length) {
  process.exit(1);
}

console.log('\n=== 2. splitHandledAndMainProducts 하이브리드 쿼터 정규화 테스트 ===');

// Case A: 시장떡방앗간 (상호 기반)
const resA = splitHandledAndMainProducts({
  companyName: '시장떡방앗간',
  merchantIndustry: '가공식품',
  rawHandledItems: '가공식품'
});
console.log('Case A (시장떡방앗간):', resA);
if (resA.mainProducts.length < 2) throw new Error('Case A mainProducts length < 2');

// Case B: 상호에 품목 힌트 없고 괄호 안 품목이 '떡'인 경우
const resB = splitHandledAndMainProducts({
  companyName: '행복상회',
  merchantIndustry: '가공식품',
  rawHandledItems: '가공식품 (떡)'
});
console.log('Case B (행복상회 - 괄호 떡):', resB);
if (resB.mainProducts.length < 2) throw new Error('Case B mainProducts length < 2');
if (resB.mainProducts !== '떡류') throw new Error(`Expected 떡류, got ${resB.mainProducts}`);

// Case C: 상호에 품목 힌트 없고 괄호 안 품목이 '꽃'인 경우
const resC = splitHandledAndMainProducts({
  companyName: '아름다운가게',
  merchantIndustry: '화훼',
  rawHandledItems: '가정용품 (꽃)'
});
console.log('Case C (아름다운가게 - 괄호 꽃):', resC);
if (resC.mainProducts.length < 2) throw new Error('Case C mainProducts length < 2');
if (resC.mainProducts !== '화훼') throw new Error(`Expected 화훼, got ${resC.mainProducts}`);

console.log('\n🎉 모든 단위 검증 100% 정상 통과!');
