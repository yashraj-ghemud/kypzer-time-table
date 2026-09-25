/** Small celebratory effects. Pure DOM + Web Animations; skipped under reduced motion. */
import { prefersReducedMotion } from '../core/dom.js';

/** A ring of little "minute ticks" radiating from a point. */
export function tickBurst(x, y, color = '#3ecf8e', count = 16) {
  if (prefersReducedMotion() || !document.body.animate) return;
  const layer = document.createElement('div');
  layer.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:450`;
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const dist = 26 + Math.random() * 30;
    const el = document.createElement('i');
    const long = i % 4 === 0;
    el.style.cssText = `position:absolute;left:-1px;top:-${long ? 6 : 4}px;width:2px;height:${long ? 12 : 8}px;border-radius:2px;background:${color};box-shadow:0 0 8px ${color}`;
    const rot = (a * 180) / Math.PI + 90;
    el.animate(
      [
        { transform: `rotate(${rot}deg) translateY(0) scaleY(.4)`, opacity: 1 },
        { transform: `rotate(${rot}deg) translateY(${-dist}px) scaleY(1)`, opacity: 1, offset: 0.55 },
        { transform: `rotate(${rot}deg) translateY(${-dist - 12}px) scaleY(.2)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 250, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
    );
    layer.appendChild(el);
  }
  const ring = document.createElement('i');
  ring.style.cssText = `position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:1.5px solid ${color}`;
  ring.animate([{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
  layer.appendChild(ring);
  setTimeout(() => layer.remove(), 1100);
}

export function burstFrom(el, color) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  tickBurst(r.left + r.width / 2, r.top + r.height / 2, color);
}
