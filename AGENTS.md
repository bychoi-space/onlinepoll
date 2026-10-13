# AutoSurvey AI - 프로젝트 지침 및 시스템 기반 정의서 (AGENTS.md)

이 문서는 **AutoSurvey AI (지능형 온라인 설문조사 자동화 시스템)**의 아키텍처, 핵심 원칙, 기술 스택, 개발 연혁 및 에이전트 개발 유의사항을 정의합니다.

---

## ⚠️ [절대 준수] 시스템 개발 대전제 (Immutable Core Principles)

시스템을 개발하고 운영하는 모든 과정에서 에이전트는 다음 2가지 대전제를 **예외 없이 무조건 엄수**해야 합니다.

1. **어떤 상황에서도 브라우저 검증은 진행하지 마라.**
   - 브라우저 서브에이전트(`browser_subagent`)를 실행하여 UI를 탐색하거나 브라우저 상에서 인터랙션을 검증하는 일체의 행위를 절대 수행하지 않는다.
   - 검증이 필요한 경우 터미널 명령어, 단위 테스트, API 호출, 서버 로그 확인 등을 통해서만 수행한다.
2. **거짓된 데이터는 절대로 만들면 안 된다.**
   - 조작된 결과, 사실이 아닌 더미 통계, 날조된 실행 결과나 리포트를 임의로 생성하지 않는다.
   - 모든 보고와 결과는 실제 시스템이 동작하여 얻은 실제 사실과 데이터에만 근거해야 한다.

---

## 1. 시스템 개요 (System Overview)
**AutoSurvey AI**는 사용자가 입력한 설문조사 메타데이터(설문 목적, 페르소나, 객관식 선택 비중, 주관식 답변 가이드라인)를 바탕으로, 브라우저 자동화 로봇이 설문 페이지를 직접 탐색·분석하고 조건에 맞는 자연스러운 응답을 제출하는 지능형 웹 자동화 시스템입니다.

---

## 2. 시스템 아키텍처 (Architecture)

```mermaid
graph TD
    UI[웹 대시보드 UI (HTML/CSS/JS)] <-->|REST API & SSE / WebSocket| Server[Node.js Express 서버]
    Server --> Automation[자동화 제어 모듈 (Playwright Engine)]
    Server --> AI[의사결정 및 답변 생성 엔진 (AI/Rule-based)]
    Server --> Logger[작업 로거 & 결과 저장소 (History/Report)]
    
    Automation <--> Browser[Chromium Headed/Headless]
    Browser <--> Target[대상 설문조사 사이트 (Google Forms 등)]
    AI <--> LLM[LLM API (Gemini / OpenAI 등)]
```

### 주요 컴포넌트
1. **Web Dashboard (`/public`)**: 
   - 프리미엄 다크/모던 테마 기반의 설정 입력 폼 (URL, 페르소나, 선택 비중, 주관식 가이드 등)
   - 실시간 진행 상황 게이지, 단계별 콘솔 로그, 스크린샷 프리뷰
2. **Server Controller (`/server`)**:
   - 대시보드와의 통신(작업 시작/중지, 상태 조회, 실시간 이벤트 전송)
   - 작업 큐(Queue) 관리 및 세션 생명주기 제어
3. **Browser Automation Engine (`/engine`)**:
   - `Playwright` 기반의 동적 DOM 탐색 및 인터랙션
   - 라디오(단일선택), 체크박스(복수선택), 드롭다운, 그리드(척도형), 텍스트(주관식) 컴포넌트 자동 인식
   - 사람다운 딜레이(타이핑 속도 변조, 마우스 제어, 지연 대기)로 봇 탐지 방지
4. **Decision & Persona Engine (`/ai`)**:
   - 질문과 선택지를 분석하여 사용자가 지정한 가이드라인에 부합하는 옵션 결정
   - 페르소나(연령, 성별, 성향 등)를 바탕으로 풍부하고 자연스러운 주관식 문장 생성
   - API 키 부재 시에도 안정적으로 동작하는 스마트 휴리스틱/규칙 기반 폴백(Fallback) 내장

---

## 3. 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 | 선정 이유 |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v24 LTS, ESM) | 비동기 I/O 처리 우수, 브라우저 제어 라이브러리 생태계 최적 |
| **Backend** | Express.js, ws / SSE | 가볍고 빠른 API 서버 및 실시간 상태 스트리밍 |
| **Automation**| Playwright | 강력한 DOM 자동 대기(Auto-waiting), 다중 브라우저 지원, 높은 신뢰성 |
| **Frontend** | Vanilla HTML5, Modern CSS, ES Modules | 가볍고 빠른 로딩, 프레임워크 종속성 없는 직관적 UI/UX |
| **Spreadsheet**| xlsx (SheetJS) | 쿼터 데이터의 실시간 Excel 파일 변환 및 다운로드 지원 |
| **AI / Logic** | Google GenAI SDK (Gemini) + Rule Engine | 질문 맥락 이해, 유연한 주관식 답변 생성 |
| **Storage** | 로컬 파일 시스템 (JSON / Excel / Screenshots) | 별도 DB 설치 없는 간편하고 이식성 높은 결과 보관 |

---

## 4. 디렉터리 구조 표준 (Directory Structure)

```text
c:/onlinepoll/
├── AGENTS.md                  # 본 시스템 기반 및 에이전트 지침서
├── package.json               # 프로젝트 의존성 및 스크립트 정의 ("type": "module")
├── src/
│   ├── server.js              # Express 메인 엔트리포인트 및 API 라우팅
│   ├── engine/
│   │   ├── browser.js         # Playwright 브라우저 인스턴스 생명주기 관리
│   │   ├── parser.js          # 설문 DOM 질문/보기 컴포넌트 분석기
│   │   └── actor.js           # 인간다운 상호작용(클릭, 스크롤, 타이핑) 수행기
│   ├── ai/
│   │   ├── decision.js        # 객관식 선택 결정 로직 (가중치/확률 계산)
│   │   ├── generator.js       # 주관식 답변 생성기 (LLM + 프롬프트 템플릿)
│   │   └── persona.js         # 가상 응답자 프로필 생성기
│   ├── b2b/
│   │   ├── hybrid-quota-builder.js # 온누리상품권 ➔ 마켓비즈 2단계 하이브리드 엔진
│   │   ├── marketbz.js        # 마켓비즈 단독 기업 데이터 크롤링 엔진
│   │   └── onnuri.js          # 온누리상품권 공인 가맹점 데이터 조회기
│   └── utils/
│       ├── logger.js          # 로그 포맷터 및 SSE 이벤트 브로드캐스터
│       └── delays.js          # 인간 시뮬레이션 지연 계산 유틸
├── public/                    # 웹 대시보드 정적 파일 (인라인 스타일 완전 제거)
│   ├── index.html             # 메인 캠페인 목록 목차 대시보드
│   ├── survey-detail.html     # 설문조사 상세 작업실 (STEP 1, STEP 2, STEP 3)
│   ├── quota-builder.html     # 독립형 B2B 조사 쿼터 생성기 & Excel 뷰어
│   ├── mock-survey.html       # B2C 테스트용 모의 설문지
│   ├── mock-survey-b2b.html   # B2B 테스트용 모의 설문지
│   ├── styles.css             # 기본 모던/글래스모피즘 테마 스타일시트
│   ├── b2b.css                # B2B 기본 스타일시트
│   ├── campaign.css           # 캠페인 및 쿼터 테이블 가로 스크롤 스타일시트
│   ├── custom-styles.css      # [신규] 전수 이관된 컴포넌트 통합 스타일시트
│   ├── app.js                 # 실시간 스트림 구독 및 UI 제어 공통 유틸
│   ├── campaign-list.js       # 캠페인 목록 관리 및 신규 등록 모달 제어
│   ├── survey-detail.js       # 상세 작업실 (1차 쿼터 + 2차 방향성 + 3차 실행) 제어
│   └── quota-builder.js       # 조사 쿼터 생성기 및 엑셀 뷰어 인터랙션 제어
├── data/                      # 보관된 조사 쿼터(JSON/XLSX) 및 캠페인 데이터 저장소
├── reports/                   # 실행 결과(JSON, 로그, 캡처 이미지) 저장소
└── scripts/                   # 시스템 진단, 단일 기능 검증용 ESM 스크립트 모음
```

---

## 5. 시스템 개발 연혁 및 구현 완료 내역 (Day 1 완료 내역)

### 1) 캠페인 기반 3단계 워크플로우 아키텍처 정립
- **목록 대시보드(`index.html`)**: 진행 중/완료된 설문 캠페인 카드 뷰, 통계 배지, 신규 캠페인 등록 모달
- **상세 작업실(`survey-detail.html`)**:
  - **STEP 1 [1차 제반 작업] 조사 쿼터(Quota) 설정 & 제반 DB 구축**: B2C 인구통계 페르소나 또는 B2B 실존 사업자 DB 연동
  - **STEP 2 [2차 제반 작업] 설문조사 방향성 가이드 설정**: 설문 URL, 주제, 긍정/중립/부정 가중치 슬라이더, 주관식 중점 방향
  - **STEP 3 [3차 실행] 자동화 실행 제어**: 원클릭 시작/중지 및 우측 실시간 모니터링 연동

### 2) B2B 공인 조사 쿼터 생성기 (`quota-builder.html`) 개발
- **온누리상품권(공인 `ongift.or.kr`) ➔ 마켓비즈(`marketbz.com`) 2단계 하이브리드 파이프라인**:
  - **1단계**: 대상 지역(시/도, 시/군/구) 및 전통시장명(예: 서울 송파구 풍납시장) 기반 온누리 공인 10자리 사업자등록번호 및 가맹점 상호 1차 확보
  - **2단계**: 마켓비즈 자동 로그인 및 실존 사업자번호 1:1 매칭 조회를 통한 기업 상세 정보(대표자명, 연락처, 개업연월, 취급품목, 사업장 도로명 주소) 결합
  - **데이터 정확도 보장**: 연락처 스크랩 위치 정밀화, 대표자명 오파싱 제거, 미확인 데이터 `null` 처리(날조 박멸)
- **JSON 및 Excel(.xlsx) 실시간 표 뷰어 & 파일 동시 생성**:
  - SheetJS(`xlsx`) 라이브러리를 연동하여 수집 즉시 실시간 엑셀 표 시각화 및 원클릭 `.xlsx` 다운로드 지원

### 3) 쿼터 생성기 ⇄ 설문조사 상세 간 양방향 연동(Two-way Sync) 완성
- **Export (생성기 ➔ 설문 상세)**: 쿼터 생성기에서 `[이 쿼터로 설문 시작]` 클릭 시 캠페인 자동 생성 및 쿼터 DB 장착 후 상세 화면 이동 (`POST /api/campaigns/create-from-quota`)
- **Import (설문 상세 ➔ 쿼터 로드)**: 설문 상세 화면에서 보관된 쿼터 목록을 조회하여 원클릭으로 캠페인에 장착 (`POST /api/campaigns/:id/import-quota`)

### 4) 디테일 화면 레이아웃 정비 및 가로 스크롤 최적화
- **2열 그리드 배분 최적화**: 좌측(1.28fr, 설정+테이블) : 우측(0.92fr, 실시간 모니터링 sticky 고정)
- **쿼터 테이블 가로 스크롤 장착**: `min-width: 1180px`, `white-space: nowrap`, 9개 주요 컬럼 개별 너비 할당, 커스텀 스카이블루 스크롤바 적용

### 5) HTML 디자인 분리 원칙 완성 (인라인 스타일 100% 제거)
- 프로젝트 내 5개 HTML 파일의 인라인 `style="..."` 속성 67건과 내부 `<style>` 태그를 전수 조사하여 전면 제거
- 신규 통합 CSS 파일([`public/custom-styles.css`](file:///c:/onlinepoll/public/custom-styles.css))을 생성하여 5대 모듈별 클래스로 100% 이관 완료

---

## 6. 비즈니스 리서치 & 사업자 데이터 연동 규칙 (B2B Quota Engine)

### 1. 사업자 데이터 소스 정보
- **종합 기업 정보 (마켓비즈)**:
  - 플랫폼 URL: `https://marketbz.com/index`
  - 계정: `hyuk112@naver.com` / `mini112!` (환경변수 `.env`로도 주입 가능)
- **전통시장 및 소상공인 공인 가맹점 정보 (온누리상품권 플랫폼)**:
  - 플랫폼 URL: `https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do`
  - 데이터 성격: 중소벤처기업부/소상공인시장진흥공단 공인 온누리 가맹점 데이터 (시장명, 10자리 사업자등록번호, 상호, 지류/디지털 취급 여부, 주소, 업종)

### 2. 수집 및 활용 대상 데이터 항목 (Field Specifications)
- `상호` (Company Name)
- `사업자등록번호` (Business Registration Number, 10자리)
- `대표자명` (CEO Name)
- `연락처` (Phone Number, 대표전화번호)
- `개업연월` (Opening Date)
- `취급품목` (Handled Items / Sub-industry)
- `사업장 주소` (Business Address, 도로명)
- `온누리 특화 필드`: `시장명`, `온누리지류여부`, `온누리디지털여부`, `가맹상태` 등

### 3. B2B 실행 원칙
- **선(先) 수집 후(後) 주입**: 설문 회차(Iteration)에 필요한 만큼 사업자 목록을 먼저 확보한 후, 각 설문 회차별로 실제 사업자 데이터를 1:1 매핑하여 정확한 팩트 기반 응답을 작성한다.
- **온누리 ➔ 마켓비즈 2단계 하이브리드 파이프라인**: 대상 전통시장의 실존 가맹점을 1차 확보하고 마켓비즈와 1:1 매칭하여 상세 기업 데이터를 결합한다.
- **거짓 데이터 방지**: 플랫폼 조회를 통해 얻은 실존 사업자 데이터만을 활용하며, 데이터 부재 시 임의 가짜 데이터를 만들지 않고 `null` 또는 `-`로 처리한다.

---

## 7. 향후 개발 시 필수 유의사항 (Future Development Guidelines)

1. **[절대 준수] 브라우저 검증 전면 금지**:
   - 에이전트는 어떠한 경우에도 브라우저 서브에이전트(`browser_subagent`)를 호출하지 않는다.
   - 모든 기능 검증은 터미널 스크립트 실행, Node.js API 호출, HTTP 상태 코드 검사, 단위 테스트를 통해서만 수행한다.
2. **[절대 준수] 거짓된 데이터 생성 금지**:
   - 가짜 사업자번호(더미 번호), 가공의 상호, 허위 설문 제출 로그를 생성하지 않는다.
   - 에러나 데이터 누락 발생 시 조작하지 않고 사실 그대로 보고하고 예외 처리한다.
3. **HTML 인라인 스타일 작성 금지 (CSS 분리 원칙 엄수)**:
   - 신규 HTML 파일 또는 기존 HTML 수정 시 태그 내에 `style="..."` 속성을 직접 작성하지 않는다.
   - 디자인 관련 속성은 반드시 `styles.css`, `campaign.css`, `custom-styles.css` 등 CSS 파일에 클래스를 정의하여 적용한다.
   - JS에서 DOM 요소를 제어할 때도 직접 `element.style.xxx`를 주입하기보다 `classList.add()` / `classList.remove()`를 우선 활용한다.
4. **Node.js ESM (ECMAScript Modules) 환경 준수**:
   - 프로젝트 `package.json`은 `"type": "module"`로 설정되어 있다.
   - 모든 스크립트와 모듈은 `require()` 대신 `import / export` 문법을 사용해야 한다.
   - `__dirname`이나 `__filename`이 필요한 경우 `fileURLToPath(import.meta.url)` 유틸을 사용한다.
5. **Windows PowerShell 환경 명령어 실행 규칙**:
   - 터미널에서 Node 명령어를 실행할 때는 반드시 `$env:Path = "C:\Program Files\nodejs;" + $env:Path;`를 명령 앞에 결합하여 node 실행 경로를 보장한다.
   - 복잡한 따옴표나 이스케이프가 필요한 작업은 원라이너(`node -e "..."`) 대신 `scripts/` 폴더 내에 명시적인 검증 스크립트 파일을 생성하여 실행한다.
6. **외부 사이트 스크래핑 시 안티블록 & 세션 유지**:
   - 온누리상품권/마켓비즈 탐색 시 봇 차단을 방지하기 위해 인간다운 딜레이(`delays.js`)를 유지한다.
   - 마켓비즈 세션 만료 시 백엔드 크롤러가 자동으로 로그인 폼을 감지하여 재인증을 수행하도록 페일세이프를 유지한다.
7. **캠페인 생명주기 및 쿼터 소진 상태 관리**:
   - 캠페인 상태 전이: `ready` (대기 중) ➔ `building` (DB 구축 중) ➔ `running` (설문 자동화 진행 중) ➔ `completed` (설문 완료).
   - 각 회차 설문 응답이 성공적으로 제출되면 해당 사업자 쿼터의 상태(`quotaStatus`)를 `'used'`로 업데이트하여 동일 사업자가 중복 응답되지 않도록 엄격히 관리한다.



