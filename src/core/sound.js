/**
 * Procedural sound design with WebAudio — no audio files.
 * UI clicks, intro cues (heartbeat, riser, ticks, whoosh, bass drop, pad) and focus ambiences.
 */
let ctx = null;
let master = null;
let fx = null; // reverb send
let enabled = false;
let ambient = null;

export function isEnabled() {
  return enabled && !!ctx;
}

export function audioTime() {
  return ctx ? ctx.currentTime : 0;
}

function impulse(seconds = 2.6, decay = 2.4) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** Must be called from a user gesture. */
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(comp).connect(ctx.destination);
  const conv = ctx.createConvolver();
  conv.buffer = impulse();
  fx = ctx.createGain();
  fx.gain.value = 0.35;
  fx.connect(conv).connect(master);
  return true;
}

export function setEnabled(on) {
  enabled = !!on;
  if (on) initAudio();
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
  if (!on) stopAmbient();
}

function out(node, wet = 0.2) {
  node.connect(master);
  if (wet > 0) {
    const g = ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(fx);
  }
}

function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}

function tone(freq, { type = 'sine', t = ctx.currentTime, a = 0.005, d = 0.3, peak = 0.3, wet = 0.2, detune = 0, glide = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  o.detune.value = detune;
  env(g, t, a, peak, d);
  o.connect(g);
  out(g, wet);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function burst({ t = ctx.currentTime, d = 0.2, peak = 0.3, type = 'bandpass', f = 2000, f2 = null, q = 1, wet = 0.2, a = 0.005 } = {}) {
  const n = noise();
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  flt.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, peak, d);
  n.connect(flt).connect(g);
  out(g, wet);
  n.start(t, Math.random());
  n.stop(t + a + d + 0.05);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

/* ---------------- UI ---------------- */
export function ui(kind = 'click') {
  if (!isEnabled()) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'click':
      tone(1800, { t, d: 0.03, peak: 0.08, wet: 0.05, type: 'triangle' });
      break;
    case 'tick':
      burst({ t, d: 0.025, peak: 0.12, f: 3500, q: 4, wet: 0.05 });
      break;
    case 'success':
      [0, 2, 4].forEach((n, i) => tone(PENTA[n], { t: t + i * 0.07, d: 0.5, peak: 0.12, wet: 0.4, type: 'sine' }));
      break;
    case 'done':
      tone(PENTA[4], { t, d: 0.25, peak: 0.12, wet: 0.3 });
      tone(PENTA[7], { t: t + 0.08, d: 0.6, peak: 0.1, wet: 0.5 });
      break;
    case 'error':
      tone(220, { t, d: 0.18, peak: 0.12, type: 'square', wet: 0.1, glide: 160 });
      break;
    case 'whoosh':
      burst({ t, d: 0.45, peak: 0.18, f: 400, f2: 3000, q: 0.8, wet: 0.3, a: 0.12 });
      break;
    case 'open':
      tone(660, { t, d: 0.12, peak: 0.07, wet: 0.2, glide: 990 });
      break;
    default:
      break;
  }
}

/* ---------------- Intro cues (scheduled at absolute audio times) ---------------- */
export const cue = {
  heartbeat(t) {
    if (!isEnabled()) return;
    tone(58, { t, d: 0.35, peak: 0.55, wet: 0.1, glide: 38 });
    tone(52, { t: t + 0.22, d: 0.3, peak: 0.35, wet: 0.1, glide: 36 });
  },
  boot(t) {
    if (!isEnabled()) return;
    tone(1318.5, { t, d: 1.6, peak: 0.07, wet: 0.7 });
    tone(659.25, { t: t + 0.05, d: 2.2, peak: 0.05, wet: 0.7 });
  },
  twinkle(t, i = 0) {
    if (!isEnabled()) return;
    tone(PENTA[(i * 3) % PENTA.length] * 2, { t, d: 0.9, peak: 0.035, wet: 0.8 });
  },
  riser(t, dur = 3) {
    if (!isEnabled()) return;
    burst({ t, d: dur, peak: 0.22, f: 200, f2: 6000, q: 2, wet: 0.4, a: dur * 0.9, type: 'bandpass' });
    [0, 7, 12].forEach((semi, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110 * Math.pow(2, semi / 12), t);
      o.frequency.exponentialRampToValueAtTime(440 * Math.pow(2, semi / 12), t + dur);
      o.detune.value = (i - 1) * 9;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(4000, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(f).connect(g);
      out(g, 0.3);
      o.start(t);
      o.stop(t + dur + 0.2);
    });
  },
  ticks(t, dur = 2.6, from = 3, to = 40) {
    if (!isEnabled()) return;
    // accelerating escapement ticks
    let time = 0;
    let i = 0;
    while (time < dur) {
      const k = time / dur;
      const rate = from + (to - from) * k * k;
      burst({ t: t + time, d: 0.02, peak: 0.1 + 0.08 * k, f: i % 2 ? 3200 : 2400, q: 6, wet: 0.15 });
      time += 1 / rate;
      i++;
    }
  },
  whoosh(t, dur = 1.1) {
    if (!isEnabled()) return;
    burst({ t, d: dur, peak: 0.3, f: 300, f2: 5000, q: 0.7, wet: 0.35, a: dur * 0.55 });
  },
  impact(t) {
    if (!isEnabled()) return;
    tone(90, { t, d: 1.8, peak: 0.9, wet: 0.3, glide: 32 });
    tone(45, { t, d: 2.2, peak: 0.5, wet: 0.2, type: 'triangle' });
    burst({ t, d: 1.4, peak: 0.25, f: 1200, f2: 200, q: 0.5, wet: 0.8, type: 'lowpass' });
  },
  shimmer(t) {
    if (!isEnabled()) return;
    [3, 4, 6, 7].forEach((n, i) => tone(PENTA[n] * 2, { t: t + i * 0.06, d: 2.4, peak: 0.03, wet: 0.9 }));
  },
  pad(t, dur = 5) {
    if (!isEnabled()) return;
    [130.81, 196, 246.94, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const flt = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i % 2 ? 1 : -1) * 7;
      flt.type = 'lowpass';
      flt.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 1.2);
      g.gain.setValueAtTime(0.03, t + dur - 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(flt).connect(g);
      out(g, 0.6);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  },
  softTick(t) {
    if (!isEnabled()) return;
    burst({ t, d: 0.04, peak: 0.14, f: 2800, q: 5, wet: 0.4 });
  },
};

/* ---------------- Focus ambiences ---------------- */
export function stopAmbient() {
  if (!ambient) return;
  const a = ambient;
  ambient = null;
  const t = ctx.currentTime;
  a.gain.gain.setTargetAtTime(0.0001, t, 0.4);
  setTimeout(() => {
    a.nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    });
    clearInterval(a.timer);
    a.gain.disconnect();
  }, 1500);
}

export function playAmbient(kind) {
  stopAmbient();
  if (!kind || kind === 'off') return;
  if (!initAudio()) return;
  enabled = true;
  master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.05);
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(master);
  const nodes = [];
  let timer = 0;
  const t = ctx.currentTime;
  if (kind === 'rain' || kind === 'brown') {
    const n = noise();
    const f = ctx.createBiquadFilter();
    if (kind === 'brown') {
      f.type = 'lowpass';
      f.frequency.value = 380;
    } else {
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 0.4;
    }
    n.connect(f).connect(gain);
    n.start();
    nodes.push(n);
    if (kind === 'rain') {
      timer = setInterval(() => {
        if (!ambient) return;
        const tt = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 2400 + Math.random() * 3000;
          env(g, tt + Math.random() * 0.2, 0.001, 0.015, 0.03);
          o.connect(g).connect(gain);
          o.start(tt);
          o.stop(tt + 0.3);
        }
      }, 120);
    }
  } else if (kind === 'space') {
    [55, 82.4, 110, 164.8].forEach((fq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = fq;
      lfo.frequency.value = 0.05 + i * 0.03;
      lg.gain.value = 0.05;
      lfo.connect(lg).connect(g.gain);
      g.gain.value = 0.08;
      o.connect(g).connect(gain);
      const w = ctx.createGain();
      w.gain.value = 0.4;
      g.connect(w).connect(fx);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    });
  } else if (kind === 'clock') {
    let i = 0;
    timer = setInterval(() => {
      if (!ambient) return;
      const tt = ctx.currentTime;
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = i++ % 2 ? 3000 : 2200;
      f.Q.value = 8;
      const g = ctx.createGain();
      env(g, tt, 0.002, 0.25, 0.03);
      n.connect(f).connect(g).connect(gain);
      n.start(tt);
      n.stop(tt + 0.1);
    }, 1000);
  }
  gain.gain.setTargetAtTime(kind === 'clock' ? 0.6 : 0.35, t, 0.8);
  ambient = { kind, gain, nodes, timer };
}

export function ambientKind() {
  return ambient ? ambient.kind : 'off';
}
