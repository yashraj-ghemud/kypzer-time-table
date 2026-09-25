/**
 * Landing: scroll choreography for the 3D engine, reveals, and live mini-demos that run the real engine.
 */
import { h, qs, qsa, esc, prefersReducedMotion, tweenNumber } from '../core/dom.js';
import { state, getPlan, today } from '../core/store.js';
import { parse } from '../engine/parser.js';
import { buildPlan } from '../engine/plan.js';
import { fmtTime, fmtDuration, minutesOfDay } from '../engine/time.js';
import { ringsSVG, setRings } from '../ui/insights.js';
import { getStage } from '../main.js';

const SECTION_IDS = ['hero', 'sec-demo', 'sec-thinks', 'sec-rings', 'sec-live', 'sec-everywhere', 'sec-week', 'sec-private', 'sec-final'];
const DEMO_TEXT = 'subah 7 baje gym\n9 to 1 : deep work\nlunch at 1 for 45 min\nstandup 2pm 15m\nsadhe 3 se 5 tak padhai\nreport 1h before 6pm !\n5:00 to 7 pm : call to wife\nraat 11 baje so jaana';
const HERO_EXAMPLES = ['3:50 to 5 pm : work, 5 to 7 pm : call to wife', 'subah 7 baje gym, study 2h, report 1h before 6pm !', 'lunch at 1 for 45m, standup 2pm 15m, walk 30m', 'sadhe 3 se 5 baje tak padhai, raat 11 baje so jaana'];

let mounted = false;
let active = false;
let timers = [];
let raf = 0;
let stage = null;
let io = null;

export function mountLanding() {
  active = true;
  if (!mounted) {
    mounted = true;
    setupReveals();
    setupTilt();
    setupRingsDemo();
    setupWeekDemo();
  }
  getStage().then((s) => {
    stage = s;
    if (!stage) return;
    const plan = getPlan(today());
    stage.setPlan(plan.blocks.length ? plan.blocks : demoBlocks());
    stage.engine.setClock(state.settings.clock);
  });
  startLoops();
  onScroll();
}

export function pauseLanding() {
  active = false;
  for (const t of timers) clearInterval(t);
  timers = [];
  cancelAnimationFrame(raf);
  window.removeEventListener('scroll', onScroll);
}

export function replayHeroReveal() {
  const hero = qs('#hero');
  for (const el of qsa('.reveal-lines, .reveal-up', hero)) {
    el.classList.remove('in');
    void el.offsetWidth;
  }
  requestAnimationFrame(() => {
    for (const el of qsa('.reveal-lines, .reveal-up', hero)) el.classList.add('in');
    const num = qs('#hero-num');
    num.dataset.v = '0';
    tweenNumber(num, 1440, { duration: 1600, format: (v) => Math.round(v).toLocaleString('en-IN') });
  });
}

function demoBlocks() {
  return buildPlan({ text: DEMO_TEXT, settings: { fromNow: false } }).blocks;
}

/* ---------------- loops ---------------- */
function startLoops() {
  for (const t of timers) clearInterval(t);
  timers = [];
  window.addEventListener('scroll', onScroll, { passive: true });
  const heroTick = () => {
    const m = minutesOfDay();
    qs('#hero-now').textContent = 'NOW ' + fmtTime(m, state.settings.clock);
    qs('#hero-left').textContent = Math.max(0, Math.floor(1440 - m)).toLocaleString('en-IN');
  };
  heroTick();
  timers.push(setInterval(heroTick, 1000));
  setupHeroExamples();
  // focus demo countdown
  let secs = 42 * 60 + 17;
  const prog = qs('#focus-demo-prog');
  const C = 2 * Math.PI * 96;
  prog.setAttribute('stroke-dasharray', C.toFixed(1));
  const fd = () => {
    secs = secs <= 0 ? 60 * 60 : secs - 1;
    qs('#focus-demo-time').textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    prog.setAttribute('stroke-dashoffset', (C * (1 - secs / 3600)).toFixed(1));
  };
  fd();
  timers.push(setInterval(fd, 1000));
  // running-late demo
  const late = qs('#late-demo');
  let shifted = false;
  const ld = () => {
    if (prefersReducedMotion()) return;
    shifted = !shifted;
    late.classList.toggle('shifted', shifted);
    const base = [[4, 0], [5, 0], [6, 30]];
    qsa('.ld-row span', late).forEach((s, i) => {
      const [hh, mm] = base[i];
      const total = hh * 60 + mm + (shifted ? 15 : 0);
      s.textContent = Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    });
  };
  timers.push(setInterval(ld, 2600));
}

/* ---------------- scroll ---------------- */
let demoLast = -1;
function onScroll() {
  if (!active) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const vh = innerHeight;
    const center = scrollY + vh * 0.5;
    const tops = SECTION_IDS.map((id) => {
      const el = document.getElementById(id);
      return el ? el.getBoundingClientRect().top + scrollY : 0;
    });
    let i = 0;
    while (i < tops.length - 1 && center >= tops[i + 1]) i++;
    const next = tops[i + 1] ?? tops[i] + vh;
    const p = Math.max(0, Math.min(1, (center - tops[i]) / Math.max(1, next - tops[i])));
    // hold the frame for most of the section, then travel to the next one
    const travel = Math.max(0, (p - 0.55) / 0.45);
    if (stage) stage.setScroll(i, travel);
    document.documentElement.style.setProperty('--scroll', String(scrollY / Math.max(1, document.body.scrollHeight - vh)));
    // scroll-scrubbed typing demo
    const demo = qs('#sec-demo');
    const r = demo.getBoundingClientRect();
    const dp = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
    const chars = prefersReducedMotion() ? DEMO_TEXT.length : Math.round(Math.min(1, dp * 1.15) * DEMO_TEXT.length);
    if (chars !== demoLast) {
      demoLast = chars;
      renderDemo(chars);
    }
    qs('#demo-progress').style.transform = `scaleX(${dp})`;
    // nav shadow
    qs('#nav').classList.toggle('scrolled', scrollY > 20);
  });
}

/* ---------------- demo ---------------- */
const demoSeen = new Set();
function renderDemo(n) {
  const text = DEMO_TEXT.slice(0, n);
  const { tokens } = parse(text);
  let out = '';
  let pos = 0;
  for (const t of tokens) {
    if (t.s < pos) continue;
    out += esc(text.slice(pos, t.s)) + `<span class="tk-${t.type}">${esc(text.slice(t.s, t.e))}</span>`;
    pos = t.e;
  }
  out += esc(text.slice(pos)) + '<span class="caret"></span>';
  qs('#demo-code').innerHTML = out;
  // only complete lines become blocks (like pressing enter)
  const complete = text.lastIndexOf('\n') === -1 ? (n === DEMO_TEXT.length ? text : '') : n === DEMO_TEXT.length ? text : text.slice(0, text.lastIndexOf('\n'));
  const plan = buildPlan({ text: complete, settings: { fromNow: false, clock: state.settings.clock } });
  const box = qs('#demo-timeline');
  const ids = new Set(plan.blocks.map((b) => b.id));
  box.replaceChildren(...plan.blocks.map((b) => {
    const isNew = !demoSeen.has(b.id);
    const row = h('div.dm-row' + (isNew ? '.new' : '') + (b.kind === 'auto' ? '.auto' : ''), { '--c': b.color },
      h('span.dm-t', { text: fmtTime(b.start, state.settings.clock).replace(/:00 /, ' ') }),
      h('span.dm-bar', h('i', { style: { width: Math.min(100, ((b.end - b.start) / 240) * 100) + '%' } })),
      h('span.dm-n', { text: b.title }),
      h('span.dm-d', { text: b.kind === 'auto' ? 'auto · ' + fmtDuration(b.end - b.start) : fmtDuration(b.end - b.start) }),
    );
    return row;
  }));
  for (const id of [...demoSeen]) if (!ids.has(id)) demoSeen.delete(id);
  for (const id of ids) demoSeen.add(id);
  if (plan.blocks.length) {
    box.appendChild(h('div.dm-score', h('span', { text: 'DAY SCORE' }), h('b', { text: String(plan.analysis.score.total) }), h('span.dim', { text: plan.analysis.insights[0] ? '· ' + plan.analysis.insights[0].title.en : '' })));
  }
}

/* ---------------- reveals ---------------- */
function setupReveals() {
  // the hero is on screen at load: reveal it right away (no observer round-trip)
  requestAnimationFrame(() => qsa('#hero .reveal-lines, #hero .reveal-up').forEach((e) => e.classList.add('in')));
  const els = qsa('.reveal-lines, .reveal-up').filter((e) => !e.closest('#hero'));
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    els.forEach((e) => e.classList.add('in'));
    return;
  }
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  els.forEach((e, i) => {
    if (e.classList.contains('reveal-up')) e.style.transitionDelay = (i % 4) * 90 + 'ms';
    io.observe(e);
  });
}

function setupTilt() {
  if (prefersReducedMotion() || !matchMedia('(pointer: fine)').matches) return;
  for (const card of qsa('.tilt')) {
    const glare = h('span.glare');
    card.appendChild(glare);
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * 10}deg) rotateY(${x * 12}deg) translateZ(0)`;
      glare.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,.14), transparent 55%)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
      glare.style.background = '';
    });
  }
}

function setupHeroExamples() {
  const input = qs('#hero-input');
  if (prefersReducedMotion()) return;
  let ex = 0;
  let i = 0;
  let dir = 1;
  const step = () => {
    if (!active || document.activeElement === input || input.value) {
      timers.push(setTimeout(step, 800));
      return;
    }
    const s = HERO_EXAMPLES[ex];
    i += dir;
    if (i > s.length) {
      dir = -1;
      timers.push(setTimeout(step, 2000));
      return;
    }
    if (i <= 0) {
      dir = 1;
      ex = (ex + 1) % HERO_EXAMPLES.length;
    }
    input.placeholder = s.slice(0, Math.max(0, i)) + '▍';
    timers.push(setTimeout(step, dir > 0 ? 34 : 12));
  };
  step();
}

function setupRingsDemo() {
  const box = qs('#landing-rings');
  const svg = ringsSVG(null, { stroke: 10 });
  const num = h('b', { text: '0' });
  box.append(h('div.rings.big', svg, h('div.total', h('div', num, h('span', { text: 'DAY SCORE' })))));
  const values = [
    { focus: 86, recovery: 74, balance: 92, total: 84 },
    { focus: 62, recovery: 45, balance: 58, total: 55 },
    { focus: 94, recovery: 88, balance: 80, total: 87 },
  ];
  let k = 0;
  const show = () => {
    const v = values[k++ % values.length];
    setRings(svg, v);
    tweenNumber(num, v.total, { duration: 1200 });
  };
  const obs = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) {
      show();
      obs.disconnect();
      const t = setInterval(() => active && show(), 3600);
      timers.push(t);
    }
  }, { threshold: 0.3 });
  obs.observe(box);
}

function setupWeekDemo() {
  const box = qs('#week-demo');
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const slots = [
    ['maths', 'maths', 'maths', 'maths', 'maths'],
    ['physics', 'chem lab', 'physics', 'chem lab', 'physics'],
    ['lunch', 'lunch', 'lunch', 'lunch', 'lunch'],
    ['coding club', 'tuition', 'coding club', 'tuition', ''],
  ];
  const colors = { maths: '#9b6bff', physics: '#00e5ff', 'chem lab': '#3ecf8e', lunch: '#ffd166', 'coding club': '#5ac8fa', tuition: '#f43f5e' };
  const grid = h('div.wd-grid');
  days.forEach((d) => grid.appendChild(h('div.wd-head.mono', { text: d })));
  slots.forEach((row, r) => row.forEach((name, c) => grid.appendChild(name ? h('div.wd-cell', { '--c': colors[name], style: { '--d': (r * 5 + c) * 55 + 'ms' } }, name) : h('div.wd-cell.empty'))));
  box.appendChild(grid);
  box.appendChild(h('code.wd-code', { text: 'mon-fri 9 to 10am : maths' }));
}
