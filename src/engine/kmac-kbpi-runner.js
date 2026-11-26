/**
 * [KMAC 2027년 한국산업의브랜드파워(K-BPI) 조사 - 전용 자동화 러너]
 * - 대상 포털: https://isurvey.kmaresearch.co.kr/sy/login (ID: 230)
 * - 핵심 기능:
 *   1. 지역별 브라우저 GPS 강제 주입 (서울=노원구청 / 인천=인천광역시청 + 응답자 고유 시드 미세 분산)
 *   2. 신상정보 자동 분기 (010 휴대폰 vs 02 일반전화) 및 SQ1 "모두 없다" 스크리닝 통과
 *   3. 산업군(카테고리) 동적 감지 + 마스터 브랜드 사전 & 실시간 학습 캐시 + Gemini AI 폴백
 *   4. 문항 1~8 정합성 엔진:
 *      - 문항 3(1~9): 44444 일렬 금지, 3·4·5 분산 / 3-10: 평균 반올림
 *      - 구입경험 '없음' 시: 3-11(1·2·3번 중 선택, 4·5번 절대 금지) + 3-13(전원 아니오) + 문4·문5(없음)
 *      - 구입경험 '있음' 시: 3-13(1번열 예) + 3-11(만족도 4~5->4·5번 / 3->2·3번) + 문4(1번열 브랜드) + 문4-1(편의점·동네슈퍼 등 맞춤 채널) + 문5(문4 동일)
 *      - 문항 6(아니오 80 : 예 20) / 문항 7(1·2순위 랜덤, 기타 절대 금지) / 문항 8(랜덤 2개, 기타·없음 제외)
 *   5. 파일럿 모드 기본 문항 4 도달 시 안전 정지(stopAtStep: 'Q4') 및 완료 직전 안전 대기(Rule 10) 지원
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchChromium } from '../utils/chromium-launcher.js';
import { writeJsonAtomicSync } from '../utils/atomic-file.js';
import {
  KBPI_DEFAULT_LOGIN_ID,
  computeKbpiGps,
  computeKbpiDistrictDong,
  enrichKbpiRespondentDemographics,
  normalizeCategoryConfigs
} from '../utils/kmac-kbpi-sheet-sync.js';
import {
  KMAC_ISURVEY_LOGIN_URL,
  loginAndEnterKbpiCapiList
} from './kmac-kbpi-scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const brandDictPath = path.join(rootDir, 'data', 'kbpi_2027_brand_dict.json');
const learnedDictPath = path.join(rootDir, 'data', 'kbpi_2027_learned_categories.json');

export const KBPI_DEFAULT_URL = KMAC_ISURVEY_LOGIN_URL;

export const DEFAULT_KBPI_POLICY = {
  pilotStopAtStep: 'FINAL_GATE',  // 단건(파일럿) 실행 시에도 문항 4에서 멈추지 않고 최종 제출 직전(ZQ6)까지 진행 후 안전 대기
  stopBeforeFinalSubmit: true,    // 배치 실행 시에도 기본 완료 직전 대기 (Rule 10)
  purchaseYesRate: 90,            // 시트 미지정 품목의 구입경험 '있음' 비율 (기본 90%)
  unaided4thBrandRate: 35,        // 문항 1-4 추가 브랜드 1개 입력 비율 (나머지 65%는 '없음' 체크)
  aidedExtraMin: 2,               // 문항 2 추가 랜덤 선택 최소 개수
  aidedExtraMax: 4,               // 문항 2 추가 랜덤 선택 최대 개수
  q6NoRate: 80,                   // 문항 6 '아니오' 선택 비율 (기본 80%)
  teenAutoNoneUnfitCategories: true, // 10대 미성년자에게 주류/자동차/금융/대형주방가전 출제 시 시트 미지정이면 '없음' 자동 보정
  autoSyncGoogleSheet: true,      // 진행 후 구글 시트 자동 기록 여부
  proxyServer: ''                 // 필요 시 서울 리전 프록시 경유 주소
};

const TEEN_UNFIT_CATEGORY_KEYWORDS = [
  '소주', '맥주', '위스키', '와인', '막걸리', '전통주', '주류', '숙취', '담배', '전자담배',
  '자동차', '수입차', '전기차', '중고차', '타이어', '주유소', '충전소', '내비게이션', '블랙박스', '렌터카', '카셰어링',
  '운전자보험', '생명보험', '손해보험', '실손보험', '연금', '보험', '신용카드', '증권', '자산관리', '펀드', '대출', '저축은행', '신탁',
  '사이버대학', '대학원', 'MBA', '평생교육', '결혼정보', '웨딩', '상조', '산후조리', '기저귀', '분유', '유모차', '카시트', '유아',
  '음식물처리기', '김치냉장고', '식기세척기', '비데', '정수기', '안마의자', '침대', '매트리스', '보일러', '온수기', '부엌가구', '인테리어', '창호', '아파트', '오피스텔',
  '건강검진센터', '임플란트', '구호개발단체', 'NGO', '자선'
];

const MALE_UNFIT_CATEGORY_KEYWORDS = [
  '생리대', '여성청결제', '여성복', '여성정장', '여성언더웨어', '산부인과', '산후조리'
];

const FEMALE_UNFIT_CATEGORY_KEYWORDS = [
  '남성정장', '남성화장품', '전기면도기', '면도기', '남성복'
];

export const Q3_RECOMMEND_REASON_POOLS = {
  positive: [
    '인지도가 높고 신뢰가 가서',
    '서비스와 품질이 우수해서',
    '주변 평판이 좋아서',
    '이용이 편리하고 만족스러워서',
    '전문성과 시스템이 믿음직해서',
    '기대만큼 만족도가 높아서',
    '대중적이고 평이 좋아서',
    '안정적이고 믿을 수 있어서',
    '전반적인 품질이 뛰어나서',
    '오래 이용해 봐서 믿음이 가서',
    '가성비와 만족도가 좋아서',
    '접근성이 좋고 이용하기 편해서',
    '브랜드 이미지가 깔끔하고 좋아서',
    '기본기가 탄탄하고 실용적이어서',
    '주변 지인들도 많이 이용해서',
    '꾸준히 좋은 품질을 유지해서',
    '타 브랜드보다 만족스러워서',
    '실제로 써보니 기대 이상이어서',
    '대중적으로 검증된 곳이라서',
    '선택의 폭이 넓고 편리해서',
    '늘 일정한 수준을 보여줘서',
    '믿고 선택할 수 있는 브랜드라서',
    '만족스러운 경험이 많아서',
    '호감이 가고 친숙해서'
  ],
  neutral: [
    '무난하고 대중적이어서',
    '보통 수준이라고 생각해서',
    '익숙하지만 무난해서',
    '주변에서 종종 들어봐서',
    '특별한 단점 없이 평범해서',
    '기본적인 수준은 갖추고 있어서',
    '대체로 무난한 편이라서',
    '익숙한 브랜드이긴 해서',
    '크게 불편한 점은 없어서',
    '평소 인식이 보통이라서',
    '알고는 있지만 평범해서',
    '평균적인 품질이라고 느껴서'
  ]
};

export const KBPI_DIAG_OPEN_TEXT_POOL = [
  '품질이 우수하고 신뢰가 가서',
  '인지도가 높고 평판이 좋아서',
  '성능이 안정적이고 만족스러워서',
  '주변에서 많이 사용하고 무난해서',
  '사후관리와 서비스가 믿음직해서',
  '내구성이 좋고 사용하기 편리해서',
  '브랜드 이미지가 깔끔하고 친숙해서',
  '기능이 실용적이고 만족도가 높아서',
  '오래된 브랜드라 안심하고 쓸 수 있어서',
  '전반적인 품질과 시스템이 탄탄해서'
];

export function resolveSmartChannelPool(categoryName = '', policy = {}, baseDict = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const customFoodChannels = String(policy.customFoodLivingChannels || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // 1) 전문/처방 중심 치료제 및 일반의약품 (온라인몰·편의점 절대 배제 -> 약국/병의원 전용)
  if (/비만치료제|탈모치료제/.test(cleanCat)) {
    return ['병원 진료 후 약국', '동네 약국', '의원 처방 후 약국'];
  }
  if (/변비약|소화제|소염진통제|해열진통제|진통제|위장약|감기약|점안액|인공눈물|상처\/흉터|흉터치료제|자양강장제|파스|연고|무좀약|구내염|치질약|알레르기약|멀미약|제산제|지사제/.test(cleanCat)) {
    return ['동네 약국', '집 근처 약국', '약국 직접 방문'];
  }

  // 2) 담배 · 궐련형/액상형 전자담배 (대한민국 법상 온라인 구매 불가 -> 오프라인 소매점 전용)
  if (/담배/.test(cleanCat)) {
    return ['편의점', 'GS25', 'CU', '세븐일레븐', '동네 마트'];
  }

  // 3) 생성형 AI · 모바일/웹 플랫폼 · 인터넷서점 · 통신 (오프라인 '병원'/'뷰티'/'중고차' 키워드보다 최우선 매칭)
  if (/생성형\s*AI|인터넷서점/.test(cleanCat)) {
    return ['공식 웹사이트', '모바일 공식 앱'];
  }
  if (/AI.*학습|사이버대학|온라인.*학원|인강|온라인교육|이러닝|화상영어|학습앱/.test(cleanCat)) {
    return ['공식 홈페이지', '모바일 공식 앱'];
  }
  if (/통합금융플랫폼|모바일뱅킹|가상자산거래소|간편결제|다이렉트.*보험/.test(cleanCat)) {
    return ['모바일 공식 앱', '공식 홈페이지'];
  }
  if (/플랫폼|오픈마켓|소셜커머스|온라인쇼핑|배달앱|숙박앱|부동산앱|모빌리티|카셰어링|OTT|포털|음원|웹툰/.test(cleanCat)) {
    return ['모바일 공식 앱', '공식 웹사이트'];
  }
  if (/초고속인터넷|IPTV|이동통신|알뜰폰/.test(cleanCat)) {
    return ['공식 홈페이지', '공식 대리점', '모바일 공식 앱', '고객센터 전화 신청'];
  }

  // 4) 병원 · 의료원 · 의원 · 치과 · 한방병원 · 건강검진 · 임플란트
  if (/병원|의료원|의원|치과|안과|한의원|검진|임플란트/.test(cleanCat)) {
    return ['병원 직접 방문', '전화 예약 후 방문', '공식 홈페이지 예약'];
  }

  // 5) 교육 · 학습지 · 학원 · 교재 · 문구
  if (/스마트학습|초등교육|유아교육|학습지/.test(cleanCat)) {
    return ['공식 홈페이지 수강·체험 신청', '전화 상담 신청'];
  }
  if (/학원|어학원|교육|대학/.test(cleanCat)) {
    return ['학원 직접 방문 상담', '공식 홈페이지 수강신청'];
  }
  if (/중고등교재|참고서|문제집|교재/.test(cleanCat)) {
    return ['대형 서점(교보문고·영풍문고)', '예스24', '교보문고 온라인', '알라딘'];
  }
  if (/종합문구|문구|필기구/.test(cleanCat)) {
    return ['교보문고 핫트랙스', '동네 문구점', '아트박스', '쿠팡', '네이버쇼핑'];
  }

  // 6) 금융 · 은행 · PB · 카드 · 보험 · 증권 · 금거래소
  if (/프라이빗뱅킹|은퇴설계|자산관리/.test(cleanCat)) {
    return ['영업점 직접 방문 상담', 'PB센터 방문 상담', '모바일 공식 앱'];
  }
  if (/금거래소/.test(cleanCat)) {
    return ['오프라인 직영 매장', '공식 온라인몰', '종로 매장 직접 방문'];
  }
  if (/은행|뱅킹|카드|보험|증권|페이|결제|금융|저축/.test(cleanCat)) {
    return ['모바일 공식 앱', '공식 홈페이지', '영업점 직접 방문'];
  }

  // 7) 항공 · 여행 · 호텔 · 테마/워터파크 · 고속버스 · 휴게소 · 렌터카
  if (/저비용항공|항공\(FSC\)|항공사|항공권/.test(cleanCat)) {
    return ['항공사 공식 홈페이지', '공식 모바일 앱', '온라인 여행사 앱'];
  }
  if (/여행사/.test(cleanCat)) {
    return ['공식 홈페이지', '공식 모바일 앱', '전화 상담 예약'];
  }
  if (/호텔|리조트|콘도/.test(cleanCat)) {
    return ['공식 홈페이지 예약', '숙박 예약 앱', '공식 모바일 앱'];
  }
  if (/테마파크|워터파크/.test(cleanCat)) {
    return ['공식 홈페이지 예매', '모바일 공식 앱 예매', '네이버 예약 후 방문'];
  }
  if (/고속버스/.test(cleanCat)) {
    return ['고속버스 티머니 앱', '코버스 공식 홈페이지', '터미널 현장 발권'];
  }
  if (/휴게소/.test(cleanCat)) {
    return ['고속도로 주행 중 직접 방문', '현장 매장 직접 방문'];
  }
  if (/렌터카/.test(cleanCat)) {
    return ['공식 홈페이지 예약', '공식 모바일 앱', '지점 직접 방문'];
  }

  // 8) 자동차 · 모터사이클 · 주유 · 충전 · 정비 · 배터리 · 자동차용품
  if (/전기차\s*충전/.test(cleanCat)) {
    return ['충전소 현장 방문 및 전용 앱', '아파트 단지 내 충전기'];
  }
  if (/주유소|휘발유|경유|LPG/.test(cleanCat)) {
    return ['주유소 직접 방문', '셀프주유소 직접 방문'];
  }
  if (/타이어|자동차정비|자동차배터리|엔진오일/.test(cleanCat)) {
    return ['공식 정비소 직접 방문', '타이어·정비 전문 매장 방문', '카센터 직접 방문'];
  }
  if (/요소수|내비게이션|블랙박스|자동차용품/.test(cleanCat)) {
    return ['온라인 쇼핑몰(쿠팡·네이버쇼핑)', '대형마트 자동차용품 코너', '장착 전문점 방문'];
  }
  if (/승용차|SUV|전기자동차|자동차|수입차|모터사이클/.test(cleanCat)) {
    return ['공식 대리점(전시장) 방문', '직영 지점 방문 상담', '브랜드 공식 홈페이지'];
  }

  // 9) 주거 · 아파트 · 인테리어 · 건자재 · 설비 · 보안 · 도시가스
  if (/아파트|오피스텔/.test(cleanCat)) {
    return ['공인중개사 사무소', '모델하우스(견본주택) 방문', '청약홈 분양 신청'];
  }
  if (/엘리베이터|스마트홈네트워크/.test(cleanCat)) {
    return ['아파트·건물 내 설치 시설 이용', '단지 내 기본 설치 시설 이용'];
  }
  if (/도시가스/.test(cleanCat)) {
    return ['거주지 도시가스 고객센터 신청', '공식 홈페이지 및 모바일 앱'];
  }
  if (/방범보안/.test(cleanCat)) {
    return ['공식 홈페이지 상담 신청', '고객센터 전화 상담 신청'];
  }
  if (/창호|벽지|리모델링|위생도기|바닥재|페인트|인테리어|부엌가구/.test(cleanCat)) {
    return ['인테리어 대리점 방문 상담', '브랜드 공식 전시장 방문', '인테리어 시공업체 계약'];
  }
  if (/디지털도어락|도어락/.test(cleanCat)) {
    return ['도어락 전문점 방문 설치', '네이버 브랜드스토어', '쿠팡 로켓설치'];
  }

  // 10) 가전 · 디지털 · 보일러 · 사무기기 · 가구 · 유모차 ('의류관리기/의류건조기/뷰티케어가전' 선행 매칭)
  if (/가전렌탈/.test(cleanCat)) {
    return ['브랜드 공식 홈페이지 신청', '공식 스토어 방문 상담', '고객센터 전화 렌탈 신청'];
  }
  if (/보일러|온수기/.test(cleanCat)) {
    return ['공식 대리점 방문·전화 시공', '브랜드 공식 홈페이지 상담 신청'];
  }
  if (/사무용복합기|복합기|프린터/.test(cleanCat)) {
    return ['공식 대리점 구매·임대', '공식 온라인몰', '오피스 용품 전문몰'];
  }
  if (/의류관리기|의류건조기|뷰티케어가전|스마트워치|스마트폰|노트북|태블릿|이어폰|빔프로젝터|프로젝터|TV|냉장고|세탁기|에어컨|환기청정기|공기청정기|제습기|청소기|정수기|비데|처리기|식기세척기|전기레인지|인덕션|가스레인지|복합오븐|오븐|커피머신|밥솥|안마의자|척추의료기기|의료기기|가전/.test(cleanCat)) {
    return ['브랜드 공식 스토어', '백화점 매장', '롯데하이마트', '공식 온라인몰', '네이버 브랜드스토어'];
  }
  if (/침대|매트리스|가구/.test(cleanCat)) {
    return ['브랜드 공식 대리점·전시장', '백화점 매장', '공식 온라인몰'];
  }
  if (/유모차|카시트/.test(cleanCat)) {
    return ['백화점 유아동 매장', '베이비페어 및 공식 스토어', '공식 온라인몰'];
  }

  // 11) NGO · 사회공헌 · 시니어케어 · 세탁/택배 생활서비스
  if (/구호개발단체|NGO|자선|사회공헌/.test(cleanCat)) {
    return ['공식 홈페이지 참여·후원', '온라인 캠페인 참여'];
  }
  if (/시니어케어|시니어리빙/.test(cleanCat)) {
    return ['공식 홈페이지 상담 신청', '센터 직접 방문 및 전화 상담'];
  }
  if (/의류관리서비스/.test(cleanCat)) {
    return ['동네 가맹점 직접 방문', '모바일 공식 앱 수거 신청'];
  }
  if (/택배|물류|포장이사|퀵서비스/.test(cleanCat)) {
    return ['편의점 택배 접수', '공식 모바일 앱 예약', '온라인 쇼핑몰 배송'];
  }

  // 12) 유통매장 · 홈쇼핑 · 전자전문점
  if (/TV홈쇼핑|홈쇼핑/.test(cleanCat)) {
    return ['TV 방송 시청 후 모바일 앱 주문', '홈쇼핑 공식 모바일 앱', 'ARS 전화 주문'];
  }
  if (/전자전문점/.test(cleanCat)) {
    return ['오프라인 매장 직접 방문', '공식 온라인몰'];
  }
  if (/백화점|대형할인점|면세점|편의점|슈퍼마켓|아울렛|복합쇼핑몰|창고형할인매장|드럭스토어|헬스앤뷰티/.test(cleanCat)) {
    return ['오프라인 매장 직접 방문', '브랜드 공식 모바일 앱'];
  }

  // 13) 영화관 · 외식 · 카페 · 베이커리
  if (/영화관/.test(cleanCat)) {
    return ['공식 모바일 앱 예매 후 방문', '현장 키오스크 발권'];
  }
  if (/베이커리|제과|제빵|커피전문점|카페|치킨|피자|패스트푸드|외식|레스토랑|아이스크림전문점/.test(cleanCat)) {
    return ['오프라인 매장 직접 방문', '배달의민족', '공식 모바일 앱 주문'];
  }

  // 14) 패션 · 의류 · 교복 · 주얼리 · 침구
  if (/학생교복|교복/.test(cleanCat)) {
    return ['브랜드 공식 대리점 직접 방문', '학교 주관 공동구매 매장 방문'];
  }
  if (/리빙SPA|홈패션|침구/.test(cleanCat)) {
    return ['백화점 매장', '브랜드 직영 오프라인 매장', '공식 온라인몰'];
  }
  if (/SPA|스포츠웨어|애슬레저|아웃도어|의류|웨어|패션|정장|캐주얼|구두|운동화|언더웨어|란제리|주얼리|가방/.test(cleanCat)) {
    return ['백화점 매장', '직영 오프라인 매장', '공식 온라인몰', '무신사'];
  }

  // 15) 뷰티 · 화장품 · 더마코스메틱 · 아토피케어 · 샴푸
  if (/화장품|코스메틱|아토피케어|뷰티|스킨케어|샴푸|바디|향수|염모제/.test(cleanCat)) {
    return ['올리브영 매장', '백화점 매장', '공식 온라인몰', '쿠팡'];
  }

  // 16) 주류 · 숙취해소 · 건강기능식품 · 펫푸드 · 주방용품
  if (/소주|맥주|전통주|막걸리|와인|위스키|주류/.test(cleanCat)) {
    return ['편의점', '대형마트(이마트·홈플러스·롯데마트)', '동네슈퍼'];
  }
  if (/숙취해소/.test(cleanCat)) {
    return ['편의점', '약국', '올리브영', '쿠팡'];
  }
  if (/건강기능식품|건강식품|비타민|영양제|유산균|보충제|에너지젤|환자영양식/.test(cleanCat)) {
    return ['약국', '올리브영', '쿠팡', '네이버 브랜드스토어', '대형마트'];
  }
  if (/펫푸드|반려견|반려묘/.test(cleanCat)) {
    return ['쿠팡', '네이버쇼핑', '반려동물용품 전문점(펫샵)', '이마트'];
  }
  if (/주방용품|밀폐용기|텀블러/.test(cleanCat)) {
    return ['이마트', '쿠팡', '백화점·아울렛 매장', '네이버 브랜드스토어', '홈플러스'];
  }
  if (/농산물|축산물|수산물|냉장\/냉동육|참치액|식용유|자연조미료|장류|파스타소스|세탁세제|섬유유연제|화장지/.test(cleanCat)) {
    return ['이마트', '홈플러스', '롯데마트', '하나로마트', '쿠팡', '컬리'];
  }

  // 17) 일반 식음료 · 간편식 · 생활소비재 기본 풀
  if (customFoodChannels.length > 0) {
    return customFoodChannels;
  }
  return baseDict.channelPools?.food_living || ['이마트', '쿠팡', '홈플러스', '롯데마트', '편의점', '동네슈퍼'];
}

function hashSeed(str = '') {
  const s = String(str || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function makeSeededRng(seedStr = '') {
  let state = hashSeed(seedStr) || 123456789;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeKbpiBrandKey(raw = '') {
  return String(raw || '')
    .replace(/브랜드$/g, '')
    .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
    .toLowerCase()
    .trim();
}

export function extractKbpiBrandRoot(raw = '') {
  const clean = String(raw || '').replace(/^\s+|\s+$/g, '');
  if (!clean) return '';
  const withoutParens = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() || clean;
  const lower = withoutParens.toLowerCase();

  const canonicalRoots = [
    [/^(서울우유)/, '서울우유'],
    [/^(매일우유|매일\b|상하목장)/, '매일'],
    [/^(남양유업|남양)/, '남양'],
    [/^(건국우유|건국)/, '건국'],
    [/^(파스퇴르|롯데웰푸드|롯데칠성|롯데)/, '롯데'],
    [/^(연세우유|연세)/, '연세'],
    [/^(빙그레)/, '빙그레'],
    [/^(푸르밀)/, '푸르밀'],
    [/^(삼성전자|삼성)/, '삼성'],
    [/^(lg전자|lg유플러스|lg생활건강|lg|엘지|u\+)/i, 'lg'],
    [/^(sk텔레콤|sk매직|sk렌터카|sk브로드밴드|sk엔크린|sk|에스케이)/i, 'sk'],
    [/^(kt스카이라이프|kt|케이티|지니tv)/i, 'kt'],
    [/^(cj제일제당|cj대한통운|cj|씨제이)/i, 'cj'],
    [/^(현대자동차|현대모비스|현대백화점|현대카드|현대해상|현대)/, '현대'],
    [/^(신세계백화점|신세계|이마트)/, '신세계'],
    [/^(초록우산)/, '초록우산'],
    [/^(월드비전)/, '월드비전'],
    [/^(굿네이버스)/, '굿네이버스'],
    [/^(유니세프)/, '유니세프'],
    [/^(세이브더칠드런)/, '세이브더칠드런'],
    [/^(대한적십자)/, '대한적십자사'],
    [/^(사랑의열매|사회복지공동모금회)/, '사랑의열매'],
    [/^(국경없는의사회)/, '국경없는의사회']
  ];
  for (const [rx, root] of canonicalRoots) {
    if (rx.test(lower)) return root;
  }

  const firstToken = withoutParens.split(/\s+/)[0] || withoutParens;
  const normToken = normalizeKbpiBrandKey(firstToken);
  return normToken.length >= 2 ? normToken : normalizeKbpiBrandKey(withoutParens);
}

/**
 * [중복 브랜드 원천 차단 선택기]
 * 1순위: 정규화 문자열 중복 X + 모브랜드(Root) 중복 X + 동일 응답자의 이전 품목에서 사용한 브랜드(priorUsedNorms) X
 * 2순위: 정규화 문자열 중복 X + 모브랜드(Root) 중복 X
 * 3순위: 정규화 문자열 중복 X (모브랜드 수가 적은 소규모 산업군 대비, 동일 문자열 중복은 100% 금지)
 */
export function selectDistinctKbpiBrands(
  candidates = [],
  maxCount = 4,
  priorUsedNorms = new Set(),
  priorUsedRoots = new Set()
) {
  const validItems = [];
  const seenInputNorm = new Set();
  for (const raw of (Array.isArray(candidates) ? candidates : [])) {
    const label = String(raw || '').trim();
    if (!label) continue;
    if (/^(없음|모름|선택|해당\s*없음|잘\s*모르|생각나지|더\s*이상\s*없음)$/i.test(label) || /(^|\s)기타(\s|$)/.test(label)) {
      continue;
    }
    const norm = normalizeKbpiBrandKey(label);
    if (!norm || seenInputNorm.has(norm)) continue;
    seenInputNorm.add(norm);
    validItems.push({
      label,
      norm,
      root: extractKbpiBrandRoot(label)
    });
  }

  const chosen = [];
  const chosenNorms = new Set();
  const chosenRoots = new Set();

  // Pass 1: 모브랜드 고유 + 응답자 내 타 슬롯 미사용 브랜드 최우선
  for (const item of validItems) {
    if (chosen.length >= maxCount) break;
    if (chosenNorms.has(item.norm) || chosenRoots.has(item.root)) continue;
    if (priorUsedNorms?.has(item.norm) || priorUsedRoots?.has(item.root)) continue;
    chosen.push(item.label);
    chosenNorms.add(item.norm);
    if (item.root) chosenRoots.add(item.root);
  }

  // Pass 2: 모브랜드 고유 (현재 문항 내 모브랜드 중복 100% 차단)
  for (const item of validItems) {
    if (chosen.length >= maxCount) break;
    if (chosenNorms.has(item.norm) || chosenRoots.has(item.root)) continue;
    chosen.push(item.label);
    chosenNorms.add(item.norm);
    if (item.root) chosenRoots.add(item.root);
  }

  // Pass 3: 산업군 내 기업 수가 부족한 경우에도 동일 브랜드명 중복은 100% 차단
  for (const item of validItems) {
    if (chosen.length >= maxCount) break;
    if (chosenNorms.has(item.norm)) continue;
    chosen.push(item.label);
    chosenNorms.add(item.norm);
  }

  return chosen;
}

function loadBrandDictionary() {
  let baseDict = { defaultAdjectives: { positive: [], neutral: [] }, channelPools: {}, categories: {} };
  try {
    if (fs.existsSync(brandDictPath)) {
      baseDict = JSON.parse(fs.readFileSync(brandDictPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[K-BPI Dict 로드 경고]', err.message);
  }

  let learned = {};
  try {
    if (fs.existsSync(learnedDictPath)) {
      learned = JSON.parse(fs.readFileSync(learnedDictPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[K-BPI Learned Dict 로드 경고]', err.message);
  }

  return { baseDict, learned };
}

function saveLearnedCategoryBrands(categoryName, brands = []) {
  const cleanCat = String(categoryName || '').trim();
  const seenNorm = new Set();
  const cleanBrands = [];
  for (const raw of (Array.isArray(brands) ? brands : [])) {
    const b = String(raw || '').trim();
    if (!b || b === '없음' || b === '모름' || b.includes('기타')) continue;
    const nk = normalizeKbpiBrandKey(b);
    if (!nk || seenNorm.has(nk)) continue;
    seenNorm.add(nk);
    cleanBrands.push(b);
  }
  if (!cleanCat || cleanBrands.length < 3) return;

  try {
    let learned = {};
    if (fs.existsSync(learnedDictPath)) {
      learned = JSON.parse(fs.readFileSync(learnedDictPath, 'utf8'));
    }
    learned[cleanCat] = {
      brands: cleanBrands,
      updatedAt: new Date().toISOString()
    };
    writeJsonAtomicSync(learnedDictPath, learned);
  } catch (err) {
    console.warn('[K-BPI Learned Dict 저장 경고]', err.message);
  }
}

export function resolveDomainAdjectives(categoryName = '') {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  if (/약|진통제|치료제|점안액|인공눈물|장장제|검진|병원|한의원|임플란트/.test(cleanCat)) {
    return ['믿음직하다', '신뢰가는', '편안함', '안심되는', '꼼꼼하다', '체계적임', '친숙함'];
  }
  if (/생성형\s*AI|플랫폼|앱|오픈마켓|뱅킹|거래소|페이|결제|인터넷|모빌리티|카셰어링|OTT/.test(cleanCat)) {
    return ['빠르다', '편리함', '간편하다', '직관적인', '실용적임', '유용하다', '친숙함', '스마트한'];
  }
  if (/은행|카드|보험|증권|금융|은퇴설계/.test(cleanCat)) {
    return ['믿음직하다', '든든함', '안전한', '신뢰가는', '체계적임', '편리하다', '탄탄함'];
  }
  if (/테마파크|워터파크|영화관|리조트|콘도|여행/.test(cleanCat)) {
    return ['즐겁다', '신나는', '쾌적함', '활기찬', '편안하다', '기분좋은', '다양함'];
  }
  if (/호텔|백화점|면세점|프리미엄/.test(cleanCat)) {
    return ['고급스럽다', '세련됨', '쾌적한', '깔끔함', '품격있는', '편안함', '만족스러운'];
  }
  if (/학원|교육|학습|대학|교재/.test(cleanCat)) {
    return ['체계적인', '유익하다', '꼼꼼함', '전문적인', '믿음직함', '알차다', '탄탄한'];
  }
  if (/의류|웨어|패션|정장|캐주얼|구두|운동화|언더웨어|주얼리|교복|침구|SPA/.test(cleanCat)) {
    return ['세련된', '편안하다', '깔끔함', '실용적인', '트렌디함', '무난하다', '예쁘다'];
  }
  if (/화장품|코스메틱|뷰티|샴푸|아토피|바디/.test(cleanCat)) {
    return ['순하다', '촉촉함', '깔끔하다', '산뜻함', '부드러운', '향기롭다', '트렌디한'];
  }
  if (/냉장고|세탁기|건조기|관리기|에어컨|청소기|제습기|정수기|비데|식기세척기|레인지|인덕션|오븐|커피머신|밥솥|안마의자|보일러|도어락|복합기|프로젝터|이어폰|워치|스마트폰|노트북|TV|가전|창호|벽지|바닥재|위생도기|페인트|가구|침대|유모차/.test(cleanCat)) {
    return ['튼튼하다', '편리함', '세련된', '실용적임', '깔끔하다', '성능좋은', '믿음직함', '안정적인'];
  }
  if (/라면|우유|요구르트|요거트|두유|주스|음료|생수|과자|아이스크림|만두|김치|김|소스|참치|국물|즉석밥|식용유|조미료|장류|농산물|축산물|수산물|육|간편식|베이커리|커피|치킨|피자|패스트푸드|레스토랑/.test(cleanCat)) {
    return ['맛있다', '신선함', '깔끔하다', '친숙함', '고소한', '든든함', '익숙하다', '품질좋은'];
  }
  return [];
}

function isSafePartialDictMatch(cleanCat, dictKey) {
  if (!cleanCat || !dictKey) return false;
  // 역방향 부분일치('김치냉장고'.includes('김치')) 금지 — 정방향 cleanCat.includes(dictKey)만 허용하되 파생 이종 업종 제외
  if (!cleanCat.includes(dictKey)) return false;
  if (dictKey === '자동차' && /보험|배터리|정비|용품|충전|중고차|렌터카/.test(cleanCat)) return false;
  if (dictKey === '라면' && /비빔|볶음/.test(cleanCat)) return false;
  if (dictKey === '우유' && /가공|두유|발효/.test(cleanCat)) return false;
  if (dictKey === '세제' && /주방/.test(cleanCat)) return false;
  return true;
}

export function pickBrandMatchedAdjective({
  brandName = '',
  categoryAdjectives = [],
  brandAdjectivesMap = {},
  usedInMatrix = new Set(),
  priorUsed = new Set(),
  fallback = '친숙하다'
} = {}) {
  const bTrim = String(brandName || '').trim();
  const bNorm = normalizeKbpiBrandKey(bTrim);
  let matchedBrandWords = [];

  if (bTrim && brandAdjectivesMap && typeof brandAdjectivesMap === 'object') {
    if (Array.isArray(brandAdjectivesMap[bTrim])) {
      matchedBrandWords = brandAdjectivesMap[bTrim];
    } else if (bNorm) {
      const entries = Object.entries(brandAdjectivesMap);
      const exactNorm = entries.find(([k]) => normalizeKbpiBrandKey(k) === bNorm);
      if (exactNorm && Array.isArray(exactNorm[1])) {
        matchedBrandWords = exactNorm[1];
      } else {
        const partial = entries
          .filter(([k]) => {
            const kn = normalizeKbpiBrandKey(k);
            return kn.length >= 2 && (bNorm.includes(kn) || kn.includes(bNorm));
          })
          .sort((a, b) => b[0].length - a[0].length)[0];
        if (partial && Array.isArray(partial[1])) {
          matchedBrandWords = partial[1];
        }
      }
    }
  }

  const candidates = Array.from(new Set([
    ...matchedBrandWords,
    ...(Array.isArray(categoryAdjectives) ? categoryAdjectives : []),
    fallback
  ].map(s => String(s || '').trim()).filter(Boolean)));

  const freshPick = candidates.find(w => !usedInMatrix?.has(w) && !priorUsed?.has(w));
  if (freshPick) return freshPick;
  const matrixDistinctPick = candidates.find(w => !usedInMatrix?.has(w));
  if (matrixDistinctPick) return matrixDistinctPick;
  return candidates[0] || fallback;
}

export async function resolveCategoryMeta(categoryName, policy = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim() || '일반소비재';
  const { baseDict, learned } = loadBrandDictionary();

  // 1) 정확히 일치하거나 안전한 정방향 키워드 부분 일치 사전 항목 탐색 (역방향 '김치'->'김치냉장고' 오매칭 원천 차단)
  let matchedEntry = baseDict.categories?.[cleanCat] || null;
  if (!matchedEntry) {
    const keys = Object.keys(baseDict.categories || {}).sort((a, b) => b.length - a.length);
    const partialKey = keys.find(k => isSafePartialDictMatch(cleanCat, k));
    if (partialKey) matchedEntry = baseDict.categories[partialKey];
  }

  let brands = [];
  if (learned[cleanCat]?.brands?.length >= 3 || matchedEntry?.brands?.length >= 3) {
    brands = selectDistinctKbpiBrands(
      [...(learned[cleanCat]?.brands || []), ...(matchedEntry?.brands || [])],
      24
    );
  }

  // 2) 사전에 없는 미등록 산업군 등장 시 Gemini AI 실시간 추론 폴백
  if (brands.length < 3 && process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `한국능률협회컨설팅 K-BPI 소비자 브랜드 조사에서 "${cleanCat}" 산업군에 해당하는 대한민국 실제 유명 대표 브랜드명 6개(중복 없는 서로 다른 기업/단체 브랜드)와, 소비자가 떠올리는 짧은 이미지 표현(형용사/명사 혼합, 예: 깨끗하다, 편리함, 믿음직한) 12개, 실제 주 구매/이용 경로 4개를 JSON으로만 반환해줘. 형식: {"brands":["..."],"adjectives":["..."],"channels":["..."]}`;
      const resp = await model.generateContent(prompt);
      const txt = resp.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed.brands) && parsed.brands.length >= 3) {
        brands = selectDistinctKbpiBrands(parsed.brands, 12);
        saveLearnedCategoryBrands(cleanCat, brands);
        return {
          categoryName: cleanCat,
          brands,
          adjectives: Array.isArray(parsed.adjectives) && parsed.adjectives.length >= 4
            ? Array.from(new Set(parsed.adjectives))
            : Array.from(new Set([...resolveDomainAdjectives(cleanCat), ...(baseDict.defaultAdjectives?.positive || [])])),
          brandAdjectives: baseDict.brandAdjectives || {},
          channels: resolveSmartChannelPool(cleanCat, policy, baseDict)
        };
      }
    } catch (aiErr) {
      console.warn(`[K-BPI Gemini 브랜드 추론 폴백 경고: ${cleanCat}]`, aiErr.message);
    }
  }

  if (brands.length < 3) {
    if (/구호개발단체|NGO|자선|후원/.test(cleanCat)) {
      brands = ['월드비전', '굿네이버스', '초록우산 어린이재단', '유니세프', '세이브더칠드런', '대한적십자사', '사랑의열매'];
    } else if (/병원|의료원|검진/.test(cleanCat)) {
      brands = ['서울아산병원', '세브란스병원', '삼성서울병원', '서울대학교병원', '가천대길병원', '인하대병원', '분당서울대학교병원', '아주대학교병원'];
    } else if (/대학|학교/.test(cleanCat)) {
      brands = ['서울대학교', '연세대학교', '고려대학교', '성균관대학교', '한양대학교', '인하대학교'];
    } else if (/백화점|아울렛|면세점/.test(cleanCat)) {
      brands = ['신세계백화점', '롯데백화점', '현대백화점', '갤러리아백화점', 'AK플라자'];
    } else if (/호텔|리조트|콘도/.test(cleanCat)) {
      brands = ['신라호텔', '롯데호텔', '조선호텔', '워커힐', '한화리조트', '소노호텔앤리조트'];
    } else if (/여행사/.test(cleanCat)) {
      brands = ['하나투어', '모두투어', '노랑풍선', '인터파크투어', '참좋은여행'];
    } else if (/교육|학습지|학원|인강/.test(cleanCat)) {
      brands = ['구몬학습', '눈높이', '웅진씽크빅', '메가스터디', '해커스', 'YBM'];
    } else if (/아파트|건설/.test(cleanCat)) {
      brands = ['래미안', '자이', '힐스테이트', '롯데캐슬', '푸르지오', '더샵'];
    } else {
      brands = ['삼성', 'LG', '롯데', 'CJ', '현대', '신세계'];
    }
  }

  const channels = resolveSmartChannelPool(cleanCat, policy, baseDict);

  // 카테고리 전용 이미지어가 충분히(8개 이상) 있으면 전용 풀을 우선 유지하고, 부족하면 도메인별/기본 이미지어 병합
  const catAdjs = Array.isArray(matchedEntry?.adjectives) ? matchedEntry.adjectives : [];
  const adjectives = catAdjs.length >= 8
    ? Array.from(new Set(catAdjs))
    : Array.from(new Set([...catAdjs, ...resolveDomainAdjectives(cleanCat), ...(baseDict.defaultAdjectives?.positive || [])]));

  return {
    categoryName: cleanCat,
    brands,
    adjectives,
    brandAdjectives: baseDict.brandAdjectives || {},
    channels
  };
}

/**
 * 문항 3(1~9번) 점수 생성기:
 * - 절대 동일 점수 일렬(444444444 등) 금지!
 * - 3, 4, 5점 범위 내에서 자연스러운 분산 보장
 * - 11번 태도(attitudeChoice)도 주 이용 열(col 0)과 보조 열(col 1~2) 간 획일화 방지
 */
export function generateKbpiMatrixScores(rngOrOpts = Math.random, hasPurchaseExpArg = true, colIdxArg = 0) {
  const isObj = rngOrOpts && typeof rngOrOpts === 'object';
  const rng = typeof rngOrOpts === 'function' ? rngOrOpts : (typeof rngOrOpts?.rng === 'function' ? rngOrOpts.rng : Math.random);
  const hasPurchaseExp = isObj ? (rngOrOpts.hasPurchaseExp !== false) : Boolean(hasPurchaseExpArg);
  const colIdx = isObj ? Number(rngOrOpts.colIdx || 0) : Number(colIdxArg || 0);
  const pool = hasPurchaseExp
    ? (colIdx === 0 ? [3, 4, 4, 5, 5, 5] : [3, 3, 4, 4, 4, 5])
    : [3, 3, 3, 4, 4, 5];
  let scores = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    scores = [];
    for (let i = 0; i < 9; i++) {
      scores.push(pool[Math.floor(rng() * pool.length)]);
    }
    if (new Set(scores).size >= 2) break;
  }
  if (new Set(scores).size < 2) {
    scores[0] = 4;
    scores[1] = 3;
    scores[2] = 5;
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const overallSatisfaction = Math.max(3, Math.min(5, Math.round(avg)));

  // 11번 평소 태도 보기 결정 (핵심 절대 규칙 + 열 간 동일응답 분산):
  // - 구입경험이 '없음(아니오)'이면 4·5번 체크 절대 불가 -> 반드시 1, 2, 3번 중(2 또는 3번 우선) 선택!
  // - 구입경험이 '있음(예)'일 때 1번열(주 이용)은 4·5번 균형 배분, 2~3번열(보조 경험)은 3·4·5번 자연 분산!
  let attitudeChoice;
  if (!hasPurchaseExp) {
    attitudeChoice = rng() < 0.45 ? 2 : 3;
  } else if (colIdx === 0) {
    attitudeChoice = overallSatisfaction >= 4 ? (rng() < 0.48 ? 5 : 4) : 3;
  } else if (overallSatisfaction === 5) {
    attitudeChoice = rng() < 0.50 ? 5 : 4;
  } else if (overallSatisfaction === 4) {
    attitudeChoice = rng() < 0.45 ? 3 : 4;
  } else {
    attitudeChoice = rng() < 0.25 ? 2 : 3;
  }

  return {
    itemScores: scores,
    overallSatisfaction,
    attitudeChoice
  };
}

/**
 * 해당 산업군에 대한 구입경험('있음' | '없음') 결정
 * 우선순위: 1) 시트 브랜드명 일치 설정 -> 2) 시트 슬롯 순번 설정 -> 3) 연령·성별 비적합 품목 안전 보정 -> 4) 기본 90:10 확률
 */
export function decideCategoryPurchaseExp({
  categoryName,
  industryKey = '',
  categorySlotIdx = 0,
  categoryConfigs = [],
  ageGroup = '',
  age = 30,
  gender = '',
  respondentAge,
  policy = {},
  rng = Math.random
}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const cleanKey = String(industryKey || '').trim();
  const effAge = respondentAge !== undefined ? Number(respondentAge) : Number(age);
  const cleanGender = String(gender || '').trim();

  // 1-A) 고유 산업군 코드(industryKey) 정확 일치 설정 최우선 적용 (35 vs 36 등 동일명 코드 분리 보장)
  if (cleanKey) {
    const keyCfg = categoryConfigs.find(c => String(c?.industryKey || '').trim() === cleanKey);
    if (keyCfg && (keyCfg.purchaseExp === '없음' || keyCfg.purchaseExp === '있음')) {
      return keyCfg.purchaseExp;
    }
  }

  // 1-B) 해당 순번 슬롯의 카테고리명이 정확히 일치하는 경우 적용
  const slotDirectCfg = categoryConfigs.find(c => Number(c?.slot) === Number(categorySlotIdx) + 1) || categoryConfigs[categorySlotIdx];
  if (slotDirectCfg) {
    const slotCn = String(slotDirectCfg.categoryName || '').replace(/브랜드$/g, '').trim();
    if (slotCn && slotCn === cleanCat && (slotDirectCfg.purchaseExp === '없음' || slotDirectCfg.purchaseExp === '있음')) {
      return slotDirectCfg.purchaseExp;
    }
  }

  // 1-C) 카테고리명 완전 일치('우유' vs '가공우유' 부분 오매칭 방지) -> 없을 때만 부분 일치 폴백
  const exactNamedCfg = categoryConfigs.find(c => {
    const cn = String(c?.categoryName || '').replace(/브랜드$/g, '').trim();
    return cn && cn === cleanCat;
  });
  const namedCfg = exactNamedCfg || categoryConfigs.find(c => {
    const cn = String(c?.categoryName || '').replace(/브랜드$/g, '').trim();
    return cn && (cleanCat.includes(cn) || cn.includes(cleanCat));
  });
  if (namedCfg && (namedCfg.purchaseExp === '없음' || namedCfg.purchaseExp === '있음')) {
    return namedCfg.purchaseExp;
  }

  // 2) 해당 순번 슬롯(0-based index 또는 slot = categorySlotIdx + 1)에 '없음'/'있음'이 사전 기재된 경우
  if (slotDirectCfg && !slotDirectCfg.categoryName && (slotDirectCfg.purchaseExp === '없음' || slotDirectCfg.purchaseExp === '있음')) {
    return slotDirectCfg.purchaseExp;
  }

  // 3) 10대(미성년) 응답자 및 성별 전용 품목 자동 '없음' 안전 보정
  const isTeen = String(ageGroup || '').includes('10대') || (effAge > 0 && effAge <= 19);
  if (isTeen && policy.teenAutoNoneUnfitCategories !== false) {
    if (TEEN_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
      return '없음';
    }
  }
  if (cleanGender.startsWith('남') && MALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('여') && FEMALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }

  // 4) 가이드 기본 비율 (구입 90% : 없음 10%)
  const yesRate = Number(policy.purchaseYesRate ?? 90);
  return (rng() * 100 < yesRate) ? '있음' : '없음';
}

/**
 * 스캔된 품목의 초기 권장 구입경험('있음' | '없음') 산출
 * - 연령(10대)·성별 부적합 품목은 자동으로 '없음' 추천, 일반 품목은 '있음' 기본 세팅 (가이드/시트에서 1클릭 전환 가능)
 */
export function recommendDefaultPurchaseExp({
  categoryName = '',
  ageGroup = '',
  age = 30,
  gender = '',
  teenAutoNone = true
} = {}) {
  const cleanCat = String(categoryName || '').replace(/브랜드$/g, '').trim();
  const effAge = Number(age || 30);
  const cleanGender = String(gender || '').trim();
  const isTeen = String(ageGroup || '').includes('10대') || (effAge > 0 && effAge <= 19);
  if (isTeen && teenAutoNone !== false && TEEN_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('남') && MALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  if (cleanGender.startsWith('여') && FEMALE_UNFIT_CATEGORY_KEYWORDS.some(kw => cleanCat.includes(kw))) {
    return '없음';
  }
  return '있음';
}

/**
 * [요구사항 3.1] DQ1 정보 습득 경로(2개 응답): '생성형 AI', '신문/잡지/카탈로그', '기타' 제외 후 랜덤 2개 선택
 */
export function pickKbpiDq1Keys(options = [], rng = Math.random) {
  const isExcludedDq1 = (opt) => {
    const ak = String(opt?.akey || opt?.K || '').trim();
    const lb = String(opt?.label || opt?.V || '').trim();
    if (ak === '6' || ak === '9' || ak === '10') return true;
    if (/생성형\s*AI|\bAI\b|신문|잡지|카탈로그|(^|\s)기타(\s|$)|없음|모름/i.test(lb)) return true;
    return false;
  };
  const valid = (Array.isArray(options) ? options : []).filter(o => !isExcludedDq1(o));
  const shuffled = shuffleWithRng(valid, rng);
  return shuffled.slice(0, 2);
}

/**
 * [요구사항 3.2] 구글 스프레드시트의 (연령·학력·직업·가구소득·결혼여부·가족수·자녀수) 데이터를
 * Survey 230의 ZQ1 ~ ZQ5_2 공식 보기 코드(akey)로 1:1 정밀 매핑
 */
export function resolveKbpiZqAnswers(rawSlot = {}) {
  const enriched = enrichKbpiRespondentDemographics(rawSlot);
  const age = Number(rawSlot.age || rawSlot.ceoAge || 30);

  // ZQ1: 연령대 (만 나이 십의 자리와 100% 일치 필수 — CONFIRM 검증 통과 보장)
  const zq1Key = String(Math.min(5, Math.max(1, Math.floor(age / 10))));

  // ZQ2: 학력 (1:중졸이하, 2:고졸이하, 3:중/고등학생, 4:대학생, 5:대졸, 6:대학원 재학/졸업)
  const edu = String(rawSlot.education || enriched.education || '').trim();
  let zq2Key = '5';
  if (/대학원|석사|박사/.test(edu)) zq2Key = '6';
  else if (/대학생|대학\s*재학/.test(edu)) zq2Key = '4';
  else if (/중\/고등|중고등|고등학생|중학생|고교\s*재학/.test(edu)) zq2Key = '3';
  else if (/중졸/.test(edu)) zq2Key = '1';
  else if (/고졸/.test(edu)) zq2Key = '2';
  else if (/대졸|대학\s*졸업|전문대/.test(edu)) zq2Key = '5';
  else if (age <= 19) zq2Key = '3';

  // ZQ3: 직업 (1:농림어업, 2:자영업, 3:사무직, 4:판매/서비스직, 5:관리직, 6:생산직, 7:전문직, 8:기술직, 9:중/고등학생, 10:대학생, 11:주부, 12:무직, 13:기타)
  const job = String(rawSlot.job || enriched.job || '').trim();
  let zq3Key = '3';
  let zq3EtcText = '';
  if (/농업|어업|임업/.test(job)) zq3Key = '1';
  else if (/자영업|사업/.test(job)) zq3Key = '2';
  else if (/사무/.test(job)) zq3Key = '3';
  else if (/판매|서비스/.test(job)) zq3Key = '4';
  else if (/관리|임원/.test(job)) zq3Key = '5';
  else if (/생산|노무|기능/.test(job)) zq3Key = '6';
  else if (/전문|의사|약사|교사|강사/.test(job)) zq3Key = '7';
  else if (/기술|엔지니어|개발/.test(job)) zq3Key = '8';
  else if (/중\/고등|중고등|고등학생|중학생/.test(job)) zq3Key = '9';
  else if (/대학생/.test(job)) zq3Key = '10';
  else if (/주부/.test(job)) zq3Key = '11';
  else if (/무직|취준|구직/.test(job)) zq3Key = '12';
  else if (job) {
    zq3Key = '13';
    zq3EtcText = job.replace(/^기타\s*[:()-]?\s*/, '').trim() || '프리랜서';
  }

  // ZQ4: 월평균 가구소득 (1:200만원 미만, 2:200~399만원, 3:400~599만원, 4:600~799만원, 5:800만원 이상)
  const inc = String(rawSlot.householdIncome || enriched.householdIncome || '').trim();
  let zq4Key = '3';
  if (/200\s*만?\s*원?\s*미만|^1\b|^1\d\d/.test(inc)) zq4Key = '1';
  else if (/200\s*[~-]\s*399|200|300/.test(inc)) zq4Key = '2';
  else if (/400\s*[~-]\s*599|400|500/.test(inc)) zq4Key = '3';
  else if (/600\s*[~-]\s*799|600|700/.test(inc)) zq4Key = '4';
  else if (/800|900|1,?000|이상/.test(inc)) zq4Key = '5';

  // ZQ5: 결혼 여부 (1:미혼, 2:기혼, 3:기타(이혼/사별/별거), 4:비혼)
  const mar = String(rawSlot.maritalStatus || enriched.maritalStatus || '').trim();
  let zq5Key = age <= 29 ? '1' : '2';
  if (/비혼/.test(mar)) zq5Key = '4';
  else if (/기타|이혼|사별|별거/.test(mar)) zq5Key = '3';
  else if (/기혼/.test(mar)) zq5Key = '2';
  else if (/미혼/.test(mar)) zq5Key = '1';

  // ZQ5_1: 가족 수 (1:1명(본인), 2:2명, 3:3명, 4:4명, 5:5명 이상)
  const fam = String(rawSlot.familySize || enriched.familySize || '4명').trim();
  const famMatch = fam.match(/(\d+)/);
  const famNum = famMatch ? Number(famMatch[1]) : 4;
  const zq5_1Key = String(Math.min(5, Math.max(1, famNum)));

  // ZQ5_2: 자녀 수 (1:1명, 2:2명, 3:3명, 4:4명 이상, 5:해당사항 없음)
  // 주의: Survey 230 HIDE 규칙상 [ZQ5_1=1](가족수 1명)일 때 1~4번 보기가 숨겨지고 5번(해당사항 없음)만 활성화됨!
  const ch = String(rawSlot.childrenCount || enriched.childrenCount || '').trim();
  let zq5_2Key = '5';
  if (zq5_1Key === '1') {
    zq5_2Key = '5';
  } else if (/해당\s*사항\s*없음|해당없음|없음|^0(?:\.0+)?$/.test(ch) || !ch) {
    zq5_2Key = '5';
  } else {
    const chMatch = ch.match(/(\d+)/);
    const chNum = chMatch ? Number(chMatch[1]) : 0;
    zq5_2Key = chNum <= 0 ? '5' : String(Math.min(4, chNum));
  }

  return {
    zq1Key,
    zq2Key,
    zq3Key,
    zq3EtcText,
    zq4Key,
    zq5Key,
    zq5_1Key,
    zq5_2Key,
    labels: {
      education: edu,
      job,
      householdIncome: inc,
      maritalStatus: mar,
      familySize: fam,
      childrenCount: zq5_1Key === '1' ? '해당사항 없음(1인가구 보정)' : (ch || '해당사항 없음')
    }
  };
}

/**
 * 슬롯 목록 화면에서 대상 응답자(고유번호 uid / 최종id finalId / 지역 / 성별 / 연령대) 행을 찾아 [시작] 클릭
 */
async function findAndStartRespondentSlot({
  context,
  listPage,
  slotData,
  emitLog
}) {
  const uid = String(slotData.uid || '').trim();
  const finalId = String(slotData.finalId || '').trim();
  const region = String(slotData.region || '').trim();
  const gender = String(slotData.gender || slotData.ceoGender || '').trim();
  const ageGroup = String(slotData.ageGroup || '').trim();

  emitLog(`[슬롯 탐색] #${slotData.seq || slotData.index} ${slotData.name} (${region}/${gender}/${ageGroup}, 최종id=${finalId}, 고유번호=${uid}) 탐색... (URL: ${listPage.url()})`);

  // GetData(/Cati/Capi/) 페이지당 표시 개수(ROW_PER_PAGE)가 있으면 100개 보기로 확장
  const expandedRows = await listPage.evaluate(() => {
    const sel = document.querySelector('select.ROW_PER_PAGE');
    if (sel && sel.value !== '100') {
      sel.value = '100';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof $ !== 'undefined') $(sel).val('100').trigger('change');
      return true;
    }
    return false;
  }).catch(() => false);
  if (expandedRows) {
    await listPage.waitForTimeout(1800);
  }

  const scanCurrentDomForSlot = async () => {
    return listPage.evaluate(({ targetUid, targetFinalId, targetReg, targetGen, targetAg }) => {
      document.querySelectorAll('[data-kbpi-target-start]').forEach(el => el.removeAttribute('data-kbpi-target-start'));

      const rawRows = Array.from(
        document.querySelectorAll('table.list-data tbody tr, table tbody tr, [role="row"], .ag-row, .tui-grid-row')
      ).filter(r => {
        if (r.closest('thead')) return false;
        const t = (r.innerText || '').trim();
        if (!t) return false;
        if (/최종\s*id/i.test(t) && /조사지역/.test(t)) return false;
        return true;
      });

      // 주의: '진행중'(상태 열 텍스트)이나 '참여'(헤더/필터 텍스트)가 매칭되지 않도록 실제 버튼 태그 + 명확한 시작 동사만 허용!
      const btnTextRegex = /^(시작|조사\s*시작|이어하기|재시작|계속|계속하기|설문\s*참여|참여하기)$/;
      const excludeBtnRegex = /삭제|취소|중단|제외|초기화/;

      for (const rowEl of rawRows) {
        let rowObj = {};
        const rawObjAttr = rowEl.getAttribute('data-object');
        if (rawObjAttr) {
          try { rowObj = JSON.parse(rawObjAttr); } catch (e) { rowObj = {}; }
        }
        const rowAttrUid = String(
          rowEl.getAttribute('data-uid') ||
          rowEl.getAttribute('data-id') ||
          rowObj._id ||
          rowObj.UID ||
          rowObj['고유번호'] ||
          ''
        ).trim();
        const rowAttrFinalId = String(rowObj['최종id'] ?? rowObj['최종ID'] ?? '').trim();

        const cellEls = Array.from(
          rowEl.querySelectorAll('td, [role="gridcell"], [role="cell"], .ag-cell, .tui-grid-cell')
        );
        const cells = cellEls.length > 0
          ? cellEls.map(c => (c.innerText || '').trim())
          : (rowEl.innerText || '').split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);
        const fullText = cells.join(' | ');

        const hasUid = Boolean(
          targetUid && (rowAttrUid === targetUid || fullText.includes(targetUid))
        );
        const hasExactFinalId = Boolean(
          targetFinalId && (rowAttrFinalId === targetFinalId || cells.some(c => c === targetFinalId))
        );
        const demoMatches =
          (!targetReg || fullText.includes(targetReg) || String(rowObj['조사지역'] || '').includes(targetReg)) &&
          (!targetGen || cells.includes(targetGen) || String(rowObj['성별'] || '') === targetGen) &&
          (!targetAg || fullText.includes(targetAg) || String(rowObj['연령'] || '').includes(targetAg));

        if (!hasUid && !(hasExactFinalId && demoMatches)) continue;

        // GetData(r.survey.co.kr) 세션 기반 직접 설문 URL 백업 산출
        let directSurveyUrl = '';
        try {
          const resolvedUid = rowAttrUid || targetUid;
          const akList = Array.isArray(window.ACCESS_KEYS) ? window.ACCESS_KEYS : [];
          const realAk = (akList.find(k => k.NAME === 'REAL') || akList[0])?._id || '';
          const cuLoginId = sessionStorage.CU_LOGIN_ID || '';
          const cuId = sessionStorage.CU_ID || '';
          const domain = window.DOMAIN || location.host;
          if (realAk && resolvedUid && /survey\.co\.kr|kmaresearch\.co\.kr/i.test(domain)) {
            directSurveyUrl = `https://${domain}/?ACCESS_KEY=${encodeURIComponent(realAk)}&UID=${encodeURIComponent(resolvedUid)}` +
              (cuId ? `&__CU_ID=${encodeURIComponent(cuId)}` : '') +
              (cuLoginId ? `&__CU_LOGIN_ID=${encodeURIComponent(cuLoginId)}` : '');
          }
        } catch (urlErr) {
          directSurveyUrl = '';
        }

        // 완료 상태 먼저 확인 (상태 코드 COMPLETE 또는 완료 텍스트 + 시작 버튼 없음)
        const compCode = String(rowObj.COMPLETE || '').toUpperCase();

        // 1순위: 동일 행(rowEl) 내부의 실제 <button> / <a> / <input> 요소만 탐색 (span/div 상태셀 배제!)
        const realRowControls = Array.from(
          rowEl.querySelectorAll('button, a, input[type="button"], input[type="submit"]')
        ).filter(el => !el.disabled && !excludeBtnRegex.test((el.innerText || el.value || '').trim()));

        let matchedBtn =
          realRowControls.find(el => el.matches('button.join, button[class*="join"], button[class*="start"], a[class*="join"]')) ||
          realRowControls.find(el => btnTextRegex.test((el.innerText || el.value || '').trim())) ||
          realRowControls[0] ||
          null;

        // 2순위: 우측 고정 열 분리 테이블 구조인 경우 tbody 내 실제 <button>/<a>만 Y좌표 정렬 매칭
        if (!matchedBtn) {
          rowEl.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rowRect = rowEl.getBoundingClientRect();
          const rowMidY = rowRect.top + rowRect.height / 2;
          const tolerance = Math.max(20, rowRect.height * 0.65);
          const tbodyBtns = Array.from(
            document.querySelectorAll('table tbody button, table tbody a, .fixed-right button, [role="gridcell"] button')
          ).filter(el => {
            if (el.disabled || el.offsetParent === null) return false;
            const txt = (el.innerText || el.value || '').trim();
            return !excludeBtnRegex.test(txt) && (btnTextRegex.test(txt) || el.matches('.join, [class*="start"]'));
          });
          const aligned = tbodyBtns
            .map(btn => {
              const br = btn.getBoundingClientRect();
              return { btn, diffY: Math.abs((br.top + br.height / 2) - rowMidY) };
            })
            .filter(x => x.diffY <= tolerance)
            .sort((a, b) => a.diffY - b.diffY);
          if (aligned[0]) matchedBtn = aligned[0].btn;
        }

        if (matchedBtn) {
          matchedBtn.scrollIntoView({ block: 'center', inline: 'center' });
          matchedBtn.setAttribute('data-kbpi-target-start', '1');
          return {
            found: true,
            hasBtn: true,
            rowText: fullText.slice(0, 160),
            btnText: (matchedBtn.innerText || matchedBtn.value || '시작').trim(),
            btnTag: `${matchedBtn.tagName}.${matchedBtn.className || ''}`,
            directSurveyUrl
          };
        }

        if (compCode === 'COMPLETE' || (/\b완료\b/.test(fullText) && !directSurveyUrl)) {
          return { found: true, hasBtn: false, alreadyDone: true, rowText: fullText.slice(0, 160) };
        }

        if (directSurveyUrl) {
          return {
            found: true,
            hasBtn: false,
            rowText: fullText.slice(0, 160),
            directSurveyUrl
          };
        }
      }

      return { found: false, rowCount: rawRows.length };
    }, {
      targetUid: uid,
      targetFinalId: finalId,
      targetReg: region,
      targetGen: gender,
      targetAg: ageGroup
    });
  };

  const waitGetDataSurveyReady = async (targetPage, timeoutMs = 15000) => {
    await targetPage.waitForFunction(
      () => {
        const txt = (document.body?.innerText || '').trim();
        return txt.length > 0 && txt !== 'Loading..' && !/^Loading\.+$/i.test(txt);
      },
      { timeout: timeoutMs }
    ).catch(err => emitLog(`설문 초기 로딩 대기 경고: ${err.message}`, 'warn'));
  };

  const clickMatchedStartButton = async (matchInfo) => {
    if (matchInfo.alreadyDone && !matchInfo.hasBtn) {
      return { alreadyCompleted: true, page: listPage };
    }

    const beforePagesCount = context.pages().length;
    const beforeUrl = listPage.url();

    if (matchInfo.hasBtn) {
      emitLog(`[슬롯 매칭 완료] "${matchInfo.rowText}" ➔ [${matchInfo.btnText}] (${matchInfo.btnTag}) 클릭!`);
      const popupPromise = context.waitForEvent('page', { timeout: 8500 }).catch(() => null);

      // 가로 스크롤 고정 헤더 간섭 방지를 위해 DOM 네이티브 클릭 우선 수행 (GetData button.join 표준 방식)
      await listPage.evaluate(() => {
        const btn = document.querySelector('[data-kbpi-target-start="1"]');
        if (btn) {
          btn.scrollIntoView({ block: 'center', inline: 'center' });
          btn.click();
        }
      });

      const popupPage = await popupPromise;
      if (popupPage) {
        await popupPage.waitForLoadState('domcontentloaded').catch(err => emitLog(`설문 팝업 로드 경고: ${err.message}`, 'warn'));
        await waitGetDataSurveyReady(popupPage, 15000);
        emitLog(`[설문 새 창 진입 완료] URL: ${popupPage.url()}`);
        return { alreadyCompleted: false, page: popupPage };
      }

      // 만약 모달 확인창이 뜬 경우 승인 클릭 후 팝업 재확인
      const modalConfirmed = await listPage.evaluate(() => {
        const modals = Array.from(
          document.querySelectorAll('[role="dialog"], .modal, .swal2-container, .ant-modal, .layer-popup, .popup')
        ).filter(m => m.offsetParent !== null);
        for (const modal of modals) {
          const confirmBtn = Array.from(modal.querySelectorAll('button, a, input[type="button"]'))
            .find(b => b.offsetParent !== null && /^(확인|예|시작|조사\s*시작|계속|진행)$/.test((b.innerText || b.value || '').trim()));
          if (confirmBtn) {
            confirmBtn.click();
            return (confirmBtn.innerText || confirmBtn.value || '').trim();
          }
        }
        return '';
      }).catch(() => '');

      if (modalConfirmed) {
        emitLog(`[시작 확인 모달 승인] "${modalConfirmed}" 클릭`);
        const popupPage2 = await context.waitForEvent('page', { timeout: 7000 }).catch(() => null);
        if (popupPage2) {
          await popupPage2.waitForLoadState('domcontentloaded').catch(err => emitLog(`설문 팝업 로드 경고: ${err.message}`, 'warn'));
          await waitGetDataSurveyReady(popupPage2, 15000);
          emitLog(`[설문 새 창 진입 완료] URL: ${popupPage2.url()}`);
          return { alreadyCompleted: false, page: popupPage2 };
        }
      }

      const currentPages = context.pages();
      if (currentPages.length > beforePagesCount) {
        const latestPg = currentPages[currentPages.length - 1];
        await waitGetDataSurveyReady(latestPg, 15000);
        return { alreadyCompleted: false, page: latestPg };
      }
      if (listPage.url() !== beforeUrl) {
        await waitGetDataSurveyReady(listPage, 15000);
        return { alreadyCompleted: false, page: listPage };
      }
    }

    // 백업: GetData 세션 직접 설문 URL(ACCESS_KEY + UID)로 새 탭 진입
    if (matchInfo.directSurveyUrl) {
      emitLog(`[GetData 직접 설문 URL 진입] ${matchInfo.directSurveyUrl}`);
      const directPage = await context.newPage();
      await directPage.goto(matchInfo.directSurveyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await waitGetDataSurveyReady(directPage, 20000);
      return { alreadyCompleted: false, page: directPage };
    }

    return null;
  };

  // Pass 1: 현재 페이지 스캔 + GetData 숫자형 페이지네이션(data-page="2"..) 순회
  const visitedPages = new Set([1]);
  for (let pageAttempt = 0; pageAttempt < 16; pageAttempt++) {
    const matchInfo = await scanCurrentDomForSlot();
    if (matchInfo.found) {
      const started = await clickMatchedStartButton(matchInfo);
      if (started) return started;
    }

    const nextPageAction = await listPage.evaluate(({ seenPages }) => {
      document.querySelectorAll('[data-kbpi-next-page]').forEach(el => el.removeAttribute('data-kbpi-next-page'));

      // 1) GetData 표준 숫자 페이지 링크 (.pagination .page-link[data-page], .paging a[data-page])
      const dataPageLinks = Array.from(
        document.querySelectorAll('.pagination .page-link[data-page], .paging a[data-page], a[data-page], button[data-page]')
      )
        .map(el => ({ el, pg: Number(el.getAttribute('data-page')) }))
        .filter(x => Number.isFinite(x.pg) && x.pg > 1 && !seenPages.includes(x.pg))
        .sort((a, b) => a.pg - b.pg);

      if (dataPageLinks[0]) {
        dataPageLinks[0].el.setAttribute('data-kbpi-next-page', '1');
        return { hasNext: true, nextPgNum: dataPageLinks[0].pg };
      }

      // 2) 일반 다음(>, ›, 다음) 페이지 버튼
      const nextPg = Array.from(document.querySelectorAll('.pagination a, .paging a, nav a, nav button, a, button'))
        .find(el => {
          const t = (el.innerText || '').trim();
          return el.offsetParent !== null && /^(다음|>|›|»)$/.test(t) && !el.disabled && !el.classList.contains('disabled');
        });
      if (nextPg) {
        nextPg.setAttribute('data-kbpi-next-page', '1');
        return { hasNext: true, nextPgNum: seenPages.length + 1 };
      }
      return { hasNext: false };
    }, { seenPages: Array.from(visitedPages) });

    if (nextPageAction.hasNext) {
      visitedPages.add(nextPageAction.nextPgNum);
      await listPage.evaluate(() => {
        const el = document.querySelector('[data-kbpi-next-page="1"]');
        if (el) el.click();
      });
      await listPage.waitForTimeout(1400);
    } else {
      break;
    }
  }

  // 실패 시 원인 즉시 파악을 위한 현재 화면 진단 스냅샷 로깅
  const diag = await listPage.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
      .map(el => (el.innerText || '').trim())
      .filter(Boolean)
      .slice(0, 18);
    const sampleRows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'))
      .slice(0, 4)
      .map(r => (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140));
    return {
      url: location.href,
      title: document.title,
      headers,
      sampleRows,
      bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260)
    };
  }).catch(err => ({ url: listPage.url(), err: err.message }));

  emitLog(
    `[슬롯 탐색 진단] URL=${diag.url} | 헤더=[${(diag.headers || []).join(', ')}] | 샘플행=${JSON.stringify(diag.sampleRows || [])} | 본문="${diag.bodyPreview || ''}"`,
    'warn',
    'SLOT_DIAG'
  );

  throw new Error(`CAPI 리스트에서 고유번호(${uid}) / 최종id(${finalId}) 슬롯을 찾을 수 없습니다. (현재 URL: ${diag.url || listPage.url()})`);
}

/**
 * 설문이 메인 문서가 아닌 iframe 내부에서 렌더링되는 경우 해당 Frame을 반환
 */
async function resolveActiveSurveyFrame(page) {
  const frames = page.frames();
  if (frames.length <= 1) return page;
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    const hasSurveyDom = await frame.evaluate(() => {
      const txt = (document.body?.innerText || '').trim();
      return txt.length > 15 && (/GP1|응답자\s*확인|다음|브랜드|\bSQ\s*1\b/i.test(txt) || document.querySelectorAll('input, select, button').length > 0);
    }).catch(() => false);
    if (hasSurveyDom) return frame;
  }
  return page;
}

/**
 * 현재 설문 화면의 단계 유형과 출제 산업군명(예: '생수', '음식물처리기')을 정밀 분류 (Survey 230 전 문항 100% 대응)
 */
async function classifyCurrentScreen(target) {
  return target.evaluate(() => {
    const bodyText = (document.body?.innerText || '').trim();

    // GetData 비동기 전환 초기 Loading.. 상태 감지
    if (!bodyText || /^Loading\.{0,5}$/i.test(bodyText)) {
      return { screenType: 'LOADING', categoryName: '', progressPct: null, buttonTexts: [] };
    }

    const buttonTexts = Array.from(document.querySelectorAll('#next, button, input[type="button"], input[type="submit"], a'))
      .filter(el => el.offsetParent !== null)
      .map(el => (el.innerText || el.value || '').replace(/\s+/g, ' ').trim())
      .filter(t => t && t.length <= 24)
      .slice(0, 10);

    // 아직 CAPI 슬롯 리스트 화면에 머물러 있는 경우 명시적 분류
    if ((/실사코드/.test(bodyText) && /최종\s*id/i.test(bodyText)) || /진행\s*대상\s*리스트/.test(bodyText)) {
      return {
        screenType: 'CAPI_LIST_PENDING',
        categoryName: '',
        progressPct: null,
        buttonTexts,
        bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 220)
      };
    }

    let categoryName = '';
    const bracketMatch = bodyText.match(/【\s*([^】]+?)\s*】/);
    const quoteBrandMatch = bodyText.match(/[‘'"]\s*([^’'"]+?)\s*브랜드\s*[’'"]\s*에\s*대한\s*내용/);
    if (bracketMatch) {
      categoryName = bracketMatch[1].trim();
    } else if (quoteBrandMatch) {
      categoryName = quoteBrandMatch[1].trim();
    }

    const pctMatch = bodyText.match(/(\d{1,3})\s*%/);
    const progressPct = pctMatch ? Number(pctMatch[1]) : null;
    const bodySnippet = bodyText.replace(/\s+/g, ' ').slice(0, 220);

    const visibleQNameEls = Array.from(
      document.querySelectorAll('[question-name], [question-type]')
    ).filter(el => el.offsetParent !== null);
    const visibleQNames = Array.from(new Set(
      visibleQNameEls
        .map(el => (el.getAttribute('question-name') || el.getAttribute('qname') || '').trim())
        .filter(Boolean)
    ));

    const qTypeEl = visibleQNameEls[visibleQNameEls.length - 1] || document.querySelector('[question-type]');
    const qNameAttr = visibleQNames[0] ||
      (qTypeEl ? (qTypeEl.getAttribute('question-name') || qTypeEl.getAttribute('qname') || '') : '');
    const indMatch = (visibleQNames.find(n => /--\d+$/.test(n)) || qNameAttr).match(/--(\d+)$/);
    const industryKey = indMatch ? indMatch[1] : '';

    if (!categoryName && industryKey && window.QO?.INDUSTRY?.ANSWERS) {
      const indItem = (window.QO.INDUSTRY.ANSWERS || []).find(x => String(x.K) === industryKey);
      if (indItem) {
        categoryName = String(indItem.DISPLAY || indItem.V || '').replace(/브랜드$/g, '').trim();
      }
    }

    const visibleControlCount = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea, .s-gradeclick')
    ).filter(el => el.offsetParent !== null).length;
    const domMeta = `qNames=[${visibleQNames.join(',')}],qType=${qTypeEl?.getAttribute('question-type') || '-'},grade=${document.querySelectorAll('.s-gradeclick').length},sel=${document.querySelectorAll('select').length},rad=${document.querySelectorAll('input[type="radio"]').length},cb=${document.querySelectorAll('input[type="checkbox"]').length},txt=${document.querySelectorAll('input[type="text"],input[type="number"],textarea').length}`;

    const baseRet = { qNameAttr, visibleQNames, industryKey, visibleControlCount, categoryName, progressPct, buttonTexts, bodySnippet, domMeta };

    // 스크리닝 탈락 / 쿼터 초과 화면 감지
    if (visibleQNames.some(q => /^(OUT|TXT_OUT|OVER|TXT_OVER|BAD|TXT_BAD)/i.test(q))) {
      return { screenType: 'SCREENED_OUT', ...baseRet };
    }

    // 설문 완료 화면 감지 (TXT_COMPLETE / COMPLETE)
    if (
      visibleQNames.some(q => /^(TXT_COMPLETE|COMPLETE\d*$)/i.test(q)) ||
      (/설문이\s*종료|조사가\s*완료|끝까지\s*응답해\s*주셔서\s*대단히\s*감사|응답해\s*주셔서\s*감사|참여해\s*주셔서\s*대단히\s*감사|수고하셨습니다/.test(bodyText) &&
        visibleControlCount === 0 &&
        !document.querySelector('#next'))
    ) {
      return { screenType: 'COMPLETED', ...baseRet };
    }

    // 0) 초기 안내문(TITLE + DESC)
    if (visibleQNames.includes('DESC') || visibleQNames.includes('TITLE')) {
      return { screenType: 'INTRO_DESC', ...baseRet };
    }

    // 1) GP1 위치 확인
    if (visibleQNames.includes('GP1') || (/GP1/.test(bodyText) && /현재\s*위치를\s*확인/.test(bodyText))) {
      return { screenType: 'GP1', ...baseRet };
    }

    // 2) WOKERD_DUP 응답자 신상명세 확인
    if (visibleQNames.includes('WOKERD_DUP') || document.querySelector('.worker-info-card') || (/응답자\s*확인/.test(bodyText) && /연령\s*\(\s*만\s*\)/.test(bodyText))) {
      return { screenType: 'PROFILE', ...baseRet };
    }

    // 3) SQ1 / SQ2 / SQ3 / M_CHECK
    if (visibleQNames.includes('SQ1')) return { screenType: 'SQ1', ...baseRet };
    if (visibleQNames.includes('SQ2')) return { screenType: 'SQ2_AGE', ...baseRet };
    if (visibleQNames.includes('SQ3')) return { screenType: 'SQ3_GENDER', ...baseRet };
    if (visibleQNames.includes('M_CHECK') || document.querySelector('[question-name="M_CHECK"] select')) {
      return { screenType: 'M_CHECK_REGION', ...baseRet };
    }
    if (document.querySelector('[question-name="INDUSTRY_ORDER"]') && visibleQNames.length === 0) {
      return { screenType: 'ALLOCATING_INDUSTRIES', ...baseRet };
    }

    // 4) 본 설문 산업군별 문항 (KBPI_Q1 ~ KBPI_Q8 및 특수 진단 블록)
    if (visibleQNames.some(q => /^KBPI_Q1_\d+--/i.test(q))) return { screenType: 'Q1_UNAIDED', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q2--/i.test(q))) return { screenType: 'Q2_AIDED', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q3--/i.test(q))) return { screenType: 'Q3_MATRIX', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q4--/i.test(q))) return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q41--/i.test(q))) return { screenType: 'Q4_1_FACTOR', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q41_CHANNEL--/i.test(q))) return { screenType: 'Q4_1_CHANNEL', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q42--/i.test(q))) return { screenType: 'Q4_2_DETERGENT', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q5--/i.test(q))) return { screenType: 'Q5_SAME_AS_Q4', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q6--/i.test(q))) return { screenType: 'Q6_YES_NO', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q7--/i.test(q))) return { screenType: 'Q7_RANK_1_2', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_Q8--/i.test(q))) return { screenType: 'Q8_RANK_1_2', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_NGO/i.test(q))) return { screenType: 'KBPI_NGO_SPECIAL', ...baseRet };
    if (visibleQNames.some(q => /^KBPI_DIAG_/i.test(q))) return { screenType: 'KBPI_DIAG_SPECIAL', ...baseRet };

    // 5) 후반부 의견 및 배경변인 (3.1 DQ1 / 3.2 ZQ1~ZQ5_2 / 3.3 ZQ6 패널가입)
    if (visibleQNames.includes('DQ1')) return { screenType: 'DQ1_INFO_SOURCE', ...baseRet };
    if (visibleQNames.some(q => /^ZQ([1-5]|5_1|5_2)$/i.test(q))) return { screenType: 'ZQ_DEMOGRAPHICS', ...baseRet };
    if (visibleQNames.some(q => /^ZQ6(_1)?$/i.test(q)) || /한국능률협회컨설팅\s*패널로\s*가입/.test(bodyText)) {
      return { screenType: 'ZQ6_PANEL_INTENT', ...baseRet };
    }

    // 6) 텍스트·배지 폴백 (문항 코드가 변형된 경우 대비)
    if (!categoryName && (/\bSQ\s*1\b/i.test(bodyText) || /광고회사나\s*조사회사/.test(bodyText))) {
      return { screenType: 'SQ1', ...baseRet };
    }
    if (/1-1/.test(bodyText) && /가장\s*먼저\s*생각나는\s*브랜드/.test(bodyText)) {
      return { screenType: 'Q1_UNAIDED', ...baseRet };
    }
    if (/알고\s*계시는\s*브랜드를\s*모두/.test(bodyText)) {
      return { screenType: 'Q2_AIDED', ...baseRet };
    }
    if (/1점\s*~\s*5점으로\s*평가/.test(bodyText) || /전반적으로\s*만족한다/.test(bodyText)) {
      return { screenType: 'Q3_MATRIX', ...baseRet };
    }
    if (/고려하신\s*가장\s*중요한\s*요인/.test(bodyText)) {
      return { screenType: 'Q4_1_FACTOR', ...baseRet };
    }
    if (/어느\s*채널\s*\(\s*경로\s*\)\s*을?\s*통해서/.test(bodyText)) {
      return { screenType: 'Q4_1_CHANNEL', ...baseRet };
    }
    if (/가장\s*최근에[^\n]{0,35}(구입|이용|방문|사용)/.test(bodyText)) {
      return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
    }

    let firstBadge = '';
    if (categoryName) {
      const badgeTexts = Array.from(document.querySelectorAll('div, span, th, td, strong'))
        .filter(el => el.children.length === 0 && el.offsetParent !== null)
        .map(el => (el.innerText || '').trim())
        .filter(t => /^(4|5|6|7|8)$/.test(t));
      firstBadge = badgeTexts[0] || '';

      if (firstBadge === '4') return { screenType: 'Q4_RECENT_BRAND', ...baseRet };
      if (firstBadge === '5' || /주\s*구입|가장\s*선호|주로\s*이용|가장\s*자주/.test(bodyText)) return { screenType: 'Q5_SAME_AS_Q4', ...baseRet };
      if (firstBadge === '6') return { screenType: 'Q6_YES_NO', ...baseRet };
      if (firstBadge === '7') return { screenType: 'Q7_RANK_1_2', ...baseRet };
      if (firstBadge === '8') return { screenType: 'Q8_RANK_1_2', ...baseRet };
    }

    const hasFinalBtn = Array.from(document.querySelectorAll('#next, button, input[type="button"], input[type="submit"], a'))
      .some(el => /조사\s*완료|설문\s*완료|최종\s*제출|완료하기|설문\s*종료/.test((el.innerText || el.value || '').trim()));
    const isEndOutroScreen = /^(END|OUTRO|FINISH|COMPLETE|LAST|SIGN|AGREE)/i.test(qNameAttr) ||
      /설문을?\s*마치|응답을?\s*완료하시려면|설문이\s*모두\s*끝났|개인정보\s*수집.*동의/.test(bodyText);
    if (hasFinalBtn || isEndOutroScreen) {
      return { screenType: 'FINAL_SUBMIT_GATE', ...baseRet };
    }

    return {
      screenType: 'GENERIC_STEP',
      badge: firstBadge,
      ...baseRet
    };
  });
}

/**
 * GetData 내장 상태(PD('INDUSTRY_ORDER') / A.PREV_DATA.INDUSTRY_ORDER / AO.INDUSTRY_ORDER + QO.INDUSTRY.ANSWERS)에서
 * 해당 응답자에게 배정된 전체 18~20개 브랜드(산업군) 순서를 일괄 추출
 */
async function extractAssignedIndustriesFromPage(target) {
  return target.evaluate(() => {
    try {
      let orderStr = '';
      if (typeof window.PD === 'function') {
        const pdObj = window.PD('INDUSTRY_ORDER');
        if (pdObj && pdObj.TEXT_1) orderStr = String(pdObj.TEXT_1);
      }
      if (!orderStr && window.A?.PREV_DATA?.INDUSTRY_ORDER?.TEXT_1) {
        orderStr = String(window.A.PREV_DATA.INDUSTRY_ORDER.TEXT_1);
      }
      if (!orderStr && window.AO?.INDUSTRY_ORDER?.TEXT_1) {
        orderStr = String(window.AO.INDUSTRY_ORDER.TEXT_1);
      }
      if (!orderStr && typeof window.Replacer === 'function') {
        const rep = String(window.Replacer('[KEY:INDUSTRY_ORDER/TEXT_1]') || '');
        if (rep && !rep.includes('KEY:INDUSTRY_ORDER')) orderStr = rep;
      }
      if (!orderStr) {
        const inp = document.querySelector('[question-name="INDUSTRY_ORDER"] input[data-column="TEXT_1"]');
        if (inp && inp.value) orderStr = String(inp.value);
      }

      const rawKeys = orderStr.split(',').map(s => s.trim()).filter(Boolean);
      const answers = Array.isArray(window.QO?.INDUSTRY?.ANSWERS) ? window.QO.INDUSTRY.ANSWERS : [];
      const byKey = new Map(answers.map(a => [String(a.K), a]));

      const assigned = [];
      const seenKeys = new Set();
      const displayCounts = new Map();

      for (const k of rawKeys) {
        const keyStr = String(k);
        if (seenKeys.has(keyStr)) continue;
        seenKeys.add(keyStr);

        const item = byKey.get(keyStr);
        const dispTitle = item ? String(item.DISPLAY || '').replace(/브랜드$/g, '').trim() : '';
        const vTitle = item ? String(item.INDUSTRY || item.V || '').replace(/브랜드$/g, '').trim() : '';
        const baseTitle = dispTitle || vTitle || keyStr;
        if (!baseTitle) continue;

        const prevCnt = displayCounts.get(baseTitle) || 0;
        displayCounts.set(baseTitle, prevCnt + 1);

        // 동일 표시명(DISPLAY) 품목이 2개 코드(예: 35·36 구호개발단체)로 배정된 경우 세부 산업군명(INDUSTRY/V) 우선 표기
        let finalTitle = baseTitle;
        if (prevCnt > 0 && vTitle && vTitle !== baseTitle) {
          finalTitle = vTitle;
        }

        assigned.push({
          industryKey: keyStr,
          categoryName: finalTitle,
          special: String(item?.SPECIAL || '')
        });
      }
      return assigned;
    } catch (err) {
      return [];
    }
  }).catch(err => {
    console.warn('[K-BPI 배정 산업군 추출 경고]', err.message);
    return [];
  });
}

function mergeAssignedIndustriesIntoConfigs({
  assigned = [],
  categoryConfigs = [],
  ageGroup = '',
  age = 30,
  gender = '',
  policy = {}
} = {}) {
  if (!Array.isArray(assigned) || assigned.length === 0) return categoryConfigs;

  const prevList = Array.isArray(categoryConfigs) ? [...categoryConfigs] : [];
  const usedPrevIndices = new Set();

  const nextConfigs = assigned.map((item, idx) => {
    const itemKey = String(item.industryKey || '').trim();
    const cleanItemCat = String(item.categoryName || '').replace(/브랜드$/g, '').trim();

    // 1순위: industryKey 일치 -> 2순위: 동일 슬롯 순번 + 카테고리명 일치 -> 3순위: 미사용 동일 카테고리명 -> 4순위: 동일 슬롯 순번
    let matchIdx = itemKey
      ? prevList.findIndex((c, pIdx) => !usedPrevIndices.has(pIdx) && String(c?.industryKey || '').trim() === itemKey)
      : -1;
    if (matchIdx < 0 && prevList[idx] && !usedPrevIndices.has(idx)) {
      const slotCat = String(prevList[idx]?.categoryName || '').replace(/브랜드$/g, '').trim();
      if (!slotCat || slotCat === cleanItemCat) matchIdx = idx;
    }
    if (matchIdx < 0 && cleanItemCat) {
      matchIdx = prevList.findIndex((c, pIdx) => !usedPrevIndices.has(pIdx) && String(c?.categoryName || '').replace(/브랜드$/g, '').trim() === cleanItemCat);
    }
    if (matchIdx >= 0) usedPrevIndices.add(matchIdx);

    const prevMatch = matchIdx >= 0 ? prevList[matchIdx] : (prevList[idx] || {});
    let exp = String(prevMatch.purchaseExp || '').trim();
    if (exp !== '있음' && exp !== '없음') {
      exp = recommendDefaultPurchaseExp({
        categoryName: item.categoryName,
        ageGroup,
        age,
        gender,
        teenAutoNone: policy.teenAutoNoneUnfitCategories !== false
      });
    }
    const mergedSlot = {
      slot: idx + 1,
      industryKey: itemKey || prevMatch.industryKey || '',
      categoryName: item.categoryName,
      purchaseExp: exp,
      topBrand: prevMatch.topBrand || '',
      channel: prevMatch.channel || ''
    };
    if (Array.isArray(prevMatch.q1Brands) && prevMatch.q1Brands.length > 0) mergedSlot.q1Brands = prevMatch.q1Brands;
    if (Array.isArray(prevMatch.q3Adjectives) && prevMatch.q3Adjectives.length > 0) mergedSlot.q3Adjectives = prevMatch.q3Adjectives;
    if (Array.isArray(prevMatch.q3Cols) && prevMatch.q3Cols.length > 0) mergedSlot.q3Cols = prevMatch.q3Cols;
    if (prevMatch.q3Summary) mergedSlot.q3Summary = prevMatch.q3Summary;
    return mergedSlot;
  });

  categoryConfigs.splice(0, categoryConfigs.length, ...nextConfigs);
  return categoryConfigs;
}

async function clickNextButton(target) {
  const clicked = await target.evaluate(() => {
    const gdNext = document.querySelector('#next');
    if (gdNext && gdNext.offsetParent !== null && !gdNext.disabled) {
      gdNext.click();
      return (gdNext.innerText || gdNext.value || '다음').trim();
    }

    const nextRegex = /^(다음|다음으로|다음\s*단계|응답자\s*확인|확인|저장\s*후\s*다음|설문\s*시작|조사\s*시작|시작하기|동의|동의합니다|동의\s*후\s*시작)$/;
    const primaryCandidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const primaryBtn = primaryCandidates.find(el => {
      const txt = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
      return el.offsetParent !== null && !el.disabled && nextRegex.test(txt);
    });
    if (primaryBtn) {
      primaryBtn.click();
      return (primaryBtn.innerText || primaryBtn.value || '').trim();
    }
    const fallbackBtn = Array.from(document.querySelectorAll('div, span')).find(el => {
      const txt = (el.innerText || '').trim();
      return el.offsetParent !== null && el.children.length === 0 && nextRegex.test(txt);
    });
    if (fallbackBtn) {
      fallbackBtn.click();
      return (fallbackBtn.innerText || '').trim();
    }
    return '';
  });
  return clicked;
}

export async function runKmacKbpiSurvey({
  campaign = null,
  slotData = {},
  policy: rawPolicy = {},
  quotaIndex = 1,
  pilotMode = false,
  safetyGuard = true,
  stopAtStepOverride = null,
  sharedSession = null,
  captureHtmlDumpPath = null,
  onProgress = null
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_POLICY,
    ...(campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {}),
    ...(rawPolicy || {})
  };

  const stopAtStep = stopAtStepOverride || (pilotMode ? (policy.pilotStopAtStep || 'FINAL_GATE') : (safetyGuard ? 'FINAL_GATE' : 'NONE'));
  const loginId = String(campaign?.loginId || slotData.loginId || KBPI_DEFAULT_LOGIN_ID).trim();
  const loginPw = String(campaign?.loginPw || loginId).trim();
  const seq = Number(slotData.seq || slotData.index || quotaIndex || 1);
  const uid = String(slotData.uid || '').trim();
  const finalId = String(slotData.finalId || '').trim();
  const region = String(slotData.region || '서울').trim();
  const gender = String(slotData.gender || slotData.ceoGender || '남').trim();
  const ageGroup = String(slotData.ageGroup || '20대').trim();
  const age = Number(slotData.age || slotData.ceoAge || 25);
  const respondentName = String(slotData.name || slotData.ceoName || '').trim();
  const phone = String(slotData.phone || '').trim();

  const demoEnriched = enrichKbpiRespondentDemographics({
    ...slotData,
    seq,
    finalId,
    region,
    gender,
    age,
    ageGroup
  });
  const distInfo = computeKbpiDistrictDong(region, finalId, seq);
  const surveyDistrict = String(slotData.surveyDistrict || demoEnriched.surveyDistrict || distInfo.surveyDistrict).trim();
  const surveyDong = String(slotData.surveyDong || demoEnriched.surveyDong || distInfo.surveyDong).trim();
  const cityCode = distInfo.cityCode;

  const gps = (slotData.latitude && slotData.longitude)
    ? { baseLabel: slotData.gpsLabel || (region.includes('인천') ? '인천광역시청' : '서울 노원구청'), latitude: Number(slotData.latitude), longitude: Number(slotData.longitude) }
    : computeKbpiGps(region, finalId, seq);

  const categoryConfigs = normalizeCategoryConfigs(slotData.categoryConfigs || [], 20);
  const rng = makeSeededRng(`${uid}_${finalId}_${seq}_${respondentName}`);

  const emitLog = (message, level = 'info', step = '진행') => {
    if (typeof onProgress === 'function') {
      onProgress({ step, message, level });
    }
  };

  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';
  let browser = null;
  let openedSurveyTab = null;
  const ownsBrowser = !sharedSession;
  const alertHistory = [];
  const seenCategoriesOrder = [];
  let assignedIndustriesSynced = false;

  const htmlInspectionDump = captureHtmlDumpPath
    ? {
        extractedAt: new Date().toISOString(),
        respondent: { seq, uid, finalId, name: respondentName, region, gender, ageGroup, age },
        networkJoinPayloads: [],
        windowSchema: null,
        screens: [],
        seenCategories: [],
        alertHistory: [],
        finalOutcome: null
      }
    : null;
  const seenHtmlTemplateKeys = new Set();

  try {
    let context = sharedSession?.context || null;
    let listPage = sharedSession?.listPage || null;

    if (ownsBrowser) {
      browser = await launchChromium({
        headless: true,
        args: ['--ignore-certificate-errors'],
        ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
      });

      context = await browser.newContext({
        viewport: { width: 1360, height: 920 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        geolocation: {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: 14
        },
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true
      });

      await context.addInitScript(({ lat, lng }) => {
        const mockPos = {
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: 14,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        };
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition = (success) => {
            setTimeout(() => success(mockPos), 120);
          };
          navigator.geolocation.watchPosition = (success) => {
            setTimeout(() => success(mockPos), 120);
            return 1;
          };
        }
      }, { lat: gps.latitude, lng: gps.longitude });

      if (htmlInspectionDump) {
        context.on('response', async (resp) => {
          try {
            const rUrl = resp.url() || '';
            if (!/\/Join\/|\/Survey\/|SNUM=230/i.test(rUrl)) return;
            const ct = (resp.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json') && !/\/Join\/(Init|Next|Start|Load|GetData)/i.test(rUrl)) return;
            if (htmlInspectionDump.networkJoinPayloads.length >= 120) return;
            const bodyTxt = await resp.text();
            if (bodyTxt && bodyTxt.length <= 2500000) {
              let parsed = null;
              try { parsed = JSON.parse(bodyTxt); } catch (e) { parsed = bodyTxt.slice(0, 20000); }
              htmlInspectionDump.networkJoinPayloads.push({
                url: rUrl,
                status: resp.status(),
                data: parsed
              });
            }
          } catch (respErr) {
            console.warn('[K-BPI HTML 분석 응답 캡처 경고]', respErr.message);
          }
        });
      }

      const rootPage = await context.newPage();
      const attachDialogHandler = (pg) => {
        pg.on('dialog', async (dialog) => {
          const msg = dialog.message() || '';
          alertHistory.push(msg);
          emitLog(`[설문 알림] 🔔 "${msg}"`, 'warn', 'ALERT');
          try {
            await dialog.accept();
          } catch (err) {
            emitLog(`알림 수락 경고: ${err.message}`, 'warn', 'ALERT');
          }
        });
      };
      attachDialogHandler(rootPage);
      context.on('page', (newPg) => attachDialogHandler(newPg));

      listPage = await loginAndEnterKbpiCapiList({
        context,
        page: rootPage,
        loginId,
        loginPw,
        emitLog: (m, lv) => emitLog(m, lv, 'LOGIN')
      });
    } else {
      // 공유 세션 모드: 응답자별 고유 GPS 좌표를 즉시 갱신
      await context.setGeolocation({
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: 14
      });
    }

    // 2. 대상 응답자 슬롯 매칭 및 [시작] 클릭
    const slotEntry = await findAndStartRespondentSlot({
      context,
      listPage,
      slotData,
      emitLog: (m, lv) => emitLog(m, lv, 'SLOT')
    });

    if (slotEntry.alreadyCompleted) {
      emitLog(`[이미 완료된 슬롯] #${seq} ${respondentName} (${uid})는 CAPI 서버상 이미 완료 상태입니다.`, 'info', 'DONE');
      return {
        success: true,
        alreadyCompleted: true,
        statusLabel: '완료',
        quotaStatus: 'completed',
        categoryConfigs,
        gps,
        surveyDistrict,
        surveyDong
      };
    }

    let surveyPage = slotEntry.page;
    if (surveyPage !== listPage) {
      openedSurveyTab = surveyPage;
    }
    // 응답자 탭 내부 navigator.geolocation 2중 보강 (공유 세션에서도 개별 좌표 보장)
    await surveyPage.evaluate(({ lat, lng }) => {
      const mockPos = {
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 14,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = (success) => {
          setTimeout(() => success(mockPos), 90);
        };
        navigator.geolocation.watchPosition = (success) => {
          setTimeout(() => success(mockPos), 90);
          return 1;
        };
      }
    }, { lat: gps.latitude, lng: gps.longitude }).catch(err => console.warn('[K-BPI 탭 GPS 보강 경고]', err.message));

    await surveyPage.waitForTimeout(1100);

    const categoryRuntimeMap = new Map();
    const claimedConfigSlots = new Set();
    const respondentUsedBrandNorms = new Set();
    const respondentUsedBrandRoots = new Set();
    const respondentUsedAdjectives = new Set();
    const respondentUsedReasons = new Set();

    const syncAssignedIndustriesOnce = async (targetFrame) => {
      if (assignedIndustriesSynced) return;
      const assigned = await extractAssignedIndustriesFromPage(targetFrame);
      if (assigned.length > 0) {
        mergeAssignedIndustriesIntoConfigs({
          assigned,
          categoryConfigs,
          ageGroup,
          age,
          gender,
          policy
        });
        assignedIndustriesSynced = true;
        emitLog(
          `[배정 브랜드 전수 스캔 완료] 총 ${assigned.length}개 품목 확인: [${assigned.map((a, i) => `${i + 1}.${a.categoryName}(${categoryConfigs[i]?.purchaseExp || '있음'})`).join(', ')}]`,
          'info',
          'SCAN'
        );
      }
    };

    const getOrInitCategoryState = async (catNameRaw, indKeyRaw = '', targetFrame = null) => {
      const cleanCat = String(catNameRaw || '').replace(/브랜드$/g, '').trim() || `품목${seenCategoriesOrder.length + 1}`;
      const cleanIndKey = String(indKeyRaw || '').trim();
      const runtimeKey = cleanIndKey ? `${cleanCat}__${cleanIndKey}` : cleanCat;

      // industryKey 없이 먼저 생성된 상태가 있거나 역방향 조회 시 호환 매칭
      if (!categoryRuntimeMap.has(runtimeKey) && !cleanIndKey) {
        for (const [rk, rv] of categoryRuntimeMap.entries()) {
          if (rk.startsWith(`${cleanCat}__`)) return rv;
        }
      }

      if (!categoryRuntimeMap.has(runtimeKey)) {
        const frameToQuery = targetFrame || surveyPage;
        if (frameToQuery) {
          await syncAssignedIndustriesOnce(frameToQuery);
        }

        const catIdx = seenCategoriesOrder.length;
        seenCategoriesOrder.push(runtimeKey);

        let liveOfficialBrands = [];
        if (frameToQuery) {
          liveOfficialBrands = await frameToQuery.evaluate(({ iKey, cName }) => {
            const answers = window.QO?.INDUSTRY?.ANSWERS;
            if (!Array.isArray(answers) || answers.length === 0) return [];
            const norm = (s) => String(s || '').replace(/브랜드$/g, '').replace(/\s+/g, '').toLowerCase();
            const targetNorm = norm(cName);
            const found = (iKey && answers.find(x => String(x.K) === String(iKey))) ||
              answers.find(x => norm(x.DISPLAY || x.INDUSTRY || x.V) === targetNorm);
            if (!found) return [];
            const list = [];
            for (let b = 1; b <= 58; b++) {
              const val = String(found['B' + b] || '').trim();
              if (val && val !== '없음' && !list.includes(val)) {
                list.push(val);
              }
            }
            return list;
          }, { iKey: cleanIndKey, cName: cleanCat }).catch(err => {
            console.warn('[K-BPI QO 브랜드 조회 경고]', err.message);
            return [];
          });
        }

        const meta = await resolveCategoryMeta(cleanCat, policy);
        if (liveOfficialBrands.length >= 3) {
          saveLearnedCategoryBrands(cleanCat, liveOfficialBrands);
        }
        const brandSource = liveOfficialBrands.length >= 3 ? liveOfficialBrands : meta.brands;
        const shuffledRawBrands = shuffleWithRng(brandSource, rng);
        // [중복 브랜드 방지 규칙] 동일 문항 내 모브랜드/문자열 중복 차단 + 동일 응답자 내 선행 품목 사용 브랜드 후순위 배치
        const distinctBrands = selectDistinctKbpiBrands(
          shuffledRawBrands,
          Math.max(8, shuffledRawBrands.length),
          respondentUsedBrandNorms,
          respondentUsedBrandRoots
        );
        const unaidedTargetBrands = distinctBrands.slice(0, 4);
        for (const ub of unaidedTargetBrands) {
          const nk = normalizeKbpiBrandKey(ub);
          const rk = extractKbpiBrandRoot(ub);
          if (nk) respondentUsedBrandNorms.add(nk);
          if (rk) respondentUsedBrandRoots.add(rk);
        }

        const shuffledAdjs = Array.from(new Set(shuffleWithRng(meta.adjectives, rng)));
        const shuffledChannels = Array.from(new Set(shuffleWithRng(meta.channels, rng)));
        const shuffledPosReasons = Array.from(new Set(shuffleWithRng(Q3_RECOMMEND_REASON_POOLS.positive, rng)));
        const shuffledNeuReasons = Array.from(new Set(shuffleWithRng(Q3_RECOMMEND_REASON_POOLS.neutral, rng)));

        // 슬롯 인덱스 매칭: 1) industryKey 일치 -> 2) 아직 배정되지 않은 동일 categoryName 슬롯 -> 3) 순차 catIdx
        let existingSlotIdx = cleanIndKey
          ? categoryConfigs.findIndex((c, sIdx) => !claimedConfigSlots.has(sIdx) && String(c?.industryKey || '').trim() === cleanIndKey)
          : -1;
        if (existingSlotIdx < 0) {
          existingSlotIdx = categoryConfigs.findIndex((c, sIdx) => {
            if (claimedConfigSlots.has(sIdx)) return false;
            const cn = String(c?.categoryName || '').replace(/브랜드$/g, '').trim();
            return cn && cn === cleanCat;
          });
        }
        const targetCfgIdx = existingSlotIdx >= 0 ? existingSlotIdx : catIdx;
        claimedConfigSlots.add(targetCfgIdx);

        const purchaseExp = decideCategoryPurchaseExp({
          categoryName: cleanCat,
          industryKey: cleanIndKey,
          categorySlotIdx: targetCfgIdx,
          categoryConfigs,
          ageGroup,
          age,
          gender,
          policy,
          rng
        });

        const aiSearched = (rng() * 100) >= Number(policy.q6NoRate ?? 80);

        while (categoryConfigs.length <= targetCfgIdx) {
          categoryConfigs.push({ slot: categoryConfigs.length + 1, categoryName: '', purchaseExp: '' });
        }
        categoryConfigs[targetCfgIdx].slot = targetCfgIdx + 1;
        if (cleanIndKey) categoryConfigs[targetCfgIdx].industryKey = cleanIndKey;
        categoryConfigs[targetCfgIdx].categoryName = categoryConfigs[targetCfgIdx].categoryName || cleanCat;
        categoryConfigs[targetCfgIdx].purchaseExp = purchaseExp;
        categoryConfigs[targetCfgIdx].topBrand = purchaseExp === '없음' ? '없음' : (unaidedTargetBrands[0] || '');
        categoryConfigs[targetCfgIdx].channel = purchaseExp === '없음' ? '' : (shuffledChannels[0] || '');

        categoryRuntimeMap.set(runtimeKey, {
          slotIndex: targetCfgIdx,
          categoryName: cleanCat,
          industryKey: cleanIndKey,
          purchaseExp,
          aiSearched,
          unaidedBrands: unaidedTargetBrands,
          allDistinctBrands: distinctBrands,
          q2CheckedBrands: [],
          adjectives: shuffledAdjs,
          brandAdjectives: meta.brandAdjectives || {},
          posReasons: shuffledPosReasons,
          neuReasons: shuffledNeuReasons,
          selectedChannel: shuffledChannels[0] || '편의점',
          q4SelectedBrand: purchaseExp === '없음' ? '없음' : (unaidedTargetBrands[0] || ''),
          q4SelectedAkey: ''
        });

        emitLog(
          `[품목 #${targetCfgIdx + 1} 감지: ${cleanCat}${cleanIndKey ? `(코드:${cleanIndKey})` : ''}${liveOfficialBrands.length >= 3 ? ` (공식B:${liveOfficialBrands.length}개)` : ''}] 구입경험="${purchaseExp}" | AI검색="${aiSearched ? '예' : '아니오'}" | 상기=[${unaidedTargetBrands.slice(0, 3).join(', ')}]${purchaseExp === '있음' ? ` | 채널="${shuffledChannels[0]}"` : ''}`,
          'info',
          `CAT${targetCfgIdx + 1}`
        );
      }
      return categoryRuntimeMap.get(runtimeKey);
    };

    // 3. 단계별 설문 진행 루프 (20개 산업군 완주 대응 450회 상한)
    let sameScreenStuckCount = 0;
    let lastSignature = '';

    for (let stepIter = 0; stepIter < 450; stepIter++) {
      await surveyPage.waitForTimeout(650);

      const allOpenPages = context.pages().filter(p => p !== listPage && p.url() && p.url() !== 'about:blank');
      if (allOpenPages.length > 0 && allOpenPages[allOpenPages.length - 1] !== surveyPage) {
        surveyPage = allOpenPages[allOpenPages.length - 1];
        openedSurveyTab = surveyPage;
      }

      const activeTarget = await resolveActiveSurveyFrame(surveyPage);

      const modalAlertMsg = await activeTarget.evaluate(() => {
        const modals = Array.from(
          document.querySelectorAll('.bootbox.modal, .modal.in, .modal.show, .swal2-container, .ui-dialog')
        ).filter(m => m.offsetParent !== null);
        for (const m of modals) {
          const msg = (m.innerText || '').replace(/\s+/g, ' ').trim();
          const okBtn = Array.from(m.querySelectorAll('button, a, input[type="button"]'))
            .find(b => b.offsetParent !== null && /^(확인|닫기|OK|예)$/i.test((b.innerText || b.value || '').trim()));
          if (okBtn) {
            okBtn.click();
            return msg.slice(0, 140);
          }
        }
        return '';
      }).catch(err => {
        console.warn('[K-BPI 모달 감지 경고]', err.message);
        return '';
      });
      if (modalAlertMsg) {
        alertHistory.push(modalAlertMsg);
        emitLog(`[레이어 알림 감지] 🔔 "${modalAlertMsg}"`, 'warn', 'MODAL_ALERT');
        await surveyPage.waitForTimeout(350);
      }

      const info = await classifyCurrentScreen(activeTarget);
      if (info.screenType === 'LOADING') {
        await surveyPage.waitForTimeout(550);
        continue;
      }
      const sig = `${info.screenType}|${info.qNameAttr || ''}|${info.categoryName}|${info.progressPct}`;
      if (sig === lastSignature) {
        sameScreenStuckCount++;
        if (sameScreenStuckCount >= 5) {
          if (htmlInspectionDump) {
            const stuckDom = await activeTarget.evaluate(() => {
              const visQs = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null);
              const container = visQs[visQs.length - 1] || document.querySelector('#question, .question-wrap, main') || document.body;
              return {
                url: location.href,
                fullText: (document.body?.innerText || '').slice(0, 4000),
                outerHTML: (container?.outerHTML || '').slice(0, 45000)
              };
            }).catch(e => ({ err: e.message }));
            htmlInspectionDump.screens.push({
              stepIter,
              stalled: true,
              screenType: info.screenType,
              qNameAttr: info.qNameAttr,
              categoryName: info.categoryName,
              progressPct: info.progressPct,
              domMeta: info.domMeta,
              ...stuckDom
            });
          }
          throw new Error(
            `동일 화면 반복 정체 감지 (${sig}) | DOM=[${info.domMeta || '-'}] | URL=${surveyPage.url()} | 버튼=[${(info.buttonTexts || []).join(', ')}] | 요약="${(info.bodySnippet || '').slice(0, 150)}" — 최근 알림: ${alertHistory.slice(-2).join(' / ') || '없음'}`
          );
        }
      } else {
        sameScreenStuckCount = 0;
        lastSignature = sig;
        emitLog(
          `[화면 진입] ${info.screenType}${info.categoryName ? ` (${info.categoryName})` : ''}${info.qNameAttr ? ` [${info.qNameAttr}]` : ''} | 진행률=${info.progressPct ?? '-'}% | [${info.domMeta || '-'}]`,
          'info',
          'STEP'
        );

        if (htmlInspectionDump) {
          if (!htmlInspectionDump.windowSchema && info.screenType !== 'CAPI_LIST_PENDING') {
            htmlInspectionDump.windowSchema = await activeTarget.evaluate(() => {
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              document.body.appendChild(iframe);
              const baseKeys = new Set(Object.keys(iframe.contentWindow || {}));
              iframe.remove();

              const customKeys = Object.keys(window).filter(k =>
                !baseKeys.has(k) && !/^(\$|jQuery|webkit|moz|__)/i.test(k)
              );
              const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
              const snapshot = { customWindowKeys: customKeys, scriptSrcs, values: {} };
              const priorityKeys = ['Survey', 'Questions', 'Q', 'QO'].filter(k => customKeys.includes(k));
              for (const k of [...priorityKeys, ...customKeys.filter(x => !priorityKeys.includes(x))].slice(0, 25)) {
                const v = window[k];
                if (typeof v === 'function') {
                  snapshot.values[k] = `[Function: ${String(v).slice(0, 240)}]`;
                  continue;
                }
                try {
                  const s = JSON.stringify(v);
                  if (s && s.length <= 600000) snapshot.values[k] = JSON.parse(s);
                  else if (s) snapshot.values[k] = `[Large Object: ${s.length} chars] ` + s.slice(0, 15000);
                } catch (e) {
                  snapshot.values[k] = `[Unserializable: ${typeof v}]`;
                }
              }
              return snapshot;
            }).catch(e => ({ err: e.message }));
          }

          const templateKey = `${info.screenType}|${info.domMeta}`;
          const includeFullHtml = !seenHtmlTemplateKeys.has(templateKey) || info.screenType === 'GENERIC_STEP' || info.screenType === 'FINAL_SUBMIT_GATE';
          seenHtmlTemplateKeys.add(templateKey);

          const screenSnap = await activeTarget.evaluate(({ wantHtml }) => {
            const visQs = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null);
            const qBox = visQs[visQs.length - 1] || document.querySelector('#question, .question-box, main') || document.body;
            const controls = Array.from(
              document.querySelectorAll('input:not([type="hidden"]), select, textarea, .s-gradeclick')
            )
              .filter(el => el.offsetParent !== null)
              .slice(0, 80)
              .map(el => ({
                tag: el.tagName,
                type: el.type || (el.classList.contains('s-gradeclick') ? 's-gradeclick' : ''),
                name: el.name || '',
                qname: el.getAttribute('qname') || '',
                akey: el.getAttribute('akey') || '',
                vkey: el.getAttribute('vkey') || '',
                hkey: el.getAttribute('hkey') || '',
                disabled: Boolean(el.disabled),
                readOnly: Boolean(el.readOnly),
                label: (el.closest('label, tr, li, div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
                options: el.tagName === 'SELECT'
                  ? Array.from(el.options).slice(0, 12).map(o => `${o.value}:${o.text.trim()}`)
                  : undefined
              }));
            const inlineScripts = Array.from(qBox.querySelectorAll('script'))
              .map(s => (s.textContent || '').trim())
              .filter(Boolean)
              .join('\n---\n')
              .slice(0, 15000);
            return {
              url: location.href,
              qNameAttr: qBox.getAttribute?.('question-name') || qBox.getAttribute?.('qname') || '',
              qTypeAttr: qBox.getAttribute?.('question-type') || '',
              bodyText: (document.body?.innerText || '').replace(/[ \t]+/g, ' ').trim().slice(0, 2500),
              controls,
              inlineScripts: inlineScripts || undefined,
              outerHTML: wantHtml ? (qBox.outerHTML || '').slice(0, 35000) : undefined
            };
          }, { wantHtml: includeFullHtml }).catch(e => ({ err: e.message }));

          htmlInspectionDump.screens.push({
            stepIter,
            screenType: info.screenType,
            categoryName: info.categoryName,
            progressPct: info.progressPct,
            domMeta: info.domMeta,
            buttonTexts: info.buttonTexts,
            ...screenSnap
          });
        }
      }

      if (info.screenType === 'CAPI_LIST_PENDING') {
        const retryAction = await activeTarget.evaluate(() => {
          const marked = document.querySelector('[data-kbpi-target-start="1"]');
          if (marked) {
            const href = marked.getAttribute('href') || marked.closest('a')?.getAttribute('href') || '';
            const onclick = marked.getAttribute('onclick') || '';
            marked.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (typeof marked.click === 'function') marked.click();
            return { retried: true, tag: marked.tagName, href, onclick };
          }
          return { retried: false };
        }).catch(err => ({ retried: false, err: err.message }));
        emitLog(`[CAPI 리스트 대기 재시도] ${JSON.stringify(retryAction)} | URL=${surveyPage.url()}`, 'warn', 'SLOT_RETRY');
        await surveyPage.waitForTimeout(1200);
        continue;
      }

      if (info.screenType === 'SCREENED_OUT') {
        throw new Error(`설문 스크리닝/쿼터 중단 화면 도달 (${info.qNameAttr}): "${(info.bodySnippet || '').slice(0, 140)}"`);
      }

      if (info.screenType === 'COMPLETED') {
        emitLog(`[설문 최종 완료] #${seq} ${respondentName} (${uid}) 100% 완료 확인!`, 'info', 'DONE');
        return {
          success: true,
          completed: true,
          statusLabel: '완료',
          quotaStatus: 'completed',
          progress: '100%',
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [TITLE / DESC] 초기 조사 안내문
      if (info.screenType === 'INTRO_DESC') {
        emitLog('[안내문 통과] K-BPI 조사 안내 화면 [다음] 클릭...', 'info', 'INTRO');
        await clickNextButton(activeTarget);
        continue;
      }

      // [GP1] 현재 위치 확인
      if (info.screenType === 'GP1') {
        emitLog(`[GP1 위치 확인] ${gps.baseLabel} 기준 GPS(${gps.latitude}, ${gps.longitude}) 주입 및 [위치 확인] 클릭...`, 'info', 'GP1');
        const locBtn = activeTarget.locator('button:has-text("위치 확인"), a:has-text("위치 확인"), input[value*="위치 확인"], :text-is("위치 확인")').first();
        if ((await locBtn.count()) > 0) {
          await locBtn.click();
          for (let gWait = 0; gWait < 12; gWait++) {
            await surveyPage.waitForTimeout(350);
            const hasCoords = await activeTarget.evaluate(() => {
              const txt = document.body?.innerText || '';
              if (/위도\s*:\s*3\d\./.test(txt) || /37\.\d{3,}/.test(txt)) return true;
              return Array.from(document.querySelectorAll('[question-name="GP1"] input')).some(inp => /37\.\d+/.test(inp.value || ''));
            }).catch(() => false);
            if (hasCoords) break;
          }
        }
        await clickNextButton(activeTarget);
        continue;
      }

      // [WOKERD_DUP] 응답자 신상명세 등록 및 외부 DB [응답자 확인] AJAX 통과
      if (info.screenType === 'PROFILE') {
        emitLog(`[신상명세 등록] 이름=${respondentName}, 성별=${gender}, 만=${age}세, 연락처=${phone} (${phone.startsWith('010') ? '휴대폰' : '일반전화'})`, 'info', 'PROFILE');
        const profileResult = await activeTarget.evaluate(({ rName, rGender, rAge, rPhone }) => {
          const root = document.querySelector('[question-name="WOKERD_DUP"]') || document.querySelector('.worker-info-card')?.parentElement || document;
          if (typeof window.$ !== 'undefined') {
            const jqRoot = window.$(root);
            if (jqRoot.data('workerApiSaved') === true) {
              return { alreadySaved: true };
            }
          }

          const setField = (sel, val) => {
            const el = root.querySelector(sel);
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(el).val(String(val)).trigger('input').trigger('change');
            el.blur();
            return true;
          };

          setField('[custom-save-name="WORKER_NAME"], input[name="WORKER_NAME"], input[placeholder*="이름"]', rName);

          const wantGenderCode = String(rGender || '').startsWith('여') ? 'F' : 'M';
          const genderInp = root.querySelector(`input[custom-save-name="GENDER"][value="${wantGenderCode}"]`) ||
            Array.from(root.querySelectorAll('input[type="radio"]')).find(r => r.value === wantGenderCode);
          if (genderInp) {
            if (!genderInp.checked) genderInp.click();
            genderInp.checked = true;
            genderInp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(genderInp).prop('checked', true).trigger('change');
          }

          setField('[custom-save-name="AGE"], input[name="AGE"], input[placeholder*="숫자"]', rAge);

          const parts = String(rPhone || '').split('-').map(s => s.trim()).filter(Boolean);
          if (parts.length === 3) {
            if (parts[0] === '010') {
              setField('[custom-save-name="MOBILE_1"]', '010');
              setField('[custom-save-name="MOBILE_2"]', parts[1]);
              setField('[custom-save-name="MOBILE_3"]', parts[2]);
              setField('[custom-save-name="TEL_1"]', '');
              setField('[custom-save-name="TEL_2"]', '');
              setField('[custom-save-name="TEL_3"]', '');
            } else {
              setField('[custom-save-name="MOBILE_1"]', '');
              setField('[custom-save-name="MOBILE_2"]', '');
              setField('[custom-save-name="MOBILE_3"]', '');
              setField('[custom-save-name="TEL_1"]', parts[0]);
              setField('[custom-save-name="TEL_2"]', parts[1]);
              setField('[custom-save-name="TEL_3"]', parts[2]);
            }
          }

          const submitBtn = root.querySelector('.worker-api-submit');
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
            return { clickedSubmit: true };
          }
          return { clickedSubmit: false };
        }, { rName: respondentName, rGender: gender, rAge: age, rPhone: phone });

        if (profileResult.alreadySaved) {
          await clickNextButton(activeTarget);
          continue;
        }

        // WorkerCheck(IDENTITY -> CHECK) 비동기 응답 및 자동 페이지 전환 대기 (최대 16초)
        let workerErr = '';
        for (let wIdx = 0; wIdx < 32; wIdx++) {
          await surveyPage.waitForTimeout(500);
          const checkState = await activeTarget.evaluate(() => {
            const wBox = document.querySelector('[question-name="WOKERD_DUP"]');
            if (!wBox || wBox.offsetParent === null) {
              return { transitioned: true };
            }
            const jqSaved = (typeof window.$ !== 'undefined') ? Boolean(window.$(wBox).data('workerApiSaved')) : false;
            const resBox = wBox.querySelector('.worker-api-result');
            const resVisible = Boolean(resBox && resBox.offsetParent !== null && (resBox.innerText || '').trim());
            const isSuccess = Boolean(resBox && resBox.classList.contains('is-success'));
            const resMsg = resBox ? (resBox.innerText || '').replace(/\s+/g, ' ').trim() : '';
            const btnDisabled = Boolean(wBox.querySelector('.worker-api-submit')?.disabled);
            return { transitioned: false, jqSaved, resVisible, isSuccess, resMsg, btnDisabled };
          }).catch(() => ({ transitioned: true }));

          if (checkState.transitioned) break;
          if (checkState.jqSaved) {
            await surveyPage.waitForTimeout(350);
            await clickNextButton(activeTarget);
            break;
          }
          if (checkState.resVisible && !checkState.isSuccess && !checkState.btnDisabled && checkState.resMsg) {
            workerErr = checkState.resMsg;
            break;
          }
        }
        if (workerErr) {
          throw new Error(`[신상명세 등록 거부] #${seq} ${respondentName}(${phone}): ${workerErr}`);
        }
        continue;
      }

      // [SQ1] 광고회사/조사회사 종사 가족 유무 -> 2번 '없다' 선택
      if (info.screenType === 'SQ1') {
        emitLog('[SQ1 스크리닝] "없다(2)" 선택...', 'info', 'SQ1');
        await activeTarget.evaluate(() => {
          const sq1None = document.querySelector('input[qname="SQ1"][akey="2"]') ||
            Array.from(document.querySelectorAll('[question-name="SQ1"] input[type="radio"], input[type="radio"], input[type="checkbox"]'))
              .find(inp => !inp.disabled && /모두\s*없다|해당\s*없음|^없다$|^없음$/.test((inp.closest('label, li, tr, td, div')?.innerText || '').trim()));
          if (sq1None) {
            if (!sq1None.checked) sq1None.click();
            sq1None.checked = true;
            sq1None.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(sq1None).prop('checked', true).trigger('change');
          }
        });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [SQ2] 만 나이 입력 (15~59세)
      if (info.screenType === 'SQ2_AGE') {
        emitLog(`[SQ2 연령] 만 ${age}세 입력...`, 'info', 'SQ2');
        await activeTarget.evaluate(({ rAge }) => {
          const inp = document.querySelector('[question-name="SQ2"] input[data-column="NUMBER_1"], input[qname="SQ2"]') ||
            document.querySelector('[question-name="SQ2"] input:not([type="hidden"])');
          if (inp && !inp.disabled && !inp.readOnly) {
            inp.focus();
            inp.value = String(rAge);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(String(rAge)).trigger('input').trigger('change').trigger('keyup');
            inp.blur();
          }
        }, { rAge: age });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [SQ3] 성별 선택 (1: 남자 / 2: 여자)
      if (info.screenType === 'SQ3_GENDER') {
        const sq3Akey = gender.startsWith('여') ? '2' : '1';
        emitLog(`[SQ3 성별] "${gender}" (akey=${sq3Akey}) 선택...`, 'info', 'SQ3');
        await activeTarget.evaluate(({ ak }) => {
          const r = document.querySelector(`input[qname="SQ3"][akey="${ak}"]`) ||
            Array.from(document.querySelectorAll('[question-name="SQ3"] input[type="radio"]'))[ak === '2' ? 1 : 0];
          if (r && !r.disabled) {
            if (!r.checked) r.click();
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(r).prop('checked', true).trigger('change');
          }
        }, { ak: sq3Akey });
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [M_CHECK + INDUSTRY_ORDER] 조사지역·조사구·조사동 선택 및 배정 브랜드 할당 대기
      if (info.screenType === 'M_CHECK_REGION') {
        emitLog(`[조사지역 입력] 지역=${region}(코드:${cityCode}) · 조사구=${surveyDistrict} · 조사동=${surveyDong} 선택 및 브랜드 할당 대기...`, 'info', 'M_CHECK');
        await activeTarget.evaluate(async ({ cCode, sDist, sDong }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = document.querySelector('[question-name="M_CHECK"]') || document;
          const cityRadio = box.querySelector(`input[custom-save-name="ZQ1"][value="${cCode}"]`);
          if (cityRadio) {
            if (!cityRadio.checked) cityRadio.click();
            cityRadio.checked = true;
            cityRadio.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(cityRadio).prop('checked', true).trigger('change');
          }
          await waitMs(180);

          const distSel = box.querySelector('select[custom-save-name="ZQ2"]');
          if (distSel && !distSel.disabled) {
            const distOpt = Array.from(distSel.options).find(o => o.value === sDist || o.text.trim() === sDist) ||
              Array.from(distSel.options).find(o => o.value !== '');
            if (distOpt) {
              distSel.value = distOpt.value;
              distSel.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(distSel).val(distOpt.value).trigger('change');
            }
          }
          await waitMs(180);

          const dongSel = box.querySelector('select[custom-save-name="ZQ3"]');
          if (dongSel && !dongSel.disabled) {
            const dongOpt = Array.from(dongSel.options).find(o => o.value === sDong || o.text.trim() === sDong) ||
              Array.from(dongSel.options).find(o => o.value !== '');
            if (dongOpt) {
              dongSel.value = dongOpt.value;
              dongSel.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(dongSel).val(dongOpt.value).trigger('change');
            }
          }
        }, { cCode: cityCode, sDist: surveyDistrict, sDong: surveyDong });

        // INDUSTRY_ORDER(/Custom/230/KbpiContext) 비동기 할당 완료(ready === true)까지 최대 15초 대기
        const waitIndustryOrderReady = async () => {
          for (let iWait = 0; iWait < 30; iWait++) {
            const orderState = await activeTarget.evaluate(() => {
              const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
              if (!w || typeof window.$ === 'undefined') return { ready: true, pickerVisible: false };
              const jqW = window.$(w);
              const ready = Boolean(jqW.data('ready'));
              const err = String(jqW.data('error') || '');
              const pickerVisible = Boolean(w.querySelector('.kbpi-test-picker') && w.offsetParent !== null);
              return { ready, err, pickerVisible };
            }).catch(() => ({ ready: true, pickerVisible: false }));
            if (orderState.ready) return orderState;
            await surveyPage.waitForTimeout(450);
          }
          return { ready: true, pickerVisible: false };
        };

        const initOrderState = await waitIndustryOrderReady();

        // 만약 테스트 피커(.kbpi-test-picker)가 노출된 경우 동일 DISPLAY 품목 중복 체크 방지
        if (initOrderState.pickerVisible) {
          await activeTarget.evaluate(() => {
            const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
            if (!w) return;
            const seenLabels = new Set();
            w.querySelectorAll('.kbpi-test-picker input[type="checkbox"]').forEach(cb => {
              const lb = (cb.closest('label, li, div')?.innerText || '').replace(/브랜드$/g, '').trim();
              if (cb.checked && lb) {
                if (seenLabels.has(lb) && !cb.disabled) {
                  cb.click();
                  if (cb.checked) cb.checked = false;
                } else {
                  seenLabels.add(lb);
                }
              }
            });
          }).catch(err => console.warn('[K-BPI 테스트 피커 중복 점검 경고]', err.message));
        }

        // 신규 배정 시 동일 표시명(예: 구호개발단체 2건)이 중복 배정된 경우, 동일 조사구 내 다른 조사동으로 1회 재할당 요청 시도
        const firstAssigned = await extractAssignedIndustriesFromPage(activeTarget);
        const firstNames = firstAssigned.map(a => a.categoryName).filter(Boolean);
        if (firstNames.length > 0 && new Set(firstNames).size < firstNames.length) {
          const retriedDong = await activeTarget.evaluate(async () => {
            const box = document.querySelector('[question-name="M_CHECK"]') || document;
            const dongSel = box.querySelector('select[custom-save-name="ZQ3"]');
            if (!dongSel || dongSel.disabled) return '';
            const curVal = dongSel.value;
            const altOpt = Array.from(dongSel.options).find(o => o.value !== '' && o.value !== curVal && !/선택/.test(o.text));
            if (!altOpt) return '';
            const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
            if (w && typeof window.$ !== 'undefined') window.$(w).data('ready', false);
            dongSel.value = altOpt.value;
            dongSel.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(dongSel).val(altOpt.value).trigger('change');
            return altOpt.text.trim() || altOpt.value;
          }).catch(() => '');
          if (retriedDong) {
            emitLog(`[중복 출제품목 재할당 시도] 동일 품목명 중복 배정 감지 ➔ 조사동 "${retriedDong}"으로 KbpiContext 재요청...`, 'info', 'M_CHECK_DEDUP');
            await surveyPage.waitForTimeout(350);
            await waitIndustryOrderReady();
          }
        }

        await syncAssignedIndustriesOnce(activeTarget);
        await surveyPage.waitForTimeout(350);
        await clickNextButton(activeTarget);
        continue;
      }

      // [INDUSTRY_ORDER 비동기 자동 배정 대기 — KBPI_Q1_1 진입 및 서버 영구 저장 보장]
      if (info.screenType === 'ALLOCATING_INDUSTRIES') {
        emitLog('[업종 자동 배정 대기] KbpiContext 배정 결과 서버 저장 및 문항 1 진입 대기...', 'info', 'ALLOC');
        for (let iWait = 0; iWait < 25; iWait++) {
          const st = await activeTarget.evaluate(() => {
            const q1 = document.querySelector('[question-name^="KBPI_Q1_1--"]');
            if (q1 && q1.offsetParent !== null) return { movedToQ1: true, ready: true };
            const w = document.querySelector('div[question-name="INDUSTRY_ORDER"]');
            const ready = w && typeof window.$ !== 'undefined' ? Boolean(window.$(w).data('ready')) : false;
            return { movedToQ1: false, ready };
          }).catch(() => ({ movedToQ1: false, ready: false }));
          if (st.movedToQ1) break;
          if (st.ready && iWait >= 4) {
            await clickNextButton(activeTarget);
            break;
          }
          await surveyPage.waitForTimeout(350);
        }
        continue;
      }

      // [신상명세 등록 + 배정 브랜드 스캔 전용 정지 지점 (stopAtStep === 'SCAN_BRANDS')]
      // M_CHECK 통과 직후 Q1_UNAIDED(또는 이미 진행 중인 슬롯의 현재 화면)에서 배정된 전 품목(18~20개)을 추출하고 즉시 안전 정지!
      if (stopAtStep === 'SCAN_BRANDS') {
        await syncAssignedIndustriesOnce(activeTarget);
        const scannedItems = categoryConfigs.filter(c => c && c.categoryName);
        if (scannedItems.length === 0 && info.categoryName) {
          await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        }
        const finalScannedCount = categoryConfigs.filter(c => c && c.categoryName).length;
        const keepPrevPilot = slotData.quotaStatus === 'pilot_done' && /완료직전/.test(String(slotData.status || ''));
        const nextStatusLabel = keepPrevPilot ? slotData.status : '신상등록·스캔완료';
        const nextQuotaStatus = keepPrevPilot ? 'pilot_done' : 'scanned';

        emitLog(
          `✅ [신상명세 등록 & 브랜드 스캔 완료] #${seq} ${respondentName} (${surveyDistrict} ${surveyDong}) — 총 ${finalScannedCount}개 출제 브랜드 스캔 완료!`,
          'info',
          'SCAN_DONE'
        );
        return {
          success: true,
          scannedOnly: true,
          safetyStopped: true,
          stoppedAt: 'SCAN_BRANDS',
          scannedCount: finalScannedCount,
          statusLabel: nextStatusLabel,
          quotaStatus: nextQuotaStatus,
          progress: info.progressPct ? `${info.progressPct}%` : '12%',
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [문항 1] 1-1 ~ 1-4 비보조 인지도 (순차 언하이드 + 중복 브랜드 입력 100% 원천 차단 + 1-4 NOA 체크박스 지원)
      if (info.screenType === 'Q1_UNAIDED') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const candidatePool = Array.isArray(catState.allDistinctBrands) && catState.allDistinctBrands.length > 0
          ? catState.allDistinctBrands
          : catState.unaidedBrands;
        const fill4th = (rng() * 100) < Number(policy.unaided4thBrandRate ?? 35) && candidatePool.length >= 4;

        const q1Applied = await activeTarget.evaluate(async ({ pool, use4th }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const normKey = (s) => String(s || '')
            .replace(/브랜드$/g, '')
            .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
            .toLowerCase()
            .trim();
          const rootKey = (s) => {
            const clean = String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
            const tok = (clean.split(/\s+/)[0] || clean).toLowerCase();
            return normKey(tok.length >= 2 ? tok : clean);
          };

          const triggerVal = (el, val) => {
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof window.$ !== 'undefined') {
              window.$(el).val(String(val)).trigger('input').trigger('change').trigger('keyup');
            }
            el.blur();
            return true;
          };

          const uncheckNoa = (noaInp) => {
            if (noaInp && !noaInp.disabled && noaInp.checked) {
              noaInp.click();
              if (noaInp.checked) {
                noaInp.checked = false;
                if (typeof window.$ !== 'undefined') window.$(noaInp).prop('checked', false).trigger('change');
              }
            }
          };

          const checkNoa = (noaInp) => {
            if (noaInp && !noaInp.disabled && !noaInp.checked) {
              noaInp.click();
              noaInp.checked = true;
              noaInp.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(noaInp).prop('checked', true).trigger('change');
            }
          };

          const usedNorms = new Set();
          const usedRoots = new Set();
          const pickNextUniqueBrand = () => {
            // 1순위: 정규화명 & 모브랜드 모두 미사용
            for (const cand of pool) {
              const nk = normKey(cand);
              const rk = rootKey(cand);
              if (!nk || usedNorms.has(nk) || (rk && usedRoots.has(rk))) continue;
              usedNorms.add(nk);
              if (rk) usedRoots.add(rk);
              return cand;
            }
            // 2순위: 정규화명 미사용 (절대 동일 브랜드 중복 불가)
            for (const cand of pool) {
              const nk = normKey(cand);
              if (!nk || usedNorms.has(nk)) continue;
              usedNorms.add(nk);
              return cand;
            }
            return '';
          };

          const entered = [];
          const firstBox = document.querySelector('[question-name^="KBPI_Q1_1--"]');
          if (firstBox) {
            const indKey = (firstBox.getAttribute('question-name') || '').split('--')[1] || '';
            for (let n = 1; n <= 3; n++) {
              const qn = `KBPI_Q1_${n}--${indKey}`;
              const noa = document.querySelector(`input[name^="NOA_${qn}"], input.NOA[noa-qname="${qn}"]`);
              const inp = document.querySelector(`[question-name="${qn}"] input[data-column="TEXT_1"], input[qname="${qn}"]`);
              const brandVal = pickNextUniqueBrand();
              if (inp && brandVal) {
                uncheckNoa(noa);
                triggerVal(inp, brandVal);
                entered.push(brandVal);
                await waitMs(90);
              } else if (noa) {
                if (inp) triggerVal(inp, '');
                checkNoa(noa);
                entered.push('없음(NOA)');
              }
            }

            const qn4 = `KBPI_Q1_4--${indKey}`;
            const noa4 = document.querySelector(`input[name^="NOA_${qn4}"], input.NOA[noa-qname="${qn4}"]`);
            const inp4 = document.querySelector(`[question-name="${qn4}"] input[data-column="TEXT_1"], input[qname="${qn4}"]`);
            const brand4 = use4th ? pickNextUniqueBrand() : '';
            if (brand4 && inp4) {
              uncheckNoa(noa4);
              await waitMs(40);
              triggerVal(inp4, brand4);
              entered.push(brand4);
            } else if (inp4 || noa4) {
              if (inp4 && inp4.value) triggerVal(inp4, '');
              checkNoa(noa4);
              entered.push('없음(NOA)');
            }

            // 단일 KBPI_Q1 컨테이너 내부에 복수 TEXT 컬럼(TEXT_1, TEXT_2 등)이 배치된 변형 레이아웃 보완
            const extraQ1Inputs = Array.from(
              document.querySelectorAll('[question-name^="KBPI_Q1_"] input[type="text"], [question-name^="KBPI_Q1_"] input:not([type])')
            ).filter(el => el.offsetParent !== null && !el.readOnly && !el.disabled && !['checkbox', 'radio', 'hidden', 'button'].includes(el.type));
            const maxFill = use4th ? 4 : 3;
            let curFilled = entered.filter(v => v && v !== '없음(NOA)').length;
            for (const exInp of extraQ1Inputs) {
              if (curFilled >= maxFill) break;
              if (String(exInp.value || '').trim()) continue;
              const nextB = pickNextUniqueBrand();
              if (nextB && triggerVal(exInp, nextB)) {
                entered.push(nextB);
                curFilled++;
                await waitMs(60);
              }
            }
            return entered;
          }

          // 일반 텍스트 입력칸 폴백
          const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(inp => inp.offsetParent !== null && !inp.readOnly && !inp.disabled);
          for (let i = 0; i < Math.min(3, textInputs.length); i++) {
            const bVal = pickNextUniqueBrand();
            if (bVal) {
              triggerVal(textInputs[i], bVal);
              entered.push(bVal);
              await waitMs(80);
            }
          }
          const bVal4 = use4th ? pickNextUniqueBrand() : '';
          if (bVal4 && textInputs[3]) {
            triggerVal(textInputs[3], bVal4);
            entered.push(bVal4);
          } else {
            if (textInputs[3] && textInputs[3].value) triggerVal(textInputs[3], '');
            const noneCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
              .filter(cb => (cb.closest('label, div, td')?.innerText || '').trim().includes('없음') && !cb.disabled && (cb.offsetParent !== null || cb.closest('label, div')?.offsetParent !== null));
            const lastNoneCb = noneCheckboxes[noneCheckboxes.length - 1];
            checkNoa(lastNoneCb);
            entered.push('없음(NOA)');
          }
          return entered;
        }, { pool: candidatePool, use4th: fill4th });

        const actualUnaided = (q1Applied || []).filter(b => b && b !== '없음(NOA)');
        if (actualUnaided.length > 0) {
          catState.unaidedBrands = actualUnaided;
          if (categoryConfigs[catState.slotIndex]) {
            categoryConfigs[catState.slotIndex].q1Brands = actualUnaided;
          }
        }
        emitLog(`[${catState.categoryName} - 문항 1] 중복 검증 통과 ➔ [${(q1Applied || []).map((v, i) => `1-${i + 1}="${v}"`).join(', ')}]`, 'info', 'Q1');

        await surveyPage.waitForTimeout(550);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 2] 보조 인지도 (문항 1 응답값 포함 + 중복 없는 랜덤 2~4개 추가 선택 + 공식 브랜드 학습)
      if (info.screenType === 'Q2_AIDED') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const extraMin = Number(policy.aidedExtraMin ?? 2);
        const extraMax = Math.max(extraMin, Number(policy.aidedExtraMax ?? 4));
        const extraTargetCount = extraMin + Math.floor(rng() * (extraMax - extraMin + 1));

        const q2Result = await activeTarget.evaluate(({ unaidedList, addCount, randSeed }) => {
          const normKey = (s) => String(s || '')
            .replace(/브랜드$/g, '')
            .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
            .toLowerCase()
            .trim();
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q2--"]')).find(el => el.offsetParent !== null) || document;
          const checkboxes = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(cb =>
            !cb.disabled && (cb.offsetParent !== null || cb.closest('label, .s-check, .answer-unit-box, li, tr, div')?.offsetParent !== null)
          );
          const allOfficialLabels = [];
          const uncheckedNormal = [];
          const checkedNorms = new Set();
          const checkedLabels = [];

          const getCbLabel = (cb) => {
            const directLb = cb.closest('label');
            const forLb = cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null;
            const unitLb = cb.closest('.s-check, .answer-unit-box, li, tr, div');
            return ((directLb?.innerText || forLb?.innerText || unitLb?.innerText || '')).replace(/\s+/g, ' ').trim();
          };

          const setCbChecked = (cb) => {
            if (!cb.checked) cb.click();
            if (!cb.checked && cb.closest('label')) cb.closest('label').click();
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', true).trigger('change');
          };

          for (const cb of checkboxes) {
            const labelText = getCbLabel(cb);
            if (!labelText) continue;
            if (labelText === '없음' || labelText.includes('모름') || /^NOA_/i.test(cb.name || '')) {
              if (cb.checked && !cb.disabled) {
                cb.click();
                if (cb.checked) cb.checked = false;
                if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', false).trigger('change');
              }
              continue;
            }
            allOfficialLabels.push(labelText);
            const lbNorm = normKey(labelText);

            const matchesUnaided = unaidedList.some(u => {
              if (!u) return false;
              const uNorm = normKey(u);
              return labelText === u || labelText.includes(u) || u.includes(labelText) || (uNorm && lbNorm && (lbNorm.includes(uNorm) || uNorm.includes(lbNorm)));
            });
            if (cb.checked) {
              if (lbNorm) checkedNorms.add(lbNorm);
              checkedLabels.push(labelText);
            } else if (matchesUnaided && !checkedNorms.has(lbNorm)) {
              setCbChecked(cb);
              if (lbNorm) checkedNorms.add(lbNorm);
              checkedLabels.push(labelText);
            } else {
              uncheckedNormal.push({ cb, labelText, lbNorm });
            }
          }

          let s = randSeed || 777;
          for (let i = uncheckedNormal.length - 1; i > 0; i--) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            const j = s % (i + 1);
            [uncheckedNormal[i], uncheckedNormal[j]] = [uncheckedNormal[j], uncheckedNormal[i]];
          }

          const pickedExtra = [];
          for (const target of uncheckedNormal) {
            if (pickedExtra.length >= addCount) break;
            if (target.lbNorm && checkedNorms.has(target.lbNorm)) continue;
            setCbChecked(target.cb);
            if (target.lbNorm) checkedNorms.add(target.lbNorm);
            pickedExtra.push(target.labelText);
            checkedLabels.push(target.labelText);
          }

          // 최소 1개 이상 체크 보장
          if (checkedLabels.length === 0 && uncheckedNormal[0]) {
            setCbChecked(uncheckedNormal[0].cb);
            pickedExtra.push(uncheckedNormal[0].labelText);
            checkedLabels.push(uncheckedNormal[0].labelText);
          }

          return { allOfficialLabels, pickedExtra, checkedLabels };
        }, {
          unaidedList: catState.unaidedBrands,
          addCount: extraTargetCount,
          randSeed: Math.floor(rng() * 1000000)
        });

        if (Array.isArray(q2Result.checkedLabels) && q2Result.checkedLabels.length > 0) {
          catState.q2CheckedBrands = q2Result.checkedLabels;
        }
        if (q2Result.allOfficialLabels?.length >= 3) {
          saveLearnedCategoryBrands(catState.categoryName, q2Result.allOfficialLabels);
        }
        emitLog(`[${catState.categoryName} - 문항 2] 보조인지도 총 ${q2Result.checkedLabels?.length || 0}개 선택 (추가: [${q2Result.pickedExtra.join(', ')}])`, 'info', 'Q2');

        await surveyPage.waitForTimeout(500);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 3] 다중 브랜드 매트릭스 (상단 '평가항목' 브랜드 드롭다운 선행 선택 + 표준 13행/확장 16행 통합 정합성 엔진)
      if (info.screenType === 'Q3_MATRIX') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const freshCatAdjs = catState.adjectives.filter(w => !respondentUsedAdjectives.has(w));
        const reusedCatAdjs = catState.adjectives.filter(w => respondentUsedAdjectives.has(w));
        const uniqueAdjs = Array.from(new Set([
          ...freshCatAdjs,
          ...reusedCatAdjs,
          '신뢰가는', '믿음직함', '친숙하다', '깔끔함', '실용적인', '안정적인', '대중적인', '만족스러운'
        ]));

        const allPosReasons = Array.from(new Set([
          ...catState.posReasons,
          ...Q3_RECOMMEND_REASON_POOLS.positive
        ]));
        const uniquePosReasons = [
          ...allPosReasons.filter(r => !respondentUsedReasons.has(r)),
          ...allPosReasons.filter(r => respondentUsedReasons.has(r))
        ];

        const allNeuReasons = Array.from(new Set([
          ...catState.neuReasons,
          ...Q3_RECOMMEND_REASON_POOLS.neutral
        ]));
        const uniqueNeuReasons = [
          ...allNeuReasons.filter(r => !respondentUsedReasons.has(r)),
          ...allNeuReasons.filter(r => respondentUsedReasons.has(r))
        ];

        const brandAdjectiveLookup = {};
        for (const [bKey, bWords] of Object.entries(catState.brandAdjectives || {})) {
          if (!Array.isArray(bWords) || bWords.length === 0) continue;
          const shuffled = shuffleWithRng(bWords, rng);
          brandAdjectiveLookup[bKey] = [
            ...shuffled.filter(w => !respondentUsedAdjectives.has(w)),
            ...shuffled.filter(w => respondentUsedAdjectives.has(w))
          ];
        }

        const colPlans = [];
        for (let colIdx = 0; colIdx < 6; colIdx++) {
          let colHasExp;
          if (catState.purchaseExp === '없음') {
            colHasExp = false; // 구입경험 '없음' 지정 시 전 열 13번 '아니오' + 11번 태도 1·2·3번만 + 6-2번 3·4번만!
          } else if (colIdx === 0) {
            colHasExp = true;  // 구입경험 '있음' 시 1번 열은 100% '예'
          } else {
            colHasExp = rng() < 0.75;
          }
          const scorePlan = generateKbpiMatrixScores(rng, colHasExp, colIdx);
          const extraPool = colHasExp ? [3, 4, 4, 5, 4, 5] : [3, 3, 4, 3, 4, 5];
          const extendedScores = [...scorePlan.itemScores];
          for (let ex = 0; ex < 16; ex++) {
            extendedScores.push(extraPool[Math.floor(rng() * extraPool.length)]);
          }

          // 6-3) AI 검색경험: 품목 사전 결정값(catState.aiSearched)과 100% 일치 (예일 때 1열 필수 예, 아니오일 때 전 열 아니오)
          const aiSearchedCol = catState.aiSearched
            ? (colIdx === 0 ? true : (colIdx === 1 ? rng() < 0.35 : false))
            : false;

          // 6-2) 추천/피추천 경험(0-based index): 이용경험 없으면 [2(추천받음), 3(경험없음)]만 선택, 있으면 [0,1,2,3] 분산
          const rec27PosIdx = Math.floor(rng() * 4);
          const rec27NonUseIdx = rng() < 0.45 ? 2 : 3;

          colPlans.push({
            colIdx,
            hasPurchaseExp: colHasExp,
            aiSearchedCol,
            rec27PosIdx,
            rec27NonUseIdx,
            ...scorePlan,
            extendedScores,
            adjective: uniqueAdjs[colIdx] || `${uniqueAdjs[colIdx % uniqueAdjs.length]}`,
            posReason: uniquePosReasons[colIdx % uniquePosReasons.length] || '인지도가 높고 신뢰가 가서',
            neuReason: uniqueNeuReasons[colIdx % uniqueNeuReasons.length] || '무난하고 대중적이어서'
          });
        }

        // 1~3열 태도(11번)가 우연히 모두 같은 번호로 겹치면 보조열을 자연 분산
        if (colPlans.length >= 3 && colPlans[0].attitudeChoice === colPlans[1].attitudeChoice && colPlans[1].attitudeChoice === colPlans[2].attitudeChoice) {
          if (colPlans[1].hasPurchaseExp) {
            colPlans[1].attitudeChoice = colPlans[1].attitudeChoice === 4
              ? (colPlans[1].overallSatisfaction >= 5 ? 5 : 3)
              : 4;
          } else {
            colPlans[1].attitudeChoice = colPlans[1].attitudeChoice === 3 ? 2 : 3;
          }
        }

        const preferredHeaderBrands = Array.from(new Set([
          ...(catState.unaidedBrands || []),
          ...(catState.q2CheckedBrands || []),
          ...(catState.allDistinctBrands || [])
        ]));

        const matrixApplied = await activeTarget.evaluate(async ({
          plans,
          preferredBrands,
          brandAdjectivesMap,
          categoryAdjs,
          posReasonPool,
          neuReasonPool,
          priorUsedAdjs
        }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const normKey = (s) => String(s || '')
            .replace(/브랜드$/g, '')
            .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
            .toLowerCase()
            .trim();

          const triggerInput = (el, val) => {
            if (!el || el.disabled || el.readOnly) return false;
            el.focus();
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (typeof window.$ !== 'undefined') {
              window.$(el).val(String(val)).trigger('input').trigger('change').trigger('keyup');
            }
            el.blur();
            return true;
          };

          const setSelectVal = (sel, val) => {
            if (!sel || sel.disabled) return false;
            sel.focus();
            sel.value = String(val);
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') {
              window.$(sel).val(String(val)).trigger('input').trigger('change');
            }
            sel.blur();
            return true;
          };

          const setRadioChecked = (r) => {
            if (!r || r.disabled) return false;
            const lb = r.closest('label') || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null);
            if (!r.checked) {
              if (r.offsetParent !== null) r.click();
              else if (lb && lb.offsetParent !== null) lb.click();
              else r.click();
            }
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') {
              window.$(r).prop('checked', true).trigger('change');
            }
            return true;
          };

          const uncheckSkipCheckboxesInCell = (cell) => {
            cell.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              if (!cb.disabled && cb.checked) {
                cb.click();
                if (cb.checked) {
                  cb.checked = false;
                  if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', false).trigger('change');
                }
              }
            });
          };

          const findMatrixTables = () => {
            const allTables = Array.from(document.querySelectorAll('table')).filter(t =>
              t.offsetParent !== null && (t.querySelector('input, select, textarea') || /평가항목/.test(t.innerText || ''))
            );
            return allTables.filter(t => !allTables.some(other => other !== t && t.contains(other)));
          };

          let tables = findMatrixTables();
          if (tables.length === 0) return { ok: false, reason: '평가 테이블 미발견' };

          // 상단 '평가항목' 브랜드 헤더 행 판별기 (1)~13) 문항 본문 행과 100% 분리!)
          const isHeaderBrandRow = (tr) => {
            if (!tr) return false;
            if (tr.closest('thead')) return true;
            const txt = (tr.innerText || '').replace(/\s+/g, ' ').trim();
            if (/^\d{1,2}(?:-\d+)?\s*[).]/.test(txt)) return false;
            if (/이\s*브랜드|후원\s*노력|전반적으로\s*만족|추천할\s*의향|신뢰가\s*간다|떠오르는\s*이미지|평소\s*생각과\s*가장|경험이\s*있으십니까/.test(txt)) {
              return false;
            }
            return true;
          };

          const isPlaceholderOptText = (txt) => /^(선택|-\s*선택\s*-?|브랜드\s*선택|평가항목|--)$/i.test(String(txt || '').trim());

          // 화면 상단 '알고 계신 브랜드 : 월드비전, 굿네이버스, 초록우산 어린이재단' 안내 배너 파싱
          const bodyFullText = document.body?.innerText || '';
          const bannerMatch = bodyFullText.match(/알고\s*계신\s*브랜드\s*[:：]\s*([^\n\r]+)/);
          const bannerBrands = bannerMatch
            ? bannerMatch[1].split(/[,，·|/]+/).map(s => s.trim()).filter(Boolean)
            : [];
          const orderedBrandHints = [...bannerBrands, ...(Array.isArray(preferredBrands) ? preferredBrands : [])];

          // =========================================================================
          // [Phase 1] 상단 '평가항목' 브랜드 드롭다운(<select>) 순차 선택 (Image 2 완벽 대응!)
          // - 구호개발단체(NGO) 등 평가항목 헤더에서 브랜드를 먼저 선택해야 하위 1)~13) 셀이 생성·활성화되는 구조 처리
          // - 열 간 동일 브랜드 중복 선택 100% 금지 (usedHeaderVals + usedHeaderNorms 추적)
          // - 앞 열 선택 시 뒤 열(예: 3열) disabled가 해제되는 순차 잠금 구조를 위해 비동기 순차 대기 적용
          // =========================================================================
          let filledHeaderSel = 0;
          const usedHeaderVals = new Set();
          const usedHeaderNorms = new Set();
          const headerBrandByCol = [];

          for (let hPass = 0; hPass < 8; hPass++) {
            tables = findMatrixTables();
            const headerSelects = [];
            for (const tb of tables) {
              const allTrs = Array.from(tb.querySelectorAll('thead tr, tbody tr'));
              for (const tr of allTrs) {
                if (!isHeaderBrandRow(tr)) continue;
                Array.from(tr.querySelectorAll('select')).forEach(sel => {
                  if (sel.offsetParent !== null || sel.closest('th, td')?.offsetParent !== null) {
                    headerSelects.push(sel);
                  }
                });
              }
            }
            if (headerSelects.length === 0) break;

            // 이미 선택되어 있는 헤더 브랜드 수집 (중복 방지 기준선)
            headerSelects.forEach((sel, sIdx) => {
              const curOpt = sel.options[sel.selectedIndex];
              const curTxt = (curOpt?.text || '').trim();
              if (sel.value && curTxt && !isPlaceholderOptText(curTxt)) {
                usedHeaderVals.add(String(sel.value));
                const nk = normKey(curTxt);
                if (nk) usedHeaderNorms.add(nk);
                headerBrandByCol[sIdx] = curTxt;
              }
            });

            // 아직 선택되지 않은 첫 번째 활성 헤더 <select> 탐색
            const targetIdx = headerSelects.findIndex(sel => {
              if (sel.disabled) return false;
              const curOpt = sel.options[sel.selectedIndex];
              const curTxt = (curOpt?.text || '').trim();
              return !sel.value || isPlaceholderOptText(curTxt);
            });
            if (targetIdx < 0) break;

            const targetSel = headerSelects[targetIdx];
            const candidateOpts = Array.from(targetSel.options).filter(o => {
              const t = (o.text || '').trim();
              if (o.value === '' || !t || isPlaceholderOptText(t)) return false;
              if (/(^|\s)기타(\s|$)|모름/.test(t)) return false;
              return true;
            });

            const realBrandOpts = candidateOpts.filter(o => !/^(없음|해당\s*없음|더\s*이상\s*없음)$/.test((o.text || '').trim()));
            const noneOpts = candidateOpts.filter(o => /^(없음|해당\s*없음|더\s*이상\s*없음)$/.test((o.text || '').trim()));

            // 이미 앞 열에서 선택된 브랜드는 100% 배제!
            const unusedRealOpts = realBrandOpts.filter(o => {
              const nk = normKey(o.text);
              return !usedHeaderVals.has(String(o.value)) && (!nk || !usedHeaderNorms.has(nk));
            });

            let pickOpt = null;
            if (unusedRealOpts.length > 0) {
              for (const hint of orderedBrandHints) {
                const hNorm = normKey(hint);
                if (!hNorm) continue;
                const matched = unusedRealOpts.find(o => {
                  const oTxt = (o.text || '').trim();
                  const oNorm = normKey(oTxt);
                  return oTxt === hint || oNorm === hNorm || oTxt.includes(hint) || hint.includes(oTxt);
                });
                if (matched) {
                  pickOpt = matched;
                  break;
                }
              }
              if (!pickOpt) pickOpt = unusedRealOpts[0];
            } else if (noneOpts.length > 0) {
              pickOpt = noneOpts[0];
            }

            if (!pickOpt) break;

            setSelectVal(targetSel, pickOpt.value);
            const pickedTxt = (pickOpt.text || '').trim();
            usedHeaderVals.add(String(pickOpt.value));
            const pickedNorm = normKey(pickedTxt);
            if (pickedNorm && !/^(없음|해당없음|더이상없음)$/.test(pickedNorm)) {
              usedHeaderNorms.add(pickedNorm);
            }
            headerBrandByCol[targetIdx] = pickedTxt;
            filledHeaderSel++;

            // 헤더 브랜드 선택 직후 하위 1)~13) 평가 셀 동적 생성 및 다음 열 잠금 해제 대기
            await waitMs(230);
          }

          if (filledHeaderSel > 0) {
            await waitMs(260);
            tables = findMatrixTables();
          }

          // 상단 평가 브랜드 열 헤더 이름 파악 (헤더 드롭다운 선택값 최우선 + hidden/숫자코드 배제 고정 텍스트/인풋 병합)
          const isValidHeaderBrandLabel = (txt) => {
            const s = String(txt || '').trim();
            if (!s || s.length > 40 || isPlaceholderOptText(s)) return false;
            if (/평가항목|^(항목|구분|문항|\d+)$/.test(s)) return false;
            return true;
          };
          const colBrandNames = headerBrandByCol.filter(b => b && !/^(없음|해당\s*없음|더\s*이상\s*없음|선택)$/.test(b) && isValidHeaderBrandLabel(b));
          if (colBrandNames.length === 0) {
            tables.forEach(tb => {
              tb.querySelectorAll('thead select, thead input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), thead div, thead th, thead td, tbody tr:first-child select, tbody tr:first-child input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), tbody tr:first-child td').forEach(el => {
                const tr = el.closest('tr');
                if (!isHeaderBrandRow(tr)) return;
                let v = '';
                if (el.tagName === 'SELECT') {
                  v = (el.options[el.selectedIndex]?.text || '').trim();
                } else if (el.tagName === 'INPUT') {
                  v = (el.value || '').trim();
                } else {
                  v = (el.innerText || '').trim();
                }
                if (isValidHeaderBrandLabel(v) && colBrandNames.length < 6) {
                  if (!colBrandNames.includes(v)) colBrandNames.push(v);
                }
              });
            });
          }

          const enteredScoresByCol = [[], [], [], [], [], []];
          const lastScoreByCol = [4, 4, 4, 4, 4, 4];
          const colActualHasExp = [null, null, null, null, null, null];
          const priorUsedSet = new Set(Array.isArray(priorUsedAdjs) ? priorUsedAdjs : []);
          const usedMatrixAdjs = new Set();
          const assignedAdjByCol = [];
          const usedMatrixReasons = new Set();
          const assignedReasonByCol = [];
          const chosenAttitudeIdxByCol = [];
          let filledTxt = 0;
          let filledSel = filledHeaderSel;
          let filledRad = 0;
          let processedRows = 0;

          const pickColBrandAdjective = (colIdx, fallbackAdj = '친숙하다') => {
            if (assignedAdjByCol[colIdx]) return assignedAdjByCol[colIdx];
            const brandRaw = String(headerBrandByCol[colIdx] || colBrandNames[colIdx] || '').trim();
            const brandNorm = normKey(brandRaw);
            let matchedBrandPool = [];

            if (brandRaw && brandAdjectivesMap && typeof brandAdjectivesMap === 'object') {
              if (Array.isArray(brandAdjectivesMap[brandRaw])) {
                matchedBrandPool = brandAdjectivesMap[brandRaw];
              } else if (brandNorm) {
                const entries = Object.entries(brandAdjectivesMap);
                const exact = entries.find(([k]) => normKey(k) === brandNorm);
                if (exact && Array.isArray(exact[1])) {
                  matchedBrandPool = exact[1];
                } else {
                  const partial = entries
                    .filter(([k]) => {
                      const kn = normKey(k);
                      return kn.length >= 2 && (brandNorm.includes(kn) || kn.includes(brandNorm));
                    })
                    .sort((a, b) => b[0].length - a[0].length)[0];
                  if (partial && Array.isArray(partial[1])) {
                    matchedBrandPool = partial[1];
                  }
                }
              }
            }

            const candidates = Array.from(new Set([
              ...matchedBrandPool,
              ...(Array.isArray(categoryAdjs) ? categoryAdjs : []),
              fallbackAdj
            ].map(s => String(s || '').trim()).filter(Boolean)));

            const chosen =
              candidates.find(w => !usedMatrixAdjs.has(w) && !priorUsedSet.has(w)) ||
              candidates.find(w => !usedMatrixAdjs.has(w)) ||
              candidates[0] ||
              fallbackAdj;

            usedMatrixAdjs.add(chosen);
            assignedAdjByCol[colIdx] = chosen;
            return chosen;
          };

          const pickColReasonText = (colIdx, isPositive, fallbackReason) => {
            if (assignedReasonByCol[colIdx]) return assignedReasonByCol[colIdx];
            const pool = isPositive
              ? (Array.isArray(posReasonPool) ? posReasonPool : [])
              : (Array.isArray(neuReasonPool) ? neuReasonPool : []);
            const candidates = Array.from(new Set([fallbackReason, ...pool].map(s => String(s || '').trim()).filter(Boolean)));
            const chosen = candidates.find(r => !usedMatrixReasons.has(r)) || candidates[0] || fallbackReason;
            usedMatrixReasons.add(chosen);
            assignedReasonByCol[colIdx] = chosen;
            return chosen;
          };

          // =========================================================================
          // [Phase 2] 본문 1)~13) / 6-1~6-3 평가 행 정밀 기입 (동적 언하이드 행 2회 패스 지원)
          // =========================================================================
          const fillBodyRowsPass = (isRetryPass = false) => {
            for (const tb of tables) {
              const trs = Array.from(tb.querySelectorAll('tbody tr')).filter(tr => tr.offsetParent !== null);
              for (const tr of trs) {
                if (isHeaderBrandRow(tr)) {
                  // 헤더 행의 고정 input 브랜드명만 보조 수집하고 덮어쓰기 절대 금지! (hidden 숫자코드 배제)
                  if (!isRetryPass && colBrandNames.length === 0) {
                    tr.querySelectorAll('td, th').forEach(td => {
                      const hdrInp = td.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])');
                      const hdrSel = td.querySelector('select');
                      const bv = (hdrSel ? (hdrSel.options[hdrSel.selectedIndex]?.text || '') : (hdrInp?.value || td.innerText || '')).trim();
                      if (isValidHeaderBrandLabel(bv) && !colBrandNames.includes(bv) && colBrandNames.length < 6) {
                        colBrandNames.push(bv);
                      }
                    });
                  }
                  continue;
                }

                const dataCells = Array.from(tr.querySelectorAll('td, th')).filter(cell => {
                  if (cell.offsetParent === null) return false;
                  return Boolean(
                    cell.querySelector(
                      'select:not(:disabled), textarea:not(:disabled):not([readonly]), input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled), input[type="number"]:not(:disabled):not([readonly]), input[type="text"]:not(:disabled):not([readonly]), input:not([type]):not(:disabled):not([readonly])'
                    )
                  );
                });
                if (dataCells.length === 0) continue;

                const firstCell = tr.querySelector('th, td');
                const rowTitle = ((firstCell && !dataCells.includes(firstCell) ? firstCell.innerText : tr.innerText) || '')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (!rowTitle || /^평가항목(\s+[1-6])*$/.test(rowTitle)) continue;

                if (!isRetryPass) processedRows++;
                const isOverallSatRow = /전반적으로\s*만족|전반적\s*만족/.test(rowTitle);
                const isReasonWordRow = /\b6-1\s*\)|점수를\s*주신\s*이유|이유는\s*무엇/.test(rowTitle);
                const isRecExpRow = /\b6-2\s*\)|추천하거나.*추천\s*받은/.test(rowTitle);
                const isAiExpRow = /\b6-3\s*\)|생성형\s*AI/.test(rowTitle);
                const isAttitudeRow11 = /(^|\s)11\s*\)|평소.*생각|선호\s*태도|편익.*동의/.test(rowTitle);
                const isImageWordRow = /(^|\s)12\s*\)|(^|\s)6\s*\)\s*떠오르는|떠오르는\s*이미지|형용사|단어|연상|생각나는\s*이미지/.test(rowTitle);
                const isExpRow = /(^|\s)13\s*\)|이용\/구입해\s*보신|구입해\s*보신|이용해\s*보신|방문해\s*보신|후원을?\s*하신|후원\/이용해\s*본|진료/.test(rowTitle);
                const isNegativeRow = /전환|이탈|불만|피해|부작용|중단/.test(rowTitle);

                dataCells.forEach((td, cIdx) => {
                  const plan = plans[cIdx] || plans[0];
                  if (!plan) return;
                  const safeCol = Math.min(cIdx, enteredScoresByCol.length - 1);
                  const colBucket = enteredScoresByCol[safeCol];

                  // 1) <select> 드롭다운 셀 (11번 평소 태도 등)
                  const sel = td.querySelector('select:not(:disabled)');
                  if (sel && (sel.offsetParent !== null || td.offsetParent !== null)) {
                    const curOptTxt = (sel.options[sel.selectedIndex]?.text || '').trim();
                    if (isRetryPass && sel.value && !isPlaceholderOptText(curOptTxt)) return;
                    const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !isPlaceholderOptText(o.text));
                    if (validOpts.length > 0) {
                      let choiceIdx = plan.attitudeChoice - 1;
                      const dynAvg = colBucket.length > 0
                        ? Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length)
                        : (plan.overallSatisfaction || 4);
                      if (!plan.hasPurchaseExp) {
                        choiceIdx = Math.min(2, Math.max(0, choiceIdx)); // 구입경험 없음: 절대 4·5번(idx 3,4) 선택 금지!
                      } else if (cIdx === 0) {
                        if (dynAvg >= 4 && choiceIdx < 3) choiceIdx = 3;
                        else if (dynAvg <= 3 && choiceIdx >= 3) choiceIdx = 2;
                      } else {
                        // 보조 열(cIdx >= 1): 구입경험이 있더라도 3번(가치 있는)·4번(흔히 구입)·5번(선호하는) 자연 분산 허용!
                        if (dynAvg >= 4 && choiceIdx < 2) choiceIdx = 2;
                        else if (dynAvg <= 3 && choiceIdx >= 3) choiceIdx = 2;
                      }
                      // 앞선 모든 열과 완전히 동일한 태도 번호가 연속되면(예: 전 열 '내가 흔히 구입/이용하는') 보조열 분산 보정
                      if (cIdx >= 2 && chosenAttitudeIdxByCol.slice(0, cIdx).length >= 2 && chosenAttitudeIdxByCol.slice(0, cIdx).every(v => v === choiceIdx)) {
                        if (!plan.hasPurchaseExp) {
                          choiceIdx = choiceIdx === 2 ? 1 : 2;
                        } else {
                          choiceIdx = choiceIdx === 3 ? (dynAvg >= 5 ? 4 : 2) : 3;
                        }
                      }
                      chosenAttitudeIdxByCol[cIdx] = choiceIdx;
                      const targetOpt = validOpts[Math.max(0, Math.min(validOpts.length - 1, choiceIdx))] || validOpts[0];
                      if (setSelectVal(sel, targetOpt.value)) filledSel++;
                    }
                    return;
                  }

                  // 2) 텍스트 / 숫자 입력 셀 (점수 평가, 6-1 추천사유 단답형, 10 전반적만족도, 11 태도, 12 연상이미지)
                  const txtInp = Array.from(
                    td.querySelectorAll('textarea, input[type="number"], input[type="text"], input:not([type])')
                  ).find(inp => (inp.offsetParent !== null || td.offsetParent !== null) && !inp.disabled && !inp.readOnly && !['radio', 'checkbox', 'hidden', 'button', 'submit'].includes(inp.type));

                  if (txtInp) {
                    if (isRetryPass && String(txtInp.value || '').trim() !== '') return;
                    uncheckSkipCheckboxesInCell(td);
                    if (isReasonWordRow) {
                      const prevRecScore = lastScoreByCol[safeCol] || 4;
                      const isPos = prevRecScore >= 4;
                      const reasonText = pickColReasonText(safeCol, isPos, isPos ? plan.posReason : plan.neuReason);
                      if (triggerInput(txtInp, reasonText)) filledTxt++;
                    } else if (isImageWordRow) {
                      const adjText = pickColBrandAdjective(safeCol, plan.adjective);
                      if (triggerInput(txtInp, adjText)) filledTxt++;
                    } else if (isAttitudeRow11 && !plan.hasPurchaseExp) {
                      const cappedAtt = Math.min(3, Math.max(1, Number(plan.attitudeChoice || 2)));
                      if (triggerInput(txtInp, cappedAtt)) filledTxt++;
                    } else if (isOverallSatRow) {
                      const avgScore = colBucket.length > 0
                        ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length)))
                        : plan.overallSatisfaction;
                      if (triggerInput(txtInp, avgScore)) filledTxt++;
                    } else {
                      const sIdx = colBucket.length;
                      let scoreVal = plan.extendedScores[sIdx % plan.extendedScores.length];
                      if (sIdx >= 2 && colBucket.every(v => v === scoreVal)) {
                        scoreVal = scoreVal === 4 ? 5 : 4;
                      }
                      colBucket.push(scoreVal);
                      lastScoreByCol[safeCol] = scoreVal;
                      if (triggerInput(txtInp, scoreVal)) filledTxt++;
                    }
                    return;
                  }

                  // 3) 라디오 버튼 셀 (6-2 추천경험 4지선다 / 6-3 AI검색 예·아니오 / 11번 태도 5지선다 / 13번 이용·후원경험 예·아니오 / 5점척도)
                  const cellRadios = Array.from(td.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
                  if (cellRadios.length > 0) {
                    const byName = new Map();
                    cellRadios.forEach(r => {
                      const k = r.name || '__cell_radio__';
                      if (!byName.has(k)) byName.set(k, []);
                      byName.get(k).push(r);
                    });

                    for (const [rName, grp] of byName.entries()) {
                      if (isRetryPass && grp.some(r => r.checked)) continue;
                      if (grp.length >= 5) {
                        const sIdx = colBucket.length;
                        let scoreVal;
                        if (isAttitudeRow11) {
                          scoreVal = !plan.hasPurchaseExp
                            ? Math.min(3, Math.max(1, Number(plan.attitudeChoice || 2)))
                            : Math.min(5, Math.max(3, Number(plan.attitudeChoice || 4)));
                        } else if (isOverallSatRow) {
                          scoreVal = colBucket.length > 0
                            ? Math.max(3, Math.min(5, Math.round(colBucket.reduce((a, b) => a + b, 0) / colBucket.length)))
                            : plan.overallSatisfaction;
                        } else {
                          scoreVal = plan.extendedScores[sIdx % plan.extendedScores.length];
                          if (sIdx >= 2 && colBucket.every(v => v === scoreVal)) {
                            scoreVal = scoreVal === 4 ? 5 : 4;
                          }
                          colBucket.push(scoreVal);
                          lastScoreByCol[safeCol] = scoreVal;
                        }
                        const pickR = grp.find(r => String(r.value) === String(scoreVal) || String(r.getAttribute('akey') || '') === String(scoreVal)) || grp[Math.min(grp.length - 1, scoreVal - 1)];
                        if (setRadioChecked(pickR)) filledRad++;
                      } else if (isRecExpRow || /_REC\d+$/i.test(rName) || grp.length === 4) {
                        const usePositiveRec = plan.hasPurchaseExp && (lastScoreByCol[safeCol] || 4) >= 4;
                        const targetIdx = usePositiveRec ? plan.rec27PosIdx : plan.rec27NonUseIdx;
                        const pickR = grp[Math.max(0, Math.min(grp.length - 1, targetIdx))] || grp[grp.length - 1];
                        if (setRadioChecked(pickR)) filledRad++;
                      } else if (isAiExpRow || /_AI\d+$/i.test(rName)) {
                        const wantLabel = plan.aiSearchedCol ? /^(예|있다|있음)$/ : /^(아니오|아니요|없다|없음)$/;
                        const byLb = grp.find(r => wantLabel.test((r.closest('label, span, div')?.innerText || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText : '') || '').trim()));
                        const fallbackR = plan.aiSearchedCol ? grp[0] : grp[grp.length - 1];
                        if (setRadioChecked(byLb || fallbackR)) filledRad++;
                      } else {
                        const wantPositive = isNegativeRow ? false : (isExpRow ? plan.hasPurchaseExp : plan.hasPurchaseExp);
                        const wantLabel = wantPositive ? /^(예|있다|있음|그렇다)$/ : /^(아니오|아니요|없다|없음|아니다)$/;
                        const byLb = grp.find(r => {
                          const lbTxt = (r.closest('label, span, div')?.innerText || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText : '') || '').trim();
                          return wantLabel.test(lbTxt);
                        });
                        const fallbackR = wantPositive ? grp[0] : grp[grp.length - 1];
                        if (setRadioChecked(byLb || fallbackR)) {
                          filledRad++;
                          if (isExpRow) colActualHasExp[safeCol] = wantPositive;
                        }
                      }
                    }
                    return;
                  }

                  // 4) 단독 체크박스 셀
                  const cellCbs = Array.from(td.querySelectorAll('input[type="checkbox"]'))
                    .filter(cb => !cb.disabled && (cb.offsetParent !== null || td.offsetParent !== null));
                  if (cellCbs.length > 0 && !cellCbs.some(cb => cb.checked)) {
                    const validCb = cellCbs.find(cb => !/없음|모름|기타/.test((cb.closest('label, span, div')?.innerText || '').trim())) || cellCbs[0];
                    if (validCb && !validCb.checked) {
                      validCb.click();
                      validCb.checked = true;
                      if (typeof window.$ !== 'undefined') window.$(validCb).prop('checked', true).trigger('change');
                    }
                  }
                });
              }
            }
          };

          fillBodyRowsPass(false);
          await waitMs(160);
          tables = findMatrixTables();
          fillBodyRowsPass(true);

          // [Phase 3] 테이블 외부 또는 누락된 필수 컨트롤 최종 스윕 (헤더 드롭다운 중복 방지 유지!)
          document.querySelectorAll('select:not(:disabled)').forEach((sel, idx) => {
            if (sel.offsetParent === null && sel.closest('th, td, div')?.offsetParent === null) return;
            const curTxt = (sel.options[sel.selectedIndex]?.text || '').trim();
            if (sel.value && curTxt && !isPlaceholderOptText(curTxt)) return;

            const inHeader = isHeaderBrandRow(sel.closest('tr'));
            const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !isPlaceholderOptText(o.text) && !/(^|\s)기타(\s|$)|모름/.test(o.text));
            if (validOpts.length === 0) return;

            let targetOpt = null;
            if (inHeader) {
              targetOpt = validOpts.find(o => !usedHeaderVals.has(String(o.value)) && !usedHeaderNorms.has(normKey(o.text))) || validOpts[0];
              if (targetOpt) {
                usedHeaderVals.add(String(targetOpt.value));
                const nk = normKey(targetOpt.text);
                if (nk) usedHeaderNorms.add(nk);
              }
            } else {
              const plan = plans[idx % plans.length] || plans[0];
              const safeIdx = plan.hasPurchaseExp ? (plan.attitudeChoice - 1) : Math.min(2, plan.attitudeChoice - 1);
              targetOpt = validOpts[Math.max(0, Math.min(validOpts.length - 1, safeIdx))] || validOpts[0];
            }
            if (targetOpt && setSelectVal(sel, targetOpt.value)) {
              filledSel++;
            }
          });

          const allVisibleRadios = Array.from(document.querySelectorAll('input[type="radio"]:not(:disabled)'))
            .filter(r => r.offsetParent !== null || r.closest('td, div, label')?.offsetParent !== null);
          const globalRadioGroups = new Map();
          allVisibleRadios.forEach(r => {
            if (!r.name) return;
            if (!globalRadioGroups.has(r.name)) globalRadioGroups.set(r.name, []);
            globalRadioGroups.get(r.name).push(r);
          });
          let gIdx = 0;
          for (const grp of globalRadioGroups.values()) {
            if (!grp.some(r => r.checked) && grp.length > 0) {
              const plan = plans[gIdx % plans.length] || plans[0];
              const pick = grp.length >= 5
                ? (grp[Math.min(grp.length - 1, (plan.overallSatisfaction || 4) - 1)] || grp[0])
                : (plan.hasPurchaseExp ? grp[0] : grp[grp.length - 1]);
              if (setRadioChecked(pick)) filledRad++;
            }
            gIdx++;
          }

          const usedFallbackWords = new Set(usedMatrixAdjs);
          document.querySelectorAll('textarea, input[type="number"], input[type="text"], input:not([type])').forEach((inp, idx) => {
            if (inp.offsetParent === null || inp.disabled || inp.readOnly) return;
            if (['radio', 'checkbox', 'hidden', 'button', 'submit', 'reset', 'file'].includes(inp.type)) return;
            if (inp.classList.contains('input-etc') || /etc/i.test(inp.name || '') || /기타/.test((inp.closest('label, li, span')?.innerText || ''))) return;
            if (String(inp.value || '').trim() !== '') return;
            const trTxt = (inp.closest('tr, div')?.innerText || '').trim();
            const colGuess = idx % plans.length;
            const plan = plans[colGuess] || plans[0];
            let val = /6-1|이유/.test(trTxt)
              ? pickColReasonText(colGuess, true, plan.posReason)
              : (/이미지|형용사|단어/.test(trTxt) ? pickColBrandAdjective(colGuess, plan.adjective) : plan.overallSatisfaction);
            if (typeof val === 'string' && usedFallbackWords.has(val) && !/이미지|형용사|단어/.test(trTxt)) {
              val = `${val} 느낌`;
            }
            if (typeof val === 'string') usedFallbackWords.add(val);
            if (triggerInput(inp, val)) filledTxt++;
          });

          const emptyControls = Array.from(document.querySelectorAll('input:not([type="hidden"]):not(:disabled):not([readonly]), select:not(:disabled), textarea:not(:disabled)'))
            .filter(el => {
              if (el.offsetParent === null && el.closest('td, th, label')?.offsetParent === null) return false;
              if (el.classList.contains('input-etc') || /etc/i.test(el.name || '')) return false;
              if (el.type === 'radio') return !globalRadioGroups.get(el.name)?.some(x => x.checked);
              if (el.type === 'checkbox') return false;
              if (el.tagName === 'SELECT') {
                const t = (el.options[el.selectedIndex]?.text || '').trim();
                return !el.value || isPlaceholderOptText(t);
              }
              return String(el.value || '').trim() === '';
            })
            .slice(0, 5)
            .map(el => `${el.tagName}[name=${el.name || el.id || '-'}]`);

          return {
            ok: true,
            filledHeaderSel,
            colBrandNames,
            colActualHasExp,
            pickedAdjectives: assignedAdjByCol.filter(Boolean),
            pickedReasons: assignedReasonByCol.filter(Boolean),
            rowCount: processedRows,
            filledTxt,
            filledSel,
            filledRad,
            emptyControls
          };
        }, {
          plans: colPlans,
          preferredBrands: preferredHeaderBrands,
          brandAdjectivesMap: brandAdjectiveLookup,
          categoryAdjs: uniqueAdjs,
          posReasonPool: uniquePosReasons,
          neuReasonPool: uniqueNeuReasons,
          priorUsedAdjs: Array.from(respondentUsedAdjectives)
        });

        for (const usedAdj of (matrixApplied.pickedAdjectives || [])) {
          if (usedAdj) respondentUsedAdjectives.add(usedAdj);
        }
        for (const usedRsn of (matrixApplied.pickedReasons || [])) {
          if (usedRsn) respondentUsedReasons.add(usedRsn);
        }

        if (categoryConfigs[catState.slotIndex] && Array.isArray(matrixApplied.pickedAdjectives) && matrixApplied.pickedAdjectives.length > 0) {
          const fallbackBrands = [...(catState.unaidedBrands || []), ...(catState.q2CheckedBrands || [])];
          categoryConfigs[catState.slotIndex].q3Adjectives = matrixApplied.pickedAdjectives;
          categoryConfigs[catState.slotIndex].q3Cols = matrixApplied.pickedAdjectives.map((adj, cIdx) => ({
            col: cIdx + 1,
            brand: matrixApplied.colBrandNames?.[cIdx] || fallbackBrands[cIdx] || '',
            adjective: adj
          }));
        }

        if (Array.isArray(matrixApplied.colBrandNames) && matrixApplied.colBrandNames.length > 0 && catState.purchaseExp === '있음') {
          const expColIdx = Array.isArray(matrixApplied.colActualHasExp)
            ? matrixApplied.colActualHasExp.findIndex(v => v === true)
            : 0;
          const pickedBrand = matrixApplied.colBrandNames[expColIdx >= 0 ? expColIdx : 0] || matrixApplied.colBrandNames[0];
          if (pickedBrand) {
            catState.q4SelectedBrand = pickedBrand;
            categoryConfigs[catState.slotIndex].topBrand = pickedBrand;
          }
        }

        emitLog(
          `[${catState.categoryName} - 문항 3] 평가 완료 (${matrixApplied.filledHeaderSel ? `평가항목브랜드선택=${matrixApplied.filledHeaderSel}열([${(matrixApplied.colBrandNames || []).join(', ')}]), ` : ''}${matrixApplied.pickedAdjectives?.length ? `이미지=[${matrixApplied.pickedAdjectives.join(', ')}], ` : ''}행=${matrixApplied.rowCount}, 입력=${matrixApplied.filledTxt}, 선택=${matrixApplied.filledSel}, 라디오=${matrixApplied.filledRad}${matrixApplied.emptyControls?.length ? `, 미입력=${matrixApplied.emptyControls.join(',')}` : ''})`,
          'info',
          'Q3'
        );

        await surveyPage.waitForTimeout(600);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4] 가장 최근에 구입/이용한 브랜드 (GetData ControlsV2 스킨·분류이동 라디오·비활성 보기 완벽 대응)
      if (info.screenType === 'Q4_RECENT_BRAND') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);

        if (stopAtStep === 'Q4') {
          emitLog(
            `🛑 [파일럿 문항 4 안전 정지] #${seq} ${respondentName} — "${catState.categoryName}" 품목의 문항 4 화면에 도달하여 설정된 정지 옵션에 따라 대기합니다.`,
            'info',
            'Q4_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'Q4',
            statusLabel: '문항4 대기(파일럿)',
            quotaStatus: 'q4_wait',
            progress: info.progressPct ? `${info.progressPct}%` : '4%',
            categoryConfigs,
            gps,
            surveyDistrict,
            surveyDong
          };
        }

        const pickedQ4 = await activeTarget.evaluate(({ targetBrand, isNone }) => {
          const normKey = (s) => String(s || '')
            .replace(/브랜드$/g, '')
            .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
            .toLowerCase()
            .trim();
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q4--"]')).find(el => el.offsetParent !== null) || document;

          const getRadioMeta = (r) => {
            const directLabel = r.closest('label');
            const forLabel = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
            const unitBox = r.closest('.answer-unit-box, .s-radio, li, tr');
            const isVis = r.offsetParent !== null ||
              directLabel?.offsetParent !== null ||
              forLabel?.offsetParent !== null ||
              unitBox?.offsetParent !== null;
            const isDis = Boolean(
              r.disabled ||
              r.getAttribute('aria-disabled') === 'true' ||
              directLabel?.classList.contains('disabled') ||
              forLabel?.classList.contains('disabled') ||
              unitBox?.classList.contains('disabled')
            );
            const spanTxt = (directLabel?.querySelector('.radio-value')?.innerText || forLabel?.querySelector('.radio-value')?.innerText || '').trim();
            const rawTxt = spanTxt || (forLabel?.innerText || directLabel?.innerText || unitBox?.innerText || '').replace(/\s+/g, ' ').trim();
            const akey = String(r.getAttribute('akey') || r.value || '').trim();
            const isNoneOpt = akey === '99' || akey === '999' || /^(없음|해당\s*없음|구입.*없음|이용.*없음)$/.test(rawTxt);
            return { r, directLabel, forLabel, isVis, isDis, label: rawTxt, norm: normKey(rawTxt), akey, isNoneOpt };
          };

          const allCandidates = Array.from(visQBox.querySelectorAll('input[type="radio"]'))
            .map(getRadioMeta)
            .filter(m => m.isVis && !m.isDis);

          if (allCandidates.length === 0) {
            return { ok: false, label: '', akey: '' };
          }

          const targetNorm = normKey(targetBrand);
          let chosen = null;

          if (isNone) {
            chosen = allCandidates.find(m => m.isNoneOpt || m.label.includes('없음')) || allCandidates[allCandidates.length - 1];
          } else {
            const brandCandidates = allCandidates.filter(m => !m.isNoneOpt);
            if (brandCandidates.length > 0) {
              chosen =
                (targetBrand && brandCandidates.find(m => m.label === targetBrand)) ||
                (targetNorm && brandCandidates.find(m => m.norm && m.norm === targetNorm)) ||
                (targetBrand && brandCandidates.find(m => m.label && (m.label.includes(targetBrand) || targetBrand.includes(m.label)))) ||
                (targetNorm && brandCandidates.find(m => m.norm && (m.norm.includes(targetNorm) || targetNorm.includes(m.norm)))) ||
                brandCandidates[0];
            } else {
              // 만약 모든 일반 브랜드가 비활성화되고 '없음'만 활성화된 특수 케이스면 '없음' 안전 선택 (정체 방지!)
              chosen = allCandidates[0];
            }
          }

          if (chosen) {
            const clickEl = chosen.r.offsetParent !== null
              ? chosen.r
              : (chosen.forLabel?.offsetParent !== null ? chosen.forLabel : (chosen.directLabel?.offsetParent !== null ? chosen.directLabel : chosen.r));
            if (!chosen.r.checked) {
              clickEl.click();
            }
            chosen.r.checked = true;
            chosen.r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') {
              window.$(chosen.r).prop('checked', true).trigger('change');
            }
            return {
              ok: true,
              label: chosen.label || targetBrand || '',
              akey: chosen.akey,
              isNoneOpt: chosen.isNoneOpt
            };
          }
          return { ok: false, label: '', akey: '' };
        }, {
          targetBrand: catState.q4SelectedBrand,
          isNone: catState.purchaseExp === '없음'
        });

        if (pickedQ4?.ok) {
          if (pickedQ4.label) catState.q4SelectedBrand = pickedQ4.label;
          catState.q4SelectedAkey = pickedQ4.akey || '';
          if (pickedQ4.isNoneOpt) catState.purchaseExp = '없음';
        }
        emitLog(`[${catState.categoryName} - 문항 4] 최근 구입/이용 브랜드 = "${pickedQ4?.label || catState.q4SelectedBrand}" (akey=${pickedQ4?.akey || '-'})`, 'info', 'Q4');

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-1 요인] 고려하신 가장 중요한 요인 (RADIO 1~9)
      if (info.screenType === 'Q4_1_FACTOR') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const factorSeed = Math.floor(rng() * 1000);
        const pickedFactor = await activeTarget.evaluate(({ fSeed }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q41--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r =>
            !r.disabled && (r.offsetParent !== null || r.closest('label, .s-radio, .answer-unit-box, li, tr, div')?.offsetParent !== null)
          );
          const nonEtcRadios = radios.filter(r => {
            const lb = (r.closest('label, .answer-unit-box, li, tr, div')?.innerText || '').trim();
            return !/(^|\s)기타(\s|$)/.test(lb) && !r.closest('label, .answer-unit-box, li, tr, div')?.querySelector('input.input-etc');
          });
          const pool = nonEtcRadios.length > 0 ? nonEtcRadios : radios;
          const preferredAkeys = ['2', '3', '1', '9', '8', '4', '6'];
          const targetAk = preferredAkeys[fSeed % preferredAkeys.length];
          const chosen = pool.find(r => r.getAttribute('akey') === targetAk) || pool[fSeed % Math.max(1, pool.length)];
          if (chosen) {
            const lbEl = chosen.closest('label') || (chosen.id ? document.querySelector(`label[for="${CSS.escape(chosen.id)}"]`) : null);
            if (!chosen.checked) {
              if (chosen.offsetParent !== null) chosen.click();
              else if (lbEl && lbEl.offsetParent !== null) lbEl.click();
              else chosen.click();
            }
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(chosen).prop('checked', true).trigger('change');
            return ((lbEl?.innerText || chosen.closest('li, tr, div')?.innerText || '')).replace(/\s+/g, ' ').trim().slice(0, 36);
          }
          return '';
        }, { fSeed: factorSeed });
        emitLog(`[${catState.categoryName} - 문항 4-1(요인)] "${pickedFactor}" 선택`, 'info', 'Q4-1F');
        await surveyPage.waitForTimeout(380);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-1 채널] 구입/이용 채널 경로 주관식 (숨김 META_PARENT 인풋 제외, TEXT_1 정확 타겟팅)
      if (info.screenType === 'Q4_1_CHANNEL') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        emitLog(`[${catState.categoryName} - 문항 4-1(채널)] 구입/이용 채널 = "${catState.selectedChannel}"`, 'info', 'Q4-1');
        await activeTarget.evaluate(({ channelText }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q41_CHANNEL--"]')).find(el => el.offsetParent !== null) || document;
          const inp = visQBox.querySelector('input[data-column="TEXT_1"]') ||
            Array.from(visQBox.querySelectorAll('input[type="text"], textarea, input:not([type])'))
              .find(el => el.offsetParent !== null && !el.disabled && !el.readOnly && !el.classList.contains('input-etc'));
          if (inp) {
            inp.focus();
            inp.value = channelText;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(channelText).trigger('input').trigger('change');
            inp.blur();
          }
        }, { channelText: catState.selectedChannel });

        await surveyPage.waitForTimeout(400);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 4-2 세제 제형] 세제류 전용 복수선택 (가루형/액체형/캡슐형/시트형)
      if (info.screenType === 'Q4_2_DETERGENT') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const detPicked = await activeTarget.evaluate(({ seedN }) => {
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q42--"]')).find(el => el.offsetParent !== null) || document;
          const cbs = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(c =>
            !c.disabled && (c.offsetParent !== null || c.closest('label, .s-check, .answer-unit-box, div, li')?.offsetParent !== null)
          );
          const prefer = cbs.find(c => /액체|캡슐/.test((c.closest('label, div, li')?.innerText || ''))) || cbs[seedN % Math.max(1, cbs.length)];
          if (prefer && !prefer.checked) {
            prefer.click();
            if (!prefer.checked && prefer.closest('label')) prefer.closest('label').click();
            prefer.checked = true;
            prefer.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(prefer).prop('checked', true).trigger('change');
          }
          return prefer ? (prefer.closest('label, div, li')?.innerText || '').trim() : '';
        }, { seedN: Math.floor(rng() * 100) });
        emitLog(`[${catState.categoryName} - 문항 4-2(제형)] "${detPicked}" 선택`, 'info', 'Q4-2');
        await surveyPage.waitForTimeout(380);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 5] 향후 구입/이용 선호 브랜드 (문항 4 응답 브랜드/akey와 100% 동일 선택)
      if (info.screenType === 'Q5_SAME_AS_Q4') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const pickedQ5 = await activeTarget.evaluate(({ sameBrand, sameAkey, isNone }) => {
          const normKey = (s) => String(s || '')
            .replace(/브랜드$/g, '')
            .replace(/[\s()[\]{}·•,./'"`’‘“”_-]+/g, '')
            .toLowerCase()
            .trim();
          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q5--"]')).find(el => el.offsetParent !== null) || document;
          const allCandidates = Array.from(visQBox.querySelectorAll('input[type="radio"]'))
            .map(r => {
              const directLabel = r.closest('label');
              const forLabel = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
              const unitBox = r.closest('.answer-unit-box, .s-radio, li, tr');
              const isVis = r.offsetParent !== null || directLabel?.offsetParent !== null || forLabel?.offsetParent !== null || unitBox?.offsetParent !== null;
              const isDis = Boolean(r.disabled || directLabel?.classList.contains('disabled') || forLabel?.classList.contains('disabled'));
              const spanTxt = (directLabel?.querySelector('.radio-value')?.innerText || forLabel?.querySelector('.radio-value')?.innerText || '').trim();
              const label = spanTxt || (forLabel?.innerText || directLabel?.innerText || unitBox?.innerText || '').replace(/\s+/g, ' ').trim();
              const akey = String(r.getAttribute('akey') || r.value || '').trim();
              const isNoneOpt = akey === '99' || akey === '999' || /^(없음|해당\s*없음)$/.test(label);
              return { r, directLabel, forLabel, isVis, isDis, label, norm: normKey(label), akey, isNoneOpt };
            })
            .filter(m => m.isVis && !m.isDis);

          if (allCandidates.length === 0) return '';

          const sameNorm = normKey(sameBrand);
          let chosen = null;
          if (isNone) {
            chosen = allCandidates.find(m => m.isNoneOpt || m.label.includes('없음')) || allCandidates[allCandidates.length - 1];
          } else {
            const brandCands = allCandidates.filter(m => !m.isNoneOpt);
            if (brandCands.length > 0) {
              chosen =
                (sameAkey && brandCands.find(m => m.akey === String(sameAkey))) ||
                (sameBrand && brandCands.find(m => m.label === sameBrand)) ||
                (sameNorm && brandCands.find(m => m.norm && m.norm === sameNorm)) ||
                (sameBrand && brandCands.find(m => m.label && (m.label.includes(sameBrand) || sameBrand.includes(m.label)))) ||
                brandCands[0];
            } else {
              chosen = allCandidates[0];
            }
          }

          if (chosen) {
            const clickEl = chosen.r.offsetParent !== null
              ? chosen.r
              : (chosen.forLabel?.offsetParent !== null ? chosen.forLabel : (chosen.directLabel?.offsetParent !== null ? chosen.directLabel : chosen.r));
            if (!chosen.r.checked) clickEl.click();
            chosen.r.checked = true;
            chosen.r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(chosen.r).prop('checked', true).trigger('change');
            return chosen.label || sameBrand || '';
          }
          return '';
        }, {
          sameBrand: catState.q4SelectedBrand,
          sameAkey: catState.q4SelectedAkey || '',
          isNone: catState.purchaseExp === '없음'
        });
        emitLog(`[${catState.categoryName} - 문항 5] 문항 4 동일 응답 = "${pickedQ5}"`, 'info', 'Q5');

        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 6 + 조건부 6-1·6-2] 생성형 AI 브랜드 질문 경험 (문항 3 6-3 응답값 catState.aiSearched와 100% 연동!)
      if (info.screenType === 'Q6_YES_NO') {
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const chooseNo = !catState.aiSearched;
        const targetLabel = chooseNo ? '아니오' : '예';
        const q6SubScore1 = rng() < 0.65 ? '4' : '5';
        const q6SubScore2 = rng() < 0.7 ? '4' : '3';

        await activeTarget.evaluate(async ({ want, isYes, sc1, sc2 }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const clickRadioSafe = (r) => {
            if (!r || r.disabled) return;
            const lb = r.closest('label') || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null);
            if (!r.checked) {
              if (r.offsetParent !== null) r.click();
              else if (lb && lb.offsetParent !== null) lb.click();
              else r.click();
            }
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(r).prop('checked', true).trigger('change');
          };

          const visQBox = Array.from(document.querySelectorAll('[question-name^="KBPI_Q6--"]')).find(el => el.offsetParent !== null) || document;
          const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r =>
            !r.disabled && (r.offsetParent !== null || r.closest('label, .s-radio, .answer-unit-box, li, tr, div')?.offsetParent !== null)
          );
          const getLb = (r) => {
            const lb = r.closest('label') || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null) || r.closest('.answer-unit-box, li, tr, div');
            return (lb?.innerText || '').replace(/\s+/g, ' ').trim();
          };
          const chosen = radios.find(r => getLb(r) === want)
            || radios.find(r => getLb(r).includes(want))
            || (want === '아니오' ? radios[1] : radios[0]);
          clickRadioSafe(chosen);

          if (isYes) {
            await waitMs(260);
            const q61Box = Array.from(document.querySelectorAll('[question-name^="KBPI_Q61--"]')).find(el => el.offsetParent !== null);
            if (q61Box) {
              const r61 = q61Box.querySelector(`input[type="radio"][akey="${sc1}"]`) || q61Box.querySelector('input[type="radio"][akey="4"]') || q61Box.querySelectorAll('input[type="radio"]')[3];
              clickRadioSafe(r61);
            }
            await waitMs(160);
            const q62Box = Array.from(document.querySelectorAll('[question-name^="KBPI_Q62--"]')).find(el => el.offsetParent !== null);
            if (q62Box) {
              const r62 = q62Box.querySelector(`input[type="radio"][akey="${sc2}"]`) || q62Box.querySelector('input[type="radio"][akey="4"]') || q62Box.querySelectorAll('input[type="radio"]')[3];
              clickRadioSafe(r62);
            }
          }
        }, { want: targetLabel, isYes: !chooseNo, sc1: q6SubScore1, sc2: q6SubScore2 });

        emitLog(`[${catState.categoryName} - 문항 6] "${targetLabel}" 선택${!chooseNo ? ` (6-1=${q6SubScore1}점, 6-2=${q6SubScore2}점)` : ''} (6-3 동기화)`, 'info', 'Q6');
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [문항 7 & 문항 8] 생성형 AI 활용 상황(Q7) · 확인 내용(Q8) — 1순위 · 2순위 GRADE 선택 ('기타' 행 절대 배제!)
      if (info.screenType === 'Q7_RANK_1_2' || info.screenType === 'Q8_RANK_1_2') {
        const isQ8 = info.screenType === 'Q8_RANK_1_2';
        const qLabelNum = isQ8 ? '8' : '7';
        const catState = await getOrInitCategoryState(info.categoryName, info.industryKey, activeTarget);
        const seedNum = Math.floor(rng() * 10000) + (isQ8 ? 37 : 0);

        const gradeClickPlan = await activeTarget.evaluate(({ sNum }) => {
          const isForbiddenLabel = (txt) => /기타|없음|모름|생각나지|잘\s*모르/.test(txt);
          document.querySelectorAll('[data-kbpi-rank-pick]').forEach(el => el.removeAttribute('data-kbpi-rank-pick'));

          const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document;
          const gradeEls = Array.from(visQBox.querySelectorAll('.s-gradeclick')).filter(el => el.offsetParent !== null);
          if (gradeEls.length < 2) return { isGradeClick: false };

          const reBtn = visQBox.querySelector('button.re-select');
          let didReset = false;
          if (reBtn && reBtn.offsetParent !== null) {
            reBtn.click();
            didReset = true;
          } else {
            const activeOnes = gradeEls.filter(el =>
              el.classList.contains('selected') || el.classList.contains('active') || el.classList.contains('on') || /(1순위|2순위)/.test(el.innerText || '')
            );
            if (activeOnes.length > 0) {
              activeOnes.forEach(el => el.click());
              didReset = true;
            }
          }

          const validGrades = gradeEls.filter(el => {
            if (el.querySelector('input.input-etc, textarea.input-etc')) return false;
            const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
            return !isForbiddenLabel(txt);
          });
          if (validGrades.length < 2) return { isGradeClick: false };

          const idx1 = sNum % validGrades.length;
          let idx2 = (sNum + 1 + ((sNum >> 2) % (validGrades.length - 1))) % validGrades.length;
          if (idx2 === idx1) idx2 = (idx1 + 1) % validGrades.length;

          validGrades[idx1].setAttribute('data-kbpi-rank-pick', '1');
          validGrades[idx2].setAttribute('data-kbpi-rank-pick', '2');

          return {
            isGradeClick: true,
            didReset,
            r1: (validGrades[idx1].innerText || '').replace(/\s+/g, ' ').trim(),
            r2: (validGrades[idx2].innerText || '').replace(/\s+/g, ' ').trim()
          };
        }, { sNum: seedNum });

        let rankInfo = { r1: '', r2: '', mode: '' };

        if (gradeClickPlan.isGradeClick) {
          if (gradeClickPlan.didReset) {
            await surveyPage.waitForTimeout(320);
          }
          const rank1Loc = activeTarget.locator('[data-kbpi-rank-pick="1"]').first();
          const rank2Loc = activeTarget.locator('[data-kbpi-rank-pick="2"]').first();
          if ((await rank1Loc.count()) > 0) {
            await rank1Loc.scrollIntoViewIfNeeded().catch(err => emitLog(`1순위 스크롤 경고: ${err.message}`, 'warn'));
            await rank1Loc.click();
            await surveyPage.waitForTimeout(350);
          }
          if ((await rank2Loc.count()) > 0) {
            await rank2Loc.scrollIntoViewIfNeeded().catch(err => emitLog(`2순위 스크롤 경고: ${err.message}`, 'warn'));
            await rank2Loc.click();
            await surveyPage.waitForTimeout(300);
          }
          rankInfo = { r1: gradeClickPlan.r1, r2: gradeClickPlan.r2, mode: 'GRADE_CLICK' };
        } else {
          rankInfo = await activeTarget.evaluate(async ({ sNum }) => {
            const isForbiddenLabel = (txt) => /(^|\s)기타(\s|$)|없음|모름|생각나지|잘\s*모르/.test(txt);
            const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
            const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document;

            const hkey1Radios = Array.from(visQBox.querySelectorAll('input[type="radio"][hkey="1"]')).filter(r => !r.disabled);
            if (hkey1Radios.length >= 2) {
              const validR1 = hkey1Radios.filter(r => {
                const tr = r.closest('tr, li, div');
                if (tr?.querySelector('input.input-etc')) return false;
                const rowTxt = (tr?.innerText || '').trim();
                return !isForbiddenLabel(rowTxt);
              });
              if (validR1.length >= 2) {
                const pick1 = validR1[sNum % validR1.length];
                const vk1 = pick1.getAttribute('vkey') || pick1.value;
                pick1.click();
                pick1.checked = true;
                if (typeof window.$ !== 'undefined') window.$(pick1).prop('checked', true).trigger('change');
                await waitMs(220);

                const validR2 = Array.from(visQBox.querySelectorAll('input[type="radio"][hkey="2"]')).filter(r => {
                  if (r.disabled) return false;
                  const vk2 = r.getAttribute('vkey') || r.value;
                  if (vk2 === vk1) return false;
                  const tr = r.closest('tr, li, div');
                  if (tr?.querySelector('input.input-etc')) return false;
                  const rowTxt = (tr?.innerText || '').trim();
                  return !isForbiddenLabel(rowTxt);
                });
                const pick2 = validR2[(sNum + 2) % Math.max(1, validR2.length)];
                if (pick2) {
                  pick2.click();
                  pick2.checked = true;
                  if (typeof window.$ !== 'undefined') window.$(pick2).prop('checked', true).trigger('change');
                  return { r1: vk1, r2: pick2.getAttribute('vkey') || pick2.value, mode: 'GRADE_HKEY' };
                }
              }
            }

            const selects = Array.from(visQBox.querySelectorAll('select')).filter(s => !s.disabled && s.offsetParent !== null);
            if (selects.length >= 2) {
              const opts1 = Array.from(selects[0].options).filter(o => o.value !== '' && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
              if (opts1.length >= 2) {
                const pick1 = opts1[sNum % opts1.length];
                selects[0].value = pick1.value;
                selects[0].dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(selects[0]).val(pick1.value).trigger('change');
                await waitMs(250);

                const opts2 = Array.from(selects[1].options).filter(o => o.value !== '' && o.value !== pick1.value && !/선택/.test(o.text) && !isForbiddenLabel(o.text));
                if (opts2.length > 0) {
                  const pick2 = opts2[(sNum + 1) % opts2.length];
                  selects[1].value = pick2.value;
                  selects[1].dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(selects[1]).val(pick2.value).trigger('change');
                  return { r1: pick1.text.trim(), r2: pick2.text.trim(), mode: 'SELECT_2' };
                }
              }
            }

            const allCbs = Array.from(visQBox.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.disabled && cb.offsetParent !== null);
            if (allCbs.length >= 2) {
              for (const cb of allCbs) {
                if (cb.checked) {
                  cb.click();
                  if (cb.checked) cb.checked = false;
                }
              }
              await waitMs(120);
              const validCbs = allCbs.filter(cb => {
                const t = (cb.closest('label, tr, td, li, div')?.innerText || '').trim();
                return t && !isForbiddenLabel(t) && !/^NOA_/i.test(cb.name || '');
              });
              if (validCbs.length >= 2) {
                const i1 = sNum % validCbs.length;
                const i2 = (i1 + 1) % validCbs.length;
                validCbs[i1].click();
                validCbs[i1].checked = true;
                if (typeof window.$ !== 'undefined') window.$(validCbs[i1]).prop('checked', true).trigger('change');
                await waitMs(160);
                validCbs[i2].click();
                validCbs[i2].checked = true;
                if (typeof window.$ !== 'undefined') window.$(validCbs[i2]).prop('checked', true).trigger('change');
                return {
                  r1: (validCbs[i1].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  r2: (validCbs[i2].closest('label, tr, td, li, div')?.innerText || '').trim().slice(0, 30),
                  mode: 'CHECKBOX_2'
                };
              }
            }

            return { r1: '', r2: '', mode: 'NONE' };
          }, { sNum: seedNum });
        }

        emitLog(`[${catState.categoryName} - 문항 ${qLabelNum} (${rankInfo.mode})] 1순위="${rankInfo.r1}", 2순위="${rankInfo.r2}" (기타 배제 완료)`, 'info', `Q${qLabelNum}`);
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // [KBPI_NGO 특수 블록] 구호개발단체(NGO) 세부진단 (국내/해외 중복 단체 입력 원천 차단)
      if (info.screenType === 'KBPI_NGO_SPECIAL') {
        emitLog('[특수 진단: 구호개발단체(NGO)] 문항 1~11 중복 없는 자동 입력...', 'info', 'NGO');
        await activeTarget.evaluate(({ sNum }) => {
          const visBoxes = Array.from(document.querySelectorAll('[question-name^="KBPI_NGO"]')).filter(el => el.offsetParent !== null);
          const queryAllInBoxes = (sel) => {
            if (visBoxes.length === 0) return Array.from(document.querySelectorAll(sel));
            const out = [];
            visBoxes.forEach(b => out.push(...Array.from(b.querySelectorAll(sel))));
            return out;
          };
          const normKey = (s) => String(s || '').replace(/[\s()[\]{}·•,./'"`_-]+/g, '').toLowerCase().trim();
          const usedNgoNorms = new Set();

          const pickUniqueFromPool = (pool, startIdx = 0) => {
            for (let i = 0; i < pool.length; i++) {
              const cand = pool[(startIdx + i) % pool.length];
              const nk = normKey(cand);
              if (!nk || usedNgoNorms.has(nk)) continue;
              usedNgoNorms.add(nk);
              return cand;
            }
            return '';
          };

          const setTxt = (inp, val) => {
            if (!inp || inp.disabled || inp.readOnly) return;
            inp.focus();
            inp.value = String(val);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(inp).val(String(val)).trigger('input').trigger('change');
            inp.blur();
          };

          // 국내/해외 후원단체 풀을 100% 분리하여 동일 화면 내 중복 브랜드('월드비전' 등) 입력 원천 차단
          const ngoDomestic = ['월드비전', '초록우산 어린이재단', '굿네이버스', '대한적십자사', '사랑의열매'];
          const ngoOverseas = ['유니세프', '세이브더칠드런', '국경없는의사회', '옥스팜', '플랜코리아'];
          const assocWords = ['어린이 후원', '국제 구호', '이웃 나눔', '아동 복지', '긴급 의료구호', '투명한 기부', '생명 나눔', '교육 지원'];

          const allTxt = queryAllInBoxes('input[type="text"], textarea, input:not([type])')
            .filter(el => el.offsetParent !== null && !el.disabled && !el.readOnly && !['radio', 'checkbox', 'hidden', 'button'].includes(el.type));
          allTxt.forEach((inp, idx) => {
            const cName = inp.getAttribute('custom-save-name') || inp.name || '';
            const ctxTxt = (inp.closest('[question-name], tr, div')?.innerText || '').trim();
            if (/_1_[34]$|^Q?1_[34]$|_2_[34]$|^Q?2_[34]$/i.test(cName)) {
              setTxt(inp, '');
            } else if (/_1_[12]$|^Q?1_[12]$/i.test(cName) || (/국내/.test(ctxTxt) && /단체|후원|브랜드/.test(ctxTxt))) {
              setTxt(inp, pickUniqueFromPool(ngoDomestic, sNum + idx));
            } else if (/_2_[12]$|^Q?2_[12]$/i.test(cName) || (/해외|국제/.test(ctxTxt) && /단체|후원|브랜드/.test(ctxTxt))) {
              setTxt(inp, pickUniqueFromPool(ngoOverseas, sNum + idx));
            } else if (!String(inp.value || '').trim()) {
              setTxt(inp, pickUniqueFromPool(assocWords, sNum + idx) || `나눔 활동${idx + 1}`);
            } else {
              const exNk = normKey(inp.value);
              if (exNk && usedNgoNorms.has(exNk)) {
                setTxt(inp, pickUniqueFromPool([...ngoDomestic, ...ngoOverseas, ...assocWords], sNum + idx));
              } else if (exNk) {
                usedNgoNorms.add(exNk);
              }
            }
          });

          // 드롭다운(select)이 있는 경우에도 열/문항 간 중복 선택 방지
          const usedSelVals = new Set();
          queryAllInBoxes('select:not(:disabled)').forEach((sel, sIdx) => {
            if (sel.offsetParent === null && sel.closest('td, th, div')?.offsetParent === null) return;
            const curTxt = (sel.options[sel.selectedIndex]?.text || '').trim();
            if (sel.value && curTxt && !/선택/.test(curTxt)) {
              usedSelVals.add(String(sel.value));
              return;
            }
            const validOpts = Array.from(sel.options).filter(o => o.value !== '' && !/선택|기타|모름/.test(o.text));
            const pick = validOpts.find(o => !usedSelVals.has(String(o.value))) || validOpts[(sNum + sIdx) % Math.max(1, validOpts.length)];
            if (pick) {
              sel.value = pick.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(sel).val(pick.value).trigger('change');
              usedSelVals.add(String(pick.value));
            }
          });

          const radios = queryAllInBoxes('input[type="radio"]:not(:disabled)');
          const byGroup = new Map();
          radios.forEach(r => {
            const k = r.getAttribute('custom-save-name') || r.name || '';
            if (!k) return;
            if (!byGroup.has(k)) byGroup.set(k, []);
            byGroup.get(k).push(r);
          });
          let gIdx = 0;
          for (const grp of byGroup.values()) {
            const visGrp = grp.filter(r => r.offsetParent !== null || r.closest('label, td, div')?.offsetParent !== null);
            if (visGrp.length > 0 && !visGrp.some(r => r.checked)) {
              const noOpt = visGrp.find(r => /아니오|모른다|없다/.test((r.closest('label, span, div')?.innerText || '').trim()));
              const pick = noOpt || visGrp[(sNum + gIdx) % visGrp.length];
              const lb = pick.closest('label') || (pick.id ? document.querySelector(`label[for="${CSS.escape(pick.id)}"]`) : null);
              if (pick.offsetParent !== null) pick.click();
              else if (lb && lb.offsetParent !== null) lb.click();
              else pick.click();
              pick.checked = true;
              pick.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
            }
            gIdx++;
          }
        }, { sNum: Math.floor(rng() * 100) });

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [KBPI_DIAG_* 특수 블록] 가정용보일러 · 신용카드 · 자동차배터리 세부진단
      if (info.screenType === 'KBPI_DIAG_SPECIAL') {
        emitLog(`[특수 진단 블록: ${info.qNameAttr}] 조건부 문항 순차 응답...`, 'info', 'DIAG');
        await activeTarget.evaluate(async ({ isBoilerSkip, sNum }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = Array.from(document.querySelectorAll('[question-name^="KBPI_DIAG_"]')).find(el => el.offsetParent !== null) || document;

          // 보일러(BOILER): 구입/사용 경험 ELIGIBLE='2'(아니오) 선택 시 즉시 검증 통과 가능
          const eligRadios = Array.from(box.querySelectorAll('input[type="radio"][custom-save-name="ELIGIBLE"]'));
          if (eligRadios.length >= 2) {
            const wantCode = isBoilerSkip ? '2' : '1';
            const pickElig = eligRadios.find(r => r.value === wantCode) || eligRadios[0];
            pickElig.click();
            pickElig.checked = true;
            if (typeof window.$ !== 'undefined') window.$(pickElig).prop('checked', true).trigger('change');
            await waitMs(200);
            if (wantCode === '2') return;

            const purRadios = Array.from(box.querySelectorAll('input[type="radio"][custom-save-name="PURCHASE"]'));
            if (purRadios[0]) {
              purRadios[0].click();
              purRadios[0].checked = true;
              if (typeof window.$ !== 'undefined') window.$(purRadios[0]).prop('checked', true).trigger('change');
              await waitMs(180);
            }
          }

          // 조건부 섹션이 열릴 수 있으므로 최대 4회 반복 스윕
          for (let pass = 0; pass < 4; pass++) {
            const radios = Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)'))
              .filter(r => r.offsetParent !== null || r.closest('label, div, td')?.offsetParent !== null);
            const radGroups = new Map();
            radios.forEach(r => {
              const k = r.getAttribute('custom-save-name') || r.name || '';
              if (!k) return;
              if (!radGroups.has(k)) radGroups.set(k, []);
              radGroups.get(k).push(r);
            });
            for (const grp of radGroups.values()) {
              if (grp.some(r => r.checked)) continue;
              const nonEtc = grp.filter(r => !/기타/.test((r.closest('label, span, div')?.innerText || '').trim()));
              const pick = (nonEtc.length > 0 ? nonEtc : grp)[sNum % Math.max(1, (nonEtc.length || grp.length))];
              if (pick) {
                pick.click();
                pick.checked = true;
                if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
              }
            }
            await waitMs(150);

            // 복수선택 체크박스 섹션
            const diagSections = Array.from(box.querySelectorAll('[data-diag]')).filter(sec => sec.offsetParent !== null);
            for (const sec of diagSections) {
              const cbs = Array.from(sec.querySelectorAll('input[type="checkbox"]:not(:disabled)')).filter(c => c.offsetParent !== null);
              if (cbs.length > 0 && !cbs.some(c => c.checked)) {
                const validCbs = cbs.filter(c => !/기타|없음|모름/.test((c.closest('label, span, div')?.innerText || '').trim()));
                const targetCb = (validCbs.length > 0 ? validCbs : cbs)[sNum % Math.max(1, validCbs.length || cbs.length)];
                if (targetCb) {
                  targetCb.click();
                  targetCb.checked = true;
                  if (typeof window.$ !== 'undefined') window.$(targetCb).prop('checked', true).trigger('change');
                }
              }
            }

            // 순위/일반 select
            const sels = Array.from(box.querySelectorAll('select:not(:disabled)')).filter(s => s.offsetParent !== null);
            const chosenByPrefix = new Map();
            for (const sel of sels) {
              const cName = sel.getAttribute('custom-save-name') || sel.name || '';
              const basePrefix = cName.replace(/_[12]$/, '');
              const prevVal = chosenByPrefix.get(basePrefix) || '';
              if (!sel.value) {
                const validOpts = Array.from(sel.options).filter(o =>
                  o.value !== '' &&
                  o.value !== prevVal &&
                  !/선택|기타|정보탐색하지|없음/.test(o.text)
                );
                const pickOpt = validOpts[sNum % Math.max(1, validOpts.length)] || Array.from(sel.options).find(o => o.value !== '' && o.value !== prevVal);
                if (pickOpt) {
                  sel.value = pickOpt.value;
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(sel).val(pickOpt.value).trigger('change');
                  chosenByPrefix.set(basePrefix, pickOpt.value);
                }
              } else {
                chosenByPrefix.set(basePrefix, sel.value);
              }
            }

            // 주관식 텍스트 (기타 입력칸 제외 — 다수 응답자 간 동일 문구 중복 방지)
            box.querySelectorAll('input[type="text"]:not(:disabled), textarea:not(:disabled)').forEach((inp, tIdx) => {
              if (inp.offsetParent === null || inp.readOnly) return;
              const cName = inp.getAttribute('custom-save-name') || inp.name || '';
              if (/_ETC$/i.test(cName) || inp.closest('[data-other]')) return;
              if (!String(inp.value || '').trim()) {
                const pickedTxt = openPool[(sNum + tIdx) % openPool.length] || '품질이 우수하고 신뢰가 가서';
                inp.value = pickedTxt;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.$ !== 'undefined') window.$(inp).val(inp.value).trigger('input').trigger('change');
              }
            });
            await waitMs(150);
          }
        }, { isBoilerSkip: age <= 24, sNum: Math.floor(rng() * 1000), openPool: KBPI_DIAG_OPEN_TEXT_POOL });

        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.1] DQ1 정보 습득 경로(2개 응답): '생성형 AI' · '신문/잡지/카탈로그' · '기타' 제외 랜덤 2개 선택
      // =========================================================================
      if (info.screenType === 'DQ1_INFO_SOURCE') {
        const availableOpts = await activeTarget.evaluate(() => {
          const box = document.querySelector('[question-name="DQ1"]') || document;
          return Array.from(box.querySelectorAll('input[type="checkbox"]:not(:disabled)'))
            .filter(cb => cb.offsetParent !== null || cb.closest('label, div')?.offsetParent !== null)
            .map(cb => ({
              akey: cb.getAttribute('akey') || cb.value || '',
              name: cb.name || '',
              label: (cb.closest('label, li, div')?.innerText || '').replace(/\s+/g, ' ').trim()
            }));
        });

        const pickedTwo = pickKbpiDq1Keys(availableOpts, rng);
        const targetAkeys = pickedTwo.map(o => String(o.akey));

        await activeTarget.evaluate(async ({ akeys }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const box = document.querySelector('[question-name="DQ1"]') || document;
          const cbs = Array.from(box.querySelectorAll('input[type="checkbox"]:not(:disabled)'));

          for (const cb of cbs) {
            if (cb.checked) {
              cb.click();
              if (cb.checked) {
                cb.checked = false;
                if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', false).trigger('change');
              }
            }
          }
          await waitMs(100);

          for (const ak of akeys) {
            const cb = cbs.find(c => String(c.getAttribute('akey') || c.value) === String(ak));
            if (cb && !cb.checked) {
              cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(cb).prop('checked', true).trigger('change');
              await waitMs(90);
            }
          }
        }, { akeys: targetAkeys });

        emitLog(
          `[DQ1 정보습득 경로 (3.1)] 생성형 AI·신문잡지·기타 제외 랜덤 2개 선택 완료 ➔ [${pickedTwo.map(x => x.label).join(', ')}]`,
          'info',
          'DQ1'
        );
        await surveyPage.waitForTimeout(420);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.2] ZQ1 ~ ZQ5_2 통계처리 배경변인: 구글 스프레드시트 데이터 기반 순차 자동 선택
      // =========================================================================
      if (info.screenType === 'ZQ_DEMOGRAPHICS') {
        const zqPlan = resolveKbpiZqAnswers({
          ...slotData,
          ...demoEnriched,
          age,
          ageGroup
        });

        const zqApplied = await activeTarget.evaluate(async ({ plan }) => {
          const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
          const pickedLabels = [];

          const selectZqRadio = async (qName, akey, etcText = '') => {
            const box = document.querySelector(`[question-name="${qName}"]`) || document;
            let r = box.querySelector(`input[type="radio"][qname="${qName}"][akey="${akey}"]`) ||
              box.querySelector(`input[type="radio"][akey="${akey}"]`);

            // ZQ5_2에서 [ZQ5_1=1](1인가구) HIDE 조건으로 해당 보기가 숨겨진 경우 5번(해당사항 없음) 안전 폴백
            if (qName === 'ZQ5_2' && (!r || r.disabled || (r.offsetParent === null && r.closest('label, div')?.offsetParent === null))) {
              r = box.querySelector('input[type="radio"][qname="ZQ5_2"][akey="5"]') ||
                Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)')).pop();
            }

            if (r && !r.disabled) {
              if (!r.checked) r.click();
              r.checked = true;
              r.dispatchEvent(new Event('change', { bubbles: true }));
              if (typeof window.$ !== 'undefined') window.$(r).prop('checked', true).trigger('change');

              if (etcText) {
                await waitMs(80);
                const etcInp = box.querySelector('input[data-column="TEXT_1"], input.input-etc, input[type="text"]');
                if (etcInp && !etcInp.disabled) {
                  etcInp.value = etcText;
                  etcInp.dispatchEvent(new Event('input', { bubbles: true }));
                  etcInp.dispatchEvent(new Event('change', { bubbles: true }));
                  if (typeof window.$ !== 'undefined') window.$(etcInp).val(etcText).trigger('input').trigger('change');
                }
              }

              const lb = (r.closest('label, li, div')?.innerText || '').replace(/\s+/g, ' ').trim();
              pickedLabels.push(`${qName}=${lb || akey}`);
            }
          };

          await selectZqRadio('ZQ1', plan.zq1Key);
          await waitMs(130);
          await selectZqRadio('ZQ2', plan.zq2Key);
          await waitMs(130);
          await selectZqRadio('ZQ3', plan.zq3Key, plan.zq3EtcText);
          await waitMs(130);
          await selectZqRadio('ZQ4', plan.zq4Key);
          await waitMs(130);
          await selectZqRadio('ZQ5', plan.zq5Key);
          await waitMs(130);
          await selectZqRadio('ZQ5_1', plan.zq5_1Key);
          await waitMs(220); // ZQ5_2 DYNAMIC_REMAKE 반영 대기
          await selectZqRadio('ZQ5_2', plan.zq5_2Key);
          await waitMs(120);

          return pickedLabels;
        }, { plan: zqPlan });

        emitLog(
          `[통계 배경변인 ZQ1~ZQ5_2 (3.2 시트기반)] [${zqApplied.join(' | ')}] 선택 완료`,
          'info',
          'ZQ1_5'
        );
        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // =========================================================================
      // [요구사항 3.3] ZQ6 한국능률협회컨설팅 패널 가입 의향: 전원 '없다(akey=2)' 선택 + 완료 직전 안전 대기
      // =========================================================================
      if (info.screenType === 'ZQ6_PANEL_INTENT') {
        await activeTarget.evaluate(() => {
          const box = document.querySelector('[question-name="ZQ6"]') || document;
          const noRadio = box.querySelector('input[type="radio"][qname="ZQ6"][akey="2"]') ||
            Array.from(box.querySelectorAll('input[type="radio"]:not(:disabled)'))
              .find(r => /없다|아니오/.test((r.closest('label, li, div')?.innerText || '').trim())) ||
            box.querySelectorAll('input[type="radio"]:not(:disabled)')[1];
          if (noRadio) {
            if (!noRadio.checked) noRadio.click();
            noRadio.checked = true;
            noRadio.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(noRadio).prop('checked', true).trigger('change');
          }
        });

        emitLog('[패널 가입 의향 ZQ6 (3.3)] "없다(2)" 선택 완료!', 'info', 'ZQ6');

        // AGENTS.md 제10원칙: ZQ6='없다'일 때 [다음] 클릭 시 즉시 COMPLETE(최종 제출)로 넘어가므로 안전가드 활성 시 여기서 정지!
        if (safetyGuard || policy.stopBeforeFinalSubmit !== false) {
          emitLog(
            `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 마지막 문항 ZQ6("없다")까지 모든 응답 입력을 마치고 최종 제출 직전(${info.progressPct || 100}%)에서 안전 정지했습니다!`,
            'info',
            'SAFE_WAIT'
          );
          return {
            success: true,
            safetyStopped: true,
            stoppedAt: 'FINAL_GATE',
            statusLabel: '완료직전 대기(ZQ6)',
            quotaStatus: 'pilot_done',
            progress: '99%',
            categoryConfigs,
            gps,
            surveyDistrict,
            surveyDong
          };
        }

        await surveyPage.waitForTimeout(450);
        await clickNextButton(activeTarget);
        continue;
      }

      // [종료 안내 화면 / 0컨트롤 완료 관문] Rule 10 즉시 안전 대기
      if (
        (info.screenType === 'FINAL_SUBMIT_GATE' || (seenCategoriesOrder.length >= 1 && info.visibleControlCount === 0)) &&
        (safetyGuard || policy.stopBeforeFinalSubmit !== false)
      ) {
        emitLog(
          `🛡️ [완료 직전 안전 대기] #${seq} ${respondentName} — 종료 직전 관문(${info.qNameAttr || info.screenType}, ${info.progressPct || 99}%)에서 안전 정지했습니다.`,
          'info',
          'SAFE_WAIT'
        );
        return {
          success: true,
          safetyStopped: true,
          stoppedAt: 'FINAL_GATE',
          statusLabel: `완료직전 대기(${info.progressPct || 99}%)`,
          quotaStatus: 'pilot_done',
          progress: `${info.progressPct || 99}%`,
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }

      // [기타 미분류 일반 문항 폴백]
      await activeTarget.evaluate(async ({ seedNum }) => {
        const waitMs = (ms) => new Promise(res => setTimeout(res, ms));
        const isForbidden = (txt) => /(^|\s)기타(\s|$)|모름|거절|무응답/.test(txt);
        const visQBox = Array.from(document.querySelectorAll('[question-type]')).filter(el => el.offsetParent !== null).pop() || document.body;

        const radios = Array.from(visQBox.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled && r.offsetParent !== null);
        const groups = new Map();
        for (const r of radios) {
          if (!groups.has(r.name)) groups.set(r.name, []);
          groups.get(r.name).push(r);
        }
        for (const grp of groups.values()) {
          if (grp.some(r => r.checked)) continue;
          const valid = grp.filter(r => !isForbidden((r.closest('label, li, tr, td, div')?.innerText || '').trim()));
          const pick = valid[seedNum % Math.max(1, valid.length)] || grp[0];
          if (pick) {
            pick.click();
            pick.checked = true;
            pick.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.$ !== 'undefined') window.$(pick).prop('checked', true).trigger('change');
            await waitMs(80);
          }
        }
      }, { seedNum: Math.floor(rng() * 1000) });

      await surveyPage.waitForTimeout(450);
      const clickedBtn = await clickNextButton(activeTarget);
      if (!clickedBtn && stopAtStep === 'FINAL_GATE') {
        return {
          success: true,
          safetyStopped: true,
          stoppedAt: 'FINAL_GATE',
          statusLabel: '완료직전 대기',
          quotaStatus: 'pilot_done',
          progress: `${info.progressPct || 99}%`,
          categoryConfigs,
          gps,
          surveyDistrict,
          surveyDong
        };
      }
    }

    throw new Error('최대 단계 반복 횟수(450회)를 초과했습니다.');
  } catch (err) {
    if (htmlInspectionDump) {
      htmlInspectionDump.finalOutcome = { success: false, error: err.message };
    }
    emitLog(`[K-BPI 실행 오류] ${err.message}`, 'error', 'ERROR');
    return {
      success: false,
      error: err.message,
      categoryConfigs,
      gps,
      surveyDistrict,
      surveyDong
    };
  } finally {
    if (htmlInspectionDump && captureHtmlDumpPath) {
      try {
        htmlInspectionDump.seenCategories = seenCategoriesOrder;
        htmlInspectionDump.alertHistory = alertHistory;
        htmlInspectionDump.categoryConfigs = categoryConfigs;
        if (!htmlInspectionDump.finalOutcome) {
          htmlInspectionDump.finalOutcome = { success: true, note: '안전 대기 지점 도달 및 캡처 완료' };
        }
        const dumpDir = path.dirname(captureHtmlDumpPath);
        if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
        writeJsonAtomicSync(captureHtmlDumpPath, htmlInspectionDump);
        emitLog(`[HTML 구조 분석 저장 완료] 총 ${htmlInspectionDump.screens.length}개 화면 · 네트워크 패킷 ${htmlInspectionDump.networkJoinPayloads.length}건 저장됨`, 'info', 'HTML_DUMP');
      } catch (dumpErr) {
        console.warn('[K-BPI HTML 분석 리포트 저장 경고]', dumpErr.message);
      }
    }
    if (!ownsBrowser && openedSurveyTab) {
      await openedSurveyTab.close().catch(e => console.warn('[K-BPI 공유세션 탭 닫기 경고]', e.message));
    }
    if (ownsBrowser && browser) {
      await browser.close().catch(e => console.warn('[K-BPI Runner Browser 종료 경고]', e.message));
    }
  }
}

/**
 * [150명 고속 일괄 신상명세 등록 & 배정 브랜드 전수 스캔 엔진]
 * - CAPI 포털에 단 1회 로그인한 뒤 공유 브라우저 세션에서 대상 슬롯들을 순차 진입하여
 *   GP1(GPS) -> WOKERD_DUP(신상명세 확인) -> SQ1~SQ3 -> M_CHECK(노원구/남동구)까지만 수행하고
 *   배정된 18~20개 브랜드 목록(INDUSTRY_ORDER)을 스캔한 직후 탭을 닫아 고속으로 처리합니다.
 */
export async function scanKmacKbpiBrandsBatch({
  campaign = null,
  targets = [],
  policy: rawPolicy = {},
  shouldStop = () => false,
  onItemDone = async () => {},
  onProgress = () => {}
} = {}) {
  const policy = {
    ...DEFAULT_KBPI_POLICY,
    ...(campaign?.kbpiPolicy || campaign?.masterBaseline?.policy || {}),
    ...(rawPolicy || {})
  };
  const loginId = String(campaign?.loginId || KBPI_DEFAULT_LOGIN_ID).trim();
  const loginPw = String(campaign?.loginPw || loginId).trim();
  const effectiveProxy = policy.proxyServer || process.env.KBPI_PROXY_SERVER || '';

  let browser = null;
  let scannedSuccessCount = 0;
  let skippedAlreadyScannedCount = 0;
  let failCount = 0;

  const emitBatch = (message, level = 'info', step = 'SCAN_BATCH', extra = {}) => {
    onProgress({ step, message, level, ...extra });
  };

  try {
    browser = await launchChromium({
      headless: true,
      args: ['--ignore-certificate-errors'],
      ...(effectiveProxy ? { proxy: { server: effectiveProxy } } : {})
    });

    const createSharedSession = async () => {
      const context = await browser.newContext({
        viewport: { width: 1400, height: 920 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        geolocation: { latitude: 37.654192, longitude: 127.056794, accuracy: 14 },
        permissions: ['geolocation'],
        ignoreHTTPSErrors: true
      });
      const rootPage = await context.newPage();
      const attachDialog = (pg) => {
        pg.on('dialog', async (dialog) => {
          const msg = dialog.message() || '';
          emitBatch(`[설문 알림] 🔔 "${msg}"`, 'warn', 'ALERT');
          await dialog.accept().catch(e => console.warn('[Dialog 수락 경고]', e.message));
        });
      };
      attachDialog(rootPage);
      context.on('page', newPg => attachDialog(newPg));

      const listPage = await loginAndEnterKbpiCapiList({
        context,
        page: rootPage,
        loginId,
        loginPw,
        emitLog: (m, lv) => emitBatch(m, lv, 'LOGIN')
      });
      return { context, listPage };
    };

    let sharedSession = await createSharedSession();

    const resetListPageToFirst = async (lp) => {
      await lp.evaluate(() => {
        const p1 = document.querySelector('.pagination .page-link[data-page="1"], .paging a[data-page="1"], a[data-page="1"], button[data-page="1"]');
        if (p1 && !p1.closest('.active')) {
          p1.click();
        }
      }).catch(err => console.warn('[K-BPI 1페이지 복귀 경고]', err.message));
      await lp.waitForTimeout(550);
    };

    for (let i = 0; i < targets.length; i++) {
      if (shouldStop()) {
        emitBatch('사용자에 의해 신상명세 등록 및 브랜드 스캔 배치가 안전하게 중지되었습니다.', 'warn', 'STOPPED');
        break;
      }

      const item = targets[i];
      const seq = Number(item.seq || item.index || (i + 1));
      const existingCats = (item.categoryConfigs || []).filter(c => c && c.categoryName);

      // 이미 15개 이상 전수 스캔 완료된 항목(예: #1 이상진 18개 스캔 + 99% 대기)은 불필요한 재진입 생략
      if (existingCats.length >= 15 && !policy.forceRescanAll) {
        skippedAlreadyScannedCount++;
        emitBatch(
          `[${i + 1}/${targets.length}] #${seq} ${item.name} (${item.uid}) — 이미 ${existingCats.length}개 브랜드 스캔 완료 상태 보존`,
          'info',
          'SKIP_SCANNED',
          { quotaIndex: seq, itemNumber: i + 1, totalItems: targets.length }
        );
        await onItemDone(item, {
          success: true,
          skipped: true,
          scannedCount: existingCats.length,
          statusLabel: item.status || '신상등록·스캔완료',
          quotaStatus: item.quotaStatus || 'scanned',
          categoryConfigs: item.categoryConfigs
        }, i, targets.length);
        continue;
      }

      emitBatch(
        `[${i + 1}/${targets.length}] #${seq} ${item.name} (${item.region}/${item.gender}/${item.ageGroup}, ${item.uid}) 신상명세 등록 & 출제 브랜드 스캔 시작...`,
        'info',
        'SCAN_ITEM',
        { quotaIndex: seq, itemNumber: i + 1, totalItems: targets.length }
      );

      let res = await runKmacKbpiSurvey({
        campaign,
        slotData: item,
        policy,
        quotaIndex: seq,
        pilotMode: false,
        safetyGuard: true,
        stopAtStepOverride: 'SCAN_BRANDS',
        sharedSession,
        onProgress: (info) => emitBatch(info.message, info.level, info.step, {
          quotaIndex: seq,
          itemNumber: i + 1,
          totalItems: targets.length
        })
      });

      // 페이지네이션 역방향이거나 세션 만료로 슬롯 미발견 시 1페이지 복귀/재로그인 후 1회 자동 재시도
      if (!res.success && /슬롯을 찾을 수 없습니다|Target page, context or browser has been closed/i.test(String(res.error || ''))) {
        emitBatch(`[세션/페이지 복구 재시도] #${seq} ${item.name} 슬롯 재탐색 중...`, 'warn', 'RETRY');
        try {
          if (/closed/i.test(String(res.error || ''))) {
            await sharedSession.context.close().catch(e => console.warn(e.message));
            sharedSession = await createSharedSession();
          } else {
            await resetListPageToFirst(sharedSession.listPage);
          }
          res = await runKmacKbpiSurvey({
            campaign,
            slotData: item,
            policy,
            quotaIndex: seq,
            pilotMode: false,
            safetyGuard: true,
            stopAtStepOverride: 'SCAN_BRANDS',
            sharedSession,
            onProgress: (info) => emitBatch(info.message, info.level, info.step, {
              quotaIndex: seq,
              itemNumber: i + 1,
              totalItems: targets.length
            })
          });
        } catch (retryErr) {
          emitBatch(`[재시도 경고] ${retryErr.message}`, 'warn', 'RETRY_WARN');
        }
      }

      if (res.success) {
        scannedSuccessCount++;
      } else {
        failCount++;
      }

      await onItemDone(item, res, i, targets.length);
    }

    await sharedSession.context.close().catch(e => console.warn('[K-BPI Scan Context 종료 경고]', e.message));

    return {
      success: true,
      scannedSuccessCount,
      skippedAlreadyScannedCount,
      failCount,
      totalProcessed: scannedSuccessCount + skippedAlreadyScannedCount + failCount
    };
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn('[K-BPI Scan Browser 종료 경고]', e.message));
    }
  }
}

