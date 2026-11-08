// 공통 블루프린트 유틸리티 모듈

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getBadgeClass(badge) {
  switch (badge) {
    case 'QUOTA_BINDING': return 'badge-tag-bind';
    case 'RULE_FIXED': return 'badge-tag-fixed';
    case 'TUNABLE_JITTER': return 'badge-tag-tunable';
    default: return 'badge-tag-jitter';
  }
}

export function getBadgeLabel(badge) {
  switch (badge) {
    case 'QUOTA_BINDING': return '쿼터 1:1 바인딩';
    case 'RULE_FIXED': return '규칙 필수 고정';
    case 'TUNABLE_JITTER': return '기준점 조절';
    default: return '가변 분산';
  }
}
