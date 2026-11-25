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

// --- Pile vide, source distante (dépôt privé) ---

test('chargerPile : une pile sans carte valide n\'écrase pas sd:pile (la sauvegarde est gardée)', async () => {
  const store = creerStore(stockageMemoire());
  const sauvegarde = { version: 1, source: 'pc', styles: [], cartes: [carte('vinted:1')] };
  store.ecrire('sd:pile', sauvegarde);
  for (const vide of [{ version: 1, cartes: [] }, { version: 1, cartes: [carte('vinted:2', { emb: '***' })] }]) {
    await avecFetch(async () => ({ ok: true, json: async () => vide }), async () => {
      const r = await chargerPile('x.json', store);
      assert.deepEqual(r.cartes.map((c) => c.id), ['vinted:1']);
    });
    assert.deepEqual(store.lire('sd:pile', null), sauvegarde);
  }
});

test('chargerPile : une pile vide sans sauvegarde est rendue telle quelle, sans être enregistrée', async () => {
  const store = creerStore(stockageMemoire());
  await avecFetch(async () => ({ ok: true, json: async () => ({ version: 1, source: 'pc', cartes: [] }) }), async () => {
    const r = await chargerPile('x.json', store);
    assert.deepEqual(r.cartes, []);
    assert.equal(r.source, 'pc');
  });
  assert.equal(store.lire('sd:pile', null), null);
  // Une pile qui n'a que de l'échauffement est bien enregistrée.
  const echauffement = { version: 1, source: 'pc', cartes: [], echauffement: [carte('vinted:e')] };
  await avecFetch(async () => ({ ok: true, json: async () => echauffement }), () => chargerPile('x.json', store));
  assert.deepEqual(store.lire('sd:pile', null), echauffement);
});

test('chargerPile : source fonction (dépôt privé), repli sur sd:pile mais jamais sur la démo', async () => {
  const store = creerStore(stockageMemoire());
  const pc = { version: 1, source: 'pc', genere_le: '2026-11-25T10:00:00Z', cartes: [carte('vinted:1')] };
  const r = await chargerPile(async () => pc, store, { sansDemo: true });
  assert.equal(r.cartes[0].id, 'vinted:1');
  assert.equal(r.genere_le, '2026-11-25T10:00:00Z');
  assert.deepEqual(store.lire('sd:pile', null), pc);
  const horsLigne = async () => { throw new Error('GitHub injoignable'); };
  assert.equal((await chargerPile(horsLigne, store, { sansDemo: true })).cartes[0].id, 'vinted:1');
  store.ecrire('sd:pile', { version: 1, source: 'demo', cartes: [carte('demo:1')] });
  const r2 = await chargerPile(horsLigne, store, { sansDemo: true });
  assert.deepEqual(r2.cartes, []);
  assert.match(r2.erreurs[0], /GitHub injoignable/);
  // Une pile de démo reçue n'est pas non plus acceptée en mode dépôt privé.
  const r3 = await chargerPile(async () => ({ version: 1, source: 'demo', cartes: [carte('demo:1')] }), store, { sansDemo: true });
  assert.deepEqual(r3.cartes, []);
});
