/**
 * 한글 성명 초성·중성·종성 벡터 획(Stroke) 분해 및 8종 필체(기울기·자간·비율·흘림·필압·밑줄) 전자서명 공통 유틸리티
 * - 한국갤럽 귀농귀촌 실태조사 (SignaturePad)
 * - 한국리서치 에너지총조사 답례품 수령증 (jQuery UI Signature / Canvas)
 * - 기타 캔버스 기반 전자서명 설문 공통 활용
 */

export const KOREAN_SIGNATURE_STYLES = [
  { index: 0, label: '스타일 A · 정자 손글씨체 (단정한 필압)', slant: -0.04, baseSlope: -0.02, aspectX: 0.96, aspectY: 1.02, cursive: 0.15, flourish: 1, minW: 1.3, maxW: 2.8, tremor: 0.42 },
  { index: 1, label: '스타일 B · 우상향 흘림체 (연속 필기)', slant: -0.22, baseSlope: -0.07, aspectX: 1.06, aspectY: 0.95, cursive: 0.65, flourish: 1, minW: 1.1, maxW: 2.6, tremor: 0.52 },
  { index: 2, label: '스타일 C · 속필 사인체 (빠른 흘림+밑줄)', slant: -0.30, baseSlope: -0.05, aspectX: 1.15, aspectY: 0.88, cursive: 0.85, flourish: 2, minW: 1.0, maxW: 2.3, tremor: 0.60 },
  { index: 3, label: '스타일 D · 굵은 붓펜체 (강한 필압)', slant: 0.04, baseSlope: 0.02, aspectX: 1.08, aspectY: 1.05, cursive: 0.25, flourish: 0, minW: 1.8, maxW: 3.6, tremor: 0.38 },
  { index: 4, label: '스타일 E · 가늘고 둥근 손글씨체', slant: -0.10, baseSlope: -0.03, aspectX: 0.92, aspectY: 0.94, cursive: 0.40, flourish: 3, minW: 0.9, maxW: 2.1, tremor: 0.48 },
  { index: 5, label: '스타일 F · 세로 장체 (어르신 정자풍)', slant: 0.06, baseSlope: 0.03, aspectX: 0.82, aspectY: 1.18, cursive: 0.10, flourish: 0, minW: 1.4, maxW: 3.0, tremor: 0.78 },
  { index: 6, label: '스타일 G · 가로 넓은 안정 사인체', slant: -0.16, baseSlope: -0.01, aspectX: 1.22, aspectY: 0.86, cursive: 0.55, flourish: 2, minW: 1.3, maxW: 2.9, tremor: 0.48 },
  { index: 7, label: '스타일 H · 초성 강조 흘림 사인체', slant: -0.25, baseSlope: -0.06, aspectX: 1.10, aspectY: 1.04, cursive: 0.75, flourish: 1, minW: 1.2, maxW: 3.2, tremor: 0.56 }
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

export function selectKoreanSignatureStyle(seed = 0, forcedStyleIndex = null) {
  const idx = (forcedStyleIndex !== null && forcedStyleIndex !== undefined && forcedStyleIndex !== 'auto')
    ? (Math.abs(Number(forcedStyleIndex)) % KOREAN_SIGNATURE_STYLES.length)
    : (Math.abs(Number(seed) || 0) % KOREAN_SIGNATURE_STYLES.length);
  return KOREAN_SIGNATURE_STYLES[idx];
}

/**
 * 주어진 성명과 시드, 캔버스 크기에 맞춰 보간된 전자서명 폴리라인 획(denseStrokes) 배열을 생성
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
  const chars = String(targetName || '김철수').replace(/\s+/g, '').split('');
  const baseCharW = Math.min(86, (cw * 0.62) / Math.max(chars.length, 2)) * styleCfg.aspectX;
  const baseCharH = Math.min(92, ch * 0.56) * styleCfg.aspectY;
  const totalW = chars.length * baseCharW * 1.06;
  const startX = Math.max(20, (cw - totalW) * 0.44 + ((seed % 17) - 8) * 1.6);
  const startY = Math.max(14, (ch - baseCharH) * 0.44 + ((seed % 11) - 5) * 1.2);

  const clampPt = (x, y) => [
    Math.round(Math.max(10, Math.min(cw - 10, x)) * 100) / 100,
    Math.round(Math.max(8, Math.min(ch - 8, y)) * 100) / 100
  ];

  const allStrokes = [];
  chars.forEach((c, cIdx) => {
    const rawStrokes = decomposeHangulCharStrokes(c);
    const scaleMult = (styleCfg.index === 7 && cIdx === 0) ? 1.22 : (1.0 - cIdx * 0.03);
    const charW = baseCharW * scaleMult;
    const charH = baseCharH * scaleMult;
    const ox = startX + cIdx * (baseCharW * (styleCfg.cursive > 0.6 ? 0.94 : 1.12));
    const oy = startY + cIdx * (baseCharW * styleCfg.baseSlope);

    const transformed = rawStrokes.map((st, sIdx) => {
      return st.map(([nx, ny], pIdx) => {
        const jitterPhase = seed * 0.37 + cIdx * 2.1 + sIdx * 1.3 + pIdx * 0.9;
        const jx = Math.sin(jitterPhase) * styleCfg.tremor * 2.0;
        const jy = Math.cos(jitterPhase * 1.3) * styleCfg.tremor * 2.0;
        const sx = nx + (ny - 0.5) * styleCfg.slant;
        return clampPt(ox + sx * charW + jx, oy + ny * charH + jy);
      });
    });

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
      allStrokes.push(...merged);
    } else {
      allStrokes.push(...transformed);
    }
  });

  if (styleCfg.flourish === 1 && allStrokes.length > 0) {
    const lastSt = allStrokes[allStrokes.length - 1];
    const endPt = lastSt[lastSt.length - 1];
    lastSt.push(
      clampPt(endPt[0] + 20, endPt[1] - 5),
      clampPt(endPt[0] + 48, endPt[1] - 9),
      clampPt(endPt[0] + 74, endPt[1] - 6)
    );
  } else if (styleCfg.flourish === 2) {
    allStrokes.push([
      clampPt(startX - 8, startY + baseCharH + 11),
      clampPt(startX + totalW * 0.55, startY + baseCharH + 6),
      clampPt(startX + totalW + 18, startY + baseCharH + 10)
    ]);
  } else if (styleCfg.flourish === 3 && allStrokes.length > 0) {
    const lastSt = allStrokes[allStrokes.length - 1];
    const endPt = lastSt[lastSt.length - 1];
    lastSt.push(
      clampPt(endPt[0] + 16, endPt[1] + 9),
      clampPt(endPt[0] - 8, endPt[1] + 17),
      clampPt(endPt[0] + 34, endPt[1] + 12)
    );
  }

  const denseStrokes = [];
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
        const arc = Math.sin(t * Math.PI) * 1.4 * ((i % 2 === 0) ? 1 : -1);
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
