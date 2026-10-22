# [인수인계서] 상인회 조사 (2026070801) 구현 현황 및 잔여 작업 (Next Tasks)

**작성일시**: 2026-10-21 퇴근 전  
**프로젝트**: AutoSurvey AI - Kstat 멀티 설문 시스템 구축  
**대상**: B.상인회조사 (`PRID: 2026070801`)  
**조사원 계정**: `가온박정순` / `1234` (기존 점포조사는 `가온김영옥` / `1234` 동결 유지)

---

## 1. 최우선 대원칙 (Immutable Rule)
- **기존 [온누리 점포조사] 동결 원칙**: 기존 점포조사 코드(`src/engine/kstat-runner.js`, `kstat-eval-runner.js`, `persona-builder.js`, `kstat_survey_blueprint.json`)는 단 1줄도 변경하지 않으며 100% 독립 격리 상태를 유지합니다.
- 상인회 조사는 오직 전용 파일(`kstat-assoc-runner.js`, `kstat-assoc-slot-scraper.js`, `kstat_assoc_blueprint.json`)과 라우팅 분기를 통해서만 구동됩니다.

---

## 2. 현재 구현 완료 내역 (Done)

1. **상인회 슬롯 스크래퍼 (`src/engine/kstat-assoc-slot-scraper.js`)**
   - 관악구 8개 상인회 실존 슬롯 및 조사원 평가 URL 8초 만에 무결점 자동 스크랩 확인 완료.
   - 백엔드 `POST /api/kstat/fetch-assoc-slots` 및 `POST /api/campaigns/:id/bind-assoc-slots` 바인딩 완료.

2. **상인회 정책 마스터 블루프린트 (`data/kstat_assoc_blueprint.json`)**
   - 상인회 6대 핵심 정책 문항(F5 빈점포원인, F6 빈점포대책, G1 바가지원인, G2 바가지대책, G3 문화상설행사, G4 기후재해설비) 정의 완료.

3. **대시보드 UI/UX 전면 연동**
   - `index.html` & `campaign-list.js`: 캠페인 생성 시 [설문 엔진 유형: 상인회조사 (25단계)] 선택 및 청록색 전용 배지 시각화.
   - `survey-detail.html` & `survey-detail.js`:
     - STEP 1: 상인회 전용 9개 컬럼 테이블 동적 렌더링 + [Kstat 상인회 슬롯 자동 바인딩 (가온박정순)] 원클릭 연동.
     - STEP 2: 상인회 6대 정책 가이드라인 에디터 렌더링 (기존 3대 업종 그룹 가이드는 완전 숨김).
     - STEP 3: 파일럿 및 배치 실행 시 상인회 전용 엔드포인트 자동 분기.

4. **25단계(Q1, P1~P23, Agree.asp) 전수 구조 및 유효성 검사 분석 완료**
   - **P14 (D3.asp)**: `D3=2`(없음) 시 `TD3_1`은 반드시 공란 `""` 유지 필수 (텍스트 잔류 시 `있음을 선택해 주십시오` Alert 트랩).
   - **P20 (F1~F4.asp)**: `F1_1` 공란 시 `0` 채우고 `calcF1_4()` 호출, `F3` 체크박스 1개 이상 체크, `F4` 합계=F1 공실수 일치.
   - **P21 (F5, F6)**: 사용자 정책 1:1 주입.
   - **P22 (G1, G2)**: 사용자 정책 1:1 주입.
   - **P23 (G3, G4)**: G3는 2(없다) 선택으로 비고 텍스트 회피, G4는 '기타' 체크박스(`G4_1_7`, `G4_2_6`, `G4_3_6`, `G4_4_6`) 제외한 일반 시설 선택.
   - **Agree.asp**: `AGREE='Y'` 체크 후 `safetyGuard` 활성화 시 안전 정지(제출 방지) 파이프라인 검증 성공.

---

## 3. 잔여 작업 완료 현황 (Completed)

### [TASK 1] `src/engine/kstat-assoc-runner.js` 프레임 동기화 및 방어 로직 병합 ✅ [완료]
- **반영 내역**:
  1. **iframe 로딩 대기 강화**: `syncAllChildFrames(page)`에 `data-merge-loaded === '1'` 및 `document.body` 로딩 대기 루프 장착.
  2. **텍스트 인풋 미러링**: `input[name^="P"]`의 텍스트/숫자 필드를 2025년 필드로 복사 주입.
  3. **A3A (관리주체)**: 1(상인회) 우선 선택.
  4. **A5 (전문시장)**: 전년도 `PA5` 값과 일치 (`PA5=2`이면 2, `PA5=1`이면 1 + `TA5_1='종합소매'`).
  5. **A6 / A6A (점포수 및 업종별 점포수)**: 공란 시 전년도 값 또는 '0' 채우고 `calculateA6()`, `calculateA6A()` 호출.
  6. **A7 / A8 / A9 (휴무일, 영업시간, 영업일수)**: 전년도 값 계승 및 셀렉트 기본값 주입, 자동 계산 함수 호출.
  7. **D3 (정부지원사업)**: `D3=2` 선택 시 `TD3_1=''` 공란 확정, `healUnansweredAssocFields`에서 `TD3_1`에 '0' 주입 금지 방어.
  8. **F1~F4 (빈점포 현황)**: `F1_1~F1_4` 0 채움 및 `calcF1_4()` 호출, `F3_1` 체크, `F4` 합계 일치.
  9. **P23 (G3, G4)**: G3 2(없다) 선택으로 비고 텍스트 회피 및 인증수 0 채움, G4 안전 체크박스 선택.
  10. **동적 while 상태 머신 및 move_page 안전 돌파**: 잔류 시 `move_page`를 통한 무결점 25단계 전진 파이프라인 정식 장착.

### [TASK 2] `scripts/test-assoc-pilot-run.js` 1회 실행하여 완주 검증 ✅ [완료]
- **검증 결과**:
  - `신림중앙시장` (1번 슬롯) 대상 시뮬레이션 성공 완주 (`exit code 0`).
  - `00_INDEX` ➔ `01_Q1` ➔ `P3`~`P20` ➔ `P21` ➔ `P22` ➔ `P23` ➔ `24_AGREE` 24개 스크린샷 전수 저장 확인 (`reports/test_assoc_pilot/`).
  - Agree 단계에서 최종 제출되지 않고 안전 정지(Safety Guard: `pilotMode=true, safetyGuard=true`) 정상 작동 확인.

### [TASK 3] 웹 대시보드 UI/UX 및 백엔드 API 연동 검증 ✅ [완료]
- **검증 결과**:
  - 백엔드 `src/server.js`: `/api/campaigns/:id/bind-assoc-slots` 슬롯 자동 바인딩 및 쿼터 DB 변환 완료.
  - 백엔드 `src/server.js`: `/api/campaigns/:id/pilot-run` 내 `isAssoc` 분기 및 `runKstatAssocSurvey` 호출 파이프라인 검증 완료.
  - 프론트엔드 `public/survey-detail.js`: `isAssoc` 분기를 통한 9개 컬럼 전용 테이블, 6대 정책 가이드라인 에디터, 모니터링 SSE 스트리밍 정상 연동 완료.
  - 모듈 통합 단위 테스트 `scripts/verify_merchant_assoc_integration.js` 100% 통과.

### [TASK 4] 기존 온누리 점포조사 회귀 검증 (Regression Check) ✅ [완료]
- **검증 결과**:
  - 기존 점포조사 코드(`src/engine/kstat-runner.js`, `kstat-eval-runner.js`, `persona-builder.js`, `kstat_survey_blueprint.json`)는 상인회 전용 코드가 일체 침범하지 않고 100% 독립 격리 상태 유지.
  - 점포조사 12개 컬럼 쿼터 테이블, 3대 업종 그룹 마스터 기준점 UI/UX 완벽 보존 확인.

---

## 4. 관련 파일 위치 정리
- 상인회 실행 러너: [`src/engine/kstat-assoc-runner.js`](file:///c:/Users/sisun/onlinepoll/src/engine/kstat-assoc-runner.js)
- 상인회 슬롯 스크래퍼: [`src/engine/kstat-assoc-slot-scraper.js`](file:///c:/Users/sisun/onlinepoll/src/engine/kstat-assoc-slot-scraper.js)
- 상인회 마스터 블루프린트: [`data/kstat_assoc_blueprint.json`](file:///c:/Users/sisun/onlinepoll/data/kstat_assoc_blueprint.json)
- 백엔드 라우터: [`src/server.js`](file:///c:/Users/sisun/onlinepoll/src/server.js)
- 프론트 상세 화면: [`public/survey-detail.html`](file:///c:/Users/sisun/onlinepoll/public/survey-detail.html), [`public/survey-detail.js`](file:///c:/Users/sisun/onlinepoll/public/survey-detail.js)
- 검증용 테스트 스크립트:
  - `scripts/test-assoc-pilot-run.js` (파일럿 실행 테스트)
  - `scripts/test-full-e2e-assoc-runner.js` (E2E 스텝 테스트)
  - `scripts/verify_merchant_assoc_integration.js` (모듈 통합 단위 테스트)
