import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function dumpHistory() {
  console.log('Connecting to GCP /api/events for history dump...');
  const res = await fetch('http://34.64.233.77:3000/api/events', {
    headers: { Cookie: cookie }
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const timer = setTimeout(() => {
    console.log('Done collecting history.');
    process.exit(0);
  }, 2500);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const raw = JSON.parse(line.slice(6));
          const time = raw.timestamp || '';
          if (raw.type === 'log') {
            console.log(`[${time}] [LOG ${raw.level}] ${raw.message}`);
          } else if (raw.type === 'BATCH_PROGRESS') {
            console.log(`[${time}] [PROGRESS #${raw.quotaIndex}] ${raw.step} - ${raw.message}`);
          } else {
            console.log(`[${time}] [${raw.type}]`, raw.message || raw);
          }
        } catch (_) {}
      }
    }
  }
}

dumpHistory().catch(console.error);
