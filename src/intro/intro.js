/**
 * The intro film — "chaos → order → engine → you".
 * Every visual is a pure function of the film time `t`, so skipping = seeking to the end.
 * Audio cues fire just-in-time from the same clock (nothing left scheduled if you skip).
 */
import { qs, h, prefersReducedMotion } from '../core/dom.js';
import { state, setSetting, setMeta } from '../core/store.js';
import { getStage } from '../main.js';
import * as sound from '../core/sound.js';
import { fmtTime } from '../engine/time.js';

const DUR = 17.4;
// Debug/testing: ?introAt=11.8 freezes the film at that second (skips the gate).
const DEBUG_AT = (() => {
  const v = new URLSearchParams(location.search).get('introAt');
  return v == null ? null : Math.max(0, Math.min(17.4, parseFloat(v) || 0));
})();
const html = document.documentElement;
let playing = null;

/* ---------------- easing & helpers ---------------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const pulse = (t, at, len) => (t < at ? 0 : Math.exp(-(t - at) / len));

/* ---------------- words of a messy day ---------------- */
const WORDS = ['work?', 'gym', 'call wife', '3:45', 'deadline', 'padhai', 'sleep??', 'khana', 'meeting', 'reels', '7 baje', 'laundry', 'exam', 'chai', 'emails', '5 min more'];

function demoPlan() {
  return [
    { id: 'd1', start: 0, end: 420, color: '#6c7cff' },
    { id: 'd2', start: 450, end: 510, color: '#3ecf8e' },
    { id: 'd3', start: 540, end: 780, color: '#00e5ff' },
    { id: 'd4', start: 780, end: 825, color: '#ffd166' },
    { id: 'd5', start: 840, end: 945, color: '#9b6bff' },
    { id: 'd6', start: 1020, end: 1140, color: '#e06cd6' },
    { id: 'd7', start: 1200, end: 1260, color: '#ff5fa2' },
    { id: 'd8', start: 1350, end: 1440, color: '#6c7cff' },
  ];
}

export async function playIntro({ force = false, onBeforeReveal = null } = {}) {
  if (playing) return playing.promise;
  const stage = await getStage();
  const reduced = prefersReducedMotion();
  if (reduced) {
    // Respect the setting: a one-second fade instead of the film.
    if (onBeforeReveal) onBeforeReveal();
    if (stage) stage.quickBoot();
    setMeta('seenIntro', true);
    return;
  }
  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  playing = { promise };

  const gate = qs('#gate');
  const ui = qs('#intro-ui');
  html.classList.add('intro-playing');
  window.scrollTo(0, 0);

  // ---------- gate ----------
  const withSound = DEBUG_AT != null ? false : await runGate(gate, stage, force);
  if (withSound) {
    setSetting('sound', true);
    sound.setEnabled(true);
  }

  ui.hidden = false;
  ui.classList.add('on');
  requestAnimationFrame(() => ui.classList.add('bars'));

  const done = () => {
    finish(stage, ui, onBeforeReveal);
    playing = null;
    setMeta('seenIntro', true);
    resolveFn();
  };

  if (!stage) {
    await fallbackFilm(ui);
    done();
    return promise;
  }
  film(stage, ui, done);
  return promise;
}

/* ---------------- gate ---------------- */
function runGate(gate, stage, force) {
  return new Promise((resolve) => {
    gate.hidden = false;
    gate.classList.remove('leaving');
    const status = qs('#gate-status');
    const bar = qs('#gate-progress');
    const bSound = qs('#enter-sound');
    const bSilent = qs('#enter-silent');
    bSound.disabled = true;
    bSilent.disabled = true;
    let progress = 0;
    const steps = [];
    const fontP = document.fonts ? Promise.race([document.fonts.load('900 100px Orbitron'), new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
    steps.push(fontP.then(() => {
      if (stage) stage.relayoutLogo();
      progress += 0.5;
    }));
    steps.push(new Promise((r) => setTimeout(r, force ? 300 : 900)).then(() => (progress += 0.2)));
    if (stage) {
      // compile shaders once while the gate is up
      steps.push(new Promise((r) => requestAnimationFrame(() => {
        try {
          stage.renderer.compile(stage.scene, stage.camera);
        } catch {
          /* optional */
        }
        progress += 0.3;
        r();
      })));
    } else progress += 0.3;
    let raf = 0;
    const paint = () => {
      bar.style.transform = `scaleX(${Math.min(1, progress)})`;
      raf = requestAnimationFrame(paint);
    };
    paint();
    Promise.all(steps).then(() => {
      progress = 1;
      status.textContent = 'READY';
      bSound.disabled = false;
      bSilent.disabled = false;
      bSound.focus();
    });
    const go = (withSound) => {
      cancelAnimationFrame(raf);
      if (withSound) sound.initAudio();
      gate.classList.add('leaving');
      setTimeout(() => {
        gate.hidden = true;
      }, 700);
      cleanup();
      resolve(withSound);
    };
    const onS = () => go(true);
    const onQ = () => go(false);
    const onKey = (e) => {
      if (e.key === 'Enter' && !bSound.disabled) go(document.activeElement !== bSilent);
    };
    function cleanup() {
      bSound.removeEventListener('click', onS);
      bSilent.removeEventListener('click', onQ);
      document.removeEventListener('keydown', onKey);
    }
    bSound.addEventListener('click', onS);
    bSilent.addEventListener('click', onQ);
    document.addEventListener('keydown', onKey);
  });
}

/* ---------------- captions ---------------- */
function captions(ui) {
  const box = qs('#intro-caption', ui);
  box.replaceChildren();
  const lines = {};
  const make = (key, cls, content) => {
    const el = h('div.cap' + (cls ? '.' + cls : ''));
    if (typeof content === 'string') el.textContent = content;
    else if (content) el.append(content);
    box.appendChild(el);
    lines[key] = el;
    return el;
  };
  make('every', 'small', 'Every day, you get');
  const num = h('b.odo', { text: '0' });
  make('count', 'big', h('span', num, ' minutes.'));
  make('slip', 'mid', 'Most of them slip away.');
  make('unless', 'mid', h('span', 'Unless you ', h('em', { text: 'engineer' }), ' them.'));
  return { lines, num };
}

function bootLine(ui) {
  const el = qs('#intro-boot', ui);
  const text = 'KYPZER ENGINE // BOOT';
  el.textContent = '';
  let i = 0;
  const iv = setInterval(() => {
    el.textContent = text.slice(0, ++i) + (i < text.length ? '▍' : '');
    if (i >= text.length) clearInterval(iv);
  }, 38);
  return () => clearInterval(iv);
}

/* ---------------- the film ---------------- */
function film(stage, ui, onDone) {
  const THREE = stage.THREE;
  const { engine, camera, fx, bloom } = stage;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hero = stage.heroFrame();

  // Words floating through the chaos
  const words = new THREE.Group();
  const wordSprites = WORDS.map((w, i) => {
    const s = textSpriteLocal(THREE, w);
    const side = i % 2 ? 1 : -1;
    s.userData.base = V(side * (1.8 + Math.random() * 5), (Math.random() - 0.5) * 6, 4 + Math.random() * 20);
    s.userData.phase = Math.random() * 6.28;
    s.material.opacity = 0;
    words.add(s);
    return s;
  });
  stage.scene.add(words);

  // Engine starts as chaos
  const P = engine.pUniforms;
  P.uMorph.value = 0;
  P.uLogo.value = 0;
  P.uOpacity.value = 0;
  P.uColA.value.set('#00e5ff');
  P.uColB.value.set('#8b5cf6');
  engine.setExtras(0);
  engine.segmentOpacity = 0;
  engine.setPlan(demoPlan());
  engine.handMinute = 0;
  engine.handTarget = null;
  engine.handVel = 0;
  engine.setProgress(1);
  const g = engine.group;
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.scale.setScalar(1);

  // Camera path (world). Engine moves to the hero pose during the last act.
  const keys = [
    [0.0, V(0, 0, 34), V(0, 0, 0)],
    [1.4, V(0, 0.2, 30), V(0, 0, 0)],
    [4.8, V(0.8, 0.6, 18.5), V(0, 0, 0)],
    [6.4, V(5.5, 4.4, 17.5), V(0, 0, 0)],
    [8.0, V(8.5, 5.2, 15.5), V(0, 0, 0)],
    [9.3, V(-9.8, 2.6, 10.5), V(0, 0, 0)],
    [10.3, V(-2.2, -1.6, 7.2), V(0, -1.4, -6)],
    [11.0, V(0, -2.7, 0.6), V(0, -1.2, -18)],
    [12.3, V(0, -0.5, -4.6), V(0, 0, -18)],
    [13.6, V(0, 0.1, -6.2), V(0, 0, -18)],
    [15.0, V(11, 6.5, -5), V(1.5, 0, -2.5)],
    [16.2, V(10.5, 3, 12.5), hero.tgt.clone().lerp(V(0, 0, 0), 0.4)],
    [DUR, hero.cam.clone(), hero.tgt.clone()],
  ];
  const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal');
  const camU = (t) => {
    for (let i = 0; i < keys.length - 1; i++) {
      if (t <= keys[i + 1][0]) {
        let f = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
        if (i === 0) f = easeIO(f);
        if (i === keys.length - 2) f = easeOut(f);
        return (i + f) / (keys.length - 1);
      }
    }
    return 1;
  };

  const { lines, num } = captions(ui);
  const title = qs('#intro-title', ui);
  const sync = qs('#intro-sync', ui);
  const flashEl = qs('#intro-flash', ui);
  title.classList.remove('in', 'out');
  sync.classList.remove('in', 'out');
  const stopBoot = bootLine(ui);
  const bootEl = qs('#intro-boot', ui);
  bootEl.classList.remove('out');

  // Real "now" for the ending
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const left = 1440 - nowMin;
  sync.replaceChildren(
    h('div.sync-a', 'It’s ', h('b', { text: fmtTime(nowMin, state.settings.clock) }), '.'),
    h('div.sync-b', 'You have ', h('b.grad', { text: left.toLocaleString('en-IN') }), ' minutes left today.'),
  );

  // Audio cues (fire once when t passes them)
  const cues = [
    [0.1, () => sound.cue.boot(sound.audioTime())],
    [0.25, () => sound.cue.heartbeat(sound.audioTime())],
    [1.05, () => sound.cue.heartbeat(sound.audioTime())],
    ...[1.9, 2.3, 2.8, 3.1, 3.6, 3.9, 4.3].map((at, i) => [at, () => sound.cue.twinkle(sound.audioTime(), i)]),
    [4.6, () => sound.cue.riser(sound.audioTime(), 3.0)],
    [4.8, () => sound.cue.heartbeat(sound.audioTime())],
    [5.1, () => sound.cue.ticks(sound.audioTime(), 2.4, 6, 90)],
    [8.0, () => sound.cue.ticks(sound.audioTime(), 2.0, 3, 22)],
    [10.1, () => sound.cue.whoosh(sound.audioTime(), 1.3)],
    [11.7, () => sound.cue.impact(sound.audioTime())],
    [11.75, () => sound.cue.shimmer(sound.audioTime())],
    [11.8, () => sound.cue.pad(sound.audioTime(), 6.5)],
    [15.1, () => sound.cue.softTick(sound.audioTime())],
  ];
  const domCues = [
    [1.3, () => bootEl.classList.add('out')],
    [1.8, () => lines.every.classList.add('in')],
    [2.6, () => {
      lines.count.classList.add('in');
      odometer(num, 1440, 1100);
    }],
    [4.3, () => {
      lines.every.classList.add('out');
      lines.count.classList.add('out');
    }],
    [4.9, () => lines.slip.classList.add('in')],
    [6.6, () => {
      lines.slip.classList.add('out');
      lines.unless.classList.add('in');
    }],
    [8.4, () => lines.unless.classList.add('out')],
    [11.9, () => title.classList.add('in')],
    [13.7, () => title.classList.add('out')],
    [14.3, () => sync.classList.add('in')],
    [16.4, () => ui.classList.remove('bars')],
    [16.7, () => sync.classList.add('out')],
  ];
  let ci = 0;
  let di = 0;

  let t = 0;
  let ended = false;
  const tmpP = V(0, 0, 0);
  const tmpT = V(0, 0, 0);
  const heroPos = hero.pos.clone();
  const heroRot = hero.rot.clone();

  function apply(time) {
    // particles
    P.uOpacity.value = easeOut(seg(time, 1.2, 2.8));
    P.uMorph.value = easeIO(seg(time, 4.8, 7.8));
    P.uLogo.value = easeIO(seg(time, 10.5, 12.3)) * (1 - easeIO(seg(time, 13.8, 16.2)));
    P.uWarp.value = Math.sin(Math.PI * seg(time, 10.2, 12.1)) * 1.0;
    P.uPulse.value = pulse(time, 0.25, 0.25) * 0.6 + pulse(time, 1.05, 0.25) * 0.6 + pulse(time, 4.8, 0.5) * 1.5 + pulse(time, 11.7, 0.5);
    P.uSize.value = 2.2 + 0.6 * seg(time, 10.4, 11.4) * (1 - seg(time, 12.6, 13.6));

    // core: a breathing pixel → ignition
    const ignite = seg(time, 4.75, 5.3);
    const diveHide = 1 - Math.sin(Math.PI * seg(time, 10.1, 11.6)) * 0.85;
    const coreScale = (0.12 + 0.18 * seg(time, 1.2, 4.6) + 0.8 * easeOut(ignite) + Math.sin(time * 7) * 0.02 * (1 - ignite)) * diveHide;
    engine.core.scale.setScalar(coreScale);
    engine.coreGlow.scale.setScalar(1.2 + 3 * coreScale + pulse(time, 4.8, 0.6) * 6 + pulse(time, 0.25, 0.3) + pulse(time, 1.05, 0.3));
    engine.coreU.uPulse.value = pulse(time, 4.8, 0.8) * 2 + pulse(time, 11.7, 0.6);

    // movement + plan arcs
    engine.setExtras(easeOut(seg(time, 7.4, 8.8)));
    engine.segmentOpacity = easeOut(seg(time, 8.6, 9.8)) * (1 - 0.6 * seg(time, 10.2, 11) * (1 - seg(time, 14.5, 16)));

    // the hand sweeps an entire day in ~1.4s, cycling dawn → noon → dusk → night
    const sweep = easeIO(seg(time, 8.2, 9.7));
    if (time < 13.9) {
      engine.handTarget = null;
      engine.handMinute = sweep * 1439.9;
      engine.setProgress(Math.max(1, engine.handMinute));
    } else if (engine.handTarget == null) {
      engine.handMinute = 0;
      engine.handVel = 0;
      engine.setNow(nowMin);
      engine.setProgress(nowMin);
    }
    const hue = seg(time, 8.2, 9.7);
    if (hue > 0 && hue < 1) {
      const stops = ['#00e5ff', '#ffd166', '#f43f5e', '#8b5cf6'];
      const f = hue * 3;
      const i = Math.min(2, Math.floor(f));
      P.uColA.value.set(stops[i]).lerp(new THREE.Color(stops[i + 1]), f - i);
      engine.sweepU.uColor.value.copy(P.uColA.value);
    } else if (hue >= 1) {
      P.uColA.value.lerp(new THREE.Color('#00e5ff'), 0.06);
      engine.sweepU.uColor.value.lerp(new THREE.Color('#00e5ff'), 0.06);
    }

    // engine pose → hero pose in the last act
    const k = easeIO(seg(time, 13.8, DUR));
    g.position.set(heroPos.x * k, heroPos.y * k, heroPos.z * k);
    g.rotation.set(heroRot.x * k, heroRot.y * k, heroRot.z * k);
    g.scale.setScalar(1 + (hero.scale - 1) * k);

    // camera
    const u = camU(time);
    posCurve.getPoint(u, tmpP);
    tgtCurve.getPoint(u, tmpT);
    // handheld drift, stronger early
    const shake = 0.06 * (1 - seg(time, 12, 16));
    tmpP.x += Math.sin(time * 1.3) * shake;
    tmpP.y += Math.sin(time * 1.7 + 1) * shake;
    camera.position.copy(tmpP);
    camera.lookAt(tmpT);
    camera.rotateZ(Math.sin(time * 0.5) * 0.02 * (1 - seg(time, 4, 6)) + (time > 9.3 && time < 11 ? Math.sin(Math.PI * seg(time, 9.3, 11)) * -0.12 : 0));
    camera.fov = 40 + 14 * Math.sin(Math.PI * seg(time, 10.0, 11.9)) - 6 * seg(time, 0, 4.8) * (1 - seg(time, 5, 7));
    camera.updateProjectionMatrix();

    // post
    bloom.strength = 0.9 + pulse(time, 4.8, 0.7) * 1.6 + pulse(time, 11.7, 0.9) * 1.8 + 0.5 * Math.sin(Math.PI * seg(time, 10.2, 11.8));
    fx.uCA.value = 0.0015 + 0.012 * Math.sin(Math.PI * seg(time, 10.0, 12.0)) + pulse(time, 11.7, 0.5) * 0.02;
    fx.uFlash.value = pulse(time, 4.8, 0.2) * 0.3 + pulse(time, 11.7, 0.22) * 0.7;
    const sh = seg(time, 11.7, 13.0);
    fx.uShock.value = easeOut(sh) * 1.7;
    fx.uShockStr.value = time >= 11.7 ? (1 - sh) * 1.2 : 0;
    fx.uWarp.value = Math.sin(Math.PI * seg(time, 10.3, 12.0)) * 0.9;
    fx.uFade.value = 0.2 + 0.8 * seg(time, 0, 0.6);
    fx.uVignette.value = 0.95;

    // words
    const wIn = easeOut(seg(time, 1.8, 3.2));
    const wOut = easeIO(seg(time, 4.6, 6.2));
    for (const s of wordSprites) {
      const b = s.userData.base;
      const drift = Math.sin(time * 0.4 + s.userData.phase) * 0.4;
      s.position.set(b.x * (1 - wOut) + drift, b.y * (1 - wOut) + Math.cos(time * 0.3 + s.userData.phase) * 0.3, b.z * (1 - wOut * 0.9));
      s.material.opacity = wIn * (1 - wOut) * 0.85;
      s.material.rotation = Math.sin(time * 0.2 + s.userData.phase) * 0.05;
    }
  }

  function tick(dt) {
    if (ended) return;
    if (DEBUG_AT != null) {
      t = DEBUG_AT;
      while (di < domCues.length && domCues[di][0] <= t) domCues[di++][1]();
      apply(t);
      return;
    }
    t += dt;
    while (ci < cues.length && cues[ci][0] <= t) cues[ci++][1]();
    while (di < domCues.length && domCues[di][0] <= t) domCues[di++][1]();
    apply(Math.min(t, DUR));
    if (t >= DUR) end();
  }

  function skip() {
    if (ended) return;
    t = DUR;
    // jump DOM to final state
    for (const el of Object.values(lines)) el.classList.add('out');
    bootEl.classList.add('out');
    title.classList.add('out');
    sync.classList.add('out');
    ui.classList.remove('bars');
    apply(DUR);
    engine.handMinute = nowMin - 200;
    engine.setNow(nowMin);
    end();
  }

  function end() {
    if (ended) return;
    ended = true;
    stopBoot();
    document.removeEventListener('keydown', onKey, true);
    skipBtn.removeEventListener('click', skip);
    stage.scene.remove(words);
    words.traverse((o) => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    // hand over to hero mode without a jump
    stage.rig.pos.copy(g.position);
    stage.rig.rot.set(g.rotation.x, g.rotation.y, g.rotation.z);
    stage.rig.scale = g.scale.x;
    stage.rig.cam.copy(camera.position);
    stage.rig.tgt.copy(hero.tgt);
    camera.fov = 40;
    camera.updateProjectionMatrix();
    bloom.strength = 0.95;
    fx.uCA.value = 0.0015;
    fx.uFlash.value = 0;
    fx.uShockStr.value = 0;
    fx.uWarp.value = 0;
    fx.uFade.value = 1;
    fx.uVignette.value = 0.85;
    P.uWarp.value = 0;
    P.uPulse.value = 0;
    P.uSize.value = 2.2;
    engine.core.scale.setScalar(1);
    engine.coreGlow.scale.setScalar(4.2);
    stage.setDirector(null);
    stage.setMode('hero');
    onDone();
  }

  const skipBtn = qs('#skip-intro', ui);
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      skip();
    }
  };
  document.addEventListener('keydown', onKey, true);
  skipBtn.addEventListener('click', skip);
  flashEl.style.opacity = '0';

  stage.setMode('intro');
  stage.setDirector(tick);
  apply(0);
}

function textSpriteLocal(THREE, text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const size = 64;
  g.font = `500 ${size}px "JetBrains Mono", monospace`;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = size * 2;
  g.font = `500 ${size}px "JetBrains Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,229,255,0.9)';
  g.shadowBlur = 18;
  g.fillStyle = '#cfefff';
  g.fillText(text, w / 2, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  s.scale.set((0.55 * c.width) / c.height, 0.55, 1);
  return s;
}

function odometer(el, to, ms) {
  const t0 = performance.now();
  const step = (now) => {
    const k = clamp01((now - t0) / ms);
    el.textContent = Math.round(expoOut(k) * to).toLocaleString('en-IN');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------------- 2D fallback (no WebGL) ---------------- */
function fallbackFilm(ui) {
  return new Promise((resolve) => {
    const { lines, num } = captions(ui);
    const title = qs('#intro-title', ui);
    const seq = [
      [300, () => lines.every.classList.add('in')],
      [900, () => {
        lines.count.classList.add('in');
        odometer(num, 1440, 900);
      }],
      [2600, () => {
        lines.every.classList.add('out');
        lines.count.classList.add('out');
        lines.unless.classList.add('in');
      }],
      [4000, () => {
        lines.unless.classList.add('out');
        title.classList.add('in');
      }],
      [6200, () => {
        title.classList.add('out');
        ui.classList.remove('bars');
      }],
      [6800, resolve],
    ];
    const timers = seq.map(([ms, fn]) => setTimeout(fn, ms));
    const skip = () => {
      timers.forEach(clearTimeout);
      resolve();
    };
    qs('#skip-intro', ui).addEventListener('click', skip, { once: true });
  });
}

/* ---------------- reveal the website ---------------- */
function finish(stage, ui, onBeforeReveal) {
  if (onBeforeReveal) onBeforeReveal();
  html.classList.remove('intro-playing');
  html.classList.add('intro-done');
  ui.classList.add('leaving');
  setTimeout(() => {
    ui.hidden = true;
    ui.classList.remove('on', 'leaving');
  }, 900);
  if (stage) {
    // hero mode keeps rendering; landing.js re-plays its hero reveal
    import('../landing/landing.js').then((m) => m.replayHeroReveal && m.replayHeroReveal());
  }
}
