import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger.js';
import { launchChromium } from '../utils/chromium-launcher.js';

export const METRIX_622_GOOGLE_SHEET_ID = '1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM';
export const METRIX_622_GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${METRIX_622_GOOGLE_SHEET_ID}/edit?gid=1453131911#gid=1453131911`;

export const METRIX_622_ACCOUNTS = [
  { loginId: '강영미', loginPw: '5254', sheetName: '광주시 리스트' },
  { loginId: '김정례', loginPw: '3995', sheetName: '김정례' },
  { loginId: '노영미', loginPw: '7791', sheetName: '노영미-7791' }
];

export const METRIX_622_INDUSTRIES = [
  { key: 'ind_1', code: '1.제조업', label: '1. 제조업' },
  { key: 'ind_2', code: '2.건설업', label: '2. 건설업' },
  { key: 'ind_3', code: '3.도매 및 소매업', label: '3. 도매 및 소매업' },
  { key: 'ind_5', code: '5.음식 및 주점업', label: '5. 음식 및 주점업' },
  { key: 'ind_6', code: '6.전문, 과학 및 기술 서비스업', label: '6. 전문·과학·기술 서비스업' },
  { key: 'ind_7', code: '7.교육 서비스업', label: '7. 교육 서비스업' },
  { key: 'ind_8', code: '8.예술, 스포츠 및 여가 관련 서비스업', label: '8. 예술·스포츠·여가 서비스업' },
  { key: 'ind_9', code: '9.수리 및 개인 서비스업', label: '9. 수리 및 개인 서비스업' }
];

export function getMetrixIndustryKey(industryStr = '') {
  const s = String(industryStr).trim();
  if (s.startsWith('1.') || s.includes('제조')) return 'ind_1';
  if (s.startsWith('2.') || s.includes('건설')) return 'ind_2';
  if (s.startsWith('3.') || s.includes('도매') || s.includes('소매')) return 'ind_3';
  if (s.startsWith('5.') || s.includes('음식') || s.includes('주점')) return 'ind_5';
  if (s.startsWith('6.') || s.includes('전문') || s.includes('과학') || s.includes('기술')) return 'ind_6';
  if (s.startsWith('7.') || s.includes('교육')) return 'ind_7';
  if (s.startsWith('8.') || s.includes('예술') || s.includes('스포츠') || s.includes('여가')) return 'ind_8';
  if (s.startsWith('9.') || s.includes('수리') || s.includes('개인')) return 'ind_9';
  return 'ind_3';
}

/**
 * 국세청 홈택스(teht.hometax.go.kr ATTABZAA001R08) 실시간 사업자등록상태(계속/휴업/폐업) 일괄 조회
 * @param {string[]} bizNumbers
 * @returns {Promise<Map<string, { bizNo: string, trtCntn: string, taxType: string, bizStatus: string, isClosed: boolean, isSuspended: boolean }>>}
 */
export async function verifyBizStatusViaHometax(bizNumbers = []) {
  const cleanNumbers = Array.from(new Set(
    bizNumbers.map(b => String(b || '').replace(/\D/g, '')).filter(b => b.length === 10)
  ));
  const resultMap = new Map();
  if (cleanNumbers.length === 0) return resultMap;

  const browser = await launchChromium({ headless: true });
  try {
    const chunkSize = 20;
    for (let i = 0; i < cleanNumbers.length; i += chunkSize) {
      const chunk = cleanNumbers.slice(i, i + chunkSize);
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const page = await context.newPage();
        await page.route('**/*app.js*', route => route.abort());
        await page.goto(
          'https://teht.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/ab/a/a/UTEABAAA13.xml',
          { waitUntil: 'domcontentloaded', timeout: 20000 }
        );

        const batchRes = await page.evaluate(async ({ nums }) => {
          const out = [];
          for (const bNo of nums) {
            try {
              const payload = {
                dongCode: bNo.substring(3, 5),
                inqrTrgtClCd: '1',
                mobYn: 'N',
                psbSearch: 'Y',
                pubcUserNo: '',
                txprDscmNo: bNo,
                userReqInfoVO: {}
              };
              const res = await fetch('/wqAction.do?actionId=ATTABZAA001R08&screenId=UTEABAAA13&popupYn=false&realScreenId=', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();
              out.push({
                bizNo: bNo,
                trtCntn: data.trtCntn || '',
                smpcBmanTrtCntn: data.smpcBmanTrtCntn || '',
                nrgtTxprYn: data.nrgtTxprYn || ''
              });
            } catch (e) {
              out.push({ bizNo: bNo, trtCntn: '', error: e.message });
            }
          }
          return out;
        }, { nums: chunk });

        for (const item of batchRes) {
          const trt = String(item.trtCntn || '').trim();
          const smpc = String(item.smpcBmanTrtCntn || '').trim();
          if (!trt && !smpc && item.nrgtTxprYn !== 'Y') continue;
          const isClosed = trt.includes('폐업') || smpc.includes('폐업') || item.nrgtTxprYn === 'Y';
          const isSuspended = trt.includes('휴업') || smpc.includes('휴업');
          const bizStatus = isClosed ? '폐업자' : (isSuspended ? '휴업자' : '계속사업자');
          const taxType = trt ? trt.replace(/\s*입니다\.?\s*$/, '').trim() : '부가가치세 일반과세자';
          resultMap.set(item.bizNo, {
            bizNo: item.bizNo,
            trtCntn: trt,
            taxType,
            bizStatus,
            isClosed,
            isSuspended
          });
        }
      } finally {
        await context.close().catch(e => logger.warn(`[홈택스 컨텍스트 종료 경고] ${e.message}`));
      }
    }
  } catch (err) {
    logger.warn(`[홈택스 사업자번호 휴폐업 조회 경고] ${err.message}`);
  } finally {
    await browser.close().catch(e => logger.warn(`[홈택스 브라우저 종료 경고] ${e.message}`));
  }
  return resultMap;
}

/**
 * 구글 스프레드시트(1rp3yBon3PEHrSc71v_j_rs9zdQP2Vv_WS4chL5AUrUM)에서 3개 조사원 시트 휴대폰 번호 로드
 */
export async function fetchMetrix622GoogleSheetData(sheetId = METRIX_622_GOOGLE_SHEET_ID) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  let buffer = null;

  try {
    const res = await fetch(exportUrl, { redirect: 'follow' });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      buffer = Buffer.from(ab);
    }
  } catch (err) {
    logger.warn(`[경기도 소상공인 구글시트 다운로드 경고] ${err.message}`);
  }

  if (!buffer && fs.existsSync('/tmp/gyeonggi_622_sheet.xlsx')) {
    buffer = fs.readFileSync('/tmp/gyeonggi_622_sheet.xlsx');
  }

  const sheetMapByAccount = {};
  const sparePhones = [];
  if (!buffer) {
    return { sheetMapByAccount, sparePhones };
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  for (const acc of METRIX_622_ACCOUNTS) {
    const ws = wb.Sheets[acc.sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const byUid = new Map();
    const byBizNo = new Map();
    for (const r of rows) {
      const uid = String(r['UID'] || '').trim();
      const bizNo = String(r['사업자 등록번호'] || '').replace(/\D/g, '');
      const phone = String(r['휴대폰'] || '').trim();
      const area = String(r['지역'] || '').trim();
      if (!uid && (area === '남는번호' || /^01\d-\d{3,4}-\d{4}$/.test(phone))) {
        if (phone && !sparePhones.includes(phone)) sparePhones.push(phone);
        continue;
      }
      if (uid) byUid.set(uid, r);
      if (bizNo) byBizNo.set(bizNo, r);
    }
    sheetMapByAccount[acc.loginId] = { byUid, byBizNo, rows };
  }

  return { sheetMapByAccount, sparePhones };
}

/**
 * 경기도 소상공인 사업체패널 3차조사 (SNUM=622) 3개 계정(강영미/김정례/노영미) + 구글시트 휴대폰 + 사업자번호 폐업조회 통합 동기화
 */
export async function scrapeMetrix622AllAccounts(options = {}) {
  const {
    snum = '622',
    accounts = METRIX_622_ACCOUNTS,
    verifyBizStatus = true,
    existingQuotaList = [],
    skipSaveFiles = false
  } = options;

  logger.info(`[Metrix 622 3계정 통합 동기화] 시작: 계정=${accounts.map(a => a.loginId).join(', ')}`);

  const { sheetMapByAccount, sparePhones } = await fetchMetrix622GoogleSheetData();

  const existingByKey = new Map();
  if (Array.isArray(existingQuotaList)) {
    for (const item of existingQuotaList) {
      const k = `${item.surveyorId || ''}_${item.uid || ''}`;
      existingByKey.set(k, item);
      if (item.uid) existingByKey.set(String(item.uid), item);
    }
  }

  const browser = await launchChromium({ headless: true });
  const allSlots = [];
  const sessionsByAccount = {};
  let globalIndex = 1;

  try {
    for (const acc of accounts) {
      const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      const loginUrl = `https://survey.metrix.co.kr/Contact/?SNUM=${snum}`;
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#id', { timeout: 15000 });
      await page.fill('#id', acc.loginId);
      await page.fill('#password', acc.loginPw);

      await Promise.all([
        page.waitForURL(u => u.toString().includes('Listdata'), { waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('button.login')
      ]);
      await page.waitForSelector('table.list-data', { timeout: 15000 });
      await page.waitForSelector('select.ROW_PER_PAGE', { timeout: 10000 }).catch(e => {
        logger.warn(`[Metrix 622 동기화] ROW_PER_PAGE 대기 경고 (${acc.loginId}): ${e.message}`);
      });
      await page.waitForTimeout(1000);

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

      sessionsByAccount[acc.loginId] = {
        ...sessionInfo,
        loginId: acc.loginId,
        loginPw: acc.loginPw,
        sheetName: acc.sheetName
      };

      await page.evaluate(() => {
        const sel = document.querySelector('select.ROW_PER_PAGE');
        if (sel) {
          sel.value = '100';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof $ !== 'undefined') $(sel).val('100').trigger('change');
        }
      });
      await page.waitForTimeout(2500);

      const rows = await page.evaluate(({ sessionInfo }) => {
        const trs = Array.from(document.querySelectorAll('table.list-data tbody tr'));
        return trs.map((tr, idx) => {
          let obj = {};
          const rawObj = tr.getAttribute('data-object');
          if (rawObj) {
            try { obj = JSON.parse(rawObj); } catch (e) {}
          }
          const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
          const uid = String(obj._id || obj.UID || cells[0] || '').trim();
          const companyName = obj['사업체명'] || cells[6] || '';
          const ceoName = obj['대표자 성명'] || cells[10] || '';
          const ceoGender = obj['대표자 성별'] || '';
          const serverPhone = String(obj['휴대폰'] || cells[11] || '').trim();
          const bizNumber = String(obj['사업자 등록번호'] || cells[13] || '').replace(/\D/g, '');
          const industry = obj['업종'] || cells[5] || '';
          const area = obj['지역'] || cells[4] || '';
          const district = obj['구/시'] || cells[7] || '';
          const road = obj['대로/로/길'] || cells[8] || '';
          const detailAddress = obj['상세주소'] || cells[9] || '';
          const fullAddress = `${district} ${road} ${detailAddress}`.trim();
          const bizCategory = obj['분류명'] || '';
          const bizForm = obj['사업차형태'] || '';
          const corpNumber = obj['법인등록번호'] || '';
          const status = cells[14] || '';
          const contactResult = cells[15] || '';
          const lastContactTime = cells[17] || '';
          const surveyUrl = `https://${sessionInfo.domain}/?ACCESS_KEY=${sessionInfo.realAccessKey}&__CU_LOGIN_ID=${encodeURIComponent(sessionInfo.cuLoginId)}&UID=${uid}&__CU_ID=${sessionInfo.cuId}&__CU_LOGIN_ID=${encodeURIComponent(sessionInfo.cuLoginId)}`;
          return {
            accountRowIndex: idx + 1,
            uid,
            companyName,
            ceoName,
            ceoGender,
            serverPhone,
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
      }, { sessionInfo });

      const accSheet = sheetMapByAccount[acc.loginId] || { byUid: new Map(), byBizNo: new Map() };
      for (const r of rows) {
        const prev = existingByKey.get(`${acc.loginId}_${r.uid}`) || existingByKey.get(r.uid) || {};
        const sRow = accSheet.byUid.get(r.uid) || accSheet.byBizNo.get(r.bizNumber) || {};
        const sheetPhone = String(sRow['휴대폰'] || '').trim();
        const excelPhone = sheetPhone || prev.excelPhone || '';
        const effectivePhone = excelPhone || r.serverPhone || prev.phone || '';
        const phoneNeedsSync = Boolean(excelPhone && excelPhone !== r.serverPhone);
        const industryKey = getMetrixIndustryKey(r.industry);
        const rawGuar = String(sRow['보증지원여부'] || r.rawMeta?.['보증지원여부'] || prev.guaranteeSupport || '').trim().toUpperCase();
        const guaranteeSupport = rawGuar === 'O' ? 'O' : (rawGuar === 'X' ? 'X' : rawGuar);
        const normalizedStatus = (String(r.status).trim() === '98%' || (prev.status === '진행중(98%)' && String(r.status).includes('98%')))
          ? '진행중(98%)'
          : r.status;

        allSlots.push({
          ...prev,
          index: globalIndex,
          seq: globalIndex,
          slotIndex: globalIndex,
          accountRowIndex: r.accountRowIndex,
          surveyorId: acc.loginId,
          surveyorPw: acc.loginPw,
          surveyorName: acc.loginId,
          sheetName: acc.sheetName,
          cuId: sessionInfo.cuId,
          uid: r.uid,
          companyName: r.companyName,
          ceoName: r.ceoName,
          ceoGender: r.ceoGender,
          phone: effectivePhone,
          excelPhone,
          serverPhone: r.serverPhone,
          phoneNeedsSync,
          bizNumber: r.bizNumber,
          corpNumber: r.corpNumber,
          bizStatus: prev.bizStatus || '계속사업자',
          taxType: prev.taxType || '부가가치세 일반과세자',
          isClosedBiz: Boolean(prev.isClosedBiz),
          manualClosedOverride: Boolean(prev.manualClosedOverride),
          guaranteeSupport,
          industry: r.industry,
          industryKey,
          bizCategory: r.bizCategory,
          bizForm: r.bizForm,
          area: r.area,
          district: r.district,
          road: r.road,
          detailAddress: r.detailAddress,
          fullAddress: r.fullAddress,
          status: normalizedStatus,
          contactResult: r.contactResult,
          lastContactTime: r.lastContactTime,
          contactPortalUrl: `https://survey.metrix.co.kr/Contact/?SNUM=${snum}`,
          surveyUrl: r.surveyUrl,
          slotUrl: r.surveyUrl,
          rawMeta: r.rawMeta
        });
        globalIndex++;
      }

      logger.info(`[Metrix 622 동기화] 계정 "${acc.loginId}" ${rows.length}건 수집 완료.`);
      await context.close();
    }
  } finally {
    await browser.close().catch(e => logger.warn(`[Metrix 622 브라우저 종료 경고] ${e.message}`));
  }

  // 홈택스 사업자번호 휴폐업 실시간 검증
  if (verifyBizStatus) {
    const bizMap = await verifyBizStatusViaHometax(allSlots.map(s => s.bizNumber));
    if (bizMap.size > 0) {
      for (const s of allSlots) {
        const info = bizMap.get(s.bizNumber);
        if (info) {
          s.taxType = info.taxType || s.taxType;
          if (!s.manualClosedOverride) {
            s.isClosedBiz = Boolean(info.isClosed);
            s.bizStatus = info.bizStatus || '계속사업자';
          }
          s.bizVerifiedAt = new Date().toISOString();
        }
        if (s.isClosedBiz) {
          s.quotaStatus = 'excluded';
        } else if (String(s.status).includes('완료')) {
          s.quotaStatus = 'completed';
        } else if (String(s.status).includes('98%')) {
          s.quotaStatus = '진행중(98%)';
        } else if (!s.quotaStatus || s.quotaStatus === 'excluded') {
          s.quotaStatus = 'ready';
        }
      }
    }
  }

  const quotaColumns = [
    { key: 'index', label: '순번' },
    { key: 'surveyorId', label: '조사원 계정' },
    { key: 'uid', label: 'UID' },
    { key: 'companyName', label: '사업체명' },
    { key: 'ceoName', label: '대표자 성명' },
    { key: 'excelPhone', label: '시트 휴대폰(변경값)' },
    { key: 'serverPhone', label: '서버 휴대폰(기존)' },
    { key: 'bizNumber', label: '사업자등록번호' },
    { key: 'bizStatus', label: '휴폐업조회' },
    { key: 'guaranteeSupport', label: '보증지원여부' },
    { key: 'industry', label: '업종' },
    { key: 'bizCategory', label: '분류명' },
    { key: 'area', label: '지역' },
    { key: 'fullAddress', label: '사업장 주소' },
    { key: 'status', label: '참여상태' },
    { key: 'contactResult', label: '컨택결과' },
    { key: 'surveyUrl', label: '설문URL' }
  ];

  const quotaDbData = {
    title: '2026_경기도_소상공인패널_3차조사_3계정통합_171개',
    type: 'METRIX_PANEL',
    surveyType: 'metrix_panel',
    snum: String(snum),
    surveyUrl: `https://survey.metrix.co.kr/Contact/?SNUM=${snum}`,
    googleSheetUrl: METRIX_622_GOOGLE_SHEET_URL,
    accounts,
    sparePhones,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    count: allSlots.length,
    targetTotal: allSlots.length,
    isComplete: true,
    sessionsByAccount,
    columns: quotaColumns,
    data: allSlots,
    rows: allSlots
  };

  const quotasDir = path.resolve('data/quotas');
  if (!fs.existsSync(quotasDir)) {
    fs.mkdirSync(quotasDir, { recursive: true });
  }

  const fileSuffix = accounts.length >= METRIX_622_ACCOUNTS.length ? 'all' : accounts.map(a => a.loginId).join('_');
  const jsonPath = path.join(quotasDir, `quota_metrix_gyeonggi_622_${fileSuffix}.json`);
  const xlsxPath = path.join(quotasDir, `quota_metrix_gyeonggi_622_${fileSuffix}.xlsx`);

  if (!skipSaveFiles) {
    fs.writeFileSync(jsonPath, JSON.stringify(quotaDbData, null, 2), 'utf8');

    const xlsxRows = allSlots.map(s => ({
      '순번': s.index,
      '조사원': s.surveyorId,
      '시트명': s.sheetName,
      'UID': s.uid,
      '사업체명': s.companyName,
      '대표자 성명': s.ceoName,
      '대표자 성별': s.ceoGender,
      '구글시트 휴대폰': s.excelPhone,
      '서버 기존 휴대폰': s.serverPhone,
      '적용 휴대폰': s.phone,
      '사업자등록번호': s.bizNumber,
      '과세유형': s.taxType,
      '휴폐업상태': s.bizStatus,
      '폐업제외여부': s.isClosedBiz ? '제외(폐업)' : '정상대상',
      '보증지원여부': s.guaranteeSupport || '',
      '업종': s.industry,
      '분류명': s.bizCategory,
      '사업자형태': s.bizForm,
      '지역': s.area,
      '전체주소': s.fullAddress,
      '진행상태': s.status,
      '컨택결과': s.contactResult,
      '최종컨택시각': s.lastContactTime,
      '설문URL': s.surveyUrl
    }));
    const wsOut = XLSX.utils.json_to_sheet(xlsxRows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, wsOut, '경기도소상공인_171개');
    fs.writeFileSync(xlsxPath, XLSX.write(wbOut, { type: 'buffer', bookType: 'xlsx' }));
  }

  return {
    success: true,
    totalCount: allSlots.length,
    sparePhones,
    sessionsByAccount,
    slots: allSlots,
    savedJsonPath: jsonPath,
    savedXlsxPath: xlsxPath,
    jsonFileName: path.basename(jsonPath),
    excelFileName: path.basename(xlsxPath),
    quotaDbData
  };
}

/**
 * 기존 단일/다중 계정 호환 스크래퍼
 */
export async function scrapeMetrixSlots(options = {}) {
  const {
    snum = '622',
    loginId = process.env.METRIX_LOGIN_ID || '강영미',
    loginPw = process.env.METRIX_LOGIN_PW || '5254',
    allAccounts = false
  } = options;

  if (allAccounts || loginId === 'ALL' || loginId === '전체') {
    return scrapeMetrix622AllAccounts(options);
  }

  const matchedAcc = METRIX_622_ACCOUNTS.find(a => a.loginId === loginId) || {
    loginId,
    loginPw,
    sheetName: '광주시 리스트'
  };

  return scrapeMetrix622AllAccounts({
    ...options,
    snum,
    accounts: [matchedAcc]
  });
}
