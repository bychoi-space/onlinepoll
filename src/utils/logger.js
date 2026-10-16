/**
 * 실시간 SSE 브로드캐스터 및 통합 로거
 */

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

class EventBroadcaster {
  constructor() {
    this.clients = new Set();
    this.history = [];
    this.maxHistory = 100;
  }

  /**
   * SSE 클라이언트 등록
   */
  addClient(res) {
    this.clients.add(res);

    // 연결 시 최근 히스토리 전송
    this.history.forEach((data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  /**
   * 전체 연결된 클라이언트에 이벤트 브로드캐스트
   */
  broadcast(typeOrData, payload = {}) {
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
        ...payload
      };
    }

    this.history.push(eventData);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const message = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * 일반 정보 로그
   */
  info(message, details = null, channel = null) {
    console.log(`[INFO] ${message}`);
    this.broadcast('log', { level: 'info', message, details, channel: channel || inferChannel(message) });
  }

  /**
   * 성공 로그
   */
  success(message, details = null, channel = null) {
    console.log(`[SUCCESS] ${message}`);
    this.broadcast('log', { level: 'success', message, details, channel: channel || inferChannel(message) });
  }

  /**
   * 경고 로그
   */
  warn(message, details = null, channel = null) {
    console.warn(`[WARN] ${message}`);
    this.broadcast('log', { level: 'warn', message, details, channel: channel || inferChannel(message) });
  }

  /**
   * 오류 로그
   */
  error(message, error = null, channel = null) {
    console.error(`[ERROR] ${message}`, error || '');
    this.broadcast('log', {
      level: 'error',
      message,
      details: error ? (error.stack || error.message || String(error)) : null,
      channel: channel || inferChannel(message)
    });
  }

  /**
   * 진행률 상태 업데이트
   */
  updateProgress(current, total, statusText = '') {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.broadcast('progress', {
      current,
      total,
      percent,
      statusText
    });
  }

  /**
   * 설문 응답 액션 로그 (질문명, 선택 항목 등)
   */
  recordAnswer(questionTitle, answerType, chosenAnswer) {
    this.broadcast('answer', {
      questionTitle,
      answerType,
      chosenAnswer
    });
  }
}

export const logger = new EventBroadcaster();
