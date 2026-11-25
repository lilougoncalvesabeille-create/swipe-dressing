// Paquet de cartes : filtres du profil, swipes (jamais deux fois), annuler, repêcher.
// Module pur (sans DOM) : tout est fonction des données reçues, aucun état caché.

import { compatibilite } from './tailles.js';
import { decoderEmb, reclasser } from './empreintes.js';

export const ETATS = ['satisfaisant', 'bon', 'tres-bon', 'neuf', 'neuf-etiquette'];

export const SEUIL_ECHAUFFEMENT = 15;

// Raisons de refus, dans l'ordre d'affichage des puces.
export const RAISONS = ['prix', 'couleur', 'coupe', 'matiere', 'style'];

export const LIBELLES_RAISONS = {
  prix: 'Trop cher',
  couleur: 'Couleur',
  coupe: 'Coupe',
  matiere: 'Matière',
  style: 'Pas mon style',
};

export function profilParDefaut() {
  return {
    age: null,
    rayon: 'les-deux',
    tailles: {
      haut: { lettre: null, eu: null, mode: 'large' },
      bas: { lettre: null, eu: null, w: null, mode: 'large' },
      pointure: { eu: null, mode: 'large' },
    },
    pays: 'FR',
    region: '',
    budget: { max: 60, parCategorie: {} },
    categories: [],
    etatMin: 'bon',
    marquesPreferees: [],
    marquesBannies: [],
    exploration: 0.18,
    questionnaireFait: false,
  };
}

// Une carte est montrée si le profil prend les deux rayons, si la carte est mixte ou sans rayon,
// ou si son rayon est celui du profil.
export function rayonCompatible(carte, profil) {
  if (profil.rayon !== 'homme' && profil.rayon !== 'femme') return true;
  return !carte.rayon || carte.rayon === 'mixte' || carte.rayon === profil.rayon;
}

export function filtrer(cartes, profil, vus) {
  const bannies = new Set((profil.marquesBannies ?? []).map((m) => String(m).toLowerCase()));
  const rangMin = ETATS.indexOf(profil.etatMin);
  const resultat = [];
  for (const carte of cartes) {
    if (vus.has(carte.id)) continue;
    if (carte.dispo === false) continue;
    if (!rayonCompatible(carte, profil)) continue;
    const plafond = profil.budget.parCategorie?.[carte.categorie] ?? profil.budget.max;
    if (!(carte.prix <= plafond)) continue;
    if (carte.marque && bannies.has(String(carte.marque).toLowerCase())) continue;
    if (carte.etat != null && rangMin >= 0 && ETATS.indexOf(carte.etat) < rangMin) continue;
    if (profil.categories.length > 0 && !profil.categories.includes(carte.categorie)) continue;
    const compat = compatibilite(carte.taille, carte.categorie, profil.tailles);
    if (compat === null) continue;
    let emb;
    try {
      emb = decoderEmb(carte.emb);
    } catch {
      continue;
    }
    resultat.push({ carte, emb, voisine: compat === 'voisine' });
  }
  return resultat;
}

export function swiper(swipes, carte, sens, { raison, echauffement, maintenant = new Date() } = {}) {
  if (swipes.some((s) => s.id === carte.id)) return swipes;
  const { emb, ...sansEmb } = carte;
  return [
    ...swipes,
    {
      id: carte.id,
      sens,
      raison: raison ?? null,
      echauffement: !!echauffement,
      t: maintenant.toISOString(),
      carte: sansEmb,
      emb,
    },
  ];
}

// Note la raison d'un refus sur le dernier swipe, seulement s'il s'agit bien de la carte `id`
// refusée (sinon, par exemple après un « annuler », le tableau est renvoyé tel quel).
export function ajouterRaison(swipes, id, raison) {
  const dernier = swipes.at(-1);
  if (!dernier || dernier.id !== id || dernier.sens !== 'gauche') return swipes;
  if (!RAISONS.includes(raison) || dernier.raison === raison) return swipes;
  return [...swipes.slice(0, -1), { ...dernier, raison }];
}

export function annuler(swipes) {
  return swipes.slice(0, -1);
}

// La carte garde sa place dans le tableau (annuler inchangé) ; `repeche_le` la met en tête des favoris.
export function repecher(swipes, id, { maintenant = new Date() } = {}) {
  return swipes.map((s) => (s.id === id
    ? { ...s, sens: 'droite', repeche: true, repeche_le: maintenant.toISOString() }
    : s));
}

const SENS = ['droite', 'gauche'];
const swipeValide = (s) => s !== null && typeof s === 'object' && !Array.isArray(s)
  && typeof s.id === 'string' && s.id.length > 0 && SENS.includes(s.sens);

// Swipes lus dans le stockage → seulement les entrées bien formées (objet, id texte, sens connu),
// sans doublon d'id (la première est gardée). Renvoie le même tableau s'il est déjà propre.
export function nettoyerSwipes(lus) {
  if (!Array.isArray(lus)) return [];
  const vus = new Set();
  const propres = lus.filter((s) => {
    if (!swipeValide(s) || vus.has(s.id)) return false;
    vus.add(s.id);
    return true;
  });
  return propres.length === lus.length ? lus : propres;
}

/**
 * Fusionne les swipes du stockage (écrits peut-être par une autre copie ouverte de l'appli)
 * avec ceux de cette copie, avant de les réécrire.
 * - union par id : l'ordre du stockage d'abord, puis les swipes présents seulement ici ;
 * - pour un id présent des deux côtés, le stockage gagne, sauf si cette copie l'a changé
 *   volontairement depuis sa dernière lecture ou écriture (`modifies` : swipe, raison, repêche) ;
 * - un id retiré ici par « annuler » (`supprimes`) disparaît aussi du stockage.
 */
export function fusionnerSwipes(stockes, memoire, { supprimes = new Set(), modifies = new Set() } = {}) {
  const ici = new Map(memoire.map((s) => [s.id, s]));
  const resultat = [];
  const pris = new Set();
  for (const s of Array.isArray(stockes) ? stockes : []) {
    if (pris.has(s.id) || supprimes.has(s.id)) continue;
    pris.add(s.id);
    resultat.push(modifies.has(s.id) && ici.has(s.id) ? ici.get(s.id) : s);
  }
  for (const s of memoire) {
    if (pris.has(s.id) || supprimes.has(s.id)) continue;
    pris.add(s.id);
    resultat.push(s);
  }
  return resultat;
}

// Quand une vraie pile (source autre que « demo ») est chargée, les swipes des cartes de démo
// (ids « demo:… ») sont oubliés. Sans source connue (pile indisponible), rien n'est retiré.
export function oublierDemo(swipes, source) {
  if (typeof source !== 'string' || !source || source === 'demo') return swipes;
  const restants = swipes.filter((s) => !String(s.id).startsWith('demo:'));
  return restants.length === swipes.length ? swipes : restants;
}

export function vusIds(swipes) {
  return new Set(swipes.map((s) => s.id));
}

const recents = (liste) => [...liste].reverse();

// Les plus récents d'abord ; une carte repêchée compte à la date du repêchage.
const dateFavori = (s) => String(s.repeche_le ?? s.t ?? '');

export function favoris(swipes) {
  return recents(swipes.filter((s) => s.sens === 'droite' && !s.echauffement))
    .sort((a, b) => (dateFavori(a) < dateFavori(b) ? 1 : dateFavori(a) > dateFavori(b) ? -1 : 0));
}

export function historique(swipes) {
  return recents(swipes.filter((s) => !s.echauffement));
}

export function empreintes(swipes, sens) {
  return swipes.filter((s) => s.sens === sens).map((s) => decoderEmb(s.emb));
}

// Nombre de swipes d'échauffement faits (pour le bandeau « Échauffement : X/15 »).
export function echauffementFait(swipes) {
  return swipes.filter((s) => s.echauffement).length;
}

// Remet en tête l'entrée de la carte `id` si elle est encore dans la suite (ordre des autres inchangé).
// Sert à garder la carte déjà visible au même endroit quand la suite est recalculée.
export function garderEnTete(entrees, id) {
  const i = entrees.findIndex((e) => e.carte.id === id);
  if (i <= 0) return entrees;
  return [entrees[i], ...entrees.slice(0, i), ...entrees.slice(i + 1)];
}

export function prochaines(pile, profil, swipes, rng) {
  const vus = vusIds(swipes);
  const faits = echauffementFait(swipes);
  if (faits < SEUIL_ECHAUFFEMENT) {
    const restantes = (pile.echauffement ?? []).filter((c) => !vus.has(c.id) && rayonCompatible(c, profil));
    if (restantes.length > 0) {
      return restantes.map((carte) => ({ carte, voisine: false, echauffement: true }));
    }
  }
  const candidates = filtrer(pile.cartes, profil, vus);
  return reclasser(
    candidates,
    empreintes(swipes, 'droite'),
    empreintes(swipes, 'gauche'),
    profil.exploration,
    rng,
  ).map((e) => ({ carte: e.carte, voisine: e.voisine, echauffement: false }));
}
