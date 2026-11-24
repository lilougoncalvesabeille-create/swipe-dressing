import assert from 'node:assert/strict';

export function proche(a, b, tolerance = 1e-6) {
  assert.ok(Math.abs(a - b) <= tolerance, `${a} n'est pas proche de ${b} (tolérance ${tolerance})`);
}
