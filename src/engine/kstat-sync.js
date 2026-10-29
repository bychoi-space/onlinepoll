import { logger } from '../utils/logger.js';

/**
 * 케이스탯 TAPI 관리자 리스트(list.php)의 캐시된 상태(시작 ➔ 완료)를
 * Kstat 백엔드 status_refresh.php API를 통해 실시간 동기화하는 모듈
 * 
 * @param {object} params
 * @param {string} params.pridSel - 프로젝트 번호 (상인회: 2026070801, 점포: 2026070802)
 * @param {string} [params.idSel] - 테이블 행 고유 ID (생략 시 kid + 1)
 * @param {string} [params.kid] - 슬롯 번호
 * @param {string} [params.gid] - 그룹 ID (기본 '0')
 * @param {string|number} [params.srt] - 1: 본조사, 2: 조사원평가
 * @returns {Promise<object>} { success, label, status, msg }
 */
export async function syncKstatSlotStatus({ pridSel = '2026070802', idSel, kid, gid = '0', srt = 1 }) {
  const targetKid = kid != null ? String(kid) : (idSel != null ? String(Number(idSel) - 1) : null);
  const targetIdSel = idSel != null ? String(idSel) : (targetKid != null ? String(Number(targetKid) + 1) : null);

  if (!targetKid || !targetIdSel) {
    return { success: false, error: 'kid 또는 idSel 파라미터가 누락되었습니다.' };
  }

  try {
    const res = await fetch('https://survey.kstat.co.kr/kstat_survey/survey/trend/status_refresh.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        pridSel: String(pridSel),
        idSel: String(targetIdSel),
        kid: String(targetKid),
        gid: String(gid || '0'),
        method: 'tapi',
        srt: String(srt),
        proc: 'TREND_REFRESH'
      })
    });

    const data = await res.json();
    const isSuccess = data.status === '0';
    if (isSuccess) {
      logger.info(`[Kstat 상태 동기화 성공] 슬롯(kid: ${targetKid}, idSel: ${targetIdSel}, srt: ${srt}) ➔ "${data.label}"`);
    } else {
      logger.warn(`[Kstat 상태 동기화 응답] 슬롯(kid: ${targetKid}, srt: ${srt}) ➔ status: ${data.status}, msg: "${data.msg}"`);
    }

    return {
      success: isSuccess,
      label: data.label,
      status: data.status,
      msg: data.msg,
      idSel: targetIdSel,
      kid: targetKid,
      srt: String(srt)
    };
  } catch (err) {
    logger.error(`[Kstat 상태 동기화 예외] 슬롯(kid: ${targetKid}, srt: ${srt}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Kstat list.php HTML에서 행(row) 목록 및 폼 메타 정보를 파싱하는 헬퍼
 * 
 * @param {string} html - list.php 응답 HTML
 * @param {string} [pridSel] - 프로젝트 ID
 */
export function parseKstatListHtml(html, pridSel = '2026070802') {
  const mnidMatch = html.match(/name=['"]mnid['"]\s+value=['"]([^'"]*)['"]/i);
  const mnid = mnidMatch ? mnidMatch[1] : '';

  const savVarMatch = html.match(/name=['"]savVarCma['"]\s+value=['"]([^'"]*)['"]/i);
  const savVarCma = savVarMatch ? savVarMatch[1] : (pridSel === '2026070801' ? 'tap03,tap04,tap05' : 'tap03,tap06');
  const savVars = savVarCma.split(',').map(v => v.trim()).filter(Boolean);

  const srhMsgMatch = html.match(/id=['"]srhMsg['"][^>]*>[\s\S]*?(\d+)개 검색/i);
  const totalExpected = srhMsgMatch ? parseInt(srhMsgMatch[1], 10) : 0;

  const trMatches = [...html.matchAll(/<tr[^>]*id=['"]list_row_(\d+)['"][^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows = trMatches.map(m => {
    const idSel = m[1];
    const rowHtml = m[2];
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);

    const isAssoc = String(pridSel) === '2026070801';
    const marketName = (tds[isAssoc ? 3 : 5] || '').replace(/<[^>]+>/g, '').trim();
    const storeName = (tds[isAssoc ? 3 : 7] || '').replace(/<[^>]+>/g, '').trim();

    // sendWeb('idSel','kid','gid','','','1','ran_id') 추출
    const sendWebMatch = rowHtml.match(/sendWeb\('([^']+)','([^']+)','([^']*)','([^']*)','([^']*)','([^']*)','([^']+)'\)/);
    const kid = sendWebMatch ? sendWebMatch[2] : '';
    const gid = sendWebMatch ? sendWebMatch[3] : '0';
    const ranId = sendWebMatch ? sendWebMatch[7] : '';

    // savVarCma에 포함된 각 필드(tap03, tap04, tap05, tap06 등)의 현재 값 추출
    const existingVars = {};
    for (const v of savVars) {
      const fieldName = `${v}_${idSel}`;
      const selMatch = rowHtml.match(new RegExp(`<select[^>]*name=['"]${fieldName}['"][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
      if (selMatch) {
        const optSelected = selMatch[1].match(/<option\s+value=['"]([^'"]+)['"][^>]*selected/i);
        existingVars[fieldName] = optSelected ? optSelected[1] : '';
        continue;
      }
      const txtMatch = rowHtml.match(new RegExp(`<textarea[^>]*name=['"]${fieldName}['"][^>]*>([\\s\\S]*?)<\\/textarea>`, 'i'));
      if (txtMatch) {
        existingVars[fieldName] = txtMatch[1];
        continue;
      }
      const inpMatch = rowHtml.match(new RegExp(`<input[^>]*name=['"]${fieldName}['"][^>]*value=['"]([^'"]*)['"]`, 'i'));
      if (inpMatch) {
        existingVars[fieldName] = inpMatch[1];
        continue;
      }
      existingVars[fieldName] = '';
    }

    const tap03Val = existingVars[`tap03_${idSel}`] || '';

    // [조사표 작성] (srt=1) 버튼 텍스트 확인
    const srt1Match = rowHtml.match(/onclick=["']sendWeb\([^)]*,\s*['"]1['"]\s*,\s*['"][^'"]+['"]\);?["'][^>]*>([\s\S]*?)<\/button>/i);
    const srt1Text = srt1Match ? srt1Match[1].replace(/<[^>]+>/g, '').trim() : '';

    // [조사원 평가항목 작성] (srt=2) 버튼 텍스트 확인
    const srt2Match = rowHtml.match(/onclick=["']sendWeb\([^)]*,\s*['"]2['"]\s*,\s*['"][^'"]+['"]\);?["'][^>]*>([\s\S]*?)<\/button>/i);
    const srt2Text = srt2Match ? srt2Match[1].replace(/<[^>]+>/g, '').trim() : '';

    return {
      idSel,
      kid,
      gid,
      ranId,
      marketName,
      storeName,
      tap03Val,
      existingVars,
      srt1Text,
      srt2Text,
      bothCompleted: srt1Text === '완료' && srt2Text === '완료'
    };
  });

  return { mnid, savVarCma, totalExpected, rows };
}

/**
 * Kstat 관리자 포털에 HTTP 로그인하여 세션 쿠키 및 1페이지 데이터를 반환
 */
async function createKstatHttpSession({ loginId, loginPw = '1234', pridSel = '2026070802' }) {
  const cleanId = String(loginId || '').trim();
  const cleanPw = String(loginPw || '1234').trim();
  if (!cleanId) {
    throw new Error('Kstat 로그인 ID(조사원 성명)가 필요합니다.');
  }

  const loginRes = await fetch('https://survey.kstat.co.kr/kstat_survey/inc/login_ok.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: cleanId, pw: cleanPw }).toString(),
    redirect: 'manual'
  });

  const setCookies = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get('set-cookie')];
  const cookieHeader = setCookies.filter(Boolean).map(c => c.split(';')[0]).join('; ');

  if (!cookieHeader) {
    throw new Error(`Kstat 로그인 세션 쿠키 획득 실패 (계정: ${cleanId})`);
  }

  const page1Url = `https://survey.kstat.co.kr/kstat_survey/survey/${pridSel}/list.php?pridSel=${pridSel}&josa=tapi`;
  const page1Res = await fetch(page1Url, {
    headers: { Cookie: cookieHeader }
  });
  const page1Html = await page1Res.text();

  if (page1Html.includes('floatingPassword') || !page1Html.includes('list_tbl')) {
    throw new Error(`Kstat 리스트 페이지 접근 실패 또는 계정 불일치 (계정: ${cleanId}, PRID: ${pridSel})`);
  }

  const page1Parsed = parseKstatListHtml(page1Html, pridSel);
  return { cookieHeader, page1Html, page1Parsed };
}

/**
 * 특정 행(row)의 [조사 진행상태](tap03_{idSel})를 '1'(조사완료)로 저장 요청 전송
 */
async function postKstatRowSave({ cookieHeader, pridSel, mnid, savVarCma, row, statusVal = '1' }) {
  const payload = {
    is_survey: '0',
    curPage: '',
    pridSel: String(pridSel),
    idSel: String(row.idSel),
    pnidSel: '',
    mnid: String(mnid || ''),
    preSel: '',
    savVarCma: String(savVarCma || 'tap03,tap06'),
    ...(row.existingVars || {}),
    [`tap03_${row.idSel}`]: String(statusVal)
  };

  const res = await fetch(`https://survey.kstat.co.kr/kstat_survey/survey/${pridSel}/list_proc.php?proc=SAV`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader
    },
    body: new URLSearchParams(payload).toString(),
    redirect: 'manual'
  });

  return res.status === 200 || res.status === 302;
}

/**
 * 단일 설문 슬롯이 [조사표 작성: 완료] 및 [조사원 평가항목 작성: 완료] 상태일 때,
 * Kstat list.php의 [조사 진행상태](tap03)를 자동으로 '조사완료'(1)로 변경 및 저장하는 함수
 * 
 * @param {object} params
 * @param {string} [params.pridSel='2026070802'] - 프로젝트 코드
 * @param {string|number} [params.idSel] - 행 고유 ID
 * @param {string|number} [params.kid] - 슬롯 kid
 * @param {string|number} [params.gid='0'] - 슬롯 gid
 * @param {string} [params.ranId] - 슬롯 고유 키 (KID 파라미터)
 * @param {string} params.loginId - 조사원 로그인 ID
 * @param {string} [params.loginPw='1234'] - 조사원 로그인 암호
 * @returns {Promise<object>}
 */
export async function saveKstatSlotProgressStatus({
  pridSel = '2026070802',
  idSel,
  kid,
  gid = '0',
  ranId,
  loginId,
  loginPw = '1234'
}) {
  try {
    const cleanLoginId = String(loginId || '').trim();
    if (!cleanLoginId) {
      return { success: false, error: '조사원 로그인 계정(loginId)이 지정되지 않았습니다.' };
    }

    // 1. 만약 idSel 또는 kid가 있다면 먼저 status_refresh.php로 본설문(1) 및 평가(2) 캐시 갱신 보장
    if (idSel || kid) {
      await syncKstatSlotStatus({ pridSel, idSel, kid, gid, srt: 1 }).catch(() => {});
      await syncKstatSlotStatus({ pridSel, idSel, kid, gid, srt: 2 }).catch(() => {});
    }

    // 2. Kstat HTTP 로그인 및 페이지 탐색
    const { cookieHeader, page1Parsed } = await createKstatHttpSession({
      loginId: cleanLoginId,
      loginPw,
      pridSel
    });

    const { mnid, savVarCma, totalExpected } = page1Parsed;
    const totalPages = Math.ceil(totalExpected / 15) || 1;
    const targetIdStr = idSel != null ? String(idSel).trim() : '';
    const targetRanStr = ranId != null ? String(ranId).trim() : '';

    const matchRow = (r) => {
      if (targetIdStr && String(r.idSel) === targetIdStr) return true;
      if (targetRanStr && String(r.ranId) === targetRanStr) return true;
      return false;
    };

    let foundRow = page1Parsed.rows.find(matchRow);
    let foundPage = 1;

    if (!foundRow) {
      for (let p = 2; p <= totalPages + 2; p++) {
        const pRes = await fetch(`https://survey.kstat.co.kr/kstat_survey/survey/${pridSel}/list.php?curPage=${p}&pridSel=${pridSel}&josa=tapi`, {
          headers: { Cookie: cookieHeader }
        });
        const pHtml = await pRes.text();
        const parsed = parseKstatListHtml(pHtml, pridSel);
        if (!parsed.rows || parsed.rows.length === 0) break;
        foundRow = parsed.rows.find(matchRow);
        if (foundRow) {
          foundPage = p;
          break;
        }
      }
    }

    if (!foundRow) {
      logger.warn(`[Kstat 진행상태 자동저장] 슬롯(idSel: ${targetIdStr}, ranId: ${targetRanStr})을 계정 "${cleanLoginId}" 리스트에서 찾지 못했습니다.`);
      return { success: false, error: '대상 슬롯을 리스트에서 찾지 못했습니다.' };
    }

    // 만약 리스트 캐시에 아직 '완료'가 반영되지 않았다면, 찾은 행의 idSel/kid로 캐시 갱신 후 해당 페이지만 재조회
    if (!foundRow.bothCompleted && foundRow.idSel && foundRow.kid) {
      await syncKstatSlotStatus({ pridSel, idSel: foundRow.idSel, kid: foundRow.kid, gid: foundRow.gid, srt: 1 }).catch(() => {});
      await syncKstatSlotStatus({ pridSel, idSel: foundRow.idSel, kid: foundRow.kid, gid: foundRow.gid, srt: 2 }).catch(() => {});

      const reRes = await fetch(`https://survey.kstat.co.kr/kstat_survey/survey/${pridSel}/list.php?curPage=${foundPage}&pridSel=${pridSel}&josa=tapi`, {
        headers: { Cookie: cookieHeader }
      });
      const reHtml = await reRes.text();
      const reParsed = parseKstatListHtml(reHtml, pridSel);
      const updatedRow = reParsed.rows.find(r => String(r.idSel) === String(foundRow.idSel));
      if (updatedRow) foundRow = updatedRow;
    }

    // 핵심 전제 조건 검증: [조사표 작성] === '완료' AND [조사원 평가항목 작성] === '완료'
    if (!foundRow.bothCompleted) {
      logger.warn(`[Kstat 진행상태 자동저장 보류] 슬롯(idSel: ${foundRow.idSel}, 점포: "${foundRow.storeName}") ➔ 조사표("${foundRow.srt1Text}") / 평가("${foundRow.srt2Text}") 중 미완료 항목이 있어 진행상태를 변경하지 않습니다.`);
      return {
        success: false,
        skipped: true,
        reason: `조사표(${foundRow.srt1Text}) 및 평가(${foundRow.srt2Text}) 동시 완료 조건 미충족`,
        idSel: foundRow.idSel
      };
    }

    if (foundRow.tap03Val === '1') {
      logger.info(`[Kstat 진행상태 확인] 슬롯(idSel: ${foundRow.idSel}, 점포: "${foundRow.storeName}")은 이미 '조사완료' 상태입니다.`);
      return {
        success: true,
        alreadyDone: true,
        idSel: foundRow.idSel,
        storeName: foundRow.storeName
      };
    }

    const saved = await postKstatRowSave({
      cookieHeader,
      pridSel,
      mnid,
      savVarCma,
      row: foundRow,
      statusVal: '1'
    });

    if (saved) {
      logger.success(`✅ [Kstat 진행상태 자동저장 완료] "${foundRow.marketName} - ${foundRow.storeName}" (idSel: ${foundRow.idSel}) ➔ [조사 진행상태: 조사완료] 저장 성공!`);
    }

    return {
      success: saved,
      idSel: foundRow.idSel,
      ranId: foundRow.ranId,
      marketName: foundRow.marketName,
      storeName: foundRow.storeName
    };
  } catch (err) {
    logger.error(`[Kstat 진행상태 자동저장 오류] ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * 특정 조사원 계정(loginId)의 전체 리스트 페이지를 순회하며
 * [조사표 작성 === '완료'] 이고 [조사원 평가항목 작성 === '완료']인 모든 슬롯의
 * [조사 진행상태]를 '조사완료'('1')로 일괄 변경 및 저장하는 함수
 * 
 * @param {object} params
 * @param {string} params.loginId - 조사원 로그인 ID
 * @param {string} [params.loginPw='1234'] - 조사원 비밀번호
 * @param {string} [params.pridSel='2026070802'] - 프로젝트 코드 (기본 점포조사 2026070802)
 * @param {Set<string>|Array<string>|null} [params.filterRanIds=null] - 특정 ranId 집합만 대상화할 경우 지정
 * @param {number} [params.concurrency=10] - 동시 저장 요청 수
 */
export async function bulkUpdateKstatAccountProgress({
  loginId,
  loginPw = '1234',
  pridSel = '2026070802',
  filterRanIds = null,
  concurrency = 10
}) {
  const { cookieHeader, page1Parsed } = await createKstatHttpSession({
    loginId,
    loginPw,
    pridSel
  });

  const { mnid, savVarCma, totalExpected } = page1Parsed;
  const allRows = [...page1Parsed.rows];
  const seenIds = new Set(page1Parsed.rows.map(r => r.idSel));
  const totalPages = Math.ceil(totalExpected / 15) || 1;

  for (let p = 2; p <= totalPages + 2; p++) {
    const pRes = await fetch(`https://survey.kstat.co.kr/kstat_survey/survey/${pridSel}/list.php?curPage=${p}&pridSel=${pridSel}&josa=tapi`, {
      headers: { Cookie: cookieHeader }
    });
    const pHtml = await pRes.text();
    const parsed = parseKstatListHtml(pHtml, pridSel);
    let added = 0;
    for (const r of parsed.rows) {
      if (!seenIds.has(r.idSel)) {
        seenIds.add(r.idSel);
        allRows.push(r);
        added++;
      }
    }
    if (added === 0) break;
  }

  const ranIdSet = filterRanIds
    ? (filterRanIds instanceof Set ? filterRanIds : new Set(filterRanIds))
    : null;

  const candidateRows = ranIdSet
    ? allRows.filter(r => r.ranId && ranIdSet.has(r.ranId))
    : allRows;

  // 엄격한 전제조건: [조사표 작성] === '완료' AND [조사원 평가항목 작성] === '완료'
  const bothCompletedRows = candidateRows.filter(r => r.bothCompleted);
  const alreadyCompletedRows = bothCompletedRows.filter(r => r.tap03Val === '1');
  const toUpdateRows = bothCompletedRows.filter(r => r.tap03Val !== '1');

  let updatedCount = 0;
  const batchSize = Math.max(1, concurrency);

  for (let i = 0; i < toUpdateRows.length; i += batchSize) {
    const chunk = toUpdateRows.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(row =>
        postKstatRowSave({
          cookieHeader,
          pridSel,
          mnid,
          savVarCma,
          row,
          statusVal: '1'
        }).catch(() => false)
      )
    );
    updatedCount += results.filter(Boolean).length;
  }

  logger.info(`[Kstat 일괄 진행상태 변경] 계정="${loginId}" (PRID=${pridSel}) | 전체:${candidateRows.length}건 | 조사표+평가 둘다완료:${bothCompletedRows.length}건 (기존완료:${alreadyCompletedRows.length}건, 신규저장:${updatedCount}건)`);

  return {
    success: true,
    loginId,
    pridSel,
    mnid,
    totalRows: candidateRows.length,
    bothCompletedCount: bothCompletedRows.length,
    alreadyCompletedCount: alreadyCompletedRows.length,
    updatedCount
  };
}

/**
 * 캠페인 내 완료된 모든 쿼터 슬롯의 Kstat list.php 상태를 일괄 동기화하고,
 * [조사표 작성: 완료] + [조사원 평가항목 작성: 완료]인 슬롯의 [조사 진행상태]를 '조사완료'로 자동 저장
 * 
 * @param {object} campaign - 캠페인 객체
 * @returns {Promise<object>}
 */
export async function syncCampaignKstatSlots(campaign) {
  const quotas = campaign?.quotaDatabase || [];
  const isAssoc = campaign?.surveyType === 'kstat_assoc' || campaign?.isAssoc;
  const pridSel = isAssoc ? '2026070801' : (campaign?.targetPrid || '2026070802');
  const results = [];

  for (const q of quotas) {
    const rawKid = q.kid || q.kstatMeta?.kid;
    const rawIdSel = q.idSel || q.kstatMeta?.idSel;
    const rawGid = q.gid || q.kstatMeta?.gid || '0';

    const kid = rawKid != null ? String(rawKid) : (rawIdSel != null ? String(Number(rawIdSel) - 1) : null);
    const idSel = rawIdSel != null ? String(rawIdSel) : (kid != null ? String(Number(kid) + 1) : null);
    if (!kid && !idSel) continue;

    const rowRes = {
      marketName: q.marketName || q.companyName,
      kid,
      idSel,
      srt1: null,
      srt2: null
    };

    // 본설문 동기화
    if (q.quotaStatus === 'completed' || q.quotaStatus === 'pilot_done') {
      rowRes.srt1 = await syncKstatSlotStatus({
        pridSel,
        idSel,
        kid,
        gid: rawGid,
        srt: 1
      });
    }

    // 조사원 평가 동기화
    if (q.evalStatus === 'completed' || q.quotaStatus === 'completed' || q.quotaStatus === 'pilot_done') {
      rowRes.srt2 = await syncKstatSlotStatus({
        pridSel,
        idSel,
        kid,
        gid: rawGid,
        srt: 2
      });
    }

    results.push(rowRes);
  }

  // 조사원 계정 기반으로 [조사표 작성: 완료] + [조사원 평가항목 작성: 완료] 슬롯의 [조사 진행상태]를 '조사완료'(1)로 일괄 저장
  let progressUpdateSummary = null;
  const loginId = campaign?.kstatLoginId || quotas.find(q => q.surveyorAccount)?.surveyorAccount;
  const loginPw = campaign?.kstatLoginPw || '1234';
  if (loginId) {
    try {
      const ranIds = quotas
        .map(q => q.ranId || q.ran_id || (q.slotUrl || '').match(/[?&]KID=([^&]+)/i)?.[1])
        .filter(Boolean);
      progressUpdateSummary = await bulkUpdateKstatAccountProgress({
        loginId,
        loginPw,
        pridSel,
        filterRanIds: ranIds.length > 0 ? ranIds : null
      });
    } catch (err) {
      logger.warn(`[Kstat 캠페인 진행상태 일괄저장 경고] ${err.message}`);
    }
  }

  return {
    success: true,
    totalQuotas: quotas.length,
    syncedCount: results.length,
    progressUpdateSummary,
    results
  };
}
