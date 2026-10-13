async function inspectOnnuriKeys() {
  const res = await fetch('https://ongift.or.kr/afms/afm/common/selectFrcsData.do', {
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
      recordCountPerPage: '10'
    }).toString()
  });

  const data = await res.json();
  console.log('List length:', data.list?.length);
  if (data.list && data.list.length > 0) {
    console.log('Keys of first item:', Object.keys(data.list[0]));
    console.log('Sample item 0:', data.list[0]);
    console.log('Sample item 1:', data.list[1]);
  }
}

inspectOnnuriKeys();
