const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.test-data', `usability-${Date.now()}`);
const env = { ...process.env, MORI_DATA_DIR: dataDir };
for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
const launch = () => electron.launch(process.env.SMOKE_PACKAGED
  ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env }
  : { args: [root], env });
async function page(app, name) {
  for (let i = 0; i < 100; i++) {
    const result = app.windows().find(p => p.url().endsWith(name));
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Missing ${name}`);
}
(async () => {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  let app = await launch();
  const errors = [];
  try {
    const panel = await page(app, 'panel.html'), pet = await page(app, 'pet.html');
    panel.on('pageerror', e => errors.push(e.message)); pet.on('pageerror', e => errors.push(e.message));
    await panel.waitForSelector('#guide-dialog[open]');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('panel.html')).show());
    await panel.screenshot({ path: path.join(root, 'artifacts', 'usability-guide.png') });
    await panel.locator('#guide-done').click();
    await panel.waitForSelector('#guide-dialog[open]', { state: 'hidden' });
    assert.equal((await panel.evaluate(() => window.mori.getState())).settings.guideSeen, true);
    assert.equal(await panel.locator('#presence option[value=quiet]').textContent(), '隱藏角色與提醒');
    await panel.locator('#task-input').fill('整理筆記'); await panel.locator('#task-input').press('Enter');
    await panel.locator('.task-title').click();
    await panel.locator('.task-edit').click();
    await panel.locator('#edit-task-input').fill('整理今天的筆記');
    await panel.locator('#edit-task-input').press('Enter');
    await panel.waitForFunction(() => document.querySelector('.task-title').textContent === '整理今天的筆記');
    assert.equal(await panel.locator('.task-title').getAttribute('aria-pressed'), 'true');
    await panel.locator('#quick-start').click();
    await pet.waitForSelector('#pet-timer:not([hidden])');
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.ready === 'true');
    const timerBounds = await pet.locator('#pet-timer').boundingBox();
    const characterBounds = await pet.locator('#pet').boundingBox();
    assert.ok(timerBounds.y + timerBounds.height <= characterBounds.y - 4, 'timer must stay above the entire character area');
    await pet.mouse.move(120, 140);
    await pet.waitForTimeout(450);
    assert.equal(await pet.locator('#bubble').isVisible(), false, 'hover must not show a duplicate countdown');
    await panel.evaluate(() => window.mori.act('petInteract', 'snack'));
    await pet.waitForSelector('#bubble:not([hidden])');
    assert.equal(await pet.locator('#pet-timer').isVisible(), false, 'speech and timer share one space without overlap');
    await pet.waitForSelector('#pet-timer:not([hidden])');
    await pet.locator('#pet-timer-toggle').click();
    await panel.waitForFunction(async () => !(await window.mori.getState()).timer.running);
    const before = await panel.evaluate(() => window.mori.getState());
    await panel.locator('#mode-break').click();
    await panel.locator('#undo-timer').click();
    const restored = await panel.evaluate(() => window.mori.getState());
    assert.equal(restored.timer.remaining, before.timer.remaining);
    assert.equal(restored.timer.mode, 'focus'); assert.equal(restored.timer.running, false);
    await pet.locator('#pet-timer-toggle').click();
    await panel.waitForFunction(async () => (await window.mori.getState()).timer.running);
    await panel.locator('#presence').selectOption('focus');
    assert.equal(await pet.locator('#pet-timer').isVisible(), true);
    await pet.screenshot({ path: path.join(root, 'artifacts', 'usability-pet.png') });
    await panel.locator('#start').click();
    await panel.locator('#character-toggle').click();
    await panel.locator('[data-outfit=cozy]').click();
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.outfit === 'cozy');
    assert.equal(await panel.locator('[data-outfit=cozy]').getAttribute('aria-pressed'), 'true');
    await panel.waitForFunction(() => document.querySelector('#character-feedback').textContent.includes('換好'));
    await panel.locator('[data-outfit=cozy]').click();
    assert.ok(!await panel.locator('#character-feedback').textContent().then(text => text.includes('換衣服中')));
    await panel.screenshot({ path: path.join(root, 'artifacts', 'usability-wardrobe.png') });
    await panel.keyboard.press('Escape');
    assert.equal(await panel.locator('#character-dialog').isVisible(), false);
    // Keep enough overflow even after temporary notices disappear during bubble checks.
    for (let i = 0; i < 14; i++) await panel.evaluate(i => window.mori.act('addTask', `小事 ${i}`), i);
    await panel.locator('#tasks-toggle').click();
    await panel.evaluate(() => document.querySelector('.panel-content').scrollTop = 230);
    await panel.waitForSelector('#compact-timer:not([hidden])');
    await panel.locator('#compact-toggle').click();
    assert.equal((await panel.evaluate(() => window.mori.getState())).timer.running, true);
    await panel.screenshot({ path: path.join(root, 'artifacts', 'usability-expanded.png') });
    await panel.locator('#guide-toggle').click();
    await panel.locator('#mini-timer-setting').uncheck();
    assert.equal(await pet.locator('#pet-timer').isVisible(), false);
    await panel.keyboard.press('Escape');
    await app.close(); app = await launch();
    const reopened = await page(app, 'panel.html');
    await reopened.waitForSelector('#start');
    await reopened.waitForFunction(async () => (await window.mori.getState()).settings.guideSeen);
    assert.equal(await reopened.locator('#guide-dialog').isVisible(), false);
    assert.equal((await reopened.evaluate(() => window.mori.getState())).settings.miniTimer, false);
    assert.deepEqual(errors, []);
    console.log('PASS: first-use guide, edit, timer undo, desktop pause/resume, quiet focus countdown, preview outfit, sticky timer, restart preferences.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
