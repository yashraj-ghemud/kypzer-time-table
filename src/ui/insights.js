/** Insights pane: Day Score rings, insight cards with fixes, stats, breakdown bars, energy curve. */
import { h, frag, tweenNumber } from '../core/dom.js';
import { icon } from './icons.js';
import { fmtDuration, fmtTime, minutesOfDay } from '../engine/time.js';
import { energyCurve, CHRONOTYPES } from '../engine/energy.js';

const RINGS = [
  { key: 'focus', label: 'Focus', color: '#00e5ff', r: 56 },
  { key: 'recovery', label: 'Recovery', color: '#9b6bff', r: 44 },
  { key: 'balance', label: 'Balance', color: '#f43f5e', r: 32 },
];

/** Standalone rings SVG (also used on the landing page). */
export function ringsSVG(score, { size = 132, stroke = 9 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 132 132');
  for (const r of RINGS) {
    const c = 2 * Math.PI * r.r;
    const trk = document.createElementNS(ns, 'circle');
    trk.setAttribute('cx', 66);
    trk.setAttribute('cy', 66);
    trk.setAttribute('r', r.r);
    trk.setAttribute('class', 'trk');
    trk.setAttribute('stroke-width', stroke);
    const arc = document.createElementNS(ns, 'circle');
    arc.setAttribute('cx', 66);
    arc.setAttribute('cy', 66);
    arc.setAttribute('r', r.r);
    arc.setAttribute('class', 'arc');
    arc.setAttribute('stroke', r.color);
    arc.setAttribute('stroke-width', stroke);
    arc.style.setProperty('--c', r.color);
    arc.setAttribute('stroke-dasharray', c.toFixed(1));
    arc.setAttribute('stroke-dashoffset', c.toFixed(1));
    arc.dataset.key = r.key;
    arc.dataset.c = c;
    svg.append(trk, arc);
  }
  if (score) setRings(svg, score);
  return svg;
}

export function setRings(svg, score) {
  requestAnimationFrame(() => {
    for (const arc of svg.querySelectorAll('.arc')) {
      const c = +arc.dataset.c;
      const v = Math.max(0, Math.min(100, score[arc.dataset.key] || 0));
      arc.setAttribute('stroke-dashoffset', (c * (1 - v / 100)).toFixed(1));
    }
  });
}

let ringsEl = null;
export function renderScore(root, analysis) {
  const s = analysis.score;
  if (!ringsEl || !root.contains(ringsEl.wrap)) {
    const svg = ringsSVG(null);
    const totalNum = h('b', { text: '0' });
    const wrap = h('div.rings', svg, h('div.total', h('div', totalNum, h('span', { text: '/100' }))));
    const legend = h('div.score-legend');
    root.replaceChildren(wrap, legend);
    ringsEl = { wrap, svg, totalNum, legend };
  }
  setRings(ringsEl.svg, s);
  tweenNumber(ringsEl.totalNum, s.total);
  ringsEl.legend.replaceChildren(
    h('div.score-grade', { text: analysis.stats.tasks ? s.grade : 'waiting for a plan' }),
    ...RINGS.map((r) => h('div.row', { '--c': r.color, title: ringTitle(r.key, s) }, h('i'), h('span', { text: r.label }), h('b', { text: String(s[r.key]) }))),
  );
}

function ringTitle(key, s) {
  const d = s.detail || {};
  if (key === 'focus') return 'Deep work ' + fmtDuration(d.deepMin || 0) + ' of ~' + fmtDuration(d.target || 0) + ' target, weighted by energy fit' + (d.marathons ? ', ' + d.marathons + ' marathon(s)' : '');
  if (key === 'recovery') return 'Breaks ' + (d.haveBreaks || 0) + '/' + (d.needBreaks || 0) + ' needed · sleep ' + fmtDuration(d.sleepMin || 0);
  return 'Life areas: ' + (d.areas || []).join(', ') + ' (' + (d.expected || 0) + ' expected for this span)';
}

export function renderInsights(root, analysis, { tone = 'en', onFix, onFocusBlocks }) {
  const list = analysis.insights;
  if (!list.length) {
    root.replaceChildren();
    return;
  }
  root.replaceChildren(
    h('div.sec-label', { text: 'Engine notes · ' + list.length }),
    ...list.map((ins, i) => {
      const t = (o) => (o && (o[tone] || o.en)) || '';
      const card = h('div.ins.' + ins.level, { style: { animationDelay: i * 45 + 'ms' }, onmouseenter: () => onFocusBlocks && onFocusBlocks(ins.blockIds), onmouseleave: () => onFocusBlocks && onFocusBlocks([]) },
        h('div.ins-ic', frag(icon(ins.icon))),
        h('div', h('h3', { text: t(ins.title) }), h('p', { text: t(ins.text) }),
          ins.fix ? h('button.fix', { onclick: () => onFix(ins) }, frag(icon('sparkle')), t(ins.fix.label)) : null),
      );
      return card;
    }),
  );
}

export function renderStats(root, analysis) {
  const st = analysis.stats;
  if (!st.tasks) {
    root.replaceChildren();
    return;
  }
  const items = [
    { num: fmtDuration(st.span), lab: 'Total span' },
    { num: fmtDuration(st.busy), lab: 'Busy' },
    { num: fmtDuration(st.free), lab: 'Free' },
    { num: String(st.tasks), lab: 'Blocks' },
    { num: fmtDuration(st.focus), lab: 'Deep work' },
    { num: fmtDuration(st.sleep), lab: 'Sleep' },
  ];
  root.replaceChildren(h('div.sec-label', { text: 'Numbers' }), h('div.stats-grid', ...items.map((s) => h('div.stat', h('div.num', { text: s.num }), h('div.lab', { text: s.lab })))));
}

export function renderBreakdown(root, analysis) {
  const cats = analysis.stats.byCategory;
  if (!cats.length) {
    root.replaceChildren();
    return;
  }
  const max = cats[0].minutes || 1;
  const rows = cats.slice(0, 8).map((c) =>
    h('div.bar-row', { '--c': c.color },
      h('div.bar-top', h('span.name', h('i'), h('span', { text: c.title })), h('span.val', { text: fmtDuration(c.minutes) })),
      h('div.bar-track', h('div.bar-fill', { dataset: { w: String(Math.round((c.minutes / max) * 100)) } })),
    ),
  );
  root.replaceChildren(h('div.sec-label', { text: 'Where the time goes' }), ...rows);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const f of root.querySelectorAll('.bar-fill')) f.style.width = f.dataset.w + '%';
  }));
}

export function renderEnergy(root, plan, chronotype) {
  if (!plan.blocks.length) {
    root.replaceChildren();
    return;
  }
  const W = 300;
  const H = 90;
  const from = 300;
  const to = 1500;
  const x = (t) => ((t - from) / (to - from)) * W;
  const pts = energyCurve(chronotype, from, to, 15);
  const y = (e) => H - 12 - e * (H - 24);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.e).toFixed(1)).join(' ');
  const area = d + ` L${W} ${H - 12} L0 ${H - 12} Z`;
  let blocks = '';
  for (const b of plan.blocks) {
    const a = Math.max(from, b.start);
    const e = Math.min(to, b.end);
    if (e <= a) continue;
    blocks += `<rect class="blk" x="${x(a).toFixed(1)}" y="${H - 10}" width="${Math.max(1.5, x(e) - x(a)).toFixed(1)}" height="6" rx="2" fill="${b.color}"/>`;
  }
  let axis = '';
  for (let t = 360; t <= 1440; t += 180) axis += `<text class="axis" x="${x(t).toFixed(1)}" y="${H + 8}" text-anchor="middle">${fmtTime(t).replace(':00', '').replace(' ', '').toLowerCase()}</text>`;
  const now = plan.isToday ? minutesOfDay() : null;
  const nowLine = now != null && now > from && now < to ? `<line class="nowl" x1="${x(now)}" x2="${x(now)}" y1="4" y2="${H - 4}"/>` : '';
  const svg = `<svg viewBox="0 0 ${W} ${H + 12}" role="img" aria-label="Typical energy curve with your blocks"><defs><linearGradient id="eg" x1="0" x2="1"><stop offset="0" stop-color="#00e5ff"/><stop offset=".5" stop-color="#9b6bff"/><stop offset="1" stop-color="#f43f5e"/></linearGradient><linearGradient id="ega" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(0,229,255,.22)"/><stop offset="1" stop-color="rgba(0,229,255,0)"/></linearGradient></defs><path class="area" d="${area}"/><path class="curve" d="${d}"/>${blocks}${nowLine}${axis}</svg>`;
  root.replaceChildren(
    h('div.sec-label', { text: 'Energy · ' + (CHRONOTYPES[chronotype] || CHRONOTYPES.balanced).label }),
    frag(svg),
    h('p.energy-note', { text: 'Typical pattern for your chronotype — not medical advice. Change it in settings.' }),
  );
}
