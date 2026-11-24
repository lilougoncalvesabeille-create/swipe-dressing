// Lecture des tailles d'annonces et compatibilité avec le profil.
// Module pur (sans DOM), importé par le navigateur et par les tests Node.

export const CATEGORIES = {
  pull: 'haut', 't-shirt': 'haut', chemise: 'haut', sweat: 'haut',
  veste: 'haut', manteau: 'haut', robe: 'haut',
  pantalon: 'bas', jean: 'bas', short: 'bas', jupe: 'bas',
  chaussures: 'pointure',
  gants: 'unique', bonnet: 'unique', echarpe: 'unique',
  casquette: 'unique', ceinture: 'unique', sac: 'unique',
};

const LETTRES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const ALIAS = { '2XL': 'XXL', '3XL': 'XXXL' };
const PAS = { lettres: 1, eu: 2, w: 1, pointure: 1 };
const EPSILON = 1e-9;

export function typeDeTaille(categorie) {
  return CATEGORIES[categorie] ?? 'haut';
}

function rangLettre(texte) {
  const t = String(texte ?? '').trim().toUpperCase();
  const i = LETTRES.indexOf(ALIAS[t] ?? t);
  return i === -1 ? null : i + 1;
}

function lirePointures(brute) {
  const lectures = [];
  for (const m of brute.matchAll(/(\d{2})(?:\s*([.,]\d+)|\s+([12])\/3)?/g)) {
    let valeur = Number(m[1]);
    if (m[2]) valeur += Number(m[2].replace(',', '.'));
    else if (m[3]) valeur += Number(m[3]) / 3;
    if (valeur >= 16 && valeur <= 55) lectures.push({ systeme: 'pointure', valeur });
  }
  return lectures;
}

function lireVetement(brute, type) {
  const lectures = [];
  const texte = brute.toUpperCase();
  if (type === 'bas') {
    const w = texte.match(/\bW\s*(\d{2})\b/);
    if (w) return [{ systeme: 'w', valeur: Number(w[1]) }];
  }
  for (const morceau of texte.split('/')) {
    const m = morceau.trim().replace(/^TAILLE\s+/, '');
    const rang = rangLettre(m);
    if (rang !== null) lectures.push({ systeme: 'lettres', valeur: rang });
    else if (/^\d{2}$/.test(m)) {
      const n = Number(m);
      if (n >= 30 && n <= 60 && n % 2 === 0) lectures.push({ systeme: 'eu', valeur: n });
    }
  }
  return lectures;
}

export function lireTailles(brute, type) {
  if (type === 'unique') return [{ systeme: 'unique', valeur: 0 }];
  const texte = String(brute ?? '').trim();
  if (!texte) return [];
  return type === 'pointure' ? lirePointures(texte) : lireVetement(texte, type);
}

function valeurProfil(profil, type, systeme) {
  if (!profil) return null;
  let v = null;
  if (systeme === 'lettres') v = rangLettre(profil.lettre);
  else if (systeme === 'eu') v = profil.eu;
  else if (systeme === 'w') v = profil.w;
  else if (systeme === 'pointure') v = profil.eu;
  return typeof v === 'number' ? v : null;
}

export function compatibilite(brute, categorie, profilTailles) {
  const type = typeDeTaille(categorie);
  if (type === 'unique') return 'exacte';
  const profil = profilTailles?.[type];
  let meilleur = null;
  for (const { systeme, valeur } of lireTailles(brute, type)) {
    const miens = valeurProfil(profil, type, systeme);
    if (miens === null) continue;
    const ecart = Math.abs(valeur - miens);
    if (ecart < EPSILON) return 'exacte';
    if (ecart <= PAS[systeme] + EPSILON) meilleur = 'voisine';
  }
  if (meilleur === 'voisine' && profil.mode === 'stricte') return null;
  return meilleur;
}
