import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

// 전체 페이지 및 세부 iframe 목록
const SURVEY_STRUCTURE = [
  {
    step: 'Intro',
    container: 'index.asp',
    title: '설문 안내 및 시작',
    frames: ['index.asp']
  },
  {
    step: 'SQ1',
    container: 'Survey.asp',
    title: '응답자 적격성 확인 (스크리닝)',
    frames: ['Survey.asp']
  },
  {
    step: 'Q1',
    container: 'Q1.asp',
    title: '점포주(사업체) 기본정보',
    frames: ['Q1.asp']
  },
  {
    step: 'P1',
    container: 'P1.asp',
    title: '점포 기본정보 (성별, 연령, 사업자등록, 개업연월)',
    frames: ['A1.asp', 'A2.asp', 'A3.asp', 'A3A.asp', 'A4.asp', 'A4A.asp', 'A5.asp']
  },
  {
    step: 'P2',
    container: 'P2.asp',
    title: '점포 면적 및 임차/소유 실태',
    frames: ['A9.asp', 'A10.asp']
  },
  {
    step: 'P3',
    container: 'P3.asp',
    title: 'Ⅰ. 일반 현황 및 영업 실태 - 영업일수 및 영업시간',
    frames: ['B1AA.asp', 'B1AB.asp', 'B1AC.asp']
  },
  {
    step: 'P4',
    container: 'P4.asp',
    title: 'Ⅰ. 일반 현황 및 영업 실태 - 종사자 및 인력 현황',
    frames: ['B1BA.asp', 'B1BB.asp', 'B1BC.asp', 'B1BD.asp', 'B1C.asp', 'B1D.asp', 'B1E.asp']
  },
  {
    step: 'P5',
    container: 'P5.asp',
    title: 'Ⅰ. 일반 현황 및 영업 실태 - 상품 조달 및 물류',
    frames: ['B2.asp', 'B2A.asp', 'B3.asp']
  },
  {
    step: 'P6',
    container: 'P6.asp',
    title: 'Ⅰ. 일반 현황 및 영업 실태 - 고객 관리 및 마케팅',
    frames: ['B4.asp']
  },
  {
    step: 'P7',
    container: 'P7.asp',
    title: 'Ⅰ. 일반 현황 및 영업 실태 - 온누리상품권 가맹 및 취급 실태',
    frames: [
      'B5A1.asp', 'B5AA.asp', 'B5B1.asp', 'B5C1.asp', 'B5D1.asp', 'B5E.asp', 'B5F1.asp', 'B5G.asp',
      'B5A2.asp', 'B5AB.asp', 'B5B2.asp', 'B5C2.asp', 'B5D2.asp', 'B5F2.asp'
    ]
  },
  {
    step: 'P8',
    container: 'P8.asp',
    title: 'Ⅱ. 매출 및 결제수단 실태 - 연간 매출액 및 결제수단 비중',
    frames: [
      'C1A.asp', 'C1B.asp', 'C1BA.asp', 'C1C.asp', 'C1D.asp', 'C1DA.asp',
      'C1E.asp', 'C1EA.asp', 'C1F.asp', 'C1FA.asp', 'C1G.asp', 'C1GA.asp'
    ]
  },
  {
    step: 'P9',
    container: 'P9.asp',
    title: 'Ⅱ. 매출 및 결제수단 실태 - 결제 수수료 및 모바일 페이',
    frames: [
      'C2A.asp', 'C2AA.asp', 'C2B.asp', 'C2BA.asp', 'C2C.asp', 'C2CA.asp',
      'C2D.asp', 'C2DA.asp', 'C2E.asp'
    ]
  },
  {
    step: 'P10',
    container: 'P10.asp',
    title: 'Ⅲ. 상권 및 고객 동향 - 단골 비중 및 주 고객층',
    frames: ['D1.asp', 'D1A.asp', 'D1B.asp', 'D1C.asp', 'D1D.asp', 'D1DA.asp']
  },
  {
    step: 'P11',
    container: 'P11.asp',
    title: 'Ⅳ. 경영 실태 - 경영 애로사항 및 영업 환경',
    frames: ['E1.asp', 'E1A.asp']
  },
  {
    step: 'P12',
    container: 'P12.asp',
    title: 'Ⅳ. 경영 실태 - 원가 부담 및 상인회 활동',
    frames: ['E2A.asp', 'E2AA.asp', 'E2B.asp', 'E2BA.asp', 'E2C.asp', 'E2CA.asp']
  },
  {
    step: 'P13',
    container: 'P13.asp',
    title: 'Ⅴ. 사업 환경 및 정책 수요 - 정부/공단 지원사업 인지 및 참여',
    frames: ['F1.asp', 'F2.asp', 'F3.asp']
  },
  {
    step: 'P14',
    container: 'P14.asp',
    title: 'Ⅴ. 사업 환경 및 정책 수요 - 필요 정책 및 건의사항',
    frames: ['G1.asp', 'G1A.asp', 'G1AA.asp', 'G1B.asp', 'G2.asp']
  },
  {
    step: 'Agree',
    container: 'Agree.asp',
    title: '개인정보 수집·이용 동의 및 최종 완료',
    frames: ['Agree.asp']
  }
];

const BASE_URL = 'https://kstat.surveys.kr/2026/P26042401B/';

// HTML 파싱 도우미
function extractQuestionData(html, filename, stepInfo) {
  // 스크립트 및 스타일 제거
  const cleanHtml = html.replace(/<style[^>]*>.*?<\/style>/gis, '')
                        .replace(/<script[^>]*>.*?<\/script>/gis, '');

  // 1. 질문 타이틀 추출
  // 보통 <div class="fs-5...">, <th>, <h5>, <h4> 등에 위치
  let qTitle = '';
  const titleMatches = cleanHtml.match(/<(?:div|h[3-6]|th)[^>]*(?:fs-[45]|fw-bold|text-primary|v_mid)[^>]*>([\s\S]*?)<\/(?:div|h[3-6]|th)>/gi) || [];
  for (const tm of titleMatches) {
    const text = tm.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 2 && !text.includes('인 사 말') && !text.includes('설문조사 목차') && !text.includes('1%')) {
      qTitle = text;
      break;
    }
  }

  if (!qTitle) {
    // 텍스트 기반 탐색
    const textLines = cleanHtml.replace(/<[^>]+>/g, '\n')
                               .split('\n')
                               .map(l => l.trim())
                               .filter(l => l.length > 2 && (l.includes('문') || l.includes('A') || l.includes('B') || l.includes('C') || l.includes('D') || l.includes('E') || l.includes('F') || l.includes('G') || l.includes('Q')));
    qTitle = textLines.slice(0, 3).join(' / ') || filename;
  }

  // 2. input, select, textarea 추출
  const inputs = [];
  const inputTags = cleanHtml.match(/<(?:input|select|textarea)[^>]*>/gi) || [];
  
  // 라벨 매핑 (label 태그 또는 td/th)
  inputTags.forEach(tag => {
    const type = (tag.match(/type=['"]([^'"]+)['"]/i) || [])[1] || (tag.startsWith('<select') ? 'select' : (tag.startsWith('<textarea') ? 'textarea' : 'text'));
    const name = (tag.match(/name=['"]([^'"]+)['"]/i) || [])[1] || '';
    const id = (tag.match(/id=['"]([^'"]+)['"]/i) || [])[1] || '';
    const value = (tag.match(/value=['"]([^'"]+)['"]/i) || [])[1] || '';
    const disabled = tag.includes('disabled');
    const readonly = tag.includes('readonly');

    if (type !== 'hidden') {
      inputs.push({ type, name, id, value, disabled, readonly });
    }
  });

  // 3. 선택지(라벨) 추출
  const options = [];
  // 라디오나 체크박스 주변 텍스트
  const labelMatches = cleanHtml.match(/<label[^>]*>([\s\S]*?)<\/label>/gi) || [];
  labelMatches.forEach(lm => {
    const forId = (lm.match(/for=['"]([^'"]+)['"]/i) || [])[1] || '';
    const labelText = lm.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (labelText) {
      options.push({ forId, text: labelText });
    }
  });

  // 텍스트 전체 요약
  const fullText = cleanHtml.replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

  return {
    filename,
    qTitle,
    inputCount: inputs.length,
    inputs,
    options,
    fullTextSnippet: fullText.slice(0, 600)
  };
}

async function buildSpecification() {
  console.log('=== 케이스탯 설문 전 문항 명세 추출 시작 ===');
  const allParsed = [];

  for (const step of SURVEY_STRUCTURE) {
    console.log(`\n[${step.step}] ${step.title} (${step.frames.length}개 파일) 수집 중...`);

    for (const f of step.frames) {
      const url = BASE_URL + f;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`- ${f}: HTTP ${res.status}`);
          continue;
        }
        const html = await res.text();
        const data = extractQuestionData(html, f, step);

        // 보기(옵션) 정리
        let optionsSummary = '';
        if (data.options.length > 0) {
          optionsSummary = data.options.map(o => o.text).join(' | ');
        } else {
          // input value나 fullText에서 보기 추출
          const optTexts = data.inputs.map(i => {
            if (i.type === 'radio' || i.type === 'checkbox') return `${i.name}=${i.value}`;
            return `${i.name}(${i.type})`;
          });
          optionsSummary = optTexts.slice(0, 10).join(', ');
        }

        // 입력 컴포넌트 타입 판별
        const types = Array.from(new Set(data.inputs.map(i => i.type)));
        let componentType = types.join(', ') || '안내/버튼';
        if (types.includes('radio') && types.includes('text')) componentType = '라디오(단일) + 기타 텍스트';
        else if (types.includes('radio')) componentType = '단일 선택 (라디오)';
        else if (types.includes('checkbox')) componentType = '복수 선택 (체크박스)';
        else if (types.includes('text') || types.includes('tel')) componentType = '단답형/숫자 텍스트';
        else if (types.includes('textarea')) componentType = '장문형 텍스트';

        allParsed.push({
          대단원: step.step,
          섹션명: step.title,
          파일명: f,
          문항제목: data.qTitle,
          응답유형: componentType,
          주요변수명: Array.from(new Set(data.inputs.map(i => i.name))).filter(Boolean).join(', '),
          선택지및내용: optionsSummary.slice(0, 300),
          화면요약: data.fullTextSnippet.slice(0, 200)
        });

        console.log(`  ✓ ${f}: [${componentType}] ${data.qTitle.slice(0, 40)}`);
      } catch (err) {
        console.error(`- ${f} 에러:`, err.message);
      }
    }
  }

  // 1. JSON 저장
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  
  const jsonPath = path.join(reportsDir, 'kstat_survey_spec.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allParsed, null, 2), 'utf-8');
  console.log(`\n[저장 완료] JSON 명세서: ${jsonPath} (총 ${allParsed.length}개 문항/파일)`);

  // 2. Excel(.xlsx) 파일 생성
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(allParsed);

  // 열 너비 자동 설정
  ws['!cols'] = [
    { wch: 8 },  // 대단원
    { wch: 35 }, // 섹션명
    { wch: 14 }, // 파일명
    { wch: 45 }, // 문항제목
    { wch: 22 }, // 응답유형
    { wch: 25 }, // 주요변수명
    { wch: 60 }, // 선택지및내용
    { wch: 50 }  // 화면요약
  ];

  xlsx.utils.book_append_sheet(wb, ws, '전통시장점포주실태조사명세');
  const excelPath = path.join(reportsDir, 'kstat_survey_specification.xlsx');
  xlsx.writeFile(wb, excelPath);
  console.log(`[저장 완료] Excel 명세서: ${excelPath}`);

  return allParsed;
}

buildSpecification();
