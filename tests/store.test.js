import test from 'node:test';
import assert from 'node:assert/strict';
import { creerStore } from '../js/store.js';

test("aller-retour d'un objet avec un stockage sain", () => {
  const m = new Map();
  const store = creerStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  assert.equal(store.ecrire('a', { x: [1, 2] }), true);
  assert.deepEqual(store.lire('a'), { x: [1, 2] });
  assert.equal(store.lire('absent', 'defaut'), 'defaut');
  assert.equal(store.persistant, true);
});

test('setItem qui lève : ecrire renvoie false, non persistant, lecture en mémoire', () => {
  const store = creerStore({
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
  });
  assert.equal(store.ecrire('a', 42), false);
  assert.equal(store.persistant, false);
  assert.equal(store.lire('a'), 42);
});

test('getItem qui lève : bascule en mémoire', () => {
  const store = creerStore({ getItem: () => { throw new Error('bloqué'); }, setItem: () => {} });
  assert.equal(store.lire('a', 'd'), 'd');
  assert.equal(store.persistant, false);
  store.ecrire('a', 1);
  assert.equal(store.lire('a'), 1);
});

test('stockage absent : mémoire', () => {
  const store = creerStore(null);
  assert.equal(store.persistant, false);
  assert.equal(store.ecrire('k', 'v'), false);
  assert.equal(store.lire('k'), 'v');
});

test('JSON corrompu : renvoie le défaut', () => {
  const store = creerStore({ getItem: () => '{pas du json', setItem: () => {} });
  assert.equal(store.lire('a', 'd'), 'd');
});

test('repli mémoire : les données déjà persistées restent lisibles', () => {
  const m = new Map([['sd:swipes', JSON.stringify([{ id: 'a' }])]]);
  const store = creerStore({
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > 100) throw new Error('quota');
      m.set(k, v);
    },
  });
  assert.equal(store.ecrire('sd:pile', { gros: 'x'.repeat(200) }), false);
  assert.equal(store.persistant, false);
  assert.deepEqual(store.lire('sd:swipes', []), [{ id: 'a' }]);
  assert.equal(store.lire('sd:pile').gros.length, 200);
});

function stockageAvecQuota(limite) {
  const m = new Map();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limite) throw new Error('quota');
      m.set(k, v);
    },
  };
}

test("une écriture refusée n'empêche pas les petites écritures suivantes", () => {
  const faux = stockageAvecQuota(100);
  const store = creerStore(faux);
  assert.equal(store.ecrire('sd:pile', { gros: 'x'.repeat(200) }), false);
  assert.equal(store.persistant, false);
  assert.equal(store.ecrire('sd:swipes', [{ id: 'a' }]), true);
  assert.deepEqual(JSON.parse(faux.getItem('sd:swipes')), [{ id: 'a' }]);
});

test("écriture refusée puis réussie sur la même clé : lire renvoie la nouvelle valeur", () => {
  const store = creerStore(stockageAvecQuota(100));
  assert.equal(store.ecrire('k', 'x'.repeat(200)), false);
  assert.equal(store.ecrire('k', 'petit'), true);
  assert.equal(store.lire('k'), 'petit');
});

test('méthodes détachées : lire et ecrire fonctionnent sans this', () => {
  const { ecrire, lire } = creerStore(stockageAvecQuota(100));
  assert.equal(ecrire('a', 1), true);
  assert.equal(lire('a'), 1);
  assert.equal(ecrire('b', 'x'.repeat(200)), false);
  assert.equal(lire('b').length, 200);
});
