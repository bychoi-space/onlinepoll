import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';

/**
 * 케이스탯 TAPI 관리자 리스트(list.php)에서 슬롯 정보 및 고유 키(ran_id)를 전수 스크랩하는 모듈
 * 
 * @param {string} listUrl - 관리자 리스트 페이지 URL
 * @param {object} options - 옵션 (marketName 필터, maxPages 등)
 * @returns {Promise<object>} { success, pridSel, mnid, slots, totalCount }
 */
export async function scrapeKstatSlots(listUrl, options = {}) {
  const {
    marketName = '',
    maxPages = 10,
    loginId = process.env.KSTAT_LOGIN_ID || '가온김영옥',
    loginPw = process.env.KSTAT_LOGIN_PW || '1234'
  } = options;

  logger.info(`[Kstat 슬롯 스크래퍼] 시작: URL=${listUrl}, 시장필터="${marketName || '전체'}", 계정="${loginId}"`);

  const pridMatch = listUrl.match(/survey\/([0-9]+)/);
  const targetPrid = pridMatch ? pridMatch[1] : '2026070802';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. Kstat 관리자 로그인
    let loginAlertMsg = '';
    const loginDialogHandler = async (dialog) => {
      loginAlertMsg = dialog.message();
      logger.warn(`[Kstat 슬롯 스크래퍼] 로그인 대화상자 감지: "${loginAlertMsg}"`);
      await dialog.accept().catch(() => {});
    };
    page.on('dialog', loginDialogHandler);

    logger.info(`[Kstat 슬롯 스크래퍼] 관리자 로그인 진행 중 (조사원 성명: ${loginId})...`);
    await page.goto('https://survey.kstat.co.kr/kstat_survey/inc/login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.fill('#floatingID', loginId);
    await page.fill('#floatingPassword', loginPw);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      page.click('#btnLogin')
    ]);

    page.off('dialog', loginDialogHandler);

    if (page.url().includes('login.php') && loginAlertMsg) {
      throw new Error(`Kstat 로그인 실패 (조사원: ${loginId}): ${loginAlertMsg}`);
    }

    const loggedUser = await page.evaluate(() => {
      const signout = document.querySelector('a[href*="logout.php"]');
      return signout ? signout.innerText.trim() : '';
    }).catch(() => '');
    if (loggedUser) {
      logger.info(`[Kstat 슬롯 스크래퍼] 로그인 확인 성공: "${loggedUser}"`);
    }

    // 2. Kstat 프로젝트 세션 활성화
    // 로그인 후 tapi_project.php에 머물러 있는 경우, 해당 프로젝트(PRID) 카드를 클릭하여 세션을 확정
    logger.info(`[Kstat 슬롯 스크래퍼] 프로젝트(PRID: ${targetPrid}) 활성화 확인...`);
    const isProjectPage = await page.evaluate(() => {
      return window.location.href.includes('tapi_project.php') || !!document.querySelector('.card-body');
    }).catch(() => false);

    if (isProjectPage) {
      await page.evaluate((prid) => {
        if (typeof tapi_move === 'function') {
          tapi_move('tapi', prid, prid, 'survey/' + prid + '/list');
        } else {
          const cards = Array.from(document.querySelectorAll('.card-body'));
          const targetCard = cards.find(c => c.innerText.includes(prid) && c.innerText.includes('점포주조사')) || cards.find(c => c.innerText.includes(prid));
          if (targetCard) targetCard.click();
        }
      }, targetPrid).catch(() => {});
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }

    // 리스트 URL 파라미터 보완 (?pridSel=...&josa=tapi)
    let finalTargetUrl = listUrl;
    if (!finalTargetUrl.includes('pridSel=')) {
      finalTargetUrl += (finalTargetUrl.includes('?') ? '&' : '?') + `pridSel=${targetPrid}&josa=tapi`;
    }

    if (!page.url().includes('list.php')) {
      logger.info(`[Kstat 슬롯 스크래퍼] 리스트 페이지 이동: ${finalTargetUrl}`);
      await page.goto(finalTargetUrl, { waitUntil: 'networkidle', timeout: 20000 });
    }

    // '프로젝트 선택해 주세요' 오류 페이지인 경우 프로젝트 재선택 페일세이프
    const needsProjectSelection = await page.evaluate(() => {
      return document.body && document.body.innerText.includes('프로젝트 선택해 주세요');
    }).catch(() => false);

    if (needsProjectSelection) {
      logger.warn(`[Kstat 슬롯 스크래퍼] "프로젝트 선택해 주세요" 감지됨 ➔ tapi_project.php로 이동하여 프로젝트 명시적 선택 수행`);
      await page.goto('https://survey.kstat.co.kr/kstat_survey/1_project/tapi_project.php', { waitUntil: 'networkidle', timeout: 15000 });
      await page.evaluate((prid) => {
        if (typeof tapi_move === 'function') {
          tapi_move('tapi', prid, prid, 'survey/' + prid + '/list');
        } else {
          const cards = Array.from(document.querySelectorAll('.card-body'));
          const targetCard = cards.find(c => c.innerText.includes(prid));
          if (targetCard) targetCard.click();
        }
      }, targetPrid);
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }

    // 폼 로드 대기 및 검증
    await page.waitForSelector('form[name="frm"]', { timeout: 10000 }).catch(() => {});
    const hasForm = await page.evaluate(() => !!document.querySelector('form[name="frm"]'));
    if (!hasForm) {
      throw new Error(`Kstat 리스트 페이지(list.php)에 폼(form[name="frm"])이 로드되지 않았습니다. 현재 URL: ${page.url()}`);
    }

    // 3. 시장명(marketName)이 지정된 경우, 상단 검색창에 입력 후 검색 실행
    if (marketName && marketName.trim() !== '') {
      const searchVal = marketName.trim();
      logger.info(`[Kstat 슬롯 스크래퍼] 시장 검색창(srhSijang)에 "${searchVal}" 입력 및 검색 수행...`);
      await page.fill('input[name="srhSijang"]', searchVal).catch(async () => {
        const inp = await page.$('input[placeholder*="시장/상점가명"]');
        if (inp) await inp.fill(searchVal);
      });

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        page.evaluate(() => {
          window.frm = document.forms['frm'] || document.querySelector('form[name="frm"]');
          if (typeof goPage === 'function' && window.frm) {
            goPage(0, '', '');
          } else {
            document.querySelector('input[type="button"][value="검색"]')?.click();
          }
        })
      ]);
      await page.waitForTimeout(1000);
    }

    // 4. 폼 메타(pridSel, mnid) 추출
    const formMeta = await page.evaluate(() => {
      const frm = document.forms['frm'] || document.querySelector('form[name="frm"]');
      return {
        pridSel: frm?.querySelector('input[name="pridSel"]')?.value || '2026070802',
        mnid: frm?.querySelector('input[name="mnid"]')?.value || '900001346'
      };
    }).catch(() => ({ pridSel: targetPrid, mnid: '900001346' }));

    const detectedPrid = formMeta.pridSel || targetPrid;
    const detectedMnid = formMeta.mnid;

    // 5. 페이지 순회 및 슬롯 추출
    const allSlots = [];

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (pageNum > 1) {
        logger.info(`[Kstat 슬롯 스크래퍼] ${pageNum}페이지 이동 시도...`);
        const pageLinkSelector = `a[href*="curPage=${pageNum}"]`;
        const pageLink = await page.$(pageLinkSelector);

        if (pageLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
            pageLink.click()
          ]);
          await page.waitForTimeout(600);
        } else {
          // fallback: frm.curPage 설정 후 이동
          const moved = await page.evaluate((p) => {
            window.frm = document.forms['frm'] || document.querySelector('form[name="frm"]');
            if (window.frm) {
              window.frm.curPage.value = p;
              if (typeof goPage === 'function') {
                goPage(0, '', '');
                return true;
              }
              window.frm.submit();
              return true;
            }
            return false;
          }, pageNum);

          if (moved) {
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(600);
          } else {
            break;
          }
        }
      }

      // 테이블 행 추출
      const rows = await page.evaluate(() => {
        const trs = [...document.querySelectorAll('#list_tbl tbody tr')];
        return trs.map((tr) => {
          const tds = [...tr.querySelectorAll('td')];
          const html = tr.innerHTML;
          
          // sendWeb(id, kid, gid, contactNam, code_start, srt, ran_id)
          const match = html.match(/sendWeb\('([^']+)','([^']+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']+)'\)/);

          return {
            trId: tr.id,
            no: tds[0]?.textContent?.trim() || '',
            extraLabel: tds[1]?.querySelector('input')?.value || tds[1]?.textContent?.trim() || '',
            mkCode: tds[2]?.textContent?.trim() || '',
            regNum: tds[3]?.textContent?.trim() || '',
            office: tds[4]?.textContent?.trim() || '',
            marketName: tds[5]?.textContent?.trim() || '',
            marketType: tds[6]?.textContent?.trim() || '',
            storeName: tds[7]?.textContent?.trim() || '',
            industry: tds[8]?.textContent?.trim() || '',
            phone: tds[9]?.textContent?.trim() || '',
            address: tds[10]?.textContent?.trim() || '',
            statusSelect: tds[13]?.querySelector('select')?.value || '',
            surveyBtnText: tds[16]?.querySelector('button')?.innerText?.trim() || '',
            evalBtnText: tds[17]?.querySelector('button')?.innerText?.trim() || '',
            idSel: match ? match[1] : null,
            kid: match ? match[2] : null,
            gid: match ? match[3] : null,
            srt: match ? match[6] : '1',
            ran_id: match ? match[7] : null
          };
        }).filter(r => r.ran_id && r.ran_id.length > 3);
      });

      if (!rows || rows.length === 0) {
        logger.info(`[Kstat 슬롯 스크래퍼] ${pageNum}페이지에 행이 없어 탐색을 마칩니다.`);
        break;
      }

      logger.info(`[Kstat 슬롯 스크래퍼] ${pageNum}페이지: ${rows.length}개 슬롯 추출 완료.`);
      allSlots.push(...rows);

      // 다음 페이지 존재 여부 확인 (다음 페이지 링크 감지)
      const hasNext = await page.evaluate((currP) => {
        const nextLink = document.querySelector(`a[href*="curPage=${currP + 1}"]`);
        return !!nextLink;
      }, pageNum);

      if (!hasNext) {
        break;
      }
    }

    // 6. 슬롯 객체 규격화 및 URL 조립
    const formattedSlots = allSlots.map((s, idx) => {
      const surveyUrl = `https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=${s.ran_id}&type=tapi&prid=${detectedPrid}&mnid=${detectedMnid}&srt=1`;
      const evalUrl = `https://kstat.surveys.kr/2026/P26042401BA/index.asp?KID=${s.ran_id}&type=tapi&prid=${detectedPrid}&mnid=${detectedMnid}&srt=2`;

      return {
        slotIndex: idx + 1,
        no: s.no,
        extraLabel: s.extraLabel,
        mkCode: s.mkCode,
        regNum: s.regNum,
        office: s.office,
        marketName: s.marketName,
        marketType: s.marketType,
        storeName: s.storeName,
        industry: s.industry,
        phone: s.phone,
        address: s.address,
        idSel: s.idSel,
        kid: s.kid,
        gid: s.gid,
        ran_id: s.ran_id,
        surveyUrl,
        evalUrl,
        surveyCompleted: s.surveyBtnText.includes('완료'),
        evalCompleted: s.evalBtnText.includes('완료')
      };
    });

    logger.success(`🎉 [Kstat 슬롯 스크래퍼] 총 ${formattedSlots.length}개 슬롯 전수 확보 완료!`);
    return {
      success: true,
      pridSel: detectedPrid,
      mnid: detectedMnid,
      marketName: marketName || '전체',
      totalCount: formattedSlots.length,
      slots: formattedSlots
    };

  } catch (err) {
    logger.error(`[Kstat 슬롯 스크래퍼] 실패: ${err.message}`);
    return {
      success: false,
      error: err.message,
      slots: []
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
