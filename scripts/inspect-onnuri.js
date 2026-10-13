import { chromium } from 'playwright';

async function inspectOnnuri() {
  console.log('Launching browser to inspect Onnuri page...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Listen to network requests
  page.on('request', req => {
    if (req.url().includes('page.do') || req.url().includes('select') || req.url().includes('search') || req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('select') || res.url().includes('search') || res.url().includes('list') || res.url().includes('Market')) {
      console.log(`[RES] ${res.status()} ${res.url()}`);
    }
  });

  try {
    const url = 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do';
    console.log(`Navigating to ${url}...`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`Page loaded with status: ${resp?.status()}`);

    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Page Title:', title);

    // Inspect inputs, selects, buttons
    const formInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, button')).map(el => {
        return {
          tag: el.tagName,
          id: el.id,
          name: el.name,
          className: el.className,
          type: el.type,
          value: el.value,
          text: el.innerText ? el.innerText.trim().slice(0, 30) : ''
        };
      });
      return inputs;
    });

    console.log('Form elements count:', formInfo.length);
    console.log('Form elements sample:', JSON.stringify(formInfo.slice(0, 20), null, 2));

  } catch (err) {
    console.error('Error during inspection:', err.message);
  } finally {
    await browser.close();
  }
}

inspectOnnuri();
