import { execSync, spawn } from 'child_process';
import crypto from 'crypto';

const AUTH_COOKIE = 'autosurvey_auth=' + crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');

async function checkIsRunning() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/survey/status', {
      headers: { Cookie: AUTH_COOKIE }
    });
    if (!res.ok) return { isRunning: false };
    return await res.json();
  } catch (_) {
    return { isRunning: false };
  }
}

async function waitAndRestart() {
  // 최대 3시간(720 * 15초) 동안 15초 간격으로 배치 종료 여부 확인 후 안전 재기동
  for (let i = 0; i < 720; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const status = await checkIsRunning();
    if (!status.isRunning) {
      try {
        execSync('pm2 restart onlinepoll', { stdio: 'ignore' });
      } catch (_) {}
      process.exit(0);
    }
  }
}

async function main() {
  if (process.argv.includes('--wait-and-restart')) {
    await waitAndRestart();
    return;
  }

  const status = await checkIsRunning();
  if (!status.isRunning) {
    console.log('✅ 현재 실행 중인 설문 자동화 배치가 없습니다. 즉시 pm2 restart onlinepoll을 수행합니다.');
    execSync('pm2 restart onlinepoll', { stdio: 'inherit' });
    return;
  }

  console.log(`⚠️ [안전 가드 작동] 현재 설문 배치(캠페인 ID: ${status.campaignId})가 가동 중입니다.`);
  console.log('💡 정적 웹 자산(public/)은 서버 재기동 없이 즉시 라이브 반영되었습니다.');
  console.log('⏳ 가동 중인 설문 배치가 100% 완료되는 즉시 백그라운드에서 pm2 restart를 자동 실행합니다.');

  const child = spawn(process.execPath, [process.argv[1], '--wait-and-restart'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

main();
