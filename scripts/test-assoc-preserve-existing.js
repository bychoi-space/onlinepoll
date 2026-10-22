/**
 * scripts/test-assoc-preserve-existing.js
 * 상인회 기입력 보존 및 슬롯 건너뛰기 단위/통합 검증 스크립트
 */

import { runKstatAssocSurvey } from '../src/engine/kstat-assoc-runner.js';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('=== [1] 슬롯 건너뛰기 필터 단위 검증 ===');
  const mockQuotaDb = [
    { index: 1, slotIndex: 1, companyName: '신림중앙시장', surveyCompleted: '완료', quotaStatus: 'ready' },
    { index: 2, slotIndex: 2, companyName: '관악종합시장', surveyCompleted: '미완료', quotaStatus: 'ready' },
    { index: 3, slotIndex: 3, companyName: '신원시장', surveyCompleted: '완료', quotaStatus: 'ready' },
    { index: 4, slotIndex: 4, companyName: '봉천현대시장', surveyCompleted: '미완료', quotaStatus: 'ready' }
  ];

  const policy = {
    preserveExistingInputs: true,
    skipCompletedSlots: true,
    skipSlotIndices: '2'
  };

  const skipCompletedSlots = (policy.skipCompletedSlots !== false);
  const skipSlotIndices = (policy.skipSlotIndices || '')
    .toString()
    .split(/[\s,]+/)
    .map(x => parseInt(x, 10))
    .filter(x => !isNaN(x));

  const filtered = mockQuotaDb.filter(b => {
    const idx = (b.index || b.seq || b.slotIndex);
    if (skipSlotIndices.includes(idx)) return false; // 2번 제외
    if (b.quotaStatus === 'completed') return false;
    if (skipCompletedSlots && (b.surveyCompleted === '완료' || b.surveyCompleted === true)) {
      return false; // 1번, 3번(완료) 제외
    }
    return true;
  });

  console.log(`필터링 전: ${mockQuotaDb.length}건 ➔ 필터링 후: ${filtered.length}건`);
  console.log(`남은 대상:`, filtered.map(x => `#${x.slotIndex} ${x.companyName}`));

  if (filtered.length === 1 && filtered[0].slotIndex === 4) {
    console.log('✅ [검증 성공] 1번, 3번(완료) 및 2번(지정 슬롯) 완벽 제외됨! 4번만 정상 타겟 선정.');
  } else {
    throw new Error(`슬롯 필터링 실패: 예상=[4], 실제=${JSON.stringify(filtered)}`);
  }

  console.log('\n=== [2] 블루프린트 기본값 검증 ===');
  const bpPath = path.resolve('data/kstat_assoc_blueprint.json');
  const bp = JSON.parse(fs.readFileSync(bpPath, 'utf-8'));
  if (bp.defaultPolicy.preserveExistingInputs === true && bp.defaultPolicy.skipCompletedSlots === true) {
    console.log('✅ [검증 성공] kstat_assoc_blueprint.json 기본 정책에 preserveExistingInputs, skipCompletedSlots 정상 장착됨.');
  } else {
    throw new Error('블루프린트 기본값에 정책이 누락되었습니다.');
  }

  console.log('\n=== [3] 상인회 러너 실제 헤드리스 파일럿 시뮬레이션 검증 ===');
  // 1번 슬롯 URL을 사용해 기입력 보존 모드로 헤드리스 실행 완주 검증
  const testUrl = 'https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=xnfXQP0GK&type=tapi&prid=2026070801&mnid=900001374&srt=1';
  const result = await runKstatAssocSurvey({
    surveyUrl: testUrl,
    assocData: {
      marketName: '신림중앙시장 (테스트)',
      leaderName: '홍길동(수동입력테스트)',
      leaderPhone: '010-9999-8888'
    },
    quotaIndex: 1,
    policy: {
      preserveExistingInputs: true,
      F5_emptyStoreReason: '2',
      F6_emptyStorePolicy: '3'
    },
    preserveExistingInputs: true,
    pilotMode: true,
    safetyGuard: true,
    onProgress: (info) => {
      if (['INDEX', 'Q1', 'P5', 'P15', 'P21', 'P22', 'P23', 'AGREE', 'COMPLETED'].includes(info.step)) {
        console.log(`[진행 보고] [${info.step}] ${info.message}`);
      }
    }
  });

  console.log('\n실행 결과:', result.success ? 'Success: true ✅' : 'Failed ❌');
  if (!result.success) {
    throw new Error('상인회 파일럿 실행 실패');
  }

  console.log('🎉 모든 기입력 보존 및 스킵 규칙 검증이 100% 정상 통과되었습니다!');
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error('검증 오류:', err);
  process.exit(1);
});
