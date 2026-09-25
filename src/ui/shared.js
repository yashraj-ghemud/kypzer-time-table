/** Read-only view of a plan that arrived inside a link (#/s/<payload>), with import. */
import { h, frag, qs, download } from '../core/dom.js';
import { state, planFromText, setText, setWeekText, dayRecord, today, emit } from '../core/store.js';
import { decodeShare } from '../engine/share.js';
import { isValidDateKey, fmtDateLong } from '../engine/time.js';
import { go } from '../core/router.js';
import { renderTimeline } from './timeline.js';
import { renderScore } from './insights.js';
import { renderCard } from './card.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

export async function mountShared(payload) {
  const root = qs('#shared');
  root.replaceChildren(h('div.empty', h('div.ring'), h('h3', { text: 'Unpacking the plan…' })));
  let data;
  try {
    data = await decodeShare(payload);
  } catch (e) {
    root.replaceChildren(h('div.empty', h('h3', { text: 'This link looks broken' }), h('p', { text: e.message }), h('a.btn.btn-primary', { href: '#/app', style: { marginTop: '16px' } }, h('span', { text: 'Open my planner' }))));
    return;
  }
  const key = data.d && isValidDateKey(data.d) ? data.d : today();
  const plan = planFromText(data.t, key);
  plan.dateKey = key;
  plan.isToday = key === today();
  const tl = h('div');
  const scoreBox = h('div.score-card');
  const importDay = h('button.btn.btn-primary', { onclick: () => {
    const cur = dayRecord(key).text;
    if (cur && cur.trim() && cur !== data.t && !confirm('You already have a plan for ' + fmtDateLong(key) + '. Replace it?')) return;
    setText(data.t, key);
    if (data.w && data.w.trim() && (!state.week.text || confirm('Also import the weekly timetable from this link?'))) setWeekText(data.w);
    state.ui.date = key;
    state.ui.mode = 'day';
    emit('import');
    toast('Imported into your planner', { kind: 'ok' });
    go('/app');
  } }, frag(icon('download')), h('span', { text: 'Import into my planner' }));
  const img = h('button.btn.btn-ghost', { onclick: () => {
    const c = document.createElement('canvas');
    renderCard(c, plan, { format: 'story', theme: 'midnight', clock: state.settings.clock, dateKey: key });
    c.toBlob((b) => download('kypzer-shared-' + key + '.png', b, 'image/png'));
  } }, frag(icon('image')), h('span', { text: 'Save image' }));
  root.replaceChildren(
    h('div.shared-head',
      h('div', h('p.kicker.mono', { text: 'SHARED PLAN' }), h('h1', { text: fmtDateLong(key) })),
      h('div.actions', img, importDay),
    ),
    h('div.pane', { style: { marginBottom: '14px' } }, scoreBox),
    h('div.pane', tl),
    h('p.small.dim', { style: { marginTop: '14px', textAlign: 'center' }, text: 'This plan travelled inside the link itself — nothing was uploaded anywhere.' }),
  );
  renderScore(scoreBox, plan.analysis);
  if (!plan.blocks.length) tl.replaceChildren(h('div.empty', h('h3', { text: 'This plan is empty' })));
  else renderTimeline(tl, plan, { clock: state.settings.clock, done: {}, selected: null, onSelect: () => {}, onToggle: () => toast('Import the plan to tick things off.'), onFlip: () => toast('Import the plan to edit it.') });
}
