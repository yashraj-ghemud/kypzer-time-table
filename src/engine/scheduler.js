/**
 * Auto-scheduler: fits flexible tasks ("study 2h", "report 1h before 6pm !") into free time.
 * Hard constraints: window, `after`, `deadline`, no overlap (with buffers).
 * Soft preferences: energy fit per task type, daypart, earliness (stronger for priority), best-fit gaps.
 * Deterministic so it can be unit-tested and so the plan never "jumps" between keystrokes.
 */
import { avgEnergy } from './energy.js';
import { categoryInfo } from './lexicon.js';
import { fmtDuration, fmtTime } from './time.js';

const STEP = 5;
const DAYPART_WIN = {
  morning: [300, 720],
  afternoon: [720, 1020],
  evening: [1020, 1290],
  night: [1230, 1560],
};

export function mergeIntervals(list) {
  const s = list.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Free intervals of [ws, we] not covered by busy (busy expanded by buffer). */
export function freeIntervals(busy, ws, we, buffer = 0) {
  const merged = mergeIntervals(busy.map(([a, b]) => [a - buffer, b + buffer]));
  const free = [];
  let cur = ws;
  for (const [a, b] of merged) {
    if (b <= cur) continue;
    if (a >= we) break;
    if (a > cur) free.push([cur, Math.min(a, we)]);
    cur = Math.max(cur, b);
  }
  if (cur < we) free.push([cur, we]);
  return free.filter(([a, b]) => b - a > 0);
}

const ceilTo = (v, step) => Math.ceil(v / step) * step;

function energyCost(type, e) {
  switch (type) {
    case 'deep':
      return (1 - e) * 70;
    case 'active':
      return (1 - e) * 30;
    case 'rest':
      return e * 25;
    case 'sleep':
      return e * 80;
    default:
      return (1 - e) * 8;
  }
}

/**
 * @param {{start:number,end:number}[]} fixed
 * @param {object[]} flex resolved flex tasks
 * @param {{windowStart:number, windowEnd:number, chronotype?:string, buffer?:number}} opts
 */
export function schedule(fixed, flex, opts) {
  const { windowStart: ws, windowEnd: we, chronotype = 'balanced', buffer = 5 } = opts;
  const busy = fixed.map((b) => [b.start, b.end]);
  const placed = [];
  const unplaced = [];
  const order = flex
    .map((t, i) => ({ t, i }))
    .sort((a, b) =>
      (b.t.priority || 0) - (a.t.priority || 0) ||
      (a.t.deadline ?? Infinity) - (b.t.deadline ?? Infinity) ||
      b.t.duration - a.t.duration ||
      a.i - b.i,
    )
    .map((x) => x.t);

  for (const task of order) {
    const dur = task.duration;
    const type = categoryInfo(task.category).energy;
    const lo = Math.max(ws, task.after ?? -Infinity);
    const hi = Math.min(we, task.deadline ?? Infinity);
    const free = freeIntervals(busy, ws, we, buffer);
    let best = null;
    for (const [a0, b0] of free) {
      // an interval touching the window edge does not need the buffer on that side
      const a = Math.max(a0, lo);
      const b = Math.min(b0, hi);
      for (let s = ceilTo(a, STEP); s + dur <= b; s += STEP) {
        const e = avgEnergy(s, s + dur, chronotype);
        let cost = energyCost(type, e);
        if (task.daypart && DAYPART_WIN[task.daypart]) {
          const [da, db] = DAYPART_WIN[task.daypart];
          if (s < da || s + dur > db + 60) cost += 80;
        }
        cost += ((s - lo) / 60) * (2 + 4 * (task.priority || 0));
        const before = s - a0;
        const after = b0 - (s + dur);
        if (before > 0 && before < 20) cost += 12;
        if (after > 0 && after < 20) cost += 12;
        if (before === 0 || after === 0) cost -= 4;
        if (!best || cost < best.cost - 1e-9) best = { s, cost };
      }
    }
    if (best) {
      const block = {
        ...task,
        kind: 'auto',
        start: best.s,
        end: best.s + dur,
        guessed: false,
        point: false,
      };
      placed.push(block);
      busy.push([block.start, block.end]);
    } else {
      let reason;
      if (task.deadline != null && task.deadline <= ws) reason = 'Deadline ' + fmtTime(task.deadline) + ' is already past the planning window';
      else if (task.deadline != null) reason = 'No free ' + fmtDuration(dur) + ' slot before ' + fmtTime(task.deadline);
      else if (task.after != null) reason = 'No free ' + fmtDuration(dur) + ' slot after ' + fmtTime(task.after);
      else reason = 'No free ' + fmtDuration(dur) + ' slot between ' + fmtTime(ws) + ' and ' + fmtTime(we);
      unplaced.push({ ...task, reason });
    }
  }
  placed.sort((a, b) => a.start - b.start);
  return { placed, unplaced };
}
