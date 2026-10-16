import crypto from 'crypto';
import fs from 'fs';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = `autosurvey_auth=${token}`;

async function fetchGcpHtml() {
  const res = await fetch('http://34.64.233.77:3000/survey-detail.html', {
    headers: { Cookie: cookie }
  });
  const text = await res.text();
  console.log(`GCP survey-detail.html length: ${text.length} chars`);
  fs.writeFileSync('scripts/gcp-survey-detail.html', text, 'utf-8');
}

fetchGcpHtml().catch(console.error);
