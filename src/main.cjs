const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, powerMonitor, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { FocusModel } = require('./model.cjs');
const { Store } = require('./store.cjs');

app.setName('Mori Focus');
if (process.env.MORI_DATA_DIR) app.setPath('userData', path.resolve(process.env.MORI_DATA_DIR));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let pet, panel, tray, model, store, dragStart, quitting = false, errorMessage = '', saveTimer;
let lastInteraction = 0;
const ui = name => path.join(__dirname, 'ui', name);
const send = (channel, payload) => {
  for (const win of [pet, panel]) if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};
const broadcast = () => {
  send('state', { ...model.snapshot(), errorMessage });
  if (tray && !tray.isDestroyed()) {
    const seconds = Math.ceil(model.timer.remaining / 1000);
    tray.setToolTip(`森日 Mori · ${model.timer.running ? model.timer.mode === 'focus' ? '專注中' : '休息中' : '已暫停'} ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
  }
};
function save() {
  try {
    store.save(model.snapshot());
    if (errorMessage.startsWith('資料未能儲存')) { errorMessage = ''; broadcast(); }
  } catch {
    errorMessage = '資料未能儲存，請確認磁碟空間與資料夾權限。';
    broadcast();
  }
}
function notice(text, chime = false, kind = '') {
  if (model.settings.presence === 'quiet' && kind !== 'finish') return;
  send('notice', { text, kind, chime: chime && model.settings.chime && model.settings.presence !== 'quiet' });
}
function advance() {
  const complete = model.tick();
  if (complete) {
    notice(model.timer.mode === 'break' ? '這一小段，我們完成了。休息一下吧。' : '休息好了，準備好再開始。', true, model.timer.mode === 'break' ? 'complete' : 'break');
    save();
  }
  return complete;
}
function clamp(bounds, work) {
  return {
    x: Math.round(Math.max(work.x, Math.min(bounds.x, work.x + work.width - bounds.width))),
    y: Math.round(Math.max(work.y, Math.min(bounds.y, work.y + work.height - bounds.height))),
  };
}
function placePanel() {
  const p = pet.getBounds();
  const work = screen.getDisplayMatching(p).workArea;
  const width = Math.min(380, work.width);
  const height = Math.min(760, work.height - 16);
  let x = p.x - width + 24;
  if (x < work.x) x = p.x + p.width - 24;
  const pos = clamp({ x, y: p.y + p.height - height, width, height }, work);
  panel.setBounds({ ...pos, width, height });
}
function showPanel() {
  if (model.settings.presence !== 'quiet') pet.showInactive();
  placePanel();
  panel.show();
  broadcast();
}
function togglePet() {
  if (model.settings.presence === 'quiet') { panel.isVisible() ? panel.hide() : showPanel(); return; }
  if (pet.isVisible()) { pet.hide(); panel.hide(); }
  else {
    pet.showInactive(); save(); broadcast();
  }
}
function constrainPet() {
  const bounds = pet.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  // Supplying dimensions prevents Windows fractional-DPI rounding from accumulating on each move.
  pet.setBounds({ ...clamp(bounds, work), width: 240, height: 230 });
  model.position = { x: pet.getBounds().x, y: pet.getBounds().y };
  placePanel();
}
function secureWindow(win, file) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.on('did-finish-load', () => broadcast());
  win.webContents.on('render-process-gone', () => {
    if (!quitting) {
      model.pause(); save();
      dialog.showErrorBox('森日需要重新啟動', '介面意外停止，計時已暫停並嘗試保存資料。請從系統匣結束後重新開啟。');
    }
  });
  win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  return win.loadFile(ui(file));
}

if (gotLock) app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  const loaded = store.load();
  model = new FocusModel(loaded.data);
  errorMessage = loaded.warning;
  const work = screen.getPrimaryDisplay().workArea;
  const initial = model.position || { x: work.x + work.width - 280, y: work.y + work.height - 248 };
  const common = { frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } };
  pet = new BrowserWindow({ ...common, ...initial, width: 240, height: 230, title: '森日 · 桌寵', hasShadow: false });
  panel = new BrowserWindow({ ...common, alwaysOnTop: model.settings.panelPinned, width: 380, height: 760, title: '森日 · 專注小屋', hasShadow: false });

  function authorized(event, role) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const expected = win === pet ? 'pet' : win === panel ? 'panel' : null;
    if (!expected || (role && role !== expected) || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(ui(`${expected}.html`)).href) throw new Error('無法處理這項操作。');
  }
  ipcMain.handle('get-state', event => { authorized(event); advance(); return { ...model.snapshot(), errorMessage }; });
  ipcMain.on('outfit-status', (event, result) => {
    try {
      authorized(event, 'pet');
      if (!result || !['classic', 'cozy', 'outing'].includes(result.actual) || result.requested !== model.settings.outfit || typeof result.ok !== 'boolean') return;
      if (!result.ok) { model.settings.outfit = result.actual; save(); broadcast(); }
      send('outfit-status', { ok: result.ok, outfit: result.actual });
    } catch { /* Ignore untrusted renderer messages. */ }
  });
  ipcMain.handle('act', (event, action, payload) => {
    try {
      authorized(event, 'panel');
      advance();
      if (action === 'petInteract') {
        const interactions = { snack: '小點心時間，謝謝你。', play: '來陪我玩一下吧！', rest: '我瞇一下，你也記得休息。' };
        if (!Object.hasOwn(interactions, payload)) throw new Error('互動選項無效。');
        if (model.settings.presence === 'quiet') throw new Error('先切回陪伴模式，再找森森玩。');
        if (Date.now() - lastInteraction < 3000) throw new Error('讓森森回應完，再玩一次吧。');
        lastInteraction = Date.now();
        notice(interactions[payload], false, `interact-${payload}`);
        return { ok: true };
      }
      model.dispatch(action, payload);
      if (action === 'companionSettings') {
        panel.setAlwaysOnTop(model.settings.panelPinned);
        if (payload.key === 'presence') model.settings.presence === 'quiet' ? pet.hide() : pet.showInactive();
      }
      save(); broadcast();
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('window-action', (event, action) => {
    authorized(event);
    if (action === 'timer-toggle') {
      authorized(event, 'pet');
      if (!advance()) model.dispatch(model.timer.running ? 'pause' : 'start');
      save(); broadcast();
    }
    else if (action === 'toggle') panel.isVisible() ? panel.hide() : showPanel();
    else if (action === 'collapse') panel.hide();
    else if (action === 'hide') togglePet();
    else if (action === 'finish') {
      authorized(event, 'panel');
      advance(); model.pause(); save(); broadcast();
      const s = model.snapshot(), day = s.days[s.today];
      notice(day?.ms > 0 ? `今天一起專注了 ${day.ms < 60000 ? '不到 1' : Math.floor(day.ms / 60000)} 分鐘。先到這裡，剩下的下次慢慢來。` : '今天先到這裡。下次見，我會在這裡。', false, 'finish');
    }
    else throw new Error('不支援這項視窗操作。');
  });
  ipcMain.on('hit-test', (event, hit) => {
    try { authorized(event, 'pet'); if (!dragStart && typeof hit === 'boolean') pet.setIgnoreMouseEvents(!hit, { forward: true }); } catch { /* Ignore untrusted window messages. */ }
  });
  ipcMain.on('drag', (event, phase) => {
    try {
      authorized(event, 'pet');
      if (phase === 'begin') {
        dragStart = { cursor: screen.getCursorScreenPoint(), bounds: pet.getBounds() };
        pet.setIgnoreMouseEvents(false);
      } else if (phase === 'move' && dragStart) {
        const cursor = screen.getCursorScreenPoint();
        pet.setBounds({ x: dragStart.bounds.x + cursor.x - dragStart.cursor.x, y: dragStart.bounds.y + cursor.y - dragStart.cursor.y, width: 240, height: 230 });
        if (panel.isVisible()) placePanel();
      } else if (phase === 'end' && dragStart) {
        dragStart = null;
        constrainPet(); save();
        const cursor = screen.getCursorScreenPoint(), bounds = pet.getBounds();
        pet.webContents.send('hit-refresh', { x: cursor.x - bounds.x, y: cursor.y - bounds.y });
      }
    } catch { /* Invalid drag messages have no side effects. */ }
  });
  ipcMain.handle('choose-music', async event => {
    authorized(event, 'panel');
    const result = await dialog.showOpenDialog(panel, { title: '選一首陪你專注的音樂', properties: ['openFile'], filters: [{ name: '音樂', extensions: ['mp3', 'wav'] }] });
    if (!result.canceled && result.filePaths.length) {
      model.settings.musicPath = result.filePaths[0];
      model.settings.musicSource = 'local';
      save(); broadcast();
    }
    return { canceled: result.canceled };
  });
  ipcMain.handle('read-music', async event => {
    authorized(event, 'panel');
    try {
      const file = model.settings.musicPath;
      if (!file || !['.mp3', '.wav'].includes(path.extname(file).toLowerCase())) throw new Error('請先選擇 MP3 或 WAV 音樂。');
      const handle = await fs.promises.open(file, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new Error('請選擇小於 100 MB 的音樂檔。');
        return { ok: true, data: new Uint8Array(await handle.readFile()) };
      } finally { await handle.close(); }
    } catch (error) { return { ok: false, error: error.code === 'ENOENT' ? '找不到這首音樂，請重新匯入。' : error.message }; }
  });
  await Promise.all([secureWindow(pet, 'pet.html'), secureWindow(panel, 'panel.html')]);
  constrainPet();
  // An opaque icon generated locally avoids extra image/runtime dependencies.
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const cat = ((x - 16) ** 2 / 130 + (y - 18) ** 2 / 110 < 1) || (y >= 3 && y < 13 && ((x >= 5 && x < 12 && x - 5 < y - 2) || (x > 20 && x <= 27 && 27 - x < y - 2)));
    const eye = y >= 15 && y <= 18 && (x === 11 || x === 21);
    const i = (y * 32 + x) * 4;
    pixels[i] = eye ? 48 : 143; pixels[i + 1] = eye ? 62 : 164; pixels[i + 2] = eye ? 44 : 141; pixels[i + 3] = cat ? 255 : 0;
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 32, height: 32 });
  pet.setIcon(icon); panel.setIcon(icon);
  tray = new Tray(icon);
  tray.setToolTip('森日 Mori · 桌面上的專注夥伴');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '開啟專注小屋', click: showPanel },
    { label: '顯示／隱藏森森（Ctrl+Alt+M）', click: togglePet },
    { type: 'separator' }, { label: '結束森日', click: () => app.quit() },
  ]));
  tray.on('click', showPanel);
  if (model.settings.presence !== 'quiet') pet.showInactive();
  if (!globalShortcut.register('Control+Alt+M', togglePet)) notice('快捷鍵已被其他程式使用，可從系統匣顯示／隱藏森森。');
  pet.setIgnoreMouseEvents(true, { forward: true });
  setInterval(() => { advance(); broadcast(); }, 250);
  saveTimer = setInterval(save, 15000);
  powerMonitor.on('suspend', () => { advance(); model.pause(); save(); broadcast(); });
  powerMonitor.on('resume', () => { notice('歡迎回來，準備好再繼續。'); broadcast(); });
  screen.on('display-metrics-changed', constrainPet);
  screen.on('display-removed', constrainPet);
  app.on('second-instance', showPanel);
}).catch(error => { dialog.showErrorBox('森日無法啟動', error.message); app.quit(); });

app.on('before-quit', () => {
  quitting = true;
  globalShortcut.unregisterAll();
  clearInterval(saveTimer);
  if (model) { model.pause(); save(); }
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
