import { h, frag } from '../core/dom.js';
import { icon } from './icons.js';

/** toast('Saved', {kind:'ok', action:{label, run}}) */
export function toast(msg, { kind = '', icon: ic = kind === 'err' ? 'clash' : kind === 'ok' ? 'check' : 'bolt', action = null, duration = 3200 } = {}) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, frag(icon(ic)), h('span', { text: msg }));
  if (action) {
    el.appendChild(h('button', { text: action.label, onclick: () => { action.run(); close(); } }));
  }
  root.appendChild(el);
  while (root.children.length > 3) root.firstChild.remove();
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }
  setTimeout(close, duration);
  return close;
}
