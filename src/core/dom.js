/** Tiny DOM toolkit. All user text goes through textContent or esc(). */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * h('div.card#id', {onclick, style:{}, dataset:{}, attrs}, ...children)
 */
export function h(tag, props, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Parse a trusted SVG/HTML string into a node. */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function prefersReducedMotion() {
  const forced = document.documentElement.dataset.motion;
  if (forced === 'reduced') return true;
  if (forced === 'full') return false;
  return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function download(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Animate a number inside an element (odometer feel). */
export function tweenNumber(el, to, { duration = 900, format = (v) => Math.round(v) } = {}) {
  const from = parseFloat(el.dataset.v || '0') || 0;
  el.dataset.v = String(to);
  if (prefersReducedMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = format(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** FLIP: capture rects keyed by data-key, then animate from them after DOM changes. */
export function flipCapture(container) {
  const map = new Map();
  for (const el of container.querySelectorAll('[data-key]')) map.set(el.dataset.key, el.getBoundingClientRect());
  return map;
}

export function flipPlay(container, before, { duration = 520 } = {}) {
  if (prefersReducedMotion()) return;
  for (const el of container.querySelectorAll('[data-key]')) {
    const r0 = before.get(el.dataset.key);
    const r1 = el.getBoundingClientRect();
    if (!r0) {
      el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
      continue;
    }
    const dx = r0.left - r1.left;
    const dy = r0.top - r1.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
}
