/**
 * Day card renderer — draws a shareable image straight onto a canvas (no DOM screenshots).
 * Formats: story 1080×1920, square 1080×1080, wide 1920×1080. Themes: midnight, aurora, paper.
 */
import { fmtTime, fmtDuration, fmtDateLong } from '../engine/time.js';
import { categoryInfo } from '../engine/lexicon.js';

export const FORMATS = {
  story: { w: 1080, h: 1920, label: 'Story 9:16' },
  square: { w: 1080, h: 1080, label: 'Square' },
  wide: { w: 1920, h: 1080, label: 'Wide 16:9' },
};

export const THEMES = {
  midnight: { label: 'Midnight', bg: '#06080f', bg2: '#0d1424', text: '#e8edf5', muted: '#6b7a93', line: '#1e293b', card: 'rgba(17,24,39,0.82)', track: 'rgba(255,255,255,0.06)' },
  aurora: { label: 'Aurora', bg: '#0b0620', bg2: '#062733', text: '#f4f1ff', muted: '#9a93c0', line: '#2a2350', card: 'rgba(20,14,48,0.7)', track: 'rgba(255,255,255,0.08)' },
  paper: { label: 'Paper', bg: '#f6f4ee', bg2: '#ece8dc', text: '#12151c', muted: '#6a6f7a', line: '#d9d4c6', card: 'rgba(255,255,255,0.85)', track: 'rgba(0,0,0,0.07)' },
};

const F = {
  display: '"Orbitron", "Space Grotesk", system-ui, sans-serif',
  head: '"Space Grotesk", "Inter", system-ui, sans-serif',
  ui: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function background(ctx, W, H, th, themeKey) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, th.bg);
  g.addColorStop(1, th.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const orbs = themeKey === 'paper'
    ? [[0.15, 0.1, 'rgba(0,200,230,0.10)'], [0.9, 0.85, 'rgba(124,58,237,0.08)']]
    : themeKey === 'aurora'
      ? [[0.1, 0.05, 'rgba(0,229,255,0.30)'], [0.95, 0.4, 'rgba(124,58,237,0.35)'], [0.3, 0.95, 'rgba(244,63,94,0.22)']]
      : [[0.1, 0.05, 'rgba(0,229,255,0.16)'], [0.95, 0.9, 'rgba(124,58,237,0.18)'], [0.7, 0.4, 'rgba(244,63,94,0.07)']];
  for (const [x, y, c] of orbs) {
    const r = Math.max(W, H) * 0.55;
    const rg = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
    rg.addColorStop(0, c);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // grid
  ctx.strokeStyle = themeKey === 'paper' ? 'rgba(0,0,0,0.035)' : 'rgba(0,229,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
}

function brandGradient(ctx, x, y, w) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#00e5ff');
  g.addColorStop(0.52, '#7c3aed');
  g.addColorStop(1, '#f43f5e');
  return g;
}

/** 24h radial dial with the plan's blocks. */
export function drawDial(ctx, cx, cy, R, blocks, th, { now = null, clock = '12h' } = {}) {
  const ang = (m) => (m / 1440) * Math.PI * 2 - Math.PI / 2;
  ctx.save();
  // track
  ctx.lineWidth = R * 0.16;
  ctx.strokeStyle = th.track;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  // blocks
  for (const b of blocks) {
    const a0 = ang(b.start);
    const a1 = ang(Math.min(b.end, b.start + 1439));
    ctx.strokeStyle = b.color;
    ctx.lineWidth = R * 0.16;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = R * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0 + 0.004, a1 - 0.004);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // ticks
  for (let h = 0; h < 24; h++) {
    const a = ang(h * 60);
    const r0 = R * 0.72;
    const r1 = R * (h % 6 === 0 ? 0.64 : 0.68);
    ctx.strokeStyle = h % 6 === 0 ? th.text : th.muted;
    ctx.lineWidth = h % 6 === 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
    if (h % 6 === 0) {
      ctx.fillStyle = th.muted;
      ctx.font = `500 ${Math.round(R * 0.085)}px ${F.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lbl = clock === '24h' ? String(h).padStart(2, '0') : ['12a', '6a', '12p', '6p'][h / 6];
      ctx.fillText(lbl, cx + Math.cos(a) * R * 0.53, cy + Math.sin(a) * R * 0.53);
    }
  }
  if (now != null) {
    const a = ang(now);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = th.text;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRings(ctx, cx, cy, R, score, th) {
  const rings = [['focus', '#00e5ff', 1], ['recovery', '#9b6bff', 0.78], ['balance', '#f43f5e', 0.56]];
  for (const [k, c, f] of rings) {
    const r = R * f;
    ctx.lineWidth = R * 0.15;
    ctx.lineCap = 'round';
    ctx.strokeStyle = th.track;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const v = Math.max(0.001, Math.min(1, (score[k] || 0) / 100));
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = R * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.lineCap = 'butt';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} plan  engine plan
 * @param {{format?:string, theme?:string, clock?:string, dateKey:string, title?:string, done?:object}} opts
 */
export function renderCard(canvas, plan, opts) {
  const fmt = FORMATS[opts.format] || FORMATS.story;
  const themeKey = THEMES[opts.theme] ? opts.theme : 'midnight';
  const th = THEMES[themeKey];
  const clock = opts.clock || '12h';
  const W = fmt.w;
  const H = fmt.h;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, th, themeKey);
  const P = Math.round(W * 0.06);
  const wide = opts.format === 'wide';
  const blocks = plan.blocks;
  const a = plan.analysis;

  // header
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.round(W * (wide ? 0.026 : 0.05))}px ${F.display}`;
  ctx.fillStyle = brandGradient(ctx, P, 0, W * 0.4);
  const brandY = P + W * (wide ? 0.03 : 0.05);
  ctx.fillText('KYPZER', P, brandY);
  ctx.fillStyle = th.muted;
  ctx.font = `500 ${Math.round(W * (wide ? 0.0105 : 0.02))}px ${F.mono}`;
  ctx.fillText((opts.title || 'MY DAY, ENGINEERED').toUpperCase(), P, brandY + W * (wide ? 0.022 : 0.04));
  ctx.textAlign = 'right';
  ctx.fillStyle = th.text;
  ctx.font = `700 ${Math.round(W * (wide ? 0.017 : 0.032))}px ${F.head}`;
  const dateTxt = fmtDateLong(opts.dateKey).replace(/, \d{4}$/, '');
  ctx.fillText(dateTxt, W - P, brandY);
  ctx.fillStyle = th.muted;
  ctx.font = `500 ${Math.round(W * (wide ? 0.0105 : 0.02))}px ${F.mono}`;
  ctx.fillText(blocks.length + ' BLOCKS · ' + fmtDuration(a.stats.busy).toUpperCase() + ' BUSY', W - P, brandY + W * (wide ? 0.022 : 0.04));

  let listX;
  let listY;
  let listW;
  let listH;
  if (wide) {
    const R = H * 0.3;
    const cx = P + R * 1.15;
    const cy = H * 0.55;
    drawDial(ctx, cx, cy, R, blocks, th, { clock });
    ctx.textAlign = 'center';
    ctx.fillStyle = th.text;
    ctx.font = `800 ${Math.round(R * 0.3)}px ${F.display}`;
    ctx.fillText(String(a.score.total), cx, cy + R * 0.1);
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${Math.round(R * 0.07)}px ${F.mono}`;
    ctx.fillText('DAY SCORE', cx, cy + R * 0.24);
    listX = cx + R * 1.45;
    listY = H * 0.2;
    listW = W - listX - P;
    listH = H - listY - P * 1.2;
  } else {
    const square = opts.format === 'square';
    const R = W * (square ? 0.17 : 0.27);
    const cx = square ? P + R * 1.1 : W / 2;
    const cy = square ? brandY + W * 0.1 + R * 1.05 : brandY + W * 0.12 + R * 1.15;
    drawDial(ctx, cx, cy, R, blocks, th, { clock });
    // rings inside dial center
    drawRings(ctx, cx, cy, R * 0.38, a.score, th);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.text;
    ctx.font = `800 ${Math.round(R * 0.16)}px ${F.display}`;
    ctx.fillText(String(a.score.total), cx, cy + R * 0.06);
    if (square) {
      // stats on the right
      const sx = cx + R * 1.3;
      const stats = [['BUSY', fmtDuration(a.stats.busy)], ['FREE', fmtDuration(a.stats.free)], ['DEEP WORK', fmtDuration(a.stats.focus)], ['SCORE', a.score.total + ' · ' + a.score.grade]];
      stats.forEach(([k, v], i) => {
        const y = cy - R * 0.75 + i * R * 0.5;
        ctx.textAlign = 'left';
        ctx.fillStyle = th.muted;
        ctx.font = `500 ${Math.round(W * 0.018)}px ${F.mono}`;
        ctx.fillText(k, sx, y);
        ctx.fillStyle = th.text;
        ctx.font = `700 ${Math.round(W * 0.036)}px ${F.head}`;
        ctx.fillText(v, sx, y + W * 0.042);
      });
      listY = cy + R * 1.3;
    } else {
      listY = cy + R * 1.35;
    }
    listX = P;
    listW = W - P * 2;
    listH = H - listY - P * 1.6;
  }

  // block list
  const rowH = Math.max(W * (wide ? 0.034 : 0.058), Math.min(W * (wide ? 0.05 : 0.09), listH / Math.max(1, blocks.length)));
  const maxRows = Math.floor(listH / rowH);
  const shown = blocks.slice(0, maxRows);
  shown.forEach((b, i) => {
    const y = listY + i * rowH;
    const hgt = rowH * 0.82;
    const info = categoryInfo(b.category, b.title);
    rr(ctx, listX, y, listW, hgt, hgt * 0.24);
    ctx.fillStyle = th.card;
    ctx.fill();
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = b.color;
    rr(ctx, listX, y, hgt * 0.1, hgt, hgt * 0.05);
    ctx.fill();
    const fs = hgt * 0.36;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = b.color;
    ctx.font = `600 ${Math.round(fs * 0.8)}px ${F.mono}`;
    const timeTxt = fmtTime(b.start, clock, { dayMark: false }).replace(':00 ', ' ') + ' – ' + fmtTime(b.end, clock, { dayMark: false }).replace(':00 ', ' ');
    const timeW = listW * (wide ? 0.3 : 0.36);
    ctx.fillText(fitText(ctx, timeTxt, timeW - hgt * 0.3), listX + hgt * 0.34, y + hgt / 2);
    ctx.fillStyle = th.text;
    ctx.font = `600 ${Math.round(fs)}px ${F.ui}`;
    const done = opts.done && opts.done[b.id] === 'done';
    const title = (done ? '✓ ' : '') + (b.title || 'Untitled');
    ctx.fillText(fitText(ctx, title, listW - timeW - hgt * 2.2), listX + timeW + hgt * 0.1, y + hgt / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${Math.round(fs * 0.72)}px ${F.mono}`;
    ctx.fillText(fmtDuration(b.end - b.start) + '  ' + info.label.toUpperCase(), listX + listW - hgt * 0.3, y + hgt / 2);
  });
  if (blocks.length > shown.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${Math.round(W * 0.018)}px ${F.mono}`;
    ctx.fillText('+ ' + (blocks.length - shown.length) + ' more', listX + listW / 2, listY + shown.length * rowH + rowH * 0.3);
  }

  // footer
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = th.muted;
  ctx.font = `500 ${Math.round(W * (wide ? 0.0095 : 0.018))}px ${F.mono}`;
  ctx.fillText('planned with kypzer time engine · dev : yashraj ghemud', W / 2, H - P * 0.6);
  return canvas;
}
