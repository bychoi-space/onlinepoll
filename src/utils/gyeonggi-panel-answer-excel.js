/**
 * [메트릭스 2026년 경기도 소상공인 사업체패널 3차조사 (SNUM=622)]
 * 응답자별 전 문항 제출 내역 Excel(.xlsx) 생성 및 구글 스프레드시트('오토서베이_응답내역' 전용 시트) 동기화 유틸리티
 *
 * [원본 시트 절대 보존 안전가드]
 * - '광주시 리스트', '김정례', '노영미-7791' 등 기존 조사원 쿼터 탭은 절대 수정·삭제하지 않음.
 * - 오직 '오토서베이_응답내역' 탭을 생성/선택한 뒤 활성 탭 이름을 검증한 상태에서만 응답 내역을 기록함.
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { launchChromium } from './chromium-launcher.js';

export const GYEONGGI_PANEL_DEFAULT_GSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit?gid=1453131911#gid=1453131911';

export const GYEONGGI_PANEL_ANSWER_TAB_NAME = '오토서베이_응답내역';

const PROTECTED_SOURCE_TABS = new Set([
  '광주시 리스트',
  '김정례',
  '노영미-7791'
]);

function extractQuotaArray(quotaDatabase) {
  if (Array.isArray(quotaDatabase)) return quotaDatabase;
  if (quotaDatabase && Array.isArray(quotaDatabase.data)) return quotaDatabase.data;
  if (quotaDatabase && Array.isArray(quotaDatabase.rows)) return quotaDatabase.rows;
  if (quotaDatabase && Array.isArray(quotaDatabase.results)) return quotaDatabase.results;
  return [];
}

function getSpreadsheetEditUrl(rawUrl) {
  const fallback = 'https://docs.google.com/spreadsheets/d/1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM/edit';
  if (!rawUrl) return fallback;
  const m = String(rawUrl).match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? `https://docs.google.com/spreadsheets/d/${m[1]}/edit` : fallback;
}

export function persistGyeonggiPanelQuotaDatabase({
  quotaDatabase = [],
  quotaJsonPath = null
} = {}) {
  const rows = extractQuotaArray(quotaDatabase);
  const targetPath =
    quotaJsonPath ||
    path.resolve(process.cwd(), 'data', 'quotas', 'quota_metrix_gyeonggi_622_all.json');
  if (!fs.existsSync(targetPath) || rows.length === 0) {
    return false;
  }
  try {
    const fileObj = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    const existingRows = Array.isArray(fileObj.data)
      ? fileObj.data
      : (Array.isArray(fileObj.rows) ? fileObj.rows : []);

    const incomingByKey = new Map();
    const incomingByUid = new Map();
    rows.forEach(item => {
      if (!item || !item.uid) return;
      const surv = String(item.surveyorId || '').trim();
      if (surv) incomingByKey.set(`${surv}::${item.uid}`, item);
      incomingByUid.set(String(item.uid), item);
    });

    const mergedRows = existingRows.map((row, idx) => {
      const surv = String(row.surveyorId || '').trim();
      const inc = (surv && incomingByKey.get(`${surv}::${row.uid}`)) || incomingByUid.get(String(row.uid));
      if (!inc) return row;

      const safeQuotaStatus =
        inc.quotaStatus === 'running'
          ? (row.quotaStatus && row.quotaStatus !== 'running' ? row.quotaStatus : 'ready')
          : (inc.quotaStatus || row.quotaStatus || 'ready');

      const incAns = inc.submittedAnswers;
      const hasIncAns = Array.isArray(incAns) && incAns.length > 0;
      const rowAns = row.submittedAnswers;
      const hasRowAns = Array.isArray(rowAns) && rowAns.length > 0;

      return {
        ...row,
        ...inc,
        quotaStatus: safeQuotaStatus,
        index: row.index || inc.index || idx + 1,
        seq: row.seq || inc.seq || idx + 1,
        slotIndex: row.slotIndex || inc.slotIndex || idx + 1,
        submittedAnswers: hasIncAns ? incAns : (hasRowAns ? rowAns : [])
      };
    });

    fileObj.data = mergedRows;
    fileObj.count = mergedRows.length;
    fileObj.updatedAt = new Date().toISOString();
    fs.writeFileSync(targetPath, JSON.stringify(fileObj, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[경기도 패널 쿼터 JSON 저장 경고] ${err.message}`);
    return false;
  }
}

function formatQuestionColumnHeader(entry, usedColMap) {
  const code = String(entry?.questionCode || '').trim() || `STEP_${entry?.stepIndex || ''}`;
  let title = String(entry?.questionTitle || '').replace(/\s+/g, ' ').trim();
  if (title) {
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`^${escapedCode}[.:)\\s-]*`, 'i'), '').trim();
  }
  const shortTitle = title.slice(0, 38);
  const baseHeader = shortTitle ? `[${code}] ${shortTitle}` : `[${code}]`;

  const signatureKey = `${code}::${title}`;
  if (usedColMap.has(signatureKey)) {
    return usedColMap.get(signatureKey);
  }

  let finalHeader = baseHeader;
  const existingValues = new Set(usedColMap.values());
  if (existingValues.has(finalHeader)) {
    finalHeader = `${baseHeader} (#${entry?.stepIndex || usedColMap.size + 1})`;
  }
  usedColMap.set(signatureKey, finalHeader);
  return finalHeader;
}

export function buildGyeonggiPanelSheetsData({ quotaDatabase = [] }) {
  const rows = extractQuotaArray(quotaDatabase);

  const answeredItems = rows
    .filter(item => Array.isArray(item?.submittedAnswers) && item.submittedAnswers.length > 0)
    .sort((a, b) => Number(a.index || a.seq || 0) - Number(b.index || b.seq || 0));

  const usedColMap = new Map();
  const orderedQuestionHeaders = [];

  const isIntroGuideEntry = (entry) => {
    if (!entry) return true;
    const ans = String(entry.submittedAnswer ?? entry.answer ?? '').trim();
    const title = String(entry.questionTitle || '').trim();
    return ans === '(응답 확인됨)' && /(사업체패널\s*3차조사|조사표\s*작성요령)/.test(title);
  };

  for (const item of answeredItems) {
    for (const entry of item.submittedAnswers) {
      if (!entry || isIntroGuideEntry(entry)) continue;
      const colHeader = formatQuestionColumnHeader(entry, usedColMap);
      if (!orderedQuestionHeaders.includes(colHeader)) {
        orderedQuestionHeaders.push(colHeader);
      }
    }
  }

  const answerRows = answeredItems.map((item, idx) => {
    const ansByHeader = new Map();
    let m15Answer = '';
    let m15_3Answer = '';

    const validEntries = (item.submittedAnswers || []).filter(e => e && !isIntroGuideEntry(e));
    for (const entry of validEntries) {
      const colHeader = formatQuestionColumnHeader(entry, usedColMap);
      const val = String(entry.submittedAnswer ?? entry.answer ?? '').replace(/\s+/g, ' ').trim();
      ansByHeader.set(colHeader, val);

      const qCode = String(entry.questionCode || '').trim();
      const qTitle = String(entry.questionTitle || '');
      if (qCode === '문15' || /^문\s*15[.\s]/.test(qTitle)) {
        m15Answer = val;
      }
      if (
        qCode === '문15-3' ||
        qTitle.includes('문15-3') ||
        qTitle.includes('사업자금을 조달한 경로')
      ) {
        m15_3Answer = val;
      }
    }

    const guar = String(item.guaranteeSupport || item.rawMeta?.['보증지원여부'] || '').trim() || '-';
    if (!m15_3Answer) {
      if (m15Answer.includes('[2]') || m15Answer.includes('없다') || m15Answer.includes('없음')) {
        m15_3Answer = '(문15 부채없음 응답으로 문15-3 비해당)';
      } else {
        m15_3Answer = '-';
      }
    }

    const cleanTaxType = String(item.taxType || '').replace(/\s+/g, ' ').trim();

    const row = {
      쿼터순번: item.index || item.seq || idx + 1,
      담당조사원: item.surveyorId || '',
      원본시트: item.sheetName || '',
      UID: String(item.uid || ''),
      사업체명: item.companyName || '',
      대표자명: item.ceoName || '',
      '적용휴대폰(컨택저장)': item.phone || item.excelPhone || item.serverPhone || '',
      사업자등록번호: item.bizNumber || '',
      '휴폐업/과세유형': `${item.bizStatus || '계속사업자'}${cleanTaxType ? ` (${cleanTaxType})` : ''}`,
      '업종(적용가이드)': item.industry || '',
      엑셀_보증지원여부: guar,
      '문15-3_자금조달경로(보증연동검증)': m15_3Answer,
      진행상태: item.status || item.quotaStatus || '',
      기록문항수: validEntries.length,
      실행시각: item.pilotAt || item.completedAt || '',
      설문URL: item.surveyUrl || ''
    };

    for (const h of orderedQuestionHeaders) {
      row[h] = ansByHeader.get(h) || '';
    }

    return row;
  });

  const overviewRows = rows.map((item, idx) => ({
    순번: item.index || item.seq || idx + 1,
    담당조사원: item.surveyorId || '',
    원본시트: item.sheetName || '',
    UID: String(item.uid || ''),
    사업체명: item.companyName || '',
    대표자명: item.ceoName || '',
    시트휴대폰: item.excelPhone || '',
    서버휴대폰: item.serverPhone || '',
    사업자등록번호: item.bizNumber || '',
    휴폐업상태: item.bizStatus || '',
    과세유형: String(item.taxType || '').replace(/\s+/g, ' ').trim(),
    보증지원여부: item.guaranteeSupport || item.rawMeta?.['보증지원여부'] || '',
    업종: item.industry || '',
    진행상태: item.status || item.quotaStatus || '미참여',
    응답내역기록수: Array.isArray(item.submittedAnswers) ? item.submittedAnswers.filter(e => e && !isIntroGuideEntry(e)).length : 0,
    설문URL: item.surveyUrl || ''
  }));

  return {
    answerRows,
    overviewRows,
    populatedRowCount: answerRows.length
  };
}

function autoFitColumns(rows, minW = 11, maxW = 44) {
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

export function buildGyeonggiPanelAnswersExcel({ quotaDatabase = [], filePath = null }) {
  const wb = XLSX.utils.book_new();
  const { answerRows, overviewRows } = buildGyeonggiPanelSheetsData({ quotaDatabase });

  const safeAnswerRows = answerRows.length > 0
    ? answerRows
    : [{ 안내: '아직 실행된 파일럿/배치 응답 내역이 없습니다.' }];

  const wsAns = XLSX.utils.json_to_sheet(safeAnswerRows);
  wsAns['!cols'] = autoFitColumns(safeAnswerRows, 12, 46);
  XLSX.utils.book_append_sheet(wb, wsAns, GYEONGGI_PANEL_ANSWER_TAB_NAME);

  if (overviewRows.length > 0) {
    const wsAll = XLSX.utils.json_to_sheet(overviewRows);
    wsAll['!cols'] = autoFitColumns(overviewRows, 10, 36);
    XLSX.utils.book_append_sheet(wb, wsAll, '전체쿼터현황_171건');
  }

  if (filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    XLSX.writeFile(wb, filePath);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

let gyeonggiSheetSyncQueue = Promise.resolve();

export function syncGyeonggiPanelAnswersToGoogleSheet(options = {}) {
  const runTask = async () => {
    return await _syncGyeonggiPanelAnswersToGoogleSheetImpl(options);
  };
  const nextPromise = gyeonggiSheetSyncQueue.then(runTask, runTask);
  gyeonggiSheetSyncQueue = nextPromise.catch(err => {
    console.warn(`[경기도 패널 구글 시트 동기화 큐 경고] ${err.message}`);
  });
  return nextPromise;
}

async function _syncGyeonggiPanelAnswersToGoogleSheetImpl({
  quotaDatabase = [],
  sheetUrl = GYEONGGI_PANEL_DEFAULT_GSHEET_URL,
  quotaJsonPath = null,
  tabName = GYEONGGI_PANEL_ANSWER_TAB_NAME
} = {}) {
  if (PROTECTED_SOURCE_TABS.has(tabName)) {
    throw new Error(`보호된 원본 시트("${tabName}")에는 응답 내역을 덮어쓸 수 없습니다.`);
  }

  const rows = extractQuotaArray(quotaDatabase);
  if (rows.length > 0) {
    persistGyeonggiPanelQuotaDatabase({ quotaDatabase: rows, quotaJsonPath });
  }

  const { answerRows, populatedRowCount } = buildGyeonggiPanelSheetsData({ quotaDatabase: rows });
  if (answerRows.length === 0) {
    return {
      success: true,
      skipped: true,
      reason: 'NO_ANSWERED_ROWS',
      populatedRowCount: 0
    };
  }

  function rowsToTsvLines(list) {
    if (!list || list.length === 0) return [];
    const headers = Object.keys(list[0]);
    const lines = [headers.join('\t')];
    for (const r of list) {
      lines.push(headers.map(h => String(r[h] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'));
    }
    return lines;
  }

  const allLines = rowsToTsvLines(answerRows);
  const fullTsv = allLines.join('\n');
  const editUrl = getSpreadsheetEditUrl(sheetUrl);

  const browser = await launchChromium({ headless: true, args: ['--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(editUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });
    await page.waitForSelector('.docs-sheet-tab', { timeout: 25000 });
    await page.waitForTimeout(3500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const readTabsState = async () => {
      return await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.docs-sheet-tab')).map((el, idx) => {
          const nameEl = el.querySelector('.docs-sheet-tab-name');
          const name = (nameEl ? nameEl.textContent : el.textContent || '').trim();
          const isActive = el.classList.contains('docs-sheet-active-tab');
          return { idx, name, isActive };
        });
        const active = tabs.find(t => t.isActive) || null;
        return { tabs, activeName: active ? active.name : '' };
      });
    };

    let tabState = await readTabsState();
    const existingTargetTab = tabState.tabs.find(t => t.name === tabName);

    if (existingTargetTab) {
      if (!existingTargetTab.isActive) {
        const tabLocator = page.locator('.docs-sheet-tab').filter({ hasText: tabName }).first();
        await tabLocator.click({ timeout: 5000 });
        await page.waitForTimeout(1800);
      }
    } else {
      // 새 시트 추가 버튼 클릭
      const addBtn = page.locator('.docs-sheet-add-button, [aria-label="Add Sheet"], [aria-label="시트 추가"]').first();
      await addBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2500);

      tabState = await readTabsState();
      if (!tabState.activeName || PROTECTED_SOURCE_TABS.has(tabState.activeName)) {
        throw new Error(`새 시트 생성 후 활성 시트가 안전하지 않습니다 (현재 활성 탭: "${tabState.activeName}")`);
      }

      // 새로 생성된 탭 이름을 '오토서베이_응답내역'으로 변경 (1차: 탭 이름 더블클릭)
      const activeNameLoc = page.locator('.docs-sheet-active-tab .docs-sheet-tab-name').first();
      await activeNameLoc.dblclick({ timeout: 4000 }).catch(err => {
        console.warn(`[시트 탭 더블클릭 경고]: ${err.message}`);
      });
      await page.waitForTimeout(450);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(tabName, { delay: 35 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1400);

      tabState = await readTabsState();
      if (tabState.activeName !== tabName) {
        // 2차 폴백: 활성 탭 드롭다운 메뉴 -> 이름 바꾸기(Rename)
        const dropLoc = page.locator('.docs-sheet-active-tab .docs-sheet-tab-dropdown').first();
        if ((await dropLoc.count()) > 0) {
          await dropLoc.click({ timeout: 3000 });
          await page.waitForTimeout(500);
          const renameItem = page.locator('.goog-menuitem').filter({ hasText: /Rename|이름 바꾸기/i }).first();
          if ((await renameItem.count()) > 0) {
            await renameItem.click({ timeout: 3000 });
            await page.waitForTimeout(450);
            await page.keyboard.press('Control+A');
            await page.keyboard.type(tabName, { delay: 35 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1400);
          }
        }
      }
    }

    // [절대 안전가드] 붙여넣기 전 현재 활성 시트가 원본 시트가 아니며 정확히 목표 탭인지 검증
    const verifiedState = await readTabsState();
    if (!verifiedState.activeName || PROTECTED_SOURCE_TABS.has(verifiedState.activeName)) {
      throw new Error(`원본 쿼터 시트 보호를 위해 작업을 중단했습니다 (활성 탭: "${verifiedState.activeName}")`);
    }
    if (verifiedState.activeName !== tabName) {
      throw new Error(`목표 시트("${tabName}") 활성화 확인 실패 (현재 활성 탭: "${verifiedState.activeName}")`);
    }

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

    await page.waitForTimeout(6000);
    const finalUrl = page.url();
    const gidMatch = finalUrl.match(/gid=(\d+)/);
    const tabGid = gidMatch ? gidMatch[1] : null;

    await browser.close();
    return {
      success: true,
      tabName: verifiedState.activeName,
      tabGid,
      sheetUrl: tabGid ? `${editUrl}#gid=${tabGid}` : editUrl,
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
