// Lecture et validation de la pile d'annonces (format : docs/format-pile.md).
// Module pur (sans DOM) : utilisable dans le navigateur et dans Node.

import { decoderEmb } from './empreintes.js';
import { CATEGORIES } from './tailles.js';

const CLE_PILE = 'sd:pile';

const texte = (v) => typeof v === 'string' && v.length > 0;

export const RAYONS_CARTE = ['homme', 'femme', 'mixte'];

// Renvoie {erreur} ou {dim} (dimension de l'empreinte décodée).
function validerCarte(c) {
  if (!c || typeof c !== 'object') return { erreur: 'carte absente ou illisible' };
  const id = texte(c.id) ? c.id : '?';
  if (!texte(c.id)) return { erreur: 'carte sans id' };
  if (!texte(c.site)) return { erreur: `carte ${id} : site manquant` };
  if (!texte(c.titre)) return { erreur: `carte ${id} : titre manquant` };
  if (typeof c.prix !== 'number' || !(c.prix >= 0)) return { erreur: `carte ${id} : prix invalide` };
  if (!texte(c.categorie) || !(c.categorie in CATEGORIES)) return { erreur: `carte ${id} : catégorie inconnue` };
  if (!texte(c.photo)) return { erreur: `carte ${id} : photo manquante` };
  if (!texte(c.url)) return { erreur: `carte ${id} : url manquante` };
  if (!texte(c.emb)) return { erreur: `carte ${id} : empreinte manquante` };
  try {
    const dim = decoderEmb(c.emb).length;
    if (dim === 0) return { erreur: `carte ${id} : empreinte vide` };
    return { dim };
  } catch {
    return { erreur: `carte ${id} : empreinte illisible` };
  }
}

// Première passe : cartes bien formées, avec la dimension de leur empreinte.
function lireCartes(liste, erreurs, etiquette) {
  if (liste === undefined || liste === null) return [];
  if (!Array.isArray(liste)) {
    erreurs.push(`${etiquette} : liste attendue`);
    return [];
  }
  const lues = [];
  for (const c of liste) {
    const { erreur, dim } = validerCarte(c);
    if (erreur) erreurs.push(`${etiquette} : ${erreur}`);
    else lues.push({ c, dim });
  }
  return lues;
}

// Seconde passe : dimension attendue, rayon, doublons.
function retenirCartes(lues, erreurs, etiquette, dejaVus, dimension) {
  const valides = [];
  for (const { c, dim } of lues) {
    if (dim !== dimension) {
      erreurs.push(`${etiquette} : carte ${c.id} : empreinte de dimension ${dim} (attendu ${dimension}), ignorée`);
    } else if (dejaVus.has(c.id)) {
      erreurs.push(`${etiquette} : carte ${c.id} en double, ignorée`);
    } else {
      dejaVus.add(c.id);
      const carte = { ...c, dispo: c.dispo !== false };
      if (carte.rayon !== undefined && carte.rayon !== null && !RAYONS_CARTE.includes(carte.rayon)) {
        erreurs.push(`${etiquette} : carte ${c.id} : rayon inconnu (${String(carte.rayon)}), ignoré`);
        carte.rayon = null;
      }
      valides.push(carte);
    }
  }
  return valides;
}

// Dimension la plus fréquente parmi les empreintes (à égalité : la première rencontrée).
function dimensionMajoritaire(dims) {
  const compte = new Map();
  for (const d of dims) compte.set(d, (compte.get(d) ?? 0) + 1);
  let meilleure = null;
  for (const [d, n] of compte) if (meilleure === null || n > compte.get(meilleure)) meilleure = d;
  return meilleure;
}

export function validerPile(json) {
  const erreurs = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return {
      cartes: [], echauffement: [], styles: [], erreurs: ['pile illisible : objet attendu'], source: null, genere_le: null,
    };
  }
  const stylesLus = [];
  if (Array.isArray(json.styles)) {
    for (const s of json.styles) {
      try {
        if (!s || !texte(s.nom)) throw new Error('nom manquant');
        const emb = decoderEmb(s.emb);
        if (emb.length === 0) throw new Error('empreinte vide');
        stylesLus.push({ nom: s.nom, emb });
      } catch {
        erreurs.push(`style ${s?.nom ?? '?'} : empreinte ou nom invalide`);
      }
    }
  }
  const cartesLues = lireCartes(json.cartes, erreurs, 'cartes');
  const echauffementLu = lireCartes(json.echauffement, erreurs, 'échauffement');
  // Toutes les empreintes doivent avoir la même dimension, sinon les similarités ne veulent rien dire.
  const dimension = dimensionMajoritaire([
    ...cartesLues.map((x) => x.dim), ...echauffementLu.map((x) => x.dim), ...stylesLus.map((s) => s.emb.length),
  ]);
  const styles = stylesLus.filter((s) => {
    if (s.emb.length === dimension) return true;
    erreurs.push(`style ${s.nom} : empreinte de dimension ${s.emb.length} (attendu ${dimension}), ignoré`);
    return false;
  });
  const dejaVus = new Set();
  return {
    cartes: retenirCartes(cartesLues, erreurs, 'cartes', dejaVus, dimension),
    echauffement: retenirCartes(echauffementLu, erreurs, 'échauffement', dejaVus, dimension),
    styles,
    erreurs,
    source: texte(json.source) ? json.source : null,
    genere_le: texte(json.genere_le) ? json.genere_le : null,
  };
}

// Une pile sert à quelque chose si elle a au moins une carte ou une carte d'échauffement valide.
const utilisable = (r) => r.cartes.length > 0 || r.echauffement.length > 0;

function pileRefusee(message) {
  const r = validerPile(null);
  r.erreurs = [message];
  return r;
}

/**
 * Charge la pile et en garde une copie (JSON brut) sous `sd:pile` pour le hors connexion.
 * `source` : URL de la pile (démo), ou fonction asynchrone qui renvoie le JSON (dépôt privé).
 * - réseau en échec : la sauvegarde est relue ;
 * - pile reçue sans aucune carte valide : elle n'écrase pas la sauvegarde, qui sert si elle existe ;
 * - `sansDemo` (mode dépôt privé) : une pile de démonstration (reçue ou sauvegardée) est refusée.
 */
export async function chargerPile(source = 'data/demo-pile.json', store, { sansDemo = false } = {}) {
  const lireSource = typeof source === 'function' ? source : async () => {
    const reponse = await fetch(source);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    return reponse.json();
  };
  const acceptee = (r) => !(sansDemo && r.source === 'demo');
  const sauvegarde = () => {
    const brute = store?.lire(CLE_PILE, null) ?? null;
    if (!brute) return null;
    const r = validerPile(brute);
    return acceptee(r) && utilisable(r) ? r : null;
  };
  let json;
  try {
    json = await lireSource();
  } catch (e) {
    return sauvegarde() ?? pileRefusee(`pile indisponible (${e.message}) et aucune sauvegarde`);
  }
  const resultat = validerPile(json);
  if (!acceptee(resultat)) {
    return sauvegarde() ?? pileRefusee('pile de démonstration refusée : la pile doit venir du PC');
  }
  if (!utilisable(resultat)) {
    const gardee = sauvegarde();
    if (gardee) {
      gardee.erreurs.push('pile reçue sans carte valide : la pile précédente est gardée', ...resultat.erreurs);
      return gardee;
    }
    return resultat;
  }
  store?.ecrire(CLE_PILE, json);
  return resultat;
}
