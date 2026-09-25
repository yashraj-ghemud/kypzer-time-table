/**
 * End-to-end smoke test. Serves the repo, drives the real UI in headless Chromium and fails on any
 * console error. `npm run e2e` (needs Playwright: `npm i -D playwright` or a global install).
 * Screenshots land in ./screenshots/ for visual review.
 */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  try {
    ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
  } catch {
    console.error('Playwright not found. Install it with: npm i -D playwright');
    process.exit(2);
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(path.join(root, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/fonts\.g|ERR_CERT|ERR_TUNNEL|ERR_NAME|net::ERR/.test(t)) errors.push('console: ' + t);
});

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
  } catch (e) {
    failures++;
    console.log('  ✗ ' + name + '\n      ' + e.message);
  }
}
const shot = (n) => page.screenshot({ path: path.join(root, 'screenshots', n + '.png') });
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

console.log('KYPZER e2e @ ' + base);
await page.addInitScript(() => {
  if (!sessionStorage.getItem('e2e')) {
    localStorage.setItem('kypzer.v2', JSON.stringify({ meta: { seenIntro: true } }));
    sessionStorage.setItem('e2e', '1');
  }
});

await step('landing renders hero + 3D stage', async () => {
  await page.goto(base + '?fx=low#/');
  await page.waitForSelector('#hero .hero-title.in', { timeout: 15000 });
  assert(await page.evaluate(() => document.documentElement.dataset.route === 'landing'), 'route is not landing');
  await page.waitForTimeout(1500);
  await shot('01-landing');
});

await step('hero command bar sends a plan into the planner', async () => {
  await page.fill('#hero-input', '3:50 to 5 pm : work, 5 to 7 pm : call to wife');
  await page.press('#hero-input', 'Enter');
  await page.waitForFunction(() => document.documentElement.dataset.route === 'app', null, { timeout: 8000 });
  await page.waitForSelector('.tl-item[data-key="b-work"]', { timeout: 8000 });
  await shot('02-planner');
});

await step('typing Hinglish updates the plan live', async () => {
  await page.click('#plan-input');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nsubah 7 baje gym\nstudy 2h\n4:30 standup');
  await page.waitForSelector('.tl-item[data-key="b-gym"]', { timeout: 5000 });
  const chips = await page.$$eval('.u-chip', (x) => x.map((c) => c.textContent));
  assert(chips.some((c) => /7 AM.*gym/.test(c)), 'gym not parsed at 7 AM: ' + chips.join(' | '));
  assert(await page.$('.ins.critical'), 'expected a clash insight for standup');
});

await step('one-click fix resolves the clash', async () => {
  await page.click('.ins.critical .fix');
  await page.waitForTimeout(800);
  assert(!(await page.$('.ins.critical')), 'clash still present after fix');
});

await step('grid drag rewrites the text', async () => {
  await page.click('#view-seg [data-view="grid"]');
  const blk = await page.waitForSelector('.dg-block[data-id="b-gym"]');
  const b = await blk.boundingBox();
  await page.mouse.move(b.x + 20, b.y + 8);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 40, { steps: 4 });
  await page.mouse.move(b.x + 20, b.y + 80, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const text = await page.$eval('#plan-input', (t) => t.value);
  assert(/am to \d/.test(text) && !/subah 7 baje gym/.test(text), 'text not rewritten: ' + text);
  await shot('03-grid');
});

await step('dial 3D view mounts', async () => {
  await page.click('#view-seg [data-view="dial"]');
  await page.waitForSelector('.dial-wrap canvas', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('04-dial');
  await page.click('#view-seg [data-view="timeline"]');
});

await step('exports: PNG card + .ics', async () => {
  await page.click('#btn-export');
  await page.waitForSelector('.export-preview canvas');
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('.modal .export-grid .btn-primary')]);
  assert(/\.png$/.test(png.suggestedFilename()), 'png filename');
  await page.click('.tabs [data-tab="calendar"]');
  const [ics] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('.modal .btn-primary')]);
  const body = await readFile(await ics.path(), 'utf8');
  assert(body.startsWith('BEGIN:VCALENDAR\r\n') && body.includes('SUMMARY:call to wife'), 'ics content');
});

let shareUrl = '';
await step('share link + QR', async () => {
  await page.click('.tabs [data-tab="link"]');
  await page.waitForFunction(() => /#\/s\//.test(document.querySelector('.link-row input')?.value || ''), null, { timeout: 8000 });
  shareUrl = await page.$eval('.link-row input', (i) => i.value);
  assert(await page.$('.qr-box svg'), 'qr missing');
  await shot('05-share');
  await page.keyboard.press('Escape');
});

await step('shared route renders the plan read-only', async () => {
  await page.goto(shareUrl.replace(/^https?:\/\/[^/]+\//, base).replace('#/', '?fx=low#/'));
  await page.waitForSelector('.shared .tl-item', { timeout: 10000 });
  await shot('06-shared');
});

await step('week mode builds a timetable', async () => {
  await page.goto(base + '?fx=low#/app/week');
  await page.waitForSelector('#plan-input');
  await page.fill('#plan-input', 'mon-fri 9 to 10am : maths\ntue, thu 2-4pm coding club\ndaily 6am run 30m');
  await page.dispatchEvent('#plan-input', 'input');
  await page.waitForSelector('.wk-cell', { timeout: 5000 });
  const n = await page.$$eval('.wk-cell', (x) => x.length);
  assert(n === 5 + 2 + 7, 'expected 14 cells, got ' + n);
  await shot('07-week');
});

await step('focus mode runs', async () => {
  await page.goto(base + '?fx=low#/focus');
  await page.waitForSelector('.f-time', { timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot('08-focus');
});

await step('command palette opens and filters', async () => {
  await page.goto(base + '?fx=low#/app');
  await page.waitForSelector('#plan-input');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.palette input');
  await page.keyboard.type('late');
  const items = await page.$$eval('.palette-item', (x) => x.map((i) => i.textContent));
  assert(items.some((t) => /Running late/.test(t)), 'palette search failed');
  await page.keyboard.press('Escape');
});

await step('no console errors', async () => {
  assert(!errors.length, errors.join('\n      '));
});

await browser.close();
server.close();
console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
process.exit(failures ? 1 : 0);
