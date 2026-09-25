/**
 * The Kypzer pipeline: text → parse → resolve → (+routine) → schedule → analyze.
 * Plus `editPlan`, which turns visual edits (drag, resize, fixes, running-late) into text edits
 * while keeping every untouched block exactly where it was.
 */
import { parse } from './parser.js';
import { resolve } from './resolver.js';
import { schedule } from './scheduler.js';
import { analyze, computeGaps } from './analyzer.js';
import { DAY, mod } from './time.js';
import { applyEdits, canonicalLine, mapOffset, ownLine, removalRange, separatorFor } from './format.js';
import { categorize, categoryInfo } from './lexicon.js';

export const DEFAULT_SETTINGS = {
  clock: '12h',
  chronotype: 'balanced',
  dayStart: 420,
  dayEnd: 1380,
  tone: 'en',
  fromNow: true,
  routine: true,
};

const ceil5 = (v) => Math.ceil(v / 5) * 5;

/**
 * @param {{text:string, settings?:object, routine?:object[], nowMinute?:number|null}} input
 * nowMinute: minutes since midnight when the plan is for today (flex tasks are not placed in the past).
 */
export function buildPlan({ text = '', settings = {}, routine = [], nowMinute = null }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const { entries, tokens } = parse(text);
  const { fixed, flex } = resolve(entries);
  const allFixed = [...fixed, ...routine.map((r) => ({ ...r }))];
  let ws = s.dayStart;
  const we = s.dayEnd;
  if (nowMinute != null && s.fromNow) ws = Math.max(ws, ceil5(nowMinute));
  const { placed, unplaced } = schedule(allFixed, flex, { windowStart: ws, windowEnd: we, chronotype: s.chronotype });
  const blocks = [...allFixed, ...placed].sort((a, b) => a.start - b.start || a.end - b.end);
  const gaps = computeGaps(blocks, 1);
  const analysis = analyze({ blocks, unplaced, settings: s, window: { start: ws, end: we } });
  return { text, entries, tokens, fixed, flex, blocks, gaps, unplaced, analysis, window: { start: ws, end: we }, settings: s };
}

/** Timeline items: blocks and free gaps in order. */
export function timelineItems(plan) {
  const items = plan.blocks.map((b) => ({ type: 'block', block: b, start: b.start, end: b.end }));
  for (const g of plan.gaps) items.push({ type: 'gap', start: g.start, end: g.end });
  return items.sort((a, b) => a.start - b.start || (a.type === 'gap' ? 1 : -1));
}

/** Current / next blocks at a minute. */
export function nowState(plan, minute) {
  const blocks = plan.blocks;
  const current = blocks.filter((b) => b.start <= minute && minute < b.end);
  const next = blocks.find((b) => b.start > minute) || null;
  const prev = [...blocks].reverse().find((b) => b.end <= minute) || null;
  return { current, next, prev };
}

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Apply visual changes to the text.
 * change types:
 *   {type:'move', id, start, end}           reschedule / resize (pins auto blocks too)
 *   {type:'flip', id}                       toggle AM/PM
 *   {type:'split', id, at, breakLen}        split with a break
 *   {type:'add', title, start, end}         insert a new block line
 *   {type:'remove', id}
 *   {type:'rename', id, title}
 *   {type:'shift', ids, delta}              move several blocks (running late)
 * @returns {{text:string, changedIds:string[]}}
 */
export function editPlan(text, changes, ctx = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(ctx.settings || {}) };
  const clock = settings.clock;
  const build = (t) => buildPlan({ text: t, settings, routine: ctx.routine || [], nowMinute: ctx.nowMinute ?? null });
  const p0 = build(text);
  const byId = new Map(p0.blocks.map((b) => [b.id, b]));
  const edits = [];
  const touched = new Set();
  const inserts = [];

  const replaceBlock = (b, line) => {
    edits.push({ s: b.srcS, e: b.srcE, text: line });
    touched.add(b.id);
  };

  for (const ch of changes) {
    if (ch.type === 'add') {
      inserts.push(ch);
      continue;
    }
    if (ch.type === 'shift') {
      for (const id of ch.ids) {
        const b = byId.get(id);
        if (!b || b.readOnly || b.srcS == null) continue;
        replaceBlock(b, canonicalLine({ ...b, start: b.start + ch.delta, end: b.end + ch.delta }, clock));
      }
      continue;
    }
    const b = byId.get(ch.id);
    if (!b || b.readOnly || b.srcS == null) continue;
    if (ch.type === 'move') {
      const start = Math.round(ch.start);
      const end = Math.max(start + 5, Math.round(ch.end));
      replaceBlock(b, canonicalLine({ ...b, start, end }, clock));
    } else if (ch.type === 'rename') {
      const title = String(ch.title || '').replace(/[\n,;|]/g, ' ').trim() || b.title;
      replaceBlock(b, canonicalLine({ ...b, title }, clock));
    } else if (ch.type === 'flip') {
      const v = mod(b.start, DAY);
      const delta = v < 720 ? 720 : -720;
      replaceBlock(b, canonicalLine({ ...b, start: b.start + delta, end: b.end + delta }, clock));
    } else if (ch.type === 'split') {
      const at = Math.round(ch.at);
      const len = ch.breakLen || 10;
      if (at <= b.start || at >= b.end) continue;
      const sep = ownLine(text, b.srcS, b.srcE) ? '\n' : ', ';
      const first = canonicalLine({ ...b, end: at }, clock);
      const brk = canonicalLine({ start: at, end: at + len, title: 'break' }, clock);
      const second = canonicalLine({ ...b, start: at + len, end: Math.max(at + len + 5, b.end + len) }, clock);
      replaceBlock(b, [first, brk, second].join(sep));
    } else if (ch.type === 'remove') {
      const r = removalRange(text, b.srcS, b.srcE);
      edits.push({ s: r.s, e: r.e, text: '' });
      touched.add(b.id);
    }
  }

  // insertions: after the last text block that starts before the new block
  for (const ins of inserts) {
    const line = canonicalLine({ start: ins.start, end: ins.end, title: ins.title || 'new block' }, clock);
    const anchors = p0.blocks.filter((b) => b.srcS != null && !b.readOnly && b.start <= ins.start);
    const anchor = anchors.length ? anchors.reduce((a, b) => (b.srcE > a.srcE ? b : a)) : null;
    const sep = separatorFor(text);
    if (!text.trim()) edits.push({ s: 0, e: text.length, text: line });
    else if (anchor) {
      // insert after the anchor's line end when it sits on its own line
      if (sep === '\n') {
        const nl = text.indexOf('\n', anchor.srcE);
        const pos = nl === -1 ? text.length : nl;
        edits.push({ s: pos, e: pos, text: '\n' + line });
      } else edits.push({ s: anchor.srcE, e: anchor.srcE, text: sep + line });
    } else {
      edits.push({ s: 0, e: 0, text: line + sep });
    }
  }

  if (!edits.length) return { text, changedIds: [] };
  const first = dedupeEdits(edits);
  let out = applyEdits(text, first);

  // Freeze: untouched fixed blocks must not move because their neighbours changed
  // (an ambiguous "9 to 11" re-resolves against a new cursor). Pin them with explicit times.
  const tracked = p0.blocks
    .filter((b) => !b.readOnly && b.kind === 'fixed' && !b.seq && !touched.has(b.id) && b.srcS != null)
    .map((b) => ({ b, pos: mapOffset(b.srcS, first) }));
  for (let pass = 0; pass < 3; pass++) {
    const p = build(out);
    const bySrc = new Map(p.blocks.filter((x) => x.srcS != null).map((x) => [x.srcS, x]));
    const fixes = [];
    for (const t of tracked) {
      const nb = bySrc.get(t.pos);
      if (nb && (nb.start !== t.b.start || nb.end !== t.b.end)) {
        fixes.push({ s: nb.srcS, e: nb.srcE, text: canonicalLine({ ...nb, start: t.b.start, end: t.b.end }, clock) });
      }
    }
    if (!fixes.length) break;
    out = applyEdits(out, fixes);
    for (const t of tracked) t.pos = mapOffset(t.pos, fixes);
  }
  return { text: out, changedIds: [...touched] };
}

function dedupeEdits(edits) {
  // keep the first edit per exact range, drop later overlapping ones
  const kept = [];
  for (const e of edits) {
    if (kept.some((k) => e.s < k.e && k.s < e.e && !(e.s === e.e || k.s === k.e))) continue;
    kept.push(e);
  }
  return kept;
}

/** Build a draft block from a title typed in the grid. */
export function draftBlock(title, start, end) {
  const category = categorize(title);
  const info = categoryInfo(category, title);
  return { title, start, end, category, color: info.color };
}
