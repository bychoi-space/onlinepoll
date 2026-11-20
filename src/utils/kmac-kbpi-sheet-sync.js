/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사 - 5911000005645]
 * 로컬 JSON/Excel(.xlsx) 영속화 및 구글 스프레드시트(2번 탭: 5911000005645) 양방향 자동 동기화 모듈
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { launchChromium } from './chromium-launcher.js';
import { writeJsonAtomicSync } from './atomic-file.js';

export const KBPI_DEFAULT_SHEET_ID = '16XEpH7ru9A3eBpEHQqYm3cd3sMUWNBxqD-1tXoCR8Hg';
export const KBPI_DEFAULT_SHEET_URL =
  `https://docs.google.com/spreadsheets/d/${KBPI_DEFAULT_SHEET_ID}/edit`;
export const KBPI_DEFAULT_TAB_NAME = '5911000005645';
export const KBPI_DEFAULT_LOGIN_ID = '5911000005645';
export const KBPI_QUOTA_JSON_FILENAME = 'quota_kmac_kbpi_5911000005645.json';
export const KBPI_QUOTA_XLSX_FILENAME = 'quota_kmac_kbpi_5911000005645.xlsx';

export const KBPI_GPS_BASES = {
  seoul: { lat: 37.654192, lng: 127.056794, label: '서울 노원구청' },
  incheon: { lat: 37.456256, lng: 126.705206, label: '인천광역시청' }
};

/**
 * 지역('서울' | '인천') 및 응답자 고유 시드 기반 반경 약 50~80m 미세 분산 GPS 산출
 */
export function computeKbpiGps(region = '서울', finalId = '1', seq = 1) {
  const isIncheon = String(region || '').includes('인천');
  const base = isIncheon ? KBPI_GPS_BASES.incheon : KBPI_GPS_BASES.seoul;
  const seed = (parseInt(String(finalId).replace(/\D/g, ''), 10) || 1) * 97 + (Number(seq) || 1) * 31;
  const dLat = (((seed * 73) % 201) - 100) * 0.0000058;
  const dLng = (((seed * 137) % 201) - 100) * 0.0000068;
  return {
    baseLabel: base.label,
    latitude: Number((base.lat + dLat).toFixed(6)),
    longitude: Number((base.lng + dLng).toFixed(6))
  };
}

export function normalizeCategoryConfigs(rawConfigs = [], maxSlots = 8) {
  const normalized = [];
  const count = Math.max(maxSlots, Array.isArray(rawConfigs) ? rawConfigs.length : 0);
  for (let i = 0; i < count; i++) {
    const src = (Array.isArray(rawConfigs) && rawConfigs[i]) ? rawConfigs[i] : {};
    const expRaw = String(src.purchaseExp || '').trim();
    let purchaseExp = '';
    if (expRaw === '없음' || expRaw.toLowerCase() === 'none' || expRaw === 'X' || expRaw === '아니오') {
      purchaseExp = '없음';
    } else if (expRaw === '있음' || expRaw.toLowerCase() === 'yes' || expRaw === 'O' || expRaw === '예') {
      purchaseExp = '있음';
    }
    normalized.push({
      slot: i + 1,
      categoryName: String(src.categoryName || src.brandCategory || '').trim(),
      purchaseExp,
      topBrand: String(src.topBrand || '').trim(),
      channel: String(src.channel || '').trim()
    });
  }
  return normalized;
}

export function persistKbpiQuotaDatabase({
  quotaDatabase = [],
  quotasDir = null,
  jsonPath = null
} = {}) {
  const list = Array.isArray(quotaDatabase) ? quotaDatabase : [];
  if (list.length === 0) return null;

  const resolvedJsonPath = jsonPath || (quotasDir ? path.join(quotasDir, KBPI_QUOTA_JSON_FILENAME) : null);
  if (!resolvedJsonPath) return null;
  const resolvedXlsxPath = resolvedJsonPath.replace(/\.json$/i, '.xlsx');

  let maxSlotCount = 8;
  for (const item of list) {
    if (Array.isArray(item.categoryConfigs) && item.categoryConfigs.length > maxSlotCount) {
      maxSlotCount = item.categoryConfigs.length;
    }
  }

  const payload = {
    surveyType: 'kmac_kbpi',
    projectId: '230',
    title: '2027년 한국산업의브랜드파워(K-BPI) 조사 - 5911000005645 (150명)',
    loginId: KBPI_DEFAULT_LOGIN_ID,
    googleSheetId: KBPI_DEFAULT_SHEET_ID,
    sheetTabName: KBPI_DEFAULT_TAB_NAME,
    totalCount: list.length,
    updatedAt: new Date().toISOString(),
    data: list,
    items: list
  };

  writeJsonAtomicSync(resolvedJsonPath, payload);

  const excelRows = list.map((it, idx) => {
    const configs = normalizeCategoryConfigs(it.categoryConfigs, maxSlotCount);
    const row = {
      순번: Number(it.seq || it.index || idx + 1),
      지역: it.region || '',
      성별: it.gender || it.ceoGender || '',
      연령대: it.ageGroup || '',
      이름: it.name || it.ceoName || '',
      나이: Number(it.age || it.ceoAge || 0),
      전화번호: it.phone || '',
      진행상태: it.status || '대기',
      최종id: Number(it.finalId || 0),
      고유번호: it.uid || ''
    };
    for (let s = 0; s < maxSlotCount; s++) {
      row[`브랜드${s + 1}`] = configs[s]?.categoryName || '';
      row[`구입경험${s + 1}`] = configs[s]?.purchaseExp || '';
    }
    row.GPS기준 = it.gpsLabel || '';
    row.위도 = it.latitude || '';
    row.경도 = it.longitude || '';
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, KBPI_DEFAULT_TAB_NAME);
  const dir = path.dirname(resolvedXlsxPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvedXlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  return { jsonPath: resolvedJsonPath, xlsxPath: resolvedXlsxPath };
}

/**
 * 구글 스프레드시트 공개 XLSX 익스포트를 통해 최신 [브랜드N | 구입경험N] 설정을 실시간으로 읽어와 병합
 */
export async function pullKbpiSheetOverrides({
  quotaDatabase = [],
  sheetId = KBPI_DEFAULT_SHEET_ID,
  tabName = KBPI_DEFAULT_TAB_NAME,
  quotasDir = null
} = {}) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`;
  const res = await fetch(exportUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`구글 스프레드시트 다운로드 실패 (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[tabName] || wb.Sheets[wb.SheetNames[1]] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    throw new Error(`구글 시트에서 '${tabName}' 탭을 찾을 수 없습니다.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // 헤더 행 탐색 ('순번' 및 '고유번호' 포함 행)
  let headerRowIdx = 3;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const rowStr = (rawRows[r] || []).join('|');
    if (rowStr.includes('순번') && rowStr.includes('고유번호')) {
      headerRowIdx = r;
      break;
    }
  }

  const headerCells = rawRows[headerRowIdx] || [];
  // 브랜드N / 구입경험N 컬럼 인덱스 매핑
  const slotCols = [];
  for (let c = 10; c < headerCells.length; c++) {
    const h = String(headerCells[c] || '').trim();
    const bMatch = h.match(/^브랜드\s*(\d+)$/);
    if (bMatch) {
      const slotNum = Number(bMatch[1]);
      const nextHeader = String(headerCells[c + 1] || '').trim();
      const hasExpCol = nextHeader.startsWith('구입경험');
      slotCols.push({
        slot: slotNum,
        brandCol: c,
        expCol: hasExpCol ? c + 1 : -1
      });
    }
  }

  const existingByUid = new Map(
    (quotaDatabase || []).map(q => [String(q.uid || '').trim(), q])
  );

  let updatedCount = 0;
  const mergedList = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !row[0]) continue;
    const seq = Number(row[0]);
    if (!seq || isNaN(seq)) continue;

    const region = String(row[1] || '').trim();
    const gender = String(row[2] || '').trim();
    const ageGroup = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    const age = Number(row[5]);
    const phone = String(row[6] || '').trim();
    const sheetStatus = String(row[7] || '').trim();
    const finalId = String(Math.trunc(Number(row[8] || 0)));
    const uid = String(row[9] || '').trim();

    const prev = existingByUid.get(uid) || {};
    const gps = (prev.latitude && prev.longitude)
      ? { baseLabel: prev.gpsLabel || (region.includes('인천') ? '인천광역시청' : '서울 노원구청'), latitude: prev.latitude, longitude: prev.longitude }
      : computeKbpiGps(region, finalId, seq);

    const maxSlot = Math.max(8, slotCols.length, Array.isArray(prev.categoryConfigs) ? prev.categoryConfigs.length : 0);
    const prevConfigs = normalizeCategoryConfigs(prev.categoryConfigs || [], maxSlot);

    for (const sc of slotCols) {
      const idx = sc.slot - 1;
      const sheetBrand = String(row[sc.brandCol] || '').trim();
      const sheetExpRaw = sc.expCol >= 0 ? String(row[sc.expCol] || '').trim() : '';
      let normExp = '';
      if (sheetExpRaw === '없음' || sheetExpRaw === '아니오' || sheetExpRaw.toUpperCase() === 'X') normExp = '없음';
      else if (sheetExpRaw === '있음' || sheetExpRaw === '예' || sheetExpRaw.toUpperCase() === 'O') normExp = '있음';

      if (sheetBrand && prevConfigs[idx].categoryName !== sheetBrand) {
        prevConfigs[idx].categoryName = sheetBrand;
        updatedCount++;
      }
      if (normExp !== prevConfigs[idx].purchaseExp && (normExp || sheetExpRaw === '')) {
        if (normExp) {
          prevConfigs[idx].purchaseExp = normExp;
          updatedCount++;
        }
      }
    }

    const preserveCompleted = prev.quotaStatus === 'completed' || prev.quotaStatus === 'pilot_done';
    const nextStatus = preserveCompleted ? prev.status : (sheetStatus || prev.status || '대기');
    const nextQuotaStatus = preserveCompleted
      ? prev.quotaStatus
      : (sheetStatus === '완료' ? 'completed' : (prev.quotaStatus || 'ready'));

    mergedList.push({
      ...prev,
      index: seq,
      seq,
      region,
      gender,
      ageGroup,
      name,
      ceoName: name,
      companyName: `${name} (${region}·${gender}·${ageGroup})`,
      age,
      ceoAge: age,
      ceoGender: gender,
      phone,
      phoneType: phone.startsWith('010') ? 'mobile' : 'landline',
      finalId,
      uid,
      gpsLabel: gps.baseLabel,
      latitude: gps.latitude,
      longitude: gps.longitude,
      categoryConfigs: prevConfigs,
      status: nextStatus,
      quotaStatus: nextQuotaStatus,
      progress: nextQuotaStatus === 'completed' ? '100%' : (prev.progress || '0%')
    });
  }

  if (quotasDir && mergedList.length > 0) {
    persistKbpiQuotaDatabase({ quotaDatabase: mergedList, quotasDir });
  }

  return {
    success: true,
    totalCount: mergedList.length,
    updatedCount,
    quotaDatabase: mergedList
  };
}

let kbpiSheetWriteQueue = Promise.resolve();

/**
 * 실행 결과(H열 진행상태 및 K4~ 브랜드N / 구입경험N)를 구글 스프레드시트 2번 탭에 직렬 안전 기입
 */
export function syncKbpiProgressToGoogleSheet(options = {}) {
  const runTask = async () => _syncKbpiProgressToGoogleSheetImpl(options);
  const nextPromise = kbpiSheetWriteQueue.then(runTask, runTask);
  kbpiSheetWriteQueue = nextPromise.catch(err => {
    console.warn(`[K-BPI 구글시트 동기화 큐 경고] ${err.message}`);
  });
  return nextPromise;
}

async function _syncKbpiProgressToGoogleSheetImpl({
  quotaDatabase = [],
  sheetUrl = KBPI_DEFAULT_SHEET_URL,
  tabName = KBPI_DEFAULT_TAB_NAME,
  quotasDir = null
} = {}) {
  if (!Array.isArray(quotaDatabase) || quotaDatabase.length === 0) {
    return { success: false, error: '동기화할 쿼터 데이터가 없습니다.' };
  }

  if (quotasDir) {
    persistKbpiQuotaDatabase({ quotaDatabase, quotasDir });
  }

  const sorted = [...quotaDatabase].sort((a, b) => Number(a.seq || a.index || 0) - Number(b.seq || b.index || 0));
  let maxSlots = 8;
  for (const item of sorted) {
    if (Array.isArray(item.categoryConfigs) && item.categoryConfigs.length > maxSlots) {
      maxSlots = item.categoryConfigs.length;
    }
  }

  // H5:H154 (진행상태 열만 업데이트)
  const statusTsv = sorted
    .map(it => String(it.status || '대기').replace(/[\t\r\n]+/g, ' '))
    .join('\n');

  // K4:... (헤더 + 150행 브랜드N / 구입경험N 쌍 업데이트)
  const pairHeaders = [];
  for (let s = 1; s <= maxSlots; s++) {
    pairHeaders.push(`브랜드${s}`, `구입경험${s}`);
  }
  const pairLines = [pairHeaders.join('\t')];
  for (const it of sorted) {
    const cfgs = normalizeCategoryConfigs(it.categoryConfigs, maxSlots);
    const cells = [];
    for (let s = 0; s < maxSlots; s++) {
      cells.push(
        String(cfgs[s]?.categoryName || '').replace(/[\t\r\n]+/g, ' '),
        String(cfgs[s]?.purchaseExp || '').replace(/[\t\r\n]+/g, ' ')
      );
    }
    pairLines.push(cells.join('\t'));
  }
  const pairTsv = pairLines.join('\n');

  let browser;
  try {
    const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors'],
      ...(proxyServer ? { proxy: { server: proxyServer } } : {})
    });
    const context = await browser.newContext({
      viewport: { width: 1500, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(sheetUrl || KBPI_DEFAULT_SHEET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 40000
    });
    await page.waitForTimeout(4500);

    const tabLocator = page.locator('.docs-sheet-tab-name', { hasText: tabName });
    if ((await tabLocator.count()) > 0) {
      await tabLocator.first().click();
      await page.waitForTimeout(2000);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const pasteAtCell = async (cellRef, textToPaste) => {
      const nameBox = page.locator('#t-name-box, .waffle-name-box').first();
      await nameBox.click({ timeout: 4000 });
      await page.waitForTimeout(150);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(cellRef);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);

      await page.evaluate(
        async ({ text }) => {
          try {
            await navigator.clipboard.writeText(text);
          } catch (clipErr) {
            console.warn('클립보드 복사 경고:', clipErr.message);
          }
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const pasteEvt = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
          });
          const target = document.querySelector('.cell-input') || document.activeElement || document.body;
          target.dispatchEvent(pasteEvt);
        },
        { text: textToPaste }
      );
      await page.waitForTimeout(2500);
    };

    await pasteAtCell('H5', statusTsv);
    await pasteAtCell('K4', pairTsv);
    await page.waitForTimeout(3000);

    return {
      success: true,
      syncedRows: sorted.length,
      maxSlots
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close().catch(err => console.warn('[K-BPI Sheet Sync Browser Close 경고]', err.message));
    }
  }
}
