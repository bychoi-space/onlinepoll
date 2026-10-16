async function inspect() {
  const urls = [
    'https://kstat.surveys.kr/2026/P26042401B/B2.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B2A.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B4.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B5C1.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B5D1.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B5E.asp',
    'https://kstat.surveys.kr/2026/P26042401B/B5F1.asp'
  ];

  for (const url of urls) {
    console.log(`\n=================== ${url} ===================`);
    try {
      const res = await fetch(url);
      const text = await res.text();
      // Print inputs
      const inputs = text.match(/<input[^>]+>/gi) || [];
      console.log(`Inputs (${inputs.length}):`);
      inputs.forEach(inp => console.log('  ', inp.trim()));
      
      // Print table text or label snippets
      const rows = text.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      console.log(`Table Rows (${rows.length}):`);
      rows.forEach((r, idx) => {
        const clean = r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean) console.log(`  Row ${idx}:`, clean);
      });
    } catch (err) {
      console.error(err);
    }
  }
}

inspect();
