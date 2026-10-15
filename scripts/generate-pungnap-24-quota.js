import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { getOnnuriRegions, getOnnuriDistricts, getMarketMerchants } from '../src/engine/onnuri.js';
import { enrichBusinessData } from '../src/engine/enricher.js';
import { exportBusinessesToExcel } from '../src/utils/excel.js';
import { logger } from '../src/utils/logger.js';
import { sleep } from '../src/utils/delays.js';

if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env'); } catch (e) {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

const MARKETBZ_LOGIN_URL = 'https://marketbz.com/loginPage?redirectUrl=%2Findex';
const MARKETBZ_CREDENTIALS = {
  username: process.env.MARKETBZ_USER || 'hyuk112@naver.com',
  password: process.env.MARKETBZ_PASSWORD || 'mini112!'
};

function formatPhoneNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (cleaned.includes('-')) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;

  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return cleaned;
}

async function main() {
  console.log('=== [풍납시장 업종별 24개 맞춤 조사 쿼터 생성 시작] ===');

  const regions = await getOnnuriRegions();
  const seoul = regions.find(r => r.name === '서울');
  const districts = await getOnnuriDistricts(seoul.code);
  const songpa = districts.find(d => d.name.includes('송파'));

  const merchants = await getMarketMerchants({
    regionCode: seoul.code,
    districtCode: songpa.code,
    marketName: '풍납시장',
    statusFilter: 'ACTIVE',
    limit: 500
  });

  // 사업자등록번호 보유 및 정상가맹 필터링
  const seenBiz = new Set();
  const uniqueMerchants = [];
  for (const m of merchants) {
    if (m.bizNumber && !seenBiz.has(m.bizNumber)) {
      seenBiz.add(m.bizNumber);
      uniqueMerchants.push(m);
    }
  }

  const selectedList = [];
  const usedBiz = new Set();

  function pick(list, count, customIndustry, customSub) {
    const picked = [];
    for (const m of list) {
      if (!usedBiz.has(m.bizNumber)) {
        usedBiz.add(m.bizNumber);
        if (customIndustry) m.industry = customIndustry;
        if (customSub) m.subIndustry = customSub;
        picked.push(m);
        if (picked.length === count) break;
      }
    }
    return picked;
  }

  // 1. 농산물 (2개) - 야채/청과 우선
  const nongs = uniqueMerchants.filter(m => m.industry === '농산물' && !m.companyName.includes('고기'));
  selectedList.push(...pick(nongs, 2, '농산물', '과일/채소/농산물 소매'));

  // 2. 축산물 (2개) - 한우/정육/축산 우선
  const chuks = uniqueMerchants.filter(m => m.industry === '축산물');
  selectedList.push(...pick(chuks, 2, '축산물', '식육/정육/축산물 소매'));

  // 3. 수산물 (2개) - 칠칠수산, 물고기
  const sus = uniqueMerchants.filter(m => m.industry === '수산물');
  selectedList.push(...pick(sus, 2, '수산물', '생선/해산물/신선수산 소매'));

  // 4. 가공식품 (3개) - 방앗간/떡/기름/두부
  const gagos = uniqueMerchants.filter(m => m.industry === '가공식품');
  selectedList.push(...pick(gagos, 3, '가공식품', '방앗간/떡/두부/제조가공식품'));

  // 5. 의류신발 (2개) - 올스타, 오뜨레, 쎄미하우스
  const cloths = uniqueMerchants.filter(m => m.industry === '의류및신발');
  selectedList.push(...pick(cloths, 2, '의류신발', '의류/패션잡화/신발 소매'));

  // 6. 가정용품 (3개) - 기타소매 중 실질 생활용품 (침구, 철물, 생활프라자)
  const households = uniqueMerchants.filter(m => 
    m.industry === '기타소매업' && (
      m.companyName.includes('침구') || 
      m.companyName.includes('철물') || 
      m.companyName.includes('프라자') ||
      m.companyName.includes('디씨마트')
    )
  );
  selectedList.push(...pick(households, 3, '가정용품', '침구/철물/생활잡화 (가정용품)'));

  // 7. 음식점업 (4개) - 식당/분식/족발 등
  const foods = uniqueMerchants.filter(m => m.industry === '음식점업');
  selectedList.push(...pick(foods, 4, '음식점업', '한식/일반음식점/분식'));

  // 8. 기타소매 (3개) - 안경원, 약국, 잡화소매
  const retails = uniqueMerchants.filter(m => m.industry === '기타소매업' && !m.companyName.includes('축산') && !m.companyName.includes('한우'));
  selectedList.push(...pick(retails, 3, '기타소매', '안경/약국/생활소매업'));

  // 9. 근린상권 (3개) - 의원/한의원/헤어/생활서비스
  const neighs = uniqueMerchants.filter(m => m.industry === '근린상권서비스');
  selectedList.push(...pick(neighs, 3, '근린상권', '의원/헤어/근린생활서비스'));

  console.log(`선정된 가맹점 총 수: ${selectedList.length}건 (목표: 24건)`);

  if (selectedList.length !== 24) {
    throw new Error(`24개 선정 실패 (현재 ${selectedList.length}개)`);
  }

  // 2단계: 마켓비즈 상세 연동
  console.log('\n[2단계] 마켓비즈 플랫폼 로그인 및 1:1 상세 결합 진행...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const enrichedList = [];

  try {
    await page.goto(MARKETBZ_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#username', MARKETBZ_CREDENTIALS.username);
    await page.fill('#password', MARKETBZ_CREDENTIALS.password);
    await page.click('button.btn-login');
    await page.waitForTimeout(2000);

    const okBtn = page.locator('#successButton, button:has-text("확인")').first();
    try {
      await okBtn.waitFor({ state: 'visible', timeout: 5000 });
      await okBtn.click();
      await page.waitForTimeout(1000);
    } catch (_) {}
    console.log('[마켓비즈 로그인 성공] 24개 가맹점 1:1 상세 조회를 시작합니다.');

    for (let i = 0; i < selectedList.length; i++) {
      const merchant = selectedList[i];
      const seqStr = `(${i + 1}/24)`;
      console.log(`[${seqStr}] [${merchant.industry}] ${merchant.companyName} (${merchant.bizNumber}) 조회 중...`);

      let marketBzDetail = {};
      if (merchant.rawBizNumber && merchant.rawBizNumber.length === 10) {
        try {
          const detailUrl = `https://marketbz.com/companyDetail/${merchant.rawBizNumber}`;
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });
          await sleep(600, 1000);

          marketBzDetail = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const res = {
              mbzIndustry: null,
              mbzOpenDate: null,
              mbzCeoName: null,
              mbzAddress: null,
              mbzRoadAddress: null,
              mbzPhone: null
            };

            const coreIdx = bodyText.indexOf('기업 핵심정보');
            const coreText = coreIdx !== -1 ? bodyText.slice(coreIdx, coreIdx + 1200) : bodyText;

            const indM = coreText.match(/등록 산업분류\s*[:\n\|]?\s*([^\n\|]+)/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)개인사업자/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)법인사업자/);
            if (indM) {
              const val = indM[1].trim();
              if (val && !val.includes('메뉴') && !val.includes('로그아웃')) {
                res.mbzIndustry = val;
              }
            }

            const dateM = coreText.match(/설립일[^\d]*(\d{4}[\.\-\s/]\d{1,2}[\.\-\s/]\d{1,2})/);
            if (dateM) res.mbzOpenDate = dateM[1].trim();

            const ceoM = coreText.match(/대표자\s*[:\n\|]?\s*([가-힣A-Za-z]{2,10})(?=\s*\||\n|$)/);
            if (ceoM) {
              const val = ceoM[1].trim();
              if (!['연락처', '대표자', '서비스', '소재지', '사업자', '설립일', '등록'].includes(val)) {
                res.mbzCeoName = val;
              }
            }

            const ths = Array.from(document.querySelectorAll('th, td, dt, dd'));
            for (let el of ths) {
              const txt = el.innerText.trim();
              if (txt === '대표전화번호' || txt.startsWith('대표전화번호')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) res.mbzPhone = next.innerText.trim();
              }
              if (txt === '주소(도로명)' || txt.startsWith('주소(도로명)')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) res.mbzRoadAddress = next.innerText.trim();
              }
            }

            if (!res.mbzPhone) {
              const pMatch = bodyText.match(/대표전화번호\s*[\t\:\n]?\s*([\d-]{8,14})/);
              if (pMatch) res.mbzPhone = pMatch[1].trim();
            }

            const addrM = coreText.match(/소재지\s*[:\n\|]?\s*([^\n]+)/);
            if (addrM) {
              const val = addrM[1].trim();
              if (val && !val.includes('메뉴')) res.mbzAddress = val;
            }

            return res;
          });
        } catch (subErr) {
          console.warn(`  마켓비즈 조회 실패/미등록 건너뜀: ${subErr.message}`);
        }
      }

      let formattedOpenDate = marketBzDetail.mbzOpenDate || merchant.regDate || null;
      let handledItems = null;
      if (marketBzDetail.mbzIndustry && merchant.industry) {
        handledItems = `${merchant.industry} (${marketBzDetail.mbzIndustry})`;
      } else if (marketBzDetail.mbzIndustry) {
        handledItems = marketBzDetail.mbzIndustry;
      } else if (merchant.subIndustry) {
        handledItems = `${merchant.industry} (${merchant.subIndustry})`;
      } else {
        handledItems = merchant.industry;
      }

      const finalPhone = formatPhoneNumber(marketBzDetail.mbzPhone);
      const finalCeoName = marketBzDetail.mbzCeoName || null;
      const finalAddress = marketBzDetail.mbzRoadAddress || merchant.address || marketBzDetail.mbzAddress || null;

      const mergedItem = {
        seq: i + 1,
        source: 'ONNURI_MARKETBZ_HYBRID',
        marketName: '풍납시장',
        companyName: merchant.companyName,
        bizNumber: merchant.bizNumber,
        ceoName: finalCeoName,
        phone: finalPhone,
        openDate: formattedOpenDate,
        handledItems: handledItems,
        address: finalAddress,
        status: merchant.status || '정상가맹',
        paperAccepted: merchant.paperAccepted || 'Y',
        digitalAccepted: merchant.digitalAccepted || 'N'
      };

      // 3단계: 결측치 자동 보강
      if (!mergedItem.ceoName || !mergedItem.phone) {
        try {
          const enriched = await enrichBusinessData(mergedItem);
          mergedItem.ceoName = enriched.ceoName;
          mergedItem.phone = enriched.phone;
          mergedItem.ceoSource = enriched.ceoSource || null;
          mergedItem.phoneSource = enriched.phoneSource || null;
        } catch (enrichErr) {
          console.warn(`  결측치 보강 건너뜀: ${enrichErr.message}`);
        }
      }

      enrichedList.push(mergedItem);
      console.log(`  -> 완료: 대표자: ${mergedItem.ceoName || '미확인(null)'} | 연락처: ${mergedItem.phone || '미확인(null)'} | 개업: ${mergedItem.openDate || '-'}`);
    }

  } finally {
    await browser.close().catch(() => {});
  }

  // 4단계: 파일 저장 (JSON & Excel)
  const columns = [
    { key: 'marketName', label: '시장명' },
    { key: 'companyName', label: '상호(가맹점명)' },
    { key: 'bizNumber', label: '사업자등록번호' },
    { key: 'ceoName', label: '대표자명' },
    { key: 'phone', label: '연락처' },
    { key: 'openDate', label: '개업연월' },
    { key: 'handledItems', label: '취급품목(업종)' },
    { key: 'address', label: '주소' },
    { key: 'status', label: '가맹상태' },
    { key: 'paperAccepted', label: '온누리지류' },
    { key: 'digitalAccepted', label: '온누리디지털' }
  ];

  const timestamp = Date.now();
  const filenameBase = `quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_${timestamp}`;
  const jsonPath = path.join(quotasDir, `${filenameBase}.json`);
  const xlsxPath = path.join(quotasDir, `${filenameBase}.xlsx`);

  const quotaPayload = {
    title: '2026_풍납시장_업종별24개_조사쿼터',
    type: 'ONNURI_HYBRID',
    marketName: '풍납시장',
    createdAt: new Date().toISOString(),
    count: enrichedList.length,
    columns,
    data: enrichedList
  };

  fs.writeFileSync(jsonPath, JSON.stringify(quotaPayload, null, 2), 'utf-8');
  exportBusinessesToExcel({
    data: enrichedList,
    columns,
    filePath: xlsxPath
  });

  console.log('\n=== [생성 완료 리포트] ===');
  console.log(`JSON 저장: ${jsonPath}`);
  console.log(`Excel 저장: ${xlsxPath}`);
  console.log(`총 표본 수량: ${enrichedList.length}건`);
}

main().catch(err => {
  console.error('실행 에러:', err);
  process.exit(1);
});
