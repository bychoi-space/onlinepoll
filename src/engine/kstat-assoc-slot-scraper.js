import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';

/**
 * [상인회 조사 전용] 케이스탯 TAPI 관리자 리스트(2026070801/list.php)에서
 * 시장 상인회 슬롯 정보 및 고유 키(ran_id)를 전수 스크랩하는 독립 모듈
 * (기존 점포조사 슬롯 스크래퍼와 100% 완전 분리)
 * 
 * @param {string} listUrl - 상인회 관리자 리스트 페이지 URL
 * @param {object} options - 옵션 (loginId, loginPw 등)
 * @returns {Promise<object>} { success, pridSel, mnid, slots, totalCount }
 */
export async function scrapeKstatAssocSlots(listUrl, options = {}) {
  const {
    loginId = process.env.KSTAT_ASSOC_LOGIN_ID || '가온박정순',
    loginPw = process.env.KSTAT_ASSOC_LOGIN_PW || '1234'
  } = options;

  logger.info(`[Kstat 상인회 슬롯 스크래퍼] 시작: URL=${listUrl || '기본 2026070801'}, 계정="${loginId}"`);

  const targetPrid = '2026070801';
  const targetListUrl = listUrl || `https://survey.kstat.co.kr/kstat_survey/survey/${targetPrid}/list.php?pridSel=${targetPrid}&josa=tapi`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. Kstat 관리자 로그인 (가온박정순)
    let loginAlertMsg = '';
    const loginDialogHandler = async (dialog) => {
      loginAlertMsg = dialog.message();
      logger.warn(`[Kstat 상인회 슬롯 스크래퍼] 대화상자: "${loginAlertMsg}"`);
      await dialog.accept().catch(() => {});
    };
    page.on('dialog', loginDialogHandler);

    logger.info(`[Kstat 상인회 슬롯 스크래퍼] 관리자 로그인 진행 중 (조사원: ${loginId})...`);
    await page.goto('https://survey.kstat.co.kr/kstat_survey/inc/login.php', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.fill('#floatingID', loginId);
    await page.fill('#floatingPassword', loginPw);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
      page.click('#btnLogin')
    ]);

    page.off('dialog', loginDialogHandler);

    if (page.url().includes('login.php') && loginAlertMsg) {
      throw new Error(`Kstat 로그인 실패 (조사원: ${loginId}): ${loginAlertMsg}`);
    }

    // 2. 상인회 프로젝트(PRID: 2026070801) 세션 활성화 및 list.php 이동
    logger.info(`[Kstat 상인회 슬롯 스크래퍼] list.php 이동 중: ${targetListUrl}`);
    await page.goto(targetListUrl, { waitUntil: 'networkidle', timeout: 25000 });

    const isProjectPage = await page.evaluate(() => {
      return window.location.href.includes('tapi_project.php');
    }).catch(() => false);

    if (isProjectPage) {
      logger.info(`[Kstat 상인회 슬롯 스크래퍼] 프로젝트 선택 페이지 감지 -> tapi_move 실행`);
      await page.evaluate((prid) => {
        if (typeof tapi_move === 'function') {
          tapi_move('tapi', prid, prid, 'survey/' + prid + '/list');
        }
      }, targetPrid);
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }

    // 3. 폼 메타(pridSel, mnid) 추출
    const formMeta = await page.evaluate(() => {
      const frm = document.forms['frm'] || document.querySelector('form[name="frm"]');
      return {
        pridSel: frm?.querySelector('input[name="pridSel"]')?.value || '2026070801',
        mnid: frm?.querySelector('input[name="mnid"]')?.value || '900001374'
      };
    }).catch(() => ({ pridSel: '2026070801', mnid: '900001374' }));

    const detectedPrid = formMeta.pridSel || '2026070801';
    const detectedMnid = formMeta.mnid || '900001374';

    // 4. 상인회 테이블 행 추출
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('table tbody tr'));
      return trs.map((tr, idx) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const html = tr.innerHTML;
        
        // sendWeb(id, kid, gid, contactNam, code_start, srt, ran_id)
        const match = html.match(/sendWeb\('([^']+)','([^']+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']+)'\)/);

        return {
          rowIndex: idx + 1,
          id: tds[0]?.textContent?.trim() || '',
          marketCode: tds[1]?.textContent?.trim() || '',
          regNumber: tds[2]?.textContent?.trim() || '',
          marketName: tds[3]?.textContent?.trim() || '',
          marketType: tds[4]?.textContent?.trim() || '',
          sido: tds[5]?.textContent?.trim() || '',
          sigungu: tds[6]?.textContent?.trim() || '',
          assocPhone: tds[7]?.textContent?.trim() || '',
          leaderName: tds[8]?.textContent?.trim() || '',
          leaderPhone: tds[9]?.textContent?.trim() || '',
          address: tds[10]?.textContent?.trim() || '',
          office: tds[11]?.textContent?.trim() || '',
          zone: tds[12]?.textContent?.trim() || '',
          idSel: match ? match[1] : null,
          kid: match ? match[2] : null,
          gid: match ? match[3] : null,
          srt: match ? match[6] : '1',
          ran_id: match ? match[7] : null
        };
      }).filter(r => r.ran_id && r.ran_id.length > 3);
    });

    logger.info(`[Kstat 상인회 슬롯 스크래퍼] 총 ${rows.length}개 상인회 슬롯 추출 성공.`);

    // 5. 상인회 전용 규격화 및 URL 조립 (P26042401A / P26042401AA)
    const formattedSlots = rows.map((s, idx) => {
      const surveyUrl = `https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=${s.ran_id}&type=tapi&prid=${detectedPrid}&mnid=${detectedMnid}&srt=1`;
      const evalUrl = `https://kstat.surveys.kr/2026/P26042401AA/index.asp?KID=${s.ran_id}&type=tapi&prid=${detectedPrid}&mnid=${detectedMnid}&srt=2`;

      return {
        slotIndex: idx + 1,
        marketCode: s.marketCode,
        regNumber: s.regNumber,
        marketName: s.marketName,
        marketType: s.marketType,
        sido: s.sido,
        sigungu: s.sigungu,
        assocPhone: s.assocPhone,
        leaderName: s.leaderName,
        leaderPhone: s.leaderPhone,
        address: s.address,
        office: s.office,
        zone: s.zone,
        idSel: s.idSel || (s.kid ? String(Number(s.kid) + 1) : null),
        kid: s.kid,
        gid: s.gid || '0',
        ranId: s.ran_id,
        slotUrl: surveyUrl,
        evalUrl: evalUrl,
        quotaStatus: 'ready'
      };
    });

    return {
      success: true,
      pridSel: detectedPrid,
      mnid: detectedMnid,
      slots: formattedSlots,
      totalCount: formattedSlots.length
    };

  } catch (err) {
    logger.error(`[Kstat 상인회 슬롯 스크래퍼] 오류 발생:`, err);
    throw err;
  } finally {
    await browser.close();
  }
}
