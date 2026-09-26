const { test } = require('node:test');
const assert = require('node:assert/strict');

async function fixture() {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform', 'clearRect', 'setTransform', 'transform', 'translate', 'rotate', 'scale', 'save', 'restore', 'beginPath', 'rect', 'clip', 'drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const sprite = new PetSprite({ width: 440, height: 380, getContext: () => context });
  const frame = image => ({ image, x: 0, y: 0, width: 100, height: 100, anchor: 50 });
  sprite.ready = true; sprite.scale = 1;
  sprite.frames = Object.fromEntries(['idle', 'blink', 'read', 'readBlink', 'readHappy', 'sleep', 'stretch'].map(pose => [pose, frame(`fallback-${pose}`)]));
  sprite.rig = Object.fromEntries(['body', 'head', 'closed', 'earLeft', 'earRight', 'tail'].map(name => [name, frame(name)]));
  sprite.readingRig = { classic: frame('book') };
  sprite.readingHeads = { head: frame('read-head'), closed: frame('read-closed') };
  sprite.activityRigs = { classic: { sleep: frame('sleep-body'), stretch: frame('stretch-body') } };
  const scale = 94 / 200;
  sprite.focusRigs = { classic: Array.from({ length: 8 }, (_, i) => ({ image: `focus-${i}`, x: i * 200, y: 0, width: 110 + i * 5, height: 200 - i * 8, anchor: 55, scale })) };
  const draw = (pose, time, options) => {
    calls.length = 0; sprite.draw(pose, time, options);
    return calls.filter(c => c[0] === 'drawImage' && String(c[1]).startsWith('focus-'));
  };
  return { sprite, draw, scale };
}

test('standing and reading draw every authored middle pose at one fixed scale in both directions', async () => {
  const { draw, scale } = await fixture();
  draw('idle', 0);
  for (const [pose, start, expected] of [['read', 1000, [0,1,2,3,4,5,6,7]], ['idle', 2200, [7,6,5,4,3,2,1,0]]]) {
    const shown = [];
    for (let t = 0; t <= 1000; t += 10) {
      const bodies = draw(pose, start + t);
      assert.equal(bodies.length, 1, 'render one real sequence body instead of swapping or dissolving the endpoints');
      const c = bodies[0], step = Number(c[1].slice(6));
      if (shown.at(-1) !== step) shown.push(step);
      assert.ok(Math.abs(c[8] / c[4] - scale) < 1e-9, 'body width retains the common source scale');
      assert.ok(Math.abs(c[9] / c[5] - scale) < 1e-9, 'body height retains the common source scale');
    }
    assert.deepEqual(shown, expected, 'bending and rising use the intermediate drawings in order');
  }
});

test('blinking preserves focus progress and reversing continues from the currently drawn posture', async () => {
  const subject = await fixture(), control = await fixture();
  for (const s of [subject, control]) { s.draw('idle', 0); s.draw('read', 1000); }
  for (const [time, pose] of [[1100, 'read'], [1220, 'readBlink'], [1320, 'read']]) {
    assert.deepEqual(subject.draw(pose, time).map(c => c[1]), control.draw('read', time).map(c => c[1]), 'eyelids never restart the body sequence');
  }
  const position = subject.sprite.focusPosition;
  assert.ok(position > 0 && position < 7, 'the reversal occurs midway through the gesture');
  subject.sprite.focusRigs.cozy = subject.sprite.focusRigs.classic.map(f => ({ ...f }));
  subject.sprite.outfits.set('cozy', { frames: subject.sprite.frames, scale: subject.sprite.scale });
  await subject.sprite.setOutfit('cozy'); subject.draw('read', 1320);
  assert.equal(subject.sprite.focusPosition, position, 'changing outfits retains the in-progress body posture');
  subject.draw('idle', 1320);
  assert.equal(subject.sprite.focusPosition, position, 'changing direction does not jump to either endpoint');
  subject.draw('idle', 1420);
  assert.ok(subject.sprite.focusPosition < position, 'the current pose moves back toward standing');
  subject.draw('idle', 2400);
  assert.equal(subject.sprite.focusStep, 0);
});

test('still modes and interrupted activities never replay an obsolete focus sequence', async () => {
  for (const option of ['calm', 'reducedMotion']) {
    const { sprite, draw } = await fixture();
    draw('idle', 0); draw('read', 1000); draw('read', 1120, { [option]: true });
    assert.equal(sprite.focusStep, 7, `${option} shows the seated endpoint immediately`);
    draw('idle', 1200, { [option]: true });
    assert.equal(sprite.focusStep, 0, `${option} shows the standing endpoint immediately`);
  }
  const { sprite, draw } = await fixture();
  draw('idle', 0); draw('read', 1000); draw('read', 1120);
  assert.equal(draw('sleep', 1150).length, 0, 'sleep owns the body while the activity is active');
  draw('read', 1180);
  assert.equal(sprite.focusStep, 7, 'returning from an activity does not resume an obsolete crouch');
});

test('finishing focus stands up before stretching and starting during stretch plays the sitting sequence', async () => {
  const { draw } = await fixture();
  draw('readHappy', 0, { reducedMotion: true });
  const rising = [];
  for (let t = 0; t <= 1000; t += 10) {
    const body = draw('stretch', 1000 + t)[0];
    if (!body) continue;
    const step = Number(body[1].slice(6));
    if (rising.at(-1) !== step) rising.push(step);
  }
  assert.deepEqual(rising, [7,6,5,4,3,2,1,0], 'focus completion uses the full rise before its stretch activity');
  assert.equal(draw('stretch', 2100).length, 0, 'the stretch animation takes over after standing');
  const sitting = [];
  for (let t = 0; t <= 1000; t += 10) {
    const body = draw('read', 2200 + t)[0];
    assert.ok(body, 'starting focus during a standing activity still uses the focus sequence');
    const step = Number(body[1].slice(6));
    if (sitting.at(-1) !== step) sitting.push(step);
  }
  assert.deepEqual(sitting, [0,1,2,3,4,5,6,7]);
});
