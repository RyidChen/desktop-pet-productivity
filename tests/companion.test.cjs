const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');

test('five-minute start survives restart without changing the preferred duration', () => {
  const m = new FocusModel();
  m.dispatch('quickStart', null, 1000000);
  assert.equal(m.settings.focus, 25);
  assert.equal(m.timer.duration, 300000);
  m.pause(1060000);
  const restored = new FocusModel(m.snapshot(1060000));
  assert.equal(restored.timer.remaining, 240000);
  assert.equal(restored.timer.duration, 300000);
  restored.dispatch('start', null, 2000000);
  assert.throws(() => restored.dispatch('quickStart', null, 2000100));
  assert.equal(restored.tick(2240000), true);
  assert.equal(restored.tick(2300000), false);
  restored.dispatch('mode', 'focus', 2300000);
  assert.equal(restored.timer.duration, 1500000);
});

test('quick start cannot silently overwrite a paused session and reset uses its own duration', () => {
  const m = new FocusModel();
  m.dispatch('start', null, 1000000);
  m.pause(1060000);
  assert.throws(() => m.dispatch('quickStart', null, 1060000));
  m.dispatch('reset', null, 1060000);
  m.dispatch('quickStart', null, 1060000);
  m.pause(1070000);
  m.dispatch('reset', null, 1070000);
  assert.equal(m.timer.remaining, 300000);
  const invalid = new FocusModel({ timer: { duration: -1, remaining: 9999999 } });
  assert.equal(invalid.timer.duration, 1500000);
  assert.equal(invalid.timer.remaining, 1500000);
});

test('presence and pinning persist without interrupting focus and reject invalid values', () => {
  const m = new FocusModel();
  m.dispatch('start', null, 1000000);
  m.dispatch('companionSettings', { key: 'presence', value: 'quiet' }, 1000001);
  m.dispatch('companionSettings', { key: 'panelPinned', value: true }, 1000001);
  assert.equal(m.timer.running, true);
  const restored = new FocusModel(m.snapshot());
  assert.equal(restored.settings.presence, 'quiet');
  assert.equal(restored.settings.panelPinned, true);
  assert.throws(() => m.dispatch('companionSettings', { key: 'presence', value: 'bad' }));
  assert.throws(() => m.dispatch('companionSettings', { key: 'panelPinned', value: 'yes' }));
});

test('memories survive missing days and ignore future and zero-activity records', () => {
  const m = new FocusModel({ days: {
    '2026-09-01': { ms: 1200000, rounds: 1 },
    '2026-09-04': { ms: 300000, rounds: 1 },
    '2026-09-05': { ms: 0, rounds: 0 },
    '2026-09-20': { ms: 300000, rounds: 1 },
  } });
  const now = new Date(2026, 8, 12, 12).getTime();
  const memory = m.snapshot(now).companion;
  assert.equal(memory.days, 2);
  assert.equal(memory.rounds, 2);
  assert.deepEqual(memory.previous, { date: '2026-09-04', minutes: 5 });
  assert.equal(memory.milestones[0].unlocked, true);
  assert.equal(memory.milestones[1].unlocked, false);
  assert.deepEqual(new FocusModel(m.snapshot(now)).snapshot(now).companion, memory);
  assert.equal(new FocusModel().snapshot(now).companion.previous, null);
});
