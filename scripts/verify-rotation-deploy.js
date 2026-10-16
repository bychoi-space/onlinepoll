import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function check() {
  console.log('Checking GCP deployment for B4_4 and rotation...');
  for (let i = 1; i <= 20; i++) {
    try {
      const res = await fetch('http://34.64.233.77:3000/survey-detail.js?v=' + Date.now(), {
        headers: { Cookie: cookie, 'Cache-Control': 'no-cache' }
      });
      const js = await res.text();
      const hasTaxSlider = js.includes('slider-cost-tax');
      const hasRotationOption = js.includes('btnPresetRotation') || js.includes('자유 로테이션');
      console.log(`[Attempt ${i}] hasTaxSlider=${hasTaxSlider}, hasRotationOption=${hasRotationOption}`);
      if (hasTaxSlider && hasRotationOption) {
        console.log('🎉 LIVE VERIFICATION SUCCESS: GCP VM has updated code!');
        
        // Check survey-blueprint.js as well
        const bpRes = await fetch('http://34.64.233.77:3000/survey-blueprint.js?v=' + Date.now(), {
          headers: { Cookie: cookie, 'Cache-Control': 'no-cache' }
        });
        const bpJs = await bpRes.text();
        console.log('survey-blueprint.js hasTaxSlider:', bpJs.includes('slider-cost-tax'));
        console.log('survey-blueprint.js hasRotation:', bpJs.includes('btnPresetRotation'));

        // Check CSS
        const cssRes = await fetch('http://34.64.233.77:3000/custom-styles.css?v=' + Date.now(), {
          headers: { Cookie: cookie, 'Cache-Control': 'no-cache' }
        });
        const cssText = await cssRes.text();
        console.log('custom-styles.css has btn-pill-success:', cssText.includes('btn-pill-success'));

        return true;
      }
    } catch (e) {
      console.log(`[Attempt ${i}] ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

check();
