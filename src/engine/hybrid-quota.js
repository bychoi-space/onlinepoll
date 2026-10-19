/**
 * AutoSurvey AI - 온누리 가맹점 + 마켓비즈 2단계 하이브리드 쿼터 엔진 (hybrid-quota.js)
 * 1차: 온누리상품권 공인 플랫폼(ongift.or.kr)에서 전통시장 가맹점 팩트 데이터 추출
 * 2차: 마켓비즈(marketbz.com)에서 사업자번호 기반 상세 기업정보 1:1 결합(Enrichment)
 */

import { chromium } from 'playwright';
import { getMarketMerchants, getStratifiedMarketMerchants } from './onnuri.js';
import { enrichBusinessData, fillMissingCeoPersona, hasCompleteAddress, searchAddressByCompany } from './enricher.js';
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
 * [취급품목] 및 [주요품목] 고도화 분리 정제 함수
 * - [취급품목] (handledItems): 농산물, 축산물, 수산물, 의류및신발, 가공식품, 가정용품, 음식점업, 기타소매업, 근린상권서비스
 * - [주요품목] (mainProducts): 상호(companyName) 및 마켓비즈/온누리 세부 정보를 결합하여 가장 정확하고 직관적인 핵심 단어 1개 추출
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

  const comp = String(companyName || '').trim();

  // 상호(점포명) 기반 강력한 1차 고정밀 유추 (마켓비즈의 모호한 행정용어보다 우선순위 적용)
  function inferExactFromStore() {
    // 1. 농수축산물
    if (comp.includes('과일') || comp.includes('청과')) return '과일';
    if (comp.includes('더덕') || comp.includes('인삼') || comp.includes('약초')) return '더덕';
    if (comp.includes('야채') || comp.includes('채소')) return '채소';
    if (comp.includes('농산') || comp.includes('쌀') || comp.includes('곡물') || comp.includes('방앗간') || comp.includes('정미소')) return '곡물';
    if (comp.includes('한우')) return '한우';
    if (comp.includes('정육') || comp.includes('식육') || comp.includes('축산')) return '정육';
    if (comp.includes('생닭') || comp.includes('계육') || comp.includes('닭고기')) return '계육';
    if (comp.includes('수산') || comp.includes('횟집') || comp.includes('활어')) return '활어';
    if (comp.includes('물고기') || comp.includes('생선')) return '생선';
    if (comp.includes('건어물') || comp.includes('굴비') || comp.includes('멸치')) return '건어물';

    // 2. 패션 / 의류 / 신발
    if (comp.includes('신발') || comp.includes('구두') || comp.includes('올스타') || comp.includes('스니커즈')) return '신발';
    if (comp.includes('속옷') || comp.includes('란제리') || comp.includes('메리야스') || comp.includes('메리야쓰') || comp.includes('언더웨어') || comp.includes('옥산')) return '속옷';
    if (comp.includes('한복') || comp.includes('주단')) return '한복';
    if (comp.includes('패션') || comp.includes('의류') || comp.includes('오뜨레') || comp.includes('옷') || comp.includes('부띠끄') || comp.includes('부티크')) return '의류';

    // 3. 뷰티 / 화장품 / 잡화 (온누리/마켓비즈에서 가정용품이나 기타상품으로 오분류되는 대표 사례)
    if (comp.includes('이니스프리') || comp.includes('올리브영') || comp.includes('미샤') || comp.includes('에뛰드') || comp.includes('토니모리') || comp.includes('더페이스샵') || comp.includes('스킨푸드') || comp.includes('아리따움') || comp.includes('화장품') || comp.includes('코스메틱') || comp.includes('뷰티') || comp.includes('향수')) {
      return '화장품';
    }
    if (comp.includes('안경') || comp.includes('콘택트') || comp.includes('렌즈') || comp.includes('아이웨어')) return '안경';
    if (comp.includes('귀금속') || comp.includes('금은방') || comp.includes('보석') || comp.includes('쥬얼리') || comp.includes('주얼리') || comp.includes('악세사리') || comp.includes('액세서리')) return '귀금속';
    if (comp.includes('문구') || comp.includes('팬시') || comp.includes('오피스') || comp.includes('지업') || comp.includes('알파문구')) return '문구류';
    if (comp.includes('서점') || comp.includes('책') || comp.includes('문고')) return '서적';

    // 4. 음식 / 식품 / 가공식품 / 분식
    if (comp.includes('치킨') || comp.includes('통닭') || comp.includes('닭강정') || comp.includes('맥시칸') || comp.includes('닭갈비')) return '치킨';
    if (comp.includes('순대국') || comp.includes('국밥') || comp.includes('설렁탕') || comp.includes('곰탕') || comp.includes('해장국') || comp.includes('순댓국') || comp.includes('추어탕') || comp.includes('감자탕') || comp.includes('찌개') || comp.includes('식당') || comp.includes('한식') || comp.includes('밥상') || comp.includes('백반')) return '한식';
    if (comp.includes('만두') || comp.includes('왕만두')) return '만두';
    if (comp.includes('김밥') || comp.includes('분식') || comp.includes('떡볶이') || comp.includes('순대') || comp.includes('튀김') || comp.includes('호떡') || comp.includes('토스트') || comp.includes('핫도그')) return '분식';
    if (comp.includes('두부')) return '두부류';
    if (comp.includes('떡')) return '떡류';
    if (comp.includes('선식') || comp.includes('생식')) return '선식';
    if (comp.includes('기름') || comp.includes('참기름') || comp.includes('들기름')) return '유지류';
    if (comp.includes('뻥튀기') || comp.includes('과자') || comp.includes('제과') || comp.includes('베이커리') || comp.includes('빵') || comp.includes('브레드') || comp.includes('케이크') || comp.includes('도넛') || comp.includes('와플')) return '제과류';
    if (comp.includes('반찬') || comp.includes('김치')) return '반찬류';
    if (comp.includes('커피') || comp.includes('카페') || comp.includes('다방') || comp.includes('디저트') || comp.includes('마카롱')) return '커피';
    if (comp.includes('피자')) return '피자';
    if (comp.includes('족발') || comp.includes('보쌈')) return '족발';
    if (comp.includes('국수') || comp.includes('칼국수') || comp.includes('냉면') || comp.includes('우동') || comp.includes('라멘') || comp.includes('소바') || comp.includes('밀면') || comp.includes('면')) return '면류';
    if (comp.includes('보성각') || comp.includes('반점') || comp.includes('중식') || comp.includes('짜장') || comp.includes('짬뽕')) return '중식';
    if (comp.includes('룽고') || comp.includes('파스타') || comp.includes('양식') || comp.includes('스테이크') || comp.includes('버거') || comp.includes('피자')) return '서양식';
    if (comp.includes('초밥') || comp.includes('스시') || comp.includes('돈까스') || comp.includes('돈가스') || comp.includes('카츠') || comp.includes('일식')) return '일식';
    if (comp.includes('삼겹') || comp.includes('갈비') || comp.includes('고기') || comp.includes('곱창') || comp.includes('막창') || comp.includes('숯불') || comp.includes('구이')) return '육류구이';
    if (comp.includes('주점') || comp.includes('포차') || comp.includes('호프') || comp.includes('맥주') || comp.includes('비어') || comp.includes('펍')) return '주점';

    // 5. 가정용품 / 생활용품
    if (comp.includes('침구') || comp.includes('이불') || comp.includes('커튼')) return '침구류';
    if (comp.includes('철물') || comp.includes('공구') || comp.includes('건재')) return '철물';
    if (comp.includes('꽃') || comp.includes('꽃샘') || comp.includes('화원') || comp.includes('플라워')) return '화훼';
    if (comp.includes('조명') || comp.includes('전기') || comp.includes('전구')) return '조명기구';
    if (comp.includes('그릇') || comp.includes('도자기') || comp.includes('주방')) return '주방용품';
    if (comp.includes('마트') || comp.includes('슈퍼')) return '슈퍼마켓';

    // 6. 근린상권서비스 / 헬스 / 체육 / 전문서비스
    if (comp.includes('피지오') || comp.includes('필라테스') || comp.includes('피트니스') || comp.includes('헬스') || comp.includes('PT') || comp.includes('체형') || comp.includes('교정') || comp.includes('재활') || comp.includes('요가') || comp.includes('크로스핏') || comp.includes('짐') || comp.includes('GYM') || comp.includes('트레이닝') || comp.includes('운동')) {
      return '체육시설';
    }
    if (comp.includes('태권도') || comp.includes('합기도') || comp.includes('유도') || comp.includes('검도') || comp.includes('체육관')) return '태권도';
    if (comp.includes('영어') || comp.includes('수학') || comp.includes('교습') || comp.includes('스터디') || comp.includes('독서실')) return '교습학원';
    if (comp.includes('음악') || comp.includes('피아노') || comp.includes('미술') || comp.includes('학원')) return '예체능학원';
    if (comp.includes('약국')) return '의약품';
    if (comp.includes('한의원')) return '한의원';
    if (comp.includes('치과')) return '치과의원';
    if (comp.includes('의원') || comp.includes('내과') || comp.includes('정형외과')) return '의원';
    if (comp.includes('이발') || comp.includes('발소') || comp.includes('바버')) return '이용업';
    if (comp.includes('네일') || comp.includes('패디')) return '네일미용';
    if (comp.includes('헤어') || comp.includes('미용') || comp.includes('예작') || comp.includes('살롱')) return '미용업';
    if (comp.includes('피부') || comp.includes('에스테틱') || comp.includes('왁싱') || comp.includes('스킨') || comp.includes('건강')) return '피부미용';
    if (comp.includes('세탁') || comp.includes('크린') || comp.includes('빨래')) return '세탁업';
    if (comp.includes('수리') || comp.includes('정비') || comp.includes('카센터') || comp.includes('모터스') || comp.includes('오토바이') || comp.includes('자전거')) return '수리업';
    if (comp.includes('부동산') || comp.includes('공인중개') || comp.includes('중개')) return '부동산';
    if (comp.includes('스튜디오') || comp.includes('사진') || comp.includes('포토')) return '사진촬영';
    if (comp.includes('당구') || comp.includes('골프') || comp.includes('스크린') || comp.includes('볼링')) return '레저스포츠';
    if (comp.includes('반려동물') || comp.includes('애견') || comp.includes('동물병원') || comp.includes('펫')) return '반려동물';

    return null;
  }

  // 상호에서 확실한 품목이 유추된 경우 우선 채택
  const exactStoreProduct = inferExactFromStore();
  if (exactStoreProduct) {
    return {
      handledItems,
      mainProducts: exactStoreProduct
    };
  }

  // 기존에 유효하게 저장되어 있던 rawMainProducts가 있으면 보존
  if (!subRaw && rawMainProducts && String(rawMainProducts).trim() && rawMainProducts !== 'null') {
    return {
      handledItems,
      mainProducts: String(rawMainProducts).trim().split(/\s+/)[0]
    };
  }

  // 업종별 기본 핵심 단일어 폴백
  function inferCategoryFallback() {
    if (handledItems === '농산물') return '채소';
    if (handledItems === '축산물') return '육류';
    if (handledItems === '수산물') return '해산물';
    if (handledItems === '의류및신발') return '의류';
    if (handledItems === '가공식품') return '가공식품';
    if (handledItems === '가정용품') return '생활잡화';
    if (handledItems === '음식점업') return '한식';
    if (handledItems === '기타소매업') return '생활잡화';
    if (handledItems === '근린상권서비스') return '생활서비스';
    return '잡화';
  }

  // 농산물, 축산물, 수산물 등
  if (['농산물', '축산물', '수산물', '의류및신발'].includes(handledItems)) {
    if (subRaw && (subRaw.includes('속옷') || subRaw.includes('잠옷'))) return { handledItems, mainProducts: '속옷' };
    if (subRaw && subRaw.includes('곡물')) return { handledItems, mainProducts: '곡물' };
    return { handledItems, mainProducts: inferCategoryFallback() };
  }

  if (!subRaw) {
    return { handledItems, mainProducts: inferCategoryFallback() };
  }

  // 2) 괄호 안 부연설명 또는 마켓비즈 산업분류(subRaw)에서 핵심 한 단어 추출
  let cleanedSub = subRaw
    .replace(/^[A-Z0-9]{3,7}\s*/, '') // G47800, I56199 같은 업종코드 제거
    .replace(/\s*외\s*\d+\s*개/g, '')
    .replace(/\/.*$/, '')
    .trim();

  // 의미 없는 행정/포괄 문구 필터링
  if (
    cleanedSub.includes('분류 안된') ||
    cleanedSub.includes('종합 소매업') ||
    cleanedSub.includes('음ㆍ식료품') ||
    cleanedSub.includes('기타 상품 전문') ||
    (handledItems === '가정용품' && cleanedSub.includes('겉옷'))
  ) {
    return { handledItems, mainProducts: inferCategoryFallback() };
  }
  if (cleanedSub.includes('간이 음식 포장 판매') || cleanedSub.includes('간이 음식')) {
    return { handledItems, mainProducts: '간이음식' };
  }
  if (cleanedSub.includes('유지 및 낙농제품')) {
    return { handledItems, mainProducts: '유지류' };
  }

  cleanedSub = cleanedSub
    .replace(/두발\s*미용업/g, '미용업')
    .replace(/피부\s*미용업/g, '피부미용')
    .replace(/^(그 외 기타|기타|일반|가정용|조리|단순|동ㆍ식물성|남자용|여자용)\s+/g, '')
    .replace(/\s+(전문점|음식점업|음식점|제과점업|제과점|소매업|도매업|제조업|서비스업|교육기관|기관|소매|도매|업)$/g, '')
    .trim();

  const firstToken = cleanedSub
    .split(/\s+및\s+|[,ㆍ·\/]|\s+/)[0]
    .replace(/(전문점|음식점업|소매업|도매업|제조업|서비스업)$/g, '')
    .trim();

  // 무의미 파편 단어 블랙리스트
  const invalidTokens = ['상품', '간이', '포장', '배달', '무점포', '방문', '전문', '종합', '기타', '일반', '단순', '판매', '소매', '도매', '제조', '서비스', '등록', '분류', '기업', '사업자'];

  let finalWord = firstToken;
  if (!finalWord || invalidTokens.includes(finalWord)) {
    const secondToken = cleanedSub.split(/\s+/)[1];
    if (secondToken && !invalidTokens.includes(secondToken)) {
      finalWord = secondToken;
    } else {
      finalWord = inferCategoryFallback();
    }
  }

  return { handledItems, mainProducts: finalWord };
}

export function formatStandardHandledItems(opts) {
  return splitHandledAndMainProducts(opts).handledItems;
}

/**
 * 주소 신뢰도 기반 최적 주소 선별 헬퍼
 * - 시/도 + 시/군/구만 있는 광역 주소(예: "서울특별시 송파구")로 상세 온누리 주소(동, 번지, 호수 등)를 덮어쓰는 사고 방지
 * - 상세 번지/건물번호가 있는 구체적인 주소를 최우선 보존
 */
export function pickBestAddress(mbzRoad, onnuriAddr, mbzLot) {
  const hasDetail = (addr) => {
    if (!addr || typeof addr !== 'string') return false;
    const trimmed = addr.trim();
    // 상세 번지/건물번호/호수 등 숫자 정보가 포함되어 있고 8글자 이상인 경우 유효 상세주소로 판단
    return /\d/.test(trimmed) && trimmed.length >= 8;
  };

  // 1순위: 마켓비즈 도로명 주소 (상세 건물번호/도로명이 있는 경우)
  if (hasDetail(mbzRoad)) return mbzRoad.trim();
  // 2순위: 온누리 공인 주소 (동, 번지, 호수 등 상세 점포 위치가 있는 경우)
  if (hasDetail(onnuriAddr)) return onnuriAddr.trim();
  // 3순위: 마켓비즈 지번 소재지 (상세 번지가 있는 경우)
  if (hasDetail(mbzLot)) return mbzLot.trim();

  // 상세 번호가 없는 광역 주소만 남은 경우, 더 구체적이고 긴 주소를 우선 선택
  const candidates = [mbzRoad, onnuriAddr, mbzLot].filter(Boolean).map(s => s.trim());
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

/**
 * 마켓비즈 안전 로그인 헬퍼 (최대 3회 자동 재시도)
 */
async function ensureMarketBzLogin(page, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Step 2/2] 마켓비즈 플랫폼 인증 진행 중 (${MARKETBZ_CREDENTIALS.username}, 시도 ${attempt}/${maxRetries})...`);
      await page.goto(MARKETBZ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#username', { timeout: 10000 });
      await page.fill('#username', MARKETBZ_CREDENTIALS.username);
      await page.fill('#password', MARKETBZ_CREDENTIALS.password);
      await page.click('button.btn-login');
      await page.waitForTimeout(1500);

      const okBtn = page.locator('#successButton, button:has-text("확인")').first();
      try {
        await okBtn.waitFor({ state: 'visible', timeout: 5000 });
        await okBtn.click();
        await page.waitForTimeout(800);
      } catch (_) {}

      logger.success(`[Step 2/2] 마켓비즈 인증 완료 (시도 ${attempt}회).`);
      return true;
    } catch (err) {
      lastErr = err;
      logger.warn(`[Step 2/2] 마켓비즈 로그인 시도 ${attempt}/${maxRetries} 지연/실패: ${err.message}`);
      await sleep(1500, 2500);
    }
  }
  logger.warn(`[Step 2/2] 마켓비즈 초기 로그인 연결이 불안정합니다 (${lastErr?.message}). 개별 점포 조회 및 폴백 모드로 계속 진행합니다.`);
  return false;
}

/**
 * 온누리 + 마켓비즈 2단계 하이브리드 쿼터 생성 및 이어하기(Resume) 함수
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
 * @param {number|null} [options.maxOpenYear=2025] - 개업연도 상한 기준
 * @param {Array<Object>} [options.existingData=[]] - 이어하기(Resume) 시 기존에 이미 수집된 쿼터 배열
 * @param {Array<Object>} [options.savedCandidates=null] - 이어하기 시 이전에 저장해둔 전체 1차 온누리 대상 후보 목록
 * @param {Function} [options.onProgress=null] - 매 건 처리 시 즉시 파일 체크포인트 저장 및 SSE 브로드캐스트를 수행할 콜백
 * @returns {Promise<Object>} { data, targetTotal, completedCount, mbzFailedCount, isComplete, candidates }
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
  maxOpenYear = 2025,
  existingData = [],
  savedCandidates = null,
  onProgress = null
}) {
  const isResumeMode = Array.isArray(existingData) && existingData.length > 0;
  logger.info(`[Hybrid Quota] === 온누리 연계 조사 쿼터 ${isResumeMode ? '이어하기(Resume) 업데이트' : '수집'} 시작 ===`);
  logger.info(`[Hybrid Quota] 대상: "${marketName}" | 모드: ${samplingMode} | 개업연도 상한: ${maxOpenYear ? maxOpenYear + '년 이하' : '전체'} | 기존 데이터: ${existingData.length}건`);

  let onnuriList = [];
  let reserveByCategory = {};
  let generalReserve = [];

  // 1단계: 온누리 플랫폼에서 대상 가맹점 1차 팩트 수집 (또는 저장된 후보 목록 복원)
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

  // 만약 이어하기 시 기존 저장된 후보 목록(savedCandidates)이 있으면 누락된 후보를 병합
  if (Array.isArray(savedCandidates) && savedCandidates.length > 0) {
    const currentBizNums = new Set(onnuriList.map(m => m.bizNumber).filter(Boolean));
    for (const savedCand of savedCandidates) {
      if (savedCand && savedCand.bizNumber && !currentBizNums.has(savedCand.bizNumber)) {
        onnuriList.push(savedCand);
        currentBizNums.add(savedCand.bizNumber);
      }
    }
  }

  if (onnuriList.length === 0 && existingData.length === 0) {
    logger.warn(`[Hybrid Quota] "${marketName}" 조건에 부합하는 온누리 가맹점을 찾지 못했습니다.`);
    return {
      data: [],
      targetTotal: 0,
      completedCount: 0,
      mbzFailedCount: 0,
      isComplete: false,
      candidates: []
    };
  }

  const usedBizSet = new Set(onnuriList.map(m => m.bizNumber).filter(Boolean));
  existingData.forEach(item => {
    if (item && item.bizNumber) usedBizSet.add(item.bizNumber);
  });

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

  // 기존 데이터 중 이미 정상적으로 마켓비즈 결합까지 완료된 항목 보존 & CEO 풀 중복 방지 등록
  const ceoPoolUsedState = { usedSeqs: new Set(), usedNames: new Set() };
  const finalQuotaList = [];
  const completedMap = new Map();

  for (const prevItem of existingData) {
    if (!prevItem) continue;
    if (prevItem.ceoName) ceoPoolUsedState.usedNames.add(prevItem.ceoName);
    const key = prevItem.bizNumber || prevItem.companyName;
    // mbzStatus === 'failed' 가 아니고 필수 필드가 채워진 항목은 이미 성공한 것으로 간주하여 스킵 대상에 등록
    const isCompletedItem = prevItem.mbzStatus !== 'failed' && Boolean(prevItem.ceoName && prevItem.openDate && prevItem.handledItems && prevItem.mainProducts);
    if (isCompletedItem && key) {
      completedMap.set(key, { ...prevItem, mbzStatus: 'ok' });
    }
  }

  // 이어하기 시: 기존에 이미 완료된 항목들을 먼저 finalQuotaList에 담고,
  // 아직 처리되지 않았거나 이전에 마켓비즈 실패(mbzStatus === 'failed')했던 항목들만 마켓비즈 조회 대상으로 분류
  const pendingMerchants = [];
  for (const m of onnuriList) {
    const key = m.bizNumber || m.companyName;
    if (key && completedMap.has(key)) {
      const doneItem = completedMap.get(key);
      doneItem.seq = finalQuotaList.length + 1;
      // [상세주소 자동 복원] 기존 데이터의 주소가 번지 없는 광역 주소인 경우 온누리 상세 주소로 자동 복구
      doneItem.address = pickBestAddress(null, m.address, doneItem.address);
      if (!hasCompleteAddress(doneItem.address)) {
        try {
          const addrResult = await searchAddressByCompany({
            companyName: doneItem.companyName,
            marketName: doneItem.marketName || marketName,
            address: doneItem.address
          });
          if (addrResult && addrResult.address) {
            doneItem.address = addrResult.address;
            doneItem.roadAddress = addrResult.address;
          }
        } catch (e) {}
      }
      finalQuotaList.push(doneItem);
      completedMap.delete(key);
    } else {
      pendingMerchants.push(m);
    }
  }
  // 혹시 onnuriList 외에 completedMap에 남아있는 기존 완료 건들도 보존
  for (const [, doneItem] of completedMap.entries()) {
    doneItem.seq = finalQuotaList.length + 1;
    finalQuotaList.push(doneItem);
  }

  const targetTotal = finalQuotaList.length + pendingMerchants.length;

  if (pendingMerchants.length === 0) {
    logger.success(`[Hybrid Quota] 모든 대상 가맹점(${finalQuotaList.length}건)이 이미 완벽하게 수집되어 있습니다.`);
    return {
      data: finalQuotaList,
      targetTotal: finalQuotaList.length,
      completedCount: finalQuotaList.length,
      mbzFailedCount: 0,
      isComplete: true,
      candidates: onnuriList
    };
  }

  logger.success(`[Step 1/2 완료] 총 목표 ${targetTotal}건 중 기완료 ${finalQuotaList.length}건 보존 ➔ 잔여/재시도 대상 ${pendingMerchants.length}건 마켓비즈 2차 결합을 시작합니다.`);

  // 초기 체크포인트 콜백 호출 (1차 후보 목록과 현재까지 보존된 리스트를 파일에 즉시 저장)
  if (typeof onProgress === 'function') {
    try {
      await onProgress({
        currentData: finalQuotaList,
        currentIndex: finalQuotaList.length,
        targetTotal,
        candidates: onnuriList,
        lastItem: null,
        isComplete: false
      });
    } catch (_) {}
  }

  // 2단계: 마켓비즈 플랫폼 로그인 및 1:1 결합(Enrichment)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let mbzLoggedIn = false;
  let consecutiveMbzFailures = 0;

  try {
    mbzLoggedIn = await ensureMarketBzLogin(page, 3);

    for (let i = 0; i < pendingMerchants.length; i++) {
      const merchant = pendingMerchants[i];
      const currentSeq = finalQuotaList.length + 1;
      const totalPlanned = finalQuotaList.length + (pendingMerchants.length - i);
      const seqStr = `(${currentSeq}번째 목표 / 전체 ${totalPlanned}건)`;
      logger.info(`[Hybrid Quota] ${seqStr} "${merchant.companyName}" (사업자: ${merchant.bizNumber || '미기재'}) 마켓비즈 상세 연동 중...`);

      let marketBzDetail = {};
      let mbzFetchStatus = 'ok';

      if (merchant.rawBizNumber && merchant.rawBizNumber.length === 10) {
        let fetchedOk = false;
        // 개별 사업자 조회 최대 2회 시도 (연속 실패 시 재로그인 시도)
        for (let retry = 1; retry <= 2; retry++) {
          try {
            if (!mbzLoggedIn || consecutiveMbzFailures >= 2) {
              logger.info(`[Hybrid Quota] 마켓비즈 세션 재연결 시도 중...`);
              mbzLoggedIn = await ensureMarketBzLogin(page, 2);
              if (mbzLoggedIn) consecutiveMbzFailures = 0;
            }

            const detailUrl = `https://marketbz.com/companyDetail/${merchant.rawBizNumber}`;
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
            await sleep(700, 1200);

            // 만약 로그인 페이지로 리다이렉트되었다면 재로그인 후 다시 이동
            if (page.url().includes('loginPage')) {
              mbzLoggedIn = await ensureMarketBzLogin(page, 2);
              await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
              await sleep(700, 1200);
            }

            marketBzDetail = await page.evaluate((dynamicFields) => {
              const bodyText = document.body ? document.body.innerText : '';
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
              if (dateM) {
                res.mbzOpenDate = dateM[1].trim();
              }

              const ceoM = coreText.match(/대표자\s*[:\n\|]?\s*([가-힣A-Za-z]{2,10})(?=\s*\||\n|$)/);
              if (ceoM) {
                const val = ceoM[1].trim();
                if (!['연락처', '대표자', '서비스', '소재지', '사업자', '설립일', '등록', '기업', '기본', '핵심'].includes(val)) {
                  res.mbzCeoName = val;
                }
              }

              const ths = Array.from(document.querySelectorAll('th, td, dt, dd'));
              for (let el of ths) {
                const txt = el.innerText.trim();
                if (txt === '대표전화번호' || txt.startsWith('대표전화번호')) {
                  const next = el.nextElementSibling;
                  if (next && next.innerText.trim()) {
                    res.mbzPhone = next.innerText.trim();
                  }
                }
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

              if (!res.mbzPhone) {
                const pMatch = bodyText.match(/대표전화번호\s*[\t\:\n]?\s*([\d-]{8,14})/);
                if (pMatch) res.mbzPhone = pMatch[1].trim();
              }

              const addrM = coreText.match(/소재지\s*[:\n\|]?\s*([^\n]+)/);
              if (addrM) {
                const val = addrM[1].trim();
                if (val && !val.includes('메뉴')) res.mbzAddress = val;
              }

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

            fetchedOk = true;
            consecutiveMbzFailures = 0;
            break;
          } catch (subErr) {
            consecutiveMbzFailures++;
            logger.warn(`[Hybrid Quota] "${merchant.companyName}" 마켓비즈 조회 지연/실패 (시도 ${retry}/2): ${subErr.message}`);
            await sleep(1000, 1800);
          }
        }

        if (!fetchedOk) {
          mbzFetchStatus = 'failed';
          logger.warn(`[Hybrid Quota] "${merchant.companyName}" 마켓비즈 연결 실패 ➔ 온누리 공인 데이터로 우선 저장하며 [이어하기 재시도 대상]으로 마킹합니다.`);
        }
      }

      // 개업연월 정제
      let formattedOpenDate = null;
      if (marketBzDetail.mbzOpenDate) {
        formattedOpenDate = marketBzDetail.mbzOpenDate;
      } else if (merchant.regDate) {
        formattedOpenDate = merchant.regDate;
      }

      // 개업연도 상한 기준 필터링 및 예비 후보 자동 대체 충원
      if (maxOpenYear && formattedOpenDate) {
        const yr = parseInt(formattedOpenDate.slice(0, 4), 10);
        if (!isNaN(yr) && yr > maxOpenYear) {
          const replacement = pullReplacementMerchant(merchant.targetCategory);
          if (replacement) {
            pendingMerchants.push(replacement);
            onnuriList.push(replacement);
            logger.warn(`[Hybrid Quota] "${merchant.companyName}" 개업연도(${yr}년)가 상한(${maxOpenYear}년 이하) 초과로 제외 ➔ 예비 후보 "${replacement.companyName}" 자동 충원`);
          } else {
            logger.warn(`[Hybrid Quota] "${merchant.companyName}" 개업연도(${yr}년)가 상한(${maxOpenYear}년 이하) 초과로 제외 (추가 예비 후보 없음)`);
          }
          continue;
        }
      }

      // 취급품목 및 주요품목 분리 정제
      const { handledItems, mainProducts } = splitHandledAndMainProducts({
        merchantIndustry: merchant.targetCategory || merchant.industry || '',
        mbzIndustry: marketBzDetail.mbzIndustry || '',
        companyName: merchant.companyName
      });

      const finalPhone = formatPhoneNumber(marketBzDetail.mbzPhone);
      const finalCeoName = marketBzDetail.mbzCeoName || null;
      let finalAddress = pickBestAddress(marketBzDetail.mbzRoadAddress, merchant.address, marketBzDetail.mbzAddress);

      // 온누리와 마켓비즈 모두 번지 없는 광역 주소만 준 경우, 외부 포털에서 실존 상세 도로명 주소 자동 탐색
      if (!hasCompleteAddress(finalAddress)) {
        try {
          const addrResult = await searchAddressByCompany({
            companyName: merchant.companyName,
            marketName: merchant.marketName || marketName,
            address: finalAddress
          });
          if (addrResult && addrResult.address) {
            logger.info(`[Hybrid Quota] "${merchant.companyName}" 상세 도로명 주소 외부 탐색 보강: "${finalAddress}" ➔ "${addrResult.address}"`);
            finalAddress = addrResult.address;
          }
        } catch (e) {
          // ignore
        }
      }

      const mergedItem = {
        seq: finalQuotaList.length + 1,
        source: 'ONNURI_MARKETBZ_HYBRID',
        mbzStatus: mbzFetchStatus, // 'ok' | 'failed' (마켓비즈 연결 실패 시 이어하기에서 재조회)
        marketName: merchant.marketName || marketName || '풍납시장',
        companyName: merchant.companyName,
        industry: merchant.targetCategory || merchant.industry || null,
        bizNumber: merchant.bizNumber || null,
        rawBizNumber: merchant.rawBizNumber || (merchant.bizNumber ? merchant.bizNumber.replace(/\D/g, '') : null),
        ceoName: finalCeoName,
        ceoGender: null,
        ceoAge: null,
        phone: finalPhone,
        openDate: formattedOpenDate,
        address: finalAddress,
        handledItems: handledItems,
        mainProducts: mainProducts,
        status: merchant.status || '정상가맹',
        paperAccepted: merchant.paperAccepted,
        digitalAccepted: merchant.digitalAccepted,
        ...marketBzDetail
      };

      delete mergedItem.mbzCeoName;
      delete mergedItem.mbzIndustry;
      delete mergedItem.mbzOpenDate;
      delete mergedItem.mbzAddress;
      delete mergedItem.mbzRoadAddress;
      delete mergedItem.mbzPhone;

      // 3단계: 결측치 외부 공인 데이터 자동 보강
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

      // 4단계: 대표자 이름, 성별, 나이 누락 항목 CEO 페르소나 풀 자동 채움
      const filledItem = fillMissingCeoPersona(mergedItem, ceoPoolUsedState);
      mergedItem.ceoName = filledItem.ceoName;
      mergedItem.ceoGender = filledItem.ceoGender;
      mergedItem.ceoAge = filledItem.ceoAge;

      finalQuotaList.push(mergedItem);
      logger.success(`[Hybrid Quota] [저장 완료 ${finalQuotaList.length}/${totalPlanned}] ${mergedItem.companyName} | 대표자: ${mergedItem.ceoName} (${mergedItem.ceoGender}, ${mergedItem.ceoAge}세) | 연락처: ${mergedItem.phone || '미상'} | 취급품목: ${mergedItem.handledItems} / 주요품목: ${mergedItem.mainProducts}${mergedItem.mbzStatus === 'failed' ? ' [마켓비즈 재시도 필요]' : ''}`);

      // [핵심] 매 1건 완료될 때마다 즉시 체크포인트 콜백 호출 (파일 저장 & 프론트 실시간 표 갱신)
      if (typeof onProgress === 'function') {
        try {
          await onProgress({
            currentData: finalQuotaList,
            currentIndex: finalQuotaList.length,
            targetTotal: totalPlanned,
            candidates: onnuriList,
            lastItem: mergedItem,
            isComplete: false
          });
        } catch (cbErr) {
          logger.warn(`[Hybrid Quota] 체크포인트 저장 경고: ${cbErr.message}`);
        }
      }
    }

  } catch (error) {
    logger.error(`[Hybrid Quota] 수집 도중 예외 발생 (현재까지 확보된 ${finalQuotaList.length}건 안전 보존):`, error.message);
  } finally {
    await browser.close().catch(() => {});
  }

  const mbzFailedCount = finalQuotaList.filter(item => item.mbzStatus === 'failed').length;
  const isComplete = finalQuotaList.length >= targetTotal && mbzFailedCount === 0;

  if (typeof onProgress === 'function') {
    try {
      await onProgress({
        currentData: finalQuotaList,
        currentIndex: finalQuotaList.length,
        targetTotal,
        candidates: onnuriList,
        lastItem: null,
        isComplete
      });
    } catch (_) {}
  }

  logger.success(`[Hybrid Quota] 작업 종료: 총 ${finalQuotaList.length}/${targetTotal}건 저장 완료 (마켓비즈 미연결 재시도 대상: ${mbzFailedCount}건).`);
  return {
    data: finalQuotaList,
    targetTotal,
    completedCount: finalQuotaList.length,
    mbzFailedCount,
    isComplete,
    candidates: onnuriList
  };
}

