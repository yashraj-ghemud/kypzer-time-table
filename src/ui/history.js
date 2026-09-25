/** History: completion heatmap (16 weeks), streak, category totals for the last 7 days. */
import { h } from '../core/dom.js';
import { state, getPlan, today } from '../core/store.js';
import { openModal, closeModal } from './modal.js';
import { addDays, parseDateKey, fmtDuration, fmtDateShort } from '../engine/time.js';
import { categoryInfo } from '../engine/lexicon.js';

function dayStats(key) {
  const rec = state.days[key];
  if (!rec || !rec.text || !rec.text.trim()) return null;
  const plan = getPlan(key);
  const total = plan.blocks.length;
  if (!total) return null;
  const done = plan.blocks.filter((b) => rec.done && rec.done[b.id] === 'done');
  const doneMin = done.reduce((s, b) => s + b.end - b.start, 0);
  const planned = plan.blocks.reduce((s, b) => s + b.end - b.start, 0);
  return { plan, total, done: done.length, pct: planned ? doneMin / planned : 0, score: plan.analysis.score.total };
}

export function openHistory() {
  const t = today();
  const weeks = 16;
  const start = addDays(t, -((weeks - 1) * 7 + ((parseDateKey(t).getDay() + 6) % 7)));
  const heat = h('div.heat', { role: 'img', 'aria-label': 'Completion heatmap for the last 16 weeks' });
  let streak = 0;
  let planned = 0;
  let scoreSum = 0;
  let counting = true;
  for (let i = 0; i <= weeks * 7; i++) {
    const key = addDays(start, i);
    if (key > t) break;
    const st = dayStats(key);
    const lvl = !st ? 0 : st.pct >= 0.9 ? 4 : st.pct >= 0.6 ? 3 : st.pct >= 0.3 ? 2 : 1;
    const cell = h('i', { dataset: { l: String(lvl) }, title: fmtDateShort(key) + (st ? ' · ' + st.done + '/' + st.total + ' done · score ' + st.score : ' · no plan') });
    if (key === t) cell.classList.add('today');
    cell.addEventListener('click', async () => {
      closeModal();
      const m = await import('./app.js');
      m.gotoDate(key);
    });
    heat.appendChild(cell);
    if (st) {
      planned++;
      scoreSum += st.score;
    }
  }
  for (let i = 0; i < 400; i++) {
    const key = addDays(t, -i);
    const st = dayStats(key);
    if (st && st.done > 0) streak++;
    else if (i > 0) {
      counting = false;
      break;
    }
  }
  void counting;
  // last 7 days by category
  const totals = new Map();
  for (let i = 0; i < 7; i++) {
    const st = dayStats(addDays(t, -i));
    if (!st) continue;
    for (const b of st.plan.blocks) {
      const info = categoryInfo(b.category, b.title);
      const cur = totals.get(info.id) || { label: info.label, color: info.color, min: 0 };
      cur.min += b.end - b.start;
      totals.set(info.id, cur);
    }
  }
  const tot = [...totals.values()].sort((a, b) => b.min - a.min);
  const max = tot.length ? tot[0].min : 1;
  const body = h('div',
    h('div.hist-stats',
      h('div.stat', h('div.num', { text: String(streak) }), h('div.lab', { text: 'day streak' })),
      h('div.stat', h('div.num', { text: String(planned) }), h('div.lab', { text: 'days planned' })),
      h('div.stat', h('div.num', { text: planned ? String(Math.round(scoreSum / planned)) : '—' }), h('div.lab', { text: 'avg day score' })),
    ),
    h('div.sec-label', { text: 'Completion · last 16 weeks (click a day)' }),
    heat,
    h('div.sec-label', { text: 'Planned time · last 7 days' }),
    tot.length ? h('div', ...tot.map((c) => h('div.bar-row', { '--c': c.color },
      h('div.bar-top', h('span.name', h('i'), h('span', { text: c.label })), h('span.val', { text: fmtDuration(c.min) })),
      h('div.bar-track', h('div.bar-fill', { style: { width: (c.min / max) * 100 + '%' } }))))) : h('p.dim.small', { text: 'Plan a few days and tick blocks off — your patterns show up here.' }),
    h('p.small.dim', { style: { marginTop: '14px' }, text: 'Streak counts consecutive days with at least one block marked done. Everything is computed locally.' }),
  );
  openModal({ title: 'History & streaks', body });
}
