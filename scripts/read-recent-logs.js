import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkRecentLogs() {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 3000);

  try {
    const res = await fetch('http://34.64.233.77:3000/api/events', {
      headers: { Cookie: cookie },
      signal: ac.signal
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let allText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      allText += dec.decode(value);
    }
    const lines = allText.split('\n').filter(l => l.startsWith('data: '));
    console.log(`Total events in buffer: ${lines.length}`);
    lines.slice(-30).forEach(l => {
      try {
        const d = JSON.parse(l.replace('data: ', ''));
        if (d.type === 'log') {
          console.log(`[${d.timestamp}] [${d.level}] ${d.message}`);
        } else if (d.type && d.type.type) {
          console.log(`[${d.timestamp || ''}] [${d.type.type}] #${d.type.quotaIndex || ''} step: ${d.type.step || ''} - ${d.type.message || ''}`);
        }
      } catch (_) {}
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  }
}

checkRecentLogs();
