/**
 * scripts/test_settlement_system.js
 * 조사원 2티어 전용 설문조사 정산 시스템 전수 검증 스크립트
 * 1. HTML <-> JS DOM ID 전수 교차 검증 (누락 요소 0건 보장)
 * 2. 모의 DOM 상에서 Empty State -> 데이터 등록 후 Progressive Disclosure 렌더링 검증
 * 3. 격리된 임시 DB 환경에서 Express 정산 API 전 엔드포인트 및 정산 수식·엑셀 내보내기 검증
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import * as XLSX from 'xlsx';
import * as SettlementStore from '../src/models/settlement.js';
import { registerSettlementRoutes } from '../src/routes/settlement-routes.js';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// --------------------------------------------------------------------------
// [검증 1] settlement.html <-> settlement.js DOM ID 전수 교차 검증
// --------------------------------------------------------------------------
const htmlContent = fs.readFileSync(path.join(rootDir, 'public/settlement.html'), 'utf-8');
const jsContent = fs.readFileSync(path.join(rootDir, 'public/settlement.js'), 'utf-8');

const htmlIds = new Set();
const idRegex = /\bid="([^"]+)"/g;
let m;
while ((m = idRegex.exec(htmlContent)) !== null) {
  htmlIds.add(m[1]);
}

const jsIdRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
const missingIds = [];
while ((m = jsIdRegex.exec(jsContent)) !== null) {
  const refId = m[1];
  if (!htmlIds.has(refId)) {
    missingIds.push(refId);
  }
}

assert.strictEqual(
  missingIds.length,
  0,
  `settlement.html 에 누락된 DOM ID가 발견되었습니다: ${missingIds.join(', ')}`
);
console.log(`✅ [1/4] settlement.html <-> settlement.js DOM ID 교차 검증 통과 (총 ${htmlIds.size}개 ID 일치)`);

// --------------------------------------------------------------------------
// [검증 2] 격리 임시 DB 기반 Express API & 정산 수식 E2E 검증
// --------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl_test_'));
const tmpDbFile = path.join(tmpDir, 'settlements_test.json');
SettlementStore.setSettlementDbPath(tmpDbFile);

const app = express();
app.use(express.json());
registerSettlementRoutes({ app });

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

async function reqJson(pathname, opts = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const body = await res.json();
  return { status: res.status, body };
}

try {
  // 2-1. 초기 Empty State 검증 (거짓/더미 데이터 0건 확인)
  const initDash = await reqJson('/api/settlement/dashboard');
  assert.strictEqual(initDash.status, 200);
  assert.strictEqual(initDash.body.projects.length, 0);
  assert.strictEqual(initDash.body.partners.length, 0);
  assert.strictEqual(initDash.body.summary.myNetProfit, 0);

  // 2-2. 외부/수기 과제 생성 + 1티어 발주처 즉석 등록
  // 조건: 수주단가 20,000원 (1티어 3.3% 공제 ON), 3티어 기본단가 14,000원, 답례품 실비 +10,000원
  const createProj1 = await reqJson('/api/settlement/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: '2026 전통시장 방문객 만족도 조사',
      periodMonth: '2026-11',
      targetQuota: 30,
      tier1PartnerName: '케이스탯 박팀장',
      saveNewTier1Partner: true,
      unitPriceIn: 20000,
      defaultUnitPriceOut: 14000,
      taxWithholdingIn: true,
      extraAdjustmentIn: 10000
    })
  });
  assert.strictEqual(createProj1.status, 201);
  const p1Id = createProj1.body.id;
  assert.strictEqual(createProj1.body.unitMargin, 6000);

  // 2-3. 내 직접 수행 부수 입력: 완료 10건 -> autoSyncApproved=true 이므로 확정 10건 자동 반영, 이후 반려 1건 발생해 확정 9건으로 조정
  await reqJson(`/api/settlement/projects/${p1Id}/my-work`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedCount: 10, completedCount: 10 })
  });
  const afterMyReject = await reqJson(`/api/settlement/projects/${p1Id}/my-work`, {
    method: 'PATCH',
    body: JSON.stringify({ approvedCount: 9 })
  });
  assert.strictEqual(afterMyReject.body.myWork.completedCount, 10);
  assert.strictEqual(afterMyReject.body.myWork.approvedCount, 9);

  // 2-4. 3티어 조사원 즉석 등록 및 분배 (완료 15건 = 확정 15건, 지급단가 14,000원, 3.3% 공제 ON)
  const addAlloc1 = await reqJson(`/api/settlement/projects/${p1Id}/allocations`, {
    method: 'POST',
    body: JSON.stringify({
      newPartnerName: '김민지 조사원',
      phone: '010-2222-3333',
      bankName: '신한',
      accountNumber: '110-123-456789',
      assignedCount: 20,
      completedCount: 15,
      unitPriceOut: 14000,
      taxWithholdingOut: true
    })
  });
  assert.strictEqual(addAlloc1.status, 201);
  const m1 = addAlloc1.body.metrics;
  const tier3PartnerId = addAlloc1.body.allocations[0].partnerId;

  // 정산 수식 정밀 검증:
  // - 총 인정 부수 = 내 확정(9) + 3티어 확정(15) = 24건
  // - 1티어 세전 수주액 = 24 * 20,000 = 480,000원
  // - 1티어 3.3% 세금 = Math.floor(480,000 * 0.033) = 15,840원
  // - 1티어 실수령액 = 480,000 - 15,840 + 실비 10,000 = 474,160원
  // - 3티어 세전 지급액 = 15 * 14,000 = 210,000원
  // - 3티어 3.3% 세금 = Math.floor(210,000 * 0.033) = 6,930원
  // - 3티어 실송금액 = 210,000 - 6,930 = 203,070원
  // - 내 최종 순수익 = 474,160 - 203,070 = 271,090원
  assert.strictEqual(m1.totalApprovedCount, 24);
  assert.strictEqual(m1.grossReceivable, 480000);
  assert.strictEqual(m1.taxIn, 15840);
  assert.strictEqual(m1.netReceivable, 474160);
  assert.strictEqual(m1.totalNetPayable, 203070);
  assert.strictEqual(m1.totalUnpaidOut, 203070);
  assert.strictEqual(m1.myNetProfit, 271090);

  // 2-5. 두 번째 과제 생성 후 동일 3티어 조사원(김민지) 배정 -> 송금함 합산 검증
  const createProj2 = await reqJson('/api/settlement/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: '2026 지역 상권 이용실태 조사',
      periodMonth: '2026-11',
      targetQuota: 10,
      unitPriceIn: 15000,
      defaultUnitPriceOut: 10000,
      taxWithholdingIn: false
    })
  });
  const p2Id = createProj2.body.id;

  await reqJson(`/api/settlement/projects/${p2Id}/allocations`, {
    method: 'POST',
    body: JSON.stringify({
      partnerId: tier3PartnerId,
      assignedCount: 5,
      completedCount: 5,
      unitPriceOut: 10000,
      taxWithholdingOut: false
    })
  });

  const dashBeforePay = await reqJson('/api/settlement/dashboard?periodMonth=2026-11');
  assert.strictEqual(dashBeforePay.body.remittanceGroups.length, 1);
  // 김민지 총 미송금 합계 = 203,070 + 50,000 = 253,070원
  assert.strictEqual(dashBeforePay.body.remittanceGroups[0].totalUnpaidBalance, 253070);

  // 2-6. 3티어 송금함에서 일괄 송금완료 처리 검증
  const bulkPay = await reqJson(`/api/settlement/remittance/${tier3PartnerId}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ periodMonth: '2026-11' })
  });
  assert.strictEqual(bulkPay.status, 200);
  assert.strictEqual(bulkPay.body.updatedCount, 2);

  const dashAfterPay = await reqJson('/api/settlement/dashboard?periodMonth=2026-11');
  assert.strictEqual(dashAfterPay.body.summary.totalUnpaidOut, 0);

  // 2-7. AutoSurvey 캠페인 동기화 헬퍼 검증
  const mockAutoCampaign = {
    id: 'camp_mock_sync_1',
    title: '[테스트] AutoSurvey 연동 캠페인',
    surveyType: 'kstat_store',
    status: 'ready',
    quotaDatabase: [
      { quotaStatus: 'completed' },
      { quotaStatus: 'completed' },
      { quotaStatus: 'completed' },
      { quotaStatus: 'pilot_done' },
      { quotaStatus: 'ready' }
    ]
  };
  const projLinked = SettlementStore.createProject({
    title: mockAutoCampaign.title,
    unitPriceIn: 25000,
    defaultUnitPriceOut: 17000,
    applyCampaignCompletedToMyWork: true
  }, mockAutoCampaign);
  assert.strictEqual(projLinked.myWork.completedCount, 3);
  assert.strictEqual(projLinked.autoSurveyWaitingRef, 1);

  // 캠페인 완료 건수가 3 -> 5건으로 증가했을 때 applyDiffToMyWork 검증
  mockAutoCampaign.quotaDatabase[3].quotaStatus = 'completed';
  mockAutoCampaign.quotaDatabase[4].quotaStatus = 'completed';
  const syncedProj = SettlementStore.syncProjectWithCampaign(projLinked.id, mockAutoCampaign, { applyDiffToMyWork: true });
  assert.strictEqual(syncedProj.myWork.completedCount, 5);
  assert.strictEqual(syncedProj.metrics.netReceivable, 125000);

  console.log('✅ [2/4] 정산 원장 수식(1티어 청구·3.3% 세금·실비·3티어 합산 송금·AutoSurvey 동기화) 검증 통과');

  // --------------------------------------------------------------------------
  // [검증 3] 다중 시트 Excel(.xlsx) 다운로드 바이너리 파싱 검증
  // --------------------------------------------------------------------------
  const excelRes = await fetch(`${baseUrl}/api/settlement/export/excel?periodMonth=all`);
  assert.strictEqual(excelRes.status, 200);
  const arrayBuf = await excelRes.arrayBuffer();
  const wb = XLSX.read(Buffer.from(arrayBuf), { type: 'buffer' });
  assert.deepStrictEqual(wb.SheetNames, ['과제별_정산요약', '3티어_분배및송금', '거래처_조사원장부']);
  const summaryRows = XLSX.utils.sheet_to_json(wb.Sheets['과제별_정산요약']);
  assert.strictEqual(summaryRows.length, 3);
  console.log('✅ [3/4] 다중 시트 Excel(.xlsx) 다운로드 및 시트 무결성 검증 통과');

  // --------------------------------------------------------------------------
  // [검증 4] 프론트엔드 settlement.js 모의 DOM 렌더링 검증 (Empty State -> Active State)
  // --------------------------------------------------------------------------
  const domMap = new Map();
  function makeMockNode(id = '') {
    return {
      id,
      value: '',
      checked: false,
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      },
      addEventListener: () => {},
      getAttribute: () => null,
      hasAttribute: () => false,
      querySelectorAll: () => [],
      closest: () => null
    };
  }
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.__IS_MOCK_DOM = true;
  globalThis.window = globalThis;
  globalThis.document = {
    readyState: 'complete',
    getElementById: (id) => {
      if (!domMap.has(id)) domMap.set(id, makeMockNode(id));
      return domMap.get(id);
    },
    querySelectorAll: () => [],
    createElement: (tag) => makeMockNode(tag),
    body: makeMockNode('body'),
    addEventListener: () => {}
  };
  globalThis.fetch = async (u, opts) => {
    const targetUrl = String(u).startsWith('http') ? String(u) : `${baseUrl}${u}`;
    return nativeFetch(targetUrl, opts);
  };

  await import('../public/settlement.js');
  await new Promise(r => setTimeout(r, 80));

  const renderedProfit = domMap.get('stat-my-net-profit')?.textContent || '';
  assert.ok(renderedProfit.includes('원'), '순수익 표시가 정상 렌더링되어야 합니다.');
  const detailHtml = domMap.get('project-detail-body')?.innerHTML || '';
  assert.ok(detailHtml.includes('open-add-alloc'), '과제 상세 화면에 3티어 분배 추가 액션 버튼이 존재해야 합니다.');
  console.log('✅ [4/4] 프론트엔드 settlement.js 모의 DOM 실행 및 Progressive Disclosure 버튼 렌더링 통과');
} finally {
  server.close();
  SettlementStore.setSettlementDbPath(null);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
