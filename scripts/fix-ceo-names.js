import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enrichBusinessData } from '../src/engine/enricher.js';
import { exportBusinessesToExcel } from '../src/utils/excel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const quotasDir = path.join(rootDir, 'data', 'quotas');

const filename = 'quota_onnuri_2026_풍납시장_업종별24개_조사쿼터_1792039611646';
const jsonPath = path.join(quotasDir, `${filename}.json`);
const xlsxPath = path.join(quotasDir, `${filename}.xlsx`);

async function fixCeoNames() {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const invalidCeos = ['기업', '소재지', '사업자', '설립일', '대표자', '연락처', '서비스', '등록'];

  for (let i = 0; i < raw.data.length; i++) {
    const item = raw.data[i];
    if (invalidCeos.includes(item.ceoName)) {
      item.ceoName = null;
    }

    if (!item.ceoName) {
      try {
        const enriched = await enrichBusinessData(item);
        if (enriched.ceoName && !invalidCeos.includes(enriched.ceoName)) {
          item.ceoName = enriched.ceoName;
          item.ceoSource = enriched.ceoSource || null;
        }
      } catch (_) {}
    }

    console.log(`[${i + 1}/24] ${item.companyName} | 대표자: ${item.ceoName || 'null'} | 연락처: ${item.phone || 'null'}`);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(raw, null, 2), 'utf-8');
  exportBusinessesToExcel({
    data: raw.data,
    columns: raw.columns,
    filePath: xlsxPath
  });

  console.log('JSON & Excel 업데이트 완료!');
}

fixCeoNames().catch(console.error);
