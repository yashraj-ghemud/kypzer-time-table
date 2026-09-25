/**
 * Resolver: turns parsed entries into absolute-time blocks.
 *
 * Absolute minutes are counted from 00:00 of the plan day; values ≥ 1440 are "next day".
 * Ambiguous times (no am/pm) are resolved by scoring every candidate:
 *   forward distance from the previous block (the cursor) + category/time-of-day penalties,
 * with up to 3h of backtracking allowed so intentional overlaps stay on the same day.
 */
import { DAY, mod } from './time.js';
import { categoryInfo, MEAL_WORDS } from './lexicon.js';

const TOL = 180;
const OUT_OF_ORDER = 700;

const DAYPART_WIN = {
  morning: (v) => v >= 240 && v < 720,
  afternoon: (v) => v >= 720 && v < 1080,
  evening: (v) => v >= 960 && v < 1320,
  night: (v) => v >= 1140 || v < 300,
};

/** Base minute-of-day candidates for an atom. */
export function atomCandidates(atom) {
  if (!atom) return [];
  if (atom.is24) return [{ v: atom.h * 60 + atom.m, explicit: true }];
  if (atom.period) {
    const h = (atom.h % 12) + (atom.period === 'pm' ? 12 : 0);
    return [{ v: h * 60 + atom.m, explicit: true }];
  }
  const am = (atom.h % 12) * 60 + atom.m;
  const list = [{ v: am, explicit: false }, { v: am + 720, explicit: false }];
  if (atom.daypart && DAYPART_WIN[atom.daypart]) {
    const f = list.filter((c) => DAYPART_WIN[atom.daypart](c.v));
    if (f.length === 1) return [{ v: f[0].v, explicit: true }];
  }
  return list;
}

/** Penalty for doing something at a clock time that does not fit its nature (breakfast at 8 PM…). */
export function timePenalty(title, category, abs) {
  const v = mod(abs, DAY);
  const t = String(title || '').toLowerCase();
  if (MEAL_WORDS.breakfast.test(t)) return v >= 300 && v <= 690 ? 0 : 500;
  if (MEAL_WORDS.lunch.test(t)) return v >= 660 && v <= 960 ? 0 : 500;
  if (MEAL_WORDS.dinner.test(t)) return v >= 1080 || v < 60 ? 0 : 500;
  if (category === 'sleep') {
    if (/\bnap\b|power nap/.test(t)) return v >= 720 && v <= 1080 ? 0 : 400;
    return v >= 1200 || v < 240 ? 0 : 500;
  }
  if (/\bwake|\buth/.test(t)) return v >= 240 && v <= 660 ? 0 : 500;
  // very few things are planned between 1 and 5 AM (sleep and travel aside)
  if (v >= 60 && v < 300 && category !== 'commute') return 250;
  return 0;
}

/** Typical-day prior for the very first ambiguous time. */
function priorCost(v, atomH, category) {
  const h = atomH % 12;
  const isPm = v >= 720;
  let preferPm;
  if (h === 0) preferPm = true; // 12 → noon
  else if (h >= 1 && h <= 5) preferPm = true;
  else if (h === 6) preferPm = !['fitness', 'routine', 'mind'].includes(category);
  else preferPm = false; // 7–11 → morning
  return isPm === preferPm ? 0 : 200;
}

function startCost(x, ctx, entry, atom, candidateExplicit) {
  let cost;
  if (ctx.cursor == null) {
    cost = candidateExplicit ? 0 : priorCost(mod(x, DAY), atom.h, entry.category);
  } else {
    const d = x - ctx.cursor;
    if (d >= -TOL) cost = d >= 0 ? d : -d * 3;
    else if (mod(x, DAY) >= 300 && ctx.prevCategory !== 'sleep') {
      // an item appended out of order ("…5 to 7 pm call, subah 7 baje gym") stays on the same day;
      // only early hours or times right after sleep roll over to tomorrow
      cost = 300 + (-d) / 8;
    } else cost = OUT_OF_ORDER + (-d) / 4;
  }
  return cost + timePenalty(entry.title, entry.category, x);
}

function startOptions(atom, ctx, entry) {
  const base = atomCandidates(atom);
  const allExplicit = base.every((c) => c.explicit);
  const opts = [];
  const cursorDay = ctx.cursor == null ? 0 : Math.floor(ctx.cursor / DAY);
  const kFrom = ctx.cursor == null ? 0 : Math.max(0, cursorDay - 1);
  const kTo = ctx.cursor == null ? 0 : cursorDay + 1;
  for (const c of base) {
    for (let k = kFrom; k <= kTo; k++) {
      const x = c.v + k * DAY;
      opts.push({ x, cost: startCost(x, ctx, entry, atom, c.explicit), explicit: allExplicit });
    }
  }
  opts.sort((a, b) => a.cost - b.cost || a.x - b.x);
  return opts;
}

/** Smallest end after start (strictly), within 24h. */
function resolveEnd(atom, start) {
  const base = atomCandidates(atom);
  let best = null;
  for (const c of base) {
    const dayOf = Math.floor(start / DAY);
    for (let k = dayOf - 1; k <= dayOf + 2; k++) {
      const x = c.v + k * DAY;
      if (x > start && x - start <= DAY && (best == null || x < best)) best = x;
    }
  }
  return best == null ? start + 30 : best;
}

function durationPenalty(dur, category) {
  if (dur > 720) return 1000;
  if (dur > 480 && category !== 'sleep') return 300;
  return 0;
}

/** Stable ids: slug of the title + occurrence, so re-parsing keeps identities (FLIP animations, check-offs). */
export function makeIdFactory(prefix = 'b') {
  const seen = new Map();
  return (title) => {
    const slug = String(title || 'block').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'block';
    const n = (seen.get(slug) || 0) + 1;
    seen.set(slug, n);
    return prefix + '-' + slug + (n > 1 ? '-' + n : '');
  };
}

/**
 * Resolve an absolute atom for a constraint (deadline / after) without a cursor.
 */
export function resolveConstraint(atom, category) {
  if (!atom) return null;
  const base = atomCandidates(atom);
  if (base.length === 1) return base[0].v;
  let best = null;
  for (const c of base) {
    const cost = priorCost(c.v, atom.h, category);
    if (!best || cost < best.cost) best = { v: c.v, cost };
  }
  return best.v;
}

/**
 * @param {object[]} entries parsed entries
 * @param {{independent?: boolean}} [opts] independent: resolve each entry without a cursor (week mode)
 * @returns {{fixed: object[], flex: object[]}}
 */
export function resolve(entries, opts = {}) {
  const ctx = { cursor: null };
  const makeId = makeIdFactory(opts.idPrefix || 'b');
  const fixed = [];
  const flex = [];
  let pendingPoint = null;

  for (const entry of entries) {
    if (opts.independent) {
      ctx.cursor = null;
      pendingPoint = null;
    }
    const info = categoryInfo(entry.category, entry.title);
    const common = {
      entryIndex: entry.index,
      title: entry.title,
      category: info.id,
      color: info.color,
      priority: entry.priority,
      srcS: entry.s,
      srcE: entry.e,
      days: entry.days,
    };

    if (entry.kind === 'range' || entry.kind === 'point') {
      const opts2 = startOptions(entry.start, ctx, entry);
      let chosen = null;
      let end = null;
      if (entry.kind === 'range') {
        for (const o of opts2) {
          const e = resolveEnd(entry.end, o.x);
          const total = o.cost + durationPenalty(e - o.x, entry.category);
          if (!chosen || total < chosen.total) {
            chosen = { ...o, total };
            end = e;
          }
        }
      } else {
        chosen = opts2[0];
        end = entry.duration != null ? chosen.x + entry.duration : null;
      }
      const endExplicit = entry.kind === 'range' && atomCandidates(entry.end).every((c) => c.explicit);
      const guessed = !chosen.explicit && !endExplicit;
      const block = { id: makeId(entry.title), ...common, kind: 'fixed', start: chosen.x, end, guessed, point: end == null };
      fixed.push(block);
      ctx.prevCategory = info.id;
      if (end == null) {
        ctx.cursor = chosen.x;
        pendingPoint = block;
      } else {
        ctx.cursor = end;
        pendingPoint = null;
      }
      continue;
    }

    if (entry.kind === 'until') {
      let start;
      if (pendingPoint && pendingPoint.end == null) {
        start = pendingPoint.start + Math.min(categoryInfo(pendingPoint.category).defDur, 30);
        pendingPoint.end = start;
      } else if (ctx.cursor != null) start = ctx.cursor;
      else {
        const endGuess = resolveConstraint(entry.end, entry.category);
        start = endGuess - (entry.duration || info.defDur);
      }
      const end = resolveEnd(entry.end, start);
      fixed.push({ id: makeId(entry.title), ...common, kind: 'fixed', start, end, guessed: false, point: false });
      ctx.cursor = end;
      pendingPoint = null;
      continue;
    }

    // flex
    const duration = entry.duration != null ? entry.duration : info.defDur;
    if (entry.seq && ctx.cursor != null) {
      let start = ctx.cursor;
      if (pendingPoint && pendingPoint.end == null) {
        pendingPoint.end = pendingPoint.start + categoryInfo(pendingPoint.category).defDur;
        start = pendingPoint.end;
      }
      const end = start + duration;
      fixed.push({ id: makeId(entry.title), ...common, kind: 'fixed', start, end, guessed: false, point: false, seq: true });
      ctx.cursor = end;
      pendingPoint = null;
      continue;
    }
    flex.push({
      id: makeId(entry.title),
      ...common,
      kind: 'flex',
      duration,
      durationGuessed: entry.duration == null,
      deadline: resolveConstraint(entry.deadline, entry.category),
      after: resolveConstraint(entry.after, entry.category),
      daypart: entry.daypart,
    });
  }

  fillPointEnds(fixed);
  return { fixed, flex };
}

/** Points end at the next start (capped by category), or after the category default when last. */
export function fillPointEnds(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.end != null) continue;
    const info = categoryInfo(b.category);
    let next = null;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start > b.start) {
        next = sorted[j];
        break;
      }
    }
    const gap = next ? next.start - b.start : Infinity;
    // v1 semantics ("3:45 come to room, 3:50 work" → 5 min) when the next block is near;
    // otherwise the category default, leaving the rest as free time.
    if (gap >= 5 && gap <= info.cap) b.end = next.start;
    else b.end = b.start + Math.min(info.defDur, gap >= 5 ? gap : info.defDur);
  }
  return blocks;
}
