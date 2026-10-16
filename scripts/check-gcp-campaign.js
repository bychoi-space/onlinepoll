import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkCampaign() {
  const url = 'http://34.64.233.77:3000/api/campaigns/camp_1792039653802';
  try {
    const res = await fetch(url, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    console.log('--- GCP Campaign Status ---');
    console.log('HTTP Status:', res.status);
    console.log('Data keys:', Object.keys(data));
    console.log('Title:', data.title);
    console.log('Status:', data.status);
    const quotas = data.quotaDatabase || data.campaign?.quotas || [];
    console.log('Total Quotas:', quotas.length);
    const summary = {};
    quotas.forEach((q, idx) => {
      const st = q.quotaStatus || q.status || 'ready';
      summary[st] = (summary[st] || 0) + 1;
      console.log(`[#${String(q.index || idx + 1).padStart(2, '0')}] ${q.companyName || q.merchantName || q.name} (${q.bizNumber || q.businessNo}) -> status: ${st} | ${q.extraLabel || ''}`);
    });
    console.log('\nSummary:', summary);
  } catch (err) {
    console.error('Failed to fetch GCP campaign:', err.message);
  }
}

checkCampaign();
