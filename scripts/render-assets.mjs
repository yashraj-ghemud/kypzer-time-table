/**
 * Renders PNG icons (192, 512, maskable) and the social preview (og-image.png) with headless Chromium.
 * Usage: start a static server on :5173 (npm start), then `node scripts/render-assets.mjs`.
 * Playwright is not a dependency of the site; install it globally or via npx if you regenerate assets.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}

const svg = readFileSync(path.join(root, 'assets/icons/icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

async function icon(size, out, pad = 0) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:#06080f;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: path.join(root, out), omitBackground: false });
}
await icon(192, 'assets/icons/icon-192.png');
await icon(512, 'assets/icons/icon-512.png');
await icon(512, 'assets/icons/maskable-512.png', 60);

// Social card: rendered from the live landing hero if a server is running, else a static composition.
const base = process.env.KYPZER_URL || 'http://127.0.0.1:5173/';
await page.setViewportSize({ width: 1200, height: 630 });
try {
  await page.addInitScript(() => localStorage.setItem('kypzer.v2', JSON.stringify({ meta: { seenIntro: true } })));
  await page.goto(base + '#/', { timeout: 8000 });
  await page.waitForTimeout(12000);
  await page.evaluate(() => {
    document.querySelector('.hero-scroll')?.remove();
    document.querySelector('.command')?.remove();
    document.querySelector('.hero-meta')?.remove();
  });
  await page.screenshot({ path: path.join(root, 'assets/og-image.jpg'), type: 'jpeg', quality: 86 });
  console.log('og-image from live page');
} catch (e) {
  console.warn('server not reachable, og-image skipped:', e.message);
}
await browser.close();
console.log('assets rendered');
