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

### [TASK 5] 기입력 보존(Preserve Existing Inputs) 및 완료 슬롯 건너뛰기 규칙 구축 ✅ [완료]
- **반영 내역**:
  1. **설문 항목 단위 보존 (`preserveExistingInputs: true`)**:
     - `Q1`: 기입력된 성명, 연락처, 조사원 성명 및 직위 라디오가 이미 체크된 경우 덮어쓰지 않고 100% 보존.
     - `P1~P20` (`mirrorPrevYearToCurrent`): 당해년도 라디오, 체크박스, 텍스트/숫자 인풋, 셀렉트 박스에 이미 유효한 입력/선택값이 있을 때 전년도 값으로 덮어쓰지 않고 기존 입력값 유지 (빈 필드만 자동 입력).
     - `P21~P23` (F5~G4 정책): 이미 사용자가 선택한 라디오/체크박스가 있다면 가이드 기본값으로 덮어쓰지 않고 기존 선택 보존.
  2. **슬롯 단위 건너뛰기 (`skipCompletedSlots: true`, `skipSlotIndices`)**:
     - Kstat 조사원 페이지에서 이미 '완료' 상태(`surveyCompleted`)이거나 로컬 완료된 슬롯을 배치 대상에서 자동 제외.
     - 사용자가 지정한 슬롯 번호(`skipSlotIndices`, 예: "1, 2")를 배치 실행 대상에서 제외.
  3. **UI/UX 및 블루프린트 연동**:
     - STEP 2 상인회 정책 가이드 상단에 [기입력 항목 보존 및 슬롯 건너뛰기 규칙] 카드 배치.
     - `kstat_assoc_blueprint.json` 및 캠페인 `assocPolicy`에 규칙 영구 저장 연동 완료.
  4. **실전 E2E 완주 검증**:
     - `scripts/test-assoc-preserve-existing.js` 헤드리스 E2E 테스트 100% 완주 통과 (`Success: true`).


### [TASK 6] B5-4 상인회 총회 실시 횟수 정책 가이드 구축 및 P6 미러링 트랩 해결 ✅ [완료]
- **반영 내역**:
  1. **B5-1 ~ B5-3 전년도 100% 강제 미러링 보장**:
     - `PB5A` ➔ `B5A` (가입점포 수), `PB5B` ➔ `B5B` (월 상인회비), `PB5C` ➔ `B5C` (납부점포 수, B5A 이하 정합성 보장) 복사 및 이벤트 트리거.
  2. **B5-4 상인회 총회 실시 횟수 정책 가이드 추가 (`B5_generalAssemblyCount`)**:
     - 사용자가 STEP 2 가이드라인에서 **0회부터 10회까지 직접 선택**하거나, 슬롯별 **랜덤 분산(1~2회, 1~3회, 0~2회)**을 선택할 수 있는 전용 UI 카드 장착.
     - `kstat_assoc_blueprint.json` 및 캠페인 `assocPolicy`와 양방향 영구 저장 연동.
  3. **P6 연쇄 Alert 트랩 전수 해결**:
     - `B5D` 공란 Alert, `B6A` 사무실 유무 Alert, `B6D` 팩스 유무 Alert, `B7A` 다른 상인회 유무 Alert 원천 차단 및 정식 `#next` 폼 제출(`form.submit()`) 보장.
  4. **헤드리스 실전 E2E 완주 검증**:
     - `scripts/test-p6-assembly-policy.js`로 0회, 3회 등 정책값에 따른 P6 ➔ P7 정식 통과 실측 완료 (`Result Success: true`).

---

### [TASK 7] 상인회 B1~B4, C1~C3 신규 규칙 업데이트 및 정책 가이드라인 확장 ✅ [완료]
- **반영 내역**:
  1. **B1 (운영여부 및 개설년도)**:
     - 2024년 운영여부(`PB1`) 및 개설년도(`TPB1_1`) 확인.
     - 2025년 `B1` 라디오 '운영 중'(`B1=1`) 체크 및 `TB1_1`에 전년도 개설년도 1:1 복사 주입.
  2. **B2-1 (상인회명)**:
     - 전년도 상인회명(`PB2A`)을 2025년 `B2A`로 1:1 복사 주입.
     - 최소 2자 이상 보장 및 Kstat jQuery 검증(`.val(v).trigger('input').trigger('change')`) 동기화로 2자 미만 경고 Alert 원천 방지.
  3. **B3 (상인회장 성명 및 연락처)**:
     - 쿼터 DB 내 실존 상인회 데이터(`assocData.leaderName`, `assocData.leaderPhone`)를 `B3_1`(성명), `B3_2`(연락처)에 100% 매핑 주입.
  4. **B4-1 (관리자/시장매니저)**:
     - 2024년 합계(`PB4A_SUM`)가 0이거나 세부 인원이 모두 공란이면 2025년 `B4A_NONE`('없음') 체크박스 네이티브 클릭.
     - 2024년에 인원 데이터가 있으면 업무명/인원 2025년 필드에 1:1 동일 입력.
  5. **B5-4 (총회 실시 횟수 가이드라인)**:
     - 대시보드 STEP 2 가이드라인에서 0~10회 직접 선택 및 랜덤 분산(0~2회, 1~2회, 1~3회) 기준 설정 기능 장착.
  6. **C1 & C2 (고객편의시설 / 안전시설 1:1 복사 및 필요도 랜덤 체크)**:
     - **C1 (고객편의시설 9개 문항)**: 2024년 '보유개수'(`PC1_x_2`)가 존재하면 2025년 '보유여부' 있음(`C1_x_1=1`) + 보유개수 동일 입력. 없으면 '보유여부' 없음(`C1_x_1=2`) 체크. '시설필요도'(`C1_x_3`)는 1~5 척도 중 랜덤 체크.
     - **C2 (안전시설 18개 문항)**: 동일하게 2024년 보유개수 유무에 따라 2025년 있음/개수 복사 또는 없음 체크, '시설필요도'(`C2_x_3`) 1~5 척도 랜덤 체크.
     - 공란 제로필(`mirrorPrevYearToCurrent`)이 C1/C2의 보유개수/없음 판정을 방해하지 않도록 정밀 격리.
  7. **C3-1-3 (전기차 전용 주차 대수 가이드라인)**:
     - 가이드라인에서 0~10대 직접 선택 및 랜덤(1~3대, 0~5대, 2~5대) 기준 설정 기능 장착 (`C3_1_evParkingCount`).
  8. **C3-2-1, C3-2-2, C3-2-3 (주차장 형태, 소유주체, 관리주체 가이드라인)**:
     - **C3-2-1 형태**: 부설주차장, 노상주차장, 노외주차장 중 단일 또는 복수 선택 기능 제공 (`C3_2_1_parkingType`).
     - **C3-2-2 소유주체**: 상인회, 지자체, 개인 운영, 기타 중 선택 기능 제공 (`C3_2_2_owner`).
     - **C3-2-3 관리주체**: 직접관리, 지자체, 시설관리공단 등 기관, 개인, 기타 중 선택 기능 제공 (`C3_2_3_manager`).
     - STEP 2 UI 카드 렌더링, `kstat_assoc_blueprint.json` 기본값 정의, 캠페인 저장 및 실전 러너(`C3BA`, `C3BB`, `C3BC`) 완벽 주입 파이프라인 완성.
  9. **헤드리스 실전 E2E 완주 검증**:
     - `scripts/test-assoc-rules-e2e.js`를 통해 1단계(INDEX)부터 P5(B1~B4), P7(C1), P8(C2), P9(C3), P23을 거쳐 Agree 단계 안전 정지까지 Alert 트랩 0건으로 100% 정상 통과 (`Success: true`, 25개 스텝 스크린샷 전수 저장 확인).

### [TASK 8] 상인회 D1, E1, F1, F5~F6, G1~G2, G4 신규 규칙 및 가이드 개선 ✅ [완료]
- **반영 내역**:
  1. **D1-1 (축제 및 이벤트 명칭 검색 조회 및 실시/미실시 판별)**:
     - 시장명 기반 축제 조회 엔진([`src/utils/market-festival-finder.js`](file:///c:/Users/sisun/onlinepoll/src/utils/market-festival-finder.js)) 신설:
       - 1차: 관악구/전국 전통시장 공식 축제명 사전(Dictionary) 매핑 (신원시장 달빛축제, 인헌시장 낙낙별길 축제, 관악신사시장 힐링 축제, 녹두S밸리 착한 야시장 등).
       - 2차: 사전 미등록 시장 대상 실시간 네이버 검색엔진 쿼리를 통한 기사/블로그 축제·이벤트 명칭 자동 추출.
     - 축제가 확인되면: `D1AA_2_1` = 1 (실시) 선택 + `D1AA_2_2` = 축제 명칭 입력 + 기여도(3 또는 4) 체크.
     - 축제가 미확인되면: `D1AA_2_1` = 2 (미실시) 선택 + 명칭 공란 유지.
     - D1AA 기타 항목 결측 방어(경품행사 등 미실시 자동 체크)로 Alert 원천 차단.
  2. **D1-2 (온라인 배송 서비스 가이드라인 설정 기능)**:
     - 대시보드 STEP 2 가이드라인에 [카드 5: D1-2. 온라인 배송 서비스 운영 여부] 카드 추가 (`D1_2_onlineDeliveryService`).
     - 2: 온라인 배송 서비스 없음 (기본값) / 1: 온라인 배송 서비스 있음 중 선택 지원.
     - `D1B.asp` 1:1 라디오 바인딩 및 `D1BA.asp` 결측 방어 장착.
  3. **D1-2-5 (필요한 지원 항목 '기타' 제외 랜덤 입력)**:
     - `D1BE.asp`에서 5번 기타를 배제하고 1~4번(디지털전문인력, 입점지원, 인프라구축, 디지털교육) 중 무작위 정수(`Math.floor(Math.random()*4)+1`) 선택.
  4. **E1 (소방시설 현황 및 AI 지능형 출동 시스템 '없음' 처리)**:
     - P17 `E1.asp`에서 7번 항목(AI 지능형 출동 시스템)은 무조건 2번('없음') 라디오 체크, 개수는 공란 처리, 시설필요도는 1~5점 척도 중 랜덤 체크.
     - 1~6번 문항은 전년도 보유개수 유무에 따라 당해년도 있음+개수 복사 또는 없음 일괄 체크 및 시설필요도 랜덤 선택.
  5. **F1 (빈 점포 개수 모두 '0' 주입)**:
     - P20 `F1.asp`의 4대 필드(`F1_1`, `F1_2`, `F1_3`, `F1_4`)에 모두 `'0'`을 주입하고 `calcF1_4()` 계산 트리거.
     - `F2.asp` 상태별 개수(`F2A_1~4`) 및 공실기간(`F2B`) 모두 `'0'` 입력, `F3.asp` 안전 체크박스 선택, `F4.asp` 합계 0 보장.
  6. **F5, F6, G1, G2 ('기타' 제외 나머지 항목 중 랜덤 입력)**:
     - 대시보드 UI 및 블루프린트 옵션을 '기타 제외 랜덤'으로 표준화.
     - F5: 1~4 항목 중 랜덤 (5번 기타 제외).
     - F6: 1~5 항목 중 랜덤 (6번 기타 제외).
     - G1: 1~5 항목 중 랜덤 (6번 기타 제외).
     - G2: 1~5 항목 중 랜덤 (6번 기타 제외).
  7. **G4 (기후재해 대비 현황 보유/필요여부 랜덤하게 일부 미체크)**:
     - P23 `G4.asp`에서 전체를 무조건 다 체크하던 방식을 개선.
     - 각 시설 항목별로 보유여부(`_H`)는 약 60% 확률, 필요여부(`_N`)는 약 50% 확률로 체크하여 자연스러운 분산 응답 생성.
     - 설문 유효성 검증 Alert 방지를 위해 카테고리별(냉방, 난방, 수해설비, 수해활동) 최소 1개 체크 강제 보장 및 기타(`_ETC`)는 체크 제외.
  8. **헤드리스 실전 E2E 완주 검증**:
     - `scripts/test-assoc-rules-e2e.js`를 통해 5번 슬롯(녹두S밸리골목형상점가)을 대상으로 실행하여, 네이버/사전 검색(녹두S밸리 착한 야시장) 연동 ➔ D1-2 ➔ D1-2-5(랜덤) ➔ E1(AI 없음) ➔ F1(0) ➔ F5~G2(기타 제외 랜덤) ➔ G4(일부 미체크)를 거쳐 Agree 최종 동의까지 100% 정상 완주 확인 (`Success: true`).

### [TASK 9] A8 전통시장·상점가 운영 시간대 가이드 설정 및 Kstat 러너 연동 ✅ [완료]
- **반영 내역**:
  1. **A8 문항 DOM 구조 및 유효성 전수 분석**:
     - `P4` 단계 내 `frame_A8` (`A8.asp`)에 위치.
     - `A8_1_1`: 개점 시간(시, 00~23 select)
     - `A8_1_2`: 개점 시간(분, 0~59 select)
     - `A8_2_1`: 폐점 시간(시, 00~23 select)
     - `A8_2_2`: 폐점 시간(분, 0~59 select)
     - `A8_3`: 개점/폐점 시간 없음 (체크박스, value="3")
     - Kstat 유효성 검사: `A8_3` 미체크 시 4개 시/분 셀렉트 필수 선택. 12시 이상일 시 24시간제 확인 Alert 자동 수락 처리.
  2. **상인회 마스터 블루프린트(`data/kstat_assoc_blueprint.json`) 확장**:
     - `A8_operatingHoursMode`: "standard" (표준 09:00~21:00 기본값)
     - `A8_openHour`: "09", `A8_openMinute`: "0"
     - `A8_closeHour`: "21", `A8_closeMinute`: "0"
     - `A8_noTime`: false
  3. **대시보드 UI 카드 렌더링 ([`public/survey-detail.js`](file:///c:/Users/sisun/onlinepoll/public/survey-detail.js))**:
     - 카드 0(실행 규칙) 바로 아래에 **A8 전통시장·상점가 운영 시간대 가이드** 전폭(Full-width) 카드로 배치.
     - B1~G4 14개 카드의 2열 7행 대칭 레이아웃을 100% 온전하게 보존.
     - 6대 운영 정책 모드 제공:
       - `standard`: `[권장] 주간 표준 운영 (09:00 ~ 21:00 동일)`
       - `mirror`: `2024년 시간대 1:1 동일 계승 (공란 시 09:00~21:00 적용)`
       - `traditional`: `새벽 / 생계형 시장 (06:00 ~ 20:00)`
       - `night`: `야시장 / 먹거리 골목 (11:00 ~ 23:00)`
       - `no_time`: `개점/폐점 시간 없음 (24시간 자유 영업 / A8_3 체크)`
       - `custom`: `직접 개점·폐점 시간 지정`
     - 상단 헤더의 [빠른 정책 가이드] 일괄 초기화 버튼과도 100% 양방향 연동.
  4. **Kstat 상인회 실행 러너([`src/engine/kstat-assoc-runner.js`](file:///c:/Users/sisun/onlinepoll/src/engine/kstat-assoc-runner.js)) P4 주입 엔진 고도화**:
     - P4 단계 처리 핸들러 신설: A7~A9 일반 문항은 1:1 미러링 수행, `frame_A8`은 가이드 정책 우선 적용.
     - `no_time` 모드 시 `A8_3` 체크 및 `noCheckBoxValue`, `colorCheckbox` 네이티브 트리거.
     - 시간대 모드 시 `A8_3` 체크 해제 후 `A8_1_1`, `A8_1_2`, `A8_2_1`, `A8_2_2`에 안전 주입 및 change/input 이벤트 발생.
  5. **헤드리스 실전 E2E 완주 검증 및 원격 프로덕션 배포**:
     - `scripts/test_p4_a8_e2e.js`: Playwright Headless로 P4 단계의 A8.asp에 운영시간 정책을 주입하고 `#next` 클릭 시 Alert 트랩 없이 `P5.asp`로 정상 이동 확인 (`Success: true`).
     - 원격 GCP 프로덕션 실서버(`34.64.233.77:3000`)에 최신 코드 자동 배포(`v=20261023_assoc_a8_operating_hours`) 및 대상 캠페인(`camp_1792632384098`) 정책 DB 동기화 완료.

### [TASK 10] 상인회 '시설필요도' (`_3`) 문항 3·4·5 제한 규칙 적용 ✅ [완료]
- **반영 내역**:
  1. **전 구간 '시설필요도' (`(추가) 시설필요도`) 응답 범위 제한**:
     - 대상 단계 및 문항(총 39개 항목):
       - `P7` (`C1`: 일반/편의시설 9개 항목 `C1_1_3` ~ `C1_9_3`)
       - `P8` (`C2`: 안전/위생시설 18개 항목 `C2_1_3` ~ `C2_18_3`)
       - `P10` (`C4`: 고객지원/홍보시설 5개 항목 `C4_1_3` ~ `C4_5_3`)
       - `P17` (`E1`: 화재예방/소방시설 7개 항목 `E1_1_3` ~ `E1_7_3`)
     - **절대 금지 값**: `'1'` (`매우 불필요`), `'2'` (`불필요`) 체크 원천 금지.
     - **허용 응답 값**: **`'3'` (`보통`), `'4'` (`필요`), `'5'` (`매우 필요`)** 셋 중 하나로만 응답.
  2. **기입력 보존(`preserveExisting: true`) 시에도 1·2 값 자동 교정 및 `Agree.asp` 진입 전 전수 자동 치유**:
     - 기존에 `'1'` 또는 `'2'`가 선택되어 있던 슬롯이라도 즉시 `'3'`, `'4'`, `'5'` 중 하나로 덮어쓰도록 보강.
     - 중간 단계 점프(`NextPage`)로 `Agree.asp`에 직행한 슬롯에 대해서도 `Agree.asp` 도달 시 `P7`, `P8`, `P10`, `P17`의 `currData`를 전수 점검하여 `'1'`, `'2'` 또는 미응답(`''`)을 `'3'`, `'4'`, `'5'`로 100% 자동 치유.
  3. **대시보드 STEP 2 UI 카드 정비 (`public/survey-detail.js`)**:
     - `[카드 3] 시설필요도 응답 방식`에서 불필요 옵션을 제거하고 `'보통(3)·필요(4)·매우 필요(5) 중 랜덤 선택 (기본 권장)'` 및 `'보통(3)' / '필요(4)' / '매우 필요(5)' 일괄 고정` 옵션으로 정비.

---

## 4. 관련 파일 위치 정리
- 상인회 실행 러너: [`src/engine/kstat-assoc-runner.js`](file:///c:/Users/sisun/onlinepoll/src/engine/kstat-assoc-runner.js)
- 상인회 슬롯 스크래퍼: [`src/engine/kstat-assoc-slot-scraper.js`](file:///c:/Users/sisun/onlinepoll/src/engine/kstat-assoc-slot-scraper.js)
- 시장 축제 명칭 조회기: [`src/utils/market-festival-finder.js`](file:///c:/Users/sisun/onlinepoll/src/utils/market-festival-finder.js)
- 상인회 마스터 블루프린트: [`data/kstat_assoc_blueprint.json`](file:///c:/Users/sisun/onlinepoll/data/kstat_assoc_blueprint.json)
- 백엔드 라우터: [`src/server.js`](file:///c:/Users/sisun/onlinepoll/src/server.js)
- 프론트 상세 화면: [`public/survey-detail.html`](file:///c:/Users/sisun/onlinepoll/public/survey-detail.html), [`public/survey-detail.js`](file:///c:/Users/sisun/onlinepoll/public/survey-detail.js)
- 검증용 테스트 스크립트:
  - `scripts/test_p4_a8_e2e.js` (P4 A8 운영시간 주입 E2E 실전 검증 스크립트)
  - `scripts/test-assoc-rules-e2e.js` (신규 규칙 실전 완주 E2E 검증 스크립트)
  - `scripts/test-assoc-pilot-run.js` (파일럿 실행 테스트)
  - `scripts/verify_merchant_assoc_integration.js` (모듈 통합 단위 테스트)

