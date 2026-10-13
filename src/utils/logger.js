/**
 * 실시간 SSE 브로드캐스터 및 통합 로거
 */

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
  broadcast(type, payload) {
    const eventData = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      ...payload
    };

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
  info(message, details = null) {
    console.log(`[INFO] ${message}`);
    this.broadcast('log', { level: 'info', message, details });
  }

  /**
   * 성공 로그
   */
  success(message, details = null) {
    console.log(`[SUCCESS] ${message}`);
    this.broadcast('log', { level: 'success', message, details });
  }

  /**
   * 경고 로그
   */
  warn(message, details = null) {
    console.warn(`[WARN] ${message}`);
    this.broadcast('log', { level: 'warn', message, details });
  }

  /**
   * 오류 로그
   */
  error(message, error = null) {
    console.error(`[ERROR] ${message}`, error || '');
    this.broadcast('log', {
      level: 'error',
      message,
      details: error ? (error.stack || error.message || String(error)) : null
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
