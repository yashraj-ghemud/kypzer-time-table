/**
 * Analyzer ("Day Doctor"): stats, insights with one-click fixes, and the Day Score rings.
 * Every message exists in two tones: `en` and `hi` (Hinglish).
 */
import { avgEnergy, peakWindow } from './energy.js';
import { categoryInfo, MEAL_WORDS } from './lexicon.js';
import { mergeIntervals, freeIntervals } from './scheduler.js';
import { fmtDuration, fmtTime } from './time.js';

export const DEEP = new Set(['work', 'code', 'study']);
const RESTFUL = new Set(['break', 'food', 'mind', 'fun', 'sleep', 'routine']);
const LIFE_AREAS = {
  work: 'work', code: 'work', study: 'work', meeting: 'work',
  fitness: 'body',
  call: 'people', social: 'people',
  mind: 'mind', fun: 'mind', break: 'mind',
  food: 'care', sleep: 'care', routine: 'care', chores: 'care', commute: 'care',
};

const dur = (b) => b.end - b.start;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function sumUnion(blocks) {
  return mergeIntervals(blocks.map((b) => [b.start, b.end])).reduce((s, [a, b]) => s + (b - a), 0);
}

/** Free gaps between consecutive blocks (inside the plan's span). */
export function computeGaps(blocks, minGap = 1) {
  const merged = mergeIntervals(blocks.map((b) => [b.start, b.end]));
  const gaps = [];
  for (let i = 0; i + 1 < merged.length; i++) {
    const a = merged[i][1];
    const b = merged[i + 1][0];
    if (b - a >= minGap) gaps.push({ start: a, end: b });
  }
  return gaps;
}

export function computeStats(blocks) {
  if (!blocks.length) {
    return { span: 0, busy: 0, free: 0, tasks: 0, focus: 0, breaks: 0, sleep: 0, byCategory: [], first: null, last: null };
  }
  const first = Math.min(...blocks.map((b) => b.start));
  const last = Math.max(...blocks.map((b) => b.end));
  const span = last - first;
  const nonSleep = blocks.filter((b) => b.category !== 'sleep');
  const busy = sumUnion(nonSleep);
  const covered = sumUnion(blocks);
  const free = Math.max(0, span - covered);
  const focus = blocks.filter((b) => DEEP.has(b.category)).reduce((s, b) => s + dur(b), 0);
  const breaks = blocks.filter((b) => b.category === 'break').reduce((s, b) => s + dur(b), 0) + free;
  const sleep = blocks.filter((b) => b.category === 'sleep').reduce((s, b) => s + dur(b), 0);
  const map = new Map();
  for (const b of blocks) {
    const key = b.category === 'other' ? 'other:' + b.title.toLowerCase() : b.category;
    const cur = map.get(key) || { key, category: b.category, title: b.category === 'other' ? b.title : categoryInfo(b.category).label, color: b.color, minutes: 0, count: 0 };
    cur.minutes += dur(b);
    cur.count += 1;
    map.set(key, cur);
  }
  const byCategory = [...map.values()].sort((a, b) => b.minutes - a.minutes);
  return { span, busy, free, tasks: blocks.length, focus, breaks, sleep, byCategory, first, last };
}

/** Chains of blocks separated by < gapMin minutes. */
function chains(blocks, pred, gapMin = 10) {
  const out = [];
  let cur = null;
  for (const b of blocks) {
    if (!pred(b)) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    if (cur && b.start - cur.end < gapMin) {
      cur.blocks.push(b);
      cur.end = Math.max(cur.end, b.end);
    } else {
      if (cur) out.push(cur);
      cur = { start: b.start, end: b.end, blocks: [b] };
    }
  }
  if (cur) out.push(cur);
  return out;
}

const names = (list, n = 2) => {
  const t = list.slice(0, n).map((b) => '“' + b.title + '”').join(', ');
  return list.length > n ? t + ' +' + (list.length - n) : t;
};

function bestGap(blocks, from, to, need, windowStart, windowEnd) {
  const free = freeIntervals(blocks.map((b) => [b.start, b.end]), Math.max(from, windowStart ?? from), Math.min(to, windowEnd ?? to), 5);
  let best = null;
  for (const [a, b] of free) {
    if (b - a < need) continue;
    const mid = (from + to) / 2;
    const s = Math.round(Math.max(a, Math.min(b - need, mid - need / 2)) / 5) * 5;
    if (s < a || s + need > b) continue;
    const d = Math.abs(s + need / 2 - mid);
    if (!best || d < best.d) best = { start: s, end: s + need, d };
  }
  return best;
}

/**
 * @param {{blocks:object[], unplaced?:object[], settings?:object, window?:{start:number,end:number}}} input
 */
export function analyze({ blocks, unplaced = [], settings = {}, window = null }) {
  const chrono = settings.chronotype || 'balanced';
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const stats = computeStats(sorted);
  const insights = [];
  const add = (x) => insights.push(x);

  if (!sorted.length) {
    return { stats, insights, score: { total: 0, focus: 0, recovery: 0, balance: 0, realism: 1, grade: '—' } };
  }

  /* ---------- overlaps ---------- */
  let overlapCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.start >= a.end) break;
      const ov = Math.min(a.end, b.end) - b.start;
      if (ov <= 0) continue;
      overlapCount++;
      const movable = !b.readOnly ? b : !a.readOnly ? a : null;
      const anchor = movable === b ? a : b;
      // first free slot after the anchor that fits the moved block (ignoring the block itself)
      let slotStart = anchor.end;
      if (movable) {
        const others = sorted.filter((x) => x !== movable && x.kind !== 'auto').map((x) => [x.start, x.end]); // auto blocks reflow
        const len = dur(movable);
        const free = freeIntervals(others, anchor.end, Math.max(anchor.end + len, (window?.end ?? 1380) + 180), 0);
        const fit = free.find(([fa, fb]) => fb - fa >= len);
        if (fit) slotStart = fit[0];
      }
      add({
        id: 'overlap:' + a.id + ':' + b.id,
        level: 'critical',
        icon: 'clash',
        blockIds: [a.id, b.id],
        title: { en: 'Overlap: ' + a.title + ' × ' + b.title, hi: 'Clash: ' + a.title + ' × ' + b.title },
        text: {
          en: '“' + b.title + '” starts ' + fmtDuration(ov) + ' before “' + a.title + '” ends. You can’t be in two places at once.',
          hi: '“' + b.title + '” shuru ho raha hai “' + a.title + '” khatam hone se ' + fmtDuration(ov) + ' pehle. Ek time pe do kaam nahi hote bhai.',
        },
        fix: movable
          ? {
            type: 'move',
            label: { en: 'Move “' + movable.title + '” to ' + fmtTime(slotStart), hi: '“' + movable.title + '” ko ' + fmtTime(slotStart) + ' pe shift karo' },
            id: movable.id,
            start: slotStart,
            end: slotStart + dur(movable),
          }
          : null,
      });
    }
  }

  /* ---------- deep-work marathons ---------- */
  const deepChains = chains(sorted, (b) => DEEP.has(b.category) || b.category === 'meeting');
  let marathons = 0;
  for (const c of deepChains) {
    const len = c.end - c.start;
    if (len <= 120) continue;
    marathons++;
    const at = Math.round((c.start + Math.min(90, len / 2)) / 5) * 5;
    const host = c.blocks.find((b) => b.start + 15 <= at && at + 15 <= b.end && !b.readOnly);
    add({
      id: 'marathon:' + c.blocks[0].id,
      level: 'warn',
      icon: 'marathon',
      blockIds: c.blocks.map((b) => b.id),
      title: { en: fmtDuration(len) + ' of focus without a break', hi: fmtDuration(len) + ' lagatar kaam, koi break nahi' },
      text: {
        en: 'Attention fades after ~90 minutes. A 10-minute reset around ' + fmtTime(at) + ' keeps the second half sharp.',
        hi: '90 min ke baad focus girne lagta hai. ' + fmtTime(at) + ' ke aas-paas 10 min ka break le lo.',
      },
      fix: host ? { type: 'split', label: { en: 'Add a 10-min break', hi: '10 min break daal do' }, id: host.id, at, breakLen: 10 } : null,
    });
  }

  /* ---------- no breaks in a long busy stretch ---------- */
  const busyChains = chains(sorted, (b) => !RESTFUL.has(b.category));
  for (const c of busyChains) {
    if (c.end - c.start > 240 && !deepChains.some((d) => d.end - d.start > 120 && d.start < c.end && c.start < d.end)) {
      add({
        id: 'nobreak:' + c.blocks[0].id,
        level: 'warn',
        icon: 'battery',
        blockIds: c.blocks.map((b) => b.id),
        title: { en: fmtDuration(c.end - c.start) + ' back-to-back', hi: fmtDuration(c.end - c.start) + ' bina ruke' },
        text: {
          en: 'From ' + fmtTime(c.start) + ' to ' + fmtTime(c.end) + ' there is no pause longer than 10 minutes.',
          hi: fmtTime(c.start) + ' se ' + fmtTime(c.end) + ' tak ek bhi 10 min ka gap nahi hai.',
        },
        fix: null,
      });
    }
  }

  /* ---------- sleep ---------- */
  const sleepBlocks = sorted.filter((b) => b.category === 'sleep' && !/\bnap\b/i.test(b.title));
  const sleepMin = sleepBlocks.reduce((s, b) => s + dur(b), 0);
  let sleepShort = false;
  if (sleepBlocks.length && sleepMin < 420) {
    sleepShort = true;
    add({
      id: 'sleep:short',
      level: 'warn',
      icon: 'moon',
      blockIds: sleepBlocks.map((b) => b.id),
      title: { en: 'Only ' + fmtDuration(sleepMin) + ' of sleep', hi: 'Sirf ' + fmtDuration(sleepMin) + ' ki neend' },
      text: {
        en: 'Most adults need 7–9 hours. Short sleep quietly taxes tomorrow’s focus.',
        hi: '7–9 ghante chahiye. Kam neend = kal ka focus gayab.',
      },
      fix: null,
    });
  } else if (!sleepBlocks.length && stats.last > 1440 + 30) {
    add({
      id: 'sleep:none',
      level: 'tip',
      icon: 'moon',
      blockIds: [],
      title: { en: 'Your plan runs past midnight', hi: 'Plan raat 12 ke baad tak ja raha hai' },
      text: {
        en: 'There is no sleep block after ' + fmtTime(stats.last) + '. Add one so tomorrow starts on time.',
        hi: fmtTime(stats.last) + ' ke baad sone ka time bhi likh do.',
      },
      fix: null,
    });
  }

  /* ---------- meals ---------- */
  const hasMeal = (from, to, re) => sorted.some((b) => b.start < to && b.end > from && (re.test(b.title) || (b.category === 'food' && re === MEAL_WORDS.any)));
  const meals = [
    { key: 'lunch', label: 'lunch', hi: 'lunch', cover: [750, 840], look: [660, 930], place: [720, 870], re: MEAL_WORDS.lunch, len: 40 },
    { key: 'dinner', label: 'dinner', hi: 'dinner', cover: [1200, 1290], look: [1110, 1350], place: [1170, 1290], re: MEAL_WORDS.dinner, len: 40 },
  ];
  let mealsMissing = 0;
  for (const m of meals) {
    const covers = stats.first <= m.cover[0] && stats.last >= m.cover[1];
    if (!covers) continue;
    if (hasMeal(m.look[0], m.look[1], m.re) || hasMeal(m.look[0], m.look[1], MEAL_WORDS.any)) continue;
    mealsMissing++;
    const slot = bestGap(sorted, m.place[0], m.place[1] + 60, m.len, window?.start, window?.end) || bestGap(sorted, m.place[0], m.place[1] + 60, 25, window?.start, window?.end);
    add({
      id: 'meal:' + m.key,
      level: 'tip',
      icon: 'food',
      blockIds: [],
      title: { en: 'No ' + m.label + ' planned', hi: m.hi + ' ka time hi nahi hai' },
      text: {
        en: slot ? 'There’s room at ' + fmtTime(slot.start) + '. Skipping meals is how afternoons collapse.' : 'Your day covers ' + m.label + ' time but no meal is planned.',
        hi: slot ? fmtTime(slot.start) + ' pe jagah hai. Khana skip mat karo.' : m.hi + ' ke time pe kuch plan nahi hai.',
      },
      fix: slot ? { type: 'add', label: { en: 'Add ' + m.label, hi: m.hi + ' add karo' }, title: m.label, start: slot.start, end: slot.end } : null,
    });
  }

  /* ---------- overload ---------- */
  const deepMin = stats.focus;
  const overload = deepMin > 600;
  if (overload) {
    add({
      id: 'overload',
      level: 'warn',
      icon: 'flame',
      blockIds: sorted.filter((b) => DEEP.has(b.category)).map((b) => b.id),
      title: { en: fmtDuration(deepMin) + ' of deep work', hi: fmtDuration(deepMin) + ' ka heavy kaam' },
      text: {
        en: 'Beyond ~6–8 focused hours, output drops while mistakes rise. Consider moving something to tomorrow.',
        hi: '6–8 ghante ke baad quality girti hai. Kuch kal pe daal do.',
      },
      fix: null,
    });
  }

  /* ---------- energy fit ---------- */
  const dips = sorted.filter((b) => DEEP.has(b.category) && dur(b) >= 45 && avgEnergy(b.start, b.end, chrono) < 0.42);
  if (dips.length) {
    const pw = peakWindow(chrono, 90, window?.start ?? 360, window?.end ?? 1320);
    add({
      id: 'energy:dip',
      level: 'tip',
      icon: 'wave',
      blockIds: dips.map((b) => b.id),
      title: { en: 'Deep work in an energy dip', hi: 'Low energy time pe heavy kaam' },
      text: {
        en: names(dips) + ' land in a low-energy part of a typical day. Your peak window is around ' + fmtTime(pw.start) + '–' + fmtTime(pw.end) + '.',
        hi: names(dips) + ' low energy time pe hai. Peak time ' + fmtTime(pw.start) + '–' + fmtTime(pw.end) + ' ke aas-paas hai.',
      },
      fix: null,
    });
  }
  const late = sorted.filter((b) => DEEP.has(b.category) && b.end > 1410);
  if (late.length) {
    add({
      id: 'late:deep',
      level: 'tip',
      icon: 'moon',
      blockIds: late.map((b) => b.id),
      title: { en: 'Late-night deep work', hi: 'Raat ko der tak kaam' },
      text: {
        en: names(late) + ' runs past 11:30 PM. Screens + hard problems delay sleep.',
        hi: names(late) + ' 11:30 PM ke baad tak chal raha hai. Neend late hogi.',
      },
      fix: null,
    });
  }

  /* ---------- back-to-back ---------- */
  const tight = chains(sorted, () => true, 1).filter((c) => c.blocks.length >= 4);
  for (const c of tight) {
    add({
      id: 'tight:' + c.blocks[0].id,
      level: 'tip',
      icon: 'buffer',
      blockIds: c.blocks.map((b) => b.id),
      title: { en: c.blocks.length + ' blocks with zero buffer', hi: c.blocks.length + ' kaam ekdum chipke hue' },
      text: {
        en: 'Transitions take time. A 5-minute buffer between blocks stops one delay from sinking the rest.',
        hi: 'Beech mein 5 min ka buffer rakho, warna ek delay sab bigaad dega.',
      },
      fix: null,
    });
  }

  /* ---------- movement ---------- */
  const awake = sorted.filter((b) => b.category !== 'sleep');
  const awakeSpan = awake.length ? Math.max(...awake.map((b) => b.end)) - Math.min(...awake.map((b) => b.start)) : 0;
  const moves = sorted.some((b) => b.category === 'fitness');
  if (awakeSpan >= 480 && !moves) {
    const slot = bestGap(sorted, 1020, 1260, 20, window?.start, window?.end) || bestGap(sorted, stats.first, stats.last, 20, window?.start, window?.end);
    add({
      id: 'move',
      level: 'tip',
      icon: 'walk',
      blockIds: [],
      title: { en: 'No movement planned', hi: 'Body ke liye kuch nahi' },
      text: {
        en: 'Even a 20-minute walk lifts energy for the next few hours.' + (slot ? ' Free at ' + fmtTime(slot.start) + '.' : ''),
        hi: '20 min ki walk bhi energy wapas la deti hai.' + (slot ? ' ' + fmtTime(slot.start) + ' pe free ho.' : ''),
      },
      fix: slot ? { type: 'add', label: { en: 'Add a 20-min walk', hi: '20 min walk add karo' }, title: 'walk', start: slot.start, end: slot.start + 20 } : null,
    });
  }

  /* ---------- unplaced ---------- */
  for (const u of unplaced) {
    add({
      id: 'unplaced:' + u.id,
      level: 'warn',
      icon: 'tray',
      blockIds: [],
      title: { en: 'Couldn’t fit “' + u.title + '”', hi: '“' + u.title + '” fit nahi hua' },
      text: { en: u.reason + '.', hi: u.reason + '. Kuch aur chhota karo ya window badhao.' },
      fix: null,
    });
  }

  /* ---------- free time ---------- */
  if (stats.free >= 120) {
    add({
      id: 'free',
      level: 'good',
      icon: 'sun',
      blockIds: [],
      title: { en: fmtDuration(stats.free) + ' of open time', hi: fmtDuration(stats.free) + ' free time' },
      text: {
        en: 'Unclaimed time is a feature, not a bug — or type a task with a duration (e.g. “read 30m”) and the engine will fit it in.',
        hi: 'Free time bhi zaroori hai — ya “read 30m” likho, engine khud fit kar dega.',
      },
      fix: null,
    });
  }

  const guessed = sorted.filter((b) => b.guessed);
  if (guessed.length) {
    add({
      id: 'guessed',
      level: 'info',
      icon: 'question',
      blockIds: guessed.map((b) => b.id),
      title: { en: 'AM/PM guessed for ' + guessed.length + ' block' + (guessed.length > 1 ? 's' : ''), hi: guessed.length + ' jagah AM/PM guess kiya' },
      text: {
        en: 'Blocks marked “?” were read from context. Tap the “?” to flip, or write am/pm.',
        hi: '“?” wale blocks context se samjhe gaye hain. “?” dabao ya am/pm likh do.',
      },
      fix: null,
    });
  }

  /* ---------- score ---------- */
  // Focus: deep minutes vs a span-scaled target, weighted by energy fit, minus marathons.
  const target = Math.max(30, Math.min(240, 0.4 * awakeSpan));
  let quality = 1;
  if (deepMin > 0) {
    const deepBlocks = sorted.filter((b) => DEEP.has(b.category));
    let wsum = 0;
    for (const b of deepBlocks) wsum += clamp01(avgEnergy(b.start, b.end, chrono) / 0.6) * dur(b);
    quality = wsum / deepMin;
  }
  const focusScore = deepMin === 0 ? 55 : Math.round(100 * clamp01((Math.min(1, deepMin / target) * 0.55 + quality * 0.45) - marathons * 0.12));

  // Recovery: breaks per 90 busy minutes + sleep adequacy − meals.
  const busyNonRest = sorted.filter((b) => !RESTFUL.has(b.category)).reduce((s, b) => s + dur(b), 0);
  const needBreaks = Math.floor(busyNonRest / 90);
  const gaps = computeGaps(sorted, 10);
  const haveBreaks = gaps.length + sorted.filter((b) => b.category === 'break' || b.category === 'food').length;
  const breakRatio = needBreaks === 0 ? 1 : clamp01(haveBreaks / needBreaks);
  const coversNight = stats.last >= 1380 || sleepBlocks.length > 0;
  const sleepFactor = coversNight ? clamp01(sleepMin / 450) : null;
  let recovery = sleepFactor == null ? breakRatio : 0.6 * breakRatio + 0.4 * sleepFactor;
  recovery = Math.round(100 * clamp01(recovery - mealsMissing * 0.1));

  // Balance: life areas covered vs expected for the span, minus work dominance.
  const areas = new Set(sorted.map((b) => LIFE_AREAS[b.category]).filter(Boolean));
  const expected = awakeSpan < 240 ? 2 : awakeSpan < 480 ? 3 : 4;
  const workShare = awakeSpan ? sorted.filter((b) => LIFE_AREAS[b.category] === 'work').reduce((s, b) => s + dur(b), 0) / awakeSpan : 0;
  const balance = Math.round(100 * clamp01(Math.min(1, areas.size / expected) - (workShare > 0.75 ? 0.2 : 0)));

  const realism = Math.max(0.4, 1 - 0.12 * overlapCount - 0.08 * unplaced.length - (overload ? 0.1 : 0) - (sleepShort ? 0.05 : 0));
  const total = Math.round(((focusScore + recovery + balance) / 3) * realism);
  const grade = total >= 85 ? 'Engineered' : total >= 70 ? 'Solid' : total >= 50 ? 'Needs tuning' : 'Overloaded';

  if (!insights.some((i) => i.level === 'critical' || i.level === 'warn')) {
    add({
      id: 'good',
      level: 'good',
      icon: 'check',
      blockIds: [],
      title: { en: 'Clean plan', hi: 'Ekdum mast plan' },
      text: { en: 'No conflicts, no marathons. Go live with Focus mode when you start.', hi: 'Koi clash nahi, koi marathon nahi. Shuru karte hi Focus mode on karo.' },
      fix: null,
    });
  }

  const order = { critical: 0, warn: 1, tip: 2, info: 3, good: 4 };
  insights.sort((a, b) => order[a.level] - order[b.level]);

  return {
    stats,
    insights,
    score: {
      total,
      focus: focusScore,
      recovery,
      balance,
      realism,
      grade,
      detail: { deepMin, target, marathons, needBreaks, haveBreaks, sleepMin, areas: [...areas], expected, overlapCount },
    },
  };
}
