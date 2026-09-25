import { h, frag, flipCapture, flipPlay } from '../core/dom.js';
import { icon, hasIcon } from './icons.js';
import { fmtTime, fmtDuration, minutesOfDay } from '../engine/time.js';
import { categoryInfo } from '../engine/lexicon.js';
import { timelineItems } from '../engine/plan.js';

export function catIcon(cat) {
  return icon(hasIcon(cat) ? cat : 'other');
}

/**
 * @param {HTMLElement} root
 * @param {object} plan
 * @param {{clock, done, selected, onSelect, onToggle, onFlip}} opts
 */
export function renderTimeline(root, plan, opts) {
  const before = flipCapture(root);
  const clock = opts.clock;
  const now = plan.isToday ? minutesOfDay() : null;
  const clashIds = new Set(plan.analysis.insights.filter((i) => i.level === 'critical').flatMap((i) => i.blockIds));
  const list = h('div.tl', { role: 'list' });
  let nowPlaced = now == null;
  const items = timelineItems(plan);
  items.forEach((it, idx) => {
    if (!nowPlaced && it.start > now) {
      list.appendChild(h('div.tl-nowline', { role: 'listitem', 'aria-label': 'Now, ' + fmtTime(now, clock) }, h('span', { text: fmtTime(now, clock).replace(/ [AP]M$/, '') })));
      nowPlaced = true;
    }
    if (it.type === 'gap') {
      list.appendChild(
        h('div.tl-item.gap', { 'data-key': 'gap-' + it.start, role: 'listitem', style: { animationDelay: idx * 30 + 'ms' } },
          h('div.tl-time', fmtTime(it.start, clock).replace(/ ([AP]M)/, ' $1')),
          h('div.tl-card', h('div.tl-ic', frag(icon('free'))), h('div.tl-body', h('div.tl-title', h('span.t', { text: 'Free · ' + fmtDuration(it.end - it.start) })))),
        ),
      );
      return;
    }
    const b = it.block;
    const info = categoryInfo(b.category, b.title);
    const status = opts.done[b.id];
    const isNow = now != null && b.start <= now && now < b.end;
    const past = now != null && b.end <= now;
    const cls = ['tl-item'];
    if (status === 'done') cls.push('done');
    if (status === 'skipped') cls.push('skipped');
    if (isNow) cls.push('now');
    if (past) cls.push('past');
    if (clashIds.has(b.id)) cls.push('clash');
    if (opts.selected === b.id) cls.push('selected');
    const badges = [];
    if (isNow) badges.push(h('span.tl-now-tag', { text: 'NOW' }));
    if (b.kind === 'auto') badges.push(h('span.badge.auto', { text: 'auto', title: 'Placed by the engine — drag it in Grid view to pin' }));
    if (b.kind === 'routine') badges.push(h('span.badge.routine', { text: 'routine', title: 'From your week timetable' }));
    if (clashIds.has(b.id)) badges.push(h('span.badge.clash', { text: 'clash' }));
    if (b.guessed) {
      badges.push(h('button.badge.guess', {
        text: '? ' + (b.start % 1440 < 720 ? 'AM' : 'PM'),
        title: 'AM/PM was guessed — click to flip',
        'aria-label': 'Flip AM/PM for ' + b.title,
        onclick: (e) => {
          e.stopPropagation();
          opts.onFlip(b);
        },
      }));
    }
    const card = h('div.tl-card',
      h('div.tl-ic', frag(catIcon(info.id))),
      h('div.tl-body',
        h('div.tl-title', h('span.t', { text: b.title || 'Untitled' }), ...badges),
        h('div.tl-sub', h('span', { text: fmtTime(b.start, clock) + ' – ' + fmtTime(b.end, clock) }), h('span.cat', { text: info.label })),
      ),
      h('span.tl-dur', { text: fmtDuration(b.end - b.start) }),
      h('button.tl-check', {
        'aria-label': (status === 'done' ? 'Mark not done: ' : 'Mark done: ') + b.title,
        'aria-pressed': status === 'done' ? 'true' : 'false',
        onclick: (e) => {
          e.stopPropagation();
          opts.onToggle(b, status === 'done' ? null : 'done');
        },
      }, frag(icon('check'))),
    );
    if (isNow) {
      const pct = Math.min(100, ((now - b.start) / (b.end - b.start)) * 100);
      card.appendChild(h('div.tl-progress', { style: { width: pct + '%' } }));
    }
    const item = h('div.' + cls.join('.'), {
      'data-key': b.id,
      '--c': b.color || info.color,
      role: 'listitem',
      tabindex: '0',
      onclick: () => opts.onSelect(b),
      onkeydown: (e) => {
        if (e.key === 'Enter') opts.onSelect(b);
      },
    },
    h('div.tl-time', fmtTime(b.start, clock).replace(/ ([AP]M)/, ' $1').replace(/ \+1d/, ''), b.start >= 1440 ? h('small', { text: '+1 day' }) : null),
    card);
    list.appendChild(item);
  });
  if (!nowPlaced && now != null && items.length) {
    list.appendChild(h('div.tl-nowline', { role: 'listitem', 'aria-label': 'Now, ' + fmtTime(now, clock) }, h('span', { text: fmtTime(now, clock).replace(/ [AP]M$/, '') })));
  }
  root.replaceChildren(list);
  flipPlay(root, before);
}
