import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger.js';

/**
 * Metrix GetData 관리자(Listdata)에서 54개 대상체 쿼터 목록을 전수 스크래핑하고
 * JSON 및 Excel 파일로 저장하는 모듈
 * 
 * @param {object} options
 * @param {string} options.snum - 설문 프로젝트 번호 (기본: 622)
 * @param {string} options.loginId - 조사원 아이디 (기본: 강영미)
 * @param {string} options.loginPw - 비밀번호 (기본: 5254)
 * @param {string} options.outputFileName - 저장할 파일명 (옵션)
 * @returns {Promise<object>} { success, totalCount, session, slots, savedJsonPath, savedXlsxPath }
 */
export async function scrapeMetrixSlots(options = {}) {
  const {
    snum = '622',
    loginId = process.env.METRIX_LOGIN_ID || '강영미',
    loginPw = process.env.METRIX_LOGIN_PW || '5254',
    outputFileName = null
  } = options;

  logger.info(`[Metrix 쿼터 스크래퍼] 시작: SNUM=${snum}, 계정="${loginId}"`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. 로그인
    const loginUrl = `https://survey.metrix.co.kr/Contact/?SNUM=${snum}`;
    logger.info(`[Metrix 쿼터 스크래퍼] 로그인 페이지 접속: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    await page.waitForSelector('#id', { timeout: 10000 });
    await page.fill('#id', loginId);
    await page.fill('#password', loginPw);

    await Promise.all([
      page.waitForURL(url => url.toString().includes('Listdata'), { timeout: 20000 }),
      page.click('button.login')
    ]);

    logger.info(`[Metrix 쿼터 스크래퍼] 로그인 성공. 리스트 페이지 진입.`);
    await page.waitForTimeout(1500);

    // 2. 세션 및 키 정보 확보
    const sessionInfo = await page.evaluate(() => {
      const realAk = (window.ACCESS_KEYS || []).find(k => k.NAME === 'REAL')?._id || '3dd82dbba73344d1a7f4';
      return {
        cuLoginId: sessionStorage.CU_LOGIN_ID || '',
        cuId: sessionStorage.CU_ID || '',
        token: sessionStorage.TOKEN || '',
        realAccessKey: realAk,
        domain: window.DOMAIN || 'survey.metrix.co.kr'
      };
    });
    logger.info(`[Metrix 쿼터 스크래퍼] 세션 확보: CU_ID=${sessionInfo.cuId}, ACCESS_KEY=${sessionInfo.realAccessKey}`);

    // 3. 100개씩 보기로 목록 확장
    logger.info(`[Metrix 쿼터 스크래퍼] 표시 개수 100개로 변경 요청...`);
    await page.evaluate(() => {
      const allSelects = Array.from(document.querySelectorAll('select'));
      const limitSel = allSelects.find(s => Array.from(s.options).some(o => o.text.includes('100개씩') || o.value == '100'));
      if (limitSel) {
        const opt100 = Array.from(limitSel.options).find(o => o.text.includes('100개씩') || o.value == '100');
        if (opt100) {
          limitSel.value = opt100.value;
          if (typeof $ !== 'undefined') $(limitSel).trigger('change');
        }
      }
    });

    await page.waitForTimeout(2500);

    // 4. 테이블 데이터 및 행 파싱
    const scrapeResult = await page.evaluate(({ sessionInfo }) => {
      const trs = Array.from(document.querySelectorAll('table.list-data tbody tr'));
      
      const slots = trs.map((tr, idx) => {
        let obj = {};
        const rawObj = tr.getAttribute('data-object');
        if (rawObj) {
          try { obj = JSON.parse(rawObj); } catch(e) {}
        }

        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());

        const uid = String(obj._id || obj.UID || cells[0] || '').trim();
        const companyName = obj['사업체명'] || cells[6] || '';
        const ceoName = obj['대표자 성명'] || cells[10] || '';
        const ceoGender = obj['대표자 성별'] || '';
        const phone = obj['휴대폰'] || cells[11] || '';
        const bizNumber = obj['사업자 등록번호'] || cells[13] || '';
        const industry = obj['업종'] || cells[5] || '';
        const area = obj['지역'] || cells[4] || '';
        const district = obj['구/시'] || cells[7] || '';
        const road = obj['대로/로/길'] || cells[8] || '';
        const detailAddress = obj['상세주소'] || cells[9] || '';
        const fullAddress = `${district} ${road} ${detailAddress}`.trim();
        const bizCategory = obj['분류명'] || '';
        const bizForm = obj['사업차형태'] || '';
        const corpNumber = obj['법인등록번호'] || '';
        const status = cells[14] || ''; // 참여 상태 (예: '진행중(98%)', '진행중(3%)', '')
        const contactResult = cells[15] || ''; // 컨택결과 (예: '1. 성공')
        const lastContactTime = cells[17] || '';

        // 다이렉트 설문 참여 URL 생성
        const surveyUrl = `https://${sessionInfo.domain}/?ACCESS_KEY=${sessionInfo.realAccessKey}&__CU_LOGIN_ID=${encodeURIComponent(sessionInfo.cuLoginId)}&UID=${uid}&__CU_ID=${sessionInfo.cuId}`;

        return {
          index: idx + 1,
          uid,
          companyName,
          ceoName,
          ceoGender,
          phone,
          bizNumber,
          corpNumber,
          industry,
          bizCategory,
          bizForm,
          area,
          district,
          road,
          detailAddress,
          fullAddress,
          status,
          contactResult,
          lastContactTime,
          surveyUrl,
          rawMeta: obj
        };
      });

      return {
        count: slots.length,
        slots
      };
    }, { sessionInfo });

    logger.info(`[Metrix 쿼터 스크래퍼] 총 ${scrapeResult.count}개 쿼터 추출 완료.`);

    // 5. DB 저장용 쿼터 데이터 구조 생성
    const quotaTitle = options.title || `2026_경기도_소상공인패널_${snum}조사_54개`;
    const cleanTitle = quotaTitle.replace(/[^a-zA-Z0-9가-힣_]/g, '_');
    const timestamp = Date.now();
    const baseName = outputFileName || `quota_metrix_${snum}_${cleanTitle}_${timestamp}`;

    const quotaColumns = [
      { key: "uid", label: "UID" },
      { key: "companyName", label: "사업체명" },
      { key: "ceoName", label: "대표자 성명" },
      { key: "ceoGender", label: "대표자 성별" },
      { key: "phone", label: "휴대폰" },
      { key: "bizNumber", label: "사업자등록번호" },
      { key: "industry", label: "업종" },
      { key: "bizCategory", label: "분류명" },
      { key: "area", label: "지역" },
      { key: "fullAddress", label: "사업장 주소" },
      { key: "status", label: "참여상태" },
      { key: "contactResult", label: "컨택결과" },
      { key: "surveyUrl", label: "설문URL" }
    ];

    const quotaDbData = {
      title: quotaTitle,
      type: "METRIX_PANEL",
      snum: snum,
      surveyUrl: options.surveyUrl || loginUrl,
      loginId: loginId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      count: scrapeResult.count,
      targetTotal: scrapeResult.count,
      isComplete: true,
      session: sessionInfo,
      columns: quotaColumns,
      data: scrapeResult.slots,
      rows: scrapeResult.slots
    };

    // 저장 디렉터리 준비
    const quotasDir = path.resolve('data/quotas');
    if (!fs.existsSync(quotasDir)) {
      fs.mkdirSync(quotasDir, { recursive: true });
    }

    // JSON 저장
    const jsonPath = path.join(quotasDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(quotaDbData, null, 2), 'utf8');
    logger.info(`[Metrix 쿼터 스크래퍼] JSON 저장 완료: ${jsonPath}`);

    // Excel (XLSX) 저장
    const xlsxRows = scrapeResult.slots.map(s => ({
      "순번": s.index,
      "UID": s.uid,
      "사업체명": s.companyName,
      "대표자 성명": s.ceoName,
      "대표자 성별": s.ceoGender,
      "휴대폰": s.phone,
      "사업자등록번호": s.bizNumber,
      "법인등록번호": s.corpNumber,
      "업종": s.industry,
      "분류명": s.bizCategory,
      "사업자형태": s.bizForm,
      "지역": s.area,
      "전체주소": s.fullAddress,
      "진행상태": s.status,
      "컨택결과": s.contactResult,
      "최종컨택시각": s.lastContactTime,
      "설문URL": s.surveyUrl
    }));

    const worksheet = XLSX.utils.json_to_sheet(xlsxRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "54개_쿼터목록");

    const xlsxPath = path.join(quotasDir, `${baseName}.xlsx`);
    XLSX.writeFile(workbook, xlsxPath);
    logger.info(`[Metrix 쿼터 스크래퍼] Excel 저장 완료: ${xlsxPath}`);

    await browser.close();

    return {
      success: true,
      totalCount: scrapeResult.count,
      session: sessionInfo,
      slots: scrapeResult.slots,
      savedJsonPath: jsonPath,
      savedXlsxPath: xlsxPath,
      jsonFileName: path.basename(jsonPath),
      excelFileName: path.basename(xlsxPath),
      quotaDbData
    };

  } catch (error) {
    logger.error(`[Metrix 쿼터 스크래퍼] 오류 발생: ${error.message}`);
    await browser.close().catch(() => {});
    throw error;
  }
}
