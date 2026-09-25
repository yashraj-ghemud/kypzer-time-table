import { h, frag } from '../core/dom.js';
import { icon } from './icons.js';

let open = null;

/** openModal({title, body: Node, foot?: Node, size?: 'sm', onClose}) → close() */
export function openModal({ title, body, foot = null, size = '', onClose = null }) {
  closeModal(true);
  const prevFocus = document.activeElement;
  const closeBtn = h('button.icon-btn', { 'aria-label': 'Close', onclick: () => closeModal() }, frag(icon('x')));
  const dlg = h('div.modal' + (size ? '.' + size : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.modal-head', h('h2', { text: title }), closeBtn),
    h('div.modal-body', body),
    foot ? h('div.modal-foot', foot) : null,
  );
  const back = h('div.modal-backdrop', { onmousedown: (e) => { if (e.target === back) closeModal(); } }, dlg);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal();
    } else if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.getElementById('modal-root').appendChild(back);
  open = { back, onKey, onClose, prevFocus };
  setTimeout(() => (dlg.querySelector('[autofocus]') || closeBtn).focus(), 30);
  return () => closeModal();
}

export function closeModal(instant = false) {
  if (!open) return;
  const { back, onKey, onClose, prevFocus } = open;
  open = null;
  document.removeEventListener('keydown', onKey, true);
  if (onClose) onClose();
  if (instant) back.remove();
  else {
    back.classList.add('closing');
    setTimeout(() => back.remove(), 240);
  }
  if (prevFocus && prevFocus.focus) prevFocus.focus();
}

export function isModalOpen() {
  return !!open;
}
