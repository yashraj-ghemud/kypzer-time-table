/**
 * Focus mode: the plan, live. Countdown ring for the current block, what's next, done/skip,
 * +5 min (pushes what follows), running late, ambient soundscapes, notifications, wake lock.
 */
import { h, frag, qs } from '../core/dom.js';
import { state, getPlan, today, markBlock, dayRecord, setSetting } from '../core/store.js';
import { go } from '../core/router.js';
import { icon } from './icons.js';
import { catIcon } from './timeline.js';
import { toast } from './toast.js';
import { fmtTime, fmtDuration, minutesOfDay } from '../engine/time.js';
import { nowState } from '../engine/plan.js';
import * as sound from '../core/sound.js';
import { tickBurst } from './fx.js';

let root = null;
let timer = 0;
let wakeLock = null;
let lastCurrentId = null;
let baseTitle = '';
let els = null;

const R = 150;
const C = 2 * Math.PI * R;

function pad(n) {
  return String(Math.floor(n)).padStart(2, '0');
}

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return (hh ? hh + ':' + pad(mm) : pad(mm)) + ':' + pad(ss);
}

export async function mountFocus() {
  root = qs('#focus');
  state.ui.date = today();
  baseTitle = document.title;
  build();
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('keydown', onKey);
}

export function unmountFocus() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVis);
  document.removeEventListener('keydown', onKey);
  releaseWake();
  sound.stopAmbient();
  document.title = baseTitle || 'KYPZER';
}

function onVis() {
  if (!document.hidden && wakeLock === 'wanted') requestWake();
}

function onKey(e) {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
  if (e.key === 'Escape') go('/app');
  if (e.key === 'd' || e.key === 'D') doneCurrent();
}

function build() {
  const ring = frag(`<svg class="f-ring" viewBox="0 0 340 340" aria-hidden="true">
    <defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00e5ff"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>
    <circle cx="170" cy="170" r="${R}" class="f-track"/>
    <g class="f-ticks">${Array.from({ length: 60 }, (_, i) => `<line x1="170" y1="${170 - R - 14}" x2="170" y2="${170 - R - (i % 5 ? 10 : 6)}" transform="rotate(${i * 6} 170 170)"/>`).join('')}</g>
    <circle cx="170" cy="170" r="${R}" class="f-prog" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/>
    <circle cx="170" cy="20" r="6" class="f-head"/>
  </svg>`);
  els = {
    ring,
    prog: ring.querySelector('.f-prog'),
    head: ring.querySelector('.f-head'),
    kicker: h('div.f-kicker.mono'),
    title: h('h1.f-title'),
    time: h('div.f-time.mono', { 'aria-live': 'off' }),
    sub: h('div.f-sub.mono'),
    ic: h('div.f-ic'),
    next: h('div.f-next'),
    actions: h('div.f-actions'),
    upcoming: h('div.f-upcoming'),
    tools: h('div.f-tools'),
  };
  const center = h('div.f-center', els.ic, els.kicker, els.title, els.time, els.sub);
  root.replaceChildren(
    h('div.f-stage', h('div.f-ringwrap', els.ring, center)),
    h('div.f-side', els.next, els.actions, els.upcoming, els.tools),
  );
  buildTools();
}

function buildTools() {
  const amb = h('div.radio-row', { role: 'group', 'aria-label': 'Ambient sound' });
  for (const [k, label] of [['off', 'Silence'], ['rain', 'Rain'], ['brown', 'Brown noise'], ['space', 'Deep space'], ['clock', 'Clock']]) {
    const b = h('button', { 'aria-pressed': String(sound.ambientKind() === k), text: label });
    b.addEventListener('click', () => {
      sound.playAmbient(k);
      for (const x of amb.children) x.setAttribute('aria-pressed', String(x === b));
    });
    amb.appendChild(b);
  }
  const notifyBtn = h('button.btn.btn-ghost.btn-xs', { onclick: async () => {
    if (!('Notification' in window)) return toast('Notifications are not supported here.', { kind: 'err' });
    const p = await Notification.requestPermission();
    setSetting('notify', p === 'granted');
    paintNotify();
    toast(p === 'granted' ? 'You’ll get a nudge when each block starts.' : 'Notifications blocked by the browser.', { kind: p === 'granted' ? 'ok' : 'err' });
  } });
  const paintNotify = () => {
    const on = state.settings.notify && 'Notification' in window && Notification.permission === 'granted';
    notifyBtn.textContent = on ? 'Notifications on' : 'Enable notifications';
  };
  paintNotify();
  const wakeBtn = h('button.btn.btn-ghost.btn-xs', { onclick: async () => {
    if (wakeLock && wakeLock !== 'wanted') {
      releaseWake();
      wakeBtn.textContent = 'Keep screen on';
    } else {
      const ok = await requestWake();
      wakeBtn.textContent = ok ? 'Screen stays on ✓' : 'Keep screen on';
      if (!ok) toast('This browser can’t keep the screen awake.', { kind: 'err' });
    }
  }, text: 'Keep screen on' });
  if (!('wakeLock' in navigator)) wakeBtn.hidden = true;
  els.tools.replaceChildren(
    h('div.sec-label', { text: 'Ambience' }), amb,
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } }, notifyBtn, wakeBtn,
      h('a.btn.btn-ghost.btn-xs', { href: '#/app', text: 'Edit plan' })),
  );
}

async function requestWake() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      if (wakeLock && wakeLock !== 'wanted') wakeLock = 'wanted';
    });
    return true;
  } catch {
    return false;
  }
}

function releaseWake() {
  if (wakeLock && wakeLock !== 'wanted') wakeLock.release().catch(() => {});
  wakeLock = null;
}

async function app() {
  const m = await import('./app.js');
  return m;
}

async function doneCurrent() {
  const plan = getPlan(today());
  const nowM = minutesOfDay();
  const { current } = nowState(plan, nowM);
  if (!current.length) return;
  markBlock(today(), current[0].id, 'done');
  const r = els && els.ring && els.ring.getBoundingClientRect ? els.ring.getBoundingClientRect() : null;
  if (r) tickBurst(r.left + r.width / 2, r.top + r.height / 2, current[0].color, 28);
  sound.ui('done');
  toast('Done: ' + current[0].title, { kind: 'ok' });
  tick(true);
}

function tick(force = false) {
  if (!root || !els) return;
  const plan = getPlan(today());
  const nowM = minutesOfDay();
  const done = dayRecord(today()).done || {};
  const { current, next } = nowState(plan, nowM);
  const cur = current.find((b) => done[b.id] !== 'done' && done[b.id] !== 'skipped') || current[0] || null;
  const clock = state.settings.clock;

  if (cur && cur.id !== lastCurrentId) {
    if (lastCurrentId !== null) {
      sound.cue.softTick(sound.audioTime());
      notify('Now: ' + cur.title, fmtTime(cur.start, clock) + ' – ' + fmtTime(cur.end, clock));
    }
    lastCurrentId = cur.id;
    force = true;
  }
  if (!cur && lastCurrentId) lastCurrentId = null;

  root.style.setProperty('--c', cur ? cur.color : '#00e5ff');
  if (!plan.blocks.length) {
    els.kicker.textContent = 'NO PLAN YET';
    els.title.textContent = 'Nothing to focus on';
    els.time.textContent = '--:--';
    els.sub.textContent = 'type your day in the planner first';
    els.ic.innerHTML = icon('dial');
    setProg(0);
    if (force || !els.actions.childElementCount) els.actions.replaceChildren(h('a.btn.btn-primary', { href: '#/app' }, h('span', { text: 'Plan my day' })));
    els.next.replaceChildren();
    els.upcoming.replaceChildren();
    document.title = 'Focus · KYPZER';
    return;
  }

  if (cur) {
    const total = (cur.end - cur.start) * 60;
    const left = (cur.end - nowM) * 60;
    els.kicker.textContent = 'NOW · ' + (cur.category === 'other' ? 'TASK' : cur.category.toUpperCase());
    els.title.textContent = cur.title || 'Untitled';
    els.time.textContent = fmtClock(left);
    els.sub.textContent = 'until ' + fmtTime(cur.end, clock) + ' · ' + fmtDuration(cur.end - cur.start) + ' block';
    els.ic.innerHTML = catIcon(cur.category);
    setProg(1 - left / total);
    document.title = '⏱ ' + fmtClock(left) + ' · ' + cur.title;
    if (done[cur.id] === 'done') els.sub.textContent = 'marked done ✓ — enjoy the rest of the block';
  } else if (next) {
    const left = (next.start - nowM) * 60;
    els.kicker.textContent = 'FREE TIME';
    els.title.textContent = 'Breathe.';
    els.time.textContent = fmtClock(left);
    els.sub.textContent = 'until ' + next.title + ' at ' + fmtTime(next.start, clock);
    els.ic.innerHTML = icon('free');
    const prevEnd = Math.max(0, ...plan.blocks.filter((b) => b.end <= nowM).map((b) => b.end));
    setProg(prevEnd ? (nowM - prevEnd) / Math.max(1, next.start - prevEnd) : 0);
    document.title = '☀ free · ' + fmtClock(left);
  } else {
    els.kicker.textContent = 'DAY COMPLETE';
    els.title.textContent = 'That’s a wrap.';
    const n = plan.blocks.filter((b) => done[b.id] === 'done').length;
    els.time.textContent = n + '/' + plan.blocks.length;
    els.sub.textContent = 'blocks done today';
    els.ic.innerHTML = icon('check');
    setProg(1);
    document.title = 'Done · KYPZER';
  }

  if (force || !els.actions.childElementCount) {
    const acts = [];
    if (cur) {
      acts.push(h('button.btn.btn-primary', { onclick: doneCurrent }, frag(icon('check')), h('span', { text: 'Done' }), h('kbd', { text: 'D' })));
      acts.push(h('button.btn.btn-ghost', { onclick: async () => {
        const m = await app();
        state.ui.date = today();
        const after = plan.blocks.filter((b) => b.start >= cur.end && !b.readOnly && b.srcS != null).map((b) => b.id);
        const ok = m.applyEdit([{ type: 'move', id: cur.id, start: cur.start, end: cur.end + 5 }, ...(after.length ? [{ type: 'shift', ids: after, delta: 5 }] : [])], '+5 min');
        if (ok) tick(true);
      }, disabled: cur.readOnly || cur.srcS == null }, h('span', { text: '+5 min' })));
      acts.push(h('button.btn.btn-ghost', { onclick: () => {
        markBlock(today(), cur.id, 'skipped');
        toast('Skipped ' + cur.title);
        tick(true);
      } }, h('span', { text: 'Skip' })));
    }
    acts.push(h('button.btn.btn-ghost', { onclick: async () => {
      const m = await app();
      state.ui.date = today();
      if (m.runningLate(15)) tick(true);
    } }, frag(icon('late')), h('span', { text: 'Running late +15' })));
    els.actions.replaceChildren(...acts);

    els.next.replaceChildren(next ? h('div.f-nextcard', { '--nc': next.color },
      h('span.mono.small.dim', { text: 'UP NEXT · ' + fmtTime(next.start, clock) }),
      h('b', { text: next.title }),
      h('span.small.dim', { text: 'in ' + fmtDuration(Math.max(0, next.start - nowM)) + ' · ' + fmtDuration(next.end - next.start) })) : h('div'));
    const later = plan.blocks.filter((b) => b.start > nowM && (!next || b.id !== next.id)).slice(0, 4);
    els.upcoming.replaceChildren(later.length ? h('div.sec-label', { text: 'Later today' }) : '', ...later.map((b) =>
      h('div.f-up', { '--c': b.color }, h('span.mono', { text: fmtTime(b.start, clock) }), h('i'), h('span', { text: b.title }))));
  } else if (next) {
    const nt = els.next.querySelector('.small.dim:last-child');
    if (nt) nt.textContent = 'in ' + fmtDuration(Math.max(0, next.start - nowM)) + ' · ' + fmtDuration(next.end - next.start);
  }
}

function setProg(p) {
  p = Math.max(0, Math.min(1, p));
  els.prog.setAttribute('stroke-dashoffset', (C * p).toFixed(1));
  const a = p * Math.PI * 2 - Math.PI / 2;
  els.head.setAttribute('cx', (170 + Math.cos(a) * R).toFixed(1));
  els.head.setAttribute('cy', (170 + Math.sin(a) * R).toFixed(1));
}

function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: 'assets/icons/icon-192.png', tag: 'kypzer-focus' });
  } catch {
    /* some platforms need a service worker for notifications */
  }
}
