import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = `autosurvey_auth=${token}`;

async function testGCP() {
  console.log('Testing GCP with cookie:', cookie);

  // 1. Quota list
  try {
    const res = await fetch('http://34.64.233.77:3000/api/quota/list', {
      headers: { Cookie: cookie }
    });
    console.log('/api/quota/list status:', res.status);
    const data = await res.json();
    console.log('/api/quota/list response:', Array.isArray(data) ? `Array of ${data.length} items` : data);
    if (Array.isArray(data)) {
      data.slice(0, 3).forEach(x => console.log('  -', x.title, x.fileName));
    }
  } catch (e) {
    console.log('/api/quota/list error:', e.message);
  }

  // 2. Campaigns list
  try {
    const res = await fetch('http://34.64.233.77:3000/api/campaigns', {
      headers: { Cookie: cookie }
    });
    console.log('\n/api/campaigns status:', res.status);
    const data = await res.json();
    console.log('/api/campaigns response:', Array.isArray(data) ? `Array of ${data.length} campaigns` : data);
    if (Array.isArray(data)) {
      data.forEach(c => console.log('  -', c.id, c.title));
    }
  } catch (e) {
    console.log('/api/campaigns error:', e.message);
  }
}

testGCP().catch(console.error);
