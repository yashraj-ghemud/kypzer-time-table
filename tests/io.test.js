import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { buildWeek } from '../src/engine/week.js';
import { toICS, weekEvents, dayEvents, foldLine } from '../src/engine/ics.js';
import { encodeShare, decodeShare } from '../src/engine/share.js';
import { encodeQR } from '../src/engine/qr.js';

test('week mode expands day tokens', () => {
  const w = buildWeek('mon-fri 9 to 10am : maths\ntue, thu 2-4pm coding club\ndaily 6am run 30m\nsomvar 5pm tuition');
  assert.equal(w.days[0].length, 3); // maths, run, tuition
  assert.ok(w.days[1].some((b) => b.title === 'coding club' && b.start === 840));
  assert.equal(w.days[6].length, 1); // run only
  assert.ok(w.days[0].some((b) => b.title === 'tuition' && b.start === 1020));
});

test('ics output is valid-ish', () => {
  const w = buildWeek('mon wed fri 10-11am physics, lab');
  const ics = toICS(weekEvents('2026-09-21', w.lines), { calName: 'Week', alarm: 5 });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/);
  assert.match(ics, /DTSTART:20260921T100000/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  const day = toICS(dayEvents('2026-09-24', [{ title: 'a, b; c', start: 1380, end: 1500 }]));
  assert.match(day, /SUMMARY:a\\, b\\; c/);
  assert.match(day, /DTEND:20260925T010000/);
  assert.ok(foldLine('x'.repeat(200)).includes('\r\n '));
});

test('share round trip', async () => {
  const obj = { d: '2026-09-24', t: 'subah 7 baje gym\n3:50 to 5 pm : work 💼', w: '', n: 'My day' };
  const s = await encodeShare(obj);
  assert.match(s, /^[zj][A-Za-z0-9_-]+$/);
  const back = await decodeShare(s);
  assert.equal(back.t, obj.t);
  assert.equal(back.d, obj.d);
});

function decode(qr) {
  const scale = 4;
  const margin = 4;
  const n = (qr.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const mx = Math.floor(x / scale) - margin;
      const my = Math.floor(y / scale) - margin;
      const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx];
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return jsQR(data, n, n);
}

test('qr codes decode', () => {
  for (const text of ['hi', 'https://example.com/#/s/zAbc123', 'x'.repeat(300), 'कल सुबह 7 बजे gym ✓']) {
    for (const ecc of ['L', 'M', 'H']) {
      const qr = encodeQR(text, { ecc });
      const res = decode(qr);
      assert.ok(res, 'decoded v' + qr.version + ' ' + ecc);
      assert.equal(res.data, text);
    }
  }
});
