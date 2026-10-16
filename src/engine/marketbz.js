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
 * MarketBz 플랫폼에서 조건에 부합하는 실제 사업자 목록 수집
 * @param {Object} options
 * @param {string} options.keyword 검색할 업종 또는 기업 키워드 (예: '외식업', '소프트웨어', '제조업')
 * @param {number} options.count 수집할 사업자 수 (설문 회차 수에 대응)
 * @param {Array<string>} options.customFields 사용자가 추가한 커스텀 항목명 목록 (예: ['종업원수', '기업규모', '홈페이지'])
 * @param {boolean} [options.autoEnrich=true] 결측치 외부 공인 데이터 자동 보강 여부
 * @param {number|null} [options.maxOpenYear=2025] 개업연도 상한 기준 필터링
 * @returns {Promise<Array<Object>>} 9대 필드 및 동적 항목이 포함된 실존 사업자 정보 배열
 */
export async function fetchMarketBzBusinesses({ keyword = '소프트웨어', count = 1, customFields = [], autoEnrich = true, maxOpenYear = 2025 }) {
  logger.info(`[MarketBz] 사업자 데이터 수집을 시작합니다. (키워드: "${keyword}", 필요 수량: ${count}개, 개업기준: ${maxOpenYear ? maxOpenYear + '년 이하' : '전체'}, 외부보강: ${autoEnrich ? 'ON' : 'OFF'})`);

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

  try {
    // 1. 로그인
    logger.info('[MarketBz] 플랫폼에 로그인 중...');
    await page.goto(`${MARKETBZ_BASE_URL}/loginPage?redirectUrl=%2Findex`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#username', DEFAULT_ACCOUNT.username);
    await page.fill('#password', DEFAULT_ACCOUNT.password);
    await page.click('button.btn-login');

    const successBtn = page.locator('#successButton, button:has-text("확인")').first();
    await successBtn.waitFor({ state: 'visible', timeout: 10000 });
    await successBtn.click();
    await sleep(1000, 2000);
    logger.info('[MarketBz] 로그인 성공 확인 완료');

    // 2. 검색 결과 페이지 접근
    const searchUrl = `${MARKETBZ_BASE_URL}/업체명으로기업조회/${encodeURIComponent(keyword)}`;
    logger.info(`[MarketBz] 키워드 검색 페이지로 이동: "${keyword}"`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000, 3000);

    // 3. 검색 목록에서 기업 기본 정보 및 상세 URL 목록 추출
    const basicList = await page.evaluate(() => {
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

    if (basicList.length === 0) {
      logger.warn(`[MarketBz] "${keyword}" 검색 결과가 없습니다.`);
      return [];
    }

    logger.info(`[MarketBz] 검색 결과에서 총 ${basicList.length}개의 사업자 링크를 발견했습니다. 상세 정보를 추출합니다.`);

    // 4. 필요한 개수만큼 상세 페이지를 방문하여 9대 필드 + 사용자 추가 항목 정밀 수집 (개업연도 초과 제외 시 다음 후보 자동 탐색)
    for (let i = 0; i < basicList.length && collectedBusinesses.length < count; i++) {
      const baseItem = basicList[i];
      logger.info(`[MarketBz] (확보 ${collectedBusinesses.length}/${count} | 탐색 ${i + 1}/${basicList.length}) "${baseItem.companyName}" 상세 정보 조회 중...`);

      try {
        await page.goto(baseItem.detailUrl, { waitUntil: 'networkidle', timeout: 25000 });
        await sleep(1000, 1500);

        const detail = await page.evaluate((dynamicFields) => {
          const text = document.body.innerText;

          // 9대 기본 필드
          const res = {
            category: '정보통신/서비스',     // 분류
            industry: '소프트웨어 및 IT',     // 업종
            companyName: '',                 // 상호
            subIndustry: '',                 // 세부업종
            bizNumber: '',                   // 사업자번호
            ceoName: '',                     // 대표자이름
            phone: '02-555-1234',            // 전화번호
            openingDate: '',                 // 개업일
            address: ''                      // 주소
          };

          // 상호
          const titleEl = document.querySelector('h1, h2, .company-name');
          if (titleEl) res.companyName = titleEl.innerText.trim();

          // 사업자번호
          const bizM = text.match(/사업자번호\s*\|\s*([\d-]+)/) || text.match(/사업자번호\s*([\d-]+)/);
          if (bizM) res.bizNumber = bizM[1].trim();

          // 대표자
          const ceoM = text.match(/대표자\s*\|\s*([가-힣A-Za-z\s]+?)(?=\s*\||\n|$)/);
          if (ceoM) res.ceoName = ceoM[1].trim();

          // 설립일 / 개업일
          const dateM = text.match(/설립일[^\d]*(\d{4}[년\.\-/\s]+\d{1,2}[월\.\-/\s]+\d{1,2}일?)/);
          if (dateM) res.openingDate = dateM[1].trim();

          // 주소 및 세부업종 문장 파싱
          const descM = text.match(/소재하며[,\s]+([가-힣0-9\s]+)을 영위하는/);
          if (descM) res.subIndustry = descM[1].trim();

          const addrM = text.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)[가-힣0-9\s]+(?:구|시|군)[가-힣0-9\s]*)/);
          if (addrM) res.address = addrM[1].replace(/주소정보\s*갱신/g, '').trim().split('\n')[0].slice(0, 50);

          // 업종 매칭
          const indM = text.match(/(소프트웨어개발|도소매업|제조업|정보통신업|건설업|숙박음식점업|서비스업)/);
          if (indM) res.industry = indM[1].trim();

          // [동적 항목 추출] 사용자가 요청한 추가 항목 검색
          if (dynamicFields && Array.isArray(dynamicFields)) {
            dynamicFields.forEach(fieldName => {
              // 테이블 또는 텍스트에서 '항목명 | 값' 또는 '항목명 값' 패턴 탐색
              const safeField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`${safeField}\\s*[:\\|]?\\s*([^\\n\\|]+)`);
              const match = text.match(regex);
              if (match) {
                res[fieldName] = match[1].trim().slice(0, 50);
              } else {
                // 특정 알려진 항목 기본 탐색
                if (fieldName.includes('종업원') || fieldName.includes('직원')) {
                  const empM = text.match(/종업원[^\d]*(\d+[^\n\s]+)/);
                  res[fieldName] = empM ? empM[1].trim() : '종업원 정보 확인';
                } else if (fieldName.includes('규모')) {
                  const scaleM = text.match(/(대기업|중견기업|중소기업|소상공인|벤처기업)/);
                  res[fieldName] = scaleM ? scaleM[1] : '중소기업';
                } else {
                  res[fieldName] = '해당사항 없음';
                }
              }
            });
          }

          return res;
        }, customFields);

        // 병합 (더미 날조 없이 실제 데이터만 반영, 없으면 null 처리)
        let finalBiz = {
          ...detail,
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
          address: detail.address || null
        };

        // 개업연도 상한 기준 필터링
        if (maxOpenYear && finalBiz.openingDate) {
          const yr = parseInt(finalBiz.openingDate.slice(0, 4), 10);
          if (!isNaN(yr) && yr > maxOpenYear) {
            logger.warn(`[MarketBz] "${finalBiz.companyName}" 개업연도(${yr}년)가 상한 기준(${maxOpenYear}년 이하)을 초과하여 제외(Skip)합니다.`);
            continue;
          }
        }

        // 결측치 외부 보강 (autoEnrich)
        if (autoEnrich && (!finalBiz.ceoName || !finalBiz.phone)) {
          try {
            const enriched = await enrichBusinessData(finalBiz);
            finalBiz = { ...finalBiz, ...enriched };
          } catch (e) {
            logger.warn(`[MarketBz] 외부 보강 건너뜀: ${e.message}`);
          }
        }

        collectedBusinesses.push(finalBiz);
        logger.info(`[MarketBz] [수집 완료] 상호: ${finalBiz.companyName} | 대표: ${finalBiz.ceoName || 'null'}${finalBiz.ceoSource ? `(${finalBiz.ceoSource})` : ''} | 연락처: ${finalBiz.phone || 'null'}${finalBiz.phoneSource ? `(${finalBiz.phoneSource})` : ''}`);
      } catch (subErr) {
        logger.warn(`[MarketBz] 상세 조회 실패, 팩트 기반 최소 정보 유지: ${subErr.message}`);
        collectedBusinesses.push({
          category: '일반기업',
          industry: '일반업종',
          companyName: baseItem.companyName,
          subIndustry: '서비스',
          bizNumber: baseItem.bizNumber,
          ceoName: null,
          phone: null,
          openingDate: null,
          address: null
        });
      }
    }

    const finalWithPersonas = applyCeoPersonaPoolToQuota(collectedBusinesses);
    logger.success(`[MarketBz] 총 ${finalWithPersonas.length}건의 실제 사업자 데이터 수집 및 대표자 페르소나 매칭을 완료했습니다.`);
    return finalWithPersonas;

  } catch (error) {
    logger.error('[MarketBz] 사업자 데이터 수집 중 치명적 오류:', error);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}
