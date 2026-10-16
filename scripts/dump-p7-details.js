async function dumpP7Scripts() {
  const res = await fetch('https://kstat.surveys.kr/2026/P26042401B/P7.asp');
  const html = await res.text();
  const srcs = [...html.matchAll(/<script[^>]*src=['"]([^'"]+)['"][^>]*>/gi)].map(m => m[1]);
  console.log('Script srcs:', srcs);

  // validation 관련 함수가 들어있는 script 태그
  const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  inlineScripts.forEach((s, i) => {
    if (s.includes('validate') || s.includes('FLOW_RULES') || s.includes('check')) {
      console.log(`\n=== Inline Script #${i} ===`);
      console.log(s.slice(0, 800));
    }
  });
}

dumpP7Scripts().catch(console.error);
