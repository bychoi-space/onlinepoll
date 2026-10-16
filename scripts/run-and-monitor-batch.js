import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;
const GCP_URL = 'http://34.64.233.77:3000';
const CAMPAIGN_ID = 'camp_1792039653802';

async function main() {
  console.log('=======================================================');
  console.log('🚀 [AutoSurvey AI] 풍납시장 잔여 17개 점포(#8~#24) 실전 배치 자동화');
  console.log('=======================================================');

  // 1. 현재 서버 상태 확인
  const statusRes = await fetch(`${GCP_URL}/api/survey/status`, {
    headers: { Cookie: cookie }
  });
  const statusData = await statusRes.json();
  console.log('현재 서버 작업 상태:', statusData);

  if (statusData.isRunning) {
    console.log('⚠️ 이미 다른 작업이 실행 중입니다. 중복 실행하지 않고 모니터링 모드로 진입합니다.');
  } else {
    // 2. 배치 실행 요청 전송 (안전가드 OFF = 실제 최종 동의 및 제출 마감)
    console.log('\n[배치 가동 요청] safetyGuard: false, startIndex: 2 전송...');
    const startRes = await fetch(`${GCP_URL}/api/campaigns/${CAMPAIGN_ID}/batch-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        startIndex: 2,
        safetyGuard: false
      })
    });

    const startData = await startRes.json();
    if (!startRes.ok) {
      console.error('❌ 배치 시작 실패:', startData);
      process.exit(1);
    }
    console.log('✅ 배치 가동 성공:', startData.message);
    console.log(`총 실행 대상: ${startData.totalTargets}개 점포`);
  }

  // 3. 실시간 SSE 이벤트 스트림 수신 및 모니터링
  console.log('\n📡 [실시간 모니터링] GCP 이벤트 스트림(SSE) 연결 중...');
  try {
    const eventRes = await fetch(`${GCP_URL}/api/events`, {
      headers: { Cookie: cookie }
    });

    const reader = eventRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log('📡 이벤트 스트림 연결이 종료되었습니다.');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 잔여 미완성 라인 보존

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const raw = JSON.parse(line.slice(6));
            const data = (typeof raw.type === 'object' && raw.type !== null)
              ? { ...raw, ...raw.type, type: raw.type.type || raw.type }
              : (raw.data && typeof raw.data === 'object')
                ? { ...raw, ...raw.data }
                : raw;

            const time = data.timestamp || new Date().toLocaleTimeString('ko-KR');

            if (data.type === 'BATCH_PROGRESS') {
              console.log(`[${time}] [점포 #${data.quotaIndex}] [진행: ${data.itemNumber}/${data.totalItems}] [${data.step}] ${data.message || ''}`);
            } else if (data.type === 'QUOTA_UPDATED') {
              const summary = {};
              data.quotaDatabase?.forEach(b => {
                summary[b.quotaStatus] = (summary[b.quotaStatus] || 0) + 1;
              });
              // 요약 한 줄 출력
              process.stdout.write(`\r📊 [DB 현황] 완료(completed): ${summary.completed || 0} | 검증(pilot): ${summary.pilot_done || 0} | 실행중(running): ${summary.running || 0} | 대기(ready): ${summary.ready || 0}\n`);
            } else if (data.type === 'BATCH_COMPLETED') {
              console.log(`\n🎉 [${time}] 전 점포 배치 자동화가 최종 완료되었습니다! (100% 마감)`);
              process.exit(0);
            } else if (data.type === 'log') {
              if (data.level === 'error') {
                console.error(`[${time}] ❌ ${data.message}`);
              } else if (data.level === 'warn') {
                console.warn(`[${time}] ⚠️ ${data.message}`);
              } else if (data.level === 'success') {
                console.log(`[${time}] ✅ ${data.message}`);
              } else {
                console.log(`[${time}] ℹ️ ${data.message}`);
              }
            }
          } catch (e) {
            // JSON 파싱 에러 무시
          }
        }
      }
    }
  } catch (err) {
    console.error('SSE 수신 오류:', err.message);
  }
}

main().catch(console.error);
