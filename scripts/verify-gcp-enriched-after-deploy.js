import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function verify() {
  console.log('Verifying GCP post-deploy state...');
  const res = await fetch('http://34.64.233.77:3000/api/campaigns/camp_1792039653802', {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  console.log('Campaign Title:', data.title);
  console.log('Total Quotas:', data.quotaDatabase.length);
  console.log('Sample #1:');
  console.log('  Company:', data.quotaDatabase[0].companyName);
  console.log('  Address:', data.quotaDatabase[0].address);
  console.log('  CEO:', data.quotaDatabase[0].ceoName);
  console.log('  Phone:', data.quotaDatabase[0].phone);
  console.log('Sample #2:');
  console.log('  Company:', data.quotaDatabase[1].companyName);
  console.log('  Address:', data.quotaDatabase[1].address);
  console.log('  CEO:', data.quotaDatabase[1].ceoName);
  console.log('  Phone:', data.quotaDatabase[1].phone);
  console.log('Sample #3:');
  console.log('  Company:', data.quotaDatabase[2].companyName);
  console.log('  Address:', data.quotaDatabase[2].address);
  console.log('  CEO:', data.quotaDatabase[2].ceoName);
  console.log('  Phone:', data.quotaDatabase[2].phone);
}

verify().catch(console.error);
