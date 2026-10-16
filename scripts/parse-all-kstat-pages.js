import fs from 'fs';

async function parseAllPages() {
  const pages = ['Q1.asp', 'P1.asp', 'P2.asp', 'P3.asp', 'P4.asp', 'P5.asp'];
  const surveyAnalysis = {};

  for (const p of pages) {
    const url = 'https://kstat.surveys.kr/2026/P26042401B/' + p;
    const res = await fetch(url);
    const html = await res.text();

    // 제목/섹션명 추출
    const sectionMatch = html.match(/<div class="[^"]*text-primary[^"]*">([^<]+)<\/div>/i) ||
                         html.match(/<h[1-5][^>]*>([^<]+)<\/h[1-5]>/i);
    const sectionTitle = sectionMatch ? sectionMatch[1].trim() : p;

    // hidden input 중 Var, PageName, NextPage
    const varMatch = html.match(/name=['"]Var['"]\s+value=['"]([^'"]+)['"]/i);
    const pageNameMatch = html.match(/name=['"]PageName['"]\s+value=['"]([^'"]+)['"]/i);
    const nextPageMatch = html.match(/name=['"]NextPage['"]\s+value=['"]([^'"]+)['"]/i);

    // 질문 목록 추출 (table th 또는 .fw-bold 또는 질문 헤더)
    // 정규표현식으로 문1, 문2, [ ... ] 등 추출
    const rawQuestions = [];
    const qRegex = /(?:문\s*\d+|\[\s*SQ\d+|Q\d+|[ⅠⅡⅢⅣⅤ]\.\s*[^<]+|\d+\.\s*귀\s*[^<]+)/g;
    let match;
    while ((match = qRegex.exec(html)) !== null) {
      // 주변 텍스트 100자 발췌
      const snippet = html.slice(match.index, match.index + 120)
                          .replace(/<[^>]+>/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
      rawQuestions.push(snippet);
    }

    // 폼 input/select 요소들 요약
    const inputs = [];
    const inputMatches = html.match(/<(?:input|select|textarea)[^>]*>/gi) || [];
    inputMatches.forEach(tag => {
      const type = (tag.match(/type=['"]([^'"]+)['"]/i) || [])[1] || (tag.startsWith('<select') ? 'select' : 'textarea');
      const name = (tag.match(/name=['"]([^'"]+)['"]/i) || [])[1] || '';
      const id = (tag.match(/id=['"]([^'"]+)['"]/i) || [])[1] || '';
      const value = (tag.match(/value=['"]([^'"]+)['"]/i) || [])[1] || '';
      if (type !== 'hidden') {
        inputs.push({ type, name, id, value });
      }
    });

    // 텍스트 요약
    const cleanText = html.replace(/<style[^>]*>.*?<\/style>/gis, '')
                          .replace(/<script[^>]*>.*?<\/script>/gis, '')
                          .replace(/<[^>]+>/g, '\n')
                          .replace(/\n\s*\n/g, '\n')
                          .trim();

    surveyAnalysis[p] = {
      sectionTitle,
      pageName: pageNameMatch ? pageNameMatch[1] : '',
      nextPage: nextPageMatch ? nextPageMatch[1] : '',
      variables: varMatch ? varMatch[1].split(',') : [],
      inputCount: inputs.length,
      sampleInputs: inputs.slice(0, 15),
      rawQuestions: Array.from(new Set(rawQuestions)),
      textSnippet: cleanText.slice(0, 2000)
    };
  }

  fs.writeFileSync('scripts/kstat_survey_structure.json', JSON.stringify(surveyAnalysis, null, 2), 'utf-8');
  console.log('=== 케이스탯 전체 설문 구조 분석 파일 저장 완료 ===');
  console.log('저장 경로: scripts/kstat_survey_structure.json');

  // 각 페이지별 요약 출력
  for (const [p, data] of Object.entries(surveyAnalysis)) {
    console.log(`\n==================================================`);
    console.log(`[${p}] ${data.sectionTitle} (Page: ${data.pageName} -> Next: ${data.nextPage})`);
    console.log(`- 변수 목록 (${data.variables.length}개): ${data.variables.slice(0, 10).join(', ')}...`);
    console.log(`- 입력 컨트롤 수: ${data.inputCount}개`);
    console.log(`- 감지된 주요 문항:`);
    data.rawQuestions.slice(0, 6).forEach(q => console.log(`  * ${q}`));
  }
}

parseAllPages();
