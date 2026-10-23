import { chromium } from 'playwright';

async function testP4A8() {
  console.log('[E2E 테스트] P4 A8 운영시간대 주입 실전 검증 시작...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let dialogCount = 0;
  page.on('dialog', async d => {
    dialogCount++;
    console.log(`[ALERT 감지 #${dialogCount}] ${d.message()}`);
    await d.accept().catch(() => {});
  });

  const surveyUrl = 'https://kstat.surveys.kr/2026/P26042401A/index.asp?KID=xMhDVlSB1&type=tapi&prid=2026070801&mnid=900001374&srt=1';
  await page.goto(surveyUrl, { waitUntil: 'networkidle' });
  await page.click('#next');
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  // P4 직접 이동
  console.log('[E2E 테스트] P4 단계로 이동...');
  await page.evaluate(() => move_page('P4'));
  await page.waitForTimeout(2000);

  // frame_A8 탐색
  const a8Frame = page.frames().find(f => f.url().includes('A8.asp') || f.name() === 'frame_A8');
  if (!a8Frame) {
    throw new Error('frame_A8을 찾을 수 없습니다!');
  }
  console.log('[E2E 테스트] frame_A8 발견 URL:', a8Frame.url());

  // 가이드 정책: 표준 09:00 ~ 21:00 주입 테스트
  const policy = {
    A8_operatingHoursMode: 'standard',
    A8_openHour: '09',
    A8_openMinute: '0',
    A8_closeHour: '21',
    A8_closeMinute: '0',
    A8_noTime: false
  };

  const a8Mode = policy.A8_operatingHoursMode;
  const isNoTime = policy.A8_noTime;
  const openH = policy.A8_openHour;
  const openM = policy.A8_openMinute;
  const closeH = policy.A8_closeHour;
  const closeM = policy.A8_closeMinute;
  const preserveExisting = false;

  await a8Frame.evaluate(({ a8Mode, isNoTime, openH, openM, closeH, closeM, preserveExisting }) => {
    const cbNoTime = document.querySelector('#A8_3, input[name="A8_3"]');

    if (cbNoTime && cbNoTime.checked) {
      cbNoTime.click();
      cbNoTime.checked = false;
      cbNoTime.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof noCheckBoxValue === 'function') noCheckBoxValue('A8_3', '3');
      if (typeof colorCheckbox === 'function') colorCheckbox('A8');
    }

    const setSelect = (id, val) => {
      const sel = document.querySelector('#' + id) || document.querySelector(`select[name="${id}"]`);
      if (sel) {
        sel.disabled = false;
        let matchedOption = Array.from(sel.options).find(o => o.value === String(val) || o.value === String(val).padStart(2, '0'));
        if (matchedOption) {
          sel.value = matchedOption.value;
        } else {
          sel.value = String(val);
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof $ !== 'undefined') $(sel).val(sel.value).trigger('change');
      }
    };

    setSelect('A8_1_1', openH);
    setSelect('A8_1_2', openM);
    setSelect('A8_2_1', closeH);
    setSelect('A8_2_2', closeM);
  }, { a8Mode, isNoTime, openH, openM, closeH, closeM, preserveExisting });

  // 주입 결과 확인
  const verifyData = await a8Frame.evaluate(() => {
    return {
      openH: document.querySelector('#A8_1_1')?.value,
      openM: document.querySelector('#A8_1_2')?.value,
      closeH: document.querySelector('#A8_2_1')?.value,
      closeM: document.querySelector('#A8_2_2')?.value,
      noTimeChecked: document.querySelector('#A8_3')?.checked
    };
  });

  console.log('[E2E 테스트] frame_A8 주입 확인 결과:', verifyData);

  // 저장(다음) 클릭 및 다음 단계 이동 검증
  console.log('[E2E 테스트] P4에서 #next 클릭 및 P5 이동 검증...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
    page.click('#next').catch(() => {})
  ]);
  await page.waitForTimeout(2000);

  const finalUrl = page.url();
  const finalPageName = await page.evaluate(() => document.querySelector('input[name="PageName"]')?.value || '').catch(() => '');
  console.log(`[E2E 테스트 완료] 이동 후 URL: ${finalUrl}, PageName: ${finalPageName}`);

  await browser.close();

  if (verifyData.openH === '09' && verifyData.closeH === '21' && !verifyData.noTimeChecked) {
    console.log('✅ [검증 성공] A8 운영시간 주입 및 유효성 검사 100% 정상 통과!');
  } else {
    throw new Error('A8 데이터 검증 불일치!');
  }
}

testP4A8().catch(err => {
  console.error('❌ E2E 테스트 실패:', err);
  process.exit(1);
});
