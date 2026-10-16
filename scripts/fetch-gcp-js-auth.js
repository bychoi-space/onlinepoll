import crypto from 'crypto';
import fs from 'fs';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = `autosurvey_auth=${token}`;

async function fetchGcpJsWithAuth() {
  const res = await fetch('http://34.64.233.77:3000/survey-detail.js', {
    headers: { Cookie: cookie }
  });
  const text = await res.text();
  console.log(`GCP survey-detail.js (with auth) length: ${text.length} chars`);
  fs.writeFileSync('scripts/gcp-survey-detail-auth.js', text, 'utf-8');
}

fetchGcpJsWithAuth().catch(console.error);
