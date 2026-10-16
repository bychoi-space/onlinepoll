import fs from 'fs';

const html = fs.readFileSync('public/survey-detail.html', 'utf-8');
const js = fs.readFileSync('scripts/gcp-survey-detail-auth.js', 'utf-8');

// Find all foo.addEventListener
const regex = /(\b[a-zA-Z0-9_]+)\.addEventListener/g;
let match;
const listeners = new Set();
while ((match = regex.exec(js)) !== null) {
  listeners.add(match[1]);
}

console.log('Variables with addEventListener:');
for (const varName of listeners) {
  // Find where varName is declared with getElementById
  const declRegex = new RegExp(`const\\s+${varName}\\s*=\\s*document\\.getElementById\\(['"]([^'"]+)['"]\\)`);
  const declMatch = js.match(declRegex);
  if (declMatch) {
    const id = declMatch[1];
    const exists = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
    console.log(` - ${varName} (id="${id}"): ${exists ? 'EXISTS' : '❌ MISSING IN HTML!'}`);
  } else {
    console.log(` - ${varName}: (not a direct getElementById)`);
  }
}
