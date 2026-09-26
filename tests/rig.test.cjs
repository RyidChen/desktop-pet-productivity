const { test } = require('node:test');
const assert = require('node:assert/strict');
test('layered idle animates individual parts, stays still in calm mode and falls back for reading', async () => {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform','clearRect','setTransform','transform','translate','rotate','scale','save','restore','beginPath','rect','clip','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
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
  sprite.readingRig = Object.fromEntries(['classic', 'cozy', 'outing'].map(outfit => [outfit, frame(`reading-${outfit}`)]));
  sprite.readingHeads = { head: frame('reading-head'), closed: frame('reading-closed') };
  for (const outfit of ['classic', 'cozy', 'outing']) {
    sprite.outfit = outfit; sprite.rigLayout = null;
    draw(1000, {}, 'read');
    assert.equal(calls.filter(c => c[0] === 'drawImage').length, 5);
    assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === `reading-${outfit}`));
    assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'reading-head'));
    assert.notEqual(draw(1000, {}, 'read'), draw(2000, {}, 'read'));
    for (const pose of ['readBlink', 'readHappy']) {
      draw(1000, {}, pose); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'reading-closed'));
    }
    assert.equal(draw(1000, { calm: true }, 'read'), draw(2000, { calm: true }, 'read'));
    assert.equal(draw(1000, { reducedMotion: true }, 'read'), draw(2000, { reducedMotion: true }, 'read'));
  }
  sprite.readingRig = null; draw(1000, {}, 'read');
  assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'read'), 'missing seated layers retain original reading pose');
  sprite.outfit = 'classic';
  sprite.activityRigs = Object.fromEntries(['classic', 'cozy', 'outing'].map(outfit => [outfit, Object.fromEntries(['sleep','stretch','held','wave','snack','yawn'].map(pose => [pose, frame(`${outfit}-${pose}`)]))]));
  sprite.activityHeads = { yawn: frame('yawn-head'), held: frame('held-head') };
  for (const outfit of ['classic', 'cozy', 'outing']) for (const pose of ['sleep','stretch','held','wave','snack','yawn']) {
    sprite.outfit = outfit; sprite.rigLayout = null;
    draw(1000, {}, pose);
    assert.equal(calls.filter(c => c[0] === 'drawImage').length, 5, `${outfit}/${pose} is layered`);
    assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === `${outfit}-${pose}`));
    if (pose === 'yawn' || pose === 'held') assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === `${pose}-head`));
    assert.equal(draw(1000, { reducedMotion: true }, pose), draw(2400, { reducedMotion: true }, pose));
  }
  sprite.outfit = 'classic';
  sprite.rigPose = ''; sprite.rigLayout = null;
  draw(0, {}, 'idle');
  draw(1000, {}, 'sleep'); assert.equal(sprite.rigLayout[1], -89, 'entering sleep starts from standing head height');
  draw(1160, {}, 'sleep'); assert.ok(sprite.rigLayout[1] > -89 && sprite.rigLayout[1] < -54, 'head moves through a seated midpoint');
  draw(1420, {}, 'sleep'); assert.equal(sprite.rigLayout[1], -54);
  draw(2000, { reducedMotion: true }, 'idle'); assert.equal(sprite.rigLayout[1], -89, 'reduced motion skips transition');
  sprite.activityRigs = null;
  sprite.rig = null; draw(1000); assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'fallback'));
});

test('rest and activity motion deforms locally, keeps the baseline and respects still modes', async () => {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform','clearRect','setTransform','transform','translate','rotate','scale','save','restore','beginPath','rect','clip','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
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

test('focus transition keeps native body proportions and blinks do not restart it', async () => {
  const { PetSprite } = await import('../src/ui/pet-sprite.mjs');
  const calls = [];
  const context = Object.fromEntries(['resetTransform','clearRect','setTransform','transform','translate','rotate','scale','save','restore','beginPath','rect','clip','drawImage'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const sprite = new PetSprite({ width: 440, height: 380, getContext: () => context });
  const frame = image => ({ image, x: 0, y: 0, width: 100, height: 100, anchor: 50 });
  sprite.ready = true; sprite.scale = 1; sprite.frames = { idle: frame('fallback'), read: frame('fallback-read') };
  sprite.rig = Object.fromEntries(['body','head','closed','earLeft','earRight','tail'].map(name => [name, frame(name)]));
  sprite.readingRig = { classic: frame('book') }; sprite.readingHeads = { head: frame('read-head'), closed: frame('read-closed') };
  sprite.draw('idle', 0); sprite.draw('read', 1000);
  for (const [time, pose] of [[1080,'read'],[1160,'readBlink'],[1210,'read'],[1320,'read'],[1500,'read']]) {
    calls.length = 0; sprite.draw(pose, time);
    assert.equal(calls.filter(c => c[0] === 'drawImage').length, 5, 'one solid body and head, with no superimposed faces');
    for (const c of calls.filter(c => c[0] === 'drawImage')) {
      if (c[1] === 'book') assert.equal(c[9], 65, 'book body never grows to standing proportions');
      if (c[1] === 'body') assert.equal(c[9], 94, 'standing body never shrinks into seated body');
    }
  }
  assert.equal(sprite.rigLayout[1], -54, 'blink does not delay arriving at reading posture');
  sprite.draw('idle', 1600); sprite.draw('idle', 1750);
  const beforeReverse = sprite.rigLayout[1]; sprite.draw('read', 1750);
  assert.equal(sprite.rigLayout[1], beforeReverse, 'reversal starts from the current head position');
  sprite.draw('read', 2300); assert.equal(sprite.rigLayout[1], -54);
});
