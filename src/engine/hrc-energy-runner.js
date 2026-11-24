import { launchChromium } from '../utils/chromium-launcher.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import {
  KOREAN_SIGNATURE_STYLES,
  selectKoreanSignatureStyle,
  buildKoreanSignatureStrokes
} from '../utils/korean-signature.js';

const HRC_BASE_URL = 'https://tapi.hrcglobal.com';

/**
 * 전화번호 문자열(예: '010-7935-2414' 또는 '01079352414')을 [prefix, mid, last]로 분리
 */
export function parsePhoneParts(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)];
  }
  if (digits.length === 10) {
    if (digits.startsWith('02')) {
      return ['02', digits.slice(2, 6), digits.slice(6, 10)];
    }
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
  }
  if (digits.length === 9 && digits.startsWith('02')) {
    return ['02', digits.slice(2, 5), digits.slice(5, 9)];
  }
  return ['010', '7935', '2414'];
}

export const HRC_SIGNATURE_STYLES = KOREAN_SIGNATURE_STYLES;

/**
 * 에너지총조사 [답례품 수령증] 서명용 성명 정규화 (한글/영문/공백만 허용)
 */
export function normalizeHrcSignerName(rawName, fallbackName = '김철수') {
  const cleaned = String(rawName || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^가-힣a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '관리소장' || cleaned === '담당자' || cleaned === '소장') {
    const fbCleaned = String(fallbackName || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[^가-힣a-zA-Z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (fbCleaned && fbCleaned !== '관리소장' && fbCleaned !== '담당자') {
      return fbCleaned;
    }
  }
  return cleaned || '김철수';
}

/**
 * 에너지총조사 [답례품 수령증] 서명용 연락처 정규화 (Signature 페이지의 isAnyPhone 통과 보장)
 */
export function normalizeHrcSignerPhoneParts(tel1, tel2, tel3, rawPhone = '', uidSeed = 800163) {
  const validPrefixes = new Set(['010', '02', '031', '032', '033', '041', '042', '043', '044', '051', '052', '053', '054', '055', '061', '062', '063', '064', '070']);
  let p1 = String(tel1 || '').replace(/\D/g, '');
  let p2 = String(tel2 || '').replace(/\D/g, '');
  let p3 = String(tel3 || '').replace(/\D/g, '');

  if (!p1 || !p2 || !p3) {
    const parsed = parsePhoneParts(rawPhone);
    p1 = p1 || parsed[0];
    p2 = p2 || parsed[1];
    p3 = p3 || parsed[2];
  }

  if (!validPrefixes.has(p1)) {
    p1 = '010';
  }
  if (p1 === '010') {
    if (!/^[1-9]\d{3}$/.test(p2)) {
      const seedNum = (Number(uidSeed) || 800163);
      const firstDigit = 2 + (seedNum % 8); // 2..9
      const rest = p2.replace(/\D/g, '').slice(-3).padStart(3, '4');
      p2 = `${firstDigit}${rest}`;
    }
  } else {
    if (!/^[1-9]\d{2,3}$/.test(p2)) {
      const seedNum = (Number(uidSeed) || 800163);
      const firstDigit = 2 + (seedNum % 7);
      const rest = p2.replace(/\D/g, '').slice(-3).padStart(3, '2');
      p2 = `${firstDigit}${rest}`;
    }
  }
  if (!/^\d{4}$/.test(p3)) {
    p3 = String(1000 + ((Number(uidSeed) || 800163) * 37) % 8999).padStart(4, '0');
  }

  return [p1, p2, p3];
}

/**
 * 한국리서치 TAPI [답례품 수령증 작성] 팝업 페이지(/q260342/Signature)에 접속하여
 * 1) 답례품: '신세계상품권 5,000원' 선택
 * 2) 참여자 성명 및 연락처 입력
 * 3) 응답자 성명 한글 자모 획 분해 + 8종 필체 다변화(기울기·필압·흘림·밑줄) 서명 그리기
 * 4) ./SaveSignature 저장 및 AnswerInfo4에서 '지류 상품권 수령 서명 완료' 확인
 */
export async function signHrcEnergyGiftReceipt(page, {
  uid,
  loginId = '700275',
  loginPw = '700275',
  contactName = '',
  fallbackName = '',
  tel1 = '',
  tel2 = '',
  tel3 = '',
  rawPhone = '',
  forcedStyleIndex = null,
  reportDir = null,
  capturedSteps = null
} = {}) {
  const uidStr = String(uid || '').trim();
  if (!uidStr) {
    return { ok: false, reason: 'missing_uid' };
  }

  const uidSeed = parseInt(uidStr.replace(/\D/g, ''), 10) || 800163;
  const nameSeed = Array.from(String(contactName || fallbackName || '')).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const combinedSeed = uidSeed + nameSeed * 17;
  const styleIdx = (forcedStyleIndex !== null && forcedStyleIndex !== undefined && forcedStyleIndex !== 'auto')
    ? (Number(forcedStyleIndex) % HRC_SIGNATURE_STYLES.length)
    : (combinedSeed % HRC_SIGNATURE_STYLES.length);
  const styleCfg = HRC_SIGNATURE_STYLES[styleIdx];

  // 1. AnswerInfo4 페이지 접속 (비로그인 상태인 경우 로그인 후 진입)
  const answerInfoUrl = `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uidStr}&page=1`;
  await page.goto(answerInfoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

  if (page.url().includes('/Home/Login')) {
    await page.fill('input[type="text"]', String(loginId));
    await page.fill('input[type="password"]', String(loginPw || loginId));
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);
    const hasProjectLink = await page.$('a[onclick*="2026-89-0342C"]');
    if (hasProjectLink) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('a[onclick*="2026-89-0342C"]')
      ]);
    }
    await page.goto(answerInfoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  }

  await page.waitForTimeout(400);

  // 2. AnswerInfo4에서 기존 성명/연락처 및 서명 완료 여부 확인
  const answerInfoStatus = await page.evaluate(() => {
    const c1Name = (document.querySelector('#contact1Name')?.value || '').trim();
    const c1P1 = (document.querySelector('#contact1TelPrefix')?.value || '').trim();
    const c1P2 = (document.querySelector('#contact1Tel2')?.value || '').trim();
    const c1P3 = (document.querySelector('#contact1Tel3')?.value || '').trim();
    const completeBoxText = (document.querySelector('.gift-complete-box')?.innerText || '').trim();
    const hasInsertBtn = Boolean(document.querySelector('#insertSignature'));
    return {
      c1Name,
      c1P1,
      c1P2,
      c1P3,
      alreadySigned: completeBoxText.includes('서명 완료'),
      completeBoxText,
      hasInsertBtn
    };
  });

  const signerName = normalizeHrcSignerName(
    answerInfoStatus.c1Name || contactName,
    fallbackName || contactName || '김철수'
  );
  const [hp1, hp2, hp3] = normalizeHrcSignerPhoneParts(
    answerInfoStatus.c1P1 || tel1,
    answerInfoStatus.c1P2 || tel2,
    answerInfoStatus.c1P3 || tel3,
    rawPhone,
    uidSeed
  );
  const fullPhone = `${hp1}-${hp2}-${hp3}`;

  // 만약 AnswerInfo4에 연락처1 성명이나 전화번호가 비어있다면 AnswerInfo4에도 저장
  if (!answerInfoStatus.c1Name || !answerInfoStatus.c1P2 || !answerInfoStatus.c1P3) {
    await page.evaluate(async ({ sName, p1, p2, p3 }) => {
      const nameEl = document.querySelector('#contact1Name');
      const preEl = document.querySelector('#contact1TelPrefix');
      const midEl = document.querySelector('#contact1Tel2');
      const lastEl = document.querySelector('#contact1Tel3');
      if (nameEl && !nameEl.value.trim()) nameEl.value = sName;
      if (preEl && (!preEl.value || preEl.value === 'NONE')) preEl.value = p1;
      if (midEl && !midEl.value.trim()) midEl.value = p2;
      if (lastEl && !lastEl.value.trim()) lastEl.value = p3;
      if (typeof window.buildSaveData === 'function' && typeof window.$ !== 'undefined') {
        await new Promise(resolve => {
          window.$.post('./SaveInfo4', window.buildSaveData(), () => resolve()).fail(() => resolve());
        });
      }
    }, { sName: signerName, p1: hp1, p2: hp2, p3: hp3 }).catch(err => console.warn('[DOM evaluate 경고]', err.message));
  }

  if (answerInfoStatus.alreadySigned) {
    logger.info(`[HRC 답례품 서명] UID=${uidStr} 이미 서명 완료 상태입니다 (${answerInfoStatus.completeBoxText})`);
    return {
      ok: true,
      alreadySigned: true,
      uid: uidStr,
      signerName,
      phone: fullPhone,
      signerPhone: fullPhone,
      giftBrand: '신세계',
      giftValue: '5000',
      giftLabel: '신세계상품권 5,000원',
      styleLabel: styleCfg.label
    };
  }

  // 3. 답례품 수령증 서명 페이지(/q260342/Signature) 진입
  const sigUrl = `https://tapi.hrcglobal.com/q260342/Signature?pn=q260342&pid=${uidStr}&listName=q260342_List`;
  await page.goto(sigUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('#giftItem', { timeout: 15000 });
  await page.waitForSelector('#sig canvas', { timeout: 15000 });
  await page.waitForTimeout(250);

  // 4. 신세계상품권 5,000원 선택 + 성명 + 연락처 입력 + 8종 한글 필체 서명 그리기
  const denseStrokes = buildKoreanSignatureStrokes({
    targetName: signerName,
    seed: combinedSeed,
    styleCfg,
    canvasWidth: 558,
    canvasHeight: 158
  });

  const drawRes = await page.evaluate(async ({ targetName, p1, p2, p3, denseStrokes, styleCfg }) => {
    // window.opener.location.reload() 및 window.close() 안전 모킹
    window.__hrcSigSaved = false;
    window.__hrcSigError = '';
    window.opener = {
      location: {
        reload: function () {
          window.__hrcSigSaved = true;
        }
      }
    };
    window.close = function () {
      window.__hrcSigSaved = true;
    };

    // (1) 답례품 선택: 신세계상품권 5,000원 (value="5000", data-brand="신세계")
    const giftSel = document.querySelector('#giftItem');
    if (!giftSel) return { ok: false, reason: '#giftItem not found' };
    const shinsegaeOpt =
      giftSel.querySelector('option[data-brand="신세계"]') ||
      Array.from(giftSel.options).find(o => (o.text || '').includes('신세계')) ||
      giftSel.options[1];
    if (shinsegaeOpt) {
      shinsegaeOpt.selected = true;
      giftSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // (2) 참여자 성명 입력
    const nameInput = document.querySelector('#name');
    if (nameInput) {
      nameInput.value = targetName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // (3) 참여자 연락처 입력
    const hp1Sel = document.querySelector('#hp1');
    const hp2Input = document.querySelector('#hp2');
    const hp3Input = document.querySelector('#hp3');
    if (hp1Sel) {
      hp1Sel.value = p1;
      hp1Sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (hp2Input) {
      hp2Input.value = p2;
      hp2Input.dispatchEvent(new Event('input', { bubbles: true }));
      hp2Input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (hp3Input) {
      hp3Input.value = p3;
      hp3Input.dispatchEvent(new Event('input', { bubbles: true }));
      hp3Input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // (4) 공통 한글 서명 모듈에서 생성된 폴리라인 획(denseStrokes)을 캔버스에 렌더링
    const canvas = document.querySelector('#sig canvas');
    if (!canvas) return { ok: false, reason: '#sig canvas not found' };
    const cw = canvas.width || canvas.offsetWidth || 558;
    const ch = canvas.height || canvas.offsetHeight || 158;

    // jQuery UI Signature 상태 동기화
    if (typeof window.$ !== 'undefined' && window.$('#sig').signature) {
      window.$('#sig').signature('clear');
      window.$('#sig').signature('draw', { lines: denseStrokes });
    }

    // 필압 변화(minW ~ maxW)가 살아있는 자연스러운 펜 획을 캔버스에 추가 렌더링
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#111827';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const line of denseStrokes) {
        for (let i = 0; i < line.length - 1; i++) {
          const progress = i / Math.max(1, line.length - 1);
          const pressure = Math.sin(progress * Math.PI);
          ctx.lineWidth = styleCfg.minW + (styleCfg.maxW - styleCfg.minW) * (0.35 + 0.65 * pressure);
          ctx.beginPath();
          ctx.moveTo(line[i][0], line[i][1]);
          ctx.lineTo(line[i + 1][0], line[i + 1][1]);
          ctx.stroke();
        }
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const sigInput = document.querySelector('#signatureID');
    if (sigInput) {
      sigInput.value = dataUrl;
    }

    return {
      ok: Boolean(dataUrl && dataUrl.startsWith('data:image/')),
      strokeCount: denseStrokes.length,
      dataUrlLength: dataUrl ? dataUrl.length : 0
    };
  }, {
    targetName: signerName,
    p1: hp1,
    p2: hp2,
    p3: hp3,
    denseStrokes,
    styleCfg
  });

  if (!drawRes?.ok) {
    throw new Error(`[UID ${uidStr}] 답례품 수령증 서명 생성 실패: ${drawRes?.reason || '알 수 없는 오류'}`);
  }

  if (reportDir) {
    const fileName = `step_GIFT_SIGN_${uidStr}_${Date.now()}.png`;
    await page.screenshot({ path: path.join(reportDir, fileName), fullPage: true }).catch(err => console.warn('[Screenshot 경고]', err.message));
    if (Array.isArray(capturedSteps)) {
      capturedSteps.push({
        step: 'GIFT_SIGNATURE',
        stepIndex: capturedSteps.length + 1,
        title: `답례품 수령증 서명 (${signerName} · 신세계 5,000원 · ${styleCfg.label})`,
        file: fileName,
        url: `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`
      });
    }
  }

  // 5. [저 장](#ok) 버튼 클릭 및 ./SaveSignature 완료 대기
  await page.click('#ok');
  for (let w = 0; w < 30; w++) {
    await page.waitForTimeout(200);
    const done = await page.evaluate(() => Boolean(window.__hrcSigSaved));
    if (done) break;
  }

  // 6. AnswerInfo4로 돌아가 '지류 상품권 수령 서명 완료' 배지 확인
  await page.goto(answerInfoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(300);
  const verified = await page.evaluate(() => {
    const txt = (document.querySelector('.gift-complete-box')?.innerText || '').trim();
    return {
      signed: txt.includes('서명 완료'),
      text: txt
    };
  });

  logger.info(`[HRC 답례품 서명 완료] UID=${uidStr}, 성명=${signerName}, 연락처=${fullPhone}, 상품권=신세계 5,000원, 필체="${styleCfg.label}", 확인="${verified.text || '저장됨'}"`);

  return {
    ok: verified.signed,
    alreadySigned: false,
    uid: uidStr,
    signerName,
    phone: fullPhone,
    signerPhone: fullPhone,
    giftBrand: '신세계',
    giftValue: '5000',
    giftLabel: '신세계상품권 5,000원',
    styleLabel: styleCfg.label,
    verifiedText: verified.text
  };
}

/**
 * RPS 웹설문 페이지 준비 대기 헬퍼
 * - #QuestionView가 로드되고 (window.isRun === false 이거나 #ErrorMessage/#AlertMessage 팝업이 떴거나 '조사완료' 텍스트가 표시된 경우) 즉시 반환
 */
async function waitForRpsReady(page) {
  await page.waitForFunction(() => {
    const jqActive = (typeof window.$ !== 'undefined' && typeof window.$.active === 'number') ? window.$.active : 0;
    if (jqActive > 0) return false;
    const qv = document.querySelector('#QuestionView');
    const txt = (qv?.innerText || document.body?.innerText || '');
    if (txt.includes('조사완료') && txt.includes('정상적으로 완료')) return true;
    const cv = document.querySelector('#CurrentVariable')?.value || '';
    const err = document.querySelector('#ErrorMessage')?.value || '';
    const alertMsg = document.querySelector('#AlertMessage')?.value || '';
    return qv && qv.innerHTML.trim().length > 80 && cv !== '' && (
      (typeof window.isRun !== 'undefined' && window.isRun === false) ||
      err !== '' ||
      alertMsg !== ''
    );
  }, { timeout: 20000 }).catch(err => console.warn('[waitForRpsReady 대기 경고]', err.message));
  await page.waitForTimeout(250);
}

/**
 * 현재 RPS 화면 상태 추출
 */
async function extractRpsStep(page) {
  return await page.evaluate(() => {
    const qv = document.querySelector('#QuestionView');
    const cv = document.querySelector('#CurrentVariable')?.value || '';
    const pct = document.querySelector('#progress_num_txt')?.innerText?.trim() || '';
    const err = document.querySelector('#ErrorMessage')?.value || '';
    const alertMsg = document.querySelector('#AlertMessage')?.value || '';
    const text = (qv?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const isCompleted = text.includes('조사완료') && text.includes('정상적으로 완료');
    const q1260Filled = (document.querySelector('#q1260_op9')?.value || '').trim() !== '';

    const inputs = Array.from(qv ? qv.querySelectorAll('input, select, textarea') : [])
      .filter(el => el.type !== 'hidden' && el.type !== 'button')
      .map(el => ({
        tag: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        variable: el.getAttribute('Variable') || el.getAttribute('variable') || '',
        codeLabel: el.getAttribute('CodeLabel') || el.getAttribute('codelabel') || '',
        openDataType: el.getAttribute('opendatatype') || '',
        value: el.value,
        checked: el.checked,
        disabled: el.disabled,
        readOnly: el.readOnly,
        visible: el.offsetParent !== null
      }));

    return { cv, pct, err, alertMsg, text, isCompleted, q1260Filled, inputs };
  });
}

/**
 * 네이버 지도(map.naver.com)에서 건물 주소로 검색하여 '이 주소의 장소 N' (입주업체 수, siteCount)를 조회
 */
export async function fetchNaverMapPlaceCount(context, addresses = [], triedSet = null) {
  const seen = triedSet instanceof Set ? triedSet : new Set();
  const validAddrs = [];
  for (const rawAddr of addresses) {
    const cleaned = String(rawAddr || '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 6 && /\d/.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      validAddrs.push(cleaned);
    }
  }
  if (!context || validAddrs.length === 0) return null;

  const mapPage = await context.newPage();
  try {
    for (const addr of validAddrs) {
      let apiData = null;
      const onResponse = async (res) => {
        if (res.url().includes('/p/api/search/all')) {
          try {
            apiData = await res.json();
          } catch (_) {}
        }
      };
      mapPage.on('response', onResponse);
      try {
        await mapPage.goto(`https://map.naver.com/p/search/${encodeURIComponent(addr)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 12000
        });
        for (let w = 0; w < 15 && !apiData; w++) {
          await mapPage.waitForTimeout(200);
        }
      } catch (err) {
        logger.warn(`[HRC 네이버지도 조회 경고] 주소(${addr}) 접속 지연: ${err.message}`);
      } finally {
        mapPage.off('response', onResponse);
      }

      if (apiData?.result) {
        const roadList = apiData.result.address?.roadAddress?.list || [];
        const jibunList = apiData.result.address?.jibunsAddress?.list || [];
        const candidates = [
          roadList[0]?.siteCount,
          jibunList[0]?.mappedAddress?.siteCount,
          jibunList[0]?.siteCount,
          apiData.result.place?.totalCount
        ];
        for (const raw of candidates) {
          const cnt = parseInt(String(raw ?? '').replace(/[^0-9]/g, ''), 10);
          if (Number.isFinite(cnt) && cnt > 0) {
            logger.info(`[HRC 네이버지도 조회] 주소="${addr}" ➔ 이 주소의 장소 ${cnt}개 확인`);
            return cnt;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`[HRC 네이버지도 조회 실패] ${err.message}`);
  } finally {
    await mapPage.close().catch(err => logger.warn(`mapPage 닫기 경고: ${err.message}`));
  }
  return null;
}

/**
 * 문화및집회시설 건축·시설안내 실측/검증 천장고 사전 (단위: m)
 */
const CULTURAL_FACILITY_CEILING_DB = [
  { pattern: /선재서울미술관|아트선재센터/i, ceilingM: 3.9, source: '시설안내 실측(전시실 3.9m)' },
  { pattern: /일민미술관/i, ceilingM: 4.2, source: '전시실 기준치' },
  { pattern: /세종문화회관\s*\(\s*예술동\s*\)|세종문화회관\s*예술동/i, ceilingM: 4.0, source: '예술동 기준치' },
  { pattern: /세종문화회관/i, ceilingM: 6.5, source: '공연·전시 복합 평균' },
  { pattern: /국립현대미술관\s*서울관/i, ceilingM: 5.5, source: '전시실 평균 천장고' },
  { pattern: /국립현대미술관/i, ceilingM: 5.0, source: '과천관 전시동 기준치' },
  { pattern: /동대문\s*디자인\s*플라자|\bDDP\b/i, ceilingM: 7.5, source: '아트홀·뮤지엄 복합 평균' },
  { pattern: /송도\s*컨벤시아/i, ceilingM: 9.5, source: '컨벤션·볼룸·전시장 복합 평균' },
  { pattern: /인천\s*아시아드\s*주경기장/i, ceilingM: 6.0, source: '주경기장 실내시설 평균' },
  { pattern: /국립\s*세계\s*문자\s*박물관/i, ceilingM: 4.8, source: '상설·기획전시실 기준치' },
  { pattern: /국립\s*민속\s*박물관/i, ceilingM: 4.5, source: '전시관 평균 천장고' },
  { pattern: /국립\s*고궁\s*박물관|대한민국\s*역사\s*박물관|서울\s*역사\s*박물관/i, ceilingM: 4.2, source: '박물관 전시실 기준치' },
  { pattern: /기독교\s*100주년\s*기념관/i, ceilingM: 4.0, source: '기념관·집회실 기준치' },
  { pattern: /수원\s*박물관/i, ceilingM: 4.2, source: '박물관 전시실 기준치' },
  { pattern: /해양\s*생태\s*과학관|해양\s*안전\s*체험관/i, ceilingM: 4.5, source: '과학·체험전시관 기준치' },
  { pattern: /수원\s*SK\s*아트리움/i, ceilingM: 6.0, source: '대·소공연장 복합 평균' },
  { pattern: /안양\s*아트\s*센터/i, ceilingM: 5.8, source: '공연장·컨벤션 복합 평균' },
  { pattern: /서수원\s*칠보\s*체육관/i, ceilingM: 8.0, source: '실내체육관 천장고' },
  { pattern: /오색\s*문화\s*체육\s*센터|문원\s*체육/i, ceilingM: 5.5, source: '문화체육센터 복합 평균' },
  { pattern: /수봉\s*문화\s*회관|문예\s*회관/i, ceilingM: 4.8, source: '문화·문예회관 평균' },
  { pattern: /과천\s*문화원|군포\s*문화원/i, ceilingM: 3.6, source: '문화원 강의·강당 평균' },
  { pattern: /씨네\s*파크|CINE\s*11|영화관/i, ceilingM: 5.5, source: '상영관 복합 평균' },
  { pattern: /AW\s*웨딩|빌라드\s*지디/i, ceilingM: 5.0, source: '웨딩·컨벤션홀 평균' },
  { pattern: /플레이\s*월드/i, ceilingM: 4.5, source: '실내 테마·전시시설 평균' },
  { pattern: /방문자\s*센터|도시\s*계획관/i, ceilingM: 3.8, source: '전시·방문자센터 평균' },
  { pattern: /111\s*CM/i, ceilingM: 4.2, source: '복합문화공간 천장고' }
];

const culturalSearchCache = new Map();

/**
 * 문화및집회시설 건물명으로 웹 검색 스니펫에서 천장고/층고(m) 실시간 추출 (실패 시 null 반환)
 */
async function searchCulturalCeilingHeightM(buildingName, sido = '', sigungu = '') {
  const cleanName = String(buildingName || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanName || cleanName === '없음' || cleanName.length < 2 || /^(가동|나동|\d+[,.\s]*\d*동)$/.test(cleanName)) {
    return null;
  }
  const cacheKey = `${sido}_${sigungu}_${cleanName}`;
  if (culturalSearchCache.has(cacheKey)) {
    return culturalSearchCache.get(cacheKey);
  }

  try {
    const q = encodeURIComponent(`"${cleanName}" 천장고 OR 층고`);
    const resp = await fetch(`https://search.naver.com/search.naver?where=nexearch&query=${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      signal: AbortSignal.timeout(4500)
    });
    if (resp.ok) {
      const html = await resp.text();
      const plain = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
      const ceilMatch = plain.match(/(?:천장고|천정고|천장\s*높이|전시실\s*높이)[^0-9]{0,18}(\d{1,2}(?:\.\d)?)\s*(?:m|미터)/i);
      if (ceilMatch) {
        const val = parseFloat(ceilMatch[1]);
        if (val >= 3.2 && val <= 15.0) {
          const formatted = Number(val.toFixed(1));
          culturalSearchCache.set(cacheKey, formatted);
          return formatted;
        }
      }
      const floorHMatch = plain.match(/층고[^0-9]{0,15}(\d{1,2}(?:\.\d)?)\s*(?:m|미터)/i);
      if (floorHMatch) {
        const rawFloorH = parseFloat(floorHMatch[1]);
        if (rawFloorH >= 4.0 && rawFloorH <= 18.0) {
          const estCeil = Math.max(3.4, Math.min(12.0, Number((rawFloorH * 0.82).toFixed(1))));
          culturalSearchCache.set(cacheKey, estCeil);
          return estCeil;
        }
      }
    }
  } catch (_) {
    // 네트워크 제한 또는 타임아웃 시 추정치 폴백으로 자연스럽게 이관
  }

  culturalSearchCache.set(cacheKey, null);
  return null;
}

/**
 * 건물 주용도·건물명·규모에 따른 평균 천장고(q1470, m) 결정
 * - 일반 건물: 가이드 기준 2.6~3.0m 내 건물별 분포
 * - 문화및집회시설: 1) 실측/건축 DB 매칭 ➔ 2) 실시간 웹 검색 ➔ 3) 세부 시설유형·면적별 추정치(3.5~8.0m, >3.0m 보장)
 */
export async function resolveHrcBuildingCeilingHeightM({
  slotData = {},
  basicInfoState = {},
  policy = {},
  grossAreaM2 = 0
} = {}) {
  const mainUse = String(slotData.mainUse || slotData.mainUsage || basicInfoState.mainUse || '').trim();
  const quotaCode1 = String(slotData.quotaCode1 || '').trim();
  const bldgName = String(
    slotData.sq12BuildingName || slotData.buildingName || slotData.siteBuildingName || basicInfoState.buildingName || ''
  ).replace(/\(건물명\s*없음\)/g, '').trim();
  const uidNum = parseInt(String(slotData.uid || '800001').replace(/[^0-9]/g, ''), 10) || 800001;
  const effArea = Number(grossAreaM2 || slotData.estimatedGrossAreaM2 || 4000) || 4000;

  const isCultural = mainUse.includes('문화') || quotaCode1 === '1003';
  if (!isCultural) {
    const customCeil = String(policy.ceilingHeightM || '').trim();
    if (customCeil && customCeil !== '2.8' && !isNaN(parseFloat(customCeil))) {
      return { value: String(Number(parseFloat(customCeil).toFixed(1))), source: '정책 지정값', isCultural: false };
    }
    const generalPool = ['2.6', '2.7', '2.8', '2.9', '3.0'];
    const picked = generalPool[uidNum % generalPool.length];
    return { value: picked, source: '일반건물 가이드(2.6~3.0m)', isCultural: false };
  }

  // [문화및집회시설] 1) 공식 건축·시설안내 실측 DB 우선 매칭
  for (const entry of CULTURAL_FACILITY_CEILING_DB) {
    if (entry.pattern.test(bldgName)) {
      return { value: String(entry.ceilingM), source: `문화시설 검색실측(${entry.source})`, isCultural: true };
    }
  }

  // [문화및집회시설] 2) 실시간 웹 검색 조회
  const searchedVal = await searchCulturalCeilingHeightM(bldgName, slotData.sido, slotData.sigungu);
  if (searchedVal && searchedVal > 3.0) {
    return { value: String(searchedVal), source: '문화시설 웹검색 추출', isCultural: true };
  }

  // [문화및집회시설] 3) 건물 세부 특성·연면적 기반 엔지니어링 추정치 (3m 초과 보장)
  let pool = [3.6, 3.8, 4.0, 4.2];
  if (/컨벤션|전시장|박람회|체육관|경기장|아레나|돔/.test(bldgName)) {
    pool = [6.5, 7.0, 7.5, 8.0];
  } else if (/공연|아트센터|아트리움|문화회관|문예회관|예술회관|영화관|시네마|씨네|웨딩/.test(bldgName)) {
    pool = [4.8, 5.2, 5.5, 6.0];
  } else if (/박물관|미술관|기념관|과학관|체험관|전시관|갤러리/.test(bldgName)) {
    pool = [4.0, 4.3, 4.5, 4.8];
  } else if (effArea >= 30000) {
    pool = [4.8, 5.2, 5.5, 5.8];
  } else if (effArea >= 10000) {
    pool = [4.0, 4.3, 4.5, 4.8];
  } else if (effArea >= 5000) {
    pool = [3.8, 4.0, 4.2, 4.5];
  }
  const estVal = pool[uidNum % pool.length];
  return { value: String(estVal), source: '문화시설 유형·규모별 추정치(>3.0m)', isCultural: true };
}

/**
 * 한국리서치 2025년 기준 에너지총조사 (건물 부문) 단일 슬롯 자동화 러너
 * - 핵심 원칙: 기존에 이미 입력되어 있는 항목은 보존하되, 8대 핵심 응답 규칙 문항은 규칙에 맞춰 정확히 응답
 *
 * @param {object} options
 * @param {object} options.slotData - 쿼터 슬롯 객체 (uid, surveyorId, contactName, phone, buildingName, mainUse 등)
 * @param {object} options.policy - 응답 정책 설정
 * @param {string} options.loginId - TAPI 로그인 ID (예: '700275')
 * @param {string} options.loginPw - TAPI 로그인 PW (예: '700275')
 * @param {number} options.quotaIndex - 순번
 * @param {boolean} options.pilotMode - 파일럿 모드 여부
 * @param {boolean} options.safetyGuard - 최종 완료 직전(91% q90020_r1) 정지 여부 (기본: false)
 * @param {string} options.reportDir - 스크린샷 저장 폴더
 * @param {function} options.onProgress - 진행 콜백
 */
export async function runHrcEnergySurvey(options = {}) {
  const {
    slotData = {},
    policy = {},
    loginId: rawLoginId,
    loginPw: rawLoginPw,
    quotaIndex = 1,
    safetyGuard = false,
    reportDir = null,
    onProgress = () => {}
  } = options;

  const uid = String(slotData.uid || slotData.UID || '').trim();
  if (!uid) {
    throw new Error('실행할 건물 쿼터의 UID가 없습니다.');
  }

  const loginId = String(rawLoginId || slotData.surveyorId || slotData.surveyorAccount || '700275').replace(/[^0-9]/g, '') || '700275';
  const loginPw = String(rawLoginPw || loginId).trim();
  const preserveExisting = (policy.preserveExistingInputs !== false);

  if (reportDir && !fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const capturedSteps = [];
  let browser = null;

  try {
    browser = await launchChromium({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 920 }
    });
    const page = await context.newPage();

    // 브라우저 alert/confirm 자동 수락
    page.on('dialog', async dialog => {
      try { await dialog.accept(); } catch (e) { console.warn('[Dialog accept 경고]', e.message); }
    });
    const fallbackName = String(slotData.contactName || slotData.ceoName || '관리소장').trim() || '관리소장';
    const [p1, p2, p3] = parsePhoneParts(slotData.phone || '010-7935-2414');
    let basicInfoState = {
      contactName: fallbackName,
      tel1: p1,
      tel2: p2,
      tel3: p3,
      buildingName: slotData.buildingName || '',
      roadAddress: slotData.roadAddress || '',
      jibunAddress: slotData.jibunAddress || '',
      mainUse: slotData.mainUse || slotData.mainUsage || '',
      areaScale: slotData.areaScale || ''
    };
    let rpsUrl = String(options.directRpsUrl || slotData.rpsUrl || '').trim();

    if (rpsUrl && rpsUrl.includes('rpssurvey.hrcglobal.com')) {
      onProgress({
        step: 'LOGIN',
        stepIndex: 1,
        totalSteps: 7,
        message: `[UID ${uid}] RPS 설문 URL 직접 접속 중...`
      });
      await page.goto(rpsUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await waitForRpsReady(page);
    } else {
      // 1. TAPI 로그인
      onProgress({
        step: 'LOGIN',
        stepIndex: 1,
        totalSteps: 7,
        message: `[UID ${uid}] TAPI 로그인 (${loginId}) 및 [기본정보] 페이지 접속 중...`
      });

      for (let loginAttempt = 1; loginAttempt <= 3; loginAttempt++) {
        try {
          await page.goto('https://tapi.hrcglobal.com/Home/Login', { waitUntil: 'domcontentloaded', timeout: 40000 });
          break;
        } catch (navErr) {
          if (loginAttempt === 3) throw navErr;
          await page.waitForTimeout(1500 * loginAttempt);
        }
      }
      await page.fill('input[type="text"]', loginId);
      await page.fill('input[type="password"]', loginPw);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('button[type="submit"], input[type="submit"]')
      ]);

      // 2. 조사 선택 (2026-89-0342C)
      await page.waitForSelector('a[onclick*="2026-89-0342C"]', { timeout: 15000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('a[onclick*="2026-89-0342C"]')
      ]);

      // 3. [기본정보] 페이지 진입 (AnswerInfo4)
      const answerInfoUrl = `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uid}&page=1`;
      await page.goto(answerInfoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#survey', { timeout: 15000 });
      await page.waitForTimeout(300);

      // [기본정보] 기존 입력값 보존하며 빈칸만 채우기 (문자/메일 발송 버튼 절대 클릭 금지!)
      basicInfoState = await page.evaluate(({ fallbackName, p1, p2, p3, preserveExisting }) => {
        function fillIfEmpty(sel, val) {
          const el = document.querySelector(sel);
          if (!el) return '';
          const cur = (el.value || '').trim();
          const isEmptyVal = cur === '' || cur.toUpperCase() === 'NONE' || cur === '없음';
          if (preserveExisting && !isEmptyVal) {
            return cur;
          }
          if (isEmptyVal) {
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return el.value;
        }

        const finalName = fillIfEmpty('#contact1Name', fallbackName);
        const finalP1 = fillIfEmpty('#contact1TelPrefix', p1);
        const finalP2 = fillIfEmpty('#contact1Tel2', p2);
        const finalP3 = fillIfEmpty('#contact1Tel3', p3);

        // 테이블에 표시된 건물명/도로명/지번/주용도/면적규모 추출
        const bodyText = document.body.innerText || '';
        let parsedBuildingName = '';
        let parsedRoadAddr = '';
        let parsedJibunAddr = '';
        let parsedMainUse = '';
        let parsedAreaScale = '';
        const cells = Array.from(document.querySelectorAll('th, td'));
        for (let i = 0; i < cells.length - 1; i++) {
          const label = (cells[i].innerText || '').trim();
          if (label === '건물명') {
            parsedBuildingName = (cells[i + 1]?.innerText || '').trim();
          } else if (label === '도로명') {
            parsedRoadAddr = (cells[i + 1]?.innerText || '').trim();
          } else if (label === '지번') {
            parsedJibunAddr = (cells[i + 1]?.innerText || '').trim();
          } else if (label === '주용도') {
            parsedMainUse = (cells[i + 1]?.innerText || '').trim();
          } else if (label === '면적규모') {
            parsedAreaScale = (cells[i + 1]?.innerText || '').trim();
          }
        }
        return {
          contactName: finalName || fallbackName,
          tel1: finalP1 || p1,
          tel2: finalP2 || p2,
          tel3: finalP3 || p3,
          buildingName: parsedBuildingName,
          roadAddress: parsedRoadAddr,
          jibunAddress: parsedJibunAddr,
          mainUse: parsedMainUse,
          areaScale: parsedAreaScale,
          bodySnippet: bodyText.slice(0, 600)
        };
      }, { fallbackName, p1, p2, p3, preserveExisting });

      // SQ12 건물명은 반드시 구글시트 원본(sq12BuildingName)을 보존하며 TAPI 기본정보로 덮어쓰지 않음
      if (!slotData.roadAddress && basicInfoState.roadAddress) {
        slotData.roadAddress = basicInfoState.roadAddress;
      }
      if (!slotData.jibunAddress && basicInfoState.jibunAddress) {
        slotData.jibunAddress = basicInfoState.jibunAddress;
      }
      if (!slotData.mainUse && basicInfoState.mainUse) {
        slotData.mainUse = basicInfoState.mainUse;
      }
      if (!slotData.areaScale && basicInfoState.areaScale) {
        slotData.areaScale = basicInfoState.areaScale;
      }

      logger.info(`[HRC 에너지총조사] UID=${uid} [기본정보] 확인 완료 (응답자: ${basicInfoState.contactName} / ${basicInfoState.tel1}-${basicInfoState.tel2}-${basicInfoState.tel3}, 시트건물명: ${slotData.sq12BuildingName || '없음'}, 도로명: ${slotData.roadAddress || '-'})`);
      onProgress({
        step: 'BASIC_INFO',
        stepIndex: 1,
        totalSteps: 7,
        progress: 1,
        message: `[UID ${uid}] [기본정보] (${basicInfoState.contactName} / ${basicInfoState.tel1}-${basicInfoState.tel2}-${basicInfoState.tel3}) 확인 완료 ➔ 본설문 진입 중...`
      });

      // 4. [조사하기](#survey) 클릭하여 RPS 설문 화면으로 이동
      await Promise.all([
        page.waitForURL(u => u.toString().includes('rpssurvey.hrcglobal.com'), { waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click('#survey')
      ]);
      await waitForRpsReady(page);
      rpsUrl = page.url();
    }

    logger.info(`[HRC 에너지총조사] UID=${uid} RPS 설문 진입: ${rpsUrl}`);
    onProgress({
      step: 'RPS_INIT',
      stepIndex: 2,
      totalSteps: 7,
      progress: 2,
      message: `[UID ${uid}] 본설문 진입 완료 ➔ 건물 입주업체 수 확인 및 설문 문항 진행 중...`
    });

    // 중간 문항에서 열렸을 경우 현재 문항이 유효할 때 SQ. 일반 특성(isqpart) 처음으로 이동하여 규칙 문항이 누락 없이 적용되도록 보장
    const initCheck = await extractRpsStep(page);
    if (!initCheck.isCompleted && initCheck.cv && initCheck.cv !== 'q1000') {
      const clickedNav = await page.evaluate(() => {
        const btn = document.querySelector('#qnav-bar button[onclick*="isqpart"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (clickedNav) {
        await page.waitForTimeout(800);
        await waitForRpsReady(page);
        // 만약 현재 문항 빈칸 검증으로 이동이 막힌 경우 에러 팝업만 정리하고 진행
        await page.evaluate(() => {
          const btn = document.querySelector('#MessageNo, .notipop button');
          if (btn) btn.click();
          const errEl = document.querySelector('#ErrorMessage');
          if (errEl) errEl.value = '';
          window.isRun = false;
        });
      }
    }

    // 네이버 지도에서 건물 주소의 입주업체(장소) 개수 사전 조회 (중복 조회 방지 캐시 적용)
    const triedNaverAddrs = new Set();
    let naverPlaceCount = policy.storeCount
      ? Number(policy.storeCount)
      : await fetchNaverMapPlaceCount(context, [
          basicInfoState.roadAddress || slotData.roadAddress,
          basicInfoState.jibunAddress || slotData.jibunAddress
        ], triedNaverAddrs);

    // 5. 건물별 엔지니어링 응답 플랜 및 난수 파라미터 산출
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const clampStoreCount = (rawCnt) => {
      const n = parseInt(String(rawCnt || '').replace(/[^0-9]/g, ''), 10);
      if (!n || n <= 0) return null;
      // q2250 허용 범위(1 ~ 999) 및 q2500 근로자/내방객 연쇄 곱셈 오버플로우 방지 (초대형 복합단지 최대 350개 상한)
      return Math.min(350, Math.max(1, n));
    };

    const clampedInitialStores = clampStoreCount(naverPlaceCount || policy.storeCount);
    let trackedStoreCount = String(clampedInitialStores || randInt(6, 14));
    let trackedGrossFloorArea = Number(slotData.estimatedGrossAreaM2) || 2500;
    let trackedAboveGroundFloors = 5;
    let trackedCompletionYear = 2008;

    const ceilingPlan = await resolveHrcBuildingCeilingHeightM({
      slotData,
      basicInfoState,
      policy,
      grossAreaM2: trackedGrossFloorArea
    });

    const workerMultiplier = randInt(2, 7);       // A3-3-1 상근근로자 = 점포수 × (2~7 다양하게)
    const visitorMultiplier = randInt(30, 50);    // A3-3-1 내방객 = 점포수 × (30~50)
    const c12Ratio = randInt(10, 20);             // C1-2 대표공간 면적 비율 10~20%
    const c1FloorSeed = Math.random();            // C1-1 기준층 랜덤 시드
    const c13SqmPerLed = randInt(5, 8);           // C1-3 LED 등기구 1개당 담당 면적(5~8㎡)
    const c13FlCount = randChoice([0, 0, 0, 2, 4, 6]);
    const etcElecPct = randInt(2, 6);             // D1-7 기타(pc,사무기기) 2~6% 랜덤
    const e12RoleCode = randChoice(['1', '3']);   // E1-2 1(운영, 유지, 엔지니어링) vs 3(건물 관리[운영유지]) 랜덤

    // SQ12 건물명 (구글시트에 있는 이름으로 작성, 없으면 '없음')
    const rawSq12 = (slotData.sq12BuildingName !== undefined)
      ? String(slotData.sq12BuildingName || '')
      : String(slotData.buildingName || '');
    const cleanedSq12 = rawSq12
      .replace(/\(리스트\s*건물명\s*없음\)/g, '')
      .replace(/\(건물명\s*없음\)/g, '')
      .trim();
    const sq12TargetName = (cleanedSq12 && cleanedSq12 !== '-' && !cleanedSq12.startsWith('건물_'))
      ? cleanedSq12
      : '없음';

    // 주용도 및 공공/학교 여부 판별
    const mainUseFull = String(slotData.mainUse || slotData.mainUsage || basicInfoState.mainUse || '').trim();
    const isPublicOrSchool = Boolean(slotData.isPublicOrSchool) ||
      /공공|교육|학교|관공서|도서관|청사/.test(mainUseFull) ||
      /교육|학교|공공/.test(String(slotData.expectedTypeDesc || ''));

    // A5-3 / A5-4 냉난방 설정온도: 민간(냉방 24~26℃ / 난방 20~22℃), 공공·학교(냉방 26~28℃ / 난방 18~20℃)
    const coolingTempC = isPublicOrSchool ? randInt(26, 28) : randInt(24, 26);
    const heatingTempC = isPublicOrSchool ? randInt(18, 20) : randInt(20, 22);

    // A5-6(공조) & A5-8(건물운영) 시간: 9~18시 필수 포함 + 용도별 5~9시 시작 ~ 18~21시 종료 랜덤 (A5-6 ⊆ A5-8 보장)
    let opStartHour = 8;
    let opEndHour = 19;
    if (/의료|병원|숙박|노유자|운동/.test(mainUseFull)) {
      opStartHour = randChoice([5, 6, 7]);
      opEndHour = randChoice([20, 21]);
    } else if (/판매|상업|근린|위락|문화/.test(mainUseFull)) {
      opStartHour = randChoice([6, 7, 8, 9]);
      opEndHour = randChoice([20, 21]);
    } else if (isPublicOrSchool) {
      opStartHour = randChoice([7, 8, 9]);
      opEndHour = randChoice([18, 19, 20]);
    } else {
      opStartHour = randChoice([6, 7, 8, 9]);
      opEndHour = randChoice([18, 19, 20, 21]);
    }
    const hvacStartHour = Math.min(9, Math.max(opStartHour, opStartHour + randChoice([0, 1])));
    const hvacEndHour = Math.max(18, Math.min(opEndHour, opEndHour - randChoice([0, 1])));

    // A5-1 ↔ B1-1 RPS 교차검증 정합성 보정
    const CENTRAL_B11_SET = new Set(['1', '2', '5', '6', '7', '8', '11', '12', '13', '14', '20']);
    const INDIV_B11_SET = new Set(['3', '4', '9', '10', '15', '21']);
    let effectiveB11Codes = (Array.isArray(slotData.b11Codes) && slotData.b11Codes.length > 0)
      ? Array.from(new Set(slotData.b11Codes.map(String)))
      : ['4'];
    const rawA51 = String(slotData.a51Code || '3').trim();
    if (rawA51 === '1') {
      // 시트가 '① 중앙+개별 모두 이용'인데 개별 설비 코드가 누락된 경우 보조 개별 EHP(4) 자동 보충
      if (!effectiveB11Codes.some(c => INDIV_B11_SET.has(c))) {
        effectiveB11Codes.push('4');
      }
      if (!effectiveB11Codes.some(c => CENTRAL_B11_SET.has(c))) {
        effectiveB11Codes.push('6');
      }
    }
    const hasCentralB11 = effectiveB11Codes.some(c => CENTRAL_B11_SET.has(c));
    const hasIndivB11 = effectiveB11Codes.some(c => INDIV_B11_SET.has(c));
    const effectiveA51Code = (hasCentralB11 && hasIndivB11) ? '1' : (hasCentralB11 ? '2' : '3');
    const effectiveA52Code = (effectiveA51Code === '1' || effectiveA51Code === '2') ? '1' : '3';

    // T71 신재생에너지(시트 Q열) + 비상용발전기(10 필수)
    const effectiveT71Codes = Array.from(new Set([
      ...(Array.isArray(slotData.t71Codes) ? slotData.t71Codes.map(String).filter(c => c !== '77') : []),
      '10'
    ]));

    // 계약전력(D1-2-1) 및 비상발전기 용량(계약전력의 20~40% 표준 규격 스냅)
    const contractPowerKw = Math.max(50, Number(slotData.contractPowerKw || policy.contractPowerKw || 300) || 300);
    const rawGenKw = contractPowerKw * (0.20 + Math.random() * 0.20);
    const GEN_STD_SIZES = [30, 50, 75, 100, 120, 150, 180, 200, 250, 280, 300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 2000];
    const emergencyGenKw = GEN_STD_SIZES.reduce((best, cur) =>
      Math.abs(cur - rawGenKw) < Math.abs(best - rawGenKw) ? cur : best
    , GEN_STD_SIZES[0]);

    // D4-5-1 비상용발전기 월별 경유 소비량(L) — 건물마다 시험가동 주기·용량을 다양하게 생성
    const baseTestLiters = emergencyGenKw <= 120
      ? randChoice([15, 20, 25])
      : (emergencyGenKw <= 350 ? randChoice([25, 30, 35, 40]) : randChoice([40, 50, 60]));
    const dieselPatternIdx = randInt(0, 5);
    let dieselMonthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (dieselPatternIdx === 0) {
      // 분기 정기 시운전 (3, 6, 9, 12월)
      [2, 5, 8, 11].forEach(m => { dieselMonthly[m] = baseTestLiters + randChoice([-5, 0, 5]); });
    } else if (dieselPatternIdx === 1) {
      // 분기 시운전 변형 (2, 5, 8, 11월)
      [1, 4, 7, 10].forEach(m => { dieselMonthly[m] = baseTestLiters + randChoice([-5, 0, 5]); });
    } else if (dieselPatternIdx === 2) {
      // 분기 시운전 변형 (1, 4, 7, 10월)
      [0, 3, 6, 9].forEach(m => { dieselMonthly[m] = baseTestLiters + randChoice([0, 5, 10]); });
    } else if (dieselPatternIdx === 3) {
      // 격월 점검 (2, 4, 6, 8, 10, 12월)
      [1, 3, 5, 7, 9, 11].forEach(m => { dieselMonthly[m] = Math.max(10, Math.round(baseTestLiters * 0.75) + randChoice([-3, 0, 4])); });
    } else if (dieselPatternIdx === 4) {
      // 하절기·동절기 피크 대비 집중 점검 (1, 6, 7, 8, 11, 12월)
      [0, 5, 6, 7, 10, 11].forEach(m => { dieselMonthly[m] = Math.max(10, Math.round(baseTestLiters * 0.8) + randChoice([0, 5])); });
    } else {
      // 매월 무부하 단시간 점검 (1~12월 소량 분산)
      const monthlyL = Math.max(10, Math.round(baseTestLiters * 0.5));
      dieselMonthly = Array.from({ length: 12 }, (_, idx) =>
        [0, 6, 7, 11].includes(idx) ? monthlyL + 5 : monthlyL
      );
    }

    // D2-1 도시가스 사용 여부 (시트 S열 또는 B1-1에 도시가스 설비 포함 시 '1')
    const GAS_B11_SET = new Set(['1', '2', '3', '5', '6']);
    const useCityGas = (String(slotData.d21UseGas || '') === '1') || effectiveB11Codes.some(c => GAS_B11_SET.has(c));
    const useDistrictHeat = effectiveB11Codes.some(c => c === '7' || c === '14');

    // 용도별 냉난방 부하밀도 (kW/㎡)
    const loadDensityKwPerM2 = /의료|병원/.test(mainUseFull)
      ? (0.12 + Math.random() * 0.06)
      : (/판매|상업|근린|숙박|운동|문화/.test(mainUseFull)
        ? (0.11 + Math.random() * 0.04)
        : (isPublicOrSchool ? (0.08 + Math.random() * 0.04) : (0.10 + Math.random() * 0.04)));

    const engPlan = {
      sq12TargetName,
      mainUseFull,
      isPublicOrSchool,
      workerMultiplier,
      visitorMultiplier,
      effectiveA51Code,
      effectiveA52Code,
      coolingTempC,
      heatingTempC,
      opStartHour,
      opEndHour,
      hvacStartHour,
      hvacEndHour,
      effectiveB11Codes,
      hotWaterOnlyBoiler: Boolean(slotData.hotWaterOnlyBoiler),
      loadDensityKwPerM2,
      effectiveT71Codes,
      contractPowerKw,
      emergencyGenKw,
      c12Ratio,
      c1FloorSeed,
      c13SqmPerLed,
      c13FlCount,
      etcElecPct,
      useCityGas,
      useDistrictHeat,
      dieselMonthly,
      e12RoleCode,
      ceilingHeightM: ceilingPlan.value,
      ceilingHeightSource: ceilingPlan.source,
      isCulturalFacility: ceilingPlan.isCultural,
      monthlyJitterSeed: 0.96 + Math.random() * 0.08
    };

    const ENFORCED_RULE_CVS = new Set([
      'q1300', 'q1400', 'q1700', 'q1800', 'q2250', 'q2350', 'q2450', 'q2500', 'q2550', 'q2600',
      'q2900', 'q2950', 'q3000', 'q3050',
      'q3550', 'q3600', 'q3650', 'q3700', 'q3800', 'q3950',
      'q4000', 'q4050', 'q4060', 'q4070', 'q4100',
      'q4500', 'q4700',
      'q7300', 'q7350', 'q7450', 'q7460', 'q7900', 'q7950', 'q8000', 'q8050', 'q8100',
      'q6000', 'q6250', 'q6300',
      'q6350', 'q6400', 'q6650', 'q6700',
      'q6800', 'q6850', 'q6900', 'q6920', 'q6950',
      'q7000', 'q7050', 'q7095_r1', 'q7100_r1', 'q7150_r1', 'q7200_r1', 'q7250_r1',
      'q90000', 'q90015_r1', 'q90020_r1'
    ]);
    const isEnforcedCv = (cv) => {
      const s = String(cv || '');
      return (
        ENFORCED_RULE_CVS.has(s) ||
        (s === 'q1470' && engPlan.isCulturalFacility) ||
        /^q6[89]\d{2}/.test(s) ||
        s.startsWith('q4200_r') ||
        s.startsWith('q4250_r') ||
        s.startsWith('q4300_r') ||
        s.startsWith('q4350_r') ||
        s.startsWith('q4550_r') ||
        s.startsWith('q4600_r') ||
        s.startsWith('q4650_r') ||
        s.startsWith('q6100_r') ||
        s.startsWith('q6150_r') ||
        s.startsWith('q6200_r') ||
        s.startsWith('q6500_r') ||
        s.startsWith('q6600_r') ||
        s.startsWith('q90015_r') ||
        s.startsWith('q90020_r')
      );
    };
    const stepTrace = [];
    let jumpedToStart = false;

    for (let stepIdx = 0; stepIdx < 200; stepIdx++) {
      const step = await extractRpsStep(page);
      if (step.cv === 'q1000') jumpedToStart = true;

      if (step.isCompleted) {
        if (reportDir) {
          const fileName = `step_COMPLETE_${Date.now()}.png`;
          await page.screenshot({ path: path.join(reportDir, fileName), fullPage: true }).catch(err => console.warn('[Screenshot 경고]', err.message));
          capturedSteps.push({
            step: 'COMPLETE',
            stepIndex: capturedSteps.length + 1,
            title: '100% 조사완료',
            file: fileName,
            url: `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`
          });
        }
        onProgress({
          step: 'GIFT_SIGN',
          stepIndex: 7,
          totalSteps: 7,
          progress: 98,
          message: `[UID ${uid}] 100% 조사완료! [답례품 지급] 신세계상품권 5,000원 선택 및 응답자 필체 서명 진행 중...`
        });

        let giftSignResult = null;
        try {
          giftSignResult = await signHrcEnergyGiftReceipt(page, {
            uid,
            loginId,
            loginPw,
            contactName: basicInfoState.contactName,
            fallbackName: slotData.contactName || slotData.ceoName,
            tel1: basicInfoState.tel1,
            tel2: basicInfoState.tel2,
            tel3: basicInfoState.tel3,
            rawPhone: slotData.phone,
            forcedStyleIndex: policy.signatureStyleIndex ?? null,
            reportDir,
            capturedSteps
          });
        } catch (giftErr) {
          logger.warn(`[HRC 에너지총조사] UID=${uid} 답례품 서명 처리 중 예외: ${giftErr.message}`);
          giftSignResult = { ok: false, uid, error: giftErr.message };
        }

        const giftSummaryMsg = giftSignResult?.ok
          ? ` (답례품: ${giftSignResult.giftLabel || '신세계상품권 5,000원'} / 서명: ${giftSignResult.signerName} [${giftSignResult.styleLabel || '자필서명'}])`
          : ` (답례품 서명 확인 필요: ${giftSignResult?.error || '미완료'})`;

        onProgress({
          step: 'COMPLETE',
          stepIndex: 7,
          totalSteps: 7,
          progress: 100,
          message: `[UID ${uid}] 100% 조사완료 및 답례품 지급 서명 완료!${giftSummaryMsg}`
        });
        return {
          success: true,
          status: 'completed',
          uid,
          rpsUrl,
          basicInfoState,
          giftSignResult,
          stepTrace,
          capturedSteps
        };
      }

      // q1260에서 도로명/지번 주소가 확인되었고 아직 네이버지도 장소 수를 조회하지 못한 경우 즉시 보충 조회
      if (step.cv === 'q1260' && !naverPlaceCount) {
        const roadMatch = step.text.match(/도로명\s*주소\s*:\s*([^\n\r]+?)(?=\s*지번\s*주소|$)/);
        const jibunMatch = step.text.match(/지번\s*주소\s*:\s*([^\n\r]+?)(?=\s*우편번호|\s*검색|$)/);
        const op1Addr = step.inputs.find(i => i.id === 'q1260_op1')?.value || '';
        const op4Addr = step.inputs.find(i => i.id === 'q1260_op4')?.value || '';
        const candRoad = (roadMatch ? roadMatch[1].trim() : op1Addr).trim();
        const candJibun = (jibunMatch ? jibunMatch[1].trim() : op4Addr).trim();
        if (candRoad && !basicInfoState.roadAddress) basicInfoState.roadAddress = candRoad;
        if (candJibun && !basicInfoState.jibunAddress) basicInfoState.jibunAddress = candJibun;
        naverPlaceCount = await fetchNaverMapPlaceCount(context, [candRoad, candJibun], triedNaverAddrs);
        const safeCnt1 = clampStoreCount(naverPlaceCount);
        if (safeCnt1) {
          trackedStoreCount = String(safeCnt1);
        }
      }

      // q2250 진입 시점에도 아직 네이버지도 장소 수가 없으면 한 번 더 조회 시도
      if (step.cv === 'q2250' && !naverPlaceCount) {
        naverPlaceCount = await fetchNaverMapPlaceCount(context, [
          basicInfoState.roadAddress || slotData.roadAddress,
          basicInfoState.jibunAddress || slotData.jibunAddress
        ], triedNaverAddrs);
        const safeCnt2 = clampStoreCount(naverPlaceCount);
        if (safeCnt2) {
          trackedStoreCount = String(safeCnt2);
        }
      }

      if (step.cv === 'q1460') {
        const flStr = (step.inputs.find(i => i.variable === 'q1460_op1')?.value || '').replace(/[^0-9]/g, '');
        if (flStr && parseInt(flStr, 10) > 0) trackedAboveGroundFloors = parseInt(flStr, 10);
      }
      if (step.cv === 'q1500') {
        const areaStr = (step.inputs.find(i => i.variable === 'q1500_op3')?.value || '').replace(/[^0-9.]/g, '');
        if (areaStr && parseFloat(areaStr) > 0) trackedGrossFloorArea = parseFloat(areaStr);
      }
      if (step.cv === 'q1650') {
        const yrStr = (step.inputs.find(i => i.variable === 'q1650_op1')?.value || '').replace(/[^0-9]/g, '');
        if (yrStr && parseInt(yrStr, 10) >= 1950) trackedCompletionYear = parseInt(yrStr, 10);
      }

      const activeInputs = step.inputs.filter(inp => {
        if (inp.disabled || inp.readOnly || inp.id === 'keyword') return false;
        if (inp.type === 'radio' || inp.type === 'checkbox') return true;
        return inp.visible;
      });
      // SELECT 태그(이메일 도메인 기본값 '1' 등)는 기입력 판정에서 제외
      // 다중 열/행 문항(예: q3800_1~4, q1600_1~2)의 경우 모든 variable 그룹이 응답되어 있어야 완전 기입력으로 판정
      const getGroupKey = (inp) => {
        const v = String(inp.variable || '');
        const valSuffix = `_${inp.value}`;
        if (inp.type === 'checkbox' && inp.value && v.endsWith(valSuffix)) {
          return v.slice(0, -valSuffix.length);
        }
        return v;
      };
      const textNumberInputs = activeInputs.filter(inp => inp.type !== 'radio' && inp.type !== 'checkbox' && inp.tag !== 'SELECT' && !String(inp.id).includes('op97') && !String(inp.id).includes('op91'));
      // 수치 입력창 옆에 붙는 '-8:모름', '-9:응답거절' 보조 체크박스는 수치 입력창이 함께 있을 경우 일반 객관식 그룹 판정에서 제외
      const checkRadioInputs = activeInputs.filter(inp => {
        if ((inp.type !== 'radio' && inp.type !== 'checkbox') || !inp.variable) return false;
        if (textNumberInputs.length > 0 && (String(inp.value).startsWith('-8') || String(inp.value).startsWith('-9'))) {
          return false;
        }
        return true;
      });
      const checkRadioVarGroups = Array.from(new Set(checkRadioInputs.map(inp => getGroupKey(inp))));

      const isMixedNumericComplete = () => {
        if (step.cv === 'q1500') {
          return ['1', '2', '3'].every(k => {
            const opVal = (step.inputs.find(i => i.variable === `q1500_op${k}`)?.value || '').trim();
            const dkChecked = step.inputs.some(i => i.variable === `q1500_${k}` && i.checked);
            return (opVal !== '' && opVal !== '0') || dkChecked;
          });
        }
        if (step.cv === 'q1460') {
          const op1Val = (step.inputs.find(i => i.variable === 'q1460_op1')?.value || '').trim();
          const op2Val = (step.inputs.find(i => i.variable === 'q1460_op2')?.value || '').trim();
          const dk1 = step.inputs.some(i => i.variable === 'q1460_1' && i.checked);
          const dk2 = step.inputs.some(i => i.variable === 'q1460_2' && i.checked);
          return ((op1Val !== '' && op1Val !== '0') || dk1) && (op2Val !== '' || dk2);
        }
        if (step.cv === 'q1650') {
          const op1Val = (step.inputs.find(i => i.variable === 'q1650_op1')?.value || '').trim();
          const op2Val = (step.inputs.find(i => i.variable === 'q1650_op2')?.value || '').trim();
          const dk1 = step.inputs.some(i => i.variable === 'q1650_1' && i.checked);
          const dk2 = step.inputs.some(i => i.variable === 'q1650_2' && i.checked);
          return ((op1Val !== '' && op1Val !== '0') || dk1) && ((op2Val !== '' && op2Val !== '0') || dk2);
        }
        if (step.cv === 'q2350') {
          const dk1 = step.inputs.some(i => i.variable === 'q2350_1' && i.checked);
          const dk2 = step.inputs.some(i => i.variable === 'q2350_2' && i.checked);
          return dk1 && dk2;
        }
        return textNumberInputs.length > 0 && textNumberInputs.every(inp => inp.value !== '' && inp.value !== null);
      };

      const hasExistingAnswer = preserveExisting && !isEnforcedCv(step.cv) && (
        step.cv === 'q1260'
          ? step.q1260Filled
          : (
              checkRadioVarGroups.length > 0
                ? checkRadioVarGroups.every(g => checkRadioInputs.some(inp => getGroupKey(inp) === g && inp.checked))
                : isMixedNumericComplete()
            )
      );

      const pctNum = parseInt(String(step.pct).replace(/[^0-9]/g, ''), 10) || 0;
      onProgress({
        step: step.cv || `STEP_${stepIdx}`,
        stepIndex: Math.min(6, Math.max(2, Math.ceil((pctNum / 100) * 6))),
        totalSteps: 7,
        progress: pctNum,
        message: `[UID ${uid}] (${step.pct || '진행중'}) 문항 ${step.cv} 처리 중...`
      });

      let actionDesc = 'none';
      if (step.cv !== 'q1260' && !isEnforcedCv(step.cv) && (activeInputs.length === 0 || hasExistingAnswer)) {
        actionDesc = activeInputs.length === 0 ? 'info_screen' : 'preserve_existing_input';
      } else if (step.cv === 'q1260' && hasExistingAnswer) {
        actionDesc = 'preserve_existing_input (q1260)';
      } else {
        actionDesc = await page.evaluate(async ({
          cv,
          text,
          slotData,
          basicInfoState,
          policy,
          preserveExisting,
          trackedStoreCount,
          trackedGrossFloorArea,
          trackedAboveGroundFloors,
          trackedCompletionYear,
          engPlan
        }) => {
          function clickEl(el) {
            if (!el) return false;
            if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) {
              el.click();
              return true;
            }
            return false;
          }

          function uncheckEl(el) {
            if (!el) return false;
            if (el.type === 'checkbox' && el.checked) {
              el.click();
              return true;
            }
            return false;
          }

          function normalizeValForInput(el, rawVal) {
            const strVal = String(rawVal ?? '').trim();
            if (!el || strVal === '') return strVal;
            const ph = (el.getAttribute('placeholder') || '').trim();
            const ptLenAttr = el.getAttribute('pointlength');
            const rangeMatch = ph.match(/^(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)$/);
            const isNumericInput = el.getAttribute('opendatatype')?.startsWith('numeric') || rangeMatch || ptLenAttr !== null;
            if (!isNumericInput) return strVal;

            const cleanNum = parseFloat(strVal.replace(/,/g, ''));
            if (isNaN(cleanNum)) return strVal;

            let clamped = cleanNum;
            if (rangeMatch) {
              const minV = parseFloat(rangeMatch[1]);
              const maxV = parseFloat(rangeMatch[2]);
              if (!isNaN(minV)) clamped = Math.max(minV, clamped);
              if (!isNaN(maxV)) clamped = Math.min(maxV, clamped);
            }
            const ptLen = ptLenAttr !== null ? parseInt(ptLenAttr, 10) : null;
            if (ptLen === 0) {
              return String(Math.round(clamped));
            }
            if (ptLen !== null && !isNaN(ptLen) && ptLen > 0) {
              return String(Number(clamped.toFixed(ptLen)));
            }
            return String(clamped);
          }

          function setVal(el, val, allowEnable = false, forceOverwrite = false) {
            if (!el) return false;
            if (el.readOnly) {
              if (allowEnable) el.readOnly = false;
              else return false;
            }
            if (el.disabled) {
              if (allowEnable) el.disabled = false;
              else return false;
            }
            if (!forceOverwrite && preserveExisting && (el.value || '').trim() !== '') {
              return false; // 기입력 값 보존
            }
            const finalStr = normalizeValForInput(el, val);
            el.value = finalStr;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: '0', code: 'Digit0', keyCode: 48, which: 48, bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }

          // --- [SQ 파트] ---
          if (cv === 'q1000') {
            clickEl(document.querySelector('input[variable="q1000"][value="1"], #q1000_1'));
            return 'q1000: 1(조사원)';
          }
          if (cv === 'q1260') {
            const infoTxt = document.querySelector('.info_txt')?.innerText || '';
            const roadMatch = infoTxt.match(/도로명\s*주소\s*:\s*([^\n\r]+)/);
            const jibunMatch = infoTxt.match(/지번\s*주소\s*:\s*([^\n\r]+)/);
            const roadAddr = (roadMatch ? roadMatch[1].trim() : (slotData.roadAddress || '')).trim();
            const jibunAddr = (jibunMatch ? jibunMatch[1].trim() : '').trim();

            if (document.formAPIDiv && typeof window.searchDivButton === 'function' && (roadAddr || jibunAddr)) {
              document.formAPIDiv.keyword.value = roadAddr || jibunAddr;
              window.searchDivButton();
              for (let w = 0; w < 12; w++) {
                await new Promise(r => setTimeout(r, 250));
                const firstLink = document.querySelector('#listDiv a');
                if (firstLink) {
                  const href = firstLink.getAttribute('href') || '';
                  if (href.startsWith('javascript:')) {
                    eval(href.replace(/^javascript:/i, ''));
                  } else {
                    firstLink.click();
                  }
                  break;
                }
              }
            }
            if (!document.querySelector('#q1260_op9')?.value && typeof window.openApiDivCallBack === 'function') {
              window.openApiDivCallBack(
                roadAddr || jibunAddr,
                roadAddr || jibunAddr,
                '',
                '',
                jibunAddr || roadAddr,
                '01682',
                '1135010500',
                '',
                '',
                '',
                slotData.sido || '서울특별시',
                slotData.sigungu || '노원구',
                ''
              );
            }
            return `q1260: 주소검색 완료 (${document.querySelector('#q1260_op9')?.value || roadAddr})`;
          }
          // [SQ12] 구글 시트에 있는 건물명으로 작성, 없는 경우 '없음'
          if (cv === 'q1300') {
            const targetBldgName = engPlan.sq12TargetName || '없음';
            setVal(document.querySelector('input[variable="q1300_op1"], #OpenList_q1300_op1_'), targetBldgName, true, true);
            return `q1300: 건물명칭 입력 (${targetBldgName})`;
          }
          if (cv === 'q1350') {
            const infoTxt = document.querySelector('.info_txt')?.innerText || text;
            const useMatch = infoTxt.match(/주용도\s*:\s*([^\n\r]+)/);
            const targetUse = (useMatch ? useMatch[1].trim() : (slotData.mainUse || slotData.mainUsage || '')).trim();
            const radios = Array.from(document.querySelectorAll('input[variable="q1350"]'));
            let matchedRadio = radios.find(r => {
              const lbl = (r.closest('tr')?.innerText || r.closest('label')?.innerText || r.parentElement?.innerText || '').trim();
              return targetUse && lbl.includes(targetUse);
            });
            if (!matchedRadio) {
              matchedRadio = radios[0];
            }
            clickEl(matchedRadio);
            return `q1350: 주용도 선택 (${matchedRadio?.value || '1'} - ${targetUse || '기본'})`;
          }
          // [SQ14] 부용도 없음(77) 100% 응답
          if (cv === 'q1400') {
            const noneRadio = document.querySelector('#q1400_77, input[variable="q1400"][value="77"]') ||
              Array.from(document.querySelectorAll('input[variable="q1400"]')).find(r => {
                const lbl = (r.closest('tr')?.innerText || r.closest('label')?.innerText || r.parentElement?.innerText || '').trim();
                return r.value === '77' || lbl.includes('부용도 없음') || lbl.includes('없음');
              });
            clickEl(noneRadio);
            return `q1400: 부용도 없음 (${noneRadio?.value || '77'}) 100% 응답`;
          }

          // --- [A. 건물 현황 파트] ---
          if (cv === 'q1450') {
            clickEl(document.querySelector('input[variable="q1450"][value="1"], #q1450_1'));
            return 'q1450: 1(주건물)';
          }
          if (cv === 'q1460') {
            const op1 = document.querySelector('input[variable="q1460_op1"]');
            const op2 = document.querySelector('input[variable="q1460_op2"]');
            const dk1 = document.querySelector('input[variable="q1460_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1460_2"]:checked');
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              op1.value = '';
              setVal(op1, '5');
            }
            if (op2 && !dk2 && op2.value.trim() === '') {
              setVal(op2, '1');
            }
            return `q1460: 층수 확인 (지상=${op1?.value}, 지하=${op2?.value})`;
          }
          if (cv === 'q1470') {
            const ceilEl = document.querySelector('input[variable="q1470_op1"], #OpenList_q1470_op1_');
            const targetCeil = engPlan.ceilingHeightM || policy.ceilingHeightM || '2.8';
            const curNum = parseFloat(String(ceilEl?.value || '').replace(/,/g, ''));
            // 문화및집회시설이면서 기존 입력값이 없거나 3.0m 이하 기본값으로 들어간 경우 검색/추정치(>3.0m)로 갱신
            const forceCultural = Boolean(engPlan.isCulturalFacility && (isNaN(curNum) || curNum <= 3.0));
            setVal(ceilEl, targetCeil, true, forceCultural);
            return `q1470: 천장고 ${ceilEl?.value || targetCeil}m (${engPlan.ceilingHeightSource || '가이드'})`;
          }
          if (cv === 'q1500') {
            const op1 = document.querySelector('input[variable="q1500_op1"]');
            const op2 = document.querySelector('input[variable="q1500_op2"]');
            const op3 = document.querySelector('input[variable="q1500_op3"]');
            const dk1 = document.querySelector('input[variable="q1500_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1500_2"]:checked');
            const dk3 = document.querySelector('input[variable="q1500_3"]:checked');
            const fallbackArea = String(Math.max(500, Math.round(trackedGrossFloorArea || 1500)));
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              const btn1 = document.querySelector('#q1500_1_1, input[variable="q1500_1"][value^="-8"]');
              if (btn1) clickEl(btn1);
              else { op1.value = ''; setVal(op1, '500'); }
            }
            if (op2 && !dk2 && (!op2.value || op2.value.trim() === '0')) {
              const btn2 = document.querySelector('#q1500_2_1, input[variable="q1500_2"][value^="-8"]');
              if (btn2) clickEl(btn2);
              else { op2.value = ''; setVal(op2, '300'); }
            }
            if (op3 && !dk3 && (!op3.value || op3.value.trim() === '0')) {
              op3.value = '';
              setVal(op3, fallbackArea);
            }
            return `q1500: 면적 확인 (대지=${op1?.value || '모름'}, 건축=${op2?.value || '모름'}, 연면적=${op3?.value})`;
          }
          if (cv === 'q1550') {
            const code = policy.hvacAreaRatioCode || '7';
            clickEl(document.querySelector(`input[variable="q1550"][value="${code}"], #q1550_${code}`));
            return `q1550: 냉난방 면적 비율 ${code}`;
          }
          if (cv === 'q1600') {
            const winCode = policy.windowRatioCode || '4';
            const doorCode = policy.entranceDoorCode || '3';
            clickEl(document.querySelector(`input[variable="q1600_1"][value="${winCode}"], #q1600_1_${winCode}`));
            clickEl(document.querySelector(`input[variable="q1600_2"][value="${doorCode}"], #q1600_2_${doorCode}`));
            return `q1600: 창면적비 ${winCode}, 문형태 ${doorCode}`;
          }
          if (cv === 'q1650') {
            const op1 = document.querySelector('input[variable="q1650_op1"]');
            const op2 = document.querySelector('input[variable="q1650_op2"]');
            const dk1 = document.querySelector('input[variable="q1650_1"]:checked');
            const dk2 = document.querySelector('input[variable="q1650_2"]:checked');
            if (op1 && !dk1 && (!op1.value || op1.value.trim() === '0')) {
              const btn1 = document.querySelector('#q1650_1_1, input[variable="q1650_1"][value^="-8"]');
              if (btn1) clickEl(btn1);
              else { op1.value = ''; setVal(op1, '2008'); }
            }
            if (op2 && !dk2 && (!op2.value || op2.value.trim() === '0')) {
              const btn2 = document.querySelector('#q1650_2_1, input[variable="q1650_2"][value^="-8"]');
              if (btn2) clickEl(btn2);
              else { op2.value = ''; setVal(op2, '6'); }
            }
            return `q1650: 준공연월 확인 (연도=${op1?.value || '모름'}, 월=${op2?.value || '모름'})`;
          }
          // [A1-9] 건축물대장 승강기수(승용,비상용 합계)에 맞춰 응답
          if (cv === 'q1700') {
            const infoTxt = document.querySelector('.info_txt')?.innerText || text;
            const m = infoTxt.match(/승강기수[^:：]*[:：]\s*(\d+)/);
            const elevCount = m ? parseInt(m[1], 10) : 0;
            if (elevCount >= 20) {
              clickEl(document.querySelector('input[variable="q1700"][value="3"], #q1700_3'));
              setVal(document.querySelector('input[variable="q1700_op3"], #OpenList_q1700_op3_'), String(elevCount), true, true);
              return `q1700: 건축물대장 승강기수 매칭 (${elevCount}대 - 20대 이상)`;
            } else if (elevCount > 0) {
              clickEl(document.querySelector('input[variable="q1700"][value="2"], #q1700_2'));
              setVal(document.querySelector('input[variable="q1700_op2"], #OpenList_q1700_op2_'), String(elevCount), true, true);
              return `q1700: 건축물대장 승강기수 매칭 (${elevCount}대)`;
            } else {
              clickEl(document.querySelector('input[variable="q1700"][value="1"], #q1700_1'));
              return 'q1700: 건축물대장 승강기수 0대 ➔ 엘리베이터 없음(1)';
            }
          }
          if (cv === 'q1750') {
            clickEl(document.querySelector('input[variable="q1750"][value="1"], #q1750_1'));
            return 'q1750: 에스컬레이터 없음(1)';
          }
          // [A1-10] 건축물 면적규모 10,000미만 ➔ 4~11인승(1), 10,000이상 ➔ 12~14인승(2)
          if (cv === 'q1800') {
            const scaleStr = String(slotData.areaScale || basicInfoState.areaScale || '').trim();
            const qCode2 = String(slotData.quotaCode2 || '').trim();
            const isOver10000 =
              ['1003', '1004', '1005'].includes(qCode2) ||
              scaleStr.includes('10,000-') ||
              scaleStr.includes('30,000') ||
              scaleStr.includes('50,000') ||
              scaleStr.includes('10000') ||
              trackedGrossFloorArea >= 10000;
            const targetCode = isOver10000 ? '2' : '1';
            ['1', '2', '3', '4'].forEach(code => {
              const chk = document.querySelector(`#q1800_${code}, input[variable="q1800_${code}"], input[variable="q1800"][value="${code}"]`);
              if (code === targetCode) clickEl(chk);
              else uncheckEl(chk);
            });
            return `q1800: 면적규모(${scaleStr || trackedGrossFloorArea || '기본'}) ➔ ${targetCode === '2' ? '12~14인승(2)' : '4~11인승(1)'}`;
          }
          if (cv === 'q1850') {
            clickEl(document.querySelector('input[variable="q1850"][value="2"], #q1850_2'));
            return 'q1850: 동력회수장치 아니요(2)';
          }
          if (cv === 'q1900') {
            clickEl(document.querySelector('input[variable="q1900"][value="4"], #q1900_4'));
            return 'q1900: 개보수 안함(4)';
          }
          // [A3-1-1] 네이버지도 주소 검색 입주업체(장소) 개수 입력
          if (cv === 'q2250') {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
            setVal(document.querySelector('input[variable="q2250_op1"], #OpenList_q2250_op1_'), trackedStoreCount, true, true);
            return `q2250: 네이버지도 입주업체 수(${trackedStoreCount}개) 입력`;
          }
          if (cv === 'q2300') {
            clickEl(document.querySelector('input[variable="q2300"][value="1"], #q2300_1'));
            return 'q2300: 점포 개수로 응답(1)';
          }
          // [A3-1-2] 건물 소유주 이용 + 건물 세입자 모두 '모름' 응답
          if (cv === 'q2350') {
            const dk1 = document.querySelector('#q2350_1_1, input[variable="q2350_1"][value^="-8"]');
            const dk2 = document.querySelector('#q2350_2_1, input[variable="q2350_2"][value^="-8"]');
            clickEl(dk1);
            clickEl(dk2);
            return 'q2350: 건물 소유주 이용(모름) + 건물 세입자(모름) 응답';
          }
          // [A3-2] 소유주가 고용한 시설관리 용역업체에서 관리(3) 100% 응답
          if (cv === 'q2450') {
            ['1', '2', '3', '4'].forEach(code => {
              const chk = document.querySelector(`#q2450_${code}, input[variable="q2450_${code}"], input[variable="q2450"][value="${code}"]`);
              if (code === '3') clickEl(chk);
              else uncheckEl(chk);
            });
            return 'q2450: 소유주가 고용한 시설관리 용역업체에서 관리(3) 100% 응답';
          }
          // [A3-3-1] 상근 근로자 = A3-1-1 점포수 × (2~7 다양하게), 1일 내방객 = 점포수 × (30~50명)
          if (cv === 'q2500') {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
            const storeNum = Math.max(1, parseInt(String(trackedStoreCount).replace(/[^0-9]/g, ''), 10) || 10);
            const wMult = engPlan.workerMultiplier || 3;
            const vMult = engPlan.visitorMultiplier || 35;
            const workerVal = String(storeNum * wMult);
            const visitorVal = String(storeNum * vMult);
            setVal(document.querySelector('input[variable="q2500_op1"], #OpenList_q2500_op1_'), workerVal, true, true);
            setVal(document.querySelector('input[variable="q2500_op2"], #OpenList_q2500_op2_'), visitorVal, true, true);
            return `q2500: 상근근로자 ${workerVal}명(${storeNum}×${wMult}), 1일 내방객 ${visitorVal}명(${storeNum}×${vMult})`;
          }
          // [T32] 의료시설일 경우 '의료시설'(1), 그 외 '해당사항 없음'(77)
          if (cv === 'q2550') {
            const mainUseStr = String(slotData.mainUse || slotData.mainUsage || basicInfoState.mainUse || '').trim();
            const isMedical = mainUseStr.includes('의료');
            const targetCode = isMedical ? '1' : '77';
            ['1', '2', '3', '77'].forEach(code => {
              const chk = document.querySelector(`#q2550_${code}, input[variable="q2550_${code}"], input[variable="q2550"][value="${code}"]`);
              if (code === targetCode) clickEl(chk);
              else uncheckEl(chk);
            });
            return `q2550: 주용도(${mainUseStr || '일반'}) ➔ ${isMedical ? '의료시설(1)' : '해당사항 없음(77)'}`;
          }
          if (cv === 'q2600') {
            const dkBtn = document.querySelector('#q2600_-8, input[variable="q2600_-8"][value^="-8"]');
            if (dkBtn) {
              clickEl(dkBtn);
              return 'q2600: 의료시설 허가병상 수 모름(-8)';
            }
            setVal(document.querySelector('#OpenList_q2600_op1_, input[variable="q2600_op1"]'), '50', true, true);
            return 'q2600: 의료시설 허가병상 수 50개';
          }
          // [T41] 쿼터별 입점시설 가이드(t41Codes: 1 식음료, 2 판매, 10 방재실, 77 해당없음) 적용
          if (cv === 'q2900') {
            const rawCodes = Array.isArray(slotData.t41Codes) && slotData.t41Codes.length > 0
              ? slotData.t41Codes.map(String)
              : (Array.isArray(policy.t41DefaultCodes) && policy.t41DefaultCodes.length > 0 ? policy.t41DefaultCodes.map(String) : null);
            const allCodeList = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '77'];
            if (rawCodes && rawCodes.length > 0) {
              const targetSet = new Set(rawCodes.includes('77') ? ['77'] : rawCodes);
              if (targetSet.has('77')) {
                allCodeList.filter(c => c !== '77').forEach(code => {
                  uncheckEl(document.querySelector(`#q2900_${code}, input[variable="q2900_${code}"], input[variable="q2900"][value="${code}"]`));
                });
                clickEl(document.querySelector('#q2900_77, input[variable="q2900_77"], input[variable="q2900"][value="77"]'));
              } else {
                uncheckEl(document.querySelector('#q2900_77, input[variable="q2900_77"], input[variable="q2900"][value="77"]'));
                allCodeList.filter(c => c !== '77').forEach(code => {
                  const chk = document.querySelector(`#q2900_${code}, input[variable="q2900_${code}"], input[variable="q2900"][value="${code}"]`);
                  if (targetSet.has(code)) clickEl(chk);
                  else uncheckEl(chk);
                });
              }
              return `q2900: 쿼터별 T41 가이드 적용 (${Array.from(targetSet).join(',')})`;
            }
            uncheckEl(document.querySelector('#q2900_77, input[variable="q2900_77"], input[variable="q2900"][value="77"]'));
            allCodeList.filter(c => c !== '1' && c !== '2' && c !== '77').forEach(code => {
              uncheckEl(document.querySelector(`#q2900_${code}, input[variable="q2900_${code}"], input[variable="q2900"][value="${code}"]`));
            });
            ['1', '2'].forEach(code => {
              clickEl(document.querySelector(`#q2900_${code}, input[variable="q2900_${code}"], input[variable="q2900"][value="${code}"]`));
            });
            return 'q2900: 기본 입점시설 선택 (1:식음료시설, 2:판매시설)';
          }
          if (cv === 'q2950') {
            clickEl(document.querySelector('#q2950_2, input[variable="q2950"][value="2"]') || document.querySelector('#q2950_1, input[variable="q2950"][value="1"]'));
            return 'q2950: 점유면적으로 응답 가능(2) 선택 (➔ A4-2 진입)';
          }
          // [A4-2] 모든 입점시설 점유면적 '응답거절'(-9) 체크
          if (cv === 'q3050' || cv === 'q3000') {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => {
              if (String(chk.value).startsWith('-8')) {
                uncheckEl(chk);
              }
            });
            const refuseBoxes = Array.from(document.querySelectorAll('#QuestionView input[type="checkbox"]')).filter(chk =>
              String(chk.value).startsWith('-9') || (chk.closest('label')?.innerText || '').includes('응답거절')
            );
            refuseBoxes.forEach(chk => clickEl(chk));
            return `${cv}: 모든 입점시설 점유면적 '응답거절'(-9) 체크 (${refuseBoxes.length}개 시설)`;
          }
          if (cv === 'q3450') {
            clickEl(document.querySelector('input[variable="q3450"][value="2"], #q3450_2'));
            return 'q3450: 클라우드 이용안함(2)';
          }

          // [A5-1] 냉난방 이용방식 (구글 시트 + B1-1 정합성 동기화: 1 중앙+개별, 2 중앙, 3 개별)
          if (cv === 'q3550') {
            const a51 = engPlan.effectiveA51Code || '3';
            clickEl(document.querySelector(`input[variable="q3550"][value="${a51}"], #q3550_${a51}`));
            return `q3550: 이용방식 ${a51 === '1' ? '중앙+개별 모두 이용(1)' : (a51 === '2' ? '중앙방식(2)' : '개별방식(3)')}`;
          }
          // [A5-2] ① 중앙+개별 / ② 중앙방식 ➔ ① 중앙에서 공조온도조절(1), ③ 개별방식 ➔ ③ 통제하지 않음(3)
          if (cv === 'q3600') {
            const a52 = engPlan.effectiveA52Code || '3';
            clickEl(document.querySelector(`input[variable="q3600"][value="${a52}"], #q3600_${a52}`));
            return `q3600: 공조온도 통제 ${a52 === '1' ? '중앙에서 공조온도조절(1)' : '통제하지 않음(3)'}`;
          }
          // [A5-3 중앙 설정온도 & A5-4 개별 설정온도] 민간(냉방 24~26℃, 난방 20~22℃) / 공공·학교(냉방 26~28℃, 난방 18~20℃)
          if (cv === 'q3650' || cv === 'q3700') {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
            const coolVal = String(engPlan.coolingTempC || 25);
            const heatVal = String(engPlan.heatingTempC || 21);
            setVal(document.querySelector(`input[variable="${cv}_op1"], #OpenList_${cv}_op1_`), coolVal, true, true);
            setVal(document.querySelector(`input[variable="${cv}_op2"], #OpenList_${cv}_op2_`), heatVal, true, true);
            return `${cv}: 설정온도 냉방 ${coolVal}℃, 난방 ${heatVal}℃ (${engPlan.isPublicOrSchool ? '공공·학교' : '민간'})`;
          }
          if (cv === 'q3750') {
            ['6', '7', '8', '9'].forEach(m => clickEl(document.querySelector(`input[variable="q3750_1"][value="${m}"], #q3750_1_${m}`)));
            ['1', '2', '3', '11', '12'].forEach(m => clickEl(document.querySelector(`input[variable="q3750_2"][value="${m}"], #q3750_2_${m}`)));
            return 'q3750: 냉방(6~9월), 난방(1~3,11~12월)';
          }
          // [A5-6] 공조 가동시간 (9~18시 필수 포함 + 용도별 시작/종료 확장, A5-8 건물운영시간 범위 내 보장)
          if (cv === 'q3800') {
            const startH = Math.min(9, engPlan.hvacStartHour || 8);
            const endH = Math.max(18, engPlan.hvacEndHour || 19);
            for (const col of ['1', '2', '3', '4']) {
              const colEls = Array.from(document.querySelectorAll(`input[variable="q3800_${col}"]`)).filter(el => !el.disabled);
              if (colEls.length === 0) continue;
              // 먼저 '운영 안함'(77) 및 '9시-18시 일괄'(25)이 기존에 켜져 있을 때만 해제 ('24:전체선택/해제'는 절대 건드리지 않음)
              colEls.filter(el => el.value === '77' || el.value === '25').forEach(el => uncheckEl(el));
              const hourBoxes = colEls.filter(el => {
                const n = parseInt(el.value, 10);
                return !Number.isNaN(n) && n >= 0 && n <= 23;
              });
              if (hourBoxes.length >= 10) {
                hourBoxes.forEach(el => {
                  const n = parseInt(el.value, 10);
                  if (n >= startH && n <= endH) clickEl(el);
                  else uncheckEl(el);
                });
              } else {
                const preset = colEls.find(el => el.value === '25' || el.getAttribute('codelabel') === '25') || colEls[0];
                if (preset) clickEl(preset);
              }
            }
            return `q3800: 공조 가동시간 ${startH}~${endH}시 (9~18시 포함)`;
          }
          if (cv === 'q3900') {
            setVal(document.querySelector('input[variable="q3900_op1"]'), policy.weekdayDays || '5');
            setVal(document.querySelector('input[variable="q3900_op2"]'), policy.weekendDays || '2');
            return 'q3900: 주중 5일, 주말 2일';
          }
          // [A5-8] 건물 운영시간 (9~18시 필수 포함 + 용도별 5~9시 시작 ~ 18~21시 종료 랜덤)
          if (cv === 'q3950') {
            const startH = Math.min(9, engPlan.opStartHour || 8);
            const endH = Math.max(18, engPlan.opEndHour || 19);
            for (const col of ['1', '2', '3', '4']) {
              const colEls = Array.from(document.querySelectorAll(`input[variable="q3950_${col}"]`)).filter(el => !el.disabled);
              if (colEls.length === 0) continue;
              colEls.filter(el => el.value === '77' || el.value === '25').forEach(el => uncheckEl(el));
              const hourBoxes = colEls.filter(el => {
                const n = parseInt(el.value, 10);
                return !Number.isNaN(n) && n >= 0 && n <= 23;
              });
              if (hourBoxes.length >= 10) {
                hourBoxes.forEach(el => {
                  const n = parseInt(el.value, 10);
                  if (n >= startH && n <= endH) clickEl(el);
                  else uncheckEl(el);
                });
              } else {
                const preset = colEls.find(el => el.value === '25' || el.getAttribute('codelabel') === '25') || colEls[0];
                if (preset) clickEl(preset);
              }
            }
            return `q3950: 건물 운영시간 ${startH}~${endH}시 (9~18시 포함)`;
          }

          // --- [B. 에너지 설비 현황 파트] ---
          // [B1-1] 구글 시트 냉난방 설비현황 적용 (A5-1 정합성 검증 완료된 effectiveB11Codes)
          if (cv === 'q4000') {
            const targetSet = new Set((engPlan.effectiveB11Codes || ['4']).map(String));
            const allB11List = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '20', '21', '77'];
            allB11List.forEach(code => {
              const chk = document.querySelector(`#q4000_${code}, input[variable="q4000_${code}"], input[variable="q4000"][value="${code}"]`);
              if (targetSet.has(code)) clickEl(chk);
              else uncheckEl(chk);
            });
            return `q4000: B1-1 설비현황 적용 (${Array.from(targetSet).join(',')})`;
          }
          // [B1-1 부속] 터보/스크류 냉동기 등 빙축열·수축열 해당 여부 (q4050~q4100) ➔ 아니요(2)
          if (cv === 'q4050' || cv === 'q4060' || cv === 'q4070' || cv === 'q4100') {
            clickEl(document.querySelector(`#${cv}_2, input[variable="${cv}"][value="2"]`) || document.querySelector(`#QuestionView input[type="radio"]`));
            return `${cv}: 축열설비 해당 여부 아니요(2)`;
          }
          // [B1-N-2] 설비별 주로 쓰는 표준 용량단위 선택
          // 1,11,12,13,14 -> 6(USRT) / 5 -> 1(t/h) / 6,7,10 -> 2(kcal/h) / 2,3,4,8,9,15,20,21 -> 4(kW)
          if (cv.startsWith('q4200_r')) {
            const eqNum = cv.replace('q4200_r', '');
            const unitMap = {
              '1': '6', '11': '6', '12': '6', '13': '6', '14': '6',
              '5': '1',
              '6': '2', '7': '2', '10': '2',
              '2': '4', '3': '4', '4': '4', '8': '4', '9': '4', '15': '4', '20': '4', '21': '4'
            };
            const targetUnit = unitMap[eqNum] || '4';
            const unitRadio =
              document.querySelector(`#${cv}_${targetUnit}, input[variable="${cv}"][value="${targetUnit}"]`) ||
              document.querySelector(`#${cv}_4, input[variable="${cv}"][value="4"]`) ||
              document.querySelector('#QuestionView input[type="radio"]:not(:disabled)');
            clickEl(unitRadio);
            return `${cv}: 표준 용량단위 선택(${unitRadio?.value || targetUnit})`;
          }
          // [B1-N-3] 건물 연면적·공조비율·용도별 부하밀도 기반 설비 총용량 산출 및 허용범위(1~9,999,999) 안전 스냅
          if (cv.startsWith('q4250_r')) {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
            const eqNum = cv.replace('q4250_r', '');
            const grossArea = Math.max(300, Number(trackedGrossFloorArea) || 2500);
            // 초대형 복합·오피스 빌딩(지하 다층 주차장 포함)은 비공조 지하주차장 비중(35~50%)을 반영하여 과대산출 방지
            const conditionedRatio = grossArea >= 80000 ? 0.50 : (grossArea >= 30000 ? 0.58 : 0.80);
            const conditionedArea = grossArea * conditionedRatio;
            const b11List = (engPlan.effectiveB11Codes || ['4']).map(String);
            const centralSet = new Set(['1', '2', '5', '6', '7', '8', '11', '12', '13', '14', '20']);
            const hasBothTypes = b11List.some(c => centralSet.has(c)) && b11List.some(c => !centralSet.has(c));
            const shareFactor = hasBothTypes
              ? (centralSet.has(eqNum) ? 0.80 : 0.35)
              : 1.0;
            const equipKw = Math.max(15, conditionedArea * (engPlan.loadDensityKwPerM2 || 0.13) * shareFactor);

            let capVal = '100';
            let unitLabel = 'kW';
            if (['1', '11', '12', '13', '14'].includes(eqNum)) {
              // USRT (1 USRT ≈ 3.517 kW)
              const rawUsrt = equipKw / 3.517;
              const stdUsrt = [20, 30, 40, 50, 60, 75, 80, 100, 120, 150, 180, 200, 250, 300, 350, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000];
              const snapped = stdUsrt.reduce((b, c) => (Math.abs(c - rawUsrt) < Math.abs(b - rawUsrt) ? c : b), stdUsrt[0]);
              capVal = String(snapped);
              unitLabel = 'USRT';
            } else if (eqNum === '5') {
              // 증기보일러 t/h (1 t/h ≈ 628 kW)
              const rawTh = Math.max(1, Math.round(equipKw / 628));
              const stdTh = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
              const snapped = stdTh.reduce((b, c) => (Math.abs(c - rawTh) < Math.abs(b - rawTh) ? c : b), stdTh[0]);
              capVal = String(snapped);
              unitLabel = 't/h';
            } else if (['6', '7', '10'].includes(eqNum)) {
              // 온수보일러·지역난방·온풍기 kcal/h (1 kW ≈ 860 kcal/h, RPS 입력 상한 1~9,999,999 엄수)
              const heatingFactor = grossArea >= 50000 ? 0.78 : 1.0;
              const rawKcal = equipKw * heatingFactor * 860;
              const stepUnit = rawKcal >= 1000000 ? 100000 : 10000;
              const snapped = Math.min(9200000, Math.max(30000, Math.round(rawKcal / stepUnit) * stepUnit));
              capVal = String(snapped);
              unitLabel = 'kcal/h';
            } else {
              // EHP·GHP·소형열병합·전기난방·룸에어컨 kW
              const snapped = Math.min(9200000, Math.max(15, Math.round(equipKw / 5) * 5));
              capVal = String(snapped);
              unitLabel = 'kW';
            }
            const capEl = document.querySelector(`#OpenList_${cv}_op1_, input[variable="${cv}_op1"]`);
            setVal(capEl, capVal, true, true);
            return `${cv}: 연면적(${Math.round(grossArea)}㎡×${Math.round(conditionedRatio * 100)}%) 기반 총용량 ${capEl?.value || capVal}${unitLabel}`;
          }
          // [B1-N-4] 설비별 표준 주에너지원1 선택 (겸용 에너지원2는 비움)
          if (cv.startsWith('q4300_r')) {
            const eqNum = cv.replace('q4300_r', '');
            const fuelMap = {
              '1': '23', '2': '23', '3': '23', '5': '23', '6': '23', '10': '23',
              '4': '31', '9': '31', '11': '31', '12': '31', '13': '31', '15': '31', '20': '31', '21': '31',
              '8': '37',
              '7': '41'
            };
            const targetFuel = fuelMap[eqNum] || '31';
            // 기존 타 체크박스 해제 (에너지원2 겸용 연료 비움)
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => {
              if (String(chk.value) !== targetFuel) uncheckEl(chk);
            });
            let fuelEl = document.querySelector(`#${cv}_${targetFuel}, input[variable="${cv}_${targetFuel}"], input[variable="${cv}"][value="${targetFuel}"], input[variable="${cv}_1"][value="${targetFuel}"]`);
            if (!fuelEl && eqNum === '8') {
              fuelEl = document.querySelector(`#${cv}_32, input[variable="${cv}"][value="32"]`) ||
                Array.from(document.querySelectorAll('#QuestionView input')).find(el => (el.closest('label')?.innerText || el.closest('tr')?.innerText || '').includes('심야'));
            }
            if (!fuelEl) {
              fuelEl = document.querySelector(`#${cv}_31, input[variable="${cv}"][value="31"]`) ||
                document.querySelector('#QuestionView input[type="radio"]:not(:disabled), #QuestionView input[type="checkbox"]:not(:disabled)');
            }
            clickEl(fuelEl);
            return `${cv}: 주에너지원 선택(${fuelEl?.value || targetFuel})`;
          }
          // [B1-N-5] 모름(-8) 일괄 응답
          if (cv.startsWith('q4350_r')) {
            const dkOpt =
              document.querySelector(`#${cv}_-8, input[variable="${cv}"][value="-8"], input[variable^="${cv}"][value^="-8"]`) ||
              Array.from(document.querySelectorAll('#QuestionView input')).find(el => (el.closest('label')?.innerText || el.closest('tr')?.innerText || '').includes('모름')) ||
              document.querySelector(`#${cv}_2, input[variable="${cv}"][value="2"]`);
            clickEl(dkOpt);
            return `${cv}: 모름(${dkOpt?.value || '-8'}) 응답`;
          }

          // [T71] 신재생에너지(시트 보유분: 1 태양광, 3 지열 등) + 비상용발전기(10 필수) 체크
          if (cv === 'q4500') {
            const targetT71 = new Set((engPlan.effectiveT71Codes || ['10']).map(String));
            uncheckEl(document.querySelector('#q4500_77, input[variable="q4500_77"], input[variable="q4500"][value="77"]'));
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'].forEach(code => {
              const chk = document.querySelector(`#q4500_${code}, input[variable="q4500_${code}"], input[variable="q4500"][value="${code}"]`);
              if (targetT71.has(code)) clickEl(chk);
              else uncheckEl(chk);
            });
            return `q4500: 신재생+비상용발전기 체크 (${Array.from(targetT71).join(',')})`;
          }
          // [B2-10-2 등] 비상용발전기 사용연료 경유(12)
          if (cv.startsWith('q4550_r')) {
            const eqNum = cv.replace('q4550_r', '');
            if (eqNum === '10') {
              clickEl(document.querySelector('#q4550_r10_12, input[variable="q4550_r10"][value="12"]'));
              return 'q4550_r10: 비상용발전기 사용연료 경유(12)';
            }
            const firstOpt = document.querySelector(`#${cv}_23, input[variable="${cv}"][value="23"]`) ||
              document.querySelector('#QuestionView input[type="radio"]:not(:disabled), #QuestionView input[type="checkbox"]:not(:disabled)');
            clickEl(firstOpt);
            return `${cv}: 연료 선택(${firstOpt?.value || '기본'})`;
          }
          if (cv.startsWith('q4600_r')) {
            const opt = document.querySelector(`#${cv}_1, input[variable="${cv}"][value="1"]`) ||
              document.querySelector('#QuestionView input[type="radio"]:not(:disabled)');
            clickEl(opt);
            return `${cv}: 단위/용도 선택(${opt?.value || '1'})`;
          }
          // [B2-N-4] 신재생(태양광 r1, 지열 r3) 및 비상용발전기(r10: 계약전력의 20~40%) 총용량(kW)
          if (cv.startsWith('q4650_r')) {
            document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
            const eqNum = cv.replace('q4650_r', '');
            const grossArea = Math.max(500, Number(trackedGrossFloorArea) || 2500);
            let capKw = String(engPlan.emergencyGenKw || 120);
            if (eqNum === '1') {
              // 태양광 발전설비 (옥상 면적 고려 15~150kW)
              capKw = String(Math.max(15, Math.min(200, Math.round((grossArea * 0.015) / 5) * 5)));
            } else if (eqNum === '3') {
              // 지열 설비 (연면적 비례 50~400kW)
              capKw = String(Math.max(50, Math.min(500, Math.round((grossArea * 0.04) / 10) * 10)));
            } else if (eqNum === '10') {
              capKw = String(engPlan.emergencyGenKw || 120);
            }
            setVal(document.querySelector(`#OpenList_${cv}_op1_, input[variable="${cv}_op1"]`), capKw, true, true);
            const op2El = document.querySelector(`#OpenList_${cv}_op2_, input[variable="${cv}_op2"]`);
            if (op2El && !op2El.disabled) {
              setVal(op2El, '0', true, true);
            }
            return `${cv}: 설비 총용량 ${capKw}kW 입력`;
          }
          if (cv === 'q4700') {
            document.querySelectorAll('#QuestionView input[type="checkbox"][value="5"]').forEach(el => clickEl(el));
            return 'q4700: 2028년까지 설치계획 없음(5)';
          }

          // --- [C. 에너지 사용기기 및 효율개선사업 파트] ---
          // [C1-1] 기준층: 지상 층수 범위 내 랜덤 층 입력
          if (cv === 'q7300') {
            clickEl(document.querySelector('#q7300_1, input[variable="q7300"][value="1"]'));
            return 'q7300: 지상(1)';
          }
          if (cv === 'q7350') {
            const maxFl = Math.max(1, Number(trackedAboveGroundFloors) || 5);
            const rndFl = String(Math.max(1, Math.min(maxFl, Math.floor((engPlan.c1FloorSeed || 0.4) * maxFl) + 1)));
            setVal(document.querySelector('input[variable="q7350_op1"], #OpenList_q7350_op1_'), rndFl, true, true);
            return `q7350: 기준층 지상 ${rndFl}층 (전체 지상 ${maxFl}층 중 랜덤)`;
          }
          // [C1-2] 대표공간 면적 비율: 10~20% 사이 랜덤
          if (cv === 'q7450') {
            clickEl(document.querySelector('#q7450_2, input[variable="q7450"][value="2"]'));
            const ratioStr = String(engPlan.c12Ratio || 15);
            setVal(document.querySelector('input[variable="q7450_op2"], #OpenList_q7450_op2_'), ratioStr, true, true);
            return `q7450: 대표공간 면적 비율 ${ratioStr}% (10~20% 랜덤)`;
          }
          // [C1-3] 대표공간 면적 비례 조명 대수 차등 추정
          if (cv === 'q7460') {
            const maxFl = Math.max(1, Number(trackedAboveGroundFloors) || 5);
            const grossArea = Math.max(400, Number(trackedGrossFloorArea) || 2000);
            const floorArea = grossArea / maxFl;
            const repArea = Math.max(35, Math.min(900, floorArea * ((engPlan.c12Ratio || 15) / 100)));
            const ledCount = String(Math.max(8, Math.round(repArea / (engPlan.c13SqmPerLed || 6))));
            const flCount = String(engPlan.c13FlCount ?? 0);
            setVal(document.querySelector('#OpenList_q7460_op1_, input[variable="q7460_op1"]'), flCount, true, true);
            setVal(document.querySelector('#OpenList_q7460_op2_, input[variable="q7460_op2"]'), ledCount, true, true);
            setVal(document.querySelector('#OpenList_q7460_op3_, input[variable="q7460_op3"]'), '0', true, true);
            return `q7460: 대표공간(약 ${Math.round(repArea)}㎡) 비례 형광등 ${flCount}, LED ${ledCount}, 할로겐 0`;
          }
          if (cv === 'q7500') {
            clickEl(document.querySelector('#q7500_2, input[variable="q7500"][value="2"]'));
            return 'q7500: 스마트LED 아니요(2)';
          }
          if (cv === 'q7600') {
            clickEl(document.querySelector('#q7600_2, input[variable="q7600"][value="2"]'));
            return 'q7600: 공용공간 LED등(2)';
          }
          if (cv === 'q7650') {
            clickEl(document.querySelector('#q7650_2, input[variable="q7650"][value="2"]'));
            return 'q7650: 공용공간 스마트LED 아니요(2)';
          }
          if (cv === 'q7750') {
            clickEl(document.querySelector('#q7750_9, input[variable="q7750"][value="9"]'));
            return 'q7750: 부조명 없음(9)';
          }
          // [C3-1] 용도별 건물 내 이용중인 기기 예상치 체크 (서버실 미보유 시 '서버' 제외하여 ZA 섹션 오진입 방지)
          if (cv === 'q7900') {
            const checkboxes = Array.from(document.querySelectorAll('#QuestionView input[type="checkbox"]:not(:disabled)'));
            const t41Set = new Set((slotData.t41Codes || []).map(String));
            const hasServerRoom = t41Set.has('11') || t41Set.has('12');
            const hasFood = t41Set.has('1') || /근린|판매|상업|숙박|의료|교육|문화/.test(engPlan.mainUseFull || '');
            const isMed = /의료|병원/.test(engPlan.mainUseFull || '');

            const picked = [];
            checkboxes.forEach(chk => {
              const val = String(chk.value || '');
              const lbl = (chk.closest('label')?.innerText || chk.closest('tr')?.innerText || '').trim();
              if (val === '77' || val === '98' || val.startsWith('-') || /없음|모름/.test(lbl)) {
                uncheckEl(chk);
                return;
              }
              if (!hasServerRoom && (val === '21' || /서버|전산|데이터센터/.test(lbl))) {
                uncheckEl(chk);
                return;
              }
              const matchCommon = /컴퓨터|PC|복합기|프린터|복사기|정수기|냉장고|TV|모니터|공기청정|손건조|비데/.test(lbl);
              const matchFood = hasFood && /전자레인지|인덕션|제빙기|쇼케이스|상업용|취사|조리|식기세척|커피/.test(lbl);
              const matchMed = isMed && /의료|영상|멸균|검진/.test(lbl);
              if ((matchCommon || matchFood || matchMed) && picked.length < 5) {
                clickEl(chk);
                picked.push(val);
              } else {
                uncheckEl(chk);
              }
            });
            if (picked.length === 0) {
              const safeCands = checkboxes.filter(chk => {
                const val = String(chk.value || '');
                const lbl = (chk.closest('label')?.innerText || chk.closest('tr')?.innerText || '').trim();
                return val !== '77' && val !== '98' && val !== '21' && !val.startsWith('-') && !/없음|모름|서버/.test(lbl);
              }).slice(0, 2);
              safeCands.forEach(chk => { clickEl(chk); picked.push(chk.value); });
            }
            return `q7900: 용도별 건물 내 이용기기 체크 (${picked.join(',')})`;
          }
          // [C4-1] 용도별·규모별 건물 내 에너지 절약·고효율 기기 예상치 체크
          if (cv === 'q7950') {
            const checkboxes = Array.from(document.querySelectorAll('#QuestionView input[type="checkbox"]:not(:disabled)'));
            const grossArea = Number(trackedGrossFloorArea) || 2500;
            const c52Set = new Set((slotData.c52Codes || []).map(String));
            const hasCentral = (engPlan.effectiveA51Code === '1' || engPlan.effectiveA51Code === '2');

            const picked = [];
            checkboxes.forEach(chk => {
              const val = String(chk.value || '');
              const lbl = (chk.closest('label')?.innerText || chk.closest('tr')?.innerText || '').trim();
              if (val === '77' || val === '98' || val.startsWith('-') || /없음|모름/.test(lbl)) {
                uncheckEl(chk);
                return;
              }
              const matchBasic = /LED|조명|점멸|재실|센서|대기전력|타이머|절전/.test(lbl);
              const matchScale = (grossArea >= 2000 || hasCentral) && /인버터|전동기|열회수|전열교환|펌프|변압기|고효율/.test(lbl);
              const matchBems = (c52Set.has('3') || grossArea >= 10000) && /BEMS|에너지관리/.test(lbl);
              if ((matchBasic || matchScale || matchBems) && picked.length < 3) {
                clickEl(chk);
                picked.push(val);
              } else {
                uncheckEl(chk);
              }
            });
            if (picked.length === 0) {
              const safeCand = checkboxes.find(chk => {
                const val = String(chk.value || '');
                const lbl = (chk.closest('label')?.innerText || chk.closest('tr')?.innerText || '').trim();
                return val !== '77' && val !== '98' && !val.startsWith('-') && !/없음|모름/.test(lbl);
              });
              if (safeCand) { clickEl(safeCand); picked.push(safeCand.value); }
            }
            return `q7950: 용도·규모별 절약설비 체크 (${picked.join(',')})`;
          }

          // [C5-1 / C5-2 / C5-3] 에너지효율개선사업 인지도·참여이력(엑셀 시트 R열 + 2020년 이후 준공 ZEB 보정)
          const rawC52 = Array.isArray(slotData.c52Codes) ? slotData.c52Codes.map(String).filter(c => c && c !== '9') : [];
          if (slotData.zebCheckAfter2020 && Number(trackedCompletionYear) >= 2020 && !rawC52.includes('2')) {
            rawC52.push('2');
          }
          const activeC52Set = new Set(rawC52);

          if (cv === 'q8000') {
            const uidSeed = parseInt(String(slotData.uid || '1').replace(/[^0-9]/g, ''), 10) || 1;
            const patterns = [
              ['3', '5', '4', '3', '5', '4', '3'],
              ['5', '3', '4', '5', '3', '4', '5'],
              ['3', '4', '5', '3', '4', '5', '3'],
              ['4', '3', '5', '4', '3', '5', '4']
            ];
            const chosenPattern = [...patterns[uidSeed % patterns.length]];
            for (let r = 1; r <= 7; r++) {
              // C5-2에서 실제 참여한 사업은 인지도 6(아는 편)~7(잘 알고 있음)로 정합성 유지
              const targetVal = activeC52Set.has(String(r)) ? '6' : (chosenPattern[r - 1] || '4');
              const radio = document.querySelector(`input[variable="q8000_${r}"][value="${targetVal}"], #q8000_${r}_${targetVal}`);
              clickEl(radio);
            }
            return `q8000: C5-1 인지도 응답 (참여사업=${Array.from(activeC52Set).join(',') || '없음'})`;
          }
          if (cv === 'q8050') {
            const allC52 = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
            if (activeC52Set.size > 0) {
              uncheckEl(document.querySelector('#q8050_9, input[variable="q8050_9"], input[variable="q8050"][value="9"]'));
              allC52.filter(c => c !== '9').forEach(code => {
                const chk = document.querySelector(`#q8050_${code}, input[variable="q8050_${code}"], input[variable="q8050"][value="${code}"]`);
                if (activeC52Set.has(code)) clickEl(chk);
                else uncheckEl(chk);
              });
              return `q8050: C5-2 효율개선사업 시트값 체크 (${Array.from(activeC52Set).join(',')})`;
            }
            allC52.filter(c => c !== '9').forEach(code => {
              uncheckEl(document.querySelector(`#q8050_${code}, input[variable="q8050_${code}"], input[variable="q8050"][value="${code}"]`));
            });
            clickEl(document.querySelector('#q8050_9, input[variable="q8050_9"], input[variable="q8050"][value="9"]'));
            return 'q8050: 참여한 사업 없음(9)';
          }
          if (cv === 'q8100') {
            ['1', '2', '3', '4', '5', '6', '7', '8'].forEach(code => {
              uncheckEl(document.querySelector(`#q8100_${code}, input[variable="q8100_${code}"], input[variable="q8100"][value="${code}"]`));
            });
            const dkBtn = document.querySelector('#q8100_-8, input[variable^="q8100"][value^="-8"]') ||
              Array.from(document.querySelectorAll('#QuestionView input')).find(el => (el.closest('label')?.innerText || '').includes('모름'));
            clickEl(dkBtn);
            return 'q8100: 효율개선사업 참여시점 모름(-8)';
          }

          // --- [D. 2025년도 에너지소비량 파트] ---
          if (cv === 'q6000') {
            clickEl(document.querySelector('#q6000_1, input[variable="q6000"][value="1"]'));
            return 'q6000: 전력량계 1개(1)';
          }
          // [D1-2-1] 계약전력: 구글 시트 U열 계약전력(kW) 입력
          if (cv.startsWith('q6100_r')) {
            const kwStr = String(engPlan.contractPowerKw || 300);
            clickEl(document.querySelector(`#${cv}_1_1, input[variable="${cv}_1"][value="1"]`));
            setVal(document.querySelector(`#OpenList_${cv}_2_op1_, input[variable="${cv}_2_op1"]`), kwStr, true, true);
            clickEl(document.querySelector(`#${cv}_3_2, input[variable="${cv}_3"][value="2"]`));
            return `${cv}: 한전일반(1), 계약전력 ${kwStr}kW, 회상응답(2)`;
          }
          if (cv.startsWith('q6150_r')) {
            clickEl(document.querySelector(`#${cv}_1, input[variable="${cv}"][value="1"]`));
            return `${cv}: 단위 kWh(1)`;
          }
          // [D1-5-1] 계약전력 비례 월별 전력소비량(kWh) 산출
          if (cv.startsWith('q6200_r')) {
            const baseCurve = (engPlan.useCityGas || engPlan.useDistrictHeat)
              ? [19000, 18000, 16000, 15000, 15500, 20000, 26000, 27500, 20000, 15500, 16500, 18500]
              : [24500, 22500, 18000, 15000, 15000, 19500, 25500, 26500, 19000, 15000, 18500, 23500];
            const scale = ((engPlan.contractPowerKw || 300) / 300) * (engPlan.monthlyJitterSeed || 1);
            baseCurve.forEach((v, i) => {
              const scaledVal = String(Math.max(500, Math.round((v * scale) / 100) * 100));
              setVal(document.querySelector(`#OpenList_${cv}_op${i + 1}_, input[variable="${cv}_op${i + 1}"]`), scaledVal, true, true);
            });
            return `${cv}: 계약전력(${engPlan.contractPowerKw}kW) 비례 1~12월 전력소비량 입력`;
          }
          if (cv === 'q6250') {
            clickEl(document.querySelector('#q6250_1, input[variable="q6250"][value="1"]'));
            return 'q6250: 구성비 응답(1)';
          }
          // [D1-7] 기타 항목에 'pc,사무기기' 입력 + 2~6% 랜덤 배분 (전체 합계 100% 정합성 보장)
          if (cv === 'q6300') {
            const etcPct = Math.min(6, Math.max(2, Number(engPlan.etcElecPct) || 4));
            const etcNameEl = document.querySelector('#OpenList_q6300_op97_, input[variable="q6300_op97"]');
            if (etcNameEl) {
              setVal(etcNameEl, 'pc,사무기기', true, true);
            }
            const hasGasOrDistHeat = Boolean(engPlan.useCityGas || engPlan.useDistrictHeat);
            const b11Set = new Set((engPlan.effectiveB11Codes || []).map(String));
            const hasElecHeating = ['4', '8', '9'].some(c => b11Set.has(c));
            const op1 = (hasGasOrDistHeat && !hasElecHeating) ? 0 : (hasGasOrDistHeat ? 10 : 25);
            const op2 = b11Set.has('1') && !['4', '11', '12', '13', '15'].some(c => b11Set.has(c)) ? 10 : 30;
            const op3 = 5;
            const op4 = 0;
            const op6 = 15;
            const op7 = 5;
            const op5 = 100 - (op1 + op2 + op3 + op4 + op6 + op7 + etcPct);
            const ratios = {
              q6300_op1: String(op1),
              q6300_op2: String(op2),
              q6300_op3: String(op3),
              q6300_op4: String(op4),
              q6300_op5: String(op5),
              q6300_op6: String(op6),
              q6300_op7: String(op7)
            };
            for (const [k, v] of Object.entries(ratios)) {
              setVal(document.querySelector(`#OpenList_${k}_, input[variable="${k}"]`), v, true, true);
            }
            const etcPctEl = document.querySelector('#OpenList_q6300_op8_, input[variable="q6300_op8"]');
            if (etcPctEl) {
              setVal(etcPctEl, String(etcPct), true, true);
            }
            return `q6300: 전기 구성비 합계 100% 입력 (기타='pc,사무기기' ${etcPct}%)`;
          }

          // [D2-1 ~ D2-6] 도시가스 사용 여부(구글 시트 S열) 및 면적별 예상 소비량·용도별 구성비
          if (cv === 'q6350') {
            const code = engPlan.useCityGas ? '1' : '2';
            clickEl(document.querySelector(`#q6350_${code}, input[variable="q6350"][value="${code}"]`));
            return `q6350: 도시가스 ${engPlan.useCityGas ? '사용한다(1)' : '사용하지 않는다(2)'}`;
          }
          if (cv === 'q6400') {
            clickEl(document.querySelector('#q6400_1, input[variable="q6400"][value="1"]'));
            return 'q6400: 도시가스 계량기 1개(1)';
          }
          if (cv.startsWith('q6500_r')) {
            clickEl(document.querySelector(`input[variable="${cv}_1"][value="2"], #${cv}_1_2, #${cv}_1`));
            clickEl(document.querySelector(`input[variable="${cv}_2"][value="1"], #${cv}_2_1`));
            return `${cv}: 회상응답(2), 단위 N㎥(1)`;
          }
          if (cv.startsWith('q6600_r')) {
            const grossArea = Math.max(400, Number(trackedGrossFloorArea) || 2500);
            const b11Set = new Set((engPlan.effectiveB11Codes || []).map(String));
            const hasGasCooling = b11Set.has('1') || b11Set.has('3');
            const weights = hasGasCooling
              ? [0.16, 0.14, 0.09, 0.05, 0.04, 0.06, 0.09, 0.10, 0.05, 0.04, 0.07, 0.11]
              : [0.21, 0.18, 0.11, 0.05, 0.03, 0.02, 0.02, 0.02, 0.02, 0.04, 0.11, 0.19];
            const annualNm3 = Math.max(1200, Math.round(grossArea * 9.5 * (engPlan.monthlyJitterSeed || 1)));
            weights.forEach((w, idx) => {
              const mVal = String(Math.max(20, Math.round((annualNm3 * w) / 10) * 10));
              setVal(document.querySelector(`#OpenList_${cv}_op${idx + 1}_, input[variable="${cv}_op${idx + 1}"]`), mVal, true, true);
            });
            return `${cv}: 연면적(${Math.round(grossArea)}㎡) 비례 월별 도시가스 소비량(연 약 ${annualNm3}N㎥) 입력`;
          }
          if (cv === 'q6650') {
            clickEl(document.querySelector('#q6650_1, input[variable="q6650"][value="1"]'));
            return 'q6650: 도시가스 용도별 구성비(%) 응답(1)';
          }
          if (cv === 'q6700') {
            const b11Set = new Set((engPlan.effectiveB11Codes || []).map(String));
            const t41Set = new Set((slotData.t41Codes || []).map(String));
            const hasFood = t41Set.has('1');
            const hasGasCooling = b11Set.has('1') || b11Set.has('3');
            const hasChp = b11Set.has('2');

            let gOp1 = 100; // 난방 및 급탕
            let gOp2 = 0;   // 냉방
            let gOp3 = 0;   // 취사
            let gOp4 = 0;   // 자가발전(열병합)
            if (hasChp) {
              gOp4 = 45;
              gOp3 = hasFood ? 10 : 0;
              gOp2 = hasGasCooling ? 15 : 0;
              gOp1 = 100 - gOp4 - gOp3 - gOp2;
            } else if (hasGasCooling) {
              gOp2 = 30;
              gOp3 = hasFood ? 15 : 0;
              gOp1 = 100 - gOp2 - gOp3;
            } else {
              gOp3 = hasFood ? 20 : 0;
              gOp1 = 100 - gOp3;
            }

            const etcLabel = document.querySelector('#OpenList_q6700_op97_, input[variable="q6700_op97"]');
            if (etcLabel) setVal(etcLabel, '', true, true);
            const gasMap = {
              q6700_op1: String(gOp1),
              q6700_op2: String(gOp2),
              q6700_op3: String(gOp3),
              q6700_op4: String(gOp4),
              q6700_op5: '0',
              q6700_op6: '0',
              q6700_op7: '0'
            };
            for (const [k, v] of Object.entries(gasMap)) {
              const el = document.querySelector(`#OpenList_${k}_, input[variable="${k}"]`);
              if (el) setVal(el, v, true, true);
            }
            return `q6700: 도시가스 구성비 입력 (난방·급탕=${gOp1}%, 냉방=${gOp2}%, 취사=${gOp3}%, 발전=${gOp4}%)`;
          }

          // [D3] 지역냉난방(열에너지) 정합성 처리 (q6800 ~ q6999 전 문항 구조적 대응: q6950_r1 단위 Gcal·월별 소비량·구성비 100%)
          if (cv === 'q6800') {
            const code = engPlan.useDistrictHeat ? '1' : '2';
            clickEl(document.querySelector(`#q6800_${code}, input[variable="q6800"][value="${code}"]`));
            return `q6800: 열에너지(지역냉난방) ${engPlan.useDistrictHeat ? '사용한다(1)' : '사용하지 않는다(2)'}`;
          }
          if (/^q6[89]\d{2}/.test(cv)) {
            const b11Set = new Set((engPlan.effectiveB11Codes || []).map(String));
            const hasDistCool = b11Set.has('14');
            const isCoolRow = /_r2$/i.test(cv) || /냉방열/.test(text);

            // 1) D3-3-N 응답방법(_1 -> 2:회상) + D3-4-N 소비량 단위(_2 -> 2:Gcal) 복합 라디오 화면 (예: q6950_r1)
            const methodRadio = document.querySelector(`input[type="radio"][variable="${cv}_1"][value="2"], input[type="radio"]#${cv}_1_2`);
            const unitGcalRadio =
              document.querySelector(`input[type="radio"][variable="${cv}_2"][codelabel*="Gcal"]`) ||
              document.querySelector(`input[type="radio"][variable="${cv}_2"][value="2"], input[type="radio"]#${cv}_2_2`) ||
              document.querySelector(`input[type="radio"][variable="${cv}_2"][value="1"], input[type="radio"]#${cv}_2_1`);
            if (methodRadio && unitGcalRadio) {
              clickEl(methodRadio);
              clickEl(unitGcalRadio);
              return `${cv}: 열에너지 응답방법(2:회상) 및 단위(${unitGcalRadio.getAttribute('codelabel') || '2:Gcal'}) 선택`;
            }

            // 2) 1~12월 월별 열에너지 소비량(Gcal) 12개 수치 입력 화면 (예: q6960_r1 / q6970_r1 / q6900_r1 등)
            const op12Check = document.querySelector(`#OpenList_${cv}_op12_, input[variable="${cv}_op12"]`);
            if (op12Check) {
              document.querySelectorAll('#QuestionView input[type="checkbox"]').forEach(chk => uncheckEl(chk));
              const grossArea = Math.max(500, Number(trackedGrossFloorArea) || 3000);
              const conditionedRatio = grossArea >= 50000 ? 0.55 : 0.80;
              const weights = isCoolRow
                ? [0, 0, 0, 0.03, 0.10, 0.20, 0.28, 0.27, 0.10, 0.02, 0, 0]
                : (hasDistCool
                  ? [0.16, 0.14, 0.09, 0.05, 0.03, 0.06, 0.10, 0.11, 0.05, 0.04, 0.07, 0.10]
                  : [0.22, 0.19, 0.12, 0.05, 0.02, 0.01, 0.01, 0.01, 0.02, 0.04, 0.12, 0.19]);
              const annualGcal = Math.max(60, Math.round(grossArea * conditionedRatio * 0.075 * (engPlan.monthlyJitterSeed || 1)));
              weights.forEach((w, idx) => {
                const el = document.querySelector(`#OpenList_${cv}_op${idx + 1}_, input[variable="${cv}_op${idx + 1}"]`);
                if (!el) return;
                const minZeroAllowed = (el.getAttribute('placeholder') || '').trim().startsWith('0');
                const v = String(w === 0 && minZeroAllowed ? 0 : Math.max(1, Math.round(annualGcal * w)));
                setVal(el, v, true, true);
              });
              return `${cv}: 월별 열에너지 소비량(연 약 ${annualGcal}Gcal) 1~12월 입력`;
            }

            // 3) 용도별 구성비(%) 수치 입력 화면 (합계 100%)
            const pctInputs = Array.from(document.querySelectorAll('#QuestionView input[type="text"], #QuestionView input[type="number"]'))
              .filter(el => !el.disabled && !el.readOnly && !String(el.id).includes('op97') && !String(el.id).includes('op91'));
            if (pctInputs.length >= 2) {
              const etcLbl = document.querySelector(`#OpenList_${cv}_op97_, input[variable="${cv}_op97"]`);
              if (etcLbl) setVal(etcLbl, '', true, true);
              pctInputs.forEach((el, idx) => {
                if (hasDistCool && !/_r[12]$/i.test(cv) && pctInputs.length >= 2) {
                  setVal(el, idx === 0 ? '65' : (idx === 1 ? '35' : '0'), true, true);
                } else {
                  setVal(el, idx === 0 ? '100' : '0', true, true);
                }
              });
              return `${cv}: 열에너지 용도별 구성비 합계 100% 입력`;
            }

            // 4) 열에너지 종류 선택(난방열/냉방열 체크박스) 또는 계량기/구성비 응답여부 라디오
            const d3Checkboxes = Array.from(document.querySelectorAll('#QuestionView input[type="checkbox"]:not(:disabled)'));
            if (d3Checkboxes.length > 0) {
              d3Checkboxes.forEach(chk => {
                const v = String(chk.value || '');
                const lbl = (chk.getAttribute('codelabel') || chk.closest('label, tr')?.innerText || '').trim();
                const shouldCheck = (v === '1' || /난방/.test(lbl)) || (hasDistCool && (v === '2' || /냉방/.test(lbl)));
                if (shouldCheck) clickEl(chk);
                else uncheckEl(chk);
              });
              if (!d3Checkboxes.some(c => c.checked)) clickEl(d3Checkboxes[0]);
              return `${cv}: 열에너지 공급용도 선택 (난방열${hasDistCool ? '+냉방열' : ''})`;
            }

            const firstRadio = document.querySelector(`#${cv}_1, input[variable="${cv}"][value="1"]`) ||
              document.querySelector('#QuestionView input[type="radio"]:not(:disabled)');
            if (firstRadio) {
              clickEl(firstRadio);
              return `${cv}: 열에너지 단일선택(${firstRadio.value}) 응답`;
            }
          }

          // [D4] 비상용발전기 경유(12) 소비량 — 건물별 점검주기·용량 다변화(engPlan.dieselMonthly)
          if (cv === 'q7000') {
            clickEl(document.querySelector('#q7000_1, input[variable="q7000"][value="1"]'));
            return 'q7000: 석유제품(비상용발전기 경유) 사용한다(1)';
          }
          if (cv === 'q7050') {
            clickEl(document.querySelector('#q7050_1, input[variable="q7050"][value="1"]'));
            return 'q7050: 사용한 석유제품 1개(1)';
          }
          if (cv === 'q7095_r1') {
            clickEl(document.querySelector('#q7095_r1_12, input[variable="q7095_r1"][value="12"]'));
            return 'q7095_r1: 석유제품 종류 경유(12)';
          }
          if (cv === 'q7100_r1') {
            clickEl(document.querySelector('#q7100_r1_1, input[variable="q7100_r1"][value="1"]'));
            return 'q7100_r1: 경유 소비량 단위 리터(L)(1)';
          }
          if (cv === 'q7150_r1') {
            const mArr = Array.isArray(engPlan.dieselMonthly) && engPlan.dieselMonthly.length === 12
              ? engPlan.dieselMonthly
              : [20, 0, 0, 20, 0, 0, 25, 0, 0, 20, 0, 0];
            mArr.forEach((v, i) => {
              setVal(document.querySelector(`#OpenList_q7150_r1_op${i + 1}_, input[variable="q7150_r1_op${i + 1}"]`), String(v), true, true);
            });
            return `q7150_r1: 비상용발전기 월별 경유 사용량 랜덤 패턴 입력 (연 ${mArr.reduce((a, b) => a + b, 0)}L)`;
          }
          if (cv === 'q7200_r1') {
            clickEl(document.querySelector('#q7200_r1_1, input[variable="q7200_r1"][value="1"]'));
            return 'q7200_r1: 경유 용도별 구성비(%) 응답(1)';
          }
          if (cv === 'q7250_r1') {
            const dieselRatios = {
              q7250_r1_op1: '0',
              q7250_r1_op2: '0',
              q7250_r1_op3: '0',
              q7250_r1_op4: '0',
              q7250_r1_op6: '100',
              q7250_r1_op7: '0'
            };
            for (const [k, v] of Object.entries(dieselRatios)) {
              setVal(document.querySelector(`#OpenList_${k}_, input[variable="${k}"]`), v, true, true);
            }
            return 'q7250_r1: 비상발전용 경유 구성비 100% 입력';
          }

          // --- [E. 응답자 일반사항 파트] ---
          if (cv === 'q90000') {
            clickEl(document.querySelector('#q90000_1, input[variable="q90000"][value="1"]'));
            return 'q90000: 응답자 1명(1)';
          }
          // [E1-2] '운영, 유지, 엔지니어링'(1) vs '건물 관리(운영유지)'(3) 2개 중 랜덤 응답 + 누락 원천 차단
          if (cv.startsWith('q90015_r')) {
            const roleCode = String(engPlan.e12RoleCode || '1');
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].forEach(code => {
              const chk = document.querySelector(`#${cv}_${code}, input[variable="${cv}_${code}"], input[variable="${cv}"][value="${code}"]`);
              if (code === roleCode) clickEl(chk);
              else uncheckEl(chk);
            });
            if (document.querySelectorAll('#QuestionView input:checked').length === 0) {
              const fallbackRole = document.querySelector(`#${cv}_1, input[variable="${cv}_1"], input[variable="${cv}"][value="1"]`) ||
                document.querySelector('#QuestionView input[type="checkbox"]:not(:disabled), #QuestionView input[type="radio"]:not(:disabled)');
              clickEl(fallbackRole);
            }
            return `${cv}: 담당업무 ${roleCode === '1' ? '운영, 유지, 엔지니어링(1)' : '건물 관리(3)'} 랜덤 체크`;
          }
          // [E1-5] 응답자 정보 및 E-MAIL '9999999@naver.com' 응답
          if (cv.startsWith('q90020_r')) {
            const nameEl = document.querySelector(`#OpenList_${cv}_op3_, input[variable="${cv}_op3"]`);
            const existingName = nameEl && nameEl.value ? nameEl.value.trim() : '';
            const rName = (existingName && existingName !== '관리소장')
              ? existingName
              : (basicInfoState.contactName || slotData.contactName || '관리소장');
            const tel1El = document.querySelector(`#${cv}_op4, input[variable="${cv}_op4"]`);
            const tel2El = document.querySelector(`#${cv}_op5, input[variable="${cv}_op5"]`);
            const tel3El = document.querySelector(`#${cv}_op6, input[variable="${cv}_op6"]`);
            const t1 = (tel1El && tel1El.value ? tel1El.value.trim() : '') || basicInfoState.tel1 || '010';
            const t2 = (tel2El && tel2El.value ? tel2El.value.trim() : '') || basicInfoState.tel2 || '7935';
            const t3 = (tel3El && tel3El.value ? tel3El.value.trim() : '') || basicInfoState.tel3 || '2414';
            setVal(nameEl, rName);
            setVal(tel1El, t1);
            setVal(tel2El, t2);
            setVal(tel3El, t3);
            setVal(document.querySelector(`#${cv}_op7, input[variable="${cv}_op7"]`), '9999999', true, true);
            const sel = document.querySelector(`#${cv}_op9, select[variable="${cv}_op9"]`);
            if (sel) {
              sel.value = '4'; // naver.com
              if (typeof window.domaincheck === 'function') window.domaincheck();
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            setVal(document.querySelector(`#${cv}_op8, input[variable="${cv}_op8"]`), 'naver.com', true, true);
            return `${cv}: 응답자(${rName}) 및 E-MAIL(9999999@naver.com) 입력`;
          }

          // --- [범용 폴백: 예상치 못한 조건부 문항 대응] ---
          const qv = document.querySelector('#QuestionView');
          const allEls = Array.from(qv.querySelectorAll('input, select, textarea')).filter(el => el.type !== 'hidden' && el.type !== 'button' && !el.disabled && !el.readOnly);
          const checkRadioEls = allEls.filter(el => el.type === 'radio' || el.type === 'checkbox');
          if (checkRadioEls.length > 0) {
            const noneOpt = checkRadioEls.find(el => {
              const lbl = (el.closest('label')?.innerText || el.closest('tr')?.innerText || '');
              return (
                el.value === '77' ||
                el.value === '98' ||
                el.value === '-8' ||
                lbl.includes('해당사항 없음') ||
                lbl.includes('설비 없음') ||
                lbl.includes('사용하지 않') ||
                lbl.includes('이용하지 않') ||
                lbl.includes('운영하지 않') ||
                lbl.includes('보유하지 않') ||
                lbl.includes('미보유') ||
                lbl.includes('모름') ||
                lbl.includes('없음') ||
                lbl.includes('아니요') ||
                lbl.includes('안함')
              );
            }) || checkRadioEls[0];
            if (noneOpt) {
              clickEl(noneOpt);
              return `${cv}: fallback radio/check (${noneOpt.value})`;
            }
          }
          const textEls = allEls.filter(el => (el.type === 'text' || el.type === 'tel' || el.type === 'number') && !String(el.id).includes('op97') && !String(el.id).includes('op91'));
          if (textEls.length > 0) {
            textEls.forEach(el => setVal(el, '1'));
            return `${cv}: fallback text ('1')`;
          }

          return 'UNHANDLED';
        }, {
          cv: step.cv,
          text: step.text,
          slotData,
          basicInfoState,
          policy,
          preserveExisting,
          trackedStoreCount,
          trackedGrossFloorArea,
          trackedAboveGroundFloors,
          trackedCompletionYear,
          engPlan
        });
      }

      // A1-2(q1460) / A1-4(q1500) / A1-8(q1650) 입력 직후 최신 수치 재동기화
      if (step.cv === 'q1460' || step.cv === 'q1500' || step.cv === 'q1650') {
        const syncedDims = await page.evaluate(({ cv }) => {
          if (cv === 'q1460') {
            return { fl: document.querySelector('input[variable="q1460_op1"]')?.value || '' };
          }
          if (cv === 'q1500') {
            return { area: document.querySelector('input[variable="q1500_op3"]')?.value || '' };
          }
          return { yr: document.querySelector('input[variable="q1650_op1"]')?.value || '' };
        }, { cv: step.cv }).catch(err => {
          logger.warn(`[HRC 에너지총조사] 치수 동기화 조회 경고(${step.cv}): ${err.message}`);
          return null;
        });
        if (syncedDims?.fl) {
          const n = parseInt(String(syncedDims.fl).replace(/[^0-9]/g, ''), 10);
          if (n > 0) trackedAboveGroundFloors = n;
        }
        if (syncedDims?.area) {
          const a = parseFloat(String(syncedDims.area).replace(/[^0-9.]/g, ''));
          if (a > 0) trackedGrossFloorArea = a;
        }
        if (syncedDims?.yr) {
          const y = parseInt(String(syncedDims.yr).replace(/[^0-9]/g, ''), 10);
          if (y >= 1950) trackedCompletionYear = y;
        }
      }

      const preFilledSummary = activeInputs
        .filter(inp => (inp.type === 'radio' || inp.type === 'checkbox') ? inp.checked : (inp.tag !== 'SELECT' && inp.value !== ''))
        .map(inp => `${inp.variable || inp.id}=${inp.value}`)
        .join(', ');

      stepTrace.push({
        stepNo: stepIdx + 1,
        cv: step.cv,
        pct: step.pct,
        action: actionDesc,
        preFilled: preFilledSummary,
        questionSnippet: step.text.slice(0, 180)
      });

      if (String(step.cv).startsWith('q90020_r')) {
        const syncedRespondent = await page.evaluate(({ cv }) => {
          const nameEl = document.querySelector(`#OpenList_${cv}_op3_, input[variable="${cv}_op3"]`);
          const tel1El = document.querySelector(`#${cv}_op4, input[variable="${cv}_op4"]`);
          const tel2El = document.querySelector(`#${cv}_op5, input[variable="${cv}_op5"]`);
          const tel3El = document.querySelector(`#${cv}_op6, input[variable="${cv}_op6"]`);
          return {
            contactName: nameEl && nameEl.value ? nameEl.value.trim() : '',
            tel1: tel1El && tel1El.value ? tel1El.value.trim() : '',
            tel2: tel2El && tel2El.value ? tel2El.value.trim() : '',
            tel3: tel3El && tel3El.value ? tel3El.value.trim() : ''
          };
        }, { cv: step.cv }).catch(err => {
          logger.warn(`[HRC 에너지총조사] 응답자 동기화 조회 경고: ${err.message}`);
          return null;
        });
        if (syncedRespondent) {
          if (syncedRespondent.contactName && syncedRespondent.contactName !== '관리소장') {
            basicInfoState.contactName = syncedRespondent.contactName;
          }
          if (syncedRespondent.tel1) basicInfoState.tel1 = syncedRespondent.tel1;
          if (syncedRespondent.tel2) basicInfoState.tel2 = syncedRespondent.tel2;
          if (syncedRespondent.tel3) basicInfoState.tel3 = syncedRespondent.tel3;
        }
      }

      // 안전가드(safetyGuard) 활성화 시 마지막 응답자 화면(q90020_r1) 입력 후 제출 직전에 정지
      if (safetyGuard && step.cv === 'q90020_r1' && jumpedToStart) {
        if (reportDir) {
          const fileName = `step_91PCT_GUARD_${Date.now()}.png`;
          await page.screenshot({ path: path.join(reportDir, fileName), fullPage: true }).catch(err => {
            logger.warn(`[HRC 에너지총조사] 스크린샷 저장 경고: ${err.message}`);
          });
          capturedSteps.push({
            step: 'q90020_r1',
            stepIndex: capturedSteps.length + 1,
            title: '91% 제출 직전 안전 대기 (E1-3~E1-5)',
            file: fileName,
            url: `/reports/${path.basename(path.dirname(reportDir))}/${path.basename(reportDir)}/${fileName}`
          });
        }
        logger.info(`[HRC 에너지총조사] UID=${uid} 안전가드(91% q90020_r1) 도달 — 최종 제출 전 안전 정지`);
        return {
          success: true,
          status: 'stopped_at_review',
          uid,
          rpsUrl,
          basicInfoState,
          stepTrace,
          capturedSteps
        };
      }

      // 다음 문항 이동
      const prevCv = step.cv;
      await page.evaluate(() => window.GoNext(false, false));
      await page.waitForTimeout(350);
      await waitForRpsReady(page);

      let after = await extractRpsStep(page);
      if (after.alertMsg) {
        logger.info(`[HRC 에너지총조사] UID=${uid} 문항 ${prevCv} 확인 알림 자동 승인: ${after.alertMsg}`);
        await page.evaluate(() => window.GoNext(false, true));
        await page.waitForTimeout(350);
        await waitForRpsReady(page);
        after = await extractRpsStep(page);
      }

      if (after.err) {
        await page.evaluate(() => {
          const btn = document.querySelector('#MessageNo, .notipop button');
          if (btn) btn.click();
          const errEl = document.querySelector('#ErrorMessage');
          if (errEl) errEl.value = '';
          window.isRun = false;
        }).catch(err => logger.warn(`[HRC 에너지총조사] 오류 팝업 정리 경고: ${err.message}`));
        if (after.err.includes('인터넷 연결 오류')) {
          logger.warn(`[HRC 에너지총조사] UID=${uid} 문항 ${after.cv} 일시적 통신 지연 감지 — 재시도합니다.`);
          await page.waitForTimeout(800);
          continue;
        }
        throw new Error(`[UID ${uid}] 문항 ${after.cv} 검증 오류: ${after.err.replace(/<br\s*\/?>/gi, ' ')}`);
      }

      // 중간 문항에서 열려 첫 화면 빈칸을 채운 직후에는 SQ. 일반 특성(isqpart) 처음으로 복귀하여 전체 문항 적용 보장
      if (!jumpedToStart && !after.isCompleted) {
        const jumped = await page.evaluate(() => {
          const btn = document.querySelector('#qnav-bar button[onclick*="isqpart"]');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });
        jumpedToStart = true;
        if (jumped) {
          await page.waitForTimeout(800);
          await waitForRpsReady(page);
        }
      }
    }

    throw new Error(`[UID ${uid}] 최대 단계 수(200단계)를 초과하여 중단되었습니다.`);
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn('[Browser close 경고]', e.message));
    }
  }
}

/**
 * 계정의 조사완료(100%) 건물 슬롯 중 [답례품 지급] 미서명 건들을 일괄 조회하여
 * 신세계상품권 5,000원 선택 + 응답자 성명·연락처 + 8종 한글 필체 서명을 자동 저장합니다.
 */
export async function signAllCompletedHrcEnergySlots(options = {}) {
  const {
    loginId = '700275',
    loginPw = '700275',
    targetUids = null,
    slotHintMap = {},
    onProgress = () => {}
  } = options;

  let browser = null;
  try {
    browser = await launchChromium({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 920 },
      locale: 'ko-KR'
    });
    const page = await context.newPage();
    page.on('dialog', async (d) => {
      try { await d.accept(); } catch (e) { console.warn('[Dialog accept 경고]', e.message); }
    });

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto(`${HRC_BASE_URL}/Home/Login`, {
          waitUntil: 'domcontentloaded',
          timeout: 35000
        });
        break;
      } catch (navErr) {
        if (attempt === 3) throw navErr;
        await page.waitForTimeout(1500);
      }
    }
    await page.fill('input[type="text"]', String(loginId).trim());
    await page.fill('input[type="password"]', String(loginPw || loginId).trim());
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);

    await page.waitForSelector('a[onclick*="2026-89-0342C"]', { timeout: 20000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
      page.click('a[onclick*="2026-89-0342C"]')
    ]);

    let completedRows = [];
    if (Array.isArray(targetUids) && targetUids.length > 0) {
      completedRows = targetUids.map(u => {
        const uidStr = String(u).trim();
        const hint = slotHintMap[uidStr] || {};
        return {
          uid: uidStr,
          status: '완료',
          progress: '100%',
          buildingName: hint.buildingName || hint.companyName || ''
        };
      });
    } else {
      await page.waitForSelector('#goBuilding', { timeout: 20000 });
      await Promise.all([
        page.waitForURL(u => u.toString().includes('/q260342/List4'), { waitUntil: 'domcontentloaded', timeout: 25000 }),
        page.click('#goBuilding')
      ]);
      await page.waitForSelector('tr[id^="List4_DXDataRow"]', { timeout: 15000 }).catch(err => console.warn('[List4 행 대기 경고]', err.message));

      const seenUids = new Set();
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
              buildingName: tds[7] || ''
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
          if (!r.uid || seenUids.has(r.uid)) continue;
          seenUids.add(r.uid);
          const pctNum = parseInt(String(r.progress).replace(/[^0-9]/g, ''), 10) || 0;
          if (r.siteStatus === '완료' || pctNum >= 100) {
            completedRows.push({
              uid: r.uid,
              status: r.siteStatus,
              progress: r.progress,
              buildingName: r.buildingName
            });
          }
        }

        const nextLink = pageData.pageLinks.find(p => !visitedPages.has(p.num) && p.num > currentPageNum);
        if (!nextLink) break;

        currentPageNum = nextLink.num;
        const targetUrl = nextLink.href.startsWith('http')
          ? nextLink.href
          : `${HRC_BASE_URL}${nextLink.href}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('tr[id^="List4_DXDataRow"]', { timeout: 15000 }).catch(err => console.warn('[List4 페이지 행 대기 경고]', err.message));
      }
    }

    const results = {
      loginId,
      totalCompleted: completedRows.length,
      alreadySignedCount: 0,
      newlySignedCount: 0,
      failedCount: 0,
      signedItems: [],
      failedItems: []
    };

    for (let idx = 0; idx < completedRows.length; idx++) {
      const row = completedRows[idx];
      const hint = slotHintMap[row.uid] || {};
      onProgress({
        index: idx + 1,
        total: completedRows.length,
        uid: row.uid,
        buildingName: row.buildingName,
        message: `[${idx + 1}/${completedRows.length}] UID=${row.uid} (${row.buildingName}) 답례품 지급 서명 확인 및 처리 중...`
      });

      try {
        const res = await signHrcEnergyGiftReceipt(page, {
          uid: row.uid,
          loginId,
          loginPw,
          contactName: hint.contactName || '',
          fallbackName: hint.ceoName || '',
          rawPhone: hint.phone || ''
        });
        if (res.ok) {
          if (res.alreadySigned) {
            results.alreadySignedCount++;
          } else {
            results.newlySignedCount++;
          }
          results.signedItems.push({
            uid: row.uid,
            buildingName: row.buildingName,
            alreadySigned: Boolean(res.alreadySigned),
            signerName: res.signerName || '',
            signerPhone: res.signerPhone || '',
            styleId: res.styleId || '',
            styleLabel: res.styleLabel || '',
            giftLabel: res.giftLabel || '신세계상품권 5,000원'
          });
        } else {
          results.failedCount++;
          results.failedItems.push({
            uid: row.uid,
            buildingName: row.buildingName,
            error: res.error || '서명 저장 실패'
          });
        }
      } catch (err) {
        results.failedCount++;
        results.failedItems.push({
          uid: row.uid,
          buildingName: row.buildingName,
          error: err.message
        });
      }
    }

    return results;
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn('[Browser close 경고]', e.message));
    }
  }
}

