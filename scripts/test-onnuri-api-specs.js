const ONNURI_BASE_URL = 'https://ongift.or.kr';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
  'Origin': 'https://ongift.or.kr',
  'Content-Type': 'application/x-www-form-urlencoded'
};

async function testFetch() {
  const body = new URLSearchParams({
    SEARCH_LCLGV_CD: '01',
    SEARCH_SGG_CD: '',
    SEARCH_MRKT_NM: '',
    SEARCH_TYPE: '1',
    SEARCH_WORD: '',
    pageIndex: '1',
    recordCountPerPage: '10'
  });
  const res = await fetch(`${ONNURI_BASE_URL}/afms/afm/common/selectFrcsData.do`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: body.toString()
  });
  const data = await res.json();
  console.log('Top level keys:', Object.keys(data));
  console.log('Pagination info:', data.paginationInfo);
  console.log('List length:', data.list?.length);
  if (data.list && data.list.length > 0) {
    const item = data.list[0];
    console.log('Sample item keys:', Object.keys(item));
    console.log('Sample merchant:', item.MRKT_NM, item.ACTL_FRCS_NM, item.FRCS_ENBRNO, item.TPBIZ_NM);
  }
}

testFetch().catch(console.error);
