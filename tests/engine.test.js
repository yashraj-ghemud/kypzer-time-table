import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rows, buildPlan } from './helpers.js';
import { parse } from '../src/engine/parser.js';
import { categorize } from '../src/engine/lexicon.js';
import { schedule } from '../src/engine/scheduler.js';
import { editPlan } from '../src/engine/plan.js';

test('v1 example still works', () => {
  assert.deepEqual(rows('3:45pm : come to room , 3:50 to 5 pm : work , 5:00 to 7 pm : call to wife'), [
    '15:45-15:50 come to room',
    '15:50-17:00 work',
    '17:00-19:00 call to wife',
  ]);
});

test('first ambiguous morning time is AM (v1 forced PM)', () => {
  assert.deepEqual(rows('7 to 9 gym'), ['07:00-09:00 gym']);
});

test('range inherits period with minimal duration', () => {
  assert.deepEqual(rows('11 to 1pm class'), ['11:00-13:00 class']);
  assert.deepEqual(rows('gym 5-7pm'), ['17:00-19:00 gym']);
  assert.deepEqual(rows('17:00–19:00 meeting'), ['17:00-19:00 meeting']);
});

test('point + duration', () => {
  assert.deepEqual(rows('lunch at 1 for 45 min'), ['13:00-13:45 lunch']);
});

test('hinglish times', () => {
  assert.deepEqual(rows('subah 7 baje gym'), ['07:00-08:00 gym']);
  assert.deepEqual(rows('sadhe 3 se 5 baje tak padhai'), ['15:30-17:00 padhai']);
  assert.deepEqual(rows('paune 5 baje chai'), ['16:45-17:30 chai']);
  const r = rows('shaam 6 se 8 cricket\nraat 11 baje so jaana');
  assert.deepEqual(r, ['18:00-20:00 cricket', '23:00-07:00+ so jaana']);
});

test('numbers inside titles are not times', () => {
  const { entries } = parse('read 5 pages');
  assert.equal(entries[0].kind, 'flex');
  assert.equal(entries[0].title, 'read 5 pages');
});

test('overnight explicit times move to next day', () => {
  assert.deepEqual(rows('10pm party, 2am sleep'), ['22:00-02:00+ party', '02:00+-10:00+ sleep']);
});

test('then = sequential', () => {
  assert.deepEqual(rows('9 to 11 study then coding 90m'), ['09:00-11:00 study', '11:00-12:30 coding']);
});

test('categories', () => {
  assert.equal(categorize('call to wife'), 'call');
  assert.equal(categorize('workout'), 'fitness');
  assert.equal(categorize('lunch break'), 'break');
  assert.equal(categorize('padhai'), 'study');
  assert.equal(categorize('xyz'), 'other');
});

test('flex tasks get scheduled without overlap and respect deadline', () => {
  const plan = buildPlan({ text: '9 to 12 work\n1 to 2 lunch\nreport 1h before 6pm !\nstudy 2h', settings: { fromNow: false } });
  const report = plan.blocks.find((b) => b.title === 'report');
  assert.ok(report && report.end <= 18 * 60);
  const sorted = plan.blocks.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end);
});

test('scheduler reports unplaceable tasks', () => {
  const { unplaced } = schedule([{ start: 420, end: 1380 }], [{ id: 'x', title: 'x', category: 'work', duration: 60 }], { windowStart: 420, windowEnd: 1380 });
  assert.equal(unplaced.length, 1);
});

test('analyzer: overlap is critical with move fix', () => {
  const plan = buildPlan({ text: '3 to 5pm work, 4 to 6pm gym', settings: { fromNow: false } });
  const ins = plan.analysis.insights.find((i) => i.level === 'critical');
  assert.ok(ins && ins.fix && ins.fix.type === 'move');
});

test('analyzer: marathon warns', () => {
  const plan = buildPlan({ text: '9am to 1pm deep work', settings: { fromNow: false } });
  assert.ok(plan.analysis.insights.some((i) => i.id.startsWith('marathon')));
  assert.ok(plan.analysis.score.total >= 0 && plan.analysis.score.total <= 100);
});

test('editPlan move keeps other ambiguous blocks in place', () => {
  const text = '9 to 10 study\n11 to 12 gym';
  const p = buildPlan({ text, settings: { fromNow: false } });
  const study = p.blocks.find((b) => b.title === 'study');
  const { text: out } = editPlan(text, [{ type: 'move', id: study.id, start: 18 * 60, end: 19 * 60 }], { settings: { fromNow: false } });
  const r = rows(out);
  assert.ok(r.includes('18:00-19:00 study'), out);
  assert.ok(r.includes('11:00-12:00 gym'), out);
});

test('editPlan add + split', () => {
  const { text } = editPlan('9am to 1pm work', [{ type: 'split', id: 'b-work', at: 630, breakLen: 10 }], {});
  assert.deepEqual(rows(text), ['09:00-10:30 work', '10:30-10:40 break', '10:40-13:10 work'].map((x) => x.replace('13:10', '13:10')));
  const { text: t2 } = editPlan('9 to 10 study', [{ type: 'add', title: 'walk', start: 1080, end: 1100 }], {});
  assert.ok(rows(t2).includes('18:00-18:20 walk'), t2);
});

test('clash fix moves into a slot that really fits', () => {
  const plan = buildPlan({ text: '3:50 to 5 pm : work\n5 to 7 pm : call\n4:30 standup', settings: { fromNow: false } });
  const ins = plan.analysis.insights.find((i) => i.level === 'critical');
  assert.ok(ins.fix);
  assert.equal(ins.fix.start, 19 * 60); // after the call, not 5 PM (which would clash again)
});

test('items appended out of order stay on the same day', () => {
  assert.deepEqual(rows('3:50 to 5 pm : work\n5 to 7 pm : call\nsubah 7 baje gym\n4:30 standup'), [
    '07:00-08:00 gym',
    '15:50-17:00 work',
    '16:30-17:00 standup',
    '17:00-19:00 call',
  ]);
  assert.deepEqual(rows('5pm gym, 9am work'), ['09:00-10:00 work', '17:00-18:00 gym']);
});

test('after sleep, the morning is tomorrow', () => {
  assert.deepEqual(rows('11pm sleep, 7am wake up'), ['23:00-07:00+ sleep', '07:00+-07:20+ wake up']);
});
