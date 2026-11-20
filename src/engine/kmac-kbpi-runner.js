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
  '소주', '맥주', '위스키', '주류', '숙취', '담배',
  '자동차', '타이어', '주유소', '운전자보험', '생명보험', '손해보험', '신용카드', '증권', '대출',
  '음식물처리기', '김치냉장고', '식기세척기', '비데', '정수기', '안마의자', '침대', '보일러'
];

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
          channels: Array.isArray(parsed.channels) && parsed.channels.length >= 2
            ? parsed.channels
            : (baseDict.channelPools?.food_living || ['편의점', '동네슈퍼', '이마트', '쿠팡'])
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

  const groupKey = matchedEntry?.group || (
    /은행|카드|보험|증권|통신|인터넷|앱|쇼핑몰|OTT|택배|병원|의료|대학|교육|학습/.test(cleanCat)
      ? 'finance_telecom_service'
      : (/TV|냉장고|세탁기|에어컨|청소기|정수기|처리기|밥솥|노트북|스마트폰|비데|침대|보일러|아파트/.test(cleanCat)
        ? 'appliance_digital'
        : (/치킨|피자|커피전문점|베이커리|패스트푸드|외식/.test(cleanCat)
          ? 'dining_franchise'
          : (/샴푸|화장품|운동화|의류|아웃도어|뷰티|백화점|면세점/.test(cleanCat)
            ? 'fashion_beauty'
            : 'food_living')))
  );

  const customFoodChannels = String(policy.customFoodLivingChannels || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const channels = (groupKey === 'food_living' && customFoodChannels.length > 0)
    ? customFoodChannels
    : (baseDict.channelPools?.[groupKey] || baseDict.channelPools?.food_living || ['편의점', '동네슈퍼', '이마트', '쿠팡', '홈플러스']);

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
 * 우선순위: 1) 시트 브랜드명 일치 설정 -> 2) 시트 슬롯 순번 설정 -> 3) 10대 비적합 품목 안전 보정 -> 4) 기본 90:10 확률
 */
export function decideCategoryPurchaseExp({
  categoryName,
  categorySlotIdx = 0,
  categoryConfigs = [],
  ageGroup = '',
  age = 30,
  respondentAge,
  policy = {},
  rng = Math.random
}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const effAge = respondentAge !== undefined ? Number(respondentAge) : Number(age);

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

  // 3) 10대(미성년) 응답자에게 주류/자동차/대형가전 등 비적합 품목이 출제된 경우 자동 '없음' 안전 보정
  const isTeen = String(ageGroup || '').includes('10대') || (effAge > 0 && effAge <= 19);
  if (isTeen && policy.teenAutoNoneUnfitCategories !== false) {
    if (TEEN_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
      return '없음';
    }
  }

  // 4) 가이드 기본 비율 (구입 90% : 없음 10%)
  const yesRate = Number(policy.purchaseYesRate ?? 90);
  return (rng() * 100 < yesRate) ? '있음' : '없음';
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
 * 현재 설문 화면의 단계 유형과 출제 산업군명(예: '생수', '음식물처리기')을 정밀 분류
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

    // 산업군명 추출: ‘생수 브랜드’에 대한 내용입니다. 또는 지금부터 【생수】 브랜드에 대한 질문입니다.
    let categoryName = '';
    const bracketMatch = bodyText.match(/【\s*([^】]+?)\s*】/);
    const quoteBrandMatch = bodyText.match(/[‘'"]\s*([^’'"]+?)\s*브랜드\s*[’'"]\s*에\s*대한\s*내용/);
    if (bracketMatch) {
      categoryName = bracketMatch[1].trim();
    } else if (quoteBrandMatch) {
      categoryName = quoteBrandMatch[1].trim();
    }

    // 진행률 퍼센트 및 GetData 문항 코드(qNameAttr) 추출
    const pctMatch = bodyText.match(/(\d{1,3})\s*%/);
    const progressPct = pctMatch ? Number(pctMatch[1]) : null;
    const bodySnippet = bodyText.replace(/\s+/g, ' ').slice(0, 220);
    const qTypeEl = document.querySelector('[question-type]');
    const qNameEl = Array.from(document.querySelectorAll('[question-name], [qname], [data-qname], [id^="BOX_"]'))
      .find(el => el.offsetParent !== null);
    const qNameAttr = qNameEl
      ? (qNameEl.getAttribute('question-name') || qNameEl.getAttribute('qname') || qNameEl.getAttribute('data-qname') || qNameEl.id.replace(/^BOX_/, ''))
      : '';
    const visibleControlCount = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea, .s-gradeclick')
    ).filter(el => el.offsetParent !== null).length;
    const domMeta = `qName=${qNameAttr || '-'},qType=${qTypeEl?.getAttribute('question-type') || '-'},grade=${document.querySelectorAll('.s-gradeclick').length},sel=${document.querySelectorAll('select').length},rad=${document.querySelectorAll('input[type="radio"]').length},cb=${document.querySelectorAll('input[type="checkbox"]').length},txt=${document.querySelectorAll('input[type="text"],input[type="number"],textarea').length}`;

    // 설문 완료 화면 감지
    if (/설문이\s*종료|조사가\s*완료|응답해\s*주셔서\s*감사|참여해\s*주셔서\s*대단히\s*감사|수고하셨습니다/.test(bodyText) &&
        visibleControlCount === 0 &&
        !document.querySelector('#next')) {
      return { screenType: 'COMPLETED', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 1) GP1 위치 확인
    if (/GP1/.test(bodyText) && /현재\s*위치를\s*확인/.test(bodyText)) {
      return { screenType: 'GP1', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 2) 응답자 신상정보 등록 (이름 / 성별 / 연령(만) / 휴대폰 / 전화번호 + 응답자 확인)
    if (/응답자\s*확인/.test(bodyText) && /연령\s*\(\s*만\s*\)/.test(bodyText)) {
      return { screenType: 'PROFILE', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 3) SQ1 스크리닝 (비산업군 화면에서 SQ1 또는 '모두 없다' 보기 출현 시)
    if (!categoryName && (/\bSQ\s*1\b/i.test(bodyText) || /모두\s*없다/.test(bodyText) || /다음\s*업종|종사하는\s*가족|시장조사|광고대행사/.test(bodyText))) {
      return { screenType: 'SQ1', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 4) 문항 1 (1-1, 1-2, 1-3, 1-4 비보조 인지도)
    if (/1-1/.test(bodyText) && /가장\s*먼저\s*생각나는\s*브랜드/.test(bodyText)) {
      return { screenType: 'Q1_UNAIDED', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 5) 문항 2 (보조 인지도 체크박스)
    if (/알고\s*계시는\s*브랜드를\s*모두/.test(bodyText)) {
      return { screenType: 'Q2_AIDED', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 6) 문항 3 (1점~5점 평가 매트릭스 + 11~13번)
    if (/1점\s*~\s*5점으로\s*평가/.test(bodyText) || /전반적으로\s*만족한다/.test(bodyText)) {
      return { screenType: 'Q3_MATRIX', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 7) 문항 4-1 (구입 채널 경로 주관식)
    if (/\b4-1\b/.test(bodyText) || /어느\s*채널\s*\(\s*경로\s*\)\s*을?\s*통해서/.test(bodyText)) {
      return { screenType: 'Q4_1_CHANNEL', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 8) 문항 4 (가장 최근에 구입/이용/방문한 브랜드 — 소매/서비스/제품 전 산업군 호환)
    if (/가장\s*최근에[^\n]{0,35}(구입|이용|방문|사용)/.test(bodyText)) {
      return { screenType: 'Q4_RECENT_BRAND', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    // 9) 산업군(categoryName)이 명시된 본 설문 문항(4, 5, 6, 7, 8) 배지 번호 판별!
    let firstBadge = '';
    if (categoryName) {
      const badgeTexts = Array.from(document.querySelectorAll('div, span, th, td, strong'))
        .filter(el => el.children.length === 0 && el.offsetParent !== null)
        .map(el => (el.innerText || '').trim())
        .filter(t => /^(4|5|6|7|8)$/.test(t));
      firstBadge = badgeTexts[0] || '';

      if (firstBadge === '4') {
        return { screenType: 'Q4_RECENT_BRAND', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
      }
      if (firstBadge === '5' || /주\s*구입|가장\s*선호|주로\s*이용|가장\s*자주/.test(bodyText)) {
        return { screenType: 'Q5_SAME_AS_Q4', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
      }
      if (firstBadge === '6' || (document.querySelectorAll('input[type="radio"]').length === 2 && /예/.test(bodyText) && /아니오/.test(bodyText))) {
        return { screenType: 'Q6_YES_NO', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
      }
      if (firstBadge === '7' || document.querySelectorAll('.s-gradeclick').length >= 2 || (/1\s*순위/.test(bodyText) && /2\s*순위/.test(bodyText))) {
        return { screenType: 'Q7_RANK_1_2', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
      }
      if (firstBadge === '8') {
        return { screenType: 'Q8_MULTI_2', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
      }
    }

    // 최종 제출/종료 직전 관문 판별 (GetData END/OUTRO/동의서 및 종료 문구 포함)
    const hasFinalBtn = Array.from(document.querySelectorAll('#next, button, input[type="button"], input[type="submit"], a'))
      .some(el => /조사\s*완료|설문\s*완료|최종\s*제출|완료하기|설문\s*종료/.test((el.innerText || el.value || '').trim()));
    const isEndOutroScreen = /^(END|OUTRO|FINISH|COMPLETE|LAST|SIGN|AGREE)/i.test(qNameAttr) ||
      /설문을?\s*마치|응답을?\s*완료하시려면|참여해\s*주셔서\s*(대단히\s*)?감사|응답해\s*주셔서\s*감사|수고하셨습니다|설문이\s*모두\s*끝났|개인정보\s*수집.*동의/.test(bodyText);
    if (hasFinalBtn || isEndOutroScreen) {
      return { screenType: 'FINAL_SUBMIT_GATE', qNameAttr, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };
    }

    return {
      screenType: 'GENERIC_STEP',
      qNameAttr,
      visibleControlCount,
      categoryName,
      progressPct,
      badge: firstBadge,
      buttonTexts,
      bodySnippet,
      domMeta
    };
  });
}

async function clickNextButton(target) {
  const clicked = await target.evaluate(() => {
    // GetData 표준 #next 버튼 최우선 확인
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
  captureHtmlDumpPath = null,
  onProgress = null
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_POLICY,
    ...(campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {}),
    ...(rawPolicy || {})
  };

  const stopAtStep = pilotMode ? (policy.pilotStopAtStep || 'Q4') : (safetyGuard ? 'FINAL_GATE' : 'NONE');
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

  const gps = (slotData.latitude && slotData.longitude)
    ? { baseLabel: slotData.gpsLabel || (region.includes('인천') ? '인천광역시청' : '서울 노원구청'), latitude: Number(slotData.latitude), longitude: Number(slotData.longitude) }
    : computeKbpiGps(region, finalId, seq);

  const categoryConfigs = normalizeCategoryConfigs(slotData.categoryConfigs || [], 8);
  const rng = makeSeededRng(`${uid}_${finalId}_${seq}_${respondentName}`);

  const emitLog = (message, level = 'info', step = '진행') => {
    if (typeof onProgress === 'function') {
      onProgress({ step, message, level });
    }
  };

  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';
  let browser = null;
  const alertHistory = [];
  const seenCategoriesOrder = [];
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
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors'],
      ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
    });

    const context = await browser.newContext({
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

    // 브라우저 Geolocation API 2중 강제 오버라이드
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

    // 1. 통합 로그인 -> CAPI 이동 -> K-BPI 슬롯 목록 진입
    const listPage = await loginAndEnterKbpiCapiList({
      context,
      page: rootPage,
      loginId,
      loginPw,
      emitLog: (m, lv) => emitLog(m, lv, 'LOGIN')
    });

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
        gps
      };
    }

    let surveyPage = slotEntry.page;
    await surveyPage.waitForTimeout(1500);

    // 산업군별 런타임 상태 추적
    const categoryRuntimeMap = new Map();

    const getOrInitCategoryState = async (catNameRaw) => {
      const cleanCat = String(catNameRaw || '').replace(/브랜드$/g, '').trim() || `품목${seenCategoriesOrder.length + 1}`;
      if (!categoryRuntimeMap.has(cleanCat)) {
        const catIdx = seenCategoriesOrder.length;
        seenCategoriesOrder.push(cleanCat);

        const meta = await resolveCategoryMeta(cleanCat, policy);
        const shuffledBrands = shuffleWithRng(meta.brands, rng);
        const shuffledAdjs = shuffleWithRng(meta.adjectives, rng);
        const shuffledChannels = shuffleWithRng(meta.channels, rng);

        const purchaseExp = decideCategoryPurchaseExp({
          categoryName: cleanCat,
          categorySlotIdx: catIdx,
          categoryConfigs,
          ageGroup,
          age,
          policy,
          rng
        });

        // categoryConfigs 배열에 품목명 및 구입경험(있음/없음) 기록
        while (categoryConfigs.length <= catIdx) {
          categoryConfigs.push({ slot: categoryConfigs.length + 1, categoryName: '', purchaseExp: '' });
        }
        categoryConfigs[catIdx].slot = catIdx + 1;
        categoryConfigs[catIdx].categoryName = cleanCat;
        categoryConfigs[catIdx].purchaseExp = purchaseExp;
        categoryConfigs[catIdx].topBrand = purchaseExp === '없음' ? '없음' : shuffledBrands[0];
        categoryConfigs[catIdx].channel = purchaseExp === '없음' ? '' : shuffledChannels[0];

        categoryRuntimeMap.set(cleanCat, {
          slotIndex: catIdx,
          categoryName: cleanCat,
          purchaseExp,
          unaidedBrands: shuffledBrands.slice(0, 4),
          adjectives: shuffledAdjs,
          selectedChannel: shuffledChannels[0],
          q4SelectedBrand: purchaseExp === '없음' ? '없음' : shuffledBrands[0]
        });

        emitLog(
          `[품목 #${catIdx + 1} 감지: ${cleanCat}] 구입경험="${purchaseExp}" | 상기브랜드=[${shuffledBrands.slice(0, 3).join(', ')}]${purchaseExp === '있음' ? ` | 채널="${shuffledChannels[0]}"` : ''}`,
          'info',
          `CAT${catIdx + 1}`
        );
      }
      return categoryRuntimeMap.get(cleanCat);
    };

    // 3. 단계별 설문 진행 루프
    let sameScreenStuckCount = 0;
    let lastSignature = '';

    for (let stepIter = 0; stepIter < 260; stepIter++) {
      await surveyPage.waitForTimeout(750);

      // 지연 팝업 탭이 새로 열렸다면 최신 설문 탭으로 자동 전환
      const allOpenPages = context.pages().filter(p => p.url() && p.url() !== 'about:blank');
      if (allOpenPages.length > 0 && allOpenPages[allOpenPages.length - 1] !== surveyPage) {
        surveyPage = allOpenPages[allOpenPages.length - 1];
      }

      const activeTarget = await resolveActiveSurveyFrame(surveyPage);

      // GetData 커스텀 레이어 알림창(.modal / .bootbox / .swal2) 감지 시 텍스트 기록 후 자동 닫기
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
      }).catch(() => '');
      if (modalAlertMsg) {
        alertHistory.push(modalAlertMsg);
        emitLog(`[레이어 알림 감지] 🔔 "${modalAlertMsg}"`, 'warn', 'MODAL_ALERT');
        await surveyPage.waitForTimeout(350);
      }

      const info = await classifyCurrentScreen(activeTarget);
      if (info.screenType === 'LOADING') {
        await surveyPage.waitForTimeout(600);
        continue;
      }
      const sig = `${info.screenType}|${info.qNameAttr || ''}|${info.categoryName}|${info.progressPct}`;
      if (sig === lastSignature) {
        sameScreenStuckCount++;
        if (sameScreenStuckCount >= 5) {
          if (htmlInspectionDump) {
            const stuckDom = await activeTarget.evaluate(() => {
              const container = document.querySelector('[question-type], #question, .question-wrap, main') || document.body;
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
              for (const k of customKeys.slice(0, 30)) {
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
            const qBox = document.querySelector('[question-type], #question, .question-box, main') || document.body;
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

      if (info.screenType === 'COMPLETED') {
        emitLog(`[설문 최종 완료] #${seq} ${respondentName} (${uid}) 100% 완료 확인!`, 'info', 'DONE');
        return {
          success: true,
          completed: true,
          statusLabel: '완료',
          quotaStatus: 'completed',
          progress: '100%',
          categoryConfigs,
          gps
        };
      }

      // [GP1] 현재 위치 확인
      if (info.screenType === 'GP1') {
        emitLog(`[GP1 위치 확인] ${gps.baseLabel} 기준 GPS(${gps.latitude}, ${gps.longitude}) 주입 및 [위치 확인] 클릭...`, 'info', 'GP1');
        const locBtn = activeTarget.locator('button:has-text("위치 확인"), a:has-text("위치 확인"), input[value*="위치 확인"], :text-is("위치 확인")').first();
        if ((await locBtn.count()) > 0) {
          await locBtn.click();
          for (let gWait = 0; gWait < 12; gWait++) {
            await surveyPage.waitForTimeout(400);
            const hasCoords = await activeTarget.evaluate(() => /위도\s*:\s*3\d\./.test(document.body?.innerText || ''));
            if (hasCoords) break;
          }
        }
        await clickNextButton(activeTarget);
        continue;
      }

      // [신상정보 등록] 이름 / 성별 / 연령(만) / 휴대폰 또는 전화번호
      if (info.screenType === 'PROFILE') {
        emitLog(`[신상정보 입력] 이름=${respondentName}, 성별=${gender}, 만=${age}세, 연락처=${phone} (${phone.startsWith('010') ? '휴대폰' : '일반전화'})`, 'info', 'PROFILE');
        await activeTarget.evaluate(({ rName, rGender, rAge, rPhone }) => {
          const triggerControl = (el, val) => {
            if (!el || el.disabled) return;
            if (el.tagName === 'SELECT') {
              const matchOpt = Array.from(el.options).find(o => o.value === String(val) || o.text.trim() === String(val));
              if (matchOpt) {
                el.value = matchOpt.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return;
            }
            if (el.readOnly) return;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
          };

          const rows = Array.from(document.querySelectorAll('tr, .form-row, .row, div'));
          // 이름 입력
          const nameInp = document.querySelector('input[placeholder*="이름"]') ||
            rows.find(r => /^이름/.test((r.innerText || '').trim()))?.querySelector('input[type="text"], input:not([type])');
          triggerControl(nameInp, rName);

          // 성별 라디오 클릭
          const labels = Array.from(document.querySelectorAll('label, span'));
          const genderLabel = labels.find(lb => (lb.innerText || '').trim() === rGender);
          if (genderLabel) {
            const rInp = genderLabel.querySelector('input[type="radio"]') ||
              document.getElementById(genderLabel.getAttribute('for') || '') ||
              genderLabel.previousElementSibling;
            if (rInp && rInp.type === 'radio') {
              if (!rInp.checked) rInp.click();
              rInp.checked = true;
              rInp.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              genderLabel.click();
            }
          }

          // 연령(만) 입력
          const ageInp = document.querySelector('input[placeholder*="숫자"]') ||
            rows.find(r => /연령\s*\(\s*만\s*\)/.test(r.innerText || ''))?.querySelector('input[type="number"], input[type="text"], input:not([type])');
          triggerControl(ageInp, rAge);

          // 연락처 하이픈 분리 입력 (010 -> 휴대폰 칸 / 02 등 지역번호 -> 전화번호 칸)
          const parts = String(rPhone || '').split('-').map(s => s.trim()).filter(Boolean);
          if (parts.length === 3) {
            const isMobile = parts[0] === '010';
            const targetRowLabel = isMobile ? '휴대폰' : '전화번호';
            const phoneContainer = rows.filter(r => {
              const t = (r.innerText || '').trim();
              const ctrlCnt = r.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select').length;
              return t.startsWith(targetRowLabel) && ctrlCnt >= 2 && ctrlCnt <= 4;
            }).sort((a, b) => a.innerText.length - b.innerText.length)[0];

            if (phoneContainer) {
              const ctrls = Array.from(
                phoneContainer.querySelectorAll('select, input[type="text"], input[type="tel"], input[type="number"], input:not([type])')
              ).filter(el => el.type !== 'radio' && el.type !== 'checkbox' && el.type !== 'hidden');
              if (ctrls.length >= 3) {
                triggerControl(ctrls[0], parts[0]);
                triggerControl(ctrls[1], parts[1]);
                triggerControl(ctrls[2], parts[2]);
              } else if (ctrls.length === 2) {
                triggerControl(ctrls[0], parts[1]);
                triggerControl(ctrls[1], parts[2]);
              }
            }
          }
        }, { rName: respondentName, rGender: gender, rAge: age, rPhone: phone });

        await surveyPage.waitForTimeout(500);
        await clickNextButton(activeTarget);
        continue;
      }

      // [SQ1] 스크리닝 -> 모두 없다 (단일 체크박스 재클릭 해제 방지)
      if (info.screenType === 'SQ1') {
        emitLog('[SQ1 스크리닝] "모두 없다" 선택...', 'info', 'SQ1');
        await activeTarget.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
            .filter(inp => !inp.disabled);
          let matchedAny = false;

          // 1순위: '모두 없다' / '해당 없음' 단일 배타 옵션 탐색
          for (const inp of inputs) {
            const labelTxt = (inp.closest('label, li, tr, td, div')?.innerText || '').trim();
            if (/모두\s*없다|해당\s*없음|해당사항\s*없음|^없음$/.test(labelTxt)) {
              if (!inp.checked) inp.click();
              inp.checked = true;
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              matchedAny = true;
            }
          }

          // 2순위: 행별 라디오 그룹('있다/없다' 또는 '예/아니오')인 경우 각 그룹의 '없다/아니오'(또는 마지막 보기) 선택
          const radioGroups = new Map();
          for (const r of inputs.filter(x => x.type === 'radio')) {
            if (!radioGroups.has(r.name)) radioGroups.set(r.name, []);
            radioGroups.get(r.name).push(r);
          }
          for (const grp of radioGroups.values()) {
            if (grp.some(x => x.checked)) continue;
            const noneRadio = grp.find(x => /없다|없음|아니오/.test((x.closest('label, li, tr, td, div')?.innerText || '').trim()))
              || grp[grp.length - 1];
            if (noneRadio) {
              noneRadio.click();
              noneRadio.checked = true;
              noneRadio.dispatchEvent(new Event('change', { bubbles: true }));
              matchedAny = true;
            }
          }

          // 3순위: 커스텀 버튼형 보기인 경우
          if (!matchedAny) {
            const leafNone = Array.from(document.querySelectorAll('label, button, span, div')).find(el => {
              const t = (el.innerText || '').trim();
              return el.offsetParent !== null && el.children.length === 0 && /^(모두\s*없다|해당\s*없음)$/.test(t);
            });
            if (leafNone) leafNone.click();
          }
        });
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 1] 1-1 ~ 1-4 비보조 인지도 (브랜드 주관식)
      if (info.screenType === 'Q1_UNAIDED') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const fill4th = (rng() * 100) < Number(policy.unaided4thBrandRate ?? 35) && catState.unaidedBrands.length >= 4;
        emitLog(`[${catState.categoryName} - 문항 1] 1-1="${catState.unaidedBrands[0]}", 1-2="${catState.unaidedBrands[1]}", 1-3="${catState.unaidedBrands[2]}", 1-4="${fill4th ? catState.unaidedBrands[3] : '없음'}"`, 'info', 'Q1');

        await activeTarget.evaluate(({ brands, use4th }) => {
          const triggerVal = (el, val) => {
            if (!el || el.disabled) return;
            el.focus();
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            el.blur();
          };

          const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(inp => inp.offsetParent !== null && !inp.readOnly);
          if (textInputs[0]) triggerVal(textInputs[0], brands[0]);
          if (textInputs[1]) triggerVal(textInputs[1], brands[1]);
          if (textInputs[2]) triggerVal(textInputs[2], brands[2]);

          if (use4th && textInputs[3] && brands[3]) {
            triggerVal(textInputs[3], brands[3]);
          } else {
            // 1-4 영역의 '없음' 체크박스만 정확히 클릭 (마지막 '없음' 체크박스)
            const noneCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
              .filter(cb => {
                const parentTxt = (cb.closest('label, div, td')?.innerText || '').trim();
                return parentTxt.includes('없음') && !cb.disabled;
              });
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

      // [문항 2] 보조 인지도 (1 응답값 포함 + 랜덤 2~4개 추가 선택 + 공식 브랜드 학습)
      if (info.screenType === 'Q2_AIDED') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const extraMin = Number(policy.aidedExtraMin ?? 2);
        const extraMax = Math.max(extraMin, Number(policy.aidedExtraMax ?? 4));
        const extraTargetCount = extraMin + Math.floor(rng() * (extraMax - extraMin + 1));

        const q2Result = await activeTarget.evaluate(({ unaidedList, addCount, randSeed }) => {
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
          const allOfficialLabels = [];
          const uncheckedNormal = [];

          for (const cb of checkboxes) {
            const container = cb.closest('label, li, tr, div');
            const labelText = (container?.innerText || '').trim();
            if (!labelText) continue;
            if (labelText === '없음' || labelText.includes('모름')) continue;
            allOfficialLabels.push(labelText);

            // 문항 1에서 응답한 브랜드가 미체크 상태면 반드시 체크
            const matchesUnaided = unaidedList.some(u =>
              u && (labelText.includes(u) || u.includes(labelText))
            );
            if (matchesUnaided && !cb.checked && !cb.disabled) {
              cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (!cb.checked && !cb.disabled) {
              uncheckedNormal.push({ cb, labelText });
            }
          }

          // 결정론적 셔플 후 addCount개 추가 체크
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

      // [문항 3] 다중 브랜드 × 가변 개수 평가항목 복합 매트릭스 (소비재 13행 / 병원·서비스재 14~20행 전 산업군 호환)
      if (info.screenType === 'Q3_MATRIX') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const colPlans = [];
        for (let colIdx = 0; colIdx < 6; colIdx++) {
          let colHasExp;
          if (catState.purchaseExp === '없음') {
            colHasExp = false; // 구입경험 '없음' 지정 시 전 열 '아니오' + 평소태도 1·2·3번만!
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
          colPlans.push({
            colIdx,
            hasPurchaseExp: colHasExp,
            ...scorePlan,
            extendedScores,
            adjective: catState.adjectives[colIdx % catState.adjectives.length] || `친숙함${colIdx + 1}`
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
              if (/^\d{1,2}\s*[).]/.test(trTxt)) return;
              const v = (el.value || el.innerText || '').trim();
              if (v && v.length <= 30 && !/평가항목|^[1-6]$/.test(v) && colBrandNames.length < 6) {
                if (!colBrandNames.includes(v)) colBrandNames.push(v);
              }
            });
          });

          const enteredScoresByCol = [[], [], [], [], [], []];
          let filledTxt = 0;
          let filledSel = 0;
          let filledRad = 0;
          let processedRows = 0;

          for (const tb of tables) {
            const trs = Array.from(tb.querySelectorAll('tbody tr')).filter(tr => tr.offsetParent !== null);
            for (const tr of trs) {
              // 실제 편집 가능한 컨트롤을 포함한 셀만 추출 (지문 th/td 열 및 숨김 템플릿 열 자동 배제!)
              const dataCells = Array.from(tr.querySelectorAll('td, th')).filter(cell => {
                if (cell.offsetParent === null) return false;
                return Boolean(
                  cell.querySelector(
                    'select:not(:disabled), textarea:not(:disabled):not([readonly]), input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled), input[type="number"]:not(:disabled):not([readonly]), input[type="text"]:not(:disabled):not([readonly]), input:not([type]):not(:disabled):not([readonly])'
                  )
                );
              });
              if (dataCells.length === 0) continue;

              processedRows++;
              // 행 제목 텍스트 추출 (첫 번째 비입력 셀 또는 전체 행 텍스트 앞부분)
              const firstCell = tr.querySelector('th, td');
              const rowTitle = ((firstCell && !dataCells.includes(firstCell) ? firstCell.innerText : tr.innerText) || '')
                .replace(/\s+/g, ' ')
                .trim();

              const isOverallSatRow = /전반적으로\s*만족|전반적\s*만족/.test(rowTitle);
              const isImageWordRow = /떠오르는\s*이미지|형용사|단어|연상|생각나는\s*이미지/.test(rowTitle);
              const isExpRow = /구입|이용해\s*보신|방문해\s*보신|진료|경험이\s*있/.test(rowTitle);
              const isNegativeRow = /전환|이탈|불만|피해|부작용|중단/.test(rowTitle);

              dataCells.forEach((td, cIdx) => {
                const plan = plans[cIdx] || plans[0];
                if (!plan) return;
                const colBucket = enteredScoresByCol[Math.min(cIdx, enteredScoresByCol.length - 1)];

                // 1) <select> 드롭다운 셀 (평소 태도 등)
                const sel = td.querySelector('select:not(:disabled)');
                if (sel && sel.offsetParent !== null) {
                  const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text));
                  if (validOpts.length > 0) {
                    // 선행 점수 평균 기반 태도 보정 (구입경험 '없음'은 절대 4·5번 불가 -> 2·3번 고정)
                    let choiceIdx = plan.attitudeChoice - 1;
                    if (plan.hasPurchaseExp && colBucket.length > 0) {
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

                // 2) 텍스트 / 숫자 입력 셀 (점수 평가 또는 떠오르는 이미지 형용사)
                const txtInp = Array.from(
                  td.querySelectorAll('textarea, input[type="number"], input[type="text"], input:not([type])')
                ).find(inp => inp.offsetParent !== null && !inp.disabled && !inp.readOnly && !['radio', 'checkbox', 'hidden', 'button', 'submit'].includes(inp.type));

                if (txtInp) {
                  uncheckSkipCheckboxesInCell(td);
                  if (isImageWordRow) {
                    if (triggerInput(txtInp, plan.adjective)) filledTxt++;
                  } else if (isOverallSatRow) {
                    const avgScore = colBucket.length > 0
                      ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length)))
                      : plan.overallSatisfaction;
                    if (triggerInput(txtInp, avgScore)) filledTxt++;
                  } else {
                    const sIdx = colBucket.length;
                    let scoreVal = plan.extendedScores[sIdx % plan.extendedScores.length];
                    // 동일 점수 일렬 방지 안전장치
                    if (sIdx >= 2 && colBucket.every(v => v === scoreVal)) {
                      scoreVal = scoreVal === 4 ? 5 : 4;
                    }
                    colBucket.push(scoreVal);
                    if (triggerInput(txtInp, scoreVal)) filledTxt++;
                  }
                  return;
                }

                // 3) 라디오 버튼 셀 (예/아니오 또는 5점 척도 라디오)
                const cellRadios = Array.from(td.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
                if (cellRadios.length > 0) {
                  const byName = new Map();
                  cellRadios.forEach(r => {
                    const k = r.name || '__cell_radio__';
                    if (!byName.has(k)) byName.set(k, []);
                    byName.get(k).push(r);
                  });

                  for (const grp of byName.values()) {
                    if (grp.length >= 5) {
                      const sIdx = colBucket.length;
                      const scoreVal = isOverallSatRow
                        ? (colBucket.length > 0 ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length))) : plan.overallSatisfaction)
                        : plan.extendedScores[sIdx % plan.extendedScores.length];
                      if (!isOverallSatRow) colBucket.push(scoreVal);
                      const pickR = grp.find(r => String(r.value) === String(scoreVal)) || grp[Math.min(grp.length - 1, scoreVal - 1)];
                      if (setRadioChecked(pickR)) filledRad++;
                    } else {
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

          // 테이블 외부 또는 누락된 필수 라디오/셀렉트/인풋 최종 스윕
          document.querySelectorAll('select:not(:disabled)').forEach((sel, idx) => {
            if (sel.offsetParent !== null && (!sel.value || /선택/.test(sel.options[sel.selectedIndex]?.text || ''))) {
              const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text));
              const plan = plans[idx % plans.length] || plans[0];
              const targetOpt = validOpts[Math.max(0, Math.min(validOpts.length - 1, plan.attitudeChoice - 1))] || validOpts[0];
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
            const val = /이미지|형용사|단어/.test(trTxt)
              ? (plans[idx % plans.length]?.adjective || '믿음직함')
              : (plans[idx % plans.length]?.overallSatisfaction || 4);
            if (triggerInput(inp, val)) filledTxt++;
          });

          // 미입력 잔여 컨트롤 진단 수집
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
        const catState = await getOrInitCategoryState(info.categoryName);

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
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
          let chosen = null;
          if (isNone) {
            chosen = radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return txt === '없음' || txt.includes('없음');
            }) || radios[radios.length - 1];
          } else {
            chosen = radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return txt && txt !== '없음' && (txt.includes(targetBrand) || targetBrand.includes(txt));
            }) || radios.find(r => {
              const txt = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return txt && txt !== '없음';
            });
          }
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            return (chosen.closest('label, li, tr, div')?.innerText || '').trim();
          }
          return '';
        }, {
          targetBrand: catState.q4SelectedBrand,
          isNone: catState.purchaseExp === '없음'
        });

        if (pickedQ4) catState.q4SelectedBrand = pickedQ4;
        emitLog(`[${catState.categoryName} - 문항 4] 최근 구입 브랜드 = "${pickedQ4 || catState.q4SelectedBrand}"`, 'info', 'Q4');

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-1] 구입 채널 경로 주관식
      if (info.screenType === 'Q4_1_CHANNEL') {
        const catState = await getOrInitCategoryState(info.categoryName);
        emitLog(`[${catState.categoryName} - 문항 4-1] 구입 채널 = "${catState.selectedChannel}"`, 'info', 'Q4-1');
        await activeTarget.evaluate(({ channelText }) => {
          const inp = Array.from(document.querySelectorAll('input[type="text"], textarea, input:not([type])'))
            .find(el => el.offsetParent !== null && !el.disabled && !el.readOnly);
          if (inp) {
            inp.focus();
            inp.value = channelText;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.blur();
          }
        }, { channelText: catState.selectedChannel });

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 5] 문항 4 응답과 동일 선택
      if (info.screenType === 'Q5_SAME_AS_Q4') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const pickedQ5 = await activeTarget.evaluate(({ sameBrand, isNone }) => {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
          let chosen = null;
          if (isNone) {
            chosen = radios.find(r => (r.closest('label, li, tr, div')?.innerText || '').trim().includes('없음')) || radios[radios.length - 1];
          } else {
            chosen = radios.find(r => {
              const t = (r.closest('label, li, tr, div')?.innerText || '').trim();
              return t && t !== '없음' && (t.includes(sameBrand) || sameBrand.includes(t));
            }) || radios[0];
          }
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            return (chosen.closest('label, li, tr, div')?.innerText || '').trim();
          }
          return '';
        }, {
          sameBrand: catState.q4SelectedBrand,
          isNone: catState.purchaseExp === '없음'
        });
        emitLog(`[${catState.categoryName} - 문항 5] 문항 4 동일 응답 = "${pickedQ5}"`, 'info', 'Q5');

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 6] 아니오 80% / 예 20%
      if (info.screenType === 'Q6_YES_NO') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const chooseNo = (rng() * 100) < Number(policy.q6NoRate ?? 80);
        const targetLabel = chooseNo ? '아니오' : '예';
        await activeTarget.evaluate(({ want }) => {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
          const chosen = radios.find(r => (r.closest('label, li, tr, div')?.innerText || '').trim().includes(want))
            || (want === '아니오' ? radios[1] : radios[0]);
          if (chosen) {
            chosen.click();
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { want: targetLabel });

        // 만약 '예' 선택 시 하위 텍스트 입력창이 활성화되면 자연스러운 단답 채움
        if (!chooseNo) {
          await surveyPage.waitForTimeout(350);
          await activeTarget.evaluate(({ fallbackBrand }) => {
            const extraInputs = Array.from(document.querySelectorAll('input[type="text"], textarea'))
              .filter(el => el.offsetParent !== null && !el.disabled && !el.value);
            for (const inp of extraInputs) {
              inp.value = fallbackBrand;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { fallbackBrand: catState.unaidedBrands[1] || '타사 브랜드' });
        }

        emitLog(`[${catState.categoryName} - 문항 6] "${targetLabel}" 선택`, 'info', 'Q6');
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 7] 1순위 · 2순위 랜덤 선택 ('기타' 클릭 절대 금지! GetData 전 유형 대응)
      if (info.screenType === 'Q7_RANK_1_2') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const seedNum = Math.floor(rng() * 10000);

        // 1단계: GetData .s-gradeclick(GRADE_CLICK) 여부 먼저 확인 후 실제 마우스 클릭 수행
        const gradeClickPlan = await activeTarget.evaluate(({ sNum }) => {
          const isForbiddenLabel = (txt) => /기타|없음|모름|생각나지|잘\s*모르/.test(txt);
          document.querySelectorAll('[data-kbpi-rank-pick]').forEach(el => el.removeAttribute('data-kbpi-rank-pick'));

          const gradeEls = Array.from(document.querySelectorAll('.s-gradeclick')).filter(el => el.offsetParent !== null);
          if (gradeEls.length < 2) return { isGradeClick: false };

          // 기존 선택값이 있으면 초기화 버튼 또는 선택된 항목 클릭으로 리셋
          const reBtn = document.querySelector('button.re-select');
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
          // 2단계: GRADE(hkey=1/2 행렬 라디오) / 2개 <select> / 행별 2열 라디오 / 체크박스 / 번호입력형 일괄 대응
          rankInfo = await activeTarget.evaluate(async ({ sNum }) => {
            const isForbiddenLabel = (txt) => /기타|없음|모름|생각나지|잘\s*모르/.test(txt);
            const waitMs = (ms) => new Promise(res => setTimeout(res, ms));

            // 케이스 A: GetData [question-type="GRADE"] (input[type="radio"][hkey="1"][vkey] / [hkey="2"][vkey])
            const hkey1Radios = Array.from(document.querySelectorAll('input[type="radio"][hkey="1"]')).filter(r => !r.disabled);
            const hkey2Radios = Array.from(document.querySelectorAll('input[type="radio"][hkey="2"]')).filter(r => !r.disabled);
            if (hkey1Radios.length >= 2 && hkey2Radios.length >= 2) {
              const validR1 = hkey1Radios.filter(r => {
                const rowTxt = (r.closest('tr, li, div')?.innerText || '').trim();
                return !isForbiddenLabel(rowTxt);
              });
              if (validR1.length >= 2) {
                const pick1 = validR1[sNum % validR1.length];
                const vk1 = pick1.getAttribute('vkey') || pick1.value;
                pick1.click();
                pick1.checked = true;
                if (typeof $ !== 'undefined') $(pick1).prop('checked', true).trigger('change');
                await waitMs(220);

                const validR2 = Array.from(document.querySelectorAll('input[type="radio"][hkey="2"]')).filter(r => {
                  if (r.disabled) return false;
                  const vk2 = r.getAttribute('vkey') || r.value;
                  if (vk2 === vk1) return false;
                  const rowTxt = (r.closest('tr, li, div')?.innerText || '').trim();
                  return !isForbiddenLabel(rowTxt);
                });
                const pick2 = validR2[(sNum + 2) % Math.max(1, validR2.length)];
                if (pick2) {
                  pick2.click();
                  pick2.checked = true;
                  if (typeof $ !== 'undefined') $(pick2).prop('checked', true).trigger('change');
                  return { r1: vk1, r2: pick2.getAttribute('vkey') || pick2.value, mode: 'GRADE_HKEY' };
                }
              }
            }

            // 케이스 B: 1순위/2순위 드롭다운(<select>) 2개 (1순위 변경 후 2순위 동적 옵션 갱신 대기)
            const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled && s.offsetParent !== null);
            if (selects.length >= 2) {
              const opts1 = Array.from(selects[0].options).filter(o => o.value !== '' && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
              if (opts1.length >= 2) {
                const pick1 = opts1[sNum % opts1.length];
                selects[0].value = pick1.value;
                selects[0].dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(selects[0]).val(pick1.value).trigger('change');
                await waitMs(250);

                const opts2 = Array.from(selects[1].options).filter(o => o.value !== '' && o.value !== pick1.value && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
                if (opts2.length > 0) {
                  const pick2 = opts2[(sNum + 1) % opts2.length];
                  selects[1].value = pick2.value;
                  selects[1].dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof $ !== 'undefined') $(selects[1]).val(pick2.value).trigger('change');
                  return { r1: pick1.text.trim(), r2: pick2.text.trim(), mode: 'SELECT_2' };
                }
              }
            }

            // 케이스 C: 테이블 행(tr)마다 1순위·2순위 라디오 2개씩 배치된 매트릭스 또는 2열 라디오 그룹
            const trsWith2Radios = Array.from(document.querySelectorAll('table tbody tr')).filter(tr => {
              const rds = tr.querySelectorAll('input[type="radio"]');
              const txt = (tr.innerText || '').trim();
              return rds.length >= 2 && !isForbiddenLabel(txt);
            });
            if (trsWith2Radios.length >= 2) {
              const row1 = trsWith2Radios[sNum % trsWith2Radios.length];
              let rIdx2 = (sNum + 1) % trsWith2Radios.length;
              if (rIdx2 === (sNum % trsWith2Radios.length)) rIdx2 = (rIdx2 + 1) % trsWith2Radios.length;
              const row2 = trsWith2Radios[rIdx2];
              const r1 = row1.querySelectorAll('input[type="radio"]')[0];
              if (r1 && !r1.disabled) {
                r1.click();
                r1.checked = true;
                if (typeof $ !== 'undefined') $(r1).prop('checked', true).trigger('change');
              }
              await waitMs(200);
              const r2 = row2.querySelectorAll('input[type="radio"]')[1];
              if (r2 && !r2.disabled) {
                r2.click();
                r2.checked = true;
                if (typeof $ !== 'undefined') $(r2).prop('checked', true).trigger('change');
              }
              return {
                r1: (row1.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30),
                r2: (row2.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30),
                mode: 'TR_RADIO_MATRIX'
              };
            }

            // 케이스 D: 2개 독립 라디오 그룹(1순위 그룹 / 2순위 그룹)
            const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
            const radioGroups = new Map();
            for (const r of radios) {
              if (!radioGroups.has(r.name)) radioGroups.set(r.name, []);
              radioGroups.get(r.name).push(r);
            }
            const groups = Array.from(radioGroups.values());
            if (groups.length === 2 && groups[0].length >= 2 && groups[1].length >= 2) {
              const g1 = groups[0].filter(r => !isForbiddenLabel((r.closest('label, tr, td, li, div')?.innerText || '').trim()));
              const g2 = groups[1].filter(r => !isForbiddenLabel((r.closest('label, tr, td, li, div')?.innerText || '').trim()));
              if (g1.length >= 2 && g2.length >= 2) {
                const i1 = sNum % g1.length;
                let i2 = (i1 + 1 + (sNum % (g2.length - 1))) % g2.length;
                if (i2 === i1) i2 = (i1 + 1) % g2.length;
                g1[i1].click();
                g1[i1].checked = true;
                if (typeof $ !== 'undefined') $(g1[i1]).prop('checked', true).trigger('change');
                await waitMs(200);
                g2[i2].click();
                g2[i2].checked = true;
                if (typeof $ !== 'undefined') $(g2[i2]).prop('checked', true).trigger('change');
                return { r1: g1[i1].value, r2: g2[i2].value, mode: 'RADIO_2GRP' };
              }
            }

            // 케이스 E: 체크박스 2개 선택형 (기존 체크 초기화 후 정확히 2개 선택)
            const allCbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.disabled);
            if (allCbs.length >= 2) {
              for (const cb of allCbs) {
                if (cb.checked) {
                  cb.click();
                  if (cb.checked) {
                    cb.checked = false;
                    if (typeof $ !== 'undefined') $(cb).prop('checked', false).trigger('change');
                  }
                }
              }
              await waitMs(150);
              const validCbs = allCbs.filter(cb => {
                const t = (cb.closest('label, tr, td, li, div')?.innerText || '').trim();
                return t && !isForbiddenLabel(t);
              });
              if (validCbs.length >= 2) {
                const i1 = sNum % validCbs.length;
                const i2 = (i1 + 1) % validCbs.length;
                validCbs[i1].click();
                validCbs[i1].checked = true;
                if (typeof $ !== 'undefined') $(validCbs[i1]).prop('checked', true).trigger('change');
                await waitMs(200);
                validCbs[i2].click();
                validCbs[i2].checked = true;
                if (typeof $ !== 'undefined') $(validCbs[i2]).prop('checked', true).trigger('change');
                return {
                  r1: (validCbs[i1].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  r2: (validCbs[i2].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  mode: 'CHECKBOX_2'
                };
              }
            }

            // 케이스 F: 1순위·2순위 보기 번호 직접 입력칸(input[type="number"|"text"] 2개)
            const numInps = Array.from(document.querySelectorAll('input[type="number"], input[type="text"], input:not([type])'))
              .filter(inp => inp.offsetParent !== null && !inp.disabled && !inp.readOnly);
            if (numInps.length >= 2) {
              const setVal = (el, v) => {
                el.focus();
                el.value = String(v);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof $ !== 'undefined') $(el).val(String(v)).trigger('input').trigger('change');
                el.blur();
              };
              const v1 = (sNum % 3) + 1;
              const v2 = ((sNum + 1) % 3) + 1 === v1 ? (v1 % 3) + 1 : ((sNum + 1) % 3) + 1;
              setVal(numInps[0], v1);
              setVal(numInps[1], v2);
              return { r1: String(v1), r2: String(v2), mode: 'INPUT_RANK' };
            }

            return { r1: '', r2: '', mode: 'NONE' };
          }, { sNum: seedNum });
        }

        emitLog(`[${catState.categoryName} - 문항 7 (${rankInfo.mode})] 1순위="${rankInfo.r1}", 2순위="${rankInfo.r2}" (기타 배제 완료)`, 'info', 'Q7');
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 8] 랜덤 2개 복수 선택 ('기타'/'없음' 제외 + 기존 체크 초기화로 정확히 2개 보장)
      if (info.screenType === 'Q8_MULTI_2') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const seedNum8 = Math.floor(rng() * 10000);
        const picked2 = await activeTarget.evaluate(async ({ sNum }) => {
          const isForbidden = (txt) => /기타|없음|모름|생각나지/.test(txt);
          const allCbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.disabled);
          if (allCbs.length >= 2) {
            for (const cb of allCbs) {
              if (cb.checked) {
                cb.click();
                if (cb.checked) {
                  cb.checked = false;
                  if (typeof $ !== 'undefined') $(cb).prop('checked', false).trigger('change');
                }
              }
            }
            await new Promise(r => setTimeout(r, 150));
            const validCbs = allCbs.filter(cb => {
              const txt = (cb.closest('label, li, tr, td, div')?.innerText || '').trim();
              return txt && !isForbidden(txt);
            });
            if (validCbs.length >= 2) {
              const idx1 = sNum % validCbs.length;
              let idx2 = (sNum + 3) % validCbs.length;
              if (idx2 === idx1) idx2 = (idx1 + 1) % validCbs.length;
              validCbs[idx1].click();
              validCbs[idx1].checked = true;
              if (typeof $ !== 'undefined') $(validCbs[idx1]).prop('checked', true).trigger('change');
              await new Promise(r => setTimeout(r, 150));
              validCbs[idx2].click();
              validCbs[idx2].checked = true;
              if (typeof $ !== 'undefined') $(validCbs[idx2]).prop('checked', true).trigger('change');
              return [
                (validCbs[idx1].closest('label, li, tr, td, div')?.innerText || '').trim(),
                (validCbs[idx2].closest('label, li, tr, td, div')?.innerText || '').trim()
              ];
            }
          }
          // 단일 라디오 문항인 경우 폴백
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && !isForbidden((r.closest('label, li, tr, td, div')?.innerText || '').trim()));
          if (radios.length > 0) {
            const pick = radios[sNum % radios.length];
            pick.click();
            pick.checked = true;
            if (typeof $ !== 'undefined') $(pick).prop('checked', true).trigger('change');
            return [(pick.closest('label, li, tr, td, div')?.innerText || '').trim()];
          }
          return [];
        }, { sNum: seedNum8 });

        emitLog(`[${catState.categoryName} - 문항 8] 선택 완료 = [${picked2.join(', ')}]`, 'info', 'Q8');
        if ((safetyGuard || policy.stopBeforeFinalSubmit !== false) && info.progressPct !== null && info.progressPct >= (captureHtmlDumpPath ? 96 : 98)) {
          emitLog(
            `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 마지막 품목 문항 8 작성 후 제출 직전(${info.progressPct}%)에서 안전 정지했습니다.`,
            'info',
            'SAFE_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'FINAL_GATE',
            statusLabel: `완료직전 대기(${info.progressPct}%)`,
            quotaStatus: 'pilot_done',
            progress: `${info.progressPct}%`,
            categoryConfigs,
            gps
          };
        }
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [최종 완료 직전 관문] Rule 10 안전 대기 처리 (진행률 임계치 및 비문항 종료 안내 화면 포함)
      const isNearCompletionGate =
        info.screenType === 'FINAL_SUBMIT_GATE' ||
        (info.progressPct !== null && info.progressPct >= (captureHtmlDumpPath ? 96 : 98)) ||
        (seenCategoriesOrder.length >= 8 && info.visibleControlCount === 0);

      if (isNearCompletionGate && (safetyGuard || policy.stopBeforeFinalSubmit !== false)) {
        emitLog(
          `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 최종 완료 화면 직전에 안전 정지했습니다 (진행률 ${info.progressPct || 99}%, 문항=${info.qNameAttr || info.screenType}).`,
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
          gps
        };
      }

      // [배경변인(DQ) 또는 일반 미분류 스텝] 연령/성별 정합 안전 응답
      emitLog(`[일반/배경 문항 처리] 문항=${info.qNameAttr || info.badge || 'DQ'} | 진행률=${info.progressPct ?? '-'}%`, 'info', 'DQ');
      await activeTarget.evaluate(({ rAge, seedNum }) => {
        const isForbidden = (txt) => /기타|모름|거절/.test(txt);

        // 라디오 그룹 미선택 시 정합 선택 (10대 만 17~18세: 재학/미혼 우선)
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
        const groups = new Map();
        for (const r of radios) {
          if (!groups.has(r.name)) groups.set(r.name, []);
          groups.get(r.name).push(r);
        }
        for (const grp of groups.values()) {
          if (grp.some(r => r.checked)) continue;
          const valid = grp.filter(r => !isForbidden((r.closest('label, li, tr, td, div')?.innerText || '').trim()));
          let pick = valid[seedNum % Math.max(1, valid.length)] || grp[0];
          if (rAge <= 19) {
            const teenPick = valid.find(r => /학생|고등|재학|미혼/.test((r.closest('label, li, tr, td, div')?.innerText || '').trim()));
            if (teenPick) pick = teenPick;
          }
          if (pick) {
            pick.click();
            pick.checked = true;
            pick.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // 셀렉트 박스 미선택 시 선택
        document.querySelectorAll('select').forEach(sel => {
          if (!sel.disabled && !sel.value) {
            const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text) && !isForbidden(o.text));
            if (validOpts[0]) {
              sel.value = validOpts[seedNum % validOpts.length].value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
      }, { rAge: age, seedNum: Math.floor(rng() * 1000) });

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
          gps
        };
      }
    }

    throw new Error('최대 단계 반복 횟수(260회)를 초과했습니다.');
  } catch (err) {
    if (htmlInspectionDump) {
      htmlInspectionDump.finalOutcome = { success: false, error: err.message };
    }
    emitLog(`[K-BPI 실행 오류] ${err.message}`, 'error', 'ERROR');
    return {
      success: false,
      error: err.message,
      categoryConfigs,
      gps
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
    if (browser) {
      await browser.close().catch(e => console.warn('[K-BPI Runner Browser 종료 경고]', e.message));
    }
  }
}
