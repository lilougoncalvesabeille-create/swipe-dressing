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

test('le profil haut M / bas W32 / pointure 43 voit un mélange de tailles', async () => {
  const { compatibilite, typeDeTaille } = await import('../js/tailles.js');
  const profil = {
    haut: { lettre: 'M', eu: null, mode: 'large' },
    bas: { lettre: null, eu: null, w: 32, mode: 'large' },
    pointure: { eu: 43, mode: 'large' },
  };
  for (const type of ['haut', 'bas', 'pointure']) {
    const res = json.cartes
      .filter((c) => typeDeTaille(c.categorie) === type)
      .map((c) => compatibilite(c.taille, c.categorie, profil));
    for (const attendu of ['exacte', 'voisine', null]) {
      assert.ok(res.includes(attendu), `${type} : aucune carte ${attendu}`);
    }
  }
});

test('chaque carte de la démo a un rayon ; robes et jupes sont au rayon femme', () => {
  const toutes = [...json.cartes, ...json.echauffement];
  for (const c of toutes) assert.ok(['homme', 'femme', 'mixte'].includes(c.rayon), `${c.id} : rayon ${c.rayon}`);
  for (const c of toutes.filter((x) => x.categorie === 'robe' || x.categorie === 'jupe')) assert.equal(c.rayon, 'femme', c.id);
  for (const r of ['homme', 'femme', 'mixte']) assert.ok(json.cartes.some((c) => c.rayon === r), r);
  // Assez de cartes d'échauffement pour chaque rayon (15 swipes d'échauffement).
  for (const r of ['homme', 'femme']) {
    assert.ok(json.echauffement.filter((c) => c.rayon === r || c.rayon === 'mixte').length >= 15, r);
  }
});
