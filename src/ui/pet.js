import { resolvePose, BlinkClock, IdleClock } from './pet-state.mjs';
import { PetSprite } from './pet-sprite.mjs';

const pet = document.querySelector('#pet'), bubble = document.querySelector('#bubble');
const tools = document.querySelector('#tools');
const sprite = new PetSprite(document.querySelector('#pet-sprite'));
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const blink = new BlinkClock(Date.now());
const idle = new IdleClock(Date.now());
let assetsReady = false, requestedOutfit, outfitChange = 0, interaction = '', interactionSince = 0;
async function syncOutfit(outfit) {
  if (!assetsReady || requestedOutfit === outfit) return;
  requestedOutfit = outfit; const change = ++outfitChange;
  pet.dataset.outfitLoading = 'true';
  try {
    if (await sprite.setOutfit(outfit)) {
      pet.dataset.outfit = outfit;
      window.mori.reportOutfit({ requested: outfit, actual: outfit, ok: true });
      draw();
    }
  } catch {
    if (change !== outfitChange) return;
    say('這套衣服還沒準備好，先穿原來這套。', 4000);
    window.mori.reportOutfit({ requested: outfit, actual: sprite.outfit, ok: false });
  } finally { if (change === outfitChange) pet.dataset.outfitLoading = 'false'; }
}
const mood = { held: false, reaction: '', reactionUntil: 0, lastActive: Date.now(), phaseSince: Date.now(), timer: {} };
let state, down, dragged = false, landedAt = 0, noticeUntil = 0, lastPat = 0, hovered = false, greetingDay = '';
let pointer = null, previousHit, lastFrame = 0, lastHeadPoint = null, patDistance = 0, greetingTimer, hoverSince = 0, grabPoint = null;
const speech = { pat: ['嘿嘿，好舒服。', '謝謝你，我陪著你。', '慢慢來，我在這裡。'], greeting: ['嗨，今天也一起加油。', '我在這裡，陪你慢慢來。', '見到你真好。'] };
const speechIndex = {}, speechAt = {};
function chatter(kind, now = Date.now()) {
  if (now - (speechAt[kind] || 0) < 10000) return;
  speechAt[kind] = now;
  const index = speechIndex[kind] || 0;
  say(speech[kind][index % speech[kind].length], 2400);
  speechIndex[kind] = index + 1;
}

function say(text, duration = 2000) {
  bubble.setAttribute('aria-live', 'polite');
  noticeUntil = Date.now() + duration; bubble.textContent = text; bubble.hidden = false;
  updateTimerVisibility();
}
function updateTimerVisibility(now = Date.now()) {
  const mini = document.querySelector('#pet-timer');
  mini.hidden = !state?.settings.miniTimer || state.settings.presence === 'quiet' || now < noticeUntil
    || (!state.timer.running && state.timer.remaining === state.timer.duration);
  if (!mini.hidden || state?.settings.presence === 'quiet') bubble.hidden = true;
  return !mini.hidden;
}
function react(pose, duration) {
  mood.lastActive = Date.now(); mood.reaction = pose; mood.reactionUntil = Date.now() + duration;
}
function updateState(s) {
  if (down && (s.settings.petSize !== state?.settings.petSize || s.settings.positionLocked !== state?.settings.positionLocked)) release({ pointerId: down.id }, true);
  if (s.settings.presence !== state?.settings.presence) { noticeUntil = 0; mood.reaction = ''; hovered = false; clearTimeout(greetingTimer); interaction = ''; }
  if (s.timer.mode !== mood.timer.mode || s.timer.running !== mood.timer.running) {
    mood.lastActive = Date.now(); mood.phaseSince = Date.now();
  }
  state = s; mood.timer = s.timer;
  document.body.dataset.petSize = s.settings.petSize;
  pet.dataset.locked = String(s.settings.positionLocked);
  pet.title = s.settings.positionLocked ? '位置已鎖定 · 摸摸頭 · 單擊打招呼 · 雙擊開工具' : '摸摸頭 · 單擊打招呼 · 雙擊開工具 · 拖曳搬家';
  updateTimerVisibility();
  const seconds = Math.ceil(s.timer.remaining / 1000);
  document.querySelector('#pet-time').textContent = `${s.timer.running ? s.timer.mode === 'focus' ? '專注' : '休息' : '暫停'} ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const toggle = document.querySelector('#pet-timer-toggle');
  toggle.textContent = s.timer.running ? '暫停' : '繼續'; toggle.setAttribute('aria-label', `${toggle.textContent}計時`);
  syncOutfit(s.settings.outfit);
  if (greetingDay !== s.today) {
    greetingDay = s.today;
    if (s.settings.presence === 'companion' && !s.timer.running) {
      const previous = s.companion.previous;
      say(previous ? `上次一起專注 ${previous.minutes < 1 ? '不到 1' : previous.minutes} 分鐘。歡迎回來。` : '我是森森。按葉子，一起開始吧。', 5500);
    }
  }
}
function spritePoint(x, y) {
  const bounds = sprite.canvas.getBoundingClientRect();
  return { x: (x - bounds.left) * 220 / bounds.width + 10, y: (y - bounds.top) * 190 / bounds.height + 40 };
}
function syncHit(x, y, force = false) {
  const element = document.elementFromPoint(x, y);
  const hit = Boolean(element?.closest('#tools, #pet-timer')) || sprite.hit(x, y);
  if (force || hit !== previousHit) { window.mori.hitTest(hit); previousHit = hit; }
  return hit;
}
function draw() {
  const now = Date.now();
  mood.blinkUntil = motion.matches ? 0 : blink.update(now);
  mood.calm = motion.matches || state?.settings.presence !== 'companion';
  const reading = mood.timer.mode === 'focus' && (mood.timer.running || mood.timer.remaining < mood.timer.duration);
  mood.idlePose = idle.update(now, !mood.calm && !reading && !mood.held && !down && !hovered && now >= mood.reactionUntil && now - mood.lastActive < 58000);
  const pose = resolvePose(mood, now);
  pet.dataset.pose = pose;
  sprite.draw(pose, now, { reducedMotion: motion.matches, calm: state?.settings.presence !== 'companion', landedAt, grabPoint, gaze: hovered && pointer ? (spritePoint(pointer.x, pointer.y).x - 120) / 80 : 0, interaction, interactionSince });
  if (pointer && !down) syncHit(pointer.x, pointer.y);
  if (updateTimerVisibility(now)) return;
  if (state?.settings.presence === 'quiet') { bubble.hidden = true; return; }
  if (now < noticeUntil || !state) return;
  bubble.hidden = !hovered || now - hoverSince < 350 || state.settings.presence === 'focus';
  if (bubble.hidden) return;
  bubble.setAttribute('aria-live', 'off');
  const seconds = Math.ceil(state.timer.remaining / 1000);
  bubble.textContent = state.timer.running
    ? `${state.timer.mode === 'focus' ? '陪你專注' : '休息一下'}  ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : pose === 'sleep' ? '呼……我就在這裡陪你。' : '點我打招呼 · 雙擊開工具';
}
function animate(time) {
  const interval = motion.matches ? 200 : state?.settings.presence !== 'companion' && Date.now() >= blink.until ? 150 : 33;
  if (time - lastFrame >= interval && !document.hidden) { lastFrame = time; draw(); }
  requestAnimationFrame(animate);
}
sprite.load('assets/mori-catgirl-atlas.png').then(async () => {
  try { await sprite.loadReading('assets/mori-reading-atlas.png'); pet.dataset.readingReady = 'true'; }
  catch { pet.dataset.readingReady = 'false'; say('讀書表情暫時無法載入。', 4000); }
  try { await sprite.loadIdle('assets/mori-idle-atlas.png'); pet.dataset.idleReady = 'true'; }
  catch { pet.dataset.idleReady = 'false'; }
  assetsReady = true;
  try { await sprite.loadRig('assets/mori-classic-rig.png'); pet.dataset.rigReady = 'true'; }
  catch { pet.dataset.rigReady = 'false'; }
  try { await sprite.loadReadingRig('assets/mori-reading-bodies.png'); pet.dataset.readingRigReady = 'true'; }
  catch { pet.dataset.readingRigReady = 'false'; }
    try { await sprite.loadActivityRig(); pet.dataset.activityRigReady = 'true'; }
    catch { pet.dataset.activityRigReady = 'false'; }
    try { await sprite.loadFocusRig(); pet.dataset.focusRigReady = 'true'; }
    catch { pet.dataset.focusRigReady = 'false'; }
  await syncOutfit(state?.settings.outfit || 'classic');
  pet.dataset.ready = 'true'; draw(); requestAnimationFrame(animate);
}).catch(() => { say('角色載入失敗，仍可按右下工具。', Infinity); pet.dataset.ready = 'error'; });
window.mori.onState(updateState);
window.mori.getState().then(updateState).catch(() => say('連線暫時中斷，請重新開啟森日。', Infinity));
window.mori.onNotice(({ text, kind }) => {
  if (state?.settings.presence === 'quiet') return;
  if (kind?.startsWith('interact-')) {
    clearTimeout(greetingTimer);
    interaction = kind.slice(9); interactionSince = Date.now();
    react({ snack: 'snack', play: 'curious', rest: 'sleep' }[interaction] || 'happy', interaction === 'rest' ? 8000 : 3000);
    say(text, 2600); draw(); return;
  }
  if (kind === 'complete') react('readHappy', 2400);
  say(kind === 'complete' ? '這一小段，我們完成了。' : kind === 'finish' ? '今天辛苦了，下次再一起。' : text, 4500); draw();
});
window.mori.onHitRefresh(({ x, y }) => { pointer = { x, y }; if (!down) syncHit(x, y, true); });

document.addEventListener('pointermove', event => {
  pointer = { x: event.clientX, y: event.clientY };
  if (down) return;
  const hit = syncHit(pointer.x, pointer.y);
  if (hit && !hovered) hoverSince = Date.now();
  hovered = hit;
  const now = Date.now();
  if (hit && sprite.hit(pointer.x, pointer.y)) {
    mood.lastActive = now;
    if (spritePoint(pointer.x, pointer.y).y < 115) {
      if (lastHeadPoint && now - lastHeadPoint.time < 650) patDistance += Math.hypot(pointer.x - lastHeadPoint.x, pointer.y - lastHeadPoint.y);
      else patDistance = 0;
      lastHeadPoint = { ...pointer, time: now };
      if (patDistance > 12 && now - lastPat > 1800 && state?.settings.presence === 'companion') {
        lastPat = now; patDistance = 0; clearTimeout(greetingTimer); react('happy', 1800); chatter('pat', now); draw();
      }
    } else { lastHeadPoint = null; patDistance = 0; }
  } else { lastHeadPoint = null; patDistance = 0; }
});
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !sprite.hit(event.clientX, event.clientY)) return;
  clearTimeout(greetingTimer);
  mood.lastActive = Date.now(); down = { x: event.screenX, y: event.screenY, id: event.pointerId }; dragged = false;
  const point = spritePoint(event.clientX, event.clientY);
  grabPoint = { x: point.x - 120, y: point.y - 221 };
  pet.setPointerCapture(event.pointerId); if (!state?.settings.positionLocked) window.mori.drag('begin');
});
pet.addEventListener('pointermove', event => {
  if (!down || state?.settings.positionLocked) return;
  if (Math.hypot(event.screenX - down.x, event.screenY - down.y) > 5) {
    if (!dragged) say('咦，要帶我去哪裡？', 1200);
    dragged = true; mood.held = true; mood.reaction = '';
  }
  if (dragged) { window.mori.drag('move'); draw(); }
});
function release(event, canceled = false) {
  if (!down) return;
  down = null; mood.held = false; mood.lastActive = Date.now();
  window.mori.drag('end');
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  if (dragged) { landedAt = Date.now(); say(canceled ? '我在這裡等你。' : '安全著陸！', 1400); }
  else if (!canceled) {
    if (state?.settings.presence === 'companion') chatter('greeting');
    // Keep the clicked silhouette stable long enough for a double-click on ears or tail.
    if (state?.settings.presence === 'companion') greetingTimer = setTimeout(() => { react('wave', 1300); draw(); }, 500);
  }
  draw();
}
pet.addEventListener('pointerup', event => release(event));
pet.addEventListener('pointercancel', event => release(event, true));
pet.addEventListener('lostpointercapture', event => { if (down) release(event, true); });
pet.addEventListener('dblclick', event => {
  if (!dragged && sprite.hit(event.clientX, event.clientY)) {
    clearTimeout(greetingTimer);
    mood.reaction = ''; window.mori.windowAction('toggle');
  }
});
pet.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.mori.windowAction('toggle'); }
});
tools.addEventListener('click', () => window.mori.windowAction('toggle'));
document.querySelector('#pet-timer-toggle').addEventListener('click', async () => {
  try { await window.mori.windowAction('timer-toggle'); }
  catch { say('計時暫時無法調整，請按葉子開啟工具。', 4000); }
});
document.addEventListener('pointerleave', () => {
  hovered = false;
  if (!down) { pointer = null; lastHeadPoint = null; previousHit = false; window.mori.hitTest(false); }
});
