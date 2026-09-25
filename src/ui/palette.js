/** Command palette (Ctrl/⌘+K): fuzzy search over every action in the app. */
import { h, frag } from '../core/dom.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { state, setSetting, today } from '../core/store.js';
import { DAY_TEMPLATES, WEEK_TEMPLATES } from './templates.js';
import { addDays } from '../engine/time.js';
import * as sound from '../core/sound.js';

async function app() {
  const m = await import('./app.js');
  if (document.documentElement.dataset.route !== 'app') {
    go('/app');
    await new Promise((r) => setTimeout(r, 1200));
  }
  m.mountApp();
  return m;
}

function commands() {
  const list = [
    { g: 'Go', ic: 'home', t: 'Home — the engine', run: () => go('/') },
    { g: 'Go', ic: 'calendar', t: 'Planner — today', sc: '', run: async () => (await app()).gotoDate(today()) },
    { g: 'Go', ic: 'right', t: 'Plan tomorrow', run: async () => (await app()).gotoDate(addDays(today(), 1)) },
    { g: 'Go', ic: 'week', t: 'Week timetable', run: async () => (await app()).setMode('week') },
    { g: 'Go', ic: 'play', t: 'Focus mode', sc: 'F', run: () => go('/focus') },
    { g: 'View', ic: 'list', t: 'Timeline view', sc: 'T', run: async () => (await app()).setView('timeline') },
    { g: 'View', ic: 'grid', t: 'Grid view (drag & drop)', sc: 'G', run: async () => (await app()).setView('grid') },
    { g: 'View', ic: 'dial', t: 'Dial 3D view', sc: 'D', run: async () => (await app()).setView('dial') },
    { g: 'Do', ic: 'late', t: 'Running late — shift the rest of today by 15 min', run: async () => { const m = await app(); m.gotoDate(today()); m.runningLate(15); } },
    { g: 'Do', ic: 'late', t: 'Running late — shift by 30 min', run: async () => { const m = await app(); m.gotoDate(today()); m.runningLate(30); } },
    { g: 'Share', ic: 'image', t: 'Export image card', run: async () => { await app(); (await import('./export.js')).openExport('image'); } },
    { g: 'Share', ic: 'calendar', t: 'Add to calendar (.ics)', run: async () => { await app(); (await import('./export.js')).openExport('calendar'); } },
    { g: 'Share', ic: 'qr', t: 'Share link + QR code', run: async () => { await app(); (await import('./export.js')).openExport('link'); } },
    { g: 'Share', ic: 'text', t: 'Copy as WhatsApp text', run: async () => { await app(); (await import('./export.js')).openExport('text'); } },
    { g: 'Share', ic: 'download', t: 'Print timetable', run: async () => { await app(); window.print(); } },
    { g: 'Settings', ic: 'clock', t: 'Toggle 12h / 24h clock', run: () => setSetting('clock', state.settings.clock === '12h' ? '24h' : '12h') },
    { g: 'Settings', ic: 'sound', t: (state.settings.sound ? 'Mute' : 'Enable') + ' sound', run: () => document.getElementById('btn-sound').click() },
    { g: 'Settings', ic: 'settings', t: 'Open settings', run: async () => (await import('./settings.js')).openSettings() },
    { g: 'Settings', ic: 'history', t: 'History & streaks', run: async () => (await import('./history.js')).openHistory() },
    { g: 'Fun', ic: 'refresh', t: 'Replay the intro film', run: async () => { go('/'); (await import('../intro/intro.js')).playIntro({ force: true }); } },
  ];
  for (const t of DAY_TEMPLATES) list.push({ g: 'Templates', ic: 'sparkle', t: 'Template: ' + t.name, d: t.desc, run: async () => (await app()).loadTemplate(t, 'day') });
  for (const t of WEEK_TEMPLATES) list.push({ g: 'Templates', ic: 'week', t: 'Week template: ' + t.name, d: t.desc, run: async () => (await app()).loadTemplate(t, 'week') });
  return list;
}

function score(q, s) {
  q = q.toLowerCase();
  s = s.toLowerCase();
  if (!q) return 1;
  if (s.includes(q)) return 100 - s.indexOf(q);
  let i = 0;
  let sc = 0;
  for (const ch of s) {
    if (ch === q[i]) {
      i++;
      sc += 1;
      if (i === q.length) return sc;
    }
  }
  return 0;
}

export function openPalette() {
  const root = document.getElementById('palette-root');
  if (root.firstChild) return;
  const all = commands();
  const input = h('input', { placeholder: 'Type a command… (templates, export, focus, running late…)', 'aria-label': 'Command', spellcheck: 'false' });
  const listEl = h('div.palette-list', { role: 'listbox' });
  const wrap = h('div.palette-wrap', { onmousedown: (e) => { if (e.target === wrap) close(); } },
    h('div.palette', { role: 'dialog', 'aria-label': 'Command palette' }, h('div.palette-input', frag(icon('command')), input, h('kbd', { text: 'esc' })), listEl));
  root.appendChild(wrap);
  sound.ui('open');
  let items = [];
  let idx = 0;
  const prev = document.activeElement;
  function close() {
    wrap.remove();
    if (prev && prev.focus) prev.focus();
  }
  function render() {
    const q = input.value.trim();
    items = all.map((c) => ({ c, s: Math.max(score(q, c.t), score(q, c.g + ' ' + c.t) * 0.8) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
    if (!q) items = all;
    idx = Math.min(idx, Math.max(0, items.length - 1));
    listEl.replaceChildren();
    if (!items.length) {
      listEl.appendChild(h('div.palette-empty', { text: 'No command for “' + q + '”.' }));
      return;
    }
    let lastG = null;
    items.forEach((c, i) => {
      if (!q && c.g !== lastG) {
        listEl.appendChild(h('div.palette-group', { text: c.g }));
        lastG = c.g;
      }
      const b = h('button.palette-item' + (i === idx ? '.on' : ''), { role: 'option', 'aria-selected': String(i === idx), onclick: () => run(c), onmousemove: () => { if (idx !== i) { idx = i; paint(); } } },
        frag(icon(c.ic)), h('span', { text: c.t }), c.sc ? h('span.sc', { text: c.sc }) : null);
      listEl.appendChild(b);
    });
  }
  function paint() {
    [...listEl.querySelectorAll('.palette-item')].forEach((b, i) => {
      b.classList.toggle('on', i === idx);
      b.setAttribute('aria-selected', String(i === idx));
      if (i === idx) b.scrollIntoView({ block: 'nearest' });
    });
  }
  function run(c) {
    close();
    sound.ui('click');
    Promise.resolve(c.run()).catch((e) => console.error(e));
  }
  input.addEventListener('input', () => {
    idx = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = (idx + 1) % items.length;
      paint();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = (idx - 1 + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[idx]) run(items[idx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  render();
  input.focus();
}
