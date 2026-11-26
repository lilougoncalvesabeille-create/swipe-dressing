import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimerTailles, resumeEstimation, gabaritDe, completerProfil, valeursDepuisProfil, lireFormulaire,
} from '../js/formulaire.js';
import { profilParDefaut } from '../js/paquet.js';
import { versProfilJson } from '../js/synchro.js';
import { compatibilite } from '../js/tailles.js';

test('estimerTailles : homme moyen', () => {
  const e = estimerTailles({ gabarit: 'homme', tailleCm: '178', poidsKg: '72' });
  assert.deepEqual(e.haut, { lettre: 'M', eu: 48 });
  assert.deepEqual(e.bas, { lettre: 'M', eu: 40, w: 32 });
  assert.equal(e.pointure.mesuree, false);
  assert.ok(e.pointure.eu >= 42 && e.pointure.eu <= 43.5, String(e.pointure.eu));
});

test('estimerTailles : femme moyenne, pied mesuré', () => {
  const e = estimerTailles({ gabarit: 'femme', tailleCm: 165, poidsKg: 58, piedCm: '24,5' });
  assert.deepEqual(e.haut, { lettre: 'S', eu: 36 });
  assert.deepEqual(e.bas, { lettre: 'S', eu: 36, w: 27 });
  assert.deepEqual(e.pointure, { eu: 39, mesuree: true });
});

test('estimerTailles : grande taille monte d’un cran, bornes XXS / XXXL', () => {
  assert.equal(estimerTailles({ gabarit: 'homme', tailleCm: 192, poidsKg: 72 }).haut.lettre, 'L');
  assert.equal(estimerTailles({ gabarit: 'homme', tailleCm: 195, poidsKg: 140 }).haut.lettre, 'XXXL');
  assert.equal(estimerTailles({ gabarit: 'femme', tailleCm: 150, poidsKg: 40 }).haut.lettre, 'XXS');
});

test('estimerTailles : gabarit inconnu = homme ; données manquantes ou hors bornes', () => {
  assert.deepEqual(estimerTailles({ tailleCm: 178, poidsKg: 72 }).haut,
    estimerTailles({ gabarit: 'homme', tailleCm: 178, poidsKg: 72 }).haut);
  const sansPoids = estimerTailles({ gabarit: 'homme', tailleCm: 178 });
  assert.equal(sansPoids.haut, null);
  assert.equal(sansPoids.bas, null);
  assert.ok(sansPoids.pointure);
  assert.deepEqual(estimerTailles({}), { haut: null, bas: null, pointure: null });
  assert.deepEqual(estimerTailles({ tailleCm: 'abc', poidsKg: 999 }), { haut: null, bas: null, pointure: null });
  assert.deepEqual(estimerTailles(), { haut: null, bas: null, pointure: null });
});

test('estimerTailles : les tailles estimées sont lues par compatibilite', () => {
  const e = estimerTailles({ gabarit: 'homme', tailleCm: 178, poidsKg: 72, piedCm: 27 });
  const tailles = {
    haut: { ...e.haut, mode: 'large' }, bas: { ...e.bas, mode: 'large' },
    pointure: { eu: e.pointure.eu, mode: 'large' },
  };
  assert.equal(compatibilite('M', 'pull', tailles), 'exacte');
  assert.equal(compatibilite('W32', 'jean', tailles), 'exacte');
  assert.equal(compatibilite(String(e.pointure.eu), 'chaussures', tailles), 'exacte');
});

test('resumeEstimation', () => {
  assert.equal(resumeEstimation({ haut: null, bas: null, pointure: null }), null);
  assert.equal(resumeEstimation(), null);
  const texte = resumeEstimation(estimerTailles({ gabarit: 'femme', tailleCm: 165, poidsKg: 58, piedCm: 24.5 }));
  assert.match(texte, /haut S \(EU 36\)/);
  assert.match(texte, /bas S \(EU 36, W27\)/);
  assert.match(texte, /pointure 39[^,]/);
  assert.match(texte, /Mode large/);
  assert.match(resumeEstimation(estimerTailles({ tailleCm: 170 })), /d’après ta taille/);
});

test('mensurations : défaut, nettoyage, aller-retour formulaire', () => {
  assert.deepEqual(profilParDefaut().mensurations,
    { gabarit: null, tailleCm: null, poidsKg: null, piedCm: null });
  const sale = completerProfil({ mensurations: { gabarit: 'x', tailleCm: 999, poidsKg: '70', piedCm: 26.5 } });
  assert.deepEqual(sale.mensurations, { gabarit: null, tailleCm: null, poidsKg: null, piedCm: 26.5 });
  assert.deepEqual(completerProfil({}).mensurations, profilParDefaut().mensurations);

  const p = lireFormulaire({ 'mens-gabarit': 'femme', 'mens-taille': '165', 'mens-poids': '58', 'mens-pied': '' });
  assert.deepEqual(p.mensurations, { gabarit: 'femme', tailleCm: 165, poidsKg: 58, piedCm: null });
  // Gabarit égal à celui du rayon : non retenu (il suivra le rayon s'il change).
  const suit = lireFormulaire({ rayon: 'femme', 'mens-gabarit': 'femme' });
  assert.equal(suit.mensurations.gabarit, null);
  assert.equal(lireFormulaire({ rayon: 'femme', 'mens-gabarit': 'homme' }).mensurations.gabarit, 'homme');
  const v = valeursDepuisProfil(p);
  assert.equal(v['mens-gabarit'], 'femme');
  assert.equal(v['mens-taille'], '165');
  assert.equal(v['mens-pied'], '');
});

test('gabaritDe : choisi, sinon d’après le rayon', () => {
  assert.equal(gabaritDe({ rayon: 'femme', mensurations: { gabarit: 'homme' } }), 'homme');
  assert.equal(gabaritDe({ rayon: 'femme' }), 'femme');
  assert.equal(gabaritDe({ rayon: 'les-deux' }), 'homme');
  assert.equal(gabaritDe(null), 'homme');
});

test('versProfilJson envoie tout le profil, mensurations comprises (partagées entre appareils)', () => {
  const profil = { ...profilParDefaut(), mensurations: { gabarit: 'homme', tailleCm: 180, poidsKg: 80, piedCm: 27 } };
  const json = versProfilJson(profil, '2026-11-26T08:00:00Z');
  assert.deepEqual(json, { version: 1, profil, modifie_le: '2026-11-26T08:00:00Z' });
});
