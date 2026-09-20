const { test } = require('node:test');
const assert = require('node:assert/strict');
test('layered idle animates individual parts, stays still in calm mode and falls back for reading', async () => {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform','clearRect','setTransform','transform','translate','rotate','scale','save','restore','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const sprite = new PetSprite({ width: 440, height: 380, getContext: () => context });
  const frame = name => ({ image: name, x: 0, y: 0, width: 100, height: 100, anchor: 50 });
  sprite.ready = true; sprite.scale = 1;
  sprite.frames = { idle: frame('fallback'), read: frame('read') };
  sprite.rig = Object.fromEntries(['body','head','closed','earLeft','earRight','tail'].map(name => [name, frame(name)]));
  const draw = (time, options = {}, pose = 'idle') => { calls.length = 0; sprite.family = ''; sprite.draw(pose, time, options); return JSON.stringify(calls); };
  draw(1000);
  assert.equal(calls.filter(c => c[0] === 'drawImage').length, 5);
  assert.notEqual(draw(1000), draw(2000));
  assert.equal(draw(1000, { calm: true }), draw(2000, { calm: true }));
  assert.equal(draw(1000, { reducedMotion: true }), draw(2000, { reducedMotion: true }));
  draw(1100, { landedAt: 1000 }); assert.ok(calls.some(c => c[0] === 'scale' && c[1] > 1));
  draw(1250, { interaction: 'play', interactionSince: 1000 }, 'curious'); assert.ok(calls.some(c => c[0] === 'translate' && c[1] === 0 && c[2] < -3 && c[2] > -4));
  draw(1000, {}, 'happy'); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'closed'));
  draw(1000, {}, 'read'); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'read'));
  for (const outfit of ['cozy', 'outing']) {
    sprite.outfit = outfit;
    sprite.outfits.set(outfit, { rigBody: frame(outfit) });
    draw(1000); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === outfit));
    assert.equal(calls.filter(c => c[0] === 'drawImage').length, 5);
    sprite.outfits.set(outfit, { rigBody: null });
    draw(1000); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'fallback'));
  }
  sprite.outfit = 'classic';
  sprite.rig = null; draw(1000); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'fallback'));
});

test('rest and activity motion deforms locally, keeps the baseline and respects still modes', async () => {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform','clearRect','setTransform','transform','translate','rotate','scale','save','restore','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const sprite = new PetSprite({ width: 440, height: 380, getContext: () => context });
  sprite.ready = true; sprite.scale = 1;
  const poses = ['sleep', 'read', 'readBlink', 'readHappy', 'stretch', 'yawn', 'snack', 'wave'];
  sprite.frames = Object.fromEntries(poses.map(pose => [pose, { image: pose, x: 20, y: 30, width: 100, height: 140, anchor: 50 }]));
  const draw = (pose, now, options = {}) => { calls.length = 0; sprite.family = ''; sprite.draw(pose, now, options); return JSON.stringify(calls); };
  for (const pose of poses) {
    const first = draw(pose, 1000);
    assert.ok(calls.filter(c => c[0] === 'drawImage').length > 1, `${pose} moves within the silhouette`);
    assert.notEqual(first, draw(pose, 2400), `${pose} animates`);
    const bands = calls.filter(c => c[0] === 'drawImage');
    const last = bands.at(-1);
    assert.ok(Math.abs(last[7] + last[9]) < 1e-8, `${pose} stays on the baseline`);
    for (const option of ['calm', 'reducedMotion']) {
      assert.equal(draw(pose, 1000, { [option]: true }), draw(pose, 2400, { [option]: true }));
      assert.equal(calls.filter(c => c[0] === 'drawImage').length, 1);
    }
  }
});
