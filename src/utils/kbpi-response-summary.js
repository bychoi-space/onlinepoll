/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사]
 * 실시간 응답 내역 요약 빌더 및 CAPI 서버 저장 응답(PREV_DATA) 읽기 전용 복원 유틸리티
 */
import { KBPI_230_CODEBOOK } from '../config/kbpi-230-codebook.js';
import { resolveKbpiZqAnswers } from '../engine/kmac-kbpi-runner.js';
import { loginAndEnterKbpiCapiList } from '../engine/kmac-kbpi-scraper.js';
import { KBPI_DEFAULT_LOGIN_ID, normalizeCategoryConfigs } from './kmac-kbpi-sheet-sync.js';
import { launchChromium } from './chromium-launcher.js';

export const ZQ_OPTION_LABELS = {
  ZQ1: { '1': '10대', '2': '20대', '3': '30대', '4': '40대', '5': '50대' },
  ZQ2: { '1': '중졸 이하', '2': '고졸 이하', '3': '중/고등학생', '4': '대학생', '5': '대졸', '6': '대학원 재학/졸업' },
  ZQ3: {
    '1': '농업/어업/임업', '2': '자영업', '3': '사무직', '4': '판매/서비스직', '5': '관리직',
    '6': '생산직', '7': '전문직', '8': '기술직', '9': '중/고등학생', '10': '대학생',
    '11': '주부', '12': '무직', '13': '기타'
  },
  ZQ4: { '1': '200만원 미만', '2': '200~399만원', '3': '400~599만원', '4': '600~799만원', '5': '800만원 이상' },
  ZQ5: { '1': '미혼', '2': '기혼', '3': '기타(이혼/사별/별거)', '4': '비혼' },
  ZQ5_1: { '1': '1명(본인)', '2': '2명', '3': '3명', '4': '4명', '5': '5명 이상' },
  ZQ5_2: { '1': '1명', '2': '2명', '3': '3명', '4': '4명 이상', '5': '해당사항 없음' },
  ZQ6: { '1': '있다', '2': '없다' }
};

export const Q41_FACTOR_LABELS = {
  '1': '브랜드 충성 (애착·자부심)',
  '2': '품질/성능 우수',
  '3': '합리적 가격 (가성비)',
  '4': '디자인/스타일',
  '5': '광고/프로모션',
  '6': '주변 추천/평판',
  '7': '기타',
  '8': '이용/접근 편리성',
  '9': '기업 신뢰/이미지'
};

export const DQ1_CHANNEL_LABELS = {
  '1': 'TV/라디오',
  '2': '온라인 커뮤니티(카페, 블로그 등)',
  '3': '소셜미디어(X, 인스타그램, 유튜브 등)',
  '4': '포털사이트 검색',
  '5': '주변 지인(가족, 친구, 동료 등)',
  '6': '신문/잡지/카탈로그',
  '7': '매장 방문/옥외광고',
  '8': '온라인 쇼핑몰/앱 리뷰',
  '9': '생성형 AI',
  '10': '기타'
};

export function resolveOfficialBrandLabel(industryKey = '', rawBrand = '', unaidedFirst = '') {
  const tb = String(rawBrand ?? '').trim();
  if (!tb) return { brandName: '', brandCode: '' };
  if (tb === '없음' || tb === '99' || tb === '999') {
    return { brandName: '없음', brandCode: tb === '없음' ? '' : tb };
  }
  if (/^ETC(\d+)$/i.test(tb)) {
    const idx = tb.replace(/\D/g, '') || '1';
    return {
      brandName: unaidedFirst ? `${unaidedFirst} (문항1 상기 #${idx})` : `문항1 최초상기 입력 브랜드 (${tb})`,
      brandCode: tb
    };
  }
  const ik = String(industryKey || '').trim();
  const entry = KBPI_230_CODEBOOK[ik];
  if (/^\d+$/.test(tb) && entry?.brands?.[tb]) {
    return {
      brandName: entry.brands[tb],
      brandCode: tb
    };
  }
  return { brandName: tb, brandCode: '' };
}

export function evaluateKbpiSlotReviewNotes({ respondent = {}, categoryName = '', purchaseExp = '', brandName = '', channel = '' }) {
  const notes = [];
  if (purchaseExp !== '있음') return notes;

  const cat = String(categoryName || '').trim();
  const br = String(brandName || '').trim();
  const ch = String(channel || '').trim();
  const gender = String(respondent.gender || respondent.ceoGender || '').trim();
  const region = String(respondent.region || '').trim();

  if (!br && !ch) {
    notes.push('로컬 DB 미기록 (상단 [CAPI 서버 응답 동기화] 실행 시 복원 가능)');
    return notes;
  }

  const foodRetailSet = new Set(['동네슈퍼', '컬리', '홈플러스', '편의점', 'GS25', 'CU', '이마트', '롯데마트']);
  if ((/항공|생성형\s*AI|프라이빗뱅킹|승용차|세단/.test(cat)) && foodRetailSet.has(ch)) {
    notes.push(`채널 부조화 주의 (${ch})`);
  } else if ((/전기레인지|인덕션|보일러/.test(cat)) && (foodRetailSet.has(ch) || ch === '쿠팡')) {
    notes.push(`설치가전 구입채널 확인 (${ch})`);
  } else if ((/변비약|소염진통제|진통제|위장약/.test(cat)) && (foodRetailSet.has(ch) || ch === '쿠팡' || ch === '네이버쇼핑')) {
    notes.push(`의약품 약국 외 채널 기재 (${ch})`);
  } else if (/축산물/.test(cat) && /한우/.test(br) && (ch === 'CU' || ch === 'GS25' || ch === '편의점')) {
    notes.push(`한우 브랜드 편의점 채널 확인 (${ch})`);
  } else if (/비대면진료\s*플랫폼/.test(cat) && ch === '병원 직접 방문') {
    notes.push('앱 플랫폼이나 병원 직접 방문 기재');
  } else if (/뷰티플랫폼/.test(cat) && ch === '백화점 매장') {
    notes.push('온라인 플랫폼이나 백화점 매장 기재');
  }

  if (region.includes('서울') && (/지역거점\s*종합병원/.test(cat) || (/종합병원/.test(cat) && /영남대|동아대|부산대|울산대|전남대|충남대|경북대/.test(br)))) {
    notes.push('서울 거주자 비수도권 병원 선택');
  }
  if (gender.startsWith('남') && /스튜디오톰보이|여성/.test(br)) {
    notes.push('남성 응답자 여성복 중심 브랜드 선택');
  }
  return notes;
}

function buildFormattedZq(item = {}) {
  const plan = resolveKbpiZqAnswers(item);
  const capiZq = item.capiSavedAnswers?.zq || {};

  const fmt = (qKey, fallbackKey, etcText = '') => {
    const k = String(capiZq[qKey] || fallbackKey || '').trim();
    const map = ZQ_OPTION_LABELS[qKey] || {};
    const lb = map[k] || k;
    if (qKey === 'ZQ3' && k === '13' && etcText) {
      return `${k}. 기타(${etcText})`;
    }
    return k ? `${k}. ${lb}` : '-';
  };

  return {
    ZQ1: fmt('ZQ1', plan.zq1Key),
    ZQ2: fmt('ZQ2', plan.zq2Key),
    ZQ3: fmt('ZQ3', plan.zq3Key, plan.zq3EtcText),
    ZQ4: fmt('ZQ4', plan.zq4Key),
    ZQ5: fmt('ZQ5', plan.zq5Key),
    ZQ5_1: fmt('ZQ5_1', plan.zq5_1Key),
    ZQ5_2: fmt('ZQ5_2', plan.zq5_2Key),
    ZQ6: fmt('ZQ6', '2')
  };
}

export function buildKbpiResponseSummary(campaign = {}) {
  const quotaDb = Array.isArray(campaign.quotaDatabase) ? campaign.quotaDatabase : [];
  const sorted = [...quotaDb].sort((a, b) => Number(a.seq || a.index || 0) - Number(b.seq || b.index || 0));

  let completedCount = 0;
  let pilotDoneCount = 0;
  let scannedCount = 0;
  let readyCount = 0;
  let totalWarnSlots = 0;

  const answeredRespondents = [];
  const allRespondents = [];

  for (const item of sorted) {
    const seq = Number(item.seq || item.index || 0);
    const qs = String(item.quotaStatus || 'ready');
    const statusText = String(item.status || '대기');
    const isAnswered = qs === 'pilot_done' || qs === 'completed' || /완료직전|^완료$/.test(statusText);

    if (qs === 'completed' || statusText === '완료') completedCount++;
    else if (isAnswered) pilotDoneCount++;
    else if (qs === 'scanned' || /스캔완료|신상등록/.test(statusText)) scannedCount++;
    else readyCount++;

    const rawConfigs = Array.isArray(item.categoryConfigs) ? item.categoryConfigs : [];
    const validConfigs = rawConfigs.filter(c => c && String(c.categoryName || '').trim());
    const capiCats = item.capiSavedAnswers?.categories || {};

    const slots = validConfigs.map((cfg, idx) => {
      const slotNum = Number(cfg.slot || (idx + 1));
      const ik = String(cfg.industryKey || '').trim();
      const cn = String(cfg.categoryName || KBPI_230_CODEBOOK[ik]?.name || '').trim();
      const capiCat = (ik && capiCats[ik]) ? capiCats[ik] : null;

      let exp = cfg.purchaseExp === '없음' ? '없음' : '있음';
      if (capiCat?.purchaseExp) {
        exp = capiCat.purchaseExp;
      }

      const unaidedList = Array.isArray(capiCat?.q1Brands) ? capiCat.q1Brands : [];
      const rawBrand = capiCat?.q4Code || cfg.topBrand || '';
      const { brandName, brandCode } = resolveOfficialBrandLabel(ik, rawBrand, unaidedList[0] || '');
      const channel = String(capiCat?.channel ?? cfg.channel ?? '').trim();

      const reviewNotes = isAnswered
        ? evaluateKbpiSlotReviewNotes({
            respondent: item,
            categoryName: cn,
            purchaseExp: exp,
            brandName,
            channel
          })
        : [];

      if (reviewNotes.length > 0) {
        totalWarnSlots++;
      }

      return {
        slot: slotNum,
        industryKey: ik,
        categoryName: cn,
        purchaseExp: exp,
        brandName: exp === '없음' ? '없음' : brandName,
        brandCode: exp === '없음' ? '' : brandCode,
        channel: exp === '없음' ? '' : channel,
        q1Brands: unaidedList,
        q2Count: capiCat?.q2Count ?? null,
        q3Summary: capiCat?.q3Summary || '',
        q41Factor: capiCat?.q41Factor || '',
        q6AiSearch: capiCat?.q6AiSearch || '',
        reviewNotes
      };
    });

    const baseInfo = {
      seq,
      region: item.region || '',
      gender: item.gender || item.ceoGender || '',
      ageGroup: item.ageGroup || '',
      age: Number(item.age || item.ceoAge || 0),
      name: item.name || item.ceoName || '',
      phone: item.phone || '',
      status: statusText,
      quotaStatus: qs,
      progress: item.progress || (qs === 'completed' ? '100%' : '3%'),
      finalId: String(item.finalId || ''),
      uid: item.uid || '',
      education: item.education || '',
      job: item.job || '',
      householdIncome: item.householdIncome || '',
      maritalStatus: item.maritalStatus || '',
      familySize: item.familySize || '',
      childrenCount: item.childrenCount || '',
      surveyDistrict: item.surveyDistrict || '',
      surveyDong: item.surveyDong || '',
      gpsLabel: item.gpsLabel || '',
      latitude: item.latitude || null,
      longitude: item.longitude || null,
      completedAt: item.completedAt || '',
      capiSyncedAt: item.capiSavedAnswers?.syncedAt || ''
    };

    allRespondents.push({
      ...baseInfo,
      isAnswered,
      yesCount: slots.filter(s => s.purchaseExp === '있음').length,
      noCount: slots.filter(s => s.purchaseExp === '없음').length,
      slots: slots.map(s => ({
        slot: s.slot,
        industryKey: s.industryKey,
        categoryName: s.categoryName,
        purchaseExp: s.purchaseExp
      }))
    });

    if (isAnswered) {
      answeredRespondents.push({
        ...baseInfo,
        zq: buildFormattedZq(item),
        dq1Labels: item.capiSavedAnswers?.dq1Labels || [],
        warnCount: slots.filter(s => s.reviewNotes.length > 0).length,
        yesCount: slots.filter(s => s.purchaseExp === '있음').length,
        noCount: slots.filter(s => s.purchaseExp === '없음').length,
        slots
      });
    }
  }

  const ageGroups = ['10대', '20대', '30대', '40대', '50대'];
  const segmentCombos = [
    { region: '서울', gender: '남' },
    { region: '서울', gender: '여' },
    { region: '인천', gender: '남' },
    { region: '인천', gender: '여' }
  ];

  const segmentMatrix = segmentCombos.map(({ region, gender }) => {
    let rowAnswered = 0;
    let rowTotal = 0;
    const cells = ageGroups.map((ag) => {
      const sub = allRespondents.filter(r => r.region === region && r.gender === gender && r.ageGroup === ag);
      const ans = sub.filter(r => r.isAnswered).length;
      rowAnswered += ans;
      rowTotal += sub.length;
      return { ageGroup: ag, answered: ans, total: sub.length };
    });
    return { region, gender, cells, rowAnswered, rowTotal };
  });

  return {
    success: true,
    campaignId: campaign.id,
    title: campaign.title,
    loginId: campaign.loginId || KBPI_DEFAULT_LOGIN_ID,
    googleSheetUrl: campaign.googleSheetUrl || 'https://docs.google.com/spreadsheets/d/16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg/edit',
    updatedAt: campaign.updatedAt || new Date().toISOString(),
    kpis: {
      totalCount: allRespondents.length,
      seoulCount: allRespondents.filter(r => r.region.includes('서울')).length,
      incheonCount: allRespondents.filter(r => r.region.includes('인천')).length,
      answeredCount: answeredRespondents.length,
      pilotDoneCount,
      completedCount,
      scannedCount,
      readyCount,
      totalWarnSlots
    },
    segmentMatrix,
    answeredRespondents,
    allRespondents
  };
}

/**
 * [읽기 전용 CAPI 응답 복원기]
 * 설문 제출/다음 버튼 클릭을 일절 수행하지 않고, CAPI 슬롯 진입 직후 메모리의 window.A.PREV_DATA / window.AO만 읽어
 * 실제 서버에 저장된 Q1~Q8, DQ1, ZQ1~ZQ6 응답값을 안전하게 추출합니다.
 */
export async function fetchReadOnlyKbpiCapiAnswers({
  campaign = {},
  targetItems = [],
  onProgress = () => {}
} = {}) {
  const policy = campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {};
  const loginId = String(campaign?.loginId || KBPI_DEFAULT_LOGIN_ID).trim();
  const loginPw = String(campaign?.loginPw || loginId).trim();
  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';

  const browser = await launchChromium({
    headless: true,
    args: ['--ignore-certificate-errors'],
    ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
  });

  const syncedResults = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 920 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      ignoreHTTPSErrors: true
    });
    const rootPage = await context.newPage();
    rootPage.on('dialog', async (d) => {
      await d.accept().catch(err => console.warn('[K-BPI ReadOnly Dialog 경고]', err.message));
    });
    context.on('page', (pg) => {
      pg.on('dialog', async (d) => {
        await d.accept().catch(err => console.warn('[K-BPI ReadOnly Tab Dialog 경고]', err.message));
      });
    });

    const listPage = await loginAndEnterKbpiCapiList({
      context,
      page: rootPage,
      loginId,
      loginPw,
      emitLog: (msg) => onProgress({ message: msg })
    });

    // 표시 개수를 100개로 확장
    await listPage.evaluate(() => {
      const sel = document.querySelector('select.ROW_PER_PAGE, select.capi-page-size');
      if (sel && sel.value !== '100') {
        sel.value = '100';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).catch(err => console.warn('[K-BPI ReadOnly 페이지 크기 확장 경고]', err.message));
    await listPage.waitForTimeout(1200);

    for (const item of targetItems) {
      const uid = String(item.uid || '').trim();
      const finalId = String(item.finalId || '').trim();
      onProgress({ message: `#${item.seq} ${item.name} (${uid}) CAPI 저장 데이터 읽기 전용 조회 중...` });

      let openedTab = null;
      try {
        // 페이지 순회하며 해당 UID 버튼 클릭해 새 창 오픈 (제출/다음 클릭 절대 없음!)
        let foundBtn = false;
        for (let pgTry = 0; pgTry < 6; pgTry++) {
          const matchRes = await listPage.evaluate(({ targetUid, targetFinalId }) => {
            document.querySelectorAll('[data-kbpi-ro-btn]').forEach(el => el.removeAttribute('data-kbpi-ro-btn'));
            const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
            for (const r of rows) {
              const txt = (r.innerText || '').trim();
              const attrUid = r.getAttribute('data-uid') || '';
              if ((targetUid && (attrUid === targetUid || txt.includes(targetUid))) ||
                  (targetFinalId && txt.split(/\s+/).includes(targetFinalId))) {
                const btn = r.querySelector('button.capi-join, button.join, button, a');
                if (btn && !btn.disabled) {
                  btn.setAttribute('data-kbpi-ro-btn', '1');
                  return { found: true };
                }
              }
            }
            return { found: false };
          }, { targetUid: uid, targetFinalId: finalId });

          if (matchRes.found) {
            const popPromise = context.waitForEvent('page', { timeout: 9000 }).catch(() => null);
            await listPage.evaluate(() => {
              const b = document.querySelector('[data-kbpi-ro-btn="1"]');
              if (b) b.click();
            });
            openedTab = await popPromise;
            foundBtn = Boolean(openedTab);
            break;
          }

          const movedNext = await listPage.evaluate(({ nextPg }) => {
            const link = document.querySelector(`[data-page="${nextPg}"]`) || document.querySelector('button.capi-next:not(:disabled)');
            if (link) {
              link.click();
              return true;
            }
            return false;
          }, { nextPg: pgTry + 2 });
          if (!movedNext) break;
          await listPage.waitForTimeout(1200);
        }

        if (!foundBtn || !openedTab) {
          syncedResults.push({ seq: item.seq, uid, ok: false, error: '슬롯 버튼을 찾지 못했거나 이미 마감 잠금 상태입니다.' });
          continue;
        }

        // GetData의 window.A.PREV_DATA / window.AO 로드 완료까지만 대기 (아무 버튼도 클릭하지 않음!)
        await openedTab.waitForFunction(
          () => Boolean((window.A && window.A.PREV_DATA) || (window.AO && Object.keys(window.AO).length > 0)),
          { timeout: 15000 }
        ).catch(err => console.warn('[K-BPI ReadOnly PREV_DATA 대기 경고]', err.message));
        await openedTab.waitForTimeout(800);

        const rawDump = await openedTab.evaluate(() => {
          const merged = Object.assign({}, window.A?.PREV_DATA || {}, window.AO || {});
          return merged;
        });

        await openedTab.close().catch(err => console.warn('[K-BPI ReadOnly 탭 닫기 경고]', err.message));
        openedTab = null;

        // 1페이지로 복귀
        await listPage.evaluate(() => {
          const p1 = document.querySelector('[data-page="1"]');
          if (p1) p1.click();
        }).catch(err => console.warn('[K-BPI ReadOnly 1페이지 복귀 경고]', err.message));
        await listPage.waitForTimeout(500);

        // 추출된 PREV_DATA 파싱
        const pickRadioVal = (obj) => {
          if (!obj || typeof obj !== 'object') return '';
          return String(obj.RESPONSE ?? obj.VALUE ?? obj['1'] ?? obj.RADIO ?? '').trim();
        };
        const pickTextVal = (obj) => {
          if (!obj || typeof obj !== 'object') return '';
          return String(obj.TEXT_1 ?? obj.RESPONSE ?? obj.VALUE ?? obj['1'] ?? '').trim();
        };

        const orderStr = pickTextVal(rawDump.INDUSTRY_ORDER);
        const indKeys = orderStr
          ? orderStr.split(',').map(s => s.trim()).filter(Boolean)
          : (item.categoryConfigs || []).map(c => String(c?.industryKey || '').trim()).filter(Boolean);

        const categories = {};
        for (const ik of indKeys) {
          const q1Brands = [];
          for (let n = 1; n <= 4; n++) {
            const v = pickTextVal(rawDump[`KBPI_Q1_${n}--${ik}`]);
            if (v && v !== '없음') q1Brands.push(v);
          }

          const q2Obj = rawDump[`KBPI_Q2--${ik}`] || {};
          const q2Count = Object.keys(q2Obj).filter(k => /^\d+$/.test(k) && k !== '99' && q2Obj[k]).length;

          const q3Obj = rawDump[`KBPI_Q3--${ik}`] || {};
          const q3Sat = String(q3Obj.Q3_1_14 || '').trim();
          const q3Rec = String(q3Obj.Q3_1_15 || '').trim();
          const q3Reason = String(q3Obj.Q3_1_16 || '').trim();
          const q3ExpCode = String(q3Obj.Q3_1_17 || '').trim();

          const q4Code = pickRadioVal(rawDump[`KBPI_Q4--${ik}`]);
          const q41Code = pickRadioVal(rawDump[`KBPI_Q41--${ik}`]);
          const channel = pickTextVal(rawDump[`KBPI_Q41_CHANNEL--${ik}`]);
          const q6Code = pickRadioVal(rawDump[`KBPI_Q6--${ik}`]);

          const isNone = q4Code === '99' || q4Code === '999' || q3ExpCode === '2';
          categories[ik] = {
            q1Brands,
            q2Count,
            q3Summary: q3Sat ? `만족도 ${q3Sat}점 · 추천 ${q3Rec}점${q3Reason ? ` ("${q3Reason}")` : ''}` : '',
            purchaseExp: q4Code ? (isNone ? '없음' : '있음') : (q3ExpCode === '1' ? '있음' : (q3ExpCode === '2' ? '없음' : '')),
            q4Code,
            q41Factor: Q41_FACTOR_LABELS[q41Code] || q41Code,
            channel,
            q6AiSearch: q6Code === '1' ? '예' : (q6Code === '2' ? '아니오' : '')
          };
        }

        const dq1Obj = rawDump.DQ1 || {};
        const dq1Labels = Object.keys(dq1Obj)
          .filter(k => /^\d+$/.test(k) && dq1Obj[k])
          .map(k => DQ1_CHANNEL_LABELS[k] || k);

        const zq = {};
        for (const zk of ['ZQ1', 'ZQ2', 'ZQ3', 'ZQ4', 'ZQ5', 'ZQ5_1', 'ZQ5_2', 'ZQ6']) {
          const zv = pickRadioVal(rawDump[zk]);
          if (zv) zq[zk] = zv;
        }

        // 로컬 categoryConfigs 결측 필드(예: #2 이휘진 슬롯 2~20) 안전 보강
        const updatedConfigs = normalizeCategoryConfigs(item.categoryConfigs || [], 20);
        updatedConfigs.forEach((cfg) => {
          const ik = String(cfg.industryKey || '').trim();
          const cData = categories[ik];
          if (!cData) return;
          if (cData.purchaseExp) cfg.purchaseExp = cData.purchaseExp;
          if (cData.q4Code) {
            const { brandName } = resolveOfficialBrandLabel(ik, cData.q4Code, cData.q1Brands[0] || '');
            cfg.topBrand = cData.purchaseExp === '없음' ? '없음' : (brandName || cData.q4Code);
          }
          if (cData.channel) {
            cfg.channel = cData.channel;
          }
        });
        item.categoryConfigs = updatedConfigs;
        item.capiSavedAnswers = {
          syncedAt: new Date().toISOString(),
          categories,
          dq1Labels,
          zq
        };

        syncedResults.push({ seq: item.seq, uid, ok: true, categoryCount: Object.keys(categories).length });
      } catch (slotErr) {
        if (openedTab) {
          await openedTab.close().catch(e => console.warn('[K-BPI ReadOnly 예외 탭 닫기 경고]', e.message));
        }
        syncedResults.push({ seq: item.seq, uid, ok: false, error: slotErr.message });
      }
    }

    await context.close().catch(err => console.warn('[K-BPI ReadOnly Context 종료 경고]', err.message));
    return { success: true, syncedResults };
  } finally {
    await browser.close().catch(err => console.warn('[K-BPI ReadOnly Browser 종료 경고]', err.message));
  }
}
