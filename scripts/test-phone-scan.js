import { formatAndValidatePhone } from '../src/engine/enricher.js';

async function testPhoneScan() {
  const query = '풍납시장 백군떡방';
  const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': 'https://www.naver.com/'
    }
  });

  const html = await res.text();
  const address = '서울특별시 송파구 바람드리길 38-1';
  const compName = '백군떡방';

  // 모든 전화번호 패턴 수집
  const phoneRegex = /(?:0\d{1,2}|0507)-\d{3,4}-\d{4}/g;
  let match;
  const candidates = [];

  while ((match = phoneRegex.exec(html)) !== null) {
    const rawPhone = match[0];
    const phoneIdx = match.index;
    const validated = formatAndValidatePhone(rawPhone, address);
    if (!validated) continue;

    // 해당 전화번호 주변 1000자 텍스트에서 상호 또는 주소 키워드 출현 여부 점수 계산
    const surrounding = html.slice(Math.max(0, phoneIdx - 600), phoneIdx + 600);
    let score = 0;
    if (surrounding.includes(compName)) score += 50;
    if (surrounding.includes('풍납')) score += 20;
    if (surrounding.includes('바람드리')) score += 30;
    if (surrounding.includes('송파')) score += 10;

    candidates.push({ phone: validated, score, idx: phoneIdx });
  }

  candidates.sort((a, b) => b.score - a.score);
  console.log('후보 전화번호 목록 (점수순):', candidates.slice(0, 5));
}

testPhoneScan();
