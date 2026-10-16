import fs from 'fs';
import path from 'path';

const ONNURI_BASE_URL = 'https://ongift.or.kr';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Content-Type': 'application/x-www-form-urlencoded'
};

const MASTER_DB_PATH = path.resolve('data/onnuri_master_db.json');

// 사업자등록번호 포맷팅 (000-00-00000)
function formatBizNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 1. 전국 시도 목록 조회
async function getRegions() {
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgv.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS
  });
  const data = await res.json();
  return data.list || [];
}

// 2. 특정 시도의 구군 목록 조회
async function getDistricts(regionCode) {
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgvDtl.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: new URLSearchParams({ SEARCH_LCLGV_CD: regionCode }).toString()
  });
  const data = await res.json();
  return data.list || [];
}

// 3. 특정 구군의 시장 데이터 수집
async function fetchDistrictMerchants(regionCode, districtCode, keyword = '시장') {
  try {
    const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: new URLSearchParams({
        SEARCH_LCLGV_CD: regionCode,
        SEARCH_SGG_CD: districtCode,
        SEARCH_MRKT_NM: keyword,
        SEARCH_TYPE: '1',
        SEARCH_WORD: '',
        pageIndex: '1',
        recordCountPerPage: '500'
      }).toString()
    });
    const data = await res.json();
    return data.list || [];
  } catch (e) {
    return [];
  }
}

export async function buildMasterDB() {
  console.log('=== [Onnuri Master DB Builder] 전국 전통시장 온누리 마스터 DB 구축 시작 ===');
  const startTime = Date.now();

  const regions = await getRegions();
  console.log(`전국 ${regions.length}개 시·도 로드 완료.`);

  // 기존 DB가 있으면 로드하여 병합 (누적 업데이트)
  let masterDB = {
    updatedAt: new Date().toISOString(),
    version: '1.0.0',
    totalMarkets: 0,
    totalMerchants: 0,
    markets: {},
    regionDistrictMap: {}
  };

  if (fs.existsSync(MASTER_DB_PATH)) {
    try {
      masterDB = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
      console.log(`기존 마스터 DB 로드 완료: ${masterDB.totalMarkets}개 시장, ${masterDB.totalMerchants}개 가맹점`);
    } catch (_) {}
  }

  const seenBiz = new Set();
  // 기존 DB의 가맹점 사업자번호 등록
  for (const mkt of Object.values(masterDB.markets)) {
    if (Array.isArray(mkt.merchants)) {
      mkt.merchants.forEach(m => {
        if (m.rawBizNumber) seenBiz.add(m.rawBizNumber);
      });
    }
  }

  // 전국 17개 시/도 전체 전통시장 전수 스캔
  const targetRegions = regions;

  for (const reg of targetRegions) {
    const regCode = reg.LCLGV_CD;
    const regName = reg.LCLGV_NM;
    console.log(`\n▶ [${regName}] 시/군/구 스캔 시작...`);

    const districts = await getDistricts(regCode);
    masterDB.regionDistrictMap[regCode] = {
      name: regName,
      districts: districts.map(d => ({ code: d.SGG_CD, name: d.SGG_NM }))
    };

    for (const dist of districts) {
      const distCode = dist.SGG_CD;
      const distName = dist.SGG_NM;

      // '시장', '상가' 2개 키워드로 해당 구 전수 스캔
      for (const kw of ['시장', '상가']) {
        const rawList = await fetchDistrictMerchants(regCode, distCode, kw);
        if (!rawList || rawList.length === 0) continue;

        for (const item of rawList) {
          if (item.AFFL_STTS_SE !== '정상가맹') continue;
          const rawBiz = (item.FRCS_ENBRNO || '').replace(/\D/g, '');
          if (rawBiz.length !== 10) continue;

          const mktName = (item.MRKT_NM || '').trim();
          if (!mktName) continue;

          if (!masterDB.markets[mktName]) {
            masterDB.markets[mktName] = {
              marketName: mktName,
              regionCode: regCode,
              regionName: regName,
              districtCode: distCode,
              districtName: distName,
              merchants: []
            };
          }

          if (!seenBiz.has(rawBiz)) {
            seenBiz.add(rawBiz);
            masterDB.markets[mktName].merchants.push({
              marketName: mktName,
              companyName: item.ACTL_FRCS_NM || '상호 미기재',
              bizNumber: formatBizNumber(rawBiz),
              rawBizNumber: rawBiz,
              merchantCode: item.FRCS_CD || '',
              industry: item.TPBIZ_NM || '전통시장소매',
              subIndustry: item.TPBIZ_NM || '도소매업',
              address: (item.ADDR || '').trim(),
              regDate: item.FRCS_REG_YMD || '',
              status: item.AFFL_STTS_SE || '정상가맹',
              paperAccepted: item.KNPP_HNDL_YN === 'Y' ? 'Y' : 'N',
              digitalAccepted: item.MOBL_HNDL_YN === 'Y' ? 'Y' : 'N'
            });
          }
        }
      }
      process.stdout.write(`.`);
    }
  }

  // 통계 계산
  let totalMerchants = 0;
  for (const mkt of Object.values(masterDB.markets)) {
    mkt.merchantCount = mkt.merchants.length;
    totalMerchants += mkt.merchantCount;
  }

  masterDB.totalMarkets = Object.keys(masterDB.markets).length;
  masterDB.totalMerchants = totalMerchants;
  masterDB.updatedAt = new Date().toISOString();

  // 파일 저장
  const dir = path.dirname(MASTER_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MASTER_DB_PATH, JSON.stringify(masterDB, null, 2), 'utf8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 [마스터 DB 구축 완료!] 소요시간: ${elapsed}초`);
  console.log(`총 수집된 시장 수: ${masterDB.totalMarkets}개`);
  console.log(`총 수집된 유효 가맹점 수: ${masterDB.totalMerchants}건`);
  console.log(`저장 경로: ${MASTER_DB_PATH}`);
}

// 직접 실행 시
if (process.argv[1]?.includes('build-onnuri-master-db.js')) {
  buildMasterDB().catch(console.error);
}
