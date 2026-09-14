const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');
const { IdleClock, resolvePose } = require('../src/ui/pet-state.mjs');

test('outfit defaults, validation and restoration preserve other settings', () => {
  assert.equal(new FocusModel().settings.outfit, 'classic');
  for (const value of ['classic', 'cozy', 'outing']) {
    const model = new FocusModel();
    model.dispatch('companionSettings', { key: 'outfit', value });
    const restored = new FocusModel(model.snapshot());
    assert.equal(restored.settings.outfit, value);
    assert.equal(restored.settings.presence, 'companion');
  }
  assert.throws(() => new FocusModel().dispatch('companionSettings', { key: 'outfit', value: '../bad' }));
});

test('idle actions have gaps, avoid immediate repeats and reset while ineligible', () => {
  const idle = new IdleClock(0, () => 0);
  assert.equal(idle.update(1000, true), '');
  const first = idle.update(20000, true);
  assert.ok(first);
  assert.equal(idle.update(20001, true), first);
  assert.equal(idle.update(30000, false), '');
  assert.equal(idle.update(30001, true), '');
  const second = idle.update(50000, true);
  assert.ok(second); assert.notEqual(second, first);
});

test('idle motion never overrides focused reading, interaction, held or sleep', () => {
  const base = { lastActive: 0, idlePose: 'lookLeft' };
  assert.equal(resolvePose(base, 10000), 'lookLeft');
  assert.equal(resolvePose({ ...base, held: true }, 10000), 'held');
  assert.equal(resolvePose({ ...base, timer: { mode: 'focus', running: true } }, 10000), 'read');
  assert.equal(resolvePose({ ...base, reaction: 'snack', reactionUntil: 12000 }, 10000), 'snack');
  assert.equal(resolvePose({ ...base, timer: { mode: 'focus', running: true }, reaction: 'snack', reactionUntil: 12000 }, 10000), 'readHappy');
  assert.equal(resolvePose(base, 59000), 'yawn');
  assert.equal(resolvePose(base, 60001), 'sleep');
});
