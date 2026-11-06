import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

export const HRC_ACCOUNTS = {
  '700275': { loginId: '700275', loginPw: '700275', surveyorName: '강영미', filePrefix: 'quota_hrc_energy_2025_700275_강영미' },
  '700277': { loginId: '700277', loginPw: '700277', surveyorName: '강경옥', filePrefix: 'quota_hrc_energy_2025_700277_강경옥' },
  '701493': { loginId: '701493', loginPw: '701493', surveyorName: '김정례', filePrefix: 'quota_hrc_energy_2025_701493_김정례' }
};

/**
 * 로컬 data/quotas/ 폴더에서 특정 조사원 계정의 에너지총조사 쿼터 JSON 파일 경로를 반환
 */
export function findHrcQuotaJsonPath(loginId) {
  if (!fs.existsSync(quotasDir)) return null;
  const files = fs.readdirSync(quotasDir).filter(f => f.startsWith(`quota_hrc_energy_2025_${loginId}`) && f.endsWith('.json'));
  if (files.length === 0) return null;
  return path.join(quotasDir, files[0]);
}

/**
 * 한국리서치 TAPI (https://tapi.hrcglobal.com) 에너지총조사 [건물] 탭(List4) 전 페이지 슬롯 상태 스크래핑 및 동기화
 *
 * @param {object} options
 * @param {string} options.loginId - 조사원 ID ('700275' | '700277' | '701493')
 * @param {string} options.loginPw - 비밀번호 (기본값: loginId와 동일)
 * @returns {Promise<object>}
 */
export async function scrapeHrcEnergySlots(options = {}) {
  const loginId = String(options.loginId || '700275').trim();
  const loginPw = String(options.loginPw || loginId).trim();
  const accountMeta = HRC_ACCOUNTS[loginId] || { loginId, loginPw, surveyorName: loginId };

  logger.info(`[HRC 에너지총조사 스크래퍼] 시작: 계정=${loginId} (${accountMeta.surveyorName})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    await page.goto('https://tapi.hrcglobal.com/Home/Login', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.fill('input[type="text"]', loginId);
    await page.fill('input[type="password"]', loginPw);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);

    await page.waitForSelector('a[onclick*="2026-89-0342C"]', { timeout: 15000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('a[onclick*="2026-89-0342C"]')
    ]);

    await page.waitForSelector('#goBuilding', { timeout: 15000 });
    await Promise.all([
      page.waitForURL(u => u.toString().includes('/q260342/List4'), { timeout: 20000 }),
      page.click('#goBuilding')
    ]);
    await page.waitForSelector('tr[id^="List4_DXDataRow"]', { timeout: 15000 });

    const scrapedMap = new Map();
    const visitedPages = new Set();
    let currentPageNum = 1;

    while (true) {
      visitedPages.add(currentPageNum);
      const pageData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[id^="List4_DXDataRow"]')).map(tr => {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
          return {
            uid: tds[0] || '',
            siteStatus: tds[2] || '',
            progress: tds[3] || '0%',
            lastContactStatus: tds[5] || '',
            contactCount: tds[6] || '0',
            buildingName: tds[7] || '',
            stratumCode: tds[8] || '',
            mainUse: tds[9] || '',
            areaScale: tds[10] || '',
            regionGroup: tds[11] || '',
            sido: tds[12] || '',
            sigungu: tds[13] || ''
          };
        });

        const pageLinks = Array.from(document.querySelectorAll('a.dxp-num'))
          .map(a => ({
            num: parseInt(a.innerText.trim().replace(/[\[\]]/g, ''), 10),
            href: a.getAttribute('href') || ''
          }))
          .filter(x => !isNaN(x.num) && x.href);

        return { rows, pageLinks };
      });

      for (const r of pageData.rows) {
        if (r.uid) scrapedMap.set(String(r.uid), r);
      }

      const nextLink = pageData.pageLinks.find(p => !visitedPages.has(p.num) && p.num > currentPageNum);
      if (!nextLink) break;

      currentPageNum = nextLink.num;
      const targetUrl = nextLink.href.startsWith('http')
        ? nextLink.href
        : `https://tapi.hrcglobal.com${nextLink.href}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('tr[id^="List4_DXDataRow"]', { timeout: 15000 }).catch(() => {});
    }

    logger.info(`[HRC 에너지총조사 스크래퍼] 계정=${loginId} 총 ${scrapedMap.size}개 건물 슬롯 실시간 상태 수집 완료`);

    // 기존 쿼터 JSON 파일과 병합
    const jsonPath = findHrcQuotaJsonPath(loginId);
    let updatedQuota = null;
    if (jsonPath && fs.existsSync(jsonPath)) {
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const dataList = content.data || [];

      dataList.forEach(item => {
        const live = scrapedMap.get(String(item.uid));
        if (live) {
          item.siteStatus = live.siteStatus;
          item.progress = live.progress;
          item.lastContactStatus = live.lastContactStatus;
          item.contactCount = live.contactCount;
          if (!item.buildingName && live.buildingName) {
            item.buildingName = live.buildingName;
          }
          const pctNum = parseInt(String(live.progress).replace(/[^0-9]/g, ''), 10) || 0;
          if (live.siteStatus === '완료' || pctNum >= 100) {
            item.status = '완료';
            item.quotaStatus = 'completed';
            item.surveyCompleted = '완료';
          } else if (pctNum > 0 || live.siteStatus === '진행') {
            item.status = `진행중(${pctNum}%)`;
            if (item.quotaStatus !== 'completed') {
              item.quotaStatus = 'ready';
            }
          }
        }
      });

      content.updatedAt = new Date().toISOString();
      fs.writeFileSync(jsonPath, JSON.stringify(content, null, 2), 'utf-8');

      // Excel 동기화
      const xlsxPath = jsonPath.replace(/\.json$/i, '.xlsx');
      const cols = content.columns || [];
      if (cols.length > 0) {
        const sheetRows = dataList.map(r => {
          const obj = {};
          cols.forEach(c => { obj[c.label] = r[c.key] ?? ''; });
          return obj;
        });
        const newWb = XLSX.utils.book_new();
        const newWs = XLSX.utils.json_to_sheet(sheetRows);
        XLSX.utils.book_append_sheet(newWb, newWs, '건물쿼터');
        XLSX.writeFile(newWb, xlsxPath);
      }
      updatedQuota = content;
    }

    return {
      success: true,
      loginId,
      surveyorName: accountMeta.surveyorName,
      totalScraped: scrapedMap.size,
      scrapedSlots: Array.from(scrapedMap.values()),
      quota: updatedQuota,
      jsonPath
    };
  } finally {
    await browser.close();
  }
}
