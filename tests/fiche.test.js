import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEUIL_PROFIL, formaterPrix, formaterDate, libelleEtat, libelleSite, libelleCategorie,
  libelleTaille, formaterPct, photosDe, urlSure, lignesFiche, profilAAfficher,
} from '../js/fiche.js';
import { RAISONS, LIBELLES_RAISONS } from '../js/paquet.js';

// Intl met des espaces insécables (fines ou non) : on les ramène à des espaces simples.
const espaces = (t) => t.replace(/[  ]/g, ' ');

test('formaterPrix : euros à la française, centimes seulement si besoin', () => {
  assert.equal(espaces(formaterPrix(30)), '30 €');
  assert.equal(espaces(formaterPrix(12.5)), '12,50 €');
  assert.equal(espaces(formaterPrix(1250)), '1 250 €');
  assert.equal(formaterPrix(null), '');
  assert.equal(formaterPrix(Number.NaN), '');
});

test('formaterDate : « 24 nov. 2026 », null si illisible', () => {
  assert.equal(espaces(formaterDate('2026-11-24T12:00:00Z')), '24 nov. 2026');
  assert.equal(espaces(formaterDate('2026-03-05T12:00:00Z')), '5 mars 2026');
  assert.equal(formaterDate('pas une date'), null);
  assert.equal(formaterDate(''), null);
  assert.equal(formaterDate(undefined), null);
});

test('libelleEtat : libellés humains, null pour un état absent ou inconnu', () => {
  assert.equal(libelleEtat('neuf-etiquette'), 'Neuf avec étiquette');
  assert.equal(libelleEtat('neuf'), 'Neuf');
  assert.equal(libelleEtat('tres-bon'), 'Très bon état');
  assert.equal(libelleEtat('bon'), 'Bon état');
  assert.equal(libelleEtat('satisfaisant'), 'Satisfaisant');
  assert.equal(libelleEtat(null), null);
  assert.equal(libelleEtat('abime'), null);
});

test('libelleSite : sites connus, site inconnu avec majuscule', () => {
  assert.equal(libelleSite('vinted'), 'Vinted');
  assert.equal(libelleSite('zalando'), 'Zalando');
  assert.equal(libelleSite('veepee'), 'Veepee');
  assert.equal(libelleSite('emmaus'), 'Label Emmaüs');
  assert.equal(libelleSite('demo'), 'Démo');
  assert.equal(libelleSite('Vinted'), 'Vinted');
  assert.equal(libelleSite('leboncoin'), 'Leboncoin');
  assert.equal(libelleSite(''), null);
  assert.equal(libelleSite(null), null);
});

test('libelleCategorie et libelleTaille', () => {
  assert.equal(libelleCategorie('echarpe'), 'Écharpe');
  assert.equal(libelleCategorie('t-shirt'), 'T-shirt');
  assert.equal(libelleCategorie('inconnue'), 'Inconnue');
  assert.equal(libelleCategorie(null), null);
  assert.equal(libelleTaille('M'), 'Taille M');
  assert.equal(libelleTaille('Taille unique'), 'Taille unique');
  assert.equal(libelleTaille(43), 'Taille 43');
  assert.equal(libelleTaille(''), 'Taille non précisée');
});

test('formaterPct : espace insécable avant %', () => {
  assert.equal(formaterPct(45), '45 %');
});

test('photosDe : photo principale d\'abord, sans doublon ni vide', () => {
  assert.deepEqual(photosDe({ photo: 'a.jpg', photos: ['b.jpg', 'a.jpg', ' ', null, 'c.jpg'] }), ['a.jpg', 'b.jpg', 'c.jpg']);
  assert.deepEqual(photosDe({ photo: 'a.jpg' }), ['a.jpg']);
  assert.deepEqual(photosDe({ photo: '', photos: ['b.jpg'] }), ['b.jpg']);
  assert.deepEqual(photosDe({}), []);
  assert.deepEqual(photosDe(null), []);
});

test('urlSure : seulement http(s)', () => {
  assert.equal(urlSure('https://example.com/annonce/41'), 'https://example.com/annonce/41');
  assert.equal(urlSure('http://example.com/a'), 'http://example.com/a');
  assert.equal(urlSure('javascript:alert(1)'), null);
  assert.equal(urlSure('data:text/html,coucou'), null);
  assert.equal(urlSure('pas une url'), null);
  assert.equal(urlSure(''), null);
  assert.equal(urlSure(undefined), null);
});

test('lignesFiche : ordre fixe, libellés humains, champs vides omis', () => {
  const lignes = lignesFiche({
    taille: 'L', marque: 'Urbanwear', etat: 'tres-bon', categorie: 'sweat', site: 'demo',
    vu_le: '2026-11-24T12:00:00Z',
  });
  assert.deepEqual(lignes.map((l) => [l.cle, l.libelle, espaces(l.valeur)]), [
    ['taille', 'Taille', 'L'],
    ['marque', 'Marque', 'Urbanwear'],
    ['etat', 'État', 'Très bon état'],
    ['categorie', 'Catégorie', 'Sweat'],
    ['site', 'Site', 'Démo'],
    ['vu_le', 'Récoltée le', '24 nov. 2026'],
  ]);
  const courtes = lignesFiche({ taille: '', marque: null, etat: null, categorie: 'jean', site: 'vinted', vu_le: 'x' });
  assert.deepEqual(courtes.map((l) => l.cle), ['categorie', 'site']);
});

test('libellés des raisons de refus : un par raison', () => {
  for (const r of RAISONS) assert.equal(typeof LIBELLES_RAISONS[r], 'string');
  assert.equal(LIBELLES_RAISONS.prix, 'Trop cher');
});

const v = (...xs) => Float32Array.from(xs);
const styles = [{ nom: 'streetwear', emb: v(1, 0) }, { nom: 'chic', emb: v(0, 1) }];

test(`profilAAfficher : moins de ${SEUIL_PROFIL} aimés → trop tôt`, () => {
  assert.equal(SEUIL_PROFIL, 5);
  assert.deepEqual(profilAAfficher([], styles), { etat: 'trop-tot', manque: 5 });
  assert.deepEqual(profilAAfficher([v(1, 0), v(1, 0), v(1, 0), v(0, 1)], styles), { etat: 'trop-tot', manque: 1 });
});

test('profilAAfficher : barres triées, nom avec majuscule, total 100', () => {
  const aimes = [v(1, 0), v(1, 0.1), v(0.9, 0), v(0, 1), v(0.1, 1)];
  const r = profilAAfficher(aimes, styles);
  assert.equal(r.etat, 'barres');
  assert.deepEqual(r.barres, [
    { nom: 'streetwear', pct: 60, libelle: 'Streetwear' },
    { nom: 'chic', pct: 40, libelle: 'Chic' },
  ]);
});

test('profilAAfficher : sans styles connus → indisponible', () => {
  const aimes = [v(1, 0), v(1, 0), v(1, 0), v(1, 0), v(1, 0)];
  assert.deepEqual(profilAAfficher(aimes, []), { etat: 'indisponible' });
  assert.deepEqual(profilAAfficher(aimes, undefined), { etat: 'indisponible' });
});
