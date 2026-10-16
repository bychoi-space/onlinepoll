import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkSseHistory() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('http://34.64.233.77:3000/api/events', {
      headers: { Cookie: cookie },
      signal: controller.signal
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      console.log('SSE Chunk:', text);
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  }
}

checkSseHistory().catch(console.error);
