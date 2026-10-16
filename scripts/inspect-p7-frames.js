async function fetchP7() {
  const p7Res = await fetch('https://kstat.surveys.kr/2026/P26042401B/P7.asp');
  const p7Html = await p7Res.text();
  console.log('=== P7.asp iframes ===');
  const iframes = [...p7Html.matchAll(/<iframe[^>]*src=['"]([^'"]+)['"][^>]*>/gi)].map(m => m[1]);
  console.log(iframes);

  // P7.asp 자체의 script 확인
  const p7Scripts = [...p7Html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  p7Scripts.forEach(s => {
    if (s.includes('alert') || s.includes('B5') || s.includes('A5')) {
      console.log('=== P7.asp main Script ===\n', s);
    }
  });

  for (const f of iframes) {
    console.log('\n--- Frame:', f);
    const fRes = await fetch('https://kstat.surveys.kr/2026/P26042401B/' + f);
    const fHtml = await fRes.text();
    const scripts = [...fHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    scripts.forEach(s => {
      if (s.includes('alert') || s.includes('B5') || s.includes('A5')) {
        console.log('Script in', f, ':\n', s);
      }
    });
    const inputs = [...fHtml.matchAll(/<input[^>]*>/gi)].map(m => m[0]);
    console.log('Inputs in', f, ':', inputs);
  }
}

fetchP7().catch(console.error);
