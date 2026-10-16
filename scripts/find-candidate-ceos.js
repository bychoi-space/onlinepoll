import { enrichBusinessData } from '../src/engine/enricher.js';

async function check() {
  const list = [
    { name: '행복한우리약국', bizNumber: '215-17-53301', address: '서울특별시 송파구 풍성로25길 41' },
    { name: '헐리우드안경', bizNumber: '108-06-86793', address: '서울특별시 송파구 풍납동 478' },
    { name: '수현머리이야기', bizNumber: '212-35-40422', address: '서울특별시 송파구 바람드리길 35' },
    { name: '상덕의원', bizNumber: '219-96-03400', address: '서울특별시 송파구 풍납동' }
  ];

  for (const item of list) {
    const enriched = await enrichBusinessData({
      companyName: item.name,
      bizNumber: item.bizNumber,
      address: item.address,
      ceoName: null,
      phone: null
    });
    console.log(`[${item.name}] CEO: ${enriched.ceoName || '-'} (${enriched.ceoSource || 'none'}) | Phone: ${enriched.phone || '-'}`);
  }
}

check().catch(console.error);
