import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

console.log('=== HTML 인라인 스타일 전수 조사 시작 ===');
console.log('대상 파일들:', files);

const summary = {};

files.forEach(file => {
  const filePath = path.join(publicDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches = [];

  lines.forEach((line, idx) => {
    const regex = /style\s*=\s*(["'])(.*?)\1/gi;
    let m;
    while ((m = regex.exec(line)) !== null) {
      matches.push({
        line: idx + 1,
        rawStyle: m[0],
        styleContent: m[2],
        snippet: line.trim()
      });
    }
  });

  summary[file] = matches;
  console.log(`\n[${file}] 발견된 인라인 스타일 수: ${matches.length}개`);
  matches.forEach(m => {
    console.log(`  Line ${m.line}: ${m.rawStyle}  -->  ${m.snippet.slice(0, 80)}...`);
  });
});

console.log('\n=== 전수 조사 집계 결과 ===');
let total = 0;
for (const [f, list] of Object.entries(summary)) {
  console.log(`- ${f}: ${list.length}건`);
  total += list.length;
}
console.log(`총 인라인 스타일 개수: ${total}건`);

// JSON 파일로도 저장
fs.writeFileSync(path.join(__dirname, 'inline-styles-report.json'), JSON.stringify(summary, null, 2), 'utf-8');
console.log('\n상세 결과가 scripts/inline-styles-report.json에 저장되었습니다.');
