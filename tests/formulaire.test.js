import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lireNombre, listeMarques, completerProfil, valeursDepuisProfil, lireFormulaire,
  BORNES, CATEGORIES_LISTE,
} from '../js/formulaire.js';
import { profilParDefaut } from '../js/paquet.js';
import { CATEGORIES } from '../js/tailles.js';

test('lireNombre : vide, illisible, bornes et pas', () => {
  assert.equal(lireNombre(''), null);
  assert.equal(lireNombre('   '), null);
  assert.equal(lireNombre('abc'), null);
  assert.equal(lireNombre(undefined), null);
  assert.equal(lireNombre('42'), 42);
  assert.equal(lireNombre(' 42,5 ', BORNES.pointure), 42.5);
  assert.equal(lireNombre('42.3', BORNES.pointure), null);
  assert.equal(lireNombre('41', BORNES.eu), null);
  assert.equal(lireNombre('40', BORNES.eu), 40);
  assert.equal(lireNombre('62', BORNES.eu), null);
  assert.equal(lireNombre('19', BORNES.w), null);
  assert.equal(lireNombre(32, BORNES.w), 32);
});

test('listeMarques : découpe, nettoie et retire les doublons', () => {
  assert.deepEqual(listeMarques(' Nike, , adidas ;Carhartt  WIP,nike '), ['Nike', 'adidas', 'Carhartt WIP']);
  assert.deepEqual(listeMarques(''), []);
  assert.deepEqual(listeMarques(' , ; '), []);
  assert.deepEqual(listeMarques(undefined), []);
});

test('completerProfil : défauts pour un profil absent ou partiel', () => {
  assert.deepEqual(completerProfil(null), profilParDefaut());
  assert.deepEqual(completerProfil('cassé'), profilParDefaut());
  const p = completerProfil({ tailles: { haut: { lettre: 'M' } }, budget: { max: 80 }, questionnaireFait: true });
  assert.equal(p.tailles.haut.lettre, 'M');
  assert.equal(p.tailles.haut.mode, 'large');
  assert.equal(p.tailles.bas.w, null);
  assert.equal(p.tailles.pointure.mode, 'large');
  assert.deepEqual(p.budget, { max: 80, parCategorie: {} });
  assert.equal(p.exploration, 0.18);
  assert.equal(p.questionnaireFait, true);
  assert.deepEqual(p.categories, []);
});

test('lireFormulaire : un questionnaire rempli donne le profil attendu', () => {
  const p = lireFormulaire({
    age: '27', rayon: 'homme',
    'haut-lettre': 'm', 'haut-eu': '', 'haut-mode': 'large',
    'bas-lettre': '', 'bas-eu': '40', 'bas-w': '32', 'bas-mode': 'stricte',
    'pointure-eu': '43', 'pointure-mode': 'large',
    pays: 'BE', region: '  Wallonie ', budget: '60',
    categories: ['pull', 'jean', 'inconnue', 'pull'], 'etat-min': 'tres-bon',
    'marques-preferees': 'Carhartt, Patagonia', 'marques-bannies': 'Shein',
  });
  assert.equal(p.age, 27);
  assert.equal(p.rayon, 'homme');
  assert.deepEqual(p.tailles, {
    haut: { lettre: 'M', eu: null, mode: 'large' },
    bas: { lettre: null, eu: 40, w: 32, mode: 'stricte' },
    pointure: { eu: 43, mode: 'large' },
  });
  assert.equal(p.pays, 'BE');
  assert.equal(p.region, 'Wallonie');
  assert.deepEqual(p.budget, { max: 60, parCategorie: {} });
  assert.deepEqual(p.categories, ['pull', 'jean']);
  assert.equal(p.etatMin, 'tres-bon');
  assert.deepEqual(p.marquesPreferees, ['Carhartt', 'Patagonia']);
  assert.deepEqual(p.marquesBannies, ['Shein']);
  assert.equal(p.exploration, 0.18);
  assert.equal(p.questionnaireFait, false);
});

test('lireFormulaire : valeurs invalides ignorées, base jamais modifiée', () => {
  const base = { ...profilParDefaut(), questionnaireFait: true, budget: { max: 90, parCategorie: { pull: 30 } } };
  const copie = structuredClone(base);
  const p = lireFormulaire({
    age: 'abc', rayon: 'autre', 'haut-mode': 'moyen', pays: 'XX', budget: '0',
    'etat-min': 'cassé', 'haut-eu': '41', 'pointure-eu': '43.2',
  }, base);
  assert.deepEqual(base, copie);
  assert.equal(p.age, null);
  assert.equal(p.rayon, 'les-deux');
  assert.equal(p.tailles.haut.mode, 'large');
  assert.equal(p.tailles.haut.eu, null);
  assert.equal(p.tailles.pointure.eu, null);
  assert.equal(p.pays, 'FR');
  assert.deepEqual(p.budget, { max: 90, parCategorie: { pull: 30 } });
  assert.equal(p.etatMin, 'bon');
  assert.equal(p.questionnaireFait, true);
});

test('lireFormulaire : exploration en pourcentage, bornée entre 0 et 50 %', () => {
  assert.equal(lireFormulaire({ exploration: '25' }).exploration, 0.25);
  assert.equal(lireFormulaire({ exploration: '0' }).exploration, 0);
  assert.equal(lireFormulaire({ exploration: '80' }).exploration, 0.5);
  assert.equal(lireFormulaire({ exploration: '-5' }).exploration, 0);
  assert.equal(lireFormulaire({ exploration: '' }).exploration, 0.18);
  assert.equal(lireFormulaire({}).exploration, 0.18);
});

test('lireFormulaire : une catégorie seule (non liste) est acceptée, vide = toutes', () => {
  assert.deepEqual(lireFormulaire({ categories: 'sac' }).categories, ['sac']);
  assert.deepEqual(lireFormulaire({ categories: [] }).categories, []);
});

test('aller-retour profil → champs → profil', () => {
  const profil = lireFormulaire({
    age: '31', rayon: 'femme', 'haut-lettre': 'S', 'haut-eu': '36', 'haut-mode': 'stricte',
    'bas-lettre': 'M', 'bas-eu': '38', 'bas-w': '28', 'bas-mode': 'large',
    'pointure-eu': '38.5', 'pointure-mode': 'stricte', pays: 'CH', region: 'Vaud',
    budget: '45', categories: ['robe', 'sac'], 'etat-min': 'neuf',
    'marques-preferees': 'Sézane', 'marques-bannies': '', exploration: '30',
  }, { ...profilParDefaut(), questionnaireFait: true });
  assert.deepEqual(lireFormulaire(valeursDepuisProfil(profil), profil), profil);
  assert.deepEqual(lireFormulaire(valeursDepuisProfil(profil)), { ...profil, questionnaireFait: false });
});

test('chaque catégorie connue a un libellé', () => {
  assert.deepEqual(CATEGORIES_LISTE.map((c) => c.valeur), Object.keys(CATEGORIES));
  for (const c of CATEGORIES_LISTE) assert.ok(c.libelle.length > 0);
});
