const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');

test('pausing excludes time away and resuming completes one round only', () => {
  const m = new FocusModel();
  const t = new Date(2026, 8, 10, 10).getTime();
  m.dispatch('durations', { focus: 1, break: 1 }, t);
  m.dispatch('start', null, t);
  m.pause(t + 20000);
  assert.equal(m.snapshot(t + 80000).timer.remaining, 40000);
  m.dispatch('start', null, t + 80000);
  assert.equal(m.tick(t + 130000), true);
  assert.equal(m.tick(t + 200000), false);
  const s = m.snapshot(t + 200000);
  assert.equal(s.timer.mode, 'break');
  assert.equal(s.timer.running, false);
  assert.deepEqual(s.days['2026-09-10'], { ms: 60000, rounds: 1 });
});

test('focus across midnight belongs to the correct local day', () => {
  const m = new FocusModel();
  const t = new Date(2026, 8, 10, 23, 59, 30).getTime();
  m.dispatch('durations', { focus: 1, break: 1 }, t);
  m.dispatch('start', null, t);
  m.tick(t + 60000);
  const s = m.snapshot(t + 60000);
  assert.deepEqual(s.days['2026-09-10'], { ms: 30000, rounds: 0 });
  assert.deepEqual(s.days['2026-09-11'], { ms: 30000, rounds: 1 });
});

test('restart restores remaining duration paused and never counts offline time', () => {
  const m = new FocusModel();
  m.dispatch('start', null, 100000);
  m.tick(120000);
  const restored = new FocusModel(m.snapshot(120000));
  assert.equal(restored.snapshot(900000).timer.running, false);
  assert.equal(restored.snapshot(900000).timer.remaining, 1480000);
});

test('reset retains earned focus, break earns none, and durations reject invalid input', () => {
  const m = new FocusModel();
  const t = new Date(2026, 8, 10, 10).getTime();
  assert.throws(() => m.dispatch('durations', { focus: 0, break: 5 }, t));
  m.dispatch('start', null, t);
  assert.throws(() => m.dispatch('durations', { focus: 30, break: 5 }, t));
  m.dispatch('reset', null, t + 10000);
  m.dispatch('mode', 'break', t + 10000);
  m.dispatch('start', null, t + 10000);
  m.tick(t + 20000);
  assert.deepEqual(m.snapshot(t + 20000).days['2026-09-10'], { ms: 10000, rounds: 0 });
});

test('tasks validate names and deleting the selected task clears selection', () => {
  const m = new FocusModel();
  assert.throws(() => m.dispatch('addTask', '  '));
  assert.throws(() => m.dispatch('addTask', 'a'.repeat(121)));
  m.dispatch('addTask', '  寫一頁筆記  ');
  const task = m.snapshot().tasks[0];
  assert.equal(task.title, '寫一頁筆記');
  m.dispatch('selectTask', task.id);
  m.dispatch('toggleTask', task.id);
  assert.equal(m.snapshot().tasks[0].done, true);
  m.dispatch('deleteTask', task.id);
  assert.equal(m.snapshot().selectedTask, null);
  assert.throws(() => m.dispatch('anything', {}));
});

test('invalid saved structure cannot inject broken timer or tasks', () => {
  const m = new FocusModel({ timer: { remaining: -1, mode: 'bad' }, tasks: [{}], settings: { focus: 0 } });
  assert.equal(m.snapshot().timer.remaining, 1500000);
  assert.deepEqual(m.snapshot().tasks, []);
});

test('selected music source and volume survive a restart and reject unknown sources', () => {
  const m = new FocusModel();
  m.dispatch('audioSettings', { key: 'musicSource', value: 'local' });
  m.dispatch('audioSettings', { key: 'musicVolume', value: 0.8 });
  const restored = new FocusModel(m.snapshot());
  assert.equal(restored.settings.musicSource, 'local');
  assert.equal(restored.settings.musicVolume, 0.8);
  assert.throws(() => m.dispatch('audioSettings', { key: 'musicSource', value: 'remote' }));
});
