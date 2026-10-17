import fs from 'fs';
import path from 'path';

const campaignsPath = path.resolve('data/campaigns.json');
const quotasDir = path.resolve('data/quotas');

// 1. 기존 campaigns.json 읽기
const campaigns = JSON.parse(fs.readFileSync(campaignsPath, 'utf-8'));

// 2. 풍납시장 캠페인 보존
const pungnap = campaigns.find(c => c.id === 'camp_1792039653802');
if (!pungnap) {
  throw new Error('풍납시장 캠페인(camp_1792039653802)을 찾을 수 없습니다.');
}

// 3. 석촌시장 쿼터 파일 읽기
const sukchonFile = 'quota_onnuri_2026_석촌시장_업종별23개_조사쿼터_1792125716927.json';
const sukchonMeta = JSON.parse(fs.readFileSync(path.join(quotasDir, sukchonFile), 'utf-8'));
const sukchonDb = (sukchonMeta.data || []).map((b, idx) => ({
  index: idx + 1,
  ...b,
  quotaStatus: 'ready',
  usedAt: null
}));

// 풍납시장의 마스터 기준점 복제
const inheritedBaseline = pungnap.masterBaseline 
  ? JSON.parse(JSON.stringify(pungnap.masterBaseline)) 
  : null;

// 4. 석촌시장 캠페인 생성
const sukchonCamp = {
  id: 'camp_1792125716927',
  title: '2026 전통시장 점포경영 실태조사 _ 석촌시장 (23개 층화표본)',
  description: '석촌시장 온누리상품권 가맹 소상공인 대상 설문조사',
  quotaType: 'b2b',
  status: 'ready',
  createdAt: '2026-10-16T04:41:56.927Z',
  updatedAt: new Date().toISOString(),
  quotaConfig: {
    quotaSource: 'FILE_IMPORT',
    quotaFileName: sukchonFile,
    quotaTitle: sukchonMeta.title || sukchonFile,
    marketName: '석촌시장',
    targetCount: sukchonDb.length,
    selectedFields: (sukchonMeta.columns || []).map(c => c.key)
  },
  quotaDatabase: sukchonDb,
  masterBaseline: inheritedBaseline,
  hasMasterBlueprint: !!inheritedBaseline,
  guidelineConfig: {
    surveyUrl: '',
    topic: '2026 전통시장 점포경영 실태조사 _ 석촌시장',
    positiveRatio: 70,
    neutralRatio: 20,
    negativeRatio: 10,
    textGuidelines: '',
    iterations: 1,
    headless: true
  },
  results: []
};

// 5. 최종 2개 신규 캠페인만 남김 (과거 더미 캠페인 5개 전면 제거)
const finalCampaigns = [pungnap, sukchonCamp];

fs.writeFileSync(campaignsPath, JSON.stringify(finalCampaigns, null, 2), 'utf-8');
console.log('✅ 과거 더미 캠페인 5개 정리 완료');
console.log('✅ 신규 캠페인 2개 보존 및 생성 완료:');
finalCampaigns.forEach((c, idx) => {
  console.log(`  [${idx + 1}] ID: ${c.id} | 제목: "${c.title}" | 쿼터 수: ${c.quotaDatabase.length}개`);
});
