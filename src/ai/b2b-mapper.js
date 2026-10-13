/**
 * B2B 질문 - 사업자 데이터 지능형 매퍼 (B2B Field Mapper)
 * 설문지의 질문 내용을 분석하여 사용자가 선택한 사업자 실존 데이터 필드와 자동 매칭합니다.
 */

// 필드별 매칭 키워드 사전
const FIELD_KEYWORDS = {
  companyName: ['상호', '회사명', '기업명', '상호명', '법인명', '업체명', 'company'],
  bizNumber: ['사업자', '사업자등록', '사업자번호', '사업자 등록번호', '등록번호', 'biz'],
  ceoName: ['대표자', '대표명', '대표자명', '대표 성함', '대표자 성명', '대표이사', 'ceo'],
  industry: ['업종', '업태', '주요업종', '산업분류', 'industry'],
  subIndustry: ['세부업종', '취급품목', '주요품목', '주생산품'],
  phone: ['전화번호', '연락처', '대표전화', '유선전화', 'tel', 'phone'],
  openingDate: ['개업일', '설립일', '창립일', '개업일자', '설립연도', '창립연도'],
  address: ['주소', '소재지', '사업장 주소', '본점 주소', '사업장 소재지', 'address', '위치'],
  category: ['분류', '기업분류', '기업형태', '기업구분', '규모']
};

/**
 * 질문이 B2B 사업자 필드 중 하나에 해당하는지 판별하고, 해당 실제 사업자 데이터를 반환
 * @param {Object} params
 * @param {string} params.questionTitle 질문 제목
 * @param {Object} params.businessData 실제 사업자 데이터 (9대 필드)
 * @param {Array<string>} params.selectedFields 사용자가 대시보드에서 체크한 활성 필드 목록
 * @returns {{ isMatched: boolean, fieldName: string|null, value: string|null }}
 */
export function matchBusinessField({
  questionTitle = '',
  businessData = null,
  selectedFields = []
}) {
  if (!businessData || !questionTitle) {
    return { isMatched: false, fieldName: null, value: null };
  }

  const lowerQ = questionTitle.toLowerCase().replace(/\s+/g, '');

  // 활성화된 필드(또는 전체)에 대해 우선순위 매칭
  const activeFields = (selectedFields && selectedFields.length > 0)
    ? selectedFields
    : Object.keys(FIELD_KEYWORDS);

  for (const field of activeFields) {
    const keywords = FIELD_KEYWORDS[field];
    if (!keywords) continue;

    for (const kw of keywords) {
      if (lowerQ.includes(kw.replace(/\s+/g, ''))) {
        const val = businessData[field];
        if (val) {
          return {
            isMatched: true,
            fieldName: field,
            value: String(val).trim()
          };
        }
      }
    }
  }

  return { isMatched: false, fieldName: null, value: null };
}

/**
 * 객관식 보기 중 사업자 정보(업종, 지역 등)와 가장 일치하는 옵션 인덱스 탐색
 * @param {Object} params
 * @param {Array<string>} params.options 객관식 보기 목록
 * @param {Object} params.businessData 실제 사업자 데이터
 * @returns {number|null} 매칭된 보기의 0-based 인덱스
 */
export function matchBusinessOption({ options = [], businessData = null }) {
  if (!businessData || !options || options.length === 0) return null;

  const searchPool = [
    businessData.industry,
    businessData.subIndustry,
    businessData.category,
    businessData.address ? businessData.address.slice(0, 4) : ''
  ].filter(Boolean);

  for (let i = 0; i < options.length; i++) {
    const optText = options[i];
    for (const term of searchPool) {
      if (optText.includes(term) || term.includes(optText)) {
        return i;
      }
    }
  }

  return null;
}
