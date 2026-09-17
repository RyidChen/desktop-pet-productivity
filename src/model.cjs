const { randomUUID } = require('node:crypto');
const dayKey = time => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const validMinutes = n => Number.isInteger(n) && n >= 1 && n <= 180;
const volume = (n, fallback) => Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;

class FocusModel {
  constructor(saved = {}) {
    saved = saved && typeof saved === 'object' ? saved : {};
    const settings = saved.settings || {};
    this.settings = {
      focus: validMinutes(settings.focus) ? settings.focus : 25,
      break: validMinutes(settings.break) ? settings.break : 5,
      musicVolume: volume(settings.musicVolume, 0.45),
      rainVolume: volume(settings.rainVolume, 0.3),
      backgroundSource: ['brown', 'pink', 'ocean'].includes(settings.backgroundSource) ? settings.backgroundSource : 'rain',
      musicMode: ['shuffle', 'sequence'].includes(settings.musicMode) ? settings.musicMode : 'repeat',
      chime: settings.chime !== false,
      musicPath: typeof settings.musicPath === 'string' ? settings.musicPath : '',
      musicSource: ['local', 'cafe', 'reading', 'night', 'forest', 'station', 'seaside', 'garden', 'greenhouse', 'clouds', 'maple', 'space', 'bamboo'].includes(settings.musicSource) ? settings.musicSource : 'builtin',
      presence: ['companion', 'focus', 'quiet'].includes(settings.presence) ? settings.presence : 'companion',
      panelPinned: settings.panelPinned === true,
      guideSeen: settings.guideSeen === true,
      miniTimer: settings.miniTimer !== false,
      outfit: ['cozy', 'outing'].includes(settings.outfit) ? settings.outfit : 'classic',
    };
    this.tasks = Array.isArray(saved.tasks) ? saved.tasks.filter(t => t && typeof t.id === 'string' && typeof t.title === 'string' && t.title.trim() && t.title.length <= 120).map(t => ({ id: t.id, title: t.title, done: t.done === true })) : [];
    this.selectedTask = this.tasks.some(t => t.id === saved.selectedTask && !t.done) ? saved.selectedTask : null;
    this.deletedTask = null;
    this.previousTimer = null;
    this.days = {};
    for (const [key, value] of Object.entries(saved.days || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value?.ms) && value.ms >= 0 && Number.isInteger(value.rounds) && value.rounds >= 0) this.days[key] = { ms: value.ms, rounds: value.rounds };
    }
    const mode = saved.timer?.mode === 'break' ? 'break' : 'focus';
    const duration = validMinutes(saved.timer?.duration / 60000) ? saved.timer.duration : this.settings[mode] * 60000;
    const remaining = saved.timer?.remaining;
    this.timer = { mode, running: false, duration, remaining: Number.isFinite(remaining) && remaining > 0 && remaining <= duration ? remaining : duration };
    this.position = Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y) ? { x: Math.round(saved.position.x), y: Math.round(saved.position.y) } : null;
    this.deadline = null;
    this.lastTick = null;
  }

  credit(start, end) {
    while (start < end) {
      const d = new Date(start);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const boundary = Math.min(midnight, end);
      const day = this.days[dayKey(start)] ||= { ms: 0, rounds: 0 };
      day.ms += boundary - start;
      start = boundary;
    }
  }

  tick(now = Date.now()) {
    if (!this.timer.running) return false;
    // Clock rollback must not add extra minutes to the remaining session.
    if (now < this.lastTick) {
      this.deadline = now + this.timer.remaining;
      this.lastTick = now;
    }
    const end = Math.min(now, this.deadline);
    if (this.timer.mode === 'focus') this.credit(this.lastTick, end);
    this.lastTick = end;
    this.timer.remaining = Math.max(0, this.deadline - now);
    if (now < this.deadline) return false;
    if (this.timer.mode === 'focus') {
      const day = this.days[dayKey(this.deadline)] ||= { ms: 0, rounds: 0 };
      day.rounds++;
    }
    this.timer.mode = this.timer.mode === 'focus' ? 'break' : 'focus';
    this.timer.duration = this.settings[this.timer.mode] * 60000;
    this.timer.remaining = this.timer.duration;
    this.timer.running = false;
    this.deadline = null;
    return true;
  }

  pause(now = Date.now()) {
    const complete = this.tick(now);
    this.timer.running = false;
    this.deadline = null;
    return complete;
  }

  dispatch(action, payload, now = Date.now()) {
    const rememberTimer = () => {
      this.pause(now);
      this.previousTimer = this.timer.remaining < this.timer.duration
        ? { timer: { ...this.timer }, expiresAt: now + 8000 } : null;
    };
    if (['start', 'quickStart', 'pause'].includes(action)) this.previousTimer = null;
    switch (action) {
      case 'undoTimer':
        if (!this.previousTimer || now > this.previousTimer.expiresAt) throw new Error('復原時間已過，請重新調整計時。');
        this.timer = { ...this.previousTimer.timer, running: false };
        this.deadline = null;
        this.lastTick = null;
        this.previousTimer = null;
        break;
      case 'quickStart':
        if (this.timer.running || this.timer.remaining < this.timer.duration) throw new Error('請先完成或重設目前這一輪。');
        this.timer = { mode: 'focus', running: true, duration: 300000, remaining: 300000 };
        this.deadline = now + 300000;
        this.lastTick = now;
        break;
      case 'start':
        if (!this.timer.running) {
          this.deadline = now + this.timer.remaining;
          this.lastTick = now;
          this.timer.running = true;
        }
        break;
      case 'pause': this.pause(now); break;
      case 'reset':
        rememberTimer();
        this.timer.remaining = this.timer.duration;
        break;
      case 'mode':
        if (!['focus', 'break'].includes(payload)) throw new Error('請選擇專注或休息。');
        rememberTimer();
        this.timer.mode = payload;
        this.timer.duration = this.settings[payload] * 60000;
        this.timer.remaining = this.timer.duration;
        break;
      case 'durations':
        if (this.timer.running) throw new Error('請先暫停，再調整時間。');
        if (!validMinutes(payload?.focus) || !validMinutes(payload?.break)) throw new Error('時間需為 1–180 分鐘的整數。');
        rememberTimer();
        Object.assign(this.settings, { focus: payload.focus, break: payload.break });
        this.timer.duration = this.settings[this.timer.mode] * 60000;
        this.timer.remaining = this.timer.duration;
        break;
      case 'addTask':
        if (typeof payload !== 'string' || !payload.trim() || payload.trim().length > 120) throw new Error('請輸入 1–120 字的待辦事項。');
        this.tasks.push({ id: randomUUID(), title: payload.trim(), done: false });
        break;
      case 'editTask': {
        const task = this.tasks.find(t => t.id === payload?.id);
        if (!task) throw new Error('找不到這項任務，請重新選擇。');
        if (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.trim().length > 120) throw new Error('請輸入 1–120 字的待辦事項。');
        task.title = payload.title.trim();
        break;
      }
      case 'toggleTask':
      case 'deleteTask':
      case 'selectTask': {
        if (action === 'selectTask' && payload === null) { this.selectedTask = null; break; }
        const task = this.tasks.find(t => t.id === payload);
        if (!task) throw new Error('找不到這項任務，請重新選擇。');
        if (action === 'toggleTask') {
          task.done = !task.done;
          if (task.done && this.selectedTask === task.id) this.selectedTask = null;
        }
        if (action === 'selectTask') {
          if (task.done) throw new Error('這件事已完成，請選另一件，或先取消勾選。');
          this.selectedTask = task.id;
        }
        if (action === 'deleteTask') {
          this.deletedTask = { task, index: this.tasks.indexOf(task), selected: this.selectedTask === task.id, until: now + 8000 };
          this.tasks = this.tasks.filter(t => t.id !== payload);
          if (this.selectedTask === payload) this.selectedTask = null;
        }
        break;
      }
      case 'undoDelete': {
        const deleted = this.deletedTask;
        if (!deleted || now > deleted.until) { this.deletedTask = null; throw new Error('復原時間已過，請重新新增待辦。'); }
        this.tasks.splice(deleted.index, 0, deleted.task);
        if (!this.selectedTask && deleted.selected && !deleted.task.done) this.selectedTask = deleted.task.id;
        this.deletedTask = null;
        break;
      }
      case 'companionSettings':
        if (!payload || !['presence', 'panelPinned', 'outfit', 'guideSeen', 'miniTimer'].includes(payload.key)) throw new Error('陪伴設定無效。');
        if (payload.key === 'outfit') {
          if (!['classic', 'cozy', 'outing'].includes(payload.value)) throw new Error('服裝選項無效。');
          this.settings.outfit = payload.value;
          break;
        }
        if (payload.key === 'presence' ? !['companion', 'focus', 'quiet'].includes(payload.value) : typeof payload.value !== 'boolean') throw new Error('陪伴設定無效。');
        this.settings[payload.key] = payload.value;
        break;
      case 'audioSettings':
        if (!payload || !['musicVolume', 'rainVolume', 'chime', 'musicSource', 'backgroundSource', 'musicMode'].includes(payload.key)) throw new Error('聲音設定無效。');
        if (payload.key === 'musicMode') {
          if (!['repeat', 'shuffle', 'sequence'].includes(payload.value)) throw new Error('播放模式無效。');
          this.settings.musicMode = payload.value;
          break;
        }
        if (payload.key === 'backgroundSource') {
          if (!['rain', 'brown', 'pink', 'ocean'].includes(payload.value)) throw new Error('背景音選項無效。');
          this.settings.backgroundSource = payload.value;
          break;
        }
        if (payload.key === 'musicSource') {
          if (!['local', 'builtin', 'cafe', 'reading', 'night', 'forest', 'station', 'seaside', 'garden', 'greenhouse', 'clouds', 'maple', 'space', 'bamboo'].includes(payload.value)) throw new Error('音樂來源無效。');
        } else if (payload.key === 'chime' ? typeof payload.value !== 'boolean' : !Number.isFinite(payload.value) || payload.value < 0 || payload.value > 1) throw new Error('音量設定無效。');
        this.settings[payload.key] = payload.value;
        break;
      default: throw new Error('不支援這項操作。');
    }
  }

  snapshot(now = Date.now()) {
    const today = dayKey(now);
    const active = Object.entries(this.days).filter(([date, day]) => date <= today && (day.ms > 0 || day.rounds > 0)).sort(([a], [b]) => a.localeCompare(b));
    const previous = active.filter(([date]) => date < today).at(-1);
    const rounds = active.reduce((total, [, day]) => total + day.rounds, 0);
    let cumulativeRounds = 0;
    const tenth = active.find(([, day]) => (cumulativeRounds += day.rounds) >= 10);
    const companion = {
      days: active.length, rounds,
      previous: previous ? { date: previous[0], minutes: Math.floor(previous[1].ms / 60000) } : null,
      milestones: [
        { title: '第一片葉子', detail: '一起完成第一輪專注', unlocked: rounds >= 1, earnedOn: active.find(([, day]) => day.rounds > 0)?.[0] || null },
        { title: '熟悉的角落', detail: '在三個不同日子一起專注', unlocked: active.length >= 3, earnedOn: active[2]?.[0] || null },
        { title: '十次小小前進', detail: '一起完成十輪專注', unlocked: rounds >= 10, earnedOn: tenth?.[0] || null },
      ],
    };
    const undoDelete = this.deletedTask && now <= this.deletedTask.until ? { title: this.deletedTask.task.title, expiresAt: this.deletedTask.until } : null;
    const undoTimer = this.previousTimer && now <= this.previousTimer.expiresAt ? { expiresAt: this.previousTimer.expiresAt } : null;
    return structuredClone({ version: 2, settings: this.settings, timer: this.timer, tasks: this.tasks, selectedTask: this.selectedTask, days: this.days, position: this.position, today, companion, undoDelete, undoTimer });
  }
}
module.exports = { FocusModel, dayKey };
