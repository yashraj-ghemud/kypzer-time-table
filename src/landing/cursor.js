/** Custom cursor with lag + magnetic buttons. Fine pointers only; off under reduced motion. */
import { prefersReducedMotion } from '../core/dom.js';

let started = false;

export function initCursor() {
  if (started) return;
  started = true;
  const fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  if (!fine || prefersReducedMotion()) return;
  const root = document.getElementById('cursor');
  const dot = root.querySelector('.cursor-dot');
  const ring = root.querySelector('.cursor-ring');
  document.documentElement.classList.add('has-cursor');
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;
  let visible = false;
  root.style.opacity = '0';
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    if (!visible) {
      visible = true;
      root.style.opacity = '1';
      rx = x;
      ry = y;
    }
    const t = e.target;
    const interactive = t.closest && t.closest('a, button, [role="button"], [role="tab"], .tilt, label, select, .dg-block');
    root.classList.toggle('hover', !!interactive);
    root.classList.toggle('text', !!(t.closest && t.closest('input, textarea')));
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    visible = false;
    root.style.opacity = '0';
  });
  window.addEventListener('pointerdown', () => root.classList.add('down'));
  window.addEventListener('pointerup', () => root.classList.remove('down'));
  const loop = () => {
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  };
  loop();

  // magnetic buttons
  document.addEventListener('pointermove', (e) => {
    const m = e.target.closest && e.target.closest('.magnetic');
    for (const el of document.querySelectorAll('.magnetic.pulled')) {
      if (el !== m) {
        el.classList.remove('pulled');
        el.style.transform = '';
      }
    }
    if (!m) return;
    const r = m.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    m.classList.add('pulled');
    m.style.transform = `translate(${dx * 8}px, ${dy * 6}px)`;
  }, { passive: true });
}
