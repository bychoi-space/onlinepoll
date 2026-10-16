import fs from 'fs';

const js = fs.readFileSync('scripts/gcp-survey-detail-auth.js', 'utf-8');

// Mock DOM element factory
function makeEl(id = '') {
  return {
    id,
    value: '0',
    textContent: '',
    innerHTML: '',
    className: '',
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    style: {},
    addEventListener: (ev, fn) => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    appendChild: () => {},
    scrollTop: 0,
    scrollHeight: 0,
    disabled: false
  };
}

const elements = {};
const doc = {
  getElementById: (id) => {
    if (!elements[id]) {
      elements[id] = makeEl(id);
    }
    return elements[id];
  },
  querySelectorAll: (sel) => [],
  querySelector: (sel) => makeEl(),
  addEventListener: (ev, cb) => {
    if (ev === 'DOMContentLoaded') {
      setTimeout(cb, 10);
    }
  }
};

const win = {
  location: {
    search: '?id=camp_1792039653802',
    href: ''
  },
  alert: (msg) => console.log('[ALERT]', msg),
  fetch: async (url, opts) => {
    console.log('[MOCK FETCH]', url);
    if (url === '/api/quota/list') {
      return {
        ok: true,
        json: async () => [
          { fileName: 'quota1.json', title: '쿼터1', count: 5, createdAt: new Date().toISOString() }
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
  },
  EventSource: function() {
    return {
      addEventListener: () => {},
      onmessage: () => {}
    };
  }
};

// Run the script with mock globals
const wrapped = `
(async function(window, document, fetch, EventSource, URLSearchParams) {
  ${js}
})(win, doc, win.fetch, win.EventSource, URLSearchParams);
`;

try {
  eval(wrapped);
  setTimeout(() => {
    console.log('Campaign title:', elements['detail-campaign-title']?.textContent);
    console.log('Saved quota dropdown:', elements['select-saved-quota']?.innerHTML);
  }, 50);
} catch (err) {
  console.error('CRASHED WITH ERROR:', err);
}
