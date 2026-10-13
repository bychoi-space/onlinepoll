async function testDirectFetch() {
  try {
    const url = 'https://ongift.or.kr/afms/afm/common/fetchLclgv.do';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
        'Origin': 'https://ongift.or.kr',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log('fetchLclgv status:', res.status);
    const data = await res.json();
    console.log('fetchLclgv list length:', data.list?.length);
    console.log('Sample region:', data.list?.slice(0, 3));

    // Test fetchLclgvDtl.do
    const dtlRes = await fetch('https://ongift.or.kr/afms/afm/common/fetchLclgvDtl.do', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
        'Origin': 'https://ongift.or.kr',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ LCLGV_CD: '01' }).toString()
    });
    console.log('fetchLclgvDtl status:', dtlRes.status);
    const dtlData = await dtlRes.json();
    console.log('fetchLclgvDtl list length:', dtlData.list?.length);

    // Test selectFrcsData.do
    const frcsRes = await fetch('https://ongift.or.kr/afms/afm/common/selectFrcsData.do', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
        'Origin': 'https://ongift.or.kr',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        SEARCH_LCLGV_CD: '01',
        SEARCH_SGG_CD: '01018',
        SEARCH_MRKT_NM: '풍납시장',
        SEARCH_TYPE: '1',
        SEARCH_WORD: '',
        pageIndex: '1',
        recordCountPerPage: '100'
      }).toString()
    });
    console.log('selectFrcsData status:', frcsRes.status);
    const frcsData = await frcsRes.json();
    console.log('selectFrcsData list length:', frcsData.list?.length);
    console.log('First item:', frcsData.list?.[0]);

  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testDirectFetch();
