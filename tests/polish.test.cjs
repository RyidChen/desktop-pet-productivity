const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');
const { resolvePose, BlinkClock } = require('../src/ui/pet-state.mjs');

test('completing the current task clears selection without pausing focus', () => {
  const m = new FocusModel();
  m.dispatch('addTask', '讀一頁');
  const id = m.tasks[0].id;
  m.dispatch('selectTask', id);
  m.dispatch('start', null, 1000);
  m.dispatch('toggleTask', id, 2000);
  assert.equal(m.selectedTask, null);
  assert.equal(m.timer.running, true);
  assert.throws(() => m.dispatch('selectTask', id));
  assert.equal(new FocusModel({ tasks: m.tasks, selectedTask: id }).selectedTask, null);
});

test('undo restores deleted task order without replacing a later selection and expires', () => {
  const m = new FocusModel();
  m.dispatch('addTask', '第一件'); m.dispatch('addTask', '第二件');
  const [first, second] = m.tasks;
  m.dispatch('selectTask', first.id);
  m.dispatch('deleteTask', first.id, 1000);
  m.dispatch('selectTask', second.id);
  m.dispatch('undoDelete', null, 2000);
  assert.deepEqual(m.tasks.map(t => t.title), ['第一件', '第二件']);
  assert.equal(m.selectedTask, second.id);
  assert.throws(() => m.dispatch('undoDelete', null, 3000));
  m.dispatch('deleteTask', first.id, 4000);
  assert.throws(() => m.dispatch('undoDelete', null, 12001));
  assert.equal(m.tasks.length, 1);
});

test('reading expressions keep seated posture and allow blinks while the timer runs', () => {
  const reading = { timer: { mode: 'focus', running: true }, blinkUntil: 1200 };
  assert.equal(resolvePose(reading, 1100), 'readBlink');
  assert.equal(resolvePose(reading, 1300), 'read');
  assert.equal(resolvePose({ ...reading, reaction: 'happy', reactionUntil: 2000 }, 1500), 'readHappy');
  assert.equal(resolvePose({ ...reading, held: true }, 1100), 'held');
});

test('blink scheduling starts a visible blink even when a slow frame arrives after its due time', () => {
  const blink = new BlinkClock(0, () => 0);
  assert.equal(blink.update(3999), 0);
  assert.equal(blink.update(4200), 4360);
  assert.equal(blink.update(4300), 4360);
  assert.equal(blink.update(4400), 4360);
  assert.equal(blink.update(8600), 8760);
});

test('milestone dates derive from completed rounds and days rather than the current date', () => {
  const m = new FocusModel({ days: {
    '2026-09-01': { ms: 60000, rounds: 0 },
    '2026-09-03': { ms: 60000, rounds: 1 },
    '2026-09-08': { ms: 600000, rounds: 9 },
  } });
  const memories = m.snapshot(new Date(2026, 8, 12).getTime()).companion.milestones;
  assert.deepEqual(memories.map(m => m.earnedOn), ['2026-09-03', '2026-09-08', '2026-09-08']);
});
