/**
 * 설문 자동화 작업 상태 관리 서비스 (최대 2개 캠페인 동시 가동 이중화 지원)
 * - 동일 캠페인 중복 실행 차단
 * - 동일 외부 조사원 계정(loginId / kstatLoginId) 공유 캠페인 간 동시 실행 충돌 방지
 * - MAX_CONCURRENT_TASKS 슬롯 상태 및 실시간 진행률 관리
 */
import * as CampaignStore from '../models/campaign.js';
import { logger } from '../utils/logger.js';

export const MAX_CONCURRENT_TASKS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_TASKS || '2', 10));
export const runningTasks = new Map(); // campaignId -> { campaignId, title, isRunning, progress, startTime, mode }

export function getActiveTasksList() {
  const list = [];
  for (const [cid, task] of runningTasks.entries()) {
    if (task && task.isRunning) {
      list.push(task);
    } else {
      runningTasks.delete(cid);
    }
  }
  return list;
}

export function isCampaignTaskRunning(campaignId) {
  if (!campaignId) return getActiveTasksList().length > 0;
  const task = runningTasks.get(campaignId);
  return Boolean(task && task.isRunning);
}

export function checkCanStartCampaignTask(campaign) {
  const activeList = getActiveTasksList();
  if (isCampaignTaskRunning(campaign.id)) {
    return {
      ok: false,
      error: `이미 현재 캠페인("${campaign.title}")의 설문 작업이 가동 중입니다.`
    };
  }
  const myAccount = String(campaign.loginId || campaign.kstatLoginId || '').trim();
  if (myAccount) {
    for (const activeTask of activeList) {
      const otherCamp = CampaignStore.getCampaignById(activeTask.campaignId);
      const otherAccount = String(otherCamp?.loginId || otherCamp?.kstatLoginId || '').trim();
      if (otherCamp && otherCamp.surveyType === campaign.surveyType && otherAccount === myAccount) {
        return {
          ok: false,
          error: `현재 동일한 조사원 계정("${myAccount}")을 사용하는 캠페인("${otherCamp.title}")이 가동 중입니다.\n외부 조사 서버 세션 충돌을 방지하기 위해 서로 다른 조사원 계정의 캠페인끼리 동시 실행해 주세요.`
        };
      }
    }
  }
  if (activeList.length >= MAX_CONCURRENT_TASKS) {
    const runningLabels = activeList.map((t, idx) => `[슬롯 ${idx + 1}/${MAX_CONCURRENT_TASKS}] "${t.title || t.campaignId}"`).join('\n');
    return {
      ok: false,
      error: `현재 최대 동시 실행 한도(${MAX_CONCURRENT_TASKS}개)가 모두 가동 중입니다.\n${runningLabels}\n\n진행 중인 작업 중 1개가 완료되거나 [배치 중지] 후 다시 실행해 주세요.`
    };
  }
  return { ok: true, activeCount: activeList.length, maxConcurrency: MAX_CONCURRENT_TASKS };
}

export function startCampaignTask(campaign, mode = 'batch', progress = { current: 0, total: 0, percent: 0 }) {
  const taskObj = {
    campaignId: campaign.id,
    title: campaign.title || campaign.id,
    mode,
    isRunning: true,
    progress,
    startTime: new Date().toISOString()
  };
  runningTasks.set(campaign.id, taskObj);
  logger.setActiveCampaign(campaign.id);
  return taskObj;
}

export function finishCampaignTask(campaignId) {
  if (!campaignId) return;
  const task = runningTasks.get(campaignId);
  if (task) {
    task.isRunning = false;
  }
  runningTasks.delete(campaignId);
  const remaining = getActiveTasksList();
  logger.setActiveCampaign(remaining.length > 0 ? remaining[0].campaignId : null);
}
