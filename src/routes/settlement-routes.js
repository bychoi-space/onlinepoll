/**
 * 조사원 2티어 전용 설문조사 정산 시스템 API 라우터
 * - AutoSurvey 등록 캠페인 연동 및 외부/수기 과제 단독 등록 동시 지원
 * - 모바일/태블릿 실시간 부수 스테퍼, 1티어 수금 상태, 3티어 송금함 및 다중 시트 Excel 다운로드 제공
 */
import * as XLSX from 'xlsx';
import * as CampaignStore from '../models/campaign.js';
import * as SettlementStore from '../models/settlement.js';
import { logger } from '../utils/logger.js';

function setNoCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
}

function inflowStatusKo(status) {
  if (status === 'received') return '입금완료';
  if (status === 'billed') return '청구완료';
  return '정산대기';
}

function payoutStatusKo(status) {
  if (status === 'paid') return '송금완료';
  if (status === 'partial') return '부분지급';
  return '미지급';
}

function autoSizeColumns(rows) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(key => {
    let maxLen = Array.from(key).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0) + 2;
    for (const r of rows) {
      const val = String(r[key] ?? '');
      const len = Array.from(val).reduce((acc, ch) => acc + (ch.charCodeAt(0) > 128 ? 2 : 1), 0);
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 52) };
  });
}

export function registerSettlementRoutes({ app }) {
  // 단축 URL 진입 지원
  app.get('/settlement', (_req, res) => {
    return res.redirect('/settlement.html');
  });

  // 1. 통합 정산 대시보드 스냅샷 조회 (월별 필터 + AutoSurvey 실시간 완료 건수 비교 포함)
  app.get('/api/settlement/dashboard', (req, res) => {
    setNoCache(res);
    try {
      const periodMonth = String(req.query.periodMonth || 'all');
      const payload = SettlementStore.buildSettlementDashboardPayload({ periodMonth });

      // 연동된 AutoSurvey 캠페인의 현재 실시간 완료 건수 부착
      const campaigns = CampaignStore.getAllCampaigns();
      const campMap = new Map(campaigns.map(c => [c.id, c]));

      payload.projects = payload.projects.map(proj => {
        if (!proj.linkedCampaignId) return proj;
        const camp = campMap.get(proj.linkedCampaignId);
        if (!camp) {
          return {
            ...proj,
            liveCampaignStats: null
          };
        }
        const liveStats = SettlementStore.extractAutoSurveyCampaignStats(camp);
        return {
          ...proj,
          liveCampaignStats: liveStats
        };
      });

      return res.json(payload);
    } catch (err) {
      logger.error(`[정산 대시보드 오류] ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. AutoSurvey에 등록된 캠페인 목록 조회 (정산 과제로 불러오기 모달용)
  app.get('/api/settlement/available-campaigns', (_req, res) => {
    setNoCache(res);
    try {
      const campaigns = CampaignStore.getAllCampaigns();
      const existingProjects = SettlementStore.getAllProjects();
      const linkedMap = new Map();
      existingProjects.forEach(p => {
        if (p.linkedCampaignId) {
          linkedMap.set(p.linkedCampaignId, p.id);
        }
      });

      const list = campaigns.map(c => {
        const stats = SettlementStore.extractAutoSurveyCampaignStats(c);
        return {
          ...stats,
          alreadyLinkedProjectId: linkedMap.get(c.id) || null
        };
      });

      return res.json(list);
    } catch (err) {
      logger.error(`[정산 연동 캠페인 조회 오류] ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. 새 정산 과제 생성 (AutoSurvey 연동 또는 외부 수기 등록)
  app.post('/api/settlement/projects', (req, res) => {
    try {
      const body = req.body || {};
      let linkedCampaign = null;
      if (body.linkedCampaignId) {
        linkedCampaign = CampaignStore.getCampaignById(String(body.linkedCampaignId));
        if (!linkedCampaign) {
          return res.status(404).json({ error: '선택한 AutoSurvey 캠페인을 찾을 수 없습니다.' });
        }
      }
      const created = SettlementStore.createProject(body, linkedCampaign);
      logger.info(`[정산 과제 등록] "${created.title}" (${created.sourceType === 'autosurvey' ? 'AutoSurvey 연동' : '직접 등록'})`);
      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 4. 정산 과제 기본 정보 / 단가 / 1티어 수금 상태 수정
  app.patch('/api/settlement/projects/:id', (req, res) => {
    try {
      const updated = SettlementStore.updateProject(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: '정산 과제를 찾을 수 없습니다.' });
      }
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 5. 정산 과제 삭제
  app.delete('/api/settlement/projects/:id', (req, res) => {
    try {
      const ok = SettlementStore.deleteProject(req.params.id);
      if (!ok) {
        return res.status(404).json({ error: '정산 과제를 찾을 수 없습니다.' });
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. AutoSurvey 연동 캠페인 완료 건수 동기화
  app.post('/api/settlement/projects/:id/sync-campaign', (req, res) => {
    try {
      const proj = SettlementStore.getProjectById(req.params.id);
      if (!proj) {
        return res.status(404).json({ error: '정산 과제를 찾을 수 없습니다.' });
      }
      if (!proj.linkedCampaignId) {
        return res.status(400).json({ error: 'AutoSurvey 캠페인과 연결되지 않은 수기 과제입니다.' });
      }
      const camp = CampaignStore.getCampaignById(proj.linkedCampaignId);
      if (!camp) {
        return res.status(404).json({ error: '원본 AutoSurvey 캠페인이 삭제되었거나 존재하지 않습니다.' });
      }
      const applyDiffToMyWork = Boolean(req.body?.applyDiffToMyWork);
      const synced = SettlementStore.syncProjectWithCampaign(proj.id, camp, { applyDiffToMyWork });
      const liveStats = SettlementStore.extractAutoSurveyCampaignStats(camp);
      return res.json({
        ...synced,
        liveCampaignStats: liveStats
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 7. 내 직접 수행(2티어 본인) 부수 수정
  app.patch('/api/settlement/projects/:id/my-work', (req, res) => {
    try {
      const updated = SettlementStore.updateMyWork(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: '정산 과제를 찾을 수 없습니다.' });
      }
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 8. 3티어 조사원 분배 추가
  app.post('/api/settlement/projects/:id/allocations', (req, res) => {
    try {
      const updated = SettlementStore.addAllocation(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: '정산 과제를 찾을 수 없습니다.' });
      }
      return res.status(201).json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 9. 3티어 조사원 분배 수정 (부수 스테퍼, 단가, 송금 상태 등)
  app.patch('/api/settlement/projects/:id/allocations/:allocId', (req, res) => {
    try {
      const updated = SettlementStore.updateAllocation(req.params.id, req.params.allocId, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: '해당 분배 내역을 찾을 수 없습니다.' });
      }
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 10. 3티어 조사원 분배 삭제
  app.delete('/api/settlement/projects/:id/allocations/:allocId', (req, res) => {
    try {
      const updated = SettlementStore.deleteAllocation(req.params.id, req.params.allocId);
      if (!updated) {
        return res.status(404).json({ error: '해당 분배 내역을 찾을 수 없습니다.' });
      }
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. 1티어 발주처 / 3티어 조사원 장부 CRUD
  app.post('/api/settlement/partners', (req, res) => {
    try {
      const created = SettlementStore.createPartner(req.body || {});
      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/settlement/partners/:id', (req, res) => {
    try {
      const updated = SettlementStore.updatePartner(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: '거래처/조사원 정보를 찾을 수 없습니다.' });
      }
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/settlement/partners/:id', (req, res) => {
    try {
      const ok = SettlementStore.deletePartner(req.params.id);
      if (!ok) {
        return res.status(404).json({ error: '거래처/조사원 정보를 찾을 수 없습니다.' });
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 12. 3티어 송금함 - 특정 조사원 미지급금 일괄 송금완료 처리
  app.post('/api/settlement/remittance/:partnerId/mark-paid', (req, res) => {
    try {
      const periodMonth = String(req.body?.periodMonth || 'all');
      const result = SettlementStore.markPartnerAllocationsPaid(req.params.partnerId, { periodMonth });
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 13. 정산 내역 다중 시트 Excel(.xlsx) 다운로드
  app.get('/api/settlement/export/excel', (req, res) => {
    try {
      const periodMonth = String(req.query.periodMonth || 'all');
      const payload = SettlementStore.buildSettlementDashboardPayload({ periodMonth });

      const projectRows = payload.projects.map((p, idx) => ({
        'No': idx + 1,
        '귀속월': p.periodMonth || '',
        '과제명': p.title,
        '등록방식': p.sourceType === 'autosurvey' ? 'AutoSurvey 연동' : '직접 등록',
        '1티어 발주처': p.tier1PartnerName || '-',
        '목표부수': p.targetQuota,
        '수주단가(1티어)': p.unitPriceIn,
        '기본지급단가(3티어)': p.defaultUnitPriceOut,
        '내 확정부수': p.metrics.myApproved,
        '3티어 확정부수': p.metrics.tier3ApprovedTotal,
        '총 인정부수': p.metrics.totalApprovedCount,
        '1티어 세전청구액': p.metrics.grossReceivable,
        '1티어 3.3%공제': p.metrics.taxIn,
        '1티어 실비가감': p.extraAdjustmentIn || 0,
        '1티어 실수령액': p.metrics.netReceivable,
        '1티어 수금상태': inflowStatusKo(p.inflowStatus),
        '3티어 실지급총액': p.metrics.totalNetPayable,
        '3티어 미지급잔액': p.metrics.totalUnpaidOut,
        '내 최종순수익': p.metrics.myNetProfit,
        '메모': p.memo || ''
      }));

      const allocRows = [];
      let seq = 1;
      payload.projects.forEach(p => {
        p.allocations.forEach(a => {
          allocRows.push({
            'No': seq++,
            '귀속월': p.periodMonth || '',
            '과제명': p.title,
            '3티어 조사원': a.partnerName,
            '연락처': a.partnerPhone || '',
            '은행': a.bankName || '',
            '계좌번호': a.accountNumber || '',
            '예금주': a.accountHolder || '',
            '할당부수': a.assignedCount,
            '완료부수': a.completedCount,
            '확정부수': a.approvedCount,
            '지급단가': a.unitPriceOut,
            '세전금액': a.grossPayable,
            '3.3%원천징수': a.taxOut,
            '추가실비': a.extraAdjustmentOut || 0,
            '실송금액': a.netPayable,
            '미지급잔액': a.unpaidBalance,
            '송금상태': payoutStatusKo(a.payoutStatus),
            '송금일시': a.paidAt ? new Date(a.paidAt).toLocaleDateString('ko-KR') : '',
            '메모': a.memo || ''
          });
        });
      });

      const partnerRows = payload.partners.map((pt, idx) => ({
        'No': idx + 1,
        '구분': pt.tier === 'tier1' ? '1티어 (발주처)' : '3티어 (조사원)',
        '이름/상호': pt.name,
        '연락처': pt.phone || '',
        '은행': pt.bankName || '',
        '계좌번호': pt.accountNumber || '',
        '예금주': pt.accountHolder || '',
        '기본단가': pt.defaultUnitPrice || 0,
        '기본3.3%공제': pt.defaultTaxWithholding ? 'Y' : 'N',
        '참여과제수': pt.stats.projectCount,
        '누적확정부수': pt.stats.totalApprovedCount,
        '누적정산액': pt.stats.totalAmount,
        '미수_미지급잔액': pt.stats.unpaidOrUncollected,
        '메모': pt.memo || ''
      }));

      const wb = XLSX.utils.book_new();

      const wsProjects = XLSX.utils.json_to_sheet(
        projectRows.length > 0 ? projectRows : [{ '안내': '등록된 정산 과제가 없습니다.' }]
      );
      wsProjects['!cols'] = autoSizeColumns(projectRows.length > 0 ? projectRows : [{ '안내': '등록된 정산 과제가 없습니다.' }]);
      XLSX.utils.book_append_sheet(wb, wsProjects, '과제별_정산요약');

      const wsAllocs = XLSX.utils.json_to_sheet(
        allocRows.length > 0 ? allocRows : [{ '안내': '등록된 3티어 분배 내역이 없습니다.' }]
      );
      wsAllocs['!cols'] = autoSizeColumns(allocRows.length > 0 ? allocRows : [{ '안내': '등록된 3티어 분배 내역이 없습니다.' }]);
      XLSX.utils.book_append_sheet(wb, wsAllocs, '3티어_분배및송금');

      const wsPartners = XLSX.utils.json_to_sheet(
        partnerRows.length > 0 ? partnerRows : [{ '안내': '등록된 거래처 및 조사원이 없습니다.' }]
      );
      wsPartners['!cols'] = autoSizeColumns(partnerRows.length > 0 ? partnerRows : [{ '안내': '등록된 거래처 및 조사원이 없습니다.' }]);
      XLSX.utils.book_append_sheet(wb, wsPartners, '거래처_조사원장부');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const labelMonth = periodMonth === 'all' ? '전체기간' : periodMonth;
      const fileName = encodeURIComponent(`설문조사_정산원장_${labelMonth}.xlsx`);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
      return res.send(buf);
    } catch (err) {
      logger.error(`[정산 엑셀 내보내기 오류] ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });
}
