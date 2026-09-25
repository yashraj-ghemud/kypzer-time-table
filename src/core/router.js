/**
 * Hash router: #/ (landing) · #/app · #/focus · #/s/<payload> (shared plan).
 * Route changes play the clock-wipe: a conic sweep like a clock hand covers the page, the view swaps,
 * and the sweep continues to uncover the new page.
 */
import { prefersReducedMotion } from './dom.js';

const handlers = new Set();
let current = null;

export function parseHash(hash = location.hash) {
  const path = hash.replace(/^#/, '') || '/';
  if (path.startsWith('/s/')) return { name: 'share', payload: path.slice(3) };
  if (path.startsWith('/app')) return { name: 'app', sub: path.slice(5) || '' };
  if (path.startsWith('/focus')) return { name: 'focus' };
  return { name: 'landing' };
}

export function onRoute(fn) {
  handlers.add(fn);
}

export function currentRoute() {
  return current;
}

export function go(path) {
  const target = '#' + path;
  if (location.hash === target) return;
  location.hash = path;
}

let wiping = false;
async function dispatch() {
  const next = parseHash();
  const prev = current;
  current = next;
  const animate = prev && prev.name !== next.name;
  if (animate && !wiping) {
    wiping = true;
    await wipe(() => handlers.forEach((fn) => fn(next, prev)));
    wiping = false;
  } else handlers.forEach((fn) => fn(next, prev));
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

/** Clock-wipe transition. `swap` runs while the screen is covered. */
export function wipe(swap) {
  const el = document.getElementById('wipe');
  if (!el || prefersReducedMotion() || !el.animate) {
    swap();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    el.classList.add('on');
    const cover = el.animate([{ '--a': '0deg' }, { '--a': '360deg' }], { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
    cover.onfinish = () => {
      swap();
      window.scrollTo(0, 0);
      el.classList.add('out');
      const reveal = el.animate([{ '--a': '0deg' }, { '--a': '360deg' }], { duration: 560, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      reveal.onfinish = () => {
        el.classList.remove('on', 'out');
        cover.cancel();
        reveal.cancel();
        resolve();
      };
    };
  });
}
