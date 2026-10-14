async function checkGhost() {
  const query = '가공시장 미존재가공기업_테스트';
  const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': 'https://www.naver.com/'
    }
  });
  const html = await res.text();
  const phone = '02-2181-0332';
  const idx = html.indexOf(phone);
  console.log('Phone idx:', idx);
  if (idx !== -1) {
    console.log(html.slice(idx - 200, idx + 200).replace(/<[^>]+>/g, ' '));
  }
}

checkGhost();
