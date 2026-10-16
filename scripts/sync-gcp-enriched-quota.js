import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MASTER_PASSWORD = '2265';
const TOKEN_SALT = 'autosurvey_secure_salt_2026';
const token = crypto.createHmac('sha256', TOKEN_SALT).update(MASTER_PASSWORD).digest('hex');
const cookie = 'autosurvey_auth=' + token;

const GCP_BASE = 'http://34.64.233.77:3000';

async function syncToGCP() {
  console.log('=== SYNCING ENRICHED 24 MERCHANTS TO GCP ===');

  // 로컬에서 갱신된 파일 로드
  const campPath = path.resolve('data/campaigns.json');
  const quotaJsonPath = path.resolve('data/quotas/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json');

  const camps = JSON.parse(fs.readFileSync(campPath, 'utf8'));
  const camp = camps.find(c => c.id === 'camp_1792039653802');
  const quotaObj = JSON.parse(fs.readFileSync(quotaJsonPath, 'utf8'));

  if (!camp) {
    throw new Error('Local camp_1792039653802 not found');
  }

  // 1. GCP의 현재 상태 확인 (isRunning 체크)
  console.log('1. Checking GCP campaign status...');
  const getRes = await fetch(`${GCP_BASE}/api/campaigns/camp_1792039653802`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000)
  });
  if (!getRes.ok) {
    throw new Error(`Failed to get GCP campaign: ${getRes.status} ${getRes.statusText}`);
  }
  const gcpCamp = await getRes.json();
  console.log(`Current GCP campaign status: ${gcpCamp.status}, title: ${gcpCamp.title}`);

  // 2. PUT /api/campaigns/camp_1792039653802 (캠페인 쿼터DB 동기화)
  console.log('\n2. Updating GCP campaign quotaDatabase...');
  const updateCampRes = await fetch(`${GCP_BASE}/api/campaigns/camp_1792039653802`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      quotaDatabase: camp.quotaDatabase
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!updateCampRes.ok) {
    const errText = await updateCampRes.text();
    throw new Error(`Failed to update GCP campaign: ${updateCampRes.status} - ${errText}`);
  }
  const updatedCampData = await updateCampRes.json();
  console.log(`GCP Campaign updated successfully! Quotas count: ${updatedCampData.quotaDatabase.length}`);

  // 3. PUT /api/quota/quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json (쿼터 보관함 및 Excel 동기화)
  console.log('\n3. Updating GCP quota storage and Excel...');
  const fileName = 'quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646.json';
  const updateQuotaRes = await fetch(`${GCP_BASE}/api/quota/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      title: quotaObj.title,
      data: quotaObj.data
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!updateQuotaRes.ok) {
    const errText = await updateQuotaRes.text();
    throw new Error(`Failed to update GCP quota file: ${updateQuotaRes.status} - ${errText}`);
  }
  const updatedQuotaData = await updateQuotaRes.json();
  console.log(`GCP Quota storage updated successfully! Message: ${updatedQuotaData.message}`);

  // 4. 검증: GCP 캠페인 다시 조회하여 주소 확인
  console.log('\n4. Verifying GCP updated quotas sample...');
  const verifyRes = await fetch(`${GCP_BASE}/api/campaigns/camp_1792039653802`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(5000)
  });
  const verifiedData = await verifyRes.json();
  for (let i = 0; i < 5; i++) {
    const q = verifiedData.quotaDatabase[i];
    console.log(`[#${i+1}] ${q.companyName} | CEO: ${q.ceoName} | Tel: ${q.phone} | Addr: ${q.address}`);
  }

  console.log('\n=== ALL GCP ENRICHMENT SYNC COMPLETED SUCCESSFULLY ===');
}

syncToGCP().catch(console.error);
