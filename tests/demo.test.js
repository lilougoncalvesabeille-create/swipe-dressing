import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validerPile } from '../js/pile.js';

const json = JSON.parse(readFileSync('data/demo-pile.json', 'utf8'));
const CASSEE = 'data/demo/inexistant.svg';

test('la pile de démonstration est valide', () => {
  const pile = validerPile(json);
  assert.deepEqual(pile.erreurs, []);
  assert.equal(pile.cartes.length, 40);
  assert.equal(pile.echauffement.length, 18);
  assert.equal(pile.styles.length, 6);
});

test('les photos existent, sauf une volontairement cassée', () => {
  const toutes = [...json.cartes, ...json.echauffement];
  const chemins = toutes.flatMap((c) => [c.photo, ...c.photos]);
  for (const p of chemins) {
    if (p !== CASSEE) assert.ok(existsSync(p), `photo introuvable : ${p}`);
  }
  assert.equal(existsSync(CASSEE), false);
  assert.equal(toutes.filter((c) => c.photo === CASSEE).length, 1);
});

test('la démo couvre filtres et cas limites', () => {
  assert.ok(json.cartes.filter((c) => c.dispo === false).length >= 2);
  assert.ok(json.cartes.some((c) => c.marque === 'Nike'));
  const prix = json.cartes.map((c) => c.prix);
  assert.ok(Math.min(...prix) <= 3 && Math.max(...prix) >= 150);
  assert.ok(json.cartes.every((c) => c.site === 'demo' && /^https:\/\/example\.com\/annonce\/\d+$/.test(c.url)));
});
