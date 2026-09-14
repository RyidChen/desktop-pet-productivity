const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function panelPage(app) {
  await app.firstWindow();
  for (let i = 0; i < 100; i++) {
    const panel = app.windows().find(p => p.url().endsWith('panel.html'));
    if (panel) {
      await panel.waitForSelector('#start');
    await panel.evaluate(async () => { await window.mori.act('companionSettings', { key: 'guideSeen', value: true }); document.querySelector('#guide-dialog')?.close(); });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('panel.html')).show());
      return panel;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Panel did not load');
}
(async () => {
  const env = { ...process.env, MORI_DATA_DIR: path.join(root, '.test-data', `modes-${Date.now()}`) };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const options = process.env.SMOKE_PACKAGED ? { executablePath: path.join(root, 'dist', process.env.SMOKE_SIDE_BY_SIDE ? `Mori Focus ${require('../package.json').version}` : 'Mori Focus', 'Mori.exe'), args: [], env } : { args: [root], env };
  let app;
  try {
    app = await electron.launch(options);
    let panel = await panelPage(app);
    const errors = []; panel.on('pageerror', e => errors.push(e.message));
    await panel.locator('#sound-settings summary').click();
    // Shorten decoded test buffers so real native ended events run without waiting minutes.
    await panel.evaluate(async () => {
      await audio.prime();
      const shorten = buffer => {
        const result = audio.context.createBuffer(buffer.numberOfChannels, Math.round(buffer.sampleRate * 0.8), buffer.sampleRate);
        for (let c = 0; c < result.numberOfChannels; c++) result.copyToChannel(buffer.getChannelData(c).subarray(0, result.length), c);
        return result;
      };
      const compose = audio.compose.bind(audio); audio.compose = async () => shorten(await compose());
      const decode = audio.context.decodeAudioData.bind(audio.context); audio.context.decodeAudioData = async bytes => shorten(await decode(bytes));
    });
    await panel.locator('#rain-toggle').click();
    await panel.waitForFunction(() => Boolean(audio.rainNode));
    await panel.evaluate(() => { window.testBackgroundNode = audio.rainNode; });
    await panel.locator('#music-mode').selectOption('sequence');
    await panel.locator('#music-toggle').click();
    await panel.waitForFunction(() => document.querySelector('#music-source').value === 'cafe' && Boolean(audio.musicNode));
    await panel.locator('#music-mode').selectOption('repeat');
    await panel.evaluate(() => { window.testCurrentNode = audio.musicNode; });
    await panel.waitForTimeout(1200);
    assert.equal(await panel.evaluate(() => audio.musicNode === window.testCurrentNode && audio.musicNode.loop), true, 'mode switch preserves the playing node and repeat stays on it');
    await panel.locator('#music-source').selectOption('garden');
    await panel.waitForFunction(() => audio.trackSource === 'garden' && Boolean(audio.musicNode));
    await panel.locator('#music-mode').selectOption('sequence');
    await panel.waitForFunction(() => document.querySelector('#music-source').value === 'builtin' && Boolean(audio.musicNode));
    await panel.locator('#music-mode').selectOption('repeat');
    await panel.locator('#music-mode').selectOption('shuffle');
    await panel.waitForFunction(() => document.querySelector('#music-source').value !== 'builtin' && Boolean(audio.musicNode));
    await panel.locator('#music-mode').selectOption('repeat');
    assert.equal(await panel.evaluate(() => audio.rainNode === window.testBackgroundNode), true);
    await panel.locator('#music-mode').selectOption('sequence');
    await panel.locator('#finish-day').click();
    await panel.waitForTimeout(1400);
    assert.equal(await panel.evaluate(() => audio.musicNode), null);
    assert.equal(await panel.evaluate(() => audio.rainNode), null);
    assert.deepEqual(errors, []);
    await panel.locator('#sound-settings').screenshot({ path: path.join(root, 'artifacts', 'music-modes.png') });
    await app.close(); app = null;
    app = await electron.launch(options);
    panel = await panelPage(app);
    assert.equal(await panel.locator('#music-mode').inputValue(), 'sequence');
    assert.equal(await panel.locator('#music-toggle').getAttribute('aria-pressed'), 'false');
    fs.writeFileSync(path.join(root, 'artifacts', process.env.SMOKE_PACKAGED ? 'packaged-music-modes-results.json' : 'music-modes-results.json'), JSON.stringify({ passed: true, nativeEndedEvents: true, sequentialWrap: true, shuffleNoImmediateRepeat: true, repeatWithoutRestart: true, backgroundIndependent: true, finishStops: true, restoredPaused: true, errors }, null, 2));
    console.log('PASS: native music endings, sequence wrap, shuffle, repeat, mode switching, background independence, finish and restart.');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
