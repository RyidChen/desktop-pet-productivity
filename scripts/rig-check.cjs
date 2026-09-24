const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const reading = process.env.CHECK_READING === '1';
const prefix = reading ? 'reading-rig' : 'rig';
(async () => {
  const env = { ...process.env, MORI_DATA_DIR: path.join(root, '.test-data', `rig-${Date.now()}`) };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const app = await electron.launch(process.env.SMOKE_PACKAGED
    ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env }
    : { args: [root], env });
  try {
    await app.firstWindow();
    let pet;
    for (let i = 0; i < 100 && !pet; i++) { pet = app.windows().find(p => p.url().endsWith('pet.html')); if (!pet) await new Promise(r => setTimeout(r, 50)); }
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.rigReady === 'true');
    if (reading) await pet.waitForFunction(() => document.querySelector('#pet').dataset.readingRigReady === 'true');
    const result = await pet.evaluate(async reading => {
      const idlePose = reading ? 'read' : 'idle', blinkPose = reading ? 'readBlink' : 'blink', happyPose = reading ? 'readHappy' : 'happy';
      const { PetSprite } = await import('./pet-sprite.mjs');
      const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 380;
      const sprite = new PetSprite(canvas);
      await sprite.load('assets/mori-catgirl-atlas.png');
      await sprite.loadRig('assets/mori-classic-rig.png');
      if (reading) await sprite.loadReadingRig('assets/mori-reading-bodies.png');
      sprite.draw(idlePose, 1000);
      const first = canvas.toDataURL();
      sprite.draw(idlePose, 2000);
      const second = canvas.toDataURL();
      sprite.draw(idlePose, 1000, { reducedMotion: true }); const still = canvas.toDataURL();
      sprite.draw(idlePose, 2000, { reducedMotion: true });
      const fixed = still === canvas.toDataURL();
      const gallery = document.createElement('canvas'); gallery.width = 880; gallery.height = 760;
      const gc = gallery.getContext('2d');
      const poses = [idlePose, blinkPose, happyPose, reading ? idlePose : 'lookLeft'];
      const headComponents = [];
      for (let i = 0; i < poses.length; i++) {
        sprite.draw(poses[i], 4100 + i * 140, { gaze: i % 2 ? 1 : -1 });
        gc.fillStyle = i % 2 ? '#333840' : '#faf8f1'; gc.fillRect(i % 2 * 440, Math.floor(i / 2) * 380, 440, 380);
        gc.drawImage(canvas, i % 2 * 440, Math.floor(i / 2) * 380);
        const pixels = canvas.getContext('2d').getImageData(0, 0, 440, 170).data;
        const seen = new Uint8Array(440 * 170); let count = 0;
        for (let p = 0; p < seen.length; p++) {
          if (seen[p] || pixels[p * 4 + 3] < 128) continue;
          const queue = [p]; seen[p] = 1;
          for (let k = 0; k < queue.length; k++) {
            const q = queue[k], x = q % 440, y = Math.floor(q / 440);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if (x + dx < 0 || x + dx >= 440 || y + dy < 0 || y + dy >= 170) continue;
              const n = (y + dy) * 440 + x + dx;
              if (!seen[n] && pixels[n * 4 + 3] >= 128) { seen[n] = 1; queue.push(n); }
            }
          }
          if (queue.length > 80) count++;
        }
        headComponents.push(count);
      }
      // Record the real layered renderer, including blink and head-pat expression.
      const wardrobe = document.createElement('canvas'); wardrobe.width = 1320; wardrobe.height = 760;
      const wc = wardrobe.getContext('2d'), outfitReady = [];
      for (const [i, outfit] of ['classic', 'cozy', 'outing'].entries()) {
        await sprite.setOutfit(outfit);
        outfitReady.push(reading ? Boolean(sprite.readingRig[outfit]) : outfit === 'classic' || Boolean(sprite.outfits.get(outfit).rigBody));
        for (let row = 0; row < 2; row++) {
          sprite.draw(row ? happyPose : idlePose, 4200 + row * 100, { gaze: row ? 1 : -1 });
          wc.fillStyle = row ? '#333840' : '#faf8f1'; wc.fillRect(i * 440, row * 380, 440, 380);
          wc.drawImage(canvas, i * 440, row * 380);
        }
      }
      await sprite.setOutfit('classic');
      const preview = document.createElement('canvas'); preview.width = 440; preview.height = 380;
      const ctx = preview.getContext('2d'), stream = preview.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      recorder.start();
      const started = performance.now();
      await new Promise(resolve => {
        async function frame() {
          const t = performance.now() - started;
          const outfit = t < 2000 ? 'classic' : t < 4000 ? 'cozy' : 'outing';
          if (sprite.outfit !== outfit) await sprite.setOutfit(outfit);
          sprite.draw(t > 3200 && t < 4400 ? happyPose : t > 2000 && t < 2180 ? blinkPose : idlePose, t, { gaze: Math.sin(t / 1200) });
          ctx.fillStyle = '#f5f3eb'; ctx.fillRect(0, 0, 440, 380); ctx.drawImage(canvas, 0, 0);
          if (t < 6000) requestAnimationFrame(frame); else resolve();
        } frame();
      });
      recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      const video = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
      return { first, second, fixed, video, gallery: gallery.toDataURL(), headComponents, wardrobe: wardrobe.toDataURL(), outfitReady };
    }, reading);
    assert.notEqual(result.first, result.second); assert.equal(result.fixed, true);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', `${prefix}-ear-check.png`), Buffer.from(result.gallery.split(',')[1], 'base64'));
    assert.deepEqual(result.headComponents, [1, 1, 1, 1], 'ears stay connected to the hair silhouette');
    assert.deepEqual(result.outfitReady, [true, true, true], 'each outfit has its own layered body');
    fs.writeFileSync(path.join(root, 'artifacts', `${prefix}-wardrobe.png`), Buffer.from(result.wardrobe.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(root, 'artifacts', `${prefix}-idle.png`), Buffer.from(result.first.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(root, 'artifacts', `${prefix}-preview.webm`), Buffer.from(result.video, 'base64'));
    if (reading) {
      const panel = app.windows().find(p => p.url().endsWith('panel.html'));
      const actions = await panel.evaluate(async () => [
        await window.mori.act('companionSettings', { key: 'outfit', value: 'outing' }),
        await window.mori.act('start'),
      ]);
      assert.ok(actions.every(action => action.ok), 'panel can start focus and change outfit');
      await pet.waitForFunction(() => document.querySelector('#pet').dataset.outfit === 'outing' && document.querySelector('#pet').dataset.pose === 'read' && !document.querySelector('#pet-timer').hidden);
      assert.equal(await pet.evaluate(async () => (await window.mori.getState()).timer.running), true);
      await pet.screenshot({ path: path.join(root, 'artifacts', 'reading-rig-window.png') });
    }
    console.log(`PASS: ${prefix} loads, moves, respects reduced motion; preview recorded.`);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
