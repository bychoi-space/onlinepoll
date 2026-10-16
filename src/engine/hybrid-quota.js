/**
 * AutoSurvey AI - 온누리 가맹점 + 마켓비즈 2단계 하이브리드 쿼터 엔진 (hybrid-quota.js)
 * 1차: 온누리상품권 공인 플랫폼(ongift.or.kr)에서 전통시장 가맹점 팩트 데이터 추출
 * 2차: 마켓비즈(marketbz.com)에서 사업자번호 기반 상세 기업정보 1:1 결합(Enrichment)
 */

import { chromium } from 'playwright';
import { getMarketMerchants, getStratifiedMarketMerchants } from './onnuri.js';
import { enrichBusinessData, fillMissingCeoPersona } from './enricher.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/delays.js';

const MARKETBZ_LOGIN_URL = 'https://marketbz.com/loginPage?redirectUrl=%2Findex';
const MARKETBZ_CREDENTIALS = {
  username: process.env.MARKETBZ_USER || 'thedreamtowel@naver.com',
  password: process.env.MARKETBZ_PASSWORD || 'qw@@951753'
};

/**
 * 전화번호 포맷팅 (02-xxx-xxxx, 02-xxxx-xxxx, 010-xxxx-xxxx 등)
 */
function formatPhoneNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  let digits = cleaned.replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;

  // 마켓비즈 더미 번호(000-0000, 111-1111, 123-4567 등) 필터링 -> null 반환하여 외부 보강 유도
  const tail = digits.slice(-7);
  if (/^(\d)\1{6}$/.test(tail) || digits.endsWith('0000000') || digits.endsWith('1111111') || digits.endsWith('1234567')) {
    return null;
  }

  // 02-0414-6823 처럼 서울 지역번호 뒤 불필요한 0이 붙은 10자리 교정
  if (digits.startsWith('020') && digits.length === 10) {
    digits = '02' + digits.slice(3);
  }

  // 02 서울 지역번호
  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    } else if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
  }

  if (cleaned.includes('-')) return cleaned;

  // 010, 031, 032, 051 등
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return cleaned;
}

/**
 * [취급품목] 및 [주요품목] 분리 정제 함수
 * - [취급품목] (handledItems): 농산물, 축산물, 수산물, 의류및신발, 가공식품, 가정용품, 음식점업, 기타소매업, 근린상권서비스
 * - [주요품목] (mainProducts): 괄호 안 부연설명이 있으면 핵심 한 단어로 추출하고,
 *   괄호가 없거나 포괄적이면 상호(companyName) 및 업종을 바탕으로 핵심 한 단어를 유추하여 생성
 */
export function splitHandledAndMainProducts({
  merchantIndustry = '',
  mbzIndustry = '',
  rawHandledItems = '',
  rawMainProducts = '',
  companyName = ''
}) {
  let baseCat = '';
  let subRaw = '';

  if (rawHandledItems && String(rawHandledItems).trim()) {
    const str = String(rawHandledItems).trim();
    const m = str.match(/^([^\(]+?)\s*\((.+)\)$/);
    if (m) {
      baseCat = m[1].trim();
      subRaw = m[2].trim();
    } else {
      baseCat = str;
    }
  } else {
    baseCat = String(merchantIndustry || '').trim();
    const m = baseCat.match(/^([^\(]+?)\s*\((.+)\)$/);
    if (m) {
      baseCat = m[1].trim();
      subRaw = m[2].trim();
    }
  }

  if (!subRaw && mbzIndustry && String(mbzIndustry).trim()) {
    subRaw = String(mbzIndustry).trim();
  }

  // 1) [취급품목] 표준 카테고리명 정규화
  let handledItems = '기타소매업';
  if (baseCat.includes('농산물')) handledItems = '농산물';
  else if (baseCat.includes('축산물')) handledItems = '축산물';
  else if (baseCat.includes('수산물')) handledItems = '수산물';
  else if (baseCat.includes('의류') || baseCat.includes('신발')) handledItems = '의류및신발';
  else if (baseCat.includes('가공식품')) handledItems = '가공식품';
  else if (baseCat.includes('가정용품')) handledItems = '가정용품';
  else if (baseCat.includes('음식점')) handledItems = '음식점업';
  else if (baseCat.includes('기타소매')) handledItems = '기타소매업';
  else if (baseCat.includes('근린상권')) handledItems = '근린상권서비스';
  else if (baseCat) handledItems = baseCat;

  // 이미 유효한 단일어 주요품목이 있고 괄호 부연설명이 따로 없는 경우 보존
  if (!subRaw && rawMainProducts && String(rawMainProducts).trim() && rawMainProducts !== 'null') {
    return {
      handledItems,
      mainProducts: String(rawMainProducts).trim().split(/\s+/)[0]
    };
  }

  const comp = String(companyName || '').trim();

  // 상호 + 업종 기반 단일어 주요품목 유추 헬퍼
  function inferMainProductFromStore() {
    if (comp.includes('과일') || comp.includes('청과')) return '과일';
    if (comp.includes('더덕') || comp.includes('인삼') || comp.includes('약초')) return '더덕';
    if (comp.includes('야채') || comp.includes('채소')) return '채소';
    if (comp.includes('농산') || comp.includes('쌀') || comp.includes('곡물')) return '곡물';
    if (comp.includes('한우')) return '한우';
    if (comp.includes('정육') || comp.includes('식육') || comp.includes('갈비')) return '정육';
    if (comp.includes('닭') || comp.includes('계육')) return '계육';
    if (comp.includes('수산') || comp.includes('횟집') || comp.includes('활어')) return '활어';
    if (comp.includes('물고기') || comp.includes('생선')) return '생선';
    if (comp.includes('건어물') || comp.includes('굴비') || comp.includes('멸치')) return '건어물';
    if (comp.includes('신발') || comp.includes('구두') || comp.includes('올스타')) return '신발';
    if (comp.includes('속옷') || comp.includes('란제리') || comp.includes('옥산')) return '속옷';
    if (comp.includes('한복') || comp.includes('주단')) return '한복';
    if (comp.includes('패션') || comp.includes('의류') || comp.includes('오뜨레') || comp.includes('옷')) return '의류';
    if (comp.includes('떡')) return '떡류';
    if (comp.includes('선식') || comp.includes('생식')) return '신선식품';
    if (comp.includes('기름') || comp.includes('참기름')) return '유지류';
    if (comp.includes('뻥튀기') || comp.includes('과자') || comp.includes('제과')) return '과자류';
    if (comp.includes('반찬') || comp.includes('김치')) return '반찬류';
    if (comp.includes('커피') || comp.includes('카페') || comp.includes('마주보며')) return '커피';
    if (comp.includes('침구') || comp.includes('이불') || comp.includes('커튼')) return '침구류';
    if (comp.includes('철물') || comp.includes('공구')) return '철물';
    if (comp.includes('꽃') || comp.includes('꽃샘') || comp.includes('화원')) return '직물제품';
    if (comp.includes('마트') || comp.includes('슈퍼')) return '슈퍼마켓';
    if (comp.includes('김밥') || comp.includes('분식') || comp.includes('호떡')) return '김밥';
    if (comp.includes('치킨') || comp.includes('맥시칸') || comp.includes('통닭')) return '치킨';
    if (comp.includes('피자')) return '피자';
    if (comp.includes('보성각') || comp.includes('반점') || comp.includes('중식')) return '중식';
    if (comp.includes('룽고') || comp.includes('파스타') || comp.includes('양식')) return '서양식';
    if (comp.includes('쭈꾸미') || comp.includes('식당') || comp.includes('한식')) return '한식';
    if (comp.includes('약국')) return '의약품';
    if (comp.includes('영어') || comp.includes('수학') || comp.includes('교습')) return '교습학원';
    if (comp.includes('음악') || comp.includes('미술') || comp.includes('학원')) return '교과학원';
    if (comp.includes('태권도') || comp.includes('합기도') || comp.includes('체육')) return '태권도';
    if (comp.includes('한의원') || comp.includes('의원')) return '한의원';
    if (comp.includes('이발') || comp.includes('발소') || comp.includes('이용')) return '이용업';
    if (comp.includes('네일')) return '네일미용';
    if (comp.includes('헤어') || comp.includes('미용') || comp.includes('예작')) return '미용업';
    if (comp.includes('건강')) return '피부미용';

    // 업종별 기본 핵심 단일어 폴백
    if (handledItems === '농산물') return '채소';
    if (handledItems === '축산물') return '육류';
    if (handledItems === '수산물') return '해산물';
    if (handledItems === '의류및신발') return '의류';
    if (handledItems === '가공식품') return '신선식품';
    if (handledItems === '가정용품') return '생활잡화';
    if (handledItems === '음식점업') return '한식';
    if (handledItems === '기타소매업') return '생활잡화';
    if (handledItems === '근린상권서비스') return '미용업';
    return '잡화';
  }

  // 농산물, 축산물, 수산물은 괄호 유무와 무관하게 상호/품목 맥락으로 명확한 한 단어 추출
  if (['농산물', '축산물', '수산물', '의류및신발'].includes(handledItems)) {
    if (subRaw && (subRaw.includes('속옷') || subRaw.includes('잠옷'))) return { handledItems, mainProducts: '속옷' };
    if (subRaw && subRaw.includes('곡물')) return { handledItems, mainProducts: '곡물' };
    return { handledItems, mainProducts: inferMainProductFromStore() };
  }

  if (!subRaw) {
    return { handledItems, mainProducts: inferMainProductFromStore() };
  }

  // 2) 괄호 안 부연설명(subRaw)에서 핵심 한 단어 추출
  let cleanedSub = subRaw
    .replace(/\s*외\s*\d+\s*개/g, '')
    .replace(/\/.*$/, '')
    .trim();

  if (
    cleanedSub.includes('분류 안된') ||
    cleanedSub.includes('종합 소매업') ||
    cleanedSub.includes('음ㆍ식료품') ||
    (handledItems === '가정용품' && cleanedSub.includes('겉옷'))
  ) {
    return { handledItems, mainProducts: inferMainProductFromStore() };
  }
  if (cleanedSub.includes('유지 및 낙농제품')) {
    return { handledItems, mainProducts: '유지류' };
  }

  cleanedSub = cleanedSub
    .replace(/두발\s*미용업/g, '미용업')
    .replace(/피부\s*미용업/g, '피부미용')
    .replace(/^(그 외 기타|기타|일반|가정용|조리|단순|동ㆍ식물성|남자용|여자용)\s+/g, '')
    .replace(/\s+(전문점|음식점업|음식점|소매업|도매업|제조업|서비스업|교육기관|기관|소매|도매)$/g, '')
    .trim();

  const firstToken = cleanedSub
    .split(/\s+및\s+|[,ㆍ·\/]|\s+/)[0]
    .replace(/(전문점|음식점업|소매업|도매업|제조업|서비스업)$/g, '')
    .trim();

  const finalWord = firstToken || cleanedSub.split(/\s+/)[0] || inferMainProductFromStore();
  return { handledItems, mainProducts: finalWord };
}

export function formatStandardHandledItems(opts) {
  return splitHandledAndMainProducts(opts).handledItems;
}

/**
 * 온누리 + 마켓비즈 2단계 하이브리드 쿼터 생성 함수
 * @param {Object} options
 * @param {string} options.regionCode - 온누리 시도 코드 (예: '01')
 * @param {string} options.districtCode - 온누리 시군구 코드 (예: '01018')
 * @param {string} options.marketName - 대상 시장명 (예: '풍납시장')
 * @param {string} [options.statusFilter='ACTIVE'] - 가맹 상태 필터 ('ACTIVE'|'ALL')
 * @param {string} [options.paymentFilter='ALL'] - 온누리 취급 유형 ('ALL'|'PAPER'|'DIGITAL')
 * @param {number} [options.targetCount=10] - 수집 목표 수량 (단순 모드용)
 * @param {string} [options.samplingMode='simple'] - 'simple'(단순 순차) | 'stratified'(업종별 층화 할당)
 * @param {Object} [options.industryQuotas={}] - 업종별 목표 수량 { '농산물': 2, '축산물': 2, ... }
 * @param {boolean} [options.enableSmartFallback=true] - 결손 업종(가정용품 등) 스마트 매핑 허용 여부
 * @param {Array<string>} [options.customFields=[]] - 추가 결합할 커스텀 항목 목록
 * @param {boolean} [options.autoEnrich=true] - 결측치(대표자/연락처) 외부 공인 데이터 자동 보강 여부
 * @returns {Promise<Array<Object>>} 실존 데이터로 결합된 쿼터 목록
 */
export async function buildHybridOnnuriQuota({
  regionCode,
  districtCode,
  marketName,
  statusFilter = 'ACTIVE',
  paymentFilter = 'ALL',
  targetCount = 10,
  samplingMode = 'simple',
  industryQuotas = {},
  enableSmartFallback = true,
  customFields = [],
  autoEnrich = true,
  maxOpenYear = 2025
}) {
  logger.info(`[Hybrid Quota] === 온누리 연계 조사 쿼터 수집 시작 ===`);
  logger.info(`[Hybrid Quota] 대상: "${marketName}" | 모드: ${samplingMode} | 개업연도 상한: ${maxOpenYear ? maxOpenYear + '년 이하' : '전체'} | 커스텀 필드: ${customFields.join(', ') || '없음'} | 외부 보강: ${autoEnrich ? 'ON' : 'OFF'}`);

  let onnuriList = [];
  let reserveByCategory = {};
  let generalReserve = [];

  // 1단계: 온누리 플랫폼에서 대상 가맹점 1차 팩트 수집 (개업연도 상한 사전 필터링 + 예비 후보 풀 확보)
  if (samplingMode === 'stratified' && Object.keys(industryQuotas).length > 0) {
    logger.info(`[Step 1/2] [업종별 층화 할당] 온누리 플랫폼에서 업종별 맞춤 가맹점을 수집합니다: ${JSON.stringify(industryQuotas)}`);
    const result = await getStratifiedMarketMerchants({
      regionCode,
      districtCode,
      marketName,
      industryQuotas,
      enableSmartFallback,
      maxOpenYear,
      includeReservePool: true
    });
    onnuriList = Array.isArray(result) ? result : (result.primary || []);
    reserveByCategory = (!Array.isArray(result) && result.reserveByCategory) ? result.reserveByCategory : {};
    generalReserve = (!Array.isArray(result) && result.generalReserve) ? result.generalReserve : [];
  } else {
    logger.info(`[Step 1/2] [단순 총량 수집] 온누리 플랫폼에서 "${marketName}" 가맹점 목록을 상위 ${targetCount}건 조회합니다...`);
    const result = await getMarketMerchants({
      regionCode,
      districtCode,
      marketName,
      statusFilter,
      paymentFilter,
      limit: targetCount,
      maxOpenYear,
      includeReservePool: true
    });
    onnuriList = Array.isArray(result) ? result : (result.primary || []);
    generalReserve = (!Array.isArray(result) && result.generalReserve) ? result.generalReserve : [];
  }

  if (onnuriList.length === 0) {
    logger.warn(`[Hybrid Quota] "${marketName}" 조건에 부합하는 온누리 가맹점을 찾지 못했습니다.`);
    return [];
  }

  const usedBizSet = new Set(onnuriList.map(m => m.bizNumber).filter(Boolean));

  function pullReplacementMerchant(targetCat) {
    if (targetCat && Array.isArray(reserveByCategory[targetCat])) {
      while (reserveByCategory[targetCat].length > 0) {
        const cand = reserveByCategory[targetCat].shift();
        if (cand && cand.bizNumber && !usedBizSet.has(cand.bizNumber)) {
          usedBizSet.add(cand.bizNumber);
          return cand;
        }
      }
    }
    while (generalReserve.length > 0) {
      const cand = generalReserve.shift();
      if (cand && cand.bizNumber && !usedBizSet.has(cand.bizNumber)) {
        usedBizSet.add(cand.bizNumber);
        if (targetCat) cand.targetCategory = targetCat;
        return cand;
      }
    }
    return null;
  }

  logger.success(`[Step 1/2 완료] 온누리 가맹점 ${onnuriList.length}건 1차 확보 완료 (예비 후보 ${generalReserve.length}건 대기). 마켓비즈 2차 정보 결합을 시작합니다.`);

  // 2단계: 마켓비즈 플랫폼 로그인 및 1:1 결합(Enrichment)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const finalQuotaList = [];
  const ceoPoolUsedState = { usedSeqs: new Set(), usedNames: new Set() };

  try {
    logger.info(`[Step 2/2] 마켓비즈 플랫폼 인증 진행 중 (${MARKETBZ_CREDENTIALS.username})...`);
    await page.goto(MARKETBZ_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#username', MARKETBZ_CREDENTIALS.username);
    await page.fill('#password', MARKETBZ_CREDENTIALS.password);
    await page.click('button.btn-login');
    await page.waitForTimeout(1500);

    const okBtn = page.locator('#successButton, button:has-text("확인")').first();
    try {
      await okBtn.waitFor({ state: 'visible', timeout: 5000 });
      await okBtn.click();
      await page.waitForTimeout(1000);
    } catch (_) {}
    logger.success(`[Step 2/2] 마켓비즈 인증 완료. 가맹점별 1:1 상세 크로스체크를 진행합니다.`);

    for (let i = 0; i < onnuriList.length; i++) {
      const merchant = onnuriList[i];
      const seqStr = `(${finalQuotaList.length + 1}번째 목표 / 진행 ${i + 1}/${onnuriList.length})`;
      logger.info(`[Hybrid Quota] ${seqStr} "${merchant.companyName}" (사업자: ${merchant.bizNumber || '미기재'}) 마켓비즈 상세 연동 중...`);

      let marketBzDetail = {};

      if (merchant.rawBizNumber && merchant.rawBizNumber.length === 10) {
        try {
          const detailUrl = `https://marketbz.com/companyDetail/${merchant.rawBizNumber}`;
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
          await sleep(800, 1500);

          marketBzDetail = await page.evaluate((dynamicFields) => {
            const bodyText = document.body.innerText;
            const res = {
              mbzIndustry: null,
              mbzOpenDate: null,
              mbzCeoName: null,
              mbzAddress: null,
              mbzRoadAddress: null,
              mbzPhone: null
            };

            // 1. '기업 핵심정보' 블록에서 기본 속성 추출
            const coreIdx = bodyText.indexOf('기업 핵심정보');
            const coreText = coreIdx !== -1 ? bodyText.slice(coreIdx, coreIdx + 1200) : bodyText;

            // 등록 산업분류 (취급품목)
            const indM = coreText.match(/등록 산업분류\s*[:\n\|]?\s*([^\n\|]+)/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)개인사업자/) ||
                         coreText.match(/영위하는\s*([^\n,]+?)법인사업자/);
            if (indM) {
              const val = indM[1].trim();
              if (val && !val.includes('메뉴') && !val.includes('로그아웃')) {
                res.mbzIndustry = val;
              }
            }

            // 설립일 (개업연월)
            const dateM = coreText.match(/설립일[^\d]*(\d{4}[\.\-\s/]\d{1,2}[\.\-\s/]\d{1,2})/);
            if (dateM) {
              res.mbzOpenDate = dateM[1].trim();
            }

            // 대표자 (핵심정보 영역 내에서 탐색, 마스킹(***) 또는 메뉴 오염 배제)
            const ceoM = coreText.match(/대표자\s*[:\n\|]?\s*([가-힣A-Za-z]{2,10})(?=\s*\||\n|$)/);
            if (ceoM) {
              const val = ceoM[1].trim();
              if (!['연락처', '대표자', '서비스', '소재지', '사업자', '설립일', '등록', '기업', '기본', '핵심'].includes(val)) {
                res.mbzCeoName = val;
              }
            }

            // 2. [사용자 지정 핵심 위치] '연락처·주소·사업장 정보' 테이블 내 대표전화번호 및 주소(도로명) 추출
            const ths = Array.from(document.querySelectorAll('th, td, dt, dd'));
            for (let el of ths) {
              const txt = el.innerText.trim();
              // 대표전화번호
              if (txt === '대표전화번호' || txt.startsWith('대표전화번호')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) {
                  res.mbzPhone = next.innerText.trim();
                }
              }
              // 주소(도로명)
              if (txt === '주소(도로명)' || txt.startsWith('주소(도로명)')) {
                const next = el.nextElementSibling;
                if (next && next.innerText.trim()) {
                  const spanEl = next.querySelector('span.pdt5');
                  let addrText = spanEl ? spanEl.innerText : next.innerText;
                  addrText = addrText.replace(/주소정보\s*갱신/g, '').replace(/\s+/g, ' ').trim();
                  if (addrText) {
                    res.mbzRoadAddress = addrText;
                  }
                }
              }
            }

            // 만약 DOM에서 놓쳤을 경우 정규식 백업 탐색
            if (!res.mbzPhone) {
              const pMatch = bodyText.match(/대표전화번호\s*[\t\:\n]?\s*([\d-]{8,14})/);
              if (pMatch) res.mbzPhone = pMatch[1].trim();
            }

            // 소재지 (기본 주소)
            const addrM = coreText.match(/소재지\s*[:\n\|]?\s*([^\n]+)/);
            if (addrM) {
              const val = addrM[1].trim();
              if (val && !val.includes('메뉴')) res.mbzAddress = val;
            }

            // 3. 동적 커스텀 필드 탐색 (없으면 null 처리)
            if (dynamicFields && Array.isArray(dynamicFields)) {
              dynamicFields.forEach(fieldName => {
                const safeField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`${safeField}\\s*[:\\|]?\\s*([^\\n\\|]+)`);
                const match = bodyText.match(regex);
                if (match) {
                  res[fieldName] = match[1].trim().slice(0, 50);
                } else {
                  res[fieldName] = null;
                }
              });
            }

            return res;
          }, customFields);

        } catch (subErr) {
          logger.warn(`[Hybrid Quota] 마켓비즈 상세 조회 실패/미등록 (${subErr.message}) - 온누리 공인 데이터 유지`);
        }
      }

      // 개업연월 정제 (마켓비즈 설립일 우선 -> 온누리 가맹등록일 -> 없으면 null)
      let formattedOpenDate = null;
      if (marketBzDetail.mbzOpenDate) {
        formattedOpenDate = marketBzDetail.mbzOpenDate;
      } else if (merchant.regDate) {
        formattedOpenDate = merchant.regDate;
      }

      // [고도화] 개업연도 상한 기준 필터링 및 예비 후보 자동 대체 충원
      if (maxOpenYear && formattedOpenDate) {
        const yr = parseInt(formattedOpenDate.slice(0, 4), 10);
        if (!isNaN(yr) && yr > maxOpenYear) {
          const replacement = pullReplacementMerchant(merchant.targetCategory);
          if (replacement) {
            onnuriList.push(replacement);
            logger.warn(`[Hybrid Quota] "${merchant.companyName}" 개업연도(${yr}년)가 상한(${maxOpenYear}년 이하) 초과로 제외 ➔ 예비 후보 "${replacement.companyName}" 자동 충원`);
          } else {
            logger.warn(`[Hybrid Quota] "${merchant.companyName}" 개업연도(${yr}년)가 상한(${maxOpenYear}년 이하) 초과로 제외 (추가 예비 후보 없음)`);
          }
          continue;
        }
      }

      // 취급품목 및 주요품목 분리 정제 (취급품목: 표준 카테고리, 주요품목: 괄호 내 핵심 한 단어 또는 상호/업종 유추)
      const { handledItems, mainProducts } = splitHandledAndMainProducts({
        merchantIndustry: merchant.targetCategory || merchant.industry || '',
        mbzIndustry: marketBzDetail.mbzIndustry || '',
        companyName: merchant.companyName
      });

      // 연락처 정제 (대표전화번호 포맷팅, 없으면 null)
      const finalPhone = formatPhoneNumber(marketBzDetail.mbzPhone);

      // 대표자명 정제 (실제 데이터 없으면 null)
      const finalCeoName = marketBzDetail.mbzCeoName || null;

      // 주소 (마켓비즈 도로명주소 우선 -> 온누리 주소 -> 마켓비즈 소재지 -> 없으면 null)
      const finalAddress = marketBzDetail.mbzRoadAddress || merchant.address || marketBzDetail.mbzAddress || null;

      // 온누리 팩트 + 마켓비즈 팩트 1:1 병합
      const mergedItem = {
        seq: finalQuotaList.length + 1,
        source: 'ONNURI_MARKETBZ_HYBRID',
        marketName: merchant.marketName || '풍납시장',
        companyName: merchant.companyName,
        industry: merchant.targetCategory || merchant.industry || null, // 업종 분류
        bizNumber: merchant.bizNumber || null,
        ceoName: finalCeoName,                       // 대표자이름 (없으면 null)
        ceoGender: null,                             // 대표자 성별 (사용자 입력용)
        ceoAge: null,                                // 대표자 나이 (사용자 입력용)
        phone: finalPhone,                           // 연락처 (대표전화번호, 없으면 null)
        openDate: formattedOpenDate,                 // 개업연월 (없으면 null)
        address: finalAddress,                       // 사업장 주소 (도로명 우선, 없으면 null)
        handledItems: handledItems,                  // 취급품목 (예: 농산물, 가공식품, 음식점업)
        mainProducts: mainProducts,                  // 주요품목 (예: 과일, 커피, 떡류, 김밥, 치킨)
        status: merchant.status || '정상가맹',       // 가맹상태
        paperAccepted: merchant.paperAccepted,       // 온누리지류
        digitalAccepted: merchant.digitalAccepted,   // 온누리디지털
        ...marketBzDetail
      };

      // 불필요한 내부 임시 키 정리
      delete mergedItem.mbzCeoName;
      delete mergedItem.mbzIndustry;
      delete mergedItem.mbzOpenDate;
      delete mergedItem.mbzAddress;
      delete mergedItem.mbzRoadAddress;
      delete mergedItem.mbzPhone;

      // 3단계: 결측치(대표자 또는 연락처) 외부 공인 데이터 자동 보강 (autoEnrich)
      if (autoEnrich && (!mergedItem.ceoName || !mergedItem.phone)) {
        try {
          const enriched = await enrichBusinessData(mergedItem, ceoPoolUsedState);
          mergedItem.ceoName = enriched.ceoName;
          mergedItem.ceoGender = enriched.ceoGender || mergedItem.ceoGender;
          mergedItem.ceoAge = enriched.ceoAge || mergedItem.ceoAge;
          mergedItem.phone = enriched.phone;
          mergedItem.ceoSource = enriched.ceoSource || null;
          mergedItem.phoneSource = enriched.phoneSource || null;
          mergedItem.isEnriched = Boolean(enriched.isCeoEnriched || enriched.isPhoneEnriched);
        } catch (enrichErr) {
          logger.warn(`[Hybrid Quota] 결측치 외부 보강 실패 건너뜀: ${enrichErr.message}`);
        }
      }

      // 4단계: 대표자 이름, 성별, 나이 중 누락된 항목을 CEO 페르소나 풀(data/ceo_persona_pool.json)로 자동 채움
      const filledItem = fillMissingCeoPersona(mergedItem, ceoPoolUsedState);
      mergedItem.ceoName = filledItem.ceoName;
      mergedItem.ceoGender = filledItem.ceoGender;
      mergedItem.ceoAge = filledItem.ceoAge;

      finalQuotaList.push(mergedItem);
      logger.success(`[Hybrid Quota] [결합 완료] ${mergedItem.companyName} | 시장: ${mergedItem.marketName} | 대표자: ${mergedItem.ceoName || 'null'} (${mergedItem.ceoGender || '-'}, ${mergedItem.ceoAge || '-'}세)${mergedItem.ceoSource ? `[${mergedItem.ceoSource}]` : ''} | 연락처: ${mergedItem.phone || 'null'}${mergedItem.phoneSource ? `[${mergedItem.phoneSource}]` : ''} | 취급품목: ${mergedItem.handledItems || 'null'}`);
    }

    logger.success(`[Hybrid Quota] 총 ${finalQuotaList.length}건의 온누리 연계 사업자 쿼터 생성이 성공적으로 완료되었습니다.`);
    return finalQuotaList;

  } catch (error) {
    logger.error('[Hybrid Quota] 하이브리드 쿼터 생성 중 오류 발생:', error);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}
