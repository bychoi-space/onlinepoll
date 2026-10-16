import { chromium } from 'playwright';

const slot10Url = 'https://kstat.surveys.kr/2026/P26042401B/index.asp?KID=BtQ09ixb5&type=tapi&prid=2026070802&mnid=900001346&srt=1';

async function diagnose() {
  console.log('🚀 Launching Chromium to diagnose slot #10 (백군떡방)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`🔔 [Dialog Alert] "${dialog.message()}"`);
    await dialog.accept();
  });

  page.on('console', msg => console.log('Browser console:', msg.text()));

  console.log('1. Navigating to:', slot10Url);
  const start = Date.now();
  await page.goto(slot10Url, { waitUntil: 'networkidle', timeout: 35000 });
  console.log(`2. Navigated in ${Date.now() - start}ms. Current URL:`, page.url());

  // Check buttons
  const hasNext = await page.$('#next');
  console.log('Has #next button:', !!hasNext);

  if (page.url().includes('index.asp')) {
    console.log('3. Clicking #next on index.asp...');
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
    console.log('After click, URL:', page.url());
  }

  if (page.url().includes('Survey.asp')) {
    console.log('4. On Survey.asp, checking content...');
    const hasQ1_1 = await page.$('#Q1_1');
    console.log('Has #Q1_1:', !!hasQ1_1);
    await page.evaluate(() => document.querySelector('#Q1_1')?.click());
    await page.evaluate(() => document.querySelector('#next')?.click());
    await page.waitForTimeout(2000);
    console.log('After Survey.asp click, URL:', page.url());
  }

  console.log('5. Current page state:');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  const frames = page.frames();
  console.log(`Total frames: ${frames.length}`);
  frames.forEach((f, idx) => console.log(`  Frame ${idx}: ${f.url()}`));

  // Check if P7
  if (page.url().includes('P7.asp')) {
    console.log('\n--- Diagnosing P7.asp ---');
    const fB5A1 = page.frame({ url: /B5A1\.asp/ }) || page.frame({ url: /B5A\.asp/ });
    console.log('Frame B5A1 exists:', !!fB5A1);
    const fB5A2 = page.frame({ url: /B5A2\.asp/ });
    console.log('Frame B5A2 exists:', !!fB5A2);
    const fB5B1 = page.frame({ url: /B5B1\.asp/ });
    console.log('Frame B5B1 exists:', !!fB5B1);

    if (fB5A1) {
      const b5a1Checked = await fB5A1.evaluate(() => {
        const r1 = document.querySelector('#B5A_1_1, input[value="1"]');
        const r2 = document.querySelector('#B5A_1_2, input[value="2"]');
        return { r1Checked: r1?.checked, r2Checked: r2?.checked };
      });
      console.log('B5A1 checked status:', b5a1Checked);
    }

    if (fB5B1) {
      const b5b1Val = await fB5B1.evaluate(() => {
        const inp = document.querySelector('input[name="B5B_1"], input[type="tel"], input[type="text"]');
        return inp ? inp.value : 'NO_INPUT';
      });
      console.log('B5B1 current input value:', b5b1Val);
    }
  }

  await browser.close();
  console.log('\nDiagnosis complete!');
}

diagnose().catch(console.error);
