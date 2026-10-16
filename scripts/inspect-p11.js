async function inspectP11() {
  const res = await fetch('https://kstat.surveys.kr/2026/P26042401B/P11.asp');
  const html = await res.text();
  const iframes = [...html.matchAll(/<iframe[^>]*src=['"]([^'"]+)['"][^>]*>/gi)].map(m => m[1]);
  console.log('P11 iframes:', iframes);
  
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  scripts.forEach((s, idx) => {
    if (s.includes('FLOW_RULES') || s.includes('VALIDATION_RULES')) {
      console.log('P11 rules:\n', s);
    }
  });

  const e1Res = await fetch('https://kstat.surveys.kr/2026/P26042401B/E1.asp');
  const e1Html = await e1Res.text();
  console.log('E1.asp inputs:', [...e1Html.matchAll(/<input[^>]*>/gi)].map(m => m[0]));
}

inspectP11().catch(console.error);
