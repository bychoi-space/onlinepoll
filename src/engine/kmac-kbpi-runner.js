/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사 - 전용 자동화 러너]
 * - 대상 포털: https://isurvey.kmaresearch.co.kr/sy/login (ID: 230)
 * - 핵심 기능:
 *   1. 지역별 브라우저 GPS 강제 주입 (서울=노원구청 / 인천=인천광역시청 + 응답자 고유 시드 미세 분산)
 *   2. 신상정보 자동 분기 (010 휴대폰 vs 02 일반전화) 및 SQ1 "모두 없다" 스크리닝 통과
 *   3. 산업군(카테고리) 동적 감지 + 마스터 브랜드 사전 & 실시간 학습 캐시 + Gemini AI 폴백
 *   4. 문항 1~8 정합성 엔진:
 *      - 문항 3(1~9): 44444 일렬 금지, 3·4·5 분산 / 3-10: 평균 반올림
 *      - 구입경험 '없음' 시: 3-11(1·2·3번 중 선택, 4·5번 절대 금지) + 3-13(전원 아니오) + 문4·문5(없음)
 *      - 구입경험 '있음' 시: 3-13(1번열 예) + 3-11(만족도 4~5->4·5번 / 3->2·3번) + 문4(1번열 브랜드) + 문4-1(편의점·동네슈퍼 등 맞춤 채널) + 문5(문4 동일)
 *      - 문항 6(아니오 80 : 예 20) / 문항 7(1·2순위 랜덤, 기타 절대 금지) / 문항 8(랜덤 2개, 기타·없음 제외)
 *   5. 파일럿 모드 기본 문항 4 도달 시 안전 정지(stopAtStep: 'Q4') 및 완료 직전 안전 대기(Rule 10) 지원
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchChromium } from '../utils/chromium-launcher.js';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';
import {
  KBPI_DEFAULT_LOGIN_ID,
  computeKbpiGps,
  computeKbpiDistrictDong,
  enrichKbpiRespondentDemographics,
  normalizeCategoryConfigs
} from '../utils/kmac-kbpi-sheet-sync.js';
import {
  KMAC_ISURVEY_LOGIN_URL,
  loginAndEnterKbpiCapiList
} from './kmac-kbpi-scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const brandDictPath = path.join(rootDir, 'data', 'kbpi_2027_brand_dict.json');
const learnedDictPath = path.join(rootDir, 'data', 'kbpi_2027_learned_categories.json');

export const KBPI_DEFAULT_URL = KMAC_ISURVEY_LOGIN_URL;

export const DEFAULT_KBPI_POLICY = {
  pilotStopAtStep: 'Q4',          // 파일럿 실행 시 1번째 산업군의 문항 4 화면에서 안전 정지
  stopBeforeFinalSubmit: true,    // 배치 실행 시에도 기본 완료 직전 대기 (Rule 10)
  purchaseYesRate: 90,            // 시트 미지정 품목의 구입경험 '있음' 비율 (기본 90%)
  unaided4thBrandRate: 35,        // 문항 1-4 추가 브랜드 1개 입력 비율 (나머지 65%는 '없음' 체크)
  aidedExtraMin: 2,               // 문항 2 추가 랜덤 선택 최소 개수
  aidedExtraMax: 4,               // 문항 2 추가 랜덤 선택 최대 개수
  q6NoRate: 80,                   // 문항 6 '아니오' 선택 비율 (기본 80%)
  teenAutoNoneUnfitCategories: true, // 10대 미성년자에게 주류/자동차/금융/대형주방가전 출제 시 시트 미지정이면 '없음' 자동 보정
  autoSyncGoogleSheet: true,      // 진행 후 구글 시트 자동 기록 여부
  proxyServer: ''                 // 필요 시 서울 리전 프록시 경유 주소
};

const TEEN_UNFIT_CATEGORY_KEYWORDS = [
  '소주', '맥주', '위스키', '와인', '막걸리', '전통주', '주류', '숙취', '담배', '전자담배',
  '자동차', '수입차', '전기차', '중고차', '타이어', '주유소', '충전소', '내비게이션', '블랙박스', '렌터카', '카셰어링',
  '운전자보험', '생명보험', '손해보험', '실손보험', '연금', '보험', '신용카드', '증권', '자산관리', '펀드', '대출', '저축은행', '신탁',
  '사이버대학', '대학원', 'MBA', '평생교육', '결혼정보', '웨딩', '상조', '산후조리', '기저귀', '분유', '유모차', '카시트', '유아',
  '음식물처리기', '김치냉장고', '식기세척기', '비데', '정수기', '안마의자', '침대', '매트리스', '보일러', '온수기', '부엌가구', '인테리어', '창호', '아파트', '오피스텔',
  '건강검진센터', '임플란트', '구호개발단체', 'NGO', '자선'
];

const MALE_UNFIT_CATEGORY_KEYWORDS = [
  '생리대', '여성청결제', '여성복', '여성정장', '여성언더웨어', '산부인과', '산후조리'
];

const FEMALE_UNFIT_CATEGORY_KEYWORDS = [
  '남성정장', '남성화장품', '전기면도기', '면도기', '남성복'
];

export const Q3_RECOMMEND_REASON_POOLS = {
  positive: [
    '인지도가 높고 신뢰가 가서',
    '서비스와 품질이 우수해서',
    '주변 평판이 좋아서',
    '이용이 편리하고 만족스러워서',
    '전문성과 시스템이 믿음직해서',
    '기대만큼 만족도가 높아서',
    '대중적이고 평이 좋아서',
    '안정적이고 믿을 수 있어서'
  ],
  neutral: [
    '무난하고 대중적이어서',
    '보통 수준이라고 생각해서',
    '익숙하지만 무난해서',
    '주변에서 종종 들어봐서',
    '특별한 단점 없이 평범해서'
  ]
};

export function resolveSmartChannelPool(categoryName = '', policy = {}, baseDict = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const customFoodChannels = String(policy.customFoodLivingChannels || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (/병원|의료원|의원|치과|안과|한의원|검진/.test(cleanCat)) {
    return ['병원 직접 방문', '공식 홈페이지 예약', '전화 예약 후 방문'];
  }
  if (/택배|물류|포장이사|퀵서비스/.test(cleanCat)) {
    return ['편의점 접수', '공식 앱 예약', '온라인 쇼핑몰 배송'];
  }
  if (/사이버대학|온라인.*학원|AI.*학습|인강|온라인교육|이러닝|화상영어|학습앱/.test(cleanCat)) {
    return ['공식 홈페이지', '모바일 공식 앱'];
  }
  if (/학원|학습지|어학원|교육|대학/.test(cleanCat)) {
    return ['학원 직접 방문 상담', '공식 홈페이지 수강신청'];
  }
  if (/은행|카드|보험|증권|페이|결제|금융|저축|자산관리/.test(cleanCat)) {
    return ['모바일 공식 앱', '공식 홈페이지', '영업점 직접 방문'];
  }
  if (/오픈마켓|소셜커머스|온라인쇼핑|배달앱|숙박앱|부동산앱|모빌리티|OTT|포털|음원|웹툰|초고속인터넷|IPTV|이동통신|알뜰폰/.test(cleanCat)) {
    return ['모바일 공식 앱', '공식 웹사이트'];
  }
  if (/구호개발단체|NGO|자선/.test(cleanCat)) {
    return ['공식 홈페이지 정기후원', '온라인 캠페인 참여'];
  }
  if (/백화점|대형할인점|면세점|편의점|슈퍼마켓|아울렛|복합쇼핑몰|창고형할인매장|드럭스토어|헬스앤뷰티/.test(cleanCat)) {
    return ['오프라인 매장 직접 방문', '브랜드 공식 앱'];
  }
  if (/베이커리|제과|제빵|커피전문점|카페|치킨|피자|패스트푸드|외식|레스토랑|아이스크림전문점|영화관|호텔|리조트|콘도|주유소|렌터카|여행사|항공사/.test(cleanCat)) {
    return ['오프라인 매장 직접 방문', '공식 모바일 앱', '공식 홈페이지 예약'];
  }
  if (/SPA|스포츠웨어|아웃도어|의류|패션|정장|캐주얼|구두|운동화|언더웨어|가방/.test(cleanCat)) {
    return ['백화점 매장', '직영 오프라인 매장', '공식 온라인몰', '무신사'];
  }
  if (/화장품|뷰티|스킨케어|샴푸|바디|향수|염모제/.test(cleanCat)) {
    return ['올리브영 매장', '백화점 매장', '공식 온라인몰', '쿠팡'];
  }
  if (/스마트워치|스마트폰|노트북|태블릿|이어폰|TV|냉장고|세탁기|에어컨|청소기|정수기|비데|처리기|밥솥|가전|침대|매트리스|가구|보일러|자동차|타이어/.test(cleanCat)) {
    return ['브랜드 공식 스토어', '백화점 매장', '롯데하이마트', '쿠팡', '네이버 브랜드스토어'];
  }

  if (customFoodChannels.length > 0) {
    return customFoodChannels;
  }
  return baseDict.channelPools?.food_living || ['편의점', '동네슈퍼', '이마트', '쿠팡', '홈플러스', '롯데마트'];
}

function hashSeed(str = '') {
  const s = String(str || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function makeSeededRng(seedStr = '') {
  let state = hashSeed(seedStr) || 123456789;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadBrandDictionary() {
  let baseDict = { defaultAdjectives: { positive: [], neutral: [] }, channelPools: {}, categories: {} };
  try {
    if (fs.existsSync(brandDictPath)) {
      baseDict = JSON.parse(fs.readFileSync(brandDictPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[K-BPI Dict 로드 경고]', err.message);
  }

  let learned = {};
  try {
    if (fs.existsSync(learnedDictPath)) {
      learned = JSON.parse(fs.readFileSync(learnedDictPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[K-BPI Learned Dict 로드 경고]', err.message);
  }

  return { baseDict, learned };
}

function saveLearnedCategoryBrands(categoryName, brands = []) {
  const cleanCat = String(categoryName || '').trim();
  const cleanBrands = Array.from(new Set(
    brands
      .map(b => String(b || '').trim())
      .filter(b => b && b !== '없음' && b !== '모름' && !b.includes('기타'))
  ));
  if (!cleanCat || cleanBrands.length < 3) return;

  try {
    let learned = {};
    if (fs.existsSync(learnedDictPath)) {
      learned = JSON.parse(fs.readFileSync(learnedDictPath, 'utf8'));
    }
    learned[cleanCat] = {
      brands: cleanBrands,
      updatedAt: new Date().toISOString()
    };
    writeJsonAtomicSync(learnedDictPath, learned);
  } catch (err) {
    console.warn('[K-BPI Learned Dict 저장 경고]', err.message);
  }
}

async function resolveCategoryMeta(categoryName, policy = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim() || '일반소비재';
  const { baseDict, learned } = loadBrandDictionary();

  // 1) 정확히 일치하거나 부분 일치하는 사전 항목 탐색
  let matchedEntry = baseDict.categories?.[cleanCat] || null;
  if (!matchedEntry) {
    const keys = Object.keys(baseDict.categories || {});
    const partialKey = keys.find(k => cleanCat.includes(k) || k.includes(cleanCat));
    if (partialKey) matchedEntry = baseDict.categories[partialKey];
  }

  let brands = [];
  if (learned[cleanCat]?.brands?.length >= 3) {
    brands = learned[cleanCat].brands;
  } else if (matchedEntry?.brands?.length >= 3) {
    brands = matchedEntry.brands;
  }

  // 2) 사전에 없는 미등록 산업군 등장 시 Gemini AI 실시간 추론 폴백
  if (brands.length < 3 && process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `한국능률협회컨설팅 K-BPI 소비자 브랜드 조사에서 "${cleanCat}" 산업군에 해당하는 대한민국 실제 유명 대표 브랜드명 6개와, 소비자가 떠올리는 짧은 이미지 표현(형용사/명사 혼합, 예: 깨끗하다, 편리함, 믿음직한) 8개, 실제 주 구매/이용 경로 4개를 JSON으로만 반환해줘. 형식: {"brands":["..."],"adjectives":["..."],"channels":["..."]}`;
      const resp = await model.generateContent(prompt);
      const txt = resp.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed.brands) && parsed.brands.length >= 3) {
        brands = parsed.brands;
        saveLearnedCategoryBrands(cleanCat, brands);
        return {
          categoryName: cleanCat,
          brands,
          adjectives: Array.isArray(parsed.adjectives) && parsed.adjectives.length >= 4
            ? parsed.adjectives
            : (baseDict.defaultAdjectives?.positive || ['친숙하다', '믿음직함', '깔끔하다', '실용적임', '편리함', '안정적인']),
          channels: resolveSmartChannelPool(cleanCat, policy, baseDict)
        };
      }
    } catch (aiErr) {
      console.warn(`[K-BPI Gemini 브랜드 추론 폴백 경고: ${cleanCat}]`, aiErr.message);
    }
  }

  if (brands.length < 3) {
    if (/병원|의료원|검진/.test(cleanCat)) {
      brands = ['서울아산병원', '세브란스병원', '삼성서울병원', '서울대학교병원', '가천대길병원', '인하대병원', '분당서울대학교병원', '아주대학교병원'];
    } else if (/대학|학교/.test(cleanCat)) {
      brands = ['서울대학교', '연세대학교', '고려대학교', '성균관대학교', '한양대학교', '인하대학교'];
    } else if (/백화점|아울렛|면세점/.test(cleanCat)) {
      brands = ['신세계백화점', '롯데백화점', '현대백화점', '갤러리아백화점', 'AK플라자'];
    } else if (/호텔|리조트|콘도/.test(cleanCat)) {
      brands = ['신라호텔', '롯데호텔', '조선호텔', '워커힐', '한화리조트', '소노호텔앤리조트'];
    } else if (/여행사/.test(cleanCat)) {
      brands = ['하나투어', '모두투어', '노랑풍선', '인터파크투어', '참좋은여행'];
    } else if (/교육|학습지|학원|인강/.test(cleanCat)) {
      brands = ['구몬학습', '눈높이', '웅진씽크빅', '메가스터디', '해커스', 'YBM'];
    } else if (/아파트|건설/.test(cleanCat)) {
      brands = ['래미안', '자이', '힐스테이트', '롯데캐슬', '푸르지오', '더샵'];
    } else {
      brands = ['삼성', 'LG', '롯데', 'CJ', '현대', '신세계'];
    }
  }

  const channels = resolveSmartChannelPool(cleanCat, policy, baseDict);

  const adjectives = Array.from(new Set([
    ...(matchedEntry?.adjectives || []),
    ...(baseDict.defaultAdjectives?.positive || [])
  ]));

  return {
    categoryName: cleanCat,
    brands,
    adjectives,
    channels
  };
}

/**
 * 문항 3(1~9번) 점수 생성기:
 * - 절대 동일 점수 일렬(444444444 등) 금지!
 * - 3, 4, 5점 범위 내에서 자연스러운 분산 보장
 */
export function generateKbpiMatrixScores(rngOrOpts = Math.random, hasPurchaseExpArg = true) {
  const isObj = rngOrOpts && typeof rngOrOpts === 'object';
  const rng = typeof rngOrOpts === 'function' ? rngOrOpts : (typeof rngOrOpts?.rng === 'function' ? rngOrOpts.rng : Math.random);
  const hasPurchaseExp = isObj ? (rngOrOpts.hasPurchaseExp !== false) : Boolean(hasPurchaseExpArg);
  const pool = hasPurchaseExp ? [3, 4, 4, 4, 5, 5] : [3, 3, 3, 4, 4, 5];
  let scores = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    scores = [];
    for (let i = 0; i < 9; i++) {
      scores.push(pool[Math.floor(rng() * pool.length)]);
    }
    if (new Set(scores).size >= 2) break;
  }
  if (new Set(scores).size < 2) {
    scores[0] = 4;
    scores[1] = 3;
    scores[2] = 5;
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const overallSatisfaction = Math.max(3, Math.min(5, Math.round(avg)));

  // 11번 평소 태도 보기 결정 (핵심 절대 규칙 반영):
  // - 구입경험이 '없음(아니오)'이면 4·5번 체크 절대 불가 -> 반드시 1, 2, 3번 중(2 또는 3번 우선) 선택!
  // - 구입경험이 '있음(예)'이면 전반적 만족도 4~5일 때 4·5번, 3일 때 2·3번(3번 우선) 선택!
  let attitudeChoice;
  if (!hasPurchaseExp) {
    attitudeChoice = rng() < 0.45 ? 2 : 3;
  } else if (overallSatisfaction >= 4) {
    attitudeChoice = (overallSatisfaction === 5 && rng() < 0.45) ? 5 : 4;
  } else {
    attitudeChoice = rng() < 0.25 ? 2 : 3;
  }

  return {
    itemScores: scores,
    overallSatisfaction,
    attitudeChoice
  };
}

/**
 * 해당 산업군에 대한 구입경험('있음' | '없음') 결정
 * 우선순위: 1) 시트 브랜드명 일치 설정 -> 2) 시트 슬롯 순번 설정 -> 3) 연령·성별 비적합 품목 안전 보정 -> 4) 기본 90:10 확률
 */
export function decideCategoryPurchaseExp({
  categoryName,
  categorySlotIdx = 0,
  categoryConfigs = [],
  ageGroup = '',
  age = 30,
  gender = '',
  respondentAge,
  policy = {},
  rng = Math.random
}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const effAge = respondentAge !== undefined ? Number(respondentAge) : Number(age);
  const cleanGender = String(gender || '').trim();

  // 1) 시트에 카테고리명이 직접 명시되어 있는 경우 최우선 적용
  const namedCfg = categoryConfigs.find(c => {
    const cn = String(c.categoryName || '').replace(/브랜드$/g, '').trim();
    return cn && (cn === cleanCat || cleanCat.includes(cn) || cn.includes(cleanCat));
  });
  if (namedCfg && (namedCfg.purchaseExp === '없음' || namedCfg.purchaseExp === '있음')) {
    return namedCfg.purchaseExp;
  }

  // 2) 해당 순번 슬롯(0-based index 또는 slot = categorySlotIdx + 1)에 '없음'/'있음'이 사전 기재된 경우
  const slotCfg = categoryConfigs.find(c => Number(c?.slot) === Number(categorySlotIdx) + 1) || categoryConfigs[categorySlotIdx];
  if (slotCfg && !slotCfg.categoryName && (slotCfg.purchaseExp === '없음' || slotCfg.purchaseExp === '있음')) {
    return slotCfg.purchaseExp;
  }

  // 3) 10대(미성년) 응답자 및 성별 전용 품목 자동 '없음' 안전 보정
  const isTeen = String(ageGroup || '').includes('10대') || (effAge > 0 && effAge <= 19);
  if (isTeen && policy.teenAutoNoneUnfitCategories !== false) {
    if (TEEN_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
      return '없음';
    }
  }
  if (cleanGender.startsWith('남') && MALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('여') && FEMALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }

  // 4) 가이드 기본 비율 (구입 90% : 없음 10%)
  const yesRate = Number(policy.purchaseYesRate ?? 90);
  return (rng() * 100 < yesRate) ? '있음' : '없음';
}

/**
 * 스캔된 품목의 초기 권장 구입경험('있음' | '없음') 산출
 * - 연령(10대)·성별 부적합 품목은 자동으로 '없음' 추천, 일반 품목은 '있음' 기본 세팅 (가이드/시트에서 1클릭 전환 가능)
 */
export function recommendDefaultPurchaseExp({
  categoryName = '',
  ageGroup = '',
  age = 30,
  gender = '',
  teenAutoNone = true
} = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const effAge = Number(age || 30);
  const cleanGender = String(gender || '').trim();
  const isTeen = String(ageGroup || '').includes('10대') || (effAge > 0 && effAge <= 19);
  if (isTeen && teenAutoNone !== false && TEEN_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('남') && MALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('여') && FEMALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  return '있음';
}

/**
 * [요구사항 3.1] DQ1 정보 습득 경로(2개 응답): '생성형 AI', '신문/잡지/카탈로그', '기타' 제외 후 랜덤 2개 선택
 */
export function pickKbpiDq1Keys(options = [], rng = Math.random) {
  const isExcludedDq1 = (opt) => {
    const ak = String(opt?.akey || opt?.K || '').trim();
    const lb = String(opt?.label || opt?.V || '').trim();
    if (ak === '6' || ak === '9' || ak === '10') return true;
    if (/생성형\s*AI|\bAI\b|신문|잡지|카탈로그|(^|\s)기타(\s|$)|없음|모름/i.test(lb)) return true;
    return false;
  };
  const valid = (Array.isArray(options) ? options : []).filter(o => !isExcludedDq1(o));
  const shuffled = shuffleWithRng(valid, rng);
  return shuffled.slice(0, 2);
}

/**
 * [요구사항 3.2] 구글 스프레드시트의 (연령·학력·직업·가구소득·결혼여부·가족수·자녀수) 데이터를
 * Survey 230의 ZQ1 ~ ZQ5_2 공식 보기 코드(akey)로 1:1 정밀 매핑
 */
export function resolveKbpiZqAnswers(rawSlot = {}) {
  const enriched = enrichKbpiRespondentDemographics(rawSlot);
  const age = Number(rawSlot.age || rawSlot.ceoAge || 30);

  // ZQ1: 연령대 (만 나이 십의 자리와 100% 일치 필수 — CONFIRM 검증 통과 보장)
  const zq1Key = String(Math.min(5, Math.max(1, Math.floor(age / 10))));

  // ZQ2: 학력 (1:중졸이하, 2:고졸이하, 3:중/고등학생, 4:대학생, 5:대졸, 6:대학원 재학/졸업)
  const edu = String(rawSlot.education || enriched.education || '').trim();
  let zq2Key = '5';
  if (/대학원|석사|박사/.test(edu)) zq2Key = '6';
  else if (/대학생|대학\s*재학/.test(edu)) zq2Key = '4';
  else if (/중\/고등|중고등|고등학생|중학생|고교\s*재학/.test(edu)) zq2Key = '3';
  else if (/중졸/.test(edu)) zq2Key = '1';
  else if (/고졸/.test(edu)) zq2Key = '2';
  else if (/대졸|대학\s*졸업|전문대/.test(edu)) zq2Key = '5';
  else if (age <= 19) zq2Key = '3';

  // ZQ3: 직업 (1:농림어업, 2:자영업, 3:사무직, 4:판매/서비스직, 5:관리직, 6:생산직, 7:전문직, 8:기술직, 9:중/고등학생, 10:대학생, 11:주부, 12:무직, 13:기타)
  const job = String(rawSlot.job || enriched.job || '').trim();
  let zq3Key = '3';
  let zq3EtcText = '';
  if (/농업|어업|임업/.test(job)) zq3Key = '1';
  else if (/자영업|사업/.test(job)) zq3Key = '2';
  else if (/사무/.test(job)) zq3Key = '3';
  else if (/판매|서비스/.test(job)) zq3Key = '4';
  else if (/관리|임원/.test(job)) zq3Key = '5';
  else if (/생산|노무|기능/.test(job)) zq3Key = '6';
  else if (/전문|의사|약사|교사|강사/.test(job)) zq3Key = '7';
  else if (/기술|엔지니어|개발/.test(job)) zq3Key = '8';
  else if (/중\/고등|중고등|고등학생|중학생/.test(job)) zq3Key = '9';
  else if (/대학생/.test(job)) zq3Key = '10';
  else if (/주부/.test(job)) zq3Key = '11';
  else if (/무직|취준|구직/.test(job)) zq3Key = '12';
  else if (job) {
    zq3Key = '13';
    zq3EtcText = job.replace(/^기타\s*[:()-]?\s*/, '').trim() || '프리랜서';
  }

  // ZQ4: 월평균 가구소득 (1:200만원 미만, 2:200~399만원, 3:400~599만원, 4:600~799만원, 5:800만원 이상)
  const inc = String(rawSlot.householdIncome || enriched.householdIncome || '').trim();
  let zq4Key = '3';
  if (/200\s*만?\s*원?\s*미만|^1\b|^1\d\d/.test(inc)) zq4Key = '1';
  else if (/200\s*[~-]\s*399|200|300/.test(inc)) zq4Key = '2';
  else if (/400\s*[~-]\s*599|400|500/.test(inc)) zq4Key = '3';
  else if (/600\s*[~-]\s*799|600|700/.test(inc)) zq4Key = '4';
  else if (/800|900|1,?000|이상/.test(inc)) zq4Key = '5';

  // ZQ5: 결혼 여부 (1:미혼, 2:기혼, 3:기타(이혼/사별/별거), 4:비혼)
  const mar = String(rawSlot.maritalStatus || enriched.maritalStatus || '').trim();
  let zq5Key = age <= 29 ? '1' : '2';
  if (/비혼/.test(mar)) zq5Key = '4';
  else if (/기타|이혼|사별|별거/.test(mar)) zq5Key = '3';
  else if (/기혼/.test(mar)) zq5Key = '2';
  else if (/미혼/.test(mar)) zq5Key = '1';

  // ZQ5_1: 가족 수 (1:1명(본인), 2:2명, 3:3명, 4:4명, 5:5명 이상)
  const fam = String(rawSlot.familySize || enriched.familySize || '4명').trim();
  const famMatch = fam.match(/(\d+)/);
  const famNum = famMatch ? Number(famMatch[1]) : 4;
  const zq5_1Key = String(Math.min(5, Math.max(1, famNum)));

  // ZQ5_2: 자녀 수 (1:1명, 2:2명, 3:3명, 4:4명 이상, 5:해당사항 없음)
  // 주의: Survey 230 HIDE 규칙상 [ZQ5_1=1](가족수 1명)일 때 1~4번 보기가 숨겨지고 5번(해당사항 없음)만 활성화됨!
  const ch = String(rawSlot.childrenCount || enriched.childrenCount || '').trim();
  let zq5_2Key = '5';
  if (zq5_1Key === '1') {
    zq5_2Key = '5';
  } else if (/해당\s*사항\s*없음|해당없음|없음|^0(?:\.0+)?$/.test(ch) || !ch) {
    zq5_2Key = '5';
  } else {
    const chMatch = ch.match(/(\d+)/);
    const chNum = chMatch ? Number(chMatch[1]) : 0;
    zq5_2Key = chNum <= 0 ? '5' : String(Math.min(4, chNum));
  }

  return {
    zq1Key,
    zq2Key,
    zq3Key,
    zq3EtcText,
    zq4Key,
    zq5Key,
    zq5_1Key,
    zq5_2Key,
    labels: {
      education: edu,
      job,
      householdIncome: inc,
      maritalStatus: mar,
      familySize: fam,
      childrenCount: zq5_1Key === '1' ? '해당사항 없음(1인가구 보정)' : (ch || '해당사항 없음')
    }
  };
}

/**
 * 슬롯 목록 화면에서 대상 응답자(고유번호 uid / 최종id finalId / 지역 / 성별 / 연령대) 행을 찾아 [시작] 클릭
 */
async function findAndStartRespondentSlot({
  context,
  listPage,
  slotData,
  emitLog
}) {
  const uid = String(slotData.uid || '').trim();
  const finalId = String(slotData.finalId || '').trim();
  const region = String(slotData.region || '').trim();
  const gender = String(slotData.gender || slotData.ceoGender || '').trim();
  const ageGroup = String(slotData.ageGroup || '').trim();

  emitLog(`[슬롯 탐색] #${slotData.seq || slotData.index} ${slotData.name} (${region}/${gender}/${ageGroup}, 최종id=${finalId}, 고유번호=${uid}) 탐색... (URL: ${listPage.url()})`);

  // GetData(/Cati/Capi/) 페이지당 표시 개수(ROW_PER_PAGE)가 있으면 100개 보기로 확장
  const expandedRows = await listPage.evaluate(() => {
    const sel = document.querySelector('select.ROW_PER_PAGE');
    if (sel && sel.value !== '100') {
      sel.value = '100';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof $ !== 'undefined') $(sel).val('100').trigger('change');
      return true;
    }
    return false;
  }).catch(() => false);
  if (expandedRows) {
    await listPage.waitForTimeout(1800);
  }

  const scanCurrentDomForSlot = async () => {
    return listPage.evaluate(({ targetUid, targetFinalId, targetReg, targetGen, targetAg }) => {
      document.querySelectorAll('[data-kbpi-target-start]').forEach(el => el.removeAttribute('data-kbpi-target-start'));

      const rawRows = Array.from(
        document.querySelectorAll('table.list-data tbody tr, table tbody tr, [role="row"], .ag-row, .tui-grid-row')
      ).filter(r => {
        if (r.closest('thead')) return false;
        const t = (r.innerText || '').trim();
        if (!t) return false;
        if (/최종\s*id/i.test(t) && /조사지역/.test(t)) return false;
        return true;
      });

      // 주의: '진행중'(상태 열 텍스트)이나 '참여'(헤더/필터 텍스트)가 매칭되지 않도록 실제 버튼 태그 + 명확한 시작 동사만 허용!
      const btnTextRegex = /^(시작|조사\s*시작|이어하기|재시작|계속|계속하기|설문\s*참여|참여하기)$/;
      const excludeBtnRegex = /삭제|취소|중단|제외|초기화/;

      for (const rowEl of rawRows) {
        let rowObj = {};
        const rawObjAttr = rowEl.getAttribute('data-object');
        if (rawObjAttr) {
          try { rowObj = JSON.parse(rawObjAttr); } catch (e) { rowObj = {}; }
        }
        const rowAttrUid = String(
          rowEl.getAttribute('data-uid') ||
          rowEl.getAttribute('data-id') ||
          rowObj._id ||
          rowObj.UID ||
          rowObj['고유번호'] ||
          ''
        ).trim();
        const rowAttrFinalId = String(rowObj['최종id'] ?? rowObj['최종ID'] ?? '').trim();

        const cellEls = Array.from(
          rowEl.querySelectorAll('td, [role="gridcell"], [role="cell"], .ag-cell, .tui-grid-cell')
        );
        const cells = cellEls.length > 0
          ? cellEls.map(c => (c.innerText || '').trim())
          : (rowEl.innerText || '').split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);
        const fullText = cells.join(' | ');

        const hasUid = Boolean(
          targetUid && (rowAttrUid === targetUid || fullText.includes(targetUid))
        );
        const hasExactFinalId = Boolean(
          targetFinalId && (rowAttrFinalId === targetFinalId || cells.some(c => c === targetFinalId))
        );
        const demoMatches =
          (!targetReg || fullText.includes(targetReg) || String(rowObj['조사지역'] || '').includes(targetReg)) &&
          (!targetGen || cells.includes(targetGen) || String(rowObj['성별'] || '') === targetGen) &&
          (!targetAg || fullText.includes(targetAg) || String(rowObj['연령'] || '').includes(targetAg));

        if (!hasUid && !(hasExactFinalId && demoMatches)) continue;

        // GetData(r.survey.co.kr) 세션 기반 직접 설문 URL 백업 산출
        let directSurveyUrl = '';
        try {
          const resolvedUid = rowAttrUid || targetUid;
          const akList = Array.isArray(window.ACCESS_KEYS) ? window.ACCESS_KEYS : [];
          const realAk = (akList.find(k => k.NAME === 'REAL') || akList[0])?._id || '';
          const cuLoginId = sessionStorage.CU_LOGIN_ID || '';
          const cuId = sessionStorage.CU_ID || '';
          const domain = window.DOMAIN || location.host;
          if (realAk && resolvedUid && /survey\.co\.kr|kmaresearch\.co\.kr/i.test(domain)) {
            directSurveyUrl = `https://${domain}/?ACCESS_KEY=${encodeURIComponent(realAk)}&UID=${encodeURIComponent(resolvedUid)}` +
              (cuId ? `&__CU_ID=${encodeURIComponent(cuId)}` : '') +
              (cuLoginId ? `&__CU_LOGIN_ID=${encodeURIComponent(cuLoginId)}` : '');
          }
        } catch (urlErr) {
          directSurveyUrl = '';
        }

        // 완료 상태 먼저 확인 (상태 코드 COMPLETE 또는 완료 텍스트 + 시작 버튼 없음)
        const compCode = String(rowObj.COMPLETE || '').toUpperCase();

        // 1순위: 동일 행(rowEl) 내부의 실제 <button> / <a> / <input> 요소만 탐색 (span/div 상태셀 배제!)
        const realRowControls = Array.from(
          rowEl.querySelectorAll('button, a, input[type="button"], input[type="submit"]')
        ).filter(el => !el.disabled && !excludeBtnRegex.test((el.innerText || el.value || '').trim()));

        let matchedBtn =
          realRowControls.find(el => el.matches('button.join, button[class*="join"], button[class*="start"], a[class*="join"]')) ||
          realRowControls.find(el => btnTextRegex.test((el.innerText || el.value || '').trim())) ||
          realRowControls[0] ||
          null;

        // 2순위: 우측 고정 열 분리 테이블 구조인 경우 tbody 내 실제 <button>/<a>만 Y좌표 정렬 매칭
        if (!matchedBtn) {
          rowEl.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rowRect = rowEl.getBoundingClientRect();
          const rowMidY = rowRect.top + rowRect.height / 2;
          const tolerance = Math.max(20, rowRect.height * 0.65);
          const tbodyBtns = Array.from(
            document.querySelectorAll('table tbody button, table tbody a, .fixed-right button, [role="gridcell"] button')
          ).filter(el => {
            if (el.disabled || el.offsetParent === null) return false;
            const txt = (el.innerText || el.value || '').trim();
            return !excludeBtnRegex.test(txt) && (btnTextRegex.test(txt) || el.matches('.join, [class*="start"]'));
          });
          const aligned = tbodyBtns
            .map(btn => {
              const br = btn.getBoundingClientRect();
              return { btn, diffY: Math.abs((br.top + br.height / 2) - rowMidY) };
            })
            .filter(x => x.diffY <= tolerance)
            .sort((a, b) => a.diffY - b.diffY);
          if (aligned[0]) matchedBtn = aligned[0].btn;
        }

        if (matchedBtn) {
          matchedBtn.scrollIntoView({ block: 'center', inline: 'center' });
          matchedBtn.setAttribute('data-kbpi-target-start', '1');
          return {
            found: true,
            hasBtn: true,
            rowText: fullText.slice(0, 160),
            btnText: (matchedBtn.innerText || matchedBtn.value || '시작').trim(),
            btnTag: `${matchedBtn.tagName}.${matchedBtn.className || ''}`,
            directSurveyUrl
          };
        }

        if (compCode === 'COMPLETE' || (/\b완료\b/.test(fullText) && !directSurveyUrl)) {
          return { found: true, hasBtn: false, alreadyDone: true, rowText: fullText.slice(0, 160) };
        }

        if (directSurveyUrl) {
          return {
            found: true,
            hasBtn: false,
            rowText: fullText.slice(0, 160),
            directSurveyUrl
          };
        }
      }

      return { found: false, rowCount: rawRows.length };
    }, {
      targetUid: uid,
      targetFinalId: finalId,
      targetReg: region,
      targetGen: gender,
      targetAg: ageGroup
    });
  };

  const waitGetDataSurveyReady = async (targetPage, timeoutMs = 15000) => {
    await targetPage.waitForFunction(
      () => {
        const txt = (document.body?.innerText || '').trim();
        return txt.length > 0 && txt !== 'Loading..' && !/^Loading\.+$/i.test(txt);
      },
      { timeout: timeoutMs }
    ).catch(err => emitLog(`설문 초기 로딩 대기 경고: ${err.message}`, 'warn'));
  };

  const clickMatchedStartButton = async (matchInfo) => {
    if (matchInfo.alreadyDone && !matchInfo.hasBtn) {
      return { alreadyCompleted: true, page: listPage };
    }

    const beforePagesCount = context.pages().length;
    const beforeUrl = listPage.url();

    if (matchInfo.hasBtn) {
      emitLog(`[슬롯 매칭 완료] "${matchInfo.rowText}" ➔ [${matchInfo.btnText}] (${matchInfo.btnTag}) 클릭!`);
      const popupPromise = context.waitForEvent('page', { timeout: 8500 }).catch(() => null);

      // 가로 스크롤 고정 헤더 간섭 방지를 위해 DOM 네이티브 클릭 우선 수행 (GetData button.join 표준 방식)
      await listPage.evaluate(() => {
        const btn = document.querySelector('[data-kbpi-target-start="1"]');
        if (btn) {
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
        }
      });

      const popupPage = await popupPromise;
      if (popupPage) {
        await popupPage.waitForLoadState('domcontentloaded').catch(err => emitLog(`설문 팝업 로드 경고: ${err.message}`, 'warn'));
        await waitGetDataSurveyReady(popupPage, 15000);
        emitLog(`[설문 새 창 진입 완료] URL: ${popupPage.url()}`);
        return { alreadyCompleted: false, page: popupPage };
      }

      // 만약 모달 확인창이 뜬 경우 승인 클릭 후 팝업 재확인
      const modalConfirmed = await listPage.evaluate(() => {
        const modals = Array.from(
          document.querySelectorAll('[role="dialog"], .modal, .swal2-container, .ant-modal, .layer-popup, .popup')
        ).filter(m => m.offsetParent !== null);
        for (const modal of modals) {
          const confirmBtn = Array.from(modal.querySelectorAll('button, a, input[type="button"]'))
            .find(b => b.offsetParent !== null && /^(확인|예|시작|조사\s*시작|계속|진행)$/.test((b.innerText || b.value || '').trim()));
          if (confirmBtn) {
            confirmBtn.click();
            return (confirmBtn.innerText || confirmBtn.value || '').trim();
          }
        }
        return '';
      }).catch(() => '');

      if (modalConfirmed) {
        emitLog(`[시작 확인 모달 승인] "${modalConfirmed}" 클릭`);
        const popupPage2 = await context.waitForEvent('page', { timeout: 7000 }).catch(() => null);
        if (popupPage2) {
          await popupPage2.waitForLoadState('domcontentloaded').catch(err => emitLog(`설문 팝업 로드 경고: ${err.message}`, 'warn'));
          await waitGetDataSurveyReady(popupPage2, 15000);
          emitLog(`[설문 새 창 진입 완료] URL: ${popupPage2.url()}`);
          return { alreadyCompleted: false, page: popupPage2 };
        }
      }

      const currentPages = context.pages();
      if (currentPages.length > beforePagesCount) {
        const latestPg = currentPages[currentPages.length - 1];
        await waitGetDataSurveyReady(latestPg, 15000);
        return { alreadyCompleted: false, page: latestPg };
      }
      if (listPage.url() !== beforeUrl) {
        await waitGetDataSurveyReady(listPage, 15000);
        return { alreadyCompleted: false, page: listPage };
      }
    }

    // 백업: GetData 세션 직접 설문 URL(ACCESS_KEY + UID)로 새 탭 진입
    if (matchInfo.directSurveyUrl) {
      emitLog(`[GetData 직접 설문 URL 진입] ${matchInfo.directSurveyUrl}`);
      const directPage = await context.newPage();
      await directPage.goto(matchInfo.directSurveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await waitGetDataSurveyReady(directPage, 20000);
      return { alreadyCompleted: false, page: directPage };
    }

    return null;
  };

  // Pass 1: 현재 페이지 스캔 + GetData 숫자형 페이지네이션(data-page="2"..) 순회
  const visitedPages = new Set([1]);
  for (let pageAttempt = 0; pageAttempt < 16; pageAttempt++) {
    const matchInfo = await scanCurrentDomForSlot();
    if (matchInfo.found) {
      const started = await clickMatchedStartButton(matchInfo);
      if (started) return started;
    }

    const nextPageAction = await listPage.evaluate(({ seenPages }) => {
      document.querySelectorAll('[data-kbpi-next-page]').forEach(el => el.removeAttribute('data-kbpi-next-page'));

      // 1) GetData 표준 숫자 페이지 링크 (.pagination .page-link[data-page], .paging a[data-page])
      const dataPageLinks = Array.from(
        document.querySelectorAll('.pagination .page-link[data-page], .paging a[data-page], a[data-page], button[data-page]')
      )
        .map(el => ({ el, pg: Number(el.getAttribute('data-page')) }))
        .filter(x => Number.isFinite(x.pg) && x.pg > 1 && !seenPages.includes(x.pg))
        .sort((a, b) => a.pg - b.pg);

      if (dataPageLinks[0]) {
        dataPageLinks[0].el.setAttribute('data-kbpi-next-page', '1');
        return { hasNext: true, nextPgNum: dataPageLinks[0].pg };
      }

      // 2) 일반 다음(>, ›, 다음) 페이지 버튼
      const nextPg = Array.from(document.querySelectorAll('.pagination a, .paging a, nav a, nav button, a, button'))
        .find(el => {
          const t = (el.innerText || '').trim();
          return el.offsetParent !== null && /^(다음|>|›|»)$/.test(t) && !el.disabled && !el.classList.contains('disabled');
        });
      if (nextPg) {
        nextPg.setAttribute('data-kbpi-next-page', '1');
        return { hasNext: true, nextPgNum: seenPages.length + 1 };
      }
      return { hasNext: false };
    }, { seenPages: Array.from(visitedPages) });

    if (nextPageAction.hasNext) {
      visitedPages.add(nextPageAction.nextPgNum);
      await listPage.evaluate(() => {
        const el = document.querySelector('[data-kbpi-next-page="1"]');
        if (el) el.click();
      });
      await listPage.waitForTimeout(1400);
    } else {
      break;
    }
  }

  // 실패 시 원인 즉시 파악을 위한 현재 화면 진단 스냅샷 로깅
  const diag = await listPage.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
      .map(el => (el.innerText || '').trim())
      .filter(Boolean)
      .slice(0, 18);
    const sampleRows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'))
      .slice(0, 4)
      .map(r => (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140));
    return {
      url: location.href,
      title: document.title,
      headers,
      sampleRows,
      bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260)
    };
  }).catch(err => ({ url: listPage.url(), err: err.message }));

  emitLog(
    `[슬롯 탐색 진단] URL=${diag.url} | 헤더=[${(diag.headers || []).join(', ')}] | 샘플행=${JSON.stringify(diag.sampleRows || [])} | 본문="${diag.bodyPreview || ''}"`,
    'warn',
    'SLOT_DIAG'
  );

  throw new Error(`CAPI 리스트에서 고유번호(${uid}) / 최종id(${finalId}) 슬롯을 찾을 수 없습니다. (현재 URL: ${diag.url || listPage.url()})`);
}

/**
 * 설문이 메인 문서가 아닌 iframe 내부에서 렌더링되는 경우 해당 Frame을 반환
 */
async function resolveActiveSurveyFrame(page) {
  const frames = page.frames();
  if (frames.length <= 1) return page;
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    const hasSurveyDom = await frame.evaluate(() => {
      const txt = (document.body?.innerText || '').trim();
      return txt.length > 15 && (/GP1|응답자\s*확인|다음|브랜드|\bSQ\s*1\b/i.test(txt) || document.querySelectorAll('input, select, button').length > 0);
    }).catch(() => false);
    if (hasSurveyDom) return frame;
  }
  return page;
}

/**
 * 현재 설문 화면의 단계 유형과 출제 산업군명(예: '생수', '음식물처리기')을 정밀 분류 (Survey 230 전 문항 100% 대응)
 */
async function classifyCurrentScreen(target) {
  return target.evaluate(() => {
    const bodyText = (document.body?.innerText || '').trim();

    // GetData 비동기 전환 초기 Loading.. 상태 감지
    if (!bodyText || /^Loading\.{0,5}$/i.test(bodyText)) {
      return { screenType: 'LOADING', categoryName: '', progressPct: null, buttonTexts: [] };
    }

    const buttonTexts = Array.from(document.querySelectorAll('#next, button, input[type="button"], input[type="submit"], a'))
      .filter(el => el.offsetParent !== null)
      .map(el => (el.innerText || el.value || '').replace(/\s+/g, ' ').trim())
      .filter(t => t && t.length <= 24)
      .slice(0, 10);

    // 아직 CAPI 슬롯 리스트 화면에 머물러 있는 경우 명시적 분류
    if ((/실사코드/.test(bodyText) && /최종\s*id/i.test(bodyText)) || /진행\s*대상\s*리스트/.test(bodyText)) {
      return {
        screenType: 'CAPI_LIST_PENDING',
        categoryName: '',
        progressPct: null,
        buttonTexts,
        bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 220)
      };
    }

    let categoryName = '';
    const bracketMatch = bodyText.match(/【\s*([^】]+?)\s*】/);
    const quoteBrandMatch = bodyText.match(/[‘'"]\s*([^’'"]+?)\s*브랜드\s*[’'"]\s*에\s*대한\s*내용/);
    if (bracketMatch) {
      categoryName = bracketMatch[1].trim();
    } else if (quoteBrandMatch) {
      categoryName = quoteBrandMatch[1].trim();
    }

    const pctMatch = bodyText.match(/(\d{1,3})\s*%/);
    const progressPct = pctMatch ? Number(pctMatch[1]) : null;
    const bodySnippet = bodyText.replace(/\s+/g, ' ').slice(0, 220);

    const visibleQNameEls = Array.from(
      document.querySelectorAll('[question-name], [question-type]')
    ).filter(el => el.offsetParent !== null);
    const visibleQNames = Array.from(new Set(
      visibleQNameEls
        .map(el => (el.getAttribute('question-name') || el.getAttribute('qname') || '').trim())
        .filter(Boolean)
    ));

    const qTypeEl = visibleQNameEls[visibleQNameEls.length - 1] || document.querySelector('[question-type]');
    const qNameAttr = visibleQNames[0] ||
      (qTypeEl ? (qTypeEl.getAttribute('question-name') || qTypeEl.getAttribute('qname') || '') : '');
    const indMatch = (visibleQNames.find(n => /--\d+$/.test(n)) || qNameAttr).match(/--(\d+)$/);
    const industryKey = indMatch ? indMatch[1] : '';

    if (!categoryName && industryKey && window.QO?.INDUSTRY?.ANSWERS) {
      const indItem = (window.QO.INDUSTRY.ANSWERS || []).find(x => String(x.K) === industryKey);
      if (indItem) {
        categoryName = String(indItem.DISPLAY || indItem.V || '').replace(/브랜드$/g, '').trim();
      }
    }

    const visibleControlCount = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea, .s-gradeclick')
    ).filter(el => el.offsetParent !== null).length;
    const domMeta = `qNames=[${visibleQNames.join(',')}],qType=${qTypeEl?.getAttribute('question-type') || '-'},grade=${document.querySelectorAll('.s-gradeclick').length},sel=${document.querySelectorAll('select').length},rad=${document.querySelectorAll('input[type="radio"]').length},cb=${document.querySelectorAll('input[type="checkbox"]').length},txt=${document.querySelectorAll('input[type="text"],input[type="number"],textarea').length}`;

    const baseRet = { qNameAttr, visibleQNames, industryKey, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };

    // 스크리닝 탈락 / 쿼터 초과 화면 감지
    if (visibleQNames.some(q => /^(OUT|TXT_OUT|OVER|TXT_OVER|BAD|TXT_BAD)/i.test(q))) {
      return { screenType: 'SCREENED_OUT', ...baseRet };
    }

    // 설문 완료 화면 감지 (TXT_COMPLETE / COMPLETE)
    if (
      visibleQNames.some(q => /^(TXT_COMPLETE|COMPLETE\d*$)/i.test(q)) ||
      (/설문이\s*종료|조사가\s*완료|끝까지\s*응답해\s*주셔서\s*대단히\s*감사|응답해\s*주셔서\s*감사|참여해\s*주셔서\s*대단히\s*감사|수고하셨습니다/.test(bodyText) &&
        visibleControlCount === 0 &&
        !document.querySelector('#next'))
    ) {
      return { screenType: 'COMPLETED', ...baseRet };
    }

    // 0) 초기 안내문(TITLE + DESC)
    if (visibleQNames.includes('DESC') || visibleQNames.includes('TITLE')) {
      return { screenType: 'INTRO_DESC', ...baseRet };
    }

    // 1) GP1 위치 확인
    if (visibleQNames.includes('GP1') || (/GP1/.test(bodyText) && /현재\s*위치를\s*확인/.test(bodyText))) {
      return { screenType: 'GP1', ...baseRet };
    }

    // 2) WOKERD_DUP 응답자 신상명세 확인
    if (visibleQNames.includes('WOKERD_DUP') || document.querySelector('.worker-info-card') || (/응답자\s*확인/.test(bodyText) && /연령\s*\(\s*만\s*\)/.test(bodyText))) {
      return { screenType: 'PROFILE', ...baseRet };
    }

    // 3) SQ1 / SQ2 / SQ3 / M_CHECK
    if (visibleQNames.includes('SQ1')) return { screenType: 'SQ1', ...baseRet };
    if (visibleQNames.includes('SQ2')) return { screenType: 'SQ2_AGE', ...baseRet };
    if (visibleQNames.includes('SQ3')) return { screenType: 'SQ3_GENDER', ...baseRet };
    if (visibleQNames.includes('M_CHECK') || document.querySelector('[question-name="M_CHECK"] select')) {
      return { screenType: 'M_CHECK_REGION', ...baseRet };
    }
    if (document.querySelector('[question-name="INDUSTRY_ORDER"]') && visibleQNames.length === 0) {
      return { screenType: 'ALLOCATING_INDUSTRIES', ...baseRet };
    }

    // 4) 본 설문 산업군별 문항 (KBPI_Q1 ~ KBPI_Q8 및 특수 진단 블록)
    if (visibleQNames.some(q => /^KBPI_Q1_\d+--/i.test(q))) return { screenType: 'Q1_UNAIDED', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q2--/i.test(q))) return { screenType: 'Q2_AIDED', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q3--/i.test(q))) return { screenType: 'Q3_MATRIX', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q4--/i.test(q))) return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q41--/i.test(q))) return { screenType: 'Q4_1_FACTOR', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q41_CHANNEL--/i.test(q))) return { screenType: 'Q4_1_CHANNEL', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q42--/i.test(q))) return { screenType: 'Q4_2_DETERGENT', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q5--/i.test(q))) return { screenType: 'Q5_SAME_AS_Q4', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q6--/i.test(q))) return { screenType: 'Q6_YES_NO', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q7--/i.test(q))) return { screenType: 'Q7_RANK_1_2', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q8--/i.test(q))) return { screenType: 'Q8_RANK_1_2', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_NGO/i.test(q))) return { screenType: 'KBPI_NGO_SPECIAL', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_DIAG_/i.test(q))) return { screenType: 'KBPI_DIAG_SPECIAL', ...baseRet };

    // 5) 후반부 의견 및 배경변인 (3.1 DQ1 / 3.2 ZQ1~ZQ5_2 / 3.3 ZQ6 패널가입)
    if (visibleQNames.includes('DQ1')) return { screenType: 'DQ1_INFO_SOURCE', ...baseRet };
    if (visibleQNames.some(q => /^ZQ([1-5]|5_1|5_2)$/i.test(q))) return { screenType: 'ZQ_DEMOGRAPHICS', ...baseRet };
    if (visibleQNames.some(q => /^ZQ6(_1)?$/i.test(q)) || /한국능률협회컨설팅\s*패널로\s*가입/.test(bodyText)) {
      return { screenType: 'ZQ6_PANEL_INTENT', ...baseRet };
    }

    // 6) 텍스트·배지 폴백 (문항 코드가 변형된 경우 대비)
    if (!categoryName && (/\bSQ\s*1\b/i.test(bodyText) || /광고회사나\s*조사회사/.test(bodyText))) {
      return { screenType: 'SQ1', ...baseRet };
    }
    if (/1-1/.test(bodyText) && /가장\s*먼저\s*생각나는\s*브랜드/.test(bodyText)) {
      return { screenType: 'Q1_UNAIDED', ...baseRet };
    }
    if (/알고\s*계시는\s*브랜드를\s*모두/.test(bodyText)) {
      return { screenType: 'Q2_AIDED', ...baseRet };
    }
    if (/1점\s*~\s*5점으로\s*평가/.test(bodyText) || /전반적으로\s*만족한다/.test(bodyText)) {
      return { screenType: 'Q3_MATRIX', ...baseRet };
    }
    if (/고려하신\s*가장\s*중요한\s*요인/.test(bodyText)) {
      return { screenType: 'Q4_1_FACTOR', ...baseRet };
    }
    if (/어느\s*채널\s*\(\s*경로\s*\)\s*을?\s*통해서/.test(bodyText)) {
      return { screenType: 'Q4_1_CHANNEL', ...baseRet };
    }
    if (/가장\s*최근에[^\n]{0,35}(구입|이용|방문|사용)/.test(bodyText)) {
      return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
    }

    let firstBadge = '';
    if (categoryName) {
      const badgeTexts = Array.from(document.querySelectorAll('div, span, th, td, strong'))
        .filter(el => el.children.length === 0 && el.offsetParent !== null)
        .map(el => (el.innerText || '').trim())
        .filter(t => /^(4|5|6|7|8)$/.test(t));
      firstBadge = badgeTexts[0] || '';

      if (firstBadge === '4') return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
      if (firstBadge === '5' || /주\s*구입|가장\s*선호|주로\s*이용|가장\s*자주/.test(bodyText)) return { screenType: 'Q5_SAME_AS_Q4', ...baseRet };
      if (firstBadge === '6') return { screenType: 'Q6_YES_NO', ...baseRet };
      if (firstBadge === '7') return { screenType: 'Q7_RANK_1_2', ...baseRet };
      if (firstBadge === '8') return { screenType: 'Q8_RANK_1_2', ...baseRet };
    }

    const hasFinalBtn = Array.from(document.querySelectorAll('#next, button, input[type="button"], input[type="submit"], a'))
      .some(el => /조사\s*완료|설문\s*완료|최종\s*제출|완료하기|설문\s*종료/.test((el.innerText || el.value || '').trim()));
    const isEndOutroScreen = /^(END|OUTRO|FINISH|COMPLETE|LAST|SIGN|AGREE)/i.test(qNameAttr) ||
      /설문을?\s*마치|응답을?\s*완료하시려면|설문이\s*모두\s*끝났|개인정보\s*수집.*동의/.test(bodyText);
    if (hasFinalBtn || isEndOutroScreen) {
      return { screenType: 'FINAL_SUBMIT_GATE', ...baseRet };
    }

    return {
      screenType: 'GENERIC_STEP',
      badge: firstBadge,
      ...baseRet
    };
  });
}

/**
 * GetData 내장 상태(PD('INDUSTRY_ORDER') / A.PREV_DATA.INDUSTRY_ORDER / AO.INDUSTRY_ORDER + QO.INDUSTRY.ANSWERS)에서
 * 해당 응답자에게 배정된 전체 18~20개 브랜드(산업군) 순서를 일괄 추출
 */
async function extractAssignedIndustriesFromPage(target) {
  return target.evaluate(() => {
    try {
      let orderStr = '';
      if (typeof window.PD === 'function') {
        const pdObj = window.PD('INDUSTRY_ORDER');
        if (pdObj && pdObj.TEXT_1) orderStr = String(pdObj.TEXT_1);
      }
      if (!orderStr && window.A?.PREV_DATA?.INDUSTRY_ORDER?.TEXT_1) {
        orderStr = String(window.A.PREV_DATA.INDUSTRY_ORDER.TEXT_1);
      }
      if (!orderStr && window.AO?.INDUSTRY_ORDER?.TEXT_1) {
        orderStr = String(window.AO.INDUSTRY_ORDER.TEXT_1);
      }
      if (!orderStr && typeof window.Replacer === 'function') {
        const rep = String(window.Replacer('[KEY:INDUSTRY_ORDER/TEXT_1]') || '');
        if (rep && !rep.includes('KEY:INDUSTRY_ORDER')) orderStr = rep;
      }
      if (!orderStr) {
        const inp = document.querySelector('[question-name="INDUSTRY_ORDER"] input[data-column="TEXT_1"]');
        if (inp && inp.value) orderStr = String(inp.value);
      }

      const rawKeys = orderStr.split(',').map(s => s.trim()).filter(Boolean);
      const answers = Array.isArray(window.QO?.INDUSTRY?.ANSWERS) ? window.QO.INDUSTRY.ANSWERS : [];
      const byKey = new Map(answers.map(a => [String(a.K), a]));

      const assigned = [];
      for (const k of rawKeys) {
        const item = byKey.get(String(k));
        const rawTitle = item
          ? String(item.DISPLAY || item.INDUSTRY || item.V || k)
          : String(k);
        const cleanTitle = rawTitle.replace(/브랜드$/g, '').trim();
        if (cleanTitle) {
          assigned.push({
            industryKey: String(k),
            categoryName: cleanTitle,
            special: String(item?.SPECIAL || '')
          });
        }
      }
      return assigned;
    } catch (err) {
      return [];
    }
  }).catch(err => {
    console.warn('[K-BPI 배정 산업군 추출 경고]', err.message);
    return [];
  });
}

function mergeAssignedIndustriesIntoConfigs({
  assigned = [],
  categoryConfigs = [],
  ageGroup = '',
  age = 30,
  gender = '',
  policy = {}
} = {}) {
  if (!Array.isArray(assigned) || assigned.length === 0) return categoryConfigs;

  const prevByCat = new Map();
  for (const c of (categoryConfigs || [])) {
    const cn = String(c?.categoryName || '').replace(/브랜드$/g, '').trim();
    if (cn) prevByCat.set(cn, c);
  }

  const nextConfigs = assigned.map((item, idx) => {
    const prevMatch = prevByCat.get(item.categoryName) || categoryConfigs[idx] || {};
    let exp = String(prevMatch.purchaseExp || '').trim();
    if (exp !== '있음' && exp !== '없음') {
      exp = recommendDefaultPurchaseExp({
        categoryName: item.categoryName,
        ageGroup,
        age,
        gender,
        teenAutoNone: policy.teenAutoNoneUnfitCategories !== false
      });
    }
    return {
      slot: idx + 1,
      industryKey: item.industryKey || prevMatch.industryKey || '',
      categoryName: item.categoryName,
      purchaseExp: exp,
      topBrand: prevMatch.topBrand || '',
      channel: prevMatch.channel || ''
    };
  });

  categoryConfigs.splice(0, categoryConfigs.length, ...nextConfigs);
  return categoryConfigs;
}

async function clickNextButton(target) {
  const clicked = await target.evaluate(() => {
    const gdNext = document.querySelector('#next');
    if (gdNext && gdNext.offsetParent !== null && !gdNext.disabled) {
      gdNext.click();
      return (gdNext.innerText || gdNext.value || '다음').trim();
    }

    const nextRegex = /^(다음|다음으로|다음\s*단계|응답자\s*확인|확인|저장\s*후\s*다음|설문\s*시작|조사\s*시작|시작하기|동의|동의합니다|동의\s*후\s*시작)$/;
    const primaryCandidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const primaryBtn = primaryCandidates.find(el => {
      const txt = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
      return el.offsetParent !== null && !el.disabled && nextRegex.test(txt);
    });
    if (primaryBtn) {
      primaryBtn.click();
      return (primaryBtn.innerText || primaryBtn.value || '').trim();
    }
    const fallbackBtn = Array.from(document.querySelectorAll('div, span')).find(el => {
      const txt = (el.innerText || '').trim();
      return el.offsetParent !== null && el.children.length === 0 && nextRegex.test(txt);
    });
    if (fallbackBtn) {
      fallbackBtn.click();
      return (fallbackBtn.innerText || '').trim();
    }
    return '';
  });
  return clicked;
}

export async function runKmacKbpiSurvey({
  campaign = null,
  slotData = {},
  policy: rawPolicy = {},
  quotaIndex = 1,
  pilotMode = false,
  safetyGuard = true,
  stopAtStepOverride = null,
  sharedSession = null,
  captureHtmlDumpPath = null,
  onProgress = null
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_POLICY,
    ...(campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {}),
    ...(rawPolicy || {})
  };

  const stopAtStep = stopAtStepOverride || (pilotMode ? (policy.pilotStopAtStep || 'Q4') : (safetyGuard ? 'FINAL_GATE' : 'NONE'));
  const loginId = String(campaign?.loginId || slotData.loginId || KBPI_DEFAULT_LOGIN_ID).trim();
  const loginPw = String(campaign?.loginPw || loginId).trim();
  const seq = Number(slotData.seq || slotData.index || quotaIndex || 1);
  const uid = String(slotData.uid || '').trim();
  const finalId = String(slotData.finalId || '').trim();
  const region = String(slotData.region || '서울').trim();
  const gender = String(slotData.gender || slotData.ceoGender || '남').trim();
  const ageGroup = String(slotData.ageGroup || '20대').trim();
  const age = Number(slotData.age || slotData.ceoAge || 25);
  const respondentName = String(slotData.name || slotData.ceoName || '').trim();
  const phone = String(slotData.phone || '').trim();

  const demoEnriched = enrichKbpiRespondentDemographics({
    ...slotData,
    seq,
    finalId,
    region,
    gender,
    age,
    ageGroup
  });
  const distInfo = computeKbpiDistrictDong(region, finalId, seq);
  const surveyDistrict = String(slotData.surveyDistrict || demoEnriched.surveyDistrict || distInfo.surveyDistrict).trim();
  const surveyDong = String(slotData.surveyDong || demoEnriched.surveyDong || distInfo.surveyDong).trim();
  const cityCode = distInfo.cityCode;

  const gps = (slotData.latitude && slotData.longitude)
    ? { baseLabel: slotData.gpsLabel || (region.includes('인천') ? '인천광역시청' : '서울 노원구청'), latitude: Number(slotData.latitude), longitude: Number(slotData.longitude) }
    : computeKbpiGps(region, finalId, seq);

  const categoryConfigs = normalizeCategoryConfigs(slotData.categoryConfigs || [], 20);
  const rng = makeSeededRng(`${uid}_${finalId}_${seq}_${respondentName}`);

  const emitLog = (message, level = 'info', step = '진행') => {
    if (typeof onProgress === 'function') {
      onProgress({ step, message, level });
    }
  };

  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';
  let browser = null;
  let openedSurveyTab = null;
  const ownsBrowser = !sharedSession;
  const alertHistory = [];
  const seenCategoriesOrder = [];
  let assignedIndustriesSynced = false;

  const htmlInspectionDump = captureHtmlDumpPath
    ? {
        extractedAt: new Date().toISOString(),
        respondent: { seq, uid, finalId, name: respondentName, region, gender, ageGroup, age },
        networkJoinPayloads: [],
        windowSchema: null,
        screens: [],
        seenCategories: [],
        alertHistory: [],
        finalOutcome: null
      }
    : null;
  const seenHtmlTemplateKeys = new Set();

  try {
    let context = sharedSession?.context || null;
    let listPage = sharedSession?.listPage || null;

    if (ownsBrowser) {
      browser = await launchChromium({
        headless: true,
        args: ['--ignore-certificate-errors'],
        ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
      });

      context = await browser.newContext({
        viewport: { width: 1360, height: 920 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        geolocation: {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: 14
        },
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true
      });

      await context.addInitScript(({ lat, lng }) => {
        const mockPos = {
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: 14,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        };
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition = (success) => {
            setTimeout(() => success(mockPos), 120);
          };
          navigator.geolocation.watchPosition = (success) => {
            setTimeout(() => success(mockPos), 120);
            return 1;
          };
        }
      }, { lat: gps.latitude, lng: gps.longitude });

      if (htmlInspectionDump) {
        context.on('response', async (resp) => {
          try {
            const rUrl = resp.url() || '';
            if (!/\/Join\/|\/Survey\/|SNUM=230/i.test(rUrl)) return;
            const ct = (resp.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json') && !/\/Join\/(Init|Next|Start|Load|GetData)/i.test(rUrl)) return;
            if (htmlInspectionDump.networkJoinPayloads.length >= 120) return;
            const bodyTxt = await resp.text();
            if (bodyTxt && bodyTxt.length <= 2500000) {
              let parsed = null;
              try { parsed = JSON.parse(bodyTxt); } catch (e) { parsed = bodyTxt.slice(0, 20000); }
              htmlInspectionDump.networkJoinPayloads.push({
                url: rUrl,
                status: resp.status(),
                data: parsed
              });
            }
          } catch (respErr) {
            console.warn('[K-BPI HTML 분석 응답 캡처 경고]', respErr.message);
          }
        });
      }

      const rootPage = await context.newPage();
      const attachDialogHandler = (pg) => {
        pg.on('dialog', async (dialog) => {
          const msg = dialog.message() || '';
          alertHistory.push(msg);
          emitLog(`[설문 알림] 🔔 "${msg}"`, 'warn', 'ALERT');
          try {
            await dialog.accept();
          } catch (err) {
            emitLog(`알림 수락 경고: ${err.message}`, 'warn', 'ALERT');
          }
        });
      };
      attachDialogHandler(rootPage);
      context.on('page', (newPg) => attachDialogHandler(newPg));

      listPage = await loginAndEnterKbpiCapiList({
        context,
        page: rootPage,
        loginId,
        loginPw,
        emitLog: (m, lv) => emitLog(m, lv, 'LOGIN')
      });
    } else {
      // 공유 세션 모드: 응답자별 고유 GPS 좌표를 즉시 갱신
      await context.setGeolocation({
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: 14
      });
    }

    // 2. 대상 응답자 슬롯 매칭 및 [시작] 클릭
    const slotEntry = await findAndStartRespondentSlot({
      context,
      listPage,
      slotData,
      emitLog: (m, lv) => emitLog(m, lv, 'SLOT')
    });

    if (slotEntry.alreadyCompleted) {
      emitLog(`[이미 완료된 슬롯] #${seq} ${respondentName} (${uid})는 CAPI 서버상 이미 완료 상태입니다.`, 'info', 'DONE');
      return {
        success: true,
        alreadyCompleted: true,
        statusLabel: '완료',
        quotaStatus: 'completed',
        categoryConfigs,
        gps,
        surveyDistrict,
        surveyDong
      };
    }

    let surveyPage = slotEntry.page;
    if (surveyPage !== listPage) {
      openedSurveyTab = surveyPage;
    }
    // 응답자 탭 내부 navigator.geolocation 2중 보강 (공유 세션에서도 개별 좌표 보장)
    await surveyPage.evaluate(({ lat, lng }) => {
      const mockPos = {
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 14,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = (success) => {
          setTimeout(() => success(mockPos), 90);
        };
        navigator.geolocation.watchPosition = (success) => {
          setTimeout(() => success(mockPos), 90);
          return 1;
        };
      }
    }, { lat: gps.latitude, lng: gps.longitude }).catch(err => console.warn('[K-BPI 탭 GPS 보강 경고]', err.message));

    await surveyPage.waitForTimeout(1100);

    const categoryRuntimeMap = new Map();

    const syncAssignedIndustriesOnce = async (targetFrame) => {
      if (assignedIndustriesSynced) return;
      const assigned = await extractAssignedIndustriesFromPage(targetFrame);
      if (assigned.length > 0) {
        mergeAssignedIndustriesIntoConfigs({
          assigned,
          categoryConfigs,
          ageGroup,
          age,
          gender,
          policy
        });
        assignedIndustriesSynced = true;
        emitLog(
          `[배정 브랜드 전수 스캔 완료] 총 ${assigned.length}개 품목 확인: [${assigned.map((a, i) => `${i + 1}.${a.categoryName}(${categoryConfigs[i]?.purchaseExp || '있음'})`).join(', ')}]`,
          'info',
          'SCAN'
        );
      }
    };

    const getOrInitCategoryState = async (catNameRaw, indKeyRaw = '', targetFrame = null) => {
      const cleanCat = String(catNameRaw || '').replace(/브랜드$/g, '').trim() || `품목${seenCategoriesOrder.length + 1}`;
      if (!categoryRuntimeMap.has(cleanCat)) {
        const frameToQuery = targetFrame || surveyPage;
        if (frameToQuery) {
          await syncAssignedIndustriesOnce(frameToQuery);
        }

        const catIdx = seenCategoriesOrder.length;
        seenCategoriesOrder.push(cleanCat);

        let liveOfficialBrands = [];
        if (frameToQuery) {
          liveOfficialBrands = await frameToQuery.evaluate(({ iKey, cName }) => {
            const answers = window.QO?.INDUSTRY?.ANSWERS;
            if (!Array.isArray(answers) || answers.length === 0) return [];
            const norm = (s) => String(s || '').replace(/브랜드$/g, '').replace(/\s+/g, '').toLowerCase();
            const targetNorm = norm(cName);
            const found = (iKey && answers.find(x => String(x.K) === String(iKey))) ||
              answers.find(x => norm(x.DISPLAY || x.V) === targetNorm);
            if (!found) return [];
            const list = [];
            for (let b = 1; b <= 58; b++) {
              const val = String(found['B' + b] || '').trim();
              if (val && val !== '없음' && !list.includes(val)) {
                list.push(val);
              }
            }
            return list;
          }, { iKey: String(indKeyRaw || ''), cName: cleanCat }).catch(err => {
            console.warn('[K-BPI QO 브랜드 조회 경고]', err.message);
            return [];
          });
        }

        const meta = await resolveCategoryMeta(cleanCat, policy);
        if (liveOfficialBrands.length >= 3) {
          saveLearnedCategoryBrands(cleanCat, liveOfficialBrands);
        }
        const brandSource = liveOfficialBrands.length >= 3 ? liveOfficialBrands : meta.brands;
        const shuffledBrands = shuffleWithRng(brandSource, rng);
        const shuffledAdjs = shuffleWithRng(meta.adjectives, rng);
        const shuffledChannels = shuffleWithRng(meta.channels, rng);
        const shuffledPosReasons = shuffleWithRng(Q3_RECOMMEND_REASON_POOLS.positive, rng);
        const shuffledNeuReasons = shuffleWithRng(Q3_RECOMMEND_REASON_POOLS.neutral, rng);

        const purchaseExp = decideCategoryPurchaseExp({
          categoryName: cleanCat,
          categorySlotIdx: catIdx,
          categoryConfigs,
          ageGroup,
          age,
          gender,
          policy,
          rng
        });

        const aiSearched = (rng() * 100) >= Number(policy.q6NoRate ?? 80);

        const existingSlotIdx = categoryConfigs.findIndex(c => {
          const cn = String(c?.categoryName || '').replace(/브랜드$/g, '').trim();
          return cn && cn === cleanCat;
        });
        const targetCfgIdx = existingSlotIdx >= 0 ? existingSlotIdx : catIdx;
        while (categoryConfigs.length <= targetCfgIdx) {
          categoryConfigs.push({ slot: categoryConfigs.length + 1, categoryName: '', purchaseExp: '' });
        }
        categoryConfigs[targetCfgIdx].slot = targetCfgIdx + 1;
        categoryConfigs[targetCfgIdx].categoryName = cleanCat;
        categoryConfigs[targetCfgIdx].purchaseExp = purchaseExp;
        categoryConfigs[targetCfgIdx].topBrand = purchaseExp === '없음' ? '없음' : shuffledBrands[0];
        categoryConfigs[targetCfgIdx].channel = purchaseExp === '없음' ? '' : shuffledChannels[0];

        categoryRuntimeMap.set(cleanCat, {
          slotIndex: targetCfgIdx,
          categoryName: cleanCat,
          industryKey: String(indKeyRaw || ''),
          purchaseExp,
          aiSearched,
          unaidedBrands: shuffledBrands.slice(0, 4),
          adjectives: shuffledAdjs,
          posReasons: shuffledPosReasons,
          neuReasons: shuffledNeuReasons,
          selectedChannel: shuffledChannels[0],
          q4SelectedBrand: purchaseExp === '없음' ? '없음' : shuffledBrands[0]
        });

        emitLog(
          `[품목 #${targetCfgIdx + 1} 감지: ${cleanCat}${liveOfficialBrands.length >= 3 ? ` (공식B:${liveOfficialBrands.length}개)` : ''}] 구입경험="${purchaseExp}" | AI검색="${aiSearched ? '예' : '아니오'}" | 상기=[${shuffledBrands.slice(0, 3).join(', ')}]${purchaseExp === '있음' ? ` | 채널="${shuffledChannels[0]}"` : ''}`,
          'info',
          `CAT${targetCfgIdx + 1}`
        );
      }
      return categoryRuntimeMap.get(cleanCat);
    };

    // 3. 단계별 설문 진행 루프 (20개 산업군 완주 대응 450회 상한)
    let sameScreenStuckCount = 0;
    let lastSignature = '';

    for (let stepIter = 0; stepIter < 450; stepIter++) {
      await surveyPage.waitForTimeout(650);

      const allOpenPages = context.pages().filter(p => p !== listPage && p.url() && p.url() !== 'about:blank');
      if (allOpenPages.length > 0 && allOpenPages[allOpenPages.length - 1] !== surveyPage) {
        surveyPage = allOpenPages[allOpenPages.length - 1];
        openedSurveyTab = surveyPage;
      }

      const activeTarget = await resolveActiveSurveyFrame(surveyPage);

      const modalAlertMsg = await activeTarget.evaluate(() => {
        const modals = Array.from(
          document.querySelectorAll('.bootbox.modal, .modal.in, .modal.show, .swal2-container, .ui-dialog')
        ).filter(m => m.offsetParent !== null);
        for (const m of modals) {
          const msg = (m.innerText || '').replace(/\s+/g, ' ').trim();
          const okBtn = Array.from(m.querySelectorAll('button, a, input[type="button"]'))
            .find(b => b.offsetParent !== null && /^(확인|닫기|OK|예)$/i.test((b.innerText || b.value || '').trim()));
          if (okBtn) {
            okBtn.click();
            return msg.slice(0, 140);
          }
        }
        return '';
      }).catch(err => {
        console.warn('[K-BPI 모달 감지 경고]', err.message);
        return '';
      });
      if (modalAlertMsg) {
        alertHistory.push(modalAlertMsg);
        emitLog(`[레이어 알림 감지] 🔔 "${modalAlertMsg}"`, 'warn', 'MODAL_ALERT');
        await surveyPage.waitForTimeout(350);
      }

      const info = await classifyCurrentScreen(activeTarget);
      if (info.screenType === 'LOADING') {
        await surveyPage.waitForTimeout(550);
        continue;
      }
      const sig = `${info.screenType}|${info.qNameAttr || ''}|${info.categoryName}|${info.progressPct}`;
      if (sig === lastSignature) {
        sameScreenStuckCount++;
        if (sameScreenStuckCount >= 5) {
          if (htmlInspectionDump) {
            const stuckDom = await activeTarget.evaluate(() => {
              const visQs = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null);
              const container = visQs[visQs.length - 1] || document.querySelector('#question, .question-wrap, main') || document.body;
              return {
                url: location.href,
                fullText: (document.body?.innerText || '').slice(0, 4000),
                outerHTML: (container?.outerHTML || '').slice(0, 45000)
              };
            }).catch(e => ({ err: e.message }));
            htmlInspectionDump.screens.push({
              stepIter,
              stalled: true,
              screenType: info.screenType,
              qNameAttr: info.qNameAttr,
              categoryName: info.categoryName,
              progressPct: info.progressPct,
              domMeta: info.domMeta,
              ...stuckDom
            });
          }
          throw new Error(
            `동일 화면 반복 정체 감지 (${sig}) | DOM=[${info.domMeta || '-'}] | URL=${surveyPage.url()} | 버튼=[${(info.buttonTexts || []).join(', ')}] | 요약="${(info.bodySnippet || '').slice(0, 150)}" — 최근 알림: ${alertHistory.slice(-2).join(' / ') || '없음'}`
          );
        }
      } else {
        sameScreenStuckCount = 0;
        lastSignature = sig;
        emitLog(
          `[화면 진입] ${info.screenType}${info.categoryName ? ` (${info.categoryName})` : ''}${info.qNameAttr ? ` [${info.qNameAttr}]` : ''} | 진행률=${info.progressPct ?? '-'}% | [${info.domMeta || '-'}]`,
          'info',
          'STEP'
        );

        if (htmlInspectionDump) {
          if (!htmlInspectionDump.windowSchema && info.screenType !== 'CAPI_LIST_PENDING') {
            htmlInspectionDump.windowSchema = await activeTarget.evaluate(() => {
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              const baseKeys = new Set(Object.keys(iframe.contentWindow || {}));
              iframe.remove();

              const customKeys = Object.keys(window).filter(k =>
                !baseKeys.has(k) && !/^(\$|jQuery|webkit|moz|__)/i.test(k)
              );
              const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
              const snapshot = { customWindowKeys: customKeys, scriptSrcs, values: {} };
              const priorityKeys = ['Survey', 'Questions', 'Q', 'QO'].filter(k => customKeys.includes(k));
              for (const k of [...priorityKeys, ...customKeys.filter(x => !priorityKeys.includes(x))].slice(0, 25)) {
                const v = window[k];
                if (typeof v === 'function') {
                  snapshot.values[k] = `[Function: ${String(v).slice(0, 240)}]`;
                  continue;
                }
                try {
                  const s = JSON.stringify(v);
                  if (s && s.length <= 600000) snapshot.values[k] = JSON.parse(s);
                  else if (s) snapshot.values[k] = `[Large Object: ${s.length} chars] ` + s.slice(0, 15000);
                } catch (e) {
                  snapshot.values[k] = `[Unserializable: ${typeof v}]`;
                }
              }
              return snapshot;
            }).catch(e => ({ err: e.message }));
          }

          const templateKey = `${info.screenType}|${info.domMeta}`;
          const includeFullHtml = !seenHtmlTemplateKeys.has(templateKey) || info.screenType === 'GENERIC_STEP' || info.screenType === 'FINAL_SUBMIT_GATE';
          seenHtmlTemplateKeys.add(templateKey);

          const screenSnap = await activeTarget.evaluate(({ wantHtml }) => {
            const visQs = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null);
            const qBox = visQs[visQs.length - 1] || document.querySelector('#question, .question-box, main') || document.body;
            const controls = Array.from(
              document.querySelectorAll('input:not([type="hidden"]), select, textarea, .s-gradeclick')
            )
              .filter(el => el.offsetParent !== null)
              .slice(0, 80)
              .map(el => ({
                tag: el.tagName,
                type: el.type || (el.classList.contains('s-gradeclick') ? 's-gradeclick' : ''),
                name: el.name || '',
                qname: el.getAttribute('qname') || '',
                akey: el.getAttribute('akey') || '',
                vkey: el.getAttribute('vkey') || '',
                hkey: el.getAttribute('hkey') || '',
                disabled: Boolean(el.disabled),
                readOnly: Boolean(el.readOnly),
                label: (el.closest('label, tr, li, div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
                options: el.tagName === 'SELECT'
                  ? Array.from(el.options).slice(0, 12).map(o => `${o.value}:${o.text.trim()}`)
                  : undefined
              }));
            const inlineScripts = Array.from(qBox.querySelectorAll('script'))
              .map(s => (s.textContent || '').trim())
              .filter(Boolean)
              .join('\n---\n')
              .slice(0, 15000);
            return {
              url: location.href,
              qNameAttr: qBox.getAttribute?.('question-name') || qBox.getAttribute?.('qname') || '',
              qTypeAttr: qBox.getAttribute?.('question-type') || '',
              bodyText: (document.body?.innerText || '').replace(/[ \t]+/g, ' ').trim().slice(0, 2500),
              controls,
              inlineScripts: inlineScripts || undefined,
              outerHTML: wantHtml ? (qBox.outerHTML || '').slice(0, 35000) : undefined
            };
          }, { wantHtml: includeFullHtml }).catch(e => ({ err: e.message }));

          htmlInspectionDump.screens.push({
            stepIter,
            screenType: info.screenType,
            categoryName: info.categoryName,
            progressPct: info.progressPct,
            domMeta: info.domMeta,
            buttonTexts: info.buttonTexts,
            ...screenSnap
          });
        }
      }

      if (info.screenType === 'CAPI_LIST_PENDING') {
        const retryAction = await activeTarget.evaluate(() => {
          const marked = document.querySelector('[data-kbpi-target-start="1"]');
          if (marked) {
            const href = marked.getAttribute('href') || marked.closest('a')?.getAttribute('href') || '';
            const onclick = marked.getAttribute('onclick') || '';
            marked.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (typeof marked.click === 'function') marked.click();
            return { retried: true, tag: marked.tagName, href, onclick };
          }
          return { retried: false };
        }).catch(err => ({ retried: false, err: err.message }));
        emitLog(`[CAPI 리스트 대기 재시도] ${JSON.stringify(retryAction)} | URL=${surveyPage.url()}`, 'warn', 'SLOT_RETRY');
        await surveyPage.waitForTimeout(1200);
        continue;
      }

      if (info.screenType === 'SCREENED_OUT') {
        throw new Error(`설문 스크리닝/쿼터 중단 화면 도달 (${info.qNameAttr}): "${(info.bodySnippet || '').slice(0, 140)}"`);
      }

      if (info.screenType === 'COMPLETED') {
        emitLog(`[설문 최종 완료] #${seq} ${respondentName} (${uid}) 100% 완료 확인!`, 'info', 'DONE');
        return {
          success: true,
          completed: true,
          statusLabel: '완료',
          quotaStatus: 'completed',
          progress: '100%',
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [TITLE / DESC] 초기 조사 안내문
      if (info.screenType === 'INTRO_DESC') {
        emitLog('[안내문 통과] K-BPI 조사 안내 화면 [다음] 클릭...', 'info', 'INTRO');
        await clickNextButton(activeTarget);
        continue;
      }

      // [GP1] 현재 위치 확인
      if (info.screenType === 'GP1') {
        emitLog(`[GP1 위치 확인] ${gps.baseLabel} 기준 GPS(${gps.latitude}, ${gps.longitude}) 주입 및 [위치 확인] 클릭...`, 'info', 'GP1');
        const locBtn = activeTarget.locator('button:has-text("위치 확인"), a:has-text("위치 확인"), input[value*="위치 확인"], :text-is("위치 확인")').first();
        if ((await locBtn.count()) > 0) {
          await locBtn.click();
          for (let gWait = 0; gWait < 12; gWait++) {
            await surveyPage.waitForTimeout(350);
            const hasCoords = await activeTarget.evaluate(() => {
              const txt = document.body?.innerText || '';
              if (/위도\s*:\s*3\d\./.test(txt) || /37\.\d{3,}/.test(txt)) return true;
              return Array.from(document.querySelectorAll('[question-name="GP1"] input')).some(inp => /37\.\d+/.test(inp.value || ''));
            }).catch(() => false);
            if (hasCoords) break;
          }
        }
        await clickNextButton(activeTarget);
        continue;
      }

      // [WOKERD_DUP] 응답자 신상명세 등록 및 외부 DB [응답자 확인] AJAX 통과
      if (info.screenType === 'PROFILE') {
        emitLog(`[신상명세 등록] 이름=${respondentName}, 성별=${gender}, 만=${age}세, 연락처=${phone} (${phone.startsWith('010') ? '휴대폰' : '일반전화'})`, 'info', 'PROFILE');
        const profileResult = await activeTarget.evaluate(({ rName, rGender, rAge, rPhone }) => {
          const root = document.querySelector('[question-name="WOKERD_DUP"]') || document.querySelector('.worker-info-card')?.parentElement || document;
          if (typeof window.$ !== 'undefined') {
            const jqRoot = window.$(root);
            if (jqRoot.data('workerApiSaved') === true) {
              return { alreadySaved: true };
            }
          }

          const setField = (sel, val) => {
            const el = root.querySelector(sel);
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(el).val(String(val)).trigger('input').trigger('change');
            el.blur();
            return true;
          };

          setField('[custom-save-name="WORKER_NAME"], input[name="WORKER_NAME"], input[placeholder*="이름"]', rName);

          const wantGenderCode = String(rGender || '').startsWith('여') ? 'F' : 'M';
          const genderInp = root.querySelector(`input[custom-save-name="GENDER"][value="${wantGenderCode}"]`) ||
            Array.from(root.querySelectorAll('input[type="radio"]')).find(r => r.value === wantGenderCode);
          if (genderInp) {
            if (!genderInp.checked) genderInp.click();
            genderInp.checked = true;
            genderInp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(genderInp).prop('checked', true).trigger('change');
          }

          setField('[custom-save-name="AGE"], input[name="AGE"], input[placeholder*="숫자"]', rAge);

          const parts = String(rPhone || '').split('-').map(s => s.trim()).filter(Boolean);
          if (parts.length === 3) {
            if (parts[0] === '010') {
              setField('[custom-save-name="MOBILE_1"]', '010');
              setField('[custom-save-name="MOBILE_2"]', parts[1]);
              setField('[custom-save-name="MOBILE_3"]', parts[2]);
              setField('[custom-save-name="TEL_1"]', '');
              setField('[custom-save-name="TEL_2"]', '');
              setField('[custom-save-name="TEL_3"]', '');
            } else {
              setField('[custom-save-name="MOBILE_1"]', '');
              setField('[custom-save-name="MOBILE_2"]', '');
              setField('[custom-save-name="MOBILE_3"]', '');
              setField('[custom-save-name="TEL_1"]', parts[0]);
              setField('[custom-save-name="TEL_2"]', parts[1]);
              setField('[custom-save-name="TEL_3"]', parts[2]);
            }
          }

          const submitBtn = root.querySelector('.worker-api-submit');
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
            return { clickedSubmit: true };
          }
          return { clickedSubmit: false };
        }, { rName: respondentName, rGender: gender, rAge: age, rPhone: phone });

        if (profileResult.alreadySaved) {
          await clickNextButton(activeTarget);
          continue;
        }

        // WorkerCheck(IDENTITY -> CHECK) 비동기 응답 및 자동 페이지 전환 대기 (최대 16초)
        let workerErr = '';
        for (let wIdx = 0; wIdx < 32; wIdx++) {
          await surveyPage.waitForTimeout(500);
          const checkState = await activeTarget.evaluate(() => {
            const wBox = document.querySelector('[question-name="WOKERD_DUP"]');
            if (!wBox || wBox.offsetParent === null) {
              return { transitioned: true };
            }
            const jqSaved = (typeof window.$ !== 'undefined') ? Boolean(window.$(wBox).data('workerApiSaved')) : false;
            const resBox = wBox.querySelector('.worker-api-result');
            const resVisible = Boolean(resBox && resBox.offsetParent !== null && (resBox.innerText || '').trim());
            const isSuccess = Boolean(resBox && resBox.classList.contains('is-success'));
            const resMsg = resBox ? (resBox.innerText || '').replace(/\s+/g, ' ').trim() : '';
            const btnDisabled = Boolean(wBox.querySelector('.worker-api-submit')?.disabled);
            return { transitioned: false, jqSaved, resVisible, isSuccess, resMsg, btnDisabled };
          }).catch(() => ({ transitioned: true }));

          if (checkState.transitioned) break;
          if (checkState.jqSaved) {
            await surveyPage.waitForTimeout(350);
            await clickNextButton(activeTarget);
            break;
          }
          if (checkState.resVisible && !checkState.isSuccess && !checkState.btnDisabled && checkState.resMsg) {
            workerErr = checkState.resMsg;
            break;
          }
        }
        if (workerErr) {
          throw new Error(`[신상명세 등록 거부] #${seq} ${respondentName}(${phone}): ${workerErr}`);
        }
        continue;
      }

      // [SQ1] 광고회사/조사회사 종사 가족 유무 -> 2번 '없다' 선택
      if (info.screenType === 'SQ1') {
        emitLog('[SQ1 스크리닝] "없다(2)" 선택...', 'info', 'SQ1');
        await activeTarget.evaluate(() => {
          const sq1None = document.querySelector('input[qname="SQ1"][akey="2"]') ||
            Array.from(document.querySelectorAll('[question-name="SQ1"] input[type="radio"], input[type="radio"], input[type="checkbox"]'))
              .find(inp => !inp.disabled && /모두\s*없다|해당\s*없음|^없다$|^없음$/.test((inp.closest('label, li, tr, td, div')?.innerText || '').trim()));
          if (sq1None) {
            if (!sq1None.checked) sq1None.click();
            sq1None.checked = true;
            sq1None.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(sq1None).prop('checked', true).trigger('change');
          }
        });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [SQ2] 만 나이 입력 (15~59세)
      if (info.screenType === 'SQ2_AGE') {
        emitLog(`[SQ2 연령] 만 ${age}세 입력...`, 'info', 'SQ2');
        await activeTarget.evaluate(({ rAge }) => {
          const inp = document.querySelector('[question-name="SQ2"] input[data-column="NUMBER_1"], input[qname="SQ2"]') ||
            document.querySelector('[question-name="SQ2"] input:not([type="hidden"])');
          if (inp && !inp.disabled && !inp.readOnly) {
            inp.focus();
            inp.value = String(rAge);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(String(rAge)).trigger('input').trigger('change').trigger('keyup');
            inp.blur();
          }
        }, { rAge: age });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [SQ3] 성별 선택 (1: 남자 / 2: 여자)
      if (info.screenType === 'SQ3_GENDER') {
        const sq3Akey = gender.startsWith('여') ? '2' : '1';
        emitLog(`[SQ3 성별] "${gender}" (akey=${sq3Akey}) 선택...`, 'info', 'SQ3');
        await activeTarget.evaluate(({ ak }) => {
          const r = document.querySelector(`input[qname="SQ3"][akey="${ak}"]`) ||
            Array.from(document.querySelectorAll('[question-name="SQ3"] input[type="radio"]'))[ak === '2' ? 1 : 0];
          if (r && !r.disabled) {
            if (!r.checked) r.click();
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(r).prop('checked', true).trigger('change');
          }
        }, { ak: sq3Akey });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [M_CHECK + INDUSTRY_ORDER] 조사지역·조사구·조사동 선택 및 배정 브랜드 할당 대기
      if (info.screenType === 'M_CHECK_REGION') {
        emitLog(`[조사지역 입력] 지역=${region}(코드:${cityCode}) · 조사구=${surveyDistrict} · 조사동=${surveyDong} 선택 및 브랜드 할당 대기...`, 'info', 'M_CHECK');
        await activeTarget.evaluate(async ({ cCode, sDist, sDong }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = document.querySelector('[question-name="M_CHECK"]') || document;
          const cityRadio = box.querySelector(`input[custom-save-name="ZQ1"][value="${cCode}"]`);
          if (cityRadio) {
            if (!cityRadio.checked) cityRadio.click();
            cityRadio.checked = true;
            cityRadio.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(cityRadio).prop('checked', true).trigger('change');
          }
          await waitMs(180);

          const distSel = box.querySelector('select[custom-save-name="ZQ2"]');
          if (distSel && !distSel.disabled) {
            const distOpt = Array.from(distSel.options).find(o => o.value === sDist || o.text.trim() === sDist) ||
              Array.from(distSel.options).find(o => o.value !== '');
            if (distOpt) {
              distSel.value = distOpt.value;
              distSel.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(distSel).val(distOpt.value).trigger('change');
            }
          }
          await waitMs(180);

          const dongSel = box.querySelector('select[custom-save-name="ZQ3"]');
          if (dongSel && !dongSel.disabled) {
            const dongOpt = Array.from(dongSel.options).find(o => o.value === sDong || o.text.trim() === sDong) ||
              Array.from(dongSel.options).find(o => o.value !== '');
            if (dongOpt) {
              dongSel.value = dongOpt.value;
              dongSel.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(dongSel).val(dongOpt.value).trigger('change');
            }
          }
        }, { cCode: cityCode, sDist: surveyDistrict, sDong: surveyDong });

        // INDUSTRY_ORDER(/Custom/230/KbpiContext) 비동기 할당 완료(ready === true)까지 최대 15초 대기
        for (let iWait = 0; iWait < 30; iWait++) {
          const orderState = await activeTarget.evaluate(() => {
            const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
            if (!w || typeof window.$ === 'undefined') return { ready: true, keysCount: 0 };
            const jqW = window.$(w);
            const ready = Boolean(jqW.data('ready'));
            const err = String(jqW.data('error') || '');
            const pickerVisible = Boolean(w.querySelector('.kbpi-test-picker') && w.offsetParent !== null);
            return { ready, err, pickerVisible };
          }).catch(() => ({ ready: true }));
          if (orderState.ready) break;
          await surveyPage.waitForTimeout(450);
        }

        await syncAssignedIndustriesOnce(activeTarget);
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [INDUSTRY_ORDER 비동기 자동 배정 대기 — KBPI_Q1_1 진입 및 서버 영구 저장 보장]
      if (info.screenType === 'ALLOCATING_INDUSTRIES') {
        emitLog('[업종 자동 배정 대기] KbpiContext 배정 결과 서버 저장 및 문항 1 진입 대기...', 'info', 'ALLOC');
        for (let iWait = 0; iWait < 25; iWait++) {
          const st = await activeTarget.evaluate(() => {
            const q1 = document.querySelector('[question-name^="KBPI_Q1_1--"]');
            if (q1 && q1.offsetParent !== null) return { movedToQ1: true, ready: true };
            const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
            const ready = w && typeof window.$ !== 'undefined' ? Boolean(window.$(w).data('ready')) : false;
            return { movedToQ1: false, ready };
          }).catch(() => ({ movedToQ1: false, ready: false }));
          if (st.movedToQ1) break;
          if (st.ready && iWait >= 4) {
            await clickNextButton(activeTarget);
            break;
          }
          await surveyPage.waitForTimeout(350);
        }
        continue;
      }

      // [신상명세 등록 + 배정 브랜드 스캔 전용 정지 지점 (stopAtStep === 'SCAN_BRANDS')]
      // M_CHECK 통과 직후 Q1_UNAIDED(또는 이미 진행 중인 슬롯의 현재 화면)에서 배정된 전 품목(18~20개)을 추출하고 즉시 안전 정지!
      if (stopAtStep === 'SCAN_BRANDS') {
        await syncAssignedIndustriesOnce(activeTarget);
        const scannedItems = categoryConfigs.filter(c => c && c.categoryName);
        if (scannedItems.length === 0 && info.categoryName) {
          await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        }
        const finalScannedCount = categoryConfigs.filter(c => c && c.categoryName).length;
        const keepPrevPilot = slotData.quotaStatus === 'pilot_done' && /완료직전|문항4/.test(String(slotData.status || ''));
        const nextStatusLabel = keepPrevPilot ? slotData.status : '신상등록·스캔완료';
        const nextQuotaStatus = keepPrevPilot ? 'pilot_done' : 'scanned';

        emitLog(
          `✅ [신상명세 등록 & 브랜드 스캔 완료] #${seq} ${respondentName} (${surveyDistrict} ${surveyDong}) — 총 ${finalScannedCount}개 출제 브랜드 스캔 완료!`,
          'info',
          'SCAN_DONE'
        );
        return {
          success: true,
          scannedOnly: true,
          safetyStopped: true,
          stoppedAt: 'SCAN_BRANDS',
          scannedCount: finalScannedCount,
          statusLabel: nextStatusLabel,
          quotaStatus: nextQuotaStatus,
          progress: info.progressPct ? `${info.progressPct}%` : '12%',
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [문항 1] 1-1 ~ 1-4 비보조 인지도 (순차 언하이드 1회 통과 + 1-4 전용 NOA 체크박스 지원)
      if (info.screenType === 'Q1_UNAIDED') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const fill4th = (rng() * 100) < Number(policy.unaided4thBrandRate ?? 35) && catState.unaidedBrands.length >= 4;
        emitLog(`[${catState.categoryName} - 문항 1] 1-1="${catState.unaidedBrands[0]}", 1-2="${catState.unaidedBrands[1]}", 1-3="${catState.unaidedBrands[2]}", 1-4="${fill4th ? catState.unaidedBrands[3] : '없음(NOA)'}"`, 'info', 'Q1');

        await activeTarget.evaluate(async ({ brands, use4th }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const triggerVal = (el, val) => {
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof $ !== 'undefined') {
              $(el).val(String(val)).trigger('input').trigger('change').trigger('keyup');
            }
            el.blur();
            return true;
          };

          const uncheckNoa = (noaInp) => {
            if (noaInp && !noaInp.disabled && noaInp.checked) {
              noaInp.click();
              if (noaInp.checked) {
                noaInp.checked = false;
                if (typeof $ !== 'undefined') $(noaInp).prop('checked', false).trigger('change');
              }
            }
          };

          // GetData 표준 KBPI_Q1_1--K ~ KBPI_Q1_4--K 순차 입력 (입력 시 다음 칸 자동 언하이드)
          const firstBox = document.querySelector('[question-name^="KBPI_Q1_1--"]');
          if (firstBox) {
            const indKey = (firstBox.getAttribute('question-name') || '').split('--')[1] || '';
            for (let n = 1; n <= 3; n++) {
              const qn = `KBPI_Q1_${n}--${indKey}`;
              const noa = document.querySelector(`input[name^="NOA_${qn}"], input.NOA[noa-qname="${qn}"]`);
              uncheckNoa(noa);
              const inp = document.querySelector(`[question-name="${qn}"] input[data-column="TEXT_1"], input[qname="${qn}"]`);
              if (inp && brands[n - 1]) {
                triggerVal(inp, brands[n - 1]);
                await waitMs(90);
              }
            }

            const qn4 = `KBPI_Q1_4--${indKey}`;
            const noa4 = document.querySelector(`input[name^="NOA_${qn4}"], input.NOA[noa-qname="${qn4}"]`);
            const inp4 = document.querySelector(`[question-name="${qn4}"] input[data-column="TEXT_1"], input[qname="${qn4}"]`);
            if (use4th && inp4 && brands[3]) {
              uncheckNoa(noa4);
              await waitMs(40);
              triggerVal(inp4, brands[3]);
            } else if (noa4 && !noa4.disabled) {
              if (!noa4.checked) {
                noa4.click();
                noa4.checked = true;
                noa4.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(noa4).prop('checked', true).trigger('change');
              }
            }
            return;
          }

          // 일반 텍스트 입력칸 폴백
          const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(inp => inp.offsetParent !== null && !inp.readOnly);
          if (textInputs[0] && brands[0]) { triggerVal(textInputs[0], brands[0]); await waitMs(80); }
          if (textInputs[1] && brands[1]) { triggerVal(textInputs[1], brands[1]); await waitMs(80); }
          if (textInputs[2] && brands[2]) { triggerVal(textInputs[2], brands[2]); await waitMs(80); }

          if (use4th && textInputs[3] && brands[3]) {
            triggerVal(textInputs[3], brands[3]);
          } else {
            const noneCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
              .filter(cb => (cb.closest('label, div, td')?.innerText || '').trim().includes('없음') && !cb.disabled && cb.offsetParent !== null);
            const lastNoneCb = noneCheckboxes[noneCheckboxes.length - 1];
            if (lastNoneCb && !lastNoneCb.checked) {
              lastNoneCb.click();
              lastNoneCb.checked = true;
              lastNoneCb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, { brands: catState.unaidedBrands, use4th: fill4th });

        await surveyPage.waitForTimeout(550);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 2] 보조 인지도 (문항 1 응답값 포함 + 랜덤 2~4개 추가 선택 + 공식 브랜드 학습)
      if (info.screenType === 'Q2_AIDED') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const extraMin = Number(policy.aidedExtraMin ?? 2);
        const extraMax = Math.max(extraMin, Number(policy.aidedExtraMax ?? 4));
        const extraTargetCount = extraMin + Math.floor(rng() * (extraMax - extraMin + 1));

        const q2Result = await activeTarget.evaluate(({ unaidedList, addCount, randSeed }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q2--"]')).find(el => el.offsetParent !== null) || document;
          const checkboxes = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.offsetParent !== null);
          const allOfficialLabels = [];
          const uncheckedNormal = [];

          for (const cb of checkboxes) {
            const container = cb.closest('label, li, tr, div');
            const labelText = (container?.innerText || '').trim();
            if (!labelText) continue;
            if (labelText === '없음' || labelText.includes('모름') || /^NOA_/i.test(cb.name || '')) {
              if (cb.checked && !cb.disabled) {
                cb.click();
                if (cb.checked) cb.checked = false;
              }
              continue;
            }
            allOfficialLabels.push(labelText);

            const matchesUnaided = unaidedList.some(u =>
              u && (labelText === u || labelText.includes(u) || u.includes(labelText))
            );
            if (matchesUnaided && !cb.checked && !cb.disabled) {
              cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof $ !== 'undefined') $(cb).prop('checked', true).trigger('change');
            } else if (!cb.checked && !cb.disabled) {
              uncheckedNormal.push({ cb, labelText });
            }
          }

          let s = randSeed || 777;
          for (let i = uncheckedNormal.length - 1; i > 0; i--) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            const j = s % (i + 1);
            [uncheckedNormal[i], uncheckedNormal[j]] = [uncheckedNormal[j], uncheckedNormal[i]];
          }

          const pickedExtra = [];
          for (let i = 0; i < Math.min(addCount, uncheckedNormal.length); i++) {
            const target = uncheckedNormal[i];
            target.cb.click();
            target.cb.checked = true;
            target.cb.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(target.cb).prop('checked', true).trigger('change');
            pickedExtra.push(target.labelText);
          }

          return { allOfficialLabels, pickedExtra };
        }, {
          unaidedList: catState.unaidedBrands.slice(0, 3),
          addCount: extraTargetCount,
          randSeed: Math.floor(rng() * 1000000)
        });

        if (q2Result.allOfficialLabels?.length >= 3) {
          saveLearnedCategoryBrands(catState.categoryName, q2Result.allOfficialLabels);
        }
        emitLog(`[${catState.categoryName} - 문항 2] 보조인지도 추가 선택(${q2Result.pickedExtra.length}개): [${q2Result.pickedExtra.join(', ')}]`, 'info', 'Q2');

        await surveyPage.waitForTimeout(500);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 3] 다중 브랜드 매트릭스 (템플릿 A 표준 13행 + 템플릿 B 확장 16행 6-1/6-2/6-3 통합 정합성 엔진)
      if (info.screenType === 'Q3_MATRIX') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const colPlans = [];
        for (let colIdx = 0; colIdx < 6; colIdx++) {
          let colHasExp;
          if (catState.purchaseExp === '없음') {
            colHasExp = false; // 구입경험 '없음' 지정 시 전 열 13번 '아니오' + 11번 태도 1·2·3번만 + 6-2번 3·4번만!
          } else if (colIdx === 0) {
            colHasExp = true;  // 구입경험 '있음' 시 1번 열은 100% '예'
          } else {
            colHasExp = rng() < 0.75;
          }
          const scorePlan = generateKbpiMatrixScores(rng, colHasExp);
          const extraPool = colHasExp ? [3, 4, 4, 5, 4, 5] : [3, 3, 4, 3, 4, 5];
          const extendedScores = [...scorePlan.itemScores];
          for (let ex = 0; ex < 16; ex++) {
            extendedScores.push(extraPool[Math.floor(rng() * extraPool.length)]);
          }

          // 6-3) AI 검색경험: 품목 사전 결정값(catState.aiSearched)과 100% 일치 (예일 때 1열 필수 예, 아니오일 때 전 열 아니오)
          const aiSearchedCol = catState.aiSearched
            ? (colIdx === 0 ? true : (colIdx === 1 ? rng() < 0.35 : false))
            : false;

          // 6-2) 추천/피추천 경험(0-based index): 이용경험 없으면 [2(추천받음), 3(경험없음)]만 선택, 있으면 [0,1,2,3] 분산
          const rec27PosIdx = Math.floor(rng() * 4);
          const rec27NonUseIdx = rng() < 0.45 ? 2 : 3;

          colPlans.push({
            colIdx,
            hasPurchaseExp: colHasExp,
            aiSearchedCol,
            rec27PosIdx,
            rec27NonUseIdx,
            ...scorePlan,
            extendedScores,
            adjective: catState.adjectives[colIdx % catState.adjectives.length] || `친숙함${colIdx + 1}`,
            posReason: catState.posReasons[colIdx % catState.posReasons.length] || '인지도가 높고 신뢰가 가서',
            neuReason: catState.neuReasons[colIdx % catState.neuReasons.length] || '무난하고 대중적이어서'
          });
        }

        const matrixApplied = await activeTarget.evaluate(({ plans }) => {
          const triggerInput = (el, val) => {
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof $ !== 'undefined') {
              $(el).val(String(val)).trigger('input').trigger('change').trigger('keyup');
            }
            el.blur();
            return true;
          };

          const setRadioChecked = (r) => {
            if (!r || r.disabled) return false;
            if (!r.checked) r.click();
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') {
              $(r).prop('checked', true).trigger('change');
            }
            return true;
          };

          const uncheckSkipCheckboxesInCell = (cell) => {
            cell.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              if (!cb.disabled && cb.checked) {
                cb.click();
                if (cb.checked) {
                  cb.checked = false;
                  if (typeof $ !== 'undefined') $(cb).prop('checked', false).trigger('change');
                }
              }
            });
          };

          const allTablesWithInputs = Array.from(document.querySelectorAll('table')).filter(t =>
            t.offsetParent !== null && t.querySelector('input, select, textarea')
          );
          const tables = allTablesWithInputs.filter(t => !allTablesWithInputs.some(other => other !== t && t.contains(other)));
          if (tables.length === 0) return { ok: false, reason: '평가 테이블 미발견' };

          // 상단 평가 브랜드 열 헤더 이름 파악 (문항 4 매칭용)
          const colBrandNames = [];
          tables.forEach(tb => {
            tb.querySelectorAll('thead input, thead div, thead th, thead td, tbody tr:first-child input, tbody tr:first-child td').forEach(el => {
              const trTxt = (el.closest('tr')?.innerText || '').trim();
              if (/^\d{1,2}(?:-\d+)?\s*[).]/.test(trTxt)) return;
              const v = (el.value || el.innerText || '').trim();
              if (v && v.length <= 35 && !/평가항목|^[1-6]$/.test(v) && colBrandNames.length < 6) {
                if (!colBrandNames.includes(v)) colBrandNames.push(v);
              }
            });
          });

          const enteredScoresByCol = [[], [], [], [], [], []];
          const lastScoreByCol = [4, 4, 4, 4, 4, 4];
          let filledTxt = 0;
          let filledSel = 0;
          let filledRad = 0;
          let processedRows = 0;

          for (const tb of tables) {
            const trs = Array.from(tb.querySelectorAll('tbody tr')).filter(tr => tr.offsetParent !== null);
            for (const tr of trs) {
              const dataCells = Array.from(tr.querySelectorAll('td, th')).filter(cell => {
                if (cell.offsetParent === null) return false;
                return Boolean(
                  cell.querySelector(
                    'select:not(:disabled), textarea:not(:disabled):not([readonly]), input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled), input[type="number"]:not(:disabled):not([readonly]), input[type="text"]:not(:disabled):not([readonly]), input:not([type]):not(:disabled):not([readonly])'
                  )
                );
              });
              if (dataCells.length === 0) continue;

              const firstCell = tr.querySelector('th, td');
              const rowTitle = ((firstCell && !dataCells.includes(firstCell) ? firstCell.innerText : tr.innerText) || '')
                .replace(/\s+/g, ' ')
                .trim();

              // 템플릿 B의 0번 브랜드명 헤더 행(rowTitle이 비어 있고 이미 브랜드명이 채워진 행) 덮어쓰기 방지 가드!
              if (!rowTitle || /^평가항목(\s+[1-6])*$/.test(rowTitle)) {
                dataCells.forEach(td => {
                  const hdrInp = td.querySelector('input');
                  const bv = (hdrInp?.value || td.innerText || '').trim();
                  if (bv && bv.length <= 35 && !/^[1-6]$/.test(bv) && !colBrandNames.includes(bv) && colBrandNames.length < 6) {
                    colBrandNames.push(bv);
                  }
                });
                continue;
              }

              processedRows++;
              const isOverallSatRow = /전반적으로\s*만족|전반적\s*만족/.test(rowTitle);
              const isReasonWordRow = /\b6-1\s*\)|점수를\s*주신\s*이유|이유는\s*무엇/.test(rowTitle);
              const isRecExpRow = /\b6-2\s*\)|추천하거나.*추천\s*받은/.test(rowTitle);
              const isAiExpRow = /\b6-3\s*\)|생성형\s*AI/.test(rowTitle);
              const isImageWordRow = /\b12\s*\)|떠오르는\s*이미지|형용사|단어|연상|생각나는\s*이미지/.test(rowTitle);
              const isExpRow = /\b13\s*\)|이용\/구입해\s*보신|구입해\s*보신|이용해\s*보신|방문해\s*보신|진료/.test(rowTitle);
              const isNegativeRow = /전환|이탈|불만|피해|부작용|중단/.test(rowTitle);

              dataCells.forEach((td, cIdx) => {
                const plan = plans[cIdx] || plans[0];
                if (!plan) return;
                const safeCol = Math.min(cIdx, enteredScoresByCol.length - 1);
                const colBucket = enteredScoresByCol[safeCol];

                // 1) <select> 드롭다운 셀 (11번 평소 태도 등)
                const sel = td.querySelector('select:not(:disabled)');
                if (sel && sel.offsetParent !== null) {
                  const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text));
                  if (validOpts.length > 0) {
                    let choiceIdx = plan.attitudeChoice - 1;
                    if (!plan.hasPurchaseExp) {
                      choiceIdx = Math.min(2, Math.max(0, choiceIdx)); // 구입경험 없음: 절대 4·5번(idx 3,4) 선택 금지!
                    } else if (colBucket.length > 0) {
                      const dynAvg = Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length);
                      if (dynAvg >= 4 && choiceIdx < 3) choiceIdx = 3;
                      else if (dynAvg <= 3 && choiceIdx >= 3) choiceIdx = 2;
                    }
                    const targetOpt = validOpts[Math.max(0, Math.min(validOpts.length - 1, choiceIdx))] || validOpts[0];
                    sel.value = targetOpt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof $ !== 'undefined') $(sel).val(targetOpt.value).trigger('change');
                    filledSel++;
                  }
                  return;
                }

                // 2) 텍스트 / 숫자 입력 셀 (점수 평가, 6-1 추천사유 단답형, 10 전반적만족도, 12 연상이미지)
                const txtInp = Array.from(
                  td.querySelectorAll('textarea, input[type="number"], input[type="text"], input:not([type])')
                ).find(inp => inp.offsetParent !== null && !inp.disabled && !inp.readOnly && !['radio', 'checkbox', 'hidden', 'button', 'submit'].includes(inp.type));

                if (txtInp) {
                  uncheckSkipCheckboxesInCell(td);
                  if (isReasonWordRow) {
                    const prevRecScore = lastScoreByCol[safeCol] || 4;
                    const reasonText = prevRecScore >= 4 ? plan.posReason : plan.neuReason;
                    if (triggerInput(txtInp, reasonText)) filledTxt++;
                  } else if (isImageWordRow) {
                    if (triggerInput(txtInp, plan.adjective)) filledTxt++;
                  } else if (isOverallSatRow) {
                    const avgScore = colBucket.length > 0
                      ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length)))
                      : plan.overallSatisfaction;
                    if (triggerInput(txtInp, avgScore)) filledTxt++;
                  } else {
                    const sIdx = colBucket.length;
                    let scoreVal = plan.extendedScores[sIdx % plan.extendedScores.length];
                    if (sIdx >= 2 && colBucket.every(v => v === scoreVal)) {
                      scoreVal = scoreVal === 4 ? 5 : 4;
                    }
                    colBucket.push(scoreVal);
                    lastScoreByCol[safeCol] = scoreVal;
                    if (triggerInput(txtInp, scoreVal)) filledTxt++;
                  }
                  return;
                }

                // 3) 라디오 버튼 셀 (6-2 추천경험 4지선다 / 6-3 AI검색 예·아니오 / 13번 이용경험 예·아니오 / 5점척도)
                const cellRadios = Array.from(td.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
                if (cellRadios.length > 0) {
                  const byName = new Map();
                  cellRadios.forEach(r => {
                    const k = r.name || '__cell_radio__';
                    if (!byName.has(k)) byName.set(k, []);
                    byName.get(k).push(r);
                  });

                  for (const [rName, grp] of byName.entries()) {
                    if (grp.length >= 5) {
                      const sIdx = colBucket.length;
                      const scoreVal = isOverallSatRow
                        ? (colBucket.length > 0 ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length))) : plan.overallSatisfaction)
                        : plan.extendedScores[sIdx % plan.extendedScores.length];
                      if (!isOverallSatRow) {
                        colBucket.push(scoreVal);
                        lastScoreByCol[safeCol] = scoreVal;
                      }
                      const pickR = grp.find(r => String(r.value) === String(scoreVal)) || grp[Math.min(grp.length - 1, scoreVal - 1)];
                      if (setRadioChecked(pickR)) filledRad++;
                    } else if (isRecExpRow || /_REC\d+$/i.test(rName) || grp.length === 4) {
                      // 6-2) 추천/피추천 경험 4지선다: 이용경험 없으면 3번(추천받음)·4번(경험없음)만 선택!
                      const usePositiveRec = plan.hasPurchaseExp && (lastScoreByCol[safeCol] || 4) >= 4;
                      const targetIdx = usePositiveRec ? plan.rec27PosIdx : plan.rec27NonUseIdx;
                      const pickR = grp[Math.max(0, Math.min(grp.length - 1, targetIdx))] || grp[grp.length - 1];
                      if (setRadioChecked(pickR)) filledRad++;
                    } else if (isAiExpRow || /_AI\d+$/i.test(rName)) {
                      // 6-3) 생성형 AI 검색 경험: 문항 6 응답과 100% 연동
                      const wantLabel = plan.aiSearchedCol ? /^(예|있다|있음)$/ : /^(아니오|아니요|없다|없음)$/;
                      const byLb = grp.find(r => wantLabel.test((r.closest('label, span, div')?.innerText || document.querySelector(`label[for="${r.id}"]`)?.innerText || '').trim()));
                      const fallbackR = plan.aiSearchedCol ? grp[0] : grp[grp.length - 1];
                      if (setRadioChecked(byLb || fallbackR)) filledRad++;
                    } else {
                      // 13) 브랜드 이용/구입 경험 등 일반 예/아니오 라디오
                      const wantPositive = isNegativeRow ? false : (isExpRow ? plan.hasPurchaseExp : plan.hasPurchaseExp);
                      const wantLabel = wantPositive ? /^(예|있다|있음|그렇다)$/ : /^(아니오|아니요|없다|없음|아니다)$/;
                      const byLb = grp.find(r => {
                        const lbTxt = (r.closest('label, span, div')?.innerText || document.querySelector(`label[for="${r.id}"]`)?.innerText || '').trim();
                        return wantLabel.test(lbTxt);
                      });
                      const fallbackR = wantPositive ? grp[0] : grp[grp.length - 1];
                      if (setRadioChecked(byLb || fallbackR)) filledRad++;
                    }
                  }
                  return;
                }

                // 4) 단독 체크박스 셀
                const cellCbs = Array.from(td.querySelectorAll('input[type="checkbox"]'))
                  .filter(cb => !cb.disabled && cb.offsetParent !== null);
                if (cellCbs.length > 0) {
                  const validCb = cellCbs.find(cb => !/없음|모름|기타/.test((cb.closest('label, span, div')?.innerText || '').trim())) || cellCbs[0];
                  if (validCb && !validCb.checked) {
                    validCb.click();
                    validCb.checked = true;
                    if (typeof $ !== 'undefined') $(validCb).prop('checked', true).trigger('change');
                  }
                }
              });
            }
          }

          // 테이블 외부 또는 누락된 필수 컨트롤 최종 스윕
          document.querySelectorAll('select:not(:disabled)').forEach((sel, idx) => {
            if (sel.offsetParent !== null && (!sel.value || /선택/.test(sel.options[sel.selectedIndex]?.text || ''))) {
              const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text));
              const plan = plans[idx % plans.length] || plans[0];
              const safeIdx = plan.hasPurchaseExp ? (plan.attitudeChoice - 1) : Math.min(2, plan.attitudeChoice - 1);
              const targetOpt = validOpts[Math.max(0, Math.min(validOpts.length - 1, safeIdx))] || validOpts[0];
              if (targetOpt) {
                sel.value = targetOpt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(sel).val(targetOpt.value).trigger('change');
                filledSel++;
              }
            }
          });

          const allVisibleRadios = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)'))
            .filter(r => r.offsetParent !== null || r.closest('td, div, label')?.offsetParent !== null);
          const globalRadioGroups = new Map();
          allVisibleRadios.forEach(r => {
            if (!r.name) return;
            if (!globalRadioGroups.has(r.name)) globalRadioGroups.set(r.name, []);
            globalRadioGroups.get(r.name).push(r);
          });
          let gIdx = 0;
          for (const grp of globalRadioGroups.values()) {
            if (!grp.some(r => r.checked) && grp.length > 0) {
              const plan = plans[gIdx % plans.length] || plans[0];
              const pick = plan.hasPurchaseExp ? grp[0] : grp[grp.length - 1];
              if (setRadioChecked(pick)) filledRad++;
            }
            gIdx++;
          }

          document.querySelectorAll('textarea, input[type="number"], input[type="text"], input:not([type])').forEach((inp, idx) => {
            if (inp.offsetParent === null || inp.disabled || inp.readOnly) return;
            if (['radio', 'checkbox', 'hidden', 'button', 'submit', 'reset', 'file'].includes(inp.type)) return;
            if (inp.classList.contains('input-etc') || /etc/i.test(inp.name || '') || /기타/.test((inp.closest('label, li, span')?.innerText || ''))) return;
            if (String(inp.value || '').trim() !== '') return;
            const trTxt = (inp.closest('tr, div')?.innerText || '').trim();
            const plan = plans[idx % plans.length] || plans[0];
            const val = /6-1|이유/.test(trTxt)
              ? plan.posReason
              : (/이미지|형용사|단어/.test(trTxt) ? plan.adjective : plan.overallSatisfaction);
            if (triggerInput(inp, val)) filledTxt++;
          });

          const emptyControls = Array.from(document.querySelectorAll('input:not([type="hidden"]):not(:disabled):not([readonly]), select:not(:disabled), textarea:not(:disabled)'))
            .filter(el => {
              if (el.offsetParent === null) return false;
              if (el.type === 'radio') return !globalRadioGroups.get(el.name)?.some(x => x.checked);
              if (el.type === 'checkbox') return false;
              return String(el.value || '').trim() === '';
            })
            .slice(0, 5)
            .map(el => `${el.tagName}[name=${el.name || el.id || '-'}]`);

          return {
            ok: true,
            colBrandNames,
            rowCount: processedRows,
            filledTxt,
            filledSel,
            filledRad,
            emptyControls
          };
        }, { plans: colPlans });

        if (matrixApplied.colBrandNames?.[0] && catState.purchaseExp === '있음') {
          catState.q4SelectedBrand = matrixApplied.colBrandNames[0];
          categoryConfigs[catState.slotIndex].topBrand = matrixApplied.colBrandNames[0];
        }

        emitLog(
          `[${catState.categoryName} - 문항 3] 평가 완료 (행=${matrixApplied.rowCount}, 입력=${matrixApplied.filledTxt}, 선택=${matrixApplied.filledSel}, 라디오=${matrixApplied.filledRad}${matrixApplied.emptyControls?.length ? `, 미입력=${matrixApplied.emptyControls.join(',')}` : ''})`,
          'info',
          'Q3'
        );

        await surveyPage.waitForTimeout(600);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4] 가장 최근에 구입/이용한 브랜드 (파일럿 stopAtStep === 'Q4' 안전 정지 지점!)
      if (info.screenType === 'Q4_RECENT_BRAND') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);

        if (stopAtStep === 'Q4') {
          emitLog(
            `🛑 [파일럿 문항 4 안전 정지] #${seq} ${respondentName} — "${catState.categoryName}" 품목의 문항 4 화면에 도달하여 요청하신 대로 제출 전 안전 정지했습니다.`,
            'info',
            'Q4_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'Q4',
            statusLabel: '문항4 대기(파일럿)',
            quotaStatus: 'pilot_done',
            progress: info.progressPct ? `${info.progressPct}%` : '4%',
            categoryConfigs,
            gps
          };
        }

        const pickedQ4 = await activeTarget.evaluate(({ targetBrand, isNone }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q4--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
          let chosen = null;
          if (isNone) {
            chosen = radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return r.getAttribute('akey') === '99' || txt === '없음' || txt.includes('없음');
            }) || radios[radios.length - 1];
          } else {
            chosen = radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return txt && txt !== '없음' && r.getAttribute('akey') !== '99' && (txt === targetBrand || txt.includes(targetBrand) || targetBrand.includes(txt));
            }) || radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return txt && txt !== '없음' && r.getAttribute('akey') !== '99';
            });
          }
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof $ !== 'undefined') $(chosen).prop('checked', true).trigger('change');
            return (chosen.closest('label, li, tr, div')?.innerText || '').trim();
          }
          return '';
        }, {
          targetBrand: catState.q4SelectedBrand,
          isNone: catState.purchaseExp === '없음'
        });

        if (pickedQ4) catState.q4SelectedBrand = pickedQ4;
        emitLog(`[${catState.categoryName} - 문항 4] 최근 구입/이용 브랜드 = "${pickedQ4 || catState.q4SelectedBrand}"`, 'info', 'Q4');

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-1 요인] 고려하신 가장 중요한 요인 (RADIO 1~9)
      if (info.screenType === 'Q4_1_FACTOR') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const factorSeed = Math.floor(rng() * 1000);
        const pickedFactor = await activeTarget.evaluate(({ fSeed }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q41--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
          const preferredAkeys = ['2', '3', '1', '9', '8', '4', '6'];
          const targetAk = preferredAkeys[fSeed % preferredAkeys.length];
          const chosen = radios.find(r => r.getAttribute('akey') === targetAk) || radios[fSeed % Math.max(1, radios.length)];
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(chosen).prop('checked', true).trigger('change');
            return (chosen.closest('label, li, tr, div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 36);
          }
          return '';
        }, { fSeed: factorSeed });
        emitLog(`[${catState.categoryName} - 문항 4-1(요인)] "${pickedFactor}" 선택`, 'info', 'Q4-1F');
        await surveyPage.waitForTimeout(380);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-1 채널] 구입/이용 채널 경로 주관식 (숨김 META_PARENT 인풋 제외, TEXT_1 정확 타겟팅)
      if (info.screenType === 'Q4_1_CHANNEL') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        emitLog(`[${catState.categoryName} - 문항 4-1(채널)] 구입/이용 채널 = "${catState.selectedChannel}"`, 'info', 'Q4-1');
        await activeTarget.evaluate(({ channelText }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q41_CHANNEL--"]')).find(el => el.offsetParent !== null) || document;
          const inp = visQBox.querySelector('input[data-column="TEXT_1"]') ||
            Array.from(visQBox.querySelectorAll('input[type="text"], textarea, input:not([type])'))
              .find(el => el.offsetParent !== null && !el.disabled && !el.readOnly && !el.classList.contains('input-etc'));
          if (inp) {
            inp.focus();
            inp.value = channelText;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(channelText).trigger('input').trigger('change');
            inp.blur();
          }
        }, { channelText: catState.selectedChannel });

        await surveyPage.waitForTimeout(400);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-2 세제 제형] 세제류 전용 복수선택 (가루형/액체형/캡슐형/시트형)
      if (info.screenType === 'Q4_2_DETERGENT') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const detPicked = await activeTarget.evaluate(({ seedN }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q42--"]')).find(el => el.offsetParent !== null) || document;
          const cbs = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(c => !c.disabled && c.offsetParent !== null);
          const prefer = cbs.find(c => /액체|캡슐/.test((c.closest('label, div, li')?.innerText || ''))) || cbs[seedN % Math.max(1, cbs.length)];
          if (prefer && !prefer.checked) {
            prefer.click();
            prefer.checked = true;
            prefer.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(prefer).prop('checked', true).trigger('change');
          }
          return prefer ? (prefer.closest('label, div, li')?.innerText || '').trim() : '';
        }, { seedN: Math.floor(rng() * 100) });
        emitLog(`[${catState.categoryName} - 문항 4-2(제형)] "${detPicked}" 선택`, 'info', 'Q4-2');
        await surveyPage.waitForTimeout(380);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 5] 향후 구입/이용 선호 브랜드 (문항 4 응답과 100% 동일 선택)
      if (info.screenType === 'Q5_SAME_AS_Q4') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const pickedQ5 = await activeTarget.evaluate(({ sameBrand, isNone }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q5--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
          let chosen = null;
          if (isNone) {
            chosen = radios.find(r => r.getAttribute('akey') === '99' || (r.closest('label, li, tr, div')?.innerText || '').trim().includes('없음')) || radios[radios.length - 1];
          } else {
            chosen = radios.find(r => {
              const t = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return t && t !== '없음' && r.getAttribute('akey') !== '99' && (t === sameBrand || t.includes(sameBrand) || sameBrand.includes(t));
            }) || radios.find(r => r.getAttribute('akey') !== '99') || radios[0];
          }
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(chosen).prop('checked', true).trigger('change');
            return (chosen.closest('label, li, tr, div')?.innerText || '').trim();
          }
          return '';
        }, {
          sameBrand: catState.q4SelectedBrand,
          isNone: catState.purchaseExp === '없음'
        });
        emitLog(`[${catState.categoryName} - 문항 5] 문항 4 동일 응답 = "${pickedQ5}"`, 'info', 'Q5');

        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 6 + 조건부 6-1·6-2] 생성형 AI 브랜드 질문 경험 (문항 3 6-3 응답값 catState.aiSearched와 100% 연동!)
      if (info.screenType === 'Q6_YES_NO') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const chooseNo = !catState.aiSearched;
        const targetLabel = chooseNo ? '아니오' : '예';
        const q6SubScore1 = rng() < 0.65 ? '4' : '5';
        const q6SubScore2 = rng() < 0.7 ? '4' : '3';

        await activeTarget.evaluate(async ({ want, isYes, sc1, sc2 }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q6--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
          const chosen = radios.find(r => (r.closest('label, li, tr, div')?.innerText || '').trim() === want)
            || radios.find(r => (r.closest('label, li, tr, div')?.innerText || '').trim().includes(want))
            || (want === '아니오' ? radios[1] : radios[0]);
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(chosen).prop('checked', true).trigger('change');
          }

          if (isYes) {
            await waitMs(260);
            const q61Box = Array.from(document.querySelectorAll('[question-name^="KBPI_Q61--"]')).find(el => el.offsetParent !== null);
            if (q61Box) {
              const r61 = q61Box.querySelector(`input[type="radio"][akey="${sc1}"]`) || q61Box.querySelector('input[type="radio"][akey="4"]') || q61Box.querySelectorAll('input[type="radio"]')[3];
              if (r61 && !r61.disabled) {
                r61.click();
                r61.checked = true;
                r61.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(r61).prop('checked', true).trigger('change');
              }
            }
            await waitMs(160);
            const q62Box = Array.from(document.querySelectorAll('[question-name^="KBPI_Q62--"]')).find(el => el.offsetParent !== null);
            if (q62Box) {
              const r62 = q62Box.querySelector(`input[type="radio"][akey="${sc2}"]`) || q62Box.querySelector('input[type="radio"][akey="4"]') || q62Box.querySelectorAll('input[type="radio"]')[3];
              if (r62 && !r62.disabled) {
                r62.click();
                r62.checked = true;
                r62.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(r62).prop('checked', true).trigger('change');
              }
            }
          }
        }, { want: targetLabel, isYes: !chooseNo, sc1: q6SubScore1, sc2: q6SubScore2 });

        emitLog(`[${catState.categoryName} - 문항 6] "${targetLabel}" 선택${!chooseNo ? ` (6-1=${q6SubScore1}점, 6-2=${q6SubScore2}점)` : ''} (6-3 동기화)`, 'info', 'Q6');
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 7 & 문항 8] 생성형 AI 활용 상황(Q7) · 확인 내용(Q8) — 1순위 · 2순위 GRADE 선택 ('기타' 행 절대 배제!)
      if (info.screenType === 'Q7_RANK_1_2' || info.screenType === 'Q8_RANK_1_2') {
        const isQ8 = info.screenType === 'Q8_RANK_1_2';
        const qLabelNum = isQ8 ? '8' : '7';
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const seedNum = Math.floor(rng() * 10000) + (isQ8 ? 37 : 0);

        const gradeClickPlan = await activeTarget.evaluate(({ sNum }) => {
          const isForbiddenLabel = (txt) => /기타|없음|모름|생각나지|잘\s*모르/.test(txt);
          document.querySelectorAll('[data-kbpi-rank-pick]').forEach(el => el.removeAttribute('data-kbpi-rank-pick'));

          const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document;
          const gradeEls = Array.from(visQBox.querySelectorAll('.s-gradeclick')).filter(el => el.offsetParent !== null);
          if (gradeEls.length < 2) return { isGradeClick: false };

          const reBtn = visQBox.querySelector('button.re-select');
          let didReset = false;
          if (reBtn && reBtn.offsetParent !== null) {
            reBtn.click();
            didReset = true;
          } else {
            const activeOnes = gradeEls.filter(el =>
              el.classList.contains('selected') || el.classList.contains('active') || el.classList.contains('on') || /(1순위|2순위)/.test(el.innerText || '')
            );
            if (activeOnes.length > 0) {
              activeOnes.forEach(el => el.click());
              didReset = true;
            }
          }

          const validGrades = gradeEls.filter(el => {
            if (el.querySelector('input.input-etc, textarea.input-etc')) return false;
            const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
            return !isForbiddenLabel(txt);
          });
          if (validGrades.length < 2) return { isGradeClick: false };

          const idx1 = sNum % validGrades.length;
          let idx2 = (sNum + 1 + ((sNum >> 2) % (validGrades.length - 1))) % validGrades.length;
          if (idx2 === idx1) idx2 = (idx1 + 1) % validGrades.length;

          validGrades[idx1].setAttribute('data-kbpi-rank-pick', '1');
          validGrades[idx2].setAttribute('data-kbpi-rank-pick', '2');

          return {
            isGradeClick: true,
            didReset,
            r1: (validGrades[idx1].innerText || '').replace(/\s+/g, ' ').trim(),
            r2: (validGrades[idx2].innerText || '').replace(/\s+/g, ' ').trim()
          };
        }, { sNum: seedNum });

        let rankInfo = { r1: '', r2: '', mode: '' };

        if (gradeClickPlan.isGradeClick) {
          if (gradeClickPlan.didReset) {
            await surveyPage.waitForTimeout(320);
          }
          const rank1Loc = activeTarget.locator('[data-kbpi-rank-pick="1"]').first();
          const rank2Loc = activeTarget.locator('[data-kbpi-rank-pick="2"]').first();
          if ((await rank1Loc.count()) > 0) {
            await rank1Loc.scrollIntoViewIfNeeded().catch(err => emitLog(`1순위 스크롤 경고: ${err.message}`, 'warn'));
            await rank1Loc.click();
            await surveyPage.waitForTimeout(350);
          }
          if ((await rank2Loc.count()) > 0) {
            await rank2Loc.scrollIntoViewIfNeeded().catch(err => emitLog(`2순위 스크롤 경고: ${err.message}`, 'warn'));
            await rank2Loc.click();
            await surveyPage.waitForTimeout(300);
          }
          rankInfo = { r1: gradeClickPlan.r1, r2: gradeClickPlan.r2, mode: 'GRADE_CLICK' };
        } else {
          rankInfo = await activeTarget.evaluate(async ({ sNum }) => {
            const isForbiddenLabel = (txt) => /(^|\s)기타(\s|$)|없음|모름|생각나지|잘\s*모르/.test(txt);
            const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
            const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document;

            const hkey1Radios = Array.from(visQBox.querySelectorAll('input[type="radio"][hkey="1"]')).filter(r => !r.disabled);
            if (hkey1Radios.length >= 2) {
              const validR1 = hkey1Radios.filter(r => {
                const tr = r.closest('tr, li, div');
                if (tr?.querySelector('input.input-etc')) return false;
                const rowTxt = (tr?.innerText || '').trim();
                return !isForbiddenLabel(rowTxt);
              });
              if (validR1.length >= 2) {
                const pick1 = validR1[sNum % validR1.length];
                const vk1 = pick1.getAttribute('vkey') || pick1.value;
                pick1.click();
                pick1.checked = true;
                if (typeof window.$ !== 'undefined') window.$(pick1).prop('checked', true).trigger('change');
                await waitMs(220);

                const validR2 = Array.from(visQBox.querySelectorAll('input[type="radio"][hkey="2"]')).filter(r => {
                  if (r.disabled) return false;
                  const vk2 = r.getAttribute('vkey') || r.value;
                  if (vk2 === vk1) return false;
                  const tr = r.closest('tr, li, div');
                  if (tr?.querySelector('input.input-etc')) return false;
                  const rowTxt = (tr?.innerText || '').trim();
                  return !isForbiddenLabel(rowTxt);
                });
                const pick2 = validR2[(sNum + 2) % Math.max(1, validR2.length)];
                if (pick2) {
                  pick2.click();
                  pick2.checked = true;
                  if (typeof window.$ !== 'undefined') window.$(pick2).prop('checked', true).trigger('change');
                  return { r1: vk1, r2: pick2.getAttribute('vkey') || pick2.value, mode: 'GRADE_HKEY' };
                }
              }
            }

            const selects = Array.from(visQBox.querySelectorAll('select')).filter(s => !s.disabled && s.offsetParent !== null);
            if (selects.length >= 2) {
              const opts1 = Array.from(selects[0].options).filter(o => o.value !== '' && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
              if (opts1.length >= 2) {
                const pick1 = opts1[sNum % opts1.length];
                selects[0].value = pick1.value;
                selects[0].dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(selects[0]).val(pick1.value).trigger('change');
                await waitMs(250);

                const opts2 = Array.from(selects[1].options).filter(o => o.value !== '' && o.value !== pick1.value && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
                if (opts2.length > 0) {
                  const pick2 = opts2[(sNum + 1) % opts2.length];
                  selects[1].value = pick2.value;
                  selects[1].dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(selects[1]).val(pick2.value).trigger('change');
                  return { r1: pick1.text.trim(), r2: pick2.text.trim(), mode: 'SELECT_2' };
                }
              }
            }

            const allCbs = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.disabled && cb.offsetParent !== null);
            if (allCbs.length >= 2) {
              for (const cb of allCbs) {
                if (cb.checked) {
                  cb.click();
                  if (cb.checked) cb.checked = false;
                }
              }
              await waitMs(120);
              const validCbs = allCbs.filter(cb => {
                const t = (cb.closest('label, tr, td, li, div')?.innerText || '').trim();
                return t && !isForbiddenLabel(t) && !/^NOA_/i.test(cb.name || '');
              });
              if (validCbs.length >= 2) {
                const i1 = sNum % validCbs.length;
                const i2 = (i1 + 1) % validCbs.length;
                validCbs[i1].click();
                validCbs[i1].checked = true;
                if (typeof window.$ !== 'undefined') window.$(validCbs[i1]).prop('checked', true).trigger('change');
                await waitMs(160);
                validCbs[i2].click();
                validCbs[i2].checked = true;
                if (typeof window.$ !== 'undefined') window.$(validCbs[i2]).prop('checked', true).trigger('change');
                return {
                  r1: (validCbs[i1].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  r2: (validCbs[i2].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  mode: 'CHECKBOX_2'
                };
              }
            }

            return { r1: '', r2: '', mode: 'NONE' };
          }, { sNum: seedNum });
        }

        emitLog(`[${catState.categoryName} - 문항 ${qLabelNum} (${rankInfo.mode})] 1순위="${rankInfo.r1}", 2순위="${rankInfo.r2}" (기타 배제 완료)`, 'info', `Q${qLabelNum}`);
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [KBPI_NGO 특수 블록] 구호개발단체(NGO) 세부진단
      if (info.screenType === 'KBPI_NGO_SPECIAL') {
        emitLog('[특수 진단: 구호개발단체(NGO)] 문항 1~11 자동 입력...', 'info', 'NGO');
        await activeTarget.evaluate(({ sNum }) => {
          const box = Array.from(document.querySelectorAll('[question-name^="KBPI_NGO"]')).find(el => el.offsetParent !== null) || document;
          const setTxt = (inp, val) => {
            if (!inp || inp.disabled || inp.readOnly) return;
            inp.focus();
            inp.value = String(val);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(String(val)).trigger('input').trigger('change');
            inp.blur();
          };

          const ngoDomestic = ['월드비전', '초록우산', '굿네이버스'];
          const ngoOverseas = ['유니세프', '월드비전', '세이브더칠드런'];
          const assocWords = ['어린이 후원', '국제 구호', '이웃 나눔', '아동 복지', '긴급 의료구호'];

          const allTxt = Array.from(box.querySelectorAll('input[type="text"], textarea, input:not([type])'))
            .filter(el => el.offsetParent !== null && !el.disabled && !el.readOnly && !['radio', 'checkbox', 'hidden', 'button'].includes(el.type));
          allTxt.forEach((inp, idx) => {
            const cName = inp.getAttribute('custom-save-name') || inp.name || '';
            if (/_1_1$|^Q?1_1$/.test(cName)) setTxt(inp, ngoDomestic[sNum % ngoDomestic.length]);
            else if (/_1_2$|^Q?1_2$/.test(cName)) setTxt(inp, ngoDomestic[(sNum + 1) % ngoDomestic.length]);
            else if (/_1_[34]$|^Q?1_[34]$/.test(cName)) setTxt(inp, '');
            else if (/_2_1$|^Q?2_1$/.test(cName)) setTxt(inp, ngoOverseas[sNum % ngoOverseas.length]);
            else if (/_2_2$|^Q?2_2$/.test(cName)) setTxt(inp, ngoOverseas[(sNum + 1) % ngoOverseas.length]);
            else if (/_2_[34]$|^Q?2_[34]$/.test(cName)) setTxt(inp, '');
            else if (!inp.value) setTxt(inp, assocWords[(sNum + idx) % assocWords.length]);
          });

          const radios = Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)'));
          const byGroup = new Map();
          radios.forEach(r => {
            const k = r.getAttribute('custom-save-name') || r.name || '';
            if (!k) return;
            if (!byGroup.has(k)) byGroup.set(k, []);
            byGroup.get(k).push(r);
          });
          let gIdx = 0;
          for (const grp of byGroup.values()) {
            const visGrp = grp.filter(r => r.offsetParent !== null || r.closest('label, td, div')?.offsetParent !== null);
            if (visGrp.length > 0 && !visGrp.some(r => r.checked)) {
              const noOpt = visGrp.find(r => /아니오|모른다|없다/.test((r.closest('label, span, div')?.innerText || '').trim()));
              const pick = noOpt || visGrp[(sNum + gIdx) % visGrp.length];
              pick.click();
              pick.checked = true;
              if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
            }
            gIdx++;
          }
        }, { sNum: Math.floor(rng() * 100) });

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [KBPI_DIAG_* 특수 블록] 가정용보일러 · 신용카드 · 자동차배터리 세부진단
      if (info.screenType === 'KBPI_DIAG_SPECIAL') {
        emitLog(`[특수 진단 블록: ${info.qNameAttr}] 조건부 문항 순차 응답...`, 'info', 'DIAG');
        await activeTarget.evaluate(async ({ isBoilerSkip, sNum }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = Array.from(document.querySelectorAll('[question-name^="KBPI_DIAG_"]')).find(el => el.offsetParent !== null) || document;

          // 보일러(BOILER): 구입/사용 경험 ELIGIBLE='2'(아니오) 선택 시 즉시 검증 통과 가능
          const eligRadios = Array.from(box.querySelectorAll('input[type="radio"][custom-save-name="ELIGIBLE"]'));
          if (eligRadios.length >= 2) {
            const wantCode = isBoilerSkip ? '2' : '1';
            const pickElig = eligRadios.find(r => r.value === wantCode) || eligRadios[0];
            pickElig.click();
            pickElig.checked = true;
            if (typeof window.$ !== 'undefined') window.$(pickElig).prop('checked', true).trigger('change');
            await waitMs(200);
            if (wantCode === '2') return;

            const purRadios = Array.from(box.querySelectorAll('input[type="radio"][custom-save-name="PURCHASE"]'));
            if (purRadios[0]) {
              purRadios[0].click();
              purRadios[0].checked = true;
              if (typeof window.$ !== 'undefined') window.$(purRadios[0]).prop('checked', true).trigger('change');
              await waitMs(180);
            }
          }

          // 조건부 섹션이 열릴 수 있으므로 최대 4회 반복 스윕
          for (let pass = 0; pass < 4; pass++) {
            const radios = Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)'))
              .filter(r => r.offsetParent !== null || r.closest('label, div, td')?.offsetParent !== null);
            const radGroups = new Map();
            radios.forEach(r => {
              const k = r.getAttribute('custom-save-name') || r.name || '';
              if (!k) return;
              if (!radGroups.has(k)) radGroups.set(k, []);
              radGroups.get(k).push(r);
            });
            for (const grp of radGroups.values()) {
              if (grp.some(r => r.checked)) continue;
              const nonEtc = grp.filter(r => !/기타/.test((r.closest('label, span, div')?.innerText || '').trim()));
              const pick = (nonEtc.length > 0 ? nonEtc : grp)[sNum % Math.max(1, (nonEtc.length || grp.length))];
              if (pick) {
                pick.click();
                pick.checked = true;
                if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
              }
            }
            await waitMs(150);

            // 복수선택 체크박스 섹션
            const diagSections = Array.from(box.querySelectorAll('[data-diag]')).filter(sec => sec.offsetParent !== null);
            for (const sec of diagSections) {
              const cbs = Array.from(sec.querySelectorAll('input[type="checkbox"]:not(:disabled)')).filter(c => c.offsetParent !== null);
              if (cbs.length > 0 && !cbs.some(c => c.checked)) {
                const validCbs = cbs.filter(c => !/기타|없음|모름/.test((c.closest('label, span, div')?.innerText || '').trim()));
                const targetCb = (validCbs.length > 0 ? validCbs : cbs)[sNum % Math.max(1, validCbs.length || cbs.length)];
                if (targetCb) {
                  targetCb.click();
                  targetCb.checked = true;
                  if (typeof window.$ !== 'undefined') window.$(targetCb).prop('checked', true).trigger('change');
                }
              }
            }

            // 순위/일반 select
            const sels = Array.from(box.querySelectorAll('select:not(:disabled)')).filter(s => s.offsetParent !== null);
            const chosenByPrefix = new Map();
            for (const sel of sels) {
              const cName = sel.getAttribute('custom-save-name') || sel.name || '';
              const basePrefix = cName.replace(/_[12]$/, '');
              const prevVal = chosenByPrefix.get(basePrefix) || '';
              if (!sel.value) {
                const validOpts = Array.from(sel.options).filter(o =>
                  o.value !== '' &&
                  o.value !== prevVal &&
                  !/선택|기타|정보탐색하지|없음/.test(o.text)
                );
                const pickOpt = validOpts[sNum % Math.max(1, validOpts.length)] || Array.from(sel.options).find(o => o.value !== '' && o.value !== prevVal);
                if (pickOpt) {
                  sel.value = pickOpt.value;
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(sel).val(pickOpt.value).trigger('change');
                  chosenByPrefix.set(basePrefix, pickOpt.value);
                }
              } else {
                chosenByPrefix.set(basePrefix, sel.value);
              }
            }

            // 주관식 텍스트 (기타 입력칸 제외)
            box.querySelectorAll('input[type="text"]:not(:disabled), textarea:not(:disabled)').forEach(inp => {
              if (inp.offsetParent === null || inp.readOnly) return;
              const cName = inp.getAttribute('custom-save-name') || inp.name || '';
              if (/_ETC$/i.test(cName) || inp.closest('[data-other]')) return;
              if (!String(inp.value || '').trim()) {
                inp.value = '품질이 우수하고 신뢰가 감';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(inp).val(inp.value).trigger('input').trigger('change');
              }
            });
            await waitMs(150);
          }
        }, { isBoilerSkip: age <= 24, sNum: Math.floor(rng() * 100) });

        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.1] DQ1 정보 습득 경로(2개 응답): '생성형 AI' · '신문/잡지/카탈로그' · '기타' 제외 랜덤 2개 선택
      // =========================================================================
      if (info.screenType === 'DQ1_INFO_SOURCE') {
        const availableOpts = await activeTarget.evaluate(() => {
          const box = document.querySelector('[question-name="DQ1"]') || document;
          return Array.from(box.querySelectorAll('input[type="checkbox"]:not(:disabled)'))
            .filter(cb => cb.offsetParent !== null || cb.closest('label, div')?.offsetParent !== null)
            .map(cb => ({
              akey: cb.getAttribute('akey') || cb.value || '',
              name: cb.name || '',
              label: (cb.closest('label, li, div')?.innerText || '').replace(/\s+/g, ' ').trim()
            }));
        });

        const pickedTwo = pickKbpiDq1Keys(availableOpts, rng);
        const targetAkeys = pickedTwo.map(o => String(o.akey));

        await activeTarget.evaluate(async ({ akeys }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = document.querySelector('[question-name="DQ1"]') || document;
          const cbs = Array.from(box.querySelectorAll('input[type="checkbox"]:not(:disabled)'));

          for (const cb of cbs) {
            if (cb.checked) {
              cb.click();
              if (cb.checked) {
                cb.checked = false;
                if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', false).trigger('change');
              }
            }
          }
          await waitMs(100);

          for (const ak of akeys) {
            const cb = cbs.find(c => String(c.getAttribute('akey') || c.value) === String(ak));
            if (cb && !cb.checked) {
              cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', true).trigger('change');
              await waitMs(90);
            }
          }
        }, { akeys: targetAkeys });

        emitLog(
          `[DQ1 정보습득 경로 (3.1)] 생성형 AI·신문잡지·기타 제외 랜덤 2개 선택 완료 ➔ [${pickedTwo.map(x => x.label).join(', ')}]`,
          'info',
          'DQ1'
        );
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.2] ZQ1 ~ ZQ5_2 통계처리 배경변인: 구글 스프레드시트 데이터 기반 순차 자동 선택
      // =========================================================================
      if (info.screenType === 'ZQ_DEMOGRAPHICS') {
        const zqPlan = resolveKbpiZqAnswers({
          ...slotData,
          ...demoEnriched,
          age,
          ageGroup
        });

        const zqApplied = await activeTarget.evaluate(async ({ plan }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const pickedLabels = [];

          const selectZqRadio = async (qName, akey, etcText = '') => {
            const box = document.querySelector(`[question-name="${qName}"]`) || document;
            let r = box.querySelector(`input[type="radio"][qname="${qName}"][akey="${akey}"]`) ||
              box.querySelector(`input[type="radio"][akey="${akey}"]`);

            // ZQ5_2에서 [ZQ5_1=1](1인가구) HIDE 조건으로 해당 보기가 숨겨진 경우 5번(해당사항 없음) 안전 폴백
            if (qName === 'ZQ5_2' && (!r || r.disabled || (r.offsetParent === null && r.closest('label, div')?.offsetParent === null))) {
              r = box.querySelector('input[type="radio"][qname="ZQ5_2"][akey="5"]') ||
                Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)')).pop();
            }

            if (r && !r.disabled) {
              if (!r.checked) r.click();
              r.checked = true;
              r.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(r).prop('checked', true).trigger('change');

              if (etcText) {
                await waitMs(80);
                const etcInp = box.querySelector('input[data-column="TEXT_1"], input.input-etc, input[type="text"]');
                if (etcInp && !etcInp.disabled) {
                  etcInp.value = etcText;
                  etcInp.dispatchEvent(new Event('input', { bubbles: true }));
                  etcInp.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(etcInp).val(etcText).trigger('input').trigger('change');
                }
              }

              const lb = (r.closest('label, li, div')?.innerText || '').replace(/\s+/g, ' ').trim();
              pickedLabels.push(`${qName}=${lb || akey}`);
            }
          };

          await selectZqRadio('ZQ1', plan.zq1Key);
          await waitMs(130);
          await selectZqRadio('ZQ2', plan.zq2Key);
          await waitMs(130);
          await selectZqRadio('ZQ3', plan.zq3Key, plan.zq3EtcText);
          await waitMs(130);
          await selectZqRadio('ZQ4', plan.zq4Key);
          await waitMs(130);
          await selectZqRadio('ZQ5', plan.zq5Key);
          await waitMs(130);
          await selectZqRadio('ZQ5_1', plan.zq5_1Key);
          await waitMs(220); // ZQ5_2 DYNAMIC_REMAKE 반영 대기
          await selectZqRadio('ZQ5_2', plan.zq5_2Key);
          await waitMs(120);

          return pickedLabels;
        }, { plan: zqPlan });

        emitLog(
          `[통계 배경변인 ZQ1~ZQ5_2 (3.2 시트기반)] [${zqApplied.join(' | ')}] 선택 완료`,
          'info',
          'ZQ1_5'
        );
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.3] ZQ6 한국능률협회컨설팅 패널 가입 의향: 전원 '없다(akey=2)' 선택 + 완료 직전 안전 대기
      // =========================================================================
      if (info.screenType === 'ZQ6_PANEL_INTENT') {
        await activeTarget.evaluate(() => {
          const box = document.querySelector('[question-name="ZQ6"]') || document;
          const noRadio = box.querySelector('input[type="radio"][qname="ZQ6"][akey="2"]') ||
            Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)'))
              .find(r => /없다|아니오/.test((r.closest('label, li, div')?.innerText || '').trim())) ||
            box.querySelectorAll('input[type="radio"]:not(:disabled)')[1];
          if (noRadio) {
            if (!noRadio.checked) noRadio.click();
            noRadio.checked = true;
            noRadio.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(noRadio).prop('checked', true).trigger('change');
          }
        });

        emitLog('[패널 가입 의향 ZQ6 (3.3)] "없다(2)" 선택 완료!', 'info', 'ZQ6');

        // AGENTS.md 제10원칙: ZQ6='없다'일 때 [다음] 클릭 시 즉시 COMPLETE(최종 제출)로 넘어가므로 안전가드 활성 시 여기서 정지!
        if (safetyGuard || policy.stopBeforeFinalSubmit !== false) {
          emitLog(
            `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 마지막 문항 ZQ6("없다")까지 모든 응답 입력을 마치고 최종 제출 직전(${info.progressPct || 100}%)에서 안전 정지했습니다!`,
            'info',
            'SAFE_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'FINAL_GATE',
            statusLabel: '완료직전 대기(ZQ6)',
            quotaStatus: 'pilot_done',
            progress: '99%',
            categoryConfigs,
            gps,
            surveyDistrict,
            surveyDong
          };
        }

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [종료 안내 화면 / 0컨트롤 완료 관문] Rule 10 즉시 안전 대기
      if (
        (info.screenType === 'FINAL_SUBMIT_GATE' || (seenCategoriesOrder.length >= 1 && info.visibleControlCount === 0)) &&
        (safetyGuard || policy.stopBeforeFinalSubmit !== false)
      ) {
        emitLog(
          `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 종료 직전 관문(${info.qNameAttr || info.screenType}, ${info.progressPct || 99}%)에서 안전 정지했습니다.`,
          'info',
          'SAFE_WAIT'
        );
        return {
          success: true,
          safetyStopped: true,
          stoppedAt: 'FINAL_GATE',
          statusLabel: `완료직전 대기(${info.progressPct || 99}%)`,
          quotaStatus: 'pilot_done',
          progress: `${info.progressPct || 99}%`,
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [기타 미분류 일반 문항 폴백]
      await activeTarget.evaluate(async ({ seedNum }) => {
        const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
        const isForbidden = (txt) => /(^|\s)기타(\s|$)|모름|거절|무응답/.test(txt);
        const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document.body;

        const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
        const groups = new Map();
        for (const r of radios) {
          if (!groups.has(r.name)) groups.set(r.name, []);
          groups.get(r.name).push(r);
        }
        for (const grp of groups.values()) {
          if (grp.some(r => r.checked)) continue;
          const valid = grp.filter(r => !isForbidden((r.closest('label, li, tr, td, div')?.innerText || '').trim()));
          const pick = valid[seedNum % Math.max(1, valid.length)] || grp[0];
          if (pick) {
            pick.click();
            pick.checked = true;
            pick.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
            await waitMs(80);
          }
        }
      }, { seedNum: Math.floor(rng() * 1000) });

      await surveyPage.waitForTimeout(450);
      const clickedBtn = await clickNextButton(activeTarget);
      if (!clickedBtn && stopAtStep === 'FINAL_GATE') {
        return {
          success: true,
          safetyStopped: true,
          stoppedAt: 'FINAL_GATE',
          statusLabel: '완료직전 대기',
          quotaStatus: 'pilot_done',
          progress: `${info.progressPct || 99}%`,
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }
    }

    throw new Error('최대 단계 반복 횟수(450회)를 초과했습니다.');
  } catch (err) {
    if (htmlInspectionDump) {
      htmlInspectionDump.finalOutcome = { success: false, error: err.message };
    }
    emitLog(`[K-BPI 실행 오류] ${err.message}`, 'error', 'ERROR');
    return {
      success: false,
      error: err.message,
      categoryConfigs,
      gps,
      surveyDistrict,
      surveyDong
    };
  } finally {
    if (htmlInspectionDump && captureHtmlDumpPath) {
      try {
        htmlInspectionDump.seenCategories = seenCategoriesOrder;
        htmlInspectionDump.alertHistory = alertHistory;
        htmlInspectionDump.categoryConfigs = categoryConfigs;
        if (!htmlInspectionDump.finalOutcome) {
          htmlInspectionDump.finalOutcome = { success: true, note: '안전 대기 지점 도달 및 캡처 완료' };
        }
        const dumpDir = path.dirname(captureHtmlDumpPath);
        if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
        writeJsonAtomicSync(captureHtmlDumpPath, htmlInspectionDump);
        emitLog(`[HTML 구조 분석 저장 완료] 총 ${htmlInspectionDump.screens.length}개 화면 · 네트워크 패킷 ${htmlInspectionDump.networkJoinPayloads.length}건 저장됨`, 'info', 'HTML_DUMP');
      } catch (dumpErr) {
        console.warn('[K-BPI HTML 분석 리포트 저장 경고]', dumpErr.message);
      }
    }
    if (!ownsBrowser && openedSurveyTab) {
      await openedSurveyTab.close().catch(e => console.warn('[K-BPI 공유세션 탭 닫기 경고]', e.message));
    }
    if (ownsBrowser && browser) {
      await browser.close().catch(e => console.warn('[K-BPI Runner Browser 종료 경고]', e.message));
    }
  }
}

/**
 * [150명 고속 일괄 신상명세 등록 & 배정 브랜드 전수 스캔 엔진]
 * - CAPI 포털에 단 1회 로그인한 뒤 공유 브라우저 세션에서 대상 슬롯들을 순차 진입하여
 *   GP1(GPS) -> WOKERD_DUP(신상명세 확인) -> SQ1~SQ3 -> M_CHECK(노원구/남동구)까지만 수행하고
 *   배정된 18~20개 브랜드 목록(INDUSTRY_ORDER)을 스캔한 직후 탭을 닫아 고속으로 처리합니다.
 */
export async function scanKmacKbpiBrandsBatch({
  campaign = null,
  targets = [],
  policy: rawPolicy = {},
  shouldStop = () => false,
  onItemDone = async () => {},
  onProgress = () => {}
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_POLICY,
    ...(campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {}),
    ...(rawPolicy || {})
  };
  const loginId = String(campaign?.loginId || KBPI_DEFAULT_LOGIN_ID).trim();
  const loginPw = String(campaign?.loginPw || loginId).trim();
  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';

  let browser = null;
  let scannedSuccessCount = 0;
  let skippedAlreadyScannedCount = 0;
  let failCount = 0;

  const emitBatch = (message, level = 'info', step = 'SCAN_BATCH', extra = {}) => {
    onProgress({ step, message, level, ...extra });
  };

  try {
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors'],
      ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
    });

    const createSharedSession = async () => {
      const context = await browser.newContext({
        viewport: { width: 1400, height: 920 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        geolocation: { latitude: 37.654192, longitude: 127.056794, accuracy: 14 },
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true
      });
      const rootPage = await context.newPage();
      const attachDialog = (pg) => {
        pg.on('dialog', async (dialog) => {
          const msg = dialog.message() || '';
          emitBatch(`[설문 알림] 🔔 "${msg}"`, 'warn', 'ALERT');
          await dialog.accept().catch(e => console.warn('[Dialog 수락 경고]', e.message));
        });
      };
      attachDialog(rootPage);
      context.on('page', newPg => attachDialog(newPg));

      const listPage = await loginAndEnterKbpiCapiList({
        context,
        page: rootPage,
        loginId,
        loginPw,
        emitLog: (m, lv) => emitBatch(m, lv, 'LOGIN')
      });
      return { context, listPage };
    };

    let sharedSession = await createSharedSession();

    const resetListPageToFirst = async (lp) => {
      await lp.evaluate(() => {
        const p1 = document.querySelector('.pagination .page-link[data-page="1"], .paging a[data-page="1"], a[data-page="1"], button[data-page="1"]');
        if (p1 && !p1.closest('.active')) {
          p1.click();
        }
      }).catch(err => console.warn('[K-BPI 1페이지 복귀 경고]', err.message));
      await lp.waitForTimeout(550);
    };

    for (let i = 0; i < targets.length; i++) {
      if (shouldStop()) {
        emitBatch('사용자에 의해 신상명세 등록 및 브랜드 스캔 배치가 안전하게 중지되었습니다.', 'warn', 'STOPPED');
        break;
      }

      const item = targets[i];
      const seq = Number(item.seq || item.index || (i + 1));
      const existingCats = (item.categoryConfigs || []).filter(c => c && c.categoryName);

      // 이미 15개 이상 전수 스캔 완료된 항목(예: #1 이상진 18개 스캔 + 99% 대기)은 불필요한 재진입 생략
      if (existingCats.length >= 15 && !policy.forceRescanAll) {
        skippedAlreadyScannedCount++;
        emitBatch(
          `[${i + 1}/${targets.length}] #${seq} ${item.name} (${item.uid}) — 이미 ${existingCats.length}개 브랜드 스캔 완료 상태 보존`,
          'info',
          'SKIP_SCANNED',
          { quotaIndex: seq, itemNumber: i + 1, totalItems: targets.length }
        );
        await onItemDone(item, {
          success: true,
          skipped: true,
          scannedCount: existingCats.length,
          statusLabel: item.status || '신상등록·스캔완료',
          quotaStatus: item.quotaStatus || 'scanned',
          categoryConfigs: item.categoryConfigs
        }, i, targets.length);
        continue;
      }

      emitBatch(
        `[${i + 1}/${targets.length}] #${seq} ${item.name} (${item.region}/${item.gender}/${item.ageGroup}, ${item.uid}) 신상명세 등록 & 출제 브랜드 스캔 시작...`,
        'info',
        'SCAN_ITEM',
        { quotaIndex: seq, itemNumber: i + 1, totalItems: targets.length }
      );

      let res = await runKmacKbpiSurvey({
        campaign,
        slotData: item,
        policy,
        quotaIndex: seq,
        pilotMode: false,
        safetyGuard: true,
        stopAtStepOverride: 'SCAN_BRANDS',
        sharedSession,
        onProgress: (info) => emitBatch(info.message, info.level, info.step, {
          quotaIndex: seq,
          itemNumber: i + 1,
          totalItems: targets.length
        })
      });

      // 페이지네이션 역방향이거나 세션 만료로 슬롯 미발견 시 1페이지 복귀/재로그인 후 1회 자동 재시도
      if (!res.success && /슬롯을 찾을 수 없습니다|Target page, context or browser has been closed/i.test(String(res.error || ''))) {
        emitBatch(`[세션/페이지 복구 재시도] #${seq} ${item.name} 슬롯 재탐색 중...`, 'warn', 'RETRY');
        try {
          if (/closed/i.test(String(res.error || ''))) {
            await sharedSession.context.close().catch(e => console.warn(e.message));
            sharedSession = await createSharedSession();
          } else {
            await resetListPageToFirst(sharedSession.listPage);
          }
          res = await runKmacKbpiSurvey({
            campaign,
            slotData: item,
            policy,
            quotaIndex: seq,
            pilotMode: false,
            safetyGuard: true,
            stopAtStepOverride: 'SCAN_BRANDS',
            sharedSession,
            onProgress: (info) => emitBatch(info.message, info.level, info.step, {
              quotaIndex: seq,
              itemNumber: i + 1,
              totalItems: targets.length
            })
          });
        } catch (retryErr) {
          emitBatch(`[재시도 경고] ${retryErr.message}`, 'warn', 'RETRY_WARN');
        }
      }

      if (res.success) {
        scannedSuccessCount++;
      } else {
        failCount++;
      }

      await onItemDone(item, res, i, targets.length);
    }

    await sharedSession.context.close().catch(e => console.warn('[K-BPI Scan Context 종료 경고]', e.message));

    return {
      success: true,
      scannedSuccessCount,
      skippedAlreadyScannedCount,
      failCount,
      totalProcessed: scannedSuccessCount + skippedAlreadyScannedCount + failCount
    };
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn('[K-BPI Scan Browser 종료 경고]', e.message));
    }
  }
}

