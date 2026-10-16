import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('scripts/gcp-survey-detail.html', 'utf-8');
const js = fs.readFileSync('scripts/gcp-survey-detail-auth.js', 'utf-8');

const dom = new JSDOM(html, {
  url: 'http://34.64.233.77:3000/survey-detail.html?id=camp_1792039653802',
  runScripts: 'outside-only'
});

const { window } = dom;

// Mock fetch
window.fetch = async (url, opts) => {
  console.log('[BROWSER FETCH CALL]', url);
  if (url === '/api/quota/list') {
    return {
      ok: true,
      json: async () => [
        { fileName: 'q1.json', title: '쿼터1', count: 5, createdAt: new Date().toISOString() }
      ]
    };
  }
  if (url.startsWith('/api/campaigns/')) {
    return {
      ok: true,
      json: async () => ({
        id: 'camp_1792039653802',
        title: '2026 전통시장 점포경영 실태조사 _ 풍납시장',
        status: 'ready',
        quotaDatabase: [],
        guidelineConfig: {
          surveyUrl: '',
          topic: '',
          positiveRatio: 70,
          neutralRatio: 20,
          negativeRatio: 10,
          textGuidelines: '',
          iterations: 1,
          headless: true
        }
      })
    };
  }
  return { ok: true, json: async () => ({}) };
};

// Mock EventSource
window.EventSource = function() {
  return {
    addEventListener: () => {},
    onmessage: () => {}
  };
};

try {
  console.log('Evaluating script in DOM...');
  window.eval(js);
  console.log('Script evaluated. Dispatching DOMContentLoaded...');
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  
  setTimeout(() => {
    const titleEl = window.document.getElementById('detail-campaign-title');
    const selectSaved = window.document.getElementById('select-saved-quota');
    console.log('detail-campaign-title text:', titleEl.textContent);
    console.log('select-saved-quota options:', selectSaved.innerHTML);
  }, 100);

} catch (err) {
  console.error('CRASHED DURING EXECUTION:', err);
}
