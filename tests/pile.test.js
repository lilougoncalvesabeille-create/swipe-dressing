import test from 'node:test';
import assert from 'node:assert/strict';
import { encoderEmb } from '../js/empreintes.js';
import { validerPile, chargerPile } from '../js/pile.js';
import { creerStore } from '../js/store.js';

const emb = encoderEmb([1, 0, 0, 0]);
const carte = (id, extra = {}) => ({
  id, site: 'demo', titre: 'Pull', description: '', prix: 20, categorie: 'pull',
  marque: null, etat: 'bon', taille: 'M', photo: 'https://x/p.jpg', photos: [],
  url: 'https://x/a', vu_le: '2026-01-01T00:00:00Z', emb, ...extra,
});

test('validerPile écarte une carte sans url, sans échouer', () => {
  const sansUrl = carte('demo:2');
  delete sansUrl.url;
  const r = validerPile({ version: 1, styles: [], echauffement: [], cartes: [carte('demo:1'), sansUrl] });
  assert.equal(r.cartes.length, 1);
  assert.equal(r.erreurs.length, 1);
});

test('validerPile décode les styles en Float32Array', () => {
  const r = validerPile({ version: 1, styles: [{ nom: 'streetwear', emb }], cartes: [] });
  assert.equal(r.styles.length, 1);
  assert.equal(r.styles[0].nom, 'streetwear');
  assert.ok(r.styles[0].emb instanceof Float32Array);
});

test('validerPile : dispo absent devient true', () => {
  const r = validerPile({ version: 1, styles: [], cartes: [carte('demo:1')] });
  assert.equal(r.cartes[0].dispo, true);
});

test('validerPile écarte les emb invalides et les prix négatifs sans planter', () => {
  const r = validerPile({
    version: 1,
    styles: [{ nom: 'mauvais', emb: '***' }],
    echauffement: [carte('demo:e', { emb: '***' })],
    cartes: [carte('demo:1', { emb: '***' }), carte('demo:2', { prix: -1 }), carte('demo:3')],
  });
  assert.equal(r.cartes.length, 1);
  assert.equal(r.echauffement.length, 0);
  assert.equal(r.styles.length, 0);
  assert.equal(r.erreurs.length, 4);
});

test('validerPile tolère une entrée non valide', () => {
  const r = validerPile(null);
  assert.deepEqual(r.cartes, []);
  assert.equal(r.erreurs.length, 1);
});

async function avecFetch(faux, fn) {
  const origine = globalThis.fetch;
  globalThis.fetch = faux;
  try {
    await fn();
  } finally {
    globalThis.fetch = origine;
  }
}
const stockageMemoire = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('chargerPile : succès, mémorise le JSON brut sous sd:pile', async () => {
  const store = creerStore(stockageMemoire());
  const json = { version: 1, styles: [], cartes: [carte('demo:1')] };
  await avecFetch(async () => ({ ok: true, json: async () => json }), async () => {
    const r = await chargerPile('x.json', store);
    assert.equal(r.cartes.length, 1);
  });
  assert.deepEqual(store.lire('sd:pile', null), json);
});

test('chargerPile : échec réseau, relit sd:pile', async () => {
  const store = creerStore(stockageMemoire());
  store.ecrire('sd:pile', { version: 1, styles: [], cartes: [carte('demo:9')] });
  await avecFetch(async () => { throw new Error('hors ligne'); }, async () => {
    const r = await chargerPile('x.json', store);
    assert.equal(r.cartes[0].id, 'demo:9');
  });
});

test('chargerPile : échec réseau sans sauvegarde, pile vide avec erreur', async () => {
  const store = creerStore(stockageMemoire());
  await avecFetch(async () => { throw new Error('hors ligne'); }, async () => {
    const r = await chargerPile('x.json', store);
    assert.deepEqual(r.cartes, []);
    assert.ok(r.erreurs.length >= 1);
  });
});

test('validerPile dédoublonne les ids (cartes, échauffement, et entre les deux)', () => {
  const r = validerPile({
    version: 1,
    cartes: [carte('demo:1'), carte('demo:1'), carte('demo:2')],
    echauffement: [carte('demo:3'), carte('demo:3'), carte('demo:2')],
  });
  assert.deepEqual(r.cartes.map((c) => c.id), ['demo:1', 'demo:2']);
  assert.deepEqual(r.echauffement.map((c) => c.id), ['demo:3']);
  assert.equal(r.erreurs.length, 3);
});

const emb8 = encoderEmb([1, 0, 0, 0, 0, 0, 0, 0]);

test('validerPile écarte les empreintes dont la dimension diffère de la majorité', () => {
  const r = validerPile({
    version: 1,
    styles: [{ nom: 'streetwear', emb }, { nom: 'chic', emb: emb8 }],
    echauffement: [carte('demo:e1'), carte('demo:e2', { emb: emb8 })],
    cartes: [carte('demo:1'), carte('demo:2'), carte('demo:3', { emb: emb8 })],
  });
  assert.deepEqual(r.cartes.map((c) => c.id), ['demo:1', 'demo:2']);
  assert.deepEqual(r.echauffement.map((c) => c.id), ['demo:e1']);
  assert.deepEqual(r.styles.map((s) => s.nom), ['streetwear']);
  assert.equal(r.erreurs.length, 3);
  assert.ok(r.erreurs.every((e) => /dimension 8.*attendu 4/.test(e)), r.erreurs.join(' | '));
});

test('validerPile : une carte écartée pour sa dimension ne bloque pas son id', () => {
  const r = validerPile({
    version: 1,
    cartes: [carte('demo:1', { emb: emb8 }), carte('demo:1'), carte('demo:2')],
  });
  assert.deepEqual(r.cartes.map((c) => c.id), ['demo:1', 'demo:2']);
  assert.equal(r.cartes[0].emb, emb);
  assert.equal(r.erreurs.length, 1);
});

test('validerPile : rayon homme/femme/mixte gardé, inconnu mis à null avec un message', () => {
  const r = validerPile({
    version: 1,
    cartes: [
      carte('demo:1', { rayon: 'homme' }), carte('demo:2', { rayon: 'femme' }), carte('demo:3', { rayon: 'mixte' }),
      carte('demo:4'), carte('demo:5', { rayon: 'enfant' }), carte('demo:6', { rayon: null }),
    ],
  });
  assert.deepEqual(r.cartes.map((c) => c.rayon), ['homme', 'femme', 'mixte', undefined, null, null]);
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0], /demo:5.*rayon/);
});

test('validerPile expose la source de la pile', () => {
  assert.equal(validerPile({ version: 1, source: 'pc', cartes: [] }).source, 'pc');
  assert.equal(validerPile({ version: 1, cartes: [] }).source, null);
  assert.equal(validerPile(null).source, null);
});
