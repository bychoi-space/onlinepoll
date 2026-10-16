async function inspectP9() {
  const r = await fetch('https://kstat.surveys.kr/2026/P26042401B/P9.asp');
  const html = await r.text();
  console.log('=== P9 FLOW RULES ===');
  const m = html.match(/var FLOW_RULES\s*=\s*\{[\s\S]*?\};/);
  if (m) console.log(m[0]);

  const vm = html.match(/var VALIDATION_MESSAGES\s*=\s*\{[\s\S]*?\};/);
  if (vm) console.log(vm[0]);

  for (const f of ['C2A', 'C2B', 'C2C', 'C2D', 'C2E', 'C2A1', 'C2B1', 'C2A_1', 'C2B_1']) {
    const r2 = await fetch('https://kstat.surveys.kr/2026/P26042401B/' + f + '.asp');
    if (r2.ok) {
      const h = await r2.text();
      const inputs = [...h.matchAll(/<input[^>]*>/gi)].map(x => x[0]);
      console.log('=== ' + f + ' ===', inputs);
    }
  }
}

inspectP9().catch(console.error);
