import { runKstatAssocSurvey } from '../src/engine/kstat-assoc-runner.js';
import path from 'path';

async function main() {
  console.log('=== [상인회 조사 러너 파일럿 시뮬레이션 테스트] ===');
  const surveyUrl = 'https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=xnfXQP0GK&type=tapi&prid=2026070801&mnid=900001374&srt=1';

  try {
    const result = await runKstatAssocSurvey({
      surveyUrl,
      assocData: {
        marketName: '신림중앙시장',
        marketType: '1. 전통시장',
        leaderName: '이하연',
        leaderPhone: '010-8867-9630'
      },
      quotaIndex: 1,
      policy: {
        F5_emptyStoreReason: '1',
        F6_emptyStorePolicy: '1',
        G1_overchargeReason: '1',
        G2_overchargeSolution: '1'
      },
      pilotMode: true,
      safetyGuard: true,
      reportDir: path.resolve('reports/test_assoc_pilot'),
      onProgress: (info) => {
        console.log(`[진행 - ${info.step}] ${info.message}`);
      }
    });

    console.log('\n=== [파일럿 시뮬레이션 성공 완료] ===');
    console.log('시장명:', result.marketName);
    console.log('캡처된 단계 수:', result.capturedSteps?.length);
    result.capturedSteps?.forEach(s => console.log(` - [${s.step}] ${s.title}: ${s.path}`));

  } catch (err) {
    console.error('파일럿 시뮬레이션 실패:', err);
  }
}

main();
