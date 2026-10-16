import { chromium } from 'playwright';

async function analyzeSurvey() {
  console.log('=== 케이스탯 전통시장 점포주 실태조사 첫 페이지 분석 시작 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();
  const startUrl = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1';

  try {
    console.log('[1] index.asp 접속 중...');
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('[2] 시작 버튼 클릭...');
    // 시작 버튼 클릭 후 다음 페이지 이동 대기
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('#next')
    ]);

    const currentUrl = page.url();
    console.log(`[3] 이동 완료 URL: ${currentUrl}`);

    // 페이지 제목 및 헤더 분석
    const pageTitle = await page.title();
    console.log(`페이지 Title: ${pageTitle}`);

    // 숨겨진 필드 분석
    const hiddenInputs = await page.$$eval('input[type="hidden"]', inputs => 
      inputs.map(i => ({ name: i.name, id: i.id, value: i.value }))
    );
    console.log('\n[Hidden Fields]:');
    console.log(hiddenInputs);

    // 질문 및 선택지 구조 분석
    const pageStructure = await page.evaluate(() => {
      const result = {
        forms: [],
        questions: [],
        buttons: []
      };

      // 폼 정보
      document.querySelectorAll('form').forEach(f => {
        result.forms.push({
          name: f.name,
          action: f.action,
          method: f.method
        });
      });

      // 버튼 정보
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(b => {
        result.buttons.push({
          id: b.id,
          name: b.name,
          text: b.innerText || b.value,
          className: b.className
        });
      });

      // 질문 텍스트 및 입력 요소
      // bootstrap card나 table, question-box 등
      const bodyText = document.body.innerText;
      result.bodySnippet = bodyText.slice(0, 3000);

      // 모든 input/select/textarea 목록
      const inputs = [];
      document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
        const parentLabel = el.closest('label') ? el.closest('label').innerText.trim() : '';
        inputs.push({
          tagName: el.tagName,
          type: el.type || '',
          id: el.id || '',
          name: el.name || '',
          value: el.value || '',
          label: parentLabel || (el.labels && el.labels[0] ? el.labels[0].innerText.trim() : '')
        });
      });
      result.inputs = inputs;

      return result;
    });

    console.log('\n[Forms]:', pageStructure.forms);
    console.log('\n[Buttons]:', pageStructure.buttons);
    console.log('\n[Inputs Count]:', pageStructure.inputs.length);
    console.log('\n[Inputs Details]:');
    console.log(JSON.stringify(pageStructure.inputs, null, 2));

    console.log('\n[Page Text (First 3000 chars)]:');
    console.log(pageStructure.bodySnippet);

  } catch (err) {
    console.error('분석 중 에러:', err);
  } finally {
    await browser.close();
  }
}

analyzeSurvey();
