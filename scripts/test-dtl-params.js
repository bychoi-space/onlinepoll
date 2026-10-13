async function testDtlParams() {
  const params = [
    { LCLGV_CD: '01' },
    { SEARCH_LCLGV_CD: '01' },
    { lclgvCd: '01' }
  ];

  for (const p of params) {
    const res = await fetch('https://ongift.or.kr/afms/afm/common/fetchLclgvDtl.do', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://ongift.or.kr/afms/afm/SMMDL0001M05/page.do',
        'Origin': 'https://ongift.or.kr',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(p).toString()
    });
    const data = await res.json();
    console.log(`Param ${JSON.stringify(p)} -> count: ${data.list?.length}`);
    if (data.list?.length > 0) {
      console.log('Sample:', data.list[0]);
    }
  }
}
testDtlParams();
