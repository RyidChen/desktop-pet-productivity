const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');

test('timer undo restores remaining time paused without double-counting credited work', () => {
  const m = new FocusModel();
  m.dispatch('start', null, 1000);
  m.dispatch('mode', 'break', 61000);
  assert.ok(m.snapshot(61000).undoTimer);
  m.dispatch('undoTimer', null, 62000);
  assert.equal(m.timer.mode, 'focus');
  assert.equal(m.timer.remaining, 24 * 60000);
  assert.equal(m.timer.running, false);
  assert.equal(Object.values(m.days)[0].ms, 60000);
  m.dispatch('start', null, 63000);
  m.tick(64000);
  assert.equal(Object.values(m.days)[0].ms, 61000);
});

test('timer undo expires and cannot overwrite a subsequently started round', () => {
  const m = new FocusModel();
  m.dispatch('start', null, 1000);
  m.dispatch('reset', null, 2000);
  assert.throws(() => m.dispatch('undoTimer', null, 10001));
  m.dispatch('start', null, 11000);
  m.dispatch('reset', null, 12000);
  m.dispatch('start', null, 13000);
  assert.equal(m.snapshot(13000).undoTimer, null);
  assert.throws(() => m.dispatch('undoTimer', null, 14000));
});

test('editing a task preserves its identity, selection and timer and validates input', () => {
  const m = new FocusModel();
  m.dispatch('addTask', '草稿');
  const id = m.tasks[0].id;
  m.dispatch('selectTask', id);
  m.dispatch('start', null, 1000);
  m.dispatch('editTask', { id, title: '  完成草稿  ' });
  assert.equal(m.tasks[0].title, '完成草稿');
  assert.equal(m.selectedTask, id);
  assert.equal(m.timer.running, true);
  for (const title of ['', ' '.repeat(2), 'a'.repeat(121)]) assert.throws(() => m.dispatch('editTask', { id, title }));
  assert.throws(() => m.dispatch('editTask', { id: 'missing', title: '新名稱' }));
});

test('guide dismissal and mini timer preference survive restart', () => {
  const m = new FocusModel();
  assert.equal(m.settings.guideSeen, false);
  assert.equal(m.settings.miniTimer, true);
  m.dispatch('companionSettings', { key: 'guideSeen', value: true });
  m.dispatch('companionSettings', { key: 'miniTimer', value: false });
  const restored = new FocusModel(m.snapshot());
  assert.equal(restored.settings.guideSeen, true);
  assert.equal(restored.settings.miniTimer, false);
});
