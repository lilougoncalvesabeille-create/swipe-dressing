// Paquet de cartes : filtres du profil, swipes (jamais deux fois), annuler, repêcher.
// Module pur (sans DOM) : tout est fonction des données reçues, aucun état caché.

import { compatibilite } from './tailles.js';
import { decoderEmb, reclasser } from './empreintes.js';

export const ETATS = ['satisfaisant', 'bon', 'tres-bon', 'neuf', 'neuf-etiquette'];

const SEUIL_ECHAUFFEMENT = 15;

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

export function filtrer(cartes, profil, vus) {
  const bannies = new Set((profil.marquesBannies ?? []).map((m) => String(m).toLowerCase()));
  const rangMin = ETATS.indexOf(profil.etatMin);
  const resultat = [];
  for (const carte of cartes) {
    if (vus.has(carte.id)) continue;
    if (carte.dispo === false) continue;
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

export function annuler(swipes) {
  return swipes.slice(0, -1);
}

export function repecher(swipes, id) {
  return swipes.map((s) => (s.id === id ? { ...s, sens: 'droite', repeche: true } : s));
}

export function vusIds(swipes) {
  return new Set(swipes.map((s) => s.id));
}

const recents = (liste) => [...liste].reverse();

export function favoris(swipes) {
  return recents(swipes.filter((s) => s.sens === 'droite' && !s.echauffement));
}

export function historique(swipes) {
  return recents(swipes.filter((s) => !s.echauffement));
}

export function empreintes(swipes, sens) {
  return swipes.filter((s) => s.sens === sens).map((s) => decoderEmb(s.emb));
}

export function prochaines(pile, profil, swipes, rng) {
  const vus = vusIds(swipes);
  const faits = swipes.filter((s) => s.echauffement).length;
  if (faits < SEUIL_ECHAUFFEMENT) {
    const restantes = (pile.echauffement ?? []).filter((c) => !vus.has(c.id));
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
