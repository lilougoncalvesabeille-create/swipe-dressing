import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encoderEmb, empreinteDe, viderCacheEmpreintes } from '../js/empreintes.js';
import {
  swipeValide, nettoyerSwipes, compacterSwipes, vusIds, favoris, historique, empreintes, echauffementFait,
  majDispoFavoris, retirerIds, GARDER_CARTES, GARDER_EMPREINTES,
} from '../js/paquet.js';

// --- Points différés de la phase 1 : swipes, compactage, cache des empreintes ---

const vecteur = (graine, dim = 512) => Array.from({ length: dim }, (_, i) => Math.sin(graine * 7.3 + i * 0.37));
const date = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();

// Carte réaliste d'une annonce Vinted (titre, description, 4 photos, empreinte 512).
function carteVinted(i) {
  return {
    id: `vinted:${1_000_000 + i}`, site: 'vinted', titre: `Pull en laine col roulé taille M numéro ${i}`,
    description: 'Très bon état, porté quelques fois. Laine mérinos, coupe droite, lavage à 30°. Envoi rapide et soigné.',
    prix: 18.5, categorie: 'pull', rayon: 'homme', marque: 'Uniqlo', etat: 'tres-bon', taille: 'M / 38 / 10',
    photo: `https://images1.vinted.net/t/01_00abc_${i}/f800/1732540000.jpeg?s=0123456789abcdef`,
    photos: [0, 1, 2, 3].map((k) => `https://images1.vinted.net/t/0${k}_00abc_${i}/f800/1732540000.jpeg?s=0123456789abcdef`),
    url: `https://www.vinted.fr/items/${1_000_000 + i}-pull-en-laine-col-roule`, dispo: true, vu_le: date(i),
  };
}

function troisMilleSwipes() {
  const swipes = [];
  for (let i = 0; i < 3000; i++) {
    const sens = i % 3 === 0 ? 'droite' : 'gauche';
    swipes.push({
      id: `vinted:${1_000_000 + i}`, sens, raison: sens === 'gauche' ? 'prix' : null, echauffement: i < 15,
      t: date(i), carte: carteVinted(i), emb: encoderEmb(vecteur(i)),
    });
  }
  return swipes;
}

test('compacterSwipes : 3000 swipes en dimension 512 tiennent sous 2 Mo, favoris et vus intacts', () => {
  const swipes = troisMilleSwipes();
  assert.ok(JSON.stringify(swipes).length > 2_000_000, 'le test doit partir d\'un stockage trop gros');
  const compacts = compacterSwipes(swipes);
  const taille = JSON.stringify(compacts).length;
  assert.ok(taille < 2_000_000, `taille ${taille}`);
  assert.deepEqual(vusIds(compacts), vusIds(swipes));
  assert.deepEqual(compacts.map((s) => s.id), swipes.map((s) => s.id));
  assert.equal(echauffementFait(compacts), echauffementFait(swipes));
  // Les favoris gardent leur carte.
  assert.deepEqual(favoris(compacts).map((s) => s.carte), favoris(swipes).map((s) => s.carte));
  // Refus au-delà des 300 plus récents : {id, sens, t, raison} (et la marque d'échauffement).
  assert.deepEqual(compacts[1], { id: swipes[1].id, sens: 'gauche', t: swipes[1].t, raison: 'prix', echauffement: true });
  assert.deepEqual(Object.keys(compacts[100]).sort(), ['id', 'raison', 'sens', 't']);
  // Les 300 plus récents restent entiers ; au-delà de 600 positions, plus d'empreinte.
  const n = compacts.length;
  for (let i = n - GARDER_CARTES; i < n; i++) assert.deepEqual(compacts[i], swipes[i]);
  for (let i = 0; i < n - GARDER_EMPREINTES; i++) assert.equal(compacts[i].emb, undefined);
  assert.ok(compacts[n - GARDER_EMPREINTES].emb);
  // Déjà compact : le même tableau est renvoyé (pas de réécriture inutile).
  assert.equal(compacterSwipes(compacts), compacts);
  const peu = swipes.slice(0, 10);
  assert.equal(compacterSwipes(peu), peu);
});

test('historique et favoris ignorent les swipes sans carte ; empreintes ignore ceux sans empreinte', () => {
  const swipes = [
    { id: 'a', sens: 'gauche', t: date(1), raison: 'prix' },
    { id: 'b', sens: 'droite', t: date(2), distant: true },
    { id: 'c', sens: 'droite', t: date(3), carte: { titre: 'c' }, emb: encoderEmb([1, 0, 0, 0]) },
    { id: 'd', sens: 'droite', t: date(4), carte: { titre: 'd' } },
    { id: 'e', sens: 'droite', t: date(5), carte: { titre: 'e' }, emb: 12 },
  ];
  assert.deepEqual(historique(swipes).map((s) => s.id), ['e', 'd', 'c']);
  assert.deepEqual(favoris(swipes).map((s) => s.id), ['e', 'd', 'c']);
  assert.equal(empreintes(swipes, 'droite').length, 1);
});

test('swipeValide : emb absent accepté, emb non texte refusé', () => {
  const base = { id: 'a', sens: 'droite', t: date(0) };
  assert.equal(swipeValide(base), true);
  assert.equal(swipeValide({ ...base, emb: 'AAE=' }), true);
  for (const emb of [null, 12, {}, ['AA==']]) assert.equal(swipeValide({ ...base, emb }), false);
});

test('nettoyerSwipes : un swipe à l\'empreinte abîmée est gardé sans elle (jamais remontré)', () => {
  const lus = [{ id: 'a', sens: 'droite', t: date(0), carte: {}, emb: 42 }, { id: 'b', sens: 'gauche', t: date(1) }];
  const propres = nettoyerSwipes(lus);
  assert.deepEqual(propres, [{ id: 'a', sens: 'droite', t: date(0), carte: {} }, lus[1]]);
  assert.ok(propres.every(swipeValide));
});

test('cache des empreintes décodées : même vecteur tant que la pile ne change pas', () => {
  viderCacheEmpreintes();
  const b64 = encoderEmb([1, 2, 3, 4]);
  const a = empreinteDe('vinted:1', b64);
  assert.ok(a instanceof Float32Array);
  assert.equal(empreinteDe('vinted:1', b64), a);
  // Même id, autre empreinte : on ne renvoie pas l'ancienne.
  const autre = empreinteDe('vinted:1', encoderEmb([4, 3, 2, 1]));
  assert.notEqual(autre, a);
  viderCacheEmpreintes();
  const b = empreinteDe('vinted:1', b64);
  assert.notEqual(b, a);
  assert.deepEqual(b, a);
  assert.throws(() => empreinteDe('x', '***'));
});

test('majDispoFavoris : annonces-etat.json met à jour « Plus dispo » des favoris', () => {
  const swipes = [
    { id: 'a', sens: 'droite', t: date(1), carte: { titre: 'a', dispo: true } },
    { id: 'b', sens: 'gauche', t: date(2), carte: { titre: 'b', dispo: true } },
    { id: 'c', sens: 'droite', t: date(3), carte: { titre: 'c', dispo: false } },
    { id: 'd', sens: 'droite', t: date(4) },
  ];
  const etats = {
    a: { dispo: false, verifie_le: date(9) }, b: { dispo: false }, c: { dispo: true }, d: { dispo: false }, z: { dispo: false },
  };
  const { swipes: r, modifies } = majDispoFavoris(swipes, etats);
  assert.equal(r[0].carte.dispo, false);
  assert.equal(r[0].carte.titre, 'a');
  assert.equal(r[1], swipes[1]);
  assert.equal(r[2].carte.dispo, true);
  assert.equal(r[3], swipes[3]);
  assert.deepEqual(modifies, ['a', 'c']);
  assert.equal(swipes[0].carte.dispo, true, 'pas de mutation');
  const rien = majDispoFavoris(r, etats);
  assert.equal(rien.swipes, r);
  assert.deepEqual(rien.modifies, []);
  assert.equal(majDispoFavoris(swipes, null).swipes, swipes);
  assert.equal(majDispoFavoris(swipes, { a: { dispo: 'non' } }).swipes, swipes);
});

test('retirerIds : écarte des cartes de la pile (déjà vues avant « Tout effacer »)', () => {
  const pile = { cartes: [{ id: 'a' }, { id: 'b' }], echauffement: [{ id: 'c' }], styles: [], erreurs: [], source: 'pc' };
  const r = retirerIds(pile, new Set(['a', 'c']));
  assert.deepEqual(r.cartes.map((c) => c.id), ['b']);
  assert.deepEqual(r.echauffement, []);
  assert.equal(r.source, 'pc');
  assert.equal(retirerIds(pile, new Set()), pile);
  assert.equal(retirerIds(pile, new Set(['z'])), pile);
});

test('tailles.js n\'utilise pas de lookbehind (iOS Safari < 16.4 refuserait tout le module)', () => {
  assert.doesNotMatch(readFileSync('js/tailles.js', 'utf8'), /\(\?<[!=]/);
});
