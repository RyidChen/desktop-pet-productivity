const $ = selector => document.querySelector(selector);
const audio = new MoriAudio();
let state, taskSignature = '', memorySignature = '', toastTimeout, undoTimeout, undoExpiresAt, showAllTasks = false;
let interactionUntil = 0;
let editingTaskId, editOpener, timerUndoTimeout, timerUndoExpiry = 0;
const guideButton = document.createElement('button');
guideButton.id = 'guide-toggle'; guideButton.className = 'text-button'; guideButton.textContent = '使用說明';
guideButton.addEventListener('click', () => $('#guide-dialog').showModal());
const characterButton = document.createElement('button');
characterButton.id = 'character-toggle'; characterButton.className = 'icon-button';
characterButton.title = '森森衣櫥與互動'; characterButton.setAttribute('aria-label', characterButton.title);
characterButton.append(icon('shirt'));
const headerActions = document.createElement('div'); headerActions.className = 'header-actions';
$('#collapse').before(headerActions); headerActions.append(characterButton, $('#collapse'));
headerActions.prepend(guideButton);
async function dismissGuide() {
  if (await act('companionSettings', { key: 'guideSeen', value: true })) $('#guide-dialog').close();
}
$('#guide-close').addEventListener('click', dismissGuide);
$('#guide-done').addEventListener('click', dismissGuide);
$('#guide-dialog').addEventListener('cancel', event => { event.preventDefault(); dismissGuide(); });
$('#mini-timer-setting').addEventListener('change', async () => {
  if (!await act('companionSettings', { key: 'miniTimer', value: $('#mini-timer-setting').checked })) $('#mini-timer-setting').checked = state.settings.miniTimer;
});
for (const button of document.querySelectorAll('[data-outfit]')) button.addEventListener('click', () => {
  $('#outfit').value = button.dataset.outfit; $('#outfit').dispatchEvent(new Event('change'));
});
$('#edit-task-cancel').addEventListener('click', () => $('#edit-task-dialog').close());
$('#edit-task-dialog').addEventListener('close', () => {
  const row = [...$('#task-list').children].find(item => item.dataset.taskId === editingTaskId);
  (row?.querySelector('.task-edit') || editOpener?.isConnected && editOpener || $('#task-input')).focus();
});
$('#edit-task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await act('editTask', { id: editingTaskId, title: $('#edit-task-input').value })) $('#edit-task-dialog').close();
  else { $('#edit-task-error').textContent = $('#error').textContent; $('#edit-task-error').hidden = false; }
});
characterButton.addEventListener('click', () => { $('#character-dialog').showModal(); $('#outfit').focus(); });
$('#character-close').addEventListener('click', () => $('#character-dialog').close());
$('#outfit').addEventListener('change', async () => {
  if ($('#outfit').value === state?.settings.outfit) return;
  $('#character-feedback').textContent = '換衣服中…';
  if (!await act('companionSettings', { key: 'outfit', value: $('#outfit').value })) {
    $('#outfit').value = state.settings.outfit; $('#character-feedback').textContent = '暫時無法換裝，請再試一次。';
  }
});
window.mori.onOutfitStatus(result => {
  $('#character-feedback').textContent = result.ok ? '換好衣服了，今天也一起慢慢來。' : '這套衣服暫時讀取不到，已保留原來的服裝。';
});
function interactionButtons() {
  for (const button of document.querySelectorAll('[data-pet-interaction]')) button.disabled = state?.settings.presence === 'quiet' || Date.now() < interactionUntil;
}
for (const button of document.querySelectorAll('[data-pet-interaction]')) button.addEventListener('click', async () => {
  interactionUntil = Date.now() + 3100; interactionButtons();
  if (await act('petInteract', button.dataset.petInteraction)) $('#character-feedback').textContent = '看看桌邊的森森，正在回應你。';
  else $('#character-feedback').textContent = '森森暫時無法回應，請稍後再試。';
  setTimeout(interactionButtons, 3100);
});
function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
async function act(action, payload) {
  try {
    const result = await window.mori.act(action, payload);
    if (!result.ok) { error(result.error); return false; }
    error(state?.errorMessage || ''); return true;
  } catch { error('操作暫時無法完成，請稍後再試。'); return false; }
}
function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('icon'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; }
function renderTasks(s) {
  const signature = JSON.stringify([s.tasks, s.selectedTask, showAllTasks]);
  if (signature === taskSignature) return;
  taskSignature = signature;
  const list = $('#task-list');
  const focused = list.contains(document.activeElement) ? { id: document.activeElement.closest('li').dataset.taskId, control: document.activeElement.className } : null;
  const unfinished = s.tasks.filter(t => !t.done);
  const selected = unfinished.find(t => t.id === s.selectedTask);
  const preview = selected ? [selected, ...unfinished.filter(t => t !== selected)].slice(0, 3) : unfinished.slice(0, 3);
  const visible = showAllTasks ? s.tasks : preview;
  list.replaceChildren();
  for (const task of visible) {
    const row = document.createElement('li'); row.className = `task-row${task.done ? ' done' : ''}`;
    row.dataset.taskId = task.id;
    const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = task.done; check.setAttribute('aria-label', `完成：${task.title}`); check.addEventListener('change', () => act('toggleTask', task.id));
    const title = document.createElement('button'); title.className = 'task-title'; title.textContent = task.title; title.title = `專注於：${task.title}`; title.setAttribute('aria-pressed', String(task.id === s.selectedTask)); title.addEventListener('click', () => act('selectTask', state.selectedTask === task.id ? null : task.id));
    title.disabled = task.done; if (task.done) title.title = '已完成';
    const remove = document.createElement('button'); remove.className = 'icon-button task-delete'; remove.setAttribute('aria-label', `刪除：${task.title}`); remove.title = '刪除待辦'; remove.append(icon('trash')); remove.addEventListener('click', () => act('deleteTask', task.id));
    const edit = document.createElement('button'); edit.className = 'icon-button task-edit'; edit.title = '修改待辦'; edit.setAttribute('aria-label', `修改：${task.title}`); edit.append(icon('edit'));
    edit.addEventListener('click', () => {
      editingTaskId = task.id; editOpener = edit; $('#edit-task-input').value = task.title; $('#edit-task-error').hidden = true;
      $('#edit-task-dialog').showModal(); $('#edit-task-input').focus(); $('#edit-task-input').select();
    });
    row.append(check, title, edit, remove); list.append(row);
  }
  $('#task-count').textContent = `${s.tasks.filter(t => t.done).length} / ${s.tasks.length}`;
  $('#empty-tasks').hidden = visible.length > 0;
  $('#empty-tasks').textContent = s.tasks.length ? '今天的小事都完成了，慢慢來就好。' : '把腦袋裡的小事，輕輕放在這裡。';
  $('#tasks-toggle').hidden = s.tasks.length <= preview.length && !showAllTasks;
  $('#tasks-toggle').textContent = showAllTasks ? '收起' : `查看全部（${s.tasks.length}）`;
  $('#tasks-toggle').setAttribute('aria-expanded', String(showAllTasks));
  if (focused) {
    const row = [...list.children].find(item => item.dataset.taskId === focused.id);
    const target = row?.querySelector(`.${focused.control.trim().split(/\s+/).join('.')}`);
    (target && !target.disabled ? target : list.querySelector('.task-check') || $('#task-input')).focus({ preventScroll: true });
  }
}
function renderUndo(s) {
  const expiresAt = s.undoDelete?.expiresAt || 0;
  if (expiresAt === undoExpiresAt) return;
  undoExpiresAt = expiresAt; clearTimeout(undoTimeout);
  const bar = $('#undo-delete-bar');
  const hide = () => { if (bar.contains(document.activeElement)) $('#task-input').focus({ preventScroll: true }); bar.hidden = true; };
  if (expiresAt <= Date.now()) { hide(); return; }
  $('#undo-delete-message').textContent = `已刪除「${s.undoDelete.title}」`;
  bar.hidden = false;
  undoTimeout = setTimeout(hide, expiresAt - Date.now());
}
function render(s) {
  const first = !state;
  const priorError = state?.errorMessage;
  state = s;
  $('#mini-timer-setting').checked = s.settings.miniTimer;
  if (first && !s.settings.guideSeen) $('#guide-dialog').showModal();
  for (const button of document.querySelectorAll('[data-outfit]')) button.setAttribute('aria-pressed', String(button.dataset.outfit === s.settings.outfit));
  if (timerUndoExpiry !== (s.undoTimer?.expiresAt || 0)) {
    timerUndoExpiry = s.undoTimer?.expiresAt || 0; clearTimeout(timerUndoTimeout);
    const hide = () => { if ($('#undo-timer-bar').contains(document.activeElement)) $('#start').focus(); $('#undo-timer-bar').hidden = true; };
    if (timerUndoExpiry > Date.now()) { $('#undo-timer-bar').hidden = false; timerUndoTimeout = setTimeout(hide, timerUndoExpiry - Date.now()); }
    else hide();
  }
  $('#outfit').value = s.settings.outfit;
  interactionButtons();
  const timer = s.timer, focus = timer.mode === 'focus';
  const seconds = Math.ceil(timer.remaining / 1000);
  $('#time').replaceChildren(document.createTextNode(String(Math.floor(seconds / 60)).padStart(2, '0')), Object.assign(document.createElement('span'), { textContent: ':' }), document.createTextNode(String(seconds % 60).padStart(2, '0')));
  $('#mode-focus').setAttribute('aria-pressed', String(focus)); $('#mode-break').setAttribute('aria-pressed', String(!focus));
  $('#start span').textContent = timer.running ? '暫停一下' : timer.remaining < timer.duration ? '繼續這一刻' : focus ? '開始專注' : '開始休息';
  $('#compact-time').textContent = `${timer.running ? focus ? '專注中' : '休息中' : timer.remaining < timer.duration ? '已暫停' : focus ? '準備專注' : '準備休息'} · ${$('#time').textContent}`;
  $('#compact-toggle').textContent = $('#start span').textContent;
  $('#quick-start').hidden = !focus || timer.running || timer.remaining < timer.duration;
  $('#start use').setAttribute('href', timer.running ? '#i-pause' : '#i-play');
  $('#timer-eyebrow').textContent = timer.running ? focus ? '世界先安靜，只做眼前這件事' : '深呼吸，讓思緒慢下來' : focus ? '一小步，也是在前進' : '休息，也是前進的一部分';
  const selected = s.tasks.find(t => t.id === s.selectedTask);
  $('#current-task').textContent = selected ? selected.title : '留白，也可以是今天的開始';
  $('#current-task').title = selected?.title || '';
  $('#companion-status').textContent = timer.running ? focus ? '森森正陪你一起讀書' : '森森正伸著懶腰' : '森森在這裡陪你';
  const progress = Math.max(0, Math.min(100, 100 * (1 - timer.remaining / timer.duration)));
  $('#progress-fill').style.width = `${progress}%`;
  $('.timer-progress').setAttribute('aria-valuenow', String(Math.round(progress)));
  $('#duration-toggle').disabled = timer.running;
  if (timer.running) { $('#duration-form').hidden = true; $('#duration-toggle').setAttribute('aria-expanded', 'false'); }
  if ($('#duration-form').hidden || first) { $('#focus-duration').value = s.settings.focus; $('#break-duration').value = s.settings.break; }
  const today = s.days[s.today] || { ms: 0, rounds: 0 };
  $('#minutes').textContent = String(Math.floor(today.ms / 60000)); $('#rounds').textContent = String(today.rounds);
  $('#presence').value = s.settings.presence;
  $('#pin-panel').setAttribute('aria-pressed', String(s.settings.panelPinned));
  $('#pin-panel').textContent = s.settings.panelPinned ? '已釘選' : '釘選';
  $('#presence-help').textContent = { companion: '氣泡會自動收起，滑到森森身上可查看時間。', focus: '安靜陪讀，只在完成一輪時提醒你。', quiet: '森森已隱藏，提示已靜音；計時與音樂繼續。' }[s.settings.presence];
  $('#presence-help').hidden = s.settings.presence !== 'quiet';
  if (s.settings.presence === 'quiet') { $('#toast').hidden = true; clearTimeout(toastTimeout); }
  const signature = JSON.stringify(s.companion);
  if (signature !== memorySignature) {
    memorySignature = signature;
    $('#together-days').textContent = s.companion.days ? `一起 ${s.companion.days} 天` : '從今天開始';
    const latest = s.companion.milestones.filter(m => m.unlocked).sort((a, b) => (a.earnedOn || '').localeCompare(b.earnedOn || '')).at(-1);
    $('#memory-latest').textContent = latest ? `${latest.title}${latest.earnedOn ? ` · ${latest.earnedOn.slice(5).replace('-', '/')}` : ''}` : '等一片新葉子';
    $('#memory-leaf').classList.toggle('unlocked', Boolean(latest));
    const previous = s.companion.previous;
    $('#memory-message').textContent = previous ? `上次在 ${previous.date.slice(5).replace('-', '/')} 一起專注了 ${previous.minutes < 1 ? '不到 1' : previous.minutes} 分鐘。歡迎回來。` : s.companion.rounds ? '第一段共同回憶，已經留在這裡。' : '第一片葉子，從一小段專注開始。';
    $('#memories').replaceChildren(...s.companion.milestones.map(m => {
      const item = document.createElement('div'); item.className = `memory${m.unlocked ? ' unlocked' : ''}`;
      const mark = icon('leaf'); mark.setAttribute('aria-hidden', 'true');
      const title = document.createElement('span'); title.textContent = m.title;
      const detail = document.createElement('small'); detail.textContent = `${m.unlocked ? `${m.earnedOn || '已留下'} · ` : ''}${m.detail}`;
      item.append(mark, title, detail); return item;
    }));
  }
  if (document.activeElement !== $('#music-volume')) $('#music-volume').value = Math.round(s.settings.musicVolume * 100);
  if (document.activeElement !== $('#rain-volume')) $('#rain-volume').value = Math.round(s.settings.rainVolume * 100);
  $('#background-source').value = s.settings.backgroundSource;
  $('#music-mode').value = s.settings.musicMode;
  audio.setMusicMode(s.settings.musicMode);
  $('#chime').checked = s.settings.chime;
  $('#music-source option[value=local]').disabled = !s.settings.musicPath;
  $('#music-source').value = s.settings.musicSource === 'local' && !s.settings.musicPath ? 'builtin' : s.settings.musicSource;
  $('#music-title').textContent = $('#music-source').value === 'local' ? s.settings.musicPath.split(/[\\/]/).pop() || '我的音樂' : ({ cafe: '貓咪咖啡館', reading: '書頁之間', night: '深夜小燈', forest: '森林散步', station: '微光車站', seaside: '海鹽假日', garden: '月下庭院', greenhouse: '雨後花房', clouds: '雲端漂流', maple: '楓糖小屋', space: '星際慢車', bamboo: '竹影茶間' }[$('#music-source').value] || '午後窗邊');
  $('#music-title').title = $('#music-title').textContent;
  $('#music-title').hidden = $('#music-source').value !== 'local';
  audio.setVolumes({ ...s.settings, musicVolume: Number($('#music-volume').value) / 100, rainVolume: Number($('#rain-volume').value) / 100 });
  renderTasks(s);
  renderUndo(s);
  if (first || priorError !== s.errorMessage) error(s.errorMessage || '');
}
window.mori.onState(render);
window.mori.getState().then(render).catch(() => error('無法讀取資料，請重新啟動森日。'));
window.mori.onNotice(({ text, chime, kind }) => {
  if (kind?.startsWith('interact-')) return;
  if (kind === 'finish') {
    audio.stopMusic(); audio.stopRain(); audioButtons();
    $('#day-review').textContent = text; $('#day-review').hidden = false;
    return;
  }
  if (state?.settings.presence === 'quiet') return;
  $('#toast').textContent = text; $('#toast').hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 7000);
  if (chime) audio.chime().catch(() => error('提示音無法播放，請檢查音效輸出裝置。'));
});
$('#collapse').addEventListener('click', () => window.mori.windowAction('collapse'));
$('#presence').addEventListener('change', () => act('companionSettings', { key: 'presence', value: $('#presence').value }));
$('#pin-panel').addEventListener('click', () => act('companionSettings', { key: 'panelPinned', value: !state.settings.panelPinned }));
$('#hide-pet').addEventListener('click', () => window.mori.windowAction('hide').catch(() => error('暫時無法隱藏，請從系統匣操作。')));
$('#finish-day').addEventListener('click', () => window.mori.windowAction('finish').catch(() => error('收工回顧暫時無法完成。')));
$('#quick-start').addEventListener('click', async () => { audio.prime().catch(() => {}); if (await act('quickStart')) $('#day-review').hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) window.mori.windowAction('collapse'); });
$('#compact-toggle').addEventListener('click', () => $('#start').click());
$('#undo-timer').addEventListener('click', () => act('undoTimer'));
$('.panel-content').addEventListener('scroll', () => { $('#compact-timer').hidden = $('.panel-content').scrollTop < 180; });
$('#start').addEventListener('click', () => { if (!state) return; audio.prime().catch(() => {}); $('#day-review').hidden = true; act(state.timer.running ? 'pause' : 'start'); });
$('#reset').addEventListener('click', () => act('reset'));
$('#mode-focus').addEventListener('click', () => { if (state?.timer.mode !== 'focus') act('mode', 'focus'); });
$('#mode-break').addEventListener('click', () => { if (state?.timer.mode !== 'break') act('mode', 'break'); });
$('#duration-toggle').addEventListener('click', () => { const form = $('#duration-form'); form.hidden = !form.hidden; $('#duration-toggle').setAttribute('aria-expanded', String(!form.hidden)); if (!form.hidden) $('#focus-duration').focus(); });
$('#duration-form').addEventListener('submit', async event => { event.preventDefault(); if (await act('durations', { focus: Number($('#focus-duration').value), break: Number($('#break-duration').value) })) { $('#duration-form').hidden = true; $('#duration-toggle').setAttribute('aria-expanded', 'false'); } });
$('#task-form').addEventListener('submit', async event => { event.preventDefault(); if (await act('addTask', $('#task-input').value)) { $('#task-input').value = ''; $('#task-input').focus(); } });
$('#tasks-toggle').addEventListener('click', () => { showAllTasks = !showAllTasks; renderTasks(state); });
$('#undo-delete').addEventListener('click', () => act('undoDelete'));
$('#memory-leaf').addEventListener('click', () => { $('#memory-book').open = true; $('#memory-book summary').focus(); });
function audioButtons() {
  for (const [id, playing, label] of [['music', Boolean(audio.musicNode), '輕音樂'], ['rain', Boolean(audio.rainNode), '背景音']]) {
    const button = $(`#${id}-toggle`); button.setAttribute('aria-pressed', String(playing)); button.setAttribute('aria-label', `${playing ? '暫停' : '播放'}${label}`); button.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  }
}
async function playMusic(source = $('#music-source').value) {
  const button = $('#music-toggle'); button.disabled = true;
  try { await audio.playMusic(source, state.settings.musicPath); error(state.errorMessage || ''); }
  catch (e) { error(e.message); }
  finally { button.disabled = false; audioButtons(); }
}
audio.onMusicEnded = async (source, request) => {
  audioButtons();
  const tracks = [...$('#music-source').options].filter(option => !option.disabled).map(option => option.value);
  const next = MoriAudio.nextTrack(source, state.settings.musicMode, tracks);
  if (!next) return;
  if (await act('audioSettings', { key: 'musicSource', value: next })) {
    if (request === audio.musicRequest) await playMusic(next);
  }
};
$('#music-mode').addEventListener('change', () => act('audioSettings', { key: 'musicMode', value: $('#music-mode').value }));
$('#music-toggle').addEventListener('click', () => { if (audio.musicNode) { audio.stopMusic(); audioButtons(); } else playMusic(); });
$('#rain-toggle').addEventListener('click', async () => { const button = $('#rain-toggle'); button.disabled = true; try { await audio.toggleRain(state.settings.backgroundSource); } catch { error('背景音無法播放，請檢查音檔與音效輸出裝置。'); } finally { button.disabled = false; audioButtons(); } });
$('#background-source').addEventListener('change', async () => {
  const select = $('#background-source'), source = select.value, playing = Boolean(audio.rainNode);
  audio.stopRain(); audioButtons(); const request = audio.rainRequest; select.disabled = true;
  try { if (await act('audioSettings', { key: 'backgroundSource', value: source })) {
    if (playing && request === audio.rainRequest) await audio.toggleRain(source);
  } } catch { error('背景音無法播放，請改選其他聲音。'); }
  finally { select.disabled = false; audioButtons(); }
});
$('#music-source').addEventListener('change', async () => { const source = $('#music-source').value; const playing = Boolean(audio.musicNode); audio.stopMusic(); audioButtons(); const request = audio.musicRequest; if (await act('audioSettings', { key: 'musicSource', value: source })) { if (playing && request === audio.musicRequest) playMusic(source); } });
$('#import-music').addEventListener('click', async () => {
  try {
    const result = await window.mori.chooseMusic();
    if (result.canceled) return;
    state = await window.mori.getState();
    $('#music-source').value = 'local'; render(state);
    await playMusic();
  } catch { error('無法開啟音樂檔案，請重新選擇。'); }
});
for (const name of ['music', 'rain']) {
  const slider = $(`#${name}-volume`);
  slider.addEventListener('input', () => audio.setVolumes({ ...state.settings, [`${name}Volume`]: Number(slider.value) / 100 }));
  slider.addEventListener('change', () => act('audioSettings', { key: `${name}Volume`, value: Number(slider.value) / 100 }));
}
$('#chime').addEventListener('change', () => act('audioSettings', { key: 'chime', value: $('#chime').checked }));
