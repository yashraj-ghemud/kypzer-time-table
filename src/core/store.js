/**
 * App state: settings, per-day texts, week text, meta. Persisted to localStorage (safe in private mode).
 * Derived plans are memoised per (date, text, settings, week) so renders are cheap.
 */
import { buildPlan, DEFAULT_SETTINGS } from '../engine/plan.js';
import { buildWeek, routineFor } from '../engine/week.js';
import { dateKey, parseDateKey, weekdayIndex, minutesOfDay } from '../engine/time.js';

const KEY = 'kypzer.v2';
const listeners = new Set();

function safeGet() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function safeSet(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

const saved = safeGet() || {};

export const state = {
  settings: { ...DEFAULT_SETTINGS, sound: false, motion: 'auto', notify: false, reminders: 5, ...(saved.settings || {}) },
  days: saved.days || {},
  week: saved.week || { text: '' },
  meta: { seenIntro: false, ...(saved.meta || {}) },
  ui: { date: dateKey(), view: 'timeline', mode: 'day', selected: null },
};

let saveTimer = 0;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeSet({ settings: state.settings, days: state.days, week: state.week, meta: state.meta }), 200);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of listeners) fn(reason);
}

export function today() {
  return dateKey();
}

export function dayRecord(key = state.ui.date) {
  return state.days[key] || { text: '', done: {} };
}

export function setText(text, key = state.ui.date) {
  const rec = { ...dayRecord(key), text, updatedAt: Date.now() };
  if (!rec.done) rec.done = {};
  state.days[key] = rec;
  persist();
  emit('text');
}

export function setWeekText(text) {
  state.week = { text, updatedAt: Date.now() };
  persist();
  emit('week');
}

export function setSetting(k, v) {
  state.settings[k] = v;
  persist();
  emit('settings');
}

export function setUI(patch) {
  Object.assign(state.ui, patch);
  emit('ui');
}

export function setMeta(k, v) {
  state.meta[k] = v;
  persist();
}

export function markBlock(key, id, status) {
  const rec = { ...dayRecord(key) };
  rec.done = { ...(rec.done || {}) };
  if (status) rec.done[id] = status;
  else delete rec.done[id];
  state.days[key] = rec;
  persist();
  emit('done');
}

/* ---------- derived ---------- */

let weekCache = { text: null, value: null };
export function getWeek() {
  const text = state.week.text || '';
  if (weekCache.text !== text) weekCache = { text, value: text.trim() ? buildWeek(text) : null };
  return weekCache.value;
}

const planCache = new Map();
export function getPlan(key = state.ui.date, textOverride = null) {
  const text = textOverride ?? dayRecord(key).text ?? '';
  const isToday = key === dateKey();
  const week = state.settings.routine ? getWeek() : null;
  const routine = week ? routineFor(week, weekdayIndex(parseDateKey(key))) : [];
  // nowMinute changes every minute; quantise so cached plans refresh once per 5 minutes on today
  const nowQ = isToday ? Math.floor(minutesOfDay() / 5) * 5 : null;
  const sig = [key, text, JSON.stringify(state.settings), weekCache.text, nowQ].join('\u0001');
  const hit = planCache.get(key);
  if (hit && hit.sig === sig) return hit.plan;
  const plan = buildPlan({ text, settings: state.settings, routine, nowMinute: nowQ });
  plan.dateKey = key;
  plan.isToday = isToday;
  planCache.set(key, { sig, plan });
  return plan;
}

export function planFromText(text, key = state.ui.date) {
  return buildPlan({ text, settings: state.settings, routine: [], nowMinute: null, dateKey: key });
}

export function exportAll() {
  return JSON.stringify({ app: 'kypzer', version: 2, exportedAt: new Date().toISOString(), settings: state.settings, days: state.days, week: state.week }, null, 2);
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (!data || data.app !== 'kypzer') throw new Error('Not a KYPZER backup');
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.days = { ...state.days, ...(data.days || {}) };
  if (data.week) state.week = data.week;
  persist();
  emit('import');
}

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state.days = {};
  state.week = { text: '' };
  state.settings = { ...DEFAULT_SETTINGS, sound: false, motion: 'auto', notify: false, reminders: 5 };
  emit('import');
}
