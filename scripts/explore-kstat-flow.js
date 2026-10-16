import { chromium } from 'playwright';

async function exploreFlow() {
  console.log('=== 케이스탯 설문 진행 플로우 심층 분석 시작 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();
  const startUrl = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';

  try {
    console.log('[1] index.asp 진입...');
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 시작 클릭
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('#next')
    ]);

    // 최대 15개 문항 단계 탐색
    for (let step = 1; step <= 15; step++) {
      const pageInfo = await page.evaluate(() => {
        const pageName = document.querySelector('input[name="PageName"]')?.value || 'UNKNOWN';
        const nextPage = document.querySelector('input[name="NextPage"]')?.value || 'UNKNOWN';
        const title = document.title;

        // 질문 제목 추출
        const questionHeaders = Array.from(document.querySelectorAll('.fs-5, .fw-bold, .text-primary, h4, h5, .BlueBd, tr th, .card-title'))
          .map(el => el.innerText.trim())
          .filter(t => t.length > 0 && (t.includes('문') || t.includes('SQ') || t.includes('Q') || t.includes('귀')));

        // 텍스트 전체 요약
        const bodyText = document.body.innerText;

        // 인터랙티브 요소 파악
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).map(el => {
          let labelText = '';
          if (el.id) {
            const lbl = document.querySelector(`label[for="${el.id}"]`);
            if (lbl) labelText = lbl.innerText.trim();
          }
          if (!labelText && el.closest('label')) {
            labelText = el.closest('label').innerText.trim();
          }
          if (!labelText && el.closest('tr')) {
            labelText = el.closest('tr').innerText.trim().replace(/\s+/g, ' ');
          }

          return {
            tagName: el.tagName,
            type: el.type || '',
            id: el.id,
            name: el.name,
            value: el.value,
            label: labelText.slice(0, 100)
          };
        });

        // 다음 버튼 텍스트
        const nextBtn = document.querySelector('#next, button[name="next"], input[type="submit"]');
        const nextBtnText = nextBtn ? (nextBtn.innerText || nextBtn.value).trim() : '없음';

        return {
          pageName,
          nextPage,
          title,
          questionHeaders: questionHeaders.slice(0, 5),
          inputs,
          nextBtnText,
          snippet: bodyText.slice(0, 1000).replace(/\n\s*\n/g, '\n')
        };
      });

      console.log(`\n======================================================`);
      console.log(`[Step ${step}] PageName: ${pageInfo.pageName} ➔ NextPage: ${pageInfo.nextPage}`);
      console.log(`- 다음 버튼 텍스트: "${pageInfo.nextBtnText}"`);
      console.log(`- 감지된 주요 문항 헤더:`, pageInfo.questionHeaders);
      console.log(`- 입력 컴포넌트 (${pageInfo.inputs.length}개):`);
      pageInfo.inputs.slice(0, 10).forEach(inp => {
        console.log(`  * [${inp.type || inp.tagName}] id="${inp.id}" name="${inp.name}" val="${inp.value}" | 라벨: ${inp.label}`);
      });
      if (pageInfo.inputs.length > 10) {
        console.log(`  ... 외 ${pageInfo.inputs.length - 10}개 옵션 생략`);
      }

      console.log(`\n[화면 내용 발췌]:\n${pageInfo.snippet.slice(0, 400)}...\n`);

      // 만약 제출(완료) 버튼이거나 마지막 페이지면 탐색 중단 (제출 금지!)
      if (pageInfo.nextBtnText.includes('제출') || pageInfo.nextBtnText.includes('완료') || pageInfo.pageName === 'END') {
        console.log('⚠️ 마지막 제출 페이지 감지 - 실제 제출 방지를 위해 탐색을 중단합니다.');
        break;
      }

      // 첫 번째 유효 라디오나 첫 번째 체크박스/옵션을 임시로 선택하여 다음 구조만 파악 (저장/제출 전 단계)
      // SQ1 문1: 1번 (2025년 12월 31일 이전) 선택
      const radios = await page.$$('input[type="radio"]');
      if (radios.length > 0) {
        // 첫 번째 라디오 버튼 클릭
        await radios[0].click();
      }

      const textInputs = await page.$$('input[type="text"], textarea');
      for (const txt of textInputs) {
        const val = await txt.inputValue();
        if (!val) {
          await txt.fill('1'); // 숫자형 검증일 수 있으므로 1 입력
        }
      }

      const selects = await page.$$('select');
      for (const sel of selects) {
        const options = await sel.$$eval('option', opts => opts.map(o => o.value).filter(v => v));
        if (options.length > 0) {
          await sel.selectOption(options[0]);
        }
      }

      await page.waitForTimeout(500);

      // 다음 클릭 및 페이지 이동
      const nextBtnExists = await page.$('#next');
      if (!nextBtnExists) {
        console.log('다음 버튼 없음 - 탐색 중단');
        break;
      }

      console.log(`➔ [다음] 클릭하여 ${pageInfo.nextPage} 구조 확인 중...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        page.click('#next')
      ]);
    }

  } catch (err) {
    console.error('탐색 중 에러:', err);
  } finally {
    await browser.close();
    console.log('브라우저 세션 안전 종료 완료.');
  }
}

exploreFlow();
