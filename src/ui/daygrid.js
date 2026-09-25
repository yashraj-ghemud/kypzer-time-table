/**
 * Calendar-style day grid. Drag to move, drag the bottom edge to resize (5-min snap),
 * double-click empty space to create. Every gesture becomes a text edit via onChange.
 */
import { h } from '../core/dom.js';
import { fmtTime, fmtDuration, minutesOfDay } from '../engine/time.js';

const SNAP = 5;
const snap = (v) => Math.round(v / SNAP) * SNAP;

function lanes(blocks) {
  // greedy lane assignment within overlap clusters
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map();
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const laneEnds = [];
    for (const b of cluster) {
      let li = laneEnds.findIndex((e) => e <= b.start);
      if (li === -1) {
        li = laneEnds.length;
        laneEnds.push(b.end);
      } else laneEnds[li] = b.end;
      out.set(b.id, { lane: li });
    }
    for (const b of cluster) out.get(b.id).count = laneEnds.length;
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    clusterEnd = cluster.length ? Math.max(clusterEnd, b.end) : b.end;
    cluster.push(b);
  }
  if (cluster.length) flush();
  return out;
}

export function renderDayGrid(root, plan, { clock, onChange, onCreate, onSelect, selected }) {
  const blocks = plan.blocks;
  const first = blocks.length ? Math.min(...blocks.map((b) => b.start)) : plan.window.start;
  const last = blocks.length ? Math.max(...blocks.map((b) => b.end)) : plan.window.end;
  const from = Math.floor((Math.min(first, blocks.length ? first : 420) - 30) / 60) * 60;
  const to = Math.ceil((Math.max(last, from + 360) + 30) / 60) * 60;
  const ppm = Math.max(0.9, Math.min(1.6, 900 / (to - from)));
  const height = (to - from) * ppm;
  const y = (t) => (t - from) * ppm;

  const hours = h('div.dg-hours', { style: { height: height + 'px' } });
  const lane = h('div.dg-lane', { style: { height: height + 'px' } });
  for (let t = from; t <= to; t += 30) {
    lane.appendChild(h('div.dg-line' + (t % 60 ? '.half' : ''), { style: { top: y(t) + 'px' } }));
    if (t % 60 === 0) hours.appendChild(h('div.dg-hour', { style: { top: y(t) + 'px' }, text: fmtTime(t, clock).replace(':00', '').replace(/ \+\d+d/, '') }));
  }
  const clash = new Set(plan.analysis.insights.filter((i) => i.level === 'critical').flatMap((i) => i.blockIds));
  const lay = lanes(blocks);
  for (const b of blocks) {
    const { lane: li, count } = lay.get(b.id) || { lane: 0, count: 1 };
    const w = 100 / count;
    const el = h('div.dg-block' + (b.readOnly ? '.ro' : '') + (clash.has(b.id) ? '.clash' : ''), {
      'data-id': b.id,
      '--c': b.color,
      tabindex: '0',
      role: 'button',
      'aria-label': b.title + ', ' + fmtTime(b.start, clock) + ' to ' + fmtTime(b.end, clock) + (b.readOnly ? ' (routine, read-only)' : '. Use arrow keys to move, shift+arrow to resize'),
      style: {
        top: y(b.start) + 1 + 'px',
        height: Math.max(18, (b.end - b.start) * ppm - 2) + 'px',
        left: `calc(${li * w}% + 4px)`,
        width: `calc(${w}% - 8px)`,
        outline: selected === b.id ? '2px solid var(--c)' : '',
      },
    },
    h('div.t', { text: b.title || 'Untitled' }),
    (b.end - b.start) * ppm > 34 ? h('div.s', { text: fmtTime(b.start, clock) + ' · ' + fmtDuration(b.end - b.start) }) : null,
    b.readOnly ? null : h('div.rs', { 'data-resize': '1' }),
    );
    lane.appendChild(el);
  }
  if (plan.isToday) {
    const now = minutesOfDay();
    if (now >= from && now <= to) lane.appendChild(h('div.dg-now', { style: { top: y(now) + 'px' } }));
  }
  const grid = h('div.dg', hours, lane);
  root.replaceChildren(h('p.dg-help', { text: 'Drag blocks to move · drag the bottom edge to resize · double-click empty space to add. Your text updates live.' }), grid);

  /* ---------- interactions ---------- */
  let drag = null;
  const tip = h('div.dg-tip');

  lane.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.dg-block');
    if (!el || e.button !== 0) return;
    const b = blocks.find((x) => x.id === el.dataset.id);
    if (!b) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* fall back to lane-level move events */
    }
    drag = { b, el, mode: e.target.dataset.resize ? 'resize' : 'move', y0: e.clientY, start: b.start, end: b.end, moved: false, ro: !!b.readOnly };
    if (!b.readOnly) {
      el.classList.add('dragging');
      lane.appendChild(tip);
    }
  });
  lane.addEventListener('pointermove', (e) => {
    if (!drag || drag.ro) return;
    const dm = (e.clientY - drag.y0) / ppm;
    if (Math.abs(e.clientY - drag.y0) > 3) drag.moved = true;
    if (!drag.moved) return;
    const len = drag.b.end - drag.b.start;
    if (drag.mode === 'move') {
      drag.start = snap(drag.b.start + dm);
      drag.end = drag.start + len;
    } else {
      drag.end = Math.max(drag.b.start + SNAP, snap(drag.b.end + dm));
    }
    drag.el.style.top = y(drag.start) + 1 + 'px';
    drag.el.style.height = Math.max(18, (drag.end - drag.start) * ppm - 2) + 'px';
    tip.textContent = fmtTime(drag.start, clock) + ' – ' + fmtTime(drag.end, clock) + ' · ' + fmtDuration(drag.end - drag.start);
    tip.style.top = y(drag.mode === 'move' ? drag.start : drag.end) - 26 + 'px';
    tip.style.left = drag.el.offsetLeft + 'px';
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    tip.remove();
    if (!d.moved) onSelect && onSelect(d.b, { scroll: false });
    else if (d.start !== d.b.start || d.end !== d.b.end) onChange({ type: 'move', id: d.b.id, start: d.start, end: d.end });
  };
  lane.addEventListener('pointerup', end);
  lane.addEventListener('pointercancel', end);

  lane.addEventListener('keydown', (e) => {
    const el = e.target.closest('.dg-block');
    if (!el || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const b = blocks.find((x) => x.id === el.dataset.id);
    if (!b || b.readOnly) return;
    e.preventDefault();
    const d = e.key === 'ArrowUp' ? -15 : 15;
    if (e.shiftKey) onChange({ type: 'move', id: b.id, start: b.start, end: Math.max(b.start + 5, b.end + d) });
    else onChange({ type: 'move', id: b.id, start: b.start + d, end: b.end + d });
  });

  lane.addEventListener('dblclick', (e) => {
    if (e.target.closest('.dg-block')) return;
    const rect = lane.getBoundingClientRect();
    const t = snap(from + (e.clientY - rect.top) / ppm);
    const start = Math.floor(t / 15) * 15;
    const box = h('form.dg-new', { style: { top: y(start) + 'px' } });
    const input = h('input', { placeholder: fmtTime(start, clock) + ' – what? (e.g. walk 30m)', 'aria-label': 'New block title' });
    box.append(input, h('button.btn.btn-primary.btn-xs', { type: 'submit' }, h('span', { text: 'Add' })));
    box.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const title = input.value.trim();
      box.remove();
      if (!title) return;
      const m = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\b/i.exec(title);
      let dur = 60;
      let clean = title;
      if (m) {
        dur = /^h/i.test(m[2]) ? Math.round(parseFloat(m[1]) * 60) : parseInt(m[1], 10);
        clean = title.replace(m[0], '').trim() || 'block';
      }
      onCreate({ type: 'add', title: clean, start, end: start + Math.max(5, dur) });
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') box.remove();
    });
    input.addEventListener('blur', () => setTimeout(() => box.isConnected && !input.value && box.remove(), 150));
    lane.appendChild(box);
    input.focus();
  });
}
