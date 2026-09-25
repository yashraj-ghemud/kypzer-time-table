/**
 * Kypzer NLP parser.
 *
 * Turns free text such as
 *   "3:45pm : come to room, 3:50 to 5 pm : work, subah 7 baje gym, study 2h, report 1h before 6pm !"
 * into entries with time atoms, durations, constraints and a clean title.
 * Every recognised piece keeps its character span so the editor can highlight it and the
 * engine can rewrite exactly that line later. No AM/PM decisions are made here (see resolver.js).
 */
import { categorize } from './lexicon.js';

/* ------------------------------------------------------------------ */
/* Day tokens (week mode)                                              */
/* ------------------------------------------------------------------ */

const DAY_WORDS = [
  ['mon|monday|mondays|somvar|somvaar|somwar', 0],
  ['tue|tues|tuesday|tuesdays|mangalvar|mangalwar|mangalvaar', 1],
  ['wed|weds|wednesday|wednesdays|budhvar|budhwar|budhvaar', 2],
  ['thu|thur|thurs|thursday|thursdays|guruvar|guruwar|veervar|brihaspativar', 3],
  ['fri|friday|fridays|shukravar|shukrawar|shukravaar', 4],
  ['sat|saturday|saturdays|shanivar|shaniwar|shanivaar', 5],
  ['sun|sunday|sundays|ravivar|raviwar|itwar|itvaar|itvar', 6],
];
const DAY_MAP = new Map();
for (const [alts, idx] of DAY_WORDS) for (const w of alts.split('|')) DAY_MAP.set(w, idx);
const DAY_ALT = DAY_WORDS.map(([w]) => w).join('|');
const DAY_GROUP_ALT = 'weekdays|weekday|weekends|weekend|daily|everyday|every\\s+day|roz|rozana|roj|all\\s+days';

function dayGroup(word) {
  const w = word.replace(/\s+/g, ' ');
  if (w.startsWith('weekday')) return [0, 1, 2, 3, 4];
  if (w.startsWith('weekend')) return [5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

/* ------------------------------------------------------------------ */
/* Regexes (applied to the lower-cased segment)                        */
/* ------------------------------------------------------------------ */

const FRAC_ALT = 'sadhe|saadhe|saade|sade|paune|paun|sava|sawa|savva';
const TIME_RE = new RegExp(
  '(^|[^a-z0-9:.])' +
  '(?:(' + FRAC_ALT + ')\\s+)?' +
  '(\\d{1,2})(?:[:.](\\d{2}))?' +
  '(?:\\s*(a\\.m\\.?|p\\.m\\.?|am|pm)|(a|p))?' +
  '(?:\\s*(baje|bje|baj|o\'?\\s?clock))?' +
  '(?![a-z0-9]|[:.]\\d)',
  'gi',
);
const SPECIAL_TIME_RE = /(^|[^a-z0-9])(12\s*noon|noon|midday|12\s*midnight|midnight|dopahar\s*12)(?![a-z])/gi;
const HINDI_HALF_TIME_RE = /(^|[^a-z])(dedh|derh|dhai|dhaai|dhaayi|adhai)\s*(baje|bje)(?![a-z])/gi;

const UNIT_H = '(?:hours|hour|hrs|hr|h|ghanton|ghanto|ghante|ghanta|ghnte)';
const UNIT_M = '(?:minutes|minute|mins|min|minat|mint|mnt|m)';
const DUR_HM_RE = new RegExp(
  '(^|[^a-z0-9.:])((?:for|of|about|approx|around|~)\\s*)?(\\d+(?:\\.\\d+)?)\\s*' + UNIT_H +
  '(?:\\s*(?:and\\s*)?(\\d{1,2})\\s*' + UNIT_M + '|(\\d{2}))?(?![a-z0-9])',
  'gi',
);
const DUR_M_RE = new RegExp('(^|[^a-z0-9.:])((?:for|of|about|approx|around|~)\\s*)?(\\d{1,3})\\s*' + UNIT_M + '(?![a-z0-9])', 'gi');
const DUR_WORD_RE = new RegExp(
  '(^|[^a-z0-9])((?:for|of)\\s+)?(' +
  'half an hour|half hour|an hour|a hour|one hour|quarter of an hour|quarter hour|' +
  '(?:aadha|adha|aadhe|aadhi|adhe)\\s*(?:ghanta|ghante|hour)|' +
  '(?:dedh|derh|dhai|dhaai|adhai|sava|sawa|paun|paune|pauna)\\s*(?:ghanta|ghante|ghanton|hours|hour)|' +
  '(?:sadhe|saadhe|saade|sade)\\s*\\d{1,2}\\s*(?:ghanta|ghante|ghanton|hours|hour)' +
  ')(?![a-z0-9])',
  'gi',
);

const DAYPART_RE = /(^|[^a-z])(in the morning|in the afternoon|in the evening|at night|tonight|this morning|this afternoon|this evening|morning|afternoon|evening|night|subah|subha|savere|sawere|dopahar|dopehar|dupahar|dophar|shaam|sham|raat)(?![a-z])/gi;
const PRIO_WORD_RE = /(^|[^a-z0-9])(urgent|asap|important|imp|zaroori|zaruri|jaruri|high priority|top priority|\(high\)|\(p1\)|p1)(?![a-z0-9])/gi;
const PRIO_BANG_RE = /!{1,3}/g;

const DAYS_RE = new RegExp(
  '(^|[^a-z])(?:every\\s+)?(' + DAY_GROUP_ALT + '|(?:' + DAY_ALT + ')(?:\\s*(?:-|–|—|to|through|thru)\\s*(?:' + DAY_ALT + '))?)(?![a-z])',
  'gi',
);
const DAY_JOIN_RE = /^[\s,/&+]*(?:and\s*)?[\s,/&+]*$/;

const RANGE_CONN_RE = /^\s*(to|till|until|untill|upto|up\s+to|through|thru|-+|–|—|~|se|and)\s*$/;
const PREFIX_RE = /(^|[^a-z])(before|by|till|until|untill|upto|up\s+to|after|since|from|between|at|@)\s*$/;
const SUFFIX_RE = /^\s*(se\s+pehle|se\s+pahle|se\s+phele|pehle|ke\s+baad\s+se|ke\s+baad|ke\s+bad|baad|tak|se)(?![a-z])/;
const RANGE_TAIL_RE = /^\s*(?:baje\s+)?tak(?![a-z])/;

const DAYPART_OF = {
  morning: 'morning', 'in the morning': 'morning', 'this morning': 'morning', subah: 'morning', subha: 'morning',
  savere: 'morning', sawere: 'morning',
  afternoon: 'afternoon', 'in the afternoon': 'afternoon', 'this afternoon': 'afternoon', dopahar: 'afternoon',
  dopehar: 'afternoon', dupahar: 'afternoon', dophar: 'afternoon',
  evening: 'evening', 'in the evening': 'evening', 'this evening': 'evening', shaam: 'evening', sham: 'evening',
  night: 'night', 'at night': 'night', tonight: 'night', raat: 'night',
};
const DAYPART_KEEP_IN_TITLE = new Set(['morning', 'afternoon', 'evening', 'night']);

const FRAC_OF = { sadhe: 30, saadhe: 30, saade: 30, sade: 30, sava: 15, sawa: 15, savva: 15, paune: -15, paun: -15 };

/* ------------------------------------------------------------------ */
/* Segmentation                                                        */
/* ------------------------------------------------------------------ */

const BULLET_RE = /^(?:\s*(?:[-•*·>]+|\d{1,2}[.)](?=\s))\s*)+/;
const SEQ_SPLIT_RE = /\s+(?:and\s+then|then|phir|fir|uske\s+baad|after\s+that)\s+/gi;
const SEQ_LEAD_RE = /^(?:and\s+then|then|phir|fir|uske\s+baad|after\s+that)\s+/i;
const DAY_BEFORE_RE = new RegExp('(?:^|[^a-z])(?:' + DAY_ALT + ')\\s*$', 'i');
const DAY_AFTER_RE = new RegExp('^\\s*(?:' + DAY_ALT + ')(?![a-z])', 'i');

/** Split text into segments with absolute offsets. Commas inside day lists ("mon, wed") and numbers stay. */
export function splitSegments(text) {
  const raw = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (i < text.length && ch !== '\n' && ch !== ';' && ch !== ',' && ch !== '|') continue;
    if (ch === ',') {
      if (/\d/.test(text[i - 1] || '') && /\d{3}/.test(text.slice(i + 1, i + 4))) continue;
      if (DAY_BEFORE_RE.test(text.slice(Math.max(0, i - 14), i)) && DAY_AFTER_RE.test(text.slice(i + 1, i + 16))) continue;
    }
    raw.push([start, i]);
    start = i + 1;
  }
  const out = [];
  for (const [s0, e0] of raw) {
    // sub-split on "then"/"phir"
    const piece = text.slice(s0, e0);
    const cuts = [];
    SEQ_SPLIT_RE.lastIndex = 0;
    let m;
    while ((m = SEQ_SPLIT_RE.exec(piece))) cuts.push([m.index, m.index + m[0].length]);
    let cursor = 0;
    const parts = [];
    for (const [a, b] of cuts) {
      parts.push([cursor, a, parts.length > 0]);
      cursor = b;
    }
    parts.push([cursor, piece.length, parts.length > 0]);
    for (const [a, b, seqFromSplit] of parts) {
      let s = s0 + a;
      let e = s0 + b;
      const bm = BULLET_RE.exec(text.slice(s, e));
      if (bm) s += bm[0].length;
      while (s < e && /\s/.test(text[s])) s++;
      while (e > s && /\s/.test(text[e - 1])) e--;
      if (e <= s) continue;
      let seq = seqFromSplit;
      const lead = SEQ_LEAD_RE.exec(text.slice(s, e));
      let leadLen = 0;
      if (lead) {
        seq = true;
        leadLen = lead[0].length;
      }
      out.push({ s, e, seq, leadLen });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Token scanning                                                      */
/* ------------------------------------------------------------------ */

function each(re, str, fn) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(str))) {
    fn(m);
    if (m[0].length === 0) re.lastIndex++;
  }
}

function hindiHalf(word) {
  return /^(dedh|derh)$/.test(word) ? { h: 1, m: 30 } : { h: 2, m: 30 };
}

function wordDuration(w) {
  w = w.replace(/\s+/g, ' ').trim();
  if (/^(half an hour|half hour)$/.test(w)) return 30;
  if (/^(an hour|a hour|one hour)$/.test(w)) return 60;
  if (/^quarter/.test(w)) return 15;
  if (/^(aadha|adha|aadhe|aadhi|adhe)/.test(w)) return 30;
  if (/^(dedh|derh)/.test(w)) return 90;
  if (/^(dhai|dhaai|adhai)/.test(w)) return 150;
  if (/^(sava|sawa)/.test(w)) return 75;
  if (/^(paun|paune|pauna)/.test(w)) return 45;
  const m = /^(?:sadhe|saadhe|saade|sade)\s*(\d{1,2})/.exec(w);
  if (m) return +m[1] * 60 + 30;
  return null;
}

/** Scan time atoms and durations, resolving overlaps in favour of the longer match. */
function scanCore(lower) {
  const cands = [];
  each(TIME_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const frac = m[2] ? m[2].toLowerCase() : null;
    let h = +m[3];
    let mi = m[4] != null ? +m[4] : 0;
    const periodRaw = (m[5] || m[6] || '').replace(/\./g, '');
    const period = periodRaw ? (periodRaw[0] === 'a' ? 'am' : 'pm') : null;
    const baje = !!m[7];
    if (mi > 59 || h > 24) return;
    if (frac) {
      if (m[4] != null) return; // "sadhe 3:15" makes no sense
      const d = FRAC_OF[frac];
      if (d < 0) {
        h = h - 1 < 0 ? 23 : h - 1;
        if (h === 0 && +m[3] === 1) h = 12; // paune 1 → 12:45
        mi = 60 + d;
      } else mi = d;
    }
    const hourStr = m[3];
    let is24 = false;
    let per = period;
    if (h === 24) {
      h = 0;
      is24 = true;
      per = null;
    } else if (h > 12) {
      is24 = true;
      per = null;
    } else if (h === 0 || (hourStr.length === 2 && hourStr[0] === '0' && m[4] != null)) {
      is24 = true;
      per = null;
    }
    const bare = !frac && m[4] == null && !period && !baje;
    cands.push({ kind: 'time', s, e, h, m: mi, period: per, is24, baje, bare, special: false });
  });
  each(SPECIAL_TIME_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const w = m[2];
    const mid = /midnight/.test(w);
    cands.push({ kind: 'time', s, e, h: mid ? 0 : 12, m: 0, period: mid ? null : 'pm', is24: mid, baje: false, bare: false, special: true });
  });
  each(HINDI_HALF_TIME_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const { h, m: mi } = hindiHalf(m[2]);
    cands.push({ kind: 'time', s, e, h, m: mi, period: null, is24: false, baje: true, bare: false, special: false });
  });
  each(DUR_HM_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const hours = parseFloat(m[3]);
    const extra = m[4] != null ? +m[4] : m[5] != null ? +m[5] : 0;
    const mins = Math.round(hours * 60 + extra);
    if (mins <= 0 || mins > 24 * 60) return;
    cands.push({ kind: 'dur', s, e, mins });
  });
  each(DUR_M_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const mins = +m[3];
    if (mins <= 0 || mins > 24 * 60) return;
    cands.push({ kind: 'dur', s, e, mins });
  });
  each(DUR_WORD_RE, lower, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const mins = wordDuration(m[3]);
    if (mins) cands.push({ kind: 'dur', s, e, mins });
  });
  // longest match wins on overlap
  cands.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const kept = [];
  for (const c of cands) {
    let clash = -1;
    for (let i = 0; i < kept.length; i++) {
      if (c.s < kept[i].e && kept[i].s < c.e) {
        clash = i;
        break;
      }
    }
    if (clash === -1) kept.push(c);
    else if (c.e - c.s > kept[clash].e - kept[clash].s) kept[clash] = c;
  }
  kept.sort((a, b) => a.s - b.s);
  return kept;
}

/* ------------------------------------------------------------------ */
/* Segment → entry                                                     */
/* ------------------------------------------------------------------ */

const LEAD_FILLER_RE = /^(?:at|from|for|to|on|se|tak|baje|ko|ka|ki|then|phir|and|&|with|till|until|by|before|after)\b\s*/i;
const TRAIL_FILLER_RE = /\s*\b(?:at|from|for|to|on|se|tak|baje|ko|hai|and|&|till|until|by|before|after)$/i;
const EDGE_PUNCT_RE = /^[\s:–—\-@,.;|>=~]+|[\s:–—\-@,.;|>=~]+$/g;

function cleanTitle(t) {
  let prev;
  t = t.replace(/\s+/g, ' ');
  do {
    prev = t;
    t = t.replace(EDGE_PUNCT_RE, '');
    t = t.replace(LEAD_FILLER_RE, '');
    t = t.replace(TRAIL_FILLER_RE, '');
  } while (t !== prev);
  return t.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
}

function parseSegment(text, seg, mode, index) {
  const raw = text.slice(seg.s, seg.e);
  const lower = raw.toLowerCase();
  const base = seg.s;
  const hl = []; // highlight tokens (relative)
  const remove = new Uint8Array(raw.length);
  const cut = (s, e) => {
    for (let i = Math.max(0, s); i < Math.min(raw.length, e); i++) remove[i] = 1;
  };
  if (seg.leadLen) {
    cut(0, seg.leadLen);
    hl.push({ s: 0, e: seg.leadLen, type: 'kw' });
  }

  // --- days (week mode) ---
  let days = null;
  if (mode === 'week') {
    const found = [];
    each(DAYS_RE, lower, (m) => {
      const s = m.index + m[1].length;
      const e = m.index + m[0].length;
      const word = m[2];
      let set;
      const rangeM = new RegExp('^(' + DAY_ALT + ')\\s*(?:-|–|—|to|through|thru)\\s*(' + DAY_ALT + ')$').exec(word);
      if (rangeM) {
        const a = DAY_MAP.get(rangeM[1]);
        const b = DAY_MAP.get(rangeM[2]);
        set = [];
        for (let i = a; ; i = (i + 1) % 7) {
          set.push(i);
          if (i === b || set.length > 7) break;
        }
      } else if (DAY_MAP.has(word)) set = [DAY_MAP.get(word)];
      else set = dayGroup(word);
      found.push({ s, e, set });
    });
    // keep only a leading/trailing cluster of day tokens joined by commas/and/&
    if (found.length) {
      const cluster = [found[0]];
      for (let i = 1; i < found.length; i++) {
        if (DAY_JOIN_RE.test(lower.slice(found[i - 1].e, found[i].s))) cluster.push(found[i]);
        else break;
      }
      const all = new Set();
      for (const f of cluster) f.set.forEach((d) => all.add(d));
      days = [...all].sort((a, b) => a - b);
      const cs = cluster[0].s;
      const ce = cluster[cluster.length - 1].e;
      // include "every " prefix inside s already; cut cluster incl. joiners
      cut(cs, ce);
      for (const f of cluster) hl.push({ s: f.s, e: f.e, type: 'day' });
      // blank the region so time scanning does not see day text
    }
  }

  // --- time atoms + durations ---
  let masked = lower;
  if (days) {
    masked = lower.split('').map((c, i) => (remove[i] ? ' ' : c)).join('');
  }
  const core = scanCore(masked);
  const atoms = core.filter((c) => c.kind === 'time');
  const durs = core.filter((c) => c.kind === 'dur');

  // --- dayparts ---
  const dayparts = [];
  each(DAYPART_RE, masked, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const w = m[2].replace(/\s+/g, ' ');
    // don't treat words inside time/duration spans
    if (core.some((c) => s < c.e && c.s < e)) return;
    dayparts.push({ s, e, part: DAYPART_OF[w], keep: DAYPART_KEEP_IN_TITLE.has(w) });
  });

  // --- ranges ---
  const used = new Set();
  let range = null;
  for (let i = 0; i + 1 < atoms.length && !range; i++) {
    const A = atoms[i];
    const B = atoms[i + 1];
    const between = masked.slice(A.e, B.s);
    const cm = RANGE_CONN_RE.exec(between);
    if (!cm) continue;
    const pre = PREFIX_RE.exec(masked.slice(0, A.s));
    const conn = cm[1];
    if (conn === 'and' && !(pre && pre[2] === 'between')) continue;
    let rs = A.s;
    if (pre && (pre[2] === 'from' || pre[2] === 'between' || pre[2] === 'at' || pre[2] === '@')) rs = A.s - (masked.slice(0, A.s).length - pre.index - pre[1].length);
    let re = B.e;
    const tail = RANGE_TAIL_RE.exec(masked.slice(B.e));
    if (tail) re = B.e + tail[0].length;
    range = { start: A, end: B, s: rs, e: re };
    used.add(A);
    used.add(B);
    cut(rs, re);
    hl.push({ s: A.s, e: A.e, type: 'time' }, { s: B.s, e: B.e, type: 'time' });
    if (rs < A.s) hl.push({ s: rs, e: A.s, type: 'kw' });
    hl.push({ s: A.e, e: B.s, type: 'kw' });
    if (re > B.e) hl.push({ s: B.e, e: re, type: 'kw' });
  }

  // --- single atoms with prefixes/suffixes ---
  let start = range ? range.start : null;
  let end = range ? range.end : null;
  let deadline = null;
  let earliest = null;
  let untilAtom = null;
  let untilIsDeadline = false;
  const warnings = [];
  const firstContentIdx = (() => {
    let i = 0;
    while (i < raw.length && (remove[i] || /\s/.test(raw[i]))) i++;
    return i;
  })();

  for (const A of atoms) {
    if (used.has(A)) continue;
    const before = masked.slice(0, A.s);
    const pre = PREFIX_RE.exec(before);
    const suf = SUFFIX_RE.exec(masked.slice(A.e));
    const preWord = pre ? pre[2].replace(/\s+/g, ' ') : null;
    const sufWord = suf ? suf[1].replace(/\s+/g, ' ') : null;
    const nearDaypart = dayparts.some((d) => Math.abs(d.e - A.s) <= 2 || Math.abs(A.e - d.s) <= 2);
    const atStart = A.s <= firstContentIdx || /^[\s:\-–—]*$/.test(masked.slice(firstContentIdx, A.s));
    const followedBySep = /^\s*[:\-–—]/.test(masked.slice(A.e)) && !/^\s*[:\-–—]\s*\d/.test(masked.slice(A.e));
    const valid = !A.bare || A.special || pre || suf || nearDaypart || atStart || followedBySep;
    if (!valid) continue;
    let role = 'start';
    if (preWord === 'before' || preWord === 'by' || sufWord === 'se pehle' || sufWord === 'se pahle' || sufWord === 'se phele' || sufWord === 'pehle') role = 'deadline';
    else if (preWord === 'after' || preWord === 'since' || (sufWord && /baad/.test(sufWord))) role = 'after';
    else if (preWord === 'till' || preWord === 'until' || preWord === 'untill' || preWord === 'upto' || preWord === 'up to' || sufWord === 'tak') role = 'until';

    let s = A.s;
    let e = A.e;
    if (pre) s = before.length - (before.length - pre.index - pre[1].length);
    if (suf && role !== 'start') e = A.e + suf[0].length;
    else if (suf && sufWord === 'se') e = A.e + suf[0].length;

    if (role === 'start') {
      if (start) {
        warnings.push('extra-time');
        continue;
      }
      start = A;
    } else if (role === 'deadline') {
      if (deadline) continue;
      deadline = A;
    } else if (role === 'after') {
      if (earliest) continue;
      earliest = A;
    } else if (role === 'until') {
      if (untilAtom) continue;
      untilAtom = A;
    }
    used.add(A);
    cut(s, e);
    hl.push({ s: A.s, e: A.e, type: role === 'start' ? 'time' : 'cons' });
    if (s < A.s) hl.push({ s, e: A.s, type: 'kw' });
    if (e > A.e) hl.push({ s: A.e, e, type: 'kw' });
  }

  // --- duration ---
  let duration = null;
  for (const d of durs) {
    if (duration == null) duration = d.mins;
    cut(d.s, d.e);
    hl.push({ s: d.s, e: d.e, type: 'dur' });
  }

  if (untilAtom && !start) {
    if (duration != null) {
      untilIsDeadline = true;
    }
  } else if (untilAtom && start && !end) {
    end = untilAtom; // "from 5 till 7" written with a stray word in between
    untilAtom = null;
  }
  if (untilIsDeadline) {
    deadline = deadline || untilAtom;
    untilAtom = null;
  }

  // --- dayparts: attach + strip ---
  let daypart = null;
  for (const d of dayparts) {
    if (!daypart) daypart = d.part;
    if (!d.keep) cut(d.s, d.e);
    hl.push({ s: d.s, e: d.e, type: 'daypart' });
  }
  const partFor = (atom) => {
    if (!atom || !dayparts.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const d of dayparts) {
      const dist = d.e <= atom.s ? atom.s - d.e : d.s >= atom.e ? d.s - atom.e + 0.5 : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = d.part;
      }
    }
    return best;
  };

  // --- priority ---
  let priority = 0;
  each(PRIO_BANG_RE, masked, (m) => {
    priority = Math.max(priority, Math.min(2, m[0].length));
    cut(m.index, m.index + m[0].length);
    hl.push({ s: m.index, e: m.index + m[0].length, type: 'prio' });
  });
  each(PRIO_WORD_RE, masked, (m) => {
    const s = m.index + m[1].length;
    const e = m.index + m[0].length;
    const w = m[2];
    const lvl = /urgent|asap|high|top|p1/.test(w) ? 2 : 1;
    priority = Math.max(priority, lvl);
    cut(s, e);
    hl.push({ s, e, type: 'prio' });
  });

  // --- title ---
  let titleRaw = '';
  for (let i = 0; i < raw.length; i++) titleRaw += remove[i] ? ' ' : raw[i];
  const title = cleanTitle(titleRaw);
  const category = categorize(title);

  const toAtom = (a) =>
    a ? { h: a.h, m: a.m, period: a.period, is24: a.is24, daypart: partFor(a), special: a.special } : null;

  let kind;
  if (range) kind = 'range';
  else if (start) kind = 'point';
  else if (untilAtom) kind = 'until';
  else kind = 'flex';

  return {
    index,
    s: seg.s,
    e: seg.e,
    text: raw,
    title,
    category,
    kind,
    start: kind === 'until' ? null : toAtom(start),
    end: kind === 'until' ? toAtom(untilAtom) : toAtom(end),
    duration,
    deadline: toAtom(deadline),
    after: toAtom(earliest),
    daypart,
    priority,
    seq: !!seg.seq,
    days,
    warnings,
    tokens: hl
      .filter((t) => t.e > t.s)
      .map((t) => ({ s: base + t.s, e: base + t.e, type: t.type })),
  };
}

/**
 * Parse a whole plan.
 * @param {string} text
 * @param {{mode?: 'day'|'week'}} [opts]
 * @returns {{entries: object[], tokens: {s:number,e:number,type:string}[]}}
 */
export function parse(text, opts = {}) {
  const mode = opts.mode || 'day';
  const src = String(text || '');
  const segs = splitSegments(src);
  const entries = [];
  const tokens = [];
  segs.forEach((seg) => {
    const entry = parseSegment(src, seg, mode, entries.length);
    if (!entry.title && entry.kind === 'flex' && entry.duration == null && !entry.days) return;
    entries.push(entry);
    for (const t of entry.tokens) tokens.push(t);
  });
  tokens.sort((a, b) => a.s - b.s || a.e - b.e);
  return { entries, tokens };
}
