import { chromium } from 'playwright';

async function checkListHtml() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://survey.kstat.co.kr/kstat_survey/inc/login.php');
  await page.fill('#floatingID', '가온김영옥');
  await page.fill('#floatingPassword', '1234');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    page.click('#btnLogin')
  ]);

  await page.goto('https://survey.kstat.co.kr/kstat_survey/survey/2026070802/list.php', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const html = await page.content();
  console.log(`list.php HTML length: ${html.length}`);
  console.log('HTML slice(0, 1000):');
  console.log(html.slice(0, 1000));

  const iframes = await page.evaluate(() => {
    return [...document.querySelectorAll('iframe, frame')].map(f => ({
      name: f.name,
      id: f.id,
      src: f.src
    }));
  });
  console.log('iframes / frames:', iframes);

  await browser.close();
}

checkListHtml().catch(console.error);
