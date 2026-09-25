import { h, download } from '../core/dom.js';
import { state, setSetting, exportAll, importAll, resetAll, setMeta } from '../core/store.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { fmtTime } from '../engine/time.js';
import { CHRONOTYPES } from '../engine/energy.js';
import * as sound from '../core/sound.js';

function sw(key, onChange) {
  const b = h('button.switch', { role: 'switch', 'aria-checked': state.settings[key] ? 'true' : 'false' });
  b.addEventListener('click', () => {
    const v = !state.settings[key];
    setSetting(key, v);
    b.setAttribute('aria-checked', v ? 'true' : 'false');
    onChange && onChange(v);
  });
  return b;
}

function radios(key, options, onChange) {
  const row = h('div.radio-row', { role: 'group' });
  for (const [val, label] of options) {
    const b = h('button', { 'aria-pressed': String(state.settings[key] === val), text: label });
    b.addEventListener('click', () => {
      setSetting(key, val);
      for (const x of row.children) x.setAttribute('aria-pressed', String(x === b));
      onChange && onChange(val);
    });
    row.appendChild(b);
  }
  return row;
}

function row(title, desc, control) {
  return h('div.field-row', h('div', h('div', { text: title }), desc ? h('div.desc', { text: desc }) : null), control);
}

function timeSelect(key) {
  const sel = h('select.input', { 'aria-label': key });
  for (let t = 0; t <= 1440; t += 30) {
    const o = h('option', { value: String(t), text: fmtTime(t % 1440, state.settings.clock) + (t === 1440 ? ' (midnight)' : '') });
    if (t === state.settings[key]) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => setSetting(key, +sel.value));
  return sel;
}

export function openSettings() {
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    try {
      importAll(await f.text());
      toast('Backup restored', { kind: 'ok' });
      closeModal();
    } catch (e) {
      toast('Could not read that file: ' + e.message, { kind: 'err' });
    }
  });
  const body = h('div',
    row('Clock', 'How times are shown and written', radios('clock', [['12h', '12-hour'], ['24h', '24-hour']])),
    row('Chronotype', 'Shapes the energy curve and where flexible tasks land', radios('chronotype', Object.entries(CHRONOTYPES).map(([k, v]) => [k, v.label]))),
    row('Day window starts', 'Flexible tasks are never placed before this', timeSelect('dayStart')),
    row('Day window ends', '…or after this', timeSelect('dayEnd')),
    row('Plan from now', 'On today, place flexible tasks only in the future', sw('fromNow')),
    row('Weekly routine in day plans', 'Merge your week timetable into every day', sw('routine')),
    row('Engine voice', 'Language of insights', radios('tone', [['en', 'English'], ['hi', 'Hinglish']])),
    row('Sound', 'Synthesised UI sounds and intro score', sw('sound', (v) => sound.setEnabled(v))),
    row('Motion', 'Reduce animations and skip the film', radios('motion', [['auto', 'System'], ['full', 'Full'], ['reduced', 'Reduced']], (v) => {
      if (v === 'auto') delete document.documentElement.dataset.motion;
      else document.documentElement.dataset.motion = v;
    })),
    row('Calendar reminders', 'Alert before each event in .ics exports', radios('reminders', [[null, 'None'], [5, '5 min'], [10, '10 min'], [15, '15 min']])),
    row('Replay the intro next visit', '', h('button.btn.btn-ghost.btn-xs', { text: 'Reset intro', onclick: () => { setMeta('seenIntro', false); toast('The film will play on your next visit to the home page.'); } })),
    h('div.sec-label', { text: 'Your data (stays on this device)' }),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button.btn.btn-ghost.btn-sm', { text: 'Download backup', onclick: () => download('kypzer-backup-' + new Date().toISOString().slice(0, 10) + '.json', exportAll(), 'application/json') }),
      h('button.btn.btn-ghost.btn-sm', { text: 'Restore backup', onclick: () => fileIn.click() }),
      h('button.btn.btn-danger.btn-sm', { text: 'Erase everything', onclick: () => {
        if (confirm('Erase all plans, week timetable and settings from this browser? This cannot be undone.')) {
          resetAll();
          toast('All local data erased.');
          closeModal();
        }
      } }),
      fileIn,
    ),
  );
  openModal({ title: 'Settings', body });
}
