const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusModel } = require('../src/model.cjs');
test('desktop size and lock validate, default safely and survive restart', () => {
  const model = new FocusModel({ settings: { petSize: 'giant', positionLocked: 'yes' } });
  assert.equal(model.settings.petSize, 'medium');
  assert.equal(model.settings.positionLocked, false);
  for (const size of ['small', 'medium', 'large']) {
    model.dispatch('companionSettings', { key: 'petSize', value: size });
    assert.equal(new FocusModel(model.snapshot()).settings.petSize, size);
  }
  model.dispatch('companionSettings', { key: 'positionLocked', value: true });
  assert.equal(new FocusModel(model.snapshot()).settings.positionLocked, true);
  for (const value of ['giant', 1, null]) assert.throws(() => model.dispatch('companionSettings', { key: 'petSize', value }));
  assert.throws(() => model.dispatch('companionSettings', { key: 'positionLocked', value: 'true' }));
});
