// 블루프린트/쿼터 공통 유틸리티 모듈

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getBadgeClass(type) {
  switch (type) {
    case 'bind': return 'badge-tag-bind';
    case 'tunable': return 'badge-tag-tunable';
    case 'fixed': return 'badge-tag-fixed';
    case 'jitter': return 'badge-tag-jitter';
    default: return 'badge-tag-tunable';
  }
}

export function getBadgeLabel(type) {
  switch (type) {
    case 'bind': return '<i class="fa-solid fa-link"></i> 쿼터 자동바인딩';
    case 'tunable': return '<i class="fa-solid fa-sliders"></i> 설정 변경가능';
    case 'fixed': return '<i class="fa-solid fa-lock"></i> 필수 고정값';
    case 'jitter': return '<i class="fa-solid fa-shuffle"></i> 점포별 자동분산';
    default: return '설정 가능';
  }
}
