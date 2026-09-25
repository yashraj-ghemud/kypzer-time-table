/** Share & export: image cards, calendar (.ics), link + QR, WhatsApp text, print. */
import { h, frag, download, copyText } from '../core/dom.js';
import { state, getPlan, getWeek, dayRecord, today } from '../core/store.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { icon } from './icons.js';
import { renderCard, FORMATS, THEMES } from './card.js';
import { toICS, dayEvents, weekEvents } from '../engine/ics.js';
import { encodeShare } from '../engine/share.js';
import { encodeQR, qrToSvgPath } from '../engine/qr.js';
import { planToText } from '../engine/format.js';
import { fmtDateLong, addDays, parseDateKey } from '../engine/time.js';
import * as sound from '../core/sound.js';

const prefs = { format: 'story', theme: 'midnight' };

export async function shareUrl() {
  const payload = await encodeShare({ d: state.ui.date, t: dayRecord().text || '', w: state.week.text || '' });
  const base = location.href.split('#')[0];
  return base + '#/s/' + payload;
}

export function qrSvg(text, size = 220) {
  const qr = encodeQR(text, { ecc: 'M' });
  const m = 2;
  const n = qr.size + m * 2;
  return `<svg viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path fill="#06080f" d="${qrToSvgPath(qr, m)}"/></svg>`;
}

export function openExport(tab = 'image') {
  const plan = getPlan();
  const tabs = [
    ['image', 'image', 'Image'],
    ['calendar', 'calendar', 'Calendar'],
    ['link', 'qr', 'Link & QR'],
    ['text', 'text', 'Text'],
  ];
  const tabBar = h('div.tabs', { role: 'tablist' });
  const panel = h('div');
  const select = (id) => {
    for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    panel.replaceChildren(({ image: imageTab, calendar: calTab, link: linkTab, text: textTab })[id](plan));
  };
  for (const [id, ic, label] of tabs) {
    const b = h('button', { role: 'tab', dataset: { tab: id }, onclick: () => select(id) }, frag(icon(ic)), label);
    tabBar.appendChild(b);
  }
  openModal({ title: 'Share & export · ' + fmtDateLong(state.ui.date).replace(/, \d{4}$/, ''), body: h('div', tabBar, panel) });
  select(tab);
}

function radioRow(opts, cur, onPick) {
  const row = h('div.radio-row');
  for (const [k, label] of opts) {
    const b = h('button', { 'aria-pressed': String(k === cur), text: label });
    b.addEventListener('click', () => {
      for (const x of row.children) x.setAttribute('aria-pressed', String(x === b));
      onPick(k);
    });
    row.appendChild(b);
  }
  return row;
}

function imageTab(plan) {
  const canvas = h('canvas', { 'aria-label': 'Preview of your day card' });
  const draw = () => renderCard(canvas, plan, { ...prefs, clock: state.settings.clock, dateKey: state.ui.date, done: dayRecord().done });
  const fileName = () => 'kypzer-' + state.ui.date + '-' + prefs.format + '.png';
  const toBlob = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  const canShareFiles = !!(navigator.canShare && navigator.share);
  const wrap = h('div.export-grid',
    h('div.export-preview', canvas),
    h('div',
      h('div.field', h('span.field-label', { text: 'Format' }), radioRow(Object.entries(FORMATS).map(([k, v]) => [k, v.label]), prefs.format, (k) => { prefs.format = k; draw(); })),
      h('div.field', h('span.field-label', { text: 'Theme' }), radioRow(Object.entries(THEMES).map(([k, v]) => [k, v.label]), prefs.theme, (k) => { prefs.theme = k; draw(); })),
      h('div', { style: { display: 'grid', gap: '8px', marginTop: '6px' } },
        h('button.btn.btn-primary', { onclick: async () => {
          download(fileName(), await toBlob(), 'image/png');
          sound.ui('success');
          toast('Image saved', { kind: 'ok' });
        } }, frag(icon('download')), h('span', { text: 'Download PNG' })),
        canShareFiles ? h('button.btn.btn-ghost', { onclick: async () => {
          const file = new File([await toBlob()], fileName(), { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'My day · KYPZER' }).catch(() => {});
          else toast('This browser can’t share images directly — use Download.', { kind: 'err' });
        } }, frag(icon('share')), h('span', { text: 'Share…' })) : null,
      ),
      h('p.small.dim', { style: { marginTop: '12px' }, text: 'Rendered natively at full resolution — crisp on WhatsApp status and Instagram stories.' }),
    ),
  );
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(draw);
  draw();
  return wrap;
}

function calTab(plan) {
  const alarm = state.settings.reminders;
  const dayBtn = h('button.btn.btn-primary', { disabled: !plan.blocks.length, onclick: () => {
    const ics = toICS(dayEvents(state.ui.date, plan.blocks), { calName: 'KYPZER · ' + state.ui.date, alarm });
    download('kypzer-' + state.ui.date + '.ics', ics, 'text/calendar');
    sound.ui('success');
    toast('Calendar file saved — open it to import', { kind: 'ok' });
  } }, frag(icon('calendar')), h('span', { text: 'This day (' + plan.blocks.length + ' events)' }));
  const week = getWeek();
  const monday = addDays(today(), -((parseDateKey(today()).getDay() + 6) % 7));
  const weekBtn = h('button.btn.btn-ghost', { disabled: !week || !week.lines.length, onclick: () => {
    const ics = toICS(weekEvents(monday, week.lines), { calName: 'KYPZER · weekly routine', alarm });
    download('kypzer-week-timetable.ics', ics, 'text/calendar');
    sound.ui('success');
    toast('Recurring timetable saved', { kind: 'ok' });
  } }, frag(icon('week')), h('span', { text: week ? 'Week timetable — ' + week.lines.length + ' recurring events' : 'Week timetable (write one in Week mode)' }));
  return h('div',
    h('p.lede.small', { style: { marginBottom: '14px', color: 'var(--text-2)' }, text: 'Standard .ics files work with Google Calendar, Apple Calendar and Outlook.' + (alarm ? ' Each event has a ' + alarm + '-minute reminder (change in settings).' : '') }),
    h('div', { style: { display: 'grid', gap: '10px' } }, dayBtn, weekBtn),
    h('div.sec-label', { text: 'How to import' }),
    h('ul.small', { style: { color: 'var(--text-2)', paddingLeft: '18px', lineHeight: '1.9' } },
      h('li', { text: 'Phone: open the downloaded file — your calendar app offers to add the events.' }),
      h('li', { text: 'Google Calendar (web): Settings → Import & export → Import → pick the file.' }),
      h('li', { text: 'Apple Calendar / Outlook: double-click the file.' }),
    ),
  );
}

function linkTab() {
  const input = h('input.input', { readonly: true, value: 'generating…', 'aria-label': 'Share link' });
  const qrBox = h('div.qr-box', h('span', { text: '…' }));
  const note = h('p.small.dim', { style: { marginTop: '10px', textAlign: 'center' } });
  const shareBtn = navigator.share ? h('button.btn.btn-ghost', { onclick: () => navigator.share({ title: 'My plan · KYPZER', url: input.value }).catch(() => {}) }, frag(icon('share')), h('span', { text: 'Share…' })) : null;
  shareUrl().then((url) => {
    input.value = url;
    try {
      qrBox.innerHTML = qrSvg(url);
      note.textContent = 'Scan to open this plan on your phone — then run Focus there. ' + url.length + ' characters, no server involved.';
    } catch {
      qrBox.replaceChildren(h('span', { text: 'Plan too long for a QR code — use the link.' }));
    }
  });
  return h('div',
    h('div.link-row', input, h('button.btn.btn-primary', { onclick: async () => {
      if (await copyText(input.value)) {
        sound.ui('success');
        toast('Link copied', { kind: 'ok' });
      }
    } }, frag(icon('link')), h('span', { text: 'Copy' })), shareBtn),
    h('div', { style: { marginTop: '18px' } }, qrBox),
    note,
    h('p.small.dim', { style: { marginTop: '6px', textAlign: 'center' }, text: 'The whole plan is compressed into the link. Anyone with it can view and import a copy.' }),
  );
}

function textTab(plan) {
  const text = planToText(plan.blocks, { clock: state.settings.clock, title: 'My day · ' + fmtDateLong(state.ui.date).replace(/, \d{4}$/, ''), stats: plan.analysis.stats });
  const ta = h('textarea.text-out', { 'aria-label': 'Plan as text' });
  ta.value = text;
  return h('div',
    ta,
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
      h('button.btn.btn-primary', { onclick: async () => {
        if (await copyText(ta.value)) {
          sound.ui('success');
          toast('Copied — paste it anywhere', { kind: 'ok' });
        }
      } }, frag(icon('text')), h('span', { text: 'Copy text' })),
      h('a.btn.btn-ghost', { href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener' }, frag(icon('phone')), h('span', { text: 'Send on WhatsApp' })),
      h('button.btn.btn-ghost', { onclick: () => window.print() }, frag(icon('download')), h('span', { text: 'Print' })),
    ),
  );
}
