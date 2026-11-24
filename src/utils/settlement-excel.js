/**
 * 설문조사 정산 시스템 Excel(.xlsx / .csv) 내보내기, 표준 양식 생성,
 * 유연한 헤더 파싱 및 스마트 병합(Preview / Upsert) 유틸리티
 */
import * as XLSX from 'xlsx';

function normalizeKey(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]·._/-]/g, '');
}

function normalizeNameKey(str) {
  return String(str ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseCleanInt(val, fallback = 0, allowNegative = false) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number' && Number.isFinite(val)) {
    const r = Math.round(val);
    return allowNegative ? r : Math.max(0, r);
  }
  const cleaned = String(val)
    .replace(/[,원건명부\s]/g, '')
    .replace(/^\+/, '');
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  return allowNegative ? r : Math.max(0, r);
}

export function parsePeriodMonthCell(val, fallbackYm) {
  if (val === undefined || val === null || val === '') return fallbackYm;

  // Excel 날짜 시리얼 번호인 경우
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}`;
    }
  }

  const s = String(val).trim();
  const m1 = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})/);
  if (m1) {
    const mm = Math.min(12, Math.max(1, Number(m1[2])));
    return `${m1[1]}-${String(mm).padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})(\d{2})$/);
  if (m2) {
    const mm = Math.min(12, Math.max(1, Number(m2[2])));
    return `${m2[1]}-${String(mm).padStart(2, '0')}`;
  }
  return fallbackYm;
}

export function parseBoolCell(val, fallback = false) {
  if (typeof val === 'boolean') return val;
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return val > 0;
  const s = String(val).trim().toLowerCase();
  if (['y', 'yes', 'true', '1', 'o', '예', '적용', '공제', '체크', '포함'].includes(s)) return true;
  if (['n', 'no', 'false', '0', 'x', '아니오', '미적용', '미공제', '제외'].includes(s)) return false;
  // 내보내기 파일의 세금 금액 칸('15,840' 등)일 경우 양수면 true
  const num = parseCleanInt(s, -1, true);
  if (num > 0) return true;
  if (num === 0) return false;
  return fallback;
}

export function parseInflowStatusCell(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  if (s.includes('입금완료') || s.includes('수금완료') || s === '완료') return 'received';
  if (s.includes('청구')) return 'billed';
  if (s.includes('대기') || s.includes('미수')) return 'pending';
  return null;
}

export function parsePayoutStatusCell(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  if (s.includes('송금완료') || s.includes('지급완료') || s.includes('입금완료') || s === '완료') return 'paid';
  if (s.includes('부분') || s.includes('선금')) return 'partial';
  if (s.includes('미지급') || s.includes('미송금') || s.includes('대기')) return 'unpaid';
  return null;
}

function isExampleOrEmptyNoticeRow(row) {
  if (!row || typeof row !== 'object') return true;
  if ('안내' in row && Object.keys(row).length <= 2) return true;
  const values = Object.values(row).map(v => String(v ?? '').trim()).filter(Boolean);
  if (values.length === 0) return true;
  // 표준 양식의 (예시) 또는 [예시] 행은 실수로 지우지 않고 올려도 자동 건너뜀 (AGENTS.md 제2원칙 보호)
  const joined = values.join(' ');
  if (joined.includes('(예시)') || joined.includes('[예시]')) return true;
  return false;
}

function createHeaderAccessor(row) {
  const map = new Map();
  Object.keys(row || {}).forEach(k => {
    map.set(normalizeKey(k), row[k]);
  });
  return (candidates = []) => {
    for (const c of candidates) {
      const nk = normalizeKey(c);
      if (map.has(nk)) {
        const v = map.get(nk);
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          return v;
        }
      }
    }
    // 빈 값이라도 키가 존재하면 반환
    for (const c of candidates) {
      const nk = normalizeKey(c);
      if (map.has(nk)) return map.get(nk);
    }
    return undefined;
  };
}

export function autoSizeSheetColumns(rows) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(key => {
    let maxLen = Array.from(key).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0) + 2;
    for (const r of rows) {
      const val = String(r[key] ?? '');
      const len = Array.from(val).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0);
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 52) };
  });
}

/**
 * 시트 이름 및 첫 행 헤더를 분석해 시트 역할('projects' | 'allocations' | 'partners' | null)을 판별합니다.
 */
function classifySheet(sheetName, rows) {
  const sName = normalizeKey(sheetName);
  if (sName.includes('과제별') || sName.includes('정산요약')) return 'projects';
  if (sName.includes('분배') || sName.includes('송금')) return 'allocations';
  if (sName.includes('장부') || sName.includes('거래처') || sName.includes('계좌명단') || sName.includes('조사원명단')) return 'partners';

  if (!rows || rows.length === 0) return null;
  const headerKeys = Object.keys(rows[0] || {}).map(normalizeKey);
  const has = (kw) => headerKeys.some(k => k.includes(normalizeKey(kw)));

  if ((has('3티어조사원') || has('조사원명') || has('조사원')) && (has('과제명') || has('설문과제명') || has('캠페인명'))) {
    return 'allocations';
  }
  if ((has('과제명') || has('설문과제명') || has('캠페인명')) && (has('수주단가') || has('내확정부수') || has('목표부수') || has('1티어'))) {
    return 'projects';
  }
  if ((has('이름') || has('성명') || has('상호') || has('조사원')) && (has('계좌') || has('은행') || has('연락처') || has('구분'))) {
    return 'partners';
  }
  return null;
}

/**
 * 업로드용 표준 3-시트 엑셀 양식(.xlsx) 버퍼를 생성합니다.
 * - '(예시)'가 포함된 행은 업로드 시 자동으로 건너뛰어 거짓 데이터 유입을 원천 차단합니다.
 */
export function generateSettlementTemplateBuffer(currentYm = '2026-11') {
  const projectSample = [
    {
      '귀속월': currentYm,
      '과제명': '[예시] 2026 소상공인 경영실태조사 (예시행은 업로드 시 자동 제외됩니다)',
      '1티어 발주처': '박팀장(예시)',
      '목표부수': 30,
      '수주단가(1티어)': 20000,
      '기본지급단가(3티어)': 14000,
      '내 확정부수': 10,
      '1티어 3.3%적용': 'Y',
      '1티어 실비가감': 0,
      '1티어 수금상태': '정산대기',
      '메모': '예시 행을 지우거나 아래 줄부터 실제 과제를 입력하세요'
    }
  ];

  const allocSample = [
    {
      '귀속월': currentYm,
      '과제명': '[예시] 2026 소상공인 경영실태조사',
      '3티어 조사원': '김민지(예시)',
      '연락처': '010-1234-5678',
      '은행': '신한',
      '계좌번호': '110-123-456789',
      '예금주': '김민지',
      '할당부수': 20,
      '완료부수': 15,
      '확정부수': 15,
      '지급단가': 14000,
      '3.3%공제여부': 'Y',
      '추가실비': 0,
      '송금상태': '미지급',
      '메모': '동일 과제명으로 매칭되어 3티어 분배에 자동 연결됩니다'
    }
  ];

  const partnerSample = [
    {
      '구분': '3티어 (조사원)',
      '이름/상호': '김민지(예시)',
      '연락처': '010-1234-5678',
      '은행': '신한',
      '계좌번호': '110-123-456789',
      '예금주': '김민지',
      '기본단가': 14000,
      '기본3.3%공제': 'Y',
      '메모': '강남·송파 담당'
    },
    {
      '구분': '1티어 (발주처)',
      '이름/상호': '박팀장(예시)',
      '연락처': '010-9876-5432',
      '은행': '',
      '계좌번호': '',
      '예금주': '',
      '기본단가': 0,
      '기본3.3%공제': 'Y',
      '메모': '케이스탯 1티어'
    }
  ];

  const wb = XLSX.utils.book_new();

  const wsProj = XLSX.utils.json_to_sheet(projectSample);
  wsProj['!cols'] = autoSizeSheetColumns(projectSample);
  XLSX.utils.book_append_sheet(wb, wsProj, '과제별_정산요약');

  const wsAlloc = XLSX.utils.json_to_sheet(allocSample);
  wsAlloc['!cols'] = autoSizeSheetColumns(allocSample);
  XLSX.utils.book_append_sheet(wb, wsAlloc, '3티어_분배및송금');

  const wsPtn = XLSX.utils.json_to_sheet(partnerSample);
  wsPtn['!cols'] = autoSizeSheetColumns(partnerSample);
  XLSX.utils.book_append_sheet(wb, wsPtn, '거래처_조사원장부');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * 업로드된 Excel/CSV 버퍼를 파싱하여 표준화된 구조체(partners, projects, allocations)로 변환합니다.
 */
export function parseSettlementExcelBuffer(buffer, { fallbackPeriodMonth = '2026-11' } = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) {
    throw new Error('엑셀 파일에서 시트를 읽을 수 없습니다.');
  }

  const parsedPartners = [];
  const parsedProjects = [];
  const parsedAllocations = [];
  const detectedSheets = [];
  let skippedRows = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rawRows || rawRows.length === 0) continue;

    const role = classifySheet(sheetName, rawRows);
    if (!role) continue;

    let validInSheet = 0;

    for (const row of rawRows) {
      if (isExampleOrEmptyNoticeRow(row)) {
        skippedRows += 1;
        continue;
      }
      const get = createHeaderAccessor(row);

      if (role === 'partners') {
        const name = String(get(['이름/상호', '이름', '성명', '조사원', '조사원명', '거래처', '거래처명', '상호']) ?? '').trim();
        if (!name) {
          skippedRows += 1;
          continue;
        }
        const tierRaw = String(get(['구분', '티어', '유형', '역할']) ?? '').trim();
        const tier = (tierRaw.includes('1') || tierRaw.includes('발주')) ? 'tier1' : 'tier3';
        parsedPartners.push({
          tier,
          name,
          phone: String(get(['연락처', '전화번호', '휴대폰', '핸드폰']) ?? '').trim(),
          bankName: String(get(['은행', '은행명', '금융기관']) ?? '').trim(),
          accountNumber: String(get(['계좌번호', '계좌', '입금계좌']) ?? '').trim(),
          accountHolder: String(get(['예금주', '예금주명']) ?? '').trim(),
          defaultUnitPrice: parseCleanInt(get(['기본단가', '단가', '기본지급단가']), 0),
          defaultTaxWithholding: parseBoolCell(get(['기본3.3%공제', '3.3%공제', '3.3%', '원천징수', '세금공제']), false),
          memo: String(get(['메모', '비고', '참고']) ?? '').trim()
        });
        validInSheet += 1;
      } else if (role === 'projects') {
        const title = String(get(['과제명', '설문과제명', '캠페인명', '조사명', '프로젝트명', '제목']) ?? '').trim();
        if (!title) {
          skippedRows += 1;
          continue;
        }
        const periodMonth = parsePeriodMonthCell(get(['귀속월', '정산월', '조사월', '년월', '기간']), fallbackPeriodMonth);
        const unitPriceIn = parseCleanInt(get(['수주단가(1티어)', '수주단가', '내가받는단가', '1티어단가', '입금단가']), 0);
        const rawOut = get(['기본지급단가(3티어)', '기본지급단가', '3티어기본단가', '3티어단가', '지급단가']);
        const defaultUnitPriceOut = rawOut !== undefined && String(rawOut).trim() !== ''
          ? parseCleanInt(rawOut, 0)
          : Math.round(unitPriceIn * 0.7);

        const myApprovedRaw = get(['내 확정부수', '내 인정부수', '본인확정부수', '내부수', '직접수행부수']);
        const myCompletedRaw = get(['내 완료부수', '본인완료부수']);
        const myApproved = parseCleanInt(myApprovedRaw !== undefined ? myApprovedRaw : myCompletedRaw, 0);
        const myCompleted = myCompletedRaw !== undefined && String(myCompletedRaw).trim() !== ''
          ? parseCleanInt(myCompletedRaw, myApproved)
          : myApproved;

        const taxCell = get(['1티어 3.3%적용', '1티어 3.3%공제여부', '1티어3.3%', '수주3.3%', '1티어 3.3%공제']);
        const sourceRaw = String(get(['등록방식', '연동방식', '구분']) ?? '').trim();

        parsedProjects.push({
          periodMonth,
          title,
          preferAutoSurveyLink: sourceRaw.includes('AutoSurvey') || sourceRaw.includes('연동'),
          tier1PartnerName: String(get(['1티어 발주처', '1티어', '발주처', '팀장']) ?? '').trim().replace(/^-$/, ''),
          targetQuota: parseCleanInt(get(['목표부수', '목표쿼터', '배정부수', '총쿼터', '목표']), 0),
          unitPriceIn,
          defaultUnitPriceOut,
          myCompleted,
          myApproved,
          taxWithholdingIn: parseBoolCell(taxCell, false),
          extraAdjustmentIn: parseCleanInt(get(['1티어 실비가감', '실비가감', '추가실비', '답례품실비']), 0, true),
          inflowStatus: parseInflowStatusCell(get(['1티어 수금상태', '수금상태', '입금상태'])),
          memo: String(get(['메모', '비고', '참고']) ?? '').trim()
        });
        validInSheet += 1;
      } else if (role === 'allocations') {
        const projectTitle = String(get(['과제명', '설문과제명', '캠페인명', '조사명', '프로젝트명']) ?? '').trim();
        const partnerName = String(get(['3티어 조사원', '조사원', '조사원명', '이름', '성명', '담당자']) ?? '').trim();
        if (!projectTitle || !partnerName) {
          skippedRows += 1;
          continue;
        }
        const periodMonth = parsePeriodMonthCell(get(['귀속월', '정산월', '조사월', '년월', '기간']), fallbackPeriodMonth);
        const approvedRaw = get(['확정부수', '인정부수', '검수확정부수', '정산부수']);
        const completedRaw = get(['완료부수', '응답완료부수', '수행부수']);
        const assignedRaw = get(['할당부수', '분배부수', '배정부수']);

        const approvedCount = parseCleanInt(approvedRaw !== undefined && String(approvedRaw).trim() !== '' ? approvedRaw : completedRaw, 0);
        const completedCount = completedRaw !== undefined && String(completedRaw).trim() !== ''
          ? parseCleanInt(completedRaw, approvedCount)
          : approvedCount;
        const assignedCount = assignedRaw !== undefined && String(assignedRaw).trim() !== ''
          ? parseCleanInt(assignedRaw, completedCount)
          : completedCount;

        const unitOutRaw = get(['지급단가', '3티어단가', '단가']);
        const hasExplicitUnitOut = unitOutRaw !== undefined && String(unitOutRaw).trim() !== '';
        const taxOutCell = get(['3.3%공제여부', '3.3%공제', '3.3%원천징수', '원천징수', '3.3%']);

        parsedAllocations.push({
          periodMonth,
          projectTitle,
          partnerName,
          phone: String(get(['연락처', '전화번호', '휴대폰']) ?? '').trim(),
          bankName: String(get(['은행', '은행명']) ?? '').trim(),
          accountNumber: String(get(['계좌번호', '계좌']) ?? '').trim(),
          accountHolder: String(get(['예금주', '예금주명']) ?? '').trim(),
          assignedCount,
          completedCount,
          approvedCount,
          hasExplicitUnitOut,
          unitPriceOut: hasExplicitUnitOut ? parseCleanInt(unitOutRaw, 0) : null,
          taxWithholdingOut: taxOutCell !== undefined && String(taxOutCell).trim() !== '' ? parseBoolCell(taxOutCell, false) : null,
          extraAdjustmentOut: parseCleanInt(get(['추가실비', '실비', '답례품실비']), 0, true),
          payoutStatus: parsePayoutStatusCell(get(['송금상태', '지급상태', '입금상태'])),
          memo: String(get(['메모', '비고', '참고']) ?? '').trim()
        });
        validInSheet += 1;
      }
    }

    detectedSheets.push({
      sheetName,
      role,
      validRows: validInSheet
    });
  }

  if (detectedSheets.length === 0) {
    throw new Error('인식 가능한 정산 시트(과제별_정산요약 / 3티어_분배및송금 / 거래처_조사원장부)를 찾지 못했습니다. 열 이름을 확인해 주세요.');
  }

  return {
    detectedSheets,
    skippedRows,
    partners: parsedPartners,
    projects: parsedProjects,
    allocations: parsedAllocations
  };
}
