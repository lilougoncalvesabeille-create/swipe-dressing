import test from 'node:test';
import assert from 'node:assert/strict';
import { encoderEmb } from '../js/empreintes.js';
import {
  ETATS, profilParDefaut, filtrer, swiper, annuler, repecher, vusIds,
  favoris, historique, empreintes, prochaines,
  RAISONS, SEUIL_ECHAUFFEMENT, ajouterRaison, echauffementFait, garderEnTete,
} from '../js/paquet.js';

const carte = (id, extra = {}) => ({
  id, site: 'demo', titre: `Titre ${id}`, description: '', prix: 20, categorie: 'pull',
  marque: 'Nike', etat: 'bon', taille: 'M', photo: 'https://x/p.jpg', photos: [],
  url: 'https://x/a', dispo: true, vu_le: '2026-01-01T00:00:00Z',
  emb: encoderEmb([1, Number(id.slice(-1)) || 0.5, 0, 0]), ...extra,
});
const profil = () => {
  const p = profilParDefaut();
  p.tailles.haut.lettre = 'M';
  return p;
};
const quatre = () => [carte('d:1'), carte('d:2'), carte('d:3'), carte('d:4')];
const ids = (r) => r.map((e) => e.carte.id);
const t = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));

test('profilParDefaut', () => {
  const p = profilParDefaut();
  assert.equal(p.rayon, 'les-deux');
  assert.equal(p.budget.max, 60);
  assert.equal(p.etatMin, 'bon');
  assert.equal(p.exploration, 0.18);
  assert.equal(p.tailles.bas.w, null);
  assert.deepEqual(ETATS, ['satisfaisant', 'bon', 'tres-bon', 'neuf', 'neuf-etiquette']);
  assert.notEqual(profilParDefaut().tailles, p.tailles);
});

test('jamais deux fois, même si la pile est rechargée', () => {
  const cartes = quatre();
  const swipes = swiper([], cartes[0], 'gauche', { maintenant: t(1) });
  assert.ok(!ids(filtrer(cartes, profil(), vusIds(swipes))).includes('d:1'));
  const rechargee = quatre();
  assert.ok(!ids(filtrer(rechargee, profil(), vusIds(swipes))).includes('d:1'));
  assert.equal(filtrer(rechargee, profil(), vusIds(swipes)).length, 3);
});

test('swiper enregistre le bon format, sans emb dans carte', () => {
  const c = carte('d:1');
  const s = swiper([], c, 'droite', { raison: 'couleur', echauffement: true, maintenant: t(5) });
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'd:1');
  assert.equal(s[0].sens, 'droite');
  assert.equal(s[0].raison, 'couleur');
  assert.equal(s[0].echauffement, true);
  assert.equal(s[0].t, t(5).toISOString());
  assert.equal(s[0].emb, c.emb);
  assert.equal('emb' in s[0].carte, false);
  assert.equal(s[0].carte.titre, c.titre);
  const s2 = swiper(s, carte('d:2'), 'gauche');
  assert.equal(s2[1].raison, null);
  assert.equal(s2[1].echauffement, false);
  assert.equal(s.length, 1);
});

test('annuler fait réapparaître la carte ; annuler([]) renvoie []', () => {
  const cartes = quatre();
  const s = swiper([], cartes[0], 'gauche', { maintenant: t(1) });
  const apres = annuler(s);
  assert.ok(ids(filtrer(cartes, profil(), vusIds(apres))).includes('d:1'));
  assert.deepEqual(annuler([]), []);
});

test('swipes en rafale puis annuler : seule la dernière revient', () => {
  const cartes = quatre();
  let s = swiper([], cartes[0], 'gauche', { maintenant: t(1) });
  s = swiper(s, cartes[1], 'droite', { maintenant: t(2) });
  s = annuler(s);
  const restantes = ids(filtrer(cartes, profil(), vusIds(s)));
  assert.ok(restantes.includes('d:2'));
  assert.ok(!restantes.includes('d:1'));
});

test('repêcher : de historique à favoris', () => {
  const cartes = quatre();
  const s = swiper([], cartes[0], 'gauche', { maintenant: t(1) });
  assert.equal(historique(s).length, 1);
  assert.equal(favoris(s).length, 0);
  const r = repecher(s, 'd:1');
  assert.equal(r[0].sens, 'droite');
  assert.equal(r[0].repeche, true);
  assert.equal(favoris(r).length, 1);
  assert.equal(s[0].sens, 'gauche');
});

test('filtres : chacun écarte la bonne carte', () => {
  const p = profil();
  const base = carte('d:1');
  const garde = (c, prof = p) => ids(filtrer([base, c], prof, new Set()));
  assert.deepEqual(garde(carte('d:2', { prix: 61 })), ['d:1']);
  const bannie = profil();
  bannie.marquesBannies = ['NIKE'];
  assert.deepEqual(
    ids(filtrer([carte('d:2', { marque: 'nike' }), carte('d:3', { marque: 'Adidas' })], bannie, new Set())),
    ['d:3'],
  );
  assert.deepEqual(garde(carte('d:2', { etat: 'satisfaisant' })), ['d:1']);
  assert.deepEqual(garde(carte('d:2', { etat: null })), ['d:1', 'd:2']);
  assert.deepEqual(garde(carte('d:2', { dispo: false })), ['d:1']);
  const pCat = profil();
  pCat.categories = ['pull'];
  assert.deepEqual(garde(carte('d:2', { categorie: 'sac', taille: 'U' })), ['d:1', 'd:2']);
  assert.deepEqual(garde(carte('d:2', { categorie: 'sac', taille: 'U' }), pCat), ['d:1']);
  const pBudget = profil();
  pBudget.budget.parCategorie = { pull: 10 };
  assert.deepEqual(garde(carte('d:2', { prix: 15 }), pBudget), []);
  assert.deepEqual(garde(carte('d:2', { taille: 'XXL' })), ['d:1']);
});

test('changement de mode large/stricte et carte déjà swipée', () => {
  const voisine = carte('d:1', { taille: 'L' });
  const large = profil();
  const r = filtrer([voisine], large, new Set());
  assert.equal(r.length, 1);
  assert.equal(r[0].voisine, true);
  assert.ok(r[0].emb instanceof Float32Array);
  const stricte = profil();
  stricte.tailles.haut.mode = 'stricte';
  assert.equal(filtrer([voisine], stricte, new Set()).length, 0);
  const s = swiper([], voisine, 'gauche', { maintenant: t(1) });
  assert.equal(filtrer([voisine], large, vusIds(s)).length, 0);
  assert.equal(filtrer([voisine], stricte, vusIds(s)).length, 0);
  const exacte = filtrer([carte('d:2')], large, new Set());
  assert.equal(exacte[0].voisine, false);
});

test('pile vide : tout swipé donne []', () => {
  const cartes = quatre();
  let s = [];
  cartes.forEach((c, i) => { s = swiper(s, c, 'gauche', { maintenant: t(i) }); });
  const pile = { cartes, echauffement: [], styles: [] };
  assert.deepEqual(prochaines(pile, profil(), s, () => 0.5), []);
});

test('échauffement puis vraies cartes', () => {
  const chauffe = Array.from({ length: 18 }, (_, i) => carte(`e:${i}`));
  const pile = { cartes: quatre(), echauffement: chauffe, styles: [] };
  const rng = () => 0.3;
  const debut = prochaines(pile, profil(), [], rng);
  assert.equal(debut.length, 18);
  assert.ok(debut.every((e) => e.echauffement === true && e.voisine === false));
  let s = [];
  for (let i = 0; i < 15; i++) s = swiper(s, chauffe[i], 'droite', { echauffement: true, maintenant: t(i) });
  const apres = prochaines(pile, profil(), s, rng);
  assert.equal(apres.length, 4);
  assert.ok(apres.every((e) => e.echauffement === false));
  assert.deepEqual(ids(apres).sort(), ['d:1', 'd:2', 'd:3', 'd:4']);
});

test("échauffement : avec 14 swipes, seules les cartes d'échauffement non vues", () => {
  const chauffe = Array.from({ length: 16 }, (_, i) => carte(`e:${i}`));
  const pile = { cartes: quatre(), echauffement: chauffe, styles: [] };
  let s = [];
  for (let i = 0; i < 14; i++) s = swiper(s, chauffe[i], 'gauche', { echauffement: true, maintenant: t(i) });
  const r = prochaines(pile, profil(), s, () => 0.3);
  assert.deepEqual(ids(r), ['e:14', 'e:15']);
});

test("listes et empreintes : favoris/historique sans échauffement, récents d'abord", () => {
  const cartes = quatre();
  let s = swiper([], cartes[0], 'droite', { echauffement: true, maintenant: t(1) });
  s = swiper(s, cartes[1], 'droite', { maintenant: t(2) });
  s = swiper(s, cartes[2], 'gauche', { maintenant: t(3) });
  s = swiper(s, cartes[3], 'droite', { maintenant: t(4) });
  assert.deepEqual(favoris(s).map((x) => x.id), ['d:4', 'd:2']);
  assert.deepEqual(historique(s).map((x) => x.id), ['d:4', 'd:3', 'd:2']);
  const aimes = empreintes(s, 'droite');
  assert.equal(aimes.length, 3);
  assert.ok(aimes[0] instanceof Float32Array);
  assert.equal(empreintes(s, 'gauche').length, 1);
  assert.deepEqual([...vusIds(s)].sort(), ['d:1', 'd:2', 'd:3', 'd:4']);
});

test('swiper est idempotent : même id deux fois, tableau inchangé', () => {
  const c = carte('d:1');
  const s = swiper([], c, 'gauche', { maintenant: t(1) });
  const s2 = swiper(s, c, 'droite', { maintenant: t(2) });
  assert.equal(s2, s);
  assert.equal(s2.length, 1);
  assert.deepEqual(annuler(s2), []);
});

test('ajouterRaison : sur le dernier refus seulement, sans modifier l\'original', () => {
  assert.deepEqual(RAISONS, ['prix', 'couleur', 'coupe', 'matiere', 'style']);
  const cartes = quatre();
  let s = swiper([], cartes[0], 'gauche', { maintenant: t(1) });
  s = swiper(s, cartes[1], 'gauche', { maintenant: t(2) });
  const avec = ajouterRaison(s, 'd:2', 'couleur');
  assert.notEqual(avec, s);
  assert.equal(avec.length, 2);
  assert.equal(avec[1].raison, 'couleur');
  assert.equal(avec[1].t, s[1].t);
  assert.equal(avec[0], s[0]);
  assert.equal(s[1].raison, null, 'tableau d\'origine inchangé');
  // Changer d'avis remplace la raison.
  assert.equal(ajouterRaison(avec, 'd:2', 'prix')[1].raison, 'prix');
  // Pas le dernier swipe, raison inconnue, même raison : rien ne change.
  assert.equal(ajouterRaison(s, 'd:1', 'couleur'), s);
  assert.equal(ajouterRaison(s, 'd:2', 'odeur'), s);
  assert.equal(ajouterRaison(avec, 'd:2', 'couleur'), avec);
  // Après « annuler », la raison n'atterrit pas sur le swipe précédent.
  assert.equal(ajouterRaison(annuler(s), 'd:2', 'coupe').at(-1).raison, null);
  // Jamais sur un « j'aime », ni sur un tableau vide.
  const aime = swiper([], cartes[2], 'droite', { maintenant: t(3) });
  assert.equal(ajouterRaison(aime, 'd:3', 'prix'), aime);
  assert.deepEqual(ajouterRaison([], 'd:1', 'prix'), []);
});

test('echauffementFait compte les swipes d\'échauffement', () => {
  assert.equal(SEUIL_ECHAUFFEMENT, 15);
  const cartes = quatre();
  let s = swiper([], cartes[0], 'droite', { echauffement: true, maintenant: t(1) });
  s = swiper(s, cartes[1], 'gauche', { echauffement: true, maintenant: t(2) });
  s = swiper(s, cartes[2], 'gauche', { maintenant: t(3) });
  assert.equal(echauffementFait([]), 0);
  assert.equal(echauffementFait(s), 2);
  assert.equal(echauffementFait(annuler(annuler(s))), 1);
});

test('garderEnTete : la carte visible reste devant quand la suite est recalculée', () => {
  const entrees = quatre().map((carte) => ({ carte, voisine: false, echauffement: false }));
  assert.deepEqual(ids(garderEnTete(entrees, 'd:3')), ['d:3', 'd:1', 'd:2', 'd:4']);
  assert.equal(garderEnTete(entrees, 'd:1'), entrees);
  assert.equal(garderEnTete(entrees, 'absente'), entrees);
  assert.equal(garderEnTete(entrees, undefined), entrees);
  assert.deepEqual(garderEnTete([], 'd:1'), []);
  assert.deepEqual(ids(entrees), ['d:1', 'd:2', 'd:3', 'd:4'], 'original inchangé');
});

test('après annuler, la carte annulée peut être remise en tête de prochaines', () => {
  const cartes = quatre();
  const pile = { cartes, echauffement: [], styles: [] };
  let s = swiper([], cartes[2], 'gauche', { maintenant: t(1) });
  s = ajouterRaison(s, 'd:3', 'couleur');
  const dernier = s.at(-1);
  s = annuler(s);
  const suite = garderEnTete(prochaines(pile, profil(), s, () => 0.5), dernier.id);
  assert.equal(suite[0].carte.id, 'd:3');
  assert.equal(suite.length, 4);
});
