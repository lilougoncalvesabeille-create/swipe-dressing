import test from 'node:test';
import assert from 'node:assert/strict';
import { proche } from './aide.js';

test('proche accepte un écart minuscule', () => {
  proche(0.1 + 0.2, 0.3);
});

test('proche refuse un écart trop grand', () => {
  assert.throws(() => proche(1, 2));
});
