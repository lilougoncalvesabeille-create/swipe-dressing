// Paquet de cartes : filtres du profil, swipes (jamais deux fois), annuler, repêcher.
// Module pur (sans DOM) : tout est fonction des données reçues, aucun état caché.

import { compatibilite } from './tailles.js';
import { empreinteDe, reclasser } from './empreintes.js';

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
      emb = empreinteDe(carte.id, carte.emb);
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
const swipeBienForme = (s) => s !== null && typeof s === 'object' && !Array.isArray(s)
  && typeof s.id === 'string' && s.id.length > 0 && SENS.includes(s.sens);

// Swipe valide : objet, id texte, sens connu, empreinte absente (swipe compacté ou venu d'ailleurs)
// ou en texte (base64).
export const swipeValide = (s) => swipeBienForme(s) && (s.emb === undefined || typeof s.emb === 'string');

// Swipes lus dans le stockage → seulement les entrées bien formées (objet, id texte, sens connu),
// sans doublon d'id (la première est gardée). Un swipe dont seule l'empreinte est abîmée est
// gardé sans elle : son id reste « vu », la carte n'est jamais remontrée.
// Renvoie le même tableau s'il est déjà propre.
export function nettoyerSwipes(lus) {
  if (!Array.isArray(lus)) return [];
  const vus = new Set();
  let change = false;
  const propres = [];
  for (const s of lus) {
    if (!swipeBienForme(s) || vus.has(s.id)) {
      change = true;
      continue;
    }
    vus.add(s.id);
    if (swipeValide(s)) {
      propres.push(s);
    } else {
      const { emb, ...sansEmb } = s;
      propres.push(sansEmb);
      change = true;
    }
  }
  return change ? propres : lus;
}

// --- Compactage du stockage (objectif : sd:swipes sous 2 Mo) ---

// Les refus plus anciens que les GARDER_CARTES swipes les plus récents perdent leur carte et leur
// empreinte ; tout swipe plus ancien que les GARDER_EMPREINTES plus récents perd son empreinte.
// Les favoris gardent toujours leur carte (écran Favoris).
export const GARDER_CARTES = 300;
export const GARDER_EMPREINTES = 600;
const CHAMPS_REFUS_COMPACT = ['id', 'sens', 't', 'raison', 'echauffement'];

function refusCompact(s) {
  // La marque d'échauffement est gardée : sinon le compte « Échauffement : X/15 » baisserait.
  const r = { id: s.id, sens: s.sens, t: s.t, raison: s.raison ?? null };
  if (s.echauffement) r.echauffement = true;
  return r;
}

const dejaCompact = (s) => Object.keys(s).every((k) => CHAMPS_REFUS_COMPACT.includes(k))
  && 'raison' in s && s.echauffement !== false;

/** Renvoie les swipes compactés (même ordre, mêmes ids), ou le même tableau s'il n'y a rien à faire. */
export function compacterSwipes(swipes) {
  const n = swipes.length;
  if (n <= GARDER_CARTES) return swipes;
  let change = false;
  const resultat = swipes.map((s, i) => {
    const rang = n - 1 - i; // 0 : le plus récent
    let r = s;
    if (rang >= GARDER_CARTES && s.sens === 'gauche' && !dejaCompact(s)) r = refusCompact(s);
    if (rang >= GARDER_EMPREINTES && 'emb' in r) {
      const { emb, ...sansEmb } = r;
      r = sansEmb;
    }
    if (r !== s) change = true;
    return r;
  });
  return change ? resultat : swipes;
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

// Seuls les swipes qui ont encore leur carte sont listés (un refus compacté, ou un swipe fait sur
// un autre appareil et reçu sans carte, compte comme vu mais ne s'affiche pas).
export function favoris(swipes) {
  return recents(swipes.filter((s) => s.sens === 'droite' && !s.echauffement && s.carte))
    .sort((a, b) => (dateFavori(a) < dateFavori(b) ? 1 : dateFavori(a) > dateFavori(b) ? -1 : 0));
}

export function historique(swipes) {
  return recents(swipes.filter((s) => !s.echauffement && s.carte));
}

// Empreintes des swipes d'un sens (pour le classement) ; un swipe sans empreinte lisible est ignoré.
export function empreintes(swipes, sens) {
  const resultat = [];
  for (const s of swipes) {
    if (s.sens !== sens || typeof s.emb !== 'string') continue;
    try {
      resultat.push(empreinteDe(s.id, s.emb));
    } catch {
      // Empreinte abîmée : ce swipe ne compte pas dans le classement.
    }
  }
  return resultat;
}

/**
 * Met à jour « Plus dispo » des favoris d'après annonces-etat.json du dépôt privé
 * (`{ "<id>": {"dispo": bool, "verifie_le": ISO} }`). Renvoie {swipes, modifies}
 * (le même tableau si rien ne change).
 */
export function majDispoFavoris(swipes, etats) {
  if (!etats || typeof etats !== 'object') return { swipes, modifies: [] };
  const modifies = [];
  const resultat = swipes.map((s) => {
    const etat = Object.hasOwn(etats, s.id) ? etats[s.id] : null;
    if (s.sens !== 'droite' || !s.carte || typeof etat?.dispo !== 'boolean' || s.carte.dispo === etat.dispo) return s;
    modifies.push(s.id);
    return { ...s, carte: { ...s.carte, dispo: etat.dispo } };
  });
  return modifies.length > 0 ? { swipes: resultat, modifies } : { swipes, modifies };
}

// Pile sans les cartes dont l'id est dans `ids` (le même objet si aucune n'est retirée).
export function retirerIds(pile, ids) {
  const garder = (c) => !ids.has(c.id);
  const cartes = pile.cartes ?? [];
  const echauffement = pile.echauffement ?? [];
  if (cartes.every(garder) && echauffement.every(garder)) return pile;
  return { ...pile, cartes: cartes.filter(garder), echauffement: echauffement.filter(garder) };
}

// --- Cartes déjà vues avant « Tout effacer » ---
// Le récolteur garde les anciennes cartes de pile.json tant qu'elles ne sont pas dans swipes.json,
// or swipes.json est vide après une remise à zéro : le téléphone garde donc la liste des ids déjà
// vus (`{ids, avant}`) et les retire de chaque pile.

/** Liste après une (nouvelle) remise à zéro : les ids d'une remise précédente sont gardés. */
export function fusionnerEcartes(ancienne, ids, avant) {
  const anciens = Array.isArray(ancienne?.ids) ? ancienne.ids : [];
  const tous = [...new Set([...anciens, ...ids])];
  return tous.length > 0 ? { ids: tous, avant } : null;
}

/**
 * Retire de la pile les cartes déjà vues. Pour une pile générée après la remise à zéro, la liste
 * est réduite aux ids encore présents dans cette pile : une annonce absente d'une telle pile ne
 * peut plus revenir (les nouvelles candidates sont exclues par le cache du récolteur). Liste vide :
 * `ecartes` vaut null (la clé peut être supprimée). Renvoie {pile, ecartes}.
 */
export function appliquerEcartes(pile, ecartes) {
  if (!ecartes || !Array.isArray(ecartes.ids)) return { pile, ecartes: null };
  if (pile.source === 'demo') return { pile, ecartes };
  const filtree = retirerIds(pile, new Set(ecartes.ids));
  const genereLe = Date.parse(pile.genere_le ?? '');
  const avant = Date.parse(ecartes.avant ?? '');
  // Pile d'avant la remise à zéro (ou sans date) : la liste ne change pas.
  if (!(Number.isFinite(genereLe) && Number.isFinite(avant) && genereLe >= avant)) return { pile: filtree, ecartes };
  const presents = new Set([...(pile.cartes ?? []), ...(pile.echauffement ?? [])].map((c) => c.id));
  const restants = ecartes.ids.filter((id) => presents.has(id));
  if (restants.length === 0) return { pile: filtree, ecartes: null };
  if (restants.length === ecartes.ids.length) return { pile: filtree, ecartes };
  return { pile: filtree, ecartes: { ...ecartes, ids: restants } };
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
