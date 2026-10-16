import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;

async function check() {
  console.log('=== VERIFYING GCP ONNURI MASTER STATUS ===');
  
  // 1. master-status 엔드포인트 확인
  try {
    const res = await fetch('http://34.64.233.77:3000/api/onnuri/master-status', {
      headers: { Cookie: cookie }
    });
    console.log('1. master-status HTTP:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('   Data:', data);
    } else {
      console.log('   Body:', (await res.text()).slice(0, 100));
    }
  } catch (err) {
    console.error('1. master-status Error:', err.message);
  }

  // 2. market-stats (풍납시장) 통계 확인
  try {
    const statsRes = await fetch('http://34.64.233.77:3000/api/onnuri/market-stats?marketName=' + encodeURIComponent('풍납시장'), {
      headers: { Cookie: cookie }
    });
    console.log('\n2. market-stats HTTP:', statsRes.status);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      console.log('   Source:', stats.source);
      console.log('   Market:', stats.marketName, `(총 ${stats.totalRawCount}건)`);
      console.log('   Categories:', Object.keys(stats.categories || {}).map(k => `${k}:${stats.categories[k].withBiz}`).join(', '));
    }
  } catch (err) {
    console.error('2. market-stats Error:', err.message);
  }

  // 3. quota-builder.html 내 마스터 DB 상태 바 확인
  try {
    const htmlRes = await fetch('http://34.64.233.77:3000/quota-builder.html', {
      headers: { Cookie: cookie }
    });
    const html = await htmlRes.text();
    console.log('\n3. HTML has badge-master-db-status:', html.includes('id="badge-master-db-status"'));
    console.log('   HTML has btn-sync-master-db:', html.includes('id="btn-sync-master-db"'));
  } catch (err) {
    console.error('3. HTML Error:', err.message);
  }
}

check().catch(console.error);
