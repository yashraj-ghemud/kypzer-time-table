/** Time helpers. Absolute minutes are counted from 00:00 of the plan day (can exceed 1440 = next day). */

export const DAY = 1440;

export const mod = (n, m) => ((n % m) + m) % m;

/** "3:50 PM" / "15:50"; appends "+1d" for times on following days unless dayMark is false. */
export function fmtTime(abs, clock = '12h', { dayMark = true, compact = false } = {}) {
  const dayOffset = Math.floor(abs / DAY);
  const m = mod(Math.round(abs), DAY);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  let label;
  if (clock === '24h') {
    label = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  } else {
    const period = hh < 12 ? 'AM' : 'PM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    label = compact && mm === 0 ? h12 + ' ' + period : h12 + ':' + String(mm).padStart(2, '0') + ' ' + period;
  }
  if (dayMark && dayOffset > 0) label += ' +' + dayOffset + 'd';
  if (dayMark && dayOffset < 0) label += ' ' + dayOffset + 'd';
  return label;
}

/** Compact lower-case form used when the engine rewrites a line: "3:50pm", "5pm", "15:50". */
export function fmtTimeInput(abs, clock = '12h') {
  const m = mod(Math.round(abs), DAY);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (clock === '24h') return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const p = hh < 12 ? 'am' : 'pm';
  return mm === 0 ? h12 + p : h12 + ':' + String(mm).padStart(2, '0') + p;
}

export function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'm';
}

export function fmtRange(a, b, clock = '12h') {
  return fmtTime(a, clock) + ' – ' + fmtTime(b, clock);
}

const pad = (n) => String(n).padStart(2, '0');

/** Local-date key "YYYY-MM-DD". */
export function dateKey(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function isValidDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

/** Minutes since local midnight. */
export function minutesOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(d) {
  return (d.getDay() + 6) % 7;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function fmtDateLong(key) {
  const d = parseDateKey(key);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateShort(key) {
  const d = parseDateKey(key);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
