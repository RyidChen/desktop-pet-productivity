const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePose } = require('../src/ui/pet-state.mjs');

test('being held takes precedence over a head pat and a running focus timer', () => {
  assert.equal(resolvePose({ held: true, reaction: 'happy', reactionUntil: 2000, timer: { running: true, mode: 'focus' } }, 1000), 'held');
});
test('a head pat expires back to reading without stopping the focus session', () => {
  const state = { reaction: 'happy', reactionUntil: 2000, timer: { running: true, mode: 'focus' } };
  assert.equal(resolvePose(state, 1500), 'readHappy');
  assert.equal(resolvePose(state, 2100), 'read');
});
test('idle falls asleep after a minute but active breaks never sleep', () => {
  assert.equal(resolvePose({ lastActive: 0, timer: { running: false, mode: 'focus' } }, 60001), 'sleep');
  assert.equal(resolvePose({ lastActive: 0, phaseSince: 0, timer: { running: true, mode: 'break' } }, 60001), 'stretch');
});
test('idle blink is brief and a greeting returns to the previous base pose', () => {
  assert.equal(resolvePose({ lastActive: 0, blinkUntil: 6660 }, 6500), 'blink');
  assert.equal(resolvePose({ lastActive: 0, blinkUntil: 6660 }, 6700), 'idle');
  assert.equal(resolvePose({ lastActive: 0, reaction: 'wave', reactionUntil: 1000 }, 500), 'wave');
  assert.equal(resolvePose({ lastActive: 0, reaction: 'wave', reactionUntil: 1000 }, 1100), 'idle');
});
