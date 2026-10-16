import fs from 'fs';

const html = fs.readFileSync('scripts/gcp-survey-detail.html', 'utf-8');
const js = fs.readFileSync('scripts/gcp-survey-detail-auth.js', 'utf-8');

// Find all document.getElementById('...')
const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = new Set();
while ((match = regex.exec(js)) !== null) {
  ids.add(match[1]);
}

console.log(`Checking ${ids.size} getElementById calls...`);
const missing = [];
for (const id of ids) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.push(id);
  }
}

if (missing.length > 0) {
  console.log('🚨 MISSING ELEMENT IDs FOUND in HTML:');
  missing.forEach(id => console.log(' - ' + id));
} else {
  console.log('✅ All element IDs exist in HTML!');
}
