import { chromium } from 'playwright';

async function checkLoginIframe() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://marketbz.com/index', { waitUntil: 'domcontentloaded' });

  // mbzBuildLoginPageUrl 실행 결과 확인
  const loginUrl = await page.evaluate(() => {
    return window.mbzBuildLoginPageUrl ? window.mbzBuildLoginPageUrl({}) : 'mbzBuildLoginPageUrl not found';
  });

  console.log('mbzBuildLoginPageUrl result:', loginUrl);

  // fn_login() 호출 후 iframe 로드 확인
  await page.evaluate(() => {
    window.fn_login();
  });

  await page.waitForTimeout(2000);

  // iframe 프레임 탐색
  const frame = page.frameLocator('#iframeLoginPop');
  const iframeInputs = await frame.locator('input').evaluateAll(inputs => {
    return inputs.map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder }));
  });

  console.log('Inputs inside #iframeLoginPop:', JSON.stringify(iframeInputs, null, 2));

  await browser.close();
}

checkLoginIframe();
