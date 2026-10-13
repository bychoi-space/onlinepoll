import http from 'http';

const urls = [
  'http://localhost:3000/',
  'http://localhost:3000/index.html',
  'http://localhost:3000/survey-detail.html?id=camp_1776000000000',
  'http://localhost:3000/quota-builder.html',
  'http://localhost:3000/mock-survey.html',
  'http://localhost:3000/mock-survey-b2b.html',
  'http://localhost:3000/custom-styles.css'
];

let checked = 0;
urls.forEach(url => {
  http.get(url, res => {
    console.log(`[HTTP ${res.statusCode}] ${url}`);
    checked++;
    if (checked === urls.length) {
      console.log('\n=== 모든 페이지 및 CSS 서빙 검증 완료! ===');
    }
  }).on('error', err => {
    console.error(`[ERROR] ${url}:`, err.message);
  });
});
