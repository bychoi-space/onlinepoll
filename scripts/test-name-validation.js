// 대한민국 주요 성씨 (통계청 기준 99% 이상 커버)
const KOREAN_SURNAMES = new Set([
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안',
  '송', '류', '유', '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성',
  '차', '주', '우', '구', '라', '나', '전', '민', '진', '지', '엄', '채', '원', '천', '방', '공', '현',
  '함', '변', '염', '여', '추', '도', '소', '석', '선', '설', '마', '길', '연', '위', '표', '명', '기',
  '반', '왕', '금', '옥', '육', '인', '맹', '제', '탁', '국', '어', '은', '편', '용', '예', '경', '봉'
]);

// 복합 성씨 (2글자 성씨)
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

  // 2~3글자 이름 검증
  if (trimmed.length === 2 || trimmed.length === 3) {
    const surname = trimmed[0];
    if (!KOREAN_SURNAMES.has(surname)) return false;
    // 두 번째, 세 번째 글자가 한글 완성형인지 확인
    return /^[가-힣]+$/.test(trimmed);
  }

  // 4글자 이름 (2글자 복합성씨인 경우만 인정)
  if (trimmed.length === 4) {
    const compSurname = trimmed.slice(0, 2);
    if (COMPOUND_SURNAMES.includes(compSurname)) {
      return /^[가-힣]+$/.test(trimmed);
    }
    return false;
  }

  return false;
}

// 테스트
console.log('이은지:', isValidKoreanPersonName('이은지')); // true
console.log('오지은:', isValidKoreanPersonName('오지은')); // true
console.log('김희영:', isValidKoreanPersonName('김희영')); // true
console.log('박현주:', isValidKoreanPersonName('박현주')); // true
console.log('손상욱:', isValidKoreanPersonName('손상욱')); // true
console.log('운영상태:', isValidKoreanPersonName('운영상태')); // false
console.log('업종명:', isValidKoreanPersonName('업종명')); // false
console.log('투찰금액:', isValidKoreanPersonName('투찰금액')); // false
console.log('자명:', isValidKoreanPersonName('자명')); // false
console.log('선우용여:', isValidKoreanPersonName('선우용여')); // true
