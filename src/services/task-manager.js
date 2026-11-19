/**
 * 설문 자동화 작업 상태 관리 서비스 (최대 2개 캠페인 동시 가동 이중화 지원)
 * - 동일 캠페인 중복 실행 차단
 * - 동일 외부 조사원 계정(단일 loginId / kstatLoginId / 다중 accounts / accountKeys) 충돌 방지
 * - MAX_CONCURRENT_TASKS 슬롯 상태, AbortController 및 실행 중 Chromium 인스턴스 즉시 종료 관리
 */
import * as CampaignStore from '../models/campaign.js';
import { logger } from '../utils/logger.js';
import { onChromiumLaunched } from '../utils/chromium-launcher.js';

export const MAX_CONCURRENT_TASKS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_TASKS || '2', 10));
export const runningTasks = new Map(); // campaignId -> { campaignId, title, isRunning, aborted, abortController, browsers, progress, startTime, mode }

// 캠페인 컨텍스트 내에서 실행된 모든 Chromium 브라우저를 자동 추적하여 [배치 중지] 시 즉시 종료 지원
onChromiumLaunched((browser) => {
  const cid = logger.getCurrentCampaignId();
  if (!cid) return;
  const task = runningTasks.get(cid);
  if (!task || !task.isRunning) return;
  task.browsers.add(browser);
  browser.on('disconnected', () => {
    task.browsers.delete(browser);
  });
});

/**
 * 캠페인에 연결된 모든 외부 조사원 계정 식별자를 추출합니다.
 */
function extractCampaignAccountKeys(campaign) {
  const keys = new Set();
  if (!campaign) return keys;

  const primary = String(campaign.loginId || campaign.kstatLoginId || '').trim();
  if (primary) keys.add(primary);

  if (Array.isArray(campaign.accounts)) {
    for (const acc of campaign.accounts) {
      const id = typeof acc === 'string' ? acc.trim() : String(acc?.id || acc?.loginId || '').trim();
      if (id) keys.add(id);
    }
  }

  if (Array.isArray(campaign.accountKeys)) {
    for (const k of campaign.accountKeys) {
      const id = String(k || '').trim();
      if (id) keys.add(id);
    }
  }

  return keys;
}

export function getActiveTasksList() {
  const list = [];
  for (const [cid, task] of runningTasks.entries()) {
    if (task && task.isRunning) {
      list.push({
        campaignId: task.campaignId,
        title: task.title,
        mode: task.mode,
        isRunning: task.isRunning,
        progress: task.progress,
        startTime: task.startTime
      });
    } else {
      runningTasks.delete(cid);
    }
  }
  return list;
}

export function isCampaignTaskRunning(campaignId) {
  if (!campaignId) return getActiveTasksList().length > 0;
  const task = runningTasks.get(campaignId);
  return Boolean(task && task.isRunning && !task.aborted);
}

export function getCampaignAbortSignal(campaignId) {
  const task = runningTasks.get(campaignId);
  return task?.abortController?.signal || null;
}

export function checkCanStartCampaignTask(campaign) {
  const activeList = getActiveTasksList();
  if (isCampaignTaskRunning(campaign.id)) {
    return {
      ok: false,
      error: `이미 현재 캠페인("${campaign.title}")의 설문 작업이 가동 중입니다.`
    };
  }

  const myAccounts = extractCampaignAccountKeys(campaign);
  if (myAccounts.size > 0) {
    for (const activeTask of activeList) {
      const otherCamp = CampaignStore.getCampaignById(activeTask.campaignId);
      if (!otherCamp || otherCamp.surveyType !== campaign.surveyType) continue;
      const otherAccounts = extractCampaignAccountKeys(otherCamp);
      const shared = [...myAccounts].filter(acc => otherAccounts.has(acc));
      if (shared.length > 0) {
        return {
          ok: false,
          error: `현재 동일한 조사원 계정("${shared.join(', ')}")을 사용하는 캠페인("${otherCamp.title}")이 가동 중입니다.\n외부 조사 서버 세션 충돌을 방지하기 위해 서로 다른 조사원 계정의 캠페인끼리 동시 실행해 주세요.`
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
    aborted: false,
    abortController: new AbortController(),
    browsers: new Set(),
    progress,
    startTime: new Date().toISOString()
  };
  runningTasks.set(campaign.id, taskObj);
  return taskObj;
}

/**
 * 실행 중인 특정 캠페인 작업을 즉시 중단하고 연결된 Chromium 인스턴스를 안전하게 종료합니다.
 */
export async function stopCampaignTask(campaignId) {
  if (!campaignId) return false;
  const task = runningTasks.get(campaignId);
  if (!task) return false;

  task.aborted = true;
  task.isRunning = false;
  try {
    task.abortController?.abort();
  } catch (_) {}

  const browsersToClose = [...(task.browsers || [])];
  task.browsers?.clear();
  runningTasks.delete(campaignId);

  if (browsersToClose.length > 0) {
    await Promise.allSettled(
      browsersToClose.map((b) => b.close().catch((err) => {
        console.warn(`[TaskManager] 중지 시 브라우저 종료 경고 (${campaignId}):`, err.message);
      }))
    );
  }
  return true;
}

/**
 * 실행 중인 모든 캠페인 작업을 일괄 중단하고 브라우저를 종료합니다.
 */
export async function stopAllCampaignTasks() {
  const ids = [...runningTasks.keys()];
  await Promise.allSettled(ids.map((cid) => stopCampaignTask(cid)));
  return ids;
}

export function finishCampaignTask(campaignId) {
  if (!campaignId) return;
  const task = runningTasks.get(campaignId);
  if (task) {
    task.isRunning = false;
    task.browsers?.clear();
  }
  runningTasks.delete(campaignId);
}
