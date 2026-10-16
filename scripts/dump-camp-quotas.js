import fs from 'fs';

const camp = JSON.parse(fs.readFileSync('data/campaigns.json', 'utf8')).find(c => c.id === 'camp_1792039653802');
camp.quotaDatabase.forEach((q, idx) => {
  console.log(`[#${idx+1}] ${q.companyName} | status: ${q.quotaStatus} | extra: ${q.extraLabel} | url: ${q.slotUrl}`);
});
