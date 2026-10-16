import { chromium } from 'playwright';

async function checkA4A() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=UlpNCKP9c&type=tapi&prid=2026070802&mnid=900001346&srt=1');
  await page.waitForTimeout(2000);
  if (page.url().includes('index.asp')) {
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2500);
  }

  const fA4 = page.frame({ url: /A4\.asp/ });
  if (fA4) await fA4.click('#A4_1');
  await page.waitForTimeout(1000);

  const fA4A = page.frame({ url: /A4A\.asp/ });
  if (fA4A) {
    const inputs = await fA4A.$$eval('input', inps => inps.map(i => ({
      name: i.name,
      id: i.id,
      type: i.type,
      maxLength: i.maxLength,
      value: i.value,
      placeholder: i.placeholder
    })));
    console.log('A4A Inputs:', JSON.stringify(inputs, null, 2));
    console.log('A4A HTML snippet:', await fA4A.$eval('form', f => f.innerHTML).catch(async () => await fA4A.content()));
  }

  await browser.close();
}

checkA4A();
