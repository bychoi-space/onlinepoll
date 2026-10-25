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
export async function syncKstatSlotStatus({ pridSel = '2026070801', idSel, kid, gid = '0', srt = 1 }) {
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
 * 캠페인 내 완료된 모든 쿼터 슬롯의 Kstat list.php 상태를 일괄 동기화
 * 
 * @param {object} campaign - 캠페인 객체
 * @returns {Promise<object>}
 */
export async function syncCampaignKstatSlots(campaign) {
  const quotas = campaign?.quotaDatabase || [];
  const pridSel = campaign?.isAssoc ? '2026070801' : (campaign?.targetPrid || '2026070801');
  const results = [];

  for (const q of quotas) {
    const kid = q.kid || (q.idSel ? String(Number(q.idSel) - 1) : null);
    const idSel = q.idSel || (kid ? String(Number(kid) + 1) : null);
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
        gid: q.gid || '0',
        srt: 1
      });
    }

    // 조사원 평가 동기화
    if (q.evalStatus === 'completed' || q.quotaStatus === 'completed') {
      rowRes.srt2 = await syncKstatSlotStatus({
        pridSel,
        idSel,
        kid,
        gid: q.gid || '0',
        srt: 2
      });
    }

    results.push(rowRes);
  }

  return {
    success: true,
    totalQuotas: quotas.length,
    syncedCount: results.length,
    results
  };
}
