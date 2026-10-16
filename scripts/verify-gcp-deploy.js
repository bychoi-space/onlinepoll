import crypto from 'crypto';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkDeploy() {
  console.log('1. Checking survey status...');
  const statusRes = await fetch('http://34.64.233.77:3000/api/survey/status', {
    headers: { Cookie: cookie }
  });
  console.log('Status HTTP:', statusRes.status, await statusRes.json());

  console.log('\n2. Checking survey-detail.js for removal of 캡처보기/결과보기...');
  const jsRes = await fetch('http://34.64.233.77:3000/survey-detail.js', {
    headers: { Cookie: cookie }
  });
  const jsText = await jsRes.text();
  const hasCaptureView = jsText.includes('캡처보기');
  const hasResultView = jsText.includes('결과보기');
  console.log('Has 캡처보기:', hasCaptureView);
  console.log('Has 결과보기:', hasResultView);

  const isDeployed = !hasCaptureView && !hasResultView;
  console.log('\nDeployment verified:', isDeployed ? '✅ 100% SUCCESS!' : '⏳ NOT YET DEPLOYED');
  return isDeployed;
}

checkDeploy().catch(console.error);
