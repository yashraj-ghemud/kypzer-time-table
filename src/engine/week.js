/**
 * Week mode: "mon-fri 9 to 10am : maths", "tue thu 2-4pm coding club", "daily 6am run 30m".
 * Each line resolves on its own (no cursor across lines) and expands to the days it names.
 */
import { parse } from './parser.js';
import { resolve } from './resolver.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];

/**
 * @returns {{entries:object[], tokens:object[], lines:object[], days:object[][], ignored:object[]}}
 */
export function buildWeek(text) {
  const { entries, tokens } = parse(text, { mode: 'week' });
  const timed = entries.filter((e) => e.kind !== 'flex' || e.seq);
  const { fixed } = resolve(timed, { independent: true, idPrefix: 'w' });
  const ignored = entries.filter((e) => e.kind === 'flex' && !e.seq);
  const lines = fixed.map((b) => ({ ...b, days: b.days && b.days.length ? b.days : ALL }));
  const days = ALL.map((d) =>
    lines
      .filter((l) => l.days.includes(d))
      .map((l) => ({ ...l, id: l.id + '@' + d, lineId: l.id, day: d }))
      .sort((a, b) => a.start - b.start),
  );
  return { entries, tokens, lines, days, ignored };
}

/** Routine blocks for one weekday, ready to merge into a day plan (read-only). */
export function routineFor(week, weekday) {
  if (!week) return [];
  return week.days[weekday].map((b) => ({
    ...b,
    id: 'r-' + b.lineId.replace(/^w-/, ''),
    kind: 'routine',
    readOnly: true,
    guessed: false,
  }));
}
