async function testCampaignArchitecture() {
  console.log('=== [통합 검증] 설문 목차 & 2단계 쿼터 설정 아키텍처 E2E 테스트 시작 ===');

  try {
    // 1. 전체 캠페인 목록 조회 검증
    console.log('\n1. 전체 캠페인 목록 조회 (GET /api/campaigns)');
    const listRes = await fetch('http://localhost:3000/api/campaigns');
    const campaigns = await listRes.json();
    console.log(`현재 등록된 캠페인 수: ${campaigns.length}건`);

    // 2. 신규 캠페인 생성
    console.log('\n2. 신규 설문 캠페인 생성 (POST /api/campaigns)');
    const createRes = await fetch('http://localhost:3000/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '2026 하반기 IT·소프트웨어 중소기업 정책 수요조사',
        description: '실존 소프트웨어 사업자 대상 디지털 전환 및 지원 정책 조사',
        quotaType: 'b2b',
        quotaConfig: {
          b2bKeyword: '소프트웨어',
          targetCount: 1,
          selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
        }
      })
    });
    const newCamp = await createRes.json();
    console.log(`생성된 캠페인 ID: ${newCamp.id}, 제목: "${newCamp.title}"`);

    // 3. 1차 제반 작업: 조사 쿼터 DB 구축 요청
    console.log('\n3. [1차 제반 작업] MarketBz 실존 사업자 DB 구축 (POST /api/campaigns/:id/build-quota)');
    const buildRes = await fetch(`http://localhost:3000/api/campaigns/${newCamp.id}/build-quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        b2bKeyword: '소프트웨어',
        targetCount: 1,
        selectedFields: ['companyName', 'bizNumber', 'ceoName', 'address', 'industry']
      })
    });
    const buildData = await buildRes.json();
    console.log('DB 구축 요청 응답:', buildData);

    // DB 구축 완료 대기 (최대 30초)
    console.log('MarketBz 실존 사업자 수집 대기 중...');
    let campData = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(`http://localhost:3000/api/campaigns/${newCamp.id}`);
      campData = await res.json();
      if (campData.quotaDatabase && campData.quotaDatabase.length > 0) {
        console.log(`[1차 작업 완료 감지] 구축된 사업자 DB: ${campData.quotaDatabase.length}건`);
        console.log('첫 번째 사업자:', campData.quotaDatabase[0].companyName, `(${campData.quotaDatabase[0].bizNumber})`);
        break;
      }
    }

    if (!campData.quotaDatabase || campData.quotaDatabase.length === 0) {
      throw new Error('1차 제반 작업에서 사업자 DB를 구축하지 못했습니다.');
    }

    // 4. 2차 제반 작업 & 3차 자동 실행: 설문 시작
    console.log('\n4. [2차/3차 작업] 방향성 설정 및 설문 자동화 시작 (POST /api/campaigns/:id/start)');
    const startRes = await fetch(`http://localhost:3000/api/campaigns/${newCamp.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surveyUrl: 'http://localhost:3000/mock-survey-b2b.html',
        topic: '2026 하반기 IT·소프트웨어 중소기업 정책 수요조사',
        positiveRatio: 80,
        neutralRatio: 20,
        negativeRatio: 0,
        textGuidelines: '클라우드 인프라 지원 바우처 확대가 가장 실효성 높다는 의견',
        iterations: 1,
        headless: true
      })
    });
    const startData = await startRes.json();
    console.log('설문 실행 시작 응답:', startData);

    // 설문 완료 대기
    console.log('로봇의 설문 1:1 자동 입력 및 제출 대기 중...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch('http://localhost:3000/api/survey/status');
      const statusData = await statusRes.json();
      if (!statusData.isRunning && i > 3) {
        console.log('설문 자동화 작업 완료 확인!');
        break;
      }
    }

    // 5. 최종 캠페인 상태 검증
    console.log('\n5. 최종 캠페인 쿼터 DB 및 결과 검증 (GET /api/campaigns/:id)');
    const finalCampRes = await fetch(`http://localhost:3000/api/campaigns/${newCamp.id}`);
    const finalCamp = await finalCampRes.json();

    console.log('최종 캠페인 상태:', finalCamp.status);
    console.log('쿼터 DB 사용 상태:', finalCamp.quotaDatabase[0]?.quotaStatus);
    console.log('제출된 결과 히스토리:', finalCamp.results);

    if (finalCamp.status === 'completed' && finalCamp.quotaDatabase[0]?.quotaStatus === 'used') {
      console.log('\n>>> [최종 검증 성공] 캠페인 목차 -> 1차 쿼터 DB 구축 -> 2차 방향성 -> 자동 실행 파이프라인 완벽 검증 완료! <<<');
      process.exit(0);
    } else {
      console.error('\n>>> [검증 실패] 캠페인 최종 상태 불일치 <<<');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n테스트 실행 중 에러 발생:', err);
    process.exit(1);
  }
}

testCampaignArchitecture();
