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
};

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
    budget: {
      max: typeof b.max === 'number' ? b.max : d.budget.max,
      parCategorie: estObjet(b.parCategorie) ? { ...b.parCategorie } : {},
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
    pays: p.pays,
    region: p.region,
    budget: texteDe(p.budget.max),
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

  if (a('pays') && parmi(v.pays, PAYS)) p.pays = v.pays;
  if (a('region')) p.region = String(v.region ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (a('budget')) {
    const max = lireNombre(v.budget, { min: BORNES.budget.min, max: BORNES.budget.max });
    if (max !== null) p.budget.max = max;
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
