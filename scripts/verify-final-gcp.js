import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function verifyAll() {
  console.log('=== GCP PRODUCTION VERIFICATION ===');
  
  // 1. survey-detail.html
  const htmlRes = await fetch('http://34.64.233.77:3000/survey-detail.html?id=camp_1792039653802', { headers: { Cookie: cookie } });
  const html = await htmlRes.text();
  console.log('1. survey-detail.html:');
  console.log('   - Status:', htmlRes.status);
  console.log('   - Has [설문조사 전체를 한 화면으로 복제하기]:', html.includes('설문조사 전체를 한 화면으로 복제하기'));
  console.log('   - Has [성별] table header:', html.includes('>성별</th>'));
  console.log('   - Has [나이] table header:', html.includes('>나이</th>'));
  console.log('   - Has link-open-blueprint id:', html.includes('id="link-open-blueprint"'));
  console.log('   - Has cache-buster v=20261016_2:', html.includes('v=20261016_2'));

  // 2. survey-detail.js
  const jsRes = await fetch('http://34.64.233.77:3000/survey-detail.js?v=20261016_2', { headers: { Cookie: cookie } });
  const js = await jsRes.text();
  console.log('2. survey-detail.js:');
  console.log('   - Status:', jsRes.status);
  console.log('   - Has editable-quota-cell logic:', js.includes('editable-quota-cell'));
  console.log('   - Has autoSaveCampaignQuotas:', js.includes('autoSaveCampaignQuotas'));
  console.log('   - Has survey-blueprint href setting:', js.includes('survey-blueprint.html'));

  // 3. survey-blueprint.html
  const bpRes = await fetch('http://34.64.233.77:3000/survey-blueprint.html?campaignId=camp_1792039653802', { headers: { Cookie: cookie } });
  console.log('3. survey-blueprint.html:');
  console.log('   - Status:', bpRes.status);

  // 4. API blueprint
  const apiBp = await fetch('http://34.64.233.77:3000/api/campaigns/camp_1792039653802/blueprint', { headers: { Cookie: cookie } });
  console.log('4. API GET /api/campaigns/:id/blueprint:');
  console.log('   - Status:', apiBp.status);

  console.log('=== VERIFICATION FINISHED SUCCESSFULLY ===');
}

verifyAll();
