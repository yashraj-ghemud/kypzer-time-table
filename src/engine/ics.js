/**
 * iCalendar (RFC 5545) export. Floating local times (no TZID) so events land at the same wall-clock
 * time in whatever calendar imports them. CRLF line endings, 75-octet folding, text escaping.
 */
import { parseDateKey } from './time.js';

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n) => String(n).padStart(2, '0');

export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (UTF-8 aware, never splits a character). */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curLen = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curLen + n > limit) {
      parts.push(cur);
      cur = '';
      curLen = 0;
      limit = 74; // continuation lines start with a space
    }
    cur += ch;
    curLen += n;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

export function fmtLocal(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
}

export function fmtUTC(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

/** Absolute plan minute on a date key → Date (handles next-day minutes). */
export function minuteToDate(dateKey, abs) {
  const d = parseDateKey(dateKey);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(abs));
  return d;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * @param {{title:string,start:Date,end:Date,description?:string,byday?:number[]}[]} events
 * @param {{calName?:string, alarm?:number|null, now?:Date}} [opts]
 */
export function toICS(events, opts = {}) {
  const now = opts.now || new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KYPZER//Time Engine 2.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (opts.calName) lines.push('X-WR-CALNAME:' + escapeText(opts.calName));
  events.forEach((ev, i) => {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + hash(ev.title + fmtLocal(ev.start) + i) + '-' + i + '@kypzer.time');
    lines.push('DTSTAMP:' + fmtUTC(now));
    lines.push('DTSTART:' + fmtLocal(ev.start));
    lines.push('DTEND:' + fmtLocal(ev.end));
    lines.push('SUMMARY:' + escapeText(ev.title));
    if (ev.description) lines.push('DESCRIPTION:' + escapeText(ev.description));
    if (ev.byday && ev.byday.length) lines.push('RRULE:FREQ=WEEKLY;BYDAY=' + ev.byday.map((d) => BYDAY[d]).join(','));
    if (ev.category) lines.push('CATEGORIES:' + escapeText(ev.category));
    if (opts.alarm != null) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeText(ev.title), 'TRIGGER:-PT' + Math.max(0, opts.alarm | 0) + 'M', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Day plan → events. */
export function dayEvents(dateKey, blocks) {
  return blocks.map((b) => ({
    title: b.title || 'Block',
    start: minuteToDate(dateKey, b.start),
    end: minuteToDate(dateKey, b.end),
    category: b.category,
    description: 'Planned with KYPZER time engine',
  }));
}

/** Week lines → recurring events starting on/after weekStartKey. */
export function weekEvents(weekStartKey, lines) {
  const base = parseDateKey(weekStartKey);
  const baseWd = (base.getDay() + 6) % 7;
  return lines.map((l) => {
    const days = [...l.days].sort((a, b) => a - b);
    // first matching day on/after base
    let offset = 7;
    for (const d of days) offset = Math.min(offset, (d - baseWd + 7) % 7);
    const d0 = new Date(base);
    d0.setDate(base.getDate() + offset);
    const key = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
    return {
      title: l.title || 'Class',
      start: minuteToDate(key, l.start),
      end: minuteToDate(key, l.end),
      byday: days,
      category: l.category,
      description: 'Weekly routine · KYPZER time engine',
    };
  });
}
