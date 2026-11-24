// Lecture et validation de la pile d'annonces (format : docs/format-pile.md).
// Module pur (sans DOM) : utilisable dans le navigateur et dans Node.

import { decoderEmb } from './empreintes.js';
import { CATEGORIES } from './tailles.js';

const CLE_PILE = 'sd:pile';

const texte = (v) => typeof v === 'string' && v.length > 0;

function validerCarte(c) {
  if (!c || typeof c !== 'object') return 'carte absente ou illisible';
  const id = texte(c.id) ? c.id : '?';
  if (!texte(c.id)) return 'carte sans id';
  if (!texte(c.site)) return `carte ${id} : site manquant`;
  if (!texte(c.titre)) return `carte ${id} : titre manquant`;
  if (typeof c.prix !== 'number' || !(c.prix >= 0)) return `carte ${id} : prix invalide`;
  if (!texte(c.categorie) || !(c.categorie in CATEGORIES)) return `carte ${id} : catégorie inconnue`;
  if (!texte(c.photo)) return `carte ${id} : photo manquante`;
  if (!texte(c.url)) return `carte ${id} : url manquante`;
  if (!texte(c.emb)) return `carte ${id} : empreinte manquante`;
  try {
    decoderEmb(c.emb);
  } catch {
    return `carte ${id} : empreinte illisible`;
  }
  return null;
}

function validerCartes(liste, erreurs, etiquette) {
  if (liste === undefined || liste === null) return [];
  if (!Array.isArray(liste)) {
    erreurs.push(`${etiquette} : liste attendue`);
    return [];
  }
  const valides = [];
  for (const c of liste) {
    const erreur = validerCarte(c);
    if (erreur) erreurs.push(`${etiquette} : ${erreur}`);
    else valides.push({ ...c, dispo: c.dispo !== false });
  }
  return valides;
}

export function validerPile(json) {
  const erreurs = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { cartes: [], echauffement: [], styles: [], erreurs: ['pile illisible : objet attendu'] };
  }
  const styles = [];
  if (Array.isArray(json.styles)) {
    for (const s of json.styles) {
      try {
        if (!s || !texte(s.nom)) throw new Error('nom manquant');
        styles.push({ nom: s.nom, emb: decoderEmb(s.emb) });
      } catch {
        erreurs.push(`style ${s?.nom ?? '?'} : empreinte ou nom invalide`);
      }
    }
  }
  return {
    cartes: validerCartes(json.cartes, erreurs, 'cartes'),
    echauffement: validerCartes(json.echauffement, erreurs, 'échauffement'),
    styles,
    erreurs,
  };
}

export async function chargerPile(url = 'data/demo-pile.json', store) {
  let json;
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    json = await reponse.json();
  } catch (e) {
    const sauvegarde = store?.lire(CLE_PILE, null) ?? null;
    if (!sauvegarde) {
      const r = validerPile(null);
      r.erreurs = [`pile indisponible (${e.message}) et aucune sauvegarde`];
      return r;
    }
    return validerPile(sauvegarde);
  }
  const resultat = validerPile(json);
  store?.ecrire(CLE_PILE, json);
  return resultat;
}
