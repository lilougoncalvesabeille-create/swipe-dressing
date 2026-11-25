// Cas partagés avec le récolteur Python (tests/cas/*.json) : mêmes entrées, mêmes sorties.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compatibilite } from '../js/tailles.js';
import { encoderEmb, scoreFinal } from '../js/empreintes.js';
import { proche } from './aide.js';

const lire = (nom) => JSON.parse(readFileSync(new URL(`./cas/${nom}`, import.meta.url), 'utf8'));

test('tailles-cas : compatibilite', () => {
  const cas = lire('tailles-cas.json');
  assert.ok(cas.length >= 40);
  for (const { brute, categorie, profil, attendu } of cas) {
    assert.equal(compatibilite(brute, categorie, profil), attendu, `${JSON.stringify(brute)} / ${categorie}`);
  }
});

test('emb-cas : encoderEmb', () => {
  const cas = lire('emb-cas.json');
  assert.equal(cas.length, 6);
  for (const { vecteur, b64 } of cas) {
    assert.equal(encoderEmb(vecteur), b64, `dimension ${vecteur.length}`);
  }
});

test('score-cas : scoreFinal', () => {
  const cas = lire('score-cas.json');
  assert.equal(cas.length, 6);
  for (const { emb, aimes, refuses, voisine, score } of cas) {
    proche(scoreFinal({ emb, voisine }, aimes, refuses), score, 1e-9);
  }
});
