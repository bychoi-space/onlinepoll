import fs from 'fs';

async function fetchGcpJs() {
  const res = await fetch('http://8.230.14.1:3000/survey-detail.js');
  const text = await res.text();
  console.log(`GCP survey-detail.js length: ${text.length} chars`);
  fs.writeFileSync('scripts/gcp-survey-detail.js', text, 'utf-8');
  console.log('Saved to scripts/gcp-survey-detail.js');
}

fetchGcpJs().catch(console.error);
