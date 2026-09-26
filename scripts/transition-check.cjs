const { _electron: electron } = require('playwright-core');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, MORI_DATA_DIR: path.join(root, '.test-data', `transition-${Date.now()}`) };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const app = await electron.launch(process.env.SMOKE_PACKAGED ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env } : { args: [root], env });
  const errors = [], watched = new WeakSet();
  const watch = page => {
    if (watched.has(page)) return;
    watched.add(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  };
  app.on('window', watch); app.windows().forEach(watch);
  try {
    await app.firstWindow();
    let pet;
    for (let i = 0; i < 100 && !pet; i++) { pet = app.windows().find(p => p.url().endsWith('pet.html')); if (!pet) await new Promise(r => setTimeout(r, 50)); }
    assert.ok(pet, 'desktop pet window opens'); watch(pet);
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.ready === 'true');
    const result = await pet.evaluate(async () => {
      const { PetSprite } = await import('./pet-sprite.mjs');
      const sprites = [], issues = [], visits = [];
      for (const outfit of ['classic', 'cozy', 'outing']) {
        const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 380;
        const sprite = new PetSprite(canvas); await sprite.load('assets/mori-catgirl-atlas.png');
        await sprite.loadRig('assets/mori-classic-rig.png'); await sprite.loadReadingRig('assets/mori-reading-bodies.png');
        await sprite.loadFocusRig(); await sprite.setOutfit(outfit);
        sprites.push(sprite);
      }
      const components = canvas => {
        const { width, height } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        const seen = new Uint8Array(width * height); let count = 0;
        for (let p = 0; p < seen.length; p++) {
          if (seen[p] || pixels[p * 4 + 3] < 128) continue;
          const queue = [p]; seen[p] = 1;
          for (let k = 0; k < queue.length; k++) {
            const q = queue[k], x = q % width, y = Math.floor(q / width);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
              const n = (y + dy) * width + x + dx;
              if (!seen[n] && pixels[n * 4 + 3] >= 128) { seen[n] = 1; queue.push(n); }
            }
          }
          if (queue.length > 200) count++;
        }
        return count;
      };
      const inBounds = canvas => {
        const c = canvas.getContext('2d'), { width: w, height: h } = canvas;
        return [c.getImageData(0, 0, w, 1), c.getImageData(0, h - 1, w, 1), c.getImageData(0, 0, 1, h), c.getImageData(w - 1, 0, 1, h)].every(p => p.data.every((v, j) => j % 4 !== 3 || v === 0));
      };
      const gallery = document.createElement('canvas'); gallery.width = 2400; gallery.height = 840;
      const gc = gallery.getContext('2d');
      for (const [row, sprite] of sprites.entries()) {
        const frames = sprite.focusRigs[sprite.outfit], bodyDraws = [];
        if (!frames || frames.length !== 8) throw new Error(sprite.outfit + ': expected eight authored body frames');
        if (frames.some(f => Math.abs(f.scale - frames[0].scale) > 1e-9)) issues.push(sprite.outfit + ': varying frame scale');
        const c = sprite.context, original = c.drawImage;
        c.drawImage = function (...args) {
          const step = frames.findIndex(f => args.length === 9 && f.image === args[0] && f.x === args[1] && f.y === args[2] && f.width === args[3] && f.height === args[4]);
          if (step >= 0) {
            const f = frames[step], transform = this.getTransform();
            bodyDraws.push(step);
            if (Math.abs(args[7] / f.width - f.scale) > 1e-9 || Math.abs(args[8] / f.height - f.scale) > 1e-9) issues.push(sprite.outfit + '/' + step + ': body resized between keyframes');
            if (Math.abs(Math.hypot(transform.a, transform.b) - Math.hypot(transform.c, transform.d)) > 1e-9) issues.push(sprite.outfit + '/' + step + ': nonuniform body transform');
            if (this.globalAlpha !== 1) issues.push(sprite.outfit + '/' + step + ': translucent body');
          }
          return original.apply(this, args);
        };
        for (const [from, to] of [['idle', 'read'], ['read', 'idle']]) {
          sprite.draw(from, 0, { reducedMotion: true });
          const shown = [];
          for (let t = 0; t <= 1000; t += 10) {
            bodyDraws.length = 0;
            sprite.draw(to === 'read' && t >= 180 && t < 300 ? 'readBlink' : to, 1000 + t);
            if (bodyDraws.length !== 1) issues.push(sprite.outfit + '/' + to + '/' + t + ': expected one sequence body, found ' + bodyDraws.length);
            const step = bodyDraws[0];
            if (shown.at(-1) === step) continue;
            shown.push(step);
            const label = sprite.outfit + '/' + to + '/' + step;
            if (!inBounds(sprite.canvas)) issues.push(label + ': cropped by canvas edge');
            if (components(sprite.canvas) !== 1) issues.push(label + ': disconnected head, ears, body or tail');
            if (to === 'read' && Number.isInteger(step)) {
              const x = step * 300, y = row * 280;
              gc.fillStyle = row % 2 ? '#30373b' : '#faf8f1'; gc.fillRect(x, y, 300, 280);
              gc.drawImage(sprite.canvas, x, y + 20, 300, 259);
              gc.fillStyle = row % 2 ? '#faf8f1' : '#344537'; gc.font = '17px sans-serif';
              gc.fillText(sprite.outfit + ' · ' + (step + 1) + '/8', x + 12, y + 21);
            }
          }
          visits.push({ outfit: sprite.outfit, to, shown });
        }
        c.drawImage = original;
      }
      // Both rows run through the real renderer. Slow playback changes only the clock.
      const slow = sprites.map(source => {
        const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 380;
        const sprite = new PetSprite(canvas);
        for (const key of ['ready', 'frames', 'scale', 'rig', 'readingRig', 'readingHeads', 'focusRigs', 'outfit', 'outfits']) sprite[key] = source[key];
        return sprite;
      });
      const preview = document.createElement('canvas'); preview.width = 1320; preview.height = 840;
      const ctx = preview.getContext('2d'), stream = preview.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }), chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data); const stopped = new Promise(r => recorder.onstop = r);
      for (const s of [...sprites, ...slow]) s.draw('idle', 0, { reducedMotion: true });
      recorder.start(); const start = performance.now();
      await new Promise(resolve => {
        function frame() {
          const t = performance.now() - start, reading = t >= 1200 && t < 5200;
          const pose = reading && t >= 1400 && t < 1520 ? 'readBlink' : reading ? 'read' : 'idle';
          ctx.fillStyle = '#f5f3eb'; ctx.fillRect(0, 0, 1320, 840);
          for (const [row, group] of [sprites, slow].entries()) {
            for (const [i, s] of group.entries()) { s.draw(pose, t * (row ? 0.35 : 1)); ctx.drawImage(s.canvas, i * 440, row * 420 + 40); }
            ctx.fillStyle = '#344537'; ctx.font = '22px sans-serif';
            ctx.fillText((row ? '慢速檢查 0.35×' : '正常速度 1×') + ' · ' + (reading ? '坐下閱讀' : '起身待機'), 20, row * 420 + 29);
          }
          if (t < 10000) requestAnimationFrame(frame); else resolve();
        }
        frame();
      });
      recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
      const video = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
      return { issues: [...new Set(issues)], visits, gallery: gallery.toDataURL().split(',')[1], video };
    });
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', 'focus-keyframes.png'), Buffer.from(result.gallery, 'base64'));
    fs.writeFileSync(path.join(root, 'artifacts', 'focus-keyframes.webm'), Buffer.from(result.video, 'base64'));
    console.log(JSON.stringify({ visits: result.visits, issues: result.issues, errors }, null, 2));
    assert.deepEqual(errors, [], 'renderer has no exceptions or console errors');
    assert.deepEqual(result.issues, [], 'drawn keyframes retain their scale, stay connected and fit the canvas');
    for (const visit of result.visits) assert.deepEqual(visit.shown, visit.to === 'read' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0], visit.outfit + '/' + visit.to + ': all middle poses render in order');
    console.log('PASS: all three outfits draw eight solid, connected keyframes at a fixed body scale in both directions. Normal and slow previews recorded; visual review is still required.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
