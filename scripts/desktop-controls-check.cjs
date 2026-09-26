const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, MORI_DATA_DIR: path.join(root, '.test-data', `desktop-${Date.now()}`) };
for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
async function launch() {
  const app = await electron.launch(process.env.SMOKE_PACKAGED
    ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env }
    : { args: [root], env });
  await app.firstWindow();
  for (let i = 0; i < 100 && app.windows().length < 2; i++) await new Promise(r => setTimeout(r, 50));
  const panel = app.windows().find(p => p.url().endsWith('panel.html'));
  const pet = app.windows().find(p => p.url().endsWith('pet.html'));
  await pet.waitForFunction(() => document.querySelector('#pet')?.dataset.ready === 'true');
  return { app, panel, pet };
}
const geometry = app => app.evaluate(({ BrowserWindow, screen }) => {
  const pet = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('pet.html'));
  return { bounds: pet.getBounds(), work: screen.getDisplayMatching(pet.getBounds()).workArea, visible: pet.isVisible() };
});
function inside({ bounds: b, work: w }) {
  assert.ok(b.x >= w.x && b.y >= w.y && b.x + b.width <= w.x + w.width + 1 && b.y + b.height <= w.y + w.height + 1, JSON.stringify({ b, w }));
}
(async () => {
  let { app, panel, pet } = await launch();
  try {
    await panel.evaluate(() => window.mori.act('companionSettings', { key: 'guideSeen', value: true }));
    await panel.evaluate(() => document.querySelector('#guide-dialog').close());
    await pet.evaluate(() => window.mori.windowAction('toggle'));
    await panel.locator('#character-toggle').click();
    await app.evaluate(({ ipcMain }) => { globalThis.desktopHits = []; ipcMain.on('hit-test', (_event, hit) => globalThis.desktopHits.push(hit)); });
    for (const [size, width, height] of [['small', 176, 152], ['medium', 220, 190], ['large', 264, 228]]) {
      await panel.locator('#pet-size').selectOption(size);
      await pet.waitForFunction(size => document.body.dataset.petSize === size, size);
      const metrics = await pet.evaluate(() => {
        const canvas = document.querySelector('#pet-sprite'), r = canvas.getBoundingClientRect();
        const context = canvas.getContext('2d');
        let solid;
        for (let y = 80; y < 240 && !solid; y += 4) for (let x = 100; x < 340; x += 4) if (context.getImageData(x, y, 1, 1).data[3] > 240) { solid = { x: r.x + (x + .5) / canvas.width * r.width, y: r.y + (y + .5) / canvas.height * r.height }; break; }
        return { width: r.width, height: r.height, font: getComputedStyle(document.querySelector('#pet-timer')).fontSize, solid };
      });
      assert.equal(metrics.width, width); assert.equal(metrics.height, height); assert.equal(metrics.font, '12px');
      inside(await geometry(app));
      // Browser pointer input confirms the real scaled silhouette remains interactive.
      await pet.mouse.move(1, 80);
      await pet.waitForTimeout(100);
      assert.equal(await app.evaluate(() => globalThis.desktopHits.at(-1)), false, 'transparent pixels pass clicks through');
      await pet.mouse.move(metrics.solid.x, metrics.solid.y);
      await pet.waitForTimeout(100);
      assert.equal(await app.evaluate(() => globalThis.desktopHits.at(-1)), true, 'scaled opaque pixels accept clicks');
      await panel.locator('#position-locked').check();
      const before = (await geometry(app)).bounds;
      await pet.mouse.down(); await pet.mouse.move(metrics.solid.x + 25, metrics.solid.y + 20, { steps: 4 }); await pet.mouse.up();
      assert.deepEqual((await geometry(app)).bounds, before);
      assert.notEqual(await pet.locator('#pet').getAttribute('data-pose'), 'held');
      await pet.evaluate(() => window.mori.windowAction('toggle'));
      await pet.evaluate(() => window.mori.windowAction('toggle'));
      await panel.locator('#position-locked').uncheck();
    }
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await panel.screenshot({ path: path.join(root, 'artifacts', 'desktop-controls.png') });
    // Exercise native drag IPC with controlled cursor positions, including outside the work area.
    await app.evaluate(({ screen }) => { globalThis.desktopCursorOriginal = screen.getCursorScreenPoint; screen.getCursorScreenPoint = () => globalThis.desktopCursor; globalThis.desktopCursor = { x: 400, y: 400 }; });
    try {
      await pet.evaluate(() => window.mori.drag('begin'));
      await pet.waitForTimeout(50);
      await app.evaluate(() => { globalThis.desktopCursor = { x: -20000, y: -20000 }; });
      await pet.evaluate(() => window.mori.drag('move'));
      await pet.waitForTimeout(50); inside(await geometry(app));
      await app.evaluate(() => { globalThis.desktopCursor = { x: 20000, y: 20000 }; });
      await pet.evaluate(() => window.mori.drag('move'));
      await pet.waitForTimeout(50); inside(await geometry(app));
      await pet.evaluate(() => window.mori.drag('end'));
    } finally { await app.evaluate(({ screen }) => { screen.getCursorScreenPoint = globalThis.desktopCursorOriginal; }); }
    await panel.locator('#position-locked').check();
    await panel.evaluate(() => window.mori.act('companionSettings', { key: 'presence', value: 'quiet' }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('pet.html')).setPosition(-20000, -20000));
    await panel.locator('#recover-pet').click();
    const recovered = await geometry(app); inside(recovered); assert.equal(recovered.visible, true);
    const state = await panel.evaluate(() => window.mori.getState());
    assert.equal(state.settings.presence, 'companion'); assert.equal(state.settings.positionLocked, true);
    await app.close();
    ({ app, panel, pet } = await launch());
    const restored = await panel.evaluate(() => window.mori.getState());
    assert.equal(restored.settings.petSize, 'large'); assert.equal(restored.settings.positionLocked, true);
    inside(await geometry(app));
    console.log('Desktop controls passed: all sizes, readable UI, lock, offscreen/quiet recovery, restart persistence.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
