import { launchChromium } from '../utils/chromium-launcher.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { exportBusinessesToExcel } from '../utils/excel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

export const GLOBALRI_DEFAULT_CONFIG = {
  portalUrl: 'https://gift.globalri.it/login',
  projectID: 'GR20260618-1-001-02',
  projectName: '제5차 성인문해능력조사',
  snum: 5963,
  loginId: '01071447791',
  loginPw: '2038020',
  interviewerId: '노영미7791'
};

/**
 * 출생연도(예: '2002년' 또는 2002)로부터 만 나이(2026년 기준) 및 나이대 그룹 코드 산출
 */
export function getAgeGroupFromBirthYear(rawBirthYear, baseYear = 2026) {
  const num = parseInt(String(rawBirthYear || '').replace(/[^0-9]/g, ''), 10);
  if (!num || num < 1900 || num > baseYear) {
    return {
      birthYear: num || 1980,
      age: 46,
      ageGroup: 'age40',
      ageGroupLabel: '40대'
    };
  }
  const age = baseYear - num;
  if (age < 30) {
    return { birthYear: num, age, ageGroup: 'age20', ageGroupLabel: '20대' };
  }
  if (age < 40) {
    return { birthYear: num, age, ageGroup: 'age30', ageGroupLabel: '30대' };
  }
  if (age < 50) {
    return { birthYear: num, age, ageGroup: 'age40', ageGroupLabel: '40대' };
  }
  if (age < 60) {
    return { birthYear: num, age, ageGroup: 'age50', ageGroupLabel: '50대' };
  }
  if (age < 70) {
    return { birthYear: num, age, ageGroup: 'age60', ageGroupLabel: '60대' };
  }
  return { birthYear: num, age, ageGroup: 'age70', ageGroupLabel: '70대 이상' };
}

export const GLOBALRI_QUOTA_COLUMNS = [
  { key: 'seq', label: '순번' },
  { key: 'lid', label: '가구 LID' },
  { key: 'memberUid', label: '개인 UID' },
  { key: 'respondentName', label: '대상자 성명' },
  { key: 'gender', label: '성별' },
  { key: 'birthYear', label: '출생연도' },
  { key: 'age', label: '연령(세)' },
  { key: 'ageGroupLabel', label: '나이대 그룹' },
  { key: 'relation', label: '가구주 관계' },
  { key: 'sigungu', label: '시군구' },
  { key: 'dong', label: '읍면동' },
  { key: 'address', label: '가구 주소' },
  { key: 'memberStatus', label: '진행 상태' },
  { key: 'householdUrl', label: '가구원 현황 URL' }
];

export function findGlobalriQuotaJsonPath(interviewerCode = '7791') {
  if (!fs.existsSync(quotasDir)) return null;
  const exact = path.join(quotasDir, `quota_globalri_adult_literacy_${interviewerCode}.json`);
  if (fs.existsSync(exact)) return exact;
  const files = fs.readdirSync(quotasDir).filter(f => f.startsWith('quota_globalri_adult_literacy') && f.endsWith('.json'));
  if (files.length > 0) return path.join(quotasDir, files[0]);
  return null;
}

/**
 * 글로벌리서치 통합조사시스템(GIFT) + w3.onsurvey.kr 가구원 현황 실시간 스크래퍼
 * - 1단계: gift-manager.globalri.it 인증 토큰 발급
 * - 2단계: gift-list.globalri.it 에서 GR20260618-1-001-02 전체 가구 목록 조회
 * - 3단계: [결과값1=완료 & 결과값2=완료] (또는 사용자 지정 LID 목록) 가구 필터링
 * - 4단계: w3.onsurvey.kr/.../Index.asp ➔ Survey.asp 접속하여 [진행 상태 = '진행 중'] 가구원 추출
 */
export async function scrapeGlobalriLiteracyQuotas(options = {}) {
  const {
    loginId = GLOBALRI_DEFAULT_CONFIG.loginId,
    loginPw = GLOBALRI_DEFAULT_CONFIG.loginPw,
    projectID = GLOBALRI_DEFAULT_CONFIG.projectID,
    lidFilter = '',
    onlyInProgress = true
  } = options;

  logger.info(`[글로벌리서치 성인문해능력조사] 포털 인증 및 대상 가구 조회 시작 (ID: ${loginId}, 프로젝트: ${projectID})`);

  // 1. GIFT 로그인 토큰 획득
  const authUrl = `https://gift-manager.globalri.it/api/auth/head?ID=${encodeURIComponent(loginId)}&Password=${encodeURIComponent(loginPw)}&Type=1&ServiceName=GIFT-Client`;
  const authRes = await fetch(authUrl);
  if (!authRes.ok) {
    throw new Error(`글로벌리서치 로그인 실패 (HTTP ${authRes.status})`);
  }
  const authJson = await authRes.json();
  const token = authJson.jwt
    ? `Bearer ${authJson.jwt}`
    : (authRes.headers.get('authorization') || authRes.headers.get('Authorization') || '');
  const interviewerId = authJson.name || GLOBALRI_DEFAULT_CONFIG.interviewerId;

  // 2. 전체 리스트 조회
  const listRes = await fetch('https://gift-list.globalri.it/api/list/get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {})
    },
    body: JSON.stringify({
      prjCode: projectID,
      pageSize: 500,
      pageNumber: 1,
      filterInfo: [
        { field: '필드 면접원', operator: 0, valueArray: [interviewerId], andOr: 0, target: 0, groupName: '_BASE', fieldType: 0 },
        { field: '사용 여부', operator: 0, valueArray: ['O'], andOr: 0, target: 0, groupName: '_BASE', fieldType: 0 }
      ]
    })
  });
  if (!listRes.ok) {
    throw new Error(`글로벌리서치 리스트 조회 실패 (HTTP ${listRes.status})`);
  }
  const listJson = await listRes.json();
  const allItems = listJson.listInfoArray || listJson.items || [];

  // 3. LID 필터 파싱 (사용자가 직접 입력한 경우 우선 적용, 없으면 결과값1=완료 & 결과값2=완료 자동 필터)
  const parsedLids = String(lidFilter || '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.padStart(6, '0'));

  const targetHouseholds = allItems.filter(item => {
    const rawLid = String(item.lid || item.listID || '').trim();
    const lid = rawLid.padStart(6, '0');
    if (parsedLids.length > 0) {
      return parsedLids.includes(lid) || parsedLids.includes(rawLid);
    }
    const resBase = item.groupResult?._BASE || item;
    return String(resBase.mainCode) === '1' && String(resBase.subCode) === '101';
  });

  logger.info(`[글로벌리서치 성인문해능력조사] 전체 ${allItems.length}가구 중 대상 가구 ${targetHouseholds.length}가구 선별 완료 (${parsedLids.length > 0 ? `지정 LID ${parsedLids.length}건` : '결과값1=완료 & 결과값2=완료'})`);

  // 기존 쿼터 파일이 있으면 기완료/Part C 완료 대상자의 상태·답안 보존을 위해 로드
  const jsonFileName = 'quota_globalri_adult_literacy_7791.json';
  const excelFileName = 'quota_globalri_adult_literacy_7791.xlsx';
  const jsonFilePath = path.join(quotasDir, jsonFileName);
  const excelFilePath = path.join(quotasDir, excelFileName);
  let existingMembers = [];
  if (fs.existsSync(jsonFilePath)) {
    try {
      const prevJson = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
      existingMembers = Array.isArray(prevJson.data) ? prevJson.data : [];
    } catch (_) {}
  }
  const existingMap = new Map(existingMembers.map(m => [String(m.memberUid || m.uid), m]));

  // 4. Headless Playwright로 각 가구의 Survey.asp 가구원 조사 현황 수집
  const browser = await launchChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // 기존 멤버 순번(1~N)을 먼저 보존하고 신규 발견된 '진행 중' 가구원을 뒤에 추가
  const quotaMembers = existingMembers.map((m, idx) => ({
    ...m,
    index: idx + 1,
    seq: idx + 1
  }));
  const seenMemberUids = new Set(quotaMembers.map(m => String(m.memberUid || m.uid)));
  const householdSummaries = [];

  try {
    for (const hh of targetHouseholds) {
      const f = hh.groupData?._BASE || hh.fields || {};
      const lid = String(hh.lid || hh.listID || '').trim();
      const householdUid = String(hh.uid || f['UID'] || '').trim();
      const chuga = String(f['추가'] || '').trim();
      const sido = '인천광역시';
      const sigungu = String(f['시군구명'] || f['시군구'] || '').trim();
      const dong = String(f['읍면동명'] || f['읍면동'] || '').trim();
      const areaNo = String(f['조사구번호'] || '').trim();
      const gagu = String(f['가구유형'] || f['가구소재'] || '25').trim();
      const region21 = String(f['지역'] || f['지역코드'] || '22').trim();
      const sidoCode = String(f['시도명'] || f['시도코드'] || '7').trim();
      const address = String(f['주소 통합'] || [sido, sigungu, dong, f['도로명'], f['건물번호'], f['상세주소']].filter(Boolean).join(' ')).trim();

      const indexUrl =
        `https://w3.onsurvey.kr/2026/G20260713001-001/Index.asp` +
        `?UID=${encodeURIComponent(householdUid)}` +
        `&REGION21=${encodeURIComponent(region21)}` +
        `&SIDO=${encodeURIComponent(sidoCode)}` +
        `&SIGUNGU=${encodeURIComponent(sigungu)}` +
        `&DONG=${encodeURIComponent(dong)}` +
        `&AREA_NO=${encodeURIComponent(areaNo)}` +
        `&HOUSEHOLD=${encodeURIComponent(lid)}` +
        `&RETURN=1&GN=_BASE&ME=1` +
        `&INTERVIEWER_ID=${encodeURIComponent(interviewerId)}` +
        `&GAGU=${encodeURIComponent(gagu)}&SURVEY_TYPE=2`;

      await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(err => {
        logger.warn(`[LID ${lid}] 가구 페이지 접속 지연: ${err.message}`);
      });
      await page.waitForTimeout(600);

      const extracted = await page.evaluate(() => {
        const currentUrl = location.href;
        const rows = [];
        document.querySelectorAll('table tbody tr').forEach(tr => {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
          const btn = tr.querySelector('button, a, input[type="button"]');
          const onclick = btn ? (btn.getAttribute('onclick') || '') : '';
          const match = onclick.match(/fn_survey\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/);
          if (tds.length >= 6) {
            rows.push({
              no: tds[0],
              name: tds[1],
              gender: tds[2],
              relation: tds[3],
              birthYear: tds[4],
              status: tds[5],
              btnText: btn ? (btn.innerText || btn.value || '').trim() : '',
              actionType: match ? match[1] : 'START',
              memberUid: match ? match[2] : ''
            });
          }
        });
        return { currentUrl, rows };
      });

      const inProgressRows = extracted.rows.filter(r => r.status === '진행 중');
      const targetRows = onlyInProgress ? inProgressRows : extracted.rows;

      householdSummaries.push({
        lid,
        householdUid,
        chuga,
        address,
        indexUrl,
        finalUrl: extracted.currentUrl,
        totalMembers: extracted.rows.length,
        inProgressCount: inProgressRows.length
      });

      for (const row of targetRows) {
        const ageMeta = getAgeGroupFromBirthYear(row.birthYear);
        const memberUid = row.memberUid || `${householdUid}_${String(row.no || '1').padStart(2, '0')}`;
        if (seenMemberUids.has(memberUid)) {
          continue;
        }
        seenMemberUids.add(memberUid);
        const seq = quotaMembers.length + 1;
        const isCompleted = row.status === '완료';
        const prev = existingMap.get(memberUid);

        quotaMembers.push({
          ...(prev || {}),
          index: seq,
          seq,
          lid,
          householdUid,
          memberNo: parseInt(row.no, 10) || 1,
          uid: memberUid,
          memberUid,
          companyName: `${row.name} (LID ${lid})`,
          ceoName: row.name,
          respondentName: row.name,
          ceoGender: row.gender,
          gender: row.gender,
          birthYear: ageMeta.birthYear,
          ceoAge: ageMeta.age,
          age: ageMeta.age,
          ageGroup: ageMeta.ageGroup,
          ageGroupLabel: `${ageMeta.ageGroupLabel.replace(/\s*그룹$/, '')}${ageMeta.ageGroup === 'age70' ? '' : ' 그룹'}`,
          industry: `${ageMeta.ageGroupLabel.replace(/\s*그룹$/, '')}${ageMeta.ageGroup === 'age70' ? '' : ' 그룹'}`,
          handledItems: `${ageMeta.ageGroupLabel} (${ageMeta.age}세 · ${row.relation})`,
          relation: row.relation,
          sido,
          sigungu,
          dong,
          areaNo,
          address,
          householdUrl: indexUrl,
          slotUrl: indexUrl,
          surveyUrl: indexUrl,
          memberStatus: row.status,
          status: prev?.status || (isCompleted ? '완료' : '진행 중'),
          quotaStatus: prev?.quotaStatus || (isCompleted ? 'completed' : 'ready'),
          progress: prev?.progress || (isCompleted ? '100%' : '8% (Part A 대기)'),
          surveyorId: loginId,
          surveyorName: interviewerId
        });
      }
    }
  } finally {
    await browser.close();
  }

  // 쿼터 파일 저장
  if (!fs.existsSync(quotasDir)) {
    fs.mkdirSync(quotasDir, { recursive: true });
  }

  const ageGroupBreakdown = {};
  quotaMembers.forEach(m => {
    ageGroupBreakdown[m.ageGroupLabel] = (ageGroupBreakdown[m.ageGroupLabel] || 0) + 1;
  });

  const quotaPayload = {
    title: `[GR20260618-1-001-02] 제5차 성인문해능력조사 - ${interviewerId} (진행중 ${quotaMembers.length}명)`,
    type: 'GLOBALRI_ADULT_LITERACY',
    surveyType: 'globalri_literacy',
    projectID,
    snum: 5963,
    surveyorId: loginId,
    surveyorName: interviewerId,
    marketName: `제5차 성인문해능력조사 · ${interviewerId}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetTotal: quotaMembers.length,
    count: quotaMembers.length,
    isComplete: true,
    ageGroupBreakdown,
    householdSummaries,
    columns: GLOBALRI_QUOTA_COLUMNS,
    data: quotaMembers
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(quotaPayload, null, 2), 'utf-8');
  if (quotaMembers.length > 0) {
    exportBusinessesToExcel({
      data: quotaMembers,
      columns: GLOBALRI_QUOTA_COLUMNS,
      filePath: excelFilePath
    });
  }

  logger.success(`[글로벌리서치 성인문해능력조사] 총 ${quotaMembers.length}명의 '진행 중' 설문 대상자 쿼터 저장 완료 (${jsonFileName})`);

  return {
    success: true,
    totalHouseholdsChecked: targetHouseholds.length,
    totalMembers: quotaMembers.length,
    ageGroupBreakdown,
    householdSummaries,
    quotaMembers,
    jsonFileName,
    excelFileName,
    jsonFilePath,
    excelFilePath
  };
}

