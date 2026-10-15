import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = `autosurvey_auth=${token}`;

async function testQuotaList() {
  const res = await fetch('http://34.64.233.77:3000/api/quota/list', {
    headers: { Cookie: cookie }
  });
  console.log('Status:', res.status);
  const list = await res.json();
  console.log(`GCP Quotas count: ${list.length}`);
  list.forEach(q => console.log(` - [${q.count}건] ${q.title} (${q.fileName})`));
}

testQuotaList().catch(console.error);
