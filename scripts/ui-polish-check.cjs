const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

(async () => {
  const dataDir = path.join(root, '.test-data', `ui-polish-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const longMusicName = '適合長時間閱讀與專注的午後咖啡館背景音樂_完整版本_2026.wav';
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ settings: { musicSource: 'cafe', musicPath: path.join(dataDir, longMusicName) }, days: {
    '2026-09-01': { ms: 15000000, rounds: 10 },
    '2026-09-02': { ms: 60000, rounds: 0 },
    '2026-09-03': { ms: 60000, rounds: 0 },
  } }));
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const env = { ...process.env, MORI_DATA_DIR: dataDir };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const app = await electron.launch(process.env.SMOKE_PACKAGED ? { executablePath: path.join(root, 'dist', process.env.SMOKE_SIDE_BY_SIDE ? `Mori Focus ${require('../package.json').version}` : 'Mori Focus', 'Mori.exe'), args: [], env } : { args: [root], env });
  try {
    await app.firstWindow();
    let panel;
    for (let i = 0; i < 100 && !panel; i++) {
      panel = app.windows().find(p => p.url().endsWith('panel.html'));
      if (!panel) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(panel, 'panel window loads');
    await panel.waitForSelector('#start');
    await panel.evaluate(async () => { await window.mori.act('companionSettings', { key: 'guideSeen', value: true }); document.querySelector('#guide-dialog')?.close(); });
    await app.evaluate(({ BrowserWindow }) => {
      const panel = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('panel.html'));
      panel.setBounds({ x: 200, y: 50, width: 380, height: 760 }); panel.show();
    });
    assert.equal(await panel.locator('#music-source').inputValue(), 'cafe', 'packaged track selection restores without an imported file');
    assert.equal(await panel.locator('#music-title').textContent(), '貓咪咖啡館');
    await panel.locator('#toast').waitFor({ state: 'hidden', timeout: 10000 });
    const errors = []; panel.on('pageerror', error => errors.push(error.message));
    await panel.evaluate(async () => {
      for (let i = 1; i <= 6; i++) await window.mori.act('addTask', `小事 ${i}`);
      const s = await window.mori.getState();
      await window.mori.act('selectTask', s.tasks[5].id);
    });
    await panel.waitForFunction(() => document.querySelectorAll('.task-row').length === 3);
    assert.equal(await panel.locator('.task-title[aria-pressed=true]').textContent(), '小事 6');
    assert.equal(await panel.locator('#memory-book').getAttribute('open'), null);
    assert.equal(await panel.locator('#memory-latest').textContent(), '熟悉的角落 · 09/03', 'latest memory follows earned date, not milestone type order');
    assert.equal(await panel.locator('#presence-help').isVisible(), false);
    const layout = await panel.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
      return { start: rect('#start'), tasks: rect('#task-list'), finish: rect('#finish-day'), content: rect('.panel-content'), footer: rect('.panel-footer'), height: innerHeight, scroll: document.querySelector('.panel-content').scrollTop, listOverflow: getComputedStyle(document.querySelector('#task-list')).overflowY };
    });
    assert.equal(layout.scroll, 0);
    assert.ok(layout.start.top >= layout.content.top && layout.tasks.bottom <= layout.content.bottom, JSON.stringify(layout));
    assert.ok(layout.finish.bottom < layout.height);
    assert.equal(layout.listOverflow, 'visible');
    await panel.screenshot({ path: path.join(root, 'artifacts', 'ui-polish-default.png') });
    await panel.locator('#tasks-toggle').click();
    assert.equal(await panel.locator('.task-row').count(), 6);
    await panel.locator('#memory-leaf').click();
    await panel.locator('#sound-settings summary').click();
    assert.equal(await panel.locator('#memory-book').getAttribute('open'), '');
    assert.ok((await panel.locator('#music-volume').boundingBox()).height >= 24);
    assert.equal((await panel.locator('.panel-footer').boundingBox()).y, layout.footer.top);
    await panel.screenshot({ path: path.join(root, 'artifacts', 'ui-polish-expanded.png') });
    await panel.locator('#sound-settings').scrollIntoViewIfNeeded();
    await panel.locator('#music-source').selectOption('seaside');
    const selectorWidths = await panel.evaluate(() => {
      const select = document.querySelector('#music-source');
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      ctx.font = getComputedStyle(select).font;
      return { width: select.clientWidth, text: ctx.measureText(select.selectedOptions[0].textContent).width };
    });
    assert.ok(selectorWidths.width >= selectorWidths.text + 36, 'longest built-in title has room for padding and dropdown arrow');
    await panel.locator('#sound-settings').screenshot({ path: path.join(root, 'artifacts', 'audio-selector-wide.png') });
    await panel.locator('#music-source').selectOption('local');
    await panel.waitForFunction(() => !document.querySelector('#music-title').hidden);
    assert.equal(await panel.locator('#music-title').textContent(), longMusicName);
    assert.ok(await panel.locator('#music-title').evaluate(el => el.scrollWidth <= el.clientWidth && el.clientHeight > 20), 'long filename wraps without horizontal clipping');
    await panel.locator('#sound-settings').screenshot({ path: path.join(root, 'artifacts', 'audio-selector-long-name.png') });
    await panel.locator('#music-source').selectOption('cafe');
    await panel.locator('#tasks-toggle').click();
    await panel.locator('.task-delete').first().focus();
    await panel.keyboard.press('Enter');
    await panel.waitForFunction(() => !document.querySelector('#undo-delete-bar').hidden);
    assert.notEqual(await panel.evaluate(() => document.activeElement.tagName), 'BODY');
    await panel.locator('#undo-delete').click();
    await panel.waitForFunction(() => document.querySelector('#undo-delete-bar').hidden);
    assert.equal((await panel.evaluate(() => window.mori.getState())).tasks.length, 6);
    await panel.locator('.task-check').first().click();
    await panel.waitForFunction(() => !document.querySelector('.task-title[aria-pressed=true]'));
    await panel.locator('#finish-day').click();
    assert.equal(await panel.locator('#day-review').isVisible(), true);
    const review = await panel.locator('#day-review').boundingBox();
    assert.ok(review.y + review.height <= 760);
    await panel.locator('#presence').selectOption('quiet');
    assert.equal(await panel.locator('#presence-help').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: compact layout, single scroll, current-task preview, memory disclosure, volume target, undo focus, completion selection and fixed review.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
