async function scanAllP() {
  const result = {};
  for (let i = 1; i <= 14; i++) {
    const pageName = `P${i}.asp`;
    const url = `https://kstat.surveys.kr/2026/P26042401B/${pageName}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`${pageName}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const iframeMatches = html.match(/data-src=["']([^"']+)["']/g) || [];
      const srcList = iframeMatches.map(s => s.replace(/data-src=["']|["']/g, ''));
      result[pageName] = srcList;
      console.log(`[${pageName}] (${srcList.length}개 iframe): ${srcList.join(', ')}`);
    } catch (e) {
      console.error(`${pageName} fetch failed:`, e.message);
    }
  }

  // Agree.asp도 확인
  try {
    const agreeRes = await fetch('https://kstat.surveys.kr/2026/P26042401B/Agree.asp');
    const agreeHtml = await agreeRes.text();
    const iframeMatches = agreeHtml.match(/data-src=["']([^"']+)["']/g) || [];
    const srcList = iframeMatches.map(s => s.replace(/data-src=["']|["']/g, ''));
    result['Agree.asp'] = srcList;
    console.log(`[Agree.asp] (${srcList.length}개 iframe): ${srcList.join(', ')}`);
  } catch (e) {}

  return result;
}

scanAllP();
