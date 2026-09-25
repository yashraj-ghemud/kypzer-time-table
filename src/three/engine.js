/**
 * The Kypzer Engine — the 3D object shared by the intro, the landing hero, focus and the Dial view.
 *
 *  • particles: 1,440 minute-motes + dust in ONE Points draw call. Each particle carries three layouts
 *    (aChaos, aRing, aLogo); the vertex shader morphs between them with per-particle stagger + swirl.
 *  • watch movement: hour ticks, numerals, counter-rotating dashed rings, orbiting beads, fresnel core.
 *  • time: a hand at the current minute with a light-sweep trail and a "day so far" arc.
 *  • plan: glowing arcs for each block, hover-able in the Dial view.
 *
 * Clock convention: minute 0 at 12 o'clock, clockwise, ring in the XY plane facing +Z.
 */
import * as THREE from 'three';

export const RING_R = 5;
const TAU = Math.PI * 2;
export const angleOf = (min) => Math.PI / 2 - (min / 1440) * TAU;

const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ */
/* shared textures                                                     */
/* ------------------------------------------------------------------ */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function textSprite(text, { size = 64, color = '#e8edf5', font = '500 {s}px "JetBrains Mono", monospace', scale = 1 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const f = font.replace('{s}', size);
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = Math.ceil(size * 1.6);
  g.font = f;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  const aspect = c.width / c.height;
  s.scale.set(scale * aspect, scale, 1);
  return s;
}

/* ------------------------------------------------------------------ */
/* logo sampling                                                       */
/* ------------------------------------------------------------------ */
function sampleLogo(count, width, zPos) {
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 230px "Orbitron", "Arial Black", sans-serif';
  g.fillText('KYPZER', 700, 160);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let y = 0; y < c.height; y += 3) {
    for (let x = 0; x < c.width; x += 3) {
      if (data[(y * c.width + x) * 4 + 3] > 128) pts.push([x, y]);
    }
  }
  const out = new Float32Array(count * 3);
  const s = width / 1400;
  for (let i = 0; i < count; i++) {
    const p = pts.length ? pts[Math.floor(Math.random() * pts.length)] : [700, 150];
    out[i * 3] = (p[0] - 700) * s + rand(-0.02, 0.02);
    out[i * 3 + 1] = -(p[1] - 160) * s + rand(-0.02, 0.02);
    out[i * 3 + 2] = zPos + rand(-0.15, 0.15);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* particle material                                                   */
/* ------------------------------------------------------------------ */
const PARTICLE_VS = /* glsl */ `
  attribute vec3 aChaos;
  attribute vec3 aRing;
  attribute vec3 aLogo;
  attribute vec4 aRand;   // x stagger, y size, z phase, w kind (1 = minute mote, 0 = dust)
  uniform float uTime;
  uniform float uMorph;
  uniform float uLogo;
  uniform float uSwirl;
  uniform float uSize;
  uniform float uPR;
  uniform float uWarp;
  uniform float uNow;     // minute of day
  uniform float uPulse;
  varying float vAlpha;
  varying float vKind;
  varying float vMin;
  varying float vHot;
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  void main() {
    float d = aRand.x;
    float m = smoothstep(d * 0.55, d * 0.55 + 0.45, uMorph);
    vec3 drift = vec3(sin(uTime * 0.31 + aRand.z * 6.0), cos(uTime * 0.27 + aRand.z * 4.0), sin(uTime * 0.23 + aRand.z * 5.0)) * 0.35;
    vec3 c = aChaos + drift;
    vec3 ringP = aRing;
    // gentle living ring
    ringP += normalize(vec3(aRing.xy, 0.0001)) * sin(uTime * 1.3 + aRand.z * 12.0) * 0.03 * (1.0 - aRand.w * 0.7);
    vec3 p = mix(c, ringP, m);
    float sw = (1.0 - m) * m * 4.0 * uSwirl;           // strongest mid-flight
    p.xy = rot(sw * (2.4 + aRand.z)) * p.xy;
    p.z *= 1.0 - sw * 0.5;
    float l = smoothstep(d * 0.5, d * 0.5 + 0.5, uLogo);
    vec3 logoP = aLogo + vec3(0.0, sin(uTime * 2.0 + aRand.z * 9.0) * 0.015, 0.0);
    // arc through space on the way to the logo
    vec3 mid = mix(p, logoP, 0.5) + vec3(0.0, 0.0, 2.5) * sin(l * 3.14159);
    p = mix(mix(p, mid, l * 2.0), mix(mid, logoP, l * 2.0 - 1.0), step(0.5, l));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float minute = aRand.w > 0.5 ? aRand.z * 1440.0 : -1.0;
    vMin = minute;
    // minutes already lived today glow warmer
    vHot = (minute >= 0.0 && minute <= uNow) ? 1.0 : 0.0;
    float sz = uSize * aRand.y * (1.0 + uPulse * 0.6 * aRand.w);
    float twinkle = 0.75 + 0.25 * sin(uTime * 3.0 + aRand.z * 40.0);
    gl_PointSize = sz * uPR * (32.0 / max(0.5, -mv.z)) * mix(twinkle, 1.0, m) * (1.0 + uWarp * 1.5);
    vAlpha = mix(0.55 + 0.45 * aRand.y, 1.0, aRand.w) * clamp(1.4 - (-mv.z) / 60.0, 0.15, 1.0);
    vKind = aRand.w;
  }
`;

const PARTICLE_FS = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColHot;
  uniform float uOpacity;
  uniform float uMorph;
  varying float vAlpha;
  varying float vKind;
  varying float vMin;
  varying float vHot;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    float glow = pow(core, 2.2);
    float t = vMin >= 0.0 ? vMin / 1440.0 : 0.5;
    vec3 col = mix(uColA, uColB, smoothstep(0.15, 0.95, t));
    col = mix(col, uColHot, vHot * 0.55 * uMorph);
    col = mix(vec3(0.75, 0.85, 1.0), col, 0.35 + 0.65 * vKind);
    gl_FragColor = vec4(col * (0.6 + glow * 1.4), glow * vAlpha * uOpacity);
  }
`;

/* ------------------------------------------------------------------ */
/* line / ring materials                                               */
/* ------------------------------------------------------------------ */
const DASH_VS = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos;
  void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DASH_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uDash; uniform float uOpacity; uniform float uTime; uniform float uSpeed;
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    float a = atan(vPos.y, vPos.x);
    float d = fract((a / 6.2831853) * uDash + uTime * uSpeed);
    float on = step(0.45, d);
    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
    gl_FragColor = vec4(uColor, on * uOpacity * (0.4 + 0.6 * edge));
  }
`;

const ARC_VS = /* glsl */ `
  varying vec3 vPos; varying vec2 vUv;
  void main() { vPos = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// For plan arcs: glowing body + bright edges + a slow scanline flowing clockwise.
const ARC_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uHi; uniform float uInner; uniform float uOuter;
  varying vec3 vPos;
  void main() {
    float r = length(vPos.xy);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float edge = pow(abs(t - 0.5) * 2.0, 6.0);
    float a = atan(vPos.y, vPos.x);
    float scan = pow(0.5 + 0.5 * sin(a * 40.0 + uTime * 3.0), 12.0) * 0.35;
    float body = 0.28 + edge * 0.9 + scan + uHi * 0.5;
    gl_FragColor = vec4(uColor * (0.8 + uHi * 0.8), body * uOpacity);
  }
`;
// Sweep trail behind the hand + day-progress arc
const SWEEP_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uStart; uniform float uLen;
  varying vec3 vPos;
  void main() {
    float a = atan(vPos.y, vPos.x);
    float rel = mod(a - uStart + 12.566370, 6.2831853) / max(uLen, 0.0001);
    float f = clamp(1.0 - rel, 0.0, 1.0);
    float radial = smoothstep(0.15, 1.0, length(vPos.xy) / 4.6);
    gl_FragColor = vec4(uColor, pow(f, 2.2) * radial * radial * uOpacity);
  }
`;
const PROGRESS_FS = /* glsl */ `
  uniform float uOpacity; uniform float uTime;
  varying vec3 vPos;
  void main() {
    float a = atan(vPos.y, vPos.x);
    float t = mod(1.5707963 - a + 6.2831853, 6.2831853) / 6.2831853;
    vec3 c = mix(vec3(0.0, 0.9, 1.0), vec3(0.49, 0.23, 0.93), smoothstep(0.1, 0.6, t));
    c = mix(c, vec3(0.96, 0.25, 0.37), smoothstep(0.6, 1.0, t));
    float shimmer = 0.75 + 0.25 * sin(t * 80.0 - uTime * 2.0);
    gl_FragColor = vec4(c * 1.2, uOpacity * shimmer);
  }
`;

const CORE_VS = /* glsl */ `
  uniform float uTime; uniform float uPulse;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 p = position;
    float n = sin(p.x * 6.0 + uTime * 1.7) * sin(p.y * 5.0 + uTime * 1.3) * sin(p.z * 7.0 + uTime * 1.1);
    p += normal * n * 0.06 * (1.0 + uPulse);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CORE_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uPulse;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.4);
    vec3 c = mix(uColor * 0.25, vec3(1.0), f * 0.6) + uColor * f * (1.4 + uPulse);
    gl_FragColor = vec4(c, (0.35 + f) * uOpacity);
  }
`;

function ringSector(inner, outer, startMin, endMin, segs = 64) {
  const len = ((endMin - startMin) / 1440) * TAU;
  const thetaStart = angleOf(endMin);
  return new THREE.RingGeometry(inner, outer, Math.max(6, Math.ceil(segs * (len / TAU)) + 2), 1, thetaStart, len);
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */
export class Engine {
  /**
   * @param {{particles?: number, logo?: boolean, logoWidth?: number, logoZ?: number, clock?: string, labels?: boolean}} opts
   */
  constructor(opts = {}) {
    this.opts = { particles: 5200, logo: true, logoWidth: 11, logoZ: -18, clock: '12h', labels: true, ...opts };
    this.group = new THREE.Group();
    this.group.name = 'kypzer-engine';
    this.movement = new THREE.Group(); // ticks, rings, core, hand (fade together)
    this.group.add(this.movement);
    this.segments = new THREE.Group();
    this.group.add(this.segments);
    this.time = 0;
    this.nowMinute = 0;
    this.handMinute = 0;
    this.handTarget = null;
    this.handVel = 0;
    this.extras = 0;
    this.segmentOpacity = 1;
    this.highlightIds = new Set();
    this.segMeshes = [];
    this.buildParticles();
    this.buildMovement();
  }

  buildParticles() {
    const N = this.opts.particles;
    const MOTES = 1440;
    const pos = new Float32Array(N * 3);
    const chaos = new Float32Array(N * 3);
    const ring = new Float32Array(N * 3);
    const rnd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      // chaos: a big loose cloud, denser toward the centre, deep in z
      const r = Math.pow(Math.random(), 0.6) * 16;
      const th = Math.random() * TAU;
      const ph = Math.acos(rand(-1, 1));
      chaos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      chaos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
      chaos[i * 3 + 2] = r * Math.cos(ph) * 1.3;
      let x;
      let y;
      let z;
      if (i < MOTES) {
        const a = angleOf(i);
        const rr = RING_R + (i % 60 === 0 ? 0.12 : 0);
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
        z = 0;
        rnd[i * 4 + 1] = i % 60 === 0 ? 1.7 : i % 15 === 0 ? 1.15 : 0.8;
        rnd[i * 4 + 2] = i / 1440; // phase doubles as minute id
        rnd[i * 4 + 3] = 1;
      } else {
        const band = Math.random();
        let rr;
        if (band < 0.62) rr = RING_R + (Math.random() - 0.5) * 1.1 * Math.random();
        else if (band < 0.82) rr = RING_R * 0.62 + (Math.random() - 0.5) * 0.25;
        else if (band < 0.93) rr = RING_R * 1.28 + (Math.random() - 0.5) * 0.5;
        else rr = RING_R * 0.34 + (Math.random() - 0.5) * 0.2;
        const a = Math.random() * TAU;
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
        z = (Math.random() - 0.5) * 0.9 * Math.random();
        rnd[i * 4 + 1] = rand(0.25, 0.7);
        rnd[i * 4 + 2] = Math.random();
        rnd[i * 4 + 3] = 0;
      }
      ring[i * 3] = x;
      ring[i * 3 + 1] = y;
      ring[i * 3 + 2] = z;
      rnd[i * 4] = Math.random();
    }
    pos.set(ring);
    const logo = this.opts.logo ? sampleLogo(N, this.opts.logoWidth, this.opts.logoZ) : new Float32Array(ring);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aChaos', new THREE.BufferAttribute(chaos, 3));
    geo.setAttribute('aRing', new THREE.BufferAttribute(ring, 3));
    geo.setAttribute('aLogo', new THREE.BufferAttribute(logo, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    this.pUniforms = {
      uTime: { value: 0 },
      uMorph: { value: 1 },
      uLogo: { value: 0 },
      uSwirl: { value: 1 },
      uSize: { value: 2.2 },
      uPR: { value: 1 },
      uWarp: { value: 0 },
      uNow: { value: 0 },
      uPulse: { value: 0 },
      uOpacity: { value: 1 },
      uColA: { value: new THREE.Color('#00e5ff') },
      uColB: { value: new THREE.Color('#8b5cf6') },
      uColHot: { value: new THREE.Color('#ff4d6d') },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: this.pUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  relayoutLogo(width) {
    if (!this.opts.logo) return;
    const attr = this.points.geometry.getAttribute('aLogo');
    attr.array.set(sampleLogo(this.opts.particles, width, this.opts.logoZ));
    attr.needsUpdate = true;
  }

  buildMovement() {
    const mv = this.movement;
    this.fadeMats = [];
    const track = (m) => {
      this.fadeMats.push(m);
      m.userData.base = m.uniforms && m.uniforms.uOpacity ? m.uniforms.uOpacity.value : m.opacity ?? 1;
      return m;
    };

    // hour ticks (instanced)
    const tickGeo = new THREE.PlaneGeometry(0.035, 1);
    const tickMat = track(new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ticks = new THREE.InstancedMesh(tickGeo, tickMat, 96);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 96; i++) {
      const min = i * 15;
      const major = i % 4 === 0;
      const big = i % 24 === 0;
      const len = big ? 0.55 : major ? 0.34 : 0.14;
      const a = angleOf(min);
      const r = RING_R - 0.35 - len / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0), q, new THREE.Vector3(big ? 1.8 : major ? 1.2 : 0.8, len, 1));
      ticks.setMatrixAt(i, m4);
    }
    mv.add(ticks);

    // numerals
    this.numerals = new THREE.Group();
    if (this.opts.labels) this.buildNumerals();
    mv.add(this.numerals);

    // dashed counter-rotating rings
    this.dashRings = [];
    const mk = (r, w, dash, speed, color, op) => {
      const u = { uColor: { value: new THREE.Color(color) }, uDash: { value: dash }, uOpacity: { value: op }, uTime: { value: 0 }, uSpeed: { value: speed } };
      const mat = track(new THREE.ShaderMaterial({ vertexShader: DASH_VS, fragmentShader: DASH_FS, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 256, 1), mat);
      mv.add(mesh);
      this.dashRings.push(mesh);
      return mesh;
    };
    mk(RING_R * 0.78, 0.02, 180, 0.01, '#00e5ff', 0.55);
    mk(RING_R * 0.62, 0.06, 24, -0.025, '#8b5cf6', 0.5);
    mk(RING_R * 0.46, 0.015, 96, 0.04, '#7dd3fc', 0.45);
    mk(RING_R * 0.34, 0.05, 12, -0.06, '#f43f5e', 0.4);
    mk(RING_R + 0.9, 0.012, 360, -0.004, '#64748b', 0.35);

    // beads on inner rings
    this.beads = [];
    const beadMat = track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9ff3ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(beadMat);
      s.scale.setScalar(0.35);
      s.userData = { r: [RING_R * 0.62, RING_R * 0.46, RING_R * 0.34][i % 3], speed: (i % 2 ? -1 : 1) * rand(0.15, 0.5), phase: Math.random() * TAU };
      mv.add(s);
      this.beads.push(s);
    }

    // core
    this.coreU = { uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color('#00e5ff') }, uOpacity: { value: 1 } };
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 4), new THREE.ShaderMaterial({ vertexShader: CORE_VS, fragmentShader: CORE_FS, uniforms: this.coreU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.core);
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x00e5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.coreGlow.scale.setScalar(4.2);
    this.group.add(this.coreGlow);

    // hand
    this.hand = new THREE.Group();
    const handMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.045, RING_R + 0.55), handMat);
    handMesh.position.y = (RING_R + 0.55) / 2;
    this.hand.add(handMesh);
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff4d6d, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    tip.scale.setScalar(0.9);
    tip.position.y = RING_R + 0.55;
    this.hand.add(tip);
    this.fadeMats.push(tip.material);
    tip.material.userData.base = 1;
    mv.add(this.hand);

    // sweep trail behind the hand
    this.sweepU = { uColor: { value: new THREE.Color('#00e5ff') }, uOpacity: { value: 0.28 }, uStart: { value: 0 }, uLen: { value: 0.75 } };
    const sweepMat = track(new THREE.ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: SWEEP_FS, uniforms: this.sweepU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.sweep = new THREE.Mesh(new THREE.CircleGeometry(RING_R - 0.4, 128), sweepMat);
    this.sweep.position.z = -0.02;
    mv.add(this.sweep);

    // day progress arc (00:00 → now)
    this.progU = { uOpacity: { value: 0.85 }, uTime: { value: 0 } };
    this.progMat = track(new THREE.ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: PROGRESS_FS, uniforms: this.progU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.progMesh = null;
    this.setProgress(0);
  }

  buildNumerals() {
    this.numerals.clear();
    const labels24 = ['00', '03', '06', '09', '12', '15', '18', '21'];
    const labels12 = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
    const labels = this.opts.clock === '24h' ? labels24 : labels12;
    labels.forEach((t, i) => {
      const s = textSprite(t, { size: 72, color: i % 2 ? '#7f8ea6' : '#e8edf5', scale: i % 2 ? 0.32 : 0.42 });
      const a = angleOf(i * 180);
      const r = RING_R - 1.35;
      s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.01);
      this.fadeMats.push(s.material);
      s.material.userData.base = 1;
      this.numerals.add(s);
    });
  }

  setClock(clock) {
    if (clock === this.opts.clock) return;
    this.opts.clock = clock;
    if (this.opts.labels) {
      for (const s of this.numerals.children) this.fadeMats.splice(this.fadeMats.indexOf(s.material), 1);
      this.buildNumerals();
    }
  }

  setProgress(minute) {
    const m = Math.max(1, Math.min(1439.5, minute));
    if (this.progMesh && Math.abs((this.progMesh.userData.min || 0) - m) < 0.5) return;
    if (this.progMesh) {
      this.progMesh.geometry.dispose();
      this.movement.remove(this.progMesh);
    }
    this.progMesh = new THREE.Mesh(ringSector(RING_R - 0.3, RING_R - 0.2, 0, m, 256), this.progMat);
    this.progMesh.userData.min = m;
    this.movement.add(this.progMesh);
  }

  /** Plan arcs. blocks: [{id,start,end,color}] */
  setPlan(blocks) {
    for (const m of this.segMeshes) {
      m.geometry.dispose();
      m.material.dispose();
      this.segments.remove(m);
    }
    this.segMeshes = [];
    const inner = RING_R + 0.28;
    const outer = RING_R + 0.72;
    // stack overlapping blocks outward
    const lanes = [];
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    for (const b of sorted) {
      const s = Math.max(0, b.start);
      const e = Math.min(b.end, s + 1439);
      if (e - s < 1) continue;
      let lane = lanes.findIndex((end) => end <= s);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(e);
      } else lanes[lane] = e;
      const off = lane * 0.55;
      const u = { uColor: { value: new THREE.Color(b.color) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uHi: { value: 0 }, uInner: { value: inner + off }, uOuter: { value: outer + off } };
      const mat = new THREE.ShaderMaterial({ vertexShader: ARC_VS, fragmentShader: ARC_FS, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const gap = Math.min(2, (e - s) * 0.1);
      const mesh = new THREE.Mesh(ringSector(inner + off, outer + off, s + gap, e - gap, 200), mat);
      mesh.position.z = 0.02 + lane * 0.01;
      mesh.userData = { block: b, born: this.time, target: 1 };
      this.segments.add(mesh);
      this.segMeshes.push(mesh);
    }
  }

  highlight(ids) {
    this.highlightIds = new Set(ids || []);
  }

  /** Point the hand at a minute; spring animates there. */
  setNow(minute, { instant = false } = {}) {
    this.nowMinute = minute;
    this.handTarget = minute;
    if (instant) {
      this.handMinute = minute;
      this.handVel = 0;
    }
  }

  setExtras(v) {
    this.extras = v;
  }

  update(dt, { reduced = false } = {}) {
    dt = Math.max(0, dt || 0);
    this.time += dt;
    const t = this.time;
    this.pUniforms.uTime.value = t;
    this.pUniforms.uNow.value = this.nowMinute;
    this.coreU.uTime.value = t;
    this.progU.uTime.value = t;
    for (const r of this.dashRings) {
      r.material.uniforms.uTime.value = reduced ? 0 : t;
    }
    for (const b of this.beads) {
      const a = b.userData.phase + t * b.userData.speed;
      b.position.set(Math.cos(a) * b.userData.r, Math.sin(a) * b.userData.r, 0.02);
    }
    // hand spring (critically damped-ish, with a little overshoot)
    if (this.handTarget != null) {
      const k = 60;
      const c = 11;
      const diff = this.handTarget - this.handMinute;
      this.handVel += (diff * k - this.handVel * c) * dt;
      this.handMinute += this.handVel * dt;
    }
    this.hand.rotation.z = angleOf(this.handMinute) - Math.PI / 2;
    this.sweepU.uStart.value = angleOf(this.handMinute);
    // movement fade
    for (const m of this.fadeMats) {
      const base = m.userData.base ?? 1;
      if (m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = base * this.extras;
      else m.opacity = base * this.extras;
    }
    this.movement.visible = this.extras > 0.001;
    // plan arcs grow in
    for (const m of this.segMeshes) {
      const u = m.material.uniforms;
      u.uTime.value = t;
      const hi = this.highlightIds.size ? (this.highlightIds.has(m.userData.block.id) ? 1 : -0.6) : 0;
      u.uHi.value += (Math.max(0, hi) - u.uHi.value) * Math.min(1, dt * 8);
      const target = this.segmentOpacity * (hi < 0 ? 0.35 : 1);
      u.uOpacity.value += (target - u.uOpacity.value) * Math.min(1, dt * 4);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && m.map !== glowTex) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}
