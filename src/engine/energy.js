/**
 * Typical daily energy pattern (0..1) by chronotype. A smooth model — morning peak, post-lunch dip,
 * second wind, evening decline — shifted for early birds and night owls. Not medical advice.
 */
import { DAY, mod } from './time.js';

export const CHRONOTYPES = {
  lark: { label: 'Early bird', shift: -90 },
  balanced: { label: 'Balanced', shift: 0 },
  owl: { label: 'Night owl', shift: 150 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = (v, c, s) => Math.exp(-((v - c) ** 2) / (2 * s * s));

/** Energy at an absolute minute. */
export function energyAt(abs, chronotype = 'balanced') {
  const shift = (CHRONOTYPES[chronotype] || CHRONOTYPES.balanced).shift;
  const v = mod(abs - shift, DAY);
  const wake = 1 / (1 + Math.exp(-(v - 390) / 35));
  const bed = 1 / (1 + Math.exp((v - 1350) / 40));
  let e = 0.32 + 0.55 * gauss(v, 630, 120) - 0.22 * gauss(v, 870, 60) + 0.4 * gauss(v, 1050, 110);
  e = e * wake * bed + 0.05;
  return clamp(e, 0.04, 1);
}

/** Average energy across [start, end). */
export function avgEnergy(start, end, chronotype) {
  if (end <= start) return energyAt(start, chronotype);
  let sum = 0;
  let n = 0;
  for (let t = start; t < end; t += 10) {
    sum += energyAt(t + 5, chronotype);
    n++;
  }
  return sum / n;
}

/** Samples for charts. */
export function energyCurve(chronotype, from = 0, to = DAY, step = 10) {
  const pts = [];
  for (let t = from; t <= to; t += step) pts.push({ t, e: energyAt(t, chronotype) });
  return pts;
}

/** The best contiguous window of `len` minutes for deep work inside [from, to]. */
export function peakWindow(chronotype, len = 120, from = 360, to = 1320) {
  let best = { start: from, e: -1 };
  for (let t = from; t + len <= to; t += 15) {
    const e = avgEnergy(t, t + len, chronotype);
    if (e > best.e) best = { start: t, e };
  }
  return { start: best.start, end: best.start + len, energy: best.e };
}
