/**
 * 한글 성명 초성·중성·종성 벡터 획(Stroke) 분해 및 50~70대 중장년·고령 남성 특화 8종 필체 전자서명 공통 유틸리티
 * - 구성: 정자체(2종) · 흘려쓰기(2종) · 결재 싸인체(2종) · 단순 약식체(2종)
 * - 한국리서치 에너지총조사 답례품 수령증 (jQuery UI Signature / Canvas)
 * - 한국갤럽 귀농귀촌 실태조사 (SignaturePad) 등 공통 활용
 */

export const KOREAN_SIGNATURE_STYLES = [
  {
    index: 0,
    mode: 'full_jungja',
    label: '스타일 A · 중장년 정자체 (각진 획·묵직한 필압)',
    slant: -0.03,
    baseSlope: -0.01,
    aspectX: 0.98,
    aspectY: 1.04,
    cursive: 0.08,
    flourish: 0,
    minW: 1.5,
    maxW: 3.1,
    tremor: 0.36
  },
  {
    index: 1,
    mode: 'flowing_cursive',
    label: '스타일 B · 중년 행서 흘려쓰기 (우상향 연속 필기)',
    slant: -0.24,
    baseSlope: -0.07,
    aspectX: 1.08,
    aspectY: 0.94,
    cursive: 0.74,
    flourish: 1,
    minW: 1.3,
    maxW: 2.9,
    tremor: 0.48
  },
  {
    index: 2,
    mode: 'exec_sign_underline',
    label: '스타일 C · 중년 결재 싸인체 (대형 성씨+루프 밑줄)',
    slant: -0.32,
    baseSlope: -0.06,
    aspectX: 1.18,
    aspectY: 0.92,
    cursive: 0.90,
    flourish: 4,
    minW: 1.2,
    maxW: 2.8,
    tremor: 0.52
  },
  {
    index: 3,
    mode: 'heavy_cursive',
    label: '스타일 D · 굵은 붓펜 흘려쓰기 (강한 필압·시원한 획)',
    slant: -0.12,
    baseSlope: -0.02,
    aspectX: 1.10,
    aspectY: 1.04,
    cursive: 0.58,
    flourish: 0,
    minW: 1.8,
    maxW: 3.7,
    tremor: 0.40
  },
  {
    index: 4,
    mode: 'surname_wave_simple',
    label: '스타일 E · 단순 약식체 (성씨 위주+단순 물결 생략)',
    slant: -0.18,
    baseSlope: -0.03,
    aspectX: 1.12,
    aspectY: 0.96,
    cursive: 0.85,
    flourish: 0,
    minW: 1.5,
    maxW: 3.1,
    tremor: 0.46
  },
  {
    index: 5,
    mode: 'elder_jungja',
    label: '스타일 F · 60~70대 어르신 정자체 (세로 장체·눌러쓰기)',
    slant: 0.05,
    baseSlope: 0.03,
    aspectX: 0.84,
    aspectY: 1.18,
    cursive: 0.06,
    flourish: 0,
    minW: 1.5,
    maxW: 3.2,
    tremor: 0.76
  },
  {
    index: 6,
    mode: 'minimal_one_stroke',
    label: '스타일 G · 초간단 일필 약식체 (무심한 단선 약식 싸인)',
    slant: -0.26,
    baseSlope: -0.02,
    aspectX: 1.24,
    aspectY: 0.88,
    cursive: 0.95,
    flourish: 1,
    minW: 1.4,
    maxW: 3.0,
    tremor: 0.44
  },
  {
    index: 7,
    mode: 'initial_hook_sign',
    label: '스타일 H · 초성 강조 싸인체 (강한 첫획+우측 뻗침)',
    slant: -0.28,
    baseSlope: -0.05,
    aspectX: 1.14,
    aspectY: 1.02,
    cursive: 0.82,
    flourish: 2,
    minW: 1.4,
    maxW: 3.4,
    tremor: 0.54
  }
];

const CHO_STROKES = {
  0: [[[0.1, 0.2], [0.85, 0.2], [0.75, 0.85]]], // ㄱ
  1: [[[0.05, 0.2], [0.45, 0.2], [0.4, 0.85]], [[0.5, 0.2], [0.9, 0.2], [0.82, 0.85]]], // ㄲ
  2: [[[0.15, 0.15], [0.15, 0.82], [0.88, 0.80]]], // ㄴ
  3: [[[0.15, 0.2], [0.85, 0.2]], [[0.15, 0.2], [0.15, 0.82], [0.88, 0.82]]], // ㄷ
  4: [[[0.1, 0.2], [0.45, 0.2]], [[0.1, 0.2], [0.1, 0.82], [0.45, 0.82]], [[0.52, 0.2], [0.9, 0.2]], [[0.52, 0.2], [0.52, 0.82], [0.9, 0.82]]], // ㄸ
  5: [[[0.12, 0.18], [0.85, 0.18], [0.82, 0.48], [0.15, 0.50], [0.15, 0.84], [0.88, 0.82]]], // ㄹ
  6: [[[0.15, 0.2], [0.15, 0.82]], [[0.15, 0.2], [0.85, 0.2], [0.82, 0.82]], [[0.15, 0.82], [0.85, 0.82]]], // ㅁ
  7: [[[0.18, 0.15], [0.18, 0.82]], [[0.82, 0.15], [0.78, 0.82]], [[0.18, 0.48], [0.80, 0.48]], [[0.18, 0.82], [0.80, 0.82]]], // ㅂ
  8: [[[0.1, 0.15], [0.1, 0.82], [0.45, 0.82], [0.45, 0.15]], [[0.52, 0.15], [0.52, 0.82], [0.88, 0.82], [0.88, 0.15]], [[0.1, 0.48], [0.88, 0.48]]], // ㅃ
  9: [[[0.52, 0.15], [0.12, 0.85]], [[0.48, 0.38], [0.88, 0.85]]], // ㅅ
  10: [[[0.35, 0.15], [0.08, 0.85]], [[0.32, 0.42], [0.52, 0.85]], [[0.72, 0.15], [0.48, 0.85]], [[0.70, 0.42], [0.92, 0.85]]], // ㅆ
  11: [[[0.5, 0.16], [0.2, 0.32], [0.15, 0.65], [0.45, 0.85], [0.82, 0.70], [0.85, 0.35], [0.52, 0.16]]], // ㅇ
  12: [[[0.15, 0.2], [0.85, 0.2], [0.15, 0.85]], [[0.48, 0.48], [0.88, 0.85]]], // ㅈ
  13: [[[0.1, 0.2], [0.48, 0.2], [0.1, 0.85]], [[0.52, 0.2], [0.9, 0.2], [0.52, 0.85]], [[0.68, 0.48], [0.92, 0.85]]], // ㅉ
  14: [[[0.38, 0.08], [0.68, 0.12]], [[0.15, 0.28], [0.85, 0.26], [0.15, 0.86]], [[0.48, 0.52], [0.88, 0.86]]], // ㅊ
  15: [[[0.15, 0.2], [0.85, 0.2], [0.75, 0.85]], [[0.18, 0.52], [0.78, 0.50]]], // ㅋ
  16: [[[0.15, 0.2], [0.85, 0.2]], [[0.18, 0.50], [0.80, 0.50]], [[0.15, 0.2], [0.15, 0.84], [0.88, 0.82]]], // ㅌ
  17: [[[0.12, 0.2], [0.88, 0.2]], [[0.32, 0.2], [0.30, 0.82]], [[0.68, 0.2], [0.66, 0.82]], [[0.10, 0.82], [0.90, 0.82]]], // ㅍ
  18: [[[0.38, 0.08], [0.65, 0.10]], [[0.12, 0.26], [0.88, 0.24]], [[0.5, 0.38], [0.22, 0.55], [0.25, 0.84], [0.75, 0.84], [0.78, 0.52], [0.5, 0.38]]] // ㅎ
};

const JUNG_STROKES = {
  0: [[[0.35, 0.08], [0.32, 0.92]], [[0.34, 0.48], [0.85, 0.48]]], // ㅏ
  1: [[[0.25, 0.08], [0.22, 0.92]], [[0.24, 0.48], [0.68, 0.48]], [[0.72, 0.08], [0.70, 0.92]]], // ㅐ
  2: [[[0.32, 0.08], [0.30, 0.92]], [[0.32, 0.35], [0.85, 0.35]], [[0.32, 0.62], [0.85, 0.62]]], // ㅑ
  3: [[[0.22, 0.08], [0.20, 0.92]], [[0.22, 0.35], [0.65, 0.35]], [[0.22, 0.62], [0.65, 0.62]], [[0.72, 0.08], [0.70, 0.92]]], // ㅒ
  4: [[[0.15, 0.48], [0.65, 0.48]], [[0.68, 0.08], [0.64, 0.92]]], // ㅓ
  5: [[[0.10, 0.48], [0.48, 0.48]], [[0.50, 0.08], [0.48, 0.92]], [[0.82, 0.08], [0.78, 0.92]]], // ㅔ
  6: [[[0.15, 0.35], [0.65, 0.35]], [[0.15, 0.62], [0.65, 0.62]], [[0.68, 0.08], [0.64, 0.92]]], // ㅕ
  7: [[[0.10, 0.35], [0.48, 0.35]], [[0.10, 0.62], [0.48, 0.62]], [[0.50, 0.08], [0.48, 0.92]], [[0.82, 0.08], [0.78, 0.92]]], // ㅖ
  8: [[[0.48, 0.15], [0.48, 0.68]], [[0.08, 0.70], [0.92, 0.68]]], // ㅗ
  9: [[[0.35, 0.15], [0.35, 0.62]], [[0.05, 0.64], [0.68, 0.62]], [[0.72, 0.08], [0.70, 0.92]], [[0.72, 0.50], [0.96, 0.50]]], // ㅘ
  10: [[[0.32, 0.15], [0.32, 0.62]], [[0.05, 0.64], [0.60, 0.62]], [[0.65, 0.08], [0.64, 0.92]], [[0.88, 0.08], [0.86, 0.92]]], // ㅙ
  11: [[[0.38, 0.15], [0.38, 0.65]], [[0.08, 0.68], [0.72, 0.66]], [[0.78, 0.08], [0.75, 0.92]]], // ㅚ
  12: [[[0.35, 0.15], [0.35, 0.68]], [[0.62, 0.15], [0.62, 0.68]], [[0.08, 0.70], [0.92, 0.68]]], // ㅛ
  13: [[[0.08, 0.25], [0.92, 0.24]], [[0.48, 0.25], [0.46, 0.88]]], // ㅜ
  14: [[[0.05, 0.28], [0.65, 0.26]], [[0.35, 0.28], [0.34, 0.85]], [[0.42, 0.55], [0.72, 0.55]], [[0.75, 0.08], [0.72, 0.92]]], // ㅝ
  15: [[[0.05, 0.28], [0.60, 0.26]], [[0.32, 0.28], [0.30, 0.85]], [[0.65, 0.08], [0.63, 0.92]], [[0.88, 0.08], [0.85, 0.92]]], // ㅞ
  16: [[[0.08, 0.28], [0.70, 0.26]], [[0.38, 0.28], [0.36, 0.85]], [[0.78, 0.08], [0.75, 0.92]]], // ㅟ
  17: [[[0.08, 0.25], [0.92, 0.24]], [[0.35, 0.25], [0.34, 0.88]], [[0.62, 0.25], [0.60, 0.88]]], // ㅠ
  18: [[[0.08, 0.50], [0.92, 0.48]]], // ㅡ
  19: [[[0.08, 0.55], [0.72, 0.53]], [[0.78, 0.08], [0.75, 0.92]]], // ㅢ
  20: [[[0.50, 0.08], [0.48, 0.92]]] // ㅣ
};

const JONG_MAP = {
  1: CHO_STROKES[0], 2: CHO_STROKES[1], 4: CHO_STROKES[2], 7: CHO_STROKES[3],
  8: CHO_STROKES[5], 16: CHO_STROKES[6], 17: CHO_STROKES[7], 19: CHO_STROKES[9],
  20: CHO_STROKES[10], 21: CHO_STROKES[11], 22: CHO_STROKES[12], 23: CHO_STROKES[14],
  24: CHO_STROKES[15], 25: CHO_STROKES[16], 26: CHO_STROKES[17], 27: CHO_STROKES[18]
};

function mapBox(strokes, bx, by, bw, bh) {
  return (strokes || []).map(st => st.map(([px, py]) => [bx + px * bw, by + py * bh]));
}

export function decomposeHangulCharStrokes(ch) {
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) {
    return [[[0.2, 0.5], [0.8, 0.5]]];
  }
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  const isHorizJung = [8, 12, 13, 17, 18].includes(jung);
  const isMixedJung = [9, 10, 11, 14, 15, 16, 19].includes(jung);
  const hasJong = jong > 0;

  const out = [];
  if (isHorizJung) {
    out.push(...mapBox(CHO_STROKES[cho], 0.15, 0.05, 0.70, hasJong ? 0.34 : 0.45));
    out.push(...mapBox(JUNG_STROKES[jung], 0.08, hasJong ? 0.40 : 0.52, 0.84, hasJong ? 0.24 : 0.36));
    if (hasJong) {
      out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.18, 0.66, 0.66, 0.30));
    }
  } else if (isMixedJung) {
    out.push(...mapBox(CHO_STROKES[cho], 0.08, 0.06, 0.48, hasJong ? 0.36 : 0.46));
    out.push(...mapBox(JUNG_STROKES[jung], 0.08, 0.06, 0.86, hasJong ? 0.56 : 0.82));
    if (hasJong) {
      out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.18, 0.64, 0.68, 0.32));
    }
  } else {
    out.push(...mapBox(CHO_STROKES[cho], 0.06, 0.08, 0.44, hasJong ? 0.50 : 0.76));
    out.push(...mapBox(JUNG_STROKES[jung], 0.50, 0.05, 0.44, hasJong ? 0.55 : 0.84));
    if (hasJong) {
      out.push(...mapBox(JONG_MAP[jong] || CHO_STROKES[0], 0.16, 0.62, 0.70, 0.34));
    }
  }
  return out;
}

/**
 * 50~70대 남성의 빠른 약식/결재 싸인용 뒷글자(이름 부분) 축약 초성·파형 획 추출
 */
function buildAbbreviatedTrailingStrokes(ch, seedVal = 0) {
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) {
    return [[[0.1, 0.55], [0.85, 0.48]]];
  }
  const cho = Math.floor(code / 588);
  const choBase = CHO_STROKES[cho] || CHO_STROKES[0];
  const firstStroke = choBase[0] || [[0.15, 0.25], [0.75, 0.65]];
  const dip = ((seedVal % 5) - 2) * 0.04;
  return [[
    ...mapBox([firstStroke], 0.05, 0.18, 0.52, 0.56)[0],
    [0.68, 0.62 + dip],
    [0.92, 0.48 - dip]
  ]];
}

export function selectKoreanSignatureStyle(seed = 0, forcedStyleIndex = null) {
  const idx = (forcedStyleIndex !== null && forcedStyleIndex !== undefined && forcedStyleIndex !== 'auto')
    ? (Math.abs(Number(forcedStyleIndex)) % KOREAN_SIGNATURE_STYLES.length)
    : (Math.abs(Number(seed) || 0) % KOREAN_SIGNATURE_STYLES.length);
  return KOREAN_SIGNATURE_STYLES[idx];
}

/**
 * 주어진 성명과 시드, 캔버스 크기에 맞춰 보간된 전자서명 폴리라인 획(denseStrokes) 배열을 생성
 * - 정자체(A, F): 자모 전 획 또렷하게 분리
 * - 흘려쓰기(B, D): 행서풍 글자 내·글자 간 자연스러운 연필/붓펜 이음획
 * - 결재 싸인체(C, H): 성씨(첫 글자) 대폭 확대 + 뒷글자 속필 압축 + 루프/밑줄 피니시
 * - 단순 약식체(E, G): 바쁜 중장년 관리소장 특유의 성씨 위주 표기 + 뒷부분 단순 물결/단선 생략
 */
export function buildKoreanSignatureStrokes({
  targetName = '김철수',
  seed = 1000,
  styleCfg = KOREAN_SIGNATURE_STYLES[0],
  canvasWidth = 558,
  canvasHeight = 158
} = {}) {
  const cw = Number(canvasWidth) || 558;
  const ch = Number(canvasHeight) || 158;
  const mode = styleCfg.mode || 'full_jungja';
  const chars = String(targetName || '김철수').replace(/\s+/g, '').split('');
  const isSimpleSurnameWave = mode === 'surname_wave_simple';
  const isMinimalOneStroke = mode === 'minimal_one_stroke';
  const isExecSign = mode === 'exec_sign_underline' || mode === 'initial_hook_sign';

  const baseCharW = Math.min(88, (cw * 0.62) / Math.max(chars.length, 2)) * (styleCfg.aspectX || 1);
  const baseCharH = Math.min(94, ch * 0.56) * (styleCfg.aspectY || 1);
  const totalW = chars.length * baseCharW * (isSimpleSurnameWave || isMinimalOneStroke ? 0.92 : 1.06);
  const startX = Math.max(22, (cw - totalW) * 0.42 + ((seed % 19) - 9) * 1.8);
  const startY = Math.max(14, (ch - baseCharH) * 0.43 + ((seed % 13) - 6) * 1.3);

  const clampPt = (x, y) => [
    Math.round(Math.max(10, Math.min(cw - 10, x)) * 100) / 100,
    Math.round(Math.max(8, Math.min(ch - 8, y)) * 100) / 100
  ];

  const allStrokes = [];

  if (isSimpleSurnameWave) {
    // [단순 약식체 E] 성(첫 글자)만 큼직하게 흘려 쓰고, 나머지 이름은 단순 물결 파형 1줄로 갈무리
    const firstRaw = decomposeHangulCharStrokes(chars[0] || '김');
    const cW = baseCharW * 1.24;
    const cH = baseCharH * 1.12;
    const firstTransformed = firstRaw.map((st, sIdx) =>
      st.map(([nx, ny], pIdx) => {
        const jp = seed * 0.31 + sIdx * 1.4 + pIdx * 0.8;
        const sx = nx + (ny - 0.5) * styleCfg.slant;
        return clampPt(
          startX + sx * cW + Math.sin(jp) * styleCfg.tremor * 1.8,
          startY + ny * cH + Math.cos(jp * 1.2) * styleCfg.tremor * 1.8
        );
      })
    );
    // 첫 글자 획 일부 병합 후 우측으로 단순 파형 연결
    const mergedFirst = [];
    let cur = [...firstTransformed[0]];
    for (let i = 1; i < firstTransformed.length; i++) {
      if (i % 2 === 1) cur.push(...firstTransformed[i]);
      else {
        mergedFirst.push(cur);
        cur = [...firstTransformed[i]];
      }
    }
    const tailAnchor = cur[cur.length - 1];
    const waveLen = Math.max(75, (chars.length - 1) * baseCharW * 0.72);
    const waveAmp = 9 + (seed % 7);
    cur.push(
      clampPt(tailAnchor[0] + waveLen * 0.22, startY + cH * 0.52 - waveAmp),
      clampPt(tailAnchor[0] + waveLen * 0.45, startY + cH * 0.66 + waveAmp * 0.6),
      clampPt(tailAnchor[0] + waveLen * 0.68, startY + cH * 0.48 - waveAmp * 0.5),
      clampPt(tailAnchor[0] + waveLen * 1.02, startY + cH * 0.56 - 4)
    );
    mergedFirst.push(cur);
    allStrokes.push(...mergedFirst);
  } else if (isMinimalOneStroke) {
    // [초간단 일필 약식체 G] 첫 글자 초성·중성에서 펜을 거의 떼지 않고 뒷글자 약식 파형으로 일필 연결
    const singleLine = [];
    chars.forEach((c, cIdx) => {
      const subStrokes = cIdx === 0
        ? decomposeHangulCharStrokes(c).slice(0, 3)
        : buildAbbreviatedTrailingStrokes(c, seed + cIdx * 7);
      const scaleMult = cIdx === 0 ? 1.20 : Math.max(0.58, 0.80 - cIdx * 0.12);
      const cW = baseCharW * scaleMult;
      const cH = baseCharH * scaleMult;
      const ox = startX + cIdx * (baseCharW * 0.78);
      const oy = startY + (cIdx === 0 ? 0 : baseCharH * 0.16) + cIdx * (baseCharW * styleCfg.baseSlope);
      subStrokes.forEach((st, sIdx) => {
        st.forEach(([nx, ny], pIdx) => {
          const jp = seed * 0.43 + cIdx * 1.9 + sIdx * 1.1 + pIdx * 0.7;
          const sx = nx + (ny - 0.5) * styleCfg.slant;
          singleLine.push(clampPt(
            ox + sx * cW + Math.sin(jp) * styleCfg.tremor * 1.6,
            oy + ny * cH + Math.cos(jp) * styleCfg.tremor * 1.6
          ));
        });
      });
    });
    if (singleLine.length >= 2) {
      const endPt = singleLine[singleLine.length - 1];
      singleLine.push(
        clampPt(endPt[0] + 34, endPt[1] - 5),
        clampPt(endPt[0] + 68, endPt[1] - 8)
      );
      allStrokes.push(singleLine);
    }
  } else {
    // [정자체(A, F) / 흘려쓰기(B, D) / 결재 싸인체(C, H)]
    chars.forEach((c, cIdx) => {
      const rawStrokes = (isExecSign && cIdx >= 1)
        ? buildAbbreviatedTrailingStrokes(c, seed + cIdx * 11)
        : decomposeHangulCharStrokes(c);
      const scaleMult = isExecSign
        ? (cIdx === 0 ? 1.32 : Math.max(0.66, 0.88 - cIdx * 0.10))
        : (1.0 - cIdx * 0.03);
      const charW = baseCharW * scaleMult;
      const charH = baseCharH * scaleMult;
      const spacingFactor = isExecSign ? 0.84 : (styleCfg.cursive > 0.55 ? 0.94 : 1.12);
      const ox = startX + cIdx * (baseCharW * spacingFactor);
      const oy = startY + (isExecSign && cIdx >= 1 ? baseCharH * 0.12 : 0) + cIdx * (baseCharW * styleCfg.baseSlope);

      const transformed = rawStrokes.map((st, sIdx) =>
        st.map(([nx, ny], pIdx) => {
          const jitterPhase = seed * 0.37 + cIdx * 2.1 + sIdx * 1.3 + pIdx * 0.9;
          const jx = Math.sin(jitterPhase) * styleCfg.tremor * 2.0;
          const jy = Math.cos(jitterPhase * 1.3) * styleCfg.tremor * 2.0;
          const sx = nx + (ny - 0.5) * styleCfg.slant;
          return clampPt(ox + sx * charW + jx, oy + ny * charH + jy);
        })
      );

      if (styleCfg.cursive >= 0.5 && transformed.length > 1) {
        const merged = [];
        let cur = [...transformed[0]];
        for (let i = 1; i < transformed.length; i++) {
          if ((i + cIdx) % 2 === 1 || styleCfg.cursive >= 0.78) {
            const lastPt = cur[cur.length - 1];
            const nextPt = transformed[i][0];
            const midPt = clampPt(
              (lastPt[0] + nextPt[0]) * 0.5 + (styleCfg.cursive * 2.5),
              (lastPt[1] + nextPt[1]) * 0.5 - 1.5
            );
            cur.push(midPt, ...transformed[i]);
          } else {
            merged.push(cur);
            cur = [...transformed[i]];
          }
        }
        merged.push(cur);
        // 행서 흘려쓰기(flowing_cursive)는 앞 글자 끝획과 뒷글자 첫획(merged[0])을 자연스럽게 이어줌
        if (mode === 'flowing_cursive' && cIdx > 0 && allStrokes.length > 0 && ((seed + cIdx) % 2 === 0)) {
          allStrokes[allStrokes.length - 1].push(...merged[0]);
          for (let mIdx = 1; mIdx < merged.length; mIdx++) {
            allStrokes.push(merged[mIdx]);
          }
        } else {
          allStrokes.push(...merged);
        }
      } else {
        allStrokes.push(...transformed);
      }
    });
  }

  if (styleCfg.flourish === 1 && allStrokes.length > 0) {
    const lastSt = allStrokes[allStrokes.length - 1];
    const endPt = lastSt[lastSt.length - 1];
    lastSt.push(
      clampPt(endPt[0] + 22, endPt[1] - 5),
      clampPt(endPt[0] + 50, endPt[1] - 9),
      clampPt(endPt[0] + 76, endPt[1] - 6)
    );
  } else if (styleCfg.flourish === 2) {
    allStrokes.push([
      clampPt(startX - 6, startY + baseCharH + 10),
      clampPt(startX + totalW * 0.55, startY + baseCharH + 5),
      clampPt(startX + totalW + 20, startY + baseCharH + 8)
    ]);
  } else if (styleCfg.flourish === 4 && allStrokes.length > 0) {
    // 중년 남성 결재형 싸인 루프 + 시원한 직선 밑줄
    const lastSt = allStrokes[allStrokes.length - 1];
    const endPt = lastSt[lastSt.length - 1];
    lastSt.push(
      clampPt(endPt[0] + 18, endPt[1] + 14),
      clampPt(startX - 10, startY + baseCharH + 14),
      clampPt(startX + totalW * 0.55, startY + baseCharH + 7),
      clampPt(startX + totalW + 36, startY + baseCharH + 3)
    );
  }

  const denseStrokes = [];
  const isCrispJungja = (mode === 'full_jungja' || mode === 'elder_jungja');
  for (const stroke of allStrokes) {
    if (!stroke || stroke.length < 2) continue;
    const dense = [];
    for (let i = 0; i < stroke.length - 1; i++) {
      const [x0, y0] = stroke[i];
      const [x1, y1] = stroke[i + 1];
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(5, Math.ceil(dist / 3.2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const arcAmp = isCrispJungja ? 0.55 : 1.45;
        const arc = Math.sin(t * Math.PI) * arcAmp * ((i % 2 === 0) ? 1 : -1);
        dense.push(clampPt(
          x0 + (x1 - x0) * t + arc * 0.45,
          y0 + (y1 - y0) * t - arc * 0.85
        ));
      }
    }
    if (dense.length >= 2) denseStrokes.push(dense);
  }

  return denseStrokes;
}
