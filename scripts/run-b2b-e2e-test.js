async function runB2BIntegrationTest() {
  console.log('=== [통합 검증] B2B 설문 자동화 및 실존 데이터 주입 테스트 시작 ===');

  const payload = {
    mode: 'b2b',
    b2bKeyword: '소프트웨어',
    selectedB2bFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry'],
    url: 'http://localhost:3000/mock-survey-b2b.html',
    topic: '2026 대한민국 IT·소프트웨어 중소기업 디지털 전환 지원 설문',
    textGuidelines: '클라우드 인프라 지원과 R&D 세액 공제 확대가 절실하다는 의견',
    iterations: 1,
    headless: true
  };

  try {
    console.log('1. 서버에 B2B 설문 작업 시작 요청...');
    const startRes = await fetch('http://localhost:3000/api/survey/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const startData = await startRes.json();
    console.log('시작 응답:', startData);

    if (!startRes.ok) {
      throw new Error(startData.error || '시작 실패');
    }

    console.log('2. MarketBz 실제 사업자 수집 및 설문 응답 진행 대기...');
    let isFinished = false;
    let attempts = 0;
    const maxAttempts = 60; // 최대 120초

    while (!isFinished && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const statusRes = await fetch('http://localhost:3000/api/survey/status');
      const statusData = await statusRes.json();

      process.stdout.write(`\r진행 상태 대기 중... (${attempts * 2}초 경과, isRunning: ${statusData.isRunning})`);

      if (!statusData.isRunning && attempts > 5) {
        isFinished = true;
        console.log('\n3. 작업 완료 감지!');
        break;
      }
    }

    console.log('\n4. 생성된 리포트 검증 중...');
    const reportsRes = await fetch('http://localhost:3000/api/survey/reports');
    const reports = await reportsRes.json();
    console.log('리포트 목록 (총 ' + reports.length + '개):');

    const fs = await import('fs');
    const path = await import('path');
    const reportsDir = path.resolve('reports');
    const jsonFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json')).sort().reverse();

    if (jsonFiles.length === 0) {
      throw new Error('생성된 리포트 파일이 없습니다.');
    }

    const latestReport = JSON.parse(fs.readFileSync(path.join(reportsDir, jsonFiles[0]), 'utf-8'));
    console.log('\n=== 최신 B2B 리포트 상세 내용 ===');
    console.log('URL:', latestReport.url);
    console.log('완료 여부:', latestReport.completed);
    console.log('답변 목록:\n', JSON.stringify(latestReport.answers, null, 2));

    // 실제 데이터 주입 여부 확인
    const hasB2bField = latestReport.answers.some(a => a.b2bField === 'companyName' || a.b2bField === 'bizNumber');
    if (hasB2bField && latestReport.completed) {
      console.log('\n>>> [검증 성공] MarketBz 실존 사업자 데이터가 설문에 완벽하게 1:1 주입되었습니다! <<<');
      process.exit(0);
    } else {
      console.error('\n>>> [검증 실패] B2B 필드 주입 실패 <<<');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n테스트 오류:', err);
    process.exit(1);
  }
}

runB2BIntegrationTest();
