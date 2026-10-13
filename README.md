# 🚀 AutoSurvey AI (지능형 온라인 설문조사 자동화 시스템)

> **사용자가 설정한 페르소나와 비즈니스 쿼터(Quota) DB를 바탕으로 웹 설문조사를 사람처럼 자연스럽고 정확하게 자동 완수하는 차세대 설문 자동화 플랫폼**

---

## 🌟 주요 특징 (Key Features)

1. **캠페인 기반 3단계 워크플로우 (3-Step Workflow)**
   - **STEP 1 [조사 쿼터 DB 구축]**: B2C 인구통계 페르소나 또는 B2B 실존 사업자 DB 실시간 연동
   - **STEP 2 [설문 방향성 가이드]**: 설문 URL, 주제, 긍정/중립/부정 응답 가중치 및 주관식 중점 방향 설정
   - **STEP 3 [3차 자동화 실행]**: 원클릭 자동 실행 및 실시간 모니터링/로그 스트리밍

2. **공인 B2B 2단계 하이브리드 쿼터 엔진**
   - **1단계**: 소상공인시장진흥공단/중소벤처기업부 공인 온누리상품권 가맹점 데이터 1차 확보 (실존 사업자번호 & 상호)
   - **2단계**: 마켓비즈(MarketBz) 연동을 통한 실존 기업 상세 데이터(대표자명, 연락처, 개업연월, 취급품목, 사업장 주소 등) 1:1 결합(Enrichment)
   - **Excel(.xlsx) 및 JSON 실시간 표 뷰어 & 다운로드**: 수집 즉시 실시간 시각화 및 원클릭 엑셀 내보내기 지원

3. **스마트 폼 감지 & 인간 시뮬레이션 브라우저 자동화**
   - Playwright 기반의 동적 DOM 감지: 단일선택(라디오), 복수선택(체크박스), 드롭다운, 척도형(그리드), 주관식 텍스트 필드 자동 대응
   - 안티봇 회피: 인간다운 유기적 딜레이(타이핑 속도 변조, 지연 대기, 마우스 모션) 적용

4. **프리미엄 다크/글래스모피즘 웹 대시보드**
   - 직관적인 캠페인 관리 대시보드 (`/`)
   - 2열 그리드 기반 실시간 모니터링 상세 작업실 (`/survey-detail.html`)
   - 독립형 조사 쿼터 생성기 & 엑셀 뷰어 (`/quota-builder.html`)

---

## 🛠️ 기술 스택 (Tech Stack)

- **Backend**: Node.js (v20+ LTS, ESM), Express.js
- **Automation**: Playwright (Chromium)
- **Frontend**: Vanilla HTML5, Modern CSS, ES Modules (프레임워크 종속성 없는 초경량 고반응 UI)
- **Data & Spreadsheet**: SheetJS (`xlsx`)
- **AI Engine**: Google Generative AI (Gemini) + 지능형 룰 기반 폴백(Fallback) 내장

---

## 📂 프로젝트 구조 (Project Structure)

```text
c:/onlinepoll/
├── public/                    # 웹 대시보드 정적 파일
│   ├── index.html             # 메인 캠페인 목록 대시보드
│   ├── survey-detail.html     # 설문조사 상세 작업실 (1/2/3단계)
│   ├── quota-builder.html     # 독립형 B2B 조사 쿼터 생성기
│   ├── mock-survey.html       # 테스트용 모의 설문지
│   ├── styles.css             # 기본 모던 테마
│   ├── custom-styles.css      # 통합 컴포넌트 스타일시트
│   └── ...                    # 프론트엔드 모듈 스크립트
├── src/
│   ├── server.js              # Express API 서버 & 실시간 스트림
│   ├── engine/                # 브라우저 자동화 & 하이브리드 스크래퍼
│   ├── ai/                    # 의사결정 및 주관식 답변 생성 엔진
│   ├── models/                # 캠페인 & 쿼터 데이터 관리 모델
│   └── utils/                 # 로거, 엑셀 변환, 인간 지연 계산 유틸
├── data/                      # 캠페인 및 보관된 쿼터 데이터
└── AGENTS.md                  # 시스템 기반 및 개발 지침서
```

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 사전 요구사항
- [Node.js](https://nodejs.org/) v20.6.0 이상
- Playwright 브라우저 바이너리

### 2. 설치
```bash
# 의존성 패키지 설치
npm install

# Playwright Chromium 브라우저 설치
npx playwright install chromium
```

### 3. 환경 변수 설정
`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 계정 정보를 입력합니다:
```bash
cp .env.example .env
```

`.env`:
```env
# 마켓비즈 계정 정보 (B2B 쿼터 하이브리드 연동용)
MARKETBZ_USER=your_email@example.com
MARKETBZ_PASSWORD=your_password

# Gemini AI API 키 (선택 사항 - 부재 시에도 규칙 기반 폴백 엔진으로 정상 동작)
# GEMINI_API_KEY=your_gemini_api_key
```

### 4. 서버 실행
```bash
# 개발 모드 실행
npm run dev

# 일반 실행
npm start
```

서버 실행 후 웹 브라우저에서 `http://localhost:3000`으로 접속합니다.

---

## 🔒 보안 및 원칙 (Security & Compliance)
- 계정 정보 및 API 키는 절대 깃 저장소에 커밋되지 않도록 `.gitignore` 및 환경변수(`.env`)로 철저히 분리되어 있습니다.
- 실존 데이터 검증 원칙: 허위/날조된 사업자 번호나 더미 데이터를 생성하지 않으며 공인 플랫폼의 팩트 데이터만을 연동합니다.
