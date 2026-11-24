import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proche } from './aide.js';
import {
  encoderEmb, decoderEmb, cosinus, scoreCarte, scoreFinal, reclasser, profilStyle,
} from '../js/empreintes.js';

const A = Float32Array.from([1, 0, 0, 0]);
const B = Float32Array.from([0, 1, 0, 0]);
const C = Float32Array.from([0.9, 0.1, 0, 0]);
const D = Float32Array.from([0, 0.9, 0.1, 0]);

function normalise(v) {
  const n = Math.hypot(...v);
  return Float32Array.from(v, (x) => x / n);
}

const entree = (id, v, voisine = false) => ({ carte: { id }, emb: normalise(v), voisine });
const ids = (entrees) => entrees.map((e) => e.carte.id);

test('encoder puis décoder conserve la direction du vecteur', () => {
  proche(cosinus(decoderEmb(encoderEmb(C)), normalise(C)), 1, 0.01);
});

test('un vecteur de dimension 512 tient en moins de 700 caractères', () => {
  const v = Array.from({ length: 512 }, (_, i) => Math.sin(i));
  assert.ok(encoderEmb(v).length < 700);
});

test('scoreCarte : plus proche des aimés = meilleur score', () => {
  assert.ok(scoreCarte(C, [A], []) > scoreCarte(D, [A], []));
});

test('scoreCarte : un refus proche baisse le score', () => {
  assert.ok(scoreCarte(C, [A], [A]) < scoreCarte(C, [A], []));
});

test('scoreCarte : 0 sans aimés', () => {
  assert.equal(scoreCarte(C, [], []), 0);
});

test('scoreFinal retire 0,05 pour une voisine', () => {
  proche(scoreFinal({ emb: C, voisine: true }, [A], []), scoreCarte(C, [A], []) - 0.05);
});

test('reclasser sans exploration trie par score décroissant', () => {
  const entrees = [entree('D', D), entree('C', C)];
  assert.deepEqual(ids(reclasser(entrees, [A], [], 0, () => 0)), ['C', 'D']);
});

test('reclasser conserve les mêmes objets et le drapeau voisine', () => {
  const c = entree('C', C, true);
  const d = entree('D', D);
  const res = reclasser([d, c], [A], [], 0, () => 0);
  assert.equal(res[0], c);
  assert.equal(res[0].voisine, true);
});

test('reclasser avec exploration 1 et rng = 0 prend dans la moitié basse', () => {
  const entrees = [
    entree('z', [0, 1, 0, 0]),
    entree('y', [0.5, 0.87, 0, 0]),
    entree('x', [0.8, 0.6, 0, 0]),
    entree('w', [1, 0, 0, 0]),
  ];
  assert.equal(reclasser(entrees, [A], [], 1, () => 0)[0].carte.id, 'y');
});

test('reclasser sans aimés renvoie une permutation', () => {
  const entrees = ['a', 'b', 'c', 'd', 'e'].map((id) => entree(id, [1, 0, 0, 0]));
  const res = reclasser(entrees, [], [], 0.5, () => 0.3);
  assert.equal(res.length, 5);
  assert.deepEqual(ids(res).sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('profilStyle : pourcentages par style le plus proche', () => {
  const styles = [{ nom: 'a', emb: A }, { nom: 'b', emb: B }];
  assert.deepEqual(profilStyle([A, A, C, B], styles), [
    { nom: 'a', pct: 75 },
    { nom: 'b', pct: 25 },
  ]);
});

test('profilStyle : somme de 100 (plus fort reste) et styles à 0 omis', () => {
  const styles = [{ nom: 'a', emb: A }, { nom: 'b', emb: B }, { nom: 'c', emb: Float32Array.from([0, 0, 1, 0]) }];
  const res = profilStyle([A, B, A], styles);
  assert.deepEqual(res, [{ nom: 'a', pct: 67 }, { nom: 'b', pct: 33 }]);
  assert.equal(res.reduce((s, r) => s + r.pct, 0), 100);
});

test('profilStyle sans aimés renvoie []', () => {
  assert.deepEqual(profilStyle([], [{ nom: 'a', emb: A }]), []);
});
