async function getLoadedScripts() {
  const url = 'https://kstat.surveys.kr/2026/P26042401B/P1.asp';
  const res = await fetch(url);
  const html = await res.text();
  const srcMatches = html.match(/<script[^>]+src=[^>]+>/gi) || [];
  console.log('Script sources:');
  srcMatches.forEach(s => console.log(s));
}
getLoadedScripts();
