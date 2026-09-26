const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, MORI_DATA_DIR: path.join(root, '.test-data', `activity-${Date.now()}`) };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const app = await electron.launch(process.env.SMOKE_PACKAGED
    ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env }
    : { args: [root], env });
  try {
    await app.firstWindow();
    let pet;
    for (let i = 0; i < 100 && !pet; i++) { pet = app.windows().find(p => p.url().endsWith('pet.html')); if (!pet) await new Promise(r => setTimeout(r, 50)); }
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.ready === 'true');
    const result = await pet.evaluate(async () => {
      const { PetSprite } = await import('./pet-sprite.mjs');
      const sprites = [], checks = [];
      const poses = ['sleep', 'stretch', 'held', 'read', 'readBlink', 'readHappy', 'yawn', 'snack', 'wave'];
      for (const outfit of ['classic', 'cozy', 'outing']) {
        const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 380;
        const sprite = new PetSprite(canvas);
        await sprite.load('assets/mori-catgirl-atlas.png');
        await sprite.loadReading('assets/mori-reading-atlas.png');
        await sprite.loadIdle('assets/mori-idle-atlas.png');
        await sprite.loadRig('assets/mori-classic-rig.png');
        await sprite.loadReadingRig('assets/mori-reading-bodies.png');
        await sprite.loadActivityRig();
        await sprite.setOutfit(outfit);
        if (!sprite.activityRigs[outfit]) throw new Error(`Missing activity layers: ${outfit}`);
        const draw = (pose, time, options) => { sprite.family = ''; sprite.rigLayout = null; sprite.rigPose = ''; sprite.draw(pose, time, options); return canvas.toDataURL(); };
        for (const pose of poses) {
          const moving = draw(pose, 1000) !== draw(pose, 2400);
          const calm = draw(pose, 1000, { calm: true }) === draw(pose, 2400, { calm: true });
          const reduced = draw(pose, 1000, { reducedMotion: true }) === draw(pose, 2400, { reducedMotion: true });
          sprite.draw(pose, 1600);
          const ctx = canvas.getContext('2d');
          const clearEdge = [ctx.getImageData(0, 0, 440, 1), ctx.getImageData(0, 379, 440, 1), ctx.getImageData(0, 0, 1, 380), ctx.getImageData(439, 0, 1, 380)].every(p => p.data.every((v, i) => i % 4 !== 3 || v === 0));
          checks.push({ outfit, pose, moving, calm, reduced, clearEdge });
        }
        sprites.push(sprite);
      }
      const gallery = document.createElement('canvas'); gallery.width = 1320; gallery.height = 2280;
      const gc = gallery.getContext('2d');
      for (let row = 0; row < 6; row++) for (const [i, sprite] of sprites.entries()) {
        sprite.family = ''; sprite.rigLayout = null; sprite.rigPose = ''; sprite.draw(['sleep','stretch','held','wave','snack','yawn'][row], 1600);
        gc.fillStyle = row % 2 ? '#333840' : '#faf8f1'; gc.fillRect(i * 440, row * 380, 440, 380);
        gc.drawImage(sprite.canvas, i * 440, row * 380);
      }
      const preview = document.createElement('canvas'); preview.width = 1320; preview.height = 400;
      const ctx = preview.getContext('2d'), stream = preview.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }), chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      recorder.start();
      const sequence = [['sleep', '睡覺／休息'], ['stretch', '伸懶腰'], ['read', '閱讀'], ['held', '拖曳'], ['snack', '吃點心'], ['wave', '打招呼']];
      const started = performance.now();
      await new Promise(resolve => {
        function frame() {
          const t = performance.now() - started, [pose, label] = sequence[Math.min(5, Math.floor(t / 3000))];
          ctx.fillStyle = '#f5f3eb'; ctx.fillRect(0, 0, 1320, 400);
          for (const [i, sprite] of sprites.entries()) {
            sprite.family = ''; sprite.draw(pose, t);
            ctx.drawImage(sprite.canvas, i * 440, 20);
          }
          ctx.fillStyle = '#344537'; ctx.font = '20px sans-serif'; ctx.fillText(label, 20, 26);
          if (t < 18000) requestAnimationFrame(frame); else resolve();
        } frame();
      });
      recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      const video = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
      // An opaque source must not gain transparent horizontal cracks during deformation.
      const solid = document.createElement('canvas'); solid.width = 100; solid.height = 140;
      solid.getContext('2d').fillRect(0, 0, 100, 140);
      const probe = document.createElement('canvas'); probe.width = 440; probe.height = 380;
      const testSprite = new PetSprite(probe), pc = testSprite.context;
      let seamFree = true;
      for (const pose of poses) for (const time of [0, 800, 1600, 2400, 3200]) {
        pc.resetTransform(); pc.clearRect(0, 0, 440, 380); pc.setTransform(2, 0, 0, 2, 220, 362);
        testSprite.drawActivity({ image: solid, x: 0, y: 0, width: 100, height: 140, anchor: 50 }, 1, pose, time);
        seamFree &&= pc.getImageData(170, 120, 100, 210).data.every((v, i) => i % 4 !== 3 || v >= 250);
      }
      return { checks, seamFree, gallery: gallery.toDataURL().split(',')[1], video };
    });
    for (const check of result.checks) for (const key of ['moving', 'calm', 'reduced', 'clearEdge']) assert.equal(check[key], true, `${check.outfit}/${check.pose}: ${key}`);
    assert.equal(result.seamFree, true, 'deformation must not create transparent seams');
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', 'activity-check.json'), JSON.stringify(result.checks, null, 2));
    fs.writeFileSync(path.join(root, 'artifacts', 'activity-gallery.png'), Buffer.from(result.gallery, 'base64'));
    fs.writeFileSync(path.join(root, 'artifacts', 'activity-preview.webm'), Buffer.from(result.video, 'base64'));
    console.log('PASS: 27 outfit/pose combinations animate, stay still in calm/reduced motion, and remain inside the canvas.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
