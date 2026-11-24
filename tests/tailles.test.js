import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, typeDeTaille, lireTailles, compatibilite } from '../js/tailles.js';

const P = {
  haut: { lettre: 'M', eu: null, mode: 'large' },
  bas: { lettre: null, eu: null, w: 32, mode: 'large' },
  pointure: { eu: 43, mode: 'large' },
};
const stricte = (cle, extra = {}) => ({ ...P, [cle]: { ...P[cle], ...extra, mode: 'stricte' } });

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
});

test('compatibilite', () => {
  const cas = [
    ['M', 'pull', P, 'exacte'],
    ['L', 'pull', P, 'voisine'],
    ['XL', 'pull', P, null],
    ['L', 'pull', stricte('haut'), null],
    ['2XL', 'pull', { ...P, haut: { lettre: 'XL', eu: null, mode: 'large' } }, 'voisine'],
    ['M/L', 'sweat', stricte('haut', { lettre: 'L' }), 'exacte'],
    ['40', 'pull', P, null],
    ['W32 L34', 'jean', P, 'exacte'],
    ['W33', 'jean', P, 'voisine'],
    ['42', 'chaussures', P, 'voisine'],
    ['43,5', 'chaussures', P, 'voisine'],
    ['45', 'chaussures', P, null],
    ['', 'pull', P, null],
    ['Taille unique', 'gants', P, 'exacte'],
    ['', 'bonnet', P, 'exacte'],
  ];
  for (const [brute, cat, profil, attendu] of cas) {
    assert.equal(compatibilite(brute, cat, profil), attendu, `${brute} / ${cat}`);
  }
});
