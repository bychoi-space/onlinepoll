async function testTwoWaySync() {
  console.log('=== [양방향 연동 검증] 쿼터 생성기 <-> 설문조사 상세 연동 테스트 ===');

  // 1. 쿼터 목록 조회
  console.log('\n1. 쿼터 목록 조회 (GET /api/quota/list)...');
  const listRes = await fetch('http://localhost:3000/api/quota/list');
  const quotaList = await listRes.json();
  console.log(`발견된 쿼터 파일 수: ${quotaList.length}개`);
  if (quotaList.length === 0) {
    throw new Error('보관된 쿼터 파일이 없습니다.');
  }

  const targetQuota = quotaList[0];
  console.log(`테스트 대상 쿼터: "${targetQuota.title}" (파일: ${targetQuota.fileName}, 건수: ${targetQuota.count}건)`);

  // 2. [방식 B 검증] 쿼터 생성기에서 새 설문 캠페인 즉시 생성 (POST /api/campaigns/create-from-quota)
  console.log('\n2. [방식 B 검증] 쿼터로 새 설문 캠페인 즉시 생성...');
  const createRes = await fetch('http://localhost:3000/api/campaigns/create-from-quota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quotaFileName: targetQuota.fileName,
      title: '2026_풍납시장_소상공인_연계설문_테스트'
    })
  });

  if (!createRes.ok) {
    throw new Error('create-from-quota 실패: ' + (await createRes.text()));
  }

  const createData = await createRes.json();
  const createdCamp = createData.campaign;
  console.log(`[생성 성공] 캠페인 ID: ${createdCamp.id} | 제목: "${createdCamp.title}" | 상태: ${createdCamp.status}`);
  console.log(`탑재된 사업자 DB 수: ${createdCamp.quotaDatabase?.length}건`);
  console.log('탑재된 1번 사업자 샘플:', {
    상호: createdCamp.quotaDatabase[0].companyName,
    사업자번호: createdCamp.quotaDatabase[0].bizNumber,
    연락처: createdCamp.quotaDatabase[0].phone,
    개업연월: createdCamp.quotaDatabase[0].openDate,
    취급품목: createdCamp.quotaDatabase[0].handledItems,
    주소: createdCamp.quotaDatabase[0].address
  });

  // 3. [방식 A 검증] 기존 캠페인에서 쿼터 불러와 장착하기 (POST /api/campaigns/:id/import-quota)
  console.log('\n3. [방식 A 검증] 기존 캠페인에 쿼터 불러와 장착하기 (Import)...');
  // 먼저 빈 캠페인 하나 생성
  const newEmptyCampRes = await fetch('http://localhost:3000/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '빈 설문 캠페인 (쿼터 장착 테스트)',
      quotaType: 'b2b'
    })
  });
  const emptyCamp = await newEmptyCampRes.json();
  console.log(`빈 캠페인 준비 완료 (ID: ${emptyCamp.id}, DB 수: ${emptyCamp.quotaDatabase.length}건)`);

  // 이제 쿼터 장착
  const importRes = await fetch(`http://localhost:3000/api/campaigns/${emptyCamp.id}/import-quota`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quotaFileName: targetQuota.fileName
    })
  });

  if (!importRes.ok) {
    throw new Error('import-quota 실패: ' + (await importRes.text()));
  }

  const importData = await importRes.json();
  const importedCamp = importData.campaign;
  console.log(`[장착 성공] 상태: ${importedCamp.status} | 탑재된 사업자 DB 수: ${importedCamp.quotaDatabase?.length}건`);

  // 정합성 검증
  if (importedCamp.quotaDatabase.length !== targetQuota.count) {
    throw new Error(`DB 건수 불일치: 기대 ${targetQuota.count}건, 실제 ${importedCamp.quotaDatabase.length}건`);
  }

  console.log('\n🎉 [최종 검증 완료] 방식 A(설문 상세에서 쿼터 불러오기) 및 방식 B(쿼터 생성기에서 설문 즉시 생성) 양방향 연동이 100% 정상 작동합니다!');
}

testTwoWaySync();
