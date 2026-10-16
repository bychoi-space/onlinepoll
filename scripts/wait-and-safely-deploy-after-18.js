import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function monitorAndPause() {
  console.log('🔍 [#18 메가엠지씨커피] 안전 완주 대기 모니터링 시작...');
  while (true) {
    try {
      const res = await fetch('http://34.64.233.77:3000/api/campaigns/camp_1792039653802', {
        headers: { Cookie: cookie }
      });
      const camp = await res.json();
      const db = camp.quotaDatabase || [];
      const item18 = db.find(b => (b.index || b.seq) === 18);

      if (item18 && (item18.quotaStatus === 'pilot_done' || item18.quotaStatus === 'completed')) {
        console.log(`🎉 [#18 ${item18.companyName}] 100% 안전 완주 확인! (상태: ${item18.quotaStatus})`);
        console.log('🛑 다음 점포(#19) 진입 전 안전 배포를 위해 배치 일시 정지를 요청합니다...');
        
        const stopRes = await fetch('http://34.64.233.77:3000/api/survey/stop', {
          method: 'POST',
          headers: { Cookie: cookie }
        });
        const stopData = await stopRes.json();
        console.log('✅ 서버 응답:', stopData.message || '작업 중지 완료');
        console.log('🚀 이제 서버가 18개 완주 상태에서 안전한 유휴 상태입니다. 배포를 진행할 수 있습니다.');
        break;
      } else {
        process.stdout.write(`⏳ [#18 메가엠지씨커피] 실행 중... (${new Date().toLocaleTimeString('ko-KR')})\r`);
      }
    } catch (err) {
      console.error('모니터링 오류:', err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

monitorAndPause();
