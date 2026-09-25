/**
 * KYPZER — boot. Routes: landing (#/), planner (#/app), focus (#/focus), shared (#/s/…).
 */
import { qs, qsa, frag } from './core/dom.js';
import { state, setText, dayRecord, today, setMeta, setSetting, subscribe } from './core/store.js';
import { onRoute, startRouter, go } from './core/router.js';
import { icon } from './ui/icons.js';
import * as sound from './core/sound.js';
import { fmtTime, minutesOfDay } from './engine/time.js';

const html = document.documentElement;

/* ---------- static icon hydration ---------- */
for (const el of qsa('[data-icon]')) el.replaceWith(frag(icon(el.dataset.icon)));

/* ---------- sound toggle ---------- */
const soundBtn = qs('#btn-sound');
function paintSound() {
  const on = !!state.settings.sound;
  soundBtn.innerHTML = icon(on ? 'sound' : 'mute');
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
soundBtn.addEventListener('click', () => {
  const on = !state.settings.sound;
  setSetting('sound', on);
  sound.setEnabled(on);
  if (on) sound.ui('open');
  paintSound();
});
paintSound();
subscribe((r) => { if (r === 'settings' || r === 'import') paintSound(); });
// audio can only start after a gesture
window.addEventListener('pointerdown', () => { if (state.settings.sound) sound.setEnabled(true); }, { once: true });
qs('#btn-palette').innerHTML = icon('command');
qs('#btn-palette').addEventListener('click', () => openPalette());

/* ---------- nav clock + brand hand ---------- */
function tickClock() {
  const now = new Date();
  const m = minutesOfDay(now);
  qs('#nav-clock').textContent = fmtTime(m, state.settings.clock);
  qs('.brand-mark').style.setProperty('--hand', (m / 1440) * 360 + 'deg');
}
tickClock();
setInterval(tickClock, 10000);

/* ---------- routing ---------- */
const views = { landing: qs('#view-landing'), app: qs('#view-app'), focus: qs('#view-focus'), share: qs('#view-share') };
let landingMod = null;

onRoute(async (route, prev) => {
  html.dataset.route = route.name;
  for (const [name, el] of Object.entries(views)) el.hidden = name !== route.name;
  for (const a of qsa('[data-nav]')) a.classList.toggle('on', a.dataset.nav === route.name);
  document.title = { landing: 'KYPZER — Time Engine', app: 'Planner · KYPZER', focus: 'Focus · KYPZER', share: 'Shared plan · KYPZER' }[route.name];

  if (prev && prev.name === 'app') (await import('./ui/app.js')).appVisible(false);
  if (prev && prev.name === 'focus') (await import('./ui/focus.js')).unmountFocus();

  const stage = await getStage();
  if (stage) stage.setMode(route.name === 'landing' ? 'hero' : route.name === 'focus' ? 'focus' : 'off');

  if (route.name === 'landing') {
    landingMod = landingMod || (await import('./landing/landing.js'));
    landingMod.mountLanding();
  } else if (landingMod) landingMod.pauseLanding();

  if (route.name === 'app') {
    const app = await import('./ui/app.js');
    app.mountApp();
    app.appVisible(true);
    if (route.sub === 'week') app.setMode('week');
  } else if (route.name === 'focus') {
    (await import('./ui/focus.js')).mountFocus();
  } else if (route.name === 'share') {
    (await import('./ui/shared.js')).mountShared(route.payload);
  }
});

/* ---------- 3D stage (lazy, optional) ---------- */
let stagePromise = null;
export function getStage() {
  if (!stagePromise) {
    stagePromise = import('./three/stage.js')
      .then((m) => m.createStage(qs('#stage')))
      .catch((err) => {
        console.warn('[kypzer] 3D stage unavailable:', err && err.message);
        html.classList.add('no-webgl');
        return null;
      });
  }
  return stagePromise;
}

/* ---------- hero command → planner ---------- */
qs('#hero-command').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = qs('#hero-input').value.trim();
  if (v) {
    const cur = dayRecord(today()).text || '';
    const parts = v.split(/\s*,\s*/).join('\n');
    setText(cur.trim() ? cur.replace(/\s*$/, '') + '\n' + parts : parts, today());
  }
  state.ui.date = today();
  state.ui.mode = 'day';
  sound.ui('whoosh');
  go('/app');
});

/* ---------- global shortcuts ---------- */
let paletteMod = null;
async function openPalette() {
  paletteMod = paletteMod || (await import('./ui/palette.js'));
  paletteMod.openPalette();
}

document.addEventListener('keydown', async (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
    return;
  }
  if (html.classList.contains('intro-playing')) return;
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.modal-backdrop, .palette-wrap')) return;
  const route = html.dataset.route;
  if (e.key === '/' && route === 'app') {
    e.preventDefault();
    (await import('./ui/app.js')).focusEditor();
  } else if (e.key === 'f' || e.key === 'F') {
    go(route === 'focus' ? '/app' : '/focus');
  } else if (e.key === 'g' && route === 'app') (await import('./ui/app.js')).setView('grid');
  else if (e.key === 't' && route === 'app') (await import('./ui/app.js')).setView('timeline');
  else if (e.key === 'd' && route === 'app') (await import('./ui/app.js')).setView('dial');
  else if (e.key === '?') openPalette();
});

/* ---------- replay intro ---------- */
qs('#replay-intro').addEventListener('click', async () => {
  window.scrollTo({ top: 0 });
  (await import('./intro/intro.js')).playIntro({ force: true });
});

/* ---------- boot sequence ---------- */
async function boot() {
  const firstVisit = !state.meta.seenIntro;
  const initial = (location.hash || '#/').replace(/^#/, '') || '/';
  if (firstVisit && (initial === '/' || initial === '')) {
    const intro = await import('./intro/intro.js');
    await intro.playIntro({ force: false, onBeforeReveal: () => startRouter() });
    setMeta('seenIntro', true);
  } else {
    startRouter();
    const stage = await getStage();
    if (stage && html.dataset.route === 'landing') stage.quickBoot();
  }
  const cursor = await import('./landing/cursor.js');
  cursor.initCursor();
}

boot();

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost:5199/.test(location.host)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
