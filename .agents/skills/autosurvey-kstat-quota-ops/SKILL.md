---
name: autosurvey-kstat-quota-ops
description: Comprehensive technical reference and operational guide for the AutoSurvey AI Kstat 15-step survey automation engine (FLOW_RULES, VALIDATION_RULES, 3-group Master Baseline, dynamic sub-frame synchronization) and B2B Quota Builder (multi-sweep candidate extraction, per-item checkpointing & resume, 215-person CEO profile pool, 12-column schema & item normalization). Activate whenever modifying Kstat survey logic, persona generation, quota building, or survey/quota tables.
---

# AutoSurvey AI — Kstat Automation & Quota Builder Skill

## 1. Core Principles (Non-Negotiable)
1. **No Browser Subagent**: Never invoke `browser_subagent` for UI verification; verify only via Node scripts, REST APIs, and logs.
2. **Zero Fabricated Results**: Never fabricate execution results or fake business registrations.
3. **No Local Daemons/Tunnels**: Never run background servers or tunnels on the user's local PC; production runs on GCP (`http://34.64.233.77:3000`).
4. **No Deploy During Active Batch**: Always check `GET /api/survey/status` (`isRunning === false`) before running `git push origin main`.
5. **No Runtime Overwrite & Untracked Campaigns DB**: `data/campaigns.json` is a runtime user state database and must NEVER be tracked by Git or overwritten during `git pull`. Always keep it excluded in `.gitignore` and untracked (`git rm --cached`). Before any `git pull`, verify no runtime data overwrite occurs.
6. **Progressive Disclosure & User Journey Verification**: Analyze complete UX flow (Empty State ➔ Quota Binding ➔ Baseline ➔ Run) before development; hide posterior steps when quotas are 0; verify every button cited in guidance text actually exists in the DOM.
7. **Frontend JS Syntax Check Before Deploy**: Never deploy frontend Vanilla JS without passing `node scripts/test_mock_browser.js` with 0 SyntaxError/ReferenceError.
8. **Playwright `evaluate()` Single Object Argument**: Never pass multiple arguments to `page.evaluate()` or `frame.evaluate()`; always wrap in `{ key1, key2 }`. Never silence errors with empty `.catch(() => {})`.
9. **Headless E2E Simulation (`Success: true`) Before Deploy**: When modifying survey automation runners, always verify a complete run (Step 1 to 15 Agree) on a real slot URL in terminal headless Playwright, confirming `Success: true` with zero unhandled alert traps.

---

## 2. B2B Quota Builder & 12-Column Standard Architecture

### 2.1 Unified 12-Column Schema
Both `public/quota-detail.html` and `public/survey-detail.html` (and all exported `.xlsx` / `.json` files) must strictly follow this column order:
1. `[번호]` (`seq`)
2. `[상호]` (`companyName`)
3. `[업종]` (`industry`)
4. `[사업자번호]` (`bizNumber` — `XXX-XX-XXXXX`, 12 chars with hyphens)
5. `[대표자이름]` (`ceoName` — inline editable)
6. `[성별]` (`ceoGender` — `남` / `여`, inline editable)
7. `[나이]` (`ceoAge` — integer age, inline editable)
8. `[연락처]` (`phone`)
9. `[개업연월]` (`openDate` — `YYYY-MM-DD` or `YYYY.MM`, must be `<= 2025` for Kstat A5 validation)
10. `[주소]` (`address` — sanitized road address, stripped of `주소정보 갱신`)
11. `[취급품목]` (`handledItems` — 9 standard major categories only)
12. `[주요품목]` (`mainProducts` — single-word specific product)
*(In `survey-detail.html`, `[설문상태]` is appended as the 13th status column.)*

### 2.2 Two-Stage Item Normalization (`src/utils/item-normalizer.js`)
- **`handledItems` (취급품목)**: Strictly one of the 9 standard categories (`농산물`, `축산물`, `수산물`, `가공식품`, `의류및신발`, `가정용품`, `음식점업`, `기타소매업`, `근린상권서비스`).
- **`mainProducts` (주요품목)**:
  - If the raw item string contains parentheses like `가공식품 (떡류)` or `음식점업 (치킨)`, extract a single core word from inside the parentheses (`떡류`, `치킨`).
  - If no parentheses exist, infer a single core word from `companyName` + `industry` (e.g., `청과`, `채소`, `한우`, `정육`, `활어`, `반찬`, `한식`, `분식`, `의류`, `신발`, `침구`, `철물`, `약국`, `한의원`, `미용`).

### 2.3 215-Person CEO Profile Pool (`data/ceo_profile_pool.json` & `src/utils/ceo-pool.js`)
- Whenever `ceoName`, `ceoGender`, or `ceoAge` is missing during quota generation or enrichment:
  - If `ceoName` exists, match by name or infer gender and assign a realistic age from the 215-person pool.
  - If `ceoName` is missing, deterministically select a complete `{ name, gender, age }` profile from `data/ceo_profile_pool.json` seeded by the 10-digit `bizNumber`.

### 2.4 Multi-Sweep Candidate Extraction (`src/engine/onnuri.js` & `src/engine/hybrid-quota.js`)
- Because Onnuri Master DB (`data/onnuri_master_db.json` — 3,996 traditional markets, shopping districts, alley-type shopping districts, and 205,429 merchants) stores registration dates (`regDate`), filtering out `openYear > 2025` happens during Stage 2 (MarketBz lookup).
- `getStratifiedMarketMerchants` extracts up to **4x candidates (minimum +8 buffer)** per industry bucket (`candidatePool`).
- `hybrid-quota.js` iterates through candidates until each industry bucket reaches 100% of its target quota, performing multi-sweep fallback across remaining market merchants if needed.

### 2.5 Per-Item Checkpointing & Smart Resume (`src/engine/hybrid-quota.js` & `src/server.js`)
- **Deterministic Filename**: `quota_onnuri_2026_{시장명}_업종별{N}개_조사쿼터.json` (and `.xlsx`).
- **Per-Item Save**: Every single merchant enriched via MarketBz triggers an immediate checkpoint write to JSON and XLSX (`status: "partial"`, `completedCount`, `targetCount`).
- **Smart Resume (`POST /api/quota/resume-onnuri`)**: On re-run or resume, items that already have `companyName`, `openDate`, and `address` skip MarketBz lookup in `0.001s`, resuming strictly from the first incomplete item.

---

## 3. Kstat 15-Step Survey Engine & 3-Group Master Baseline (`src/engine/kstat-runner.js`, `src/engine/persona-builder.js`)

### 3.1 Critical DOM Trap: Hidden `PVALUE=1` Input
- Every Kstat `.asp` child frame contains `<input type="hidden" name="PVALUE" value="1">` as the first `<input>` inside `<form name="Survey">`.
- **NEVER** use `input[value="1"]` or Playwright's `frame.click('#ID, input[value="1"]')` — it matches the hidden `PVALUE` input first, leaves the radio button unchecked, and causes Playwright `.click()` to hang for 30,000ms waiting for the hidden input to become visible.
- **ALWAYS** use `selectKstatRadio(frame, varName, val)` or `input[type="radio"][value="..."]` which sets `checked = true`, calls `setRadioValue(varName, val)`, dispatches `change`, and triggers the parent `<td>`'s `onclick`.

### 3.2 Dynamic Sub-Frame Synchronization (`syncDynamicFrames` & `autoFillUnansweredVisibleFrames`)
- After selecting parent radios in any step (`P1` ~ `P14`), call `await syncDynamicFrames(page)` before clicking `#next`.
- `syncDynamicFrames(page)` invokes Kstat's `updateStepView()`, `getVisibleChildCodes()`, `ensureFrameLoaded()`, and `processFrameLoadQueue()` on the parent page and waits until every visible container has `data-merge-loaded="1"`.
- Before clicking `#next`, `await autoFillUnansweredVisibleFrames(page, persona, biz)` runs up to 3 passes checking `isChildAnswered(child.id)` on all visible child frames and automatically fills any unanswered dynamic sub-frame.

### 3.3 Complete Kstat `FLOW_RULES` & `VALIDATION_RULES` Mapping
- **P1 (`A1`~`A5`)**: `A4=1` -> `A4A.asp` (12-char `XXX-XX-XXXXX` `bizNumber`). `A5_1` (`openYear`) must be `<= 2025`.
- **P2 (`A6`~`A10`)**: `A6_1` (㎡) and `A6_2` (평) integer values; `A7=12` months; `A10` employee counts linked to sales (`empSalesLink`).
- **P3 (`B1`, `B1A`)**: `B1_1` (`dailySales`), `B1_2` (`annualSales`), `B1A_1..4` quarterly ratios summing to exact `100%`.
- **P4 (`B1B`~`B1F`)**:
  - `B1BA` (`annualProfit`) and `B1BA_1` (`exactMarginRate` %) mathematically matched.
  - `B1BB=1` (영업이익 증가) -> spawns **`B1BC.asp`** (3-rank choices from `1..8`).
  - `B1BB=2` (영업이익 감소) -> spawns **`B1BD.asp`** (3-rank choices from `1..7`).
  - `B1C` (1일 평균 구매 고객수) & **`B1C_9` (지역 외 고객 비중)**: 약 90%의 점포는 `B1C_9`('모름') 체크박스를 선택하고 `B1C_1`(퍼센트) 미입력(공란/disabled 유지), 나머지 10% 점포만 10~30% 비중 분산 입력. **[CRITICAL ALERT TRAP 방어]** Kstat 검사식 `(!$("#B1C_9").is(":checked") && parseFloat($("#B1C_1").val()||0) == 0)`을 원천 차단하기 위해 `chk.checked = true`와 `$(chk).prop('checked', true)`를 원자적 동시 주입하고, 모름 미체크 시 `B1C_1`에 안전값('15')이 보장되도록 Fail-Safe 검증 필수.
  - `B1E` (월 평균 영업일수) clamped to `1..30` (`31` triggers alert).
- **P5 (`B2`, `B2A`, `B3`)**:
  - `B2` 결제수단 취급 여부 점포별 자연 분산: `현금`(`B2_1=1`), `온누리`(`B2_2=1`), `신용카드`(`B2_5=1`) 필수 취급; `지역사랑상품권`(`B2_3`), `제로페이 모바일결제 등`(`B2_4`)은 점포별 취급(1)/미취급(2) 자연 분산 (기준점 가이드 `localPayMember`, `zeropayMember` 연동).
  - `B2A` 5대 결제수단 비중 5% 단위 필수 입력 & 합계 100% 보장: `현금`(`B2A_1`), `온누리`(`B2A_2`), `지역사랑`(`B2A_3`), `제로페이 모바일결제 등`(`B2A_4`), `신용카드`(`B2A_5`) 5개 항목 모두 5% 단위로 배분 (예: 현금 5%, 온누리 5%, 지역사랑 5%, 제로페이 20%, 신용카드 65% 등, 총합 100%).
  - `B2.asp`는 각 항목 비중 `> 0`일 때 `1`(취급), `0`일 때 `2`(취급 안 함)으로 정밀 연동.
  - `B3_1 + B3_2 === 100` (온누리 지류 `B3_1` + 디지털 `B3_2` 비중 무조건 5% 단위 필수: 예 20%/80%, 30%/70%, 35%/65%, 40%/60%, 45%/55%, 50%/50% 등).
- **P6 (`B4`)**:
  - `B4_1` (인건비: `0` when regular/temp employees === 0) + `B4_2` (원재료비) + `B4_3` (임차료) + `B4_4` (`10%`, `TB4_4="세금"`) === `100%`.
- **P7 (`B5`)**:
  - **Cross-Page Rule**: When P5 `B3_2 >= 1`, Kstat `VALIDATION_RULES["B5A1"]` forbids `@B5A_1=2`. Always set `B5A_1 = 1` (온누리 가맹).
  - P5 B2A에서 지역사랑 비중이 있을 시 `B5A_2 = 1`(가맹), 없을 시 `B5A_2 = 2`(미가맹 ➔ `B5AB.asp` 사유 `1..4` 연동).
  - `B5B_1` (`joinYear`) must be `>= A5_1` (`openYear`) and `<= 2025`.
  - `B5D_1=4,5` -> spawns **`B5E.asp`** (매출 증가율 %).
  - `B5F_1=4,5` -> spawns **`B5G.asp`** (고객 증가율 %).
  - `B5A_2=2` -> spawns **`B5AB.asp`** (지역사랑상품권 미가맹 사유 `1..4`).
- **P8 (`C1A`~`C1G`)**:
  - `C1B=1` -> `C1BA.asp`; `C1D=1` -> `C1DA.asp`; `C1E=1` -> `C1EA.asp`; `C1F=1` -> `C1FA.asp`; `C1G=2` -> `C1GA.asp`.
- **P9 (`C2A`~`C2E`)**:
  - `C2A=1` -> `C2AA.asp` (C2-1-1 전체 상품 수 대비 가격표시 비율: 무조건 5% 단위 입력, 80%, 85%, 90%, 95%, 100%).
  - `C2B=1` -> `C2BA.asp` (원산지표시 비율 %); `C2E` (국산 비중 %).
- **P10 (`D1`)**:
  - `D1=2` & `D1A=2,3` -> `D1B`, `D1C`, `D1D`.
  - `D1D=1,2` (임대료 상승/하락) -> spawns **`D1DA.asp`** (변동률 %).
- **P11 (`E1`)**:
  - `E1=1` (부채 있음) -> spawns **`E1A.asp`** (부채 금액 만원).
- **P12 (`E2A`~`E2C`)**:
  - `E2A=2` -> spawns **`E2AA.asp`** (화재보험 미가입 사유 `1..4`).
  - `E2B=2` -> spawns **`E2BA.asp`** (배상책임보험 미가입 사유 `1..4`).
  - `E2C=1` -> spawns **`E2CA.asp`** (화재 경험 횟수).
- **P13 (`F1`~`F3`)**:
  - `F1` (애로사항 1~3순위, valid options `1..8`).
  - `#A2 <= 39` (만 39세 이하 청년상인) -> spawns **`F2.asp`** (청년상인 애로사항 1~3순위, valid options `1..8`).
  - `F3` (희망 지원정책 1~3순위, valid options `1..10`).
- **P14 (`G1`, `G2`)**:
  - `G1=1` (계속 운영) -> spawns **`G1A.asp`** (`1`=승계계획 있음, `2`=없음) and **`G1B.asp`** (지속 운영 연수).
  - `G1=1 & G1A=1` -> spawns **`G1AA.asp`** (`1`=친인척 승계, `2`=타인 양도).
  - `G2` -> G2 문항 현금영수증 발행 가능 비중(`G2_2_NOTE`): 무조건 5% 단위 입력 (30%, 35%, 40%, 45%, 50%, 55% 등).

### 3.4 Surveyor Evaluation Engine & [H3] Random Selection Rule (`src/engine/kstat-eval-runner.js`)
- **Single Page with 3 Sub-Frames**: P26042401BA / P1.asp contains `H1.asp` (청결위생 5문항 5점 척도), `H2.asp` (점포현황 4문항), and `H3.asp` (고객응대 서비스 4문항 5점 척도).
- **[H3] 문항 응답 규칙**: 모든 [H3] 문항(`H3_1` ~ `H3_4` 및 동적 감지 라디오 그룹)은 `3. 보통`, `4. 양호`, `5. 매우양호` 항목 중에서 균등하게 무작위(Random) 선택 (`getRandomH3Rating`).

### 3.5 Critical Alert Traps & Fail-Safe Injection Rules
- **[B1-3] 지역 외 고객 비중 트랩 (`P4 / B1C.asp`)**:
  - Alert 조건: `(!$("#B1C_9").is(":checked") && (parseFloat($("#B1C_1").val()||0) == 0))`.
  - 해결 수칙:
    1. 반드시 `f.evaluate(({ unknown, rate }) => { ... }, { unknown: isUnknown, rate: ... })` 로 **단일 객체 인수** 전달 (Playwright `Too many arguments` 예외 원천 차단).
    2. 체크박스 조작 시 `if (!chk.checked) chk.click();` 로 네이티브 클릭 및 `B1C_NoneCheck(chk)` 동시 트리거.
    3. Fail-safe: 모름 체크가 안 되어 있고 비중이 0이면 무조건 모름 체크 및 `rate=15` 자동 백업.
- **[B5-2] 온누리상품권 가맹 시작 년도 트랩 (`P7 / B5B1.asp`, `B5B2.asp`)**:
  - Alert 조건: `온누리상품권 가맹 시작 년도는 A5(현 사업장 영업시작일)의 년도보다 이전일 수 없습니다.`
  - 해결 수칙: `joinYearVal = String(Math.min(2025, Math.max(openYear, onnuriYear, 2024)))` 로 A5 이상이면서 최소 2024년(또는 2025년 개업 시 2025년) 보장.
- **네비게이션 컨텍스트 소멸 트랩 (`page.evaluate #next`)**:
  - 페이지 이동 레이스 컨디션 시 `Execution context was destroyed` 예외를 방어하기 위해 `await page.evaluate(() => document.querySelector('#next')?.click()).catch(() => {});` 로 감싸서 진행.

## 4. Quota Address Auto-Healing & Enrichment
- `hasCompleteAddress(addr, marketName)`: Validates road numbers (`(?:로|길)\s*[\d-]+`), building names with numbers, or valid lot numbers, while filtering out unit-only (`101호`), floor-only (`1층`), or brand numbers (`59피자`).
- `searchAddressByCompany({ companyName, marketName, address })`: Maps market names to legitimate administrative districts (e.g. `남양주장현전통시장` -> `진접읍`), searches Naver Place/Search snippets with town matching, and automatically updates both JSON and Excel formats.

---

## 5. Kstat Slot Scraper & Multi-Account Architecture (`src/engine/kstat-slot-scraper.js`)
- **Login Session Activation**: When logging in with any surveyor credentials (`loginId`, `loginPw`), the scraper intercepts the lack of active project context and automatically executes `tapi_move('tapi', prid, prid, 'survey/' + prid + '/list')` with `?pridSel=${prid}&josa=tapi` to prevent the `ReferenceError: frm is not defined at goPage` trap.
- **Safe DOM Check**: Verifies `window.frm` and `document.frm` presence before invoking any pagination or filter submissions.
- **Multi-Page Pagination**: Automatically traverses `a[href*="curPage=N"]` links to extract all slots (supporting >25 slots seamlessly).

---

---

## 7. Kstat Multi-Account & Multi-Survey Registry
- **Surveyor Accounts**:
  - `가온김영옥` / `1234`: 점포경영 실태조사 (`PRID: 2026070802`, 설문코드 `P26042401B`, 평가코드 `P26042401BA`)
  - `가온박정순` / `1234`: 전통시장·상점가 및 점포경영 실태조사 - B.상인회조사 (`PRID: 2026070801`, 설문코드 `P26042401A`, 평가코드 `P26042401AA`)
- **Survey Types**:
  1. `kstat_traditional_market` (점포조사, 15단계 다중 iframe, 9대 업종 쿼터)
  2. `kstat_merchant_assoc` (상인회조사, 25단계 Q1~P23+Agree, A3~F4 전년도 응답 미러링, F5~G4 정책 가이드)
     - **시설필요도(`_3`) 3·4·5 제한 규칙**: `P7` (`C1_1_3`~`C1_9_3`), `P8` (`C2_1_3`~`C2_18_3`), `P10` (`C4_1_3`~`C4_5_3`), `P17` (`E1_1_3`~`E1_7_3`)의 모든 `(추가) 시설필요도` 문항에서는 **'매우 불필요(1)'와 '불필요(2)'를 절대 체크하지 않으며**, 반드시 **'보통(3)', '필요(4)', '매우 필요(5)' 셋 중 하나**로만 응답한다(기존에 1·2로 저장된 값도 즉시 3·4·5로 덮어쓰기 및 `Agree.asp` 진입 전 전수 자동 보정 수행).

