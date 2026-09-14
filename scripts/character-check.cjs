const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const dataDir = path.join(root, '.test-data', `character-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { ...process.env, MORI_DATA_DIR: dataDir };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];
  const app = await electron.launch(process.env.SMOKE_PACKAGED ? { executablePath: path.join(root, 'dist', 'Mori Focus', 'Mori.exe'), args: [], env } : { args: [root], env });
  const errors = []; app.on('window', p => p.on('pageerror', e => errors.push(e.message)));
  try {
    await app.firstWindow();
    let panel, pet;
    for (let n=0; n<100 && (!panel || !pet); n++) {
      panel = app.windows().find(p => p.url().endsWith('panel.html'));
      pet = app.windows().find(p => p.url().endsWith('pet.html'));
      if (!panel || !pet) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(panel && pet);
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.ready === 'true');
    assert.equal(await pet.locator('#pet').getAttribute('data-idle-ready'), 'true');
    await panel.waitForSelector('#character-toggle');
    await panel.evaluate(async () => { await window.mori.act('companionSettings', { key: 'guideSeen', value: true }); document.querySelector('#guide-dialog')?.close(); });
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().forEach(w => w.show()));
    await panel.locator('#character-toggle').click();
    assert.equal(await panel.locator('#character-dialog').evaluate(d => d.open), true);
    for (const outfit of ['cozy', 'outing', 'classic', 'outing']) {
      await panel.locator('#outfit').selectOption(outfit);
      await pet.waitForFunction(o => document.querySelector('#pet').dataset.outfit === o && document.querySelector('#pet').dataset.outfitLoading === 'false', outfit);
      assert.equal(await panel.evaluate(async () => (await window.mori.getState()).settings.outfit), outfit);
    }
    await panel.screenshot({path:path.join(root,'artifacts','character-dialog.png')});
    await panel.locator('[data-pet-interaction=snack]').click();
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.pose === 'snack');
    assert.equal(await panel.locator('[data-pet-interaction=play]').isDisabled(), true);
    await pet.screenshot({path:path.join(root,'artifacts','character-snack.png')});
    await panel.waitForFunction(() => !document.querySelector('[data-pet-interaction=play]').disabled);
    await panel.locator('[data-pet-interaction=play]').click();
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.pose === 'curious');
    await panel.waitForFunction(() => !document.querySelector('[data-pet-interaction=rest]').disabled);
    await panel.locator('[data-pet-interaction=rest]').click();
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.pose === 'sleep');
    await panel.keyboard.press('Escape');
    assert.equal(await panel.locator('#character-dialog').evaluate(d => d.open), false);
    await panel.evaluate(() => window.mori.act('start'));
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.pose.startsWith('read'), null, {timeout:12000});
    await panel.evaluate(() => window.mori.act('petInteract', 'snack'));
    await pet.waitForFunction(() => document.querySelector('#pet').dataset.pose === 'readHappy');
    assert.equal(await panel.evaluate(async () => (await window.mori.getState()).timer.running), true);
    await panel.evaluate(() => window.mori.act('companionSettings', {key:'presence',value:'quiet'}));
    assert.equal(await panel.locator('[data-pet-interaction=snack]').isDisabled(), true);
    assert.equal(await panel.evaluate(async () => (await window.mori.act('petInteract','snack')).ok), false);
    const gallery = await pet.evaluate(async () => {
      const {PetSprite} = await import('./pet-sprite.mjs');
      const canvas = document.createElement('canvas'); canvas.width=440; canvas.height=380;
      const sprite = new PetSprite(canvas); await sprite.load('assets/mori-catgirl-atlas.png'); await sprite.loadReading('assets/mori-reading-atlas.png'); await sprite.loadIdle('assets/mori-idle-atlas.png');
      const out = document.createElement('canvas'); out.width=660; out.height=430;
      const ctx=out.getContext('2d'); ctx.fillStyle='#f5f1e8';ctx.fillRect(0,0,660,430);
      for (const [i, outfit] of ['classic','cozy','outing'].entries()) {
        await sprite.setOutfit(outfit);
        sprite.draw('idle',1000,{reducedMotion:true}); ctx.drawImage(canvas,i*220,30,220,190);
        sprite.draw('read',1000,{reducedMotion:true}); ctx.drawImage(canvas,i*220,220,220,190);
        ctx.fillStyle='#344737';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText(['經典森綠服','奶油居家服','午後外出服'][i],i*220+110,25);
      }
      const before=sprite.frames; sprite.loadSheet=async()=>{throw new Error('simulated missing asset');}; sprite.outfits.delete('cozy');
      try {await sprite.setOutfit('cozy');throw new Error('expected failure');} catch(e) {if(e.message!=='simulated missing asset')throw e;}
      if(sprite.frames!==before || sprite.outfit!=='outing')throw new Error('failure changed displayed outfit');
      return out.toDataURL().split(',')[1];
    });
    fs.writeFileSync(path.join(root,'artifacts','character-wardrobe.png'),Buffer.from(gallery,'base64'));
    assert.deepEqual(errors,[]);
    console.log('PASS: all outfits, idle assets, snack/play/rest, cooldown, dialog Escape, focus continuity, quiet mode, asset failure fallback and visual gallery.');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
