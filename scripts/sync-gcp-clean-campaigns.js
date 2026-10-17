import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;
const GCP_BASE = 'http://34.64.233.77:3000';

async function syncGcpCampaigns() {
  console.log('=== [GCP PRODUCTION CAMPAIGN CLEANUP & RESTORATION] ===\n');

  // 1. 현재 GCP 캠페인 목록 조회
  console.log('1. Fetching current GCP campaigns list...');
  const listRes = await fetch(`${GCP_BASE}/api/campaigns`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000)
  });
  const currentList = await listRes.json();
  console.log(`Current GCP campaigns count: ${currentList.length}`);

  // 2. 삭제 대상 과거 더미 캠페인 필터링
  // 보존 대상: 풍납시장 (camp_1792039653802) 및 석촌시장 (camp_1792125716927)
  const deleteTargets = currentList.filter(c => c.id !== 'camp_1792039653802' && c.id !== 'camp_1792125716927');

  console.log(`\n2. Deleting ${deleteTargets.length} legacy dummy campaigns from GCP...`);
  for (const c of deleteTargets) {
    console.log(`   - Deleting "${c.title}" (${c.id})...`);
    const delRes = await fetch(`${GCP_BASE}/api/campaigns/${c.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(5000)
    });
    if (delRes.ok) {
      console.log(`     ✓ Deleted.`);
    } else {
      console.error(`     ❌ Failed to delete: ${delRes.status}`);
    }
  }

  // 3. 석촌시장 캠페인이 GCP에 있는지 확인하고 없으면 create-from-quota로 생성
  console.log('\n3. Verifying/Creating 석촌시장 campaign on GCP...');
  const hasSukchon = currentList.some(c => c.id === 'camp_1792125716927' || (c.title && c.title.includes('석촌시장')));
  
  if (!hasSukchon) {
    console.log('   - Creating 석촌시장 campaign via /api/campaigns/create-from-quota...');
    const createRes = await fetch(`${GCP_BASE}/api/campaigns/create-from-quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({
        quotaFileName: 'quota_onnuri_2026_석촌시장_업종별23개_조사쿼터_1792125716927.json',
        title: '2026 전통시장 점포경영 실태조사 _ 석촌시장 (23개 층화표본)'
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (createRes.ok) {
      const created = await createRes.json();
      console.log(`   ✓ 석촌시장 campaign created successfully on GCP! ID: ${created.id}`);
    } else {
      const errText = await createRes.text();
      console.error(`   ❌ Failed to create 석촌시장 on GCP: ${createRes.status} - ${errText}`);
    }
  } else {
    console.log('   ✓ 석촌시장 campaign already exists on GCP.');
  }

  // 4. 최종 GCP 캠페인 목록 재확인
  console.log('\n4. Verifying final GCP campaigns list...');
  const finalListRes = await fetch(`${GCP_BASE}/api/campaigns`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000)
  });
  const finalList = await finalListRes.json();
  console.log(`Final GCP campaigns count: ${finalList.length}`);
  finalList.forEach((c, idx) => {
    console.log(`   [${idx + 1}] ID: ${c.id} | 제목: "${c.title}" | 상태: ${c.status}`);
  });

  console.log('\n✅ GCP 실서버 캠페인 정리 및 신규 2개 캠페인 동기화 완료!');
}

syncGcpCampaigns().catch(e => console.error('Fatal error:', e));
