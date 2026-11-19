/**
 * 온누리상품권 전국 전통시장 & 상점가·골목형상점가 마스터 DB 구축 서비스
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const ONNURI_BASE_URL = 'https://ongift.or.kr';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Content-Type': 'application/x-www-form-urlencoded'
};

const MASTER_DB_PATH = path.join(rootDir, 'data', 'onnuri_master_db.json');

function formatBizNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

async function getRegions() {
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgv.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS
  });
  const data = await res.json();
  return data.list || [];
}

async function getDistricts(regionCode) {
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/fetchLclgvDtl.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: new URLSearchParams({ SEARCH_LCLGV_CD: regionCode }).toString()
  });
  const data = await res.json();
  return data.list || [];
}

async function fetchDistrictMerchants(regionCode, districtCode, keyword = '시장') {
  let allList = [];
  let pageIndex = 1;
  const pageSize = 2000;

  while (true) {
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
          pageIndex: String(pageIndex),
          recordCountPerPage: String(pageSize)
        }).toString()
      });
      const data = await res.json();
      const list = data.list || [];
      allList = allList.concat(list);
      if (list.length < pageSize || pageIndex >= 5) break;
      pageIndex++;
    } catch (err) {
      console.warn(`[Onnuri DB Builder] 구군 가맹점 조회 경고 (${regionCode}/${districtCode}/${keyword}):`, err.message);
      break;
    }
  }
  return allList;
}

export async function buildMasterDB(options = {}) {
  console.log('=== [Onnuri Master DB Builder] 전국 전통시장 & 상점가·골목형상점가 마스터 DB 구축 시작 ===');
  const startTime = Date.now();

  const regions = await getRegions();
  console.log(`전국 ${regions.length}개 시·도 로드 완료.`);

  const targetRegionArg = options.regionCode || process.argv.find(a => a.startsWith('--region='))?.split('=')[1];
  const targetDistrictArg = options.districtCode || process.argv.find(a => a.startsWith('--district='))?.split('=')[1];

  let masterDB = {
    updatedAt: new Date().toISOString(),
    version: '1.1.0',
    totalMarkets: 0,
    totalMerchants: 0,
    markets: {},
    regionDistrictMap: {}
  };

  if (fs.existsSync(MASTER_DB_PATH)) {
    try {
      masterDB = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
      console.log(`기존 마스터 DB 로드 완료: ${masterDB.totalMarkets}개 시장, ${masterDB.totalMerchants}개 가맹점`);
    } catch (err) {
      console.warn('[Onnuri DB Builder] 기존 마스터 DB 파싱 실패로 신규 초기화:', err.message);
    }
  }

  const seenBiz = new Set();
  for (const mkt of Object.values(masterDB.markets)) {
    if (Array.isArray(mkt.merchants)) {
      mkt.merchants.forEach(m => {
        if (m.rawBizNumber) seenBiz.add(m.rawBizNumber);
      });
    }
  }

  const SEARCH_KEYWORDS = ['시장', '상점', '상가', '골목', '로데오', '센터', '지하', '몰', '타운', '프라자', '벨포스트'];

  let targetRegions = regions;
  if (targetRegionArg) {
    targetRegions = regions.filter(r => r.LCLGV_CD === targetRegionArg);
    console.log(`[필터 적용] 대상 시/도: ${targetRegions.map(r => r.LCLGV_NM).join(', ')}`);
  }

  for (const reg of targetRegions) {
    const regCode = reg.LCLGV_CD;
    const regName = reg.LCLGV_NM;
    console.log(`\n▶ [${regName}] 시/군/구 스캔 시작...`);

    const districts = await getDistricts(regCode);
    masterDB.regionDistrictMap[regCode] = {
      name: regName,
      districts: districts.map(d => ({ code: d.SGG_CD, name: d.SGG_NM }))
    };

    let targetDistricts = districts;
    if (targetDistrictArg) {
      targetDistricts = districts.filter(d => d.SGG_CD === targetDistrictArg);
      console.log(`  [구/군 필터 적용] 대상 구/군: ${targetDistricts.map(d => d.SGG_NM).join(', ')}`);
    }

    for (const dist of targetDistricts) {
      const distCode = dist.SGG_CD;
      const distName = dist.SGG_NM;

      for (const kw of SEARCH_KEYWORDS) {
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

  let totalMerchants = 0;
  for (const mkt of Object.values(masterDB.markets)) {
    mkt.merchantCount = mkt.merchants.length;
    totalMerchants += mkt.merchantCount;
  }

  masterDB.totalMarkets = Object.keys(masterDB.markets).length;
  masterDB.totalMerchants = totalMerchants;
  masterDB.updatedAt = new Date().toISOString();

  writeJsonAtomicSync(MASTER_DB_PATH, masterDB, 0);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 [마스터 DB 구축 완료!] 소요시간: ${elapsed}초`);
  console.log(`총 수집된 시장 수: ${masterDB.totalMarkets}개`);
  console.log(`총 수집된 유효 가맹점 수: ${masterDB.totalMerchants}건`);
  console.log(`저장 경로: ${MASTER_DB_PATH}`);
}
