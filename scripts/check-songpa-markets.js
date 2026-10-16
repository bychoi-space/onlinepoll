import { getOnnuriRegions, getOnnuriDistricts } from '../src/engine/onnuri.js';

async function main() {
  const regions = await getOnnuriRegions();
  const seoul = regions.find(r => r.name === '서울');
  const districts = await getOnnuriDistricts(seoul.code);
  const songpa = districts.find(d => d.name.includes('송파'));

  const res = await fetch(`https://ongift.or.kr/afms/afm/common/selectFrcsData.do`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      SEARCH_LCLGV_CD: seoul.code,
      SEARCH_SGG_CD: songpa.code,
      SEARCH_MRKT_NM: '',
      SEARCH_TYPE: '1',
      SEARCH_WORD: '',
      pageIndex: '1',
      recordCountPerPage: '500'
    }).toString()
  });

  const data = await res.json();
  const markets = [...new Set((data.list || []).map(x => x.MRKT_NM).filter(Boolean))];
  console.log('송파구 내 시장 목록:', markets);
}

main().catch(console.error);
