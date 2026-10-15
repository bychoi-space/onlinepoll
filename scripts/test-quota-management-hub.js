import fs from 'fs';
import path from 'path';

const quotasDir = path.resolve('data/quotas');

async function testQuotaManagementHub() {
  console.log('🚀 [Test 1] Testing Quota List & Industry Distribution...');
  const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));
  const target24 = files.find(f => f.includes('24개'));
  if (!target24) throw new Error('24개 쿼터 파일을 찾을 수 없습니다.');

  const content24 = JSON.parse(fs.readFileSync(path.join(quotasDir, target24), 'utf-8'));
  console.log(`- 24개 쿼터 파일명: ${target24}`);
  console.log(`- 표본 수: ${content24.count}건 (실제 데이터: ${content24.data.length}건)`);

  // Verify 9 industry categories
  const standardKeys = [
    { key: '농산물', label: '농산물' },
    { key: '축산물', label: '축산물' },
    { key: '수산물', label: '수산물' },
    { key: '가공식품', label: '가공식품' },
    { key: '의류', label: '의류신발' },
    { key: '가정용품', label: '가정용품' },
    { key: '음식점', label: '음식점업' },
    { key: '기타소매', label: '기타소매' },
    { key: '근린상권', label: '근린상권' }
  ];

  const counts = {};
  content24.data.forEach(item => {
    const raw = String(item.handledItems || item.industry || '기타');
    const matched = standardKeys.find(s => raw.includes(s.key))?.label || '기타';
    counts[matched] = (counts[matched] || 0) + 1;
  });

  console.log('업종별 분포 확인:');
  console.log(JSON.stringify(counts, null, 2));

  for (const s of standardKeys) {
    if (!counts[s.label] || counts[s.label] === 0) {
      throw new Error(`업종 "${s.label}"이(가) 24개 표본에 누락되었습니다!`);
    }
  }
  console.log('✅ 9대 업종 층화 표본 100% 충족 확인 완료!');

  console.log('\n🚀 [Test 2] Testing HTML & CSS zero-inline-style rule...');
  const htmls = ['public/index.html', 'public/quota-detail.html', 'public/quota-builder.html', 'public/survey-detail.html'];
  for (const h of htmls) {
    const rawHtml = fs.readFileSync(h, 'utf-8');
    const matches = [...rawHtml.matchAll(/style=[\x27\x22]/g)];
    if (matches.length > 0) {
      throw new Error(`HTML 파일 ${h}에 인라인 style="${matches.length}건"이 발견되었습니다!`);
    }
    console.log(`- ${h}: 인라인 스타일 0건 (완벽 통과)`);
  }

  console.log('\n🎉 ALL Quota Management Hub integration checks PASSED 100%!');
}

testQuotaManagementHub().catch(err => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});
