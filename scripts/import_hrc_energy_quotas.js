/**
 * 2025년 기준 에너지총조사 (건물 부문) 구글 시트 쿼터 리스트 (6개 조사원 계정 전체)
 * - 강영미_700275, 강경옥_700277, 김정례_701493, 유희정-701494, 강영미-700193, 김정례_700189
 * - 시트 M~U열 건물별 엔지니어링 가이드(A5-1, T41, B1-1, C5-2, 신재생에너지, D1-2-1 계약전력, D2-1 도시가스, 예상유형코드, 주소/메모) 파싱
 * - 대체 표본 등 가이드 공란 행은 '예상기준' 시트의 21개 유형 프리셋으로 자동 추론 보강
 * - 기존 data/quotas/ JSON에 기록된 완료/진행률/수령증 서명 상태를 100% 보존하여 병합 저장
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';

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
  { sheetName: '김정례_700189', accountId: '700189', surveyorName: '김정례', regionDesc: '경기 (남양주시 · 건물 25부)', quotaTableCol: null }
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

export function importHrcEnergyQuotas(xlsxPath = '/tmp/energy_full.xlsx') {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${xlsxPath}`);
  }

  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
  const summary = [];

  for (const meta of ACCOUNT_SHEETS) {
    const ws = wb.Sheets[meta.sheetName];
    if (!ws) {
      console.warn(`시트를 찾을 수 없음: ${meta.sheetName}`);
      continue;
    }

    const { map: existingMap, oldFiles } = loadExistingRuntimeMap(meta.accountId);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const items = [];
    const cellQuotas = [];
    let stopLeftList = false;

    for (let rIdx = 4; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      if (!r) continue;

      // 우측 쿼터표 파싱 (시트별 시작 컬럼 대응)
      if (meta.quotaTableCol !== null) {
        const c0 = meta.quotaTableCol;
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

      // 강영미-700193 하단의 '상업공공 사업체' 별도 부문 테이블 진입 시 건물 리스트 파싱 종료
      const col0Text = String(r[0] || '').trim();
      if (col0Text.includes('상업공공 사업체') || String(r[2] || '').trim() === '표본층') {
        stopLeftList = true;
      }
      if (stopLeftList) continue;

      const uid = String(r[3] || '').trim();
      const selectionType = String(r[1] || '').trim();
      if (!uid || !/^8\d+$/.test(uid)) continue;

      const seq = Number(r[0]) || (items.length + 1);
      const cellPriority = Number(r[2]) || 1;
      const { buildingName, sq12BuildingName } = cleanSq12BuildingName(r[4]);
      const contactName = String(r[5] || '').trim();
      const phone = String(r[6] || '').trim();
      const sampleType = String(r[7] || '').trim();
      const mainUse = String(r[8] || '').trim();
      const areaScale = String(r[9] || '').trim();
      const sido = String(r[10] || '').trim();
      const sigungu = String(r[11] || '').trim();

      const quotaCode1 = MAIN_USE_CODE_MAP[mainUse] || '1001';
      const quotaCode2 = AREA_SCALE_CODE_MAP[areaScale] || '1001';
      const cellKey = `${sido}_${quotaCode1}_${quotaCode2}`;

      // M~T열 가이드 (공란인 대체 표본은 예상기준 프리셋으로 자동 추론)
      const sheetTypeCode = String(r[19] || '').trim();
      const expectedTypeCode = EXPECTED_TYPE_PRESETS[sheetTypeCode]
        ? sheetTypeCode
        : inferExpectedTypeCode({ mainUse, areaScale, sigungu, buildingName });
      const preset = EXPECTED_TYPE_PRESETS[expectedTypeCode] || EXPECTED_TYPE_PRESETS.G1;

      const a51Raw = String(r[12] || '').trim() || preset.a51;
      const t41Raw = String(r[13] || '').trim() || preset.t41;
      const b11Raw = String(r[14] || '').trim() || preset.b11;
      const c52Raw = String(r[15] || '').trim() || preset.c52;
      const renewableRaw = String(r[16] || '').trim() || preset.renew;
      const rawKwNum = parseInt(String(r[17] || '').replace(/[^0-9]/g, ''), 10);
      const midM2 = AREA_SCALE_MID_M2[areaScale] || 4000;
      const contractPowerKw = (!isNaN(rawKwNum) && rawKwNum > 0)
        ? rawKwNum
        : Math.max(100, Math.round((midM2 * (preset.kwFactor || 0.10)) / 50) * 50);
      const d21Raw = String(r[18] || '').trim() || preset.gas;

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

      const { roadAddress, jibunAddress, memo } = parseAddressMemoCol(r[20]);
      const prev = existingMap.get(uid) || {};
      const isDone = prev.quotaStatus === 'completed' || prev.status === '완료' || prev.progress === '100%' || uid === '800715';

      items.push({
        ...prev,
        index: items.length + 1,
        seq,
        uid,
        selectionType,
        cellPriority,
        cellKey,
        companyName: buildingName || `(${sigungu} ${mainUse} #${uid})`,
        buildingName,
        sq12BuildingName,
        ceoName: contactName || prev.ceoName || '',
        contactName: contactName || prev.contactName || '',
        phone: phone || prev.phone || '',
        sampleType,
        industry: mainUse,
        mainUse,
        areaScale,
        estimatedGrossAreaM2: midM2,
        sido,
        sigungu,
        roadAddress: roadAddress || prev.roadAddress || '',
        jibunAddress: jibunAddress || prev.jibunAddress || '',
        address: roadAddress ? `${sido} ${sigungu} ${roadAddress}`.trim() : `${sido} ${sigungu}`.trim(),
        handledItems: mainUse,
        mainProducts: areaScale,
        quotaCode1,
        quotaCode2,
        memo: memo || prev.memo || '',
        // 구글 시트 M~T열 엔지니어링 가이드 필드
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
        guideFromSheet: Boolean(String(r[12] || '').trim() || String(r[14] || '').trim()),
        surveyorId: meta.accountId,
        surveyorAccount: meta.accountId,
        surveyorName: meta.surveyorName,
        slotUrl: `https://tapi.hrcglobal.com/q260342/AnswerInfo4?pid=${uid}&page=1`,
        surveyUrl: `https://tapi.hrcglobal.com/q260342/Survey4?pid=${uid}&page=1`,
        status: isDone ? '완료' : (prev.status || '대기'),
        quotaStatus: isDone ? 'completed' : (prev.quotaStatus || 'ready'),
        progress: isDone ? '100%' : (prev.progress || '0%')
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

    summary.push({
      accountId: meta.accountId,
      surveyorName: meta.surveyorName,
      totalCount: items.length,
      selectedCount: selectedItems.length,
      backupCount: backupItems.length,
      jsonFile: `${baseFileName}.json`,
      xlsxFile: `${baseFileName}.xlsx`
    });
  }

  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = importHrcEnergyQuotas();
  console.log('Imported HRC Energy Building Quotas (6 Accounts):', JSON.stringify(res, null, 2));
}
