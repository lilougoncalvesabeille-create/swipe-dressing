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
