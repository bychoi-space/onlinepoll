import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function checkDeploy() {
  console.log('=== VERIFYING GCP PRODUCTION POST-DEPLOY ===');
  
  // 1. HTML 확인
  const htmlRes = await fetch('http://34.64.233.77:3000/quota-builder.html', { headers: { Cookie: cookie } });
  const htmlText = await htmlRes.text();
  console.log('1. quota-builder.html contains max-open-year:', htmlText.includes('id="max-open-year"'));
  
  // 2. 캠페인 쿼터 확인
  const campRes = await fetch('http://34.64.233.77:3000/api/campaigns/camp_1792039653802', { headers: { Cookie: cookie } });
  const campData = await campRes.json();
  console.log('2. Campaign Quotas count:', campData.quotaDatabase.length);
  
  // 2026년 이후 점포 잔존 여부 확인
  let post2026Count = 0;
  campData.quotaDatabase.forEach((q, idx) => {
    const yr = q.openDate ? parseInt(q.openDate.slice(0, 4), 10) : 0;
    if (yr >= 2026) {
      post2026Count++;
      console.log(`  [Alert] #${idx+1} ${q.companyName} (${q.openDate}) >= 2026`);
    }
  });
  console.log('3. Merchants with openYear >= 2026:', post2026Count, post2026Count === 0 ? '(PERFECT: 0건!)' : '(경고)');

  console.log('\n4. Replaced 5 merchants status on GCP:');
  [16, 17, 18, 21, 22].forEach(num => {
    const q = campData.quotaDatabase[num - 1];
    console.log(`   [#${num}] ${q.companyName} (${q.openDate}) | CEO: ${q.ceoName || '-'} | Tel: ${q.phone} | Addr: ${q.address}`);
  });
}

checkDeploy().catch(console.error);
