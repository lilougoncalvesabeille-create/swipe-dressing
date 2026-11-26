// Mise en forme des annonces (prix, libellés, dates, photos) et profil de style à afficher.
// Module pur (sans DOM) : partagé par l'écran de swipe, les listes et la fiche détail.

import { CATEGORIES_LISTE } from './formulaire.js';
import { profilStyle } from './empreintes.js';

// Nombre minimum de cartes aimées avant d'afficher le profil de style.
export const SEUIL_PROFIL = 5;

const LIBELLES_ETAT = {
  'neuf-etiquette': 'Neuf avec étiquette',
  neuf: 'Neuf',
  'tres-bon': 'Très bon état',
  bon: 'Bon état',
  satisfaisant: 'Satisfaisant',
};

const LIBELLES_SITE = {
  vinted: 'Vinted',
  zalando: 'Zalando',
  veepee: 'Veepee',
  emmaus: 'Label Emmaüs',
  demo: 'Démo',
};

const LIBELLES_CATEGORIE = Object.fromEntries(CATEGORIES_LISTE.map((c) => [c.valeur, c.libelle]));

const texte = (v) => (typeof v === 'string' ? v.trim() : '');
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const euros0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const jourMoisAn = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// « 30 € » pour un prix rond, « 12,50 € » sinon ; '' si le prix n'est pas un nombre.
export function formaterPrix(prix) {
  if (!Number.isFinite(prix)) return '';
  return Number.isInteger(prix) ? euros0.format(prix) : euros2.format(prix);
}

// « 24 nov. 2026 », ou null si la date est absente ou illisible.
export function formaterDate(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : jourMoisAn.format(date);
}

/**
 * Temps écoulé depuis `iso` : « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 jours ».
 * null si la date est absente ou illisible. Une date dans le futur (horloge décalée) donne « à l'instant ».
 */
export function ilYA(iso, maintenant = new Date()) {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const minutes = Math.floor((maintenant.getTime() - t) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} ${jours > 1 ? 'jours' : 'jour'}`;
}

export function libelleEtat(etat) {
  return LIBELLES_ETAT[etat] ?? null;
}

// Nom lisible du site ; un site inconnu est affiché tel quel, avec une majuscule.
export function libelleSite(site) {
  const t = texte(site);
  if (!t) return null;
  return LIBELLES_SITE[t.toLowerCase()] ?? majuscule(t);
}

export function libelleCategorie(categorie) {
  const t = texte(categorie);
  if (!t) return null;
  return LIBELLES_CATEGORIE[t] ?? majuscule(t);
}

export function libelleTaille(taille) {
  const t = texte(String(taille ?? ''));
  if (!t) return 'Taille non précisée';
  return /^taille\b/i.test(t) ? t : `Taille ${t}`;
}

export function libelleStyle(nom) {
  const t = texte(nom);
  return t ? majuscule(t) : '';
}

// « 45 % » (espace insécable, comme en typographie française).
export const formaterPct = (pct) => `${pct} %`;

// Photos de l'annonce pour le carrousel : la photo principale d'abord, sans doublon ni vide.
export function photosDe(carte) {
  const liste = [carte?.photo, ...(Array.isArray(carte?.photos) ? carte.photos : [])];
  const vues = new Set();
  const resultat = [];
  for (const p of liste) {
    const t = texte(p);
    if (t && !vues.has(t)) {
      vues.add(t);
      resultat.push(t);
    }
  }
  return resultat;
}

// Adresse de l'annonce si elle est en http(s), sinon null (jamais de lien « javascript: »).
export function urlSure(url) {
  const t = texte(url);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Lignes d'informations de la fiche détail, dans l'ordre d'affichage.
 * Les champs vides sont omis. Chaque ligne : {cle, libelle, valeur}.
 */
export function lignesFiche(carte) {
  const lignes = [
    ['taille', 'Taille', texte(String(carte?.taille ?? '')) || null],
    ['marque', 'Marque', texte(carte?.marque) || null],
    ['etat', 'État', libelleEtat(carte?.etat)],
    ['categorie', 'Catégorie', libelleCategorie(carte?.categorie)],
    ['site', 'Site', libelleSite(carte?.site)],
    ['vu_le', 'Récoltée le', formaterDate(carte?.vu_le)],
  ];
  return lignes
    .filter(([, , valeur]) => valeur)
    .map(([cle, libelle, valeur]) => ({ cle, libelle, valeur }));
}

/**
 * Ce que montre le haut des Favoris, à partir des empreintes aimées (échauffement compris) :
 *   {etat: 'trop-tot', manque}       moins de SEUIL_PROFIL cartes aimées
 *   {etat: 'indisponible'}            pas de styles connus (pile pas encore chargée)
 *   {etat: 'barres', barres}          barres [{nom, libelle, pct}] triées par pourcentage
 */
export function profilAAfficher(aimes, styles) {
  if (aimes.length < SEUIL_PROFIL) return { etat: 'trop-tot', manque: SEUIL_PROFIL - aimes.length };
  if (!styles || styles.length === 0) return { etat: 'indisponible' };
  const barres = profilStyle(aimes, styles).map((p) => ({ ...p, libelle: libelleStyle(p.nom) }));
  return barres.length > 0 ? { etat: 'barres', barres } : { etat: 'indisponible' };
}

/**
 * Textes de l'écran de swipe sans carte : {titre, aide, action}. `action` dit quel bouton montrer :
 * 'reglages' (clé GitHub refusée), 'reessayer' (pile indisponible) ou 'elargir' (plus de cartes).
 * Une clé refusée l'emporte : aucune nouvelle annonce n'arrivera tant qu'elle n'est pas corrigée.
 */
export function textesPileVide({ cleRefusee = false, indisponible = false } = {}) {
  if (cleRefusee) {
    return {
      titre: 'Ta clé GitHub a été refusée : vérifie-la dans Réglages.',
      aide: 'Sans clé valide, les annonces récoltées par le PC ne peuvent pas arriver.',
      action: 'reglages',
    };
  }
  if (indisponible) {
    return { titre: "Annonces indisponibles pour l'instant.", aide: 'Vérifie ta connexion puis réessaie.', action: 'reessayer' };
  }
  return {
    titre: 'Plus de cartes pour l\'instant',
    aide: 'Élargis ta taille, ton budget ou tes catégories pour en voir d’autres.',
    action: 'elargir',
  };
}
