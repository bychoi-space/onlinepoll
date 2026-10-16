async function inspectMergeTemplate() {
  const url = 'https://kstat.surveys.kr/2026/P26042401B/js/merge-template.js?v=260713';
  const res = await fetch(url);
  const text = await res.text();
  console.log('merge-template.js length:', text.length);

  // validation 관련 로직
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('VALIDATION_RULES') || line.includes('checkValidation') || line.includes('applyFlowRules')) {
      console.log(`Line ${idx + 1}: ${line}`);
    }
  });

  // FLOW_RULES 처리 함수 검색
  const flowMatch = text.match(/function [a-zA-Z0-9_]*[fF]low[a-zA-Z0-9_]*\s*\([^\)]*\)\s*\{[\s\S]*?\n\}/);
  if (flowMatch) console.log('Flow function:\n', flowMatch[0].slice(0, 1000));
}

inspectMergeTemplate().catch(console.error);
