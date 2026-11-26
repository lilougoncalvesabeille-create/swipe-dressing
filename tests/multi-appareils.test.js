import test from 'node:test';
import assert from 'node:assert/strict';
import {
  versSwipesJson, fusionnerDistant, importerDistants, profilDistantAAdopter, lienAvecCle, cleDuFragment,
  depuisSwipesJson, swipesApresRemise, remiseDistanteNouvelle, REFUS_AVEC_CARTE,
} from '../js/synchro.js';

const carte = (id, extra = {}) => ({ id, titre: `Annonce ${id}`, prix: 20, photo: 'https://images1.vinted.net/x.webp', ...extra });
const favori = (id, t = '2026-11-26T10:00:00Z') => ({ id, sens: 'droite', t, raison: null, carte: carte(id), emb: 'QUJD' });
const refus = (id, t = '2026-11-26T10:00:00Z') => ({ id, sens: 'gauche', t, raison: null, carte: carte(id), emb: 'QUJD' });

test('swipes.json : favoris et refus voyagent avec leur carte, sans empreinte', () => {
  const objet = versSwipesJson([favori('vinted:1'), refus('vinted:2')]);
  const [f, r] = objet.swipes;
  assert.deepEqual(f.carte, carte('vinted:1'));
  assert.equal('emb' in f, false);
  assert.equal(JSON.stringify(objet).includes('QUJD'), false);
  assert.deepEqual(r.carte, carte('vinted:2'));
});

test('swipes.json : carte d’une autre annonce ou carte avec empreinte', () => {
  const autre = { ...favori('vinted:1'), carte: carte('vinted:9') };
  assert.equal('carte' in versSwipesJson([autre]).swipes[0], false);
  const avecEmb = { ...favori('vinted:1'), carte: { ...carte('vinted:1'), emb: 'QUJD' } };
  assert.equal('emb' in versSwipesJson([avecEmb]).swipes[0].carte, false);
});

test('fusion : la carte est gardée quand le gagnant n’en a pas', () => {
  const local = versSwipesJson([favori('vinted:1')]);
  const distantSansCarte = { version: 1, swipes: [{ id: 'vinted:1', sens: 'droite', t: '2026-11-26T10:00:00Z' }], annules: [], remis_a_zero: null, echauffement_faits: 0 };
  assert.deepEqual(fusionnerDistant(distantSansCarte, local).swipes[0].carte, carte('vinted:1'));
  assert.deepEqual(fusionnerDistant(local, distantSansCarte).swipes[0].carte, carte('vinted:1'));
  // Repêché ailleurs plus tard (sans carte) : le repêchage gagne et récupère la carte.
  const repeche = { ...distantSansCarte, swipes: [{ id: 'vinted:1', sens: 'droite', t: '2026-11-26T10:00:00Z', repeche_le: '2026-11-26T12:00:00Z' }] };
  const fus = fusionnerDistant(local, repeche).swipes[0];
  assert.equal(fus.repeche_le, '2026-11-26T12:00:00Z');
  assert.deepEqual(fus.carte, carte('vinted:1'));
});

test('import : favoris d’un autre appareil avec carte ; carte manquante complétée ; repêchage', () => {
  const ailleurs = versSwipesJson([favori('vinted:1'), refus('vinted:2'), favori('vinted:3')]);
  // Ce téléphone connaît déjà vinted:3, sans carte (importé avant que les cartes ne voyagent).
  const ici = [{ id: 'vinted:3', sens: 'droite', t: '2026-11-26T10:00:00Z', distant: true }];
  const res = importerDistants(ici, ailleurs);
  const parId = Object.fromEntries(res.map((s) => [s.id, s]));
  assert.deepEqual(parId['vinted:1'].carte, carte('vinted:1'));
  assert.equal(parId['vinted:1'].distant, true);
  assert.deepEqual(parId['vinted:2'].carte, carte('vinted:2'));
  assert.deepEqual(parId['vinted:3'].carte, carte('vinted:3'));
  assert.equal(res.at(-1).id, 'vinted:3'); // les swipes d'ici restent en dernier (« annuler »)

  // Refusé ici, repêché ailleurs ensuite : devient un favori ici.
  const refuseIci = [refus('vinted:5', '2026-11-26T09:00:00Z')];
  const repecheAilleurs = { version: 1, swipes: [{ id: 'vinted:5', sens: 'droite', t: '2026-11-26T09:00:00Z', repeche_le: '2026-11-26T11:00:00Z' }], annules: [], remis_a_zero: null, echauffement_faits: 0 };
  const apres = importerDistants(refuseIci, repecheAilleurs)[0];
  assert.equal(apres.sens, 'droite');
  assert.equal(apres.repeche_le, '2026-11-26T11:00:00Z');
  assert.deepEqual(apres.carte, carte('vinted:5'));

  // Rien de nouveau : même tableau.
  const deja = [favori('vinted:1')];
  assert.equal(importerDistants(deja, versSwipesJson(deja)), deja);
});

test('lecture tolérante : carte mal formée ignorée', () => {
  const lu = depuisSwipesJson({ swipes: [{ id: 'vinted:1', sens: 'droite', t: '2026-11-26T10:00:00Z', carte: 'cassée' }] });
  assert.equal('carte' in lu.swipes[0], false);
});

test('profilDistantAAdopter', () => {
  const distant = { version: 1, profil: { rayon: 'homme', questionnaireFait: true }, modifie_le: '2026-11-26T18:46:00Z' };
  assert.equal(profilDistantAAdopter(null), 'absent');
  assert.equal(profilDistantAAdopter({ profil: 'x' }), 'absent');
  assert.deepEqual(profilDistantAAdopter(distant, null), { profil: distant.profil, modifieLe: distant.modifie_le });
  assert.deepEqual(profilDistantAAdopter(distant, '2026-11-26T10:00:00Z').modifieLe, distant.modifie_le);
  assert.equal(profilDistantAAdopter(distant, '2026-11-26T18:46:00Z'), null);
  assert.equal(profilDistantAAdopter(distant, '2026-11-27T00:00:00Z'), null);
});

test('lien avec la clé : aller-retour, fragment seulement', () => {
  const cle = 'github_pat_11ABC_def+/=';
  const lien = lienAvecCle('https://exemple.github.io/swipe-dressing/?x=1#ancien', cle);
  assert.equal(lien.split('#').length, 2);
  assert.ok(lien.startsWith('https://exemple.github.io/swipe-dressing/?x=1#cle='));
  assert.equal(new URL(lien).search, '?x=1'); // la clé n'est pas dans la partie envoyée au serveur
  assert.equal(cleDuFragment(new URL(lien).hash), cle);
  assert.equal(cleDuFragment(''), null);
  assert.equal(cleDuFragment('#autre=1'), null);
  assert.equal(cleDuFragment('#cle='), null);
  assert.equal(cleDuFragment('#cle=%E0%A4%A'), null);
  assert.equal(cleDuFragment('#cle=a%20b'), null);
});

test('carte de favori : pas pour l’échauffement ; allégée (dispo, vu_le, description, photos)', () => {
  const echauffe = { ...favori('vinted:7'), echauffement: true };
  assert.equal('carte' in versSwipesJson([echauffe]).swipes[0], false);
  const lourde = {
    ...favori('vinted:8'),
    carte: carte('vinted:8', {
      dispo: false, vu_le: '2026-11-26T08:00:00Z', description: 'x'.repeat(800),
      photos: ['a', 'b', 'c', 'd', 'e'],
    }),
  };
  const c = versSwipesJson([lourde]).swipes[0].carte;
  assert.equal('dispo' in c, false);
  assert.equal('vu_le' in c, false);
  assert.equal(c.description.length, 500);
  assert.ok(c.description.endsWith('…'));
  assert.deepEqual(c.photos, ['a', 'b', 'c']);
  assert.equal(lourde.carte.photos.length, 5); // la carte d'origine n'est pas modifiée
});

test('remise à zéro venue d’un autre appareil', () => {
  const swipes = [
    favori('vinted:1', '2026-11-26T09:00:00Z'),
    { ...refus('vinted:2', '2026-11-26T09:00:00Z'), sens: 'droite', repeche_le: '2026-11-26T13:00:00Z' },
    favori('vinted:3', '2026-11-26T14:00:00Z'),
  ];
  const { gardes, retires } = swipesApresRemise(swipes, '2026-11-26T12:00:00Z');
  assert.deepEqual(retires.map((s) => s.id), ['vinted:1']);
  assert.deepEqual(gardes.map((s) => s.id), ['vinted:2', 'vinted:3']);
  const rien = swipesApresRemise(swipes, '2026-11-26T08:00:00Z');
  assert.equal(rien.gardes, swipes);
  assert.equal(swipesApresRemise(swipes, null).gardes, swipes);

  assert.equal(remiseDistanteNouvelle('2026-11-26T12:00:00Z', null), true);
  assert.equal(remiseDistanteNouvelle('2026-11-26T12:00:00Z', '2026-11-26T12:00:00Z'), false);
  assert.equal(remiseDistanteNouvelle(null, '2026-11-26T12:00:00Z'), false);
  assert.equal(remiseDistanteNouvelle(null, null), false);
});

test('tout est partagé : échauffement, historique récent, cartes des vieux refus bornées', () => {
  // L'échauffement voyage (marque), sans carte ; il reste caché des Favoris sur l'autre appareil.
  const echauffe = { ...favori('vinted:7'), echauffement: true };
  const objet = versSwipesJson([echauffe]);
  assert.equal(objet.swipes[0].echauffement, true);
  const importe = importerDistants([], objet)[0];
  assert.equal(importe.echauffement, true);
  assert.equal(importe.carte, undefined);

  // Marque d'échauffement connue d'un seul côté : gardée par la fusion et reprise à l'import.
  const sansMarque = { version: 1, swipes: [{ id: 'vinted:7', sens: 'droite', t: '2026-11-26T10:00:00Z' }], annules: [], remis_a_zero: null, echauffement_faits: 0 };
  assert.equal(fusionnerDistant(sansMarque, objet).swipes[0].echauffement, true);
  assert.equal(fusionnerDistant(objet, sansMarque).swipes[0].echauffement, true);
  const ici = [{ id: 'vinted:7', sens: 'droite', t: '2026-11-26T10:00:00Z', distant: true, carte: carte('vinted:7') }];
  assert.equal(importerDistants(ici, objet)[0].echauffement, true);

  // Carte de refus allégée (1 photo, description courte).
  const refusLourd = { ...refus('vinted:8'), carte: carte('vinted:8', { description: 'y'.repeat(400), photos: ['a', 'b'] }) };
  const c = versSwipesJson([refusLourd]).swipes[0].carte;
  assert.equal(c.description.length, 200);
  assert.deepEqual(c.photos, ['a']);

  // Au-delà de REFUS_AVEC_CARTE refus, les plus vieux perdent leur carte dans le dépôt.
  const beaucoup = Array.from({ length: REFUS_AVEC_CARTE + 5 }, (_, i) =>
    refus(`vinted:${1000 + i}`, new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString()));
  const fus = fusionnerDistant(versSwipesJson(beaucoup), null).swipes;
  assert.equal(fus.filter((s) => s.carte).length, REFUS_AVEC_CARTE);
  assert.equal(fus[0].carte, undefined);
  assert.ok(fus.at(-1).carte);
  // Stable : refusionner ne change rien (pas d'écriture en boucle).
  const deux = fusionnerDistant(fusionnerDistant(versSwipesJson(beaucoup), null), null);
  assert.deepEqual(deux, fusionnerDistant(versSwipesJson(beaucoup), null));
});
