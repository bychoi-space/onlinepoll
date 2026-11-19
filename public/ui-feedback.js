// public/ui-feedback.js - Shared Light SaaS Toast, Custom Dialog Modals & Accessible Modal Guard

function isRealBrowserDom() {
  return Boolean(
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    !globalThis.__IS_MOCK_DOM &&
    typeof window.HTMLElement !== 'undefined' &&
    document.body &&
    typeof document.body.appendChild === 'function'
  );
}

function escapeDialogHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info', durationMs = 3800) {
  if (!isRealBrowserDom()) {
    return null;
  }

  const validType = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';
  const iconMap = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    error: 'fa-circle-xmark'
  };

  let container = document.getElementById('ui-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ui-toast-container';
    container.className = 'ui-toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast-${validType}`;
  toast.innerHTML = `
    <i class="fa-solid ${iconMap[validType]} ui-toast-icon" aria-hidden="true"></i>
    <div class="ui-toast-msg">${escapeDialogHtml(message)}</div>
    <button type="button" class="ui-toast-close" aria-label="알림 닫기">&times;</button>
  `;

  const dismiss = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  const closeBtn = toast.querySelector('.ui-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  if (durationMs > 0) {
    setTimeout(dismiss, durationMs);
  }
  return toast;
}

export function showConfirmModal({
  title = '확인',
  message = '',
  confirmText = '확인',
  cancelText = '취소',
  danger = false
} = {}) {
  if (!isRealBrowserDom()) {
    return Promise.resolve(typeof globalThis.confirm === 'function' ? Boolean(globalThis.confirm(message)) : true);
  }

  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-card" role="dialog" aria-modal="true" aria-label="${escapeDialogHtml(title)}">
        <div class="ui-dialog-header">
          <h3 class="ui-dialog-title">
            <i class="fa-solid ${danger ? 'fa-triangle-exclamation text-error' : 'fa-circle-question text-primary-color'}"></i>
            ${escapeDialogHtml(title)}
          </h3>
          <button type="button" class="btn-close ui-dialog-close" aria-label="닫기">&times;</button>
        </div>
        <div class="ui-dialog-message">${escapeDialogHtml(message)}</div>
        <div class="ui-dialog-actions">
          <button type="button" class="btn-pill btn-pill-secondary ui-dialog-cancel">${escapeDialogHtml(cancelText)}</button>
          <button type="button" class="btn-pill ${danger ? 'ui-btn-danger' : 'btn-pill-primary'} ui-dialog-confirm">${escapeDialogHtml(confirmText)}</button>
        </div>
      </div>
    `;

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (_) { /* ignore */ }
      }
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('.ui-dialog-close')?.addEventListener('click', () => close(false));
    overlay.querySelector('.ui-dialog-cancel')?.addEventListener('click', () => close(false));
    overlay.querySelector('.ui-dialog-confirm')?.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    overlay.querySelector('.ui-dialog-confirm')?.focus();
  });
}

export function showPromptModal({
  title = '입력',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = '확인',
  cancelText = '취소'
} = {}) {
  if (!isRealBrowserDom()) {
    if (typeof globalThis.prompt === 'function') {
      return Promise.resolve(globalThis.prompt(message, defaultValue));
    }
    return Promise.resolve(defaultValue || null);
  }

  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-card" role="dialog" aria-modal="true" aria-label="${escapeDialogHtml(title)}">
        <div class="ui-dialog-header">
          <h3 class="ui-dialog-title">
            <i class="fa-solid fa-pen-to-square text-primary-color"></i>
            ${escapeDialogHtml(title)}
          </h3>
          <button type="button" class="btn-close ui-dialog-close" aria-label="닫기">&times;</button>
        </div>
        ${message ? `<div class="ui-dialog-message">${escapeDialogHtml(message)}</div>` : ''}
        <input
          type="text"
          class="ui-dialog-input"
          placeholder="${escapeDialogHtml(placeholder)}"
          value="${escapeDialogHtml(defaultValue)}"
        />
        <div class="ui-dialog-actions">
          <button type="button" class="btn-pill btn-pill-secondary ui-dialog-cancel">${escapeDialogHtml(cancelText)}</button>
          <button type="button" class="btn-pill btn-pill-primary ui-dialog-confirm">${escapeDialogHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const inputEl = overlay.querySelector('.ui-dialog-input');
    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (_) { /* ignore */ }
      }
      resolve(result);
    };

    const submit = () => {
      const val = inputEl ? inputEl.value : '';
      close(val);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Enter' && document.activeElement === inputEl) {
        e.preventDefault();
        submit();
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.querySelector('.ui-dialog-close')?.addEventListener('click', () => close(null));
    overlay.querySelector('.ui-dialog-cancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('.ui-dialog-confirm')?.addEventListener('click', submit);
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });
}

export function showSelectModal({
  title = '항목 선택',
  message = '',
  options = [],
  confirmText = '불러오기',
  cancelText = '취소'
} = {}) {
  if (!isRealBrowserDom()) {
    return Promise.resolve(options[0]?.value ?? null);
  }

  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    let selectedValue = options[0]?.value ?? null;

    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-card" role="dialog" aria-modal="true" aria-label="${escapeDialogHtml(title)}">
        <div class="ui-dialog-header">
          <h3 class="ui-dialog-title">
            <i class="fa-solid fa-list-check text-primary-color"></i>
            ${escapeDialogHtml(title)}
          </h3>
          <button type="button" class="btn-close ui-dialog-close" aria-label="닫기">&times;</button>
        </div>
        ${message ? `<div class="ui-dialog-message">${escapeDialogHtml(message)}</div>` : ''}
        <div class="ui-select-list" role="radiogroup" aria-label="${escapeDialogHtml(title)}">
          ${options.map((opt, idx) => {
            const val = String(opt.value ?? idx);
            const isChecked = idx === 0;
            return `
              <label class="ui-select-option ${isChecked ? 'is-selected' : ''}" data-val="${escapeDialogHtml(val)}">
                <input type="radio" name="ui-select-modal-radio" value="${escapeDialogHtml(val)}" ${isChecked ? 'checked' : ''} />
                <span class="ui-select-option-label">
                  ${escapeDialogHtml(opt.label || val)}
                  ${opt.sublabel ? `<span class="ui-select-option-sub">${escapeDialogHtml(opt.sublabel)}</span>` : ''}
                </span>
              </label>
            `;
          }).join('')}
        </div>
        <div class="ui-dialog-actions">
          <button type="button" class="btn-pill btn-pill-secondary ui-dialog-cancel">${escapeDialogHtml(cancelText)}</button>
          <button type="button" class="btn-pill btn-pill-primary ui-dialog-confirm" ${options.length === 0 ? 'disabled' : ''}>${escapeDialogHtml(confirmText)}</button>
        </div>
      </div>
    `;

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (_) { /* ignore */ }
      }
      resolve(result);
    };

    overlay.querySelectorAll('.ui-select-option').forEach((labelEl) => {
      labelEl.addEventListener('click', () => {
        selectedValue = labelEl.getAttribute('data-val');
        overlay.querySelectorAll('.ui-select-option').forEach(el => el.classList.remove('is-selected'));
        labelEl.classList.add('is-selected');
        const radio = labelEl.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
      labelEl.addEventListener('dblclick', () => {
        selectedValue = labelEl.getAttribute('data-val');
        close(selectedValue);
      });
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Enter' && options.length > 0) {
        e.preventDefault();
        close(selectedValue);
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.querySelector('.ui-dialog-close')?.addEventListener('click', () => close(null));
    overlay.querySelector('.ui-dialog-cancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('.ui-dialog-confirm')?.addEventListener('click', () => close(selectedValue));
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    overlay.querySelector('.ui-dialog-confirm')?.focus();
  });
}

export function bindAccessibleModals() {
  if (!isRealBrowserDom()) return;

  const dialogSelector = '.modal-card, .slot-mapping-modal-dialog, .bind-slots-modal-card';
  document.querySelectorAll(dialogSelector).forEach((card) => {
    if (!card.getAttribute('role')) card.setAttribute('role', 'dialog');
    if (!card.getAttribute('aria-modal')) card.setAttribute('aria-modal', 'true');
  });

  if (window.__autoSurveyModalsBound) return;
  window.__autoSurveyModalsBound = true;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // 1. Custom UI dialog overlays handle Escape via their own listener first
    if (document.querySelector('.ui-dialog-overlay')) return;

    // 2. Bind-slots modal (.bind-slots-modal-overlay:not(.hidden))
    const openBindModal = document.querySelector('.bind-slots-modal-overlay:not(.hidden)');
    if (openBindModal) {
      openBindModal.classList.add('hidden');
      return;
    }

    // 3. Standard .modal-overlay.is-open or dynamically shown modal overlays
    const openModals = Array.from(document.querySelectorAll('.modal-overlay.is-open'));
    if (openModals.length > 0) {
      openModals[openModals.length - 1].classList.remove('is-open');
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.classList) return;

    if (target.classList.contains('modal-overlay') && target.classList.contains('is-open')) {
      target.classList.remove('is-open');
    } else if (target.classList.contains('bind-slots-modal-overlay') && !target.classList.contains('hidden')) {
      target.classList.add('hidden');
    }
  });
}

if (typeof window !== 'undefined') {
  window.AutoSurveyUI = {
    showToast,
    showConfirmModal,
    showPromptModal,
    showSelectModal,
    bindAccessibleModals
  };
}
