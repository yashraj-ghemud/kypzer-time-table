import { buildPlan } from '../src/engine/plan.js';
import { fmtTimeInput } from '../src/engine/time.js';

/** Compact "HH:MM-HH:MM title" rows for readable assertions (next-day times get a "+"). */
export function rows(text, settings = {}, extra = {}) {
  const plan = buildPlan({ text, settings: { fromNow: false, ...settings }, ...extra });
  return plan.blocks.map(fmtBlock);
}

export function fmtBlock(b) {
  const t = (v) => fmtTimeInput(v, '24h') + (v >= 1440 ? '+' : '');
  return t(b.start) + '-' + t(b.end) + ' ' + b.title;
}

export { buildPlan };
