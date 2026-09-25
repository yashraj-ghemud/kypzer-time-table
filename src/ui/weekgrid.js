import { h } from '../core/dom.js';
import { fmtTime, WEEKDAYS, weekdayIndex } from '../engine/time.js';

/** Weekly timetable grid (7 columns). */
export function renderWeekGrid(root, week, { clock, onDay } = {}) {
  if (!week || !week.lines.length) {
    root.replaceChildren(h('div.empty', h('div.ring'), h('h3', { text: 'Your weekly timetable' }),
      h('p', { text: 'Write one line per class or routine. Start with the days, then the time:' }),
      h('div.examples', ...['mon-fri 9 to 10am : maths', 'tue, thu 2-4pm coding club', 'daily 6am run 30m', 'somvar 5pm tuition'].map((x) => h('button', { text: x, disabled: true })))));
    return;
  }
  const all = week.days.flat();
  const from = Math.floor(Math.min(...all.map((b) => b.start)) / 60) * 60;
  const to = Math.ceil(Math.max(...all.map((b) => b.end)) / 60) * 60;
  const ppm = Math.max(0.7, Math.min(1.3, 640 / Math.max(60, to - from)));
  const H = (to - from) * ppm;
  const today = weekdayIndex(new Date());
  const grid = h('div.wk');
  grid.appendChild(h('div'));
  WEEKDAYS.forEach((d, i) => grid.appendChild(h('button.wk-head' + (i === today ? '.today' : ''), { text: d, title: 'Open next ' + d, onclick: () => onDay && onDay(i) })));
  const hours = h('div.wk-hours', { style: { height: H + 'px' } });
  for (let t = from; t <= to; t += 60) hours.appendChild(h('span', { style: { top: (t - from) * ppm + 'px' }, text: fmtTime(t, clock).replace(':00', '').replace(/ \+\d+d/, '') }));
  grid.appendChild(hours);
  week.days.forEach((list, d) => {
    const col = h('div.wk-col' + (d === today ? '.today' : ''), { style: { height: H + 'px' } });
    list.forEach((b, i) => {
      col.appendChild(h('div.wk-cell', {
        '--c': b.color,
        title: b.title + ' · ' + fmtTime(b.start, clock) + ' – ' + fmtTime(b.end, clock),
        style: { top: (b.start - from) * ppm + 1 + 'px', height: Math.max(16, (b.end - b.start) * ppm - 2) + 'px', animationDelay: d * 40 + i * 25 + 'ms' },
      }, h('b', { text: b.title }), (b.end - b.start) * ppm > 30 ? h('span', { text: fmtTime(b.start, clock) }) : null));
    });
    grid.appendChild(col);
  });
  root.replaceChildren(grid);
}
