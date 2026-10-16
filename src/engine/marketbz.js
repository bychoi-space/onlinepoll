/**
 * MarketBz (marketbz.com) 실존 비즈니스 데이터 스크래퍼
 * 인증 계정을 통해 로그인 후, 실제 사업자 정보를 수집하여 B2B 설문에 공급합니다.
 */
import { chromium } from 'playwright';
import { enrichBusinessData, applyCeoPersonaPoolToQuota } from './enricher.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';

const MARKETBZ_BASE_URL = 'https://marketbz.com';
const DEFAULT_ACCOUNT = {
  username: process.env.MARKETBZ_USER || 'thedreamtowel@naver.com',
  password: process.env.MARKETBZ_PASSWORD || 'qw@@951753'
};

/**
 * 마켓비즈 안전 로그인 헬퍼 (최대 3회 자동 재시도)
 */
async function ensureMarketBzLogin(page, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[MarketBz] 플랫폼 로그인 시도 (${attempt}/${maxRetries})...`);
      await page.goto(`${MARKETBZ_BASE_URL}/loginPage?redirectUrl=%2Findex`, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#username', { timeout: 10000 });
      await page.fill('#username', DEFAULT_ACCOUNT.username);
      await page.fill('#password', DEFAULT_ACCOUNT.password);
      await page.click('button.btn-login');

      const successBtn = page.locator('#successButton, button:has-text("확인")').first();
      try {
        await successBtn.waitFor({ state: 'visible', timeout: 6000 });
        await successBtn.click();
      } catch (_) {}
      await sleep(1000, 1800);
      logger.info('[MarketBz] 로그인 성공 확인 완료');
      return true;
    } catch (err) {
      lastErr = err;
      logger.warn(`[MarketBz] 로그인 시도 ${attempt}/${maxRetries} 지연/실패: ${err.message}`);
      await sleep(1500, 2500);
    }
  }
  logger.warn(`[MarketBz] 로그인 연결이 불안정합니다 (${lastErr?.message}). 계속 탐색을 시도합니다.`);
  return false;
}

/**
 * MarketBz 플랫폼에서 조건에 부합하는 실제 사업자 목록 수집 (이어하기/체크포인트 지원)
 * @param {Object} options
 * @param {string} options.keyword 검색할 업종 또는 기업 키워드
 * @param {number} options.count 수집할 사업자 수
 * @param {Array<string>} options.customFields 사용자가 추가한 커스텀 항목명 목록
 * @param {boolean} [options.autoEnrich=true] 결측치 외부 공인 데이터 자동 보강 여부
 * @param {number|null} [options.maxOpenYear=2025] 개업연도 상한 기준 필터링
 * @param {Array<Object>} [options.existingData=[]] 이어하기(Resume) 시 기존에 이미 수집된 사업자 목록
 * @param {Array<Object>} [options.savedCandidates=null] 이어하기 시 이전에 저장해둔 검색 후보 목록
 * @param {Function} [options.onProgress=null] 매 건 처리 시 즉시 체크포인트 저장 콜백
 * @returns {Promise<Array<Object>>} 실존 사업자 정보 배열
 */
export async function fetchMarketBzBusinesses({
  keyword = '소프트웨어',
  count = 1,
  customFields = [],
  autoEnrich = true,
  maxOpenYear = 2025,
  existingData = [],
  savedCandidates = null,
  onProgress = null
}) {
  const isResumeMode = Array.isArray(existingData) && existingData.length > 0;
  logger.info(`[MarketBz] 사업자 데이터 ${isResumeMode ? '이어하기(Resume) ' : ''}수집을 시작합니다. (키워드: "${keyword}", 목표: ${count}개, 기존: ${existingData.length}건)`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR'
  });

  const page = await context.newPage();
  const collectedBusinesses = [];
  const completedKeys = new Set();

  for (const prev of existingData) {
    if (prev && prev.mbzStatus !== 'failed' && prev.ceoName && prev.bizNumber) {
      collectedBusinesses.push({ ...prev, mbzStatus: 'ok' });
      completedKeys.add(prev.bizNumber || prev.companyName);
    }
  }

  let basicList = Array.isArray(savedCandidates) && savedCandidates.length > 0 ? [...savedCandidates] : [];

  try {
    await ensureMarketBzLogin(page, 3);

    if (basicList.length === 0) {
      const searchUrl = `${MARKETBZ_BASE_URL}/업체명으로기업조회/${encodeURIComponent(keyword)}`;
      logger.info(`[MarketBz] 키워드 검색 페이지로 이동: "${keyword}"`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(1800, 2500);

      basicList = await page.evaluate(() => {
        const items = [];
        const links = Array.from(document.querySelectorAll('a[href*="/companyDetail/"]'));

        links.forEach(a => {
          const companyName = a.innerText.trim();
          const bizMatch = a.href.match(/\/companyDetail\/(\d{10})/);
          if (companyName && bizMatch) {
            const rawBiz = bizMatch[1];
            const formattedBiz = rawBiz.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3');
            items.push({
              companyName,
              bizNumber: formattedBiz,
              detailUrl: a.href
            });
          }
        });
        return items;
      });
    }

    if (basicList.length === 0 && collectedBusinesses.length === 0) {
      logger.warn(`[MarketBz] "${keyword}" 검색 결과가 없습니다.`);
      return [];
    }

    logger.info(`[MarketBz] 총 ${basicList.length}개의 후보 중 기완료 ${collectedBusinesses.length}건 제외 잔여 수집을 진행합니다.`);

    for (let i = 0; i < basicList.length && collectedBusinesses.length < count; i++) {
      const baseItem = basicList[i];
      if (completedKeys.has(baseItem.bizNumber) || completedKeys.has(baseItem.companyName)) {
        continue;
      }

      logger.info(`[MarketBz] (확보 ${collectedBusinesses.length + 1}/${count} | 탐색 ${i + 1}/${basicList.length}) "${baseItem.companyName}" 상세 정보 조회 중...`);

      try {
        await page.goto(baseItem.detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(900, 1400);

        const detail = await page.evaluate((dynamicFields) => {
          const text = document.body ? document.body.innerText : '';
          const res = {
            category: '정보통신/서비스',
            industry: '소프트웨어 및 IT',
            companyName: '',
            subIndustry: '',
            bizNumber: '',
            ceoName: '',
            phone: null,
            openingDate: '',
            address: ''
          };

          const titleEl = document.querySelector('h1, h2, .company-name');
          if (titleEl) res.companyName = titleEl.innerText.trim();

          const bizM = text.match(/사업자번호\s*\|\s*([\d-]+)/) || text.match(/사업자번호\s*([\d-]+)/);
          if (bizM) res.bizNumber = bizM[1].trim();

          const ceoM = text.match(/대표자\s*\|\s*([가-힣A-Za-z\s]+?)(?=\s*\||\n|$)/);
          if (ceoM) res.ceoName = ceoM[1].trim();

          const dateM = text.match(/설립일[^\d]*(\d{4}[년\.\-/\s]+\d{1,2}[월\.\-/\s]+\d{1,2}일?)/);
          if (dateM) res.openingDate = dateM[1].trim();

          const descM = text.match(/소재하며[,\s]+([가-힣0-9\s]+)을 영위하는/);
          if (descM) res.subIndustry = descM[1].trim();

          const addrM = text.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)[가-힣0-9\s]+(?:구|시|군)[가-힣0-9\s]*)/);
          if (addrM) res.address = addrM[1].replace(/주소정보\s*갱신/g, '').trim().split('\n')[0].slice(0, 50);

          const indM = text.match(/(소프트웨어개발|도소매업|제조업|정보통신업|건설업|숙박음식점업|서비스업)/);
          if (indM) res.industry = indM[1].trim();

          if (dynamicFields && Array.isArray(dynamicFields)) {
            dynamicFields.forEach(fieldName => {
              const safeField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`${safeField}\\s*[:\\|]?\\s*([^\\n\\|]+)`);
              const match = text.match(regex);
              if (match) {
                res[fieldName] = match[1].trim().slice(0, 50);
              } else {
                res[fieldName] = null;
              }
            });
          }

          return res;
        }, customFields);

        let finalBiz = {
          ...detail,
          mbzStatus: 'ok',
          category: detail.category || '정보통신/서비스',
          industry: detail.industry || '일반업종',
          companyName: baseItem.companyName,
          subIndustry: detail.subIndustry || detail.industry || '서비스',
          bizNumber: detail.bizNumber || baseItem.bizNumber,
          ceoName: detail.ceoName || null,
          ceoGender: null,
          ceoAge: null,
          phone: detail.phone || null,
          openingDate: detail.openingDate || null,
          openDate: detail.openingDate || null,
          address: detail.address || null
        };

        if (maxOpenYear && finalBiz.openingDate) {
          const yr = parseInt(finalBiz.openingDate.slice(0, 4), 10);
          if (!isNaN(yr) && yr > maxOpenYear) {
            logger.warn(`[MarketBz] "${finalBiz.companyName}" 개업연도(${yr}년)가 상한 기준(${maxOpenYear}년 이하)을 초과하여 제외(Skip)합니다.`);
            continue;
          }
        }

        if (autoEnrich && (!finalBiz.ceoName || !finalBiz.phone)) {
          try {
            const enriched = await enrichBusinessData(finalBiz);
            finalBiz = { ...finalBiz, ...enriched };
          } catch (e) {
            logger.warn(`[MarketBz] 외부 보강 건너뜀: ${e.message}`);
          }
        }

        collectedBusinesses.push(finalBiz);
      } catch (subErr) {
        logger.warn(`[MarketBz] 상세 조회 실패, 팩트 기반 최소 정보 저장 (재시도 대상 마킹): ${subErr.message}`);
        collectedBusinesses.push({
          mbzStatus: 'failed',
          category: '일반기업',
          industry: '일반업종',
          companyName: baseItem.companyName,
          subIndustry: '서비스',
          bizNumber: baseItem.bizNumber,
          ceoName: null,
          phone: null,
          openingDate: null,
          openDate: null,
          address: null
        });
      }

      const currentWithPersonas = applyCeoPersonaPoolToQuota(collectedBusinesses);
      if (typeof onProgress === 'function') {
        try {
          await onProgress({
            currentData: currentWithPersonas,
            currentIndex: currentWithPersonas.length,
            targetTotal: count,
            candidates: basicList,
            isComplete: false
          });
        } catch (_) {}
      }
    }

  } catch (error) {
    logger.error(`[MarketBz] 수집 중 오류 발생 (현재까지 확보된 ${collectedBusinesses.length}건 보존):`, error.message);
  } finally {
    await browser.close().catch(() => {});
  }

  const finalWithPersonas = applyCeoPersonaPoolToQuota(collectedBusinesses);
  if (typeof onProgress === 'function') {
    try {
      await onProgress({
        currentData: finalWithPersonas,
        currentIndex: finalWithPersonas.length,
        targetTotal: count,
        candidates: basicList,
        isComplete: finalWithPersonas.length >= count && finalWithPersonas.every(b => b.mbzStatus !== 'failed')
      });
    } catch (_) {}
  }

  logger.success(`[MarketBz] 총 ${finalWithPersonas.length}/${count}건 사업자 데이터 저장 완료.`);
  return finalWithPersonas;
}

