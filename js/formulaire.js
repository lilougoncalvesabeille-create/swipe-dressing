// Lecture et remplissage du formulaire de profil (questionnaire et réglages).
// Module pur (sans DOM) : convertit les valeurs brutes des champs en profil, et inversement.

import { profilParDefaut, ETATS } from './paquet.js';
import { CATEGORIES } from './tailles.js';

export const LETTRES_TAILLE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

export const RAYONS = [
  { valeur: 'homme', libelle: 'Homme' },
  { valeur: 'femme', libelle: 'Femme' },
  { valeur: 'les-deux', libelle: 'Les deux' },
];

export const MODES = [
  { valeur: 'stricte', libelle: 'Stricte' },
  { valeur: 'large', libelle: 'Large' },
];

export const LIBELLES_ETATS = {
  satisfaisant: 'Satisfaisant',
  bon: 'Bon',
  'tres-bon': 'Très bon',
  neuf: 'Neuf',
  'neuf-etiquette': 'Neuf avec étiquette',
};

const LIBELLES_CATEGORIES = {
  pull: 'Pull', 't-shirt': 'T-shirt', chemise: 'Chemise', sweat: 'Sweat',
  veste: 'Veste', manteau: 'Manteau', robe: 'Robe',
  pantalon: 'Pantalon', jean: 'Jean', short: 'Short', jupe: 'Jupe',
  chaussures: 'Chaussures',
  gants: 'Gants', bonnet: 'Bonnet', echarpe: 'Écharpe',
  casquette: 'Casquette', ceinture: 'Ceinture', sac: 'Sac',
};

export const CATEGORIES_LISTE = Object.keys(CATEGORIES).map((valeur) => ({
  valeur,
  libelle: LIBELLES_CATEGORIES[valeur] ?? valeur.charAt(0).toUpperCase() + valeur.slice(1),
}));

export const PAYS = [
  { valeur: 'FR', libelle: 'France' },
  { valeur: 'BE', libelle: 'Belgique' },
  { valeur: 'CH', libelle: 'Suisse' },
  { valeur: 'LU', libelle: 'Luxembourg' },
  { valeur: 'DE', libelle: 'Allemagne' },
  { valeur: 'AT', libelle: 'Autriche' },
  { valeur: 'ES', libelle: 'Espagne' },
  { valeur: 'IT', libelle: 'Italie' },
  { valeur: 'NL', libelle: 'Pays-Bas' },
  { valeur: 'PT', libelle: 'Portugal' },
];

// Bornes des champs numériques : partagées par le HTML (min/max/step) et la lecture.
export const BORNES = {
  age: { min: 10, max: 120, pas: 1 },
  eu: { min: 30, max: 60, pas: 2 },
  w: { min: 20, max: 50, pas: 1 },
  pointure: { min: 16, max: 55, pas: 0.5 },
  budget: { min: 1, max: 10000, pas: 1 },
  exploration: { min: 0, max: 50, pas: 1 },
  tailleCm: { min: 120, max: 220, pas: 1 },
  poidsKg: { min: 30, max: 250, pas: 1 },
  piedCm: { min: 15, max: 35, pas: 0.5 },
};

export const GABARITS = [
  { valeur: 'homme', libelle: 'Homme' },
  { valeur: 'femme', libelle: 'Femme' },
];

// --- Estimation des tailles (aide « Je ne connais pas mes tailles ») ---
// Repères moyens des guides de tailles français : une estimation, pas une mesure.
// Le poids donne la lettre ; une grande taille la monte d'un cran (longueur des manches et des jambes).
const SEUILS_POIDS = {
  // poids maximum (kg) de chaque lettre, de XXS à XXL ; au-delà : XXXL
  homme: [50, 56, 65, 77, 89, 101, 115],
  femme: [45, 52, 59, 67, 76, 86, 97],
};
const GRANDE_TAILLE_CM = { homme: 190, femme: 178 };
// Équivalences par lettre (XXS → XXXL).
const EU_HAUT = { homme: [42, 44, 46, 48, 50, 52, 54, 56], femme: [32, 34, 36, 38, 40, 42, 44, 46] };
const EU_BAS = { homme: [34, 36, 38, 40, 42, 44, 46, 48], femme: [32, 34, 36, 38, 40, 42, 44, 46] };
const W_BAS = { homme: [27, 28, 30, 32, 34, 36, 38, 40], femme: [24, 25, 27, 29, 31, 33, 35, 37] };

/**
 * Tailles probables à partir de la taille (cm), du poids (kg) et, si connue, de la longueur
 * du pied (cm). Renvoie { haut, bas, pointure } (chaque partie null si impossible à estimer).
 * Sans pied mesuré, la longueur est déduite de la taille (environ 15 %), donc moins sûre.
 */
export function estimerTailles({ gabarit, tailleCm, poidsKg, piedCm } = {}) {
  const g = gabarit === 'femme' ? 'femme' : 'homme';
  const taille = lireNombre(tailleCm, BORNES.tailleCm);
  const poids = lireNombre(poidsKg, BORNES.poidsKg);
  const pied = lireNombre(piedCm, { min: BORNES.piedCm.min, max: BORNES.piedCm.max });

  let haut = null;
  let bas = null;
  if (taille !== null && poids !== null) {
    let rang = SEUILS_POIDS[g].findIndex((max) => poids <= max);
    if (rang === -1) rang = LETTRES_TAILLE.length - 1;
    if (taille >= GRANDE_TAILLE_CM[g]) rang = Math.min(LETTRES_TAILLE.length - 1, rang + 1);
    const lettre = LETTRES_TAILLE[rang];
    haut = { lettre, eu: EU_HAUT[g][rang] };
    bas = { lettre, eu: EU_BAS[g][rang], w: W_BAS[g][rang] };
  }

  let pointure = null;
  const longueur = pied ?? (taille !== null ? taille * 0.15 : null);
  if (longueur !== null) {
    // Pointure EU (point de Paris = 2/3 cm) d'une chaussure environ 1,5 cm plus longue que le pied.
    const eu = Math.round((longueur + 1.5) * 1.5 * 2) / 2;
    if (eu >= BORNES.pointure.min && eu <= BORNES.pointure.max) {
      pointure = { eu, mesuree: pied !== null };
    }
  }
  return { haut, bas, pointure };
}

const EPSILON = 1e-9;

// Texte → nombre, ou null si vide, illisible, hors bornes ou hors pas.
export function lireNombre(texte, { min = -Infinity, max = Infinity, pas = null } = {}) {
  if (typeof texte === 'number') texte = String(texte);
  if (typeof texte !== 'string') return null;
  const propre = texte.trim().replace(',', '.');
  if (propre === '') return null;
  const n = Number(propre);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  if (pas) {
    const reste = Math.abs(n / pas - Math.round(n / pas));
    if (reste > EPSILON) return null;
  }
  return n;
}

// Phrase affichée après une estimation ; null si rien n'a pu être estimé.
export function resumeEstimation({ haut, bas, pointure } = {}) {
  const parties = [];
  if (haut) parties.push(`haut ${haut.lettre} (EU ${haut.eu})`);
  if (bas) parties.push(`bas ${bas.lettre} (EU ${bas.eu}, W${bas.w})`);
  if (pointure) parties.push(`pointure ${String(pointure.eu).replace('.', ',')}${pointure.mesuree ? '' : ' (d’après ta taille)'}`);
  if (parties.length === 0) return null;
  return `Estimation : ${parties.join(', ')}. Mode large activé pour compenser. Vérifie et ajuste si besoin, puis enregistre.`;
}

// « Nike, adidas ; Carhartt » → ['Nike', 'adidas', 'Carhartt'], sans doublon (casse ignorée).
export function listeMarques(texte) {
  if (typeof texte !== 'string') return [];
  const vues = new Set();
  const marques = [];
  for (const morceau of texte.split(/[,;\n]/)) {
    const marque = morceau.trim().replace(/\s+/g, ' ');
    const cle = marque.toLowerCase();
    if (!marque || vues.has(cle)) continue;
    vues.add(cle);
    marques.push(marque);
  }
  return marques;
}

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const parmi = (valeur, liste) => liste.some((x) => x.valeur === valeur);

// Nom du champ « budget pour une catégorie » (réglages).
export const champBudget = (categorie) => `budget-${categorie}`;

// Budgets par catégorie lus du stockage : seulement des catégories connues et des montants valides.
function budgetsValides(parCategorie) {
  if (!estObjet(parCategorie)) return {};
  const propres = {};
  for (const [categorie, montant] of Object.entries(parCategorie)) {
    if (!(categorie in CATEGORIES) || typeof montant !== 'number') continue;
    if (lireNombre(montant, { min: BORNES.budget.min, max: BORNES.budget.max }) !== null) propres[categorie] = montant;
  }
  return propres;
}

// Mensurations lues du stockage : valeurs dans leurs bornes, sinon null.
function mensurationsValides(m) {
  const lu = estObjet(m) ? m : {};
  const nombreOuNull = (v, bornes) => (typeof v === 'number' ? lireNombre(v, bornes) : null);
  return {
    gabarit: parmi(lu.gabarit, GABARITS) ? lu.gabarit : null,
    tailleCm: nombreOuNull(lu.tailleCm, BORNES.tailleCm),
    poidsKg: nombreOuNull(lu.poidsKg, BORNES.poidsKg),
    piedCm: nombreOuNull(lu.piedCm, BORNES.piedCm),
  };
}

// Gabarit de l'aide aux tailles : celui choisi, sinon celui du rayon (homme par défaut).
export function gabaritDe(profil) {
  const m = profil?.mensurations;
  if (m && parmi(m.gabarit, GABARITS)) return m.gabarit;
  return profil?.rayon === 'femme' ? 'femme' : 'homme';
}

// Profil lu dans le stockage → profil complet (champs manquants remplis par les défauts).
export function completerProfil(lu) {
  const d = profilParDefaut();
  if (!estObjet(lu)) return d;
  const t = estObjet(lu.tailles) ? lu.tailles : {};
  const b = estObjet(lu.budget) ? lu.budget : {};
  return {
    ...d,
    ...lu,
    tailles: {
      haut: { ...d.tailles.haut, ...(estObjet(t.haut) ? t.haut : {}) },
      bas: { ...d.tailles.bas, ...(estObjet(t.bas) ? t.bas : {}) },
      pointure: { ...d.tailles.pointure, ...(estObjet(t.pointure) ? t.pointure : {}) },
    },
    mensurations: mensurationsValides(lu.mensurations),
    budget: {
      max: typeof b.max === 'number' ? b.max : d.budget.max,
      parCategorie: budgetsValides(b.parCategorie),
    },
    categories: Array.isArray(lu.categories) ? [...lu.categories] : [],
    marquesPreferees: Array.isArray(lu.marquesPreferees) ? [...lu.marquesPreferees] : [],
    marquesBannies: Array.isArray(lu.marquesBannies) ? [...lu.marquesBannies] : [],
    exploration: typeof lu.exploration === 'number' ? lu.exploration : d.exploration,
    questionnaireFait: lu.questionnaireFait === true,
  };
}

const texteDe = (v) => (v === null || v === undefined ? '' : String(v));

// Profil → valeurs brutes des champs (nom du champ → texte, ou liste pour les catégories).
export function valeursDepuisProfil(profil) {
  const p = completerProfil(profil);
  const { haut, bas, pointure } = p.tailles;
  return {
    age: texteDe(p.age),
    rayon: p.rayon,
    'haut-lettre': texteDe(haut.lettre),
    'haut-eu': texteDe(haut.eu),
    'haut-mode': haut.mode,
    'bas-lettre': texteDe(bas.lettre),
    'bas-eu': texteDe(bas.eu),
    'bas-w': texteDe(bas.w),
    'bas-mode': bas.mode,
    'pointure-eu': texteDe(pointure.eu),
    'pointure-mode': pointure.mode,
    'mens-gabarit': gabaritDe(p),
    'mens-taille': texteDe(p.mensurations.tailleCm),
    'mens-poids': texteDe(p.mensurations.poidsKg),
    'mens-pied': texteDe(p.mensurations.piedCm),
    pays: p.pays,
    region: p.region,
    budget: texteDe(p.budget.max),
    ...Object.fromEntries(Object.keys(CATEGORIES)
      .map((c) => [champBudget(c), texteDe(p.budget.parCategorie[c])])),
    categories: [...p.categories],
    'etat-min': p.etatMin,
    'marques-preferees': p.marquesPreferees.join(', '),
    'marques-bannies': p.marquesBannies.join(', '),
    exploration: String(Math.round(p.exploration * 100)),
  };
}

// Valeurs brutes des champs → nouveau profil construit sur `base` (jamais modifiée).
// Un champ absent garde la valeur de `base` ; un champ vide ou invalide devient null
// pour les tailles et l'âge (facultatifs), et garde la valeur de `base` pour le reste.
export function lireFormulaire(valeurs, base = profilParDefaut()) {
  const v = estObjet(valeurs) ? valeurs : {};
  const p = completerProfil(structuredClone(base));
  const a = (nom) => Object.hasOwn(v, nom);

  if (a('age')) {
    const age = lireNombre(v.age, BORNES.age);
    p.age = age === null ? null : Math.round(age);
  }
  if (a('rayon') && parmi(v.rayon, RAYONS)) p.rayon = v.rayon;

  const lettre = (texte) => {
    const t = String(texte ?? '').trim().toUpperCase();
    return LETTRES_TAILLE.includes(t) ? t : null;
  };
  const mode = (nom, type) => {
    if (a(nom) && parmi(v[nom], MODES)) p.tailles[type].mode = v[nom];
  };
  if (a('haut-lettre')) p.tailles.haut.lettre = lettre(v['haut-lettre']);
  if (a('haut-eu')) p.tailles.haut.eu = lireNombre(v['haut-eu'], BORNES.eu);
  mode('haut-mode', 'haut');
  if (a('bas-lettre')) p.tailles.bas.lettre = lettre(v['bas-lettre']);
  if (a('bas-eu')) p.tailles.bas.eu = lireNombre(v['bas-eu'], BORNES.eu);
  if (a('bas-w')) p.tailles.bas.w = lireNombre(v['bas-w'], BORNES.w);
  mode('bas-mode', 'bas');
  if (a('pointure-eu')) p.tailles.pointure.eu = lireNombre(v['pointure-eu'], BORNES.pointure);
  mode('pointure-mode', 'pointure');
  // Gabarit retenu seulement s'il diffère de celui du rayon (null = suivre le rayon).
  if (a('mens-gabarit') && parmi(v['mens-gabarit'], GABARITS)) {
    const parRayon = gabaritDe({ rayon: p.rayon });
    p.mensurations.gabarit = v['mens-gabarit'] === parRayon ? null : v['mens-gabarit'];
  }
  if (a('mens-taille')) p.mensurations.tailleCm = lireNombre(v['mens-taille'], BORNES.tailleCm);
  if (a('mens-poids')) p.mensurations.poidsKg = lireNombre(v['mens-poids'], BORNES.poidsKg);
  if (a('mens-pied')) p.mensurations.piedCm = lireNombre(v['mens-pied'], BORNES.piedCm);

  if (a('pays') && parmi(v.pays, PAYS)) p.pays = v.pays;
  if (a('region')) p.region = String(v.region ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (a('budget')) {
    const max = lireNombre(v.budget, { min: BORNES.budget.min, max: BORNES.budget.max });
    if (max !== null) p.budget.max = max;
  }
  // Budget par catégorie : vide = budget global (clé retirée), invalide = valeur précédente gardée.
  for (const categorie of Object.keys(CATEGORIES)) {
    const nom = champBudget(categorie);
    if (!a(nom)) continue;
    if (String(v[nom] ?? '').trim() === '') {
      delete p.budget.parCategorie[categorie];
      continue;
    }
    const montant = lireNombre(v[nom], { min: BORNES.budget.min, max: BORNES.budget.max });
    if (montant !== null) p.budget.parCategorie[categorie] = montant;
  }

  if (a('categories')) {
    const liste = Array.isArray(v.categories) ? v.categories : [v.categories];
    p.categories = [...new Set(liste.filter((c) => typeof c === 'string' && c in CATEGORIES))];
  }
  if (a('etat-min') && ETATS.includes(v['etat-min'])) p.etatMin = v['etat-min'];
  if (a('marques-preferees')) p.marquesPreferees = listeMarques(v['marques-preferees']);
  if (a('marques-bannies')) p.marquesBannies = listeMarques(v['marques-bannies']);

  if (a('exploration')) {
    const pourcent = lireNombre(v.exploration, { min: -Infinity, max: Infinity });
    if (pourcent !== null) {
      const borne = Math.min(BORNES.exploration.max, Math.max(BORNES.exploration.min, pourcent));
      p.exploration = Math.round(borne) / 100;
    }
  }
  return p;
}
