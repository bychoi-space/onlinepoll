import { getMarketMerchants } from '../src/engine/onnuri.js';

const KOREAN_SURNAMES = new Set([
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안',
  '송', '류', '유', '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성',
  '차', '주', '우', '구', '라', '나', '전', '민', '진', '지', '엄', '채', '원', '천', '방', '공', '현',
  '함', '변', '염', '여', '추', '도', '소', '석', '선', '설', '마', '길', '연', '위', '표', '명', '기',
  '반', '왕', '금', '옥', '육', '인', '맹', '제', '탁', '국', '어', '은', '편', '용', '예', '경', '봉'
]);

const COMPOUND_SURNAMES = ['남궁', '황보', '선우', '독고', '제갈', '사공'];

const STOPWORDS = new Set([
  '운영', '상태', '운영상태', '업종', '업종명', '업태', '종목', '사업', '사업자', '사업장', '소재지',
  '주소', '도로명', '지번', '설립', '설립일', '개업', '개업일', '등록', '등록일', '인허가', '인허가일',
  '투찰', '금액', '투찰금액', '입찰', '입찰금액', '예정', '가격', '예정가격', '개찰', '일시', '개찰일시',
  '공고', '번호', '공고번호', '상호', '상호명', '법인', '법인명', '전화', '전화번호', '연락처', '팩스',
  '정상', '영업', '정상영업', '계속', '폐업', '휴업', '자명', '대표', '대표자', '대표자명', '성명',
  '서비스', '블로그', '전통', '시장', '가맹', '가맹점', '안내', '정보', '이용', '방법', '시간',
  '메뉴', '위치', '리뷰', '포장', '배달', '예약', '문의', '종합몰', '통신판매', '신고'
]);

function isValidKoreanPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (STOPWORDS.has(trimmed)) return false;

  if (trimmed.length === 2 || trimmed.length === 3) {
    const surname = trimmed[0];
    if (!KOREAN_SURNAMES.has(surname)) return false;
    return /^[가-힣]+$/.test(trimmed);
  }

  if (trimmed.length === 4) {
    const compSurname = trimmed.slice(0, 2);
    if (COMPOUND_SURNAMES.includes(compSurname)) {
      return /^[가-힣]+$/.test(trimmed);
    }
    return false;
  }

  return false;
}

function cleanPhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 12) return null;
  if (digits.startsWith('00') || digits.startsWith('019') || digits.startsWith('011')) return null;

  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 12 && digits.startsWith('0507')) return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  
  return null;
}

async function searchExternalData({ companyName, bizNumber, address, marketName }) {
  let enrichedPhone = null;
  let enrichedCeo = null;
  let phoneSource = null;
  let ceoSource = null;

  // 1. 대표자명 탐색 (사업자번호 10자리 기반 공인 정보)
  if (bizNumber) {
    try {
      const q = `"${bizNumber}"`;
      const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9'
        }
      });
      const html = await res.text();
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

      const pat = /(?:대표자명|대표자|대표)\s*[:\s\|\-·]\s*([가-힣]{2,4})(?=[\s\·\,\.\-\|\/·\(\)]|$)/g;
      let match;
      while ((match = pat.exec(text)) !== null) {
        const candidate = match[1].trim();
        if (isValidKoreanPersonName(candidate)) {
          enrichedCeo = candidate;
          ceoSource = '공정위·국세청 공인등록정보';
          break;
        }
      }
    } catch (e) {}
  }

  // 2. 전화번호 탐색 (상호 + 시장명/지역)
  const queries = [
    `${marketName || ''} ${companyName}`.trim(),
    `${companyName} ${address ? address.split(' ').slice(0, 3).join(' ') : ''}`.trim()
  ];

  for (const q of queries) {
    if (enrichedPhone) break;
    try {
      const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9'
        }
      });
      const html = await res.text();

      const idx = html.indexOf(companyName);
      if (idx !== -1) {
        const nearText = html.slice(Math.max(0, idx - 500), idx + 800);
        const phoneMatches = nearText.match(/(?:0\d{1,2}|0507)-\d{3,4}-\d{4}/g) || [];
        const valid = phoneMatches.map(cleanPhone).filter(Boolean);
        if (valid.length > 0) {
          enrichedPhone = valid[0];
          phoneSource = '네이버 플레이스/검색';
          break;
        }
      }
    } catch (e) {}
  }

  return {
    enrichedPhone,
    phoneSource,
    enrichedCeo,
    ceoSource
  };
}

async function runTest() {
  console.log('풍납시장 5개 가맹점 재검증...');
  const merchants = await getMarketMerchants({
    regionCode: '01',
    districtCode: '01018',
    marketName: '풍납시장',
    limit: 5
  });

  for (const m of merchants) {
    console.log(`\n========================================`);
    console.log(`[대상] ${m.companyName} (${m.bizNumber}) | ${m.address}`);
    const res = await searchExternalData({
      companyName: m.companyName,
      bizNumber: m.bizNumber,
      address: m.address,
      marketName: m.marketName
    });
    console.log(`  -> 대표자: ${res.enrichedCeo || 'null (유지)'} ${res.ceoSource ? `(${res.ceoSource})` : ''}`);
    console.log(`  -> 연락처: ${res.enrichedPhone || 'null (유지)'} ${res.phoneSource ? `(${res.phoneSource})` : ''}`);
  }
}

runTest();
