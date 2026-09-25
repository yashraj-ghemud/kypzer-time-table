/**
 * Workspace controller: editor ⇄ engine ⇄ views ⇄ insights.
 * Text is the source of truth; every visual edit becomes a text edit (undoable with Ctrl+Z).
 */
import { h, qs, qsa, debounce } from '../core/dom.js';
import { state, subscribe, getPlan, getWeek, setText, setWeekText, setUI, dayRecord, markBlock, today } from '../core/store.js';
import { editPlan } from '../engine/plan.js';
import { fmtTime, addDays, parseDateKey, dateKey, minutesOfDay, fmtDuration, WEEKDAYS_LONG } from '../engine/time.js';
import { routineFor } from '../engine/week.js';
import { createEditor } from './editor.js';
import { renderTimeline } from './timeline.js';
import { renderDayGrid } from './daygrid.js';
import { renderWeekGrid } from './weekgrid.js';
import { renderScore, renderInsights, renderStats, renderBreakdown, renderEnergy } from './insights.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { DAY_TEMPLATES, WEEK_TEMPLATES } from './templates.js';
import * as sound from '../core/sound.js';
import { burstFrom } from './fx.js';

let editor = null;
let mounted = false;
let dial = null;
let dialLoading = null;
let lastPlanSig = '';

const els = {};

export function mountApp() {
  if (mounted) {
    refresh(true);
    return;
  }
  mounted = true;
  els.editor = qs('#editor');
  els.understood = qs('#understood');
  els.unplaced = qs('#unplaced');
  els.viewBody = qs('#view-body');
  els.score = qs('#score-card');
  els.insights = qs('#insights');
  els.stats = qs('#stats');
  els.breakdown = qs('#breakdown');
  els.energy = qs('#energy');
  els.dayLabel = qs('#day-label');
  els.progress = qs('#day-progress');
  els.title = qs('#editor-title');

  editor = createEditor(els.editor, {
    onInput: debounce((v) => {
      if (state.ui.mode === 'week') setWeekText(v);
      else setText(v);
    }, 90),
    onCaretEntry: (pos) => {
      if (state.ui.mode === 'week') return;
      const plan = getPlan();
      const b = plan.blocks.find((x) => x.srcS != null && x.srcS <= pos && pos <= x.srcE);
      if (b && b.id !== state.ui.selected) {
        state.ui.selected = b.id;
        renderView(plan, false);
      }
    },
  });

  // icons in buttons
  qs('#day-prev').innerHTML = icon('left');
  qs('#day-next').innerHTML = icon('right');
  qs('#btn-history').innerHTML = icon('history') + '<span>History</span>';
  qs('#btn-export').innerHTML = icon('share') + '<span>Share</span>';
  qs('#btn-settings').innerHTML = icon('settings');
  qs('#btn-focus').innerHTML = icon('play') + '<span>Focus</span>';

  qs('#day-prev').addEventListener('click', () => changeDay(-1));
  qs('#day-next').addEventListener('click', () => changeDay(1));
  els.dayLabel.addEventListener('click', () => gotoDate(today()));

  setupSeg(qs('#mode-seg'), 'mode', (v) => {
    setUI({ mode: v, selected: null });
    loadEditorText();
    refresh(true);
  });
  setupSeg(qs('#view-seg'), 'view', (v) => {
    setUI({ view: v });
    refresh(true);
  });

  qs('#btn-export').addEventListener('click', () => import('./export.js').then((m) => m.openExport()));
  qs('#btn-settings').addEventListener('click', () => import('./settings.js').then((m) => m.openSettings()));
  qs('#btn-history').addEventListener('click', () => import('./history.js').then((m) => m.openHistory()));

  setupTemplates();
  setupVoice();
  setupMobileTabs();

  subscribe((reason) => {
    if (!mounted) return;
    if (reason === 'import') loadEditorText();
    refresh(reason === 'settings' || reason === 'import' || reason === 'ui');
  });
  loadEditorText();
  refresh(true);
  // tick: keep NOW marker and progress fresh
  setInterval(() => {
    if (document.hidden || document.documentElement.dataset.route !== 'app') return;
    refresh(true);
  }, 30000);
}

function setupSeg(seg, key, onPick) {
  const thumb = h('span.seg-thumb');
  seg.prepend(thumb);
  const place = () => {
    const on = seg.querySelector('[aria-selected="true"]');
    if (!on) return;
    thumb.style.left = on.offsetLeft + 'px';
    thumb.style.width = on.offsetWidth + 'px';
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = b.dataset[key];
    for (const x of qsa('button', seg)) x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    place();
    sound.ui('tick');
    onPick(v);
  });
  seg._place = place;
  requestAnimationFrame(place);
  window.addEventListener('resize', place);
  if (document.fonts) document.fonts.ready.then(place);
}

function syncSeg(seg, key, value) {
  for (const x of qsa('button', seg)) x.setAttribute('aria-selected', x.dataset[key] === value ? 'true' : 'false');
  seg._place && seg._place();
}

function loadEditorText() {
  const text = state.ui.mode === 'week' ? state.week.text || '' : dayRecord().text || '';
  editor.setValue(text, { silent: true });
}

function changeDay(delta) {
  gotoDate(addDays(state.ui.date, delta));
}

export function gotoDate(key) {
  if (state.ui.mode === 'week') {
    setUI({ mode: 'day' });
    syncSeg(qs('#mode-seg'), 'mode', 'day');
  }
  state.ui.date = key;
  state.ui.selected = null;
  loadEditorText();
  refresh(true);
  sound.ui('tick');
}

/* ---------------------------------------------------------------- */

function refresh(force = false) {
  if (!mounted) return;
  const week = state.ui.mode === 'week';
  const d = parseDateKey(state.ui.date);
  const isToday = state.ui.date === today();
  const tomorrow = state.ui.date === addDays(today(), 1);
  els.dayLabel.innerHTML = '';
  els.dayLabel.append(
    h('small', { text: week ? 'weekly routine' : isToday ? 'today' : tomorrow ? 'tomorrow' : WEEKDAYS_LONG[(d.getDay() + 6) % 7] }),
    document.createTextNode(week ? 'Week timetable' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '')),
  );
  els.title.textContent = week ? 'Your week' : isToday ? 'Your day' : 'Plan · ' + d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  qs('#view-seg').style.display = week ? 'none' : '';
  qs('#day-prev').style.visibility = week ? 'hidden' : '';
  qs('#day-next').style.visibility = week ? 'hidden' : '';

  if (week) {
    const wk = getWeek();
    editor.setTokens(wk ? wk.tokens : []);
    els.understood.replaceChildren();
    els.unplaced.replaceChildren();
    if (wk && wk.ignored.length) {
      els.unplaced.append(h('b', { text: 'No days/time' }), document.createTextNode(wk.ignored.map((e) => e.title).join(', ') + ' — add days and a time, e.g. "mon wed 5pm ' + wk.ignored[0].title + '".'));
    }
    renderWeekGrid(els.viewBody, wk, { clock: state.settings.clock, onDay: (i) => {
      const base = new Date();
      const delta = (i - ((base.getDay() + 6) % 7) + 7) % 7;
      gotoDate(addDays(today(), delta));
    } });
    renderWeekSummary(wk);
    els.progress.replaceChildren();
    destroyDial();
    return;
  }

  const plan = getPlan();
  const sig = plan.text + '|' + JSON.stringify(state.settings) + '|' + state.ui.view + '|' + state.ui.selected + '|' + JSON.stringify(dayRecord().done || {}) + '|' + Math.floor(minutesOfDay());
  if (!force && sig === lastPlanSig) return;
  lastPlanSig = sig;
  editor.setTokens(plan.tokens);
  const sel = plan.blocks.find((b) => b.id === state.ui.selected);
  editor.highlightRange(sel && sel.srcS != null ? { s: sel.srcS, e: sel.srcE } : null);
  renderUnderstood(plan);
  renderUnplaced(plan);
  renderView(plan, true);
  renderScore(els.score, plan.analysis);
  renderInsights(els.insights, plan.analysis, { tone: state.settings.tone, onFix: applyFix, onFocusBlocks: (ids) => dial && dial.highlight(ids) });
  renderStats(els.stats, plan.analysis);
  renderBreakdown(els.breakdown, plan.analysis);
  renderEnergy(els.energy, plan, state.settings.chronotype);
  renderProgress(plan);
}

function renderWeekSummary(wk) {
  els.score.replaceChildren();
  els.stats.replaceChildren();
  els.breakdown.replaceChildren();
  els.energy.replaceChildren();
  if (!wk) {
    els.insights.replaceChildren(h('div.sec-label', { text: 'Week mode' }), h('p.small.dim', { text: 'Your weekly routine merges into every day plan (toggle in settings). Export it as recurring calendar events from Share.' }));
    return;
  }
  const totals = wk.days.map((l) => l.reduce((s, b) => s + b.end - b.start, 0));
  els.insights.replaceChildren(
    h('div.sec-label', { text: 'Week at a glance' }),
    ...wk.days.map((l, i) => h('div.bar-row', { '--c': i < 5 ? '#00e5ff' : '#f43f5e' },
      h('div.bar-top', h('span.name', h('i'), h('span', { text: WEEKDAYS_LONG[i] })), h('span.val', { text: l.length + ' · ' + fmtDuration(totals[i]) })),
      h('div.bar-track', h('div.bar-fill', { style: { width: (Math.max(...totals) ? (totals[i] / Math.max(...totals)) * 100 : 0) + '%' } })))),
    h('p.small.dim', { style: { marginTop: '12px' }, text: state.settings.routine ? 'Routine is merged into your day plans (read-only blocks marked “routine”).' : 'Routine merge is off — turn it on in settings.' }),
  );
}

function renderUnderstood(plan) {
  const clock = state.settings.clock;
  const chips = plan.blocks.filter((b) => b.kind !== 'routine').map((b) => {
    const chip = h('button.u-chip' + (b.kind === 'auto' ? '.auto' : ''), {
      '--c': b.color,
      title: 'Show in plan',
      onclick: () => selectBlock(b, { scroll: true }),
    },
    h('i'),
    h('span.t', { text: fmtTime(b.start, clock).replace(/:00(?= [AP]M)/, '') + '–' + fmtTime(b.end, clock).replace(/:00(?= [AP]M)/, '') }),
    h('span.n', { text: b.title || 'Untitled' }),
    b.kind === 'auto' ? h('span.auto-tag', { text: 'AUTO' }) : null,
    b.guessed ? h('span.flip', { text: '?', title: 'AM/PM guessed — click to flip', onclick: (e) => { e.stopPropagation(); applyEdit([{ type: 'flip', id: b.id }], 'Flipped AM/PM'); } }) : null,
    );
    return chip;
  });
  els.understood.replaceChildren(...chips);
}

function renderUnplaced(plan) {
  if (!plan.unplaced.length) {
    els.unplaced.replaceChildren();
    return;
  }
  els.unplaced.replaceChildren(h('b', { text: 'Couldn’t fit' }), ...plan.unplaced.map((u) => h('div', { text: '• ' + u.title + ' — ' + u.reason })));
}

function renderProgress(plan) {
  const done = dayRecord().done || {};
  const total = plan.blocks.length;
  if (!total) {
    els.progress.replaceChildren();
    return;
  }
  const n = plan.blocks.filter((b) => done[b.id] === 'done').length;
  els.progress.replaceChildren(h('span', { text: n + '/' + total + ' done' }), h('span.bar', h('i', { style: { width: (n / total) * 100 + '%' } })));
}

function renderView(plan, full) {
  const view = state.ui.view;
  if (!plan.blocks.length) {
    destroyDial();
    renderEmpty();
    return;
  }
  if (view === 'grid') {
    destroyDial();
    renderDayGrid(els.viewBody, plan, {
      clock: state.settings.clock,
      selected: state.ui.selected,
      onChange: (ch) => applyEdit([ch], 'Rescheduled'),
      onCreate: (ch) => applyEdit([ch], 'Added “' + ch.title + '”'),
      onSelect: selectBlock,
    });
  } else if (view === 'dial') {
    mountDial(plan);
  } else {
    destroyDial();
    renderTimeline(els.viewBody, plan, {
      clock: state.settings.clock,
      done: dayRecord().done || {},
      selected: state.ui.selected,
      onSelect: (b) => selectBlock(b, { scroll: false }),
      onToggle: (b, status) => {
        if (status === 'done') burstFrom(els.viewBody.querySelector(`[data-key="${CSS.escape(b.id)}"] .tl-check`), b.color);
        markBlock(state.ui.date, b.id, status);
        if (status === 'done') {
          sound.ui('done');
          toast('Nice. “' + b.title + '” done.', { kind: 'ok' });
        }
      },
      onFlip: (b) => applyEdit([{ type: 'flip', id: b.id }], 'Flipped AM/PM'),
    });
  }
}

function renderEmpty() {
  const tryText = (t) => {
    editor.setValue(t);
    editor.focus();
  };
  els.viewBody.replaceChildren(h('div.empty',
    h('div.ring'),
    h('h3', { text: 'Your 1,440 minutes are waiting' }),
    h('p', { text: 'Type your day on the left — like you’d text it. Or start from one of these:' }),
    h('div.examples', ...DAY_TEMPLATES.slice(0, 4).map((t) => h('button', { text: t.name, onclick: () => tryText(t.text) }))),
  ));
}

async function mountDial(plan) {
  if (dial) {
    dial.update(plan, state.ui.selected);
    return;
  }
  if (dialLoading) return;
  els.viewBody.replaceChildren(h('div.dial-wrap', h('div.dial-center', h('span', { text: 'starting engine…' }))));
  dialLoading = import('./dialview.js')
    .then((m) => {
      dialLoading = null;
      if (state.ui.view !== 'dial') return;
      dial = m.mountDialView(els.viewBody, { clock: state.settings.clock, onSelect: (b) => selectBlock(b, { scroll: false }) });
      dial.update(getPlan(), state.ui.selected);
    })
    .catch((err) => {
      dialLoading = null;
      console.warn('dial failed', err);
      els.viewBody.replaceChildren(h('div.empty', h('h3', { text: '3D is unavailable here' }), h('p', { text: 'Your browser blocked WebGL. Timeline and Grid work fine.' })));
    });
}

function destroyDial() {
  if (dial) {
    dial.destroy();
    dial = null;
  }
}

export function selectBlock(b, { scroll = true } = {}) {
  state.ui.selected = b.id;
  if (b.srcS != null) {
    editor.highlightRange({ s: b.srcS, e: b.srcE });
    if (scroll) {
      const ta = editor.el;
      const before = ta.value.slice(0, b.srcS);
      const line = before.split('\n').length - 1;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
      const r = ta.getBoundingClientRect();
      const y = r.top + window.scrollY + line * lh - 120;
      if (window.innerWidth > 820 && (r.top + line * lh < 80 || r.top + line * lh > window.innerHeight - 80)) window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
  const plan = getPlan();
  renderView(plan, false);
  const card = els.viewBody.querySelector(`[data-key="${CSS.escape(b.id)}"]`);
  if (card && scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------------------------------------------------------------- */

export function applyEdit(changes, message) {
  const text = dayRecord().text || '';
  const routine = state.settings.routine && getWeek() ? routineFor(getWeek(), (parseDateKey(state.ui.date).getDay() + 6) % 7) : [];
  const res = editPlan(text, changes, { settings: state.settings, routine, nowMinute: state.ui.date === today() ? Math.floor(minutesOfDay() / 5) * 5 : null });
  if (res.text === text) {
    toast('Nothing to change there.', { icon: 'info' });
    return false;
  }
  state.ui.mode = 'day';
  if (editor && mounted) editor.replaceAll(res.text);
  setText(res.text);
  // flash the changed spans
  const plan = getPlan();
  const changed = plan.blocks.filter((b) => res.changedIds.includes(b.id) && b.srcS != null);
  if (editor && changed.length) editor.flashRange({ s: Math.min(...changed.map((b) => b.srcS)), e: Math.max(...changed.map((b) => b.srcE)) });
  sound.ui('success');
  if (message) toast(message + ' · text updated', { kind: 'ok', action: { label: 'Undo', run: () => { if (editor) editor.replaceAll(text); setText(text); } } });
  return true;
}

function applyFix(ins) {
  const f = ins.fix;
  if (!f) return;
  if (f.type === 'move') applyEdit([{ type: 'move', id: f.id, start: f.start, end: f.end }], 'Clash resolved');
  else if (f.type === 'split') applyEdit([{ type: 'split', id: f.id, at: f.at, breakLen: f.breakLen }], 'Break added');
  else if (f.type === 'add') applyEdit([{ type: 'add', title: f.title, start: f.start, end: f.end }], 'Added ' + f.title);
}

/** Shift every remaining editable block (running late). */
export function runningLate(mins) {
  const plan = getPlan();
  const now = state.ui.date === today() ? minutesOfDay() : -Infinity;
  const ids = plan.blocks.filter((b) => !b.readOnly && b.kind !== 'routine' && b.end > now && b.srcS != null).map((b) => b.id);
  if (!ids.length) {
    toast('Nothing left to shift today.', { icon: 'info' });
    return false;
  }
  return applyEdit([{ type: 'shift', ids, delta: mins }], 'Shifted ' + ids.length + ' blocks by ' + mins + ' min');
}

export function loadTemplate(t, mode = 'day') {
  if (mode === 'week') {
    setUI({ mode: 'week' });
    syncSeg(qs('#mode-seg'), 'mode', 'week');
    editor.replaceAll(t.text);
    setWeekText(t.text);
  } else {
    if (state.ui.mode === 'week') {
      setUI({ mode: 'day' });
      syncSeg(qs('#mode-seg'), 'mode', 'day');
    }
    editor.replaceAll(t.text);
    setText(t.text);
  }
  toast('Loaded “' + t.name + '”', { kind: 'ok' });
}

function setupTemplates() {
  const btn = qs('#btn-templates');
  const dd = qs('#tpl-dd');
  let menu = null;
  const close = () => {
    if (menu) menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) return close();
    const week = state.ui.mode === 'week';
    const list = week ? WEEK_TEMPLATES : DAY_TEMPLATES;
    menu = h('div.menu', { role: 'menu' }, ...list.map((t) => h('button', { role: 'menuitem', onclick: () => {
      close();
      const cur = week ? state.week.text : dayRecord().text;
      if (cur && cur.trim() && !confirm('Replace your current text with “' + t.name + '”? (Ctrl+Z can undo)')) return;
      loadTemplate(t, week ? 'week' : 'day');
    } }, h('b', { text: t.name }), h('span', { text: t.desc }))));
    dd.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  });
  document.addEventListener('click', (e) => {
    if (menu && !dd.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu) close();
  });
}

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = qs('#btn-voice');
  if (!SR) return;
  btn.hidden = false;
  btn.innerHTML = icon('mic');
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) {
      rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = state.settings.tone === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    btn.style.color = 'var(--rose)';
    toast('Listening… say your day, e.g. “gym 6 to 7 am, work 9 to 1”', { icon: 'mic', duration: 4000 });
    rec.onresult = (e) => {
      const said = [...e.results].map((r) => r[0].transcript).join(' ').trim();
      if (!said) return;
      const cur = editor.value;
      const next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + said;
      editor.replaceAll(next);
      if (state.ui.mode === 'week') setWeekText(next);
      else setText(next);
    };
    rec.onerror = (e) => toast('Voice: ' + (e.error || 'error'), { kind: 'err' });
    rec.onend = () => {
      rec = null;
      btn.style.color = '';
    };
    rec.start();
  });
}

function setupMobileTabs() {
  const tabs = qs('#mobile-tabs');
  const ws = qs('.workspace');
  ws.dataset.pane = 'editor';
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ws.dataset.pane = b.dataset.pane;
    for (const x of qsa('button', tabs)) x.classList.toggle('on', x === b);
    if (b.dataset.pane === 'view' && dial) dial.resize();
    window.scrollTo({ top: 0 });
  });
}

export function focusEditor() {
  if (editor) editor.focus();
}

export function getEditor() {
  return editor;
}

export function setView(v) {
  setUI({ view: v });
  syncSeg(qs('#view-seg'), 'view', v);
}

export function setMode(m) {
  setUI({ mode: m });
  syncSeg(qs('#mode-seg'), 'mode', m);
  loadEditorText();
  refresh(true);
}

export function appVisible(on) {
  if (!on) destroyDial();
  else if (mounted) {
    qs('#mode-seg')._place && qs('#mode-seg')._place();
    qs('#view-seg')._place && qs('#view-seg')._place();
    refresh(true);
  }
}

export { dateKey };
