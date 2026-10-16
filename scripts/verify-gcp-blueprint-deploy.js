import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkDeployment() {
  console.log('Checking GCP deployment status...');
  for (let i = 1; i <= 15; i++) {
    try {
      const res = await fetch('http://34.64.233.77:3000/survey-blueprint.html', {
        headers: { Cookie: cookie }
      });
      if (res.status === 200) {
        const text = await res.text();
        if (text.includes('마스터 설문 블루프린트')) {
          console.log(`[Attempt ${i}] DEPLOYMENT VERIFIED! survey-blueprint.html is live and responding.`);
          
          // Check survey-detail.js
          const jsRes = await fetch('http://34.64.233.77:3000/survey-detail.js', { headers: { Cookie: cookie } });
          const jsText = await jsRes.text();
          console.log('survey-detail.js has col-gender:', jsText.includes('col-gender'));
          console.log('survey-detail.js has survey-blueprint.html:', jsText.includes('survey-blueprint.html'));

          // Check survey-detail.html
          const htmlRes = await fetch('http://34.64.233.77:3000/survey-detail.html?id=camp_1792039653802', { headers: { Cookie: cookie } });
          const htmlText = await htmlRes.text();
          console.log('survey-detail.html has 성별 header:', htmlText.includes('성별'));
          console.log('survey-detail.html has 나이 header:', htmlText.includes('나이'));
          console.log('survey-detail.html has blueprint button:', htmlText.includes('설문조사 전체를 한 화면으로 복제하기'));

          // Check server blueprint API
          const bpRes = await fetch('http://34.64.233.77:3000/api/campaigns/camp_1792039653802/blueprint', { headers: { Cookie: cookie } });
          console.log('GET /api/campaigns/:id/blueprint HTTP:', bpRes.status);
          if (bpRes.ok) {
            const bpData = await bpRes.json();
            console.log('Blueprint totalStages:', bpData.blueprint?.totalStages);
          }

          return true;
        }
      }
      console.log(`[Attempt ${i}] HTTP ${res.status}. Waiting for deploy to complete...`);
    } catch (e) {
      console.log(`[Attempt ${i}] Connection waiting: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
  return false;
}

checkDeployment();
