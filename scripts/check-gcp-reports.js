import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkReports() {
  // Let's test the screenshots endpoint for all 24 items to see which items have files!
  console.log('Scanning screenshots endpoint for items 1 through 10...');
  for (let i = 1; i <= 10; i++) {
    try {
      const res = await fetch(`http://34.64.233.77:3000/api/campaigns/camp_1792039653802/screenshots?quotaIndex=${i}`, {
        headers: { Cookie: cookie }
      });
      const data = await res.json();
      console.log(`[Item #${i}] ${data.bizName || 'unknown'}: ${data.screenshots?.length || 0} screenshots found. (message: ${data.message || 'ok'})`);
    } catch (e) {
      console.error(`Item #${i} error:`, e.message);
    }
  }
}

checkReports().catch(console.error);
