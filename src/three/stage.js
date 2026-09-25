/**
 * Stage: the persistent full-screen WebGL layer behind the website.
 * Modes: 'intro' (a director drives everything) · 'hero' (landing, scroll-choreographed) · 'focus' · 'off'.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Engine } from './engine.js';
import { prefersReducedMotion } from '../core/dom.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uCA: { value: 0.0015 },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#bff8ff') },
    uShock: { value: 0 },
    uShockStr: { value: 0 },
    uWarp: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uCA, uVignette, uGrain, uFlash, uShock, uShockStr, uWarp, uFade;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 split(vec2 uv, vec2 dir, float amt){
      return vec3(texture2D(tDiffuse, uv + dir * amt).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * amt).b);
    }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5; c.x *= uAspect;
      float d = length(c);
      if (uShockStr > 0.0) {
        float x = d - uShock;
        float ring = exp(-(x * x) / 0.006);
        vec2 n = normalize(c + 1e-5); n.x /= uAspect;
        uv -= n * ring * uShockStr * 0.045;
      }
      vec2 dir = uv - 0.5;
      float ca = uCA * (0.35 + d * 1.6);
      vec3 col;
      if (uWarp > 0.002) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float k = float(i) / 7.0;
          acc += split(uv - dir * k * uWarp * 0.09, dir, ca);
        }
        col = acc / 8.0;
      } else {
        col = split(uv, dir, ca);
      }
      col *= mix(1.0, smoothstep(1.25, 0.25, d), uVignette);
      col += (hash(uv * 1000.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      col += uFlashColor * uFlash;
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Sky sphere around everything. Outputs LINEAR values (the output pass encodes to sRGB).
const SKY_VS = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BACKDROP_FS = /* glsl */ `
  uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uO;
  varying vec3 vDir;
  void main(){
    vec3 base = vec3(0.0017, 0.0023, 0.0048);
    vec3 da = normalize(vec3(0.3 + 0.05 * sin(uTime * 0.1), 0.12, -1.0));
    vec3 db = normalize(vec3(-0.45, -0.3 + 0.04 * cos(uTime * 0.13), -1.0));
    float a = pow(max(0.0, dot(vDir, da)), 16.0);
    float b = pow(max(0.0, dot(vDir, db)), 12.0);
    float horizon = pow(1.0 - abs(vDir.y), 10.0);
    vec3 col = base + (uA * a * 0.009 + uB * b * 0.011 + uB * horizon * 0.002) * uO;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const FLOOR_FS = /* glsl */ `
  uniform float uO; uniform float uTime;
  varying vec2 vUv;
  void main(){
    vec2 g = vUv * 80.0;
    vec2 f = abs(fract(g - vec2(0.0, uTime * 0.05)) - 0.5);
    float line = smoothstep(0.47, 0.5, max(f.x, f.y));
    float fade = smoothstep(0.5, 0.05, length(vUv - 0.5));
    gl_FragColor = vec4(vec3(0.0, 0.9, 1.0) * line * fade * 0.03 * uO, 1.0);
  }
`;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Framing for each landing section (desktop). */
const SECTIONS = [
  { pos: V(5.4, 0.1, 0), rot: V(-0.16, -0.42, 0), scale: 0.86, dim: 1, cam: V(0, 0.4, 17), tgt: V(1.6, 0, 0), theme: 0 },
  { pos: V(-6.5, 0.6, -10), rot: V(-0.55, 0.55, 0.1), scale: 1, dim: 0.4, cam: V(0, 0.6, 17), tgt: V(0, 0, 0), theme: 0 },
  { pos: V(0, -2.4, -12), rot: V(-1.2, 0, 0.3), scale: 1.35, dim: 0.5, cam: V(0, 1.2, 17), tgt: V(0, -0.5, 0), theme: 1 },
  { pos: V(-2, -3.2, -16), rot: V(-1.15, 0.2, 0.5), scale: 1.5, dim: 0.35, cam: V(0, 1, 17), tgt: V(0, -0.5, 0), theme: 2 },
  { pos: V(-10, 1, -16), rot: V(-0.3, 0.7, 0), scale: 1.1, dim: 0.35, cam: V(0, 0.4, 17), tgt: V(0, 0, 0), theme: 0 },
  { pos: V(0, -3.5, -9), rot: V(-1.3, 0, -0.4), scale: 1.4, dim: 0.5, cam: V(0, 1.5, 17), tgt: V(0, -0.8, 0), theme: 1 },
  { pos: V(0, -3.6, -15), rot: V(-1.25, 0, 0.9), scale: 1.5, dim: 0.35, cam: V(0, 1.2, 17), tgt: V(0, -0.6, 0), theme: 2 },
  { pos: V(0, 0, -9), rot: V(-0.35, 0.2, 0), scale: 1, dim: 0.45, cam: V(0, 0.2, 17), tgt: V(0, 0, 0), theme: 0 },
  { pos: V(0, 0.2, -2), rot: V(0, 0, 0), scale: 1.05, dim: 0.8, cam: V(0, 0, 17), tgt: V(0, 0.2, 0), theme: 3 },
];
const THEMES = [
  ['#00e5ff', '#8b5cf6'],
  ['#8b5cf6', '#00e5ff'],
  ['#f43f5e', '#8b5cf6'],
  ['#00e5ff', '#f43f5e'],
];

export function createStage(canvas) {
  if (!webglAvailable()) throw new Error('WebGL unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  let pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.6);
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 0.4, 17);
  const camTarget = V(0, 0, 0);

  const logoWidth = () => Math.min(11, 11 * (innerWidth / innerHeight) * 0.72);
  const engine = new Engine({ particles: mobile ? 3600 : 5600, logoWidth: logoWidth() });
  scene.add(engine.group);

  const bdU = { uTime: { value: 0 }, uA: { value: new THREE.Color('#00e5ff') }, uB: { value: new THREE.Color('#7c3aed') }, uO: { value: 1 } };
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: BACKDROP_FS, uniforms: bdU, depthWrite: false, side: THREE.BackSide }));
  backdrop.renderOrder = -10;
  scene.add(backdrop);
  const floorU = { uO: { value: 1 }, uTime: { value: 0 } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: FLOOR_FS, uniforms: floorU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.5;
  scene.add(floor);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.85, 0.5, 0.22);
  composer.addPass(bloom);
  // Output (linear → sRGB) first; the cinematic pass then works in display space.
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  const fx = final.uniforms;

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fx.uAspect.value = w / h;
    engine.pUniforms.uPR.value = renderer.getPixelRatio();
  }
  resize();
  window.addEventListener('resize', () => {
    resize();
    rig.dirty = true;
  });

  const state = {
    mode: 'off',
    running: false,
    director: null,
    scroll: { section: 0, progress: 0 },
    mouse: { x: 0, y: 0, sx: 0, sy: 0 },
    dim: 1,
    theme: 0,
  };
  const rig = {
    pos: V(3.6, 0.1, 0),
    rot: V(-0.16, -0.42, 0),
    scale: 1,
    cam: V(0, 0.4, 17),
    tgt: V(1.3, 0, 0),
    dirty: false,
  };

  window.addEventListener('pointermove', (e) => {
    state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
    state.mouse.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function sectionFrame(i) {
    const s = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, i))];
    if (innerWidth / innerHeight < 0.9) {
      // portrait: keep the engine above the copy, smaller
      return { ...s, pos: V(s.pos.x * 0.15, s.pos.y + (i === 0 ? 3.4 : 0), s.pos.z - 4), scale: s.scale * 0.72, tgt: V(0, i === 0 ? 1.4 : 0, 0), cam: V(0, 0, 19) };
    }
    return s;
  }

  function heroTargets() {
    const { section, progress } = state.scroll;
    const a = sectionFrame(section);
    const b = sectionFrame(section + 1);
    const k = progress * progress * (3 - 2 * progress);
    const lerpV = (p, q) => p.clone().lerp(q, k);
    const ta = THEMES[a.theme];
    const tb = THEMES[b.theme];
    return {
      pos: lerpV(a.pos, b.pos),
      rot: lerpV(a.rot, b.rot),
      scale: a.scale + (b.scale - a.scale) * k,
      dim: a.dim + (b.dim - a.dim) * k,
      cam: lerpV(a.cam, b.cam),
      tgt: lerpV(a.tgt, b.tgt),
      colA: new THREE.Color(ta[0]).lerp(new THREE.Color(tb[0]), k),
      colB: new THREE.Color(ta[1]).lerp(new THREE.Color(tb[1]), k),
    };
  }

  // adaptive quality — measured over real time, so slow devices react within seconds
  const lowFx = /[?&]fx=low\b/.test(location.search);
  let bloomOn = !lowFx;
  bloom.enabled = bloomOn;
  if (lowFx) {
    pr = Math.min(pr, 0.75);
    renderer.setPixelRatio(pr);
  }
  let winTime = 0;
  let winFrames = 0;
  let level = 0;
  function degrade() {
    level++;
    if (pr > 1.01) pr = Math.max(1, pr - 0.35);
    else if (bloomOn) {
      bloomOn = false;
      bloom.enabled = false;
      return;
    } else if (pr > 0.76) pr = 0.75;
    else if (pr > 0.51) pr = 0.5;
    else return;
    renderer.setPixelRatio(pr);
    resize();
  }
  function adapt(realDt) {
    winTime += realDt;
    winFrames++;
    if (winTime >= 1.5) {
      const fps = winFrames / winTime;
      winTime = 0;
      winFrames = 0;
      if (fps < 34 && level < 6) degrade();
    }
  }

  let last = performance.now();
  let nowTimer = 0;
  function frame(t) {
    if (!state.running) return;
    requestAnimationFrame(frame);
    if (document.hidden) {
      last = t;
      return;
    }
    const realDt = Math.max(0, (t - last) / 1000);
    const dt = Math.min(0.1, realDt);
    last = t;
    const reduced = prefersReducedMotion();
    fx.uTime.value += dt;
    bdU.uTime.value += dt;
    floorU.uTime.value += dt;

    nowTimer -= dt;
    if (nowTimer <= 0 && state.mode !== 'intro') {
      nowTimer = 1;
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      engine.setNow(m);
      engine.setProgress(m);
    }

    if (state.mode === 'intro' && state.director) {
      state.director(dt);
    } else if (state.mode === 'hero' || state.mode === 'focus') {
      const k = state.mode === 'focus'
        ? { pos: V(2, -1, -18), rot: V(-0.5, -0.3, 0.2), scale: 1.6, dim: 0.16, cam: V(0, 0, 17), tgt: V(0, 0, 0), colA: new THREE.Color('#00e5ff'), colB: new THREE.Color('#8b5cf6') }
        : heroTargets();
      const lam = reduced ? 30 : 2.6;
      state.mouse.sx = damp(state.mouse.sx, reduced ? 0 : state.mouse.x, 3, dt);
      state.mouse.sy = damp(state.mouse.sy, reduced ? 0 : state.mouse.y, 3, dt);
      rig.pos.set(damp(rig.pos.x, k.pos.x, lam, dt), damp(rig.pos.y, k.pos.y, lam, dt), damp(rig.pos.z, k.pos.z, lam, dt));
      rig.rot.set(damp(rig.rot.x, k.rot.x + state.mouse.sy * 0.08, lam, dt), damp(rig.rot.y, k.rot.y + state.mouse.sx * 0.12, lam, dt), damp(rig.rot.z, k.rot.z, lam, dt));
      rig.scale = damp(rig.scale, k.scale, lam, dt);
      state.dim = damp(state.dim, k.dim, lam, dt);
      rig.cam.set(damp(rig.cam.x, k.cam.x + state.mouse.sx * 0.5, lam, dt), damp(rig.cam.y, k.cam.y - state.mouse.sy * 0.35, lam, dt), damp(rig.cam.z, k.cam.z, lam, dt));
      rig.tgt.set(damp(rig.tgt.x, k.tgt.x, lam, dt), damp(rig.tgt.y, k.tgt.y, lam, dt), damp(rig.tgt.z, k.tgt.z, lam, dt));
      const g = engine.group;
      g.position.copy(rig.pos);
      g.rotation.set(rig.rot.x, rig.rot.y, rig.rot.z);
      g.scale.setScalar(rig.scale);
      if (!reduced) g.position.y += Math.sin(fx.uTime.value * 0.6) * 0.08;
      camera.position.copy(rig.cam);
      camera.lookAt(rig.tgt);
      engine.pUniforms.uOpacity.value = 0.25 + 0.75 * state.dim;
      engine.setExtras(state.dim);
      engine.segmentOpacity = state.dim;
      engine.pUniforms.uColA.value.lerp(k.colA, Math.min(1, dt * 2));
      engine.pUniforms.uColB.value.lerp(k.colB, Math.min(1, dt * 2));
      bdU.uO.value = 0.6 + 0.4 * state.dim;
      engine.coreU.uPulse.value = Math.max(0, Math.sin(fx.uTime.value * 1.1)) ** 8;
    }
    engine.update(dt, { reduced });
    adapt(realDt);
    composer.render(dt);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() {
    state.running = false;
  }

  const api = {
    THREE,
    renderer,
    scene,
    camera,
    camTarget,
    engine,
    fx,
    bloom,
    rig,
    backdrop: bdU,
    floor: floorU,
    get mode() {
      return state.mode;
    },
    setMode(mode) {
      if (mode === state.mode) return;
      state.mode = mode;
      const on = mode !== 'off';
      document.documentElement.classList.toggle('stage-on', on);
      if (on) start();
      else setTimeout(() => state.mode === 'off' && stop(), 1300);
    },
    setDirector(fn) {
      state.director = fn;
    },
    setScroll(section, progress) {
      state.scroll.section = section;
      state.scroll.progress = Math.max(0, Math.min(1, progress));
    },
    setPlan(blocks) {
      engine.setPlan(blocks);
    },
    /** Returning visitors: the ring blooms in from the core with the hand springing to now. */
    quickBoot() {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      engine.pUniforms.uMorph.value = 1;
      engine.pUniforms.uLogo.value = 0;
      engine.handMinute = m - 240;
      engine.setNow(m);
      state.dim = 0;
      rig.scale = 0.6;
      fx.uFade.value = 1;
    },
    heroFrame() {
      return sectionFrame(0);
    },
    relayoutLogo() {
      engine.relayoutLogo(logoWidth());
    },
    resize,
  };
  return api;
}
