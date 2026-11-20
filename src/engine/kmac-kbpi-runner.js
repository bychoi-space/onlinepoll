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
    brands = ['삼성', 'LG', '롯데', 'CJ', '현대', '카카오'];
  }

  const groupKey = matchedEntry?.group || (
    /은행|카드|보험|증권|통신|인터넷|앱|쇼핑몰|OTT|택배/.test(cleanCat)
      ? 'finance_telecom_service'
      : (/TV|냉장고|세탁기|에어컨|청소기|정수기|처리기|밥솥|노트북|스마트폰|비데|침대/.test(cleanCat)
        ? 'appliance_digital'
        : (/치킨|피자|커피전문점|베이커리|패스트푸드/.test(cleanCat)
          ? 'dining_franchise'
          : (/샴푸|화장품|운동화|의류|아웃도어|뷰티/.test(cleanCat)
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

  const scanCurrentDomForSlot = async () => {
    return listPage.evaluate(({ targetUid, targetFinalId, targetReg, targetGen, targetAg }) => {
      document.querySelectorAll('[data-kbpi-target-start]').forEach(el => el.removeAttribute('data-kbpi-target-start'));

      const rawRows = Array.from(
        document.querySelectorAll('table tbody tr, [role="row"], .ag-row, .tui-grid-row, .ant-table-row, .el-table__row')
      ).filter(r => {
        if (r.closest('thead')) return false;
        const t = (r.innerText || '').trim();
        if (!t) return false;
        if (/최종\s*id/i.test(t) && /조사지역/.test(t)) return false;
        return true;
      });

      const actionRegex = /^(시작|조사\s*시작|진행|진행중|이어하기|계속|참여)$/;
      const allActionCandidates = Array.from(
        document.querySelectorAll('button, a, input[type="button"], input[type="submit"], span, div')
      ).filter(el => {
        if (el.offsetParent === null) return false;
        const txt = (el.innerText || el.value || '').trim();
        if (!actionRegex.test(txt)) return false;
        // 컨테이너가 아닌 실제 버튼/뱃지 요소만 선택
        const hasSameTextChild = Array.from(el.children).some(ch => actionRegex.test((ch.innerText || ch.value || '').trim()));
        return !hasSameTextChild;
      });

      for (const rowEl of rawRows) {
        const cellEls = Array.from(
          rowEl.querySelectorAll('td, [role="gridcell"], [role="cell"], .ag-cell, .tui-grid-cell')
        );
        const cells = cellEls.length > 0
          ? cellEls.map(c => (c.innerText || '').trim())
          : (rowEl.innerText || '').split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);
        const fullText = cells.join(' | ');

        const hasUid = Boolean(targetUid && fullText.includes(targetUid));
        const hasExactFinalId = Boolean(targetFinalId && cells.some(c => c === targetFinalId));
        const demoMatches =
          (!targetReg || fullText.includes(targetReg)) &&
          (!targetGen || cells.includes(targetGen) || fullText.includes(targetGen)) &&
          (!targetAg || fullText.includes(targetAg));

        if (!hasUid && !(hasExactFinalId && demoMatches)) continue;

        // 1순위: 동일 행(rowEl) 내부에서 [시작] 버튼 탐색
        const innerBtns = Array.from(
          rowEl.querySelectorAll('button, a, input[type="button"], input[type="submit"], span, div')
        ).filter(el => {
          if (el.offsetParent === null) return false;
          const txt = (el.innerText || el.value || '').trim();
          if (!actionRegex.test(txt)) return false;
          return !Array.from(el.children).some(ch => actionRegex.test((ch.innerText || ch.value || '').trim()));
        });

        let matchedBtn = innerBtns[0] || null;

        // 2순위: 우측 고정 열(Sticky / Pinned Right 분리 테이블) Y좌표 정렬 매칭
        if (!matchedBtn) {
          rowEl.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rowRect = rowEl.getBoundingClientRect();
          const rowMidY = rowRect.top + rowRect.height / 2;
          const tolerance = Math.max(22, rowRect.height * 0.7);
          const aligned = allActionCandidates
            .map(btn => {
              const br = btn.getBoundingClientRect();
              const bMidY = br.top + br.height / 2;
              return { btn, diffY: Math.abs(bMidY - rowMidY) };
            })
            .filter(x => x.diffY <= tolerance)
            .sort((a, b) => a.diffY - b.diffY);
          if (aligned[0]) matchedBtn = aligned[0].btn;
        }

        if (matchedBtn) {
          matchedBtn.setAttribute('data-kbpi-target-start', '1');
          return {
            found: true,
            hasBtn: true,
            rowText: fullText,
            btnText: (matchedBtn.innerText || matchedBtn.value || '시작').trim()
          };
        }

        if (/완료|종료/.test(fullText)) {
          return { found: true, hasBtn: false, alreadyDone: true, rowText: fullText };
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

  const clickMatchedStartButton = async (matchInfo) => {
    if (matchInfo.alreadyDone && !matchInfo.hasBtn) {
      return { alreadyCompleted: true, page: listPage };
    }
    const targetBtn = listPage.locator('[data-kbpi-target-start="1"]').first();
    if ((await targetBtn.count()) > 0) {
      emitLog(`[슬롯 매칭 완료] "${matchInfo.rowText}" ➔ [${matchInfo.btnText}] 클릭!`);
      const popupPromise = context.waitForEvent('page', { timeout: 7500 }).catch(() => null);
      await targetBtn.click();
      const popupPage = await popupPromise;
      if (popupPage) {
        await popupPage.waitForLoadState('domcontentloaded').catch(err => emitLog(`설문창 로드 경고: ${err.message}`, 'warn'));
        return { alreadyCompleted: false, page: popupPage };
      }
      await listPage.waitForTimeout(2000);
      return { alreadyCompleted: false, page: listPage };
    }
    return null;
  };

  // Pass 1: 기본 로드 상태(필터 미조작)에서 즉시 스캔 + 스크롤 컨테이너 순회 스캔
  for (let scrollStep = 0; scrollStep < 14; scrollStep++) {
    const matchInfo = await scanCurrentDomForSlot();
    if (matchInfo.found) {
      const started = await clickMatchedStartButton(matchInfo);
      if (started) return started;
    }
    const scrolled = await listPage.evaluate(() => {
      const scrollables = Array.from(
        document.querySelectorAll('.ag-body-viewport, .tui-grid-body-area, .ant-table-body, .el-table__body-wrapper, .table-responsive, div')
      ).filter(el => el.scrollHeight > el.clientHeight + 40 && el.clientHeight >= 180);
      const container = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (container) {
        const prev = container.scrollTop;
        container.scrollTop += Math.max(300, Math.floor(container.clientHeight * 0.75));
        if (container.scrollTop > prev) return true;
      }
      const prevWin = window.scrollY;
      window.scrollBy(0, 450);
      return window.scrollY > prevWin;
    }).catch(() => false);
    if (!scrolled) break;
    await listPage.waitForTimeout(450);
  }

  // 스크롤 최상단 복귀 후 Pass 2: 상단 필터(조사지역/성별/연령) 정밀 선택 및 페이지네이션 탐색
  await listPage.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('div').forEach(el => {
      if (el.scrollTop > 0) el.scrollTop = 0;
    });
  }).catch(err => emitLog(`스크롤 초기화 경고: ${err.message}`, 'warn'));

  await listPage.evaluate(({ reg, gen, ag }) => {
    const ensureOptionChecked = (rowKeyword, optText) => {
      if (!optText) return;
      const containers = Array.from(document.querySelectorAll('tr, .filter-row, div'))
        .filter(el => {
          const t = (el.innerText || '').trim();
          return t.startsWith(rowKeyword) && t.length < 180;
        })
        .sort((a, b) => a.innerText.length - b.innerText.length);
      const row = containers[0];
      if (!row) return;
      const labels = Array.from(row.querySelectorAll('label'));
      for (const lb of labels) {
        if ((lb.innerText || '').trim() === optText) {
          const inp = lb.querySelector('input') || document.getElementById(lb.getAttribute('for') || '');
          if (inp) {
            if (!inp.checked) inp.click();
          } else {
            lb.click();
          }
          return;
        }
      }
    };
    ensureOptionChecked('조사지역', reg);
    ensureOptionChecked('성별', gen);
    ensureOptionChecked('연령', ag);
  }, { reg: region, gen: gender, ag: ageGroup }).catch(err => emitLog(`필터 적용 경고: ${err.message}`, 'warn'));

  await listPage.waitForTimeout(1200);

  for (let pageAttempt = 0; pageAttempt < 15; pageAttempt++) {
    const matchInfo = await scanCurrentDomForSlot();
    if (matchInfo.found) {
      const started = await clickMatchedStartButton(matchInfo);
      if (started) return started;
    }

    const hasNext = await listPage.evaluate(() => {
      document.querySelectorAll('[data-kbpi-next-page]').forEach(el => el.removeAttribute('data-kbpi-next-page'));
      const nextPg = Array.from(document.querySelectorAll('.pagination a, .paging a, nav a, nav button, a, button'))
        .find(el => {
          const t = (el.innerText || '').trim();
          return el.offsetParent !== null && /^(다음|>|›|»)$/.test(t) && !el.disabled && !el.classList.contains('disabled');
        });
      if (nextPg) {
        nextPg.setAttribute('data-kbpi-next-page', '1');
        return true;
      }
      return false;
    });

    if (hasNext) {
      await listPage.locator('[data-kbpi-next-page="1"]').first().click();
      await listPage.waitForTimeout(1100);
    } else {
      break;
    }
  }

  // 실패 시 원인 즉시 파악을 위한 현재 화면 진단 스냅샷 로깅
  const diag = await listPage.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
      .map(el => (el.innerText || '').trim())
      .filter(Boolean)
      .slice(0, 16);
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
 * 현재 설문 화면의 단계 유형과 출제 산업군명(예: '생수', '음식물처리기')을 정밀 분류
 */
async function classifyCurrentScreen(page) {
  return page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').trim();

    // 산업군명 추출: ‘생수 브랜드’에 대한 내용입니다. 또는 지금부터 【생수】 브랜드에 대한 질문입니다.
    let categoryName = '';
    const bracketMatch = bodyText.match(/【\s*([^】]+?)\s*】/);
    const quoteBrandMatch = bodyText.match(/[‘'"]\s*([^’'"]+?)\s*브랜드\s*[’'"]\s*에\s*대한\s*내용/);
    if (bracketMatch) {
      categoryName = bracketMatch[1].trim();
    } else if (quoteBrandMatch) {
      categoryName = quoteBrandMatch[1].trim();
    }

    // 진행률 퍼센트 추출
    const pctMatch = bodyText.match(/(\d{1,3})\s*%/);
    const progressPct = pctMatch ? Number(pctMatch[1]) : null;

    // 설문 완료 화면 감지
    if (/설문이\s*종료|조사가\s*완료|응답해\s*주셔서\s*감사|수고하셨습니다/.test(bodyText) &&
        document.querySelectorAll('input, select, textarea').length === 0) {
      return { screenType: 'COMPLETED', categoryName, progressPct, bodySnippet: bodyText.slice(0, 200) };
    }

    // 1) GP1 위치 확인
    if (/GP1/.test(bodyText) && /현재\s*위치를\s*확인/.test(bodyText)) {
      return { screenType: 'GP1', categoryName, progressPct };
    }

    // 2) 응답자 신상정보 등록 (이름 / 성별 / 연령(만) / 휴대폰 / 전화번호 + 응답자 확인)
    if (/응답자\s*확인/.test(bodyText) && /연령\s*\(\s*만\s*\)/.test(bodyText)) {
      return { screenType: 'PROFILE', categoryName, progressPct };
    }

    // 3) SQ1 스크리닝
    if (/\bSQ1\b/i.test(bodyText) || (/다음\s*업종|종사하는\s*가족|시장조사|광고대행사/.test(bodyText) && !categoryName)) {
      return { screenType: 'SQ1', categoryName, progressPct };
    }

    // 4) 문항 1 (1-1, 1-2, 1-3, 1-4 비보조 인지도)
    if (/1-1/.test(bodyText) && /가장\s*먼저\s*생각나는\s*브랜드/.test(bodyText)) {
      return { screenType: 'Q1_UNAIDED', categoryName, progressPct };
    }

    // 5) 문항 2 (보조 인지도 체크박스)
    if (/알고\s*계시는\s*브랜드를\s*모두/.test(bodyText)) {
      return { screenType: 'Q2_AIDED', categoryName, progressPct };
    }

    // 6) 문항 3 (1점~5점 평가 매트릭스 + 11~13번)
    if (/1점\s*~\s*5점으로\s*평가/.test(bodyText) || /전반적으로\s*만족한다/.test(bodyText)) {
      return { screenType: 'Q3_MATRIX', categoryName, progressPct };
    }

    // 7) 문항 4-1 (구입 채널 경로 주관식)
    if (/4-1/.test(bodyText) || /어느\s*채널\s*\(\s*경로\s*\)\s*을?\s*통해서\s*구입/.test(bodyText)) {
      return { screenType: 'Q4_1_CHANNEL', categoryName, progressPct };
    }

    // 8) 문항 4 (가장 최근에 구입/이용한 브랜드)
    if (/가장\s*최근에\s*구입\/이용한\s*적이\s*있는\s*브랜드/.test(bodyText)) {
      return { screenType: 'Q4_RECENT_BRAND', categoryName, progressPct };
    }

    // 좌측 문항 번호 배지 탐색 (5, 6, 7, 8 또는 DQ)
    const badgeTexts = Array.from(document.querySelectorAll('div, span, th, td, strong'))
      .map(el => (el.innerText || '').trim())
      .filter(t => /^(5|6|7|8|DQ\d*|배경\d*)$/i.test(t));
    const firstBadge = badgeTexts[0] || '';

    if (firstBadge === '5' || (/주\s*구입|가장\s*선호|주로\s*이용|가장\s*자주/.test(bodyText) && categoryName)) {
      return { screenType: 'Q5_SAME_AS_Q4', categoryName, progressPct };
    }
    if (firstBadge === '6' || (categoryName && document.querySelectorAll('input[type="radio"]').length === 2 && /예/.test(bodyText) && /아니오/.test(bodyText))) {
      return { screenType: 'Q6_YES_NO', categoryName, progressPct };
    }
    if (firstBadge === '7' || /1\s*순위/.test(bodyText) && /2\s*순위/.test(bodyText)) {
      return { screenType: 'Q7_RANK_1_2', categoryName, progressPct };
    }
    if (firstBadge === '8') {
      return { screenType: 'Q8_MULTI_2', categoryName, progressPct };
    }

    // 최종 제출 버튼 여부 판별
    const hasFinalBtn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'))
      .some(el => /조사\s*완료|설문\s*완료|최종\s*제출|완료하기/.test((el.innerText || el.value || '').trim()));
    if (hasFinalBtn) {
      return { screenType: 'FINAL_SUBMIT_GATE', categoryName, progressPct, bodySnippet: bodyText.slice(0, 200) };
    }

    return {
      screenType: 'GENERIC_STEP',
      categoryName,
      progressPct,
      badge: firstBadge,
      bodySnippet: bodyText.slice(0, 240)
    };
  });
}

async function clickNextButton(page) {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const nextBtn = candidates.find(el => {
      const txt = (el.innerText || el.value || '').trim();
      const visible = el.offsetParent !== null;
      return visible && !el.disabled && /^(다음|다음으로|응답자\s*확인|확인|저장\s*후\s*다음)$/.test(txt);
    });
    if (nextBtn) {
      nextBtn.click();
      return (nextBtn.innerText || nextBtn.value || '').trim();
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

    const surveyPage = slotEntry.page;
    await surveyPage.waitForTimeout(1500);

    // 산업군별 런타임 상태 추적
    const seenCategoriesOrder = [];
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
      const info = await classifyCurrentScreen(surveyPage);
      const sig = `${info.screenType}|${info.categoryName}|${info.progressPct}`;
      if (sig === lastSignature) {
        sameScreenStuckCount++;
        if (sameScreenStuckCount >= 5) {
          throw new Error(`동일 화면 반복 정체 감지 (${sig}) — 최근 알림: ${alertHistory.slice(-2).join(' / ') || '없음'}`);
        }
      } else {
        sameScreenStuckCount = 0;
        lastSignature = sig;
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
        const locBtn = surveyPage.locator('button:has-text("위치 확인"), a:has-text("위치 확인"), input[value*="위치 확인"], :text-is("위치 확인")').first();
        if ((await locBtn.count()) > 0) {
          await locBtn.click();
          for (let gWait = 0; gWait < 12; gWait++) {
            await surveyPage.waitForTimeout(400);
            const hasCoords = await surveyPage.evaluate(() => /위도\s*:\s*3\d\./.test(document.body?.innerText || ''));
            if (hasCoords) break;
          }
        }
        await clickNextButton(surveyPage);
        continue;
      }

      // [신상정보 등록] 이름 / 성별 / 연령(만) / 휴대폰 또는 전화번호
      if (info.screenType === 'PROFILE') {
        emitLog(`[신상정보 입력] 이름=${respondentName}, 성별=${gender}, 만=${age}세, 연락처=${phone} (${phone.startsWith('010') ? '휴대폰' : '일반전화'})`, 'info', 'PROFILE');
        await surveyPage.evaluate(({ rName, rGender, rAge, rPhone }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [SQ1] 스크리닝 -> 모두 없다
      if (info.screenType === 'SQ1') {
        emitLog('[SQ1 스크리닝] "모두 없다" 선택...', 'info', 'SQ1');
        await surveyPage.evaluate(() => {
          const allRadiosAndChecks = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
          // 행별 '없다/아니오' 라디오가 여러 개인 경우와 단일 '모두 없다' 버튼 모두 대응
          const noneLabels = Array.from(document.querySelectorAll('label, td, div, span')).filter(el => {
            const t = (el.innerText || '').trim();
            return /^(모두\s*없다|해당\s*없음|해당사항\s*없음|없음|없다|아니오)$/.test(t);
          });
          for (const lb of noneLabels) {
            const inp = lb.querySelector('input') ||
              document.getElementById(lb.getAttribute('for') || '') ||
              lb.previousElementSibling;
            if (inp && (inp.type === 'radio' || inp.type === 'checkbox')) {
              if (!inp.checked) inp.click();
              inp.checked = true;
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              lb.click();
            }
          }
          // 만약 아직 선택 안 된 라디오 그룹이 남아있다면 마지막 보기(보통 '없다/해당없음') 선택
          const byName = new Map();
          for (const r of allRadiosAndChecks.filter(x => x.type === 'radio' && !x.disabled)) {
            if (!byName.has(r.name)) byName.set(r.name, []);
            byName.get(r.name).push(r);
          }
          for (const group of byName.values()) {
            if (!group.some(x => x.checked) && group.length > 0) {
              const lastOpt = group[group.length - 1];
              lastOpt.click();
              lastOpt.checked = true;
              lastOpt.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
        await surveyPage.waitForTimeout(450);
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 1] 1-1 ~ 1-4 비보조 인지도 (브랜드 주관식)
      if (info.screenType === 'Q1_UNAIDED') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const fill4th = (rng() * 100) < Number(policy.unaided4thBrandRate ?? 35) && catState.unaidedBrands.length >= 4;
        emitLog(`[${catState.categoryName} - 문항 1] 1-1="${catState.unaidedBrands[0]}", 1-2="${catState.unaidedBrands[1]}", 1-3="${catState.unaidedBrands[2]}", 1-4="${fill4th ? catState.unaidedBrands[3] : '없음'}"`, 'info', 'Q1');

        await surveyPage.evaluate(({ brands, use4th }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 2] 보조 인지도 (1 응답값 포함 + 랜덤 2~4개 추가 선택 + 공식 브랜드 학습)
      if (info.screenType === 'Q2_AIDED') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const extraMin = Number(policy.aidedExtraMin ?? 2);
        const extraMax = Math.max(extraMin, Number(policy.aidedExtraMax ?? 4));
        const extraTargetCount = extraMin + Math.floor(rng() * (extraMax - extraMin + 1));

        const q2Result = await surveyPage.evaluate(({ unaidedList, addCount, randSeed }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 3] 3개 브랜드 × 13개 평가항목 복합 매트릭스
      if (info.screenType === 'Q3_MATRIX') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const colPlans = [];
        for (let colIdx = 0; colIdx < 3; colIdx++) {
          let colHasExp;
          if (catState.purchaseExp === '없음') {
            colHasExp = false; // 구입경험 '없음' 지정 시 3개 열 전원 '아니오' + 3-11은 1·2·3번만!
          } else if (colIdx === 0) {
            colHasExp = true;  // 구입경험 '있음' 시 1번 열(최초상기 브랜드)은 100% '예'
          } else {
            colHasExp = rng() < 0.75; // 2·3번 열은 75% 예 / 25% 아니오
          }
          const scorePlan = generateKbpiMatrixScores(rng, colHasExp);
          colPlans.push({
            colIdx,
            hasPurchaseExp: colHasExp,
            ...scorePlan,
            adjective: catState.adjectives[colIdx % catState.adjectives.length] || `친숙함${colIdx + 1}`
          });
        }

        const matrixApplied = await surveyPage.evaluate(({ plans }) => {
          const triggerInput = (el, val) => {
            if (!el || el.disabled) return;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            el.blur();
          };

          const table = document.querySelector('table');
          if (!table) return { ok: false, reason: '평가 테이블 미발견' };

          // 상단 평가 브랜드 열 헤더 이름 파악 (문항 4 매칭용)
          const colBrandNames = [];
          table.querySelectorAll('thead input, thead div, thead th, thead td, tbody tr:first-child input, tbody tr:first-child td').forEach(el => {
            const trTxt = (el.closest('tr')?.innerText || '').trim();
            if (/^\d{1,2}\s*\)/.test(trTxt)) return;
            const v = (el.value || el.innerText || '').trim();
            if (v && v.length <= 30 && !/평가항목|^[123]$/.test(v) && colBrandNames.length < 5) {
              if (!colBrandNames.includes(v)) colBrandNames.push(v);
            }
          });

          const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(tr => {
            const txt = (tr.innerText || '').trim();
            return /^\d{1,2}\s*\)/.test(txt);
          });

          for (const tr of bodyRows) {
            const rowTitle = (tr.innerText || '').trim();
            const qNumMatch = rowTitle.match(/^(\d{1,2})\s*\)/);
            if (!qNumMatch) continue;
            const qNum = Number(qNumMatch[1]);
            const dataTds = Array.from(tr.querySelectorAll('td')).slice(1); // 첫 열이 문항 지문인 경우 제외
            const cells = dataTds.length >= 1 ? dataTds : Array.from(tr.querySelectorAll('td'));

            cells.forEach((td, cIdx) => {
              const plan = plans[cIdx] || plans[plans.length - 1];
              if (!plan) return;

              if (qNum >= 1 && qNum <= 9) {
                const inp = td.querySelector('input[type="number"], input[type="text"], input:not([type])');
                triggerInput(inp, plan.itemScores[qNum - 1]);
              } else if (qNum === 10) {
                const inp = td.querySelector('input[type="number"], input[type="text"], input:not([type])');
                triggerInput(inp, plan.overallSatisfaction);
              } else if (qNum === 11) {
                const sel = td.querySelector('select');
                if (sel && !sel.disabled) {
                  // 옵션 index 또는 value 매칭 (1~5번 보기)
                  const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택/.test(o.text));
                  const targetOpt = validOpts[plan.attitudeChoice - 1] || validOpts[0];
                  if (targetOpt) {
                    sel.value = targetOpt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              } else if (qNum === 12) {
                const inp = td.querySelector('input[type="text"], input:not([type])');
                triggerInput(inp, plan.adjective);
              } else if (qNum === 13) {
                const wantText = plan.hasPurchaseExp ? '예' : '아니오';
                const labels = Array.from(td.querySelectorAll('label, span'));
                const targetLb = labels.find(l => (l.innerText || '').trim() === wantText);
                const radios = Array.from(td.querySelectorAll('input[type="radio"]'));
                const targetRadio = targetLb
                  ? (targetLb.querySelector('input[type="radio"]') || document.getElementById(targetLb.getAttribute('for') || ''))
                  : (plan.hasPurchaseExp ? radios[0] : radios[1]);
                if (targetRadio && !targetRadio.disabled) {
                  if (!targetRadio.checked) targetRadio.click();
                  targetRadio.checked = true;
                  targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (targetLb) {
                  targetLb.click();
                }
              }
            });
          }

          return { ok: true, colBrandNames, rowCount: bodyRows.length };
        }, { plans: colPlans });

        if (matrixApplied.colBrandNames?.[0] && catState.purchaseExp === '있음') {
          catState.q4SelectedBrand = matrixApplied.colBrandNames[0];
        }

        emitLog(
          `[${catState.categoryName} - 문항 3] 3개열 평가 완료 | 1열(만족도=${colPlans[0].overallSatisfaction}, 태도=${colPlans[0].attitudeChoice}번, 이미지="${colPlans[0].adjective}", 경험=${colPlans[0].hasPurchaseExp ? '예' : '아니오'})`,
          'info',
          'Q3'
        );

        await surveyPage.waitForTimeout(600);
        await clickNextButton(surveyPage);
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

        const pickedQ4 = await surveyPage.evaluate(({ targetBrand, isNone }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 4-1] 구입 채널 경로 주관식
      if (info.screenType === 'Q4_1_CHANNEL') {
        const catState = await getOrInitCategoryState(info.categoryName);
        emitLog(`[${catState.categoryName} - 문항 4-1] 구입 채널 = "${catState.selectedChannel}"`, 'info', 'Q4-1');
        await surveyPage.evaluate(({ channelText }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 5] 문항 4 응답과 동일 선택
      if (info.screenType === 'Q5_SAME_AS_Q4') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const pickedQ5 = await surveyPage.evaluate(({ sameBrand, isNone }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 6] 아니오 80% / 예 20%
      if (info.screenType === 'Q6_YES_NO') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const chooseNo = (rng() * 100) < Number(policy.q6NoRate ?? 80);
        const targetLabel = chooseNo ? '아니오' : '예';
        await surveyPage.evaluate(({ want }) => {
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
          await surveyPage.evaluate(({ fallbackBrand }) => {
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
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 7] 1순위 · 2순위 랜덤 선택 ('기타' 클릭 절대 금지!)
      if (info.screenType === 'Q7_RANK_1_2') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const rankInfo = await surveyPage.evaluate(({ seedNum }) => {
          const isForbiddenLabel = (txt) => /기타|없음|모름/.test(txt);

          // 케이스 A: 1순위/2순위 드롭다운(<select>) 형태
          const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled && s.offsetParent !== null);
          if (selects.length >= 2) {
            const opts1 = Array.from(selects[0].options).filter(o => o.value !== '' && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
            if (opts1.length >= 2) {
              const idx1 = seedNum % opts1.length;
              const idx2 = (seedNum + 1 + ((seedNum >> 3) % (opts1.length - 1))) % opts1.length;
              selects[0].value = opts1[idx1].value;
              selects[0].dispatchEvent(new Event('change', { bubbles: true }));
              const opts2 = Array.from(selects[1].options).filter(o => o.value !== '' && o.value !== opts1[idx1].value && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
              if (opts2[0]) {
                const pick2 = opts2[idx2 % opts2.length];
                selects[1].value = pick2.value;
                selects[1].dispatchEvent(new Event('change', { bubbles: true }));
                return { r1: opts1[idx1].text, r2: pick2.text };
              }
            }
          }

          // 케이스 B: 두 개의 라디오 그룹(1순위 열 / 2순위 열) 또는 순서 클릭형 체크박스
          const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
          const radioGroups = new Map();
          for (const r of radios) {
            if (!radioGroups.has(r.name)) radioGroups.set(r.name, []);
            radioGroups.get(r.name).push(r);
          }
          const groups = Array.from(radioGroups.values());
          if (groups.length >= 2) {
            const g1 = groups[0].filter(r => !isForbiddenLabel((r.closest('label, tr, td, li, div')?.innerText || '').trim()));
            const g2 = groups[1].filter(r => !isForbiddenLabel((r.closest('label, tr, td, li, div')?.innerText || '').trim()));
            if (g1.length >= 2 && g2.length >= 2) {
              const i1 = seedNum % g1.length;
              let i2 = (seedNum + 2) % g2.length;
              if (g2[i2].value === g1[i1].value) i2 = (i1 + 1) % g2.length;
              g1[i1].click();
              g1[i1].checked = true;
              g1[i1].dispatchEvent(new Event('change', { bubbles: true }));
              g2[i2].click();
              g2[i2].checked = true;
              g2[i2].dispatchEvent(new Event('change', { bubbles: true }));
              return { r1: g1[i1].value, r2: g2[i2].value };
            }
          }

          // 케이스 C: 순서 클릭형 체크박스 2개
          const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => {
            const t = (cb.closest('label, tr, td, li, div')?.innerText || '').trim();
            return !cb.disabled && !cb.checked && !isForbiddenLabel(t);
          });
          if (cbs.length >= 2) {
            const c1 = cbs[seedNum % cbs.length];
            const c2 = cbs[(seedNum + 1) % cbs.length];
            c1.click();
            c2.click();
            return {
              r1: (c1.closest('label, tr, td, li, div')?.innerText || '').trim(),
              r2: (c2.closest('label, tr, td, li, div')?.innerText || '').trim()
            };
          }
          return { r1: '', r2: '' };
        }, { seedNum: Math.floor(rng() * 10000) });

        emitLog(`[${catState.categoryName} - 문항 7] 1순위="${rankInfo.r1}", 2순위="${rankInfo.r2}" (기타 배제 완료)`, 'info', 'Q7');
        await surveyPage.waitForTimeout(450);
        await clickNextButton(surveyPage);
        continue;
      }

      // [문항 8] 랜덤 2개 복수 선택 ('기타'/'없음' 제외)
      if (info.screenType === 'Q8_MULTI_2') {
        const catState = await getOrInitCategoryState(info.categoryName);
        const picked2 = await surveyPage.evaluate(({ seedNum }) => {
          const validCbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => {
            const txt = (cb.closest('label, li, tr, td, div')?.innerText || '').trim();
            return !cb.disabled && !cb.checked && txt && !/기타|없음|모름/.test(txt);
          });
          if (validCbs.length >= 2) {
            const idx1 = seedNum % validCbs.length;
            let idx2 = (seedNum + 3) % validCbs.length;
            if (idx2 === idx1) idx2 = (idx1 + 1) % validCbs.length;
            validCbs[idx1].click();
            validCbs[idx1].checked = true;
            validCbs[idx1].dispatchEvent(new Event('change', { bubbles: true }));
            validCbs[idx2].click();
            validCbs[idx2].checked = true;
            validCbs[idx2].dispatchEvent(new Event('change', { bubbles: true }));
            return [
              (validCbs[idx1].closest('label, li, tr, td, div')?.innerText || '').trim(),
              (validCbs[idx2].closest('label, li, tr, td, div')?.innerText || '').trim()
            ];
          }
          return [];
        }, { seedNum: Math.floor(rng() * 10000) });

        emitLog(`[${catState.categoryName} - 문항 8] 랜덤 2개 선택 = [${picked2.join(', ')}]`, 'info', 'Q8');
        await surveyPage.waitForTimeout(450);
        await clickNextButton(surveyPage);
        continue;
      }

      // [최종 완료 직전 관문] Rule 10 안전 대기 처리
      if (info.screenType === 'FINAL_SUBMIT_GATE') {
        if (safetyGuard || policy.stopBeforeFinalSubmit !== false) {
          emitLog(
            `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 최종 완료 화면 직전에 안전 정지했습니다 (진행률 ${info.progressPct || 99}%).`,
            'info',
            'SAFE_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'FINAL_GATE',
            statusLabel: '완료직전 대기(99%)',
            quotaStatus: 'pilot_done',
            progress: `${info.progressPct || 99}%`,
            categoryConfigs,
            gps
          };
        }
      }

      // [배경변인(DQ) 또는 일반 미분류 스텝] 연령/성별 정합 안전 응답
      emitLog(`[일반/배경 문항 처리] 진행률=${info.progressPct ?? '-'}% (${info.badge || 'DQ'})`, 'info', 'DQ');
      await surveyPage.evaluate(({ rAge, seedNum }) => {
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
      const clickedBtn = await clickNextButton(surveyPage);
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
    emitLog(`[K-BPI 실행 오류] ${err.message}`, 'error', 'ERROR');
    return {
      success: false,
      error: err.message,
      categoryConfigs,
      gps
    };
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn('[K-BPI Runner Browser 종료 경고]', e.message));
    }
  }
}
