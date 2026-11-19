/**
 * 실시간 SSE 브로드캐스터 및 통합 로거 (AsyncLocalStorage 기반 멀티 캠페인 격리 지원)
 */
import { AsyncLocalStorage } from 'async_hooks';

const campaignContextStorage = new AsyncLocalStorage();

const kstTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function getKstTime() {
  try {
    return kstTimeFormatter.format(new Date());
  } catch (_) {
    return new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
}

function inferChannel(message) {
  if (!message || typeof message !== 'string') return 'system';
  if (
    message.includes('[온누리') ||
    message.includes('[MarketBz]') ||
    message.includes('[Hybrid Quota]') ||
    message.includes('[Enricher]') ||
    message.includes('쿼터 생성') ||
    message.includes('가맹점')
  ) {
    return 'quota';
  }
  if (
    message.includes('[배치') ||
    message.includes('[파일럿') ||
    message.includes('[ALERT]') ||
    message.includes('[세션') ||
    message.includes('[Kstat') ||
    message.includes('[설문') ||
    message.includes('Agree.asp') ||
    message.includes('캠페인')
  ) {
    return 'survey';
  }
  return 'system';
}

// 히스토리 버퍼 보관에서 제외할 대용량 이벤트 타입
const NON_HISTORY_EVENT_TYPES = new Set([
  'QUOTA_CHECKPOINT',
  'QUOTA_UPDATED'
]);

class EventBroadcaster {
  constructor() {
    /** @type {Set<{ res: import('express').Response, campaignId: string | null }>} */
    this.clients = new Set();
    this.history = [];
    this.maxHistory = 200;
    this.activeCampaignId = null;

    // 프록시/로드밸런서 유휴 연결 끊김 방지를 위한 25초 주기 하트비트
    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size === 0) return;
      for (const client of this.clients) {
        try {
          client.res.write(': keep-alive\n\n');
        } catch (_) {
          this.clients.delete(client);
        }
      }
    }, 25000);

    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * 현재 비동기 컨텍스트 또는 전역 활성 캠페인 ID 반환
   */
  getCurrentCampaignId() {
    const store = campaignContextStorage.getStore();
    if (store && store.campaignId) {
      return store.campaignId;
    }
    return this.activeCampaignId || null;
  }

  /**
   * 특정 캠페인 컨텍스트로 비동기 함수를 감싸서 실행 (2개 동시 배치 실행 시 로그 완벽 격리)
   */
  runWithCampaignContext(campaignId, fn) {
    return campaignContextStorage.run({ campaignId }, fn);
  }

  /**
   * 현재 실행 중인 활성 캠페인 ID 설정 (AsyncLocalStorage 우선 반영, 다중 슬롯 덮어쓰기 방지)
   */
  setActiveCampaign(campaignId = null) {
    const store = campaignContextStorage.getStore();
    if (store) {
      store.campaignId = campaignId || null;
      return;
    }
    this.activeCampaignId = campaignId || null;
  }

  /**
   * SSE 클라이언트 등록 (특정 campaignId 구독 시 해당 캠페인 + 공통 시스템 이벤트만 전달)
   */
  addClient(res, campaignId = null) {
    const normalizedCampId = campaignId ? String(campaignId).trim() : null;
    const clientEntry = { res, campaignId: normalizedCampId };
    this.clients.add(clientEntry);

    // 연결 시 최근 일반 텍스트 로그 히스토리만 전송 (타 캠페인 실행 로그는 제외)
    this.history.forEach((data) => {
      if (data.type === 'log') {
        if (normalizedCampId && data.campaignId && data.campaignId !== normalizedCampId) return;
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (_) {
          this.clients.delete(clientEntry);
        }
      }
    });

    res.on('close', () => {
      this.clients.delete(clientEntry);
    });
  }

  /**
   * 연결된 클라이언트에 이벤트 브로드캐스트
   */
  broadcast(typeOrData, payload = {}) {
    const currentCampId = this.getCurrentCampaignId();
    let eventData;
    if (typeof typeOrData === 'object' && typeOrData !== null) {
      const channel = typeOrData.channel || (
        String(typeOrData.type || '').startsWith('BATCH_') ||
        String(typeOrData.type || '').startsWith('PILOT_') ||
        typeOrData.type === 'QUOTA_UPDATED'
          ? 'survey'
          : inferChannel(typeOrData.message || '')
      );
      eventData = {
        id: Date.now(),
        timestamp: getKstTime(),
        channel,
        ...(currentCampId ? { campaignId: currentCampId } : {}),
        ...typeOrData
      };
    } else {
      const channel = payload.channel || (
        String(typeOrData || '').startsWith('BATCH_') ||
        String(typeOrData || '').startsWith('PILOT_') ||
        typeOrData === 'QUOTA_UPDATED'
          ? 'survey'
          : inferChannel(payload.message || '')
      );
      eventData = {
        id: Date.now(),
        timestamp: getKstTime(),
        type: typeOrData,
        channel,
        ...(currentCampId ? { campaignId: currentCampId } : {}),
        ...payload
      };
    }

    // 대용량 쿼터 배열(QUOTA_UPDATED, QUOTA_CHECKPOINT)은 힙 메모리 누수 방지를 위해 히스토리 보관 제외
    if (!NON_HISTORY_EVENT_TYPES.has(eventData.type)) {
      this.history.push(eventData);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    const message = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of this.clients) {
      // 특정 캠페인 상세 탭(?campaignId=...)에는 타 캠페인의 이벤트/대용량 쿼터 패킷을 전송하지 않음
      if (client.campaignId && eventData.campaignId && client.campaignId !== eventData.campaignId) {
        continue;
      }
      try {
        client.res.write(message);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  info(message, details = null, channel = null) {
    console.log(`[INFO] ${message}`);
    this.broadcast('log', { level: 'info', message, details, channel: channel || inferChannel(message) });
  }

  success(message, details = null, channel = null) {
    console.log(`[SUCCESS] ${message}`);
    this.broadcast('log', { level: 'success', message, details, channel: channel || inferChannel(message) });
  }

  warn(message, details = null, channel = null) {
    console.warn(`[WARN] ${message}`);
    this.broadcast('log', { level: 'warn', message, details, channel: channel || inferChannel(message) });
  }

  error(message, error = null, channel = null) {
    console.error(`[ERROR] ${message}`, error || '');
    this.broadcast('log', {
      level: 'error',
      message,
      details: error ? (error.stack || error.message || String(error)) : null,
      channel: channel || inferChannel(message)
    });
  }

  updateProgress(current, total, statusText = '') {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.broadcast('progress', {
      current,
      total,
      percent,
      statusText
    });
  }

  recordAnswer(questionTitle, answerType, chosenAnswer) {
    this.broadcast('answer', {
      questionTitle,
      answerType,
      chosenAnswer
    });
  }
}

export const logger = new EventBroadcaster();
