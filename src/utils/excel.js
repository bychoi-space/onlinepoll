/**
 * Excel (.xlsx) 생성 및 파일 내보내기 유틸리티
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

/**
 * 사업자 데이터 배열을 Excel(.xlsx) 파일로 변환하여 저장
 * @param {Object} params
 * @param {Array<Object>} params.data 사업자 데이터 목록
 * @param {Array<{ key: string, label: string }>} params.columns 포함할 컬럼 정의 (key: 데이터 키, label: 엑셀 헤더)
 * @param {string} params.filePath 저장할 파일 경로
 * @returns {string} 생성된 파일 절대 경로
 */
export function exportBusinessesToExcel({ data = [], columns = [], filePath }) {
  if (!data || data.length === 0) {
    throw new Error('내보낼 데이터가 비어 있습니다.');
  }

  // 1. 엑셀 행 데이터 변환 (한글 헤더 적용)
  const rows = data.map((item, index) => {
    const row = { 'No': index + 1 };
    columns.forEach(col => {
      row[col.label || col.key] = (item[col.key] !== undefined && item[col.key] !== null) ? item[col.key] : '';
    });
    return row;
  });

  // 2. 워크시트 및 워크북 생성
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // 3. 열 너비(Col Widths) 자동 계산
  const colKeys = Object.keys(rows[0] || {});
  const colWidths = colKeys.map(key => {
    let maxLen = key.length * 2.2;
    for (const r of rows) {
      const val = String(r[key] || '');
      // 한글 글자 너비 보정
      const len = Array.from(val).reduce((acc, char) => acc + (char.charCodeAt(0) > 128 ? 2 : 1), 0);
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
  });

  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '조사쿼터_사업자목록');

  // 디렉터리 확인 및 저장
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  XLSX.writeFile(workbook, filePath);
  return filePath;
}
