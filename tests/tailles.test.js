import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, typeDeTaille, lireTailles } from '../js/tailles.js';

test('typeDeTaille', () => {
  assert.equal(typeDeTaille('pull'), 'haut');
  assert.equal(typeDeTaille('jean'), 'bas');
  assert.equal(typeDeTaille('chaussures'), 'pointure');
  assert.equal(typeDeTaille('gants'), 'unique');
  assert.equal(typeDeTaille('inconnue'), 'haut');
  assert.equal(CATEGORIES.robe, 'haut');
});

test('lireTailles', () => {
  assert.deepEqual(lireTailles('M/L', 'haut'), [
    { systeme: 'lettres', valeur: 4 },
    { systeme: 'lettres', valeur: 5 },
  ]);
  assert.deepEqual(lireTailles('38/40', 'haut'), [
    { systeme: 'eu', valeur: 38 },
    { systeme: 'eu', valeur: 40 },
  ]);
  assert.deepEqual(lireTailles('W32 L34', 'bas'), [{ systeme: 'w', valeur: 32 }]);
  assert.deepEqual(lireTailles('42 2/3', 'pointure'), [{ systeme: 'pointure', valeur: 42 + 2 / 3 }]);
  assert.deepEqual(lireTailles('42,5', 'pointure'), [{ systeme: 'pointure', valeur: 42.5 }]);
  assert.deepEqual(lireTailles('', 'haut'), []);
  assert.deepEqual(lireTailles('n/a', 'haut'), []);
  assert.deepEqual(lireTailles('2023', 'pointure'), []);
  assert.deepEqual(lireTailles('Taille EU 38', 'haut'), [{ systeme: 'eu', valeur: 38 }]);
});

// compatibilite() est couverte par les cas partagés : tests/cas/tailles-cas.json (tests/cas.test.js).
