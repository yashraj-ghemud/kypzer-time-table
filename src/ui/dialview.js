/**
 * Dial 3D: your day on the Kypzer Engine ring. Drag to orbit, scroll to zoom, hover an arc for
 * details, click to select (syncs with the editor). Lightweight: its own renderer, no post-processing.
 */
import * as THREE from 'three';
import { Engine } from '../three/engine.js';
import { h } from '../core/dom.js';
import { fmtTime, fmtDuration, minutesOfDay } from '../engine/time.js';
import { categoryInfo } from '../engine/lexicon.js';
import { prefersReducedMotion } from '../core/dom.js';

export function mountDialView(container, { clock = '12h', onSelect } = {}) {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL unavailable');
  const wrap = h('div.dial-wrap');
  const canvas = h('canvas', { 'aria-label': '3D dial of your day. Drag to rotate.', role: 'img' });
  const centerTitle = h('b');
  const centerSub = h('span');
  const center = h('div.dial-center', centerTitle, centerSub);
  const tip = h('div.dial-tip');
  const legend = h('div.dial-legend', { text: 'drag to orbit · scroll to zoom · click an arc' });
  wrap.append(canvas, center, tip, legend);
  container.replaceChildren(wrap);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const engine = new Engine({ particles: 2800, logo: false, clock });
  engine.pUniforms.uMorph.value = 1;
  engine.pUniforms.uSize.value = 1.8;
  engine.setExtras(1);
  scene.add(engine.group);

  // spherical orbit
  const orbit = { theta: 0.35, phi: 1.2, r: 18, vt: 0, vp: 0, tTheta: 0.35, tPhi: 1.2, tR: 18 };
  let dragging = false;
  let moved = false;
  let lx = 0;
  let ly = 0;
  const reduced = prefersReducedMotion();

  const onDown = (e) => {
    dragging = true;
    moved = false;
    lx = e.clientX;
    ly = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
  };
  const onMove = (e) => {
    if (dragging) {
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      lx = e.clientX;
      ly = e.clientY;
      orbit.tTheta -= dx * 0.006;
      orbit.tPhi = Math.max(0.35, Math.min(2.6, orbit.tPhi - dy * 0.006));
    }
    hover(e);
  };
  const onUp = (e) => {
    dragging = false;
    if (!moved) click(e);
  };
  const onWheel = (e) => {
    e.preventDefault();
    orbit.tR = Math.max(10, Math.min(30, orbit.tR * (1 + Math.sign(e.deltaY) * 0.08)));
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => {
    tip.classList.remove('on');
    if (!selectedId) engine.highlight([]);
  });
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let selectedId = null;
  let plan = null;

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(engine.segMeshes, false)[0];
    return hit ? hit.object.userData.block : null;
  }
  function hover(e) {
    const b = dragging ? null : pick(e);
    canvas.style.cursor = b ? 'pointer' : dragging ? 'grabbing' : 'grab';
    if (b) {
      const r = canvas.getBoundingClientRect();
      const info = categoryInfo(b.category, b.title);
      tip.replaceChildren(h('b', { text: b.title || 'Untitled' }), h('span.mono.small', { text: fmtTime(b.start, clock) + ' – ' + fmtTime(b.end, clock) + ' · ' + fmtDuration(b.end - b.start) + ' · ' + info.label }));
      tip.style.left = e.clientX - r.left + 'px';
      tip.style.top = e.clientY - r.top + 'px';
      tip.classList.add('on');
      engine.highlight([b.id]);
    } else {
      tip.classList.remove('on');
      engine.highlight(selectedId ? [selectedId] : []);
    }
  }
  function click(e) {
    const b = pick(e);
    if (b && onSelect) onSelect(b);
  }

  function paintCenter() {
    if (!plan) return;
    const sel = plan.blocks.find((b) => b.id === selectedId);
    if (sel) {
      centerTitle.textContent = sel.title || 'Untitled';
      centerSub.textContent = fmtTime(sel.start, clock) + ' – ' + fmtTime(sel.end, clock);
      return;
    }
    if (plan.isToday) {
      const m = minutesOfDay();
      centerTitle.textContent = fmtTime(m, clock);
      centerSub.textContent = Math.max(0, Math.floor(1440 - m)) + ' min left today';
    } else {
      centerTitle.textContent = plan.blocks.length + ' blocks';
      centerSub.textContent = fmtDuration(plan.analysis.stats.busy) + ' planned';
    }
  }

  function resize() {
    const w = wrap.clientWidth || 600;
    const hgt = wrap.clientHeight || 420;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    engine.pUniforms.uPR.value = renderer.getPixelRatio();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  let running = true;
  let last = performance.now();
  let acc = 0;
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
    last = t;
    if (document.hidden) return;
    if (!dragging && !reduced) orbit.tTheta += dt * 0.03;
    orbit.theta += (orbit.tTheta - orbit.theta) * Math.min(1, dt * 6);
    orbit.phi += (orbit.tPhi - orbit.phi) * Math.min(1, dt * 6);
    orbit.r += (orbit.tR - orbit.r) * Math.min(1, dt * 6);
    // orbit around the ring's facing axis (+Z)
    const x = orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta);
    const y = orbit.r * Math.cos(orbit.phi);
    const z = orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.set(x, -y * 0.6 + 1, z);
    camera.lookAt(0, 0, 0);
    acc += dt;
    if (acc > 1) {
      acc = 0;
      if (plan && plan.isToday) {
        const m = minutesOfDay();
        engine.setNow(m);
        engine.setProgress(m);
      }
      paintCenter();
    }
    engine.update(dt, { reduced });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  if (/[?&]debug\b/.test(location.search)) window.__dial = { camera, engine, orbit };

  return {
    update(p, selected) {
      plan = p;
      selectedId = selected || null;
      engine.setPlan(p.blocks);
      engine.highlight(selectedId ? [selectedId] : []);
      const m = p.isToday ? minutesOfDay() : 0;
      if (p.isToday) {
        engine.setNow(m);
        engine.setProgress(m);
        engine.hand.visible = true;
        engine.progMesh.visible = true;
      } else {
        engine.hand.visible = false;
        if (engine.progMesh) engine.progMesh.visible = false;
      }
      paintCenter();
    },
    highlight(ids) {
      engine.highlight(ids && ids.length ? ids : selectedId ? [selectedId] : []);
    },
    resize,
    destroy() {
      running = false;
      ro.disconnect();
      engine.dispose();
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    },
  };
}
