/**
 * [2025년 기준 산림·정원산업조사 (relim.svybx.kr / S21629axjxr5)]
 * - 컨택시스템(mlist.asp / reportview.asp) 실시간 상태·전국 KSIC 할당률 스크래퍼
 * - 로컬 JSON/Excel(quota_relim_forestry_2009.json/.xlsx) 영속화
 * - 구글 스프레드시트('선정명단' 탭, gid=2054505699) 확장 열(J열~AM열) 자동 동기화 모듈
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { launchChromium } from '../utils/chromium-launcher.js';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';
import { logger } from '../utils/logger.js';

export const RELIM_FORESTRY_PID = 'S21629axjxr5';
export const RELIM_FORESTRY_MLIST_URL = `https://relim.svybx.kr/sp7/${RELIM_FORESTRY_PID}/mlist.asp`;
export const RELIM_FORESTRY_REPORT_URL = `https://relim.svybx.kr/sp7/${RELIM_FORESTRY_PID}/reportview.asp`;
export const RELIM_FORESTRY_SHEET_ID = '12JbrVKTAEyAmEzPOp9W7HvdLa2ghN6cES3wFbikIa4g';
export const RELIM_FORESTRY_SHEET_URL =
  `https://docs.google.com/spreadsheets/d/${RELIM_FORESTRY_SHEET_ID}/edit?gid=2054505699#gid=2054505699`;
export const RELIM_FORESTRY_QUOTA_JSON = 'quota_relim_forestry_2009.json';
export const RELIM_FORESTRY_QUOTA_XLSX = 'quota_relim_forestry_2009.xlsx';

function stripHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatKoreanPhone(raw = '') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (!d.startsWith('0') && (d.length === 8 || d.length === 9 || d.length === 10)) {
    d = `0${d}`;
  }
  if (d.startsWith('02')) {
    return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return d;
}

/**
 * 선정(197건) 중 휴·폐업/결번 제외 건이 발생한 [KSIC × 지역] 셀에 대해
 * 동일 셀의 정상 예비(145건) 업체를 순번대로 자동 대체 매핑
 */
export function applyRelimReserveSubstitution(items = []) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const byCellExcluded = new Map();
  for (const it of items) {
    it.isSubstituteActive = false;
    it.substituteForResid = '';
    it.substitutedByResid = '';
    if (it.selectionType === '선정' && it.isClosedBiz) {
      const cellKey = `${it.ksicCode}::${it.region}`;
      if (!byCellExcluded.has(cellKey)) byCellExcluded.set(cellKey, []);
      byCellExcluded.get(cellKey).push(it);
    }
  }

  for (const [cellKey, excludedList] of byCellExcluded.entries()) {
    const [ksic, region] = cellKey.split('::');
    const healthyReserves = items
      .filter(it => it.selectionType === '예비' && it.ksicCode === ksic && it.region === region && !it.isClosedBiz)
      .sort((a, b) => Number(a.cellSeq || 0) - Number(b.cellSeq || 0));

    for (let i = 0; i < Math.min(excludedList.length, healthyReserves.length); i++) {
      const closedTarget = excludedList[i];
      const subItem = healthyReserves[i];
      closedTarget.substitutedByResid = String(subItem.resid);
      subItem.isSubstituteActive = true;
      subItem.substituteForResid = String(closedTarget.resid);
    }
  }

  for (const it of items) {
    if (it.isClosedBiz) {
      it.effectiveRole = '제외(휴폐업/결번)';
    } else if (it.selectionType === '선정') {
      it.effectiveRole = '선정(유효)';
    } else if (it.isSubstituteActive) {
      it.effectiveRole = '예비(선정대체)';
    } else {
      it.effectiveRole = '예비(대기)';
    }
  }

  return items;
}

/**
 * 로컬 JSON 및 Excel(.xlsx) 저장
 */
export function persistRelimForestryQuota({ quotaDatabase = [], quotasDir, accountKey = '2009', surveyorName = '지연옥' }) {
  if (!quotasDir) return null;
  fs.mkdirSync(quotasDir, { recursive: true });
  const normalized = applyRelimReserveSubstitution([...quotaDatabase]);

  const jsonPath = path.join(quotasDir, RELIM_FORESTRY_QUOTA_JSON);
  const payload = {
    campaignId: `camp_relim_forestry_${accountKey}`,
    projectCode: RELIM_FORESTRY_PID,
    surveyType: 'relim_forestry',
    type: 'RELIM_FORESTRY_2025',
    title: `2025년 기준 산림·정원산업조사 - ${accountKey} ${surveyorName} (선정 197건 · 예비 145건)`,
    surveyUrl: RELIM_FORESTRY_MLIST_URL,
    googleSheetUrl: RELIM_FORESTRY_SHEET_URL,
    accountKey,
    surveyorName,
    updatedAt: new Date().toISOString(),
    totalCount: normalized.length,
    selectedCount: normalized.filter(x => x.selectionType === '선정').length,
    reserveCount: normalized.filter(x => x.selectionType === '예비').length,
    effectiveTargetCount: normalized.filter(x => x.effectiveRole === '선정(유효)' || x.effectiveRole === '예비(선정대체)').length,
    data: normalized
  };
  writeJsonAtomicSync(jsonPath, payload);

  const excelRows = normalized.map(it => {
    const memoParts = [];
    if (it.isClosedBiz) {
      memoParts.push(`${it.bizStatus || '제외'}${it.substitutedByResid ? `→예비(${it.substitutedByResid})대체` : ''}`);
    } else if (it.isSubstituteActive) {
      memoParts.push(`선정(${it.substituteForResid})대체투입`);
    }
    if (it.financialSource === '사람인(NICE공시)') memoParts.push('NICE재무실측');
    else if (it.financialSource === '마켓비즈(재무실측)') memoParts.push('마켓비즈재무실측');
    else if (it.financialSource === '마켓비즈(고용·기초실측)') memoParts.push('마켓비즈고용실측');

    return {
      '구분': it.selectionType,
      'KSIC 코드': it.ksicCode,
      'KSIC 명': it.ksicName,
      '지역': it.region,
      '셀내 순번': Number(it.cellSeq || 1),
      'resid': Number(it.resid),
      '사업체명': it.sheetCompanyName || it.companyName,
      '종사자 규모층': Number(it.stratum || 1),
      '조사원': it.surveyorName || surveyorName,
      '컨택결과': it.status || '대기',
      '메모': memoParts.join(' · '),
      '실행구분': it.effectiveRole || '',
      '대표자명': it.ceoName || '',
      '대표자성별': it.ceoGender || '',
      '추정연령대': it.ceoAgeDecade || '',
      '65세이상': it.is65PlusLabel || '',
      '사업자등록번호': it.bizNo || '',
      '휴폐업상태': it.bizStatus || '',
      '조직형태': it.orgTypeLabel || '',
      '법인등록번호': it.corpRegNo || '',
      '창업연도': Number(it.openYear || 2012),
      '전화번호': formatKoreanPhone(it.phone),
      '홈페이지여부': it.hasHomepage || '없음',
      '홈페이지주소': it.homepageUrl || '',
      '업태': it.bizCategory || '',
      '종목': it.bizItem || '',
      '특수분류코드': it.subCode1 || '',
      '특수분류명': it.subName1 || '',
      '산림매출비중(%)': Number(it.forestryRatioPct ?? 100),
      '2025전체매출(백만원)': Number(it.sales2025M || 0),
      '2025산림매출(백만원)': Number(it.forestrySales2025M || 0),
      '2024전체매출(백만원)': Number(it.sales2024M || 0),
      '매출변동(Q17_A1)': it.q17A1Label || '',
      '변동사유(Q17_A2)': it.q17A2Text || '',
      '전체종사자(명)': Number(it.totalWorkers || 1),
      '산림종사자(명)': Number(it.forestryWorkers || 1),
      '자격증보유(Q21)': Number(it.q21CertCount || 0),
      '전망사유(Q35_1)': it.q35_1Text || '',
      '경영애로1사유(Q36_1a_1)': it.q36_1a_1Text || '',
      '경영애로2사유(Q36_1a_2)': it.q36_1a_2Text || ''
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, '선정명단');
  const xlsxPath = path.join(quotasDir, RELIM_FORESTRY_QUOTA_XLSX);
  fs.writeFileSync(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  return { jsonPath, xlsxPath, items: normalized };
}

/**
 * 컨택시스템(mlist.asp / reportview.asp) 실시간 Web 상태 및 전국 KSIC 할당 마감 여부 조회
 */
export async function fetchRelimLiveStatus({ accountKey = '2009' } = {}) {
  const browser = await launchChromium({ headless: true, args: ['--ignore-certificate-errors', '--disable-gpu'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(RELIM_FORESTRY_MLIST_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if ((await page.locator('#akey').count()) > 0) {
      await page.fill('#akey', String(accountKey));
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.evaluate(() => {
          if (typeof window.frmFormChk === 'function') window.frmFormChk();
          else document.frm.submit();
        })
      ]);
    }
    await page.waitForTimeout(800);

    // 1) reportview.asp 전국 KSIC 할당 현황 파싱
    const ksicQuotaMap = await page.evaluate(async ({ reportUrl }) => {
      const res = await fetch(reportUrl, { credentials: 'include' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const out = {};
      doc.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td, th')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
        if (cells.length === 8 && /^\d{4,5}$/.test(cells[0])) {
          const ksic = cells[0].padStart(5, '0');
          const totalQuota = parseInt(cells[5].replace(/,/g, ''), 10) || 0;
          const completed = parseInt(cells[6].replace(/,/g, ''), 10) || 0;
          const pct = parseFloat(cells[7].replace(/,/g, '')) || 0;
          out[ksic] = {
            ksic,
            name: cells[1],
            totalQuota,
            completed,
            pct,
            isFull: totalQuota > 0 && completed >= totalQuota
          };
        }
      });
      return out;
    }, { reportUrl: RELIM_FORESTRY_REPORT_URL });

    // 2) mlist.asp에서 완료(ws_c) 및 진행중(ws_ing) 리스트 빠른 조회
    const webStatusByResid = await page.evaluate(async ({ mlistUrl }) => {
      const map = {};
      for (const flt of ['ws_c', 'ws_ing']) {
        for (let p = 1; p <= 20; p++) {
          const res = await fetch(`${mlistUrl}?listfilter=${flt}&page=${p}`, { credentials: 'include' });
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const rows = [...doc.querySelectorAll("tr[id^='tr_']")];
          if (rows.length === 0) break;
          for (const tr of rows) {
            const tds = [...tr.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
            const resid = tds[0];
            if (resid && /^\d+$/.test(resid)) {
              map[resid] = {
                contactResult: tds[8] || '-',
                webStatus: flt === 'ws_c' ? 'Complete' : (tds[10] || 'Drop')
              };
            }
          }
          if (rows.length < 20) break;
        }
      }
      return map;
    }, { mlistUrl: RELIM_FORESTRY_MLIST_URL });

    return { success: true, ksicQuotaMap, webStatusByResid };
  } catch (err) {
    logger.warn(`[RelimForestryScraper] 실시간 현황 조회 경고: ${err.message}`);
    return { success: false, error: err.message, ksicQuotaMap: {}, webStatusByResid: {} };
  } finally {
    await browser.close().catch(e => logger.warn(`[RelimForestryScraper] 브라우저 종료 경고: ${e.message}`));
  }
}

/**
 * 구글 스프레드시트('선정명단' 탭, J1~AN343)에 수집·정합화된 기업 기초데이터 및 진행상태 기록
 */
export async function syncRelimForestryToGoogleSheet({
  quotaDatabase = [],
  sheetUrl = RELIM_FORESTRY_SHEET_URL,
  tabName = '선정명단',
  quotasDir = null
}) {
  if (!Array.isArray(quotaDatabase) || quotaDatabase.length === 0) {
    return { success: false, error: '동기화할 산림산업조사 쿼터 데이터가 없습니다.' };
  }

  const normalized = applyRelimReserveSubstitution([...quotaDatabase])
    .sort((a, b) => Number(a.sheetRowNum || a.seq || 0) - Number(b.sheetRowNum || b.seq || 0));

  if (quotasDir) {
    persistRelimForestryQuota({ quotaDatabase: normalized, quotasDir });
  }

  const sanitizeCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

  // J1부터 오른쪽 확장 열 헤더 및 데이터 구성 (원본 A~I열은 건드리지 않고 100% 보존!)
  const headersFromJ = [
    '컨택결과',
    '메모',
    '실행구분',
    '대표자명',
    '대표자성별',
    '추정연령대',
    '65세이상',
    '사업자등록번호',
    '휴폐업상태',
    '조직형태',
    '법인등록번호',
    '창업연도',
    '전화번호',
    '홈페이지여부',
    '홈페이지주소',
    '업태',
    '종목',
    '특수분류코드',
    '특수분류명',
    '산림매출비중(%)',
    '2025전체매출(백만원)',
    '2025산림매출(백만원)',
    '2024전체매출(백만원)',
    '매출변동(Q17_A1)',
    '변동사유(Q17_A2)',
    '전체종사자(명)',
    '산림종사자(명)',
    '자격증보유(Q21)',
    '전망사유(Q35_1)',
    '경영애로1사유(Q36_1a_1)',
    '경영애로2사유(Q36_1a_2)'
  ];

  const tsvLines = [headersFromJ.join('\t')];
  for (const it of normalized) {
    const memoParts = [];
    if (it.isClosedBiz) {
      memoParts.push(`${it.bizStatus || '제외'}${it.substitutedByResid ? `→예비(${it.substitutedByResid})대체` : ''}`);
    } else if (it.isSubstituteActive) {
      memoParts.push(`선정(${it.substituteForResid})대체투입`);
    }
    if (it.financialSource === '사람인(NICE공시)') memoParts.push('NICE재무실측');
    else if (it.financialSource === '마켓비즈(재무실측)') memoParts.push('마켓비즈재무실측');
    else if (it.financialSource === '마켓비즈(고용·기초실측)') memoParts.push('마켓비즈고용실측');

    const rowCells = [
      sanitizeCell(it.status || '대기'),
      sanitizeCell(memoParts.join(' · ')),
      sanitizeCell(it.effectiveRole || ''),
      sanitizeCell(it.ceoName),
      sanitizeCell(it.ceoGender),
      sanitizeCell(it.ceoAgeDecade),
      sanitizeCell(it.is65PlusLabel),
      sanitizeCell(it.bizNo),
      sanitizeCell(it.bizStatus),
      sanitizeCell(it.orgTypeLabel),
      sanitizeCell(it.corpRegNo),
      sanitizeCell(it.openYear),
      sanitizeCell(formatKoreanPhone(it.phone)),
      sanitizeCell(it.hasHomepage),
      sanitizeCell(it.homepageUrl),
      sanitizeCell(it.bizCategory),
      sanitizeCell(it.bizItem),
      sanitizeCell(it.subCode1),
      sanitizeCell(it.subName1),
      sanitizeCell(it.forestryRatioPct),
      sanitizeCell(it.sales2025M),
      sanitizeCell(it.forestrySales2025M),
      sanitizeCell(it.sales2024M),
      sanitizeCell(it.q17A1Label),
      sanitizeCell(it.q17A2Text),
      sanitizeCell(it.totalWorkers),
      sanitizeCell(it.forestryWorkers),
      sanitizeCell(it.q21CertCount),
      sanitizeCell(it.q35_1Text),
      sanitizeCell(it.q36_1a_1Text),
      sanitizeCell(it.q36_1a_2Text)
    ];
    tsvLines.push(rowCells.join('\t'));
  }
  const j1Tsv = tsvLines.join('\n');

  let browser;
  try {
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors', '--disable-gpu']
    });
    const context = await browser.newContext({
      viewport: { width: 1500, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4500);

    const tabLocator = page.locator('.docs-sheet-tab-name', { hasText: tabName });
    if ((await tabLocator.count()) > 0) {
      await tabLocator.first().click();
      await page.waitForTimeout(1800);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const nameBox = page.locator('#t-name-box, .waffle-name-box').first();
    await nameBox.click({ timeout: 5000 });
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('J1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.evaluate(async ({ text }) => {
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
    }, { text: j1Tsv });

    await page.waitForTimeout(4500);

    return {
      success: true,
      syncedRows: normalized.length,
      columnsWritten: headersFromJ.length
    };
  } catch (err) {
    logger.warn(`[RelimForestrySheetSync] 구글 시트 동기화 실패: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close().catch(e => logger.warn(`[RelimForestrySheetSync] 브라우저 종료 경고: ${e.message}`));
    }
  }
}
