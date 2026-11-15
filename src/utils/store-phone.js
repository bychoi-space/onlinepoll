import crypto from 'crypto';

export const KSTAT_VALID_PHONE_RE = /^(?:\d{4}-\d{4}|\d{2}-\d{3,4}-\d{4}|\d{3}-\d{3,4}-\d{4}|\d{4}-\d{3,4}-\d{4})$/;

export function normalizePhoneDigits(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('020') && d.length === 10) d = '02' + d.slice(3);
  return d;
}

export function normalizeStorePhoneFormat(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const d = normalizePhoneDigits(trimmed);
  if (!d) return '';
  if (/^050\d$/.test(d.slice(0, 4))) {
    if (d.length === 11) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
    if (d.length === 12) return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.startsWith('02')) {
    if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `02-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (/^1\d{3}$/.test(d.slice(0, 4)) && d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  if (/^0\d{2}/.test(d)) {
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return trimmed;
}

export function isDummyOrInvalidStorePhone(raw) {
  if (!raw || typeof raw !== 'string') return true;
  const formatted = normalizeStorePhoneFormat(raw);
  if (!KSTAT_VALID_PHONE_RE.test(formatted)) return true;
  const d = normalizePhoneDigits(formatted);
  if (d.length < 8 || d.length > 12) return true;

  if (['0212345678', '020001111', '0200001111', '0215770000', '020000000', '0200000000'].includes(d)) {
    return true;
  }
  if (/^050\d/.test(d)) {
    return !(d.length === 11 || d.length === 12);
  }
  if (/^1\d{3}$/.test(d.slice(0, 4)) && d.length === 8) {
    return d.slice(4) === '0000';
  }
  if (d.startsWith('02')) {
    const mid = d.slice(2, d.length - 4);
    if (!/^[2-9]\d{2,3}$/.test(mid)) return true;
  } else if (/^0\d{2}/.test(d)) {
    const mid = d.slice(3, d.length - 4);
    if (!/^[1-9]\d{2,3}$/.test(mid)) return true;
  }

  const tail7 = d.slice(-7);
  if (/^(\d)\1{6}$/.test(tail7) || tail7 === '0000000' || tail7 === '1111111' || tail7 === '1234567') {
    return true;
  }
  const midPart = formatted.split('-')[1] || '';
  const lastPart = formatted.split('-')[2] || formatted.split('-')[1] || '';
  if ((/^0+$/.test(midPart) || /^9+$/.test(midPart)) && (/^0+$/.test(lastPart) || /^9+$/.test(lastPart) || lastPart === '1111')) {
    return true;
  }
  if (/^(\d)\1{2,3}$/.test(midPart) && midPart[0] === lastPart[0] && /^(\d)\1{3}$/.test(lastPart)) {
    return true;
  }
  return false;
}

/**
 * 사업장 주소 기반 지역번호 추출 (지역 판별 불가 시 '070' 반환)
 */
export function resolveStoreAreaCode(address = '') {
  const addr = String(address || '').trim();
  const cleanAddr = (addr.includes('내 점포') && addr.includes('quota_')) ? '' : addr;
  if (!cleanAddr) return '070';

  // 부천시는 지역번호 032 사용
  if (/부천시|(?:^|\s)(?:원미구|소사구|오정구)(?:\s|$)/.test(cleanAddr)) return '032';

  if (/^(?:\(\d{5}\)\s*)?(?:서울특별시|서울시|서울)(?:\s|$|[가-힣]+구)/.test(cleanAddr)) return '02';
  if (/^(?:\(\d{5}\)\s*)?(?:경기도|경기)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '031';
  if (/^(?:\(\d{5}\)\s*)?(?:인천광역시|인천시|인천)(?:\s|$|[가-힣]+[구군])/.test(cleanAddr)) return '032';
  if (/^(?:\(\d{5}\)\s*)?(?:강원특별자치도|강원도|강원)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '033';
  if (/^(?:\(\d{5}\)\s*)?(?:충청북도|충북)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '043';
  if (/^(?:\(\d{5}\)\s*)?(?:충청남도|충남)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '041';
  if (/^(?:\(\d{5}\)\s*)?(?:대전광역시|대전시|대전)(?:\s|$|(?:동구|중구|서구|유성구|대덕구))/.test(cleanAddr)) return '042';
  if (/^(?:\(\d{5}\)\s*)?(?:세종특별자치시|세종시|세종)(?:\s|$)/.test(cleanAddr)) return '044';
  if (/^(?:\(\d{5}\)\s*)?(?:전북특별자치도|전라북도|전북)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '063';
  if (/^(?:\(\d{5}\)\s*)?(?:전라남도|전남)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '061';
  if (/^(?:\(\d{5}\)\s*)?(?:광주광역시|광주시\s*(?:동구|서구|남구|북구|광산구)|광주\s*(?:동구|서구|남구|북구|광산구))/.test(cleanAddr)) return '062';
  if (/^(?:\(\d{5}\)\s*)?(?:경상북도|경북)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '054';
  if (/^(?:\(\d{5}\)\s*)?(?:경상남도|경남)(?:\s|$|[가-힣]+[시군])/.test(cleanAddr)) return '055';
  if (/^(?:\(\d{5}\)\s*)?(?:대구광역시|대구시|대구)(?:\s|$|[가-힣]+[구군])/.test(cleanAddr)) return '053';
  if (/^(?:\(\d{5}\)\s*)?(?:울산광역시|울산시|울산)(?:\s|$|[가-힣]+[구군])/.test(cleanAddr)) return '052';
  if (/^(?:\(\d{5}\)\s*)?(?:부산광역시|부산시|부산)(?:\s|$|[가-힣]+[구군])/.test(cleanAddr)) return '051';
  if (/^(?:\(\d{5}\)\s*)?(?:제주특별자치도|제주도|제주시|서귀포시|제주)(?:\s|$)/.test(cleanAddr)) return '064';

  if (/서울특별시|서울시/.test(cleanAddr)) return '02';
  if (/경기도/.test(cleanAddr)) return '031';
  if (/인천광역시|인천시/.test(cleanAddr)) return '032';
  if (/강원특별자치도|강원도/.test(cleanAddr)) return '033';
  if (/충청북도/.test(cleanAddr)) return '043';
  if (/충청남도/.test(cleanAddr)) return '041';
  if (/대전광역시|대전시/.test(cleanAddr)) return '042';
  if (/세종특별자치시|세종시/.test(cleanAddr)) return '044';
  if (/전북특별자치도|전라북도/.test(cleanAddr)) return '063';
  if (/전라남도/.test(cleanAddr)) return '061';
  if (/광주광역시/.test(cleanAddr)) return '062';
  if (/경상북도/.test(cleanAddr)) return '054';
  if (/경상남도/.test(cleanAddr)) return '055';
  if (/대구광역시|대구시/.test(cleanAddr)) return '053';
  if (/울산광역시|울산시/.test(cleanAddr)) return '052';
  if (/부산광역시|부산시/.test(cleanAddr)) return '051';
  if (/제주특별자치도|제주도|제주시|서귀포시/.test(cleanAddr)) return '064';

  if (/(?:종로구|용산구|성동구|광진구|동대문구|중랑구|성북구|강북구|도봉구|노원구|은평구|서대문구|마포구|양천구|구로구|금천구|영등포구|동작구|관악구|서초구|강남구|송파구|강동구)/.test(cleanAddr)) return '02';
  if (/(?:미추홀구|연수구|남동구|부평구|계양구|강화군|옹진군)/.test(cleanAddr)) return '032';
  if (/(?:수원시|성남시|분당구|수정구|중원구|의정부시|안양시|동안구|만안구|안산시|고양시|과천시|구리시|남양주시|오산시|시흥시|군포시|의왕시|하남시|용인시|파주시|이천시|안성시|김포시|화성시|양주시|포천시|여주시|양평군|가평군|연천군)/.test(cleanAddr)) return '031';

  return '070';
}

export function generateUniqueRegionalPhone(areaCode = '070', seedStr = '', usedPhoneDigits = null) {
  const safeArea = areaCode || '070';
  for (let attempt = 0; attempt < 5000; attempt++) {
    const h = crypto.createHash('md5').update(`${seedStr}_${attempt}`).digest();
    let mid, last4;
    if (safeArea === '02') {
      const firstDigit = 2 + (h[0] % 8);
      const use4 = (h[1] % 3 !== 0);
      mid = use4 ? `${firstDigit}${h[2] % 10}${h[3] % 10}${h[4] % 10}` : `${firstDigit}${h[2] % 10}${h[3] % 10}`;
    } else if (safeArea === '070') {
      const firstChoices = [4, 7, 8];
      const firstDigit = firstChoices[h[0] % firstChoices.length];
      mid = `${firstDigit}${h[1] % 10}${h[2] % 10}${h[3] % 10}`;
    } else {
      const firstDigit = 2 + (h[0] % 8);
      const use4 = (safeArea === '031' || safeArea === '032' || safeArea === '051') ? (h[1] % 2 === 0) : (h[1] % 3 === 0);
      mid = use4 ? `${firstDigit}${h[2] % 10}${h[3] % 10}${h[4] % 10}` : `${firstDigit}${h[2] % 10}${h[3] % 10}`;
    }
    last4 = `${h[5] % 10}${h[6] % 10}${h[7] % 10}${h[8] % 10}`;
    if (/^(\d)\1+$/.test(mid) || /^(\d)\1+$/.test(last4)) continue;
    if (['0000', '1111', '1234', '5678', '9999', '1004', '2580'].includes(last4)) continue;
    if (['000', '111', '123', '0000', '1111', '1234'].includes(mid)) continue;

    const formatted = `${safeArea}-${mid}-${last4}`;
    const digits = `${safeArea}${mid}${last4}`;
    if ((!usedPhoneDigits || !usedPhoneDigits.has(digits)) && !isDummyOrInvalidStorePhone(formatted)) {
      if (usedPhoneDigits) usedPhoneDigits.add(digits);
      return formatted;
    }
  }
  return `070-4821-7394`;
}

export function ensureUniqueStorePhone(rawPhone, address = '', seedStr = '', usedPhoneDigits = null) {
  const formatted = normalizeStorePhoneFormat(rawPhone);
  const digits = normalizePhoneDigits(formatted);
  if (formatted && !isDummyOrInvalidStorePhone(formatted) && (!usedPhoneDigits || !usedPhoneDigits.has(digits))) {
    if (usedPhoneDigits) usedPhoneDigits.add(digits);
    return formatted;
  }
  const areaCode = resolveStoreAreaCode(address);
  return generateUniqueRegionalPhone(areaCode, seedStr || `${address}_${Date.now()}_${Math.random()}`, usedPhoneDigits);
}

