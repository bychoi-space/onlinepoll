import fs from 'fs';
import path from 'path';

const quotasDir = path.resolve('data/quotas');
const files = fs.readdirSync(quotasDir).filter(f => f.endsWith('.json'));

const list = files.map(f => {
  const content = JSON.parse(fs.readFileSync(path.join(quotasDir, f), 'utf-8'));
  return {
    fileName: f,
    title: content.title,
    count: content.count,
    createdAt: content.createdAt
  };
}).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

console.log('최신 저장된 쿼터 목록:');
list.slice(0, 5).forEach((q, idx) => {
  console.log(`[${idx + 1}] ${q.title} (${q.count}건) - 파일: ${q.fileName}`);
});
