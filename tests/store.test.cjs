const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store.cjs');

test('atomic saves round-trip and corrupt primary recovers the last backup without erasing evidence', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = new Store(dir);
  s.save({ tasks: ['first'] });
  s.save({ tasks: ['second'] });
  assert.deepEqual(s.load().data, { tasks: ['second'] });
  fs.writeFileSync(path.join(dir, 'state.json'), '{oops');
  const restored = s.load();
  assert.deepEqual(restored.data, { tasks: ['first'] });
  assert.ok(restored.warning);
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('state.corrupt-')));
  s.save({ tasks: ['recovered'] });
  assert.deepEqual(s.load().data, { tasks: ['recovered'] });
});

test('write failures are visible to the caller', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'file'), 'x');
  assert.throws(() => new Store(path.join(dir, 'file')).save({}));
});
