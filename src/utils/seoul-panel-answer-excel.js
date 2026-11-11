/**
 * [메트릭스 (신규/유지) 2026년 서울시 소상공인 사업체 패널조사(5차)]
 * 응답자별 제출 문항·답변 Excel(.xlsx) 생성 및 구글 스프레드시트 실시간 동기화 유틸리티
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { launchChromium } from './chromium-launcher.js';

export const SEOUL_PANEL_DEFAULT_GSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1-Zh2ERZGkeetwdg_oNlfPBfuVMOAGBL1-J8nYnjURTs/edit?gid=506086780#gid=506086780';

export const SEOUL_PANEL_QUESTION_COLS = [
  { col: 'A1_사업체명', codes: ['A1'] },
  { col: 'A1a_응답자명', codes: ['A1a'] },
  { col: 'A2_사업자형태', codes: ['A2'] },
  { col: 'A2a_사업자번호', codes: ['A2a'] },
  { col: 'A3_업종', codes: ['A3'] },
  { col: 'A4_사업체주소', codes: ['A4'] },
  { col: 'A5_면적(평)', codes: ['A5', 'A4a'] },
  { col: 'A6_사업장위치(층)', codes: ['A6'] },
  { col: 'A7_가게연락처', codes: ['A7'] },
  { col: 'A7a_핸드폰', codes: ['A7a'] },
  { col: 'A10_사장님실거주지', codes: ['A10'] },
  { col: 'A11_서울사랑상품권', codes: ['A11'] },
  { col: 'B8_타사업체보유', codes: ['B8'] },
  { col: 'C1_영업시간', codes: ['C1'] },
  { col: 'C2_휴무유무', codes: ['C2'] },
  { col: 'C2_1_휴무기준', codes: ['C2_1'] },
  { col: 'C2_2_휴무요일', codes: ['C2_2'] },
  { col: 'C3_매출및영업비용(25~26년)', codes: ['C3'] },
  { col: 'C4_월평균순소득(만원)', codes: ['C4'] },
  { col: 'C5_타소득유무', codes: ['C5'] },
  { col: 'C6_결제수단비율(100%)', codes: ['C6'] },
  { col: 'C7_부채유무', codes: ['C7'] },
  { col: 'C7_1_부채금액및금리', codes: ['C7_1'] },
  { col: 'C8_경영애로유무', codes: ['C8'] },
  { col: 'C8_1_주된애로사항(1·2순위)', codes: ['C8_1'] },
  { col: 'C9_점유형태', codes: ['C9'] },
  { col: 'C9_1_임차료(보증금/월세)', codes: ['C9_1'] },
  { col: 'C10_권리금유무', codes: ['C10'] },
  { col: 'C10_1_권리금금액', codes: ['C10_1'] },
  { col: 'C11_선호임대료형태', codes: ['C11'] },
  { col: 'C12_프랜차이즈여부', codes: ['C12'] },
  { col: 'C13_고용보험가입', codes: ['C13'] },
  { col: 'C14_온라인플랫폼활용', codes: ['C14'] },
  { col: 'C14_2~4_플랫폼매출및수수료', codes: ['C14_2', 'C14_3', 'C14_4'] },
  { col: 'C15_SNS마케팅활용', codes: ['C15'] },
  { col: 'C16_무인기계(키오스크)도입', codes: ['C16'] },
  { col: 'C16_1_무인기계도입의향', codes: ['C16_1'] },
  { col: 'D0~D4_종사자수(총원/대표/상용/무급/기타)', codes: ['D0', 'D1', 'D2', 'D3', 'D4'] },
  { col: 'D5~D8_상용직근무시간/휴무/근속/월급', codes: ['D5', 'D6', 'D7', 'D8'] },
  { col: 'D9_향후1년고용계획', codes: ['D9'] },
  { col: 'E2~E6_아르바이트고용현황', codes: ['E2', 'E3', 'E4', 'E5', 'E6'] },
  { col: 'F1_최근1년장소이전경험', codes: ['F1'] },
  { col: 'F2_향후1년장소이전계획', codes: ['F2'] },
  { col: 'F3_향후1년폐업고려', codes: ['F3'] },
  { col: 'F3_2_사업계속영위이유', codes: ['F3_2'] },
  { col: 'J2_정부지자체지원수혜', codes: ['J2'] },
  { col: 'J2_2_수혜정책및만족도', codes: ['J2_2'] },
  { col: 'J3_서울시지원정책인지도', codes: ['J3'] },
  { col: 'J4_지원정책인지경로', codes: ['J4'] },
  { col: 'J5_서울시활용희망정책', codes: ['J5'] },
  { col: 'J6_우선지원필요분야', codes: ['J6'] },
  { col: 'J7_노후준비여부', codes: ['J7'] },
  { col: 'J7_1_노후준비수단', codes: ['J7_1'] },
  { col: 'K1_경기동향(26년실적/27년전망)', codes: ['K1'] },
  { col: 'K2_삶의만족도(10점척도)', codes: ['K2'] },
  { col: 'L1_건강검진수검', codes: ['L1'] },
  { col: 'L2_만성질환유무', codes: ['L2', 'L2_1'] },
  { col: 'L3_우울감경험', codes: ['L3', 'L3_1'] },
  { col: 'M1_성공비결_경영요인(1~3순위)', codes: ['M1'] },
  { col: 'M2_성공비결_비용요인(1~2순위)', codes: ['M2'] },
  { col: 'M3_성공비결_상권요인(1~3순위)', codes: ['M3'] },
  { col: 'N1_창업예상대비실제비교', codes: ['N1'] },
  { col: 'N2_경영안정화소요기간', codes: ['N2'] },
  { col: 'N3_안정화애로사항(1·2순위)', codes: ['N3'] },
  { col: 'N4_인건비상승부담정도', codes: ['N4'] },
  { col: 'N5_인건비상승대응조치(1~2순위)', codes: ['N5'] },
  { col: 'N6_최저임금차등적용찬반', codes: ['N6'] },
  { col: 'N6_1_차등적용기준별동의', codes: ['N6_1'] },
  { col: 'O1_서울신용보증재단인지도', codes: ['O1', 'O1_1', 'O2', 'O3', 'O4'] }
];

function extractQuotaArray(quotaDatabase) {
  if (Array.isArray(quotaDatabase)) return quotaDatabase;
  if (quotaDatabase && Array.isArray(quotaDatabase.results)) return quotaDatabase.results;
  if (quotaDatabase && Array.isArray(quotaDatabase.data)) return quotaDatabase.data;
  return [];
}

function normalizeAnswersMap(item) {
  const map = {};
  const raw = item?.submittedAnswers;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || !entry.questionCode) continue;
      const code = String(entry.questionCode).trim();
      const val = String(entry.submittedAnswer ?? entry.answer ?? '').trim();
      if (code && val) {
        map[code] = val;
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const val = String(v ?? '').trim();
      if (k && val) {
        map[k] = val;
      }
    }
  }

  // 복합 문항 요약값 자동 합성
  if (!map.A4 && (map.A4_1 || map.A4_2 || map.A4_3 || map.A4_4)) {
    map.A4 = [map.A4_1, map.A4_2, map.A4_3, map.A4_4].filter(Boolean).join(' ');
  }
  if (!map.A10 && (map.A10_1 || map.A10_2 || map.A10_3 || map.A10_4)) {
    map.A10 = [map.A10_1, map.A10_2, map.A10_3, map.A10_4].filter(Boolean).join(' ');
  }
  if (!map.C1 && (map.C1_1 || map.C1_2)) {
    map.C1 = `${map.C1_1 || '9'}시 ~ ${map.C1_2 || '21'}시`;
  }
  if (!map.C3 && (map.C3_1_3 || map.C3_1_4)) {
    const p25 = map.C3_1_3 ? `25년(매출:${map.C3_1_3}/비용:${map.C3_2_3 || ''}/이익:${map.C3_7_3 || ''})` : '';
    const p26 = map.C3_1_4 ? `26년(매출:${map.C3_1_4}/비용:${map.C3_2_4 || ''}[원가:${map.C3_3_4 || ''},급여:${map.C3_4_4 || ''},임차:${map.C3_5_4 || ''},기타:${map.C3_6_4 || ''}]/이익:${map.C3_7_4 || ''})` : '';
    map.C3 = [p25, p26].filter(Boolean).join(' | ');
  }
  if (!map.C6 && (map.C6_1 || map.C6_2 || map.C6_3)) {
    map.C6 = ['C6_1', 'C6_2', 'C6_3', 'C6_4', 'C6_5'].map(k => map[k] ? `${k}:${map[k]}%` : '').filter(Boolean).join(', ');
  }
  if (!map.C7_1 && (map.C7_1_1 || map.C7_1_2)) {
    map.C7_1 = `부채:${map.C7_1_1 || 0}만원 / 금리:${map.C7_1_2 || 0}%`;
  }
  if (!map.C9_1 && (map.C9_1_1 || map.C9_1_2)) {
    map.C9_1 = `보증금:${map.C9_1_1 || 0}만원 / 월세:${map.C9_1_2 || 0}만원`;
  }
  if (!map.K1) {
    const k1Keys = Object.keys(map).filter(k => k.startsWith('K1_'));
    if (k1Keys.length > 0) {
      map.K1 = k1Keys.slice(0, 6).map(k => `${k}=${map[k]}`).join(', ');
    }
  }
  if (!map.K2) {
    const k2Keys = Object.keys(map).filter(k => k.startsWith('K2_'));
    if (k2Keys.length > 0) {
      map.K2 = k2Keys.map(k => `${k}=${map[k]}`).join(', ');
    }
  }
  if (!map.N1) {
    const n1Keys = ['N1_1', 'N1_2', 'N1_3', 'N1_4', 'N1_6', 'N1_7'].filter(k => map[k]);
    if (n1Keys.length > 0) {
      map.N1 = n1Keys.map(k => `${k}:${map[k]}`).join(', ');
    }
  }
  if (!map.N2) {
    const n2Keys = ['N2_1_1', 'N2_1_2', 'N2_2_1', 'N2_2_2', 'N2_3_1', 'N2_3_2'].filter(k => map[k]);
    if (n2Keys.length > 0) {
      map.N2 = n2Keys.map(k => `${k}:${map[k]}`).join(', ');
    }
  }
  if (!map.N6_1) {
    const n6Keys = ['N6_1_1', 'N6_1_2', 'N6_1_3'].filter(k => map[k]);
    if (n6Keys.length > 0) {
      map.N6_1 = n6Keys.map(k => `${k}:${map[k]}`).join(', ');
    }
  }
  if (!map.O4 && map.O4_1) {
    map.O4 = map.O4_1;
  }

  // 만약 중간 단계(예: 85%)부터 재개되어 A1~A7 페이지(Step 002)를 거치지 않은 경우 원장 데이터 및 AG1 데이터로 보완
  if (Object.keys(map).length > 0) {
    const uf = item?.rawUf || {};
    if (!map.A1) map.A1 = map.AG1_4 || item?.companyName || item?.storeName || uf.uf10 || '';
    if (!map.A1a) map.A1a = map.AG1_1 || '';
    if (!map.A2a) map.A2a = item?.bizNumber || item?.bizNo || uf.uf12 || '';
    if (!map.A3) map.A3 = item?.industryDetail || item?.industry || uf.uf08 || '';
    if (!map.A4) map.A4 = map.AG1_6 || item?.address || uf.uf14 || '';
    if (!map.A7) map.A7 = map.AG1_5 || item?.phone || uf.uf19 || '';
    if (!map.A7a) map.A7a = map.AG1_3 || item?.mobile || uf.uf20 || '';
  }

  return map;
}

export function persistSeoulPanelQuotaDatabase({
  quotaDatabase = [],
  quotaJsonPath = null
} = {}) {
  const rows = extractQuotaArray(quotaDatabase);
  const targetPath =
    quotaJsonPath ||
    path.resolve(process.cwd(), 'data', 'quotas', 'quota_metrix_seoul_panel_163.json');
  if (!fs.existsSync(targetPath) || rows.length === 0) {
    return false;
  }
  try {
    const fileObj = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    const existingRows = Array.isArray(fileObj.results)
      ? fileObj.results
      : (Array.isArray(fileObj.data) ? fileObj.data : []);
    const incomingByKey = new Map();
    rows.forEach(item => {
      const akey = item.akey || item.accountKey || '2010';
      const k = `${akey}-${item.resid || ''}`;
      if (item.resid) incomingByKey.set(k, item);
    });

    const mergedRows = existingRows.map((row, idx) => {
      const akey = row.akey || row.accountKey || '2010';
      const k = `${akey}-${row.resid || ''}`;
      const inc = incomingByKey.get(k);
      if (!inc) return row;
      const safeQuotaStatus =
        inc.quotaStatus === 'running'
          ? row.quotaStatus && row.quotaStatus !== 'running'
            ? row.quotaStatus
            : 'ready'
          : inc.quotaStatus || row.quotaStatus || 'ready';
      const incAns = inc.submittedAnswers;
      const hasIncAns = Array.isArray(incAns)
        ? incAns.length > 0
        : (incAns && typeof incAns === 'object' && Object.keys(incAns).length > 0);
      return {
        ...row,
        ...inc,
        quotaStatus: safeQuotaStatus,
        index: row.index || inc.index || idx + 1,
        seq: row.seq || inc.seq || idx + 1,
        submittedAnswers: hasIncAns ? incAns : (row.submittedAnswers || {})
      };
    });
    fileObj.results = mergedRows;
    delete fileObj.data;
    fileObj.updatedAt = new Date().toISOString();
    fs.writeFileSync(targetPath, JSON.stringify(fileObj, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[서울시 패널 쿼터 JSON 저장 경고] ${err.message}`);
    return false;
  }
}

export function buildSeoulPanelSheetsData({ quotaDatabase = [] }) {
  const rows = extractQuotaArray(quotaDatabase);
  const summaryRows = rows.map((item, idx) => {
    const ansMap = normalizeAnswersMap(item);
    const uf = item.rawUf || {};
    const akey = String(item.akey || item.accountKey || '2010');
    const row = {
      순번: item.index || item.seq || idx + 1,
      계정코드: akey,
      담당조사원: item.investigatorName || item.interviewerName || (akey === '2016' ? '조사원_정소영' : '조사원_송준희'),
      resid: String(item.resid || ''),
      표본구분: item.sampleType || uf.uf02 || '',
      패널구분: item.panelWave || item.panelType || uf.uf03 || '',
      보증여부: item.guaranteeType || uf.uf04 || '',
      원장_사업체명: item.companyName || item.storeName || uf.uf10 || '',
      원장_업종세세분류: item.industryDetail || item.industry || uf.uf08 || '',
      원장_사업자번호: item.bizNumber || item.bizNo || uf.uf12 || '',
      원장_주소: item.address || uf.uf14 || '',
      원장_연락처: item.phone || item.ceoMobile || uf.uf20 || '',
      진행상태: item.status || (item.quotaStatus === 'pilot_done' ? '동의서대기(99%)' : '대기'),
      진행률: item.progressText || item.progress || '0%',
      응답시각: item.pilotCompletedAt || item.completedAt || item.lastUpdated || ''
    };

    SEOUL_PANEL_QUESTION_COLS.forEach(({ col, codes }) => {
      const vals = codes.map(c => ansMap[c]).filter(Boolean);
      row[col] = vals.join(' / ');
    });

    return row;
  });

  return { summaryRows };
}

function autoFitColumns(rows, minW = 10, maxW = 38) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(k => {
    let maxLen = k.length * 1.6;
    for (const r of rows.slice(0, 60)) {
      const s = String(r[k] ?? '');
      if (s.length > maxLen) maxLen = s.length;
    }
    return { wch: Math.max(minW, Math.min(maxW, Math.ceil(maxLen + 2))) };
  });
}

export function buildSeoulPanelAnswersExcel({ quotaDatabase = [], filePath = null }) {
  const wb = XLSX.utils.book_new();
  const { summaryRows } = buildSeoulPanelSheetsData({ quotaDatabase });

  const ws = XLSX.utils.json_to_sheet(summaryRows);
  ws['!cols'] = autoFitColumns(summaryRows, 10, 38);
  XLSX.utils.book_append_sheet(wb, ws, '서울시소상공인패널_응답내역');

  if (filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    XLSX.writeFile(wb, filePath);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

let seoulSheetSyncQueue = Promise.resolve();

export function syncSeoulPanelAnswersToGoogleSheet(options = {}) {
  const runTask = async () => {
    return await _syncSeoulPanelAnswersToGoogleSheetImpl(options);
  };
  const nextPromise = seoulSheetSyncQueue.then(runTask, runTask);
  seoulSheetSyncQueue = nextPromise.catch(err => {
    console.warn(`[서울시 패널 구글 시트 동기화 큐 경고] ${err.message}`);
  });
  return nextPromise;
}

async function _syncSeoulPanelAnswersToGoogleSheetImpl({
  quotaDatabase = [],
  sheetUrl = SEOUL_PANEL_DEFAULT_GSHEET_URL,
  quotaJsonPath = null
} = {}) {
  if (Array.isArray(quotaDatabase) && quotaDatabase.length > 0) {
    persistSeoulPanelQuotaDatabase({ quotaDatabase, quotaJsonPath });
  }

  const { summaryRows } = buildSeoulPanelSheetsData({ quotaDatabase });
  function rowsToTsvLines(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = Object.keys(rows[0]);
    const lines = [headers.join('\t')];
    for (const r of rows) {
      lines.push(headers.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'));
    }
    return lines;
  }

  const allLines = rowsToTsvLines(summaryRows);
  const fullTsv = allLines.join('\n');
  const populatedRowCount = summaryRows.filter(
    r => r['A1_사업체명'] || r['C1_영업시간'] || r['K1_경기동향(26년실적/27년전망)']
  ).length;

  const browser = await launchChromium({ headless: true, args: ['--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(sheetUrl || SEOUL_PANEL_DEFAULT_GSHEET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });
    await page.waitForTimeout(4500);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const focusCellA1 = async () => {
      const nameBox = page.locator('#t-name-box, .waffle-name-box');
      if ((await nameBox.count()) > 0) {
        await nameBox
          .first()
          .click({ timeout: 3000 })
          .catch(err => console.warn(`이름상자 클릭 경고: ${err.message}`));
        await page.waitForTimeout(150);
        await page.keyboard.press('Control+A');
        await page.keyboard.type('A1');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(450);
      } else {
        await page.mouse.click(120, 260);
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+Home');
        await page.waitForTimeout(350);
      }
    };

    await focusCellA1();

    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(250);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(600);

    await focusCellA1();

    await page.evaluate(
      async ({ tsvText }) => {
        try {
          await navigator.clipboard.writeText(tsvText);
        } catch (clipErr) {
          console.warn('클립보드 기록 경고:', clipErr.message);
        }
        const dt = new DataTransfer();
        dt.setData('text/plain', tsvText);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        const target =
          document.querySelector('.cell-input') || document.activeElement || document.body;
        target.dispatchEvent(pasteEvent);
      },
      { tsvText: fullTsv }
    );

    await page.waitForTimeout(5500);
    await browser.close();
    return {
      success: true,
      lineCount: allLines.length,
      populatedRowCount
    };
  } catch (err) {
    await browser
      .close()
      .catch(closeErr => console.warn(`브라우저 종료 경고: ${closeErr.message}`));
    return { success: false, error: err.message };
  }
}
