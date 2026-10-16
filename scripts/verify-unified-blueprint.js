import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function check() {
  console.log('Checking GCP deployment status for unified layout...');
  for (let i = 1; i <= 12; i++) {
    try {
      const res = await fetch('http://34.64.233.77:3000/survey-detail.html?id=camp_1792039653802', {
        headers: { Cookie: cookie }
      });
      const html = await res.text();
      if (html.includes('v=20261016_3')) {
        console.log(`[Attempt ${i}] DEPLOYMENT VERIFIED! v=20261016_3 is active on GCP.`);
        console.log('- Has section-master-blueprint:', html.includes('id="section-master-blueprint"'));
        console.log('- Has blueprint-stage-grid:', html.includes('id="blueprint-stage-grid"'));
        console.log('- Has btn-preset-standard:', html.includes('id="btn-preset-standard"'));
        console.log('- Has removed policy-empty-notes:', !html.includes('policy-empty-notes'));
        console.log('- Has removed slider-pos (generic):', !html.includes('id="slider-pos"'));

        const jsRes = await fetch('http://34.64.233.77:3000/survey-detail.js?v=20261016_3', { headers: { Cookie: cookie } });
        const js = await jsRes.text();
        console.log('- JS has loadBlueprint:', js.includes('loadBlueprint'));
        console.log('- JS has renderStages:', js.includes('renderStages'));
        console.log('- JS has slider-credit-card:', js.includes('slider-credit-card'));
        return true;
      }
      console.log(`[Attempt ${i}] Waiting for deploy to complete...`);
    } catch (e) {
      console.log(`[Attempt ${i}] Connection: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3500));
  }
}

check();
