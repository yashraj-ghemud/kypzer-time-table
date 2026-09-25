/** Canonical text for blocks + low-level text edits. Text is the source of truth. */
import { DAY, fmtTime, fmtTimeInput, fmtDuration, mod } from './time.js';
import { categoryInfo } from './lexicon.js';

export function prioSuffix(p) {
  return p >= 2 ? ' !!' : p === 1 ? ' !' : '';
}

/** "3:50pm to 5pm : work" */
export function canonicalLine({ start, end, title, priority = 0 }, clock = '12h') {
  return fmtTimeInput(start, clock) + ' to ' + fmtTimeInput(end, clock) + ' : ' + (title || 'block') + prioSuffix(priority);
}

/** Apply non-overlapping edits [{s,e,text}] to a string. */
export function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.s - a.s);
  let out = text;
  for (const ed of sorted) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
  return out;
}

/** New position of an offset that lies outside every edited range. */
export function mapOffset(pos, edits) {
  let delta = 0;
  for (const ed of edits) {
    if (ed.e <= pos) delta += ed.text.length - (ed.e - ed.s);
  }
  return pos + delta;
}

/** Separator style used by the text: newline lists vs comma lists. */
export function separatorFor(text) {
  return /\n/.test(text) || !text.trim() ? '\n' : ', ';
}

/** Is the span [s,e) alone on its line? */
export function ownLine(text, s, e) {
  const before = text.slice(text.lastIndexOf('\n', s - 1) + 1, s);
  const nl = text.indexOf('\n', e);
  const after = text.slice(e, nl === -1 ? text.length : nl);
  return /^\s*(?:[-•*·>]+\s*|\d{1,2}[.)]\s*)*$/.test(before) && /^\s*$/.test(after);
}

/** Range to delete for an entry, swallowing one neighbouring separator. */
export function removalRange(text, s, e) {
  let a = s;
  let b = e;
  // swallow line bullets
  const lineStart = text.lastIndexOf('\n', a - 1) + 1;
  if (/^\s*(?:[-•*·>]+\s*|\d{1,2}[.)]\s*)*$/.test(text.slice(lineStart, a))) a = lineStart;
  const after = /^[ \t]*[,;|][ \t]*/.exec(text.slice(b));
  if (after) b += after[0].length;
  else if (text[b] === '\n') b += 1;
  else {
    const before = /[ \t]*[,;|][ \t]*$/.exec(text.slice(0, a));
    if (before) a -= before[0].length;
    else if (a > 0 && text[a - 1] === '\n') a -= 1;
  }
  return { s: a, e: b };
}

/** WhatsApp-friendly text export. */
export function planToText(blocks, { clock = '12h', title = '', stats = null } = {}) {
  const lines = [];
  if (title) lines.push('*' + title + '*');
  for (const b of blocks) {
    const info = categoryInfo(b.category, b.title);
    lines.push(info.emoji + ' ' + fmtTime(b.start, clock) + ' – ' + fmtTime(b.end, clock) + '  ' + b.title + ' _(' + fmtDuration(b.end - b.start) + ')_');
  }
  if (stats) {
    lines.push('');
    lines.push('⏱ Busy ' + fmtDuration(stats.busy) + ' · Free ' + fmtDuration(stats.free) + ' · ' + stats.tasks + ' blocks');
  }
  lines.push('— planned with KYPZER time engine');
  return lines.join('\n');
}

export { DAY, mod };
