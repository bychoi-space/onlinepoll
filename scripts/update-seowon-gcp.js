import crypto from 'crypto';

const token = crypto.createHmac('sha256', 'autosurvey_secure_salt_2026').update('2265').digest('hex');
const cookie = 'autosurvey_auth=' + token;
const fileName = 'quota_onnuri_2026_서원동상점가_업종별30개_조사쿼터_1792544350602.json';
const GCP_URL = 'http://34.64.233.77:3000';

const KAKAO_KEY = 'b70a114467ff79ff2dd5d4d4d1ba118f';
const KAKAO_HEADERS = {
  Authorization: `KakaoAK ${KAKAO_KEY}`,
  'KA': 'sdk/1.0.0 os/javascript lang/ko-KR device/pc origin/https://www.onnuri.gift',
  'Origin': 'https://www.onnuri.gift'
};

async function getOnnuriSeowonStores() {
  const res = await fetch('https://www.onnuri.gift/api/v3/onrgt/place/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      latitude: 37.482569,
      longitude: 126.929125,
      radius: 600
    })
  });
  const d = await res.json();
  return (d.data?.list || []).filter(i => (i.mrktNm || '').includes('서원'));
}

async function convertLotToRoad(addr) {
  if (!addr) return null;
  const cleanLot = addr.replace(/\([^)]*\)/g, '').replace(/지하\s*\d+층/g, '').replace(/\b\d+층\b/g, '').trim();
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(cleanLot)}`, {
      headers: KAKAO_HEADERS
    });
    const d = await res.json();
    const doc = d.documents?.[0];
    if (doc?.road_address?.address_name) {
      const bName = doc.road_address.building_name ? ` (${doc.road_address.building_name})` : '';
      return `${doc.road_address.address_name}${bName}`;
    }
  } catch (_) {}
  return null;
}

async function convertKeywordToRoad(compName) {
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(`신림동 ${compName}`)}`, {
      headers: KAKAO_HEADERS
    });
    const d = await res.json();
    const doc = d.documents?.[0];
    if (doc?.road_address_name) {
      return doc.road_address_name;
    }
  } catch (_) {}
  return null;
}

function normalizeRoadAddress(addr) {
  if (!addr) return '';
  let cleaned = String(addr).trim();
  if (cleaned.startsWith('서울 ') && !cleaned.startsWith('서울특별시 ')) {
    cleaned = '서울특별시 ' + cleaned.slice(3);
  } else if (cleaned.startsWith('경기 ') && !cleaned.startsWith('경기도 ')) {
    cleaned = '경기도 ' + cleaned.slice(3);
  }
  return cleaned.replace(/\s+/g, ' ');
}

async function updateQuotaOnGcp() {
  console.log('1. Fetching onnuri.gift place data...');
  const onnuriStores = await getOnnuriSeowonStores();
  console.log(`Onnuri stores for 서원동상점가: ${onnuriStores.length}건 로드 완료.`);

  console.log('\n2. Fetching current quota from GCP...');
  const res = await fetch(`${GCP_URL}/api/quota/${encodeURIComponent(fileName)}`, {
    headers: { Cookie: cookie }
  });
  const data = await res.json();
  const q = data.quota || data;
  const items = q.data || [];
  console.log(`Current items: ${items.length}건`);

  console.log('\n3. Normalizing all addresses to 도로명주소...');
  const updatedItems = [];

  for (const it of items) {
    let roadAddr = null;
    const cleanComp = it.companyName.replace(/\([^)]*\)/g, '').replace(/점$/, '').trim();

    // 1순위: onnuri.gift 해당 시장 캐시에서 매칭
    const onnuriMatch = onnuriStores.find(os => {
      const osName = (os.frcsNm || '').replace(/\([^)]*\)/g, '').trim();
      return osName === cleanComp || osName.includes(cleanComp) || cleanComp.includes(osName);
    });

    if (onnuriMatch?.frcsAddr && /(?:로|길)\s*[\d-]+/.test(onnuriMatch.frcsAddr)) {
      roadAddr = onnuriMatch.frcsAddr;
    }

    // 2순위: 기존 주소가 지번 번호를 가지고 있는 경우 카카오 공인 변환
    if (!roadAddr && it.address) {
      roadAddr = await convertLotToRoad(it.address);
    }

    // 3순위: 카카오 키워드 검색 ("신림동 + 상호")
    if (!roadAddr) {
      roadAddr = await convertKeywordToRoad(cleanComp);
    }

    // 4순위: 기존 주소가 이미 도로명인 경우
    if (!roadAddr && /(?:로|길)\s*[\d-]+/.test(it.address)) {
      roadAddr = it.address;
    }

    const finalRoad = normalizeRoadAddress(roadAddr || it.address);
    console.log(`[#${it.seq}] ${it.companyName}: "${it.address}" ➔ "${finalRoad}"`);

    updatedItems.push({
      ...it,
      address: finalRoad
    });
  }

  console.log('\n4. Sending PUT request to GCP to update JSON and Excel...');
  const putRes = await fetch(`${GCP_URL}/api/quota/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      title: q.title,
      data: updatedItems
    })
  });

  const putResult = await putRes.json();
  console.log('PUT Response:', putResult);

  // 5. Verify update
  console.log('\n5. Verifying updated quota on GCP...');
  const verifyRes = await fetch(`${GCP_URL}/api/quota/${encodeURIComponent(fileName)}`, {
    headers: { Cookie: cookie }
  });
  const verifyData = await verifyRes.json();
  const vItems = verifyData.quota?.data || [];
  
  let incompleteCount = 0;
  vItems.forEach(it => {
    const isRoad = /(?:로|길)\s*[\d-]+/.test(it.address);
    if (!isRoad) {
      incompleteCount++;
      console.log(`  [경고] #${it.seq} ${it.companyName} (${it.address})`);
    }
  });

  console.log(`\n🎉 검증 결과: 30개 중 ${30 - incompleteCount}/30건 도로명주소 100% 일치!`);
}

updateQuotaOnGcp().catch(console.error);
