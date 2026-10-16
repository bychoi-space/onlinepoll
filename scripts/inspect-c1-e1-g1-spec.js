async function run() {
  console.log('=== Inspecting P8 (C1), P11 (E1), P14 (G1), P4 (B1BA) ===');
  
  // P8 (C1)
  const c1Frames = ['C1A', 'C1B', 'C1BA', 'C1C', 'C1D', 'C1DA', 'C1E', 'C1EA', 'C1F', 'C1FA', 'C1G', 'C1GA'];
  for (const f of c1Frames) {
    try {
      const res = await fetch(`https://kstat.surveys.kr/2026/P26042401B/${f}.asp`);
      const html = await res.text();
      const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`\n[${f}.asp]`);
      console.log('Text:', clean.slice(0, 160));
      const inps = html.match(/<input[^>]+>/gi) || [];
      inps.filter(i => !i.includes("type='hidden'") && !i.includes('type="hidden"')).forEach(i => console.log('  Input:', i.trim()));
    } catch(e) {
      console.log(`[${f}.asp] Error:`, e.message);
    }
  }

  // P11 (E1)
  for (const f of ['E1', 'E1A']) {
    try {
      const res = await fetch(`https://kstat.surveys.kr/2026/P26042401B/${f}.asp`);
      const html = await res.text();
      const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`\n[${f}.asp]`);
      console.log('Text:', clean.slice(0, 160));
      const inps = html.match(/<input[^>]+>/gi) || [];
      inps.filter(i => !i.includes("type='hidden'") && !i.includes('type="hidden"')).forEach(i => console.log('  Input:', i.trim()));
    } catch(e) {}
  }

  // P14 (G1)
  for (const f of ['G1', 'G2']) {
    try {
      const res = await fetch(`https://kstat.surveys.kr/2026/P26042401B/${f}.asp`);
      const html = await res.text();
      const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`\n[${f}.asp]`);
      console.log('Text:', clean.slice(0, 160));
      const inps = html.match(/<input[^>]+>/gi) || [];
      inps.filter(i => !i.includes("type='hidden'") && !i.includes('type="hidden"')).forEach(i => console.log('  Input:', i.trim()));
    } catch(e) {}
  }

  // P4 (B1BA)
  for (const f of ['B1BA', 'B1BB', 'B1C', 'B1D', 'B1E']) {
    try {
      const res = await fetch(`https://kstat.surveys.kr/2026/P26042401B/${f}.asp`);
      const html = await res.text();
      const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`\n[${f}.asp]`);
      console.log('Text:', clean.slice(0, 160));
      const inps = html.match(/<input[^>]+>/gi) || [];
      inps.filter(i => !i.includes("type='hidden'") && !i.includes('type="hidden"')).forEach(i => console.log('  Input:', i.trim()));
    } catch(e) {}
  }
}

run();
