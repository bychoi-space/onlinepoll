/**
 * 2025년 기준 에너지총조사 (건물 부문) 구글 시트 쿼터 리스트 (10개 조사원 계정 전체)
 * - 강영미_700275, 강경옥_700277, 김정례_701493, 유희정-701494, 강영미-700193, 김정례_700189, 문선영-701492, 최미자-700550, 김재순701495, 정소영_701497
 * - 시트 건물별 엔지니어링 가이드(A5-1, T41, B1-1, C5-2, 신재생에너지, D1-2-1 계약전력, D2-1 도시가스, 예상유형코드, 주소/메모) 파싱
 * - 대체 표본 등 가이드 공란 행은 '예상기준' 시트의 21개 유형 프리셋으로 자동 추론 보강
 * - 기존 data/quotas/ JSON에 기록된 완료/진행률/수령증 서명 상태를 100% 보존하여 병합 저장
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import {
  createRespondentUsedState,
  isValidRespondentName,
  pickRespondentFromPool
} from '../src/utils/respondent-pool.js';
import { resolveHrcBuildingCeilingHeightM } from '../src/engine/hrc-energy-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

if (!fs.existsSync(quotasDir)) {
  fs.mkdirSync(quotasDir, { recursive: true });
}

export const ACCOUNT_SHEETS = [
  { sheetName: '강영미_700275', accountId: '700275', surveyorName: '강영미', regionDesc: '서울 (노원구/그외)', quotaTableCol: 26 },
  { sheetName: '강경옥_700277', accountId: '700277', surveyorName: '강경옥', regionDesc: '인천 (부평구/그외)', quotaTableCol: 26 },
  { sheetName: '김정례_701493', accountId: '701493', surveyorName: '김정례', regionDesc: '서울 (노원구/그외) + 인천 (연수·남동·미추홀/그외)', quotaTableCol: 26 },
  { sheetName: '유희정-701494', accountId: '701494', surveyorName: '유희정', regionDesc: '서울 (구로구/송파구/용산구)', quotaTableCol: 26 },
  { sheetName: '강영미-700193', accountId: '700193', surveyorName: '강영미', regionDesc: '서울 (노원구 · 건물 15부)', quotaTableCol: 21 },
  { sheetName: '김정례_700189', accountId: '700189', surveyorName: '김정례', regionDesc: '경기 (남양주시 · 건물 25부)', quotaTableCol: null },
  { sheetName: '문선영-701492', accountId: '701492', surveyorName: '문선영', regionDesc: '경기 (수원·안양·안산·화성·용인 등)', quotaTableCol: 26 },
  { sheetName: '최미자-700550', accountId: '700550', surveyorName: '최미자', regionDesc: '서울 (동대문·종로·중구·용산·금천 외 · 전화번호 확보분)', quotaTableCol: 26, requirePhone: true },
  {
    sheetName: '김재순701495',
    accountId: '701495',
    surveyorName: '김재순',
    regionDesc: '경기 (남양주·구리·의정부·화성 외 · 전화번호 확보분)',
    layout: 'compact_selected',
    defaultSido: '경기',
    quotaTableCol: 24,
    quotaTableMode: 'no_sido',
    requirePhone: true
  },
  {
    sheetName: '정소영_701497',
    accountId: '701497',
    surveyorName: '정소영',
    regionDesc: '서울 (강남·서초·영등포·송파 외 · 서초/성북 열 전화번호 확보분)',
    layout: 'compact_selected_qcol',
    defaultSido: '서울',
    quotaTableCol: 25,
    quotaTableMode: 'dual_quota_no_sido',
    requirePhone: true
  }
];

const MAIN_USE_CODE_MAP = {
  '제1종근린생활시설': '1001',
  '제2종근린생활시설': '1002',
  '문화및집회시설': '1003',
  '판매시설': '1004',
  '의료시설': '1005',
  '교육연구시설': '1006',
  '업무시설': '1007',
  '숙박시설': '1008',
  '방송통신시설': '1009'
};

const AREA_SCALE_CODE_MAP = {
  '3,000-5,000㎡': '1001',
  '5,000-10,000㎡': '1002',
  '10,000-30,000㎡': '1003',
  '30,000-50,000㎡': '1004',
  '50,000㎡ 초과': '1005'
};

const AREA_SCALE_MID_M2 = {
  '3,000-5,000㎡': 4000,
  '5,000-10,000㎡': 7500,
  '10,000-30,000㎡': 16000,
  '30,000-50,000㎡': 38000,
  '50,000㎡ 초과': 60000
};

/**
 * 구글 시트 '예상기준' 탭의 21개 건물 유형 프리셋
 */
export const EXPECTED_TYPE_PRESETS = {
  G1:  { desc: '근생·상가 소형(5천㎡ 미만)', t41: '식음료시설, 판매시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.10, a51: '③ 개별방식' },
  G2:  { desc: '근생·상가 중대형(5천㎡ 이상)', t41: '식음료시설, 판매시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.10, a51: '③ 개별방식' },
  MD:  { desc: '메디컬빌딩(근생)', t41: '식음료시설, 판매시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.12, a51: '③ 개별방식' },
  RT:  { desc: '백화점·대형마트·아울렛', t41: '식음료시설, 판매시설, 방재실', b11: '냉난방 중앙 1.흡수식 냉온수기[도시가스23] + 냉방 중앙 난방 중앙 6.온수보일러[도시가스23]', c52: '3.ESCO, 5.EERS, 7.DR', renew: '태양광', gas: '사용한다', kwFactor: 0.20, a51: '① 중앙+개별 모두 이용' },
  H1:  { desc: '병원 소형(5천㎡ 미만)', t41: '식음료시설', b11: '난방 중앙 5.증기보일러,냉난방 개별 4.시스템에어컨(EHP)[전기31] (또는 중앙 1.흡수식 냉온수기[도시가스23])', c52: '없음 (참여 안함)', renew: '없음', gas: '사용한다', kwFactor: 0.15, a51: '① 중앙+개별 모두 이용' },
  H2:  { desc: '병원 중형', t41: '식음료시설, 판매시설, 방재실', b11: '난방 중앙 5.증기보일러,냉난방 개별 4.시스템에어컨(EHP)[전기31] (또는 중앙 1.흡수식 냉온수기[도시가스23])', c52: '없음 (참여 안함)', renew: '없음', gas: '사용한다', kwFactor: 0.15, a51: '① 중앙+개별 모두 이용' },
  HB:  { desc: '대형병원', t41: '식음료시설, 판매시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '3.ESCO, 4.신재생에너지 지원사업, 7.DR', renew: '태양광, 지열', gas: '사용한다', kwFactor: 0.185, a51: '③ 개별방식' },
  SC:  { desc: '초중고 학교', t41: '식음료시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '4.신재생에너지 지원사업, 6.그린리모델링(그린스마트미래학교)', renew: '태양광', gas: '사용한다', kwFactor: 0.065, a51: '③ 개별방식' },
  UN:  { desc: '대학·교회·교육재단 등', t41: '식음료시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '3.ESCO', renew: '태양광', gas: '사용한다', kwFactor: 0.10, a51: '③ 개별방식' },
  OT:  { desc: '오피스텔·주상복합', t41: '식음료시설, 판매시설', b11: '냉방 개별 15.패키지·룸에어콘[전기31] (또는 4.EHP)', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.075, a51: '③ 개별방식' },
  OF1: { desc: '업무빌딩 중소(1만㎡ 미만)', t41: '식음료시설, 판매시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.125, a51: '③ 개별방식' },
  OF2: { desc: '업무빌딩 중대형(1만~3만㎡)', t41: '식음료시설, 판매시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '7.DR', renew: '태양광', gas: '사용한다', kwFactor: 0.125, a51: '③ 개별방식' },
  OL:  { desc: '대형 오피스(서울 도심 등)', t41: '식음료시설, 판매시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '3.ESCO, 7.DR (2020년 이후 준공이면 2.ZEB 인증 확인)', renew: '태양광, 지열', gas: '사용한다', kwFactor: 0.125, a51: '③ 개별방식' },
  SD:  { desc: '송도 대형빌딩(지역난방)', t41: '식음료시설, 판매시설, 방재실', b11: '난방 중앙 7.지역난방[지역난방41] + 냉방 중앙 11.터보식 냉동기[전기31]', c52: '7.DR (2020년 이후 준공이면 2.ZEB 인증 확인)', renew: '태양광, 지열', gas: '사용하지 않는다', kwFactor: 0.125, a51: '② 중앙방식' },
  RD:  { desc: '송도 연구시설(지역난방)', t41: '식음료시설, 방재실', b11: '난방 중앙 7.지역난방[지역난방41] + 냉방 중앙 11.터보식 냉동기[전기31]', c52: '3.ESCO, 4.신재생에너지 지원사업', renew: '태양광, 지열', gas: '사용하지 않는다', kwFactor: 0.15, a51: '② 중앙방식' },
  PB:  { desc: '공공 문화·집회·복지시설', t41: '식음료시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '3.ESCO, 4.신재생에너지 지원사업, 6.그린리모델링', renew: '태양광', gas: '사용한다', kwFactor: 0.10, a51: '③ 개별방식' },
  CN:  { desc: '민간 문화집회(영화관 등)', t41: '식음료시설, 판매시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.12, a51: '③ 개별방식' },
  HT:  { desc: '호텔·숙박 소형', t41: '식음료시설', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31] + 급탕용 중앙 6.온수보일러[도시가스23]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용한다', kwFactor: 0.125, a51: '③ 개별방식' },
  HL:  { desc: '관광호텔(1만㎡ 이상)', t41: '식음료시설, 방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31] + 급탕용 중앙 6.온수보일러[도시가스23]', c52: '없음 (참여 안함)', renew: '없음', gas: '사용한다', kwFactor: 0.125, a51: '③ 개별방식' },
  TL:  { desc: '방송통신시설', t41: '방재실', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '7.DR', renew: '없음', gas: '사용하지 않는다', kwFactor: 0.30, a51: '③ 개별방식' },
  PS:  { desc: '공공청사(행정복지센터 등)', t41: '해당 없음', b11: '냉난방 개별 4.시스템에어컨(EHP)[전기31]', c52: '4.신재생에너지 지원사업, 6.그린리모델링', renew: '태양광', gas: '사용하지 않는다', kwFactor: 0.10, a51: '③ 개별방식' }
};

function inferExpectedTypeCode({ mainUse, areaScale, sigungu, buildingName }) {
  const bName = String(buildingName || '');
  const sgg = String(sigungu || '');
  const areaM2 = AREA_SCALE_MID_M2[areaScale] || 4000;
  const isSmall = areaM2 < 5000;
  const isSongdo = sgg.includes('연수') && /송도|테크노|바이오|센트럴|아이타워|포스코|지타워|컨벤시아/.test(bName);

  if (mainUse.includes('근린생활')) {
    if (/메디컬|의원|치과|병원|클리닉/.test(bName)) return 'MD';
    if (/주민센터|행정복지|우체국|파출소|보건소|청사/.test(bName)) return 'PS';
    return isSmall ? 'G1' : 'G2';
  }
  if (mainUse.includes('판매')) {
    if (areaM2 >= 10000 || /백화점|마트|아울렛|몰|이마트|롯데|현대|홈플러스|코스트코|타임스퀘어|아이파크/.test(bName)) return 'RT';
    return isSmall ? 'G1' : 'G2';
  }
  if (mainUse.includes('의료')) {
    if (areaM2 >= 30000 || /대학병원|의료원|성모|아산|세브란스|백병원|길병원/.test(bName)) return 'HB';
    return isSmall ? 'H1' : 'H2';
  }
  if (mainUse.includes('교육연구')) {
    if (isSongdo && /연구|R&D|센터|기술원/.test(bName)) return 'RD';
    if (/초등|중학교|고등학교|학교|유치원/.test(bName) && !/대학교|대학원/.test(bName)) return 'SC';
    return 'UN';
  }
  if (mainUse.includes('문화')) {
    if (/구민|문화원|아트센터|회관|도서관|체육|복지|박물관|기념관|시립|구립/.test(bName)) return 'PB';
    return 'CN';
  }
  if (mainUse.includes('숙박')) {
    return areaM2 >= 10000 ? 'HL' : 'HT';
  }
  if (mainUse.includes('방송통신')) {
    return 'TL';
  }
  if (mainUse.includes('업무')) {
    if (isSongdo && areaM2 >= 10000) return 'SD';
    if (/오피스텔|주상복합|아크로텔|효성해링턴|포레나|더샵|자이|푸르지오|롯데캐슬/.test(bName)) return 'OT';
    if (/구청|시청|세무서|법원|검찰|경찰|공단|공사|청사|행정복지/.test(bName)) return 'PS';
    if (areaM2 >= 30000) return 'OL';
    if (areaM2 >= 10000) return 'OF2';
    return 'OF1';
  }
  return isSmall ? 'G1' : 'G2';
}

function parseA51Code(raw) {
  const s = String(raw || '').trim();
  if (s.includes('①') || (s.includes('중앙') && s.includes('개별'))) return '1';
  if (s.includes('②') || (s.includes('중앙') && !s.includes('개별'))) return '2';
  if (s.includes('④') || s.includes('안 함') || s.includes('않음')) return '4';
  return '3';
}

function parseT41Codes(raw) {
  const s = String(raw || '').trim();
  if (!s || s.includes('해당 없음') || s.includes('해당없음') || s === '없음') return ['77'];
  const codes = [];
  if (s.includes('식음료')) codes.push('1');
  if (s.includes('판매')) codes.push('2');
  if (s.includes('사우나') || s.includes('목욕')) codes.push('3');
  if (s.includes('수영장')) codes.push('4');
  if (s.includes('아이스링크')) codes.push('5');
  if (s.includes('세탁')) codes.push('6');
  if (s.includes('수술')) codes.push('7');
  if (s.includes('실험')) codes.push('8');
  if (s.includes('냉동')) codes.push('9');
  if (s.includes('방재실')) codes.push('10');
  if (s.includes('전산실')) codes.push('11');
  if (s.includes('서버실')) codes.push('12');
  return codes.length > 0 ? codes : ['77'];
}

function parseB11Spec(raw) {
  const full = String(raw || '').trim();
  if (!full) return { codes: ['4'], hotWaterOnlyBoiler: false };
  // (또는 ...) 대안 표기는 주 설비 중복 체크 방지를 위해 제거 후 파싱하되, 15 단독(냉방전용)인 경우 난방 정합성을 위해 4(EHP) 병행/대체 처리
  const primaryPart = full.replace(/\([^)]*또는[^)]*\)/g, ' ');
  const codes = [];
  const regex = /(?:^|[^\d])(1[0-5]|[1-9]|20|21)\s*\./g;
  let m;
  while ((m = regex.exec(primaryPart)) !== null) {
    const c = String(Number(m[1]));
    if (!codes.includes(c)) codes.push(c);
  }
  // OT 유형: '냉방 개별 15.패키지·룸에어콘[전기31] (또는 4.EHP)' -> 냉난방 월 정합성을 위해 4(EHP) 사용 또는 15+9 구성 중 시트 권장 대안 4.EHP 채택
  if (codes.length === 1 && codes[0] === '15' && full.includes('4.EHP')) {
    return { codes: ['4'], hotWaterOnlyBoiler: false };
  }
  const hotWaterOnlyBoiler = /급탕용[^+]*6\.온수보일러/.test(primaryPart);
  return {
    codes: codes.length > 0 ? codes : ['4'],
    hotWaterOnlyBoiler
  };
}

function parseC52Spec(raw) {
  const full = String(raw || '').trim();
  const zebCheckAfter2020 = full.includes('2.ZEB');
  const primaryPart = full.replace(/\([^)]*이후[^)]*\)/g, ' ');
  if (!primaryPart || primaryPart.includes('없음')) {
    return { codes: ['9'], zebCheckAfter2020 };
  }
  const codes = [];
  const regex = /(?:^|[^\d])([2-7])\s*\./g;
  let m;
  while ((m = regex.exec(primaryPart)) !== null) {
    const c = m[1];
    if (!codes.includes(c)) codes.push(c);
  }
  return {
    codes: codes.length > 0 ? codes : ['9'],
    zebCheckAfter2020
  };
}

function parseT71Codes(renewRaw) {
  const s = String(renewRaw || '').trim();
  const codes = [];
  if (s.includes('태양광')) codes.push('1');
  if (s.includes('태양열')) codes.push('2');
  if (s.includes('지열')) codes.push('3');
  if (s.includes('수열')) codes.push('4');
  if (s.includes('연료전지')) codes.push('6');
  // 사용자 가이드 지침: t71은 신재생에너지 있는것 + 비상용발전기(10) 필수 포함
  if (!codes.includes('10')) codes.push('10');
  return codes;
}

function cleanSq12BuildingName(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '(건물명 없음)' || s === '건물명 없음' || s === '없음') {
    return { buildingName: '', sq12BuildingName: '없음' };
  }
  // '도농플라자(리스트 건물명 없음)' 등 시트 관리용 괄호 메모 제거
  const cleaned = s
    .replace(/\(\s*리스트\s*건물명\s*없음\s*\)/g, '')
    .replace(/\(\s*사이트\s*건물명[^)]*\)/g, '')
    .trim();
  if (!cleaned || cleaned === '(건물명 없음)') {
    return { buildingName: '', sq12BuildingName: '없음' };
  }
  return { buildingName: cleaned, sq12BuildingName: cleaned };
}

function parseAddressMemoCol(raw) {
  const s = String(raw || '').trim();
  if (!s) return { roadAddress: '', jibunAddress: '', memo: '' };
  const withoutParen = s.replace(/\([^)]*\)/g, '').trim();
  if (withoutParen.includes('/')) {
    const [left, right] = withoutParen.split('/').map(x => x.trim());
    return { roadAddress: left || '', jibunAddress: right || '', memo: s };
  }
  return { roadAddress: '', jibunAddress: '', memo: s };
}

function loadExistingRuntimeMap(accountId) {
  const map = new Map();
  const files = fs.readdirSync(quotasDir).filter(
    f => f.startsWith(`quota_hrc_energy_2025_${accountId}_`) && f.endsWith('.json')
  );
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(quotasDir, f), 'utf-8'));
      const arr = Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed.items) ? parsed.items : []);
      for (const row of arr) {
        if (row && row.uid) map.set(String(row.uid), row);
      }
    } catch (_) {}
  }
  return { map, oldFiles: files };
}

async function fetchTapiList4Map(accountId) {
  const map = new Map();
  try {
    const cookies = new Map();
    const saveCookies = (res) => {
      const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const c of arr) {
        const [kv] = c.split(';');
        const idx = kv.indexOf('=');
        if (idx > 0) cookies.set(kv.slice(0, idx).trim(), kv.slice(idx + 1).trim());
      }
    };
    const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    let res = await fetch('https://tapi.hrcglobal.com/Home/Login', {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000)
    });
    saveCookies(res);
    res = await fetch('https://tapi.hrcglobal.com/Home/Login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieHeader()
      },
      body: new URLSearchParams({ uid: accountId, password: accountId }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(12000)
    });
    saveCookies(res);

    for (let p = 1; p <= 35; p++) {
      const url = p === 1
        ? 'https://tapi.hrcglobal.com/q260342/List4?page=1'
        : `https://tapi.hrcglobal.com/q260342/List4?page=1&seoList4=page${p}%257cconditions11%257c0%257c3%257c2%257c3%257c5%257c3%257c6%257c3%257c7%257c3%257c8%257c3%257c9%257c3%257c10%257c3%257c11%257c3%257c12%257c3%257c13%257c3`;
      const rp = await fetch(url, {
        headers: { Cookie: cookieHeader() },
        signal: AbortSignal.timeout(12000)
      });
      if (!rp.ok) break;
      const html = await rp.text();
      const rowMatches = [...html.matchAll(/<tr[^>]*id="List4_DXDataRow\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
      if (rowMatches.length === 0) break;
      let newOnPage = 0;
      for (const rm of rowMatches) {
        const tds = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
          m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
        );
        const uid = tds[0] || '';
        if (uid && !map.has(uid)) {
          newOnPage++;
          map.set(uid, {
            siteStatus: tds[2] || '',
            progress: tds[3] || '0%',
            lastContactStatus: tds[5] || '',
            contactCount: tds[6] || '0',
            siteBuildingName: tds[7] || ''
          });
        }
      }
      if (newOnPage === 0) break;
    }
  } catch (err) {
    console.warn(`[HRC TAPI List4 조회 경고: ${accountId}] ${err.message}`);
  }
  return map;
}

function buildFormattedAddress(sido, sigungu, roadAddress) {
  const rd = String(roadAddress || '').trim();
  const sd = String(sido || '').trim();
  const sgg = String(sigungu || '').trim();
  if (!rd) return `${sd} ${sgg}`.trim();
  if (sd && rd.startsWith(sd)) return rd;
  if (sgg && rd.startsWith(sgg)) return `${sd} ${rd}`.trim();
  return `${sd} ${sgg} ${rd}`.trim();
}

export async function importHrcEnergyQuotas(xlsxPath = '/tmp/energy_full.xlsx', options = {}) {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${xlsxPath}`);
  }

  const targetAccountIds = options.targetAccountIds
    ? new Set(
      (Array.isArray(options.targetAccountIds)
        ? options.targetAccountIds
        : String(options.targetAccountIds).split(',')
      ).map(s => String(s).trim()).filter(Boolean)
    )
    : null;
  const syncTapiStatus = options.syncTapiStatus !== false;

  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
  const summary = [];

  for (const meta of ACCOUNT_SHEETS) {
    if (targetAccountIds && !targetAccountIds.has(meta.accountId)) {
      continue;
    }

    const ws = wb.Sheets[meta.sheetName];
    if (!ws) {
      console.warn(`시트를 찾을 수 없음: ${meta.sheetName}`);
      continue;
    }

    const { map: existingMap, oldFiles } = loadExistingRuntimeMap(meta.accountId);
    const tapiMap = syncTapiStatus ? await fetchTapiList4Map(meta.accountId) : new Map();
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const items = [];
    const cellQuotas = [];
    let stopLeftList = false;

    const layout = meta.layout || 'standard';
    const isCompactSelected = layout === 'compact_selected' || layout === 'compact_selected_qcol';
    const uidColIdx = isCompactSelected ? 2 : 3;
    const nameColIdx = isCompactSelected ? 4 : 5;

    // 캠페인 내 기존 실측 응답자 이름을 먼저 등록하여 결측 행 보완 시 이름 중복 원천 방지
    const respondentUsedState = createRespondentUsedState();
    for (let rIdx = 4; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      const u = String(r?.[uidColIdx] || '').trim();
      if (!/^8\d+$/.test(u)) continue;
      const nm = String(r?.[nameColIdx] || '').trim();
      if (isValidRespondentName(nm)) {
        respondentUsedState.usedNames.add(nm);
      }
    }

    for (let rIdx = 4; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      if (!r) continue;

      // 우측 쿼터표 파싱 (시트별 시작 컬럼 및 포맷 대응)
      if (meta.quotaTableCol !== null) {
        const c0 = meta.quotaTableCol;
        if (meta.quotaTableMode === 'no_sido') {
          const qSido = meta.defaultSido || '경기';
          const qCode1 = String(r[c0] || '').trim();
          const qUse = String(r[c0 + 1] || '').trim();
          const qCode2 = String(r[c0 + 2] || '').trim();
          const qArea = String(r[c0 + 3] || '').trim();
          const qTarget = Number(r[c0 + 4]) || 0;
          const qDonePrev = Number(r[c0 + 5]) || 0;
          const qSampleCount = Number(r[c0 + 6]) || 0;
          const qDiff = r[c0 + 7] !== '' && !isNaN(Number(r[c0 + 7]))
            ? Number(r[c0 + 7])
            : (qDonePrev + qSampleCount - qTarget);
          if (/^\d+$/.test(qCode1) && /^\d+$/.test(qCode2)) {
            cellQuotas.push({
              cellKey: `${qSido}_${qCode1}_${qCode2}`,
              sido: qSido,
              quotaCode1: qCode1,
              mainUse: qUse,
              quotaCode2: qCode2,
              areaScale: qArea,
              targetQuota: qTarget,
              selectedCount: qDonePrev,
              sampleCount: qSampleCount,
              diff: qDiff
            });
          }
        } else if (meta.quotaTableMode === 'dual_quota_no_sido') {
          const qSido = meta.defaultSido || '서울';
          const qCode1 = String(r[c0] || '').trim();
          const qUse = String(r[c0 + 1] || '').trim();
          const qCode2 = String(r[c0 + 2] || '').trim();
          const qArea = String(r[c0 + 3] || '').trim();
          const qTarget = (Number(r[c0 + 4]) || 0) + (Number(r[c0 + 5]) || 0);
          const qDonePrev = Number(r[c0 + 6]) || 0;
          const qSampleCount = Number(r[c0 + 7]) || 0;
          const qDiff = r[c0 + 8] !== '' && !isNaN(Number(r[c0 + 8]))
            ? Number(r[c0 + 8])
            : (qDonePrev + qSampleCount - qTarget);
          if (/^\d+$/.test(qCode1) && /^\d+$/.test(qCode2)) {
            cellQuotas.push({
              cellKey: `${qSido}_${qCode1}_${qCode2}`,
              sido: qSido,
              quotaCode1: qCode1,
              mainUse: qUse,
              quotaCode2: qCode2,
              areaScale: qArea,
              targetQuota: qTarget,
              selectedCount: qDonePrev,
              sampleCount: qSampleCount,
              diff: qDiff
            });
          }
        } else {
          const qSido = String(r[c0] || '').trim();
          const qCode1 = String(r[c0 + 1] || '').trim();
          const qUse = String(r[c0 + 2] || '').trim();
          const qCode2 = String(r[c0 + 3] || '').trim();
          const qArea = String(r[c0 + 4] || '').trim();
          const qTarget = Number(r[c0 + 5]) || 0;
          const qSelected = Number(r[c0 + 6]) || 0;
          const qSampleCount = Number(r[c0 + 7]) || 0;
          const qDiff = Number(r[c0 + 8]) || (qSelected - qTarget);

          if (qSido && qSido !== '시도' && /^\d+$/.test(qCode1) && /^\d+$/.test(qCode2)) {
            cellQuotas.push({
              cellKey: `${qSido}_${qCode1}_${qCode2}`,
              sido: qSido,
              quotaCode1: qCode1,
              mainUse: qUse,
              quotaCode2: qCode2,
              areaScale: qArea,
              targetQuota: qTarget,
              selectedCount: qSelected,
              sampleCount: qSampleCount,
              diff: qDiff
            });
          }
        }
      }

      // 강영미-700193 하단의 '상업공공 사업체' 별도 부문 테이블 진입 시 건물 리스트 파싱 종료
      const col0Text = String(r[0] || '').trim();
      if (col0Text.includes('상업공공 사업체') || String(r[2] || '').trim() === '표본층') {
        stopLeftList = true;
      }
      if (stopLeftList) continue;

      const uid = String(r[uidColIdx] || '').trim();
      if (!uid || !/^8\d+$/.test(uid)) continue;

      const prev = existingMap.get(uid) || {};
      const tapiInfo = tapiMap.get(uid) || null;

      let selectionType = '선정';
      let cellPriority = 1;
      let rawBuildingCell = '';
      let rawContactName = '';
      let rawPhone = '';
      let sampleType = '';
      let mainUse = '';
      let areaScale = '';
      let sido = '';
      let sigungu = '';
      let quotaColumn = '';
      let roadAddress = '';
      let jibunAddress = '';
      let memo = '';
      let a51Cell = '';
      let t41Cell = '';
      let b11Cell = '';
      let c52Cell = '';
      let renewCell = '';
      let kwCell = '';
      let d21Cell = '';
      let sheetTypeCode = '';
      let sheetContactStatus = '';
      let sheetContactCount = '';

      if (layout === 'compact_selected') {
        selectionType = '선정';
        cellPriority = Number(r[1]) || 1;
        rawBuildingCell = r[3];
        rawContactName = String(r[4] || '').trim();
        rawPhone = String(r[5] || '').trim();
        sampleType = String(r[6] || '').trim();
        mainUse = String(r[7] || '').trim();
        areaScale = String(r[8] || '').trim();
        sido = meta.defaultSido || '경기';
        sigungu = String(r[9] || '').trim();
        roadAddress = String(r[10] || '').trim();
        jibunAddress = String(r[11] || '').trim();
        memo = String(r[12] || '').trim();
        a51Cell = r[13];
        t41Cell = r[14];
        b11Cell = r[15];
        c52Cell = r[16];
        renewCell = r[17];
        kwCell = r[18];
        d21Cell = r[19];
        sheetTypeCode = String(r[20] || '').trim();
      } else if (layout === 'compact_selected_qcol') {
        selectionType = '선정';
        cellPriority = Number(r[1]) || 1;
        rawBuildingCell = r[3];
        rawContactName = String(r[4] || '').trim();
        rawPhone = String(r[5] || '').trim();
        sampleType = String(r[6] || '').trim();
        mainUse = String(r[7] || '').trim();
        areaScale = String(r[8] || '').trim();
        sido = meta.defaultSido || '서울';
        sigungu = String(r[9] || '').trim();
        quotaColumn = String(r[10] || '').trim();
        roadAddress = String(r[11] || '').trim();
        jibunAddress = String(r[12] || '').trim();
        memo = String(r[13] || '').trim();
        a51Cell = r[14];
        t41Cell = r[15];
        b11Cell = r[16];
        c52Cell = r[17];
        renewCell = r[18];
        kwCell = r[19];
        d21Cell = r[20];
        sheetTypeCode = String(r[21] || '').trim();
      } else {
        selectionType = String(r[1] || '').trim();
        cellPriority = Number(r[2]) || 1;
        rawBuildingCell = r[4];
        rawContactName = String(r[5] || '').trim();
        rawPhone = String(r[6] || '').trim();
        sampleType = String(r[7] || '').trim();
        mainUse = String(r[8] || '').trim();
        areaScale = String(r[9] || '').trim();
        sido = String(r[10] || '').trim();
        sigungu = String(r[11] || '').trim();
        a51Cell = r[12];
        t41Cell = r[13];
        b11Cell = r[14];
        c52Cell = r[15];
        renewCell = r[16];
        kwCell = r[17];
        d21Cell = r[18];
        sheetTypeCode = String(r[19] || '').trim();

        const col20Header = String(rows[3]?.[20] || '').trim();
        const isCol20Contact = /접촉/.test(col20Header);
        if (isCol20Contact) {
          sheetContactStatus = String(r[20] || '').trim();
          sheetContactCount = String(r[21] || '0').trim();
        } else {
          const parsedAddr = parseAddressMemoCol(r[20]);
          roadAddress = parsedAddr.roadAddress;
          jibunAddress = parsedAddr.jibunAddress;
          memo = parsedAddr.memo;
        }
      }

      const phone = String(rawPhone || prev.phone || '').trim();
      if (meta.requirePhone && !/\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}|\d{8,11}/.test(phone)) {
        continue;
      }

      const seq = meta.requirePhone ? (items.length + 1) : (Number(r[0]) || (items.length + 1));
      const { buildingName, sq12BuildingName } = cleanSq12BuildingName(rawBuildingCell);

      // 전화번호는 확보되었으나 시트 이름이 비어있는 경우(예: 700550 #803224) 마스터 페르소나 DB에서 중복 없이 결정론 배정
      let resolvedContactName = rawContactName || prev.contactName || '';
      if (!isValidRespondentName(resolvedContactName) && (!resolvedContactName || resolvedContactName === '관리소장') && phone) {
        const picked = pickRespondentFromPool({
          minAge: 32,
          maxAge: 62,
          seed: uid,
          usedState: respondentUsedState
        });
        resolvedContactName = picked.name;
      }

      const quotaCode1 = MAIN_USE_CODE_MAP[mainUse] || '1001';
      const quotaCode2 = AREA_SCALE_CODE_MAP[areaScale] || '1001';
      const cellKey = `${sido}_${quotaCode1}_${quotaCode2}`;

      // 시트 엔지니어링 가이드 (공란인 대체 표본은 예상기준 프리셋으로 자동 추론)
      const expectedTypeCode = EXPECTED_TYPE_PRESETS[sheetTypeCode]
        ? sheetTypeCode
        : inferExpectedTypeCode({ mainUse, areaScale, sigungu, buildingName });
      const preset = EXPECTED_TYPE_PRESETS[expectedTypeCode] || EXPECTED_TYPE_PRESETS.G1;

      const a51Raw = String(a51Cell || '').trim() || preset.a51;
      const t41Raw = String(t41Cell || '').trim() || preset.t41;
      const b11Raw = String(b11Cell || '').trim() || preset.b11;
      const c52Raw = String(c52Cell || '').trim() || preset.c52;
      const renewableRaw = String(renewCell || '').trim() || preset.renew;
      const rawKwNum = parseInt(String(kwCell || '').replace(/[^0-9]/g, ''), 10);
      const midM2 = AREA_SCALE_MID_M2[areaScale] || 4000;
      const contractPowerKw = (!isNaN(rawKwNum) && rawKwNum > 0)
        ? rawKwNum
        : Math.max(100, Math.round((midM2 * (preset.kwFactor || 0.10)) / 50) * 50);
      const d21Raw = String(d21Cell || '').trim() || preset.gas;

      const a51Code = parseA51Code(a51Raw);
      const t41Codes = parseT41Codes(t41Raw);
      const { codes: b11Codes, hotWaterOnlyBoiler } = parseB11Spec(b11Raw);
      const { codes: c52Codes, zebCheckAfter2020 } = parseC52Spec(c52Raw);
      const t71Codes = parseT71Codes(renewableRaw);

      // B1-1에 도시가스(23) 설비(1:흡수식, 2:소형열병합, 3:GHP, 5:증기보일러, 6:온수보일러)가 포함되면 D2-1은 반드시 '사용한다'(1)
      const hasGasEquip = b11Codes.some(c => ['1', '2', '3', '5', '6'].includes(c));
      const d21UseGas = (d21Raw.includes('사용한다') || hasGasEquip) ? '1' : '2';

      const isPublicOrSchool = ['SC', 'UN', 'PB', 'PS'].includes(expectedTypeCode) ||
        /학교|대학|공공|청사|주민센터|행정복지|도서관|문화원|보건소/.test(`${mainUse} ${buildingName}`);

      const ceilPlan = await resolveHrcBuildingCeilingHeightM({
        slotData: {
          uid,
          mainUse,
          quotaCode1,
          buildingName,
          sq12BuildingName,
          sido,
          sigungu,
          estimatedGrossAreaM2: midM2
        },
        grossAreaM2: midM2
      });
      const ceilingHeightM = ceilPlan?.value || prev.ceilingHeightM || '2.8';

      const isTapiDone = tapiInfo && (tapiInfo.siteStatus === '완료' || tapiInfo.progress === '100%');
      const isDone = Boolean(
        isTapiDone ||
        prev.quotaStatus === 'completed' ||
        prev.status === '완료' ||
        prev.progress === '100%' ||
        uid === '800715'
      );
      const resolvedProgress = isDone
        ? '100%'
        : ((tapiInfo && tapiInfo.progress && tapiInfo.progress !== '0%') ? tapiInfo.progress : (prev.progress || '0%'));
      const resolvedStatus = isDone
        ? '완료'
        : ((tapiInfo && tapiInfo.siteStatus) ? tapiInfo.siteStatus : (prev.status || '대기'));
      const resolvedQuotaStatus = isDone
        ? 'completed'
        : ((resolvedProgress !== '0%' && prev.quotaStatus === 'in_progress') ? 'in_progress' : (prev.quotaStatus || 'ready'));
      const finalRoadAddr = roadAddress || prev.roadAddress || '';
      const finalJibunAddr = jibunAddress || prev.jibunAddress || '';

      items.push({
        ...prev,
        index: items.length + 1,
        seq,
        uid,
        selectionType,
        cellPriority,
        cellKey,
        ...(quotaColumn ? { quotaColumn } : {}),
        companyName: buildingName || `(${sigungu} ${mainUse} #${uid})`,
        buildingName,
        sq12BuildingName,
        siteBuildingName: (tapiInfo && tapiInfo.siteBuildingName) || prev.siteBuildingName || buildingName || '',
        ceoName: prev.giftSignerName || resolvedContactName || prev.ceoName || '',
        contactName: resolvedContactName || prev.contactName || '',
        phone: phone || prev.phone || '',
        sampleType,
        industry: mainUse,
        mainUse,
        areaScale,
        estimatedGrossAreaM2: midM2,
        ceilingHeightM,
        sido,
        sigungu,
        roadAddress: finalRoadAddr,
        jibunAddress: finalJibunAddr,
        address: buildFormattedAddress(sido, sigungu, finalRoadAddr),
        handledItems: mainUse,
        mainProducts: areaScale,
        lastContactStatus: (tapiInfo && tapiInfo.lastContactStatus) || sheetContactStatus || prev.lastContactStatus || '',
        contactCount: (tapiInfo && tapiInfo.contactCount && tapiInfo.contactCount !== '0')
          ? tapiInfo.contactCount
          : (sheetContactCount || prev.contactCount || '0'),
        quotaCode1,
        quotaCode2,
        memo: memo || prev.memo || '',
        // 구글 시트 건물별 엔지니어링 가이드 필드
        expectedTypeCode,
        expectedTypeDesc: preset.desc,
        isPublicOrSchool,
        a51Raw,
        a51Code,
        t41Raw,
        t41Codes,
        b11Raw,
        b11Codes,
        hotWaterOnlyBoiler,
        c52Raw,
        c52Codes,
        zebCheckAfter2020,
        renewableRaw,
        t71Codes,
        contractPowerKw,
        d21Raw: d21UseGas === '1' ? '사용한다' : '사용하지 않는다',
        d21UseGas,
        guideFromSheet: Boolean(String(a51Cell || '').trim() || String(b11Cell || '').trim()),
        surveyorId: meta.accountId,
        surveyorAccount: meta.accountId,
        surveyorName: meta.surveyorName,
        slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uid}&page=1`,
        surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uid}&page=1`,
        siteStatus: isDone ? '완료' : ((tapiInfo && tapiInfo.siteStatus) || prev.siteStatus || ''),
        ...(isDone ? { surveyCompleted: '완료' } : {}),
        status: resolvedStatus,
        quotaStatus: resolvedQuotaStatus,
        progress: resolvedProgress
      });
    }

    // 우측 쿼터표가 시트에 없는 경우(예: 700189) 선정 행 기준으로 자동 집계 생성
    if (cellQuotas.length === 0 && items.length > 0) {
      const grouped = new Map();
      for (const it of items) {
        const g = grouped.get(it.cellKey) || {
          cellKey: it.cellKey,
          sido: it.sido,
          quotaCode1: it.quotaCode1,
          mainUse: it.mainUse,
          quotaCode2: it.quotaCode2,
          areaScale: it.areaScale,
          targetQuota: 0,
          selectedCount: 0,
          sampleCount: 0,
          diff: 0
        };
        g.sampleCount += 1;
        if (it.selectionType === '선정') {
          g.selectedCount += 1;
          g.targetQuota += 1;
        }
        grouped.set(it.cellKey, g);
      }
      cellQuotas.push(...grouped.values());
    }

    const selectedItems = items.filter(i => i.selectionType === '선정');
    const backupItems = items.filter(i => i.selectionType === '대체');

    const baseFileName = `quota_hrc_energy_2025_${meta.accountId}_${meta.surveyorName}_전체${items.length}개_선정${selectedItems.length}개`;
    const jsonPath = path.join(quotasDir, `${baseFileName}.json`);
    const xlsxOutPath = path.join(quotasDir, `${baseFileName}.xlsx`);

    // 건수 변경 시 이전 파일명의 중복 파일 정리
    for (const oldF of oldFiles) {
      if (oldF !== `${baseFileName}.json`) {
        try { fs.unlinkSync(path.join(quotasDir, oldF)); } catch (_) {}
        const oldXlsx = oldF.replace(/\.json$/, '.xlsx');
        if (fs.existsSync(path.join(quotasDir, oldXlsx))) {
          try { fs.unlinkSync(path.join(quotasDir, oldXlsx)); } catch (_) {}
        }
      }
    }

    const payload = {
      title: `2025년 기준 에너지총조사 [건물] - ${meta.accountId} (${meta.surveyorName} / 선정 ${selectedItems.length}건 · 전체 ${items.length}건)`,
      type: 'HRC_ENERGY_BUILDING',
      surveyType: 'hrc_energy',
      projectCode: '2026-89-0342C',
      projectName: '2025년 기준 에너지총조사 (건물)',
      surveyorId: meta.accountId,
      accountId: meta.accountId,
      surveyorName: meta.surveyorName,
      marketName: `에너지총조사_건물_${meta.accountId}_${meta.surveyorName}`,
      regionDesc: meta.regionDesc,
      count: items.length,
      totalCount: items.length,
      selectedCount: selectedItems.length,
      subCount: backupItems.length,
      backupCount: backupItems.length,
      updatedAt: new Date().toISOString(),
      cellQuotas,
      data: items,
      items
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

    const excelRows = items.map(it => ({
      '번호': it.seq,
      '선정구분': it.selectionType,
      '셀내우선순위': it.cellPriority,
      'UID': it.uid,
      '건물명(SQ12)': it.sq12BuildingName,
      '이름': it.contactName,
      '전화번호': it.phone,
      '표본구분': it.sampleType,
      '주용도': it.mainUse,
      '면적규모': it.areaScale,
      '시도': it.sido,
      '시군구': it.sigungu,
      '도로명주소': it.roadAddress || '',
      '천장고(m)': it.ceilingHeightM || '',
      'A5-1(공조방식)': it.a51Raw,
      'T41(입점시설)': it.t41Raw,
      'B1-1(설비현황)': it.b11Raw,
      'C5-2(효율개선)': it.c52Raw,
      '신재생에너지': it.renewableRaw,
      '계약전력(kW)': it.contractPowerKw,
      'D2-1(도시가스)': it.d21Raw,
      '예상유형': it.expectedTypeCode,
      '조사원ID': it.surveyorAccount,
      '진행률': it.progress || '0%',
      '설문상태': it.quotaStatus
    }));
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(newWb, newWs, meta.sheetName);
    fs.writeFileSync(xlsxOutPath, XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' }));

    const completedCount = items.filter(i => i.quotaStatus === 'completed').length;
    summary.push({
      accountId: meta.accountId,
      surveyorName: meta.surveyorName,
      totalCount: items.length,
      selectedCount: selectedItems.length,
      backupCount: backupItems.length,
      completedCount,
      pendingCount: items.length - completedCount,
      jsonFile: `${baseFileName}.json`,
      xlsxFile: `${baseFileName}.xlsx`
    });
  }

  // src/config/hrc-energy-sheet-guides.json 통합 오버레이 자동 갱신 (contactName·phone·천장고·수령증 서명 상태 보존)
  const overlayPath = path.join(rootDir, 'src', 'config', 'hrc-energy-sheet-guides.json');
  let prevOverlay = {};
  if (fs.existsSync(overlayPath)) {
    try {
      prevOverlay = JSON.parse(fs.readFileSync(overlayPath, 'utf-8'));
    } catch (_) {}
  }
  const nextOverlay = { ...prevOverlay };
  for (const s of summary) {
    const qData = JSON.parse(fs.readFileSync(path.join(quotasDir, s.jsonFile), 'utf-8'));
    const arr = qData.items || qData.data || [];
    for (const it of arr) {
      const uid = String(it.uid || '').trim();
      if (!uid) continue;
      const prevEntry = prevOverlay[uid] || {};
      const entry = {
        buildingName: it.buildingName || '',
        contactName: it.contactName || prevEntry.contactName || '',
        phone: it.phone || prevEntry.phone || '',
        sampleType: it.sampleType || prevEntry.sampleType || '',
        mainUse: it.mainUse || prevEntry.mainUse || '',
        areaScale: it.areaScale || prevEntry.areaScale || '',
        sido: it.sido || prevEntry.sido || '',
        sigungu: it.sigungu || prevEntry.sigungu || '',
        memo: it.memo || prevEntry.memo || '',
        roadAddress: it.roadAddress || prevEntry.roadAddress || '',
        jibunAddress: it.jibunAddress || prevEntry.jibunAddress || '',
        sq12BuildingName: it.sq12BuildingName || '없음',
        expectedTypeCode: it.expectedTypeCode,
        expectedTypeDesc: it.expectedTypeDesc,
        isPublicOrSchool: Boolean(it.isPublicOrSchool),
        ceilingHeightM: it.ceilingHeightM || prevEntry.ceilingHeightM || '2.8',
        a51Raw: it.a51Raw,
        a51Code: it.a51Code,
        t41Raw: it.t41Raw,
        t41Codes: it.t41Codes,
        b11Raw: it.b11Raw,
        b11Codes: it.b11Codes,
        hotWaterOnlyBoiler: Boolean(it.hotWaterOnlyBoiler),
        c52Raw: it.c52Raw,
        c52Codes: it.c52Codes,
        zebCheckAfter2020: Boolean(it.zebCheckAfter2020),
        renewableRaw: it.renewableRaw,
        t71Codes: it.t71Codes,
        contractPowerKw: it.contractPowerKw,
        d21Raw: it.d21Raw,
        d21UseGas: it.d21UseGas,
        estimatedGrossAreaM2: it.estimatedGrossAreaM2,
        guideFromSheet: Boolean(it.guideFromSheet),
        selectionType: it.selectionType,
        cellPriority: it.cellPriority,
        cellKey: it.cellKey,
        quotaCode1: it.quotaCode1,
        quotaCode2: it.quotaCode2
      };
      const isDone = it.quotaStatus === 'completed' || it.status === '완료' || prevEntry.quotaStatus === 'completed';
      if (isDone) entry.quotaStatus = 'completed';
      for (const gk of ['giftSigned', 'giftBrand', 'giftValue', 'giftSignerName', 'giftSignerPhone', 'giftStyleLabel']) {
        const gv = it[gk] !== undefined ? it[gk] : prevEntry[gk];
        if (gv !== undefined) entry[gk] = gv;
      }
      nextOverlay[uid] = entry;
    }
  }
  fs.writeFileSync(overlayPath, JSON.stringify(nextOverlay, null, 2), 'utf-8');

  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const xlsxArg = process.argv[2] || '/tmp/energy_full.xlsx';
  const accArg = process.argv[3] || '';
  importHrcEnergyQuotas(xlsxArg, { targetAccountIds: accArg || null }).then(res => {
    console.log('Imported HRC Energy Building Quotas:', JSON.stringify(res, null, 2));
  }).catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
