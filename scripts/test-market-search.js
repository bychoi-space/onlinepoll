const ONNURI_BASE_URL = 'https://ongift.or.kr';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Content-Type': 'application/x-www-form-urlencoded'
};

async function testSearchWord() {
  const body = new URLSearchParams({
    SEARCH_LCLGV_CD: '01',
    SEARCH_SGG_CD: '01018',
    SEARCH_MRKT_NM: '시장',
    SEARCH_TYPE: '1',
    SEARCH_WORD: '',
    pageIndex: '1',
    recordCountPerPage: '500'
  });
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: body.toString()
  });
  const data = await res.json();
  const list = data.list || [];
  console.log('Results with SEARCH_MRKT_NM=시장 in Songpa:', list.length);
  const markets = [...new Set(list.map(x => x.MRKT_NM).filter(Boolean))];
  console.log('Markets found:', markets);
}

testSearchWord().catch(console.error);
